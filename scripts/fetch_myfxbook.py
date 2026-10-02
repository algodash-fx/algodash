#!/usr/bin/env python3
"""
AlgoDash - récupération des données Myfxbook.

Ce script est lancé toutes les 15 min par GitHub Actions (et à la main sur ton PC
pour tester). Il se connecte à Myfxbook, récupère les données de chaque compte,
se déconnecte, puis écrit data/dashboard.json, le seul fichier lu par le dashboard.

Les identifiants viennent des variables d'environnement (secrets GitHub) ou d'un
fichier .env local. Ils ne sont jamais écrits dans le fichier de données ni dans
les journaux.

Utilisation :
    python scripts/fetch_myfxbook.py            # données réelles
    python scripts/fetch_myfxbook.py --sample   # données d'exemple (sans Myfxbook)

Aucune dépendance : uniquement la bibliothèque standard de Python.
"""

import argparse
import json
import os
import random
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

API_BASE = "https://www.myfxbook.com/api/"
ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "data" / "dashboard.json"
TIMEOUT_S = 30
MAX_TRADES = 1000         # positions fermées conservées par compte
ACCOUNT_PREFIX = "MT5"    # libellé affiché devant le numéro de compte


class MyfxbookError(Exception):
    """Erreur classée par code, pour que le dashboard affiche un message adapté."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code        # AUTH | SESSION | RATE_LIMIT | BLOCKED | UNAVAILABLE | CONFIG
        self.message = message


# ---------------------------------------------------------------- configuration

def load_env_file(path):
    """Charge un fichier .env (CLE=valeur) sans écraser l'environnement existant."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def broker_tzinfo(setting):
    """Fuseau du broker : décalage en heures ("3", "+2", "-5") ou nom IANA ("Europe/Athens")."""
    setting = (setting or "0").strip()
    if re.fullmatch(r"[+-]?\d+(\.\d+)?", setting):
        return timezone(timedelta(hours=float(setting)))
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo(setting)
    except Exception:
        raise MyfxbookError(
            "CONFIG",
            f"BROKER_TIMEZONE invalide : « {setting} ». Utilise un décalage en heures (ex. 3) "
            "ou un nom de fuseau (ex. Europe/Athens ; sous Windows : pip install tzdata).",
        )


# ------------------------------------------------------------------ appels API

def classify(message):
    """Déduit un code d'erreur à partir du message renvoyé par Myfxbook."""
    low = (message or "").lower()
    if "session" in low:
        return "SESSION"
    if "limit" in low or "too many" in low or "exceed" in low:
        return "RATE_LIMIT"
    if "password" in low or "login" in low or "email" in low or "credential" in low:
        return "AUTH"
    return "UNAVAILABLE"


def api(endpoint, params=None, session=None):
    """Appelle un endpoint Myfxbook et renvoie le JSON. Lève MyfxbookError sinon."""
    query = urllib.parse.urlencode(params or {})
    if session:
        # L'identifiant de session est déjà encodé par Myfxbook : on l'ajoute tel quel.
        query = f"session={session}" + (f"&{query}" if query else "")
    request = urllib.request.Request(
        f"{API_BASE}{endpoint}?{query}",
        headers={"User-Agent": "AlgoDash/1.0 (dashboard personnel)", "Accept": "application/json"},
    )
    # Les messages d'erreur ne contiennent jamais l'URL : elle porte les identifiants.
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as err:
        if err.code == 429:
            raise MyfxbookError("RATE_LIMIT", "Myfxbook limite les requêtes (HTTP 429).")
        if err.code in (401, 403):
            raise MyfxbookError("BLOCKED", f"Myfxbook a refusé la connexion du serveur (HTTP {err.code}).")
        raise MyfxbookError("UNAVAILABLE", f"Myfxbook a répondu avec une erreur HTTP {err.code}.")
    except (urllib.error.URLError, TimeoutError, OSError) as err:
        reason = getattr(err, "reason", err)
        raise MyfxbookError("UNAVAILABLE", f"Myfxbook est injoignable ({type(reason).__name__}).")

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        raise MyfxbookError("BLOCKED", "Myfxbook a renvoyé une page au lieu de données (accès probablement bloqué).")

    if payload.get("error"):
        message = str(payload.get("message") or "Erreur inconnue")
        raise MyfxbookError(classify(message), f"Myfxbook : {message}")
    return payload


# ------------------------------------------------------------ mise en forme

def num(value, default=None):
    """Convertit en nombre (Myfxbook renvoie parfois des chaînes)."""
    try:
        return float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return default


def flatten(items):
    """Myfxbook renvoie parfois des listes de listes : on aplatit."""
    out = []
    for item in items or []:
        if isinstance(item, list):
            out.extend(flatten(item))
        elif isinstance(item, dict):
            out.append(item)
    return out


def parse_dt(text):
    """« 03/01/2010 14:13 » ou « 03/01/2010 » (mois/jour/année) -> datetime naïf."""
    for fmt in ("%m/%d/%Y %H:%M", "%m/%d/%Y %H:%M:%S", "%m/%d/%Y"):
        try:
            return datetime.strptime((text or "").strip(), fmt)
        except ValueError:
            continue
    return None


def to_utc_iso(text, tz):
    """Heure du broker -> ISO 8601 en UTC (le dashboard l'affiche en heure suisse)."""
    dt = parse_dt(text)
    if dt is None:
        return None
    return dt.replace(tzinfo=tz).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def period_gain(daily, start):
    """Gain % entre `start` (inclus) et la fin, calculé depuis la série cumulée."""
    before = [d for d in daily if d["date"] < start.isoformat()]
    inside = [d for d in daily if d["date"] >= start.isoformat()]
    if not inside:
        return 0.0
    base = before[-1]["gain"] if before else 0.0
    return round(((1 + inside[-1]["gain"] / 100) / (1 + base / 100) - 1) * 100, 2)


def fetch_account(raw, session, tz):
    """Récupère et met en forme toutes les données d'un compte."""
    account_id = raw["id"]
    today = datetime.now(tz).date()
    first = parse_dt(raw.get("firstTradeDate")) or parse_dt(raw.get("creationDate"))
    start = (first.date() if first else date(2015, 1, 1)).isoformat()
    span = {"id": account_id, "start": start, "end": today.isoformat()}

    # Série quotidienne : gain % cumulé + profit du jour.
    daily = []
    for row in flatten(api("get-daily-gain.json", span, session).get("dailyGain")):
        day = parse_dt(row.get("date"))
        if day is None:
            continue
        daily.append({"date": day.date().isoformat(),
                      "gain": num(row.get("value"), 0.0),
                      "profit": num(row.get("profit"), 0.0)})
    daily.sort(key=lambda d: d["date"])

    # Positions fermées (on écarte dépôts, retraits et ordres annulés).
    trades = []
    for row in flatten(api("get-history.json", {"id": account_id}, session).get("history")):
        action = str(row.get("action") or "")
        close_time = to_utc_iso(row.get("closeTime"), tz)
        if action.lower() not in ("buy", "sell") or close_time is None:
            continue
        trades.append({
            "openTime": to_utc_iso(row.get("openTime"), tz),
            "closeTime": close_time,
            # Jour de clôture à l'heure du broker : le même découpage que la série quotidienne.
            "day": parse_dt(row.get("closeTime")).date().isoformat(),
            "symbol": row.get("symbol"),
            "action": action.capitalize(),
            "lots": num((row.get("sizing") or {}).get("value")),
            "openPrice": num(row.get("openPrice")),
            "closePrice": num(row.get("closePrice")),
            "profit": num(row.get("profit"), 0.0),
        })
    trades.sort(key=lambda t: t["closeTime"], reverse=True)

    # Résultats jour / semaine (depuis lundi) / mois (depuis le 1er), demandés à Myfxbook.
    # Si Myfxbook ne répond pas pour une période, on la recalcule depuis la série quotidienne.
    periods = {
        "day": today,
        "week": today - timedelta(days=today.weekday()),
        "month": today.replace(day=1),
    }
    results = {}
    for key, period_start in periods.items():
        try:
            value = api("get-gain.json", {"id": account_id, "start": period_start.isoformat(),
                                          "end": today.isoformat()}, session).get("value")
            results[key] = round(num(value, 0.0), 2)
        except MyfxbookError as err:
            if err.code in ("SESSION", "RATE_LIMIT", "BLOCKED"):
                raise
            results[key] = period_gain(daily, period_start)

    return {
        "id": account_id,
        "label": f"{ACCOUNT_PREFIX} {raw.get('accountId')}",
        "name": raw.get("name"),
        "demo": bool(raw.get("demo")),
        "currency": raw.get("currency") or "USD",
        "myfxbookUpdate": raw.get("lastUpdateDate"),   # texte brut, fuseau Myfxbook
        "stats": {
            "gain": num(raw.get("gain"), 0.0),
            "balance": num(raw.get("balance"), 0.0),
            "equity": num(raw.get("equity"), 0.0),
            "drawdown": num(raw.get("drawdown"), 0.0),
            "profit": num(raw.get("profit"), 0.0),
        },
        "results": results,
        "daily": daily,
        "trades": trades[:MAX_TRADES],
    }


def fetch_all(email, password, tz):
    """Connexion, récupération de tous les comptes, déconnexion."""
    session = api("login.json", {"email": email, "password": password}).get("session")
    if not session:
        raise MyfxbookError("AUTH", "Myfxbook n'a pas ouvert de session.")
    try:
        raw_accounts = api("get-my-accounts.json", session=session).get("accounts") or []
        return [fetch_account(raw, session, tz) for raw in raw_accounts]
    finally:
        try:
            api("logout.json", session=session)
        except MyfxbookError:
            pass  # une déconnexion ratée ne doit pas masquer le vrai résultat


# ----------------------------------------------------------- données d'exemple

def sample_accounts():
    """Fabrique deux comptes fictifs pour tester le dashboard sans Myfxbook."""
    rng = random.Random(7)
    now = datetime.now(timezone.utc)
    accounts = []
    for index, (number, balance0) in enumerate((("483982832", 10000.0), ("483982900", 5000.0))):
        daily, trades, balance, gain = [], [], balance0, 0.0
        day = now.date() - timedelta(days=150 - index * 60)
        while day <= now.date():
            if day.weekday() < 5:
                profit_day = 0.0
                for _ in range(rng.randint(1, 4)):
                    close = datetime(day.year, day.month, day.day, rng.randint(7, 19), rng.randint(0, 59),
                                     tzinfo=timezone.utc)
                    if close > now:
                        continue
                    buy = rng.random() < 0.5
                    price = round(2600 + rng.uniform(-120, 120), 2)
                    move = round(rng.gauss(0.6, 4.5), 2)
                    lots = rng.choice((0.05, 0.1, 0.1, 0.2))
                    profit = round(move * lots * 100, 2)
                    trades.append({
                        "openTime": (close - timedelta(minutes=rng.randint(4, 180))).strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "closeTime": close.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "day": day.isoformat(),
                        "symbol": "XAUUSD", "action": "Buy" if buy else "Sell", "lots": lots,
                        "openPrice": price,
                        "closePrice": round(price + (move if buy else -move), 2),
                        "profit": profit,
                    })
                    profit_day += profit
                gain = ((1 + gain / 100) * (1 + profit_day / balance) - 1) * 100
                balance += profit_day
                daily.append({"date": day.isoformat(), "gain": round(gain, 2), "profit": round(profit_day, 2)})
            day += timedelta(days=1)
        trades.sort(key=lambda t: t["closeTime"], reverse=True)
        today = now.date()
        peak = max(d["gain"] for d in daily)
        accounts.append({
            "id": 1000 + index, "label": f"{ACCOUNT_PREFIX} {number}", "name": f"Exemple {index + 1}",
            "demo": True, "currency": "USD", "myfxbookUpdate": now.strftime("%m/%d/%Y %H:%M"),
            "stats": {"gain": round(gain, 2), "balance": round(balance, 2), "equity": round(balance, 2),
                      "drawdown": round(max(0.0, peak - min(d["gain"] for d in daily[-40:])), 2),
                      "profit": round(balance - balance0, 2)},
            "results": {"day": period_gain(daily, today),
                        "week": period_gain(daily, today - timedelta(days=today.weekday())),
                        "month": period_gain(daily, today.replace(day=1))},
            "daily": daily, "trades": trades[:MAX_TRADES],
        })
    return accounts


# -------------------------------------------------------------------- écriture

def load_previous(out_path):
    """Dernières données réelles connues : site publié (PREVIOUS_DATA_URL) ou fichier local."""
    candidates = []
    url = os.environ.get("PREVIOUS_DATA_URL", "").strip()
    if url.startswith("https://"):
        try:
            with urllib.request.urlopen(url, timeout=TIMEOUT_S) as response:
                candidates.append(json.loads(response.read().decode("utf-8")))
        except Exception:
            pass
    if out_path.exists():
        try:
            candidates.append(json.loads(out_path.read_text(encoding="utf-8")))
        except Exception:
            pass
    for data in candidates:
        if isinstance(data, dict) and not data.get("sample") and data.get("accounts"):
            return data
    return None


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main():
    parser = argparse.ArgumentParser(description="Récupère les données Myfxbook pour AlgoDash.")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="fichier JSON à écrire")
    parser.add_argument("--sample", action="store_true", help="génère des données d'exemple")
    args = parser.parse_args()
    args.out.parent.mkdir(parents=True, exist_ok=True)

    if args.sample:
        data = {"generatedAt": now_iso(), "sample": True,
                "status": {"ok": True, "code": None, "message": None, "lastSuccessAt": now_iso()},
                "accounts": sample_accounts()}
        args.out.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        print(f"Données d'exemple écrites dans {args.out}")
        return 0

    load_env_file(ROOT / ".env")
    try:
        email = os.environ.get("MYFXBOOK_EMAIL", "").strip()
        password = os.environ.get("MYFXBOOK_PASSWORD", "")
        if not email or not password:
            raise MyfxbookError("CONFIG", "Identifiants Myfxbook absents (MYFXBOOK_EMAIL / MYFXBOOK_PASSWORD).")
        tz = broker_tzinfo(os.environ.get("BROKER_TIMEZONE"))
        try:
            accounts = fetch_all(email, password, tz)
        except MyfxbookError as err:
            if err.code != "SESSION":
                raise
            accounts = fetch_all(email, password, tz)   # session refusée : une seule reconnexion
        data = {"generatedAt": now_iso(), "sample": False,
                "status": {"ok": True, "code": None, "message": None, "lastSuccessAt": now_iso()},
                "accounts": accounts}
        print(f"OK : {len(accounts)} compte(s) récupéré(s).")
    except MyfxbookError as err:
        # En cas d'échec, on garde les dernières données connues et on signale l'erreur.
        previous = load_previous(args.out)
        data = {"generatedAt": now_iso(), "sample": False,
                "status": {"ok": False, "code": err.code, "message": err.message,
                           "lastSuccessAt": (previous or {}).get("status", {}).get("lastSuccessAt")},
                "accounts": (previous or {}).get("accounts", [])}
        print(f"::warning::Échec Myfxbook [{err.code}] {err.message}")

    args.out.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
