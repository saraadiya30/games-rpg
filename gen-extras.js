(function(){

  "use strict";

  // ---------- autosave persona-generation prompts ----------

  // Every time a character personality is generated (gen tab 🎭 or Pro tab 🚀), the prompts used

  // (the image prompt + any extra instruction, plus the generated name/description) are autosaved

  // to a per-browser history so they can be revisited/reused later.

  // Stored via kv-plugin (IndexedDB) — NOT localStorage, which shares the ~5MB quota with the

  // gallery's image dataURLs and silently rejects writes once full.

  var PH_FOLDER = "t2iPersonaPrompts";

  var MAX = 200;

  async function readHistory() {

    try { if (window.root && root.kv) { var v = await root.kv[PH_FOLDER].get("list"); return Array.isArray(v) ? v : []; } } catch(e) {}

    return [];

  }

  async function writeHistory(arr) {

    try { if (window.root && root.kv) await root.kv[PH_FOLDER].set("list", arr); } catch(e) { console.warn("write persona history:", e); }

  }

  window.t2i_autosavePersonaPrompt = async function(rec) {

    try {

      if (!(window.root && root.kv)) { console.warn("autosave persona prompt: kv not available"); return; }

      await root.kv[PH_FOLDER].update("list", function(h) {

        if (!Array.isArray(h)) h = [];

        for (var i = 0; i < h.length; i++) {

          var e = h[i];

          if (e.source === rec.source && e.imagePrompt === rec.imagePrompt && e.instruction === (rec.instruction || "") && e.name === (rec.name || "") && e.description === (rec.description || "")) return h;

        }

        h.unshift({

          id: Math.random().toString(36).slice(2) + Date.now().toString(36),

          ts: Date.now(),

          source: rec.source || "gen",

          imagePrompt: rec.imagePrompt || "",

          instruction: rec.instruction || "",

          name: rec.name || "",

          description: rec.description || ""

        });

        if (h.length > MAX) h.length = MAX;

        return h;

      });

    } catch(e) { console.warn("autosave persona prompt:", e); }

  };

  window.t2i_personaPromptHistory = function() { return readHistory(); };

  window.t2i_clearPersonaPromptHistory = async function() {

    try { if (window.root && root.kv) await root.kv[PH_FOLDER].delete("list"); } catch(e) { console.warn("clear persona history:", e); }

  };

  function escPh(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  function fmtPhTime(ts) { try { return new Date(ts).toLocaleString(); } catch(e) { return ""; } }

  window.t2i_openPersonaPromptHistory = async function() {

    var h = await readHistory();

    var existing = document.getElementById("t2iPersonaHistoryModal");

    if(existing) existing.remove();

    var overlay = document.createElement("div");

    overlay.id = "t2iPersonaHistoryModal";

    overlay.className = "pro-persona-overlay";

    var body = "";

    if(h.length === 0) {

      body = '<div style="padding:1.5rem; text-align:center; opacity:0.7;">No persona prompts saved yet.<br>Generate a persona from an image (🎭) and the prompt(s) used will be autosaved here.</div>';

    } else {

      body = h.map(function(r, i) {

        var badge = r.source === "pro" ? "🚀 Pro" : "🎨 Gen";

        var instr = r.instruction ? '<div class="ph-row"><div class="ph-label">extra instruction</div><div class="ph-text">' + escPh(r.instruction) + '</div><button type="button" data-ph-copy="instruction" data-idx="' + i + '" class="ph-copy" title="copy">📋</button></div>' : "";

        var desc = r.description ? '<details class="ph-details"><summary class="ph-summary">generated description</summary><div class="ph-text" style="margin-bottom:0.35rem;">' + escPh(r.description) + '</div><button type="button" data-ph-copy="description" data-idx="' + i + '" class="ph-copy" title="copy description">📋 copy description</button></details>' : "";

        return '<div class="ph-item">' +

          '<div class="ph-head"><b>' + escPh(r.name || "(unnamed)") + '</b> <span class="ph-badge">' + badge + '</span> <span class="ph-time">' + escPh(fmtPhTime(r.ts)) + '</span></div>' +

          '<div class="ph-row"><div class="ph-label">image prompt</div><div class="ph-text">' + escPh(r.imagePrompt) + '</div><button type="button" data-ph-copy="imagePrompt" data-idx="' + i + '" class="ph-copy" title="copy">📋</button></div>' +

          instr + desc +

        '</div>';

      }).join("");

    }

    overlay.innerHTML =

      '<div class="pro-persona-box" style="width:min(780px,100%);">' +

        '<div class="pro-persona-head"><b>📋 Persona prompt history</b><span class="pro-persona-sub">prompts used to generate each character&apos;s personality — autosaved (' + h.length + ')</span>' +

        (h.length ? '<button type="button" id="t2iPhClearBtn" style="min-width:max-content; border:1px solid #b66; border-radius:6px; background:rgba(180,80,80,0.15); color:#f99; padding:0.2rem 0.5rem; cursor:pointer;">🗑️ clear all</button>' : "") +

        '<button type="button" class="pro-persona-x" data-ph-close title="close">✖️</button></div>' +

        '<div style="overflow-y:auto; max-height:72vh; display:flex; flex-direction:column; gap:0.6rem;">' + body + '</div>' +

      '</div>';

    document.body.appendChild(overlay);

    function copyPh(text, btn) {

      if(navigator.clipboard && navigator.clipboard.writeText) {

        navigator.clipboard.writeText(text).then(function(){ if(btn){ btn.textContent = "✅"; setTimeout(function(){ btn.textContent = "📋"; }, 1200); } }).catch(function(){});

      } else {

        var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();

        try { document.execCommand("copy"); } catch(e) {}

        ta.remove();

        if(btn) btn.textContent = "✅";

      }

    }

    overlay.querySelectorAll("[data-ph-copy]").forEach(function(btn) {

      btn.addEventListener("click", function() {

        var r = h[parseInt(btn.dataset.idx, 10)]; if(!r) return;

        copyPh(r[btn.dataset.phCopy] || "", btn);

      });

    });

    overlay.querySelector("[data-ph-close]").addEventListener("click", function(){ overlay.remove(); });

    var clearBtn = document.getElementById("t2iPhClearBtn");

    if(clearBtn) clearBtn.addEventListener("click", async function() {

      if(!(await window.uiConfirm("Delete all saved persona prompts?", { okText: 'Delete all', danger: true }))) return;

      window.t2i_clearPersonaPromptHistory();

      overlay.remove();

      window.t2i_openPersonaPromptHistory();

    });

    overlay.addEventListener("mousedown", function(e){ if(e.target === overlay) overlay.remove(); });

  };



  // ---- gen tab: wrap the framework's persona flow so generations autosave, and so the persona

  // editor gains a "📋 prompt history" button (the framework assigns these after our script runs,

  // so we re-apply the wraps until they stick — same pattern as the chat-link override above).

  // ---- gen tab: "🧑 Persona Generator →" sends the image over as a Starter
  // (image + image prompt + brief/tone/style), with no generate-first gate.
  // If a persona was already generated here, it is loaded into the editor too.
  function collectImageStarter(imageCtn, out) {
    if (!out) {
      try { out = (imageCtn.querySelector("iframe") || {}).textToImagePluginOutput || {}; } catch (e) { out = {}; }
    }
    var inputs = (out && out.inputs) || {};
    var name = "", desc = "", instr = "", toneId = "", toneLabel = "", styleLabel = "";
    try { name = (imageCtn.querySelector(".character-name-output") || {}).value || ""; } catch (e) {}
    try { desc = (imageCtn.querySelector(".character-description-output") || {}).value || ""; } catch (e) {}
    try { instr = (imageCtn.querySelector(".char-description-instruction") || {}).value || ""; } catch (e) {}
    try {
      var tsel = imageCtn.querySelector(".t2i-persona-tone");
      if (tsel) {
        toneId = tsel.value || "";
        if (tsel.selectedIndex >= 0 && tsel.options[tsel.selectedIndex]) toneLabel = (tsel.options[tsel.selectedIndex].textContent || "").trim();
      }
    } catch (e) {}
    try {
      var asel = document.querySelector('select[data-name="artStyle"]');
      if (asel && asel.selectedIndex >= 0 && asel.options[asel.selectedIndex]) styleLabel = (asel.options[asel.selectedIndex].textContent || "").trim();
    } catch (e) {}
    return {
      name: name, desc: desc,
      starter: {
        url: out.dataUrl || "", kind: "", poster: "",
        prompt: inputs.prompt || "", style: styleLabel, brief: instr,
        tone: toneId, toneLabel: toneLabel, title: "", source: "gen"
      },
      imagePrompt: inputs.prompt || ""
    };
  }

  // The plugin output object is attached to the card's iframe asynchronously —
  // poll briefly so a fast click still captures the image + prompt.
  async function readImageOutput(imageCtn) {
    var out = {};
    for (var i = 0; i < 120; i++) {
      try { out = (imageCtn.querySelector("iframe") || {}).textToImagePluginOutput || {}; } catch (e) { out = {}; }
      if (out && ((out.inputs && out.inputs.prompt) || out.dataUrl)) return out;
      await new Promise(function (r) { setTimeout(r, 250); });
    }
    try { out = (imageCtn.querySelector("iframe") || {}).textToImagePluginOutput || {}; } catch (e) { out = {}; }
    return out;
  }

  async function portGenPersonaToPersonaTab(imageCtn, btn) {
    var label = btn ? btn.textContent : "";
    function say(t) { if (btn) btn.textContent = t; }
    try {
      say("⏳ opening…");
      if (btn) btn.disabled = true;
      var out = await readImageOutput(imageCtn);
      var got = collectImageStarter(imageCtn, out);
      if (window.ensurePersona) window.ensurePersona();
      var ok = false;
      for (var i = 0; i < 40; i++) {
        if (typeof window.__personaAcceptStarter === "function") { ok = true; break; }
        await new Promise(function (r) { setTimeout(r, 400); });
      }
      if (!ok) throw new Error("persona tab not ready");
      await window.__personaAcceptStarter(got.starter);
      if (String(got.desc).trim() && typeof window.__personaOpenConverted === "function") {
        await window.__personaOpenConverted({ name: String(got.name).trim() || "Converted character", description: String(got.desc), thumb: got.starter.url, thumbKind: "" });
        try {
          if (got.imagePrompt && typeof window.__personaAddPrompt === "function") window.__personaAddPrompt(String(got.imagePrompt));
        } catch (e2) {}
      }
    } catch (e) {
      say("⚠️ " + String((e && e.message) || "open failed").slice(0, 60));
      setTimeout(function () { say(label); if (btn) btn.disabled = false; }, 2000);
      return;
    }
    if (btn) btn.disabled = false;
    say(label);
  }

  function wrapGenPersonaAutosave() {

    var fd = window.t2i_generateCharacterDescription;

    if(fd && !fd.__t2iPhWrapped) {

      var origDesc = fd;

      var wrappedDesc = async function(imageCtn) {

        try { await origDesc(imageCtn); } catch(e) { console.warn(e); }

        try {

          var instr = (imageCtn.querySelector(".char-description-instruction") || {}).value || "";

          var out = (imageCtn.querySelector("iframe") || {}).textToImagePluginOutput || {};

          var imagePrompt = (out.inputs && out.inputs.prompt) || "";

          var name = (imageCtn.querySelector(".character-name-output") || {}).value || "";

          var desc = (imageCtn.querySelector(".character-description-output") || {}).value || "";

          if(imagePrompt || instr) await window.t2i_autosavePersonaPrompt({ source: "gen", imagePrompt: imagePrompt, instruction: instr, name: name, description: desc });

        } catch(e) { console.warn("autosave persona prompt:", e); }

      };

      wrappedDesc.__t2iPhWrapped = true;

      window.t2i_generateCharacterDescription = wrappedDesc;

    }

    var fe = window.t2i_openCharacterDescriptionEditor;

    if(fe && !fe.__t2iPhEditorWrapped) {

      var origEditor = fe;

      var wrappedEditor = function(imageCtn) {

        origEditor(imageCtn);

        try {

          var editor = imageCtn.querySelector(".char-description-editor-ctn");

          if(editor && !editor.querySelector(".persona-history-button")) {

            var row = null;

            var btns = editor.querySelectorAll("button");

            for(var i = 0; i < btns.length; i++) {

              if((btns[i].getAttribute("onclick") || "").indexOf("t2i_generateChatLink") >= 0) { row = btns[i].parentNode; break; }

            }

            var btn = document.createElement("button");

            btn.type = "button";

            btn.className = "persona-history-button";

            btn.textContent = "📋 prompt history";

            btn.style.cssText = ""; // styled by the persona skin (gen-persona-css)

            btn.onclick = function() { window.t2i_openPersonaPromptHistory(); };

            if(row) row.insertBefore(btn, row.lastElementChild);

            else editor.appendChild(btn);

            if(!editor.querySelector(".persona-port-button")) {

              var port = document.createElement("button");

              port.type = "button";

              port.className = "persona-port-button";

              port.textContent = "🧑 Persona Generator →";

              port.title = "Send this image to the Persona Generator tab as a Starter (no need to generate first)";

              port.style.cssText = ""; // styled by the persona skin (gen-persona-css)

              port.onclick = function() { portGenPersonaToPersonaTab(imageCtn, port); };

              if(row) row.insertBefore(port, row.lastElementChild);

              else editor.appendChild(port);

            }

          }

        } catch(e) {}

      };

      wrappedEditor.__t2iPhEditorWrapped = true;

      window.t2i_openCharacterDescriptionEditor = wrappedEditor;

    }

  }

  if(window.t2i_installGenPersonaOverride) window.t2i_installGenPersonaOverride();

  wrapGenPersonaAutosave();

  var phTries = 0;

  (function reassertPhWraps() {

    if(window.t2i_installGenPersonaOverride) window.t2i_installGenPersonaOverride();

    wrapGenPersonaAutosave();

    if(phTries++ < 80) setTimeout(reassertPhWraps, 500);

  })();

})();

/* ===== Image Generator: Fine-tune panel (Guidance · Seed · Signature) =====
   Extra controls below the framework's inputs (inspired by perchance.org/ai-artgen).
   They write straight into window.input so the framework's imageOptions picks them up
   when 'generate' is clicked (imageOptions is evaluated at generation time). */
(function() {
  "use strict";
  var LS = function(k){ return "aiag_" + k; };
  function init() {
    var ctn = document.getElementById("userInputsCtn8462746262");
    if (!ctn) return false;
    if (document.getElementById("ft-panel")) return true;

    window.input = window.input || {};

    var style = document.createElement("style");
    style.textContent =
      "#ft-panel{max-width:100%;margin:0.35rem 0.5rem 0;text-align:left;font-family:var(--th-font, inherit);color:var(--th-text, inherit);background:var(--box-color, #ebebeb);border-radius:var(--th-radius, 3px);padding:0.6rem 0.8rem;box-sizing:border-box;}" +
      "#ft-panel .ft-head{font-size:0.82rem;font-weight:700;opacity:0.75;margin-bottom:0.45rem;letter-spacing:0.01em;}" +
      "#ft-panel .ft-head-sub{font-weight:400;opacity:0.6;font-size:0.72rem;}" +
      "#ft-panel .ft-style{font-size:0.78rem;line-height:1.45;margin:0 0 0.55rem;padding:0.4rem 0.55rem;border:1px solid var(--th-border, #ccc);border-left:3px solid var(--th-accent, #2b6bf0);border-radius:calc(var(--th-radius, 3px) - 3px);background:var(--th-field, #fff);opacity:0.9;}" +
      "#ft-panel .ft-style[hidden]{display:none;}" +
      "#ft-panel .ft-grid{display:grid;grid-template-columns:repeat(auto-fit, minmax(170px, 1fr));gap:0.55rem 1rem;align-items:end;}" +
      "#ft-panel .ft-ctl{min-width:0;}" +
      "#ft-panel .ft-label{display:flex;justify-content:space-between;align-items:center;font-size:0.78rem;font-weight:600;margin-bottom:0.2rem;gap:0.4rem;}" +
      "#ft-panel .ft-val{font-variant-numeric:tabular-nums;color:var(--th-accent, #2b6bf0);font-weight:700;}" +
      "#ft-panel input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:999px;background:var(--th-border, rgba(128,128,128,0.4));outline:none;cursor:pointer;accent-color:var(--th-accent, #2b6bf0);}" +
      "#ft-panel input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:18px;height:18px;border-radius:50%;background:var(--th-accent, #2b6bf0);cursor:pointer;}" +
      "#ft-panel input[type=range]::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:var(--th-accent, #2b6bf0);cursor:pointer;border:none;}" +
      "#ft-panel input[type=number],#ft-panel input[type=text]{width:100%;box-sizing:border-box;padding:0.4rem 0.55rem;font-size:0.85rem;font-family:inherit;color:inherit;background:var(--th-field, #fff);border:1px solid var(--th-border, #ccc);border-radius:calc(var(--th-radius, 3px) - 3px);outline:none;}" +
      "#ft-panel input:focus{outline:2px solid var(--th-accent, #2b6bf0);outline-offset:1px;}" +
      "#ft-panel .ft-head{cursor:pointer;display:flex;align-items:center;gap:0.45rem;}" +
      "#ft-panel .ft-head .ft-chev{flex:none;width:1.1em;text-align:center;opacity:0.7;}" +
      "#ft-panel .ft-head:focus-visible{outline:2px solid var(--th-accent);outline-offset:2px;border-radius:6px;}" +
      "#ft-panel[data-collapsed=\"1\"] .ft-style,#ft-panel[data-collapsed=\"1\"] .ft-grid{display:none;}" +
      "#ft-panel[data-collapsed=\"1\"] .ft-head{margin-bottom:0;}";
    document.head.appendChild(style);

    var panel = document.createElement("div");
    panel.id = "ft-panel";
    panel.innerHTML =
      '<div class="ft-head">⚙️ Fine-tune <span class="ft-head-sub">guidance · seed · signature</span></div>' +
      '<div class="ft-style" id="ft-style" hidden></div>' +
      '<div class="ft-grid">' +
        '<div class="ft-ctl">' +
          '<label class="ft-label" for="ft-guidance">🎚️ Guidance <span class="ft-val" id="ft-guidance-val">🎲 Random</span></label>' +
          '<input type="range" id="ft-guidance" min="1" max="31" step="1" value="31" title="31 = Random (rolls 7-30 per image)">' +
        '</div>' +
        '<div class="ft-ctl">' +
          '<label class="ft-label" for="ft-seed">🌱 Seed</label>' +
          '<input type="number" id="ft-seed" min="0" step="1" placeholder="random">' +
        '</div>' +
        '<div class="ft-ctl">' +
          '<label class="ft-label" for="ft-sig">✍️ Signature</label>' +
          '<input type="text" id="ft-sig" placeholder="your name">' +
        '</div>' +
      '</div>';

    (function initFtHead() {
      var head = panel.querySelector(".ft-head");
      if (head) {
        head.id = "ft-head";
        head.setAttribute("role", "button");
        head.setAttribute("tabindex", "0");
        head.title = "Show/hide fine-tune controls";
        var chev = document.createElement("span");
        chev.className = "ft-chev";
        chev.setAttribute("aria-hidden", "true");
        head.insertBefore(chev, head.firstChild);
      }
    })();
    var slider = panel.querySelector("#ft-guidance");
    var sliderVal = panel.querySelector("#ft-guidance-val");
    var seedInput = panel.querySelector("#ft-seed");
    var sigInput = panel.querySelector("#ft-sig");

    slider.addEventListener("input", function() {
      // CFG (copied from best-image-generator-by-nexora): 1-30 fixed, 31 = Random.
      window.input.guidance = slider.value;
      paintGuidance();
      try { localStorage[LS("guidance")] = slider.value; } catch(e) {}
    });
    seedInput.addEventListener("input", function() {
      window.input.seed = seedInput.value;
      try { localStorage[LS("seed")] = seedInput.value; } catch(e) {}
    });
    sigInput.addEventListener("input", function() {
      window.input.signature = sigInput.value;
      try { localStorage[LS("signature")] = sigInput.value; } catch(e) {}
    });

    var savedG, savedS, savedSig;
    try { savedG = localStorage[LS("guidance")]; savedS = localStorage[LS("seed")]; savedSig = localStorage[LS("signature")]; } catch(e) {}
    function paintGuidance() {
      var n = Math.round(Number(slider.value));
      sliderVal.textContent = n >= 31 ? "🎲 Random" : String(n);
    }
    if (savedG !== null && savedG !== undefined && savedG !== "") {
      // Migrate old saves (the previous slider was 1-15 step 0.5): round to a
      // whole 1-31 value; anything unparseable falls back to 🎲 Random.
      var gn = Math.round(Number(savedG));
      slider.value = Number.isFinite(gn) ? Math.max(1, Math.min(31, gn)) : 31;
      window.input.guidance = slider.value;
    } else {
      slider.value = 31;
      window.input.guidance = slider.value;
    }
    paintGuidance();
    if (savedS !== null && savedS !== undefined && savedS !== "") {
      seedInput.value = savedS; window.input.seed = savedS;
    }
    if (savedSig !== null && savedSig !== undefined && savedSig !== "") {
      sigInput.value = savedSig; window.input.signature = savedSig;
    }

    /* 🎨 Style info line: shows the one-line description of the style currently picked in
       the 🎨 Art Style dropdown. The 93 styles ported from perchance.org/multistyle-image-lab
       carry a `description` (translated from the source site's Spanish); the plain
       t2i-styles options don't, so the line simply hides for them. */
    var styleInfo = panel.querySelector("#ft-style");
    function styleNode(label) {
      var inputs = window.___userSettings746291937 && window.___userSettings746291937.userInputs;
      var opts = inputs && inputs.artStyle && inputs.artStyle.compiledOptions;
      if (!opts) return null;
      if (opts[label]) return opts[label];
      for (var k in opts) {
        var nd = opts[k];
        if (nd && typeof nd.getName === "function" && nd.getName() === label) return nd;
      }
      return null;
    }
    function refreshStyleInfo() {
      if (!styleInfo) return;
      var sel = document.querySelector('select[data-name="artStyle"]');
      var label = sel && sel.options.length && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].textContent : "";
      var node = label ? styleNode(label) : null;
      var text = "";
      if (node && node.description) {
        try { text = String(node.description.evaluateItem != null ? node.description.evaluateItem : node.description); }
        catch (e) { text = String(node.description); }
        text = text.trim();
      }
      if (!text) { styleInfo.hidden = true; styleInfo.textContent = ""; return; }
      styleInfo.hidden = false;
      styleInfo.innerHTML = "";
      var b = document.createElement("b");
      b.textContent = "🎨 " + label + " — ";
      styleInfo.appendChild(b);
      styleInfo.appendChild(document.createTextNode(text));
    }
    if (styleInfo) {
      document.addEventListener("change", function(e) {
        var t = e.target;
        if (t && t.dataset && t.dataset.name === "artStyle") refreshStyleInfo();
      });
      refreshStyleInfo();
      setTimeout(refreshStyleInfo, 1500);
    }

    ctn.parentNode.insertBefore(panel, ctn.nextSibling);
    (function initFtCollapse() {
      var LS_FT = "t2iFtCollapsed";
      var head = panel.querySelector("#ft-head");
      var chev = panel.querySelector(".ft-chev");
      function paintFt(collapsed) {
        panel.dataset.collapsed = collapsed ? "1" : "0";
        if (chev) chev.textContent = collapsed ? "▸" : "▾";
        if (head) head.setAttribute("aria-expanded", collapsed ? "false" : "true");
      }
      var collapsed = true;
      try { collapsed = localStorage[LS_FT] !== "0"; } catch (e) {}
      function toggleFt() {
        var next = panel.dataset.collapsed !== "0" ? false : true;
        try { localStorage[LS_FT] = next ? "1" : "0"; } catch (e) {}
        paintFt(next);
      }
      if (head) {
        head.addEventListener("click", toggleFt);
        head.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleFt(); }
        });
      }
      paintFt(collapsed);
    })();
    return true;
  }
  var tries = 0;
  (function poll() {
    if (!init() && tries++ < 40) setTimeout(poll, 300);
  })();
})();

/* ===== Image Generator: gallery-moved link (public gallery now lives in Pro) ===== */
(function() {
  function init() {
    var anchor = document.getElementById("imageGalleryCtn8569284");
    if (!anchor || !anchor.parentNode) return false;
    if (document.getElementById("gen-gallery-moved")) return true;
    var style = document.createElement("style");
    style.textContent =
      "#gen-gallery-moved{max-width:700px;margin:1rem auto 0;padding:0.7rem 1rem;text-align:center;font-size:0.9rem;border:1px dashed var(--th-border, #ccc);border-radius:8px;background:var(--box-color, #ebebeb);}" +
      "#gen-gallery-moved button{cursor:pointer;font:inherit;font-weight:700;color:var(--th-accent, #2b6bf0);background:none;border:none;padding:0;text-decoration:underline;}";
    document.head.appendChild(style);
    var bar = document.createElement("div");
    bar.id = "gen-gallery-moved";
    bar.innerHTML = '🌟 The public gallery moved — <button type="button">browse it in the Community tab →</button>';
    bar.querySelector("button").addEventListener("click", function() {
      if (window.openPublicGallery) window.openPublicGallery();
      else if (window.showTab) window.showTab("comm");
    });
    anchor.parentNode.insertBefore(bar, anchor);
    return true;
  }
  var tries = 0;
  (function poll() {
    if (!init() && tries++ < 40) setTimeout(poll, 300);
  })();
})();

/* ===== Image Generator: Mode switcher (✨ Simple · 🧩 Basic · 🎛️ Advanced) =====
   Ported from perchance.org/nexora-free-ai-anime-generator.
   - ✨ Simple: type an idea, the AI writes the prompt and picks the style/shape/negative/count.
   - 🧩 Basic: the normal option form (default).
   - 🎛️ Advanced: full control — also reveals the 🗒️ Scratchpad (variable definitions).
   Also wires the per-image counter that powers the "All (4 ratios)" / "🎲 Random" shapes. */
(function() {
  "use strict";

  var NORMALIZE = function(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); };
  var INPUTS = function() { return window.___userSettings746291937 && window.___userSettings746291937.userInputs; };

  function setInputVisible(name, visible) {
    var el = document.querySelector('[data-name="' + name + '"]');
    if (el && el.closest(".input-ctn")) el.closest(".input-ctn").style.display = visible ? "" : "none";
  }

  var HINTS = {
    simple: "Describe your idea — the AI writes the prompt and picks the style, shape, negative and image count for you.",
    basic: "Choose your options, then hit generate.",
    advanced: "Full control: seed lab, per-image variations, negative presets, prompt inspector and the scratchpad."
  };

  function buildUI() {
    var imggen = document.getElementById("i2p-imggen");
    if (!imggen) return false;
    if (document.getElementById("nexModeBar")) return true;

    var style = document.createElement("style");
    style.textContent =
      "#nexModeBar{display:flex;justify-content:center;gap:0.5rem;margin:0.6rem auto 0.25rem;flex-wrap:wrap;}" +
      "#nexModeBar .nex-mode-btn{cursor:pointer;font-size:0.88rem;font-family:var(--th-font, inherit);padding:0.45rem 1rem;border-radius:999px;border:1px solid var(--th-border);background:var(--th-surface, #eee);color:inherit;transition:background 0.15s, color 0.15s, border-color 0.15s;}" +
      "#nexModeBar .nex-mode-btn:hover{border-color:var(--th-accent);}" +
      "#nexModeBar .nex-mode-btn.active{background:var(--th-accent);border-color:var(--th-accent);color:var(--th-accent-text);font-weight:600;}" +
      "#nexModeHint{text-align:center;font-size:0.8rem;opacity:0.7;margin:0.15rem auto 0.4rem;max-width:640px;}" +
      "#nexSimpleCtn{text-align:center;margin:0.4rem auto 0.7rem;max-width:760px;}" +
      "#nexSimpleCtn .nex-simple-row{display:flex;align-items:stretch;justify-content:center;gap:0.5rem;flex-wrap:wrap;}" +
      "#nexSimpleInput{flex:1 1 380px;min-height:3.4rem;max-width:100%;padding:0.6rem 0.7rem;box-sizing:border-box;border-radius:var(--th-radius, 8px);border:1px solid var(--th-border);background:var(--th-field, #fff);color:inherit;font-size:1rem;font-family:inherit;resize:vertical;}" +
      "#nexSimpleInput:focus{outline:2px solid var(--th-accent);outline-offset:1px;}" +
      "#nexSimpleGenBtn{font-size:1.05rem;padding:0 1.4rem;border-radius:var(--th-radius, 8px);cursor:pointer;border:none;background:var(--th-accent);color:var(--th-accent-text);font-weight:700;min-height:3.4rem;}" +
      "#nexSimpleGenBtn:disabled{opacity:0.6;cursor:default;}" +
      "#nexSimpleStatus{min-height:1.2rem;margin-top:0.45rem;font-size:0.85rem;opacity:0.8;}";
    document.head.appendChild(style);

    var bar = document.createElement("div");
    bar.id = "nexModeBar";
    var modes = [["simple", "✨ Simple"], ["basic", "🧩 Basic"], ["advanced", "🎛️ Advanced"]];
    for (var i = 0; i < modes.length; i++) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "nex-mode-btn";
      b.dataset.mode = modes[i][0];
      b.textContent = modes[i][1];
      b.addEventListener("click", function() { setMode(this.dataset.mode); });
      bar.appendChild(b);
    }

    var hint = document.createElement("div");
    hint.id = "nexModeHint";

    var simple = document.createElement("div");
    simple.id = "nexSimpleCtn";
    simple.hidden = true;
    simple.innerHTML =
      '<div class="nex-simple-row">' +
        '<textarea id="nexSimpleInput" placeholder="Describe anything... e.g. a dragon girl meditating on a floating island at sunset"></textarea>' +
        '<button id="nexSimpleGenBtn" type="button">✨ generate</button>' +
      '</div>' +
      '<div id="nexSimpleStatus"></div>';

    imggen.insertBefore(simple, imggen.firstChild);
    imggen.insertBefore(hint, imggen.firstChild);
    imggen.insertBefore(bar, imggen.firstChild);
    return true;
  }

  function setMode(mode) {
    window.t2iMode = mode;
    document.documentElement.classList.toggle("adv-mode", mode === "advanced");
    document.querySelectorAll(".nex-mode-btn").forEach(function(b) { b.classList.toggle("active", b.dataset.mode === mode); });
    var hint = document.getElementById("nexModeHint");
    if (hint) hint.textContent = HINTS[mode] || "";

    var simpleCtn = document.getElementById("nexSimpleCtn");
    if (simpleCtn) simpleCtn.hidden = mode !== "simple";

    var minimal = mode === "simple";
    var inputsCtn = document.getElementById("userInputsCtn8462746262");
    if (inputsCtn) inputsCtn.style.display = minimal ? "none" : "flex";
    var ftPanel = document.getElementById("ft-panel");
    if (ftPanel) ftPanel.style.display = minimal ? "none" : "";
    var genBtn = document.getElementById("generateButtonEl");
    if (genBtn && genBtn.parentElement) genBtn.parentElement.style.display = minimal ? "none" : "";
    var shareCtn = document.getElementById("shareLinkOuterCtn2893827");
    if (shareCtn) shareCtn.style.display = minimal ? "none" : "";

    // The framework's own scratchpad user input is permanently hidden (see main.pjs); the custom
    // 🗒️ Scratchpad panel (#t2iScratchPanel) takes its place and — like the 🎛️ Advanced Workbench —
    // is only shown in Advanced mode (CSS `html:not(.adv-mode)` rules handle both, even though the
    // scratchpad panel is built asynchronously long after this runs).
    document.dispatchEvent(new CustomEvent("nex-mode-change", { detail: { mode: mode } }));
  }

  function setFrameworkInput(name, value) {
    var el = document.querySelector('[data-name="' + name + '"]');
    if (!el) return false;
    if (el.tagName === "SELECT") {
      var opt = null;
      for (var i = 0; i < el.options.length; i++) if (el.options[i].value === String(value)) { opt = el.options[i]; break; }
      if (!opt) return false;
      el.value = String(value);
      if (el.onchange) el.onchange({});
      return true;
    }
    el.value = String(value);
    if (el.oninput) el.oninput({});
    return true;
  }

  async function planFromIdea(idea) {
    var entries = [];
    var opts = INPUTS() && INPUTS().artStyle && INPUTS().artStyle.compiledOptions;
    if (opts) {
      for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) entries.push([k, opts[k]]);
    }
    var styles = entries.filter(function(e) { return e[1] && e[1].prompt; }).map(function(e) { return e[0]; });
    if (styles.length > 80) {
      var stride = Math.ceil(styles.length / 80);
      var sampled = [];
      for (var j = 0; j < styles.length; j += stride) sampled.push(styles[j]);
      styles = sampled;
    }
    var res = await root.generateText({
      instruction: "You are the prompt engineer for a free AI image generator. The user gave a rough idea: \"" + idea + "\".\n\nDecide everything yourself, then output ONLY a single JSON object with exactly these keys:\n- \"prompt\": a detailed, high-quality image prompt (2-4 sentences, vivid and specific: subject, appearance, pose, outfit, setting, lighting, mood, camera angle). Do NOT include art-style names or negative things in it.\n- \"style\": the art style to use, EXACTLY one of these names: " + styles.join(", ") + ". Pick the one that best fits the idea.\n- \"shape\": EXACTLY one of: \"512x512\", \"512x768\", \"768x512\", \"768x768\".\n- \"negative\": a short comma-separated list of things to avoid (e.g. low quality, deformed hands). Use \"\" if nothing obvious.\n- \"numImages\": a number, EXACTLY one of: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16.\n\nOutput the JSON and nothing else.",
      stopSequences: []
    });
    var m = String(res.text).match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no json in llm response");
    var plan = JSON.parse(m[0]);
    if (!plan.prompt) throw new Error("llm gave no prompt");
    return plan;
  }

  function applyPlan(plan) {
    setFrameworkInput("description", plan.prompt || "");
    setFrameworkInput("negative", plan.negative || "");
    if (plan.style) {
      var styleSel = document.querySelector('select[data-name="artStyle"]');
      if (styleSel) {
        for (var i = 0; i < styleSel.options.length; i++) {
          var o = styleSel.options[i];
          if (NORMALIZE(o.textContent) === NORMALIZE(plan.style)) {
            styleSel.value = o.value;
            if (styleSel.onchange) styleSel.onchange({});
            break;
          }
        }
      }
    }
    setFrameworkInput("shape", String(plan.shape || ""));
    setFrameworkInput("numImages", String(plan.numImages || ""));
  }

  function wireSimple() {
    var input = document.getElementById("nexSimpleInput");
    var btn = document.getElementById("nexSimpleGenBtn");
    var status = document.getElementById("nexSimpleStatus");
    if (!input || !btn || !status) return;
    if (window.__nexSimpleWired) return;
    window.__nexSimpleWired = true;

    var busy = false;
    btn.addEventListener("click", async function() {
      if (busy) return;
      var idea = input.value.trim();
      if (!idea) { status.textContent = "✍️ type a description first " + Quip.q("genIdea", "— the magic needs words"); return; }
      busy = true;
      btn.disabled = true;
      btn.textContent = "⏳ ...";
      status.textContent = "🧠 writing your prompt & picking options... " + Quip.q("genBrain", "consulting the idea raccoons...");
      try {
        var plan = await planFromIdea(idea);
        applyPlan(plan);
        var funnyBaseSimple = "🎨 " + plan.style + " · " + plan.shape + " · " + plan.numImages + " images — generating...";
        status.textContent = funnyBaseSimple;
        if (window.__nexSimpleFunnyStop) { try { window.__nexSimpleFunnyStop(); } catch (_e) {} }
        if (window.FunnyGen) { try { window.__nexSimpleFunnyStop = window.FunnyGen.start(function (line) { status.textContent = funnyBaseSimple + " " + line; }, 2800, 40); } catch (_e) {} }
        if (window.___generateButtonClickEvent746291937) window.___generateButtonClickEvent746291937({});
      } catch (e) {
        console.error(e);
        status.textContent = "⚠️ something went wrong " + Quip.q("genFail", "— try again");
      } finally {
        setTimeout(function() {
          busy = false;
          btn.disabled = false;
          btn.textContent = "✨ generate";
        }, 4000);
      }
    });
    input.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); btn.click(); }
    });
  }

  function installCounter() {
    if (!window.___t2iImageIndexInstalled && window.___getImageOptions746291937) {
      window.___t2iImageIndexInstalled = true;
      var orig = window.___getImageOptions746291937;
      window.___getImageOptions746291937 = function() {
        var r = orig.apply(this, arguments);
        window.___t2iImageIndex = (window.___t2iImageIndex || 0) + 1;
        return r;
      };
    }
  }

  var tries = 0;
  (function boot() {
    if (!window.___userSettings746291937 || !document.getElementById("userInputsCtn8462746262")) {
      if (tries++ < 60) setTimeout(boot, 300);
      return;
    }
    installCounter();
    if (buildUI()) {
      wireSimple();
      setMode("basic");
    } else if (tries++ < 60) {
      setTimeout(boot, 300);
    }
  })();

  window.__nexoraMode = { setMode: setMode, planFromIdea: planFromIdea, applyPlan: applyPlan, setFrameworkInput: setFrameworkInput };
})();

/* ===== Image Generator: Prompt tools (✨ Enhance · 📚 Vault · ▸ Send · 🔗 Recipe) =====
   A compact toolbar under the Fine-tune panel. Everything reads/writes the framework's
   own inputs so it stays in sync with generation. */
(function () {
  "use strict";
  function note(msg) { if (window.vaultToast) window.vaultToast(msg); else console.log(msg); }
  function q(name) { return document.querySelector('#i2p-imggen [data-name="' + name + '"]'); }
  function valOf(name) { var e = q(name); return e ? e.value : ""; }
  function setVal(name, v) {
    if (v === undefined || v === null) return;
    if (window.__nexoraMode && window.__nexoraMode.setFrameworkInput) { window.__nexoraMode.setFrameworkInput(name, v); return; }
    var e = q(name); if (!e) return;
    e.value = v;
    if (e.oninput) e.oninput({});
    e.dispatchEvent(new Event("input", { bubbles: true }));
    e.dispatchEvent(new Event("change", { bubbles: true }));
  }

  var busy = false;
  async function enhance(btn) {
    var el = q("description");
    if (!el) return;
    var idea = (el.value || "").trim();
    if (!idea) { note("✍️ write a rough idea first — Enhance will expand it"); try { el.focus(); } catch (e) {} return; }
    if (busy) return;
    if (!window.root || !window.root.generateText) { note("⚠️ AI text not ready"); return; }
    busy = true;
    var old = btn.textContent;
    btn.disabled = true; btn.textContent = "⏳ enhancing…";
    var out = "";
    try {
      window.root.generateText({
        instruction: "You are a prompt engineer for a free AI image generator. Rewrite the user's rough idea below into ONE vivid, detailed image prompt (2-4 sentences). Cover subject, appearance, pose, outfit, setting, lighting, mood, and camera angle. Do not name art styles, do not add negatives, do not add commentary or quotes. Output only the prompt.\n\nRough idea: " + idea,
        onChunk: function (d) {
          if (!d || !d.textChunk) return;
          out += d.textChunk;
          el.value = out;
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
      note("✨ prompt enhanced");
    } catch (e) { console.error(e); note("⚠️ enhance failed"); }
    finally { busy = false; btn.disabled = false; btn.textContent = old; }
  }

  function pushVault() {
    if (!window.Vault) { note("⚠️ vault still loading…"); return; }
    window.Vault.pick(function (text) { setVal("description", text); note("📚 loaded from vault"); });
  }
  function sendIt(btn) {
    if (!window.PromptBridge) { note("⚠️ bridge still loading…"); return; }
    var t = (valOf("description") || "").trim();
    if (!t) { note("✍️ nothing to send yet"); return; }
    window.PromptBridge.sendTo(t, { anchor: btn, preview: t });
  }
  function shareRecipe() {
    if (!window.Recipe) { note("⚠️ recipes still loading…"); return; }
    var fi = window.input || {};
    window.Recipe.copy("gen", {
      description: valOf("description"), negative: valOf("negative"),
      artStyle: valOf("artStyle"), shape: valOf("shape"), numImages: valOf("numImages"),
      guidance: fi.guidance, seed: fi.seed, signature: fi.signature
    });
  }

  window.__genApplyRecipe = function (data) {
    if (!data) return;
    if (data.description != null) setVal("description", data.description);
    if (data.negative != null) setVal("negative", data.negative);
    if (data.artStyle) setVal("artStyle", data.artStyle);
    if (data.shape) setVal("shape", data.shape);
    if (data.numImages) setVal("numImages", String(data.numImages));
    if (data.guidance != null) { var g = document.getElementById("ft-guidance"); if (g) { g.value = data.guidance; g.dispatchEvent(new Event("input")); } }
    if (data.seed != null && data.seed !== "") { var s = document.getElementById("ft-seed"); if (s) { s.value = data.seed; s.dispatchEvent(new Event("input")); } }
    if (data.signature != null) { var sig = document.getElementById("ft-sig"); if (sig) { sig.value = data.signature; sig.dispatchEvent(new Event("input")); } }
    note("🔗 recipe applied");
  };

  function build() {
    var ftp = document.getElementById("ft-panel");
    if (!ftp) return false;
    if (document.getElementById("gen-tools")) return true;
    var style = document.createElement("style");
    style.textContent =
      "#gen-tools{max-width:100%;margin:0.35rem 0.5rem 0;font-family:var(--th-font,inherit);text-align:center;}" +
      "#gen-tools .gen-tools-head{cursor:pointer;font:inherit;font-size:0.82rem;font-weight:700;opacity:0.75;border:none;background:transparent;color:inherit;padding:0.25rem 0.5rem;display:inline-flex;align-items:center;gap:0.45rem;}" +
      "#gen-tools .gen-tools-head:hover{opacity:1;}" +
      "#gen-tools .gen-tools-head:focus-visible{outline:2px solid var(--th-accent);outline-offset:2px;border-radius:6px;}" +
      "#gen-tools .gen-tools-chev{width:1.1em;text-align:center;opacity:0.7;}" +
      "#gen-tools .gen-tools-body{display:flex;gap:0.4rem;flex-wrap:wrap;align-items:center;justify-content:center;margin-top:0.25rem;}" +
      "#gen-tools[data-collapsed=\"1\"] .gen-tools-body{display:none;}" +
      "#gen-tools .gen-tools-body button{cursor:pointer;font:inherit;font-size:0.84rem;border:1px solid var(--th-border,#ccc);background:var(--th-surface,#eee);color:inherit;border-radius:999px;padding:0.35rem 0.8rem;}" +
      "#gen-tools .gen-tools-body button:hover{border-color:var(--th-accent,#2b6bf0);}" +
      "#gen-tools .gen-tools-body button:disabled{opacity:0.6;cursor:default;}";
    document.head.appendChild(style);
    var bar = document.createElement("div");
    bar.id = "gen-tools";
    var thead = document.createElement("button");
    thead.type = "button";
    thead.className = "gen-tools-head";
    thead.title = "Show/hide prompt tools";
    thead.setAttribute("aria-expanded", "false");
    var tchev = document.createElement("span");
    tchev.className = "gen-tools-chev";
    tchev.setAttribute("aria-hidden", "true");
    tchev.textContent = "▸";
    thead.appendChild(tchev);
    thead.appendChild(document.createTextNode("Prompt tools"));
    bar.appendChild(thead);
    var tbody = document.createElement("div");
    tbody.className = "gen-tools-body";
    bar.appendChild(tbody);
    var defs = [
      ["✨ Enhance", function (b) { enhance(b); }, "Let the AI expand your rough idea into a detailed prompt"],
      ["📚 Vault", function () { pushVault(); }, "Load a saved prompt from your vault"],
      ["▸ Send to…", function (b) { sendIt(b); }, "Send this prompt to another tab"],
      ["🔗 Share recipe", function () { shareRecipe(); }, "Copy a link that restores these settings"]
    ];
    defs.forEach(function (d) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = d[0]; b.title = d[2];
      b.addEventListener("click", function () { d[1](b); });
      tbody.appendChild(b);
    });
    (function initToolsCollapse() {
      var LS_T = "t2iToolsCollapsed";
      function paintT(collapsed) {
        bar.dataset.collapsed = collapsed ? "1" : "0";
        tchev.textContent = collapsed ? "▸" : "▾";
        thead.setAttribute("aria-expanded", collapsed ? "false" : "true");
      }
      var collapsed = true;
      try { collapsed = localStorage[LS_T] !== "0"; } catch (e) {}
      thead.addEventListener("click", function () {
        var next = bar.dataset.collapsed !== "0" ? false : true;
        try { localStorage[LS_T] = next ? "1" : "0"; } catch (e) {}
        paintT(next);
      });
      paintT(collapsed);
    })();
    ftp.parentNode.insertBefore(bar, ftp.nextSibling);

    document.addEventListener("nex-mode-change", function (e) {
      var t = document.getElementById("gen-tools");
      if (t) t.hidden = (e.detail && e.detail.mode) === "simple";
    });
    bar.hidden = window.t2iMode === "simple";
    return true;
  }
  var tries = 0;
  (function poll() { if (!build() && tries++ < 50) setTimeout(poll, 300); })();
})();

/* ===== Image Generator: 🎛️ Advanced Workbench =====
   The extra toolkit that only exists in Advanced mode:
     🧪 Prompt inspector  — live preview of the exact prompt/anti-description that will be sent.
     🌱 Seed lab          — randomise, lock a base seed, and (optionally) increment it per image so a
                            batch explores neighbouring seeds instead of repeating one.
     🎞️ Variations        — one line per image, appended to that image's prompt (uses the per-image
                            counter that also powers the "All (4 ratios)" shape).
     🚫 Negative presets  — toggleable common anti-description phrases.
   The generation hooks live in main.pjs (advVariations/advNegativeExtra/advSeedValue, wired into
   `settings.imageOptions`), reading the shared `window.___advState` object this panel keeps in sync. */
(function () {
  "use strict";

  var LS_KEY = "advWorkbenchState";
  var NEG_PRESETS = [
    ["quality", "low quality, worst quality, blurry, jpeg artifacts, low resolution"],
    ["anatomy", "bad hands, extra fingers, extra limbs, deformed, disfigured, bad anatomy"],
    ["text", "watermark, signature, text, logo, username, artist name"],
    ["duplicates", "duplicated, cloned face, multiple heads, extra ears"],
    ["clutter", "cluttered background, busy composition, messy"]
  ];

  function defaultState() {
    return { variationsOn: false, variations: "", negativeOn: false, negativeChips: [], lockSeed: false, lockedSeed: null, stepSeed: false, seedStep: 1, descWeight: 0 };
  }
  function loadState() {
    var st = defaultState();
    try {
      var raw = localStorage[LS_KEY];
      if (raw) {
        var saved = JSON.parse(raw);
        for (var k in st) if (Object.prototype.hasOwnProperty.call(saved, k)) st[k] = saved[k];
      }
    } catch (e) {}
    if (!Array.isArray(st.negativeChips)) st.negativeChips = [];
    window.___advState = st;
  }
  function saveState() { try { localStorage[LS_KEY] = JSON.stringify(window.___advState); } catch (e) {} }

  function copyToClipboard(text, btn) {
    function done() { if (btn) { var old = btn.textContent; btn.textContent = "✅"; setTimeout(function () { btn.textContent = old; }, 1200); } }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    ta.remove();
  }

  function init() {
    var imggen = document.getElementById("i2p-imggen");
    var simpleCtn = document.getElementById("nexSimpleCtn");
    if (!imggen || !simpleCtn) return false;
    if (document.getElementById("adv-panel")) return true;

    loadState();
    var st = window.___advState;

    var style = document.createElement("style");
    style.textContent =
      "html:not(.adv-mode) #adv-panel{display:none !important;}" +
      "html:not(.adv-mode) #t2iScratchPanel{display:none !important;}" +
      "#adv-panel{max-width:1000px;margin:0.5rem auto 0.75rem;padding:0.7rem 0.85rem;box-sizing:border-box;text-align:left;font-family:var(--th-font,inherit);color:var(--th-text,inherit);background:var(--box-color, #ebebeb);border-radius:var(--th-radius, 8px);}" +
      "#adv-panel .adv-head{font-size:0.86rem;font-weight:700;opacity:0.8;margin-bottom:0.55rem;letter-spacing:0.01em;}" +
      "#adv-panel .adv-head-sub{font-weight:400;opacity:0.6;font-size:0.74rem;}" +
      "#adv-panel .adv-grid{display:grid;grid-template-columns:repeat(auto-fit, minmax(min(320px, 100%), 1fr));gap:0.7rem;align-items:start;}" +
      "#adv-panel .adv-card{background:var(--th-surface, rgba(255,255,255,0.35));border:1px solid var(--th-border, rgba(128,128,128,0.35));border-radius:calc(var(--th-radius, 8px) - 2px);padding:0.55rem 0.65rem;min-width:0;}" +
      "#adv-panel .adv-card h4{margin:0 0 0.45rem;font-size:0.82rem;font-weight:700;opacity:0.85;}" +
      "#adv-panel .adv-row{display:flex;align-items:center;gap:0.4rem;margin-bottom:0.35rem;}" +
      "#adv-panel .adv-row.adv-top{align-items:flex-start;justify-content:space-between;}" +
      "#adv-panel label.adv-mini{font-size:0.76rem;font-weight:600;opacity:0.8;}" +
      "#adv-panel .adv-count{font-size:0.72rem;opacity:0.6;font-variant-numeric:tabular-nums;}" +
      "#adv-panel textarea,#adv-panel input[type=number],#adv-panel input[type=text]{width:100%;box-sizing:border-box;padding:0.4rem 0.5rem;font-size:0.82rem;font-family:inherit;color:inherit;background:var(--th-field, #fff);border:1px solid var(--th-border, #ccc);border-radius:calc(var(--th-radius, 8px) - 4px);outline:none;resize:vertical;}" +
      "#adv-panel textarea:focus,#adv-panel input:focus{outline:2px solid var(--th-accent, #2b6bf0);outline-offset:1px;}" +
      "#adv-panel input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:999px;background:var(--th-border, rgba(128,128,128,0.4));outline:none;cursor:pointer;accent-color:var(--th-accent, #2b6bf0);}" +
      "#adv-panel input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:18px;height:18px;border-radius:50%;background:var(--th-accent, #2b6bf0);cursor:pointer;}" +
      "#adv-panel input[type=range]::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:var(--th-accent, #2b6bf0);cursor:pointer;border:none;}" +
      "#adv-panel textarea[readonly]{opacity:0.92;cursor:text;}" +
      "#adv-panel .adv-btn{cursor:pointer;font:inherit;font-size:0.78rem;border:1px solid var(--th-border, #ccc);background:var(--th-surface, #eee);color:inherit;border-radius:999px;padding:0.28rem 0.7rem;white-space:nowrap;}" +
      "#adv-panel .adv-btn:hover{border-color:var(--th-accent, #2b6bf0);}" +
      "#adv-panel .adv-btn.active{background:var(--th-accent, #2b6bf0);border-color:var(--th-accent, #2b6bf0);color:var(--th-accent-text, #fff);font-weight:600;}" +
      "#adv-panel .adv-btn.adv-icon{padding:0.28rem 0.5rem;}" +
      "#adv-panel .adv-check{display:flex;align-items:center;gap:0.4rem;font-size:0.78rem;margin:0.1rem 0 0.4rem;cursor:pointer;}" +
      "#adv-panel .adv-check input{width:auto;}" +
      "#adv-panel .adv-hint{font-size:0.72rem;opacity:0.62;line-height:1.35;margin-top:0.3rem;word-break:break-word;}" +
      "#adv-panel .adv-chips{display:flex;flex-wrap:wrap;gap:0.35rem;margin-bottom:0.3rem;}" +
      "#adv-panel .adv-step{width:4.5rem;flex:0 0 auto;}" +
      "#adv-panel input.adv-step{width:4.5rem;}" +
      "#adv-panel .adv-seed{flex:1 1 auto;min-width:0;}" +
      "#adv-panel .adv-busy{animation:advPulse 1s ease-in-out infinite;}" +
      "#adv-panel .adv-sep{margin-top:0.5rem;border-top:1px solid var(--th-border, rgba(128,128,128,0.3));padding-top:0.45rem;}" +
      "#adv-panel #advAnalyzeOut{font-size:0.78rem;line-height:1.45;white-space:pre-wrap;word-break:break-word;margin-top:0.35rem;}" +
      "#adv-panel #advAnalyzeOut .adv-hit{color:var(--th-accent, #6cf);}" +
      "@keyframes advPulse{0%,100%{opacity:0.35;}50%{opacity:1;}}" +
      "#adv-panel .adv-head{cursor:pointer;display:flex;align-items:center;gap:0.45rem;}" +
      "#adv-panel .adv-head .adv-chev{flex:none;width:1.1em;text-align:center;opacity:0.7;}" +
      "#adv-panel .adv-head:focus-visible{outline:2px solid var(--th-accent);outline-offset:2px;border-radius:6px;}" +
      "#adv-panel[data-collapsed=\"1\"] .adv-grid{display:none;}" +
      "#adv-panel[data-collapsed=\"1\"] .adv-head{margin-bottom:0;}" +
      "#adv-panel .adv-card h4{cursor:pointer;display:flex;align-items:center;gap:0.4rem;}" +
      "#adv-panel .adv-card h4 .adv-chev{flex:none;width:1.1em;text-align:center;opacity:0.7;}" +
      "#adv-panel .adv-card h4:focus-visible{outline:2px solid var(--th-accent);outline-offset:2px;border-radius:6px;}" +
      "#adv-panel .adv-card[data-collapsed=\"1\"]>:not(h4){display:none;}";
    document.head.appendChild(style);

    var panel = document.createElement("div");
    panel.id = "adv-panel";
    panel.innerHTML =
      '<div class="adv-head">🎛️ Advanced Workbench <span class="adv-head-sub">seed lab · prompt weight · per-image variations · negative presets · prompt inspector</span></div>' +
      '<div class="adv-grid">' +

        '<section class="adv-card">' +
          '<h4>🧪 Prompt inspector</h4>' +
          '<div class="adv-row adv-top"><label class="adv-mini" for="advPromptPreview">prompt preview (next image)</label><span class="adv-count" id="advPromptCount"></span></div>' +
          '<textarea id="advPromptPreview" readonly rows="4"></textarea>' +
          '<div class="adv-row adv-top" style="margin-top:0.4rem;"><label class="adv-mini" for="advNegPreview">anti-description (next image)</label><span class="adv-count" id="advNegCount"></span></div>' +
          '<textarea id="advNegPreview" readonly rows="3"></textarea>' +
          '<div class="adv-row" style="margin:0.45rem 0 0;justify-content:flex-end;">' +
            '<button type="button" class="adv-btn adv-icon" id="advPromptCopyBtn" title="Copy the prompt">📋 prompt</button>' +
            '<button type="button" class="adv-btn adv-icon" id="advNegCopyBtn" title="Copy the anti-description">📋 anti</button>' +
            '<button type="button" class="adv-btn adv-icon" id="advRefreshBtn" title="Re-read the current inputs">🔄 refresh</button>' +
          '</div>' +
          '<div class="adv-sep">' +
            '<div class="adv-row adv-top"><label class="adv-mini" for="advUsedPrompt">prompt actually sent (first image)</label><span class="adv-count" id="advUsedMeta"></span></div>' +
            '<textarea id="advUsedPrompt" readonly rows="3" placeholder="Generate an image — the exact prompt recorded on the first image shows up here."></textarea>' +
            '<div class="adv-row" style="margin:0.45rem 0 0;gap:0.5rem;">' +
              '<button type="button" class="adv-btn" id="advAnalyzeBtn" title="Look at the first generated image and check whether every part of the prompt shows up in it">🔍 analyze first image</button>' +
              '<span class="adv-count" id="advAnalyzeStatus"></span>' +
            '</div>' +
            '<div id="advAnalyzeOut"></div>' +
          '</div>' +
        '</section>' +

        '<section class="adv-card">' +
          '<h4>🌱 Seed lab</h4>' +
          '<div class="adv-row">' +
            '<input type="number" id="advSeed" class="adv-seed" min="0" step="1" placeholder="random">' +
            '<button type="button" class="adv-btn adv-icon" id="advSeedRandBtn" title="Pick a random seed">🎲</button>' +
            '<button type="button" class="adv-btn" id="advSeedLockBtn" title="Keep this seed even when the field is blank">🔒 lock</button>' +
          '</div>' +
          '<label class="adv-check"><input type="checkbox" id="advStepToggle"> increment seed per image</label>' +
          '<div class="adv-row" style="margin-bottom:0.2rem;"><label class="adv-mini" for="advSeedStep">step</label><input type="number" id="advSeedStep" class="adv-step" min="1" step="1" value="1"></div>' +
          '<div class="adv-hint" id="advSeedPreview"></div>' +
        '</section>' +

        '<section class="adv-card">' +
          '<h4>⚖️ Prompt weight</h4>' +
          '<div class="adv-row adv-top"><label class="adv-mini" for="advWeight">description emphasis</label><span class="adv-count" id="advWeightVal">off</span></div>' +
          '<input type="range" id="advWeight" min="0" max="21" step="1" value="0" aria-label="Prompt description weight">' +
          '<div class="adv-hint" id="advWeightPreview"></div>' +
        '</section>' +

        '<section class="adv-card">' +
          '<h4>🎞️ Variations</h4>' +
          '<label class="adv-check"><input type="checkbox" id="advVarToggle"> append a different line to each image</label>' +
          '<textarea id="advVarLines" rows="5" placeholder="one variation per line, e.g.&#10;golden hour&#10;blue hour&#10;rainy night"></textarea>' +
          '<div class="adv-hint" id="advVarPreview"></div>' +
        '</section>' +

        '<section class="adv-card">' +
          '<h4>🚫 Negative presets</h4>' +
          '<label class="adv-check"><input type="checkbox" id="advNegToggle"> append the selected presets</label>' +
          '<div class="adv-chips" id="advNegChips"></div>' +
          '<div class="adv-hint" id="advNegChipPreview"></div>' +
        '</section>' +

      '</div>';

    // Title first: the framework H1 ("AI Image Generator") stays at the top of
    // the tab; the workbench docks right below it (still above the inputs).
    (function placeAdv() {
      var h1 = imggen.querySelector("h1");
      if (h1 && h1.parentNode === imggen) h1.parentNode.insertBefore(panel, h1.nextSibling);
      else simpleCtn.parentNode.insertBefore(panel, simpleCtn.nextSibling);
    })();

    var advSeed = panel.querySelector("#advSeed");
    var advSeedStep = panel.querySelector("#advSeedStep");
    var advStepToggle = panel.querySelector("#advStepToggle");
    var advSeedLockBtn = panel.querySelector("#advSeedLockBtn");
    var advVarToggle = panel.querySelector("#advVarToggle");
    var advVarLines = panel.querySelector("#advVarLines");
    var advNegToggle = panel.querySelector("#advNegToggle");
    var advNegChips = panel.querySelector("#advNegChips");
    var seedPreview = panel.querySelector("#advSeedPreview");
    var varPreview = panel.querySelector("#advVarPreview");
    var negChipPreview = panel.querySelector("#advNegChipPreview");
    var promptPreview = panel.querySelector("#advPromptPreview");
    var negPreview = panel.querySelector("#advNegPreview");
    var promptCount = panel.querySelector("#advPromptCount");
    var negCount = panel.querySelector("#advNegCount");
    var usedPrompt = panel.querySelector("#advUsedPrompt");
    var usedMeta = panel.querySelector("#advUsedMeta");
    var analyzeBtn = panel.querySelector("#advAnalyzeBtn");
    var analyzeStatus = panel.querySelector("#advAnalyzeStatus");
    var analyzeOut = panel.querySelector("#advAnalyzeOut");
    var ftSeed = document.getElementById("ft-seed");

    function numImages() {
      var sel = document.querySelector('#i2p-imggen [data-name="numImages"]');
      var n = sel ? Number(sel.value) : 6;
      return (!n || isNaN(n)) ? 6 : n;
    }
    function variationLines() {
      return String(st.variations || "").split("\n").map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
    }

    function renderNegChips() {
      advNegChips.innerHTML = "";
      NEG_PRESETS.forEach(function (p) {
        var active = st.negativeChips.indexOf(p[1]) >= 0;
        var b = document.createElement("button");
        b.type = "button";
        b.className = "adv-btn" + (active ? " active" : "");
        b.textContent = p[0];
        b.title = p[1];
        b.addEventListener("click", function () {
          var i = st.negativeChips.indexOf(p[1]);
          if (i >= 0) st.negativeChips.splice(i, 1); else st.negativeChips.push(p[1]);
          saveState(); renderNegChips(); refreshInspector();
        });
        advNegChips.appendChild(b);
      });
      negChipPreview.textContent = st.negativeChips.length ? ("adds: " + st.negativeChips.join(", ")) : "pick one or more presets";
    }

    function renderSeedPreview() {
      var raw = String(advSeed.value || "").trim();
      var base = raw !== "" ? Math.floor(Number(raw)) : (st.lockSeed ? st.lockedSeed : null);
      var n = numImages();
      if (base === null || base === undefined || isNaN(base)) {
        seedPreview.textContent = "no seed set — every image is random (use 🎲 to explore, 🔒 lock to make a batch reproducible)";
        return;
      }
      if (st.stepSeed) {
        var step = Math.floor(Number(st.seedStep)) || 1;
        var arr = [];
        for (var i = 0; i < Math.min(n, 5); i++) arr.push(base + i * step);
        seedPreview.textContent = "this batch: " + arr.join(", ") + (n > 5 ? " …" : "");
      } else {
        seedPreview.textContent = "seed " + base + " for all " + n + " image" + (n === 1 ? "" : "s");
      }
    }
    function renderVarPreview() {
      var lines = variationLines();
      var n = numImages();
      if (!st.variationsOn) {
        varPreview.textContent = lines.length ? (lines.length + " line" + (lines.length === 1 ? "" : "s") + " ready — tick the box to use them") : "one suffix per line; line 1 → image 1, etc.";
        return;
      }
      if (!lines.length) { varPreview.textContent = "add at least one line to use variations"; return; }
      var parts = [];
      for (var i = 0; i < Math.min(n, 3); i++) parts.push("img " + (i + 1) + " → " + lines[i % lines.length]);
      varPreview.textContent = parts.join(" · ") + (lines.length < n ? " (lines repeat for the rest)" : "");
    }

    var refreshTimer = null;
    function scheduleRefresh() {
      if (window.t2iMode !== "advanced") return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refreshInspector, 120);
    }
    async function refreshInspector() {
      if (window.t2iMode !== "advanced") return;
      if (typeof root.t2iComposedPrompt !== "function") { promptPreview.value = "(prompt preview unavailable — pjs not ready)"; return; }
      var p = "", n = "";
      try { p = String(root.t2iComposedPrompt() || ""); } catch (e) { p = "(could not evaluate prompt)"; }
      try { n = String(root.t2iComposedNegative() || ""); } catch (e) { n = "(could not evaluate anti-description)"; }
      var convOver = false;
      try {
        var cs = window.___convertState;
        if (cs && cs.use && String(cs.text || "").trim() && typeof root.t2iFinalPrompt === "function") {
          p = String(root.t2iFinalPrompt() || "");
          convOver = true;
        }
      } catch (eO) {}
      promptPreview.value = p;
      negPreview.value = n;
      promptCount.textContent = p.length + " chars · " + (p.trim() ? p.trim().split(/\s+/).length : 0) + " words" + (convOver ? " · 🔄 converted override" : "");
      negCount.textContent = n.length + " chars";
    }
    function refreshAll() {
      renderSeedPreview();
      renderWeight();
      renderVarPreview();
      refreshInspector();
      var o = firstImageOutput();
      if (o) showUsedPrompt(o);
    }

    // ---- first-image analysis ----
    function firstImageOutput() {
      var ctn = document.querySelector("#outputAreaEl .t2i-image-ctn");
      var ifr = ctn && ctn.querySelector("iframe");
      var out = ifr && ifr.textToImagePluginOutput;
      return (out && out.dataUrl) ? out : null;
    }
    function usedMetaText(inputs) {
      var bits = [];
      if (inputs.seed != null && inputs.seed !== "" && inputs.seed !== -1) bits.push("🌱 " + inputs.seed);
      if (inputs.guidanceScale != null) bits.push("🎚️ " + inputs.guidanceScale);
      bits.push((String(inputs.prompt || "").length) + " chars sent");
      return bits.join(" · ");
    }
    function showUsedPrompt(out) {
      usedPrompt.value = String((out.inputs && out.inputs.prompt) || "");
      usedMeta.textContent = usedMetaText(out.inputs || {});
      usedPrompt.style.height = "auto";
      usedPrompt.style.height = Math.min(usedPrompt.scrollHeight + 4, 260) + "px";
    }
    // After a generate click, wait for the first image's output object, then mirror the
    // exact prompt/seed/guidance that was actually sent for it.
    function watchedGenerate() {
      if (window.t2iMode !== "advanced") return;
      var tries = 0;
      (function poll() {
        var out = firstImageOutput();
        if (out) { showUsedPrompt(out); return; }
        if (tries++ < 240) setTimeout(poll, 1000);
      })();
    }

    var analyzing = false;
    async function analyzeFirstImage() {
      if (analyzing) return;
      var out = firstImageOutput();
      if (!out) {
        analyzeStatus.textContent = document.querySelector("#outputAreaEl .t2i-image-ctn") ? "⏳ waiting for the first image to finish…" : "⚠️ generate an image first";
        return;
      }
      if (typeof root.generateText !== "function") { analyzeStatus.textContent = "⚠️ AI text not ready"; return; }
      showUsedPrompt(out);
      var prompt = String((out.inputs && out.inputs.prompt) || "");
      if (!prompt) { analyzeStatus.textContent = "⚠️ no prompt recorded on this image"; return; }

      analyzing = true;
      analyzeBtn.disabled = true;
      analyzeStatus.textContent = "⏳ analyzing the first image…";
      analyzeStatus.classList.add("adv-busy");
      analyzeOut.textContent = "";
      var cursor = document.createElement("span");
      cursor.className = "adv-busy"; cursor.textContent = "▋";
      analyzeOut.appendChild(cursor);
      var text = "";
      try {
        var blob = await fetch(out.dataUrl).then(function (r) { return r.blob(); });
        var neg = out.inputs && out.inputs.negativePrompt ? ("\n\nThe anti-description (things it was told to avoid) was: " + out.inputs.negativePrompt) : "";
        var head = "You are auditing an AI image generator. The image below was generated from this exact prompt:\n\n" + prompt + neg + "\n\n";
        await root.generateText({
          instruction: [
            head,
            blob,
            "\nAudit how much of that prompt the image actually uses. Output exactly this:\n" +
            "1) One line per distinct SUBJECT/CONTENT element in the prompt (character, appearance, clothing, props, setting, lighting, mood) — start each with ✅ (clearly present), ⚠️ (partial/ambiguous) or ❌ (missing/ignored), then the element. If something is missing, briefly say what the image shows instead. ~12 lines max; group near-duplicate style adjectives.\n" +
            "2) One line: which STYLE/quality keywords (medium, art movement, artist names) the image visibly reflects, and which cannot be verified from the image.\n" +
            "3) A final line starting with \"Verdict:\" — either \"Verdict: full prompt used\" or \"Verdict: prompt partially used\" or \"Verdict: prompt ignored/truncated\" — plus a short reason.\n" +
            "No preamble; be concrete and concise."
          ],
          onChunk: function (d) {
            if (!d || !d.textChunk) return;
            text = (d.fullTextSoFar != null) ? d.fullTextSoFar : (text + d.textChunk);
            analyzeOut.textContent = text;
            analyzeOut.appendChild(cursor);
          }
        });
        analyzeStatus.textContent = "✅ analysis complete";
      } catch (e) {
        console.error(e);
        analyzeStatus.textContent = "⚠️ analysis failed — try again";
      } finally {
        analyzing = false;
        analyzeBtn.disabled = false;
        analyzeStatus.classList.remove("adv-busy");
        cursor.remove();
        analyzeOut.textContent = text;
      }
    }

    // --- seed lab ---
    if (ftSeed) {
      advSeed.value = ftSeed.value;
      ftSeed.addEventListener("input", function () { if (advSeed.value !== ftSeed.value) advSeed.value = ftSeed.value; scheduleRefresh(); });
    }
    advSeed.addEventListener("input", function () {
      if (ftSeed) { ftSeed.value = advSeed.value; ftSeed.dispatchEvent(new Event("input", { bubbles: true })); }
      if (window.input) window.input.seed = advSeed.value;
      renderSeedPreview();
    });
    advSeed.addEventListener("change", scheduleRefresh);
    panel.querySelector("#advSeedRandBtn").addEventListener("click", function () {
      advSeed.value = String(Math.floor(Math.random() * 1000000000));
      advSeed.dispatchEvent(new Event("input", { bubbles: true }));
    });
    advSeedLockBtn.addEventListener("click", function () {
      st.lockSeed = !st.lockSeed;
      advSeedLockBtn.classList.toggle("active", st.lockSeed);
      if (st.lockSeed && String(advSeed.value || "").trim() === "") {
        advSeed.value = String(Math.floor(Math.random() * 1000000000));
        advSeed.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (st.lockSeed) st.lockedSeed = String(advSeed.value || "").trim() !== "" ? Math.floor(Number(advSeed.value)) : st.lockedSeed;
      saveState(); refreshAll();
    });
    advStepToggle.addEventListener("change", function () { st.stepSeed = advStepToggle.checked; saveState(); refreshAll(); });
    advSeedStep.addEventListener("input", function () { st.seedStep = Math.floor(Number(advSeedStep.value)) || 1; saveState(); renderSeedPreview(); });

    // --- prompt weight ---
    var advWeight = panel.querySelector("#advWeight");
    var advWeightVal = panel.querySelector("#advWeightVal");
    var advWeightPreview = panel.querySelector("#advWeightPreview");
    function clampWeight(v) {
      v = Math.round(Number(v));
      if (!isFinite(v)) v = 0;
      return Math.max(0, Math.min(21, v));
    }
    function renderWeight() {
      var w = clampWeight(st.descWeight);
      advWeight.value = String(w);
      advWeightVal.textContent = w === 0 ? "off" : (w === 21 ? "🎲" : String(w));
      advWeightPreview.textContent = w === 0
        ? "weight off — description sent as typed"
        : (w === 21
          ? "each image gets a fresh random weight 1–20 (preview shows one draw)"
          : "description sent as (text:" + w + ") — higher pushes the subject harder");
    }
    function cachePlainDesc() {
      try {
        var el = document.querySelector('#i2p-imggen [data-name="description"]');
        if (el) window.___advPlainDesc = String(el.value || "");
      } catch (e) {}
    }
    advWeight.addEventListener("input", function () {
      st.descWeight = clampWeight(advWeight.value);
      saveState(); cachePlainDesc(); renderWeight(); refreshInspector();
    });

    // --- variations ---
    advVarToggle.addEventListener("change", function () { st.variationsOn = advVarToggle.checked; saveState(); refreshAll(); });
    advVarLines.addEventListener("input", function () { st.variations = advVarLines.value; saveState(); renderVarPreview(); });

    // --- negative presets ---
    advNegToggle.addEventListener("change", function () { st.negativeOn = advNegToggle.checked; saveState(); refreshInspector(); });

    // --- inspector buttons ---
    panel.querySelector("#advRefreshBtn").addEventListener("click", refreshInspector);
    panel.querySelector("#advPromptCopyBtn").addEventListener("click", function () { copyToClipboard(promptPreview.value, this); });
    panel.querySelector("#advNegCopyBtn").addEventListener("click", function () { copyToClipboard(negPreview.value, this); });
    analyzeBtn.addEventListener("click", analyzeFirstImage);
    // Mirror the sent prompt whenever a generate click happens (framework button or Simple's button).
    ["generateButtonEl", "nexSimpleGenBtn"].forEach(function (id) {
      var b = document.getElementById(id);
      if (b) b.addEventListener("click", watchedGenerate, true);
    });

    // --- restore UI from state ---
    advStepToggle.checked = !!st.stepSeed;
    advSeedStep.value = String(st.seedStep || 1);
    advSeedLockBtn.classList.toggle("active", !!st.lockSeed);
    advVarToggle.checked = !!st.variationsOn;
    advVarLines.value = st.variations || "";
    advNegToggle.checked = !!st.negativeOn;
    st.descWeight = clampWeight(st.descWeight);
    renderWeight();
    cachePlainDesc();
    renderNegChips();

    // Keep the plain-description cache fresh so the weight wrapper never double-wraps.
    document.addEventListener("input", function (e) {
      if (e.target && e.target.matches && e.target.matches('#i2p-imggen [data-name="description"]')) {
        try { window.___advPlainDesc = String(e.target.value || ""); } catch (err) {}
      }
    });
    document.addEventListener("change", function (e) {
      if (e.target && e.target.matches && e.target.matches('#i2p-imggen [data-name="description"]')) {
        try { window.___advPlainDesc = String(e.target.value || ""); } catch (err) {}
      }
    });

    // Live-refresh the inspector when any relevant input in the gen tab changes.
    imggen.addEventListener("input", scheduleRefresh, true);
    imggen.addEventListener("change", scheduleRefresh, true);

    // React to mode changes (chain onto whatever setMode wrappers already exist).
    document.addEventListener("nex-mode-change", function (e) {
      var m = e.detail && e.detail.mode;
      if (m === "advanced") refreshAll(); else clearTimeout(refreshTimer);
    });
    if (window.__nexoraMode && !window.__nexoraMode.__advWrapped) {
      var orig = window.__nexoraMode.setMode;
      window.__nexoraMode.setMode = function (m) {
        var r = orig.apply(this, arguments);
        if (m === "advanced") refreshAll(); else clearTimeout(refreshTimer);
        return r;
      };
      window.__nexoraMode.__advWrapped = true;
    }

    (function initAdvCollapse() {
      var LS_A = "t2iAdvCollapsed";
      var LS_C = "t2iAdvCards";
      var head = panel.querySelector(".adv-head");
      if (head) {
        head.id = "advHead";
        head.setAttribute("role", "button");
        head.setAttribute("tabindex", "0");
        head.title = "Show/hide the Advanced Workbench";
        var hc = document.createElement("span");
        hc.className = "adv-chev";
        hc.setAttribute("aria-hidden", "true");
        head.insertBefore(hc, head.firstChild);
      }
      var hchev = panel.querySelector("#advHead .adv-chev");
      function paintA(collapsed) {
        panel.dataset.collapsed = collapsed ? "1" : "0";
        if (hchev) hchev.textContent = collapsed ? "▸" : "▾";
        if (head) head.setAttribute("aria-expanded", collapsed ? "false" : "true");
      }
      var aCollapsed = true;
      try { aCollapsed = localStorage[LS_A] !== "0"; } catch (e) {}
      function toggleA() {
        var next = panel.dataset.collapsed !== "0" ? false : true;
        try { localStorage[LS_A] = next ? "1" : "0"; } catch (e) {}
        paintA(next);
      }
      if (head) {
        head.addEventListener("click", toggleA);
        head.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleA(); }
        });
      }
      var openCards = {};
      try { openCards = JSON.parse(localStorage[LS_C] || "{}") || {}; } catch (e) { openCards = {}; }
      function saveCards() { try { localStorage[LS_C] = JSON.stringify(openCards); } catch (e) {} }
      var cards = panel.querySelectorAll(".adv-card");
      for (var ci = 0; ci < cards.length; ci++) (function (card, idx) {
        var h4 = card.querySelector("h4");
        if (!h4) return;
        var c = document.createElement("span");
        c.className = "adv-chev";
        c.setAttribute("aria-hidden", "true");
        h4.insertBefore(c, h4.firstChild);
        h4.setAttribute("role", "button");
        h4.setAttribute("tabindex", "0");
        function paintC(open) {
          card.dataset.collapsed = open ? "0" : "1";
          c.textContent = open ? "▾" : "▸";
          h4.setAttribute("aria-expanded", open ? "true" : "false");
        }
        function toggleC() {
          var next = card.dataset.collapsed !== "0" ? true : false;
          openCards[idx] = next;
          saveCards();
          paintC(next);
        }
        h4.addEventListener("click", toggleC);
        h4.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleC(); }
        });
        paintC(!!openCards[idx]);
      })(cards[ci], ci);
      paintA(aCollapsed);
    })();
    refreshAll();
    return true;
  }

  var tries = 0;
  (function poll() { if (!init() && tries++ < 60) setTimeout(poll, 300); })();

  window.__advWorkbench = { state: function () { return window.___advState; }, refresh: function () { if (window.__nexoraMode) window.__nexoraMode.setMode(window.t2iMode || "advanced"); } };
})();

/* ===== Image Generator: Batch prompts — one prompt per line ===== */
(function () {
  "use strict";
  var LS = "batchOnePerLine";
  var MAX = 24;
  function toast(m) { if (window.vaultToast) window.vaultToast(m); }
  function descEl() { return document.querySelector('#i2p-imggen [data-name="description"]'); }
  function enabled() { var c = document.getElementById("batchPerLine"); return !!(c && c.checked); }
  function lines() {
    var el = descEl();
    if (!el) return [];
    return String(el.value || "").split("\n").map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function frameworkReady() {
    try {
      var u = window.___userSettings746291937 && window.___userSettings746291937.userInputs;
      if (!u || !u.description || !u.numImages) return false;
      if (!u.description._element || !u.numImages._element) return false;
      if (typeof window.___generateButtonClickEvent746291937 !== "function") return false;
      if (typeof window.___getImageOptions746291937 !== "function") return false;
      return true;
    } catch (e) { return false; }
  }
  function build() {
    // NOTE: batch attachment removed per user request (was the "one prompt per line" checkbox attached under Description).
    // No movable data — it was a feature, not a data list. Returning true keeps the poller quiet while building nothing.
    return true;
    var el = descEl();
    if (!el) return false;
    if (document.getElementById("batchPerLine")) return true;
    var ctn = el.closest(".input-ctn");
    if (!ctn || !ctn.parentNode) return false;
    var st = document.createElement("style");
    st.textContent = "#batchRow{display:flex;justify-content:flex-end;margin:0.2rem 0 0;}#batchWrap{display:inline-flex;align-items:center;gap:0.35rem;font-size:0.78rem;font-weight:600;cursor:pointer;white-space:nowrap;}#batchWrap input{width:auto;accent-color:var(--th-accent,#2b6bf0);}#batchCount{font-weight:400;opacity:0.65;font-variant-numeric:tabular-nums;}#batchBar{display:none;max-width:1000px;margin:0.4rem auto 0;padding:0.4rem 0.6rem;font-size:0.8rem;text-align:center;background:var(--box-color,#ebebeb);border-radius:8px;}#batchBar.on{display:block;}#batchBar button{cursor:pointer;font:inherit;font-size:0.78rem;border:1px solid var(--th-border,#ccc);background:var(--th-surface,#eee);color:inherit;border-radius:999px;padding:0.2rem 0.7rem;margin:0 0.2rem;}#batchBar button:hover{border-color:var(--th-accent,#2b6bf0);}.batch-cap{font-size:0.72rem;line-height:1.35;background:rgba(0,0,0,0.45);color:#fff;border-radius:6px;padding:0.3rem 0.45rem;margin-bottom:0.3rem;text-align:left;}.batch-cap b{font-weight:700;}.batch-cap .batch-row{display:flex;gap:0.3rem;margin-top:0.3rem;}.batch-cap .batch-row button{cursor:pointer;font-size:0.7rem;border:1px solid rgba(255,255,255,0.4);background:rgba(255,255,255,0.12);color:inherit;border-radius:999px;padding:0.1rem 0.5rem;}";
    document.head.appendChild(st);
    var w = document.createElement("label");
    w.id = "batchWrap";
    w.title = "Put each prompt on its own line (Shift+Enter for a new line) — generate makes one image per line";
    var cb = document.createElement("input");
    cb.type = "checkbox"; cb.id = "batchPerLine";
    try { cb.checked = localStorage[LS] === "1"; } catch (e) {}
    cb.addEventListener("change", function () {
      try { localStorage[LS] = cb.checked ? "1" : "0"; } catch (e) {}
      refresh();
    });
    var txt = document.createElement("span");
    txt.textContent = "one prompt per line";
    var cnt = document.createElement("span");
    cnt.id = "batchCount";
    w.appendChild(cb); w.appendChild(txt); w.appendChild(cnt);
    var batchRow = document.createElement("div");
    batchRow.id = "batchRow";
    batchRow.appendChild(w);
    ctn.parentNode.insertBefore(batchRow, ctn.nextSibling);
    var out = document.getElementById("outputAreaEl");
    if (out && !document.getElementById("batchBar")) {
      var bar = document.createElement("div");
      bar.id = "batchBar";
      out.parentNode.insertBefore(bar, out);
    }
    el.addEventListener("input", refresh);
    refresh();
    wrapGen();
    observeOut();
    return true;
  }
  function refresh() {
    var c = document.getElementById("batchCount");
    var bar = document.getElementById("batchBar");
    var n = lines().length;
    if (c) c.textContent = enabled() ? (n ? "· " + Math.min(n, MAX) + " prompt" + (Math.min(n, MAX) === 1 ? "" : "s") : "· add one prompt per line") : "";
    var sel = document.querySelector('#i2p-imggen [data-name="numImages"]');
    var wrap = sel && sel.closest(".input-ctn");
    if (wrap) wrap.style.opacity = enabled() ? "0.45" : "";
    if (bar) {
      if (enabled() && n > 1) {
        bar.className = "on";
        bar.innerHTML = "";
        var s = document.createElement("span");
        s.textContent = "Batch: " + Math.min(n, MAX) + " prompts \u2192 " + Math.min(n, MAX) + " images (How many? ignored)" + (n > MAX ? " — first " + MAX + " lines only" : "");
        bar.appendChild(s);
        [["\uD83D\uDCCB copy prompts", function () {
          var t = lines().slice(0, MAX).join("\n");
          if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { toast("\uD83D\uDCCB batch prompts copied"); });
        }], ["\u2B07 download .txt", function () {
          var blob = new Blob([lines().slice(0, MAX).join("\n")], { type: "text/plain" });
          var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "batch-prompts.txt"; a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        }]].forEach(function (d) {
          var b = document.createElement("button"); b.type = "button"; b.textContent = d[0];
          b.addEventListener("click", d[1]); bar.appendChild(b);
        });
      } else { bar.className = ""; bar.innerHTML = ""; }
    }
  }
  function wrapGen() {
    if (window.__batchWrapped) return;
    var tries = 0;
    (function wait() {
      if (window.___generateButtonClickEvent746291937 && window.___getImageOptions746291937) {
        if (window.__batchWrapped) return;
        window.__batchWrapped = true;
        var origGen = window.___generateButtonClickEvent746291937;
        var origOpts = window.___getImageOptions746291937;
        window.___getImageOptions746291937 = function () {
          var act = window.__batchActiveLines;
          if (act && act.length) {
            var idx = window.___t2iImageIndex || 0;
            var line = act[idx % act.length];
            if (window.input) window.input.description = line;
            try { window.___userSettings746291937.userInputs.description.value = line; } catch (e) {}
          }
          return origOpts.apply(this, arguments);
        };
        window.___generateButtonClickEvent746291937 = async function (event) {
          var ls = lines();
          if (!enabled() || ls.length < 2) return origGen.apply(this, arguments);
          ls = ls.slice(0, MAX);
          if (lines().length > MAX) toast("Batch capped at " + MAX + " prompts — first " + MAX + " lines used");
          window.__batchActiveLines = ls;
          var settings = window.___userSettings746291937;
          var savedNum = settings.numImages;
          var savedDesc = window.input ? window.input.description : "";
          var adv = window.___advState;
          var savedVar = adv ? adv.variationsOn : false;
          if (adv) adv.variationsOn = false;
          window.___t2iImageIndex = 0;
          settings.numImages = { evaluateItem: ls.length };
          try { return await origGen.apply(this, arguments); }
          finally {
            settings.numImages = savedNum;
            if (window.input) window.input.description = savedDesc;
            try { settings.userInputs.description.value = savedDesc; } catch (e) {}
            if (adv) adv.variationsOn = savedVar;
            window.__batchActiveLines = null;
            window.__lastBatchLines = ls;
            setTimeout(function () { labelCards(ls); }, 200);
            setTimeout(function () { labelCards(ls); }, 1500);
          }
        };
      } else if (tries++ < 80) setTimeout(wait, 400);
    })();
  }
  function labelCards(ls) {
    ls = ls || window.__lastBatchLines;
    if (!ls || !ls.length) return;
    var cards = document.querySelectorAll("#outputAreaEl .t2i-image-ctn");
    if (!cards.length) return;
    cards.forEach(function (card, i) {
      var stale = card.querySelector(".batch-cap");
      if (stale) stale.remove();
      var line = ls[i % ls.length];
      if (!line) return;
      var cap = document.createElement("div");
      cap.className = "batch-cap";
      cap.setAttribute("translate", "no");
      var short = line.length > 140 ? line.slice(0, 140) + "\u2026" : line;
      cap.innerHTML = "<b>#" + (i + 1) + "</b> " + esc(short);
      var row = document.createElement("div");
      row.className = "batch-row";
      var cp = document.createElement("button"); cp.type = "button"; cp.textContent = "\uD83D\uDCCB copy";
      cp.addEventListener("click", function (e) { e.stopPropagation(); if (navigator.clipboard) navigator.clipboard.writeText(line).then(function () { toast("\uD83D\uDCCB prompt #" + (i + 1) + " copied"); }); });
      var rm = document.createElement("button"); rm.type = "button"; rm.textContent = "\u2716 drop loser";
      rm.addEventListener("click", function (e) { e.stopPropagation(); card.remove(); toast("Dropped #" + (i + 1) + " — winners stay"); });
      row.appendChild(cp); row.appendChild(rm);
      cap.appendChild(row);
      cap.title = line;
      card.insertBefore(cap, card.firstChild);
    });
  }
  function observeOut() {
    var out = document.getElementById("outputAreaEl");
    if (!out || out.__batchObs) return;
    out.__batchObs = true;
    new MutationObserver(function () {
      if (window.__lastBatchLines && window.__lastBatchLines.length) labelCards(window.__lastBatchLines);
    }).observe(out, { childList: true });
  }
  var tries = 0;
  (function poll() { if (!build() && tries++ < 60) setTimeout(poll, 400); })();
})();

/* ===== Image Generator: stylized skin (🎨 section cards + hero generate button) =====
   Theme-aware CSS skin for the framework's Image Generator tab, plus three
   full-width section headers (✏️ Prompt / 🎨 Style / 🖼️ Canvas) inserted into
   the framework's flex-wrap inputs container. Everything is scoped to
   #i2p-imggen and uses only var(--th-*) theme variables, so it follows the
   Theme tab. No DOM is restructured and no framework behavior is touched —
   pure presentation. In ✨ Simple mode the whole inputs container hides, so
   the headers hide with it automatically. */
(function () {
  "use strict";
  var CSS = [
    "#i2p-imggen{--gen-glow:var(--th-glow-color,rgba(168,85,247,0.45));}",
    /* hero title: gradient text */
    "#i2p-imggen>h1{font-size:1.7rem !important;font-weight:800;letter-spacing:0.01em;text-align:center;" +
      "margin:0.5rem 0 0.15rem !important;padding:0 1rem;" +
      "background:linear-gradient(100deg,var(--th-grad-a,#4f5bef),var(--th-grad-b,#a855f7) 55%,var(--th-grad-c,#ff5c9d));" +
      "-webkit-background-clip:text;background-clip:text;color:transparent !important;}",
    /* mode switcher: segmented pill */
    "#i2p-imggen #nexModeBar{background:var(--th-surface);border:1px solid var(--th-border);" +
      "border-radius:999px;padding:0.3rem;gap:0.25rem;max-width:max-content;" +
      "box-shadow:0 10px 32px -20px var(--gen-glow);}",
    "#i2p-imggen #nexModeBar .nex-mode-btn{border:none;background:transparent;border-radius:999px;" +
      "padding:0.5rem 1.25rem;font-weight:600;}",
    "#i2p-imggen #nexModeBar .nex-mode-btn.active{" +
      "background:linear-gradient(135deg,var(--th-grad-a,#4f5bef),var(--th-grad-b,#a855f7) 60%,var(--th-grad-c,#ff5c9d));" +
      "color:#fff;box-shadow:0 4px 18px -6px var(--gen-glow);}",
    /* section headers */
    "#i2p-imggen .gen-sec{flex:1 1 100%;width:100%;display:flex;align-items:center;gap:0.6rem;" +
      "margin:0.9rem 0.4rem 0.05rem;font-size:0.76rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;cursor:pointer;}",
    "#i2p-imggen .gen-sec:focus-visible{outline:2px solid var(--th-accent);outline-offset:2px;border-radius:6px;}",
    "#i2p-imggen .gen-sec>span{white-space:nowrap;}" +
    "#i2p-imggen .gen-sec .gen-sec-chev{flex:none;width:1.1em;text-align:center;opacity:0.7;}",
    "#i2p-imggen .gen-sec::after{content:\"\";flex:1;height:2px;border-radius:2px;" +
      "background:linear-gradient(90deg,var(--th-grad-a,#4f5bef),var(--th-grad-b,#a855f7),var(--th-grad-c,#ff5c9d),transparent);opacity:0.7;}",
    /* input cards */
    "#i2p-imggen [id^=\"userInputsCtn\"]{gap:0.65rem;padding:0.35rem;align-items:stretch;}",
    "#i2p-imggen .input-ctn .input-inner{height:100%;box-sizing:border-box;" +
      "background:linear-gradient(180deg,var(--th-surface),var(--th-field,var(--th-surface))); " +
      "border:1px solid var(--th-border);border-radius:16px;padding:0.7rem 0.8rem;margin:0.25rem;" +
      "box-shadow:0 12px 30px -24px rgba(0,0,0,0.9);" +
      "transition:border-color 0.15s,box-shadow 0.15s,transform 0.15s;}",
    "#i2p-imggen .input-ctn .input-inner:hover{border-color:var(--th-accent);transform:translateY(-1px);}",
    "#i2p-imggen .input-ctn .input-inner:focus-within{border-color:var(--th-accent);" +
      "box-shadow:0 0 0 3px var(--th-accent-soft),0 12px 32px -18px var(--gen-glow);transform:none;}",
    "#i2p-imggen .input-label{font-size:0.8rem;font-weight:700;letter-spacing:0.02em;margin-bottom:0.35rem;}",
    /* fields */
    "#i2p-imggen .input-wrapper input[type=\"text\"]," +
    "#i2p-imggen .input-wrapper textarea," +
    "#i2p-imggen .input-wrapper select{" +
      "background:var(--th-field);border:1px solid var(--th-border);border-radius:10px;color:inherit;font-family:inherit;}",
    "#i2p-imggen .input-wrapper textarea{padding:0.6rem 0.7rem !important;line-height:1.5;font-size:0.92rem;}",
    "#i2p-imggen [data-name=\"description\"]{min-height:7.5rem;}",
    "#i2p-imggen .input-wrapper input[type=\"text\"]{padding:0.5rem 0.6rem;font-size:0.88rem;}",
    "#i2p-imggen .input-wrapper select{padding:0.5rem 1.8rem 0.5rem 0.6rem;cursor:pointer;" +
      "font-weight:600;font-size:0.85rem;max-width:13rem !important;}",
    "#i2p-imggen select[data-name=\"artStyle\"]{border:1.5px solid var(--th-accent);" +
      "box-shadow:0 0 0 3px var(--th-accent-soft);max-width:15rem !important;font-weight:700;}",
    "#i2p-imggen .random-input-btn,#i2p-imggen .ai-suggest-btn{border:1px solid var(--th-border);" +
      "background:var(--th-surface);color:inherit;border-radius:999px;padding:0.3rem 0.7rem;cursor:pointer;font-size:0.85rem;" +
      "transition:border-color 0.15s,box-shadow 0.15s;}",
    "#i2p-imggen .random-input-btn:hover,#i2p-imggen .ai-suggest-btn:hover{" +
      "border-color:var(--th-accent);box-shadow:0 0 0 3px var(--th-accent-soft);}",
    /* hero generate button */
    "#i2p-imggen #generateButtonEl{display:block;margin:1rem auto;" +
      "font-weight:800;letter-spacing:0.02em;color:#fff !important;" +
      "background:linear-gradient(135deg,var(--th-grad-a,#4f5bef),var(--th-grad-b,#a855f7) 55%,var(--th-grad-c,#ff5c9d)) !important;" +
      "border:none !important;border-radius:999px !important;padding:0.85rem 3.4rem !important;cursor:pointer;" +
      "box-shadow:0 14px 44px -10px var(--gen-glow),inset 0 1px 0 rgba(255,255,255,0.25);" +
      "transition:transform 0.15s,box-shadow 0.15s,filter 0.15s;}",
    "#i2p-imggen #generateButtonEl:hover:not(:disabled){transform:translateY(-2px) scale(1.02);filter:brightness(1.08);}",
    "#i2p-imggen #generateButtonEl:active:not(:disabled){transform:translateY(0) scale(0.99);}",
    "#i2p-imggen #generateButtonEl:disabled{filter:saturate(0.4) brightness(0.75);cursor:wait;}",
    /* companion panels match the cards */
    "#i2p-imggen #ft-panel{border:1px solid var(--th-border);border-radius:16px;" +
      "box-shadow:0 12px 30px -24px rgba(0,0,0,0.9);}",
    "#i2p-imggen #gen-tools button{font-weight:600;transition:border-color 0.15s,box-shadow 0.15s,transform 0.15s;}",
    "#i2p-imggen #gen-tools button:hover:not(:disabled){border-color:var(--th-accent);" +
      "box-shadow:0 0 0 3px var(--th-accent-soft);transform:translateY(-1px);}",
    "#i2p-imggen #adv-panel{border:1px solid var(--th-border);border-radius:16px;}",
    "#i2p-imggen #t2iCustomStyles{border:1px solid var(--th-border);border-radius:16px;}",
    /* simple-mode hero matches */
    "#i2p-imggen #nexSimpleInput{border-radius:14px;border:1px solid var(--th-border);" +
      "box-shadow:0 12px 30px -24px rgba(0,0,0,0.9);}",
    "#i2p-imggen #nexSimpleInput:focus{border-color:var(--th-accent);" +
      "box-shadow:0 0 0 3px var(--th-accent-soft),0 12px 32px -18px var(--gen-glow);}",
    "#i2p-imggen #nexSimpleGenBtn{background:linear-gradient(135deg,var(--th-grad-a,#4f5bef)," +
      "var(--th-grad-b,#a855f7) 55%,var(--th-grad-c,#ff5c9d));color:#fff;border:none;font-weight:800;" +
      "box-shadow:0 14px 44px -10px var(--gen-glow);}",
    "@media (max-width:700px){" +
      "#i2p-imggen>h1{font-size:1.35rem !important;}" +
      "#i2p-imggen .input-ctn{flex:1 1 100%;}" +
      "#i2p-imggen #generateButtonEl{width:min(100%,420px);padding:0.85rem 1rem !important;}" +
      "#i2p-imggen .gen-sec{margin:0.7rem 0.25rem 0;}" +
      /* compact sections: tighter cards, smaller type, two-up dropdowns */
      "#i2p-imggen [id^=\"userInputsCtn\"]{gap:0.35rem;padding:0.15rem;}" +
      "#i2p-imggen .gen-sec{margin:0.45rem 0.15rem 0;font-size:0.68rem;gap:0.4rem;}" +
      "#i2p-imggen .input-ctn .input-inner{padding:0.45rem 0.5rem;margin:0.1rem;border-radius:12px;}" +
      "#i2p-imggen .input-label{font-size:0.72rem;margin-bottom:0.2rem;}" +
      "#i2p-imggen .input-tip-btn{display:none;}" +
      "#i2p-imggen .input-ctn.input-type-select{flex:1 1 44%;min-width:0;}" +
      "#i2p-imggen .input-ctn.input-type-select .input-inner{width:100% !important;}" +
      "#i2p-imggen .input-ctn.input-type-select select{max-width:none !important;width:100%;" +
        "padding:0.4rem 1.5rem 0.4rem 0.45rem;font-size:0.76rem;}" +
      "#i2p-imggen select[data-name=\"artStyle\"]{max-width:none !important;}" +
      "#i2p-imggen .input-ctn:has(select[data-name=\"artStyle\"]){flex:1 1 100%;}" +
      "#i2p-imggen .input-ctn:has(select[data-name=\"artStyle\"]) .input-wrapper{display:flex;" +
        "flex-direction:column;gap:0.3rem;}" +
      "#i2p-imggen .input-ctn:has(select[data-name=\"artStyle\"]) .as-search{width:100%;}" +
      "#i2p-imggen .input-ctn:has(select[data-name=\"artStyle\"]) select{width:100%;}" +
      "#i2p-imggen .input-ctn.input-type-text .input-inner{padding:0.4rem 0.5rem;}" +
      "#i2p-imggen .input-wrapper input[type=\"text\"]{padding:0.35rem 0.45rem;font-size:0.8rem;}" +
      "#i2p-imggen .input-wrapper textarea{padding:0.4rem 0.5rem !important;font-size:0.82rem;}" +
      "#i2p-imggen [data-name=\"description\"]{min-height:5rem;}" +
    "}"
  ].join("\n");
  function skin() {
    if (document.getElementById("gen-skin-css")) return true;
    var st = document.createElement("style");
    st.id = "gen-skin-css";
    st.textContent = CSS;
    document.head.appendChild(st);
    return true;
  }
  function ctnFor(name) {
    var el = document.querySelector('#i2p-imggen [data-name="' + name + '"]');
    return el ? el.closest(".input-ctn") : null;
  }
  // Collapsible section groups. All four groups start collapsed. Each header
  // toggles the .input-ctn cards beneath it (up to the next header); the choice
  // is remembered per browser in localStorage. Cards the framework itself hides
  // (conditional inputs) are left alone so they still appear when applicable.
  var SEC_STATE_KEY = "t2iGenSections2";
  var SEC_IDS = { "gen-sec-prompt": "prompt", "gen-sec-style": "mixers", "gen-sec-art": "art", "gen-sec-canvas": "canvas" };
  function secState() {
    var st = { prompt: false, mixers: false, art: false, canvas: false };
    try {
      var raw = localStorage[SEC_STATE_KEY];
      if (raw) {
        var saved = JSON.parse(raw);
        for (var k in st) if (typeof saved[k] === "boolean") st[k] = saved[k];
      }
    } catch (e) {}
    return st;
  }
  function saveSecState(st) { try { localStorage[SEC_STATE_KEY] = JSON.stringify(st); } catch (e) {} }
  function sectionCards(box, header) {
    var out = [];
    var n = header.nextElementSibling;
    while (n && !n.classList.contains("gen-sec")) {
      if (n.classList.contains("input-ctn")) out.push(n);
      n = n.nextElementSibling;
    }
    return out;
  }
  function paintHeader(header, expanded) {
    header.setAttribute("aria-expanded", expanded ? "true" : "false");
    var chev = header.querySelector(".gen-sec-chev");
    if (chev) chev.textContent = expanded ? "▾" : "▸";
  }
  function setSection(box, header, key, expanded, save) {
    var cards = sectionCards(box, header);
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (!expanded) {
        if (c.style.display !== "none" && window.getComputedStyle(c).display !== "none") {
          c.dataset.gsHide = "1";
          c.style.display = "none";
        }
      } else if (c.dataset.gsHide) {
        delete c.dataset.gsHide;
        c.style.display = "";
      }
    }
    paintHeader(header, expanded);
    if (save) { var st = secState(); st[key] = expanded; saveSecState(st); }
  }
  function applyAllSections() {
    var box = document.querySelector('#i2p-imggen [id^="userInputsCtn"]');
    if (!box) return false;
    var st = secState();
    var any = false;
    for (var id in SEC_IDS) {
      var h = document.getElementById(id);
      if (h) { setSection(box, h, SEC_IDS[id], !!st[SEC_IDS[id]], false); any = true; }
    }
    return any;
  }
  function headers() {
    var box = document.querySelector('#i2p-imggen [id^="userInputsCtn"]');
    if (!box) return false;
    if (document.getElementById("gen-sec-prompt")) { applyAllSections(); return true; }
    var d = ctnFor("description"), m = ctnFor("mixMedium"), a = ctnFor("artStyle"), s = ctnFor("shape");
    if (!d || !m || !a || !s) return false;
    function sec(id, key, txt) {
      var el = document.createElement("div");
      el.className = "gen-sec";
      el.id = id;
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      var chev = document.createElement("span");
      chev.className = "gen-sec-chev";
      chev.setAttribute("aria-hidden", "true");
      var sp = document.createElement("span");
      sp.textContent = txt;
      el.appendChild(chev);
      el.appendChild(sp);
      el.addEventListener("click", function () {
        var st = secState();
        setSection(box, el, key, !st[key], true);
      });
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          var st2 = secState();
          setSection(box, el, key, !st2[key], true);
        }
      });
      return el;
    }
    box.insertBefore(sec("gen-sec-prompt", "prompt", "✏️ Prompt — describe your image"), box.firstElementChild); // top: scratchpad + description live under Prompt
    box.insertBefore(sec("gen-sec-style", "mixers", "🧩 Mixers"), m);
    box.insertBefore(sec("gen-sec-art", "art", "🎨 Art Styles & Fusion"), a);
    box.insertBefore(sec("gen-sec-canvas", "canvas", "🖼️ Canvas — size & batch"), s);
    applyAllSections();
    return true;
  }
  var tries = 0;
  (function poll() {
    skin();
    if (!headers() && tries++ < 60) setTimeout(poll, 400);
  })();
})();

/* ===== Image Generator: 🗒️ simplified scratchpad for Basic mode =====
   The full scratchpad (#t2iScratchPanel, built by buildScratchPanel() in
   src/gallery.js) only shows in Advanced mode. This is its slim sibling for
   Basic mode: just the notes/variables textarea, auto-remembered, no kept-
   prompts machinery (autokeep still saves in the background; the kept list
   itself stays an Advanced-mode feature).
   - Shares the SAME localStorage text (`t2iScratchpadText`), so both panels
     edit one document; values are mirrored on every keystroke and on mode
     switch, and `VAR = value` lines are parsed to window.VAR (usable as
     [VAR] in the description) with the same rules as the full panel.
   - Lives OUTSIDE the framework's userInputs container (like #t2iScratchPanel):
     the framework's init loop crashes on anonymous textareas inside it.
   - Hidden in Simple (whole column hides via nex-mode-change hook) and in
     Advanced (CSS `html.adv-mode` rule — the full panel owns that mode). */
(function () {
  "use strict";
  var LS_TEXT = "t2iScratchpadText";
  var LS_COLLAPSED = "t2iBasicScratchCollapsed";
  var VAR_RE = /^[A-Z0-9_]+? *=.+$/;
  var parsedVars = new Set();
  function readText() { try { return localStorage[LS_TEXT] || ""; } catch (e) { return ""; } }
  function saveText(t) { try { localStorage[LS_TEXT] = t; } catch (e) {} }
  function parseVars(text) {
    parsedVars.forEach(function (name) { try { delete window[name]; } catch (e) {} });
    parsedVars.clear();
    var n = 0;
    String(text || "").split("\n").forEach(function (line) {
      if (!VAR_RE.test(line)) return;
      var parts = line.split("=");
      var name = parts[0].trim();
      if (!name) return;
      window[name] = parts.slice(1).join("=").trim();
      parsedVars.add(name);
      n++;
    });
    return n;
  }
  function basicInput() { return document.getElementById("t2iBasicScratchInput"); }
  function advInput() { return document.getElementById("t2iScratchInput"); }
  function updateCount(n) {
    var el = document.getElementById("t2iBasicScratchVars");
    if (el) el.textContent = n ? n + (n === 1 ? " var" : " vars") : "";
  }
  function onEdit(fromAdv) {
    var src = fromAdv ? advInput() : basicInput();
    var dst = fromAdv ? basicInput() : advInput();
    if (!src) return;
    saveText(src.value);
    updateCount(parseVars(src.value));
    if (dst && dst.value !== src.value) dst.value = src.value;
  }
  function hookAdvMirror() {
    var ai = advInput();
    if (!ai || ai.__basicMirror) return;
    ai.__basicMirror = true;
    ai.addEventListener("input", function () { onEdit(true); });
  }
  function build() {
    if (document.getElementById("t2iBasicScratch")) return true;
    var box = document.querySelector('#i2p-imggen [id^="userInputsCtn"]');
    if (!box || !box.parentNode) return false;
    var collapsed = true;
    try { collapsed = localStorage[LS_COLLAPSED] !== "0"; } catch (e) {}
    var panel = document.createElement("div");
    panel.className = "input-ctn input-type-paragraph takesUpFullRow";
    panel.id = "t2iBasicScratch";
    panel.dataset.foldToggleState = collapsed ? "hidden" : "shown";
    panel.innerHTML =
      '<div class="input-inner" style="width:min(750px,100%);margin-left:auto;margin-right:auto;text-align:left;">' +
        '<div class="input-label"><span style="width:max-content;">🗒️ Scratchpad</span>' +
        '<span id="t2iBasicScratchVars" style="font-size:75%;opacity:0.65;font-weight:400;"></span>' +
        '<span style="flex-grow:1;"></span>' +
        '<button class="input-toggle-button" type="button" style="background:transparent;border:none;cursor:pointer;font-size:80%;color:inherit;padding:0.1rem 0.3rem;"></button></div>' +
        '<div class="input-wrapper">' +
          '<textarea id="t2iBasicScratchInput" class="paragraph-input" style="height:4.5rem;width:100%;box-sizing:border-box;"></textarea>' +
          '<div style="font-size:72%;opacity:0.6;line-height:1.4;margin-top:0.25rem;">Notes + reusable variables — e.g. <code>ANIMAL = {dog|cat|frog}</code>, then use [ANIMAL] in your description. Remembered automatically.</div>' +
        '</div>' +
      '</div>';
    box.parentNode.insertBefore(panel, box);
    var btn = panel.querySelector(".input-toggle-button");
    btn.addEventListener("click", function () {
      var hidden = panel.dataset.foldToggleState !== "hidden";
      panel.dataset.foldToggleState = hidden ? "hidden" : "shown";
      try { localStorage[LS_COLLAPSED] = hidden ? "1" : "0"; } catch (e) {}
    });
    var ta = basicInput();
    ta.placeholder = "Jot notes or define variables here — e.g.  ANIMAL = {dog|cat|frog}";
    ta.value = readText();
    updateCount(parseVars(ta.value));
    ta.addEventListener("input", function () { onEdit(false); });
    hookAdvMirror();
    return true;
  }
  function skin() {
    if (document.getElementById("basic-scratch-css")) return;
    var st = document.createElement("style");
    st.id = "basic-scratch-css";
    st.textContent =
      "html.adv-mode #t2iBasicScratch{display:none !important;}" +
      "#t2iBasicScratch .input-wrapper{display:block;}" +
      "#t2iBasicScratch[data-fold-toggle-state='hidden'] .input-wrapper{display:none;}" +
      "#t2iBasicScratchInput{padding:0.5rem 0.6rem !important;line-height:1.45;font-size:0.88rem;}";
    document.head.appendChild(st);
  }
  document.addEventListener("nex-mode-change", function (e) {
    var panel = document.getElementById("t2iBasicScratch");
    if (panel) panel.style.display = (e.detail && e.detail.mode === "simple") ? "none" : "";
    if (e.detail && e.detail.mode === "basic") {
      var ta = basicInput();
      if (ta) {
        var cur = readText();
        if (ta.value !== cur) { ta.value = cur; updateCount(parseVars(cur)); }
      }
    }
    hookAdvMirror();
  });
  var tries = 0;
  (function poll() {
    skin();
    if (!build() && tries++ < 80) setTimeout(poll, 400);
    else hookAdvMirror();
  })();
})();

/* ===== Image Generator: 🎭 persona / 💬 chat skin =====
   Cleans up the framework's per-image persona UI so it matches the tab:
   the `🎭 persona / 💬 chat` button under each image becomes a pill, and the
   character editor overlay (instruction / ✨ generate persona / name /
   description / 💬 chat with them / ❌ close, plus our injected 📋 prompt
   history + 🧑 Persona Generator → buttons) gets theme fields and pill
   buttons. Framework inline styles are overridden (never edited — the
   framework is a read-only import); our two injected buttons carry no
   presentational inline CSS, the skin below styles them by class. */
(function () {
  "use strict";
  var CSS = [
    /* per-image trigger button */
    "#i2p-imggen .t2i-under-each-image-ctn .personality-chat-button{" +
      "opacity:1;cursor:pointer;font:inherit;font-size:0.82rem;font-weight:600;color:inherit;" +
      "background:var(--th-accent-soft);border:1px solid var(--th-border);border-radius:999px;" +
      "padding:0.32rem 0.9rem;transition:border-color 0.15s,box-shadow 0.15s,transform 0.15s;}",
    "#i2p-imggen .t2i-under-each-image-ctn .personality-chat-button:hover{" +
      "opacity:1;border-color:var(--th-accent);box-shadow:0 0 0 3px var(--th-accent-soft);transform:translateY(-1px);}",
    /* editor overlay */
    "#i2p-imggen .char-description-editor-ctn{" +
      "color:inherit !important;border-radius:12px;gap:0.35rem !important;" +
      "padding:0.45rem !important;backdrop-filter:brightness(0.7) blur(2px);}",
    "#i2p-imggen .char-description-instruction," +
    "#i2p-imggen .character-name-output," +
    "#i2p-imggen .character-description-output{" +
      "background:var(--th-field) !important;border:1px solid var(--th-border) !important;" +
      "border-radius:10px !important;color:inherit !important;font-family:inherit;" +
      "padding:0.5rem 0.6rem !important;font-size:0.85rem !important;}",
    "#i2p-imggen .character-description-output{line-height:1.5;}",
    "#i2p-imggen .char-description-editor-ctn>div{flex-wrap:wrap;}",
    "#i2p-imggen .char-description-editor-ctn button{" +
      "cursor:pointer;font:inherit;font-size:0.8rem;font-weight:600;color:inherit;" +
      "background:var(--th-surface);border:1px solid var(--th-border);border-radius:999px;" +
      "padding:0.4rem 0.9rem;white-space:nowrap;flex-shrink:0;" +
      "transition:border-color 0.15s,box-shadow 0.15s,filter 0.15s;}",
    "#i2p-imggen .char-description-editor-ctn button:hover:not(:disabled){" +
      "border-color:var(--th-accent);box-shadow:0 0 0 3px var(--th-accent-soft);}",
    "#i2p-imggen .char-description-editor-ctn button:disabled{opacity:0.55;cursor:wait;}",
    "#i2p-imggen .char-description-generate-button{" +
      "background:linear-gradient(135deg,var(--th-grad-a,#4f5bef),var(--th-grad-b,#a855f7) 60%,var(--th-grad-c,#ff5c9d)) !important;" +
      "color:#fff !important;border:none !important;font-weight:800 !important;max-width:none !important;" +
      "box-shadow:0 8px 26px -10px var(--th-glow-color,rgba(168,85,247,0.45)) !important;}",
    "#i2p-imggen .char-description-generate-button:hover:not(:disabled){filter:brightness(1.08);}"
  ].join("\n");
  if (!document.getElementById("gen-persona-css")) {
    var st = document.createElement("style");
    st.id = "gen-persona-css";
    st.textContent = CSS;
    document.head.appendChild(st);
  }
})();

/* ===== Image Generator: 🎂 Age meter in the 🖼️ Canvas group =====
   Drag slider whose value feeds the prompt engine via ageClause() in
   main.pjs (window.___ageState {on, age, appears}). Range is 0–100 for full-range
   sessions and 18–100 otherwise; the minimum is re-checked on every paint
   (plus a light interval + focus hooks, since the session state can change
   without a reload) and values below it are clamped up silently. A second
   slider in the same card ("Appears", -20..+20) records how many years younger
   (-) or older (+) they look than their actual age; 0 is neutral. Nothing in
   this card names any session kind — the track just spans what it spans.
   Styled like the framework's own .input-ctn cards so the collapsible Canvas
   section hides/shows it with the rest. */
(function () {
  "use strict";
  if (window.__genAgeLoaded) return;
  window.__genAgeLoaded = true;

  var LS_KEY = "t2iAgeMeter2";
  var DEF_AGE = 25;
  var APP_LO = -20, APP_HI = 20, DEF_APP = 0;

  function $(id) { return document.getElementById(id); }
  function fullRange() {
    try { if (typeof window.__t2iIsOwnerAuthed === "function") return !!window.__t2iIsOwnerAuthed(); } catch (e) {}
    try { return !!window.__t2iOwnerAuthed; } catch (e) { return false; }
  }
  function rangeLo() { return fullRange() ? 0 : 18; }
  function clamp(n) {
    n = Math.round(Number(n));
    if (!isFinite(n)) n = DEF_AGE;
    var l = rangeLo();
    if (n < l) n = l;
    if (n > 100) n = 100;
    return n;
  }
  function clampApp(n) {
    n = Math.round(Number(n));
    if (!isFinite(n)) n = DEF_APP;
    if (n < APP_LO) n = APP_LO;
    if (n > APP_HI) n = APP_HI;
    return n;
  }
  function read() {
    var st = { on: true, age: DEF_AGE, appears: DEF_APP };
    try {
      var raw = null;
      try { raw = localStorage[LS_KEY]; } catch (e) {}
      if (raw) {
        var s = JSON.parse(raw);
        if (s && typeof s.on === "boolean") st.on = s.on;
        if (s && s.age !== undefined && s.age !== null && s.age !== "") st.age = Number(s.age);
        if (s && s.appears !== undefined && s.appears !== null && s.appears !== "") st.appears = Number(s.appears);
      }
    } catch (e) {}
    st.age = clamp(st.age);
    st.appears = clampApp(st.appears);
    return st;
  }
  function write(st) {
    try { localStorage[LS_KEY] = JSON.stringify({ on: !!st.on, age: clamp(st.age), appears: clampApp(st.appears) }); } catch (e) {}
  }

  if (!window.___ageState) window.___ageState = read();
  else {
    try {
      if (typeof window.___ageState.on !== "boolean") window.___ageState.on = true;
      window.___ageState.age = clamp(window.___ageState.age);
      window.___ageState.appears = clampApp(window.___ageState.appears);
    } catch (e) { window.___ageState = read(); }
  }
  write(window.___ageState);

  function css() {
    if ($("gen-age-css")) return;
    var s = document.createElement("style");
    s.id = "gen-age-css";
    s.textContent =
      "#gen-age-ctn .gen-age-top{display:flex;align-items:center;gap:0.5rem;}" +
      "#gen-age-apptop{margin-top:0.55rem;}" +
      "#gen-age-val,#gen-age-appval{font-weight:800;font-variant-numeric:tabular-nums;}" +
      "#gen-age-ctn .gen-age-sp{flex:1;}" +
      "#gen-age-onwrap{display:inline-flex;align-items:center;gap:0.3rem;font-size:0.75rem;font-weight:600;cursor:pointer;white-space:nowrap;}" +
      "#gen-age-onwrap input{width:auto;accent-color:var(--th-accent,#2b6bf0);}" +
      "#gen-age-track,#gen-age-apptrack{position:relative;width:100%;box-sizing:border-box;height:16px;border-radius:999px;background:var(--th-field,rgba(0,0,0,0.12));border:1px solid var(--th-border);cursor:pointer;touch-action:none;margin-top:0.45rem;}" +
      "#gen-age-track:focus-visible,#gen-age-apptrack:focus-visible{outline:2px solid var(--th-accent,#ff69b4);outline-offset:2px;}" +
      "#gen-age-fill,#gen-age-appfill{position:absolute;left:0;top:0;bottom:0;width:0%;border-radius:999px;background:linear-gradient(90deg,var(--th-grad-a,#4f5bef),var(--th-grad-b,#a855f7) 55%,var(--th-grad-c,#ff5c9d));}" +
      "#gen-age-handle,#gen-age-apphandle{position:absolute;top:50%;left:0%;width:22px;height:22px;border-radius:50%;background:#fff;border:3px solid var(--th-accent,#ff69b4);transform:translate(-50%,-50%);box-shadow:0 2px 10px rgba(0,0,0,0.4);cursor:grab;}" +
      "#gen-age-handle:active,#gen-age-apphandle:active{cursor:grabbing;}" +
      "#gen-age-apptrack::after{content:\"\";position:absolute;left:50%;top:-3px;bottom:-3px;width:2px;margin-left:-1px;background:var(--th-border);border-radius:2px;pointer-events:none;}" +
      "#gen-age-ctn .gen-age-hint{font-size:0.72rem;opacity:0.6;line-height:1.4;margin-top:0.3rem;}";
    document.head.appendChild(s);
  }

  function ctnFor(name) {
    var el = document.querySelector('#i2p-imggen [data-name="' + name + '"]');
    return el ? el.closest(".input-ctn") : null;
  }

  function paint() {
    var st = window.___ageState;
    if (!st) return;
    var fixed = clamp(st.age);
    if (fixed !== st.age) { st.age = fixed; write(st); }
    var l = rangeLo();
    var pct = l >= 100 ? 100 : ((st.age - l) / (100 - l)) * 100;
    if (!(pct >= 0)) pct = 0;
    if (pct > 100) pct = 100;
    var valEl = $("gen-age-val"), fillEl = $("gen-age-fill"),
        handleEl = $("gen-age-handle"), trackEl = $("gen-age-track"),
        onEl = $("gen-age-on");
    if (valEl) valEl.textContent = st.on ? (st.age === 1 ? "1 year old" : st.age + " years old") : "Off";
    if (fillEl) fillEl.style.width = pct + "%";
    if (handleEl) handleEl.style.left = pct + "%";
    if (trackEl) {
      trackEl.setAttribute("aria-valuemin", String(l));
      trackEl.setAttribute("aria-valuemax", "100");
      trackEl.setAttribute("aria-valuenow", String(st.age));
      trackEl.setAttribute("aria-label", "Age, " + l + " to 100");
      trackEl.title = "Drag to set the age (" + l + "–100)";
    }
    if (onEl && onEl.checked !== !!st.on) onEl.checked = !!st.on;
    // Appears slider (-20..+20, center-origin fill).
    var app = clampApp(st.appears);
    if (app !== st.appears) { st.appears = app; write(st); }
    var apct = ((app - APP_LO) / (APP_HI - APP_LO)) * 100;
    if (!(apct >= 0)) apct = 50;
    if (apct > 100) apct = 100;
    var appValEl = $("gen-age-appval"), appFillEl = $("gen-age-appfill"),
        appHandleEl = $("gen-age-apphandle"), appTrackEl = $("gen-age-apptrack");
    if (appValEl) appValEl.textContent = !st.on ? "Off" :
      (app === 0 ? "looks actual age" :
        (app < 0 ? ("looks " + (-app) + (app === -1 ? " yr younger" : " yrs younger")) :
          ("looks " + app + (app === 1 ? " yr older" : " yrs older"))));
    if (appFillEl) {
      var flo = Math.min(50, apct), fhi = Math.max(50, apct);
      appFillEl.style.left = flo + "%";
      appFillEl.style.width = Math.max(0, fhi - flo) + "%";
    }
    if (appHandleEl) appHandleEl.style.left = apct + "%";
    if (appTrackEl) {
      appTrackEl.setAttribute("aria-valuemin", String(APP_LO));
      appTrackEl.setAttribute("aria-valuemax", String(APP_HI));
      appTrackEl.setAttribute("aria-valuenow", String(app));
      appTrackEl.setAttribute("aria-label", "Appears younger or older, -20 to +20");
      appTrackEl.title = "Drag to set how much younger (-) or older (+) they look (" + APP_LO + "–+" + APP_HI + ")";
    }
  }

  function setAge(n) {
    var st = window.___ageState || (window.___ageState = read());
    st.age = clamp(n);
    write(st);
    paint();
    return st.age;
  }
  function setOn(b) {
    var st = window.___ageState || (window.___ageState = read());
    st.on = !!b;
    write(st);
    paint();
    return st.on;
  }
  function setApp(n) {
    var st = window.___ageState || (window.___ageState = read());
    st.appears = clampApp(n);
    write(st);
    paint();
    return st.appears;
  }
  window.__genAgeSet = setAge;
  window.__genAgeAppSet = setApp;
  window.__genAgePaint = paint;

  function ageFromEvent(trackEl, e) {
    var r = trackEl.getBoundingClientRect();
    var l = rangeLo();
    if (!r || !(r.width > 0)) return clamp(window.___ageState ? window.___ageState.age : DEF_AGE);
    var x = (e.clientX !== undefined && e.clientX !== null) ? e.clientX :
      (e.touches && e.touches[0] ? e.touches[0].clientX : null);
    if (x === null || x === undefined) return clamp(window.___ageState ? window.___ageState.age : DEF_AGE);
    return clamp(l + ((x - r.left) / r.width) * (100 - l));
  }
  function appFromEvent(trackEl, e) {
    var r = trackEl.getBoundingClientRect();
    if (!r || !(r.width > 0)) return clampApp(window.___ageState ? window.___ageState.appears : DEF_APP);
    var x = (e.clientX !== undefined && e.clientX !== null) ? e.clientX :
      (e.touches && e.touches[0] ? e.touches[0].clientX : null);
    if (x === null || x === undefined) return clampApp(window.___ageState ? window.___ageState.appears : DEF_APP);
    return clampApp(APP_LO + ((x - r.left) / r.width) * (APP_HI - APP_LO));
  }

  function build() {
    if ($("gen-age-ctn")) { paint(); return true; }
    var box = document.querySelector('#i2p-imggen [id^="userInputsCtn"]');
    if (!box) return false;
    if (!ctnFor("shape")) return false;

    var card = document.createElement("div");
    card.className = "input-ctn";
    card.id = "gen-age-ctn";
    var inner = document.createElement("div");
    inner.className = "input-inner";
    inner.style.width = "100%";
    var top = document.createElement("div");
    top.className = "input-label gen-age-top";
    var name = document.createElement("span");
    name.textContent = "🎂 Age";
    var val = document.createElement("span");
    val.id = "gen-age-val";
    var sp = document.createElement("span");
    sp.className = "gen-age-sp";
    var onWrap = document.createElement("label");
    onWrap.id = "gen-age-onwrap";
    var onBox = document.createElement("input");
    onBox.type = "checkbox";
    onBox.id = "gen-age-on";
    onBox.checked = !!(window.___ageState && window.___ageState.on);
    var onTxt = document.createElement("span");
    onTxt.textContent = "Add to prompt";
    onWrap.appendChild(onBox);
    onWrap.appendChild(onTxt);
    top.appendChild(name);
    top.appendChild(val);
    top.appendChild(sp);
    top.appendChild(onWrap);
    var wrap = document.createElement("div");
    wrap.className = "input-wrapper";
    var track = document.createElement("div");
    track.id = "gen-age-track";
    track.setAttribute("role", "slider");
    track.setAttribute("tabindex", "0");
    var fill = document.createElement("div");
    fill.id = "gen-age-fill";
    var handle = document.createElement("div");
    handle.id = "gen-age-handle";
    track.appendChild(fill);
    track.appendChild(handle);
    wrap.appendChild(track);
    var top2 = document.createElement("div");
    top2.className = "input-label gen-age-top";
    top2.id = "gen-age-apptop";
    var name2 = document.createElement("span");
    name2.textContent = "🎭 Appears";
    var val2 = document.createElement("span");
    val2.id = "gen-age-appval";
    var sp2 = document.createElement("span");
    sp2.className = "gen-age-sp";
    top2.appendChild(name2);
    top2.appendChild(val2);
    top2.appendChild(sp2);
    wrap.appendChild(top2);
    var track2 = document.createElement("div");
    track2.id = "gen-age-apptrack";
    track2.setAttribute("role", "slider");
    track2.setAttribute("tabindex", "0");
    var fill2 = document.createElement("div");
    fill2.id = "gen-age-appfill";
    var handle2 = document.createElement("div");
    handle2.id = "gen-age-apphandle";
    track2.appendChild(fill2);
    track2.appendChild(handle2);
    wrap.appendChild(track2);
    var hint = document.createElement("div");
    hint.className = "gen-age-hint";
    hint.textContent = "Drag to set the age and how much younger (−) or older (+) they look than their actual age. Both go into the image prompt.";
    wrap.appendChild(hint);
    inner.appendChild(top);
    inner.appendChild(wrap);
    card.appendChild(inner);

    var anchor = ctnFor("numImages") || ctnFor("imgSize") || ctnFor("shape");
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(card, anchor.nextSibling);
    else if (box) box.appendChild(card);
    else return false;

    try {
      var hs = $("gen-sec-canvas");
      if (hs && hs.getAttribute("aria-expanded") === "false") {
        card.dataset.gsHide = "1";
        card.style.display = "none";
      }
    } catch (e) {}

    var dragging = false;
    track.addEventListener("pointerdown", function (e) {
      dragging = true;
      try { track.setPointerCapture(e.pointerId); } catch (err) {}
      setAge(ageFromEvent(track, e));
      e.preventDefault();
    });
    track.addEventListener("pointermove", function (e) {
      if (dragging) setAge(ageFromEvent(track, e));
    });
    track.addEventListener("pointerup", function () { dragging = false; });
    track.addEventListener("pointercancel", function () { dragging = false; });
    track.addEventListener("keydown", function (e) {
      var cur = clamp(window.___ageState ? window.___ageState.age : DEF_AGE);
      var l = rangeLo();
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); setAge(cur - 1); }
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); setAge(cur + 1); }
      else if (e.key === "PageDown") { e.preventDefault(); setAge(cur - 10); }
      else if (e.key === "PageUp") { e.preventDefault(); setAge(cur + 10); }
      else if (e.key === "Home") { e.preventDefault(); setAge(l); }
      else if (e.key === "End") { e.preventDefault(); setAge(100); }
    });
    onBox.addEventListener("change", function () { setOn(onBox.checked); });

    var dragging2 = false;
    track2.addEventListener("pointerdown", function (e) {
      dragging2 = true;
      try { track2.setPointerCapture(e.pointerId); } catch (err) {}
      setApp(appFromEvent(track2, e));
      e.preventDefault();
    });
    track2.addEventListener("pointermove", function (e) {
      if (dragging2) setApp(appFromEvent(track2, e));
    });
    track2.addEventListener("pointerup", function () { dragging2 = false; });
    track2.addEventListener("pointercancel", function () { dragging2 = false; });
    track2.addEventListener("keydown", function (e) {
      var cur = clampApp(window.___ageState ? window.___ageState.appears : DEF_APP);
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); setApp(cur - 1); }
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); setApp(cur + 1); }
      else if (e.key === "PageDown") { e.preventDefault(); setApp(cur - 5); }
      else if (e.key === "PageUp") { e.preventDefault(); setApp(cur + 5); }
      else if (e.key === "Home") { e.preventDefault(); setApp(APP_LO); }
      else if (e.key === "End") { e.preventDefault(); setApp(APP_HI); }
    });

    paint();
    return true;
  }

  setInterval(paint, 2000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) paint(); });
  window.addEventListener("focus", paint);

  var tries = 0;
  (function poll() {
    css();
    if (!build() && tries++ < 80) setTimeout(poll, 400);
  })();
})();
