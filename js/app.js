/*
 * AlgoDash - éléments communs aux pages qui affichent des données de compte.
 *
 * Gère l'en-tête (sélecteur de compte, badge Démo/Réel, dernière mise à jour,
 * bandeau d'information), le chargement des données, le rafraîchissement toutes
 * les 15 min et le tableau des positions. Chaque page fournit trois fonctions :
 *   AlgoApp.start({ onLoading, onRender, onError })
 */
window.AlgoApp = (function () {
  "use strict";

  var D = window.AlgoData;
  var state = { data: null, accountId: null };
  var hooks = {};
  var el = {};

  // ------------------------------------------------------------- utilitaires

  /* Compte actuellement sélectionné. */
  function account() {
    var accounts = state.data.accounts;
    return accounts.filter(function (a) { return String(a.id) === String(state.accountId); })[0] || accounts[0];
  }

  /* Mémorise un réglage dans le navigateur (confort uniquement : la page marche sans). */
  function remember(key, value) {
    try { localStorage.setItem("algodash." + key, String(value)); } catch (error) { /* stockage indisponible */ }
  }
  function recall(key) {
    try { return localStorage.getItem("algodash." + key); } catch (error) { return null; }
  }

  /* Message d'un bloc vide ou en erreur, avec bouton « Réessayer » si besoin. */
  function stateHtml(text, withRetry) {
    return "<p>" + D.escapeHtml(text) + "</p>" +
      (withRetry ? '<button class="retry" type="button" data-retry>Réessayer</button>' : "");
  }

  /* Symbole de la devise du compte : « $ », « CHF », « € »… */
  function currencySymbol(currency) {
    return D.money(0, currency).replace(/[\d\s,.  ]/g, "") || currency || "$";
  }

  /* Boutons « % / devise » partagés par la courbe et le calendrier. */
  function modeButtons(mode, currency, order) {
    var modes = { pct: "%", money: currencySymbol(currency) };
    return (order || ["pct", "money"]).map(function (id) {
      return '<button type="button" data-mode="' + id + '" aria-pressed="' + (mode === id) + '">' +
        D.escapeHtml(modes[id]) + "</button>";
    }).join("");
  }

  // ----------------------------------------------------- sélecteur de compte

  function renderAccount() {
    if (!el.account) return;            // page sans sélecteur de compte (Mes comptes)
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
    if (!el.account) return;
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

  // ---------------------------------------------------- tableau de positions

  /* Tableau des positions fermées (déjà triées). `scroll` limite la hauteur du bloc. */
  function tradesTable(trades, currency, scroll) {
    var rows = trades.map(function (t) {
      return "<tr>" +
        "<td>" + D.dateTime(t.closeTime) + "</td>" +
        "<td>" + (t.action === "Buy" ? "Achat" : "Vente") + "</td>" +
        '<td class="num">' + (t.lots == null ? "–" : D.number(t.lots, 2)) + "</td>" +
        '<td class="num col-price">' + (t.openPrice == null ? "–" : D.number(t.openPrice, 2)) + "</td>" +
        '<td class="num col-price">' + (t.closePrice == null ? "–" : D.number(t.closePrice, 2)) + "</td>" +
        '<td class="num ' + D.tone(t.profit) + '">' + D.money(t.profit, currency, true) + "</td>" +
        "</tr>";
    }).join("");
    return '<div class="' + (scroll ? "trades-scroll" : "trades-wrap") + '"' +
      (scroll ? ' tabindex="0" role="region" aria-label="Positions fermées"' : "") + ">" +
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
    hooks.onRender(account(), state.data);
  }

  function showLoading() {
    if (el.account) {
      el.account.innerHTML = '<span class="account-pill skeleton skeleton-pill"></span>';
      el.badge.hidden = true;
    }
    el.updated.textContent = "";
    hooks.onLoading();
  }

  /* Erreur sans aucune donnée à montrer : la page affiche le message dans ses blocs. */
  function showError(error) {
    if (el.account) {
      el.account.innerHTML = '<span class="account-pill">Compte indisponible</span>';
      el.badge.hidden = true;
    }
    el.updated.textContent = "";
    el.notice.hidden = true;
    hooks.onError(error);
  }

  /* Compte demandé par l'adresse (index.html?compte=123), utilisé par le bouton « Dash ». */
  function accountFromUrl() {
    var id = new URLSearchParams(window.location.search).get("compte");
    if (id) remember("account", id);
    return id;
  }

  function refresh(showSkeleton) {
    if (showSkeleton) showLoading();
    return D.load().then(function (data) {
      state.data = data;
      if (state.accountId === null) state.accountId = accountFromUrl() || recall("account");
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

  function start(pageHooks) {
    hooks = pageHooks;
    ["account", "badge", "updated", "notice"].forEach(function (id) { el[id] = document.getElementById(id); });

    document.addEventListener("click", function (event) {
      var target = event.target.closest("button");
      if (!event.target.closest("#account")) toggleAccountMenu(false);
      if (!target) return;

      if (target.id === "account-button") {
        toggleAccountMenu();
      } else if (target.dataset.account) {
        state.accountId = target.dataset.account;
        remember("account", state.accountId);
        renderAll();
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
  }

  return {
    start: start, account: account, stateHtml: stateHtml,
    currencySymbol: currencySymbol, modeButtons: modeButtons, tradesTable: tradesTable,
    remember: remember, recall: recall
  };
})();
