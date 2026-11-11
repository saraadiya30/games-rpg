(function () {
  "use strict";
  if (window.__fluxStdInit) return;
  // 🧬 Standard chips (quality/style/skin/body/hair/face modules + own-words banks),
  // vendored from fluxinator's index.html. One-time init: rows self-heal through the
  // block's own 700ms rebuild timer, so tab re-renders need no re-init.
  window.__fluxStdInit = function () {
    if (window.__fluxStdDone) return;
    window.__fluxStdDone = true;
(function() {
    // 🧬 Standard chips (see the CSS above). The module texts live in main.pjs (`standardNeg` /
    // `standardPos`, exposed via `root.standardNegList()` / `root.standardPosList()`). Whichever box
    // a chip edits — the 🖍 Negative box, or the Description box for the positive chips — is the
    // single source of truth, so toggling a chip edits that box (and it is remembered like any typed
    // text). Matching is PER TAG: a block is a comma-list of tags, and the chip is green when ALL of
    // them are in the box, amber when only SOME are, and red when none are (user request 2026-09-27).
    // 🧬 Standard positive er ÉN række, men sorteret i KATEGORIER ("motherboard", brugerønske):
    // General · Skin (tekstur, tone/hue, imperfections) · Wrinkles/folds · Nipples · Hair (color,
    // style) · Eyes · Face & jaw · Muscles & body · Hands & anatomy · Age. Hver kategori er en
    // foldbar overskrift med sin EGEN "All on"-knap, så man kan tænde ét emne ad gangen i stedet for
    // hele tag-biblioteket. Kategori-rækkefølgen kommer fra `standardPosCats` i main.pjs, og hvert
    // moduls `category`-felt afgør hvilken blok det lander i. Rækker uden kategorier bygges fladt.
    var KINDS = {
      neg: {
        sel: '#fluxNegTa',
        cls: "flux-stdneg flux-topbox",
        rowId: "fluxStdNegRow",
        label: "🧬 Standard:",
        tip: "One-click negative tags for the 🖍 Negative box above: 20 boxes in a 5-per-row grid (figure, head, picture, guards - one box per subject). Click a box to add all its tags (only the tags that aren't already in the box are added); click it again to remove them. Green = all its tags are in the box, red = none. The tags are yours to edit in main.pjs (the standardNeg and standardNegCats lists).",
        listFn: "standardNegList",
        catsFn: "standardNegCatsList",
        userCat: "userNegStd",
        userCatLabel: "⭐ My own negative words",
        anchor: function(ta) { return document.getElementById("fluxStdRows") || null; }
      },
      pos: {
        sel: '#fluxDescTa',
        cls: "flux-stdneg flux-stdpos flux-topbox",
        rowId: "fluxStdPosRow",
        label: "🧬 Standard:",
        tip: "One-click tags for the Description box above: 4 quality boxes (Quality, Ultra HD, Natural, Realistic) plus sentences (skin, body, hair and face words live in their own 🧴 Skin, 🧍 Body, 🙂 Face and 💇 Hair areas below). Click the box to open its green/red chips in a dropdown menu; click a chip to add the tags it doesn't already have, click again to remove them. Green = all its tags are in the box, red = none. The words are yours to edit in main.pjs (the standardPos list).",
        listFn: "standardPosMainList",
        catsFn: "standardPosMainCatsList",
        userCat: "userStd",
        userCatLabel: "⭐ My own standards",
        anchor: function(ta) { return document.getElementById("fluxStdRows") || (ta && ta.closest(".input-ctn")) || null; }
      },
      // 🧴 Skin-tags og 🧍 Body & Face-tags er FLYTTET ud af chip-maskinen (brugerønske 2026-09-29):
      // begge tag-områder er nu checkbox-dropdowns ligesom parameter-motherboardene, bygget af
      // `makeTagBox(...)` i scriptet længere nede (🧴 `#fluxSkinTagBox`, 🧍 `#fluxBodyTagBox`).
      mine: {
        sel: '#fluxDescTa',
        cls: "flux-stdneg flux-stdpos flux-mine flux-topbox",
        rowId: "fluxMineRow",
        label: "🧩 Own Words:",
        tip: "Your OWN saved words/phrases (a personal word bank, stored locally in this browser). Type in the + add a word field and press Enter (or click +) to add a word right away, or click ✏ Edit to edit the whole list - one word or phrase per line. A chip puts/takes EXACTLY its text in the Description box above, so the rest of your prompt is untouched. Green = the text is in the box, red = it isn't. The ★ on a chip saves that word/phrase as a permanent standard - either as a 🧬 Standard positive word or as a 🗣 Sentence; it then moves out of Own Words and into that row. The small ✕ on a chip deletes that word from your list. Use them one at a time, several at once, or the row switch on the right.",
        listGetter: mineWordsList,
        hasEditor: true,
        mine: true,
        addId: "fluxMineAddInput",
        promoteTargets: [
          { label: "🧬 Add as Standard positive", tip: "Save this as a permanent one-click word in the 🧬 Standard positive row. It moves out of Own Words and into that row.", target: "pos" }
        ],
        anchor: function(ta) { return document.getElementById("fluxStdRows") || (ta && ta.closest(".input-ctn")) || null; }
      },
      // 🧩 Own Words (negativ): en privat ordbank for negative ord, med ★ der gemmer et ord
      // som fast NEGATIVT ord i 🧬 Standard negative.
      negmine: {
        sel: '#fluxNegTa',
        cls: "flux-stdneg flux-mine flux-topbox",
        rowId: "fluxNegMineRow",
        label: "🧩 Own Words:",
        tip: "Your OWN saved words/phrases for the NEGATIVE box (stored privately in this browser). The red − marks this as the NEGATIVE bank: everything in it belongs to \"what I do NOT want\". A chip puts/takes EXACTLY its text in the 🖍 Negative box, so the rest of your negative prompt is untouched. The ★ saves a word as a permanent standard - either as a 🧬 negative word or as a 🗣 negative sentence; the ✕ deletes it from your list.",
        listGetter: negMineWordsList,
        hasEditor: true,
        mine: true,
        bank: "neg",
        addId: "fluxNegMineAddInput",
        promoteTargets: [
          { label: "🧬 Add as negative word", tip: "Save this as a permanent one-click word in the 🧬 Standard negative row. It moves out of Own Words (negative) and into that row.", target: "neg" }
        ],
        anchor: function(ta) { return document.getElementById("fluxStdRows") || (ta && ta.closest(".input-ctn")) || null; }
      }
    };
    var ST = { neg: { row: null, mods: null }, pos: { row: null, mods: null }, mine: { row: null, mods: null }, negmine: { row: null, mods: null } };

    function taFor(kind) { return document.querySelector(KINDS[kind].sel); }

    // ⭐ Brugerens EGNE faste standarder (gemt lokalt): ord der er flyttet UD af 🧩 Own Words og ind
    // i 🧬 Standard positive / 🧬 Standard negative via ★-knappen. De flettes ind FORREST, så de er
    // nemmest at ramme, og de forsvinder ikke når main.pjs opdateres.
    function userMods(kind) {
      if(kind === "pos") return userStdWords().map(function(w, i) {
        return { key: "usr" + i, label: w, text: w, cat: "userStd", user: "pos",
          tip: "Your own standard word/phrase: click to add exactly this text to the Description box; click again to take it out. Use ✕ to delete it from your own standards." };
      });
      if(kind === "neg") return userNegWords().map(function(w, i) {
        return { key: "usr" + i, label: w, text: w, cat: "userNegStd", user: "neg",
          tip: "Your own negative word/phrase: click to add exactly this text to the 🖍 Negative box; click again to take it out. Use ✕ to delete it from your own negative words." };
      });
      return [];
    }
    function getMods(kind) {
      var st = ST[kind];
      if(st.mods) return st.mods;
      var base = null;
      try {
        if(typeof KINDS[kind].listGetter === "function") {
          base = KINDS[kind].listGetter() || null;
        } else if(window.root && typeof root[KINDS[kind].listFn] === "function") {
          base = root[KINDS[kind].listFn]() || null;
        }
      } catch(e) {}
      if(base && !base.length) base = null;
      var extra = userMods(kind);
      // 🧩 Own Words + 🧩 Own Words (negativ): the row stays visible even with an empty bank, so the
      // "✏ Edit words" button and the "+ add a word" field are always reachable (otherwise there is
      // no way to add the FIRST word).
      if(!base && !extra.length) return KINDS[kind].hasEditor ? [] : null;
      st.mods = extra.concat(base || []);
      return st.mods;
    }
    // 🧩 Mine ord — brugerens EGEN ordbank (én pr. linje i localStorage). Hver linje bliver et chip,
    // hvis tekst er PRÆCIS den linje, så et klik lægger/fjerner netop den tekst i Description-boksen
    // uden at røre resten af prompten. Rækken bygges af den samme maskine som 🧬 Standard-rækkerne.
    var LS_MINE = "fluxMineWords";
    var LS_MINE_NEG = "fluxMineWordsNeg";
    function bankKeyFor(kind) { return (KINDS[kind] && KINDS[kind].bank === "neg") ? LS_MINE_NEG : LS_MINE; }
    function bankGet(kind) {
      try {
        return String(localStorage.getItem(bankKeyFor(kind)) || "").split("\n").map(function(s) { return s.trim(); }).filter(Boolean);
      } catch(e) { return []; }
    }
    function bankSet(kind, arr) {
      var seen = {}, out = [];
      (arr || []).forEach(function(w) {
        var s = String(w == null ? "" : w).trim();
        var k = s.toLowerCase();
        if(s && !seen[k]) { seen[k] = 1; out.push(s); }
      });
      try { localStorage.setItem(bankKeyFor(kind), out.join("\n")); } catch(e) {}
      if(ST[kind]) ST[kind].mods = null;
      return out;
    }
    function mineWordsGet() { return bankGet("mine"); }
    function mineWordsSet(arr) { return bankSet("mine", arr); }
    function mineWordsList() {
      return bankGet("mine").map(function(w, i) {
        return { key: "w" + i, label: w, mineKind: "mine", tip: "Your own word/phrase: click to put exactly this text into the Description box; click again to take it out. Click the \u2715 on the chip to delete the word from your list.", text: w };
      });
    }
    function negMineWordsList() {
      return bankGet("negmine").map(function(w, i) {
        return { key: "w" + i, label: w, mineKind: "negmine", tip: "Your own negative word/phrase: click to put exactly this text into the Negative box; click again to take it out. Click the \u2715 on the chip to delete the word from your list.", text: w };
      });
    }
    function deleteMineWord(m) {
      var kind = (m && m.mineKind) || "mine";
      var word = String((m && m.text) || "").trim();
      if(!word) return;
      var ta = taFor(kind);
      if(ta && hasTag(ta.value || "", word)) writeTa(kind, removeWordGentle(ta.value || "", word));
      bankSet(kind, bankGet(kind).filter(function(w) { return normTag(w) !== normTag(word); }));
      refreshMine(kind);
    }
    function refreshMine(kind) {
      kind = kind || "mine";
      try { if(window.__fluxRowMenu) window.__fluxRowMenu.evict(kind === "negmine" ? "fluxNegMineRow" : "fluxMineRow"); } catch(e) {}
      if(ST[kind] && ST[kind].row) { ST[kind].row.remove(); ST[kind].row = null; }
      if(ST[kind]) ST[kind].mods = null;
      buildOne(kind);
    }
    // ── ⭐ Egne faste standarder (fra 🧩 Own Words) ─────────────────────────────────────────
    // En "forfremmelse" flytter ordet UD af den private ordbank og IND i den valgte faste række
    // (🧬 Standard positive eller 🧬 Standard negative). Teksten bliver stående i boksen, så den
    // nye chip straks læses som tændt - kun ejerskabet flytter.
    var LS_USER_STD = "fluxUserStandardPos";
    var LS_USER_NEGSTD = "fluxUserNegStandardWords";
    function lsArrRead(k) {
      try { var o = JSON.parse(localStorage.getItem(k) || "null"); return Array.isArray(o) ? o.map(function(s){ return String(s == null ? "" : s).trim(); }).filter(Boolean) : []; } catch(e) { return []; }
    }
    function lsArrWrite(k, arr) { try { localStorage.setItem(k, JSON.stringify(arr || [])); } catch(e) {} }
    function userStdWords() { return lsArrRead(LS_USER_STD); }
    function userNegWords() { return lsArrRead(LS_USER_NEGSTD); }
    // SÆTNINGS-MERGE (2026-10-15): de gamle sætningsbanker (fluxUserSentences/fluxUserNegSentences)
    // findes ikke længere som rækker - deres indhold flyttes ÉN gang over i standard-bankerne, så
    // intet af brugerens eget går tabt. Idempotent: kører kun hvis der er noget at flytte.
    (function migrateSentenceBanks() {
      try {
        var s = lsArrRead("fluxUserSentences");
        if(s.length) {
          var std = lsArrRead(LS_USER_STD);
          s.forEach(function(w) { if(!std.some(function(x) { return normTag(x) === normTag(w); })) std.push(w); });
          lsArrWrite(LS_USER_STD, std);
          lsArrWrite("fluxUserSentences", []);
        }
        var ns = lsArrRead("fluxUserNegSentences");
        if(ns.length) {
          var nstd = lsArrRead(LS_USER_NEGSTD);
          ns.forEach(function(w) { if(!nstd.some(function(x) { return normTag(x) === normTag(w); })) nstd.push(w); });
          lsArrWrite(LS_USER_NEGSTD, nstd);
          lsArrWrite("fluxUserNegSentences", []);
        }
      } catch(e) {}
    })();
    function lsKeyForUser(kind) {
      if(kind === "neg") return LS_USER_NEGSTD;
      return LS_USER_STD;
    }
    function userAdd(kind, word) {
      var w = String(word == null ? "" : word).trim();
      if(!w) return false;
      var k = lsKeyForUser(kind);
      var arr = lsArrRead(k);
      if(arr.some(function(x) { return normTag(x) === normTag(w); })) return false;
      arr.push(w); lsArrWrite(k, arr);
      if(ST[kind]) ST[kind].mods = null;
      return true;
    }
    function userRemove(m) {
      var kind = (m && m.user) ? m.user : "pos";
      var w = String((m && m.text) || "").trim();
      if(!w) return;
      var t = normTag(w);
      var k = lsKeyForUser(kind);
      lsArrWrite(k, lsArrRead(k).filter(function(x) { return normTag(x) !== t; }));
      if(ST[kind]) ST[kind].mods = null;
    }
    function refreshStd(kind) {
      try { if(window.__fluxRowMenu) window.__fluxRowMenu.evict(kind === "neg" ? "fluxStdNegRow" : "fluxStdPosRow"); } catch(e) {}
      if(window.__fluxCatMenu && (kind === "neg" || kind === "pos")) { try { window.__fluxCatMenu.close(); } catch(e) {} }
      if(ST[kind].row) { ST[kind].row.remove(); ST[kind].row = null; }
      ST[kind].mods = null;
      buildOne(kind);
    }
    function deleteUserItem(m) {
      if(!m || !m.user) return;
      var word = String(m.text || "").trim();
      if(!word) return;
      var ta = taFor(m.user);
      if(ta && hasTag(ta.value || "", word)) writeTa(m.user, removeWordGentle(ta.value || "", word));
      userRemove(m);
      refreshStd(m.user);
      var what = (m.user === "neg") ? "negative words" : "own standards";
      promoteToast("Removed from your " + what + ".");
    }
    function promoteTo(kind, word, srcKind) {
      var w = String(word == null ? "" : word).trim();
      if(!w) return;
      srcKind = srcKind || "mine";
      var added = userAdd(kind, w);
      // Fjern ordet fra den private ordbank det kom fra (uanset om det allerede fandtes som standard).
      var t = normTag(w);
      var before = bankGet(srcKind);
      var after = before.filter(function(x) { return normTag(x) !== t; });
      if(after.length !== before.length) bankSet(srcKind, after);
      refreshMine(srcKind);
      refreshStd(kind);
      var msg = added
        ? (kind === "neg" ? "Saved as a negative word."
          : "Saved as a standard positive.")
        : ("Moved out of " + (srcKind === "negmine" ? "Own Words (negative)" : "Own Words") + " (it was already a standard).");
      promoteToast(msg);
    }
    // ★-menuen: ét valg (🧬 Standard positive / 🧬 Standard negative, alt efter bank). Fast positioneret nær knappen.
    var promoteMenuEl = null;
    function closePromoteMenu() { if(promoteMenuEl) { promoteMenuEl.remove(); promoteMenuEl = null; } }
    function openPromoteMenu(btn, word, kind) {
      kind = kind || "mine";
      closePromoteMenu();
      var m = document.createElement("div");
      m.className = "flux-promote-menu";
      var hd = document.createElement("div"); hd.className = "fpm-hd"; hd.textContent = word; hd.title = word;
      m.appendChild(hd);
      var targets = (KINDS[kind] && KINDS[kind].promoteTargets) || KINDS.mine.promoteTargets;
      targets.forEach(function(tg) {
        var b = document.createElement("button");
        b.type = "button"; b.textContent = tg.label; b.title = tg.tip || "";
        b.addEventListener("click", function(ev) { ev.preventDefault(); ev.stopPropagation(); closePromoteMenu(); promoteTo(tg.target, word, kind); });
        m.appendChild(b);
      });
      document.body.appendChild(m);
      promoteMenuEl = m;
      var r = btn.getBoundingClientRect();
      var vw = window.innerWidth || document.documentElement.clientWidth;
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var left = Math.max(6, Math.min(r.left, vw - m.offsetWidth - 6));
      var top = r.bottom + 4;
      if(top + m.offsetHeight > vh - 6) top = Math.max(6, r.top - m.offsetHeight - 4);
      m.style.left = left + "px"; m.style.top = top + "px";
    }
    document.addEventListener("click", function(ev) {
      if(!promoteMenuEl) return;
      var t = ev.target;
      if(t && t.closest && (t.closest(".flux-promote-menu") || t.closest(".sdn-chip-star"))) return;
      closePromoteMenu();
    }, true);
    document.addEventListener("keydown", function(ev) { if(ev.key === "Escape") closePromoteMenu(); });
    window.addEventListener("resize", closePromoteMenu);
    function promoteToast(msg) {
      var t = document.getElementById("fluxPromoteToast");
      if(!t) { t = document.createElement("div"); t.id = "fluxPromoteToast"; document.body.appendChild(t); }
      t.textContent = msg;
      t.classList.add("show");
      clearTimeout(window.__fluxPromoteToastT);
      window.__fluxPromoteToastT = setTimeout(function() { t.classList.remove("show"); }, 2200);
    }
    // Byte-skånsom til/fra for 🧩 Mine ord: de faste 🧬-chips normaliserer hele boksen (de fleste ord
    // er del af en fast blok, så det er fint der), men brugerens EGEN prompt må ikke reflowes. Her
    // rører vi KUN det ene ord og den ene separator omkring det - resten står byte-for-byte.
    function addWordGentle(text, word) {
      var s = String(text == null ? "" : text);
      if(hasTag(s, word)) return s;
      if(!s.trim()) return String(word);
      return s.replace(/\s+$/, "") + ", " + String(word);
    }
    function removeWordGentle(text, word) {
      var t = normTag(word), s = String(text == null ? "" : text);
      var ranges = [], start = 0;
      for(var i = 0; i < s.length; i++) {
        var ch = s.charAt(i);
        if(ch === "," || ch === "\n") { ranges.push({ s: start, e: i }); start = i + 1; }
      }
      ranges.push({ s: start, e: s.length });
      for(var r = ranges.length - 1; r >= 0; r--) {          // bagfra, så indekserne ikke forskubber sig
        var rg = ranges[r];
        if(normTag(s.slice(rg.s, rg.e)) !== t) continue;
        var from, to;
        if(rg.s > 0) { from = rg.s - 1; to = rg.e; }        // tag den ene separator FØR ordet med
        else { from = 0; to = (ranges.length > 1 ? ranges[1].s : rg.e); }
        s = s.slice(0, from) + s.slice(to);
        break;                                              // én forekomst pr. kald (kaldes i løkke)
      }
      return s.replace(/^[\s,]+/, "").replace(/\s+$/, "");
    }
    // --- tag-aware matching ------------------------------------------------------------------
    // A block is a comma-list of tags and we match PER TAG (never per whole block). That is what
    // fixes the two things the old literal match got wrong (user request 2026-09-27):
    //   (1) DUPLICATES — a tag that is already in the box (because the auto fine-tune fed it there,
    //       or because the user typed it) is never added a second time.
    //   (2) FALSE "OFF" — if only some of the block's tags are present, the chip reads "part"
    //       (amber) instead of looking switched off while the block is (mostly) right there.
    // The box is still the single source of truth: nothing is stored in JS state, everything is read
    // back out of the text.
    var SEP = "\n\n";
    function normTag(s) {
      return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ")
        .replace(/^[\s,]+/, "").replace(/[\s,.!;:]+$/, "");
    }
    function tagsOf(m) {
      if(!m.__tags) m.__tags = String(m.text || "").split(",").map(function(x) { return x.trim(); }).filter(Boolean);
      return m.__tags;
    }
    // The box text as parts: a comma OR a newline separates, and each part remembers the separator in
    // front of it, so removing one part never reflows the rest of the user's text.
    function splitParts(text) {
      var s = String(text == null ? "" : text), out = [], buf = "", sep = "";
      for(var i = 0; i < s.length; i++) {
        var ch = s.charAt(i);
        if(ch === "," || ch === "\n") { out.push({ sep: sep, part: buf }); buf = ""; sep = ch; }
        else buf += ch;
      }
      out.push({ sep: sep, part: buf });
      return out;
    }
    function countTag(text, tag) {
      var t = normTag(tag), list = splitParts(text), n = 0;
      for(var i = 0; i < list.length; i++) if(normTag(list[i].part) === t) n++;
      return n;
    }
    function hasTag(text, tag) { return countTag(text, tag) > 0; }
    function stateOf(text, m) {
      var tags = tagsOf(m), n = 0;
      for(var i = 0; i < tags.length; i++) if(hasTag(text, tags[i])) n++;
      return { n: n, total: tags.length, state: (tags.length && n === tags.length) ? "on" : "off" };
    }
    // Fjerner tag-forekomster ved at klippe KUN det stykke ud af teksten - aldrig ved at bygge
    // hele teksten op igen, så brugerens linjeskift/afsnit står urørt efter et untick. keepFirst
    // bevarer første forekomst og fjerner resten (bruges af dedupeTags).
    function dropTag(text, tag, keepFirst) {
      var t = normTag(tag), s = String(text == null ? "" : text), guard = 0;
      while(guard++ < 60) {
        var L = splitParts(s), off = 0, start = -1, end = -1, seen = false, i;
        for(i = 0; i < L.length; i++) {
          var it = L[i], pStart = off, pEnd = pStart + it.part.length;
          if(normTag(it.part) === t) {
            if(keepFirst && !seen) { seen = true; }
            else { start = pStart; end = pEnd; break; }
          }
          off = pEnd + 1;
        }
        if(start < 0) break;
        if(start > 0) start -= 1; else if(end < s.length) end += 1;
        s = s.slice(0, start) + s.slice(end);
        if(!keepFirst) break;
      }
      return s.replace(/^[\s,]+/, "").replace(/\s+$/, "");
    }
    // Fold a block's OWN duplicated tags down to one (a chip click is the user's "clean this block"
    // gesture - repeated words elsewhere in the prompt are left completely alone).
    function dedupeTags(text, tags) {
      var s = String(text == null ? "" : text);
      for(var i = 0; i < tags.length; i++) if(countTag(s, tags[i]) > 1) s = dropTag(s, tags[i], true);
      return s;
    }
    function removeTags(text, tags) {
      var s = String(text == null ? "" : text);
      for(var i = 0; i < tags.length; i++) {
        var guard = 0;
        while(hasTag(s, tags[i]) && guard++ < 25) s = dropTag(s, tags[i]);      // also kills duplicates
      }
      return s;
    }
    function isBlockTail(base, mods) {
      var list = splitParts(base), last = "";
      for(var i = list.length - 1; i >= 0; i--) if(/\S/.test(list[i].part)) { last = normTag(list[i].part); break; }
      if(!last) return false;
      for(var j = 0; j < (mods || []).length; j++) {
        var tags = tagsOf(mods[j]);
        for(var k = 0; k < tags.length; k++) if(normTag(tags[k]) === last) return true;
      }
      return false;
    }
    function addModule(text, m, mods) {
      var base = String(text == null ? "" : text).replace(/\s+$/, "");
      if(!base) return m.text;
      return isBlockTail(base, mods) ? (base + ", " + m.text) : (base + SEP + m.text);
    }
    // Only the tags that are NOT already somewhere in the box are appended.
    function addMissing(text, m, mods) {
      var missing = tagsOf(m).filter(function(t) { return !hasTag(text, t); });
      if(!missing.length) return String(text == null ? "" : text);
      return addModule(String(text == null ? "" : text), { text: missing.join(", ") }, mods);
    }
    function writeTa(kind, newText) {
      var ta = taFor(kind);
      if(!ta) return;
      ta.value = newText;
      // keep the framework's window.input.* + the remembered value in sync (same event the box's own
      // handler listens for)
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
    function flash(chip) {
      chip.classList.add("sdn-flash");
      setTimeout(function() { chip.classList.remove("sdn-flash"); }, 320);
    }
    // ⚠ KONFLIKT-VARSEL (brugerønske 2026-09-30: "gør endeligt det hvis man sidder og klikker til på
    // et eller andet der spolere/risikere at spolere"): når man TÆNDER et negativt ord som den
    // VALGTE stil selv bruger positivt (fx "cartoon" mens en cartoon-stil er valgt), vises en gul
    // advarsel over rækken. Den blokerer INTET - man kan altid tvinge kombinationen igennem (nogle
    // gange er klasken netop pointen). Varslerne dedupes pr. sidevisning og forsvinder af sig selv.
    var WARN_SEEN = {};
    function activeStyleLabel() {
      try {
        var t = document.querySelector('#fluxTestSel');
        var a = document.querySelector('#fluxStyleSel');
        var tTxt = (t && t.selectedOptions && t.selectedOptions[0]) ? (t.selectedOptions[0].textContent || "") : "";
        var s = (t && tTxt && !/no test style/i.test(tTxt)) ? t : a;
        var txt = (s && s.selectedOptions && s.selectedOptions[0]) ? (s.selectedOptions[0].textContent || "") : "";
        if(txt && !/^no style\b/i.test(txt)) return txt;
        return "";
      } catch(e) {}
      try { var x = (typeof root.styleActive === "function") ? root.styleActive() : null; return (x && x.name) || ""; } catch(e) { return ""; }
    }
    // Den aktive stils positive ord (🧪 Test Styles > 🎨 Style): stilens NAVN (som er
    // "Titel - Kunstner - tag, tag, tag") + genrens/ fin-tunens positive lag. Stilens EGEN prompt
    // holdes UDE med vilje, fordi den indeholder brugerens beskrivelse (ellers selv-udløsende).
    function activeStyleText() {
      var out = [];
      try { var lab = activeStyleLabel(); if(lab) out.push(lab); } catch(e) {}
      try {
        var f = (window.root && typeof root.styleFine === "function") ? root.styleFine() : null;
        if(f) { out.push(f.pos || ""); out.push(f.genrePos || ""); out.push(f.tweakPos || ""); }
      } catch(e) {}
      return out.join(", ").toLowerCase();
    }
    function styleClash(tags) {
      var hay = activeStyleText();
      if(!hay) return [];
      var out = [];
      for(var i = 0; i < tags.length; i++) {
        var t = String(tags[i] == null ? "" : tags[i]).toLowerCase().trim();
        if(!t || t.length < 2) continue;
        var safe = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if(new RegExp("(^|[^a-z0-9])" + safe + "([^a-z0-9]|$)").test(hay)) out.push(String(tags[i]).trim());
      }
      return out;
    }
    // Er ⏳ Age / Gender sat til noget andet end Auto? (Age-rækken har klassen "auto" når intet er valgt)
    function ageGenderSet() {
      try {
        var ar = document.getElementById("fluxAgeRow");
        if(!ar) return false;
        if(!ar.classList.contains("auto")) return true;
        var sels = ar.querySelectorAll("select");
        if(sels.length > 1 && sels[1].value) return true;
      } catch(e) {}
      return false;
    }
    function showWarn(kind, msgs) {
      var st = ST[kind];
      if(!st || !st.row) return;
      var box = st.row.querySelector(".sdn-warnbox");
      if(!box) {
        box = document.createElement("div");
        box.className = "sdn-warnbox";
        var body = st.row.querySelector(".sdn-body");
        if(body) st.row.insertBefore(box, body); else st.row.appendChild(box);
      }
      msgs.forEach(function(msg) {
        if(WARN_SEEN[msg]) return;
        WARN_SEEN[msg] = 1;
        var w = document.createElement("div");
        w.className = "sdn-warn";
        var span = document.createElement("span");
        span.textContent = msg;
        var x = document.createElement("button");
        x.type = "button";
        x.className = "sdn-warn-x";
        x.textContent = "\u2715";
        x.title = "Got it. Nothing is blocked - you can always force the combination on purpose.";
        x.addEventListener("click", function(ev) { ev.preventDefault(); ev.stopPropagation(); if(w.parentNode) w.parentNode.removeChild(w); });
        w.appendChild(span); w.appendChild(x);
        box.appendChild(w);
        setTimeout(function() { if(w.parentNode) w.parentNode.removeChild(w); }, 20000);
      });
    }
    // Kun den NEGATIVE boks kan "kæmpe mod" noget. Positiv-boksens chips forstærker bare stilen.
    function warnForMods(kind, mods) {
      if(kind !== "neg" || !mods || !mods.length) return;
      var tags = [];
      mods.forEach(function(m) { tagsOf(m).forEach(function(t) { tags.push(t); }); });
      var msgs = [];
      var clash = styleClash(tags);
      if(clash.length) {
        var nm = activeStyleLabel();
        var shown = clash.slice(0, 4).join(", ") + (clash.length > 4 ? (" +" + (clash.length - 4)) : "");
        msgs.push("\u26a0\ufe0f " + shown + " is part of the selected style" + (nm ? (" \u00ab" + nm + "\u00bb") : "") + ". The negative is fighting the style - switch that part off in the \ud83c\udf9a\ufe0f Style mixer, or leave it on if you want the clash on purpose.");
      }
      if(mods.some(function(m) { return m.cat === "genderGuard"; }) && ageGenderSet()) {
        msgs.push("\ud83e\uddd1\u200d\ud83c\udfa4 Gender & age guard fights your \u23f3 Age / Gender setting above. Set Age to Auto (or clear Gender) to avoid the clash - nothing is blocked.");
      }
      if(msgs.length) showWarn(kind, msgs);
    }
    function toggle(kind, m, chip) {
      var ta = taFor(kind);
      if(!ta) return;
      var text = ta.value || "";
      if(KINDS[kind].mine) {                                            // egen ordbank: byte-skånsom til/fra
        writeTa(kind, hasTag(text, m.text) ? removeWordGentle(text, m.text) : addWordGentle(text, m.text));
        if(chip) flash(chip);
        paint(kind);
        return;
      }
      var mods = ST[kind].mods || [];
      var was = stateOf(text, m).state;
      writeTa(kind, was === "on"
        ? removeTags(text, tagsOf(m))                                  // green -> take the whole block out
        : addMissing(dedupeTags(text, tagsOf(m)), m, mods));           // red/amber -> dedupe + add what's missing
      if(was !== "on") warnForMods(kind, [m]);                         // kun når noget TÆNDES
      if(chip) flash(chip);
      paint(kind);
    }
    // Én knap for HELE rækken (brugerønske 2026-09-17: "on/off knap på standard"): er alt allerede tændt,
    // fjerner den alle blokkenes tags; ellers tænder den alt på én gang. Den bruger præcis samme
    // tag-logik som et chip-klik, så et tag der allerede står i boksen aldrig kommer ind to gange, og
    // brugerens egen tekst ellers er urørt.
    function toggleAll(kind) {
      var st = ST[kind];
      var ta = taFor(kind);
      if(!ta || !st.mods) return;
      var text = ta.value || "";
      var allOn = true;
      st.mods.forEach(function(m) { if(stateOf(text, m).state !== "on") allOn = false; });
      if(KINDS[kind].mine) {                                            // egen ordbank: byte-skånsom til/fra
        var nm = text;
        st.mods.forEach(function(m) { nm = allOn ? removeWordGentle(nm, m.text) : addWordGentle(nm, m.text); });
        writeTa(kind, nm);
        paint(kind);
        return;
      }
      var nt;
      if(allOn) {
        var tags = [];
        st.mods.forEach(function(m) { tagsOf(m).forEach(function(t) { tags.push(t); }); });
        nt = removeTags(text, tags);
      } else {
        nt = text;
        st.mods.forEach(function(m) { nt = addMissing(dedupeTags(nt, tagsOf(m)), m, st.mods); });
      }
      if(!allOn) warnForMods(kind, st.mods);
      writeTa(kind, nt);
      paint(kind);
    }
    // 🧬 Én kategori ad gangen (samme tag-logik som `toggleAll`, men kun for den kategori).
    function toggleWord(kind, m, wi, chip) {
      var ta = taFor(kind);
      if(!ta) return;
      var text = ta.value || "";
      var tags = tagsOf(m);
      var w = String(tags[wi] || "").trim();
      if(!w) return;
      var mods = ST[kind].mods || [];
      writeTa(kind, hasTag(text, w) ? removeTags(text, [w]) : addMissing(dedupeTags(text, [w]), { text: w }, mods));
      if(chip) flash(chip);
      paint(kind);
    }
    function paintWordChips(st, dropScope, m, wt, text) {
      var chips = [];
      try { chips = Array.prototype.slice.call(st.row.querySelectorAll('.sdn-chip[data-key="' + m.key + '"]')); } catch(e) { chips = []; }
      if(dropScope) { try { Array.prototype.forEach.call(dropScope.querySelectorAll('.sdn-chip[data-key="' + m.key + '"]'), function(x) { if(chips.indexOf(x) === -1) chips.push(x); }); } catch(e) {} }
      chips.forEach(function(c) {
        if(c.dataset.wi === undefined || c.dataset.wi === "") return;
        var w = String(wt[Number(c.dataset.wi)] || "");
        var on = !!w && hasTag(text, w);
        c.classList.toggle("on", on);
        c.classList.remove("part");
      });
    }
    function paintWordBox(st, m, won, wtotal) {
      var box = null;
      try { box = st.row.querySelector('.sdn-cat.sdn-single[data-cat="' + m.cat + '"]'); } catch(e) {}
      if(!box) return;
      var all = wtotal && won === wtotal;
      box.classList.toggle("on", won > 0);
      box.classList.remove("part");
      var ccnt = box.querySelector(".sdn-catcnt");
      if(ccnt) {
        var ctw = "";
        if(ccnt.textContent !== ctw) ccnt.textContent = ctw;
        if(ccnt.classList.contains("sdn-part")) ccnt.classList.remove("sdn-part");
        var cctw = won + " of " + wtotal + " on. " + (wtotal - won) + " off.";
        if(ccnt.title !== cctw) ccnt.title = cctw;
      }
      var cab = box.querySelector(".sdn-catall");
      if(cab) {
        cab.classList.toggle("on", won > 0);
        cab.classList.remove("part");
        var txtw = won ? (won + "/" + wtotal) : "";
        if(cab.textContent !== txtw) cab.textContent = txtw;
      }
    }
    function toggleCats(kind, mods) {
      var st = ST[kind];
      var ta = taFor(kind);
      if(!ta || !mods || !mods.length) return;
      var text = ta.value || "";
      var allOn = true;
      mods.forEach(function(m) { if(stateOf(text, m).state !== "on") allOn = false; });
      var nt;
      if(allOn) {
        var tags = [];
        mods.forEach(function(m) { tagsOf(m).forEach(function(t) { tags.push(t); }); });
        nt = removeTags(text, tags);
      } else {
        nt = text;
        mods.forEach(function(m) { nt = addMissing(dedupeTags(nt, tagsOf(m)), m, st.mods || mods); });
      }
      if(!allOn) warnForMods(kind, mods);
      writeTa(kind, nt);
      paint(kind);
    }
    function resetDefault(kind) {
      var st = ST[kind];
      var ta = taFor(kind);
      if(!ta || !st.mods) return;
      if(KINDS[kind].mine) {
        var tags = [];
        st.mods.forEach(function(m) { tagsOf(m).forEach(function(t) { tags.push(t); }); });
        writeTa(kind, removeTags(ta.value || "", tags));
        paint(kind);
        return;
      }
      var nt = ta.value || "";
      st.mods.forEach(function(m) { nt = addMissing(dedupeTags(nt, tagsOf(m)), m, st.mods); });
      warnForMods(kind, st.mods);
      writeTa(kind, nt);
      paint(kind);
    }
    // Hvilke kategorier der er foldet ind (en visnings-indstilling, så den har sin egen localStorage-
    // nøgle og ikke blandes sammen med selve indholdet).
    var LS_STDCAT = "fluxStdCats";
    function stdCatState(kind) {
      try {
        var c = JSON.parse(localStorage.getItem(LS_STDCAT) || "{}");
        return (c && typeof c === "object" && c[kind] && typeof c[kind] === "object") ? c[kind] : {};
      } catch(e) { return {}; }
    }
    function saveStdCat(kind, o) {
      try {
        var c = JSON.parse(localStorage.getItem(LS_STDCAT) || "{}");
        if(!c || typeof c !== "object") c = {};
        c[kind] = o;
        localStorage.setItem(LS_STDCAT, JSON.stringify(c));
      } catch(e) {}
    }
    function toggleCatFold(kind, catEl, caret) {
      var o = stdCatState(kind);
      var k = catEl.dataset.cat;
      o[k] = !o[k];
      saveStdCat(kind, o);
      catEl.classList.toggle("cat-folded", !!o[k]);
      if(caret) caret.textContent = o[k] ? "\u25B8" : "\u25BE";
    }
    function applyCatFolds(kind, body) {
      var o = stdCatState(kind);
      var els = body.querySelectorAll(".sdn-cat");
      for(var i = 0; i < els.length; i++) {
        var f = !!o[els[i].dataset.cat];
        els[i].classList.toggle("cat-folded", f);
        var caret = els[i].querySelector(".sdn-carett");
        if(caret) caret.textContent = f ? "\u25B8" : "\u25BE";
      }
    }
    function paint(kind) {
      var st = ST[kind];
      if(!st.row || !st.row.isConnected || !st.mods) return;
      var cfg = KINDS[kind];
      // Menuen er åben: kroppen (chips) er flyttet over i #fluxDrop, så rækken alene dur ikke
      // som søgeområde — chip'ene males i begge scopes (bruger 2026-09-30: chip'ene løj mens
      // menuen stod åben). Hovedet (.sdn-count/.sdn-all) bliver altid i rækken.
      var dropEl = document.getElementById("fluxDrop");
      var dropScope = (dropEl && !dropEl.hidden && dropEl.dataset.row === cfg.rowId) ? dropEl : null;
      var ta = taFor(kind);
      if(!ta) return;
      var text = ta.value || "";
      var byKey = {};
      st.mods.forEach(function(m) { byKey[m.key] = m; });
      var onN = 0, totalN = 0, wCats = {};
      try { Array.prototype.forEach.call(st.row.querySelectorAll(".sdn-cat.sdn-single"), function(x) { wCats[x.dataset.cat] = 1; }); } catch(e) {}
      st.mods.forEach(function(m) {
        if(wCats[m.cat]) {
          var wt0 = tagsOf(m), wn0 = 0, wq0;
          for(wq0 = 0; wq0 < wt0.length; wq0++) if(hasTag(text, wt0[wq0])) wn0++;
          onN += wn0; totalN += wt0.length;
          paintWordChips(st, dropScope, m, wt0, text);
          paintWordBox(st, m, wn0, wt0.length);
          return;
        }
        var s = stateOf(text, m).state;
        if(s === "on") onN++;
        totalN++;
        var c = st.row.querySelector('.sdn-chip[data-key="' + m.key + '"]');
        if(!c && dropScope) c = dropScope.querySelector('.sdn-chip[data-key="' + m.key + '"]');
        if(!c) return;
        c.classList.toggle("on", s === "on");
        c.classList.remove("part");
        // 🖱 Hvor meget af blokkens ord er der i boksen lige nu? Kun beregnet for chips der ER
        // on/part (ellers er svaret pr. definition "ingen"), så det ikke koster noget i tick'en.
        if(c.dataset.hovertip !== undefined) {
          var wantTip = c.dataset.hovertip;
          if(s !== "off") {
            var fw = String(m.text || "").split(","), tot = 0, onw = 0;
            for(var wi = 0; wi < fw.length; wi++) {
              var w = fw[wi].trim(); if(!w) continue;
              tot++; if(hasTag(text, w)) onw++;
            }
            if(tot) wantTip += "\n\n" + ((onw === tot) ? ("All " + tot + " words are in the box.") : (onw + " of its " + tot + " words are in the box right now."));
          }
          if(c.title !== wantTip && !c.dataset.sdnTip) c.title = wantTip;
        }
      });
      // 🧬 Kategori-overskrifterne: status + "X/Y" pr. kategori, og den lille All on-knap farves
      // efter samme rød/gul/grøn-regel som chip'ene.
      var catEls = Array.prototype.slice.call(st.row.querySelectorAll(".sdn-cat"));
      if(dropScope) Array.prototype.forEach.call(dropScope.querySelectorAll(".sdn-cat"), function(e) { catEls.push(e); });
      for(var ci = 0; ci < catEls.length; ci++) {
        var catEl = catEls[ci], catKey = catEl.dataset.cat;
        // Tæl ud fra MODULERNE (ikke ud fra DOM-chips): chip'ene kan stå i dropdown-menuen mens
        // hovedet bliver i rækken (brugerønske 2026-10-15: kasser som Boxes), og tallet skal passe
        // mens menuen er åben.
        var con = 0, ctotal = 0;
        st.mods.forEach(function(cm) {
          if(cm.cat !== catKey) return;
          if(wCats[cm.cat]) {
            var cwt = tagsOf(cm);
            ctotal += cwt.length;
            for(var cwi = 0; cwi < cwt.length; cwi++) if(hasTag(text, cwt[cwi])) con++;
          } else {
            ctotal++;
            var cs = stateOf(text, cm).state;
            if(cs === "on") con++;
          }
        });
        var ccnt = catEl.querySelector(".sdn-catcnt");
        if(ccnt) {
          var ct = "";
          if(ccnt.textContent !== ct) ccnt.textContent = ct;
          if(ccnt.classList.contains("sdn-part")) ccnt.classList.remove("sdn-part");
          var cctip = con + " of " + ctotal + " on. " + (ctotal - con) + " off.";
          if(ccnt.title !== cctip) ccnt.title = cctip;
        }
        var cab = catEl.querySelector(".sdn-catall");
        if(cab) {
          var cAll = (ctotal && con === ctotal);
          cab.classList.toggle("on", con > 0);
          cab.classList.remove("part");
          var cabTxt = con ? (con + "/" + ctotal) : "";
          if(cab.textContent !== cabTxt) cab.textContent = cabTxt;
        }
      }
      // Til/fra-knappen for hele rækken: rød når intet er tændt, gul når noget er, grøn når alt er.
      // Teksten siger hvad et klik GØR, så knappen både læses som en status og som en handling.
      var ab = st.row.querySelector(".sdn-all");
      if(ab) {
        var allOn = (onN === totalN);
        ab.classList.toggle("on", onN > 0);
        ab.classList.remove("part");
        var abAp = allOn ? "true" : "false";
        if(ab.getAttribute("aria-pressed") !== abAp) ab.setAttribute("aria-pressed", abAp);
        // Tekst og farve skal sige det SAMME: knappen viser STATUS (grøn = alt tændt, gul = noget
        // tændt, rød = intet), ikke en handling. (Bruger 2026-10-01: "den står rød og viser 0 men siger all on".)
        var abTxt = onN ? (onN + "/" + totalN) : "";
        if(ab.textContent !== abTxt) ab.textContent = abTxt;
        var abTip = onN + " of " + totalN + " on. " + (allOn
          ? "Click to remove all " + totalN + " tags at once."
          : "Click to switch all " + totalN + " tags on at once (only the tags that are not already in the box are added).");
        if(ab.title !== abTip) ab.title = abTip;
      }
      var rsBtnEl = st.row.querySelector(".sdn-reset");
      if(rsBtnEl) {
        var rsOn = cfg.mine ? (onN > 0) : (totalN > 0 && onN < totalN);
        if(rsBtnEl.classList.contains("on") !== rsOn) rsBtnEl.classList.toggle("on", rsOn);
      }
      // Antallet af aktive blokke står ALTID i overskriften ("X/Y", brugerønske 2026-09-17), så status er
      // læsbar både foldet ind og foldet ud. Kun en reel ændring skrives (textContent erstatter altid
      // tekstnoden -> ellers fyrer MutationObserver i ring).
      var cnt = st.row.querySelector(".sdn-count");
      if(cnt) {
        // Tom ordbank (🧩-rækkerne): vis slet intet tal i stedet for et misvisende "0/0".
        // "on/total" = hvor mange blokke der er HELT tændt; hvis nogle kun er DELVIST tændt (gul),
        // tilføjes "▣N", så tallet ikke lyver om den gule tilstand (brugerønske 2026-09-24).
        var t = "";
        if(cnt.textContent !== t) cnt.textContent = t;
        if(cnt.classList.contains("sdn-part")) cnt.classList.remove("sdn-part");
        var ctip = totalN ? (onN + " of " + totalN + " tags on. " + (totalN - onN) + " off.") : "";
        if(cnt.title !== ctip) cnt.title = ctip;
      }
    }
    // ---- fold ind/ud (brugerønske 2026-09-27) -------------------------------------------------
    // The whole heading folds the row, exactly like 🏷 Tags / 🎛 Auto mixer / 🛠 Construction, and
    // the "function" (the clickable head + its tooltip) sits INSIDE the box. The fold is a view
    // preference, not content, so it lives in its own localStorage key instead of the per-tab state.
    // ⚠ Nøglen er bumpet til "-3" (2026-10-15): 🧬 Standard-rækkerne er nu KASSER (klik = menu
    // med chips), så neg/pos starter FOLDET UD (kasserne synlige), mens 🧩-rækkerne stadig starter
    // foldet ind. Uden bumpet ville en gammel, gemt "foldet ind"-tilstand skjule kasserne.
    var LS_STDFOLD = "fluxStdFold3";
    function stdFoldState() {
      var c = null;
      try { c = JSON.parse(localStorage.getItem(LS_STDFOLD) || "null"); } catch(e) {}
      return (c && typeof c === "object") ? { neg: !!c.neg, pos: !!c.pos, mine: !!c.mine, negmine: !!c.negmine } : { neg: false, pos: false, mine: true, negmine: true };
    }
    function saveStdFold(c) { try { localStorage.setItem(LS_STDFOLD, JSON.stringify(c)); } catch(e) {} }
    function applyStdFold(kind) {
      var row = ST[kind].row;
      if(!row) return;
      var folded = !!stdFoldState()[kind];
      if(row.classList.contains("folded") !== folded) row.classList.toggle("folded", folded);
      // NB: every write on this path (it runs on the 700ms tick AND after mutations) must be a no-op
      // when nothing changed - otherwise the MutationObserver re-fires for ever.
      var head = row.querySelector(".sdn-head");
      if(!head) return;
      var tip = KINDS[kind].tip + "\n\n" + (folded ? "Click the heading to fold this box out." : "Click the heading to fold this box in.");
      if(head.title !== tip) head.title = tip;
    }
    // 🧬 Finder-hook til kategori-menuerne (brugerønske 2026-10-15): dropdown-scriptet ejer
    // #fluxDrop, men kasserne bor her — find hoved + chip-wrapper ud fra række-id + kategori-nøgle.
    window.__fluxStdCats = { find: function(rowId, catKey) {
      var kind = null;
      ["neg", "pos"].forEach(function(k) {
        try { if(KINDS[k] && KINDS[k].rowId === rowId) kind = k; } catch(e) {}
      });
      if(!kind || !ST[kind] || !ST[kind].row || !ST[kind].row.isConnected) return null;
      var catEl = null;
      try { catEl = ST[kind].row.querySelector('.sdn-cat[data-cat="' + catKey + '"]'); } catch(e) {}
      if(!catEl) return null;
      return { kind: kind, catEl: catEl,
        headEl: catEl.querySelector(".sdn-cathead"),
        chipsEl: catEl.querySelector(".sdn-cats") };
    } };
    function buildOne(kind) {
      var cfg = KINDS[kind], st = ST[kind];
      var ta = taFor(kind);
      if(!ta) return;
      var list = getMods(kind);
      if(!list) return;
      if(!st.row) {
        // Fold ind/ud (brugerønske 2026-10-12): samme funktion bruges af både pilen og hele
        // overskriften, så et klik hvor som helst på hovedet folder rækken.
        var toggleFold = function() {
          var c = stdFoldState();
          c[kind] = !c[kind];
          saveStdFold(c);
          applyStdFold(kind);
          paint(kind);
        };
        st.row = document.createElement("div");
        st.row.id = cfg.rowId;
        // 🧩/➖ POLARITET (brugerønske 2026-09-26): den negative ordbank markeres med klassen
        // `flux-mine-neg`, så CSS'en kan give dens kontrol et RØDT MINUS (alt hvad der lægges i den
        // hører til "vil ikke have"), mens den positive ordbanks "+" er GRØN.
        st.row.className = cfg.cls + (kind === "negmine" ? " flux-mine-neg" : "");
        var head = document.createElement("div");
        head.className = "sdn-head";
        var lab = document.createElement("span");
        lab.className = "sdn-label";
        lab.textContent = cfg.label;
        head.appendChild(lab);
        var cnt = document.createElement("span");
        cnt.className = "sdn-count";
        head.appendChild(cnt);
        // 🧩 Mine ord: en lille ✏-knap der åbner ordbank-editoren (kun denne række har den).
        if(cfg.hasEditor) {
          var edBtn = document.createElement("button");
          edBtn.type = "button";
          edBtn.className = "sdn-edit";
          edBtn.textContent = "✏ Edit";
          edBtn.title = "Edit your personal word bank (one word or phrase per line). Each line becomes a chip.";
          edBtn.addEventListener("click", function(ev) { ev.preventDefault(); ev.stopPropagation(); openMineEditor(kind); });
          head.appendChild(edBtn);
        }
        // on/off-knap for hele rækken (se `toggleAll`). Ligger i overskriften, så den også kan bruges
        // når rækken er foldet ind - og den stopper event'et, så et klik ikke også folder rækken.
        var allBtn = document.createElement("button");
        allBtn.type = "button";
        allBtn.className = "sdn-all";
        allBtn.textContent = "";
        allBtn.addEventListener("click", function(ev) {
          ev.preventDefault(); ev.stopPropagation();
          toggleAll(kind);
        });
        head.appendChild(allBtn);
        var rsBtn = document.createElement("button");
        rsBtn.type = "button";
        rsBtn.className = "sdn-reset";
        rsBtn.textContent = "\u21BA";
        rsBtn.title = KINDS[kind].mine ? "Reset: remove all my words from the box" : "Default: switch all standard tags on again";
        rsBtn.setAttribute("aria-label", rsBtn.title);
        rsBtn.addEventListener("click", function(ev) {
          ev.preventDefault(); ev.stopPropagation();
          resetDefault(kind);
        });
        head.appendChild(rsBtn);
        head.addEventListener("click", function() { toggleFold(); });
        st.row.appendChild(head);
        var body = document.createElement("div");
        body.className = "sdn-body";
        // 🧬 "Motherboard": hvis modulerne har en `category` (og main.pjs har en kategori-liste),
        // bygges rækken som foldbare kategoriblokke med hver sin All on-knap. Ellers fladt som før.
        var catsInfo = null;
        try {
          if(cfg.catsFn && window.root && typeof root[cfg.catsFn] === "function") catsInfo = root[cfg.catsFn]();
        } catch(e) {}
        // ⭐ Egne standard-positive-ord får deres EGEN kategori ØVERST, så de er nemme at finde.
        if(cfg.userCat && list.some(function(m) { return m.cat === cfg.userCat; })) {
          catsInfo = [{ key: cfg.userCat, label: cfg.userCatLabel }].concat(catsInfo || []);
        }
        var grouped = !!(catsInfo && catsInfo.length && list.some(function(m) { return m.cat; }));
        var catWrapByKey = {};
        var singleBoxByCat = {};
        // 🧬 Kategori-blokke bruges KUN når en kategori rummer FLERE chips. Rummer den kun ÉN blok,
        // er kategori-overskriften og chippen det samme ord (dobbelt konfekt), så der bygges ingen
        // gruppe — chippen lægges fladt i rækken i stedet (brugerønske 2026-09-26). Det rammer især
        // 🚫 Standard Negative, hvor ALLE 18 kategorier har præcis én blok, så rækken bliver en flad
        // chip-række i stedet for 18 dropdowns der hver indeholder ét ord mere end overskriften.
        if(grouped) {
          catsInfo = catsInfo.filter(function(ci) {
            var n = list.filter(function(m) { return m.cat === ci.key; }).length;
            if (n > 1) return true;
            if (kind === "pos" && (ci.key === "quality" || ci.key === "ultraHd" || ci.key === "natural" || ci.key === "realistic")) return true;
            if (kind === "neg" && n >= 1) return true;
            return false;
          });
          if(catsInfo.length) body.classList.add("sdn-grouped");
          catsInfo.forEach(function(ci) {
            var catMods = list.filter(function(m) { return m.cat === ci.key; });
            if(!catMods.length) return;
            var isSingleBox = ((kind === "neg" || kind === "pos") && catMods.length === 1 && !catMods[0].user);
            var catEl = document.createElement("div");
            catEl.className = "sdn-cat" + (isSingleBox ? " sdn-single" : "");
            catEl.dataset.cat = ci.key;
            var chead = document.createElement("div");
            chead.className = "sdn-cathead";
            var caret = document.createElement("span");
            caret.className = "sdn-carett";
            caret.textContent = "\u25BE";
            var clab = document.createElement("span");
            clab.className = "sdn-catlab";
            clab.textContent = ci.label || ci.key;
            var ccnt = document.createElement("span");
            ccnt.className = "sdn-catcnt";
            var call = document.createElement("button");
            call.type = "button";
            call.className = "sdn-catall";
            call.textContent = "";
            call.addEventListener("click", function(ev) {
              ev.preventDefault(); ev.stopPropagation();
              toggleCats(kind, catMods);
            });
            chead.appendChild(caret); chead.appendChild(clab); chead.appendChild(ccnt); chead.appendChild(call);
            if(isSingleBox) {
              var sMod = catMods[0];
              var sTip = String(sMod.tip || "").trim(), sWords = String(sMod.text || "").trim();
              var sBase = (sTip && sWords) ? (sTip + "\n\n" + sWords) : (sTip || sWords);
              if(sBase) { chead.title = sBase; chead.dataset.hovertip = sBase; }
              try { chead.dataset.key = sMod.key; } catch(e) {}
              singleBoxByCat[ci.key] = sMod;
            }
            chead.addEventListener("click", function() {
              // 🧬 Standard-rækkerne (brugerønske 2026-10-15: kasser som Boxes med chips, ingen
              // flueben): kassens hoved åbner kun dens chips i en dropdown-menu i stedet for at
              // folde ud inline. Andre rækker folder som før.
              if((kind === "neg" || kind === "pos") && window.__fluxCatMenu && ST[kind].row) {
                if(window.__fluxRowMenu) { try { window.__fluxRowMenu.close(); } catch(e) {} }
                try { window.__fluxCatMenu.open(ST[kind].row.id, ci.key); } catch(e) {}
                return;
              }
              toggleCatFold(kind, catEl, caret);
            });
            catEl.appendChild(chead);
            var cwrap = document.createElement("div");
            cwrap.className = "sdn-cats";
            catEl.appendChild(cwrap);
            body.appendChild(catEl);
            catWrapByKey[ci.key] = cwrap;
          });
        }
        list.forEach(function(m) {
          if(singleBoxByCat[m.cat]) {
            var wtarget = catWrapByKey[m.cat];
            if(wtarget) {
              tagsOf(m).forEach(function(w, wi) {
                var wc = document.createElement("button");
                wc.type = "button";
                wc.className = "sdn-chip sdn-word";
                wc.dataset.key = m.key;
                wc.dataset.wi = String(wi);
                wc.textContent = w;
                wc.addEventListener("click", function(ev) {
                  ev.preventDefault(); ev.stopPropagation();
                  toggleWord(kind, m, wi, wc);
                });
                wtarget.appendChild(wc);
              });
            }
            return;
          }
          var target = (grouped && catWrapByKey[m.cat]) ? catWrapByKey[m.cat] : body;
          var c = document.createElement("button");
          c.type = "button";
          c.className = "sdn-chip";
          c.dataset.key = m.key;
          c.textContent = m.label || m.key;
          // Tooltip (batch 113): the chips only show their short label, so hovering must reveal the
          // EXACT text the chip writes into the box - important now that many chips are single words.
          // Hover (brugerønske): kun en forklaring når chippen IKKE selv siger ordet. Står hele
          // teksten allerede på pillen (fx "Deep wrinkles"), er der ingen grund til en tooltip;
          // ellers viser vi præcis den tekst klikket skriver ind i boksen — eller den korte,
          // engelske note fra main.pjs hvis der er en.
          var bareLab = String(m.label || "").toLowerCase().replace(/[^a-z0-9\u00e6\u00f8\u00e5\u00e4\u00f6\u00fc\u00e9\u00e8\u00ea\u00e7\u00f1 ]+/g, " ").replace(/\s+/g, " ").trim();
          var bareTxt = String(m.text || "").toLowerCase().replace(/[^a-z0-9\u00e6\u00f8\u00e5\u00e4\u00f6\u00fc\u00e9\u00e8\u00ea\u00e7\u00f1 ]+/g, " ").replace(/\s+/g, " ").trim();
          var chipNote = String(m.tip || "").trim();
          var chipWords = String(m.text || "").trim();
          // 🖱 Hover viser ALT hvad chippen kan slå til (hele ordlisten) - noten fra main.pjs (hvis
          // nogen) står øverst, ordene nedenunder. Selve til/fra-status lægges på i paint(), så
          // man også kan se HVOR MEGET der er slået til lige nu (brugerønske 2026-09-26).
          var baseTip = "";
          if(chipNote && chipWords) baseTip = chipNote + "\n\n" + chipWords;
          else if(chipNote) baseTip = chipNote;
          else if(chipWords && bareLab !== bareTxt) baseTip = chipWords;
          if(baseTip) { c.title = baseTip; c.dataset.hovertip = baseTip; }
          c.addEventListener("click", function(ev) {
            ev.preventDefault(); ev.stopPropagation();
            toggle(kind, m, c);
          });
          if(cfg.hasEditor || m.user) {
            // 🧩 Own Words + ⭐ egne standarder: chip + små knapper. ✕ SLETTER ordet fra den
            // pågældende bank (så man ikke skal ind i ✏-editoren for ét enkelt ord), og ★ (kun i
            // Own Words) gemmer ordet som en FAST standard. Klik rører ikke resten af prompten.
            var wrap = document.createElement("span");
            wrap.className = "sdn-chip-wrap";
            wrap.appendChild(c);
            if(cfg.hasEditor) {
              var star = document.createElement("button");
              star.type = "button";
              star.className = "sdn-chip-star";
              star.textContent = "★";
              star.setAttribute("aria-label", "Save this as a standard");
              star.title = "Save this word/phrase as a permanent standard. It moves out of Own Words and into that row.";
              star.addEventListener("click", function(ev) {
                ev.preventDefault(); ev.stopPropagation();
                openPromoteMenu(star, m.text || m.label, kind);
              });
              wrap.appendChild(star);
            }
            var x = document.createElement("button");
            x.type = "button";
            x.className = "sdn-chip-x";
            x.textContent = "✕";
            if(m.user) {
              x.setAttribute("aria-label", "Delete this from my standards");
              x.title = "Delete this from your own " + (m.user === "neg" ? "negative words" : "standard positive words") + " (and take its text out of the " + (m.user === "neg" ? "Negative" : "Description") + " box if it is in there).";
              x.addEventListener("click", function(ev) {
                ev.preventDefault(); ev.stopPropagation();
                deleteUserItem(m);
              });
            } else {
              x.setAttribute("aria-label", "Delete this word from my list");
              x.title = "Delete this word from my list (and take its text out of the Description box if it is in there).";
              x.addEventListener("click", function(ev) {
                ev.preventDefault(); ev.stopPropagation();
                deleteMineWord(m);
              });
            }
            wrap.appendChild(x);
            target.appendChild(wrap);
          } else {
            target.appendChild(c);
          }
        });
        // 🧩 Træk-og-slip i ordbankerne: chip'ene kan trækkes rundt, så rækkefølgen i
        // ordbanken ændres. Det er KUN visningsrækkefølgen - hvilke ord der er slået til, og hvad
        // der står i prompten, er fuldstændig uændret.
        if(cfg.mine) {
          var wraps = [].slice.call(body.querySelectorAll(":scope > .sdn-chip-wrap"));
          wraps.forEach(function(w) {
            w.draggable = true;
            w.title = "Drag to reorder your words.";
            w.addEventListener("dragstart", function(ev) {
              try { ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", w.querySelector(".sdn-chip").textContent); } catch(e) {}
              w.classList.add("sdn-dragging");
            });
            w.addEventListener("dragover", function(ev) {
              ev.preventDefault();
              var drag = body.querySelector(".sdn-dragging");
              if(!drag || drag === w) return;
              var r = w.getBoundingClientRect();
              var before = (ev.clientX < r.left + r.width / 2);
              if(before) body.insertBefore(drag, w); else body.insertBefore(drag, w.nextElementSibling);
            });
            w.addEventListener("dragend", function() {
              w.classList.remove("sdn-dragging");
              var words = [].slice.call(body.querySelectorAll(":scope > .sdn-chip-wrap")).map(function(x) { return x.querySelector(".sdn-chip").textContent.trim(); }).filter(Boolean);
              bankSet(kind, words);
              refreshMine(kind);
            });
          });
        }
        if(cfg.hasEditor && !list.length) {
          var hint = document.createElement("span");
          hint.className = "sdn-count";
          hint.textContent = "No words yet - type one below, or click \"✏ Edit\".";
          body.appendChild(hint);
        }
        // 🧩 Mine ord: et lille inline-felt, så et ord kan tilføjes MED DET SAMME (uden at åbne
        // ✏-editoren). Enter eller + tilføjer ordet som et nyt chip i ordbanken. Ordet må gerne
        // indeholde mellemrum (en frase), og det gemmes privat i denne browser - præcis som editoren.
        if(cfg.hasEditor) {
          var addWrap = document.createElement("span");
          addWrap.className = "sdn-addwrap";
          var addIn = document.createElement("input");
          addIn.type = "text";
          addIn.id = cfg.addId || "fluxMineAddInput";
          addIn.className = "sdn-addinput";
          // 🧩/➖ Samme felt i begge ordbanker, men med hver sin polaritet: "+" (grøn) i den positive,
          // "−" (rød) i den negative — så det er tydeligt at et ord her havner i "vil ikke have".
          var negBank = (kind === "negmine");
          addIn.placeholder = (negBank ? "\u2212" : "+") + " add a word\u2026";
          addIn.setAttribute("aria-label", negBank ? "Add a word to the negative word bank" : "Add a word to Own Words");
          addIn.title = negBank
            ? "Type a word or phrase and press Enter (or click \u2212) to add it to your NEGATIVE word bank as a new chip. The word is stored privately in this browser and is only ever written into the \uD83D\uDD8D\uFE0F Negative box."
            : "Type a word or phrase and press Enter (or click +) to add it to your own word bank as a new chip. The word is stored privately in this browser.";
          var addBtn = document.createElement("button");
          addBtn.type = "button";
          addBtn.className = "sdn-addbtn";
          addBtn.textContent = negBank ? "\u2212" : "+";
          addBtn.setAttribute("aria-label", negBank ? "Add the typed word to the negative bank" : "Add the typed word");
          addBtn.title = negBank
            ? "Add the typed word to your NEGATIVE word bank (as a new chip). It is only ever written into the \uD83D\uDD8D\uFE0F Negative box."
            : "Add the typed word to your own word bank (as a new chip).";
          var doAdd = function() {
            var w = addIn.value.trim();
            if(!w) { try { addIn.focus(); } catch(e) {} return; }
            bankSet(kind, bankGet(kind).concat([w]));
            window.__mineFocusAdd = kind;   // buildOne sætter fokus tilbage i feltet efter genbygget
            refreshMine(kind);
          };
          addIn.addEventListener("keydown", function(ev) {
            if(ev.key === "Enter") { ev.preventDefault(); ev.stopPropagation(); doAdd(); }
          });
          addIn.addEventListener("click", function(ev) { ev.stopPropagation(); });
          addBtn.addEventListener("click", function(ev) { ev.preventDefault(); ev.stopPropagation(); doAdd(); });
          addWrap.appendChild(addIn);
          addWrap.appendChild(addBtn);
          body.appendChild(addWrap);
        }
        st.row.appendChild(body);
        if(grouped) applyCatFolds(kind, body);
        if(cfg.hasEditor && !list.length) {
          var ab0 = st.row.querySelector(".sdn-all");
          if(ab0) ab0.style.display = "none";
        }
      }
      var anchor = cfg.anchor(ta);
      // Ramme-ankre (#stdPosFrame/#stdNegFrame + trio-rammerne): rækken bor I rammen
      // (brugerønske 2026-10-01 + 2026-10-04: 🧩 Own Words genbygges VED SIN EGEN ramme, så den
      // ikke hopper via #fluxTabBox ved hvert ord der tilføjes/slettes).
      // Læg den ind i rammen her (den er evt. helt ny og dermed usynlig for vagthunderne),
      // så vagthunderne (ensurePromptFrames + orderTop) derefter holder den på plads.
      if(anchor && (anchor.id === "stdPosFrame" || anchor.id === "stdNegFrame" || anchor.id === "posTrioFrame" || anchor.id === "negTrioFrame" || anchor.id === "autoPanelFrame" || anchor.id === "fluxStdRows")) {
        if(st.row.parentElement !== anchor) anchor.appendChild(st.row);
        anchor = null;
      }
      if(anchor && st.row.previousElementSibling !== anchor) anchor.insertAdjacentElement("afterend", st.row);
      applyStdFold(kind);
      paint(kind);
      // Efter et ord er tilføjet med inline-feltet: sæt fokus tilbage i feltet, så man kan skrive
      // flere ord i træk. Det sker først HER, fordi feltet kun kan få fokus når rækken er i DOM'en.
      if(window.__mineFocusAdd === kind) {
        window.__mineFocusAdd = false;
        var ai = document.getElementById(cfg.addId || "fluxMineAddInput");
        if(ai) { try { ai.focus(); } catch(e) {} }
      }
    }
    // 🧩 Mine-ord-editor: en lille modal, hvor ordbanken redigeres (ét ord/frase pr. linje). Den kan
    // også "📥 Import from prompt", som fylder boksen med alle comma/linje-dele af den nuværende
    // Description, så man hurtigt kan beholde sine EGNE ord og slette resten.
    function openMineEditor(kind) {
      kind = kind || "mine";
      var overlay = document.createElement("div");
      overlay.className = "flux-pf-overlay";
      var panel = document.createElement("div");
      panel.className = "flux-pf-panel";
      var head = document.createElement("div");
      head.className = "flux-pf-head";
      head.textContent = (kind === "negmine") ? "\ud83e\udde9 Own Words (negative) - edit your own words" : "\ud83e\udde9 Own Words - edit your own words";
      panel.appendChild(head);
      var note = document.createElement("div");
      note.className = "flux-pf-note";
      note.textContent = (kind === "negmine")
        ? "One negative word or phrase per line. Each line becomes a chip: switch it on to put exactly that text into the Negative box, switch it off to take it out again. The rest of your negative prompt is never touched. The list is stored privately in this browser. You can also add a word straight from the row with the \u2212 add a word field."
        : "One word or phrase per line. Each line becomes a chip: switch it on to put exactly that text into the Description box, switch it off to take it out again. The rest of your prompt is never touched. The list is stored privately in this browser. You can also add a word straight from the row with the + add a word field.";
      panel.appendChild(note);
      var wrap = document.createElement("div");
      wrap.style.cssText = "flex:1 1 auto; min-height:0; overflow:auto;";
      var ta = document.createElement("textarea");
      ta.value = bankGet(kind).join("\n");
      ta.placeholder = "freckles naturally scattered across the bridge of her nose\nvisible skin-pores\nsubtle realistic natural skin-imperfections";
      ta.style.cssText = "width:100%; box-sizing:border-box; min-height:180px; font:inherit; font-size:0.82rem; line-height:1.45; padding:0.5rem; border-radius:6px; border:1px solid rgba(128,128,128,0.45); background:light-dark(#ffffff,#26282b); color:inherit; resize:vertical; white-space:pre-wrap;";
      wrap.appendChild(ta);
      panel.appendChild(wrap);
      var foot = document.createElement("div");
      foot.className = "flux-pf-foot";
      var imp = document.createElement("button");
      imp.type = "button"; imp.className = "flux-pf-btn"; imp.textContent = "📥 Import from prompt";
      imp.style.marginRight = "auto";
      imp.title = "Fill the box with every comma/newline part of the current Description, so you can keep the ones that are YOURS and delete the rest.";
      var cancel = document.createElement("button");
      cancel.type = "button"; cancel.className = "flux-pf-btn"; cancel.textContent = "Cancel";
      var save = document.createElement("button");
      save.type = "button"; save.className = "flux-pf-btn primary"; save.textContent = "Save";
      foot.appendChild(imp); foot.appendChild(cancel); foot.appendChild(save);
      panel.appendChild(foot);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);
      function close() { document.removeEventListener("keydown", onKey, true); overlay.remove(); }
      function onKey(e) { if(e.key === "Escape") { e.preventDefault(); close(); } }
      document.addEventListener("keydown", onKey, true);
      overlay.addEventListener("mousedown", function(e) { if(e.target === overlay) close(); });
      cancel.addEventListener("click", close);
      imp.addEventListener("click", function() {
        var src = taFor(kind);
        if(!src) return;
        var parts = splitParts(src.value || "").map(function(p) { return p.part.trim(); }).filter(Boolean);
        var seen = {}, out = [];
        parts.forEach(function(p) { var k = p.toLowerCase(); if(!seen[k]) { seen[k] = 1; out.push(p); } });
        if(out.length) ta.value = out.join("\n");
        ta.focus();
      });
      save.addEventListener("click", function() {
        bankSet(kind, ta.value.split("\n"));
        close();
        refreshMine(kind);
      });
      ta.focus();
    }

    function build() { buildOne("neg"); buildOne("pos"); buildOne("mine"); buildOne("negmine"); }

    var sdnTip = null, sdnCur = null, sdnMX = 0, sdnMY = 0, sdnRaf = 0, sdnDwell = 0, sdnSaved = null;
    function sdnCap(s) { var t = String(s == null ? "" : s); return t.charAt(0).toUpperCase() + t.slice(1); }
    function sdnKind(chip) {
      var d = (chip && chip.closest) ? chip.closest("#fluxDrop") : null;
      var r = (d && d.dataset) ? d.dataset.row : "";
      if(r === "fluxStdPosRow") return "pos";
      if(r === "fluxStdNegRow") return "neg";
      var row = (chip && chip.closest) ? chip.closest("#fluxStdPosRow, #fluxStdNegRow") : null;
      if(row && row.id === "fluxStdPosRow") return "pos";
      if(row && row.id === "fluxStdNegRow") return "neg";
      return null;
    }
    function sdnMod(kind, key) {
      var list = getMods(kind) || [], i;
      for(i = 0; i < list.length; i++) if(String(list[i].key) === String(key)) return list[i];
      return null;
    }
    function sdnEnsure() {
      if(sdnTip && sdnTip.isConnected) return sdnTip;
      sdnTip = document.createElement("div");
      sdnTip.id = "sdnHoverTip";
      document.body.appendChild(sdnTip);
      return sdnTip;
    }
    function sdnHide() {
      sdnCur = null;
      if(sdnDwell) { try { clearTimeout(sdnDwell); } catch(e) {} sdnDwell = 0; }
      if(sdnSaved) {
        try { sdnSaved[0].setAttribute("title", sdnSaved[1]); } catch(e) {}
        try { delete sdnSaved[0].dataset.sdnTip; } catch(e) {}
        sdnSaved = null;
      }
      if(sdnTip) sdnTip.classList.remove("on");
    }
    function sdnPlace() {
      if(!sdnTip || !sdnTip.classList.contains("on")) return;
      var pad = 14, vw = window.innerWidth || 0, vh = window.innerHeight || 0;
      var w = sdnTip.offsetWidth, h = sdnTip.offsetHeight;
      var x = sdnMX + pad, y = sdnMY + pad;
      if(x + w > vw - 8) x = sdnMX - w - pad;
      if(x < 8) x = 8;
      if(y + h > vh - 8) y = sdnMY - h - pad;
      if(y < 8) y = 8;
      sdnTip.style.left = Math.round(x) + "px";
      sdnTip.style.top = Math.round(y) + "px";
    }
    function sdnShow(chip) {
      var kind = sdnKind(chip);
      if(!kind || !chip.dataset) { sdnHide(); return; }
      var m = sdnMod(kind, chip.dataset.key);
      if(!m) { sdnHide(); return; }
      var ta = taFor(kind);
      var text = ta ? (ta.value || "") : "";
      var tags = tagsOf(m), on = 0, i;
      var isSent = (m.cat === "sents");
      var units = isSent ? [String(m.text || "")] : tags;
      var noun = isSent ? "sentences" : "words";
      var e = sdnEnsure();
      e.innerHTML = "";
      var note = String(m.tip || "").trim();
      if(!note) { sdnHide(); return; }
      var n = document.createElement("span");
      n.className = "sdn-tip-note";
      n.textContent = sdnCap(note);
      e.appendChild(n);
      e.classList.add("on");
      sdnPlace();
      sdnCur = chip;
      if(chip.hasAttribute("title")) {
        sdnSaved = [chip, chip.getAttribute("title")];
        chip.removeAttribute("title");
      }
      chip.dataset.sdnTip = "1";
    }
    document.addEventListener("mouseover", function(ev) {
      var t = ev && ev.target;
      if(!t || !t.closest) return;
      var chip = t.closest(".sdn-chip, .sdn-cat.sdn-single > .sdn-cathead");
      if(!chip || !sdnKind(chip)) return;
      if(chip === sdnCur) { sdnPlace(); return; }
      sdnHide();
      sdnCur = chip;
      if(chip.hasAttribute("title")) {
        sdnSaved = [chip, chip.getAttribute("title")];
        chip.removeAttribute("title");
      }
      chip.dataset.sdnTip = "1";
      if(sdnDwell) { try { clearTimeout(sdnDwell); } catch(e) {} }
      sdnDwell = setTimeout(function() { sdnDwell = 0; try { sdnShow(chip); } catch(e) {} }, 350);
    }, true);
    document.addEventListener("mouseout", function(ev) {
      var t = ev && ev.target;
      if(!t || !t.closest) return;
      var chip = t.closest(".sdn-chip, .sdn-cat.sdn-single > .sdn-cathead");
      if(chip && chip === sdnCur && (!ev.relatedTarget || !chip.contains(ev.relatedTarget))) sdnHide();
    }, true);
    document.addEventListener("mousemove", function(ev) {
      sdnMX = ev.clientX; sdnMY = ev.clientY;
      if(!sdnTip || !sdnTip.classList.contains("on") || sdnRaf) return;
      sdnRaf = requestAnimationFrame(function() { sdnRaf = 0; sdnPlace(); });
    }, true);
    document.addEventListener("click", function() { sdnHide(); }, true);
    window.addEventListener("scroll", function() { sdnHide(); }, true);
    window.addEventListener("resize", function() { sdnHide(); });
    window.addEventListener("blur", function() { sdnHide(); });

    build();
    setInterval(build, 700);
    // The framework/tag-box scripts can rebuild the prompt area; keep the row pinned and repainted.
    try {
      var ct = null;
      new MutationObserver(function() {
        if(ct) clearTimeout(ct);
        ct = setTimeout(build, 150);
      }).observe(document.body, { childList: true, subtree: true });
    } catch(e) {}
  })();
  };
})();