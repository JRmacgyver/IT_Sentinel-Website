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
  // With motion allowed, the question is typed out, a "Reading…" line shows which systems are
  // being read, then the answer appears; the four questions play through once and stop. Any click
  // or key press in the box stops the tour. With reduced motion, the answer simply swaps.
  var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ask = document.querySelector(".ask");
  var askQ = document.getElementById("ask-q");
  var askTyped = document.getElementById("ask-typed");
  var askStatus = document.getElementById("ask-status");
  var askButtons = Array.prototype.slice.call(document.querySelectorAll(".ask-try button"));
  var askAnswers = Array.prototype.slice.call(document.querySelectorAll(".ask-a"));
  var askTimers = [];
  function later(fn, ms) { askTimers.push(setTimeout(fn, ms)); }
  function clearAsk() { askTimers.forEach(clearTimeout); askTimers = []; }

  function showQuestion(id, animate, done) {
    clearAsk();
    var answer = askAnswers.filter(function (a) { return a.getAttribute("data-q") === id; })[0];
    var label = "";
    askButtons.forEach(function (b) {
      var on = b.getAttribute("data-q") === id;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      if (on) label = b.textContent;
    });
    if (askQ) askQ.textContent = label;
    function reveal() {
      if (askStatus) askStatus.hidden = true;
      if (ask) ask.classList.remove("typing");
      askAnswers.forEach(function (a) { a.hidden = a !== answer; });
      if (done) later(done, 5200);
    }
    if (!animate || calm || !askTyped) {
      if (askTyped) askTyped.textContent = label;
      reveal();
      return;
    }
    // While the question is typed, the previous answer stays in place, dimmed, so nothing jumps.
    if (askStatus) askStatus.hidden = true;
    ask.classList.add("typing");
    askTyped.textContent = "";
    var i = 0;
    (function type() {
      askTyped.textContent = label.slice(0, ++i);
      if (i < label.length) { later(type, 26); return; }
      later(function () {
        askAnswers.forEach(function (a) { a.hidden = true; });
        if (askStatus && answer) { askStatus.textContent = answer.getAttribute("data-reading") || ""; askStatus.hidden = false; }
        later(reveal, 850);
      }, 250);
    })();
  }

  if (askButtons.length) {
    var touring = !calm;
    var stopTour = function () { touring = false; };
    askButtons.forEach(function (b) {
      b.addEventListener("click", function () { stopTour(); showQuestion(b.getAttribute("data-q"), true); });
    });
    if (ask) ask.addEventListener("keydown", stopTour);
    var step = 0;
    (function tour() {
      var id = askButtons[step].getAttribute("data-q");
      var last = step === askButtons.length - 1;
      showQuestion(id, step > 0 || !calm, function () {
        if (!touring) return;
        if (last) { touring = false; showQuestion(askButtons[0].getAttribute("data-q"), true); return; }
        step += 1;
        tour();
      });
    })();
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
