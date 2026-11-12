// "How it looks": makes the demo portal clickable (MC, 2026-11-12).
// - scales the 1280x800 portal to fit the page;
// - the tour steps and the portal's own menu switch screens;
// - the chat's sample questions are typed, "read" and answered;
// - findings open to show why they matter, the evidence and the fix;
// - the cloud checks can be filtered.
(function () {
  "use strict";
  var pt = document.getElementById("pt");
  var vp = document.getElementById("tour-viewport");
  if (!pt || !vp) return;
  var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Fit the portal to the frame.
  function fit() {
    var w = vp.clientWidth;
    var s = Math.max(0.3, Math.min(1, w / 1280));
    pt.style.transform = "scale(" + s + ")";
    vp.style.height = Math.round(800 * s) + "px";
  }
  window.addEventListener("resize", fit);
  fit();

  var CRUMB = { chat: "CHAT", findings: "IT & SECURITY", backups: "BACKUPS", cloud: "CLOUD SECURITY" };
  var TIPS = {
    chat: "<b>Try it:</b> pick one of the questions under the chat. The Sentinel reads the systems it needs and answers with the evidence.",
    findings: "<b>Try it:</b> click a finding. Every system's problems land in one list, each with why it matters, the evidence and the fix.",
    backups: "Every morning the Sentinel reads last night's backups, so a failed job turns up before anyone needs a restore.",
    cloud: "<b>Try it:</b> switch between <b>Needs work</b>, <b>Pass</b> and <b>All</b>. Microsoft 365 settings are checked daily and scored; IT applies the fixes."
  };
  var steps = Array.prototype.slice.call(document.querySelectorAll(".tour-steps button"));
  var navs = Array.prototype.slice.call(pt.querySelectorAll(".pt-nav button"));
  var screens = Array.prototype.slice.call(pt.querySelectorAll(".pt-screen"));
  var tip = document.getElementById("tour-tip");
  var crumb = document.getElementById("pt-crumb");

  function spot(name) {
    pt.querySelectorAll(".spot").forEach(function (el) { el.classList.remove("spot"); });
    var el = pt.querySelector('[data-spot="' + name + '"]');
    if (el && !calm) { void el.offsetWidth; el.classList.add("spot"); }
  }
  function show(name, fromStep) {
    screens.forEach(function (s) { s.hidden = s.getAttribute("data-screen") !== name; });
    navs.forEach(function (b) { if (b.getAttribute("data-go") === name) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    steps.forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-step") === name ? "true" : "false"); });
    crumb.textContent = CRUMB[name] || "";
    tip.innerHTML = TIPS[name] || "";
    if (fromStep) spot(name === "chat" ? "ask" : name === "cloud" ? "checks" : name);
    if (name === "findings" && fromStep) openRow("f1", true);
  }
  steps.forEach(function (b) { b.addEventListener("click", function () { show(b.getAttribute("data-step"), true); }); });
  navs.forEach(function (b) { b.addEventListener("click", function () { show(b.getAttribute("data-go"), false); }); });

  // Chat: type the question, show what's being read, then the answer.
  var log = document.getElementById("pt-log");
  var input = document.getElementById("pt-input");
  var idle = input.textContent;
  var timers = [];
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function ask(id, label) {
    timers.forEach(clearTimeout); timers = [];
    var tpl = document.getElementById("ans-" + id);
    if (!tpl) return;
    var parts = Array.prototype.slice.call(tpl.content.children).map(function (n) { return n.cloneNode(true); });
    function answer() {
      input.textContent = idle; input.className = "";
      log.innerHTML = "";
      log.appendChild(parts[0]);
      if (calm) { log.appendChild(parts[2]); return; }
      log.appendChild(parts[1]);
      later(function () { parts[1].remove(); log.appendChild(parts[2]); }, 1100);
    }
    if (calm) { answer(); return; }
    input.className = "typing";
    var i = 0;
    (function type() {
      input.textContent = label.slice(0, ++i);
      if (i < label.length) later(type, 22); else later(answer, 280);
    })();
  }
  pt.querySelectorAll("[data-ask]").forEach(function (b) {
    b.addEventListener("click", function () { ask(b.getAttribute("data-ask"), b.textContent); });
  });

  // Findings: open one at a time.
  var rows = Array.prototype.slice.call(pt.querySelectorAll(".pt-row"));
  function openRow(id, only) {
    rows.forEach(function (r) {
      var on = r.getAttribute("data-row") === id && (only || r.getAttribute("aria-expanded") !== "true");
      r.setAttribute("aria-expanded", on ? "true" : "false");
      r.querySelector(".x").textContent = on ? "▾" : "▸";
      document.getElementById(r.getAttribute("data-row")).hidden = !on;
    });
  }
  rows.forEach(function (r) {
    r.addEventListener("click", function () { openRow(r.getAttribute("data-row"), false); });
    r.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openRow(r.getAttribute("data-row"), false); }
    });
  });

  // Cloud checks: filter.
  var filters = Array.prototype.slice.call(pt.querySelectorAll("[data-filter]"));
  var checks = Array.prototype.slice.call(pt.querySelectorAll(".pt-check"));
  filters.forEach(function (f) {
    f.addEventListener("click", function () {
      var k = f.getAttribute("data-filter");
      filters.forEach(function (g) { g.setAttribute("aria-pressed", g === f ? "true" : "false"); });
      checks.forEach(function (c) {
        var s = c.getAttribute("data-s");
        c.hidden = !(k === "all" || s === k || (k === "work" && s !== "pass"));
      });
    });
  });
})();
