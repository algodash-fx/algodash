/*
 * AlgoDash - page Contact.
 *
 * Le visiteur écrit un message puis choisit comment l'envoyer :
 * - par e-mail : le message part depuis la page via le service Web3Forms,
 *   qui le transmet à l'adresse liée à la clé ci-dessous (l'adresse reste cachée) ;
 * - sur Telegram : Telegram s'ouvre sur une conversation avec le compte indiqué,
 *   le message déjà écrit ; le visiteur n'a plus qu'à appuyer sur Envoyer.
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------- réglages
  var CONFIG = {
    // Clé d'accès Web3Forms (https://web3forms.com). Elle est faite pour être publique :
    // elle permet seulement d'envoyer un message vers l'adresse qui lui est liée.
    web3formsKey: "82ea0bba-f3cf-4d70-a857-16143b516556",

    // Nom d'utilisateur Telegram public, sans le @.
    telegramUser: "Algora_contact",

    // Passe à false pour retirer le bouton Telegram et ne garder que l'e-mail.
    telegramEnabled: true
  };

  var MAX_LENGTH = 1500;
  var SUBMIT_URL = "https://api.web3forms.com/submit";

  var el = {};
  ["contact-form", "message", "message-error", "counter", "email-field", "email", "email-error",
    "botcheck", "send-mail", "send-telegram", "contact-status"].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  var mailReady = Boolean(CONFIG.web3formsKey);
  var telegramReady = CONFIG.telegramEnabled && Boolean(CONFIG.telegramUser);

  // ------------------------------------------------------- mise en place

  // Chaque bouton n'apparaît que si son mode d'envoi est configuré.
  el["send-telegram"].hidden = !telegramReady;
  el["send-mail"].hidden = !mailReady;
  el["email-field"].hidden = !mailReady;
  if (!mailReady && !telegramReady) {
    setStatus("Le formulaire de contact n’est pas encore configuré.", "is-error");
  }

  function setStatus(text, tone) {
    el["contact-status"].textContent = text;
    el["contact-status"].className = "contact-status" + (tone ? " " + tone : "");
  }

  function setError(field, text) {
    el[field + "-error"].textContent = text;
    el[field].setAttribute("aria-invalid", text ? "true" : "false");
  }

  function updateCounter() {
    el.counter.textContent = el.message.value.length + " / " + MAX_LENGTH;
  }

  /* Vérifie le message ; renvoie le texte nettoyé, ou null s'il est vide. */
  function readMessage() {
    var text = el.message.value.trim();
    setError("message", text ? "" : "Écris ton message avant de l’envoyer.");
    if (!text) el.message.focus();
    return text || null;
  }

  // ------------------------------------------------------------------ e-mail

  function sendMail() {
    setStatus("", "");
    setError("email", "");
    var text = readMessage();
    if (!text) return;

    var email = el.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("email", "Indique une adresse e-mail valide pour recevoir la réponse.");
      el.email.focus();
      return;
    }

    // Piège à robots : un visiteur réel ne peut pas cocher cette case invisible.
    // On n'envoie rien, sans le signaler au robot.
    if (el.botcheck.checked) {
      setStatus("Message envoyé. Tu recevras la réponse par e-mail.", "is-success");
      return;
    }

    var label = el["send-mail"].querySelector("span");
    el["send-mail"].disabled = true;
    label.textContent = "Envoi en cours…";

    fetch(SUBMIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        access_key: CONFIG.web3formsKey,
        subject: "AlgoDash : nouveau message",
        from_name: "AlgoDash",
        email: email,                         // sert d'adresse de réponse
        message: text
      })
    })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (result) {
          var ok = response.ok && result.success === true;
          // En cas de refus, la raison donnée par le service est visible dans la console (F12).
          if (!ok) console.warn("Web3Forms :", response.status, result.message || (result.body && result.body.message));
          return { status: response.status, ok: ok };
        });
      })
      .then(function (result) {
        if (result.ok) {
          el["contact-form"].reset();
          updateCounter();
          setStatus("Message envoyé. Tu recevras la réponse par e-mail.", "is-success");
        } else if (result.status === 429) {
          setStatus("Trop de messages envoyés. Réessaie dans quelques minutes.", "is-error");
        } else {
          setStatus("L’envoi a échoué. Réessaie dans un instant" +
            (telegramReady ? ", ou passe par Telegram." : "."), "is-error");
        }
      })
      .catch(function () {
        setStatus("Impossible d’envoyer le message. Vérifie ta connexion" +
          (telegramReady ? ", ou passe par Telegram." : "."), "is-error");
      })
      .then(function () {
        el["send-mail"].disabled = false;
        label.textContent = "Envoyer par e-mail";
      });
  }

  // ---------------------------------------------------------------- Telegram

  function sendTelegram() {
    setStatus("", "");
    setError("email", "");
    var text = readMessage();
    if (!text) return;

    // Lien officiel Telegram : ouvre la conversation avec le message prérempli.
    var url = "https://t.me/" + encodeURIComponent(CONFIG.telegramUser) + "?text=" + encodeURIComponent(text);
    window.open(url, "_blank", "noopener");
    setStatus("Telegram s’ouvre avec ton message : il te reste à appuyer sur Envoyer.", "is-success");
  }

  // --------------------------------------------------------------- pilotage

  el.message.addEventListener("input", function () {
    updateCounter();
    if (el.message.value.trim()) setError("message", "");
  });
  el.email.addEventListener("input", function () { setError("email", ""); });

  // La touche Entrée dans le champ e-mail envoie par e-mail (bouton principal du formulaire).
  el["contact-form"].addEventListener("submit", function (event) {
    event.preventDefault();
    if (mailReady) sendMail();
  });
  el["send-telegram"].addEventListener("click", sendTelegram);

  updateCounter();
})();
