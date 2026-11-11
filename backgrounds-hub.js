/* ============================================================================
   🖼️ Backgrounds hub — site backgrounds built from links.

   Modeled on bigger-and-better-ai-chat's src/backgrounds.js (see Credits tab):
   paste direct image/video links (or upload, drag & drop, pull the ones saved
   in the page-background modal), then **use** one to show it site-wide as the
   page backdrop. Turning it off (🚫 none / the Site backgrounds switch)
   restores exactly what was there before — the gallery's own page background,
   if one is set, shows underneath.

   Studio deltas vs the chat original (honest list, also in src/README.md):
   - No per-character scene layer here (there are no chat scenes) — site layer only.
   - No "From this chat" (no chat messages) — "🖼️ From saved" pulls the links
     stored by the gallery's page-background modal instead.
   - Rename uses the native prompt() (no prompt2 plugin in this studio).

   Storage: localStorage `t2iSiteBg` {v:1, items, activeId, enabled} (debounced),
   kv-mirrored at root.kv.t2iSiteBackgrounds/"list" (same pattern as gallery.js).
   Hub starts OFF — enabling is always an explicit user action.

   Public API: window.siteBackgrounds = { open, close, items, active, add,
   addLinksFromText, setActive, clear, toggle, shuffle, setRotate, rotate, apply }.
   ⏱️ Rotate mode: setRotate(true) shows each background for 2 minutes in list
   order, wrapping around (one setInterval; any manual pick restarts the window).
   ========================================================================== */
(function () {
  "use strict";
  if (window.__bgHubLoaded) return;
  window.__bgHubLoaded = true;

  /* ------------------------------------------------------------ constants */
  var LS_KEY = "t2iSiteBg";
  var KV_FOLDER = "t2iSiteBackgrounds";
  var MAX_ITEMS = 200;
  var IMG_RE = /\.(jpg|jpeg|png|gif|webp|avif|bmp|svg)(\?|#|$)/i;
  var VID_RE = /\.(mp4|webm|ogg|ogv|mov|m4v)(\?|#|$)/i;
  var BG_RE = /\.(jpg|jpeg|png|gif|webp|avif|bmp|svg|mp4|webm|ogg|ogv|mov|m4v)(\?|#|$)/i;

  /* -------------------------------------------------------------- helpers */
  function $(id) { return document.getElementById(id); }
  function uid() {
    try {
      if (window.crypto && crypto.getRandomValues) {
        var b = new Uint8Array(8); crypto.getRandomValues(b);
        var s = ""; for (var i = 0; i < b.length; i++) s += ("0" + b[i].toString(16)).slice(-2);
        return "bg" + s;
      }
    } catch (e) {}
    return "bg" + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
  }
  function toast(msg) {
    try {
      var t = document.createElement("div");
      t.textContent = msg;
      t.style.cssText = "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:99999;" +
        "background:var(--th-modal,var(--th-surface));border:1px solid var(--th-border);border-radius:999px;" +
        "padding:0.45rem 0.9rem;font-size:0.82rem;box-shadow:0 12px 30px -12px rgba(0,0,0,0.7);max-width:92vw;";
      document.body.appendChild(t);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2200);
    } catch (e) {}
  }
  function isVideoUrl(url) { return VID_RE.test(String(url || "").split("?")[0].split("#")[0]); }
  function prettyName(s) {
    s = String(s || "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_+]+/g, " ").replace(/\s+/g, " ").trim();
    return s || "Untitled";
  }
  function fileNameOf(url) {
    try {
      var parts = String(url).split("?")[0].split("/").filter(Boolean);
      return decodeURIComponent(parts.pop() || "background");
    } catch (e) { return "background"; }
  }
  function hostInfo(url) {
    var h = "";
    try { h = new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch (e) {}
    if (h === "user.uploads.dev" || h === "uploads.dev") return { host: h, label: "perchance", ico: "⬆️" };
    if (h === "files.catbox.moe" || h === "catbox.moe") return { host: h, label: "catbox", ico: "🐱" };
    if (/litterbox/.test(h)) return { host: h, label: "litterbox", ico: "🐱" };
    return { host: h || "link", label: h || "link", ico: "🔗" };
  }
  function titleFromUrl(url) {
    var f = fileNameOf(url);
    if (/[a-z]/i.test(f.replace(/\.[a-z0-9]{2,5}$/i, ""))) return prettyName(f);
    return hostInfo(url).label + " background";
  }
  function normalizeUrl(raw) {
    var u = String(raw == null ? "" : raw).trim();
    u = u.replace(/^[<(\[{]+/, "").replace(/[>)\]}.!;]+$/, "").replace(/^["']|["']$/g, "").trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) {
      if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(u)) u = "https://" + u;
      else return "";
    }
    try {
      var url = new URL(u);
      if (/^(www\.)?catbox\.moe$/i.test(url.hostname) && /^\/c\//i.test(url.pathname)) {
        url.hostname = "files.catbox.moe";
        url.pathname = url.pathname.replace(/^\/c\//i, "/");
      }
      return url.href;
    } catch (e) { return ""; }
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ----------------------------------------------------------------- state */
  var state = { items: [], activeId: null, enabled: false, rotate: false };
  function validItem(it) {
    return it && typeof it === "object" && typeof it.url === "string" && /^https?:\/\//i.test(it.url);
  }
  var saveTimer = null;
  function payload() {
    return {
      v: 1,
      items: state.items.slice(-MAX_ITEMS).map(function (it) {
        return { id: it.id, url: it.url, title: it.title, addedBy: it.addedBy || "", addedAt: it.addedAt || 0 };
      }),
      activeId: state.activeId,
      enabled: state.enabled,
      rotate: !!state.rotate
    };
  }
  function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      try { localStorage[LS_KEY] = JSON.stringify(payload()); } catch (e) {}
      try {
        if (window.root && root.kv && root.kv[KV_FOLDER]) root.kv[KV_FOLDER].set("list", payload());
      } catch (e) {}
    }, 350);
  }
  function adopt(s) {
    if (!s || typeof s !== "object") return false;
    var changed = false;
    if (Array.isArray(s.items)) {
      state.items = s.items.filter(validItem).map(function (it) {
        return {
          id: it.id || uid(),
          url: it.url,
          title: String(it.title || titleFromUrl(it.url)),
          addedBy: it.addedBy || "",
          addedAt: it.addedAt || 0
        };
      });
      changed = true;
    }
    if (typeof s.activeId === "string" && itemById(s.activeId)) state.activeId = s.activeId;
    if (typeof s.enabled === "boolean") state.enabled = s.enabled;
    if (typeof s.rotate === "boolean") state.rotate = s.rotate;
    return changed;
  }
  function load() {
    var raw = null;
    try { raw = localStorage[LS_KEY]; } catch (e) {}
    if (raw) { try { adopt(JSON.parse(raw)); } catch (e) {} }
    /* kv backfill (same pattern as gallery.js): cloud wins only when local is empty */
    try {
      if (window.root && root.kv && root.kv[KV_FOLDER]) {
        root.kv[KV_FOLDER].get("list").then(function (v) {
          if (v && typeof v === "object" && !state.items.length) {
            if (adopt(v)) { paint(); apply(); }
          }
        }).catch(function () {});
      }
    } catch (e) {}
  }
  function itemById(id) {
    for (var i = 0; i < state.items.length; i++) { if (state.items[i].id === id) return state.items[i]; }
    return null;
  }
  function activeItem() { return state.activeId ? itemById(state.activeId) : null; }

  /* ----------------------------------------------------------------- layer */
  var siteLayer = null, siteImg = null, siteVid = null;
  /* The gallery's own page background (#t2iBgLayer, owned by src/gallery.js, which
     lazy-loads at any time) uses the same position:fixed + z-index:-1 trick. With
     equal z-index the LATER sibling paints on top — so unless we stay after it in
     the DOM, the gallery background covers the site background and switching site
     backgrounds appears to do nothing. */
  function keepSiteLayerOnTop() {
    try {
      if (!siteLayer || !siteLayer.isConnected) return;
      var t2i = document.getElementById("t2iBgLayer");
      if (t2i && t2i.parentNode === siteLayer.parentNode &&
          (t2i.compareDocumentPosition(siteLayer) & Node.DOCUMENT_POSITION_PRECEDING)) {
        /* siteLayer currently precedes t2i in the DOM — move site after t2i so the
           site background paints above the gallery background. */
        t2i.parentNode.insertBefore(siteLayer, t2i.nextSibling);
      }
    } catch (e) {}
  }
  var layerOrderObserver = null;
  function watchLayerOrder() {
    if (layerOrderObserver) return;
    try {
      layerOrderObserver = new MutationObserver(function () { keepSiteLayerOnTop(); });
      layerOrderObserver.observe(document.body, { childList: true });
    } catch (e) {}
  }
  function ensureSiteLayer() {
    if (siteLayer && siteLayer.isConnected) { keepSiteLayerOnTop(); return siteLayer; }
    siteLayer = $("bgSiteLayer");
    if (!siteLayer) {
      siteLayer = document.createElement("div");
      siteLayer.id = "bgSiteLayer";
      siteLayer.style.cssText = "position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;display:none;";
      siteImg = document.createElement("img");
      siteImg.alt = "";
      siteImg.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;display:none;";
      try { siteImg.draggable = false; } catch (e) {}
      siteVid = document.createElement("video");
      siteVid.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;display:none;";
      siteVid.muted = true;
      siteVid.loop = true;
      try { siteVid.playsInline = true; } catch (e) {}
      siteLayer.appendChild(siteImg);
      siteLayer.appendChild(siteVid);
      document.body.appendChild(siteLayer);
    } else {
      siteImg = siteLayer.querySelector("img");
      siteVid = siteLayer.querySelector("video");
    }
    keepSiteLayerOnTop();
    watchLayerOrder();
    return siteLayer;
  }
  function setMedia(url) {
    ensureSiteLayer();
    try { if (siteVid) { siteVid.pause(); siteVid.removeAttribute("src"); } } catch (e) {}
    try { if (siteImg) siteImg.removeAttribute("src"); } catch (e) {}
    if (!url) {
      if (siteImg) siteImg.style.display = "none";
      if (siteVid) siteVid.style.display = "none";
      siteLayer.style.display = "none";
      return;
    }
    if (isVideoUrl(url)) {
      if (siteImg) siteImg.style.display = "none";
      if (siteVid) {
        siteVid.style.display = "block";
        siteVid.src = url;
        try { var p = siteVid.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
      }
    } else {
      if (siteVid) siteVid.style.display = "none";
      if (siteImg) { siteImg.style.display = "block"; siteImg.src = url; }
    }
    siteLayer.style.display = "block";
  }
  function notifyPageBg() { try { if (window.__onPageBgChange) window.__onPageBgChange(); } catch (e) {} }
  function apply() {
    var it = state.enabled ? activeItem() : null;
    var url = it ? it.url : null;
    try { document.body.classList.toggle("has-site-bg", !!url); } catch (e) {}
    setMedia(url);
    notifyPageBg();
    syncHubButton();
    paint();
  }

  /* ------------------------------------------------------------------- ops */
  function setActive(id) {
    if (!itemById(id)) return;
    state.activeId = id;
    state.enabled = true;
    save();
    rotateStart();  /* a manual pick gets a fresh 2-minute window */
    apply();
  }
  function clearActive() {
    state.activeId = null;
    save();
    apply();
  }
  function toggleEnabled() {
    state.enabled = !state.enabled;
    save();
    apply();
  }
  function shufflePick() {
    if (!state.items.length) { toast("Add a background first."); return; }
    var pool = state.items.filter(function (x) { return x.id !== state.activeId; });
    var src = pool.length ? pool : state.items;
    setActive(src[Math.floor(Math.random() * src.length)].id);
  }
  /* ⏱️ rotate mode: each background stays up for 2 minutes, in list order. */
  var ROTATE_MS = 2 * 60 * 1000;
  var rotateTimer = null;
  function rotateStop() {
    if (rotateTimer) { clearInterval(rotateTimer); rotateTimer = null; }
  }
  function rotateStart() {
    rotateStop();
    if (!state.rotate) return;
    rotateTimer = setInterval(function () {
      if (!state.rotate) { rotateStop(); return; }
      if (!state.enabled || state.items.length < 2) return;  /* paused while off */
      stepNext();
    }, ROTATE_MS);
  }
  function stepNext() {
    if (!state.items.length) return;
    var ix = -1;
    for (var i = 0; i < state.items.length; i++) {
      if (state.items[i].id === state.activeId) { ix = i; break; }
    }
    setActive(state.items[(ix + 1) % state.items.length].id);
  }
  function setRotate(on) {
    state.rotate = !!on;
    if (state.rotate) {
      if (!state.items.length) { toast("Add a background first."); state.rotate = false; }
      else {
        if (!state.enabled) state.enabled = true;
        if (!activeItem() && state.items.length) state.activeId = state.items[0].id;
        if (state.items.length < 2) toast("Only one background — add more to rotate.");
        else toast("Auto-rotate on — each background shows for 2 minutes.");
      }
    } else {
      toast("Auto-rotate off.");
    }
    save();
    rotateStart();
    apply();
  }
  function add(entries, opts) {
    opts = opts || {};
    if (typeof entries === "string") entries = [entries];
    var added = [];
    var seen = {};
    state.items.forEach(function (x) { seen[x.url] = true; });
    (entries || []).forEach(function (raw) {
      var entry = typeof raw === "string" ? { url: raw } : (raw || {});
      var url = normalizeUrl(entry.url);
      if (!url) return;
      if (!BG_RE.test(url)) {
        if (!opts.quietSkips) toast("Skipped (not a direct image/video link): " + url.slice(0, 80));
        return;
      }
      if (seen[url]) {
        if (!opts.quietDuplicates) {
          var dup0 = null;
          for (var i = 0; i < state.items.length; i++) { if (state.items[i].url === url) { dup0 = state.items[i]; break; } }
          toast("Already in backgrounds: " + (dup0 ? dup0.title : url.slice(0, 60)));
        }
        return;
      }
      seen[url] = true;
      if (state.items.length >= MAX_ITEMS) { toast("Backgrounds is full (" + MAX_ITEMS + ")."); return; }
      var it = {
        id: uid(),
        url: url,
        title: entry.title ? prettyName(entry.title) : titleFromUrl(url),
        addedBy: entry.addedBy || "",
        addedAt: Date.now()
      };
      state.items.push(it);
      added.push(it);
    });
    if (!added.length) return 0;
    if (!state.activeId) { state.activeId = added[0].id; state.enabled = true; }
    save();
    apply();
    return added.length;
  }
  function addLinksFromText(text) {
    var urls = String(text || "").split(/[\s,]+/).map(normalizeUrl).filter(Boolean);
    if (!urls.length) { toast("No links found in that text."); return 0; }
    var n = add(urls, { quietDuplicates: urls.length > 1, quietSkips: urls.length > 1 });
    if (n) toast("Added " + n + (n === 1 ? " background." : " backgrounds."));
    return n;
  }
  function shrinkImage(file) {
    return new Promise(function (resolve, reject) {
      var objectUrl = null;
      try { objectUrl = URL.createObjectURL(file); } catch (e) { reject(e); return; }
      var img = new Image();
      img.onload = function () {
        try {
          var MAX = 1920;
          if (img.naturalWidth <= MAX && img.naturalHeight <= MAX && file.size <= 1500000) {
            URL.revokeObjectURL(objectUrl); resolve(file); return;
          }
          var scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
          var c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.naturalWidth * scale));
          c.height = Math.max(1, Math.round(img.naturalHeight * scale));
          var ctx = c.getContext("2d");
          ctx.fillStyle = "#000"; ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(objectUrl);
          c.toBlob(function (b) { if (b) resolve(b); else reject(new Error("toBlob failed")); }, "image/jpeg", 0.88);
        } catch (e) { try { URL.revokeObjectURL(objectUrl); } catch (e2) {} reject(e); }
      };
      img.onerror = function () { try { URL.revokeObjectURL(objectUrl); } catch (e) {} reject(new Error("decode failed")); };
      img.src = objectUrl;
    });
  }
  function uploadFiles(files) {
    var up = (window.root && window.root.uploadPlugin) || window.uploadPlugin;
    if (!up) { toast("Upload service isn't ready yet — try again in a moment."); return Promise.resolve(0); }
    files = Array.prototype.slice.call(files || []);
    if (!files.length) return Promise.resolve(0);
    var chain = Promise.resolve();
    var done = 0;
    files.forEach(function (f, i) {
      chain = chain.then(function () {
        var looksBg = /^image\//i.test(f.type || "") || /^video\//i.test(f.type || "") || BG_RE.test(f.name || "");
        if (!looksBg) { toast("\u201C" + f.name + "\u201D doesn't look like an image/video — skipped."); return null; }
        toast("Uploading \u201C" + f.name + "\u201D" + (files.length > 1 ? " (" + (i + 1) + "/" + files.length + ")" : "") + "…");
        var blobP = Promise.resolve(f);
        if (/^image\//i.test(f.type || "") && f.type !== "image/gif") {
          blobP = shrinkImage(f).catch(function () { return f; });
        }
        return blobP.then(function (blob) { return up(blob); }).then(function (res) {
          if (!res || res.error) { toast("Upload failed: " + ((res && res.error) || "unknown error")); return null; }
          if (res.url && add([{ url: res.url, addedBy: "you (uploaded)", title: f.name }])) {
            done++;
            toast("Added \u201C" + prettyName(f.name) + "\u201D");
          }
          return null;
        }).catch(function (e) {
          toast("Upload failed: " + ((e && e.message) || e));
          return null;
        });
      });
    });
    return chain.then(function () { paint(); return done; });
  }
  function pickAndUpload() {
    var inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*,video/*,.jpg,.jpeg,.png,.gif,.webp,.avif,.mp4,.webm,.ogg,.mov";
    inp.multiple = "multiple";
    inp.style.display = "none";
    document.body.appendChild(inp);
    inp.addEventListener("change", function () {
      var files = inp.files;
      inp.remove();
      uploadFiles(files);
    });
    inp.addEventListener("cancel", function () { inp.remove(); });
    inp.click();
  }
  /* studio stand-in for the chat's "From this chat": pull links saved in the
     gallery's page-background modal library (window.t2iBackgrounds.list()). */
  function addFromSaved() {
    var lib = [];
    try { if (window.t2iBackgrounds && typeof window.t2iBackgrounds.list === "function") lib = window.t2iBackgrounds.list() || []; } catch (e) {}
    var urls = lib.map(function (e) { return e && e.url; }).filter(function (u) { return typeof u === "string" && /^https?:\/\//i.test(u); });
    if (!urls.length) { toast("No saved backgrounds yet — save some from the page-background modal first."); return 0; }
    var n = add(urls.map(function (u) { return { url: u, addedBy: "saved" }; }), { quietDuplicates: true, quietSkips: true });
    toast(n ? ("Added " + n + (n === 1 ? " background." : " backgrounds.")) : "Those links are already in backgrounds.");
    return n;
  }
  function download(filename, text) {
    try {
      var blob = new Blob([text], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (e) {} if (a.parentNode) a.parentNode.removeChild(a); }, 4000);
    } catch (e) { toast("Export failed."); }
  }
  function exportList() {
    download("backgrounds.json", JSON.stringify({ type: "perchance-backgrounds", v: 1, items: state.items.map(function (it) { return { url: it.url, title: it.title }; }) }, null, 2));
  }
  function importList() {
    var inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".json,.txt,.m3u,.m3u8";
    inp.style.display = "none";
    document.body.appendChild(inp);
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0];
      inp.remove();
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var text = String(rd.result || "");
        var n = 0;
        try {
          var j = JSON.parse(text);
          var arr = Array.isArray(j) ? j : (j.items || j.tracks || []);
          if (Array.isArray(arr) && arr.length && arr[0] && typeof arr[0] === "object") {
            n = add(arr.map(function (x) { return { url: x.url, title: x.title || "" }; }), { quietDuplicates: true, quietSkips: true });
          } else if (Array.isArray(arr) && arr.length) {
            n = add(arr, { quietDuplicates: true, quietSkips: true });
          }
        } catch (e) { n = addLinksFromText(text); }
        if (n) toast("Imported " + n + (n === 1 ? " background." : " backgrounds."));
        paint();
      };
      rd.readAsText(f);
    });
    inp.addEventListener("cancel", function () { inp.remove(); });
    inp.click();
  }
  async function clearAll() {
    if (!state.items.length) return;
    if (!(await window.uiConfirm("Remove all " + state.items.length + " backgrounds?", { okText: 'Remove all', danger: true }))) return;
    var wasActive = !!activeItem();
    state.items = [];
    state.activeId = null;
    save();
    apply();
    if (wasActive) toast("Backgrounds cleared.");
  }
  function move(id, dir) {
    var ix = -1;
    for (var i = 0; i < state.items.length; i++) { if (state.items[i].id === id) { ix = i; break; } }
    var jx = ix + dir;
    if (ix < 0 || jx < 0 || jx >= state.items.length) return;
    var tmp = state.items[ix]; state.items[ix] = state.items[jx]; state.items[jx] = tmp;
    save();
    paint();
  }
  function renameItem(id) {
    var it = itemById(id);
    if (!it) return;
    var v = null;
    try { v = window.prompt("Rename background:", it.title); } catch (e) { return; }
    if (v === null) return;
    v = String(v).replace(/\s+/g, " ").trim().slice(0, 120);
    if (!v) return;
    it.title = v;
    save();
    paint();
  }

  /* ------------------------------------------------------------ hub button */
  function syncHubButton() {
    var b = $("bg-hub-btn");
    if (!b) return;
    var on = state.enabled && !!activeItem();
    b.classList.toggle("i2p-hub-on", on);
    var act = activeItem();
    b.title = on ? ("Backgrounds — showing: " + (act ? act.title : "")) : "Backgrounds — site backgrounds from links";
  }
  function ensureHubButton() {
    if ($("bg-hub-btn")) { syncHubButton(); return; }
    var hub = $("i2p-hubbar");
    if (!hub) return;
    var b = document.createElement("button");
    b.id = "bg-hub-btn";
    b.type = "button";
    b.className = "i2p-hubbtn";
    var ico = document.createElement("span");
    ico.className = "i2p-hubico";
    ico.textContent = "🖼️";
    var lbl = document.createElement("span");
    lbl.className = "i2p-hublbl";
    lbl.textContent = "Backgrounds";
    b.appendChild(ico);
    b.appendChild(lbl);
    b.addEventListener("click", function (e) { e.stopPropagation(); open(); });
    var fs = $("i2p-fs-btn");
    if (fs && fs.nextSibling) hub.insertBefore(b, fs.nextSibling);
    else if (fs) hub.appendChild(b);
    else hub.appendChild(b);
    syncHubButton();
  }

  /* ----------------------------------------------------------------- panel */
  var query = "";
  function css() {
    if ($("bgHubCss")) return;
    var s = document.createElement("style");
    s.id = "bgHubCss";
    s.textContent =
      "#bgHubOverlay{position:fixed;inset:0;z-index:94000;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(0,0,0,0.62);}" +
      "#bgHubOverlay[hidden]{display:none;}" +
      "#bgHubOverlay.bghub-dragover .bghub-panel{outline:2px dashed var(--th-accent);outline-offset:-2px;}" +
      ".bghub-panel{width:min(720px,94vw);max-height:88vh;max-height:88dvh;overflow-y:auto;box-sizing:border-box;background:var(--th-modal,var(--th-surface));border:1px solid var(--th-border);border-radius:16px;box-shadow:0 18px 50px -12px rgba(0,0,0,0.7);padding:0.9rem 1rem 1.1rem;text-align:left;font-family:inherit;color:inherit;}" +
      ".bghub-head{display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;}" +
      ".bghub-head b{font-size:1.05rem;}" +
      ".bghub-head span{font-size:0.72rem;opacity:0.6;flex:1;}" +
      ".bghub-x{cursor:pointer;background:transparent;color:inherit;border:1px solid var(--th-border);border-radius:6px;font:inherit;padding:0.1rem 0.5rem;}" +
      ".bghub-card{background:var(--th-surface);border:1px solid var(--th-border);border-radius:12px;padding:0.7rem 0.8rem;margin-top:0.6rem;}" +
      ".bghub-row{display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;}" +
      ".bghub-status{font-size:0.85rem;opacity:0.75;flex:1;min-width:120px;}" +
      ".bghub-note{font-size:0.75rem;opacity:0.65;line-height:1.45;margin-top:0.45rem;}" +
      ".bghub-btn{cursor:pointer;font:inherit;font-size:0.8rem;font-weight:600;color:inherit;background:var(--th-surface);border:1px solid var(--th-border);border-radius:999px;padding:0.35rem 0.8rem;white-space:nowrap;}" +
      ".bghub-btn:hover{border-color:var(--th-accent);background:var(--th-accent-soft);}" +
      ".bghub-btn.primary{background:var(--th-accent);border-color:var(--th-accent);color:var(--th-accent-text);}" +
      ".bghub-links{width:100%;box-sizing:border-box;min-height:64px;resize:vertical;font:inherit;font-size:0.82rem;color:inherit;background:var(--th-field,var(--th-surface));border:1px solid var(--th-border);border-radius:9px;padding:0.5rem 0.6rem;}" +
      ".bghub-listhead{display:flex;align-items:center;gap:0.5rem;}" +
      ".bghub-listhead b{font-size:0.9rem;}" +
      ".bghub-filter{margin-left:auto;font:inherit;font-size:0.8rem;color:inherit;background:var(--th-field,var(--th-surface));border:1px solid var(--th-border);border-radius:9px;padding:0.35rem 0.55rem;width:150px;}" +
      ".bghub-list{margin-top:0.5rem;display:flex;flex-direction:column;gap:0.4rem;max-height:46vh;max-height:46dvh;overflow-y:auto;}" +
      ".bghub-item{display:flex;align-items:center;gap:0.55rem;background:var(--th-bg,rgba(0,0,0,0.12));border:1px solid var(--th-border);border-radius:10px;padding:0.35rem 0.45rem;}" +
      ".bghub-item.active{border-color:var(--th-accent);}" +
      ".bghub-thumb{width:64px;height:40px;flex-shrink:0;border-radius:6px;overflow:hidden;background:rgba(127,127,127,0.25);position:relative;}" +
      ".bghub-thumb img,.bghub-thumb video{width:100%;height:100%;object-fit:cover;display:block;}" +
      ".bghub-thumb .bghub-vidbadge{position:absolute;right:2px;bottom:2px;background:rgba(0,0,0,0.65);color:#fff;font-size:70%;border-radius:4px;padding:0 4px;}" +
      ".bghub-meta{flex:1;min-width:0;}" +
      ".bghub-title{font-size:0.82rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      ".bghub-sub{font-size:0.7rem;opacity:0.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      ".bghub-acts{display:flex;gap:0.25rem;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;}" +
      ".bghub-act{cursor:pointer;font:inherit;font-size:0.72rem;color:inherit;background:transparent;border:1px solid var(--th-border);border-radius:8px;padding:0.2rem 0.45rem;}" +
      ".bghub-act:hover{border-color:var(--th-accent);background:var(--th-accent-soft);}" +
      ".bghub-act.use{border-color:var(--th-accent);font-weight:800;}" +
      ".bghub-empty{font-size:0.82rem;opacity:0.65;padding:0.6rem 0.2rem;}" +
      "body.has-site-bg :is(#i2p-app, #evo-app, #edit-app, #theme-app, #home-app, #persona-app, #i2p-aiedit, #comic-app, #i2p-imggen, #comm-app, #story-app, #listings-app){background:transparent;}" +
      "body.has-site-bg #i2p-header{background:var(--th-surface);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);}" +
      "#bg-hub-btn.i2p-hub-on{border-color:var(--th-accent);background:var(--th-accent-soft);}";
    document.head.appendChild(s);
  }
  function overlay() { return $("bgHubOverlay"); }
  function build() {
    if (overlay()) return;
    css();
    var ov = document.createElement("div");
    ov.id = "bgHubOverlay";
    ov.hidden = true;
    var panel = document.createElement("div");
    panel.className = "bghub-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Backgrounds");
    var head = document.createElement("div");
    head.className = "bghub-head";
    var title = document.createElement("b");
    title.textContent = "🖼️ Backgrounds";
    var sub = document.createElement("span");
    sub.textContent = "site backgrounds from links";
    var x = document.createElement("button");
    x.type = "button";
    x.className = "bghub-x";
    x.textContent = "✕";
    x.title = "Close";
    x.addEventListener("click", close);
    head.appendChild(title);
    head.appendChild(sub);
    head.appendChild(x);
    panel.appendChild(head);

    /* status card */
    var status = document.createElement("div");
    status.className = "bghub-card";
    var row = document.createElement("div");
    row.className = "bghub-row";
    var sw = document.createElement("label");
    sw.style.cssText = "display:inline-flex;align-items:center;gap:0.4rem;font-size:0.85rem;font-weight:700;cursor:pointer;";
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = "bghub-enabled";
    cb.style.cssText = "width:auto;accent-color:var(--th-accent,#2b6bf0);";
    var swTxt = document.createElement("span");
    swTxt.textContent = "Site backgrounds";
    sw.appendChild(cb);
    sw.appendChild(swTxt);
    var st = document.createElement("span");
    st.className = "bghub-status";
    st.id = "bghub-status";
    var shuf = document.createElement("button");
    shuf.type = "button";
    shuf.className = "bghub-btn";
    shuf.textContent = "🔀 shuffle";
    shuf.title = "Show a random background from the list";
    shuf.addEventListener("click", function () { shufflePick(); });
    var rot = document.createElement("button");
    rot.type = "button";
    rot.className = "bghub-btn";
    rot.id = "bghub-rotate";
    rot.textContent = "⏱️ rotate 2m: off";
    rot.title = "Automatically show each background for 2 minutes, in turn";
    rot.addEventListener("click", function () { setRotate(!state.rotate); });
    row.appendChild(sw);
    row.appendChild(st);
    row.appendChild(shuf);
    row.appendChild(rot);
    status.appendChild(row);
    var row2 = document.createElement("div");
    row2.className = "bghub-row";
    row2.style.marginTop = "0.45rem";
    var none = document.createElement("button");
    none.type = "button";
    none.className = "bghub-btn";
    none.textContent = "🚫 none";
    none.title = "Turn the site background off";
    none.addEventListener("click", function () { state.enabled = false; state.activeId = null; save(); apply(); });
    row2.appendChild(none);
    status.appendChild(row2);
    var note = document.createElement("div");
    note.className = "bghub-note";
    note.textContent = "The site background shows behind every tab. Turning it off restores your page background, if you set one in the gallery. ⏱️ Rotate shows each background for 2 minutes in turn.";
    status.appendChild(note);
    panel.appendChild(status);
    cb.addEventListener("change", function () {
      state.enabled = cb.checked;
      if (state.enabled && !activeItem() && state.items.length) state.activeId = state.items[0].id;
      save();
      rotateStart();  /* re-enabling resumes the 2-minute cadence */
      apply();
    });

    /* post card */
    var post = document.createElement("div");
    post.className = "bghub-card";
    var plbl = document.createElement("div");
    plbl.style.cssText = "font-size:0.85rem;font-weight:700;margin-bottom:0.4rem;";
    plbl.textContent = "📌 Post background links";
    post.appendChild(plbl);
    var ta = document.createElement("textarea");
    ta.className = "bghub-links";
    ta.id = "bghub-links";
    ta.placeholder = "https://user.uploads.dev/file/abc123.jpg\nhttps://files.catbox.moe/xyz.mp4";
    post.appendChild(ta);
    var btns = document.createElement("div");
    btns.className = "bghub-row";
    btns.style.marginTop = "0.45rem";
    function mkBtn(label, title, fn) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "bghub-btn";
      b.textContent = label;
      b.title = title;
      b.addEventListener("click", fn);
      btns.appendChild(b);
      return b;
    }
    mkBtn("➕ Add links", "Add the pasted links to backgrounds", function () {
      addLinksFromText(ta.value);
      ta.value = "";
    });
    mkBtn("⬆️ Upload image/video", "Upload files from your device", function () { pickAndUpload(); });
    mkBtn("🖼️ From saved", "Pull links saved in the page-background modal", function () { addFromSaved(); });
    mkBtn("⬇️ export", "Download the list as JSON", function () { exportList(); });
    mkBtn("⬆️ import", "Load a JSON / link list", function () { importList(); });
    mkBtn("🧹 clear all", "Remove every background", function () { clearAll(); });
    post.appendChild(btns);
    var hint = document.createElement("div");
    hint.className = "bghub-note";
    hint.textContent = "Direct image/video links only (.jpg .png .gif .webp .mp4 .webm …). Tip: upload with ⬆️ Upload, or drop files straight onto this window.";
    post.appendChild(hint);
    panel.appendChild(post);

    /* list card */
    var list = document.createElement("div");
    list.className = "bghub-card";
    var lh = document.createElement("div");
    lh.className = "bghub-listhead";
    var lb = document.createElement("b");
    lb.id = "bghub-count";
    lb.textContent = "0 backgrounds";
    var filt = document.createElement("input");
    filt.className = "bghub-filter";
    filt.id = "bghub-filter";
    filt.placeholder = "filter…";
    filt.setAttribute("aria-label", "Filter backgrounds");
    filt.addEventListener("input", function () { query = filt.value; paint(); });
    lh.appendChild(lb);
    lh.appendChild(filt);
    list.appendChild(lh);
    var rows = document.createElement("div");
    rows.className = "bghub-list";
    rows.id = "bghub-list";
    list.appendChild(rows);
    panel.appendChild(list);

    ov.appendChild(panel);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
    document.body.appendChild(ov);
    wireDrop(ov);
  }
  function wireDrop(ov) {
    var depth = 0;
    ov.addEventListener("dragenter", function (e) {
      e.preventDefault();
      depth++;
      ov.classList.add("bghub-dragover");
    });
    ov.addEventListener("dragover", function (e) { e.preventDefault(); });
    ov.addEventListener("dragleave", function (e) {
      e.preventDefault();
      depth = Math.max(0, depth - 1);
      if (!depth) ov.classList.remove("bghub-dragover");
    });
    ov.addEventListener("drop", function (e) {
      e.preventDefault();
      depth = 0;
      ov.classList.remove("bghub-dragover");
      try {
        var dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length) { uploadFiles(dt.files); return; }
        var txt = dt ? (dt.getData("text/uri-list") || dt.getData("text/plain") || "") : "";
        if (txt) addLinksFromText(txt);
      } catch (err) {}
    });
  }
  function visibleItems() {
    var q = String(query || "").trim().toLowerCase();
    if (!q) return state.items.slice();
    return state.items.filter(function (it) {
      return (it.title + " " + it.url + " " + (it.addedBy || "")).toLowerCase().indexOf(q) !== -1;
    });
  }
  function paint() {
    var ov = overlay();
    if (!ov || ov.hidden) { syncHubButton(); return; }
    var cb = $("bghub-enabled");
    if (cb) cb.checked = !!state.enabled;
    var st = $("bghub-status");
    if (st) {
      var act = state.enabled ? activeItem() : null;
      st.textContent = act ? act.title : "Nothing selected.";
    }
    var rot = $("bghub-rotate");
    if (rot) rot.textContent = state.rotate ? "⏱️ rotate 2m: on" : "⏱️ rotate 2m: off";
    var cnt = $("bghub-count");
    if (cnt) cnt.textContent = state.items.length + (state.items.length === 1 ? " background" : " backgrounds");
    var rows = $("bghub-list");
    if (!rows) return;
    while (rows.firstChild) rows.removeChild(rows.firstChild);
    var vis = visibleItems();
    if (!vis.length) {
      var empty = document.createElement("div");
      empty.className = "bghub-empty";
      empty.textContent = state.items.length ? "No backgrounds match that filter." : "Nothing here yet — paste a link above and hit ➕ Add links.";
      rows.appendChild(empty);
      return;
    }
    vis.forEach(function (it, di) {
      var row = document.createElement("div");
      row.className = "bghub-item" + (it.id === state.activeId && state.enabled ? " active" : "");
      var th = document.createElement("div");
      th.className = "bghub-thumb";
      var vid = isVideoUrl(it.url);
      if (vid) {
        var v = document.createElement("video");
        v.src = it.url;
        v.muted = true;
        v.preload = "metadata";
        try { v.playsInline = true; } catch (e) {}
        th.appendChild(v);
        var badge = document.createElement("span");
        badge.className = "bghub-vidbadge";
        badge.textContent = "▶";
        th.appendChild(badge);
      } else {
        var im = document.createElement("img");
        im.src = it.url;
        im.loading = "lazy";
        im.alt = "";
        im.onerror = function () { im.style.opacity = "0.2"; };
        th.appendChild(im);
      }
      var meta = document.createElement("div");
      meta.className = "bghub-meta";
      var t = document.createElement("div");
      t.className = "bghub-title";
      t.textContent = (di + 1) + ". " + it.title;
      var sub = document.createElement("div");
      sub.className = "bghub-sub";
      var h = hostInfo(it.url);
      sub.textContent = (vid ? "🎬 video · " : "🖼️ image · ") + h.ico + " " + h.label + (it.addedBy ? " · " + it.addedBy : "");
      meta.appendChild(t);
      meta.appendChild(sub);
      var acts = document.createElement("div");
      acts.className = "bghub-acts";
      function act2(label, title, fn, cls) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "bghub-act" + (cls ? " " + cls : "");
        b.textContent = label;
        b.title = title;
        b.addEventListener("click", function (e) { e.stopPropagation(); fn(); });
        acts.appendChild(b);
      }
      act2("use", "Show this background site-wide", function () { setActive(it.id); }, "use");
      act2("↑", "Move up", function () { move(it.id, -1); });
      act2("↓", "Move down", function () { move(it.id, 1); });
      act2("✏️", "Rename", function () { renameItem(it.id); });
      act2("🗑️", "Remove", function () {
        state.items = state.items.filter(function (x) { return x.id !== it.id; });
        if (state.activeId === it.id) state.activeId = null;
        save();
        apply();
      });
      row.appendChild(th);
      row.appendChild(meta);
      row.appendChild(acts);
      rows.appendChild(row);
    });
  }
  function open() {
    build();
    var ov = overlay();
    if (!ov) return;
    ov.hidden = false;
    paint();
    syncHubButton();
  }
  function close() {
    var ov = overlay();
    if (ov) ov.hidden = true;
  }

  /* ------------------------------------------------------------------ boot */
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  load();
  /* seed once from the gallery's current page background (visible, not active) */
  try {
    var raw = null;
    try { raw = localStorage["t2iBgSettings"]; } catch (e) {}
    if (raw && !state.items.length) {
      var s = JSON.parse(raw);
      if (s && typeof s.url === "string" && /^https?:\/\//i.test(s.url) && BG_RE.test(s.url)) {
        state.items.push({ id: uid(), url: s.url, title: titleFromUrl(s.url), addedBy: "page background", addedAt: Date.now() });
        save();
      }
    }
  } catch (e) {}
  ensureHubButton();
  setTimeout(ensureHubButton, 0);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply);
  else apply();
  rotateStart();  /* resume a persisted rotate:on across reloads */

  window.siteBackgrounds = {
    open: open,
    close: close,
    items: function () { return state.items; },
    active: function () { return activeItem(); },
    add: add,
    addLinksFromText: addLinksFromText,
    setActive: setActive,
    clear: clearActive,
    toggle: toggleEnabled,
    shuffle: shufflePick,
    setRotate: setRotate,
    rotate: function () { return !!state.rotate; },
    apply: apply
  };
  window.__bgRotateStep = stepNext;  /* test hook: advance one slot immediately */
})();
