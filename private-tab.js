(function () {
  "use strict";
  if (window.__privateTabLoaded) return;
  window.__privateTabLoaded = true;
  function $(id) { return document.getElementById(id); }
  function authed() {
    try { if (typeof window.__t2iIsOwnerAuthed === "function") return !!window.__t2iIsOwnerAuthed(); } catch (e) {}
    return window.__t2iOwnerAuthed === true;
  }
  var PRIV_TABS = [
    { id: "flux", label: "Fluxinator", ico: "🐺", embeds: [
      { type: "native", id: "flux", render: "FluxTab", src: "src/flux/loader.js", label: "🐺 Fluxinator", note: "The full Fluxinator studio, remade natively in this tab from its own source (perchance.org/fluxinator) — 128 art styles, 39 test styles, photo lab, auto style fine-tune and prompt plumbing, plus the Girls Generator's trait engine (boosters, character, outfits…) merged in below — Flux controls win on overlap. All vendored locally. No embed, no redirect." }
    ] },
    { id: "liquidizer", label: "Liquidizer", ico: "🌊", embeds: [
      { type: "native", id: "liquidizer", render: "LiquidizerTab", label: "🌊 Liquidizer", note: "The full Liquidizer studio, running natively in this tab — every control edits the local copy in src/liquidizer/ (markup, styles, engine, presets). Source site: perchance.org/inynuyfq21." }
    ] },
    { id: "idleimage", label: "Idle Image", ico: "🎞️", embeds: [
      { gen: "nexora-idleimage", label: "🎞️ Idle Image", note: "The full Idle Image studio, embedded in this tab — upload, link or generate a photo, paint where the motion should happen, layer idle animations and export the loop as GIF/WebP/MP4/WebM. Source site: perchance.org/nexora-idleimage." }
    ] },
    { id: "jiggle", label: "Jiggle Studio", ico: "🍮", embeds: [
      { gen: "nexora-jiggle", label: "🍮 Jiggle Studio", note: "The full Jiggle Studio, embedded in this tab — turn a flat image into an animated transparent sticker with soft-body jiggle physics on regions you draw, plus motion presets and live drag; exports transparent APNG, transparent GIF or spritesheet + JSON. Source site: perchance.org/nexora-jiggle." }
    ] }
  ];
  function embedsOf(t) {
    if (t.embeds && t.embeds.length) return t.embeds;
    var one = { label: t.label, gen: t.gen };
    if (t.hash) one.hash = t.hash;
    if (t.note) one.note = t.note;
    return [one];
  }
  function urlFor(e) { return "https://null.perchance.org/" + e.gen + (e.hash || ""); }
  function pageFor(e) { return "https://perchance.org/" + e.gen + (e.hash || ""); }
  var current = "flux";
  var built = false;
  /* Lazy entry point for dev-audit + any direct openers (mirrors the ensure*
   * pattern in index.html; the tab itself loads via the embed's `src:` above). */
  window.ensureFlux = function (cb) {
    function done() { if (cb) { try { cb(); } catch (e) {} } }
    if (window.__fluxLoaded) { done(); return; }
    function wait(n) {
      if (window.__fluxLoaded) { done(); return; }
      if ((n || 0) >= 120) return;
      setTimeout(function () { wait((n || 0) + 1); }, 250);
    }
    if (typeof window.loadScriptOnce === "function") { window.loadScriptOnce("__fluxLoaderDone", "src/flux/loader.js", wait); return; }
    var s = document.createElement("script");
    s.src = "src/flux/loader.js";
    s.onload = wait;
    document.body.appendChild(s);
    wait();
  };
  function css() {
    if ($("privTabCss")) return;
    var s = document.createElement("style");
    s.id = "privTabCss";
    s.textContent =
      "#priv-subbar .priv-pill{cursor:pointer;font:inherit;font-size:0.88rem;padding:0.45rem 1.1rem;border-radius:999px;border:1px solid var(--th-border);background:var(--th-surface,#eee);color:inherit;}" +
      "#priv-subbar .priv-pill:hover{border-color:var(--th-accent);}" +
      "#priv-subbar .priv-pill.active{background:var(--th-accent);border-color:var(--th-accent);color:var(--th-accent-text);font-weight:600;}" +
      ".priv-pane iframe.chat-frame{width:100%;}" +
      ".priv-tools{display:flex;gap:0.4rem;justify-content:center;flex-wrap:wrap;margin:0 auto 0.6rem;}" +
      ".priv-tools .pro-btn{cursor:pointer;font:inherit;font-size:0.8rem;padding:0.3rem 0.8rem;border-radius:999px;border:1px solid var(--th-border);background:var(--th-surface,#eee);color:inherit;}" +
       ".priv-tools .pro-btn:hover{border-color:var(--th-accent);}" +
       ".priv-innerbar{display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;margin:0.6rem auto;}" +
       ".priv-innerbar .priv-pill{cursor:pointer;font:inherit;font-size:0.88rem;padding:0.45rem 1.1rem;border-radius:999px;border:1px solid var(--th-border);background:var(--th-surface,#eee);color:inherit;}" +
       ".priv-innerbar .priv-pill:hover{border-color:var(--th-accent);}" +
       ".priv-innerbar .priv-pill.active{background:var(--th-accent);border-color:var(--th-accent);color:var(--th-accent-text);font-weight:600;}" +
       ".priv-note{text-align:center;opacity:0.65;font-size:0.8rem;margin:0 auto 0.4rem;max-width:640px;}";
    document.head.appendChild(s);
  }
  function tabById(id) {
    for (var i = 0; i < PRIV_TABS.length; i++) if (PRIV_TABS[i].id === id) return PRIV_TABS[i];
    return null;
  }
  function build() {
    if (built) return;
    var bar = $("priv-subbar"), pane = $("priv-pane");
    if (!bar || !pane) return;
    css();
    built = true;
    paintPills();
    select(current);
  }
  function paintPills() {
    var bar = $("priv-subbar");
    if (!bar) return;
    while (bar.firstChild) bar.removeChild(bar.firstChild);
    PRIV_TABS.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "priv-pill" + (t.id === current ? " active" : "");
      b.textContent = (t.ico ? t.ico + " " : "") + t.label;
      b.addEventListener("click", function () { select(t.id); });
      bar.appendChild(b);
    });
  }
  var innerSel = {};
  function frameId(t, i) { return "priv-frame-" + t.id + "-" + i; }
  function wrapId(t, i) { return "priv-wrap-" + t.id + "-" + i; }
  function ensureFrame(t, e, i, stage) {
    var secName = e.label || t.label;
    var w = document.createElement("div");
    w.id = wrapId(t, i);
    if (e.type === "native") {
      stage.appendChild(w);
      renderNativeInto(e, w);
      return w;
    }
    var boot = document.createElement("div");
    boot.style.cssText = "text-align:center;opacity:0.7;padding:1.2rem;font-size:0.9rem;";
    boot.textContent = "Loading " + secName + "…";
    w.appendChild(boot);
    var f = document.createElement("iframe");
    f.id = frameId(t, i);
    f.className = "chat-frame";
    f.title = secName;
    f.setAttribute("allow", "clipboard-write; clipboard-read; fullscreen; autoplay; microphone; camera");
    f.addEventListener("load", function () { if (boot.parentNode) boot.parentNode.removeChild(boot); });
    w.appendChild(f);
    stage.appendChild(w);
    try { f.setAttribute("src", urlFor(e)); } catch (err) {}
    return w;
  }
  var nativeLoading = {};
  function renderNativeInto(e, w) {
    var mod = null;
    try { mod = e.render && window[e.render]; } catch (err) {}
    if (mod && mod.render) {
      try { mod.render(w); } catch (err2) { w.textContent = "Builder failed — try 🔄 Reload."; }
      return;
    }
    if (e.src && !w.dataset.srcTried && !nativeLoading[e.src]) {
      nativeLoading[e.src] = true;
      w.dataset.srcLoading = "1";
      w.textContent = "Loading " + (e.label || e.render || "module") + "…";
      var tries = 0;
      var settle = function (ok) {
        nativeLoading[e.src] = false;
        w.dataset.srcTried = "1";
        delete w.dataset.srcLoading;
        if (!ok) w.textContent = "Builder failed to load — try 🔄 Reload.";
        else renderNativeInto(e, w);
      };
      var poll = function () {
        var mod = null;
        try { mod = e.render && window[e.render]; } catch (err) {}
        if (mod && mod.render) { settle(true); return; }
        if (++tries >= 60) { settle(false); return; }
        setTimeout(poll, 250);
      };
      var s = document.createElement("script");
      s.src = e.src;
      s.onload = function () { poll(); };
      s.onerror = function () { settle(false); };
      document.body.appendChild(s);
      return;
    }
    if (e.src && w.dataset.srcLoading) { w.textContent = "Loading " + (e.label || e.render || "module") + "…"; return; }
    w.textContent = "Builder failed to load — try 🔄 Reload.";
  }
  function buildSingle(pane, t, e, i) {
    var secName = e.label || t.label;
    var h = document.createElement("div");
    h.style.cssText = "text-align:center;font-weight:600;font-size:1rem;margin:1rem auto 0.15rem;";
    h.textContent = secName;
    pane.appendChild(h);
    if (e.note) {
      var p = document.createElement("div");
      p.className = "priv-note";
      p.textContent = e.note;
      pane.appendChild(p);
    }
    var tools = document.createElement("div");
    tools.className = "priv-tools";
    var open = document.createElement("button");
    open.type = "button"; open.className = "pro-btn"; open.textContent = "↗ Open in new tab";
    open.title = "Open " + secName + " in its own browser tab";
    if (e.type === "native") open.style.display = "none";
    open.addEventListener("click", function () { try { window.open(pageFor(e), "_blank", "noopener"); } catch (err) {} });
    var reload = document.createElement("button");
    reload.type = "button"; reload.className = "pro-btn"; reload.textContent = "🔄 Reload";
    reload.title = "Reload the embedded generator";
    reload.addEventListener("click", function () {
      var f = $(frameId(t, i));
      if (f) { try { f.setAttribute("src", "about:blank"); } catch (err) {} setTimeout(function () { try { f.setAttribute("src", urlFor(e)); } catch (e2) {} }, 60); }
    });
    tools.appendChild(open); tools.appendChild(reload);
    pane.appendChild(tools);
    var stage = document.createElement("div");
    pane.appendChild(stage);
    ensureFrame(t, e, i, stage);
  }
  function select(id) {
    var t = tabById(id);
    if (!t) return;
    current = id;
    paintPills();
    var pane = $("priv-pane");
    if (!pane) return;
    while (pane.firstChild) pane.removeChild(pane.firstChild);
    var list = embedsOf(t);
    if (list.length < 2) {
      buildSingle(pane, t, list[0] || { label: t.label, gen: t.gen }, 0);
      return;
    }
    if (innerSel[t.id] === undefined) innerSel[t.id] = 0;
    var bar = document.createElement("div");
    bar.className = "priv-innerbar";
    pane.appendChild(bar);
    var note = document.createElement("div");
    note.className = "priv-note";
    pane.appendChild(note);
    var tools = document.createElement("div");
    tools.className = "priv-tools";
    var open = document.createElement("button");
    open.type = "button"; open.className = "pro-btn"; open.textContent = "↗ Open in new tab";
    var reload = document.createElement("button");
    reload.type = "button"; reload.className = "pro-btn"; reload.textContent = "🔄 Reload";
    tools.appendChild(open); tools.appendChild(reload);
    pane.appendChild(tools);
    var stage = document.createElement("div");
    pane.appendChild(stage);
    var active = function () { return Math.min(innerSel[t.id] || 0, list.length - 1); };
    var paintInner = function () {
      var ai = active();
      while (bar.firstChild) bar.removeChild(bar.firstChild);
      list.forEach(function (e, i) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "priv-pill" + (i === ai ? " active" : "");
        b.textContent = e.label || t.label;
        b.addEventListener("click", function () { innerSel[t.id] = i; paintInner(); });
        bar.appendChild(b);
      });
      var cur = list[ai];
      open.title = "Open " + (cur.label || t.label) + " in its own browser tab";
      open.style.display = cur.type === "native" ? "none" : "";
      note.textContent = cur.note || "";
      note.style.display = cur.note ? "" : "none";
      list.forEach(function (e, i) {
        var w = $(wrapId(t, i));
        if (i === ai && !w) w = ensureFrame(t, e, i, stage);
        if (w) w.hidden = (i !== ai);
      });
    };
    open.addEventListener("click", function () { try { window.open(pageFor(list[active()]), "_blank", "noopener"); } catch (err) {} });
    reload.addEventListener("click", function () {
      var i = active(), e = list[i];
      if (e.type === "native") {
        var w = $(wrapId(t, i));
        if (w) { while (w.firstChild) w.removeChild(w.firstChild); renderNativeInto(e, w); }
        else paintInner();
        return;
      }
      var f = $(frameId(t, i));
      if (!f) { paintInner(); return; }
      try { f.setAttribute("src", "about:blank"); } catch (err) {}
      setTimeout(function () { try { f.setAttribute("src", urlFor(e)); } catch (e2) {} }, 60);
    });
    paintInner();
  }
  window.ensurePrivate = function () {
    var app = $("private-app"), locked = $("priv-locked");
    if (!app) return;
    if (!authed()) {
      if (locked) locked.hidden = false;
      return;
    }
    if (locked) locked.hidden = true;
    build();
  };
  window.PrivateTabs = {
    list: function () { return PRIV_TABS.slice(); },
    select: select,
    add: function (t) {
      if (!t || !t.id || !t.label || (!t.gen && !t.embeds)) return false;
      for (var i = 0; i < PRIV_TABS.length; i++) if (PRIV_TABS[i].id === t.id) return false;
      if (t.embeds && t.embeds.length) {
        var em = t.embeds.filter(function (e) { return e && (e.gen || (e.type === "native" && e.render)); }).map(function (e) {
          var o = { label: String(e.label || t.label) };
          if (e.gen) o.gen = String(e.gen);
          if (e.type === "native") { o.type = "native"; o.render = String(e.render); if (e.id) o.id = String(e.id); if (e.src) o.src = String(e.src); }
          if (e.hash) o.hash = String(e.hash);
          if (e.note) o.note = String(e.note);
          return o;
        });
        if (!em.length) return false;
        PRIV_TABS.push({ id: String(t.id), label: String(t.label), ico: t.ico || "🔒", embeds: em });
      } else {
        var one = { id: String(t.id), label: String(t.label), ico: t.ico || "🔒", gen: String(t.gen) };
        if (t.hash) one.hash = String(t.hash);
        PRIV_TABS.push(one);
      }
      built = false;
      var pane = $("priv-pane"), bar = $("priv-subbar");
      if (bar) while (bar.firstChild) bar.removeChild(bar.firstChild);
      if (pane) while (pane.firstChild) pane.removeChild(pane.firstChild);
      if (authed()) { build(); }
      return true;
    }
  };
  function sync() {
    var b = $("i2p-tab-private");
    if (b) b.hidden = !authed();
    if (!authed() && window.__activeTab === "private" && window.showTab) window.showTab("home");
  }
  document.addEventListener("t2i-owner-auth", sync);
  window.addEventListener("focus", function () { try { sync(); } catch (e) {} });
  sync();
})();
