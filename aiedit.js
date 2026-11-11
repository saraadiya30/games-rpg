(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  var VISION_SYSTEM = "Describe this photo in rich, faithful detail for a text-to-image AI model. Cover: the main subject(s) with appearance, expression, pose and clothing; the setting and background; visible objects; colors; lighting; composition; mood; and the medium or style. Only describe what is actually visible — never invent details, text, or people that are not in the photo. Output a single detailed paragraph with no preamble, labels, or quotes.";

  var PRESETS = [
    { label: "🎨 Watercolor", text: "turn this into a delicate watercolor painting, soft washes of color, visible paper texture" },
    { label: "🖼️ Oil painting", text: "repaint this as a classical oil painting, rich impasto brushstrokes, canvas texture" },
    { label: "✏️ Pencil sketch", text: "convert this into a detailed black-and-white pencil sketch with graphite shading" },
    { label: "📸 Photorealistic", text: "make this look like a real professional photograph, realistic skin and materials, sharp focus" },
    { label: "🌇 Golden hour", text: "re-light the scene in warm golden-hour sunlight, long soft shadows, glowing rim light" },
    { label: "🌃 Cyberpunk", text: "transform this into a neon cyberpunk night scene, glowing signs, rain-slicked surfaces" },
    { label: "🧝 Fantasy art", text: "turn this into epic fantasy illustration art with dramatic lighting and rich detail" },
    { label: "👾 Pixel art", text: "convert this to retro 8-bit pixel art, chunky pixels, limited color palette" },
    { label: "🐉 Add a dragon", text: "add a majestic dragon to the scene, naturally integrated with its lighting and perspective" },
    { label: "🌈 New background", text: "keep the main subject but move it to a beautiful new background that fits the scene" }
  ];

  var CREATIVITY = [
    { label: "Faithful", tpl: "Keep the original subject, composition, setting and overall style exactly as described — only apply the requested edit." },
    { label: "Balanced", tpl: "Keep the subject and scene recognizable while making the edit convincing and visually appealing." },
    { label: "Creative", tpl: "Reinterpret this image boldly and imaginatively — keep the main subject recognizable, but feel free to dramatically change the setting, style and details." }
  ];

  var dropzone, fileInput, dzIdle, dzLoaded, previewImg, filenameEl, filesizeEl, removeBtn;
  var instructionInput, presetsEl, creativitySel, creativityVal, resolutionSel, countSel, seedInput;
  var applyBtn, stopBtn, statusEl, descCard, descriptionInput, reanalyzeBtn, resultsEl;

  var currentFile = null, previewUrl = null, imgW = 1, imgH = 1;
  var descRef = null, descFor = null;
  var busy = false, stopped = false, booted = false;

  function setStatus(msg, spin) {
    statusEl.classList.toggle("i2p-spin", !!spin);
    if (!msg) { statusEl.hidden = true; statusEl.textContent = ""; }
    else { statusEl.textContent = msg; statusEl.hidden = false; }
  }
  function setControls() {
    applyBtn.disabled = busy || !currentFile;
    stopBtn.hidden = !busy;
    reanalyzeBtn.disabled = busy || !currentFile;
  }
  function flash(btn, msg) {
    var old = btn.textContent;
    btn.textContent = msg;
    setTimeout(function () { btn.textContent = old; }, 1500);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
  }

  function downscaleBlob(file, maxSide) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var scale = Math.min(1, maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
          var w = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
          var h = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
          var c = document.createElement("canvas");
          c.width = w; c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h);
          c.toBlob(function (b) { URL.revokeObjectURL(url); b ? resolve(b) : reject(new Error("canvas toBlob failed")); }, "image/jpeg", 0.85);
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("could not decode image")); };
      img.src = url;
    });
  }

  function resolveResolution() {
    var v = resolutionSel.value;
    if (v !== "auto") return v;
    var r = (imgW || 1) / (imgH || 1);
    if (r > 1.2) return "768x512";
    if (r < 0.8) return "512x768";
    return "512x512";
  }

  // ---------- image loading ----------
  function setImage(file) {
    var t = (file.type || "").toLowerCase();
    if (t.indexOf("image/") !== 0 || t === "image/gif") { setStatus("⚠️ Please use a PNG, JPG or WEBP image.", false); return; }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    currentFile = file;
    previewUrl = URL.createObjectURL(file);
    previewImg.src = previewUrl;
    filenameEl.textContent = file.name || "pasted image";
    filesizeEl.textContent = (file.size / 1048576).toFixed(1) + " MB";
    dzIdle.hidden = true; dzLoaded.hidden = false;
    descRef = (file.name || "paste") + "|" + file.size + "|" + (file.lastModified || 0);
    descFor = null;
    descriptionInput.value = "";
    descCard.hidden = true;
    resultsEl.innerHTML = "";
    setStatus(""); setControls();
    var probe = new Image();
    probe.onload = function () { imgW = probe.naturalWidth || 1; imgH = probe.naturalHeight || 1; };
    probe.src = previewUrl;
  }
  function clearImage() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    currentFile = null; previewUrl = null; descRef = null; descFor = null;
    previewImg.src = ""; filenameEl.textContent = ""; filesizeEl.textContent = "";
    dzIdle.hidden = false; dzLoaded.hidden = true;
    descriptionInput.value = ""; descCard.hidden = true;
    resultsEl.innerHTML = "";
    setStatus(""); setControls();
  }

  // ---------- AI analysis (vision) ----------
  async function analyze() {
    if (busy || !currentFile) return false;
    busy = true; stopped = false; setControls();
    setStatus("🔍 AI is studying your photo…", true);
    try {
      var blob = await downscaleBlob(currentFile, 1400);
      descCard.hidden = false;
      var res = await window.root.generateText({
        instruction: [VISION_SYSTEM, blob],
        onChunk: function (d) { descriptionInput.value = (d && d.fullTextSoFar) || ""; }
      });
      descriptionInput.value = ((res && res.text) || "").trim();
      descFor = descRef;
      return true;
    } catch (e) {
      console.error("aiedit analyze:", e);
      setStatus("⚠️ The AI couldn't analyze that photo — try again or use a smaller image.", false);
      return false;
    } finally {
      busy = false; setControls();
    }
  }

  // ---------- generation ----------
  async function applyEdit() {
    if (busy || !currentFile) return;
    var instr = instructionInput.value.trim();
    if (!instr) { setStatus("💡 Describe what should change — or tap a quick edit below.", false); instructionInput.focus(); return; }
    if (descFor !== descRef || !descriptionInput.value.trim()) {
      var ok = await analyze();
      if (!ok) return;
    }
    var desc = descriptionInput.value.trim();
    var creat = CREATIVITY[parseInt(creativitySel.value, 10)] || CREATIVITY[1];
    var prompt = desc + ". " + instr + " " + creat.tpl;
    var count = parseInt(countSel.value, 10) || 2;
    var reso = resolveResolution();
    var seedTxt = seedInput.value.trim();
    var baseSeed = seedTxt ? (parseInt(seedTxt, 10) || 0) : null;
    busy = true; stopped = false; setControls();
    var made = 0, failed = 0;
    for (var i = 0; i < count; i++) {
      if (stopped) break;
      setStatus("🪄 Creating edit " + (i + 1) + " of " + count + "…", true);
      var stopFunny = window.FunnyGen ? window.FunnyGen.start(function (line) { setStatus("🪄 Creating edit " + (i + 1) + " of " + count + "… " + line, true); }) : null;
      try {
        var opts = { resolution: reso };
        if (baseSeed != null) opts.seed = baseSeed + i;
        var res = await window.root.generateImage(prompt, opts);
        if (stopFunny) { try { stopFunny(); } catch (_f) {} stopFunny = null; }
        if (res && res.dataUrl) { addTile(res.dataUrl, prompt, reso); made++; }
        else if (res && res.error) throw new Error(res.error);
        else throw new Error("no image returned");
      } catch (e) {
        failed++;
        console.error("aiedit generate:", e);
        if (stopFunny) { try { stopFunny(); } catch (_f) {} stopFunny = null; }
        setStatus("⚠️ Edit " + (i + 1) + " failed — " + ((e && e.message) || "please try again"), false);
      }
    }
    busy = false; setControls();
    if (made > 0) setStatus("✅ " + made + " edit" + (made === 1 ? "" : "s") + Quip.q("aeReady", " ready — fresh out of the oven") + (failed ? " · " + failed + " failed" : "") + (stopped ? " · stopped" : ""), false);
    else if (stopped) setStatus("⏹ Stopped.", false);
    else setStatus("⚠️ Nothing generated " + Quip.q("aeNothing", "— try again."), false);
  }

  // ---------- result tiles ----------
  function addTile(dataUrl, prompt, reso) {
    var ratio = reso === "512x768" ? "512 / 768" : reso === "768x512" ? "768 / 512" : "1 / 1";
    var card = document.createElement("div");
    card.className = "ae-card";
    card.innerHTML =
      '<div class="ae-imgwrap" style="aspect-ratio:' + ratio + ';">' +
        '<img src="' + dataUrl + '" alt="AI edit result">' +
      '</div>' +
      '<div class="ae-card-prompt" title="' + escapeHtml(prompt) + '">' + escapeHtml(prompt) + '</div>' +
      '<div class="ae-card-actions">' +
        '<a class="i2p-btn" href="' + dataUrl + '" download="aiedit-' + Date.now() + '.png" title="Download">⬇️</a>' +
        '<button class="i2p-btn" data-act="copy" type="button" title="Copy the prompt">📋</button>' +
        '<button class="i2p-btn" data-act="gallery" type="button" title="Save to community gallery">❤️</button>' +
        '<button class="i2p-btn" data-act="vault" type="button" title="Save this prompt (and image) to your vault">📚</button>' +
        '<button class="i2p-btn" data-act="send" type="button" title="Send this prompt to another tab">▸</button>' +
        '<span class="ae-spacer"></span>' +
        '<button class="i2p-btn i2p-btn-ghost" data-act="gen" type="button" title="Use this prompt in the Image Generator">🎨 Use</button>' +
      '</div>';
    card.querySelector('[data-act="copy"]').addEventListener("click", function () {
      var b = this;
      function done() { flash(b, "✅ Copied!"); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(prompt).then(done, function () { fallbackCopy(prompt); done(); });
      else { fallbackCopy(prompt); done(); }
    });
    card.querySelector('[data-act="gallery"]').addEventListener("click", function () {
      var b = this;
      if (!window.t2iAddImageToGallery) { flash(b, "⚠️ Gallery busy"); return; }
      window.t2iAddImageToGallery(dataUrl, prompt || "", "").then(function () { flash(b, "❤️ Saved!"); }, function (e) { console.error(e); flash(b, "⚠️ Failed"); });
    });
    card.querySelector('[data-act="vault"]').addEventListener("click", function () {
      var b = this;
      if (!window.Vault) { flash(b, "⚠️ Vault busy"); return; }
      window.Vault.addImage(dataUrl, prompt, { tags: ["ai-photo-editor"], tab: "aiedit" }).then(function () { flash(b, "✅ Saved!"); }, function () { flash(b, "⚠️ Failed"); });
    });
    card.querySelector('[data-act="send"]').addEventListener("click", function () {
      if (!window.PromptBridge) {
        if (window.ensureVault) { try { window.ensureVault(); } catch (e) {} }
        flash(this, "⏳ bridge loading…");
        var self = this, n = 0;
        (function tick() {
          if (window.PromptBridge) { try { window.PromptBridge.sendTo(prompt, { anchor: self, preview: prompt, tags: ["ai-photo-editor"] }); } catch (e) {} return; }
          if (++n > 40) { flash(self, "⚠️ bridge failed"); return; }
          setTimeout(tick, 200);
        })();
        return;
      }
      window.PromptBridge.sendTo(prompt, { anchor: this, preview: prompt, tags: ["ai-photo-editor"] });
    });
    card.querySelector('[data-act="gen"]').addEventListener("click", function () {
      var ta = document.querySelector('#i2p-imggen [data-name="description"]');
      if (!ta) { flash(this, "⚠️ no box"); return; }
      ta.value = prompt;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      if (window.showTab) window.showTab("gen");
    });
    card.querySelector(".ae-imgwrap").addEventListener("click", function () { openZoom(dataUrl); });
    resultsEl.appendChild(card);
    card.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function openZoom(dataUrl) {
    var ov = document.createElement("div");
    ov.className = "ae-zoomed";
    var img = document.createElement("img");
    img.src = dataUrl; img.alt = "AI edit result";
    ov.appendChild(img);
    ov.addEventListener("click", function () { ov.remove(); });
    document.body.appendChild(ov);
  }

  // ---------- boot ----------
  function boot() {
    dropzone.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("#ae-remove")) return;
      fileInput.click();
    });
    dropzone.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
    });
    fileInput.addEventListener("change", function () {
      if (fileInput.files && fileInput.files[0]) setImage(fileInput.files[0]);
      fileInput.value = "";
    });
    removeBtn.addEventListener("click", clearImage);
    var AE_SAMPLES = (window.t2i_poolPlace && window.t2i_poolPerson)
      ? [window.t2i_poolPlace().img, window.t2i_poolPerson().img]
      : ["src/samples/sample-coast.jpg", "src/samples/sample-portrait.jpg"];
    var aeSampleIdx = 0;
    var aeSampleBtn = $("ae-sample");
    if (aeSampleBtn) aeSampleBtn.addEventListener("click", function () {
      if (currentFile) { setStatus("This tool already has a photo — press 🪄 Apply edit when you're ready.", false); return; }
      var btn = this;
      btn.disabled = true;
      var url = AE_SAMPLES[aeSampleIdx % AE_SAMPLES.length];
      aeSampleIdx++;
      setStatus("Loading sample photo… " + Quip.q("aeSample", "dusting it off…"), true);
      fetch(url).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.blob();
      }).then(function (blob) {
        setImage(new File([blob], url.split("/").pop() || "sample.jpg", { type: blob.type || "image/jpeg" }));
      }).catch(function () {
        setStatus("⚠️ Couldn't load the sample photo.", false);
      }).then(function () { btn.disabled = false; });
    });
    ["dragenter", "dragover"].forEach(function (ev) {
      dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.add("i2p-dragover"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.remove("i2p-dragover"); });
    });
    dropzone.addEventListener("drop", function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) setImage(f);
    });
    document.addEventListener("paste", function (e) {
      if (!$("i2p-aiedit").hidden) {
        var items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (var i = 0; i < items.length; i++) {
          if (items[i].type && items[i].type.indexOf("image/") === 0) {
            var f = items[i].getAsFile();
            if (f) { setImage(f); break; }
          }
        }
      }
    });

    for (var i = 0; i < PRESETS.length; i++) {
      (function (p) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "ae-chip";
        chip.textContent = p.label;
        chip.addEventListener("click", function () {
          instructionInput.value = p.text;
          instructionInput.focus();
          presetsEl.querySelectorAll(".ae-chip.ae-active").forEach(function (c) { c.classList.remove("ae-active"); });
          chip.classList.add("ae-active");
        });
        presetsEl.appendChild(chip);
      })(PRESETS[i]);
    }

    creativitySel.addEventListener("input", function () {
      creativityVal.textContent = (CREATIVITY[parseInt(creativitySel.value, 10)] || CREATIVITY[1]).label;
    });
    applyBtn.addEventListener("click", applyEdit);
    stopBtn.addEventListener("click", function () { stopped = true; });
    reanalyzeBtn.addEventListener("click", function () {
      descFor = null;
      descriptionInput.value = "";
      analyze();
    });
    setControls();
  }

  window.__aieditOnShow = function () {
    if (booted) return;
    booted = true;
    dropzone = $("ae-dropzone"); fileInput = $("ae-file");
    dzIdle = $("ae-dz-idle"); dzLoaded = $("ae-dz-loaded");
    previewImg = $("ae-preview"); filenameEl = $("ae-filename"); filesizeEl = $("ae-filesize");
    removeBtn = $("ae-remove");
    instructionInput = $("ae-instruction"); presetsEl = $("ae-presets");
    creativitySel = $("ae-creativity"); creativityVal = $("ae-creativity-val");
    resolutionSel = $("ae-resolution"); countSel = $("ae-count"); seedInput = $("ae-seed");
    applyBtn = $("ae-apply"); stopBtn = $("ae-stop"); statusEl = $("ae-status");
    descCard = $("ae-desc-card"); descriptionInput = $("ae-description"); reanalyzeBtn = $("ae-reanalyze");
    resultsEl = $("ae-results");
    boot();
  };

  // integration hook for the shared PromptBridge ("send to ▸ AI Photo Editor")
  window.__aieditSetInstruction = function (text) {
    if (!booted) window.__aieditOnShow();
    if (instructionInput) {
      instructionInput.value = String(text == null ? "" : text);
      instructionInput.dispatchEvent(new Event("input", { bubbles: true }));
      try { instructionInput.focus(); } catch (e) {}
    }
  };
})();
