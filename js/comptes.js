/*
 * AlgoDash - page Comptes.
 *
 * Affiche une carte par compte Myfxbook : numéro, badge Démo/Réel, pastille
 * d'état de synchronisation, P&L réalisé depuis l'ouverture (montant et %),
 * solde, et un bouton « Dash » qui ouvre l'accueil sur ce compte.
 * Le bouton en haut à droite filtre les comptes : tous, démo ou réels.
 */
(function () {
  "use strict";

  var D = window.AlgoData;
  var App = window.AlgoApp;
  var NBSP = " ";
  var INACTIVE_MS = 3 * 24 * 60 * 60 * 1000;   // sans mise à jour Myfxbook depuis 3 jours : compte inactif

  var FILTERS = [
    { id: "all", label: "Tous les comptes", empty: "Aucun compte pour l’instant." },
    { id: "demo", label: "Comptes démo", empty: "Aucun compte démo." },
    { id: "real", label: "Comptes réels", empty: "Aucun compte réel pour l’instant." }
  ];

  var state = { filter: "all", data: null };
  var el = { filter: document.getElementById("filter"), accounts: document.getElementById("accounts") };

  // ------------------------------------------------------------------ filtre

  function currentFilter() {
    return FILTERS.filter(function (f) { return f.id === state.filter; })[0];
  }

  function renderFilter() {
    var options = FILTERS.map(function (f) {
      return '<li role="presentation"><button class="account-option" type="button" role="option" ' +
        'aria-selected="' + (f.id === state.filter) + '" data-filter="' + f.id + '">' + f.label + "</button></li>";
    }).join("");
    el.filter.innerHTML =
      '<button class="account-pill filter-pill" type="button" id="filter-button" aria-haspopup="listbox" aria-expanded="false">' +
      currentFilter().label + '<span class="chevron" aria-hidden="true"></span></button>' +
      '<ul class="account-menu filter-menu" role="listbox" aria-label="Filtrer les comptes" hidden>' + options + "</ul>";
  }

  function toggleFilterMenu(open) {
    var button = document.getElementById("filter-button");
    var menu = el.filter.querySelector(".account-menu");
    if (!button || !menu) return;
    var willOpen = open === undefined ? menu.hidden : open;
    menu.hidden = !willOpen;
    button.setAttribute("aria-expanded", String(willOpen));
  }

  // ------------------------------------------------------- état d'un compte

  /*
   * Pastille de synchronisation :
   * - rouge : la dernière récupération des données Myfxbook a échoué ;
   * - grise : Myfxbook n'a plus mis ce compte à jour depuis 3 jours ;
   * - verte : données à jour.
   */
  function syncState(account, data) {
    if (data.status && data.status.ok === false) {
      return { tone: "is-error", label: "Dernière récupération Myfxbook en échec" };
    }
    var seen = account.myfxbookSeenAt ? new Date(account.myfxbookSeenAt).getTime() : null;
    if (seen && Date.now() - seen > INACTIVE_MS) {
      var days = Math.floor((Date.now() - seen) / 86400000);
      return { tone: "is-inactive", label: "Compte non mis à jour par Myfxbook depuis " + days + " jours" };
    }
    return { tone: "is-ok", label: "Données à jour" };
  }

  // ------------------------------------------------------------------ cartes

  function card(account, data) {
    var stats = account.stats;
    var sync = syncState(account, data);
    return '<article class="card account-card">' +
      '<div class="account-card-head">' +
      '<h2 class="account-card-name">' + D.escapeHtml(account.label) + "</h2>" +
      '<span class="sync-dot ' + sync.tone + '" role="img" aria-label="' + sync.label + '" title="' + sync.label + '"></span>' +
      "</div>" +
      '<span class="badge badge-inset' + (account.demo ? "" : " is-real") + '">' + (account.demo ? "Démo" : "Réel") + "</span>" +
      '<dl class="account-card-stats">' +
      "<div><dt>P&amp;L réalisé" + NBSP + ":</dt><dd class=\"" + D.tone(stats.profit) + '">' +
      D.money(stats.profit, account.currency, true) + "</dd></div>" +
      "<div><dt>P&amp;L réalisé %" + NBSP + ":</dt><dd class=\"" + D.tone(stats.gain) + '">' +
      D.percent(stats.gain) + "</dd></div>" +
      "<div><dt>Solde" + NBSP + ":</dt><dd>" + D.money(stats.balance, account.currency) + "</dd></div>" +
      "</dl>" +
      // Ouvre l'accueil sur ce compte (voir accountFromUrl dans js/app.js).
      '<a class="dash-button" href="index.html?compte=' + encodeURIComponent(account.id) + '"' +
      ' aria-label="Ouvrir le dashboard du compte ' + D.escapeHtml(account.label) + '">Dash</a>' +
      "</article>";
  }

  function renderCards() {
    var accounts = state.data.accounts.filter(function (account) {
      return state.filter === "all" || (state.filter === "demo") === Boolean(account.demo);
    });
    el.accounts.innerHTML = accounts.length
      ? accounts.map(function (account) { return card(account, state.data); }).join("")
      : '<div class="card block-state accounts-empty">' + App.stateHtml(currentFilter().empty, false) + "</div>";
  }

  // --------------------------------------------------------------- pilotage

  function showLoading() {
    el.filter.innerHTML = "";
    var skeleton = '<span class="skeleton account-card-skeleton"></span>';
    el.accounts.innerHTML = skeleton + skeleton;
  }

  function showError(error) {
    el.filter.innerHTML = "";
    el.accounts.innerHTML = '<div class="card block-state accounts-empty">' + App.stateHtml(error.message, true) + "</div>";
  }

  function render(account, data) {
    state.data = data;
    renderFilter();
    renderCards();
  }

  document.addEventListener("click", function (event) {
    var target = event.target.closest("button");
    if (!event.target.closest("#filter")) toggleFilterMenu(false);
    if (!target) return;

    if (target.id === "filter-button") {
      toggleFilterMenu();
    } else if (target.dataset.filter) {
      state.filter = target.dataset.filter;
      renderFilter();
      renderCards();
      document.getElementById("filter-button").focus();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") toggleFilterMenu(false);
  });

  App.start({ onLoading: showLoading, onRender: render, onError: showError });
})();
