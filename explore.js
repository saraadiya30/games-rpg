(function() {
"use strict";
function $(id) { return document.getElementById(id); }
var PAGE = 60;
var DIR_URL = "src/explore-directory.json";
var KV_KEY = "added";
var st = { mode: "site", gen: "", sort: "trending", filter: "safe", q: "", skip: 0, done: false, loading: false, items: [], seen: {}, gateOk: false, shown: PAGE, dir: [], dirQ: "", dirSort: "images", siteState: {}, mixOrder: [], mixPos: 0, dirReady: false };
var booted = false;
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
// Child-safety hard block shared with Home strip + Community feeds: drop minor-age
// prompts from Explore results even when the platform marks them isNsfw=false.
var COMM_CHILD_SAFETY_USER_IDS = ["4fbab17196b080390f63f83ae1207d1999152aa2fa83170cd280bc1f1469f2d3"];
var COMM_CHILD_SAFETY_RX = /\bteen(s|age[rs]?)?\b|school\s*girl|school\s*boy|school\s*uniform|high\s*school|middle\s*school|junior\s*high|\bloli(ta)?\b|\bshota\b|preteen|young\s*(girl|boy|teen|child)|youthful\s*face|young\s*slender/i;
// "late teen(s)/teenage(r/s)" = 18-19 (adult): strip before testing so adult
// phrasing passes while bare "teen" etc. still blocks.
var COMM_CHILD_SAFETY_LATE_TEEN_STRIP = /\blate\s+teen(s|age[rs]?)?\b/gi;
function commChildSafetyHit(userId, title, prompt) {
  try {
    if (userId && COMM_CHILD_SAFETY_USER_IDS.indexOf(userId) !== -1) return true;
    var _hay = String(title || "") + "\n" + String(prompt || "");
    try { _hay = _hay.replace(COMM_CHILD_SAFETY_LATE_TEEN_STRIP, " "); } catch (e) {}
    if (COMM_CHILD_SAFETY_RX.test(_hay)) return true;
  } catch (e) {}
  return false;
}
function channel() { return (st.gen || "").trim() || (window.generatorName || ""); }
function kvStore() {
  try { if (window.root && window.root.kv && window.root.kv.exploreSites) return window.root.kv.exploreSites; } catch (e) {}
  return null;
}
function feedUrlFor(site, skip) {
  var f = st.filter === "all" ? "none" : (st.filter === "blur" ? "pg13" : "g");
  var sort = st.sort === "best" ? "best" : (st.sort === "recent" ? "recent" : "trending");
  return "https://image-generation.perchance.org/gallery?channel=" + encodeURIComponent(site) + "&subChannel=public&sort=" + sort + "&timeRange=1-month&hideIfScoreIsBelow=-1&contentFilter=" + f + "&imageElementsHtmlOnly=true&skip=" + (skip || 0);
}
function toast(msg) {
  try {
    var t = document.createElement("div");
    t.className = "pubmenu-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 1800);
  } catch (e) {}
}
function ensureGalleryMod() {
  if (window.t2iGetGallery) return Promise.resolve(true);
  if (window.ensureGallery) { try { window.ensureGallery(); } catch (e) {} }
  return new Promise(function(res) {
    var n = 0;
    (function tick() {
      if (window.t2iGetGallery) return res(true);
      if (++n > 30) return res(false);
      setTimeout(tick, 250);
    })();
  });
}
function blobToDataUrl(blob) {
  return new Promise(function(res, rej) {
    var fr = new FileReader();
    fr.onload = function() { res(fr.result); };
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}
async function saveToPersonal(it, btn) {
  var orig = btn ? btn.textContent : "";
  try {
    if (btn) { btn.disabled = true; btn.textContent = "⏳"; }
    var ok = await ensureGalleryMod();
    if (!ok) { toast("⚠️ gallery still loading — try again"); return; }
    var ctrl = new AbortController();
    var to = setTimeout(function() { try { ctrl.abort(); } catch (e) {} }, 45000);
    var resp = await fetch(it.url, { signal: ctrl.signal });
    clearTimeout(to);
    if (!resp.ok) throw new Error("http " + resp.status);
    var blob = await resp.blob();
    if (!blob || !blob.size) throw new Error("empty");
    var dataUrl = await blobToDataUrl(blob);
    var title = it.title || (it.prompt || "").slice(0, 60) || ("explore-" + (it.site || channel()));
    var url = null;
    try {
      if (window.t2iAddImageToGallery) url = await window.t2iAddImageToGallery(dataUrl, it.prompt || "", title);
    } catch (e) { url = null; }
    if (!url && window.t2iAddImageWithUrl) {
      try { url = window.t2iAddImageWithUrl(it.url, dataUrl, it.prompt || "", title); } catch (e) { url = null; }
    }
    if (url) {
      if (window.__galleryTabRefresh) try { window.__galleryTabRefresh(); } catch (e) {}
      toast("🖼️ Saved to Personal Gallery — stays on this device");
    } else toast("⚠️ Already saved, or save failed");
  } catch (e) { toast("⚠️ Could not save that image"); }
  finally { if (btn) { btn.disabled = false; btn.textContent = orig; } }
}
function sendPrompt(it, anchor) {
  var p = it.prompt || "";
  if (!p) { toast("No prompt saved for that image"); return; }
  if (window.PromptBridge && window.PromptBridge.sendTo) {
    try { window.PromptBridge.sendTo(p, { anchor: anchor || null, thumb: it.url, tags: ["explore"] }); return; }
    catch (e) {}
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(p).then(function() { toast("📋 Prompt copied"); }, function() { toast("⚠️ bridge loading — try again"); });
    else toast("⚠️ bridge loading — try again");
  } catch (e) {}
}
function pushFileToInput(inputId, blob, name) {
  var input = $(inputId);
  if (!input) return false;
  var file = new File([blob], name || "explore.jpg", { type: blob.type || "image/jpeg" });
  try {
    var dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  } catch (e) { return false; }
}
async function sendImageTo(tab, it, btn) {  var orig = btn ? btn.textContent : "";
  try {
    if (btn) { btn.disabled = true; btn.textContent = "⏳"; }
    var resp = await fetch(it.url);
    if (!resp.ok) throw new Error("http " + resp.status);
    var blob = await resp.blob();
    var name = ((it.title || "explore").replace(/[^\w\- ]+/g, "").trim() || "explore").slice(0, 40) + ".jpg";
    if (tab === "aiedit") {
      if (window.showTab) window.showTab("aiedit");
      var ok = false;
      for (var i = 0; i < 40; i++) {
        if ($("ae-file")) { ok = await pushFileToInput("ae-file", blob, name); if (ok) break; }
        await new Promise(function(r) { setTimeout(r, 250); });
      }
      toast(ok ? "✨ Image loaded in AI Photo Editor" : "⚠️ could not load it there");
      return;
    }
    if (window.showTab) window.showTab("i2p");
    var done = await pushFileToInput("i2p-file", blob, name);
    if (!done) {
      for (var j = 0; j < 20; j++) {
        await new Promise(function(r) { setTimeout(r, 250); });
        if (await pushFileToInput("i2p-file", blob, name)) { done = true; break; }
      }
    }
    toast(done ? "🖼️ Image loaded in Image to Prompt — hit Generate" : "⚠️ could not load it there");
  } catch (e) { toast("⚠️ Could not fetch that image"); }
  finally { if (btn) { btn.disabled = false; btn.textContent = orig; } }
}
function ensureGalleryFull() {
  if (window.t2iGetGallery && window.t2iOpenGallery) return Promise.resolve(true);
  return ensureGalleryMod().then(function() {
    return !!(window.t2iGetGallery && window.t2iOpenGallery);
  });
}
function openPostModal(item) {
  if (window.CommunityCap && !window.CommunityCap.canPost()) { toast(window.CommunityCap.blockedMsg()); return; }
  if (window.CommunityCap) window.CommunityCap.notePosted();
  var prompt = String((item && item.prompt) || "").trim();
  if (!prompt) { toast("That image has no saved prompt — nothing to re-create it from"); return; }
  var title = String((item && item.title) || "").trim() || prompt.slice(0, 60) || "community post";
  var existing = document.getElementById("xplPostModal");
  if (existing) existing.remove();
  var overlay = document.createElement("div");
  overlay.id = "xplPostModal";
  overlay.className = "pro-persona-overlay";
  overlay.innerHTML = '<div class="pro-persona-box pro-post-box">'
    + '<div class="pro-persona-head"><b>📤 Post to community gallery</b>'
    + '<span class="pro-persona-sub">publish a Personal Gallery image to the public gallery</span>'
    + '<button type="button" class="pro-persona-x" data-px-close title="close">✖️</button></div>'
    + '<div class="pro-post-body">'
    + '<div class="pro-post-note">Your saved image can\u2019t be uploaded pixel-for-pixel — the platform only publishes pictures through its own generator. So the saved prompt (<b>' + esc(title).slice(0, 80) + '</b>) is re-opened below in the platform\u2019s gallery-save view and re-created as a fresh variation. When it\u2019s ready, click the <b>❤️</b> button on the image, then <b>📮 send to gallery</b> — keep the gallery name as <b>public</b> so it lands in this studio\u2019s community gallery. Anything flagged NSFW only shows in the gated <b>🔞 NSFW Gallery</b>.</div>'
    + '<div class="pro-post-embed"></div>'
    + "</div></div>";
  document.body.appendChild(overlay);
  overlay.querySelector("[data-px-close]").addEventListener("click", function() { overlay.remove(); });
  overlay.addEventListener("mousedown", function(e) { if (e.target === overlay) overlay.remove(); });
  var hashData = {
    saveChannel: channel(),
    saveTitle: title.replace(/\s+/g, " ").slice(0, 60),
    saveDescription: prompt,
    prompt: prompt,
    seed: -1,
    resolution: "768x768",
    guidanceScale: 7,
    defaultGuidanceScale: 7,
    negativePrompt: "",
    requestId: Math.random().toString(),
    iframeId: "xplPostEmbed" + Math.random().toString().slice(2)
  };
  var iframe = document.createElement("iframe");
  iframe.className = "text-to-image-plugin-image-iframe";
  iframe.setAttribute("data-already-added-intersection-observer", "yes");
  iframe.src = "https://image-generation.perchance.org/embed#" + encodeURIComponent(JSON.stringify(hashData));
  iframe.style.cssText = "width:100%;height:540px;border:0;background:transparent;display:block;";
  overlay.querySelector(".pro-post-embed").appendChild(iframe);
}
function openPostFromPersonal(btn) {
  var orig = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "⏳"; }
  ensureGalleryFull().then(function(ok) {
    if (btn) { btn.disabled = false; btn.textContent = orig; }
    if (!ok) { toast("⚠️ gallery still loading — try again"); return; }
    var gal = [];
    try { gal = window.t2iGetGallery() || []; } catch (e) { gal = []; }
    if (!gal.length) {
      toast("Personal Gallery is empty — Save something first");
      if (window.showTab) window.showTab("gallery");
      return;
    }
    window.t2iOpenGallery({ pick: {
      title: "📤 Post to community gallery",
      hint: "Tap ONE image to publish, then press Add. Its saved prompt is re-created in the platform's gallery-save view (a fresh variation), where you finish with ❤️ → 📮 send to gallery.",
      addNoun: "Post",
      onPick: function(items) {
        if (items && items.length > 1) toast("Posting the first of " + items.length + " — repeat for the rest");
        if (items && items[0]) openPostModal(items[0]);
      }
    } });
  });
}
function parseTiles(txt) {
  var out = [];
  var tmp = document.createElement("div");
  tmp.innerHTML = txt;
  var tiles = tmp.querySelectorAll(".imageCtn");
  for (var i = 0; i < tiles.length; i++) {
    var t = tiles[i];
    var id = t.dataset.imageId;
    if (!id) continue;
    var img = t.querySelector("img");
    var src = img ? (img.getAttribute("src") || "") : "";
    if (!src) continue;
    var ti = t.dataset.title || "", pr = t.dataset.prompt || "";
    var __blocked = false;
    if (typeof window.__t2iModMatch === "function") {
      try { __blocked = !!window.__t2iModMatch({ id: id, userId: (t.dataset.userId || ""), title: ti, prompt: pr }).blocked; } catch (e) { __blocked = false; }
    } else if (typeof commChildSafetyHit === "function" && commChildSafetyHit(t.dataset.userId || "", ti, pr)) __blocked = true;
    if (__blocked) continue;
    out.push({ id: id, url: src, title: ti, prompt: pr, nsfw: t.dataset.isNsfw === "true" });
  }
  return { tiles: tiles.length, items: out };
}
function filtered() {
  var q = st.q.trim().toLowerCase();
  if (!q) return st.items;
  return st.items.filter(function(it) {
    return ((it.prompt || "") + " " + (it.title || "") + " " + (it.site || "")).toLowerCase().indexOf(q) !== -1;
  });
}
function card(it) {
  var d = document.createElement("div");
  d.className = "pro-comm-card";
  var blurred = st.filter !== "safe" && !!it.nsfw;
  var siteLine = (st.mode === "all" && it.site) ? '<div class="xpl-site">' + esc(it.site) + "</div>" : "";
  d.innerHTML = '<div class="pro-comm-imgwrap"><img loading="lazy" src="' + it.url.replace(/"/g, "&quot;") + '" alt="' + esc(it.title).slice(0, 200) + '"' + (blurred ? ' class="pro-comm-blurred"' : "") + '">'
    + (blurred ? '<button type="button" class="pro-comm-reveal">show 🔞</button>' : "") + '</div>'
    + '<div class="pro-comm-meta">' + siteLine + '<div class="pro-comm-title">' + esc(it.title || "(untitled)") + '</div>'
    + '<div class="pro-comm-prompt">' + esc((it.prompt || "").slice(0, 220)) + '</div>'
    + '<div class="xpl-row"></div></div>';
  var wrap = d.querySelector(".pro-comm-imgwrap");
  try {
    if (window.PubMenu) wrap.appendChild(window.PubMenu.button({ url: it.url, prompt: it.prompt || "", title: it.title || "" }));
  } catch (e) {}
  if (blurred) {
    var img = d.querySelector("img"), rb = d.querySelector(".pro-comm-reveal");
    var reveal = function() { img.classList.remove("pro-comm-blurred"); img.style.filter = ""; if (rb && rb.isConnected) rb.remove(); };
    rb.addEventListener("click", function(e) { e.stopPropagation(); reveal(); });
    img.addEventListener("click", reveal);
  } else {
    d.querySelector("img").addEventListener("click", function() { openLb(it); });
  }
  var row = d.querySelector(".xpl-row");
  var bSave = document.createElement("button");
  bSave.type = "button"; bSave.className = "xpl-btn"; bSave.title = "Save a copy to your Personal Gallery (this device only — never reposted to public)";
  bSave.textContent = "💾 Save";
  bSave.addEventListener("click", function(e) { e.stopPropagation(); saveToPersonal(it, bSave); });
  var bSend = document.createElement("button");
  bSend.type = "button"; bSend.className = "xpl-btn"; bSend.title = "Send this prompt to Image Generator, Pro Imager, Evolution…";
  bSend.textContent = "▸ Send";
  bSend.addEventListener("click", function(e) { e.stopPropagation(); sendPrompt(it, bSend); });
  var bCap = document.createElement("button");
  bCap.type = "button"; bCap.className = "xpl-btn"; bCap.title = "Open this image in the Image to Prompt tab to caption it";
  bCap.textContent = "🖼️ Caption";
  bCap.addEventListener("click", function(e) { e.stopPropagation(); sendImageTo("i2p", it, bCap); });
  row.appendChild(bSave); row.appendChild(bSend); row.appendChild(bCap);
  return d;
}
var lbItem = null;
function openLb(it) {
  lbItem = it;
  var lb = $("xpl-lightbox");
  if (!lb) return;
  $("xpl-lb-img").src = it.url;
  $("xpl-lb-prompt").textContent = (it.site ? "[" + it.site + "]\n" : "") + (it.title ? it.title + "\n\n" : "") + (it.prompt || "(no prompt saved)");
  $("xpl-lb-dl").href = it.url;
  lb.hidden = false;
}
function closeLb() { var lb = $("xpl-lightbox"); if (lb) lb.hidden = true; lbItem = null; }
function scopeLabel() {
  if (st.mode === "all") return st.mixOrder.length + " sites";
  return "“" + channel() + "”";
}
function paint() {
  var grid = $("xpl-grid");
  if (!grid) return;
  var list = filtered();
  grid.innerHTML = "";
  list.slice(0, st.shown || PAGE).forEach(function(it) { grid.appendChild(card(it)); });
  var empty = $("xpl-empty");
  if (empty) empty.hidden = st.items.length > 0;
  var more = $("xpl-more-wrap");
  if (more) more.hidden = list.length <= (st.shown || PAGE) && st.done;
  var c = $("xpl-count");
  if (c) {
    var base = st.items.length + " from " + scopeLabel();
    c.textContent = list.length === st.items.length ? base : (list.length + " of " + base);
  }
  var s = $("xpl-status");
  if (s) {
    if (st.loading) s.textContent = "Loading…";
    else if (!st.items.length) s.textContent = st.done ? "No public images found here yet — " + Quip.q("xplEmptyDone", "either it's brand new or everyone's hoarding.") : Quip.q("xplIdle", "Hit Load to browse.");
    else s.textContent = st.items.length + " image" + (st.items.length === 1 ? "" : "s") + (st.done ? " · end" : "");
  }
}
function siteKey(site) { return site.toLowerCase(); }
function getSiteState(site) {
  var k = siteKey(site);
  if (!st.siteState[k]) st.siteState[k] = { skip: 0, done: false };
  return st.siteState[k];
}
async function fetchSitePage(site) {
  var ss = getSiteState(site);
  if (ss.done) return [];
  if (!window.root || !window.root.superFetch) return [];
  var txt = await window.root.superFetch(feedUrlFor(site, ss.skip)).then(function(r) { return r.text(); });
  var parsed = parseTiles(txt);
  ss.skip += parsed.tiles;
  if (parsed.tiles < 10) ss.done = true;
  var fresh = [];
  for (var i = 0; i < parsed.items.length; i++) {
    var it = parsed.items[i];
    var key = siteKey(site) + "|" + it.id;
    if (st.seen[key]) continue;
    st.seen[key] = true;
    if (st.filter === "safe" && it.nsfw) continue;
    it.site = site;
    fresh.push(it);
  }
  return fresh;
}
async function loadMore() {
  if (st.loading || st.done) { paint(); return; }
  if (!window.root || !window.root.superFetch) {
    var s = $("xpl-status");
    if (s) s.textContent = "Gallery needs a moment — try again.";
    return;
  }
  st.loading = true; paint();
  try {
    try { if (window.__t2iModLoad) await Promise.race([window.__t2iModLoad(), new Promise(function (res) { setTimeout(res, 8000); })]); } catch (e) {}
    if (st.mode === "all") {
      var added = 0, guard = 0, seenSites = {};
      while (guard < 12 && (added === 0 || Object.keys(seenSites).length < 3)) {
        guard++;
        if (!st.mixOrder.length) { st.done = true; break; }
        var site = st.mixOrder[st.mixPos % st.mixOrder.length];
        st.mixPos++;
        var fresh = await fetchSitePage(site);
        if (fresh.length) { st.items = st.items.concat(fresh); added += fresh.length; seenSites[siteKey(site)] = 1; }
        var alive = st.mixOrder.some(function(nm) { return !getSiteState(nm).done; });
        if (!alive) { st.done = true; break; }
      }
      if (added === 0) st.done = true;
    } else {
      var site = channel();
      var guard2 = 0, added2 = 0;
      while (guard2 < 6 && added2 === 0) {
        guard2++;
        var fresh2 = await fetchSitePage(site);
        if (getSiteState(site).done && !fresh2.length && guard2 >= 1 && st.skip > 0) break;
        st.skip += 0;
        if (fresh2.length) { st.items = st.items.concat(fresh2); added2 += fresh2.length; break; }
        if (getSiteState(site).done) break;
      }
      if (getSiteState(site).done) st.done = true;
    }
  } catch (e) {
    var s2 = $("xpl-status");
    if (s2) s2.textContent = "Could not load " + Quip.q("xplLoadFail", "— try again.");
  }
  st.loading = false;
  paint();
}
function resetAndLoad() {
  st.skip = 0; st.done = false; st.items = []; st.seen = {}; st.shown = PAGE; st.siteState = {}; st.mixPos = 0;
  if (st.mode === "all") buildMixOrder();
  loadMore();
}
function buildMixOrder() {
  var mine = (window.generatorName || "").toLowerCase();
  var names = st.dir.map(function(d) { return d.name; }).filter(function(n) { return n.toLowerCase() !== mine; });
  if (mine) names.unshift(window.generatorName);
  st.mixOrder = names;
}
function refreshPreset() {
  var sel = $("xpl-preset");
  if (!sel) return;
  var cur = st.mode === "all" ? "__all" : (st.gen || "");
  sel.innerHTML = "";
  var oAll = document.createElement("option");
  oAll.value = "__all"; oAll.textContent = "🌐 All sites (" + st.dir.length + ") — mixed feed";
  sel.appendChild(oAll);
  var oSelf = document.createElement("option");
  oSelf.value = ""; oSelf.textContent = "✨ this studio";
  sel.appendChild(oSelf);
  st.dir.forEach(function(d) {
    var o = document.createElement("option");
    o.value = d.name;
    o.textContent = d.name + " · " + (d.images >= 200 ? "200+" : d.images) + " imgs" + (d.nsfw ? " · 18+" : "");
    sel.appendChild(o);
  });
  var vals = ["__all", ""].concat(st.dir.map(function(d) { return d.name; }));
  sel.value = vals.indexOf(cur) !== -1 ? cur : "";
  if (st.mode === "site" && st.gen && vals.indexOf(st.gen) === -1) {
    var o = document.createElement("option");
    o.value = st.gen; o.textContent = st.gen;
    sel.appendChild(o);
    sel.value = st.gen;
  }
  if (st.mode === "all") sel.value = "__all";
}
function dirFiltered() {
  var q = st.dirQ.trim().toLowerCase();
  var arr = st.dir.slice();
  if (q) arr = arr.filter(function(d) { return (d.name + " " + (d.title || "")).toLowerCase().indexOf(q) !== -1; });
  arr.sort(function(a, b) {
    if (st.dirSort === "views") return (b.views || 0) - (a.views || 0);
    if (st.dirSort === "name") return a.name.localeCompare(b.name);
    return (b.images - a.images) || ((b.views || 0) - (a.views || 0));
  });
  return arr;
}
function paintDir() {
  var list = $("xpl-dir-list");
  if (!list) return;
  var arr = dirFiltered();
  list.innerHTML = "";
  arr.forEach(function(d) {
    var row = document.createElement("div");
    row.className = "xpl-dir-row";
    var thumb = (d.samples && d.samples[0]) || "";
    row.innerHTML = (thumb ? '<img loading="lazy" src="' + thumb.replace(/"/g, "&quot;") + '" alt="">' : '<span class="xpl-dir-noimg">🌐</span>')
      + '<span class="xpl-dir-meta"><b>' + esc(d.name) + '</b><i>' + esc((d.title || "").slice(0, 80)) + '</i>'
      + '<em>' + (d.images >= 200 ? "200+" : d.images) + ' imgs · ' + fmtViews(d.views) + ' views' + (d.nsfw ? ' · 18+' : '') + (d.custom ? ' · added by you' : '') + '</em></span>';
    var b = document.createElement("button");
    b.type = "button"; b.className = "xpl-btn"; b.textContent = "Browse";
    b.addEventListener("click", function() { browseSite(d.name); });
    row.appendChild(b);
    list.appendChild(row);
  });
  var c = $("xpl-dir-count");
  if (c) c.textContent = arr.length + " of " + st.dir.length + " sites";
}
function fmtViews(v) {
  v = Number(v) || 0;
  if (v >= 1000000) return (v / 1000000).toFixed(1) + "M";
  if (v >= 1000) return (v / 1000).toFixed(1) + "k";
  return String(v);
}
function browseSite(name) {
  st.mode = "site"; st.gen = name;
  var gi = $("xpl-gen"); if (gi) gi.value = name;
  refreshPreset();
  var panel = $("xpl-dir-panel"); if (panel) panel.hidden = true;
  var t = $("xpl-dir-toggle"); if (t) t.classList.remove("on");
  resetAndLoad();
  try { $("explore-app").scrollIntoView(); } catch (e) {}
}
function mergeDir(base, extra) {
  var seen = {};
  var out = [];
  (extra || []).concat(base || []).forEach(function(d) {
    if (!d || !d.name) return;
    var k = siteKey(d.name);
    if (seen[k]) return;
    seen[k] = true;
    out.push(d);
  });
  return out;
}
async function loadDir() {
  var base = [];
  try {
    var r = await fetch(DIR_URL);
    if (r.ok) {
      var j = await r.json();
      base = (j && j.galleries) || [];
    }
  } catch (e) {}
  var extra = [];
  var kv = kvStore();
  if (kv) {
    try {
      var saved = await kv.get(KV_KEY);
      if (Array.isArray(saved)) extra = saved;
    } catch (e) {}
  }
  st.dir = mergeDir(base, extra);
  st.dirReady = true;
  refreshPreset();
  paintDir();
}
async function persistAdded() {
  var kv = kvStore();
  if (!kv) return;
  try {
    var custom = st.dir.filter(function(d) { return d.custom; });
    await kv.set(KV_KEY, custom);
  } catch (e) {}
}
async function probeSite(name) {
  if (!window.root || !window.root.superFetch) { toast("Gallery needs a moment — try again"); return null; }
  var txt = await window.root.superFetch(feedUrlFor(name, 0)).then(function(r) { return r.text(); });
  var parsed = parseTiles(txt);
  if (!parsed.items.length) return null;
  var nsfw = parsed.items.some(function(it) { return it.nsfw; });
  var samples = [];
  for (var i = 0; i < parsed.items.length && samples.length < 3; i++) {
    if (samples.indexOf(parsed.items[i].url) === -1) samples.push(parsed.items[i].url);
  }
  return { name: name, title: parsed.items[0].title || name, views: 0, images: parsed.tiles >= 10 ? 200 : parsed.tiles, nsfw: nsfw ? 1 : 0, samples: samples, custom: true };
}
async function addGenerator(name, btn) {
  name = String(name || "").trim();
  if (!name) return;
  var orig = btn ? btn.textContent : "";
  try {
    if (btn) { btn.disabled = true; btn.textContent = "⏳"; }
    toast("Checking “" + name + "” for a public gallery…");
    var found = await probeSite(name);
    if (!found) { toast("No public gallery found for “" + name + "”"); return; }
    var k = siteKey(name);
    var ix = -1;
    for (var i = 0; i < st.dir.length; i++) if (siteKey(st.dir[i].name) === k) { ix = i; break; }
    if (ix === -1) { st.dir.push(found); persistAdded(); }
    refreshPreset(); paintDir();
    browseSite(st.dir[ix === -1 ? st.dir.length - 1 : ix].name);
    toast("Added “" + name + "” — kept on this device");
  } catch (e) { toast("⚠️ Could not check that generator"); }
  finally { if (btn) { btn.disabled = false; btn.textContent = orig; } }
}
function buildChrome() {
  var tb = document.querySelector("#explore-app .xpl-toolbar");
  if (!tb || tb.__xplChrome) return;
  tb.__xplChrome = true;
  var css = document.createElement("style");
  css.textContent = ".xpl-site{font-size:.72rem;font-weight:700;opacity:.6;margin-bottom:.15rem;word-break:break-all;}"
    + "#xpl-dir-panel{border:1px solid var(--th-border);border-radius:12px;padding:.6rem .7rem;margin:0 0 .7rem;background:var(--th-surface);}"
    + "#xpl-dir-panel[hidden]{display:none;}"
    + ".xpl-dir-tools{display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.5rem;align-items:center;}"
    + ".xpl-dir-tools input[type=search]{flex:2 1 160px;min-width:120px;font:inherit;font-size:.82rem;color:inherit;background:var(--th-field,#fff);border:1px solid var(--th-border);border-radius:8px;padding:.4rem .55rem;}"
    + ".xpl-dir-tools select{font:inherit;font-size:.82rem;color:inherit;background:var(--th-field,#fff);border:1px solid var(--th-border);border-radius:8px;padding:.38rem .45rem;}"
    + ".xpl-dir-count{font-size:.78rem;opacity:.65;margin-left:auto;}"
    + "#xpl-dir-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:.45rem;max-height:320px;overflow-y:auto;}"
    + ".xpl-dir-row{display:flex;gap:.5rem;align-items:center;border:1px solid var(--th-border);border-radius:9px;padding:.35rem .45rem;background:var(--th-field,transparent);}"
    + ".xpl-dir-row img{width:44px;height:44px;object-fit:cover;border-radius:7px;background:#000;flex:0 0 auto;}"
    + ".xpl-dir-noimg{width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex:0 0 auto;}"
    + ".xpl-dir-meta{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.35;}"
    + ".xpl-dir-meta b{font-size:.78rem;word-break:break-all;}"
    + ".xpl-dir-meta i{font-style:normal;font-size:.72rem;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}"
    + ".xpl-dir-meta em{font-style:normal;font-size:.7rem;opacity:.55;}"
    + ".xpl-dir-row .xpl-btn{flex:0 0 auto;}";
  document.head.appendChild(css);
  var tgl = document.createElement("button");
  tgl.type = "button"; tgl.id = "xpl-dir-toggle"; tgl.className = "xpl-btn";
  tgl.title = "Browse every known public gallery, ranked";
  tgl.textContent = "📚 Sites";
  var load = $("xpl-load");
  if (load && load.parentNode) load.parentNode.insertBefore(tgl, load);
  else tb.appendChild(tgl);
  var add = document.createElement("button");
  add.type = "button"; add.id = "xpl-add"; add.className = "xpl-btn";
  add.title = "Check any generator for a public gallery and add it to your directory";
  add.textContent = "➕ Add site";
  var gen = $("xpl-gen");
  if (gen && gen.parentNode) gen.parentNode.insertBefore(add, gen.nextSibling);
  else tb.appendChild(add);
  var post = document.createElement("button");
  post.type = "button"; post.id = "xpl-post"; post.className = "xpl-btn";
  post.title = "Pick an image from your Personal Gallery and publish it to the public community gallery";
  post.textContent = "📤 Post from Personal";
  if (load && load.parentNode) load.parentNode.insertBefore(post, load);
  else tb.appendChild(post);
  post.addEventListener("click", function() { openPostFromPersonal(post); });
  var panel = document.createElement("div");
  panel.id = "xpl-dir-panel";
  panel.hidden = true;
  panel.innerHTML = '<div class="xpl-dir-tools"><input id="xpl-dir-q" type="search" autocomplete="off" spellcheck="false" placeholder="Search sites…" aria-label="Search sites">'
    + '<select id="xpl-dir-sort" aria-label="Sort sites"><option value="images">Most images</option><option value="views">Most views</option><option value="name">Name A→Z</option></select>'
    + '<span class="xpl-dir-count" id="xpl-dir-count"></span></div><div id="xpl-dir-list"></div>';
  var grid = $("xpl-grid");
  if (grid && grid.parentNode) grid.parentNode.insertBefore(panel, grid);
  tgl.addEventListener("click", function() {
    panel.hidden = !panel.hidden;
    tgl.classList.toggle("on", !panel.hidden);
    if (!panel.hidden) paintDir();
  });
  add.addEventListener("click", function() { addGenerator($("xpl-gen").value, add); });
  var dq = null;
  panel.querySelector("#xpl-dir-q").addEventListener("input", function() {
    clearTimeout(dq);
    var v = this.value;
    dq = setTimeout(function() { st.dirQ = v; paintDir(); }, 160);
  });
  panel.querySelector("#xpl-dir-sort").addEventListener("change", function() { st.dirSort = this.value; paintDir(); });
}
function boot() {
  if (booted) return; booted = true;
  st.shown = PAGE;
  buildChrome();
  refreshPreset();
  loadDir();
  var preset = $("xpl-preset");
  preset.addEventListener("change", function() {
    if (preset.value === "__all") { st.mode = "all"; st.gen = ""; }
    else { st.mode = "site"; st.gen = preset.value; }
    var gi = $("xpl-gen"); if (gi && st.mode === "site") gi.value = st.gen;
    resetAndLoad();
  });
  var genInput = $("xpl-gen");
  genInput.placeholder = window.generatorName || "generator-name";
  genInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter") { e.preventDefault(); addGenerator(genInput.value, $("xpl-add")); }
  });
  $("xpl-sort").addEventListener("change", function() { st.sort = this.value; resetAndLoad(); });
  $("xpl-filter").addEventListener("change", async function() {
    var v = this.value;
    if (v !== "safe" && !st.gateOk) {
      if (!(await window.uiConfirm("This gallery can include adult (18+) images. Show them blurred / visible?", { okText: 'Show 18+', danger: true }))) { this.value = "safe"; return; }
      st.gateOk = true;
    }
    st.filter = v;
    resetAndLoad();
  });
  var qd = null;
  $("xpl-search").addEventListener("input", function() {
    clearTimeout(qd);
    var v = this.value;
    qd = setTimeout(function() { st.q = v; st.shown = PAGE; paint(); }, 160);
  });
  $("xpl-load").addEventListener("click", loadMore);
  $("xpl-more").addEventListener("click", function() {
    var list = filtered();
    if ((st.shown || PAGE) < list.length) { st.shown = (st.shown || PAGE) + PAGE; paint(); }
    else loadMore();
  });
  $("xpl-open-personal").addEventListener("click", function() { if (window.showTab) window.showTab("gallery"); });
  $("xpl-open-i2p").addEventListener("click", function() { if (window.showTab) window.showTab("i2p"); });
  $("xpl-lb-close").addEventListener("click", closeLb);
  $("xpl-lightbox").addEventListener("mousedown", function(e) { if (e.target === $("xpl-lightbox")) closeLb(); });
  document.addEventListener("keydown", function(e) { if (e.key === "Escape" && $("xpl-lightbox") && !$("xpl-lightbox").hidden) closeLb(); });
  $("xpl-lb-save").addEventListener("click", function() { if (lbItem) saveToPersonal(lbItem, this); });
  $("xpl-lb-send").addEventListener("click", function() { if (lbItem) sendPrompt(lbItem, this); });
  $("xpl-lb-caption").addEventListener("click", function() { if (lbItem) { var it = lbItem; closeLb(); sendImageTo("i2p", it, null); } });
  $("xpl-lb-copy").addEventListener("click", function() {
    if (!lbItem || !lbItem.prompt) return;
    var b = this, o = b.textContent;
    function done() { b.textContent = "✅"; setTimeout(function() { b.textContent = o; }, 1200); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(lbItem.prompt).then(done, done);
    else done();
  });
  paint();
}
window.__exploreOnShow = function(active) {
  if (!active) return;
  boot();
  if (!st.items.length && !st.loading) loadMore();
  else paint();
};
})();
