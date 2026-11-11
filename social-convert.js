(function () {
"use strict";

var built = false;
var S = { card: null, book: null, meta: null, avatar: "", loreText: "", loreJSON: null, loreName: "", persona: null, personaId: null };

function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function toast(msg) {
  try {
    if (typeof window.vaultToast === "function") { window.vaultToast(msg); return; }
  } catch (e) {}
  setStatus(msg, false);
}
function setStatus(msg, spin) {
  var el = $("sconv-status");
  if (!el) return;
  el.classList.toggle("spin", !!spin);
  el.textContent = msg || "";
}
function waitFor(test, ms) {
  ms = ms || 12000;
  return new Promise(function (resolve) {
    var t0 = Date.now();
    (function tick() {
      var ok = false;
      try { ok = !!test(); } catch (e) {}
      if (ok) return resolve(true);
      if (Date.now() - t0 >= ms) return resolve(false);
      setTimeout(tick, 120);
    })();
  });
}
function withTimeout(p, ms) {
  return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timed out")); }, ms || 25000); })]);
}
function root() { return window.root || {}; }

async function apiGet(url) {
  var errs = [];
  try {
    var r = await withTimeout(fetch(url, { credentials: "omit" }));
    if (r && r.ok) return r;
    errs.push("direct " + (r ? r.status : "fail"));
  } catch (e) { errs.push("direct fail"); }
  try {
    var sf = root().superFetch;
    if (typeof sf !== "function") throw new Error("no superFetch");
    var r2 = await withTimeout(sf(url));
    if (r2 && r2.ok) return r2;
    throw new Error("superFetch " + (r2 ? r2.status : "fail"));
  } catch (e) { errs.push(e && e.message ? e.message : "superFetch fail"); }
  throw new Error(errs.join(" · "));
}
async function apiJson(url) {
  var r = await apiGet(url);
  return await r.json();
}
async function apiBytes(url) {
  var r = await apiGet(url);
  var buf = await r.arrayBuffer();
  return new Uint8Array(buf);
}

async function inflateBytes(bytes) {
  if (typeof DecompressionStream === "undefined" || !bytes || !bytes.length) return null;
  try {
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
    var reader = stream.getReader();
    var chunks = [], total = 0;
    while (true) {
      var rd = await reader.read();
      if (rd.done) break;
      total += rd.value.length;
      if (total > 20 * 1024 * 1024) { try { await reader.cancel(); } catch (e) {} return null; }
      chunks.push(rd.value);
    }
    var out = new Uint8Array(total), pos = 0;
    for (var i = 0; i < chunks.length; i++) { out.set(chunks[i], pos); pos += chunks[i].length; }
    return out;
  } catch (e) { return null; }
}
function decodeCharaPayload(payload) {
  var v = String(payload == null ? "" : payload).trim();
  if (!v) return null;
  var cleaned = v.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  try {
    var bin = atob(cleaned);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder("utf-8").decode(arr));
  } catch (e) {}
  try { return JSON.parse(v); } catch (e) {}
  return null;
}
async function extractCardFromPngBytes(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (!(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47)) return null;
  var offset = 8, chara = null;
  var utf8 = new TextDecoder();
  while (offset + 12 <= bytes.length) {
    var len = ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
    if (offset + 12 + len > bytes.length) break;
    var type = utf8.decode(bytes.slice(offset + 4, offset + 8));
    if (type === "IEND") break;
    if (type === "tEXt" || type === "zTXt" || type === "iTXt") {
      var chunk = bytes.slice(offset + 8, offset + 8 + len);
      var nullIdx = chunk.indexOf(0);
      if (nullIdx >= 0) {
        var keyword = utf8.decode(chunk.slice(0, nullIdx));
        if (keyword === "ccv3" || keyword === "chara") {
          var payload = "";
          if (type === "tEXt") {
            payload = utf8.decode(chunk.slice(nullIdx + 1));
          } else if (type === "zTXt") {
            var inflated = await inflateBytes(chunk.slice(nullIdx + 2));
            if (inflated) payload = utf8.decode(inflated);
          } else {
            var p = nullIdx + 3;
            var langEnd = chunk.indexOf(0, p); p = (langEnd < 0 ? p : langEnd + 1);
            var transEnd = chunk.indexOf(0, p); p = (transEnd < 0 ? p : transEnd + 1);
            if (chunk[nullIdx + 1]) {
              var inflated2 = await inflateBytes(chunk.slice(p));
              if (inflated2) payload = utf8.decode(inflated2);
            } else {
              payload = utf8.decode(chunk.slice(p));
            }
          }
          var parsed = payload ? decodeCharaPayload(payload) : null;
          if (parsed) {
            var card = parsed.data || parsed;
            if (keyword === "ccv3") return card;
            if (!chara) chara = card;
          }
        }
      }
    }
    offset += 12 + len;
  }
  return chara;
}
function normalizeCard(raw) {
  if (!raw || typeof raw !== "object") return null;
  var d = raw;
  if (d.spec && d.data && typeof d.data === "object") d = d.data;
  else if (d.data && typeof d.data === "object" && (d.data.name || d.data.description)) d = d.data;
  if (!d.name && !d.description && !d.personality) return null;
  var tags = [];
  if (Array.isArray(d.tags)) tags = d.tags.filter(Boolean).map(String);
  else if (typeof d.tags === "string" && d.tags.trim()) tags = [d.tags.trim()];
  var book = (d.character_book && typeof d.character_book === "object") ? d.character_book : null;
  return {
    name: String(d.name || "Untitled"),
    description: String(d.description || ""),
    personality: String(d.personality || ""),
    scenario: String(d.scenario || ""),
    first_mes: String(d.first_mes || ""),
    alternate_greetings: Array.isArray(d.alternate_greetings) ? d.alternate_greetings.map(String) : [],
    mes_example: String(d.mes_example || ""),
    creator_notes: String(d.creator_notes == null ? "" : d.creator_notes),
    system_prompt: String(d.system_prompt || ""),
    post_history_instructions: String(d.post_history_instructions || ""),
    tagline: String(d.tagline || ""),
    tags: tags,
    character_book: book
  };
}
function subChar(s, name) {
  return String(s == null ? "" : s).replace(/{{char}}/gi, name || "{{char}}");
}
function flattenBook(book) {
  if (!book || typeof book !== "object") return "";
  var lines = [];
  if (book.name) lines.push("# " + String(book.name));
  if (book.description) lines.push(String(book.description).trim());
  var entries = Array.isArray(book.entries) ? book.entries : [];
  entries.forEach(function (entry, i) {
    if (!entry || typeof entry !== "object") return;
    var content = String(entry.content || "").trim();
    if (!content) return;
    var title = entry.name || entry.comment || ("Entry " + (i + 1));
    var keys = Array.isArray(entry.keys) ? entry.keys.join(", ") : (Array.isArray(entry.triggers) ? entry.triggers.join(", ") : "");
    lines.push("\n## " + title);
    if (keys) lines.push("Keys: " + keys);
    lines.push(content);
  });
  return lines.join("\n").trim();
}
function countWords(t) { t = String(t || "").trim(); return t ? t.split(/\s+/).length : 0; }
function safeName(n) {
  return String(n || "character").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9-_]+/g, "_").replace(/_+/g, "_").slice(0, 60) || "character";
}
function downloadFile(name, text, mime) {
  var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

var CHUB_API = "https://api.chub.ai";
var WYVERN_API = "https://api.wyvern.chat";
var CV_API = "https://charavault.net";
var FL_API = "https://fictionlab.ai/api";

async function chubNode(kind, id) {
  var d = await apiJson(CHUB_API + "/api/" + kind + "/" + encodeURIComponent(id));
  var n = (d && d.node) || d;
  if (!n || !n.id) throw new Error("not found on chub.ai");
  return n;
}
async function chubSearch(kind, q) {
  var d = await apiJson(CHUB_API + "/search?namespace=" + kind + "&search=" + encodeURIComponent(q) + "&first=30&nsfw=true");
  return ((d && d.data && d.data.nodes) || []);
}
async function chubPngCard(maxResUrl) {
  if (!maxResUrl) return null;
  try {
    var bytes = await apiBytes(maxResUrl);
    var raw = await extractCardFromPngBytes(bytes);
    return normalizeCard(raw);
  } catch (e) { return null; }
}
function chubMeta(n, kind) {
  var fp = n.fullPath || String(n.id);
  return {
    name: n.name || "Untitled",
    avatar: n.avatar_url || "",
    desc: n.description || n.tagline || "",
    tags: Array.isArray(n.topics) ? n.topics : [],
    creator: fp.split("/")[0] || "",
    source: kind === "lorebooks" ? "chub.ai lorebook" : "chub.ai",
    sourceUrl: "https://chub.ai/" + kind + "/" + String(fp).replace(/^lorebooks\//, "")
  };
}
async function resolveChubChar(ref) {
  var n;
  if (/^\d+$/.test(ref)) { n = await chubNode("characters", ref); }
  else {
    try { n = await chubNode("characters", ref); }
    catch (e) {
      var nodes = await chubSearch("characters", ref.split("/").pop().replace(/[-_]/g, " "));
      var hit = nodes.filter(function (x) { return String(x.fullPath || "").toLowerCase() === String(ref).toLowerCase(); })[0] || nodes[0];
      if (!hit) throw new Error("no chub.ai character matches “" + ref + "”");
      n = await chubNode("characters", hit.id);
    }
  }
  var meta = chubMeta(n, "characters");
  var card = await chubPngCard(n.max_res_url);
  if (!card) {
    card = normalizeCard({ name: meta.name, description: meta.desc, tags: meta.tags }) || {
      name: meta.name, description: meta.desc, personality: "", scenario: "", first_mes: "",
      alternate_greetings: [], mes_example: "", creator_notes: "", system_prompt: "",
      post_history_instructions: "", tagline: "", tags: meta.tags, character_book: null
    };
  }
  return { card: card, book: card.character_book || null, meta: meta, avatar: meta.avatar };
}
function bookFromChubLoreNode(node) {
  var entries = Array.isArray(node.entries) ? node.entries : [];
  if (!entries.length && node.content) {
    try {
      var parsed = JSON.parse(node.content);
      if (Array.isArray(parsed.entries)) entries = parsed.entries;
    } catch (e) {}
  }
  return {
    name: node.name || "Untitled",
    description: node.description || "",
    entries: entries.map(function (en, i) {
      return { name: en.name || en.comment || ("Entry " + (i + 1)), keys: Array.isArray(en.keys) ? en.keys : [], content: en.content || "" };
    })
  };
}
async function resolveChubLore(ref) {
  var n;
  if (/^\d+$/.test(ref)) { n = await chubNode("lorebooks", ref); }
  else {
    var clean = String(ref).replace(/^lorebooks\//, "");
    try { n = await chubNode("lorebooks", ref); }
    catch (e) {
      var nodes = await chubSearch("lorebooks", clean.split("/").pop().replace(/[-_]/g, " "));
      var hit = nodes.filter(function (x) {
        return String(x.fullPath || "").toLowerCase() === clean.toLowerCase() ||
          String(x.fullPath || "").toLowerCase() === ("lorebooks/" + clean).toLowerCase();
      })[0] || nodes[0];
      if (!hit) throw new Error("no chub.ai lorebook matches “" + ref + "”");
      n = await chubNode("lorebooks", hit.id);
    }
  }
  var meta = chubMeta(n, "lorebooks");
  return { card: null, book: bookFromChubLoreNode(n), meta: meta, avatar: meta.avatar };
}
function wyvernRec(w) { return (w && (w.character || w.data)) || w; }
function wyvernCardOf(w, fallbackName) {
  w = wyvernRec(w);
  if (!w) return null;
  var name = w.name || fallbackName || "Untitled";
  var sub = function (s) { return String(s == null ? "" : s).replace(/{{char}}/gi, name).replace(/{{user}}/gi, "the user"); };
  return normalizeCard({
    name: name,
    description: sub(w.description),
    personality: sub(w.personality),
    scenario: sub(w.scenario),
    first_mes: sub(w.first_mes),
    alternate_greetings: Array.isArray(w.alternate_greetings) ? w.alternate_greetings.map(sub) : [],
    mes_example: sub(w.mes_example),
    creator_notes: sub(w.creator_notes),
    tags: Array.isArray(w.tags) ? w.tags : []
  });
}
async function wyvernBookFor(charId) {
  try {
    var arr = await apiJson(WYVERN_API + "/lorebooks/character/" + encodeURIComponent(charId));
    if (arr && !Array.isArray(arr) && Array.isArray(arr.lorebooks)) arr = arr.lorebooks;
    if (!Array.isArray(arr) || !arr.length) return null;
    var entries = [];
    arr.forEach(function (lb) {
      (lb.entries || []).forEach(function (e) {
        if (!e) return;
        entries.push({ name: e.name || e.comment || ("Entry " + (entries.length + 1)), keys: Array.isArray(e.keys) ? e.keys : [], content: e.content || "" });
      });
    });
    if (!entries.length) return null;
    return { name: arr.length === 1 ? (arr[0].name || "Lorebook") : "Lorebooks", description: (arr[0] && arr[0].description) || "", entries: entries };
  } catch (e) { return null; }
}
async function resolveWyvernChar(ref) {
  var w = await apiJson(WYVERN_API + "/characters/" + encodeURIComponent(ref));
  if (!w || (!w.id && !wyvernRec(w).name)) throw new Error("not found on wyvern.chat");
  var rec = wyvernRec(w);
  var card = wyvernCardOf(rec, null);
  if (!card) throw new Error("wyvern.chat returned no character data");
  var meta = {
    name: card.name,
    avatar: rec.photoURL || rec.avatar || "",
    desc: rec.description || rec.tagline || "",
    tags: Array.isArray(rec.tags) ? rec.tags : [],
    creator: (rec.creator && (rec.creator.displayName || rec.creator.vanityUrl)) || "",
    source: "wyvern.chat",
    sourceUrl: "https://app.wyvern.chat/characters/" + encodeURIComponent(String(rec.vanity_slug || rec.id || ref))
  };
  var book = await wyvernBookFor(rec.id || ref);
  if (book) card.character_book = book;
  return { card: card, book: book, meta: meta, avatar: meta.avatar };
}
async function resolveWyvernLore(ref) {
  var w = await apiJson(WYVERN_API + "/lorebooks/" + encodeURIComponent(ref));
  var rec = wyvernRec(w);
  if (!rec || !rec.id) throw new Error("not found on wyvern.chat");
  var entries = Array.isArray(rec.entries) ? rec.entries : [];
  var book = {
    name: rec.name || "Untitled",
    description: String(rec.description || ""),
    entries: entries.map(function (e, i) {
      return { name: e.name || e.comment || ("Entry " + (i + 1)), keys: Array.isArray(e.keys) ? e.keys : [], content: e.content || "" };
    })
  };
  var meta = {
    name: book.name, avatar: rec.photoURL || rec.avatar || "", desc: book.description,
    tags: Array.isArray(rec.tags) ? rec.tags : [],
    creator: (rec.creator && (rec.creator.displayName || rec.creator.vanityUrl)) || "",
    source: "wyvern.chat lorebook",
    sourceUrl: "https://app.wyvern.chat/lorebooks/" + encodeURIComponent(String(rec.vanity_slug || rec.id))
  };
  return { card: null, book: book, meta: meta, avatar: meta.avatar };
}
function cvCardUrl(folder, file, thumb) {
  return CV_API + "/cards/" + (thumb ? "thumb/" : "") + encodeURIComponent(folder || "cards") + "/" + encodeURIComponent(file || "");
}
async function resolveCvCard(folder, file) {
  var data = await apiJson(CV_API + "/api/cards/" + encodeURIComponent(folder) + "/" + encodeURIComponent(file));
  var raw = (data && data.full_metadata && data.full_metadata.data) || (data && data.full_metadata) || null;
  var card = normalizeCard(raw);
  if (!card) throw new Error("charavault returned no card data");
  var entry = (data && data.entry) || {};
  var meta = {
    name: card.name,
    avatar: cvCardUrl(folder, file, true),
    desc: entry.description_preview || card.description.slice(0, 220),
    tags: Array.isArray(entry.tags) ? entry.tags : card.tags,
    creator: entry.creator || "",
    source: "charavault",
    sourceUrl: CV_API + "/?card=" + encodeURIComponent(folder + "/" + file)
  };
  return { card: card, book: card.character_book || null, meta: meta, avatar: meta.avatar };
}
async function resolveCvLore(id) {
  var data = await apiJson(CV_API + "/api/lorebooks/" + encodeURIComponent(id));
  var book = (data && data.content) || null;
  if (!book || typeof book !== "object") throw new Error("charavault returned no lorebook data");
  var meta = {
    name: book.name || "Untitled", avatar: "", desc: book.description || "",
    tags: Array.isArray(data.topics) ? data.topics : [],
    creator: data.creator || "", source: "charavault lorebook",
    sourceUrl: CV_API + "/lorebooks/" + encodeURIComponent(id)
  };
  return { card: null, book: book, meta: meta, avatar: "" };
}
async function resolveFL(id) {
  var d = await apiJson(FL_API + "/scenario/fetch/" + encodeURIComponent(id) + "?version=2");
  if (!d || !d.id) throw new Error("not found on fictionlab.ai");
  var charName = d.displayName || d.title || d.name || "Untitled";
  var sub = function (s) { return String(s == null ? "" : s).replace(/{{char}}/gi, charName).replace(/{{user}}/gi, "the user"); };
  var card = normalizeCard({
    name: charName,
    description: sub(d.description),
    personality: "",
    scenario: String(d.genre || (Array.isArray(d.genres) ? d.genres.join(", ") : "")),
    first_mes: sub(d.customGreeting),
    mes_example: "",
    character_book: {
      name: charName,
      description: String(d.backStory || "").trim(),
      entries: Array.isArray(d.lorePieces) ? d.lorePieces.map(function (pc, i) {
        return { name: pc.title || pc.name || ("Entry " + (i + 1)), keys: Array.isArray(pc.triggers) ? pc.triggers : [], content: pc.content || "" };
      }) : []
    }
  });
  var avatar = d.mainImage ? (String(d.mainImage).indexOf("http") === 0 ? d.mainImage : "https://fictionlab.ai/image-cdn/" + d.mainImage)
    : (d.avatarURL ? "https://fictionlab.ai/image-cdn/" + d.avatarURL : "");
  var meta = {
    name: charName, avatar: avatar, desc: d.description || "",
    tags: Array.isArray(d.genres) ? d.genres : [],
    creator: d.creatorName || "", source: "fictionlab.ai",
    sourceUrl: "https://fictionlab.ai/?scenario=" + encodeURIComponent(d.id)
  };
  return { card: card, book: card.character_book, meta: meta, avatar: avatar };
}
function b64urlDecode(str) {
  var b64 = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  var bin = atob(b64);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function decodeSharePayload(payload) {
  var raw = b64urlDecode(payload);
  var first = String.fromCharCode(raw[0] || 0);
  var jsonBytes = raw;
  if (first === "1") {
    var inf = await inflateBytes(raw.slice(1));
    if (!inf) throw new Error("could not decode share link");
    jsonBytes = inf;
  } else if (first === "0") {
    jsonBytes = raw.slice(1);
  }
  return JSON.parse(new TextDecoder().decode(jsonBytes));
}
function cvDecodeId(id) {
  var rest = String(id || "").replace(/^cv-/, ""), s = rest.indexOf("/");
  var folder = s >= 0 ? rest.slice(0, s) : "cards";
  var file = s >= 0 ? rest.slice(s + 1) : rest;
  try { file = decodeURIComponent(file); } catch (e) {}
  return { folder: folder, file: file };
}
async function resolveAsShare(payload) {
  var p = await decodeSharePayload(payload);
  if (p && p.v === 1 && p.s && p.id) {
    var id = String(p.id);
    if (p.s === "chub") {
      var m = id.match(/^chub-(\d+)$/) || id.match(/(\d+)$/);
      return resolveChubChar(m ? m[1] : id);
    }
    if (p.s === "fl") return resolveFL(id.replace(/^fl-/, ""));
    if (p.s === "wyvern") return resolveWyvernChar(id.replace(/^wyvern-/, ""));
    if (p.s === "cv") { var cf = cvDecodeId(id); return resolveCvCard(cf.folder, cf.file); }
    throw new Error("unknown share-link source");
  }
  if (p && (p.n || p.d || p.mu || p.fi || p.wi || p.cvfi)) {
    var meta = { name: p.n || "Untitled", avatar: p.a || "", desc: String(p.d || ""), tags: Array.isArray(p.t) ? p.t : [], creator: p.cr || "", source: "as-social share", sourceUrl: "" };
    if (p.mu) {
      var card = await chubPngCard(p.mu);
      if (card) return { card: card, book: card.character_book || null, meta: meta, avatar: meta.avatar || p.mu };
    }
    if (p.fi) return resolveFL(p.fi);
    if (p.wi) return resolveWyvernChar(p.wi);
    if (p.cvfi) return resolveCvCard(p.cvf || "cards", p.cvfi);
    var minCard = normalizeCard({ name: meta.name, description: meta.desc, tags: meta.tags });
    if (minCard) return { card: minCard, book: null, meta: meta, avatar: meta.avatar };
  }
  throw new Error("could not read that share link");
}
function parseSourceLink(input) {
  var t = String(input || "").trim();
  if (!t) return null;
  var m = t.match(/[?&]char=([^&#\s]+)/) || t.match(/#char=([^&#\s]+)/);
  if (m) return { kind: "asshare", ref: decodeURIComponent(m[1]) };
  if (/as-social/i.test(t) && (m = t.match(/char=([^&#\s]+)/))) return { kind: "asshare", ref: decodeURIComponent(m[1]) };
  var u;
  try { u = new URL(t); }
  catch (e) { return { kind: "search", ref: t }; }
  var host = u.hostname.toLowerCase(), path = u.pathname;
  if (host.indexOf("chub.ai") >= 0) {
    m = path.match(/\/characters\/(.+)/);
    if (m) return { kind: "chub-char", ref: decodeURIComponent(m[1].replace(/\/$/, "")) };
    m = path.match(/\/lorebooks\/(.+)/);
    if (m) return { kind: "chub-lore", ref: decodeURIComponent(m[1].replace(/\/$/, "")) };
  }
  if (host.indexOf("wyvern.chat") >= 0) {
    m = path.match(/\/characters\/(.+)/);
    if (m) return { kind: "wyv-char", ref: decodeURIComponent(m[1].replace(/\/$/, "")) };
    m = path.match(/\/lorebooks\/(.+)/);
    if (m) return { kind: "wyv-lore", ref: decodeURIComponent(m[1].replace(/\/$/, "")) };
  }
  if (host.indexOf("charavault") >= 0) {
    m = u.search.match(/[?&]card=([^&#]+)/);
    if (m) {
      var cf = decodeURIComponent(m[1]).split("/");
      return { kind: "cv-card", folder: cf[0] || "cards", file: cf.slice(1).join("/") };
    }
    m = path.match(/\/lorebooks\/(\d+)/);
    if (m) return { kind: "cv-lore", ref: m[1] };
  }
  if (host.indexOf("fictionlab") >= 0) {
    m = u.search.match(/[?&]scenario=([^&#]+)/);
    if (m) return { kind: "fl", ref: decodeURIComponent(m[1]) };
  }
  return null;
}
async function resolveParsed(p) {
  if (!p) throw new Error("paste a character or lorebook link, or use 📁 / 📋 instead");
  if (p.kind === "chub-char") return resolveChubChar(p.ref);
  if (p.kind === "chub-lore") return resolveChubLore(p.ref);
  if (p.kind === "wyv-char") return resolveWyvernChar(p.ref);
  if (p.kind === "wyv-lore") return resolveWyvernLore(p.ref);
  if (p.kind === "cv-card") return resolveCvCard(p.folder, p.file);
  if (p.kind === "cv-lore") return resolveCvLore(p.ref);
  if (p.kind === "fl") return resolveFL(p.ref);
  if (p.kind === "asshare") return resolveAsShare(p.ref);
  throw new Error("link not recognized — browse the frame above and copy the page URL");
}

function cardToPersona(card, meta) {
  var name = card.name || (meta && meta.name) || "Untitled";
  var secs = [];
  function add(h, c) {
    c = String(c == null ? "" : c).trim();
    if (c) secs.push({ heading: h, content: c });
  }
  var tagline = (card.tagline || (meta && meta.desc) || card.description).trim().split("\n")[0].slice(0, 200);
  add("Tagline", tagline);
  add("Visual Description", card.description);
  add("Personality", card.personality);
  add("Scenario", card.scenario);
  add("System Prompt", [card.system_prompt, card.post_history_instructions].filter(function (x) { return String(x || "").trim(); }).join("\n\n"));
  add("Creator Notes", card.creator_notes);
  var greetings = [card.first_mes].concat(card.alternate_greetings || []).map(function (g) { return String(g || "").trim(); }).filter(Boolean);
  add("Opening Line", greetings.join("\n\n---\n\n"));
  add("Roleplay Behavior Examples", card.mes_example);
  var lore = flattenBook(card.character_book);
  if (lore) add("Lorebook", lore);
  var desc = secs.map(function (s) { return "# {{char}} " + s.heading + ":\n" + s.content; }).join("\n\n\n");
  var footer = "\n\n\n# {{char}} Source:\nConverted from " + ((meta && meta.source) || "Social DB") + (((meta && meta.sourceUrl) || "") ? " — " + meta.sourceUrl : "");
  return { name: name, description: desc + footer, thumb: (meta && meta.avatar) || "" };
}
function cardToChatObj(card, meta, avatarUrl) {
  var name = card.name || "Character";
  var sections = [];
  function add(h, c) {
    c = String(c == null ? "" : c).trim();
    if (c) sections.push(h + "\n" + c);
  }
  add("# Description", card.description);
  add("# Personality", card.personality);
  add("# Scenario", card.scenario);
  add("# System prompt", card.system_prompt);
  add("# Example dialogue", card.mes_example);
  add("# Post-history instructions", card.post_history_instructions);
  var lore = flattenBook(card.character_book);
  if (lore) sections.push("# Lorebook\n" + lore);
  var obj = { name: name, avatar: avatarUrl || (meta && meta.avatar) || "" };
  if (sections.length) obj.roleInstruction = sections.join("\n\n");
  try {
    if (obj.roleInstruction && window.t2i_dynamicBondEnabled && window.t2i_dynamicBondEnabled() && window.t2i_dynamicBondBlock) {
      obj.roleInstruction += "\n\n" + window.t2i_dynamicBondBlock();
    }
  } catch (e) {}
  var tagline = (card.tagline || (meta && meta.desc) || "").slice(0, 200);
  if (tagline) obj.tagline = tagline;
  if (card.first_mes.trim()) obj.initialMessages = [{ author: "ai", content: card.first_mes.trim() }];
  return obj;
}
function loreTxt(name, book, sourceUrl) {
  var head = "# " + (book.name || name || "Lorebook");
  if (book.description) head += "\n" + String(book.description).trim();
  if (sourceUrl) head += "\n\nSource: " + sourceUrl;
  var body = flattenBook({ entries: book.entries || [] });
  if (body.indexOf("# ") === 0) body = body.slice(body.indexOf("\n")).trim();
  return (head + "\n" + body).trim() + "\n";
}

function loreToPersona(book, meta) {
  var name = (book && book.name) || (meta && meta.name) || "Lorebook";
  return cardToPersona({
    name: name,
    description: (book && book.description) || "",
    personality: "", scenario: "", first_mes: "", alternate_greetings: [],
    mes_example: "", creator_notes: "", system_prompt: "", post_history_instructions: "",
    tagline: "", tags: (meta && meta.tags) || [], character_book: book
  }, meta);
}
function fieldStat(card) {
  var parts = [];
  [["description", card.description], ["personality", card.personality], ["scenario", card.scenario], ["greeting", card.first_mes], ["examples", card.mes_example]].forEach(function (f) {
    var w = countWords(f[1]);
    if (w) parts.push(f[0] + " " + w + "w");
  });
  var nBook = card.character_book && Array.isArray(card.character_book.entries) ? card.character_book.entries.length : 0;
  if (nBook) parts.push("lorebook " + nBook + " entries");
  if (card.tags && card.tags.length) parts.push(card.tags.length + " tags");
  return parts.join(" · ") || "empty card";
}
function thumbFor(url) {
  if (!url) return "";
  if (/^data:/i.test(url)) return url;
  if (/^https?:/i.test(url)) return url;
  return "";
}
function AVKindSC(url) {
  if (/^data:video\//i.test(String(url || ""))) return "video";
  if (/\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(String(url || ""))) return "video";
  return url ? "image" : "";
}
function downscaleDataUrl(dataUrl, max) {
  return new Promise(function (resolve) {
    try {
      if (/^data:video\//i.test(String(dataUrl || ""))) { resolve(dataUrl); return; }
      var img = new Image();
      img.onload = function () {
        try {
          var sc = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.width * sc));
          c.height = Math.max(1, Math.round(img.height * sc));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", 0.72));
        } catch (e) { resolve(dataUrl); }
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    } catch (e) { resolve(dataUrl); }
  });
}
function renderResult() {
  var host = $("sconv-result");
  if (!host) return;
  if (!S.card && !S.book) { host.hidden = true; host.innerHTML = ""; return; }
  host.hidden = false;
  var html = "";
  if (S.card) {
    var tags = (S.card.tags || []).slice(0, 8).map(esc).join(", ");
    html += '<div class="sconv-card">' +
      (S.avatar ? (AVKindSC(S.avatar) === "video" ? '<video src="' + esc(S.avatar) + '" muted loop playsinline autoplay preload="metadata"></video>' : '<img src="' + esc(S.avatar) + '" alt="">') : "") +
      '<div class="sconv-card-body"><div class="sconv-card-name">' + esc(S.card.name) + "</div>" +
      "<div>" + esc(fieldStat(S.card)) + "</div>" +
      (tags ? '<div class="sconv-tags">' + tags + "</div>" : "") +
      (S.meta && S.meta.source ? '<div class="sconv-tags">via ' + esc(S.meta.source) + "</div>" : "") +
      "</div></div>" +
      '<div class="sconv-actions">' +
      '<button class="gtab-btn" type="button" data-act="persona">🧑 Save as Persona</button>' +
      '<button class="gtab-btn" type="button" data-act="openpersona">✏️ Open in Persona</button>' +
      '<button class="gtab-btn" type="button" data-act="roster">🧑‍🤝‍🧑 Roster</button>' +
      '<button class="gtab-btn" type="button" data-act="chat">💬 Open in AI Chat</button>' +
      "</div>";
  }
  host.innerHTML = html;
  host.querySelectorAll("button[data-act]").forEach(function (b) {
    b.addEventListener("click", function () {
      var act = b.getAttribute("data-act");
      if (act === "persona") doSavePersona(b);
      else if (act === "openpersona") doOpenPersona(b);
      else if (act === "roster") doRoster(b);
      else if (act === "chat") doChat(b);
    });
  });
}
function renderLore() {
  var host = $("sconv-lore");
  if (!host) return;
  var book = S.book;
  if (!book || !flattenBook(book)) {
    if (S.card) { host.hidden = true; host.innerHTML = ""; }
    return;
  }
  S.loreText = loreTxt(S.loreName || (S.card && S.card.name) || book.name, book, S.meta && S.meta.sourceUrl);
  S.loreJSON = book;
  var n = (book.entries || []).length;
  host.hidden = false;
  host.innerHTML = "<div><b>📖 Lorebook</b> — " + esc(book.name || S.loreName || "") + " · " + n + " entr" + (n === 1 ? "y" : "ies") + " · " + countWords(S.loreText) + " words. Paste the .txt into your chat's lorebook / world-info box.</div>" +
    "<pre>" + esc(S.loreText.slice(0, 3000)) + (S.loreText.length > 3000 ? "\n…" : "") + "</pre>" +
    '<div class="sconv-actions">' +
    '<button class="gtab-btn" type="button" data-act="txt">⬇ Download .txt</button>' +
    '<button class="gtab-btn" type="button" data-act="copy">⧉ Copy</button>' +
    '<button class="gtab-btn" type="button" data-act="json">⬇ .json</button>' +
    '<button class="gtab-btn" type="button" data-act="lorepersona">🧑 Save as Persona</button>' +
    '<button class="gtab-btn" type="button" data-act="loreopen">✏️ Open in Persona</button>' +
    "</div>";
  host.querySelectorAll("button[data-act]").forEach(function (b) {
    b.addEventListener("click", function () {
      var act = b.getAttribute("data-act");
      if (act === "txt") { downloadFile(safeName(S.loreName) + "_lorebook.txt", S.loreText); toast("📖 lorebook .txt downloaded"); }
      else if (act === "json") { downloadFile(safeName(S.loreName) + "_lorebook.json", JSON.stringify(S.loreJSON, null, 2), "application/json"); toast("📖 lorebook .json downloaded"); }
      else if (act === "lorepersona") doSaveLorePersona(b);
      else if (act === "loreopen") doOpenLorePersona(b);
      else if (act === "copy") {
        var done = function (ok) { toast(ok ? "📖 lorebook copied" : "⚠️ copy failed"); };
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(S.loreText).then(function () { done(true); }, function () { done(false); });
          else done(false);
        } catch (e) { done(false); }
      }
    });
  });
}
function acceptResult(res) {
  S.card = res.card || null;
  S.book = res.book || (res.card && res.card.character_book) || null;
  S.meta = res.meta || null;
  S.avatar = thumbFor(res.avatar || "") || "";
  S.loreName = (res.card && res.card.name) || (res.meta && res.meta.name) || ((S.book && S.book.name) || "lorebook");
  S.personaId = null;
  S.persona = S.card ? cardToPersona(S.card, S.meta) : null;
  if (S.persona && S.avatar && /^data:image/i.test(S.avatar) && S.avatar.length > 60000) {
    downscaleDataUrl(S.avatar, 256).then(function (small) {
      S.avatar = small;
      if (S.persona) S.persona.thumb = small;
      renderResult();
    });
  }
  if (S.persona) S.persona.thumb = S.avatar;
  if (S.persona) { S.persona.thumbKind = AVKindSC(S.avatar); S.persona.thumbPoster = ""; }
  renderResult();
  renderLore();
}

async function doFetch() {
  var input = $("sconv-link");
  var val = input ? input.value.trim() : "";
  if (!val) { setStatus("⚠️ paste a link first — or use 📁 / 📋", false); return; }
  setStatus("fetching character data…", true);
  try {
    var res = await withTimeout(resolveParsed(parseSourceLink(val)), 45000);
    if (!res || (!res.card && !res.book)) throw new Error("that link returned nothing usable");
    acceptResult(res);
    var what = res.card ? "“" + res.card.name + "”" : "lorebook “" + (res.meta ? res.meta.name : "?") + "”";
    setStatus("✅ loaded " + what, false);
  } catch (e) {
    setStatus("⚠️ " + (e && e.message ? e.message : "fetch failed"), false);
  }
}
async function doFile(file) {
  if (!file) return;
  setStatus("reading file…", true);
  try {
    var buf = new Uint8Array(await file.arrayBuffer());
    var isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50;
    if (isPng) {
      var raw = await extractCardFromPngBytes(buf);
      var card = normalizeCard(raw);
      if (!card) throw new Error("no character card embedded in that PNG");
      var full = await new Promise(function (resolve) {
        var fr = new FileReader();
        fr.onload = function () { resolve(String(fr.result || "")); };
        fr.onerror = function () { resolve(dataUrl); };
        fr.readAsDataURL(file);
      });
      acceptResult({ card: card, book: card.character_book || null, meta: { name: card.name, avatar: "", desc: "", tags: card.tags, creator: "", source: "uploaded PNG", sourceUrl: "" }, avatar: full });
      setStatus("✅ loaded “" + card.name + "” from PNG", false);
    } else {
      var text = new TextDecoder().decode(buf);
      loadJsonText(text);
    }
  } catch (e) {
    setStatus("⚠️ " + (e && e.message ? e.message : "could not read file"), false);
  }
}
function loadJsonText(text) {
  var parsed = null;
  try { parsed = JSON.parse(String(text || "")); } catch (e) {}
  if (!parsed) {
    parsed = decodeCharaPayload(text);
    if (!parsed) { setStatus("⚠️ that is not valid card / lorebook JSON", false); return; }
  }
  if (parsed && Array.isArray(parsed.entries)) {
    var book = { name: parsed.name || parsed.title || "Lorebook", description: parsed.description || "", entries: parsed.entries };
    if (!flattenBook(book)) { setStatus("⚠️ lorebook JSON has no entries", false); return; }
    acceptResult({ card: null, book: book, meta: { name: book.name, avatar: "", desc: "", tags: [], creator: "", source: "pasted JSON", sourceUrl: "" }, avatar: "" });
    setStatus("✅ loaded lorebook “" + book.name + "”", false);
    return;
  }
  var card = normalizeCard(parsed);
  if (!card) { setStatus("⚠️ JSON has no character fields", false); return; }
  acceptResult({ card: card, book: card.character_book || null, meta: { name: card.name, avatar: "", desc: "", tags: card.tags, creator: "", source: "pasted JSON", sourceUrl: "" }, avatar: "" });
  setStatus("✅ loaded “" + card.name + "” from JSON", false);
}
async function doOpenPersona(btn, persona) {
  persona = persona || S.persona;
  if (!persona || !persona.description) { setStatus("⚠️ nothing to open yet", false); return; }
  var label = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "⏳ opening…"; }
  try {
    if (window.ensurePersona) window.ensurePersona();
    var ok = await waitFor(function () { return typeof window.__personaOpenConverted === "function"; }, 15000);
    if (!ok) throw new Error("persona tab not ready");
    if (S.personaId && persona === S.persona) {
      var reopened = await window.__personaOpenSaved(S.personaId);
      if (!reopened) S.personaId = null;
    }
    if (!S.personaId || persona !== S.persona) {
    var id = await window.__personaOpenConverted({ name: persona.name, description: persona.description, thumb: persona.thumb || S.avatar || "", thumbKind: persona.thumbKind || AVKindSC(persona.thumb || S.avatar || "") });
      if (persona === S.persona) S.personaId = id;
    }
  } catch (e) {
    setStatus("⚠️ " + (e && e.message ? e.message : "open failed"), false);
  }
  if (btn) { btn.disabled = false; btn.textContent = label; }
}
async function doSaveLorePersona(btn) {
  if (!S.book) return;
  var label = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "⏳ saving…"; }
  try {
    if (window.ensurePersona) window.ensurePersona();
    var ok = await waitFor(function () { return typeof window.__personaImportSaved === "function"; }, 15000);
    if (!ok) throw new Error("persona library not ready");
    var persona = loreToPersona(S.book, S.meta);
    persona.thumb = S.avatar || "";
    persona.thumbKind = AVKindSC(S.avatar || "");
    await window.__personaImportSaved([{ name: persona.name, description: persona.description, thumb: persona.thumb, thumbKind: persona.thumbKind || "" }]);
    toast("🧑 saved “" + persona.name + "” to the persona library");
    setStatus("✅ lorebook saved as persona “" + persona.name + "”", false);
  } catch (e) {
    setStatus("⚠️ " + (e && e.message ? e.message : "save failed"), false);
  }
  if (btn) { btn.disabled = false; btn.textContent = label; }
}
async function doOpenLorePersona(btn) {
  if (!S.book) return;
  var persona = loreToPersona(S.book, S.meta);
  persona.thumb = S.avatar || "";
  persona.thumbKind = AVKindSC(S.avatar || "");
  await doOpenPersona(btn, persona);
}
async function doSavePersona(btn) {
  if (!S.persona) return;
  var label = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "⏳ saving…"; }
  try {
    if (window.ensurePersona) window.ensurePersona();
    var ok = await waitFor(function () { return typeof window.__personaImportSaved === "function"; }, 15000);
    if (!ok) throw new Error("persona library not ready");
    await window.__personaImportSaved([{ name: S.persona.name, description: S.persona.description, thumb: S.persona.thumb || S.avatar || "", thumbKind: S.persona.thumbKind || AVKindSC(S.persona.thumb || S.avatar || "") }]);
    toast("🧑 saved “" + S.persona.name + "” to the persona library");
    setStatus("✅ “" + S.persona.name + "” is in your persona library — open the Persona tab to refine it", false);
  } catch (e) {
    setStatus("⚠️ " + (e && e.message ? e.message : "save failed"), false);
  }
  if (btn) { btn.disabled = false; btn.textContent = label; }
}
async function doRoster(btn) {
  if (!S.card) return;
  var label = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "⏳ saving…"; }
  try {
    if (window.ensureVault) window.ensureVault();
    var ok = await waitFor(function () { return window.Characters && typeof window.Characters.add === "function"; }, 12000);
    if (!ok) throw new Error("roster not ready");
    var prompt = (S.card.description || S.card.personality || S.card.name).slice(0, 600);
    var c = await window.Characters.add({ name: S.card.name, prompt: prompt, thumb: S.avatar || "", thumbKind: AVKindSC(S.avatar || ""), shape: "512x768" });
    if (c) setStatus("✅ “" + S.card.name + "” added to the character roster", false);
  } catch (e) {
    setStatus("⚠️ " + (e && e.message ? e.message : "save failed"), false);
  }
  if (btn) { btn.disabled = false; btn.textContent = label; }
}
function buildHash(json) {
  return encodeURIComponent(JSON.stringify(json)).replace(/[!'()*]/g, function (c) { return "%" + c.charCodeAt(0).toString(16); });
}
function chatTarget() {
  try {
    if (typeof window.__nexoraChatDefaultTarget === "function") return window.__nexoraChatDefaultTarget() || "chat";
  } catch (e) {}
  return "chat";
}
async function doChat(btn) {
  if (!S.card) return;
  var label = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "⏳ preparing…"; }
  setStatus("preparing “" + S.card.name + "” for AI Chat…", true);
  try {
    var avatar = S.avatar || "";
    if (/^data:image/i.test(avatar) && avatar.length > 60000) avatar = await downscaleDataUrl(avatar, 256);
    if (AVKindSC(avatar) === "video" && (/^data:/i.test(avatar) || /^blob:/i.test(avatar)) && window.AvatarMedia) {
      try {
        var still = await window.AvatarMedia.videoPoster(avatar, 256);
        if (still) avatar = still;
        else if (!/^https?:/i.test(avatar)) avatar = "";
      } catch (e) {}
    }
    var json = { addCharacter: cardToChatObj(S.card, S.meta, avatar), quickAdd: true };
    if (window.ensureGallery) window.ensureGallery();
    var ok = await waitFor(function () { return typeof window.t2i_generateShareLinkForCharacter === "function" && window.t2i_generateShareLinkForCharacter.__t2iCustomChat; }, 12000);
    if (ok) {
      await window.t2i_generateShareLinkForCharacter(json);
      setStatus("✅ pick a chat — “" + S.card.name + "” is ready to go", false);
    } else if (typeof window.__nexoraChatAddCharacter === "function") {
      window.__nexoraChatAddCharacter(buildHash(json), chatTarget());
      setStatus("✅ opening “" + S.card.name + "” in AI Chat", false);
    } else {
      throw new Error("chat handoff not ready");
    }
  } catch (e) {
    setStatus("⚠️ " + (e && e.message ? e.message : "chat handoff failed"), false);
  }
  if (btn) { btn.disabled = false; btn.textContent = label; }
}

function build() {
  var fetchBtn = $("sconv-fetch"), linkInput = $("sconv-link");
  if (fetchBtn) fetchBtn.addEventListener("click", doFetch);
  if (linkInput) linkInput.addEventListener("keydown", function (e) { if (e.key === "Enter") doFetch(); });
  var fileBtn = $("sconv-filebtn"), fileInput = $("sconv-file");
  if (fileBtn && fileInput) {
    fileBtn.addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () {
      if (fileInput.files && fileInput.files[0]) doFile(fileInput.files[0]);
      fileInput.value = "";
    });
  }
  var jsonBtn = $("sconv-jsonbtn"), jsonRow = $("sconv-jsonrow"), jsonLoad = $("sconv-jsonload");
  if (jsonBtn && jsonRow) jsonBtn.addEventListener("click", function () { jsonRow.hidden = !jsonRow.hidden; });
  if (jsonLoad) jsonLoad.addEventListener("click", function () {
    var ta = $("sconv-json");
    loadJsonText(ta ? ta.value : "");
  });
  var hideBtn = $("social-convhide");
  if (hideBtn) hideBtn.addEventListener("click", function () {
    var conv = $("social-conv");
    if (conv) conv.hidden = true;
  });
  var convBtn = $("social-convbtn");
  if (convBtn) convBtn.addEventListener("click", function () {
    var conv = $("social-conv");
    if (!conv) return;
    conv.hidden = !conv.hidden;
    convBtn.textContent = conv.hidden ? "🔄 Converter" : "🔄 Hide converter";
    if (!conv.hidden) {
      try { conv.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) {}
    }
  });
  var conv = $("social-conv");
  if (conv) {
    conv.addEventListener("dragover", function (e) { e.preventDefault(); });
    conv.addEventListener("drop", function (e) {
      if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files[0]) return;
      e.preventDefault();
      doFile(e.dataTransfer.files[0]);
    });
  }
}

window.__socialConvertOnShow = function () {
  if (!built) { built = true; try { build(); } catch (e) { built = false; throw e; } }
  var convBtn = $("social-convbtn");
  var conv = $("social-conv");
  if (convBtn && conv && conv.hidden) { conv.hidden = false; convBtn.textContent = "🔄 Hide converter"; }
};

})();
