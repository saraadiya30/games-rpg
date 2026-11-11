// 👱‍♀️ Girls traits inside the Flux tab — merged Girls Generator features (the standalone
// Girls tab is deleted; this is where that engine lives now).
//
// The Girls Generator panel (src/girls-generator.js) owns the logic; this file owns the
// Flux-tab embedding. It renders the same trait dropdowns (boosters, character, Bestaigen
// set, body, scene, hair & face, outfit, pose & scene, extras, Genshin roster) into the Flux
// tab and contributes their text at compose time via FluxGirls.extra(), which prompt.js
// appends to the Flux base prompt.
//
// OVERLAP RULE (user direction: Flux wins): description, negative, art style, shape, image
// count, guidance/CFG, seed, resolution and the girls quality tails / anime bans / negative
// tail are NEVER taken from the girls side — Flux's own controls and prompt policy win.
// Only trait/booster/garment/outfit text plus the explicit extraNegative line are merged,
// and only when at least one trait is set (all-Default = pure Flux output, zero change).
// Traits are compose-time ("virtual"): they never write into #fluxDescTa, unlike the Flux
// prompt-tool boxes which edit the box text directly.
(function () {
  "use strict";
  if (window.FluxGirls) return;
  var LS_ON = "fluxtab_girlsOn"; // "0" = section disabled; anything else = enabled
  var sels = {}; // traitId -> <select>
  var secBuilt = false;

  function H() {
    try { return (window.GirlsGenerator && window.GirlsGenerator.helpers) || null; }
    catch (e) { return null; }
  }
  function D() {
    var h = H();
    if (!h) return null;
    try { return h.GG(); } catch (e) { return null; }
  }
  function SECTIONS() {
    try { return window.GirlsGenerator.SECTIONS || []; } catch (e) { return []; }
  }
  function traitIds() {
    var out = [], seen = {}, secs = SECTIONS();
    for (var i = 0; i < secs.length; i++) {
      var ids = secs[i][1] || [];
      for (var j = 0; j < ids.length; j++) {
        if (!seen[ids[j]]) { seen[ids[j]] = 1; out.push(ids[j]); }
      }
    }
    return out;
  }
  function el(tag, cls, text) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text !== undefined && text !== null) d.textContent = text;
    return d;
  }
  function enabled() {
    try { return localStorage.getItem(LS_ON) !== "0"; } catch (e) { return true; }
  }
  function setEnabled(on) {
    try { localStorage.setItem(LS_ON, on ? "1" : "0"); } catch (e) {}
  }
  // Flux-side trait persistence. INTENTIONALLY independent of the Girls tab's ggPanel_v1:
  // the shared data has different "untouched" semantics than Flux needs (notably perfectAnatomy,
  // whose first option is "On"), so each tab keeps its own selections and defaults.
  var LS_TRAITS = "fluxtab_girlsTraits_v1"; // { traitId: selectedIndex }
  function loadSaved() {
    try {
      var o = JSON.parse(localStorage.getItem(LS_TRAITS) || "{}");
      return (o && typeof o === "object") ? o : {};
    } catch (e) { return {}; }
  }
  function saveTraits() {
    var cur = {};
    Object.keys(sels).forEach(function (id) { cur[id] = sels[id].selectedIndex; });
    try { localStorage.setItem(LS_TRAITS, JSON.stringify(cur)); } catch (e) {}
  }
  // First "does nothing" option of a def: no random pool and blank/"," text ("," is the
  // data's explicit no-op marker — the Girls tab's own compose filters it the same way).
  // Used as the fresh default so untouched Flux output never changes (e.g. perfectAnatomy
  // is "On"-first in the data but defaults to "Off" here — Flux wins on overlap).
  function defaultIndex(def) {
    var opts = (def && def.opts) || [];
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      if (o && o.r) continue;
      var t = String(o && o.p == null ? "" : o.p).trim();
      if (t === "" || t === ",") return i;
    }
    return 0;
  }
  function refreshFlux() {
    try { if (typeof window.__fluxTabRefresh === "function") window.__fluxTabRefresh(); } catch (e) {}
  }
  function css() {
    if (document.getElementById("ggCssFlux")) return;
    // Mirrors #ggCss from src/girls-generator.js (same .gg-* classes, so trait rows look
    // identical in both tabs) plus two Flux-embed-only rules at the end.
    var s = document.createElement("style");
    s.id = "ggCssFlux";
    s.textContent =
      ".gg-wrap{max-width:800px;margin:0 auto;text-align:left;}" +
      ".gg-top{display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;margin:0.2rem auto 0.6rem;}" +
      ".gg-btn{cursor:pointer;font:inherit;font-size:0.85rem;padding:0.45rem 1.1rem;border-radius:999px;border:1px solid var(--th-border,#555);background:var(--th-surface,#222);color:inherit;white-space:nowrap;}" +
      ".gg-btn:hover{border-color:var(--th-accent);}" +
      ".gg-desc{width:100%;box-sizing:border-box;min-height:4.5rem;font:inherit;font-size:0.85rem;padding:0.5rem 0.6rem;border-radius:10px;background:var(--th-field,#101014);color:inherit;border:1px solid var(--th-border,#3a3a42);margin-bottom:0.4rem;}" +
      ".gg-optrow{display:flex;gap:0.5rem;flex-wrap:wrap;margin:0 0 0.6rem;}" +
      ".gg-optrow select{flex:1;min-width:140px;}" +
      ".gg-sec{border:1px solid var(--th-border,#3a3a42);border-radius:10px;margin-bottom:0.4rem;background:var(--th-surface,#1d1d22);}" +
      ".gg-sec>summary{cursor:pointer;padding:0.5rem 0.7rem;font-weight:700;font-size:0.9rem;list-style:none;}" +
      ".gg-sec>summary::-webkit-details-marker{display:none;}" +
      ".gg-secbody{padding:0 0.5rem 0.5rem;}" +
      ".gg-row{display:flex;align-items:center;gap:0.5rem;border-top:1px solid var(--th-border,#3a3a42);padding:0.3rem 0.2rem;}" +
      ".gg-label{flex:0 0 168px;font-size:0.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0.9;}" +
      ".gg-sel{flex:1;min-width:0;font:inherit;font-size:0.85rem;padding:0.35rem;border-radius:8px;background:var(--th-field,#101014);color:inherit;border:1px solid var(--th-border,#3a3a42);}" +
      ".gg-dice{flex:0 0 auto;cursor:pointer;font:inherit;font-size:1rem;background:transparent;border:1px solid var(--th-border,#3a3a42);border-radius:8px;padding:0.25rem 0.5rem;color:inherit;}" +
      ".gg-dice:hover{border-color:var(--th-accent);}" +
      "@media (max-width:560px){.gg-label{flex:0 0 118px;font-size:0.76rem;}}" +
      ".flux-girls{border:1px solid var(--th-border,#3a3a42);border-radius:12px;margin:0.7rem 0;padding:0.1rem 0.6rem 0.6rem;background:var(--th-surface,#1d1d22);}" +
      ".flux-girls>summary{cursor:pointer;font-weight:700;font-size:0.95rem;padding:0.55rem 0.2rem;}" +
      ".flux-girls-hint{font-size:0.78rem;opacity:0.65;margin:0.1rem 0 0.5rem;line-height:1.45;}";
    document.head.appendChild(s);
  }
  function rawOpt(id) {
    var s = sels[id];
    if (!s) return null;
    var d = D();
    if (!d) return null;
    var def = (d.inputs[id] === undefined ? d.inputs.extras : d.inputs[id]) || null;
    if (!def) return null;
    return (def.opts || [])[s.selectedIndex] || null;
  }
  // Meaningful text of a selected option: "" when it contributes nothing (Default / No /
  // Off, or the data's "," no-op marker). A 🎲 Random pool counts as active (re-rolls per image).
  function optActiveText(opt) {
    if (!opt) return "";
    if (opt.r) return "RANDOM";
    var t = String(opt.p == null ? "" : opt.p).trim();
    if (t === "" || t === ",") return "";
    return t;
  }
  function hasTraits() {
    var ids = traitIds();
    for (var i = 0; i < ids.length; i++) {
      var s = sels[ids[i]];
      if (!s) continue;
      if (optActiveText(rawOpt(ids[i])) !== "") return true;
    }
    return false;
  }
  // Build the girls-side ui object the helpers expect. Flux-owned fields are filled from
  // the Flux tab itself (desc text for context, active style name for glossy/mika checks —
  // Flux styles are never glossy, so those branches correctly stay dormant).
  function buildUI(descText, activeStyle) {
    var h = H(), d = D();
    if (!h || !d) return null;
    var ui = { descText: String(descText || ""), negText: "", styleName: String(activeStyle || "no style") };
    var ids = traitIds();
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i], opt = rawOpt(id);
      var resolved = null;
      try { resolved = h.resolveOpt(opt); } catch (e) { resolved = null; }
      ui[id] = resolved;
      if (id === "makeup") ui.makeupName = opt ? (opt.n || "") : "";
    }
    ["clothes", "clothesTop", "clothesBottom", "view", "realism", "genshinRealism", "progressive", "detail", "perfectAnatomy", "extraNegative", "genshinChar"].forEach(function (k) {
      if (!ui[k]) ui[k] = { n: "", p: "" };
    });
    return ui;
  }
  // The merged contribution. Returns {prompt, negative} — both "" when disabled, when the
  // data/helpers are missing, or when every trait is Default (pure Flux output, zero change).
  // 🎲 Random traits re-roll on every call, i.e. per image, exactly like the Girls tab.
  function extra(descText, activeStyle) {
    var empty = { prompt: "", negative: "" };
    if (!enabled()) return empty;
    var h = H();
    if (!h) return empty;
    var ui;
    try { ui = buildUI(descText, activeStyle); } catch (e) { return empty; }
    if (!ui) return empty;
    try {
      if (!hasTraits()) return empty;
      var parts = [
        h.undressClause(ui),
        h.clothingPrompt(ui),
        h.viewFraming(ui),
        h.userChoicesBlock(ui),
        h.genshinText(ui),
        h.realismSlot(ui),
        h.genshinSlot(ui),
        h.boosterFilter(ui, h.selText(ui.progressive)),
        h.detailSlot(ui),
        h.selText(ui.perfectAnatomy),
        h.undressEcho(ui),
        h.garmentEcho(ui),
        h.userChoicesEcho(ui)
      ];
      var prompt = parts.filter(function (p) { return p && String(p).trim() !== ""; }).join(" ").replace(/\s{2,}/g, " ").trim();
      var negText = String(h.selText(ui.extraNegative) || "").trim();
      if (negText === "" || negText === ",") negText = ""; // data no-op marker (same filter Girls compose uses)
      return { prompt: prompt, negative: negText };
    } catch (e) { return empty; }
  }
  function randomizeSel(s) {
    if (!s || s.options.length < 2) return;
    s.selectedIndex = 1 + Math.floor(Math.random() * (s.options.length - 1));
  }
  function randomizeAll() {
    Object.keys(sels).forEach(function (id) { randomizeSel(sels[id]); });
    saveTraits();
    refreshFlux();
  }
  function clearAll() {
    var d = D();
    Object.keys(sels).forEach(function (id) {
      var def = d ? (d.inputs[id] || d.inputs.extras) : null;
      sels[id].selectedIndex = def ? defaultIndex(def) : 0;
    });
    saveTraits();
    refreshFlux();
  }
  function randomPromptIntoDesc() {
    var h = H();
    var ta = document.querySelector("#fluxDescTa");
    if (!h || !ta) return;
    var t = "";
    try { t = h.randomTemplate(); } catch (e) { t = ""; }
    if (!t) return;
    ta.value = t;
    try { ta.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
    refreshFlux();
  }
  function render(host) {
    css();
    while (host.firstChild) host.removeChild(host.firstChild);
    var h = H(), d = D();
    if (!h || !d || !d.inputs || !d.inputs.age) {
      host.appendChild(el("div", "flux-status", "Girls traits failed to load — try 🔄 Reload."));
      return;
    }
    var det = document.createElement("details");
    det.className = "flux-girls";
    det.id = "fluxGirlsBox";
    det.open = true;
    var sum = document.createElement("summary");
    sum.textContent = "👱‍♀️ Girls traits (from Girls Generator)";
    det.appendChild(sum);
    var hint = el("div", "flux-girls-hint",
      "Same trait engine as the former Girls Generator tab (merged here) — boosters, character, Bestaigen set, body, outfits, poses, extras, Genshin roster. " +
      "Flux wins on overlap: description, negative, style, shape, count, CFG, seed and quality policy stay Flux's; traits append at generate time and do nothing while all Default.");
    det.appendChild(hint);
    var onRow = el("div", "flux-row");
    var onBox = document.createElement("input");
    onBox.type = "checkbox";
    onBox.id = "flux-girls-on";
    onBox.checked = enabled();
    onBox.addEventListener("change", function () { setEnabled(onBox.checked); refreshFlux(); });
    var onLab = document.createElement("label");
    onLab.htmlFor = "flux-girls-on";
    onLab.textContent = " Girls traits enabled";
    onRow.appendChild(onBox);
    onRow.appendChild(onLab);
    det.appendChild(onRow);
    var top = el("div", "gg-top");
    var rnd = el("button", "gg-btn", "🎲 All Random");
    rnd.type = "button";
    rnd.addEventListener("click", randomizeAll);
    var clr = el("button", "gg-btn", "🧹 Clear All");
    clr.type = "button";
    clr.addEventListener("click", clearAll);
    top.appendChild(rnd);
    top.appendChild(clr);
    det.appendChild(top);
    sels = {};
    secBuilt = true;
    var st = loadSaved();
    SECTIONS().forEach(function (sec, si) {
      var dets = document.createElement("details");
      dets.className = "gg-sec";
      if (si < 2) dets.open = true;
      dets.appendChild(el("summary", null, sec[0]));
      var body = el("div", "gg-secbody");
      (sec[1] || []).forEach(function (id) {
        var def = d.inputs[id] || d.inputs.extras;
        if (!def) return;
        var row = el("div", "gg-row");
        row.appendChild(el("span", "gg-label", def.label));
        var s = document.createElement("select");
        s.className = "gg-sel";
        s.dataset.ggTrait = id;
        (def.opts || []).forEach(function (o) { s.appendChild(new Option(o.n, o.n)); });
        var sv = st[id];
        if (typeof sv === "number" && sv >= 0 && sv < s.options.length) s.selectedIndex = sv;
        else s.selectedIndex = defaultIndex(def);
        s.addEventListener("change", function () { saveTraits(); refreshFlux(); });
        sels[id] = s;
        row.appendChild(s);
        var dice = el("button", "gg-dice", "🎲");
        dice.type = "button";
        dice.title = "Randomize " + def.label;
        dice.addEventListener("click", function () { randomizeSel(s); saveTraits(); refreshFlux(); });
        row.appendChild(dice);
        body.appendChild(row);
      });
      dets.appendChild(body);
      det.appendChild(dets);
    });
    host.appendChild(det);
  }
  window.FluxGirls = {
    render: render,
    extra: extra,
    hasTraits: hasTraits,
    isEnabled: enabled,
    randomPromptIntoDesc: randomPromptIntoDesc,
    randomizeAll: randomizeAll,
    clearAll: clearAll
  };
})();
