/* ===== Image Generator: 🔄 Convert to editable prompt =====
   A collapsible panel (collapsed by default) above the generate button,
   visible in 🧩 Basic and 🎛️ Advanced modes (hidden in ✨ Simple, which has
   its own AI-driven flow).
   Flow: pick sections + type a description as usual, hit "🔄 Convert" — the
   full evaluated prompt (description + art style + every section) is frozen
   into the editable box. Edit it freely, tick "use this text", hit generate.
   While ticked, the frozen text is what gets sent (main.pjs t2iFinalPrompt());
   untick to return to the live sections. 🎲 random draws are frozen at
   convert time — hit Convert again to re-roll. The anti-description, seed,
   shape, guidance and 🎞️ variation lines stay live. Persisted in localStorage
   (t2iConvertState); ↺ Reset-all unticks + clears it. No imports. */
(function () {
  "use strict";

  var PANEL_ID = "convert-panel";
  var LS_KEY = "t2iConvertState";
  var LS_COLLAPSED = "t2iConvertCollapsed";

  function $(s, r) { return (r || document).querySelector(s); }

  function defaultState() { return { text: "", use: false }; }
  function loadState() {
    var st = defaultState();
    try {
      var raw = localStorage[LS_KEY];
      if (raw) {
        var saved = JSON.parse(raw);
        if (typeof saved.text === "string") st.text = saved.text;
        if (saved.use === true) st.use = true;
      }
    } catch (e) {}
    window.___convertState = st;
    return st;
  }
  function saveState() {
    try { localStorage[LS_KEY] = JSON.stringify(window.___convertState || defaultState()); } catch (e) {}
  }
  function collapsedLoad() {
    try { return localStorage[LS_COLLAPSED] !== "0"; } catch (e) { return true; }
    return true;
  }
  function collapsedSave(c) {
    try { localStorage[LS_COLLAPSED] = c ? "1" : "0"; } catch (e) {}
  }

  function fireFramework(el) {
    try {
      if (typeof window.__fireFrameworkInput === "function") return window.__fireFrameworkInput(el);
    } catch (e) {}
    try {
      if (!el) return false;
      if (typeof el.oninput === "function") el.oninput({});
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    } catch (e) { return false; }
  }

  function toast(msg) {
    try {
      if (typeof window.vaultToast === "function") { window.vaultToast(msg); return; }
    } catch (e) {}
    try { console.log(msg); } catch (e2) {}
  }

  function build() {
    var imggen = document.getElementById("i2p-imggen");
    if (!imggen) return false;
    if (document.getElementById(PANEL_ID)) return true;
    var genBtn = document.getElementById("generateButtonEl");
    if (!genBtn || !genBtn.parentElement || !genBtn.parentElement.parentNode) return false;

    var st = loadState();
    var startCollapsed = collapsedLoad();

    var style = document.createElement("style");
    style.textContent =
      "#convert-panel{max-width:1000px;margin:0.5rem auto 0.75rem;padding:0.7rem 0.85rem;box-sizing:border-box;text-align:left;font-family:var(--th-font,inherit);color:var(--th-text,inherit);background:var(--box-color, #ebebeb);border-radius:var(--th-radius, 8px);}" +
      "#convert-panel .conv-head{font-size:0.86rem;font-weight:700;opacity:0.85;margin-bottom:0.55rem;letter-spacing:0.01em;cursor:pointer;display:flex;align-items:center;gap:0.45rem;}" +
      "#convert-panel .conv-head:focus-visible{outline:2px solid var(--th-accent);outline-offset:2px;border-radius:6px;}" +
      "#convert-panel .conv-head-sub{font-weight:400;opacity:0.6;font-size:0.74rem;}" +
      "#convert-panel .conv-state{margin-left:auto;font-size:0.74rem;font-weight:700;}" +
      "#convert-panel .conv-state.on{color:var(--th-accent, #2b6bf0);}" +
      "#convert-panel .conv-chev{flex:none;width:1.1em;text-align:center;opacity:0.7;}" +
      "#convert-panel[data-collapsed=\"1\"] .conv-body{display:none;}" +
      "#convert-panel[data-collapsed=\"1\"] .conv-head{margin-bottom:0;}" +
      "#convert-panel .conv-row{display:flex;align-items:center;gap:0.4rem;margin-bottom:0.4rem;flex-wrap:wrap;}" +
      "#convert-panel .conv-sub{justify-content:space-between;}" +
      "#convert-panel .conv-btn{cursor:pointer;font:inherit;font-size:0.78rem;border:1px solid var(--th-border, #ccc);background:var(--th-surface, #eee);color:inherit;border-radius:999px;padding:0.32rem 0.8rem;white-space:nowrap;}" +
      "#convert-panel .conv-btn:hover{border-color:var(--th-accent, #2b6bf0);}" +
      "#convert-panel .conv-btn:disabled{opacity:0.55;cursor:default;}" +
      "#convert-panel .conv-btn.primary{background:var(--th-accent, #2b6bf0);border-color:var(--th-accent, #2b6bf0);color:var(--th-accent-text, #fff);font-weight:700;}" +
      "#convert-panel textarea{width:100%;box-sizing:border-box;padding:0.45rem 0.55rem;font-size:0.82rem;font-family:inherit;color:inherit;background:var(--th-field, #fff);border:1px solid var(--th-border, #ccc);border-radius:calc(var(--th-radius, 8px) - 4px);outline:none;resize:vertical;min-height:5.5rem;}" +
      "#convert-panel textarea:focus{outline:2px solid var(--th-accent, #2b6bf0);outline-offset:1px;}" +
      "#convert-panel .conv-count{font-size:0.72rem;opacity:0.6;font-variant-numeric:tabular-nums;}" +
      "#convert-panel .conv-status{font-size:0.76rem;opacity:0.85;}" +
      "#convert-panel .conv-check{display:flex;align-items:center;gap:0.4rem;font-size:0.8rem;font-weight:600;margin:0.1rem 0 0.35rem;cursor:pointer;}" +
      "#convert-panel .conv-check input{width:auto;}" +
      "#convert-panel .conv-hint{font-size:0.72rem;opacity:0.62;line-height:1.4;word-break:break-word;}";
    document.head.appendChild(style);

    var panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.setAttribute("data-collapsed", startCollapsed ? "1" : "0");
    panel.innerHTML =
      '<div class="conv-head" role="button" tabindex="0" title="Show/hide the Convert panel">' +
        '<span class="conv-chev">' + (startCollapsed ? "▶" : "▼") + '</span> ' +
        '🔄 Convert to editable prompt ' +
        '<span class="conv-head-sub">freeze sections + description into text you can edit, then generate from it</span>' +
        '<span class="conv-state"></span>' +
      '</div>' +
      '<div class="conv-body">' +
        '<div class="conv-row">' +
          '<button type="button" class="conv-btn primary" id="convFill" title="Assemble the current description + art style + every section into the box below">🔄 Convert sections → editable prompt</button>' +
          '<button type="button" class="conv-btn" id="convCopy" title="Copy the box text">📋 copy</button>' +
          '<button type="button" class="conv-btn" id="convClear" title="Empty the box">🗑 clear</button>' +
        '</div>' +
        '<textarea id="convertText" rows="6" placeholder="Hit 🔄 Convert — the full prompt (your description + art style + every section) lands here for editing."></textarea>' +
        '<div class="conv-row conv-sub"><span class="conv-count" id="convCount"></span><span class="conv-status" id="convStatus"></span></div>' +
        '<label class="conv-check"><input type="checkbox" id="convUse"> ✅ Use this text for generation (sections paused while on)</label>' +
        '<div class="conv-hint">While the box is ticked, Generate sends this text verbatim — section changes stop applying until you untick or hit 🔄 Convert again. 🎲 random picks freeze at convert time. Anti-description, seed, shape, guidance and 🎞️ variation lines stay live. Hidden in ✨ Simple mode.</div>' +
      '</div>';

    var wrap = genBtn.parentElement;
    wrap.parentNode.insertBefore(panel, wrap);

    var ta = panel.querySelector("#convertText");
    var useBox = panel.querySelector("#convUse");
    var fillBtn = panel.querySelector("#convFill");
    var copyBtn = panel.querySelector("#convCopy");
    var clearBtn = panel.querySelector("#convClear");
    var countEl = panel.querySelector("#convCount");
    var statusEl = panel.querySelector("#convStatus");
    var head = panel.querySelector(".conv-head");
    var chev = panel.querySelector(".conv-chev");
    var stateEl = panel.querySelector(".conv-state");

    ta.value = st.text || "";
    useBox.checked = !!st.use;

    function renderCount() {
      var t = String(ta.value || "");
      countEl.textContent = t.length + " chars" + (t.trim() ? " · " + t.trim().split(/\s+/).length + " words" : "");
    }
    function renderStateBadge() {
      var on = !!(window.___convertState && window.___convertState.use && String(ta.value || "").trim());
      stateEl.textContent = on ? "● override on" : "";
      stateEl.classList.toggle("on", on);
    }
    function setStatus(msg) { statusEl.textContent = msg || ""; }
    function mirrorInspector() {
      // Keep the 🎛️ inspector honest: when the override is live, show the
      // exact text that will be sent instead of the sections assembly.
      try {
        if (window.t2iMode !== "advanced") return;
        var prev = document.getElementById("advPromptPreview");
        var cnt = document.getElementById("advPromptCount");
        if (!prev || !window.root || typeof window.root.t2iFinalPrompt !== "function") return;
        var p = String(window.root.t2iFinalPrompt() || "");
        prev.value = p;
        if (cnt) {
          var cs = window.___convertState;
          var over = !!(cs && cs.use && String(cs.text || "").trim());
          cnt.textContent = p.length + " chars · " + (p.trim() ? p.trim().split(/\s+/).length : 0) + " words" + (over ? " · 🔄 converted override" : "");
        }
      } catch (e) {}
    }
    function sync() {
      renderCount();
      renderStateBadge();
      mirrorInspector();
    }

    function toggle() {
      var c = panel.getAttribute("data-collapsed") === "1";
      panel.setAttribute("data-collapsed", c ? "0" : "1");
      chev.textContent = c ? "▼" : "▶";
      collapsedSave(!c);
    }
    head.addEventListener("click", toggle);
    head.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });

    ta.addEventListener("input", function () {
      if (!window.___convertState) window.___convertState = defaultState();
      window.___convertState.text = ta.value;
      saveState();
      sync();
    });

    useBox.addEventListener("change", function () {
      if (!window.___convertState) window.___convertState = defaultState();
      window.___convertState.use = useBox.checked;
      saveState();
      sync();
      if (useBox.checked) {
        if (!String(ta.value || "").trim()) setStatus("⚠️ box is empty — sections stay live until you Convert some text in");
        else setStatus("✅ override on — Generate will send this text");
      } else {
        setStatus("sections live again");
      }
    });

    fillBtn.addEventListener("click", function () {
      if (!window.root || typeof window.root.t2iComposedPrompt !== "function") {
        setStatus("⚠️ prompt engine not ready — try again in a moment");
        return;
      }
      fillBtn.disabled = true;
      var old = fillBtn.textContent;
      fillBtn.textContent = "⏳ converting…";
      setTimeout(function () {
        try {
          // Read the raw description, then evaluate the sections assembly with
          // the description blanked so the frozen text is self-contained and
          // never duplicates the description (art prompts embed it live).
          var descEl = document.querySelector('#i2p-imggen [data-name="description"]');
          var saved = "";
          try { saved = String((window.input && window.input.description) || ""); } catch (e) {}
          if (!saved && descEl) { try { saved = String(descEl.value || ""); } catch (e2) {} }
          var savedEl = descEl ? descEl.value : null;
          var p = "";
          try {
            if (window.input) window.input.description = "";
            if (descEl) descEl.value = "";
            p = String(window.root.t2iComposedPrompt() || "");
          } finally {
            try { if (window.input) window.input.description = saved; } catch (e3) {}
            try { if (descEl && savedEl !== null) { descEl.value = savedEl; fireFramework(descEl); } } catch (e4) {}
          }
          var d = String(saved || "").trim();
          var txt = d ? (d + (p ? ", " + p : "")) : p;
          ta.value = txt;
          if (!window.___convertState) window.___convertState = defaultState();
          window.___convertState.text = txt;
          saveState();
          try {
            ta.style.height = "auto";
            ta.style.height = Math.min(ta.scrollHeight + 4, 420) + "px";
          } catch (e5) {}
          sync();
          setStatus(txt ? ("✅ converted — " + txt.length + " chars. Edit freely, tick the box, hit generate.") : "⚠️ nothing to convert — description and sections are all empty");
        } catch (err) {
          console.error(err);
          setStatus("⚠️ convert failed — try again");
        } finally {
          fillBtn.disabled = false;
          fillBtn.textContent = old;
        }
      }, 30);
    });

    copyBtn.addEventListener("click", function () {
      var t = String(ta.value || "");
      if (!t) { setStatus("⚠️ nothing to copy"); return; }
      function done(ok) { setStatus(ok ? "✅ copied" : "⚠️ copy failed — select + Ctrl+C"); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(function () { done(true); }, function () { done(false); });
      } else {
        try { ta.select(); document.execCommand("copy"); done(true); } catch (e) { done(false); }
      }
    });

    clearBtn.addEventListener("click", function () {
      ta.value = "";
      if (!window.___convertState) window.___convertState = defaultState();
      window.___convertState.text = "";
      saveState();
      sync();
      setStatus("cleared — sections live");
    });

    function syncMode() {
      try { panel.style.display = (window.t2iMode === "simple") ? "none" : ""; } catch (e) {}
    }
    document.addEventListener("nex-mode-change", syncMode);
    syncMode();
    sync();

    window.__convertPanel = {
      fill: function () { fillBtn.click(); },
      sync: sync,
      state: function () { return window.___convertState; }
    };
    return true;
  }

  var tries = 0;
  (function boot() {
    if (!window.___userSettings746291937 || !document.getElementById("i2p-imggen") || !document.getElementById("generateButtonEl")) {
      if (tries++ < 80) setTimeout(boot, 300);
      return;
    }
    if (!build() && tries++ < 80) setTimeout(boot, 300);
  })();
})();
