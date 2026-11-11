(function() {
  "use strict";
  const GALLERY_LS_KEY = "t2iGalleryItems";
  const AUTOSAVE_LS_KEY = "t2iGalleryAutoSave";
  const AUTOFOLDER_LS_KEY = "t2iGalleryAutoFolderByName";
  const GALLERY_LOCAL_MAX = 5000;
  const GALLERY_CLOUD_PUSH_MAX = 3000;
  const GALLERY_CLOUD_FILE_MAX = 5 * 1024 * 1024;
  const GALLERY_HIDDEN_KEY = "t2iGalleryHidden";
  const GALLERY_CLOUD_STATS_KEY = "t2iGalleryCloudStats";
  const GALLERY_UNDO_MAX = 15;

  // ---------- storage ----------
  // The full base64 `dataUrl` used to be stored per item purely for dedup, which
  // blew through the ~5MB localStorage quota after ~22 images (~220KB each) and made
  // every later save silently fail. Rendering only ever uses `url`, so we persist a
  // tiny hash of the dataUrl instead (`dh`) and compact legacy items on save.
  function phash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0; return h.toString(36); }
  function itemDedupKey(g) { return g.dh || (g.dataUrl ? phash(g.dataUrl) : null); }
  function getGallery() {
    try { return JSON.parse(localStorage[GALLERY_LS_KEY] || "[]"); } catch(e) { console.error(e); return []; }
  }
  function saveGallery(arr) {
    try {
      let compact = (arr.slice(0, GALLERY_LOCAL_MAX) || []).map(function(g) {
        if (!g) return g;
        let dh = itemDedupKey(g);
        if (dh && !g.dataUrl) return g; // already compact
        let c = { url: g.url, dh: dh || null, prompt: g.prompt || "", title: g.title || "", folder: g.folder || "", timestamp: g.timestamp || Date.now() };
        if (g.fav) c.fav = true;
        if (g.tags && g.tags.length) c.tags = g.tags.slice(0, 24);
        return c;
      });
      localStorage[GALLERY_LS_KEY] = JSON.stringify(compact);
    } catch(e) { console.error(e); }
    scheduleGalleryCloudSync();
  }

  // ---------- tombstones ("hidden" images) + undo history ----------
  // Deleting a gallery image moves a small tombstone into `t2iGalleryHidden` so the 🙈 hidden
  // viewer can restore it (a recycle bin). Deletions/moves also snapshot the whole gallery so
  // the ↩️ undo button can roll them back within the session.
  function getHidden() {
    try { let a = JSON.parse(localStorage[GALLERY_HIDDEN_KEY] || "[]"); return Array.isArray(a) ? a : []; } catch(e) { return []; }
  }
  function saveHidden(arr) {
    try {
      let compact = (arr.slice(0, 2000) || []).map(function(h) {
        if(!h || !h.url) return null;
        let c = { url: h.url, prompt: h.prompt || "", title: h.title || "", folder: h.folder || "", timestamp: h.timestamp || Date.now(), hiddenAt: h.hiddenAt || Date.now() };
        if (h.fav) c.fav = true;
        if (h.tags && h.tags.length) c.tags = h.tags.slice(0, 24);
        if (h.origin) c.origin = h.origin; // keeps locally-hidden chat images identified
        return c;
      }).filter(Boolean);
      localStorage[GALLERY_HIDDEN_KEY] = JSON.stringify(compact);
    } catch(e) { console.error(e); }
  }
  function addHidden(items) {
    let h = getHidden();
    let seen = new Set(h.map(x => x.url));
    let added = 0;
    for(let it of items) {
      if(!it || !it.url || seen.has(it.url)) continue;
      h.unshift({ url: it.url, prompt: it.prompt || "", title: it.title || "", folder: it.folder || "", timestamp: it.timestamp || Date.now(), fav: !!it.fav, tags: (it.tags || []).slice(0, 24), hiddenAt: Date.now(), origin: it.origin || undefined });
      seen.add(it.url); added++;
    }
    if(added) saveHidden(h);
    return added;
  }
  function removeHidden(urls) {
    let set = new Set(urls);
    let h = getHidden();
    let kept = h.filter(x => !set.has(x.url));
    if(kept.length !== h.length) saveHidden(kept);
    return h.length - kept.length;
  }
  let galleryUndoStack = [];
  function pushGalleryUndo(label) {
    try {
      galleryUndoStack.push({ label: label || "change", gallery: JSON.parse(JSON.stringify(getGallery())), hidden: getHidden(), ts: Date.now() });
      while(galleryUndoStack.length > GALLERY_UNDO_MAX) galleryUndoStack.shift();
    } catch(e) {}
  }
  function popGalleryUndo() {
    let s = galleryUndoStack.pop();
    if(!s) return null;
    saveGallery(s.gallery);
    saveHidden(s.hidden);
    updateGalleryButtonCount();
    return s;
  }
  function galleryUndoCount() { return galleryUndoStack.length; }

  // ---------- cross-site cloud gallery (shared with the chat generator at bigger-and-better-ai-chat) ----------
  // The actual images already live on user.uploads.dev. The gallery *index* is mirrored to an
  // editable file in THIS generator's namespace (writable only from here), and the chat site's own
  // editable file is read as a display-only "peer" gallery. Links between the two sites hand the
  // file URLs over via ?galleryFile=, so each site can read the other's index (cross-site writes are
  // blocked by the platform, but reads of the public editable URLs work from anywhere).
  const GALLERY_CLOUD_KEY_LS = "t2iGalleryUserKey";
  const GALLERY_CLOUD_EDITKEY_LS = "t2iGalleryEditKey";
  const GALLERY_PEER_LS = "t2iGalleryPeerFile";
  function galleryUserKey() {
    let k = localStorage[GALLERY_CLOUD_KEY_LS];
    if(!k) { k = "g" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10); try { localStorage[GALLERY_CLOUD_KEY_LS] = k; } catch(e) {} }
    return k;
  }
  function galleryCloudFileName() { return "gallery-" + galleryUserKey(); }
  function galleryCloudUrl() { return "https://editable.uploads.dev/file/" + window.generatorName + "/" + galleryCloudFileName(); }
  function galleryCloudEditKey() { return localStorage[GALLERY_CLOUD_EDITKEY_LS] || null; }
  function galleryCloudStripped(arr) {
    return arr.filter(i => i && i.url).map(function(i) {
      let o = { url: i.url, prompt: i.prompt || "", title: i.title || "", folder: i.folder || "", timestamp: i.timestamp || Date.now() };
      if (i.fav) o.fav = true;
      if (i.tags && i.tags.length) o.tags = i.tags.slice(0, 24);
      return o;
    });
  }
  async function galleryCloudSet(name, data, editKey) {
    if(!(window.root && root.uploadPlugin && root.uploadPlugin.editable)) return { error: "no_plugin" };
    try { return await root.uploadPlugin.editable.set(name, data, editKey ? { editKey: editKey } : {}); }
    catch(e) { return { error: "threw" }; }
  }
  async function galleryCloudGet(url) {
    let r = await fetch(url);
    if(r.status === 404) return null;
    if(!r.ok) throw new Error("HTTP " + r.status);
    return await r.text();
  }
  let galleryCloudTimer = null;
  function scheduleGalleryCloudSync() {
    if(galleryCloudTimer) clearTimeout(galleryCloudTimer);
    galleryCloudTimer = setTimeout(pushGalleryToCloud, 1500);
  }
  let galleryCloudPushing = false;
  async function pushGalleryToCloud() {
    if(galleryCloudPushing) return;
    galleryCloudPushing = true;
    try {
      let own = galleryCloudStripped(getGallery()).slice(0, GALLERY_CLOUD_PUSH_MAX);
      let payload = JSON.stringify(own);
      try { localStorage[GALLERY_CLOUD_STATS_KEY] = JSON.stringify({ bytes: payload.length, count: own.length, total: getGallery().length, ts: Date.now() }); } catch(e) {}
      let editKey = galleryCloudEditKey();
      let r;
      if(editKey) {
        r = await galleryCloudSet(galleryCloudFileName(), payload, editKey);
      } else {
        r = await galleryCloudSet(galleryCloudFileName(), payload);
        if(r && !r.error && r.editKey) { try { localStorage[GALLERY_CLOUD_EDITKEY_LS] = r.editKey; } catch(e) {} }
      }
      if(r && r.error && /edit_key|unauthorized|forbidden/i.test(r.error)) {
        // editKey lost (e.g. localStorage cleared) -> start a fresh file so saves keep working
        let fresh = await galleryCloudSet(galleryCloudFileName() + "-" + Math.random().toString(36).slice(2, 8), payload);
        if(fresh && !fresh.error && fresh.editKey) { try { localStorage[GALLERY_CLOUD_EDITKEY_LS] = fresh.editKey; } catch(e) {} }
      }
    } catch(e) { console.warn("gallery cloud sync:", e); }
    finally { galleryCloudPushing = false; }
    try { let m = document.getElementById("t2iGalleryModal"); if(m && m._capWarn) m._capWarn(); } catch(e) {}
  }
  async function ensureGalleryCloud() {
    try {
      if(!galleryCloudEditKey()) {
        let r = await galleryCloudSet(galleryCloudFileName(), JSON.stringify(galleryCloudStripped(getGallery()).slice(0, 3000)));
        if(r && !r.error && r.editKey) { try { localStorage[GALLERY_CLOUD_EDITKEY_LS] = r.editKey; } catch(e) {} return; }
      }
      if(getGallery().length === 0) { // seed from cloud (e.g. opened on a new browser)
        let text = await galleryCloudGet(galleryCloudUrl());
        if(text) { try { let arr = JSON.parse(text); if(Array.isArray(arr) && arr.length) saveGallery(arr); } catch(e) {} }
      }
    } catch(e) { console.warn("gallery cloud ensure:", e); }
  }
  // ---- peer galleries (connected sites, e.g. bigger-and-better-ai-chat) — display-only union ----
  // Compatible with bigger-and-better-ai-chat's filtering mechanism: every entry merged from a
  // connected site is tagged with a stable source id `peerSourceId(url)` ("<generator>/<file>",
  // e.g. "bigger-and-better-ai-chat/chatgallery-abc123") stored as `origin`. Own entries never
  // carry `origin`, so the 🌐 source filter (all / here / connected sites) separates site images
  // with the same semantics as the chat app (here = !origin, peer = !!origin).
  const GALLERY_PEERS_LS = "t2iGalleryPeerFiles";
  let peerGalleryCache = null;
  function peerSourceId(url) {
    try {
      var parts = new URL(url).pathname.split("/").filter(Boolean);
      if(parts.length >= 3 && parts[0] === "file") return parts[1] + "/" + parts[2];
    } catch(e) {}
    return String(url || "");
  }
  function readPeers() {
    let arr = [];
    try { arr = JSON.parse(localStorage[GALLERY_PEERS_LS] || "[]"); } catch(e) {}
    if(!Array.isArray(arr)) arr = [];
    let legacy = null;
    try { legacy = localStorage[GALLERY_PEER_LS] || null; } catch(e) {}
    if(legacy && arr.indexOf(legacy) === -1) arr.push(legacy);
    if(legacy) { try { localStorage.removeItem(GALLERY_PEER_LS); } catch(e) {} }
    return arr.filter(function(u) { return !!u; });
  }
  function writePeers(arr) {
    let uniq = [], seen = {};
    (arr || []).forEach(function(u) { if(u && !seen[u]) { seen[u] = 1; uniq.push(u); } });
    try { localStorage[GALLERY_PEERS_LS] = JSON.stringify(uniq); } catch(e) {}
  }
  function addPeer(url) {
    if(!url) return false;
    let arr = readPeers();
    if(arr.indexOf(url) === -1) { arr.push(url); writePeers(arr); return true; }
    return false;
  }
  function removePeer(url) {
    writePeers(readPeers().filter(function(u) { return u !== url; }));
  }
  function getPeerGalleryUrl() { let p = readPeers(); return p.length ? p[0] : null; }
  function getPeerGalleryUrls() { return readPeers(); }
  // Accept exactly what the chat site's own "connect" box accepts, so a link copied from either
  // site works in the other: a bare editable-file URL (https://editable.uploads.dev/file/…) or any
  // site link that carries one in a ?galleryFile= param (e.g. a chat share link). Returns null when
  // the input holds neither.
  function extractPeerFile(raw) {
    let s = String(raw || "").trim();
    if(!s) return null;
    try {
      let u = new URL(s);
      let p = u.searchParams.get("galleryFile");
      if(p) return extractPeerFile(p); // the param may itself be a full link
      if(u.hostname === "editable.uploads.dev" && /^\/file\/.+/.test(u.pathname)) return u.href;
    } catch(e) {}
    let m = s.match(/https:\/\/editable\.uploads\.dev\/file\/[^\s"'<>]+/);
    return m ? m[0] : null;
  }
  function adoptPeerGalleryFromUrl() {
    try {
      let p = extractPeerFile(new URLSearchParams(location.search).get("galleryFile"));
      if(p) { addPeer(p); return true; }
    } catch(e) {}
    return false;
  }
  async function loadPeerGallery() {
    let urls = readPeers();
    if(!urls.length) { peerGalleryCache = null; return; }
    let all = [], seen = new Set();
    try { getGallery().forEach(function(g) { if(g && g.url) seen.add(g.url); }); } catch(e) {}
    try { getHidden().forEach(function(h) { if(h && h.url) seen.add(h.url); }); } catch(e) {}
    let ownUrls = new Set();
    try { ownUrls = new Set(getGallery().map(function(g) { return g && g.url; }).filter(Boolean)); } catch(e) {}
    for(let url of urls) {
      try {
        let text = await galleryCloudGet(url);
        if(!text) continue;
        let arr = JSON.parse(text);
        if(!Array.isArray(arr)) continue;
        let origin = peerSourceId(url);
        for(let p of arr) {
          if(!p || !p.url || seen.has(p.url) || ownUrls.has(p.url)) continue;
          seen.add(p.url);
          let copy = { url: p.url, prompt: p.prompt || "", title: p.title || "", folder: p.folder || "", timestamp: p.timestamp || Date.now(), origin: origin };
          if(p.charName) copy.charName = p.charName;
          if(p.seed !== undefined) copy.seed = p.seed;
          if(p.fav) copy.fav = true;
          if(Array.isArray(p.tags) && p.tags.length) copy.tags = p.tags.slice(0, 24);
          all.push(copy);
        }
      } catch(e) {}
    }
    peerGalleryCache = { items: all, fetchedAt: Date.now(), peerCount: urls.length };
  }
  function peerGalleryAvailable() { return !!(peerGalleryCache && peerGalleryCache.items); }
  function getAutoSaveSetting() {
    let v = localStorage[AUTOSAVE_LS_KEY];
    if(v === undefined || v === null) return true; // default ON
    return v === "1";
  }
  function setAutoSaveSetting(val) {
    try { localStorage[AUTOSAVE_LS_KEY] = val ? "1" : "0"; } catch(e) {}
  }
  // ---------- auto-folder by "Image name" ----------
  // Toggleable feature: when ON, every image saved from a generation is filed into a folder named
  // after that generation's 🏷️ "Image name" input — the folder is created the first time it's needed,
  // i.e. the moment the first image of that generation is saved. Images saved without an
  // "Image name" (and images from tools that don't set one) stay unfiled, exactly as before.
  function getAutoFolderSetting() {
    let v = localStorage[AUTOFOLDER_LS_KEY];
    if(v === undefined) return true; // default ON
    return v === "1";
  }
  function setAutoFolderSetting(val) {
    try { localStorage[AUTOFOLDER_LS_KEY] = val ? "1" : "0"; } catch(e) {}
  }
  // The raw value of the 🏷️ "Image name" field. `window.input.imgName` is the t2i-framework's live
  // mirror of that box (the very same value the pjs `saveTitle` is built from); the DOM lookup is a
  // fallback for the moment before the framework wires the field up.
  function currentImageNameValue() {
    let v = window.input ? window.input.imgName : "";
    if(v === undefined || v === null || v === "") {
      let el = document.querySelector('[data-name="imgName"]');
      if(el && typeof el.value === "string") v = el.value;
    }
    return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  }
  // What folder should a *fresh* save land in? An image is only auto-filed when its own title IS the
  // raw "Image name" — i.e. the user actually named this generation. That equality guard is what
  // makes the feature safe: an unnamed generation's title is the "(art style) description" fallback
  // (never filed), and a stale/renamed field can never drag an old image into the wrong folder.
  let generationImageName = ""; // snapshot taken when the generate button is pressed (see addButtons)
  function autoFolderForSave(title) {
    if(!getAutoFolderSetting()) return "";
    let t = String(title == null ? "" : title).replace(/\s+/g, " ").trim();
    if(!t) return "";
    let live = currentImageNameValue();
    for(let cand of [generationImageName, live]) if(cand && cand === t) return normalizeFolderName(cand);
    return "";
  }
  function normalizeFolderName(name) {
    let s = String(name || "").trim().replace(/\s+/g, " ");
    return s.slice(0, 60);
  }
  function getGalleryFolders(gallery) {
    let seen = new Map();
    for(let item of gallery || []) {
      let f = normalizeFolderName(item.folder);
      if(!f) continue;
      let k = f.toLowerCase();
      if(!seen.has(k)) seen.set(k, f);
    }
    return [...seen.values()];
  }
  function matchFolder(entryFolder, folder) {
    return normalizeFolderName(entryFolder).toLowerCase() === String(folder || "").trim().toLowerCase();
  }
  function sanitizeHtml(text) {
    if(text === undefined || text === null) text = "";
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  // ---------- upload queue (serialize full-size gallery saves to avoid "another_upload_in_progress") ----------
  let uploadQueue = Promise.resolve();
  let uploadsInFlight = new Set();
  function cloudUploadBlob(blob, opts) {
    let expires = (opts && opts.expires) || (Date.now() + 1000*60*60*24*365);
    let attempt = () => root.uploadPlugin(blob, {expires});
    let p = uploadQueue.then(attempt).catch(attempt); // one retry on failure
    uploadQueue = p.then(() => {}, () => {});
    return p;
  }
  // tiny throwaway check-thumbnails can upload in parallel (verified: concurrent uploads work fine) —
  // capped so we never hammer the upload host all at once.
  let parallelUploadsInFlight = 0;
  const MAX_PARALLEL_UPLOADS = 4;
  function parallelUploadBlob(blob, opts) {
    return (async function() {
      while(parallelUploadsInFlight >= MAX_PARALLEL_UPLOADS) await new Promise(r => setTimeout(r, 30));
      parallelUploadsInFlight++;
      try {
        let attempt = () => root.uploadPlugin(blob, {expires: (opts && opts.expires) || (Date.now() + 1000*60*60*24*365)});
        return await attempt().catch(attempt); // one retry on failure
      } finally {
        parallelUploadsInFlight--;
      }
    })();
  }
  async function uploadImage(dataUrl, opts) {
    if(window.__t2iGalleryTestMode) { await new Promise(r => setTimeout(r, 20)); return "https://test.invalid/" + Math.random().toString(36).slice(2) + ".jpg"; }
    if(!(window.root && root.uploadPlugin)) {
      console.warn("t2i gallery: upload-plugin not found. Add  uploadPlugin = {import:upload-plugin}  to main.pjs.");
      return null;
    }
    let key = dataUrl.slice(0, 80);
    if(uploadsInFlight.has(key)) return null;
    uploadsInFlight.add(key);
    try {
      let blob = await fetch(dataUrl).then(r => r.blob());
      let result = (opts && opts.parallel) ? await parallelUploadBlob(blob, opts) : await cloudUploadBlob(blob, opts);
      if(result && !result.error && result.url) return result.url;
      console.warn("t2i gallery upload failed:", result && result.error);
      return null;
    } catch(e) {
      console.warn("t2i gallery upload threw:", e);
      return null;
    } finally {
      uploadsInFlight.delete(key);
    }
  }
  // ---------- thumbnail downscale: the NSFW check runs on a tiny ~256px JPEG so the
  // verdict arrives as fast as possible (the moderation classifier is content-based,
  // so downscaling doesn't change the result) ----------
  function makeThumbnail(dataUrl, maxSize) {
    maxSize = maxSize || 256;
    return new Promise(resolve => {
      if (/^data:video\//i.test(String(dataUrl || ""))) {
        if (window.AvatarMedia) { window.AvatarMedia.videoPoster(dataUrl, maxSize).then(resolve, function () { resolve(""); }); return; }
        resolve("");
        return;
      }
      let img = new Image();
      img.onload = function() {
        try {
          let scale = Math.min(1, maxSize / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
          let w = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
          let h = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
          let c = document.createElement("canvas");
          c.width = w; c.height = h;
          let ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL("image/jpeg", 0.7));
        } catch(e) { resolve(dataUrl); }
      };
      img.onerror = function() { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }
  async function uploadThumbnail(dataUrl) {
    let thumb = await makeThumbnail(dataUrl);
    return await uploadImage(thumb, {parallel: true, expires: Date.now() + 1000*60*60*24}); // 1-day throwaway file
  }

  function galleryEntryFrom(dataUrl, prompt, title, folder) {
    return { url: "", dataUrl, prompt: prompt || "", title: title || "", folder: autoFolderForSave(title) || folder || "", timestamp: Date.now() };
  }
  let lastSavedFolder = ""; // folder of the most recent save (used by the toast messages)
  function autoFolderToastSuffix() { return lastSavedFolder ? " · 📂 " + lastSavedFolder : ""; }
  // A brand-new folder created by an auto-folder save should appear in the folder list right away,
  // even while the gallery modal is open (so you can jump straight to the generation's images).
  function notifyGalleryFolders() {
    try { let m = document.getElementById("t2iGalleryModal"); if(m && m._refreshFolders) m._refreshFolders(); } catch(e) {}
  }
  async function addImageToGallery(dataUrl, prompt, title, folderOverride) {
    if(!dataUrl) return null;
    let dh = phash(dataUrl);
    let gallery = getGallery();
    if(gallery.some(g => itemDedupKey(g) === dh)) return null; // already saved this exact image
    let url = await uploadImage(dataUrl);
    if(!url) return null;
    let folder = (folderOverride ? normalizeFolderName(folderOverride) : "") || autoFolderForSave(title);
    gallery = getGallery().filter(g => itemDedupKey(g) !== dh);
    gallery.unshift({ url, dh, prompt: prompt || "", title: title || "", folder, timestamp: Date.now() });
    saveGallery(gallery);
    updateGalleryButtonCount();
    lastSavedFolder = folder;
    if(folder) notifyGalleryFolders();
    return url;
  }
  function addImageWithUrl(url, dataUrl, prompt, title, folderOverride) {
    if(!url || !dataUrl) return null;
    let dh = phash(dataUrl);
    let gallery = getGallery();
    if(gallery.some(g => itemDedupKey(g) === dh)) return url; // already saved this exact image
    let folder = (folderOverride ? normalizeFolderName(folderOverride) : "") || autoFolderForSave(title);
    gallery.unshift({ url, dh, prompt: prompt || "", title: title || "", folder, timestamp: Date.now() });
    saveGallery(gallery);
    updateGalleryButtonCount();
    lastSavedFolder = folder;
    if(folder) notifyGalleryFolders();
    return url;
  }

  // ---------- NSFW filter ----------
  const NSFW_LS_KEY = "t2iNsfwFilter";
  function getNsfwFilterSetting() { let v = localStorage[NSFW_LS_KEY]; return v !== "0"; } // default ON (PG-13 censor active)
  function setNsfwFilterSetting(v) { try { localStorage[NSFW_LS_KEY] = v ? "1" : "0"; } catch(e) {} }
  let nsfwCheckCache = new Map(); // url -> true/false/null (per session)
  async function checkNsfw(url) {
    if(!url) return null;
    if(nsfwCheckCache.has(url)) return nsfwCheckCache.get(url);
    let result = null;
    try {
      let info = await fetch("https://upload.perchance.org/api/fileInfo?url=" + encodeURIComponent(url)).then(r => r.json());
      result = !!(info && info.tags && info.tags.includes("nsfw"));
    } catch(e) {
      console.warn("t2i nsfw check failed:", e);
      result = null;
    }
    nsfwCheckCache.set(url, result);
    return result;
  }
  function applyCensor(host) {
    if(!host || host.querySelector(".t2i-nsfw-overlay")) return;
    if(host.style) host.style.position = "relative";
    let overlay = document.createElement("div");
    overlay.className = "t2i-nsfw-overlay";
    overlay.style.cssText = "position:absolute; inset:0; z-index:2; display:flex; align-items:center; justify-content:center; background:rgba(15,15,15,0.5); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); cursor:pointer; color:#fff; flex-direction:column; gap:0.2rem;";
    overlay.innerHTML = '<span style="font-size:2rem; line-height:1;">🔞</span><span style="font-size:75%; opacity:0.9;">NSFW hidden</span><span style="font-size:65%; opacity:0.6;">tap to view</span>';
    overlay.addEventListener("click", function() { overlay.remove(); });
    host.appendChild(overlay);
    let saveBtn = host.querySelector(".t2i-save-btn");
    if(saveBtn) saveBtn.remove();
    let badge = host.querySelector(".t2i-cloud-badge");
    if(badge) badge.remove();
  }

  // ---------- tie the 🔞 toggle to the framework's original public-gallery filter ----------
  // The embedded public gallery (from text-to-image-plugin) has its own `contentFilter`
  // (main.pjs: galleryOptions.contentFilter = pg13). We make it follow the 🔞 toggle:
  // ON → pg13 (filtered), OFF → none (unrestricted). The plugin itself only passes
  // pg13/g through (it coerces 'none' → 'g'), so once the gallery iframe exists we set
  // the server-side contentFilter=none explicitly.
  function publicGalleryContentFilter() {
    return getNsfwFilterSetting() ? "pg13" : "none";
  }
  function patchPublicGalleryFilter() {
    let iframe = document.querySelector('#imageGalleryCtn8569284 .text-to-image-plugin-gallery');
    if(!iframe) return false;
    let url;
    try { url = new URL(iframe.src); } catch(e) { return false; }
    let cf = publicGalleryContentFilter();
    if(url.searchParams.get("contentFilter") === cf) return true;
    url.searchParams.set("contentFilter", cf);
    iframe.src = url.href;
    try {
      let opts = JSON.parse(decodeURIComponent(iframe.dataset.galleryOptions || "{}"));
      opts.contentFilter = getNsfwFilterSetting() ? "pg13" : "g"; // the value the plugin itself would store
      iframe.dataset.galleryOptions = encodeURIComponent(JSON.stringify(opts));
    } catch(e) {}
    return true;
  }
  function watchPublicGallery() {
    let s = window.___userSettings746291937;
    if(s && s.galleryOptions) s.galleryOptions.contentFilter = publicGalleryContentFilter(); // keep the settings source-of-truth in sync
    patchPublicGalleryFilter();
    if(window.__t2iWatchingGallery) return;
    window.__t2iWatchingGallery = true;
    window.__t2iWatchTries = 0;
    let tryAttach = function() {
      let ctn = document.getElementById("imageGalleryCtn8569284");
      if(!ctn) { if(++__t2iWatchTries < 120) setTimeout(tryAttach, 500); return; }
      let mo = new MutationObserver(function() { patchPublicGalleryFilter(); });
      mo.observe(ctn, {childList: true, subtree: true});
    };
    tryAttach();
  }

  // ---------- toast ----------
  let toastTimer = null;
  function toast(msg) {
    let el = document.getElementById("t2iGalleryToast");
    if(!el) {
      el = document.createElement("div");
      el.id = "t2iGalleryToast";
      el.style.cssText = "position:fixed; bottom:3.5rem; left:50%; transform:translateX(-50%); z-index:100000; background:rgba(0,0,0,0.85); color:#fff; padding:0.4rem 0.8rem; border-radius:6px; font-size:85%; opacity:0; transition:opacity 200ms; pointer-events:none;";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.opacity = "0"; }, 1800);
  }
  // undoable toast: same look, plus an ↩️ undo button that rolls back the last gallery change
  let toastUndoTimer = null;
  function toastUndo(msg) {
    let el = document.getElementById("t2iGalleryToastUndo");
    if(!el) {
      el = document.createElement("div");
      el.id = "t2iGalleryToastUndo";
      el.style.cssText = "position:fixed; bottom:3.5rem; left:50%; transform:translateX(-50%); z-index:100002; background:rgba(0,0,0,0.88); color:#fff; padding:0.4rem 0.7rem; border-radius:6px; font-size:85%; opacity:0; transition:opacity 200ms; display:flex; align-items:center; gap:0.6rem; max-width:92vw;";
      document.body.appendChild(el);
    }
    el.innerHTML = "";
    let t = document.createElement("span");
    t.textContent = msg;
    el.appendChild(t);
    let b = document.createElement("button");
    b.type = "button";
    b.textContent = "↩️ undo";
    b.style.cssText = "cursor:pointer; font-size:90%; padding:0.1rem 0.4rem; border:1px solid #888; border-radius:4px; background:rgba(255,255,255,0.14); color:#fff;";
    b.addEventListener("click", function() { el.style.opacity = "0"; applyUndo(); });
    el.appendChild(b);
    el.style.opacity = "1";
    clearTimeout(toastUndoTimer);
    toastUndoTimer = setTimeout(function() { el.style.opacity = "0"; }, 6000);
  }
  // roll back the most recent gallery change and refresh the modal if it's open
  function applyUndo() {
    let s = popGalleryUndo();
    if(!s) return false;
    let m = document.getElementById("t2iGalleryModal");
    if(m && m._render) m._render();
    toast("↩️ undid: " + s.label);
    return true;
  }

  // ---------- per-image handlers ----------
  // NOTE: these buttons live in a row BELOW the image (never overlaying it) because the
  // image embed itself draws its own buttons in all four corners of the image, and an
  // overlay would block them.
  function customActionsCtn(host) {
    if(!host) return null;
    let ctn = host.querySelector(".t2i-custom-actions");
    if(ctn) return ctn;
    ctn = document.createElement("div");
    ctn.className = "t2i-custom-actions";
    let ref = host.querySelector(".t2i-under-each-image-ctn");
    let iframe = host.querySelector("iframe");
    if(ref) ref.parentNode.insertBefore(ctn, ref);
    else if(iframe && iframe.parentNode) iframe.parentNode.insertBefore(ctn, iframe.nextSibling);
    else host.appendChild(ctn);
    return ctn;
  }
  function addBadge(host) {
    if(!host || host.querySelector(".t2i-cloud-badge")) return;
    let badge = document.createElement("span");
    badge.className = "t2i-cloud-badge";
    badge.textContent = "☁️";
    badge.title = "saved to online gallery";
    customActionsCtn(host).appendChild(badge);
  }
  function addSaveButton(host, dataUrl, prompt, title) {
    if(!host) return;
    let btn = host.querySelector(".t2i-save-btn");
    if(!btn) {
      btn = document.createElement("button");
      btn.className = "t2i-save-btn";
      btn.textContent = "💾 gallery";
      btn.title = "Save this image to your online gallery";
      btn.addEventListener("click", async function() {
        let url = await addImageToGallery(btn._dataUrl, btn._prompt, btn._title);
        if(!url) { toast("⚠️ could not save image"); return; }
        btn.textContent = "✅ saved";
        setTimeout(() => btn.remove(), 1200);
        addBadge(host);
        toast("☁️ image saved to gallery " + Quip.q("galSaved", "— framed and hung") + autoFolderToastSuffix());
      });
      customActionsCtn(host).appendChild(btn);
    }
    btn._dataUrl = dataUrl;
    btn._prompt = prompt || "";
    btn._title = title || "";
  }
  function addMenuButton(host, dataUrl, prompt, title) {
    if(!host || !window.PubMenu) return;
    let btn = host.querySelector(":scope > .pubmenu-btn");
    if(!btn) {
      try { if(getComputedStyle(host).position === "static") host.style.position = "relative"; } catch(e) {}
      btn = window.PubMenu.button({url: dataUrl, prompt: prompt || "", title: title || ""});
      host.appendChild(btn);
    }
    btn._item = { url: dataUrl, prompt: prompt || "", title: title || "",
      view: function() {
        try {
          let w = window.open(dataUrl, "_blank", "noopener");
          if(!w) toast("⚠️ popup blocked — use ⬇ Download from the ⋯ menu instead");
        } catch(e) { toast("⚠️ could not open image"); }
      } };
    makeThumbnail(dataUrl, 128).then(function(t) {
      if(btn._item && btn._item.url === dataUrl) btn._item.thumb = t;
    }).catch(function() {});
  }
  function rerollSrc(src) {
    try {
      let u = new URL(src);
      if(u.hash) {
        let obj = JSON.parse(decodeURIComponent(u.hash.slice(1)));
        obj.requestId = Math.random().toString(); // fresh request → new image (server may cache by requestId)
        obj.seed = Math.floor(Math.random() * 2147483647); // random seed → guaranteed different result
        u.hash = encodeURIComponent(JSON.stringify(obj));
        return u.href;
      }
    } catch(e) {}
    return src;
  }
  function addRerollButton(host, iframe) {
    if(!host || !iframe || host.querySelector(".t2i-reroll-btn")) return;
    let btn = document.createElement("button");
    btn.className = "t2i-reroll-btn";
    btn.textContent = "🔄";
    btn.title = "Reroll: generate a new version of this image. The new version is saved to your gallery too.";
    btn.addEventListener("click", function() {
      let src = iframe.getAttribute("src");
      if(!src) { toast("⚠️ image not ready to reroll yet"); return; }
      btn.textContent = "⏳";
      setTimeout(() => { btn.textContent = "🔄"; }, 8000);
      try {
        if(typeof iframe.reload === "function") iframe.reload();
        else {
          let fresh = rerollSrc(src);
          iframe.src = "";
          setTimeout(() => { iframe.src = fresh; }, 700);
        }
      } catch(e) { console.warn("t2i reroll:", e); btn.textContent = "🔄"; }
    });
    customActionsCtn(host).appendChild(btn);
  }
  async function autoSaveImage({dataUrl, prompt, title, iframe}) {
    try {
      if(!dataUrl) return;
      let url = await addImageToGallery(dataUrl, prompt, title);
      if(!url) return;
      let host = iframe && iframe.closest ? (iframe.closest(".t2i-image-ctn") || iframe) : null;
      addBadge(host);
      toast("☁️ image saved to gallery " + Quip.q("galSaved", "— framed and hung") + autoFolderToastSuffix());
    } catch(e) {
      console.warn("t2i gallery autoSave:", e);
    }
  }
  async function runNsfwCheck({dataUrl, prompt, title, iframe, host}) {
    if(!dataUrl) return;
    try {
      // 1. upload a tiny ~256px thumbnail and check THAT first — the verdict arrives in
      //    ~1s instead of waiting for the full-size PNG upload (which can take seconds)
      let thumbUrl = await uploadThumbnail(dataUrl);
      if(!thumbUrl) return; // thumb upload failed → nothing to check, nothing can be saved either way
      let isNsfw = await checkNsfw(thumbUrl);
      if(isNsfw === true) {
        applyCensor(host);
        toast("🔞 NSFW image hidden");
        return;
      }
      // 2. clean → only now upload the full-size image for the gallery
      //    (bonus: NSFW images never leave the device at full size)
      if(getAutoSaveSetting()) {
        let url = await uploadImage(dataUrl);
        if(url) {
          addImageWithUrl(url, dataUrl, prompt, title);
          addBadge(host);
          toast("☁️ image saved to gallery " + Quip.q("galSaved", "— framed and hung") + autoFolderToastSuffix());
        }
      }
    } catch(e) {
      console.warn("t2i nsfw filter:", e);
    }
  }
  function handleImageFinished(outputData) {
    if(!outputData) return;
    let dataUrl = outputData.dataUrl;
    let iframe = outputData.iframe;
    let prompt = outputData.inputs && outputData.inputs.prompt;
    let title = outputData.inputs && outputData.inputs.saveTitle;
    let host = iframe && iframe.closest ? (iframe.closest(".t2i-image-ctn") || iframe) : null;
    addSaveButton(host, dataUrl, prompt, title); // always offer manual save
    addRerollButton(host, iframe); // always offer reroll (regenerated versions get saved too)
    addMenuButton(host, dataUrl, prompt, title); // ⋯ popup: view / send / copy / download
    if(prompt && getAutokeepSetting()) addKeptPrompt(prompt); // keep every prompt used (copyable list)
    if(getNsfwFilterSetting()) {
      runNsfwCheck({dataUrl, prompt, title, iframe, host}); // censor + save-if-clean (independent of autosave)
    } else if(getAutoSaveSetting()) {
      autoSaveImage({dataUrl, prompt, title, iframe});
    }
  }

  // ---------- save every generated image currently on the page ----------
  async function saveAllOnPage() {
    let hosts = [...document.querySelectorAll(".t2i-image-ctn")];
    if(hosts.length === 0) { toast("⚠️ no generated images on the page"); return; }
    let already = new Set(getGallery().map(g => itemDedupKey(g)));
    let added = 0, skipped = 0, pending = 0, failed = 0, censored = 0;
    for(let host of hosts) {
      let iframe = host.querySelector("iframe");
      let out = iframe && iframe.textToImagePluginOutput;
      if(!out || !out.dataUrl) { pending++; continue; }
      let prompt = out.inputs && out.inputs.prompt;
      let title = out.inputs && out.inputs.saveTitle;
      addSaveButton(host, out.dataUrl, prompt, title);
      addRerollButton(host, iframe);
      addMenuButton(host, out.dataUrl, prompt, title);
      if(getNsfwFilterSetting()) {
        let thumbUrl = await uploadThumbnail(out.dataUrl);
        if(!thumbUrl) { failed++; continue; }
        let isNsfw = await checkNsfw(thumbUrl);
        if(isNsfw === true) { censored++; applyCensor(host); continue; }
        if(already.has(phash(out.dataUrl))) { skipped++; continue; }
        let url = await uploadImage(out.dataUrl);
        if(!url) { failed++; continue; }
        addImageWithUrl(url, out.dataUrl, prompt, title);
        added++; already.add(phash(out.dataUrl)); addBadge(host);
      } else {
        if(already.has(phash(out.dataUrl))) { skipped++; continue; }
        let url = await addImageToGallery(out.dataUrl, prompt, title);
        if(url) { added++; already.add(phash(out.dataUrl)); addBadge(host); }
        else failed++;
      }
    }
    updateGalleryButtonCount();
    let m = document.getElementById("t2iGalleryModal");
    if(m && m._render) m._render();
    let parts = [];
    if(added) parts.push("☁️ " + added + " saved");
    if(skipped) parts.push(skipped + " already saved");
    if(censored) parts.push("🔞 " + censored + " censored");
    if(pending) parts.push(pending + " still generating");
    if(failed) parts.push("⚠️ " + failed + " failed");
    toast(parts.length ? parts.join(" · ") : "nothing to save");
  }

  // ---------- hook into the t2i-framework-plugin-v2 ----------
  // NOTE: ___getImageOptions746291937() returns the framework's *shared* imageOptions
  // object (it is mutated in place by the framework itself), so we wrap its onFinish
  // exactly ONCE here — wrapping inside a getImageOptions wrapper would re-wrap the
  // same object every time an image container is rendered, causing handleImageFinished
  // (and addKeptPrompt) to run many times per image.
  let hookAttempts = 0;
  function hookFramework() {
    let settings = window.___userSettings746291937;
    if(!settings || !settings.imageOptions) {
      if(hookAttempts++ < 40) setTimeout(hookFramework, 250);
      return;
    }
    let imageOptions = settings.imageOptions;
    if(imageOptions.__t2iWrappedOnFinish) return;
    imageOptions.__t2iWrappedOnFinish = true;
    let origOnFinish = imageOptions.onFinish;
    imageOptions.onFinish = function(outputData) {
      try { if(origOnFinish) origOnFinish(outputData); } catch(e) { console.warn(e); }
      handleImageFinished(outputData);
    };
  }

  // ---------- buttons under the generate button ----------
  let bootAttempts = 0;
  function addButtons() {
    let genBtn = document.getElementById("generateButtonEl");
    if(!genBtn) {
      if(bootAttempts++ < 40) setTimeout(addButtons, 250);
      return;
    }
    if(document.getElementById("t2iGalleryButton")) return;
    let genRow = genBtn.closest("div");
    let bar = document.createElement("div");
    bar.style.cssText = "display:flex; align-items:center; justify-content:center; gap:0.5rem; margin-top:0.5rem; flex-wrap:wrap;";
    bar.innerHTML = `
      <button id="t2iGalleryButton" title="Open your saved images gallery" style="cursor:pointer; font-size:0.9rem; padding:0.3rem 0.7rem; border-radius:6px; border:1px solid var(--th-border); background:var(--th-surface, #eee);">🖼️ images (<span id="t2iGalleryCount">0</span>)</button>
      <button id="t2iAddImagesBarBtn" title="Add pictures from your device to the gallery" style="cursor:pointer; font-size:0.9rem; padding:0.3rem 0.7rem; border-radius:6px; border:1px solid var(--th-border); background:var(--th-surface, #eee);">➕ add</button>
      <button id="t2iSaveAllBarBtn" title="Manually save every generated image currently on this page to your online gallery (skips ones already saved)" style="cursor:pointer; font-size:0.9rem; padding:0.3rem 0.7rem; border-radius:6px; border:1px solid var(--th-border); background:var(--th-surface, #eee);">💾 save all</button>
      <button id="t2iAutosaveToggle" style="cursor:pointer; font-size:0.9rem; padding:0.3rem 0.7rem; border-radius:6px; border:1px solid var(--th-border); background:var(--th-surface, #eee);">☁️ autosave</button>
      <button id="t2iAutoFolderToggle" title="Auto-folder: file every saved image into a folder named after the generation's 🏷️ Image name — a new folder is created the first time each new name is saved. Images with no Image name are saved unfiled." style="cursor:pointer; font-size:0.9rem; padding:0.3rem 0.7rem; border-radius:6px; border:1px solid var(--th-border); background:var(--th-surface, #eee);">📂 auto-folder</button>
      <button id="t2iNsfwToggle" title="Censor NSFW content: blurs/hides NSFW-generated images and keeps them out of your gallery" style="cursor:pointer; font-size:0.9rem; padding:0.3rem 0.7rem; border-radius:6px; border:1px solid var(--th-border); background:var(--th-surface, #eee);">🔞 NSFW filter</button>
      <button id="t2iBgButton" title="Set an image or video (URL or file) as the page background" style="cursor:pointer; font-size:0.9rem; padding:0.3rem 0.7rem; border-radius:6px; border:1px solid var(--th-border); background:var(--th-surface, #eee);">🎨 background</button>
    `;
    genRow.parentNode.insertBefore(bar, genRow.nextSibling);
    updateGalleryButtonCount();
    updateAutosaveToggle();
    updateNsfwToggle();
    updateAutoFolderControls();
    document.getElementById("t2iAutosaveToggle").addEventListener("click", function() {
      setAutoSaveSetting(!getAutoSaveSetting());
      updateAutosaveToggle();
    });
    document.getElementById("t2iAutoFolderToggle").addEventListener("click", function() {
      setAutoFolderSetting(!getAutoFolderSetting());
      updateAutoFolderControls();
      toast(getAutoFolderSetting() ? "📂 auto-folder: ON — each new 🏷️ Image name becomes its own folder" : "📂 auto-folder: OFF");
    });
    // snapshot the 🏷️ Image name the moment a generation is kicked off, so an image whose title
    // matches it is still filed correctly even if the field is edited while images are rendering
    genBtn.addEventListener("click", function() { generationImageName = currentImageNameValue(); }, true);
    document.getElementById("t2iNsfwToggle").addEventListener("click", function() {
      setNsfwFilterSetting(!getNsfwFilterSetting());
      updateNsfwToggle();
      watchPublicGallery(); // the 🔞 toggle also controls the public gallery's original contentFilter
    });
    document.getElementById("t2iAddImagesBarBtn").addEventListener("click", openAddImagesPicker);
    document.getElementById("t2iSaveAllBarBtn").addEventListener("click", saveAllOnPage);
    document.getElementById("t2iGalleryButton").addEventListener("click", openGallery);
    document.getElementById("t2iBgButton").addEventListener("click", openBackgroundModal);
    updateBgButtonLabel();
  }
  function updateAutosaveToggle() {
    let b = document.getElementById("t2iAutosaveToggle");
    if(!b) return;
    let on = getAutoSaveSetting();
    b.textContent = on ? "☁️ autosave: ON" : "☁️ autosave: OFF";
    b.style.opacity = on ? "1" : "0.55";
  }
  function updateNsfwToggle() {
    let b = document.getElementById("t2iNsfwToggle");
    if(!b) return;
    let on = getNsfwFilterSetting();
    b.textContent = on ? "🔞 NSFW filter: ON" : "🔞 NSFW filter: OFF";
    b.style.opacity = on ? "1" : "0.55";
    b.style.borderColor = on ? "#e55" : "var(--th-border)";
  }
  function updateGalleryButtonCount() {
    let n = getGallery().length;
    let el = document.getElementById("t2iGalleryCount");
    if(el) el.textContent = n;
    let pb = document.getElementById("pro-gallery-btn");
    if(pb) pb.textContent = "🖼️ Saved (" + n + ")";
  }
  // keeps the two auto-folder controls (the generate-bar toggle and the gallery's folder-row
  // checkbox) showing the same state, and is also called when either one is clicked
  function updateAutoFolderControls() {
    let on = getAutoFolderSetting();
    let b = document.getElementById("t2iAutoFolderToggle");
    if(b) {
      b.textContent = on ? "📂 auto-folder: ON" : "📂 auto-folder: OFF";
      b.style.opacity = on ? "1" : "0.55";
    }
    let c = document.getElementById("t2iGalAutoFolderChk");
    if(c) c.checked = on;
  }

  // ---------- manual add ----------
  async function addManualImageBlob(blob, name, note) {
    let dataUrl = await new Promise(r => {
      let fr = new FileReader();
      fr.onload = () => r(fr.result);
      fr.onerror = () => r(null);
      fr.readAsDataURL(blob);
    });
    if(!dataUrl) return null;
    let title = String(name || "").replace(/\.[^.]+$/, "") || "added image";
    return await addImageToGallery(dataUrl, note || "", title);
  }
  let addImagesFileInput = null;
  function openAddImagesPicker() {
    if(!addImagesFileInput) {
      addImagesFileInput = document.createElement("input");
      addImagesFileInput.type = "file";
      addImagesFileInput.accept = "image/*";
      addImagesFileInput.multiple = true;
      addImagesFileInput.style.display = "none";
      document.body.appendChild(addImagesFileInput);
      addImagesFileInput.addEventListener("change", async function() {
        let files = [...addImagesFileInput.files];
        addImagesFileInput.value = "";
        if(files.length === 0) return;
        let note = "";
        try { note = (window.prompt("Optional caption / prompt for these " + files.length + " image(s)?\n(leave empty for none)", "") || "").trim(); } catch(e) {}
        let added = 0, failed = 0;
        for(let file of files) {
          let url = await addManualImageBlob(file, file.name, note);
          if(url) added++; else failed++;
        }
        updateGalleryButtonCount();
        let m = document.getElementById("t2iGalleryModal");
        if(m && m._render) m._render();
        if(added) toast("☁️ " + added + " image" + (added === 1 ? "" : "s") + " " + Quip.q("galAddedMany", "added to gallery — the fridge door grows"));
        else toast("⚠️ could not add image" + (failed ? " (" + failed + " failed)" : ""));
      });
    }
    addImagesFileInput.click();
  }
  window.t2iManualAddImage = addManualImageBlob; // programmatic add (also used for testing)
  // expose gallery functions so other tabs (e.g. Pro Imager) can save & open the same gallery
  window.t2iOpenGallery = openGallery;
  window.t2iAddImageToGallery = addImageToGallery;
  window.t2iAddImageWithUrl = addImageWithUrl;
  window.t2iGetGallery = getGallery;
  // local gallery + the linked chat site's gallery (display-only "chat" entries),
  // de-duplicated by url. Used by the 🧑 Persona Generator tab's importer.
  window.t2iGetGalleryAll = function() {
    let own = getGallery();
    let ownUrls = new Set(own.map(i => i.url));
    let peer = (peerGalleryCache && peerGalleryCache.items) ? peerGalleryCache.items : [];
    return own.concat(peer.filter(i => i && i.url && !ownUrls.has(i.url)));
  };
  window.t2iLoadPeerGallery = loadPeerGallery;
  window.t2iSaveGallery = saveGallery;
  window.t2iGetAutoSave = getAutoSaveSetting;
  window.t2iSetAutoSave = setAutoSaveSetting;
  window.t2iGetAutoFolder = getAutoFolderSetting;
  window.t2iSetAutoFolder = setAutoFolderSetting;
  window.t2iAutoFolderForSave = autoFolderForSave; // "which folder would this title land in?" — used by tests/other tabs
  window.t2iGetNsfwFilter = getNsfwFilterSetting;
  window.t2iUploadImage = uploadImage;
  window.t2iUploadThumbnail = uploadThumbnail;
  window.t2iCheckNsfw = checkNsfw;
  window.t2iUpdateGalleryCount = updateGalleryButtonCount;

  // ---------- gallery modal ----------
  function openGallery(opts) {
    let pick = (opts && opts.pick) || null; // optional: { title, hint, addNoun, onPick(items) } — reuse the real gallery as a chooser
    let existing = document.getElementById("t2iGalleryModal");
    if(existing) existing.remove();
    let overlay = document.createElement("div");
    overlay.id = "t2iGalleryModal";
    overlay.style.cssText = "position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center;";
    let modal = document.createElement("div");
    modal.style.cssText = "position:relative; width:min(1080px, 100%); max-height:100%; background:var(--box-color, #222); color:inherit; border:1px solid var(--th-border); border-radius:8px; display:flex; flex-direction:column; overflow-y:auto;";
    modal.innerHTML = `
      <style>
        #t2iGalleryModal .gal-card { display:inline-block; vertical-align:top; margin:0 0.75rem 0.75rem 0; width:240px; background:var(--box-color,#222); border:1px solid var(--th-border); border-radius:6px; overflow:hidden; }
        #t2iGalleryModal .gal-card img { width:100%; height:200px; object-fit:cover; display:block; background:#000; }
        #t2iGalleryModal .gal-card .info { padding:0.35rem; font-size:75%; word-break:break-word; }
        #t2iGalleryModal .gal-card .buttons { display:flex; flex-wrap:wrap; gap:0.25rem; padding:0.35rem; }
        #t2iGalleryModal .gal-card .buttons button, #t2iGalleryModal .gal-card .buttons a { flex:1; white-space:nowrap; font-size:75%; text-align:center; padding:0.2rem; border:1px solid var(--th-border); border-radius:4px; background:var(--box-color,#eee); color:inherit; text-decoration:none; cursor:pointer; }
        #t2iGalleryModal .gal-card .gal-prompt { max-height:4.5rem; overflow-y:auto; border-top:1px solid rgba(128,128,128,0.25); padding:0.3rem 0.35rem; font-size:72%; opacity:0.92; word-break:break-word; }
        #t2iGalleryModal .gal-card .gal-move-sel { width:calc(100% - 0.7rem); margin:0 0.35rem 0.35rem; font-size:75%; background:var(--box-color,#eee); color:inherit; border:1px solid var(--th-border); border-radius:4px; padding:0.15rem 0.2rem; }
        #t2iGalleryModal .gal-card .gal-move-wrap { display:block; padding:0 0.35rem 0.35rem; font-size:70%; }
        #t2iGalleryModal .gal-card .gal-move-wrap span { display:block; opacity:0.75; margin-bottom:0.15rem; }
        #t2iGalleryModal .gal-card .gal-move-wrap .gal-move-sel { width:100%; margin:0; }
        #t2iGalleryModal .gal-card .gal-star { position:absolute; top:0.25rem; right:0.25rem; z-index:3; background:rgba(0,0,0,0.66); color:#ffd24a; border:1px solid rgba(255,255,255,0.28); border-radius:3px; padding:0.1rem 0.35rem; cursor:pointer; line-height:1; font-size:100%; text-shadow:0 1px 2px rgba(0,0,0,0.7); }
        #t2iGalleryModal .gal-card .gal-star.off { color:#fff; opacity:0.85; }
        #t2iGalleryModal .gal-card .gal-tags { padding:0 0.35rem 0.3rem; display:flex; flex-wrap:wrap; gap:0.2rem; }
        #t2iGalleryModal .gal-card .gal-tag { font-size:66%; padding:0.05rem 0.38rem; border-radius:999px; border:1px solid var(--th-border); background:rgba(128,128,128,0.3); cursor:pointer; }
        #t2iGalleryModal .gal-card img { cursor:zoom-in; }
        #t2iGalleryModal.pick-mode .gal-card img { cursor:pointer; }
        #t2iGalleryModal.pick-mode .gal-card .buttons,
        #t2iGalleryModal.pick-mode .gal-card .gal-move-wrap,
        #t2iGalleryModal.pick-mode .gal-card .gal-star { display:none; }
        #t2iGalleryModal.pick-mode .gal-card { cursor:pointer; }
        #t2iGalleryModal.pick-mode .t2i-gal-row#t2iGalPickBar { flex-wrap:wrap !important; overflow-x:visible !important; }
        #t2iGalleryModal.pick-mode .t2i-gal-row#t2iGalPickBar > #t2iGalPickHint { flex:1 1 100% !important; min-width:0; white-space:normal; overflow-wrap:anywhere; }
        #t2iGalleryModal .gal-card.picked { outline:3px solid var(--th-accent); outline-offset:-3px; }
        #t2iGalleryModal .gal-card.picked .info { background:var(--th-accent-soft, rgba(127,127,127,0.18)); }
        #t2iGalleryModal .t2i-gal-row { flex:0 0 auto; }
        /* one scrollable menu: the header stays pinned, everything else (manage
           tools, folders, filters, pager, images) flows in a single scroll */
        #t2iGalleryModal #t2iGalHeaderRow { position:sticky; top:0; z-index:5; background:var(--box-color,#222); }
        #t2iGalleryModal #t2iGalPagerRow button, #t2iGalleryModal #t2iGalPagerRow select { font-size:80%; padding:0.2rem 0.5rem; border:1px solid var(--th-border); border-radius:5px; background:var(--box-color,#eee); color:inherit; cursor:pointer; }
        #t2iGalCapWarn { padding:0.4rem 0.75rem; font-size:80%; line-height:1.4; border-bottom:1px solid var(--th-border); background:rgba(220,160,40,0.16); color:#e8b44a; text-align:left; }
        #t2iGalCapWarn b { color:#f0c060; }
        #t2iGalleryModal .t2i-gal-hint { padding:0 0.75rem 0.55rem; font-size:78%; line-height:1.45; opacity:0.62; text-align:left; }
        #t2iGalleryModal .t2i-gal-grp { display:inline-flex; align-items:center; gap:0.5rem; flex-wrap:wrap; }
        #t2iGalleryModal .t2i-gal-grp + .t2i-gal-grp { border-left:1px solid var(--th-border); padding-left:0.65rem; }
        #t2iGalleryModal .t2i-gal-rowlbl { font-size:70%; text-transform:uppercase; letter-spacing:0.05em; opacity:0.5; white-space:nowrap; }
        #t2iGalleryModal .t2i-gal-empty { width:100%; text-align:center; padding:1.3rem 1rem 1.7rem; }
        #t2iGalleryModal .t2i-gal-empty-ico { font-size:2.4rem; line-height:1.1; }
        #t2iGalleryModal .t2i-gal-empty-title { font-size:1.02rem; font-weight:800; margin-top:0.5rem; }
        #t2iGalleryModal .t2i-gal-empty-txt { font-size:0.84rem; opacity:0.72; line-height:1.5; max-width:34rem; margin:0.35rem auto 0; }
        #t2iGalleryModal .t2i-gal-empty-btns { display:flex; gap:0.5rem; flex-wrap:wrap; justify-content:center; margin-top:0.9rem; }
        #t2iGalleryModal .t2i-gal-empty-btn { font:inherit; font-size:0.85rem; padding:0.4rem 0.85rem; border:1px solid var(--th-border); border-radius:6px; background:var(--box-color,#eee); color:inherit; cursor:pointer; }
        #t2iGalleryModal .t2i-gal-empty-btn.primary { border-color:var(--th-accent); background:var(--th-accent); color:var(--th-accent-text); font-weight:600; }
        #t2iGalleryModal .t2i-gal-empty-btn:hover { border-color:var(--th-accent); }
        #t2iGalleryModal { padding: 1rem; }
        @media (max-width: 640px) {
          #t2iGalleryModal { padding: 0 !important; }
          #t2iGalleryModal > div { width: 100vw !important; height: 100vh !important; height: 100dvh !important; max-height: 100dvh !important; border-radius: 0 !important; border: none !important; }
          #t2iGalleryModal .gal-card { width: calc(50% - 0.4rem); margin: 0 0.4rem 0.4rem 0; }
          #t2iGalleryModal .gal-card img { height: 30vw; min-height: 110px; max-height: 220px; }
          #t2iGalleryModal .gal-card .buttons { gap:0.15rem; padding:0.25rem; }
          #t2iGalleryModal .gal-card .buttons button, #t2iGalleryModal .gal-card .buttons a { font-size:70%; padding:0.15rem 0.1rem; }
          #t2iGalleryModal .gal-card .info { font-size:70%; }
          #t2iGalleryModal .gal-card .gal-prompt { font-size:68%; }
          #t2iGalleryModal .t2i-gal-row { gap:0.35rem; padding:0.4rem 0.6rem !important; flex-wrap:nowrap !important; overflow-x:auto; -webkit-overflow-scrolling:touch; }
          #t2iGalleryModal .t2i-gal-row > * { flex:0 0 auto !important; }
          #t2iGalleryModal .t2i-gal-row > b { order:-2; }
          #t2iGalleryModal .t2i-gal-row > #t2iGalCloseBtn { order:-1; }
          #t2iGalleryModal #t2iGalPeerStatus { max-width:9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          /* the header carries the primary actions, so let it wrap instead of scrolling out of reach */
          #t2iGalleryModal #t2iGalHeaderRow { flex-wrap:wrap !important; overflow-x:visible !important; row-gap:0.35rem; }
          #t2iGalleryModal #t2iGalManageRow { flex-wrap:wrap !important; overflow-x:visible !important; row-gap:0.3rem; }
          /* the folder row is a Manage-panel row too, but it only holds a handful of controls, and the
             auto-folder checkbox would otherwise sit off the right edge of the mobile scroll area */
          #t2iGalleryModal #t2iGalFolderRow { flex-wrap:wrap !important; overflow-x:visible !important; row-gap:0.3rem; }
          #t2iGalleryModal #t2iGalAutoFolderWrap { flex:1 1 100% !important; }
          #t2iGalleryModal #t2iGalHeaderSpacer { display:none; }
          #t2iGalleryModal #t2iGalSearch { flex:1 1 150px !important; min-width:150px; }
          #t2iGalleryModal .t2i-gal-row button { font-size:78% !important; padding:0.3rem 0.5rem !important; }
          #t2iGalleryModal .t2i-gal-row select { font-size:80% !important; max-width:45vw; }
        }
        @media (max-width: 380px) {
          #t2iGalleryModal .gal-card { width: 100%; margin: 0 0 0.5rem 0; }
          #t2iGalleryModal .gal-card img { height: 46vw; min-height: 120px; }
        }
      </style>
      <div class="t2i-gal-row" id="t2iGalHeaderRow" style="padding:0.6rem 0.75rem 0.45rem; display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
        <b id="t2iGalTitle">🖼️ Saved images</b>
        <span id="t2iGalCount" style="font-size:85%; opacity:0.7;"></span>
        <span id="t2iGalPeerStatus" style="font-size:80%; opacity:0.75; font-weight:normal;"></span>
        <span id="t2iGalHeaderSpacer" style="flex-grow:1;"></span>
        <button id="t2iGalAddBtn" title="Add pictures from your device to the gallery" style="font-size:85%; padding:0.25rem 0.6rem; border:1px solid var(--th-border); border-radius:5px; cursor:pointer; background:var(--box-color,#eee);">➕ add images</button>
        <button id="t2iGalManageToggle" title="Folders, recycle bin, export / import, bulk actions and the chat link" aria-expanded="false" aria-controls="t2iGalManagePanel" style="font-size:85%; padding:0.25rem 0.6rem; border:1px solid var(--th-border); border-radius:5px; cursor:pointer; background:var(--box-color,#eee);">🧰 Manage ▾</button>
        <button id="t2iGalCloseBtn" title="close" style="font-size:85%; padding:0.25rem 0.6rem; border:1px solid var(--th-border); border-radius:5px; cursor:pointer; background:var(--box-color,#eee);">✖️</button>
      </div>
      <div class="t2i-gal-hint" id="t2iGalIntro">Images you save from any tool land here. No account needed — they stay in this browser.</div>
      <div class="t2i-gal-row" id="t2iGalPickBar" hidden style="padding:0.55rem 0.75rem; display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; border-bottom:1px solid var(--th-border); background:var(--th-accent-soft, rgba(127,127,127,0.14));">
        <span id="t2iGalPickHint" style="font-size:85%; font-weight:600; flex:1 1 100%; min-width:0; white-space:normal; overflow-wrap:anywhere;">Tap images to select them, then press Add.</span>
        <span id="t2iGalPickCount" style="font-size:82%; opacity:0.8;"></span>
        <span style="flex-grow:1;"></span>
        <button id="t2iGalPickAllBtn" style="font-size:85%; padding:0.25rem 0.6rem; border:1px solid var(--th-border); border-radius:5px; cursor:pointer; background:var(--box-color,#eee);">☑️ select all shown</button>
        <button id="t2iGalPickNoneBtn" style="font-size:85%; padding:0.25rem 0.6rem; border:1px solid var(--th-border); border-radius:5px; cursor:pointer; background:var(--box-color,#eee);">✖️ clear</button>
        <button id="t2iGalPickCancel" style="font-size:85%; padding:0.25rem 0.6rem; border:1px solid var(--th-border); border-radius:5px; cursor:pointer; background:var(--box-color,#eee);">Cancel</button>
        <button id="t2iGalPickAdd" disabled style="font-size:88%; font-weight:600; padding:0.32rem 0.85rem; border:1px solid var(--th-accent); border-radius:5px; cursor:pointer; background:var(--th-accent); color:var(--th-accent-text);">✅ Add</button>
      </div>
      <div class="t2i-gal-row" id="t2iGalManageRow" style="padding:0.5rem 0.75rem; display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; border-bottom:1px solid var(--th-border);">
        <button id="t2iGalSelectAllBtn" style="font-size:85%; padding:0.25rem 0.6rem; border:1px solid var(--th-border); border-radius:5px; cursor:pointer; background:var(--box-color,#eee);">☑️ select all</button>
        <button id="t2iGalClearSelBtn" style="font-size:85%; padding:0.25rem 0.6rem; border:1px solid var(--th-border); border-radius:5px; cursor:pointer; background:var(--box-color,#eee);" hidden>✖️ clear</button>
        <span id="t2iGalSelectedCount" style="font-size:85%; opacity:0.7;"></span>
        <span style="flex-grow:1;"></span>
        <button id="t2iGalMoveSelectedBtn" title="Move the selected images into a folder" style="font-size:85%; padding:0.25rem 0.6rem; border:1px solid var(--th-border); border-radius:5px; cursor:pointer; background:var(--box-color,#eee);" disabled hidden>📁 Move to folder ▾</button>
        <button id="t2iGalZipSelectedBtn" style="font-size:85%; padding:0.25rem 0.6rem; border:1px solid var(--th-border); border-radius:5px; cursor:pointer; background:var(--box-color,#eee);" disabled hidden>📦 ZIP selected</button>
        <button id="t2iGalDeleteSelectedBtn" style="font-size:85%; padding:0.25rem 0.6rem; border:1px solid #b33; border-radius:5px; cursor:pointer; background:rgba(180,50,50,0.2); color:#f88;" disabled hidden>🗑️ Delete selected</button>
      </div>
      <div id="t2iGalManagePanel" hidden>
        <div class="t2i-gal-row" id="t2iGalToolsRow" style="padding:0.5rem 0.75rem; display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; border-bottom:1px solid var(--th-border);">
        <span class="t2i-gal-grp"><span class="t2i-gal-rowlbl">🔗 Chat link</span>
        <button id="t2iGalUnlinkBtn" hidden title="Forget this cross-site link and hide the chat generator's images" style="font-size:80%; padding:0.25rem 0.6rem; border:1px solid #b66; border-radius:5px; cursor:pointer; background:rgba(180,80,80,0.15); color:#f99;">🔗 unlink</button>
        <button id="t2iGalLinkBtn" hidden title="Manually connect the chat generator's gallery by pasting its gallery link URL" style="font-size:80%; padding:0.25rem 0.6rem; border:1px solid var(--th-border); border-radius:5px; cursor:pointer; background:rgba(80,160,220,0.15); color:#9cf;">🔗 link chat gallery</button>
        <button id="t2iGalPairBtn" title="Open the chat generator with this site's gallery link, so images saved here also show in the chat gallery" style="font-size:80%; padding:0.25rem 0.6rem; border:1px solid var(--th-border); border-radius:5px; cursor:pointer; background:rgba(120,200,120,0.15); color:#9e9;">🔗 connect chat site</button>
        <button id="t2iGalCopyLinkBtn" title="Copy this site's gallery link URL — paste it anywhere to let another site read your saved images" style="font-size:80%; padding:0.25rem 0.6rem; border:1px solid var(--th-border); border-radius:5px; cursor:pointer; background:var(--box-color,#eee);">📋 copy gallery link</button>
        </span><span class="t2i-gal-grp"><span class="t2i-gal-rowlbl">📦 Export</span>
        <button id="t2iGalZipBtn" style="font-size:85%; padding:0.25rem 0.6rem; border:1px solid var(--th-border); border-radius:5px; cursor:pointer; background:var(--box-color,#eee);">📦 Save all as ZIP</button>
        <button id="t2iGalExportBtn" style="font-size:85%; padding:0.25rem 0.6rem; border:1px solid var(--th-border); border-radius:5px; cursor:pointer; background:var(--box-color,#eee);">Export all links</button>
        <button id="t2iGalImportBtn" title="Restore images from a pasted export, ZIP manifest, or backup JSON (the inverse of Export all links)" style="font-size:85%; padding:0.25rem 0.6rem; border:1px solid var(--th-border); border-radius:5px; cursor:pointer; background:var(--box-color,#eee);">⬆️ Import</button>
        </span><span class="t2i-gal-grp"><span class="t2i-gal-rowlbl">♻️ Recover</span>
        <button id="t2iGalHiddenBtn" title="Images you removed or hid — restore them from here" style="font-size:85%; padding:0.25rem 0.6rem; border:1px solid var(--th-border); border-radius:5px; cursor:pointer; background:var(--box-color,#eee);">♻️ Removed (<span id="t2iGalHiddenCount">0</span>)</button>
        <button id="t2iGalUndoBtn" title="Undo the last gallery change" style="font-size:85%; padding:0.25rem 0.6rem; border:1px solid var(--th-border); border-radius:5px; cursor:pointer; background:var(--box-color,#eee);" disabled>↩️ undo</button>
        <button id="t2iGalDeleteAllBtn" title="Remove every image from the gallery (recoverable from ♻️ Removed)" style="font-size:85%; padding:0.25rem 0.6rem; border:1px solid #b33; border-radius:5px; cursor:pointer; background:rgba(180,50,50,0.2); color:#f88;">🗑️ Delete all images</button>
        </span>
      </div>
      <div class="t2i-gal-row" id="t2iGalFolderRow" style="padding:0.5rem 0.75rem; display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; border-bottom:1px solid var(--th-border);">
        <label style="font-size:85%; display:flex; align-items:center; gap:0.4rem;">📁 folder:
          <select id="t2iGalFolderSelect" style="font-size:85%; background:var(--box-color,#eee); color:inherit; border:1px solid var(--th-border); border-radius:5px; padding:0.2rem 0.4rem; max-width:200px;"></select>
        </label>
        <button id="t2iGalMoveBtn" title="Move the selected images — or all images currently shown if none are selected — into a folder" style="font-size:85%; padding:0.25rem 0.6rem; border:1px solid var(--th-border); border-radius:5px; cursor:pointer; background:var(--box-color,#eee);">📁 move to folder ▾</button>
        <button id="t2iGalNewFolderBtn" style="font-size:85%; padding:0.25rem 0.6rem; border:1px solid var(--th-border); border-radius:5px; cursor:pointer; background:var(--box-color,#eee);">➕ new folder</button>
        <button id="t2iGalRenameFolderBtn" style="font-size:85%; padding:0.25rem 0.6rem; border:1px solid var(--th-border); border-radius:5px; cursor:pointer; background:var(--box-color,#eee);" disabled>✏️ rename</button>
        <button id="t2iGalDeleteFolderBtn" style="font-size:85%; padding:0.25rem 0.6rem; border:1px solid #b33; border-radius:5px; cursor:pointer; background:rgba(180,50,50,0.2); color:#f88;" disabled>🗑️ delete folder</button>
        <label id="t2iGalAutoFolderWrap" title="Auto-folder: every image you save is filed into a folder named after the generation's 🏷️ Image name — the folder is created automatically the first time each new name is saved. Images saved without an Image name stay unfiled." style="font-size:85%; display:flex; align-items:center; gap:0.35rem; cursor:pointer; opacity:0.9;">
          <input type="checkbox" id="t2iGalAutoFolderChk" style="cursor:pointer;"> <span>📂 auto-folder by 🏷️ Image name</span>
        </label>
        <span style="flex-grow:1;"></span>
        <span id="t2iGalFolderHint" style="font-size:80%; opacity:0.6;"></span>
      </div>
      </div>
      <div class="t2i-gal-row" style="padding:0.5rem 0.75rem; display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; border-bottom:1px solid var(--th-border);">
        <input id="t2iGalSearch" type="search" placeholder="🔎 search prompt, label, tag or folder…" style="flex:1 1 200px; min-width:140px; font-size:85%; background:var(--box-color,#eee); color:inherit; border:1px solid var(--th-border); border-radius:5px; padding:0.25rem 0.5rem; box-sizing:border-box;">
        <select id="t2iGalSort" title="sort order" style="font-size:85%; background:var(--box-color,#eee); color:inherit; border:1px solid var(--th-border); border-radius:5px; padding:0.25rem 0.4rem;">
          <option value="new">🕒 newest</option>
          <option value="old">🕒 oldest</option>
          <option value="az">🔤 label A→Z</option>
          <option value="za">🔤 label Z→A</option>
          <option value="folder">📁 folder</option>
        </select>
        <select id="t2iGalPromptFilter" title="filter by prompt" style="font-size:85%; background:var(--box-color,#eee); color:inherit; border:1px solid var(--th-border); border-radius:5px; padding:0.25rem 0.4rem;">
          <option value="all">all images</option>
          <option value="has">✔️ has prompt</option>
          <option value="none">✖️ no prompt</option>
        </select>
        <select id="t2iGalFavFilter" title="filter by favorites" style="font-size:85%; background:var(--box-color,#eee); color:inherit; border:1px solid var(--th-border); border-radius:5px; padding:0.25rem 0.4rem;">
          <option value="all">⭐ all</option>
          <option value="fav">⭐ favorites only</option>
          <option value="nofav">☆ not favorites</option>
        </select>
        <select id="t2iGalSourceFilter" title="filter by source site — separates images made here from images synced from connected sites" style="font-size:85%; background:var(--box-color,#eee); color:inherit; border:1px solid var(--th-border); border-radius:5px; padding:0.25rem 0.4rem;">
          <option value="__all__">🌐 all sources</option>
          <option value="here">✨ made here</option>
          <option value="peer">🔗 connected sites</option>
        </select>
        <select id="t2iGalTagFilter" title="filter by tag" style="font-size:85%; background:var(--box-color,#eee); color:inherit; border:1px solid var(--th-border); border-radius:5px; padding:0.25rem 0.4rem; max-width:180px;"></select>
        <button id="t2iGalFavFirstBtn" title="Pin favorites to the top of the list" style="font-size:85%; padding:0.25rem 0.6rem; border:1px solid var(--th-border); border-radius:5px; cursor:pointer; background:var(--box-color,#eee);">⭐ Favorites first: off</button>
        <select id="t2iGalPageSize" title="images per page" style="font-size:85%; background:var(--box-color,#eee); color:inherit; border:1px solid var(--th-border); border-radius:5px; padding:0.25rem 0.4rem;">
          <option value="30">30 / page</option>
          <option value="60" selected>60 / page</option>
          <option value="120">120 / page</option>
          <option value="240">240 / page</option>
          <option value="0">all on one page</option>
        </select>
        <span id="t2iGalSearchInfo" style="font-size:80%; opacity:0.65;"></span>
      </div>
      <div class="t2i-gal-row" id="t2iGalPagerRow" style="padding:0.4rem 0.75rem; display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; border-bottom:1px solid var(--th-border);">
        <button id="t2iGalPrevBtn">‹ prev</button>
        <span id="t2iGalPageInfo" style="font-size:82%; opacity:0.8;"></span>
        <button id="t2iGalNextBtn">next ›</button>
        <span style="flex-grow:1;"></span>
        <span id="t2iGalRangeInfo" style="font-size:80%; opacity:0.6;"></span>
      </div>
      <div id="t2iGalCapWarn" hidden></div>
      <div id="t2iGalImages" style="flex:0 0 auto; overflow:visible; padding:0.75rem; display:flex; flex-wrap:wrap; align-content:flex-start;"></div>
    `;
    overlay.appendChild(modal);
    overlay.addEventListener("mousedown", function(e) { if(e.target === overlay) { closeGalleryModal(); } });
    document.body.appendChild(overlay);
    document.getElementById("t2iGalCloseBtn").addEventListener("click", function() { closeGalleryModal(); });
    document.getElementById("t2iGalAddBtn").addEventListener("click", openAddImagesPicker);
    document.getElementById("t2iGalSearch").addEventListener("input", function() { galQuery = this.value; galPage = 1; renderGallery(); });
    document.getElementById("t2iGalSort").addEventListener("change", function() { galSort = this.value; galPage = 1; renderGallery(); });
    document.getElementById("t2iGalPromptFilter").addEventListener("change", function() { galPromptFilter = this.value; galPage = 1; renderGallery(); });
    document.getElementById("t2iGalFavFilter").addEventListener("change", function() { galFavFilter = this.value; galPage = 1; renderGallery(); });
    document.getElementById("t2iGalSourceFilter").addEventListener("change", function() { galSource = this.value; galPage = 1; renderGallery(); });
    document.getElementById("t2iGalTagFilter").addEventListener("change", function() { galTagFilter = this.value; galPage = 1; renderGallery(); });
    document.getElementById("t2iGalFavFirstBtn").addEventListener("click", function() { galFavFirst = !galFavFirst; updateFavFirstBtn(); galPage = 1; renderGallery(); });
    document.getElementById("t2iGalPageSize").addEventListener("change", function() { let v = parseInt(this.value, 10); galPageSize = isNaN(v) ? 60 : v; galPage = 1; renderGallery(); });
    document.getElementById("t2iGalPrevBtn").addEventListener("click", function() { if(galPage > 1) { galPage--; renderGallery(); } });
    document.getElementById("t2iGalNextBtn").addEventListener("click", function() { let total = visibleItems().length; let pages = galPageSize > 0 ? Math.ceil(total / galPageSize) : 1; if(galPage < pages) { galPage++; renderGallery(); } });
    document.getElementById("t2iGalUndoBtn").addEventListener("click", function() { doUndo(); });
    document.getElementById("t2iGalHiddenBtn").addEventListener("click", function() { openHiddenViewer(); });
    document.getElementById("t2iGalImportBtn").addEventListener("click", function() { openImportModal(); });
    document.getElementById("t2iGalPairBtn").addEventListener("click", function() {
      ensureGalleryCloud().then(function() {
        window.open("https://perchance.org/bigger-and-better-ai-chat?galleryFile=" + encodeURIComponent(galleryCloudUrl()), "_blank");
      });
    });
    document.getElementById("t2iGalCopyLinkBtn").addEventListener("click", async function() {
      let btn = this;
      await ensureGalleryCloud();
      let url = galleryCloudUrl();
      try {
        await navigator.clipboard.writeText(url);
        btn.textContent = "✅ copied";
      } catch(e) {
        window.prompt("Copy this gallery link URL:", url);
      }
      setTimeout(() => { btn.textContent = "📋 copy gallery link"; }, 1500);
    });

    let currentFolder = null; // null = all, "" = unfiled
    let knownFolders = new Set(getGalleryFolders(getGallery()));
    // 🧰 Manage: folders / recycle bin / export / bulk actions stay collapsed so the modal opens as
    // "just my images" for a first-time visitor. The choice is remembered per browser.
    let managePanel = document.getElementById("t2iGalManagePanel");
    let manageToggle = document.getElementById("t2iGalManageToggle");
    let manageOpen = false;
    try { manageOpen = localStorage.getItem("t2iGalManageOpen") === "1"; } catch(e) {}
    function setManageOpen(on) {
      manageOpen = !!on;
      if(managePanel) managePanel.hidden = !manageOpen;
      if(manageToggle) {
        manageToggle.textContent = manageOpen ? "🧰 Manage ▴" : "🧰 Manage ▾";
        manageToggle.setAttribute("aria-expanded", manageOpen ? "true" : "false");
      }
      try { localStorage.setItem("t2iGalManageOpen", manageOpen ? "1" : "0"); } catch(e) {}
    }
    setManageOpen(manageOpen);
    if(manageToggle) manageToggle.addEventListener("click", function() { setManageOpen(!manageOpen); });
    let selectedUrls = new Set();
    let galQuery = "", galSort = "new", galPromptFilter = "all";
    let galSource = "__all__";
    let galFavFilter = "all", galTagFilter = "", galFavFirst = false;
    let galPageSize = 60, galPage = 1;
    let lightbox = null; // {overlay, items, index}
    let peerItems = []; // display-only entries saved on the chat generator (origin:"chat")
    let peerStatusEl = null;
    let peerLoaded = false;

    // fetch connected-site galleries and fold them into the view when they arrive.
    // Multi-peer, compatible with bigger-and-better-ai-chat: each peer contributes entries tagged
    // with its origin ("<generator>/<file>"), and the 🌐 source filter separates them.
    function refreshPeerStatus() {
      let hint = document.getElementById("t2iGalPeerStatus");
      if(!hint) return;
      let n = readPeers().length, m = peerItems.length;
      hint.textContent = n ? ("🔗 " + n + " connected · " + m + " from sites") : "";
      hint.title = n ? readPeers().join("\n") : "";
    }
    (async function() {
      let unlinkBtn = document.getElementById("t2iGalUnlinkBtn");
      let linkBtn = document.getElementById("t2iGalLinkBtn");
      if(unlinkBtn) {
        unlinkBtn.hidden = readPeers().length === 0;
        unlinkBtn.title = "Forget all cross-site links and hide connected sites' images";
        unlinkBtn.onclick = () => {
          writePeers([]);
          peerGalleryCache = null; peerItems = []; peerLoaded = false;
          refreshPeerStatus();
          unlinkBtn.hidden = true;
          if(linkBtn) linkBtn.hidden = false;
          renderGallery();
        };
      }
      if(linkBtn) {
        linkBtn.hidden = false;
        linkBtn.textContent = "🔗 link site gallery";
        linkBtn.title = "Connect another site's gallery by pasting its gallery link URL (e.g. https://editable.uploads.dev/file/<generator>/chatgallery-<key> or gallery-<key>), or any site link carrying ?galleryFile=…";
        linkBtn.onclick = async () => {
          let raw = window.prompt("Paste the other site's gallery link — its editable file URL (e.g. https://editable.uploads.dev/file/<generator>/chatgallery-<key>), or any site link carrying ?galleryFile=…", "");
          if(raw === null || !String(raw).trim()) return;
          let u = extractPeerFile(raw);
          if(!u) {
            window.alert("That doesn't look like a gallery link — expected an editable.uploads.dev/file/… URL, or a link containing ?galleryFile=.");
            return;
          }
          addPeer(u);
          peerGalleryCache = null;
          await loadPeerGallery();
          if(peerGalleryAvailable()) {
            peerItems = peerGalleryCache.items;
            for(let i of peerItems) if(i.folder) knownFolders.add(i.folder);
            peerLoaded = true;
          }
          refreshPeerStatus();
          if(unlinkBtn) unlinkBtn.hidden = readPeers().length === 0;
          renderGallery();
          try {
            let sid = peerSourceId(u);
            let fromPeer = peerItems.filter(function(i) { return i && i.origin === sid; }).length;
            toast(fromPeer ? ("🔗 connected · " + fromPeer + " image(s) from that site") : "🔗 connected — that site's file is empty or unreachable, its images will appear automatically once it has saved some");
          } catch(e) {}
        };
      }
      await loadPeerGallery();
      if(!peerGalleryAvailable()) { refreshPeerStatus(); return; }
      peerItems = peerGalleryCache.items;
      for(let i of peerItems) if(i.folder) knownFolders.add(i.folder);
      peerLoaded = true;
      refreshPeerStatus();
      renderGallery();
    })();

    function labelOf(i) { return String((i && i.title) || ""); }
    function searchHaystack(i) {
      return (labelOf(i) + " " + ((i && i.prompt) || "") + " " + ((i && i.folder) || "") + " " + ((i && i.origin) || "") + " " + ((i && i.charName) || "") + " " + (((i && i.tags) || []).join(" "))).toLowerCase();
    }
    function foldKey(i) { return (normalizeFolderName(i && i.folder) || "").toLowerCase(); }
    function allTags() {
      let set = new Set();
      for(let i of getGallery().concat(peerItems)) for(let t of (i.tags || [])) if(t) set.add(t);
      return [...set].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    }
    function refreshTagFilter() {
      let sel = document.getElementById("t2iGalTagFilter");
      if(!sel) return;
      let tags = allTags();
      let cur = galTagFilter;
      sel.innerHTML = '<option value="">🏷️ all tags</option>' + tags.map(t => '<option value="' + sanitizeHtml(t) + '">🏷️ ' + sanitizeHtml(t) + "</option>").join("");
      if(cur && tags.some(t => t.toLowerCase() === cur.toLowerCase())) sel.value = tags.find(t => t.toLowerCase() === cur.toLowerCase());
      else { galTagFilter = ""; sel.value = ""; }
    }
    function updateFavFirstBtn() {
      let b = document.getElementById("t2iGalFavFirstBtn");
      if(!b) return;
      b.textContent = galFavFirst ? "⭐ Favorites first: on" : "⭐ Favorites first: off";
      b.style.borderColor = galFavFirst ? "#e0b040" : "var(--th-border)";
      b.style.opacity = galFavFirst ? "1" : "0.85";
    }
    function updateUndoBtn() {
      let b = document.getElementById("t2iGalUndoBtn");
      if(!b) return;
      b.disabled = galleryUndoCount() === 0;
      b.textContent = galleryUndoCount() ? "↩️ undo (" + galleryUndoCount() + ")" : "↩️ undo";
    }
    function updateHiddenCount() {
      let el = document.getElementById("t2iGalHiddenCount");
      if(el) el.textContent = getHidden().length;
    }
    function visibleItems() {
      let gallery = getGallery();
      if(typeof galSource === "undefined" || galSource == null) galSource = "__all__";
      if(peerItems.length) {
        // chat images hidden locally with 🙈 are filtered out here; they stay restorable in the hidden viewer.
        // Also drop peer copies of images we already own (the chat file mirrors our gallery, which would
        // otherwise show each shared image twice — the local card has more controls anyway).
        let peerHidden = new Set(getHidden().map(h => h.url));
        let ownUrls = new Set(gallery.map(i => i.url));
        gallery = gallery.concat(peerItems.filter(i => !peerHidden.has(i.url) && !ownUrls.has(i.url)));
      }
      if(currentFolder != null) gallery = gallery.filter(i => matchFolder(i.folder, currentFolder));
      if(galSource === "here") gallery = gallery.filter(i => !i.origin);
      else if(galSource === "peer") gallery = gallery.filter(i => !!i.origin);
      let q = galQuery.trim().toLowerCase();
      if(q) gallery = gallery.filter(i => searchHaystack(i).indexOf(q) !== -1);
      if(galPromptFilter === "has") gallery = gallery.filter(i => i.prompt);
      else if(galPromptFilter === "none") gallery = gallery.filter(i => !i.prompt);
      if(galFavFilter === "fav") gallery = gallery.filter(i => i.fav);
      else if(galFavFilter === "nofav") gallery = gallery.filter(i => !i.fav);
      if(galTagFilter) { let t = galTagFilter.toLowerCase(); gallery = gallery.filter(i => (i.tags || []).some(x => String(x).toLowerCase() === t)); }
      gallery = gallery.slice();
      if(galSort === "old") gallery.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      else if(galSort === "az") gallery.sort((a, b) => labelOf(a).localeCompare(labelOf(b)));
      else if(galSort === "za") gallery.sort((a, b) => labelOf(b).localeCompare(labelOf(a)));
      else if(galSort === "folder") gallery.sort((a, b) => foldKey(a).localeCompare(foldKey(b)) || (b.timestamp || 0) - (a.timestamp || 0));
      else gallery.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      if(galFavFirst) gallery.sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0)); // stable sort keeps the order above within each group
      return gallery;
    }
    function refreshFolderBar() {
      let sel = document.getElementById("t2iGalFolderSelect");
      sel.innerHTML = "";
      let addOpt = (val, label) => { let o = document.createElement("option"); o.value = val; o.textContent = label; sel.appendChild(o); };
      addOpt("__all__", "📁 All images");
      addOpt("__unfiled__", "🗂️ Unfiled");
      // merge in any folder that appeared since the modal opened (e.g. one an auto-folder save just
      // created), so a brand-new folder shows up in the list without closing and reopening the modal
      for(let f of getGalleryFolders(getGallery())) knownFolders.add(f);
      for(let f of [...knownFolders].sort((a,b) => a.localeCompare(b))) addOpt(f, "📂 " + f);
      sel.value = currentFolder == null ? "__all__" : (currentFolder === "" ? "__unfiled__" : currentFolder);
      let isFolder = !!currentFolder && currentFolder !== "";
      document.getElementById("t2iGalRenameFolderBtn").disabled = !isFolder;
      document.getElementById("t2iGalDeleteFolderBtn").disabled = !isFolder;
    }
    function updateSelectionBar() {
      let n = selectedUrls.size;
      document.getElementById("t2iGalSelectedCount").textContent = n ? n + " selected" : "";
      // The selection actions live in their own row (outside the collapsed 🧰 Manage panel) so a tap
      // on a card's checkbox always reveals something to do. With nothing selected we show just the
      // "select all" affordance.
      ["t2iGalClearSelBtn", "t2iGalMoveSelectedBtn", "t2iGalZipSelectedBtn", "t2iGalDeleteSelectedBtn"].forEach(function(id) {
        let el = document.getElementById(id);
        if(el) el.hidden = n === 0;
      });
      let own = new Set(getGallery().map(i => i.url));
      let ownN = 0; for(let u of selectedUrls) if(own.has(u)) ownN++;
      document.getElementById("t2iGalMoveSelectedBtn").disabled = ownN === 0;
      let moveBtn = document.getElementById("t2iGalMoveBtn");
      if(moveBtn) moveBtn.textContent = ownN ? "📁 move selected (" + ownN + ") ▾" : "📁 move to folder ▾";
      document.getElementById("t2iGalZipSelectedBtn").disabled = ownN === 0;
      document.getElementById("t2iGalDeleteSelectedBtn").disabled = ownN === 0;
      if(pick) refreshPickBar();
    }
    function syncSelectionCheckboxes() {
      document.querySelectorAll("#t2iGalleryModal [data-select-url]").forEach(cb => {
        cb.checked = selectedUrls.has(cb.dataset.selectUrl);
        let card = cb.closest(".gal-card");
        if(card) card.classList.toggle("picked", cb.checked);
      });
    }

    document.getElementById("t2iGalFolderSelect").addEventListener("change", function() {
      let v = this.value;
      currentFolder = v === "__all__" ? null : (v === "__unfiled__" ? "" : v);
      renderGallery();
    });
    let autoFolderChk = document.getElementById("t2iGalAutoFolderChk");
    if(autoFolderChk) {
      autoFolderChk.checked = getAutoFolderSetting();
      autoFolderChk.addEventListener("change", function() {
        setAutoFolderSetting(this.checked);
        updateAutoFolderControls();
        toast(getAutoFolderSetting() ? "📂 auto-folder: ON — each new 🏷️ Image name becomes its own folder" : "📂 auto-folder: OFF");
      });
    }
    document.getElementById("t2iGalNewFolderBtn").addEventListener("click", function() {
      let name = normalizeFolderName(prompt("New folder name:", ""));
      if(!name) return;
      knownFolders.add(name);
      currentFolder = name;
      renderGallery();
    });
    document.getElementById("t2iGalRenameFolderBtn").addEventListener("click", function() {
      let old = currentFolder;
      if(!old) return;
      let input = prompt("Rename folder:", old);
      if(input == null) return;
      let name = normalizeFolderName(input);
      if(!name) return;
      let same = name.toLowerCase() === old.toLowerCase();
      let exists = [...knownFolders].some(f => f.toLowerCase() === name.toLowerCase());
      if(exists && !same) { alert("A folder with that name already exists."); return; }
      if(!same) { knownFolders.delete(old); knownFolders.add(name); }
      pushGalleryUndo("rename folder");
      let g = getGallery();
      for(let item of g) if(matchFolder(item.folder, old)) item.folder = name;
      saveGallery(g);
      currentFolder = name;
      renderGallery();
    });
    document.getElementById("t2iGalDeleteFolderBtn").addEventListener("click", async function() {
      let f = currentFolder;
      if(!f) return;
      if(!(await window.uiConfirm('Delete folder "' + f + '"? Its images will be moved to Unfiled (none are deleted).', { okText: 'Delete folder', danger: true }))) return;
      pushGalleryUndo("delete folder");
      let g = getGallery();
      for(let item of g) if(matchFolder(item.folder, f)) item.folder = "";
      saveGallery(g);
      knownFolders.delete(f);
      currentFolder = "";
      renderGallery();
    });
    document.getElementById("t2iGalSelectAllBtn").addEventListener("click", function() {
      visibleItems().forEach(i => selectedUrls.add(i.url));
      syncSelectionCheckboxes();
      updateSelectionBar();
    });
    document.getElementById("t2iGalClearSelBtn").addEventListener("click", function() {
      selectedUrls.clear();
      syncSelectionCheckboxes();
      updateSelectionBar();
    });
    document.getElementById("t2iGalZipSelectedBtn").addEventListener("click", function() {
      let items = getGallery().filter(i => selectedUrls.has(i.url));
      zipGalleryItems(items, document.getElementById("t2iGalZipSelectedBtn"));
    });
    document.getElementById("t2iGalDeleteSelectedBtn").addEventListener("click", async function() {
      let removed = getGallery().filter(i => selectedUrls.has(i.url));
      let n = removed.length;
      if(n === 0) return;
      if(!(await window.uiConfirm("Delete " + n + " selected image" + (n === 1 ? "" : "s") + "? They move to ♻️ Removed (behind the 🧰 Manage button), so you can restore them.", { okText: 'Delete', danger: true }))) return;
      pushGalleryUndo("delete " + n + " selected");
      addHidden(removed);
      saveGallery(getGallery().filter(i => !selectedUrls.has(i.url)));
      selectedUrls.clear();
      renderGallery();
      toastUndo("🗑️ moved " + removed.length + " to hidden");
    });

    let moveMenuEl = null, moveMenuCleanup = null;
    function closeMoveMenu() {
      if(moveMenuCleanup) { moveMenuCleanup(); moveMenuCleanup = null; }
      if(moveMenuEl) { moveMenuEl.remove(); moveMenuEl = null; }
    }
    function moveUrlsToFolder(urls, dest) {
      dest = dest || "";
      let set = new Set(urls);
      let g = getGallery();
      let moved = 0;
      for(let item of g) { if(set.has(item.url)) { item.folder = dest; moved++; } }
      if(moved) { pushGalleryUndo("move to folder"); saveGallery(g); }
      if(dest) knownFolders.add(dest);
      renderGallery();
      toast(moved ? "📁 moved " + moved + " image" + (moved === 1 ? "" : "s") + (dest ? " to “" + dest + "”" : " to Unfiled") : "Nothing to move.");
    }
    function openMoveMenu(anchor, getTargets) {
      closeMoveMenu();
      let targets = getTargets();
      if(!targets.urls.length) { toast("No images to move — nothing selected here."); return; }
      let menu = document.createElement("div");
      menu.id = "t2iGalMoveMenu";
      menu.style.cssText = "position:fixed; z-index:100001; background:var(--box-color,#222); color:inherit; border:1px solid var(--th-border); border-radius:6px; box-shadow:0 8px 28px rgba(0,0,0,0.55); padding:0.3rem; min-width:200px; max-height:60vh; overflow-y:auto; font-size:85%; text-align:left;";
      let header = document.createElement("div");
      header.style.cssText = "padding:0.2rem 0.4rem 0.4rem; font-size:80%; opacity:0.7; border-bottom:1px solid var(--th-border); margin-bottom:0.25rem;";
      header.textContent = "Move " + targets.urls.length + " image" + (targets.urls.length === 1 ? "" : "s") + " to…";
      menu.appendChild(header);
      let addItem = (label, dest) => {
        let b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.style.cssText = "display:block; width:100%; text-align:left; font-size:85%; padding:0.35rem 0.5rem; border:none; border-radius:4px; background:transparent; color:inherit; cursor:pointer;";
        b.addEventListener("mouseenter", function() { b.style.background = "rgba(128,128,128,0.2)"; });
        b.addEventListener("mouseleave", function() { b.style.background = "transparent"; });
        b.addEventListener("click", function() { closeMoveMenu(); moveUrlsToFolder(targets.urls, dest); });
        menu.appendChild(b);
      };
      addItem("🗂️ Unfiled", "");
      for(let f of [...knownFolders].sort((a, b) => a.localeCompare(b))) addItem("📂 " + f, f);
      let sep = document.createElement("div");
      sep.style.cssText = "height:1px; background:var(--th-border); margin:0.25rem 0;";
      menu.appendChild(sep);
      let nb = document.createElement("button");
      nb.type = "button";
      nb.textContent = "➕ New folder…";
      nb.style.cssText = "display:block; width:100%; text-align:left; font-size:85%; padding:0.35rem 0.5rem; border:none; border-radius:4px; background:transparent; color:inherit; cursor:pointer;";
      nb.addEventListener("mouseenter", function() { nb.style.background = "rgba(128,128,128,0.2)"; });
      nb.addEventListener("mouseleave", function() { nb.style.background = "transparent"; });
      nb.addEventListener("click", function() {
        let name = normalizeFolderName(prompt("New folder name:", ""));
        if(!name) return;
        let exists = [...knownFolders].some(f => f.toLowerCase() === name.toLowerCase());
        if(!exists) knownFolders.add(name);
        closeMoveMenu();
        moveUrlsToFolder(targets.urls, name);
      });
      menu.appendChild(nb);
      document.body.appendChild(menu);
      moveMenuEl = menu;
      let r = anchor.getBoundingClientRect();
      let mw = menu.offsetWidth, mh = menu.offsetHeight;
      let left = Math.min(r.left, window.innerWidth - mw - 8);
      let top = r.bottom + 6;
      if(top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
      menu.style.left = Math.max(8, left) + "px";
      menu.style.top = Math.max(8, top) + "px";
      let onDown = function(e) { if(moveMenuEl && !moveMenuEl.contains(e.target) && e.target !== anchor) closeMoveMenu(); };
      let onKey = function(e) { if(e.key === "Escape") { closeMoveMenu(); e.stopImmediatePropagation(); } };
      moveMenuCleanup = function() {
        document.removeEventListener("mousedown", onDown, true);
        document.removeEventListener("keydown", onKey, true);
      };
      setTimeout(function() { if(moveMenuEl) { document.addEventListener("mousedown", onDown, true); document.addEventListener("keydown", onKey, true); } }, 0);
    }
    document.getElementById("t2iGalMoveBtn").addEventListener("click", function() {
      openMoveMenu(this, function() {
        let own = new Set(getGallery().map(i => i.url));
        let picked = [...selectedUrls].filter(u => own.has(u));
        if(picked.length) return { urls: picked };
        return { urls: [...new Set(visibleItems().map(i => i.url).filter(u => own.has(u)))] };
      });
    });
    document.getElementById("t2iGalMoveSelectedBtn").addEventListener("click", function() {
      openMoveMenu(this, function() {
        let own = new Set(getGallery().map(i => i.url));
        return { urls: [...selectedUrls].filter(u => own.has(u)) };
      });
    });
    document.getElementById("t2iGalZipBtn").addEventListener("click", function() {
      let items = visibleItems();
      if(items.length === 0) { alert("No saved images to zip yet."); return; }
      zipGalleryItems(items, document.getElementById("t2iGalZipBtn"));
    });
    document.getElementById("t2iGalExportBtn").addEventListener("click", function() {
      let items = visibleItems();
      if(items.length === 0) { alert("No saved images to export yet."); return; }
      let lines = items.map(item => {
        let timeStr = item.timestamp ? new Date(item.timestamp).toLocaleString() : "";
        return item.url + "\t" + (item.title || "") + "\t" + (item.folder || "") + "\t" + timeStr + "\t" + String(item.prompt || "").replace(/[\r\n\t]+/g, " ");
      });
      let txt = "# Saved image links\n# format: url \t title \t folder \t date \t prompt\n\n" + lines.join("\n") + "\n";
      downloadBlob(new Blob([txt], {type: "text/plain;charset=utf-8"}), "saved-images-" + new Date().toISOString().slice(0, 10) + ".txt");
    });
    document.getElementById("t2iGalDeleteAllBtn").addEventListener("click", async function() {
      let g = getGallery();
      if(g.length === 0) { alert("Gallery is already empty " + Quip.q("galEmpty", "— squeaky clean, nothing to nuke.")); return; }
      if(!(await window.uiConfirm("Delete ALL " + g.length + " image" + (g.length === 1 ? "" : "s") + "? They move to ♻️ Removed (behind the 🧰 Manage button), so you can restore them.", { okText: 'Delete all', danger: true }))) return;
      pushGalleryUndo("delete all");
      addHidden(g);
      saveGallery([]);
      selectedUrls.clear();
      renderGallery();
      toastUndo("🗑️ moved " + g.length + " to hidden");
    });

    async function zipGalleryItems(items, btn) {
      if(!items || items.length === 0) return;
      btn.disabled = true;
      let orig = btn.textContent;
      try {
        let JSZip = (await import("https://esm.sh/jszip@3.10.1")).default;
        let zip = new JSZip();
        let folder = zip.folder("saved-images");
        let manifestLines = ["# Saved image links", "# format: file \t url \t title \t date \t prompt", ""];
        let slugify = s => String(s || "").replace(/[^a-zA-Z0-9-_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "img";
        let seen = new Set();
        for(let i = 0; i < items.length; i++) {
          let item = items[i];
          btn.textContent = "Zipping… " + (i + 1) + "/" + items.length;
          let ext = "jpg";
          try { ext = (new URL(item.url).pathname.match(/\.([a-z0-9]+)$/i) || [])[1] || "jpg"; } catch(e) {}
          let base = String(i + 1).padStart(4, "0") + "-" + slugify(item.title) + "-" + slugify(item.prompt);
          let filename = base + "." + ext, n = 1;
          while(seen.has(filename.toLowerCase())) { filename = base + "-" + (++n) + "." + ext; }
          seen.add(filename.toLowerCase());
          let blob = await fetch(item.url).then(r => { if(!r.ok) throw new Error("HTTP " + r.status); return r.blob(); });
          folder.file(filename, blob);
          let timeStr = item.timestamp ? new Date(item.timestamp).toLocaleString() : "";
          manifestLines.push(filename + "\t" + item.url + "\t" + (item.title || "") + "\t" + timeStr + "\t" + String(item.prompt || "").replace(/[\r\n\t]+/g, " "));
        }
        manifestLines.push("");
        folder.file("manifest.txt", manifestLines.join("\n"));
        btn.textContent = "Compressing…";
        let blob = await zip.generateAsync({type: "blob"});
        downloadBlob(blob, "saved-images-" + new Date().toISOString().slice(0, 10) + ".zip");
        btn.textContent = "✅ zipped";
        setTimeout(() => { btn.textContent = orig; }, 1500);
      } catch(e) {
        console.error(e);
        alert("ZIP failed: " + e.message);
        btn.textContent = orig;
      } finally {
        btn.disabled = false;
      }
    }
    function downloadBlob(blob, filename) {
      let a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }

    // ---------- extended gallery features ----------
    // search/sort over prompts+labels+tags, favorites, tags (orthogonal to folders), pagination,
    // lightbox, per-image editing, set-as-avatar, send-to-chat, import/restore, hidden images (tombstones), undo.
    const INP_STYLE = "width:100%; box-sizing:border-box; font-size:85%; background:rgba(128,128,128,0.12); color:inherit; border:1px solid var(--th-border); border-radius:5px; padding:0.3rem 0.4rem";
    const BTN_STYLE = "font-size:82%; cursor:pointer; padding:0.25rem 0.5rem; border:1px solid var(--th-border); border-radius:5px; background:var(--box-color,#eee); color:inherit";
    const CARD_BOX = "background:var(--box-color,#222); color:inherit; border:1px solid var(--th-border); border-radius:8px; padding:0.9rem; text-align:left; box-shadow:0 10px 40px rgba(0,0,0,0.5)";
    function newOverlay(z) {
      let ov = document.createElement("div");
      ov.setAttribute("data-gal-nested", "1"); // a modal stacked on top of the gallery (see the Esc handler below)
      ov.style.cssText = "position:fixed; inset:0; z-index:" + (z || 100004) + "; background:rgba(0,0,0,0.68); display:flex; align-items:center; justify-content:center; padding:1rem; overflow:auto;";
      return ov;
    }
    function closeOnBackdrop(ov) {
      ov.addEventListener("mousedown", function(e) { if(e.target === ov) ov.remove(); });
    }
    function findItem(url) {
      return getGallery().find(i => i.url === url) || peerItems.find(i => i.url === url) || null;
    }
    async function copyTextToClipboard(text, btn, origText) {
      try {
        await navigator.clipboard.writeText(text);
        if(btn) { btn.textContent = "✅ copied"; setTimeout(function() { if(btn.isConnected) btn.textContent = origText; }, 1500); }
        return true;
      } catch(e) {
        try { window.prompt("Copy:", text); } catch(err) {}
        return false;
      }
    }
    function toggleFav(url) {
      let g = getGallery();
      let it = g.find(i => i.url === url);
      if(!it) { toast("⭐ favoriting works on images in your own gallery"); return; }
      if(it.fav) delete it.fav; else it.fav = true;
      saveGallery(g);
      renderGallery();
      toast(it.fav ? "⭐ pinned to top" : "☆ removed from favorites");
    }
    async function deleteOne(url) {
      let g = getGallery();
      let item = g.find(i => i.url === url);
      if(!item) return;
      if(!(await window.uiConfirm("Remove this image from the gallery?\nIt moves to ♻️ Removed (behind the 🧰 Manage button), so you can restore it.", { okText: 'Remove', danger: true }))) return;
      pushGalleryUndo("delete image");
      addHidden([item]);
      saveGallery(g.filter(i => i.url !== url));
      selectedUrls.delete(url);
      renderGallery();
      refreshLightboxIfOpen();
      toastUndo("🗑️ moved to hidden");
    }
    function hidePeer(url) {
      let it = peerItems.find(i => i.url === url);
      if(!it) return;
      pushGalleryUndo("hide connected-site image");
      addHidden([it]);
      renderGallery();
      refreshLightboxIfOpen();
      toastUndo("🙈 hid connected-site image");
    }
    function doUndo() {
      if(!galleryUndoCount()) return;
      applyUndo();
      refreshLightboxIfOpen();
    }
    function updateCapWarning() {
      let el = document.getElementById("t2iGalCapWarn");
      if(!el) return;
      let n = getGallery().length;
      let stats = null;
      try { stats = JSON.parse(localStorage[GALLERY_CLOUD_STATS_KEY] || "null"); } catch(e) {}
      let msgs = [];
      if(n >= GALLERY_LOCAL_MAX) msgs.push("This browser has hit its " + GALLERY_LOCAL_MAX + "-image limit — the oldest images are no longer kept locally. Export a backup and delete some.");
      else if(n >= GALLERY_LOCAL_MAX * 0.9) msgs.push("You have " + n + " images saved locally — approaching the " + GALLERY_LOCAL_MAX + "-image browser limit.");
      if(stats && stats.bytes) {
        let pct = Math.round(stats.bytes / GALLERY_CLOUD_FILE_MAX * 100);
        if(pct >= 100) msgs.push("The shared cloud gallery file has reached its ~5 MB limit — newer images may not reach the cloud. Export a backup, then delete some.");
        else if(pct >= 85) msgs.push("The shared cloud gallery file is " + pct + "% full (~" + (stats.bytes / 1048576).toFixed(1) + " MB of ~5 MB). Export a backup soon; it holds roughly " + GALLERY_CLOUD_PUSH_MAX + " images.");
      } else if(n >= GALLERY_CLOUD_PUSH_MAX * 0.9) {
        msgs.push("Only the newest " + GALLERY_CLOUD_PUSH_MAX + " images are shared with the chat site — the rest still save here.");
      }
      if(msgs.length) { el.innerHTML = "⚠️ " + msgs.map(sanitizeHtml).join("<br>"); el.hidden = false; }
      else { el.innerHTML = ""; el.hidden = true; }
    }
    function toLocalInput(ts) {
      let d = ts ? new Date(ts) : new Date();
      if(isNaN(d.getTime())) d = new Date();
      let p = x => String(x).padStart(2, "0");
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
    }

    // ---- per-image edit (prompt / label / date / folder / tags / favorite) ----
    function openEditModal(url) {
      let it = getGallery().find(i => i.url === url);
      if(!it) { toast("⚠️ this image is from a connected site — it can't be edited here"); return; }
      let folderOpts = ["", ...knownFolders].map(function(f) { return '<option value="' + sanitizeHtml(f) + '">' + (f ? "📂 " + sanitizeHtml(f) : "🗂️ Unfiled") + "</option>"; }).join("");
      let ov = newOverlay(100007);
      ov.innerHTML = `
        <div style="${CARD_BOX} width:min(470px,100%); max-height:92vh; overflow:auto;">
          <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.6rem;">
            <b>✏️ Edit image</b>
            <span style="flex-grow:1;"></span>
            <button id="t2iEditClose" style="${BTN_STYLE}">✖️</button>
          </div>
          <img src="${sanitizeHtml(it.url)}" style="width:100%; max-height:170px; object-fit:contain; background:#000; border-radius:5px; margin-bottom:0.6rem;">
          <label style="display:block; font-size:80%; margin-bottom:0.45rem;">Label / title<input id="t2iEditTitle" type="text" style="${INP_STYLE}"></label>
          <label style="display:block; font-size:80%; margin-bottom:0.45rem;">Prompt<textarea id="t2iEditPrompt" style="${INP_STYLE}; height:5rem; resize:vertical;"></textarea></label>
          <label style="display:block; font-size:80%; margin-bottom:0.45rem;">Folder<select id="t2iEditFolder" style="${INP_STYLE}">${folderOpts}</select></label>
          <label style="display:block; font-size:80%; margin-bottom:0.45rem;">Date<input id="t2iEditDate" type="datetime-local" style="${INP_STYLE}"></label>
          <label style="display:block; font-size:80%; margin-bottom:0.45rem;">Tags (comma separated)<input id="t2iEditTags" type="text" placeholder="portrait, red hair, wide shot" style="${INP_STYLE}"></label>
          <label style="display:flex; align-items:center; gap:0.4rem; font-size:85%; margin-bottom:0.65rem;"><input id="t2iEditFav" type="checkbox"> ⭐ favorite (pin to top)</label>
          <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
            <button id="t2iEditSave" style="${BTN_STYLE}; flex:1; border-color:#5a5;">💾 save</button>
            <button id="t2iEditCopy" style="${BTN_STYLE}">📋 copy prompt</button>
            <button id="t2iEditCancel" style="${BTN_STYLE}">cancel</button>
          </div>
        </div>`;
      let q = s => ov.querySelector(s);
      q("#t2iEditTitle").value = it.title || "";
      q("#t2iEditPrompt").value = it.prompt || "";
      q("#t2iEditFolder").value = normalizeFolderName(it.folder);
      q("#t2iEditDate").value = toLocalInput(it.timestamp);
      q("#t2iEditTags").value = (it.tags || []).join(", ");
      q("#t2iEditFav").checked = !!it.fav;
      let close = function() { ov.remove(); };
      q("#t2iEditClose").addEventListener("click", close);
      q("#t2iEditCancel").addEventListener("click", close);
      closeOnBackdrop(ov);
      q("#t2iEditCopy").addEventListener("click", function() { copyTextToClipboard(q("#t2iEditPrompt").value, this, "📋 copy prompt"); });
      q("#t2iEditSave").addEventListener("click", function() {
        let g = getGallery();
        let cur = g.find(i => i.url === url);
        if(!cur) { close(); return; }
        pushGalleryUndo("edit image");
        cur.title = q("#t2iEditTitle").value.trim();
        cur.prompt = q("#t2iEditPrompt").value;
        cur.folder = normalizeFolderName(q("#t2iEditFolder").value);
        let ts = q("#t2iEditDate").value ? new Date(q("#t2iEditDate").value).getTime() : NaN;
        if(!isNaN(ts)) cur.timestamp = ts;
        let tags = q("#t2iEditTags").value.split(",").map(t => t.trim()).filter(Boolean).slice(0, 24);
        if(tags.length) cur.tags = tags; else delete cur.tags;
        if(q("#t2iEditFav").checked) cur.fav = true; else delete cur.fav;
        if(cur.folder) knownFolders.add(cur.folder);
        saveGallery(g);
        close();
        renderGallery();
        refreshLightboxIfOpen();
        toast("💾 saved changes");
      });
      document.body.appendChild(ov);
      setTimeout(function() { let el = q("#t2iEditTitle"); if(el) { el.focus(); el.select(); } }, 0);
    }

    // ---- set a saved image as a character/user avatar ----
    function openAvatarModal(url) {
      let it = findItem(url);
      let isVid = false;
      try { isVid = !!(window.AvatarMedia && window.AvatarMedia.isVideo(url)); } catch (e) {}
      let ov = newOverlay(100007);
      ov.innerHTML = `
        <div style="${CARD_BOX} width:min(440px,100%); max-height:90vh; overflow:auto;">
          <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.6rem;">
            <b>🧑 Set as avatar</b>
            <span style="flex-grow:1;"></span>
            <button id="t2iAvClose" style="${BTN_STYLE}">✖️</button>
          </div>
          ${isVid ? `<video src="${sanitizeHtml(url)}" muted loop playsinline autoplay preload="metadata" style="width:100%; max-height:170px; object-fit:contain; background:#000; border-radius:5px; margin-bottom:0.6rem;"></video>` : `<img src="${sanitizeHtml(url)}" style="width:100%; max-height:170px; object-fit:contain; background:#000; border-radius:5px; margin-bottom:0.6rem;">`}
          <div style="display:flex; gap:0.4rem; flex-wrap:wrap; margin-bottom:0.5rem;">
            <button id="t2iAvNewRoster" style="${BTN_STYLE}">➕ create roster character</button>
            <button id="t2iAvNewChat" style="${BTN_STYLE}">💬 create chat character</button>
          </div>
          <div id="t2iAvList" style="font-size:85%;"></div>
        </div>`;
      let q = s => ov.querySelector(s);
      let close = function() { ov.remove(); };
      q("#t2iAvClose").addEventListener("click", close);
      closeOnBackdrop(ov);
      q("#t2iAvNewRoster").addEventListener("click", async function() {
        if(!window.Characters) { toast("⚠️ character roster still loading…"); return; }
        let name = window.prompt("Name this character:", (it && it.title) || "");
        if(name === null) return;
        let c = await window.Characters.add({ name: name, prompt: (it && it.prompt) || "", thumb: url, thumbKind: isVid ? "video" : "" });
        if(c) close();
      });
      q("#t2iAvNewChat").addEventListener("click", function() { openNewChatCharacter(it); close(); });
      let listEl = q("#t2iAvList");
      (async function() {
        if(!window.Characters) { listEl.innerHTML = '<div style="opacity:0.7; padding:0.4rem 0;">Character roster is still loading — reopen in a moment.</div>'; return; }
        let chars = [];
        try { chars = await window.Characters.list(); } catch(e) {}
        if(!chars.length) { listEl.innerHTML = '<div style="opacity:0.7; padding:0.4rem 0;">No roster characters yet — use “➕ create roster character”, or build one from the Pro Imager tab.</div>'; return; }
        let head = document.createElement("div");
        head.style.cssText = "font-size:80%; opacity:0.7; margin:0.3rem 0 0.25rem;";
        head.textContent = "Use as avatar for an existing character:";
        listEl.appendChild(head);
        for(let c of chars) {
          let row = document.createElement("button");
          row.type = "button";
          row.textContent = "🧑 " + c.name;
          row.style.cssText = BTN_STYLE + "; display:block; width:100%; text-align:left; margin-bottom:0.25rem;";
          row.addEventListener("click", async function() {
            if(!window.Characters || !window.Characters.setAvatar) { toast("⚠️ avatars aren't supported yet"); return; }
            await window.Characters.setAvatar(c.id, url, isVid ? "video" : "");
            toast("🧑 avatar set for " + c.name);
            close();
          });
          listEl.appendChild(row);
        }
      })();
      document.body.appendChild(ov);
    }
    function openNewChatCharacter(it) {
      let promptText = (it && it.prompt) || "";
      if(!promptText) { toast("⚠️ this image has no prompt — add one with ✏️ edit first"); return; }
      let name = window.prompt("Name this chat character:", (it && it.title) || "Character");
      if(name === null) return;
      if(typeof window.t2i_generateShareLinkForCharacter !== "function") { toast("⚠️ the chat link builder isn't ready yet"); return; }
      let json = { addCharacter: { name: String(name || "Character").trim() || "Character", roleInstruction: promptText, maxParagraphCountPerMessage: 3, avatar: { url: it.url, size: 1, shape: "square" } } };
      window.t2i_generateShareLinkForCharacter(json);
    }

    // ---- send a saved image to the chat generator ----
    function openLinkedChatGallery() {
      ensureGalleryCloud().then(function() {
        window.open(CHARACTER_CHAT_BASE + "?galleryFile=" + encodeURIComponent(galleryCloudUrl()), "_blank");
      });
    }
    function openChatModal(url) {
      let it = findItem(url);
      let promptText = (it && it.prompt) || "";
      let ov = newOverlay(100007);
      ov.innerHTML = `
        <div style="${CARD_BOX} width:min(450px,100%); max-height:90vh; overflow:auto;">
          <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem;">
            <b>💬 Send to AI chat</b>
            <span style="flex-grow:1;"></span>
            <button id="t2iChClose" style="${BTN_STYLE}">✖️</button>
          </div>
          <img src="${sanitizeHtml(url)}" style="width:100%; max-height:150px; object-fit:contain; background:#000; border-radius:5px; margin-bottom:0.5rem;">
          <div id="t2iChHint" style="font-size:79%; opacity:0.75; margin-bottom:0.5rem;"></div>
          <div style="display:flex; flex-direction:column; gap:0.35rem;">
            <button id="t2iChImg" style="${BTN_STYLE}; text-align:left;">🖼️ copy as &lt;image&gt;prompt&lt;/image&gt;</button>
            <button id="t2iChCmd" style="${BTN_STYLE}; text-align:left;">⌨️ copy the "/image prompt" command</button>
            <button id="t2iChPrompt" style="${BTN_STYLE}; text-align:left;">📋 copy prompt</button>
            <button id="t2iChUrl" style="${BTN_STYLE}; text-align:left;">🔗 copy image URL</button>
            <button id="t2iChOpen" style="${BTN_STYLE}; text-align:left; border-color:#5a5;">↗️ open the AI chat (with your gallery linked)</button>
          </div>
        </div>`;
      let q = s => ov.querySelector(s);
      let close = function() { ov.remove(); };
      q("#t2iChClose").addEventListener("click", close);
      closeOnBackdrop(ov);
      let hint = q("#t2iChHint");
      if(promptText) hint.textContent = "The chat re-draws this image from its prompt. Paste any of these into a message:";
      else hint.textContent = "No prompt was saved for this image, so only its URL can be sent. Tip: add the prompt with ✏️ edit first.";
      if(!promptText) { q("#t2iChImg").disabled = true; q("#t2iChCmd").disabled = true; q("#t2iChPrompt").disabled = true; }
      q("#t2iChImg").addEventListener("click", function() { copyTextToClipboard("<image>" + promptText + "</image>", this, "🖼️ copy as <image>prompt</image>"); });
      q("#t2iChCmd").addEventListener("click", function() { copyTextToClipboard("/image " + promptText, this, '⌨️ copy the "/image prompt" command'); });
      q("#t2iChPrompt").addEventListener("click", function() { copyTextToClipboard(promptText, this, "📋 copy prompt"); });
      q("#t2iChUrl").addEventListener("click", function() { copyTextToClipboard(url, this, "🔗 copy image URL"); });
      q("#t2iChOpen").addEventListener("click", openLinkedChatGallery);
      document.body.appendChild(ov);
    }

    // ---- post a Personal Gallery image to the community gallery ----
    // Same platform flow as Community/Explore "Post from Personal": the saved prompt is
    // re-opened in the platform's gallery-save embed and re-created as a fresh variation
    // (exact pixels can't be re-uploaded). User finishes with ❤️ → 📮 send to gallery.
    function postPersonalToCommunity(url) {
      let it = findItem(url);
      if(!it || it.origin) { toast("⚠️ only your own gallery images can be posted"); return; }
      let promptText = String((it && it.prompt) || "").trim();
      if(!promptText) { toast("⚠️ that image has no saved prompt — add one with ✏️ edit first"); return; }
      if(window.CommunityCap && !window.CommunityCap.canPost()) { toast(window.CommunityCap.blockedMsg()); return; }
      if(window.CommunityCap) window.CommunityCap.notePosted();
      let title = String((it && it.title) || "").trim() || promptText.slice(0, 60) || "community post";
      let ov = newOverlay(100008);
      ov.innerHTML = `\n        <div style="${CARD_BOX} width:min(620px,100%); max-height:92vh; overflow:auto;">\n          <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem;">\n            <b>🌍 Post to community gallery</b>\n            <span style="flex-grow:1;"></span>\n            <button id="t2iPostClose" style="${BTN_STYLE}">✖️</button>\n          </div>\n          <img src="${sanitizeHtml(it.url)}" style="width:100%; max-height:150px; object-fit:contain; background:#000; border-radius:5px; margin-bottom:0.5rem;">\n          <div style="font-size:79%; opacity:0.75; margin-bottom:0.5rem;">Your saved image can\u2019t be uploaded pixel-for-pixel — the platform only publishes pictures through its own generator. So the saved prompt (<b>${sanitizeHtml(title).slice(0, 80)}</b>) is re-opened below in the platform\u2019s gallery-save view and re-created as a fresh variation. When it\u2019s ready, click the <b>❤️</b> button on the image, then <b>📮 send to gallery</b> — keep the gallery name as <b>public</b> so it lands in this studio\u2019s community gallery. Anything flagged NSFW only shows in the gated <b>🔞 NSFW Gallery</b>.</div>\n          <div id="t2iPostEmbed"></div>\n        </div>`;
      let q = s => ov.querySelector(s);
      q("#t2iPostClose").addEventListener("click", function() { ov.remove(); });
      closeOnBackdrop(ov);
      document.body.appendChild(ov);
      let hashData = {
        saveChannel: window.generatorName,
        saveTitle: title.replace(/\s+/g, " ").slice(0, 60),
        saveDescription: promptText,
        prompt: promptText,
        seed: -1,
        resolution: "768x768",
        guidanceScale: 7,
        defaultGuidanceScale: 7,
        negativePrompt: "",
        requestId: Math.random().toString(),
        iframeId: "galPostEmbed" + Math.random().toString().slice(2)
      };
      let iframe = document.createElement("iframe");
      iframe.className = "text-to-image-plugin-image-iframe";
      iframe.setAttribute("data-already-added-intersection-observer", "yes");
      iframe.src = "https://image-generation.perchance.org/embed#" + encodeURIComponent(JSON.stringify(hashData));
      iframe.style.cssText = "width:100%;height:540px;border:0;background:transparent;display:block;";
      q("#t2iPostEmbed").appendChild(iframe);
    }
    window.t2iPostPersonalToCommunity = postPersonalToCommunity;

    // ---- import / restore (inverse of "Export all links") ----
    function parseImportItems(text) {
      let out = [];
      let trimmed = String(text || "").trim();
      if(!trimmed) return out;
      if(trimmed[0] === "[" || trimmed[0] === "{") {
        let data = null;
        try { data = JSON.parse(trimmed); } catch(e) { data = null; }
        if(data) {
          let arr = Array.isArray(data) ? data : null;
          if(!arr && data.localStorage) {
            let raw = data.localStorage.t2iGalleryItems;
            if(typeof raw === "string") { try { arr = JSON.parse(raw); } catch(e) { arr = null; } }
            else if(Array.isArray(raw)) arr = raw;
          }
          if(!arr && Array.isArray(data.items)) arr = data.items;
          if(arr) {
            for(let it of arr) {
              if(!it) continue;
              let url = it.url || it.href || it.link;
              if(!url) continue;
              out.push({ url: String(url), prompt: String(it.prompt || ""), title: String(it.title || ""), folder: normalizeFolderName(it.folder), timestamp: Number(it.timestamp) || Date.now(), tags: Array.isArray(it.tags) ? it.tags.map(String).slice(0, 24) : [], fav: !!it.fav });
            }
            return out;
          }
        }
      }
      for(let line of trimmed.split(/\r?\n/)) {
        line = line.replace(/\s+$/, "");
        if(!line || line[0] === "#" || /^file\b/i.test(line)) continue;
        let parts = line.split("\t");
        let urlIdx = parts.findIndex(p => /^https?:\/\//i.test(p.trim()));
        if(urlIdx === -1) break;
        let url = parts[urlIdx].trim();
        let title = "", folder = "", dateStr = "", promptText = "";
        if(urlIdx === 0) { title = parts[1] || ""; folder = parts[2] || ""; dateStr = parts[3] || ""; promptText = parts.slice(4).join("\t"); }
        else if(urlIdx === 1) { title = parts[2] || ""; dateStr = parts[3] || ""; promptText = parts.slice(4).join("\t"); }
        else { promptText = parts.slice(urlIdx + 1).join("\t"); }
        let ts = Date.parse(dateStr);
        if(isNaN(ts)) ts = Date.now();
        out.push({ url: url, prompt: String(promptText).trim(), title: String(title).trim(), folder: normalizeFolderName(folder), timestamp: ts, tags: [], fav: false });
      }
      return out;
    }
    function openImportModal() {
      let ov = newOverlay(100004);
      ov.innerHTML = `
        <div style="${CARD_BOX} width:min(560px,100%); max-height:92vh; overflow:auto;">
          <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.35rem;">
            <b>⬆️ Import gallery links</b>
            <span style="flex-grow:1;"></span>
            <button id="t2iImpClose" style="${BTN_STYLE}">✖️</button>
          </div>
          <div style="font-size:78%; opacity:0.72; margin-bottom:0.5rem;">Paste an “Export all links” file, a ZIP manifest, one URL per line, or a Sites backup JSON. URLs already in your gallery are skipped.</div>
          <textarea id="t2iImpText" placeholder="url&#9;title&#9;folder&#9;date&#9;prompt&#10;https://user.uploads.dev/file/....jpg&#9;my image&#9;portraits&#9;…&#10;&#10;(or paste JSON / pick a file below)" style="${INP_STYLE}; height:9rem; resize:vertical;"></textarea>
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center; margin-top:0.5rem;">
            <input id="t2iImpFile" type="file" accept=".txt,.json,.zip,text/plain,application/json" style="font-size:78%; max-width:100%;">
            <label style="font-size:80%; display:flex; align-items:center; gap:0.3rem;"><input id="t2iImpIncludeHidden" type="checkbox" checked> also un-hide matching deleted images</label>
          </div>
          <div id="t2iImpStatus" style="font-size:80%; min-height:1.2em; margin:0.45rem 0; opacity:0.85;"></div>
          <div style="display:flex; gap:0.4rem;">
            <button id="t2iImpGo" style="${BTN_STYLE}; flex:1; border-color:#5a5;">⬆️ import</button>
            <button id="t2iImpCancel" style="${BTN_STYLE}">cancel</button>
          </div>
        </div>`;
      let q = s => ov.querySelector(s);
      let close = function() { ov.remove(); };
      let status = q("#t2iImpStatus");
      q("#t2iImpClose").addEventListener("click", close);
      q("#t2iImpCancel").addEventListener("click", close);
      closeOnBackdrop(ov);
      q("#t2iImpFile").addEventListener("change", async function() {
        let f = this.files && this.files[0];
        if(!f) return;
        if(/\.zip$/i.test(f.name)) {
          status.textContent = "reading zip…";
          try {
            let JSZip = (await import("https://esm.sh/jszip@3.10.1")).default;
            let zip = await JSZip.loadAsync(f);
            let name = Object.keys(zip.files).find(n => /(^|\/)manifest\.txt$/i.test(n));
            if(!name) { status.textContent = "⚠️ no manifest.txt found in that zip."; return; }
            q("#t2iImpText").value = await zip.files[name].async("string");
            status.textContent = "manifest loaded from the zip — click import.";
          } catch(e) { console.error(e); status.textContent = "⚠️ could not read that zip."; }
          return;
        }
        try {
          q("#t2iImpText").value = await f.text();
          status.textContent = "loaded " + f.name + " — click import.";
        } catch(e) { status.textContent = "⚠️ could not read that file."; }
      });
      q("#t2iImpGo").addEventListener("click", function() {
        let items = parseImportItems(q("#t2iImpText").value);
        if(!items.length) { status.textContent = "⚠️ no image links found in that text."; return; }
        let existing = new Set(getGallery().map(i => i.url));
        let fresh = items.filter(i => !existing.has(i.url));
        if(!fresh.length) { status.textContent = "Nothing new — all " + items.length + " URL" + (items.length === 1 ? " is" : "s are") + " already in the gallery."; return; }
        pushGalleryUndo("import links");
        let seen = new Set();
        let merged = fresh.concat(getGallery()).filter(function(i) {
          if(!i || !i.url || seen.has(i.url)) return false;
          seen.add(i.url); return true;
        }).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        saveGallery(merged);
        let restored = 0;
        if(q("#t2iImpIncludeHidden").checked) restored = removeHidden(fresh.map(i => i.url));
        for(let i of fresh) if(i.folder) knownFolders.add(i.folder);
        renderGallery();
        let msg = "⬆️ imported " + fresh.length + " image" + (fresh.length === 1 ? "" : "s") + (restored ? " · un-hid " + restored : "");
        toast(msg);
        status.textContent = "✅ " + msg;
      });
      document.body.appendChild(ov);
    }

    // ---- hidden images (tombstones) viewer ----
    function restoreHidden(urls) {
      let set = new Set(urls);
      let items = getHidden().filter(x => set.has(x.url));
      if(!items.length) return 0;
      pushGalleryUndo("restore " + items.length + " hidden");
      let existing = new Set(getGallery().map(i => i.url));
      // chat images (origin:"chat") are display-only — un-hiding them must NOT copy them into our own gallery
      let add = items.filter(i => !i.origin && !existing.has(i.url)).map(function(i) {
        let o = { url: i.url, prompt: i.prompt || "", title: i.title || "", folder: i.folder || "", timestamp: i.timestamp || Date.now() };
        if(i.fav) o.fav = true;
        if(i.tags && i.tags.length) o.tags = i.tags.slice(0, 24);
        return o;
      });
      saveGallery(add.concat(getGallery()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
      removeHidden(items.map(i => i.url));
      for(let i of add) if(i.folder) knownFolders.add(i.folder);
      return items.length;
    }
    function openHiddenViewer() {
      let ov = newOverlay(100005);
      ov.id = "t2iGalHiddenModal";
      ov.innerHTML = `
        <div style="${CARD_BOX} width:min(760px,100%); max-height:90vh; display:flex; flex-direction:column; padding:0; overflow:hidden;">
          <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; padding:0.6rem 0.75rem; border-bottom:1px solid var(--th-border);">
            <b>♻️ Removed images</b>
            <span id="t2iHidCount" style="font-size:82%; opacity:0.7;"></span>
            <span style="flex-grow:1;"></span>
            <button id="t2iHidRestoreAll" style="${BTN_STYLE}">♻️ restore all</button>
            <button id="t2iHidForgetAll" style="${BTN_STYLE}; border-color:#b33; color:#f88;">🗑️ forget all</button>
            <button id="t2iHidClose" style="${BTN_STYLE}">✖️</button>
          </div>
          <div style="font-size:78%; opacity:0.68; padding:0.45rem 0.75rem 0; text-align:left;">Deleted or hidden images land here — restore/unhide them, or forget them permanently.</div>
          <div id="t2iHidGrid" style="padding:0.75rem; overflow-y:auto; display:flex; flex-wrap:wrap; gap:0.6rem;"></div>
        </div>`;
      let q = s => ov.querySelector(s);
      let grid = q("#t2iHidGrid");
      function paint() {
        let h = getHidden();
        q("#t2iHidCount").textContent = h.length ? h.length + " image" + (h.length === 1 ? "" : "s") : "";
        q("#t2iHidRestoreAll").disabled = !h.length;
        q("#t2iHidForgetAll").disabled = !h.length;
        grid.innerHTML = "";
        if(!h.length) {
          grid.innerHTML = '<div style="opacity:0.7; padding:1rem; width:100%; text-align:center;">Nothing hidden — deleted images appear here so you can restore them.</div>';
          return;
        }
        for(let it of h) {
          let card = document.createElement("div");
          card.style.cssText = "width:150px; border:1px solid var(--th-border); border-radius:6px; overflow:hidden; background:var(--box-color,#222);";
          card.innerHTML = '<img src="' + sanitizeHtml(it.url) + '" loading="lazy" style="width:100%; height:110px; object-fit:cover; display:block; background:#000;">' +
            '<div style="font-size:70%; padding:0.25rem 0.3rem; word-break:break-word;">' + (it.origin ? "💬 from chat · " : "") + sanitizeHtml(it.title || "untitled") + (it.tags && it.tags.length ? '<br>🏷️ ' + sanitizeHtml(it.tags.join(" ")) : "") + "</div>" +
            '<div style="display:flex; gap:0.2rem; padding:0.25rem;"><button data-hid-restore style="' + BTN_STYLE + '; flex:1; font-size:70%;">' + (it.origin ? "♻️ unhide" : "♻️ restore") + '</button><button data-hid-forget style="' + BTN_STYLE + '; font-size:70%;">🗑️</button></div>';
          card.querySelector("[data-hid-restore]").addEventListener("click", function() {
            let n = restoreHidden([it.url]);
            paint();
            renderGallery();
            if(n) toast("♻️ restored " + n + " image" + (n === 1 ? "" : "s"));
          });
          card.querySelector("[data-hid-forget]").addEventListener("click", async function() {
            if(!(await window.uiConfirm("Forget this image link permanently?", { okText: 'Forget forever', danger: true }))) return;
            pushGalleryUndo("forget hidden image");
            removeHidden([it.url]);
            paint();
            toast("🗑️ forgotten");
          });
          grid.appendChild(card);
        }
      }
      let close = function() { ov.remove(); };
      q("#t2iHidClose").addEventListener("click", close);
      closeOnBackdrop(ov);
      q("#t2iHidRestoreAll").addEventListener("click", function() {
        let h = getHidden();
        if(!h.length) return;
        let n = restoreHidden(h.map(i => i.url));
        paint();
        renderGallery();
        if(n) toast("♻️ restored " + n + " image" + (n === 1 ? "" : "s"));
      });
      q("#t2iHidForgetAll").addEventListener("click", async function() {
        let h = getHidden();
        if(!h.length) return;
        if(!(await window.uiConfirm("Forget all " + h.length + " hidden image link" + (h.length === 1 ? "" : "s") + " permanently?", { okText: 'Forget all', danger: true }))) return;
        pushGalleryUndo("forget all hidden");
        removeHidden(h.map(i => i.url));
        paint();
        toast("🗑️ forgotten " + h.length);
      });
      document.body.appendChild(ov);
      paint();
    }

    // ---- lightbox (full-size view with ←/→ navigation) ----
    function openLightbox(url) {
      let items = visibleItems();
      let idx = items.findIndex(i => i.url === url);
      if(idx === -1) { let one = findItem(url); items = one ? [one] : []; idx = 0; }
      if(!items.length) return;
      closeLightbox();
      let ov = document.createElement("div");
      ov.id = "t2iGalLightbox";
      ov.style.cssText = "position:fixed; inset:0; z-index:100006; background:rgba(0,0,0,0.94); display:flex; flex-direction:column; color:#fff;";
      ov.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.35rem; flex-wrap:wrap; padding:0.5rem 0.6rem; background:rgba(0,0,0,0.5);">
          <span id="t2iLbCounter" style="font-size:82%; opacity:0.85; margin-right:0.4rem;"></span>
          <span style="flex-grow:1;"></span>
          <button data-lb="star" style="${BTN_STYLE}" title="favorite (f)">☆</button>
          <button data-lb="edit" style="${BTN_STYLE}" title="edit (e)">✏️</button>
          <button data-lb="avatar" style="${BTN_STYLE}" title="set as avatar">🧑</button>
          <button data-lb="chat" style="${BTN_STYLE}" title="send to chat">💬</button>
          <button data-lb="post" style="${BTN_STYLE}" title="post to community gallery">🌍</button>
          <a data-lb="open" target="_blank" rel="noopener" style="${BTN_STYLE}; text-decoration:none;">open</a>
          <a data-lb="download" download style="${BTN_STYLE}; text-decoration:none;">save</a>
          <button data-lb="copyprompt" style="${BTN_STYLE}">📋 prompt</button>
          <button data-lb="copyurl" style="${BTN_STYLE}" title="copy url">🔗</button>
          <button data-lb="delete" style="${BTN_STYLE}; border-color:#b33; color:#f88;" title="delete (d)">🗑️</button>
          <button data-lb="close" style="${BTN_STYLE}" title="close (Esc)">✖️</button>
        </div>
        <div style="flex-grow:1; position:relative; display:flex; align-items:center; justify-content:center; min-height:0;">
          <button data-lb="prev" style="position:absolute; left:0.5rem; top:50%; transform:translateY(-50%); ${BTN_STYLE}; font-size:150%; padding:0.1rem 0.6rem;">‹</button>
          <img id="t2iLbImg" style="max-width:100%; max-height:100%; object-fit:contain;">
          <button data-lb="next" style="position:absolute; right:0.5rem; top:50%; transform:translateY(-50%); ${BTN_STYLE}; font-size:150%; padding:0.1rem 0.6rem;">›</button>
        </div>
        <div id="t2iLbCaption" style="padding:0.5rem 0.9rem 0.9rem; font-size:82%; max-height:24vh; overflow-y:auto; text-align:left; background:rgba(0,0,0,0.4);"></div>`;
      let q = s => ov.querySelector(s);
      let state = { overlay: ov, items: items, index: idx, paint: null, onKey: null };
      lightbox = state;
      state.paint = function() {
        let it = state.items[state.index];
        if(!it) { closeLightbox(); return; }
        let own = getGallery().some(i => i.url === it.url);
        q("#t2iLbImg").src = it.url;
        q("#t2iLbCounter").textContent = (state.index + 1) + " / " + state.items.length;
        let cap = q("#t2iLbCaption");
        cap.innerHTML = "";
        let title = document.createElement("div");
        title.style.cssText = "font-weight:bold; margin-bottom:0.2rem;";
        title.textContent = (it.fav ? "⭐ " : "") + (it.title || "untitled");
        cap.appendChild(title);
        let bits = [];
        if(it.timestamp) bits.push(new Date(it.timestamp).toLocaleString());
        if(it.folder) bits.push("📁 " + it.folder);
        if(it.tags && it.tags.length) bits.push("🏷️ " + it.tags.join(", "));
        if(it.origin) bits.push("💬 from the chat gallery");
        let meta = document.createElement("div");
        meta.style.cssText = "opacity:0.65; font-size:88%;";
        meta.textContent = bits.join(" · ");
        cap.appendChild(meta);
        if(it.prompt) { let p = document.createElement("div"); p.style.cssText = "margin-top:0.35rem; white-space:pre-wrap; opacity:0.92;"; p.textContent = it.prompt; cap.appendChild(p); }
        let starBtn = q('[data-lb="star"]');
        starBtn.textContent = it.fav ? "⭐" : "☆";
        starBtn.disabled = !own;
        q('[data-lb="edit"]').style.display = own ? "" : "none";
        q('[data-lb="delete"]').style.display = own ? "" : "none";
        q('[data-lb="chat"]').style.display = (own && it.prompt) ? "" : (own ? "" : "none");
        q('[data-lb="post"]').style.display = (own && it.prompt) ? "" : "none";
        q('[data-lb="copyprompt"]').style.display = it.prompt ? "" : "none";
        q('[data-lb="open"]').href = it.url;
        q('[data-lb="download"]').href = it.url;
        q('[data-lb="prev"]').style.display = state.items.length > 1 ? "" : "none";
        q('[data-lb="next"]').style.display = state.items.length > 1 ? "" : "none";
      };
      function step(n) { if(state.items.length < 2) return; state.index = (state.index + n + state.items.length) % state.items.length; state.paint(); }
      function current() { return state.items[state.index]; }
      ov.querySelectorAll("[data-lb]").forEach(function(b) {
        b.addEventListener("click", function(e) {
          let it = current();
          if(!it) return;
          let act = b.dataset.lb;
          if(act === "close") closeLightbox();
          else if(act === "prev") step(-1);
          else if(act === "next") step(1);
          else if(act === "star") toggleFav(it.url);
          else if(act === "edit") openEditModal(it.url);
          else if(act === "avatar") openAvatarModal(it.url);
          else if(act === "chat") openChatModal(it.url);
          else if(act === "post") postPersonalToCommunity(it.url);
          else if(act === "copyprompt") copyTextToClipboard(it.prompt || "", b, "📋 prompt");
          else if(act === "copyurl") copyTextToClipboard(it.url, b, "🔗");
          else if(act === "delete") deleteOne(it.url);
        });
      });
      state.onKey = function(e) {
        if(!lightbox || lightbox !== state) return;
        if(e.key === "Escape") { e.stopPropagation(); closeLightbox(); }
        else if(e.key === "ArrowLeft") { e.stopPropagation(); step(-1); }
        else if(e.key === "ArrowRight") { e.stopPropagation(); step(1); }
        else if(e.key === "f" || e.key === "F") { toggleFav(current().url); }
        else if(e.key === "e" || e.key === "E") { openEditModal(current().url); }
        else if(e.key === "d" || e.key === "D") { deleteOne(current().url); }
      };
      closeOnBackdrop(ov);
      document.body.appendChild(ov);
      document.addEventListener("keydown", state.onKey, true);
      state.paint();
    }
    function closeLightbox() {
      if(!lightbox) return;
      try { document.removeEventListener("keydown", lightbox.onKey, true); } catch(e) {}
      try { if(lightbox.overlay) lightbox.overlay.remove(); } catch(e) {}
      lightbox = null;
    }
    function refreshLightboxIfOpen() {
      if(!lightbox) return;
      let items = visibleItems();
      if(!items.length) { closeLightbox(); return; }
      let cur = lightbox.items[lightbox.index];
      lightbox.items = items;
      let idx = cur ? items.findIndex(i => i.url === cur.url) : -1;
      lightbox.index = idx === -1 ? Math.min(lightbox.index, items.length - 1) : idx;
      if(lightbox.paint) lightbox.paint();
    }

    function renderGallery() {
      if (document.getElementById("t2iGalleryModal") == null) return;
      let gallery = getGallery();
      let items = visibleItems();
      document.getElementById("t2iGalCount").textContent = items.length ? items.length + " image" + (items.length === 1 ? "" : "s") + (currentFolder != null ? " of " + gallery.length : "") : (gallery.length ? "0 shown" : "");
      let activeFilters = !!galQuery.trim() || galPromptFilter !== "all" || galFavFilter !== "all" || !!galTagFilter || galSource !== "__all__";
      document.getElementById("t2iGalSearchInfo").textContent = activeFilters ? items.length + " match" + (items.length === 1 ? "" : "es") : "";
      let filtered = currentFolder != null;
      document.getElementById("t2iGalZipBtn").textContent = filtered ? "📦 ZIP this folder" : "📦 Save all as ZIP";
      document.getElementById("t2iGalExportBtn").textContent = filtered ? "Export folder links" : "Export all links";
      document.getElementById("t2iGalSelectAllBtn").textContent = filtered ? "☑️ select all here" : "☑️ select all";
      document.getElementById("t2iGalFolderHint").textContent = currentFolder == null ? "" : (currentFolder === "" ? "showing unfiled images" : "showing 📂 " + currentFolder);
      refreshFolderBar();
      refreshTagFilter();
      try { let ssel = document.getElementById("t2iGalSourceFilter"); if(ssel && ssel.value !== galSource) ssel.value = galSource; } catch(e) {}
      updateFavFirstBtn();
      updateUndoBtn();
      updateHiddenCount();
      updateCapWarning();
      let total = items.length;
      let pageSize = galPageSize > 0 ? galPageSize : Math.max(1, total);
      let pages = Math.max(1, Math.ceil(total / pageSize));
      if(galPage > pages) galPage = pages;
      if(galPage < 1) galPage = 1;
      let start = (galPage - 1) * pageSize;
      let pageItems = items.slice(start, start + pageSize);
      let pageInfoEl = document.getElementById("t2iGalPageInfo");
      if(pageInfoEl) pageInfoEl.textContent = total ? ("page " + galPage + " / " + pages) : "";
      let rangeEl = document.getElementById("t2iGalRangeInfo");
      if(rangeEl) rangeEl.textContent = total ? ("showing " + (start + 1) + "–" + (start + pageItems.length) + " of " + total) : "";
      document.getElementById("t2iGalPrevBtn").disabled = galPage <= 1;
      document.getElementById("t2iGalNextBtn").disabled = galPage >= pages;
      let pagerRow = document.getElementById("t2iGalPagerRow");
      if(pagerRow) pagerRow.hidden = total === 0; // no page controls for an empty view
      let ctn = document.getElementById("t2iGalImages");
      if(items.length === 0) {
        if(gallery.length === 0 && peerItems.length === 0) {
          // Nothing has ever been saved here — say what this panel is and how to fill it.
          ctn.innerHTML =
            '<div class="t2i-gal-empty">' +
              '<div class="t2i-gal-empty-ico">🖼️</div>' +
              '<div class="t2i-gal-empty-title">No saved images yet</div>' +
              '<div class="t2i-gal-empty-txt">Images you generate show up here when you press <b>💾 / ☁️ save</b> on them (autosave is on by default). You can also add your own pictures straight from this device — they never leave this browser unless you share the link.</div>' +
              '<div class="t2i-gal-empty-btns">' +
                '<button class="t2i-gal-empty-btn primary" data-empty-add type="button">➕ Add images from your device</button>' +
                '<button class="t2i-gal-empty-btn" data-empty-gen type="button">🎨 Generate an image</button>' +
              '</div>' +
            '</div>';
          let addBtn = ctn.querySelector("[data-empty-add]");
          if(addBtn) addBtn.addEventListener("click", openAddImagesPicker);
          let genBtn = ctn.querySelector("[data-empty-gen]");
          if(genBtn) genBtn.addEventListener("click", function() { closeGalleryModal(); if(window.showTab) window.showTab("gen"); });
          return;
        }
        ctn.innerHTML =
          '<div class="t2i-gal-empty">' +
            '<div class="t2i-gal-empty-ico">🔎</div>' +
            '<div class="t2i-gal-empty-title">Nothing matches right now</div>' +
            '<div class="t2i-gal-empty-txt">' + (currentFolder == null ? "No images match your search or filters." : "No images in this folder match your search or filters.") + '</div>' +
            '<div class="t2i-gal-empty-btns"><button class="t2i-gal-empty-btn" data-empty-clear type="button">✖️ Clear search &amp; filters</button></div>' +
          '</div>';
        let clearBtn = ctn.querySelector("[data-empty-clear]");
        if(clearBtn) clearBtn.addEventListener("click", function() {
          galQuery = ""; galPromptFilter = "all"; galFavFilter = "all"; galTagFilter = ""; galSource = "__all__"; currentFolder = null; galPage = 1;
          let sf = document.getElementById("t2iGalSourceFilter"); if(sf) sf.value = "__all__";
          let s = document.getElementById("t2iGalSearch"); if(s) s.value = "";
          let pf = document.getElementById("t2iGalPromptFilter"); if(pf) pf.value = "all";
          let ff = document.getElementById("t2iGalFavFilter"); if(ff) ff.value = "all";
          refreshFolderBar();
          renderGallery();
        });
        return;
      }
      ctn.innerHTML = "";
      for(let item of pageItems) {
        let timeStr = item.timestamp ? new Date(item.timestamp).toLocaleString() : "";
        let folderName = normalizeFolderName(item.folder);
        let folderOptions = ["", ...knownFolders].map(f => '<option value="' + sanitizeHtml(f) + '">' + (f ? "📂 " + sanitizeHtml(f) : "🗂️ Unfiled") + "</option>").join("");
        let card = document.createElement("div");
        card.className = "gal-card";
        let isPeer = !!item.origin;
        let itemTags = (item.tags || []).filter(Boolean);
        let isFav = !!item.fav;
        card.innerHTML = `
          <label style="position:absolute; top:0.25rem; left:0.25rem; z-index:2; background:rgba(0,0,0,0.55); border-radius:3px; padding:0.1rem 0.25rem; cursor:pointer; line-height:1; display:${(currentFolder === null || pick) ? "block" : "none"};">
            <input type="checkbox" data-select-url="${sanitizeHtml(item.url)}" style="cursor:pointer;">
          </label>
          ${isPeer ? "" : '<button class="gal-star' + (isFav ? "" : " off") + '" data-star-url="' + sanitizeHtml(item.url) + '" title="' + (isFav ? "unpin favorite" : "pin to top / favorite") + '">' + (isFav ? "⭐" : "☆") + "</button>"}
          <img src="${sanitizeHtml(item.url)}" loading="lazy" alt="saved image" data-lightbox-url="${sanitizeHtml(item.url)}" title="click to view full size">
          <div class="info">${isPeer ? "<span style=\"opacity:0.8;\" title=\"" + sanitizeHtml(item.origin || "") + "\">🌐 " + sanitizeHtml(String(item.origin || "").split("/")[0]) + " · </span>" : ""}${isFav ? "⭐ " : ""}${sanitizeHtml((item.title || "untitled") + (timeStr ? " · " + timeStr : ""))}${folderName ? "<br>📁 " + sanitizeHtml(folderName) : ""}</div>
          ${item.prompt ? '<div class="gal-prompt" title="The prompt that made this image">' + sanitizeHtml(item.prompt) + "</div>" : ""}
          ${itemTags.length ? '<div class="gal-tags">' + itemTags.map(t => '<button class="gal-tag" data-tag="' + sanitizeHtml(t) + '" title="show images tagged ' + sanitizeHtml(t) + '">#' + sanitizeHtml(t) + "</button>").join("") + "</div>" : ""}
          <div class="buttons">
            <a href="${sanitizeHtml(item.url)}" target="_blank" rel="noopener">open</a>
            <button data-copy-url="${sanitizeHtml(item.url)}">copy url</button>
            ${item.prompt ? '<button data-copy-prompt="' + sanitizeHtml(item.prompt) + '">copy prompt</button>' : ""}
            ${item.prompt ? '<button data-vault-prompt="' + sanitizeHtml(item.prompt) + '" data-vault-url="' + sanitizeHtml(item.url) + '" title="Save this prompt to your vault">📚</button><button data-send-prompt="' + sanitizeHtml(item.prompt) + '" title="Send this prompt to another tab">▸</button>' : ""}
            ${isPeer ? "" : '<button data-chat-url="' + sanitizeHtml(item.url) + '" title="Send this image to the AI chat">💬</button><button data-avatar-url="' + sanitizeHtml(item.url) + '" title="Set as a character avatar">🧑</button><button data-edit-url="' + sanitizeHtml(item.url) + '" title="Edit prompt / label / date / tags">✏️</button>'}
            ${(isPeer || !item.prompt) ? "" : '<button data-post-url="' + sanitizeHtml(item.url) + '" title="Post to community gallery">🌍</button>'}
            ${isPeer ? '<button data-hide-peer-url="' + sanitizeHtml(item.url) + '" title="hide this chat image from the gallery (restorable under ♻️ Removed)">🙈 hide</button>' : ""}
            <a href="${sanitizeHtml(item.url)}" download>save</a>
            ${isPeer ? "" : '<button data-delete-url="' + sanitizeHtml(item.url) + '" style="color:#f88; border-color:#b33; background:rgba(180,50,50,0.2);" title="remove from gallery">🗑️</button>'}
          </div>
          ${isPeer ? "" : '<div class="gal-move-wrap"><span>📁 move to folder:</span><select class="gal-move-sel" data-move-url="' + sanitizeHtml(item.url) + '" title="Move to folder">' + folderOptions + "</select></div>"}
        `;
        card.style.position = "relative";
        if(folderName && !isPeer) {
          let moveSel = card.querySelector(".gal-move-sel");
          let match = [...moveSel.options].find(o => o.value && o.value.toLowerCase() === folderName.toLowerCase());
          if(match) moveSel.value = match.value;
        }
        ctn.appendChild(card);
      }
      let currentUrls = new Set(gallery.map(i => i.url));
      for(let it of peerItems) currentUrls.add(it.url); // chat-gallery cards are selectable too
      for(let u of [...selectedUrls]) if(!currentUrls.has(u)) selectedUrls.delete(u);
      syncSelectionCheckboxes();
      updateSelectionBar();
      ctn.querySelectorAll("[data-select-url]").forEach(cb => {
        cb.addEventListener("change", function() {
          if(cb.checked) selectedUrls.add(cb.dataset.selectUrl); else selectedUrls.delete(cb.dataset.selectUrl);
          let card = cb.closest(".gal-card");
          if(card) card.classList.toggle("picked", cb.checked);
          updateSelectionBar();
        });
      });
      ctn.querySelectorAll("[data-copy-url]").forEach(btn => {
        btn.addEventListener("click", async function() {
          try {
            await navigator.clipboard.writeText(btn.dataset.copyUrl);
            btn.textContent = "✅ copied";
            setTimeout(() => { btn.textContent = "copy url"; }, 1500);
          } catch(e) {
            prompt("Copy this URL:", btn.dataset.copyUrl);
          }
        });
      });
      ctn.querySelectorAll("[data-copy-prompt]").forEach(btn => {
        btn.addEventListener("click", async function() {
          try {
            await navigator.clipboard.writeText(btn.dataset.copyPrompt);
            btn.textContent = "✅ copied";
            setTimeout(() => { btn.textContent = "copy prompt"; }, 1500);
          } catch(e) {
            prompt("Copy this prompt:", btn.dataset.copyPrompt);
          }
        });
      });
      ctn.querySelectorAll("[data-vault-prompt]").forEach(btn => {
        btn.addEventListener("click", function() {
          if(!window.Vault) { if(window.vaultToast) window.vaultToast("⚠️ vault still loading…"); return; }
          window.Vault.addImage(btn.dataset.vaultUrl, btn.dataset.vaultPrompt, { tags: ["gallery"], label: btn.dataset.vaultPrompt.slice(0, 48) });
          btn.textContent = "✅";
          setTimeout(() => { btn.textContent = "📚"; }, 1500);
        });
      });
      ctn.querySelectorAll("[data-send-prompt]").forEach(btn => {
        btn.addEventListener("click", function() {
          if(!window.PromptBridge) { if(window.vaultToast) window.vaultToast("⚠️ bridge still loading…"); return; }
          window.PromptBridge.sendTo(btn.dataset.sendPrompt, { anchor: btn, preview: btn.dataset.sendPrompt, tags: ["gallery"] });
        });
      });
      ctn.querySelectorAll("[data-star-url]").forEach(btn => {
        btn.addEventListener("click", function(e) { e.preventDefault(); e.stopPropagation(); toggleFav(btn.dataset.starUrl); });
      });
      ctn.querySelectorAll("[data-lightbox-url]").forEach(img => {
        img.addEventListener("click", function() {
          if(pick) {
            let u = img.dataset.lightboxUrl;
            if(selectedUrls.has(u)) selectedUrls.delete(u); else selectedUrls.add(u);
            syncSelectionCheckboxes();
            updateSelectionBar();
            return;
          }
          openLightbox(img.dataset.lightboxUrl);
        });
      });
      ctn.querySelectorAll("[data-tag]").forEach(btn => {
        btn.addEventListener("click", function(e) { e.preventDefault(); e.stopPropagation(); galTagFilter = btn.dataset.tag; galPage = 1; renderGallery(); });
      });
      ctn.querySelectorAll("[data-edit-url]").forEach(btn => {
        btn.addEventListener("click", function() { openEditModal(btn.dataset.editUrl); });
      });
      ctn.querySelectorAll("[data-chat-url]").forEach(btn => {
        btn.addEventListener("click", function() { openChatModal(btn.dataset.chatUrl); });
      });
      ctn.querySelectorAll("[data-avatar-url]").forEach(btn => {
        btn.addEventListener("click", function() { openAvatarModal(btn.dataset.avatarUrl); });
      });
      ctn.querySelectorAll("[data-post-url]").forEach(btn => {
        btn.addEventListener("click", function() { postPersonalToCommunity(btn.dataset.postUrl); });
      });
      ctn.querySelectorAll("[data-delete-url]").forEach(btn => {
        btn.addEventListener("click", function() { deleteOne(btn.dataset.deleteUrl); });
      });
      ctn.querySelectorAll("[data-hide-peer-url]").forEach(btn => {
        btn.addEventListener("click", function() { hidePeer(btn.dataset.hidePeerUrl); });
      });
      ctn.querySelectorAll("[data-move-url]").forEach(sel => {
        sel.addEventListener("change", function() {
          let g = getGallery();
          let item = g.find(i => i.url === sel.dataset.moveUrl);
          let dest = normalizeFolderName(sel.value);
          if(item && normalizeFolderName(item.folder) !== dest) {
            pushGalleryUndo("move to folder");
            item.folder = dest;
            if(dest) knownFolders.add(dest);
            saveGallery(g);
          }
          renderGallery();
        });
      });
      refreshLightboxIfOpen();
      if(getNsfwFilterSetting()) censorGalleryCards(ctn);
    }
    async function censorGalleryCards(ctn) {
      let cards = [...ctn.querySelectorAll(".gal-card")];
      for(let card of cards) {
        let img = card.querySelector("img");
        if(!img) continue;
        let url = img.getAttribute("src");
        if(!url) continue;
        let isNsfw = await checkNsfw(url);
        if(isNsfw === true && card.isConnected) applyCardCensor(card);
      }
    }
    function applyCardCensor(card) {
      if(card.querySelector(".gal-nsfw-overlay")) return;
      let img = card.querySelector("img");
      if(!img) return;
      img.style.filter = "blur(14px)";
      let ov = document.createElement("div");
      ov.className = "gal-nsfw-overlay";
      ov.style.cssText = "position:absolute; inset:0; z-index:2; display:flex; align-items:center; justify-content:center; gap:0.3rem; background:rgba(15,15,15,0.45); cursor:pointer; color:#fff; font-size:120%;";
      ov.innerHTML = '🔞<span style="font-size:70%;">NSFW</span>';
      ov.addEventListener("click", function() { img.style.filter = ""; ov.remove(); });
      card.appendChild(ov);
    }

    // ---------- pick mode: reuse the real gallery as an image chooser ----------
    function refreshPickBar() {
      let n = selectedUrls.size;
      let cnt = document.getElementById("t2iGalPickCount");
      if(cnt) cnt.textContent = n ? (n + " selected") : "nothing selected yet";
      let addBtn = document.getElementById("t2iGalPickAdd");
      if(addBtn) {
        addBtn.textContent = n ? ("✅ Add " + n + " " + (pick.addNoun || "to selection")) : "✅ Add";
        addBtn.disabled = n === 0;
      }
    }
    function pickedItems() {
      let map = new Map();
      for(let it of getGallery()) map.set(it.url, it);
      for(let it of peerItems) if(!map.has(it.url)) map.set(it.url, it);
      return [...selectedUrls].map(u => map.get(u)).filter(Boolean);
    }
    function closeGalleryModal() {
      try { closeMoveMenu(); } catch(e) {}
      if(lightbox && lightbox.overlay) { try { lightbox.overlay.remove(); } catch(e) {} lightbox = null; }
      // Tear down any modal stacked on top of the gallery (edit / avatar / chat / import / removed).
      document.querySelectorAll("[data-gal-nested]").forEach(function(o) { try { o.remove(); } catch(e) {} });
      overlay.remove();
    }
    // Esc inside a stacked modal should close that modal, not the whole gallery. Boundary events
    // let us settle this in one place: a modal closes itself, otherwise Esc falls through to the
    // gallery-level (and then page-level) handlers. Captured before the page handler so we can
    // stop it when a modal consumed the key.
    if(!document.__t2iNestedEsc) {
      document.__t2iNestedEsc = true;
      document.addEventListener("keydown", function(e) {
        if(e.key !== "Escape") return;
        if(document.getElementById("t2iGalLightbox")) return; // the lightbox owns Esc while it's open
        let nested = document.querySelectorAll("[data-gal-nested]");
        if(!nested.length) return;
        e.stopImmediatePropagation();
        try { nested[nested.length - 1].remove(); } catch(err) {}
      }, true);
    }
    if(pick) {
      let titleEl = document.getElementById("t2iGalTitle");
      if(titleEl) titleEl.textContent = pick.title || "🖼️ Pick images";
      let bar = document.getElementById("t2iGalPickBar");
      if(bar) bar.hidden = false;
      let hint = document.getElementById("t2iGalPickHint");
      if(hint) hint.textContent = pick.hint || "Tap images to select them, then press Add.";
      overlay.classList.add("pick-mode");
      let on = (id, fn) => { let el = document.getElementById(id); if(el) el.addEventListener("click", fn); };
      on("t2iGalPickAllBtn", function() { visibleItems().forEach(i => selectedUrls.add(i.url)); syncSelectionCheckboxes(); updateSelectionBar(); });
      on("t2iGalPickNoneBtn", function() { selectedUrls.clear(); syncSelectionCheckboxes(); updateSelectionBar(); });
      on("t2iGalPickCancel", closeGalleryModal);
      on("t2iGalPickAdd", function() {
        let items = pickedItems();
        if(!items.length) return;
        try { pick.onPick(items); } catch(e) { console.error("[t2i gallery pick] onPick failed", e); }
        closeGalleryModal();
      });
      let hideIds = ["t2iGalManagePanel", "t2iGalManageToggle", "t2iGalFolderRow", "t2iGalManageRow", "t2iGalUnlinkBtn", "t2iGalLinkBtn", "t2iGalPairBtn", "t2iGalCopyLinkBtn", "t2iGalZipBtn", "t2iGalExportBtn", "t2iGalImportBtn", "t2iGalHiddenBtn", "t2iGalUndoBtn", "t2iGalDeleteAllBtn", "t2iGalPeerStatus"];
      for(let id of hideIds) { let el = document.getElementById(id); if(el) el.hidden = true; }
    }

    overlay._render = renderGallery;
    overlay._capWarn = updateCapWarning;
    overlay._refreshFolders = function() { try { refreshFolderBar(); updateHiddenCount(); } catch(e) {} };
    window.t2iGetHidden = getHidden;
    window.t2iRestoreHidden = restoreHidden;
    window.t2iGalleryUndo = applyUndo;
    window.t2iOpenHiddenViewer = openHiddenViewer;
    renderGallery();
    updateGalleryButtonCount();
  }

  // ---------- new scratchpad panel (replaces the framework's scratchpad input) ----------
  const SCRATCH_LS_KEY = "t2iScratchpadText";
  const KEPT_LS_KEY = "t2iKeptPrompts";
  const AUTOKEEP_LS_KEY = "t2iAutokeepPrompts";
  const OLD_SCRATCH_LS_KEY = "rememberedInput_P9hkcjnv92hfO2bf9hiu_scratchpad";

  function getScratchText() { try { return localStorage[SCRATCH_LS_KEY] || ""; } catch(e) { return ""; } }
  function saveScratchText(t) { try { localStorage[SCRATCH_LS_KEY] = t; } catch(e) {} }
  function getKeptPrompts() { try { return JSON.parse(localStorage[KEPT_LS_KEY] || "[]"); } catch(e) { return []; } }
  function saveKeptPrompts(arr) { try { localStorage[KEPT_LS_KEY] = JSON.stringify(arr.slice(0, 2000)); } catch(e) {} }
  function getAutokeepSetting() { let v = localStorage[AUTOKEEP_LS_KEY]; return v === undefined ? true : v === "1"; }
  function setAutokeepSetting(v) { try { localStorage[AUTOKEEP_LS_KEY] = v ? "1" : "0"; } catch(e) {} }
  function addKeptPrompt(prompt) {
    let p = String(prompt || "").trim();
    if(!p) return;
    let arr = getKeptPrompts();
    arr.unshift({prompt: p, timestamp: Date.now()});
    saveKeptPrompts(arr);
    renderKeptSection();
    updateAutokeepToggle();
  }
  function removeKeptPrompt(index) {
    let arr = getKeptPrompts();
    if(index < 0 || index >= arr.length) return;
    arr.splice(index, 1);
    saveKeptPrompts(arr);
    renderKeptSection();
  }
  function clearKeptPrompts() {
    saveKeptPrompts([]);
    renderKeptSection();
    updateAutokeepToggle();
  }
  let parsedScratchVars = new Set();
  function parseScratchVariables(text) {
    for(let name of parsedScratchVars) delete window[name];
    parsedScratchVars.clear();
    for(let line of String(text || "").split("\n")) {
      if(!/^[A-Z0-9_]+? *=.+$/.test(line)) continue;
      let name = line.split("=")[0].trim();
      window[name] = line.split("=").slice(1).join("=").trim();
      parsedScratchVars.add(name);
    }
  }
  function updateAutokeepToggle() {
    let b = document.getElementById("t2iAutokeepToggle");
    if(!b) return;
    let on = getAutokeepSetting();
    b.textContent = on ? "📌 autokeep: ON" : "📌 autokeep: OFF";
    b.style.opacity = on ? "1" : "0.55";
    b.title = on ? "Every prompt used to generate an image is being saved to the Kept prompts list below." : "New prompts won't be saved to the Kept prompts list.";
  }
  function updateKeptHint() {
    let el = document.getElementById("t2iKeptHint");
    if(!el) return;
    el.textContent = getAutokeepSetting() ? "every prompt used to generate an image is saved here" : "autokeep is off — new prompts won't be added";
  }
  function renderKeptSection() {
    let ctn = document.getElementById("t2iKeptList");
    if(!ctn) return;
    let arr = getKeptPrompts();
    let countEl = document.getElementById("t2iKeptCount");
    if(countEl) countEl.textContent = arr.length;
    let emptyMsg = document.getElementById("t2iKeptEmpty");
    if(emptyMsg) emptyMsg.style.display = arr.length ? "none" : "block";
    let clearBtn = document.getElementById("t2iKeptClearBtn");
    if(clearBtn) clearBtn.style.display = arr.length ? "" : "none";
    ctn.innerHTML = "";
    if(!arr.length) return;
    for(let i = 0; i < arr.length; i++) {
      let entry = arr[i];
      let row = document.createElement("div");
      row.style.cssText = "display:flex; align-items:center; gap:0.35rem; padding:0.15rem 0; border-bottom:1px solid var(--th-border);";
      let copy = document.createElement("button");
      copy.textContent = "📋";
      copy.title = "Copy this prompt";
      copy.style.cssText = "flex:0 0 auto; cursor:pointer; font-size:80%; padding:0.1rem 0.3rem; border:1px solid var(--th-border); border-radius:4px; background:var(--box-color,#eee); color:inherit;";
      copy.addEventListener("click", async function() {
        try {
          await navigator.clipboard.writeText(entry.prompt);
          copy.textContent = "✅";
          setTimeout(() => { copy.textContent = "📋"; }, 1200);
        } catch(e) {
          prompt("Copy this prompt:", entry.prompt);
        }
      });
      let text = document.createElement("span");
      text.textContent = entry.prompt;
      text.title = entry.prompt;
      text.style.cssText = "flex:1; font-size:75%; opacity:0.9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-align:left;";
      let del = document.createElement("button");
      del.textContent = "✕";
      del.title = "Remove this kept prompt";
      del.style.cssText = "flex:0 0 auto; cursor:pointer; font-size:80%; padding:0.1rem 0.3rem; border:1px solid rgba(180,80,80,0.6); border-radius:4px; background:rgba(180,50,50,0.15); color:#f88;";
      del.addEventListener("click", function() { removeKeptPrompt(i); });
      row.appendChild(copy);
      row.appendChild(text);
      row.appendChild(del);
      ctn.appendChild(row);
    }
  }
  function buildScratchPanel() {
    if(document.getElementById("t2iScratchPanel")) return true;
    let anchor = document.querySelector('[data-name="description"]');
    let hostEl = anchor && anchor.closest ? (anchor.closest(".input-ctn") || anchor) : null;
    if(!hostEl) return false;
    // The custom scratchpad panel lives OUTSIDE the framework's userInputs container
    // (inserted just before it) so the framework's init loop never sees the anonymous
    // t2iScratchInput textarea (it does userInputs[el.dataset.name]._element = el for every
    // input/select/textarea inside its container, and an element without data-name crashes it).
    let userInputsCtn = hostEl.parentNode; // the container holding all the framework's inputs
    if(!userInputsCtn || userInputsCtn.id !== "userInputsCtn8462746262" || !userInputsCtn.parentNode) return false;
    let scratchHost = userInputsCtn.parentNode; // mainColumnEl — panel goes just before the container
    let panel = document.createElement("div");
    panel.className = "input-ctn input-type-paragraph takesUpFullRow";
    panel.id = "t2iScratchPanel";
    panel.dataset.foldToggleState = "hidden";
    panel.innerHTML = `
      <style>
        #t2iScratchInput::placeholder { color: rgba(128,128,128,0.85); font-style: italic; opacity: 1; }
        #t2iScratchPanel .input-label { flex-wrap: wrap; row-gap: 0.25rem; }
      </style>
      <div class="input-inner" style="width:min(750px,100%); margin-left:auto; margin-right:auto; text-align:left;">
        <div class="input-label">
          <span style="width:max-content;">🗒️ Scratchpad</span>
          <span style="flex-grow:1;"></span>
          <button id="t2iAutokeepToggle" style="font-size:80%; cursor:pointer; padding:0.1rem 0.4rem; border:1px solid var(--th-border); border-radius:4px; background:var(--box-color,#eee); color:inherit; margin-right:0.4rem;">📌 autokeep</button>
          <button class="input-toggle-button" style="background:transparent; border:none; cursor:pointer; font-size:80%; color:inherit; padding:0.1rem 0.3rem;" onclick="let p = this.closest('.input-ctn'); p.dataset.foldToggleState = (p.dataset.foldToggleState === 'hidden' ? 'shown' : 'hidden');"></button>
        </div>
        <div class="input-wrapper">
          <textarea id="t2iScratchInput" class="paragraph-input" style="height:9rem;"></textarea>
        </div>
        <div id="t2iKeptSection" style="margin-top:0.35rem; border-top:1px solid rgba(128,128,128,0.25); padding-top:0.35rem;">
          <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
            <b style="font-size:80%;">📋 Kept prompts (<span id="t2iKeptCount">0</span>)</b>
            <span id="t2iKeptHint" style="font-size:72%; opacity:0.6;"></span>
            <span style="flex-grow:1;"></span>
            <button id="t2iKeptClearBtn" title="Delete all kept prompts" style="font-size:75%; cursor:pointer; padding:0.1rem 0.4rem; border:1px solid #b55; border-radius:4px; background:rgba(180,50,50,0.15); color:#f88;">🗑️ clear all</button>
          </div>
          <div id="t2iKeptEmpty" style="font-size:75%; opacity:0.6; padding:0.25rem 0;">No prompts kept yet — generate images with 📌 autokeep on and they'll appear here, copyable.</div>
          <div id="t2iKeptList" style="max-height:10rem; overflow-y:auto;"></div>
        </div>
      </div>
    `;
    scratchHost.insertBefore(panel, userInputsCtn);

    let input = document.getElementById("t2iScratchInput");
    input.placeholder = "Paste or type text here — notes, prompt fragments, anything. It's remembered automatically.\n\nTip: you can also define reusable variables here, e.g.  ANIMAL = {dog|cat|frog}  and then use [ANIMAL] in your description.";
    if(getScratchText() === "" && localStorage[OLD_SCRATCH_LS_KEY]) {
      saveScratchText(localStorage[OLD_SCRATCH_LS_KEY]); // migrate old framework scratchpad text
      localStorage.removeItem(OLD_SCRATCH_LS_KEY); // one-shot: don't re-migrate deleted text on later loads
    }
    input.value = getScratchText();
    parseScratchVariables(input.value);
    input.addEventListener("input", function() {
      saveScratchText(this.value);
      parseScratchVariables(this.value);
    });
    document.getElementById("t2iAutokeepToggle").addEventListener("click", function() {
      setAutokeepSetting(!getAutokeepSetting());
      updateAutokeepToggle();
      updateKeptHint();
    });
    document.getElementById("t2iKeptClearBtn").addEventListener("click", async function() {
      if(!(await window.uiConfirm("Delete all " + getKeptPrompts().length + " kept prompt" + (getKeptPrompts().length === 1 ? "" : "s") + "?", { okText: 'Delete all', danger: true }))) return;
      clearKeptPrompts();
    });
    updateAutokeepToggle();
    updateKeptHint();
    renderKeptSection();
    return true;
  }
  function bootScratch() {
    if(!buildScratchPanel() && ++__t2iScratchTries < 120) setTimeout(bootScratch, 250);
  }

  // ---------- character chat links → this page's AI Chat tab ----------
  // The framework's persona flow builds its share links for perchance.org/ai-character-chat.
  // This generator's chat lives at perchance.org/bigger-and-better-ai-chat (a fork of
  // ai-character-chat that accepts the same link formats: `#<addCharacter json>` and
  // `?data=<name>~<file>`). We replace the framework's link-builder so finished personas are
  // handed straight into the embedded AI Chat *tab* (see `window.__nexoraChatAddCharacter` in
  // index.html) rather than opening the chat site in a new browser tab.
  const CHARACTER_CHAT_BASE = "https://perchance.org/bigger-and-better-ai-chat";
  const CHAT_GEN_NAME = "bigger-and-better-ai-chat";
  // The chat generator's subdomain (its own origin — the only place its localStorage lives).
  // Public id is stable per generator; update only if the chat generator is ever recreated/reforked.
  const CHAT_GEN_PUBLIC_ID = "3096b44cf71ba8ea0f887e091a6b3be1";
  function showCharacterLinkModal(url) {
    let overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed; inset:0; z-index:100000; background:rgba(0,0,0,0.6); backdrop-filter:blur(3px); display:flex; align-items:center; justify-content:center; padding:1rem;";
    overlay.innerHTML = `
      <div style="background:var(--box-color,#222); color:var(--th-text,#eee); border-radius:8px; padding:1rem; max-width:480px; width:100%; box-shadow:0 8px 30px rgba(0,0,0,0.5);">
        <div style="font-size:95%; margin-bottom:0.5rem; opacity:0.8;">Your character has been created. Here's the link:</div>
        <div style="display:flex; gap:0.4rem; margin-bottom:0.5rem;">
          <input readonly value="${url}" style="flex-grow:1; min-width:0; font-size:80%; color-scheme:dark; background:rgba(0,0,0,0.4); color:inherit; border:1px solid #555; border-radius:3px; padding:0.3rem;">
          <button data-act="copy" style="min-width:max-content;">📋 copy</button>
          <button data-act="open" style="min-width:max-content;">↗️ visit</button>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="font-size:75%; opacity:0.6;">Chat opens in <b>perchance.org/bigger-and-better-ai-chat</b></div>
          <button data-act="close" style="min-width:max-content;">❌ close</button>
        </div>
      </div>`;
    overlay.querySelector('[data-act="copy"]').addEventListener("click", function() {
      navigator.clipboard.writeText(url).then(() => {
        this.textContent = "copied ✅";
        setTimeout(() => { this.textContent = "📋 copy"; }, 1500);
      }).catch(() => {
        this.textContent = "⚠️ copy failed";
        setTimeout(() => { this.textContent = "📋 copy"; }, 1500);
      });
    });
    overlay.querySelector('[data-act="open"]').addEventListener("click", function() { window.open(url); });
    overlay.querySelector('[data-act="close"]').addEventListener("click", function() { overlay.remove(); });
    overlay.addEventListener("click", function(e) { if(e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }
  // Build the chat generator's character-share fragment: url-encoded `{"addCharacter":...}`.
  function buildCharacterHashData(json) {
    return encodeURIComponent(JSON.stringify(json)).replace(/[!'()*]/g, function(c) {
      return "%" + c.charCodeAt(0).toString(16);
    });
  }
  // The chat generator reads the character out of the URL fragment, so the fragment must stay
  // small. Avatars are frequently big `data:` URLs, and `blob:` URLs can't be read by the chat's
  // origin at all — shrink both to a ~256px JPEG first.
  async function prepareCharacterForInAppChat(json) {
    try {
      let add = json && json.addCharacter;
      let av = add && add.avatar && add.avatar.url;
      let avKind = add && add.avatar && (add.avatar.kind || add.avatar.thumbKind);
      let avPoster = add && add.avatar && (add.avatar.poster || add.avatar.thumbPoster);
      let isVid = false;
      try { isVid = !!(window.AvatarMedia && window.AvatarMedia.isVideo(av, avKind)); } catch (e) {}
      if (avPoster && isVid && /^data:/i.test(avPoster)) {
        try { add.avatar.url = await makeThumbnail(avPoster, 256); } catch (e) { add.avatar.url = avPoster; }
        delete add.avatar.poster; delete add.avatar.thumbPoster;
      } else if (isVid && typeof av === "string" && (/^data:/i.test(av) || /^blob:/i.test(av))) {
        if (window.AvatarMedia) {
          try {
            let p = await window.AvatarMedia.videoPoster(av, 256);
            if (p) add.avatar.url = p;
            else if (/^https?:/i.test(av)) { /* keep http video url */ }
            else add.avatar.url = "";
          } catch (e) {}
        }
        delete add.avatar.poster; delete add.avatar.thumbPoster;
      } else if(typeof av === "string" && ((/^data:/i.test(av) && av.length > 40000) || /^blob:/i.test(av))) {
        try { add.avatar.url = await makeThumbnail(av, 256); } catch (e) {}
      }
    } catch(e) {}
    return json;
  }
  let chatLinkToastTimer = null;
  function toastCharacterLink(msg, url) {
    let el = document.getElementById("t2iChatLinkToast");
    if(!el) {
      el = document.createElement("div");
      el.id = "t2iChatLinkToast";
      el.style.cssText = "position:fixed; bottom:3.5rem; left:50%; transform:translateX(-50%); z-index:100001; background:rgba(0,0,0,0.88); color:#fff; padding:0.45rem 0.7rem; border-radius:7px; font-size:85%; opacity:0; transition:opacity 200ms; display:flex; align-items:center; gap:0.6rem; max-width:92vw;";
      document.body.appendChild(el);
    }
    el.innerHTML = "";
    let span = document.createElement("span");
    span.textContent = msg;
    el.appendChild(span);
    let btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "📋 copy link";
    btn.style.cssText = "cursor:pointer; font-size:90%; padding:0.1rem 0.45rem; border:1px solid #888; border-radius:4px; background:rgba(255,255,255,0.14); color:#fff; white-space:nowrap;";
    btn.addEventListener("click", function() {
      let done = function(ok) { btn.textContent = ok ? "copied ✅" : "⚠️ copy failed"; };
      try { navigator.clipboard.writeText(url).then(function(){ done(true); }, function(){ done(false); }); }
      catch(e) { done(false); }
    });
    el.appendChild(btn);
    el.style.opacity = "1";
    clearTimeout(chatLinkToastTimer);
    chatLinkToastTimer = setTimeout(function() { el.style.opacity = "0"; }, 6000);
  }
  // --- destination chooser ---
  // Every persona/character flow (persona generator, pro imager, gallery "new chat character")
  // funnels through this override. Instead of always dropping the character into the default
  // chat tab, ask the user which embedded chat it should open in. The tab list + 🎯 default are
  // owned by index.html (window.__nexoraChatOptions / __nexoraChatSetTarget).
  function chatTargets() {
    try {
      if(typeof window.__nexoraChatOptions === "function") {
        let list = window.__nexoraChatOptions();
        if(Array.isArray(list) && list.length) return list;
      }
    } catch(e) {}
    return [];
  }
  function chatTargetDefault() {
    try {
      if(typeof window.__nexoraChatDefaultTarget === "function") return window.__nexoraChatDefaultTarget();
    } catch(e) {}
    return "";
  }
  let chatPickerEl = null;
  function handCharacterToChat(json, hashData, target) {
    window.__nexoraChatAddCharacter(hashData, target.name);
    let name = (json && json.addCharacter && json.addCharacter.name) || "the character";
    let base = target.page || CHARACTER_CHAT_BASE;
    toastCharacterLink("💬 opening " + name + " in " + target.label, base + "#" + hashData);
  }
  function showChatTargetPicker(json, hashData, targets) {
    if(chatPickerEl && chatPickerEl.parentNode) return true;
    let charName = (json && json.addCharacter && json.addCharacter.name) || "this character";
    let def = chatTargetDefault();
    let rows = targets.map(function(t) {
      let dom = String(t.page || "").replace(/^https?:\/\//i, "");
      let mark = t.name === def ? "🎯 " : "💬 ";
      return '<button type="button" data-tab="' + sanitizeHtml(t.name) + '" style="display:flex; flex-direction:column; gap:0.15rem; text-align:left; cursor:pointer; width:100%; padding:0.6rem 0.7rem; border:1px solid #555; border-radius:7px; background:rgba(255,255,255,0.06); color:inherit; font:inherit;">'
        + '<span style="font-size:100%;">' + mark + sanitizeHtml(t.label) + '</span>'
        + (dom ? '<span style="font-size:73%; opacity:0.6;">' + sanitizeHtml(dom) + '</span>' : "")
        + '</button>';
    }).join("");
    let overlay = document.createElement("div");
    overlay.id = "t2iChatPicker";
    overlay.style.cssText = "position:fixed; inset:0; z-index:100000; background:rgba(0,0,0,0.6); backdrop-filter:blur(3px); display:flex; align-items:center; justify-content:center; padding:1rem;";
    overlay.innerHTML = `
      <div style="background:var(--box-color,#222); color:var(--th-text,#eee); border-radius:8px; padding:1rem; max-width:460px; width:100%; box-shadow:0 8px 30px rgba(0,0,0,0.5);">
        <div style="font-size:100%; margin-bottom:0.15rem;">Chat with <b>${sanitizeHtml(charName)}</b></div>
        <div style="font-size:82%; opacity:0.7; margin-bottom:0.7rem;">Which AI chat should this character open in?</div>
        <div style="display:flex; flex-direction:column; gap:0.45rem;">${rows}</div>
        <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.8rem; flex-wrap:wrap;">
          <label style="display:flex; align-items:center; gap:0.35rem; font-size:79%; opacity:0.85; cursor:pointer; white-space:nowrap;"><input type="checkbox" data-remember style="cursor:pointer;">🎯 Remember as my default</label>
          <span style="flex-grow:1;"></span>
          <button type="button" data-act="close" style="cursor:pointer; min-width:max-content; padding:0.3rem 0.6rem; border:1px solid #555; border-radius:5px; background:rgba(255,255,255,0.08); color:inherit;">Cancel</button>
        </div>
      </div>`;
    let close = function() { overlay.remove(); if(chatPickerEl === overlay) chatPickerEl = null; };
    let remember = overlay.querySelector("[data-remember]");
    Array.prototype.forEach.call(overlay.querySelectorAll("[data-tab]"), function(btn) {
      btn.addEventListener("click", function() {
        let want = btn.getAttribute("data-tab"), t = null, i;
        for(i = 0; i < targets.length; i++) if(targets[i].name === want) t = targets[i];
        if(!t) return;
        if(remember && remember.checked && typeof window.__nexoraChatSetTarget === "function") {
          try { window.__nexoraChatSetTarget(t.name); } catch(e) {}
        }
        close();
        handCharacterToChat(json, hashData, t);
      });
    });
    overlay.querySelector('[data-act="close"]').addEventListener("click", close);
    overlay.addEventListener("click", function(e) { if(e.target === overlay) close(); });
    document.body.appendChild(overlay);
    chatPickerEl = overlay;
    return true;
  }
  // Hand a finished character to an embedded AI Chat tab (instead of a new browser tab).
  // Shows the destination chooser; returns false when no chat tab is available so the caller can
  // fall back to a share link.
  function openCharacterInAppChat(json) {
    if(typeof window.__nexoraChatAddCharacter !== "function") return false;
    let targets = chatTargets();
    if(!targets.length) return false;
    return showChatTargetPicker(json, buildCharacterHashData(json), targets);
  }
  function overrideCharacterChatLinks() {
    let fn = async function(json) {
      try {
        await prepareCharacterForInAppChat(json);
        if(openCharacterInAppChat(json)) return;
      } catch(e) {
        console.warn("character chat handoff:", e);
      }
      // Fallback (AI Chat tab unavailable): hand back a share link for the chat site.
      showCharacterLinkModal(CHARACTER_CHAT_BASE + "#" + buildCharacterHashData(json));
    };
    fn.__t2iCustomChat = true; // marker so we can tell our override from the framework's original
    window.t2i_generateShareLinkForCharacter = fn;
  }

  // ---------- bidirectional pairing with the chat generator ----------
  // Both sites share their galleries through public editable files (see the cross-site section
  // above). `?galleryFile=<chatFile>` tells US where the chat's file lives; this hands the CHAT our
  // own file URL, so images saved here also show up over there. A hidden iframe loads the chat
  // generator at its own origin (the only origin whose localStorage it reads) with
  // ?galleryFile=<ourFile>; the chat's bridge stores that link and then polls our file every few
  // seconds, so images added later show up there too. Runs once per browser (localStorage flag).
  const CHAT_PAIRED_LS = "t2iGalleryPairedChat";
  const CHAT_PAIR_IFRAME_ID = "t2iPairIframe";
  // The chat's bridge does not post a "done" message back (the current version only reads
  // ?galleryFile= on load), so pairing is normally confirmed by the iframe's load event below.
  // This listener is kept so a bridge that does announce completion confirms immediately rather
  // than waiting out the timeout.
  window.addEventListener("message", function(e) {
    if(e.data && e.data.type === "t2iGalleryPairingDone") {
      let ifr = document.getElementById(CHAT_PAIR_IFRAME_ID);
      if(ifr) {
        ifr.remove();
        try { localStorage[CHAT_PAIRED_LS] = "1"; } catch(err) {}
      }
    }
  });
  async function pairWithChatSite() {
    try {
      if(localStorage[CHAT_PAIRED_LS]) return;
      if(document.getElementById(CHAT_PAIR_IFRAME_ID)) return;
      await ensureGalleryCloud();
      let ifr = document.createElement("iframe");
      ifr.id = CHAT_PAIR_IFRAME_ID;
      ifr.style.cssText = "display:none; width:0; height:0; border:0;";
      ifr.src = "https://" + CHAT_GEN_PUBLIC_ID + ".perchance.org/" + CHAT_GEN_NAME + "?galleryFile=" + encodeURIComponent(galleryCloudUrl());
      let finished = false;
      let finish = (ok) => {
        if(finished) return;
        finished = true;
        try { ifr.remove(); } catch(e) {}
        if(ok) { try { localStorage[CHAT_PAIRED_LS] = "1"; } catch(e) {} }
      };
      ifr.onload = () => setTimeout(() => finish(true), 4000); // fallback for peer bridges without the confirm message
      setTimeout(() => finish(false), 20000); // give up silently if the peer site never loads
      document.body.appendChild(ifr);
    } catch(e) { console.warn("pair with chat site:", e); }
  }

  // ---------- page background (image / video from a URL, e.g. catbox.moe or perchance.org/upload) ----------
  const BG_LS_KEY = "t2iBgSettings";
  const BG_IMG_EXTS = ["jpg","jpeg","png","gif","webp","avif","bmp","svg","apng","ico"];
  const BG_VID_EXTS = ["mp4","webm","mov","m4v","ogv","mkv","mpg","mpeg","avi"];
  function getBgSettings() { try { return JSON.parse(localStorage[BG_LS_KEY] || "null"); } catch(e) { return null; } }
  function saveBgSettings(s) { try { localStorage[BG_LS_KEY] = s ? JSON.stringify(s) : ""; } catch(e) {} }
  function bgExtOf(url) {
    try { let m = new URL(url).pathname.toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : ""; } catch(e) { return ""; }
  }
  function bgTypeFromUrl(url) {
    let ext = bgExtOf(url);
    if(BG_VID_EXTS.includes(ext)) return "video";
    if(BG_IMG_EXTS.includes(ext)) return "image";
    return null;
  }
  function detectBgType(url) {
    return new Promise(function(resolve) {
      let byExt = bgTypeFromUrl(url);
      if(byExt) return resolve(byExt);
      let img = new Image();
      let done = false;
      let fin = t => { if(!done) { done = true; resolve(t); } };
      img.onload = () => fin("image");
      img.onerror = () => {
        let v = document.createElement("video");
        v.muted = true;
        v.preload = "metadata";
        v.onloadeddata = () => fin("video");
        v.oncanplay = () => fin("video");
        v.onerror = () => fin("image");
        v.src = url;
        setTimeout(() => fin("image"), 8000);
      };
      img.src = url;
    });
  }

  function freeBgUpload(s) {
    if(s && s.deletionUrl) { try { fetch(s.deletionUrl).then(function(r){ return r.json(); }).catch(function(){}); } catch(e) {} }
  }
  function compressBgImage(file) {
    return new Promise(function(resolve, reject) {
      let img = new Image();
      let objectUrl = URL.createObjectURL(file);
      img.onload = function() {
        try {
          let MAX = 1920;
          let w = img.naturalWidth, h = img.naturalHeight;
          if(w <= MAX && h <= MAX && file.size <= 1500000) { URL.revokeObjectURL(objectUrl); resolve(file); return; }
          let scale = Math.min(1, MAX / Math.max(w, h));
          let nw = Math.max(1, Math.round(w * scale)), nh = Math.max(1, Math.round(h * scale));
          let c = document.createElement("canvas");
          c.width = nw; c.height = nh;
          let ctx = c.getContext("2d");
          ctx.fillStyle = "#000"; ctx.fillRect(0, 0, nw, nh);
          ctx.drawImage(img, 0, 0, nw, nh);
          URL.revokeObjectURL(objectUrl);
          c.toBlob(function(b) { if(b) resolve(b); else reject(new Error("toBlob failed")); }, "image/jpeg", 0.88);
        } catch(e) { URL.revokeObjectURL(objectUrl); reject(e); }
      };
      img.onerror = function() { URL.revokeObjectURL(objectUrl); reject(new Error("decode failed")); };
      img.src = objectUrl;
    });
  }
  let bgLayer = null;
  let bgMedia = null;
  let bgMutationObserver = null;
  function bgKeepTransparent() {
    if(!bgLayer) return;
    document.body.style.backgroundColor = "transparent";
    document.documentElement.style.backgroundColor = "transparent";
  }
  function ensureBgTransparencyWatch() {
    if(bgMutationObserver) return; // the framework re-applies its own body background (e.g. dark-mode toggle) — keep ours transparent while a bg is active
    bgMutationObserver = new MutationObserver(() => bgKeepTransparent());
    bgMutationObserver.observe(document.body, { attributes: true, attributeFilter: ["style"] });
  }
  function setBgLayer(mediaEl) {
    if(!bgLayer) {
      bgLayer = document.createElement("div");
      bgLayer.id = "t2iBgLayer";
      bgLayer.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; z-index:-1; overflow:hidden; pointer-events:none;";
      document.body.appendChild(bgLayer);
    }
    if(bgMedia) bgMedia.remove();
    bgMedia = mediaEl;
    bgLayer.appendChild(mediaEl);
    notifyPageBgChange();
  }
  /* let other parts of the app (e.g. the Theme Studio tab) react to the page background */
  function notifyPageBgChange() { try { if(window.__onPageBgChange) window.__onPageBgChange(); } catch(e){} }
  function clearBgLayer() {
    if(bgLayer) { bgLayer.remove(); bgLayer = null; }
    bgMedia = null;
    if(bgMutationObserver) { bgMutationObserver.disconnect(); bgMutationObserver = null; }
    document.documentElement.style.backgroundColor = "";
    document.body.style.backgroundColor = document.documentElement.style.colorScheme === "dark" ? "#131516" : "white";
    notifyPageBgChange();
  }
  function applyBackground(url, opts) {
    return new Promise(function(resolve) {
      (async function() {
        opts = opts || {};
        let prev = getBgSettings();
        let blur = Number(opts.blur != null ? opts.blur : ((prev && prev.blur != null) ? prev.blur : 0));
        let opacity = Number(opts.opacity != null ? opts.opacity : ((prev && prev.opacity != null) ? prev.opacity : 100));
        let type = opts.type || await detectBgType(url);
        let el;
        let failed = false;
        if(type === "video") {
          el = document.createElement("video");
          el.src = url;
          el.autoplay = true;
          el.muted = true;
          el.loop = true;
          el.playsInline = true;
          el.preload = "auto";
          el.addEventListener("canplay", () => { try { el.play().catch(() => {}); } catch(e) {} });
          el.addEventListener("error", () => { failed = true; });
        } else {
          el = document.createElement("img");
          el.src = url;
          el.addEventListener("error", () => { failed = true; });
        }
        el.style.cssText = "width:100%; height:100%; object-fit:cover; object-position:center; display:block; filter:blur(" + blur + "px); transform:scale(" + (blur > 0 ? 1.12 : 1) + ");";
        setBgLayer(el);
        bgLayer.style.opacity = opacity / 100;
        bgKeepTransparent();
        ensureBgTransparencyWatch();
        await new Promise(r => setTimeout(r, 250)); // let immediate load errors (e.g. 404s) surface
        if(failed) {
          el.remove();
          if(bgMedia === el) bgMedia = null;
          if(prev && prev.url) {
            await applyBackground(prev.url, { type: prev.type, blur: prev.blur, opacity: prev.opacity, deletionUrl: prev.deletionUrl });
            resolve("error");
          } else {
            clearBgLayer();
            saveBgSettings(null);
            resolve("error");
          }
          return;
        }
        saveBgSettings({ url, type, blur, opacity, deletionUrl: opts.deletionUrl || null });
        notifyPageBgChange();
        resolve("ok");
      })();
    });
  }
  function updateBgButtonLabel() {
    let b = document.getElementById("t2iBgButton");
    if(!b) return;
    let s = getBgSettings();
    let lib = getBgLibrary();
    let n = lib.length;
    b.textContent = s ? "🎨 bg: on" + (n ? " (" + n + ")" : "") : (n ? "🎨 backgrounds (" + n + ")" : "🎨 background");
    b.style.opacity = s ? "1" : "0.9";
  }
  const BG_LIB_LS_KEY = "t2iBgLibrary";
  function getBgLibrary() { try { let v = JSON.parse(localStorage[BG_LIB_LS_KEY] || "[]"); return Array.isArray(v) ? v : []; } catch(e) { return []; } }
  function saveBgLibrary(lib) {
    try { localStorage[BG_LIB_LS_KEY] = JSON.stringify(lib.slice(0, 200)); } catch(e) {}
    try { if(window.root && root.kv && root.kv.t2iBackgrounds) root.kv.t2iBackgrounds.set("list", lib.slice(0, 200)); } catch(e) {}
  }
  function addToBgLibrary(url, type) {
    url = String(url || "").trim();
    if(!url || url.startsWith("blob:")) return false;
    let lib = getBgLibrary();
    if(lib.some(e => e.url === url)) return false;
    lib.unshift({ url, type: type || bgTypeFromUrl(url) || "image", addedAt: Date.now() });
    saveBgLibrary(lib);
    return true;
  }
  function removeFromBgLibrary(url) { saveBgLibrary(getBgLibrary().filter(e => e.url !== url)); }
  try { if(window.root && root.kv && root.kv.t2iBackgrounds) root.kv.t2iBackgrounds.get("list").then(v => { if(Array.isArray(v) && v.length && !getBgLibrary().length) { try { localStorage[BG_LIB_LS_KEY] = JSON.stringify(v.slice(0, 200)); } catch(e) {} } }).catch(() => {}); } catch(e) {}
  function openBackgroundModal() {
    let existing = document.getElementById("t2iBgModal");
    if(existing) existing.remove();
    let s = getBgSettings();
    let blur = s && s.blur != null ? s.blur : 0;
    let opacity = s && s.opacity != null ? s.opacity : 100;
    let overlay = document.createElement("div");
    overlay.id = "t2iBgModal";
    overlay.style.cssText = "position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; padding:1rem;";
    overlay.innerHTML = `
      <div style="width:min(520px,100%); background:var(--box-color,#222); color:inherit; border:1px solid var(--th-border); border-radius:8px; padding:1rem; box-shadow:0 8px 30px rgba(0,0,0,0.5);">
        <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem;">
          <b>🎨 Page background</b>
          <span style="flex-grow:1;"></span>
          <button data-bg-close style="cursor:pointer; border:1px solid var(--th-border); border-radius:5px; background:var(--box-color,#eee); padding:0.15rem 0.5rem;" title="close">✖️</button>
        </div>
        <div style="font-size:82%; opacity:0.75; margin-bottom:0.6rem;">Set an image or video as the page background by pasting its direct URL (e.g. from <b>catbox.moe</b> or <b>perchance.org/upload</b>), or by choosing a file from your device — files are uploaded and kept until you replace them with another image/video.</div>
        <div style="display:flex; gap:0.4rem; margin-bottom:0.6rem;">
          <input id="t2iBgUrlInput" type="url" placeholder="https://...image.png  or  ...video.mp4" value="${s && s.url && !s.url.startsWith("blob:") ? s.url : ""}" style="flex-grow:1; min-width:0; font-size:85%; background:rgba(0,0,0,0.35); color:inherit; border:1px solid var(--th-border); border-radius:4px; padding:0.35rem 0.5rem;">
          <button id="t2iBgUrlApply" style="white-space:nowrap;">apply URL</button>
        </div>
        <div style="display:flex; gap:0.4rem; margin-bottom:0.6rem; align-items:center; flex-wrap:wrap;">
          <button id="t2iBgFileBtn">📁 choose image / video file</button>
          <span id="t2iBgLocalHint" style="font-size:74%; opacity:0.6;"></span>
        </div>
        <div style="font-size:82%; margin-bottom:0.35rem;">Blur <input id="t2iBgBlur" type="range" min="0" max="24" step="1" value="${blur}" style="vertical-align:middle; width:58%;"> <span id="t2iBgBlurVal">${blur}px</span></div>
        <div style="font-size:82%; margin-bottom:0.6rem;">Opacity <input id="t2iBgOpacity" type="range" min="20" max="100" step="5" value="${opacity}" style="vertical-align:middle; width:58%;"> <span id="t2iBgOpacityVal">${opacity}%</span></div>
        <div id="t2iBgStatus" style="font-size:80%; margin-bottom:0.6rem; word-break:break-word;"></div>
        <div style="display:flex; gap:0.4rem; align-items:center; margin-bottom:0.6rem;">
          <button id="t2iBgRemove" style="border-color:#b55; color:#f88; background:rgba(180,50,50,0.15);">🗑️ remove background</button>
          <button id="t2iBgSave" title="Store the URL above in your saved backgrounds">💾 save URL</button>
          <span style="flex-grow:1;"></span>
          <span id="t2iBgTypeBadge" style="font-size:76%; opacity:0.6;"></span>
        </div>
        <div style="font-size:82%; font-weight:700; margin-bottom:0.3rem;">🖼️ Saved backgrounds <span id="t2iBgLibCount" style="opacity:0.6; font-weight:400;"></span></div>
        <div style="font-size:76%; opacity:0.7; margin-bottom:0.35rem;">Paste links above and hit 💾 save URL — each is kept here so you can one-click it as the site background later. Videos show ▶.</div>
        <div id="t2iBgLibGrid" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(88px,1fr)); gap:0.35rem; max-height:220px; overflow-y:auto; padding:0.2rem; border:1px solid var(--th-border); border-radius:6px; background:rgba(127,127,127,0.08); margin-bottom:0.3rem;"></div>
      </div>`;
    overlay.addEventListener("mousedown", e => { if(e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    function refreshStatus() {
      let cur = getBgSettings();
      let statusEl = document.getElementById("t2iBgStatus");
      let badge = document.getElementById("t2iBgTypeBadge");
      if(cur && cur.url) {
        let kind = cur.type === "video" ? "🎬 video" : "🖼️ image";
        statusEl.innerHTML = "active: <b>" + kind + "</b> background" + (cur.url.startsWith("blob:") ? " — session-only (upload failed — try a smaller file or a direct URL)" : (cur.deletionUrl ? " — uploaded, kept until you replace it" : ""));
        badge.textContent = kind;
      } else {
        statusEl.textContent = "no background set";
        badge.textContent = "";
      }
    }
    function liveUpdate() {
      let b = Number(document.getElementById("t2iBgBlur").value);
      let o = Number(document.getElementById("t2iBgOpacity").value);
      document.getElementById("t2iBgBlurVal").textContent = b + "px";
      document.getElementById("t2iBgOpacityVal").textContent = o + "%";
      if(bgMedia) {
        bgMedia.style.filter = "blur(" + b + "px)";
        bgMedia.style.transform = "scale(" + (b > 0 ? 1.12 : 1) + ")";
      }
      if(bgLayer) bgLayer.style.opacity = o / 100;
      let cur = getBgSettings();
      if(cur) { cur.blur = b; cur.opacity = o; saveBgSettings(cur); }
    }
    document.querySelector("[data-bg-close]").addEventListener("click", () => overlay.remove());
    document.getElementById("t2iBgBlur").addEventListener("input", liveUpdate);
    document.getElementById("t2iBgOpacity").addEventListener("input", liveUpdate);
    document.getElementById("t2iBgUrlInput").addEventListener("keydown", e => {
      if(e.key === "Enter") document.getElementById("t2iBgUrlApply").click();
    });
    document.getElementById("t2iBgUrlApply").addEventListener("click", async function() {
      let url = document.getElementById("t2iBgUrlInput").value.trim();
      if(!url) { toast("⚠️ paste a URL first"); return; }
      this.textContent = "⏳ loading...";
      let b = Number(document.getElementById("t2iBgBlur").value);
      let o = Number(document.getElementById("t2iBgOpacity").value);
      freeBgUpload(getBgSettings());
      let res = await applyBackground(url, { blur: b, opacity: o, deletionUrl: null });
      this.textContent = "apply URL";
      if(res === "error") toast("⚠️ couldn't load that URL as an image or video");
      else addToBgLibrary(url);
      refreshStatus();
      renderBgLib();
      updateBgButtonLabel();
    });
    function escBg(s) { return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }
    function renderBgLib() {
      let grid = document.getElementById("t2iBgLibGrid");
      let count = document.getElementById("t2iBgLibCount");
      if(!grid) return;
      let lib = getBgLibrary();
      let cur = getBgSettings();
      if(count) count.textContent = lib.length ? "(" + lib.length + " stored)" : "(empty — save URLs from links)";
      if(!lib.length) { grid.innerHTML = "<div style='font-size:78%; opacity:0.65; padding:0.4rem;'>Nothing stored yet. Paste an image/video link above → 💾 save URL.</div>"; return; }
      grid.innerHTML = lib.map(e => {
        let isVid = (e.type === "video") || BG_VID_EXTS.includes(bgExtOf(e.url));
        let active = cur && cur.url === e.url;
        let thumb = isVid
          ? "<video src=\"" + escBg(e.url) + "\" muted preload=\"metadata\" playsinline style=\"width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;\"></video><span style=\"position:absolute;inset:auto 2px 2px auto;background:rgba(0,0,0,0.65);color:#fff;font-size:70%;border-radius:4px;padding:0 4px;\">▶</span>"
          : "<img src=\"" + escBg(e.url) + "\" loading=\"lazy\" style=\"width:100%;height:100%;object-fit:cover;display:block;\" onerror=\"this.style.opacity=0.2\">";
        return "<div data-bg-url=\"" + escBg(e.url) + "\" title=\"" + escBg(e.url) + "\" style=\"position:relative; aspect-ratio:16/10; overflow:hidden; border-radius:6px; cursor:pointer; border:" + (active ? "2px solid var(--th-accent,#5b8cff)" : "2px solid transparent") + "; background:rgba(127,127,127,0.2);\">" + thumb + "<button data-bg-del=\"" + escBg(e.url) + "\" title=\"forget\" style=\"position:absolute;top:1px;right:1px;cursor:pointer;border:none;border-radius:4px;background:rgba(0,0,0,0.65);color:#fff;font-size:72%;padding:0 4px;line-height:1.5;\">✕</button></div>";
      }).join("");
      grid.querySelectorAll("[data-bg-url]").forEach(cell => {
        cell.addEventListener("click", async ev => {
          if(ev.target && ev.target.hasAttribute("data-bg-del")) return;
          let url = cell.getAttribute("data-bg-url");
          let b = Number(document.getElementById("t2iBgBlur").value);
          let o = Number(document.getElementById("t2iBgOpacity").value);
          cell.style.opacity = "0.5";
          let res = await applyBackground(url, { blur: b, opacity: o, deletionUrl: null });
          cell.isConnected && (cell.style.opacity = "");
          if(res === "error") toast("⚠️ couldn't load that saved background");
          refreshStatus(); renderBgLib(); updateBgButtonLabel();
        });
      });
      grid.querySelectorAll("[data-bg-del]").forEach(btn => {
        btn.addEventListener("click", ev => {
          ev.stopPropagation();
          removeFromBgLibrary(btn.getAttribute("data-bg-del"));
          refreshStatus(); renderBgLib(); updateBgButtonLabel();
        });
      });
    }
    document.getElementById("t2iBgSave").addEventListener("click", function() {
      let url = document.getElementById("t2iBgUrlInput").value.trim();
      if(!url) { toast("⚠️ paste a URL first"); return; }
      detectBgType(url).then(t => {
        if(addToBgLibrary(url, t)) toast("💾 saved background");
        else toast("already saved");
        renderBgLib(); updateBgButtonLabel();
      });
    });
    document.getElementById("t2iBgRemove").addEventListener("click", function() {
      clearBgLayer();
      saveBgSettings(null);
      updateBgButtonLabel();
      refreshStatus();
      toast("🗑️ background removed");
    });
    let bgFileInput = document.createElement("input");
    bgFileInput.type = "file";
    bgFileInput.accept = "image/*,video/*";
    bgFileInput.style.display = "none";
    document.body.appendChild(bgFileInput);
    document.getElementById("t2iBgFileBtn").addEventListener("click", () => bgFileInput.click());
    bgFileInput.addEventListener("change", async function() {
      let f = bgFileInput.files[0];
      bgFileInput.value = "";
      if(!f) return;
      let type = f.type && f.type.startsWith("video/") ? "video" : "image";
      let hint = document.getElementById("t2iBgLocalHint");
      let b = Number(document.getElementById("t2iBgBlur").value);
      let o = Number(document.getElementById("t2iBgOpacity").value);
      hint.textContent = "⏳ uploading...";
      let uploaded = null;
      if(window.root && root.uploadPlugin) {
        let blob = f;
        if(type === "image" && f.type !== "image/gif") {
          try { blob = await compressBgImage(f); } catch(e) { blob = f; }
        }
        try { uploaded = await root.uploadPlugin(blob); } catch(e) { uploaded = null; }
      }
      if(!uploaded || uploaded.error || !uploaded.url) {
        hint.textContent = (type === "video" ? "🎬 " : "🖼️ ") + f.name + " — upload failed" + (uploaded && uploaded.error ? " (" + uploaded.error + ")" : "") + ", session-only";
        let url = URL.createObjectURL(f);
        let res = await applyBackground(url, { type: type, blur: b, opacity: o, deletionUrl: null });
        if(res === "error") toast("⚠️ couldn't load that file");
        refreshStatus();
        renderBgLib();
        updateBgButtonLabel();
        return;
      }
      freeBgUpload(getBgSettings());
      let res = await applyBackground(uploaded.url, { type: type, blur: b, opacity: o, deletionUrl: uploaded.deletionUrl });
      if(res === "error") {
        hint.textContent = "⚠️ couldn't display uploaded file";
        toast("⚠️ couldn't load that file");
      } else {
        hint.textContent = (type === "video" ? "🎬 " : "🖼️ ") + f.name + " — uploaded, kept until you replace it";
        addToBgLibrary(uploaded.url, type);
      }
      refreshStatus();
      renderBgLib();
      updateBgButtonLabel();
    });
    let _cur = getBgSettings();
    if(_cur && _cur.url && !_cur.url.startsWith("blob:")) addToBgLibrary(_cur.url, _cur.type);
    refreshStatus();
    renderBgLib();
  }
  function bootBackground() {
    let s = getBgSettings();
    if(s && s.url) {
      applyBackground(s.url, { type: s.type, blur: s.blur, opacity: s.opacity, deletionUrl: s.deletionUrl }).then(function(res) {
        if(res === "error") saveBgSettings(null);
        updateBgButtonLabel();
      });
    } else {
      updateBgButtonLabel();
    }
  }

  // ---------- boot ----------
  window.t2iOpenBackgroundModal = openBackgroundModal; /* also surfaced from the Theme Studio tab */
  window.t2iGetBackgroundSettings = getBgSettings;
  window.t2iBackgrounds = { list: getBgLibrary, save: addToBgLibrary, remove: removeFromBgLibrary, open: openBackgroundModal };
  window.t2iGalleryCloud = { ensure: ensureGalleryCloud, push: pushGalleryToCloud, loadPeer: loadPeerGallery, url: galleryCloudUrl, adopt: adoptPeerGalleryFromUrl, key: galleryUserKey, peerUrl: getPeerGalleryUrl, peerUrls: getPeerGalleryUrls, peers: readPeers, addPeer: addPeer, removePeer: removePeer, peerFile: extractPeerFile, pair: pairWithChatSite };
  window.readPeers = readPeers; window.addPeer = addPeer; window.removePeer = removePeer; window.peerSourceId = peerSourceId; window.readGallery = getGallery; window.ownFileUrl = galleryCloudUrl;
  hookFramework();
  addButtons();
  window.__t2iScratchTries = 0;
  bootScratch();
  bootBackground();
  watchPublicGallery();
  overrideCharacterChatLinks();
  let adoptedChatLink = adoptPeerGalleryFromUrl(); // if this page was opened via a chat-site link, remember its gallery file
  // Register our gallery file with the chat site once per browser. Any linked chat will do — one
  // adopted from a chat link above, or one linked by hand in the gallery's 🧰 Manage panel — so the
  // hand-off doesn't depend on the visitor having arrived through the chat site.
  if(adoptedChatLink || readPeers().length) pairWithChatSite();
  ensureGalleryCloud().then(() => pushGalleryToCloud());
  // The framework's own `window.t2i_*` assignments are top-level statements that execute
  // AFTER this script (import evaluation order), so re-assert our override until it sticks.
  let chatOverrideRetries = 0;
  (function reassertCharacterChatLinks() {
    let f = window.t2i_generateShareLinkForCharacter;
    if(!f || !f.__t2iCustomChat) overrideCharacterChatLinks();
    if(chatOverrideRetries++ < 80) setTimeout(reassertCharacterChatLinks, 500);
  })();
})();
