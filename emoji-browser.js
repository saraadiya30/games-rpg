/*
 * emoji-browser.js — the 😀 emoji browser behind every comment box on the site.
 *
 * The comment areas (the Image Generator tab's tabbed comments, and the Pro tab's
 * "Community comments") all get their custom emojis from the same stacked packs in
 * main.pjs (`settings.defaultCommentOptions.customEmojis` -> huge-emoji-list +
 * the-epic-emoji-list). The pack from https://perchance.org/the-epic-emoji-list is
 * the curated one (memes, kaomoji, unicode glyphs, copypasta), and this file is the
 * site's own version of that generator's browse/search UI: it lists every emoji in
 * the pack, lets you filter by category/tag or search, preview one at a time, and
 * copy its `:code:` with one click so it can be pasted into any comment box — or any
 * chat, since the codes work anywhere the pack is loaded.
 *
 * Data comes from `epicEmojiPackUrl` in main.pjs — the same hosted .txt the comment boxes
 * load through `customEmojis`, so the codes listed here are always codes that actually work
 * in a comment. (The comments plugin can only @import packs that are hosted .txt files, and
 * the-epic-emoji-list outputs a raw list rather than a URL, hence the hosted copy: see
 * `src/epic-emoji-pack.txt` for the exact bytes and main.pjs for how to rebuild it.)
 *
 * Loaded lazily: `ensureEmojiBrowser()` in index.html's main script pulls this in on
 * first visit to the gen/pro tabs or on the first click of a 😀 button. Public API:
 *   window.t2iOpenEmojiBrowser()      — open the browser
 *   window.t2iEmojiBrowserData()      — the parsed pack (debug/inspection)
 */
(function () {
  "use strict";

  var COPASTA = ["IWasCrazyOnce", "AM_HateSpeech", "Navy_Seal", "Pacer_Test", "TheOneWhosRunningTheShow"];
  var CATS = [
    ["all", "All"],
    ["main", "Main"],
    ["text", "Text"],
    ["copypasta", "Copypasta"],
    ["binary", "Binary"],
    ["bcc", "BCC"],
    ["new", "🆕 New"]
  ];

  var data = null;      /* { items: [...] } */
  var loading = false;
  var els = {};         /* cached DOM refs */
  var state = { q: "", cat: "all", sort: "default", shown: 0 };

  /* ------------------------------------------------------------------ data */
  function packUrl() {
    try {
      var u = window.root && window.root.epicEmojiPackUrl;
      if (u && typeof u.evaluateItem !== "undefined") u = u.evaluateItem;
      if (u) return String(u).trim();
    } catch (e) {}
    return "";
  }

  function parsePack(raw) {
    var lines = String(raw || "").split("\n");
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line.trim() || /^\s*\/\//.test(line)) continue;
      /* "name (tags:a,b) (size:2) = value" — the value is a bare URL or plain text (kaomoji etc.) */
      var m = /^\s*([^\s=]+)\s*(.*?)=\s*(.+?)\s*$/.exec(line);
      if (!m) continue;
      var name = m[1], annot = m[2] || "", value = m[3];
      if (name === "$output" || name.charAt(0) === "@" || !name) continue;
      var tags = [];
      var tm = /\(tags:([^)]*)\)/.exec(annot);
      if (tm) tags = tm[1].split(",").map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
      var sm = /\(size:([0-9.]+)\)/.exec(annot);
      var isUrl = /^https?:\/\//.test(value);
      var cat;
      if (/_binary$/.test(name)) cat = "binary";
      else if (tags.indexOf("bcc") >= 0) cat = "bcc";
      else if (isUrl) cat = "main";
      else if (COPASTA.indexOf(name) >= 0) cat = "copypasta";
      else cat = "text";
      out.push({
        name: name, value: value, url: isUrl ? value : "",
        tags: tags, size: sm ? Number(sm[1]) : 0,
        cat: cat, isNew: tags.indexOf("new") >= 0
      });
    }
    return out;
  }

  /* The pack is fetched once and kept for the session; a failed load leaves `data` null so
     the next open retries (e.g. after the user gets back online). */
  function loadData(cb) {
    if (data) { cb(true); return; }
    var url = packUrl();
    if (!url) { cb(false, "The emoji pack URL (epicEmojiPackUrl in main.pjs) isn't available yet."); return; }
    if (loading) { pending.push(cb); return; }
    loading = true;
    pending.push(cb);
    fetch(url).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    }).then(function (text) {
      data = { items: parsePack(text) };
      finish(true, "");
    })["catch"](function (e) {
      finish(false, "Couldn't download the emoji pack (" + (e && e.message ? e.message : e) + "). Check your connection and try again.");
    });
  }
  var pending = [];
  function finish(ok, err) {
    loading = false;
    var waiters = pending.slice();
    pending.length = 0;
    for (var i = 0; i < waiters.length; i++) { try { waiters[i](ok, err); } catch (e) {} }
  }

  window.t2iEmojiBrowserData = function () { return data ? data.items : null; };

  /* ------------------------------------------------------------------- css */
  var CSS = [
    "#ebOverlay { position: fixed; inset: 0; z-index: 4000; display: flex; align-items: center; justify-content: center; padding: 0.8rem; background: rgba(0,0,0,0.6); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }",
    "#ebModal { display: flex; flex-direction: column; width: min(1040px, 100%); height: min(88vh, 940px); overflow: hidden; background: var(--th-modal, #1b1b1f); color: var(--th-text, inherit); border: 1px solid var(--th-border, rgba(128,128,128,.3)); border-radius: var(--th-radius, 14px); box-shadow: 0 24px 70px -24px #000; font-family: var(--th-font); }",
    ".eb-head { display: flex; align-items: center; gap: 0.6rem; padding: 0.7rem 0.9rem; border-bottom: 1px solid var(--th-border); flex-wrap: wrap; }",
    ".eb-title { font-weight: 700; font-size: 1rem; }",
    ".eb-sub { font-size: 0.75rem; opacity: 0.7; flex: 1 1 260px; line-height: 1.45; }",
    ".eb-x { margin-left: auto; cursor: pointer; font: inherit; font-size: 0.95rem; padding: 0.3rem 0.6rem; border-radius: 999px; border: 1px solid var(--th-border); background: var(--th-field); color: inherit; }",
    ".eb-x:hover { border-color: var(--th-accent); }",
    ".eb-tools { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; padding: 0.6rem 0.9rem; border-bottom: 1px solid var(--th-border); }",
    ".eb-search { flex: 1 1 190px; min-width: 0; padding: 0.45rem 0.65rem; font: inherit; font-size: 0.85rem; background: var(--th-field); color: inherit; border: 1px solid var(--th-border); border-radius: calc(var(--th-radius) * 0.6); outline: none; }",
    ".eb-search:focus { border-color: var(--th-accent); }",
    ".eb-select { padding: 0.42rem 0.5rem; font: inherit; font-size: 0.8rem; background: var(--th-field); color: inherit; border: 1px solid var(--th-border); border-radius: calc(var(--th-radius) * 0.6); }",
    ".eb-chips { display: flex; flex-wrap: wrap; gap: 0.28rem; }",
    ".eb-chip { cursor: pointer; font: inherit; font-size: 0.75rem; padding: 0.26rem 0.6rem; border-radius: 999px; border: 1px solid var(--th-border); background: var(--th-field); color: inherit; }",
    ".eb-chip:hover { border-color: var(--th-accent); }",
    ".eb-chip.eb-on { border-color: var(--th-accent); background: var(--th-accent-soft, var(--th-accent)); color: var(--th-accent-text, inherit); font-weight: 700; }",
    ".eb-body { flex: 1 1 auto; overflow-y: auto; padding: 0.7rem 0.9rem; }",
    ".eb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 0.4rem; }",
    ".eb-card { position: relative; display: flex; flex-direction: column; align-items: center; gap: 0.28rem; padding: 0.4rem 0.3rem 0.45rem; cursor: pointer; text-align: center; border: 1px solid var(--th-border); border-radius: 10px; background: var(--th-field); }",
    ".eb-card:hover { border-color: var(--th-accent); }",
    ".eb-card img { width: 100%; height: 66px; object-fit: contain; display: block; }",
    ".eb-card .eb-txt { height: 66px; display: flex; align-items: center; justify-content: center; font-size: 1.35rem; line-height: 1.15; overflow: hidden; word-break: break-word; }",
    ".eb-card .eb-name { width: 100%; font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace; font-size: 10.5px; opacity: 0.72; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
    ".eb-zoom { position: absolute; top: 2px; right: 2px; width: 20px; height: 20px; line-height: 1; display: grid; place-items: center; font-size: 11px; border-radius: 6px; border: 1px solid var(--th-border); background: var(--th-surface, var(--th-field)); color: inherit; opacity: 0; cursor: pointer; }",
    ".eb-card:hover .eb-zoom, .eb-zoom:focus-visible { opacity: 1; }",
    ".eb-new { position: absolute; top: 2px; left: 3px; font-size: 10px; opacity: 0.9; }",
    ".eb-empty { padding: 2rem 1rem; text-align: center; opacity: 0.7; font-size: 0.85rem; }",
    ".eb-note { padding: 2rem 1rem; text-align: center; opacity: 0.75; font-size: 0.85rem; }",
    ".eb-foot { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; padding: 0.5rem 0.9rem; border-top: 1px solid var(--th-border); font-size: 0.76rem; opacity: 0.85; }",
    ".eb-foot .eb-status { margin-left: auto; font-weight: 700; color: var(--th-accent); opacity: 0; transition: opacity 0.2s; }",
    ".eb-foot .eb-status.eb-show { opacity: 1; }",
    "#ebLight { position: fixed; inset: 0; z-index: 4010; display: flex; align-items: center; justify-content: center; padding: 1rem; background: rgba(0,0,0,0.72); }",
    ".eb-lbox { display: flex; flex-direction: column; align-items: center; gap: 0.7rem; max-width: min(560px, 100%); max-height: 92vh; overflow: auto; padding: 1rem 1.1rem; text-align: center; background: var(--th-modal, #1b1b1f); color: var(--th-text, inherit); border: 1px solid var(--th-border); border-radius: var(--th-radius, 14px); font-family: var(--th-font); }",
    ".eb-lbox img { max-width: 100%; max-height: 56vh; object-fit: contain; }",
    ".eb-lbox .eb-ltxt { font-size: 2.6rem; line-height: 1.2; word-break: break-word; }",
    ".eb-lbox .eb-lname { font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace; font-size: 0.9rem; color: var(--th-accent); }",
    ".eb-lbox .eb-ltags { font-size: 0.72rem; opacity: 0.7; }",
    ".eb-lbtns { display: flex; gap: 0.4rem; flex-wrap: wrap; justify-content: center; }",
    ".eb-cbtn { cursor: pointer; font: inherit; font-size: 0.85rem; font-weight: 700; padding: 0.45rem 0.9rem; border-radius: 999px; border: 1px solid var(--th-accent); background: var(--th-accent); color: var(--th-accent-text, #fff); }",
    ".eb-cbtn.eb-ghost { background: var(--th-field); color: inherit; border-color: var(--th-border); font-weight: 400; }",
    ".eb-comment-bar { display: flex; justify-content: center; margin: 0.6rem auto 0.2rem; }",
    ".eb-comment-bar[hidden] { display: none !important; }",
    ".eb-open-btn { cursor: pointer; font: inherit; font-size: 0.82rem; font-weight: 600; padding: 0.42rem 0.85rem; border-radius: 999px; border: 1px solid var(--th-border); background: var(--th-surface, var(--th-field)); color: inherit; }",
    ".eb-open-btn:hover { border-color: var(--th-accent); background: var(--th-accent-soft); }",
    ".eb-comment-bar-hint { font-weight: 400; opacity: 0.7; font-size: 0.78rem; }",
    "@media (max-width: 560px) { .eb-grid { grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); } .eb-card img, .eb-card .eb-txt { height: 56px; } .eb-comment-bar-hint { display: none; } }"
  ].join("\n  ");

  function injectCss() {
    if (document.getElementById("ebCss")) return;
    var st = document.createElement("style");
    st.id = "ebCss";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ------------------------------------------------------------------ utils */
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function copyText(text) {
    var done = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)["catch"](function () { legacyCopy(text); });
        done = true;
      }
    } catch (e) {}
    if (!done) legacyCopy(text);
  }
  function legacyCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    } catch (e) {}
  }
  function toast(msg) {
    if (window.vaultToast) { try { window.vaultToast(msg); return; } catch (e) {} }
    if (!els || !els.status) return;
    els.status.textContent = msg;
    els.status.classList.add("eb-show");
    clearTimeout(els.statusTimer);
    els.statusTimer = setTimeout(function () { els.status.classList.remove("eb-show"); }, 1600);
  }

  /* ------------------------------------------------------------------- view */
  function matches(it) {
    if (state.cat === "new") { if (!it.isNew) return false; }
    else if (state.cat !== "all" && it.cat !== state.cat) return false;
    if (!state.q) return true;
    if (it.name.toLowerCase().indexOf(state.q) >= 0) return true;
    for (var i = 0; i < it.tags.length; i++) if (it.tags[i].indexOf(state.q) >= 0) return true;
    /* typing a category name ("bcc", "binary", "copypasta"…) filters by it too */
    if (it.cat.indexOf(state.q) >= 0) return true;
    return false;
  }

  function applyFilter() {
    var list = data.items, shown = 0;
    for (var i = 0; i < list.length; i++) {
      var it = list[i], ok = matches(it), card = els.cards[i];
      card.hidden = !ok;
      if (ok) shown++;
    }
    state.shown = shown;
    els.count.textContent = shown + " of " + list.length + " emojis";
    els.empty.hidden = shown !== 0;
    loadNearVisible();
  }

  /* 868 emoji images (some of them multi-MB GIFs) must not all be requested at once, so an
     <img> only gets its `src` when its card comes near the scroll viewport. A plain
     getBoundingClientRect sweep is used rather than IntersectionObserver on purpose — it
     keeps working even when the browser stops firing IO callbacks. */
  function loadNearVisible() {
    if (!els.body || !els.cards) return;
    var box = els.body.getBoundingClientRect();
    if (!box.height) return;
    for (var i = 0; i < els.cards.length; i++) {
      var card = els.cards[i];
      if (card.hidden || card.__ebLoaded) continue;
      var r = card.getBoundingClientRect();
      if (r.top > box.bottom + 400) break;
      if (r.bottom < box.top - 400) continue;
      var img = card.querySelector("img");
      if (img && card.dataset.ebSrc) img.src = card.dataset.ebSrc;
      card.__ebLoaded = true;
    }
  }

  var scrollQueued = false;
  function onBodyScroll() {
    if (scrollQueued) return;
    scrollQueued = true;
    setTimeout(function () { scrollQueued = false; loadNearVisible(); }, 80);
  }

  function buildGrid() {
    var frag = document.createDocumentFragment();
    els.cards = [];
    for (var i = 0; i < data.items.length; i++) {
      var it = data.items[i];
      var card = document.createElement("div");
      card.className = "eb-card";
      card.title = ":" + it.name + ":" + (it.tags.length ? " · tags: " + it.tags.join(", ") : "");
      var media = it.url
        ? '<img alt="" data-eb-src="' + esc(it.url) + '" loading="lazy">'
        : '<div class="eb-txt">' + esc(it.value) + "</div>";
      card.innerHTML =
        media +
        (it.isNew ? '<span class="eb-new" title="newly added">🆕</span>' : "") +
        '<button type="button" class="eb-zoom" title="Preview">🔍</button>' +
        '<span class="eb-name">:' + esc(it.name) + ":</span>";
      if (it.url) card.dataset.ebSrc = it.url;
      (function (item) {
        card.addEventListener("click", function () {
          copyText(":" + item.name + ":");
          toast("Copied :" + item.name + ": — paste it into any comment box");
        });
        card.querySelector(".eb-zoom").addEventListener("click", function (e) { e.stopPropagation(); openLightbox(item); });
      })(it);
      els.cards.push(card);
      frag.appendChild(card);
    }
    els.grid.appendChild(frag);
    applyFilter();
  }

  function openLightbox(it) {
    var box = document.createElement("div");
    box.id = "ebLight";
    box.innerHTML =
      '<div class="eb-lbox">' +
        (it.url ? '<img src="' + esc(it.url) + '" alt="">' : '<div class="eb-ltxt">' + esc(it.value) + "</div>") +
        '<div class="eb-lname">:' + esc(it.name) + ":</div>" +
        (it.tags.length ? '<div class="eb-ltags">' + esc(it.tags.join(" · ")) + "</div>" : "") +
        '<div class="eb-lbtns"><button type="button" class="eb-cbtn">📋 Copy code</button><button type="button" class="eb-cbtn eb-ghost">Close</button></div>' +
      "</div>";
    box.addEventListener("click", function (e) { if (e.target === box) box.remove(); });
    box.querySelector(".eb-cbtn").addEventListener("click", function () {
      copyText(":" + it.name + ":");
      toast("Copied :" + it.name + ":");
    });
    box.querySelector(".eb-cbtn.eb-ghost").addEventListener("click", function () { box.remove(); });
    document.body.appendChild(box);
  }

  function closeLightbox() {
    var el = document.getElementById("ebLight");
    if (el) { el.remove(); return true; }
    return false;
  }

  /* ------------------------------------------------------------------- open */
  function buildModal() {
    injectCss();
    var stray = document.getElementById("ebOverlay");
    if (stray && stray.parentNode) stray.parentNode.removeChild(stray);
    var overlay = document.createElement("div");
    overlay.id = "ebOverlay";
    overlay.innerHTML =
      '<div id="ebModal" role="dialog" aria-label="Emoji browser">' +
        '<div class="eb-head">' +
          '<span class="eb-title">😀 Emoji browser</span>' +
          '<span class="eb-sub">Click any emoji to copy its <b>:code:</b> — then paste it into any comment box (or chat) on this site. Every pack in the comments is listed here; 🔍 previews one.</span>' +
          '<button type="button" class="eb-x" title="Close (Esc)">✕ Close</button>' +
        "</div>" +
        '<div class="eb-tools">' +
          '<input id="ebSearch" class="eb-search" type="search" placeholder="Search name or tag (e.g. cat, dance, new)…" autocomplete="off">' +
          '<select id="ebSort" class="eb-select" title="Sort order">' +
            '<option value="default">Pack order</option><option value="az">A → Z</option><option value="za">Z → A</option>' +
          "</select>" +
          '<div class="eb-chips" id="ebCats"></div>' +
        "</div>" +
        '<div class="eb-body" id="ebBody">' +
          '<div class="eb-grid" id="ebGrid"></div>' +
          '<div class="eb-note" id="ebNote" hidden></div>' +
          '<div class="eb-empty" id="ebEmpty" hidden>No emoji matches that search. Try another word, or switch category.</div>' +
        "</div>" +
        '<div class="eb-foot"><span id="ebCount"></span><span>the standard emoji keyboard still works too — type <b>:</b> in a comment box for the plugin’s own picker</span><span class="eb-status" id="ebStatus"></span></div>' +
      "</div>";
    document.body.appendChild(overlay);

    els.overlay = overlay;
    els.grid = overlay.querySelector("#ebGrid");
    els.body = overlay.querySelector("#ebBody");
    els.body.addEventListener("scroll", onBodyScroll);
    els.note = overlay.querySelector("#ebNote");
    els.empty = overlay.querySelector("#ebEmpty");
    els.count = overlay.querySelector("#ebCount");
    els.status = overlay.querySelector("#ebStatus");

    var chipHost = overlay.querySelector("#ebCats");
    for (var i = 0; i < CATS.length; i++) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "eb-chip" + (CATS[i][0] === "all" ? " eb-on" : "");
      b.dataset.cat = CATS[i][0];
      b.textContent = CATS[i][1];
      b.addEventListener("click", function () {
        state.cat = this.dataset.cat;
        var all = chipHost.querySelectorAll(".eb-chip");
        for (var j = 0; j < all.length; j++) all[j].classList.toggle("eb-on", all[j] === this);
        applyFilter();
      });
      chipHost.appendChild(b);
    }

    var search = overlay.querySelector("#ebSearch");
    var t = null;
    search.addEventListener("input", function () {
      var v = this.value;
      clearTimeout(t);
      t = setTimeout(function () { state.q = v.trim().toLowerCase(); applyFilter(); }, 120);
    });
    overlay.querySelector("#ebSort").addEventListener("change", function () {
      state.sort = this.value;
      if (!data) return;
      var list = data.items.slice();
      if (state.sort === "az") list.sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0; });
      if (state.sort === "za") list.sort(function (a, b) { return a.name.toLowerCase() > b.name.toLowerCase() ? -1 : a.name.toLowerCase() < b.name.toLowerCase() ? 1 : 0; });
      data.items = list;
      els.grid.innerHTML = "";
      buildGrid();
    });
    overlay.querySelector(".eb-x").addEventListener("click", close);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    document.addEventListener("keydown", escKey);
    return overlay;
  }

  function escKey(e) {
    if (e.key !== "Escape") return;
    if (closeLightbox()) return;
    if (els && els.overlay) close();
  }

  function open() {
    injectCss();
    if (!els || !els.overlay || !document.body.contains(els.overlay)) buildModal();
    els.overlay.hidden = false;
    els.overlay.querySelector("#ebSearch").value = "";
    state.q = "";
    if (data) { showGrid(); return; }
    els.grid.hidden = true;
    els.empty.hidden = true;
    els.count.textContent = "";
    els.note.textContent = "⏳ Downloading the emoji pack…";
    els.note.hidden = false;
    loadData(function (ok, err) {
      if (!ok) { els.note.textContent = "⚠️ " + err; els.note.hidden = false; return; }
      showGrid();
    });
  }

  function showGrid() {
    els.note.hidden = true;
    els.grid.hidden = false;
    if (!els.grid.children.length) buildGrid(); else applyFilter();
    setTimeout(function () { try { els.overlay.querySelector("#ebSearch").focus(); } catch (e) {} }, 40);
  }

  function close() {
    if (!els || !els.overlay) return;
    els.overlay.hidden = true;
    closeLightbox();
  }

  window.t2iOpenEmojiBrowser = function () { open(); };
  window.t2iCloseEmojiBrowser = function () { close(); };

  /* ------------------------------------------------- the comment-area buttons */
  /* The Image Generator tab's comment box is produced by the framework; with
     `socialFeatures = disabled` in main.pjs it stays empty, so the "😀 Emoji browser"
     bar has nothing to attach to (it reappears on its own if socials are re-enabled). */
  var genObserver = null, genObserved = null;

  function syncGenBar() {
    var ctn = document.getElementById("commentsPluginCtn654732");
    if (!ctn || !ctn.parentNode) return;
    var hasComments = ctn.children.length > 0 || String(ctn.innerHTML).trim().length > 0;
    var bar = document.getElementById("ebGenBar");
    if (!hasComments) { if (bar && bar.parentNode) bar.parentNode.removeChild(bar); return; }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "ebGenBar";
      bar.className = "eb-comment-bar";
      bar.innerHTML = '<button type="button" class="eb-open-btn">😀 Emoji browser<span class="eb-comment-bar-hint"> — click a custom emoji to copy its :code:, then paste it into your comment</span></button>';
      bar.querySelector("button").addEventListener("click", open);
      ctn.parentNode.insertBefore(bar, ctn);
    }
    bar.hidden = ctn.style.display === "none";
  }

  function watchGenComments() {
    var ctn = document.getElementById("commentsPluginCtn654732");
    if (!ctn) return;
    if (genObserved !== ctn) {
      if (genObserver) genObserver.disconnect();
      genObserved = ctn;
      genObserver = new MutationObserver(syncGenBar);
      genObserver.observe(ctn, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
    }
    syncGenBar();
  }

  var decorateTries = 0;
  (function decorate() {
    watchGenComments();
    if (!genObserved && decorateTries++ < 40) setTimeout(decorate, 700);
  })();

  if (window.showTab && !window.__ebTabHook) {
    window.__ebTabHook = true;
    var orig = window.showTab;
    window.showTab = function () {
      var r = orig.apply(this, arguments);
      try { if (window.__activeTab === "gen") watchGenComments(); } catch (e) {}
      return r;
    };
  }
})();
