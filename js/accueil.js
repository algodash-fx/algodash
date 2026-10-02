/*
 * AlgoDash - page d'accueil.
 *
 * Affiche, pour le compte sélectionné : les chiffres clés, la courbe d'évolution,
 * les résultats jour / semaine / mois et les dernières positions fermées.
 * L'en-tête (sélecteur de compte, mise à jour) et le chargement sont dans js/app.js.
 * Chaque bloc gère ses états : chargement, vide, erreur.
 */
(function () {
  "use strict";

  var D = window.AlgoData;
  var App = window.AlgoApp;
  var PERIODS = [
    { id: "1J", label: "1J" }, { id: "1S", label: "1S" }, { id: "1M", label: "1M" },
    { id: "3M", label: "3M" }, { id: "1A", label: "1A" }, { id: "ALL", label: "Tout" }
  ];
  var TRADES_SHOWN = 10;
  var ACCENT = "#f33bc3";
  var REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var state = { period: "ALL", mode: "pct", chart: null };

  var el = {};
  ["kpis", "mode", "period", "chart", "chart-state", "results", "trades"].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  // ---------------------------------------------------- états de chargement

  function showLoading() {
    el.kpis.innerHTML = "";
    el["chart-state"].innerHTML = '<span class="skeleton skeleton-chart"></span>';
    var lines = '<span class="skeleton skeleton-line"></span>';
    el.results.innerHTML = lines + lines + lines;
    el.trades.innerHTML = lines + lines + lines + lines;
  }

  /* Erreur sans aucune donnée à montrer : message clair dans chaque bloc. */
  function showError(error) {
    var block = '<div class="block-state">' + App.stateHtml(error.message, true) + "</div>";
    el.kpis.innerHTML = "";
    el.mode.innerHTML = "";
    el.period.innerHTML = "";
    el["chart-state"].innerHTML = App.stateHtml(error.message, true);
    el.results.innerHTML = block;
    el.trades.innerHTML = block;
  }

  // ------------------------------------------------------------ chiffres clés

  function renderKpis() {
    var current = App.account();
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
    el.mode.innerHTML = App.modeButtons(state.mode, App.account().currency);
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
                  : D.money(value, App.account().currency).replace(/,00/, "");
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
                var currency = App.account().currency;
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
    var series = buildSeries(App.account());
    if (series.empty) {
      el["chart-state"].innerHTML = App.stateHtml(series.empty, false);
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
    var results = App.account().results || {};
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
    var current = App.account();
    var trades = (current.trades || []).slice(0, TRADES_SHOWN);   // déjà triées, la plus récente d'abord
    if (!trades.length) {
      el.trades.innerHTML = '<div class="block-state">' + App.stateHtml("Aucune position fermée pour l’instant.", false) + "</div>";
      return;
    }
    el.trades.innerHTML = App.tradesTable(trades, current.currency, true);
  }

  // --------------------------------------------------------------- pilotage

  function render() {
    renderKpis();
    renderControls();
    renderChart();
    renderResults();
    renderTrades();
  }

  // Boutons d'unité (% / devise) et de période de la courbe.
  document.addEventListener("click", function (event) {
    var target = event.target.closest("button");
    if (!target) return;
    if (target.dataset.mode) state.mode = target.dataset.mode;
    else if (target.dataset.period) state.period = target.dataset.period;
    else return;
    renderControls();
    renderChart();
  });

  App.start({ onLoading: showLoading, onRender: render, onError: showError });
})();
