(function () {
  "use strict";
  if (window.__fluxBoxesInit) return;
  // Fluxinator prompt-tool boxes (Skin/Body/Face/Hair/Nature/Age motherboards + tag
  // boxes + param boxes), vendored from fluxinator's index.html. Runs on demand when
  // the native Flux tab renders (needs #paramFrame + #fluxDescTa in the DOM).
  window.__fluxBoxesInit = function () {
    if (document.querySelector("#paramFrame .fxp-head")) return; // already mounted
    window.__fluxBoxesGen = (window.__fluxBoxesGen || 0) + 1;
    var __fluxInitGen = window.__fluxBoxesGen;
  (function() {
    // 🧍 "Body & face" — the PARAMETER motherboard. Each parameter (Jawline, Hips, Eyes, ...) is a
    // MULTI-SELECT dropdown: you can tick several words for the same parameter (they never cancel each
    // other) and they combine into ONE natural phrase, e.g. "a broad prominent sharply defined
    // jawline", "wide hips with saddlebags" or "a narrow waist". Every parameter writes exactly ONE
    // comma-part ("slot") into the Description box, so the other parameters and the user's own text are
    // left alone. The words + composition rule live in main.pjs (the bodyParams list and
    // bodyParamPhrase); this script only builds the grid and writes the phrase.
    var LS = "fluxBodyParams";        // { paramKey: ["broad", "prominent"] }
    var LSP = "fluxBodyParamsPrev";   // { paramKey: "the phrase we last wrote into the box" }
    var LSF = "fluxParamFold";        // "1" = the whole box is folded in
    var DEFS = null;
    var state = {}, prev = {};
    var lastBox = null;
    var armed = false, hookEl = null;
    var box = null, gridEl = null, pop = null, popKey = null, clearBtn = null;

    function loadJSON(k) { try { var o = JSON.parse(localStorage.getItem(k) || "null"); return (o && typeof o === "object") ? o : {}; } catch(e) { return {}; } }
    function saveJSON(k, o) { try { localStorage.setItem(k, JSON.stringify(o)); } catch(e) {} }
    function defs() {
      if(DEFS) return DEFS;
      try { if(window.root && typeof root.bodyParamsList === "function") DEFS = root.bodyParamsList(); } catch(e) {}
      return DEFS || null;
    }
    function ta() { return document.querySelector('#fluxDescTa'); }
    // tag-aware helpers (same idea as the 🧬 chip engine: a phrase is ONE comma/newline part)
    function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").replace(/^[\s,]+/, "").replace(/[\s,.!;:]+$/, ""); }
    function splitParts(text) {
      var s = String(text == null ? "" : text), out = [], buf = "", sep = "";
      for(var i = 0; i < s.length; i++) { var ch = s.charAt(i); if(ch === "," || ch === "\n") { out.push({ sep: sep, part: buf }); buf = ""; sep = ch; } else buf += ch; }
      out.push({ sep: sep, part: buf });
      return out;
    }
    function hasTag(text, tag) { var t = norm(tag), list = splitParts(text); for(var i = 0; i < list.length; i++) if(norm(list[i].part) === t) return true; return false; }
    function addGentle(text, word) { var s = String(text == null ? "" : text); if(hasTag(s, word)) return s; if(!s.trim()) return String(word); return s.replace(/\s+$/, "") + ", " + String(word); }
    function removeGentle(text, word) {
      var t = norm(word), s = String(text == null ? "" : text), ranges = [], start = 0;
      for(var i = 0; i < s.length; i++) { var ch = s.charAt(i); if(ch === "," || ch === "\n") { ranges.push({ s: start, e: i }); start = i + 1; } }
      ranges.push({ s: start, e: s.length });
      for(var r = ranges.length - 1; r >= 0; r--) {
        var rg = ranges[r];
        if(norm(s.slice(rg.s, rg.e)) !== t) continue;
        var from, to;
        if(rg.s > 0) { from = rg.s - 1; to = rg.e; } else { from = 0; to = (ranges.length > 1 ? ranges[1].s : rg.e); }
        s = s.slice(0, from) + s.slice(to);
        break;
      }
      return s.replace(/^[\s,]+/, "").replace(/\s+$/, "");
    }
    function writeTa(text) { var t = ta(); if(!t) return; t.value = text; t.dispatchEvent(new Event("input", { bubbles: true })); }
    // Compose the phrase (mirrors bodyParamPhrase in main.pjs so the preview matches what is written).
    function compose(def, words) {
      var sel = words || [];
      if(!sel.length) return "";   // no words ticked = this parameter writes nothing at all
      var inc = function(w) { for(var i = 0; i < sel.length; i++) if(String(sel[i]) === String(w)) return true; return false; };
      var pre = (def.pre || []).filter(inc), post = (def.post || []).filter(inc);
      var core = [];
      if(pre.length) core.push(pre.join(" "));
      if(def.subject) core.push(def.subject);
      var s = core.join(" ");
      if(!s && post.length) s = "figure";
      if(!s) return "";
      if(def.article) s = def.article + " " + s;
      if(post.length) s += " with " + post.join(" and ");
      return s;
    }
    function __escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
    function extractWords(def, phrase) {
      var hay = " " + norm(phrase) + " ", seen = {};
      (def.pre || []).concat(def.post || []).forEach(function(w) {
        w = String(w); if(seen[w]) return;
        try { if(hay.search(new RegExp("\\b" + __escRe(norm(w)) + "\\b", "i")) !== -1) { seen[w] = 1; } } catch(e) {}
      });
      var ord = [];
      (def.pre || []).forEach(function(w) { if(seen[String(w)] && ord.indexOf(w) === -1) ord.push(w); });
      (def.post || []).forEach(function(w) { if(seen[String(w)] && ord.indexOf(w) === -1) ord.push(w); });
      return ord;
    }
    function reconcile(key, allowClear) {
      var ds = defs(); if(!ds) return false;
      var def = null; for(var i = 0; i < ds.length; i++) if(ds[i].key === key) def = ds[i];
      if(!def) return false;
      var t = ta(); if(!t) return false;
      var text = t.value || "", words = state[key] || [];
      var phrase = compose(def, words);
      if(phrase && hasTag(text, phrase)) return false;
      var cand = prev[key] || "";
      if(cand && hasTag(text, cand)) {
        var healed = extractWords(def, cand);
        if(healed.length && healed.join("\u0001") !== words.join("\u0001")) {
          state[key] = healed; saveJSON(LS, state); return true;
        }
        return false;
      }
      if(allowClear && words.length) {
        state[key] = []; saveJSON(LS, state);
        if(prev[key]) { delete prev[key]; saveJSON(LSP, prev); }
        return true;
      }
      return false;
    }
    function apply(key) {
      var ds = defs(); if(!ds) return;
      var def = null; for(var i = 0; i < ds.length; i++) if(ds[i].key === key) def = ds[i];
      if(!def) return;
      var t = ta(); if(!t) return;
      var old = prev[key] || "";
      var nu = compose(def, state[key] || []);
      var text = t.value || "";
      if(old && hasTag(text, old)) text = removeGentle(text, old);
      if(nu) text = addGentle(text, nu);
      if(text !== t.value) writeTa(text);
      if(nu) prev[key] = nu; else delete prev[key];
      saveJSON(LSP, prev);
      paint();
    }
    function clearAll() {
      var t = ta(), text = t ? (t.value || "") : "";
      Object.keys(state).forEach(function(k) { var old = prev[k]; if(old && hasTag(text, old)) text = removeGentle(text, old); });
      if(t && text !== t.value) writeTa(text);
      state = {}; prev = {}; saveJSON(LS, state); saveJSON(LSP, prev);
      paint();
    }
    function paint() {
      if(!box) return;
      var ds = defs() || [], text = (ta() ? (ta().value || "") : "");
      var on = 0;
      var __ext = false;
      var __ta = null; try { __ta = ta(); } catch(__te) {}
      if(__ta && hookEl !== __ta) { hookEl = __ta; try { __ta.addEventListener("input", function(e) { if(e && e.isTrusted) { armed = true; } }); } catch(__he) {} }
      if(lastBox !== null && text !== lastBox && armed) { __ext = true; }
      lastBox = text;
      ds.forEach(function(d) {
        try { reconcile(d.key, __ext); } catch(__re) {}
        var words = state[d.key] || [];
        var trig = box.querySelector('.fxp-trig[data-key="' + d.key + '"]');
        if(!trig) return;
        var phrase = compose(d, words);
        var inBox = phrase ? hasTag(text, phrase) : false;
        trig.classList.toggle("has", inBox);
        var pv = trig.querySelector(".fxp-preview");
        if(pv && pv.textContent !== phrase) pv.textContent = phrase;
        var rb = box.querySelector('.fxp-catreset[data-key="' + d.key + '"]');
        if(rb) rb.classList.toggle("on", words.length > 0);
        if(phrase) on++;
      });
      if(pop && pop.classList.contains("open") && popKey) {
        try {
          Array.prototype.forEach.call(pop.querySelectorAll(".fxp-opt"), function(b) {
            if(b.__w === undefined || b.__w === null) return;
            var __on = (state[popKey] || []).indexOf(b.__w) !== -1;
            b.classList.toggle("on", __on);
            var __ck = b.querySelector(".fxp-chk");
            if(__ck) { var __ct = __on ? "\u2611" : "\u2610"; if(__ck.textContent !== __ct) __ck.textContent = __ct; }
          });
        } catch(__pr) {}
      }
      var c = box.querySelector(".fxp-count");
      if(c) { var s = ""; if(c.textContent !== s) c.textContent = s; if(String(c.dataset.n || "") !== String(on)) c.dataset.n = String(on); }
      if(clearBtn) {
        var isOn = on > 0;
        clearBtn.classList.toggle("on", isOn);
        var bt = "\u21BA";
        if(clearBtn.textContent !== bt) clearBtn.textContent = bt;
        var btt = isOn ? "Resets Box & Removes all tags this box added to your prompt" : "";
        if(clearBtn.title !== btt) clearBtn.title = btt;
        if(clearBtn.getAttribute("aria-label") !== "Reset") clearBtn.setAttribute("aria-label", "Reset");
      }
    }
    function closePop() { if(pop) pop.classList.remove("open"); popKey = null; }
    function optBtn(def, w, isPost) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "fxp-opt";
      b.__w = w;
      var on = (state[def.key] || []).indexOf(w) !== -1;
      if(on) b.classList.add("on");
      var ck = document.createElement("span"); ck.className = "fxp-chk"; ck.textContent = on ? "\u2611" : "\u2610";
      var tx = document.createElement("span"); tx.textContent = isPost ? ("with " + w) : w;
      b.appendChild(ck); b.appendChild(tx);
      b.addEventListener("click", function(ev) {
        ev.preventDefault(); ev.stopPropagation();
        var arr = state[def.key] ? state[def.key].slice() : [];
        var __wasOn = arr.indexOf(w) !== -1;
        var __before = compose(def, arr);
        var j = arr.indexOf(w);
        if(j === -1) arr.push(w); else arr.splice(j, 1);
        state[def.key] = arr; saveJSON(LS, state);
        apply(def.key);
        if(__wasOn && __before) { try { var __t2 = ta(); if(__t2 && hasTag(__t2.value || "", __before)) writeTa(removeGentle(__t2.value, __before)); } catch(__be) {} }
        var on2 = arr.indexOf(w) !== -1;
        b.classList.toggle("on", on2);
        ck.textContent = on2 ? "\u2611" : "\u2610";
      });
      return b;
    }
    function openPop(def, trig) {
      popKey = def.key;
      pop.innerHTML = "";
      (def.pre || []).forEach(function(w) { pop.appendChild(optBtn(def, w, false)); });
      (def.post || []).forEach(function(w) { pop.appendChild(optBtn(def, w, true)); });
      pop.classList.add("open");
      // Popoveren hænger på sin MENU: page-koordinater (ikke viewport), så den ikke "flyder" løs
      // over siden men bliver siddende under sin egen trigger — også når man scroller.
      var r = trig.getBoundingClientRect();
      var w = pop.offsetWidth;
      var sx = window.pageXOffset || document.documentElement.scrollLeft || 0;
      var sy = window.pageYOffset || document.documentElement.scrollTop || 0;
      var left = Math.max(6, Math.min(r.left + sx, (document.documentElement.clientWidth || window.innerWidth) - w - 6 + sx));
      pop.style.left = left + "px";
      pop.style.top = (r.bottom + sy + 4) + "px";
    }
    function place() {
      if(!box) return;
      var df = document.getElementById("paramFrame") || document.getElementById("descFrame") || (ta() && ta().closest(".prompt-frame"));
      if(!df) return;
      var after = document.getElementById("fluxHairstyleBox") || document.getElementById("fluxHairTagBox") || document.getElementById("fluxProfessionBox") || document.getElementById("fluxFoldBar");
      if(!after) { if(box.parentElement !== df) df.appendChild(box); return; }
      if(after.nextElementSibling !== box) after.insertAdjacentElement("afterend", box);
    }
    function build() {
      var ds = defs();
      if(!ds || !ds.length) return;
      if(!pop) { pop = document.createElement("div"); pop.id = "fxpPop"; pop.className = "fxp-pop"; document.body.appendChild(pop); }
      if(box && box.isConnected) { place(); paint(); return; }
      box = document.createElement("div");
      box.id = "fluxParamBox";
      box.className = "fxp-box";
      var head = document.createElement("div"); head.className = "fxp-head";
      var car = document.createElement("span"); car.className = "fxp-car"; car.textContent = "\u25BE";
      var lab = document.createElement("span"); lab.className = "fxp-label"; lab.textContent = "\ud83e\uddcd Body:";
      var cnt = document.createElement("span"); cnt.className = "fxp-count"; cnt.textContent = "0/" + ds.length;
      var clr = document.createElement("button"); clearBtn = clr;
      clr.type = "button"; clr.className = "fxp-clear"; clr.textContent = "\u21BA";
      clr.title = "";
      clr.addEventListener("click", function(ev) { ev.preventDefault(); ev.stopPropagation(); clearAll(); });
      head.appendChild(car); head.appendChild(lab); head.appendChild(cnt); head.appendChild(clr);
      head.addEventListener("click", function() {
        var f = !box.classList.contains("folded");
        box.classList.toggle("folded", f);
        car.textContent = f ? "\u25B8" : "\u25BE";
        try { localStorage.setItem(LSF, f ? "1" : "0"); } catch(e) {}
        try { paint(); } catch(e) {}
      });
      box.appendChild(head);
      var body = document.createElement("div"); body.className = "fxp-body";
      gridEl = document.createElement("div"); gridEl.className = "fxp-grid";
      ds.forEach(function(d) {
        var p = document.createElement("div"); p.className = "fxp-param"; p.dataset.key = d.key;
        var trig = document.createElement("button");
        trig.type = "button"; trig.className = "fxp-trig"; trig.dataset.key = d.key;
        trig.title = "Pick one or more words for the " + String(d.label).toLowerCase() + ". Several can be on at once, and they combine into one phrase in the Description box.";
        var nm = document.createElement("span"); nm.className = "fxp-name"; nm.textContent = d.label;
        var pv = document.createElement("span"); pv.className = "fxp-preview";
        var ca = document.createElement("span"); ca.className = "fxp-car2"; ca.textContent = "\u25BE";
        trig.appendChild(nm); trig.appendChild(pv); trig.appendChild(ca);
        trig.addEventListener("click", function(ev) {
          ev.preventDefault(); ev.stopPropagation();
          if(pop.classList.contains("open") && popKey === d.key) closePop(); else openPop(d, trig);
        });
        p.appendChild(trig);
        var rs = document.createElement("button");
        rs.type = "button"; rs.className = "fxp-catreset"; rs.dataset.key = d.key; rs.textContent = "\u21BA";
        rs.title = "Reset " + d.label + " \u2014 remove what this parameter added (your own text is never touched).";
        rs.setAttribute("aria-label", "Reset " + d.label);
        rs.addEventListener("click", function(ev) { ev.preventDefault(); ev.stopPropagation(); state[d.key] = []; saveJSON(LS, state); apply(d.key); });
        p.appendChild(rs);
        gridEl.appendChild(p);
      });
      body.appendChild(gridEl);
      box.appendChild(body);
      try { if(localStorage.getItem(LSF) !== "0") { box.classList.add("folded"); car.textContent = "\u25B8"; } } catch(e) { try { box.classList.add("folded"); car.textContent = "\u25B8"; } catch(_){} }
      document.addEventListener("click", function(ev) {
        if(!pop || !pop.classList.contains("open")) return;
        var t = ev.target;
        if(t && pop.contains(t)) return;
        var trg = (t && t.closest) ? t.closest(".fxp-trig") : null;
        if(trg && box && box.contains(trg)) return;
        closePop();
      }, true);
      document.addEventListener("keydown", function(ev) { if(ev.key === "Escape") closePop(); });
      window.addEventListener("resize", closePop);
      // (Ingen close-på-scroll mere: popoveren ligger nu i PAGE-koordinater og følger sin egen menu.)
      place();
      paint();
    }
    state = loadJSON(LS);
    prev = loadJSON(LSP);
    try {
      var __killJunk = function(w) { w = String(w == null ? "" : w); return w.indexOf("//") !== -1 || w.indexOf("L\u00E6ser") !== -1; };
      var __fixed = false, __k;
      for (__k in state) { if (Array.isArray(state[__k])) { var __f = state[__k].filter(function(w) { return !__killJunk(w); }); if (__f.length !== state[__k].length) { state[__k] = __f; __fixed = true; } } }
      for (__k in prev) { if (typeof prev[__k] === "string" && __killJunk(prev[__k])) { delete prev[__k]; __fixed = true; } }
      if (__fixed) { saveJSON(LS, state); saveJSON(LSP, prev); }
      var __t = (typeof ta === "function") ? ta() : null;
      if (__t && __killJunk(__t.value)) {
        var __parts = splitParts(__t.value), __keep = [], __i, __j, __s = "";
        for (__i = 0; __i < __parts.length; __i++) { if (!__killJunk(__parts[__i].part)) __keep.push(__parts[__i]); }
        for (__j = 0; __j < __keep.length; __j++) { if (__j > 0) __s += (__keep[__j].sep || ","); __s += __keep[__j].part; }
        __s = __s.replace(/^[\s,]+/, "").replace(/\s+$/, "");
        if (__s !== __t.value) writeTa(__s);
      }
    } catch (__e) {}
    build();
    var __genTimer = setInterval(function() { if (window.__fluxBoxesGen !== __fluxInitGen) { try { clearInterval(__genTimer); } catch(__ce) {} return; } build(); }, 700);
    try {
      window.addEventListener("storage", function(e) {
        if(e && (e.key === LS || e.key === LSP)) {
          state = loadJSON(LS); prev = loadJSON(LSP);
          try { paint(); } catch(__se) {}
        }
      });
    } catch(__se) {}
  })();
  (function() {
    // 🧍 "Body & face" — the PARAMETER motherboard. Each parameter (Jawline, Hips, Eyes, ...) is a
    // MULTI-SELECT dropdown: you can tick several words for the same parameter (they never cancel each
    // other) and they combine into ONE natural phrase, e.g. "a broad prominent sharply defined
    // jawline", "wide hips with saddlebags" or "a narrow waist". Every parameter writes exactly ONE
    // comma-part ("slot") into the Description box, so the other parameters and the user's own text are
    // left alone. The words + composition rule live in main.pjs (the bodyParams list and
    // bodyParamPhrase); this script only builds the grid and writes the phrase.
    var LS = "fluxSkinParams";        // { paramKey: ["broad", "prominent"] }
    var LSP = "fluxSkinParamsPrev";   // { paramKey: "the phrase we last wrote into the box" }
    var LSF = "fluxSkinParamFold";        // "1" = the whole box is folded in
    var DEFS = null;
    var state = {}, prev = {};
    var lastBox = null;
    var armed = false, hookEl = null;
    var box = null, gridEl = null, pop = null, popKey = null, clearBtn = null;

    function loadJSON(k) { try { var o = JSON.parse(localStorage.getItem(k) || "null"); return (o && typeof o === "object") ? o : {}; } catch(e) { return {}; } }
    function saveJSON(k, o) { try { localStorage.setItem(k, JSON.stringify(o)); } catch(e) {} }
    function defs() {
      if(DEFS) return DEFS;
      try { if(window.root && typeof root.skinParamsList === "function") DEFS = root.skinParamsList(); } catch(e) {}
      return DEFS || null;
    }
    function ta() { return document.querySelector('#fluxDescTa'); }
    // tag-aware helpers (same idea as the 🧬 chip engine: a phrase is ONE comma/newline part)
    function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").replace(/^[\s,]+/, "").replace(/[\s,.!;:]+$/, ""); }
    function splitParts(text) {
      var s = String(text == null ? "" : text), out = [], buf = "", sep = "";
      for(var i = 0; i < s.length; i++) { var ch = s.charAt(i); if(ch === "," || ch === "\n") { out.push({ sep: sep, part: buf }); buf = ""; sep = ch; } else buf += ch; }
      out.push({ sep: sep, part: buf });
      return out;
    }
    function hasTag(text, tag) { var t = norm(tag), list = splitParts(text); for(var i = 0; i < list.length; i++) if(norm(list[i].part) === t) return true; return false; }
    function addGentle(text, word) { var s = String(text == null ? "" : text); if(hasTag(s, word)) return s; if(!s.trim()) return String(word); return s.replace(/\s+$/, "") + ", " + String(word); }
    function removeGentle(text, word) {
      var t = norm(word), s = String(text == null ? "" : text), ranges = [], start = 0;
      for(var i = 0; i < s.length; i++) { var ch = s.charAt(i); if(ch === "," || ch === "\n") { ranges.push({ s: start, e: i }); start = i + 1; } }
      ranges.push({ s: start, e: s.length });
      for(var r = ranges.length - 1; r >= 0; r--) {
        var rg = ranges[r];
        if(norm(s.slice(rg.s, rg.e)) !== t) continue;
        var from, to;
        if(rg.s > 0) { from = rg.s - 1; to = rg.e; } else { from = 0; to = (ranges.length > 1 ? ranges[1].s : rg.e); }
        s = s.slice(0, from) + s.slice(to);
        break;
      }
      return s.replace(/^[\s,]+/, "").replace(/\s+$/, "");
    }
    function writeTa(text) { var t = ta(); if(!t) return; t.value = text; t.dispatchEvent(new Event("input", { bubbles: true })); }
    // Compose the phrase (mirrors bodyParamPhrase in main.pjs so the preview matches what is written).
    function compose(def, words) {
      var sel = words || [];
      if(!sel.length) return "";   // no words ticked = this parameter writes nothing at all
      var inc = function(w) { for(var i = 0; i < sel.length; i++) if(String(sel[i]) === String(w)) return true; return false; };
      var pre = (def.pre || []).filter(inc), post = (def.post || []).filter(inc);
      var core = [];
      if(pre.length) core.push(pre.join(" "));
      if(def.subject) core.push(def.subject);
      var s = core.join(" ");
      if(!s && post.length) s = "figure";
      if(!s) return "";
      if(def.article) s = def.article + " " + s;
      if(post.length) s += " with " + post.join(" and ");
      return s;
    }
    function __escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
    function extractWords(def, phrase) {
      var hay = " " + norm(phrase) + " ", seen = {};
      (def.pre || []).concat(def.post || []).forEach(function(w) {
        w = String(w); if(seen[w]) return;
        try { if(hay.search(new RegExp("\\b" + __escRe(norm(w)) + "\\b", "i")) !== -1) { seen[w] = 1; } } catch(e) {}
      });
      var ord = [];
      (def.pre || []).forEach(function(w) { if(seen[String(w)] && ord.indexOf(w) === -1) ord.push(w); });
      (def.post || []).forEach(function(w) { if(seen[String(w)] && ord.indexOf(w) === -1) ord.push(w); });
      return ord;
    }
    function reconcile(key, allowClear) {
      var ds = defs(); if(!ds) return false;
      var def = null; for(var i = 0; i < ds.length; i++) if(ds[i].key === key) def = ds[i];
      if(!def) return false;
      var t = ta(); if(!t) return false;
      var text = t.value || "", words = state[key] || [];
      var phrase = compose(def, words);
      if(phrase && hasTag(text, phrase)) return false;
      var cand = prev[key] || "";
      if(cand && hasTag(text, cand)) {
        var healed = extractWords(def, cand);
        if(healed.length && healed.join("\u0001") !== words.join("\u0001")) {
          state[key] = healed; saveJSON(LS, state); return true;
        }
        return false;
      }
      if(allowClear && words.length) {
        state[key] = []; saveJSON(LS, state);
        if(prev[key]) { delete prev[key]; saveJSON(LSP, prev); }
        return true;
      }
      return false;
    }
    function apply(key) {
      var ds = defs(); if(!ds) return;
      var def = null; for(var i = 0; i < ds.length; i++) if(ds[i].key === key) def = ds[i];
      if(!def) return;
      var t = ta(); if(!t) return;
      var old = prev[key] || "";
      var nu = compose(def, state[key] || []);
      var text = t.value || "";
      if(old && hasTag(text, old)) text = removeGentle(text, old);
      if(nu) text = addGentle(text, nu);
      if(text !== t.value) writeTa(text);
      if(nu) prev[key] = nu; else delete prev[key];
      saveJSON(LSP, prev);
      paint();
    }
    function clearAll() {
      var t = ta(), text = t ? (t.value || "") : "";
      Object.keys(state).forEach(function(k) { var old = prev[k]; if(old && hasTag(text, old)) text = removeGentle(text, old); });
      if(t && text !== t.value) writeTa(text);
      state = {}; prev = {}; saveJSON(LS, state); saveJSON(LSP, prev);
      paint();
    }
    function paint() {
      if(!box) return;
      var ds = defs() || [], text = (ta() ? (ta().value || "") : "");
      var on = 0;
      var __ext = false;
      var __ta = null; try { __ta = ta(); } catch(__te) {}
      if(__ta && hookEl !== __ta) { hookEl = __ta; try { __ta.addEventListener("input", function(e) { if(e && e.isTrusted) { armed = true; } }); } catch(__he) {} }
      if(lastBox !== null && text !== lastBox && armed) { __ext = true; }
      lastBox = text;
      ds.forEach(function(d) {
        try { reconcile(d.key, __ext); } catch(__re) {}
        var words = state[d.key] || [];
        var trig = box.querySelector('.fxp-trig[data-key="' + d.key + '"]');
        if(!trig) return;
        var phrase = compose(d, words);
        var inBox = phrase ? hasTag(text, phrase) : false;
        trig.classList.toggle("has", inBox);
        var pv = trig.querySelector(".fxp-preview");
        if(pv && pv.textContent !== phrase) pv.textContent = phrase;
        var rb = box.querySelector('.fxp-catreset[data-key="' + d.key + '"]');
        if(rb) rb.classList.toggle("on", words.length > 0);
        if(phrase) on++;
      });
      if(pop && pop.classList.contains("open") && popKey) {
        try {
          Array.prototype.forEach.call(pop.querySelectorAll(".fxp-opt"), function(b) {
            if(b.__w === undefined || b.__w === null) return;
            var __on = (state[popKey] || []).indexOf(b.__w) !== -1;
            b.classList.toggle("on", __on);
            var __ck = b.querySelector(".fxp-chk");
            if(__ck) { var __ct = __on ? "\u2611" : "\u2610"; if(__ck.textContent !== __ct) __ck.textContent = __ct; }
          });
        } catch(__pr) {}
      }
      var c = box.querySelector(".fxp-count");
      if(c) { var s = ""; if(c.textContent !== s) c.textContent = s; if(String(c.dataset.n || "") !== String(on)) c.dataset.n = String(on); }
      if(clearBtn) {
        var isOn = on > 0;
        clearBtn.classList.toggle("on", isOn);
        var bt = "\u21BA";
        if(clearBtn.textContent !== bt) clearBtn.textContent = bt;
        var btt = isOn ? "Resets Box & Removes all tags this box added to your prompt" : "";
        if(clearBtn.title !== btt) clearBtn.title = btt;
        if(clearBtn.getAttribute("aria-label") !== "Reset") clearBtn.setAttribute("aria-label", "Reset");
      }
    }
    function closePop() { if(pop) pop.classList.remove("open"); popKey = null; }
    function optBtn(def, w, isPost) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "fxp-opt";
      b.__w = w;
      var on = (state[def.key] || []).indexOf(w) !== -1;
      if(on) b.classList.add("on");
      var ck = document.createElement("span"); ck.className = "fxp-chk"; ck.textContent = on ? "\u2611" : "\u2610";
      var tx = document.createElement("span"); tx.textContent = isPost ? ("with " + w) : w;
      b.appendChild(ck); b.appendChild(tx);
      b.addEventListener("click", function(ev) {
        ev.preventDefault(); ev.stopPropagation();
        var arr = state[def.key] ? state[def.key].slice() : [];
        var __wasOn = arr.indexOf(w) !== -1;
        var __before = compose(def, arr);
        var j = arr.indexOf(w);
        if(j === -1) arr.push(w); else arr.splice(j, 1);
        state[def.key] = arr; saveJSON(LS, state);
        apply(def.key);
        if(__wasOn && __before) { try { var __t2 = ta(); if(__t2 && hasTag(__t2.value || "", __before)) writeTa(removeGentle(__t2.value, __before)); } catch(__be) {} }
        var on2 = arr.indexOf(w) !== -1;
        b.classList.toggle("on", on2);
        ck.textContent = on2 ? "\u2611" : "\u2610";
      });
      return b;
    }
    function openPop(def, trig) {
      popKey = def.key;
      pop.innerHTML = "";
      (def.pre || []).forEach(function(w) { pop.appendChild(optBtn(def, w, false)); });
      (def.post || []).forEach(function(w) { pop.appendChild(optBtn(def, w, true)); });
      pop.classList.add("open");
      // Popoveren hænger på sin MENU: page-koordinater (ikke viewport), så den ikke "flyder" løs
      // over siden men bliver siddende under sin egen trigger — også når man scroller.
      var r = trig.getBoundingClientRect();
      var w = pop.offsetWidth;
      var sx = window.pageXOffset || document.documentElement.scrollLeft || 0;
      var sy = window.pageYOffset || document.documentElement.scrollTop || 0;
      var left = Math.max(6, Math.min(r.left + sx, (document.documentElement.clientWidth || window.innerWidth) - w - 6 + sx));
      pop.style.left = left + "px";
      pop.style.top = (r.bottom + sy + 4) + "px";
    }
    function place() {
      if(!box) return;
      var df = document.getElementById("paramFrame") || document.getElementById("descFrame") || (ta() && ta().closest(".prompt-frame"));
      if(!df) return;
      var after = document.getElementById("fluxEyesBox") || document.getElementById("fluxFaceTagBox") || document.getElementById("fluxFaceBox");
      if(!after) { if(box.parentElement !== df) df.appendChild(box); return; }
      if(after.nextElementSibling !== box) after.insertAdjacentElement("afterend", box);
    }
    function build() {
      var ds = defs();
      if(!ds || !ds.length) return;
      if(!pop) { pop = document.createElement("div"); pop.id = "fxpPopSkin"; pop.className = "fxp-pop"; document.body.appendChild(pop); }
      if(box && box.isConnected) { place(); paint(); return; }
      box = document.createElement("div");
      box.id = "fluxSkinBox";
      box.className = "fxp-box";
      var head = document.createElement("div"); head.className = "fxp-head";
      var car = document.createElement("span"); car.className = "fxp-car"; car.textContent = "\u25BE";
      var lab = document.createElement("span"); lab.className = "fxp-label"; lab.textContent = "\ud83e\uddf4 Skin:";
      var cnt = document.createElement("span"); cnt.className = "fxp-count"; cnt.textContent = "0/" + ds.length;
      var clr = document.createElement("button"); clearBtn = clr;
      clr.type = "button"; clr.className = "fxp-clear"; clr.textContent = "\u21BA";
      clr.title = "";
      clr.addEventListener("click", function(ev) { ev.preventDefault(); ev.stopPropagation(); clearAll(); });
      head.appendChild(car); head.appendChild(lab); head.appendChild(cnt); head.appendChild(clr);
      head.addEventListener("click", function() {
        var f = !box.classList.contains("folded");
        box.classList.toggle("folded", f);
        car.textContent = f ? "\u25B8" : "\u25BE";
        try { localStorage.setItem(LSF, f ? "1" : "0"); } catch(e) {}
        try { paint(); } catch(e) {}
      });
      box.appendChild(head);
      var body = document.createElement("div"); body.className = "fxp-body";
      gridEl = document.createElement("div"); gridEl.className = "fxp-grid";
      ds.forEach(function(d) {
        var p = document.createElement("div"); p.className = "fxp-param"; p.dataset.key = d.key;
        var trig = document.createElement("button");
        trig.type = "button"; trig.className = "fxp-trig"; trig.dataset.key = d.key;
        trig.title = "Pick one or more words for the " + String(d.label).toLowerCase() + ". Several can be on at once, and they combine into one phrase in the Description box.";
        var nm = document.createElement("span"); nm.className = "fxp-name"; nm.textContent = d.label;
        var pv = document.createElement("span"); pv.className = "fxp-preview";
        var ca = document.createElement("span"); ca.className = "fxp-car2"; ca.textContent = "\u25BE";
        trig.appendChild(nm); trig.appendChild(pv); trig.appendChild(ca);
        trig.addEventListener("click", function(ev) {
          ev.preventDefault(); ev.stopPropagation();
          if(pop.classList.contains("open") && popKey === d.key) closePop(); else openPop(d, trig);
        });
        p.appendChild(trig);
        var rs = document.createElement("button");
        rs.type = "button"; rs.className = "fxp-catreset"; rs.dataset.key = d.key; rs.textContent = "\u21BA";
        rs.title = "Reset " + d.label + " \u2014 remove what this parameter added (your own text is never touched).";
        rs.setAttribute("aria-label", "Reset " + d.label);
        rs.addEventListener("click", function(ev) { ev.preventDefault(); ev.stopPropagation(); state[d.key] = []; saveJSON(LS, state); apply(d.key); });
        p.appendChild(rs);
        gridEl.appendChild(p);
      });
      body.appendChild(gridEl);
      box.appendChild(body);
      try { if(localStorage.getItem(LSF) !== "0") { box.classList.add("folded"); car.textContent = "\u25B8"; } } catch(e) { try { box.classList.add("folded"); car.textContent = "\u25B8"; } catch(_){} }
      document.addEventListener("click", function(ev) {
        if(!pop || !pop.classList.contains("open")) return;
        var t = ev.target;
        if(t && pop.contains(t)) return;
        var trg = (t && t.closest) ? t.closest(".fxp-trig") : null;
        if(trg && box && box.contains(trg)) return;
        closePop();
      }, true);
      document.addEventListener("keydown", function(ev) { if(ev.key === "Escape") closePop(); });
      window.addEventListener("resize", closePop);
      // (Ingen close-på-scroll mere: popoveren ligger nu i PAGE-koordinater og følger sin egen menu.)
      place();
      paint();
    }
    state = loadJSON(LS);
    prev = loadJSON(LSP);
    try {
      var __killJunk = function(w) { w = String(w == null ? "" : w); return w.indexOf("//") !== -1 || w.indexOf("L\u00E6ser") !== -1; };
      var __fixed = false, __k;
      for (__k in state) { if (Array.isArray(state[__k])) { var __f = state[__k].filter(function(w) { return !__killJunk(w); }); if (__f.length !== state[__k].length) { state[__k] = __f; __fixed = true; } } }
      for (__k in prev) { if (typeof prev[__k] === "string" && __killJunk(prev[__k])) { delete prev[__k]; __fixed = true; } }
      if (__fixed) { saveJSON(LS, state); saveJSON(LSP, prev); }
      var __t = (typeof ta === "function") ? ta() : null;
      if (__t && __killJunk(__t.value)) {
        var __parts = splitParts(__t.value), __keep = [], __i, __j, __s = "";
        for (__i = 0; __i < __parts.length; __i++) { if (!__killJunk(__parts[__i].part)) __keep.push(__parts[__i]); }
        for (__j = 0; __j < __keep.length; __j++) { if (__j > 0) __s += (__keep[__j].sep || ","); __s += __keep[__j].part; }
        __s = __s.replace(/^[\s,]+/, "").replace(/\s+$/, "");
        if (__s !== __t.value) writeTa(__s);
      }
    } catch (__e) {}
    build();
    var __genTimer = setInterval(function() { if (window.__fluxBoxesGen !== __fluxInitGen) { try { clearInterval(__genTimer); } catch(__ce) {} return; } build(); }, 700);
    try {
      window.addEventListener("storage", function(e) {
        if(e && (e.key === LS || e.key === LSP)) {
          state = loadJSON(LS); prev = loadJSON(LSP);
          try { paint(); } catch(__se) {}
        }
      });
    } catch(__se) {}
  })();
  (function() {
    // 🌿 NATUR & STOF — the PARAMETER motherboard. Each parameter (Jawline, Hips, Eyes, ...) is a
    // MULTI-SELECT dropdown: you can tick several words for the same parameter (they never cancel each
    // other) and they combine into ONE natural phrase, e.g. "a broad prominent sharply defined
    // jawline", "wide hips with saddlebags" or "a narrow waist". Every parameter writes exactly ONE
    // comma-part ("slot") into the Description box, so the other parameters and the user's own text are
    // left alone. The words + composition rule live in main.pjs (the natureParams list and
    // natureParamPhrase); this script only builds the grid and writes the phrase.
    var LS = "fluxNatureParams";        // { paramKey: ["broad", "prominent"] }
    var LSP = "fluxNatureParamsPrev";   // { paramKey: "the phrase we last wrote into the box" }
    var LSF = "fluxNatureParamFold";        // "1" = the whole box is folded in
    var DEFS = null;
    var state = {}, prev = {};
    var lastBox = null;
    var armed = false, hookEl = null;
    var box = null, gridEl = null, pop = null, popKey = null, clearBtn = null;

    function loadJSON(k) { try { var o = JSON.parse(localStorage.getItem(k) || "null"); return (o && typeof o === "object") ? o : {}; } catch(e) { return {}; } }
    function saveJSON(k, o) { try { localStorage.setItem(k, JSON.stringify(o)); } catch(e) {} }
    function defs() {
      if(DEFS) return DEFS;
      try { if(window.root && typeof root.natureParamsList === "function") DEFS = root.natureParamsList(); } catch(e) {}
      return DEFS || null;
    }
    function ta() { return document.querySelector('#fluxDescTa'); }
    // tag-aware helpers (same idea as the 🧬 chip engine: a phrase is ONE comma/newline part)
    function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").replace(/^[\s,]+/, "").replace(/[\s,.!;:]+$/, ""); }
    function splitParts(text) {
      var s = String(text == null ? "" : text), out = [], buf = "", sep = "";
      for(var i = 0; i < s.length; i++) { var ch = s.charAt(i); if(ch === "," || ch === "\n") { out.push({ sep: sep, part: buf }); buf = ""; sep = ch; } else buf += ch; }
      out.push({ sep: sep, part: buf });
      return out;
    }
    function hasTag(text, tag) { var t = norm(tag), list = splitParts(text); for(var i = 0; i < list.length; i++) if(norm(list[i].part) === t) return true; return false; }
    function addGentle(text, word) { var s = String(text == null ? "" : text); if(hasTag(s, word)) return s; if(!s.trim()) return String(word); return s.replace(/\s+$/, "") + ", " + String(word); }
    function removeGentle(text, word) {
      var t = norm(word), s = String(text == null ? "" : text), ranges = [], start = 0;
      for(var i = 0; i < s.length; i++) { var ch = s.charAt(i); if(ch === "," || ch === "\n") { ranges.push({ s: start, e: i }); start = i + 1; } }
      ranges.push({ s: start, e: s.length });
      for(var r = ranges.length - 1; r >= 0; r--) {
        var rg = ranges[r];
        if(norm(s.slice(rg.s, rg.e)) !== t) continue;
        var from, to;
        if(rg.s > 0) { from = rg.s - 1; to = rg.e; } else { from = 0; to = (ranges.length > 1 ? ranges[1].s : rg.e); }
        s = s.slice(0, from) + s.slice(to);
        break;
      }
      return s.replace(/^[\s,]+/, "").replace(/\s+$/, "");
    }
    function writeTa(text) { var t = ta(); if(!t) return; t.value = text; t.dispatchEvent(new Event("input", { bubbles: true })); }
    // Compose the phrase (mirrors bodyParamPhrase in main.pjs so the preview matches what is written).
    function compose(def, words) {
      var sel = words || [];
      if(!sel.length) return "";   // no words ticked = this parameter writes nothing at all
      var inc = function(w) { for(var i = 0; i < sel.length; i++) if(String(sel[i]) === String(w)) return true; return false; };
      var pre = (def.pre || []).filter(inc), post = (def.post || []).filter(inc);
      var core = [];
      if(pre.length) core.push(pre.join(" "));
      if(def.subject) core.push(def.subject);
      var s = core.join(" ");
      if(!s && post.length) s = "figure";
      if(!s) return "";
      if(def.article) s = def.article + " " + s;
      if(post.length) s += " with " + post.join(" and ");
      return s;
    }
    function __escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
    function extractWords(def, phrase) {
      var hay = " " + norm(phrase) + " ", seen = {};
      (def.pre || []).concat(def.post || []).forEach(function(w) {
        w = String(w); if(seen[w]) return;
        try { if(hay.search(new RegExp("\\b" + __escRe(norm(w)) + "\\b", "i")) !== -1) { seen[w] = 1; } } catch(e) {}
      });
      var ord = [];
      (def.pre || []).forEach(function(w) { if(seen[String(w)] && ord.indexOf(w) === -1) ord.push(w); });
      (def.post || []).forEach(function(w) { if(seen[String(w)] && ord.indexOf(w) === -1) ord.push(w); });
      return ord;
    }
    function reconcile(key, allowClear) {
      var ds = defs(); if(!ds) return false;
      var def = null; for(var i = 0; i < ds.length; i++) if(ds[i].key === key) def = ds[i];
      if(!def) return false;
      var t = ta(); if(!t) return false;
      var text = t.value || "", words = state[key] || [];
      var phrase = compose(def, words);
      if(phrase && hasTag(text, phrase)) return false;
      var cand = prev[key] || "";
      if(cand && hasTag(text, cand)) {
        var healed = extractWords(def, cand);
        if(healed.length && healed.join("\u0001") !== words.join("\u0001")) {
          state[key] = healed; saveJSON(LS, state); return true;
        }
        return false;
      }
      if(allowClear && words.length) {
        state[key] = []; saveJSON(LS, state);
        if(prev[key]) { delete prev[key]; saveJSON(LSP, prev); }
        return true;
      }
      return false;
    }
    function apply(key) {
      var ds = defs(); if(!ds) return;
      var def = null; for(var i = 0; i < ds.length; i++) if(ds[i].key === key) def = ds[i];
      if(!def) return;
      var t = ta(); if(!t) return;
      var old = prev[key] || "";
      var nu = compose(def, state[key] || []);
      var text = t.value || "";
      if(old && hasTag(text, old)) text = removeGentle(text, old);
      if(nu) text = addGentle(text, nu);
      if(text !== t.value) writeTa(text);
      if(nu) prev[key] = nu; else delete prev[key];
      saveJSON(LSP, prev);
      paint();
    }
    function clearAll() {
      var t = ta(), text = t ? (t.value || "") : "";
      Object.keys(state).forEach(function(k) { var old = prev[k]; if(old && hasTag(text, old)) text = removeGentle(text, old); });
      if(t && text !== t.value) writeTa(text);
      state = {}; prev = {}; saveJSON(LS, state); saveJSON(LSP, prev);
      paint();
    }
    function paint() {
      if(!box) return;
      var ds = defs() || [], text = (ta() ? (ta().value || "") : "");
      var on = 0;
      var __ext = false;
      var __ta = null; try { __ta = ta(); } catch(__te) {}
      if(__ta && hookEl !== __ta) { hookEl = __ta; try { __ta.addEventListener("input", function(e) { if(e && e.isTrusted) { armed = true; } }); } catch(__he) {} }
      if(lastBox !== null && text !== lastBox && armed) { __ext = true; }
      lastBox = text;
      ds.forEach(function(d) {
        try { reconcile(d.key, __ext); } catch(__re) {}
        var words = state[d.key] || [];
        var trig = box.querySelector('.fxp-trig[data-key="' + d.key + '"]');
        if(!trig) return;
        var phrase = compose(d, words);
        var inBox = phrase ? hasTag(text, phrase) : false;
        trig.classList.toggle("has", inBox);
        var pv = trig.querySelector(".fxp-preview");
        if(pv && pv.textContent !== phrase) pv.textContent = phrase;
        var rb = box.querySelector('.fxp-catreset[data-key="' + d.key + '"]');
        if(rb) rb.classList.toggle("on", words.length > 0);
        if(phrase) on++;
      });
      if(pop && pop.classList.contains("open") && popKey) {
        try {
          Array.prototype.forEach.call(pop.querySelectorAll(".fxp-opt"), function(b) {
            if(b.__w === undefined || b.__w === null) return;
            var __on = (state[popKey] || []).indexOf(b.__w) !== -1;
            b.classList.toggle("on", __on);
            var __ck = b.querySelector(".fxp-chk");
            if(__ck) { var __ct = __on ? "\u2611" : "\u2610"; if(__ck.textContent !== __ct) __ck.textContent = __ct; }
          });
        } catch(__pr) {}
      }
      var c = box.querySelector(".fxp-count");
      if(c) { var s = ""; if(c.textContent !== s) c.textContent = s; if(String(c.dataset.n || "") !== String(on)) c.dataset.n = String(on); }
      if(clearBtn) {
        var isOn = on > 0;
        clearBtn.classList.toggle("on", isOn);
        var bt = "\u21BA";
        if(clearBtn.textContent !== bt) clearBtn.textContent = bt;
        var btt = isOn ? "Resets Box & Removes all tags this box added to your prompt" : "";
        if(clearBtn.title !== btt) clearBtn.title = btt;
        if(clearBtn.getAttribute("aria-label") !== "Reset") clearBtn.setAttribute("aria-label", "Reset");
      }
    }
    function closePop() { if(pop) pop.classList.remove("open"); popKey = null; }
    function optBtn(def, w, isPost) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "fxp-opt";
      b.__w = w;
      var on = (state[def.key] || []).indexOf(w) !== -1;
      if(on) b.classList.add("on");
      var ck = document.createElement("span"); ck.className = "fxp-chk"; ck.textContent = on ? "\u2611" : "\u2610";
      var tx = document.createElement("span"); tx.textContent = isPost ? ("with " + w) : w;
      b.appendChild(ck); b.appendChild(tx);
      b.addEventListener("click", function(ev) {
        ev.preventDefault(); ev.stopPropagation();
        var arr = state[def.key] ? state[def.key].slice() : [];
        var __wasOn = arr.indexOf(w) !== -1;
        var __before = compose(def, arr);
        var j = arr.indexOf(w);
        if(j === -1) arr.push(w); else arr.splice(j, 1);
        state[def.key] = arr; saveJSON(LS, state);
        apply(def.key);
        if(__wasOn && __before) { try { var __t2 = ta(); if(__t2 && hasTag(__t2.value || "", __before)) writeTa(removeGentle(__t2.value, __before)); } catch(__be) {} }
        var on2 = arr.indexOf(w) !== -1;
        b.classList.toggle("on", on2);
        ck.textContent = on2 ? "\u2611" : "\u2610";
      });
      return b;
    }
    function openPop(def, trig) {
      popKey = def.key;
      pop.innerHTML = "";
      (def.pre || []).forEach(function(w) { pop.appendChild(optBtn(def, w, false)); });
      (def.post || []).forEach(function(w) { pop.appendChild(optBtn(def, w, true)); });
      pop.classList.add("open");
      // Popoveren hænger på sin MENU: page-koordinater (ikke viewport), så den ikke "flyder" løs
      // over siden men bliver siddende under sin egen trigger — også når man scroller.
      var r = trig.getBoundingClientRect();
      var w = pop.offsetWidth;
      var sx = window.pageXOffset || document.documentElement.scrollLeft || 0;
      var sy = window.pageYOffset || document.documentElement.scrollTop || 0;
      var left = Math.max(6, Math.min(r.left + sx, (document.documentElement.clientWidth || window.innerWidth) - w - 6 + sx));
      pop.style.left = left + "px";
      pop.style.top = (r.bottom + sy + 4) + "px";
    }
    function place() {
      if(!box) return;
      var df = document.getElementById("paramFrame") || document.getElementById("descFrame") || (ta() && ta().closest(".prompt-frame"));
      if(!df) return;
      var after = document.getElementById("fluxMaterialsBox") || document.getElementById("fluxObjectsBox") || document.getElementById("fluxAccessoryBox");
      if(!after) { if(box.parentElement !== df) df.appendChild(box); return; }
      if(after.nextElementSibling !== box) after.insertAdjacentElement("afterend", box);
    }
    function build() {
      var ds = defs();
      if(!ds || !ds.length) return;
      if(!pop) { pop = document.createElement("div"); pop.id = "fxpPopNature"; pop.className = "fxp-pop"; document.body.appendChild(pop); }
      if(box && box.isConnected) { place(); paint(); return; }
      box = document.createElement("div");
      box.id = "fluxNatureBox";
      box.className = "fxp-box";
      var head = document.createElement("div"); head.className = "fxp-head";
      var car = document.createElement("span"); car.className = "fxp-car"; car.textContent = "\u25BE";
      var lab = document.createElement("span"); lab.className = "fxp-label"; lab.textContent = "\ud83c\udf3f Nature:";
      var cnt = document.createElement("span"); cnt.className = "fxp-count"; cnt.textContent = "0/" + ds.length;
      var clr = document.createElement("button"); clearBtn = clr;
      clr.type = "button"; clr.className = "fxp-clear"; clr.textContent = "\u21BA";
      clr.title = "";
      clr.addEventListener("click", function(ev) { ev.preventDefault(); ev.stopPropagation(); clearAll(); });
      head.appendChild(car); head.appendChild(lab); head.appendChild(cnt); head.appendChild(clr);
      head.addEventListener("click", function() {
        var f = !box.classList.contains("folded");
        box.classList.toggle("folded", f);
        car.textContent = f ? "\u25B8" : "\u25BE";
        try { localStorage.setItem(LSF, f ? "1" : "0"); } catch(e) {}
        try { paint(); } catch(e) {}
      });
      box.appendChild(head);
      var body = document.createElement("div"); body.className = "fxp-body";
      gridEl = document.createElement("div"); gridEl.className = "fxp-grid";
      ds.forEach(function(d) {
        var p = document.createElement("div"); p.className = "fxp-param"; p.dataset.key = d.key;
        var trig = document.createElement("button");
        trig.type = "button"; trig.className = "fxp-trig"; trig.dataset.key = d.key;
        trig.title = "Pick one or more words for the " + String(d.label).toLowerCase() + ". Several can be on at once, and they combine into one phrase in the Description box.";
        var nm = document.createElement("span"); nm.className = "fxp-name"; nm.textContent = d.label;
        var pv = document.createElement("span"); pv.className = "fxp-preview";
        var ca = document.createElement("span"); ca.className = "fxp-car2"; ca.textContent = "\u25BE";
        trig.appendChild(nm); trig.appendChild(pv); trig.appendChild(ca);
        trig.addEventListener("click", function(ev) {
          ev.preventDefault(); ev.stopPropagation();
          if(pop.classList.contains("open") && popKey === d.key) closePop(); else openPop(d, trig);
        });
        p.appendChild(trig);
        var rs = document.createElement("button");
        rs.type = "button"; rs.className = "fxp-catreset"; rs.dataset.key = d.key; rs.textContent = "\u21BA";
        rs.title = "Reset " + d.label + " \u2014 remove what this parameter added (your own text is never touched).";
        rs.setAttribute("aria-label", "Reset " + d.label);
        rs.addEventListener("click", function(ev) { ev.preventDefault(); ev.stopPropagation(); state[d.key] = []; saveJSON(LS, state); apply(d.key); });
        p.appendChild(rs);
        gridEl.appendChild(p);
      });
      body.appendChild(gridEl);
      box.appendChild(body);
      try { if(localStorage.getItem(LSF) !== "0") { box.classList.add("folded"); car.textContent = "\u25B8"; } } catch(e) { try { box.classList.add("folded"); car.textContent = "\u25B8"; } catch(_){} }
      document.addEventListener("click", function(ev) {
        if(!pop || !pop.classList.contains("open")) return;
        var t = ev.target;
        if(t && pop.contains(t)) return;
        var trg = (t && t.closest) ? t.closest(".fxp-trig") : null;
        if(trg && box && box.contains(trg)) return;
        closePop();
      }, true);
      document.addEventListener("keydown", function(ev) { if(ev.key === "Escape") closePop(); });
      window.addEventListener("resize", closePop);
      // (Ingen close-på-scroll mere: popoveren ligger nu i PAGE-koordinater og følger sin egen menu.)
      place();
      paint();
    }
    state = loadJSON(LS);
    prev = loadJSON(LSP);
    try {
      var __killJunk = function(w) { w = String(w == null ? "" : w); return w.indexOf("//") !== -1 || w.indexOf("L\u00E6ser") !== -1; };
      var __fixed = false, __k;
      for (__k in state) { if (Array.isArray(state[__k])) { var __f = state[__k].filter(function(w) { return !__killJunk(w); }); if (__f.length !== state[__k].length) { state[__k] = __f; __fixed = true; } } }
      for (__k in prev) { if (typeof prev[__k] === "string" && __killJunk(prev[__k])) { delete prev[__k]; __fixed = true; } }
      if (__fixed) { saveJSON(LS, state); saveJSON(LSP, prev); }
      var __t = (typeof ta === "function") ? ta() : null;
      if (__t && __killJunk(__t.value)) {
        var __parts = splitParts(__t.value), __keep = [], __i, __j, __s = "";
        for (__i = 0; __i < __parts.length; __i++) { if (!__killJunk(__parts[__i].part)) __keep.push(__parts[__i]); }
        for (__j = 0; __j < __keep.length; __j++) { if (__j > 0) __s += (__keep[__j].sep || ","); __s += __keep[__j].part; }
        __s = __s.replace(/^[\s,]+/, "").replace(/\s+$/, "");
        if (__s !== __t.value) writeTa(__s);
      }
    } catch (__e) {}
    build();
    var __genTimer = setInterval(function() { if (window.__fluxBoxesGen !== __fluxInitGen) { try { clearInterval(__genTimer); } catch(__ce) {} return; } build(); }, 700);
    try {
      window.addEventListener("storage", function(e) {
        if(e && (e.key === LS || e.key === LSP)) {
          state = loadJSON(LS); prev = loadJSON(LSP);
          try { paint(); } catch(__se) {}
        }
      });
    } catch(__se) {}
  })();
  (function() {
    // ⏳ ALDER (brugerønske 2026-09-29): slider + ÉT dropdown med alle alders-trin fra "child" til og
    // med "undead" (båndene OG ancient/undead i én liste, så de ikke står spredt langt fra hinanden).
    // "Auto" = default = intet skrives, så modellen selv bestemmer. Alderen skrives i
    // Description som "N years of age" (IKKE "years old" - ordet "old" får modellen til at tegne en
    // gammel person). Slider/tal og dropdown deler ÉT slot. Rækken kan foldes, og folden huskes.
    var LS_VAL = "fluxAgeValue";
    var LS_BAND = "fluxAgeBand";
    var LS_PREV = "fluxAgePrev";
    var LS_FOLD = "fluxAgeFold";
    var LS_TAGS_OLD = "fluxAgeTags";
    var LS_GENDER = "fluxAgeGender";
    var LS_ANAT = "fluxAgeAnatomy"; // 🦴 "anatomically correct/incorrect/abnormal" bor nu i Age-rækken (brugerønske 2026-09-24)
    var AGE_MAX = 100;
    // Gender/sex words live in the Age row (brugerønske 2026-09-21): they were removed from the
    // 👤 Subjects param (age overlap) and belong next to the age. Written into Description as-is.
    var GENDERS = ["man", "woman", "male", "female", "girl", "boy", "androgynous"];
    // Dropdown-rækkefølgen: alders-båndene + ancient/undead til sidst (Auto = den tomme første option).
    var BANDS = ["child", "early teenager", "late teenager", "young", "young adult", "adult", "mature", "middle-aged", "elderly", "old", "ancient", "undead"];
    var row = null, rangeEl = null, numEl = null, selEl = null, gselEl = null, aselEl = null, countEl = null, autoBtn = null, bodyEl = null;
    var prevParts = [];

    function ta() { return document.querySelector('#fluxDescTa'); }
    function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").replace(/^[\s,]+/, "").replace(/[\s,.!;:]+$/, ""); }
    function splitParts(text) {
      var s = String(text == null ? "" : text), out = [], buf = "";
      for(var i = 0; i < s.length; i++) { var ch = s.charAt(i); if(ch === "," || ch === "\n") { out.push(buf); buf = ""; } else buf += ch; }
      out.push(buf);
      return out;
    }
    function hasTag(text, tag) { var t = norm(tag), list = splitParts(text); for(var i = 0; i < list.length; i++) if(norm(list[i]) === t) return true; return false; }
    function addGentle(text, word) { var s = String(text == null ? "" : text); if(hasTag(s, word)) return s; if(!s.trim()) return String(word); return s.replace(/\s+$/, "") + ", " + String(word); }
    function removeGentle(text, word) {
      var t = norm(word), s = String(text == null ? "" : text), start = 0;
      for(var i = 0; i < s.length; i++) { var ch = s.charAt(i); if(ch === "," || ch === "\n") { if(norm(s.slice(start, i)) === t) { var from = start > 0 ? start - 1 : 0; var to = start > 0 ? i : i + 1; return (s.slice(0, from) + s.slice(to)).replace(/^[\s,]+/, "").replace(/\s+$/, ""); } start = i + 1; } }
      if(norm(s.slice(start)) === t) return s.slice(0, start > 0 ? start - 1 : 0).replace(/\s+$/, "");
      return s;
    }
    function writeTa(text) { var t = ta(); if(!t) return; t.value = text; t.dispatchEvent(new Event("input", { bubbles: true })); }
    function loadVal() { var v = parseInt(localStorage.getItem(LS_VAL) || "0", 10); return isNaN(v) ? 0 : Math.max(0, Math.min(AGE_MAX, v)); }
    function loadBand() { try { var b = localStorage.getItem(LS_BAND) || ""; return BANDS.indexOf(b) === -1 ? "" : b; } catch(e) { return ""; } }
    function saveBand(b) { try { if(b) localStorage.setItem(LS_BAND, b); else localStorage.removeItem(LS_BAND); } catch(e) {} }
    function loadGender() { try { var g = localStorage.getItem(LS_GENDER) || ""; return GENDERS.indexOf(g) === -1 ? "" : g; } catch(e) { return ""; } }
    function saveGender(g) { try { if(g) localStorage.setItem(LS_GENDER, g); else localStorage.removeItem(LS_GENDER); } catch(e) {} }
    // 🦴 Anatomy accuracy: ordene hentes fra main.pjs' `subjectParams` (subjectParamsList), så ordbunken
    // stadig ejes af main.pjs — med en hardcoded fallback hvis listen endnu ikke er klar.
    var ANATOMY_FALLBACK = ["anatomically correct", "anatomically incorrect", "anatomically abnormal"];
    function ageCap(s) { var t = String(s == null ? "" : s); return t.charAt(0).toUpperCase() + t.slice(1); }
    function anatomyWords() {
      try {
        if(window.root && typeof root.subjectParamsList === "function") {
          var l = root.subjectParamsList() || [];
          if(l.length && l[0] && l[0].pre && l[0].pre.length) return l[0].pre;
        }
      } catch(e) {}
      return ANATOMY_FALLBACK;
    }
    function loadAnat() { try { var a = localStorage.getItem(LS_ANAT) || ""; return anatomyWords().indexOf(a) === -1 ? "" : a; } catch(e) { return ""; } }
    function saveAnat(a) { try { if(a) localStorage.setItem(LS_ANAT, a); else localStorage.removeItem(LS_ANAT); } catch(e) {} }
    function isAuto() { return loadVal() < 1 && !loadBand() && !loadGender() && !loadAnat(); }
    function loadPrev() { try { var a = JSON.parse(localStorage.getItem(LS_PREV) || "[]"); return Array.isArray(a) ? a : []; } catch(e) { return []; } }
    function savePrev(a) { try { localStorage.setItem(LS_PREV, JSON.stringify(a)); } catch(e) {} }
    function loadFold() { try { return localStorage.getItem(LS_FOLD) !== "0"; } catch(e) { return true; } }
    function saveFold(f) { try { localStorage.setItem(LS_FOLD, f ? "1" : "0"); } catch(e) {} }
    function parts() {
      var out = [], v = loadVal(), band = loadBand(), gender = loadGender();
      if(band) out.push(band);
      else if(v >= 1) out.push(v + " years of age");
      if(gender) out.push(gender);
      var anat = loadAnat();
      if(anat) out.push(anat);
      return out;
    }
    function apply() {
      var t = ta(); if(!t) return;
      var text = t.value || "";
      prevParts.forEach(function(p) { if(hasTag(text, p)) text = removeGentle(text, p); });
      var nu = parts();
      nu.forEach(function(p) { text = addGentle(text, p); });
      if(text !== t.value) writeTa(text);
      prevParts = nu; savePrev(nu);
      paint();
    }
    function paint() {
      if(!row) return;
      var v = loadVal(), band = loadBand(), auto = isAuto();
      if(rangeEl && document.activeElement !== rangeEl && String(rangeEl.value) !== String(v)) rangeEl.value = v;
      if(numEl && document.activeElement !== numEl) numEl.value = v;
      if(selEl && document.activeElement !== selEl && selEl.value !== band) selEl.value = band;
      var g = loadGender();
      if(gselEl && document.activeElement !== gselEl && gselEl.value !== g) gselEl.value = g;
      var an = loadAnat();
      if(aselEl && document.activeElement !== aselEl && aselEl.value !== an) aselEl.value = an;
      var shown = parts().map(function(p) { return (an && p === an) ? ageCap(p) : p; });
      if(countEl) { var ct = shown.length ? shown.join(" \u00b7 ") : "Auto"; if(countEl.textContent !== ct) countEl.textContent = ct; }
      row.classList.toggle("auto", auto);
      row.classList.toggle("folded", loadFold());
      if(autoBtn) autoBtn.classList.toggle("on", auto);
    }
    function setVal(v) { v = Math.max(0, Math.min(AGE_MAX, v)); try { localStorage.setItem(LS_VAL, String(v)); } catch(e) {} saveBand(""); apply(); }
    function setBand(name) { saveBand(name); try { localStorage.setItem(LS_VAL, "0"); } catch(e) {} apply(); }
    function clearRow() { try { localStorage.setItem(LS_VAL, "0"); } catch(e) {} saveBand(""); apply(); }
    function toggleFold() { var f = !loadFold(); saveFold(f); if(row) row.classList.toggle("folded", f); }
    function build() {
      // ⏳ Age bor ØVERST i Boxes (#paramFrame, linjen lige under bjælken) — brugerønske 2026-10-09
      // (før: egen ramme 2026-10-15). Falder tilbage til #ageFrame hvis Boxes endnu ikke findes.
      var df = document.getElementById("paramFrame") || document.getElementById("ageFrame") || document.getElementById("descFrame") || (ta() && ta().closest(".prompt-frame"));
      if(!df) return;
      if(row && row.isConnected) { if(row.parentElement !== df) df.appendChild(row); paint(); return; }
      row = document.createElement("div");
      row.id = "fluxAgeRow";
      row.className = "flux-stdneg flux-stdpos flux-age";
      var head = document.createElement("div");
      head.className = "sdn-head";
      var lab = document.createElement("span"); lab.className = "sdn-label";
      var labIco = document.createElement("span"); labIco.className = "fx-ico"; labIco.textContent = "\u23f3"; lab.appendChild(labIco);
      lab.appendChild(document.createTextNode(" Age:"));
      autoBtn = document.createElement("button"); autoBtn.type = "button"; autoBtn.className = "sdn-all fx-age-auto"; autoBtn.textContent = "Auto";
      autoBtn.title = "Auto (default): only the age is reset to Auto — gender and anatomy are kept.";
      autoBtn.addEventListener("click", function(ev) { ev.preventDefault(); ev.stopPropagation(); clearRow(); });
      bodyEl = document.createElement("span"); bodyEl.className = "fx-age-body";
      var wrap = document.createElement("span"); wrap.className = "fx-age-wrap";
      rangeEl = document.createElement("input"); rangeEl.type = "range"; rangeEl.min = "0"; rangeEl.max = String(AGE_MAX); rangeEl.step = "1"; rangeEl.className = "fx-age-range";
      numEl = document.createElement("input"); numEl.type = "number"; numEl.min = "0"; numEl.max = String(AGE_MAX); numEl.step = "1"; numEl.className = "fx-age-num";
      rangeEl.title = "Age 0\u2013100. Written into the Description box as \"N years of age\". 0 = Auto.";
      numEl.title = "Type an exact age (0\u2013100). 0 = Auto.";
      rangeEl.addEventListener("input", function() { setVal(parseInt(rangeEl.value, 10) || 0); });
      numEl.addEventListener("input", function() { var v = parseInt(numEl.value, 10); if(isNaN(v)) return; setVal(v); });
      numEl.addEventListener("change", function() { paint(); });
      wrap.appendChild(rangeEl); wrap.appendChild(numEl);
      selEl = document.createElement("select"); selEl.className = "fx-age-select";
      selEl.title = "Pick a named age from child to undead (one at a time). Choosing a number above clears it, and vice versa.";
      var o0 = document.createElement("option"); o0.value = ""; o0.textContent = "Age\u2026"; selEl.appendChild(o0);
      BANDS.forEach(function(name) { var o = document.createElement("option"); o.value = name; o.textContent = name; selEl.appendChild(o); });
      selEl.addEventListener("change", function() { setBand(selEl.value || ""); });
      gselEl = document.createElement("select"); gselEl.className = "fx-age-select";
      gselEl.title = "Gender / sex of the subject \u2014 written into the Description as-is.";
      var g0 = document.createElement("option"); g0.value = ""; g0.textContent = "Gender\u2026"; gselEl.appendChild(g0);
      GENDERS.forEach(function(name) { var o = document.createElement("option"); o.value = name; o.textContent = name; gselEl.appendChild(o); });
      gselEl.addEventListener("change", function() { saveGender(gselEl.value || ""); apply(); });
      // 🦴 Anatomy accuracy-vælger (flyttet herind fra den tidligere 👤 Anatomy-boks).
      aselEl = document.createElement("select"); aselEl.className = "fx-age-select";
      aselEl.title = "Anatomy accuracy \u2014 written into the Description as-is.";
      var a0 = document.createElement("option"); a0.value = ""; a0.textContent = "Anatomy\u2026"; aselEl.appendChild(a0);
      anatomyWords().forEach(function(name) { var o = document.createElement("option"); o.value = name; o.textContent = ageCap(name); aselEl.appendChild(o); });
      aselEl.addEventListener("change", function() { saveAnat(aselEl.value || ""); apply(); });
      bodyEl.appendChild(autoBtn); bodyEl.appendChild(wrap); bodyEl.appendChild(selEl); bodyEl.appendChild(aselEl); bodyEl.appendChild(gselEl);
      var cnt = document.createElement("span"); cnt.className = "sdn-count"; cnt.textContent = "\u2014";
      countEl = cnt;
      head.appendChild(lab); head.appendChild(bodyEl); head.appendChild(cnt);
      head.addEventListener("click", function(ev) {
        var t = ev.target;
        if(t && t.closest && t.closest("button, input, select, textarea, a")) return;
        toggleFold();
      });
      row.appendChild(head);
      // Fold-baren bor i #paramFrame — Age lægger sig lige efter den (øverste indholdslinje).
      var anchor = document.getElementById("fluxFoldBar") || null;
      if(anchor && anchor.parentElement === df) anchor.insertAdjacentElement("afterend", row); else df.appendChild(row);
      paint();
    }
    prevParts = loadPrev();
    // Migration: gamle "ancient"/"undead"-tags (frie knapper) flyttes ind i dropdownen; "Auto"-default
    // sættes én gang, og en gammel "N years old" fjernes fra Description.
    function migrate() {
      var old = null;
      try { old = JSON.parse(localStorage.getItem(LS_TAGS_OLD) || "[]"); } catch(e) {}
      if(Array.isArray(old) && old.length) {
        if(old.indexOf("undead") !== -1) saveBand("undead");
        else if(old.indexOf("ancient") !== -1) saveBand("ancient");
      }
      try { localStorage.removeItem(LS_TAGS_OLD); } catch(e) {}
    }
    try {
      if(!localStorage.getItem("fluxAgeAutoDefault")) {
        localStorage.setItem(LS_VAL, "0");
        localStorage.setItem("fluxAgeAutoDefault", "1");
        migrate();
        build();
        apply();
      } else {
        migrate();
        build();
      }
    } catch(e) { build(); }
    var __genTimer = setInterval(function() { if (window.__fluxBoxesGen !== __fluxInitGen) { try { clearInterval(__genTimer); } catch(__ce) {} return; } build(); }, 700);
  })();
  (function() {
    // ─────────────────────────────────────────────────────────────────────────────────────────────
    // 🧴/🧍 TAG-BOKSE SOM DROPDOWN-MENUER (brugerønske 2026-09-29):
    // "lav tags både skin og body & faces som de der menuer der er i Skin samt Body & face
    // (drop down tick-untick (check-uncheck))".
    //
    // De to tag-områder (🧴 Skin tags og 🧍 Body & Face tags) var flade chip-rækker. De er nu
    // checkbox-dropdowns ligesom parameter-motherboardene: ÉT trigger pr. KATEGORI, og inde i
    // popoveren er hvert tag en flueben-række man kan ticke/unticke. Et tag skrives stadig i
    // Description-boksen som sit EGET komma-led, og boksen er (som altid) sandheden — intet gemmes
    // i JS-state, alt læses tilbage ud af teksten. Data kommer fra main.pjs via
    // `standardPos(Skin|Body)List()` + `standardPos(Skin|Body)CatsList()`.
    var SEP = "\n\n";
    var OPEN = null;   // den ene åbne popover (så de to bokse + parameter-boksene ikke står oveni hinanden)

    function normTag(s) { return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").replace(/^[\s,]+/, "").replace(/[\s,.!;:]+$/, ""); }
    function splitParts(s) {
      var out = [], buf = "", sep = ""; s = String(s == null ? "" : s);
      for(var i = 0; i < s.length; i++) { var ch = s.charAt(i); if(ch === "," || ch === "\n") { out.push({ sep: sep, part: buf }); buf = ""; sep = ch; } else buf += ch; }
      out.push({ sep: sep, part: buf });
      return out;
    }
    function hasTag(text, tag) { var t = normTag(tag), L = splitParts(text); for(var i = 0; i < L.length; i++) if(normTag(L[i].part) === t) return true; return false; }
    // Fjerner ÉT tag (én forekomst) ved at klippe KUN det stykke ud af teksten - aldrig ved at
    // bygge hele teksten op igen. Det er det, der gør at brugerens linjeskift/afsnit og øvrige
    // formatering står 100% urørt efter et untick (et gammelt rebuild lavede "\n" om til ", ").
    function dropTag(text, tag) {
      var t = normTag(tag), s = String(text == null ? "" : text);
      var L = splitParts(s), off = 0, start = -1, end = -1, i;
      for(i = 0; i < L.length; i++) {
        var it = L[i], pStart = off, pEnd = pStart + it.part.length;
        if(normTag(it.part) === t) { start = pStart; end = pEnd; break; }
        off = pEnd + 1;
      }
      if(start < 0) return s;
      if(start > 0) start -= 1; else if(end < s.length) end += 1;
      return (s.slice(0, start) + s.slice(end)).replace(/^[\s,]+/, "").replace(/\s+$/, "");
    }
    function tagsOf(m) { if(!m.__tags) m.__tags = String(m.text || "").split(",").map(function(x) { return x.trim(); }).filter(Boolean); return m.__tags; }
    function stateOf(text, m) { var tags = tagsOf(m), n = 0; for(var i = 0; i < tags.length; i++) if(hasTag(text, tags[i])) n++; return (tags.length && n === tags.length) ? "on" : "off"; }
    function lastIsTag(text, all) {
      var L = splitParts(text), last = "";
      for(var i = L.length - 1; i >= 0; i--) if(/\S/.test(L[i].part)) { last = normTag(L[i].part); break; }
      if(!last) return false;
      for(var j = 0; j < all.length; j++) if(normTag(all[j]) === last) return true;
      return false;
    }
    function addBlock(text, block, all) {
      var base = String(text == null ? "" : text).replace(/\s+$/, "");
      if(!base) return block;
      return lastIsTag(base, all) ? (base + ", " + block) : (base + SEP + block);
    }
    function addModule(text, m, all) {
      var tags = tagsOf(m), miss = [];
      for(var i = 0; i < tags.length; i++) if(!hasTag(text, tags[i])) miss.push(tags[i]);
      if(!miss.length) return String(text == null ? "" : text);
      return addBlock(text, miss.join(", "), all);
    }
    function removeModule(text, m) {
      var tags = tagsOf(m);
      for(var i = 0; i < tags.length; i++) { var g = 0; while(hasTag(text, tags[i]) && g++ < 25) text = dropTag(text, tags[i]); }
      return text;
    }
    var __tagStateOf = stateOf, __tagAddModule = addModule, __tagRemoveModule = removeModule;

    var ours = [];
    function makeTagBox(cfg) {
      var box = null, pop = null, openKey = null, clearBtn = null;
      function ta() { return document.querySelector('#fluxDescTa'); }
      function writeTa(text) { var t = ta(); if(!t) return; t.value = text; t.dispatchEvent(new Event("input", { bubbles: true })); }
      function getItems() { try { if(window.root && typeof root[cfg.listFn] === "function") return root[cfg.listFn]() || []; } catch(e) {} return []; }
      function getCats() { try { if(window.root && typeof root[cfg.catsFn] === "function") return root[cfg.catsFn]() || []; } catch(e) {} return []; }
      // 🚫 Kategorier fra `noBulkCatKeys` (main.pjs) må IKKE have en "All on/off"-knap: de er "vælg
      // ÉN"-kategorier (fx 👁 Eye Color / 👁 Eye Shape — en beskrivelse kan kun have én øjenfarve og
      // én øjenform), og et bulk-til/fra ville skrive alle de modstridende ord ind på én gang
      // (brugerønske 2026-09-26). Chipsene i rækken virker som før — ét ord ad gangen. Cachen hænger
      // på funktionen, så listen kun læses én gang pr. side.
      function noBulk(key) {
        var cache = noBulk.cache;
        if(!cache) {
          cache = noBulk.cache = {};
          try { (root.noBulkCatKeysList() || []).forEach(function(k) { cache[String(k)] = 1; }); } catch(e) {}
        }
        return !!cache[String(key)];
      }
      function allTags() { var out = []; getItems().forEach(function(m) { tagsOf(m).forEach(function(t) { out.push(t); }); }); return out; }
      function resetOnly(key) {
        var cache = resetOnly.cache;
        if(!cache) {
          cache = resetOnly.cache = {};
          try { (root.resetOnlyCatKeysList() || []).forEach(function(k) { cache[String(k)] = 1; }); } catch(e) {}
        }
        return !!cache[String(key)];
      }
      // 💇 HÅR-SAMMENLÆGNING (brugerønske 2026-10-01: "hver gang jeg trykker noget med hår ind så
      // skriver den hair bagefter hver enkelte del"). Bokse med cfg.mergeTail (kun 💇 Hair) samler
      // ét-tags-moduler der ender på halen ("long hair", "black hair"...) i ÉT komma-led: "long black
      // hair". Fler-tags-moduler ("braided hair, braids") skrives som før, hvert sit led. Alt læses
      // tilbage ud af boks-teksten (statsløst, som resten af motoren): "on" = tagget står som eget
      // led ELLER tillægsordet indgår som helt ord i bundtet. Gamle spredte led ("... ginger hair,
      // black hair") suges ind i bundtet ved næste klik.
      var __tagStateOfRef = __tagStateOf, __tagAddModuleRef = __tagAddModule, __tagRemoveModuleRef = __tagRemoveModule;
      function __mergeAdj(m) {
        if(!cfg.mergeTail) return null;
        var tg = tagsOf(m);
        if(tg.length !== 1) return null;
        var t = normTag(tg[0]), tail = String(cfg.mergeTail).toLowerCase();
        if(t !== tail && t.slice(-(tail.length + 1)) !== " " + tail) return null;
        return t.slice(0, -(tail.length)).replace(/\s+$/, "");
      }
      function __hasWord(part, adj) { return (" " + normTag(part) + " ").indexOf(" " + normTag(adj) + " ") !== -1; }
      // Bundtet er det led der indeholder halen som HELT ord (ikke nødvendigvis til sidst — brugeren
      // skriver selv "styled in ..."-kombier efter, fx "... ginger hair styled in 4b curls").
      // MEN kun hvis leddet ligner HOVED-hår (brugerønske 2026-10-05: "vellus hair" og krops-fraser
      // ("thin ... body hair on lower legs") må aldrig blive bundt — ellers klistres farver på
      // hud-fnuller og krop). Krav: et af boksens EGNE hår-tillægsord står LIGE FORAN "hair",
      // og "hair" efterfølges ikke af "on ..." (krops-mønsteret).
      var __hairAdjCache = null;
      function __hairAdjs(itemsOpt) {
        if(itemsOpt) {
          var list2 = [], seen2 = {};
          itemsOpt.forEach(function(m) {
            var a = __mergeAdj(m);
            if(a && !seen2[a]) { seen2[a] = 1; list2.push(a); }
          });
          list2.sort(function(a, b) { return b.length - a.length; });
          __hairAdjCache = list2;
          return list2;
        }
        if(__hairAdjCache) return __hairAdjCache;
        var list = [], seen = {};
        getItems().forEach(function(m) {
          var a = __mergeAdj(m);
          if(a && !seen[a]) { seen[a] = 1; list.push(a); }
        });
        list.sort(function(a, b) { return b.length - a.length; });
        __hairAdjCache = list;
        return list;
      }
      function __escRe2(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
      function __isBundlePart(part) {
        var p = normTag(part), tail = String(cfg.mergeTail).toLowerCase();
        if((" " + p + " ").indexOf(" " + tail + " ") === -1) return false;
        if(/(^| )(body|pubic) hair( |$)/.test(p)) return false;
        try { if(new RegExp("\\b" + tail + "\\s+on\\b", "i").test(p)) return false; } catch(e) {}
        var adjs = __hairAdjs();
        for(var i = 0; i < adjs.length; i++) {
          try { if(new RegExp("\\b" + __escRe2(adjs[i]) + "\\s+" + tail + "\\b", "i").test(p)) return true; } catch(e) {}
        }
        return false;
      }
      function __bundleIdx(text) {
        var L = splitParts(text);
        for(var i = 0; i < L.length; i++) { if(__isBundlePart(L[i].part)) return i; }
        return -1;
      }
      // Deler et bundt-led i [tillægsord FØR "hair", resten EFTER "hair"] ("... ginger hair styled
      // in ..." → ["... ginger", "styled in ..."]). Bruges så brugerens egne efterhæng bevares.
      function __splitBundle(part) {
        var tail = String(cfg.mergeTail).toLowerCase();
        var words = normTag(part).split(" ");
        var ti = -1;
        for(var i = 0; i < words.length; i++) if(words[i] === tail) { ti = i; break; }
        if(ti === -1) return null;
        return { before: words.slice(0, ti).join(" ").replace(/\s+$/, ""), after: words.slice(ti + 1).join(" ").replace(/^\s+/, "") };
      }
      function __boxTailSet() {
        var set = {}, all = allTags(), tail = String(cfg.mergeTail).toLowerCase();
        for(var i = 0; i < all.length; i++) { var p = normTag(all[i]); if(p === tail || p.slice(-(tail.length + 1)) === " " + tail) set[p] = 1; }
        return set;
      }
      function __splicePart(text, idx, nu) {
        var L = splitParts(text), s = String(text == null ? "" : text), off = 0;
        for(var i = 0; i < L.length; i++) {
          var pStart = off, pEnd = pStart + L[i].part.length;
          if(i === idx) {
            var start = pStart, end = pEnd;
            if(nu === null || nu === undefined) { if(start > 0) start -= 1; else if(end < s.length) end += 1; }
            else return (s.slice(0, start) + nu + s.slice(end)).replace(/^[\s,]+/, "").replace(/\s+$/, "");
            return (s.slice(0, start) + s.slice(end)).replace(/^[\s,]+/, "").replace(/\s+$/, "");
          }
          off = pEnd + 1;
        }
        return s;
      }
      function stateOf(text, m) {
        var adj = __mergeAdj(m);
        if(adj === null) return __tagStateOfRef(text, m);
        if(hasTag(text, tagsOf(m)[0])) return "on";
        var bi = __bundleIdx(text);
        if(bi !== -1 && __hasWord(splitParts(text)[bi].part, adj)) return "on";
        return "off";
      }
      // Sætter ind/fjerner i ORIGINAL casing (brugerens "Twisted Halo Braid" må ikke blive
      // normaliseret til små bogstaver ved til/fra).
      function __escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
      function addModule(text, m, all) {
        var adj = __mergeAdj(m);
        if(adj === null) return __tagAddModuleRef(text, m, all);
        var s = String(text == null ? "" : text), tail = String(cfg.mergeTail).toLowerCase();
        if(hasTag(s, tagsOf(m)[0])) return s;
        var L = splitParts(s), bi = __bundleIdx(s);
        var set = __boxTailSet(), i, drop = [];
        for(i = 0; i < L.length; i++) { if(i !== bi && set[normTag(L[i].part)]) drop.push(i); }
        if(bi !== -1) {
          var part = L[bi].part;
          var nu = part.replace(/\bhair\b/i, adj + " $&");
          if(__hasWord(part, adj)) nu = part;
          drop.sort(function(a, b) { return b - a; });
          for(i = 0; i < drop.length; i++) s = __splicePart(s, drop[i], null);
          if(nu !== part) { bi = __bundleIdx(s); s = __splicePart(s, bi, nu); }
          return s;
        }
        var adjs = [];
        for(i = 0; i < L.length; i++) {
          if(set[normTag(L[i].part)]) {
            var a = normTag(L[i].part).slice(0, -(tail.length)).replace(/\s+$/, "");
            if(a && adjs.indexOf(a) === -1) adjs.push(a);
            drop.push(i);
          }
        }
        if(adjs.indexOf(adj) === -1) adjs.push(adj);
        var bundle = adjs.join(" ") + " " + tail;
        drop.sort(function(a, b) { return b - a; });
        for(i = 0; i < drop.length; i++) s = __splicePart(s, drop[i], null);
        return addBlock(s, bundle, all);
      }
      function removeModule(text, m) {
        var adj = __mergeAdj(m);
        if(adj === null) return __tagRemoveModuleRef(text, m);
        var s = String(text == null ? "" : text), tail = String(cfg.mergeTail).toLowerCase(), g = 0;
        while(hasTag(s, tagsOf(m)[0]) && g++ < 25) s = dropTag(s, tagsOf(m)[0]);
        var bi = __bundleIdx(s);
        if(bi !== -1) {
          var part = splitParts(s)[bi].part;
          if(__hasWord(part, adj)) {
            var hi = part.search(/\bhair\b/i);
            var before = hi !== -1 ? part.slice(0, hi) : part;
            var after = hi !== -1 ? part.slice(hi) : "";
            var kept = before.replace(new RegExp("\\b" + __escRe(adj) + "\\b", "gi"), " ").replace(/\s+/g, " ").trim();
            if(!kept && after.trim().toLowerCase() === tail) return __splicePart(s, bi, null);
            return __splicePart(s, bi, (kept ? kept + " " : "") + after.replace(/^\s+/, ""));
          }
        }
        return s;
      }
      function countOn(text) {
        if(!cfg.mergeTail) { var n = 0, al = allTags(); for(var i = 0; i < al.length; i++) if(hasTag(text, al[i])) n++; return n; }
        var items = getItems(), c = 0;
        for(var j = 0; j < items.length; j++) if(stateOf(text, items[j]) === "on") c++;
        return c;
      }
      function closePop() { if(pop) pop.classList.remove("open"); openKey = null; if(OPEN === api) OPEN = null; }
      var api = { close: closePop, box: function() { return box; } };

      function toggle(m) {
        var t = ta(); if(!t) return;
        var text = t.value || "";
        var nt = (stateOf(text, m) === "on") ? removeModule(text, m) : addModule(text, m, allTags());
        if(nt !== t.value) writeTa(nt);
        paint();
      }
      // 🔘 All on/off for ONE category (brugerønske 2026-09-29: knappen sidder nu på selve
      // kategori-rækken i boksen i stedet for i bunden af dropdown-menuen).
      function toggleCat(mine) {
        var t = ta(); if(!t) return;
        var text = t.value || "", all = allTags();
        var anyOff = false;
        mine.forEach(function(m) { if(stateOf(text, m) !== "on") anyOff = true; });
        mine.forEach(function(m) { text = anyOff ? addModule(text, m, all) : removeModule(text, m); });
        if(text !== t.value) writeTa(text);
        paint();
      }
      function openPop(cat, trig, mine) {
        if(OPEN && OPEN !== api) OPEN.close();
        openKey = cat.key;
        pop.innerHTML = "";
        mine.forEach(function(m) {
          var b = document.createElement("button"); b.type = "button"; b.className = "fxp-opt";
          var ck = document.createElement("span"); ck.className = "fxp-chk";
          // Valgmuligheden viser IKKE kategori-emojien (brugerønske 2026-10-01: triggeren siger
          // allerede fx "🎨 Color", så "🎨 Black" på hver række er en dobbelt-overskrift).
          var tx = document.createElement("span"); tx.textContent = String(m.label).replace(/^\S+\s+/, "");
          b.appendChild(ck); b.appendChild(tx);
          b.__m = m; b.__ck = ck;
          b.title = (m.tip ? m.tip + " — " : "") + "Click to put \"" + String(m.text) + "\" into the Description box; click again to take it out.";
          b.addEventListener("click", function(ev) { ev.preventDefault(); ev.stopPropagation(); toggle(m); });
          pop.appendChild(b);
        });
        pop.classList.add("open");
        OPEN = api;
        // Samme princip som parameter-boksene: page-koordinater, så popoveren følger sin menu.
        var r = trig.getBoundingClientRect(), w = pop.offsetWidth;
        var sx = window.pageXOffset || document.documentElement.scrollLeft || 0;
        var sy = window.pageYOffset || document.documentElement.scrollTop || 0;
        var left = Math.max(6, Math.min(r.left + sx, (document.documentElement.clientWidth || window.innerWidth) - w - 6 + sx));
        pop.style.left = left + "px"; pop.style.top = (r.bottom + sy + 4) + "px";
      }
      function paint() {
        if(!box) return;
        var text = ta() ? (ta().value || "") : "";
        var cats = getCats(), items = getItems();
        var all = allTags(), onN = countOn(text);
        // Tællingen er nu i SAMME enhed som 🧬-standardrækkerne: hele blokke (moduler), ikke enkelte
        // ord. "X/Y ▣N" = X helt tændt / Y i alt / N kun delvist tændt (gul). Det gør "hvor meget er
        // der on" entydigt, og hvad der er on ser man ved at gå ind i menuen (brugerønske 2026-09-24).
        var totN = 0, fullN = 0;
        cats.forEach(function(cat) {
          var trig = box.querySelector('.fxp-trig[data-key="' + cat.key + '"]');
          if(!trig) return;
          var mine = items.filter(function(m) { return String(m.cat) === String(cat.key); });
          var full = 0;
          mine.forEach(function(m) { var s = stateOf(text, m); if(s === "on") full++; });
          totN += mine.length; fullN += full;
          trig.classList.toggle("has", full > 0);
          var pv = trig.querySelector(".fxp-preview");
          if(pv) {
            var pvT = "";
            if(pv.textContent !== pvT) pv.textContent = pvT;
            if(pv.classList.contains("fxp-part")) pv.classList.remove("fxp-part");
            var pvTip = full + " of " + mine.length + " on. " + (mine.length - full) + " off.";
            if(pv.dataset.tip !== pvTip) pv.dataset.tip = pvTip;
          }
          // 🖱 "hvad er tændt": de tændte tags (labels) stilles til den fælles hover-tip.
          var onLbl = [];
          mine.forEach(function(m) { var s = stateOf(text, m); if(s === "on") onLbl.push(m.label); });
          var hovT = onLbl.length ? onLbl.join("\n") : "";
          if(trig.dataset.hover !== hovT) trig.dataset.hover = hovT;
          // 🔬 Kilde-opdeling i 📜 Current Prompt: de tændte tags' FAKTISKE ord (m.text), så
          // udlæsningen kan farve dem som "Your tags" i stedet for "Your prompt".
          var onTx = [];
          mine.forEach(function(m) { var s = stateOf(text, m); if(s === "on") { var t = String(m.text || "").trim(); if(t) onTx.push(t); } });
          var txT = onTx.join("|");
          if(trig.dataset.tags !== txT) trig.dataset.tags = txT;
          var ab = box.querySelector('.fxp-all[data-key="' + cat.key + '"]');
          if(ab) {
            ab.classList.toggle("on", full > 0);
            ab.classList.remove("part");
            if(ab.__ck) { var abCk = full ? (full + "/" + mine.length) : ""; if(ab.__ck.textContent !== abCk) ab.__ck.textContent = abCk; }
          }
        });
        var c = box.querySelector(".fxp-count");
        if(c) {
          var s = "";
          if(c.textContent !== s) c.textContent = s;
          if(String(c.dataset.n || "") !== String(fullN)) c.dataset.n = String(fullN);
          if(c.classList.contains("fxp-part")) c.classList.remove("fxp-part");
          var cTip = fullN + " of " + totN + " on. " + (totN - fullN) + " off.";
          if(c.dataset.tip !== cTip) c.dataset.tip = cTip;
        }
        if(clearBtn) {
          var isOnT = onN > 0;
          clearBtn.classList.toggle("on", isOnT);
          var btT = "\u21BA";
          if(clearBtn.textContent !== btT) clearBtn.textContent = btT;
          var bttT = isOnT ? "Resets Box & Removes all tags this box added to your prompt" : "";
          if(clearBtn.title !== bttT) clearBtn.title = bttT;
          if(clearBtn.getAttribute("aria-label") !== "Reset") clearBtn.setAttribute("aria-label", "Reset");
        }
        if(pop && pop.classList.contains("open") && openKey) {
          Array.prototype.forEach.call(pop.querySelectorAll(".fxp-opt"), function(b) {
            if(!b.__m) return;
            var st = stateOf(text, b.__m);
            b.classList.toggle("on", st === "on");
            b.classList.remove("part");
            if(b.__ck) { var bCk = st === "on" ? "\u2611" : "\u2610"; if(b.__ck.textContent !== bCk) b.__ck.textContent = bCk; }
          });
        }
      }
      function place() {
        if(!box) return;
        var df = document.getElementById("paramFrame") || document.getElementById("descFrame") || (ta() && ta().closest(".prompt-frame"));
        if(!df) return;
        var after = cfg.anchor();
        if(!after) { if(box.parentElement !== df) df.appendChild(box); return; }
        if(after.nextElementSibling !== box) after.insertAdjacentElement("afterend", box);
      }
      function build() {
        var cats = getCats(), items = getItems();
        if(cfg.mergeTail) { try { __hairAdjs(items); } catch(__he) {} }
        // Tom boks beholdes kun hvis den er bedt om det (cfg.allowEmpty — 🏷 Face tags står tom
        // indtil videre, brugerønske 2026-10-04): hoved + tom krop bygges som normalt, bare uden rækker.
        if((!cats.length || !items.length) && !cfg.allowEmpty) return;
        if(!pop) { pop = document.createElement("div"); pop.id = cfg.popId; pop.className = "fxp-pop"; document.body.appendChild(pop); }
        if(box && box.isConnected) { place(); paint(); return; }
        box = document.createElement("div"); box.id = cfg.boxId; box.className = "fxp-box";
        var head = document.createElement("div"); head.className = "fxp-head";
        var car = document.createElement("span"); car.className = "fxp-car"; car.textContent = "\u25BE";
        var lab = document.createElement("span"); lab.className = "fxp-label"; lab.textContent = cfg.title;
        var cnt = document.createElement("span"); cnt.className = "fxp-count"; cnt.textContent = "0/" + items.length;
        var clr = document.createElement("button"); clearBtn = clr; clr.type = "button"; clr.className = "fxp-clear"; clr.textContent = "";
        clr.addEventListener("click", function(ev) {
          ev.preventDefault(); ev.stopPropagation();
          var t = ta(); if(!t) return;
          var text = t.value || "";
          getItems().forEach(function(m) { text = removeModule(text, m); });
          if(text !== t.value) writeTa(text);
          paint();
        });
        head.appendChild(car); head.appendChild(lab); head.appendChild(cnt); head.appendChild(clr);
        head.addEventListener("click", function() {
          var f = !box.classList.contains("folded");
          box.classList.toggle("folded", f);
          car.textContent = f ? "\u25B8" : "\u25BE";
          try { localStorage.setItem(cfg.foldKey, f ? "1" : "0"); } catch(e) {}
          closePop();
          try { paint(); } catch(e) {}
        });
        box.appendChild(head);
        var body = document.createElement("div"); body.className = "fxp-body";
        var grid = document.createElement("div"); grid.className = "fxp-grid";
        cats.forEach(function(cat) {
          var p = document.createElement("div"); p.className = "fxp-param"; p.dataset.key = cat.key;
          var trig = document.createElement("button"); trig.type = "button"; trig.className = "fxp-trig"; trig.dataset.key = cat.key;
          var mine = items.filter(function(m) { return String(m.cat) === String(cat.key); });
          trig.title = "Tick the tags you want from \"" + cat.label.replace(/^\S+\s/, "") + "\". Each ticked tag writes its own comma-part into the Description box.";
          var nm = document.createElement("span"); nm.className = "fxp-name"; nm.textContent = cat.label;
          var pv = document.createElement("span"); pv.className = "fxp-preview";
          var ca = document.createElement("span"); ca.className = "fxp-car2"; ca.textContent = "\u25BE";
          trig.appendChild(nm); trig.appendChild(pv); trig.appendChild(ca);
          trig.addEventListener("click", function(ev) {
            ev.preventDefault(); ev.stopPropagation();
            if(pop.classList.contains("open") && openKey === cat.key) closePop(); else openPop(cat, trig, mine);
          });
          p.appendChild(trig);
          if(resetOnly(cat.key)) {
            var rsPill = document.createElement("button");
            rsPill.type = "button"; rsPill.className = "fxp-all"; rsPill.dataset.key = cat.key;
            rsPill.__ck = document.createElement("span"); rsPill.__ck.className = "fxp-allck"; rsPill.__ck.textContent = "";
            rsPill.appendChild(rsPill.__ck);
            rsPill.title = "Reset \"" + cat.label.replace(/^\S+\s/, "") + "\" — remove only this row's tags from the Description box (never turns everything on; your own text is never touched).";
            rsPill.setAttribute("aria-label", "Reset " + cat.label);
            rsPill.addEventListener("click", function(ev) {
              ev.preventDefault(); ev.stopPropagation();
              var t = ta(); if(!t) return;
              var text = t.value || "";
              mine.forEach(function(m) { text = removeModule(text, m); });
              if(text !== t.value) writeTa(text);
              paint();
            });
            p.appendChild(rsPill);
          } else if(!noBulk(cat.key)) {
            var allBtn = document.createElement("button");
            allBtn.type = "button"; allBtn.className = "fxp-all"; allBtn.dataset.key = cat.key;
            allBtn.__ck = document.createElement("span"); allBtn.__ck.className = "fxp-allck"; allBtn.__ck.textContent = "";
            allBtn.appendChild(allBtn.__ck);
            allBtn.title = "Turn every tag in \"" + cat.label.replace(/^\S+\s/, "") + "\" on (or off again) in one click.";
            allBtn.addEventListener("click", function(ev) { ev.preventDefault(); ev.stopPropagation(); toggleCat(mine); });
            p.appendChild(allBtn);
          } else {
            var rsBtn = document.createElement("button");
            rsBtn.type = "button"; rsBtn.className = "fxp-catreset"; rsBtn.dataset.key = cat.key; rsBtn.textContent = "\u21BA";
            rsBtn.title = "Reset \"" + cat.label.replace(/^\S+\s/, "") + "\" — remove only this row's tags from the Description box (your own text is never touched).";
            rsBtn.setAttribute("aria-label", "Reset " + cat.label);
            rsBtn.addEventListener("click", function(ev) {
              ev.preventDefault(); ev.stopPropagation();
              var t = ta(); if(!t) return;
              var text = t.value || "";
              mine.forEach(function(m) { text = removeModule(text, m); });
              if(text !== t.value) writeTa(text);
              paint();
            });
            p.appendChild(rsBtn);
          }
          grid.appendChild(p);
        });
        body.appendChild(grid); box.appendChild(body);
        try { if(localStorage.getItem(cfg.foldKey) !== "0") { box.classList.add("folded"); car.textContent = "\u25B8"; } } catch(e) { try { box.classList.add("folded"); car.textContent = "\u25B8"; } catch(_){} }
        place(); paint();
      }
      ours.push(api);
      build();
      var __genTimer = setInterval(function() { if (window.__fluxBoxesGen !== __fluxInitGen) { try { clearInterval(__genTimer); } catch(__ce) {} return; } build(); }, 700);
    }

    makeTagBox({ boxId: "fluxSkinTagBox", popId: "fxpPopSkinTags", title: "\ud83e\uddf4\ud83c\udff7\ufe0f Skin tags:", area: "skin",
      listFn: "standardPosSkinList", catsFn: "standardPosSkinCatsList", foldKey: "fluxSkinTagFold",
      anchor: function() { return document.getElementById("fluxSkinBox") || null; } });
    makeTagBox({ boxId: "fluxBodyTagBox", popId: "fxpPopBodyTags", title: "\ud83e\uddcd\ud83c\udff7\ufe0f Body tags:", area: "Body",
      listFn: "standardPosBodyList", catsFn: "standardPosBodyCatsList", foldKey: "fluxBodyTagFold",
      anchor: function() { return document.getElementById("fluxParamBox") || null; } });

    makeTagBox({ boxId: "fluxFaceTagBox", popId: "fxpPopFaceTags", title: "\ud83d\udc8e Facial Adornment:", area: "Face",
      listFn: "standardPosFaceTagsList", catsFn: "standardPosFaceTagsCatsList", foldKey: "fluxFaceTagFold",
      allowEmpty: true,
      anchor: function() { return document.getElementById("fluxFaceBox") || document.getElementById("fluxBodyTagBox") || null; } });

    makeTagBox({ boxId: "fluxHairTagBox", popId: "fxpPopHairTags", title: "\ud83d\udc87 Hair:", area: "Hair", mergeTail: "hair",
      listFn: "standardPosHairList", catsFn: "standardPosHairCatsList", foldKey: "fluxHairTagFold",
      anchor: function() { return document.getElementById("fluxProfessionBox") || document.getElementById("fluxRaceBox") || document.getElementById("fluxFoldBar") || null; } });

    // Luk den åbne tag-popover når man klikker udenfor den — også når klikket rammer en FREMMED
    // trigger (fx en parameter-trigger), så to popovers aldrig står oveni hinanden.
    document.addEventListener("click", function(ev) {
      if(!OPEN) return;
      var t = ev.target;
      if(t && t.closest && t.closest(".fxp-pop")) return;
      var trg = (t && t.closest) ? t.closest(".fxp-trig") : null;
      if(trg) { var ia = false; ours.forEach(function(a) { if(a.box() && a.box().contains(trg)) ia = true; }); if(ia) return; }
      OPEN.close();
    }, true);
    document.addEventListener("keydown", function(ev) { if(ev.key === "Escape" && OPEN) OPEN.close(); });
    window.addEventListener("resize", function() { if(OPEN) OPEN.close(); });
  })();
  (function() {
    // 🧛 RACE & SPECIES + 🎒 OBJECTS & MATERIALS (brugerønske 2026-09-29): de to nye områder bygges af
    // ÉN lille fabrik, der ligner 🧍 Body & Face / 🧴 Skin / 🌿 Nature (multi-select-dropdown pr.
    // parameter, ét komma-led pr. parameter i Description). Selve ordbunken bor i main.pjs
    // (raceParams/objectParams + raceParamsList()/objectParamsList()).
    function makeParamBox(cfg) {
      var LS = cfg.lsKey, LSP = cfg.lsPrevKey, LSF = cfg.foldKey;
      var DEFS = null;
      var state = {}, prev = {};
      var lastBox = null;
      var armed = false, hookEl = null;
      var box = null, gridEl = null, pop = null, popKey = null, clearBtn = null;

      function loadJSON(k) { try { var o = JSON.parse(localStorage.getItem(k) || "null"); return (o && typeof o === "object") ? o : {}; } catch(e) { return {}; } }
      function saveJSON(k, o) { try { localStorage.setItem(k, JSON.stringify(o)); } catch(e) {} }
      function defs() {
        if(DEFS) return DEFS;
        try { if(window.root && typeof root[cfg.listFn] === "function") DEFS = root[cfg.listFn](); } catch(e) {}
        return DEFS || null;
      }
      function ta() { return document.querySelector('#fluxDescTa'); }
      function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").replace(/^[\s,]+/, "").replace(/[\s,.!;:]+$/, ""); }
      function splitParts(text) {
        var s = String(text == null ? "" : text), out = [], buf = "", sep = "";
        for(var i = 0; i < s.length; i++) { var ch = s.charAt(i); if(ch === "," || ch === "\n") { out.push({ sep: sep, part: buf }); buf = ""; sep = ch; } else buf += ch; }
        out.push({ sep: sep, part: buf });
        return out;
      }
      function hasTag(text, tag) { var t = norm(tag), list = splitParts(text); for(var i = 0; i < list.length; i++) if(norm(list[i].part) === t) return true; return false; }
      function addGentle(text, word) { var s = String(text == null ? "" : text); if(hasTag(s, word)) return s; if(!s.trim()) return String(word); return s.replace(/\s+$/, "") + ", " + String(word); }
      function removeGentle(text, word) {
        var t = norm(word), s = String(text == null ? "" : text), ranges = [], start = 0;
        for(var i = 0; i < s.length; i++) { var ch = s.charAt(i); if(ch === "," || ch === "\n") { ranges.push({ s: start, e: i }); start = i + 1; } }
        ranges.push({ s: start, e: s.length });
        for(var r = ranges.length - 1; r >= 0; r--) {
          var rg = ranges[r];
          if(norm(s.slice(rg.s, rg.e)) !== t) continue;
          var from, to;
          if(rg.s > 0) { from = rg.s - 1; to = rg.e; } else { from = 0; to = (ranges.length > 1 ? ranges[1].s : rg.e); }
          s = s.slice(0, from) + s.slice(to);
          break;
        }
        return s.replace(/^[\s,]+/, "").replace(/\s+$/, "");
      }
      function writeTa(text) { var t = ta(); if(!t) return; t.value = text; t.dispatchEvent(new Event("input", { bubbles: true })); }
      function compose(def, words) {
        var sel = words || [];
        if(!sel.length) return "";
        var inc = function(w) { for(var i = 0; i < sel.length; i++) if(String(sel[i]) === String(w)) return true; return false; };
        var pre = (def.pre || []).filter(inc), post = (def.post || []).filter(inc);
        var core = [];
        if(pre.length) core.push(pre.join(" "));
        if(def.subject) core.push(def.subject);
        var s = core.join(" ");
        if(!s && post.length) s = "figure";
        if(!s) return "";
        if(def.article) s = def.article + " " + s;
        if(post.length) s += " with " + post.join(" and ");
        return s;
      }
      function __escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
      function extractWords(def, phrase) {
        var hay = " " + norm(phrase) + " ", seen = {};
        (def.pre || []).concat(def.post || []).forEach(function(w) {
          w = String(w); if(seen[w]) return;
          try { if(hay.search(new RegExp("\\b" + __escRe(norm(w)) + "\\b", "i")) !== -1) { seen[w] = 1; } } catch(e) {}
        });
        var ord = [];
        (def.pre || []).forEach(function(w) { if(seen[String(w)] && ord.indexOf(w) === -1) ord.push(w); });
        (def.post || []).forEach(function(w) { if(seen[String(w)] && ord.indexOf(w) === -1) ord.push(w); });
        return ord;
      }
      function reconcile(key, allowClear) {
        var ds = defs(); if(!ds) return false;
        var def = null; for(var i = 0; i < ds.length; i++) if(ds[i].key === key) def = ds[i];
        if(!def) return false;
        var t = ta(); if(!t) return false;
        var text = t.value || "", words = state[key] || [];
        var phrase = compose(def, words);
        if(phrase && hasTag(text, phrase)) return false;
        var cand = prev[key] || "";
        if(cand && hasTag(text, cand)) {
          var healed = extractWords(def, cand);
          if(healed.length && healed.join("\u0001") !== words.join("\u0001")) {
            state[key] = healed; saveJSON(LS, state); return true;
          }
          return false;
        }
        if(allowClear && words.length) {
          state[key] = []; saveJSON(LS, state);
          if(prev[key]) { delete prev[key]; saveJSON(LSP, prev); }
          return true;
        }
        return false;
      }
      function apply(key) {
        var ds = defs(); if(!ds) return;
        var def = null; for(var i = 0; i < ds.length; i++) if(ds[i].key === key) def = ds[i];
        if(!def) return;
        var t = ta(); if(!t) return;
        var old = prev[key] || "";
        var nu = compose(def, state[key] || []);
        var text = t.value || "";
        if(old && hasTag(text, old)) text = removeGentle(text, old);
        if(nu) text = addGentle(text, nu);
        if(text !== t.value) writeTa(text);
        if(nu) prev[key] = nu; else delete prev[key];
        saveJSON(LSP, prev);
        paint();
      }
      function clearAll() {
        var t = ta(), text = t ? (t.value || "") : "";
        Object.keys(state).forEach(function(k) { var old = prev[k]; if(old && hasTag(text, old)) text = removeGentle(text, old); });
        if(t && text !== t.value) writeTa(text);
        state = {}; prev = {}; saveJSON(LS, state); saveJSON(LSP, prev);
        paint();
      }
      function paint() {
        if(!box) return;
        var ds = defs() || [], text = (ta() ? (ta().value || "") : "");
        var on = 0;
        var __ext = false;
        var __ta = null; try { __ta = ta(); } catch(__te) {}
        if(__ta && hookEl !== __ta) { hookEl = __ta; try { __ta.addEventListener("input", function(e) { if(e && e.isTrusted) { armed = true; } }); } catch(__he) {} }
        if(lastBox !== null && text !== lastBox && armed) { __ext = true; }
        lastBox = text;
        ds.forEach(function(d) {
          try { reconcile(d.key, __ext); } catch(__re) {}
          var words = state[d.key] || [];
          var trig = box.querySelector('.fxp-trig[data-key="' + d.key + '"]');
          if(!trig) return;
          var phrase = compose(d, words);
          var inBox = phrase ? hasTag(text, phrase) : false;
          trig.classList.toggle("has", inBox);
          var pv = trig.querySelector(".fxp-preview");
          if(pv && pv.textContent !== phrase) pv.textContent = phrase;
          var rb = box.querySelector('.fxp-catreset[data-key="' + d.key + '"]');
          if(rb) rb.classList.toggle("on", words.length > 0);
          if(phrase) on++;
        });
        if(pop && pop.classList.contains("open") && popKey) {
          try {
            Array.prototype.forEach.call(pop.querySelectorAll(".fxp-opt"), function(b) {
              if(b.__w === undefined || b.__w === null) return;
              var __on = (state[popKey] || []).indexOf(b.__w) !== -1;
              b.classList.toggle("on", __on);
              var __ck = b.querySelector(".fxp-chk");
              if(__ck) { var __ct = __on ? "\u2611" : "\u2610"; if(__ck.textContent !== __ct) __ck.textContent = __ct; }
            });
          } catch(__pr) {}
        }
        var c = box.querySelector(".fxp-count");
        if(c) { var s = ""; if(c.textContent !== s) c.textContent = s; if(String(c.dataset.n || "") !== String(on)) c.dataset.n = String(on); }
        if(clearBtn) {
          var isOn = on > 0;
          clearBtn.classList.toggle("on", isOn);
          var bt = "\u21BA";
          if(clearBtn.textContent !== bt) clearBtn.textContent = bt;
          var btt = isOn ? "Resets Box & Removes all tags this box added to your prompt" : "";
          if(clearBtn.title !== btt) clearBtn.title = btt;
          if(clearBtn.getAttribute("aria-label") !== "Reset") clearBtn.setAttribute("aria-label", "Reset");
        }
      }
      function closePop() { if(pop) pop.classList.remove("open"); popKey = null; }
      function optBtn(def, w, isPost) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "fxp-opt";
        b.__w = w;
        var on = (state[def.key] || []).indexOf(w) !== -1;
        if(on) b.classList.add("on");
        var ck = document.createElement("span"); ck.className = "fxp-chk"; ck.textContent = on ? "\u2611" : "\u2610";
        var tx = document.createElement("span"); tx.textContent = isPost ? ("with " + w) : w;
        b.appendChild(ck); b.appendChild(tx);
        b.addEventListener("click", function(ev) {
          ev.preventDefault(); ev.stopPropagation();
          var arr = state[def.key] ? state[def.key].slice() : [];
          var __wasOn = arr.indexOf(w) !== -1;
          var __before = compose(def, arr);
          var j = arr.indexOf(w);
          if(j === -1) arr.push(w); else arr.splice(j, 1);
          state[def.key] = arr; saveJSON(LS, state);
          apply(def.key);
          if(__wasOn && __before) { try { var __t2 = ta(); if(__t2 && hasTag(__t2.value || "", __before)) writeTa(removeGentle(__t2.value, __before)); } catch(__be) {} }
          var on2 = arr.indexOf(w) !== -1;
          b.classList.toggle("on", on2);
          ck.textContent = on2 ? "\u2611" : "\u2610";
        });
        return b;
      }
      function openPop(def, trig) {
        popKey = def.key;
        pop.innerHTML = "";
        var subs = (def.subs && def.subs.length) ? def.subs : null;
        if(subs) {
          var seen = {};
          subs.forEach(function(g) {
            var h = document.createElement("div"); h.className = "fxp-opth"; h.textContent = g.label; pop.appendChild(h);
            (g.words || []).forEach(function(w) {
              if((def.pre || []).indexOf(w) === -1) return;
              pop.appendChild(optBtn(def, w, false)); seen[w] = 1;
            });
          });
          var rest = (def.pre || []).filter(function(w) { return !seen[w]; });
          if(rest.length) {
            var mh = document.createElement("div"); mh.className = "fxp-opth"; mh.textContent = "Misc."; pop.appendChild(mh);
            rest.forEach(function(w) { pop.appendChild(optBtn(def, w, false)); });
          }
        } else {
          (def.pre || []).forEach(function(w) { pop.appendChild(optBtn(def, w, false)); });
        }
        (def.post || []).forEach(function(w) { pop.appendChild(optBtn(def, w, true)); });
        pop.classList.add("open");
        var r = trig.getBoundingClientRect();
        var w = pop.offsetWidth;
        var sx = window.pageXOffset || document.documentElement.scrollLeft || 0;
        var sy = window.pageYOffset || document.documentElement.scrollTop || 0;
        var left = Math.max(6, Math.min(r.left + sx, (document.documentElement.clientWidth || window.innerWidth) - w - 6 + sx));
        pop.style.left = left + "px";
        pop.style.top = (r.bottom + sy + 4) + "px";
      }
      function place() {
        if(!box) return;
        var df = document.getElementById("paramFrame") || document.getElementById("descFrame") || (ta() && ta().closest(".prompt-frame"));
        if(!df) return;
        var after = cfg.anchor();
        if(!after) { if(box.parentElement !== df) df.appendChild(box); return; }
        if(after.nextElementSibling !== box) after.insertAdjacentElement("afterend", box);
      }
      function build() {
        var ds = defs();
        if(!ds || !ds.length) return;
        if(!pop) { pop = document.createElement("div"); pop.id = cfg.popId; pop.className = "fxp-pop"; document.body.appendChild(pop); }
        if(box && box.isConnected) { place(); paint(); return; }
        box = document.createElement("div");
        box.id = cfg.boxId;
        box.className = "fxp-box";
        var head = document.createElement("div"); head.className = "fxp-head";
        var car = document.createElement("span"); car.className = "fxp-car"; car.textContent = "\u25BE";
        var lab = document.createElement("span"); lab.className = "fxp-label"; lab.textContent = cfg.title;
        var cnt = document.createElement("span"); cnt.className = "fxp-count"; cnt.textContent = "0/" + ds.length;
        var clr = document.createElement("button"); clearBtn = clr;
        clr.type = "button"; clr.className = "fxp-clear"; clr.textContent = "";
        clr.addEventListener("click", function(ev) { ev.preventDefault(); ev.stopPropagation(); clearAll(); });
        head.appendChild(car); head.appendChild(lab); head.appendChild(cnt); head.appendChild(clr);
        head.addEventListener("click", function() {
          var f = !box.classList.contains("folded");
          box.classList.toggle("folded", f);
          car.textContent = f ? "\u25B8" : "\u25BE";
          closePop();
          try { localStorage.setItem(LSF, f ? "1" : "0"); } catch(e) {}
          try { paint(); } catch(e) {}
        });
        box.appendChild(head);
        var body = document.createElement("div"); body.className = "fxp-body";
        gridEl = document.createElement("div"); gridEl.className = "fxp-grid";
        ds.forEach(function(d) {
          var p = document.createElement("div"); p.className = "fxp-param"; p.dataset.key = d.key;
          var trig = document.createElement("button");
          trig.type = "button"; trig.className = "fxp-trig"; trig.dataset.key = d.key;
          trig.title = "Pick one or more words for the " + String(d.label).toLowerCase() + ". Several can be on at once, and they combine into one phrase in the Description box.";
          var nm = document.createElement("span"); nm.className = "fxp-name"; nm.textContent = d.label;
          var pv = document.createElement("span"); pv.className = "fxp-preview";
          var ca = document.createElement("span"); ca.className = "fxp-car2"; ca.textContent = "\u25BE";
          trig.appendChild(nm); trig.appendChild(pv); trig.appendChild(ca);
          trig.addEventListener("click", function(ev) {
            ev.preventDefault(); ev.stopPropagation();
            if(pop.classList.contains("open") && popKey === d.key) closePop(); else openPop(d, trig);
          });
          p.appendChild(trig);
          var rs = document.createElement("button");
          rs.type = "button"; rs.className = "fxp-catreset"; rs.dataset.key = d.key; rs.textContent = "\u21BA";
          rs.title = "Reset " + d.label + " \u2014 remove what this parameter added (your own text is never touched).";
          rs.setAttribute("aria-label", "Reset " + d.label);
          rs.addEventListener("click", function(ev) { ev.preventDefault(); ev.stopPropagation(); state[d.key] = []; saveJSON(LS, state); apply(d.key); });
          p.appendChild(rs);
          gridEl.appendChild(p);
        });
        body.appendChild(gridEl);
        box.appendChild(body);
        try { if(localStorage.getItem(LSF) !== "0") { box.classList.add("folded"); car.textContent = "\u25B8"; } } catch(e) { try { box.classList.add("folded"); car.textContent = "\u25B8"; } catch(_){} }
        document.addEventListener("click", function(ev) {
          if(!pop || !pop.classList.contains("open")) return;
          var t = ev.target;
          if(t && pop.contains(t)) return;
          var trg = (t && t.closest) ? t.closest(".fxp-trig") : null;
          if(trg && box && box.contains(trg)) return;
          closePop();
        }, true);
        document.addEventListener("keydown", function(ev) { if(ev.key === "Escape") closePop(); });
        window.addEventListener("resize", closePop);
        place();
        paint();
      }
      state = loadJSON(LS);
      prev = loadJSON(LSP);
      try {
        var __killJunk = function(w) { w = String(w == null ? "" : w); return w.indexOf("//") !== -1 || w.indexOf("L\u00E6ser") !== -1; };
        var __fixed = false, __k;
        for (__k in state) { if (Array.isArray(state[__k])) { var __f = state[__k].filter(function(w) { return !__killJunk(w); }); if (__f.length !== state[__k].length) { state[__k] = __f; __fixed = true; } } }
        for (__k in prev) { if (typeof prev[__k] === "string" && __killJunk(prev[__k])) { delete prev[__k]; __fixed = true; } }
        if (__fixed) { saveJSON(LS, state); saveJSON(LSP, prev); }
        var __t = (typeof ta === "function") ? ta() : null;
        if (__t && __killJunk(__t.value)) {
          var __parts = splitParts(__t.value), __keep = [], __i, __j, __s = "";
          for (__i = 0; __i < __parts.length; __i++) { if (!__killJunk(__parts[__i].part)) __keep.push(__parts[__i]); }
          for (__j = 0; __j < __keep.length; __j++) { if (__j > 0) __s += (__keep[__j].sep || ","); __s += __keep[__j].part; }
          __s = __s.replace(/^[\s,]+/, "").replace(/\s+$/, "");
          if (__s !== __t.value) writeTa(__s);
        }
      } catch (__e) {}
      build();
      var __genTimer = setInterval(function() { if (window.__fluxBoxesGen !== __fluxInitGen) { try { clearInterval(__genTimer); } catch(__ce) {} return; } build(); }, 700);
      try {
        window.addEventListener("storage", function(e) {
          if(e && (e.key === LS || e.key === LSP)) {
            state = loadJSON(LS); prev = loadJSON(LSP);
            try { paint(); } catch(__se) {}
          }
        });
      } catch(__se) {}
    }

    makeParamBox({
      boxId: "fluxHairstyleBox", popId: "fxpPopHairstyle", title: "💇💈 Finished Styles:",
      listFn: "hairstyleParamsList", lsKey: "fluxHairstyleParams", lsPrevKey: "fluxHairstyleParamsPrev",
      foldKey: "fluxHairstyleFold", area: "Hairstyles",
      anchor: function() { return document.getElementById("fluxHairTagBox") || document.getElementById("fluxProfessionBox") || null; }
    });

    makeParamBox({
      boxId: "fluxFaceBox", popId: "fxpPopFace", title: "\ud83d\ude42 Face:",
      listFn: "faceParamsList", lsKey: "fluxFaceParams", lsPrevKey: "fluxFaceParamsPrev",
      foldKey: "fluxFaceFold", area: "Face",
      anchor: function() { return document.getElementById("fluxBodyTagBox") || document.getElementById("fluxParamBox") || null; }
    });

    // 👁 EYES (brugerønske 2026-10-04: øjen-tingene samlet — eyebrows/eyes/eyeShape/eyeColor ud af
    // 🙂 Face + øjen-udtrykkene ud af Expression + øjen-chipsene ud af 🏷 Face tags).
    // Engangsmigrering af brugerens gamle Face-valg, så intet tændt går tabt ved flytningen
    // (teksten i Description røres ALDRIG — kun hvilken boks der ejer valgene).
    try {
      (function() {
        var KEYS = ["eyebrows", "eyes", "eyeShape", "eyeColor"];
        var EYE_WORDS = ["blinking", "gazing", "glaring", "looking", "raised eyebrows", "seeing", "squinting", "staring", "watching", "winking"];
        function lj(k) { try { var o = JSON.parse(localStorage.getItem(k) || "null"); return (o && typeof o === "object") ? o : null; } catch(e) { return null; } }
        var fs = lj("fluxFaceParams"), fp = lj("fluxFaceParamsPrev");
        if(!fs && !fp) return;
        var es = lj("fluxEyesParams") || {}, ep = lj("fluxEyesParamsPrev") || {}, touched = false, touchedP = false;
        function noArr(o, k) { return !o || !Array.isArray(o[k]) || !o[k].length; }
        if(fs) {
          KEYS.forEach(function(k) {
            if(Array.isArray(fs[k]) && fs[k].length && noArr(es, k)) { es[k] = fs[k].slice(); touched = true; }
            delete fs[k];
          });
          if(Array.isArray(fs.expressions) && fs.expressions.length) {
            var stay = [], move = [];
            fs.expressions.forEach(function(w) { ((EYE_WORDS.indexOf(w) !== -1) ? move : stay).push(w); });
            if(move.length) {
              if(noArr(es, "eyeExpression")) { es.eyeExpression = move; touched = true; }
              if(stay.length) fs.expressions = stay; else delete fs.expressions;
            }
          }
          try { localStorage.setItem("fluxFaceParams", JSON.stringify(fs)); } catch(e) {}
        }
        if(fp) {
          KEYS.forEach(function(k) {
            if(typeof fp[k] === "string" && fp[k] && typeof ep[k] !== "string") { ep[k] = fp[k]; touchedP = true; }
            delete fp[k];
          });
          try { localStorage.setItem("fluxFaceParamsPrev", JSON.stringify(fp)); } catch(e) {}
        }
        if(touched) { try { localStorage.setItem("fluxEyesParams", JSON.stringify(es)); } catch(e) {} }
        if(touchedP) { try { localStorage.setItem("fluxEyesParamsPrev", JSON.stringify(ep)); } catch(e) {} }
      })();
    } catch(e) {}

    makeParamBox({
      boxId: "fluxEyesBox", popId: "fxpPopEyes", title: "\ud83d\udc41\ufe0f Eyes:",
      listFn: "eyesParamsList", lsKey: "fluxEyesParams", lsPrevKey: "fluxEyesParamsPrev",
      foldKey: "fluxEyesFold", area: "Eyes",
      anchor: function() { return document.getElementById("fluxFaceTagBox") || document.getElementById("fluxFaceBox") || null; }
    });

    makeParamBox({
      boxId: "fluxSizeBox", popId: "fxpPopSize", title: "\ud83d\udccf Size:",
      listFn: "sizeParamsList", lsKey: "fluxSizeParams", lsPrevKey: "fluxSizeParamsPrev",
      foldKey: "fluxSizeFold", area: "Size",
      anchor: function() { return document.getElementById("fluxSkinTagBox") || document.getElementById("fluxSkinBox") || document.getElementById("fluxFaceTagBox") || null; }
    });

    makeParamBox({
      boxId: "fluxShapeBox", popId: "fxpPopShape", title: "\ud83d\udd37 Shape:",
      listFn: "shapeParamsList", lsKey: "fluxShapeParams", lsPrevKey: "fluxShapeParamsPrev",
      foldKey: "fluxShapeFold", area: "Shape",
      anchor: function() { return document.getElementById("fluxSizeBox") || document.getElementById("fluxFaceBox") || document.getElementById("fluxParamBox") || null; }
    });

    makeParamBox({
      boxId: "fluxRaceBox", popId: "fxpPopRace", title: "\ud83e\udddb Race & Species:",
      listFn: "raceParamsList", lsKey: "fluxRaceParams", lsPrevKey: "fluxRaceParamsPrev",
      foldKey: "fluxRaceFold", area: "Race & species",
      anchor: function() { return document.getElementById("fluxAgeRow") || document.getElementById("fluxFoldBar") || null; }
    });

    makeParamBox({
      boxId: "fluxProfessionBox", popId: "fxpPopProfession", title: "\u2692\ufe0f Profession:",
      listFn: "professionParamsList", lsKey: "fluxProfessionParams", lsPrevKey: "fluxProfessionParamsPrev",
      foldKey: "fluxProfessionFold", area: "Profession",
      anchor: function() { return document.getElementById("fluxRaceBox") || document.getElementById("fluxFoldBar") || null; }
    });

    makeParamBox({
      boxId: "fluxObjectsBox", popId: "fxpPopObjects", title: "\ud83c\udf92 Objects:",
      listFn: "objectParamsList", lsKey: "fluxObjectsParams", lsPrevKey: "fluxObjectsParamsPrev",
      foldKey: "fluxObjectsFold", area: "Objects",
      anchor: function() { return document.getElementById("fluxAccessoryBox") || document.getElementById("fluxClothesBox") || document.getElementById("fluxMannerBox") || null; }
    });

    makeParamBox({
      boxId: "fluxMaterialsBox", popId: "fxpPopMaterials", title: "\ud83e\uddf1 Materials:",
      listFn: "materialParamsList", lsKey: "fluxMaterialsParams", lsPrevKey: "fluxMaterialsParamsPrev",
      foldKey: "fluxMaterialsFold", area: "Materials",
      anchor: function() { return document.getElementById("fluxObjectsBox") || document.getElementById("fluxRaceBox") || null; }
    });

    // 👓 Eyewear flyttet Accessories→Clothes (brugerønske 2026-10-04: hører sammen med tøjet,
    // ikke som sin egen boks). Engangsmigrering af brugerens gamle Accessories-valg.
    try {
      (function() {
        function lj(k) { try { var o = JSON.parse(localStorage.getItem(k) || "null"); return (o && typeof o === "object") ? o : null; } catch(e) { return null; } }
        var as = lj("fluxAccessoriesParams"), ap = lj("fluxAccessoriesParamsPrev");
        if(!as && !ap) return;
        var cs = lj("fluxClothesParams") || {}, cp = lj("fluxClothesParamsPrev") || {}, t = false, tp = false;
        if(as) {
          if(Array.isArray(as.eyewear) && as.eyewear.length && (!Array.isArray(cs.eyewear) || !cs.eyewear.length)) { cs.eyewear = as.eyewear.slice(); t = true; }
          delete as.eyewear;
          try { localStorage.setItem("fluxAccessoriesParams", JSON.stringify(as)); } catch(e) {}
        }
        if(ap) {
          if(typeof ap.eyewear === "string" && ap.eyewear && typeof cp.eyewear !== "string") { cp.eyewear = ap.eyewear; tp = true; }
          delete ap.eyewear;
          try { localStorage.setItem("fluxAccessoriesParamsPrev", JSON.stringify(ap)); } catch(e) {}
        }
        if(t) { try { localStorage.setItem("fluxClothesParams", JSON.stringify(cs)); } catch(e) {} }
        if(tp) { try { localStorage.setItem("fluxClothesParamsPrev", JSON.stringify(cp)); } catch(e) {} }
      })();
    } catch(e) {}

    makeParamBox({
      boxId: "fluxClothesBox", popId: "fxpPopClothes", title: "\ud83d\udc55 Clothes:",
      listFn: "clothesParamsList", lsKey: "fluxClothesParams", lsPrevKey: "fluxClothesParamsPrev",
      foldKey: "fluxClothesFold", area: "Clothes",
      anchor: function() { return document.getElementById("fluxMannerBox") || document.getElementById("fluxPoseBox") || document.getElementById("fluxShapeBox") || null; }
    });

    makeParamBox({
      boxId: "fluxAccessoryBox", popId: "fxpPopAccessories", title: "\ud83e\udde2 Accessories:",
      listFn: "accessoryParamsList", lsKey: "fluxAccessoriesParams", lsPrevKey: "fluxAccessoriesParamsPrev",
      foldKey: "fluxAccessoriesFold", area: "Accessories",
      anchor: function() { return document.getElementById("fluxClothesBox") || document.getElementById("fluxMaterialsBox") || null; }
    });

    makeParamBox({
      boxId: "fluxQualityBox", popId: "fxpPopQuality", title: "\u2728 Qualities:",
      listFn: "qualityParamsList", lsKey: "fluxQualityParams", lsPrevKey: "fluxQualityParamsPrev",
      foldKey: "fluxQualityFold", area: "Qualities",
      anchor: function() { return document.getElementById("fluxNatureBox") || document.getElementById("fluxAccessoryBox") || document.getElementById("fluxClothesBox") || null; }
    });

    makeParamBox({
      boxId: "fluxPoseBox", popId: "fxpPopPose", title: "\ud83c\udfc3 Pose & Action:",
      listFn: "poseActionParamsList", lsKey: "fluxPoseParams", lsPrevKey: "fluxPoseParamsPrev",
      foldKey: "fluxPoseFold", area: "Pose & action",
      anchor: function() { return document.getElementById("fluxShapeBox") || document.getElementById("fluxSkinTagBox") || null; }
    });

    makeParamBox({
      boxId: "fluxMannerBox", popId: "fxpPopManner", title: "\u2696\ufe0f Manner & Degree:",
      listFn: "mannerParamsList", lsKey: "fluxMannerParams", lsPrevKey: "fluxMannerParamsPrev",
      foldKey: "fluxMannerFold", area: "Manner & degree",
      anchor: function() { return document.getElementById("fluxPoseBox") || document.getElementById("fluxShapeBox") || null; }
    });

    makeParamBox({
      boxId: "fluxConditionBox", popId: "fxpPopCondition", title: "\ud83e\uddea Condition:",
      listFn: "conditionParamsList", lsKey: "fluxConditionParams", lsPrevKey: "fluxConditionParamsPrev",
      foldKey: "fluxConditionFold", area: "Condition",
      anchor: function() { return document.getElementById("fluxQualityBox") || document.getElementById("fluxNatureBox") || document.getElementById("fluxMannerBox") || null; }
    });

    makeParamBox({
      boxId: "fluxSurfaceBox", popId: "fxpPopSurface", title: "\ud83e\uddfd Properties & Appearance:",
      listFn: "surfaceParamsList", lsKey: "fluxSurfaceParams", lsPrevKey: "fluxSurfaceParamsPrev",
      foldKey: "fluxSurfaceFold", area: "Properties & appearance",
      anchor: function() { return document.getElementById("fluxConditionBox") || document.getElementById("fluxMannerBox") || null; }
    });

    makeParamBox({
      boxId: "fluxColorBox", popId: "fxpPopColor", title: "🎨 Colors:",
      listFn: "colorParamsList", lsKey: "fluxColorParams", lsPrevKey: "fluxColorParamsPrev",
      foldKey: "fluxColorFold", area: "Colors",
      anchor: function() { return document.getElementById("fluxSurfaceBox") || null; }
    });

    // 👤 Anatomy-boksen er fjernet (brugerønske 2026-09-24: "ryk lige anatomically correctness op ind
    // i age boxen") — dens ene parameter (Anatomy Accuracy) er nu et dropdown i ⏳ Age-rækken.
    // Ordbunken bliver i main.pjs' `subjectParams`, og Age-rækken læser den via subjectParamsList().
  })();
  };
})();