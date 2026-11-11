/* ===== 🎭 Image Generator: clean persona/chat panel ============================
   Replaces the framework's cramped `.char-description-editor-ctn` overlay
   (absolute black boxes, 0.125rem gaps, no labels, image hidden underneath)
   with a cleaner, organized, theme-aware panel that keeps the generated
   image visible.

   What it does:
     • wraps `window.t2i_openCharacterDescriptionEditor` (outermost — after
       persona.js + gen-extras.js wraps) so every open gets cleaned once
     • adds a header with the generated image as a thumbnail + title + ✕
     • organizes the existing fields into labeled sections:
         ① Brief (instruction) · ② Voice (tone + sparkle) · ✨ Generate ·
         ③ Result (name + description)
     • reorganizes the footer into: 💬 chat (primary, full width) +
       secondary row (📋 history · 🧑 Persona Generator →)
     • theme-aware (var(--th-…)) + scrollable body so it never overflows
   Does NOT change generation/chat logic — same buttons, same handlers.
   ========================================================================== */
(function () {
  "use strict";

  var STYLE_ID = "t2i-pc-clean-style";
  var CSS =
    ".char-description-editor-ctn.pc-clean{position:absolute !important;top:0 !important;left:0 !important;right:0 !important;bottom:auto !important;min-height:100% !important;height:auto !important;max-height:min(82vh,900px) !important;z-index:5 !important;display:flex;flex-direction:column !important;gap:0 !important;padding:0 !important;background:var(--th-modal,var(--th-surface,#171d33)) !important;border:1px solid var(--th-border) !important;border-radius:12px !important;overflow:hidden !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;color:var(--th-text,#e6e9f5) !important;box-shadow:0 12px 40px -8px rgba(0,0,0,.6) !important;font-size:.85rem !important;text-align:left !important;}" +
    ".pc-head{display:flex;gap:.6rem;align-items:center;padding:.55rem .65rem;border-bottom:1px solid var(--th-border);background:var(--th-surface,rgba(0,0,0,.2));flex-shrink:0;}" +
    ".pc-thumb{width:52px;height:52px;object-fit:cover;border-radius:9px;border:1px solid var(--th-border);flex-shrink:0;background:#000;cursor:zoom-in;}" +
    ".pc-thumb.large{width:100%;height:auto;max-height:220px;object-fit:contain;background:#000;cursor:zoom-out;}" +
    ".pc-head-txt{min-width:0;flex:1;}" +
    ".pc-title{font-weight:700;font-size:.92rem;line-height:1.25;}" +
    ".pc-sub{font-size:.72rem;opacity:.65;line-height:1.35;margin-top:.1rem;}" +
    ".pc-x{flex-shrink:0;cursor:pointer;border:1px solid var(--th-border);border-radius:8px;background:transparent;color:inherit;padding:.25rem .55rem;font-size:.85rem;line-height:1;}" +
    ".pc-x:hover{border-color:var(--th-accent);background:var(--th-accent-soft);}" +
    ".pc-body{flex:1 1 auto;min-height:0;overflow-y:auto;padding:.6rem .65rem;display:flex;flex-direction:column;gap:.6rem;}" +
    ".pc-sec{border:1px solid var(--th-border);border-radius:10px;padding:.5rem .6rem;background:color-mix(in srgb,var(--th-field,#0f1424) 55%,transparent);}" +
    ".pc-sec-label{font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;opacity:.6;margin-bottom:.35rem;}" +
    ".pc-hint{font-size:.72rem;opacity:.6;line-height:1.4;margin-top:.3rem;}" +
    ".pc-clean textarea.char-description-instruction,.pc-clean textarea.character-description-output,.pc-clean input.character-name-output,.pc-clean select.t2i-persona-tone{width:100% !important;box-sizing:border-box !important;background:var(--th-field,#0f1424) !important;border:1px solid var(--th-border) !important;border-radius:8px !important;color:inherit !important;padding:.45rem .55rem !important;font-size:.82rem !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;box-shadow:none !important;}" +
    ".pc-clean textarea.char-description-instruction{min-height:52px !important;resize:vertical !important;line-height:1.45 !important;}" +
    ".pc-clean textarea.character-description-output{min-height:110px !important;resize:vertical !important;line-height:1.5 !important;flex:1;}" +
    ".pc-name-row{display:flex;gap:.4rem;align-items:center;}" +
    ".pc-name-row input{flex:1;min-width:0;}" +
    ".pc-clean .t2i-persona-controls{display:flex !important;align-items:center !important;gap:.45rem !important;flex-wrap:wrap !important;font-size:.78rem !important;}" +
    ".pc-clean select.t2i-persona-tone{flex:1 1 10rem !important;min-width:0 !important;}" +
    ".pc-sparkle{display:flex;align-items:center;gap:.3rem;white-space:nowrap;cursor:pointer;font-size:.78rem;opacity:.9;}" +
    ".pc-gen-row{display:flex;gap:.4rem;}" +
    ".pc-clean button.char-description-generate-button{flex:1 !important;background:var(--th-accent) !important;border:1px solid var(--th-accent) !important;color:var(--th-accent-text,#fff) !important;border-radius:9px !important;padding:.5rem .7rem !important;font-weight:700 !important;font-size:.85rem !important;box-shadow:none !important;max-width:none !important;cursor:pointer;}" +
    ".pc-clean button.char-description-generate-button:disabled{opacity:.6;cursor:default;}" +
    ".pc-clean button.char-description-stop-button{border-radius:9px !important;border:1px solid var(--th-border) !important;background:var(--th-surface) !important;color:inherit !important;padding:.5rem .7rem !important;cursor:pointer;}" +
    ".pc-foot{border-top:1px solid var(--th-border);padding:.55rem .65rem;display:flex;flex-direction:column;gap:.45rem;background:var(--th-surface,transparent);flex-shrink:0;}" +
    ".pc-foot-label{font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;opacity:.6;}" +
    ".pc-chat-btn{width:100% !important;background:var(--th-accent) !important;border:1px solid var(--th-accent) !important;color:var(--th-accent-text,#fff) !important;border-radius:9px !important;padding:.5rem .7rem !important;font-weight:700 !important;font-size:.85rem !important;cursor:pointer;flex:none !important;}" +
    ".pc-foot-row{display:flex;gap:.4rem;}" +
    ".pc-foot-row button{flex:1 !important;min-width:0 !important;background:var(--th-field,rgba(255,255,255,.06)) !important;border:1px solid var(--th-border) !important;color:inherit !important;border-radius:9px !important;padding:.42rem .5rem !important;font-size:.78rem !important;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
    ".pc-foot-row button:hover{border-color:var(--th-accent) !important;background:var(--th-accent-soft) !important;}" +
    ".pc-orig-close{display:none !important;}" +
    "@media (max-width:480px){.pc-sub{display:none;}.pc-thumb{width:44px;height:44px;}}";

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function closeEditor(imageCtn) {
    var ed = imageCtn.querySelector(".char-description-editor-ctn");
    if (ed) ed.style.display = "none";
    var btn = imageCtn.querySelector(".personality-chat-button");
    if (btn) btn.style.visibility = "visible";
  }

  function imageData(imageCtn) {
    try {
      var fr = imageCtn.querySelector("iframe");
      var out = fr && fr.textToImagePluginOutput;
      if (out) return { url: out.dataUrl || "", prompt: (out.inputs && out.inputs.prompt) || "" };
    } catch (e) {}
    return { url: "", prompt: "" };
  }

  function findBtn(editor, test) {
    var btns = editor.querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) if (test(btns[i])) return btns[i];
    return null;
  }

  function cleanEditor(imageCtn) {
    ensureStyle();
    var editor = imageCtn.querySelector(".char-description-editor-ctn");
    if (!editor) return;
    var data = imageData(imageCtn);

    // Always refresh the thumbnail (rerolls change the image).
    var thumb = editor.querySelector(".pc-thumb");
    if (thumb && data.url && thumb.getAttribute("src") !== data.url) thumb.setAttribute("src", data.url);

    if (editor.dataset.pcClean === "1") {
      collectLateButtons(editor, imageCtn);
      return;
    }
    editor.dataset.pcClean = "1";
    editor.classList.add("pc-clean");

    // Grab the framework's nodes (they exist at creation time; tone row +
    // history/port buttons may be injected later — handled by observer below).
    var instr = editor.querySelector(".char-description-instruction");
    var toneBar = editor.querySelector(".t2i-persona-controls");
    var genRow = null, genBtn = editor.querySelector(".char-description-generate-button");
    if (genBtn) genRow = genBtn.parentNode;
    var stopBtn = editor.querySelector(".char-description-stop-button");
    var nameInput = editor.querySelector(".character-name-output");
    var nameDice = null;
    if (nameInput && nameInput.parentNode) {
      var sibs = nameInput.parentNode.querySelectorAll("button");
      for (var d = 0; d < sibs.length; d++) {
        if (/🎲/.test(sibs[d].textContent)) { nameDice = sibs[d]; break; }
      }
    }
    var nameWrap = nameInput ? nameInput.parentNode : null;
    var desc = editor.querySelector(".character-description-output");
    var chatBtn = findBtn(editor, function (b) { return (b.getAttribute("onclick") || "").indexOf("t2i_generateChatLink") >= 0; });
    var origClose = findBtn(editor, function (b) { return (b.getAttribute("onclick") || "").indexOf("char-description-editor-ctn") >= 0 && /close/i.test(b.textContent); });

    // Clear + rebuild in organized order.
    editor.innerHTML = "";

    var head = document.createElement("div");
    head.className = "pc-head";
    head.innerHTML =
      (data.url ? '<img class="pc-thumb" alt="generated image">' : '<div class="pc-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.3rem;">🖼️</div>') +
      '<div class="pc-head-txt"><div class="pc-title">🎭 Persona / 💬 Chat</div>' +
      '<div class="pc-sub">Made from this image — open in Persona Generator any time, or generate here first then chat.</div></div>' +
      '<button type="button" class="pc-x" title="Close">✕</button>';
    var img = head.querySelector("img.pc-thumb");
    if (img && data.url) img.setAttribute("src", data.url);
    if (img) img.addEventListener("click", function () { img.classList.toggle("large"); });
    head.querySelector(".pc-x").addEventListener("click", function () { closeEditor(imageCtn); });
    editor.appendChild(head);

    var body = document.createElement("div");
    body.className = "pc-body";
    editor.appendChild(body);

    function section(label, hint) {
      var s = document.createElement("div");
      s.className = "pc-sec";
      s.innerHTML = '<div class="pc-sec-label">' + esc(label) + "</div>";
      if (hint) {
        var h = document.createElement("div");
        h.className = "pc-hint";
        h.textContent = hint;
        s.appendChild(h);
        h.style.marginTop = "0"; h.style.marginBottom = ".35rem";
      }
      body.appendChild(s);
      return s;
    }

    // ① Brief
    var sBrief = section("① Character brief", "Optional — steer personality, looks, backstory.");
    if (instr) sBrief.appendChild(instr);
    else {
      var ph = document.createElement("div");
      ph.className = "pc-hint"; ph.textContent = "Brief unavailable.";
      sBrief.appendChild(ph);
    }

    // ② Voice (tone row may not exist yet on first open — leave a slot).
    var sVoice = section("② Voice & tone", "Tone shapes the personality the AI invents.");
    sVoice.dataset.slot = "voice";
    if (toneBar) {
      var spark = toneBar.querySelector("label");
      if (spark) spark.classList.add("pc-sparkle");
      sVoice.appendChild(toneBar);
    }

    // ✨ Generate
    var sGen = section("✨ Generate persona", null);
    if (genRow) {
      genRow.classList.add("pc-gen-row");
      genRow.style.cssText = "";
      sGen.appendChild(genRow);
      var gh = document.createElement("div");
      gh.className = "pc-hint";
      gh.textContent = "Writes the name + description below. You can edit both afterwards.";
      sGen.appendChild(gh);
    }

    // ③ Result
    var sRes = section("③ Result — name & description", "Streams here; editable before you chat.");
    if (nameWrap && nameWrap !== editor) {
      var nameRow = document.createElement("div");
      nameRow.className = "pc-name-row";
      if (nameInput) nameRow.appendChild(nameInput);
      if (nameDice) nameRow.appendChild(nameDice);
      // move any other stray buttons in that wrapper back (reroll etc.)
      if (nameWrap.querySelectorAll) {
        var extra = [];
        Array.prototype.forEach.call(nameWrap.childNodes, function (n) {
          if (n !== nameInput && n !== nameDice && n.nodeType === 1) extra.push(n);
        });
        extra.forEach(function (n) { nameRow.appendChild(n); });
      }
      sRes.appendChild(nameRow);
    } else if (nameInput) {
      sRes.appendChild(nameInput);
    }
    if (desc) {
      desc.style.flexGrow = "";
      sRes.appendChild(desc);
    }

    var foot = document.createElement("div");
    foot.className = "pc-foot";
    foot.innerHTML = '<div class="pc-foot-label">④ Use it</div>';
    editor.appendChild(foot);

    var chatSlot = document.createElement("div");
    foot.appendChild(chatSlot);
    if (chatBtn) {
      chatBtn.classList.add("pc-chat-btn");
      chatBtn.style.cssText = "";
      chatSlot.appendChild(chatBtn);
    } else {
      chatSlot.innerHTML = '<div class="pc-hint">Chat appears after the first generate.</div>';
    }
    var row2 = document.createElement("div");
    row2.className = "pc-foot-row";
    row2.dataset.slot = "secondary";
    foot.appendChild(row2);

    if (origClose) { origClose.classList.add("pc-orig-close"); foot.appendChild(origClose); }

    // Pull in history / port buttons that gen-extras already added (they live
    // in the old bottom row, which we discarded — query the imageCtn instead
    // is wrong; they were inside editor and got wiped. Re-create slots and let
    // the observer / collector re-home them; gen-extras re-injects on next open
    // if missing, so request a re-inject pass).
    collectLateButtons(editor, imageCtn);
    observeLateButtons(editor, imageCtn);
    try {
      // Ask gen-extras to re-add its buttons if we wiped them.
      var ed2 = imageCtn.querySelector(".char-description-editor-ctn");
      if (ed2 && !ed2.querySelector(".persona-history-button") && window.t2i_openPersonaPromptHistory) {
        // gen-extras only injects inside its wrapped openEditor; simulate by
        // temporarily clearing our flag so a re-open re-injects — simpler: add
        // the buttons ourselves with the same handlers.
        addFallbackButtons(editor, imageCtn);
      }
    } catch (e) {}

    // If the tone row wasn't there yet, persona.js's interval will add it to
    // the editor root — the observer moves it into the voice slot.
  }

  function secondarySlot(editor) {
    return editor.querySelector('.pc-foot-row[data-slot="secondary"]');
  }

  function collectLateButtons(editor, imageCtn) {
    // Move any history/port buttons that arrived late (gen-extras interval)
    // into the organized footer row.
    var slot = secondarySlot(editor);
    if (!slot) return;
    ["persona-history-button", "persona-port-button"].forEach(function (cls) {
      var b = editor.querySelector("." + cls);
      if (b && b.parentNode !== slot) {
        b.style.cssText = "";
        slot.appendChild(b);
      }
    });
    // Move a late tone bar into the voice slot.
    var voice = editor.querySelector('.pc-sec[data-slot="voice"]');
    var bar = editor.querySelector(".t2i-persona-controls");
    if (voice && bar && bar.parentNode !== voice) {
      var spark = bar.querySelector("label");
      if (spark) spark.classList.add("pc-sparkle");
      voice.appendChild(bar);
    }
    // Hide any framework close button that got re-added.
    var origClose = findBtn(editor, function (b) { return (b.getAttribute("onclick") || "").indexOf("char-description-editor-ctn") >= 0 && /close/i.test(b.textContent); });
    if (origClose) origClose.classList.add("pc-orig-close");
  }

  function addFallbackButtons(editor, imageCtn) {
    var slot = secondarySlot(editor);
    if (!slot) return;
    if (!slot.querySelector(".persona-history-button")) {
      var hb = document.createElement("button");
      hb.type = "button"; hb.className = "persona-history-button";
      hb.textContent = "📋 Prompt history";
      hb.addEventListener("click", function () {
        if (window.t2i_openPersonaPromptHistory) window.t2i_openPersonaPromptHistory();
      });
      slot.appendChild(hb);
    }
    if (!slot.querySelector(".persona-port-button")) {
      var pb = document.createElement("button");
      pb.type = "button"; pb.className = "persona-port-button";
      pb.textContent = "🧑 Persona Generator →";
      pb.title = "Send this image to the Persona Generator tab as a Starter (no need to generate first)";
      pb.addEventListener("click", function () {
        var label = pb.textContent;
        pb.textContent = "⏳ opening…"; pb.disabled = true;
        var done = function () { pb.textContent = label; pb.disabled = false; };
        // The plugin output object attaches asynchronously — poll briefly.
        var tries = 0;
        var poll = function () {
          var out = null;
          try { out = (imageCtn.querySelector("iframe") || {}).textToImagePluginOutput || null; } catch (e) { out = null; }
          if (out && ((out.inputs && out.inputs.prompt) || out.dataUrl)) { send(out); return; }
          if (++tries >= 120) { send(out || {}); return; }
          setTimeout(poll, 250);
        };
        var send = function (out) {
          try {
            var ed = editor;
            var name = (ed.querySelector(".character-name-output") || {}).value || "";
            var desc = (ed.querySelector(".character-description-output") || {}).value || "";
            var inputs = (out && out.inputs) || {};
            var prompt = inputs.prompt || "";
            var instr = "";
            try { instr = (ed.querySelector(".char-description-instruction") || {}).value || ""; } catch (e2) {}
            var toneId = "", toneLabel = "";
            try {
              var tsel = ed.querySelector(".t2i-persona-tone");
              if (tsel) {
                toneId = tsel.value || "";
                if (tsel.selectedIndex >= 0 && tsel.options[tsel.selectedIndex]) toneLabel = (tsel.options[tsel.selectedIndex].textContent || "").trim();
              }
            } catch (e3) {}
            var styleLabel = "";
            try {
              var asel = document.querySelector('select[data-name="artStyle"]');
              if (asel && asel.selectedIndex >= 0 && asel.options[asel.selectedIndex]) styleLabel = (asel.options[asel.selectedIndex].textContent || "").trim();
            } catch (e4) {}
            var go = function () {
              if (typeof window.__personaAcceptStarter === "function") {
                Promise.resolve(window.__personaAcceptStarter({
                  url: out.dataUrl || "", kind: "", poster: "", prompt: String(prompt),
                  style: styleLabel, brief: instr, tone: toneId, toneLabel: toneLabel,
                  title: "", source: "gen"
                })).then(function () {
                  if (String(desc).trim() && typeof window.__personaOpenConverted === "function") {
                    window.__personaOpenConverted({ name: String(name).trim() || "Converted character", description: String(desc), thumb: out.dataUrl || "", thumbKind: "" }).then(done, done);
                    try { if (prompt && typeof window.__personaAddPrompt === "function") window.__personaAddPrompt(String(prompt)); } catch (e5) {}
                  } else {
                    done();
                  }
                }).catch(done);
              } else if (window.ensurePersona) {
                window.ensurePersona();
                setTimeout(go, 500);
              } else { done(); }
            };
            go();
          } catch (e) { done(); }
        };
        poll();
      });
      slot.appendChild(pb);
    }
  }

  var observed = new WeakSet();
  function observeLateButtons(editor, imageCtn) {
    if (observed.has(editor)) return;
    observed.add(editor);
    try {
      var mo = new MutationObserver(function () {
        try { collectLateButtons(editor, imageCtn); } catch (e) {}
      });
      mo.observe(editor, { childList: true, subtree: true });
    } catch (e) {}
  }

  function wrapOpen() {
    var cur = window.t2i_openCharacterDescriptionEditor;
    if (typeof cur !== "function") return false;
    if (cur.__t2iPcCleanWrapped) return true;
    var orig = cur;
    var wrapped = function (imageCtn) {
      var r = orig(imageCtn);
      try { cleanEditor(imageCtn); } catch (e) { console.warn("pc-clean:", e); }
      return r;
    };
    wrapped.__t2iPcCleanWrapped = true;
    // Preserve inner flags so persona.js / gen-extras.js don't re-wrap forever.
    wrapped.__t2iPhEditorWrapped = true;
    wrapped.__t2iPersonaImpl = orig.__t2iPersonaImpl;
    wrapped.__t2iPhWrapped = orig.__t2iPhWrapped;
    window.t2i_openCharacterDescriptionEditor = wrapped;
    return true;
  }

  // persona.js + gen-extras.js re-assert their wraps on intervals; re-assert
  // ours afterwards so we stay outermost.
  var tries = 0;
  (function reassert() {
    try { wrapOpen(); } catch (e) {}
    // Also clean any editors that were opened while we weren't loaded yet.
    try {
      Array.prototype.forEach.call(document.querySelectorAll(".t2i-image-ctn"), function (ctn) {
        var ed = ctn.querySelector(".char-description-editor-ctn");
        if (ed && ed.style.display !== "none" && ed.dataset.pcClean !== "1") cleanEditor(ctn);
        else if (ed && ed.dataset.pcClean === "1") collectLateButtons(ed, ctn);
      });
    } catch (e) {}
    if (tries++ < 120) setTimeout(reassert, 500);
  })();
})();
