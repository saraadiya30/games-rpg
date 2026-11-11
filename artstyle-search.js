/* ===== 🔍 Section search (Image Generator tab) ==================================
   The framework renders every section (Art Style 1-5, Character, mixers, and
   ~40 clause dropdowns) as a native <select> with no search — some with 2000+
   options. This IIFE inserts a filter box above EVERY such select inside
   #i2p-imggen that has MIN_OPTIONS or more: typing narrows the dropdown to
   substring matches, Enter picks the first matching enabled option,
   Escape/✖ restores the full list. The current selection is always preserved
   (re-prepended when it doesn't match), and no change event is fired while
   filtering — only an explicit Enter-pick goes through the framework's own
   change plumbing (`window.__fireFrameworkInput`, falling back to a change
   event), so `window.input.*`, remember-me and random-style logic are
   untouched. Boxes are inserted only AFTER the framework's one-shot init
   (gated on `userInputs.artStyle._element` — init loops over every input in
   its container and crashes on elements without a framework data-name).
   Re-attaches if the framework re-renders a select. No imports, no
   persistence.
   ============================================================================= */
(function () {
  "use strict";

  var MIN_OPTIONS = 25; // smaller dropdowns (shape, mixers 1-3, ...) are faster to eyeball
  var GEN = "#i2p-imggen ";

  var attached = {}; // data-name -> {resnap} for the favorites module

  function $(s, r) { return (r || document).querySelector(s); }

  // Compact theme-aware styling for the filter rows. Without this the rows
  // render as unstyled block divs (icon + full-width input stacked loosely),
  // which pushes each select down unevenly and makes the ✏️/🎨/🖼️ sections
  // look offset from their cards. The rows stack neatly above their select
  // inside the existing .input-wrapper (flex column), using only theme vars.
  function ensureCss() {
    if (document.getElementById("as-search-css")) return;
    var st = document.createElement("style");
    st.id = "as-search-css";
    st.textContent =
      "#i2p-imggen .input-wrapper{display:flex;flex-direction:column;gap:0.3rem;}" +
      "#i2p-imggen .as-search{display:flex;align-items:center;gap:0.35rem;min-width:0;" +
        "width:100%;max-width:100%;box-sizing:border-box;}" +
      "#i2p-imggen .as-search .as-ico{flex:none;opacity:0.55;font-size:0.8rem;}" +
      "#i2p-imggen .as-search .as-input{flex:1 1 auto;min-width:0;box-sizing:border-box;" +
        "padding:0.32rem 0.5rem;font-size:0.78rem;font-family:inherit;color:inherit;" +
        "background:var(--th-field, #fff);border:1px solid var(--th-border, #ccc);border-radius:8px;outline:none;}" +
      "#i2p-imggen .as-search .as-input:focus{border-color:var(--th-accent, #2b6bf0);" +
        "box-shadow:0 0 0 3px var(--th-accent-soft, rgba(43,107,240,0.15));}" +
      "#i2p-imggen .as-search .as-input::placeholder{opacity:0.55;}" +
      "#i2p-imggen .as-search .as-clear{flex:none;cursor:pointer;font:inherit;font-size:0.7rem;" +
        "border:1px solid var(--th-border, #ccc);background:var(--th-surface, #eee);color:inherit;" +
        "border-radius:999px;padding:0.15rem 0.45rem;line-height:1.2;}" +
      "#i2p-imggen .as-search .as-clear:hover{border-color:var(--th-accent, #2b6bf0);}" +
      "#i2p-imggen .as-search .as-clear[hidden]{display:none;}" +
      "#i2p-imggen .as-search .as-count{flex:none;font-size:0.68rem;opacity:0.6;white-space:nowrap;}" +
      "@media (max-width:700px){#i2p-imggen .input-wrapper .as-search .as-input{font-size:16px;}}" +
      "@media (max-width:700px){" +
      "#i2p-imggen .as-search{flex-wrap:wrap;row-gap:0.15rem;}" +
      "#i2p-imggen .as-search .as-ico{display:none;}" +
      "#i2p-imggen .as-search .as-input{flex:1 1 8rem;}" +
      "#i2p-imggen .as-search .as-clear[hidden]{display:inline-block !important;visibility:hidden;}" +
      "#i2p-imggen .as-search .as-clear{visibility:visible;}" +
      "#i2p-imggen .as-search .as-count{flex:1 1 100%;text-align:right;}" +
      "#i2p-imggen .as-search .as-count:empty{display:none;}}";
    document.head.appendChild(st);
  }

  // The framework's one-shot init (~100ms after render) loops over every
  // input/select/textarea inside its container and crashes on any element
  // without a framework data-name (it sets `userInputs[name]._element`). Our
  // search boxes live inside that container, so they must only be inserted
  // AFTER init has run. `userInputs.artStyle._element` being set is the signal
  // that those loops are done (they all run synchronously after it, in one
  // task).
  function frameworkInitDone() {
    try {
      var u = window.___userSettings746291937;
      return !!(u && u.userInputs && u.userInputs.artStyle && u.userInputs.artStyle._element);
    } catch (e) { return false; }
  }

  function fireChange(sel) {
    try {
      if (typeof window.__fireFrameworkInput === "function") {
        window.__fireFrameworkInput(sel);
        return;
      }
    } catch (e) {}
    try { sel.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
  }

  function prettyNoun(name) {
    // artStyle -> "art style", mixPro1 -> "mix pro 1", distinguishingFeatures -> "distinguishing features"
    return String(name || "options")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([A-Za-z]+)(\d+)/g, "$1 $2")
      .toLowerCase();
  }

  function snapshot(sel) {
    // Favorites (section-favorites.js) prefix pinned options with "★ " — strip
    // it so filtering/matching always runs against the real display name.
    return [...sel.options].map(function (o) {
      var t = String(o.text == null ? "" : o.text);
      if (t.indexOf("★ ") === 0) t = t.slice(2);
      return { v: o.value, t: t, d: !!o.disabled };
    });
  }

  function rebuild(sel, all, matches, keepValue) {
    var seen = {};
    var list = matches.slice();
    // An empty filtered list leaves a blank, broken-looking dropdown — show
    // an explicit disabled placeholder instead (Enter skips disabled options,
    // ✖/Escape restores the full list).
    if (!list.length && (keepValue == null || keepValue === "")) {
      list = [{ v: "", t: "— no matches —", d: true }];
    }
    // Favorites first: pinned items stay on top even while filtering.
    try {
      if (window.__sectionFavs) list = window.__sectionFavs.orderValues(sel.getAttribute("data-name"), list);
    } catch (e) {}
    if (keepValue != null && keepValue !== "" && !matches.some(function (m) { return m.v === keepValue; })) {
      var cur = all.filter(function (m) { return m.v === keepValue; })[0];
      if (cur) list.unshift(cur);
    }
    sel.innerHTML = "";
    list.forEach(function (m) {
      if (seen[m.v]) return;
      seen[m.v] = true;
      var o = document.createElement("option");
      o.value = m.v;
      o.textContent = m.t;
      if (m.d) o.disabled = true;
      sel.appendChild(o);
    });
    try { sel.value = keepValue; } catch (e) {}
    // Paint ★ markers + enforce pin order (rebuild creates fresh option
    // elements from plain {v,t,d} data, so do it here, not just in pinSelect).
    try { if (window.__sectionFavs) window.__sectionFavs.pinSelect(sel); } catch (e) {}
  }

  function attach(sel) {
    if (sel._asRow && sel._asRow.isConnected) return;
    var wrap = sel.closest(".input-wrapper") || sel.parentElement;
    if (!wrap) return;
    // A framework re-render can orphan a previous row inside a surviving
    // wrapper — drop it before wiring a fresh one so boxes never double up.
    var stale = wrap.querySelector(":scope > .as-search");
    if (stale && stale !== sel._asRow) { try { stale.remove(); } catch (e) {} }
    if (sel._asRow && sel._asRow.isConnected) return;
    var box = { all: snapshot(sel) };
    var all = box.all;
    var total = all.length;
    var noun = prettyNoun(sel.getAttribute("data-name"));

    var row = document.createElement("div");
    row.className = "as-search";
    row.innerHTML =
      '<span class="as-ico" aria-hidden="true">🔍</span>' +
      '<input type="text" class="as-input" placeholder="Search ' + total + " " + noun + '…" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="search" enterkeyhint="search" aria-label="Search ' + noun + '">' +
      '<button type="button" class="as-clear" title="Clear search" hidden>✖</button>' +
      '<span class="as-count" aria-live="polite"></span>';
    wrap.insertBefore(row, sel);
    sel._asRow = row;

    var input = row.querySelector(".as-input");
    var clear = row.querySelector(".as-clear");
    var count = row.querySelector(".as-count");

    function paintCount(n) {
      if (!input.value) { count.textContent = ""; return; }
      count.textContent = n === 0 ? "no match" : n + " of " + box.all.length;
    }

    function apply() {
      var q = input.value.trim().toLowerCase();
      clear.hidden = !input.value;
      if (!q) {
        rebuild(sel, box.all, box.all, sel.value);
        paintCount(0);
        return;
      }
      var matches = box.all.filter(function (m) { return m.t.toLowerCase().indexOf(q) >= 0; });
      rebuild(sel, box.all, matches, sel.value);
      paintCount(matches.length);
    }

    function reset(focusInput) {
      input.value = "";
      clear.hidden = true;
      rebuild(sel, box.all, box.all, sel.value);
      paintCount(0);
      if (focusInput) input.focus();
    }

    input.addEventListener("input", apply);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        // Prefer the first MATCHING enabled option (the preserved current
        // selection is prepended even when it doesn't match — skip it).
        var q = input.value.trim().toLowerCase();
        var first = null, fallback = null;
        for (var i = 0; i < sel.options.length; i++) {
          var o = sel.options[i];
          if (o.disabled) continue;
          if (!fallback) fallback = o;
          if (q && o.text.toLowerCase().indexOf(q) >= 0) { first = o; break; }
        }
        first = first || fallback;
        if (first && sel.value !== first.value) {
          sel.value = first.value;
          fireChange(sel);
        }
      } else if (e.key === "Escape") {
        if (input.value) { e.preventDefault(); reset(false); input.blur(); }
      }
    });
    clear.addEventListener("click", function () { reset(true); });
    // If the user picks from the filtered dropdown, keep the filter so they
    // can keep choosing among matches; ✖ restores the full list.
    paintCount(0);
    try {
      attached[sel.getAttribute("data-name")] = {
        resnap: function () {
          // Favorites changed: clear any active filter, re-pin to canonical
          // favorite order, then re-capture the snapshot from the live DOM.
          input.value = "";
          clear.hidden = true;
          rebuild(sel, box.all, box.all, sel.value);
          try { if (window.__sectionFavs) window.__sectionFavs.pinSelect(sel); } catch (e) {}
          box.all = snapshot(sel);
          try { input.placeholder = "Search " + box.all.length + " " + noun + "…"; } catch (e2) {}
          count.textContent = "";
        }
      };
    } catch (e) {}
  }

  // Called by section-favorites.js after any star/unstar.
  window.__asSearchOnFavsChanged = function (name) {
    try {
      var r = attached[name];
      if (r && r.resnap) r.resnap();
    } catch (e) {}
  };

  function targets() {
    var out = [];
    try {
      var sels = document.querySelectorAll(GEN + 'select[data-name]');
      for (var i = 0; i < sels.length; i++) {
        if (sels[i].options && sels[i].options.length >= MIN_OPTIONS) out.push(sels[i]);
      }
    } catch (e) {}
    return out;
  }

  function sweep() {
    if (!frameworkInitDone()) return 0;
    ensureCss();
    var list = targets();
    for (var i = 0; i < list.length; i++) {
      try { attach(list[i]); } catch (e) {}
    }
    return list.length;
  }

  if (sweep() > 0) return;
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    if (sweep() > 0 || tries > 200) clearInterval(timer);
  }, 300);
  try {
    new MutationObserver(function () { sweep(); }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
})();
