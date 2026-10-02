/*
 * AlgoDash - page Calendrier.
 *
 * Affiche un mois sous forme de grille : chaque jour montre son résultat
 * (vert en gain, rouge en perte), le nombre de trades et le taux de réussite.
 * À droite, un résumé par semaine ; en haut, le total du mois.
 * Un clic sur un jour affiche ses positions fermées sous le calendrier.
 *
 * Sources : `daily` (profit et gain de chaque jour, tout l'historique) et
 * `trades` (positions fermées, pour le nombre de trades et la réussite).
 */
(function () {
  "use strict";

  var D = window.AlgoData;
  var App = window.AlgoApp;
  var WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];   // la semaine commence le lundi
  var MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août",
    "Septembre", "Octobre", "Novembre", "Décembre"];
  var NBSP = " ";

  // month : « AAAA-MM » affiché ; selected : « AAAA-MM-JJ » du jour cliqué.
  var state = { month: null, selected: null, mode: App.recall("calendar-mode") === "pct" ? "pct" : "money" };

  var el = {};
  ["calendar-head", "calendar", "day-card", "day-title", "day-detail"].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  // ------------------------------------------------------------- utilitaires

  function pad(value) { return (value < 10 ? "0" : "") + value; }
  function today() { return D.zurichDay(new Date()); }

  /* Décale un mois « AAAA-MM » de `delta` mois. */
  function shiftMonth(month, delta) {
    var parts = month.split("-").map(Number);
    var date = new Date(Date.UTC(parts[0], parts[1] - 1 + delta, 1));
    return date.getUTCFullYear() + "-" + pad(date.getUTCMonth() + 1);
  }

  function monthLabel(month) {
    var parts = month.split("-").map(Number);
    return MONTHS[parts[1] - 1] + " " + parts[0];
  }

  /* « 2026-10-01 » -> « 1er octobre 2026 » */
  function longDay(isoDay) {
    var parts = isoDay.split("-").map(Number);
    return (parts[2] === 1 ? "1er" : parts[2]) + " " + MONTHS[parts[1] - 1].toLowerCase() + " " + parts[0];
  }

  /*
   * Regroupe les données du compte par jour :
   * { "AAAA-MM-JJ": { profit, pct, trades: [...], wins } }
   */
  function buildDays(account) {
    var days = {};
    function day(key) {
      return days[key] || (days[key] = { profit: null, pct: null, trades: [], wins: 0 });
    }

    // Profit du jour et gain du jour (déduit du gain cumulé de la veille).
    var previousGain = 0;
    (account.daily || []).forEach(function (entry) {
      var info = day(entry.date);
      info.profit = entry.profit;
      info.pct = ((1 + entry.gain / 100) / (1 + previousGain / 100) - 1) * 100;
      previousGain = entry.gain;
    });

    // Positions fermées, rangées au jour de clôture (heure du broker, comme Myfxbook).
    (account.trades || []).forEach(function (trade) {
      var info = day(trade.day || D.zurichDay(new Date(trade.closeTime)));
      info.trades.push(trade);
      if (trade.profit > 0) info.wins += 1;
    });

    // Jour présent dans les positions mais pas encore dans la série quotidienne.
    Object.keys(days).forEach(function (key) {
      var info = days[key];
      if (info.profit === null) {
        info.profit = info.trades.reduce(function (sum, t) { return sum + t.profit; }, 0);
      }
      info.active = info.trades.length > 0 || Math.round(info.profit * 100) !== 0;
    });
    return days;
  }

  /* Total d'une liste de jours : somme des profits, ou gains composés en %. */
  function total(infos) {
    if (state.mode === "money") {
      return infos.reduce(function (sum, info) { return sum + info.profit; }, 0);
    }
    return (infos.reduce(function (product, info) {
      return product * (1 + (info.pct || 0) / 100);
    }, 1) - 1) * 100;
  }

  /* Valeur affichée : « +34,72 CHF » ou « +1,24 % ». `short` : version compacte pour mobile. */
  function formatValue(value, currency, short) {
    if (value === null || isNaN(value)) return "–";
    var rounded = Math.round(value * 100) / 100;
    var sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "";
    var abs = Math.abs(rounded);
    if (state.mode === "pct") {
      return sign + D.number(abs, short ? 1 : 2) + NBSP + "%";
    }
    if (short) {
      if (abs >= 1000) return sign + D.number(abs / 1000, 1) + "k";
      return sign + D.number(abs, abs >= 100 ? 0 : 1);
    }
    return sign + D.number(abs, abs >= 1000 ? 0 : 2) + NBSP + App.currencySymbol(currency);
  }

  function valueOf(info) { return state.mode === "money" ? info.profit : info.pct; }

  function plural(count, word) { return count + NBSP + word + (count > 1 ? "s" : ""); }

  // ------------------------------------------------------------------ rendu

  function showLoading() {
    el["calendar-head"].innerHTML = "";
    el.calendar.innerHTML = '<span class="skeleton skeleton-calendar"></span>';
    el["day-card"].hidden = true;
  }

  function showError(error) {
    el["calendar-head"].innerHTML = "";
    el.calendar.innerHTML = '<div class="block-state">' + App.stateHtml(error.message, true) + "</div>";
    el["day-card"].hidden = true;
  }

  function render(account) {
    var days = buildDays(account);
    var keys = Object.keys(days).filter(function (key) { return days[key].active; }).sort();
    var currentMonth = today().slice(0, 7);
    var firstMonth = keys.length ? keys[0].slice(0, 7) : currentMonth;
    if (!state.month) state.month = currentMonth;

    var parts = state.month.split("-").map(Number);
    var year = parts[0];
    var month = parts[1];
    var daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    var offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;   // 0 = lundi
    var weekCount = Math.ceil((offset + daysInMonth) / 7);

    // --- Cases et résumés de semaine ---
    var monthInfos = [];
    var html = WEEKDAYS.map(function (name) { return '<div class="cal-weekday">' + name + "</div>"; }).join("") +
      '<div class="cal-weekday cal-weekday-total">Semaine</div>';
    var weeksHtml = "";

    for (var week = 0; week < weekCount; week++) {
      var weekInfos = [];
      for (var column = 0; column < 7; column++) {
        var number = week * 7 + column - offset + 1;
        if (number < 1 || number > daysInMonth) {
          html += '<div class="cal-cell is-outside" aria-hidden="true"></div>';
          continue;
        }
        var key = state.month + "-" + pad(number);
        var info = days[key];
        var isToday = key === today();
        var dayNumber = '<span class="cal-date' + (isToday ? " is-today" : "") + '">' + number + "</span>";

        if (!info || !info.active) {
          html += '<div class="cal-cell">' + dayNumber + "</div>";
          continue;
        }
        weekInfos.push(info);
        monthInfos.push(info);

        var value = valueOf(info);
        var tone = value === null ? "is-flat" : D.tone(value).replace("is-neutral", "is-flat");
        var count = info.trades.length;
        var detail = count
          ? plural(count, "trade") + " · " + Math.round(info.wins / count * 100) + NBSP + "%"
          : "";
        var label = longDay(key) + " : " + formatValue(value, account.currency) +
          (count ? ", " + plural(count, "trade") + ", " + Math.round(info.wins / count * 100) + " % de réussite" : "");

        html += '<button type="button" class="cal-cell is-traded ' + tone + '" data-day="' + key + '"' +
          ' aria-pressed="' + (state.selected === key) + '" aria-label="' + D.escapeHtml(label) + '">' +
          dayNumber +
          '<span class="cal-value cal-full">' + formatValue(value, account.currency) + "</span>" +
          '<span class="cal-value cal-short">' + formatValue(value, account.currency, true) + "</span>" +
          '<span class="cal-detail">' + detail + "</span>" +
          "</button>";
      }

      var weekHtml = '<div class="cal-week"><span class="cal-week-name">Semaine ' + (week + 1) + "</span>";
      if (weekInfos.length) {
        var weekTotal = total(weekInfos);
        weekHtml += '<span class="cal-week-total ' + D.tone(weekTotal) + '">' +
          formatValue(weekTotal, account.currency) + "</span>" +
          '<span class="pill">' + plural(weekInfos.length, "jour") + "</span>";
      } else {
        weekHtml += '<span class="cal-week-total is-neutral">–</span>';
      }
      weekHtml += "</div>";
      html += weekHtml;        // dernière colonne de la grille (ordinateur)
      weeksHtml += weekHtml;   // liste sous la grille (mobile)
    }

    el.calendar.innerHTML = '<div class="cal-grid">' + html + "</div>" +
      '<div class="cal-weeks-mobile">' + weeksHtml + "</div>" +
      (keys.length ? "" : '<p class="cal-empty">Myfxbook n’a pas encore synchronisé de données pour ce compte.</p>');

    // --- En-tête : navigation, unité, statistiques du mois ---
    var monthTotal = total(monthInfos);
    el["calendar-head"].innerHTML =
      '<div class="cal-nav">' +
      '<button type="button" class="icon-button" data-nav="-1" aria-label="Mois précédent"' +
      (state.month <= firstMonth ? " disabled" : "") + '><span class="arrow arrow-left"></span></button>' +
      '<h2 class="cal-month" aria-live="polite">' + monthLabel(state.month) + "</h2>" +
      '<button type="button" class="icon-button" data-nav="1" aria-label="Mois suivant"' +
      (state.month >= currentMonth ? " disabled" : "") + '><span class="arrow arrow-right"></span></button>' +
      '<button type="button" class="ghost-button" data-nav="today"' +
      (state.month === currentMonth ? " disabled" : "") + ">Ce mois</button>" +
      "</div>" +
      '<div class="cal-stats">' +
      '<div class="segmented" role="group" aria-label="Unité des résultats">' +
      App.modeButtons(state.mode, account.currency, ["money", "pct"]) + "</div>" +
      '<span class="cal-stats-label">Résultat du mois</span>' +
      '<span class="cal-stats-total ' + (monthInfos.length ? D.tone(monthTotal) : "is-neutral") + '">' +
      (monthInfos.length ? formatValue(monthTotal, account.currency) : "–") + "</span>" +
      '<span class="pill">' + plural(monthInfos.length, "jour") + "</span>" +
      "</div>";

    renderDay(account, days);
  }

  /* Positions fermées du jour sélectionné. */
  function renderDay(account, days) {
    var info = state.selected && days[state.selected];
    if (!info || state.selected.slice(0, 7) !== state.month) {
      el["day-card"].hidden = true;
      return;
    }
    el["day-card"].hidden = false;
    el["day-title"].textContent = "Positions du " + longDay(state.selected);
    el["day-detail"].innerHTML = info.trades.length
      ? App.tradesTable(info.trades, account.currency, false)
      : '<div class="block-state">' +
        App.stateHtml("Le détail des positions n’est pas disponible pour ce jour.", false) + "</div>";
  }

  // --------------------------------------------------------------- pilotage

  document.addEventListener("click", function (event) {
    var target = event.target.closest("button");
    if (!target) return;

    if (target.dataset.nav) {
      state.month = target.dataset.nav === "today"
        ? today().slice(0, 7)
        : shiftMonth(state.month, Number(target.dataset.nav));
      state.selected = null;
    } else if (target.dataset.day) {
      state.selected = state.selected === target.dataset.day ? null : target.dataset.day;   // second clic : referme
    } else if (target.dataset.mode) {
      state.mode = target.dataset.mode;
      App.remember("calendar-mode", state.mode);
    } else {
      return;
    }

    var focus = target.dataset.day ? '[data-day="' + target.dataset.day + '"]'
      : target.dataset.nav ? '[data-nav="' + target.dataset.nav + '"]' : null;
    render(App.account());
    // La grille est redessinée : on redonne le focus au bouton utilisé.
    var again = focus && document.querySelector(focus);
    if (again && !again.disabled) again.focus();
    if (target.dataset.day && state.selected && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el["day-card"].scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });

  App.start({ onLoading: showLoading, onRender: render, onError: showError });
})();
