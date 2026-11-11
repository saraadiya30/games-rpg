/* src/mod-review.js — owner-gated flagged-image review queue (lazy-loaded from the
 * owner console only; never on visitor page loads).
 *
 * Shows public-gallery cards caught by the child-safety block (same match as the
 * Home/Community/Explore strips) and lets the owner decide per card:
 *   ✅ Allow    — owner-approved allowlist, shown on strips despite the match
 *   🚫 Ban user — hides everything from that gallery user id on strips
 *   ↩️ Unban user — removes a user ban again if you decide it was a mistake
 *   ➕ Ban phrase — adds a case-insensitive substring ban for strips
 * Decisions are stored in the shared editable file (src/moderation.js) so they
 * apply to every visitor within minutes, no generator save needed. The embedded
 * full-gallery iframe still uses only the built-in main.pjs bans — the panel's
 * "Copy main.pjs snippet" button produces the permanent-source version.
 */
(function () {
  "use strict";
  if (window.__modReviewEnsure) return;

  var items = [];
  var scanning = false;
  var lastScanAt = 0;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function ago(ts) {
    if (!ts) return "never";
    var d = Date.now() - ts;
    if (d < 0) d = 0;
    if (d < 60000) return "just now";
    var m = Math.floor(d / 60000);
    if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60);
    if (h < 48) return h + "h ago";
    return Math.floor(h / 24) + "d ago";
  }
  function authed() {
    try { return typeof window.__t2iIsOwnerAuthed === "function" && window.__t2iIsOwnerAuthed(); } catch (e) { return false; }
  }
  function ensureCss() {
    if (document.getElementById("t2i-mod-css")) return;
    var st = document.createElement("style");
    st.id = "t2i-mod-css";
    st.textContent =
      ".t2i-mod-card{display:flex;gap:.6rem;margin-top:.55rem;padding:.55rem;border:1px solid var(--th-border,rgba(255,255,255,.2));border-radius:12px;background:var(--th-field,rgba(255,255,255,.06))}" +
      ".t2i-mod-thumb{flex:0 0 96px;width:96px;height:96px;object-fit:cover;border-radius:8px;background:#000;cursor:zoom-in}" +
      ".t2i-mod-thumb.blurred{filter:blur(14px)}" +
      ".t2i-mod-body{flex:1;min-width:0;font-size:.76rem;line-height:1.45}" +
      ".t2i-mod-title{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".t2i-mod-prompt{opacity:.85;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}" +
      ".t2i-mod-meta{opacity:.65;font-size:.7rem;margin-top:.15rem;word-break:break-all}" +
      ".t2i-mod-reason{color:#ffb3c7;font-weight:700}" +
      ".t2i-mod-ok{color:#9fe8b4;font-weight:700}" +
      ".t2i-mod-actions{display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.35rem}" +
      ".t2i-mod-phrase{flex:1 1 120px;min-width:0;font:inherit;font-size:.74rem;color:inherit;background:rgba(0,0,0,.25);border:1px solid var(--th-border,rgba(255,255,255,.2));border-radius:8px;padding:.2rem .45rem}" +
      ".t2i-mod-note{font-size:.72rem;line-height:1.5;opacity:.7;margin-top:.4rem}" +
      ".t2i-mod-status{font-size:.76rem;line-height:1.5;margin-top:.35rem}" +
      ".t2i-mod-count{font-weight:800}";
    document.head.appendChild(st);
  }
  function host() { return document.getElementById("t2i-owner-mod"); }
  function normUid(u) { try { return String(u || "").trim().toLowerCase(); } catch (e) { return ""; } }
  function builtinIds() {
    try {
      var a = window.__t2iChildSafety && window.__t2iChildSafety.USER_IDS;
      if (Array.isArray(a)) return a.map(normUid).filter(Boolean);
    } catch (e) {}
    return [];
  }
  function isBuiltinUid(uid) { return builtinIds().indexOf(normUid(uid)) !== -1; }
  function isBannedUid(uid) {
    try {
      var m = window.__t2iMod && window.__t2iMod.bannedUsers;
      return !!(m && m[normUid(uid)]);
    } catch (e) { return false; }
  }
  function channels() {
    var ch = [];
    try { if (window.generatorName) ch.push(window.generatorName); } catch (e) {}
    var other = null;
    try { other = window.generatorName === "ai-image-character-studio" ? "all-in-one-generator" : "ai-image-character-studio"; } catch (e) { other = "all-in-one-generator"; }
    if (other && ch.indexOf(other) === -1) ch.push(other);
    return ch;
  }
  function feedUrl(ch) {
    return "https://image-generation.perchance.org/gallery?channel=" + encodeURIComponent(ch) +
      "&subChannel=public&sort=new&timeRange=1-month&hideIfScoreIsBelow=-1&contentFilter=none&imageElementsHtmlOnly=true&skip=0";
  }
  function copyText(text, done) {
    function manual() { try { window.prompt("Copy (Ctrl+C):", text); } catch (e) {} if (done) done(false); }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { if (done) done(true); }, manual);
      } else manual();
    } catch (e) { manual(); }
  }

  async function scan() {
    if (scanning) return;
    scanning = true;
    var h = host();
    if (h) h.innerHTML = '<div class="t2i-owner-empty">Scanning public feeds…</div>';
    try {
      if (window.__t2iModLoad) await Promise.race([window.__t2iModLoad(), new Promise(function (res) { setTimeout(res, 8000); })]);
    } catch (e) {}
    var found = [];
    try {
      if (!window.root || !window.root.superFetch) throw new Error("gallery backend not ready");
      var lists = await Promise.all(channels().map(function (ch) {
        return window.root.superFetch(feedUrl(ch)).then(function (r) {
          if (!r || !r.ok) throw new Error("HTTP " + (r && r.status));
          return r.text();
        }).catch(function () { return ""; });
      }));
      var seen = {};
      lists.forEach(function (html, li) {
        if (!html) return;
        var doc = null;
        try { doc = new DOMParser().parseFromString(html, "text/html"); } catch (e) { return; }
        var nodes = doc.querySelectorAll(".imageCtn");
        for (var i = 0; i < nodes.length; i++) {
          var d = nodes[i].dataset || {};
          var id = d.imageId || "";
          if (!id || seen[id]) continue;
          seen[id] = 1;
          var img = nodes[i].querySelector(".imageWrapperInner img.image") || nodes[i].querySelector("img.image");
          var url = (img && img.getAttribute("src")) || "";
          if (!url) continue;
          var it = { id: id, url: url, userId: d.userId || "", title: d.title || "", prompt: d.prompt || "", isNsfw: d.isNsfw === "true", channel: channels()[li] || "" };
          var m = null;
          try { m = window.__t2iModMatch ? window.__t2iModMatch(it) : { blocked: false, reason: null }; } catch (e) { m = { blocked: false, reason: null }; }
          var allowed = false;
          try { allowed = !!(window.__t2iMod && window.__t2iMod.allowed && window.__t2iMod.allowed[String(id).toLowerCase()]); } catch (e) {}
          if (m.blocked || allowed) { it.reason = allowed ? "owner-approved" : m.reason; it.allowed = allowed; found.push(it); }
        }
      });
    } catch (e) {
      if (h) h.innerHTML = '<div class="t2i-owner-empty">Scan failed: ' + esc(e && e.message) + ' — retry in a moment.</div>';
      scanning = false;
      return;
    }
    found.sort(function (a, b) { return (a.allowed ? 1 : 0) - (b.allowed ? 1 : 0); });
    items = found.slice(0, 60);
    lastScanAt = Date.now();
    scanning = false;
    render();
  }

  function cardHtml(it, ix) {
    var uidShort = (it.userId || "").slice(0, 8) || "—";
    var idShort = (it.id || "").slice(0, 12);
    var stateLine = it.allowed
      ? '<span class="t2i-mod-ok">✅ allowed — showing on strips</span>'
      : '<span class="t2i-mod-reason">🚩 hidden — ' + esc(it.reason || "matched") + "</span>";
    var phraseDefault = "";
    try {
      var m = String(it.reason || "").match(/"([^"]+)"/);
      phraseDefault = m ? m[1] : "";
    } catch (e) {}
    var acts = "";
    if (it.allowed) {
      acts += '<button type="button" class="t2i-owner-mini" data-act="unallow" data-ix="' + ix + '">↩️ Un-allow</button>';
    } else {
      acts += '<button type="button" class="t2i-owner-mini" data-act="allow" data-ix="' + ix + '">✅ Allow</button>';
      if (it.userId) {
        if (isBuiltinUid(it.userId)) {
          acts += '<span class="t2i-mod-meta" title="This user id is hardcoded in the built-in block — it cannot be unbanned. Use ✅ Allow per image instead.">🔒 built-in ban</span>';
        } else if (isBannedUid(it.userId)) {
          acts += '<button type="button" class="t2i-owner-mini" data-act="unbanuser" data-ix="' + ix + '">↩️ Unban user</button>';
        } else {
          acts += '<button type="button" class="t2i-owner-mini" data-act="banuser" data-ix="' + ix + '">🚫 Ban user</button>';
        }
      }
      acts += '<input class="t2i-mod-phrase" data-phrase="' + ix + '" value="' + esc(phraseDefault) + '" placeholder="phrase to ban…" maxlength="120">';
      acts += '<button type="button" class="t2i-owner-mini" data-act="banphrase" data-ix="' + ix + '">➕ Ban phrase</button>';
    }
    acts += '<button type="button" class="t2i-owner-mini" data-act="open" data-ix="' + ix + '">🔗 Open</button>';
    acts += '<button type="button" class="t2i-owner-mini" data-act="copy" data-ix="' + ix + '">📋 Copy</button>';
    return '<div class="t2i-mod-card">' +
      '<img class="t2i-mod-thumb' + (it.isNsfw ? " blurred" : "") + '" loading="lazy" src="' + it.url.replace(/"/g, "&quot;") + '" alt="" data-thumb="' + ix + '" title="click to reveal / hide">' +
      '<div class="t2i-mod-body"><div class="t2i-mod-title">' + esc(it.title || "(untitled)") + "</div>" +
      '<div class="t2i-mod-prompt">' + esc((it.prompt || "").slice(0, 300)) + "</div>" +
      '<div class="t2i-mod-meta">' + stateLine + "<br>user <b>" + esc(uidShort) + "</b> · img <b>" + esc(idShort) + "</b>" +
      (it.isNsfw ? " · 🔞 platform-nsfw" : "") + " · via " + esc(it.channel || "") + "</div>" +
      '<div class="t2i-mod-actions">' + acts + "</div></div></div>";
  }

  function render() {
    var h = host();
    if (!h) return;
    ensureCss();
    var mod = window.__t2iMod || { allowed: {}, bannedUsers: {}, bannedPhrases: [], updatedAt: 0, source: "built-in" };
    var nBlocked = items.filter(function (x) { return !x.allowed; }).length;
    var nAllowed = items.length - nBlocked;
    var html = '<div class="t2i-mod-status">Scanned <span class="t2i-mod-count">' + items.length + "</span> flagged (" +
      nBlocked + " hidden · " + nAllowed + " allowed) · rules: " +
      Object.keys(mod.bannedUsers || {}).length + " users / " + (mod.bannedPhrases || []).length + " phrases / " +
      Object.keys(mod.allowed || {}).length + " allowed · shared rules: " + esc(mod.source || "?") +
      (mod.updatedAt ? " · updated " + esc(ago(mod.updatedAt)) : "") +
      (lastScanAt ? " · scanned " + esc(ago(lastScanAt)) : "") + "</div>";
    html += '<div class="t2i-owner-row" style="margin-top:.4rem"><button type="button" class="t2i-owner-btn" id="t2i-mod-rescan">↻ Re-scan</button>' +
      '<button type="button" class="t2i-owner-btn" id="t2i-mod-snippet">📋 Copy main.pjs snippet</button></div>';
    html += '<div class="t2i-owner-row" style="margin-top:.35rem"><button type="button" class="t2i-owner-btn" id="t2i-mod-export">📤 Export rules</button>' +
      '<button type="button" class="t2i-owner-btn" id="t2i-mod-key">💾 Back up editKey</button></div>';
    // ---- Banned-users manager: unban anyone you decide is okay after all ----
    (function () {
      var banned = [];
      try { banned = Object.keys(mod.bannedUsers || {}).sort(); } catch (e) { banned = []; }
      var builtin = [];
      try {
        var _b = window.__t2iChildSafety && window.__t2iChildSafety.USER_IDS;
        if (Array.isArray(_b)) builtin = _b.map(function (u) { return String(u || "").toLowerCase(); }).filter(Boolean).sort();
      } catch (e) {}
      html += '<div class="t2i-mod-status" style="margin-top:.55rem">🚫 Banned users: <span class="t2i-mod-count">' + banned.length + "</span> reversible" +
        (builtin.length ? ' · 🔒 ' + builtin.length + " built-in (permanent)" : "") + "</div>";
      if (!banned.length && !builtin.length) {
        html += '<div class="t2i-owner-empty" style="margin-top:.3rem">No user bans. Banning someone here hides all of their images from the strips.</div>';
      } else {
        for (var bi = 0; bi < banned.length; bi++) {
          (function (uid) {
            var short = uid.slice(0, 8);
            var alsoBuiltin = builtin.indexOf(uid) !== -1;
            html += '<div class="t2i-mod-card" style="align-items:center"><div class="t2i-mod-body">' +
              '<div class="t2i-mod-title">🚫 ' + esc(short) + "…" + (alsoBuiltin ? " + 🔒 built-in" : "") + "</div>" +
              '<div class="t2i-mod-meta">' + esc(uid) + (alsoBuiltin
                ? " · also hardcoded — removing this entry alone won't unhide them; use ✅ Allow per image"
                : " · hides all their images from strips") + "</div>" +
              '<div class="t2i-mod-actions"><button type="button" class="t2i-owner-mini" data-act="unbanlisted" data-uid="' + esc(uid) + '">↩️ Unban — I deem this okay</button></div>' +
              "</div></div>";
          })(banned[bi]);
        }
        for (var qi = 0; qi < builtin.length; qi++) {
          (function (uid) {
            var short = uid.slice(0, 8);
            html += '<div class="t2i-mod-card" style="align-items:center;opacity:.75"><div class="t2i-mod-body">' +
              '<div class="t2i-mod-title">🔒 ' + esc(short) + "… (built-in)</div>" +
              '<div class="t2i-mod-meta">' + esc(uid) + " · hardcoded block — cannot be unbanned; use ✅ Allow per image instead</div>" +
              "</div></div>";
          })(builtin[qi]);
        }
      }
      html += '<div class="t2i-mod-actions" style="margin-top:.35rem">' +
        '<input class="t2i-mod-phrase" id="t2i-mod-uid" placeholder="paste a user id to ban / unban…" maxlength="128" spellcheck="false">' +
        '<button type="button" class="t2i-owner-mini" data-act="banmanual">🚫 Ban id</button>' +
        '<button type="button" class="t2i-owner-mini" data-act="unbanmanual">↩️ Unban id</button></div>';
    })();
    if (!items.length) html += '<div class="t2i-owner-empty" style="margin-top:.5rem">Nothing flagged in the latest feed page. The built-in block stays on regardless.</div>';
    for (var i = 0; i < items.length; i++) html += cardHtml(items[i], i);
    html += '<div class="t2i-mod-note">Allow/ban apply to the Home strip, Community feeds and Explore on this address within ~10 minutes (cached). ' +
      "The embedded full-gallery iframe only reads the built-in main.pjs bans — use “Copy main.pjs snippet” to make a ban permanent in source. " +
      "Nothing here deletes images from Perchance's central gallery; for that, open the image and report it to Perchance.</div>";
    html += '<div class="t2i-mod-status" id="t2i-mod-msg"></div>';
    h.innerHTML = html;
    var rs = document.getElementById("t2i-mod-rescan");
    if (rs) rs.addEventListener("click", scan);
    var sn = document.getElementById("t2i-mod-snippet");
    if (sn) sn.addEventListener("click", copySnippet);
    var ex = document.getElementById("t2i-mod-export");
    if (ex) ex.addEventListener("click", exportRules);
    var kb = document.getElementById("t2i-mod-key");
    if (kb) kb.addEventListener("click", backupKey);
    h.querySelectorAll("[data-act]").forEach(function (b) {
      b.addEventListener("click", function () { act(b.getAttribute("data-act"), Number(b.getAttribute("data-ix")), b.getAttribute("data-uid"), b); });
    });
    h.querySelectorAll("[data-thumb]").forEach(function (im) {
      im.addEventListener("click", function () { im.classList.toggle("blurred"); });
    });
  }

  function say(t) {
    var el = document.getElementById("t2i-mod-msg");
    if (el) el.textContent = t;
  }

  // kind: allow/unallow/banuser/unbanuser/banphrase/open/copy act on a scanned
  // card (ix), or unbanlisted/banmanual/unbanmanual act on a raw user id (uid).
  async function act(kind, ix, uid, btn) {
    say("Working…");
    try {
      var doneMsg = null;
      if (kind === "unbanlisted") {
        uid = normUid(uid);
        if (!uid) { say("No user id."); return; }
        var wasBuiltin = isBuiltinUid(uid);
        await window.__t2iModSave({ unbanUsers: [uid] });
        if (wasBuiltin) doneMsg = "🗑️ Shared entry removed — but that id is also hardcoded, so it stays hidden. Use ✅ Allow per image to show something of theirs.";
      } else if (kind === "banmanual" || kind === "unbanmanual") {
        var inp = document.getElementById("t2i-mod-uid");
        uid = normUid(inp ? inp.value : "");
        if (!uid) { say("Paste a user id first."); return; }
        if (!/^[0-9a-f]{16,128}$/.test(uid)) { say("⚠️ That doesn't look like a gallery user id (16–128 hex chars). Copy it via 📋 Copy on the card."); return; }
        var wasBuiltin2 = (kind === "unbanmanual") && isBuiltinUid(uid);
        await window.__t2iModSave(kind === "banmanual" ? { banUsers: [uid] } : { unbanUsers: [uid] });
        if (wasBuiltin2) doneMsg = "🗑️ Shared entry removed — but that id is also hardcoded, so it stays hidden. Use ✅ Allow per image to show something of theirs.";
      } else {
        var it = items[ix];
        if (!it) return;
        if (kind === "allow") await window.__t2iModSave({ allow: [it.id] });
        else if (kind === "unallow") await window.__t2iModSave({ unallow: [it.id] });
        else if (kind === "banuser") {
          if (!it.userId) { say("No user id on this card."); return; }
          await window.__t2iModSave({ banUsers: [it.userId] });
        } else if (kind === "unbanuser") {
          if (!it.userId) { say("No user id on this card."); return; }
          // Built-in cards never offer Unban (card shows 🔒 instead), but keep the
          // guard in case rules change: allow removing the shared entry, warn it stays hidden.
          var wasBuiltin3 = isBuiltinUid(it.userId);
          await window.__t2iModSave({ unbanUsers: [it.userId] });
          if (wasBuiltin3) doneMsg = "🗑️ Shared entry removed — but that id is also hardcoded, so it stays hidden. Use ✅ Allow per image to show something of theirs.";
        } else if (kind === "banphrase") {
          var inp2 = host().querySelector('[data-phrase="' + ix + '"]');
          var p = inp2 ? inp2.value.trim() : "";
          if (!p) { say("Type a phrase first."); return; }
          await window.__t2iModSave({ banPhrases: [p] });
        } else if (kind === "open") { try { window.open(it.url, "_blank", "noopener"); } catch (e) {} say(""); return; }
        else if (kind === "copy") {
          copyText("imageId: " + it.id + "\nuserId: " + (it.userId || "?") + "\ntitle: " + (it.title || "") + "\nprompt: " + (it.prompt || "") + "\nurl: " + it.url, function (ok) { say(ok ? "📋 Details copied — paste into a Perchance report." : "Copy blocked — long-press to copy manually."); });
          return;
        }
      }
      await window.__t2iModLoad();
      // Refresh the affected card (manual uid actions have no card).
      var it2 = (typeof ix === "number" && isFinite(ix)) ? items[ix] : null;
      if (it2) {
        it2.allowed = !!(window.__t2iMod && window.__t2iMod.allowed && window.__t2iMod.allowed[String(it2.id).toLowerCase()]);
        var m = null;
        try { m = window.__t2iModMatch(it2); } catch (e) {}
        if (!it2.allowed && m && !m.blocked) { items.splice(ix, 1); }
        else it2.reason = it2.allowed ? "owner-approved" : (m && m.reason) || it2.reason;
      }
      render();
      say(doneMsg || (kind === "allow" ? "✅ Allowed — shows on strips within ~10 min."
        : kind === "unallow" ? "↩️ Approval removed."
        : (kind === "unbanuser" || kind === "unbanlisted" || kind === "unbanmanual") ? "↩️ User unbanned — their images can show on strips again within ~10 min."
        : (kind === "banmanual" ? "🚫 User banned — strips update within ~10 min."
        : "🚫 Rule saved — strips update within ~10 min.")));
    } catch (e) {
      say("⚠️ " + (e && e.message === "locked" ? "Console is locked — unlock first." : String((e && e.message) || e)));
    }
  }

  function copySnippet() {
    var mod = window.__t2iMod || { bannedUsers: {}, bannedPhrases: [] };
    var users = Object.keys(mod.bannedUsers || {});
    var phrases = mod.bannedPhrases || [];
    var s = "    bannedUsers\n";
    users.forEach(function (u) { s += "      " + u + "\n"; });
    s += "    bannedPromptPhrases\n";
    ["teen", "schoolgirl", "schoolboy", "school uniform", "high school", "middle school", "junior high", "loli", "shota", "preteen", "young girl", "young boy", "youthful face", "young slender"].forEach(function (p) { s += "      " + p + "\n"; });
    phrases.forEach(function (p) { if (["teen", "schoolgirl", "schoolboy", "school uniform", "high school", "middle school", "junior high", "loli", "shota", "preteen", "young girl", "young boy", "youthful face", "young slender"].indexOf(String(p).toLowerCase()) === -1) s += "      " + p + "\n"; });
    copyText("Paste under galleryOptions in main.pjs:\n\n" + s, function (ok) { say(ok ? "📋 Snippet copied — paste under galleryOptions, save." : "Copy blocked."); });
  }
  function exportRules() {
    var mod = window.__t2iMod || {};
    copyText(JSON.stringify({ v: 1, allowed: Object.keys(mod.allowed || {}), bannedUsers: Object.keys(mod.bannedUsers || {}), bannedPhrases: mod.bannedPhrases || [], updatedAt: mod.updatedAt || 0 }, null, 2), function (ok) { say(ok ? "📤 Rules copied as JSON." : "Copy blocked."); });
  }
  function backupKey() {
    var k = "";
    try { k = (window.__t2iModEditKeyBackup && window.__t2iModEditKeyBackup()) || ""; } catch (e) {}
    if (!k) { say("No editKey on this device yet — save a rule first, then back it up."); return; }
    copyText(k, function (ok) { say(ok ? "💾 editKey copied — store it somewhere safe (password manager). Anyone with it can edit these rules." : "Copy blocked."); });
  }

  window.__modReviewEnsure = async function () {
    if (!authed()) return;
    var h = host();
    if (!h) return;
    ensureCss();
    if (!items.length && !scanning && !lastScanAt) scan();
    else render();
  };
})();
