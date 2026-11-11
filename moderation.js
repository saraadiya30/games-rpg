/* src/moderation.js — shared gallery child-safety lists (static, loads on every page).
 *
 * CANONICAL SOURCE for the minor-age block patterns. index.html (Home strip),
 * src/imager-pro.js (Community feeds) and src/explore.js (Explore tab) keep tiny
 * local fallbacks, but all three consult this module when present so owner
 * decisions apply everywhere without another save.
 *
 * Shared rules live in a public editable file in THIS generator's namespace
 * (readable by every visitor, writable only with the editKey the owner console
 * holds — same pattern as the Personal Gallery cloud sync in src/gallery.js):
 *   https://editable.uploads.dev/file/<generatorName>/mod-lists-v1
 * Shape: {v:1, allowed:[imageId], bannedUsers:[userId], bannedPhrases:[str],
 *         updatedAt:ms, updatedBy:"owner-console"}
 * Because the file is per-generator, each site address keeps its own rules; the
 * built-in RX/ID block below still applies on both.
 */
(function () {
  "use strict";

  var RX = /\bteen(s|age[rs]?)?\b|school\s*girl|school\s*boy|school\s*uniform|high\s*school|middle\s*school|junior\s*high|\bloli(ta)?\b|\bshota\b|preteen|young\s*(girl|boy|teen|child)|youthful\s*face|young\s*slender/i;
  // "late teen(s)/teenage(r/s)" reads as 18-19 (adult), so exempt exactly that
  // phrasing: strip it before testing RX. Bare "teen", "teenage", "teenager",
  // "early/mid teens", "young teen", etc. still block. No lookbehind so this
  // works in every browser, fallbacks included.
  var LATE_TEEN_STRIP = /\blate\s+teen(s|age[rs]?)?\b/gi;
  function stripLateTeen(hay) { try { return String(hay || "").replace(LATE_TEEN_STRIP, " "); } catch (e) { return String(hay || ""); } }
  var USER_IDS = ["4fbab17196b080390f63f83ae1207d1999152aa2fa83170cd280bc1f1469f2d3"];

  window.__t2iChildSafety = { RX: RX, USER_IDS: USER_IDS, FILE: "mod-lists-v1", LATE_TEEN_STRIP: LATE_TEEN_STRIP, stripLateTeen: stripLateTeen };

  var ID_RE = /^[0-9a-f]{16,128}$/i;
  var LS_CACHE = "t2iModListsV1";
  var LS_EDITKEY = "t2iModEditKey";
  var TTL = 10 * 60 * 1000;

  var cache = { allowed: {}, bannedUsers: {}, bannedPhrases: [], ready: false, updatedAt: 0, source: "built-in" };

  function cleanIds(arr) {
    var out = {}, seen = {};
    if (!Array.isArray(arr)) return out;
    for (var i = 0; i < arr.length && Object.keys(out).length < 2000; i++) {
      var s = String(arr[i] || "").trim().toLowerCase();
      if (ID_RE.test(s) && !seen[s]) { seen[s] = 1; out[s] = 1; }
    }
    return out;
  }
  function cleanPhrases(arr) {
    var out = [], seen = {};
    if (!Array.isArray(arr)) return out;
    for (var i = 0; i < arr.length && out.length < 500; i++) {
      var s = String(arr[i] || "").trim();
      if (s && s.length <= 120 && !seen[s.toLowerCase()]) { seen[s.toLowerCase()] = 1; out.push(s); }
    }
    return out;
  }
  function applyRules(rules, source) {
    cache.allowed = cleanIds(rules && rules.allowed);
    cache.bannedUsers = cleanIds(rules && rules.bannedUsers);
    cache.bannedPhrases = cleanPhrases(rules && rules.bannedPhrases);
    cache.ready = true;
    cache.updatedAt = (rules && Number(rules.updatedAt)) || 0;
    cache.source = source || "shared";
    try { localStorage.setItem(LS_CACHE, JSON.stringify({ allowed: Object.keys(cache.allowed), bannedUsers: Object.keys(cache.bannedUsers), bannedPhrases: cache.bannedPhrases, updatedAt: cache.updatedAt, savedAt: Date.now() })); } catch (e) {}
    try { document.dispatchEvent(new CustomEvent("t2i-mod-ready")); } catch (e) {}
    return cache;
  }

  function sharedUrl() {
    try { return "https://editable.uploads.dev/file/" + window.generatorName + "/mod-lists-v1"; } catch (e) { return null; }
  }

  var pending = null;
  window.__t2iModLoad = function () {
    if (pending) return pending;
    pending = (async function () {
      try {
        var raw = null;
        try { raw = localStorage.getItem(LS_CACHE); } catch (e) {}
        if (raw) {
          try {
            var o = JSON.parse(raw);
            if (o && Date.now() - (o.savedAt || 0) < TTL) {
              applyRules(o, "shared-cache");
              pending = null;
              return cache;
            }
          } catch (e) {}
        }
      } catch (e) {}
      var url = sharedUrl();
      if (!url) { pending = null; return cache; }
      try {
        var ctrl = new AbortController();
        var to = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 8000);
        var resp = await fetch(url, { signal: ctrl.signal });
        clearTimeout(to);
        if (resp.status === 404) { cache.ready = true; cache.source = "empty"; pending = null; return cache; }
        if (!resp.ok) throw new Error("http " + resp.status);
        var rules = await resp.json();
        if (!rules || typeof rules !== "object" || rules.v !== 1) throw new Error("bad shape");
        applyRules(rules, "shared");
      } catch (e) {
        if (!cache.ready) { cache.ready = true; cache.source = "built-in"; }
      }
      pending = null;
      return cache;
    })();
    return pending;
  };

  function snippet(hay) {
    try {
      var m = String(stripLateTeen(hay)).match(RX);
      if (!m) return "";
      var s = String(m[0]);
      return s.length > 40 ? s.slice(0, 40) + "…" : s;
    } catch (e) { return ""; }
  }

  // Returns {blocked:boolean, reason:string|null}. Owner allowlist wins over everything.
  window.__t2iModMatch = function (it) {
    it = it || {};
    var id = String(it.id || "").toLowerCase();
    var uid = String(it.userId || "").toLowerCase();
    var hay = String(it.title || "") + "\n" + String(it.prompt || "");
    if (id && cache.allowed[id]) return { blocked: false, reason: "owner-approved" };
    if (uid && cache.bannedUsers[uid]) return { blocked: true, reason: "banned user " + uid.slice(0, 8) };
    for (var i = 0; i < USER_IDS.length; i++) {
      if (uid && uid === USER_IDS[i]) return { blocked: true, reason: "known offender " + uid.slice(0, 8) };
    }
    for (var j = 0; j < cache.bannedPhrases.length; j++) {
      var p = cache.bannedPhrases[j];
      if (p && hay.toLowerCase().indexOf(String(p).toLowerCase()) !== -1) {
        return { blocked: true, reason: 'banned phrase "' + String(p).slice(0, 40) + '"' };
      }
    }
    if (RX.test(stripLateTeen(hay))) return { blocked: true, reason: 'minor-age term "' + snippet(hay) + '"' };
    return { blocked: false, reason: null };
  };

  window.__t2iMod = cache;

  // Owner-only write. Requires the unlocked console (possession of the editKey,
  // which only the owner's browser holds, authorizes the write server-side).
  // mut: {allow:[], unallow:[], banUsers:[], unbanUsers:[], banPhrases:[], unbanPhrases:[]}
  window.__t2iModSave = async function (mut) {
    mut = mut || {};
    try { if (typeof window.__t2iIsOwnerAuthed !== "function" || !window.__t2iIsOwnerAuthed()) throw new Error("locked"); } catch (e) { throw new Error("locked"); }
    if (!window.root || !root.uploadPlugin || !root.uploadPlugin.editable) throw new Error("no_plugin");
    await window.__t2iModLoad();
    function asSet(o) { var s = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) s[k] = 1; return s; }
    var allowed = asSet(cache.allowed), users = asSet(cache.bannedUsers);
    var phrases = cache.bannedPhrases.slice();
    function addIds(set, arr, cap) {
      arr = Array.isArray(arr) ? arr : [];
      for (var i = 0; i < arr.length; i++) {
        var s = String(arr[i] || "").trim().toLowerCase();
        if (ID_RE.test(s)) set[s] = 1;
      }
      var ks = Object.keys(set);
      if (ks.length > cap) { var drop = ks.length - cap; for (var j = 0; j < drop; j++) delete set[ks[j]]; }
    }
    addIds(allowed, mut.allow, 2000);
    addIds(users, mut.banUsers, 500);
    (Array.isArray(mut.unallow) ? mut.unallow : []).forEach(function (x) { delete allowed[String(x || "").trim().toLowerCase()]; });
    (Array.isArray(mut.unbanUsers) ? mut.unbanUsers : []).forEach(function (x) { delete users[String(x || "").trim().toLowerCase()]; });
    var phraseSeen = {};
    phrases.forEach(function (p) { phraseSeen[String(p).toLowerCase()] = 1; });
    (Array.isArray(mut.banPhrases) ? mut.banPhrases : []).forEach(function (p) {
      var s = String(p || "").trim();
      if (s && s.length <= 120 && !phraseSeen[s.toLowerCase()] && phrases.length < 500) { phraseSeen[s.toLowerCase()] = 1; phrases.push(s); }
    });
    (Array.isArray(mut.unbanPhrases) ? mut.unbanPhrases : []).forEach(function (p) {
      var k = String(p || "").trim().toLowerCase();
      phrases = phrases.filter(function (x) { return String(x).toLowerCase() !== k; });
    });
    var payload = JSON.stringify({ v: 1, allowed: Object.keys(allowed), bannedUsers: Object.keys(users), bannedPhrases: phrases, updatedAt: Date.now(), updatedBy: "owner-console" });
    var editKey = null;
    try { editKey = localStorage.getItem(LS_EDITKEY) || null; } catch (e) {}
    var r = await root.uploadPlugin.editable.set("mod-lists-v1", payload, editKey ? { editKey: editKey } : {});
    if (r && r.error) {
      if (r.error === "editable_requires_saved_generator") throw new Error("unsaved — save the generator once, then retry");
      throw new Error(r.error);
    }
    if (r && r.editKey) { try { localStorage.setItem(LS_EDITKEY, r.editKey); } catch (e) {} }
    applyRules(JSON.parse(payload), "shared");
    return { ok: true, editCount: r && r.editCount };
  };

  window.__t2iModEditKeyBackup = function () {
    try { return localStorage.getItem(LS_EDITKEY) || ""; } catch (e) { return ""; }
  };
})();
