// IT Sentinel website: contact form over fetch() (optional Turnstile), footer year, email link built at runtime.
// Without JavaScript the form still works: it posts to /api/contact and lands on /#thanks.
(function () {
  "use strict";

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  // The address is assembled here so it never sits in the page source as plain text.
  document.querySelectorAll("[data-mail-user]").forEach(function (el) {
    var addr = el.getAttribute("data-mail-user") + "@" + el.getAttribute("data-mail-domain");
    var a = document.createElement("a");
    a.href = "mailto:" + addr;
    a.textContent = addr;
    el.replaceWith(a);
  });

  var form = document.getElementById("contact-form");
  if (!form) return;
  var status = document.getElementById("form-status");
  var thanks = document.getElementById("thanks");
  var button = form.querySelector("button[type=submit]");
  var spamCheck = false;   // true once a Turnstile widget is on the page

  // The spam check is optional: the Worker says whether it's configured, and with which site key.
  fetch("/api/config", { headers: { Accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (cfg) {
      if (!cfg || !cfg.turnstileSiteKey) return;
      window.onTurnstileLoad = function () {
        window.turnstile.render("#turnstile", { sitekey: cfg.turnstileSiteKey, theme: "dark" });
        spamCheck = true;
      };
      var s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad";
      s.async = true;
      document.head.appendChild(s);
    })
    .catch(function () { /* no config: the form still works without the widget */ });

  function say(text, kind) {
    status.textContent = text;
    status.className = "status" + (kind ? " " + kind : "");
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var data = new FormData(form);
    if (!String(data.get("name") || "").trim() || !form.elements.email.checkValidity()
        || !String(data.get("email") || "").trim() || !String(data.get("message") || "").trim()) {
      say("Please fill in your name, a valid email address and a message.", "err");
      return;
    }
    if (!form.elements.consent.checked) {
      say("Please tick the box so we can use your details to reply.", "err");
      return;
    }
    if (spamCheck && !data.get("cf-turnstile-response")) {
      say("Please wait for the spam check to finish, then send again.", "err");
      return;
    }
    button.disabled = true;
    say("Sending…");
    fetch(form.action, { method: "POST", body: data, headers: { Accept: "application/json" } })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (res) {
        if (res && res.ok) {
          form.hidden = true;
          thanks.classList.add("show");
          thanks.focus();
        } else {
          say((res && res.error) || "Something went wrong. Please try again in a minute.", "err");
          if (spamCheck && window.turnstile) window.turnstile.reset();
        }
      })
      .catch(function () {
        say("We couldn't reach the server. Check your connection and try again.", "err");
        if (spamCheck && window.turnstile) window.turnstile.reset();
      })
      .finally(function () { button.disabled = false; });
  });
})();
