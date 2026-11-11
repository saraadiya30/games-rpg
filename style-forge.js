(function () {
  "use strict";
  if (window.StyleForge && window.StyleForge.render) return;
  var KV_FOLDER = "t2iStyleForge";
  var KV_KEY = "state";
  var CS_KEY = "t2iCS_data";
  var CS_TAB = "Forged Styles";
  var MAX_DIM = 1024;

  function kv() { try { return (window.root && root.kv) ? root.kv[KV_FOLDER] : null; } catch (e) { return null; } }
  function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function today() {
    try { return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
    catch (e) { return ""; }
  }

  function css() {
    if (document.getElementById("sfCss")) return;
    var s = document.createElement("style");
    s.id = "sfCss";
    s.textContent =
      ".sf-sec{border:1px solid var(--th-border,#ccc);border-radius:12px;padding:0.8rem;margin:0 auto 0.8rem;max-width:860px;background:var(--th-surface,#f2f2f2);text-align:left;}" +
      ".sf-sec h3{margin:0 0 0.15rem;font-size:0.95rem;}" +
      ".sf-hint{font-size:0.78rem;opacity:0.7;line-height:1.5;margin:0 0 0.6rem;}" +
      ".sf-drop{border:2px dashed var(--th-border,#999);border-radius:12px;padding:1.1rem;text-align:center;cursor:pointer;font-size:0.85rem;opacity:0.9;}" +
      ".sf-drop.over{border-color:var(--th-accent,#2b6bf0);background:rgba(127,127,127,0.12);opacity:1;}" +
      ".sf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0.6rem;margin-top:0.6rem;}" +
      ".sf-card{border:1px solid var(--th-border,#ccc);border-radius:10px;padding:0.5rem;display:flex;flex-direction:column;gap:0.35rem;background:var(--th-field,#fff);}" +
      ".sf-card img{width:100%;border-radius:8px;aspect-ratio:1/1;object-fit:cover;background:#222;}" +
      ".sf-card input[type=text],.sf-card textarea,.sf-row input[type=text],.sf-row textarea,.sf-result textarea,.sf-result input[type=text]{width:100%;box-sizing:border-box;font:inherit;font-size:0.8rem;padding:0.3rem 0.45rem;border-radius:8px;border:1px solid var(--th-border,#ccc);background:var(--th-field,#fff);color:inherit;}" +
      ".sf-card textarea{resize:vertical;min-height:2.2em;}" +
      ".sf-crow{display:flex;gap:0.35rem;}" +
      ".sf-crow button{flex:1;cursor:pointer;font:inherit;font-size:0.76rem;font-weight:600;padding:0.3rem 0.4rem;border-radius:999px;border:1px solid var(--th-border,#ccc);background:transparent;color:inherit;}" +
      ".sf-crow button:hover{border-color:var(--th-accent,#2b6bf0);}" +
      ".sf-crow button.danger{color:#ff6b6b;}" +
      ".sf-analysis{font-size:0.74rem;line-height:1.5;white-space:pre-wrap;word-break:break-word;background:rgba(127,127,127,0.1);border-radius:8px;padding:0.4rem 0.5rem;max-height:9em;overflow-y:auto;}" +
      ".sf-row{display:flex;gap:0.4rem;flex-wrap:wrap;margin:0.4rem 0;}" +
      ".sf-row label{flex:1 1 200px;display:flex;flex-direction:column;gap:0.2rem;font-size:0.76rem;font-weight:600;}" +
      ".sf-btn{cursor:pointer;font:inherit;font-size:0.82rem;font-weight:700;padding:0.45rem 1rem;border-radius:999px;border:1px solid var(--th-accent,#2b6bf0);background:var(--th-accent,#2b6bf0);color:var(--th-accent-text,#fff);}" +
      ".sf-btn.ghost{background:transparent;color:inherit;border-color:var(--th-border,#ccc);font-weight:600;}" +
      ".sf-btn.ghost:hover{border-color:var(--th-accent,#2b6bf0);}" +
      ".sf-btn:disabled{opacity:0.55;cursor:wait;}" +
      ".sf-btn.busy::after{content:\"\";display:inline-block;width:0.7em;height:0.7em;margin-left:0.5em;border-radius:50%;border:2px solid currentColor;border-top-color:transparent;animation:sf-spin 0.7s linear infinite;vertical-align:-0.1em;}" +
      "@keyframes sf-spin{to{transform:rotate(360deg);}}" +
      ".sf-status{font-size:0.8rem;min-height:1.4em;margin-top:0.3rem;}" +
      ".sf-status.working::before{content:\"● \";animation:sf-blink 1s ease-in-out infinite;color:var(--th-accent,#2b6bf0);}" +
      "@keyframes sf-blink{50%{opacity:0.2;}}" +
      ".sf-result textarea{min-height:4.5em;resize:vertical;}" +
      ".sf-lib{border-top:1px solid var(--th-border,#ccc);margin-top:0.5rem;padding-top:0.5rem;display:flex;flex-direction:column;gap:0.4rem;}" +
      ".sf-libitem{border:1px solid var(--th-border,#ccc);border-radius:10px;padding:0.5rem 0.6rem;font-size:0.8rem;}" +
      ".sf-libitem b{font-size:0.86rem;}" +
      ".sf-libitem .sf-meta{opacity:0.65;font-size:0.74rem;margin:0.15rem 0 0.35rem;}" +
      ".sf-empty{opacity:0.6;font-size:0.82rem;text-align:center;padding:0.6rem;}";
    document.head.appendChild(s);
  }

  function setBusy(btn, on) {
    if (!btn) return;
    btn.disabled = !!on;
    if (on) btn.classList.add("busy"); else btn.classList.remove("busy");
  }
  function setStatus(el, msg, working) {
    if (!el) return;
    el.textContent = msg || "";
    if (working) el.classList.add("working"); else el.classList.remove("working");
  }
  function copyText(t, statusEl, label) {
    function done(ok) { setStatus(statusEl, ok ? (label || "Copied.") : "Copy failed — select and copy manually."); }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(function () { done(true); }, function () { done(false); }); return; }
    } catch (e) {}
    try {
      var ta = document.createElement("textarea");
      ta.value = t;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      done(true);
    } catch (e2) { done(false); }
  }
  function download(name, text) {
    try {
      var blob = new Blob([text], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    } catch (e) {}
  }
  function dataUrlToBlob(dataUrl) { return fetch(dataUrl).then(function (r) { return r.blob(); }); }
  function downscale(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var sc = Math.min(1, MAX_DIM / Math.max(img.width || 1, img.height || 1));
          var cw = Math.max(1, Math.round(img.width * sc)), ch = Math.max(1, Math.round(img.height * sc));
          var c = document.createElement("canvas");
          c.width = cw; c.height = ch;
          c.getContext("2d").drawImage(img, 0, 0, cw, ch);
          URL.revokeObjectURL(url);
          resolve(c.toDataURL("image/jpeg", 0.88));
        } catch (e) { URL.revokeObjectURL(url); resolve(null); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  function readForgeStore() {
    var d = null;
    try { d = JSON.parse(localStorage.getItem(CS_KEY) || "null"); } catch (e) { d = null; }
    if (!d || !Array.isArray(d.tabs)) d = { tabs: [], activeTabId: null, tabCounter: 1, pairCounter: 1, selections: {} };
    return d;
  }
  function sendToCustomStyles(name, prompt) {
    var d = readForgeStore();
    var tab = null;
    for (var i = 0; i < d.tabs.length; i++) if (d.tabs[i].name === CS_TAB) tab = d.tabs[i];
    if (!tab) {
      tab = { id: d.tabCounter++, name: CS_TAB, pairs: {} };
      d.tabs.push(tab);
      if (!d.activeTabId) d.activeTabId = tab.id;
    }
    var id = d.pairCounter++;
    tab.pairs[id] = { name: String(name || "Forged Style"), value: String(prompt || "") };
    try { localStorage.setItem(CS_KEY, JSON.stringify(d)); } catch (e) { return false; }
    try { if (typeof window.__t2iCustomStylesRefresh === "function") window.__t2iCustomStylesRefresh(); } catch (e2) {}
    return true;
  }

  function analyzeInstruction() {
    return "Describe ONLY the visual style of this image (not its subject) in these short labeled lines: Medium, Technique, Palette, Lighting, Composition, Motifs, Mood. One line each, under 12 words per line. No intro, no outro.";
  }
  function forgeInstruction(group, context, parts) {
    return "You distill reusable image-generation art styles from reference images. Analysis of the reference set for style group \"" + group + "\""
      + (context ? " (user context: " + context + ")" : "")
      + " follows. Each item: label, user prompt/notes, then its STYLE analysis:\n\n" + parts.join("\n\n")
      + "\n\nSynthesize ONE shared art style capturing what is visually common across ALL of them (ignore subject matter). Reply in EXACTLY this format:\nNAME: <short punchy style name, 2-5 words>\nPROMPT: <comma-separated style fragment, 25-60 words, style words only, no subject>\nNEGATIVE: <comma-separated terms to avoid>";
  }
  function parseForged(text) {
    var t = String(text || "");
    function grab(key) {
      var m = t.match(new RegExp(key + "\\s*:\\s*([\\s\\S]*?)(?=\\n[A-Z]+\\s*:|$)"));
      return m ? m[1].trim() : "";
    }
    return { name: grab("NAME").split("\n")[0].slice(0, 60), prompt: grab("PROMPT"), negative: grab("NEGATIVE") };
  }

  function evolveInstruction(prev, group, context, parts) {
    return "You refine a reusable image-generation art style using new reference images. The CURRENT style to evolve:\nNAME: " + prev.name + "\nPROMPT: " + prev.prompt + "\nNEGATIVE: " + (prev.negative || "(none)")
      + "\n\nNew reference analysis for style group \"" + group + "\""
      + (context ? " (user context: " + context + ")" : "")
      + " follows. Each item: label, user prompt/notes, then its STYLE analysis:\n\n" + parts.join("\n\n")
      + "\n\nEvolve the current style so it also covers what is visually shared across ALL the new images (ignore subject matter). Keep whatever of the current style still fits; change what the new images contradict; absorb the new common traits. Reply in EXACTLY this format:\nNAME: <short punchy style name, 2-5 words>\nPROMPT: <comma-separated style fragment, 25-60 words, style words only, no subject>\nNEGATIVE: <comma-separated terms to avoid>";
  }

  function render(w) {
    if (w.dataset.sfBuilt && w.firstChild) return;
    css();
    while (w.firstChild) w.removeChild(w.firstChild);
    w.dataset.sfBuilt = "1";

    var state = { images: [], styles: [] };
    var saveTimer = null;
    function save() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        try { var k = kv(); if (k) k.set(KV_KEY, state); } catch (e) {}
      }, 500);
    }
    function load() {
      try {
        var k = kv();
        if (!k) return Promise.resolve();
        return k.get(KV_KEY).then(function (v) {
          if (v && Array.isArray(v.images)) state.images = v.images;
          if (v && Array.isArray(v.styles)) state.styles = v.styles;
        }).catch(function () {});
      } catch (e) { return Promise.resolve(); }
    }

    var status0 = document.createElement("div");
    status0.className = "sf-status";

    var s1 = document.createElement("section");
    s1.className = "sf-sec";
    var h1 = document.createElement("h3");
    h1.textContent = "1 · Collect reference images";
    var hint1 = document.createElement("p");
    hint1.className = "sf-hint";
    hint1.textContent = "Drop any mix at once — several images and/or .zip/.cbz archives together (bulk import, filenames become labels) — or click to browse, or paste from clipboard. Add a label, the prompt that made each one if you have it, and notes. Everything is stored privately in this browser.";
    var drop = document.createElement("div");
    drop.className = "sf-drop";
    drop.textContent = "🖼️ Drop images or .zip/.cbz archives here · click to browse · or paste (Ctrl+V)";
    drop.setAttribute("tabindex", "0");
    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*,.zip,.cbz";
    fileInput.multiple = true;
    fileInput.hidden = true;
    var grid = document.createElement("div");
    grid.className = "sf-grid";
    var gridBar = document.createElement("div");
    gridBar.className = "sf-row";
    gridBar.style.alignItems = "center";
    var gridCount = document.createElement("span");
    gridCount.className = "sf-hint";
    gridCount.style.margin = "0";
    var clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "sf-btn ghost";
    clearBtn.textContent = "🗑 Clear all images";
    clearBtn.addEventListener("click", async function () {
      if (!state.images.length) return;
      if (!(await window.uiConfirm("Remove all " + state.images.length + " reference image(s)?", { okText: 'Remove all', danger: true }))) return;
      state.images = [];
      save(); paintGrid();
      setStatus(status0, "Cleared all reference images.");
    });
    gridBar.appendChild(gridCount);
    gridBar.appendChild(clearBtn);
    s1.appendChild(h1); s1.appendChild(hint1); s1.appendChild(drop); s1.appendChild(fileInput); s1.appendChild(gridBar); s1.appendChild(grid);

    var s2 = document.createElement("section");
    s2.className = "sf-sec";
    var h2 = document.createElement("h3");
    h2.textContent = "2 · Forge a style";
    var hint2 = document.createElement("p");
    hint2.className = "sf-hint";
    hint2.textContent = "AI vision reads each image's style, then synthesizes one shared style from the whole set. Missing analyses are generated automatically during forging.";
    var row = document.createElement("div");
    row.className = "sf-row";
    var gLab = document.createElement("label");
    gLab.textContent = "Style group name";
    var gInput = document.createElement("input");
    gInput.type = "text";
    gInput.placeholder = "e.g. Neon Ink";
    gLab.appendChild(gInput);
    var cLab = document.createElement("label");
    cLab.textContent = "Context (optional)";
    var cInput = document.createElement("input");
    cInput.type = "text";
    cInput.placeholder = "e.g. dark fantasy game splash art";
    cLab.appendChild(cInput);
    row.appendChild(gLab); row.appendChild(cLab);
    var forgeRow = document.createElement("div");
    forgeRow.className = "sf-row";
    var forgeBtn = document.createElement("button");
    forgeBtn.type = "button";
    forgeBtn.className = "sf-btn";
    forgeBtn.textContent = "🔥 Forge style from images";
    forgeRow.appendChild(forgeBtn);
    var status2 = document.createElement("div");
    status2.className = "sf-status";
    var res = document.createElement("div");
    res.className = "sf-result";
    res.hidden = true;
    var nLab = document.createElement("label");
    nLab.textContent = "Style name";
    nLab.style.cssText = "display:block;font-size:0.76rem;font-weight:600;margin:0.4rem 0;";
    var nInput = document.createElement("input");
    nInput.type = "text";
    nLab.appendChild(nInput);
    var pLab = document.createElement("label");
    pLab.textContent = "Prompt";
    pLab.style.cssText = "display:block;font-size:0.76rem;font-weight:600;margin:0.4rem 0;";
    var pInput = document.createElement("textarea");
    pLab.appendChild(pInput);
    var ngLab = document.createElement("label");
    ngLab.textContent = "Negative";
    ngLab.style.cssText = "display:block;font-size:0.76rem;font-weight:600;margin:0.4rem 0;";
    var ngInput = document.createElement("textarea");
    ngLab.appendChild(ngInput);
    var actRow = document.createElement("div");
    actRow.className = "sf-row";
    function actBtn(text, ghost) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "sf-btn" + (ghost ? " ghost" : "");
      b.textContent = text;
      actRow.appendChild(b);
      return b;
    }
    var sendBtn = actBtn("📥 Send to Custom Art Styles");
    var saveBtn = actBtn("💾 Save to library", true);
    var evoBtn = actBtn("🧬 Evolve with current images", true);
    var dlBtn = actBtn("⤓ Download JSON", true);
    var cpBtn = actBtn("📋 Copy prompt", true);
    var cnBtn = actBtn("📋 Copy negative", true);
    res.appendChild(nLab); res.appendChild(pLab); res.appendChild(ngLab); res.appendChild(actRow);
    s2.appendChild(h2); s2.appendChild(hint2); s2.appendChild(row); s2.appendChild(forgeRow); s2.appendChild(status2); s2.appendChild(res);

    var s3 = document.createElement("section");
    s3.className = "sf-sec";
    var h3 = document.createElement("h3");
    h3.textContent = "3 · Forged style library";
    var hint3 = document.createElement("p");
    hint3.className = "sf-hint";
    hint3.textContent = "Every forged style is kept here. Load one into the editor to edit it, evolve it with new images, send it to Custom Art Styles, or export it.";
    var libRow = document.createElement("div");
    libRow.className = "sf-row";
    var impBtn = document.createElement("button");
    impBtn.type = "button";
    impBtn.className = "sf-btn ghost";
    impBtn.textContent = "⤒ Import JSON";
    var expAllBtn = document.createElement("button");
    expAllBtn.type = "button";
    expAllBtn.className = "sf-btn ghost";
    expAllBtn.textContent = "⤓ Export all";
    var impFile = document.createElement("input");
    impFile.type = "file";
    impFile.accept = ".json,application/json";
    impFile.hidden = true;
    libRow.appendChild(impBtn); libRow.appendChild(expAllBtn); libRow.appendChild(impFile);
    expAllBtn.addEventListener("click", function () {
      if (!state.styles.length) { setStatus(status0, "Library is empty — nothing to export."); return; }
      download("forged-styles-" + Date.now() + ".json", JSON.stringify({ exported: today(), styles: state.styles }, null, 2));
      setStatus(status0, "Exported " + state.styles.length + " style(s).");
    });
    var lib = document.createElement("div");
    lib.className = "sf-lib";
    s3.appendChild(h3); s3.appendChild(hint3); s3.appendChild(libRow); s3.appendChild(lib);

    var head = document.createElement("div");
    head.style.cssText = "text-align:center;margin:0 auto 0.8rem;max-width:860px;";
    var title = document.createElement("div");
    title.style.cssText = "font-size:1.15rem;font-weight:800;";
    title.textContent = "🧪 Style Forge";
    var sub = document.createElement("div");
    sub.className = "sf-hint";
    sub.style.textAlign = "center";
    sub.textContent = "Turn reference images into reusable art styles. Private to this browser until you export.";
    head.appendChild(title); head.appendChild(sub);
    w.appendChild(head); w.appendChild(s1); w.appendChild(s2); w.appendChild(s3); w.appendChild(status0);

    function paintGrid() {
      while (grid.firstChild) grid.removeChild(grid.firstChild);
      gridCount.textContent = state.images.length ? (state.images.length + " image(s)") : "";
      clearBtn.style.display = state.images.length ? "" : "none";
      if (!state.images.length) {
        var e = document.createElement("div");
        e.className = "sf-empty";
        e.textContent = "No reference images yet.";
        grid.appendChild(e);
      }
      state.images.forEach(function (im) {
        var card = document.createElement("div");
        card.className = "sf-card";
        var img = document.createElement("img");
        img.src = im.dataUrl;
        img.alt = "";
        img.loading = "lazy";
        var lab = document.createElement("input");
        lab.type = "text";
        lab.placeholder = "Label (e.g. hero shot 1)";
        lab.value = im.label || "";
        lab.addEventListener("input", function () { im.label = lab.value; save(); });
        var pr = document.createElement("textarea");
        pr.placeholder = "Source prompt (optional)";
        pr.value = im.prompt || "";
        pr.addEventListener("input", function () { im.prompt = pr.value; save(); });
        var nt = document.createElement("textarea");
        nt.placeholder = "Notes (optional)";
        nt.value = im.notes || "";
        nt.addEventListener("input", function () { im.notes = nt.value; save(); });
        var ana = document.createElement("div");
        ana.className = "sf-analysis";
        function paintAna() {
          ana.textContent = im.analysis || "Not analyzed yet.";
          ana.style.display = im.analysis ? "" : "none";
        }
        paintAna();
        var crow = document.createElement("div");
        crow.className = "sf-crow";
        var ab = document.createElement("button");
        ab.type = "button";
        ab.textContent = im.analysis ? "↻ Re-analyze" : "🔍 Analyze";
        ab.addEventListener("click", function () { analyzeImage(im, ab, ana, paintAna); });
        var del = document.createElement("button");
        del.type = "button";
        del.className = "danger";
        del.textContent = "✕";
        del.title = "Remove image";
        del.addEventListener("click", function () {
          state.images = state.images.filter(function (x) { return x.id !== im.id; });
          save(); paintGrid();
        });
        crow.appendChild(ab); crow.appendChild(del);
        card.appendChild(img); card.appendChild(lab); card.appendChild(pr); card.appendChild(nt); card.appendChild(ana); card.appendChild(crow);
        grid.appendChild(card);
      });
    }

    var IMG_EXT = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;
    var ZIP_EXT = /\.(zip|cbz)$/i;
    var MAX_ARCHIVE_IMAGES = 50;
    var ZIP_URL = "https://esm.sh/@zip.js/zip.js@2.23.0";
    var zipLib = null;
    function loadZipLib() {
      if (zipLib) return zipLib;
      zipLib = import(ZIP_URL).catch(function () { zipLib = null; return null; });
      return zipLib;
    }
    function baseLabel(name) {
      var b = String(name || "").split("/").pop().split("\\").pop();
      return b.replace(/\.[^.]{1,5}$/, "").replace(/[_-]+/g, " ").trim().slice(0, 60);
    }
    function unzipImages(file) {
      return loadZipLib().then(function (Z) {
        if (!Z) throw new Error("ziplib");
        var reader = new Z.ZipReader(new Z.BlobReader(file));
        return reader.getEntries().then(function (entries) {
          var pics = entries.filter(function (e) {
            return !e.directory && !e.encrypted && IMG_EXT.test(e.filename || "");
          }).sort(function (a, b) {
            return String(a.filename).localeCompare(String(b.filename), undefined, { numeric: true });
          }).slice(0, MAX_ARCHIVE_IMAGES);
          var out = [];
          var chain = Promise.resolve();
          pics.forEach(function (e, ix) {
            chain = chain.then(function () {
              setStatus(status0, "Extracting " + (ix + 1) + " of " + pics.length + " from " + (file.name || "archive") + "…", true);
              return e.getData(new Z.BlobWriter()).then(function (blob) {
                out.push({ blob: blob, label: baseLabel(e.filename) });
              }).catch(function () {});
            });
          });
          return chain.then(function () {
            try { reader.close(); } catch (e2) {}
            return out;
          });
        });
      });
    }
    function addFiles(files) {
      var pending = [], zips = [], bad = 0;
      var before = state.images.length, directCount = 0, archCount = 0;
      for (var i = 0; i < (files || []).length; i++) {
        var f = files[i];
        if (!f) continue;
        var nm = String(f.name || "");
        if (ZIP_EXT.test(nm) || f.type === "application/zip" || f.type === "application/x-zip-compressed") zips.push(f);
        else if ((f.type || "").indexOf("image/") === 0 || IMG_EXT.test(nm)) pending.push({ blob: f, label: "" });
        else bad++;
      }
      directCount = pending.length;
      if (!pending.length && !zips.length) { setStatus(status0, bad ? "No usable files — drop images or .zip/.cbz archives." : "No image files found in that drop."); return; }
      setStatus(status0, "Importing…", true);
      var errMsg = "";
      var chain = Promise.resolve();
      zips.forEach(function (z) {
        chain = chain.then(function () {
          setStatus(status0, "Opening " + (z.name || "archive") + "…", true);
          return unzipImages(z).then(function (found) {
            found.forEach(function (im) { pending.push(im); });
            archCount += found.length;
            if (!found.length) { bad++; errMsg = "That archive held no readable images."; }
          }).catch(function () {
            bad++;
            errMsg = "Could not read " + (z.name || "archive") + " (damaged, encrypted, or not a zip).";
          });
        });
      });
      chain = chain.then(function () {
        if (!pending.length) return;
        setStatus(status0, "Importing " + pending.length + " image(s)…", true);
        var c2 = Promise.resolve();
        pending.forEach(function (entry) {
          c2 = c2.then(function () {
            return downscale(entry.blob).then(function (url) {
              if (!url) return;
              state.images.push({ id: uid(), dataUrl: url, label: entry.label || "", prompt: "", notes: "", analysis: "", ts: Date.now() });
            });
          });
        });
        return c2;
      });
      chain.then(function () {
        var added = state.images.length - before;
        save(); paintGrid();
        if (added > 0) {
          var msg = "Added " + added + " image(s)";
          if (zips.length) msg += " (incl. " + archCount + " from " + zips.length + " archive" + (zips.length > 1 ? "s" : "") + ")";
          if (bad) msg += " — " + bad + " file(s) skipped (not images/archives)";
          if (errMsg) msg += " — " + errMsg;
          setStatus(status0, msg + ".");
        } else setStatus(status0, errMsg || (bad ? "No usable files — drop images or .zip/.cbz archives." : "No image files found in that drop."));
      });
    }
    drop.addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () { addFiles(fileInput.files); fileInput.value = ""; });
    drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
    drop.addEventListener("drop", function (e) { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer) addFiles(e.dataTransfer.files); });
    w.addEventListener("paste", function (e) {
      try {
        if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length) addFiles(e.clipboardData.files);
      } catch (err) {}
    });

    function genText() {
      try { return (window.root && root.generateText) || null; } catch (e) { return null; }
    }
    function analyzeImage(im, btn, anaBox, repaint) {
      var gt = genText();
      if (!gt) { setStatus(status0, "AI text plugin is unavailable right now."); return Promise.resolve(false); }
      setBusy(btn, true);
      if (anaBox) { anaBox.style.display = ""; anaBox.textContent = "Analyzing style…"; }
      return dataUrlToBlob(im.dataUrl).then(function (blob) {
        return gt({ instruction: [analyzeInstruction(), blob], onChunk: function (d) {
          try { if (anaBox && d && d.textChunk) anaBox.textContent += d.textChunk; } catch (e) {}
        } });
      }).then(function (text) {
        im.analysis = String(text || "").trim();
        save();
        if (repaint) repaint();
        setBusy(btn, false);
        return !!im.analysis;
      }).catch(function () {
        setBusy(btn, false);
        if (anaBox) anaBox.textContent = im.analysis || "Analysis failed — try again.";
        return false;
      });
    }

    var loadedId = null;
    function buildParts() {
      return state.images.map(function (im, ix) {
        return "Image " + (ix + 1) + " [" + (im.label || "untitled") + "]"
          + (im.prompt ? "\nUser prompt: " + im.prompt : "")
          + (im.notes ? "\nUser notes: " + im.notes : "")
          + "\nStyle analysis:\n" + (im.analysis || "(none)");
      });
    }
    function currentGen() {
      for (var i = 0; i < state.styles.length; i++) if (state.styles[i].id === loadedId) return state.styles[i].gen || 1;
      return 1;
    }
    function runEvolve(base) {
      var gt = genText();
      if (!gt) { setStatus(status2, "AI text plugin is unavailable right now."); return; }
      if (!state.images.length) { setStatus(status2, "Add reference images first — evolving needs new images to learn from."); return; }
      if (!base || !base.name || !base.prompt) { setStatus(status2, "Load a library style into the editor first (or type a name + prompt), then evolve."); return; }
      var group = gInput.value.trim() || base.name;
      var context = cInput.value.trim();
      setBusy(evoBtn, true);
      res.hidden = false;
      var chain = Promise.resolve();
      state.images.forEach(function (im, ix) {
        chain = chain.then(function () {
          if (im.analysis) return true;
          setStatus(status2, "Analyzing image " + (ix + 1) + " of " + state.images.length + "…", true);
          return analyzeImage(im, null, null, null).then(function () { paintGrid(); return true; });
        });
      });
      chain.then(function () {
        setStatus(status2, "Evolving “" + base.name + "”…", true);
        return gt({ instruction: evolveInstruction(base, group, context, buildParts()), onChunk: function (d) {
          try {
            if (d && d.textChunk) {
              res.hidden = false;
              pInput.value = (pInput.value + d.textChunk).slice(-4000);
            }
          } catch (e) {}
        } });
      }).then(function (text) {
        var f = parseForged(text);
        var gen = (base.gen || 1) + 1;
        nInput.value = f.name || (base.name + " v" + gen);
        pInput.value = f.prompt || String(text || "");
        ngInput.value = f.negative || "";
        var rec = { id: uid(), name: nInput.value, prompt: pInput.value, negative: ngInput.value, images: state.images.length, ts: Date.now(), gen: gen, evolvedFrom: base.id || null };
        state.styles.unshift(rec);
        loadedId = rec.id;
        save(); paintLib();
        setBusy(evoBtn, false);
        setStatus(status2, "Evolved into “" + rec.name + "” (v" + gen + ") from " + state.images.length + " image(s) — saved to the library below.");
      }).catch(function () {
        setBusy(evoBtn, false);
        setStatus(status2, "Evolving failed — try again.");
      });
    }

    forgeBtn.addEventListener("click", function () {
      var gt = genText();
      if (!gt) { setStatus(status2, "AI text plugin is unavailable right now."); return; }
      if (!state.images.length) { setStatus(status2, "Add at least one reference image first."); return; }
      var group = gInput.value.trim() || ("Forged Style " + (state.styles.length + 1));
      var context = cInput.value.trim();
      setBusy(forgeBtn, true);
      res.hidden = true;
      var chain = Promise.resolve();
      state.images.forEach(function (im, ix) {
        chain = chain.then(function () {
          if (im.analysis) return true;
          setStatus(status2, "Analyzing image " + (ix + 1) + " of " + state.images.length + "…", true);
          return analyzeImage(im, null, null, null).then(function () { paintGrid(); return true; });
        });
      });
      chain.then(function () {
        setStatus(status2, "Synthesizing shared style…", true);
        var parts = buildParts();
        return gt({ instruction: forgeInstruction(group, context, parts), onChunk: function (d) {
          try {
            if (d && d.textChunk) {
              res.hidden = false;
              pInput.value = (pInput.value + d.textChunk).slice(-4000);
            }
          } catch (e) {}
        } });
      }).then(function (text) {
        var f = parseForged(text);
        nInput.value = f.name || group;
        pInput.value = f.prompt || String(text || "");
        ngInput.value = f.negative || "";
        res.hidden = false;
        var rec = { id: uid(), name: nInput.value, prompt: pInput.value, negative: ngInput.value, images: state.images.length, ts: Date.now(), gen: 1 };
        state.styles.unshift(rec);
        loadedId = rec.id;
        save(); paintLib();
        setBusy(forgeBtn, false);
        setStatus(status2, state.images.length > 1 ? "Forged from " + state.images.length + " images — saved to the library below." : "Forged — saved to the library below.");
      }).catch(function () {
        setBusy(forgeBtn, false);
        setStatus(status2, "Forging failed — try again.");
      });
    });

    sendBtn.addEventListener("click", function () {
      var name = nInput.value.trim(), prompt = pInput.value.trim();
      if (!name || !prompt) { setStatus(status2, "Forge a style first (name + prompt needed)."); return; }
      if (sendToCustomStyles(name, prompt)) setStatus(status2, "“" + name + "” is now in 🎨 Custom Art Styles (Forged Styles tab) — pick it in a style slot in the Image Generator.");
      else setStatus(status2, "Could not write to Custom Art Styles storage.");
    });
    saveBtn.addEventListener("click", function () {
      var name = nInput.value.trim(), prompt = pInput.value.trim();
      if (!name || !prompt) { setStatus(status2, "Nothing to save — forge, evolve, or type a name + prompt first."); return; }
      var rec = null;
      for (var i = 0; i < state.styles.length; i++) if (state.styles[i].id === loadedId) rec = state.styles[i];
      if (rec) {
        rec.name = name; rec.prompt = prompt; rec.negative = ngInput.value.trim(); rec.ts = Date.now();
        setStatus(status2, "Saved changes to “" + name + "”.");
      } else {
        rec = { id: uid(), name: name, prompt: prompt, negative: ngInput.value.trim(), images: state.images.length, ts: Date.now(), gen: 1 };
        state.styles.unshift(rec);
        loadedId = rec.id;
        setStatus(status2, "Saved “" + name + "” as a new library entry.");
      }
      save(); paintLib();
    });
    evoBtn.addEventListener("click", function () {
      runEvolve({ id: loadedId, name: nInput.value.trim(), prompt: pInput.value.trim(), negative: ngInput.value.trim(), gen: currentGen() });
    });
    dlBtn.addEventListener("click", function () {
      download("forged-style-" + Date.now() + ".json", JSON.stringify({ name: nInput.value, prompt: pInput.value, negative: ngInput.value, forged: today(), images: state.images.length }, null, 2));
      setStatus(status2, "Downloaded.");
    });
    cpBtn.addEventListener("click", function () { copyText(pInput.value, status2, "Prompt copied."); });
    cnBtn.addEventListener("click", function () { copyText(ngInput.value, status2, "Negative copied."); });
    impFile.addEventListener("change", function () {
      var f = impFile.files[0];
      impFile.value = "";
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var o = JSON.parse(r.result);
          var arr = Array.isArray(o) ? o : (o && Array.isArray(o.styles) ? o.styles : [o]);
          var n = 0;
          arr.forEach(function (s) {
            if (s && (s.prompt || s.value)) {
              state.styles.unshift({ id: uid(), name: String(s.name || "Imported Style").slice(0, 60), prompt: String(s.prompt || s.value), negative: String(s.negative || ""), images: s.images || 0, ts: Date.now(), gen: s.gen || 1, evolvedFrom: s.evolvedFrom || null });
              n++;
            }
          });
          save(); paintLib();
          setStatus(status0, n ? "Imported " + n + " style(s)." : "Nothing importable in that file.");
        } catch (e) { setStatus(status0, "Invalid JSON file."); }
      };
      r.readAsText(f);
    });
    impBtn.addEventListener("click", function () { impFile.click(); });

    function paintLib() {
      while (lib.firstChild) lib.removeChild(lib.firstChild);
      if (!state.styles.length) {
        var e = document.createElement("div");
        e.className = "sf-empty";
        e.textContent = "Nothing forged yet.";
        lib.appendChild(e);
        return;
      }
      state.styles.forEach(function (s) {
        var it = document.createElement("div");
        it.className = "sf-libitem";
        var b = document.createElement("b");
        b.textContent = s.name;
        var m = document.createElement("div");
        m.className = "sf-meta";
        m.textContent = new Date(s.ts).toLocaleString() + " · from " + (s.images || 0) + " image(s)" + (s.gen > 1 ? " · v" + s.gen : "");
        var pv = document.createElement("div");
        pv.style.cssText = "opacity:0.8;max-height:3.2em;overflow:hidden;margin-bottom:0.35rem;";
        pv.textContent = s.prompt;
        var row2 = document.createElement("div");
        row2.className = "sf-crow";
        function lb(text) {
          var x = document.createElement("button");
          x.type = "button";
          x.textContent = text;
          row2.appendChild(x);
          return x;
        }
        var loadB = lb("Load");
        var evoB = lb("Evolve");
        var sendB = lb("Send to styles");
        var jsonB = lb("JSON");
        var delB = lb("Delete");
        delB.className = "danger";
        loadB.addEventListener("click", function () {
          nInput.value = s.name; pInput.value = s.prompt; ngInput.value = s.negative || "";
          loadedId = s.id;
          res.hidden = false;
          setStatus(status2, "Loaded “" + s.name + "” — edit below, then 💾 Save to library or 🧬 Evolve with the current images.");
          res.scrollIntoView({ block: "nearest" });
        });
        evoB.addEventListener("click", function () {
          nInput.value = s.name; pInput.value = s.prompt; ngInput.value = s.negative || "";
          loadedId = s.id;
          res.hidden = false;
          res.scrollIntoView({ block: "nearest" });
          runEvolve(s);
        });
        sendB.addEventListener("click", function () {
          if (sendToCustomStyles(s.name, s.prompt)) setStatus(status0, "“" + s.name + "” sent to 🎨 Custom Art Styles.");
          else setStatus(status0, "Could not write to Custom Art Styles storage.");
        });
        jsonB.addEventListener("click", function () {
          download("forged-style-" + s.id + ".json", JSON.stringify(s, null, 2));
        });
        delB.addEventListener("click", function () {
          state.styles = state.styles.filter(function (x) { return x.id !== s.id; });
          save(); paintLib();
        });
        it.appendChild(b); it.appendChild(m); it.appendChild(pv); it.appendChild(row2);
        lib.appendChild(it);
      });
    }

    load().then(function () { paintGrid(); paintLib(); });
  }
  window.StyleForge = { render: render };
})();
