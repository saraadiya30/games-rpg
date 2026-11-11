/* ============================================================================
   Living World — RPG shell behaviour (UI ONLY)
   - Tidak menyentuh logika game, data W, save, atau AI.
   - Hanya: kelas fullscreen, tombol Menu, nav bawah/sidebar, drawer quest +
     jurnal, tab saluran dialog/jurnal, log battle mini, toast dunia, judul area.
   - Semua id/class/data-attribute lama dipertahankan; node lama DIPINDAH (bukan
     di-clone) supaya event handler lama tetap jalan.
   - Aman dipanggil ulang setiap render (idempotent) via MutationObserver.
   ========================================================================== */
(function () {
  "use strict";
  if (window.__wdRpgShell) return;
  window.__wdRpgShell = true;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function worldApp() { return $("world-app"); }
  function getW() {
    try { return window.WorldSim && window.WorldSim.world; } catch (e) { return null; }
  }
  function locNameOf(id) {
    try {
      var W = getW();
      if (!W || !Array.isArray(W.locations)) return "";
      for (var i = 0; i < W.locations.length; i++) {
        if (W.locations[i].id === id) return W.locations[i].name || "";
      }
    } catch (e) {}
    return "";
  }
  function isBattleMsg(m) {
    if (!m) return false;
    var t = String((m.text || "") + " " + (m.who || ""));
    return /⚔️|👾|🏆|💀|🔥|❄️|🏃|💦|merapal|casts|menyerang|strikes|menyerang balik|strikes back|menyergap|ambush|menghadang|blocks your|HP\s*\d+\s*\/|\+?\d+\s*XP|kehabisan|pingsan|level up|naik level/i.test(t);
  }

  /* ---------- 1. Fullscreen: tandai body saat tab world aktif ---------- */
  function syncGameMode() {
    var on = false;
    try { on = (window.__activeTab === "world"); } catch (e) {}
    try { document.body.classList.toggle("wd-game-active", !!on); } catch (e2) {}
    var app = worldApp();
    if (app) app.classList.toggle("wd-rpg", !!on);
    var menu = $("wd-menu");
    if (menu) menu.hidden = !on;
    var nav = document.querySelector(".wd-rpg-nav");
    if (nav) nav.hidden = !on;
  }
  if (!window.__wdRpgShowTabHook) {
    window.__wdRpgShowTabHook = true;
    var tries = 0;
    (function hook() {
      if (typeof window.showTab === "function") {
        var orig = window.showTab;
        window.showTab = function () {
          var r = orig.apply(this, arguments);
          try { syncGameMode(); } catch (e) {}
          return r;
        };
      } else if (++tries < 200) setTimeout(hook, 250);
    })();
  }

  /* ---------- 2. Elemen shell (dibuat sekali) ---------- */
  function ensureShellNodes() {
    var app = worldApp();
    if (!app) return;
    // Tombol Menu kecil
    if (!$("wd-menu")) {
      var menu = document.createElement("button");
      menu.id = "wd-menu";
      menu.type = "button";
      menu.textContent = "☰ Menu";
      menu.title = "Kembali ke tool studio";
      menu.addEventListener("click", function () {
        try {
          if (typeof window.showTab === "function") window.showTab("home");
        } catch (e) {}
      });
      app.appendChild(menu);
    }
    // Nav bawah / sidebar
    var nav = app.querySelector(":scope > .wd-rpg-nav");
    if (!nav) {
      nav = document.createElement("nav");
      nav.className = "wd-rpg-nav";
      nav.setAttribute("aria-label", "Navigasi game");
      nav.innerHTML =
        "<button type='button' data-nav='adventure'><span class='i'>🗺️</span><span>Peta</span></button>" +
        "<button type='button' data-nav='quest'><span class='i'>📜</span><span>Quest</span></button>" +
        "<button type='button' data-nav='bag'><span class='i'>🎒</span><span>Tas</span></button>" +
        "<button type='button' data-nav='party'><span class='i'>🧑</span><span>Party</span></button>" +
        "<button type='button' data-nav='world'><span class='i'>🌍</span><span>Dunia</span></button>" +
        "<button type='button' data-nav='journal'><span class='i'>📖</span><span>Jurnal</span></button>";
      app.appendChild(nav);
      nav.querySelectorAll("[data-nav]").forEach(function (b) {
        b.addEventListener("click", function () { navGo(b.getAttribute("data-nav")); });
      });
    }
    // Scrim + drawer quest + drawer jurnal
    if (!app.querySelector(":scope > .wd-drawer-scrim")) {
      var scrim = document.createElement("div");
      scrim.className = "wd-drawer-scrim";
      scrim.hidden = true;
      scrim.addEventListener("click", closeDrawers);
      app.appendChild(scrim);
    }
    if (!$("wd-drawer-quest")) {
      var dq = document.createElement("section");
      dq.id = "wd-drawer-quest";
      dq.className = "wd-drawer";
      dq.hidden = true;
      dq.setAttribute("aria-label", "Quest");
      dq.innerHTML = "<div class='wd-drawer-head'>📜 Quest<button type='button' data-close>✕</button></div><div class='wd-drawer-body'></div>";
      app.appendChild(dq);
      dq.querySelector("[data-close]").addEventListener("click", closeDrawers);
    }
    if (!$("wd-drawer-journal")) {
      var dj = document.createElement("section");
      dj.id = "wd-drawer-journal";
      dj.className = "wd-drawer";
      dj.hidden = true;
      dj.setAttribute("aria-label", "Jurnal dunia");
      dj.innerHTML = "<div class='wd-drawer-head'>📖 Jurnal Dunia<button type='button' data-close>✕</button></div><div class='wd-drawer-body'><div id='wd-journal-list'></div></div>";
      app.appendChild(dj);
      dj.querySelector("[data-close]").addEventListener("click", closeDrawers);
    }
    if (!$("wd-drawer-help")) {
      var dh = document.createElement("section");
      dh.id = "wd-drawer-help";
      dh.className = "wd-drawer";
      dh.hidden = true;
      dh.setAttribute("aria-label", "Bantuan tombol");
      dh.innerHTML = "<div class='wd-drawer-head'>❓ Bantuan<button type='button' data-close>✕</button></div><div class='wd-drawer-body'><div id='wd-help-list'></div></div>";
      app.appendChild(dh);
      dh.querySelector("[data-close]").addEventListener("click", closeDrawers);
    }
    // Drawer pencapaian (daftar achievement + progres, dari WorldSim.achList).
    if (!$("wd-drawer-ach")) {
      var da = document.createElement("section");
      da.id = "wd-drawer-ach";
      da.className = "wd-drawer";
      da.hidden = true;
      da.setAttribute("aria-label", "Pencapaian");
      da.innerHTML = "<div class='wd-drawer-head'>🏆 Pencapaian<button type='button' data-close>✕</button></div><div class='wd-drawer-body'></div>";
      app.appendChild(da);
      da.querySelector("[data-close]").addEventListener("click", closeDrawers);
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeDrawers();
    });
  }

  function clickSubTab(name) {
    try {
      var b = document.querySelector("#wd-subtabs [data-wtab='" + name + "']");
      if (b) { b.click(); return true; }
    } catch (e) {}
    return false;
  }
  function navGo(kind) {
    var app = worldApp();
    if (!app) return;
    // Tandai aktif
    try {
      app.querySelectorAll(".wd-rpg-nav [data-nav]").forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-nav") === kind);
      });
    } catch (e) {}
    if (kind === "adventure") { closeDrawers(); clickSubTab("adventure"); return; }
    if (kind === "party" || kind === "world") { closeDrawers(); clickSubTab(kind); return; }
    if (kind === "bag") {
      var inv = $("wd-invbtn");
      if (inv) inv.click();
      else {
        try {
          var bar = document.querySelector("#wd-subtabs");
          void bar;
        } catch (e) {}
      }
      return;
    }
    if (kind === "quest") { openDrawer("wd-drawer-quest"); return; }
    if (kind === "journal") { openDrawer("wd-drawer-journal"); renderJournal(); return; }
  }
  function openDrawer(id) {
    var app = worldApp();
    if (!app) return;
    ["wd-drawer-quest", "wd-drawer-journal", "wd-drawer-help", "wd-drawer-ach"].forEach(function (d) {
      var el = $(d);
      if (el) el.hidden = (d !== id);
    });
    var scrim = app.querySelector(":scope > .wd-drawer-scrim");
    if (scrim) scrim.hidden = false;
    // Tutup pane party/world/god (kembali ke adventure) supaya tidak dobel
    // — tanpa ubah data, hanya klik subtab adventure bila drawer quest/jurnal dibuka
    // dari posisi party/world? Tidak: biarkan pane, drawer menimpa di atasnya.
  }
  function closeDrawers() {
    ["wd-drawer-quest", "wd-drawer-journal", "wd-drawer-help", "wd-drawer-ach"].forEach(function (d) {
      var el = $(d);
      if (el) el.hidden = true;
    });
    var app = worldApp();
    var scrim = app && app.querySelector(":scope > .wd-drawer-scrim");
    if (scrim) scrim.hidden = true;
    try {
      var nav = app && app.querySelector(".wd-rpg-nav");
      if (nav) nav.querySelectorAll("[data-nav]").forEach(function (b) { b.classList.remove("on"); });
    } catch (e) {}
  }

  /* ---------- 3. Saluran dialog / jurnal / battle ---------- */
  function ensureDlgTabs() {
    var adv = $("wd-pane-adventure");
    if (!adv || adv.querySelector(":scope > .wd-card > .wd-dlg-tabs, :scope .wd-dlg-tabs")) return;
    var feed = $("wd-feed");
    if (!feed) return;
    var tabs = document.createElement("div");
    tabs.className = "wd-dlg-tabs";
    tabs.innerHTML =
      "<button type='button' data-ch='dialog' class='on'>💬 Dialog</button>" +
      "<button type='button' data-ch='journal'>📖 Jurnal <span class='wd-dlg-count'></span></button>" +
      "<button type='button' data-helpbtn title='❓ Penjelasan semua tombol'>❓</button>";
    feed.parentNode.insertBefore(tabs, feed);
    // Log battle mini (di atas feed)
    if (!$("wd-battlelog")) {
      var bl = document.createElement("div");
      bl.id = "wd-battlelog";
      bl.setAttribute("aria-label", "Log pertarungan");
      feed.parentNode.insertBefore(bl, feed);
    }
    tabs.querySelectorAll("[data-ch]").forEach(function (b) {
      b.addEventListener("click", function () { setChannel(b.getAttribute("data-ch")); });
    });
    var hb = tabs.querySelector("[data-helpbtn]");
    if (hb) hb.addEventListener("click", function () { openDrawer("wd-drawer-help"); renderHelp(); });
    // Default: dialog
    try {
      if (!feed.classList.contains("show-dialog") && !feed.classList.contains("show-journal")) {
        feed.classList.add("show-dialog");
      }
      syncDlgTabs();
    } catch (e) {}
  }
  function setChannel(ch) {
    var feed = $("wd-feed");
    if (!feed) return;
    if (ch !== "dialog" && ch !== "journal") ch = "dialog";
    feed.classList.toggle("show-dialog", ch === "dialog");
    feed.classList.toggle("show-journal", ch === "journal");
    try { localStorage.setItem("t2iWorldChanV1", ch); } catch (e) {}
    syncDlgTabs();
    try { feed.scrollTop = feed.scrollHeight; } catch (e2) {}
  }
  function syncDlgTabs() {
    var feed = $("wd-feed");
    if (!feed) return;
    var ch = feed.classList.contains("show-journal") ? "journal" : "dialog";
    document.querySelectorAll(".wd-dlg-tabs [data-ch]").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-ch") === ch);
    });
    try {
      var saved = null;
      try { saved = localStorage.getItem("t2iWorldChanV1"); } catch (e) {}
      if (saved === "journal" || saved === "dialog") {
        feed.classList.toggle("show-dialog", saved === "dialog");
        feed.classList.toggle("show-journal", saved === "journal");
        document.querySelectorAll(".wd-dlg-tabs [data-ch]").forEach(function (b) {
          b.classList.toggle("on", b.getAttribute("data-ch") === saved);
        });
        ch = saved;
      }
    } catch (e2) {}
    // Tandai feed yang salurannya kosong (semua pesan terfilter) → gaya ramping + hint
    try {
      var sel = (ch === "journal") ? ".wd-msg.sys, .wd-msg.godmsg" : ".wd-msg:not(.sys):not(.godmsg)";
      var n = 0;
      try { n = feed.querySelectorAll(sel).length; } catch (eN) {}
      feed.classList.toggle("is-empty", !n);
      feed.setAttribute("data-empty", ch === "journal"
        ? "📖 Belum ada kabar — buka Dialog untuk obrolan."
        : "💬 Belum ada dialog — buka Jurnal untuk kabar dunia.");
    } catch (e3) {}
  }

  // Tandai pesan battle + isi log mini (kelas bantu, tanpa ubah data)
  function syncBattleTag() {
    var feed = $("wd-feed");
    if (!feed) return;
    var W = getW();
    var inBattle = !!(W && W.encounter);
    var app = worldApp();
    if (app) app.classList.toggle("is-battle", !!(inBattle && !$("wd-pane-adventure").hidden));
    var msgs = feed.querySelectorAll(".wd-msg");
    var battleTexts = [];
    msgs.forEach(function (m) {
      var t = m.textContent || "";
      var hit = /⚔️|👾|🏆|💀|🔥|❄️|🏃|💦|merapal|casts|menyerang|strikes|menyerang balik|strikes back|menyergap|ambush|menghadang|blocks your|\+?\d+\s*XP|level up|naik level|pingsan|kehalang/i.test(t);
      // Jangan tandai obrolan biasa sebagai battle
      if (hit && (m.classList.contains("sys") || /⚔️|👾|🏆|💀|merapal|casts|menyerang|strikes|menyerang balik|HP\s*\d|XP|level|pingsan|menyergap|menghadang|blocks your|🏃|💦|🔥|❄️/i.test(t))) {
        m.classList.add("is-battle");
        if (battleTexts.length < 20) battleTexts.push(t.trim().slice(0, 220));
      } else {
        m.classList.remove("is-battle");
      }
    });
    var bl = $("wd-battlelog");
    if (bl) {
      var tail = battleTexts.slice(-8);
      bl.innerHTML = tail.map(function (t) { return "<div>" + esc(t) + "</div>"; }).join("");
      try { bl.scrollTop = bl.scrollHeight; } catch (e) {}
    }
    // Affordance aturan (a): tombol travel MILIK WORLD nonaktif selama ada musuh
    // (node + handler tetap utuh). SCOPE: hanya di dalam #world-app — tombol
    // navigasi studio ([data-go] di sidebar/dock) tidak boleh ikut mati.
    try {
      var noTravel = !!(W && W.encounter);
      var scope = worldApp() || document;
      scope.querySelectorAll("[data-wgoto],[data-go]").forEach(function (b) {
        b.disabled = noTravel;
        if (noTravel) b.title = "Tidak bisa pergi saat battle — kalahkan atau kabur dulu";
        else b.removeAttribute("title");
      });
    } catch (e5) {}
  }

  /* Tombol dagang kilat: hanya NPC radius ≤3 (cadangan live — render tiles tak selalu
     refresh bar; node + handler tetap utuh, hanya disembunyikan). */
  function syncNearbyButtons() {
    try {
      var W = getW();
      if (!W || !W.player) return;
      var px = Number(W.player.tx) || 0, py = Number(W.player.ty) || 0;
      var byId = {};
      (W.chars || []).forEach(function (c) { try { byId[c.id] = c; } catch (e) {} });
      document.querySelectorAll("#wd-pane-adventure .wd-stickfoot [data-shop]").forEach(function (b) {
        var c = byId[b.getAttribute("data-shop")];
        var near = !!c && c.loc === W.player.loc &&
          (Math.abs((Number(c.tx) || 0) - px) + Math.abs((Number(c.ty) || 0) - py)) <= 3;
        b.style.display = near ? "" : "none";
      });
    } catch (e6) {}
  }

  /* Jurnal: cerminan read-only pesan sistem/dewa (node asli tetap di #wd-feed) */
  function renderJournal() {
    var box = $("wd-journal-list");
    if (!box) return;
    var W = getW();
    if (!W || !Array.isArray(W.feed)) { box.innerHTML = "<div class='wd-hint'>Jurnal kosong.</div>"; return; }
    var list = W.feed.slice(-40).filter(function (m) { return m && (m.kind === "system" || m.kind === "god"); }).slice(-20);
    if (!list.length) { box.innerHTML = "<div class='wd-hint'>Belum ada kabar dunia.</div>"; return; }
    box.innerHTML = list.map(function (m) {
      var label = m.kind === "god" ? "👑 Dewa" : "🌍 " + esc(m.loc ? locNameOf(m.loc) : "dunia");
      return "<div class='wd-msg sys'><b>" + label + "</b><br>" + esc(m.text || "") + "</div>";
    }).join("");
    try { box.parentNode.scrollTop = 0; } catch (e) {}
  }

  /* Toast singkat untuk pesan dunia baru (UI saja) */
  /* Bantuan: penjelasan tiap tombol interaksi (angka sesuai logika game).
     UI saja — teks statis, tak menyentuh data. */
  /* Hitungan live tombol Istirahat dari state sekarang (dipakai tooltip + panel ❓). */
  function restPreview() {
    var W = getW(), en = !!(W && W.lang === "en");
    var p = (W && W.player) || {};
    var e0 = Number(p.energy) || 0, hp0 = Number(p.hp) || 0;
    var locN = ""; try { locN = locNameOf(p.loc) || ""; } catch (eL) {}
    var ln = String(locN).toLowerCase();
    var isSafe = /rumah|penginapan|inn|house|home|plaza|alun|menara|tower/.test(ln);
    var isDanger = /hutan|forest|dungeon|gerbang|gate|kuburan|gua|tower gelap/.test(ln);
    var gain = isSafe ? 70 : (isDanger ? 25 : 45);
    var hp = isSafe ? 15 : 5;
    var cls = isSafe ? (en ? "safe" : "aman") : (isDanger ? (en ? "dangerous" : "bahaya") : (en ? "normal" : "biasa"));
    var sE = Math.min(100, e0 + gain);
    return {
      en: en, locN: locN || (en ? "here" : "sini"), cls: cls, gain: gain, hp: hp, e0: e0, sE: sE,
      line: en ? "Rest at " + (locN || "here") + " (" + cls + "): +" + gain + " energy (" + e0 + "→" + sE + "), +" + hp + " HP, -8 food"
        : "Istirahat di " + (locN || "sini") + " (" + cls + "): +" + gain + " ⚡ (" + e0 + "→" + sE + "), +" + hp + " ❤️, −8 🍖",
      // Varian teks polos untuk tooltip native (title): font tooltip tak selalu bisa emoji.
      // Tanpa awalan lokasi — tinggal angka/effeknya saja (permintaan user).
      // Emoji dibalikin sesuai permintaan (ID).
      lineText: en ? "+" + gain + " energy (" + e0 + "→" + sE + "), +" + hp + " HP, -8 food"
        : "+" + gain + " ⚡ (" + e0 + "→" + sE + "), +" + hp + " ❤️, −8 🍖"
    };
  }
  function renderHelp() {
    var box = $("wd-help-list");
    if (!box) return;
    var en = false;
    try { en = getW() && getW().lang === "en"; } catch (e) {}
    function sec(t, rows) {
      return "<div class='wd-msg sys'><b>" + t + "</b><br>" + rows.map(function (r) {
        return "• <b>" + r[0] + "</b> — " + r[1];
      }).join("<br>") + "</div>";
    }
    var html = "";
    if (en) {
      html += sec("🗺️ Map", [
        ["Walk", "tap a tile next to you (free). WASD / arrows / d-pad work too."],
        ["🚪 Door", "tap 2x or Enter to travel (-6 energy, -1 food, +1 hour; danger areas: 20% ambush). No travel during battle."],
        ["🌿 / faces", "gather spot / residents here. Photo = portrait, letter = no portrait yet."]
      ]);
      html += sec("🎮 Actions", [
        ["🔍 Explore", "search here (needs 8+ energy; -8 energy, -2 food). Forest/dungeon: Herbal/Wood/Iron; Plaza: odd jobs +4-7 coins."],
        ["😴 Rest", "+energy safe 70 / normal 45 / danger 25, +HP 15 (safe) or 5, -8 food, +1 hour.<br>⚡ <b>Right now:</b> " + esc(restPreview().line)],
        ["📊", "show full stats in feed."],
        ["⚔️ Attack", "8 + weapon + Lv x2 + dice 0-6 (-2 energy). Win: coins + loot + XP. Lose: faint, wake home at 20 HP."],
        ["✨ Magic", "pick a spell above first, then Magic. Costs 12-22 mana (Fire 15 burn, Wind 12 crit, Ice 15 freeze, Stone 18 guard, Lightning 20 stun, Holy 22 +18 HP). Locked ones: reach its Lv or buy its tome."],
        ["🏃 Flee", "70% escape (+2 XP). Fail = free enemy counter."],
        ["🎒 Bag", "eat/use from bag (mid-battle costs 1 turn). Food heals x1 at eateries, x0.6 elsewhere. Weapons & shields only fight when EQUIPPED — tap Equip on a card (or type: pasang pedang besi). Potions: HP / HP Besar / Energi / Energi Besar / Mana / Mana Besar / Penawar / Elixir."]
      ]);
      html += sec("🏪 Trading & 📜 Quests", [
        ["🏪 row", "sellers within 3 tiles. Trading is in-person; night +10%, affinity 40+ discount."],
        ["📜 Quest", "fetch (gather goods) or hunt (cull 3 monsters, 60 coins). Rewards by role: 75 / 45 / 40 / 35 / 30 coins."]
      ]);
      html += sec("💬 Talk & 🧭 Nav", [
        ["💬 Talk", "pick who (All = nearby), Say/Act, Send (Enter). Nearby NPCs sometimes offer quests."],
        ["🧭 Nav", "Map - Quest - Bag - Party - World - Journal. Party = roster, World = places + timeline."]
      ]);
    } else {
      html += sec("🗺️ Peta", [
        ["Jalan", "ketuk ubin di sebelahmu (gratis). Bisa juga WASD / panah / d-pad."],
        ["🚪 Pintu", "ketuk 2x / Enter untuk pergi (-6 energi, -1 kenyang, +1 jam; area bahaya 20% disergap). Tak bisa pergi saat battle."],
        ["🌿 / wajah", "titik gather / penghuni di sini. Foto = portrait, huruf = belum ada portrait."]
      ]);
      html += sec("🎮 Aksi", [
        ["🔍 Jelajah", "mencari di lokasi (butuh 8+ energi; -8 energi, -2 kenyang). Hutan/Dungeon: Herbal/Kayu/Besi; Alun-alun: serabutan +4-7 koin."],
        ["😴 Istirahat", "+energi aman 70 / biasa 45 / bahaya 25, +HP 15 (aman) atau 5, -8 kenyang, +1 jam.<br>⚡ <b>Sekarang:</b> " + esc(restPreview().line)],
        ["📊", "tampilkan stat lengkap di feed."],
        ["⚔️ Serang", "8 + senjata + Lv x2 + dadu 0-6 (-2 energi). Menang: koin + loot + XP. Kalah: pingsan, bangun di rumah HP 20."],
        ["✨ Sihir", "pilih sihir di atas dulu, baru Sihir. Butuh 12-22 mana (Api 15 bakar, Angin 12 crit, Es 15 beku, Tanah 18 tahan, Petir 20 stun, Cahaya 22 +18 HP). Yang terkunci: capai Lv-nya atau beli kitabnya."],
        ["🏃 Kabur", "70% lolos (+2 XP). Gagal = musuh balas gratis."],
        ["🎒 Tas", "makan/pakai dari tas (saat battle = 1 giliran). Efek x1 di tempat makan, x0,6 di luar. Senjata & perisai HANYA ikut tarung bila TERPASANG — tekan Pasang di kartunya (atau ketik: pasang pedang besi). Ramuan: HP / HP Besar / Energi / Energi Besar / Mana / Mana Besar / Penawar / Elixir."]
      ]);
      html += sec("🏪 Dagang & 📜 Quest", [
        ["Bar 🏪", "penjual dalam radius 3 ubin. Dagang harus tatap muka; malam +10%, afinitas 40+ diskon."],
        ["📜 Quest", "fetch (kumpulkan barang) atau berburu (berantas 3 monster, 60 koin). Upah per peran: 75 / 45 / 40 / 35 / 30 koin."]
      ]);
      html += sec("💬 Ngobrol & 🧭 Navigasi", [
        ["💬 Ngobrol", "pilih lawan bicara (Semua = sekitar), Bicara/Aksi, Kirim (Enter). NPC se-lokasi kadang menawari quest."],
        ["🧭 Navigasi", "Peta - Quest - Tas - Party - Dunia - Jurnal. Party = daftar awak, Dunia = tempat + linimasa."]
      ]);
    }
    if (box.innerHTML !== html) box.innerHTML = html;
  }
  /* Tooltip tiap tombol interaksi (hover di desktop; di HP lewat panel ❓).
     Idempotent: dipanggil tiap enhance, hanya set atribut. */
  function syncTitles() {
    try {
      var W = getW(), en = !!(W && W.lang === "en");
      var byId = {};
      (W && W.chars || []).forEach(function (c) { try { byId[c.id] = c.name; } catch (e) {} });
      function setT(sel, t) {
        var e = document.querySelector(sel);
        if (e && e.getAttribute("title") !== t) e.setAttribute("title", t);
      }
      setT("#wd-act-gather", en ? "Explore here (8+ energy)" : "Jelajah di sini (butuh 8+ energi)");
      // Dinamis: hitung dari state live (lokasi, energi, senjata, sihir terpilih).
      try {
        var p = (W && W.player) || {};
        var e0 = Number(p.energy) || 0, m0 = Number(p.mana) || 0;
        var rp = restPreview();
        setT("#wd-act-sleep", rp.lineText);
        setT("#wd-act-gather", e0 < 8
          ? (en ? "Needs 8+ energy (yours: " + e0 + ") - rest first!" : "Butuh 8+ ⚡ (punyamu: " + e0 + ") - istirahat dulu!")
          : (en ? "-8 energy (" + e0 + "→" + Math.max(0, e0 - 8) + "), -2 food" : "−8 ⚡ (" + e0 + "→" + Math.max(0, e0 - 8) + "), −2 🍖"));
        var lv = Math.max(1, Math.round(Number(p.level) || 1));
        var wp = 0, wName = "";
        function wpOf(nm) {
          var s = String(nm || "").toLowerCase().trim();
          var M = { "pedang besi": 8, "pedang baja": 12, "kapak perang": 10, "busur pemburu": 6, "belati tajam": 5, "tongkat archmage": 5, "tongkat sihir": 2 };
          if (M[s] != null) return M[s];
          if (/pedang|sword|parang|belati|dagger|busur|bow|kapak|axe|tombak|spear/.test(s)) return 4;
          if (/tongkat|staff|jimat|amulet/.test(s)) return 2;
          return 0;
        }
        try {
          var eqw = p.equip && p.equip.weapon;
          if (eqw && ((p.items || []).indexOf(eqw) !== -1 || (p.items || []).some(function (x) { return String(x).toLowerCase() === String(eqw).toLowerCase(); }))) { wp = wpOf(eqw); wName = String(eqw); }
        } catch (eEQW) {}
        if (!wp) ((p.items) || []).forEach(function (x) {
          var q = wpOf(x);
          if (q > wp) { wp = q; wName = String(x); }
        });
        var aMin = 8 + wp + lv * 2, aMax = aMin + 6;
        setT("#wd-act-atk", en ? "Attack: " + aMin + "-" + aMax + " dmg (-2 energy) - " + (wName || "bare hands")
          : "Serang: " + aMin + "-" + aMax + " dmg (-2 energi) - " + (wName || "tangan kosong"));
        // Sihir terpilih: baca label + cost dari dropdown (sudah memuat "cost✨").
        try {
          var spSel = document.querySelector("#wd-spell");
          var spLbl = spSel && spSel.options && spSel.selectedIndex >= 0 ? String(spSel.options[spSel.selectedIndex].text || "") : "";
          try { spLbl = spLbl.replace(/[\u{1F000}-\u{1FAFF}\u2600-\u27BF\u2B00-\u2BFF\uFE0F]/gu, "").replace(/\s+/g, " ").trim(); } catch (eEm) {}
          var mCost = (spLbl.match(/\((\d+)/) || [])[1] || "?";
          setT("#wd-spell", en ? "Selected: " + spLbl + " - you have " + m0 + " mana" : "Terpilih: " + spLbl + " - manamu " + m0);
          setT("#wd-act-mag", en ? "Cast it (" + mCost + " mana, yours: " + m0 + ")" : "Rapalkan (" + mCost + " mana, punyamu: " + m0 + ")");
        } catch (eSp) {}
      } catch (eDyn) {}
      setT("#wd-act-status", en ? "Show full stats" : "Lihat stat lengkap");
      setT("#wd-act-flee", en ? "Flee (70% escape)" : "Kabur (70% lolos)");
      setT("#wd-target", en ? "Who to talk to" : "Lawan bicara");
      setT("#wd-kind", en ? "Say or Act" : "Bicara atau Aksi");
      setT("#wd-say", en ? "Type here, Enter to send" : "Ketik di sini, Enter untuk kirim");
      setT("#wd-send", en ? "Send" : "Kirim");
      var navHid = { adventure: "Peta", quest: "Quest", bag: "Tas", party: "Party", world: "Dunia", journal: "Jurnal" };
      var navHen = { adventure: "Map", quest: "Quests", bag: "Bag", party: "Party", world: "World", journal: "Journal" };
      document.querySelectorAll(".wd-rpg-nav [data-nav]").forEach(function (b) {
        var k = b.getAttribute("data-nav");
        var t = (en ? navHen[k] : navHid[k]) || k;
        if (b.getAttribute("title") !== t) b.setAttribute("title", t);
      });
      document.querySelectorAll("#wd-pane-adventure [data-shop]").forEach(function (b) {
        if (b.closest && b.closest("#wd-shops")) return;
        var nm = byId[b.getAttribute("data-shop")] || "";
        var t = (en ? "Shop from " : "Belanja ke ") + nm;
        if (b.getAttribute("title") !== t) b.setAttribute("title", t);
      });
      document.querySelectorAll("#world-app [data-npcmenu]").forEach(function (b) {
        var nm = byId[b.getAttribute("data-npcmenu")] || "";
        var t = nm + (en ? " - Talk / Shop / Work" : " - Ngobrol / Toko / Kerja");
        if (b.getAttribute("title") !== t) b.setAttribute("title", t);
      });
      document.querySelectorAll("#world-app .wd-tiles-bar [data-d]").forEach(function (b) {
        var d = b.getAttribute("data-d");
        var t = d === "go" ? (en ? "Confirm / enter door" : "Konfirmasi / masuk pintu") : d === "up" ? (en ? "Step up" : "Langkah atas") : d === "down" ? (en ? "Step down" : "Langkah bawah") : d === "left" ? (en ? "Step left" : "Langkah kiri") : (en ? "Step right" : "Langkah kanan");
        if (b.getAttribute("title") !== t) b.setAttribute("title", t);
      });
    } catch (eT) {}
  }
  var lastToastId = null;
  function syncToasts() {
    try {
      var W = getW();
      if (!W || !Array.isArray(W.feed) || !W.feed.length) return;
      var last = W.feed[W.feed.length - 1];
      if (!last || (last.kind !== "system" && last.kind !== "god")) return;
      if (last.id && last.id === lastToastId) return;
      lastToastId = last.id || null;
      // Hanya toast bila game aktif dan pesan baru masuk sesudah shell hidup
      if (!document.body.classList.contains("wd-game-active")) return;
      if (window.__wdRpgBootedAt && last.ts && last.ts < window.__wdRpgBootedAt) return;
      var t = document.createElement("div");
      t.className = "wd-toast";
      t.textContent = String(last.text || "").slice(0, 140);
      document.body.appendChild(t);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2600);
    } catch (e) {}
  }

  /* ---------- 4. Quest ke drawer + judul area ---------- */
  function moveQuestStrip() {
    var drawer = $("wd-drawer-quest");
    if (!drawer) return;
    var body = drawer.querySelector(".wd-drawer-body");
    if (!body) return;
    var strip = document.querySelector("#wd-pane-adventure .wd-qstrip");
    if (strip && strip.parentNode !== body) {
      body.appendChild(strip); // DIPINDAH: handler data-qacc/data-qdone ikut
    }
    if (!strip) {
      if (!body.querySelector(".wd-hint")) {
        // Kosong: tampilkan hint sekali (node baru, tidak ganggu logika)
        var h = document.createElement("div");
        h.className = "wd-hint";
        h.textContent = "Belum ada quest aktif.";
        body.appendChild(h);
      }
    } else {
      var hint = body.querySelector(":scope > .wd-hint");
      if (hint) hint.remove();
    }
  }
  function syncAreaTitle() {
    var adv = $("wd-pane-adventure");
    if (!adv) return;
    var card = adv.querySelector(":scope > .wd-card");
    if (!card) return;
    var title = card.querySelector(":scope > .wd-area-title");
    var W = getW();
    var locName = "";
    try {
      if (W && W.player) locName = locNameOf(W.player.loc);
    } catch (e) {}
    var sub = "";
    try {
      // Ambil info jam/cuaca dari hint stagehead bawaan (read-only, tanpa ubah data).
      // Stagehead punya 2 .wd-hint: label filter + baris jam. Ambil yang TERAKHIR.
      var hints = card.querySelectorAll(".wd-stagehead .wd-hint");
      var hint = hints && hints.length ? hints[hints.length - 1] : null;
      if (hint) {
        var txt = String(hint.textContent || "").trim();
        // Format bawaan: "<jam/cuaca> - <nama lokasi>" → ambil bagian jam saja
        var cut = txt.split(" - ")[0].trim().slice(0, 80);
        if (cut) sub = cut;
      }
      if (!sub && W && W.clock) sub = "Hari " + W.clock.day;
    } catch (e4) {}
    if (!title) {
      title = document.createElement("div");
      title.className = "wd-area-title";
      card.insertBefore(title, card.firstChild);
    }
    var html = "<b>📍 " + esc(locName || "Dunia") + "</b>";
    if (sub) html += "<span>" + esc(sub) + "</span>";
    if (title.innerHTML !== html) title.innerHTML = html;
  }

  /* ---------- 5. Enhance utama (idempotent) ---------- */
  var enhancing = false, queued = false;
  function enhance() {
    if (enhancing) { queued = true; return; }
    enhancing = true;
    try {
      syncGameMode();
      ensureShellNodes();
      ensureDlgTabs();
      syncDlgTabs();
      moveQuestStrip();
      syncBattleTag();
      syncNearbyButtons();
      syncToasts();
      syncAreaTitle();
      renderJournalIfOpen();
      renderHelpIfOpen();
      renderAchIfOpen();
      syncAchBtn();
      syncTitles();
    } finally {
      enhancing = false;
      if (queued) { queued = false; setTimeout(enhance, 60); }
    }
  }
  function renderJournalIfOpen() {
    var dj = $("wd-drawer-journal");
    if (dj && !dj.hidden) renderJournal();
  }
  function renderHelpIfOpen() {
    var dh = $("wd-drawer-help");
    if (dh && !dh.hidden) renderHelp();
  }
  /* ---------- 3b. Pencapaian: tombol 🏆 di HUD + drawer daftar + progres ---------- */
  function achListOf() {
    try { if (window.WorldSim && window.WorldSim.achList) return window.WorldSim.achList() || []; } catch (e) {}
    return [];
  }
  function syncAchBtn() {
    var app = worldApp();
    if (!app) return;
    var top = app.querySelector(".wd-hudtop");
    if (!top) return;
    var b = $("wd-achbtn");
    if (!b) {
      b = document.createElement("button");
      b.id = "wd-achbtn";
      b.type = "button";
      b.addEventListener("click", function () { openDrawer("wd-drawer-ach"); renderAch(); });
      top.appendChild(b);
    }
    var list = achListOf(), done = 0, i;
    for (i = 0; i < list.length; i++) if (list[i].done) done++;
    var en = false;
    try { en = getW() && getW().lang === "en"; } catch (eL) {}
    var html = "🏆 <b>" + done + "/" + list.length + "</b>";
    if (b.innerHTML !== html) b.innerHTML = html;
    var t = (en ? "Achievements (" : "Pencapaian (") + done + "/" + list.length + ")";
    if (b.getAttribute("title") !== t) b.setAttribute("title", t);
  }
  function renderAchIfOpen() {
    var d = $("wd-drawer-ach");
    if (d && !d.hidden) renderAch();
  }
  function renderAch() {
    var body = document.querySelector("#wd-drawer-ach .wd-drawer-body");
    if (!body) return;
    var en = false;
    try { en = getW() && getW().lang === "en"; } catch (eL2) {}
    var list = achListOf(), done = 0, i;
    for (i = 0; i < list.length; i++) if (list[i].done) done++;
    var html = "<div class='wd-msg sys'><b>🏆 " + (en ? "Achievements" : "Pencapaian") + "</b> — " + done + "/" + list.length + " " + (en ? "unlocked" : "terbuka") + "</div>";
    html += list.map(function (a) {
      return "<div class='wd-msg sys wd-ach" + (a.done ? " done" : " lock") + "'><b>" + esc(a.ico) + " " + esc(a.name) + "</b> " + (a.done ? "✅" : "🔒") +
        "<br>" + esc(a.desc) + "<br><span class='wd-hint'>" + a.cur + "/" + a.need + "</span></div>";
    }).join("");
    if (body.innerHTML !== html) body.innerHTML = html;
  }

  /* Observer: renderAll/renderStage mengganti innerHTML → terapkan ulang */
  function watch() {
    var app = worldApp();
    if (!app) { setTimeout(watch, 500); return; }
    window.__wdRpgBootedAt = window.__wdRpgBootedAt || Date.now();
    syncGameMode();
    enhance();
    var deb = null;
    try {
      var mo = new MutationObserver(function () {
        if (deb) return;
        deb = setTimeout(function () { deb = null; enhance(); }, 80);
      });
      mo.observe(app, { childList: true, subtree: true });
    } catch (e) {}
    // Cadangan: tab switch tanpa mutasi tetap sinkron
    setInterval(function () { try { syncGameMode(); } catch (e) {} }, 1500);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watch);
  } else {
    watch();
  }
})();
