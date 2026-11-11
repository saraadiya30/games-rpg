(function () {
  "use strict";
  if (window.__disneyLockLoaded) return;
  window.__disneyLockLoaded = true;

  function isOwner() {
    try { if (typeof window.__t2iIsOwnerAuthed === "function" && window.__t2iIsOwnerAuthed()) return true; } catch (e) {}
    try { if (window.__t2iOwnerAuthed) return true; } catch (e) {}
    return false;
  }

  // 🔒 2D / 3D Disney Character styles are owner-only.
  // Matches every "Character" variant wherever it is defined (t2i-styles import,
  // multiStyleLabStyles, furryStyles, qine packs): any name containing disney +
  // character + 2d/3d. Sketch / Classic / simplified Disney styles stay public.
  function isLockedName(name) {
    var s = String(name || "").toLowerCase();
    if (s.indexOf("disney") < 0) return false;
    if (s.indexOf("character") < 0) return false;
    if (s.indexOf("2d") >= 0 || s.indexOf("3d") >= 0) return true;
    if (/\b2\s*d\b/.test(s) || /\b3\s*d\b/.test(s)) return true;
    return false;
  }

  window.__disneyOwnerAuthed = isOwner;
  window.__disneyStyleLocked = isLockedName;
  // PJS engine (main.pjs) re-checks the same gate, so this UI lock can't be
  // bypassed via the console / share links / stored selections.
  window.__personaGenreAllowed = window.__personaGenreAllowed; // no-op, keep linters calm

  function fallbackOption(sel) {
    if (!sel || !sel.options) return null;
    var firstEnabled = null;
    for (var i = 0; i < sel.options.length; i++) {
      var o = sel.options[i];
      var label = o.textContent || o.label || o.value || "";
      // "𝗡𝗼 𝘀𝘁𝘆𝗹𝗲" uses fancy Unicode, so /no style/i never matches it —
      // check for the fancy prefix explicitly.
      if ((/no style/i.test(label) || label.indexOf("𝗡𝗼") >= 0) && !o.disabled) return o;
    }
    for (var j = 0; j < sel.options.length; j++) {
      var p = sel.options[j];
      if (!p.disabled && !(p.hidden && !isOwner())) {
        var pl = p.textContent || "";
        if (!isLockedName(pl)) {
          if (!firstEnabled) firstEnabled = p;
          if (j === 0) return p;
        }
      }
    }
    return firstEnabled;
  }

  function ensureNote(sel) {
    try {
      var ctn = sel.closest ? sel.closest(".input-ctn") : sel.parentNode;
      if (!ctn) return null;
      var old = ctn.querySelector("[data-disney-lock-note]");
      if (old && old.parentNode) old.parentNode.removeChild(old);
      return null;
    } catch (e) { return null; }
  }

  function applyToSelect(sel) {
    if (!sel || !sel.options) return;
    var locked = !isOwner();
    var changed = false;
    var selectedIsLocked = false;
    var selectedLabel = "";
    try {
      if (sel.selectedIndex >= 0 && sel.options[sel.selectedIndex]) {
        selectedLabel = sel.options[sel.selectedIndex].textContent || "";
        selectedIsLocked = isLockedName(selectedLabel);
      }
    } catch (e) {}
    for (var i = 0; i < sel.options.length; i++) {
      var o = sel.options[i];
      var label = "";
      try { label = o.textContent || o.label || ""; } catch (e) {}
      if (!isLockedName(label)) {
        // Never touch public styles (framework may disable separators itself).
        continue;
      }
      if (locked) {
        if (!o.disabled) { o.disabled = true; changed = true; }
        if (!o.hidden) { try { o.hidden = true; } catch (e2) {} }
        // display:none as a second layer: some browsers ignore hidden on <option>.
        try { if (o.style.display !== "none") o.style.display = "none"; } catch (e3) {}
      } else {
        if (o.disabled) { o.disabled = false; changed = true; }
        try { if (o.hidden) o.hidden = false; } catch (e2) {}
        try { if (o.style.display === "none") o.style.display = ""; } catch (e3) {}
      }
    }
    ensureNote(sel);
    // A stored selection (remember=true) can leave a locked style selected for a
    // public visitor — bounce it to a safe fallback so generation never uses it.
    if (locked && selectedIsLocked) {
      var fb = fallbackOption(sel);
      if (fb) {
        try {
          sel.value = fb.value;
          if (typeof sel.onchange === "function") { try { sel.onchange({}); } catch (e) {} }
          else { try { sel.dispatchEvent(new Event("change", { bubbles: true })); } catch (e2) {} }
        } catch (e) {}
      }
    }
    return changed;
  }

  function applyAll() {
    var sels = document.querySelectorAll('select[data-name="artStyle"], select[data-name="artStyle2"], select[data-name="artStyle3"], select[data-name="artStyle4"], select[data-name="artStyle5"]');
    for (var i = 0; i < sels.length; i++) {
      try { applyToSelect(sels[i]); } catch (e) {}
    }
    // Simple-mode AI planner (src/gen-extras.js) may have cached a locked style
    // name — the engine fallback still protects generation, but keep the visible
    // select honest.
    return sels.length > 0;
  }

  // Framework builds the dropdown async — poll until it exists, then keep a slow
  // poll for rebuilds. No global MutationObserver: observing the whole body and
  // mutating options inside the callback feedback-loops during initial render.
  var tries = 0;
  function boot() {
    var found = false;
    try { found = applyAll(); } catch (e) {}
    tries++;
    if (tries < 240) setTimeout(boot, found ? 2000 : 500);
  }
  boot();

  document.addEventListener("t2i-owner-auth", function () {
    try { applyAll(); } catch (e) {}
    // Re-run after the framework restores the remembered value on unlock.
    setTimeout(function () { try { applyAll(); } catch (e) {} }, 300);
  });
  window.addEventListener("focus", function () { try { applyAll(); } catch (e) {} });
  document.addEventListener("change", function (e) {
    try {
      var t = e.target;
      if (t && t.tagName === "SELECT" && t.dataset && (t.dataset.name === "artStyle" || t.dataset.name === "artStyle2" || t.dataset.name === "artStyle3" || t.dataset.name === "artStyle4" || t.dataset.name === "artStyle5")) applyToSelect(t);
    } catch (err) {}
  }, true);
})();
