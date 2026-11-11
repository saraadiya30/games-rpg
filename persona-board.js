(function () {
  "use strict";
  var CHANNEL = "persona-board";
  var PREFIX = "PBOARD1:";
  var COOLDOWN_MS = 30000;
  var built = false;
  var items = [];
  var ctrl = null;
  var publishing = false;
  var lastPublishAt = 0;
  var search = "";
  var stats = { raw: 0, parsed: 0 };
  var localSuperseded = {};
  function isSuperseded(it) {
    if (it.meta && it.meta.retracted) return true;
    var f = it.meta && it.meta.file;
    if (!f) return false;
    if (localSuperseded[f]) return true;
    for (var i = 0; i < items.length; i++) {
      if (items[i] !== it && items[i].meta && items[i].meta.supersedes === f) return true;
    }
    return false;
  }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "pgen-toast"; document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2400);
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
        setTimeout(tick, 150);
      })();
    });
  }
  function b64e(s) { return btoa(unescape(encodeURIComponent(String(s)))); }
  function b64d(s) { return decodeURIComponent(escape(atob(String(s)))); }
  function uid() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function countWords(t) { t = String(t || "").trim(); return t ? t.split(/\s+/).length : 0; }
  function parseSections(text) {
    try {
      if (window.t2i_parsePersona) return (window.t2i_parsePersona(text || "").sections) || [];
    } catch (e) {}
    return [];
  }
  function secGet(sections) {
    var m = {};
    sections.forEach(function (s) {
      var k = String(s.heading || "").trim().toLowerCase();
      (m[k] || (m[k] = [])).push(s.content);
    });
    function get() {
      for (var i = 0; i < arguments.length; i++) {
        var k = String(arguments[i]).toLowerCase();
        if (m[k] && m[k].length) { var t = m[k].join("\n\n").trim(); if (t) return t; }
      }
      return "";
    }
    return { map: m, get: get };
  }
  function taglineOf(name, description) {
    var secs = parseSections(description);
    for (var i = 0; i < secs.length; i++) {
      if (String(secs[i].heading || "").trim().toLowerCase() === "tagline" && String(secs[i].content || "").trim()) {
        return String(secs[i].content).trim().split("\n")[0].slice(0, 160);
      }
    }
    return String(description || "").trim().split("\n")[0].slice(0, 160);
  }
  function flattenLorebook(lb) {
    if (!lb || !Array.isArray(lb.entries) || !lb.entries.length) return "";
    var lines = [];
    if (lb.name) lines.push("# " + lb.name);
    if (lb.description) lines.push(String(lb.description).trim());
    lb.entries.forEach(function (e) {
      if (!e || !String(e.content || "").trim()) return;
      lines.push("\n## " + (e.title || e.name || "Entry"));
      var keys = Array.isArray(e.keys) ? e.keys.join(", ") : "";
      if (keys) lines.push("Keys: " + keys);
      lines.push(String(e.content).trim());
    });
    return lines.join("\n").trim();
  }
  function downscale(dataUrl, max) {
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
            resolve(c.toDataURL("image/jpeg", 0.78));
          } catch (e) { resolve(dataUrl); }
        };
        img.onerror = function () { resolve(dataUrl); };
        img.src = dataUrl;
      } catch (e) { resolve(dataUrl); }
    });
  }
  function AVKind(url, hint) {
    try { if (window.AvatarMedia) return window.AvatarMedia.kindOf(url, hint); } catch (e) {}
    if (hint === "video") return "video";
    if (/^data:video\//i.test(String(url || ""))) return "video";
    if (/\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(String(url || ""))) return "video";
    return url ? "image" : "";
  }
  function AVThumb(url, cls, hint, poster) {
    try { if (window.AvatarMedia) return window.AvatarMedia.thumbHtml(url, cls, hint, poster); } catch (e) {}
    if (!url) return '<div class="' + cls + ' ' + cls + '-ph">🧑</div>';
    if (AVKind(url, hint) === "video") return '<video class="' + cls + '" src="' + esc(url) + '"' + (poster ? ' poster="' + esc(poster) + '"' : "") + ' muted loop playsinline autoplay preload="metadata"></video>';
    return '<img class="' + cls + '" loading="lazy" src="' + esc(url) + '" alt="">';
  }
  function chatAvatarFor(url, kind, poster) {
    if (AVKind(url, kind) === "video") return poster || "";
    return url || "";
  }
  async function dataUrlToBlob(dataUrl) {
    var r = await fetch(dataUrl);
    return await r.blob();
  }
  function parseItem(c) {
    try {
      if (!c || typeof c.message !== "string") return null;
      var t = c.message.trim();
      if (t.indexOf(PREFIX) !== 0) return null;
      var meta = JSON.parse(b64d(t.slice(PREFIX.length)));
      if (!meta || meta.v !== 1 || !meta.file || !meta.name) return null;
      var nick = "";
      try { nick = (c.user && c.user.nickname) || ""; } catch (e) {}
      return { meta: meta, nick: String(nick).slice(0, 40), time: c.time || 0 };
    } catch (e) { return null; }
  }
  function mountFeed() {
    if (ctrl || !(window.root && window.root.commentsPlugin)) return;
    if (!$("pbd-hidden")) return;
    try {
      ctrl = window.root.commentsPlugin({
        channel: CHANNEL,
        width: 10,
        height: 10,
        hideComments: true,
        hideSettingsButton: true,
        hideFullscreenButton: true,
        replacedDuringUpdate: true,
        rateLimits: "2 per minute, 5 per 10 minutes",
        containerStyle: "position:relative; width:10px; height:10px; opacity:0; pointer-events:none; overflow:hidden;",
        onLoad: function (comments) {
          stats.raw = (comments || []).length;
          items = (comments || []).map(parseItem).filter(Boolean);
          stats.parsed = items.length;
          render();
        },
        onComment: function (c) {
          var it = parseItem(c);
          if (!it) return;
          if (!items.some(function (x) { return x.meta.file === it.meta.file; })) items.push(it);
          render();
        }
      });
      $("pbd-hidden").innerHTML = String(ctrl);
    } catch (e) { ctrl = null; }
  }
  function filtered() {
    var q = search.trim().toLowerCase();
    var list = items.filter(function (it) { return !isSuperseded(it); }).sort(function (a, b) { return (b.time || 0) - (a.time || 0); });
    if (!q) return list;
    return list.filter(function (it) {
      return (it.meta.name + " " + (it.meta.tagline || "")).toLowerCase().indexOf(q) !== -1;
    });
  }
  function fmtDate(t) {
    try { return new Date(t).toLocaleDateString(); } catch (e) { return ""; }
  }
  var thumbCache = {};
  var thumbFetching = {};
  function backfillAvatar(it, card) {
    var file = it.meta && it.meta.file;
    if (!file) return;
    function swap(t, kind, poster) {
      try {
        var ph = card.querySelector(".pbd-ph");
        if (!ph) return;
        var tmp = document.createElement("div");
        tmp.innerHTML = AVThumb(t, "pbd-thumb", kind, poster);
        var el = tmp.firstChild;
        if (el) ph.replaceWith(el);
      } catch (e) {}
    }
    if (thumbCache[file]) {
      var cc = thumbCache[file];
      if (cc && typeof cc === "object") swap(cc.url, cc.kind, cc.poster);
      else swap(cc);
      return;
    }
    if (thumbFetching[file]) return;
    thumbFetching[file] = true;
    fetchBody(it).then(function (body) {
      thumbFetching[file] = false;
      var t = body && body.thumb;
      if (!t) return;
      var k = (body && (body.thumbKind || body.kind)) || AVKind(t);
      var p = (body && (body.thumbPoster || body.poster)) || (it.meta && (it.meta.avatarPoster || it.meta.poster)) || "";
      thumbCache[file] = { url: t, kind: k, poster: p };
      try {
        var host = $("pbd-grid");
        if (!host) return;
        Array.prototype.forEach.call(host.querySelectorAll('.pbd-card'), function (c) {
          if (c.getAttribute("data-bfile") !== file) return;
          var ph2 = c.querySelector(".pbd-ph");
          if (!ph2) return;
          var tmp2 = document.createElement("div");
          tmp2.innerHTML = AVThumb(t, "pbd-thumb", k, p);
          var el2 = tmp2.firstChild;
          if (el2) ph2.replaceWith(el2);
        });
      } catch (e) {}
    }).catch(function () { thumbFetching[file] = false; });
  }
  function render() {
    var host = $("pbd-grid");
    if (!host) return;
    var badge = $("pbd-count");
    if (badge) badge.textContent = String(items.length);
    var list = filtered();
    host.innerHTML = "";
    if (!ctrl) {
      host.innerHTML = '<div class="pgen-empty">Connecting to the community board…</div>';
      return;
    }
    if (!list.length) {
      host.innerHTML = '<div class="pgen-empty">' + (items.length ? "No personas match your search." : "Nothing shared yet — publish the first persona above.") + "</div>";
      return;
    }
    list.forEach(function (it) {
      var card = document.createElement("div");
      card.className = "pbd-card";
      if (it.meta.file) card.setAttribute("data-bfile", it.meta.file);
      var cached = (!it.meta.avatar && it.meta.file && thumbCache[it.meta.file]) ? thumbCache[it.meta.file] : "";
      var cachedUrl = (cached && typeof cached === "object") ? cached.url : cached;
      var cachedKind = (cached && typeof cached === "object") ? cached.kind : AVKind(cachedUrl);
      var cachedPoster = (cached && typeof cached === "object") ? cached.poster : "";
      var av = it.meta.avatar
        ? AVThumb(it.meta.avatar, "pbd-thumb", it.meta.avatarKind || it.meta.kind, it.meta.avatarPoster || it.meta.poster)
        : cachedUrl
        ? AVThumb(cachedUrl, "pbd-thumb", cachedKind, cachedPoster)
        : '<div class="pbd-thumb pbd-ph">🧑</div>';
      var hasImg = !!(it.meta.avatar || cached);
      var metaBits = [];
      if (it.meta.rating && it.meta.rating !== "sfw") metaBits.push(esc(it.meta.rating));
      if (it.time) metaBits.push(esc(fmtDate(it.time)));
      if (it.nick) metaBits.push("by " + esc(it.nick));
      card.innerHTML =
        av +
        '<div class="pbd-main"><div class="pbd-name">' + esc(it.meta.name) + "</div>" +
        (it.meta.tagline ? '<div class="pbd-tag">' + esc(it.meta.tagline) + "</div>" : "") +
        (metaBits.length ? '<div class="pbd-meta">' + metaBits.join(" · ") + "</div>" : "") +
        '<div class="pbd-acts">' +
        '<button type="button" class="pro-btn pro-btn-primary" data-act="chat">💬 Use in AI Chat</button>' +
        '<button type="button" class="pro-btn" data-act="edit" title="Load into 🧑 Persona Generator for further editing">🧑 Edit in generator</button>' +
        '<button type="button" class="pro-btn" data-act="tavern">⬇️ Download</button>' +
        '<button type="button" class="pro-btn" data-act="md">📝 .md</button>' +
        (hasImg ? "" : '<button type="button" class="pro-btn" data-act="fix" title="Restore this character\'s picture: uses your matching saved persona, or paints a fresh portrait">🖼️ Set image</button>') +
        "</div></div>";
      card.querySelector('[data-act="chat"]').addEventListener("click", function () { chatWith(it, this); });
      card.querySelector('[data-act="edit"]').addEventListener("click", function () { editInGenerator(it, this); });
      card.querySelector('[data-act="tavern"]').addEventListener("click", function () { downloadTavern(it, this); });
      card.querySelector('[data-act="md"]').addEventListener("click", function () { downloadMd(it, this); });
      var fixBtn = card.querySelector('[data-act="fix"]');
      if (fixBtn) fixBtn.addEventListener("click", function () { repairImage(it, this); });
      var im = card.querySelector("img.pbd-thumb, video.pbd-thumb");
      if (im) im.addEventListener("error", function () {
        try {
          var d = document.createElement("div");
          d.className = "pbd-thumb pbd-ph"; d.textContent = "🧑";
          im.replaceWith(d);
        } catch (e) {}
      });
      host.appendChild(card);
      if (!it.meta.avatar) backfillAvatar(it, card);
    });
  }
  async function fetchBody(it) {
    var r = await fetch(it.meta.file, { credentials: "omit" });
    if (!r.ok) throw new Error("file gone (" + r.status + ")");
    var body = await r.json();
    if (!body || typeof body !== "object" || !body.description) throw new Error("bad file");
    return body;
  }
  function buildTavern(body) {
    var name = body.name || "Untitled";
    var sg = secGet(parseSections(body.description || ""));
    var tag = sg.get("tagline");
    var visual = sg.get("visual description");
    var personality = ["personality", "voice & mannerisms", "voice and mannerisms", "habits & quirks", "habits and quirks", "likes & dislikes", "likes and dislikes", "goals, fears & desires", "goals, fears and desires", "goals", "a secret", "secret"].map(function (h) { return sg.get(h); }).filter(Boolean).join("\n\n");
    var scenario = ["scenario", "relationship with {{user}}", "relationship with {user}", "relationship", "backstory"].map(function (h) { return sg.get(h); }).filter(Boolean).join("\n\n");
    var opening = sg.get("opening line", "opening", "first message", "greeting");
    var examples = sg.get("roleplay behavior examples", "roleplay examples", "behavior examples", "examples");
    var sysPrompt = sg.get("system prompt");
    var postHist = sg.get("post-history instructions", "post history instructions");
    var loreTxt = flattenLorebook(body.lorebook) || sg.get("lorebook", "world info", "worldinfo");
    var used = { tagline: 1, "visual description": 1, personality: 1, "voice & mannerisms": 1, "voice and mannerisms": 1, "habits & quirks": 1, "habits and quirks": 1, "likes & dislikes": 1, "likes and dislikes": 1, "goals, fears & desires": 1, "goals, fears and desires": 1, goals: 1, "a secret": 1, secret: 1, scenario: 1, "relationship with {{user}}": 1, "relationship with {user}": 1, relationship: 1, backstory: 1, "opening line": 1, opening: 1, "first message": 1, greeting: 1, "roleplay behavior examples": 1, "roleplay examples": 1, "behavior examples": 1, examples: 1, "system prompt": 1, "post-history instructions": 1, "post history instructions": 1, lorebook: 1, "world info": 1, worldinfo: 1 };
    var leftover = [];
    Object.keys(sg.map).forEach(function (k) {
      if (used[k]) return;
      var t = sg.map[k].join("\n\n").trim();
      if (t) leftover.push("# " + k + ":\n" + t);
    });
    var raw = String(body.description || "");
    var card = {
      name: name,
      description: [tag, visual].filter(Boolean).join("\n\n") || raw.slice(0, 2000),
      personality: personality,
      scenario: scenario,
      first_mes: opening,
      mes_example: examples,
      creator_notes: ["Shared from the All-in-One AI Studio Persona Board."].concat(loreTxt ? ["Lorebook:\n" + loreTxt] : []).concat(leftover).join("\n\n"),
      tags: [],
      character_book: (body.lorebook && body.lorebook.entries && body.lorebook.entries.length)
        ? { name: body.lorebook.name || name, description: body.lorebook.description || "", entries: body.lorebook.entries.map(function (e) { return { name: e.title || e.name || "Entry", keys: e.keys || [], content: e.content || "" }; }) }
        : null
    };
    if (sysPrompt) card.system_prompt = sysPrompt;
    if (postHist) card.post_history_instructions = postHist;
    var _tk = (body && (body.thumbKind || body.kind)) || AVKind(body.thumb);
    if (_tk === "video") {
      var _poster = (body && (body.thumbPoster || body.poster)) || "";
      if (_poster && /^data:/i.test(_poster)) card.avatar = _poster;
      if (body.thumb && /^https?:/i.test(body.thumb)) card.creator_notes = (card.creator_notes ? card.creator_notes + "\n\n" : "") + "Avatar video: " + body.thumb;
    } else if (body.thumb && /^data:/i.test(body.thumb)) card.avatar = body.thumb;
    return card;
  }
  function saveBlob(blob, filename) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function safeName(n) {
    return String(n || "persona").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 40) || "persona";
  }
  async function downloadTavern(it, btn) {
    var label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "⏳…"; }
    try {
      var body = await fetchBody(it);
      saveBlob(new Blob([JSON.stringify(buildTavern(body), null, 2)], { type: "application/json;charset=utf-8" }), safeName(body.name) + ".tavern.json");
      toast("📥 Tavern card downloaded");
    } catch (e) { toast("⚠️ download failed"); }
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
  async function downloadMd(it, btn) {
    var label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "⏳…"; }
    try {
      var body = await fetchBody(it);
      var md = "# " + (body.name || "Untitled") + "\n\n" + String(body.description || "").replace(/^# \{\{char\}\} /gm, "## ") + "\n";
      var loreTxt = flattenLorebook(body.lorebook);
      if (loreTxt && !/# \{\{char\}\} lorebook/i.test(String(body.description || ""))) md += "\n# Lorebook\n\n" + loreTxt + "\n";
      saveBlob(new Blob([md], { type: "text/markdown;charset=utf-8" }), safeName(body.name) + ".md");
      toast("📝 .md downloaded");
    } catch (e) { toast("⚠️ download failed"); }
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
  async function chatWith(it, btn) {
    var label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "⏳…"; }
    try {
      var body = await fetchBody(it);
      var name = body.name || "Character";
      var description = String(body.description || "").trim();
      if (!description) throw new Error("empty");
      var rawAvatar = it.meta.avatar || body.thumb || "";
      var rawKind = it.meta.avatarKind || it.meta.kind || body.thumbKind || body.kind || "";
      var rawPoster = it.meta.avatarPoster || it.meta.poster || body.thumbPoster || body.poster || "";
      var avatar = chatAvatarFor(rawAvatar, rawKind, rawPoster);
      var loreTxt = flattenLorebook(body.lorebook);
      var roleInstruction = "# Description of " + name + ":\n" + description + (loreTxt ? "\n\n# Lorebook:\n" + loreTxt : "") + "\n\n# Roleplay Guidelines:\n- Bring characters to life by realistically portraying their unique traits, thoughts, emotions, appearances, physical sensations, speech patterns, and tone. Consider the situation, characters' motivations, and potential consequences.\n- Ensure that their reactions, interactions, and decision-making align with their established personalities/descriptions, values, goals, and fears. You must **ALWAYS** maintain accurate character portrayals.\n\nCreatively improvise this fictional roleplay between {{char}} and {{user}} to create an interesting and engaging experience/story/chat, no matter where {{user}} decides to lead it. The overall goal is to create a genuinely fascinating and engaging roleplay/story. So good that you can't stop reading. Be proactive, introducing new events, proposing new conversation topics, and leading the role-play in new, interesting directions when appropriate to keep the overall experience engaging.".trim();
      try {
        if (window.t2i_dynamicBondEnabled && window.t2i_dynamicBondEnabled() && window.t2i_dynamicBondBlock) {
          roleInstruction += "\n\n" + window.t2i_dynamicBondBlock();
        }
      } catch (e) {}
      var json = {
        addCharacter: {
          name: name,
          roleInstruction: roleInstruction,
          maxParagraphCountPerMessage: 2,
          imagePromptSuffix: "",
          initialMessages: [{ author: "system", content: '<i style="font-size:85%;">Introduce yourself to ' + esc(name) + ".</i>", hiddenFrom: ["ai"] }],
          avatar: { url: avatar, size: 1, shape: "square" }
        },
        quickAdd: true
      };
      if (!avatar) throw new Error("no avatar");
      if (window.ensureGallery) window.ensureGallery();
      var ok = await waitFor(function () { return typeof window.t2i_generateShareLinkForCharacter === "function" && window.t2i_generateShareLinkForCharacter.__t2iCustomChat; }, 12000);
      if (ok) {
        await window.t2i_generateShareLinkForCharacter(json);
        toast("✅ pick a chat — “" + name + "” is ready");
      } else if (typeof window.__nexoraChatAddCharacter === "function") {
        window.__nexoraChatAddCharacter(buildHash(json), chatTarget());
        toast("✅ opening “" + name + "” in AI Chat");
      } else {
        throw new Error("chat handoff not ready");
      }
    } catch (e) { toast("⚠️ " + (e && e.message ? e.message : "chat handoff failed")); }
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
  async function editInGenerator(it, btn) {
    var label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "⏳…"; }
    try {
      var body = await fetchBody(it);
      var description = String(body.description || "").trim();
      if (!description) throw new Error("empty persona");
      // Don't silently wipe the generator's working copy — confirm first when
      // it holds something different (skipped when the editor was never opened).
      try {
        if (typeof window.__personaCurrent === "function") {
          var cur = window.__personaCurrent();
          var curDesc = cur ? String(cur.description || "").trim() : "";
          if (curDesc && curDesc !== description) {
            if (!(await window.uiConfirm("Replace the Persona Generator's current text with “" + (body.name || "Character") + "” from the board? Unsaved edits there will be lost.", { okText: "Load into generator" }))) {
              if (btn) { btn.disabled = false; btn.textContent = label; }
              return;
            }
          }
        }
      } catch (e) {}
      if (window.showTab) window.showTab("persona");
      var ok = await waitFor(function () { return typeof window.__personaLoadExternal === "function"; }, 12000);
      if (!ok) throw new Error("generator not ready");
      window.__personaLoadExternal({
        name: body.name || "Character",
        description: body.description || "",
        thumb: body.thumb || "",
        thumbKind: body.thumbKind || body.kind || "",
        thumbPoster: body.thumbPoster || body.poster || "",
        lorebook: body.lorebook || null
      });
      toast("🧑 “" + (body.name || "Character") + "” loaded in Persona Generator");
    } catch (e) { toast("⚠️ " + (e && e.message ? e.message : "handoff failed")); }
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
  async function currentPersona() {
    try {
      if (typeof window.__personaCurrent === "function") {
        var p = window.__personaCurrent();
        if (p && String(p.description || "").trim()) return { name: p.name || "Untitled", description: p.description, thumb: p.thumb || "", thumbKind: p.thumbKind || "", thumbPoster: p.thumbPoster || "", lorebook: p.lorebook || null, tone: p.tone || "auto", rating: p.rating || "sfw" };
      }
    } catch (e) {}
    return null;
  }
  async function savedPersonas() {
    try {
      if (typeof window.__personaListSaved === "function") {
        var list = await window.__personaListSaved();
        return (list || []).filter(function (p) { return p && String(p.description || "").trim(); });
      }
    } catch (e) {}
    return [];
  }
  var srcSeq = 0;
  async function refreshSources() {
    var my = ++srcSeq;
    var sel = $("pbd-source");
    if (!sel) return;
    var cur = await currentPersona();
    if (my !== srcSeq) return;
    var saved = await savedPersonas();
    if (my !== srcSeq || !$("pbd-source")) return;
    sel = $("pbd-source");
    sel.innerHTML = "";
    var o0 = document.createElement("option");
    o0.value = "current";
    o0.textContent = cur ? "🧑 Current editor persona — " + (cur.name || "Untitled") + " (" + countWords(cur.description) + " words)" : "🧑 Current editor persona (empty — generate one first)";
    if (!cur) o0.disabled = true;
    sel.appendChild(o0);
    saved.forEach(function (p) {
      var o = document.createElement("option");
      o.value = "saved:" + p.id;
      var n = (p.lorebook && p.lorebook.entries && p.lorebook.entries.length) ? " · 📖" + p.lorebook.entries.length : "";
      o.textContent = "🗃️ " + (p.name || "Untitled") + " (" + countWords(p.description) + " words" + n + ")";
      sel.appendChild(o);
    });
    if (!cur && !saved.length) {
      var o = document.createElement("option");
      o.value = "";
      o.textContent = "No personas yet — build one in 🧑 Persona Generator first";
      sel.appendChild(o);
    }
  }
  async function collectSource() {
    var sel = $("pbd-source");
    var v = sel ? sel.value : "current";
    if (!v) return null;
    if (v === "current") return await currentPersona();
    if (v.indexOf("saved:") === 0) {
      var id = v.slice(6);
      var saved = await savedPersonas();
      for (var i = 0; i < saved.length; i++) {
        if (saved[i].id === id) {
          return { name: saved[i].name || "Untitled", description: saved[i].description, thumb: saved[i].thumb || "", thumbKind: saved[i].thumbKind || "", thumbPoster: saved[i].thumbPoster || "", lorebook: saved[i].lorebook || null, tone: saved[i].tone || "auto", rating: saved[i].rating || "sfw" };
        }
      }
    }
    return null;
  }
  // ---------- image identity (anti-reupload) ----------
  // A persona whose portrait is already on the board can't be shared again,
  // even if its text was edited. Identity is two-fold: SHA-256 of the image
  // bytes (catches exact re-uploads — re-encoding the same pixels through the
  // same JPEG downscale is byte-deterministic) plus a 64-bit average hash
  // (catches the same picture that travelled a different downscale path,
  // e.g. a saved-library thumb vs the board avatar). New publishes store both
  // as meta.imgSha/meta.imgA so future checks are instant; legacy entries are
  // hashed on demand (fetched bytes → blob URL, so the canvas stays clean)
  // and cached per file for the session.
  var AHASH_MAX_DIST = 2;
  var imgIdCache = {};
  function hexOfBytes(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) {
      var h = bytes[i].toString(16);
      s += h.length < 2 ? "0" + h : h;
    }
    return s;
  }
  function b64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function sha256Hex(bytes) {
    try {
      if (!(window.crypto && window.crypto.subtle)) return null;
      var d = await window.crypto.subtle.digest("SHA-256", bytes);
      return hexOfBytes(new Uint8Array(d));
    } catch (e) { return null; }
  }
  async function thumbBytes(thumb) {
    try {
      var t = String(thumb || "");
      if (!t) return null;
      var m = t.match(/^data:[^,]*;base64,(.*)$/);
      if (m) { try { return b64ToBytes(m[1]); } catch (e) { return null; } }
      if (/^data:/i.test(t)) return null; // non-base64 data URL — no reliable bytes
      var r = await fetch(t, { credentials: "omit" });
      if (!r.ok) return null;
      return new Uint8Array(await r.arrayBuffer());
    } catch (e) { return null; }
  }
  function guessMime(thumb, bytes) {
    var t = String(thumb || "");
    var m = t.match(/^data:([^;,]+)/);
    if (m) return m[1];
    if (bytes && bytes.length > 1) {
      if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
      if (bytes[0] === 0xFF && bytes[1] === 0xD8) return "image/jpeg";
      if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
      if (bytes[0] === 0x52 && bytes[1] === 0x49) return "image/webp";
    }
    return "image/jpeg";
  }
  function drawAHash(img) {
    try {
      var c = document.createElement("canvas");
      c.width = 8; c.height = 8;
      var g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0, 8, 8);
      var d = g.getImageData(0, 0, 8, 8).data;
      var vals = [], sum = 0, i, k, b;
      for (i = 0; i < 64; i++) {
        var v = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000;
        vals.push(v); sum += v;
      }
      var avg = sum / 64, out = "";
      for (k = 0; k < 16; k++) {
        var nib = 0;
        for (b = 0; b < 4; b++) if (vals[k * 4 + b] >= avg) nib |= (1 << (3 - b));
        out += nib.toString(16);
      }
      return out;
    } catch (e) { return null; } // tainted canvas etc.
  }
  function loadImg(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }
  async function aHashOfBytes(bytes, mime) {
    var blobUrl = null;
    try {
      var blob;
      try { blob = new Blob([bytes], { type: mime || "image/jpeg" }); }
      catch (e) { blob = new Blob([bytes]); }
      blobUrl = URL.createObjectURL(blob);
      var img = await loadImg(blobUrl);
      if (!img) return null;
      return drawAHash(img);
    } catch (e) { return null; }
    finally { if (blobUrl) { try { URL.revokeObjectURL(blobUrl); } catch (e2) {} } }
  }
  async function imageIdentity(thumb) {
    // { sha, a } for an image thumb; null when unreadable (caller skips the check).
    if (/^data:video\//i.test(String(thumb || ""))) {
      var vb = await thumbBytes(thumb);
      if (!vb || !vb.length) return null;
      var vs = await sha256Hex(vb);
      return vs ? { sha: vs, a: null } : null;
    }
    var bytes = await thumbBytes(thumb);
    if (!bytes || !bytes.length) return null;
    var sha = await sha256Hex(bytes);
    var a = null;
    try { a = await aHashOfBytes(bytes, guessMime(thumb, bytes)); } catch (e) { a = null; }
    if (!sha && !a) return null;
    return { sha: sha, a: a };
  }
  function hammingDist(h1, h2) {
    if (!h1 || !h2 || h1.length !== h2.length) return 99;
    var n = 0;
    for (var i = 0; i < h1.length; i++) {
      var x = parseInt(h1[i], 16) ^ parseInt(h2[i], 16);
      while (x) { n += x & 1; x >>= 1; }
    }
    return n;
  }
  function sameImage(idA, idB) {
    if (!idA || !idB) return false;
    if (idA.sha && idB.sha && idA.sha === idB.sha) return true;
    if (idA.a && idB.a && hammingDist(idA.a, idB.a) <= AHASH_MAX_DIST) return true;
    return false;
  }
  async function boardIdentity(it) {
    var f = it && it.meta && it.meta.file;
    if (!f) return null;
    if (imgIdCache[f] !== undefined) return imgIdCache[f];
    var id = null;
    try {
      if (it.meta.imgSha || it.meta.imgA) {
        id = { sha: it.meta.imgSha || null, a: it.meta.imgA || null };
      } else {
        var url = it.meta.avatar || "";
        var kind = it.meta.avatarKind || it.meta.kind || "";
        if (kind === "video" || /^data:video\//i.test(url)) {
          var vbytes = url ? await thumbBytes(url) : null;
          var vsha = vbytes ? await sha256Hex(vbytes) : null;
          var pa = null;
          var poster = it.meta.avatarPoster || it.meta.poster || "";
          if (poster) {
            var pbytes = await thumbBytes(poster);
            if (pbytes) pa = await aHashOfBytes(pbytes, guessMime(poster, pbytes));
          }
          id = (vsha || pa) ? { sha: vsha, a: pa } : null;
        } else if (url) {
          id = await imageIdentity(url);
        }
        if (!id) {
          try {
            var body = await fetchBody(it);
            if (body && body.thumb) id = await imageIdentity(body.thumb);
          } catch (e) {}
        }
      }
    } catch (e) { id = null; }
    imgIdCache[f] = id;
    return id;
  }
  async function findImageDuplicate(thumb, kindHint, posterHint, excludeFile) {
    var t = String(thumb || "");
    if (!t) return null;
    var isVid = kindHint === "video" || /^data:video\//i.test(t);
    var cand;
    if (isVid) {
      var vbytes = await thumbBytes(t);
      cand = { sha: vbytes ? await sha256Hex(vbytes) : null, a: null, url: (/^https?:/i.test(t) ? t : null) };
      if (!cand.sha && !cand.url) {
        if (posterHint) {
          var pbytes = await thumbBytes(posterHint);
          var pah = pbytes ? await aHashOfBytes(pbytes, guessMime(posterHint, pbytes)) : null;
          cand = pah ? { sha: null, a: pah, url: null } : null;
        } else cand = null;
      }
      if (!cand || (!cand.sha && !cand.a && !cand.url)) return null;
    } else {
      cand = await imageIdentity(t);
      if (!cand) {
        // Unreadable pixels (CORS etc.) — fall back to exact URL comparison only.
        if (!/^https?:/i.test(t)) return null;
        cand = { sha: null, a: null, url: t };
      } else cand.url = /^https?:/i.test(t) ? t : null;
    }
    var visible = items.filter(function (x) { return !isSuperseded(x); });
    var pend = [];
    for (var i = 0; i < visible.length; i++) {
      var m = visible[i].meta || {};
      if (m.file && m.file === excludeFile) continue;
      if (cand.url && m.avatar === cand.url) return visible[i];
      if (m.imgSha || m.imgA) {
        if (sameImage(cand, { sha: m.imgSha || null, a: m.imgA || null })) return visible[i];
      } else pend.push(visible[i]);
    }
    // Slow path: hash legacy entries without stored hashes (cached per file).
    var CONC = 4;
    for (var k = 0; k < pend.length; k += CONC) {
      var slice = pend.slice(k, k + CONC);
      var ids = await Promise.all(slice.map(boardIdentity));
      for (var q = 0; q < slice.length; q++) {
        if (ids[q] && sameImage(cand, ids[q])) return slice[q];
      }
    }
    return null;
  }
  async function publish(btn) {
    if (publishing) return;
    if (Date.now() - lastPublishAt < COOLDOWN_MS) { toast("⏳ one share at a time — wait a few seconds"); return; }
    if (!ctrl) { toast("⚠️ board still connecting — try again in a moment"); return; }
    if (!(window.root && window.root.uploadPlugin)) { toast("⚠️ uploader not available"); return; }
    var src = await collectSource();
    if (!src) { toast("⚠️ pick a persona to share first"); return; }
    var name = String(src.name || "").trim() || "Untitled";
    if (!src.thumb) {
      if (!(await window.uiConfirm("“" + name + "” has no portrait or reference image, so it will appear on the board without a picture. Share anyway?", { okText: 'Share anyway' }))) return;
    }
    publishing = true;
    var label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "⏳ uploading…"; }
    try {
      var thumb = src.thumb || "";
      var thumbKind = src.thumbKind || AVKind(thumb);
      var thumbPoster = src.thumbPoster || "";
      var isVid = thumbKind === "video" || /^data:video\//i.test(thumb);
      if (!isVid && /^blob:/i.test(thumb)) { try { thumb = await downscale(thumb, 512); } catch (e) {} }
      else if (!isVid && /^data:/i.test(thumb)) thumb = await downscale(thumb, 256);
      if (thumb) {
        // Re-upload guard: an identical portrait already on the board blocks
        // the share, even when the text was edited. Checked BEFORE uploading
        // so a refused share leaves no orphan files behind.
        if (btn) btn.textContent = "⏳ checking for re-upload…";
        var dup = null;
        try { dup = await findImageDuplicate(thumb, thumbKind, thumbPoster, null); } catch (e) { dup = null; }
        if (dup) {
          throw { reupload: true, name: (dup.meta && dup.meta.name) || "another persona" };
        }
        if (btn) btn.textContent = "⏳ uploading…";
      }
      var lb = null;
      try {
        if (src.lorebook && Array.isArray(src.lorebook.entries) && src.lorebook.entries.length) {
          lb = { name: String(src.lorebook.name || "").slice(0, 120), description: String(src.lorebook.description || "").slice(0, 2000), entries: src.lorebook.entries.slice(0, 500).map(function (e) { return { title: String(e.title || e.name || "").slice(0, 120), keys: (e.keys || []).slice(0, 20), content: String(e.content || "").slice(0, 4000) }; }).filter(function (e) { return e.content; }) };
          if (!lb.entries.length) lb = null;
        }
      } catch (e) { lb = null; }
      var body = { v: 1, name: name.slice(0, 80), tagline: taglineOf(name, src.description), description: String(src.description).slice(0, 300000), lorebook: lb, thumb: thumb, thumbKind: isVid ? "video" : (thumbKind || ""), thumbPoster: thumbPoster, tone: src.tone || "auto", rating: src.rating || "sfw", exportedAt: Date.now(), source: "persona-board" };
      var avatarUrl = await uploadThumb(thumb, isVid ? "video" : thumbKind);
      var avatarPosterUrl = "";
      if (isVid && thumbPoster && /^data:/i.test(thumbPoster)) {
        try {
          var pp = await window.root.uploadPlugin(await dataUrlToBlob(thumbPoster));
          if (pp && !pp.error && pp.url) avatarPosterUrl = pp.url;
        } catch (e) {}
      }
      var up = await window.root.uploadPlugin(JSON.stringify(body));
      if (!up || up.error || !up.url) throw new Error(up && up.error ? up.error : "upload failed");
      var candId = null;
      try { candId = thumb ? await imageIdentity(isVid && /^https?:/i.test(thumb) ? (avatarUrl || thumb) : thumb) : null; } catch (e) { candId = null; }
      var meta = { v: 1, name: body.name, tagline: body.tagline, file: up.url, avatar: avatarUrl, avatarKind: isVid ? "video" : (thumbKind || ""), avatarPoster: avatarPosterUrl || thumbPoster, rating: body.rating, imgSha: (candId && candId.sha) || "", imgA: (candId && candId.a) || "" };
      await Promise.resolve(ctrl.submit(PREFIX + b64e(JSON.stringify(meta))));
      lastPublishAt = Date.now();
      toast("🌍 “" + name + "” shared on the board");
    } catch (e) {
      if (e && e.reupload) toast("⛔ “" + name + "” uses the same portrait as “" + e.name + "” on the board — re-uploads aren't allowed, even with edited text. Change the portrait to share it as new.");
      else toast("⚠️ share failed: " + (e && e.message ? e.message : "unknown"));
    }
    publishing = false;
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
  async function uploadThumb(thumb, kindHint) {
    var avatarUrl = "";
    var vk = AVKind(thumb, kindHint);
    if (/^data:video/i.test(thumb) || /^blob:/i.test(thumb) || vk === "video") {
      var blob = null;
      try { blob = /^blob:/i.test(thumb) ? await (await fetch(thumb)).blob() : await dataUrlToBlob(thumb); } catch (e) { blob = null; }
      if (!blob) {
        try { blob = await (await fetch(thumb, { credentials: "omit" })).blob(); } catch (e) {}
      }
      if (blob) {
        try {
          var upv = await window.root.uploadPlugin(blob);
          if (upv && !upv.error && upv.url) avatarUrl = upv.url;
        } catch (e) {}
      }
      if (!avatarUrl && /^https?:/i.test(thumb)) avatarUrl = thumb;
      return avatarUrl;
    }
    if (/^data:image/i.test(thumb)) {
      try {
        var up1 = await window.root.uploadPlugin(await dataUrlToBlob(thumb));
        if (up1 && !up1.error && up1.url) avatarUrl = up1.url;
      } catch (e) {}
    } else if (/^https?:/i.test(thumb)) {
      try {
        var blob = await (await fetch(thumb, { credentials: "omit" })).blob();
        var up2 = await window.root.uploadPlugin(blob);
        if (up2 && !up2.error && up2.url) avatarUrl = up2.url;
      } catch (e) {}
      if (!avatarUrl) avatarUrl = thumb;
    }
    return avatarUrl;
  }
  function fileToDataUrl(file) {
    return new Promise(function (res, rej) {
      try {
        var fr = new FileReader();
        fr.onload = function () { res(fr.result); };
        fr.onerror = function () { rej(new Error("unreadable file")); };
        fr.readAsDataURL(file);
      } catch (e) { rej(e); }
    });
  }
  var repairMenu = null, repairMenuEsc = null;
  function closeRepairMenu() {
    if (repairMenuEsc) { document.removeEventListener("keydown", repairMenuEsc, true); repairMenuEsc = null; }
    if (repairMenu) { repairMenu.remove(); repairMenu = null; }
  }
  async function repairImage(it, btn) {
    if (!ctrl) { toast("⚠️ board still connecting — try again in a moment"); return; }
    if (!(window.root && window.root.uploadPlugin)) { toast("⚠️ uploader not available"); return; }
    closeRepairMenu();
    var label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "⏳ reading…"; }
    var body = null, localThumb = "", localKind = "", localPoster = "";
    try {
      body = await fetchBody(it);
      if (body.thumb) throw new Error("already has an image — it may just be loading");
      var want = String(body.name || it.meta.name || "").trim().toLowerCase();
      try {
        var cur = await currentPersona();
        if (cur && String(cur.name || "").trim().toLowerCase() === want && cur.thumb) { localThumb = cur.thumb; localKind = cur.thumbKind || ""; localPoster = cur.thumbPoster || ""; }
      } catch (e) {}
      if (!localThumb) {
        try {
          var saved = await savedPersonas();
          for (var i = 0; i < saved.length; i++) {
            if (String(saved[i].name || "").trim().toLowerCase() === want && saved[i].thumb) { localThumb = saved[i].thumb; localKind = saved[i].thumbKind || ""; localPoster = saved[i].thumbPoster || ""; break; }
          }
        } catch (e) {}
      }
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = label; }
      toast("⚠️ " + (e && e.message ? e.message : "repair failed"));
      return;
    }
    if (btn) { btn.disabled = false; btn.textContent = label; }
    var m = document.createElement("div");
    m.className = "pgen-port-menu";
    m.innerHTML =
      (localThumb ? '<button type="button" data-act="saved">🧑 Use saved portrait</button>' : "") +
      '<button type="button" data-act="gen">✨ Generate an image</button>' +
      '<button type="button" data-act="gallery">🖼️ Choose from gallery</button>' +
      '<button type="button" data-act="upload">⬆️ Upload an image</button>';
    document.body.appendChild(m);
    repairMenu = m;
    try {
      var r = btn.getBoundingClientRect();
      m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.left)) + "px";
      m.style.top = Math.min(window.innerHeight - m.offsetHeight - 8, r.bottom + 6) + "px";
    } catch (e) {}
    m.addEventListener("mousedown", function (e) { e.stopPropagation(); });
    m.querySelectorAll("button[data-act]").forEach(function (b) {
      b.addEventListener("click", function () {
        var act = b.getAttribute("data-act");
        closeRepairMenu();
        if (act === "saved") repairWithImage(it, btn, body, localThumb, localKind, localPoster);
        else if (act === "gen") repairGenerate(it, btn, body);
        else if (act === "gallery") repairFromGallery(it, btn, body);
        else if (act === "upload") repairUpload(it, btn, body);
      });
    });
    setTimeout(function () {
      document.addEventListener("mousedown", closeRepairMenu);
    }, 0);
    repairMenuEsc = function (e) { if (e.key === "Escape") { e.stopPropagation(); closeRepairMenu(); } };
    document.addEventListener("keydown", repairMenuEsc, true);
  }
  async function repairFromGallery(it, btn, body) {
    if (window.ensureGallery) window.ensureGallery();
    var ok = await waitFor(function () { return typeof window.t2iOpenGallery === "function"; }, 9000);
    if (!ok) { toast("⚠️ gallery still loading…"); return; }
    if (window.t2iLoadPeerGallery) { try { await window.t2iLoadPeerGallery(); } catch (e) {} }
    window.t2iOpenGallery({
      pick: {
        title: "🎨 Pick a portrait",
        hint: "Tap one image to use it as this character's picture.",
        addNoun: "as picture",
        onPick: function (items) {
          var pick = (items || []).filter(function (x) { return x && x.url; })[0];
          if (!pick) return;
          toast("🎨 picture picked from gallery");
          repairWithImage(it, btn, body, pick.url, pick.kind || pick.thumbKind || "", pick.poster || pick.thumbPoster || "");
        }
      }
    });
  }
  async function repairUpload(it, btn, body) {
    var inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*,video/*,.gif";
    inp.addEventListener("change", async function () {
      var file = inp.files && inp.files[0];
      if (!file) return;
      try {
        var isVid = file.type && /^video\//i.test(file.type);
        if (isVid && window.AvatarMedia) {
          var av = await window.AvatarMedia.fileToAvatar(file);
          toast("🎬 video uploaded");
          repairWithImage(it, btn, body, av.url, "video", av.poster || "");
        } else {
          var dataUrl = await fileToDataUrl(file);
          var big = await downscale(dataUrl, 1024);
          toast("🎨 picture uploaded");
          repairWithImage(it, btn, body, big);
        }
      } catch (e) {
        console.error(e);
        toast("⚠️ couldn't read that image");
      }
    });
    inp.click();
  }
  async function repairGenerate(it, btn, body) {
    if (!(window.root && window.root.generateImage)) { toast("⚠️ image generator not available"); return; }
    var label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "⏳ painting…"; }
    var stopFunny = (window.FunnyGen && window.FunnyGen.start) ? window.FunnyGen.start(function (line) { if (btn) btn.textContent = "⏳ " + line; }) : null;
    try {
      var secs = parseSections(body.description || "");
      var visual = "";
      for (var s = 0; s < secs.length; s++) {
        if (String(secs[s].heading || "").trim().toLowerCase() === "visual description" && String(secs[s].content || "").trim()) { visual = String(secs[s].content).trim(); break; }
      }
      var prompt = visual || String(body.description || "").split("\n")[0] || body.name || "character";
      if (body.name) prompt = prompt + ". Character portrait of " + body.name;
      var hqPrompt = prompt + ", highly detailed professional character portrait, sharp focus, intricate details, masterpiece, ultra high quality, 4k";
      var res = await window.root.generateImage(hqPrompt, { resolution: "768x768", guidanceScale: 8, negativePrompt: "blurry, low quality, distorted, deformed, low-res, pixelated", hideGalleryButtons: true });
      var dataUrl = (res && res.dataUrl) || "";
      if (!dataUrl) throw new Error("portrait generation failed");
      toast("🎨 portrait ready");
      try {
        if (window.ensureGallery) window.ensureGallery();
        if (window.t2iAddImageToGallery) await window.t2iAddImageToGallery(dataUrl, prompt, (body.name || "persona portrait") + " (board repair)");
      } catch (e) {}
      if (btn) btn.textContent = label;
      repairWithImage(it, btn, body, dataUrl);
    } catch (e) {
      console.error(e);
      toast("⚠️ " + (e && e.message ? e.message : "portrait generation failed"));
      if (btn) { btn.disabled = false; btn.textContent = label; }
    }
    if (stopFunny) { try { stopFunny(); } catch (_e) {} }
  }
  async function repairWithImage(it, btn, body, imgUrl, kindHint, posterHint) {
    var label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "⏳ uploading…"; }
    try {
      var thumb = imgUrl || "";
      var rkind = kindHint || AVKind(thumb);
      var rposter = posterHint || "";
      var rvid = rkind === "video" || /^data:video\//i.test(thumb);
      if (!rvid && /^blob:/i.test(thumb)) { try { thumb = await downscale(thumb, 512); } catch (e) {} }
      else if (!rvid && /^data:/i.test(thumb)) thumb = await downscale(thumb, 256);
      if (thumb) {
        // Same re-upload guard as publish: the replacement picture must not
        // already belong to another board persona.
        if (btn) btn.textContent = "⏳ checking for re-upload…";
        var rdup = null;
        try { rdup = await findImageDuplicate(thumb, rvid ? "video" : rkind, rposter, it.meta && it.meta.file); } catch (e) { rdup = null; }
        if (rdup) {
          if (btn) { btn.disabled = false; btn.textContent = label; }
          toast("⛔ that picture is already used by “" + String((rdup.meta && rdup.meta.name) || "another persona") + "” on the board — pick a different one.");
          return;
        }
      }
      if (btn) btn.textContent = "⏳ uploading…";
      var avatarUrl = await uploadThumb(thumb, rkind);
      if (!avatarUrl && /^data:/i.test(thumb)) throw new Error("avatar upload failed");
      var avatarPosterUrl = "";
      if (rvid && rposter && /^data:/i.test(rposter)) {
        try {
          var rpp = await window.root.uploadPlugin(await dataUrlToBlob(rposter));
          if (rpp && !rpp.error && rpp.url) avatarPosterUrl = rpp.url;
        } catch (e) {}
      }
      var fixed = {
        v: 1, name: body.name || it.meta.name || "Untitled",
        tagline: body.tagline || taglineOf(body.name || "", body.description),
        description: body.description, lorebook: body.lorebook || null, thumb: thumb, thumbKind: rvid ? "video" : rkind, thumbPoster: rposter,
        tone: body.tone || "auto", rating: body.rating || it.meta.rating || "sfw",
        exportedAt: Date.now(), source: "persona-board-repair"
      };
      var up = await window.root.uploadPlugin(JSON.stringify(fixed));
      if (!up || up.error || !up.url) throw new Error(up && up.error ? up.error : "upload failed");
      var rid = null;
      try { rid = thumb ? await imageIdentity(rvid && /^https?:/i.test(thumb) ? (avatarUrl || thumb) : thumb) : null; } catch (e) { rid = null; }
      var meta = { v: 1, name: fixed.name, tagline: fixed.tagline, file: up.url, avatar: avatarUrl || thumb, avatarKind: rvid ? "video" : rkind, avatarPoster: avatarPosterUrl || rposter, rating: fixed.rating, imgSha: (rid && rid.sha) || "", imgA: (rid && rid.a) || "", supersedes: it.meta.file };
      await Promise.resolve(ctrl.submit(PREFIX + b64e(JSON.stringify(meta))));
      localSuperseded[it.meta.file] = true;
      thumbCache[up.url] = { url: thumb, kind: rvid ? "video" : rkind, poster: rposter };
      render();
      toast("🖼️ image restored for “" + fixed.name + "”");
    } catch (e) { toast("⚠️ " + (e && e.message ? e.message : "repair failed")); }
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
  function build() {
    var APP = $("board-root");
    if (!APP || built) return;
    built = true;
    APP.innerHTML =
      '<div class="pgen-hero">' +
      '<div class="pgen-title">🎭 Persona Board</div>' +
      '<p class="pgen-sub">Personas crafted in this studio, shared by everyone. Download any character as a Tavern card, or send them straight into AI Chat. Publishing is public — anything you share can be seen and downloaded by anyone.</p>' +
      "</div>" +
      '<div class="pro-card">' +
      '<div class="pro-card-head">📤 Share a persona <span class="pgen-head-hint">from the editor or your saved library</span></div>' +
      '<div class="pbd-pubrow"><select id="pbd-source" class="pro-select"></select>' +
      '<button type="button" id="pbd-publish" class="pro-btn pro-btn-primary">🌍 Share on the board</button>' +
      '<button type="button" id="pbd-refresh-src" class="pro-btn" title="Reload the persona list">↻</button></div>' +
      '<div class="pbd-hint">New here? Build a character in 🧑 Persona Generator, 💾 save it, then share it here.</div>' +
      "</div>" +
      '<div class="pro-card">' +
      '<div class="pro-card-head">🌍 Community personas <span class="pro-badge" id="pbd-count">0</span></div>' +
      '<div class="pbd-pubrow"><input id="pbd-search" class="pro-input" placeholder="Search name or tagline…">' +
      '<button type="button" id="pbd-refresh" class="pro-btn" title="Re-render the board">↻ Refresh</button></div>' +
      '<div id="pbd-grid" class="pbd-grid"><div class="pgen-empty">Connecting to the community board…</div></div>' +
      '<div id="pbd-hidden" aria-hidden="true"></div>' +
      "</div>";
    $("pbd-publish").addEventListener("click", function () { publish(this); });
    $("pbd-refresh-src").addEventListener("click", function () { refreshSources(); });
    $("pbd-refresh").addEventListener("click", function () { render(); toast("↻ board refreshed — " + items.length + " shared"); });
    $("pbd-search").addEventListener("input", function () { search = this.value; render(); });
    refreshSources();
    mountFeed();
    if (!ctrl) {
      var n = 0;
      var t = setInterval(function () {
        mountFeed();
        if (ctrl || ++n > 40) clearInterval(t);
      }, 1000);
    }
  }
  window.__boardOnShow = function () {
    if (!built) build();
    var r = $("board-app");
    if (r) r.hidden = false;
    refreshSources();
    render();
  };
  window.__boardDebug = {
    items: function () { return items.slice(); },
    connected: function () { return !!ctrl; },
    stats: function () { return { raw: stats.raw, parsed: stats.parsed }; },
    inject: function (it) { items.push(it); render(); return items.length; },
    clear: function () { items = []; render(); },
    imageIdentity: function (thumb) { return imageIdentity(thumb); },
    findImageDuplicate: function (thumb, kind, poster, excludeFile) {
      return findImageDuplicate(thumb, kind || "", poster || "", excludeFile || null).then(function (hit) {
        return hit ? { name: hit.meta && hit.meta.name, file: hit.meta && hit.meta.file } : null;
      });
    }
  };
})();
