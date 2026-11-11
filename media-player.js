/* ============================================================================
   🎵 Media player — a built-in music/audio playlist for links you post to it.

   Modeled on bigger-and-better-ai-chat's src/musicplayer.js (see Credits tab),
   including its tag-reader parsers (vendored below: ID3v2/v1, APEv2, FLAC/Ogg
   comments, MP4 atoms, Matroska, RIFF — each returns null instead of throwing).

   You POST links to it (paste them, drop files on the window, upload from the
   device) and every song becomes a selectable row. The <audio> element and all
   playback state live at module scope, so music keeps playing while the panel
   is hidden. Real title/artist/album/cover are read from each file's own tags
   (head ~160 KB streamed-then-cancelled + last 8 KB via a preflight-safe byte
   range); an explicit ✏️ rename always wins, otherwise the filename stays and
   nothing is invented. OS media keys / lock-screen drive it via MediaSession.

   Storage: localStorage `t2iMusicState` (debounced), kv-mirrored at
   root.kv.t2iMusicPlaylist/"list". Per-browser, follows the user across tabs.
   Cover art is a blob: URL and is never persisted.

   Studio deltas vs the chat original (also in src/README.md):
   - No "From this chat" (no chat messages) and no "put link into chat box"
     (no chat input) — rows get 📋 copy-link instead.
   - No scene-music interplay (no chat scene music here).

   Public API: window.musicPlayer = { open, close, refresh, state, items, add,
   addLinksFromText, play, toggle, stop, next, prev, seekTo, seekBy, setVolume,
   setRate, toggleShuffle, cycleRepeat, audio, normalizeUrl, hostInfo, fmtTime,
   reprobeAll, parseHeadTags, parseTailTags, ... } (parsers exposed like the original).
   ========================================================================== */
(function () {
  "use strict";
  if (window.__musicPlayerInstalled) return;
  window.__musicPlayerInstalled = true;

  /* -------------------------------------------------------------- constants */
  var LS_KEY = "t2iMusicState";
  var KV_FOLDER = "t2iMusicPlaylist";
  var AUDIO_RE = /\.(mp3|m4a|m4b|aac|ogg|oga|opus|wav|wave|flac|weba|webm|mp4|m4v|mka|aiff?|realaudio)(\?|#|$)/i;
  var RATES = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
  var MAX_ITEMS = 1000;
  var TAG_BYTES = 160 * 1024;
  var TAIL_BYTES = 8 * 1024;
  var MAX_BOOT_PROBES = 40;

  /* ---------------------------------------------------------------- helpers */
  function $(id) { return document.getElementById(id); }
  function uid() {
    try {
      if (window.crypto && crypto.getRandomValues) {
        var b = new Uint8Array(8); crypto.getRandomValues(b);
        var s = ""; for (var i = 0; i < b.length; i++) s += ("0" + b[i].toString(16)).slice(-2);
        return "m" + s;
      }
    } catch (e) {}
    return "m" + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
  }
  function toast(msg) {
    try {
      var t = document.createElement("div");
      t.textContent = msg;
      t.style.cssText = "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:99999;" +
        "background:var(--th-modal,var(--th-surface));border:1px solid var(--th-border);border-radius:999px;" +
        "padding:0.45rem 0.9rem;font-size:0.82rem;box-shadow:0 12px 30px -12px rgba(0,0,0,0.7);max-width:92vw;";
      document.body.appendChild(t);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2400);
    } catch (e) {}
  }
  function fmtTime(s) {
    if (!(s >= 0) || !isFinite(s)) return "—";
    s = Math.floor(s);
    var m = Math.floor(s / 60), r = s % 60;
    var h = Math.floor(m / 60);
    if (h) return h + ":" + ("0" + (m % 60)).slice(-2) + ":" + ("0" + r).slice(-2);
    return m + ":" + ("0" + r).slice(-2);
  }
  function prettyName(s) {
    s = String(s || "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_+]+/g, " ").replace(/\s+/g, " ").trim();
    return s || "Untitled";
  }
  function fileNameOf(url) {
    try {
      var parts = String(url).split("?")[0].split("/").filter(Boolean);
      return decodeURIComponent(parts.pop() || "track");
    } catch (e) { return "track"; }
  }
  function hostInfo(url) {
    var h = "";
    try { h = new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch (e) {}
    if (h === "user.uploads.dev" || h === "uploads.dev") return { host: h, label: "perchance", ico: "⬆️" };
    if (h === "files.catbox.moe" || h === "catbox.moe") return { host: h, label: "catbox", ico: "🐱" };
    if (/litterbox/.test(h)) return { host: h, label: "litterbox", ico: "🐱" };
    return { host: h || "link", label: h || "link", ico: "🔗" };
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
  function copyText(text) {
    function fallback() {
      try {
        var ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.left = "-9999px";
        document.body.appendChild(ta); ta.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (e) {}
        ta.remove();
        toast(ok ? "📋 Link copied" : "Copy blocked — long-press to copy");
      } catch (e) {}
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast("📋 Link copied"); }, fallback);
      } else fallback();
    } catch (e) { fallback(); }
  }

  /* ------------------------------------------------------------------ state */
  var state = {
    items: [], currentId: null,
    volume: 0.9, muted: false, shuffle: false, repeat: "off", rate: 1,
    sort: "order", filter: ""
  };
  function validItem(it) {
    return it && typeof it === "object" && typeof it.url === "string" && /^https?:\/\//i.test(it.url);
  }
  function numOrNull(v) { return (typeof v === "number" && isFinite(v) && v > 0) ? v : null; }
  function serializable(it) {
    return {
      id: it.id, url: it.url, title: it.title, artist: it.artist || "", album: it.album || "",
      duration: numOrNull(it.duration), customTitle: it.customTitle || "", tagged: !!it.tagged,
      noTitle: !!it.noTitle, addedBy: it.addedBy || "", addedAt: it.addedAt || 0
    };
  }
  var saveTimer = null;
  function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      var payload = {
        v: 1,
        items: state.items.slice(0, MAX_ITEMS).map(serializable),
        currentId: state.currentId, volume: state.volume, muted: state.muted,
        shuffle: state.shuffle, repeat: state.repeat, rate: state.rate,
        sort: state.sort, filter: ""
      };
      try { localStorage[LS_KEY] = JSON.stringify(payload); } catch (e) {}
      try {
        if (window.root && root.kv && root.kv[KV_FOLDER]) root.kv[KV_FOLDER].set("list", payload);
      } catch (e) {}
    }, 350);
  }
  function adopt(s) {
    if (!s || typeof s !== "object") return false;
    if (Array.isArray(s.items)) {
      state.items = s.items.filter(validItem).map(function (it) {
        return {
          id: it.id || uid(), url: it.url,
          title: String(it.title || prettyName(fileNameOf(it.url))),
          artist: it.artist || "", album: it.album || "",
          duration: numOrNull(it.duration), customTitle: it.customTitle || "",
          tagged: !!it.tagged, noTitle: !!it.noTitle,
          addedBy: it.addedBy || "", addedAt: it.addedAt || 0,
          art: null
        };
      });
    }
    if (typeof s.currentId === "string" && itemById(s.currentId)) state.currentId = s.currentId;
    if (typeof s.volume === "number" && s.volume >= 0 && s.volume <= 1) state.volume = s.volume;
    if (typeof s.muted === "boolean") state.muted = s.muted;
    if (typeof s.shuffle === "boolean") state.shuffle = s.shuffle;
    if (s.repeat === "off" || s.repeat === "all" || s.repeat === "one") state.repeat = s.repeat;
    if (typeof s.rate === "number" && RATES.indexOf(s.rate) !== -1) state.rate = s.rate;
    if (typeof s.sort === "string") state.sort = s.sort;
    return true;
  }
  function load() {
    var raw = null;
    try { raw = localStorage[LS_KEY]; } catch (e) {}
    if (raw) { try { adopt(JSON.parse(raw)); } catch (e) {} }
    try {
      if (window.root && root.kv && root.kv[KV_FOLDER]) {
        root.kv[KV_FOLDER].get("list").then(function (v) {
          if (v && typeof v === "object" && !state.items.length) {
            if (adopt(v)) { applyAudioState(); paint(); }
          }
        }).catch(function () {});
      }
    } catch (e) {}
  }
  function itemById(id) {
    for (var i = 0; i < state.items.length; i++) { if (state.items[i].id === id) return state.items[i]; }
    return null;
  }
  function currentItem() { return state.currentId ? itemById(state.currentId) : null; }

  /* ------------------------------------------------------------------ audio */
  var audio = null;
  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = "metadata";
    applyAudioState();
    audio.addEventListener("timeupdate", tick);
    audio.addEventListener("loadedmetadata", function () {
      var it = currentItem();
      if (it && isFinite(audio.duration) && audio.duration > 0) {
        it.duration = audio.duration;
        if (it.status !== "ok") it.status = "ok";
        save();
      }
      tick(); paint();
    });
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onAudioError);
    audio.addEventListener("play", function () { syncTransport(); syncHubButton(); syncMini(); syncMediaSession(); });
    audio.addEventListener("pause", function () { syncTransport(); syncHubButton(); syncMini(); syncMediaSession(); });
    installMediaSession();
    return audio;
  }
  function applyAudioState() {
    if (!audio) return;
    try { audio.volume = state.muted ? 0 : state.volume; } catch (e) {}
    try { audio.playbackRate = state.rate; } catch (e) {}
  }
  function isPlaying() { return !!(audio && audio.src && !audio.paused && !audio.ended); }
  function attemptPlay() {
    ensureAudio();
    var p = null;
    try { p = audio.play(); } catch (e) { toast("Couldn't start playback."); return; }
    if (p && p.catch) p.catch(function () { toast("Your browser blocked autoplay — press ▶ to start playing"); });
  }
  function onEnded() {
    if (state.repeat === "one") {
      try { audio.currentTime = 0; } catch (e) {}
      attemptPlay();
      return;
    }
    advance(1, { auto: true });
  }
  function onAudioError() {
    var it = currentItem();
    toast("Couldn't play" + (it ? " \u201C" + it.title + "\u201D" : " that track") + " — the link may be dead.");
    if (it) it.status = "error";
    save();
    paint();
  }
  function playId(id, opts) {
    opts = opts || {};
    var it = itemById(id);
    if (!it) return;
    ensureAudio();
    state.currentId = id;
    if (audio.getAttribute("data-mid") !== id) {
      audio.setAttribute("data-mid", id);
      try { audio.src = it.url; } catch (e) {}
    }
    applyAudioState();
    save();
    probeDuration(it);
    queueProbe(it, false);
    paint();
    syncMediaSession();
    if (opts.play !== false) attemptPlay();
    else { syncTransport(); syncHubButton(); syncMini(); }
  }
  function toggle() {
    var it = currentItem();
    if (!it) {
      var vis = visibleItems();
      if (!vis.length) { toast("Add a song first."); return; }
      playId(vis[0].id);
      return;
    }
    ensureAudio();
    if (isPlaying()) { try { audio.pause(); } catch (e) {} }
    else attemptPlay();
  }
  function stop() {
    if (!audio) return;
    try { audio.pause(); } catch (e) {}
    try { audio.removeAttribute("src"); audio.removeAttribute("data-mid"); } catch (e) {}
    try { audio.load(); } catch (e) {}
    syncTransport(); syncHubButton(); syncMini(); syncMediaSession();
    tick();
  }
  function seekTo(sec) {
    if (!audio || !audio.src) return;
    try {
      var d = isFinite(audio.duration) ? audio.duration : 0;
      audio.currentTime = Math.max(0, d ? Math.min(d, sec) : sec);
    } catch (e) {}
    tick();
  }
  function seekBy(d) { if (audio) seekTo((audio.currentTime || 0) + d); }
  function advance(dir, opts) {
    opts = opts || {};
    var vis = visibleItems();
    if (!vis.length) return;
    var ix = -1;
    for (var i = 0; i < vis.length; i++) { if (vis[i].id === state.currentId) { ix = i; break; } }
    var nxt = null;
    if (dir > 0 && state.shuffle && vis.length > 1) {
      var pool = vis.filter(function (x) { return x.id !== state.currentId; });
      nxt = pool[Math.floor(Math.random() * pool.length)];
    } else {
      var jx = ix < 0 ? 0 : ix + dir;
      if (jx < 0) jx = vis.length - 1;
      if (jx >= vis.length) {
        if (opts.auto && state.repeat === "off") { stop(); return; }
        jx = 0;
      }
      nxt = vis[jx];
    }
    if (nxt) playId(nxt.id);
  }
  function next() { advance(1, {}); }
  function prev() {
    if (audio && audio.src && (audio.currentTime || 0) > 3) { seekTo(0); return; }
    advance(-1, {});
  }
  function cycleRepeat() {
    state.repeat = state.repeat === "off" ? "all" : (state.repeat === "all" ? "one" : "off");
    save();
    syncTransport();
  }
  function toggleShuffle() { state.shuffle = !state.shuffle; save(); syncTransport(); }
  function setVolume(v) {
    v = Math.max(0, Math.min(1, Number(v)));
    if (!isFinite(v)) return;
    state.volume = v;
    if (v > 0) state.muted = false;
    applyAudioState();
    save();
    syncTransport();
  }
  function toggleMute() {
    state.muted = !state.muted;
    applyAudioState();
    save();
    syncTransport();
  }
  function setRate(r) {
    r = Number(r);
    if (RATES.indexOf(r) === -1) return;
    state.rate = r;
    applyAudioState();
    save();
    syncTransport();
  }

  /* ------------------------------------------------------- now-playing sync */
  function tick() {
    var cur = $("mp-cur"), tot = $("mp-tot"), seek = $("mp-seek");
    if (!audio || !audio.src) {
      if (cur) cur.textContent = "0:00";
      if (seek && document.activeElement !== seek) { try { seek.value = "0"; } catch (e) {} }
      return;
    }
    var t = audio.currentTime || 0, d = isFinite(audio.duration) ? audio.duration : 0;
    if (cur) cur.textContent = fmtTime(t);
    if (tot) tot.textContent = fmtTime(d);
    if (seek && document.activeElement !== seek && d > 0) {
      try { seek.value = String(Math.round((t / d) * 1000)); } catch (e) {}
    }
  }
  function syncMediaSession() {
    try {
      if (!("mediaSession" in navigator)) return;
      var it = currentItem();
      navigator.mediaSession.metadata = it ? new window.MediaMetadata({
        title: it.customTitle || it.title || "Unknown track",
        artist: it.artist || "",
        album: it.album || "",
        artwork: it.art ? [{ src: it.art }] : []
      }) : null;
      try { navigator.mediaSession.playbackState = isPlaying() ? "playing" : "paused"; } catch (e) {}
    } catch (e) {}
  }
  function installMediaSession() {
    try {
      if (!("mediaSession" in navigator) || !navigator.mediaSession.setActionHandler) return;
      var ms = navigator.mediaSession;
      var set = function (action, fn) { try { ms.setActionHandler(action, fn); } catch (e) {} };
      set("play", function () { toggle(); });
      set("pause", function () { toggle(); });
      set("stop", function () { stop(); });
      set("previoustrack", function () { prev(); });
      set("nexttrack", function () { next(); });
      set("seekbackward", function (d) { seekBy(-((d && d.seekOffset) || 10)); });
      set("seekforward", function (d) { seekBy(((d && d.seekOffset) || 10)); });
      set("seekto", function (d) { if (d && isFinite(d.seekTime)) seekTo(d.seekTime); });
    } catch (e) {}
  }

  /* ---------------------------------------------------------------- playlist */
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
      if (!AUDIO_RE.test(url)) {
        if (!opts.quietSkips) toast("Skipped (not a direct audio link): " + url.slice(0, 80));
        return;
      }
      if (seen[url]) {
        if (!opts.quietDuplicates) {
          var dup = null;
          for (var i = 0; i < state.items.length; i++) { if (state.items[i].url === url) { dup = state.items[i]; break; } }
          toast("Already in the playlist: " + (dup ? dup.title : url.slice(0, 60)));
        }
        return;
      }
      seen[url] = true;
      if (state.items.length >= MAX_ITEMS) { toast("Playlist is full (" + MAX_ITEMS + ")."); return; }
      var startTitle = entry.title ? cleanText(entry.title) : "";
      added.push({
        id: uid(), url: url,
        title: startTitle || prettyName(fileNameOf(url)),
        artist: "", album: "", duration: null,
        customTitle: startTitle ? startTitle : "",
        tagged: false, noTitle: false, status: "loading",
        addedBy: entry.addedBy || "", addedAt: Date.now(),
        art: null
      });
    });
    if (added.length) {
      state.items = state.items.concat(added);
      if (!state.currentId) state.currentId = added[0].id;
      save();
      paint();
      added.forEach(function (it) { probeDuration(it); queueProbe(it, false); });
    }
    return added.length;
  }
  function addLinksFromText(text) {
    text = String(text || "");
    var labels = {}, mm;
    var mdRe = /\[([^\]\n]{1,160})\]\(\s*(https?:\/\/[^\s)]+)\s*\)/g;
    while ((mm = mdRe.exec(text))) { var lurl = normalizeUrl(mm[2]); if (lurl) labels[lurl] = cleanText(mm[1]); }
    var urls = text.match(/https?:\/\/[^\s<>"'\)\]\}]+/g) || [];
    urls = urls.map(normalizeUrl).filter(Boolean);
    if (!urls.length) { toast("No links found in that text."); return 0; }
    var entries = urls.map(function (u) { return { url: u, title: labels[u] || "" }; });
    var n = add(entries, { quietDuplicates: urls.length > 1, quietSkips: urls.length > 1 });
    if (n) toast("Added " + n + (n === 1 ? " song." : " songs."));
    return n;
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
        var looksAudio = /^audio\//i.test(f.type || "") || AUDIO_RE.test(f.name || "") || /^video\//i.test(f.type || "");
        if (!looksAudio) { toast("\u201C" + f.name + "\u201D doesn't look like an audio file — skipped."); return null; }
        toast("Uploading \u201C" + f.name + "\u201D" + (files.length > 1 ? " (" + (i + 1) + "/" + files.length + ")" : "") + "…");
        return up(f).then(function (res) {
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
    inp.accept = "audio/*,video/*,.mp3,.m4a,.ogg,.opus,.wav,.flac,.webm";
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
  function renameItem(it) {
    if (!it) return;
    var v = null;
    try { v = window.prompt("Rename song:", it.customTitle || it.title); } catch (e) { return; }
    if (v === null) return;
    v = String(v).replace(/\s+/g, " ").trim().slice(0, 160);
    if (!v) return;
    it.customTitle = v;
    it.title = v;
    it.noTitle = false;
    save();
    paint();
    syncMediaSession();
  }
  function removeItem(it) {
    if (!it) return;
    state.items = state.items.filter(function (x) { return x.id !== it.id; });
    if (state.currentId === it.id) {
      if (audio) { try { audio.pause(); } catch (e) {} }
      state.currentId = state.items.length ? state.items[0].id : null;
      if (audio) { try { audio.removeAttribute("src"); audio.removeAttribute("data-mid"); } catch (e) {} }
    }
    try { delete gotDur[it.url]; delete gotTags[it.url]; } catch (e) {}
    save();
    paint();
    syncHubButton(); syncMini(); syncMediaSession();
  }
  function moveItem(it, dir) {
    var ix = -1;
    for (var i = 0; i < state.items.length; i++) { if (state.items[i].id === it.id) { ix = i; break; } }
    var jx = ix + dir;
    if (ix < 0 || jx < 0 || jx >= state.items.length) return;
    var tmp = state.items[ix]; state.items[ix] = state.items[jx]; state.items[jx] = tmp;
    save();
    paint();
  }
  async function clearAll() {
    if (!state.items.length) return;
    if (!(await window.uiConfirm("Remove all " + state.items.length + " songs?", { okText: 'Remove all', danger: true }))) return;
    stop();
    state.items = [];
    state.currentId = null;
    save();
    paint();
  }
  function exportPlaylist() {
    if (!state.items.length) { toast("The playlist is empty — add a link first."); return; }
    try {
      var blob = new Blob([JSON.stringify({ type: "perchance-music-playlist", v: 1, items: state.items.map(function (it) { var s = serializable(it); return { url: s.url, title: s.customTitle || it.title, artist: it.artist }; }) }, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "playlist.json";
      document.body.appendChild(a); a.click();
      setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (e) {} if (a.parentNode) a.parentNode.removeChild(a); }, 4000);
    } catch (e) { toast("Export failed."); }
  }
  function importPlaylist() {
    var inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".json,.m3u,.m3u8,.txt";
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
        var handled = false;
        try {
          var j = JSON.parse(text);
          var arr = Array.isArray(j) ? j : (j.items || j.tracks || []);
          if (Array.isArray(arr) && arr.length) {
            handled = true;
            if (arr[0] && typeof arr[0] === "object") {
              n = add(arr.map(function (x) { return { url: x.url, title: x.title || "", }; }), { quietDuplicates: true, quietSkips: true });
            } else {
              n = add(arr, { quietDuplicates: true, quietSkips: true });
            }
          }
        } catch (e) { /* fall through to plain link list */ }
        if (!handled) n = addLinksFromText(text);
        else if (n) toast("Imported " + n + (n === 1 ? " song." : " songs."));
        paint();
      };
      rd.readAsText(f);
    });
    inp.addEventListener("cancel", function () { inp.remove(); });
    inp.click();
  }

  /* ------------------------------------------------ ID3 tags (title/art/…) */
  function parseId3(bytes) {
    try {
      if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null; /* "ID3" */
      var ver = bytes[3];
      if (ver < 2 || ver > 4) return null;
      var flags = bytes[5];
      var size = synch(bytes, 6);
      var pos = 10;
      if (flags & 0x40) pos += (ver >= 4 ? synch(bytes, pos) : be32(bytes, pos) + 4);
      var end = Math.min(bytes.length, 10 + size);
      var out = { title: null, artist: null, album: null, picture: null };
      while (pos + 10 <= end) {
        var id = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
        if (!/^[A-Z0-9]{4}$/.test(id)) break;
        var fsize = ver >= 4 ? synch(bytes, pos + 4) : be32(bytes, pos + 4);
        var start = pos + 10;
        if (fsize <= 0 || start + fsize > end) break;
        var d = bytes.subarray(start, start + fsize);
        if (id === "TIT2" || id === "TT2") out.title = out.title || frameText(d);
        else if (id === "TPE1" || id === "TP1") out.artist = out.artist || frameText(d);
        else if (id === "TALB" || id === "TAL") out.album = out.album || frameText(d);
        else if ((id === "APIC" || id === "PIC") && !out.picture) out.picture = framePicture(d, id === "PIC");
        pos = start + fsize;
      }
      /* NB: an ID3 header with no title/artist/album/art still returns *null* — otherwise a
         truthy-but-empty result would block parseHeadTags() from trying the other containers
         (an MP4/FLAC file can carry an ID3 tag that only holds muxer metadata). */
      return hasTags(out) ? out : null;
    } catch (e) { return null; }
  }
  function synch(b, o) { return ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f); }
  function be32(b, o) { return (((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0); }
  function le32(b, o) { return ((b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0); }
  function u24be(b, o) { return ((b[o] << 16) | (b[o + 1] << 8) | b[o + 2]); }
  function utf8(b) { try { return new TextDecoder("utf-8").decode(b); } catch (e) { return ""; } }
  function latin1(b) { try { return new TextDecoder("iso-8859-1").decode(b); } catch (e) { return ""; } }
  function cleanText(s) {
    s = String(s == null ? "" : s).replace(/\u0000+/g, " ").replace(/\s+/g, " ").trim();
    return s || null;
  }
  function emptyTags() { return { title: null, artist: null, album: null, picture: null }; }
  function hasTags(t) { return !!(t && (t.title || t.artist || t.album || t.picture)); }
  /* `a` wins (it's normally the more authoritative container: ID3v2 over ID3v1) */
  function mergeTags(a, b) {
    if (!a) return b;
    if (!b) return a;
    return { title: a.title || b.title, artist: a.artist || b.artist, album: a.album || b.album, picture: a.picture || b.picture };
  }
  /* .m4a/.mp4 keep their tags in the iTunes-style atom tree instead of ID3:
     moov ▸ udta ▸ meta ▸ ilst ▸ (©nam / ©ART / ©alb / covr) ▸ data */
  function fourcc(b, o) { return String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]); }
  function findBox(b, start, end, type) {
    var p = start;
    while (p + 8 <= end) {
      var size = be32(b, p);
      if (size < 8) return null;
      var boxEnd = Math.min(p + size, end);
      if (fourcc(b, p + 4) === type) return { start: p + 8, end: boxEnd };
      p = boxEnd;
    }
    return null;
  }
  function parseMp4(bytes) {
    try {
      var moov = findBox(bytes, 0, bytes.length, "moov");
      if (!moov) return null;
      var udta = findBox(bytes, moov.start, moov.end, "udta");
      var meta = udta ? findBox(bytes, udta.start, udta.end, "meta") : null;
      if (!meta) meta = findBox(bytes, moov.start, moov.end, "meta");
      if (!meta) return null;
      var ilst = findBox(bytes, meta.start + 4, meta.end, "ilst"); /* `meta` is a full box (4 extra bytes) */
      if (!ilst) return null;
      var map = { "\u00A9nam": "title", "\u00A9ART": "artist", "aART": "artist", "\u00A9alb": "album", "covr": "picture" };
      var out = { title: null, artist: null, album: null, picture: null };
      var p = ilst.start;
      while (p + 8 <= ilst.end) {
        var size = be32(bytes, p);
        if (size < 8) break;
        var boxEnd = Math.min(p + size, ilst.end);
        var key = map[fourcc(bytes, p + 4)];
        if (key === "picture") {
          var d = findBox(bytes, p + 8, boxEnd, "data");
          if (d && d.end - d.start > 16) {
            out.picture = { mime: be32(bytes, d.start) === 14 ? "image/png" : "image/jpeg", data: bytes.subarray(d.start + 8, d.end) };
          }
        } else if (key) {
          var dd = findBox(bytes, p + 8, boxEnd, "data");
          if (dd) {
            var txt = new TextDecoder("utf-8").decode(bytes.subarray(dd.start + 8, dd.end)).replace(/\u0000/g, " ").trim();
            if (txt) out[key] = out[key] || txt;
          }
        }
        p = boxEnd;
      }
      return hasTags(out) ? out : null;
    } catch (e) { return null; }
  }
  /* --------------------------------------- tags read from the END of the file */
  /* ID3v1 is a fixed 128-byte block at the very end ("TAG" + title/artist/album/year/
     comment) — invisible to the head fetch above, and very common on files that were
     only ever tagged by a ripper/tagger. Read with a suffix Range (see fetchTail). */
  function parseId3v1(bytes) {
    try {
      var n = bytes.length;
      if (n < 128) return null;
      var o = n - 128;
      if (bytes[o] !== 0x54 || bytes[o + 1] !== 0x41 || bytes[o + 2] !== 0x47) return null; /* "TAG" */
      function fld(a, b) {
        var e = a;
        while (e < b && bytes[e] !== 0) e++;
        return cleanText(latin1(bytes.subarray(a, e)));
      }
      var out = emptyTags();
      out.title = fld(o + 3, o + 33);
      out.artist = fld(o + 33, o + 63);
      out.album = fld(o + 63, o + 93);
      var year = fld(o + 93, o + 97);
      if (year) out.year = year;
      var v11 = bytes[o + 125] === 0 && bytes[o + 126] !== 0;   /* ID3v1.1 steals 2 comment bytes */
      var comment = fld(o + 97, v11 ? o + 125 : o + 127);
      if (comment) out.comment = comment;
      if (v11) out.track = bytes[o + 126];
      return (out.title || out.artist || out.album) ? out : null;
    } catch (e) { return null; }
  }
  /* APEv2 tags also sit at the end of the file ("APETAGEX" footer); Title/Artist/Album
     are plain key/value items, UTF-8. */
  function parseApe(bytes) {
    try {
      var idx = -1, limit = Math.max(0, bytes.length - 4096);
      for (var p = bytes.length - 32; p >= limit; p--) {
        if (bytes[p] === 0x41 && bytes[p + 1] === 0x50 && bytes[p + 2] === 0x45 && bytes[p + 3] === 0x54 &&
            bytes[p + 4] === 0x41 && bytes[p + 5] === 0x47 && bytes[p + 6] === 0x45 && bytes[p + 7] === 0x58) { idx = p; break; }
      }
      if (idx < 0) return null;
      var size = le32(bytes, idx + 12), count = le32(bytes, idx + 16);
      var start = idx - (size - 32);              /* tag size includes the 32-byte footer */
      if (size < 32 || size > bytes.length || start < 0 || count < 1 || count > 256) return null;
      var out = emptyTags(), p2 = start;
      for (var k = 0; k < count && p2 + 8 <= idx; k++) {
        var vsize = le32(bytes, p2); p2 += 8;
        var k0 = p2;
        while (p2 < idx && bytes[p2] !== 0) p2++;
        var key = latin1(bytes.subarray(k0, p2)).toLowerCase();
        p2++;
        var vstart = p2; p2 += vsize;
        if (p2 > idx) break;
        var val = cleanText(utf8(bytes.subarray(vstart, Math.min(p2, vstart + 1024))));
        if (!val) continue;
        if (key === "title") out.title = out.title || val;
        else if (key === "artist") out.artist = out.artist || val;
        else if (key === "album") out.album = out.album || val;
      }
      return (out.title || out.artist || out.album) ? out : null;
    } catch (e) { return null; }
  }
  /* Vorbis comments — shared by FLAC / Ogg Vorbis / Opus: little-endian lengths, a
     vendor string, then "KEY=value" entries. */
  function readVorbisComments(bytes, pos, end, out) {
    try {
      if (pos + 4 > end) return out;
      pos += 4 + le32(bytes, pos);                /* vendor string */
      if (pos + 4 > end) return out;
      var count = le32(bytes, pos); pos += 4;
      for (var i = 0; i < count && i < 512 && pos + 4 <= end; i++) {
        var len = le32(bytes, pos); pos += 4;
        if (len > 65535 || pos + len > end) break;
        var s = utf8(bytes.subarray(pos, pos + len)); pos += len;
        var eq = s.indexOf("=");
        if (eq < 1) continue;
        var key = s.slice(0, eq).toUpperCase(), val = cleanText(s.slice(eq + 1));
        if (!val) continue;
        if (key === "TITLE") out.title = out.title || val;
        else if (key === "ARTIST") out.artist = out.artist || val;
        else if (key === "ALBUM") out.album = out.album || val;
      }
    } catch (e) {}
    return out;
  }
  function readFlacPicture(bytes, p, end) {
    try {
      if (p + 8 > end) return null;
      var mimeLen = be32(bytes, p + 4); p += 8;
      var mime = latin1(bytes.subarray(p, p + mimeLen)); p += mimeLen;
      if (p + 4 > end) return null;
      p += 4 + be32(bytes, p);                    /* description */
      if (p + 20 > end) return null;
      p += 16;                                    /* width/height/depth/colours */
      var dataLen = be32(bytes, p); p += 4;
      if (dataLen < 64 || p + dataLen > end) return null;
      return { mime: /^image\//i.test(mime) ? mime : "image/jpeg", data: bytes.subarray(p, p + dataLen) };
    } catch (e) { return null; }
  }
  function parseFlac(bytes) {
    try {
      if (bytes.length < 8 || bytes[0] !== 0x66 || bytes[1] !== 0x4C || bytes[2] !== 0x61 || bytes[3] !== 0x43) return null; /* "fLaC" */
      var out = emptyTags(), p = 4;
      while (p + 4 <= bytes.length) {
        var hdr = bytes[p], last = !!(hdr & 0x80), type = hdr & 0x7F;
        var len = u24be(bytes, p + 1), body = p + 4, bodyEnd = Math.min(bytes.length, body + len);
        if (type === 4) readVorbisComments(bytes, body, bodyEnd, out);
        else if (type === 6 && !out.picture) out.picture = readFlacPicture(bytes, body, bodyEnd);
        p = bodyEnd;
        if (last) break;
      }
      return hasTags(out) ? out : null;
    } catch (e) { return null; }
  }
  function parseOgg(bytes) {
    try {
      if (bytes.length < 8 || bytes[0] !== 0x4F || bytes[1] !== 0x67 || bytes[2] !== 0x67 || bytes[3] !== 0x53) return null; /* "OggS" */
      var out = emptyTags(), p = -1;
      for (var i = 4; i + 8 <= bytes.length; i++) {
        if (bytes[i] === 3 && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x6F && bytes[i + 3] === 0x72 && bytes[i + 4] === 0x62 && bytes[i + 5] === 0x69 && bytes[i + 6] === 0x73) { p = i + 7; break; }
        if (bytes[i] === 0x4F && bytes[i + 1] === 0x70 && bytes[i + 2] === 0x75 && bytes[i + 3] === 0x73 && bytes[i + 4] === 0x54 && bytes[i + 5] === 0x61 && bytes[i + 6] === 0x67 && bytes[i + 7] === 0x73) { p = i + 8; break; }
      }
      if (p < 0) return null;
      readVorbisComments(bytes, p, bytes.length, out);
      return hasTags(out) ? out : null;
    } catch (e) { return null; }
  }
  /* Matroska (.mkv/.mka) and WebM are EBML: the title lives in Segment ▸ Info ▸ Title,
     while ARTIST/ALBUM arrive as Segment ▸ Tags ▸ Tag ▸ SimpleTag(TagName/TagString)
     pairs. Only the small metadata containers are descended into (never a Cluster). */
  var MKV_DESCEND = { "18538067": 1, "1549a966": 1, "1254c367": 1, "7373": 1, "67c8": 1 };
  function parseMatroska(bytes) {
    try {
      if (bytes.length < 8 || bytes[0] !== 0x1A || bytes[1] !== 0x45 || bytes[2] !== 0xDF || bytes[3] !== 0xA3) return null;
      var out = emptyTags(), pos = 0, lastName = "";
      function vint() {
        if (pos >= bytes.length) return null;
        var first = bytes[pos];
        if (!first) return null;
        var len = 1, mask = 0x80;
        while (len <= 8 && !(first & mask)) { mask >>= 1; len++; }
        if (len > 8) return null;
        var val = first & (mask - 1);
        for (var i = 1; i < len; i++) val = val * 256 + bytes[pos + i];
        pos += len;
        return { val: val, unknown: val === Math.pow(2, 7 * len) - 1 };
      }
      function walk(end, depth) {
        while (pos < end && depth < 10) {
          var idStart = pos, idObj = vint();
          if (!idObj) return;
          var id = "";
          for (var i = idStart; i < pos; i++) id += bytes[i].toString(16);
          var sz = vint();
          if (!sz) return;
          var dataStart = pos, dataEnd = sz.unknown ? end : Math.min(end, dataStart + sz.val);
          if (id === "7ba9") {
            var t = cleanText(utf8(bytes.subarray(dataStart, dataEnd)));
            if (t) out.title = out.title || t;
          } else if (id === "45a3") {
            lastName = String(cleanText(utf8(bytes.subarray(dataStart, dataEnd))) || "").toUpperCase();
          } else if (id === "4487") {
            var v = cleanText(utf8(bytes.subarray(dataStart, Math.min(dataEnd, dataStart + 1024))));
            if (v && lastName === "TITLE") out.title = out.title || v;
            else if (v && lastName === "ARTIST") out.artist = out.artist || v;
            else if (v && lastName === "ALBUM") out.album = out.album || v;
          } else if (MKV_DESCEND[id]) {
            walk(dataEnd, depth + 1);
          }
          pos = dataEnd;
        }
      }
      walk(bytes.length, 0);
      return hasTags(out) ? out : null;
    } catch (e) { return null; }
  }
  /* RIFF/WAVE: a "LIST" ▸ "INFO" chunk carries INAM (title) / IART (artist) / IPRD (album). */
  function parseRiff(bytes) {
    try {
      if (bytes.length < 12 || fourcc(bytes, 0) !== "RIFF" || fourcc(bytes, 8) !== "WAVE") return null;
      var out = emptyTags(), p = 12;
      while (p + 8 <= bytes.length) {
        var id = fourcc(bytes, p), size = le32(bytes, p + 4), body = p + 8, bodyEnd = Math.min(bytes.length, body + size);
        if (id === "LIST" && fourcc(bytes, body) === "INFO") {
          var q = body + 4;
          while (q + 8 <= bodyEnd) {
            var sid = fourcc(bytes, q), ssize = le32(bytes, q + 4);
            var s = cleanText(latin1(bytes.subarray(q + 8, Math.min(bodyEnd, q + 8 + ssize))));
            if (s) {
              if (sid === "INAM") out.title = out.title || s;
              else if (sid === "IART") out.artist = out.artist || s;
              else if (sid === "IPRD") out.album = out.album || s;
            }
            q += 8 + ssize + (ssize & 1);
          }
        } else if (id === "id3 " || id === "ID3 ") {
          out = mergeTags(out, parseId3(bytes.subarray(body, bodyEnd)));
        }
        p = bodyEnd + (size & 1);
      }
      return hasTags(out) ? out : null;
    } catch (e) { return null; }
  }
  /* every container we know how to read the head of, tried in order */
  function parseHeadTags(bytes) {
    return parseId3(bytes) || parseFlac(bytes) || parseOgg(bytes) || parseMp4(bytes) || parseMatroska(bytes) || parseRiff(bytes);
  }
  function parseTailTags(bytes) {
    return parseId3v1(bytes) || parseApe(bytes);
  }
  function frameText(d) {
    if (!d || d.length < 2) return null;
    var enc = d[0], body = d.subarray(1), txt;
    try {
      if (enc === 0) txt = new TextDecoder("iso-8859-1").decode(body);
      else if (enc === 1) txt = new TextDecoder("utf-16").decode(body);
      else if (enc === 2) txt = new TextDecoder("utf-16be").decode(body);
      else txt = new TextDecoder("utf-8").decode(body);
    } catch (e) { return null; }
    txt = txt.replace(/\u0000/g, " ").replace(/\s+/g, " ").trim();
    return txt || null;
  }
  function framePicture(d, v2) {
    try {
      var i = 1, mime = "image/jpeg";
      if (!v2) {
        var j = i;
        while (j < d.length && d[j] !== 0) j++;
        mime = new TextDecoder("iso-8859-1").decode(d.subarray(i, j)) || mime;
        i = j + 1;
      } else {
        mime = { JPG: "image/jpeg", PNG: "image/png" }[String.fromCharCode(d[1], d[2], d[3])] || mime;
        i = 4;
      }
      i++; /* picture type byte */
      var k = i;
      while (k < d.length && d[k] !== 0) k++;
      i = k + 1;
      var img = d.subarray(i);
      if (img.length < 64) return null;
      return { mime: /^image\//i.test(mime) ? mime : "image/jpeg", data: img };
    } catch (e) { return null; }
  }
  /* Vendored tag readers above (ID3v2/v1, APEv2, FLAC/Ogg, MP4, Matroska, RIFF);
     adapted from bigger-and-better-ai-chat's src/musicplayer.js — see Credits. */

  /* ------------------------------------------------ read bytes, not files */
  var gotDur = {}, gotTags = {};
  var probeQueue = [], probeRunning = 0, MAX_PARALLEL_PROBES = 3;
  function fetchHead(url, max) {
    var ctrl = ("AbortController" in window) ? new AbortController() : null;
    return fetch(url, { signal: ctrl ? ctrl.signal : undefined, mode: "cors", credentials: "omit", cache: "force-cache" }).then(function (res) {
      if (!res.ok || !res.body) throw new Error("HTTP " + res.status);
      var size = Number(res.headers.get("content-length"));
      var reader = res.body.getReader();
      var chunks = [], total = 0;
      function pump() {
        if (total >= max) return { chunks: chunks, total: total };
        return reader.read().then(function (r) {
          if (r.done) return { chunks: chunks, total: total };
          chunks.push(r.value);
          total += r.value.length;
          return pump();
        });
      }
      return pump().then(function (out) {
        try { if (reader.cancel) reader.cancel(); } catch (e) {}
        try { if (ctrl) ctrl.abort(); } catch (e) {}
        var buf = new Uint8Array(out.total), off = 0;
        for (var i = 0; i < out.chunks.length; i++) { buf.set(out.chunks[i], off); off += out.chunks[i].length; }
        return { bytes: buf, size: (size > 0 && isFinite(size)) ? size : null };
      });
    });
  }
  function fetchTail(url, max, size) {
    if (!(typeof size === "number") || !(size > 0)) return Promise.resolve(null);
    var start = Math.max(0, size - max);
    return fetch(url, { mode: "cors", credentials: "omit", cache: "force-cache", headers: { Range: "bytes=" + start + "-" } }).then(function (res) {
      if (!res.ok || !res.body) throw new Error("HTTP " + res.status);
      var reader = res.body.getReader(), chunks = [], total = 0, overflow = false;
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) return { chunks: chunks, total: total, overflow: overflow };
          chunks.push(r.value);
          total += r.value.length;
          if (total > max) { overflow = true; return { chunks: chunks, total: total, overflow: overflow }; }
          return pump();
        });
      }
      return pump().then(function (out) {
        try { if (reader.cancel) reader.cancel(); } catch (e) {}
        if (out.overflow) throw new Error("no byte-range support");
        var buf = new Uint8Array(out.total), off = 0;
        for (var i = 0; i < out.chunks.length; i++) { buf.set(out.chunks[i], off); off += out.chunks[i].length; }
        return buf;
      });
    });
  }
  function probeDuration(it) {
    if (!it || gotDur[it.url]) return;
    gotDur[it.url] = true;
    var a = new Audio();
    a.preload = "metadata";
    var done = false;
    function finish(d) {
      if (done) return;
      done = true;
      try { a.removeAttribute("src"); } catch (e) {}
      if (d && isFinite(d)) { it.duration = d; if (it.status !== "ok") it.status = "ok"; }
      else if (it.status === "loading") it.status = "error";
      save();
      paint();
    }
    a.addEventListener("loadedmetadata", function () { finish(isFinite(a.duration) && a.duration > 0 ? a.duration : 0); });
    a.addEventListener("error", function () { finish(0); });
    setTimeout(function () { finish(0); }, 25000);
    a.src = it.url;
  }
  function probeTags(it, force) {
    if (!it || !it.url) return Promise.resolve();
    if (gotTags[it.url] && !force) return Promise.resolve();
    gotTags[it.url] = true;
    var head = null, headOk = false, tail = null, tailOk = false;
    return fetchHead(it.url, TAG_BYTES).then(function (h) {
      head = h; headOk = true;
      if (head && head.size) {
        return fetchTail(it.url, TAIL_BYTES, head.size).then(function (t) {
          tail = t; tailOk = !!tail && tail.length > 0;
        }).catch(function () {});
      }
    }).catch(function () {}).then(function () {
      var tags = mergeTags(head ? parseHeadTags(head.bytes) : null, tail ? parseTailTags(tail) : null);
      if (headOk || tailOk) it.tagged = true;
      if (!it.customTitle) it.noTitle = !(tags && tags.title);
      if (!hasTags(tags)) { if (headOk || tailOk) save(); paint(); return; }
      if (tags.title && !it.customTitle) it.title = tags.title;
      if (tags.artist) it.artist = tags.artist;
      if (tags.album) it.album = tags.album;
      if (tags.picture && tags.picture.data && !it.art) {
        try { it.art = URL.createObjectURL(new Blob([tags.picture.data], { type: tags.picture.mime || "image/jpeg" })); } catch (e) {}
      }
      save();
      paint();
      syncMediaSession();
    });
  }
  function runProbe(job) {
    probeRunning++;
    Promise.resolve(probeTags(job.it, job.force))
      .catch(function (e) { try { console.warn("[music] tag probe failed", e); } catch (e2) {} })
      .then(function () { probeRunning--; pumpProbes(); });
  }
  function pumpProbes() {
    while (probeRunning < MAX_PARALLEL_PROBES && probeQueue.length) runProbe(probeQueue.shift());
  }
  function queueProbe(it, force) {
    if (!it || !it.url) return;
    for (var i = 0; i < probeQueue.length; i++) if (probeQueue[i].it === it) return;
    probeQueue.push({ it: it, force: !!force });
    pumpProbes();
  }
  function reprobeAll() {
    var n = state.items.length;
    if (!n) { toast("The playlist is empty — add a link first."); return; }
    gotTags = {};
    state.items.forEach(function (it) { queueProbe(it, true); });
    toast("Re-reading titles for " + n + (n === 1 ? " song…" : " songs…"));
  }

  /* ------------------------------------------------------------ hub button */
  function syncHubButton() {
    var b = $("mp-hub-btn");
    if (!b) return;
    var playing = isPlaying();
    b.classList.toggle("i2p-hub-on", playing || !!currentItem());
    var ico = b.querySelector(".i2p-hubico");
    if (ico) ico.textContent = playing ? "⏸️" : "🎵";
    var it = currentItem();
    b.title = it ? ("Music — " + (playing ? "playing: " : "paused: ") + (it.customTitle || it.title)) : "Music — playlist from links";
  }
  function ensureHubButton() {
    if ($("mp-hub-btn")) { syncHubButton(); return; }
    var hub = $("i2p-hubbar");
    if (!hub) return;
    var b = document.createElement("button");
    b.id = "mp-hub-btn";
    b.type = "button";
    b.className = "i2p-hubbtn";
    var ico = document.createElement("span");
    ico.className = "i2p-hubico";
    ico.textContent = "🎵";
    var lbl = document.createElement("span");
    lbl.className = "i2p-hublbl";
    lbl.textContent = "Music";
    b.appendChild(ico);
    b.appendChild(lbl);
    b.addEventListener("click", function (e) { e.stopPropagation(); open(); });
    var bg = $("bg-hub-btn");
    if (bg && bg.nextSibling) hub.insertBefore(b, bg.nextSibling);
    else if (bg) hub.appendChild(b);
    else {
      var fs = $("i2p-fs-btn");
      if (fs && fs.nextSibling) hub.insertBefore(b, fs.nextSibling);
      else hub.appendChild(b);
    }
    syncHubButton();
  }

  /* ------------------------------------------------------------------ panel */
  function css() {
    if ($("mpCss")) return;
    var s = document.createElement("style");
    s.id = "mpCss";
    s.textContent =
      "#mpOverlay{position:fixed;inset:0;z-index:94000;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(0,0,0,0.62);}" +
      "#mpOverlay[hidden]{display:none;}" +
      "#mpOverlay.mp-dragover .mp-panel{outline:2px dashed var(--th-accent);outline-offset:-2px;}" +
      ".mp-panel{width:min(720px,94vw);max-height:88vh;max-height:88dvh;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;box-sizing:border-box;background:var(--th-modal,var(--th-surface));border:1px solid var(--th-border);border-radius:16px;box-shadow:0 18px 50px -12px rgba(0,0,0,0.7);padding:0.9rem 1rem 1.1rem;text-align:left;font-family:inherit;color:inherit;display:flex;flex-direction:column;}" +
      ".mp-head{display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;}" +
      ".mp-head b{font-size:1.05rem;}" +
      ".mp-head span{font-size:0.72rem;opacity:0.6;flex:1;}" +
      ".mp-x{cursor:pointer;background:transparent;color:inherit;border:1px solid var(--th-border);border-radius:6px;font:inherit;padding:0.1rem 0.5rem;}" +
      ".mp-card{background:var(--th-surface);border:1px solid var(--th-border);border-radius:12px;padding:0.7rem 0.8rem;margin-top:0.6rem;}" +
      ".mp-now{display:flex;gap:0.7rem;align-items:center;}" +
      ".mp-art{width:56px;height:56px;flex-shrink:0;border-radius:10px;overflow:hidden;background:var(--th-accent-soft);display:flex;align-items:center;justify-content:center;font-size:1.6rem;}" +
      ".mp-art img{width:100%;height:100%;object-fit:cover;display:block;}" +
      ".mp-npmeta{flex:1;min-width:0;}" +
      ".mp-nptitle{font-size:0.92rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      ".mp-npsub{font-size:0.72rem;opacity:0.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      ".mp-times{display:flex;align-items:center;gap:0.5rem;font-size:0.72rem;font-variant-numeric:tabular-nums;opacity:0.85;margin-top:0.5rem;}" +
      ".mp-seek{flex:1;accent-color:var(--th-accent,#a855f7);}" +
      ".mp-transport{display:flex;align-items:center;gap:0.35rem;flex-wrap:wrap;margin-top:0.5rem;}" +
      ".mp-tbtn{cursor:pointer;font:inherit;font-size:0.95rem;color:inherit;background:transparent;border:1px solid var(--th-border);border-radius:10px;padding:0.3rem 0.55rem;line-height:1.2;}" +
      ".mp-tbtn:hover{border-color:var(--th-accent);background:var(--th-accent-soft);}" +
      ".mp-tbtn.on{border-color:var(--th-accent);background:var(--th-accent-soft);font-weight:800;}" +
      ".mp-vol{width:90px;accent-color:var(--th-accent,#a855f7);}" +
      ".mp-rate{font:inherit;font-size:0.75rem;color:inherit;background:var(--th-field,var(--th-surface));border:1px solid var(--th-border);border-radius:8px;padding:0.25rem 0.35rem;}" +
      ".mp-row{display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;}" +
      ".mp-note{font-size:0.75rem;opacity:0.65;line-height:1.45;margin-top:0.45rem;}" +
      ".mp-btn{cursor:pointer;font:inherit;font-size:0.8rem;font-weight:600;color:inherit;background:var(--th-surface);border:1px solid var(--th-border);border-radius:999px;padding:0.35rem 0.8rem;white-space:nowrap;}" +
      ".mp-btn:hover{border-color:var(--th-accent);background:var(--th-accent-soft);}" +
      ".mp-links{width:100%;box-sizing:border-box;min-height:56px;resize:vertical;font:inherit;font-size:0.82rem;color:inherit;background:var(--th-field,var(--th-surface));border:1px solid var(--th-border);border-radius:9px;padding:0.5rem 0.6rem;}" +
      ".mp-listhead{display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;}" +
      ".mp-listhead b{font-size:0.9rem;}" +
      ".mp-filter{font:inherit;font-size:0.8rem;color:inherit;background:var(--th-field,var(--th-surface));border:1px solid var(--th-border);border-radius:9px;padding:0.35rem 0.55rem;width:120px;}" +
      ".mp-sort{font:inherit;font-size:0.78rem;color:inherit;background:var(--th-field,var(--th-surface));border:1px solid var(--th-border);border-radius:9px;padding:0.35rem 0.45rem;margin-left:auto;}" +
      ".mp-list{margin-top:0.5rem;display:flex;flex-direction:column;gap:0.35rem;overflow-y:auto;flex:1 1 auto;min-height:140px;max-height:min(44vh,400px);max-height:min(44dvh,400px);overscroll-behavior:contain;-webkit-overflow-scrolling:touch;}" +
      ".mp-item{display:flex;align-items:center;gap:0.55rem;background:var(--th-bg,rgba(0,0,0,0.12));border:1px solid var(--th-border);border-radius:10px;padding:0.35rem 0.45rem;}" +
      ".mp-item.current{border-color:var(--th-accent);}" +
      ".mp-num{width:1.6em;flex-shrink:0;text-align:center;font-size:0.78rem;opacity:0.65;font-variant-numeric:tabular-nums;}" +
      ".mp-item.current .mp-num{opacity:1;}" +
      ".mp-thumb{width:36px;height:36px;flex-shrink:0;border-radius:8px;overflow:hidden;background:var(--th-accent-soft);display:flex;align-items:center;justify-content:center;font-size:1.1rem;}" +
      ".mp-thumb img{width:100%;height:100%;object-fit:cover;display:block;}" +
      ".mp-meta{flex:1;min-width:0;}" +
      ".mp-title{font-size:0.82rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      ".mp-sub{font-size:0.7rem;opacity:0.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      ".mp-dur{font-size:0.72rem;opacity:0.65;font-variant-numeric:tabular-nums;flex-shrink:0;}" +
      ".mp-acts{display:flex;gap:0.25rem;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;}" +
      ".mp-act{cursor:pointer;font:inherit;font-size:0.72rem;color:inherit;background:transparent;border:1px solid var(--th-border);border-radius:8px;padding:0.2rem 0.45rem;}" +
      ".mp-act:hover{border-color:var(--th-accent);background:var(--th-accent-soft);}" +
      ".mp-empty{font-size:0.82rem;opacity:0.65;padding:0.6rem 0.2rem;}" +
      ".mp-notitle{font-size:0.62rem;opacity:0.55;border:1px solid var(--th-border);border-radius:6px;padding:0 4px;margin-left:0.3rem;}" +
      "#mpMini{position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:93000;display:flex;align-items:center;gap:0.4rem;max-width:min(92vw,560px);background:var(--th-modal,var(--th-surface));border:1px solid var(--th-accent);border-radius:999px;padding:0.35rem 0.5rem 0.35rem 0.35rem;font-size:0.78rem;box-shadow:0 12px 34px -12px rgba(0,0,0,0.7);}" +
      "#mpMini[hidden]{display:none;}" +
      "#mpMini .mp-tbtn{border-radius:999px;}" +
      "#mpMiniTitle{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:700;cursor:pointer;}" +
      "@media (max-width:720px){#mpMini{bottom:76px;}}" +
      "#mp-hub-btn.i2p-hub-on{border-color:var(--th-accent);background:var(--th-accent-soft);}";
    document.head.appendChild(s);
  }
  function overlay() { return $("mpOverlay"); }
  function tbtn(label, title, fn, id) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "mp-tbtn";
    if (id) b.id = id;
    b.textContent = label;
    b.title = title;
    b.addEventListener("click", function (e) { e.stopPropagation(); fn(); });
    return b;
  }
  function mbtn(label, title, fn) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "mp-btn";
    b.textContent = label;
    b.title = title;
    b.addEventListener("click", fn);
    return b;
  }
  function build() {
    if (overlay()) return;
    css();
    var ov = document.createElement("div");
    ov.id = "mpOverlay";
    ov.hidden = true;
    var panel = document.createElement("div");
    panel.className = "mp-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Media player");
    var head = document.createElement("div");
    head.className = "mp-head";
    var title = document.createElement("b");
    title.textContent = "🎵 Media player";
    var sub = document.createElement("span");
    sub.textContent = "playlist from links";
    var x = document.createElement("button");
    x.type = "button";
    x.className = "mp-x";
    x.textContent = "✕";
    x.title = "Close";
    x.addEventListener("click", close);
    head.appendChild(title);
    head.appendChild(sub);
    head.appendChild(x);
    panel.appendChild(head);

    /* now-playing card */
    var now = document.createElement("div");
    now.className = "mp-card";
    var np = document.createElement("div");
    np.className = "mp-now";
    var art = document.createElement("div");
    art.className = "mp-art";
    art.id = "mp-art";
    art.textContent = "🎵";
    var npmeta = document.createElement("div");
    npmeta.className = "mp-npmeta";
    var npt = document.createElement("div");
    npt.className = "mp-nptitle";
    npt.id = "mp-nptitle";
    npt.textContent = "Nothing playing";
    var nps = document.createElement("div");
    nps.className = "mp-npsub";
    nps.id = "mp-npsub";
    nps.textContent = "Add a song below to start.";
    npmeta.appendChild(npt);
    npmeta.appendChild(nps);
    np.appendChild(art);
    np.appendChild(npmeta);
    now.appendChild(np);
    var times = document.createElement("div");
    times.className = "mp-times";
    var cur = document.createElement("span");
    cur.id = "mp-cur";
    cur.textContent = "0:00";
    var seek = document.createElement("input");
    seek.type = "range";
    seek.className = "mp-seek";
    seek.id = "mp-seek";
    seek.min = "0";
    seek.max = "1000";
    seek.value = "0";
    seek.setAttribute("aria-label", "Seek");
    seek.addEventListener("input", function () {
      if (audio && audio.src && isFinite(audio.duration) && audio.duration > 0) {
        seekTo((Number(seek.value) / 1000) * audio.duration);
      }
    });
    var tot = document.createElement("span");
    tot.id = "mp-tot";
    tot.textContent = "—";
    times.appendChild(cur);
    times.appendChild(seek);
    times.appendChild(tot);
    now.appendChild(times);
    var tp = document.createElement("div");
    tp.className = "mp-transport";
    tp.appendChild(tbtn("⏮", "Previous (P)", function () { prev(); }));
    tp.appendChild(tbtn("▶", "Play / pause (space)", function () { toggle(); }, "mp-playbtn"));
    tp.appendChild(tbtn("⏭", "Next (N)", function () { next(); }));
    tp.appendChild(tbtn("⏹", "Stop", function () { stop(); }));
    tp.appendChild(tbtn("🔀", "Shuffle (S)", function () { toggleShuffle(); }, "mp-shufbtn"));
    tp.appendChild(tbtn("🔁", "Repeat (R): off → all → one", function () { cycleRepeat(); }, "mp-repbtn"));
    var rate = document.createElement("select");
    rate.className = "mp-rate";
    rate.id = "mp-rate";
    rate.title = "Playback speed";
    RATES.forEach(function (r) {
      var o = document.createElement("option");
      o.value = String(r);
      o.textContent = (r === 1 ? "1×" : String(r) + "×");
      rate.appendChild(o);
    });
    rate.addEventListener("change", function () { setRate(Number(rate.value)); });
    tp.appendChild(rate);
    tp.appendChild(tbtn("🔊", "Mute (M)", function () { toggleMute(); }, "mp-mutebtn"));
    var vol = document.createElement("input");
    vol.type = "range";
    vol.className = "mp-vol";
    vol.id = "mp-vol";
    vol.min = "0";
    vol.max = "100";
    vol.setAttribute("aria-label", "Volume");
    vol.addEventListener("input", function () { setVolume(Number(vol.value) / 100); });
    tp.appendChild(vol);
    now.appendChild(tp);
    panel.appendChild(now);

    /* post card */
    var post = document.createElement("div");
    post.className = "mp-card";
    var plbl = document.createElement("div");
    plbl.style.cssText = "font-size:0.85rem;font-weight:700;margin-bottom:0.4rem;";
    plbl.textContent = "📌 Post audio links";
    post.appendChild(plbl);
    var ta = document.createElement("textarea");
    ta.className = "mp-links";
    ta.id = "mp-links";
    ta.placeholder = "https://user.uploads.dev/file/abc123.mp3\nhttps://files.catbox.moe/xyz.ogg";
    post.appendChild(ta);
    var btns = document.createElement("div");
    btns.className = "mp-row";
    btns.style.marginTop = "0.45rem";
    btns.appendChild(mbtn("➕ Add links", "Add the pasted links to the playlist", function () {
      addLinksFromText(ta.value);
      ta.value = "";
    }));
    btns.appendChild(mbtn("⬆️ Upload audio", "Upload files from your device", function () { pickAndUpload(); }));
    btns.appendChild(mbtn("⬇️ export", "Download the playlist as JSON", function () { exportPlaylist(); }));
    btns.appendChild(mbtn("⬆️ import", "Load a JSON / M3U / link list", function () { importPlaylist(); }));
    btns.appendChild(mbtn("🏷️ re-read titles", "Re-read every file's tags", function () { reprobeAll(); }));
    btns.appendChild(mbtn("🧹 clear all", "Remove every song", function () { clearAll(); }));
    post.appendChild(btns);
    var hint = document.createElement("div");
    hint.className = "mp-note";
    hint.textContent = "Direct audio links only (.mp3 .ogg .wav .flac …). Each song's real title, artist and cover are read from the file's own tags. Keys while open: space play/pause · ←/→ seek 5s · ↑/↓ volume · N next · P previous · M mute · S shuffle · R repeat.";
    post.appendChild(hint);
    panel.appendChild(post);

    /* list card */
    var list = document.createElement("div");
    list.className = "mp-card";
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.minHeight = "0";
    var lh = document.createElement("div");
    lh.className = "mp-listhead";
    var lb = document.createElement("b");
    lb.id = "mp-count";
    lb.textContent = "0 songs";
    lh.appendChild(lb);
    var filt = document.createElement("input");
    filt.className = "mp-filter";
    filt.id = "mp-filter";
    filt.placeholder = "filter…";
    filt.setAttribute("aria-label", "Filter songs");
    filt.addEventListener("input", function () { state.filter = filt.value; save(); paint(); });
    lh.appendChild(filt);
    var sort = document.createElement("select");
    sort.className = "mp-sort";
    sort.id = "mp-sort";
    sort.title = "Sort order";
    [["order", "playlist order"], ["title", "title A–Z"], ["longest", "longest first"], ["source", "source"]].forEach(function (o) {
      var op = document.createElement("option");
      op.value = o[0];
      op.textContent = o[1];
      sort.appendChild(op);
    });
    sort.addEventListener("change", function () { state.sort = sort.value; save(); paint(); });
    lh.appendChild(sort);
    list.appendChild(lh);
    var lr = document.createElement("div");
    lr.className = "mp-row";
    lr.style.marginTop = "0.45rem";
    lr.appendChild(mbtn("▶ play all", "Play from the top of the list", function () {
      var vis = visibleItems();
      if (!vis.length) { toast("Add a song first."); return; }
      playId(vis[0].id);
    }));
    lr.appendChild(mbtn("🔀 shuffle", "Play a random song", function () {
      if (!state.items.length) { toast("Add a song first."); return; }
      if (!state.shuffle) toggleShuffle();
      var pool = state.items.filter(function (x) { return x.id !== state.currentId; });
      var src = pool.length ? pool : state.items;
      playId(src[Math.floor(Math.random() * src.length)].id);
    }));
    list.appendChild(lr);
    var rows = document.createElement("div");
    rows.className = "mp-list";
    rows.id = "mp-list";
    list.appendChild(rows);
    panel.appendChild(list);

    ov.appendChild(panel);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
    document.body.appendChild(ov);
    wireDrop(ov);
    installKeys();
  }
  function wireDrop(ov) {
    var depth = 0;
    ov.addEventListener("dragenter", function (e) {
      e.preventDefault();
      depth++;
      ov.classList.add("mp-dragover");
    });
    ov.addEventListener("dragover", function (e) { e.preventDefault(); });
    ov.addEventListener("dragleave", function (e) {
      e.preventDefault();
      depth = Math.max(0, depth - 1);
      if (!depth) ov.classList.remove("mp-dragover");
    });
    ov.addEventListener("drop", function (e) {
      e.preventDefault();
      depth = 0;
      ov.classList.remove("mp-dragover");
      try {
        var dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length) { uploadFiles(dt.files); return; }
        var txt = dt ? (dt.getData("text/uri-list") || dt.getData("text/plain") || "") : "";
        if (txt) addLinksFromText(txt);
      } catch (err) {}
    });
  }
  function editableTarget(e) {
    var t = e.target;
    return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
  }
  function installKeys() {
    document.addEventListener("keydown", function (e) {
      var ov = overlay();
      if (!ov || ov.hidden) return;
      if (e.key === "Escape") { close(); return; }
      if (editableTarget(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      var k = e.key;
      if (k === " ") { e.preventDefault(); toggle(); }
      else if (k === "ArrowLeft") { e.preventDefault(); seekBy(e.shiftKey ? -30 : -5); }
      else if (k === "ArrowRight") { e.preventDefault(); seekBy(e.shiftKey ? 30 : 5); }
      else if (k === "ArrowUp") { e.preventDefault(); setVolume(state.volume + 0.05); }
      else if (k === "ArrowDown") { e.preventDefault(); setVolume(state.volume - 0.05); }
      else if (k === "n" || k === "N") next();
      else if (k === "p" || k === "P") prev();
      else if (k === "m" || k === "M") toggleMute();
      else if (k === "s" || k === "S") toggleShuffle();
      else if (k === "r" || k === "R") cycleRepeat();
    });
  }
  function visibleItems() {
    var q = String(state.filter || "").trim().toLowerCase();
    var arr = state.items.slice();
    if (q) {
      arr = arr.filter(function (it) {
        var h = hostInfo(it.url);
        return (it.title + " " + (it.artist || "") + " " + (it.album || "") + " " + (it.addedBy || "") + " " + h.label + " " + it.url).toLowerCase().indexOf(q) !== -1;
      });
    }
    if (state.sort === "title") {
      arr.sort(function (a, b) { return (a.customTitle || a.title).localeCompare(b.customTitle || b.title); });
    } else if (state.sort === "longest") {
      arr.sort(function (a, b) { return (b.duration || -1) - (a.duration || -1); });
    } else if (state.sort === "source") {
      arr.sort(function (a, b) { return hostInfo(a.url).label.localeCompare(hostInfo(b.url).label); });
    }
    return arr;
  }
  function totalKnown() {
    var t = 0, n = 0;
    state.items.forEach(function (it) { if (it.duration && isFinite(it.duration)) { t += it.duration; n++; } });
    return { t: t, n: n };
  }
  function syncNow() {
    var ov = overlay();
    if (!ov || ov.hidden) return;
    var it = currentItem();
    var art = $("mp-art"), t = $("mp-nptitle"), s = $("mp-npsub");
    if (!it) {
      if (art) { art.textContent = "🎵"; }
      if (t) t.textContent = "Nothing playing";
      if (s) s.textContent = "Add a song below to start.";
      if ($("mp-tot")) $("mp-tot").textContent = "—";
      return;
    }
    if (art) {
      while (art.firstChild) art.removeChild(art.firstChild);
      if (it.art) {
        var im = document.createElement("img");
        im.src = it.art;
        im.alt = "";
        art.appendChild(im);
      } else art.textContent = "🎵";
    }
    if (t) t.textContent = (isPlaying() ? "▶ " : "") + (it.customTitle || it.title);
    if (s) {
      var h = hostInfo(it.url);
      s.textContent = [it.artist || "", h.ico + " " + h.label + (it.addedBy ? " · " + it.addedBy : "")].filter(Boolean).join(" · ");
    }
  }
  function syncTransport() {
    var ov = overlay();
    if (!ov || ov.hidden) { syncMini(); return; }
    var playing = isPlaying();
    var pb = $("mp-playbtn");
    if (pb) pb.textContent = playing ? "⏸" : "▶";
    var sh = $("mp-shufbtn");
    if (sh) sh.classList.toggle("on", !!state.shuffle);
    var rp = $("mp-repbtn");
    if (rp) {
      rp.classList.toggle("on", state.repeat !== "off");
      rp.textContent = state.repeat === "one" ? "🔂" : "🔁";
      rp.title = "Repeat (R): " + state.repeat;
    }
    var mu = $("mp-mutebtn");
    if (mu) {
      mu.textContent = (state.muted || state.volume === 0) ? "🔇" : "🔊";
      mu.classList.toggle("on", !!state.muted);
    }
    var vol = $("mp-vol");
    if (vol && document.activeElement !== vol) { try { vol.value = String(Math.round(state.volume * 100)); } catch (e) {} }
    var rate = $("mp-rate");
    if (rate && rate.value !== String(state.rate)) rate.value = String(state.rate);
    tick();
    syncNow();
    syncMini();
  }
  function syncList() { paint(); }
  function paint() {
    syncHubButton();
    syncMini();
    var ov = overlay();
    if (!ov || ov.hidden) return;
    syncTransport();
    var tot = totalKnown();
    var cnt = $("mp-count");
    if (cnt) {
      cnt.textContent = state.items.length + (state.items.length === 1 ? " song" : " songs") +
        (tot.n ? " · " + fmtTime(tot.t) : "");
    }
    var filt = $("mp-filter");
    if (filt && filt.value !== state.filter) filt.value = state.filter;
    var sort = $("mp-sort");
    if (sort && sort.value !== state.sort) sort.value = state.sort;
    var rows = $("mp-list");
    if (!rows) return;
    while (rows.firstChild) rows.removeChild(rows.firstChild);
    var vis = visibleItems();
    if (!vis.length) {
      var empty = document.createElement("div");
      empty.className = "mp-empty";
      empty.textContent = state.items.length ? "No songs match that filter." : "Nothing here yet — paste a link above and hit ➕ Add links.";
      rows.appendChild(empty);
      return;
    }
    vis.forEach(function (it, di) {
      probeDuration(it);
      queueProbe(it, false);
      var row = document.createElement("div");
      row.className = "mp-item" + (it.id === state.currentId ? " current" : "");
      row.dataset.mid = it.id;
      var num = document.createElement("span");
      num.className = "mp-num";
      num.textContent = it.id === state.currentId ? (isPlaying() ? "▶" : "❚❚") : String(di + 1);
      var th = document.createElement("div");
      th.className = "mp-thumb";
      if (it.art) {
        var im = document.createElement("img");
        im.src = it.art;
        im.alt = "";
        im.loading = "lazy";
        th.appendChild(im);
      } else th.textContent = "🎵";
      var meta = document.createElement("div");
      meta.className = "mp-meta";
      var t = document.createElement("div");
      t.className = "mp-title";
      t.textContent = it.customTitle || it.title;
      if (it.noTitle && !it.customTitle) {
        var nt = document.createElement("span");
        nt.className = "mp-notitle";
        nt.title = "The file carries no title — ✏️ rename it to set one";
        nt.textContent = "no title";
        t.appendChild(nt);
      }
      var sub = document.createElement("div");
      sub.className = "mp-sub";
      var h = hostInfo(it.url);
      sub.textContent = [it.artist || "", h.ico + " " + h.label + (it.addedBy ? " · " + it.addedBy : "")].filter(Boolean).join(" · ");
      meta.appendChild(t);
      meta.appendChild(sub);
      var dur = document.createElement("span");
      dur.className = "mp-dur";
      dur.textContent = it.duration ? fmtTime(it.duration) : "—";
      var acts = document.createElement("div");
      acts.className = "mp-acts";
      function act2(label, title, fn) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "mp-act";
        b.textContent = label;
        b.title = title;
        b.addEventListener("click", function (e) { e.stopPropagation(); fn(); });
        acts.appendChild(b);
      }
      act2("↑", "Move up", function () { moveItem(it, -1); });
      act2("↓", "Move down", function () { moveItem(it, 1); });
      act2("✏️", "Rename", function () { renameItem(it); });
      act2("📋", "Copy link", function () { copyText(it.url); });
      act2("🗑️", "Remove", function () { removeItem(it); });
      row.appendChild(num);
      row.appendChild(th);
      row.appendChild(meta);
      row.appendChild(dur);
      row.appendChild(acts);
      row.addEventListener("click", function () { playId(it.id); });
      row.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); playId(it.id); }
      });
      row.setAttribute("tabindex", "0");
      row.setAttribute("role", "button");
      row.title = "Play " + (it.customTitle || it.title);
      rows.appendChild(row);
    });
  }
  function open() {
    build();
    var ov = overlay();
    if (!ov) return;
    ov.hidden = false;
    paint();
  }
  function close() {
    var ov = overlay();
    if (ov) ov.hidden = true;
  }
  function refresh() {
    var ov = overlay();
    if (ov && !ov.hidden) paint();
  }

  /* -------------------------------------------------------------- mini pill */
  function syncMini() {
    var mini = $("mpMini");
    if (!mini) return;
    var it = currentItem();
    if (!it) { mini.hidden = true; return; }
    mini.hidden = false;
    var t = $("mpMiniTitle");
    if (t) t.textContent = (isPlaying() ? "▶ " : "❚❚ ") + (it.customTitle || it.title);
    var pb = $("mpMiniPlay");
    if (pb) pb.textContent = isPlaying() ? "⏸" : "▶";
  }
  function buildMini() {
    if ($("mpMini")) return;
    var mini = document.createElement("div");
    mini.id = "mpMini";
    mini.hidden = true;
    function b(label, title, fn, id) {
      var x = document.createElement("button");
      x.type = "button";
      x.className = "mp-tbtn";
      if (id) x.id = id;
      x.textContent = label;
      x.title = title;
      x.addEventListener("click", function (e) { e.stopPropagation(); fn(); });
      mini.appendChild(x);
      return x;
    }
    b("⏮", "Previous", function () { prev(); });
    b("▶", "Play / pause", function () { toggle(); }, "mpMiniPlay");
    b("⏭", "Next", function () { next(); });
    var t = document.createElement("span");
    t.id = "mpMiniTitle";
    t.title = "Open the media player";
    t.addEventListener("click", function () { open(); });
    mini.appendChild(t);
    b("✕", "Hide", function () { mini.hidden = true; });
    document.body.appendChild(mini);
  }

  /* ------------------------------------------------------------------ boot */
  load();
  ensureHubButton();
  setTimeout(ensureHubButton, 0);
  buildMini();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { ensureHubButton(); buildMini(); });
  /* gentle boot re-read: untagged tracks get their tags, capped like the original */
  setTimeout(function () {
    try {
      var n = 0;
      for (var i = 0; i < state.items.length && n < MAX_BOOT_PROBES; i++) {
        if (!state.items[i].tagged) { queueProbe(state.items[i], false); n++; }
      }
    } catch (e) {}
  }, 4000);

  window.musicPlayer = {
    open: open,
    close: close,
    refresh: refresh,
    state: state,
    items: function () { return state.items; },
    add: add,
    addLinksFromText: addLinksFromText,
    play: playId,
    toggle: toggle,
    stop: stop,
    next: next,
    prev: prev,
    seekTo: seekTo,
    seekBy: seekBy,
    setVolume: setVolume,
    setRate: setRate,
    toggleShuffle: toggleShuffle,
    cycleRepeat: cycleRepeat,
    audio: function () { return ensureAudio(); },
    normalizeUrl: normalizeUrl,
    hostInfo: hostInfo,
    fmtTime: fmtTime,
    reprobeAll: reprobeAll,
    parseHeadTags: function (bytes) { return parseHeadTags(bytes); },
    parseTailTags: function (bytes) { return parseTailTags(bytes); },
    parseId3: function (bytes) { return parseId3(bytes); },
    parseId3v1: function (bytes) { return parseId3v1(bytes); },
    parseApe: function (bytes) { return parseApe(bytes); },
    parseFlac: function (bytes) { return parseFlac(bytes); },
    parseOgg: function (bytes) { return parseOgg(bytes); },
    parseMp4: function (bytes) { return parseMp4(bytes); },
    parseMatroska: function (bytes) { return parseMatroska(bytes); },
    parseRiff: function (bytes) { return parseRiff(bytes); }
  };
})();
