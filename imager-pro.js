(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var DATA = window.IMAGER_PRO;

  var ENH_KEYS = ["mood", "lighting", "colorPalette", "composition", "detailLevel", "specialEffect", "textureFinish", "subjectFocus", "emotion", "timeOfDay", "cameraAngle"];
  var ENH_LABELS = { mood: "Mood", lighting: "Lighting", colorPalette: "Palette", composition: "Composition", detailLevel: "Detail", specialEffect: "Effect", textureFinish: "Texture", subjectFocus: "Focus", emotion: "Emotion", timeOfDay: "Time of Day", cameraAngle: "Camera" };
  var ENH_PROMPT_LABELS = { mood: "mood", lighting: "lighting", colorPalette: "palette", composition: "composition", detailLevel: "detail", specialEffect: "effect", textureFinish: "texture", subjectFocus: "focus", emotion: "emotion", timeOfDay: "time", cameraAngle: "camera" };
  var ART_LABELS = ["Base Style", "Fusion 2", "Fusion 3", "Fusion 4", "Fusion 5"];
  var MIX_LABELS = ["Mixer 1", "Mixer 2", "Mixer 3", "Mixer 4", "Mixer 5", "Mixer 6", "Mixer 7"];

  var LOCK_KEY = "imagerProLocks";
  var STATE_KEY = "imagerProStateV1";
  var PRESETS_KEY = "imagerProPresets";
  var FAVS_KEY = "imagerProFavs";
  var SCRATCH_KEY = "imagerProScratch";
  var COUNT_KEY = "imagerProGenCount";

  var FALLBACK_IDEAS = ["a misty forest with a winding path", "a cyberpunk city at night in the rain", "a cozy reading nook by a fireplace", "a majestic dragon perched on a mountain peak", "a futuristic space station orbiting a ringed planet", "an old sailboat on a calm sea at sunset", "a bustling medieval market square", "a field of wildflowers under a starry sky", "a robot tending a rooftop garden", "a hidden waterfall inside a glowing cave"];

  var artSels = [], mixSels = [], enhSels = {}, allFields = [];
  var descInput, descLockBtn, shapeSel, countSel, gscaleSel, seedInput, negUseInput, negInput;
  var genBtn, statusEl, previewEl, gridEl, loadingEl, favsEl, presetSel, presetName, presetSave, presetDel;
  var scratchInput, scratchUseBtn, aiIdeaBtn;
  var proVarNames = [], proHasDesc = false;
  var locks = loadJSON(LOCK_KEY, {});
  var busy = false, stopped = false;

  function loadJSON(k, fb) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function clampIdx(arr, v) {
    var i = parseInt(v, 10);
    if (isNaN(i) || i < 0) i = 0;
    if (i >= arr.length) i = arr.length - 1;
    return i;
  }

  function makeSelect(opts, lockedKey) {
    var sel = document.createElement("select");
    sel.className = "pro-select";
    for (var i = 0; i < opts.length; i++) {
      var o = document.createElement("option");
      o.value = String(i);
      o.textContent = opts[i].name;
      sel.appendChild(o);
    }
    var wrap = document.createElement("div");
    wrap.className = "pro-field";
    var lrow = document.createElement("div");
    lrow.className = "pro-field-label";
    var lbl = document.createElement("span");
    lbl.textContent = "";
    var lock = document.createElement("button");
    lock.type = "button";
    lock.className = "pro-lock";
    lock.title = "Lock / unlock (locked selects are skipped by Randomize)";
    lock.addEventListener("click", function () {
      locks[lockedKey] = !locks[lockedKey];
      saveJSON(LOCK_KEY, locks);
      refreshLocks();
    });
    lrow.appendChild(lbl);
    lrow.appendChild(lock);
    wrap.appendChild(lrow);
    wrap.appendChild(sel);
    allFields.push({ wrap: wrap, sel: sel, lock: lock, key: lockedKey, setLabel: function (t) { lbl.textContent = t; } });
    return sel;
  }

  function refreshLocks() {
    for (var i = 0; i < allFields.length; i++) {
      var f = allFields[i];
      var locked = !!locks[f.key];
      f.lock.textContent = locked ? "🔒" : "🔓";
      f.lock.classList.toggle("pro-locked", locked);
      f.wrap.classList.toggle("pro-locked", locked);
      f.sel.disabled = locked;
    }
    if (descLockBtn) {
      var dl = !!locks["desc"];
      descLockBtn.textContent = dl ? "🔒" : "🔓";
      descLockBtn.classList.toggle("pro-locked", dl);
      if (descInput) descInput.disabled = dl;
    }
  }

  function parseScratchVariables() {
    var text = scratchInput ? scratchInput.value : "";
    for (var i = 0; i < proVarNames.length; i++) { try { delete window[proVarNames[i]]; } catch (e) {} }
    proVarNames = [];
    proHasDesc = false;
    var lines = text.split("\n");
    for (i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^([A-Z0-9_]+?)\s*=\s*(.+)$/);
      if (m) {
        var name = m[1];
        window[name] = m[2].trim();
        if (name === "DESCRIPTION") proHasDesc = true;
        proVarNames.push(name);
      }
    }
  }

  function resolveTemplate(tpl) {
    if (!tpl || String(tpl).indexOf("[") < 0) return String(tpl);
    var out = null;
    try {
      if (window.ignorePerchanceErrors) out = window.ignorePerchanceErrors(function () { return String(tpl).evaluateItem; });
      else out = String(tpl).evaluateItem;
    } catch (e) { out = null; }
    if (out == null || String(out).indexOf("undefined") >= 0) return String(tpl);
    return String(out);
  }

  function build() {
    if (window.__proReady) return;
    DATA = window.IMAGER_PRO;
    descInput = $("pro-desc");
    descLockBtn = $("pro-desc-lock");
    var artCtn = $("pro-art-sels"), mixCtn = $("pro-mix-sels"), enhCtn = $("pro-enh-sels");
    for (var i = 0; i < 5; i++) {
      var sel = makeSelect(DATA.artStyles, "art" + i);
      sel.setAttribute("data-art", i);
      artCtn.appendChild(sel.parentNode);
      artSels.push(sel);
    }
    for (i = 0; i < DATA.mixers.length; i++) {
      sel = makeSelect(DATA.mixers[i], "mix" + i);
      mixCtn.appendChild(sel.parentNode);
      mixSels.push(sel);
    }
    for (i = 0; i < ENH_KEYS.length; i++) {
      var key = ENH_KEYS[i];
      sel = makeSelect(DATA.enhancers[key], "enh_" + key);
      enhCtn.appendChild(sel.parentNode);
      enhSels[key] = sel;
    }
    for (i = 0; i < 5; i++) allFields[i].setLabel(ART_LABELS[i]);
    for (i = 0; i < 7; i++) allFields[5 + i].setLabel(MIX_LABELS[i]);
    for (i = 0; i < ENH_KEYS.length; i++) allFields[12 + i].setLabel(ENH_LABELS[ENH_KEYS[i]]);

    shapeSel = $("pro-shape");
    countSel = $("pro-count");
    gscaleSel = $("pro-gscale");
    seedInput = $("pro-seed");
    negUseInput = $("pro-neg-use");
    negInput = $("pro-neg");
    genBtn = $("pro-gen");
    statusEl = $("pro-status");
    previewEl = $("pro-preview");
    gridEl = $("pro-grid");
    loadingEl = $("pro-loading");
    favsEl = $("pro-favs");
    presetSel = $("pro-preset-sel");
    presetName = $("pro-preset-name");
    presetSave = $("pro-preset-save");
    presetDel = $("pro-preset-del");

    var allEls = [descInput, descLockBtn, shapeSel, countSel, gscaleSel, seedInput, negUseInput, negInput, genBtn].concat(artSels).concat(mixSels).concat(ENH_KEYS.map(function (k) { return enhSels[k]; }));
    for (i = 0; i < allEls.length; i++) {
      allEls[i].addEventListener("change", onAnyChange);
      allEls[i].addEventListener("input", onAnyChange);
    }
    descInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); generate(); }
    });

    $("pro-desc-rand").addEventListener("click", randomizeDesc);
    $("pro-rand").addEventListener("click", randomizeAll);
    $("pro-reset").addEventListener("click", resetAll);
    $("pro-copy").addEventListener("click", copyPrompt);
    var varBtn = $("pro-variations");
    if (varBtn) varBtn.addEventListener("click", runVariations);
    var shareBtn = $("pro-share");
    if (shareBtn) shareBtn.addEventListener("click", shareRecipe);
    genBtn.addEventListener("click", function () { if (busy) { stopped = true; } else { generate(); } });

    var gBtn = $("pro-gallery-btn");
    if (gBtn) gBtn.addEventListener("click", function () { if (window.t2iOpenGallery) window.t2iOpenGallery(); });
    var aBtn = $("pro-autosave-btn");
    if (aBtn) aBtn.addEventListener("click", function () {
      if (window.t2iSetAutoSave) window.t2iSetAutoSave(!proAutoSave());
      updateAutoSaveToggle();
    });
    var sBtn = $("pro-saveall-btn");
    if (sBtn) sBtn.addEventListener("click", proSaveAllOnPage);
    var phBtn = $("pro-persona-history-btn");
    if (phBtn) phBtn.addEventListener("click", function () { if (window.t2i_openPersonaPromptHistory) window.t2i_openPersonaPromptHistory(); });
    updateAutoSaveToggle();
    refreshGalleryBtn();

    presetSave.addEventListener("click", savePreset);
    presetDel.addEventListener("click", deletePreset);
    presetSel.addEventListener("change", loadPreset);

    scratchInput = $("pro-scratch");
    scratchUseBtn = $("pro-scratch-use");
    aiIdeaBtn = $("pro-desc-ai");
    scratchInput.placeholder = "Brainstorm prompt ideas here — they auto-save. Define vars: ANIMAL = {dog|cat|frog} → use [ANIMAL] in Your Vision. A DESCRIPTION = ... line feeds the 🎲 Random idea button. Click 'Use' to copy.";
    var hintEl = $("pro-scratch-hint");
    if (hintEl) hintEl.textContent = "auto-saved · vars: NAME = {a|b|c} → [NAME]";
    try { var savedScratch = localStorage.getItem(SCRATCH_KEY); if (savedScratch) scratchInput.value = savedScratch; } catch (e) {}
    parseScratchVariables();
    var scratchParseTimer = null;
    scratchInput.addEventListener("input", function () { try { localStorage.setItem(SCRATCH_KEY, scratchInput.value); } catch (e) {} clearTimeout(scratchParseTimer); scratchParseTimer = setTimeout(parseScratchVariables, 1000); });
    scratchUseBtn.addEventListener("click", function () {
      if (!scratchInput.value.trim()) { statusEl.textContent = "⚠️ scratchpad is empty"; return; }
      parseScratchVariables();
      if (proHasDesc && window.DESCRIPTION) {
        descInput.value = resolveTemplate(window.DESCRIPTION);
      } else {
        descInput.value = scratchInput.value.split("\n").filter(function (l) { return !/^[A-Z0-9_]+?\s*=/.test(l.trim()); }).join("\n").trim();
      }
      onAnyChange();
      statusEl.textContent = "📋 copied to description";
      setTimeout(function () { if (!busy) statusEl.textContent = ""; }, 2000);
    });
    aiIdeaBtn.addEventListener("click", aiIdea);

    restoreState();
    refreshLocks();
    renderPresets();
    renderFavs();
    updatePreview();
    window.__proReady = true;
  }

  // integration hook for the shared PromptBridge ("send to ▸ Pro Imager")
  window.__proSetDesc = function (text) {
    if (!descInput) return;
    descInput.value = String(text == null ? "" : text);
    try { descInput.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
    if (typeof onAnyChange === "function") onAnyChange();
  };

  function onAnyChange() {
    saveState();
    updatePreview();
  }

  function selectedPrompt(sel, placeholder, desc) {
    var idx = clampIdx(DATA.artStyles, sel.value);
    var opt = DATA.artStyles[idx];
    var p = opt.prompt;
    if (placeholder) p = p.split("[input.description]").join(desc);
    return p;
  }

  function assemblePrompt() {
    var desc = resolveTemplate(descInput.value.trim());
    var parts = [];
    parts.push(selectedPrompt(artSels[0], true, desc));
    for (var i = 1; i < 5; i++) {
      if (clampIdx(DATA.artStyles, artSels[i].value) > 0) parts.push(selectedPrompt(artSels[i], true, desc));
    }
    for (i = 0; i < 7; i++) {
      var mi = clampIdx(DATA.mixers[i], mixSels[i].value);
      if (mi > 0) parts.push(DATA.mixers[i][mi].prompt);
    }
    for (i = 0; i < ENH_KEYS.length; i++) {
      var key = ENH_KEYS[i];
      var ei = clampIdx(DATA.enhancers[key], enhSels[key].value);
      if (ei > 0) parts.push(ENH_PROMPT_LABELS[key] + ": " + DATA.enhancers[key][ei].prompt);
    }
    return parts.filter(function (p) { return p && p.trim(); }).join(", ").replace(/\s*,\s*,\s*/g, ", ");
  }

  function buildOpts(seedVal) {
    var opts = { resolution: shapeSel.value };
    // CFG Random (copied from best-image-generator-by-nexora): fresh 7-30 roll.
    var gv = String(gscaleSel.value);
    if (gv === "random") opts.guidanceScale = 7 + Math.floor(Math.random() * 24);
    else { var g = parseInt(gv, 10); if (!isNaN(g) && g > 0) opts.guidanceScale = g; }
    if (seedVal !== "" && seedVal != null) opts.seed = seedVal;
    if (negUseInput.checked && negInput.value.trim()) opts.negativePrompt = negInput.value.trim();
    return opts;
  }

  function updatePreview() {
    if (!previewEl) return;
    var p = assemblePrompt();
    if (p) { previewEl.textContent = p; previewEl.hidden = false; }
    else previewEl.hidden = true;
  }

  function randomDescText() {
    if (proHasDesc && window.DESCRIPTION) {
      var ov = resolveTemplate(window.DESCRIPTION);
      if (ov && ov.trim()) return ov.trim();
    }
    var text = "";
    try {
      var rd = window.root && window.root.randomDescription;
      if (rd && rd.selectOne) text = rd.selectOne.evaluateItem;
    } catch (e) {}
    if (!text) text = FALLBACK_IDEAS[Math.floor(Math.random() * FALLBACK_IDEAS.length)];
    if (DATA.randomAppend.length) text += ", " + DATA.randomAppend[Math.floor(Math.random() * DATA.randomAppend.length)];
    return text;
  }

  function randomizeDesc() {
    if (locks["desc"]) return;
    descInput.value = randomDescText();
    onAnyChange();
  }

  async function aiIdea() {
    if (busy || !window.root || !window.root.generateText) return;
    var st = descInput.value.trim();
    statusEl.textContent = "✨ writing an idea…";
    try {
      var styleName = "";
      try { styleName = DATA.artStyles[clampIdx(DATA.artStyles, artSels[0].value)].name; } catch (e) {}
      var text = await window.root.generateText({
        instruction: "You write vivid, detailed text-to-image prompts. Write ONE concise image prompt (2-4 sentences) for a text-to-image AI."
          + (styleName && styleName.indexOf("Raw Prompt") < 0 ? " Intended base art style: " + styleName + "." : "")
          + (st ? " The user's rough idea: " + st : " Any interesting subject is fine.")
          + " Do not name the art style. Output only the prompt itself."
      });
      var t = String(text || "").trim();
      if (!t) throw new Error("empty response");
      descInput.value = t;
      onAnyChange();
      statusEl.textContent = "✨ idea ready — tweak it or hit Generate";
      setTimeout(function () { if (!busy) statusEl.textContent = ""; }, 4000);
    } catch (e) {
      console.error(e);
      statusEl.textContent = "⚠️ idea failed — try again";
    }
  }

  function randomIndex(opts) {
    return 1 + Math.floor(Math.random() * (opts.length - 1));
  }

  function randomizeAll() {
    if (!locks["art0"]) artSels[0].value = String(randomIndex(DATA.artStyles));
    for (var i = 1; i < 5; i++) if (!locks["art" + i]) artSels[i].value = String(randomIndex(DATA.artStyles));
    for (i = 0; i < 7; i++) if (!locks["mix" + i]) mixSels[i].value = String(randomIndex(DATA.mixers[i]));
    for (i = 0; i < ENH_KEYS.length; i++) {
      var key = ENH_KEYS[i];
      if (!locks["enh_" + key]) enhSels[key].value = String(randomIndex(DATA.enhancers[key]));
    }
    shapeSel.value = shapeSel.options[1 + Math.floor(Math.random() * (shapeSel.options.length - 1))].value;
    countSel.value = countSel.options[1 + Math.floor(Math.random() * (countSel.options.length - 1))].value;
    gscaleSel.value = gscaleSel.options[1 + Math.floor(Math.random() * (gscaleSel.options.length - 1))].value;
    if (!locks["desc"]) descInput.value = randomDescText();
    onAnyChange();
  }

  function resetAll() {
    for (var i = 0; i < 5; i++) if (!locks["art" + i]) artSels[i].value = "0";
    for (i = 0; i < 7; i++) if (!locks["mix" + i]) mixSels[i].value = "0";
    for (i = 0; i < ENH_KEYS.length; i++) {
      var key = ENH_KEYS[i];
      if (!locks["enh_" + key]) enhSels[key].value = "0";
    }
    if (!locks["desc"]) descInput.value = "";
    onAnyChange();
  }

  function proGalleryCount() {
    try { return window.t2iGetGallery ? window.t2iGetGallery().length : 0; } catch (e) { return 0; }
  }
  function refreshGalleryBtn() {
    if (window.t2iUpdateGalleryCount) { try { window.t2iUpdateGalleryCount(); } catch (e) {} }
  }
  function proAutoSave() {
    try { return window.t2iGetAutoSave ? window.t2iGetAutoSave() : true; } catch (e) { return true; }
  }
  function updateAutoSaveToggle() {
    var b = $("pro-autosave-btn");
    if (!b) return;
    var on = proAutoSave();
    b.textContent = on ? "☁️ autosave: ON" : "☁️ autosave: OFF";
    b.style.opacity = on ? "1" : "0.55";
  }
  async function saveProImageToGallery(dataUrl, prompt) {
    if (!window.t2iAddImageToGallery) { showToast("⚠️ gallery not ready"); return false; }
    try {
      var url = await window.t2iAddImageToGallery(dataUrl, prompt || "", "");
      if (url) { refreshGalleryBtn(); showToast("☁️ saved to gallery"); return true; }
      showToast("💾 already saved"); return false;
    } catch (e) { console.error(e); showToast("⚠️ could not save image"); return false; }
  }
  async function autoSaveProImage(dataUrl, prompt) {
    try {
      if (!dataUrl) return;
      if (window.t2iGetNsfwFilter && window.t2iGetNsfwFilter()) {
        var thumb = await window.t2iUploadThumbnail(dataUrl);
        if (!thumb) return;
        var nsfw = await window.t2iCheckNsfw(thumb);
        if (nsfw === true) { showToast("🔞 skipped (NSFW filter on)"); return; }
      }
      await saveProImageToGallery(dataUrl, prompt);
    } catch (e) { console.warn("pro autosave:", e); }
  }
  async function proSaveAllOnPage() {
    if (!window.t2iAddImageToGallery) { showToast("⚠️ gallery not ready"); return; }
    var imgs = gridEl.querySelectorAll(".pro-tile img");
    if (!imgs.length) { showToast("⚠️ no generated images on the page"); return; }
    var added = 0, skipped = 0, failed = 0, censored = 0;
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var url = img.getAttribute("src") || "";
      if (!url) { failed++; continue; }
      var prompt = img.getAttribute("data-prompt") || "";
      if (window.t2iGetNsfwFilter && window.t2iGetNsfwFilter()) {
        var thumb = await window.t2iUploadThumbnail(url);
        if (!thumb) { failed++; continue; }
        var nsfw = await window.t2iCheckNsfw(thumb);
        if (nsfw === true) { censored++; continue; }
      }
      var saved = await window.t2iAddImageToGallery(url, prompt, "");
      if (saved) added++; else skipped++;
    }
    refreshGalleryBtn();
    var parts = [];
    if (added) parts.push("☁️ " + added + " saved");
    if (skipped) parts.push(skipped + " already saved");
    if (censored) parts.push("🔞 " + censored + " censored");
    if (failed) parts.push("⚠️ " + failed + " failed");
    showToast(parts.length ? parts.join(" · ") : "nothing to save");
  }

  function addTile(dataUrl, prompt, inputs) {
    var tile = document.createElement("div");
    tile.className = "pro-tile";
    tile.__proInputs = inputs || null;
    var img = document.createElement("img");
    img.src = dataUrl;
    img.loading = "lazy";
    img.alt = "generated image";
    img.setAttribute("data-prompt", prompt || "");
    var acts = document.createElement("div");
    acts.className = "pro-tile-actions";
    var dl = document.createElement("a");
    dl.className = "pro-tile-btn";
    dl.title = "Download";
    dl.textContent = "⬇️";
    dl.href = dataUrl;
    dl.download = tileName() + "-" + Date.now() + ".png";
    var gal = document.createElement("button");
    gal.type = "button";
    gal.className = "pro-tile-btn";
    gal.title = "Save to gallery (with its prompt)";
    gal.textContent = "☁️";
    gal.addEventListener("click", function () { saveProImageToGallery(dataUrl, prompt || ""); });
    var post = document.createElement("button");
    post.type = "button";
    post.className = "pro-tile-btn";
    post.title = "Post to community gallery";
    post.textContent = "🌍";
    post.addEventListener("click", function () { openProPost(dataUrl, prompt || "", tile.__proInputs); });
    var fav = document.createElement("button");
    fav.type = "button";
    fav.className = "pro-tile-btn";
    fav.title = "Save to favorites";
    fav.textContent = "💾";
    fav.addEventListener("click", function () { saveFav(dataUrl); });
    var persona = document.createElement("button");
    persona.type = "button";
    persona.className = "pro-tile-btn";
    persona.title = "Create a character / persona from this image";
    persona.textContent = "🎭";
    persona.addEventListener("click", function () { openProPersona(dataUrl, prompt || ""); });
    var vault = document.createElement("button");
    vault.type = "button";
    vault.className = "pro-tile-btn";
    vault.title = "Save this prompt (and image) to your vault";
    vault.textContent = "📚";
    vault.addEventListener("click", async function () {
      if (!window.Vault) {
        if (window.ensureVault) { try { window.ensureVault(); } catch (e) {} }
        vault.textContent = "⏳";
        var n = 0;
        while (!window.Vault && ++n < 40) { await new Promise(function (r) { setTimeout(r, 200); }); }
        if (!window.Vault) { vault.textContent = "⚠️"; setTimeout(function () { vault.textContent = "📚"; }, 1500); return; }
      }
      vault.textContent = "✅";
      try {
        if (prompt && window.Vault.addImage) await window.Vault.addImage(dataUrl, prompt, { tags: ["pro"], tab: "pro" });
        else showToast("⚠️ no prompt on this image");
      } catch (e) { vault.textContent = "⚠️"; }
      setTimeout(function () { vault.textContent = "📚"; }, 1500);
    });
    var sendP = document.createElement("button");
    sendP.type = "button";
    sendP.className = "pro-tile-btn";
    sendP.title = "Send this prompt to another tab";
    sendP.textContent = "▸";
    sendP.addEventListener("click", function () {
      if (!window.PromptBridge || !prompt) return;
      window.PromptBridge.sendTo(prompt, { anchor: sendP, preview: prompt, tags: ["pro"] });
    });
    var roster = document.createElement("button");
    roster.type = "button";
    roster.className = "pro-tile-btn";
    roster.title = "Add to your character roster (reuse the same look later)";
    roster.textContent = "🧑";
    roster.addEventListener("click", function () {
      if (!window.Characters) return;
      var inp = tile.__proInputs || {};
      window.Characters.captureFromImage(dataUrl, prompt || "", { seed: inp.seed, shape: inp.resolution || (shapeSel && shapeSel.value) });
    });
    acts.appendChild(dl);
    acts.appendChild(gal);
    acts.appendChild(post);
    acts.appendChild(fav);
    acts.appendChild(persona);
    acts.appendChild(vault);
    acts.appendChild(sendP);
    acts.appendChild(roster);
    tile.appendChild(img);
    tile.appendChild(acts);
    gridEl.appendChild(tile);
  }

  function setLoading(on) {
    loadingEl.hidden = !on;
    genBtn.textContent = on ? "⏹ Stop" : "✨ Generate";
  }

  // ---------- persona / character creation (mirrors the gen tab's persona flow) ----------
  var proPersonaGenObj = null;
  function openProPersona(dataUrl, prompt) {
    var existing = document.getElementById("proPersonaModal");
    if (existing) existing.remove();
    var overlay = document.createElement("div");
    overlay.id = "proPersonaModal";
    overlay.className = "pro-persona-overlay";
    overlay.innerHTML =
      '<div class="pro-persona-box">' +
        '<div class="pro-persona-head">' +
          "<b>🎭 Create a character</b>" +
          '<span class="pro-persona-sub">from a generated image — chat with them afterwards</span>' +
          '<button type="button" class="pro-persona-x" data-px-close title="close">✖️</button>' +
        "</div>" +
        '<div class="pro-persona-body">' +
          '<img class="pro-persona-img" src="' + dataUrl + '" alt="character">' +
          '<div class="pro-persona-fields">' +
            '<textarea class="pro-persona-instruction" placeholder="(Optional) Extra instructions for the personality, appearance, and backstory to be generated."></textarea>' +
            '<div class="pro-persona-controls" style="display:flex; align-items:center; gap:0.45rem; flex-wrap:wrap; font-size:0.78rem;">' +
              '<select class="pro-select pro-persona-tone" title="Persona tone — shapes the personality the AI invents" style="flex:1; min-width:0;"></select>' +
              '<label style="display:flex; align-items:center; gap:0.3rem; white-space:nowrap; cursor:pointer;" title="Add extra wit, energy and expressiveness"><input type="checkbox" class="pro-persona-lively"> ✨ extra sparkle</label>' +
            '</div>' +
            '<div class="pro-persona-btnrow">' +
              '<button type="button" class="pro-btn pro-btn-primary pro-persona-gen">✨ generate persona</button>' +
              '<button type="button" class="pro-btn pro-persona-stop" style="display:none;">🛑 stop</button>' +
            "</div>" +
            '<input class="pro-persona-name" placeholder="Character name">' +
            '<textarea class="pro-persona-desc" placeholder="Click 𝗴𝗲𝗻𝗲𝗿𝗮𝘁𝗲 𝗽𝗲𝗿𝘀𝗼𝗻𝗮 above — the description will appear here, then you can edit it."></textarea>' +
            '<div class="pro-persona-btnrow">' +
              '<button type="button" class="pro-btn pro-btn-primary pro-persona-chat">💬 chat with them</button>' +
              '<button type="button" class="pro-btn pro-persona-history">📋 prompt history</button>' +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>";
    document.body.appendChild(overlay);
    var toneSel0 = overlay.querySelector(".pro-persona-tone");
    var liveChk0 = overlay.querySelector(".pro-persona-lively");
    var savedToneVal = "auto";
    try { var stv = localStorage.getItem("t2i_persona_tone"); if (stv) savedToneVal = stv; } catch (e) {}
    if (toneSel0) {
      if (window.t2i_fillToneSelect) {
        window.t2i_fillToneSelect(toneSel0, savedToneVal);
      } else {
        var toneOpts = window.t2i_personaTones || [{ id: "auto", label: "✨ Auto (surprise me)" }];
        for (var toi = 0; toi < toneOpts.length; toi++) {
          var op0 = document.createElement("option");
          op0.value = toneOpts[toi].id;
          op0.textContent = toneOpts[toi].label;
          if (toneOpts[toi].id === savedToneVal) op0.selected = true;
          toneSel0.appendChild(op0);
        }
      }
      toneSel0.addEventListener("change", function () { try { localStorage.setItem("t2i_persona_tone", toneSel0.value); } catch (e) {} });
    }
    if (liveChk0) {
      try { liveChk0.checked = localStorage.getItem("t2i_persona_lively") === "1"; } catch (e) {}
      liveChk0.addEventListener("change", function () { try { localStorage.setItem("t2i_persona_lively", liveChk0.checked ? "1" : "0"); } catch (e) {} });
    }
    var genBtn = overlay.querySelector(".pro-persona-gen");
    var stopBtn = overlay.querySelector(".pro-persona-stop");
    function closeModal() {
      if (proPersonaGenObj && proPersonaGenObj.stop) { try { proPersonaGenObj.stop(); } catch (e) {} proPersonaGenObj = null; }
      overlay.remove();
    }
    overlay.querySelector("[data-px-close]").addEventListener("click", closeModal);
    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) closeModal(); });
    genBtn.addEventListener("click", function () { generateProPersona(overlay, prompt); });
    stopBtn.addEventListener("click", function () { if (proPersonaGenObj && proPersonaGenObj.stop) { try { proPersonaGenObj.stop(); } catch (e) {} } });
    overlay.querySelector(".pro-persona-chat").addEventListener("click", function () { chatWithProPersona(overlay, dataUrl); });
    var historyBtn = overlay.querySelector(".pro-persona-history");
    if (historyBtn) historyBtn.addEventListener("click", function () { if (window.t2i_openPersonaPromptHistory) window.t2i_openPersonaPromptHistory(); });
    overlay.querySelector(".pro-persona-instruction").addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); genBtn.click(); } });
    var nameEl = overlay.querySelector(".pro-persona-name");
    (function () {
      function attach() {
        try {
          if (window.NameRoller) window.NameRoller.addRerollButton(nameEl);
          else if (window.ensureNameRoller) window.ensureNameRoller(attach);
        } catch (e) {}
      }
      attach();
    })();
    try { nameEl.focus(); } catch (e) {}
  }

  async function generateProPersona(overlay, prompt) {
    if (!window.root || !window.root.generateText) { showToast("⚠️ AI text not available"); return; }
    var genBtn = overlay.querySelector(".pro-persona-gen");
    var stopBtn = overlay.querySelector(".pro-persona-stop");
    var nameEl = overlay.querySelector(".pro-persona-name");
    var descEl = overlay.querySelector(".pro-persona-desc");
    var instruction = overlay.querySelector(".pro-persona-instruction").value.trim();
    var toneEl = overlay.querySelector(".pro-persona-tone");
    var livelyEl = overlay.querySelector(".pro-persona-lively");
    var tone = toneEl ? toneEl.value : "auto";
    var lively = !!(livelyEl && livelyEl.checked);
    var originalLabel = genBtn.textContent;
    genBtn.textContent = "⏳ loading...";
    genBtn.disabled = true;
    stopBtn.style.display = "";
    nameEl.value = "";
    descEl.value = "";
    var generateObj = (window.t2i_buildPersonaInstruction && window.t2i_runPersonaGeneration) ? window.t2i_runPersonaGeneration({
      imagePrompt: prompt,
      instruction: instruction,
      tone: tone,
      lively: lively,
      onProgress: function (p) {
        if (p && p.done) { genBtn.textContent = "⏳ finishing..."; return; }
        genBtn.textContent = "⏳ part " + p.index + "/" + p.total + " · " + (p.label || "") + (p.retry ? " (retry)" : "") + "…";
      },
      onUpdate: function (p) {
        nameEl.value = p.name || "";
        descEl.value = p.description || "";
        if (descEl.scrollTop > (descEl.scrollHeight - descEl.offsetHeight) - 30) descEl.scrollTop = 99999999;
      }
    }) : window.root.generateText({
      instruction: `TASK: The user has created an image of a character using a prompt. The prompt is shown below. Your task is to use the character personality hints in the prompt to generate a character description for roleplaying with. Your description should ideally include personality, appearance, speech examples/mannerisms, etc. such that an actor could read it and know how to roleplay as the character in all relevant aspects. Use an information-dense writing style to *succinctly* capture all aspects of the personality of the character that you generate. Your description should be between 200 and 600 words in length. Do your best to generate a character based on what you see below. Follow the hints in the user's image prompt to accurately capture the details that are most important to a character chat/roleplay.

--- START OF IMAGE PROMPT ---
${String(prompt || "").replace(/\s+/g, " ")}
--- END OF IMAGE PROMPT ---

Reminder: Your task is to generate a character that is inspired by the above image prompt. Your response should describe how the character looks/acts/speaks/behaves such that if someone read it, they would be able to accurately emulate or roleplay as the target character's mannerisms, personality, etc. No more than 600 words.
${instruction ? `\nBut also, the character must be based on this instruction: ${instruction}\n` : ""}

Use this template for your response:
<response_template>
# Name:
(The character's name)

# Visual Description:
(A SHORT paragraph describing what they look like - keep this short, concise and to-the-point. Low word count, high information density. Avoid using purple prose and overly flowery descriptions.)

# Personality Description:
(ONE paragraph personality description. Use mainly short sentences - i.e. write in an information-dense style. Focus on the aspects that make them unique/interesting. If relevant, you can use terms like tsundere, yandere, kuudere, deredere, dandere, genki girl, kuudere, seme, uke, megane, chuunibyou, clumsy heroine, superiority complex, dominant, submissive, etc. to succinctly capture aspects of their personality. Invent a few interesting aspects, use creative liberty to create a character that has genuine depth, with idiosyncrasies, goals, fears, likes, dislikes, ethics, etc. Remember, your goal is to create a character that would be fun for the user to roleplay with! Follow the user's lead based on their initial idea, but take it one step further to surprise and excite them.)

# Roleplay Behavior Examples:
(A numbered list of 5 separate and diverse examples of character speech/behavior, each starting with an asterisk or double-quote, which place the character in random roleplay situations, as if you've extracted random & diverse moments from a story, with sufficient context captured by the dialogue and actions themselves, to show the essence of who they are as a character, how they speak/act/react/etc. Each example should perfectly capture one aspect of who they are as a character. Each example should be its own separate momement from a hypothetical story, unrelated to the other examples that you write. You must use asterisks around actions and quotes around speech in typical roleplays style, for example [don't use this specific example in your response, it's just to demonstrate the syntax]: 1. "And why the..." *He gestures to the overturned carriage* "...grand entrance?" [...])

# Favorite Food:
(favorite food)
</response_template>`.trim(),
      startWith: "# Name:",
      stopSequences: ["# Favorite"],
      onChunk: function (data) {
        var full = (data && data.fullTextSoFar) || "";
        var parts = full.split(/(^|\n\n)# /s).map(function (p) { return p.trim(); }).filter(function (p) { return p; });
        var name = "", visual = "", personality = "", rp = "";
        for (var i = 0; i < parts.length; i++) {
          if (parts[i].startsWith("Name")) name = ((parts[i].split("\n")[1] || "").trim() || name);
          else if (parts[i].startsWith("Visual")) visual = parts[i].split("\n").slice(1).join("\n").trim();
          else if (parts[i].startsWith("Personality")) personality = parts[i].split("\n").slice(1).join("\n").trim();
          else if (parts[i].startsWith("Roleplay")) rp = parts[i].split("\n").slice(1).join("\n").trim();
        }
        nameEl.value = name || "";
        descEl.value = "# {{char}} Visual Description:\n" + visual + "\n\n# {{char}} Personality:\n" + personality + "\n\n# {{char}} Roleplay Behavior Examples:\n" + rp;
        if (descEl.scrollTop > (descEl.scrollHeight - descEl.offsetHeight) - 30) descEl.scrollTop = 99999999;
      }
    });
    proPersonaGenObj = generateObj;
    try { await generateObj; } catch (e) { console.error(e); }
    proPersonaGenObj = null;
    genBtn.textContent = originalLabel;
    genBtn.disabled = false;
    stopBtn.style.display = "none";
    try {
      if (window.t2i_autosavePersonaPrompt) {
        await window.t2i_autosavePersonaPrompt({ source: "pro", imagePrompt: prompt || "", instruction: instruction, tone: tone, name: nameEl.value || "", description: descEl.value || "" });
      }
    } catch (e) { console.error(e); }
  }

  async function chatWithProPersona(overlay, dataUrl) {
    var nameEl = overlay.querySelector(".pro-persona-name");
    var descEl = overlay.querySelector(".pro-persona-desc");
    var name = (nameEl.value || "").trim().replace(/\n+/g, " ");
    var description = (descEl.value || "").trim().replace(/\n+/g, "\n").trim();
    if (!name) name = "Character";
    if (!description) { showToast("⚠️ First click 𝗴𝗲𝗻𝗲𝗿𝗮𝘁𝗲 𝗽𝗲𝗿𝘀𝗼𝗻𝗮 above to generate a character description."); return; }
    var roleInstruction = `# Description of ${name}:
${description}

# Roleplay Guidelines:
- Bring characters to life by realistically portraying their unique traits, thoughts, emotions, appearances, physical sensations, speech patterns, and tone. Consider the situation, characters' motivations, and potential consequences.
- Ensure that their reactions, interactions, and decision-making align with their established personalities/descriptions, values, goals, and fears. You must **ALWAYS** maintain accurate character portrayals.

Creatively improvise this fictional roleplay between {{char}} and {{user}} to create an interesting and engaging experience/story/chat, no matter where {{user}} decides to lead it. The overall goal is to create a genuinely fascinating and engaging roleplay/story. So good that you can't stop reading. Be proactive, introducing new events, proposing new conversation topics, and leading the role-play in new, interesting directions when appropriate to keep the overall experience engaging.`.trim();
    try {
      if (window.t2i_dynamicBondEnabled && window.t2i_dynamicBondEnabled() && window.t2i_dynamicBondBlock) {
        roleInstruction += "\n\n" + window.t2i_dynamicBondBlock();
      }
    } catch (e) {}
    var styleName = "";
    try { styleName = DATA.artStyles[clampIdx(DATA.artStyles, artSels[0].value)].name; } catch (e) {}
    var imagePromptSuffix = (styleName && styleName.indexOf("Raw Prompt") < 0) ? " in the style of " + styleName : "";
    var json = {
      addCharacter: {
        name: name,
        roleInstruction: roleInstruction,
        maxParagraphCountPerMessage: 2,
        imagePromptSuffix: imagePromptSuffix,
        initialMessages: [{ author: "system", content: `<i style="font-size:85%;">Introduce yourself to ${name}, or perhaps <b style="color:#00af00;">tap the Narrator button</b> and tell it to generate an initial roleplay scenario based on some keywords/themes. You can change your name using the 'options' button.</i>`, hiddenFrom: ["ai"] }],
        avatar: { url: dataUrl, size: 1, shape: "square" }
      },
      quickAdd: true
    };
    if (window.t2i_generateShareLinkForCharacter) {
      try { await window.t2i_generateShareLinkForCharacter(json); }
      catch (e) { console.error(e); showToast("⚠️ chat link failed"); }
    } else {
      showToast("⚠️ chat link not available");
    }
  }

  // ---------- post to community gallery (native platform save flow) ----------
  function openProPost(dataUrl, prompt, inputs, noteHtml) {
    if (window.CommunityCap && !window.CommunityCap.canPost()) { showToast(window.CommunityCap.blockedMsg()); return; }
    if (window.CommunityCap) window.CommunityCap.notePosted();
    var existing = document.getElementById("proPostModal");
    if (existing) existing.remove();
    var overlay = document.createElement("div");
    overlay.id = "proPostModal";
    overlay.className = "pro-persona-overlay";
    overlay.innerHTML =
      '<div class="pro-persona-box pro-post-box">' +
        '<div class="pro-persona-head">' +
          "<b>🌍 Post to community gallery</b>" +
          '<span class="pro-persona-sub">publish this image to the Pro Imager community gallery</span>' +
          '<button type="button" class="pro-persona-x" data-px-close title="close">✖️</button>' +
        "</div>" +
        '<div class="pro-post-body">' +
          '<div class="pro-post-note">' + (noteHtml ||
            "Your image is reopened in the platform\u2019s gallery-save view (same prompt &amp; seed, so it regenerates identically). When it\u2019s ready, click the <b>❤️</b> button on the image, then <b>📮 send to gallery</b> — keep the gallery name as <b>public</b> so it goes to the community galleries. It\u2019s saved permanently and anyone can view and vote on it. Anything flagged NSFW only shows in the gated <b>🔞 NSFW Gallery</b>; everything else shows in the <b>✅ SFW Gallery</b>.") + '</div>' +
          '<div class="pro-post-embed"></div>' +
        "</div>" +
      "</div>";
    document.body.appendChild(overlay);
    overlay.querySelector("[data-px-close]").addEventListener("click", function () { overlay.remove(); });
    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) overlay.remove(); });
    var embedCtn = overlay.querySelector(".pro-post-embed");
    inputs = inputs || {};
    var hashData = {
      saveChannel: window.generatorName,
      saveTitle: String(prompt || "").replace(/\s+/g, " ").trim().slice(0, 60),
      saveDescription: String(prompt || ""),
      prompt: inputs.prompt || String(prompt || ""),
      seed: (inputs.seed != null) ? inputs.seed : -1,
      resolution: inputs.resolution || "768x768",
      guidanceScale: inputs.guidanceScale || 7,
      defaultGuidanceScale: 7,
      negativePrompt: inputs.negativePrompt || "",
      requestId: Math.random().toString(),
      iframeId: "proPostEmbed" + Math.random().toString().slice(2)
    };
    var iframe = document.createElement("iframe");
    iframe.className = "text-to-image-plugin-image-iframe";
    iframe.setAttribute("data-already-added-intersection-observer", "yes");
    iframe.src = "https://image-generation.perchance.org/embed#" + encodeURIComponent(JSON.stringify(hashData));
    iframe.style.cssText = "width:100%;height:540px;border:0;background:transparent;display:block;";
    embedCtn.appendChild(iframe);
  }

  // ---------- post a Personal Gallery image (prompt re-created, seed unknown) ----------
  function ensureT2iGallery() {
    if (window.t2iGetGallery && window.t2iOpenGallery) return Promise.resolve(true);
    if (window.ensureGallery) { try { window.ensureGallery(); } catch (e) {} }
    return new Promise(function (res) {
      var n = 0;
      (function tick() {
        if (window.t2iGetGallery && window.t2iOpenGallery) return res(true);
        if (++n > 30) return res(false);
        setTimeout(tick, 250);
      })();
    });
  }
  function openPersonalPost(btn) {
    var orig = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "⏳"; }
    ensureT2iGallery().then(function (ok) {
      if (btn) { btn.disabled = false; btn.textContent = orig; }
      if (!ok) { showToast("⚠️ gallery still loading — try again"); return; }
      var gal = [];
      try { gal = window.t2iGetGallery() || []; } catch (e) { gal = []; }
      if (!gal.length) {
        showToast("Personal Gallery is empty — save something first");
        if (window.showTab) window.showTab("gallery");
        return;
      }
      window.t2iOpenGallery({ pick: {
        title: "📤 Post to community gallery",
        hint: "Tap ONE image to publish, then press Add. Its saved prompt is re-created in the platform's gallery-save view (a fresh variation), where you finish with ❤️ → 📮 send to gallery.",
        addNoun: "Post",
        onPick: function (items) {
          if (items && items.length > 1) showToast("Posting the first of " + items.length + " — repeat for the rest");
          var it = items && items[0];
          if (!it) return;
          var prompt = String(it.prompt || "").trim();
          if (!prompt) { showToast("⚠️ that image has no saved prompt"); return; }
          var title = String(it.title || "").trim() || prompt.slice(0, 60);
          openProPost(null, prompt, {},
            "Your saved image can\u2019t be uploaded pixel-for-pixel — the platform only publishes pictures through its own generator. So the saved prompt (<b>" + commEsc(title).slice(0, 80) + "</b>) is re-opened below in the platform\u2019s gallery-save view and re-created as a fresh variation. When it\u2019s ready, click the <b>❤️</b> button on the image, then <b>📮 send to gallery</b> — keep the gallery name as <b>public</b> so it goes to the community galleries. It\u2019s saved permanently and anyone can view and vote on it. Anything flagged NSFW only shows in the gated <b>🔞 NSFW Gallery</b>; everything else shows in the <b>✅ SFW Gallery</b>.");
        }
      } });
    });
  }

  var toastTimer = null;
  function showToast(msg) {
    var t = $("pro-toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2000);
  }

  function bumpCount() {
    var c = parseInt(localStorage.getItem(COUNT_KEY) || "0", 10) || 0;
    c++;
    try { localStorage.setItem(COUNT_KEY, String(c)); } catch (e) {}
    var m = { 1: "🎨 First image! A star is born.", 10: "🎉 10 images! Warming up.", 50: "🌟 50! Certified gallery goblin.", 100: "👑 100! Royalty (of rendering).", 500: "🔥 500! Magnificent. Touch grass maybe?", 1000: "💎 1000! The GPU fears you." };
    if (m[c]) showToast(m[c]);
  }

  function tileName() {
    var style = "pro";
    try { var n = DATA.artStyles[clampIdx(DATA.artStyles, artSels[0].value)].name; if (n) style = n; } catch (e) {}
    var slug = (descInput.value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
    return (style + (slug ? "-" + slug : "")).replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80);
  }

  async function generate() {
    if (busy) return;
    if (!descInput.value.trim()) { statusEl.textContent = "⚠️ describe your image first " + Quip.q("proDescribe", "— 'cool stuff' was already tried."); return; }
    if (!assemblePrompt()) { statusEl.textContent = "⚠️ describe your image first " + Quip.q("proDescribe", "— 'cool stuff' was already tried."); return; }
    var count = parseInt(countSel.value, 10) || 1;
    var baseOpts = buildOpts("");
    var seedTxt = seedInput.value.trim();
    var baseSeed = seedTxt ? (parseInt(seedTxt, 10) || 0) : null;
    busy = true; stopped = false;
    gridEl.innerHTML = "";
    setLoading(true);
    statusEl.textContent = "starting…";
    var made = 0, failed = 0;
    for (var i = 0; i < count; i++) {
      if (stopped) break;
      statusEl.textContent = "generating " + (i + 1) + "/" + count + "…";
      var stopFunny = window.FunnyGen ? window.FunnyGen.start(function (line) { statusEl.textContent = "generating " + (i + 1) + "/" + count + "… " + line; }) : null;
      var opts = Object.assign({}, baseOpts);
      if (baseSeed != null) opts.seed = baseSeed + i;
      try {
        var prompt = assemblePrompt();
        lastPrompt = prompt;
        var res = await window.root.generateImage(prompt, opts);
        if (stopFunny) { try { stopFunny(); } catch (_f) {} stopFunny = null; }
        if (res && res.dataUrl) { addTile(res.dataUrl, prompt, res.inputs); made++; bumpCount(); if (proAutoSave()) autoSaveProImage(res.dataUrl, prompt); }
        else if (res && res.error) throw new Error(res.error);
        else throw new Error("no image returned");
      } catch (e) {
        failed++;
        console.error(e);
        if (stopFunny) { try { stopFunny(); } catch (_f) {} stopFunny = null; }
        statusEl.textContent = "⚠️ image " + (i + 1) + " failed" + (failed === 1 ? " — " + (e && e.message ? e.message : "") : "");
      }
    }
    if (typeof stopFunny !== "undefined" && stopFunny) { try { stopFunny(); } catch (_f) {} }
    setLoading(false);
    busy = false;
    if (made > 0) statusEl.textContent = "✅ " + made + " image" + (made === 1 ? "" : "s") + (failed > 0 ? ", " + failed + " failed" : "") + (stopped ? " (stopped)" : "");
    else if (stopped) statusEl.textContent = "⏹ stopped";
    else statusEl.textContent = "⚠️ nothing generated";
  }

  // ---------- variations (contact sheet: one prompt, many seeds) ----------
  async function runVariations() {
    if (busy) return;
    if (!assemblePrompt()) { statusEl.textContent = "⚠️ describe your image first " + Quip.q("proDescribe", "— 'cool stuff' was already tried."); return; }
    var n = 4;
    try {
      var v = window.prompt("How many variations of this prompt? (2–8)", "4");
      if (v === null) return;
      n = Math.max(2, Math.min(8, parseInt(v, 10) || 4));
    } catch (e) {}
    if (!window.root || !window.root.generateImage) { statusEl.textContent = "⚠️ image generator not ready"; return; }
    busy = true; stopped = false;
    gridEl.innerHTML = "";
    setLoading(true);
    var made = 0;
    for (var i = 0; i < n && !stopped; i++) {
      statusEl.textContent = "🎞️ variation " + (i + 1) + "/" + n + "…";
      var stopFunny = window.FunnyGen ? window.FunnyGen.start(function (line) { statusEl.textContent = "🎞️ variation " + (i + 1) + "/" + n + "… " + line; }) : null;
      var opts = buildOpts(String(Math.floor(Math.random() * 2147483646)));
      try {
        var prompt = assemblePrompt();
        lastPrompt = prompt;
        var res = await window.root.generateImage(prompt, opts);
        if (stopFunny) { try { stopFunny(); } catch (_f) {} stopFunny = null; }
        if (res && res.dataUrl) { addTile(res.dataUrl, prompt, res.inputs || opts); made++; bumpCount(); if (proAutoSave()) autoSaveProImage(res.dataUrl, prompt); }
      } catch (e) { console.error(e); }
    }
    if (typeof stopFunny !== "undefined" && stopFunny) { try { stopFunny(); } catch (_f) {} }
    setLoading(false);
    busy = false;
    statusEl.textContent = "🎞️ " + made + " variation" + (made === 1 ? "" : "s") + (stopped ? " (stopped)" : "");
  }

  // ---------- shareable recipe (restores the whole Pro setup) ----------
  function shareRecipe() {
    if (!window.Recipe) { showToast("⚠️ recipes still loading…"); return; }
    var enh = {};
    for (var i = 0; i < ENH_KEYS.length; i++) { var k = ENH_KEYS[i]; enh[k] = enhSels[k] ? enhSels[k].value : ""; }
    window.Recipe.copy("pro", {
      desc: descInput.value,
      art: artSels.map(function (s) { return s.value; }),
      mix: mixSels.map(function (s) { return s.value; }),
      enh: enh,
      shape: shapeSel.value, count: countSel.value, gscale: gscaleSel.value,
      seed: seedInput.value, negUse: negUseInput.checked, neg: negInput.value
    });
  }

  window.__proApplyRecipe = function (data) {
    if (!data) return;
    if (data.desc != null) descInput.value = data.desc;
    (data.art || []).forEach(function (v, i) { if (artSels[i] && v != null) artSels[i].value = String(v); });
    (data.mix || []).forEach(function (v, i) { if (mixSels[i] && v != null) mixSels[i].value = String(v); });
    Object.keys(data.enh || {}).forEach(function (k) { if (enhSels[k] && data.enh[k] != null) enhSels[k].value = String(data.enh[k]); });
    if (data.shape != null) shapeSel.value = String(data.shape);
    if (data.count != null) countSel.value = String(data.count);
    if (data.gscale != null) gscaleSel.value = String(data.gscale);
    if (data.seed != null) seedInput.value = String(data.seed);
    if (data.negUse != null) negUseInput.checked = !!data.negUse;
    if (data.neg != null) negInput.value = data.neg;
    onAnyChange();
    showToast("🔗 recipe applied");
  };

  function copyPrompt() {
    var p = assemblePrompt();
    if (!p) return;
    function done() { statusEl.textContent = "📋 prompt copied"; setTimeout(function () { if (!busy) statusEl.textContent = ""; }, 2000); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(p).then(done, function () { fallbackCopy(p); done(); });
    } else { fallbackCopy(p); done(); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
  }

  function saveState() {
    var st = {
      desc: descInput.value,
      art: artSels.map(function (s) { return s.value; }),
      mix: mixSels.map(function (s) { return s.value; }),
      enh: {}, shape: shapeSel.value, count: countSel.value, gscale: gscaleSel.value,
      seed: seedInput.value, useNeg: negUseInput.checked, neg: negInput.value
    };
    for (var i = 0; i < ENH_KEYS.length; i++) st.enh[ENH_KEYS[i]] = enhSels[ENH_KEYS[i]].value;
    saveJSON(STATE_KEY, st);
  }

  function restoreState() {
    var st = loadJSON(STATE_KEY, null);
    if (!st) return;
    if (st.desc != null) descInput.value = st.desc;
    if (st.art) for (var i = 0; i < Math.min(5, st.art.length); i++) if (st.art[i] != null) artSels[i].value = String(clampIdx(DATA.artStyles, st.art[i]));
    if (st.mix) for (i = 0; i < Math.min(7, st.mix.length); i++) if (st.mix[i] != null) mixSels[i].value = String(clampIdx(DATA.mixers[i], st.mix[i]));
    if (st.enh) for (i = 0; i < ENH_KEYS.length; i++) if (st.enh[ENH_KEYS[i]] != null) enhSels[ENH_KEYS[i]].value = String(clampIdx(DATA.enhancers[ENH_KEYS[i]], st.enh[ENH_KEYS[i]]));
    if (st.shape) shapeSel.value = st.shape;
    if (st.count) countSel.value = st.count;
    if (st.gscale) gscaleSel.value = st.gscale;
    if (st.seed != null) seedInput.value = st.seed;
    if (st.useNeg != null) negUseInput.checked = st.useNeg;
    if (st.neg != null) negInput.value = st.neg;
  }

  function snapshot() {
    var st = {
      desc: descInput.value,
      art: artSels.map(function (s) { return s.value; }),
      mix: mixSels.map(function (s) { return s.value; }),
      enh: {}, shape: shapeSel.value, count: countSel.value, gscale: gscaleSel.value,
      seed: seedInput.value, useNeg: negUseInput.checked, neg: negInput.value
    };
    for (var i = 0; i < ENH_KEYS.length; i++) st.enh[ENH_KEYS[i]] = enhSels[ENH_KEYS[i]].value;
    return st;
  }

  function applySnapshot(st) {
    if (!st) return;
    if (st.desc != null) descInput.value = st.desc;
    if (st.art) for (var i = 0; i < Math.min(5, st.art.length); i++) if (st.art[i] != null) artSels[i].value = String(clampIdx(DATA.artStyles, st.art[i]));
    if (st.mix) for (i = 0; i < Math.min(7, st.mix.length); i++) if (st.mix[i] != null) mixSels[i].value = String(clampIdx(DATA.mixers[i], st.mix[i]));
    if (st.enh) for (i = 0; i < ENH_KEYS.length; i++) if (st.enh[ENH_KEYS[i]] != null) enhSels[ENH_KEYS[i]].value = String(clampIdx(DATA.enhancers[ENH_KEYS[i]], st.enh[ENH_KEYS[i]]));
    if (st.shape) shapeSel.value = st.shape;
    if (st.count) countSel.value = st.count;
    if (st.gscale) gscaleSel.value = st.gscale;
    if (st.seed != null) seedInput.value = st.seed;
    if (st.useNeg != null) negUseInput.checked = st.useNeg;
    if (st.neg != null) negInput.value = st.neg;
  }

  function renderPresets() {
    var presets = loadJSON(PRESETS_KEY, {});
    presetSel.innerHTML = "";
    var ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "💾 Load preset…";
    presetSel.appendChild(ph);
    var names = Object.keys(presets).sort();
    for (var i = 0; i < names.length; i++) {
      var o = document.createElement("option");
      o.value = names[i];
      o.textContent = names[i];
      presetSel.appendChild(o);
    }
  }

  function savePreset() {
    var name = presetName.value.trim();
    if (!name) { statusEl.textContent = "⚠️ type a preset name first"; return; }
    var presets = loadJSON(PRESETS_KEY, {});
    presets[name] = snapshot();
    saveJSON(PRESETS_KEY, presets);
    presetName.value = "";
    renderPresets();
    statusEl.textContent = "💾 preset saved: " + name;
    setTimeout(function () { if (!busy) statusEl.textContent = ""; }, 2000);
  }

  function loadPreset() {
    var name = presetSel.value;
    if (!name) return;
    var presets = loadJSON(PRESETS_KEY, {});
    if (presets[name]) { applySnapshot(presets[name]); onAnyChange(); statusEl.textContent = "📂 preset loaded: " + name; }
    presetSel.value = "";
  }

  function deletePreset() {
    var name = presetName.value.trim();
    if (!name && presetSel.value) name = presetSel.value;
    if (!name) return;
    var presets = loadJSON(PRESETS_KEY, {});
    if (presets[name]) { delete presets[name]; saveJSON(PRESETS_KEY, presets); renderPresets(); statusEl.textContent = "🗑️ preset deleted"; }
    else statusEl.textContent = "⚠️ no preset named " + name;
    presetName.value = "";
    setTimeout(function () { if (!busy) statusEl.textContent = ""; }, 2000);
  }

  function downscale(dataUrl, maxDim) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        try {
          var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          var w = Math.max(1, Math.round(img.width * scale));
          var h = Math.max(1, Math.round(img.height * scale));
          var c = document.createElement("canvas");
          c.width = w; c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL("image/jpeg", 0.72));
        } catch (e) { resolve(dataUrl); }
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }

  function saveFav(dataUrl) {
    downscale(dataUrl, 384).then(function (thumb) {
      var favs = loadJSON(FAVS_KEY, []);
      favs.unshift(thumb);
      if (favs.length > 12) favs.length = 12;
      saveJSON(FAVS_KEY, favs);
      renderFavs();
      statusEl.textContent = "💾 saved to favorites";
      setTimeout(function () { if (!busy) statusEl.textContent = ""; }, 1500);
    });
  }

  function renderFavs() {
    var favs = loadJSON(FAVS_KEY, []);
    favsEl.innerHTML = "";
    if (!favs.length) return;
    var head = document.createElement("div");
    head.className = "pro-favs-head";
    var t = document.createElement("span");
    t.textContent = "⭐ Favorites";
    var clear = document.createElement("button");
    clear.type = "button";
    clear.className = "pro-btn pro-btn-ghost";
    clear.textContent = "🗑️ Clear";
    clear.addEventListener("click", function () { saveJSON(FAVS_KEY, []); renderFavs(); });
    head.appendChild(t);
    head.appendChild(clear);
    favsEl.appendChild(head);
    var row = document.createElement("div");
    row.className = "pro-favs-row";
    for (var i = 0; i < favs.length; i++) {
      (function (f) {
        var img = document.createElement("img");
        img.src = f;
        img.loading = "lazy";
        img.className = "pro-fav";
        img.title = "click to open";
        img.addEventListener("click", function () {
          var a = document.createElement("a");
          a.href = f;
          a.download = "imager-pro-fav-" + Date.now() + ".jpg";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        });
        row.appendChild(img);
      })(favs[i]);
    }
    favsEl.appendChild(row);
  }

  var __proBootTries = 0;
  function boot() {
    if (window.__proReady) return;
    if (!(window.IMAGER_PRO && window.root && window.root.generateImage && $("pro-desc"))) {
      // Bounded: the Pro Studio UI is gone (only the community feeds survive via
      // __proInitGallery), so IMAGER_PRO/$("pro-desc") never arrive — retry a few
      // seconds for slow boots, then park instead of spinning forever.
      if (++__proBootTries < 40) { setTimeout(boot, 300); return; }
      return;
    }
    build();
  }  window.__proBoot = boot;
  boot();

  /* ===================== site-chrome widgets (gate) ===================== */
  var lastPrompt = "";

  var GATE_KEY = "imagerProGateDoNotShow";
  var GATE_SESSION_KEY = "imagerProGateAgreedSession";

  function gateAgreed() {
    try { if (localStorage.getItem(GATE_KEY) === "true") return true; } catch (e) {}
    try { if (sessionStorage.getItem(GATE_SESSION_KEY) === "1") return true; } catch (e) {}
    return false;
  }

  function syncGate() {
    var g = $("pro-gate"); if (!g) return;
    if (gateAgreed()) { g.classList.add("pro-gate-done"); g.classList.add("hidden"); return; }
    g.classList.remove("pro-gate-done");
    g.classList.remove("hidden");
    var lock = !!window.__proTabActive;
    document.body.style.overflow = lock ? "hidden" : "";
    document.documentElement.style.overflow = lock ? "hidden" : "";
  }

  var commentsDone = false;
  function initComments() {
    try {
      if (window.SharedComm && window.SharedComm.dockInto && window.SharedComm.dockInto("pro-comments-ctn")) return;
    } catch (e) {}
    if (commentsDone || !window.root || !window.root.settings || !window.root.settings.commentChannels) return;
    var ctn = $("pro-comments-ctn"); if (!ctn) return;
    if (!window.root.tabbedCommentsPlugin && !window.root.commentsPlugin) return;
    try { if (window.ChatGen) window.ChatGen.applyChannels(window.root.settings.commentChannels); } catch (e) {}
    commentsDone = true;
    try {
      if (window.root.tabbedCommentsPlugin) {
        ctn.appendChild(window.root.tabbedCommentsPlugin({ channels: window.root.settings.commentChannels, defaultChannelOptions: window.root.settings.defaultCommentOptions, fillHeight: true }));
      } else {
        var opts = { channel: "general", width: "100%", height: "100%", allowCustomChannels: true };
        try {
          var dco = window.root.settings && window.root.settings.defaultCommentOptions;
          var emojiCfg = dco && dco.customEmojis;
          if (emojiCfg && typeof emojiCfg.getRawListText === "string") opts.customEmojis = emojiCfg;
        } catch (e) {}
        ctn.innerHTML = window.root.commentsPlugin(opts);
      }
    } catch (e) { console.error("Pro comments init failed:", e); }
  }

  var galleryDone = false;
  var NSFW_GATE_KEY = "nsfwGalleryGateDoNotShow";
  var NSFW_GATE_SESSION_KEY = "nsfwGalleryGateAgreedSession";
  // Owner-set age meter (0–100): the minimum age shown on the NSFW gate. Read
  // from the server's public `ageMeter()` RPC (default 18 when the running
  // server build predates it or the read fails). Only the owner can change it.
  var ageMeterCached = 18;
  var ageMeterFetched = false;
  function ageMeterRead() {
    try {
      var net = window.__t2iNet;
      if (!net || typeof net.whenOpen !== "function") return Promise.resolve(ageMeterCached);
      return net.whenOpen().then(function (sock) {
        if (!sock.rpc || typeof sock.rpc.ageMeter !== "function") return ageMeterCached;
        return sock.rpc.ageMeter("");
      }).then(function (v) {
        v = Math.round(Number(v));
        if (!isFinite(v)) v = ageMeterCached;
        ageMeterCached = Math.max(0, Math.min(100, v));
        ageMeterFetched = true;
        return ageMeterCached;
      }).catch(function () { return ageMeterCached; });
    } catch (e) { return Promise.resolve(ageMeterCached); }
  }
  function paintNsfwGate(n) {
    n = Math.round(Number(n));
    if (!isFinite(n)) n = 18;
    n = Math.max(0, Math.min(100, n));
    var g = $("pro-nsfw-gate"); if (!g) return;
    var title = g.querySelector(".pro-gate-title");
    if (title) title.textContent = "🔞 NSFW Gallery — " + n + "+ Content Warning";
    var agree = $("pro-nsfw-gate-agree");
    if (agree) agree.textContent = "✅ I Agree – Enter (" + n + "+)";
  }
  window.__nsfwAgeMeter = ageMeterRead;
  function nsfwAgreed() {
    try { if (localStorage.getItem(NSFW_GATE_KEY) === "true") return true; } catch (e) {}
    try { if (sessionStorage.getItem(NSFW_GATE_SESSION_KEY) === "1") return true; } catch (e) {}
    return false;
  }
  function setGalTab(which) {
    var sfw = $("pro-gallery-ctn"), nsfw = $("pro-gallery-nsfw-ctn");
    var tS = $("pro-gal-tab-sfw"), tN = $("pro-gal-tab-nsfw");
    if (!sfw || !nsfw) return;
    var showNsfw = which === "nsfw";
    sfw.hidden = showNsfw;
    nsfw.hidden = !showNsfw;
    if (tS) tS.setAttribute("aria-selected", showNsfw ? "false" : "true");
    if (tN) tN.setAttribute("aria-selected", showNsfw ? "true" : "false");
  }
  // ---------- community-gallery votes (personal curation) ----------
  // The platform gallery's own votes need its Turnstile verification + a
  // gallery-origin userKey, which our page cannot mint — so these 👍/👎 are
  // per-browser, like everything else here (Personal Gallery, vault, roster).
  // One vote per image per device; clicking again removes it. 👎 also dims
  // the card (mirrors the platform hiding downvoted images, without the gaps).
  var GVOTE_KEY = "t2iGalleryVotes_v1";
  var gvoteMap = null;
  function gvotes() {
    if (!gvoteMap) {
      try { gvoteMap = JSON.parse(localStorage.getItem(GVOTE_KEY) || "{}") || {}; }
      catch (e) { gvoteMap = {}; }
    }
    return gvoteMap;
  }
  function gvoteGet(id) { return (id && gvotes()[id]) || 0; }
  function gvoteSet(id, dir) {
    if (!id) return;
    var m = gvotes();
    if (dir) m[id] = dir; else delete m[id];
    var ks = Object.keys(m);
    if (ks.length > 3000) { for (var i = 0; i < ks.length - 3000; i++) delete m[ks[i]]; }
    try { localStorage.setItem(GVOTE_KEY, JSON.stringify(m)); } catch (e) {}
    syncGvoteCards(id);
  }
  function syncGvoteCards(id) {
    var v = gvoteGet(id);
    document.querySelectorAll('[data-gvote-id="' + id + '"]').forEach(function (card) {
      card.querySelectorAll(".pro-comm-vote").forEach(function (b) {
        b.classList.toggle("on", Number(b.dataset.gvoteDir) === v);
        b.setAttribute("aria-pressed", Number(b.dataset.gvoteDir) === v ? "true" : "false");
      });
      card.classList.toggle("disliked", v === -1);
      card.classList.toggle("liked", v === 1);
    });
  }
  function commFeedUrl(filter, skip, sort, floor) {
    return "https://image-generation.perchance.org/gallery?channel=" + encodeURIComponent(window.generatorName || "") + "&subChannel=public&sort=" + (sort || "trending") + "&timeRange=1-month&hideIfScoreIsBelow=" + (floor == null ? "-1" : floor) + "&contentFilter=" + filter + "&imageElementsHtmlOnly=true&skip=" + (skip || 0);
  }
  function commEsc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function commCard(item, blurred) {
    var card = document.createElement("div");
    card.className = "pro-comm-card";
    var vid = item.id || "";
    if (vid) card.dataset.gvoteId = vid;
    var vv = gvoteGet(vid);
    if (vv === -1) card.classList.add("disliked");
    if (vv === 1) card.classList.add("liked");
    card.innerHTML = '<div class="pro-comm-imgwrap"><img loading="lazy" src="' + item.img.replace(/"/g, "&quot;") + '" alt="' + commEsc(item.title).slice(0, 200) + '"' + (blurred ? ' class="pro-comm-blurred"' : "") + '">'
      + (blurred ? '<button type="button" class="pro-comm-reveal">show 🔞</button>' : "") + '</div>'
      + '<div class="pro-comm-meta"><div class="pro-comm-title">' + commEsc(item.title || "(untitled)") + '</div>'
      + '<div class="pro-comm-prompt">' + commEsc((item.prompt || "").slice(0, 220)) + '</div>'
      + '<div class="pro-comm-row"><a target="_blank" rel="noopener" href="' + item.img.replace(/"/g, "&quot;") + '">open full ↗</a></div>'
      + '<div class="pro-comm-voterow"><button type="button" class="pro-comm-vote up' + (vv === 1 ? " on" : "") + '" data-gvote-dir="1" aria-pressed="' + (vv === 1) + '" title="👍 Like — saved on this device only">👍</button>'
      + '<button type="button" class="pro-comm-vote down' + (vv === -1 ? " on" : "") + '" data-gvote-dir="-1" aria-pressed="' + (vv === -1) + '" title="👎 Dislike — saved on this device only, dims the card">👎</button></div></div>';
    card.querySelectorAll(".pro-comm-vote").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        if (!vid) return;
        var dir = Number(b.dataset.gvoteDir);
        gvoteSet(vid, gvoteGet(vid) === dir ? 0 : dir);
      });
    });
    try {
      if (window.PubMenu) {
        var pubWrap = card.querySelector(".pro-comm-imgwrap");
        if (pubWrap) pubWrap.appendChild(window.PubMenu.button({ url: item.img, prompt: item.prompt || "", title: item.title || "" }));
      }
    } catch (e) {}
    if (blurred) {
      var img = card.querySelector("img"), btn = card.querySelector(".pro-comm-reveal");
      var reveal = function () { img.classList.remove("pro-comm-blurred"); img.style.filter = ""; if (btn && btn.isConnected) btn.remove(); };
      btn.addEventListener("click", reveal);
      img.addEventListener("click", reveal);
    }
    return card;
  }
  // Sorts: trending (platform order) and most-liked (platform top order) are
  // real community-wide rankings. There is no native most-disliked sort, so
  // that view pulls the whole pool with sort=top + a wide score floor and
  // paints it reversed — lowest-ranked first.
  var COMM_SORTS = [
    { id: "trending", label: "🔥 Trending", apiSort: "trending", floor: "-1" },
    { id: "recent", label: "🆕 Recently uploaded", apiSort: "new", floor: "-1" },
    { id: "liked", label: "❤️ Most liked", apiSort: "top", floor: "-1" },
    { id: "disliked", label: "👎 Most disliked", apiSort: "top", floor: "-999", reversed: true }
  ];
  var COMM_AUTOLOAD_PAGES = 12;
  // Child-safety hard block shared with the Home strip (see passesGalleryRules in
  // index.html): drop minor-age prompts from Community feeds even when the platform
  // marks them isNsfw=false. Third-party categorizers flag the channel on words alone.
  var CHILD_SAFETY_USER_IDS = ["4fbab17196b080390f63f83ae1207d1999152aa2fa83170cd280bc1f1469f2d3"];
  var CHILD_SAFETY_RX = /\bteen(s|age[rs]?)?\b|school\s*girl|school\s*boy|school\s*uniform|high\s*school|middle\s*school|junior\s*high|\bloli(ta)?\b|\bshota\b|preteen|young\s*(girl|boy|teen|child)|youthful\s*face|young\s*slender/i;
  // "late teen(s)/teenage(r/s)" = 18-19 (adult): strip before testing so adult
  // phrasing passes while bare "teen" etc. still blocks.
  var CHILD_SAFETY_LATE_TEEN_STRIP = /\blate\s+teen(s|age[rs]?)?\b/gi;
  function commHitsChildSafety(userId, title, prompt) {
    try {
      if (userId && CHILD_SAFETY_USER_IDS.indexOf(userId) !== -1) return true;
      var _hay = String(title || "") + "\n" + String(prompt || "");
      try { _hay = _hay.replace(CHILD_SAFETY_LATE_TEEN_STRIP, " "); } catch (e) {}
      if (CHILD_SAFETY_RX.test(_hay)) return true;
    } catch (e) {}
    return false;
  }
  function makeCommFeed(cfg) {
    var st = { skip: 0, loading: false, done: false, seen: {}, built: false, items: [], sort: "trending" };
    function sortDef() {
      for (var i = 0; i < COMM_SORTS.length; i++) if (COMM_SORTS[i].id === st.sort) return COMM_SORTS[i];
      return COMM_SORTS[0];
    }
    function statusEl() {
      var ctn = $(cfg.ctnId); if (!ctn) return null;
      var el = ctn.querySelector(".pro-comm-status");
      if (!el) {
        el = document.createElement("div");
        el.className = "pro-comm-status";
        var grid = ctn.querySelector(".pro-comm-grid");
        if (grid) ctn.insertBefore(el, grid);
        else ctn.appendChild(el);
      }
      return el;
    }
    function status(msg) {
      var el = statusEl();
      if (el) el.textContent = msg;
    }
    function gridEl() {
      var ctn = $(cfg.ctnId); if (!ctn) return null;
      var grid = ctn.querySelector(".pro-comm-grid");
      if (!grid) {
        grid = document.createElement("div");
        grid.className = "pro-comm-grid";
        ctn.appendChild(grid);
      }
      return grid;
    }
    function sortRow() {
      var ctn = $(cfg.ctnId); if (!ctn) return;
      if (ctn.querySelector(".pro-comm-sort")) return;
      var row = document.createElement("div");
      row.className = "pro-comm-sort";
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", "Sort community gallery");
      COMM_SORTS.forEach(function (s) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "pro-comm-sortbtn";
        b.dataset.commSort = s.id;
        b.textContent = s.label;
        b.title = s.id === "disliked"
          ? "Lowest-ranked first, community-wide (loads the full gallery, then flips it)"
          : (s.id === "liked" ? "Highest-ranked first, community-wide" : (s.id === "recent" ? "Newest uploads first, community-wide" : "What the platform is surfacing now"));
        b.setAttribute("aria-pressed", st.sort === s.id ? "true" : "false");
        b.addEventListener("click", function () { setSort(s.id); });
        row.appendChild(b);
      });
      ctn.insertBefore(row, ctn.firstChild);
    }
    function paint() {
      var grid = gridEl(); if (!grid) return;
      grid.innerHTML = "";
      var list = sortDef().reversed ? st.items.slice().reverse() : st.items;
      for (var i = 0; i < list.length; i++) grid.appendChild(commCard(list[i], cfg.blurred));
      var total = st.items.length;
      if (!total) {
        status(st.done ? cfg.emptyDoneText : cfg.emptyText);
      } else {
        status(total + " " + cfg.countNoun + (total === 1 ? "" : "s") + cfg.countSuffix + sortSuffix() + (st.done ? " · end" : (st.capped ? " · lowest-ranked of first " + st.capped + " pages" : "")));
      }
      var more = moreBtn();
      if (more) more.hidden = !!st.done;
    }
    function sortSuffix() {
      if (st.sort === "liked") return " · ❤️ most liked";
      if (st.sort === "disliked") return " · 👎 most disliked";
      if (st.sort === "recent") return " · 🆕 recently uploaded";
      return "";
    }
    function setSort(id) {
      if (st.sort === id || st.loading) return;
      st.sort = id;
      st.skip = 0; st.done = false; st.seen = {}; st.items = []; st.capped = false;
      var grid = gridEl(); if (grid) grid.innerHTML = "";
      sortRow();
      ctnSyncSortRow();
      if (id === "disliked") autoLoadAll();
      else load();
    }
    function ctnSyncSortRow() {
      var ctn = $(cfg.ctnId); if (!ctn) return;
      ctn.querySelectorAll(".pro-comm-sortbtn").forEach(function (b) {
        b.setAttribute("aria-pressed", b.dataset.commSort === st.sort ? "true" : "false");
      });
    }
    async function fetchPage() {
      var def = sortDef();
      try { if (window.__t2iModLoad) await Promise.race([window.__t2iModLoad(), new Promise(function (res) { setTimeout(res, 8000); })]); } catch (e) {}
      var txt = await window.root.superFetch(commFeedUrl(cfg.filter, st.skip, def.apiSort, def.floor)).then(function (r) { return r.text(); });
      var tmp = document.createElement("div");
      tmp.innerHTML = txt;
      var tiles = tmp.querySelectorAll(".imageCtn");
      if (!tiles.length) { st.done = true; return 0; }
      st.skip += tiles.length;
      var added = 0;
      for (var i = 0; i < tiles.length; i++) {
        var t = tiles[i];
        var isN = t.dataset.isNsfw === "true";
        if (isN !== cfg.wantNsfw) continue;
        var id = t.dataset.imageId;
        if (!id || st.seen[id]) continue;
        var uid = t.dataset.userId || "";
        var ti = t.dataset.title || "", pr = t.dataset.prompt || "";
        var __modBlocked = false;
        if (typeof window.__t2iModMatch === "function") {
          try { __modBlocked = !!window.__t2iModMatch({ id: id, userId: uid, title: ti, prompt: pr }).blocked; } catch (e) { __modBlocked = false; }
        } else if (commHitsChildSafety(uid, ti, pr)) __modBlocked = true;
        if (__modBlocked) { st.seen[id] = true; continue; }
        st.seen[id] = true;
        var img = t.querySelector("img");
        var src = img ? (img.getAttribute("src") || "") : "";
        if (!src) continue;
        st.items.push({ id: id, img: src, title: ti, prompt: pr });
        added++;
      }
      if (tiles.length < 10) st.done = true;
      return added;
    }
    async function autoLoadAll() {
      var ctn = $(cfg.ctnId); if (!ctn) return;
      if (st.loading) return;
      if (!window.root || !window.root.superFetch) { status(cfg.needFetchText); return; }
      st.loading = true;
      st.capped = false;
      try {
        var pages = 0;
        while (!st.done && pages < COMM_AUTOLOAD_PAGES) {
          pages++;
          status("Finding the lowest-ranked… (page " + pages + ")");
          await fetchPage();
        }
        if (!st.done) st.capped = pages;
      } catch (e) {
        status(cfg.errorText);
      }
      st.loading = false;
      paint();
    }
    function moreBtn() {
      var ctn = $(cfg.ctnId); if (!ctn) return null;
      var b = ctn.querySelector(".pro-comm-more");
      if (!b) {
        b = document.createElement("button");
        b.type = "button";
        b.className = "pro-btn pro-comm-more";
        b.textContent = cfg.moreText;
        b.addEventListener("click", load);
        ctn.appendChild(b);
      }
      return b;
    }
    async function load() {
      var ctn = $(cfg.ctnId); if (!ctn) return;
      if (st.loading || st.done) return;
      if (!window.root || !window.root.superFetch) { status(cfg.needFetchText); return; }
      st.loading = true;
      if (!st.built) {
        st.built = true;
        ctn.innerHTML = "";
        sortRow();
        status(cfg.loadingText);
        gridEl();
      } else {
        status(cfg.moreLoadingText);
      }
      try {
        var added = 0, guard = 0;
        while (guard < 6) {
          guard++;
          var n = await fetchPage();
          added += n;
          if (st.done) break;
          if (added > 0) break;
        }
        paint();
      } catch (e) {
        status(cfg.errorText);
      }
      st.loading = false;
    }
    return { load: load };
  }
  var sfwFeed = makeCommFeed({
    ctnId: "pro-gallery-ctn", filter: "g", wantNsfw: false, blurred: false,
    moreText: "Load more", loadingText: "Loading SFW feed…",
    moreLoadingText: "Loading more…", needFetchText: "Gallery needs superFetch.",
    emptyDoneText: "No SFW images yet — be the first to share one.",
    emptyText: "No SFW images on this page — try Load more.",
    countNoun: "SFW image", countSuffix: "", errorText: "Could not load SFW feed — try again."
  });
  var nsfwFeed = makeCommFeed({
    ctnId: "pro-gallery-nsfw-ctn", filter: "none", wantNsfw: true, blurred: true,
    moreText: "Load more NSFW", loadingText: "Loading NSFW-only feed… (SFW kept out)",
    moreLoadingText: "Loading more NSFW… (SFW kept out)", needFetchText: "NSFW gallery needs superFetch.",
    emptyDoneText: "No NSFW images yet — the gooners haven't clocked in. Be the first to share one.",
    emptyText: "No NSFW images on this page — the gooners are slacking. Try Load more.",
    countNoun: "NSFW image", countSuffix: " · SFW kept out", errorText: "Could not load NSFW feed — try again."
  });
  function buildSfwGallery() { sfwFeed.load(); }
  function buildNsfwGallery() { nsfwFeed.load(); }
  function openNsfwGate() {
    var g = $("pro-nsfw-gate"); if (!g) return;
    paintNsfwGate(ageMeterCached);
    if (!ageMeterFetched) ageMeterRead().then(paintNsfwGate);
    g.hidden = false;
  }
  function closeNsfwGate() {
    var g = $("pro-nsfw-gate"); if (!g) return;
    g.hidden = true;
  }
  function initGallery() {
    if (galleryDone || !window.root || !window.root.superFetch) return;
    var ctn = $("pro-gallery-ctn"); if (!ctn) return;
    galleryDone = true;
    try { ageMeterRead().then(paintNsfwGate); } catch (e) {}
    try {
      buildSfwGallery();
    } catch (e) { console.error("Pro gallery init failed:", e); }
    var tS = $("pro-gal-tab-sfw"), tN = $("pro-gal-tab-nsfw");
    if (tS) tS.addEventListener("click", function () { closeNsfwGate(); setGalTab("sfw"); });
    if (tN) tN.addEventListener("click", function () {
      try { ageMeterRead().then(paintNsfwGate); } catch (e) {}
      if (nsfwAgreed()) { buildNsfwGallery(); setGalTab("nsfw"); return; }
      openNsfwGate();
    });
    var agree = $("pro-nsfw-gate-agree"), no = $("pro-nsfw-gate-disagree");
    if (agree) agree.addEventListener("click", function () {
      try { sessionStorage.setItem(NSFW_GATE_SESSION_KEY, "1"); } catch (e) {}
      try { if ($("pro-nsfw-gate-remember") && $("pro-nsfw-gate-remember").checked) localStorage.setItem(NSFW_GATE_KEY, "true"); } catch (e) {}
      closeNsfwGate();
      buildNsfwGallery();
      setGalTab("nsfw");
    });
    if (no) no.addEventListener("click", function () { closeNsfwGate(); setGalTab("sfw"); });
  }
  window.__proInitGallery = initGallery;

  function initGate() {
    var g = $("pro-gate"); if (!g) return;
    $("pro-gate-agree").addEventListener("click", function () {
      try { sessionStorage.setItem(GATE_SESSION_KEY, "1"); } catch (e) {}
      if ($("pro-gate-remember").checked) { try { localStorage.setItem(GATE_KEY, "true"); } catch (e) {} }
      g.classList.add("pro-gate-done");
      g.classList.add("hidden");
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    });
    $("pro-gate-disagree").addEventListener("click", function () {
      g.classList.add("pro-gate-done");
      g.classList.add("hidden");
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      if (window.showTab) window.showTab("i2p");
    });
    window.__proOnTab = function (active) { syncGate(); if (active) { initComments(); initGallery(); refreshGalleryBtn(); } };
    syncGate();
  }

  function initChrome() {
    if (window.__proChromeReady) return;
    var backTop = $("pro-backtop");
    if (backTop) backTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
    var postPersonal = $("pro-gal-post-personal");
    if (postPersonal) postPersonal.addEventListener("click", function () { openPersonalPost(postPersonal); });
    initGate();
    document.addEventListener("keydown", function (e) {
      if (!window.__proTabActive) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r") { e.preventDefault(); if (window.__proReady) { randomizeAll(); showToast("🎲 All unlocked options randomized!"); } }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); if (window.__proReady) generate(); }
    });
    window.__proChromeReady = true;
  }
  initChrome();
})();
