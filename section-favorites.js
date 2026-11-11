/* ===== ⭐ Section favorites (Image Generator tab) ================================
   Every framework dropdown in the Image Generator (#i2p-imggen select[data-name]:
   🎨 Art Styles 1–5, mixers, shape/count, and all ~40 clause selects) gets a small
   star button beside it. Starring the current selection pins that item to the TOP
   of its section's list (marked with a ★ prefix); unstarring returns it to its
   normal spot. Favorites persist per section in localStorage (`t2iSectionFavsV1`)
   and the remembered selection is never disturbed (pin/unpin preserves value).

   Cooperates with:
     • artstyle-search.js — its filter rebuilds order favorites-first via
       `window.__sectionFavs.orderValues()`, and it re-snapshots through
       `window.__asSearchOnFavsChanged()` so pins survive filtering.
     • gen-reset.js — reset-to-default reads `canonValues()` so ↺ Reset all
       still picks true defaults (🎲 Random, None, Not set…) instead of the
       first pinned favorite.
     • style-hints.js — options are MOVED (never recreated), so hover titles
       ride along; ★ prefixes are stored/restored via a data attribute.
   Non-favoritable control options (None, Not set, 🎲 Random, ── separators ──,
   disabled headers) can't be starred and always keep their relative order in
   the unpinned block. No imports, no framework changes.
   ============================================================================ */
(function () {
  "use strict";

  var GEN = "#i2p-imggen ";
  var LS_KEY = "t2iSectionFavsV1";
  var MAX_PER_SECTION = 60;
  var STAR = "★ ";

  var SENTINEL_VALUES = { "": true, "__random__": true, "None": true };

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      if (d && d.favs && typeof d.favs === "object") return d.favs;
    } catch (e) {}
    return {};
  }
  var favs = load();
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ v: 1, favs: favs })); } catch (e) {}
  }

  function cleanLabel(t) {
    t = String(t == null ? "" : t);
    return t.indexOf(STAR) === 0 ? t.slice(STAR.length) : t;
  }

  function optLabel(o) { return cleanLabel(o.text || o.textContent || ""); }

  function isSentinelOpt(o) {
    try {
      if (o.disabled) return true;
      if (SENTINEL_VALUES[String(o.value)]) return true;
      var t = optLabel(o);
      if (!t) return true;
      if (t.charAt(0) === "🎲") return true;
      if (t === "— off —") return true;
      if (/^─+/.test(t)) return true;
    } catch (e) { return true; }
    return false;
  }

  function favoritable(o) { return !isSentinelOpt(o); }

  function getFavs(name) {
    var a = favs[name];
    return Array.isArray(a) ? a.slice() : [];
  }

  function setFavs(name, arr) {
    favs[name] = arr.slice(0, MAX_PER_SECTION);
    save();
  }

  function isFav(name, value) {
    return getFavs(name).indexOf(String(value)) >= 0;
  }

  function ensureCanon(sel) {
    if (sel._favCanon) return sel._favCanon;
    var canon = [];
    try {
      for (var i = 0; i < sel.options.length; i++) canon.push(String(sel.options[i].value));
    } catch (e) {}
    sel._favCanon = canon;
    return canon;
  }

  function isFiltered(sel) {
    try {
      var row = sel._asRow;
      if (row && row.isConnected) {
        var inp = row.querySelector(".as-input");
        if (inp && inp.value) return true;
      }
    } catch (e) {}
    return false;
  }

  function paint(o, starred) {
    try {
      var cur = String(o.textContent == null ? "" : o.textContent);
      if (starred) {
        if (cur.indexOf(STAR) !== 0) {
          o.setAttribute("data-sf-orig", cur);
          o.textContent = STAR + cleanLabel(cur);
        }
      } else if (cur.indexOf(STAR) === 0) {
        var orig = o.getAttribute("data-sf-orig");
        o.textContent = orig != null ? orig : cleanLabel(cur);
        o.removeAttribute("data-sf-orig");
      }
    } catch (e) {}
  }

  function optionMap(sel) {
    var map = {};
    try {
      for (var i = 0; i < sel.options.length; i++) map[String(sel.options[i].value)] = sel.options[i];
    } catch (e) {}
    return map;
  }

  function pinSelect(sel) {
    if (!sel || !sel.options) return false;
    var name = sel.getAttribute && sel.getAttribute("data-name");
    if (!name) return false;
    ensureCanon(sel);
    var map = optionMap(sel);
    var list = getFavs(name);
    var filtered = isFiltered(sel);
    if (!filtered) {
      // Sync canon with any framework-added options; prune dead favorites.
      // (Skipped while a search filter narrows the DOM — the subset on screen
      // is not the full list, so pruning then would delete valid favorites.)
      var canon = sel._favCanon || [];
      var have = {};
      for (var i = 0; i < canon.length; i++) have[canon[i]] = true;
      for (var j = 0; j < sel.options.length; j++) {
        var v = String(sel.options[j].value);
        if (!have[v]) { have[v] = true; canon.push(v); }
      }
      var pruned = list.filter(function (fv) { return Object.prototype.hasOwnProperty.call(map, fv); });
      if (pruned.length !== list.length) { list = pruned; setFavs(name, list); }
    } else {
      list = list.filter(function (fv) { return Object.prototype.hasOwnProperty.call(map, fv); });
    }
    var cur = sel.value;
    var seen = {};
    var frag = document.createDocumentFragment();
    function push(v, starred) {
      if (seen[v]) return;
      var o = map[v];
      if (!o) return;
      seen[v] = true;
      paint(o, starred);
      frag.appendChild(o);
    }
    for (var k = 0; k < list.length; k++) push(String(list[k]), true);
    var canonVals = sel._favCanon || [];
    for (var m = 0; m < canonVals.length; m++) {
      var cv = String(canonVals[m]);
      if (list.indexOf(cv) < 0) push(cv, false);
    }
    // Leftovers (options absent from canon — e.g. visible during filtering).
    var opts = null;
    try { opts = Array.prototype.slice.call(sel.options); } catch (e) { opts = []; }
    for (var n = 0; n < opts.length; n++) {
      var ov = String(opts[n].value);
      if (!seen[ov]) { seen[ov] = true; paint(opts[n], false); frag.appendChild(opts[n]); }
    }
    try { sel.appendChild(frag); } catch (e) { return false; }
    try { sel.value = cur; } catch (e) {}
    refreshBtn(sel);
    return true;
  }

  // Order a search-module style [{v,t,d}] list favorites-first (stable).
  function orderValues(name, arr) {
    var list = getFavs(name);
    if (!list.length) return arr;
    var rank = {};
    for (var i = 0; i < list.length; i++) if (rank[list[i]] === undefined) rank[list[i]] = i;
    var f = [], rest = [];
    for (var j = 0; j < arr.length; j++) {
      if (Object.prototype.hasOwnProperty.call(rank, String(arr[j].v))) f.push(arr[j]);
      else rest.push(arr[j]);
    }
    f.sort(function (a, b) { return rank[String(a.v)] - rank[String(b.v)]; });
    return f.concat(rest);
  }

  // Canonical (unpinned) option values for a select — used by ↺ Reset all so
  // it restores true defaults instead of the first pinned favorite.
  function canonValues(sel) {
    try {
      ensureCanon(sel);
      var map = optionMap(sel);
      return (sel._favCanon || []).filter(function (v) {
        return Object.prototype.hasOwnProperty.call(map, v);
      });
    } catch (e) { return []; }
  }

  function selectedOpt(sel) {
    try {
      var ix = sel.selectedIndex;
      if (ix >= 0 && sel.options[ix]) return sel.options[ix];
    } catch (e) {}
    return null;
  }

  function refreshBtn(sel) {
    var btn = sel._sfBtn;
    if (!btn || !btn.isConnected) return;
    var name = sel.getAttribute("data-name");
    var o = selectedOpt(sel);
    if (!o || !favoritable(o)) {
      btn.className = "sf-btn na";
      btn.textContent = "☆";
      btn.setAttribute("aria-pressed", "false");
      btn.title = "This default option can't be favorited — pick a real entry to star it";
      return;
    }
    var on = isFav(name, String(o.value));
    btn.className = "sf-btn " + (on ? "on" : "off");
    btn.textContent = on ? "★" : "☆";
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.title = on
      ? "Unfavorite “" + optLabel(o) + "” — returns it to its normal spot"
      : "Favorite “" + optLabel(o) + "” — pins it to the top of this list";
  }

  function toggleCurrent(sel) {
    var name = sel.getAttribute("data-name");
    var o = selectedOpt(sel);
    if (!name || !o || !favoritable(o)) return false;
    var v = String(o.value);
    var list = getFavs(name);
    var ix = list.indexOf(v);
    if (ix >= 0) list.splice(ix, 1);
    else list.unshift(v); // newest favorite goes to the very top
    setFavs(name, list);
    pinSelect(sel);
    try {
      if (typeof window.__asSearchOnFavsChanged === "function") window.__asSearchOnFavsChanged(name);
    } catch (e) {}
    try {
      document.dispatchEvent(new CustomEvent("t2i-section-favs-changed", { detail: { name: name, value: v } }));
    } catch (e) {}
    try {
      var msg = ix >= 0 ? "☆ Unfavorited — back to its normal spot" : "★ Favorited — pinned to the top of this list";
      if (typeof window.vaultToast === "function") window.vaultToast(msg);
    } catch (e) {}
    return true;
  }

  function ensureCss() {
    if (document.getElementById("sf-favs-css")) return;
    var st = document.createElement("style");
    st.id = "sf-favs-css";
    st.textContent =
      "#i2p-imggen .sf-wrap{display:flex;align-items:center;gap:0.35rem;width:100%;min-width:0;}" +
      "#i2p-imggen .sf-wrap>select{flex:1 1 auto;min-width:0;}" +
      "#i2p-imggen .sf-btn{flex:none;cursor:pointer;font:inherit;font-size:0.85rem;line-height:1;" +
        "border:1px solid var(--th-border,#ccc);background:var(--th-surface,#eee);color:inherit;" +
        "border-radius:999px;width:1.7rem;height:1.7rem;display:inline-flex;align-items:center;" +
        "justify-content:center;padding:0;}" +
      "#i2p-imggen .sf-btn:hover{border-color:var(--th-accent,#2b6bf0);}" +
      "#i2p-imggen .sf-btn.on{color:#e8a100;border-color:#e8a100;}" +
      "#i2p-imggen .sf-btn.off{opacity:0.45;}" +
      "#i2p-imggen .sf-btn.na{opacity:0.25;cursor:default;}";
    document.head.appendChild(st);
  }

  function initSelect(sel) {
    if (!sel || sel._sfInit) return false;
    if (!sel.getAttribute || !sel.getAttribute("data-name")) return false;
    if (!sel.options || !sel.options.length) return false;
    var wrap = sel.closest && sel.closest(".input-wrapper");
    if (!wrap) return false;
    sel._sfInit = true;
    ensureCanon(sel);
    ensureCss();
    var line = document.createElement("span");
    line.className = "sf-wrap";
    try {
      sel.parentNode.insertBefore(line, sel);
      line.appendChild(sel);
    } catch (e) { sel._sfInit = false; return false; }
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sf-btn off";
    btn.textContent = "☆";
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", "Favorite the current selection");
    btn.addEventListener("click", function () { toggleCurrent(sel); });
    line.appendChild(btn);
    sel._sfBtn = btn;
    try {
      sel.addEventListener("change", function () { refreshBtn(sel); });
    } catch (e) {}
    pinSelect(sel);
    return true;
  }

  function sweep() {
    var n = 0;
    try {
      var sels = $all(GEN + "select[data-name]");
      for (var i = 0; i < sels.length; i++) {
        try { if (initSelect(sels[i])) n++; }
        catch (e) {}
      }
    } catch (e) {}
    return n;
  }

  function frameworkInitDone() {
    try {
      var u = window.___userSettings746291937;
      return !!(u && u.userInputs && u.userInputs.artStyle && u.userInputs.artStyle._element);
    } catch (e) { return false; }
  }

  window.__sectionFavs = {
    getFavs: getFavs,
    isFav: isFav,
    pinSelect: pinSelect,
    orderValues: orderValues,
    canonValues: canonValues,
    cleanLabel: cleanLabel,
    toggleCurrent: toggleCurrent
  };

  function boot() {
    if (!frameworkInitDone()) return false;
    sweep();
    try {
      new MutationObserver(function (muts) {
        var hit = false;
        for (var i = 0; i < muts.length; i++) {
          var added = muts[i].addedNodes;
          for (var j = 0; j < (added ? added.length : 0); j++) {
            var nd = added[j];
            if (!nd || nd.nodeType !== 1) continue;
            if (nd.tagName === "SELECT" && nd.getAttribute("data-name")) { hit = true; break; }
            try {
              if (nd.querySelector && nd.querySelector("select[data-name]")) { hit = true; break; }
            } catch (e) {}
          }
          if (hit) break;
        }
        if (hit) sweep();
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
    return true;
  }

  if (boot()) return;
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    try {
      if (boot()) { clearInterval(timer); return; }
    } catch (e) {}
    if (tries > 200) clearInterval(timer);
  }, 300);
})();
