/* ===== Image Generator: ↺ Reset all (sections → off / default) =====
   One-click reset for the Image Generator tab. Turns every prompt-affecting
   section back to its fresh-visitor state:
     • framework dropdowns → first option (Mixers → None, Art Style → 🎲 Random,
       Fusions → None, Style mix → Balanced, Shape → Portrait, Display → Default,
       How many → 6, every clause select → Not set)
     • framework text → cleared (Description, Anti-description, Side-prompt,
       Image name, Custom display size) — Username is KEPT (identity)
     • Fine-tune → Guidance 🎲 Random, Seed empty (Signature is KEPT)
     • Advanced Workbench → weight off, variations off + cleared, negative
       presets off + cleared, seed lab unlocked + no step
     • Custom Art Styles → slots off + tryout stopped (saved definitions kept)
     • 🎂 Age → "Add to prompt" off (age value kept for next enable)
     • Scratchpad (Basic + Advanced) → cleared
     • 🔄 Convert panel → override unticked + frozen text cleared
     • Convert panel → override unticked + frozen text cleared
     • 🔍 search filters → cleared (full dropdown lists restored)
   Kept on purpose: Username, Signature, saved Custom Style definitions,
   section collapsed states, and the Simple/Basic/Advanced mode itself.
   Destructive text is guarded: when Description / Anti / Side / Image name /
   Scratchpad / Variations holds content, a confirm() lists exactly what will
   be cleared vs kept. Pure dropdown-only resets run without a popup (same
   pattern as Pro Imager's reset). Exposed as window.t2iResetImageGenerator()
   so the palette / console can call it too. No imports, no persistence of its
   own. Lives OUTSIDE the framework's inputs container (its init crashes on
   anonymous elements inside it). */
(function () {
  "use strict";

  var BTN_ID = "gen-reset-btn";
  var ROW_ID = "gen-reset-row";

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  function toast(msg) {
    try {
      if (typeof window.vaultToast === "function") { window.vaultToast(msg); return; }
    } catch (e) {}
    try {
      var t = document.createElement("div");
      t.textContent = msg;
      t.style.cssText = "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:600;" +
        "background:var(--th-modal, var(--th-surface, #222));color:inherit;border:1px solid var(--th-border, #555);" +
        "border-radius:999px;padding:0.45rem 0.9rem;font-size:0.82rem;box-shadow:0 12px 30px -12px rgba(0,0,0,0.7);";
      document.body.appendChild(t);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2200);
    } catch (e) { try { console.log(msg); } catch (e2) {} }
  }

  function fireFramework(el) {
    try {
      if (typeof window.__fireFrameworkInput === "function") return window.__fireFrameworkInput(el);
    } catch (e) {}
    try {
      if (!el) return false;
      if (el.tagName === "SELECT") {
        if (typeof el.onchange === "function") el.onchange({});
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        if (typeof el.oninput === "function") el.oninput({});
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return true;
    } catch (e) { return false; }
  }

  function firstEnabledValue(sel) {
    // Favorites (section-favorites.js) pin starred items to the top of the
    // DOM — reset must ignore pins and use the canonical framework order so
    // ↺ Reset all still lands on true defaults (🎲 Random, None, Not set…).
    try {
      if (window.__sectionFavs) {
        var canon = window.__sectionFavs.canonValues(sel);
        for (var c = 0; c < canon.length; c++) {
          var o = null;
          for (var k = 0; k < sel.options.length; k++) {
            if (String(sel.options[k].value) === String(canon[c])) { o = sel.options[k]; break; }
          }
          if (o && !o.disabled) return o.value;
        }
      }
    } catch (e) {}
    try {
      for (var i = 0; i < sel.options.length; i++) {
        if (!sel.options[i].disabled) return sel.options[i].value;
      }
    } catch (e) {}
    return "";
  }

  function clearSearchFilters() {
    // 🔍 boxes narrow the <select> to matches — restore full lists FIRST so the
    // reset below picks true defaults, not "first of the filtered subset".
    $all("#i2p-imggen .as-search .as-input").forEach(function (inp) {
      try {
        if (inp.value) {
          inp.value = "";
          inp.dispatchEvent(new Event("input", { bubbles: true }));
        }
      } catch (e) {}
    });
  }

  function frameworkDefaults() {
    var keepText = { userName: 1 };
    var textsToClear = ["description", "negative", "side_desc", "imgName", "imgSizeCustom"];
    clearSearchFilters();
    var sels = $all('#i2p-imggen [id^="userInputsCtn"] select[data-name], #i2p-imggen select[data-name]');
    // De-dupe (selects match both selectors above when the container id varies).
    var seen = {};
    var changed = 0;
    sels.forEach(function (sel) {
      var name = sel.getAttribute("data-name");
      if (!name || seen[name]) return;
      seen[name] = true;
      try {
        var want = firstEnabledValue(sel);
        if (sel.value !== want) {
          sel.value = want;
          fireFramework(sel);
          changed++;
        }
      } catch (e) {}
    });
    textsToClear.forEach(function (name) {
      try {
        var el = document.querySelector('#i2p-imggen [data-name="' + name + '"]');
        if (el && String(el.value || "") !== "") {
          el.value = "";
          fireFramework(el);
          changed++;
        }
      } catch (e) {}
    });
    // Username untouched — but make sure window.input has no stale value when the
    // element is missing (e.g. Simple mode hides nothing, but be safe).
    void keepText;
    return changed;
  }

  function resetFineTune() {
    try {
      var g = document.getElementById("ft-guidance");
      if (g && String(g.value) !== "31") {
        g.value = "31";
        try { g.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
        try { if (window.input) window.input.guidance = "31"; } catch (e2) {}
        try { localStorage["aiag_guidance"] = "31"; } catch (e3) {}
      } else if (g) {
        try { g.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
      }
    } catch (e) {}
    try {
      var s = document.getElementById("ft-seed");
      if (s && String(s.value || "") !== "") {
        s.value = "";
        try { s.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
      }
      try { if (window.input) window.input.seed = ""; } catch (e2) {}
      try { localStorage["aiag_seed"] = ""; } catch (e3) {}
    } catch (e) {}
    // Signature (identity) is kept — like Username.
  }

  function resetAdvanced() {
    try {
      if (!window.___advState) window.___advState = {};
      var st = window.___advState;
      st.variationsOn = false;
      st.variations = "";
      st.negativeOn = false;
      st.negativeChips = [];
      st.lockSeed = false;
      st.lockedSeed = null;
      st.stepSeed = false;
      st.seedStep = 1;
      st.descWeight = 0;
      try { localStorage["advWorkbenchState"] = JSON.stringify(st); } catch (e) {}
    } catch (e) {}
    // Stale per-image caches must not survive the reset.
    try { delete window.___advPlainDesc; } catch (e) {}
    try { delete window.___advWeightCurrent; } catch (e) {}
    try { delete window.___advWeightedDesc; } catch (e) {}
    try { delete window.___compileOrig; } catch (e) {}
    try { delete window.___compileDone; } catch (e) {}
    try { delete window.___reconcileNotes; } catch (e) {}
    try { delete window.___t2iArtStyleCurrent; } catch (e) {}
    try {
      var advSeed = document.getElementById("advSeed");
      if (advSeed && String(advSeed.value || "") !== "") {
        advSeed.value = "";
        try { advSeed.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
      }
      var ftSeed = document.getElementById("ft-seed");
      if (ftSeed && advSeed && ftSeed.value !== advSeed.value) {
        ftSeed.value = advSeed.value || "";
        try { ftSeed.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
      }
      var step = document.getElementById("advSeedStep");
      if (step) {
        step.value = "1";
        try { step.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
      }
      var stepT = document.getElementById("advStepToggle");
      if (stepT && stepT.checked) {
        stepT.checked = false;
        try { stepT.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
      }
      var lockB = document.getElementById("advSeedLockBtn");
      if (lockB) lockB.classList.remove("active");
      var varT = document.getElementById("advVarToggle");
      if (varT && varT.checked) {
        varT.checked = false;
        try { varT.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
      }
      var varL = document.getElementById("advVarLines");
      if (varL && String(varL.value || "") !== "") {
        varL.value = "";
        try { varL.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
      }
      var negT = document.getElementById("advNegToggle");
      if (negT && negT.checked) {
        negT.checked = false;
        try { negT.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
      }
      var w = document.getElementById("advWeight");
      if (w && String(w.value) !== "0") {
        w.value = "0";
        try { w.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
      }
      // Re-render chip buttons + previews via their own listeners where possible;
      // fall back to a direct repaint when the panel hasn't wired yet.
      var chips = document.getElementById("advNegChips");
      if (chips) {
        $all(".adv-btn.active", chips).forEach(function (b) { try { b.classList.remove("active"); } catch (e) {} });
        var prev = document.getElementById("advNegChipPreview");
        if (prev) prev.textContent = "pick one or more presets";
      }
      var wVal = document.getElementById("advWeightVal");
      if (wVal) wVal.textContent = "off";
      var wPrev = document.getElementById("advWeightPreview");
      if (wPrev) wPrev.textContent = "weight off — description sent as typed";
      var vPrev = document.getElementById("advVarPreview");
      if (vPrev) vPrev.textContent = "one suffix per line; line 1 → image 1, etc.";
      var sPrev = document.getElementById("advSeedPreview");
      if (sPrev) sPrev.textContent = "no seed set — every image is random (use 🎲 to explore, 🔒 lock to make a batch reproducible)";
    } catch (e) {}
  }

  function resetCustomStyles() {
    try {
      if (typeof window.t2iCustomStylesReset === "function") window.t2iCustomStylesReset();
    } catch (e) {}
    // Stop an active 🧪 tryout style (definitions are kept — only usage stops).
    try {
      var raw = null;
      try { raw = localStorage.getItem("t2iCS_tryout"); } catch (e) {}
      if (raw) {
        var d = JSON.parse(raw);
        if (d && d.activeId !== null && d.activeId !== undefined) {
          d.activeId = null;
          try { localStorage.setItem("t2iCS_tryout", JSON.stringify(d)); } catch (e2) {}
          if (typeof window.__t2iCustomStylesRefresh === "function") {
            try { window.__t2iCustomStylesRefresh(); } catch (e3) {}
          }
        }
      }
    } catch (e) {}
  }

  function resetAge() {
    try {
      if (!window.___ageState) return;
      window.___ageState.on = false;
      try { localStorage["t2iAgeMeter2"] = JSON.stringify(window.___ageState); } catch (e) {}
      try {
        var onBox = document.getElementById("gen-age-on");
        if (onBox) onBox.checked = false;
      } catch (e) {}
      if (typeof window.__genAgePaint === "function") {
        try { window.__genAgePaint(); } catch (e) {}
      }
    } catch (e) {}
  }

  function resetScratchpad() {
    ["t2iScratchInput", "t2iBasicScratchInput"].forEach(function (id) {
      try {
        var ta = document.getElementById(id);
        if (ta && String(ta.value || "") !== "") {
          ta.value = "";
          try { ta.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
        }
      } catch (e) {}
    });
    try { localStorage["t2iScratchpadText"] = ""; } catch (e) {}
  }

  function resetConvert() {
    // 🔄 Convert panel: untick the override + clear the frozen text so a reset
    // can never leave a stale override hijacking generation. Collapse state kept.
    try {
      if (!window.___convertState) window.___convertState = { text: "", use: false };
      window.___convertState.text = "";
      window.___convertState.use = false;
      try { localStorage["t2iConvertState"] = JSON.stringify(window.___convertState); } catch (e) {}
      var ta = document.getElementById("convertText");
      if (ta && String(ta.value || "") !== "") {
        ta.value = "";
        try { ta.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
      }
      var cb = document.getElementById("convUse");
      if (cb && cb.checked) {
        cb.checked = false;
        try { cb.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
      }
      if (window.__convertPanel && window.__convertPanel.sync) {
        try { window.__convertPanel.sync(); } catch (e2) {}
      }
    } catch (e) {}
  }

  function textSnapshot() {
    function v(sel) {
      try {
        var el = typeof sel === "string" ? document.querySelector(sel) : document.getElementById(sel);
        return el ? String(el.value || "").trim() : "";
      } catch (e) { return ""; }
    }
    return {
      desc: v('#i2p-imggen [data-name="description"]'),
      neg: v('#i2p-imggen [data-name="negative"]'),
      side: v('#i2p-imggen [data-name="side_desc"]'),
      imgName: v('#i2p-imggen [data-name="imgName"]'),
      scratchAdv: v("t2iScratchInput"),
      scratchBasic: v("t2iBasicScratchInput"),
      variations: (function () {
        try { return String((window.___advState && window.___advState.variations) || "").trim(); } catch (e) { return ""; }
      })(),
      converted: v("#convertText")
    };
  }

  function needsConfirm(snap) {
    return !!(snap.desc || snap.neg || snap.side || snap.imgName || snap.scratchAdv || snap.scratchBasic || snap.variations || snap.converted);
  }

  window.t2iResetImageGenerator = async function (opts) {
    opts = opts || {};
    try {
      var snap = textSnapshot();
      if (opts.confirm !== false && needsConfirm(snap) && !(await window.uiConfirm(
          "Reset the Image Generator to defaults?\n\n" +
          "This turns every dropdown to Off / default (Mixers → None, Art → 🎲 Random, " +
          "Shape → Portrait, clauses → Not set…), sets Guidance → Random and Seed → empty, " +
          "turns Advanced weight / variations / negative presets / seed-lock off, stops " +
          "Custom Styles + Age, and clears Description / Anti-description / Side-prompt / " +
          "Image name / Scratchpad / Variations / Converted prompt.\n\n" +
          "Kept: 👤 Username, ✍️ Signature, saved Custom Style definitions, and your " +
          "Simple / Basic / Advanced mode.\n\nContinue?",
          { okText: 'Reset', danger: true }))) return false;
      frameworkDefaults();
      resetFineTune();
      resetAdvanced();
      resetCustomStyles();
      resetAge();
      resetScratchpad();
      resetConvert();
      // Nudge the live previews (inspector / style line) to re-read the defaults.
      try {
        var imggen = document.getElementById("i2p-imggen");
        if (imggen) {
          try { imggen.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
          try { imggen.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
        }
      } catch (e) {}
      toast("↺ Image Generator reset — sections off / defaults (Username + Signature kept)");
      return true;
    } catch (e) {
      try { console.warn("reset image generator:", e); } catch (e2) {}
      return false;
    }
  };

  function build() {
    try {
      if (document.getElementById(BTN_ID)) return true;
      var imggen = document.getElementById("i2p-imggen");
      if (!imggen) return false;
      // Anchor under the mode switcher so it's visible in Simple/Basic/Advanced
      // (the framework generate-button row hides in Simple mode).
      var anchor = document.getElementById("nexModeHint") || document.getElementById("nexModeBar");
      if (!anchor) {
        // Framework / mode bar not built yet — retry shortly.
        return false;
      }
      if (!document.getElementById("gen-reset-css")) {
        var st = document.createElement("style");
        st.id = "gen-reset-css";
        st.textContent =
          "#" + ROW_ID + "{display:flex;justify-content:center;align-items:center;gap:0.5rem;" +
          "margin:0.15rem auto 0.45rem;flex-wrap:wrap;}" +
          "#" + BTN_ID + "{cursor:pointer;font:inherit;font-size:0.82rem;font-weight:700;" +
          "border:1px solid var(--th-border,#ccc);background:var(--th-surface,#eee);color:inherit;" +
          "border-radius:999px;padding:0.35rem 0.95rem;white-space:nowrap;flex:none;}" +
          "#" + BTN_ID + ":hover{border-color:var(--th-accent,#2b6bf0);" +
          "box-shadow:0 0 0 3px var(--th-accent-soft,rgba(43,107,240,0.15));}" +
          "#" + ROW_ID + " .gen-reset-hint{font-size:0.72rem;opacity:0.6;}";
        document.head.appendChild(st);
      }
      var row = document.createElement("div");
      row.id = ROW_ID;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.id = BTN_ID;
      btn.textContent = "↺ Reset all";
      btn.title = "Reset every Image Generator section to Off / default (keeps 👤 Username + ✍️ Signature)";
      btn.addEventListener("click", function () { window.t2iResetImageGenerator(); });
      var hint = document.createElement("span");
      hint.className = "gen-reset-hint";
      hint.textContent = "sections → off / default · keeps Username + Signature";
      row.appendChild(btn);
      row.appendChild(hint);
      anchor.parentNode.insertBefore(row, anchor.nextSibling);
      return true;
    } catch (e) { return false; }
  }

  var tries = 0;
  function poll() {
    var done = false;
    try { done = !!build(); } catch (e) { done = false; }
    if (done) return;
    tries++;
    // No give-up: the mode bar only exists after the lazy gen-extras chain
    // loads (user may stay on Home for minutes before opening the gen tab).
    // Keep polling + also re-try on any DOM change that could have added it.
    setTimeout(poll, 500);
  }
  try {
    new MutationObserver(function () {
      try { build(); } catch (e) {}
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
  poll();
})();
