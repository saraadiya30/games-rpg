/* ===== 🌍 Living World — tiles (visual v2) =====
   Grid 9x7 per lokasi, WASD/panah + klik + d-pad, jalan gratis.
   - v2: peta dibuat koheren per tema (hutan/gedung/lapangan), bukan acak
     mencar; lantai checker dua warna; legenda + nama pintu keluar.
   - Save: loc.map {v:2, w,h,tiles,exits,spawn}, player.tx/ty, char.tx/ty.
   - worldsim.js hanya panggil backfill() + mount() — tidak tahu isi.
   =========================================================================== */
(function () {
  "use strict";
  if (window.WorldTiles && window.WorldTiles.v2) return;

  var TW = 9, TH = 7, MAPV = 2;

  function hashStr(s) {
    s = String(s || "");
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function isDangerName(nm) { return /hutan|forest|dungeon|gerbang|gate|kuburan|gua|tower gelap/i.test(String(nm || "")); }
  function isRestName(nm) { return /rumah|penginapan|inn|house|home|plaza|alun|menara|tower/i.test(String(nm || "")); }
  function isForgeName(nm) { return /tempa|forge|bengkel|krom|bara|grom|blacksmith|dapur|warung|kedai|pasar|market|shop/i.test(String(nm || "")); }
  function themeOf(nm) {
    if (isDangerName(nm)) return "wild";
    if (isRestName(nm) || isForgeName(nm)) return "town";
    return "field";
  }
  function idx(x, y) { return y * TW + x; }
  function inB(x, y) { return x >= 0 && y >= 0 && x < TW && y < TH; }

  function genMap(loc, locIdx, allLocs) {
    var R = rng(hashStr(loc.id || loc.name) || (locIdx + 1) * 7919);
    var tiles = new Array(TW * TH).fill(".");
    var exits = {};
    var x, y, i;
    for (x = 0; x < TW; x++) { tiles[idx(x, 0)] = "#"; tiles[idx(x, TH - 1)] = "#"; }
    for (y = 0; y < TH; y++) { tiles[idx(0, y)] = "#"; tiles[idx(TW - 1, y)] = "#"; }
    var others = allLocs.filter(function (l) { return l.id !== loc.id; });
    var spots = [{ x: TW - 1, y: 3 }, { x: 0, y: 3 }, { x: 4, y: 0 }, { x: 4, y: TH - 1 }];
    for (i = 0; i < Math.min(others.length, spots.length); i++) {
      var s = spots[i];
      tiles[idx(s.x, s.y)] = "E";
      exits[s.x + "," + s.y] = others[i].id;
    }
    function clear3(cx, cy) {
      for (var yy = cy - 1; yy <= cy + 1; yy++) for (var xx = cx - 1; xx <= cx + 1; xx++) {
        if (inB(xx, yy) && tiles[idx(xx, yy)] !== "E") tiles[idx(xx, yy)] = ".";
      }
    }
    clear3(4, 3); // spawn selalu lapang
    var theme = themeOf(loc.name);

    if (theme === "wild") {
      // 2 rumpun pohon bentuk plus (bahaya, bisa dilewati)
      for (var c = 0; c < 2; c++) {
        var px = 2 + Math.floor(R() * (TW - 4)), py = 2 + Math.floor(R() * (TH - 4));
        [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) {
          var qx = px + o[0], qy = py + o[1];
          if (inB(qx, qy) && tiles[idx(qx, qy)] === ".") tiles[idx(qx, qy)] = "D";
        });
      }
      // 1 rumpun gather 2-3 petak bersebelahan
      var gx = 1 + Math.floor(R() * (TW - 2)), gy = 1 + Math.floor(R() * (TH - 2));
      var placed = 0;
      [[0, 0], [1, 0], [0, 1]].forEach(function (o) {
        var qx = gx + o[0], qy = gy + o[1];
        if (placed < 3 && inB(qx, qy) && tiles[idx(qx, qy)] === ".") { tiles[idx(qx, qy)] = "G"; placed++; }
      });
      // 2 batu penghalang tunggal
      for (var b = 0; b < 2; b++) {
        var bx = 1 + Math.floor(R() * (TW - 2)), by = 1 + Math.floor(R() * (TH - 2));
        if (tiles[idx(bx, by)] === ".") tiles[idx(bx, by)] = "#";
      }
    } else if (theme === "town") {
      // 1 bangunan L (dinding koheren) + 1 titik aktivitas di depannya
      var hx = 2 + Math.floor(R() * (TW - 5)), hy = 1 + Math.floor(R() * 2);
      for (var wx = 0; wx < 3; wx++) if (tiles[idx(hx + wx, hy)] === ".") tiles[idx(hx + wx, hy)] = "#";
      for (var wy = 1; wy <= 2; wy++) if (tiles[idx(hx, hy + wy)] === ".") tiles[idx(hx, hy + wy)] = "#";
      var sx = hx + 1, sy = hy + 2;
      if (inB(sx, sy) && tiles[idx(sx, sy)] === "#") tiles[idx(sx, sy)] = ".";
      if (inB(sx, sy + 1) && tiles[idx(sx, sy + 1)] === ".") tiles[idx(sx, sy + 1)] = "S";
      else {
        outer: for (var yy2 = 1; yy2 < TH - 1; yy2++) for (var xx2 = 1; xx2 < TW - 1; xx2++) {
          if (tiles[idx(xx2, yy2)] === ".") { tiles[idx(xx2, yy2)] = "S"; break outer; }
        }
      }
      // 1-2 petak gather (kebun/pasar)
      for (var g2 = 0; g2 < 2; g2++) {
        var qx2 = 1 + Math.floor(R() * (TW - 2)), qy2 = 3 + Math.floor(R() * (TH - 4));
        if (inB(qx2, qy2) && tiles[idx(qx2, qy2)] === ".") tiles[idx(qx2, qy2)] = "G";
      }
    } else {
      // lapangan: 3 pohon bahaya tunggal + 1 rumpun gather
      for (var t = 0; t < 3; t++) {
        var tx = 1 + Math.floor(R() * (TW - 2)), ty = 1 + Math.floor(R() * (TH - 2));
        if (tiles[idx(tx, ty)] === ".") tiles[idx(tx, ty)] = "D";
      }
      var fx = 1 + Math.floor(R() * (TW - 2)), fy = 1 + Math.floor(R() * (TH - 2));
      var fp = 0;
      [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function (o) {
        var qx = fx + o[0], qy = fy + o[1];
        if (fp < 2 && inB(qx, qy) && tiles[idx(qx, qy)] === ".") { tiles[idx(qx, qy)] = "G"; fp++; }
      });
    }
    clear3(4, 3);
    // pintu tidak boleh tertutup
    Object.keys(exits).forEach(function (k) {
      var p = k.split(",");
      tiles[idx(Number(p[0]), Number(p[1]))] = "E";
    });
    return { v: MAPV, w: TW, h: TH, tiles: tiles, exits: exits, spawn: { x: 4, y: 3 } };
  }

  function walkable(t) { return t !== "#"; }

  function freeSpot(map, R) {
    for (var t = 0; t < 40; t++) {
      var x = 1 + Math.floor(R() * (TW - 2)), y = 1 + Math.floor(R() * (TH - 2));
      if (walkable(map.tiles[idx(x, y)])) return { x: x, y: y };
    }
    return { x: map.spawn.x, y: map.spawn.y };
  }

  function backfill(W) {
    if (!W || !Array.isArray(W.locations) || !W.locations.length) return;
    W.locations.forEach(function (l, i) {
      if (!l.map || l.map.v !== MAPV || !Array.isArray(l.map.tiles) || l.map.tiles.length !== TW * TH) {
        l.map = genMap(l, i, W.locations);
      }
      if (!l.map.exits) l.map.exits = {};
      if (!l.map.spawn) l.map.spawn = { x: 4, y: 3 };
    });
    var valid = {};
    W.locations.forEach(function (l) { valid[l.id] = 1; });
    W.locations.forEach(function (l) {
      Object.keys(l.map.exits).forEach(function (k) {
        if (!valid[l.map.exits[k]]) {
          var alt = W.locations.filter(function (o) { return o.id !== l.id; })[0];
          if (alt) l.map.exits[k] = alt.id;
          else delete l.map.exits[k];
        }
      });
    });
    var R = rng(hashStr("npc") + (W.locations.length * 131));
    if (W.player) {
      var pl = null;
      for (var i = 0; i < W.locations.length; i++) if (W.locations[i].id === W.player.loc) pl = W.locations[i];
      if (W.player.loc == null && W.locations[0]) { pl = W.locations[0]; W.player.loc = pl.id; }
      var pm = (pl && pl.map) ? pl.map : W.locations[0].map;
      if (!isFinite(W.player.tx) || !isFinite(W.player.ty) ||
          W.player.tx < 0 || W.player.ty < 0 || W.player.tx >= TW || W.player.ty >= TH ||
          !walkable(pm.tiles[idx(W.player.tx, W.player.ty)])) {
        W.player.tx = pm.spawn.x; W.player.ty = pm.spawn.y;
      }
    }
    (W.chars || []).forEach(function (c) {
      var l = null;
      for (var i = 0; i < W.locations.length; i++) if (W.locations[i].id === c.loc) l = W.locations[i];
      if (!l) { c.loc = W.locations[0].id; l = W.locations[0]; }
      var m = l.map;
      if (!isFinite(c.tx) || !isFinite(c.ty) || !inB(c.tx, c.ty) || !walkable(m.tiles[idx(c.tx, c.ty)])) {
        var s = freeSpot(m, R);
        c.tx = s.x; c.ty = s.y;
      }
    });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var FLOOR = {
    wild: ["#24401f", "#1d361b"],
    town: ["#3a332a", "#332d24"],
    field: ["#23401f", "#1e371c"]
  };
  var DANGER = {
    wild: ["#2f4416", "#2a3d13"],
    town: ["#4a3a22", "#43341e"],
    field: ["#2c421a", "#273b17"]
  };

  function tileFace(t, theme, locName) {
    if (t === "#") return "🧱";
    if (t === "E") return "🚪";
    if (t === "G") return "🌿";
    if (t === "S") return isForgeName(locName) ? "🔨" : "🏪";
    if (t === "D") return theme === "town" ? "🪨" : "🌲";
    return "";
  }
  function tileName(t, locName) {
    if (t === "#") return "tembok";
    if (t === "E") return "pintu keluar";
    if (t === "G") return "titik gather";
    if (t === "S") return isForgeName(locName) ? "tempat kerja" : "tempat istirahat";
    if (t === "D") return themeOf(locName) === "town" ? "bebatuan" : "area berbahaya";
    return "jalan";
  }
  function tileBg(t, theme, x, y) {
    var alt = (x + y) % 2;
    if (t === "#") return "#33363d";
    if (t === "E") return "#3d3260";
    if (t === "G") return alt ? "#1f4030" : "#234836";
    if (t === "S") return "#4a3d24";
    if (t === "D") return DANGER[theme][alt];
    return FLOOR[theme][alt];
  }

  function injectCss() {
    var old = document.getElementById("wd-tiles-style");
    if (old) old.remove();
    var st = document.createElement("style");
    st.id = "wd-tiles-style";
    st.textContent = [
      ".wd-tiles{border:1px solid var(--th-border);border-radius:12px;overflow:hidden;background:#10160d;}",
      ".wd-tiles-grid{display:grid;grid-template-columns:repeat(9,minmax(24px,44px));gap:3px;padding:8px;background:#0c110a;width:fit-content;max-width:100%;margin:0 auto;}",
      ".wd-tile{position:relative;aspect-ratio:1/1;border-radius:7px;border:1px solid rgba(255,255,255,0.07);color:#fff;font-size:clamp(18px,4.2vw,28px);line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;min-height:0;overflow:hidden;}",
      ".wd-tile:hover{filter:brightness(1.25);}",
      ".wd-tile.wall{cursor:default;opacity:0.95;}",
      ".wd-tile .tface{display:flex;align-items:center;justify-content:center;width:100%;height:100%;line-height:1;transform:scale(1.18);}",
      ".wd-tile.wall:hover{filter:none;}",
      ".wd-tile.exit{border-color:var(--th-accent);box-shadow:inset 0 0 0 1px var(--th-accent);}",
      ".wd-tile.gather{box-shadow:inset 0 0 8px rgba(46,204,113,0.45);}",
      ".wd-tile.armed{outline:2px dashed #f1c40f;outline-offset:-2px;}",
      ".wd-tile.me{outline:2px solid var(--th-accent);outline-offset:-2px;}",
      ".wd-tile .tk{font-weight:800;font-size:clamp(13px,2.6vw,19px);background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.35);border-radius:999px;width:1.7em;height:1.7em;display:flex;align-items:center;justify-content:center;overflow:hidden;}",
      ".wd-tile .tk img{width:100%;height:100%;object-fit:cover;border-radius:999px;display:block;}",
      ".wd-tile .tk.duo{padding:0;}" +
      ".wd-tile .tk.duo .p1,.wd-tile .tk.duo .p2{flex:1 1 50%;min-width:0;height:100%;display:flex;align-items:center;justify-content:center;font-size:0.72em;overflow:hidden;}" +
      ".wd-tile .tk.duo img{width:100%;height:100%;object-fit:cover;display:block;}" +
      ".wd-nearby{display:inline-flex;gap:0.3rem;flex-wrap:wrap;align-items:center;flex:0 0 auto;}" +
      ".wd-nearby .wd-mini img{width:18px;height:18px;border-radius:50%;object-fit:cover;vertical-align:-4px;margin-right:0.15rem;}" +
      ".wd-npcmenu{position:fixed;z-index:300;min-width:176px;max-width:230px;display:flex;flex-direction:column;gap:0.3rem;padding:0.5rem;border-radius:14px;background:var(--th-modal,#161221);border:1px solid var(--th-accent,#7c5cd6);box-shadow:0 14px 40px -8px rgba(0,0,0,0.85);}" +
      ".wd-npcmenu-head{display:flex;align-items:center;gap:0.4rem;font-size:0.8rem;font-weight:700;padding:0.1rem 0.2rem 0.3rem;}" +
      ".wd-npcmenu-head img{width:26px;height:26px;border-radius:50%;object-fit:cover;}" +
      ".wd-npcmenu button{font:inherit;font-size:0.8rem;min-height:44px;border-radius:10px;border:1px solid var(--th-border,#3a3348);background:var(--th-surface,#1d1829);color:inherit;cursor:pointer;text-align:left;padding:0.4rem 0.6rem;}" +
      ".wd-npcmenu button:hover{border-color:var(--th-accent,#7c5cd6);}" +
      ".wd-tile .exb{position:absolute;right:2px;bottom:1px;font-size:0.58rem;font-weight:800;background:rgba(0,0,0,0.65);border-radius:5px;padding:0 3px;line-height:1.5;}",
      ".wd-tiles-bar{display:flex;gap:0.4rem;flex-wrap:wrap;align-items:center;padding:0.45rem 0.6rem;background:var(--th-field);border-top:1px solid var(--th-border);font-size:0.78rem;}",
      ".wd-tiles-legend{width:100%;font-size:0.72rem;opacity:0.75;}",
      ".wd-dpad{display:flex;gap:0.3rem;align-items:center;margin-left:auto;}",
      ".wd-dpad button{font:inherit;font-size:0.9rem;width:38px;height:38px;border-radius:10px;border:1px solid var(--th-border);background:var(--th-surface);color:inherit;cursor:pointer;}",
      ".wd-dpad button:hover{border-color:var(--th-accent);}"
    ].join("\n");
    document.head.appendChild(st);
  }

  var kbWired = false, kbCtx = null;
  function wireKeyboard(getCtx) {
    kbCtx = getCtx;
    if (kbWired) return;
    kbWired = true;
    document.addEventListener("keydown", function (e) {
      try {
        var ctx = kbCtx ? kbCtx() : null;
        if (!ctx || !ctx.active()) return;
        var a = document.activeElement;
        if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
        if (document.querySelector(".wd-shop")) return;
        var k = e.key;
        var dx = 0, dy = 0;
        if (k === "w" || k === "W" || k === "ArrowUp") dy = -1;
        else if (k === "s" || k === "S" || k === "ArrowDown") dy = 1;
        else if (k === "a" || k === "A" || k === "ArrowLeft") dx = -1;
        else if (k === "d" || k === "D" || k === "ArrowRight") dx = 1;
        else if (k === "Enter" || k === "e" || k === "E") { e.preventDefault(); ctx.confirm(); return; }
        else return;
        if (dx || dy) { e.preventDefault(); ctx.step(dx, dy); }
      } catch (err) {}
    });
  }

  function mount(el, ctx) {
    injectCss();
    if (!el || !ctx || !ctx.W) return;
    var W = ctx.W;
    backfill(W);
    var loc = null;
    for (var i = 0; i < W.locations.length; i++) if (W.locations[i].id === W.player.loc) loc = W.locations[i];
    if (!loc) { loc = W.locations[0]; W.player.loc = loc.id; }
    var map = loc.map;
    var theme = themeOf(loc.name);
    var armedExit = null;

    function npcsHere() {
      return (W.chars || []).filter(function (c) { return c.loc === loc.id; });
    }
    function adjacentNpc() {
      var px = W.player.tx, py = W.player.ty;
      // Radius ≤1: sebelahan ATAU se-ubin (nempel = tatap muka).
      return npcsHere().filter(function (c) {
        return Math.abs((c.tx || 0) - px) + Math.abs((c.ty || 0) - py) <= 1;
      });
    }
    function onExitTile() {
      var k = W.player.tx + "," + W.player.ty;
      return map.tiles[idx(W.player.tx, W.player.ty)] === "E" ? (map.exits[k] || null) : null;
    }
    function exitNames() {
      var seen = [], out = [];
      Object.keys(map.exits).forEach(function (k) {
        var id = map.exits[k];
        if (seen.indexOf(id) === -1) { seen.push(id); out.push(ctx.locName(id)); }
      });
      return out;
    }

    /* Menu aksi per orang: 1 tombol nama → pilih Ngobrol/Toko/Kerja (popup, tanpa pindah layout) */
    var npcMenuEl = null;
    function npcMenuOutside(ev) { try { if (npcMenuEl && !npcMenuEl.contains(ev.target)) closeNpcMenu(); } catch (eMO) {} }
    function closeNpcMenu() {
      try { if (npcMenuEl && npcMenuEl.parentNode) npcMenuEl.parentNode.removeChild(npcMenuEl); } catch (eMC) {}
      npcMenuEl = null;
      try { document.removeEventListener("pointerdown", npcMenuOutside, true); } catch (eML) {}
    }
    function openNpcMenu(cid, anchor) {
      closeNpcMenu();
      var c = null;
      try { (W.chars || []).forEach(function (x) { if (x && x.id === cid) c = x; }); } catch (eMF) {}
      if (!c) return;
      var avH = "";
      try { if (c.avatar && /^(data:image|https?:)/.test(c.avatar)) avH = "<img src='" + c.avatar + "' alt=''>"; } catch (eMA) {}
      var m = document.createElement("div");
      m.className = "wd-npcmenu";
      m.innerHTML = "<div class='wd-npcmenu-head'>" + (avH || "🧍") + " <b>" + esc(c.name) + "</b></div>" +
        "<button type='button' data-mact='talk'>💬 Ngobrol</button>" +
        "<button type='button' data-mact='shop'>🏪 Toko</button>" +
        "<button type='button' data-mact='work'>📜 Minta kerja</button>";
      document.body.appendChild(m);
      try {
        var r = anchor.getBoundingClientRect(), mw = 200, mh = 200;
        var x = Math.max(8, Math.min(window.innerWidth - mw - 8, r.left + r.width / 2 - mw / 2));
        var y = r.top - mh - 8;
        if (y < 8) y = r.bottom + 8;
        m.style.left = x + "px";
        m.style.top = y + "px";
      } catch (eMP) {}
      m.querySelectorAll("[data-mact]").forEach(function (b) {
        b.addEventListener("click", function (ev) {
          try { ev.stopPropagation(); } catch (eMS) {}
          var a = b.getAttribute("data-mact");
          closeNpcMenu();
          try {
            if (a === "talk") ctx.talkTo(cid);
            else if (a === "shop") ctx.shopOf(cid);
            else if (a === "work") ctx.workFor(cid);
          } catch (eMA2) {}
        });
      });
      npcMenuEl = m;
      try { setTimeout(function () { document.addEventListener("pointerdown", npcMenuOutside, true); }, 0); } catch (eML2) {}
    }

    function render() {
      closeNpcMenu(); // jangkar tombol bisa mati tiap render ulang
      var px = W.player.tx, py = W.player.ty;
      var byPos = {};
      npcsHere().forEach(function (c) {
        var k = c.tx + "," + c.ty;
        byPos[k] = byPos[k] || [];
        byPos[k].push(c);
      });
      var h = "<div class='wd-tiles'><div class='wd-tiles-grid'>";
      for (var y = 0; y < TH; y++) for (var x = 0; x < TW; x++) {
        var t = map.tiles[idx(x, y)];
        var cls = t === "#" ? "wall" : t === "E" ? "exit" : t === "G" ? "gather" : t === "S" ? "shop" : t === "D" ? "danger" : "floor";
        var isMe = (x === px && y === py);
        var lst = byPos[x + "," + y] || [];
        var inner = "<span class='tface'>" + tileFace(t, theme, loc.name) + "</span>";
        var badge = "";
        if (t === "E" && map.exits[x + "," + y]) {
          var dn = String(ctx.locName(map.exits[x + "," + y]) || "?");
          badge = "<span class='exb'>" + esc(dn.slice(0, 1).toUpperCase()) + "</span>";
        }
        if (isMe) inner = "<span class='tface'>🧍</span>";
        else if (lst.length) {
          // Semua penghuni SELALU terlihat di petanya sendiri (tanpa fog):
          // tampil-hilang berdasar jarak bikin dikira bug. (Dibatasi ke se-lokasi,
          // karena peta memang digambar per lokasi.)
          // Wajah asli bila portrait ada (data URL sudah di memori, tanpa unduh), huruf bila belum.
          // Satu ubin bisa dihuni 2+ orang: tampilkan 2 wajah berdampingan agar tidak dikira 1 orang.
          var duo = lst.slice(0, 2).map(function (person) {
            var f = esc(String((person && person.name) || "?").slice(0, 1).toUpperCase());
            try { if (person.avatar && /^(data:image|https?:)/.test(person.avatar)) f = "<img src='" + person.avatar + "' alt=''>"; } catch (eAv2) {}
            return f;
          });
          if (lst.length === 1) inner = "<span class='tk'>" + duo[0] + "</span>";
          else inner = "<span class='tk duo'><span class='p1'>" + duo[0] + "</span><span class='p2'>" + duo[1] + "</span></span>" + (lst.length > 2 ? "<span class='exb'>" + lst.length + "</span>" : "");
        }
        var nm = tileName(t, loc.name);
        if (isMe) nm = "kamu";
        else if (lst.length) nm = lst.map(function (c) { return c.name; }).join(", ");
        else if (t === "E" && map.exits[x + "," + y]) nm = "pintu ke " + ctx.locName(map.exits[x + "," + y]) + " (-6 energi, klik 2x)";
        var armed = (armedExit === x + "," + y) ? " armed" : "";
        h += "<button type='button' class='wd-tile " + cls + (isMe ? " me" : "") + armed + "' data-x='" + x + "' data-y='" + y + "' title='" + esc(nm) + "' style='background:" + tileBg(t, theme, x, y) + ";'>" + inner + badge + "</button>";
      }
      h += "</div><div class='wd-tiles-bar'>";
      var exitId = onExitTile();
      var exList = exitNames();
      if (exitId) h += "<span>🚪 <b>" + esc(ctx.locName(exitId)) + "</b> — <span class='wd-hint'>Enter/E / klik lagi = pergi (−6 ⚡)</span></span>";
      else h += "<span>🗺️ <b>" + esc(loc.name) + "</b>" + (exList.length ? " <span class='wd-hint'>🚪 " + esc(exList.join(" · ")) + "</span>" : "") + "</span>";
      var adj = adjacentNpc();
      // Satu tombol per orang (pencet nama → pilih aksi). Hemat tempat, ganti 3 tombol/orang.
      if (adj.length) {
        h += "<span class='wd-nearby'>" + adj.map(function (c) {
          var av2 = "";
          try { if (c.avatar && /^(data:image|https?:)/.test(c.avatar)) av2 = "<img src='" + c.avatar + "' alt=''>"; } catch (eA4) {}
          return "<button type='button' class='wd-mini' data-npcmenu='" + c.id + "'>" + (av2 || "🧍") + " " + esc(c.name) + "</button>";
        }).join("") + "</span>";
      }
      h += "<span class='wd-dpad'><button type='button' data-d='up' aria-label='atas'>▲</button><button type='button' data-d='left' aria-label='kiri'>◀</button><button type='button' data-d='go' aria-label='pergi'>⏎</button><button type='button' data-d='right' aria-label='kanan'>▶</button><button type='button' data-d='down' aria-label='bawah'>▼</button></span>";
      h += "<div class='wd-tiles-legend'>🧱 tembok · " + (theme === "town" ? "🪨 bebatuan" : "🌲 area bahaya") + " · 🌿 gather · 🚪 pintu (" + (exList.length ? esc(exList.join(", ")) : "—") + ") · " + (isForgeName(loc.name) ? "🔨 tempat kerja" : "🏪 tempat istirahat") + " — WASD/klik untuk jalan (gratis).</div>";
      h += "</div></div>";
      el.innerHTML = h;
      el.querySelectorAll(".wd-tile").forEach(function (b) {
        b.addEventListener("click", function () {
          tapTile(Number(b.getAttribute("data-x")), Number(b.getAttribute("data-y")));
        });
      });
      el.querySelectorAll("[data-npcmenu]").forEach(function (b) {
        b.addEventListener("click", function (ev) {
          try { ev.stopPropagation(); } catch (eSN) {}
          openNpcMenu(b.getAttribute("data-npcmenu"), b);
        });
      });
      el.querySelectorAll("[data-d]").forEach(function (b) {
        b.addEventListener("click", function () {
          var d = b.getAttribute("data-d");
          if (d === "up") step(0, -1);
          else if (d === "down") step(0, 1);
          else if (d === "left") step(-1, 0);
          else if (d === "right") step(1, 0);
          else confirm();
        });
      });
    }

    function persist() { try { ctx.save(); } catch (e) {} }

    function step(dx, dy) {
      var nx = W.player.tx + dx, ny = W.player.ty + dy;
      if (!inB(nx, ny)) return;
      var t = map.tiles[idx(nx, ny)];
      if (!walkable(t)) { try { ctx.toast("🧱 Kehalang tembok."); } catch (e) {} return; }
      W.player.tx = nx; W.player.ty = ny;
      armedExit = null;
      var k = nx + "," + ny;
      if (t === "E" && map.exits[k]) {
        armedExit = k;
        try { ctx.toast("🚪 Klik lagi / Enter untuk pergi ke " + ctx.locName(map.exits[k]) + " (−6 ⚡)."); } catch (e2) {}
      } else if (t === "G") {
        try { ctx.toast("🌿 Titik gather — tekan 🔍 Jelajah."); } catch (e3) {}
      } else if (theme === "wild" && (t === "D" || t === ".")) {
        // Encounter nempel ke langkah (bukan tombol): tile bahaya selalu gilir pity,
        // jalan biasa 12% ikut gilir. Pit-nya dihitung di worldsim (doStepEncounter).
        if (t === "D" || Math.random() < 0.12) { persist(); render(); try { if (ctx.onTileStep) ctx.onTileStep(t); else if (ctx.onDangerStep) ctx.onDangerStep(); } catch (e4) {} return; }
      }
      persist(); render();
      try { if (ctx.refreshNearby) ctx.refreshNearby(); } catch (eRN) {}
    }

    function tapTile(x, y) {
      var px = W.player.tx, py = W.player.ty;
      var dist = Math.abs(x - px) + Math.abs(y - py);
      if (dist === 0) { confirm(); return; }
      if (dist === 1) { step(x - px, y - py); return; }
      try { ctx.toast("Klik tile sebelahan untuk jalan."); } catch (e) {}
    }

    function confirm() {
      var exitId = onExitTile();
      if (exitId) ctx.travelTo(exitId);
    }

    wireKeyboard(function () {
      return {
        active: function () {
          try { return !!ctx.active(); } catch (e) { return false; }
        },
        step: step, confirm: confirm
      };
    });

    render();
  }

  window.WorldTiles = { v2: true, TW: TW, TH: TH, backfill: backfill, mount: mount };
})();
