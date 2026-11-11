(function () {
  "use strict";
  if (window.FluxTab) return;
  function el(tag, cls, text) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text != null) d.textContent = text;
    return d;
  }
  function lsGet(k, fb) {
    try { var v = localStorage.getItem(k); return v == null ? fb : v; } catch (e) { return fb; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, v); } catch (e) {}
  }
  function fillSelect(sel, keys, longFn) {
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    keys.forEach(function (k) {
      var o = document.createElement("option");
      o.value = k;
      var t = k;
      try { t = longFn(k) || k; } catch (e) {}
      o.textContent = t;
      sel.appendChild(o);
    });
  }
  function setStatus(ui, msg, busy) {
    ui.status.textContent = msg || "";
    ui.status.classList.toggle("flux-busy", !!busy);
  }
  function stateOf(ui) {
    return {
      desc: ui.desc.value, neg: ui.neg.value, negOn: ui.negOn.checked,
      style: ui.style.value, testStyle: ui.testStyle.value, shape: ui.shape.value,
      cfg: ui.cfg.value, seed: ui.seed.value
    };
  }
  function snapshot(ui) {
    var st = stateOf(ui);
    Object.keys(st).forEach(function (k) {
      if (typeof st[k] === "boolean") lsSet("fluxtab_" + k, st[k] ? "1" : "0");
      else lsSet("fluxtab_" + k, String(st[k]));
    });
  }
  function refreshPreview(ui) {
    try {
      var c = window.FluxPrompt.compose(stateOf(ui));
      ui.preview.value = c.prompt + (c.negative ? "\n\n[NEGATIVE] " + c.negative : "");
      var gt = c.genre ? ("Auto fine-tune: " + c.genre) : "Auto fine-tune: off for this style";
      if (c.girls) gt += " · 👱‍♀️ girls traits in prompt";
      ui.genre.textContent = gt;
    } catch (e) {
      ui.preview.value = "";
      ui.genre.textContent = "";
    }
    snapshot(ui);
  }
  function addCard(ui, url, title, prompt) {
    var card = el("div", "flux-card");
    var img = document.createElement("img");
    img.src = url;
    img.alt = title;
    img.loading = "lazy";
    card.appendChild(img);
    var cap = el("div", "flux-cap", title);
    card.appendChild(cap);
    var acts = el("div", "flux-acts");
    var dl = document.createElement("a");
    dl.href = url;
    dl.download = (title || "flux").replace(/[^\w\- ]+/g, "").trim().slice(0, 60) + ".png";
    dl.textContent = "⬇ Save";
    dl.className = "flux-btn";
    acts.appendChild(dl);
    var cp = el("button", "flux-btn", "📋 Prompt");
    cp.type = "button";
    cp.addEventListener("click", function () {
      try { navigator.clipboard.writeText(prompt); setStatus(ui, "Prompt copied."); }
      catch (e) { setStatus(ui, "Copy failed."); }
    });
    acts.appendChild(cp);
    var snd = el("button", "flux-btn", "🎨 To Gen");
    snd.type = "button";
    snd.title = "Open this prompt in the Image Generator";
    snd.addEventListener("click", function () {
      try {
        var hh = window.GirlsGenerator && window.GirlsGenerator.helpers;
        if (hh && hh.sendToGen) hh.sendToGen(prompt);
      } catch (e) {}
    });
    acts.appendChild(snd);
    var sv = el("button", "flux-btn", "💾 Gallery");
    sv.type = "button";
    sv.title = "Upload and save to Personal Gallery";
    sv.addEventListener("click", function () { saveFluxCard(url, prompt, title, sv, ui); });
    acts.appendChild(sv);
    card.appendChild(acts);
    ui.grid.insertBefore(card, ui.grid.firstChild);
    return sv;
  }
  // ---- Personal Gallery wiring (merged from the Girls Generator: Flux had none) ----
  function galleryAutoSaveOn() {
    try {
      var h = window.GirlsGenerator && window.GirlsGenerator.helpers;
      if (h && h.galleryAutoSaveOn) return !!h.galleryAutoSaveOn();
    } catch (e) {}
    return true;
  }
  function galleryNsfwFilterOn() {
    try {
      var h = window.GirlsGenerator && window.GirlsGenerator.helpers;
      if (h && h.galleryNsfwFilterOn) return !!h.galleryNsfwFilterOn();
    } catch (e) {}
    return false;
  }
  function fileInFluxFolder(url) {
    try {
      if (typeof window.t2iGetGallery !== "function" || typeof window.t2iSaveGallery !== "function") return;
      var g = window.t2iGetGallery();
      for (var i = 0; i < g.length; i++) {
        if (g[i] && g[i].url === url && !g[i].folder) { g[i].folder = "Fluxinator"; window.t2iSaveGallery(g); break; }
      }
    } catch (e) {}
  }
  function gallerySaveFlux(dataUrl, prompt, title) {
    if (typeof window.t2iAddImageToGallery === "function") {
      return window.t2iAddImageToGallery(dataUrl, prompt || "", title || "").then(function (url) {
        if (url) { fileInFluxFolder(url); try { if (window.__hmRefreshRecent) window.__hmRefreshRecent(); } catch (e) {} }
        return url;
      });
    }
    return (async function () {
      var blob = await (await fetch(dataUrl)).blob();
      var up = await window.root.uploadPlugin(blob, {});
      if (!up || !up.url) throw new Error(up && up.error ? up.error : "upload failed");
      var item = { url: up.url, prompt: prompt, title: title, folder: "Fluxinator", timestamp: Date.now() };
      var arr = [];
      try { arr = JSON.parse(localStorage.getItem("t2iGalleryItems") || "[]"); } catch (e) { arr = []; }
      arr.unshift(item);
      try {
        if (window.t2iSaveGallery) window.t2iSaveGallery(arr);
        else localStorage.setItem("t2iGalleryItems", JSON.stringify(arr));
      } catch (e) {}
      try { if (window.__hmRefreshRecent) window.__hmRefreshRecent(); } catch (e2) {}
      return up.url;
    })();
  }
  function autoSaveFluxImage(dataUrl, prompt, title, saveBtn, ui) {
    function direct() {
      gallerySaveFlux(dataUrl, prompt, title).then(function (url) {
        if (url && saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "✅ saved"; }
      }).catch(function (e) { setStatus(ui, "Autosave failed: " + (e && e.message ? e.message : e)); });
    }
    if (galleryNsfwFilterOn() && typeof window.t2iUploadThumbnail === "function" && typeof window.t2iCheckNsfw === "function") {
      window.t2iUploadThumbnail(dataUrl).then(function (thumbUrl) {
        if (!thumbUrl) return;
        return window.t2iCheckNsfw(thumbUrl).then(function (isNsfw) {
          if (isNsfw === true) { setStatus(ui, "🔞 NSFW image hidden — not saved (filter ON)."); return; }
          direct();
        });
      }).catch(function (e) { console.warn("flux autosave nsfw check:", e); });
    } else {
      direct();
    }
  }
  function saveFluxCard(dataUrl, prompt, title, btn, ui) {
    btn.disabled = true;
    var old = btn.textContent;
    btn.textContent = "…";
    function done(t, saved) { btn.disabled = false; btn.textContent = saved ? "✅ saved" : old; setStatus(ui, t); }
    gallerySaveFlux(dataUrl, prompt, title).then(function (url) {
      if (!url) done("Already saved (duplicate) or upload failed.", false);
      else done("Saved to Personal Gallery.", true);
    }).catch(function (e) { done("Save failed: " + (e && e.message ? e.message : e), false); });
  }
  function generate(ui) {
    var n = 1;
    try { n = Math.min(4, Math.max(1, parseInt(ui.num.value || "1", 10) || 1)); } catch (e) {}
    ui.genBtn.disabled = true;
    var i = 0;
    (function next() {
      if (i >= n) { ui.genBtn.disabled = false; setStatus(ui, "Done — " + n + " image" + (n > 1 ? "s" : "") + " below."); return; }
      var c;
      try { c = window.FluxPrompt.compose(stateOf(ui)); }
      catch (e) { ui.genBtn.disabled = false; setStatus(ui, "Compose failed: " + (e && e.message ? e.message : e)); return; }
      setStatus(ui, "Generating " + (i + 1) + "/" + n + " (" + c.activeStyle + ")…", true);
      var opts = { resolution: c.resolution, negativePrompt: c.negative, guidanceScale: c.guidance, hideGalleryButtons: true };
      if (c.seed != null) opts.seed = c.seed;
      window.root.generateImage(c.prompt, opts).then(function (r) {
        var url = r && (r.dataUrl || r.url);
        if (!url) throw new Error("empty result");
        var saveBtn = addCard(ui, url, c.title, c.prompt);
        if (galleryAutoSaveOn()) autoSaveFluxImage(url, c.prompt, c.title, saveBtn, ui);
        i++;
        next();
      }).catch(function (e) {
        ui.genBtn.disabled = false;
        setStatus(ui, "Generation failed: " + (e && e.message ? e.message : e));
      });
    })();
  }
  function render(host) {
    while (host.firstChild) host.removeChild(host.firstChild);
    try { document.querySelectorAll(".fxp-pop").forEach(function (p) { p.remove(); }); } catch (e) {}
    try { if (typeof window.ensureGallery === "function") window.ensureGallery(); } catch (e2) {}
    if (!window.FluxPrompt || !window.root || !window.root.fluxArtStyles) {
      host.appendChild(el("div", "flux-status", "Flux data failed to load — try 🔄 Reload."));
      return;
    }
    var ui = {};
    var wrap = el("div", "flux-wrap");
    host.appendChild(wrap);
    wrap.appendChild(el("div", "flux-title", "🐺 Fluxinator — native copy"));
    wrap.appendChild(el("div", "flux-note", "The full Fluxinator studio, remade natively in this tab from its own source (perchance.org/fluxinator): its 128 art styles, 39 test styles, photo lab, auto style fine-tune and prompt plumbing all run here, plus the Girls Generator's trait engine (boosters, character, outfits…) merged in below — Flux controls win on overlap. No embed, no redirect."));
    ui.desc = document.createElement("textarea");
    ui.desc.className = "flux-text flux-desc";
    ui.desc.id = "fluxDescTa";
    ui.desc.rows = 3;
    ui.desc.placeholder = "Describe your image…";
    ui.desc.value = lsGet("fluxtab_desc", "");
    wrap.appendChild(el("div", "flux-lbl", "🖊 Description"));
    wrap.appendChild(ui.desc);
    var descTools = el("div", "flux-row");
    ui.rndPrompt = el("button", "flux-btn", "🎲 Random prompt (Girls)");
    ui.rndPrompt.type = "button";
    ui.rndPrompt.title = "Fill the Description box with a random Girls Generator prompt starter";
    ui.rndPrompt.addEventListener("click", function () {
      try { if (window.FluxGirls) window.FluxGirls.randomPromptIntoDesc(); } catch (e) {}
    });
    descTools.appendChild(ui.rndPrompt);
    wrap.appendChild(descTools);
    var stdLbl = el("div", "flux-lbl", "🧬 Standard (quality + style modules — write into Description / Negative)");
    wrap.appendChild(stdLbl);
    var stdRows = document.createElement("div");
    stdRows.id = "fluxStdRows";
    wrap.appendChild(stdRows);
    var toolsLbl = el("div", "flux-lbl", "🧰 Prompt tools (Fluxinator motherboards — write into Description)");
    wrap.appendChild(toolsLbl);
    var pf = document.createElement("div");
    pf.id = "paramFrame";
    wrap.appendChild(pf);
    var photoHostEl = document.createElement("div");
    photoHostEl.id = "fluxPhotoHost";
    wrap.appendChild(photoHostEl);
    var girlsHostEl = document.createElement("div");
    girlsHostEl.id = "fluxGirlsHost";
    wrap.appendChild(girlsHostEl);
    wrap.appendChild(el("div", "flux-lbl", "🖍 Negative"));
    ui.neg = document.createElement("textarea");
    ui.neg.className = "flux-text";
    ui.neg.id = "fluxNegTa";
    ui.neg.rows = 2;
    ui.neg.placeholder = "Things you don't want…";
    ui.neg.value = lsGet("fluxtab_neg", "");
    wrap.appendChild(ui.neg);
    var row = el("div", "flux-row");
    ui.negOn = document.createElement("input");
    ui.negOn.type = "checkbox";
    ui.negOn.checked = lsGet("fluxtab_negOn", "1") === "1";
    ui.negOn.id = "flux-negon";
    var lab = document.createElement("label");
    lab.htmlFor = "flux-negon";
    lab.textContent = " Negative enabled";
    row.appendChild(ui.negOn);
    row.appendChild(lab);
    wrap.appendChild(row);
    function selRow(label, sel, saved, def) {
      wrap.appendChild(el("div", "flux-lbl", label));
      wrap.appendChild(sel);
      try { sel.value = saved; if (!sel.value) sel.value = def; } catch (e) { try { sel.value = def; } catch (e2) {} }
    }
    ui.style = document.createElement("select");
    ui.style.className = "flux-sel";
    ui.style.id = "fluxStyleSel";
    fillSelect(ui.style, window.FluxPrompt.styleKeys(), function (k) { return window.FluxPrompt.longName("fluxArtStyles", k); });
    selRow("🎨 Style", ui.style, lsGet("fluxtab_style", "no style"), "no style");
    ui.testStyle = document.createElement("select");
    ui.testStyle.className = "flux-sel";
    ui.testStyle.id = "fluxTestSel";
    fillSelect(ui.testStyle, window.FluxPrompt.testKeys(), function (k) { return window.FluxPrompt.longName("fluxTestStyles", k); });
    selRow("🧪 Test Styles (overrides Style)", ui.testStyle, lsGet("fluxtab_testStyle", "no test style"), "no test style");
    var row2 = el("div", "flux-row");
    ui.shape = document.createElement("select");
    ui.shape.className = "flux-sel";
    [["auto", "🖼 Auto"], ["portrait", "Portrait 512x768"], ["square", "Square 512x512"], ["landscape", "Landscape 768x512"], ["squarehd", "Square HD 768x768"]].forEach(function (p) {
      var o = document.createElement("option");
      o.value = p[0];
      o.textContent = p[1];
      ui.shape.appendChild(o);
    });
    try { ui.shape.value = lsGet("fluxtab_shape", "auto"); } catch (e) {}
    row2.appendChild(ui.shape);
    ui.num = document.createElement("select");
    ui.num.className = "flux-sel";
    ["1", "2", "3", "4"].forEach(function (v) {
      var o = document.createElement("option");
      o.value = v;
      o.textContent = "🔢 " + v;
      ui.num.appendChild(o);
    });
    try { ui.num.value = lsGet("fluxtab_num", "1"); } catch (e) {}
    row2.appendChild(ui.num);
    wrap.appendChild(el("div", "flux-lbl", "🖼 Shape · 🔢 Count"));
    wrap.appendChild(row2);
    var cfgRow = el("div", "flux-row");
    cfgRow.appendChild(el("span", "flux-lbl", "🎚 CFG"));
    ui.cfg = document.createElement("input");
    ui.cfg.type = "range";
    ui.cfg.min = "1";
    ui.cfg.max = "30";
    ui.cfg.step = "1";
    ui.cfg.value = lsGet("fluxtab_cfg", "7");
    ui.cfgVal = el("span", "flux-lbl", ui.cfg.value);
    ui.cfg.addEventListener("input", function () { ui.cfgVal.textContent = ui.cfg.value; });
    cfgRow.appendChild(ui.cfg);
    cfgRow.appendChild(ui.cfgVal);
    cfgRow.appendChild(el("span", "flux-lbl", "🌱 Seed"));
    ui.seed = document.createElement("input");
    ui.seed.type = "text";
    ui.seed.className = "flux-seed";
    ui.seed.placeholder = "random";
    ui.seed.value = lsGet("fluxtab_seed", "");
    cfgRow.appendChild(ui.seed);
    wrap.appendChild(cfgRow);
    ui.genre = el("div", "flux-genre", "");
    wrap.appendChild(ui.genre);
    ui.genBtn = el("button", "flux-gen", "✨ Generate ✨");
    ui.genBtn.type = "button";
    ui.genBtn.addEventListener("click", function () { generate(ui); });
    wrap.appendChild(ui.genBtn);
    ui.status = el("div", "flux-status", "");
    wrap.appendChild(ui.status);
    wrap.appendChild(el("div", "flux-lbl", "📜 Current Prompt (exact text sent)"));
    ui.preview = document.createElement("textarea");
    ui.preview.className = "flux-text flux-preview";
    ui.preview.rows = 4;
    ui.preview.readOnly = true;
    wrap.appendChild(ui.preview);
    var prevRow = el("div", "flux-row");
    ui.copyPrompt = el("button", "flux-btn", "📋 Copy prompt");
    ui.copyPrompt.type = "button";
    ui.copyPrompt.title = "Copy the exact prompt text above";
    ui.copyPrompt.addEventListener("click", function () {
      try {
        var h = window.GirlsGenerator && window.GirlsGenerator.helpers;
        if (h && h.copyText) h.copyText(ui.preview.value, ui, "Prompt copied.");
        else if (navigator.clipboard) navigator.clipboard.writeText(ui.preview.value).then(function () { setStatus(ui, "Prompt copied."); });
      } catch (e) { setStatus(ui, "Copy failed."); }
    });
    prevRow.appendChild(ui.copyPrompt);
    ui.toGen = el("button", "flux-btn", "🎨 Use in Image Generator");
    ui.toGen.type = "button";
    ui.toGen.title = "Open this prompt in the Image Generator";
    ui.toGen.addEventListener("click", function () {
      try {
        var h2 = window.GirlsGenerator && window.GirlsGenerator.helpers;
        if (h2 && h2.sendToGen && ui.preview.value) h2.sendToGen(ui.preview.value);
      } catch (e) {}
    });
    prevRow.appendChild(ui.toGen);
    wrap.appendChild(prevRow);
    ui.grid = el("div", "flux-grid");
    wrap.appendChild(ui.grid);
    ["desc", "neg", "negOn", "style", "testStyle", "shape", "cfg", "seed", "num"].forEach(function (k) {
      var elm = ui[k];
      if (!elm) return;
      elm.addEventListener(elm.tagName === "SELECT" || elm.type === "checkbox" || elm.type === "range" ? "change" : "input", function () { refreshPreview(ui); });
    });
    ui.num.addEventListener("change", function () { snapshot(ui); });
    try { if (window.__fluxBoxesInit) window.__fluxBoxesInit(); } catch (e) {}
    try { if (window.__fluxStdInit) window.__fluxStdInit(); } catch (e2) {}
    try { if (window.FluxPhoto) window.FluxPhoto.render(photoHostEl); } catch (e3) {}
    try { if (window.FluxGirls) window.FluxGirls.render(girlsHostEl); } catch (e4) {}
    try { window.__fluxTabRefresh = function () { refreshPreview(ui); }; } catch (e5) {}
    refreshPreview(ui);
  }
  window.FluxTab = { render: render, refresh: refreshPreview };
})();
