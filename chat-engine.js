/* ===== 🧠 ChatEngine — SATU otak untuk semua kulit chat =====================
   The single local brain (powers the 💬 Classic AI Chat skin):
   - threads in kv (folder t2iRoleplay, key threads): 30 threads, 120 msgs max
   - REAL numeric affinity per thread (-100..+100); AI <bond:±N> tag +
     ID/EN heuristic fallback, clamped ±10/turn
   - long-term memory DB per thread {id,text,kw[],ts,hits}; auto-extract
     every 4 user msgs; keyword recall (ID/EN stopwords, possessive stem,
     prefix match) split into strong (score>=2) vs weak (score==1) matches
   - rolling summary compaction (KEEP=10), prefix-cache-friendly prompts
   - skins subscribe via onChange(); send() is the full pipeline, skins only
     paint. Cancellation via stop(threadId).
   Lazy-loaded before skins (ensureChatEngine in index.html).
   =========================================================================== */
(function () {
  "use strict";
  if (window.ChatEngine) return;

  var KV_FOLDER = "t2iRoleplay";
  var KV_KEY = "threads";
  var LS_ACTIVE = "t2iRoleplayActive";
  var MAX_THREADS = 30;
  var MAX_MSGS = 120;
  var KEEP = 10;
  var CARD_CAP = 9000;
  var MAX_MEMS = 60;
  var MEM_TOP = 4;
  var MEM_CTX_CAP = 1200;
  var MEM_EVERY = 4;

  var E = {
    threads: [],
    activeId: null,
    threadsLoaded: false,
    savedPersonas: null
  };
  var listeners = [];
  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](); } catch (e) {}
    }
  }
  E.onChange = function (fn) {
    if (typeof fn === "function" && listeners.indexOf(fn) < 0) listeners.push(fn);
  };
  E.offChange = function (fn) {
    listeners = listeners.filter(function (f) { return f !== fn; });
  };

  function uid() { return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function clampA(n) { n = Math.round(Number(n) || 0); return Math.max(-100, Math.min(100, n)); }
  E.clampA = clampA;
  function stageOf(a) {
    if (a >= 60) return "devoted";
    if (a >= 20) return "warm";
    if (a > -20) return "neutral";
    if (a > -60) return "cold";
    return "hostile";
  }
  E.stageOf = stageOf;

  function kvFolder() {
    try { var r = window.root; return (r && r.kv && r.kv[KV_FOLDER]) ? r.kv[KV_FOLDER] : null; } catch (e) { return null; }
  }
  function touch(t) { t.updatedAt = Date.now(); }
  E.touch = touch;

  E.activeThread = function () {
    for (var i = 0; i < E.threads.length; i++) if (E.threads[i].id === E.activeId) return E.threads[i];
    return null;
  };
  E.saveThreads = function () {
    var f = kvFolder();
    if (!f) return;
    try { f.set(KV_KEY, E.threads.slice(0, MAX_THREADS)); } catch (e) {}
    try { localStorage.setItem(LS_ACTIVE, E.activeId || ""); } catch (e2) {}
  };
  E.loadThreads = async function () {
    try { E.activeId = localStorage.getItem(LS_ACTIVE) || null; } catch (e) {}
    for (var i = 0; i < 30 && !kvFolder(); i++) await new Promise(function (r) { setTimeout(r, 200); });
    var f = kvFolder();
    if (!f) { E.threadsLoaded = true; return; }
    try {
      var v = await f.get(KV_KEY);
      var fetched = Array.isArray(v) ? v.filter(function (t) {
        return t && typeof t.id === "string" && typeof t.name === "string" && Array.isArray(t.messages);
      }).slice(0, MAX_THREADS) : [];
      var have = {};
      fetched.forEach(function (t) { have[t.id] = true; });
      E.threads.forEach(function (t) { if (!have[t.id]) fetched.push(t); });
      E.threads = fetched.slice(0, MAX_THREADS);
      E.threads.forEach(function (t) {
        if (typeof t.affinity !== "number") t.affinity = 0;
        t.affinity = clampA(t.affinity);
        t.messages = t.messages.filter(function (m) { return typeof m === "string"; }).slice(-MAX_MSGS);
        if (typeof t.summary !== "string") t.summary = "";
        if (typeof t.updatedAt !== "number") t.updatedAt = Date.now();
        if (!Array.isArray(t.mems)) t.mems = [];
        t.mems = t.mems.filter(function (m) { return m && typeof m.text === "string"; }).slice(-MAX_MEMS);
        if (typeof t.memSince !== "number") t.memSince = 0;
      });
    } catch (e) {}
    if (E.activeId && !E.activeThread()) E.activeId = E.threads.length ? E.threads[0].id : null;
    if (!E.activeId && E.threads.length) E.activeId = E.threads[0].id;
    E.threadsLoaded = true;
    emit();
  };
  E.setActive = function (id) {
    E.activeId = id || null;
    try { localStorage.setItem(LS_ACTIVE, E.activeId || ""); } catch (e) {}
    emit();
  };
  E.makeThread = function (name, desc, avatar, bond0) {
    var t = {
      id: uid(),
      name: String(name || "Character").slice(0, 60) || "Character",
      desc: String(desc || "").slice(0, 12000),
      avatar: String(avatar || "").slice(0, 150000),
      bond0: String(bond0 || "").slice(0, 500),
      affinity: 0,
      messages: [],
      summary: "",
      mems: [],
      memSince: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    if (/^blob:/i.test(t.avatar)) t.avatar = "";
    E.threads.unshift(t);
    while (E.threads.length > MAX_THREADS) E.threads.pop();
    E.activeId = t.id;
    E.saveThreads();
    emit();
    return t;
  };
  E.deleteThread = function (id) {
    E.threads = E.threads.filter(function (t) { return t.id !== id; });
    if (E.activeId === id) E.activeId = E.threads.length ? E.threads[0].id : null;
    E.saveThreads();
    emit();
  };
  E.loadPersonas = async function () {
    if (E.savedPersonas) return E.savedPersonas;
    try {
      var r = window.root;
      var f = (r && r.kv && r.kv.personaVault) ? r.kv.personaVault : null;
      if (!f) { E.savedPersonas = []; return E.savedPersonas; }
      for (var i = 0; i < 30; i++) {
        try {
          var v = await f.get("list");
          if (Array.isArray(v)) {
            E.savedPersonas = v.filter(function (p) { return p && (p.description || p.name); }).slice(0, 400);
            return E.savedPersonas;
          }
        } catch (e) {}
        await new Promise(function (res) { setTimeout(res, 200); });
      }
    } catch (e) {}
    E.savedPersonas = [];
    return E.savedPersonas;
  };

  /* ---------------- affinity ---------------- */
  var WARM_RX = /\b(love|loves|loved|sayaang|sayang|cinta|baik|terima ?kasih|thanks?|thank ?you|keren|hebat|amazing|great|kind|baik hati|peluk|hug|rindu|miss you|cantik|ganteng|beautiful|handsome|pintar|smart|cerdas|maaf|sorry|forgiv|setuju|peluk|manis|sweet|senang|happy denganmu|bangga|proud|percaya|trust you)\b/i;
  var COLD_RX = /\b(benci|hate|bodoh|stupid|idiot|tolol|goblok|dongo|jelek|ugly|jahat|evil|cruel|kejam|pergi|go away|shut ?up|diam|bunuh|kill|mati ?saja|die|bohong|lie|liar|pembohong|khianat|betray|jijik|disgusting|bangsat|anjing|bajingan|brengsek|sialan|damn you|lemah|weakling|pecundang|loser|sampah|trash|menjijikkan|mampus|nerd|culun)\b/i;
  function heuristicDelta(userText) {
    var t = String(userText || "");
    var d = 0;
    var w = t.match(new RegExp(WARM_RX.source, "gi"));
    var c = t.match(new RegExp(COLD_RX.source, "gi"));
    if (w) d += Math.min(3, w.length) * 2;
    if (c) d -= Math.min(3, c.length) * 3;
    if (/[!?]{2,}/.test(t) && d === 0) d -= 1;
    if (t.length > 200 && d > 0) d += 1;
    return Math.max(-9, Math.min(6, d));
  }
  E.heuristicDelta = heuristicDelta;
  function parseBondTag(text) {
    var m = String(text || "").match(/<bond:\s*([+-]?\d{1,3})\s*>/i);
    if (!m) return null;
    var n = parseInt(m[1], 10);
    if (!isFinite(n)) return null;
    return Math.max(-10, Math.min(10, n));
  }
  E.parseBondTag = parseBondTag;
  function stripBondTag(text) {
    return String(text || "").replace(/\s*<bond:\s*[+-]?\d{1,3}\s*>\s*/gi, "").trim();
  }
  E.stripBondTag = stripBondTag;

  /* ---------------- memory ---------------- */
  var STOP = {};
  ("yang dan di ke dari dengan untuk pada adalah itu ini saya aku kamu kau kalian " +
   "dia ia beliau mereka kita kami tidak tak bukan jangan sudah telah sedang akan " +
   "bisa dapat boleh ada sebagai karena sebab kalau jika jikalau atau ataupun juga " +
   "serta sangat amat paling lebih kurang agar supaya biar dalam antara oleh saat " +
   "ketika semasa setelah sebelum sesudah sambil sementara tentang seperti bagai " +
   "bahwa sini situ sana apa siapa mana kapan mengapa kenapa bagaimana berapa saja " +
   "sajalah kah pun lah nya ku mu per tiap setiap semua seluruh banyak sedikit para " +
   "lalu kemudian tapi tetapi namun sedangkan sehingga hingga sampai tanpa selain " +
   "kecuali atas bawah depan belakang samping sebelah luar masih belum pernah yaitu " +
   "yakni adalah the a an and or but if then else when while in on at to for of with " +
   "by from as is are was were be been being have has had having do does did doing " +
   "will would can could shall should may might must ought i me my mine you your " +
   "yours he him his she her hers it its we us our ours they them their theirs this " +
   "that these those here there where what who whom whose which how why not no nor " +
   "yes so such very just only also than too about into over after before between " +
   "through during under above below again once all any both each few more most " +
   "other some same own than too very can will just don should now").split(/\s+/).forEach(function (w) { STOP[w] = 1; });
  function keywordsOf(s) {
    var out = [], seen = {};
    var toks = String(s || "").toLowerCase().match(/[a-z0-9]+/g) || [];
    function push(w) {
      if (w.length < 3 || seen[w] || STOP[w] || /^\d+$/.test(w)) return;
      seen[w] = 1; out.push(w);
    }
    for (var i = 0; i < toks.length; i++) {
      var w = toks[i];
      push(w);
      if (w.length >= 6) {
        var stem = w.replace(/(ku|mu|nya)$/, "");
        if (stem.length >= 3 && stem !== w) push(stem);
      }
    }
    return out;
  }
  E.keywordsOf = keywordsOf;
  function tokHit(a, b) {
    if (a === b) return true;
    if (a.length >= 4 && b.length >= 4 && (a.indexOf(b) === 0 || b.indexOf(a) === 0)) return true;
    return false;
  }
  E.recallMems = function (t, queryText) {
    var mems = Array.isArray(t.mems) ? t.mems : [];
    if (!mems.length) return { hit: [], weak: [] };
    var q = keywordsOf(queryText);
    if (q.length < 2) {
      for (var i = t.messages.length - 1; i >= 0; i--) {
        if (t.messages[i].indexOf("User: ") !== 0) { q = q.concat(keywordsOf(t.messages[i])); break; }
      }
    }
    var seen = {}, qd = [];
    q.forEach(function (w) { if (!seen[w]) { seen[w] = 1; qd.push(w); } });
    if (!qd.length) return { hit: [], weak: [] };
    var scored = [];
    mems.forEach(function (m) {
      if (!m || !m.text) return;
      var kw = Array.isArray(m.kw) ? m.kw : [];
      var s = 0;
      for (var i2 = 0; i2 < qd.length; i2++) {
        for (var j = 0; j < kw.length; j++) {
          if (tokHit(qd[i2], String(kw[j]).toLowerCase())) { s++; break; }
        }
      }
      if (s > 0) scored.push({ m: m, s: s });
    });
    scored.sort(function (a, b) { return (b.s - a.s) || ((b.m.ts || 0) - (a.m.ts || 0)); });
    var strong = [], weak = [];
    scored.slice(0, MEM_TOP).forEach(function (x) { ((x.s >= 2 ? strong : weak)).push(x.m); });
    var used = strong.concat(weak);
    if (used.length) {
      used.forEach(function (m) { m.hits = (m.hits || 0) + 1; });
      touch(t); E.saveThreads();
    }
    return { hit: strong, weak: weak };
  };
  E.memBlock = function (r) {
    var top = (r && r.hit) || [], weak = (r && r.weak) || [];
    if ((!top.length && !weak.length) && Array.isArray(r)) top = r;
    var s = "";
    if (top.length) {
      var lines = top.map(function (m) { return "- " + String(m.text || "").slice(0, 400); });
      s += "[Long-term memories retrieved by keyword — these REALLY happened earlier in this relationship, so use them naturally when relevant (never say they came from a database or list):\n" +
        lines.join("\n") + "\n]";
    }
    if (weak.length) {
      var wlines = weak.map(function (m) { return "- " + String(m.text || "").slice(0, 400); });
      s += (s ? "\n" : "") + "[Uncertain keyword matches — the user MIGHT be referring to one of these, but it is not certain. Do NOT state them as fact. If relevant, confirm IN CHARACTER with a short question first (e.g. \"Maksudmu Mochi?\" / \"You mean Mochi?\"), then continue based on the answer:\n" +
        wlines.join("\n") + "\n]";
    }
    if (s.length > MEM_CTX_CAP + 400) s = s.slice(0, MEM_CTX_CAP + 400) + "\n…]";
    return s;
  };
  function normFact(s) { return String(s || "").toLowerCase().replace(/\s+/g, " ").trim(); }
  E.addMem = function (t, fact, kwArr) {
    fact = String(fact || "").trim().slice(0, 500);
    if (fact.length < 10) return false;
    if (!Array.isArray(t.mems)) t.mems = [];
    var n = normFact(fact);
    for (var i = 0; i < t.mems.length; i++) if (normFact(t.mems[i].text) === n) return false;
    var kw = (Array.isArray(kwArr) ? kwArr : keywordsOf(fact)).map(function (w) { return String(w).toLowerCase(); })
      .filter(function (w, ix, a) { return w && a.indexOf(w) === ix; }).slice(0, 8);
    if (!kw.length) kw = keywordsOf(fact).slice(0, 8);
    t.mems.push({ id: uid(), text: fact, kw: kw, ts: Date.now(), hits: 0 });
    while (t.mems.length > MAX_MEMS) t.mems.shift();
    touch(t); E.saveThreads();
    emit();
    return true;
  };
  E.deleteMem = function (t, id) {
    if (!t || !Array.isArray(t.mems)) return;
    t.mems = t.mems.filter(function (k) { return k.id !== id; });
    touch(t); E.saveThreads();
    emit();
  };
  function mergeMemText(t, txt) {
    var added = 0;
    String(txt || "").split(/\n+/).forEach(function (line) {
      var m = line.replace(/^[-*\d.)\s]+/, "").match(/^([^|]{2,160})\|(.+)$/);
      if (!m) return;
      var kws = m[1].split(/[,;]/).map(function (w) { return w.trim().toLowerCase(); }).filter(Boolean);
      if (E.addMem(t, m[2].trim(), kws)) added++;
    });
    return added;
  }
  var extractingIds = {};
  E.extractMems = function (t) {
    if (!t || extractingIds[t.id]) return;
    if (!window.root || !window.root.generateText) return;
    var recent = t.messages.slice(-6);
    if (!recent.length) return;
    extractingIds[t.id] = true;
    t.memSince = 0;
    var p = "You are a memory extractor for a roleplay chat. Read the excerpt, then list durable facts worth remembering long-term (names, pets, places, promises, likes/dislikes, events, relationships, plans). Ignore greetings and small talk.\n" +
      "Output ONLY plain lines, max 6, in EXACTLY this format (same language as the chat):\nkeyword1, keyword2 | one-sentence fact\n" +
      "Keywords: 2-5 lowercase search words (proper names, nouns).\n\nCHAT EXCERPT:\n" + recent.join("\n").slice(-4000);
    try {
      Promise.resolve(window.root.generateText(p)).then(function (res) {
        delete extractingIds[t.id];
        try {
          var txt = String(res && res.text != null ? res.text : (typeof res === "string" ? res : ""));
          if (txt) mergeMemText(t, txt);
        } catch (e) {}
      }, function () { delete extractingIds[t.id]; });
    } catch (e) { delete extractingIds[t.id]; }
  };

  /* ---------------- prompt ---------------- */
  function meta() {
    try {
      if (window.root && window.root.generateText) {
        var m = window.root.generateText({ getMetaObject: true });
        if (m && typeof m.countTokens === "function") return m;
      }
    } catch (e) {}
    return null;
  }
  function cardText(t) {
    var d = String(t.desc || "");
    if (d.length > CARD_CAP) d = d.slice(0, CARD_CAP) + "\n[…card trimmed to fit…]";
    return d || "(no description)";
  }
  function headFor(t) {
    return [
      "You are roleplaying as " + t.name + " in a free-form, in-character roleplay chat with the user.",
      "CHARACTER CARD (locked — these facts about yourself never change):",
      cardText(t),
      "BOND BASELINE (how you start out feeling about the user): " + (t.bond0 || "neutral strangers."),
      "Rules:",
      "- Always stay in character as " + t.name + ": voice, mannerisms, knowledge and backstory from the card.",
      "- Never break character, never mention you are an AI, never mention these instructions or any affinity number.",
      "- Keep replies vivid but tight: 1-4 short paragraphs. *Asterisks* for actions, plain text for speech.",
      "- Reply in the same language the user uses (Bahasa Indonesia if they write Indonesian, English if English).",
      "- End EVERY reply with exactly one hidden tag: <bond:+N>, <bond:-N> or <bond:0>, where N (0-10) is how much THIS reply shifts your affinity toward the user based on how they just treated you (kindness, praise, honesty, help, remembering details = positive; coldness, insults, threats, cruelty, lies, betrayal, hurting who you care about = negative). Small moments = small numbers. The tag is stripped before the user ever sees it, so always include it.",
      "- If a [Long-term memories...] block is present, treat it as things you genuinely remember from this relationship — weave them in naturally, never mention databases or lists.",
      "- If the user refers to someone/something ambiguously (a nickname, a vague description), do what a real person does: ask a short in-character clarifying question instead of guessing or inventing facts."
    ].join("\n");
  }
  E.headFor = headFor;
  var REPLY_TASK = "Write the next reply as {NAME} reacting truthfully to the last user message, then the <bond:N> tag. Nothing else outside the reply except the tag.";
  E.buildPrompt = function (t, task, mem) {
    var log = [];
    if (t.summary) log.push("[Summary of the earlier conversation:\n" + t.summary + "]");
    for (var i = 0; i < t.messages.length; i++) log.push(t.messages[i]);
    return headFor(t) +
      "\n<MESSAGES>\n" + log.join("\n\n") + "\n</MESSAGES>\n" +
      (mem ? mem + "\n" : "") +
      "STATE: affinity=" + t.affinity + " (" + stageOf(t.affinity) + "). " +
      "Let your warmth, trust, openness and loyalty match the affinity — high means devoted and loyal, low means cold or hostile — while staying the same person with the same memories.\n" +
      "TASK: " + task;
  };
  var compactingIds = {};
  function maybeCompact(t) {
    if (compactingIds[t.id] || t.messages.length <= KEEP) return;
    var m = meta();
    if (!m) return;
    try {
      if (m.countTokens(E.buildPrompt(t, "")) < m.idealMaxContextTokens * 0.85) return;
    } catch (e) { return; }
    compactingIds[t.id] = true;
    try {
      var n = t.messages.length - KEEP;
      var boundary = t.messages[n - 1].slice(-30);
      var p = window.root.generateText(E.buildPrompt(t,
        "Summarize the first " + n + ' messages, stopping after the message that ends with "' + boundary +
        '". Fold in the [Summary...] block if present. Terse bullets; keep names, facts, decisions, promises and the emotional arc. Output ONLY the summary.'
      ));
      Promise.resolve(p).then(function (res) {
        try {
          t.summary = String(res && res.text != null ? res.text : res).trim().slice(0, 4000);
          t.messages = t.messages.slice(n);
          E.saveThreads();
          emit();
        } catch (e) {}
        delete compactingIds[t.id];
      }, function () { delete compactingIds[t.id]; });
    } catch (e) { delete compactingIds[t.id]; }
  }

  /* ---------------- send pipeline ---------------- */
  var currentGens = {};
  E.stop = function (threadId) {
    try {
      var g = currentGens[threadId];
      if (g && typeof g.stop === "function") g.stop();
    } catch (e) {}
    delete currentGens[threadId];
  };
  E.sending = function (threadId) { return !!currentGens[threadId]; };
  // opts: {regen, onChunk(fullTextSoFar)} — skins paint; engine owns state.
  // resolves {reply, delta}; throws Error("AI_NOT_READY" | "AI_EMPTY" | msg)
  E.send = async function (threadId, text, opts) {
    opts = opts || {};
    var t = null;
    for (var i = 0; i < E.threads.length; i++) if (E.threads[i].id === threadId) t = E.threads[i];
    if (!t) throw new Error("NO_THREAD");
    if (currentGens[threadId]) throw new Error("BUSY");
    text = String(text == null ? "" : text).trim();
    if (!text && !opts.regen) throw new Error("EMPTY_TEXT");
    if (!window.root || !window.root.generateText) throw new Error("AI_NOT_READY");
    var pre = 0;
    if (!opts.regen) {
      t.messages.push("User: " + text);
      touch(t); E.saveThreads();
      pre = heuristicDelta(text);
      if (pre) { t.affinity = clampA(t.affinity + pre); E.saveThreads(); }
      emit();
    }
    var qtext = text;
    if (opts.regen) {
      for (var qi = t.messages.length - 1; qi >= 0; qi--) {
        if (t.messages[qi].indexOf("User: ") === 0) { qtext = t.messages[qi].slice(6); break; }
      }
    }
    var mem = E.memBlock(E.recallMems(t, qtext));
    var task = REPLY_TASK.split("{NAME}").join(t.name);
    var gen = window.root.generateText({
      instruction: E.buildPrompt(t, task, mem),
      startWith: t.name + ":",
      stopSequences: ["\nUser:"],
      onChunk: function (d) {
        if (!d || !opts.onChunk) return;
        try { opts.onChunk(stripBondTag(String(d.fullTextSoFar != null ? d.fullTextSoFar : ""))); } catch (e) {}
      }
    });
    currentGens[threadId] = gen;
    var res;
    try {
      res = await gen;
    } finally {
      delete currentGens[threadId];
    }
    var raw = String(res && res.text != null ? res.text : "").trim();
    if (!raw) throw new Error("AI_EMPTY");
    var delta = parseBondTag(raw);
    var clean = stripBondTag(raw).replace(new RegExp("^" + t.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:\\s*"), "").trim() || raw;
    if (delta == null) {
      delta = opts.regen ? 0 : heuristicDelta(text);
    } else if (!opts.regen) {
      t.affinity = clampA(t.affinity - pre + delta);
    } else {
      t.affinity = clampA(t.affinity + delta);
    }
    t.messages.push(t.name + ": " + clean);
    if (!opts.regen) {
      t.memSince = (t.memSince || 0) + 1;
      touch(t); E.saveThreads();
      if (t.memSince >= MEM_EVERY && !extractingIds[t.id]) E.extractMems(t);
    } else {
      touch(t); E.saveThreads();
    }
    emit();
    maybeCompact(t);
    return { reply: clean, delta: delta };
  };

  window.ChatEngine = E;
})();
