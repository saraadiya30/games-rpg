(function () {
  "use strict";
  var LS_DATA = "t2iCS_data";
  var LS_PROMPT = "t2iCS_prompt";
  var LS_NAMES = "t2iCS_names";
  var LS_OPEN = "t2iCS_open";
  var LS_TRYOUT = "t2iCS_tryout";
  var FORGED_TAB = "Forged Styles";
  var PLACEHOLDER = "Click to toggle names/prompts";

  var tabs = [];
  var activeTabId = null;
  var selections = {};
  var tabCounter = 1;
  var pairCounter = 1;
  var showNames = false;
  var timers = {};
  var tryout = { entries: [], activeId: null, uid: 1 };

  var els = {};

  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function debounce(id, fn, ms) {
    clearTimeout(timers[id]);
    timers[id] = setTimeout(fn, ms || 600);
  }

  function activeTab() {
    for (var i = 0; i < tabs.length; i++) if (tabs[i].id === activeTabId) return tabs[i];
    return null;
  }
  function ensureTab() {
    var t = activeTab();
    if (!t && tabs.length) {
      activeTabId = tabs[0].id;
      renderTabs();
      switchTab(activeTabId);
      t = activeTab();
    }
    return t;
  }

  function pairData(id) {
    var t = activeTab();
    return t ? t.pairs[id] : null;
  }

  function save() {
    store(LS_DATA, JSON.stringify({ tabs: tabs, activeTabId: activeTabId, tabCounter: tabCounter, pairCounter: pairCounter, selections: selections }));
  }

  function load() {
    var raw = read(LS_DATA);
    if (!raw) return false;
    try {
      var d = JSON.parse(raw);
      tabs = d.tabs || [];
      activeTabId = d.activeTabId || null;
      tabCounter = d.tabCounter || 1;
      pairCounter = d.pairCounter || 1;
      selections = d.selections || {};
      return true;
    } catch (e) { return false; }
  }

  function updateShared() {
    var values = [];
    var names = [];
    var ordered = tabs.slice().sort(function (a, b) { return a.id - b.id; });
    ordered.forEach(function (tab) {
      var sel = selections[tab.id] || {};
      ["slot1", "slot2"].forEach(function (slot) {
        var s = sel[slot];
        if (s && s.value) {
          values.push(s.value);
          var p = tab.pairs[s.pairId];
          names.push(p && p.name ? p.name + " (" + tab.name + ")" : s.value);
        }
      });
    });
    var te = activeTryout();
    if (te && te.value) {
      values.push(te.value);
      names.push(te.name ? te.name + " (tryout)" : te.value);
    }
    store(LS_PROMPT, values.join("\n"));
    store(LS_NAMES, JSON.stringify(names));
    if (els.display) els.display.textContent = (showNames ? names.join("\n") : values.join("\n")) || PLACEHOLDER;
    refreshBadge(values.length);
    renderLive();
  }
  function renderLive() {
    if (!els.liveBox) return;
    if (els.headState) {
      var nm = [];
      try { nm = JSON.parse(read(LS_NAMES) || "[]"); } catch (e) { nm = []; }
      els.headState.textContent = nm.length ? ("● " + nm.join(" + ")) : "";
    }
    var box = els.liveBox;
    box.innerHTML = "";
    var items = [];
    tabs.slice().sort(function (a, b) { return a.id - b.id; }).forEach(function (tab) {
      var sel = selections[tab.id] || {};
      ["slot1", "slot2"].forEach(function (slot) {
        var s = sel[slot];
        if (s && s.value) {
          var p = tab.pairs[s.pairId];
          items.push({ label: (p && p.name ? p.name : s.value), src: tab.name, tabId: tab.id, slot: slot });
        }
      });
    });
    var te = activeTryout();
    if (te && te.value) items.push({ label: te.name || te.value, src: "tryout", tryout: true });
    if (!items.length) {
      box.className = "off";
      var d = document.createElement("div");
      d.className = "t2ics-livedim";
      d.textContent = "No custom style in use — nothing extra is added to your prompts.";
      box.appendChild(d);
      return;
    }
    box.className = "";
    var h = document.createElement("div");
    h.className = "t2ics-livehead";
    h.textContent = "✅ In use — added to every prompt:";
    box.appendChild(h);
    items.forEach(function (it) {
      var row = document.createElement("div");
      row.className = "t2ics-liverow";
      var s = document.createElement("span");
      s.textContent = it.label + " (" + it.src + ")";
      s.title = it.label;
      var x = document.createElement("button");
      x.type = "button";
      x.textContent = "✕";
      x.title = "Stop using this style";
      x.addEventListener("click", function () {
        if (it.tryout) {
          tryout.activeId = null;
          saveTryout();
          renderTryout();
        } else {
          if (selections[it.tabId] && selections[it.tabId][it.slot]) selections[it.tabId][it.slot].value = "";
          if (it.tabId === activeTabId) {
            if (it.slot === "slot1") els.slot1.value = "";
            else els.slot2.value = "";
          }
        }
        updateShared();
        save();
      });
      row.appendChild(s);
      row.appendChild(x);
      box.appendChild(row);
    });
  }

  function refreshBadge(n) {
    if (!els.badge) return;
    if (n > 0) {
      els.badge.textContent = n + " on";
      els.badge.style.display = "";
    } else {
      els.badge.style.display = "none";
    }
  }

  function renderTabs() {
    var btns = els.tabsHeader.querySelectorAll(".t2ics-tab");
    for (var i = 0; i < btns.length; i++) btns[i].remove();
    tabs.forEach(function (tab) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = tab.name;
      b.className = "t2ics-tab";
      if (tab.id === activeTabId) b.setAttribute("aria-selected", "true");
      b.addEventListener("click", function () { switchTab(tab.id); });
      els.tabsHeader.insertBefore(b, els.tabsSpacer);
    });
  }

  function createTab(name) {
    var t = { id: tabCounter++, name: name || ("Tab " + tabs.length + 1), pairs: {} };
    tabs.push(t);
    renderTabs();
    switchTab(t.id);
    save();
  }

  function switchTab(id) {
    activeTabId = id;
    renderTabs();
    els.container.innerHTML = "";
    els.slot1.innerHTML = "";
    els.slot2.innerHTML = "";
    var t = activeTab();
    if (!t) return;
    for (var pid in t.pairs) createPair(parseInt(pid, 10), t.pairs[pid], true);
    refreshSelects();
    save();
  }

  function createPair(id, initial, skipState) {
    var tab = activeTab();
    if (!tab) return;
    var wrap = document.createElement("div");
    wrap.className = "t2ics-pair";
    wrap.setAttribute("data-pair-id", id);
    var head = document.createElement("div");
    head.className = "t2ics-pair-head";
    var nameTA = document.createElement("textarea");
    nameTA.className = "t2ics-name";
    nameTA.placeholder = "Name #" + id;
    nameTA.rows = 1;
    var valTA = document.createElement("textarea");
    valTA.className = "t2ics-val";
    valTA.placeholder = "Prompt — style words appended to the image prompt when picked below";
    valTA.rows = 2;
    var del = document.createElement("button");
    del.type = "button";
    del.className = "t2ics-del";
    del.textContent = "✕";
    del.title = "Delete style";
    del.addEventListener("click", function () {
      wrap.remove();
      var tb = activeTab();
      if (tb && tb.pairs[id]) delete tb.pairs[id];
      refreshSelects();
      save();
    });
    if (initial) {
      tab.pairs[id] = { name: initial.name || "", value: initial.value || "" };
      nameTA.value = initial.name || "";
      valTA.value = initial.value || "";
    } else if (!skipState) {
      tab.pairs[id] = { name: "", value: "" };
    } else if (!tab.pairs[id]) {
      tab.pairs[id] = { name: "", value: "" };
    }
    nameTA.addEventListener("input", function () {
      debounce("n" + id, function () {
        var d = pairData(id);
        if (d) d.name = nameTA.value;
        refreshSelects();
        save();
      });
    });
    valTA.addEventListener("input", function () {
      debounce("v" + id, function () {
        var d = pairData(id);
        if (d) d.value = valTA.value;
        refreshSelects();
        save();
      });
    });
    head.appendChild(nameTA);
    head.appendChild(del);
    wrap.appendChild(head);
    wrap.appendChild(valTA);
    els.container.appendChild(wrap);
    if (!skipState) save();
  }

  function refreshSelects() {
    els.slot1.innerHTML = "";
    els.slot2.innerHTML = "";
    var blank1 = document.createElement("option");
    blank1.value = "";
    blank1.textContent = "— off —";
    els.slot1.appendChild(blank1);
    els.slot2.appendChild(blank1.cloneNode(true));
    var tab = activeTab();
    if (!tab) return;
    var kids = els.container.children;
    for (var i = 0; i < kids.length; i++) {
      var id = kids[i].getAttribute("data-pair-id");
      var d = tab.pairs[id];
      if (d && d.name && d.value) {
        [["slot1", els.slot1], ["slot2", els.slot2]].forEach(function (pair) {
          var o = document.createElement("option");
          o.text = d.name;
          o.value = d.value;
          o.setAttribute("data-id", id);
          pair[1].appendChild(o);
        });
      }
    }
    var sel = selections[activeTabId] || {};
    var s1 = sel.slot1, s2 = sel.slot2;
    els.slot1.value = (s1 && s1.value && hasOpt(els.slot1, s1.value)) ? s1.value : "";
    els.slot2.value = (s2 && s2.value && hasOpt(els.slot2, s2.value)) ? s2.value : "";
  }

  function hasOpt(sel, v) {
    for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === v) return true;
    return false;
  }

  function onSlot(e) {
    var sel = e.target;
    var slot = sel.id === "t2icsSlot1" ? "slot1" : "slot2";
    var opt = sel.options[sel.selectedIndex];
    if (!selections[activeTabId]) selections[activeTabId] = {};
    selections[activeTabId][slot] = { pairId: opt ? opt.getAttribute("data-id") : null, value: sel.value };
    updateShared();
    save();
  }

  function resetSlots() {
    els.slot1.value = "";
    els.slot2.value = "";
    for (var tid in selections) {
      if (selections[tid].slot1) selections[tid].slot1.value = "";
      if (selections[tid].slot2) selections[tid].slot2.value = "";
    }
    updateShared();
    save();
  }
  window.t2iCustomStylesReset = resetSlots;

  function saveTryout() { store(LS_TRYOUT, JSON.stringify(tryout)); }
  function loadTryout() {
    try {
      var d = JSON.parse(read(LS_TRYOUT) || "null");
      if (d && Array.isArray(d.entries)) {
        tryout = d;
        if (!tryout.uid) tryout.uid = 1;
        return;
      }
    } catch (e) {}
    tryout = { entries: [], activeId: null, uid: 1 };
  }
  function activeTryout() {
    for (var i = 0; i < tryout.entries.length; i++) if (tryout.entries[i].id === tryout.activeId) return tryout.entries[i];
    return null;
  }
  function renderTryout() {
    if (!els.tryoutList) return;
    els.tryoutList.innerHTML = "";
    if (!tryout.entries.length) {
      var e = document.createElement("div");
      e.className = "t2ics-hint";
      e.textContent = "No tryout styles yet — add one below, or pull in your Forged Styles.";
      els.tryoutList.appendChild(e);
      return;
    }
    tryout.entries.forEach(function (en) {
      var wrap = document.createElement("div");
      wrap.className = "t2ics-pair";
      var nameTA = document.createElement("textarea");
      nameTA.className = "t2ics-name";
      nameTA.placeholder = "Tryout name";
      nameTA.rows = 1;
      nameTA.value = en.name || "";
      var valTA = document.createElement("textarea");
      valTA.className = "t2ics-val";
      valTA.placeholder = "Prompt — style words appended to every image prompt while in use";
      valTA.rows = 2;
      valTA.value = en.value || "";
      nameTA.addEventListener("input", function () {
        debounce("tn" + en.id, function () { en.name = nameTA.value; saveTryout(); updateShared(); });
      });
      valTA.addEventListener("input", function () {
        debounce("tv" + en.id, function () { en.value = valTA.value; saveTryout(); updateShared(); });
      });
      var row = document.createElement("div");
      row.className = "t2ics-row";
      var use = document.createElement("button");
      use.type = "button";
      use.className = "t2ics-use";
      var on = (en.id === tryout.activeId);
      use.textContent = on ? "■ Stop" : "▶ Use";
      if (on) use.setAttribute("aria-pressed", "true");
      use.title = "Append this style to the image prompt while testing";
      use.addEventListener("click", function () {
        tryout.activeId = (tryout.activeId === en.id) ? null : en.id;
        saveTryout();
        updateShared();
        renderTryout();
      });
      var keep = document.createElement("button");
      keep.type = "button";
      keep.textContent = "💾 Save";
      keep.title = "Keep this style permanently in the current tab";
      keep.addEventListener("click", function () {
        if (!ensureTab()) createTab();
        en.name = nameTA.value;
        en.value = valTA.value;
        createPair(pairCounter++, { name: en.name, value: en.value });
        refreshSelects();
        updateShared();
        save();
      });
      var del = document.createElement("button");
      del.type = "button";
      del.className = "danger";
      del.textContent = "✕ Delete";
      del.addEventListener("click", function () {
        var ix = -1;
        for (var i = 0; i < tryout.entries.length; i++) if (tryout.entries[i].id === en.id) ix = i;
        if (ix >= 0) tryout.entries.splice(ix, 1);
        if (tryout.activeId === en.id) { tryout.activeId = null; updateShared(); }
        saveTryout();
        renderTryout();
      });
      row.appendChild(use);
      row.appendChild(keep);
      row.appendChild(del);
      wrap.appendChild(nameTA);
      wrap.appendChild(valTA);
      wrap.appendChild(row);
      els.tryoutList.appendChild(wrap);
    });
  }
  function importForged() {
    var count = 0;
    try {
      var d = JSON.parse(read(LS_DATA) || "null");
      var list = (d && d.tabs) || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].name === FORGED_TAB) {
          var pairs = list[i].pairs || {};
          for (var pid in pairs) {
            var p = pairs[pid] || {};
            if (!p.value) continue;
            var dup = false;
            for (var j = 0; j < tryout.entries.length; j++) if (tryout.entries[j].value === p.value) { dup = true; break; }
            if (!dup) {
              tryout.entries.push({ id: tryout.uid++, name: p.name || "", value: p.value });
              count++;
            }
          }
        }
      }
    } catch (e) { return 0; }
    if (count) { saveTryout(); renderTryout(); }
    return count;
  }

  function doExport() {
    try {
      var blob = new Blob([JSON.stringify(tabs, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "custom-art-styles.json";
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    } catch (e) {}
  }

  function looksLikeTabs(arr) {
    return arr.length > 0 && arr.every(function (t) { return t && typeof t === "object" && t.pairs && typeof t.pairs === "object"; });
  }
  function normalizeForgeStyles(o) {
    var arr = null;
    if (Array.isArray(o)) arr = o;
    else if (o && Array.isArray(o.styles)) arr = o.styles;
    else if (o && (o.prompt || o.value)) arr = [o];
    if (!arr) return null;
    var out = [];
    arr.forEach(function (s) {
      if (s && (s.prompt || s.value)) out.push({ name: String(s.name || "Imported Style").slice(0, 60), value: String(s.prompt || s.value) });
    });
    return out.length ? out : null;
  }
  function importStyleList(list) {
    if (!ensureTab()) createTab("My Styles");
    var added = 0;
    var tab = activeTab();
    list.forEach(function (s) {
      var dup = false;
      for (var pid in tab.pairs) if (tab.pairs[pid] && tab.pairs[pid].value === s.value) { dup = true; break; }
      if (!dup) {
        var id = pairCounter++;
        tab.pairs[id] = { name: s.name, value: s.value };
        added++;
      }
    });
    if (added) {
      renderTabs();
      switchTab(activeTabId);
      updateShared();
      save();
    }
    return added;
  }
  function flashImport(added) {
    var b = els.impBtn;
    if (!b) return;
    b.textContent = added ? ("Imported " + added) : "No new styles";
    setTimeout(function () { b.textContent = "Import"; }, 1600);
  }
  function doImport(file) {
    if (!file) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var parsed = JSON.parse(r.result);
        if (Array.isArray(parsed) && !looksLikeTabs(parsed)) {
          var list = normalizeForgeStyles(parsed);
          if (!list) throw 0;
          flashImport(importStyleList(list));
          return;
        }
        if (!Array.isArray(parsed)) {
          var single = normalizeForgeStyles(parsed);
          if (!single) throw 0;
          flashImport(importStyleList(single));
          return;
        }
        var arr = parsed;
        tabs = arr;
        selections = {};
        var mxT = 0, mxP = 0;
        tabs.forEach(function (t) {
          if (t.id > mxT) mxT = t.id;
          for (var pid in (t.pairs || {})) {
            var n = parseInt(pid, 10);
            if (n > mxP) mxP = n;
          }
          if (!t.pairs) t.pairs = {};
        });
        tabCounter = mxT + 1;
        pairCounter = mxP + 1;
        if (tabs.length) switchTab(tabs[0].id);
        else { els.container.innerHTML = ""; refreshSelects(); }
        updateShared();
        save();
      } catch (e) { alert("Invalid JSON file"); }
    };
    r.readAsText(file);
  }

  function build() {
    var anchor = document.querySelector('#i2p-imggen select[data-name="artStyle"]');
    if (!anchor) return false;
    var ctn = anchor.closest(".input-ctn") || anchor.parentNode;
    if (!ctn || !ctn.parentNode) return false;
    if (document.getElementById("t2iCustomStyles")) return true;

    var st = document.createElement("style");
    st.textContent = "#t2iCustomStyles{margin:0.55rem 0;border:1px solid var(--th-border,#ccc);border-radius:12px;overflow:hidden;background:var(--th-surface,#f2f2f2);}"
      + "#t2iCSHead{display:flex;align-items:center;gap:0.5rem;width:100%;cursor:pointer;font:inherit;font-weight:700;font-size:0.9rem;padding:0.55rem 0.8rem;border:0;background:transparent;color:inherit;text-align:left;}"
      + "#t2iCSHead:hover{background:rgba(127,127,127,0.12);}"
      + "#t2iCSBadge{font-size:0.68rem;font-weight:700;padding:0.08rem 0.5rem;border-radius:999px;background:var(--th-accent,#2b6bf0);color:var(--th-accent-text,#fff);}"
      + "#t2iCSChev{margin-left:auto;opacity:0.6;}"
      + "#t2iCSBody{padding:0.7rem 0.8rem 0.9rem;border-top:1px solid var(--th-border,#ccc);display:flex;flex-direction:column;gap:0.55rem;}"
      + ".t2ics-row{display:flex;gap:0.4rem;flex-wrap:wrap;align-items:center;}"
      + ".t2ics-row button{cursor:pointer;font:inherit;font-size:0.78rem;font-weight:600;padding:0.3rem 0.7rem;border-radius:999px;border:1px solid var(--th-border,#ccc);background:var(--th-field,#fff);color:inherit;}"
      + ".t2ics-row button:hover{border-color:var(--th-accent,#2b6bf0);}"
      + ".t2ics-row button.danger{color:#ff6b6b;}"
      + ".t2ics-tab{cursor:pointer;font:inherit;font-size:0.78rem;padding:0.3rem 0.7rem;border-radius:999px;border:1px solid var(--th-border,#ccc);background:transparent;color:inherit;}"
      + '.t2ics-tab[aria-selected="true"]{border-color:var(--th-accent,#2b6bf0);color:var(--th-accent,#2b6bf0);font-weight:700;}'
      + ".t2ics-spacer{flex:1 1 auto;}"
      + "#t2icsContainer{display:flex;flex-direction:column;gap:0.5rem;max-height:320px;overflow-y:auto;padding:0.1rem;}"
      + ".t2ics-pair{border:1px dashed var(--th-border,#999);border-radius:10px;padding:0.45rem;display:flex;flex-direction:column;gap:0.35rem;}"
      + ".t2ics-pair-head{display:flex;gap:0.35rem;align-items:stretch;}"
      + ".t2ics-name{flex:1 1 auto;font:inherit;font-size:0.82rem;padding:0.3rem 0.45rem;border-radius:8px;border:1px solid var(--th-border,#ccc);background:var(--th-field,#fff);color:inherit;resize:none;height:2rem;}"
      + ".t2ics-val{width:100%;box-sizing:border-box;font:inherit;font-size:0.82rem;padding:0.3rem 0.45rem;border-radius:8px;border:1px solid var(--th-border,#ccc);background:var(--th-field,#fff);color:inherit;resize:vertical;}"
      + ".t2ics-del{flex:none;cursor:pointer;border:0;border-radius:8px;background:rgba(255,68,68,0.35);color:inherit;font:inherit;padding:0 0.7rem;}"
      + ".t2ics-slots{display:flex;gap:0.5rem;flex-wrap:wrap;}"
      + ".t2ics-slots label{flex:1 1 180px;display:flex;flex-direction:column;gap:0.2rem;font-size:0.75rem;font-weight:600;opacity:0.9;}"
      + ".t2ics-slots select{font:inherit;font-weight:400;padding:0.35rem 0.45rem;border-radius:8px;border:1px solid var(--th-border,#ccc);background:var(--th-field,#fff);color:inherit;}"
      + "#t2icsDisplay{font-family:monospace;font-size:0.72rem;line-height:1.5;white-space:pre-wrap;word-break:break-word;border:1px solid var(--th-border,#ccc);border-radius:8px;padding:0.45rem 0.55rem;min-height:2.2em;max-height:7em;overflow-y:auto;cursor:pointer;opacity:0.85;background:rgba(127,127,127,0.08);}"
      + ".t2ics-hint{font-size:0.74rem;line-height:1.5;opacity:0.7;}"
      + "#t2iCSActive{font-size:0.72rem;font-weight:700;color:var(--th-accent,#2b6bf0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:38vw;}"
      + "#t2iCSActive:empty{display:none;}"
      + "#t2iCSLive{border:1px solid var(--th-accent,#2b6bf0);border-radius:10px;padding:0.5rem 0.6rem;display:flex;flex-direction:column;gap:0.35rem;background:rgba(43,107,240,0.07);}"
      + "#t2iCSLive.off{border-color:var(--th-border,#ccc);background:transparent;}"
      + ".t2ics-livehead{font-size:0.78rem;font-weight:700;}"
      + ".t2ics-liverow{display:flex;align-items:center;gap:0.4rem;font-size:0.78rem;}"
      + ".t2ics-liverow span{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}"
      + ".t2ics-liverow button{flex:none;cursor:pointer;font:inherit;font-size:0.72rem;font-weight:700;border-radius:999px;border:1px solid var(--th-border,#ccc);background:var(--th-field,#fff);color:inherit;padding:0.1rem 0.55rem;}"
      + ".t2ics-liverow button:hover{border-color:#ff6b6b;color:#ff6b6b;}"
      + ".t2ics-livedim{font-size:0.76rem;opacity:0.65;}";
      + "#t2iCSTryout{border-top:1px solid var(--th-border,#ccc);padding-top:0.55rem;display:flex;flex-direction:column;gap:0.5rem;}"
      + ".t2ics-trytitle{font-size:0.82rem;font-weight:700;}"
      + "#t2iCSTryList{display:flex;flex-direction:column;gap:0.5rem;}"
      + '.t2ics-use[aria-pressed="true"]{border-color:var(--th-accent,#2b6bf0);color:var(--th-accent,#2b6bf0);}';
    document.head.appendChild(st);

    var sec = document.createElement("section");
    sec.id = "t2iCustomStyles";
    var head = document.createElement("button");
    head.type = "button";
    head.id = "t2iCSHead";
    var title = document.createElement("span");
    title.textContent = "🎨 Custom Art Styles";
    var badge = document.createElement("span");
    badge.id = "t2iCSBadge";
    badge.style.display = "none";
    var hstate = document.createElement("span");
    hstate.id = "t2iCSActive";
    var chev = document.createElement("span");
    chev.id = "t2iCSChev";
    chev.textContent = "▾";
    head.appendChild(title);
    head.appendChild(badge);
    head.appendChild(hstate);
    head.appendChild(chev);
    var body = document.createElement("div");
    body.id = "t2iCSBody";

    var ctl = document.createElement("div");
    ctl.className = "t2ics-row";
    var exp = document.createElement("button");
    exp.type = "button";
    exp.textContent = "Export";
    exp.addEventListener("click", doExport);
    var imp = document.createElement("button");
    imp.type = "button";
    imp.textContent = "Import";
    var file = document.createElement("input");
    file.type = "file";
    file.accept = ".json";
    file.hidden = true;
    file.addEventListener("change", function () { doImport(file.files[0]); file.value = ""; });
    imp.addEventListener("click", function () { file.click(); });
    els.impBtn = imp;
    ctl.appendChild(exp);
    ctl.appendChild(imp);
    ctl.appendChild(file);

    var tabsHead = document.createElement("div");
    tabsHead.className = "t2ics-row";
    tabsHead.id = "t2icsTabsHead";
    var addTab = document.createElement("button");
    addTab.type = "button";
    addTab.textContent = "+ Tab";
    addTab.addEventListener("click", function () { createTab(); });
    var spacer = document.createElement("span");
    spacer.className = "t2ics-spacer";
    var renTab = document.createElement("button");
    renTab.type = "button";
    renTab.textContent = "Rename";
    renTab.title = "Rename current tab";
    renTab.addEventListener("click", function () {
      var t = activeTab();
      if (!t) return;
      var n = prompt("Enter new tab name:", t.name);
      if (n) { t.name = n; renderTabs(); updateShared(); save(); }
    });
    var delTab = document.createElement("button");
    delTab.type = "button";
    delTab.textContent = "Delete Tab";
    delTab.className = "danger";
    delTab.addEventListener("click", async function () {
      if (tabs.length <= 1) { alert("Cannot delete the last tab."); return; }
      var t = activeTab();
      if (!t || !(await window.uiConfirm('Delete tab "' + t.name + '"?', { okText: 'Delete tab', danger: true }))) return;
      var ix = -1;
      for (var i = 0; i < tabs.length; i++) if (tabs[i].id === t.id) ix = i;
      tabs.splice(ix, 1);
      if (selections[t.id]) delete selections[t.id];
      updateShared();
      switchTab(tabs[Math.max(0, ix - 1)].id);
      save();
    });
    tabsHead.appendChild(addTab);
    tabsHead.appendChild(spacer);
    tabsHead.appendChild(renTab);
    tabsHead.appendChild(delTab);

    var list = document.createElement("div");
    list.id = "t2icsContainer";

    var addStyle = document.createElement("button");
    addStyle.type = "button";
    addStyle.textContent = "＋ Add Style";
    addStyle.style.cssText = "align-self:flex-start;cursor:pointer;font:inherit;font-size:0.8rem;font-weight:700;padding:0.35rem 0.9rem;border-radius:999px;border:1px solid var(--th-border,#ccc);background:var(--th-field,#fff);color:inherit;";
    addStyle.addEventListener("click", function () {
      if (!activeTabId) createTab();
      createPair(pairCounter++, null);
    });

    var slots = document.createElement("div");
    slots.className = "t2ics-slots";
    var lab1 = document.createElement("label");
    lab1.textContent = "Style slot 1";
    var slot1 = document.createElement("select");
    slot1.id = "t2icsSlot1";
    slot1.addEventListener("change", onSlot);
    lab1.appendChild(slot1);
    var lab2 = document.createElement("label");
    lab2.textContent = "Style slot 2";
    var slot2 = document.createElement("select");
    slot2.id = "t2icsSlot2";
    slot2.addEventListener("change", onSlot);
    lab2.appendChild(slot2);
    slots.appendChild(lab1);
    slots.appendChild(lab2);

    var tryoutSec = document.createElement("div");
    tryoutSec.id = "t2iCSTryout";
    var tryHead = document.createElement("div");
    tryHead.className = "t2ics-row";
    var tryTitle = document.createElement("span");
    tryTitle.className = "t2ics-trytitle";
    tryTitle.textContent = "🧪 Style tryout — temporary";
    var trySpacer = document.createElement("span");
    trySpacer.className = "t2ics-spacer";
    var pullBtn = document.createElement("button");
    pullBtn.type = "button";
    pullBtn.textContent = "⤵ Forged Styles";
    pullBtn.title = "Copy styles from the Forged Styles tab here to test them";
    pullBtn.addEventListener("click", function () {
      var n = importForged();
      pullBtn.textContent = n ? ("⤵ Pulled " + n) : "⤵ None found";
      setTimeout(function () { pullBtn.textContent = "⤵ Forged Styles"; }, 1600);
    });
    tryHead.appendChild(tryTitle);
    tryHead.appendChild(trySpacer);
    tryHead.appendChild(pullBtn);
    var tryHint = document.createElement("div");
    tryHint.className = "t2ics-hint";
    tryHint.textContent = "Test-drive styles here before keeping them: press Use and generate — the style is appended to the prompt until you Stop it. Save keeps it in the current tab; Delete drops it.";
    var tryList = document.createElement("div");
    tryList.id = "t2iCSTryList";
    var tryAdd = document.createElement("button");
    tryAdd.type = "button";
    tryAdd.textContent = "＋ Add tryout style";
    tryAdd.style.cssText = "align-self:flex-start;cursor:pointer;font:inherit;font-size:0.8rem;font-weight:700;padding:0.35rem 0.9rem;border-radius:999px;border:1px solid var(--th-border,#ccc);background:var(--th-field,#fff);color:inherit;";
    tryAdd.addEventListener("click", function () {
      tryout.entries.push({ id: tryout.uid++, name: "", value: "" });
      saveTryout();
      renderTryout();
    });
    tryoutSec.appendChild(tryHead);
    tryoutSec.appendChild(tryHint);
    tryoutSec.appendChild(tryList);
    tryoutSec.appendChild(tryAdd);

    var live = document.createElement("div");
    live.id = "t2iCSLive";

    var display = document.createElement("div");
    display.id = "t2icsDisplay";
    display.title = "Click to toggle style names/prompts";
    display.textContent = PLACEHOLDER;
    display.addEventListener("click", function () { showNames = !showNames; updateShared(); });

    var hint = document.createElement("div");
    hint.className = "t2ics-hint";
    hint.textContent = "Write your own styles above (a name plus the prompt words), then pick up to two in the slots — they are appended to every image prompt. Import accepts this panel's backups as well as Style Forge JSON files. Styles and picks survive reloads.";

    body.appendChild(ctl);
    body.appendChild(live);
    body.appendChild(tabsHead);
    body.appendChild(list);
    body.appendChild(addStyle);
    body.appendChild(slots);
    body.appendChild(tryoutSec);
    body.appendChild(display);
    body.appendChild(hint);
    sec.appendChild(head);
    sec.appendChild(body);
    var inputsRoot = document.getElementById("userInputsCtn8462746262");
    if (inputsRoot && inputsRoot.contains(ctn) && inputsRoot.parentNode) {
      inputsRoot.parentNode.insertBefore(sec, inputsRoot.nextSibling);
    } else {
      ctn.parentNode.insertBefore(sec, ctn.nextSibling);
    }

    els = { badge: badge, chev: chev, body: body, tabsHeader: tabsHead, tabsSpacer: spacer, container: list, slot1: slot1, slot2: slot2, display: display, tryoutList: tryList, liveBox: live, headState: hstate };

    var open = read(LS_OPEN) === "1";
    function applyOpen() {
      body.hidden = !open;
      chev.textContent = open ? "▾" : "▸";
    }
    head.addEventListener("click", function () {
      open = !open;
      store(LS_OPEN, open ? "1" : "0");
      applyOpen();
    });
    applyOpen();

  function bootFromStorage() {
    loadTryout();
    if (!load()) {
      createTab("My Styles");
      createPair(pairCounter++, null);
      updateShared();
    } else {
      if (!tabs.length) {
        createTab("My Styles");
        createPair(pairCounter++, null);
      } else {
        if (!activeTabId && tabs.length) activeTabId = tabs[0].id;
        renderTabs();
        switchTab(activeTabId);
        ensureTab();
      }
      updateShared();
    }
    renderTryout();
  }
  window.__t2iCustomStylesRefresh = function () {
    if (!els.container) return false;
    els.container.innerHTML = "";
    bootFromStorage();
    return true;
  };
    bootFromStorage();
    return true;
  }

  var tries = 0;
  (function boot() {
    try { if (build()) return; } catch (e) {}
    if (++tries < 120) setTimeout(boot, 500);
  })();
})();
