/*
 * AlgoDash - accès aux données et mise en forme.
 *
 * Le dashboard ne parle jamais à Myfxbook : il lit data/dashboard.json, un fichier
 * régénéré toutes les 15 min par scripts/fetch_myfxbook.py (GitHub Actions).
 * Aucun identifiant n'existe donc côté navigateur.
 */
window.AlgoData = (function () {
  "use strict";

  var DATA_URL = "data/dashboard.json";
  var TIME_ZONE = "Europe/Zurich";          // toutes les dates sont affichées en heure suisse
  var REFRESH_MS = 15 * 60 * 1000;          // même rythme que la tâche planifiée
  var STALE_MS = 60 * 60 * 1000;            // au-delà, on signale que les données sont anciennes

  // Message affiché pour chaque code d'erreur écrit par le script (status.code).
  var MESSAGES = {
    AUTH: "Connexion à Myfxbook refusée. Vérifie l’e-mail et le mot de passe enregistrés dans les secrets GitHub.",
    SESSION: "La session Myfxbook a expiré. Une nouvelle connexion sera tentée au prochain rafraîchissement.",
    RATE_LIMIT: "Myfxbook limite temporairement les requêtes. Nouvel essai automatique dans 15 min.",
    BLOCKED: "Myfxbook refuse la connexion du serveur. Les données ne peuvent pas être récupérées pour l’instant.",
    UNAVAILABLE: "Myfxbook est indisponible pour le moment. Nouvel essai automatique dans 15 min.",
    CONFIG: "Configuration incomplète : les identifiants Myfxbook ne sont pas renseignés.",
    NETWORK: "Impossible de charger les données du dashboard. Vérifie ta connexion.",
    NO_DATA: "Aucune donnée n’a encore été récupérée depuis Myfxbook."
  };

  function message(code) {
    return MESSAGES[code] || MESSAGES.UNAVAILABLE;
  }

  /* Charge le fichier de données. Rejette avec { code, message } si rien n'est affichable. */
  function load() {
    // Le paramètre ?t= contourne le cache du navigateur et de GitHub Pages.
    return fetch(DATA_URL + "?t=" + Date.now(), { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .catch(function () {
        throw { code: "NETWORK", message: message("NETWORK") };
      })
      .then(function (data) {
        var accounts = (data && data.accounts) || [];
        var status = (data && data.status) || {};
        if (!accounts.length) {
          var code = status.ok === false ? status.code : "NO_DATA";
          throw { code: code, message: message(code) };
        }
        return data;
      });
  }

  // --- Mise en forme (format français, heure suisse) -------------------------
  var NBSP = " ";

  function number(value, digits) {
    return Number(value).toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function sign(value) {
    return value > 0 ? "+" : value < 0 ? "-" : "";
  }

  /* +1,24 %  /  -2,24 %  /  0 % */
  function percent(value, withSign) {
    var rounded = Math.round((Number(value) || 0) * 100) / 100;
    if (rounded === 0) return "0" + NBSP + "%";
    return (withSign === false ? (rounded < 0 ? "-" : "") : sign(rounded)) + number(Math.abs(rounded), 2) + NBSP + "%";
  }

  /* 1 234,50 $ dans la devise du compte */
  function money(value, currency, withSign) {
    var amount = Number(value) || 0;
    var text;
    try {
      text = Math.abs(amount).toLocaleString("fr-FR", {
        style: "currency", currency: currency || "USD", currencyDisplay: "narrowSymbol"
      });
    } catch (error) {
      text = number(Math.abs(amount), 2) + NBSP + (currency || "");
    }
    return (withSign ? sign(amount) : amount < 0 ? "-" : "") + text;
  }

  /* Classe CSS selon le signe : vert, rouge ou gris. */
  function tone(value) {
    var rounded = Math.round((Number(value) || 0) * 100) / 100;
    return rounded > 0 ? "is-positive" : rounded < 0 ? "is-negative" : "is-neutral";
  }

  /* Jour (AAAA-MM-JJ) en heure suisse d'un instant donné. */
  function zurichDay(date) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);
  }

  function dateTime(iso) {
    return new Intl.DateTimeFormat("fr-CH", {
      timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
    }).format(new Date(iso)).replace(",", "");
  }

  function time(iso) {
    return new Intl.DateTimeFormat("fr-CH", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" })
      .format(new Date(iso));
  }

  /* « 2026-10-01 » -> « 01.10.2026 » (date du jour de trading, sans conversion). */
  function day(isoDay, withYear) {
    var parts = isoDay.split("-");
    return parts[2] + "." + parts[1] + (withYear === false ? "" : "." + parts[0]);
  }

  /* « il y a 4 min », « il y a 2 h » */
  function ago(iso) {
    var minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (minutes < 1) return "à l’instant";
    if (minutes < 60) return "il y a " + minutes + " min";
    var hours = Math.round(minutes / 60);
    if (hours < 48) return "il y a " + hours + " h";
    return "il y a " + Math.round(hours / 24) + " j";
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  return {
    REFRESH_MS: REFRESH_MS, STALE_MS: STALE_MS,
    load: load, message: message,
    number: number, percent: percent, money: money, tone: tone,
    zurichDay: zurichDay, dateTime: dateTime, time: time, day: day, ago: ago,
    escapeHtml: escapeHtml
  };
})();
