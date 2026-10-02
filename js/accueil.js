/*
 * AlgoDash - page d'accueil.
 *
 * Affiche, pour le compte sélectionné : le sélecteur de compte, les chiffres clés,
 * la courbe d'évolution, les résultats jour / semaine / mois et les dernières
 * positions fermées. Chaque bloc gère ses états : chargement, vide, erreur.
 */
(function () {
  "use strict";

  var D = window.AlgoData;
  var PERIODS = [
    { id: "1J", label: "1J" }, { id: "1S", label: "1S" }, { id: "1M", label: "1M" },
    { id: "3M", label: "3M" }, { id: "1A", label: "1A" }, { id: "ALL", label: "Tout" }
  ];
  var TRADES_SHOWN = 10;
  var ACCENT = "#f33bc3";
  var REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var state = { data: null, accountId: null, period: "ALL", mode: "pct", chart: null };

  var el = {};
  ["account", "badge", "updated", "refresh", "notice", "kpis", "mode", "period",
    "chart", "chart-state", "results", "trades"].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  // ------------------------------------------------------------- utilitaires

  function account() {
    var accounts = state.data.accounts;
    return accounts.filter(function (a) { return String(a.id) === String(state.accountId); })[0] || accounts[0];
  }

  /* Mémorise le compte choisi (confort uniquement : la page marche sans). */
  function remember(id) {
    try { localStorage.setItem("algodash.account", String(id)); } catch (error) { /* stockage indisponible */ }
  }
  function recall() {
    try { return localStorage.getItem("algodash.account"); } catch (error) { return null; }
  }

  function stateHtml(text, withRetry) {
    return "<p>" + D.escapeHtml(text) + "</p>" +
      (withRetry ? '<button class="retry" type="button" data-retry>Réessayer</button>' : "");
  }

  // ---------------------------------------------------- états de chargement

  function showLoading() {
    el.account.innerHTML = '<span class="account-pill skeleton skeleton-pill"></span>';
    el.badge.hidden = true;
    el.updated.textContent = "";
    el.kpis.innerHTML = "";
    el["chart-state"].innerHTML = '<span class="skeleton skeleton-chart"></span>';
    var lines = '<span class="skeleton skeleton-line"></span>';
    el.results.innerHTML = lines + lines + lines;
    el.trades.innerHTML = lines + lines + lines + lines;
  }

  /* Erreur sans aucune donnée à montrer : message clair dans chaque bloc. */
  function showError(error) {
    var block = '<div class="block-state">' + stateHtml(error.message, true) + "</div>";
    el.account.innerHTML = '<span class="account-pill">Compte indisponible</span>';
    el.badge.hidden = true;
    el.updated.textContent = "";
    el.notice.hidden = true;
    el.kpis.innerHTML = "";
    el.mode.innerHTML = "";
    el.period.innerHTML = "";
    el["chart-state"].innerHTML = stateHtml(error.message, true);
    el.results.innerHTML = block;
    el.trades.innerHTML = block;
  }

  // ----------------------------------------------------- sélecteur de compte

  function renderAccount() {
    var accounts = state.data.accounts;
    var current = account();

    if (accounts.length < 2) {
      // Un seul compte : simple libellé, sans flèche ni menu.
      el.account.innerHTML = '<span class="account-pill">' + D.escapeHtml(current.label) + "</span>";
    } else {
      var options = accounts.map(function (a) {
        var selected = String(a.id) === String(current.id);
        return '<li role="presentation"><button class="account-option" type="button" role="option" ' +
          'aria-selected="' + selected + '" data-account="' + D.escapeHtml(a.id) + '">' +
          D.escapeHtml(a.label) + "</button></li>";
      }).join("");
      el.account.innerHTML =
        '<button class="account-pill" type="button" id="account-button" aria-haspopup="listbox" aria-expanded="false">' +
        D.escapeHtml(current.label) + '<span class="chevron" aria-hidden="true"></span></button>' +
        '<ul class="account-menu" role="listbox" aria-label="Choisir un compte" hidden>' + options + "</ul>";
    }

    el.badge.hidden = false;
    el.badge.textContent = current.demo ? "Démo" : "Réel";
    el.badge.classList.toggle("is-real", !current.demo);
  }

  function toggleAccountMenu(open) {
    var button = document.getElementById("account-button");
    var menu = el.account.querySelector(".account-menu");
    if (!button || !menu) return;
    var willOpen = open === undefined ? menu.hidden : open;
    menu.hidden = !willOpen;
    button.setAttribute("aria-expanded", String(willOpen));
  }

  // ------------------------------------------- mise à jour et bandeau d'info

  function renderStatus() {
    var data = state.data;
    var status = data.status || {};
    var last = status.lastSuccessAt || data.generatedAt;
    var current = account();

    el.updated.textContent = last ? "Mis à jour " + D.ago(last) : "";
    el.updated.title = current.myfxbookUpdate ? "Dernière synchronisation Myfxbook : " + current.myfxbookUpdate : "";

    var text = "";
    var isError = false;
    if (data.sample) {
      text = "Données d’exemple : le dashboard n’est pas encore relié à Myfxbook.";
    } else if (status.ok === false) {
      isError = true;
      text = D.message(status.code) + (last ? " Affichage des données du " + D.dateTime(last).replace(" ", " à ") + "." : "");
    } else if (last && Date.now() - new Date(last).getTime() > D.STALE_MS) {
      text = "Les données n’ont pas été rafraîchies depuis le " + D.dateTime(last).replace(" ", " à ") + ".";
    }
    el.notice.hidden = !text;
    el.notice.textContent = text;
    el.notice.classList.toggle("is-error", isError);
  }

  // ------------------------------------------------------------ chiffres clés

  function renderKpis() {
    var current = account();
    var stats = current.stats;
    var items = [
      { label: "Gain total", value: D.percent(stats.gain), tone: D.tone(stats.gain) },
      { label: "Solde", value: D.money(stats.balance, current.currency) },
      { label: "Équité", value: D.money(stats.equity, current.currency) },
      { label: "Drawdown", value: D.percent(stats.drawdown, false) }
    ];
    el.kpis.innerHTML = items.map(function (item) {
      return '<div class="kpi"><dt>' + item.label + '</dt><dd class="' + (item.tone || "") + '">' +
        D.escapeHtml(item.value) + "</dd></div>";
    }).join("");
  }

  // ------------------------------------------------------------------ courbe

  function renderControls() {
    var currency = D.money(0, account().currency).replace(/[\d\s,.  ]/g, "") || "$";
    var modes = [{ id: "pct", label: "%" }, { id: "money", label: currency }];
    el.mode.innerHTML = modes.map(function (m) {
      return '<button type="button" data-mode="' + m.id + '" aria-pressed="' + (state.mode === m.id) + '">' +
        D.escapeHtml(m.label) + "</button>";
    }).join("");
    el.period.innerHTML = PERIODS.map(function (p) {
      return '<button type="button" data-period="' + p.id + '" aria-pressed="' + (state.period === p.id) + '">' +
        p.label + "</button>";
    }).join("");
  }

  /* Premier jour (AAAA-MM-JJ) de la période choisie, ou null pour « Tout ». */
  function cutoffDay(period) {
    var parts = D.zurichDay(new Date()).split("-").map(Number);
    var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    if (period === "1S") date.setUTCDate(date.getUTCDate() - 7);
    else if (period === "1M") date.setUTCMonth(date.getUTCMonth() - 1);
    else if (period === "3M") date.setUTCMonth(date.getUTCMonth() - 3);
    else if (period === "1A") date.setUTCFullYear(date.getUTCFullYear() - 1);
    else return null;
    return date.toISOString().slice(0, 10);
  }

  /*
   * Construit les points de la courbe.
   * - 1J : un point par position fermée aujourd'hui (Myfxbook ne donne qu'un point par jour).
   * - autres périodes : un point par jour, recalé pour partir de 0 au début de la période.
   * Renvoie { points: [{ label, value, extra }], extraLabel } ou { empty: "message" }.
   */
  function buildSeries(current) {
    var pct = state.mode === "pct";
    var points = [];
    var cumulative = 0;

    if (state.period === "1J") {
      var today = D.zurichDay(new Date());
      var trades = current.trades.filter(function (t) {
        return D.zurichDay(new Date(t.closeTime)) === today;
      }).sort(function (a, b) { return a.closeTime < b.closeTime ? -1 : 1; });
      if (!trades.length) return { empty: "Aucune position fermée aujourd’hui." };

      var dayProfit = trades.reduce(function (sum, t) { return sum + t.profit; }, 0);
      var startBalance = current.stats.balance - dayProfit;
      points.push({ label: "00:00", value: 0, extra: null });
      trades.forEach(function (t) {
        cumulative += t.profit;
        points.push({
          label: D.time(t.closeTime),
          value: pct ? (startBalance ? cumulative / startBalance * 100 : 0) : cumulative,
          extra: t.profit
        });
      });
      return { points: points, extraLabel: "Profit de la position" };
    }

    var daily = current.daily || [];
    if (!daily.length) return { empty: "Myfxbook n’a pas encore synchronisé de données pour ce compte." };

    var cutoff = cutoffDay(state.period);
    var inside = cutoff ? daily.filter(function (d) { return d.date >= cutoff; }) : daily;
    var before = cutoff ? daily.filter(function (d) { return d.date < cutoff; }) : [];
    if (!inside.length) return { empty: "Aucun résultat sur cette période." };

    var withYear = state.period === "1A" || state.period === "ALL";
    var base = before.length ? before[before.length - 1].gain : 0;
    points.push({
      label: before.length ? D.day(before[before.length - 1].date, withYear) : "Départ",
      value: 0, extra: null
    });
    inside.forEach(function (d) {
      cumulative += d.profit;
      points.push({
        label: D.day(d.date, withYear),
        value: pct ? ((1 + d.gain / 100) / (1 + base / 100) - 1) * 100 : cumulative,
        extra: d.profit
      });
    });
    return { points: points, extraLabel: "Profit du jour" };
  }

  /* Trait vertical sous le curseur, pour lire la date d'un point. */
  var crosshair = {
    id: "crosshair",
    afterDatasetsDraw: function (chart) {
      var active = chart.tooltip && chart.tooltip.getActiveElements();
      if (!active || !active.length) return;
      var ctx = chart.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(active[0].element.x, chart.chartArea.top);
      ctx.lineTo(active[0].element.x, chart.chartArea.bottom);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.stroke();
      ctx.restore();
    }
  };

  function createChart() {
    Chart.defaults.font.family = "Arial, Helvetica, sans-serif";
    Chart.defaults.color = "#9a9aa1";

    return new Chart(el.chart, {
      type: "line",
      data: {
        labels: [],
        datasets: [{
          data: [],
          borderColor: ACCENT,
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: ACCENT,
          pointHoverBorderColor: "#1e1e1e",
          pointHoverBorderWidth: 2,
          fill: "origin",
          // Dégradé rose sous la courbe, recalculé selon la hauteur du graphique.
          backgroundColor: function (context) {
            var area = context.chart.chartArea;
            if (!area) return "transparent";
            var gradient = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
            gradient.addColorStop(0, "rgba(243, 59, 195, 0.30)");
            gradient.addColorStop(1, "rgba(243, 59, 195, 0)");
            return gradient;
          }
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: REDUCED_MOTION ? false : { duration: 700, easing: "easeOutQuart" },
        interaction: { mode: "index", intersect: false },
        scales: {
          x: {
            grid: { display: false },
            border: { color: "rgba(255, 255, 255, 0.12)" },
            ticks: { maxTicksLimit: 7, maxRotation: 0, autoSkipPadding: 24 }
          },
          y: {
            border: { display: false },
            grid: {
              // La ligne du zéro ressort un peu plus que les autres.
              color: function (context) {
                return context.tick && context.tick.value === 0 ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.06)";
              }
            },
            ticks: {
              maxTicksLimit: 6,
              callback: function (value) {
                return state.mode === "pct"
                  ? D.number(value, Math.abs(value) < 10 && value % 1 !== 0 ? 1 : 0) + " %"
                  : D.money(value, account().currency).replace(/,00/, "");
              }
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#121214",
            borderColor: "rgba(255, 255, 255, 0.12)",
            borderWidth: 1,
            padding: 12,
            cornerRadius: 12,
            displayColors: false,
            titleColor: "#9a9aa1",
            titleFont: { weight: "normal", size: 12 },
            bodyColor: "#ffffff",
            bodyFont: { size: 13 },
            callbacks: {
              label: function (context) {
                var point = context.dataset.points[context.dataIndex];
                var currency = account().currency;
                var lines = [state.mode === "pct"
                  ? "Gain cumulé : " + D.percent(point.value)
                  : "Profit cumulé : " + D.money(point.value, currency, true)];
                if (point.extra !== null) {
                  lines.push(context.dataset.extraLabel + " : " + D.money(point.extra, currency, true));
                }
                return lines;
              }
            }
          }
        }
      },
      plugins: [crosshair]
    });
  }

  function renderChart() {
    var series = buildSeries(account());
    if (series.empty) {
      el["chart-state"].innerHTML = stateHtml(series.empty, false);
      return;
    }
    el["chart-state"].innerHTML = "";
    if (!state.chart) state.chart = createChart();

    var dataset = state.chart.data.datasets[0];
    state.chart.data.labels = series.points.map(function (p) { return p.label; });
    dataset.data = series.points.map(function (p) { return p.value; });
    dataset.points = series.points;          // utilisé par l'infobulle
    dataset.extraLabel = series.extraLabel;
    dataset.tension = state.period === "1J" ? 0 : 0.25;   // peu de points sur 1J : segments droits
    state.chart.update();
  }

  // -------------------------------------------------- résultats par période

  function renderResults() {
    var results = account().results || {};
    var rows = [
      { label: "Résultats journaliers", value: results.day },
      { label: "Résultats hebdomadaires", value: results.week },
      { label: "Résultats mensuels", value: results.month }
    ];
    el.results.innerHTML = rows.map(function (row) {
      return '<div class="result"><span>' + row.label + '</span><span class="result-value ' +
        D.tone(row.value) + '">' + D.percent(row.value) + "</span></div>";
    }).join("");
  }

  // ---------------------------------------------------- dernières positions

  function renderTrades() {
    var current = account();
    var trades = (current.trades || []).slice(0, TRADES_SHOWN);   // déjà triées, la plus récente d'abord
    if (!trades.length) {
      el.trades.innerHTML = '<div class="block-state">' + stateHtml("Aucune position fermée pour l’instant.", false) + "</div>";
      return;
    }
    var rows = trades.map(function (t) {
      return "<tr>" +
        "<td>" + D.dateTime(t.closeTime) + "</td>" +
        "<td>" + (t.action === "Buy" ? "Achat" : "Vente") + "</td>" +
        '<td class="num">' + (t.lots == null ? "–" : D.number(t.lots, 2)) + "</td>" +
        '<td class="num col-price">' + (t.openPrice == null ? "–" : D.number(t.openPrice, 2)) + "</td>" +
        '<td class="num col-price">' + (t.closePrice == null ? "–" : D.number(t.closePrice, 2)) + "</td>" +
        '<td class="num ' + D.tone(t.profit) + '">' + D.money(t.profit, current.currency, true) + "</td>" +
        "</tr>";
    }).join("");
    el.trades.innerHTML =
      '<div class="trades-scroll" tabindex="0" role="region" aria-label="Dernières positions fermées">' +
      '<table class="trades"><thead><tr>' +
      '<th scope="col">Clôture</th><th scope="col">Sens</th><th scope="col" class="num">Lots</th>' +
      '<th scope="col" class="num col-price">Entrée</th><th scope="col" class="num col-price">Sortie</th>' +
      '<th scope="col" class="num">Profit</th>' +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>";
  }

  // --------------------------------------------------------------- pilotage

  function renderAll() {
    renderAccount();
    renderStatus();
    renderKpis();
    renderControls();
    renderChart();
    renderResults();
    renderTrades();
  }

  function refresh(showSkeleton) {
    if (showSkeleton) showLoading();
    return D.load().then(function (data) {
      state.data = data;
      if (state.accountId === null) state.accountId = recall();
      state.accountId = account().id;
      renderAll();
    }).catch(function (error) {
      // Si des données sont déjà affichées, on les garde plutôt que de tout effacer.
      if (state.data) {
        el.notice.hidden = false;
        el.notice.classList.add("is-error");
        el.notice.textContent = (error.message || D.message("NETWORK")) + " Les dernières données connues restent affichées.";
      } else {
        showError(error.code ? error : { message: D.message("NETWORK") });
      }
    });
  }

  // Un seul écouteur pour tous les clics de la page.
  document.addEventListener("click", function (event) {
    var target = event.target.closest("button");
    var insideAccount = event.target.closest("#account");
    if (!insideAccount) toggleAccountMenu(false);
    if (!target) return;

    if (target.id === "account-button") {
      toggleAccountMenu();
    } else if (target.dataset.account) {
      state.accountId = target.dataset.account;
      remember(state.accountId);
      renderAll();
    } else if (target.dataset.mode) {
      state.mode = target.dataset.mode;
      renderControls();
      renderChart();
    } else if (target.dataset.period) {
      state.period = target.dataset.period;
      renderControls();
      renderChart();
    } else if (target.id === "refresh" || target.hasAttribute("data-retry")) {
      state.data = null;
      refresh(true);
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") toggleAccountMenu(false);
  });

  refresh(true);
  setInterval(function () { refresh(false); }, D.REFRESH_MS);            // nouvelles données toutes les 15 min
  setInterval(function () { if (state.data) renderStatus(); }, 60000);   // « il y a X min »
})();
