/*
 * AlgoDash - barre latérale commune à toutes les pages.
 *
 * Chaque page contient <aside id="sidebar"> et <body data-page="...">.
 * Ce fichier y injecte le logo et le menu, met la page active en rose,
 * et gère le menu en tiroir sur mobile (bouton hamburger).
 * Pour ajouter une page : une ligne dans NAV + un fichier HTML.
 */
(function () {
  "use strict";

  var NAV = [
    { id: "accueil", label: "Accueil", href: "index.html" },
    { id: "comptes", label: "Mes comptes", href: "comptes.html" },
    { id: "calendrier", label: "Calendrier", href: "calendrier.html" },
    { id: "liens", label: "Liens utiles", href: "liens.html" },
    { id: "contact", label: "Contact", href: "contact.html" }
  ];

  var LOGO = '<a class="logo" href="index.html"><span class="logo-accent">Algo</span>Dash</a>';
  var current = document.body.dataset.page;
  var sidebar = document.getElementById("sidebar");

  // --- Barre latérale -------------------------------------------------------
  var links = NAV.map(function (item) {
    var active = item.id === current;
    return '<li><a class="nav-link' + (active ? " is-active" : "") + '" href="' + item.href + '"' +
      (active ? ' aria-current="page"' : "") + ">" + item.label + "</a></li>";
  }).join("");
  sidebar.innerHTML = LOGO + '<nav aria-label="Navigation principale"><ul class="nav">' + links + "</ul></nav>";

  // --- Barre du haut, visible uniquement sur mobile --------------------------
  var topbar = document.createElement("header");
  topbar.className = "topbar";
  topbar.innerHTML =
    '<button class="hamburger" type="button" aria-label="Ouvrir le menu" aria-controls="sidebar" aria-expanded="false">' +
    "<span></span><span></span><span></span></button>" + LOGO;
  document.body.insertBefore(topbar, document.body.firstChild);

  var overlay = document.createElement("div");
  overlay.className = "overlay";
  document.body.appendChild(overlay);

  var hamburger = topbar.querySelector(".hamburger");

  function setMenu(open) {
    document.body.classList.toggle("menu-open", open);
    hamburger.setAttribute("aria-expanded", String(open));
    hamburger.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
  }

  hamburger.addEventListener("click", function () {
    setMenu(!document.body.classList.contains("menu-open"));
  });
  overlay.addEventListener("click", function () { setMenu(false); });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") setMenu(false);
  });
})();
