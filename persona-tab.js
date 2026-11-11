/* ===== 🧑 Persona Generator tab ===============================================
   A full character-building workspace that reuses the shared multi-pass persona
   engine (`src/persona.js`). It brings together everything the app's other
   persona flows can do (tone, extra sparkle, instruction box, streaming name +
   description, chat-with-them, prompt history, autosave) and adds a lot more:

     • IMPORT IMAGES FROM THE GALLERY — pick one or several saved images and the
       prompts that made them come along automatically. Choose which reference is
       "primary" (the one the character's look is based on), edit any reference's
       prompt, or drop a reference entirely. You can also add a prompt by hand, or
       upload an image and let the AI describe it for you. No reference at all is
       fine too — the brief alone is enough to invent someone.
     • 🖼️ STARTER SPOT — an image sent over from an image tab lands here with
       the prompt that made it plus the image-generator options that came with
       it (art style, brief, tone) — review, apply, add as a reference, generate.
     • MUCH RICHER OPTIONS — tone (plus an optional Tone mix + Tone merge style
        pair blending a second voice in, mirroring the genre merge), depth/length, number of roleplay examples,
       output language, content rating, gender + pronouns, genre/setting,
       relationship-to-{{user}}, a locked name, things to avoid, an extra
       instructions box, and fifty-four optional extra sections (skills, social
       life and first impressions, sensory signature, fears, sleep and dreams,
       health and scars, education and mentors, work and money, faith and
       superstitions, regrets, ambitions, politics, hobbies, romance/intimacy,
       and a body/appearance group — alternative outfits, underwear, unclothed
       appearance, intimate anatomy, turn-ons, sexual experience, fantasies,
       tattoos, piercings, grooming — see
       `window.t2i_personaOptions.extraSections` for the full list). Plus
       🎲 Surprise me, ↺ Reset and named presets.
     • PER-SECTION REWRITE & ADD — every section of the finished character is
       listed with 📋 copy, ↻ rewrite and 🗑 delete buttons, so you can copy, fix or drop one
       part without regenerating the whole thing (rewrite uses
       `t2i_generatePersonaSection`, same cached prefix; delete uses
       `t2i_removePersonaSection`, raw-preserving). A linked Lorebook section
       additionally lists its ## entries, each with its own 📋 copy + 🗑 delete that copies
       just that entry out of the description or wipes
       just that entry out of the description (and out of the lorebook manager
       when the titles match). The same card has an "➕ Add & generate" row: pick any of
       the built-in extra sections that this character doesn't have yet (or type
       a custom heading) and it's generated from the same options/prompts and the
       current character as context, then appears with its own 📋 copy + ↻ rewrite buttons.
       Custom headings are registered via `window.t2i_registerPersonaHeading`
       (persisted, so they keep parsing after a reload). ✍️ Prompt starters let
       the user steer what an added section says: a shared one applies to every
       section in the batch and a per-section one (one input per ticked section in
       the picker) layers on top for that heading; both end up as
       `opts.sectionStarter`.
     • Handoff — chat with them (adds the character straight into this page's
       💬 AI Chat tab), generate a 🎨 portrait, save to the 📚 vault, add to the 🧑
       roster, copy/export, browse 📋 prompt history and 🔗 share the setup.
     • SAVED LIBRARY + COMBINE — finished characters are kept in a per-browser
       kv library (`root.kv.personaVault`, key `list`): load/rename/export/delete them,
       or tick two or more and 🧬 combine them into one fused character (see
       `t2i_combinePersonas` in persona.js). Each row's ⬇️ exports a 📄 Markdown
        or 📇 character-card .json file, both bundling the portrait, reference
        images and lorebook link saved with the character. Full-site backup includes them.
     • IMPORT — 📥 bring a character in from a .txt / .md / .json file (character card or 🧩 setup file,
        which restores options, refs, lorebook, chat-fit and portrait with full fidelity)
       file, a drag-&-drop, or typed/pasted text, then save it to the library
       and/or load it into the editor.

   Self-booting IIFE: `index.html`'s showTab("persona") lazy-loads persona.js
   first (the engine + option tables), then this file, and calls
   `window.__personaOnShow()`. All styles are in index.html (`.pgen-*`).
   ============================================================================= */
(function () {
  "use strict";

  var LS_OPTS = "t2iPersonaTabV1";
  var LS_REFS = "t2iPersonaTabRefsV1";
  var LS_LAST = "t2iPersonaTabLastV1";
  var LS_PRESETS = "t2iPersonaTabPresetsV1";
  var LS_SEC_STARTER = "t2iPersonaSectionStarter";
  var LS_SEC_STARTERS = "t2iPersonaSectionStarters";
  var LS_LORE = "t2iPersonaTabLoreV1";
  var LS_CHATFIT = "t2iPersonaTabChatFitV1";
  var LS_STARTER = "t2iPersonaTabStarterV1";

  var APP = null;
  var st = {
    opts: null,
    refs: [],
    starter: null, // 🖼️ incoming image from an image tab, waiting in the Starter spot
    portrait: null,
    portraitKind: "",
    portraitPoster: "",
    persona: { name: "", description: "", sections: [] },
    lore: { name: "", description: "", entries: [] },
    // 💬 Chat fit: which sections stay in the always-sent core vs move to the
    // on-demand lorebook, plus the distilled essence/reminder and the published
    // lore file. The description text itself is never touched by any of this.
    chat: { loreHeads: [], essence: "", reminder: "", loreUrl: "", loreName: "", loreEditKey: "", group: 1 },
    activeId: null
  };
  var genObj = null;
  var built = false;
  var sectionTimer = null;
  var secBusy = false;      // a section is being written right now (single or bulk)
  var bulkActive = false;   // the multi-section "Add & generate" loop is running
  var secAddBusy = false;   // a ➕ add-to rewrite pass is running right now
  var pickList = [];        // headings ticked in the 🧩 Add sections picker
  var pickOverlay = null;
  var pickEsc = null;
  // 🔍 duplicate-sections checker (The character card): analysis state for the
  // sideways-scrolling pop-up. dupGroups = whole sections repeating each
  // other; dupSelf = single sections repeating themselves; dupView switches
  // which list the pop-up's track shows.
  var dupOverlay = null;
  var dupEsc = null;
  var dupGroups = [];
  var dupSelf = [];
  var dupView = "between";
  var dupIdx = 0;
  var dupMode = "balanced";
  var dupScrollT = 0;
  var dupReorgBusy = false;   // an AI reorganize pass is running (single or all)
  // 🎲 dice ideas for the picker's custom-heading box — deliberately nothing
  // from the built-in extras/core lists, so every roll is a genuinely new idea.
  var pickDiceIdeas = ["Darkest Memory", "Defining Moment", "Childhood Home", "Family Traditions", "Old Flames", "First Heartbreak", "Bucket List", "Five-Year Plan", "Morning Ritual", "Cooking Style", "Reading Habits", "Travel Stories", "Life on the Road", "Criminal Record", "Sworn Enemies", "Unsent Letters", "Diary Excerpts", "Secret Identity", "Double Life", "Undercover Past", "Military Service", "Prison Time", "Exile Years", "Orphan Years", "Raised on the Streets", "Circus Years", "Years at Sea", "Raised on a Farm", "Disgraced Noble", "Escaped Cult", "Internet Presence", "Love Language", "Flirting Style", "The Ex Files", "Parenting Style", "Relationship Dealbreakers", "Aftercare Style", "Sexual History", "Body Count", "Confirmed Kills", "Price on Their Head", "Heist History", "Bar Fight Stories", "Catchphrase", "Coffee Order", "Midnight Snacks", "Road Trip Rules", "Rainy Day Rituals", "Ghost Encounter", "Near-Death Experience", "Unfinished Thesis", "Half-Built Inventions", "Garden & Plants", "Party Trick", "Leadership Style"];
  var secStarter = "";      // optional prompt starter that steers the "Add sections" output
  var secStarters = {};      // per-heading prompt starters (heading -> text), used on top of secStarter
  var locateHeading = null;  // press-and-hold target: highlighted section in 🧩 Section tools

  /* --------------------------------------------------------------- helpers */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function copyText(t) {
    return new Promise(function (resolve) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(t).then(function () { resolve(true); }, function () { resolve(fallback()); });
          return;
        }
      } catch (e) {}
      resolve(fallback());
      function fallback() {
        try {
          var ta = document.createElement("textarea");
          ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
          document.body.appendChild(ta); ta.select();
          document.execCommand("copy"); ta.remove(); return true;
        } catch (e) { return false; }
      }
    });
  }
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "pgen-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2200);
  }
  function waitForGlobal(name, ms) {
    ms = ms || 8000;
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function tick() {
        if (window[name]) return resolve(window[name]);
        if (Date.now() - t0 >= ms) return resolve(null);
        setTimeout(tick, 150);
      })();
    });
  }
  // persona prompt history + autosave live in gen-extras.js, which is only loaded
  // on the gen/Pro tabs — pull it in on demand when the persona tab needs it.
  function ensureExtras() {
    if (window.t2i_autosavePersonaPrompt && window.t2i_openPersonaPromptHistory) return Promise.resolve(true);
    if (window.ensureGenExtras) window.ensureGenExtras();
    return waitForGlobal("t2i_openPersonaPromptHistory", 9000).then(function () { return true; });
  }
  function options() {
    return window.t2i_personaOptions || {
      tones: [{ id: "auto", label: "✨ Auto (surprise me)" }],
      depths: [{ id: "balanced", label: "📗 Balanced" }],
      languages: ["English"], ratings: [{ id: "sfw", label: "🍃 Safe for work" }],
      genders: [{ id: "auto", label: "✨ Let the AI decide" }],
      genres: ["(grounded / no particular genre)"],
      mergeStyles: [{ id: "auto", label: "✨ Default (let AI decide)" }],
      relationships: [{ id: "", label: "(leave it to the AI)" }],
      occultTypes: [{ id: "none", label: "✨ None / not occult" }],
      extraSections: []
    };
  }
  function genreId(g) { return (typeof g === "string") ? g : ((g && g.id) || ""); }
  function genreList() { return (options().genres || []).slice(); }
  function genreKnown(g) { return genreList().some(function (x) { return genreId(x) === g; }); }
  function syncGenreUI(selId, customId, key, allowNone) {
    var s = selId || "pgen-ogenre", c = customId || "pgen-ogenrecustom", k = key || "genre";
    var gs = $(s); if (!gs || !gs.options.length) return;
    var cur = st.opts[k] || "";
    var known = genreKnown(cur) || (!!allowNone && cur === "");
    gs.value = known ? cur : "custom";
    if (gs.selectedIndex < 0) gs.selectedIndex = 0;
    var gc = $(c);
    if (gc) { gc.hidden = gs.value !== "custom"; if (gs.value === "custom") gc.value = cur; }
  }
  function readGenreUI(selId, customId, key) {
    var s = selId || "pgen-ogenre", c = customId || "pgen-ogenrecustom", k = key || "genre";
    var gs = $(s);
    if (!gs) return st.opts[k] || "";
    if (gs.value === "custom") return (($(c) || {}).value || "").trim();
    return gs.value || "";
  }
  // The mix select shares the same preset list, headed by an explicit no-mix option.
  function genreMixList() { return [{ id: "", label: "(no mix — single genre)" }].concat(genreList()); }
  // 🔎 Genre search matcher (mirrors t2i_toneMatches): every whitespace-separated
  // word must appear somewhere in the genre's id, label, group or hint.
  function genreMatches(g, query) {
    var q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    var id = genreId(g);
    var lab = (typeof g === "string") ? g : ((g && g.label) || "");
    var grp = (typeof g === "string") ? "" : ((g && g.group) || "");
    var hint = (typeof g === "string") ? "" : ((g && g.hint) || "");
    var hay = (id + " " + lab + " " + grp + " " + hint).toLowerCase();
    var words = q.split(/\s+/);
    for (var w = 0; w < words.length; w++) if (hay.indexOf(words[w]) < 0) return false;
    return true;
  }
  // Rebuild one genre select for a search query. The saved pick is always kept
  // displayed (re-inserted right below the header when filtered out) because
  // generation reads the selects directly — filtering must never silently
  // switch the genre behind the user's back. Returns the match count
  // (excluding the header / custom / placeholder rows).
  function refillGenre(selId, customId, key, allowNone, query) {
    var gs = $(selId);
    if (!gs) return 0;
    var q = String(query || "").trim();
    var list = [];
    if (allowNone) list.push({ id: "", label: "(no mix — single genre)" });
    var src = genreList(), n = 0, i;
    for (i = 0; i < src.length; i++) {
      if (genreMatches(src[i], q)) { list.push(src[i]); n++; }
    }
    var cur = st.opts[key] || "";
    var known = genreKnown(cur) || (!!allowNone && cur === "");
    var keptSaved = false;
    if (known && q && cur !== "" && !list.some(function (x) { return genreId(x) === cur; })) {
      var entry = genreEntry(cur) || { id: cur, label: cur };
      list.splice(allowNone ? 1 : 0, 0, entry);
      keptSaved = true;
    }
    if (!n) list.push({ id: "__nomatch__", label: "No genres match — clear the search", disabled: true });
    list.push({ id: "custom", label: "✏️ Custom…" });
    fillSelect(gs, list, known ? cur : "custom");
    if (gs.selectedIndex < 0 && gs.options.length) gs.selectedIndex = 0;
    // Tag the re-inserted saved pick so Enter skips it (it isn't a match —
    // it's only kept displayed so filtering never silently switches genres).
    if (keptSaved) {
      for (var k = 0; k < gs.options.length; k++) {
        if (gs.options[k].value === cur && !gs.options[k].disabled) { gs.options[k].setAttribute("data-saved-kept", "1"); break; }
      }
    }
    var gc = $(customId);
    if (gc) {
      gc.hidden = gs.value !== "custom";
      if (gs.value === "custom" && !known) gc.value = cur;
    }
    return n;
  }
  // Genre / setting is a public feature — every visitor sees the selects and
  // generation honours them (including via presets / share links /
  // localStorage). Only the incest-family TONES stay owner-only (see below).
  function isOwner() {
    try { if (typeof window.__t2iIsOwnerAuthed === "function" && window.__t2iIsOwnerAuthed()) return true; } catch (e) {}
    try { if (window.__t2iOwnerAuthed) return true; } catch (e) {}
    return false;
  }
  // 🔒 Incest-family tones are owner-only.
  // Public visitors never see them (t2i_fillToneSelect filters), and anything
  // smuggled via presets / share links / localStorage / console is reset here
  // and dropped engine-side (t2i_buildPersonaInstruction).
  function toneLocked(id) {
    try { if (window.t2i_toneOwnerOnly) return !!window.t2i_toneOwnerOnly(id); } catch (e) {}
    return false;
  }
  function enforceToneLockOnOpts() {
    if (!st.opts) return;
    if (isOwner()) return;
    if (toneLocked(st.opts.tone)) st.opts.tone = "auto";
    if (toneLocked(st.opts.toneMix)) st.opts.toneMix = "";
  }
  // Owner unlock/lock only affects the owner-only tones now (genres are public
  // for everyone): reveal or hide them without a reload, preserving any active
  // search query in the tone search box.
  if (typeof document !== "undefined" && document.addEventListener && !window.__personaToneRefillHooked) {
    window.__personaToneRefillHooked = true;
    document.addEventListener("t2i-owner-auth", function () {
      try {
        if (window.__pgenRefillTones) { window.__pgenRefillTones(); }
        else {
          var ts = document.getElementById("pgen-otone");
          if (ts && window.t2i_fillToneSelect) window.t2i_fillToneSelect(ts, ts.value);
        }
      } catch (e) {}
    });
  }
  function wireGenre(selId, customId, key, allowNone) {
    var gsel = $(selId);
    if (!gsel) return;
    var list = (allowNone ? genreMixList() : genreList()).concat([{ id: "custom", label: "✏️ Custom…" }]);
    var cur = st.opts[key] || "";
    var known = genreKnown(cur) || (!!allowNone && cur === "");
    fillSelect(gsel, list, known ? cur : "custom");
    syncGenreUI(selId, customId, key, allowNone);
    gsel.onchange = function () {
      if (gsel.value === "custom") {
        var gc2 = $(customId);
        if (gc2) {
          gc2.hidden = false;
          gc2.value = (/^\(/.test(st.opts[key] || "") || genreKnown(st.opts[key])) ? "" : (st.opts[key] || "");
          st.opts[key] = gc2.value;
          try { gc2.focus(); } catch (e) {}
        }
      } else {
        st.opts[key] = gsel.value;
        var gc3 = $(customId);
        if (gc3) gc3.hidden = true;
      }
      saveOpts();
    };
  }
  function genreEntry(id) {
    var list = genreList();
    for (var i = 0; i < list.length; i++) {
      if (genreId(list[i]) === id) return (typeof list[i] === "string") ? null : list[i];
    }
    return null;
  }
  function mergeEntry(id) {
    var O = options();
    var list = (O.mergeStyles && O.mergeStyles.length) ? O.mergeStyles : [{ id: "auto", label: "\u2728 Default (let AI decide)", hint: "" }];
    for (var i = 0; i < list.length; i++) {
      var it = list[i], itId = (typeof it === "string") ? it : it.id;
      if (itId === id) return (typeof it === "string") ? null : it;
    }
    return null;
  }
  // Host element for the combined-genre preview. Created lazily right after the
  // genre row so it survives markup edits — callers never touch innerHTML.
  function blendHost() {
    var host = $("pgen-blend");
    if (host) return host;
    var merge = $("pgen-omerge");
    if (!merge || !merge.parentNode) return null;
    host = document.createElement("div");
    host.id = "pgen-blend";
    host.className = "pgen-blend";
    host.hidden = true;
    var row = merge.closest ? merge.closest(".pgen-row2") : null;
    if (row && row.parentNode) row.parentNode.insertBefore(host, row.nextSibling);
    else merge.parentNode.appendChild(host);
    return host;
  }
  // Shows the active genre blend as ONE item ("mix × base — style") whose hover
  // tooltip describes the combination: the merge instruction exactly as the
  // engine renders it into the brief, plus each known genre's own flavour line.
  // Hidden unless a real mix is active (same condition as optionsBlock).
  function syncBlendPreview() {
    var host = blendHost();
    if (!host || !st.opts) return;
    var base = st.opts.genre || "", mix = st.opts.genreMix || "";
    if (!mix || /^\(/.test(mix) || mix === base) {
      host.hidden = true; host.textContent = ""; host.title = ""; return;
    }
    var effBase = (base && !/^\(/.test(base)) ? base : "the story";
    var md = mergeEntry(st.opts.mergeStyle) || { id: "auto", label: "\u2728 Default (let AI decide)", hint: "" };
    var styleName = String(md.label || md.id || "auto").replace(/^[^A-Za-z0-9]+/, "");
    var mergeText = md.hint
      ? String(md.hint).split("{mix}").join(mix).split("{base}").join(effBase)
      : "blend " + mix + " into " + effBase + " in whatever way suits the character best.";
    host.textContent = "\u{1F9EC} " + mix + " \u00D7 " + effBase + (md.hint ? " — " + styleName : "");
    var parts = [mergeText];
    var b = genreEntry(base), m = genreEntry(mix);
    if (b && b.hint && base && !/^\(/.test(base)) parts.push(base + ": " + b.hint);
    if (m && m.hint) parts.push(mix + ": " + m.hint);
    host.title = parts.join("\n");
    host.hidden = false;
  }
  // ---- wild spark ---------------------------------------------------------------
  // The 🎲 Roll button (and 🎲 Surprise me) drops one contradictory oddity
  // into st.opts.wildcard, which the engine brief picks up like any seed.
  // The span is display-only; st.opts is the source of truth.
  function renderWildcard() {
    var t = $("pgen-owild-text"), w = (st.opts && st.opts.wildcard) || "";
    if (t) {
      t.textContent = w;
      t.parentNode.hidden = false;
      t.classList.toggle("pgen-wild-empty", !w);
      if (!w) t.textContent = "no wild spark — roll one, or leave them sensible";
    }
  }
  function rollWildcard() {
    var w = "";
    try { w = window.t2i_personaWildcard ? (window.t2i_personaWildcard() || "") : ""; } catch (e) { w = ""; }
    if (!w) { toast("⚠️ sparks not loaded yet"); return; }
    st.opts.wildcard = w;
    saveOpts(); renderWildcard();
  }
  function fillSelect(sel, list, val) {
    sel.innerHTML = "";
    /* Items may carry a `group` name — consecutive items sharing one are wrapped in an
       <optgroup> so long lists (e.g. the ~95 relationships) stay navigable. Items without a
       group are appended straight to the select, so single-group lists render as before. */
    var host = sel, lastGroup = null;
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var grp = (typeof it === "string") ? null : (it.group || null);
      if (grp !== lastGroup) {
        lastGroup = grp;
        if (grp) { host = document.createElement("optgroup"); host.label = grp; sel.appendChild(host); }
        else host = sel;
      }
      var o = document.createElement("option");
      o.value = (typeof it === "string") ? it : it.id;
      o.textContent = (typeof it === "string") ? it : (it.label || it.id);
      if (typeof it !== "string" && it.disabled) o.disabled = true; // e.g. the genre search "no match" placeholder
      if (typeof it !== "string" && it.hint) o.title = it.hint; // hover tooltip (genres, merge styles, …)
      host.appendChild(o);
    }
    if (val != null) { sel.value = val; if (sel.selectedIndex < 0 && sel.options.length) sel.selectedIndex = 0; }
  }

  /* --------------------------------------------------------------- state IO */
  function defaultOpts() {
    return {
      tone: lsGet("t2i_persona_tone") || "auto",
      lively: lsGet("t2i_persona_lively") === "1",
      depth: "balanced",
      exampleCount: 10,
      language: "English",
      rating: "sfw",
      gender: "auto",
      pronouns: "",
      occultType: "none",
      genre: genreId((options().genres || ["(grounded / no particular genre)"])[0]),
      genreMix: "",
      mergeStyle: "auto",
      toneMix: "",
      toneMergeStyle: "auto",
      relationship: "",
      relationshipCustom: "",
      name: "",
      age: "",
      ageAmbiguous: false,
      avoid: "",
      extras: [],
      instruction: "",
      flaw: "",
      contradiction: "",
      want: "",
      need: "",
      secret: "",
      secretFrom: "",
      pressure: "",
      wildcard: ""
    };
  }
  function loadState() {
    st.opts = defaultOpts();
    try {
      var o = JSON.parse(lsGet(LS_OPTS) || "null");
      if (o && typeof o === "object") Object.assign(st.opts, o);
    } catch (e) {}
    try { enforceToneLockOnOpts(); } catch (e) {}
    try {
      var r = JSON.parse(lsGet(LS_REFS) || "null");
      if (Array.isArray(r)) st.refs = r.filter(function (x) { return x && (x.url || x.prompt); });
    } catch (e) {}
    try {
      var stt = JSON.parse(lsGet(LS_STARTER) || "null");
      if (stt && typeof stt === "object" && (stt.url || stt.prompt)) {
        st.starter = {
          url: String(stt.url || ""), kind: String(stt.kind || ""), poster: String(stt.poster || ""),
          prompt: String(stt.prompt || ""), style: String(stt.style || "").slice(0, 160),
          brief: String(stt.brief || ""), tone: String(stt.tone || "").slice(0, 80),
          toneLabel: String(stt.toneLabel || "").slice(0, 160),
          title: String(stt.title || "").slice(0, 160),
          source: String(stt.source || "gen").slice(0, 20), ts: stt.ts || 0
        };
      }
    } catch (e) {}
    try {
      var last = JSON.parse(lsGet(LS_LAST) || "null");
      if (last && typeof last.description === "string") {
        st.persona = { name: last.name || "", description: last.description, sections: [] };
        st.activeId = last.activeId || null;
      }
    } catch (e) {}
    try {
      var lb = JSON.parse(lsGet(LS_LORE) || "null");
      if (lb && typeof lb === "object") st.lore = sanitizeLorebook(lb);
    } catch (e) {}
    try {
      var cf = JSON.parse(lsGet(LS_CHATFIT) || "null");
      if (cf && typeof cf === "object") st.chat = sanitizeChatFit(cf);
    } catch (e) {}
    if (!st.refs.some(function (r) { return r.primary; }) && st.refs.length) st.refs[0].primary = true;
  }
  function saveOpts() {
    lsSet(LS_OPTS, JSON.stringify(st.opts));
    lsSet("t2i_persona_tone", st.opts.tone);
    lsSet("t2i_persona_lively", st.opts.lively ? "1" : "0");
    try { syncBlendPreview(); } catch (e) {}
    // Keep the 💾 button's • dot live when top options change (debounced —
    // the dirty check stringifies the lorebook, which can be large).
    try { scheduleSaveButton(); } catch (e) {}
  }
  // Debounced 💾 dot refresh for high-frequency paths (option keystrokes,
  // ref edits). loreSave/chatSave/renderSaved already refresh synchronously.
  var saveBtnTimer = null;
  function scheduleSaveButton() {
    try {
      clearTimeout(saveBtnTimer);
      saveBtnTimer = setTimeout(function () { try { updateSaveButton(); } catch (e) {} }, 250);
    } catch (e) {}
  }
  function saveRefs() {
    try {
      var slim = st.refs.map(function (r) {
        return { id: r.id, url: /^data:/i.test(r.url || "") ? "" : (r.url || ""), kind: r.kind || "", poster: (r.poster && r.poster.length < 100000) ? r.poster : "", prompt: r.prompt || "", title: r.title || "", folder: r.folder || "", use: r.use !== false, primary: !!r.primary, manual: !!r.manual };
      });
      lsSet(LS_REFS, JSON.stringify(slim));
    } catch (e) {}
    try { scheduleSaveButton(); } catch (e) {}
  }
  function saveLast() {
    // read from the live fields when they exist (so we never persist stale state)
    var nameEl = $("pgen-name"), descEl = $("pgen-desc");
    var name = nameEl ? nameEl.value : (st.persona.name || "");
    var description = descEl ? descEl.value : (st.persona.description || "");
    st.persona.name = name;
    st.persona.description = description;
    try { lsSet(LS_LAST, JSON.stringify({ name: name, description: description, activeId: st.activeId || null })); } catch (e) {}
  }
  function sanitizeLorebook(lb) {
    var out = { name: "", description: "", entries: [] };
    if (!lb || typeof lb !== "object") return out;
    out.name = String(lb.name || "").slice(0, 120);
    out.description = String(lb.description || "").slice(0, 2000);
    (Array.isArray(lb.entries) ? lb.entries : []).slice(0, 500).forEach(function (e) {
      if (!e || typeof e !== "object") return;
      var content = String(e.content || "").trim();
      if (!content) return;
      var keys = Array.isArray(e.keys) ? e.keys.map(String).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 20)
        : String(e.keys || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 20);
      out.entries.push({ id: String(e.id || uid()), title: String(e.title || e.name || "").slice(0, 120), keys: keys, content: content.slice(0, 4000) });
    });
    return out;
  }
  function loreSave() {
    try { lsSet(LS_LORE, JSON.stringify(st.lore)); } catch (e) {}
    try { updateSaveButton(); } catch (e) {}
  }
  // ---- 💬 chat-fit state ----------------------------------------------------
  // Working-state persist (per browser, like the lorebook). Saved personas carry
  // their own snapshot via recordFor/applyImportedPersona/loadSavedPersona.
  function sanitizeChatFit(c) {
    var out = { loreHeads: [], essence: "", reminder: "", loreUrl: "", loreName: "", loreEditKey: "", group: 1, enabled: false };
    if (!c || typeof c !== "object") return out;
    if (Array.isArray(c.loreHeads)) out.loreHeads = c.loreHeads.map(String).filter(Boolean).slice(0, 100);
    out.essence = String(c.essence || "").slice(0, 12000);
    out.reminder = String(c.reminder || "").slice(0, 2000);
    out.loreUrl = String(c.loreUrl || "").slice(0, 500);
    out.loreName = String(c.loreName || "").slice(0, 200);
    out.loreEditKey = String(c.loreEditKey || "").slice(0, 500);
    var g = parseInt(c.group, 10);
    out.group = (g >= 2 && g <= 3) ? g : 1;
    out.enabled = c.enabled === true;
    return out;
  }
  function chatSave() {
    try { lsSet(LS_CHATFIT, JSON.stringify(st.chat)); } catch (e) {}
    try { updateSaveButton(); } catch (e) {}
  }
  function applyChatState(saved) {
    st.chat = sanitizeChatFit(saved || {});
    chatSave();
    try { renderChatFit(); } catch (e) {}
    try { updateChatFit(); } catch (e) {}
  }

  /* ------------------------------------------------------------- references */
  function uid() { return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function activeRefs() { return st.refs.filter(function (r) { return r.use !== false && String(r.prompt || "").trim(); }); }
  function primaryRef() {
    var act = activeRefs();
    for (var i = 0; i < act.length; i++) if (act[i].primary && act[i].url) return act[i];
    for (var j = 0; j < act.length; j++) if (act[j].url) return act[j];
    return act[0] || null;
  }
  function anyAvatarUrl() {
    if (st.portrait) return st.portrait;
    for (var i = 0; i < st.refs.length; i++) if (st.refs[i].url) return st.refs[i].url;
    return "";
  }
  function avatarMedia() {
    if (st.portrait) return { url: st.portrait, kind: st.portraitKind || AMKind(st.portrait), poster: st.portraitPoster || "" };
    for (var i = 0; i < st.refs.length; i++) if (st.refs[i].url) return { url: st.refs[i].url, kind: st.refs[i].kind || AMKind(st.refs[i].url), poster: st.refs[i].poster || "" };
    return { url: "", kind: "", poster: "" };
  }
  function AMKind(url, hint) {
    try { if (window.AvatarMedia) return window.AvatarMedia.kindOf(url, hint); } catch (e) {}
    return "";
  }
  function AMThumb(url, cls, hint, poster) {
    try { if (window.AvatarMedia) return window.AvatarMedia.thumbHtml(url, cls, hint, poster); } catch (e) {}
    return '<img class="' + cls + '" loading="lazy" src="' + esc(url) + '" alt="">';
  }
  function chatAvatarUrl() {
    var m = avatarMedia();
    if (m.kind === "video") return m.poster || "";
    return m.url;
  }
  function buildImagePrompt() {
    var list = activeRefs().slice();
    if (!list.length) return "";
    list.sort(function (a, b) { return (b.primary ? 1 : 0) - (a.primary ? 1 : 0); });
    return list.map(function (r, i) {
      return "Reference " + (i + 1) + (r.primary ? " (PRIMARY — this is exactly who the character is)" : "") + ":\n" + String(r.prompt || "").trim();
    }).join("\n\n");
  }
  function addRef(data) {
    var r = {
      id: uid(),
      url: data.url || "",
      kind: data.kind || AMKind(data.url),
      poster: data.poster || "",
      prompt: data.prompt || "",
      title: data.title || "",
      folder: data.folder || "",
      use: true,
      primary: !st.refs.some(function (x) { return x.primary; }),
      manual: !!data.manual
    };
    st.refs.push(r);
    saveRefs(); renderRefs();
    return r;
  }
  function setPrimary(id) {
    st.refs.forEach(function (r) { r.primary = (r.id === id); });
    saveRefs(); renderRefs();
  }

  function renderRefs() {
    var host = $("pgen-refs");
    if (!host) return;
    host.innerHTML = "";
    var count = activeRefs().length;
    var badge = $("pgen-refcount");
    if (badge) badge.textContent = String(count);
    var emptyEl = $("pgen-ref-empty");
    if (emptyEl) emptyEl.hidden = st.refs.length > 0;
    st.refs.forEach(function (r) {
      var card = document.createElement("div");
      card.className = "pgen-ref" + (r.use === false ? " pgen-ref-off" : "");
      card.dataset.id = r.id;
      var thumb = r.url
        ? AMThumb(r.url, "pgen-ref-img", r.kind, r.poster)
        : '<div class="pgen-ref-ph">📝</div>';
      card.innerHTML =
        thumb +
        '<div class="pgen-ref-body">' +
          '<div class="pgen-ref-tools">' +
            '<label class="pgen-ref-rad" title="Use this image to define how the character looks"><input type="radio" name="pgen-primary"' + (r.primary ? " checked" : "") + '> primary</label>' +
            '<label class="pgen-ref-use" title="Include this reference at all"><input type="checkbox"' + (r.use !== false ? " checked" : "") + '> use</label>' +
            (r.title || r.folder ? '<span class="pgen-ref-meta">' + esc([r.title, r.folder].filter(Boolean).join(" · ")) + "</span>" : "") +
            '<button type="button" class="pgen-ref-x" title="Remove">✖</button>' +
          "</div>" +
          '<textarea class="pgen-ref-prompt" placeholder="The prompt that made this image (edit freely)">' + esc(r.prompt || "") + "</textarea>" +
        "</div>";
      card.querySelector('input[type="radio"]').addEventListener("change", function () { setPrimary(r.id); });
      card.querySelector('input[type="checkbox"]').addEventListener("change", function () { r.use = this.checked; saveRefs(); renderRefs(); });
      card.querySelector(".pgen-ref-x").addEventListener("click", function () {
        st.refs = st.refs.filter(function (x) { return x.id !== r.id; });
        if (st.refs.length && !st.refs.some(function (x) { return x.primary; })) st.refs[0].primary = true;
        saveRefs(); renderRefs();
      });
      var ta = card.querySelector(".pgen-ref-prompt");
      ta.addEventListener("input", function () { r.prompt = ta.value; saveRefs(); updateRefCounts(); });
      ta.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doGenerate(); } });
      host.appendChild(card);
    });
  }
  function updateRefCounts() {
    var badge = $("pgen-refcount");
    if (badge) badge.textContent = String(activeRefs().length);
  }

  /* ------------------------------------------------------- image starter */
  // 🖼️ Starter spot: images sent over from an image tab land here (with the
  // image-generator options that came with them) instead of demanding a
  // persona be generated first. The user reviews the starter, applies its
  // options, and adds it as a reference when ready.
  function saveStarter() {
    try {
      var s = st.starter;
      if (!s) { try { localStorage.removeItem(LS_STARTER); } catch (e) {} return; }
      lsSet(LS_STARTER, JSON.stringify({
        url: /^data:/i.test(s.url || "") ? "" : (s.url || ""),
        kind: s.kind || "", poster: (s.poster && s.poster.length < 100000) ? s.poster : "",
        prompt: s.prompt || "", style: s.style || "", brief: s.brief || "",
        tone: s.tone || "", toneLabel: s.toneLabel || "", title: s.title || "",
        source: s.source || "", ts: s.ts || 0
      }));
    } catch (e) {}
  }
  function starterEmpty(s) {
    return !s || (!s.url && !String(s.prompt || "").trim() && !String(s.brief || "").trim());
  }
  function trunc(s, n) {
    s = String(s == null ? "" : s);
    return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
  }
  function starterRef() {
    if (!st.starter) return null;
    var s = st.starter;
    for (var i = 0; i < st.refs.length; i++) {
      var r = st.refs[i];
      if (s.url && r.url && r.url === s.url) return r;
      if (!s.url && !r.url && s.prompt && r.prompt === s.prompt) return r;
    }
    return null;
  }
  function addStarterRef() {
    var s = st.starter;
    if (!s) return null;
    var r = addRef({
      url: s.url || "", kind: s.kind || "", poster: s.poster || "",
      prompt: s.prompt || "", title: s.title || (s.source === "pro" ? "Pro Imager starter" : "Image Generator starter")
    });
    setPrimary(r.id);
    return r;
  }
  function starterAct(act) {
    var s = st.starter;
    if (!s && act !== "dismiss") return;
    if (act === "dismiss") {
      st.starter = null; saveStarter(); renderStarter();
      toast("🖼️ starter removed");
      return;
    }
    if (act === "addref") {
      if (starterEmpty(s)) { toast("⚠️ starter is empty"); return; }
      var r = starterRef() || addStarterRef();
      if (r) toast("🖼️ starter added as the primary reference");
      return;
    }
    if (act === "generate") {
      if (starterEmpty(s)) { toast("⚠️ starter is empty — add an image or prompt first"); return; }
      var g = starterRef() || addStarterRef();
      if (!g) { toast("⚠️ starter is empty"); return; }
      try {
        var gen = $("pgen-gen");
        if (gen) gen.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (e) {}
      doGenerate();
      return;
    }
    if (act === "brief") {
      if (!s.brief) { toast("⚠️ starter has no brief"); return; }
      var box = $("pgen-oinstruction");
      if (!box) { toast("⚠️ options not ready yet"); return; }
      var cur = String(box.value || "");
      if (cur.indexOf(s.brief) < 0) box.value = (cur ? cur.replace(/\s+$/, "") + "\n\n" : "") + s.brief;
      st.opts.instruction = box.value; saveOpts();
      toast("📝 starter brief added to Extra instructions");
      return;
    }
    if (act === "tone") {
      if (!s.tone) { toast("⚠️ starter has no tone"); return; }
      var sel = $("pgen-otone");
      if (!sel) { toast("⚠️ options not ready yet"); return; }
      var has = false;
      for (var i = 0; i < sel.options.length; i++) {
        if (!sel.options[i].disabled && sel.options[i].value === s.tone) { has = true; break; }
      }
      if (!has) { toast("⚠️ that tone isn't available here"); return; }
      sel.value = s.tone;
      try { sel.dispatchEvent(new Event("change")); } catch (e) { st.opts.tone = s.tone; saveOpts(); }
      toast("🗣️ starter tone applied");
      return;
    }
  }
  function renderStarter() {
    var host = $("pgen-starter");
    if (!host) return;
    host.innerHTML = "";
    var s = st.starter;
    if (!s) { host.hidden = true; return; }
    host.hidden = false;
    var srcName = s.source === "pro" ? "Pro Imager" : s.source === "gallery" ? "Gallery" : "Image Generator";
    var meta = [];
    if (s.style) meta.push("🎨 " + s.style);
    if (s.toneLabel || s.tone) meta.push("🗣️ " + (s.toneLabel || s.tone));
    var card = document.createElement("div");
    card.className = "pgen-starter-card";
    card.innerHTML =
      (s.url ? AMThumb(s.url, "pgen-ref-img", s.kind, s.poster) : '<div class="pgen-ref-ph">🖼️</div>') +
      '<div class="pgen-ref-body">' +
        '<div class="pgen-ref-tools"><b>🖼️ Starter</b>' +
        '<span class="pgen-ref-meta">from ' + esc(srcName) + "</span>" +
        '<button type="button" class="pgen-ref-x" data-sact="dismiss" title="Remove starter">✖</button></div>' +
        (meta.length ? '<div class="pgen-starter-meta">' + esc(meta.join(" · ")) + "</div>" : "") +
        '<textarea class="pgen-ref-prompt" data-sfield="prompt" placeholder="The prompt that made this image">' + esc(s.prompt || "") + "</textarea>" +
        (s.brief ? '<div class="pgen-starter-meta" title="' + esc(s.brief) + '">📝 ' + esc(trunc(s.brief, 140)) + "</div>" : "") +
        '<div class="pgen-starter-btns">' +
          '<button type="button" class="pro-btn" data-sact="addref">➕ Add as reference</button>' +
          '<button type="button" class="pro-btn pro-btn-primary" data-sact="generate">✨ Generate</button>' +
          (s.brief ? '<button type="button" class="pro-btn" data-sact="brief">📝 Brief → instructions</button>' : "") +
          (s.tone ? '<button type="button" class="pro-btn" data-sact="tone">🗣️ Use tone</button>' : "") +
        "</div>" +
      "</div>";
    var ta = card.querySelector('[data-sfield="prompt"]');
    if (ta) ta.addEventListener("input", function () { if (st.starter) { st.starter.prompt = ta.value; saveStarter(); } });
    var btns = card.querySelectorAll("button[data-sact]");
    for (var i = 0; i < btns.length; i++) {
      (function (b) { b.addEventListener("click", function () { starterAct(b.getAttribute("data-sact")); }); })(btns[i]);
    }
    host.appendChild(card);
  }

  /* -------------------------------------------------------- gallery importer */
  async function openGalleryPicker() {
    if (window.ensureGallery) window.ensureGallery();
    var ok = await waitForGlobal("t2iOpenGallery", 9000);
    if (!ok) { toast("⚠️ gallery still loading…"); return; }
    await waitForGlobal("t2iGetGallery", 9000);
    if (window.t2iLoadPeerGallery) { try { await window.t2iLoadPeerGallery(); } catch (e) {} }
    var have = {};
    st.refs.forEach(function (r) { if (r.url) have[r.url] = true; });
    window.t2iOpenGallery({
      pick: {
        title: "🖼️ Pick reference images",
        hint: "Tap images to select them — each one's prompt is imported with it.",
        addNoun: "as references",
        onPick: function (items) {
          var added = 0, skipped = 0;
          (items || []).forEach(function (it) {
            if (!it || !it.url) return;
            if (have[it.url]) { skipped++; return; }
            have[it.url] = true;
            addRef({ url: it.url, kind: it.kind || it.thumbKind || "", poster: it.poster || it.thumbPoster || "", prompt: it.prompt || "", title: it.title || "", folder: it.folder || "" });
            added++;
          });
          if (added) {
            toast("🖼️ added " + added + " reference" + (added === 1 ? "" : "s") + (skipped ? " (" + skipped + " already added)" : ""));
            window.scrollTo({ top: 0, behavior: "smooth" });
          } else if (skipped) {
            toast("⚠️ already in your references");
          }
        }
      }
    });
  }

  /* ------------------------------------------------------- upload & caption */
  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
  function downscale(dataUrl, max) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        try {
          var sc = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.width * sc));
          c.height = Math.max(1, Math.round(img.height * sc));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", 0.82));
        } catch (e) { resolve(dataUrl); }
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }
  var CAPTION_SYS = "You are an expert prompt engineer for text-to-image AI models. You will be shown an image and must write a vivid, faithful prompt that a text-to-image model could use to recreate it — covering the subject(s), their appearance, clothing, expression, pose, the setting, lighting, color palette, style and mood. Be faithful to what is actually in the image; never invent things that are not visible. Output ONLY the prompt itself — no quotes, labels or commentary.";
  async function uploadAndDescribe() {
    var inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*,video/*,.gif";
    inp.addEventListener("change", async function () {
      var file = inp.files && inp.files[0];
      if (!file) return;
      if (!(window.root && window.root.generateText)) { toast("⚠️ AI text not available"); return; }
      var isVid = file.type && /^video\//i.test(file.type);
      var dataUrl = await fileToDataUrl(file);
      var small = isVid ? dataUrl : await downscale(dataUrl, 1024);
      var poster = "";
      if (isVid && window.AvatarMedia) {
        var tmpUrl = URL.createObjectURL(file);
        try { poster = await window.AvatarMedia.videoPoster(tmpUrl, 256); } catch (e) {}
        try { URL.revokeObjectURL(tmpUrl); } catch (e) {}
      }
      var ref = addRef({ url: small, kind: isVid ? "video" : AMKind(dataUrl), poster: poster, prompt: "", title: file.name || "upload" });
      toast("🔍 describing the image…");
      try {
        var blob = await (await fetch(isVid ? (poster || small) : small)).blob();
        var txt = await window.root.generateText({
          instruction: [CAPTION_SYS, blob],
          onChunk: function (data) {
            ref.prompt = String((data && data.fullTextSoFar) || "").trim();
            renderRefs(); saveRefs();
          }
        });
        var finalTxt = (txt && txt.text) || (typeof txt === "string" ? txt : "");
        if (finalTxt) { ref.prompt = finalTxt.trim(); renderRefs(); saveRefs(); }
        toast("✅ image described — edit the prompt if you like");
      } catch (e) {
        console.error(e);
        toast("⚠️ couldn't describe the image — type a prompt for it");
      }
    });
    inp.click();
  }

  /* ------------------------------------------------------------ option UI */
  function buildOptionControls() {
    var O = options();
    var host = $("pgen-opts");
    host.innerHTML = "";
    function row(label, id, list, val, title) {
      var wrap = document.createElement("label");
      wrap.className = "pro-opt";
      if (title) wrap.title = title;
      wrap.innerHTML = "<span>" + esc(label) + "</span>";
      var sel = document.createElement("select");
      sel.id = id; sel.className = "pro-select";
      fillSelect(sel, list, val);
      wrap.appendChild(sel);
      host.appendChild(wrap);
      return sel;
    }
    var toneSel = row("Tone", "pgen-otone", O.tones, st.opts.tone, "The overall flavour the AI writes the character in — 1410 tones grouped by mood, romance, aggression, hostile relatives, dere personalities, anime archetypes, dark, power, archetypes, gire types and nsfw taboo. Explicit/mature tones raise the content rating automatically. Incest-family tones are owner-only.");
    if (window.t2i_fillToneSelect) window.t2i_fillToneSelect(toneSel, st.opts.tone);
    // 🔎 tone search — live-filter the tone list by name, id, group or hint
    // text (e.g. "dere", "possessive"). Filtering never commits: the
    // saved tone only changes when an option is picked, and clearing the box
    // restores the full list with the saved tone re-selected.
    var toneSearchWrap = document.createElement("div");
    toneSearchWrap.className = "pgen-tonesearch";
    var toneSearch = document.createElement("input");
    toneSearch.type = "search";
    toneSearch.id = "pgen-otonesearch";
    toneSearch.className = "pro-input";
    toneSearch.placeholder = "Search tones… e.g. shy, possessive";
    toneSearch.autocomplete = "off";
    toneSearch.title = "Filter both tone lists — matches tone names, groups and descriptions";
    var toneCount = document.createElement("span");
    toneCount.className = "pgen-tonecount";
    toneSearchWrap.appendChild(toneSearch);
    toneSearchWrap.appendChild(toneCount);
    toneSel.parentNode.insertBefore(toneSearchWrap, toneSel);
    // Tone-mix list builder with the same visibility rules as the main list
    // (minus ✨ Auto, which is meaningless as a mix), plus 🔎 search support.
    // String entries are matched against their raw text; the "(no mix)" header
    // is always kept so the mix can be cleared while searching.
    function toneMixEntryMatches(t, query) {
      var q = String(query || "").trim();
      if (!q) return true;
      if (typeof t === "string") {
        var words = q.toLowerCase().split(/\s+/), hay = t.toLowerCase();
        for (var w = 0; w < words.length; w++) if (hay.indexOf(words[w]) < 0) return false;
        return true;
      }
      return window.t2i_toneMatches ? window.t2i_toneMatches(t, q) : true;
    }
    function toneMixEntryList(query) {
      var out = [{ id: "", label: "(no mix — single tone)" }];
      var tones = O.tones || [];
      for (var i = 0; i < tones.length; i++) {
        var t = tones[i];
        var id = (typeof t === "string") ? t : t.id;
        if (id === "auto") continue;
        if (!isOwner() && toneLocked(id)) continue;
        if (!toneMixEntryMatches(t, query)) continue;
        out.push(t);
      }
      return out;
    }
    function fillToneMixSelect(query) {
      fillSelect(toneMixSel, toneMixEntryList(query), st.opts.toneMix || "");
      if (toneMixSel.selectedIndex < 0 && toneMixSel.options.length) toneMixSel.selectedIndex = 0;
      return Math.max(0, toneMixSel.options.length - 1); // excluding the (no mix) header
    }
    function renderToneCount(n, m) {
      var total = (window.t2i_personaTones || []).length;
      if (toneSearch.value) toneCount.textContent = n + " match" + (n === 1 ? "" : "es") + " · " + m + " in mix";
      else toneCount.textContent = n + " of " + total;
    }
    function applyToneFilter() {
      var n = window.t2i_fillToneSelect ? window.t2i_fillToneSelect(toneSel, st.opts.tone, toneSearch.value) : 0;
      var m = (typeof toneMixSel !== "undefined" && toneMixSel) ? fillToneMixSelect(toneSearch.value) : 0;
      renderToneCount(n, m);
    }
    window.__pgenRefillTones = applyToneFilter;
    renderToneCount(toneSel.options.length);
    toneSearch.addEventListener("input", applyToneFilter);
    toneSearch.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        var first = (toneSel.options.length && !toneSel.options[0].disabled) ? toneSel.options[0].value : null;
        if (first) { toneSel.value = first; toneSel.dispatchEvent(new Event("change")); toneSel.focus(); }
      } else if (e.key === "Escape" && toneSearch.value) {
        toneSearch.value = "";
        applyToneFilter();
      }
    });
    // A mature/explicit pick in EITHER tone select raises the rating — shared by
    // both change handlers below.
    function raiseRatingForTone(toneId) {
      var t = window.t2i_personaToneById ? window.t2i_personaToneById(toneId) : null;
      var rank = { sfw: 0, suggestive: 1, mature: 2, explicit: 3 };
      if (t && t.rating && rank[t.rating] > (rank[st.opts.rating] || 0)) {
        st.opts.rating = t.rating;
        var rsel = $("pgen-orating");
        if (rsel) rsel.value = t.rating;
        var rdef = (O.ratings || []).filter(function (r) { return r.id === t.rating; })[0];
        var rname = rdef ? rdef.label.replace(/^[^A-Za-z0-9]+/, "") : t.rating;
        toast("🔞 content rating raised to " + rname + " for the “" + t.label.replace(/^[^A-Za-z0-9]+/, "") + "” tone");
      }
    }
    // A mature/explicit occult type raises the rating too, mirroring tones.
    function raiseRatingForOccult(occultId) {
      var list = O.occultTypes || [], e = null;
      for (var i = 0; i < list.length; i++) {
        var x = list[i], xid = (typeof x === "string") ? x : x.id;
        if (xid === occultId) { e = (typeof x === "string") ? null : x; break; }
      }
      var rank = { sfw: 0, suggestive: 1, mature: 2, explicit: 3 };
      if (e && e.rating && rank[e.rating] > (rank[st.opts.rating] || 0)) {
        st.opts.rating = e.rating;
        var rsel = $("pgen-orating");
        if (rsel) rsel.value = e.rating;
        var rdef = (O.ratings || []).filter(function (r) { return r.id === e.rating; })[0];
        var rname = rdef ? rdef.label.replace(/^[^A-Za-z0-9]+/, "") : e.rating;
        toast("🔞 content rating raised to " + rname + " for the “" + String(e.label || occultId).replace(/^[^A-Za-z0-9]+/, "") + "” occult type");
      }
    }
    // Tone mix — a 2nd tone spot mirroring the genre / genre-mix pair: same
    // tone list (minus ✨ Auto, which is meaningless as a mix) headed by an
    // explicit no-mix option, followed by its own merge-style select reusing
    // the same MERGE_STYLES list the genre merge uses. The 🔎 tone search box
    // above refills this select too (fillToneMixSelect), so both tone sections
    // always show the same filtered view.
    var toneMixSel = row("Tone mix", "pgen-otonemix", toneMixEntryList(""), st.opts.toneMix || "", "A second voice blended into the main tone — leave on “(no mix)” for a single tone. Mature/explicit mixes raise the content rating automatically, just like the main tone does.");
    var toneMergeSel = row("Tone merge style", "pgen-otonemerge", (O.mergeStyles && O.mergeStyles.length) ? O.mergeStyles : [{ id: "auto", label: "✨ Default (let AI decide)" }], st.opts.toneMergeStyle || "auto", "How the tone mix combines with the main tone — the same merge styles the genre mix uses.");
    toneMixSel.addEventListener("change", function () {
      if (!isOwner() && toneLocked(toneMixSel.value)) {
        toneMixSel.value = "";
        st.opts.toneMix = "";
        saveOpts();
        toast("🔒 That tone is owner-only — unlock the owner console to use it.");
        return;
      }
      st.opts.toneMix = toneMixSel.value || "";
      raiseRatingForTone(st.opts.toneMix);
      saveOpts();
    });
    toneMergeSel.addEventListener("change", function () { st.opts.toneMergeStyle = toneMergeSel.value; saveOpts(); });
    var depthSel = row("Depth / length", "pgen-odepth", O.depths, st.opts.depth, "How long and layered the write-up is");
    var exSel = row("Roleplay examples", "pgen-oexamples", [
      { id: "4", label: "4 examples" }, { id: "6", label: "6 examples" }, { id: "8", label: "8 examples" },
      { id: "10", label: "10 examples" }, { id: "12", label: "12 examples" }, { id: "16", label: "16 examples" },
      { id: "20", label: "20 examples" }
    ], String(st.opts.exampleCount), "How many “moments from a story” show the character in action");
    var langList = (O.languages || ["English"]).slice();
    var langSel = row("Language", "pgen-olanguage", langList, st.opts.language, "Language the character is written in (headings stay English)");
    var rateSel = row("Content rating", "pgen-orating", O.ratings, st.opts.rating, "How far the writing is allowed to go");
    var genSel = row("Gender", "pgen-ogender", O.genders, st.opts.gender);
    var relSel = row("Relationship to you", "pgen-orelation", O.relationships, st.opts.relationship, "How the character feels about {{user}}");
    var occSel = row("Occult types", "pgen-ooccult", (O.occultTypes && O.occultTypes.length) ? O.occultTypes : [{ id: "none", label: "✨ None / not occult" }], st.opts.occultType || "none", "What kind of occult practitioner the character is — leave on None for a non-occult character. Mature/explicit picks raise the content rating automatically, just like the tone does.");

    toneSel.addEventListener("change", function () {
      if (!isOwner() && toneLocked(toneSel.value)) {
        if (window.t2i_fillToneSelect) window.t2i_fillToneSelect(toneSel, st.opts.tone, toneSearch.value);
        toast("🔒 That tone is owner-only — unlock the owner console to use it.");
        return;
      }
      st.opts.tone = toneSel.value;
      raiseRatingForTone(st.opts.tone);
      saveOpts();
    });
    depthSel.addEventListener("change", function () { st.opts.depth = depthSel.value; saveOpts(); });
    exSel.addEventListener("change", function () { st.opts.exampleCount = parseInt(exSel.value, 10) || 10; saveOpts(); });
    langSel.addEventListener("change", function () { st.opts.language = langSel.value; saveOpts(); });
    rateSel.addEventListener("change", function () { st.opts.rating = rateSel.value; saveOpts(); });
    genSel.addEventListener("change", function () { st.opts.gender = genSel.value; saveOpts(); });
    relSel.addEventListener("change", function () { st.opts.relationship = relSel.value; saveOpts(); });
    occSel.addEventListener("change", function () { st.opts.occultType = occSel.value || "none"; raiseRatingForOccult(st.opts.occultType); saveOpts(); });

    // genre: grouped preset list (like Gender/Relationship) + custom free-text,
    // plus the mix select, which shares the same list for blending two genres,
    // plus the merge-style select, which says HOW the two genres combine.
    wireGenre("pgen-ogenre", "pgen-ogenrecustom", "genre", false);
    wireGenre("pgen-ogenremix", "pgen-ogenremixcustom", "genreMix", true);
    // 🔎 genre search — one box live-filters BOTH genre selects (genre +
    // mix) by name, id, group or hint text (e.g. "cyberpunk", "cozy"). Like
    // the tone search, filtering never commits: the saved pick is kept
    // displayed (re-inserted when it doesn't match) and clearing the box
    // restores both full lists — which matters here because generation reads
    // the selects directly.
    try { Array.prototype.forEach.call(document.querySelectorAll('#pgen-genresearch-wrap'), function (n) { if (n.parentNode) n.parentNode.removeChild(n); }); } catch (e) {}
    var genreSearchWrap = document.createElement("div");
    genreSearchWrap.className = "pgen-tonesearch";
    genreSearchWrap.id = "pgen-genresearch-wrap";
    var genreSearch = document.createElement("input");
    genreSearch.type = "search";
    genreSearch.id = "pgen-ogenresearch";
    genreSearch.className = "pro-input";
    genreSearch.placeholder = "Search genres… e.g. cyberpunk, cozy";
    genreSearch.autocomplete = "off";
    genreSearch.title = "Filter both genre lists — matches genre names, groups and descriptions";
    var genreCount = document.createElement("span");
    genreCount.className = "pgen-tonecount";
    genreSearchWrap.appendChild(genreSearch);
    genreSearchWrap.appendChild(genreCount);
    (function () {
      var gs0 = $("pgen-ogenre");
      var row2 = (gs0 && gs0.closest) ? gs0.closest(".pgen-row2") : null;
      if (row2 && row2.parentNode) row2.parentNode.insertBefore(genreSearchWrap, row2);
    })();
    function renderGenreCount(n, m) {
      if (genreSearch.value) genreCount.textContent = n + " match" + (n === 1 ? "" : "es") + " · " + m + " in mix";
      else genreCount.textContent = genreList().length + " genres";
    }
    function applyGenreFilter() {
      var n = refillGenre("pgen-ogenre", "pgen-ogenrecustom", "genre", false, genreSearch.value);
      var m = refillGenre("pgen-ogenremix", "pgen-ogenremixcustom", "genreMix", true, genreSearch.value);
      renderGenreCount(n, m);
    }
    window.__pgenRefillGenres = applyGenreFilter;
    applyGenreFilter();
    genreSearch.addEventListener("input", applyGenreFilter);
    genreSearch.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        var gs = $("pgen-ogenre");
        // First MATCH — skip the re-inserted saved pick (data-saved-kept),
        // which is only kept displayed so filtering never commits silently.
        var first = null;
        if (gs) {
          for (var fi = 0; fi < gs.options.length; fi++) {
            var fo = gs.options[fi];
            if (fo.disabled || fo.getAttribute("data-saved-kept")) continue;
            first = fo.value;
            break;
          }
        }
        if (first != null && gs.value !== first) { gs.value = first; gs.dispatchEvent(new Event("change")); gs.focus(); }
      } else if (e.key === "Escape" && genreSearch.value) {
        genreSearch.value = "";
        applyGenreFilter();
      }
    });
    var mergeSel = $("pgen-omerge");
    if (mergeSel) {
      var mergeList = (O.mergeStyles && O.mergeStyles.length) ? O.mergeStyles : [{ id: "auto", label: "✨ Default (let AI decide)" }];
      fillSelect(mergeSel, mergeList, st.opts.mergeStyle || "auto");
      if (mergeSel.selectedIndex < 0 && mergeSel.options.length) mergeSel.selectedIndex = 0;
      mergeSel.onchange = function () {
        st.opts.mergeStyle = mergeSel.value; saveOpts();
      };
    }

    // extra-section checkboxes
    var exHost = $("pgen-extras");
    exHost.innerHTML = "";
    (O.extraSections || []).forEach(function (sec) {
      var lab = document.createElement("label");
      lab.className = "pgen-check";
      lab.title = sec.hint || "";
      lab.innerHTML = '<input type="checkbox"' + (st.opts.extras.indexOf(sec.id) >= 0 ? " checked" : "") + "> " + esc(sec.label);
      lab.querySelector("input").dataset.sec = sec.id;
      lab.querySelector("input").addEventListener("change", function () {
        var i = st.opts.extras.indexOf(sec.id);
        if (this.checked) { if (i < 0) st.opts.extras.push(sec.id); }
        else if (i >= 0) st.opts.extras.splice(i, 1);
        saveOpts();
      });
      exHost.appendChild(lab);
    });
    // ---- layout: Name sits at the top (static template); Tone + Genre live
    // at the bottom. Tone labels are rebuilt fresh on every build (host is
    // wiped above), so clear the bottom row first, then re-collect the fresh
    // tone labels plus the static genre labels in order. The tone 🔎 search
    // lives inside the Tone label and the blend preview follows the row, so
    // both travel along.
    try {
      var card = host.parentNode;
      var bottom = $("pgen-bottomopts");
      if (card && bottom) {
        // Drop stale tone labels left in the row by the previous build (fresh
        // ones were just created inside host). Static genre labels are kept —
        // they are only detached by removeChild, after which getElementById
        // can no longer find them, so never clear the row wholesale.
        ["pgen-otone", "pgen-otonemix", "pgen-otonemerge"].forEach(function (id) {
          var stale = bottom.querySelector("#" + id);
          var slab = (stale && stale.closest) ? stale.closest("label") : null;
          if (slab && slab.parentNode === bottom) bottom.removeChild(slab);
        });
        ["pgen-otone", "pgen-otonemix", "pgen-otonemerge", "pgen-ogenre", "pgen-ogenremix", "pgen-omerge"].forEach(function (id) {
          var s = $(id);
          var lab = (s && s.closest) ? s.closest("label") : null;
          if (lab) bottom.appendChild(lab);
        });
        // Genre 🔎 search lives inside the Genre cell, right above its select —
        // same pattern as the tone search inside the Tone cell.
        var gsel = $("pgen-ogenre");
        var glab = (gsel && gsel.closest) ? gsel.closest("label") : null;
        var gsw = $("pgen-genresearch-wrap");
        if (glab && gsw && gsw.parentNode !== glab) glab.insertBefore(gsw, gsel);
        var blh = $("pgen-blend");
        if (blh) card.insertBefore(blh, bottom.nextSibling);
      }
    } catch (e) {}
    try { syncBlendPreview(); } catch (e) {}
  }

  function syncOptionInputs() {
    try { enforceToneLockOnOpts(); } catch (e) {}
    var set = function (id, v) { var el = $(id); if (el) el.value = v == null ? "" : v; };
    set("pgen-oname", st.opts.name);
    set("pgen-oage", st.opts.age);
    var ambEl = $("pgen-oage-amb");
    if (ambEl) ambEl.checked = !!st.opts.ageAmbiguous;
    syncGenreUI();
    syncGenreUI("pgen-ogenremix", "pgen-ogenremixcustom", "genreMix", true);
    set("pgen-omerge", st.opts.mergeStyle || "auto");
    set("pgen-opronouns", st.opts.pronouns);
    set("pgen-oavoid", st.opts.avoid);
    set("pgen-oinstruction", st.opts.instruction);
    set("pgen-orelation-custom", st.opts.relationshipCustom);
    set("pgen-oflaw", st.opts.flaw);
    set("pgen-ocontradiction", st.opts.contradiction);
    set("pgen-owant", st.opts.want);
    set("pgen-oneed", st.opts.need);
    set("pgen-osecret", st.opts.secret);
    set("pgen-osecretfrom", st.opts.secretFrom);
    set("pgen-opressure", st.opts.pressure);
    renderWildcard();
    set("pgen-otone", st.opts.tone);
    set("pgen-otonemix", (window.t2i_personaToneById && window.t2i_personaToneById(st.opts.toneMix)) ? st.opts.toneMix : "");
    set("pgen-otonemerge", st.opts.toneMergeStyle || "auto");
    set("pgen-odepth", st.opts.depth);
    set("pgen-oexamples", String(st.opts.exampleCount));
    set("pgen-olanguage", st.opts.language);
    set("pgen-orating", st.opts.rating);
    set("pgen-ogender", st.opts.gender);
    set("pgen-orelation", st.opts.relationship);
    set("pgen-ooccult", st.opts.occultType || "none");
    document.querySelectorAll("#pgen-extras input").forEach(function (inp) {
      inp.checked = st.opts.extras.indexOf(inp.dataset.sec) >= 0;
    });
    try { syncBlendPreview(); } catch (e) {}
    try { if (window.__pgenRefillGenres) window.__pgenRefillGenres(); } catch (e) {}
  }

  /* --------------------------------------------------------------- sections */
  function parseSections(text) {
    if (!window.t2i_parsePersona) return [];
    try { return (window.t2i_parsePersona(text || "").sections) || []; } catch (e) { return []; }
  }
  function descriptionText(sections) {
    return sections.map(function (s) { return "# {{char}} " + s.heading + ":\n" + s.content; }).join("\n\n\n");
  }
  // Raw-order listing (see t2i_orderedPersonaSections): the section list, ↑↓
  // reorder and chat packing all follow the actual text order, since the chats
  // keep the START of the text when they truncate — top sections survive.
  function orderedSections(text) {
    if (window.t2i_orderedPersonaSections) {
      try { return window.t2i_orderedPersonaSections(text || "") || []; } catch (e) {}
    }
    return parseSections(text);
  }
  /* --------------------------------- press-and-hold to locate ----------
     Hold a section card for 1s -> it highlights here AND the character
     textarea scrolls to that section (selects its block, flashes it). */
  function locateNorm(s) {
    return String(s || "").toLowerCase().replace(/[{}]/g, " ").replace(/\s+/g, " ").trim().replace(/^char\s+/, "");
  }
  function locateSectionOffsets(full, heading) {
    full = String(full == null ? "" : full);
    var want = locateNorm(heading);
    var lines = full.split("\n");
    var starts = new Array(lines.length);
    var pos = 0;
    for (var i = 0; i < lines.length; i++) { starts[i] = pos; pos += lines[i].length + 1; }
    function headOf(line) {
      var m = String(line || "").match(/^(#{1,4})\s*(.+?)\s*$/);
      if (!m) return null;
      var raw = m[2];
      var ci = raw.indexOf(":");
      var head = (ci >= 0 ? raw.slice(0, ci) : raw).trim();
      if (!head) return null;
      // only treat colon-terminated lines (or {{char}}-style heads) as sections
      if (ci < 0 && !/^\{?\{?char/i.test(raw)) return null;
      return head;
    }
    var found = -1;
    for (var k = 0; k < lines.length; k++) {
      var h = headOf(lines[k]);
      if (h != null && locateNorm(h) === want) { found = k; break; }
    }
    if (found >= 0) {
      var next = -1;
      for (var j = found + 1; j < lines.length; j++) { if (headOf(lines[j]) != null) { next = j; break; } }
      var start = starts[found];
      var end = next >= 0 ? starts[next] : full.length;
      while (end > start && (full.charAt(end - 1) === "\n" || full.charAt(end - 1) === "\r")) end--;
      if (end <= start) end = next >= 0 ? starts[next] : full.length;
      return { start: start, end: end, lineIdx: found, totalLines: lines.length };
    }
    var idx = full.toLowerCase().indexOf(String(heading || "").toLowerCase());
    if (idx >= 0) return { start: idx, end: Math.min(full.length, idx + String(heading).length + 600), lineIdx: 0, totalLines: lines.length };
    return null;
  }
  function locateSection(heading, row) {
    var descEl = $("pgen-desc");
    if (!descEl || !String(descEl.value || "").trim()) { toast("⚠️ generate or load a character first"); return; }
    locateHeading = heading;
    try {
      var host = $("pgen-sections");
      if (host) host.querySelectorAll(".pgen-locate-on").forEach(function (r) { r.classList.remove("pgen-locate-on"); });
    } catch (e) {}
    var target = row || null;
    if (!target) {
      try {
        var host2 = $("pgen-sections");
        var rows = host2 ? host2.querySelectorAll(".pgen-sec") : [];
        for (var i = 0; i < rows.length; i++) {
          var t = rows[i].querySelector(".pgen-sec-title");
          var h = t ? String(t.textContent || "").replace(/^#\s*/, "") : "";
          if (h === heading) { target = rows[i]; break; }
        }
      } catch (e) {}
    }
    if (target) { try { target.classList.add("pgen-locate-on"); } catch (e) {} }
    var off = locateSectionOffsets(descEl.value, heading);
    if (!off) { toast("⚠️ that section is already gone"); refreshSections(); return; }
    try { if (descEl.scrollIntoView) descEl.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
    setTimeout(function () {
      try {
        try { descEl.focus({ preventScroll: true }); } catch (e2) { descEl.focus(); }
        try { descEl.setSelectionRange(off.start, off.end); } catch (e3) {}
        var max = descEl.scrollHeight - descEl.clientHeight;
        if (max > 0) {
          var frac = off.totalLines > 1 ? off.lineIdx / off.totalLines : 0;
          descEl.scrollTop = Math.max(0, frac * max - descEl.clientHeight * 0.2);
        }
        descEl.classList.add("pgen-desc-locate");
        setTimeout(function () { try { descEl.classList.remove("pgen-desc-locate"); } catch (e4) {} }, 2600);
      } catch (e) {}
    }, 380);
    toast("📍 “" + heading + "” — highlighted here & in the character");
  }
  function attachLocateHold(row, heading) {
    var timer = null, sx = 0, sy = 0, fired = false;
    function cancel() {
      if (timer) { clearTimeout(timer); timer = null; }
      try { row.classList.remove("pgen-locate-holding"); } catch (e) {}
    }
    function start(x, y, target) {
      try {
        if (target && target.closest && target.closest("button,input,textarea,select,a")) return;
      } catch (e) {}
      cancel();
      fired = false; sx = x; sy = y;
      try { row.classList.add("pgen-locate-holding"); } catch (e) {}
      timer = setTimeout(function () {
        timer = null; fired = true;
        try { row.classList.remove("pgen-locate-holding"); } catch (e) {}
        locateSection(heading, row);
      }, 1000);
    }
    row.addEventListener("pointerdown", function (e) {
      try { if (e.pointerType === "mouse" && e.button != null && e.button !== 0) return; } catch (err) {}
      start(e.clientX || 0, e.clientY || 0, e.target);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) { row.addEventListener(ev, cancel); });
    row.addEventListener("pointermove", function (e) {
      if (!timer) return;
      var dx = (e.clientX || 0) - sx, dy = (e.clientY || 0) - sy;
      if (dx * dx + dy * dy > 100) cancel();
    });
    row.addEventListener("contextmenu", function (e) {
      if (timer || fired) { try { e.preventDefault(); } catch (err) {} }
      cancel();
      setTimeout(function () { fired = false; }, 0);
    });
  }
  function refreshSections() {
    var host = $("pgen-sections");
    if (!host) return;
    var descEl = $("pgen-desc");
    var sections = orderedSections(descEl ? descEl.value : "");
    host.innerHTML = "";
    populateAddSec();
    if (locateHeading) {
      var stillThere = false;
      for (var li = 0; li < sections.length; li++) if (sections[li].heading === locateHeading) { stillThere = true; break; }
      if (!stillThere) locateHeading = null;
    }
    if (!sections.length) {
      host.innerHTML = '<div class="pgen-empty">Generate a character and its sections will be listed here — each with 📋 copy, ↻ rewrite, ➕ add to, 🗑 delete and ↑↓ reorder buttons, plus a ⋯ strip (📍 scroll to, 🔍 deepen, ✂️ distill, 🎭 voice test, 🌱 foreshadow, 🪢 callback). Press & hold a section for 1s to highlight it & jump to it in the character text. Top sections survive chat cuts. ' + Quip.q("pgenEmpty", "The dissection table awaits.") + '</div>';
      return;
    }
    sections.forEach(function (s, si) {
      var row = document.createElement("div");
      row.className = "pgen-sec";
      var wc = 0;
      try { var wct = String(s.content || "").trim(); wc = wct ? wct.split(/\s+/).length : 0; } catch (e) { wc = 0; }
      var wcLabel = wc === 1 ? "1 word" : wc + " words";
      row.innerHTML =
        '<div class="pgen-sec-head"><span class="pgen-sec-title"># ' + esc(s.heading) + "</span>" +
        '<span class="pgen-sec-wc" title="Words in this section">' + wcLabel + "</span>" +
        '<button type="button" class="pgen-sec-move pgen-sec-up" title="Move this section up — earlier sections survive chat truncation"' + (si === 0 ? " disabled" : "") + ">↑</button>" +
        '<button type="button" class="pgen-sec-move pgen-sec-down" title="Move this section down — later sections are cut first by chats"' + (si === sections.length - 1 ? " disabled" : "") + ">↓</button>" +
        '<button type="button" class="pgen-sec-regen" title="Rewrite just this section">↻ rewrite</button>' +
        '<button type="button" class="pgen-sec-add" title="Add your own info to this section — rewrite it with the AI first, then append">➕ add to</button>' +
        '<button type="button" class="pgen-sec-copy" title="Copy just this section">📋 copy</button>' +
        '<button type="button" class="pgen-sec-del" title="Delete this section from the description">🗑</button>' +
        '<button type="button" class="pgen-sec-x" title="More tools for this section — deepen, distill, voice test, foreshadow, callback">⋯</button></div>' +
        '<div class="pgen-sec-body">' + esc(s.content.length > 220 ? s.content.slice(0, 220) + "…" : s.content) + "</div>" +
        '<div class="pgen-sec-xbox" hidden>' +
        '<button type="button" class="pgen-sec-regen" data-xtool="goto" title="Highlight here & jump to this section in the character text">📍 Scroll to</button>' +
        '<button type="button" class="pgen-sec-regen" data-xtool="deepen" title="Keep every fact, add sensory texture and one complicating human detail">🔍 Deepen</button>' +
        '<button type="button" class="pgen-sec-regen" data-xtool="distill" title="Compress to its sharpest 2–3 sentences">✂️ Distill</button>' +
        '<button type="button" class="pgen-sec-regen" data-xtool="voice" title="Hear the section as a first-person in-character monologue (preview only, nothing is changed)">🎭 Voice test</button>' +
        '<button type="button" class="pgen-sec-regen" data-xtool="fore" title="Plant one subtle unexplained hook in this section">🌱 Foreshadow</button>' +
        '<button type="button" class="pgen-sec-regen" data-xtool="cb" title="Weave one concrete detail from another section into this one">🪢 Callback</button>' +
        '<div class="pgen-sec-xout" hidden></div></div>';
      row.querySelector(".pgen-sec-up").addEventListener("click", function () { moveSection(s.heading, -1, this); });
      row.querySelector(".pgen-sec-down").addEventListener("click", function () { moveSection(s.heading, 1, this); });
      row.querySelector(".pgen-sec-regen").addEventListener("click", function () { regenSection(s.heading, this); });
      row.querySelector(".pgen-sec-add").addEventListener("click", function () { toggleSecAdd(row, s.heading); });
      row.querySelector(".pgen-sec-copy").addEventListener("click", function () { copySection(s.heading, this); });
      row.querySelector(".pgen-sec-del").addEventListener("click", function () { deleteSection(s.heading, this); });
      row.querySelector(".pgen-sec-x").addEventListener("click", function () { toggleSecX(row, s.heading); });
      row.querySelectorAll("[data-xtool]").forEach(function (b) {
        b.addEventListener("click", function () { secXTool(s.heading, b.getAttribute("data-xtool"), row, b); });
      });
      row.setAttribute("title", "Press & hold 1s to highlight here & jump to this section in the character text");
      attachLocateHold(row, s.heading);
      if (locateHeading && s.heading === locateHeading) row.classList.add("pgen-locate-on");
      if (isLoreLikeSection(s.heading)) {
        var parsed = null;
        try { parsed = loreParseTxt(s.content || ""); } catch (e) { parsed = null; }
        if (parsed && parsed.entries && parsed.entries.length) {
          var loreHost = document.createElement("div");
          loreHost.className = "pgen-sec-lore";
          parsed.entries.forEach(function (en, idx) {
            var er = document.createElement("div");
            er.className = "pgen-sec-lore-row";
            er.innerHTML =
              '<span class="pgen-sec-lore-title" title="' + esc(en.content || "") + '">## ' + esc(en.title || "Entry") + "</span>" +
              '<button type="button" class="pgen-sec-lore-copy" title="Copy this entry">📋</button>' +
              '<button type="button" class="pgen-sec-lore-del" title="Delete this entry from the description">🗑</button>';
            er.querySelector(".pgen-sec-lore-copy").addEventListener("click", function () { copyLoreEntryFromDescription(s.heading, idx, this); });
            er.querySelector(".pgen-sec-lore-del").addEventListener("click", function () { deleteLoreEntryFromDescription(s.heading, idx, this); });
            loreHost.appendChild(er);
          });
          row.appendChild(loreHost);
        }
      }
      if (s.heading === "Roleplay Behavior Examples") {
        var exCount = 0;
        try { exCount = window.t2i_countPersonaExamples ? window.t2i_countPersonaExamples(descEl ? descEl.value : "") : 0; } catch (e) {}
        var more = document.createElement("div");
        more.className = "pgen-sec-more";
        more.innerHTML =
          '<span class="pgen-sec-more-label">➕ Add <input class="pro-input pgen-sec-more-num" type="number" min="1" max="10" step="1" value="3" title="How many examples to add (1–10)"> more ' +
          '<span class="pgen-sec-more-have">(has ' + exCount + ")</span></span>" +
          '<button type="button" class="pgen-sec-more-go" title="Generate new examples and append them to this section">➕ Add 3</button>';
        var moreNum = more.querySelector(".pgen-sec-more-num");
        var moreGo = more.querySelector(".pgen-sec-more-go");
        moreNum.addEventListener("input", function () {
          var k = Math.max(1, Math.min(10, parseInt(moreNum.value, 10) || 0)) || 1;
          moreGo.textContent = "➕ Add " + k;
        });
        moreGo.addEventListener("click", function () {
          var raw = parseInt(moreNum.value, 10);
          addMoreExamples(!(raw >= 1) ? 1 : Math.min(10, raw), moreGo);
        });
        row.appendChild(more);
      }
      host.appendChild(row);
    });
    try { renderChatSplit(); } catch (e) {}
  }
  function isLoreLikeSection(heading) {
    var h = String(heading || "").trim().toLowerCase();
    return h === "lorebook" || h === "world info" || h === "worldinfo";
  }
  function rebuildLoreFlat(parsed) {
    var lines = [];
    if (parsed.name) lines.push("# " + String(parsed.name).trim());
    if (parsed.description) lines.push(String(parsed.description).trim());
    (parsed.entries || []).forEach(function (e) {
      if (!e || !String(e.content || "").trim()) return;
      lines.push("\n## " + (e.title || "Entry"));
      if (e.keys && e.keys.length) lines.push("Keys: " + e.keys.join(", "));
      lines.push(String(e.content).trim());
    });
    return lines.join("\n").trim();
  }
  function removeSectionFromText(full, heading) {
    if (window.t2i_removePersonaSection) {
      var out = window.t2i_removePersonaSection(full, heading);
      if (out != null) return out;
    }
    var sections = orderedSections(full);
    var kept = sections.filter(function (s) { return s.heading !== heading; });
    if (kept.length === sections.length) return null;
    return descriptionText(kept);
  }
  function flashCopied(btn, html) {
    if (!btn) return;
    var orig = btn.innerHTML;
    btn.innerHTML = "✓ copied";
    setTimeout(function () { try { btn.innerHTML = html || orig; } catch (e) {} }, 1200);
  }
  function copySection(heading, btn) {
    var descEl = $("pgen-desc");
    if (!descEl || !descEl.value.trim()) { toast("⚠️ generate or load a character first"); return; }
    var cur = null;
    var sections = parseSections(descEl.value);
    for (var i = 0; i < sections.length; i++) if (sections[i].heading === heading) { cur = sections[i]; break; }
    if (!cur) { toast("⚠️ that section is already gone"); refreshSections(); return; }
    var txt = "# {{char}} " + heading + ":\n" + String(cur.content || "").trim();
    copyText(txt).then(function (ok) {
      if (ok) { flashCopied(btn); toast("📋 copied “" + heading + "”"); }
      else toast("⚠️ copy failed");
    });
  }
  function copyLoreEntryFromDescription(heading, entryIdx, btn) {
    var descEl = $("pgen-desc");
    if (!descEl || !descEl.value.trim()) { toast("⚠️ generate or load a character first"); return; }
    var sections = parseSections(descEl.value);
    var cur = null;
    for (var i = 0; i < sections.length; i++) if (sections[i].heading === heading) { cur = sections[i]; break; }
    if (!cur) { toast("⚠️ that section is already gone"); refreshSections(); return; }
    var parsed = null;
    try { parsed = loreParseTxt(cur.content || ""); } catch (e) { parsed = null; }
    if (!parsed || !parsed.entries || !parsed.entries.length || entryIdx < 0 || entryIdx >= parsed.entries.length) {
      toast("⚠️ that entry is already gone"); refreshSections(); return;
    }
    var en = parsed.entries[entryIdx];
    var txt = "## " + (en.title || "Entry") + "\n" +
      (en.keys && en.keys.length ? "Keys: " + en.keys.join(", ") + "\n" : "") +
      String(en.content || "").trim();
    copyText(txt).then(function (ok) {
      if (ok) {
        if (btn) { var orig = btn.textContent; btn.textContent = "✓"; setTimeout(function () { try { btn.textContent = orig; } catch (e) {} }, 1200); }
        toast("📋 copied “" + (en.title || "Entry") + "”");
      } else toast("⚠️ copy failed");
    });
  }
  async function deleteSection(heading, btn) {
    var descEl = $("pgen-desc");
    if (!descEl || !descEl.value.trim()) { toast("⚠️ generate or load a character first"); return; }
    if (genObj || secBusy || bulkActive) { toast("⏳ finish the current generation first"); return; }
    var label = "“" + heading + "”";
    if (!(await window.uiConfirm("Delete section " + label + " from the description? This cannot be undone.", { okText: 'Delete section', danger: true }))) return;
    var next = removeSectionFromText(descEl.value, heading);
    if (next == null) { toast("⚠️ that section is already gone"); refreshSections(); return; }
    descEl.value = next;
    st.persona.description = descEl.value;
    st.persona.sections = parseSections(descEl.value);
    refreshSections(); saveLast(); updateWordCount(); updateSaveButton();
    if (isLoreLikeSection(heading)) toast("🗑 deleted Lorebook section from the persona (lorebook manager kept — 🔗 link to restore)");
    else toast("🗑 deleted " + label);
  }
  // ↑↓ reorder: swap one section's block with its neighbour in the raw text
  // (raw-preserving — non-canonical import blocks stay put). The list, the chat
  // pack and the meter all follow raw order, so moving a section up literally
  // moves it ahead of the chats' cut line.
  function moveSection(heading, dir, btn) {
    var descEl = $("pgen-desc");
    if (!descEl || !descEl.value.trim()) { toast("⚠️ generate or load a character first"); return; }
    if (genObj || secBusy || bulkActive) { toast("⏳ finish the current generation first"); return; }
    var next = null;
    if (window.t2i_movePersonaSection) {
      try { next = window.t2i_movePersonaSection(descEl.value, heading, dir); } catch (e) { next = null; }
    } else {
      var secs = orderedSections(descEl.value);
      var i = -1;
      for (var k = 0; k < secs.length; k++) if (secs[k].heading === heading) { i = k; break; }
      var j = i + (dir < 0 ? -1 : 1);
      if (i >= 0 && j >= 0 && j < secs.length) {
        var t = secs[i]; secs[i] = secs[j]; secs[j] = t;
        next = descriptionText(secs);
      }
    }
    if (next == null) {
      toast(dir < 0 ? "⚠️ already at the top — it survives chat cuts first" : "⚠️ already at the bottom — chats cut it first");
      refreshSections();
      return;
    }
    descEl.value = next;
    st.persona.description = descEl.value;
    st.persona.sections = parseSections(descEl.value);
    refreshSections(); saveLast(); updateWordCount(); updateSaveButton();
  }
  async function deleteLoreEntryFromDescription(heading, entryIdx, btn) {
    var descEl = $("pgen-desc");
    if (!descEl || !descEl.value.trim()) { toast("⚠️ generate or load a character first"); return; }
    if (genObj || secBusy || bulkActive) { toast("⏳ finish the current generation first"); return; }
    var sections = parseSections(descEl.value);
    var cur = null;
    for (var i = 0; i < sections.length; i++) if (sections[i].heading === heading) { cur = sections[i]; break; }
    if (!cur) { toast("⚠️ that section is already gone"); refreshSections(); return; }
    var parsed = null;
    try { parsed = loreParseTxt(cur.content || ""); } catch (e) { parsed = null; }
    if (!parsed || !parsed.entries || !parsed.entries.length || entryIdx < 0 || entryIdx >= parsed.entries.length) {
      toast("⚠️ that entry is already gone"); refreshSections(); return;
    }
    var victim = parsed.entries[entryIdx];
    var vLabel = "“" + (victim.title || "Entry") + "”";
    if (!(await window.uiConfirm("Delete lore entry " + vLabel + " from the description? This cannot be undone.", { okText: 'Delete entry', danger: true }))) return;
    parsed.entries.splice(entryIdx, 1);
    var flat = rebuildLoreFlat(parsed);
    var full = descEl.value;
    var next = null;
    if (!parsed.entries.length || !flat) {
      // Last entry gone — drop the whole section so no empty Lorebook header lingers.
      next = removeSectionFromText(full, heading);
      if (next == null) next = "";
    } else if (window.t2i_replacePersonaSection) {
      next = window.t2i_replacePersonaSection(full, heading, flat);
      if (next == null) next = full;
    } else {
      var secs = orderedSections(full);
      for (var j = 0; j < secs.length; j++) if (secs[j].heading === heading) secs[j].content = flat;
      next = descriptionText(secs);
    }
    descEl.value = next;
    st.persona.description = descEl.value;
    st.persona.sections = parseSections(descEl.value);
    // Keep the lorebook manager in sync when the same entry lives there too.
    var synced = false;
    try {
      var before = st.lore.entries.length;
      st.lore.entries = st.lore.entries.filter(function (e) {
        if ((victim.title || "") && (e.title || "") === (victim.title || "")) return false;
        if (!(victim.title || "") && String(e.content || "").trim() === String(victim.content || "").trim()) return false;
        return true;
      });
      if (st.lore.entries.length !== before) { loreSave(); loreRender(); synced = true; }
    } catch (e) {}
    refreshSections(); saveLast(); updateWordCount(); updateSaveButton();
    toast(synced ? "🗑 deleted " + vLabel + " from persona + lorebook" : "🗑 deleted " + vLabel + " from the persona");
  }
  /* ------------------------------------------------- 🔍 duplicate sections
     The character-card tool: compares the WHOLE description section by section
     (words, sentences, repeated phrases) and surfaces whole sections that
     repeat each other. Findings open in a pop-up whose cards scroll SIDEWAYS
     (◀ ▶ arrows, dots, swipe). Each card is one overlap group with evidence
     plus per-section Show / ↻ rewrite / 🗑 delete shortcuts. */
  var DUP_STOP = { a: 1, an: 1, the: 1, and: 1, or: 1, but: 1, if: 1, then: 1, so: 1, as: 1, at: 1, by: 1, for: 1, with: 1, about: 1, into: 1, through: 1, of: 1, to: 1, in: 1, on: 1, off: 1, out: 1, over: 1, under: 1, from: 1, up: 1, down: 1, is: 1, are: 1, was: 1, were: 1, be: 1, been: 1, being: 1, have: 1, has: 1, had: 1, do: 1, does: 1, did: 1, will: 1, would: 1, could: 1, should: 1, may: 1, might: 1, must: 1, can: 1, shall: 1, it: 1, its: 1, this: 1, that: 1, these: 1, those: 1, they: 1, them: 1, their: 1, theirs: 1, he: 1, him: 1, his: 1, she: 1, her: 1, hers: 1, we: 1, us: 1, our: 1, ours: 1, you: 1, your: 1, yours: 1, i: 1, me: 1, my: 1, mine: 1, who: 1, whom: 1, which: 1, what: 1, when: 1, where: 1, how: 1, why: 1, not: 1, no: 1, nor: 1, very: 1, just: 1, also: 1, too: 1, own: 1, same: 1, such: 1, than: 1, once: 1, here: 1, there: 1, s: 1, t: 1, d: 1, ll: 1, m: 1, re: 1, ve: 1 };
  var DUP_THRESH = { loose: 0.22, balanced: 0.30, strict: 0.42 };
  function dupWordsLower(text) {
    return String(text || "").toLowerCase().replace(/['’]/g, "").match(/[a-z0-9]+/g) || [];
  }
  function dupContentTokens(text) {
    return dupWordsLower(text).filter(function (w) { return w.length > 1 && !DUP_STOP[w]; });
  }
  function dupNormSent(s) {
    return String(s || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }
  function dupSplitSents(text) {
    var parts = String(text || "").split(/(?:[.!?…]+|\n+|;\s+)/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var raw = parts[i].replace(/^\s*\d+[.)]\s*/, "").trim();
      if (!raw) continue;
      if (dupWordsLower(raw).length < 4) continue;
      out.push(raw);
      if (out.length >= 60) break;
    }
    return out;
  }
  function dupSetJac(a, b) {
    if (!a.size && !b.size) return 0;
    var inter = 0;
    a.forEach(function (w) { if (b.has(w)) inter++; });
    return inter / (a.size + b.size - inter);
  }
  function dupCosine(tfA, tfB, magA, magB) {
    if (!magA || !magB) return 0;
    var dot = 0;
    var small = tfA, big = tfB;
    var nA = Object.keys(tfA).length, nB = Object.keys(tfB).length;
    if (nA > nB) { small = tfB; big = tfA; }
    for (var w in small) if (big[w]) dot += small[w] * big[w];
    return dot / (magA * magB);
  }
  function dupSentOverlap(sa, sb) {
    var exact = [], near = [];
    var usedB = {};
    for (var i = 0; i < sa.length; i++) {
      var a = sa[i], best = -1, bestJ = 0;
      for (var j = 0; j < sb.length; j++) {
        if (usedB[j]) continue;
        var b = sb[j];
        if (a.norm === b.norm) { best = j; bestJ = 1; break; }
        var inter = 0;
        a.set.forEach(function (w) { if (b.set.has(w)) inter++; });
        var uni = a.set.size + b.set.size - inter;
        var jj = uni ? inter / uni : 0;
        if (jj > bestJ) { bestJ = jj; best = j; }
      }
      if (best >= 0 && bestJ >= 0.999) { exact.push({ a: a, b: sb[best] }); usedB[best] = true; }
      else if (best >= 0 && bestJ >= 0.78 && a.set.size >= 5) { near.push({ a: a, b: sb[best], j: bestJ }); usedB[best] = true; }
    }
    return { exact: exact, near: near };
  }
  function dupTrigrams(text) {
    var ws = dupWordsLower(text);
    var seen = {}, out = [];
    for (var i = 0; i + 2 < ws.length && i < 1200; i++) {
      var a = ws[i], b = ws[i + 1], c = ws[i + 2];
      if (DUP_STOP[a] && DUP_STOP[b] && DUP_STOP[c]) continue;
      var ph = a + " " + b + " " + c;
      if (!seen[ph]) { seen[ph] = true; out.push(ph); }
    }
    return out;
  }
  // Whole-section overlap analysis. Returns groups sorted worst-first.
  function dupAnalyze(sections, mode) {
    var th = DUP_THRESH[mode] || DUP_THRESH.balanced;
    var items = [];
    (sections || []).forEach(function (s) {
      var content = String((s && s.content) || "");
      if (content.replace(/\s+/g, " ").trim().length < 40) return;
      var toks = dupContentTokens(content).slice(0, 1500);
      if (toks.length < 8) return;
      var tf = {}, mag = 0;
      toks.forEach(function (w) { tf[w] = (tf[w] || 0) + 1; });
      for (var w in tf) mag += tf[w] * tf[w];
      mag = Math.sqrt(mag);
      var raws = dupSplitSents(content);
      var sents = raws.map(function (r) {
        var ws = dupContentTokens(r);
        return { raw: r, norm: dupNormSent(r), set: new Set(ws) };
      }).filter(function (x) { return x.norm && x.set.size >= 3; });
      items.push({
        heading: s.heading, content: content,
        words: content.trim() ? content.trim().split(/\s+/).length : 0,
        tf: tf, mag: mag, set: new Set(Object.keys(tf)),
        sents: sents, trigrams: dupTrigrams(content)
      });
    });
    if (items.length < 2) return [];
    var pairs = [];
    for (var i = 0; i < items.length; i++) {
      for (var j = i + 1; j < items.length; j++) {
        var A = items[i], B = items[j];
        var cos = dupCosine(A.tf, B.tf, A.mag, B.mag);
        var jac = dupSetJac(A.set, B.set);
        var ov = dupSentOverlap(A.sents, B.sents);
        var nDup = ov.exact.length + ov.near.length;
        var sentScore = (A.sents.length + B.sents.length) ? (2 * nDup) / (A.sents.length + B.sents.length) : 0;
        var score = 0.55 * cos + 0.45 * jac;
        if (nDup > 0) score = Math.max(score, Math.min(0.97, 0.52 + 0.11 * Math.min(3, nDup) + 0.08 * Math.min(1, sentScore)));
        if (score >= th) pairs.push({ a: i, b: j, score: score, cos: cos, jac: jac, ov: ov });
      }
    }
    if (!pairs.length) return [];
    pairs.sort(function (x, y) { return y.score - x.score; });
    // connected components over pairs -> groups of whole sections
    var parent = items.map(function (_, k) { return k; });
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    pairs.forEach(function (p) {
      var ra = find(p.a), rb = find(p.b);
      if (ra !== rb) parent[rb] = ra;
    });
    var byRoot = {};
    pairs.forEach(function (p) {
      var r = find(p.a);
      (byRoot[r] = byRoot[r] || []).push(p);
    });
    var groups = Object.keys(byRoot).map(function (r) {
      var ps = byRoot[r];
      var idxSet = {};
      ps.forEach(function (p) { idxSet[p.a] = true; idxSet[p.b] = true; });
      var idxs = Object.keys(idxSet).map(Number).sort(function (x, y) {
        return items[y].words - items[x].words;
      });
      var members = idxs.map(function (k) { return items[k]; });
      var score = ps.reduce(function (m, p) { return Math.max(m, p.score); }, 0);
      // shared-sentence evidence (deduped)
      var seenS = {}, sharedSents = [];
      ps.forEach(function (p) {
        var A = items[p.a], B = items[p.b];
        p.ov.exact.concat(p.ov.near.map(function (n) { return { a: n.a, b: n.b, near: true }; })).forEach(function (hit) {
          var key = hit.a.norm;
          if (!key || seenS[key]) return;
          seenS[key] = true;
          sharedSents.push({ aRaw: hit.a.raw, bRaw: hit.b.raw, near: !!hit.near, aHead: A.heading, bHead: B.heading });
        });
      });
      sharedSents.sort(function (x, y) { return (x.near ? 1 : 0) - (y.near ? 1 : 0); });
      // shared 3-word phrases across >=2 members
      var triCount = {}, triFreq = {};
      members.forEach(function (m) {
        var seen = {};
        m.trigrams.forEach(function (t) {
          if (!seen[t]) { seen[t] = true; triCount[t] = (triCount[t] || 0) + 1; }
          triFreq[t] = (triFreq[t] || 0) + 1;
        });
      });
      var sharedPhrases = Object.keys(triCount).filter(function (t) { return triCount[t] >= 2; })
        .sort(function (x, y) { return (triFreq[y] - triFreq[x]) || (y.length - x.length); }).slice(0, 8);
      // repeated content words across >=2 members
      var wCount = {};
      members.forEach(function (m) { m.set.forEach(function (w) { wCount[w] = (wCount[w] || 0) + 1; }); });
      var repWords = Object.keys(wCount).filter(function (w) { return wCount[w] >= 2; }).length;
      return { members: members, pairs: ps, score: score, sharedSents: sharedSents.slice(0, 4), sharedPhrases: sharedPhrases, repWords: repWords };
    });
    groups.sort(function (x, y) { return y.score - x.score; });
    return groups.slice(0, 12);
  }
  function dupEscReg(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function dupHighlight(raw, phrases) {
    var h = esc(raw);
    var list = (phrases || []).slice().sort(function (a, b) { return b.length - a.length; }).slice(0, 6);
    list.forEach(function (ph) {
      if (!ph || ph.length < 5) return;
      try { h = h.replace(new RegExp("(" + dupEscReg(esc(ph)) + ")", "gi"), "<mark>$1</mark>"); } catch (e) {}
    });
    return h;
  }
  function dupExcerpt(content, phrases, n) {
    var t = String(content || "");
    var cut = t.length > (n || 420) ? t.slice(0, n || 420).replace(/\s+\S*$/, "") + "…" : t;
    return dupHighlight(cut, phrases);
  }
  function dupScoreClass(s) { return s >= 0.55 ? "pgen-dup-score-high" : (s >= 0.35 ? "pgen-dup-score-med" : "pgen-dup-score-low"); }
  function dupScoreWord(s) { return s >= 0.55 ? "High" : (s >= 0.35 ? "Medium" : "Low"); }
  function dupList() { return dupView === "within" ? dupSelf : dupGroups; }
  function dupSummary() {
    var parts = [];
    if (dupGroups.length) parts.push(dupGroups.length + " group" + (dupGroups.length === 1 ? "" : "s"));
    if (dupSelf.length) parts.push(dupSelf.length + " self-repeat" + (dupSelf.length === 1 ? "" : "s"));
    return parts.length ? parts.join(" · ") : "clean";
  }
  // ↺ Within-a-section scan: sentences a single section says twice (word for
  // word or two ways) plus 3-word phrases spread across its own sentences.
  // Returns per-section findings sorted worst-first.
  function dupSelfAnalyze(sections, mode) {
    var th = DUP_THRESH[mode] || DUP_THRESH.balanced;
    var out = [];
    (sections || []).forEach(function (s) {
      var content = String((s && s.content) || "");
      if (content.replace(/\s+/g, " ").trim().length < 60) return;
      var raws = dupSplitSents(content);
      if (raws.length < 2) return;
      var sents = raws.map(function (r) {
        var ws = dupContentTokens(r);
        return { raw: r, norm: dupNormSent(r), set: new Set(ws) };
      }).filter(function (x) { return x.norm && x.set.size >= 3; });
      if (sents.length < 2) return;
      var exact = [], near = [];
      for (var i = 0; i < sents.length; i++) {
        for (var j = i + 1; j < sents.length; j++) {
          var A = sents[i], B = sents[j];
          if (A.norm === B.norm) { exact.push({ a: A.raw, b: B.raw }); continue; }
          var inter = 0;
          A.set.forEach(function (w) { if (B.set.has(w)) inter++; });
          var uni = A.set.size + B.set.size - inter;
          var jj = uni ? inter / uni : 0;
          if (jj >= 0.8 && A.set.size >= 5 && B.set.size >= 5) near.push({ a: A.raw, b: B.raw });
        }
      }
      // 3-word phrases appearing in 2+ of the section's OWN sentences
      var triInfo = {};
      sents.forEach(function (sn, si) {
        var ws = dupWordsLower(sn.raw);
        var seen = {};
        for (var k = 0; k + 2 < ws.length; k++) {
          var a = ws[k], b = ws[k + 1], c = ws[k + 2];
          if (DUP_STOP[a] && DUP_STOP[b] && DUP_STOP[c]) continue;
          var ph = a + " " + b + " " + c;
          if (seen[ph]) continue;
          seen[ph] = true;
          if (!triInfo[ph]) triInfo[ph] = { n: 0, sents: {} };
          triInfo[ph].n += 1;
          triInfo[ph].sents[si] = true;
        }
      });
      var rep = Object.keys(triInfo).map(function (ph) {
        return { ph: ph, n: triInfo[ph].n, ns: Object.keys(triInfo[ph].sents).length };
      }).filter(function (e) { return e.ns >= 2; })
        .sort(function (x, y) { return (y.ns - x.ns) || (y.n - x.n) || (y.ph.length - x.ph.length); }).slice(0, 8);
      var score = Math.min(0.97, exact.length * 0.34 + near.length * 0.24 + Math.min(0.30, rep.length * 0.045));
      if (score >= th) {
        out.push({
          heading: s.heading, content: content,
          words: content.trim() ? content.trim().split(/\s+/).length : 0,
          sentCount: sents.length, score: score,
          exact: exact.slice(0, 3), near: near.slice(0, 3), repPhrases: rep
        });
      }
    });
    out.sort(function (x, y) { return y.score - x.score; });
    return out.slice(0, 12);
  }
  // One sideways card for a single self-repeating section (same buttons and
  // data attributes as the group cards, so the shared wiring below just works;
  // data-dupcopy copies just this section and branches on dupView).
  function dupSelfCard(r, ri) {
    var skippedSelf = dupReorgSkipped(r.heading);
    var pct = Math.round(r.score * 100);
    var card = document.createElement("div");
    card.className = "pgen-dup-card";
    card.setAttribute("data-dupself", String(ri));
    var phStrs = r.repPhrases.map(function (e) { return e.ph; });
    var ev = '<div class="pgen-dup-ev">';
    r.exact.slice(0, 2).forEach(function (p) {
      ev += '<div class="pgen-dup-ev-q">“' + dupHighlight(String(p.a).slice(0, 200), phStrs) + "”<small>repeated word-for-word in #" + esc(r.heading) + "</small></div>";
    });
    r.near.slice(0, 2).forEach(function (p) {
      ev += '<div class="pgen-dup-ev-q">“' + dupHighlight(String(p.a).slice(0, 200), phStrs) + "”<small>said twice, two ways, in #" + esc(r.heading) + "</small></div>";
    });
    if (r.repPhrases.length) {
      ev += '<div class="pgen-dup-chips">' + r.repPhrases.map(function (e) { return '<span class="pgen-dup-chip">“' + esc(e.ph) + "” ×" + e.ns + "</span>"; }).join("") + "</div>";
    }
    ev += "</div>";
    card.innerHTML =
      '<div class="pgen-dup-card-top"><span class="pgen-dup-group"># ' + esc(r.heading) + "</span>" +
      '<span class="pgen-dup-score ' + dupScoreClass(r.score) + '">' + pct + "% · " + dupScoreWord(r.score) + "</span></div>" +
      '<div class="pgen-dup-members"><span>' + r.words + " words · " + r.sentCount + " sentences · repeats itself</span></div>" +
      '<div class="pgen-dup-pane"><div class="pgen-dup-ex">' + dupExcerpt(r.content, phStrs) + "</div>" +
      '<div class="pgen-dup-rowbtns" style="margin-top:0.35rem;">' +
      '<button type="button" class="pgen-dup-mini" data-dupshow="' + esc(r.heading) + '" title="Close this and flash this section in Section tools">👁 Show</button>' +
      '<button type="button" class="pgen-dup-mini" data-duprewrite="' + esc(r.heading) + '" title="Rewrite just this section">↻ Rewrite</button>' +
      '<button type="button" class="pgen-dup-mini" data-dupdel="' + esc(r.heading) + '" title="Delete this section from the description">🗑</button>' +
      "</div></div>" + ev +
      '<div class="pgen-dup-rowbtns">' +
      '<button type="button" class="pgen-dup-mini" data-dupshow="' + esc(r.heading) + '">👁 Show section</button>' +
      (skippedSelf
        ? '<button type="button" class="pgen-dup-mini" disabled title="Reorganize leaves roleplay examples and lorebook sections alone">✨ Reorganize</button>'
        : '<button type="button" class="pgen-dup-mini" data-dupreorg-self="' + ri + '" title="AI: rewrite this section so every detail appears exactly once — you review the draft before applying">✨ Reorganize</button>') +
      '<button type="button" class="pgen-dup-mini" data-dupcopy="' + ri + '" title="Copy this section">📋 Copy section</button>' +
      "</div>";
    return card;
  }
  // ---- ✨ information reorganizer -------------------------------------------------
  // AI rewrite that keeps EVERY detail but states each fact exactly once.
  // Roleplay examples + lorebook-shaped sections are never touched (rewriting
  // would mangle their numbering / ## entries). Single findings open an
  // editable draft review in their card (✅ Apply writes it back
  // raw-preserving via t2i_replacePersonaSection); "Reorganize all" applies
  // each finding in turn and re-scans at the end.
  function dupReorgSkipped(h) {
    return String(h || "") === "Roleplay Behavior Examples" || isLoreLikeSection(h);
  }
  function dupReorgInstruction(name, blocks, others) {
    var L = [];
    L.push("You are editing a roleplay character description. The sections under REORGANIZE repeat the same information. Rewrite them so every unique detail is kept EXACTLY ONCE — merge what is repeated, keep what is unique, and keep each section focused on its own heading.");
    L.push("RULES:\n- Keep EVERY unique fact, name, number, trait, quirk and preference. Deleting a detail is failure.\n- Each fact appears in exactly ONE section. Remove every repetition between these sections.\n- Do not invent new facts, people, places or events. Do not add or remove sections.\n- Keep the section headings EXACTLY as given. Keep the same voice and the same language as the input. Third-person prose, no dialogue filler.");
    if (name) L.push("CHARACTER: " + name);
    if (others) L.push("CONTEXT (other sections — do NOT rewrite them and do NOT repeat their facts):\n" + others);
    L.push("REORGANIZE:\n" + blocks);
    L.push("Reply with ONLY the rewritten sections, one block per section, in exactly this format and nothing else (no commentary, no code fences):\n# {{char}} Heading:\n<rewritten text>");
    return L.join("\n\n");
  }
  function dupCleanAi(text) {
    return String(text || "").replace(/^```[a-zA-Z]*\s*/gm, "").replace(/```/g, "").trim();
  }
  function dupParseBlocks(text, want) {
    function norm(h) { return String(h || "").replace(/^\s*#\s*/, "").replace(/\{\{\s*char\s*\}\}/gi, "").replace(/\s*:+\s*$/, "").trim().toLowerCase(); }
    var wantNorm = {};
    (want || []).forEach(function (h) { wantNorm[norm(h)] = h; });
    var map = {}, cur = null, buf = [];
    String(text || "").split("\n").forEach(function (ln) {
      var m = ln.match(/^\s*#\s+(.*)\s*$/);
      if (m && wantNorm[norm(m[1])]) {
        if (cur) map[cur] = buf.join("\n").trim();
        cur = wantNorm[norm(m[1])]; buf = [];
        return;
      }
      if (cur) buf.push(ln);
    });
    if (cur) map[cur] = buf.join("\n").trim();
    return map;
  }
  async function dupRunReorg(headings) {
    var desc = (($("pgen-desc") || {}).value) || "";
    var all = orderedSections(desc);
    var byH = {};
    all.forEach(function (s) { byH[s.heading] = s.content; });
    var blocks = headings.map(function (h) { return "# {{char}} " + h + ":\n" + String(byH[h] || "").trim(); }).join("\n\n\n");
    var name = (($("pgen-name") || {}).value || "").trim();
    var others = all.filter(function (s) { return headings.indexOf(s.heading) < 0; }).slice(0, 8)
      .map(function (s) { return "# " + s.heading + ": " + String(s.content || "").replace(/\s+/g, " ").trim().slice(0, 300); }).join("\n");
    var res = await window.root.generateText({ instruction: dupReorgInstruction(name, blocks, others) });
    var txt = "";
    try { txt = (res && res.text) || (typeof res === "string" ? res : "") || ""; } catch (e) {}
    return dupCleanAi(txt);
  }
  function dupApplyReorgMap(map) {
    var descEl = $("pgen-desc");
    if (!descEl) return 0;
    var text = descEl.value, n = 0;
    Object.keys(map).forEach(function (h) {
      var body = String(map[h] || "").trim();
      if (!body) return;
      var next = window.t2i_replacePersonaSection ? window.t2i_replacePersonaSection(text, h, body) : null;
      if (next != null && next !== text) { text = next; n++; }
    });
    if (!n) return 0;
    descEl.value = text;
    st.persona.description = text;
    st.persona.sections = parseSections(text);
    refreshSections(); saveLast(); updateWordCount(); updateSaveButton();
    return n;
  }
  function dupShowReview(view, idx, headings, txt) {
    if (!dupOverlay) return;
    var track = dupOverlay.querySelector("#pgen-dup-track");
    if (!track) return;
    var card = track.querySelector(view === "within" ? '[data-dupself="' + idx + '"]' : '[data-dupgroup="' + idx + '"]');
    if (!card) { toast("⚠️ card is gone — ↻ Re-scan"); return; }
    var old = card.querySelector(".pgen-dup-review");
    if (old) old.remove();
    var box = document.createElement("div");
    box.className = "pgen-dup-review";
    box.innerHTML =
      '<div class="pgen-dup-review-h">✨ Reorganized draft — every detail kept once. Edit freely, then Apply.</div>' +
      '<textarea class="pgen-dup-review-ta" spellcheck="false"></textarea>' +
      '<div class="pgen-dup-rowbtns"><button type="button" class="pgen-dup-mini" data-dupapply>✅ Apply</button>' +
      '<button type="button" class="pgen-dup-mini" data-dupdiscard>Discard</button></div>';
    box.querySelector("textarea").value = txt;
    card.appendChild(box);
    box.querySelector("[data-dupdiscard]").addEventListener("click", function () { box.remove(); });
    box.querySelector("[data-dupapply]").addEventListener("click", function () {
      var map = dupParseBlocks(box.querySelector("textarea").value, headings);
      var keys = Object.keys(map).filter(function (k) { return String(map[k] || "").trim(); });
      if (!keys.length) { toast("⚠️ keep the # {{char}} Heading: lines so Apply knows where each part goes"); return; }
      var n = dupApplyReorgMap(map);
      if (!n) { toast("⚠️ nothing applied"); return; }
      dupRescan(true);
      toast("✅ reorganized " + n + " section" + (n === 1 ? "" : "s") + " — " + dupSummary());
    });
    try { card.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e) {}
  }
  async function dupStartReorg(view, idx, btn) {
    if (dupReorgBusy) { toast("⏳ reorganizing already…"); return; }
    if (genObj || secBusy || bulkActive) { toast("⏳ finish the current generation first"); return; }
    if (!(window.root && window.root.generateText)) { toast("⚠️ AI text not available"); return; }
    var item = view === "within" ? dupSelf[idx] : dupGroups[idx];
    if (!item) return;
    var headings = view === "within" ? [item.heading] : item.members.map(function (m) { return m.heading; });
    if (headings.some(dupReorgSkipped)) { toast("⚠️ roleplay examples and lorebook are left alone"); return; }
    var label = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.innerHTML = "⏳ reorganizing…"; }
    dupReorgBusy = true;
    try {
      var txt = await dupRunReorg(headings);
      if (!txt) { toast("⚠️ the AI returned nothing — try again"); }
      else { dupShowReview(view, idx, headings, txt); toast("✨ draft ready — review it, then ✅ Apply"); }
    } catch (e) {
      console.error(e);
      toast("⚠️ reorganize failed");
    }
    dupReorgBusy = false;
    if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = label; }
  }
  async function dupReorgAll(btn) {
    if (dupReorgBusy) { toast("⏳ reorganizing already…"); return; }
    if (genObj || secBusy || bulkActive) { toast("⏳ finish the current generation first"); return; }
    if (!(window.root && window.root.generateText)) { toast("⚠️ AI text not available"); return; }
    var jobs = [];
    dupGroups.forEach(function (g) {
      var hs = g.members.map(function (m) { return m.heading; });
      if (!hs.some(dupReorgSkipped)) jobs.push(hs);
    });
    dupSelf.forEach(function (r) {
      if (!dupReorgSkipped(r.heading)) jobs.push([r.heading]);
    });
    if (!jobs.length) { toast("✅ nothing eligible — roleplay examples and lorebook are left alone"); return; }
    var label = btn ? btn.innerHTML : "";
    if (btn) btn.disabled = true;
    dupReorgBusy = true;
    var done = 0, failed = 0;
    for (var k = 0; k < jobs.length; k++) {
      if (btn) btn.innerHTML = "⏳ " + (k + 1) + "/" + jobs.length + "…";
      try {
        var txt = await dupRunReorg(jobs[k]);
        var map = txt ? dupParseBlocks(txt, jobs[k]) : {};
        var keys = Object.keys(map).filter(function (h) { return String(map[h] || "").trim(); });
        if (keys.length) done += dupApplyReorgMap(map);
        else failed++;
      } catch (e) { console.error(e); failed++; }
      if (!dupOverlay) break;
    }
    dupReorgBusy = false;
    if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = label; }
    if (dupOverlay) dupRescan();
    toast(failed ? "✅ reorganized " + done + " · ⚠️ " + failed + " failed" : "✅ reorganized " + done + " section" + (done === 1 ? "" : "s") + " — " + dupSummary());
  }
  // ---- 🧬 section merger --------------------------------------------------------
  // Combine a whole overlap group into ONE new section: the AI keeps every
  // unique detail exactly once (repeated info is stated one time), and the
  // user picks the new section's name. Roleplay examples + lorebook groups
  // are never eligible (same rule as ✨ Reorganize).
  // Flow: 🧬 Merge -> name form (prefilled, editable) -> AI writes the merged
  // body for that name -> editable draft review (name + body) -> ✅ Apply
  // swaps the merged sections for the single new one at the earliest merged
  // position in the text (raw-preserving, like the rewriter above).
  function dupMergeInstruction(name, newHeading, blocks, others) {
    var L = [];
    L.push("You are editing a roleplay character description. The sections under MERGE repeat each other. Combine them into ONE section called \"" + newHeading + "\" that keeps EVERY unique detail EXACTLY ONCE — merge what is repeated (state it one time, in whichever phrasing is clearest), keep what appears in only one section, and drop nothing.");
    L.push("RULES:\n- Keep EVERY unique fact, name, number, trait, quirk and preference. Deleting a detail is failure.\n- Each fact appears exactly ONCE in the merged section.\n- Do not invent new facts, people, places or events.\n- Write for the new heading \"" + newHeading + "\": one coherent section, same voice and same language as the input. Third-person prose, no dialogue filler.");
    if (name) L.push("CHARACTER: " + name);
    if (others) L.push("CONTEXT (other sections — do NOT rewrite them and do NOT repeat their facts):\n" + others);
    L.push("MERGE:\n" + blocks);
    L.push("Reply with ONLY the merged section body (no heading line, no commentary, no code fences).");
    return L.join("\n\n");
  }
  async function dupRunMerge(headings, newHeading) {
    var desc = (($("pgen-desc") || {}).value) || "";
    var all = orderedSections(desc);
    var byH = {};
    all.forEach(function (s) { byH[s.heading] = s.content; });
    var blocks = headings.map(function (h) { return "# {{char}} " + h + ":\n" + String(byH[h] || "").trim(); }).join("\n\n\n");
    var charName = (($("pgen-name") || {}).value || "").trim();
    var others = all.filter(function (s) { return headings.indexOf(s.heading) < 0; }).slice(0, 8)
      .map(function (s) { return "# " + s.heading + ": " + String(s.content || "").replace(/\s+/g, " ").trim().slice(0, 300); }).join("\n");
    var res = await window.root.generateText({ instruction: dupMergeInstruction(charName, newHeading, blocks, others) });
    var txt = "";
    try { txt = (res && res.text) || (typeof res === "string" ? res : "") || ""; } catch (e) {}
    return dupCleanAi(txt);
  }
  // Rename one section's heading line, preserving the "# {{char}}" prefix
  // style and the trailing colon. Returns the new text, or null if not found.
  function dupRenameHeadingLine(text, oldHeading, newHeading) {
    var lines = String(text == null ? "" : text).split("\n");
    function strip(h) { return String(h || "").replace(/^\{\{\s*char\s*\}\}\s*/i, "").trim().toLowerCase(); }
    var want = strip(oldHeading);
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^(#{1,4})\s*(.+?)\s*$/);
      if (!m) continue;
      var raw = m[2];
      var ci = raw.indexOf(":");
      var head = (ci >= 0 ? raw.slice(0, ci) : raw).trim();
      if (strip(head) !== want) continue;
      var pm = lines[i].match(/^(\s*#{1,4}\s*(?:\{\{\s*char\s*\}\}\s*)?)(.*)$/i);
      var prefix = pm ? pm[1] : (m[1] + " ");
      if (!/\s$/.test(prefix)) prefix += " ";
      lines[i] = prefix + newHeading + ":";
      return lines.join("\n");
    }
    return null;
  }
  function dupApplyMerge(headings, newHeading, body) {
    body = String(body || "").trim();
    if (!body) return 0;
    var descEl = $("pgen-desc");
    if (!descEl) return 0;
    var text = descEl.value;
    // Text order decides placement: the merged section lands where the
    // earliest merged section was.
    var order = [];
    try { order = orderedSections(text).map(function (s) { return s.heading; }); } catch (e) { order = []; }
    var inSet = {};
    headings.forEach(function (h) { inSet[String(h).toLowerCase()] = true; });
    var first = null;
    for (var i = 0; i < order.length; i++) {
      if (inSet[String(order[i]).toLowerCase()]) { first = order[i]; break; }
    }
    if (!first) return 0;
    var rest = headings.filter(function (h) { return String(h).toLowerCase() !== String(first).toLowerCase(); });
    // Remove the other sections first (raw-preserving, so titles and
    // non-canonical blocks elsewhere in the card survive).
    for (var r = 0; r < rest.length; r++) {
      var removed = window.t2i_removePersonaSection ? window.t2i_removePersonaSection(text, rest[r]) : null;
      if (removed == null) {
        var secs = orderedSections(text).filter(function (s) { return String(s.heading).toLowerCase() !== String(rest[r]).toLowerCase(); });
        removed = descriptionText(secs);
      }
      text = removed;
    }
    var replaced = window.t2i_replacePersonaSection ? window.t2i_replacePersonaSection(text, first, body) : null;
    if (replaced == null) {
      var secs2 = orderedSections(text), found = false;
      for (var k = 0; k < secs2.length; k++) if (String(secs2[k].heading).toLowerCase() === String(first).toLowerCase()) { secs2[k].content = body; found = true; }
      if (!found) return 0;
      text = descriptionText(secs2);
    } else text = replaced;
    if (String(first).toLowerCase() !== String(newHeading).toLowerCase()) {
      var renamed = dupRenameHeadingLine(text, first, newHeading);
      if (renamed == null) return 0;
      text = renamed;
    }
    descEl.value = text;
    st.persona.description = text;
    st.persona.sections = parseSections(text);
    refreshSections(); saveLast(); updateWordCount(); updateSaveButton();
    return 1;
  }
  function dupMergeNameClash(finalName, headings) {
    var lower = headings.map(function (h) { return String(h).toLowerCase(); });
    var clash = null;
    try {
      orderedSections(($("pgen-desc") || {}).value || "").forEach(function (s) {
        if (String(s.heading).toLowerCase() === String(finalName).toLowerCase() && lower.indexOf(String(s.heading).toLowerCase()) < 0) clash = s.heading;
      });
    } catch (e) {}
    return clash;
  }
  function dupShowMergeForm(gi) {
    if (!dupOverlay) return;
    var track = dupOverlay.querySelector("#pgen-dup-track");
    if (!track) return;
    var g = dupGroups[gi];
    if (!g) return;
    var card = track.querySelector('[data-dupgroup="' + gi + '"]');
    if (!card) { toast("⚠️ card is gone — ↻ Re-scan"); return; }
    var old = card.querySelector(".pgen-dup-review");
    if (old) old.remove();
    var headings = g.members.map(function (m) { return m.heading; });
    var box = document.createElement("div");
    box.className = "pgen-dup-review";
    box.innerHTML =
      '<div class="pgen-dup-review-h">🧬 Merge ' + headings.map(esc).join(" + ") + ' into one section — name it, then the AI combines them (repeats kept once).</div>' +
      '<input class="pro-input pgen-dup-merge-name" spellcheck="false" maxlength="60" aria-label="New section name">' +
      '<div class="pgen-dup-rowbtns"><button type="button" class="pgen-dup-mini" data-dupmergestart>🧬 Merge sections</button>' +
      '<button type="button" class="pgen-dup-mini" data-dupdiscard>Cancel</button></div>';
    var nameInput = box.querySelector(".pgen-dup-merge-name");
    nameInput.value = headings.join(" + ").slice(0, 60);
    card.appendChild(box);
    box.querySelector("[data-dupdiscard]").addEventListener("click", function () { box.remove(); });
    box.querySelector("[data-dupmergestart]").addEventListener("click", function () { dupStartMerge(gi, nameInput.value, box); });
    try { nameInput.focus(); nameInput.select(); } catch (e) {}
    try { card.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e) {}
  }
  async function dupStartMerge(gi, rawName, box) {
    if (dupReorgBusy) { toast("⏳ reorganizing already…"); return; }
    if (genObj || secBusy || bulkActive) { toast("⏳ finish the current generation first"); return; }
    if (!(window.root && window.root.generateText)) { toast("⚠️ AI text not available"); return; }
    var g = dupGroups[gi];
    if (!g || !box || !box.isConnected) return;
    var headings = g.members.map(function (m) { return m.heading; });
    if (headings.some(dupReorgSkipped)) { toast("⚠️ roleplay examples and lorebook are left alone"); return; }
    var raw = String(rawName == null ? "" : rawName).replace(/\s+/g, " ").trim();
    if (!raw) { toast("⚠️ give the merged section a name first"); return; }
    // Register first (same as ➕ Add sections): teaches the parser the new
    // heading so the merged section is recognised afterwards.
    var finalName = window.t2i_registerPersonaHeading ? (window.t2i_registerPersonaHeading(raw) || raw) : raw;
    if (!finalName) { toast("⚠️ use letters in the section name"); return; }
    var clash = dupMergeNameClash(finalName, headings);
    if (clash) { toast("⚠️ already have a section called “" + finalName + "” — pick another name or delete it first"); return; }
    var startBtn = box.querySelector("[data-dupmergestart]");
    var label = startBtn ? startBtn.innerHTML : "";
    if (startBtn) { startBtn.disabled = true; startBtn.innerHTML = "⏳ merging…"; }
    dupReorgBusy = true;
    try {
      var txt = await dupRunMerge(headings, finalName);
      if (!txt) toast("⚠️ the AI returned nothing — try again");
      else dupShowMergeReview(gi, headings, finalName, txt);
    } catch (e) {
      console.error(e);
      toast("⚠️ merge failed");
    }
    dupReorgBusy = false;
    if (startBtn && startBtn.isConnected) { startBtn.disabled = false; startBtn.innerHTML = label; }
  }
  function dupShowMergeReview(gi, headings, finalName, txt) {
    if (!dupOverlay) return;
    var track = dupOverlay.querySelector("#pgen-dup-track");
    if (!track) return;
    var card = track.querySelector('[data-dupgroup="' + gi + '"]');
    if (!card) { toast("⚠️ card is gone — ↻ Re-scan"); return; }
    var old = card.querySelector(".pgen-dup-review");
    if (old) old.remove();
    var box = document.createElement("div");
    box.className = "pgen-dup-review";
    box.innerHTML =
      '<div class="pgen-dup-review-h">🧬 Merged draft — every unique detail kept once. Edit freely, then Apply.</div>' +
      '<input class="pro-input pgen-dup-merge-name" spellcheck="false" maxlength="60" aria-label="New section name">' +
      '<textarea class="pgen-dup-review-ta" spellcheck="false"></textarea>' +
      '<div class="pgen-dup-rowbtns"><button type="button" class="pgen-dup-mini" data-dupmergeapply>✅ Apply</button>' +
      '<button type="button" class="pgen-dup-mini" data-dupdiscard>Discard</button></div>';
    box.querySelector(".pgen-dup-merge-name").value = finalName;
    box.querySelector("textarea").value = txt;
    card.appendChild(box);
    box.querySelector("[data-dupdiscard]").addEventListener("click", function () { box.remove(); });
    box.querySelector("[data-dupmergeapply]").addEventListener("click", function () {
      var nm = String(box.querySelector(".pgen-dup-merge-name").value == null ? "" : box.querySelector(".pgen-dup-merge-name").value).replace(/\s+/g, " ").trim();
      if (!nm) { toast("⚠️ give the merged section a name"); return; }
      var fin = window.t2i_registerPersonaHeading ? (window.t2i_registerPersonaHeading(nm) || nm) : nm;
      if (!fin) { toast("⚠️ use letters in the section name"); return; }
      var clash = dupMergeNameClash(fin, headings);
      if (clash) { toast("⚠️ already have a section called “" + fin + "” — pick another name or delete it first"); return; }
      var mergedBody = String(box.querySelector("textarea").value || "").trim();
      if (!mergedBody) { toast("⚠️ the draft is empty — Discard or write something first"); return; }
      var n = dupApplyMerge(headings, fin, mergedBody);
      if (!n) { toast("⚠️ nothing applied"); return; }
      dupRescan(true);
      toast("✅ merged into “" + fin + "” — " + dupSummary());
    });
    try { card.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e) {}
  }
  function closeDupCheck() {
    if (dupEsc) { document.removeEventListener("keydown", dupEsc, true); dupEsc = null; }
    if (dupOverlay && dupOverlay.parentNode) dupOverlay.parentNode.removeChild(dupOverlay);
    dupOverlay = null;
  }
  function dupRescan(keepIdx) {
    var desc = (($("pgen-desc") || {}).value) || "";
    var secs = orderedSections(desc);
    dupGroups = dupAnalyze(secs, dupMode);
    dupSelf = dupSelfAnalyze(secs, dupMode);
    if (!keepIdx) dupIdx = 0;
    dupIdx = Math.max(0, Math.min(dupIdx, Math.max(0, dupList().length - 1)));
    if (dupOverlay) dupPaint();
  }
  function dupStep() {
    var track = dupOverlay ? dupOverlay.querySelector("#pgen-dup-track") : null;
    if (!track) return 360;
    var card = track.querySelector(".pgen-dup-card");
    return card ? card.offsetWidth + 10 : 360;
  }
  function dupGo(i) {
    var list = dupList();
    if (!list.length) return;
    dupIdx = Math.max(0, Math.min(list.length - 1, i));
    var track = dupOverlay ? dupOverlay.querySelector("#pgen-dup-track") : null;
    if (track) { try { track.scrollTo({ left: dupIdx * dupStep(), behavior: "smooth" }); } catch (e) { track.scrollLeft = dupIdx * dupStep(); } }
    dupUpdateNav();
  }
  function dupUpdateNav() {
    if (!dupOverlay) return;
    var list = dupList();
    var pos = dupOverlay.querySelector("#pgen-dup-pos");
    var dots = dupOverlay.querySelector("#pgen-dup-dots");
    var prev = dupOverlay.querySelector("#pgen-dup-prev");
    var next = dupOverlay.querySelector("#pgen-dup-next");
    var badge = dupOverlay.querySelector("#pgen-dup-badge");
    if (badge) badge.textContent = dupSummary();
    var tb = dupOverlay.querySelector("#pgen-dup-tab-between");
    if (tb) {
      tb.classList.toggle("on", dupView !== "within");
      tb.textContent = "⟷ Between sections (" + dupGroups.length + ")";
    }
    var tw = dupOverlay.querySelector("#pgen-dup-tab-within");
    if (tw) {
      tw.classList.toggle("on", dupView === "within");
      tw.textContent = "↺ Within a section (" + dupSelf.length + ")";
    }
    var count = dupOverlay.querySelector("#pgen-dup-count");
    if (count) {
      var secs = orderedSections((($("pgen-desc") || {}).value) || "").length;
      if (dupView === "within") {
        count.textContent = dupSelf.length
          ? secs + " sections scanned · " + dupSelf.length + " repeat" + (dupSelf.length === 1 ? "s" : "") + " inside " + (dupSelf.length === 1 ? "itself" : "themselves") + " at " + dupMode
          : secs + " sections scanned · no self-repeats at " + dupMode;
      } else {
        count.textContent = dupGroups.length
          ? secs + " sections scanned · " + dupGroups.length + " overlap group" + (dupGroups.length === 1 ? "" : "s") + " at " + dupMode
          : secs + " sections scanned · no overlaps at " + dupMode;
      }
    }
    if (pos) pos.textContent = list.length ? (dupIdx + 1) + " / " + list.length : "0 / 0";
    if (prev) prev.disabled = !list.length || dupIdx <= 0;
    if (next) next.disabled = !list.length || dupIdx >= list.length - 1;
    if (dots) {
      var ds = dots.querySelectorAll(".pgen-dup-dot");
      for (var i = 0; i < ds.length; i++) ds[i].classList.toggle("on", i === dupIdx);
    }
  }
  // Close the pop-up and flash the given whole sections in 🧩 Section tools —
  // the list is scrolled so the first match is visible.
  function dupFlashSections(headings) {
    var want = {};
    (headings || []).forEach(function (h) { want[String(h)] = true; });
    closeDupCheck();
    try { refreshSections(); } catch (e) {}
    var host = $("pgen-sections");
    if (!host) return;
    var rows = host.querySelectorAll(".pgen-sec");
    var first = null;
    for (var i = 0; i < rows.length; i++) {
      var t = rows[i].querySelector(".pgen-sec-title");
      var h = t ? String(t.textContent || "").replace(/^#\s*/, "") : "";
      if (want[h]) {
        rows[i].classList.add("pgen-dup-flash");
        if (!first) first = rows[i];
      }
    }
    try {
      var card = $("pgen-desc");
      if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "center" });
      if (first && first.scrollIntoView) setTimeout(function () { try { first.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {} }, 250);
    } catch (e) {}
    setTimeout(function () {
      try { host.querySelectorAll(".pgen-dup-flash").forEach(function (r) { r.classList.remove("pgen-dup-flash"); }); } catch (e) {}
    }, 2800);
  }
  function dupPaint() {
    if (!dupOverlay) return;
    var track = dupOverlay.querySelector("#pgen-dup-track");
    var dots = dupOverlay.querySelector("#pgen-dup-dots");
    if (!track) return;
    track.innerHTML = "";
    if (dots) dots.innerHTML = "";
    var list = dupList();
    if (!list.length) {
      track.innerHTML = dupView === "within"
        ? '<div class="pgen-empty">✅ No section repeats itself at <b>' + esc(dupMode) + '</b> sensitivity.' +
          "<br>Try <b>Loose</b> + ↻ Re-scan to catch subtler self-repeats — or every section is tight.</div>"
        : '<div class="pgen-empty">✅ No duplicated whole sections at <b>' + esc(dupMode) + '</b> sensitivity.' +
          "<br>Try <b>Loose</b> + ↻ Re-scan to catch subtler overlaps — or it really is clean.</div>";
      dupUpdateNav();
      return;
    }
    list.forEach(function (it, gi) {
      if (dupView === "within") {
        track.appendChild(dupSelfCard(it, gi));
        if (dots) {
          var dw = document.createElement("button");
          dw.type = "button";
          dw.className = "pgen-dup-dot" + (gi === dupIdx ? " on" : "");
          dw.title = "Go to section " + (gi + 1);
          dw.setAttribute("data-dupdot", String(gi));
          dw.setAttribute("aria-label", "Go to section " + (gi + 1));
          dots.appendChild(dw);
        }
        return;
      }
      var g = it;
      var skipped = g.members.some(function (m) { return dupReorgSkipped(m.heading); });
      var pct = Math.round(g.score * 100);
      var card = document.createElement("div");
      card.className = "pgen-dup-card";
      card.setAttribute("data-dupgroup", String(gi));
      var heads = g.members.map(function (m) { return m.heading; });
      var memberLine = heads.map(esc).join(' <span class="pgen-dup-vs">⟷</span> ');
      var panes = g.members.map(function (m) {
        return '<div class="pgen-dup-pane"><div class="pgen-dup-pane-h"><span title="' + esc(m.heading) + '"># ' + esc(m.heading) + '</span>' +
          '<span class="pgen-dup-words">' + m.words + " words</span></div>" +
          '<div class="pgen-dup-ex">' + dupExcerpt(m.content, g.sharedPhrases) + "</div>" +
          '<div class="pgen-dup-rowbtns" style="margin-top:0.35rem;">' +
          '<button type="button" class="pgen-dup-mini" data-dupshow="' + esc(m.heading) + '" title="Close this and flash this section in Section tools">👁 Show</button>' +
          '<button type="button" class="pgen-dup-mini" data-duprewrite="' + esc(m.heading) + '" title="Rewrite just this section">↻ Rewrite</button>' +
          '<button type="button" class="pgen-dup-mini" data-dupdel="' + esc(m.heading) + '" title="Delete this section from the description">🗑</button>' +
          "</div></div>";
      }).join("");
      var ev = "";
      if (g.sharedSents.length || g.sharedPhrases.length) {
        ev += '<div class="pgen-dup-ev">';
        g.sharedSents.slice(0, 3).forEach(function (sn) {
          ev += '<div class="pgen-dup-ev-q">“' + dupHighlight(String(sn.aRaw).slice(0, 200), g.sharedPhrases) + "”" +
            "<small>" + (sn.near ? "said two ways" : "near-identical sentence") + " · #" + esc(sn.aHead) + " ⟷ #" + esc(sn.bHead) + "</small></div>";
        });
        if (g.sharedPhrases.length) {
          ev += '<div class="pgen-dup-chips">' + g.sharedPhrases.map(function (p) { return '<span class="pgen-dup-chip">“' + esc(p) + "”</span>"; }).join("") + "</div>";
        }
        ev += "</div>";
      }
      card.innerHTML =
        '<div class="pgen-dup-card-top"><span class="pgen-dup-group">Group ' + (gi + 1) + "</span>" +
        '<span class="pgen-dup-score ' + dupScoreClass(g.score) + '">' + pct + "% · " + dupScoreWord(g.score) + "</span></div>" +
        '<div class="pgen-dup-members">' + memberLine + "</div>" +
        panes + ev +
        '<div class="pgen-dup-rowbtns">' +
        '<button type="button" class="pgen-dup-mini" data-dupshowall="' + gi + '">👁 Show sections</button>' +
        (skipped
          ? '<button type="button" class="pgen-dup-mini" disabled title="Reorganize leaves roleplay examples and lorebook sections alone">✨ Reorganize</button>'
          : '<button type="button" class="pgen-dup-mini" data-dupreorg-group="' + gi + '" title="AI: rewrite this group so every detail appears exactly once across the sections — you review the draft before applying">✨ Reorganize</button>') +
        (skipped
          ? '<button type="button" class="pgen-dup-mini" disabled title="Merge leaves roleplay examples and lorebook sections alone">🧬 Merge</button>'
          : '<button type="button" class="pgen-dup-mini" data-dupmerge-group="' + gi + '" title="AI: combine every section in this group into ONE new section (repeats kept once) — you name it and review the draft before applying">🧬 Merge</button>') +
        '<button type="button" class="pgen-dup-mini" data-dupcopy="' + gi + '" title="Copy every section in this group">📋 Copy group</button>' +
        "</div>";
      track.appendChild(card);
      if (dots) {
        var d = document.createElement("button");
        d.type = "button";
        d.className = "pgen-dup-dot" + (gi === dupIdx ? " on" : "");
        d.title = "Go to group " + (gi + 1);
        d.setAttribute("data-dupdot", String(gi));
        d.setAttribute("aria-label", "Go to group " + (gi + 1));
        dots.appendChild(d);
      }
    });
    // wire card buttons (delegated per render so re-scans stay correct)
    track.querySelectorAll("[data-dupshow]").forEach(function (b) {
      b.addEventListener("click", function () { dupFlashSections([b.getAttribute("data-dupshow")]); });
    });
    track.querySelectorAll("[data-dupshowall]").forEach(function (b) {
      b.addEventListener("click", function () {
        var g = dupGroups[parseInt(b.getAttribute("data-dupshowall"), 10) || 0];
        if (g) dupFlashSections(g.members.map(function (m) { return m.heading; }));
      });
    });
    track.querySelectorAll("[data-dupcopy]").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = parseInt(b.getAttribute("data-dupcopy"), 10) || 0;
        if (dupView === "within") {
          var r = dupSelf[k];
          if (!r) return;
          var one = "# {{char}} " + r.heading + ":\n" + String(r.content || "").trim();
          copyText(one).then(function (ok) {
            if (ok) flashCopied(b);
            toast(ok ? "📋 copied “" + r.heading + "”" : "⚠️ copy failed");
          });
          return;
        }
        var g = dupGroups[k];
        if (!g) return;
        var txt = g.members.map(function (m) { return "# {{char}} " + m.heading + ":\n" + String(m.content || "").trim(); }).join("\n\n\n");
        copyText(txt).then(function (ok) {
          if (ok) flashCopied(b);
          toast(ok ? "📋 copied group " + (k + 1) : "⚠️ copy failed");
        });
      });
    });
    track.querySelectorAll("[data-dupreorg-group]").forEach(function (b) {
      b.addEventListener("click", function () { dupStartReorg("between", parseInt(b.getAttribute("data-dupreorg-group"), 10) || 0, b); });
    });
    track.querySelectorAll("[data-dupmerge-group]").forEach(function (b) {
      b.addEventListener("click", function () { dupShowMergeForm(parseInt(b.getAttribute("data-dupmerge-group"), 10) || 0); });
    });
    track.querySelectorAll("[data-dupreorg-self]").forEach(function (b) {
      b.addEventListener("click", function () { dupStartReorg("within", parseInt(b.getAttribute("data-dupreorg-self"), 10) || 0, b); });
    });
    track.querySelectorAll("[data-duprewrite]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var h = b.getAttribute("data-duprewrite");
        var ok = await regenSection(h, b);
        if (ok && dupOverlay) { dupRescan(true); toast("↻ rewrote “" + h + "” — list re-scanned"); }
      });
    });
    track.querySelectorAll("[data-dupdel]").forEach(function (b) {
      b.addEventListener("click", function () {
        var h = b.getAttribute("data-dupdel");
        deleteSection(h, b);
        setTimeout(function () { if (dupOverlay) dupRescan(true); }, 50);
      });
    });
    if (dots) dots.querySelectorAll("[data-dupdot]").forEach(function (d) {
      d.addEventListener("click", function () { dupGo(parseInt(d.getAttribute("data-dupdot"), 10) || 0); });
    });
    dupUpdateNav();
    // the pop-up's cards get scrolled sideways to the current group
    try { track.scrollLeft = dupIdx * dupStep(); } catch (e) {}
  }
  function openDupCheck() {
    var descEl = $("pgen-desc");
    var desc = descEl ? descEl.value : "";
    if (!desc || !desc.trim()) { toast("⚠️ generate or load a character first"); return; }
    var secs = orderedSections(desc);
    if (!secs.length) { toast("⚠️ no sections found yet"); return; }
    closeDupCheck();
    if (secs.length < 2 && dupView !== "within") dupView = "within";
    dupGroups = dupAnalyze(secs, dupMode);
    dupSelf = dupSelfAnalyze(secs, dupMode);
    dupIdx = 0;
    var ov = document.createElement("div");
    ov.className = "pgen-import-overlay";
    ov.innerHTML =
      '<div class="pgen-import-box pgen-dup-box">' +
        '<div class="pgen-import-head"><b>🔍 Duplicate sections</b><span class="pro-badge" id="pgen-dup-badge"></span><button type="button" class="pgen-import-x" id="pgen-dup-x" title="Close">✖</button></div>' +
        '<p class="pgen-import-sub">The whole description was scanned two ways — <b>⟷ Between sections</b> compares whole sections against each other, <b>↺ Within a section</b> looks inside each single section for sentences it repeats on itself. Each card is one finding — scroll the cards <b>sideways</b> with ◀ ▶, the dots, or a sideways swipe.</p>' +
        '<div class="pgen-dup-tabs"><button type="button" id="pgen-dup-tab-between" class="pgen-dup-tab">⟷ Between sections</button>' +
        '<button type="button" id="pgen-dup-tab-within" class="pgen-dup-tab">↺ Within a section</button></div>' +
        '<div class="pgen-dup-ctrl"><label for="pgen-dup-mode">Sensitivity</label>' +
        '<select id="pgen-dup-mode" class="pro-select"><option value="loose">Loose — catch more</option><option value="balanced">Balanced</option><option value="strict">Strict — only strong</option></select>' +
        '<button type="button" id="pgen-dup-rescan" class="pro-btn" title="Re-run the scan on the current description">↻ Re-scan</button>' +
        '<span class="pgen-dup-count" id="pgen-dup-count"></span></div>' +
        '<div class="pgen-dup-nav"><button type="button" id="pgen-dup-prev" class="pgen-dup-arrow" title="Previous group">◀</button>' +
        '<div class="pgen-dup-dots" id="pgen-dup-dots"></div><span class="pgen-dup-pos" id="pgen-dup-pos"></span>' +
        '<button type="button" id="pgen-dup-next" class="pgen-dup-arrow" title="Next group">▶</button></div>' +
        '<div class="pgen-dup-track" id="pgen-dup-track" tabindex="0" aria-label="Duplicate groups — scroll sideways"></div>' +
        '<div class="pgen-dup-foot"><span class="pgen-dup-tip">Tip: 👁 Show closes this and flashes the sections in 🧩 Section tools. ✨ Reorganize dedupes a finding across its sections — review the draft, then ✅ Apply. 🧬 Merge combines a group into one new section you name. ↻ Re-scan after editing.</span>' +
        '<button type="button" id="pgen-dup-reorgall" class="pro-btn" title="AI: reorganize every eligible finding in turn (roleplay examples and lorebook are skipped)">✨ Reorganize all</button>' +
        '<button type="button" id="pgen-dup-close" class="pro-btn pro-btn-primary">Close</button></div>' +
      "</div>";
    document.body.appendChild(ov);
    dupOverlay = ov;
    var modeSel = ov.querySelector("#pgen-dup-mode");
    modeSel.value = dupMode;
    modeSel.addEventListener("change", function () { dupMode = modeSel.value; dupRescan(); });
    ov.querySelector("#pgen-dup-rescan").addEventListener("click", function () { dupRescan(); toast("🔍 re-scanned — " + dupSummary()); });
    ov.querySelector("#pgen-dup-tab-between").addEventListener("click", function () {
      if (dupView === "within") { dupView = "between"; dupIdx = 0; dupPaint(); }
    });
    ov.querySelector("#pgen-dup-tab-within").addEventListener("click", function () {
      if (dupView !== "within") { dupView = "within"; dupIdx = 0; dupPaint(); }
    });
    ov.querySelector("#pgen-dup-x").addEventListener("click", closeDupCheck);
    ov.querySelector("#pgen-dup-reorgall").addEventListener("click", function () { dupReorgAll(this); });
    ov.querySelector("#pgen-dup-close").addEventListener("click", closeDupCheck);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) closeDupCheck(); });
    dupEsc = function (e) {
      if (e.key === "Escape") { e.stopPropagation(); closeDupCheck(); }
      if (e.key === "ArrowLeft") { try { dupGo(dupIdx - 1); } catch (e2) {} }
      if (e.key === "ArrowRight") { try { dupGo(dupIdx + 1); } catch (e2) {} }
    };
    document.addEventListener("keydown", dupEsc, true);
    ov.querySelector("#pgen-dup-prev").addEventListener("click", function () { dupGo(dupIdx - 1); });
    ov.querySelector("#pgen-dup-next").addEventListener("click", function () { dupGo(dupIdx + 1); });
    var track = ov.querySelector("#pgen-dup-track");
    track.addEventListener("scroll", function () {
      if (dupScrollT) return;
      dupScrollT = setTimeout(function () {
        dupScrollT = 0;
        if (!dupOverlay || !dupList().length) return;
        var i = Math.round(track.scrollLeft / dupStep());
        i = Math.max(0, Math.min(dupList().length - 1, i));
        if (i !== dupIdx) { dupIdx = i; dupUpdateNav(); }
      }, 90);
    });
    dupPaint();
  }
  if (typeof window !== "undefined") { window.__pgenDupAnalyze = dupAnalyze; window.__pgenDupSelfAnalyze = dupSelfAnalyze; window.__pgenDupParseBlocks = dupParseBlocks; window.__pgenDupMergeApply = dupApplyMerge; window.__pgenDupRenameHeadingLine = dupRenameHeadingLine; }
  function sectionAddOptions() {
    var O = options();
    var descEl = $("pgen-desc");
    var present = {};
    parseSections(descEl ? descEl.value : "").forEach(function (s) { present[s.heading] = true; });
    var extras = (O.extraSections || []).filter(function (s) { return !present[s.id]; });
    var core = ["Tagline", "Visual Description", "Personality", "Voice & Mannerisms", "Backstory", "Goals, Fears & Desires", "Habits & Quirks", "Likes & Dislikes", "A Secret", "Relationship with {{user}}", "Opening Line", "Roleplay Behavior Examples"].filter(function (h) { return !present[h]; });
    return { extras: extras, core: core };
  }
  function populateAddSec() {
    updateAddSecSummary();
    if (pickOverlay) renderPick();
  }
  // The shared "Add sections" starter applies to every section; a per-section starter
  // (keyed by heading) is layered on top of it for that one section only.
  function combineStarter(globalStarter, perSection) {
    var bits = [];
    if (globalStarter && String(globalStarter).trim()) bits.push(String(globalStarter).trim());
    if (perSection && String(perSection).trim()) bits.push(String(perSection).trim());
    return bits.join("\n");
  }
  async function addSection(heading, btn, isCustom) {
    var descEl = $("pgen-desc");
    if (!descEl || !descEl.value.trim()) { toast("⚠️ generate or load a character first"); return false; }
    if (isCustom) {
      var reg = window.t2i_registerPersonaHeading ? window.t2i_registerPersonaHeading(heading) : heading;
      if (!reg) { toast("⚠️ use letters in the section heading"); return false; }
      heading = reg;
    }
    return regenSection(heading, btn, "added", false, combineStarter(secStarter, secStarters[heading]));
  }
  async function regenSection(heading, btn, verb, quiet, starter) {
    if (genObj) { if (!quiet) toast("⏹ finish the current generation first"); return false; }
    if (secBusy) { if (!quiet) toast("⏳ a section is already being written…"); return false; }
    if (!window.t2i_generatePersonaSection) { if (!quiet) toast("⚠️ persona engine not loaded"); return false; }
    var descEl = $("pgen-desc"), nameEl = $("pgen-name");
    var full = descEl.value;
    var label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "⏳ writing…"; }
    secBusy = true;
    var ok = false;
    try {
      var sopts = stOpts();
      if (starter && String(starter).trim()) sopts.sectionStarter = String(starter).trim();
      var res = await window.t2i_generatePersonaSection(sopts, heading, full);
      var content = Array.isArray(res) ? res.map(function (s, i) { return (i + 1) + ". " + s; }).join("\n\n") : res;
      if (!content) { if (!quiet) toast("⚠️ nothing came back — try again"); }
      else {
        // Surgical edit: replace just this section's block, preserving every other
        // byte (titles, non-canonical blocks like Roleplay Guidelines, ordering).
        var replaced = window.t2i_replacePersonaSection ? window.t2i_replacePersonaSection(full, heading, content) : null;
        if (replaced != null) descEl.value = replaced;
        else if (window.t2i_addPersonaSection) descEl.value = window.t2i_addPersonaSection(full, heading, content);
        else {
          var sections = orderedSections(full);
          var found = false;
          for (var i = 0; i < sections.length; i++) if (sections[i].heading === heading) { sections[i].content = content; found = true; }
          if (!found) sections.push({ heading: heading, content: content });
          descEl.value = descriptionText(sections);
        }
        if (nameEl && !nameEl.value) { try { nameEl.value = window.t2i_parsePersona(descEl.value).name || ""; } catch (e) {} }
        st.persona.name = nameEl ? nameEl.value : "";
        st.persona.description = descEl.value;
        st.persona.sections = parseSections(descEl.value);
        refreshSections(); saveLast(); updateWordCount(); updateSaveButton();
        if (!quiet) toast("↻ " + (verb || "rewrote") + " “" + heading + "”");
        ok = true;
      }
    } catch (e) {
      console.error(e);
      if (!quiet) toast("⚠️ section rewrite failed");
    }
    secBusy = false;
    if (btn) { btn.disabled = false; btn.textContent = label; }
    return ok;
  }
  /* ------------------------------------------------- ⋯ more section tools
     Each section row has a ⋯ button opening a second strip with five deeper
     tools (all read the live 🎛️ Character options via stOpts, like ↻ rewrite):
       🔍 Deepen    — same facts, more sensory texture + one complicating detail
       ✂️ Distill    — compress to its sharpest 2–3 sentences
       🎭 Voice test — first-person in-character monologue PREVIEW (never written)
       🌱 Foreshadow — plant one subtle unexplained hook in the section
       🪢 Callback   — weave one concrete detail from another section into this one
     Deepen / distill / foreshadow / callback rewrite the section in place
     (same surgical replace as ↻ rewrite); voice test only shows a preview. */
  function toggleSecX(row, heading) {
    if (!row) return;
    var box = row.querySelector(".pgen-sec-xbox");
    if (!box) return;
    var host = $("pgen-sections");
    if (host) {
      host.querySelectorAll(".pgen-sec-xbox").forEach(function (b) { if (b !== box) b.hidden = true; });
      host.querySelectorAll(".pgen-sec-x.on").forEach(function (b) { if (!box || b.closest(".pgen-sec") !== row) b.classList.remove("on"); });
    }
    var tog = row.querySelector(".pgen-sec-x");
    box.hidden = !box.hidden;
    if (tog) tog.classList.toggle("on", !box.hidden);
    if (!box.hidden) {
      var add = row.querySelector(".pgen-sec-addbox");
      if (add) add.remove();
    }
  }
  // Shared surgical apply for the rewriting x-tools (same replace logic as
  // regenSection, factored so deepen/distill/foreshadow/callback share it).
  function applySecContent(heading, content) {
    var descEl = $("pgen-desc"), nameEl = $("pgen-name");
    if (!descEl) return false;
    var full = descEl.value;
    var text = Array.isArray(content) ? content.map(function (s, i) { return (i + 1) + ". " + s; }).join("\n\n") : content;
    if (!text) return false;
    if (window.t2i_replacePersonaSection) {
      var replaced = window.t2i_replacePersonaSection(full, heading, text);
      if (replaced != null) full = replaced;
      else if (window.t2i_addPersonaSection) full = window.t2i_addPersonaSection(full, heading, text);
      else return false;
    } else if (window.t2i_addPersonaSection) {
      var added2 = window.t2i_addPersonaSection(full, heading, text);
      if (added2 == null) return false;
      full = added2;
    } else {
      var sections = orderedSections(full);
      var found = false;
      for (var i = 0; i < sections.length; i++) if (sections[i].heading === heading) { sections[i].content = text; found = true; }
      if (!found) sections.push({ heading: heading, content: text });
      full = descriptionText(sections);
    }
    descEl.value = full;
    if (nameEl && !nameEl.value) { try { nameEl.value = window.t2i_parsePersona(full).name || ""; } catch (e) {} }
    st.persona.name = nameEl ? nameEl.value : "";
    st.persona.description = full;
    st.persona.sections = parseSections(full);
    refreshSections(); saveLast(); updateWordCount(); updateSaveButton();
    return true;
  }
  async function secXTool(heading, tool, row, btn) {
    var xout = row ? row.querySelector(".pgen-sec-xout") : null;
    if (tool === "goto") { locateSection(heading, row); return; }
    if (tool === "voice") { secVoiceTest(heading, row, btn); return; }
    if (tool === "cb") { secCallbackPicker(heading, row); return; }
    var fns = { deepen: ["t2i_deepenSection", "🔍 deepened"], distill: ["t2i_distillSection", "✂️ distilled"], fore: ["t2i_foreshadowSection", "🌱 hook planted"] };
    var spec = fns[tool];
    if (!spec) return;
    if (genObj || bulkActive) { toast("⏹ finish the current generation first"); return; }
    if (secBusy) { toast("⏳ a section is already being written…"); return; }
    if (!window[spec[0]]) { toast("⚠️ persona engine not loaded yet"); return; }
    var descEl = $("pgen-desc");
    if (!descEl || !descEl.value.trim()) { toast("⚠️ generate or load a character first"); return; }
    var label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "⏳ writing…"; }
    secBusy = true;
    try {
      var sopts = stOpts();
      if (secStarter && String(secStarter).trim()) sopts.sectionStarter = String(secStarter).trim();
      var res = await window[spec[0]](sopts, heading, descEl.value);
      var content = Array.isArray(res) ? res.map(function (s, i) { return (i + 1) + ". " + s; }).join("\n\n") : res;
      if (!content) toast("⚠️ nothing came back — try again");
      else if (applySecContent(heading, content)) toast(spec[1] + " “" + heading + "”");
      else toast("⚠️ couldn't place the new text — try again");
    } catch (e) {
      console.error(e);
      toast("⚠️ section tool failed");
    }
    secBusy = false;
    if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = label; }
    if (xout) xout.hidden = true;
  }
  async function secVoiceTest(heading, row, btn) {
    var xout = row ? row.querySelector(".pgen-sec-xout") : null;
    if (!xout) return;
    if (genObj || bulkActive) { toast("⏹ finish the current generation first"); return; }
    if (secBusy) { toast("⏳ a section is already being written…"); return; }
    if (!window.t2i_voiceTest) { toast("⚠️ persona engine not loaded yet"); return; }
    var descEl = $("pgen-desc");
    if (!descEl || !descEl.value.trim()) { toast("⚠️ generate or load a character first"); return; }
    xout.hidden = false;
    xout.innerHTML = '<div class="pgen-sec-xnote">🎭 listening…</div>';
    secBusy = true;
    try {
      var res = await window.t2i_voiceTest(stOpts(), heading, descEl.value);
      res = String(res || "").trim();
      if (!res) { xout.innerHTML = '<div class="pgen-sec-xnote">⚠️ nothing came back — try again</div>'; }
      else {
        xout.innerHTML = "";
        var ta = document.createElement("textarea");
        ta.className = "pro-textarea pgen-sec-voice";
        ta.value = res;
        ta.setAttribute("aria-label", "Voice test preview for " + heading);
        xout.appendChild(ta);
        var btnrow = document.createElement("div");
        btnrow.className = "pgen-sec-xrow";
        btnrow.innerHTML = '<button type="button" class="pgen-sec-regen" data-vcopy>📋 Copy monologue</button>' +
          '<button type="button" class="pgen-sec-del" data-vclose>✖</button>' +
          '<span class="pgen-sec-xnote">preview only — nothing was changed</span>';
        xout.appendChild(btnrow);
        btnrow.querySelector("[data-vcopy]").addEventListener("click", function () {
          copyText(ta.value).then(function (ok) { toast(ok ? "📋 copied" : "⚠️ copy failed"); });
        });
        btnrow.querySelector("[data-vclose]").addEventListener("click", function () { xout.hidden = true; xout.innerHTML = ""; });
      }
    } catch (e) {
      console.error(e);
      xout.innerHTML = '<div class="pgen-sec-xnote">⚠️ voice test failed</div>';
    }
    secBusy = false;
  }
  function secCallbackPicker(heading, row) {
    var xout = row ? row.querySelector(".pgen-sec-xout") : null;
    if (!xout) return;
    var descEl = $("pgen-desc");
    if (!descEl || !descEl.value.trim()) { toast("⚠️ generate or load a character first"); return; }
    var others = orderedSections(descEl.value).map(function (s) { return s.heading; }).filter(function (h) { return h && h !== heading; });
    if (!others.length) { toast("⚠️ need at least two sections for a callback"); return; }
    xout.hidden = false;
    xout.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "pgen-sec-xrow";
    var sel = document.createElement("select");
    sel.className = "pro-select";
    sel.setAttribute("aria-label", "Weave a detail from this section");
    others.forEach(function (h) {
      var o = document.createElement("option");
      o.value = h; o.textContent = h;
      sel.appendChild(o);
    });
    var go = document.createElement("button");
    go.type = "button"; go.className = "pgen-sec-regen"; go.textContent = "🪢 Weave it in";
    var x = document.createElement("button");
    x.type = "button"; x.className = "pgen-sec-del"; x.textContent = "✖";
    var note = document.createElement("span");
    note.className = "pgen-sec-xnote";
    note.textContent = "rewrites “" + heading + "” with one detail from the chosen section";
    wrap.appendChild(sel); wrap.appendChild(go); wrap.appendChild(x);
    xout.appendChild(wrap); xout.appendChild(note);
    x.addEventListener("click", function () { xout.hidden = true; xout.innerHTML = ""; });
    go.addEventListener("click", async function () {
      if (genObj || bulkActive) { toast("⏹ finish the current generation first"); return; }
      if (secBusy) { toast("⏳ a section is already being written…"); return; }
      if (!window.t2i_callbackSection) { toast("⚠️ persona engine not loaded yet"); return; }
      var from = sel.value;
      var label = go.textContent;
      go.disabled = true; go.textContent = "⏳ weaving…";
      secBusy = true;
      try {
        var sopts = stOpts();
        if (secStarter && String(secStarter).trim()) sopts.sectionStarter = String(secStarter).trim();
        var res = await window.t2i_callbackSection(sopts, from, heading, $("pgen-desc").value);
        var content = Array.isArray(res) ? res.map(function (s, i) { return (i + 1) + ". " + s; }).join("\n\n") : res;
        if (!content) toast("⚠️ nothing came back — try again");
        else if (applySecContent(heading, content)) toast("🪢 wove “" + from + "” into “" + heading + "”");
        else toast("⚠️ couldn't place the new text — try again");
      } catch (e) {
        console.error(e);
        toast("⚠️ callback failed");
      }
      secBusy = false;
      if (go.isConnected) { go.disabled = false; go.textContent = label; }
      xout.hidden = true;
    });
  }
  // Append 1-10 NEW examples to the Roleplay Behavior Examples already built
  // (numbering continues from the existing count). If the section is missing
  // entirely, the new examples start it at 1.
  async function addMoreExamples(addCount, btn) {
    if (genObj) { toast("⏹ finish the current generation first"); return false; }
    if (secBusy || bulkActive) { toast("⏳ a section is already being written…"); return false; }
    if (!window.t2i_appendPersonaExamples) { toast("⚠️ persona engine not loaded"); return false; }
    var descEl = $("pgen-desc");
    if (!descEl || !descEl.value.trim()) { toast("⚠️ generate or load a character first"); return false; }
    var kRaw = parseInt(addCount, 10);
    var k = !(kRaw >= 1) ? 1 : Math.min(10, kRaw);
    var label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "⏳ writing…"; }
    secBusy = true;
    var ok = false;
    try {
      var full = descEl.value;
      var have = 0;
      try { have = window.t2i_countPersonaExamples ? window.t2i_countPersonaExamples(full) : 0; } catch (e) {}
      var res = await window.t2i_appendPersonaExamples(stOpts(), k, full);
      if (!res || !res.length) { toast("⚠️ nothing came back — try again"); }
      else {
        var numbered = res.map(function (s, i) { return (have + 1 + i) + ". " + s; }).join("\n\n");
        var next = null;
        var cur = null;
        parseSections(full).forEach(function (s) { if (s.heading === "Roleplay Behavior Examples") cur = s; });
        if (cur && window.t2i_replacePersonaSection) {
          var combined = String(cur.content || "").replace(/\s+$/, "") + "\n\n" + numbered;
          next = window.t2i_replacePersonaSection(full, "Roleplay Behavior Examples", combined);
        } else if (!cur && window.t2i_addPersonaSection) {
          next = window.t2i_addPersonaSection(full, "Roleplay Behavior Examples", numbered);
        }
        if (next == null) { toast("⚠️ couldn't place the new examples — try again"); }
        else {
          descEl.value = next;
          st.persona.description = descEl.value;
          st.persona.sections = parseSections(descEl.value);
          refreshSections(); saveLast(); updateWordCount(); updateSaveButton();
          toast("➕ added " + res.length + " example" + (res.length === 1 ? "" : "s") + " (now " + (have + res.length) + ")");
          ok = true;
        }
      }
    } catch (e) {
      console.error(e);
      toast("⚠️ adding examples failed");
    }
    secBusy = false;
    if (btn) { btn.disabled = false; btn.textContent = label; }
    return ok;
  }
  /* ------------------------------------------------- ➕ add to section
     Each section row has a ➕ add to button that opens an inline composer: the
     user types the new info in their own words (+ an optional prompt starter),
     ✨ Rewrite addition polishes ONLY that addition via t2i_polishSectionAddition
     (the section itself is context, never rewritten), and ✅ Add to section
     appends the reviewed text raw-preserving. Roleplay Behavior Examples go
     through the same composer but the addition is numbered on append so the
     sequence continues. */
  function toggleSecAdd(row, heading) {
    if (!row) return;
    var old = row.querySelector(".pgen-sec-addbox");
    if (old) { old.remove(); return; }
    var descEl = $("pgen-desc");
    if (!descEl || !descEl.value.trim()) { toast("⚠️ generate or load a character first"); return; }
    var host = $("pgen-sections");
    if (host) {
      var open = host.querySelectorAll(".pgen-sec-addbox");
      for (var k = 0; k < open.length; k++) open[k].remove();
    }
    var isExamples = heading === "Roleplay Behavior Examples";
    var box = document.createElement("div");
    box.className = "pgen-sec-addbox";
    box.innerHTML =
      '<label class="pgen-sec-add-lb">➕ New info for “' + esc(heading) + '” — your words, rough is fine' +
      '<textarea class="pro-textarea pgen-sec-add-raw" spellcheck="true" placeholder="' + esc(isExamples ? "e.g. an example where she barters with a river spirit at dawn…" : "e.g. she keeps a chipped mug from her late brother and refuses to drink from anything else…") + '"></textarea></label>' +
      '<label class="pgen-sec-add-lb">✍️ Prompt starter (optional) — steer just this addition' +
      '<input class="pro-input pgen-sec-add-starter" placeholder="optional — e.g. terse, in her voice" value="' + esc(secStarters[heading] || "") + '"></label>' +
      '<div class="pgen-sec-add-btns"><button type="button" class="pgen-sec-regen" data-secadd-rewrite>✨ Rewrite addition</button>' +
      '<button type="button" class="pgen-sec-regen" data-secadd-apply>✅ Add to section</button>' +
      '<button type="button" class="pgen-sec-del" data-secadd-cancel>✖</button></div>' +
      '<label class="pgen-sec-add-lb pgen-sec-add-prevwrap" hidden>✨ Rewritten addition — edit freely, then ✅ Add to section' +
      '<textarea class="pro-textarea pgen-sec-add-prev" spellcheck="true"></textarea></label>' +
      '<div class="pgen-sec-add-note">The rewrite polishes only this addition — the section itself is untouched until you press ✅.' +
      (isExamples ? " Examples are numbered on append so the sequence continues." : "") + "</div>";
    row.appendChild(box);
    var rawEl = box.querySelector(".pgen-sec-add-raw");
    var starterEl = box.querySelector(".pgen-sec-add-starter");
    var rewriteBtn = box.querySelector("[data-secadd-rewrite]");
    var applyBtn = box.querySelector("[data-secadd-apply]");
    var prevWrap = box.querySelector(".pgen-sec-add-prevwrap");
    var prevEl = box.querySelector(".pgen-sec-add-prev");
    if (starterEl) starterEl.addEventListener("input", function () {
      secStarters[heading] = starterEl.value;
      try { lsSet(LS_SEC_STARTERS, JSON.stringify(secStarters)); } catch (e) {}
    });
    box.querySelector("[data-secadd-cancel]").addEventListener("click", function () { box.remove(); });
    rewriteBtn.addEventListener("click", function () { secAddRewrite(heading, box); });
    applyBtn.addEventListener("click", function () { secAddApply(heading, box); });
    try { rawEl.focus(); } catch (e) {}
  }
  async function secAddRewrite(heading, box) {
    if (secAddBusy) { toast("⏳ rewriting already…"); return; }
    if (genObj || secBusy || bulkActive) { toast("⏳ finish the current generation first"); return; }
    if (!(window.root && window.root.generateText)) { toast("⚠️ AI text not available"); return; }
    if (!window.t2i_polishSectionAddition) { toast("⚠️ persona engine not loaded yet"); return; }
    var descEl = $("pgen-desc");
    if (!descEl || !descEl.value.trim()) { toast("⚠️ generate or load a character first"); return; }
    var rawEl = box.querySelector(".pgen-sec-add-raw");
    var starterEl = box.querySelector(".pgen-sec-add-starter");
    var rewriteBtn = box.querySelector("[data-secadd-rewrite]");
    var prevWrap = box.querySelector(".pgen-sec-add-prevwrap");
    var prevEl = box.querySelector(".pgen-sec-add-prev");
    var raw = rawEl ? rawEl.value.trim() : "";
    if (!raw) { toast("⚠️ type the new info first"); try { rawEl.focus(); } catch (e) {} return; }
    var label = rewriteBtn ? rewriteBtn.textContent : "";
    if (rewriteBtn) { rewriteBtn.disabled = true; rewriteBtn.textContent = "⏳ rewriting…"; }
    secAddBusy = true;
    try {
      var polished = await window.t2i_polishSectionAddition(stOpts(), heading, descEl.value, raw, starterEl ? starterEl.value : "");
      polished = String(polished || "").trim();
      if (!polished) { toast("⚠️ the AI returned nothing — try again"); }
      else {
        prevEl.value = polished;
        prevWrap.hidden = false;
        toast("✨ rewritten — review it, edit if you like, then ✅ Add");
        try { prevEl.focus(); } catch (e) {}
      }
    } catch (e) {
      console.error(e);
      toast("⚠️ rewrite failed");
    }
    secAddBusy = false;
    if (rewriteBtn && rewriteBtn.isConnected) { rewriteBtn.disabled = false; rewriteBtn.textContent = label; }
  }
  function secAddApply(heading, box) {
    if (genObj || secBusy || bulkActive) { toast("⏳ finish the current generation first"); return; }
    var descEl = $("pgen-desc");
    if (!descEl || !descEl.value.trim()) { toast("⚠️ generate or load a character first"); return; }
    var rawEl = box.querySelector(".pgen-sec-add-raw");
    var prevWrap = box.querySelector(".pgen-sec-add-prevwrap");
    var prevEl = box.querySelector(".pgen-sec-add-prev");
    var addition = (prevWrap && !prevWrap.hidden && prevEl && prevEl.value.trim()) ? prevEl.value.trim() : (rawEl ? rawEl.value.trim() : "");
    if (!addition) { toast("⚠️ nothing to add yet — type it, or ✨ rewrite first"); return; }
    var full = descEl.value;
    var cur = null;
    parseSections(full).forEach(function (s) { if (s.heading === heading) cur = s; });
    if (!cur) { toast("⚠️ that section is already gone"); refreshSections(); return; }
    var combined = null;
    if (heading === "Roleplay Behavior Examples") {
      var have = 0;
      try { have = window.t2i_countPersonaExamples ? window.t2i_countPersonaExamples(full) : 0; } catch (e) {}
      var items = addition.split(/\n\s*\n/).map(function (s) { return String(s).trim(); }).filter(Boolean);
      if (!items.length) { toast("⚠️ nothing to add yet"); return; }
      var numbered = items.map(function (s, i) { return (have + 1 + i) + ". " + s.replace(/^\s*\d{1,3}\s*[.)]\s*/, ""); }).join("\n\n");
      combined = String(cur.content || "").replace(/\s+$/, "") + "\n\n" + numbered;
    } else {
      combined = String(cur.content || "").replace(/\s+$/, "") + "\n\n" + addition;
    }
    var next = replaceSectionBody(full, heading, combined);
    if (next == null) { toast("⚠️ couldn't add it — try again"); return; }
    descEl.value = next;
    st.persona.description = descEl.value;
    st.persona.sections = parseSections(descEl.value);
    refreshSections(); saveLast(); updateWordCount(); updateSaveButton();
    toast(heading === "Roleplay Behavior Examples" ? "➕ example(s) added to “" + heading + "”" : "➕ added to “" + heading + "”");
  }

  /* ------------------------------------------------------- 💬 chat fit UI */
  var chatSplitKey = null, distilling = false;
  function renderChatFit() {
    if (!built) return;
    var tgl = $("pgen-chatfit-toggle"), cfBody = $("pgen-chatfit-body");
    if (tgl) {
      tgl.textContent = st.chat.enabled ? "● on" : "○ off";
      tgl.classList.toggle("on", !!st.chat.enabled);
      tgl.title = st.chat.enabled ? "Chat-fit is ON — click to switch it off (card collapses, chats get the full description)" : "Turn the chat-fit tool on — meter, distill, lore-split and trimmed chat handoffs";
    }
    if (cfBody) cfBody.hidden = !st.chat.enabled;
    var b0 = $("pgen-chatfit-badge");
    if (b0) { b0.hidden = !st.chat.enabled; if (!st.chat.enabled) b0.textContent = "off"; }
    try {
      var bondChk0 = $("pgen-dynamic-bond");
      if (bondChk0 && window.t2i_dynamicBondEnabled) bondChk0.checked = window.t2i_dynamicBondEnabled();
    } catch (e) {}
    if (!st.chat.enabled) { try { updateOverGuide(); } catch (e) {} return; }
    try {
      var bondChk = $("pgen-dynamic-bond");
      if (bondChk && window.t2i_dynamicBondEnabled) bondChk.checked = window.t2i_dynamicBondEnabled();
    } catch (e) {}
    var ess = $("pgen-chatfit-essence"), rem = $("pgen-chatfit-reminder");
    if (ess && document.activeElement !== ess) ess.value = st.chat.essence || "";
    if (rem && document.activeElement !== rem) rem.value = st.chat.reminder || "";
    var party = $("pgen-chatfit-party");
    if (party) party.querySelectorAll("button").forEach(function (b) {
      b.classList.toggle("on", parseInt(b.getAttribute("data-g"), 10) === st.chat.group);
    });
    renderChatSplit();
    renderChatPubnote();
    updateChatFit();
  }
  function renderChatSplit() {
    var host = $("pgen-chatfit-split");
    if (!host) return;
    var sections = orderedSections((($("pgen-desc") || {}).value) || "");
    var key = sections.map(function (s) { return s.heading; }).join("\n");
    if (key === chatSplitKey && host.dataset.built === "1") { paintChatSplit(); return; }
    chatSplitKey = key;
    host.innerHTML = "";
    host.dataset.built = "1";
    if (!sections.length) {
      host.innerHTML = '<div class="pgen-empty">Generate a character and its sections will be listed here.</div>';
      return;
    }
    sections.forEach(function (s) {
      var row = document.createElement("div");
      row.className = "pgen-chatfit-splitrow";
      row.dataset.head = s.heading;
      row.innerHTML =
        '<span class="pgen-chatfit-splittitle" title="Core = sent every reply · Lore = on-demand lorebook only"># ' + esc(s.heading) + "</span>" +
        '<span class="pgen-chatfit-seg"><button type="button" data-a="core">Core</button><button type="button" data-a="lore">Lore</button></span>';
      row.querySelector('[data-a="core"]').addEventListener("click", function () { setChatHead(s.heading, false); });
      row.querySelector('[data-a="lore"]').addEventListener("click", function () { setChatHead(s.heading, true); });
      host.appendChild(row);
    });
    paintChatSplit();
  }
  function paintChatSplit() {
    var host = $("pgen-chatfit-split");
    if (!host) return;
    var loreSet = {};
    (st.chat.loreHeads || []).forEach(function (h) { loreSet[h] = true; });
    host.querySelectorAll(".pgen-chatfit-splitrow").forEach(function (row) {
      var isLore = !!loreSet[row.dataset.head];
      row.querySelector('[data-a="core"]').classList.toggle("on", !isLore);
      row.querySelector('[data-a="lore"]').classList.toggle("on", isLore);
    });
  }
  function setChatHead(heading, isLore) {
    var i = st.chat.loreHeads.indexOf(heading);
    if (isLore && i < 0) st.chat.loreHeads.push(heading);
    if (!isLore && i >= 0) st.chat.loreHeads.splice(i, 1);
    chatSave(); paintChatSplit(); updateChatFit();
  }
  function renderChatPubnote() {
    var el = $("pgen-chatfit-pubnote");
    if (!el) return;
    if (st.chat.loreUrl) {
      el.innerHTML = "📤 Published: <b>" + buildChatLoreFacts().length + " facts</b> · <a href=\"" + esc(st.chat.loreUrl) + "\" target=\"_blank\" rel=\"noopener\">open file</a> · attached to chat handoffs ✓ " +
        '<button type="button" id="pgen-chatfit-unlink" title="Stop attaching this URL to chat handoffs (the file itself stays up)">✖ unlink</button>';
      var un = $("pgen-chatfit-unlink");
      if (un) un.addEventListener("click", function () {
        st.chat.loreUrl = "";
        chatSave(); renderChatFit(); updateSaveButton();
        toast("🔗 lore URL unlinked — lorebook pastes into chats until you 📤 publish again");
      });
    }
    else el.textContent = st.lore.entries.length ? "Not published yet — the lorebook is pasted into chats (eats context) until you 📤 publish." : "No lorebook entries yet.";
  }
  function updateChatFit() {
    if (!built) return;
    if (!st.chat.enabled) { var bo = $("pgen-chatfit-badge"); if (bo) { bo.textContent = "off"; bo.hidden = true; } return; }
    var bo2 = $("pgen-chatfit-badge"); if (bo2) bo2.hidden = false;
    var pack = null, m = null;
    try { pack = chatFitPack(); m = chatFitMeter(pack); } catch (e) { return; }
   var gName = m.party === 1 ? "Solo" : (m.party === 2 ? "Duo" : "Group");
    var gWhy = m.party === 1 ? "just this character" : (m.party === 2 ? "2 characters share the budget" : "3+ characters share the budget");
    var badge = $("pgen-chatfit-badge");
    if (badge) badge.textContent = !pack.body.trim() ? "—" : (m.zone === "ok" ? "✅ fit" : (m.zone === "warn" ? "⚠️ tight" : "🔴 over"));
    var meter = $("pgen-chatfit-meter");
    if (meter) {
      var pct = Math.max(2, Math.min(100, Math.round(m.toks / m.share * 100)));
     var h = '<div class="pgen-chatfit-line">Sent every reply: <b>' + chatNum(m.words) + " words · ~" + chatNum(m.chars) + " chars · ~" + chatNum(m.toks) + " tokens</b></div>" +
        '<div class="pgen-chatfit-line pgen-chatfit-dull">Budget ~' + chatNum(m.share) + " tokens for " + gName + " (" + gWhy + ")</div>" +
        '<div class="pgen-chatfit-bar"><span class="cf-' + m.zone + '" style="width:' + pct + '%"></span></div>';
      if (!pack.body.trim()) h += '<div class="pgen-chatfit-line">Generate or load a character to measure it.</div>';
      else if (m.zone === "ok") h += '<div class="pgen-chatfit-line cf-ok">✅ fits — the chat sees all of it.</div>';
      else if (m.zone === "warn") h += '<div class="pgen-chatfit-line cf-warn">⚠️ tight — long replies may squeeze chat history.</div>';
      else h += '<div class="pgen-chatfit-line cf-bad">🔴 over budget — the chat keeps roughly the first ' + m.rung + ' chars + [...]. Distill or move sections to lore.</div>';
      var facts = buildChatLoreFacts();
      h += '<div class="pgen-chatfit-line">On demand: <b>' + facts.length + " lore facts</b>" +
        (st.chat.loreUrl ? " via published URL ✓" : (st.lore.entries.length ? " (pasted into chats until published)" : "")) +
        (pack.essenceUsed ? " · distilled essence ✓" : "") + "</div>";
      if (pack.loreHeads.length && !st.lore.entries.length) h += '<div class="pgen-chatfit-line cf-warn">⚠️ ' + pack.loreHeads.length + " lore-flagged section" + (pack.loreHeads.length === 1 ? " is" : "s are") + " not in the lorebook yet — convert " + (pack.loreHeads.length === 1 ? "it" : "them") + " to facts so chats can still use " + (pack.loreHeads.length === 1 ? "it" : "them") + ".</div>";
      meter.innerHTML = h;
    }
    var cut = $("pgen-chatfit-cut");
    if (cut) cut.textContent = !pack.body.trim() ? "(nothing to preview yet)" : (m.cut ? m.seen + "\n\n— cut here: everything below is dropped by the chat (approx) —" : m.seen);
    var sim = $("pgen-chatfit-parties");
    if (sim) sim.innerHTML = chatFitPartyRows(pack);
    var ec = $("pgen-chatfit-essence-count"), rc = $("pgen-chatfit-reminder-count");
    if (ec) ec.textContent = chatWords(st.chat.essence) + " words" + (st.chat.essence.trim() ? " (aim ~600–800)" : " — empty, full description is sent");
    if (rc) {
      var rw = chatWords(pack.reminder);
      rc.textContent = rw + " / 100 words" + (rw > 100 ? " ⚠️ over — trim it" : "");
    }
    renderChatPubnote();
    try { updateOverGuide(); } catch (e) {}
  }
  function convertLoreSections() {
    var desc = (($("pgen-desc") || {}).value) || "";
    if (!desc.trim()) { toast("⚠️ generate or load a character first"); return; }
    var heads = chatLoreHeads();
    if (!heads.length) { toast("⚠️ flag a section as Lore first (Core vs lore list)"); return; }
    var have = {};
    (st.lore.entries || []).forEach(function (e) { have[String(e.content || "").trim()] = true; });
    var added = 0;
    var sections = parseSections(desc);
    heads.forEach(function (h) {
      var cur = null;
      sections.forEach(function (s) { if (s.heading === h) cur = s; });
      if (!cur) return;
      var chunks = splitFacts(cur.content);
      chunks.forEach(function (f, i) {
        var content = h + ": " + f;
        if (have[content]) return;
        have[content] = true;
        st.lore.entries.push({ id: uid(), title: chunks.length > 1 ? h + " · " + (i + 1) : h, keys: [h], content: content });
        added++;
      });
    });
    if (!added) { toast("⚠️ nothing new to convert"); return; }
    loreSave(); loreRender(); updateChatFit();
    toast("📖 converted to " + added + " lorebook facts — review, then 📤 publish");
  }
  /* ----------------------- 🔴 over-budget guided fix (glowing arrows) ------ */
  // When the chat would CUT the persona (meter over its share), a 4-step glowing
  // arrow sequence walks the user through the fix in order: 1) turn 💬 Chat fit
  // on → 2) flip the biggest core section to Lore → 3) 📖 Lore sections →
  // lorebook facts → 4) 📤 Publish lorebook. The step is DERIVED from world
  // state on every meter refresh, so each completed action advances the arrow
  // with no extra event plumbing. ✖ dismisses the current step (a new step or
  // a fit-again meter clears the dismissal).
  var guideDismissedStep = 0, guideStep = 0, guideKey = "", guideTarget = null, guideRaf = 0;
  function guideArrowEl() {
    var el = document.getElementById("pgen-guide-arrow");
    if (el) return el;
    el = document.createElement("div");
    el.id = "pgen-guide-arrow";
    el.hidden = true;
    el.innerHTML = '<div class="pgen-guide-bubble"><span class="pgen-guide-step"></span><span class="pgen-guide-text"></span><button type="button" class="pgen-guide-x" title="Dismiss until the meter fits again">✖</button></div><div class="pgen-guide-point">⬇</div>';
    el.querySelector(".pgen-guide-x").addEventListener("click", function (e) {
      e.stopPropagation();
      guideDismissedStep = guideStep || guideDismissedStep; guideStep = 0; guideKey = ""; hideGuideArrow();
    });
    document.body.appendChild(el);
    window.addEventListener("scroll", scheduleGuidePlace, true);
    window.addEventListener("resize", scheduleGuidePlace);
    return el;
  }
  function scheduleGuidePlace() {
    if (guideRaf) return;
    guideRaf = requestAnimationFrame(function () { guideRaf = 0; placeGuideArrow(); });
  }
  function hideGuideArrow() {
    var el = document.getElementById("pgen-guide-arrow");
    if (el) el.hidden = true;
    if (guideTarget && guideTarget.classList) guideTarget.classList.remove("pgen-guide-target");
    guideTarget = null;
  }
  function placeGuideArrow() {
    var el = document.getElementById("pgen-guide-arrow");
    if (!el || !guideTarget) return;
    if (!guideTarget.isConnected) { el.hidden = true; return; }
    var r;
    try { r = guideTarget.getBoundingClientRect(); } catch (e) { el.hidden = true; return; }
    if (!r || r.width < 2 || r.height < 2) { el.hidden = true; return; }
    el.hidden = false;
    var below = r.top < 150;
    el.classList.toggle("pgen-guide-below", below);
    el.querySelector(".pgen-guide-point").textContent = below ? "⬆" : "⬇";
    el.style.left = Math.max(80, Math.min(window.innerWidth - 80, r.left + r.width / 2)) + "px";
    if (below) { el.style.top = (r.bottom + 10) + "px"; el.style.bottom = "auto"; }
    else { el.style.bottom = (window.innerHeight - r.top + 10) + "px"; el.style.top = "auto"; }
  }
  function showGuideArrow(step, target, key, label) {
    if (!target || !target.isConnected) { hideGuideArrow(); guideStep = 0; guideKey = ""; return; }
    var changed = step !== guideStep || key !== guideKey;
    if (guideTarget && guideTarget !== target && guideTarget.classList) guideTarget.classList.remove("pgen-guide-target");
    guideStep = step; guideKey = key; guideTarget = target;
    var el = guideArrowEl();
    el.querySelector(".pgen-guide-step").textContent = step + "/4";
    el.querySelector(".pgen-guide-text").textContent = label;
    if (target.classList) target.classList.add("pgen-guide-target");
    placeGuideArrow();
    if (changed && !el.hidden) {
      try { target.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {}
      scheduleGuidePlace();
    }
  }
  function longestCoreSection() {
    var lore = {};
    chatLoreHeads().forEach(function (h) { lore[h] = true; });
    var best = null;
    orderedSections(($("pgen-desc") || {}).value || "").forEach(function (s) {
      if (lore[s.heading]) return;
      if (!best || String(s.content || "").length > String(best.content || "").length) best = s;
    });
    return best;
  }
  function loreButtonFor(heading) {
    var host = $("pgen-chatfit-split");
    if (!host || !heading) return null;
    var rows = host.querySelectorAll(".pgen-chatfit-splitrow"), row = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].dataset.head === heading) { row = rows[i]; break; }
    return row ? row.querySelector('[data-a="lore"]') : null;
  }
  function updateOverGuide() {
    if (!built) return;
    var m = null;
    try { m = chatFitMeter(chatFitPack()); } catch (e) { m = null; }
    if (!m || !m.cut) { guideDismissedStep = 0; guideStep = 0; guideKey = ""; hideGuideArrow(); return; }
    var step = 0, target = null, key = "", label = "";
    if (!st.chat.enabled) {
      step = 1; key = "toggle";
      target = $("pgen-chatfit-toggle") || $("pgen-chatfit-card");
      label = "Persona is over chat budget — switch 💬 Chat fit ON to fix it";
    } else {
      try { renderChatSplit(); } catch (e) {}
      var heads = chatLoreHeads();
      if (!heads.length) {
        var cand = longestCoreSection();
        step = 2; key = "lore:" + (cand ? cand.heading : "?");
        target = (cand && loreButtonFor(cand.heading)) || $("pgen-chatfit-split");
        label = cand ? "Move «" + cand.heading + "» from Core to Lore" : "Switch a section from Core to Lore";
      } else if (!(st.lore.entries || []).length) {
        step = 3; key = "convert"; target = $("pgen-chatfit-convert");
        label = "Turn the lore sections into lorebook facts";
      } else if (!st.chat.loreUrl) {
        step = 4; key = "publish"; target = $("pgen-chatfit-publish");
        label = "Publish the lorebook so chats fetch facts on demand";
      } else { hideGuideArrow(); guideStep = 0; guideKey = ""; return; }
    }
    if (guideDismissedStep === step) { hideGuideArrow(); return; }
    guideDismissedStep = 0;
    showGuideArrow(step, target, key, label);
  }
  function parseDistill(txt) {
    var out = { essence: "", reminder: "", facts: [] };
    var re = /###\s*(ESSENCE|REMINDER|LORE\s*FACTS)\s*\n([\s\S]*?)(?=###\s*(?:ESSENCE|REMINDER|LORE\s*FACTS)\s*\n|$)/gi;
    var m;
    while ((m = re.exec(String(txt || "")))) {
      var k = m[1].replace(/\s+/g, "").toUpperCase();
      var v = m[2].trim();
      if (k === "ESSENCE") out.essence = v;
      else if (k === "REMINDER") out.reminder = v;
      else v.split("\n").forEach(function (ln) {
        var f = String(ln || "").replace(/^\s*(?:[-•*]|\d+[.)])\s+/, "").trim();
        if (f) out.facts.push(f);
      });
    }
    return out;
  }
  async function distillForChat(btn) {
    var desc = ((($("pgen-desc") || {}).value) || "").trim();
    if (!desc) { toast("⚠️ generate or load a character first"); return; }
    if (!(window.root && window.root.generateText)) { toast("⚠️ AI text not available"); return; }
    if (genObj || secBusy || bulkActive || distilling) { toast("⏳ finish the current generation first"); return; }
    var name = ((($("pgen-name") || {}).value) || "").trim() || "the character";
    var o = st.opts || {};
    var label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "⏳ distilling…"; }
    distilling = true;
    try {
      var extra = [];
      if (o.language && !/^english$/i.test(String(o.language))) extra.push("Write the ESSENCE, REMINDER and facts in " + o.language + " (keep the ### headers in English).");
      if (o.rating) extra.push("Match content rating " + o.rating + " (stay tasteful unless it is mature or explicit).");
      var r = await window.root.generateText({
        instruction: "TASK: Distill this rich roleplay character into chat-sized pieces. The chat AI ignores anything past its context budget, so the ESSENCE must carry the whole character alone, and everything else must survive as standalone lore facts.\n\nFULL CHARACTER: " + name + "\n" + desc.slice(0, 12000) +
        "\n\nRULES:\n- ESSENCE (~600-800 words, third person): looks, personality core, voice and speech habits, the defining wound, relationship to {{user}}, and 2 short example exchanges at the end. Condense — do not paste sections whole.\n- REMINDER (under 100 words): \"" + name + " is ...\" — who they are, how they speak, what they want right now. Direct and punchy.\n- LOREFacts: one per line starting with \"- \", 1-2 sentences each, covering everything in the character that is NOT in the essence. Each fact must stand alone: use the character's name, never bare pronouns. No commentary, no repeats." +
        (extra.length ? "\n- " + extra.join("\n- ") : "") +
        "\n\nReply EXACTLY in this shape:\n### ESSENCE\n...\n### REMINDER\n...\n### LOREFacts\n- ..."
      });
      var txt = "";
      try { txt = (r && r.text) || (typeof r === "string" ? r : "") || ""; } catch (e) {}
      var parsed = parseDistill(txt);
      if (!parsed.essence) { toast("⚠️ the AI returned nothing usable — try again"); }
      else {
        st.chat.essence = parsed.essence.slice(0, 12000);
        st.chat.reminder = capWordsAtSentence(parsed.reminder, 100);
        var have = {};
        (st.lore.entries || []).forEach(function (e) { have[String(e.content || "").trim()] = true; });
        var added = 0;
        parsed.facts.slice(0, 80).forEach(function (f) {
          splitFacts(f).forEach(function (chunk) {
            if (added >= 120) return;
            var content = chunk.slice(0, 2000);
            if (have[content]) return;
            have[content] = true;
            st.lore.entries.push({ id: uid(), title: chunk.split(/\s+/).slice(0, 6).join(" ").slice(0, 60), keys: [], content: content });
            added++;
          });
        });
        if (!st.lore.name) st.lore.name = name + " — lorebook";
        chatSave(); loreSave(); loreRender(); renderChatFit();
        toast("✨ distilled: essence + reminder" + (added ? " + " + added + " lore facts — review, then 📤 publish" : ""));
      }
    } catch (e) { console.error(e); toast("⚠️ distilling failed"); }
    distilling = false;
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
  function chatLoreFileName() {
    var s = "";
    try {
      var a = new Uint8Array(16);
      if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(a);
      else for (var i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256);
      for (var j = 0; j < a.length; j++) s += "abcdefghijklmnopqrstuvwxyz0123456789"[a[j] % 36];
    } catch (e) {
      s = (Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12)).toLowerCase().replace(/[^a-z0-9]/g, "");
    }
    return "persona-lore-" + s;
  }
  async function publishLore(btn) {
    var facts = buildChatLoreFacts();
    if (!facts.length) { toast("⚠️ lorebook is empty — generate or add entries first"); return; }
    if (!(window.root && window.root.uploadPlugin && window.root.uploadPlugin.editable)) { toast("⚠️ publishing not available"); return; }
    var label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "⏳ publishing…"; }
    try {
      var text = facts.join("\n\n");
      var nm = st.chat.loreName || chatLoreFileName();
      var res = await window.root.uploadPlugin.editable.set(nm, text, st.chat.loreEditKey ? { editKey: st.chat.loreEditKey } : undefined);
      if (!res) throw new Error("empty response");
      if (res.error) {
        if (res.error === "editable_requires_saved_generator") toast("⚠️ save the generator first (unsaved previews can't publish), then 📤 publish again");
        else if (/^anti_bot/.test(res.error)) {
          // Editable writes face stricter bot checks than plain uploads, and an
          // interactive Cloudflare challenge can't render inside the hidden upload
          // frame — so fall back to an immutable one-time upload instead of failing.
          toast("⚠️ bot-check blocked the stable publish — uploading a one-time link instead…");
          try {
            var up = await window.root.uploadPlugin(text);
            if (up && !up.error && up.url) {
              st.chat.loreUrl = up.url;
              st.chat.loreName = null; st.chat.loreEditKey = null; // retry the stable publish next time
              chatSave(); renderChatFit(); updateSaveButton();
              toast("📤 lorebook published (" + facts.length + " facts) via one-time link — attached to chat handoffs. 📤 publish again later for a stable auto-updating link.");
            } else toast("⚠️ publish failed (" + ((up && up.error) || "upload failed") + ") — bot protection is blocking uploads. Disable adblockers for upload.perchance.org and challenges.cloudflare.com, open the generator in your main browser (not an in-app preview), wait a minute, then retry.");
          } catch (e2) { console.error(e2); toast("⚠️ publish failed — bot protection is blocking uploads (see console)"); }
        }
        else toast("⚠️ publish failed (" + res.error + ")");
      } else if (res.superseded) {
        toast("⏳ a publish is already in flight — try again in a few seconds");
      } else {
        if (!st.chat.loreName) st.chat.loreName = nm;
        if (res.editKey) st.chat.loreEditKey = res.editKey;
        var url = res.url || ("https://editable.uploads.dev/file/" + window.generatorName + "/" + nm);
        if (res.editCount > 1) url += "?v=" + res.editCount;
        st.chat.loreUrl = url;
        chatSave(); renderChatFit(); updateSaveButton();
        toast("📤 lorebook published (" + facts.length + " facts) — attached to chat handoffs");
      }
    } catch (e) { console.error(e); toast("⚠️ publish failed"); }
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
  /* --------------------------------------------- multi-section "Add" picker */
  // The picker lets several missing sections be ticked at once; the ticked set
  // (pickList) is generated one at a time, each from the growing description, so
  // ordering/context stays consistent across the batch.
  function secLabel(heading) {
    var ex = options().extraSections || [];
    for (var i = 0; i < ex.length; i++) if (ex[i].id === heading) return ex[i].label;
    return heading;
  }
  function selectedHeadings() { return pickList.slice(); }
  function isPickSelected(h) { return pickList.indexOf(h) >= 0; }
  function forgetStarter(h) {
    if (!h) return;
    if (Object.prototype.hasOwnProperty.call(secStarters, h)) {
      delete secStarters[h];
      try { lsSet(LS_SEC_STARTERS, JSON.stringify(secStarters)); } catch (e) {}
    }
  }
  function pickToggle(h) {
    var i = pickList.indexOf(h);
    if (i >= 0) { pickList.splice(i, 1); forgetStarter(h); } else pickList.push(h);
    renderPick();
    updateAddSecSummary();
  }
  function pickAdd(h) {
    h = String(h == null ? "" : h).trim();
    if (!h || isPickSelected(h)) return;
    pickList.push(h);
    renderPick();
    updateAddSecSummary();
  }
  function pickRemove(h) {
    var i = pickList.indexOf(h);
    if (i < 0) return;
    pickList.splice(i, 1);
    forgetStarter(h);
    renderPick();
    updateAddSecSummary();
  }
  function updateAddSecSummary() {
    var go = $("pgen-addsec-go"), sum = $("pgen-addsec-sum");
    var n = pickList.length;
    if (go && !bulkActive) {
      go.textContent = n ? "➕ Add & generate (" + n + ")" : "➕ Add & generate";
      go.classList.toggle("pgen-addsec-ready", n > 0);
    }
    if (!sum) return;
    if (!n) { sum.textContent = "No extra sections selected — tap ➕ Add sections to pick some."; sum.hidden = false; return; }
    var names = pickList.map(function (h) { return secLabel(h); });
    var head = names.slice(0, 3).join(", ") + (names.length > 3 ? " +" + (names.length - 3) + " more" : "");
    sum.innerHTML = "🧩 <b>" + n + "</b> selected: " + esc(head);
    sum.hidden = false;
  }
  function closeSectionPicker() {
    if (pickEsc) { document.removeEventListener("keydown", pickEsc, true); pickEsc = null; }
    if (pickOverlay && pickOverlay.parentNode) pickOverlay.parentNode.removeChild(pickOverlay);
    pickOverlay = null;
  }
  function renderPick() {
    if (!pickOverlay) return;
    var O = options();
    var q = (pickOverlay.querySelector("#pgen-pick-search").value || "").toLowerCase();
    // remember scroll positions — innerHTML rewrites reset them, and losing
    // your place mid-tick feels like the list "isn't scrollable"
    var chipsPrev = pickOverlay.querySelector("#pgen-pick-chips"),
        startersPrev = pickOverlay.querySelector("#pgen-pick-secstarters"),
        groupsPrev = pickOverlay.querySelector("#pgen-pick-groups");
    var chipsSc = chipsPrev ? chipsPrev.scrollTop : 0,
        startersSc = startersPrev ? startersPrev.scrollTop : 0,
        groupsSc = groupsPrev ? groupsPrev.scrollTop : 0;
    var opts = sectionAddOptions();
    // chips (selected, in tick order)
    var chips = pickOverlay.querySelector("#pgen-pick-chips");
    if (!pickList.length) {
      chips.innerHTML = '<span class="pgen-pick-chips-empty">Nothing ticked yet — pick sections below, or add your own heading.</span>';
    } else {
      chips.innerHTML = pickList.map(function (h) {
        return '<span class="pgen-pick-chip">' + esc(secLabel(h)) + '<button type="button" data-pickrm="' + esc(h) + '" title="Remove">✖</button></span>';
      }).join("");
    }
    chips.scrollTop = chipsSc;
    // per-section starters (one optional line per ticked section; layered on top of the shared one)
    var startersHost = pickOverlay.querySelector("#pgen-pick-secstarters");
    if (startersHost) {
      if (!pickList.length) {
        startersHost.innerHTML = '<div class="pgen-pick-secstarters-empty">✍️ Tick a section to give it its own optional prompt starter.</div>';
      } else {
        startersHost.innerHTML = pickList.map(function (h) {
          var v = secStarters[h] || "";
          return '<div class="pgen-pick-secstarter-row"><span title="' + esc(secLabel(h)) + '">' + esc(secLabel(h)) + "</span>" +
            '<input class="pro-input" data-secstarter="' + esc(h) + '" placeholder="optional direction just for this section" value="' + esc(v) + '"></div>';
        }).join("");
      }
    }
    if (startersHost) startersHost.scrollTop = startersSc;
    // groups
    function group(title, items, key) {
      var list = items.filter(function (it) {
        if (!q) return true;
        return String(it.label).toLowerCase().indexOf(q) >= 0 || String(it.id).toLowerCase().indexOf(q) >= 0;
      });
      if (!list.length) return "";
      var allOn = list.every(function (it) { return isPickSelected(it.id); });
      var html = '<div class="pgen-pick-group"><div class="pgen-pick-group-h"><span>' + title + "</span>" +
        '<button type="button" class="pgen-pick-allbtn" data-pickall="' + key + '">' + (allOn ? "clear" : "all") + "</button></div>" +
        '<div class="pgen-pick-grid">';
      list.forEach(function (it) {
        var on = isPickSelected(it.id);
        html += '<label class="pgen-pick-opt' + (on ? " on" : "") + '"><input type="checkbox" data-pick="' + esc(it.id) + '"' + (on ? " checked" : "") + '><span>' + esc(it.label) + "</span></label>";
      });
      return html + "</div></div>";
    }
    var extras = opts.extras.map(function (s) { return { id: s.id, label: s.label }; });
    var core = opts.core.map(function (h) { return { id: h, label: h }; });
    var groupsEl = pickOverlay.querySelector("#pgen-pick-groups");
    var body = group("🧩 Extra sections", extras, "extras") + group("📝 Character basics", core, "core");
    if (!body) body = '<div class="pgen-pick-empty">' + (q ? "No sections match “" + q + "”." : "Every built-in section is already in this character — add a custom heading below.") + "</div>";
    groupsEl.innerHTML = body;
    groupsEl.scrollTop = groupsSc;
    // footer
    var count = pickOverlay.querySelector("#pgen-pick-count");
    count.textContent = pickList.length ? pickList.length + " section" + (pickList.length === 1 ? "" : "s") + " selected" : "No sections selected";
    var gen = pickOverlay.querySelector("#pgen-pick-generate");
    if (gen) { gen.disabled = !pickList.length; gen.textContent = pickList.length ? "⚡ Generate " + pickList.length + " section" + (pickList.length === 1 ? "" : "s") : "⚡ Generate selected"; }
  }
  function openSectionPicker() {
    closeSectionPicker();
    var ov = document.createElement("div");
    ov.className = "pgen-import-overlay";
    ov.innerHTML =
      '<div class="pgen-import-box pgen-pick-box">' +
        '<div class="pgen-import-head"><b>🧩 Add sections</b><button type="button" class="pgen-import-x" id="pgen-pick-x" title="Close">✖</button></div>' +
        '<p class="pgen-import-sub">Tick as many parts as you like — the AI writes each one <b>in turn</b> from your current 🎛️ Character options and drops it into the character, without regenerating the rest.</p>' +
        '<div class="pgen-pick-starter">' +
          '<label for="pgen-pick-starter">✍️ Prompt starter (optional) — steer these sections</label>' +
          '<input id="pgen-pick-starter" class="pro-input" placeholder="e.g. keep it secretly tragic; she never admits her feelings">' +
        '</div>' +
        '<input id="pgen-pick-search" class="pro-input pgen-pick-search" placeholder="Search sections…">' +
        '<div id="pgen-pick-chips" class="pgen-pick-chips"></div>' +
        '<div id="pgen-pick-secstarters" class="pgen-pick-secstarters"></div>' +
        '<div id="pgen-pick-groups" class="pgen-pick-groups"></div>' +
        '<div class="pgen-pick-custom">' +
          '<input id="pgen-pick-custom" class="pro-input" placeholder="…or type a custom heading, e.g. Sexual History">' +
          '<button type="button" id="pgen-pick-dice" class="pro-btn" title="Roll a random custom-section idea into the box — edit it, then ➕ Add">🎲</button>' +
          '<button type="button" id="pgen-pick-custom-add" class="pro-btn">➕ Add</button>' +
        "</div>" +
        '<div class="pgen-pick-foot">' +
          '<span class="pgen-pick-count" id="pgen-pick-count"></span>' +
          '<button type="button" id="pgen-pick-clear" class="pro-btn pro-btn-ghost">Clear</button>' +
          '<button type="button" id="pgen-pick-random" class="pro-btn" title="Tick 3 random sections you don\'t have yet — click again for 3 more">🎲 Random</button>' +
          '<button type="button" id="pgen-pick-generate" class="pro-btn pro-btn-primary">⚡ Generate selected</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(ov);
    pickOverlay = ov;

    ov.querySelector("#pgen-pick-x").addEventListener("click", closeSectionPicker);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) closeSectionPicker(); });
    pickEsc = function (e) { if (e.key === "Escape") { e.stopPropagation(); closeSectionPicker(); } };
    document.addEventListener("keydown", pickEsc, true);

    var search = ov.querySelector("#pgen-pick-search");
    search.addEventListener("input", renderPick);
    var pstarter = ov.querySelector("#pgen-pick-starter");
    if (pstarter) {
      pstarter.value = secStarter;
      pstarter.addEventListener("input", function () {
        secStarter = pstarter.value;
        lsSet(LS_SEC_STARTER, secStarter);
        var mainStarter = $("pgen-sec-starter");
        if (mainStarter) mainStarter.value = secStarter;
      });
    }
    var secStartersHost = ov.querySelector("#pgen-pick-secstarters");
    if (secStartersHost) {
      secStartersHost.addEventListener("input", function (e) {
        var inp = e.target;
        if (!inp || !inp.getAttribute) return;
        var h = inp.getAttribute("data-secstarter");
        if (!h) return;
        secStarters[h] = inp.value;
        lsSet(LS_SEC_STARTERS, JSON.stringify(secStarters));
      });
    }
    ov.querySelector("#pgen-pick-chips").addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-pickrm]") : null;
      if (b) pickRemove(b.getAttribute("data-pickrm"));
    });
    var groupsEl = ov.querySelector("#pgen-pick-groups");
    groupsEl.addEventListener("change", function (e) {
      var cb = e.target;
      if (cb && cb.hasAttribute && cb.hasAttribute("data-pick")) pickToggle(cb.getAttribute("data-pick"));
    });
    groupsEl.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-pickall]") : null;
      if (!b) return;
      var key = b.getAttribute("data-pickall");
      var opts = sectionAddOptions();
      var items = key === "extras" ? opts.extras.map(function (s) { return s.id; }) : opts.core.slice();
      var q = (search.value || "").toLowerCase();
      items = items.filter(function (h) {
        var lb = secLabel(h);
        return !q || String(lb).toLowerCase().indexOf(q) >= 0 || String(h).toLowerCase().indexOf(q) >= 0;
      });
      var allOn = items.length && items.every(isPickSelected);
      items.forEach(function (h) { if (allOn) pickRemove(h); else pickAdd(h); });
      renderPick();
    });
    var custom = ov.querySelector("#pgen-pick-custom");
    function addCustom() {
      var v = custom.value.trim();
      if (!v) return;
      var reg = window.t2i_registerPersonaHeading ? window.t2i_registerPersonaHeading(v) : v;
      if (!reg) { toast("⚠️ use letters in the section heading"); return; }
      custom.value = "";
      pickAdd(reg);
    }
    ov.querySelector("#pgen-pick-custom-add").addEventListener("click", addCustom);
    custom.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addCustom(); } });
    ov.querySelector("#pgen-pick-dice").addEventListener("click", function () {
      var skip = {};
      pickList.forEach(function (h) { skip[String(h).toLowerCase()] = true; });
      parseSections(($("pgen-desc") || {}).value || "").forEach(function (s) { skip[String(s.heading).toLowerCase()] = true; });
      var pool = pickDiceIdeas.filter(function (h) { return !skip[String(h).toLowerCase()]; });
      if (!pool.length) { toast("🎲 every dice idea is already ticked or in the character — type your own"); return; }
      custom.value = pool[Math.floor(Math.random() * pool.length)];
      try { custom.focus(); custom.select(); } catch (e) {}
    });
    ov.querySelector("#pgen-pick-clear").addEventListener("click", function () {
      pickList = [];
      secStarter = "";
      secStarters = {};
      try { lsSet(LS_SEC_STARTER, ""); } catch (e) {}
      try { lsSet(LS_SEC_STARTERS, "{}"); } catch (e) {}
      var ps = ov.querySelector("#pgen-pick-starter");
      if (ps) ps.value = "";
      var mainStarter = $("pgen-sec-starter");
      if (mainStarter) mainStarter.value = "";
      renderPick();
      updateAddSecSummary();
    });
    ov.querySelector("#pgen-pick-random").addEventListener("click", function () {
      var opts = sectionAddOptions();
      var pool = opts.extras.map(function (s) { return { id: s.id, label: s.label }; })
        .concat(opts.core.map(function (h) { return { id: h, label: h }; }))
        .filter(function (it) { return !isPickSelected(it.id); });
      if (!pool.length) { toast("🎲 nothing left to suggest — every section is ticked or already in the character"); return; }
      for (var i = pool.length - 1; i > 0; i--) {
        var r = Math.floor(Math.random() * (i + 1));
        var tmp = pool[i]; pool[i] = pool[r]; pool[r] = tmp;
      }
      var n = Math.min(3, pool.length);
      for (var k = 0; k < n; k++) pickAdd(pool[k].id);
      toast("🎲 " + pool.slice(0, n).map(function (it) { return secLabel(it.id); }).join(" · "));
    });
    ov.querySelector("#pgen-pick-generate").addEventListener("click", function () {
      var hs = selectedHeadings();
      if (!hs.length) { toast("⚠️ tick at least one section first"); return; }
      closeSectionPicker();
      addSectionsBulk(hs);
    });
    renderPick();
    setTimeout(function () { try { search.focus(); } catch (e) {} }, 30);
  }
  // Add several sections, one after another, using the existing per-section writer.
  async function addSectionsBulk(headings) {
    var descEl = $("pgen-desc");
    if (!descEl || !descEl.value.trim()) { toast("⚠️ generate or load a character first"); return; }
    if (!window.t2i_generatePersonaSection) { toast("⚠️ persona engine not loaded"); return; }
    if (bulkActive || genObj) { toast("⏹ finish the current generation first"); return; }
    if (!headings || !headings.length) { toast("⚠️ pick one or more sections first"); return; }
    bulkActive = true;
    var go = $("pgen-addsec-go");
    var prog = $("pgen-progress"), fill = $("pgen-bar-fill"), txt = $("pgen-progress-text");
    if (prog) prog.hidden = false;
    if (go) { go.disabled = true; }
    var added = [], failed = [];
    for (var i = 0; i < headings.length; i++) {
      var h = headings[i];
      if (go) go.textContent = "⏳ " + (i + 1) + "/" + headings.length;
      if (txt) txt.textContent = "section " + (i + 1) + "/" + headings.length + " · " + h + "…";
      if (fill) fill.style.width = Math.round((i / headings.length) * 100) + "%";
      var ok = await regenSection(h, null, "added", true, combineStarter(secStarter, secStarters[h]));
      if (ok) { added.push(h); pickRemove(h); } else failed.push(h);
    }
    if (fill) fill.style.width = "100%";
    if (prog) prog.hidden = true;
    if (go) go.disabled = false;
    bulkActive = false;
    renderPick();
    updateAddSecSummary();
    if (added.length && !failed.length) toast("✅ added " + added.length + " section" + (added.length === 1 ? "" : "s"));
    else if (added.length) toast("✅ added " + added.length + " · ⚠️ failed: " + failed.join(", "));
    else toast("⚠️ no sections were added — try again");
  }

  /* -------------------------------------------------------------- generator */
  function stOpts() {
    var o = st.opts;
    return {
      imagePrompt: buildImagePrompt(),
      instruction: o.instruction || "",
      tone: o.tone,
      lively: !!o.lively,
      depth: o.depth,
      exampleCount: o.exampleCount,
      language: o.language,
      rating: o.rating,
      gender: o.gender,
      pronouns: o.pronouns,
      occultType: o.occultType || "none",
      genre: o.genre,
      genreMix: o.genreMix || "",
      mergeStyle: o.mergeStyle || "auto",
      toneMix: o.toneMix || "",
      toneMergeStyle: o.toneMergeStyle || "auto",
      relationship: o.relationship,
      relationshipCustom: o.relationshipCustom,
      name: o.name,
      age: o.age,
      ageAmbiguous: !!o.ageAmbiguous,
      avoid: o.avoid,
      extraSections: o.extras.slice(),
      flaw: o.flaw || "",
      contradiction: o.contradiction || "",
      want: o.want || "",
      need: o.need || "",
      secret: o.secret || "",
      secretFrom: o.secretFrom || "",
     pressure: o.pressure || "",
     wildcard: o.wildcard || ""
   };
 }
  // Copy every live 🎛️ Character options field into st.opts (and persist).
  // Shared by ✨ Generate and the 🧬 Build-from-saved card so both honour
  // exactly the same options.
  function syncOptsFromUI() {
    st.opts.name = ($("pgen-oname") || {}).value || "";
    st.opts.age = ($("pgen-oage") || {}).value || "";
    st.opts.ageAmbiguous = !!($("pgen-oage-amb") || {}).checked;
    st.opts.genre = readGenreUI();
    st.opts.genreMix = readGenreUI("pgen-ogenremix", "pgen-ogenremixcustom", "genreMix");
    st.opts.mergeStyle = ($("pgen-omerge") || {}).value || "auto";
    st.opts.pronouns = ($("pgen-opronouns") || {}).value || "";
    st.opts.occultType = ($("pgen-ooccult") || {}).value || "none";
    st.opts.avoid = ($("pgen-oavoid") || {}).value || "";
    st.opts.instruction = ($("pgen-oinstruction") || {}).value || "";
    st.opts.relationshipCustom = ($("pgen-orelation-custom") || {}).value || "";
    st.opts.flaw = ($("pgen-oflaw") || {}).value || "";
    st.opts.contradiction = ($("pgen-ocontradiction") || {}).value || "";
    st.opts.want = ($("pgen-owant") || {}).value || "";
    st.opts.need = ($("pgen-oneed") || {}).value || "";
    st.opts.secret = ($("pgen-osecret") || {}).value || "";
    st.opts.secretFrom = ($("pgen-osecretfrom") || {}).value || "";
    st.opts.pressure = ($("pgen-opressure") || {}).value || "";
    saveOpts();
  }
  function setBusy(b) {
    var gen = $("pgen-gen"), stop = $("pgen-stop"), prog = $("pgen-progress");
    if (gen) {
      gen.disabled = b;
      gen.textContent = b ? "⏳ generating…" : "";
      if (!b) updateGenLabel();
    }
    if (stop) stop.hidden = !b;
    if (prog) prog.hidden = !b;
  }
  function applyPersona(p) {
    if (!p) return;
    var nameEl = $("pgen-name"), descEl = $("pgen-desc");
    st.persona = { name: p.name || "", description: p.description || "", sections: p.sections || [] };
    st.activeId = null;
    if (nameEl && nameEl.value !== st.persona.name) nameEl.value = st.persona.name;
    if (descEl) {
      var atBottom = descEl.scrollTop > (descEl.scrollHeight - descEl.offsetHeight) - 40;
      descEl.value = st.persona.description;
      if (atBottom) descEl.scrollTop = 99999999;
    }
    updateWordCount();
  }
  function updateWordCount() {
    var el = $("pgen-words");
    if (!el) return;
    var descEl = $("pgen-desc");
    var t = (descEl && descEl.value || "").trim();
    var words = t ? t.split(/\s+/).length : 0;
    el.textContent = words ? (words + " words") : "";
    try { updateChatFit(); } catch (e) {}
  }
  async function doGenerate() {
    // Fused entry point: the single button runs a fresh build or, when the
    // "From saved" starting point is active, the reference build.
    if (isRefMode()) { await runRefGenerate(); return; }
    if (genObj || combineObj) return;
    if (secBusy || bulkActive) { toast("⏳ finish adding sections first"); return; }
    if (!window.t2i_runPersonaGeneration) { toast("⚠️ persona engine not loaded yet"); return; }
    syncOptsFromUI();

    var nameEl = $("pgen-name"), descEl = $("pgen-desc");
    if (nameEl) nameEl.value = "";
    if (descEl) descEl.value = "";
    st.persona = { name: "", description: "", sections: [] };
    st.activeId = null;
    // A generation always starts a brand-new character: drop the previous
    // character's lorebook + chat-fit so nothing lingers into the new one
    // (e.g. a character started from an image-generator starter or a saved
    // image must not inherit another persona's lorebook).
    try { st.lore = sanitizeLorebook({}); loreSave(); } catch (e) {}
    try { applyChatState(null); } catch (e) {}
    try { loreRender(); } catch (e) {}
    try { pgenExpandCard("character"); } catch (e) {}
    refreshSections();
    setBusy(true);
    var opts = stOpts();
    try {
      genObj = window.t2i_runPersonaGeneration(Object.assign({}, opts, {
        onProgress: function (p) {
          var fill = $("pgen-bar-fill"), txt = $("pgen-progress-text");
          if (p && p.done) {
            if (fill) fill.style.width = "100%";
            if (txt) txt.textContent = "finishing…";
            return;
          }
          var pct = Math.round(((p.index - 1) / p.total) * 100);
          if (fill) fill.style.width = pct + "%";
          if (txt) txt.textContent = "part " + p.index + "/" + p.total + " · " + (p.label || "") + (p.retry ? " (retry)" : "") + "…";
        },
        onUpdate: applyPersona
      }));
    } catch (e) {
      console.error(e);
      toast("⚠️ " + (e && e.message ? e.message : "generation failed"));
      genObj = null; setBusy(false); return;
    }
    try { await genObj; } catch (e) { console.warn(e); }
    genObj = null; setBusy(false);
    refreshSections(); updateWordCount(); saveLast();
    try {
      await ensureExtras();
      if (window.t2i_autosavePersonaPrompt) {
        await window.t2i_autosavePersonaPrompt({
          source: "persona",
          imagePrompt: opts.imagePrompt,
          instruction: opts.instruction,
          tone: opts.tone,
          name: (nameEl && nameEl.value) || "",
          description: (descEl && descEl.value) || ""
        });
      }
    } catch (e) {}
    if (!$("pgen-desc").value.trim()) toast("⚠️ the AI returned nothing " + Quip.q("pgenNothing", "— try again or change the options") + "");
    else toast("✅ character ready " + Quip.q("pgenReady", "— handle with care (or don't)"));
  }
  function stopGenerate() {
    if (genObj && genObj.stop) { try { genObj.stop(); } catch (e) {} }
    genObj = null;
    setBusy(false);
  }

  /* -------------------------------------------------------------- handoff */
  /* ------------------------------------------------------- 💬 chat fit */
  // The embedded chats keep each character's first ~3000/2000/1000/500 chars
  // (start survives) when all descriptions combined pass 30% of model context,
  // and they retrieve lorebook-URL facts as needed + inject reminderMessage
  // before every reply. These builders pack ONE source of truth for the meter,
  // the preview, and the 💬 Chat with them handoff. Pure string ops (cheap).
  var CHATFIT_ASSUMED_MAX = 6000;   // model context guess — labeled approx everywhere
  var CHATFIT_COMBINED_SHARE = 0.3; // chats reserve ~30% for all descriptions
  var CHATFIT_RUNGS = [3000, 2000, 1000, 500];
  function chatWords(t) { return (String(t || "").match(/\S+/g) || []).length; }
  function chatNum(n) { return Number(n || 0).toLocaleString("en-US"); }
  function chatTokens(chars) { return Math.round((chars || 0) / 4); }
  function firstSentence(t) {
    var s = String(t || "").replace(/\s+/g, " ").trim();
    if (!s) return "";
    var m = s.match(/^(.+?[.!?…]["\u00bb\u201d'\)\]]?)(?:\s|$)/);
    return (m ? m[1] : s.slice(0, 140)).trim();
  }
  function sentencesOf(t) {
    var clean = String(t || "").replace(/\s+/g, " ").trim();
    if (!clean) return [];
    var parts = clean.match(/[^.!?…]+[.!?…]+["\u00bb\u201d'\)\]]?|.+$/g) || [clean];
    // glue abbrev-style fragments ("Mr.", "e.g.") onto the next sentence
    var fixed = [];
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i].trim();
      if (!s) continue;
      if (s.replace(/\W/g, "").length < 4 && i + 1 < parts.length) { parts[i + 1] = s + " " + parts[i + 1].trim(); continue; }
      if (s.replace(/\W/g, "").length < 4) continue;
      fixed.push(s);
    }
    return fixed;
  }
  function capWordsAtSentence(t, maxW) {
    var out = [], n = 0;
    var ss = sentencesOf(t);
    for (var i = 0; i < ss.length; i++) {
      var w = chatWords(ss[i]);
      if (n + w > maxW) break;
      out.push(ss[i]); n += w;
    }
    if (!out.length) return String(t || "").split(/\s+/).slice(0, maxW).join(" ");
    return out.join(" ");
  }
  // Split prose into 1–2 sentence facts (chat lore format). Title-prefixing for
  // self-containment happens in buildChatLoreFacts, not here.
  function splitFacts(text) {
    var ss = sentencesOf(text);
    var out = [];
    for (var i = 0; i < ss.length; i += 2) {
      var chunk = (ss[i] + " " + (ss[i + 1] || "")).trim();
      if (chunk) out.push(chunk);
    }
    return out;
  }
  // Section headings flagged "lore", sanitized against the live description.
  function chatLoreHeads() {
    var present = {};
    parseSections(($("pgen-desc") || {}).value || "").forEach(function (s) { present[s.heading] = true; });
    return (st.chat.loreHeads || []).filter(function (h) { return present[h]; });
  }
  function autoReminder() {
    var secs = {};
    parseSections(($("pgen-desc") || {}).value || "").forEach(function (s) { if (!secs[s.heading]) secs[s.heading] = s.content; });
    var bits = [];
    if (secs["Tagline"]) bits.push(firstSentence(secs["Tagline"]));
    if (secs["Personality"]) bits.push(firstSentence(secs["Personality"]));
    if (secs["Voice & Mannerisms"]) bits.push(firstSentence(secs["Voice & Mannerisms"]));
    if (secs["Relationship with {{user}}"]) bits.push(firstSentence(secs["Relationship with {{user}}"]));
    var t = bits.filter(Boolean).join(" ");
    if (!t && st.chat.essence.trim()) t = capWordsAtSentence(st.chat.essence.trim(), 100);
    if (!t) t = "Stay in character at all times.";
    if (t.indexOf("{{char}}") < 0) t = "{{char}}: " + t;
    return capWordsAtSentence(t, 100);
  }
  function chatGuide() {
    var g = "Portray {{char}} vividly and consistently — traits, voice, emotions, desires and flaws. " +
      "React truthfully to {{user}}, stay in character, and keep the story moving: be proactive, " +
      "introduce events and topics, and never break role.";
    try {
      if (window.t2i_dynamicBondEnabled && window.t2i_dynamicBondEnabled() && window.t2i_dynamicBondBlock) {
        g += "\n\n" + window.t2i_dynamicBondBlock();
      }
    } catch (e) {}
    return g;
  }
  // Chat-file facts from the lorebook manager: title-prefixed 1–2 sentence
  // chunks (self-contained for relevance retrieval), blank-line joined on publish.
  function buildChatLoreFacts() {
    var facts = [];
    (st.lore.entries || []).forEach(function (e) {
      if (!e || !String(e.content || "").trim()) return;
      var title = String(e.title || "").trim();
      splitFacts(e.content).forEach(function (f) {
        facts.push((title ? title + ": " : "") + f);
      });
    });
    return facts;
  }
  // The single source of truth: what 💬 Chat with them sends + what the meter
  // and preview measure. Body = distilled essence when present, else the
  // description minus lore-flagged sections. Pasted lorebook is kept ONLY while
  // no lore URL is published (backward compatible); once published, retrieval
  // replaces pasting so it stops eating permanent context.
  function chatFitPack() {
    var name = ((($("pgen-name") || {}).value) || "").trim().replace(/\n+/g, " ") || "Character";
    var desc = (($("pgen-desc") || {}).value) || "";
    var sections = orderedSections(desc);
    var loreSet = {};
    chatLoreHeads().forEach(function (h) { loreSet[h] = true; });
    var core = sections.filter(function (s) { return !loreSet[s.heading]; });
    var essence = st.chat.essence.trim();
    var body = essence || core.map(function (s) { return "# {{char}} " + s.heading + ":\n" + s.content; }).join("\n\n\n");
    var loreUrl = st.chat.loreUrl.trim();
    var lorePaste = (!loreUrl && st.lore.entries.length) ? loreFlatten() : "";
    var ri = "# Description of " + name + ":\n" + (body || "(no description yet)") +
      (lorePaste ? "\n\n# Lorebook:\n" + lorePaste : "") +
      "\n\n# Roleplay Guidelines:\n" + chatGuide();
    return {
      name: name, body: body, roleInstruction: ri,
      reminder: st.chat.reminder.trim() || autoReminder(),
      loreBookUrls: loreUrl ? [loreUrl] : [],
      loreHeads: Object.keys(loreSet),
      essenceUsed: !!essence, pastedLore: !!lorePaste
    };
  }
  // Meter vs the chats' approximate budget. share = combined 30% split across
  // the party (conservative: equal shares). rung replicates the chats' slicing
  // ladder on this character's text so the preview shows what actually survives.
  function chatFitMeter(pack, groupOverride) {
    pack = pack || chatFitPack();
    var want = (groupOverride === 1 || groupOverride === 2 || groupOverride === 3) ? groupOverride : st.chat.group;
    var g = want >= 2 ? Math.min(3, want) : 1;
    var share = Math.round(CHATFIT_ASSUMED_MAX * CHATFIT_COMBINED_SHARE / g);
    var chars = pack.roleInstruction.length;
    var toks = chatTokens(chars);
    var zone = toks <= share ? "ok" : (toks <= share * 1.5 ? "warn" : "bad");
    var rung = chars, cut = false;
    if (toks > share) {
      cut = true; rung = 500;
      for (var i = 0; i < CHATFIT_RUNGS.length; i++) {
        if (chatTokens(Math.min(chars, CHATFIT_RUNGS[i])) <= share) { rung = Math.min(chars, CHATFIT_RUNGS[i]); break; }
      }
    }
    return {
      chars: chars, toks: toks, words: chatWords(pack.roleInstruction),
      share: share, shareWords: Math.round(share / 1.33), party: g,
      zone: zone, rung: rung, cut: cut,
      seen: pack.roleInstruction.slice(0, rung) + ((cut && chars > rung) ? "\n[...]" : "")
    };
  }
  // Group-chat cut-line simulator: the same character measured at every party
  // size, so all three cut lines are visible without toggling. Every extra
  // character takes an equal share of the chats' combined ~30% budget, so the
  // per-character share (and its rung) shrinks as the party grows.
  function chatFitPartyRows(pack) {
    if (!pack || !pack.body.trim()) return "";
   var cur = st.chat.group >= 2 ? Math.min(3, st.chat.group) : 1;
    var names = { 1: "Solo · just this one", 2: "Duo · 2 characters", 3: "Group · 3+ characters" };
    return [1, 2, 3].map(function (g) {
      var pm = chatFitMeter(pack, g);
      var what = !pm.cut ? "sees it all" : ("cut to first " + chatNum(pm.rung) + " chars + […]");
      return '<div class="pgen-chatfit-simrow' + (g === cur ? " on" : "") + '">' +
        '<span class="pgen-chatfit-simname">' + names[g] + "</span>" +
        '<span class="cf-' + pm.zone + '">' + (pm.zone === "ok" ? "✅" : (pm.zone === "warn" ? "⚠️" : "🔴")) + " ~" + chatNum(pm.share) + " tokens each · " + what + "</span></div>";
    }).join("");
  }
  async function chatWithThem() {
    var nameEl = $("pgen-name"), descEl = $("pgen-desc");
    var name = (nameEl.value || "").trim().replace(/\n+/g, " ") || "Character";
    var description = (descEl.value || "").trim();
    if (!description) { toast("⚠️ generate a persona first"); return; }
    var avatar = anyAvatarUrl();
    if (!avatar) { toast("⚠️ add a gallery reference image (or a 🎨 portrait) so the character has an avatar"); return; }
    avatar = chatAvatarUrl();
    if (!avatar) { toast("⚠️ add a still image or video poster so the chat has an avatar"); return; }
    if (window.ensureGallery) window.ensureGallery();
    await waitForGlobal("t2i_generateShareLinkForCharacter", 12000);
    if (!window.t2i_generateShareLinkForCharacter) { toast("⚠️ chat link builder not available"); return; }
    var roleInstruction = null, reminderMessage = "", loreBookUrls = [];
    if (st.chat.enabled) {
      try {
        var pack = chatFitPack();
        name = pack.name;
        roleInstruction = pack.roleInstruction;
        reminderMessage = pack.reminder;
        loreBookUrls = pack.loreBookUrls;
      } catch (e) { roleInstruction = null; }
    }
    if (!roleInstruction) {
      roleInstruction = ("# Description of " + name + ":\n" + description + (st.lore.entries.length ? "\n\n# Lorebook:\n" + loreFlatten() : "")).trim();
      try {
        if (window.t2i_dynamicBondEnabled && window.t2i_dynamicBondEnabled() && window.t2i_dynamicBondBlock) {
          roleInstruction += "\n\n# Roleplay Guidelines:\n" + window.t2i_dynamicBondBlock();
        }
      } catch (e) {}
    }
    var json = {
      addCharacter: {
        name: name,
        roleInstruction: roleInstruction,
        reminderMessage: reminderMessage,
        loreBookUrls: loreBookUrls,
        maxParagraphCountPerMessage: 2,
        imagePromptSuffix: "",
        initialMessages: [{ author: "system", content: '<i style="font-size:85%;">Introduce yourself to ' + esc(name) + ', or perhaps <b style="color:#00af00;">tap the Narrator button</b> and tell it to generate an initial roleplay scenario based on some keywords/themes. You can change your name using the \'options\' button.</i>', hiddenFrom: ["ai"] }],
        avatar: { url: avatar, size: 1, shape: "square" }
      },
      quickAdd: true
    };
    try { await window.t2i_generateShareLinkForCharacter(json); }
    catch (e) { console.error(e); toast("⚠️ chat link failed"); }
  }

  // Test/diagnostic hooks (pure builders only — no DOM writes, no uploads).
  window.__pgenChatFit = {
    pack: function () { return chatFitPack(); },
    meter: function (p) { return chatFitMeter(p); },
    meterFor: function (p, g) { return chatFitMeter(p, g); },
    ordered: function (t) { return orderedSections(t); },
    move: function (t, h, d) { return window.t2i_movePersonaSection(t, h, d); },
    splitFacts: splitFacts, autoReminder: autoReminder,
    buildFacts: buildChatLoreFacts, loreHeads: chatLoreHeads,
    words: chatWords, tokens: chatTokens,
    constants: { assumedMax: CHATFIT_ASSUMED_MAX, share: CHATFIT_COMBINED_SHARE, rungs: CHATFIT_RUNGS.slice() }
  };
  var portMenu = null, portMenuEsc = null;
  function closePortraitMenu() {
    if (portMenuEsc) { document.removeEventListener("keydown", portMenuEsc, true); portMenuEsc = null; }
    if (portMenu) { portMenu.remove(); portMenu = null; }
  }
  function openPortraitMenu() {
    closePortraitMenu();
    var btn = $("pgen-portrait");
    if (!btn) return;
    var r = btn.getBoundingClientRect();
    var m = document.createElement("div");
    m.className = "pgen-port-menu";
    m.innerHTML =
      '<button type="button" data-act="gen">✨ Generate an image</button>' +
      '<button type="button" data-act="gallery">🖼️ Choose from gallery</button>' +
      '<button type="button" data-act="upload">⬆️ Upload an image</button>';
    document.body.appendChild(m);
    portMenu = m;
    m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.left)) + "px";
    m.style.top = Math.min(window.innerHeight - m.offsetHeight - 8, r.bottom + 6) + "px";
    m.addEventListener("mousedown", function (e) { e.stopPropagation(); });
    m.querySelectorAll("button[data-act]").forEach(function (b) {
      b.addEventListener("click", function () {
        var act = b.getAttribute("data-act");
        closePortraitMenu();
        if (act === "gen") generatePortrait();
        else if (act === "gallery") portraitFromGallery();
        else if (act === "upload") portraitUpload();
      });
    });
    setTimeout(function () {
      document.addEventListener("mousedown", closePortraitMenu);
    }, 0);
    portMenuEsc = function (e) { if (e.key === "Escape") { e.stopPropagation(); closePortraitMenu(); } };
    document.addEventListener("keydown", portMenuEsc, true);
  }
  async function portraitFromGallery() {
    if (window.ensureGallery) window.ensureGallery();
    var ok = await waitForGlobal("t2iOpenGallery", 9000);
    if (!ok) { toast("⚠️ gallery still loading…"); return; }
    if (window.t2iLoadPeerGallery) { try { await window.t2iLoadPeerGallery(); } catch (e) {} }
    window.t2iOpenGallery({
      pick: {
        title: "🎨 Pick a portrait",
        hint: "Tap one image to use it as this character's avatar.",
        addNoun: "as portrait",
        onPick: function (items) {
          var it = (items || []).filter(function (x) { return x && x.url; })[0];
          if (!it) return;
          st.portrait = it.url;
          st.portraitKind = it.kind || AMKind(it.url);
          st.portraitPoster = it.poster || it.thumbPoster || "";
          renderPortrait();
          toast("🎨 portrait set from gallery");
        }
      }
    });
  }
  async function portraitUpload() {
    var inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*,video/*,.gif";
    inp.addEventListener("change", async function () {
      var file = inp.files && inp.files[0];
      if (!file) return;
      try {
        var isVid = file.type && /^video\//i.test(file.type);
        if (isVid && window.AvatarMedia) {
          var av = await window.AvatarMedia.fileToAvatar(file);
          st.portrait = av.url; st.portraitKind = "video"; st.portraitPoster = av.poster || "";
        } else {
          var dataUrl = await fileToDataUrl(file);
          st.portrait = await downscale(dataUrl, 1024);
          st.portraitKind = AMKind(dataUrl); st.portraitPoster = "";
        }
        renderPortrait();
        toast("🎨 portrait uploaded — used as the avatar");
      } catch (e) {
        console.error(e);
        toast("⚠️ couldn't read that image");
      }
    });
    inp.click();
  }

  async function generatePortrait() {
    var btn = $("pgen-portrait");
    if (!(window.root && window.root.generateImage)) { toast("⚠️ image generator not available"); return; }
    if (window.ensureGallery) window.ensureGallery();
    var ref = primaryRef();
    var visual = "";
    var sections = parseSections($("pgen-desc").value);
    for (var i = 0; i < sections.length; i++) if (sections[i].heading === "Visual Description") visual = sections[i].content;
    var name = ($("pgen-name").value || "").trim();
    var prompt = (ref && ref.prompt) ? ref.prompt : visual;
    if (!prompt) { toast("⚠️ add a gallery reference or generate a persona first"); return; }
    if (visual && ref && ref.prompt) prompt = ref.prompt + ", " + visual.replace(/\n+/g, " ");
    if (name) prompt = prompt + ". Character portrait of " + name;
    var label = btn.textContent;
    btn.disabled = true; btn.textContent = "⏳ painting…";
    var stopFunny = window.FunnyGen ? window.FunnyGen.start(function (line) { btn.textContent = "⏳ " + line; }) : null;
    try {
      var hqPrompt = prompt + ", highly detailed professional character portrait, sharp focus, intricate details, masterpiece, ultra high quality, 4k";
      var res = await window.root.generateImage(hqPrompt, { resolution: "768x768", guidanceScale: 8, negativePrompt: "blurry, low quality, distorted, deformed, low-res, pixelated", hideGalleryButtons: true });
      var dataUrl = (res && res.dataUrl) || "";
      if (!dataUrl) throw new Error("no image");
      st.portrait = dataUrl;
      st.portraitKind = AMKind(dataUrl); st.portraitPoster = "";
      renderPortrait();
      toast("🎨 portrait ready " + Quip.q("pgenPortrait", "— looking fabulous, and it will be used as the avatar"));
      try {
        if (window.t2iAddImageToGallery) await window.t2iAddImageToGallery(dataUrl, prompt, name || "persona portrait");
      } catch (e) {}
    } catch (e) {
      console.error(e);
      toast("⚠️ portrait generation failed");
    }
    if (stopFunny) { try { stopFunny(); } catch (_e) {} }
    btn.disabled = false; btn.textContent = label;
  }
  function renderPortrait() {
    var host = $("pgen-portrait-preview");
    if (!host) return;
    if (!st.portrait) { host.hidden = true; host.innerHTML = ""; try { scheduleSaveButton(); } catch (e) {} return; }
    host.hidden = false;
    var kind = st.portraitKind || AMKind(st.portrait);
    var media = kind === "video"
      ? '<video src="' + esc(st.portrait) + '"' + (st.portraitPoster ? ' poster="' + esc(st.portraitPoster) + '"' : "") + ' muted loop playsinline autoplay style="max-width:100%;border-radius:8px;background:#000;"></video>'
      : '<a href="' + esc(st.portrait) + '" target="_blank" rel="noopener"><img src="' + esc(st.portrait) + '" alt="portrait" title="click for full 768px size"></a>';
    host.innerHTML = media + '<span>🎨 portrait avatar' + (kind === "video" ? " 🎬" : "") + '</span><button type="button" class="pgen-port-x" title="remove portrait">✖</button>';
    host.querySelector(".pgen-port-x").addEventListener("click", function () { st.portrait = null; st.portraitKind = ""; st.portraitPoster = ""; renderPortrait(); });
    try { scheduleSaveButton(); } catch (e) {}
  }

  async function saveToVault() {
    var desc = ($("pgen-desc").value || "").trim();
    if (!desc) { toast("⚠️ nothing to save yet"); return; }
    await waitForGlobal("Vault", 8000);
    if (!window.Vault) { toast("⚠️ vault not available"); return; }
    var name = ($("pgen-name").value || "").trim() || "Persona";
    try {
      var m0 = await durableAvatar(avatarMedia());
      await window.Vault.add(desc, { tags: ["persona"], thumb: m0.url, thumbKind: m0.kind, thumbPoster: m0.poster, tab: "persona", label: name });
      toast("📚 saved to vault " + Quip.q("pgenVault", "— future you says thanks"));
    } catch (e) { toast("⚠️ vault save failed"); }
  }
  async function addToRoster() {
    var desc = ($("pgen-desc").value || "").trim();
    if (!desc) { toast("⚠️ nothing to save yet"); return; }
    await waitForGlobal("Characters", 8000);
    if (!window.Characters) { toast("⚠️ roster not available"); return; }
    var name = ($("pgen-name").value || "").trim() || "Character";
    var ref = primaryRef();
    var prompt = (ref && ref.prompt) ? ref.prompt : desc.slice(0, 400);
    try {
      var m1 = await durableAvatar(avatarMedia());
      await window.Characters.add({ name: name, prompt: prompt, thumb: m1.url, thumbKind: m1.kind, thumbPoster: m1.poster, shape: "512x768" });
    } catch (e) { toast("⚠️ roster save failed"); }
  }
  // Shared character-file builders — the editor buttons AND the 🗃️ saved-vault
  // rows export through these, so a downloaded file always matches what 📥 Import
  // reads back (cardToDescription for .json, plain sections for .md).
  function safeFilename(name) { return String(name || "character").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 40) || "character"; }
  function downloadFile(filename, content, mime) {
    var blob = new Blob([content], { type: mime });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function personaToMarkdown(name, desc) {
    return "# " + String(name == null || name === "" ? "Character" : name) + "\n\n" + String(desc || "").replace(/^# \{\{char\}\} /gm, "## ") + "\n";
  }
  function exportMd() {
    var name = ($("pgen-name").value || "").trim() || "Character";
    var desc = ($("pgen-desc").value || "").trim();
    if (!desc) { toast("⚠️ nothing to export yet"); return; }
    downloadFile(safeFilename(name) + ".md", personaToMarkdown(name, desc), "text/markdown;charset=utf-8");
  }
  function personaSecMapOf(text) {
    var m = {};
    parseSections(text || "").forEach(function (s) {
      var k = String(s.heading || "").trim().toLowerCase();
      (m[k] || (m[k] = [])).push(s.content);
    });
    return m;
  }
  function personaSecMap() {
    return personaSecMapOf(($("pgen-desc") || {}).value || "");
  }
  function personaSecGet(m) {
    for (var i = 1; i < arguments.length; i++) {
      var k = String(arguments[i]).toLowerCase();
      if (m[k] && m[k].length) {
        var t = m[k].join("\n\n").trim();
        if (t) return t;
      }
    }
    return "";
  }
  function downscaleAvatar(dataUrl, max) {
    return new Promise(function (resolve) {
      try {
        var img = new Image();
        img.onload = function () {
          try {
            var sc = Math.min(1, max / Math.max(img.width, img.height));
            var c = document.createElement("canvas");
            c.width = Math.max(1, Math.round(img.width * sc));
            c.height = Math.max(1, Math.round(img.height * sc));
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL("image/jpeg", 0.8));
          } catch (e) { resolve(dataUrl); }
        };
        img.onerror = function () { resolve(dataUrl); };
        img.src = dataUrl;
      } catch (e) { resolve(dataUrl); }
    });
  }
  /* ---------------------------------------------------- lorebook maker */
  function loreFlattenOf(lb) {
    lb = lb || { name: "", description: "", entries: [] };
    var lines = [];
    if (lb.name) lines.push("# " + lb.name);
    if (lb.description) lines.push(String(lb.description).trim());
    (lb.entries || []).forEach(function (e) {
      if (!e || !String(e.content || "").trim()) return;
      lines.push("\n## " + (e.title || "Entry"));
      if (e.keys && e.keys.length) lines.push("Keys: " + e.keys.join(", "));
      lines.push(String(e.content).trim());
    });
    return lines.join("\n").trim();
  }
  function loreFlatten() {
    return loreFlattenOf(st.lore);
  }
  function loreBookOf(lb, fallbackName) {
    lb = lb || { name: "", description: "", entries: [] };
    if (!(lb.entries || []).length) return null;
    return {
      name: lb.name || fallbackName || "Lorebook",
      description: lb.description || "",
      entries: lb.entries.map(function (e) {
        return { name: e.title || "Entry", keys: e.keys || [], content: e.content || "" };
      })
    };
  }
  function loreBook() {
    return loreBookOf(st.lore, (($("pgen-name") || {}).value || "Lorebook"));
  }
  function loreRender() {
    var host = $("pgen-lore-list");
    if (host) {
      host.innerHTML = "";
      if (!st.lore.entries.length) host.innerHTML = '<div class="pgen-empty">No entries yet — generate from the character, import a file, or add one by hand.</div>';
      st.lore.entries.forEach(function (e) {
        var card = document.createElement("div");
        card.className = "pgen-lore-entry";
        card.innerHTML =
          '<input class="pro-input pgen-lore-title" placeholder="Entry title" value="' + esc(e.title || "") + '">' +
          '<input class="pro-input pgen-lore-keys" placeholder="keys, comma separated" value="' + esc((e.keys || []).join(", ")) + '">' +
          '<textarea class="pro-textarea pgen-lore-content" placeholder="Entry text — facts the AI should know when these keys come up">' + esc(e.content || "") + "</textarea>" +
          '<div class="pgen-lore-row"><span class="pgen-lore-count">' + (e.content || "").split(/\s+/).filter(Boolean).length + ' words</span><button type="button" class="pgen-lore-x" title="Delete entry">✖</button></div>';
        card.querySelector(".pgen-lore-title").addEventListener("input", function () { e.title = this.value; loreSave(); });
        card.querySelector(".pgen-lore-keys").addEventListener("input", function () { e.keys = this.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean); loreSave(); });
        card.querySelector(".pgen-lore-content").addEventListener("input", function () { e.content = this.value; loreSave(); });
        card.querySelector(".pgen-lore-x").addEventListener("click", function () {
          var deleted = e;
          st.lore.entries = st.lore.entries.filter(function (x) { return x.id !== e.id; });
          loreSave(); loreRender();
          var wiped = false;
          try { wiped = lorePatchDescriptionAfterManagerDelete(deleted); } catch (err) {}
          toast(wiped ? "🗑 entry deleted from lorebook + persona" : "🗑 lore entry deleted (persona unchanged — no linked Lorebook section)");
        });
        host.appendChild(card);
      });
    }
    var badge = $("pgen-lore-count");
    if (badge) badge.textContent = String(st.lore.entries.length);
    try { updateChatFit(); } catch (e) {}
    var nm = $("pgen-lore-name"), ds = $("pgen-lore-desc");
    if (nm && document.activeElement !== nm) nm.value = st.lore.name || "";
    if (ds && document.activeElement !== ds) ds.value = st.lore.description || "";
  }
  // After a lorebook-manager delete, wipe the same entry out of the linked
  // Lorebook section in the description (if any), so it doesn't linger there.
  // Matches by title (falling back to exact content); returns true when the
  // description was changed.
  function lorePatchDescriptionAfterManagerDelete(deleted) {
    var descEl = $("pgen-desc");
    if (!descEl || !descEl.value) return false;
    var sections = parseSections(descEl.value);
    var loreHead = null;
    for (var i = 0; i < sections.length; i++) {
      if (isLoreLikeSection(sections[i].heading)) { loreHead = sections[i].heading; break; }
    }
    if (!loreHead) return false;
    var flat = loreFlatten();
    var next = null;
    if (!st.lore.entries.length || !flat) {
      // Manager is entry-less — drop the whole section, not an empty header.
      next = removeSectionFromText(descEl.value, loreHead);
      if (next == null) return false;
    } else if (window.t2i_replacePersonaSection) {
      next = window.t2i_replacePersonaSection(descEl.value, loreHead, flat);
      if (next == null) return false;
    } else {
      var secs = parseSections(descEl.value);
      var touched = false;
      for (var j = 0; j < secs.length; j++) if (secs[j].heading === loreHead) { secs[j].content = flat; touched = true; }
      if (!touched) return false;
      next = descriptionText(secs);
    }
    if (next == null || next === descEl.value) return false;
    descEl.value = next;
    st.persona.description = descEl.value;
    st.persona.sections = parseSections(descEl.value);
    refreshSections(); saveLast(); updateWordCount(); updateSaveButton();
    return true;
  }
  // Surgical section edits: replace/append ONE section's block in the raw
  // description text, leaving every other byte untouched. A parse→serialize
  // round-trip would reorder sections into CANON order and drop unregistered
  // custom headings and stray blocks (like a trailing "# END") — silently
  // invalidating the chat-fit Core/Lore flags. Sync/link must never do that.
  function replaceSectionBody(full, heading, content) {
    if (window.t2i_replacePersonaSection) {
      try {
        var r = window.t2i_replacePersonaSection(full, heading, content);
        if (r != null) return r;
      } catch (e) {}
    }
    var sections = parseSections(full);
    var touched = false;
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].heading === heading) { sections[i].content = content; touched = true; }
    }
    if (!touched) return null;
    return descriptionText(sections);
  }
  function appendSectionBlock(full, heading, content) {
    if (window.t2i_addPersonaSection) {
      try { return window.t2i_addPersonaSection(full, heading, content); } catch (e) {}
    }
    var text = String(full == null ? "" : full).replace(/\s+$/, "");
    return text + (text ? "\n\n\n" : "") + "# {{char}} " + heading + ":\n" + String(content == null ? "" : content);
  }
  function loreSyncToPersona() {
    var descEl = $("pgen-desc");
    if (!descEl || !descEl.value.trim()) { toast("⚠️ generate or load a character first"); return; }
    var flat = loreFlatten();
    if (!flat) { toast("⚠️ lorebook is empty"); return; }
    var loreHead = null;
    var sections = parseSections(descEl.value);
    for (var i = 0; i < sections.length; i++) {
      if (isLoreLikeSection(sections[i].heading)) { loreHead = sections[i].heading; break; }
    }
    var next = loreHead ? replaceSectionBody(descEl.value, loreHead, flat) : appendSectionBlock(descEl.value, "Lorebook", flat);
    if (next == null) { toast("⚠️ couldn't link the lorebook"); return; }
    descEl.value = next;
    st.persona.description = descEl.value;
    st.persona.sections = parseSections(descEl.value);
    refreshSections(); updateWordCount(); saveLast();
    toast("🔗 lorebook linked into the persona");
  }
  var loreSyncOverlay = null, loreSyncEsc = null;
  function loreNorm(s) { return String(s || "").replace(/\s+/g, " ").trim().toLowerCase(); }
  // Core (prefix-stripped) forms for comparing lore text across its three
  // shapes: manager entries ("Base · 1" / "Base: fact"), published facts
  // ("Base · 1: Base: fact") and embedded ## blocks ("## Base" / "fact").
  function loreCoreTitle(t) { return String(t || "").replace(/\s*·\s*\d+\s*$/, "").trim(); }
  function loreCoreContent(title, content) {
    var c = String(content || "").trim();
    var tries = [String(title || "").trim(), loreCoreTitle(title)];
    for (var i = 0; i < tries.length; i++) {
      var t = tries[i];
      if (t && c.toLowerCase().indexOf(t.toLowerCase() + ":") === 0) c = c.slice(t.length + 1).trim();
    }
    return c;
  }
  function loreSentences(text) {
    var t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return [];
    var parts = t.match(/[^.!?…]+[.!?…]+["'")\u201d\u2019]*|\S[\s\S]*$/g) || [];
    return parts.map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function loreEmbedMatch(emb, src) {
    var ec = loreNorm(loreCoreContent(emb.title, emb.content));
    var nc = loreNorm(loreCoreContent(src.title, src.content));
    if (ec && ec === nc) return true;
    var et = loreNorm(loreCoreTitle(emb.title)), nt = loreNorm(loreCoreTitle(src.title));
    return !!(et && et === nt && ((ec || "").indexOf(nc) >= 0 || (nc || "").indexOf(ec) >= 0));
  }
  // Section headings sync must never target: the Lorebook/World Info block
  // (lore entries live there, not as sections) and Roleplay Behavior Examples
  // (example texts belong to the examples tools, not lore sections).
  function loreSyncUntargetable(heading) {
    if (isLoreLikeSection(heading)) return true;
    return String(heading || "").trim().toLowerCase() === "roleplay behavior examples";
  }
  // Diff the lorebook manager (+ published URL sections) against the
  // character's own top-level sections: each lore topic is covered when a
  // same-titled section already holds every lore sentence, and only the rest
  // is missing. urlGroups are extra sections read from the published lorebook
  // URL (same shape, src "url"). Returns { loreHead, embedded, sections,
  // missing, covered }.
  function loreSyncDiff(urlGroups) {
    var descEl = $("pgen-desc");
    var sections = parseSections(descEl ? descEl.value : "");
    var loreHead = null, embedded = [];
    for (var i = 0; i < sections.length; i++) {
      if (isLoreLikeSection(sections[i].heading)) { loreHead = sections[i].heading; break; }
    }
    if (loreHead) {
      for (var j = 0; j < sections.length; j++) {
        if (sections[j].heading === loreHead) {
          try {
            embedded = loreParseTxt(sections[j].content || "").entries.map(function (en) {
              return { title: en.title || "Entry", content: en.content || "", matched: false };
            });
          } catch (e) { embedded = []; }
          break;
        }
      }
    }
    var secIndex = {}; // norm base title -> sections with that heading
    sections.forEach(function (s) {
      if (loreSyncUntargetable(s.heading)) return;
      var k = loreNorm(loreCoreTitle(s.heading));
      if (!k) return;
      if (!secIndex[k]) secIndex[k] = [];
      secIndex[k].push(s);
    });
    // flag embedded ## entries whose lore already lives in full inside a
    // same-titled persona section — removing them loses nothing
    embedded.forEach(function (en) {
      var ek = loreNorm(loreCoreTitle(en.title));
      var need = loreSentences(loreCoreContent(en.title, en.content)).map(loreNorm).filter(Boolean);
      if (!need.length) return;
      var cands = secIndex[ek] || [];
      for (var c = 0; c < cands.length; c++) {
        var blob = "\n" + loreNorm(cands[c].content) + "\n";
        var ok = true;
        for (var n = 0; n < need.length; n++) {
          if (blob.indexOf(need[n]) < 0) { ok = false; break; }
        }
        if (ok) { en.redundantWith = cands[c].heading; break; }
      }
    });
    var sources = (st.lore.entries || []).filter(function (e) { return e && String(e.content || "").trim(); }).map(function (e) {
      return { title: e.title || "Entry", keys: e.keys || [], content: e.content, src: "manager" };
    });
    // fold in published-URL sections, dropping anything whose text is already
    // covered elsewhere so neither side double-adds: URL groups fully covered
    // by the manager arrive via the manager, and manager entries fully covered
    // by a kept URL group arrive via that group.
    var urlList = (urlGroups || []).filter(function (g) { return g && String(g.content || "").trim(); });
    var mgrBlob = "\n" + sources.map(function (s) { return loreNorm(loreCoreContent(s.title, s.content)); }).join("\n") + "\n";
    var keptUrl = urlList.filter(function (g) {
      var sents = loreSentences(loreCoreContent(g.title, g.content)).map(loreNorm).filter(Boolean);
      if (!sents.length) return true;
      return !sents.every(function (sn) { return mgrBlob.indexOf(sn) >= 0; });
    });
    var urlBlob = "\n" + keptUrl.map(function (g) { return loreNorm(loreCoreContent(g.title, g.content)); }).join("\n") + "\n";
    sources = sources.filter(function (s) {
      var core = loreNorm(loreCoreContent(s.title, s.content));
      return !(core && urlBlob.indexOf(core) >= 0);
    });
    keptUrl.forEach(function (g) {
      sources.push({ title: g.title || "Entry", keys: [], content: g.content, src: "url" });
    });
    // match sources against the character's own sections (same base title +
    // every lore sentence present) and, failing that, embedded ## blocks
    var missing = [], covered = [];
    sources.forEach(function (s) {
      var baseKey = loreNorm(loreCoreTitle(s.title));
      if (baseKey === "roleplay behavior examples") {
        covered.push({ title: s.title, coveredBy: "Roleplay Behavior Examples" });
        return;
      }
      var need = loreSentences(loreCoreContent(s.title, s.content)).map(loreNorm).filter(Boolean);
      var cands = secIndex[baseKey] || [];
      var coveredBy = null;
      for (var c = 0; c < cands.length; c++) {
        var blob = "\n" + loreNorm(cands[c].content) + "\n";
        var ok = true;
        for (var n = 0; n < need.length; n++) {
          if (blob.indexOf(need[n]) < 0) { ok = false; break; }
        }
        if (ok) { coveredBy = cands[c].heading; break; }
      }
      if (coveredBy) {
        for (var k = 0; k < embedded.length; k++) {
          if (!embedded[k].matched && loreEmbedMatch(embedded[k], s)) { embedded[k].matched = true; break; }
        }
        covered.push({ title: s.title, coveredBy: coveredBy });
        return;
      }
      var hit = -1;
      for (var m = 0; m < embedded.length; m++) {
        if (embedded[m].matched) continue;
        if (loreEmbedMatch(embedded[m], s)) { hit = m; break; }
      }
      if (hit >= 0) embedded[hit].matched = true;
      else missing.push(s);
    });
    return { loreHead: loreHead, embedded: embedded, sections: sections, missing: missing, covered: covered };
  }
  // Group missing lore sources into per-heading section operations: "new"
  // (no such section — one will be created) or "append" (the section exists
  // but lacks some lore sentences — only those are added). Duplicate "Base ·
  // N" chunks merge into their base heading; duplicate sentences drop out, so
  // re-adding a published lorebook yields one section per lore topic with all
  // its lore intact instead of scattered fragments.
  function loreSyncPlan(d) {
    var secByKey = {};
    (d.sections || []).forEach(function (s) {
      if (loreSyncUntargetable(s.heading)) return;
      var k = loreNorm(loreCoreTitle(s.heading));
      if (k && !secByKey[k]) secByKey[k] = s;
    });
    var groups = [], idx = {};
    (d.missing || []).forEach(function (e) {
      if (!e || !String(e.content || "").trim()) return;
      var base = loreCoreTitle(e.title) || String(e.title || "").trim() || "Entry";
      var key = loreNorm(base) || "entry";
      var g = idx[key];
      if (!g) {
        var sec = secByKey[key] || null;
        g = { key: key, heading: sec ? sec.heading : base, mode: sec ? "append" : "new",
          fromUrl: false, keys: [], sents: [], seen: {}, secContent: sec ? (sec.content || "") : "" };
        idx[key] = g;
        groups.push(g);
      }
      if (e.src === "url") g.fromUrl = true;
      (e.keys || []).forEach(function (k) {
        k = String(k || "").trim();
        if (k && g.keys.indexOf(k) < 0) g.keys.push(k);
      });
      loreSentences(loreCoreContent(e.title, e.content)).forEach(function (sn) {
        var n = loreNorm(sn);
        if (!n || g.seen[n]) return;
        g.seen[n] = true;
        g.sents.push(sn.trim());
      });
    });
    groups.forEach(function (g) {
      if (g.mode === "append") {
        var blob = "\n" + loreNorm(g.secContent) + "\n";
        g.fresh = g.sents.filter(function (sn) { return blob.indexOf(loreNorm(sn)) < 0; });
      } else {
        g.fresh = g.sents.slice();
      }
      g.content = g.fresh.join(" ");
    });
    return { groups: groups.filter(function (g) { return g.fresh.length; }) };
  }
  // Parse a published lorebook file back into sections. The publisher writes
  // title-prefixed facts ("Title: fact.") joined by blank lines — and the
  // section converter numbers multi-fact sections ("Section · 1: Section:
  // fact."), so strip the " · N" counter, drop the repeated title prefix and
  // regroup consecutive facts back into one section per lore topic.
  function loreParsePublishedFacts(text) {
    var out = [];
    String(text || "").split(/\n\s*\n/).forEach(function (block) {
      block = block.trim();
      if (!block) return;
      var title = "", fact = block;
      var m = block.match(/^([^:\n]{1,120}?):\s+([\s\S]+)$/);
      if (m) { title = m[1].trim(); fact = m[2].trim(); }
      title = loreCoreTitle(title);
      if (title && fact.toLowerCase().indexOf(title.toLowerCase() + ":") === 0) {
        fact = fact.slice(title.length + 1).trim();
      }
      if (!fact) return;
      var last = out[out.length - 1];
      if (last && last.title === title) last.facts.push(fact);
      else out.push({ title: title, facts: [fact] });
    });
    return out.map(function (g) { return { title: g.title || "Entry", keys: [], content: g.facts.join(" "), src: "url" }; });
  }
  async function loreFetchUrlText(url) {
    try {
      if (window.root && window.root.superFetch) {
        var r = await window.root.superFetch(url);
        if (r) {
          if (typeof r.text === "function") return await r.text();
          if (typeof r === "string") return r;
        }
      }
    } catch (e) {}
    var r2 = await fetch(url);
    if (!r2 || !r2.ok) throw new Error("fetch failed");
    return await r2.text();
  }
  // Read a published lorebook file back in as sections. {ok:true, groups} or
  // {ok:false}. Defaults to the lorebook URL attached to the character, but the
  // sync modal can point at any pasted URL instead.
  async function loreFetchPublishedEntries(url) {
    url = String(url == null ? (st.chat.loreUrl || "") : url).trim();
    if (!url) return { ok: false };
    try {
      var text = await loreFetchUrlText(url + (url.indexOf("?") >= 0 ? "&" : "?") + "_t=" + Date.now());
      return { ok: true, groups: loreParsePublishedFacts(text) };
    } catch (e) { return { ok: false }; }
  }
  function closeLoreSync() {
    if (loreSyncEsc) { document.removeEventListener("keydown", loreSyncEsc, true); loreSyncEsc = null; }
    if (loreSyncOverlay && loreSyncOverlay.parentNode) loreSyncOverlay.parentNode.removeChild(loreSyncOverlay);
    loreSyncOverlay = null;
  }
  var loreSyncUrl = { state: "none", groups: [], url: "" }; // published-file fetch for the open modal
  var loreSyncCurrent = null;
  function loreSyncRowHtml(status, title, sub) {
    return '<div class="pgen-loresync-row"><span class="pgen-loresync-st">' + status + "</span>" +
      '<span class="pgen-loresync-ti">' + esc(title) + "<small>" + esc(sub || "") + "</small></span></div>";
  }
  function loreSyncBodyHtml(d) {
    var body = "";
    var groups = d.planGroups || [];
    if (!d.loreHead) {
      body += '<p class="pgen-import-sub">No Lorebook section embedded in the character — syncing adds each lore topic as its own persona section.</p>';
    } else {
      body += '<p class="pgen-import-sub">Embedded in <b>#' + esc(d.loreHead) + "</b> — " + d.embedded.length + " section" + (d.embedded.length === 1 ? "" : "s") + ".</p>";
      if (d.embedded.length) {
        body += '<div class="pgen-loresync-sec">📖 Embedded in the character</div>';
        d.embedded.forEach(function (en) {
          if (en.redundantWith) body += loreSyncRowHtml("♻️", "## " + en.title, "same lore as # " + en.redundantWith + " — redundant, safe to remove");
          else body += loreSyncRowHtml(en.matched ? "✅" : "⚠️", "## " + en.title, en.matched ? "in the lorebook too" : "only in the persona — not a lorebook section");
        });
      }
    }
    if (loreSyncUrl.state === "loading") body += '<p class="pgen-import-sub">🌐 reading the published lorebook URL…</p>';
    else if (loreSyncUrl.state === "error") body += '<p class="pgen-import-sub">⚠️ couldn\'t fetch that lorebook URL — showing the local manager only.</p>';
    else if (loreSyncUrl.state === "ready") {
      body += '<p class="pgen-import-sub">🌐 published lorebook URL: ' + loreSyncUrl.groups.length + " section" + (loreSyncUrl.groups.length === 1 ? "" : "s") + "." +
        ((loreSyncUrl.url && loreSyncUrl.url !== String((st.chat.loreUrl || "").trim())) ? " (pasted URL — 📌 attaches it to this character)" : "") + "</p>";
    } else if (!groups.length && !d.covered.length) {
      body += '<p class="pgen-import-sub">Paste a published lorebook URL above to also sync from it.</p>';
    }
    if (d.covered.length) {
      body += '<p class="pgen-import-sub">✅ ' + d.covered.length + " lore topic" + (d.covered.length === 1 ? "" : "s") + " already live as persona sections — nothing to add for those.</p>";
    }
    if (groups.length) {
      body += '<div class="pgen-loresync-sec">➕ Missing from the persona — will be added as sections</div>';
      groups.forEach(function (g) {
        var isNew = g.mode === "new";
        var sub = (isNew ? "new section" : "append to # " + g.heading) +
          (g.fromUrl ? " · from the published lorebook URL" : "") + " · " +
          (g.content.slice(0, 90) + (g.content.length > 90 ? "…" : ""));
        body += loreSyncRowHtml(isNew ? "✚" : "📝", "# " + g.heading, sub);
      });
    } else if (loreSyncUrl.state !== "loading") {
      body += '<p class="pgen-import-sub">✅ Everything in the lorebook is already in the persona — nothing to add.</p>';
    }
    return body;
  }
  function loreSyncPaint() {
    if (!loreSyncOverlay) return;
    var d = loreSyncDiff(loreSyncUrl.groups);
    d.planGroups = loreSyncPlan(d).groups;
    loreSyncCurrent = d;
    var att = loreSyncOverlay.querySelector("#pgen-loresync-attach");
    if (att) {
      var v = loreSyncInputUrl();
      att.hidden = !v || v === String((st.chat.loreUrl || "").trim());
    }
    var host = loreSyncOverlay.querySelector("#pgen-loresync-body");
    if (host) host.innerHTML = loreSyncBodyHtml(d);
    var foot = loreSyncOverlay.querySelector(".pgen-loresync-foot");
    if (foot) {
      var nNew = 0, nAppend = 0, nRedundant = 0;
      (d.planGroups || []).forEach(function (g) { if (g.mode === "new") nNew++; else nAppend++; });
      (d.embedded || []).forEach(function (en) { if (en.redundantWith) nRedundant++; });
      var bits = [];
      if (nNew) bits.push(nNew + " new");
      if (nAppend) bits.push(nAppend + " updates");
      if (d.covered.length) bits.push(d.covered.length + " already sections");
      if (d.embedded.length) bits.push(d.embedded.length + " embedded");
      foot.innerHTML = '<span class="pgen-loresync-count">' + (bits.join(" · ") || "nothing to add") + "</span>" +
        (nRedundant ? '<button type="button" id="pgen-loresync-clean" class="pro-btn" title="Remove embedded entries that duplicate persona sections">♻️ ' + nRedundant + " redundant</button>" : "") +
        '<button type="button" id="pgen-loresync-go" class="pro-btn pro-btn-primary"' + ((d.planGroups && d.planGroups.length) ? "" : " disabled") + ">🔄 Sync " + ((d.planGroups && d.planGroups.length) ? d.planGroups.length + " section" + (d.planGroups.length === 1 ? "" : "s") + " into persona" : "— up to date") + "</button>";
      if (nRedundant) foot.querySelector("#pgen-loresync-clean").addEventListener("click", function () { doLoreSyncClean(this); });
      if (d.planGroups && d.planGroups.length) foot.querySelector("#pgen-loresync-go").addEventListener("click", function () { doLoreSync(this); });
    }
  }
  // The published URL the open sync modal should read: whatever is in its URL
  // box (prefilled with the character's attached lore URL, but pasting another
  // published lorebook URL works too).
  function loreSyncInputUrl() {
    var inp = loreSyncOverlay ? loreSyncOverlay.querySelector("#pgen-loresync-url") : null;
    return inp ? String(inp.value || "").trim() : "";
  }
  function loreFetchUrlInto(url) {
    loreSyncUrl = { state: "loading", groups: [], url: String(url || "") };
    loreSyncPaint();
    loreFetchPublishedEntries(url).then(function (res) {
      if (!loreSyncOverlay) return;
      loreSyncUrl = res.ok ? { state: "ready", groups: res.groups, url: String(url || "") } : { state: "error", groups: [], url: String(url || "") };
      loreSyncPaint();
    });
  }
  function openLoreSync() {
    var descEl = $("pgen-desc");
    if (!descEl || !descEl.value.trim()) { toast("⚠️ generate or load a character first"); return; }
    if (!st.lore.entries.length && !st.chat.loreUrl) {
      var secs = parseSections(descEl.value);
      var hasLore = secs.some(function (s) { return isLoreLikeSection(s.heading); });
      if (!hasLore) { toast("⚠️ lorebook is empty and nothing is embedded"); return; }
    }
    closeLoreSync();
    var startUrl = String((st.chat.loreUrl || "").trim());
    loreSyncUrl = { state: (startUrl ? "loading" : "none"), groups: [], url: startUrl };
    loreSyncCurrent = null;
    var ov = document.createElement("div");
    ov.className = "pgen-import-overlay";
    ov.innerHTML =
      '<div class="pgen-import-box pgen-pick-box">' +
        '<div class="pgen-import-head"><b>🔄 Sync with lorebook</b><button type="button" class="pgen-import-x" id="pgen-loresync-x" title="Close">✖</button></div>' +
        '<div class="pgen-loresync-urlrow">🌐 <input id="pgen-loresync-url" class="pro-input" type="url" placeholder="published lorebook URL — paste to sync from it" value="' + esc(startUrl) + '">' +
        '<button type="button" id="pgen-loresync-read" class="pro-btn" title="Read this URL">↻</button>' +
        '<button type="button" id="pgen-loresync-attach" class="pro-btn" title="Attach this URL to the character (chat handoffs use it)" hidden>📌</button></div>' +
        '<div id="pgen-loresync-body"></div>' +
        '<div class="pgen-loresync-foot"></div>' +
      "</div>";
    document.body.appendChild(ov);
    loreSyncOverlay = ov;
    ov.querySelector("#pgen-loresync-x").addEventListener("click", closeLoreSync);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) closeLoreSync(); });
    loreSyncEsc = function (e) { if (e.key === "Escape") { e.stopPropagation(); closeLoreSync(); } };
    document.addEventListener("keydown", loreSyncEsc, true);
    ov.querySelector("#pgen-loresync-read").addEventListener("click", function () {
      var u = loreSyncInputUrl();
      if (!u) { loreSyncUrl = { state: "none", groups: [], url: "" }; loreSyncPaint(); return; }
      loreFetchUrlInto(u);
    });
    ov.querySelector("#pgen-loresync-attach").addEventListener("click", function () {
      var u = loreSyncInputUrl();
      if (!u) return;
      st.chat.loreUrl = u;
      chatSave(); updateSaveButton();
      try { renderChatFit(); } catch (e) {}
      loreSyncPaint();
      toast("📌 lorebook URL attached to this character");
    });
    loreSyncPaint();
    if (startUrl) loreFetchUrlInto(startUrl);
  }
  // Remove embedded ## entries that duplicate same-titled persona sections
  // (their lore lives on in full inside the section). When nothing is left,
  // the Lorebook section goes away entirely.
  async function doLoreSyncClean(btn) {
    var label = btn ? btn.textContent : "";
    try {
      var d = loreSyncCurrent || loreSyncDiff(loreSyncUrl.groups);
      var drop = {};
      (d.embedded || []).forEach(function (en) {
        if (en.redundantWith) drop[loreNorm(en.title) + "\n" + loreNorm(en.content)] = true;
      });
      var n = Object.keys(drop).length;
      if (!n) { toast("✅ nothing redundant"); return; }
      if (!(await window.uiConfirm("Remove " + n + " embedded lorebook " + (n === 1 ? "entry" : "entries") + " that duplicate persona sections?\n\nThe sections keep the full lore — nothing is lost.", { okText: 'Remove', danger: true }))) return;
      var descEl = $("pgen-desc");
      var content = "";
      parseSections(descEl.value).forEach(function (s) {
        if (s.heading === d.loreHead) content = s.content || "";
      });
      var p = loreParseTxt(content);
      p.entries = p.entries.filter(function (e) {
        return !drop[loreNorm(e.title || "") + "\n" + loreNorm(e.content || "")];
      });
      var next = p.entries.length ? replaceSectionBody(descEl.value, d.loreHead, rebuildLoreFlat(p))
        : removeSectionFromText(descEl.value, d.loreHead);
      if (next == null || next === descEl.value) { toast("⚠️ couldn't clean up"); return; }
      descEl.value = next;
      st.persona.description = next;
      st.persona.sections = parseSections(next);
      refreshSections(); updateWordCount(); saveLast(); updateSaveButton();
      try { renderChatFit(); } catch (e) {}
      loreSyncPaint();
      toast("♻️ removed " + n + " redundant " + (n === 1 ? "entry" : "entries"));
    } catch (e) {
      console.error(e);
      if (btn) { btn.disabled = false; btn.textContent = label; }
      toast("⚠️ cleanup failed");
    }
  }
  // Add missing lore topics as their own persona sections: topics with no
  // such section are created (before Roleplay Behavior Examples, flagged Lore
  // for chat-fit so chats still fetch them on demand), topics whose section
  // exists but lacks some lore sentences get only those sentences appended.
  // Duplicate "Base · N" chunks merge into their base heading with duplicate
  // sentences removed, so every header becomes one section with all its lore
  // intact. Nothing else in the description is touched.
  async function doLoreSync(btn) {
    var label = btn ? btn.textContent : "";
    try {
      var want = loreSyncInputUrl();
      if (want && (loreSyncUrl.state !== "ready" || loreSyncUrl.url !== want)) {
        if (btn) { btn.disabled = true; btn.textContent = "⏳ reading URL…"; }
        var res = await loreFetchPublishedEntries(want);
        if (!loreSyncOverlay && !btn) return;
        loreSyncUrl = res.ok ? { state: "ready", groups: res.groups, url: want } : { state: "error", groups: [], url: want };
        loreSyncPaint();
      }
      var d = loreSyncCurrent || loreSyncDiff(loreSyncUrl.groups);
      var groups = (d.planGroups && d.planGroups.length) ? d.planGroups : loreSyncPlan(d).groups;
      if (!groups.length) { closeLoreSync(); toast("✅ already in sync"); return; }
      var descEl = $("pgen-desc");
      var text = descEl.value;
      var flagged = [];
      groups.forEach(function (g) {
        if (g.mode === "new") {
          text = appendSectionBlock(text, g.heading, g.content);
          flagged.push(g.heading);
        } else {
          var cur = null;
          var secs = parseSections(text);
          for (var i = 0; i < secs.length; i++) {
            if (secs[i].heading === g.heading) { cur = secs[i].content || ""; break; }
          }
          if (cur == null) {
            text = appendSectionBlock(text, g.heading, g.content);
            flagged.push(g.heading);
          } else {
            var r = replaceSectionBody(text, g.heading, cur.replace(/\s+$/, "") + "\n\n" + g.content);
            if (r != null) text = r;
          }
        }
      });
      if (text === descEl.value) { closeLoreSync(); toast("✅ already in sync"); return; }
      descEl.value = text;
      st.persona.description = text;
      st.persona.sections = parseSections(text);
      // newly created lore sections behave like converted lore: flag them Lore
      // so chats keep fetching them on demand instead of every reply
      var fc = false;
      flagged.forEach(function (hh) {
        if (st.chat.loreHeads.indexOf(hh) < 0) { st.chat.loreHeads.push(hh); fc = true; }
      });
      if (fc) chatSave();
      refreshSections(); updateWordCount(); saveLast(); updateSaveButton();
      try { renderChatFit(); } catch (e) {}
      closeLoreSync();
      toast("🔄 synced " + groups.length + " section" + (groups.length === 1 ? "" : "s") + " into the persona");
    } catch (e) {
      console.error(e);
      if (btn) { btn.disabled = false; btn.textContent = label; }
      toast("⚠️ sync failed");
    }
  }
  async function loreGenerate(btn) {
    var descEl = $("pgen-desc");
    var desc = descEl ? descEl.value.trim() : "";
    if (!desc) { toast("⚠️ generate or load a character first"); return; }
    if (!(window.root && window.root.generateText)) { toast("⚠️ AI text not available"); return; }
    var name = (($("pgen-name") || {}).value || "").trim() || "the character";
    var label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "⏳ writing lore…"; }
    try {
      var instruction = "TASK: Write a lorebook (world info) for the roleplay character below. Reply with a JSON array of 6 to 10 entries. Each entry MUST have {\"title\": \"...\", \"keys\": [\"keyword1\", \"keyword2\"], \"content\": \"2-4 sentences of concrete facts\"}. Cover: home, faction/world, key people, signature place, custom/ritual, past event, rumor/secret. Keys must be short trigger phrases that would appear in chat. Facts must fit the character — no new magic systems that contradict the description. Reply with ONLY the JSON array, no commentary.\n\n--- CHARACTER: " + name + " ---\n" + desc.slice(0, 6000);
      var r = await window.root.generateText({ instruction: instruction });
      var txt = "";
      try { txt = (r && r.text) || (typeof r === "string" ? r : "") || ""; } catch (e) {}
      var arr = null;
      try {
        var m = String(txt).match(/\[[\s\S]*\]/);
        if (m) arr = JSON.parse(m[0]);
      } catch (e) { arr = null; }
      if (!Array.isArray(arr) || !arr.length) {
        arr = String(txt).split(/^##\s+/m).slice(1).map(function (block) {
          var lines = block.split("\n");
          var title = (lines.shift() || "").trim();
          var keys = [];
          var km = block.match(/^keys\s*:\s*(.+)$/mi);
          if (km) keys = km[1].split(",").map(function (s) { return s.trim(); }).filter(Boolean);
          var content = lines.join("\n").replace(/^keys\s*:.*$/mi, "").trim();
          return { title: title, keys: keys, content: content };
        }).filter(function (e) { return e.content; });
      }
      var added = 0;
      (arr || []).forEach(function (it) {
        if (!it || !String(it.content || "").trim()) return;
        var keys = Array.isArray(it.keys) ? it.keys.map(String).map(function (s) { return s.trim(); }).filter(Boolean)
          : String(it.keys || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
        st.lore.entries.push({ id: uid(), title: String(it.title || it.name || "Entry").slice(0, 120), keys: keys.slice(0, 20), content: String(it.content).trim().slice(0, 4000) });
        added++;
      });
      if (!st.lore.name) st.lore.name = name + " — lorebook";
      loreSave(); loreRender();
      toast(added ? "📖 added " + added + " lore entries — review, then 🔗 link" : "⚠️ the AI returned nothing — try again");
    } catch (e) {
      console.error(e);
      toast("⚠️ lorebook generation failed");
    }
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
  function loreParseTxt(text) {
    var t = String(text || "").replace(/^\uFEFF/, "");
    var lines = t.split("\n");
    var name = "", description = "", entries = [], cur = null;
    var headDone = false;
    lines.forEach(function (ln) {
      var h2 = ln.match(/^##\s+(.+)\s*$/);
      var h1 = ln.match(/^#\s+(.+)\s*$/);
      if (h2) { cur = { id: uid(), title: h2[1].trim(), keys: [], content: "" }; entries.push(cur); headDone = true; return; }
      if (h1 && !headDone && !entries.length) { if (!name) name = h1[1].trim(); return; }
      if (cur) {
        var km = ln.match(/^\s*keys\s*:\s*(.+)\s*$/i);
        if (km && !cur.content) { cur.keys = km[1].split(",").map(function (s) { return s.trim(); }).filter(Boolean); return; }
        cur.content += (cur.content ? "\n" : "") + ln;
      } else if (ln.trim()) {
        description += (description ? "\n" : "") + ln.trim();
      }
    });
    entries.forEach(function (e) { e.content = String(e.content || "").trim(); });
    return { name: name, description: description.trim(), entries: entries.filter(function (e) { return e.content; }) };
  }
  function loreImportFile(file) {
    if (!file) return;
    var rd = new FileReader();
    rd.onload = function () {
      var text = String(rd.result || "");
      try {
        if (/\.json$/i.test(file.name || "")) {
          var d = JSON.parse(text);
          if (d && d.data && typeof d.data === "object") d = d.data;
          var book = (d && d.character_book && typeof d.character_book === "object") ? d.character_book : d;
          var rec = sanitizeLorebook({ name: book.name || "", description: book.description || "", entries: (book.entries || []).map(function (e) { return { title: e.name || e.comment || e.title || "", keys: e.keys || e.triggers || [], content: e.content || "" }; }) });
          if (!rec.entries.length) { toast("⚠️ no lorebook entries in that JSON"); return; }
          if (!st.lore.entries.length) { st.lore.name = rec.name; st.lore.description = rec.description; }
          st.lore.entries = st.lore.entries.concat(rec.entries);
          loreSave(); loreRender();
          toast("📖 imported " + rec.entries.length + " entries");
          return;
        }
      } catch (e) { toast("⚠️ that JSON isn't a lorebook"); return; }
      var p = loreParseTxt(text);
      if (!p.entries.length) { toast("⚠️ no ## entries found in that file"); return; }
      if (!st.lore.entries.length) { st.lore.name = p.name; st.lore.description = p.description; }
      st.lore.entries = st.lore.entries.concat(sanitizeLorebook(p).entries);
      loreSave(); loreRender();
      toast("📖 imported " + p.entries.length + " entries");
    };
    rd.readAsText(file);
  }
  function loreDownloadTxt() {
    var flat = loreFlatten();
    if (!flat) { toast("⚠️ lorebook is empty"); return; }
    var nm = (st.lore.name || (($("pgen-name") || {}).value) || "lorebook").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 40);
    var blob = new Blob([flat + "\n"], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nm + "_lorebook.txt";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast("📖 lorebook .txt downloaded");
  }
  function loreDownloadJson() {
    var book = loreBook();
    if (!book) { toast("⚠️ lorebook is empty"); return; }
    var nm = (st.lore.name || (($("pgen-name") || {}).value) || "lorebook").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 40);
    var blob = new Blob([JSON.stringify(book, null, 2)], { type: "application/json;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nm + "_lorebook.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast("📖 lorebook .json downloaded");
  }
  // Tavern-compatible character card from explicit inputs (not the live editor),
  // so saved-vault rows export byte-identical cards to the editor button.
  // `lore` is a sanitized-lorebook-shape object or null; `avatar` is an
  // avatarMedia-shape {url, kind, poster} or null. Extra top-level fields the
  // caller adds afterwards (links/meta) are ignored by 📥 Import.
  async function tavernCardFor(name, descText, lore, loreFallbackName, tone, toneMixTag, avatar) {
    var raw = String(descText || "").trim();
    var m = personaSecMapOf(raw);
    var tagline = personaSecGet(m, "tagline");
    var visual = personaSecGet(m, "visual description");
    var personality = ["personality", "voice & mannerisms", "voice and mannerisms", "habits & quirks", "habits and quirks", "likes & dislikes", "likes and dislikes", "goals, fears & desires", "goals, fears and desires", "goals", "a secret", "secret"].map(function (h) { return personaSecGet(m, h); }).filter(Boolean).join("\n\n");
    var scenario = ["scenario", "relationship with {{user}}", "relationship with {user}", "relationship", "backstory"].map(function (h) { return personaSecGet(m, h); }).filter(Boolean).join("\n\n");
    var opening = personaSecGet(m, "opening line", "opening", "first message", "greeting");
    var examples = personaSecGet(m, "roleplay behavior examples", "roleplay examples", "behavior examples", "examples");
    var sysPrompt = personaSecGet(m, "system prompt");
    var postHist = personaSecGet(m, "post-history instructions", "post history instructions");
    var lb = (lore && lore.entries && lore.entries.length) ? lore : null;
    var lorebook = personaSecGet(m, "lorebook", "world info", "worldinfo");
    if (lb) lorebook = loreFlattenOf(lb);
    var used = { tagline: 1, "visual description": 1, personality: 1, "voice & mannerisms": 1, "voice and mannerisms": 1, "habits & quirks": 1, "habits and quirks": 1, "likes & dislikes": 1, "likes and dislikes": 1, "goals, fears & desires": 1, "goals, fears and desires": 1, goals: 1, "a secret": 1, secret: 1, scenario: 1, "relationship with {{user}}": 1, "relationship with {user}": 1, relationship: 1, backstory: 1, "opening line": 1, opening: 1, "first message": 1, greeting: 1, "roleplay behavior examples": 1, "roleplay examples": 1, "behavior examples": 1, examples: 1, "system prompt": 1, "post-history instructions": 1, "post history instructions": 1, lorebook: 1, "world info": 1, worldinfo: 1 };
    var leftover = [];
    Object.keys(m).forEach(function (k) {
      if (used[k]) return;
      var t = m[k].join("\n\n").trim();
      if (t) leftover.push("# " + k + ":\n" + t);
    });
    var description = [tagline, visual].filter(Boolean).join("\n\n") || raw.slice(0, 2000);
    var notes = ["Exported from the All-in-One AI Studio Persona Generator."].concat(lorebook ? ["Lorebook:\n" + lorebook] : []).concat(leftover).join("\n\n");
    var card = {
      name: name,
      description: description,
      personality: personality,
      scenario: scenario,
      first_mes: opening,
      mes_example: examples,
      creator_notes: notes,
      tags: ((tone && tone !== "auto") ? [tone] : []).concat((toneMixTag && toneMixTag !== "auto" && toneMixTag !== tone) ? [toneMixTag] : []),
      character_book: lb ? loreBookOf(lb, loreFallbackName || name) : null
    };
    if (sysPrompt) card.system_prompt = sysPrompt;
    if (postHist) card.post_history_instructions = postHist;
    try {
      var avm = avatar || null;
      if (avm && avm.kind === "video") {
        if (avm.poster && /^data:/i.test(avm.poster)) card.avatar = avm.poster;
        if (/^https?:/i.test(avm.url)) card.creator_notes = (card.creator_notes ? card.creator_notes + "\n\n" : "") + "Avatar video: " + avm.url;
      } else if (avm && avm.url && /^data:/i.test(avm.url)) card.avatar = await downscaleAvatar(avm.url, 512);
    } catch (e) {}
    return card;
  }
  async function exportTavernCard() {
    var name = (($("pgen-name") || {}).value || "").trim().replace(/\n+/g, " ") || "Untitled";
    var raw = (($("pgen-desc") || {}).value || "").trim();
    if (!raw) { toast("⚠️ nothing to export yet"); return; }
    var tone = "";
    try { tone = String((st.opts && st.opts.tone) || ""); } catch (e) {}
    var toneMixTag = "";
    try { toneMixTag = String((st.opts && st.opts.toneMix) || ""); } catch (e) {}
    var card = await tavernCardFor(name, raw, st.lore, (($("pgen-name") || {}).value || "Lorebook"), tone, toneMixTag, avatarMedia());
    downloadFile(safeFilename(name) + ".tavern.json", JSON.stringify(card, null, 2), "application/json;charset=utf-8");
    toast("📤 Tavern card downloaded — upload the .json on as-social (sign in → upload, tick Character)");
  }
  // Everything linked to a saved character, bundled into both export formats:
  // the portrait (avatar), the reference images saved with it, and the
  // published/attached lorebook file URL from its chat-fit snapshot.
  function savedLinks(p) {
    var links = { avatar: null, reference_images: [], lorebook: null };
    try {
      p = p || {};
      if (p.thumb || p.thumbPoster) links.avatar = { url: p.thumb || "", kind: p.thumbKind || AMKind(p.thumb), poster: p.thumbPoster || "" };
      (Array.isArray(p.refs) ? p.refs : []).forEach(function (r) {
        if (!r || r.use === false) return;
        if (!(r.url || r.prompt)) return;
        links.reference_images.push({ url: r.url || "", prompt: r.prompt || "", title: r.title || "", primary: !!r.primary });
      });
      var chat = (p.chat && typeof p.chat === "object") ? p.chat : {};
      if (chat.loreUrl) links.lorebook = { url: chat.loreUrl, name: chat.loreName || "", editKey: chat.loreEditKey || "" };
    } catch (e) {}
    if (!links.avatar && !links.reference_images.length && !links.lorebook) return null;
    return links;
  }
  function linksMarkdown(links) {
    if (!links) return "";
    var lines = [];
    try {
      if (links.avatar && (links.avatar.url || links.avatar.poster)) {
        var au = links.avatar.poster || links.avatar.url;
        lines.push("- Avatar: " + (/^data:/i.test(au) ? "(portrait embedded in the .json export)" : au));
      }
      (links.reference_images || []).forEach(function (r, i) {
        lines.push("- Reference " + (i + 1) + (r.primary ? " (primary)" : "") + ": " + [r.url, r.title ? "“" + r.title + "”" : "", r.prompt ? "— " + r.prompt : ""].filter(Boolean).join(" "));
      });
      if (links.lorebook && links.lorebook.url) lines.push("- Lorebook file: " + links.lorebook.url + (links.lorebook.name ? " (" + links.lorebook.name + ")" : ""));
    } catch (e) {}
    if (!lines.length) return "";
    return "\n## Linked files (exported):\n" + lines.join("\n") + "\n";
  }
  function exportSavedMd(p) {
    var name = String((p && p.name) || "Untitled");
    var desc = String((p && p.description) || "").trim();
    if (!desc) { toast("⚠️ “" + name + "” has no description to export"); return; }
    downloadFile(safeFilename(name) + ".md", personaToMarkdown(name, desc) + linksMarkdown(savedLinks(p)), "text/markdown;charset=utf-8");
    toast("📄 downloaded “" + name + ".md”");
  }
  // Native persona-generator setup file: the whole character state (options,
  // reference images, lorebook, chat-fit snapshot, portrait) in the same shape
  // the generator itself uses — 📥 Import reads it back with full fidelity
  // (unlike the Tavern card, which is a lossy interchange format).
  function personaSetupFor(p) {
    p = p || {};
    var name = String(p.name || "Untitled");
    var desc = String(p.description || "").trim();
    var lore = null;
    try { if (p.lorebook && typeof p.lorebook === "object") lore = sanitizeLorebook(p.lorebook); } catch (e) { lore = null; }
    var chat = null;
    try { if (p.chat && typeof p.chat === "object") chat = sanitizeChatFit(p.chat); } catch (e) { chat = null; }
    var opts = (p.opts && typeof p.opts === "object") ? p.opts : {
      tone: p.tone || "auto", toneMix: p.toneMix || "", rating: p.rating || "sfw",
      language: p.language || "English", depth: p.depth || "balanced",
      extras: Array.isArray(p.extras) ? p.extras.slice() : []
    };
    var refs = [];
    try {
      refs = (Array.isArray(p.refs) ? p.refs : []).filter(function (r) { return r && (r.url || r.prompt); }).map(function (r) {
        return { url: r.url || "", kind: r.kind || "", poster: r.poster || "", prompt: r.prompt || "", title: r.title || "", primary: !!r.primary, use: r.use !== false };
      });
    } catch (e) { refs = []; }
    var setup = {
      app: "all-in-one-generator",
      kind: "persona",
      version: 1,
      exported_at: null,
      exported_by: "All-in-One AI Studio Persona Generator",
      name: name,
      description: desc,
      avatar: { url: p.thumb || "", kind: p.thumbKind || AMKind(p.thumb), poster: p.thumbPoster || "" },
      opts: opts,
      refs: refs,
      lorebook: lore,
      chat: chat
    };
    try { setup.exported_at = new Date().toISOString(); } catch (e) {}
    return setup;
  }
  function exportSavedJson(p) {
    var setup = personaSetupFor(p);
    if (!setup.description) { toast("⚠️ “" + setup.name + "” has no description to export"); return; }
    downloadFile(safeFilename(setup.name) + ".persona.json", JSON.stringify(setup, null, 2), "application/json;charset=utf-8");
    toast("🧩 downloaded “" + setup.name + "” setup (.json — re-uploadable)");
  }
  async function exportSavedTavern(p) {
    var name = String((p && p.name) || "Untitled");
    var desc = String((p && p.description) || "").trim();
    if (!desc) { toast("⚠️ “" + name + "” has no description to export"); return; }
    var lore = null;
    try { lore = sanitizeLorebook((p && p.lorebook) || {}); } catch (e) { lore = null; }
    var card = await tavernCardFor(name, desc, lore, name, (p && p.tone) || "", (p && p.toneMix) || "",
      { url: (p && p.thumb) || "", kind: (p && p.thumbKind) || AMKind(p && p.thumb), poster: (p && p.thumbPoster) || "" });
    // Linked files + provenance on top of the Tavern-compatible core (📥 Import ignores extras).
    var links = savedLinks(p);
    if (links) card.links = links;
    try {
      card.meta = { exported_by: "All-in-One AI Studio Persona Generator", exported_at: new Date().toISOString(),
        tone: (p && p.tone) || "", toneMix: (p && p.toneMix) || "", rating: (p && p.rating) || "",
        language: (p && p.language) || "", depth: (p && p.depth) || "", extras: Array.isArray(p && p.extras) ? p.extras.slice() : [] };
    } catch (e) {}
    downloadFile(safeFilename(name) + ".tavern.json", JSON.stringify(card, null, 2), "application/json;charset=utf-8");
    toast("📇 downloaded “" + name + "” character card (.json, links included)");
  }
  // Per-row ⬇️ menu: Markdown, re-uploadable setup JSON, or Tavern card JSON.
  // One floating menu at a time, closed by picking, clicking elsewhere, or Escape.
  var savedExportMenu = null;
  function savedExportMenuOff() {
    if (savedExportMenu) { try { savedExportMenu.remove(); } catch (e) {} savedExportMenu = null; }
    document.removeEventListener("click", savedExportMenuOutside, true);
    document.removeEventListener("keydown", savedExportMenuKey, true);
  }
  function savedExportMenuOutside(e) { if (savedExportMenu && !savedExportMenu.contains(e.target)) savedExportMenuOff(); }
  function savedExportMenuKey(e) { if (e && e.key === "Escape") savedExportMenuOff(); }
  function openSavedExportMenu(p, anchorBtn) {
    savedExportMenuOff();
    var menu = document.createElement("div");
    menu.className = "pgen-export-menu";
    menu.innerHTML = '<button type="button" data-fmt="md">📄 Markdown (.md)</button><button type="button" data-fmt="setup">🧩 Setup (.json) — re-uploadable</button><button type="button" data-fmt="tavern">📇 Tavern card (.json)</button>';
    document.body.appendChild(menu);
    try {
      var r = anchorBtn.getBoundingClientRect();
      menu.style.top = Math.max(8, Math.min(window.innerHeight - 120, r.bottom + 6)) + "px";
      menu.style.left = Math.max(8, Math.min(window.innerWidth - 230, r.right - 200)) + "px";
    } catch (e) {}
    menu.querySelector("[data-fmt=md]").addEventListener("click", function () { savedExportMenuOff(); exportSavedMd(p); });
    menu.querySelector("[data-fmt=setup]").addEventListener("click", function () { savedExportMenuOff(); exportSavedJson(p); });
    menu.querySelector("[data-fmt=tavern]").addEventListener("click", function () { savedExportMenuOff(); exportSavedTavern(p); });
    savedExportMenu = menu;
    setTimeout(function () {
      document.addEventListener("click", savedExportMenuOutside, true);
      document.addEventListener("keydown", savedExportMenuKey, true);
    }, 0);
  }
  function shareSetup() {
    if (!window.Recipe) { toast("⚠️ sharing not available yet"); return; }
    var shareOpts = Object.assign({}, st.opts);
    window.Recipe.copy("persona", {
      opts: shareOpts,
      refs: st.refs.map(function (r) { return { url: /^data:/i.test(r.url || "") ? "" : (r.url || ""), kind: r.kind || "", poster: (r.poster && r.poster.length < 100000) ? r.poster : "", prompt: r.prompt || "", title: r.title || "", primary: !!r.primary }; })
    });
  }
  function applySetup(data) {
    if (!data) return;
    if (data.opts && typeof data.opts === "object") { st.opts = Object.assign(defaultOpts(), data.opts); saveOpts(); }
    if (Array.isArray(data.refs)) {
      st.refs = data.refs.map(function (r) {
        return { id: uid(), url: r.url || "", kind: r.kind || "", poster: r.poster || "", prompt: r.prompt || "", title: r.title || "", folder: "", use: true, primary: !!r.primary };
      });
      if (st.refs.length && !st.refs.some(function (r) { return r.primary; })) st.refs[0].primary = true;
      saveRefs();
    }
    buildOptionControls(); syncOptionInputs(); renderRefs();
    toast("🔗 setup loaded");
  }

  /* --------------------------------------------------------------- presets */
  // A preset is a named snapshot of the whole 🎛️ Character options panel, kept
  // in one localStorage object keyed by name ({ name: { opts, savedAt } }). The
  // modal below saves/loads/renames/deletes them, and also EXPORTS them to a
  // .json file and IMPORTS them back from a file, a drag-&-drop or pasted JSON —
  // so a set of settings can be backed up or handed to someone else.
  function presetList() {
    try {
      var v = JSON.parse(lsGet(LS_PRESETS) || "{}");
      return (v && typeof v === "object" && !Array.isArray(v)) ? v : {};
    } catch (e) { return {}; }
  }
  function presetSummary(p) {
    var o = (p && p.opts) || {}, bits = [];
    if (o.tone && o.tone !== "auto" && window.t2i_personaToneById) {
      var t = window.t2i_personaToneById(o.tone);
      if (t) {
        var tb = String(t.label || o.tone).replace(/^[^A-Za-z0-9]+/, "");
        if (typeof o.toneMix === "string" && o.toneMix && o.toneMix !== "auto" && o.toneMix !== o.tone) {
          var tm2 = window.t2i_personaToneById(o.toneMix);
          if (tm2) tb += " × " + String(tm2.label || o.toneMix).replace(/^[^A-Za-z0-9]+/, "");
        }
        bits.push(tb);
      }
    } else if (typeof o.toneMix === "string" && o.toneMix && o.toneMix !== "auto" && window.t2i_personaToneById) {
      var tm3 = window.t2i_personaToneById(o.toneMix);
      if (tm3) bits.push(String(tm3.label || o.toneMix).replace(/^[^A-Za-z0-9]+/, ""));
    }
    if (o.depth) bits.push(String(o.depth).replace(/^[^A-Za-z0-9]+/, ""));
    if (o.exampleCount) bits.push(o.exampleCount + " examples");
    if (o.rating) bits.push(String(o.rating).replace(/^[^A-Za-z0-9]+/, ""));
    if (o.language && o.language !== "English") bits.push(o.language);
    if (o.occultType && o.occultType !== "none") {
      var _oc = null;
      try { _oc = (options().occultTypes || []).filter(function (x) { return (typeof x === "string" ? x : x.id) === o.occultType; })[0]; } catch (e) { _oc = null; }
      bits.push(String((_oc && _oc.label) || o.occultType).replace(/^[^A-Za-z0-9]+/, ""));
    }
    if (o.extras && o.extras.length) bits.push("+" + o.extras.length + " sections");
    var seeds = ["flaw", "contradiction", "want", "need", "secret", "pressure", "wildcard"].filter(function (k) { return o[k] && String(o[k]).trim(); }).length;
    if (seeds) bits.push("🌱 " + seeds + " seed" + (seeds === 1 ? "" : "s"));
    return bits.join(" · ") || "(default settings)";
  }
  function applyPresetOpts(opts, label) {
    st.opts = sanitizePresetOpts(opts);
    saveOpts(); buildOptionControls(); syncOptionInputs();
    toast("📂 loaded preset “" + label + "”");
  }
  // Imported/hand-edited presets might carry option ids this version doesn't
  // know (an older save, another app, a typo). Clamp everything to real ids so
  // the selects can never be left blank and generation never gets garbage.
  function sanitizePresetOpts(opts) {
    var O = options();
    var out = Object.assign(defaultOpts(), (opts && typeof opts === "object") ? opts : {});
    function has(list, id) { return (list || []).some(function (x) { return (typeof x === "string" ? x : x.id) === id; }); }
    if (out.tone !== "auto" && !(window.t2i_personaToneById && window.t2i_personaToneById(out.tone))) out.tone = "auto";
    if (typeof out.toneMix !== "string" || !out.toneMix || out.toneMix === "auto" || out.toneMix === out.tone || !(window.t2i_personaToneById && window.t2i_personaToneById(out.toneMix))) out.toneMix = "";
    if (!has(O.depths, out.depth)) out.depth = "balanced";
    if (!has(O.ratings, out.rating)) out.rating = "sfw";
    if (!has(O.genders, out.gender)) out.gender = "auto";
    if (!has(O.occultTypes || [{ id: "none" }], out.occultType)) out.occultType = "none";
    if (!has(O.languages || ["English"], out.language)) out.language = "English";
    if (!has(O.relationships, out.relationship)) out.relationship = "";
    if (!has(O.mergeStyles || [], out.mergeStyle)) out.mergeStyle = "auto";
    if (!has(O.mergeStyles || [], out.toneMergeStyle)) out.toneMergeStyle = "auto";
    var n = parseInt(out.exampleCount, 10);
    out.exampleCount = (n >= 1 && n <= 40) ? n : 10;
    if (!Array.isArray(out.extras)) out.extras = [];
    else { var ids = (O.extraSections || []).map(function (s) { return s.id; }); out.extras = out.extras.filter(function (e) { return ids.indexOf(e) >= 0; }); }
    if (typeof out.name !== "string") out.name = "";
    if (typeof out.age !== "string") out.age = "";
    out.ageAmbiguous = !!out.ageAmbiguous;
    if (typeof out.genre !== "string") out.genre = "";
    if (typeof out.genreMix !== "string") out.genreMix = "";
    if (typeof out.pronouns !== "string") out.pronouns = "";
    if (typeof out.occultType !== "string") out.occultType = "none";
    if (typeof out.relationshipCustom !== "string") out.relationshipCustom = "";
    if (typeof out.avoid !== "string") out.avoid = "";
    if (typeof out.instruction !== "string") out.instruction = "";
    if (typeof out.flaw !== "string") out.flaw = "";
    if (typeof out.contradiction !== "string") out.contradiction = "";
    if (typeof out.want !== "string") out.want = "";
    if (typeof out.need !== "string") out.need = "";
    if (typeof out.secret !== "string") out.secret = "";
    if (typeof out.secretFrom !== "string") out.secretFrom = "";
    if (typeof out.pressure !== "string") out.pressure = "";
    if (typeof out.wildcard !== "string") out.wildcard = "";
    out.lively = !!out.lively;
    return out;
  }
  function uniquePresetName(all, name) {
    if (!all[name]) return name;
    var base = String(name).replace(/\s*\(\d+\)$/, ""), i = 2;
    while (all[base + " (" + i + ")"]) i++;
    return base + " (" + i + ")";
  }
  function looksLikeOpts(o) {
    return !!o && typeof o === "object" && !Array.isArray(o) &&
      ["tone", "toneMix", "depth", "exampleCount", "language", "rating", "gender", "occultType", "genre", "relationship", "extras", "instruction", "name", "age", "ageAmbiguous", "avoid", "flaw", "contradiction", "want", "need", "secret", "pressure", "wildcard"].some(function (k) { return k in o; });
  }
  // Accept every shape we might realistically be handed:
  //   {app,kind,presets:{Name:{opts}}} · {Name:{opts}} · {name,opts}
  //   [{name,opts}] · [{Name:{opts}}] · a bare {opts} object.
  function normalizePresetImport(raw) {
    var out = [];
    function push(name, entry) {
      name = String(name == null ? "" : name).trim();
      var opts = null;
      if (entry && typeof entry === "object") {
        if (entry.opts && typeof entry.opts === "object") opts = entry.opts;
        else if (looksLikeOpts(entry)) opts = entry;
      }
      if (opts) out.push({ name: name || "Imported preset", opts: opts });
    }
    if (Array.isArray(raw)) {
      raw.forEach(function (e) {
        if (!e || typeof e !== "object") return;
        if (e.opts || looksLikeOpts(e)) push(e.name || e.label || e.title, e);
        else { var k; for (k in e) if (e[k] && typeof e[k] === "object") push(k, e[k]); }
      });
      return out;
    }
    if (!raw || typeof raw !== "object") return out;
    if (raw.opts && typeof raw.opts === "object") { push(raw.name || raw.label, raw); return out; }
    if (looksLikeOpts(raw)) { push(raw.name || raw.label, raw); return out; }
    var src = (raw.presets && typeof raw.presets === "object") ? raw.presets : raw;
    var k;
    for (k in src) if (Object.prototype.hasOwnProperty.call(src, k)) push(k, src[k]);
    return out;
  }
  function saveJsonFile(obj, filename) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function exportAllPresets() {
    var all = presetList(), names = Object.keys(all);
    if (!names.length) { toast("⚠️ no presets to export yet"); return; }
    saveJsonFile({ app: "all-in-one-generator", kind: "persona-presets", version: 1, exportedAt: new Date().toISOString(), presets: all },
      "persona-presets-" + new Date().toISOString().slice(0, 10) + ".json");
    toast("⬇️ exported " + names.length + " preset" + (names.length === 1 ? "" : "s"));
  }
  function exportOnePreset(name, entry) {
    var all = presetList(), one = {};
    one[name] = entry || all[name] || { opts: {} };
    saveJsonFile({ app: "all-in-one-generator", kind: "persona-preset", version: 1, exportedAt: new Date().toISOString(), presets: one },
      "persona-preset-" + String(name).replace(/[^a-z0-9-_]+/gi, "_").slice(0, 40) + ".json");
    toast("⬇️ exported “" + name + "”");
  }
  function importPresetJson(text, overwrite) {
    var raw;
    try { raw = JSON.parse(text); }
    catch (e) { toast("⚠️ that isn’t valid JSON"); return { ok: false, error: "json" }; }
    var items = normalizePresetImport(raw);
    if (!items.length) { toast("⚠️ no presets found in that JSON"); return { ok: false, error: "empty" }; }
    var all = presetList(), added = 0, replaced = 0;
    items.forEach(function (it) {
      var opts = sanitizePresetOpts(it.opts);
      if (all[it.name]) {
        if (overwrite) { all[it.name] = { opts: opts, savedAt: Date.now() }; replaced++; }
        else { all[uniquePresetName(all, it.name)] = { opts: opts, savedAt: Date.now() }; added++; }
      } else { all[it.name] = { opts: opts, savedAt: Date.now() }; added++; }
    });
    lsSet(LS_PRESETS, JSON.stringify(all));
    var msg = "📥 imported " + items.length + " preset" + (items.length === 1 ? "" : "s");
    if (replaced) msg += " · " + replaced + " overwritten";
    if (!overwrite && added !== items.length) msg += " · renamed on clash";
    toast(msg);
    return { ok: true, items: items.length, added: added, replaced: replaced };
  }

  var presetOverlay = null, presetEsc = null;
  function closePresets() {
    if (presetEsc) { document.removeEventListener("keydown", presetEsc, true); presetEsc = null; }
    if (presetOverlay) { presetOverlay.remove(); presetOverlay = null; }
  }
  function openPresets() {
    closePresets();
    var ov = document.createElement("div");
    ov.className = "pgen-import-overlay";
    ov.innerHTML =
      '<div class="pgen-import-box">' +
        '<div class="pgen-import-head"><b>💾 Presets</b><button type="button" class="pgen-import-x" id="pgen-preset-x" title="Close">✖</button></div>' +
        '<p class="pgen-import-sub">A preset is a named snapshot of <b>everything under 🎛️ Character options</b> — tone, depth, examples, rating, language, extras and the rest. ' +
          'Save the current settings, load one back, or <b>export ⬇️ / import 📥</b> presets as a <code>.json</code> file to back them up or share them.</p>' +
        '<div class="pgen-preset-save">' +
          '<input id="pgen-preset-name" class="pgen-import-name" placeholder="Name this preset (saves your current settings)">' +
          '<button type="button" id="pgen-preset-save" class="pro-btn pro-btn-primary">💾 Save current settings</button>' +
        "</div>" +
        '<div id="pgen-preset-list" class="pgen-preset-list"></div>' +
        '<div class="pgen-preset-divider">Move &amp; share</div>' +
        '<div class="pgen-preset-actions">' +
          '<button type="button" id="pgen-preset-export" class="pro-btn">⬇️ Export all (.json)</button>' +
          '<button type="button" id="pgen-preset-import-toggle" class="pro-btn">📥 Import presets…</button>' +
        "</div>" +
        '<div id="pgen-preset-import" class="pgen-preset-import" hidden>' +
          '<input type="file" id="pgen-preset-file" class="pgen-import-file" accept=".json,application/json,text/plain">' +
          '<div class="pgen-import-drop" id="pgen-preset-drop">⬆️ <b>Choose a .json file</b> — or drag &amp; drop it here</div>' +
          '<textarea id="pgen-preset-text" class="pgen-import-text pgen-preset-text" placeholder="…or paste preset JSON here — e.g. {&quot;My preset&quot;:{&quot;opts&quot;:{&quot;tone&quot;:&quot;auto&quot;,&quot;depth&quot;:&quot;balanced&quot;}}}"></textarea>' +
          '<div id="pgen-preset-meta" class="pgen-import-meta">Nothing loaded yet — choose a file or paste JSON above.</div>' +
          '<label class="pgen-check pgen-preset-overwrite"><input type="checkbox" id="pgen-preset-overwrite"> overwrite presets that already exist (otherwise they’re kept and the import is renamed)</label>' +
          '<div class="pgen-import-row">' +
            '<button type="button" id="pgen-preset-doimport" class="pro-btn pro-btn-primary">📥 Import</button>' +
          "</div>" +
        "</div>" +
      "</div>";
    document.body.appendChild(ov);
    presetOverlay = ov;

    var nameInput = ov.querySelector("#pgen-preset-name");
    var listHost = ov.querySelector("#pgen-preset-list");
    var importPanel = ov.querySelector("#pgen-preset-import");
    var fileInput = ov.querySelector("#pgen-preset-file");
    var drop = ov.querySelector("#pgen-preset-drop");
    var txt = ov.querySelector("#pgen-preset-text");
    var meta = ov.querySelector("#pgen-preset-meta");
    var overwrite = ov.querySelector("#pgen-preset-overwrite");

    function renderList() {
      var all = presetList();
      var names = Object.keys(all).sort(function (a, b) { return a.localeCompare(b); });
      listHost.innerHTML = "";
      if (!names.length) {
        listHost.innerHTML = '<div class="pgen-preset-empty">No presets yet — save your current settings above, or import a .json file below.</div>';
        return;
      }
      names.forEach(function (name) {
        var row = document.createElement("div");
        row.className = "pgen-preset-row";
        row.innerHTML =
          '<div class="pgen-preset-main"><div class="pgen-preset-pname" title="' + esc(name) + '">' + esc(name) + "</div>" +
          '<div class="pgen-preset-meta">' + esc(presetSummary(all[name])) + "</div></div>" +
          '<div class="pgen-preset-acts">' +
            '<button type="button" class="pgen-saved-btn" data-act="load" title="Apply this preset">📂</button>' +
            '<button type="button" class="pgen-saved-btn" data-act="rename" title="Rename">✏️</button>' +
            '<button type="button" class="pgen-saved-btn" data-act="export" title="Export just this preset as .json">⬇️</button>' +
            '<button type="button" class="pgen-saved-btn" data-act="delete" title="Delete">🗑️</button>' +
          "</div>";
        row.querySelector('[data-act="load"]').addEventListener("click", function () { applyPresetOpts((all[name] || {}).opts, name); closePresets(); });
        row.querySelector('[data-act="export"]').addEventListener("click", function () { exportOnePreset(name, all[name]); });
        row.querySelector('[data-act="delete"]').addEventListener("click", async function () {
          if (!(await window.uiConfirm("Delete the preset “" + name + "”?", { okText: 'Delete', danger: true }))) return;
          var cur = presetList(); delete cur[name];
          lsSet(LS_PRESETS, JSON.stringify(cur));
          renderList(); toast("🗑️ deleted preset “" + name + "”");
        });
        row.querySelector('[data-act="rename"]').addEventListener("click", function () { startRename(row, name); });
        listHost.appendChild(row);
      });
    }
    function startRename(row, name) {
      var main = row.querySelector(".pgen-preset-main");
      var inp = document.createElement("input");
      inp.className = "pgen-import-name pgen-preset-rename";
      inp.value = name;
      main.innerHTML = ""; main.appendChild(inp);
      inp.focus(); inp.select();
      var done = false, cancelled = false;
      function commit(ok) {
        if (done) return;
        var nv = String(inp.value || "").trim();
        var all = presetList();
        if (ok && nv && nv !== name) {
          if (all[nv]) { toast("⚠️ a preset called “" + nv + "” already exists"); renderList(); return; }
          all[nv] = all[name]; delete all[name];
          lsSet(LS_PRESETS, JSON.stringify(all));
          toast("✏️ renamed to “" + nv + "”");
        } else if (ok && !nv) { toast("⚠️ name can’t be empty"); renderList(); return; }
        done = true;
        renderList();
      }
      inp.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); commit(true); }
        else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelled = true; commit(false); }
      });
      inp.addEventListener("blur", function () { commit(!cancelled); });
    }
    function updateImportMeta() {
      var t = (txt.value || "").trim();
      if (!t) { meta.textContent = "Nothing loaded yet — choose a file or paste JSON above."; return; }
      var items = [];
      try { items = normalizePresetImport(JSON.parse(t)); } catch (e) { meta.textContent = "⚠️ not valid JSON yet…"; return; }
      meta.textContent = items.length
        ? items.length + " preset" + (items.length === 1 ? "" : "s") + " found: " + items.map(function (i) { return i.name; }).slice(0, 6).join(", ") + (items.length > 6 ? "…" : "")
        : "⚠️ valid JSON, but no presets found in it";
    }
    function fillImport(text) { txt.value = String(text == null ? "" : text); updateImportMeta(); }
    async function handleFile(file) {
      if (!file) return;
      var raw = "";
      try { raw = await file.text(); }
      catch (e) {
        try { raw = await new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsText(file); }); } catch (e2) { raw = ""; }
      }
      if (!String(raw).trim()) { toast("⚠️ that file is empty"); return; }
      fillImport(raw);
      toast("📄 loaded " + (file.name || "file"));
    }
    function runImport() {
      var t = (txt.value || "").trim();
      if (!t) { toast("⚠️ nothing to import"); return; }
      var res = importPresetJson(t, !!overwrite.checked);
      if (res.ok) { txt.value = ""; updateImportMeta(); importPanel.hidden = true; renderList(); }
    }

    ov.querySelector("#pgen-preset-save").addEventListener("click", function () {
      var n = String(nameInput.value || "").trim();
      if (!n) { toast("⚠️ give the preset a name"); nameInput.focus(); return; }
      var all = presetList();
      var existed = !!all[n];
      all[n] = { opts: st.opts, savedAt: Date.now() };
      lsSet(LS_PRESETS, JSON.stringify(all));
      nameInput.value = "";
      renderList();
      toast(existed ? "💾 overwrote preset “" + n + "”" : "💾 saved preset “" + n + "”");
    });
    nameInput.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); ov.querySelector("#pgen-preset-save").click(); } });
    ov.querySelector("#pgen-preset-export").addEventListener("click", exportAllPresets);
    ov.querySelector("#pgen-preset-import-toggle").addEventListener("click", function () {
      importPanel.hidden = !importPanel.hidden;
      if (!importPanel.hidden) { txt.focus(); updateImportMeta(); }
    });
    ov.querySelector("#pgen-preset-doimport").addEventListener("click", runImport);
    txt.addEventListener("input", updateImportMeta);
    fileInput.addEventListener("change", function () { handleFile(fileInput.files && fileInput.files[0]); });
    drop.addEventListener("click", function () { fileInput.click(); });
    drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("on"); });
    drop.addEventListener("dragleave", function () { drop.classList.remove("on"); });
    drop.addEventListener("drop", function (e) {
      e.preventDefault(); drop.classList.remove("on");
      var dt = e.dataTransfer;
      if (dt && dt.files && dt.files[0]) handleFile(dt.files[0]);
      else if (dt) { var t = dt.getData("text"); if (t) { importPanel.hidden = false; fillImport(t); } }
    });
    ov.querySelector("#pgen-preset-x").addEventListener("click", closePresets);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) closePresets(); });
    presetEsc = function (e) {
      if (e.key !== "Escape") return;
      // while editing a rename, let the field's own handler cancel the edit (and
      // never blur it here — blurring would commit the rename instead)
      var a = document.activeElement;
      if (a && a.classList && a.classList.contains("pgen-preset-rename")) return;
      e.stopPropagation(); closePresets();
    };
    document.addEventListener("keydown", presetEsc, true);

    renderList();
    setTimeout(function () { try { nameInput.focus(); } catch (e) {} }, 30);
  }

  /* ------------------------------------------------------------ surprise me */
  function surprise() {
    var O = options();
    var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
    st.opts.tone = pick(O.tones).id;
    var _toneIds = (O.tones || []).map(function (t) { return (typeof t === "string") ? t : t.id; }).filter(function (id) { return id && id !== "auto"; });
    st.opts.toneMix = pick(["", ""].concat(_toneIds.filter(function (id) { return id !== st.opts.tone; }))) || "";
    st.opts.toneMergeStyle = pick(((O.mergeStyles && O.mergeStyles.length) ? O.mergeStyles : [{ id: "auto" }]).map(function (m) { return m.id; })) || "auto";
    st.opts.depth = pick(O.depths).id;
    st.opts.exampleCount = pick([6, 8, 10, 12, 16]);
    st.opts.rating = pick(O.ratings).id;
    var _rts = window.t2i_personaToneById ? [window.t2i_personaToneById(st.opts.tone), window.t2i_personaToneById(st.opts.toneMix)] : [];
    var _rr = { sfw: 0, suggestive: 1, mature: 2, explicit: 3 };
    _rts.forEach(function (_rt) { if (_rt && _rt.rating && _rr[_rt.rating] > (_rr[st.opts.rating] || 0)) st.opts.rating = _rt.rating; });
    try {
      var _occList = O.occultTypes || [], _occ = null;
      for (var _oi = 0; _oi < _occList.length; _oi++) {
        var _ox = _occList[_oi], _oxid = (typeof _ox === "string") ? _ox : _ox.id;
        if (_oxid === st.opts.occultType) { _occ = (typeof _ox === "string") ? null : _ox; break; }
      }
      if (_occ && _occ.rating && _rr[_occ.rating] > (_rr[st.opts.rating] || 0)) st.opts.rating = _occ.rating;
    } catch (e) {}
    st.opts.gender = pick(O.genders).id;
    st.opts.relationship = pick(O.relationships).id;
    try {
      var _occPool = ((O.occultTypes || []).map(function (x) { return typeof x === "string" ? x : x.id; }).filter(Boolean)) || [];
      // Bias toward non-occult characters: half the rolls stay mundane, the
      // other half pick a random occult type (mirrors how rarely the old
      // generator reached for the supernatural unprompted).
      st.opts.occultType = (Math.random() < 0.5 || !_occPool.length) ? "none" : pick(_occPool.filter(function (id) { return id !== "none"; }).concat(["none"]));
    } catch (e) { st.opts.occultType = "none"; }
    st.opts.pronouns = "";
    st.opts.genre = pick(genreList().map(genreId).filter(function (g) { return g && !/^\(/.test(g); }).concat([""])) || "";
    st.opts.genreMix = pick(["", ""].concat(genreList().map(genreId).filter(function (g) { return g && !/^\(/.test(g) && g !== st.opts.genre; }))) || "";
    st.opts.mergeStyle = pick(((O.mergeStyles && O.mergeStyles.length) ? O.mergeStyles : [{ id: "auto" }]).map(function (m) { return m.id; })) || "auto";
    // Exactly six random extras (shuffled, so they aren't always the
    // first-listed ones): each one now gets its own generation pass, so the
    // old ~40% grab-bag (≈17 thin, repetitive sections sharing one word
    // budget) would be slow and bloated. Six keeps the surprise varied
    // without an endless generation queue.
    var pool = (O.extraSections || []).slice();
    for (var si = pool.length - 1; si > 0; si--) { var sj = Math.floor(Math.random() * (si + 1)); var tmp = pool[si]; pool[si] = pool[sj]; pool[sj] = tmp; }
    st.opts.extras = pool.slice(0, 6).map(function (s) { return s.id; });
    // Surprise rolls a fresh wild spark too — same roller as the 🎲 button.
    try { st.opts.wildcard = window.t2i_personaWildcard ? (window.t2i_personaWildcard() || "") : st.opts.wildcard; } catch (e) {}
    saveOpts(); buildOptionControls(); syncOptionInputs();
    try { updateGenLabel(); } catch (e) {}
    toast("🎲 rolled a new setup");
  }
  async function resetOptions() {
    // One-click clear of the whole 🎛️ Character options panel: every select
    // back to its default, every typed box emptied, all extra sections
    // unticked. `defaultOpts()` pulls the sticky last-used tone/lively prefs,
    // so those are forced to true factory defaults too. Same refresh triplet
    // as surprise().
    if (!(await window.uiConfirm("Clear everything under 🎛️ Character options back to defaults?", { okText: 'Clear all', danger: true }))) return;
    var d = defaultOpts();
    d.tone = "auto";
    d.lively = false;
    st.opts = d;
    saveOpts(); buildOptionControls(); syncOptionInputs();
    // The fused 🧬 starting point lives in this same card, so Reset returns
    // it to ✨ Fresh (the saved reference pick itself is kept for next time).
    try { setRefMode(false); } catch (e) {}
    toast("↺ character options cleared — back to defaults");
  }

  /* ------------------------------------------------------- saved personas */
  // Finished characters are kept in a kv-plugin folder (IndexedDB, per-browser)
  // so they survive reloads with far more room than localStorage. Any two or more
  // saved personas can be fused into one new character by the combine engine.
  var saved = { list: null, sel: {} };
  var combineObj = null;

  function kvFolder() {
    var r = window.root;
    return (r && r.kv && r.kv.personaVault) ? r.kv.personaVault : null;
  }
  async function kvReady() {
    for (var i = 0; i < 40; i++) { if (kvFolder()) return true; await new Promise(function (r) { setTimeout(r, 150); }); }
    return false;
  }
  async function loadSaved() {
    if (saved.list) return saved.list;
    await kvReady();
    var f = kvFolder();
    if (!f) { saved.list = []; return saved.list; }
    try { var v = await f.get("list"); saved.list = Array.isArray(v) ? v : []; }
    catch (e) { saved.list = []; }
    return saved.list;
  }
  function persistSaved() {
    var f = kvFolder();
    if (!f) return Promise.resolve();
    try { return Promise.resolve(f.set("list", saved.list || [])); }
    catch (e) { console.error("persona library save failed", e); return Promise.resolve(); }
  }
  function selectedSaved() { return (saved.list || []).filter(function (p) { return saved.sel[p.id]; }); }
  function savedWords(t) { t = String(t || "").trim(); return t ? t.split(/\s+/).length : 0; }

  function findSavedByName(name) {
    var n = String(name || "").trim().toLowerCase();
    return (saved.list || []).filter(function (p) { return String(p.name || "").trim().toLowerCase() === n; })[0];
  }
  async function commitSaved(rec, existing) {
    if (existing) Object.assign(existing, rec);
    else (saved.list || (saved.list = [])).unshift(rec);
    while (saved.list.length > 400) saved.list.pop();
    await persistSaved();
    renderSaved();
  }

  // The saved persona the editor is currently linked to (or null for a new / unsaved one).
  function activeRecord() {
    if (!st.activeId) return null;
    return (saved.list || []).filter(function (p) { return p.id === st.activeId; })[0] || null;
  }
  function isActiveDirty() {
    var p = activeRecord();
    if (!p) return false;
    var nameEl = $("pgen-name"), descEl = $("pgen-desc");
    var name = (nameEl && nameEl.value || "").trim();
    var desc = descEl ? descEl.value : "";
    if (name !== (p.name || "") || desc !== (p.description || "")) return true;
    try {
      var a = JSON.stringify(sanitizeLorebook(st.lore));
      var b = JSON.stringify(sanitizeLorebook(p.lorebook || {}));
      if (a !== b) return true;
      var ca = JSON.stringify(sanitizeChatFit(st.chat));
      var cb = JSON.stringify(sanitizeChatFit(p.chat || {}));
      if (ca !== cb) return true;
      // Top 🎛️ Character options: compare the live snapshot against the
      // record's stored one (legacy records only kept a few top-level keys).
      var curOpts = JSON.stringify(sanitizePresetOpts(st.opts));
      var savedOpts = JSON.stringify(sanitizePresetOpts(
        (p.opts && typeof p.opts === "object") ? p.opts :
        { tone: p.tone, toneMix: p.toneMix, rating: p.rating, language: p.language, depth: p.depth, extras: p.extras }
      ));
      if (curOpts !== savedOpts) return true;
      // Reference images (same slim shape recordFor() stores).
      var curRefs = JSON.stringify(slimRefsForRecord());
      var savedRefs = JSON.stringify((Array.isArray(p.refs) ? p.refs : []).filter(function (r) { return r && (r.url || r.prompt); }).map(function (r) {
        return { url: r.url || "", kind: r.kind || "", poster: r.poster || "", prompt: r.prompt || "", title: r.title || "", primary: !!r.primary, use: r.use !== false };
      }));
      if (curRefs !== savedRefs) return true;
      // Portrait.
      if ((st.portrait || "") !== (p.thumb || "")) return true;
    } catch (e) {}
    return false;
  }
  // Reflect the link + any unsaved edits on the primary save button.
  function updateSaveButton() {
    var btn = $("pgen-save");
    if (!btn) return;
    var p = activeRecord();
    if (p) {
      btn.textContent = "💾 Save changes to “" + (p.name || "Untitled") + "”" + (isActiveDirty() ? " •" : "");
      btn.title = "Update this saved persona in place";
      btn.classList.toggle("pgen-unsaved", isActiveDirty());
    } else {
      btn.textContent = "💾 Save current persona";
      btn.title = "Keep the current character in your saved personas";
      btn.classList.remove("pgen-unsaved");
    }
  }
  function dataUrlToBlob(dataUrl) {
    var parts = String(dataUrl || "").split(",");
    var mime = (/^data:([^;,]+)/i.exec(parts[0] || "") || [])[1] || "application/octet-stream";
    var bin = atob(parts[1] || "");
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
  async function durableAvatar(m) {
    if (!m || !m.url) return { url: "", kind: "", poster: "" };
    if (/^https?:/i.test(m.url) || /^data:image/i.test(m.url)) return m;
    if (!(/^blob:/i.test(m.url) || /^data:video/i.test(m.url))) return m;
    try {
      var blob = /^blob:/i.test(m.url) ? await (await fetch(m.url)).blob() : dataUrlToBlob(m.url);
      if (blob && window.root && window.root.uploadPlugin) {
        var up = await window.root.uploadPlugin(blob);
        if (up && !up.error && up.url) return { url: up.url, kind: "video", poster: m.poster || "" };
      }
    } catch (e) {}
    return m;
  }
  async function currentThumb() {
    var m = await durableAvatar(avatarMedia());
    if (!m.url) return { thumb: "", kind: "", poster: "" };
    try {
      if (m.kind === "video") return { thumb: m.url, kind: "video", poster: m.poster || "" };
      return { thumb: /^data:/i.test(m.url) ? await downscale(m.url, 160) : m.url, kind: m.kind || "", poster: "" };
    } catch (e) { return { thumb: "", kind: "", poster: "" }; }
  }
  // Reference images linked to the character, slimmed exactly like the vault
  // save (local data: URLs are dropped — only http URLs travel; the prompt text
  // always survives). Stored on the record so exports can bundle them later.
  function slimRefsForRecord() {
    try {
      return (st.refs || []).filter(function (r) { return r && (r.url || r.prompt); }).map(function (r) {
        return {
          url: /^data:/i.test(r.url || "") ? "" : (r.url || ""),
          kind: r.kind || "",
          poster: (r.poster && r.poster.length < 100000) ? r.poster : "",
          prompt: r.prompt || "",
          title: r.title || "",
          primary: !!r.primary,
          use: r.use !== false
        };
      });
    } catch (e) { return []; }
  }
  // Full Character-options snapshot for the record, so a saved persona (and its
  // exported setup file) carries the whole generator state, not just the tone.
  function snapshotOpts() {
    try { return Object.assign({}, st.opts); } catch (e) { return {}; }
  }
  function recordFor(rec, name, desc, thumb) {
    var chatSnap = JSON.parse(JSON.stringify(sanitizeChatFit(st.chat)));
    var refSnap = slimRefsForRecord();
    var toneMixSnap = "";
    try { toneMixSnap = String((st.opts && st.opts.toneMix) || ""); } catch (e) {}
    if (thumb && typeof thumb === "object") {
      return {
        id: rec ? rec.id : uid(),
        name: name,
        description: desc,
        thumb: thumb.thumb || "",
        thumbKind: thumb.kind || "",
        thumbPoster: thumb.poster || "",
        refs: refSnap,
        lorebook: JSON.parse(JSON.stringify(sanitizeLorebook(st.lore))),
        chat: chatSnap,
        tone: st.opts.tone,
        toneMix: toneMixSnap,
        rating: st.opts.rating,
        language: st.opts.language,
        depth: st.opts.depth,
        extras: (st.opts.extras || []).slice(),
        opts: snapshotOpts(),
        ts: Date.now()
      };
    }
    return {
      id: rec ? rec.id : uid(),
      name: name,
      description: desc,
      thumb: thumb,
      refs: refSnap,
      lorebook: JSON.parse(JSON.stringify(sanitizeLorebook(st.lore))),
      chat: chatSnap,
      tone: st.opts.tone,
      toneMix: toneMixSnap,
      rating: st.opts.rating,
      language: st.opts.language,
      depth: st.opts.depth,
      extras: (st.opts.extras || []).slice(),
      opts: snapshotOpts(),
      ts: Date.now()
    };
  }

  // Save (or, when a saved persona is active, update it in place).
  async function saveCurrentPersona(silent) {
    var descEl = $("pgen-desc"), nameEl = $("pgen-name");
    var desc = descEl ? descEl.value : "";
    if (!desc.trim()) { toast("⚠️ generate or load a persona first"); return null; }
    await loadSaved();
    var active = activeRecord();
    var name = (nameEl && nameEl.value || "").trim() || (active ? active.name : "") || "Untitled persona";
    var thumb = await currentThumb();
    var savedRec;
    if (active) {
      savedRec = recordFor(active, name, desc, thumb);
      await commitSaved(savedRec, active);
      if (!silent) toast("💾 updated “" + name + "”");
    } else {
      var existing = findSavedByName(name);
      if (existing) {
        if (!(await window.uiConfirm("A saved persona called “" + name + "” already exists.\n\nOK = overwrite it with the current character\nCancel = save it as a copy", { okText: 'Overwrite', danger: true }))) {
          name = name + " (copy)"; existing = null;
        }
      }
      savedRec = recordFor(existing, name, desc, thumb);
      await commitSaved(savedRec, existing);
      if (!silent) toast((existing ? "💾 updated “" : "🗃️ saved “") + name + "”");
    }
    st.activeId = savedRec.id;
    saveLast();
    renderSaved();
    return savedRec;
  }

  // Always create a brand-new saved persona from the current character.
  async function saveAsNewPersona() {
    var descEl = $("pgen-desc"), nameEl = $("pgen-name");
    var desc = descEl ? descEl.value : "";
    if (!desc.trim()) { toast("⚠️ generate or load a persona first"); return null; }
    await loadSaved();
    var name = (nameEl && nameEl.value || "").trim() || "Untitled persona";
    if (findSavedByName(name)) name = name + " (copy)";
    var rec = recordFor(null, name, desc, await currentThumb());
    await commitSaved(rec, null);
    st.activeId = rec.id;
    saveLast();
    renderSaved();
    toast("🗃️ saved “" + name + "” as a new persona");
    return rec;
  }

  // Load a character record (saved or imported) into the editor + section tools.
  function applyImportedPersona(rec) {
    var nameEl = $("pgen-name"), descEl = $("pgen-desc");
    if (nameEl) nameEl.value = rec.name || "";
    if (descEl) descEl.value = rec.description || "";
    st.persona = { name: rec.name || "", description: rec.description || "", sections: parseSections(rec.description || "") };
    st.activeId = rec.id || null;
    st.portrait = rec.thumb || null;
    st.portraitKind = rec.thumbKind || AMKind(rec.thumb);
    st.portraitPoster = rec.thumbPoster || "";
    st.lore = sanitizeLorebook(rec.lorebook || {});
    loreSave(); loreRender();
    applyChatState(rec.chat);
    try { pgenExpandCard("character"); } catch (e) {}
    renderPortrait(); refreshSections(); updateWordCount(); saveLast();
    renderSaved(); updateSaveButton();
  }

  // Add an imported character to the library, deduping by name.
  async function storeImported(rec) {
    await loadSaved();
    var existing = findSavedByName(rec.name);
    if (existing) {
      if (!(await window.uiConfirm("A saved persona called “" + rec.name + "” already exists.\n\nOK = replace it\nCancel = keep both (saves as a copy)", { okText: 'Replace', danger: true }))) {
        rec.name = rec.name + " (copy)";
        existing = null;
      }
    }
    rec.ts = Date.now();
    if (existing) rec.id = existing.id;
    await commitSaved(rec, existing);
    return rec;
  }

  /* ---------------------------------------------------- import personas */
  // Bring in a character from a .txt / .md file, from a JSON character card
  // (SillyTavern v1/v2 shape), or from text typed/pasted into the box. The
  // canonical `# {{char}} Heading:` layout is parsed live (so the name autofills
  // and the 🧩 section tools light up after loading); anything else is kept
  // verbatim. The character can be added to the saved library and/or loaded
  // straight into the editor, where every handoff button then works on it.
  function nameFromFilename(fn) {
    return String(fn || "").replace(/\.[a-z0-9]+$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  }
  function cardToDescription(d) {
    if (!d || typeof d !== "object") return null;
    if (d.data && typeof d.data === "object" && (d.data.description || d.data.personality || d.data.char_name || d.data.name)) d = d.data;
    var name = String(d.char_name || d.name || "").trim();
    var parts = [];
    var push = function (h, v) { v = String(v == null ? "" : v).trim(); if (v) parts.push("# {{char}} " + h + ":\n" + v); };
    var desc = String(d.description || "").trim();
    var pers = String(d.personality || "").trim();
    if (desc && /#\s*\{\{char\}\}/.test(desc)) {
      parts.push(desc.trim());
      if (pers && !/personality/i.test(desc)) push("Personality", pers);
    } else if (desc || pers) {
      push("Personality", [desc, pers].filter(Boolean).join("\n\n"));
    }
    if (d.scenario) push("Backstory", d.scenario);
    if (d.first_mes) push("Opening Line", d.first_mes);
    if (d.mes_example) {
      var ex = String(d.mes_example).split(/<START>/i).map(function (s) { return s.trim(); }).filter(Boolean);
      if (ex.length) push("Roleplay Behavior Examples", ex.map(function (s, i) { return (i + 1) + ". " + s; }).join("\n\n"));
    }
    var lorebook = null;
    try {
      var bk = d.character_book;
      if (bk && typeof bk === "object" && Array.isArray(bk.entries) && bk.entries.length) {
        lorebook = sanitizeLorebook({
          name: bk.name || "", description: bk.description || "",
          entries: bk.entries.map(function (e) { return { title: e.name || e.comment || e.title || "", keys: e.keys || e.triggers || [], content: e.content || "" }; })
        });
        if (!lorebook.entries.length) lorebook = null;
      }
    } catch (e) { lorebook = null; }
    if (!parts.length && !lorebook) return null;
    return { name: name, description: parts.join("\n\n\n"), lorebook: lorebook };
  }

  // Native setup files exported from 🗃️ Saved personas ({kind:"persona", ...}) come
  // back with full fidelity — options, reference images, lorebook, chat-fit,
  // portrait — instead of the lossy Tavern-card mapping below.
  function setupFromJson(d) {
    if (!d || typeof d !== "object" || Array.isArray(d)) return null;
    var isSetup = (d.kind === "persona") ||
      ((d.opts && typeof d.opts === "object") && typeof d.description === "string" && !d.personality && !d.scenario && !d.char_name && !(d.data && typeof d.data === "object"));
    if (!isSetup) return null;
    var s = { name: String(d.name || "").trim(), description: String(d.description || "") };
    if (!s.description.trim()) return null;
    s.avatar = (d.avatar && typeof d.avatar === "object") ? { url: String(d.avatar.url || ""), kind: String(d.avatar.kind || ""), poster: String(d.avatar.poster || "") } : null;
    s.opts = (d.opts && typeof d.opts === "object") ? d.opts : null;
    s.refs = Array.isArray(d.refs) ? d.refs : [];
    s.lorebook = (d.lorebook && typeof d.lorebook === "object") ? d.lorebook : null;
    s.chat = (d.chat && typeof d.chat === "object") ? d.chat : null;
    return s;
  }
  // Restore a setup file into the whole editor: options, refs, lorebook,
  // chat-fit, portrait, name + description — the same state its export captured.
  function applySetupPayload(s) {
    if (!s) return;
    if (s.opts && typeof s.opts === "object") {
      st.opts = sanitizePresetOpts(s.opts);
      saveOpts();
    }
    if (Array.isArray(s.refs)) {
      st.refs = s.refs.filter(function (r) { return r && (r.url || r.prompt); }).map(function (r) {
        return { id: uid(), url: r.url || "", kind: r.kind || "", poster: r.poster || "", prompt: r.prompt || "", title: r.title || "", folder: "", use: r.use !== false, primary: !!r.primary };
      });
      if (st.refs.length && !st.refs.some(function (r) { return r.primary; })) st.refs[0].primary = true;
      saveRefs();
    }
    if (s.lorebook && typeof s.lorebook === "object") { st.lore = sanitizeLorebook(s.lorebook); loreSave(); }
    if (s.chat && typeof s.chat === "object") { applyChatState(s.chat); }
    if (s.avatar && (s.avatar.url || s.avatar.poster)) {
      st.portrait = s.avatar.url || s.avatar.poster || null;
      st.portraitKind = s.avatar.kind || AMKind(st.portrait);
      st.portraitPoster = s.avatar.poster || "";
    }
    var nameEl = $("pgen-name"), descEl = $("pgen-desc");
    if (nameEl) nameEl.value = s.name || "";
    if (descEl) descEl.value = s.description || "";
    st.persona = { name: s.name || "", description: s.description || "", sections: parseSections(s.description || "") };
    st.activeId = null;
    buildOptionControls(); syncOptionInputs(); renderRefs(); loreRender(); renderPortrait();
    refreshSections(); updateWordCount(); saveLast(); renderSaved(); updateSaveButton();
    try { pgenExpandCard("character"); } catch (e) {}
  }
  // A library record built straight from a setup file (➕ Add without touching
  // the editor): the same fields recordFor() snapshots, from the file's data.
  function recordFromSetup(s, nm) {
    var lore = null;
    try { if (s.lorebook) lore = sanitizeLorebook(s.lorebook); } catch (e) { lore = null; }
    var chat = null;
    try { if (s.chat) chat = sanitizeChatFit(s.chat); } catch (e) { chat = null; }
    var opts = (s.opts && typeof s.opts === "object") ? s.opts : {};
    return {
      id: uid(),
      name: nm,
      description: String(s.description || ""),
      thumb: (s.avatar && s.avatar.url) || "",
      thumbKind: (s.avatar && s.avatar.kind) || "",
      thumbPoster: (s.avatar && s.avatar.poster) || "",
      refs: (Array.isArray(s.refs) ? s.refs : []).filter(function (r) { return r && (r.url || r.prompt); }).map(function (r) {
        return { url: r.url || "", kind: r.kind || "", poster: r.poster || "", prompt: r.prompt || "", title: r.title || "", primary: !!r.primary, use: r.use !== false };
      }),
      lorebook: lore,
      chat: chat,
      tone: opts.tone || "auto",
      toneMix: opts.toneMix || "",
      rating: opts.rating || "sfw",
      language: opts.language || "English",
      depth: opts.depth || "balanced",
      extras: Array.isArray(opts.extras) ? opts.extras.slice() : [],
      opts: Object.assign({}, opts),
      ts: Date.now()
    };
  }

  var importOverlay = null, importEsc = null;
  function closeImport() {
    if (importEsc) { document.removeEventListener("keydown", importEsc, true); importEsc = null; }
    if (importOverlay) { importOverlay.remove(); importOverlay = null; }
  }
  function openImport() {
    closeImport();
    var ov = document.createElement("div");
    ov.className = "pgen-import-overlay";
    ov.innerHTML =
      '<div class="pgen-import-box">' +
        '<div class="pgen-import-head"><b>📥 Import a persona</b><button type="button" class="pgen-import-x" id="pgen-import-x" title="Close">✖</button></div>' +
        '<p class="pgen-import-sub">Drop or choose a <b>.txt</b>, <b>.md</b> or <b>.json</b> file (character card or 🧩 persona setup), or just type / paste a persona below. ' +
          "Text in the <code># {{char}} Name:</code> … layout is split into sections automatically; anything else is kept exactly as written.</p>" +
        '<input type="file" id="pgen-import-file" class="pgen-import-file" accept=".txt,.md,.json,text/plain,application/json">' +
        '<div class="pgen-import-drop" id="pgen-import-drop">⬆️ <b>Choose a file</b> — or drag &amp; drop it here</div>' +
        '<textarea id="pgen-import-text" class="pgen-import-text" placeholder="…or paste / type the persona here.&#10;&#10;Example:&#10;# {{char}} Name:&#10;Ash&#10;&#10;# {{char}} Personality:&#10;A weary mercenary with a dry wit."></textarea>' +
        '<input id="pgen-import-name" class="pgen-import-name" placeholder="Character name (auto-filled from the text or filename)">' +
        '<div id="pgen-import-meta" class="pgen-import-meta">Nothing yet — choose a file or paste text above.</div>' +
        '<div class="pgen-import-row">' +
          '<button type="button" id="pgen-import-saveuse" class="pro-btn pro-btn-primary">💾 Save &amp; use</button>' +
          '<button type="button" id="pgen-import-add" class="pro-btn">➕ Add to library</button>' +
          '<button type="button" id="pgen-import-load" class="pro-btn pro-btn-ghost">📂 Just load</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(ov);
    importOverlay = ov;

    var fileInput = ov.querySelector("#pgen-import-file");
    var drop = ov.querySelector("#pgen-import-drop");
    var txt = ov.querySelector("#pgen-import-text");
    var nameInput = ov.querySelector("#pgen-import-name");
    var meta = ov.querySelector("#pgen-import-meta");
    var saveUse = ov.querySelector("#pgen-import-saveuse");
    var addLib = ov.querySelector("#pgen-import-add");
    var loadOnly = ov.querySelector("#pgen-import-load");
    var nameTouched = false;

    txt.addEventListener("input", function () { setupPayload = null; detect(); });
    nameInput.addEventListener("input", function () { nameTouched = true; });
    (function () {
      function attach() {
        try {
          if (window.NameRoller) {
            var b = window.NameRoller.addRerollButton(nameInput);
            if (b) b.addEventListener("click", function () { nameTouched = true; });
          }
          else if (window.ensureNameRoller) window.ensureNameRoller(attach);
        } catch (e) {}
      }
      attach();
    })();

    function detect() {
      var text = txt.value;
      var parsed = null;
      try { parsed = (text.trim() && window.t2i_parsePersona) ? window.t2i_parsePersona(text) : null; } catch (e) {}
      var pname = (parsed && parsed.name) || "";
      if (pname && !nameTouched) nameInput.value = pname;
      var secs = (parsed && parsed.sections) ? parsed.sections.length : 0;
      var words = text.trim() ? text.trim().split(/\s+/).length : 0;
      meta.textContent = text.trim()
        ? (words + " words · " + secs + " section" + (secs === 1 ? "" : "s") + " detected" + (pname ? " · name: " + pname : ""))
        : "Nothing yet — choose a file or paste text above.";
      var off = !text.trim();
      saveUse.disabled = addLib.disabled = loadOnly.disabled = off;
    }
    function fill(text, nm, fromCard) {
      txt.value = text;
      nameTouched = false;
      if (nm) nameInput.value = nm;
      detect();
      if (fromCard) toast("📇 read the character card");
    }
    var cardLore = null;
    var setupPayload = null;
    // A setup file stays "fresh" until the text is edited — then the buttons
    // fall back to the plain-text paths below.
    function setupFresh() {
      if (!setupPayload) return null;
      if (txt.value.trim() !== String(setupPayload.description || "").trim()) { setupPayload = null; return null; }
      var s = setupPayload;
      if (nameTouched) { var nn = (nameInput.value || "").trim(); if (nn) s = Object.assign({}, s, { name: nn }); }
      return s;
    }
    async function handleFile(file) {
      if (!file) return;
      var raw = "";
      try { raw = await file.text(); }
      catch (e) {
        try { raw = await new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsText(file); }); } catch (e2) { raw = ""; }
      }
      var text = String(raw == null ? "" : raw);
      var nm = nameFromFilename(file.name);
      if (/\.json$/i.test(file.name || "")) {
        var setup = null;
        try { setup = setupFromJson(JSON.parse(text)); } catch (e) {}
        if (setup) {
          setupPayload = setup; cardLore = null;
          try { var slb = sanitizeLorebook(setup.lorebook || {}); if (slb.entries.length) cardLore = slb; } catch (e) {}
          fill(setup.description, setup.name || nm, false);
          var bits = [];
          if (setup.opts && typeof setup.opts === "object") bits.push("options");
          if (setup.refs.length) bits.push(setup.refs.length + " ref" + (setup.refs.length === 1 ? "" : "s"));
          if (setup.lorebook) bits.push("lorebook");
          if (setup.chat) bits.push("chat-fit");
          if (setup.avatar) bits.push("portrait");
          if (bits.length) meta.textContent += " · 🧩 setup file (" + bits.join(", ") + ") — imports with full fidelity";
          toast("🧩 read the persona setup file");
          return;
        }
        var card = null;
        try { card = cardToDescription(JSON.parse(text)); } catch (e) {}
        if (!card) { toast("⚠️ that JSON isn’t a recognised character card"); return; }
        cardLore = (card.lorebook && card.lorebook.entries && card.lorebook.entries.length) ? card.lorebook : null;
        fill(card.description, card.name || nm, true);
        if (cardLore) toast("📖 +" + cardLore.entries.length + " lorebook entries");
        return;
      }
      if (!text.trim()) { toast("⚠️ that file is empty"); return; }
      fill(text, nm, false);
      toast("📄 loaded " + (file.name || "file"));
    }
    async function record() {
      var text = txt.value.trim();
      if (!text) { toast("⚠️ nothing to import"); return null; }
      return await storeImported({
        id: uid(),
        name: (nameInput.value || "").trim() || "Imported persona",
        description: text,
        thumb: "",
        lorebook: cardLore ? JSON.parse(JSON.stringify(cardLore)) : undefined,
        tone: st.opts.tone, rating: st.opts.rating, language: st.opts.language, depth: st.opts.depth,
        extras: [], opts: snapshotOpts(), ts: Date.now()
      });
    }

    saveUse.addEventListener("click", async function () {
      var s = setupFresh();
      if (s) {
        applySetupPayload(s);
        var recsu = await saveCurrentPersona();
        if (!recsu) return;
        closeImport();
        toast("📥 imported & loaded “" + recsu.name + "” (full setup restored)");
        return;
      }
      var rec = await record();
      if (!rec) return;
      applyImportedPersona(rec);
      closeImport();
      toast("📥 imported & loaded “" + rec.name + "”");
    });
    addLib.addEventListener("click", async function () {
      var s = setupFresh();
      if (s) {
        var nm = (nameInput.value || "").trim() || s.name || "Imported persona";
        var reclib = await storeImported(recordFromSetup(s, nm));
        if (!reclib) return;
        closeImport();
        toast("🗃️ added “" + reclib.name + "” to your saved personas (full setup kept)");
        return;
      }
      var rec = await record();
      if (!rec) return;
      closeImport();
      toast("🗃️ added “" + rec.name + "” to your saved personas");
    });
    loadOnly.addEventListener("click", function () {
      var s = setupFresh();
      if (s) {
        applySetupPayload(s);
        closeImport();
        toast("📂 loaded “" + (s.name || "persona") + "” (full setup) — hit 💾 Save to keep it");
        return;
      }
      var text = txt.value.trim();
      if (!text) { toast("⚠️ nothing to import"); return; }
      var nm = (nameInput.value || "").trim() || "Imported persona";
      applyImportedPersona({ name: nm, description: text, thumb: "", lorebook: cardLore });
      closeImport();
      toast("📂 loaded “" + nm + "” — hit 💾 Save to keep it");
    });

    ov.querySelector("#pgen-import-x").addEventListener("click", closeImport);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) closeImport(); });
    drop.addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () { handleFile(fileInput.files && fileInput.files[0]); });
    drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("on"); });
    drop.addEventListener("dragleave", function () { drop.classList.remove("on"); });
    drop.addEventListener("drop", function (e) {
      e.preventDefault(); drop.classList.remove("on");
      var dt = e.dataTransfer;
      if (dt && dt.files && dt.files[0]) handleFile(dt.files[0]);
      else if (dt) { var t = dt.getData("text"); if (t) fill(t, "", false); }
    });

    importEsc = function (e) { if (e.key === "Escape") { e.stopPropagation(); closeImport(); } };
    document.addEventListener("keydown", importEsc, true);

    detect();
    setTimeout(function () { try { txt.focus(); } catch (e) {} }, 30);
  }

  function loadSavedPersona(id) {
    var p = (saved.list || []).filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    // Full-setup restore (same fidelity as a 🧩 setup-file import): the top
    // 🎛️ Character options, reference images, lorebook, portrait and chat-fit
    // all come back — not just the name + description text.
    try {
      if (p.opts && typeof p.opts === "object") { st.opts = sanitizePresetOpts(p.opts); }
      else if (p.tone !== undefined || p.rating !== undefined || p.language !== undefined || p.depth !== undefined || p.extras !== undefined) {
        st.opts = sanitizePresetOpts({ tone: p.tone, toneMix: p.toneMix, rating: p.rating, language: p.language, depth: p.depth, extras: p.extras });
      }
      try { enforceToneLockOnOpts(); } catch (e2) {}
      saveOpts();
    } catch (e) {}
    try {
      if (Array.isArray(p.refs)) {
        st.refs = p.refs.filter(function (r) { return r && (r.url || r.prompt); }).map(function (r) {
          return { id: uid(), url: r.url || "", kind: r.kind || "", poster: r.poster || "", prompt: r.prompt || "", title: r.title || "", folder: "", use: r.use !== false, primary: !!r.primary };
        });
        if (st.refs.length && !st.refs.some(function (r) { return r.primary; })) st.refs[0].primary = true;
        saveRefs();
      }
    } catch (e) {}
    try {
      if (Object.prototype.hasOwnProperty.call(p, "lorebook")) { st.lore = sanitizeLorebook(p.lorebook || {}); loreSave(); }
    } catch (e) {}
    var nameEl = $("pgen-name"), descEl = $("pgen-desc");
    if (nameEl) nameEl.value = p.name || "";
    if (descEl) descEl.value = p.description || "";
    st.persona = { name: p.name || "", description: p.description || "", sections: parseSections(p.description || "") };
    st.activeId = p.id;
    st.portrait = p.thumb || null;
    st.portraitKind = p.thumbKind || AMKind(p.thumb);
    st.portraitPoster = p.thumbPoster || "";
    applyChatState(p.chat);
    try { buildOptionControls(); syncOptionInputs(); } catch (e) {}
    try { renderRefs(); } catch (e) {}
    try { loreRender(); } catch (e) {}
    try { pgenExpandCard("character"); } catch (e) {}
    renderPortrait(); refreshSections(); updateWordCount(); saveLast();
    renderSaved();
    toast("📂 loaded “" + (p.name || "persona") + "” (full setup restored)");
  }

  // Switch the editor to a saved persona (id) or to the unsaved working copy ("")
  // — offering to re-save the active persona first if it has unsaved edits.
  async function switchToPersona(id) {
    if (id === (st.activeId || "")) return;
    var p = activeRecord();
    if (p && isActiveDirty()) {
      if (await window.uiConfirm("You have unsaved changes to “" + (p.name || "Untitled") + "”.\n\nOK = save them, then switch\nCancel = switch and discard them", { okText: 'Save & switch' })) {
        await saveCurrentPersona(true);
      }
    }
    if (!id) {
      st.activeId = null;
      saveLast();
      renderSaved();
      toast("🆕 editing an unsaved copy — 💾 Save to add it to your personas");
      return;
    }
    loadSavedPersona(id);
  }

  function renderSavedSwitch() {
    var sel = $("pgen-saved-switch");
    if (!sel) return;
    var list = saved.list || [];
    var html = '<option value="">🆕 Unsaved character</option>';
    list.forEach(function (p) {
      html += '<option value="' + esc(p.id) + '">' + esc(p.name || "Untitled") + (p.id === st.activeId ? "  ●" : "") + "</option>";
    });
    sel.innerHTML = html;
    sel.value = (st.activeId && list.some(function (p) { return p.id === st.activeId; })) ? st.activeId : "";
    sel.disabled = !list.length;
  }

  function renderSaved() {
    var host = $("pgen-saved");
    if (!host) return;
    var list = saved.list || [];
    var badge = $("pgen-saved-count");
    if (badge) badge.textContent = String(list.length);
    renderSavedSwitch();
    updateSaveButton();
    host.innerHTML = "";
    if (!list.length) {
      host.innerHTML = '<div class="pgen-empty">No saved personas yet. Build a character, then hit <b>💾 Save current persona</b> — it is kept in this browser and survives reloads. Tick two or more to 🧬 combine them.</div>';
      renderCombinePanel();
      return;
    }
    list.forEach(function (p) {
      var isActive = p.id === st.activeId;
      var row = document.createElement("div");
      row.className = "pgen-saved-item" + (saved.sel[p.id] ? " pgen-saved-on" : "") + (isActive ? " pgen-saved-active" : "");
      row.dataset.id = p.id;
      row.innerHTML =
        '<label class="pgen-saved-pick" title="Select for combining"><input type="checkbox"' + (saved.sel[p.id] ? " checked" : "") + "></label>" +
        (p.thumb ? AMThumb(p.thumb, "pgen-saved-thumb", p.thumbKind, p.thumbPoster) : '<div class="pgen-saved-thumb pgen-saved-ph">🧑</div>') +
        '<div class="pgen-saved-main" title="Load this persona into the editor"><div class="pgen-saved-name" title="' + esc(p.name || "Untitled") + '">' + (isActive ? "● " : "") + esc(p.name || "Untitled") + "</div>" +
          '<div class="pgen-saved-meta"><span class="pgen-saved-chunk">' + savedWords(p.description) + " words</span> · " + '<span class="pgen-saved-chunk">' + esc(new Date(p.ts || Date.now()).toLocaleDateString()) + "</span>" + ((p.lorebook && p.lorebook.entries && p.lorebook.entries.length) ? ' · <span class="pgen-saved-chunk">📖&nbsp;' + p.lorebook.entries.length + "</span>" : "") + "</div></div>" +
        '<div class="pgen-saved-acts">' +
          '<button type="button" class="pgen-saved-btn" data-act="load" title="' + (isActive ? "Reload from the saved copy" : "Load into the editor") + '">' + (isActive ? "📖" : "📂") + "</button>" +
          (isActive ? '<button type="button" class="pgen-saved-btn" data-act="save" title="Save the current edits back into this persona">💾</button>' : "") +
          '<button type="button" class="pgen-saved-btn" data-act="rename" title="Rename">✏️</button>' +
          '<button type="button" class="pgen-saved-btn" data-act="export" title="Export: Markdown, re-uploadable setup JSON, or Tavern card (portrait, refs and lorebook link included)">⬇️</button>' +
          '<button type="button" class="pgen-saved-btn" data-act="del" title="Delete">🗑️</button>' +
        "</div>";
      row.querySelector('input[type="checkbox"]').addEventListener("change", function () {
        if (this.checked) saved.sel[p.id] = true; else delete saved.sel[p.id];
        renderSaved();
      });
      row.querySelector(".pgen-saved-main").addEventListener("click", function () {
        if (p.id !== st.activeId) switchToPersona(p.id);
      });
      if (p.thumb) row.querySelector(".pgen-saved-thumb").addEventListener("click", function () {
        if (p.id !== st.activeId) switchToPersona(p.id);
      });
      row.querySelector('[data-act=load]').addEventListener("click", function () {
        if (p.id === st.activeId) loadSavedPersona(p.id);
        else switchToPersona(p.id);
      });
      var saveAct = row.querySelector('[data-act=save]');
      if (saveAct) saveAct.addEventListener("click", function () { saveCurrentPersona(); });
      row.querySelector('[data-act=rename]').addEventListener("click", async function () {
        var v = window.prompt("Rename saved persona:", p.name || "");
        if (v === null) return;
        v = String(v).trim();
        if (!v) return;
        p.name = v;
        await persistSaved(); renderSaved();
      });
      row.querySelector('[data-act=export]').addEventListener("click", function () { openSavedExportMenu(p, this); });
      row.querySelector('[data-act=del]').addEventListener("click", async function () {
        if (!(await window.uiConfirm("Delete saved persona “" + (p.name || "Untitled") + "”? This cannot be undone.", { okText: 'Delete', danger: true }))) return;
        saved.list = (saved.list || []).filter(function (x) { return x.id !== p.id; });
        delete saved.sel[p.id];
        if (st.activeId === p.id) st.activeId = null;
        await persistSaved(); saveLast(); renderSaved();
      });
      host.appendChild(row);
    });
    renderCombinePanel();
    try { refreshRefSelect(); } catch (e) {}
  }

  function combineDefaults() {
    var sel = selectedSaved();
    var ex = window.t2i_combineDefaultExampleCount ? window.t2i_combineDefaultExampleCount(sel) : 10;
    var rank = { sfw: 0, suggestive: 1, mature: 2, explicit: 3 };
    var r = "sfw";
    sel.forEach(function (p) { if ((rank[p.rating] || 0) > (rank[r] || 0)) r = p.rating; });
    return { exampleCount: ex, rating: r };
  }

  function renderCombinePanel() {
    var host = $("pgen-combine");
    if (!host) return;
    var sel = selectedSaved();
    if (sel.length < 2) { host.hidden = true; host.innerHTML = ""; return; }
    host.hidden = false;
    var d = combineDefaults();
    host.innerHTML =
      '<div class="pgen-combine-head">🧬 Combine into one character</div>' +
      '<div class="pgen-combine-names">' + sel.map(function (p) { return esc(p.name || "Untitled"); }).join(" + ") + "</div>" +
      '<div class="pgen-row2">' +
        '<label class="pro-opt">New name (optional)<input id="pgen-combine-name" class="pro-input" placeholder="blank = the AI invents one"></label>' +
        '<label class="pro-opt">Roleplay examples<select id="pgen-combine-examples" class="pro-select"></select></label>' +
        '<label class="pro-opt">Rating<select id="pgen-combine-rating" class="pro-select"></select></label>' +
      "</div>" +
      '<label class="pro-opt pgen-full">What the fusion should emphasize (optional)<textarea id="pgen-combine-instr" class="pro-textarea pgen-short" placeholder="e.g. keep the first one\u2019s ruthless competence, but let the other\u2019s warmth soften them around {{user}}"></textarea></label>' +
      '<div class="pro-actions">' +
        '<button type="button" id="pgen-combine-go" class="pro-btn pro-btn-primary">🧬 Combine ' + sel.length + " personas</button>" +
        '<button type="button" id="pgen-combine-stop" class="pro-btn" hidden>⏹ Stop</button>' +
        '<button type="button" id="pgen-combine-clear" class="pro-btn pro-btn-ghost">✖ clear selection</button>' +
      "</div>" +
      '<div id="pgen-combine-progress" class="pgen-progress" hidden><div class="pgen-bar"><span id="pgen-combine-bar-fill"></span></div><div class="pgen-progress-text" id="pgen-combine-progress-text"></div></div>';
    fillSelect($("pgen-combine-examples"), [
      { id: "4", label: "4 examples" }, { id: "6", label: "6 examples" }, { id: "8", label: "8 examples" },
      { id: "10", label: "10 examples" }, { id: "12", label: "12 examples" }, { id: "16", label: "16 examples" }, { id: "20", label: "20 examples" }
    ], String(d.exampleCount));
    fillSelect($("pgen-combine-rating"), options().ratings, d.rating);
    $("pgen-combine-go").addEventListener("click", runCombineSelection);
    $("pgen-combine-stop").addEventListener("click", stopCombine);
    $("pgen-combine-clear").addEventListener("click", function () { saved.sel = {}; renderSaved(); });
  }

  function combineBusy(b) {
    var go = $("pgen-combine-go"), stop = $("pgen-combine-stop"), prog = $("pgen-combine-progress");
    if (go) { go.disabled = b; }
    if (stop) stop.hidden = !b;
    if (prog) prog.hidden = !b;
  }
  function stopCombine() {
    if (combineObj && combineObj.stop) { try { combineObj.stop(); } catch (e) {} }
    combineObj = null;
    combineBusy(false);
  }

  async function runCombineSelection() {
    if (combineObj || genObj) { toast("⏹ finish the current generation first"); return; }
    if (secBusy || bulkActive) { toast("⏳ finish adding sections first"); return; }
    if (!window.t2i_combinePersonas) { toast("⚠️ persona engine not loaded"); return; }
    var sel = selectedSaved();
    if (sel.length < 2) { toast("⚠️ pick at least two saved personas"); return; }
    var sources = sel.map(function (p) { return { name: p.name || "", description: p.description || "" }; });
    var opts = {
      name: ($("pgen-combine-name") || {}).value || "",
      exampleCount: parseInt(($("pgen-combine-examples") || {}).value, 10) || 10,
      rating: ($("pgen-combine-rating") || {}).value || "sfw",
      language: st.opts.language || "English",
      depth: st.opts.depth || "balanced",
      instruction: ($("pgen-combine-instr") || {}).value || "",
      onProgress: function (p) {
        var fill = $("pgen-combine-bar-fill"), txt = $("pgen-combine-progress-text");
        if (p && p.done) {
          if (fill) fill.style.width = "100%";
          if (txt) txt.textContent = "finishing…";
          return;
        }
        var pct = Math.round(((p.index - 1) / p.total) * 100);
        if (fill) fill.style.width = pct + "%";
        if (txt) txt.textContent = "part " + p.index + "/" + p.total + " · " + (p.label || "") + (p.retry ? " (retry)" : "") + "…";
      },
      onUpdate: applyPersona
    };
    var nameEl = $("pgen-name"), descEl = $("pgen-desc");
    if (nameEl) nameEl.value = "";
    if (descEl) descEl.value = "";
    st.persona = { name: "", description: "", sections: [] };
    st.activeId = null;
    // A fusion is a brand-new character too: don't carry the previous
    // character's lorebook + chat-fit into it.
    try { st.lore = sanitizeLorebook({}); loreSave(); } catch (e) {}
    try { applyChatState(null); } catch (e) {}
    try { loreRender(); } catch (e) {}
    refreshSections();
    combineBusy(true);
    try { combineObj = window.t2i_combinePersonas(sources, opts); }
    catch (e) {
      console.error(e);
      toast("⚠️ " + (e && e.message ? e.message : "combine failed"));
      combineObj = null; combineBusy(false); return;
    }
    try { await combineObj; } catch (e) { console.warn(e); }
    combineObj = null; combineBusy(false);
    refreshSections(); updateWordCount(); saveLast();
    if (descEl && !descEl.value.trim()) toast("⚠️ the AI returned nothing — try again or change the picks");
    else toast("🧬 fused into one character — review it, then 💾 save");
  }

  /* ---------------------------------- 🧬 build-from-saved (fused section) */
  // Fused into 🎛️ Character options as a "Starting point" switch: fresh, or
  // grow a NEW character out of a saved one (reference + direction + optional
  // connection + starter idea). Generation reuses the live Character options
  // (stOpts()) plus the reference block below, and streams into the normal
  // The character editor just like Generate does — one button, one progress bar.
  var LS_REFCARD = "t2iPersonaRefCardV1";
  var REF_LINKS = [
    { id: "", label: "— none, just the direction —" },
    { id: "sibling", label: "🩸 Their sibling" },
    { id: "child", label: "🌱 Their child" },
    { id: "apprentice", label: "📖 Their apprentice" },
    { id: "friend", label: "🤝 Their best friend" },
    { id: "lover", label: "💞 Their lover / ex" },
    { id: "rival", label: "⚔️ Their rival" },
    { id: "enemy", label: "🔥 Their sworn enemy" },
    { id: "hunter", label: "🎯 Hunting them (or hunted by them)" },
    { id: "mirror", label: "🪞 Their mirror / opposite" },
    { id: "fan", label: "⭐ Their admirer" },
    { id: "debtor", label: "💸 Owes them everything" }
  ];
  function refCardState() {
    var s = { who: "", mode: "with", link: "", starter: "", on: false };
    try {
      var o = JSON.parse(localStorage.getItem(LS_REFCARD) || "null");
      if (o && typeof o === "object") {
        if (typeof o.who === "string") s.who = o.who;
        if (o.mode === "against") s.mode = "against";
        if (typeof o.link === "string") s.link = o.link;
        if (typeof o.starter === "string") s.starter = o.starter;
        if (o.on === true) s.on = true;
      }
    } catch (e) {}
    return s;
  }
  var refCard = refCardState();
  function refCardSave() { try { localStorage.setItem(LS_REFCARD, JSON.stringify(refCard)); } catch (e) {} }
  // ---- fused mode: Build-from-saved now lives inside 🎛️ Character options ----
  // `on` = the "From saved" starting point is active. The single ✨/🧬 Generate
  // button then runs the reference build; otherwise it runs a fresh build.
  function isRefMode() { return !!refCard.on; }
  function paintRefMode() {
    var fresh = $("pgen-src-fresh"), from = $("pgen-src-saved"), block = $("pgen-ref-block");
    var on = isRefMode();
    if (fresh) { fresh.classList.toggle("on", !on); fresh.setAttribute("aria-pressed", !on ? "true" : "false"); }
    if (from) { from.classList.toggle("on", on); from.setAttribute("aria-pressed", on ? "true" : "false"); }
    if (block) block.hidden = !on;
    updateGenLabel();
  }
  function setRefMode(on) {
    refCard.on = !!on;
    refCardSave();
    paintRefMode();
    renderRefPreview();
  }
  // Single Generate button label: fresh vs fused reference build.
  function updateGenLabel() {
    var gen = $("pgen-gen");
    if (!gen || gen.disabled) return;
    if (isRefMode()) {
      var r = refSelected();
      gen.textContent = r ? "🧬 Build from \u201c" + String(r.name || "Untitled").slice(0, 24) + "\u201d" : "🧬 Build from saved";
    } else {
      gen.textContent = "✨ Generate persona";
    }
  }
  function refSavedList() { return (saved.list || []).slice(); }
  function refSelected() {
    var list = refSavedList();
    for (var i = 0; i < list.length; i++) if (list[i].id === refCard.who) return list[i];
    return null;
  }
  function refModeLine() {
    return refCard.mode === "against" ? "⚔️ Against them — rival / opposite" : "🌱 Off of them — ally / inspired by";
  }
  function refLinkLabel(id) {
    for (var i = 0; i < REF_LINKS.length; i++) if (REF_LINKS[i].id === id) return REF_LINKS[i].label;
    return "";
  }
  function refLinkLine(id, refName) {
    var R = "\u201c" + (refName || "the reference") + "\u201d";
    switch (id) {
      case "sibling": return "The new character is " + R + "'s sibling — same blood, different person.";
      case "child": return "The new character is " + R + "'s child, living in the shadow (or the light) of their parent.";
      case "apprentice": return "The new character was trained / mentored by " + R + ", for better or worse.";
      case "friend": return "The new character is " + R + "'s closest friend — the one who knows them best.";
      case "lover": return "The new character is " + R + "'s lover or ex — the romance (past or present) defines them both.";
      case "rival": return "The new character is " + R + "'s rival — evenly matched, each made sharper by the other.";
      case "enemy": return "The new character is " + R + "'s sworn enemy — the conflict between them is personal.";
      case "hunter": return "The new character is hunting " + R + " (or is hunted by them) — predator and prey, and it is unclear which is which.";
      case "mirror": return "The new character is " + R + "'s mirror and opposite — same mold, inverted values.";
      case "fan": return "The new character idolizes " + R + " from afar — and wants to become them, or be noticed by them.";
      case "debtor": return "The new character owes " + R + " everything — a debt that shapes every choice they make.";
      default: return "";
    }
  }
  function buildRefBlock(ref, mode, linkLine, starter) {
    var name = ref.name || "the reference character";
    var desc = String(ref.description || "").trim();
    if (desc.length > 8000) desc = desc.slice(0, 8000).trim() + "\n[reference truncated for length]";
    var dir = mode === "against"
      ? "Build AGAINST them — the new character is their rival, foil or opposite. Contrast and oppose the reference: different temperament, clashing wants, a history that puts them at odds. Let the tension between them drive the new character's goals, fears and relationship sections."
      : "Build OFF OF them — the new character is their ally, kin or inheritor, inspired by them. They share the same world and continuity; the new character complements the reference, with a bond (loyalty, debt, blood, admiration) that shows in backstory and relationships.";
    var out = [
      "REFERENCE CHARACTER (read first — do NOT rewrite them):",
      "Name: " + name,
      desc,
      "",
      "NEW CHARACTER TASK: invent a brand-new, separate person — never the same individual, never a copy with the name filed off.",
      dir
    ];
    if (linkLine) out.push("Connection: " + linkLine);
    out.push("Starter idea: " + (String(starter || "").trim() || "(none — invent freely, but honour the direction and connection above)"));
    out.push("RULES: give the new character their own name, voice and history. Same world and continuity as the reference unless the starter says otherwise. Make the relationship above concrete in the backstory, relationship and opening sections. Never lift whole passages from the reference.");
    return out.join("\n");
  }
  function renderRefPreview() {
    var host = $("pgen-ref-preview");
    if (!host) return;
    var list = refSavedList();
    if (saved.list === null) { host.textContent = "Loading saved personas…"; }
    else if (!list.length) { host.innerHTML = "No saved personas yet — build a character, hit <b>💾 Save current persona</b>, then come back here."; }
    else {
      var ref = refSelected();
      if (!ref) { host.textContent = "Pick a reference persona above."; }
      else {
        var bits = "<b>" + esc(ref.name || "Untitled") + "</b> · " + savedWords(ref.description || "") + " words · " + esc(refModeLine());
        var ll = refLinkLabel(refCard.link);
        if (refCard.link && ll) bits += " · " + esc(ll.replace(/^[^A-Za-z0-9]+/, ""));
        var st0 = String(refCard.starter || "").trim();
        bits += st0 ? "<br>💡 " + esc(st0.length > 160 ? st0.slice(0, 160) + "…" : st0) : "<br><span style=\"opacity:.6\">no starter idea yet — invent freely, but keep the direction above</span>";
        host.innerHTML = bits;
      }
    }
    // Fused: the single Generate button carries the reference name.
    updateGenLabel();
  }
  function refreshRefSelect() {
    var sel = $("pgen-ref-who");
    if (!sel) return;
    var list = refSavedList();
    if (!list.length) {
      sel.innerHTML = '<option value="">— no saved personas yet —</option>';
      sel.disabled = true;
    } else {
      var html = "";
      list.forEach(function (p) { html += '<option value="' + esc(p.id) + '">' + esc(p.name || "Untitled") + "</option>"; });
      sel.innerHTML = html;
      sel.disabled = false;
      if (refSelected()) sel.value = refCard.who;
      else { refCard.who = list[0].id; refCardSave(); sel.value = refCard.who; }
    }
    renderRefPreview();
  }
  async function runRefGenerate() {
    // Fused path: shares genObj + the single progress bar with ✨ Generate,
    // so every existing guard (sections, combine, bulk) covers it.
    if (genObj || combineObj) { toast("⏹ finish the current generation first"); return; }
    if (secBusy || bulkActive) { toast("⏳ finish adding sections first"); return; }
    if (!window.t2i_runPersonaGeneration) { toast("⚠️ persona engine not loaded yet"); return; }
    var ref = refSelected();
    if (!ref || !String(ref.description || "").trim()) { toast("⚠️ pick a saved persona with text first"); return; }
    syncOptsFromUI();
    var block = buildRefBlock(ref, refCard.mode, refLinkLine(refCard.link, ref.name || "Untitled"), refCard.starter);
    var opts = stOpts();
    opts.instruction = (opts.instruction ? opts.instruction + "\n\n" : "") + block;
    var nameEl = $("pgen-name"), descEl = $("pgen-desc");
    if (nameEl) nameEl.value = "";
    if (descEl) descEl.value = "";
    st.persona = { name: "", description: "", sections: [] };
    st.activeId = null;
    // A reference build starts a brand-new character too: drop the previous
    // character's lorebook + chat-fit so nothing lingers into the new one.
    try { st.lore = sanitizeLorebook({}); loreSave(); } catch (e) {}
    try { applyChatState(null); } catch (e) {}
    try { loreRender(); } catch (e) {}
    try { pgenExpandCard("character"); } catch (e) {}
    refreshSections();
    setBusy(true);
    try {
      genObj = window.t2i_runPersonaGeneration(Object.assign({}, opts, {
        onProgress: function (p) {
          var fill = $("pgen-bar-fill"), txt = $("pgen-progress-text");
          if (p && p.done) {
            if (fill) fill.style.width = "100%";
            if (txt) txt.textContent = "finishing…";
            return;
          }
          var pct = Math.round(((p.index - 1) / p.total) * 100);
          if (fill) fill.style.width = pct + "%";
          if (txt) txt.textContent = "part " + p.index + "/" + p.total + " · " + (p.label || "") + (p.retry ? " (retry)" : "") + "…";
        },
        onUpdate: applyPersona
      }));
    } catch (e) {
      console.error(e);
      toast("⚠️ " + (e && e.message ? e.message : "generation failed"));
      genObj = null; setBusy(false); return;
    }
    try { await genObj; } catch (e) { console.warn(e); }
    genObj = null; setBusy(false);
    refreshSections(); updateWordCount(); saveLast(); renderSaved();
    try {
      await ensureExtras();
      if (window.t2i_autosavePersonaPrompt) {
        await window.t2i_autosavePersonaPrompt({
          source: "persona",
          imagePrompt: opts.imagePrompt,
          instruction: opts.instruction,
          tone: opts.tone,
          name: (nameEl && nameEl.value) || "",
          description: (descEl && descEl.value) || ""
        });
      }
    } catch (e) {}
    if (!$("pgen-desc").value.trim()) toast("⚠️ the AI returned nothing — try again");
    else toast("✅ new character ready — review it, then 💾 save");
  }
  /* ---------------------------------------------------------------- build */
  function build() {
    APP = $("persona-app");
    if (!APP || built) return;
    built = true;
    APP.innerHTML =
      '<div class="pgen-hero">' +
        '<div class="pgen-title">🧑 Persona Generator</div>' +
        '<p class="pgen-sub">Build a deep, roleplay-ready character — from one of your gallery images (with the prompt that made it), from several at once, or entirely from scratch. Every setting is optional; the more you give it, the more it can surprise you.</p>' +
      "</div>" +
      '<div class="pgen-layout">' +
        '<div class="pgen-left">' +
          '<div class="pro-card" data-pcollapse="refs">' +
            '<div class="pro-card-head">🖼️ Reference image(s) <span class="pro-badge" id="pgen-refcount">0</span><span class="pgen-head-hint">the AI writes the character from these prompts</span><span class="pgen-chev" aria-hidden="true">▸</span></div>' +
            '<div id="pgen-starter" class="pgen-starter" hidden></div>' +
            '<div id="pgen-refs" class="pgen-refs"></div>' +
            '<div id="pgen-ref-empty" class="pgen-empty">No references yet. Import images from your gallery (their prompts come along automatically), add a prompt by hand, or upload a picture for the AI to describe — or leave it empty and invent someone from scratch.</div>' +
            '<div class="pro-row">' +
              '<button type="button" id="pgen-import" class="pro-btn pro-btn-primary">🖼️ Import from gallery</button>' +
              '<button type="button" id="pgen-upload" class="pro-btn pro-btn-ghost">⬆️ Upload &amp; describe</button>' +
              '<button type="button" id="pgen-addprompt" class="pro-btn pro-btn-ghost">➕ Add a prompt</button>' +
              '<button type="button" id="pgen-clearrefs" class="pro-btn pro-btn-ghost">🗑️ Clear refs</button>' +
            "</div>" +
          "</div>" +
          '<div class="pro-card" data-pcollapse="options">' +
            '<div class="pro-card-head">🎛️ Character options <span class="pgen-head-hint">shape who the AI invents</span><span class="pgen-chev" aria-hidden="true">▸</span></div>' +
            '<div class="pgen-subhead">Starting point <span class="pgen-head-hint">fresh, or grow from someone you saved</span></div>' +
            '<div class="pgen-source-toggle" role="radiogroup" aria-label="Starting point">' +
              '<button type="button" id="pgen-src-fresh" class="pro-btn" aria-pressed="true">✨ Fresh character</button>' +
              '<button type="button" id="pgen-src-saved" class="pro-btn" aria-pressed="false">🧬 From saved persona</button>' +
            '</div>' +
            '<div id="pgen-ref-block" hidden>' +
              '<div class="pgen-hint" style="border-top:none; padding-top:0; margin-top:0.35rem;">Pick someone from 🗃️ Saved personas — the AI reads their full character, then invents a brand-new person either <b>off of</b> them (ally, kin, inspired by) or <b>against</b> them (rival, foil, opposite). Everything below still applies.</div>' +
              '<label class="pro-opt pgen-full">Reference persona<select id="pgen-ref-who" class="pro-select"></select></label>' +
              '<div id="pgen-ref-preview" class="pgen-empty">Loading saved personas…</div>' +
              '<div class="pgen-row2">' +
                '<label class="pro-opt">Build direction<select id="pgen-ref-mode" class="pro-select"><option value="with">🌱 Off of them — ally / inspired by</option><option value="against">⚔️ Against them — rival / opposite</option></select></label>' +
                '<label class="pro-opt">Connection (optional)<select id="pgen-ref-link" class="pro-select"></select></label>' +
              '</div>' +
              '<label class="pro-opt pgen-full">Starter idea for the new character<textarea id="pgen-ref-starter" class="pro-textarea" placeholder="e.g. their estranged younger sibling, trying to live up to them — but with a temper"></textarea></label>' +
            '</div>' +
            '<div class="pgen-row2">' +
              '<label class="pro-opt">Name (optional — locks it)<input id="pgen-oname" class="pro-input" placeholder="blank = let the AI name them"></label>' +
              '<div class="pro-opt"><span>Age (optional — locks it)</span><input id="pgen-oage" class="pro-input" placeholder="type age, e.g. 27" inputmode="text" autocomplete="off"><label class="pgen-check" title="Use when no age is typed — keeps their age deliberately hard to place" style="font-size:0.78rem; font-weight:400;"><input type="checkbox" id="pgen-oage-amb"> ambiguous age</label></div>' +
            "</div>" +
            '<div class="pro-opts" id="pgen-opts"></div>' +
            '<div class="pgen-row2">' +
              '<label class="pro-opt">Genre / setting<select id="pgen-ogenre" class="pro-select"></select><input id="pgen-ogenrecustom" class="pro-input" placeholder="e.g. cozy necromancy diner…" hidden></label>' +
              '<label class="pro-opt">Genre / setting mix<select id="pgen-ogenremix" class="pro-select"></select><input id="pgen-ogenremixcustom" class="pro-input" placeholder="e.g. space pirates…" hidden></label>' +
              '<label class="pro-opt">Merge style<select id="pgen-omerge" class="pro-select"></select></label>' +
              '<label class="pro-opt">Pronouns (optional)<input id="pgen-opronouns" class="pro-input" placeholder="she/her, they/them…"></label>' +
            "</div>" +
            '<label class="pro-opt pgen-full">Relationship described in your own words (optional)<input id="pgen-orelation-custom" class="pro-input" placeholder="e.g. the rival who secretly funds their research"></label>' +
            '<label class="pro-opt pgen-full">Things to avoid<textarea id="pgen-oavoid" class="pro-textarea pgen-short" placeholder="e.g. no amnesia, no chosen-one prophecy, don\'t make them royalty"></textarea></label>' +
            '<div class="pgen-subhead">Extra sections <span class="pgen-head-hint">optional deeper dives (each adds a little more writing time)</span></div>' +
            '<div id="pgen-extras" class="pgen-checks"></div>' +
            '<label class="pro-opt pgen-full">Extra instructions<textarea id="pgen-oinstruction" class="pro-textarea" placeholder="Anything else the character must satisfy — personality, looks, backstory, speech, secrets, relationships…"></textarea></label>' +
            '<div class="pgen-subhead">🌱 Depth seeds <span class="pgen-head-hint">optional — small contradictions and pressures that make them feel like a person; every section tool reads these too</span></div>' +
            '<div class="pgen-row2">' +
              '<label class="pro-opt">Fatal flaw<input id="pgen-oflaw" class="pro-input" placeholder="e.g. can\'t admit they\'re wrong, even when it costs them"></label>' +
              '<label class="pro-opt">Contradiction<input id="pgen-ocontradiction" class="pro-input" placeholder="e.g. fearless in a fight, terrified of phone calls"></label>' +
            "</div>" +
            '<div class="pgen-row2">' +
              '<label class="pro-opt">What they want<input id="pgen-owant" class="pro-input" placeholder="e.g. to win the championship"></label>' +
              '<label class="pro-opt">What they really need<input id="pgen-oneed" class="pro-input" placeholder="e.g. to let someone take care of them"></label>' +
            "</div>" +
            '<div class="pgen-row2">' +
              '<label class="pro-opt">Secret they\'re hiding<input id="pgen-osecret" class="pro-input" placeholder="e.g. they forged the letter that got them hired"></label>' +
              '<label class="pro-opt">Hiding it from<input id="pgen-osecretfrom" class="pro-input" placeholder="e.g. their younger sister"></label>' +
            "</div>" +
            '<label class="pro-opt pgen-full">Pressure / what\'s at stake<input id="pgen-opressure" class="pro-input" placeholder="e.g. the inn is three missed payments from closing"></label>' +
            '<div class="pgen-wild"><span class="pgen-wild-lb">🎲 Wild spark</span><span id="pgen-owild-text" class="pgen-wild-text"></span><button type="button" id="pgen-owild-roll" class="pro-btn" title="Roll a random contradictory spark into the brief">🎲 Roll</button><button type="button" id="pgen-owild-clear" class="pro-btn" title="Remove the wild spark">✖</button></div>' +
            '<div class="pgen-row2" id="pgen-bottomopts"></div>' +
            '<div class="pro-actions">' +
              '<button type="button" id="pgen-gen" class="pro-btn pro-btn-primary">✨ Generate persona</button>' +
              '<button type="button" id="pgen-stop" class="pro-btn" hidden>⏹ Stop</button>' +
              '<button type="button" id="pgen-random" class="pro-btn" title="Fill every option with a random combination">🎲 Surprise me</button>' +
              '<button type="button" id="pgen-reset" class="pro-btn" title="Clear everything you changed, added or typed in the options above — back to defaults">↺ Reset</button>' +
              '<button type="button" id="pgen-presets" class="pro-btn" title="Save, load, import or export named sets of options">💾 Presets</button>' +
            "</div>" +
           '<div id="pgen-progress" class="pgen-progress" hidden><div class="pgen-bar"><span id="pgen-bar-fill"></span></div><div class="pgen-progress-text" id="pgen-progress-text"></div></div>' +
          "</div>" +
        "</div>" +
        '<div class="pgen-right">' +
          '<div class="pro-card" data-pcollapse="character">' +
            '<div class="pro-card-head">📝 The character <span class="pro-badge" id="pgen-words"></span><span class="pgen-chev" aria-hidden="true">▸</span></div>' +
            '<input id="pgen-name" class="pro-input pgen-name" placeholder="Character name">' +
            '<textarea id="pgen-desc" class="pro-textarea pgen-desc" placeholder="Click ✨ Generate persona — the description streams in here and stays editable. Use the 🧩 section tools below to copy, rewrite, add to or delete just one part."></textarea>' +
            '<div id="pgen-portrait-preview" class="pgen-portrait" hidden></div>' +
            '<div class="pro-actions pgen-actions">' +
              '<button type="button" id="pgen-chat" class="pro-btn pro-btn-primary" title="Open this character in the chat generator">💬 Chat with them</button>' +
              '<button type="button" id="pgen-portrait" class="pro-btn" title="Set the avatar: generate an image, pick from the gallery, or upload one">🎨 Portrait</button>' +
              '<button type="button" id="pgen-vault" class="pro-btn">📚 Vault</button>' +
              '<button type="button" id="pgen-roster" class="pro-btn">🧑 Roster</button>' +
              '<button type="button" id="pgen-copy" class="pro-btn">📋 Copy</button>' +
              '<button type="button" id="pgen-dupcheck" class="pro-btn" title="Scan every section for repeated information — shows overlapping sections in a sideways-scrolling pop-up">🔍 Duplicates</button>' +
              '<button type="button" id="pgen-export" class="pro-btn">📄 Export</button>' +
              '<button type="button" id="pgen-tavern" class="pro-btn" title="Download a TavernAI-compatible character card (.json) — upload it on as-social, SillyTavern or any Tavern-style chat">📤 Tavern .json</button>' +
              '<button type="button" id="pgen-history" class="pro-btn">📋 Prompt history</button>' +
              '<button type="button" id="pgen-share" class="pro-btn">🔗 Share setup</button>' +
            "</div>" +
          "</div>" +
          '<div class="pro-card" data-pcollapse="sections">' +
            '<div class="pro-card-head">🧩 Section tools <span class="pgen-head-hint">copy, rewrite, delete, ↑↓ reorder (top survives chat cuts), ⋯ deeper tools — or press & hold a section 1s to highlight it & jump to it in the character</span><span class="pgen-chev" aria-hidden="true">▸</span></div>' +
            '<div class="pgen-addsec">' +
              '<button type="button" id="pgen-addsec-open" class="pro-btn" title="Tick one or more sections and generate them in one go">➕ Add sections…</button>' +
              '<input id="pgen-addsec-custom" class="pro-input" placeholder="…or type a custom heading and press Enter">' +
              '<button type="button" id="pgen-addsec-go" class="pro-btn" title="Generate every ticked section in turn">➕ Add &amp; generate</button>' +
            '</div>' +
            '<div class="pgen-starter">' +
              '<label for="pgen-sec-starter" title="Optional extra direction the AI must follow when writing the added section(s) — leave blank for none">✍️ Prompt starter</label>' +
              '<input id="pgen-sec-starter" class="pro-input" placeholder="optional — steer the added section(s), e.g. keep it secretly tragic; she never admits her feelings">' +
            '</div>' +
            '<div class="pgen-addsec-sum" id="pgen-addsec-sum"></div>' +
            '<div id="pgen-sections" class="pgen-sections"><div class="pgen-empty">Generate a character and its sections will be listed here.</div></div>' +
          "</div>" +
          '<div class="pro-card" data-pcollapse="lore">' +
            '<div class="pro-card-head">📖 Lorebook <span class="pro-badge" id="pgen-lore-count">0</span><span class="pgen-head-hint">world info — generates from the character, links into it</span><span class="pgen-chev" aria-hidden="true">▸</span></div>' +
            '<div class="pgen-lore-meta">' +
              '<input id="pgen-lore-name" class="pro-input" placeholder="Lorebook title (optional)">' +
              '<input id="pgen-lore-desc" class="pro-input" placeholder="Lorebook description (optional — setting, tone)">' +
            "</div>" +
            '<div id="pgen-lore-list" class="pgen-lore-list"></div>' +
            '<div class="pro-actions pgen-lore-actions">' +
              '<button type="button" id="pgen-lore-gen" class="pro-btn pro-btn-primary" title="Ask the AI to write lorebook entries from the current character">✨ Generate from character</button>' +
              '<button type="button" id="pgen-lore-add" class="pro-btn" title="Add a blank entry">➕ Add entry</button>' +
              '<button type="button" id="pgen-lore-import" class="pro-btn" title="Import a lorebook .txt or Tavern .json">📥 Import</button>' +
              '<input type="file" id="pgen-lore-file" accept=".txt,.json,text/plain,application/json" hidden>' +
            "</div>" +
            '<div class="pro-actions pgen-lore-actions">' +
              '<button type="button" id="pgen-lore-link" class="pro-btn" title="Write the lorebook into the persona as a Lorebook section, so chat, vault and downloads all carry it">🔗 Link into persona</button>' +
              '<button type="button" id="pgen-lore-sync" class="pro-btn" title="Show what is embedded as lorebook in the persona — including the published URL file — and add the missing sections into it">🔄 Sync with lorebook</button>' +
              '<button type="button" id="pgen-lore-txt" class="pro-btn" title="Download the lorebook as a .txt file">⬇ .txt</button>' +
              '<button type="button" id="pgen-lore-copy" class="pro-btn" title="Copy the lorebook text">⧉ Copy</button>' +
              '<button type="button" id="pgen-lore-json" class="pro-btn" title="Download the lorebook as Tavern-compatible .json">⬇ .json</button>' +
              '<button type="button" id="pgen-lore-clear" class="pro-btn" title="Delete every lorebook entry (click twice to confirm)">🗑 Delete all</button>' +
            "</div>" +
          "</div>" +
          '<div class="pro-card" id="pgen-chatfit-card" data-pcollapse="chatfit">' +
            '<div class="pro-card-head"><span class="pgen-chatfit-title">💬 Chat fit</span> <button type="button" id="pgen-chatfit-toggle" class="pro-btn" title="Turn the chat-fit tool on — meter, distill, lore-split and trimmed chat handoffs">○ off</button><span class="pro-badge" id="pgen-chatfit-badge" hidden>off</span><span class="pgen-head-hint">what the chat AI actually sees</span><span class="pgen-chev" aria-hidden="true">▸</span></div>' +
            '<div id="pgen-chatfit-body" hidden>' +
            '<div id="pgen-chatfit-meter" class="pgen-chatfit-meter"></div>' +
           '<div class="pgen-chatfit-party" id="pgen-chatfit-party"><span class="pgen-chatfit-party-lb">Chatting:</span>' +
              '<button type="button" data-g="1" title="Solo: just this character in the chat. Gets the full share (~1,800 tokens). Pick this for 1-on-1 chats.">Solo · just this one</button>' +
              '<button type="button" data-g="2" title="Duo: two characters in the same chat (e.g. yours + one more). Budget is split two ways (~900 tokens each).">Duo · 2 characters</button>' +
              '<button type="button" data-g="3" title="Group: three or more characters in the same chat. Budget is split three ways (~600 tokens each). Pick this for group chats.">Group · 3+ characters</button></div>' +
            '<div class="pgen-hint" style="margin:.15rem 0 .3rem;">Solo = chatting with just this character · Duo = 2 characters in one chat · Group = 3+ in one chat. More characters = smaller share each, so long descriptions get cut sooner.</div>' +
            '<label class="pro-opt" style="display:flex;align-items:center;gap:.45rem;margin:.35rem 0 .1rem;cursor:pointer;"><input type="checkbox" id="pgen-dynamic-bond" style="cursor:pointer;"> <span>💞 Dynamic bond — character warms up or cools down based on how {{user}} treats them</span></label>' +
            '<div class="pgen-hint" style="margin:0 0 .3rem;">Starts from “Relationship to you”, then evolves: praise & kindness → closer, cruelty & insults → colder/hostile. Gradual, stays in character. Untick to keep the starting attitude fixed. Applies to every 💬 chat handoff.</div>' +
            '<details class="pgen-chatfit-details"><summary>👁 What the chat sees (approx — budget varies by model)</summary><div id="pgen-chatfit-parties" class="pgen-chatfit-sim"></div><pre id="pgen-chatfit-cut"></pre></details>' +
            '<div class="pgen-subhead">Core vs lore sections <span class="pgen-head-hint">lore skips the always-sent text — turn it into lorebook facts first</span></div>' +
            '<div id="pgen-chatfit-split" class="pgen-chatfit-split"><div class="pgen-empty">Generate a character and its sections will be listed here.</div></div>' +
            '<div class="pro-actions">' +
              '<button type="button" id="pgen-chatfit-convert" class="pro-btn" title="Turn every lore-flagged section into lorebook facts (1–2 sentences each)">📖 Lore sections → lorebook facts</button>' +
              '<button type="button" id="pgen-chatfit-distill" class="pro-btn pro-btn-primary" title="AI: write the chat-sized essence + reminder, and move the rest into lorebook facts">✨ Distill for chat</button>' +
            "</div>" +
            '<div class="pgen-chatfit-edit">' +
              '<label class="pro-opt pgen-full">Essence — the always-sent core (used for chat instead of the full description)<textarea id="pgen-chatfit-essence" class="pro-textarea pgen-chatfit-ta" placeholder="✨ Distill for chat writes this, or write your own tight core (aim ~600–800 words)"></textarea></label>' +
              '<div class="pgen-chatfit-count" id="pgen-chatfit-essence-count"></div>' +
              '<label class="pro-opt pgen-full">Reminder — injected before every reply (keep under 100 words)<textarea id="pgen-chatfit-reminder" class="pro-textarea pgen-chatfit-ta pgen-chatfit-ta-short" placeholder="Auto-built from tagline + personality + voice if left blank"></textarea></label>' +
              '<div class="pgen-chatfit-count" id="pgen-chatfit-reminder-count"></div>' +
            "</div>" +
            '<div class="pro-actions">' +
              '<button type="button" id="pgen-chatfit-publish" class="pro-btn" title="Upload the lorebook as a chat lore file and attach it to chat handoffs (stable link, re-publish to update)">📤 Publish lorebook</button>' +
              '<button type="button" id="pgen-chatfit-copyurl" class="pro-btn" title="Copy the published lorebook URL">🔗 Copy lore URL</button>' +
            "</div>" +
            '<div id="pgen-chatfit-pubnote" class="pgen-chatfit-note"></div>' +
            '<div class="pgen-hint">Chat apps keep ~30% of model context for all descriptions combined and cut from the end — so the top of your text always survives. Lore-URL facts are fetched only when relevant instead of eating that budget. The published file is a public link; existing chat threads need <b>/lore</b> + reload to pick up re-publishes. Budgets assume ~6k model context — the real number varies, so stay comfortably inside it.</div>' +
            "</div>" +
          "</div>" +
          '<div class="pro-card" data-pcollapse="saved">' +
            '<div class="pro-card-head">🗃️ Saved personas <span class="pro-badge" id="pgen-saved-count">0</span><span class="pgen-head-hint">switch, edit &amp; re-save · combine two or more</span><span class="pgen-chev" aria-hidden="true">▸</span></div>' +
            '<div class="pgen-saved-bar">' +
              '<label class="pgen-saved-bar-lb" for="pgen-saved-switch">Editing</label>' +
              '<select id="pgen-saved-switch" class="pro-select" title="Switch between saved personas"></select>' +
            "</div>" +
            '<div id="pgen-saved" class="pgen-saved"><div class="pgen-empty">Loading…</div></div>' +
            '<div class="pro-actions">' +
              '<button type="button" id="pgen-import-open" class="pro-btn" title="Load a .txt / .md / .json persona file, or type/paste one in">📥 Import / paste persona</button>' +
              '<button type="button" id="pgen-save" class="pro-btn pro-btn-primary" title="Keep the current character in your saved personas">💾 Save current persona</button>' +
              '<button type="button" id="pgen-save-as" class="pro-btn" title="Save the current character as a brand-new saved persona">➕ Save as new</button>' +
            "</div>" +
            '<div id="pgen-combine" class="pgen-combine" hidden></div>' +
          "</div>" +
        "</div>" +
      "</div>" +
      '<div class="pro-card pro-comments shared-comm" data-pcollapse="community"><div class="pro-card-head">💬 Community <span class="pro-badge">share, vote, chat</span><span class="pgen-chev" aria-hidden="true">▸</span></div><div style="display:flex; justify-content:center; margin:0.6rem auto 0.2rem;"><button type="button" data-act="emojis" title="Browse every custom emoji the comment box accepts, click one to copy its :code:" style="cursor:pointer; font:inherit; font-size:0.82rem; font-weight:600; padding:0.42rem 0.85rem; border-radius:999px; border:1px solid var(--th-border); background:var(--th-surface, var(--th-field)); color:inherit;">😀 Emoji browser <span style="font-weight:400; opacity:0.7; font-size:0.78rem;">— click a custom emoji to copy its :code: for your comment</span></button></div><div id="persona-comm-ctn" class="shared-comm-ctn" style="height:520px;"><div class="pgen-empty">Loading community chat…</div></div></div>';

    buildOptionControls();
    syncOptionInputs();
    renderRefs();
    renderStarter();
    renderPortrait();
    loadSaved().then(renderSaved);

    // persisted character (if any)
    var descEl = $("pgen-desc"), nameEl = $("pgen-name");
    if (st.persona.description) { descEl.value = st.persona.description; nameEl.value = st.persona.name || ""; }
    refreshSections(); updateWordCount(); renderChatFit();

    // wiring
    (function () {
      var go = $("pgen-addsec-go"), open = $("pgen-addsec-open"), custom = $("pgen-addsec-custom");
      if (open) open.addEventListener("click", openSectionPicker);
      var starter = $("pgen-sec-starter");
      secStarter = lsGet(LS_SEC_STARTER) || "";
      try { var m = JSON.parse(lsGet(LS_SEC_STARTERS) || "{}"); if (m && typeof m === "object" && !Array.isArray(m)) secStarters = m; } catch (e) { secStarters = {}; }
      if (starter) {
        starter.value = secStarter;
        starter.addEventListener("input", function () { secStarter = starter.value; lsSet(LS_SEC_STARTER, secStarter); });
      }
      if (!go) return;
      function fire() {
        var typed = custom ? custom.value.trim() : "";
        if (typed) { if (custom) custom.value = ""; addSection(typed, go, true); return; }
        if (pickList.length) { addSectionsBulk(selectedHeadings()); return; }
        openSectionPicker();
      }
      go.addEventListener("click", fire);
      if (custom) custom.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); fire(); } });
      updateAddSecSummary();
    })();
    $("pgen-import").addEventListener("click", openGalleryPicker);
    $("pgen-upload").addEventListener("click", uploadAndDescribe);
    $("pgen-addprompt").addEventListener("click", function () {
      addRef({ prompt: "", manual: true });
      var all = document.querySelectorAll(".pgen-ref-prompt");
      var last = all[all.length - 1];
      if (last) last.focus();
    });
    $("pgen-clearrefs").addEventListener("click", async function () {
      if (!st.refs.length) return;
      if (!(await window.uiConfirm("Remove all " + st.refs.length + " reference(s)?", { okText: 'Remove all', danger: true }))) return;
      st.refs = []; st.portrait = null; saveRefs(); renderRefs(); renderPortrait();
    });
    $("pgen-gen").addEventListener("click", doGenerate);
    $("pgen-stop").addEventListener("click", stopGenerate);
    $("pgen-random").addEventListener("click", surprise);
    $("pgen-reset").addEventListener("click", resetOptions);
    (function () {
      var freshBtn = $("pgen-src-fresh"), savedBtn = $("pgen-src-saved");
      if (freshBtn) freshBtn.addEventListener("click", function () { setRefMode(false); });
      if (savedBtn) savedBtn.addEventListener("click", function () { setRefMode(true); });
      var linkSel = $("pgen-ref-link");
      if (linkSel) {
        linkSel.innerHTML = "";
        REF_LINKS.forEach(function (l) {
          var o = document.createElement("option");
          o.value = l.id; o.textContent = l.label;
          linkSel.appendChild(o);
        });
        linkSel.value = refCard.link || "";
        linkSel.addEventListener("change", function () { refCard.link = linkSel.value; refCardSave(); renderRefPreview(); });
      }
      var who = $("pgen-ref-who");
      if (who) who.addEventListener("change", function () { refCard.who = who.value; refCardSave(); renderRefPreview(); });
      var mode = $("pgen-ref-mode");
      if (mode) {
        mode.value = refCard.mode || "with";
        mode.addEventListener("change", function () { refCard.mode = mode.value; refCardSave(); renderRefPreview(); });
      }
      var starter = $("pgen-ref-starter");
      if (starter) {
        starter.value = refCard.starter || "";
        starter.addEventListener("input", function () { refCard.starter = starter.value; refCardSave(); renderRefPreview(); });
      }
      paintRefMode();
      refreshRefSelect();
    })();
    (function () {
      function attach() {
        try {
          if (window.NameRoller) window.NameRoller.addRerollButton($("pgen-name"));
          else if (window.ensureNameRoller) window.ensureNameRoller(attach);
        } catch (e) {}
      }
      attach();
    })();
    $("pgen-presets").addEventListener("click", openPresets);
    $("pgen-chat").addEventListener("click", chatWithThem);

    $("pgen-portrait").addEventListener("click", openPortraitMenu);
    $("pgen-vault").addEventListener("click", saveToVault);
    $("pgen-roster").addEventListener("click", addToRoster);
    $("pgen-copy").addEventListener("click", function () {
      var t = ($("pgen-desc").value || "").trim();
      if (!t) { toast("⚠️ nothing to copy yet"); return; }
      copyText(t).then(function (ok) { toast(ok ? "📋 copied" : "⚠️ copy failed"); });
    });
    $("pgen-dupcheck").addEventListener("click", function () { openDupCheck(); });
    $("pgen-export").addEventListener("click", exportMd);
    $("pgen-tavern").addEventListener("click", exportTavernCard);
    $("pgen-history").addEventListener("click", async function () {
      await ensureExtras();
      if (window.t2i_openPersonaPromptHistory) window.t2i_openPersonaPromptHistory();
      else toast("⚠️ prompt history not available yet");
    });
    $("pgen-share").addEventListener("click", shareSetup);
    var party = $("pgen-chatfit-party");
    if (party) party.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () {
        st.chat.group = parseInt(b.getAttribute("data-g"), 10) || 1;
        chatSave(); renderChatFit();
      });
    });
    var tglEl = $("pgen-chatfit-toggle");
    if (tglEl) tglEl.addEventListener("click", function () {
      st.chat.enabled = !st.chat.enabled;
      chatSave(); renderChatFit(); updateSaveButton();
      toast(st.chat.enabled ? "💬 chat-fit on — meter, distill and trimmed handoffs active" : "💬 chat-fit off — chats get the full description");
    });
    var essEl = $("pgen-chatfit-essence"), remEl = $("pgen-chatfit-reminder");
    if (essEl) essEl.addEventListener("input", function () { st.chat.essence = this.value; chatSave(); updateChatFit(); });
    if (remEl) remEl.addEventListener("input", function () { st.chat.reminder = this.value; chatSave(); updateChatFit(); });
    var bondEl = $("pgen-dynamic-bond");
    if (bondEl) {
      try { bondEl.checked = window.t2i_dynamicBondEnabled ? window.t2i_dynamicBondEnabled() : true; } catch (e) { bondEl.checked = true; }
      bondEl.addEventListener("change", function () {
        try { if (window.t2i_setDynamicBond) window.t2i_setDynamicBond(bondEl.checked);
        else localStorage.setItem("t2iDynamicBondV1", bondEl.checked ? "on" : "off"); } catch (e) {}
        try { updateChatFit(); } catch (e2) {}
        toast(bondEl.checked ? "💞 dynamic bond on — character evolves with the chat" : "💞 dynamic bond off — character keeps its starting attitude");
      });
    }
    var descEl0 = $("pgen-desc"), guideT = 0;
    if (descEl0 && !descEl0.dataset.guideHook) {
      descEl0.dataset.guideHook = "1";
      descEl0.addEventListener("input", function () {
        if (guideT) clearTimeout(guideT);
        guideT = setTimeout(function () { try { updateChatFit(); } catch (e) {} }, 400);
      });
    }
    $("pgen-chatfit-convert").addEventListener("click", function () { convertLoreSections(); });
    $("pgen-chatfit-distill").addEventListener("click", function () { distillForChat(this); });
    $("pgen-chatfit-publish").addEventListener("click", function () { publishLore(this); });
    $("pgen-chatfit-copyurl").addEventListener("click", function () {
      if (!st.chat.loreUrl) { toast("⚠️ publish the lorebook first"); return; }
      copyText(st.chat.loreUrl).then(function (ok) { toast(ok ? "🔗 lore URL copied" : "⚠️ copy failed"); });
    });
    loreRender();
    $("pgen-lore-name").addEventListener("input", function () { st.lore.name = this.value; loreSave(); });
    $("pgen-lore-desc").addEventListener("input", function () { st.lore.description = this.value; loreSave(); });
    $("pgen-lore-gen").addEventListener("click", function () { loreGenerate(this); });
    $("pgen-lore-add").addEventListener("click", function () {
      st.lore.entries.push({ id: uid(), title: "", keys: [], content: "" });
      loreSave(); loreRender();
      var host = $("pgen-lore-list");
      var last = host ? host.querySelector(".pgen-lore-entry:last-child .pgen-lore-title") : null;
      if (last) last.focus();
    });
    $("pgen-lore-import").addEventListener("click", function () { $("pgen-lore-file").click(); });
    $("pgen-lore-file").addEventListener("change", function () { loreImportFile(this.files && this.files[0]); this.value = ""; });
    $("pgen-lore-link").addEventListener("click", loreSyncToPersona);
    $("pgen-lore-sync").addEventListener("click", openLoreSync);
    $("pgen-lore-txt").addEventListener("click", loreDownloadTxt);
    $("pgen-lore-json").addEventListener("click", loreDownloadJson);
    $("pgen-lore-copy").addEventListener("click", function () {
      var flat = loreFlatten();
      if (!flat) { toast("⚠️ lorebook is empty"); return; }
      copyText(flat).then(function (ok) { toast(ok ? "📖 lorebook copied" : "⚠️ copy failed"); });
    });
    var loreClearAt = 0;
    $("pgen-lore-clear").addEventListener("click", function () {
      if (!st.lore.entries.length) { toast("📖 lorebook is already empty"); return; }
      var now = Date.now();
      if (now - loreClearAt > 5000) {
        loreClearAt = now;
        toast("⚠️ click 🗑 Delete all again to delete " + st.lore.entries.length + " entr" + (st.lore.entries.length === 1 ? "y" : "ies"));
        return;
      }
      loreClearAt = 0;
      st.lore.entries = [];
      loreSave(); loreRender();
      try { updateChatFit(); } catch (e) {}
      toast("🗑 lorebook cleared");
    });
    $("pgen-save").addEventListener("click", function () { saveCurrentPersona(); });
    $("pgen-save-as").addEventListener("click", function () { saveAsNewPersona(); });
    $("pgen-saved-switch").addEventListener("change", function () { switchToPersona(this.value); });
    $("pgen-import-open").addEventListener("click", function () { openImport(); });
    $("pgen-oname").addEventListener("input", function () { st.opts.name = this.value; saveOpts(); });
    $("pgen-oage").addEventListener("input", function () {
      st.opts.age = this.value; saveOpts();
      // Typing an age clears the ambiguous tick — they are alternatives.
      if (String(this.value || "").trim() && $("pgen-oage-amb") && $("pgen-oage-amb").checked) {
        $("pgen-oage-amb").checked = false;
        st.opts.ageAmbiguous = false; saveOpts();
      }
    });
    $("pgen-oage-amb").addEventListener("change", function () {
      st.opts.ageAmbiguous = !!this.checked; saveOpts();
      // Ambiguous age is for when no age is typed — clear the typed age.
      if (this.checked && $("pgen-oage")) {
        var cur = String($("pgen-oage").value || "").trim();
        if (cur) { $("pgen-oage").value = ""; st.opts.age = ""; saveOpts(); }
      }
    });
    $("pgen-ogenrecustom").addEventListener("input", function () {
      st.opts.genre = this.value; saveOpts();
    });
    $("pgen-ogenremixcustom").addEventListener("input", function () {
      st.opts.genreMix = this.value; saveOpts();
    });
    $("pgen-opronouns").addEventListener("input", function () { st.opts.pronouns = this.value; saveOpts(); });
    $("pgen-oavoid").addEventListener("input", function () { st.opts.avoid = this.value; saveOpts(); });
    $("pgen-oinstruction").addEventListener("input", function () { st.opts.instruction = this.value; saveOpts(); });
    $("pgen-orelation-custom").addEventListener("input", function () { st.opts.relationshipCustom = this.value; saveOpts(); });
    $("pgen-oflaw").addEventListener("input", function () { st.opts.flaw = this.value; saveOpts(); });
    $("pgen-ocontradiction").addEventListener("input", function () { st.opts.contradiction = this.value; saveOpts(); });
    $("pgen-owant").addEventListener("input", function () { st.opts.want = this.value; saveOpts(); });
    $("pgen-oneed").addEventListener("input", function () { st.opts.need = this.value; saveOpts(); });
    $("pgen-osecret").addEventListener("input", function () { st.opts.secret = this.value; saveOpts(); });
    $("pgen-osecretfrom").addEventListener("input", function () { st.opts.secretFrom = this.value; saveOpts(); });
    $("pgen-opressure").addEventListener("input", function () { st.opts.pressure = this.value; saveOpts(); });
    $("pgen-owild-roll").addEventListener("click", rollWildcard);
    $("pgen-owild-clear").addEventListener("click", function () { st.opts.wildcard = ""; saveOpts(); renderWildcard(); });
    $("pgen-desc").addEventListener("input", function () {
      st.persona.description = this.value;
      updateWordCount();
      updateSaveButton();
      clearTimeout(sectionTimer);
      sectionTimer = setTimeout(function () { refreshSections(); saveLast(); }, 700);
    });
    $("pgen-desc").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doGenerate(); }
    });
    $("pgen-name").addEventListener("input", function () { st.persona.name = this.value; updateSaveButton(); saveLast(); });
    initCardCollapse();
  }

  /* ------------------------------------------------- collapsible cards */
  // Every persona card folds away by tapping its title bar — all collapsed by
  // default except Character options + Saved personas (the old standalone
  // 🧬 Build-from-saved card is fused into Character options now; a stored
  // "fromsaved" collapse entry is simply ignored). Choice persists per
  // browser (localStorage), and generating/loading auto-opens 📝 The character
  // so the new text is actually visible.
  var LS_COL = "t2iPersonaCollapseV1";
  function pcollapseDefaults(key) { return key !== "options" && key !== "saved"; } // true = collapsed
  function pcollapseRead() {
    try { var o = JSON.parse(localStorage.getItem(LS_COL) || "{}"); if (o && typeof o === "object") return o; } catch (e) {}
    return {};
  }
  function pcollapseWrite(map) { try { localStorage.setItem(LS_COL, JSON.stringify(map)); } catch (e) {} }
  function pcollapsePaint(card, collapsed) {
    card.dataset.collapsed = collapsed ? "1" : "0";
    var head = card.querySelector(":scope > .pro-card-head");
    var chev = card.querySelector(":scope > .pro-card-head > .pgen-chev");
    if (chev) chev.textContent = collapsed ? "▸" : "▾";
    if (head) head.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }
  function pcollapseSet(key, collapsed, save) {
    if (!APP) return;
    var card = APP.querySelector('.pro-card[data-pcollapse="' + key + '"]');
    if (!card) return;
    pcollapsePaint(card, collapsed);
    if (save !== false) { var m = pcollapseRead(); m[key] = !!collapsed; pcollapseWrite(m); }
  }
  function pgenExpandCard(key) { pcollapseSet(key, false); }
  function initCardCollapse() {
    if (!APP || APP.__pcollapseInit) return;
    APP.__pcollapseInit = true;
    var saved = pcollapseRead();
    var cards = APP.querySelectorAll(".pro-card[data-pcollapse]");
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        var key = card.getAttribute("data-pcollapse");
        var collapsed = (saved[key] !== undefined) ? !!saved[key] : pcollapseDefaults(key);
        var head = card.querySelector(":scope > .pro-card-head");
        if (head) {
          head.setAttribute("role", "button");
          head.setAttribute("tabindex", "0");
          head.addEventListener("click", function (e) {
            // Let real controls in the title bar (chat-fit on/off, etc.) work normally.
            if (e.target && e.target.closest && e.target.closest("button,input,select,textarea,a,summary,[contenteditable]")) return;
            var next = card.dataset.collapsed !== "1";
            pcollapseSet(key, next);
          });
          head.addEventListener("keydown", function (e) {
            if (e.key === "Enter" || e.key === " ") {
              if (e.target !== head) return;
              e.preventDefault();
              pcollapseSet(key, card.dataset.collapsed !== "1");
            }
          });
        }
        pcollapsePaint(card, collapsed);
      })(cards[i]);
    }
  }

  /* ------------------------------------------------------------- public API */
  window.__personaOnShow = function () {
    if (!built) build();
    if (APP) APP.hidden = false;
    try { if (window.SharedComm && window.SharedComm.dockTab) window.SharedComm.dockTab("persona"); } catch (e) {}
    try { if (window.__pgenRefillGenres) window.__pgenRefillGenres(); } catch (e) {}
    try { syncBlendPreview(); } catch (e) {}
    updateRefCounts();
    renderStarter();
    if (built) refreshSections();
    loadSaved().then(renderSaved);
  };
  window.__personaAddPrompt = function (text) {
    if (!text) return;
    addRef({ prompt: String(text), manual: true });
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) {}
  };
  window.__personaAcceptStarter = function (s) {
    if (!built) build();
    s = s || {};
    st.starter = {
      url: String(s.url || ""), kind: String(s.kind || ""), poster: String(s.poster || ""),
      prompt: String(s.prompt || ""), style: String(s.style || "").slice(0, 160),
      brief: String(s.brief || ""), tone: String(s.tone || "").slice(0, 80),
      toneLabel: String(s.toneLabel || "").slice(0, 160),
      title: String(s.title || "").slice(0, 160),
      source: String(s.source || "gen").slice(0, 20), ts: Date.now()
    };
    saveStarter(); renderStarter();
    if (window.showTab) window.showTab("persona");
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) {}
    toast("🖼️ starter received — review it, add it as a reference, then ✨ Generate");
    return true;
  };
  window.__personaApplyRecipe = function (data) {
    if (!built) build();
    applySetup(data);
    if (window.showTab) window.showTab("persona");
  };
  // Saved personas are part of a site backup (see src/vault.js SiteBackup).
  window.__personaListSaved = function () {
    return loadSaved().then(function () { return (saved.list || []).slice(); });
  };
  window.__personaCurrent = function () {
    var nameEl = $("pgen-name"), descEl = $("pgen-desc");
    var m = avatarMedia();
    return {
      name: (nameEl && nameEl.value || "").trim(),
      description: descEl ? descEl.value : "",
      thumb: m.url,
      thumbKind: m.kind,
      thumbPoster: m.poster,
      lorebook: sanitizeLorebook(st.lore),
      tone: (st.opts && st.opts.tone) || "auto",
      rating: (st.opts && st.opts.rating) || "sfw"
    };
  };
  window.__personaImportSaved = async function (arr) {
    await loadSaved();
    var have = {};
    (saved.list || []).forEach(function (p) { have[p.id] = true; });
    (arr || []).forEach(function (p) {
      if (!p || !p.description) return;
      (saved.list || (saved.list = [])).unshift({
        id: (p.id && !have[p.id]) ? p.id : uid(),
        name: p.name || "Imported persona",
        description: String(p.description),
        thumb: p.thumb || "",
        thumbKind: p.thumbKind || "",
        thumbPoster: p.thumbPoster || "",
        tone: p.tone || "auto",
        rating: p.rating || "sfw",
        language: p.language || "English",
        depth: p.depth || "balanced",
        extras: Array.isArray(p.extras) ? p.extras : [],
        ts: p.ts || Date.now()
      });
    });
    await persistSaved();
    renderSaved();
  };
  window.__personaOpenConverted = async function (rec) {
    if (!built) build();
    var lorebook = null;
    try {
      var secs = parseSections((rec && rec.description) || "");
      for (var i = 0; i < secs.length; i++) {
        if (String(secs[i].heading || "").trim().toLowerCase() === "lorebook" && String(secs[i].content || "").trim()) {
          var p = loreParseTxt(secs[i].content);
          if (p.entries.length) lorebook = sanitizeLorebook(p);
          break;
        }
      }
    } catch (e) { lorebook = null; }
    var stored = await storeImported({
      id: uid(),
      name: (rec && rec.name) || "Converted character",
      description: (rec && rec.description) || "",
      thumb: (rec && rec.thumb) || "",
      thumbKind: (rec && (rec.thumbKind || rec.kind)) || "",
      thumbPoster: (rec && (rec.thumbPoster || rec.poster)) || "",
      lorebook: lorebook,
      tone: "auto", rating: "sfw", language: "English", depth: "balanced", extras: [], ts: Date.now()
    });
    applyImportedPersona(stored);
    if (window.showTab) window.showTab("persona");
    return stored && stored.id;
  };
  window.__personaEditWorking = function (name, description) {
    if (!built) build();
    applyPersona({ name: name || "", description: description || "", sections: parseSections(description || "") });
    if (window.showTab) window.showTab("persona");
  };
  // Board / external handoff: load a full persona record (name, description,
  // portrait, lorebook) into the editor as a fresh working copy — activeId is
  // deliberately null so saving creates a new library entry instead of
  // overwriting anything, and the current options stay untouched.
  window.__personaLoadExternal = function (rec) {
    if (!built) build();
    rec = rec || {};
    applyImportedPersona({
      id: null,
      name: rec.name || "",
      description: rec.description || "",
      thumb: rec.thumb || "",
      thumbKind: rec.thumbKind || "",
      thumbPoster: rec.thumbPoster || "",
      lorebook: rec.lorebook || null,
      chat: null
    });
    if (window.showTab) window.showTab("persona");
    return true;
  };
  window.__personaOpenSaved = async function (id) {
    if (!built) build();
    await loadSaved();
    var rec = (saved.list || []).filter(function (p) { return p.id === id; })[0];
    if (!rec) return null;
    loadSavedPersona(id);
    if (window.showTab) window.showTab("persona");
    return id;
  };

  loadState();
  // build eagerly if the container is already in the DOM (script may load before
  // the tab is first shown — showTab() also calls __personaOnShow).
  if (document.readyState !== "loading") setTimeout(function () { if (!built && $("persona-app")) build(); }, 0);
  else document.addEventListener("DOMContentLoaded", function () { if (!built && $("persona-app")) build(); });
})();
