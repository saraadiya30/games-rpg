/* ===== Classic AI Chat skin (tampilan ala chat lama, otak = ChatEngine) ======
   BUILD NOTE: file ini adalah SUMBER. Hasil akhirnya src/aichat-classic.js
   yang dibangkitkan via execute_js: placeholder __BBCSS__ diganti isi
   scratch/bbchat-theme.css (CSS statis chat lama) sebagai string. Alur:
   edit file -src ini → jalankan rebuild (lihat src/README atau CURRENT_TASK)
   → page_refresh → verify. Jangan edit hasil build langsung.
   =========================================================================== */
(function () {
  "use strict";
  if (window.__classicLoading) return;
  window.__classicLoading = true;

  function E() { return window.ChatEngine || null; }
  var BB_STATIC_CSS = /*__BBCSS__*/ "";

  var LS_LANG = "t2iRoleplayLang";
  var STR = {
    id: {
      newThread: "＋ Thread baru", searchThreads: "Cari percakapan…", chars: "Karakter",
      searchChars: "Cari karakter…", noThreads: "Belum ada percakapan.",
      noChars: "Belum ada karakter — buat di 🧑 Persona Generator, atau kilat di bawah.",
      tapToChat: "Ketuk untuk ngobrol", qName: "Nama", qTraits: "Sifat/ciri",
      qGo: "✨ Mulai", back: "‹ Kembali", typeHere: "Tulis pesan… (Enter kirim)",
      send: "➤", stop: "■", regen: "↻ Ulangi", delThread: "Hapus thread ini?",
      deleted: "🗑 Thread dihapus", needText: "Tulis pesan dulu",
      aiNotReady: "⚠️ AI belum siap", aiEmpty: "⚠️ AI tidak menjawab — coba lagi",
      aiFail: "⚠️ Gagal menghubungi AI", thinking: "lagi mikir…",
      memTitle: "🧠 Ingatan", memEmpty: "Belum ada ingatan — ngobrol dulu, atau tambah manual di bawah.",
      memPh: "Tambah ingatan… mis. Ulang tahunnya 17 Agustus", memAdd: "＋ Ingat", memClose: "Tutup",
      stageDevoted: "Loyal", stageWarm: "Dekat", stageNeutral: "Netral", stageCold: "Dingin", stageHostile: "Musuh"
    },
    en: {
      newThread: "＋ New thread", searchThreads: "Search threads…", chars: "Characters",
      searchChars: "Search characters…", noThreads: "No threads yet.",
      noChars: "No characters yet — build in 🧑 Persona Generator, or quick-create below.",
      tapToChat: "Tap to chat", qName: "Name", qTraits: "Traits",
      qGo: "✨ Start", back: "‹ Back", typeHere: "Write a message… (Enter sends)",
      send: "➤", stop: "■", regen: "↻ Regenerate", delThread: "Delete this thread?",
      deleted: "🗑 Thread deleted", needText: "Write a message first",
      aiNotReady: "⚠️ AI not ready", aiEmpty: "⚠️ The AI returned nothing — try again",
      aiFail: "⚠️ Could not reach the AI", thinking: "thinking…",
      memTitle: "🧠 Memories", memEmpty: "No memories yet — chat first, or add one manually below.",
      memPh: "Add a memory… e.g. Her birthday is Aug 17", memAdd: "＋ Save", memClose: "Close",
      stageDevoted: "Loyal", stageWarm: "Close", stageNeutral: "Neutral", stageCold: "Cold", stageHostile: "Hostile"
    }
  };
  function lang() {
    try { var v = localStorage.getItem(LS_LANG); if (v === "en" || v === "id") return v; } catch (e) {}
    return "en";
  }
  function T(k) { return (STR[lang()] || STR.en)[k] || STR.en[k] || k; }
  function stageShort(a) {
    var e = E(); var s = e ? e.stageOf(a) : "neutral";
    return s === "devoted" ? T("stageDevoted") : s === "warm" ? T("stageWarm") :
      s === "neutral" ? T("stageNeutral") : s === "cold" ? T("stageCold") : T("stageHostile");
  }

  var THEME = [
    ":host{display:block;height:100%;}",
    "#c-root [hidden]{display:none !important;}",
    "#c-root{display:flex;gap:.6rem;height:100%;min-height:420px;font-family:inherit;text-align:left;}",
    "#c-left{width:290px;flex:none;display:flex;flex-direction:column;gap:.45rem;border:1px solid var(--th-border);border-radius:14px;background:var(--th-surface);padding:.6rem;min-height:0;}",
    ".c-toprow{display:flex;gap:.4rem;}",
    ".c-toprow button{cursor:pointer;border-radius:9px;border:1px solid var(--th-accent);background:var(--th-accent);color:var(--th-accent-text);font-weight:700;padding:.4rem .6rem;font-size:.82rem;}",
    ".c-toprow button.ghost{background:transparent;color:inherit;border-color:var(--th-border);font-weight:400;}",
    ".c-toprow input{flex:1;min-width:0;border-radius:9px;border:1px solid var(--th-border);background:var(--th-field);color:inherit;padding:.4rem .55rem;font-size:.82rem;}",
    "#c-threads{flex:1;min-height:80px;overflow-y:auto;display:flex;flex-direction:column;gap:.35rem;}",
    ".c-thread{cursor:pointer;display:flex;gap:.5rem;align-items:center;border:1px solid var(--th-border);border-radius:10px;padding:.4rem .5rem;background:var(--th-field);}",
    ".c-thread.on{border-color:var(--th-accent);}",
    ".c-thread img,.c-thread .c-avfb{width:38px;height:38px;border-radius:9px;object-fit:cover;flex:none;}",
    ".c-thread .c-avfb{display:flex;align-items:center;justify-content:center;font-weight:800;background:var(--th-accent);color:var(--th-accent-text);}",
    ".c-thread .c-tinfo{flex:1;min-width:0;}",
    ".c-thread .c-tname{font-weight:700;font-size:.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".c-thread .c-tsnip{font-size:.72rem;opacity:.65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".c-thread .c-dot{width:9px;height:9px;border-radius:99px;flex:none;}",
    ".c-thread .c-tx{cursor:pointer;border:none;background:transparent;color:inherit;opacity:.55;font-size:.85rem;}",
    ".c-sect{font-size:.78rem;font-weight:800;opacity:.85;margin-top:.2rem;}",
    "#c-main{flex:1;min-width:0;display:flex;flex-direction:column;border:1px solid var(--th-border);border-radius:14px;background:var(--th-surface);padding:.6rem;min-height:0;}",
    "#c-select{overflow-y:auto;display:flex;flex-direction:column;gap:.45rem;}",
    "#c-select h3{margin:.1rem 0;font-size:1rem;}",
    "#c-csearch{border-radius:9px;border:1px solid var(--th-border);background:var(--th-field);color:inherit;padding:.45rem .6rem;font-size:.84rem;}",
    ".c-char{display:flex;gap:.55rem;align-items:center;border:1px solid var(--th-border);border-radius:10px;padding:.45rem .55rem;background:var(--th-field);}",
    ".c-char img,.c-char .c-avfb{width:44px;height:44px;border-radius:10px;object-fit:cover;flex:none;}",
    ".c-char .c-avfb{display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.1rem;background:var(--th-accent);color:var(--th-accent-text);}",
    ".c-char .c-cinfo{flex:1;min-width:0;}",
    ".c-char .c-cname{font-weight:700;font-size:.86rem;}",
    ".c-char .c-cdesc{font-size:.74rem;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".c-char button{cursor:pointer;flex:none;border-radius:999px;border:1px solid var(--th-accent);background:var(--th-accent);color:var(--th-accent-text);padding:.3rem .7rem;font-size:.76rem;}",
    ".c-quick{border-top:1px solid var(--th-border);padding-top:.5rem;display:flex;gap:.4rem;flex-wrap:wrap;}",
    ".c-quick input{flex:1;min-width:120px;border-radius:9px;border:1px solid var(--th-border);background:var(--th-field);color:inherit;padding:.4rem .55rem;font-size:.8rem;}",
    ".c-quick button{cursor:pointer;border-radius:9px;border:1px solid var(--th-accent);background:var(--th-accent);color:var(--th-accent-text);padding:.4rem .8rem;font-size:.8rem;font-weight:700;}",
    "#c-chat{display:flex;flex-direction:column;min-height:0;flex:1;}",
    "#c-head{display:flex;gap:.55rem;align-items:center;border:1px solid var(--th-border);border-radius:12px;background:var(--th-field);padding:.5rem .6rem;margin-bottom:.5rem;}",
    "#c-head img,#c-head .c-avfb{width:40px;height:40px;border-radius:10px;object-fit:cover;flex:none;}",
    "#c-head .c-avfb{display:flex;align-items:center;justify-content:center;font-weight:800;background:var(--th-accent);color:var(--th-accent-text);}",
    "#c-head .c-hinfo{flex:1;min-width:0;}",
    "#c-head .c-hname{font-weight:700;font-size:.9rem;}",
    "#c-head .c-hstage{font-size:.74rem;opacity:.8;}",
    "#c-head button{cursor:pointer;border-radius:999px;border:1px solid var(--th-border);background:transparent;color:inherit;font-size:.76rem;padding:.28rem .6rem;white-space:nowrap;}",
    "#c-feed{flex:1;min-height:120px;overflow-y:auto;display:flex;flex-direction:column;gap:.5rem;padding:.2rem .1rem;}",
    ".c-row{display:flex;gap:.45rem;align-items:flex-end;max-width:96%;}",
    ".c-row.me{align-self:flex-end;flex-direction:row-reverse;}",
    ".c-row.them{align-self:flex-start;}",
    ".c-av{width:32px;height:32px;border-radius:8px;object-fit:cover;flex:none;font-size:.8rem;}",
    "span.c-av{display:flex;align-items:center;justify-content:center;font-weight:800;background:var(--th-accent);color:var(--th-accent-text);}",
    ".c-bub{padding:.55rem .7rem;font-size:.86rem;line-height:1.55;border-radius:14px;word-break:break-word;display:flex;flex-direction:column;gap:.42rem;}",
    ".c-row.me .c-bub{background:var(--th-accent);color:var(--th-accent-text);border-radius:14px 14px 4px 14px;}",
    ".c-row.them .c-bub{background:var(--th-field);border:1px solid var(--th-border);border-radius:14px 14px 14px 4px;}",
    ".c-sys{align-self:center;font-size:.72rem;opacity:.6;background:rgba(128,128,128,.15);border-radius:999px;padding:.2rem .7rem;}",
    ".c-typing{opacity:.7;}",
    ".c-typing::after{content:'…';animation:cBlink 1s infinite;}",
    "@keyframes cBlink{50%{opacity:0;}}",
    "#c-inputrow{display:flex;gap:.45rem;align-items:flex-end;margin-top:.5rem;}",
    "#c-input{flex:1;min-height:2.6rem;max-height:8rem;resize:vertical;border-radius:10px;border:1px solid var(--th-border);background:var(--th-field);color:inherit;padding:.5rem .6rem;font-size:.86rem;line-height:1.45;font-family:inherit;}",
    "#c-send,#c-stop{cursor:pointer;border:none;border-radius:10px;background:var(--th-accent);color:var(--th-accent-text);font-weight:700;font-size:.95rem;padding:.6rem 1rem;min-height:2.6rem;}",
    "#c-send:disabled{opacity:.55;}",
    ".c-say{display:block;font-weight:700;font-size:.9rem;line-height:1.5;background:rgba(127,127,127,.16);border-left:3px solid var(--th-accent);border-radius:0 10px 10px 0;padding:.45rem .6rem;}",
    ".c-say::before{content:'\\201C';opacity:.5;margin-right:.3rem;}",
    ".c-row.me .c-say{background:rgba(255,255,255,.20);border-left-color:rgba(255,255,255,.9);}",
    ".c-act{display:block;font-style:italic;font-size:.79rem;line-height:1.5;background:rgba(127,127,127,.11);border-left:3px solid rgba(127,127,127,.5);border-radius:0 9px 9px 0;padding:.35rem .55rem;opacity:.95;}",
    ".c-row.me .c-act{background:rgba(255,255,255,.12);border-left-color:rgba(255,255,255,.6);}",
    ".c-nar{display:block;font-size:.84rem;line-height:1.55;opacity:.93;}",
    ".c-seg:empty{display:none;}",
    ".c-empty{opacity:.6;text-align:center;font-size:.84rem;padding:1rem;}",
    "@media (max-width:860px){#c-root{flex-direction:column;}#c-left{width:auto;max-height:38%;}#c-left.hide{display:none;}}"
  ].join("\n");

  /* ---------- tiny presentational helpers (string ops only) ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  var NL = String.fromCharCode(10);
  function boldify(h) {
    var p = String(h).split("**"), out = "";
    for (var i = 0; i < p.length; i++) out += (i % 2 === 1 ? "<strong>" + p[i] + "</strong>" : p[i]);
    return out;
  }
  function fmtRich(text) {
    var s = esc(text);
    s = s.split("“").join('"').split("”").join('"').split("«").join('"').split("»").join('"');
    var segs = s.split('"'), out = "";
    for (var i = 0; i < segs.length; i++) {
      if (i % 2 === 1) {
        var d = segs[i].trim();
        if (d) out += '<div class="c-seg c-say">' + boldify(d) + "</div>";
        continue;
      }
      var acts = segs[i].split("*"), j;
      for (j = 0; j < acts.length; j++) {
        if (j % 2 === 1) {
          var a = acts[j].trim();
          if (a) out += '<div class="c-seg c-act">' + boldify(a) + "</div>";
          continue;
        }
        if (!acts[j] || !acts[j].trim()) continue;
        var seg = boldify(acts[j].trim()).split(NL).join("<br>");
        out += '<div class="c-seg c-nar">' + seg + "</div>";
      }
    }
    return out;
  }
  function avHtml(t, cls) {
    var a = String((t && (t.avatar || t.thumb)) || "");
    if (/^(https?:|data:image)/i.test(a) && a.length < 200000) {
      return '<img class="' + cls + '" src="' + a.replace(/"/g, "") + '" alt="">';
    }
    var ch = String((t && t.name) || "?").trim().charAt(0).toUpperCase() || "?";
    return '<span class="' + cls + ' c-avfbx">' + esc(ch) + "</span>";
  }
  function charAvHtml(p) {
    var a = String((p && (p.thumb || p.avatar)) || "");
    if (/^(https?:|data:image)/i.test(a) && a.length < 200000) {
      return '<img src="' + a.replace(/"/g, "") + '" alt="">';
    }
    return "<span class=\"c-avfb\">" + esc(String(p.name || "?").trim().charAt(0).toUpperCase() || "?") + "</span>";
  }
  function toast(msg) {
    try { if (typeof window.vaultToast === "function") { window.vaultToast(msg); return; } } catch (e) {}
    try {
      var t = document.createElement("div");
      t.textContent = msg;
      t.setAttribute("style", "position:fixed;left:50%;bottom:22px;z-index:96000;background:#222;color:#fff;border-radius:999px;padding:.5rem 1rem;font-size:.85rem;");
      document.body.appendChild(t);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 1800);
    } catch (e) {}
  }

  /* ---------- shell ---------- */
  var hostEl = null, shadow = null, busy = false, view = "chat", subscribed = false;
  function $(id) { return shadow ? shadow.getElementById(id) : null; }
  function dotColor(a) {
    return a >= 60 ? "#22c55e" : a >= 20 ? "#84cc16" : a > -20 ? "#9ca3af" : a > -60 ? "#f59e0b" : "#ef4444";
  }
  function lastSnip(t) {
    for (var i = t.messages.length - 1; i >= 0; i--) {
      var m = t.messages[i].replace(/^[^\n:]{1,60}:\s*/, "");
      if (m.trim()) return m.slice(0, 80);
    }
    return t.summary ? t.summary.slice(0, 80) : "…";
  }

  function buildShell() {
    hostEl = document.getElementById("classic-host");
    if (!hostEl || shadow) return;
    shadow = hostEl.attachShadow({ mode: "open" });
    var st = document.createElement("style");
    st.textContent = BB_STATIC_CSS + "\n\n/* classic theme */\n" + THEME;
    shadow.appendChild(st);
    var root = document.createElement("div");
    root.id = "c-root";
    root.innerHTML =
      '<div id="c-left">' +
        '<div class="c-toprow"><button id="c-new" type="button"></button><input id="c-tsearch" type="text"><button id="c-close" type="button" class="ghost">✕</button></div>' +
        '<div id="c-threads"></div>' +
      "</div>" +
      '<div id="c-main">' +
        '<div id="c-select">' +
          "<h3>🧬 Characters</h3>" +
          '<input id="c-csearch" type="text">' +
          '<div id="c-chargrid"></div>' +
          '<div class="c-quick"><input id="c-qname" type="text" maxlength="60"><input id="c-qtraits" type="text"><button id="c-qgo" type="button"></button></div>' +
        "</div>" +
        '<div id="c-chat" hidden>' +
          '<div id="c-head"><button id="c-back" type="button">‹</button><span id="c-hav"></span>' +
          '<div class="c-hinfo"><div class="c-hname" id="c-hname"></div><div class="c-hstage" id="c-hstage"></div></div>' +
          '<button id="c-mem" type="button" title="">🧠</button><button id="c-regen" type="button">↻</button><button id="c-del" type="button">🗑</button></div>' +
          '<div id="c-feed"></div>' +
          '<div id="c-inputrow"><textarea id="c-input" rows="2"></textarea><button id="c-send" type="button">➤</button><button id="c-stop" type="button" hidden>■</button></div>' +
        "</div>" +
      "</div>";
    shadow.appendChild(root);
    $("c-new").textContent = T("newThread");
    $("c-tsearch").placeholder = T("searchThreads");
    $("c-csearch").placeholder = T("searchChars");
    $("c-qname").placeholder = T("qName");
    $("c-qtraits").placeholder = T("qTraits");
    $("c-qgo").textContent = T("qGo");
    $("c-input").placeholder = T("typeHere");
    $("c-new").addEventListener("click", function () { view = "select"; paint(); });
    $("c-close").addEventListener("click", function () { var l = $("c-left"); if (l) l.classList.add("hide"); });
    $("c-tsearch").addEventListener("input", paintThreads);
    $("c-csearch").addEventListener("input", paintChars);
    $("c-qgo").addEventListener("click", quickStart);
    $("c-back").addEventListener("click", function () { view = "select"; paint(); });
    $("c-send").addEventListener("click", doSend);
    $("c-stop").addEventListener("click", stopGen);
    $("c-regen").addEventListener("click", regen);
    $("c-del").addEventListener("click", delThread);
    $("c-mem").addEventListener("click", function () {
      openMemPopup();
    });
    $("c-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); }
    });
  }

  function paintThreads() {
    var eng = E(); var box = $("c-threads"); if (!eng || !box) return;
    var q = "";
    try { q = ($("c-tsearch").value || "").toLowerCase(); } catch (e) {}
    box.innerHTML = "";
    var list = eng.threads.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    if (q) list = list.filter(function (t) { return (t.name + " " + lastSnip(t)).toLowerCase().indexOf(q) >= 0; });
    if (!list.length) {
      var e = document.createElement("div");
      e.className = "c-empty"; e.textContent = T("noThreads");
      box.appendChild(e); return;
    }
    list.forEach(function (t) {
      var d = document.createElement("div");
      d.className = "c-thread" + (t.id === eng.activeId ? " on" : "");
      var dot = document.createElement("span");
      dot.className = "c-dot";
      dot.style.background = dotColor(t.affinity);
      dot.title = stageShort(t.affinity) + " (" + (t.affinity > 0 ? "+" : "") + t.affinity + ")";
      var info = document.createElement("div");
      info.className = "c-tinfo";
      var nm = document.createElement("div");
      nm.className = "c-tname"; nm.textContent = t.name;
      var sn = document.createElement("div");
      sn.className = "c-tsnip"; sn.textContent = lastSnip(t);
      info.appendChild(nm); info.appendChild(sn);
      var x = document.createElement("button");
      x.type = "button"; x.className = "c-tx"; x.textContent = "✕";
      x.addEventListener("click", function (ev) {
        ev.stopPropagation();
        delThreadById(t.id);
      });
      var av = document.createElement("span");
      av.innerHTML = avHtml(t, "");
      d.appendChild(av.firstChild);
      d.appendChild(info); d.appendChild(dot); d.appendChild(x);
      d.addEventListener("click", function () {
        if (busy || E().sending(t.id)) return;
        eng.setActive(t.id); view = "chat"; paint();
      });
      box.appendChild(d);
    });
  }

  function paintChars() {
    var eng = E(); var grid = $("c-chargrid"); if (!eng || !grid) return;
    var q = "";
    try { q = ($("c-csearch").value || "").toLowerCase(); } catch (e) {}
    grid.innerHTML = '<div class="c-empty">⏳…</div>';
    eng.loadPersonas().then(function (list) {
      if (!grid.isConnected) return;
      grid.innerHTML = "";
      var fl = list;
      if (q) fl = fl.filter(function (p) { return ((p.name || "") + " " + (p.description || "")).toLowerCase().indexOf(q) >= 0; });
      if (!fl.length) {
        var e = document.createElement("div");
        e.className = "c-empty"; e.textContent = T("noChars");
        grid.appendChild(e); return;
      }
      fl.slice(0, 120).forEach(function (p) {
        var row = document.createElement("div");
        row.className = "c-char";
        var av = document.createElement("span");
        av.innerHTML = charAvHtml(p);
        row.appendChild(av.firstChild);
        var info = document.createElement("div");
        info.className = "c-cinfo";
        var nm = document.createElement("div");
        nm.className = "c-cname"; nm.textContent = p.name || "Untitled";
        var ds = document.createElement("div");
        ds.className = "c-cdesc"; ds.textContent = String(p.description || "").split("\n")[0].slice(0, 120);
        info.appendChild(nm); info.appendChild(ds);
        row.appendChild(info);
        var go = document.createElement("button");
        go.type = "button"; go.textContent = "▸";
        go.title = T("tapToChat");
        go.addEventListener("click", function () {
          var bond0 = "";
          try {
            var m = String(p.description || "").match(/#+\s*relationship with \{\{user\}\}[^\n]*\n+([\s\S]*?)(?=\n#|$)/i);
            if (m) bond0 = m[1].trim().slice(0, 500);
          } catch (e) {}
          eng.makeThread(p.name || "Character", p.description || "", String(p.thumb || p.avatar || ""), bond0);
          view = "chat"; paint();
        });
        row.appendChild(go);
        grid.appendChild(row);
      });
    });
  }
  function quickStart() {
    var eng = E(); if (!eng || busy) return;
    var name = "", traits = "";
    try { name = $("c-qname").value || ""; traits = $("c-qtraits").value || ""; } catch (e) {}
    if (!name.trim() && !traits.trim()) return;
    var desc = "# " + (name.trim() || "Character") + "\n" + (traits.trim() ? traits.trim() + "\n" : "") +
      "\n# Relationship with {{user}}:\nYou just met {{user}} — polite but guarded, no trust yet.";
    eng.makeThread(name.trim() || "Character", desc, "", "");
    try { $("c-qname").value = ""; $("c-qtraits").value = ""; } catch (e2) {}
    view = "chat"; paint();
  }

  function paintHead() {
    var eng = E(); if (!eng) return;
    var t = eng.activeThread();
    if (!t) return;
    $("c-hav").innerHTML = avHtml(t, "c-av");
    $("c-hname").textContent = t.name;
    $("c-hstage").textContent = "● " + stageShort(t.affinity) + " · " + (t.affinity > 0 ? "+" : "") + t.affinity;
    var n = Array.isArray(t.mems) ? t.mems.length : 0;
    $("c-mem").textContent = "🧠" + (n ? " " + n : "");
  }

  function paintFeed() {
    var eng = E(); var feed = $("c-feed"); if (!eng || !feed) return;
    var t = eng.activeThread();
    feed.innerHTML = "";
    if (!t) return;
    if (t.summary) {
      var s = document.createElement("div");
      s.className = "c-sys"; s.textContent = "…";
      feed.appendChild(s);
    }
    for (var i = 0; i < t.messages.length; i++) {
      var line = t.messages[i];
      if (line.indexOf("User: ") === 0) {
        feed.appendChild(userRow(line.slice(6)));
      } else {
        feed.appendChild(charRow(t, line.replace(/^[^\n:]{1,60}:\s*/, "")));
      }
    }
    feed.scrollTop = feed.scrollHeight;
  }
  function userRow(text) {
    var r = document.createElement("div");
    r.className = "c-row me";
    var b = document.createElement("div");
    b.className = "c-bub";
    b.innerHTML = fmtRich(text) || esc(text);
    r.appendChild(b);
    return r;
  }
  function charRow(t, body) {
    var r = document.createElement("div");
    r.className = "c-row them";
    var av = document.createElement("span");
    av.innerHTML = avHtml(t, "c-av");
    r.appendChild(av.firstChild);
    var b = document.createElement("div");
    b.className = "c-bub";
    b.innerHTML = fmtRich(body) || esc(body);
    r.appendChild(b);
    return r;
  }

  function paint() {
    var eng = E(); if (!eng || !shadow) return;
    var t = eng.activeThread();
    if (!t) view = "select";
    $("c-select").hidden = view !== "select";
    $("c-chat").hidden = view !== "chat";
    var l = $("c-left");
    if (l && window.innerWidth > 860) l.classList.remove("hide");
    if (view === "select") paintChars();
    else { paintHead(); paintFeed(); }
    paintThreads();
    var inp = $("c-input");
    if (inp) { inp.disabled = !t; }
    var snd = $("c-send");
    if (snd) snd.disabled = !t || busy;
  }

  async function doSend() {
    var eng = E(); if (!eng) return;
    var t = eng.activeThread();
    if (!t || busy) return;
    var v = "";
    try { v = $("c-input").value || ""; $("c-input").value = ""; } catch (e) {}
    v = String(v).trim();
    if (!v) { toast(T("needText")); return; }
    busy = true; paint();
    try { $("c-stop").hidden = false; } catch (e) {}
    var tp = null;
    try {
      var feed = $("c-feed");
      tp = document.createElement("div");
      tp.className = "c-row them";
      tp.innerHTML = '<span class="c-av c-avfbx">?</span><div class="c-bub c-typing">' + esc(t.name + " " + T("thinking")) + "</div>";
      var avs = tp.querySelector(".c-av");
      if (avs) { var tmp = document.createElement("span"); tmp.innerHTML = avHtml(t, "c-av"); avs.replaceWith(tmp.firstChild); }
      if (feed) { feed.appendChild(tp); feed.scrollTop = feed.scrollHeight; }
      var res = await eng.send(t.id, v, {
        onChunk: function (full) {
          try {
            var b = tp && tp.querySelector(".c-bub");
            if (b) { b.innerHTML = fmtRich(eng.stripBondTag(full)); feed.scrollTop = feed.scrollHeight; }
          } catch (e2) {}
        }
      });
      if (tp && tp.parentNode) tp.parentNode.removeChild(tp);
      tp = null;
      if (!res || !res.reply) {
        var s = document.createElement("div");
        s.className = "c-sys"; s.textContent = T("aiEmpty");
        if (feed) feed.appendChild(s);
      }
      paint();
    } catch (err) {
      try { if (tp && tp.parentNode) tp.parentNode.removeChild(tp); } catch (e2) {}
      var code = String((err && err.message) || "");
      var feed2 = $("c-feed");
      if (feed2) {
        var d = document.createElement("div");
        d.className = "c-sys";
        d.textContent = code === "AI_NOT_READY" ? T("aiNotReady") : code === "AI_EMPTY" ? T("aiEmpty") : T("aiFail");
        feed2.appendChild(d);
      }
    }
    busy = false;
    try { $("c-stop").hidden = true; } catch (e) {}
    paint();
  }
  function stopGen() {
    var eng = E();
    if (eng && eng.activeThread()) { try { eng.stop(eng.activeThread().id); } catch (e) {} }
    busy = false;
    try { $("c-stop").hidden = true; } catch (e2) {}
    paintFeed();
    paint();
  }
  function regen() {
    var eng = E(); if (!eng) return;
    var t = eng.activeThread();
    if (!t || busy) return;
    for (var i = t.messages.length - 1; i >= 0; i--) {
      if (t.messages[i].indexOf("User: ") !== 0) t.messages.splice(i, 1);
      else break;
    }
    eng.saveThreads();
    paintFeed();
    regenSend(t);
  }
  async function regenSend(t) {
    var eng = E();
    busy = true; paint();
    try { $("c-stop").hidden = false; } catch (e) {}
    try {
      var res = await eng.send(t.id, "", {
        regen: true,
        onChunk: function () {}
      });
      if (!res || !res.reply) {
        var feed = $("c-feed");
        if (feed) {
          var s = document.createElement("div");
          s.className = "c-sys"; s.textContent = T("aiEmpty");
          feed.appendChild(s);
        }
      }
    } catch (err) {
      var feed2 = $("c-feed");
      if (feed2) {
        var d = document.createElement("div");
        d.className = "c-sys"; d.textContent = T("aiFail");
        feed2.appendChild(d);
      }
    }
    busy = false;
    try { $("c-stop").hidden = true; } catch (e2) {}
    paint();
  }
  function delThread() {
    var eng = E(); if (!eng) return;
    var t = eng.activeThread();
    if (!t || busy) return;
    var doIt = function () {
      eng.deleteThread(t.id);
      view = "select";
      toast(T("deleted"));
      paint();
    };
    try {
      if (typeof window.uiConfirm === "function") {
        window.uiConfirm(T("delThread"), { okText: "🗑", danger: true }).then(function (ok) { if (ok) doIt(); });
        return;
      }
    } catch (e) {}
    try { if (window.confirm(T("delThread"))) doIt(); return; } catch (e2) {}
    doIt();
  }
  function delThreadById(id) {
    var eng = E(); if (!eng || busy) return;
    eng.deleteThread(id);
    if (eng.activeThread() && view === "chat") { /* stay */ } else view = "select";
    toast(T("deleted"));
    paint();
  }

  function openMemPopup() {
    var eng = E(); if (!eng) return;
    var t = eng.activeThread();
    if (!t) return;
    closeMemPopup();
    var ov = document.createElement("div");
    ov.id = "c-memov";
    ov.setAttribute("style", "position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);padding:1rem;");
    var box = document.createElement("div");
    box.setAttribute("style", "width:min(430px,100%);max-height:88%;overflow-y:auto;background:var(--th-surface);border:1px solid var(--th-border);border-radius:14px;padding:.8rem;");
    var h = document.createElement("div");
    h.setAttribute("style", "display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;");
    var ht = document.createElement("div");
    ht.setAttribute("style", "font-weight:800;flex:1;min-width:0;");
    ht.textContent = T("memTitle") + " · " + t.name;
    var x = document.createElement("button");
    x.type = "button"; x.textContent = "✕"; x.title = T("memClose");
    x.setAttribute("style", "cursor:pointer;border:1px solid var(--th-border);background:transparent;color:inherit;border-radius:8px;padding:.15rem .5rem;");
    x.addEventListener("click", closeMemPopup);
    h.appendChild(ht); h.appendChild(x);
    box.appendChild(h);
    var n = Array.isArray(t.mems) ? t.mems.length : 0;
    if (!n) {
      var e0 = document.createElement("div");
      e0.setAttribute("style", "font-size:.82rem;opacity:.7;margin-bottom:.5rem;");
      e0.textContent = T("memEmpty");
      box.appendChild(e0);
    }
    var sorted = (t.mems || []).slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    sorted.forEach(function (m) {
      var r = document.createElement("div");
      r.setAttribute("style", "display:flex;gap:.5rem;align-items:flex-start;border:1px solid var(--th-border);border-radius:9px;padding:.4rem .5rem;margin-bottom:.35rem;font-size:.82rem;background:var(--th-field);");
      var s = document.createElement("span");
      s.setAttribute("style", "flex:1;min-width:0;");
      s.textContent = m.text;
      var d = document.createElement("button");
      d.type = "button"; d.textContent = "✕"; d.title = T("memClose");
      d.setAttribute("style", "cursor:pointer;border:none;background:transparent;color:inherit;opacity:.6;");
      d.addEventListener("click", function () {
        eng.deleteMem(t, m.id);
        openMemPopup();
        paintHead();
      });
      r.appendChild(s); r.appendChild(d);
      box.appendChild(r);
    });
    var add = document.createElement("div");
    add.setAttribute("style", "display:flex;gap:.4rem;margin-top:.5rem;");
    var inp = document.createElement("input");
    inp.maxLength = 500;
    inp.placeholder = T("memPh");
    inp.setAttribute("style", "flex:1;min-width:0;border-radius:9px;border:1px solid var(--th-border);background:var(--th-field);color:inherit;padding:.45rem .6rem;font-size:.84rem;");
    var go = document.createElement("button");
    go.type = "button"; go.textContent = T("memAdd");
    go.setAttribute("style", "cursor:pointer;border-radius:9px;border:1px solid var(--th-accent);background:var(--th-accent);color:var(--th-accent-text);font-weight:700;padding:.45rem .7rem;font-size:.84rem;white-space:nowrap;");
    function doAdd() {
      var v = "";
      try { v = inp.value || ""; } catch (e) {}
      if (v.trim().length < 10) return;
      if (eng.addMem(t, v, null)) { openMemPopup(); paintHead(); }
    }
    inp.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); doAdd(); } });
    go.addEventListener("click", doAdd);
    add.appendChild(inp); add.appendChild(go);
    box.appendChild(add);
    ov.appendChild(box);
    ov.addEventListener("click", function (ev) { if (ev.target === ov) closeMemPopup(); });
    var root = shadow.getElementById("c-root");
    if (root) { root.style.position = "relative"; root.appendChild(ov); try { inp.focus(); } catch (e) {} }
  }
  function closeMemPopup() {
    try { var o = shadow.getElementById("c-memov"); if (o && o.parentNode) o.parentNode.removeChild(o); } catch (e) {}
  }

  function ensureSub() {
    var eng = E();
    if (eng && !subscribed) {
      subscribed = true;
      eng.onChange(function () { if (shadow && shadow.getElementById("c-root")) paint(); });
    }
  }

  window.__classicOnShow = function () {
    if (!E()) return;
    ensureSub();
    buildShell();
    var eng = E();
    if (!eng.threadsLoaded) {
      eng.loadThreads().then(function () {
        if (eng.activeThread()) view = "chat"; else view = "select";
        paint();
      });
    } else {
      if (!eng.activeThread()) view = "select";
    }
    paint();
  };
  window.__classicSuspend = function () {
    try {
      var eng = E();
      if (eng && eng.activeThread()) eng.stop(eng.activeThread().id);
    } catch (e) {}
    busy = false;
  };
  window.__classicOpenWith = function (data) {
    try {
      var eng = E();
      if (!eng) return false;
      data = data || {};
      var name = String(data.name || "Character").slice(0, 60) || "Character";
      var desc = String(data.description || data.desc || "");
      if (!desc.trim()) return false;
      eng.makeThread(name, desc, String(data.avatar || data.thumb || ""), String(data.bond0 || ""));
      view = "chat";
      ensureSub();
      buildShell();
      paint();
      if (window.showTab) window.showTab("chat");
      return true;
    } catch (e) { return false; }
  };
  // Old-app share fragment {addCharacter:{...}} → best-effort map to a thread.
  window.__classicAddCharacter = function (hashData) {
    var eng = E();
    try {
      var obj = JSON.parse(decodeURIComponent(String(hashData || "")));
      var c = obj.addCharacter || obj.quickAdd || obj;
      if (c && typeof c === "object") {
        var name = c.name || c.charName || c.characterName || "Character";
        var av = c.avatar || c.avatarUrl || c.thumb || c.image || "";
        var desc = c.description || c.persona || c.personality || "";
        if (c.greeting || c.firstMessage) desc += (desc ? "\n\n" : "") + "First message style: " + (c.greeting || c.firstMessage);
        if (String(desc).trim()) {
          eng.makeThread(String(name).slice(0, 60), String(desc).slice(0, 12000), String(av).slice(0, 150000), "");
          view = "chat";
          buildShell();
          paint();
          return true;
        }
      }
    } catch (e) {}
    return false;
  };
  window.__classicLoading = false;
  window.__classicLoaded = true;
})();
