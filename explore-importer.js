(function() {
"use strict";
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
var FETCH_TIMEOUT = 30000;
var MAX_BYTES = 25 * 1024 * 1024;
var DOWNSCALE_BYTES = 5 * 1024 * 1024;
var DOWNSCALE_DIM = 1920;
var queue = [];
var seq = 0;
var modalOpen = false;
var closed = false;

function toast(msg) {
  try {
    var t = document.createElement("div");
    t.className = "pubmenu-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 2200);
  } catch (e) {}
}
function ensureGalleryMod() {
  if (window.t2iAddImageToGallery) return Promise.resolve(true);
  if (window.ensureGallery) { try { window.ensureGallery(); } catch (e) {} }
  return new Promise(function(res) {
    var n = 0;
    (function tick() {
      if (window.t2iAddImageToGallery) return res(true);
      if (++n > 40) return res(false);
      setTimeout(tick, 250);
    })();
  });
}
function blobToDataUrl(blob) {
  return new Promise(function(res, rej) {
    var fr = new FileReader();
    fr.onload = function() { res(fr.result); };
    fr.onerror = function() { rej(new Error("read failed")); };
    fr.readAsDataURL(blob);
  });
}
function loadImage(dataUrl) {
  return new Promise(function(res, rej) {
    var img = new Image();
    img.onload = function() { res(img); };
    img.onerror = function() { rej(new Error("not an image")); };
    img.src = dataUrl;
  });
}
async function maybeDownscale(dataUrl) {
  try {
    var approx = Math.floor(String(dataUrl).length * 0.75);
    if (approx <= DOWNSCALE_BYTES) return dataUrl;
    var img = await loadImage(dataUrl);
    var scale = Math.min(1, DOWNSCALE_DIM / Math.max(img.width, img.height));
    if (scale >= 1) return dataUrl;
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * scale));
    c.height = Math.max(1, Math.round(img.height * scale));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  } catch (e) { return dataUrl; }
}
async function fetchWithTimeout(url) {
  var ctrl = new AbortController();
  var to = setTimeout(function() { try { ctrl.abort(); } catch (e) {} }, FETCH_TIMEOUT);
  try {
    var r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error("http " + r.status);
    return await r.blob();
  } finally { clearTimeout(to); }
}
async function fetchWithTimeoutProxy(url) {
  var ctrl = new AbortController();
  var to = setTimeout(function() { try { ctrl.abort(); } catch (e) {} }, FETCH_TIMEOUT);
  try {
    var r = await window.root.superFetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error("http " + r.status);
    return await r.blob();
  } finally { clearTimeout(to); }
}
async function downloadImage(url) {
  url = String(url || "").trim();
  if (/^data:image\//i.test(url)) {
    var head = url.slice(0, 40);
    if (url.length > MAX_BYTES) throw new Error("image too large");
    await loadImage(url);
    return { dataUrl: url, via: "data-url" };
  }
  if (!/^https?:\/\//i.test(url)) throw new Error("need an http(s) image URL");
  var blob = null, via = "direct", err = null;
  try { blob = await fetchWithTimeout(url); }
  catch (e) { err = e; }
  if (!blob && window.root && window.root.superFetch) {
    try { blob = await fetchWithTimeoutProxy(url); via = "proxy"; }
    catch (e2) { err = e2; }
  }
  if (!blob) throw (err && err.message && /abort/i.test(err.message)) ? new Error("timed out") : new Error("could not download (CORS or dead link)");
  if (!blob.size) throw new Error("empty file");
  if (blob.size > MAX_BYTES) throw new Error("image too large");
  var dataUrl = await blobToDataUrl(blob);
  if (blob.type && blob.type.indexOf("image/") !== 0) await loadImage(dataUrl);
  dataUrl = await maybeDownscale(dataUrl);
  return { dataUrl: dataUrl, via: via };
}
function paintQueue() {
  var list = $("xplimp-list");
  if (!list) return;
  list.innerHTML = "";
  var n = $("xplimp-count");
  if (n) n.textContent = queue.length ? queue.length + " image" + (queue.length === 1 ? "" : "s") : "queue is empty";
  queue.forEach(function(it) {
    var row = document.createElement("div");
    row.className = "xplimp-row";
    row.dataset.qid = it.id;
    var thumb = it.dataUrl ? '<img class="xplimp-thumb" src="' + it.dataUrl.replace(/"/g, "&quot;") + '" alt="">' : '<span class="xplimp-nothumb">…</span>';
    row.innerHTML = thumb
      + '<div class="xplimp-fields"><input class="xplimp-title" type="text" placeholder="title (optional)" value="' + esc(it.title) + '" aria-label="Title">'
      + '<textarea class="xplimp-prompt" rows="2" placeholder="prompt / caption (saved with the image)" aria-label="Prompt">' + esc(it.prompt) + '</textarea>'
      + '<div class="xplimp-stat">' + esc(it.statusText || "") + '</div></div>'
      + '<div class="xplimp-ops"><button type="button" class="xpl-btn xplimp-save-one" title="Save this one to your Personal Gallery">💾</button>'
      + '<button type="button" class="xpl-btn xplimp-rm" title="Remove from queue">✕</button></div>';
    if (it.dataUrl) {
      var im = row.querySelector(".xplimp-thumb");
      if (im) im.addEventListener("click", function() { try { window.open(it.dataUrl, "_blank", "noopener"); } catch (e) {} });
    }
    row.querySelector(".xplimp-title").addEventListener("input", function() { it.title = this.value; });
    row.querySelector(".xplimp-prompt").addEventListener("input", function() { it.prompt = this.value; });
    row.querySelector(".xplimp-rm").addEventListener("click", function() {
      queue = queue.filter(function(q) { return q.id !== it.id; });
      paintQueue();
    });
    var sv = row.querySelector(".xplimp-save-one");
    sv.disabled = it.state !== "ready";
    if (it.state === "saved") sv.textContent = "✅";
    sv.addEventListener("click", function() { saveItem(it, sv); });
    list.appendChild(row);
  });
  updateSaveAll();
}
function setItemState(it, state, text) {
  it.state = state;
  it.statusText = text;
  var row = document.querySelector('.xplimp-row[data-qid="' + it.id + '"]');
  if (row) {
    var st = row.querySelector(".xplimp-stat");
    if (st) st.textContent = text || "";
    var sv = row.querySelector(".xplimp-save-one");
    if (sv) {
      sv.disabled = state !== "ready";
      if (state === "saved") sv.textContent = "✅";
    }
  }
  updateSaveAll();
}
function updateSaveAll() {
  var b = $("xplimp-saveall");
  if (!b) return;
  var ready = queue.filter(function(q) { return q.state === "ready"; }).length;
  var busy = queue.some(function(q) { return q.state === "fetch" || q.state === "save"; });
  b.disabled = !ready || busy;
  b.textContent = busy ? "⏳ Working…" : "💾 Save all (" + ready + ")";
}
async function fetchItem(it) {
  if (closed || it.state === "saved") return;
  setItemState(it, "fetch", "⬇️ downloading…");
  try {
    var r = await downloadImage(it.url);
    if (closed) return;
    it.dataUrl = r.dataUrl;
    setItemState(it, "ready", r.via === "proxy" ? "✅ ready (via proxy)" : "✅ ready");
    var row = document.querySelector('.xplimp-row[data-qid="' + it.id + '"]');
    if (row) paintQueue();
  } catch (e) {
    if (closed) return;
    setItemState(it, "error", "⚠️ " + (e && e.message ? e.message : "failed"));
  }
}
async function saveItem(it, btn) {
  if (it.state !== "ready" || !it.dataUrl) return;
  setItemState(it, "save", "☁️ saving…");
  try {
    var ok = await ensureGalleryMod();
    if (!ok || closed) { if (!closed) setItemState(it, "ready", "⚠️ gallery still loading — try again"); return; }
    var url = await window.t2iAddImageToGallery(it.dataUrl, it.prompt || "", it.title || "");
    if (closed) return;
    if (url) {
      setItemState(it, "saved", "✅ in Personal Gallery");
      if (window.__galleryTabRefresh) try { window.__galleryTabRefresh(); } catch (e) {}
    } else setItemState(it, "ready", "⚠️ already saved, or upload failed");
  } catch (e) { if (!closed) setItemState(it, "ready", "⚠️ save failed — try again"); }
}
async function saveAll(btn) {
  var orig = btn ? btn.textContent : "";
  try {
    if (btn) { btn.disabled = true; btn.textContent = "⏳ Saving…"; }
    var ready = queue.filter(function(q) { return q.state === "ready"; });
    var done = 0, dup = 0;
    for (var i = 0; i < ready.length; i++) {
      if (closed) break;
      var it = ready[i];
      setItemState(it, "save", "☁️ saving " + (i + 1) + "/" + ready.length + "…");
      try {
        var ok = await ensureGalleryMod();
        if (!ok) { setItemState(it, "ready", "⚠️ gallery still loading"); continue; }
        var url = await window.t2iAddImageToGallery(it.dataUrl, it.prompt || "", it.title || "");
        if (url) { setItemState(it, "saved", "✅ in Personal Gallery"); done++; }
        else { setItemState(it, "ready", "⚠️ already saved, or upload failed"); dup++; }
      } catch (e) { setItemState(it, "ready", "⚠️ save failed"); }
    }
    if (window.__galleryTabRefresh) try { window.__galleryTabRefresh(); } catch (e) {}
    var s = $("xplimp-status");
    if (s) s.textContent = done ? "✅ " + done + " saved to Personal Gallery" + (dup ? " · " + dup + " already there" : "") : (dup ? "Nothing new — already in gallery" : "Nothing saved");
    if (done) toast("🖼️ " + done + " image" + (done === 1 ? "" : "s") + " saved to Personal Gallery");
  } finally { if (btn) { btn.disabled = false; btn.textContent = orig; } updateSaveAll(); }
}
function parseUrlLines(text, sharedPrompt, sharedTitle) {
  var out = [];
  String(text || "").split("\n").forEach(function(line) {
    line = line.trim();
    if (!line) return;
    var parts = line.split("|").map(function(p) { return p.trim(); });
    var url = parts[0];
    if (!url) return;
    out.push({ url: url, prompt: parts[1] != null && parts[1] !== "" ? parts[1] : (sharedPrompt || ""), title: parts[2] != null && parts[2] !== "" ? parts[2] : (sharedTitle || "") });
  });
  return out;
}
function addToQueue(entries) {
  (entries || []).forEach(function(e) {
    if (!e || (!e.url && !e.dataUrl)) return;
    var it = { id: ++seq, url: e.url || "", dataUrl: e.dataUrl || null, prompt: e.prompt || "", title: e.title || "", state: e.dataUrl ? "ready" : "new", statusText: e.dataUrl ? "✅ ready" : "" };
    queue.push(it);
  });
  paintQueue();
  queue.filter(function(q) { return q.state === "new"; }).forEach(function(q) { q.state = "fetch"; fetchItem(q); });
}
function openImporter(prefill) {
  closed = false;
  var existing = $("xplImpModal");
  if (existing) existing.remove();
  modalOpen = true;
  var overlay = document.createElement("div");
  overlay.id = "xplImpModal";
  overlay.className = "pro-persona-overlay";
  overlay.innerHTML = '<div class="pro-persona-box pro-post-box" style="max-width:640px;">'
    + '<div class="pro-persona-head"><b>📥 Import to Personal Gallery</b>'
    + '<span class="pro-persona-sub">URLs, uploads or drops — prompts ride along</span>'
    + '<button type="button" class="pro-persona-x" data-x-close title="close">✖️</button></div>'
    + '<div class="pro-post-body">'
    + '<div class="xplimp-sec"><label>Image URLs <span class="xplimp-hint">one per line — optional per-line <b>url | prompt | title</b></span></label>'
    + '<textarea id="xplimp-urls" rows="3" class="pro-textarea" placeholder="https://example.com/pic1.jpg\nhttps://example.com/pic2.png | a neon fox | Neon Fox" spellcheck="false"></textarea>'
    + '<div class="xplimp-duo"><input id="xplimp-shared-prompt" type="text" class="pro-input" placeholder="shared prompt for all URLs (optional)" aria-label="Shared prompt">'
    + '<input id="xplimp-shared-title" type="text" class="pro-input" placeholder="shared title (optional)" aria-label="Shared title"></div>'
    + '<div class="xplimp-btnrow"><button type="button" class="xpl-btn" id="xplimp-addurls">⬇️ Fetch URLs</button>'
    + '<button type="button" class="xpl-btn" id="xplimp-pick">📁 Upload files</button></div></div>'
    + '<div class="xplimp-drop" id="xplimp-drop">🖼️ drop image files here — or anywhere in the Explore tab</div>'
    + '<div class="xplimp-sec"><div class="xplimp-qhead"><b>Queue</b><span id="xplimp-count" class="xplimp-hint"></span></div>'
    + '<div id="xplimp-list" class="xplimp-list"></div></div>'
    + '<div class="xplimp-foot"><span id="xplimp-status" class="xplimp-hint"></span>'
    + '<span style="flex:1"></span>'
    + '<button type="button" class="xpl-btn" id="xplimp-saveall">💾 Save all</button></div>'
    + "</div></div>";
  document.body.appendChild(overlay);
  overlay.querySelector("[data-x-close]").addEventListener("click", closeImporter);
  overlay.addEventListener("mousedown", function(e) { if (e.target === overlay) closeImporter(); });
  overlay.querySelector("#xplimp-addurls").addEventListener("click", function() {
    var ta = overlay.querySelector("#xplimp-urls");
    var items = parseUrlLines(ta.value, overlay.querySelector("#xplimp-shared-prompt").value, overlay.querySelector("#xplimp-shared-title").value);
    if (!items.length) { var s = $("xplimp-status"); if (s) s.textContent = "Paste at least one image URL first"; return; }
    ta.value = "";
    addToQueue(items);
  });
  var picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "image/*";
  picker.multiple = true;
  picker.style.display = "none";
  overlay.appendChild(picker);
  picker.addEventListener("change", function() {
    addFiles(picker.files);
    picker.value = "";
  });
  overlay.querySelector("#xplimp-pick").addEventListener("click", function() { picker.click(); });
  var dz = overlay.querySelector("#xplimp-drop");
  ["dragenter", "dragover"].forEach(function(ev) { dz.addEventListener(ev, function(e) { e.preventDefault(); dz.classList.add("over"); }); });
  ["dragleave", "drop"].forEach(function(ev) { dz.addEventListener(ev, function(e) { e.preventDefault(); dz.classList.remove("over"); }); });
  dz.addEventListener("drop", function(e) { addFiles(e.dataTransfer && e.dataTransfer.files); });
  overlay.querySelector("#xplimp-saveall").addEventListener("click", function() { saveAll(this); });
  paintQueue();
  if (prefill && prefill.length) addToQueue(prefill);
}
function closeImporter() {
  closed = true;
  modalOpen = false;
  var m = $("xplImpModal");
  if (m) m.remove();
}
function addFiles(files) {
  if (!files || !files.length) return;
  var imgs = Array.prototype.filter.call(files, function(f) { return f && f.type && f.type.indexOf("image/") === 0; });
  if (!imgs.length) { toast("⚠️ no image files in that drop"); return; }
  if (!modalOpen) openImporter();
  var pending = imgs.length;
  imgs.forEach(function(f) {
    if (f.size > MAX_BYTES) {
      queue.push({ id: ++seq, url: "", dataUrl: null, prompt: "", title: (f.name || "upload").replace(/\.[^.]+$/, ""), state: "error", statusText: "⚠️ file too large (25MB max)" });
      if (--pending === 0) paintQueue();
      return;
    }
    blobToDataUrl(f).then(function(du) {
      return maybeDownscale(du);
    }).then(function(du) {
      queue.push({ id: ++seq, url: "", dataUrl: du, prompt: "", title: (f.name || "upload").replace(/\.[^.]+$/, ""), state: "ready", statusText: "✅ ready" });
      if (--pending === 0) paintQueue();
      else paintQueue();
    }).catch(function() {
      queue.push({ id: ++seq, url: "", dataUrl: null, prompt: "", title: f.name || "upload", state: "error", statusText: "⚠️ could not read file" });
      if (--pending === 0) paintQueue();
      else paintQueue();
    });
  });
}
async function quickImport(item, anchorBtn) {
  var orig = anchorBtn ? anchorBtn.textContent : "";
  try {
    if (anchorBtn) { anchorBtn.disabled = true; anchorBtn.textContent = "⏳"; }
    var ok = await ensureGalleryMod();
    if (!ok) { toast("⚠️ gallery still loading — try again"); return; }
    var r = await downloadImage(item.url);
    var url = await window.t2iAddImageToGallery(r.dataUrl, item.prompt || "", item.title || "");
    if (window.__galleryTabRefresh) try { window.__galleryTabRefresh(); } catch (e) {}
    toast(url ? "🖼️ Saved to Personal Gallery — with its prompt" : "⚠️ Already saved, or upload failed");
  } catch (e) { toast("⚠️ " + (e && e.message ? e.message : "import failed")); }
  finally { if (anchorBtn) { anchorBtn.disabled = false; anchorBtn.textContent = orig; } }
}
function injectCss() {
  if ($("xplimp-style")) return;
  var s = document.createElement("style");
  s.id = "xplimp-style";
  s.textContent = ".xplimp-sec{margin-bottom:.7rem;}"
    + ".xplimp-sec label{font-weight:700;font-size:.82rem;display:block;margin-bottom:.3rem;}"
    + ".xplimp-hint{font-weight:400;font-size:.75rem;opacity:.65;}"
    + ".xplimp-duo{display:flex;gap:.4rem;margin-top:.4rem;flex-wrap:wrap;}"
    + ".xplimp-duo input{flex:1 1 200px;}"
    + ".xplimp-btnrow{display:flex;gap:.4rem;margin-top:.45rem;flex-wrap:wrap;}"
    + ".xplimp-drop{border:1px dashed var(--th-border);border-radius:10px;padding:.8rem;text-align:center;font-size:.85rem;opacity:.8;margin-bottom:.7rem;}"
    + ".xplimp-drop.over{opacity:1;border-color:var(--th-accent);background:var(--th-accent-soft);}"
    + ".xplimp-qhead{display:flex;align-items:baseline;gap:.5rem;margin-bottom:.35rem;}"
    + ".xplimp-list{display:flex;flex-direction:column;gap:.45rem;max-height:38vh;overflow-y:auto;}"
    + ".xplimp-row{display:flex;gap:.5rem;align-items:flex-start;border:1px solid var(--th-border);border-radius:10px;padding:.4rem;background:var(--th-field,transparent);}"
    + ".xplimp-thumb{width:64px;height:64px;object-fit:cover;border-radius:7px;background:#000;flex:0 0 auto;cursor:zoom-in;}"
    + ".xplimp-nothumb{width:64px;height:64px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;opacity:.5;}"
    + ".xplimp-fields{flex:1;min-width:0;display:flex;flex-direction:column;gap:.3rem;}"
    + ".xplimp-fields input,.xplimp-fields textarea{width:100%;box-sizing:border-box;font:inherit;font-size:.8rem;color:inherit;background:var(--th-field,#fff);border:1px solid var(--th-border);border-radius:7px;padding:.3rem .45rem;}"
    + ".xplimp-stat{font-size:.75rem;opacity:.75;min-height:1em;}"
    + ".xplimp-ops{display:flex;flex-direction:column;gap:.3rem;flex:0 0 auto;}"
    + ".xplimp-foot{display:flex;align-items:center;gap:.5rem;margin-top:.6rem;}"
    + "#xplImpModal .pro-post-body{max-height:82vh;overflow-y:auto;}";
  document.head.appendChild(s);
}
function addToolbarButton() {
  var tb = document.querySelector("#explore-app .xpl-toolbar");
  if (!tb || $("xpl-imp-btn")) return;
  var b = document.createElement("button");
  b.type = "button"; b.id = "xpl-imp-btn"; b.className = "xpl-btn";
  b.title = "Import images by URL, upload or drag-drop — prompts included — into your Personal Gallery";
  b.textContent = "📥 Import";
  var load = $("xpl-load");
  if (load && load.parentNode) load.parentNode.insertBefore(b, load);
  else tb.appendChild(b);
  b.addEventListener("click", function() { openImporter(); });
}
function addDropAnywhere() {
  var app = $("explore-app");
  if (!app || app.__xplImpDrop) return;
  app.__xplImpDrop = true;
  var depth = 0;
  app.addEventListener("dragenter", function(e) {
    if (!(e.dataTransfer && Array.prototype.some.call(e.dataTransfer.types || [], function(t) { return t === "Files"; }))) return;
    depth++;
  });
  app.addEventListener("dragleave", function() { depth = Math.max(0, depth - 1); });
  app.addEventListener("dragover", function(e) {
    if (!(e.dataTransfer && Array.prototype.some.call(e.dataTransfer.types || [], function(t) { return t === "Files"; }))) return;
    e.preventDefault();
  });
  app.addEventListener("drop", function(e) {
    if (!(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length)) return;
    var files = Array.prototype.filter.call(e.dataTransfer.files, function(f) { return f && f.type && f.type.indexOf("image/") === 0; });
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    depth = 0;
    addFiles(files);
  }, true);
}
function registerPubMenuAction() {
  if (!window.PubMenu || !window.PubMenu.addAction) return true;
  try {
    window.PubMenu.addAction({
      id: "import-personal",
      icon: "📥",
      label: "Import to Personal Gallery",
      run: function(item) {
        quickImport({ url: item.url, prompt: item.prompt || "", title: item.title || "" }, null);
      }
    });
  } catch (e) {}
  return true;
}
function boot() {
  injectCss();
  addToolbarButton();
  addDropAnywhere();
  var n = 0;
  (function waitMenu() {
    if (registerPubMenuAction()) return;
    if (++n < 40) setTimeout(waitMenu, 500);
  })();
  window.__exploreImporterReady = true;
}
window.__exploreImporterOpen = function(items) { openImporter(items); };
window.__exploreImporterAdd = function(items) { if (!modalOpen) openImporter(items); else addToQueue(items); };
if (document.getElementById("explore-app")) boot();
else document.addEventListener("DOMContentLoaded", boot);
})();
