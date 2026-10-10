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

  // The page works without this script: the six topics are listed one after another and all the
  // sample answers show. With it, "js" on <html> turns them into tabs and a pick-a-question box.
  document.documentElement.classList.add("js");

  // Sample questions in the hero: show one answer at a time.
  var askQ = document.getElementById("ask-q");
  var askButtons = document.querySelectorAll(".ask-try button");
  var askAnswers = document.querySelectorAll(".ask-a");
  function showQuestion(id) {
    askAnswers.forEach(function (a) { a.hidden = a.getAttribute("data-q") !== id; });
    askButtons.forEach(function (b) {
      var on = b.getAttribute("data-q") === id;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      if (on && askQ) askQ.textContent = b.textContent;
    });
  }
  if (askButtons.length) {
    askButtons.forEach(function (b) {
      b.addEventListener("click", function () { showQuestion(b.getAttribute("data-q")); });
    });
    showQuestion(askButtons[0].getAttribute("data-q"));
  }

  // Tabs: one panel at a time, arrow keys move between tabs, and /#faq (or any panel id) opens that tab.
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tabs [role="tab"]'));
  function selectTab(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      var panel = document.getElementById(t.getAttribute("aria-controls"));
      if (panel) panel.hidden = !on;
    });
    if (focus) tab.focus();
  }
  function tabForHash() {
    var id = location.hash.slice(1);
    return tabs.filter(function (t) { return id && t.getAttribute("aria-controls") === id; })[0];
  }
  if (tabs.length) {
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { selectTab(t); });
      t.addEventListener("keydown", function (ev) {
        var next = ev.key === "ArrowRight" ? i + 1 : ev.key === "ArrowLeft" ? i - 1
                 : ev.key === "Home" ? 0 : ev.key === "End" ? tabs.length - 1 : null;
        if (next === null) return;
        ev.preventDefault();
        selectTab(tabs[(next + tabs.length) % tabs.length], true);
      });
    });
    selectTab(tabForHash() || tabs[0]);
    window.addEventListener("hashchange", function () { var t = tabForHash(); if (t) selectTab(t); });
  }

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
