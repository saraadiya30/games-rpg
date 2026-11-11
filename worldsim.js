/* ===== 🌍 Living World — world builder + cast + stage + god ====
   One active world (kv t2iWorld/active), linear + time travel:
   - Setup: name, genre, LANGUAGE (locked), premise, rules, locations
   - Cast of 4-6 characters: locations, affinity, per-character memory + world memory
   - Stage: feed + location tags; same-location chars may chime in; moves
     broadcast as system; click a character = talk focus; automatic ambient
   - Player mode (join as a character) vs god mode (god-assistant panel, free orders;
     destructive ones get a soft warning first, but OBEY when the user insists)
   - Checkpoint every 10 events; go back in time (cut + archive); skip forward
   - Images: character portraits + per-message pictures (e.g. blacksmith weapon)
   UI chrome is bilingual (EN default, ID toggle) via T(); story content follows the
   world's language via C(). Lazy via ensureWorld -> window.__worldOnShow.
   =========================================================================== */
(function () {
  "use strict";
  if (window.__worldBooted) return;
  window.__worldBooted = true;

 var KV_FOLDER = "t2iWorld", KV_KEY = "active";
 var MAX_CHARS = 6, MAX_FEED = 200, MAX_MEM = 25, MAX_WMEM = 40, MAX_CP = 12;
 var CP_EVERY = 10;
 var ROT_MIN_TICKS = 4, ROT_CHANCE = 0.22, EX_MAX = 20;

  /* ===== Fantasy RPG: survival + economy (fantasy-only for now) ===== */
  var START_COINS = 20, START_FULL = 100, START_ENERGY = 100, START_HP = 100, START_MANA = 30;
  var MAX_ITEMS_P = 12, MAX_ITEMS_N = 10;
  var OFFER_COOLDOWN_MS = 20 * 60 * 1000;
  /* ===== GAME v2: level / rank / combat / encounter (konteks tetap sama) ===== */
 var XP_BASE = 20;
  var GOAL_LEVEL = 4, GOAL_KILLS = 5, GOAL_COINS = 500;
  function pLevel() { try { return Math.max(1, Math.round(Number(W && W.player && W.player.level) || 1)); } catch (e) { return 1; } }
  function xpNeed(lv) { return XP_BASE * Math.max(1, lv || 1); }
  function rankOf(lv) { if (lv >= 11) return "S"; if (lv >= 8) return "A"; if (lv >= 6) return "B"; if (lv >= 4) return "C"; if (lv >= 2) return "D"; return "E"; }
  /* ===== GEAR: senjata & perisai yang bisa DIPILIH + DIPASANG =====
     Tas boleh berisi banyak senjata; yang kepakai saat tarung = yang terpasang
     (W.player.equip = {weapon, shield}). Tanpa pasangan = fallback lama
     (bonus terbaik di tas) agar save lama tetap jalan. */
  var GEAR_POWER = { "pedang besi": 8, "pedang baja": 12, "kapak perang": 10, "busur pemburu": 6, "belati tajam": 5, "tongkat archmage": 5, "tongkat sihir": 2 };
  var GEAR_ARMOR = { "perisai besi": 5, "zirah kulit": 4, "perisai kayu": 3 };
  function gearKey(s) { return String(s == null ? "" : s).toLowerCase().trim(); }
  function gearPowerFor(name) {
    var s = gearKey(name);
    if (GEAR_POWER[s] != null) return GEAR_POWER[s];
    if (/pedang|sword|parang|belati|dagger|busur|bow|kapak|axe|tombak|spear/.test(s)) return 4;
    if (/tongkat|staff|jimat|amulet/.test(s)) return 2;
    return 0;
  }
  function gearArmorFor(name) {
    var s = gearKey(name);
    if (GEAR_ARMOR[s] != null) return GEAR_ARMOR[s];
    if (/perisai|shield|armor|zirah|helm/.test(s)) return 3;
    return 0;
  }
  function gearSlotFor(name) {
    if (gearArmorFor(name) > 0) return "shield";
    if (gearPowerFor(name) > 0) return "weapon";
    return null;
  }
  function isGear(name) { return !!gearSlotFor(name); }
  function equippedWeapon() { try { return (W && W.player && W.player.equip && W.player.equip.weapon) || null; } catch (e) { return null; } }
  function equippedShield() { try { return (W && W.player && W.player.equip && W.player.equip.shield) || null; } catch (e) { return null; } }
  function ensureEquip() {
    try {
      if (!W || !W.player) return null;
      if (!W.player.equip || typeof W.player.equip !== "object") W.player.equip = { weapon: null, shield: null };
      ["weapon", "shield"].forEach(function (sl) {
        var cur = W.player.equip[sl];
        if (cur && !countItem(W.player, cur)) W.player.equip[sl] = null;
      });
      return W.player.equip;
    } catch (e) { return null; }
  }
  function weaponPower() {
    try {
      var eq = equippedWeapon();
      if (eq && countItem(W.player, eq)) return gearPowerFor(eq);
      var items = (W && W.player && W.player.items) || [];
      var b = 0;
      items.forEach(function (x) { b = Math.max(b, gearPowerFor(x)); });
      return b;
    } catch (e) { return 0; }
  }
 function armorReduce() {
   try {
     var eq2 = equippedShield();
     if (eq2 && countItem(W.player, eq2)) return gearArmorFor(eq2);
     var items2 = (W && W.player && W.player.items) || [];
     var best = 0;
     for (var i = 0; i < items2.length; i++) best = Math.max(best, gearArmorFor(items2[i]));
     return best;
   } catch (e) { return 0; }
 }
  // Pasang gear dari tas ke slot (senjata/perisai). Efek langsung: weaponPower/
  // armorReduce/staffBoost membaca slot ini. Feed dicatat seperti aksi lain.
  function equipItem(itemName) {
    if (!W || !W.player) return { ok: false };
    var bag = W.player.items || [];
    var want = gearKey(itemName), found = null, i, j;
    for (i = 0; i < bag.length; i++) if (gearKey(bag[i]) === want) { found = bag[i]; break; }
    if (!found) for (j = 0; j < bag.length; j++) { var lx = gearKey(bag[j]); if (want && (lx.indexOf(want) !== -1 || want.indexOf(lx) !== -1)) { found = bag[j]; break; } }
    if (!found) return { ok: false, why: "noitem" };
    var slot = gearSlotFor(found);
    if (!slot) return { ok: false, why: "notgear" };
    ensureEquip();
    W.player.equip[slot] = found;
    var en = WL() === "en";
    pushFeed({ kind: "chat", who: W.player.name, mine: true, loc: W.player.loc, text: (en ? "*equips " + found + (slot === "weapon" ? " (+" + gearPowerFor(found) + " ATK)" : " (-" + gearArmorFor(found) + " dmg)") + "*" : "*memasang " + found + (slot === "weapon" ? " (+" + gearPowerFor(found) + " serangan)" : " (-" + gearArmorFor(found) + " damage)") + "*") });
    save(); return { ok: true, item: found, slot: slot };
  }
  function unequip(slot) {
    if (!W || !W.player) return { ok: false };
    ensureEquip();
    if (slot !== "weapon" && slot !== "shield") return { ok: false };
    var cur = W.player.equip[slot];
    if (!cur) return { ok: false, why: "empty" };
    W.player.equip[slot] = null;
    var en = WL() === "en";
    pushFeed({ kind: "chat", who: W.player.name, mine: true, loc: W.player.loc, text: (en ? "*unequips " + cur + "*" : "*melepas " + cur + "*") });
    save(); return { ok: true, item: cur };
  }
  /* ===== MAGIC v2: pilih jenis sihir + mekanik elemen =====
     6 sihir, tiap elemen punya rasa main beda:
     🔥 Api = burn DoT · 🌪️ Angin = murah + crit · ❄️ Es = freeze (skip balasan)
     🪨 Tanah = guard (balasan berikut −6) · ⚡ Petir = liar + stun · ✨ Cahaya = damage + heal
     Efektivitas: super efektif ×1.5 · resist ×0.7 · afinitas elemen player +15%.
     Dibuka bertahap per level biar ada progresi: 1/1/2/3/4/6.
     ============================================================ */
  var ELEM_INFO = {
    api: { emoji: "🔥", en: "Fire", id: "Api" },
    angin: { emoji: "🌪️", en: "Wind", id: "Angin" },
    es: { emoji: "❄️", en: "Ice", id: "Es" },
    tanah: { emoji: "🪨", en: "Earth", id: "Tanah" },
    petir: { emoji: "⚡", en: "Lightning", id: "Petir" },
    cahaya: { emoji: "✨", en: "Holy", id: "Cahaya" },
    alam: { emoji: "🌿", en: "Nature", id: "Alam" },
    gelap: { emoji: "🌑", en: "Dark", id: "Gelap" },
    biasa: { emoji: "⚪", en: "Normal", id: "Biasa" }
  };
  var MAGICS = [
    { id: "api", elem: "api", emoji: "🔥", en: "Fireburst", idn: "Semburan Api", cost: 15, power: 15, lvl: 1, effect: "burn", descEN: "Burn +6/turn x2", descID: "Bakar +6/giliran x2" },
    { id: "angin", elem: "angin", emoji: "🌪️", en: "Wind Blade", idn: "Pisau Angin", cost: 12, power: 12, lvl: 1, effect: "swift", descEN: "Cheap, 30% crit x1.8", descID: "Murah, 30% crit x1.8" },
    { id: "es", elem: "es", emoji: "❄️", en: "Frost Arrow", idn: "Panah Es", cost: 15, power: 14, lvl: 2, effect: "freeze", descEN: "30% freeze: foe skips counter", descID: "30% beku: musuh skip balasan" },
    { id: "tanah", elem: "tanah", emoji: "🪨", en: "Stone Crash", idn: "Reruntuhan Batu", cost: 18, power: 19, lvl: 3, effect: "guard", descEN: "Guard: next counter -6", descID: "Tahan: balasan berikut -6" },
    { id: "petir", elem: "petir", emoji: "⚡", en: "Lightning Strike", idn: "Sengatan Petir", cost: 20, power: 21, lvl: 4, effect: "stun", descEN: "Wild dmg, 20% stun", descID: "Damage liar, 20% stun" },
    { id: "cahaya", elem: "cahaya", emoji: "✨", en: "Holy Light", idn: "Cahaya Suci", cost: 22, power: 20, lvl: 6, effect: "heal", descEN: "Heal self +18 HP", descID: "Pulihkan +18 HP" }
  ];
  function magicById(id) {
    for (var i = 0; i < MAGICS.length; i++) if (MAGICS[i].id === id) return MAGICS[i];
    return null;
  }
 function magicName(m) { if (!m) return ""; return (WL() === "en") ? m.en : m.idn; }
 function elemLabel(e) { var m = ELEM_INFO[e] || ELEM_INFO.biasa; return m.emoji + " " + ((WL() === "en") ? m.en : m.id); }
  // Kitab sihir (dibeli di shop) membuka sihir lebih awal tanpa nunggu level.
  var TOME_PRICE = { api: 60, angin: 60, es: 120, tanah: 180, petir: 250, cahaya: 400 };
  function tomeNameFor(spellId) {
    var m = magicById(spellId); if (!m) return "";
    var elemWord = ((ELEM_INFO[m.elem] || {}).id) || m.id;
    return "Kitab " + elemWord;
  }
  function spellIdForTome(itemName) {
    var s = String(itemName || "").toLowerCase();
    if (!/kitab|tome|scroll|buku sihir|buku/.test(s)) return null;
    if (/api|fire/.test(s)) return "api";
    if (/angin|wind/.test(s)) return "angin";
    if (/(^|[^a-z])es([^a-z]|$)|ice|frost|beku/.test(s)) return "es";
    if (/tanah|earth|batu|stone/.test(s)) return "tanah";
    if (/petir|lightning|thunder/.test(s)) return "petir";
    if (/cahaya|holy|suci|light/.test(s)) return "cahaya";
    return null;
  }
  function hasSpell(id) {
    var m = magicById(id); if (!m) return false;
    try { if (m.lvl <= pLevel()) return true; } catch (e) {}
    try { var t = (W && W.player && W.player.tomes) || []; return t.indexOf(id) !== -1; } catch (e2) { return false; }
  }
  function unlockedMagics() {
    var out = [];
    for (var i = 0; i < MAGICS.length; i++) if (hasSpell(MAGICS[i].id)) out.push(MAGICS[i]);
    if (out.length) return out;
    // Fallback: level-based (save sangat lama / W belum ada)
    var lv = 1; try { lv = pLevel(); } catch (e) {}
    for (var j = 0; j < MAGICS.length; j++) if (MAGICS[j].lvl <= lv) out.push(MAGICS[j]);
    return out.length ? out : [MAGICS[0]];
  }
  function playerSpell() {
    try {
      var s = W && W.player ? magicById(W.player.spell) : null;
      if (s && hasSpell(s.id)) return s;
    } catch (e) {}
    var u = unlockedMagics();
    return u[u.length - 1];
  }
  // Tongkat menambah damage sihir (flat, ditambah setelah mult elemen).
  // Yang terpasang diutamakan; tanpa pasangan = terbaik di tas.
  function staffBoost() {
    try {
      var eq = equippedWeapon();
      if (eq && countItem(W.player, eq)) {
        var s0 = gearKey(eq);
        if (/tongkat archmage|archmage staff/.test(s0)) return 5;
        if (/tongkat sihir|magic staff/.test(s0)) return 2;
        return 0;
      }
      var items = (W && W.player && W.player.items) || [];
      var b = 0;
      for (var i = 0; i < items.length; i++) {
        var s = String(items[i]).toLowerCase();
        if (/tongkat archmage|archmage staff/.test(s)) b = Math.max(b, 5);
        else if (/tongkat sihir|magic staff/.test(s)) b = Math.max(b, 2);
      }
      return b;
    } catch (e) { return 0; }
  }
  // Chart: penyerang -> { bertahan: mult }. Selain itu = 1.0 (netral).
  var ELEM_CHART = {
    api: { alam: 1.5, es: 1.5, angin: 1.5, tanah: 0.7, api: 0.7 },
    es: { tanah: 1.5, angin: 1.5, alam: 1.5, api: 0.7, es: 0.7 },
    petir: { es: 1.5, alam: 1.4, angin: 1.3, tanah: 0.7, petir: 0.7 },
    angin: { tanah: 1.5, alam: 1.2, api: 0.7, petir: 0.8 },
    tanah: { petir: 1.5, api: 1.4, es: 0.7, angin: 0.7 },
    cahaya: { gelap: 1.6, biasa: 1.1 }
  };
  function elemMult(att, def) {
    if (!def || def === "biasa") return (att === "cahaya") ? 1.1 : 1;
    if (att === def) return 0.7;
    try { var row = ELEM_CHART[att]; if (row && isFinite(row[def])) return row[def]; } catch (e) {}
    if (def === "gelap") return (att === "cahaya") ? 1.6 : 0.9;
    if (def === "alam") return (att === "api" || att === "es") ? 1.5 : 1;
    return 1;
  }
  function weakHint(defElem) {
    var out = [];
    var keys = ["api", "es", "petir", "angin", "tanah", "cahaya"];
    for (var i = 0; i < keys.length; i++) if (elemMult(keys[i], defElem) >= 1.4) out.push(keys[i]);
    return out;
  }
  function spellFromWord(w) {
    var s = String(w || "").toLowerCase().trim();
    // Exact dulu (anti substring nyasar: "tapi" bukan api, "desk" bukan es).
    var exact = { api: "api", fire: "api", angin: "angin", wind: "angin", es: "es", ice: "es", frost: "es", beku: "es", tanah: "tanah", earth: "tanah", batu: "tanah", petir: "petir", lightning: "petir", cahaya: "cahaya", holy: "cahaya", suci: "cahaya" };
    if (exact[s]) return magicById(exact[s]);
    if (/\b(api|fire|flame|blaze|burn)\b/.test(s)) return magicById("api");
    if (/\b(es|ice|frost|beku|frozen|water|air)\b/.test(s)) return magicById("es");
    if (/\b(petir|lightning|thunder|listrik|volt)\b/.test(s)) return magicById("petir");
    if (/\b(angin|wind|storm|blade)\b/.test(s)) return magicById("angin");
    if (/\b(tanah|earth|stone|rock|batu)\b/.test(s)) return magicById("tanah");
    if (/\b(cahaya|holy|light|suci|heal)\b/.test(s)) return magicById("cahaya");
    return null;
  }
 function monsterTableFor(locN) {
   var s = String(locN || "").toLowerCase();
   if (/hutan|forest|kabut/.test(s)) return [
      { name: "Slime Hutan", hp: 30, atkMin: 5, atkMax: 9, xp: 18, coinsMin: 4, coinsMax: 9, loot: ["Herbal", "Kayu"], elem: "alam" },
      { name: "Serigala Kabut", hp: 46, atkMin: 8, atkMax: 13, xp: 26, coinsMin: 7, coinsMax: 13, loot: ["Herbal", "Herbal", "Kayu"], elem: "angin" }
   ];
   if (/dungeon|gerbang|gate|gua|tambang|kuburan/.test(s)) return [
      { name: "Tikus Gua", hp: 26, atkMin: 5, atkMax: 10, xp: 16, coinsMin: 3, coinsMax: 8, loot: ["Besi", "Kayu"], elem: "biasa" },
      { name: "Golem Batu", hp: 62, atkMin: 10, atkMax: 16, xp: 34, coinsMin: 12, coinsMax: 20, loot: ["Besi", "Besi"], elem: "tanah" }
   ];
   if (/menara|tower|perpustakaan/.test(s)) return [
      { name: "Gagak Menara", hp: 24, atkMin: 4, atkMax: 8, xp: 14, coinsMin: 2, coinsMax: 6, loot: ["Herbal"], elem: "gelap" }
   ];
   return [
      { name: "Berandal Pasar", hp: 28, atkMin: 5, atkMax: 9, xp: 15, coinsMin: 5, coinsMax: 11, loot: ["Roti", "Herbal"], elem: "biasa" }
   ];
 }
  function spawnMonster(forceLocId) {
    if (!W || !W.player) return null;
    var locId = forceLocId || W.player.loc;
    var locN = locName(locId);
    var table = monsterTableFor(locN);
    var m = table[Math.floor(Math.random() * table.length)];
    var day = (W.clock && W.clock.day) || 1;
    var isBoss = ((((Number(W.player.kills) || 0)) + 1) % 5 === 0);
    var hp = m.hp + day * 2;
    var atkMin = m.atkMin + Math.floor(day / 3), atkMax = m.atkMax + Math.floor(day / 3);
    var xp = m.xp, cMin = m.coinsMin, cMax = m.coinsMax;
    if (isBoss) {
      hp = Math.round(hp * 2.2); atkMin += 2; atkMax += 2;
      xp = m.xp * 3; cMin = m.coinsMin * 2; cMax = m.coinsMax * 2;
    }
   W.encounter = { id: uid("m"), name: m.name, hp: hp, maxHp: hp, atkMin: atkMin, atkMax: atkMax, xp: xp, coinsMin: cMin, coinsMax: cMax, loot: m.loot.slice(), loc: locId, turn: 0, boss: isBoss };
    try {
      W.encounter.elem = m.elem || "biasa";
      W.encounter.status = { burn: 0, guard: 0, skip: false };
    } catch (eSt) {}
   if (isBoss) pushFeed({ kind: "system", loc: locId, text: (WL() === "en" ? "👹 A hulking ALPHA " + m.name + " blocks your path! (HP " + hp + ") — big risk, big reward!" : "👹 RAJA " + m.name + " yang buas menghadang! (HP " + hp + ") — risiko besar, hadiah besar!") });
    save();
    try { if (!monImgGet(m.name)) monImgFor(m.name); } catch (e) {}
    return W.encounter;
  }
  var RANK_ORDER = { E: 0, D: 1, C: 2, B: 3, A: 4, S: 5 };
 /* ===== ACHIEVEMENTS: daftar gampang ditambah - 1 entri = 1 piala.
    Cara nambah: copy satu blok {...}, ganti id/ico/nama/deskripsi/need/cur.
    checkAch() otomatis mengecek semua tiap ada aksi (via pushFeed) + klaim
    + mengumumkan di feed. Tanpa reward kecuali ditulis eksplisit. ===== */
 var ACH = [
   { id: "legenda", ico: "🏆", need: 3,
     n: { en: "Living Legend", id: "Legenda Hidup" },
     d: { en: "Reach Lv4 + 5 kills + 500 coins at once", id: "Capai Lv4 + 5 kill + 500 koin sekaligus" },
     cur: function (p) { var s = 0; if (pLevel() >= GOAL_LEVEL) s++; if ((Number(p.kills) || 0) >= GOAL_KILLS) s++; if ((Number(p.coins) || 0) >= GOAL_COINS) s++; return s; },
     reward: { maxHp: 25, heal: true } },
   { id: "first-blood", ico: "🔪", need: 1,
     n: { en: "First Blood", id: "Darah Pertama" },
     d: { en: "Defeat your first monster", id: "Kalahkan monster pertamamu" },
     cur: function (p) { return Number(p.kills) || 0; } },
   { id: "hunter", ico: "⚔️", need: 10,
     n: { en: "Monster Hunter", id: "Pemburu Monster" },
     d: { en: "Defeat 10 monsters", id: "Kalahkan 10 monster" },
     cur: function (p) { return Number(p.kills) || 0; } },
   { id: "slayer", ico: "👹", need: 25,
     n: { en: "Monster Slayer", id: "Penakluk Monster" },
     d: { en: "Defeat 25 monsters", id: "Kalahkan 25 monster" },
     cur: function (p) { return Number(p.kills) || 0; } },
   { id: "alpha", ico: "💀", need: 1,
     n: { en: "Alpha Slayer", id: "Penakluk Alfa" },
     d: { en: "Crush a BOSS monster", id: "Hancurkan monster BOSS" },
     cur: function (p) { return statGet("boss"); } },
   { id: "alpha-king", ico: "👑", need: 3,
     n: { en: "Boss King", id: "Raja Pemburu" },
     d: { en: "Crush 3 BOSS monsters", id: "Hancurkan 3 monster BOSS" },
     cur: function (p) { return statGet("boss"); } },
   { id: "rich", ico: "🪙", need: 1000,
     n: { en: "Fat Purse", id: "Juragan" },
     d: { en: "Hold 1000 coins at once", id: "Pegang 1000 koin sekaligus" },
     cur: function (p) { return Number(p.coins) || 0; } },
   { id: "sultan", ico: "💰", need: 2500,
     n: { en: "Sultan", id: "Sultan" },
     d: { en: "Hold 2500 coins at once", id: "Pegang 2500 koin sekaligus" },
     cur: function (p) { return Number(p.coins) || 0; } },
   { id: "veteran", ico: "🎖️", need: 6,
     n: { en: "Veteran (Rank B)", id: "Veteran (Rank B)" },
     d: { en: "Reach Lv6", id: "Capai Lv6" },
     cur: function (p) { return pLevel(); } },
   { id: "myth", ico: "🌟", need: 11,
     n: { en: "Living Myth (Rank S)", id: "Mitos Hidup (Rank S)" },
     d: { en: "Reach Lv11", id: "Capai Lv11" },
     cur: function (p) { return pLevel(); } },
   { id: "hand", ico: "🤝", need: 3,
     n: { en: "Trusted Hand", id: "Tangan Terpercaya" },
     d: { en: "Finish 3 quests", id: "Selesaikan 3 quest" },
     cur: function (p) { return questsDone(); } },
   { id: "hero", ico: "🛡️", need: 10,
     n: { en: "Village Hero", id: "Pahlawan Desa" },
     d: { en: "Finish 10 quests", id: "Selesaikan 10 quest" },
     cur: function (p) { return questsDone(); } },
   { id: "traveler", ico: "🧭", need: 5,
     n: { en: "Wanderer", id: "Pengelana" },
     d: { en: "Set foot in 5 different places", id: "Singgah di 5 tempat berbeda" },
     cur: function (p) { return visitedCount(); } },
   { id: "trotter", ico: "🥾", need: 25,
     n: { en: "Iron Trekker", id: "Petualang Gigih" },
     d: { en: "Travel 25 times", id: "Bepergian 25 kali" },
     cur: function (p) { return statGet("travel"); } },
   { id: "gatherer", ico: "🌿", need: 30,
     n: { en: "Master Forager", id: "Pengumpul Ulung" },
     d: { en: "Gather 30 times", id: "Jelajah 30 kali" },
     cur: function (p) { return statGet("gather"); } },
   { id: "mage", ico: "✨", need: 20,
     n: { en: "True Mage", id: "Penyihir Sejati" },
     d: { en: "Cast 20 spells", id: "Rapalkan 20 sihir" },
     cur: function (p) { return statGet("spell"); } }
 ];
 function statGet(k) { try { return Number(W.player.stat[k]) || 0; } catch (e) { return 0; } }
 function bumpStat(k, n) {
   try {
     if (!W || !W.player) return;
     if (!W.player.stat || typeof W.player.stat !== "object") W.player.stat = {};
     W.player.stat[k] = (Number(W.player.stat[k]) || 0) + (n == null ? 1 : n);
   } catch (e) {}
 }
 function questsDone() { try { return (W.quests || []).filter(function (q) { return q.state === "done"; }).length; } catch (e) { return 0; } }
 function visitedCount() { try { return Object.keys((W && W.player && W.player.visited) || {}).length; } catch (e) { return 0; } }
 var __achBusy = false;
 function checkAch() {
   if (__achBusy || !W || !W.player || W.genre !== "fantasy") return;
   var p = W.player, en = WL() === "en", fresh = [];
   __achBusy = true;
   try {
     for (var i = 0; i < ACH.length; i++) {
       var a = ACH[i];
       if (p.ach && p.ach[a.id]) continue;
       if (a.id === "legenda" && p.legendClaimed) { p.ach.legenda = 1; continue; }
       var c = 0;
       try { c = Number(a.cur(p)) || 0; } catch (eC) { c = 0; }
       if (c < a.need) continue;
       if (!p.ach || typeof p.ach !== "object") p.ach = {};
       p.ach[a.id] = 1;
       try {
         if (a.reward) {
           if (a.reward.maxHp) p.maxHp = Math.min(250, (Number(p.maxHp) || 100) + a.reward.maxHp);
           if (a.reward.coins) p.coins = Math.max(0, (Number(p.coins) || 0) + a.reward.coins);
           if (a.reward.heal) p.hp = p.maxHp;
         }
       } catch (eR) {}
       fresh.push(a);
     }
   } finally { __achBusy = false; }
   for (var j = 0; j < fresh.length; j++) {
     var f = fresh[j];
     if (f.id === "legenda") {
       try { p.legendClaimed = true; } catch (eL) {}
       pushFeed({ kind: "system", loc: p.loc, text: (en ? "🏆 LEGEND ACHIEVED! Lv4 + 5 kills + 500 coins — songs will be sung of you. (+25 maxHP, fully healed)" : "🏆 LEGENDA TERCAPAI! Lv4 + 5 kill + 500 koin — namamu akan dinyanyikan para bard. (+25 maxHP permanen, HP pulih penuh)") });
     } else {
       pushFeed({ kind: "system", loc: p.loc, text: (en ? "🏆 Achievement unlocked: " + f.ico + " " + f.n.en + " — " + f.d.en : "🏆 Achievement dibuka: " + f.ico + " " + f.n.id + " — " + f.d.id) });
     }
   }
 }
 // Daftar achievement + progres buat panel piala (UI saja, baca state).
 function achList() {
   var out = [], en = WL() === "en", p = (W && W.player) || {};
   for (var i = 0; i < ACH.length; i++) {
     var a = ACH[i], c = 0;
     try { c = Math.max(0, Number(a.cur(p)) || 0); } catch (eC) {}
     var done = false;
     try { done = !!(p.ach && p.ach[a.id]); } catch (eD) {}
     out.push({ id: a.id, ico: a.ico, name: en ? a.n.en : a.n.id, desc: en ? a.d.en : a.d.id, cur: Math.min(c, a.need), need: a.need, done: done });
   }
   return out;
 }
 function checkLegend() {
   try { checkAch(); } catch (eCL) {}
 }
 function gainXp(n) {
   if (!W || !W.player) return false;
   n = Math.max(0, Math.round(Number(n) || 0));
   if (!n) return false;
   var r0 = rankOf(pLevel());
   W.player.xp = Math.round((Number(W.player.xp) || 0) + n);
   var leveled = false;
   while ((Number(W.player.xp) || 0) >= xpNeed(pLevel())) {
     W.player.xp -= xpNeed(pLevel());
     W.player.level = pLevel() + 1;
     W.player.maxHp = Math.min(200, (Number(W.player.maxHp) || 100) + 10);
     W.player.hp = W.player.maxHp;
     W.player.energy = clampStat((Number(W.player.energy) || 0) + 30);
     leveled = true;
   }
   if (leveled) {
     pushFeed({ kind: "system", loc: W.player.loc, text: (WL() === "en" ? "⭐ LEVEL UP! You are now Lv " + pLevel() + " (Rank " + rankOf(pLevel()) + "). HP restored." : "⭐ NAIK LEVEL! Kamu sekarang Lv " + pLevel() + " (Rank " + rankOf(pLevel()) + "). HP pulih penuh.") });
     var r1 = rankOf(pLevel());
     if (!Array.isArray(W.player.rankClaimed)) W.player.rankClaimed = [];
     if ((RANK_ORDER[r1] || 0) > (RANK_ORDER[r0] || 0) && W.player.rankClaimed.indexOf(r1) === -1) {
       W.player.rankClaimed.push(r1);
       W.player.maxHp = Math.min(250, (Number(W.player.maxHp) || 100) + 10);
       pushFeed({ kind: "system", loc: W.player.loc, text: (WL() === "en" ? "🎖️ RANK UP to " + r1 + "! Your body hardens. (+10 maxHP)" : "🎖️ RANK NAIK ke " + r1 + "! Tubuhmu mengeras. (+10 maxHP permanen)") });
     }
   }
   try { checkLegend(); } catch (eL) {}
   return true;
 }

 function shopTemplateFor(c) {
   var r = String((c && c.role) || "").toLowerCase();
   var n = String((c && c.name) || "").toLowerCase();
   if (/blacksmith|bengkel|forge|tempa|dwarf|bara|grom|krom/.test(r + " " + n)) {
     return { coins: 200, stock: [
       { name: "Belati Tajam", price: 45, qty: 2 },
       { name: "Pedang Besi", price: 100, qty: 2 },
       { name: "Busur Pemburu", price: 95, qty: 2 },
       { name: "Pedang Baja", price: 180, qty: 1 },
       { name: "Kapak Perang", price: 140, qty: 1 },
       { name: "Perisai Kayu", price: 60, qty: 2 },
       { name: "Perisai Besi", price: 110, qty: 1 },
       { name: "Zirah Kulit", price: 85, qty: 2 },
        { name: "Tongkat Sihir", price: 80, qty: 2 },
        { name: "Tongkat Archmage", price: 220, qty: 1 },
        { name: "Kitab Api", price: 60, qty: 1 },
        { name: "Kitab Tanah", price: 180, qty: 1 },
       { name: "Besi Tempa", price: 30, qty: 5 },
       { name: "Jasa Perbaiki Senjata", price: 20, qty: 99, service: "repair" }
     ]};
   }
   if (/warung|kedai|stall|dewo|ibu|mira|tabib|healer|dukun/.test(r + " " + n)) {
     var isHeal = /tabib|healer|mira|dukun/.test(r + " " + n);
      if (isHeal) return { coins: 150, stock: [
        { name: "Ramuan HP", price: 15, qty: 4 },
        { name: "Ramuan HP Besar", price: 32, qty: 3 },
        { name: "Ramuan Energi", price: 12, qty: 4 },
        { name: "Ramuan Energi Besar", price: 25, qty: 3 },
        { name: "Ramuan Mana", price: 12, qty: 4 },
        { name: "Ramuan Mana Besar", price: 28, qty: 3 },
        { name: "Penawar Racun", price: 18, qty: 3 },
        { name: "Elixir Petualang", price: 28, qty: 2 },
        { name: "Kitab Es", price: 120, qty: 1 },
        { name: "Kitab Cahaya", price: 400, qty: 1 },
        { name: "Nasi Hangat", price: 8, qty: 3 },
        { name: "Jasa Pengobatan", price: 10, qty: 99, service: "heal" }
      ]};
      return { coins: 120, stock: [
        { name: "Nasi Hangat", price: 8, qty: 5 },
        { name: "Roti", price: 4, qty: 6 },
        { name: "Teh Herbal", price: 5, qty: 5 },
        { name: "Ramuan Energi", price: 12, qty: 2 },
        { name: "Ramuan Mana", price: 12, qty: 2 },
        { name: "Elixir Petualang", price: 28, qty: 1 }
      ]};
   }
   if (/guild|reseptionis|receptionist|faye/.test(r + " " + n)) {
     return { coins: 180, stock: [
       { name: "Peta Hutan", price: 25, qty: 3 },
        { name: "Bekal Petualang", price: 10, qty: 4 },
        { name: "Elixir Petualang", price: 28, qty: 2 },
        { name: "Ramuan Mana", price: 12, qty: 3 },
        { name: "Ramuan Mana Besar", price: 28, qty: 2 },
        { name: "Ramuan Energi Besar", price: 25, qty: 2 },
        { name: "Tongkat Sihir", price: 80, qty: 1 },
        { name: "Kitab Angin", price: 60, qty: 1 },
        { name: "Kitab Petir", price: 250, qty: 1 }
     ]};
   }
   if (/petualang|adventurer|runner|sella|vex|aldo/.test(r + " " + n)) {
     return { coins: 80, stock: [
       { name: "Peta Hutan", price: 25, qty: 2 },
        { name: "Roti", price: 4, qty: 3 },
        { name: "Belati Tajam", price: 45, qty: 1 },
        { name: "Ramuan HP", price: 15, qty: 2 },
        { name: "Ramuan Mana", price: 12, qty: 2 }
     ]};
   }
    return { coins: 60, stock: [{ name: "Roti", price: 4, qty: 3 }, { name: "Teh Herbal", price: 5, qty: 2 }, { name: "Ramuan Mana", price: 12, qty: 1 }] };
  }
  function ensureShop(c) {
    if (!c || c._noshop) return null;
    if (!c.shop || !Array.isArray(c.shop.stock)) {
      var t = shopTemplateFor(c);
      c.shop = { coins: t.coins, stock: t.stock.map(function (s) { return { name: s.name, price: s.price, qty: s.qty, service: s.service || "" }; }) };
    }
    // Gabung item baru ke shop lama (save lama) — kitab yang sudah dikuasai tidak dimunculkan lagi.
    try {
      var tpl = shopTemplateFor(c);
      tpl.stock.forEach(function (t) {
        var found = null;
        for (var i = 0; i < c.shop.stock.length; i++) if (c.shop.stock[i].name === t.name) { found = c.shop.stock[i]; break; }
        if (!found) {
          var tid = spellIdForTome(t.name);
          if (tid && hasSpell(tid)) return;
          c.shop.stock.push({ name: t.name, price: t.price, qty: t.qty, service: t.service || "" });
        }
      });
    } catch (eM) {}
    return c.shop;
  }
  function priceFor(c, entry) {
    var p = Number(entry.price) || 0;
    var aff = Number(c.affinity) || 0;
    if (aff >= 40) p = Math.max(1, Math.round(p * 0.85));
    else if (aff <= -30) p = Math.round(p * 1.2);
    try {
      var h = W && W.clock ? ((W.clock.phase || 0) % 4) : 1;
      if (h === 3) p = Math.round(p * 1.1);
    } catch (e) {}
    return Math.max(1, p);
  }
 function restockShops() {
   if (!W) return;
   W.chars.forEach(function (c) {
     try {
       var s = ensureShop(c);
       if (!s) return;
       var tpl = shopTemplateFor(c);
       tpl.stock.forEach(function (t) {
         var f = null;
         for (var i = 0; i < s.stock.length; i++) if (s.stock[i].name === t.name) f = s.stock[i];
          if (f) {
            if (!f.service) {
              // Kitab tidak di-restock: sekali beli = permanen. Kecuali belum dikuasai.
              var tid = spellIdForTome(t.name);
              if (tid && hasSpell(tid)) { f.qty = 0; return; }
              if (tid) return;
              f.qty = Math.min(t.qty, (Number(f.qty) || 0) + Math.ceil(t.qty / 2));
            }
          }
       });
       s.coins = Math.min(400, (Number(s.coins) || 0) + 40);
     } catch (e) {}
   });
 }
  function lootForLoc(locNameStr) {
    var s = String(locNameStr || "").toLowerCase();
    if (/hutan|forest|kabut/.test(s)) return [{ n: "Herbal", w: 50 }, { n: "Kayu", w: 30 }, { n: "Besi", w: 20 }];
    if (/dungeon|gerbang|gate|tambang|gua/.test(s)) return [{ n: "Besi", w: 50 }, { n: "Kayu", w: 20 }, { n: "Herbal", w: 20 }, { n: "nothing", w: 10 }];
    if (/alun|plaza|pasar|square|market/.test(s)) return [{ n: "koin-serabutan", w: 50 }, { n: "Herbal", w: 15 }, { n: "nothing", w: 35 }];
    if (/menara|tower|perpustakaan/.test(s)) return [{ n: "Herbal", w: 30 }, { n: "nothing", w: 70 }];
    return [{ n: "Herbal", w: 20 }, { n: "Kayu", w: 20 }, { n: "nothing", w: 60 }];
  }
  function isFoodLoc(nm) { return /warung|kedai|dapur|kantin|alun|plaza|pasar|rumah|penginapan|inn|house|home/.test(String(nm || "").toLowerCase()); }
  function isRestLoc(nm) { return /rumah|penginapan|inn|house|home|plaza|alun|menara|tower/.test(String(nm || "").toLowerCase()); }
  function isDangerLoc(nm) { return /hutan|forest|dungeon|gerbang|gate|kuburan|gua|tower gelap/.test(String(nm || "").toLowerCase()); }

  var LANGS = [
    { id: "en", name: "English" },
    { id: "id", name: "Bahasa Indonesia" },
    { id: "ms", name: "Bahasa Melayu" },
    { id: "jv", name: "Basa Jawa" },
    { id: "es", name: "Español" },
    { id: "ja", name: "日本語" }
  ];
  var GENRES = ["fantasy", "sekolah", "cyberpunk", "horor", "isekai", "custom"];
  function outfitOf() { return GENRE_OUTFIT_EN[W && W.genre] || (W ? genreWord() + "-style outfit" : "genre-appropriate outfit"); }
  var ART_STYLES = [
    { id: "anime", name: "Anime", prompt: "detailed anime style, vibrant colors, clean lineart" },
    { id: "realistic", name: "Realistis Sinematik", prompt: "cinematic photorealistic style, dramatic lighting, highly detailed" },
    { id: "cartoon", name: "Kartun", prompt: "cheerful cartoon style, bold shapes, Pixar-like 3D render" },
    { id: "oilpaint", name: "Lukisan Minyak", prompt: "classical oil painting style, visible brushstrokes, rich texture" },
    { id: "pixel", name: "Pixel Art", prompt: "retro 16-bit pixel art style" },
    { id: "comic", name: "Komik", prompt: "comic book style, bold inks, halftone shading" }
  ];
  function artOf() {
    if (!W || !W.art) return ART_STYLES[0];
    for (var i = 0; i < ART_STYLES.length; i++) if (ART_STYLES[i].id === W.art) return ART_STYLES[i];
    return ART_STYLES[0];
  }
  /* ---------- bilingual UI (EN default, ID toggle) + world-language content ---------- */
  var uiLangCur = "en";
  try { var _ul = localStorage.getItem("t2iWorldUiLang"); if (_ul === "id" || _ul === "en") uiLangCur = _ul; } catch (e) {}
  function fmt(s, o) {
    return String(s).replace(/\{(\w+)\}/g, function (m, k) { return (o && o[k] != null) ? o[k] : m; });
  }
  function T(k, o) {
    var _eu = (typeof W !== "undefined" && W && (W.uiLang === "en" || W.uiLang === "id")) ? W.uiLang : uiLangCur;
    var L = (UI && UI[_eu]) || (UI && UI.en) || {};
    var s = (L[k] != null) ? L[k] : ((UI.en && UI.en[k] != null) ? UI.en[k] : k);
    return o ? fmt(s, o) : s;
  }
  function WL() { return (typeof W !== "undefined" && W && W.lang === "en") ? "en" : "id"; }
  function C(k, o) {
    var L = (WL() === "en" ? CT.en : CT.id) || {};
    var s = (L[k] != null) ? L[k] : ((CT.id && CT.id[k] != null) ? CT.id[k] : k);
    return o ? fmt(s, o) : s;
  }
  function effUi() { return (typeof W !== "undefined" && W && (W.uiLang === "en" || W.uiLang === "id")) ? W.uiLang : uiLangCur; }
  function setUiLang(l) {
    if (l !== "en" && l !== "id") return;
    if (typeof W !== "undefined" && W) return;
    uiLangCur = l;
    try { localStorage.setItem("t2iWorldUiLang", l); } catch (e) {}
    renderSetupNew();
  }
  function uiLangToggleHtml() {
    return "<span class='wd-hint' style='margin:0;'>" + T("uiLang") + ":</span>" +
      "<button type='button' class='wd-mini' data-uilang='en'" + (effUi() === "en" ? " disabled" : "") + ">EN</button>" +
      "<button type='button' class='wd-mini' data-uilang='id'" + (effUi() === "id" ? " disabled" : "") + ">ID</button>";
  }
  function wireUiLangToggle() {
    if (!rootEl) return;
    rootEl.querySelectorAll("[data-uilang]").forEach(function (b) {
      b.addEventListener("click", function () { setUiLang(b.getAttribute("data-uilang")); });
    });
  }
  var GENRE_LABEL = {
    fantasy: { en: "Fantasy", id: "fantasy" }, sekolah: { en: "School", id: "sekolah" },
    cyberpunk: { en: "Cyberpunk", id: "cyberpunk" }, horor: { en: "Horror", id: "horor" },
    isekai: { en: "Isekai", id: "isekai" }, custom: { en: "Custom", id: "custom" }
  };
  function genreLabel(g) { var m = GENRE_LABEL[g]; if (!m) return g; return effUi() === "id" ? m.id : m.en; }
  var GENRE_WORD = { fantasy: "fantasy", sekolah: "school", cyberpunk: "cyberpunk", horor: "horror", isekai: "isekai", custom: "custom" };
  function genreWord() { return GENRE_WORD[W && W.genre] || (W ? W.genre : "fantasy"); }
  var GENRE_OUTFIT_EN = {
    fantasy: "fantasy adventurer clothing (tunic, leather, cloak, medieval accessories)",
    sekolah: "school uniform outfit (white-grey uniform, neat student look)",
    cyberpunk: "cyberpunk streetwear with neon accents and tech implants",
    horor: "dark worn everyday clothes, eerie atmosphere",
    isekai: "fantasy isekai adventurer outfit (armor pieces, cape, boots)"
  };
  var ART_LABEL = {
    anime: { en: "Anime", id: "Anime" }, realistic: { en: "Cinematic Realistic", id: "Realistis Sinematik" },
    cartoon: { en: "Cartoon", id: "Kartun" }, oilpaint: { en: "Oil Painting", id: "Lukisan Minyak" },
    pixel: { en: "Pixel Art", id: "Pixel Art" }, comic: { en: "Comic", id: "Komik" }
  };
  function artLabel() { var a = artOf(); var m = ART_LABEL[a.id]; if (!m) return a.name; return effUi() === "id" ? m.id : m.en; }
  var UI = {
    en: {
      setupTitle: "🌍 Build a Living World", setupSub: "Fill the form below, then click Build World.",
      fName: "World name", fNamePh: "e.g. Ember Village / Bright High",
      fGenre: "Genre", fArt: "Art style", fLang: "World language", fLangHint: "💬 NPC chats use this language (the 🌐 UI toggle above is only for buttons).", fPrem: "Premise (1-3 sentences)",
      fPremPh: "What is going on in this world? Who is in it?",
      bPremAi: "✨ AI premise help", bBuild: "Build World",
      lockNote: "Choose with care — name, art, language and genre can't be changed once the world is born.",
      saveNote: "💾 Worlds auto-save in this browser — reopen this tab to continue.",
      uiLang: "🌐 UI", modeLabel: "Mode", modePlayer: "🧍 Play character", modeGod: "👑 God",
      mTagP: "🧍 Player", mTagG: "👑 God",
      lockChar: "You live here as one soul — talk and act to shape things. Portraits and fate itself belong to God mode.",
      fPremise: "Premise", fLocs: "Locations", fYou: "You",
      youAt: "📍 {loc} — move via 🎭 action, e.g. {ex1} or {ex2}",
      bReset: "🗑 Reset world", bCp: "📌 Checkpoint",
      resetConfirm: "Reset {name}? All lore, characters and memories will be gone.", resetOk: "Reset",
      cast: "🎭 Cast", bAvAll: "🎨 All portraits", bAvRedo: "🔁",
      bTalk: "💬 Talk", bMem: "🧠 Memories", noMem: "No memories yet.", tapDetail: "Tap to expand/collapse",
      castFull: "Cast is full (max {n}).",
      npcHintGod: "New souls arrive through the God Panel.",
      npcHintPlayer: "Chat and read memories here. Portraits and new souls belong to God mode.",
      allHaveAv: "Everybody already has a portrait.",
      makingAv: "🎨 Making {n} portraits in the background…",
      redoConfirm: "Redraw ALL ({n}) portraits in {style} style?", redoOk: "Redraw",
      redoing: "🔁 Redrawing {n} portraits ({style})…",
      delConfirm: "Remove {name} from the world?", delOk: "Remove",
      stage: "🎬 Stage", fLoc: "Location:", optAll: "All", unFocus: "✕ release",
      youAre: "You are in <b>{loc}</b>. 💬 Talk, 🎭 Act — even to travel.",
      optAllCb: "💬 Everyone", kindSay: "💬 Say", kindAct: "🎭 Act",
      sayPh: "Type as {name}… (Enter sends)", actPh: "Act as {name}… e.g. {ex} (Enter sends)",
      bSend: "Send",
      actHint: "Try {a} · {b} · {c}.",
      godStageHint: "You watch above it all. Whisper from the right panel, or speak narration below:",
      narrPh: "World narration… (Enter broadcasts)",
      ambOn: "⏸ Ambient: ON", ambOff: "▶ Ambient: OFF", bSim: "🎲 1 auto turn", busy: "⏳ AI working…",
      rotOn: "🔄 Rotation: ON", rotOff: "🔄 Rotation: OFF",
      rotHint: "Souls come and go, max {n}, each following their own life.",
      whereYou: "you",
      farHeard: "👂 heard from afar",
      stChat: "chatting in {loc}",
      stAt: "in {loc}",
      justNow: "just now",
      minAgo: "{n}m ago",
      dayWord: "Day",
      bPhase: "⏭ Next phase",
      worldCard: "🌍 World",
      worldSub: "Time, weather, conditions and belongings — god-managed, visible to all.",
      fWeather: "Weather",
      fCond: "Location condition",
      condPh: "e.g. crowded, dirty, festive… (empty = normal)",
      bSetCond: "Set",
      itemsTitle: "🎒 Items",
      itemWho: "Holder",
      itemPh: "e.g. iron sword",
      bGive: "Give",
      itemDel: "remove",
      noItems: "—",
      exTitle: "🧳 Former residents", exEmpty: "No one has left yet.", exBack: "↩ invite back",
      pin: "📌 pin", unpin: "📍 unpin", pinned: "📌",
      soloHint: "Everyone here lives their own life — you are one soul among many.",
      feedEmpty: "Nothing has happened yet. Say hi!",
      bDraw: "🎨 illustrate", typing: "typing…", godWho: "👑 God",
      godTitle: "👑 God Room",
      godSub: "Whisper your will and watch it happen. Dangerous wishes ask for confirmation first.",
      godPh: "e.g. Send a goblin raid to the forge / move Riko to the cafeteria…",
      bDiscuss: "💬 Discuss", bRun: "⚡ Run now",
      godLocked: "👑 God Panel", godLockedHint: "Become God to whisper, shape fate and walk the timeline.",
      manageTitle: "🛠 Manage NPCs",
      manageSub: "Shape those who live here — move, deepen, farewell, or welcome new souls.",
      addNpc: "➕ Bring in a new NPC",
      cName: "Name", cNamePh: "e.g. Bram", cRole: "Role", cRolePh: "e.g. Blacksmith / friend / rival",
      cPers: "Personality (1 sentence)", cPersPh: "e.g. Blunt but warm",
      bAdd: "Add", bAuto: "✨ Auto NPC (AI)", bRoster: "📚 From Roster",
      autoHint: "✨ Auto NPC: AI creates name + role + personality + goal + description + automatic portrait.",
      rosterEmpty: "Roster is empty. Create some in 🧑 Persona Generator first.",
      rosterPick: "Pick from roster", rosterAdd: "Bring into world",
      needName: "Enter a name first.",
      thinToast: "✨ AI is making a profile + portrait for {name}…",
      readingRoster: "⏳ Reading roster…",
      bProfile: "✨ AI profile", bPortrait: "🎨 Portrait", bDelete: "🗑 Delete",
      tlTitle: "⏳ Timeline", noCp: "No checkpoints yet.", noNpc: "No NPCs yet.", bBack: "⏪ back",
      bFf1: "⏩ +1 day", bFf7: "⏩ +7 days",
      archTitle: "Overwritten futures archive", cpSaved: "📌 Checkpoint saved.",
      discussYou: "👑 You:", thinking: "Assistant is thinking…",
      destructWarn: "⚠️ This order looks <b>balance-breaking</b> (e.g. mass destruction / death / overpower). The assistant still OBEYS — but confirm first: click <b>Run anyway</b>, or soften the order.",
      bForce: "Run anyway", bDoIt: "Run this order",
      aiFail: "⚠️ Failed: ",
      needGod: "🔒 {what} is 👑 God only. Switch modes first, or do it via 💬 talk / 🎭 actions.",
      aiNotReady: "AI is not ready — try again in a moment.", aiNotReadyShort: "AI is not ready.",
      portraitFail: "Portrait failed: ", imgFail: "Image failed: ", enrichFail: "Profile failed: ",
      weirdAi: "AI returned a weird format — try again.", dupName: "Duplicate name — try again.",
      castFullT: "Cast is full (max {n}).",
      joinedAuto: "✨ {name} joined + AI portrait auto-made.",
      autoFail: "Auto NPC failed: ", godFail: "⚠️ Divine will fizzled (", ffFail: "⚠️ Time-skip failed (",
      backConfirm: "Go back to {label}? Everything after it will be undone (kept as reading archive).", backOk: "Go back",
      noGen: "generateImage unavailable", boot: "⏳ Loading world…",
      madeAuto: "🎨 AI portraits auto-generate in the background…"
    },
    id: {
      setupTitle: "🌍 Bikin Dunia Hidup", setupSub: "Isi form di bawah, lalu klik Bangun Dunia.",
      fName: "Nama dunia", fNamePh: "mis. Desa Bara / SMA Cahaya",
      fGenre: "Genre", fArt: "Style gambar", fLang: "Bahasa dunia", fLangHint: "💬 Obrolan NPC memakai bahasa ini (toggle 🌐 UI di atas hanya untuk tombol).", fPrem: "Premis (1-3 kalimat)",
      fPremPh: "Ada apa di dunia ini? Siapa tokohnya?",
      bPremAi: "✨ AI bantu premis", bBuild: "Bangun Dunia",
      lockNote: "Pilih dengan hati-hati — nama, gambar, bahasa & genre tak bisa diubah setelah dunia lahir.",
      saveNote: "💾 Dunia tersimpan otomatis di browser ini — buka tab ini lagi untuk lanjut.",
      uiLang: "🌐 UI", modeLabel: "Mode", modePlayer: "🧍 Ikut karakter", modeGod: "👑 Dewa",
      mTagP: "🧍 Player", mTagG: "👑 Dewa",
      lockChar: "Kamu hidup di sini sebagai satu jiwa — bicara dan bertindaklah untuk mengubah keadaan. Portrait dan takdir milik mode Dewa.",
      fPremise: "Premis", fLocs: "Lokasi", fYou: "Kamu",
      youAt: "📍 {loc} — pindah via 🎭 aksi, mis. {ex1} atau {ex2}",
      bReset: "🗑 Reset dunia", bCp: "📌 Checkpoint",
      resetConfirm: "Reset dunia {name}? Semua lore, karakter, dan ingatan hilang.", resetOk: "Reset",
      cast: "🎭 Cast", bAvAll: "🎨 Semua portrait", bAvRedo: "🔁",
      bTalk: "💬 Ngobrol", bMem: "🧠 Ingatan", noMem: "Belum ada ingatan.", tapDetail: "Ketuk untuk buka/tutup",
      castFull: "Cast penuh (maks {n}).",
      npcHintGod: "Jiwa baru datang lewat Panel Dewa.",
      npcHintPlayer: "Ngobrol dan baca ingatan di sini. Portrait dan jiwa baru milik mode Dewa.",
      allHaveAv: "Semua cast sudah punya portrait.",
      makingAv: "🎨 Membuat {n} portrait di background…",
      redoConfirm: "Gambar ulang SEMUA ({n}) portrait dengan style {style}?", redoOk: "Gambar ulang",
      redoing: "🔁 Menggambar ulang {n} portrait ({style})…",
      delConfirm: "Hapus {name} dari dunia?", delOk: "Hapus",
      stage: "🎬 Panggung", fLoc: "Lokasi:", optAll: "Semua", unFocus: "✕ lepas",
      youAre: "Kamu ada di <b>{loc}</b>. 💬 Bicara, 🎭 Bertindak — termasuk untuk bepergian.",
      optAllCb: "💬 Semua", kindSay: "💬 Bicara", kindAct: "🎭 Aksi",
      sayPh: "Ketik sebagai {name}… (Enter kirim)", actPh: "Aksi sebagai {name}… mis. {ex} (Enter kirim)",
      bSend: "Kirim",
      actHint: "Coba {a} · {b} · {c}.",
      godStageHint: "Kamu mengawasi dari atas. Berbisiklah lewat panel kanan, atau ucapkan narasi di bawah:",
      narrPh: "Narasi dunia… (Enter siarkan)",
      ambOn: "⏸ Ambient: ON", ambOff: "▶ Ambient: OFF", bSim: "🎲 1 putaran otomatis", busy: "⏳ AI bekerja…",
      rotOn: "🔄 Rotasi: ON", rotOff: "🔄 Rotasi: OFF",
      rotHint: "Jiwa datang dan pergi, maks {n}, masing-masing mengikuti hidupnya.",
      whereYou: "kamu",
      farHeard: "👂 terdengar dari jauh",
      stChat: "ngobrol di {loc}",
      stAt: "di {loc}",
      justNow: "baru saja",
      minAgo: "{n} mnt lalu",
      dayWord: "Hari",
      bPhase: "⏭ Fase berikut",
      worldCard: "🌍 Dunia",
      worldSub: "Waktu, cuaca, kondisi dan barang — dikelola dewa, terlihat semua orang.",
      fWeather: "Cuaca",
      fCond: "Kondisi lokasi",
      condPh: "mis. ramai, kotor, meriah… (kosong = normal)",
      bSetCond: "Atur",
      itemsTitle: "🎒 Barang",
      itemWho: "Pemegang",
      itemPh: "mis. pedang besi",
      bGive: "Beri",
      itemDel: "hapus",
      noItems: "—",
      exTitle: "🧳 Mantan penghuni", exEmpty: "Belum ada yang pergi.", exBack: "↩ undang kembali",
      pin: "📌 pin", unpin: "📍 lepas", pinned: "📌",
      soloHint: "Semua orang di sini punya hidupnya sendiri — kamu satu jiwa di antaranya.",
      feedEmpty: "Belum ada kejadian. Sapa mereka!",
      bDraw: "🎨 gambarkan", typing: "mengetik…", godWho: "👑 Dewa",
      godTitle: "👑 Ruang Dewa",
      godSub: "Bisikkan kehendakmu dan saksikan terwujud. Keinginan berbahaya dimintai persetujuan dulu.",
      godPh: "mis. Datangkan serangan goblin ke bengkel / bikin Riko pindah ke kantin…",
      bDiscuss: "💬 Diskusikan", bRun: "⚡ Langsung jalankan",
      godLocked: "👑 Panel Dewa", godLockedHint: "Jadilah Dewa untuk berbisik, membentuk takdir, dan menyusuri waktu.",
      manageTitle: "🛠 Kelola NPC",
      manageSub: "Bentuk mereka yang tinggal di sini — pindahkan, dalami, lepaskan, atau sambut jiwa baru.",
      addNpc: "➕ Datangkan NPC baru",
      cName: "Nama", cNamePh: "mis. Bara", cRole: "Peran", cRolePh: "mis. Blacksmith / teman / rival",
      cPers: "Kepribadian (1 kalimat)", cPersPh: "mis. Blak-blakan tapi hangat",
      bAdd: "Tambah", bAuto: "✨ Auto NPC (AI)", bRoster: "📚 Dari Roster",
      autoHint: "✨ Auto NPC: AI buatkan nama + peran + kepribadian + tujuan + deskripsi + portrait otomatis.",
      rosterEmpty: "Roster kosong. Bikin dulu di 🧑 Persona Generator.",
      rosterPick: "Pilih dari roster", rosterAdd: "Masukkan ke dunia",
      needName: "Isi nama dulu.",
      thinToast: "✨ Profil + portrait AI dibuat otomatis untuk {name}…",
      readingRoster: "⏳ Membaca roster…",
      bProfile: "✨ AI profil", bPortrait: "🎨 Portrait", bDelete: "🗑 Hapus",
      tlTitle: "⏳ Timeline", noCp: "Belum ada checkpoint.", noNpc: "Belum ada NPC.", bBack: "⏪ kembali",
      bFf1: "⏩ +1 hari", bFf7: "⏩ +7 hari",
      archTitle: "Arsip masa depan yang dibatalkan", cpSaved: "📌 Checkpoint disimpan.",
      discussYou: "👑 Kamu:", thinking: "Asisten berpikir…",
      destructWarn: "⚠️ Perintah ini terdeteksi <b>berisiko merusak keseimbangan</b> (mis. hancur/mati massal/overpower). Asisten tetap TAAT — tapi pastikan dulu: klik <b>Tetap jalankan</b>, atau ubah perintahmu jadi versi lunaknya.",
      bForce: "Tetap jalankan", bDoIt: "Jalankan perintah ini",
      aiFail: "⚠️ Gagal: ",
      needGod: "🔒 {what} hanya di mode 👑 Dewa. Pindah mode dulu, atau lakukan lewat 💬 percakapan / 🎭 aksi.",
      aiNotReady: "AI belum siap — coba lagi sebentar.", aiNotReadyShort: "AI belum siap.",
      portraitFail: "Gagal bikin portrait: ", imgFail: "Gagal bikin gambar: ", enrichFail: "Gagal lengkapi profil: ",
      weirdAi: "AI mengembalikan format aneh — coba lagi.", dupName: "Nama duplikat — coba lagi.",
      castFullT: "Cast penuh (maks {n}).",
      joinedAuto: "✨ {name} bergabung + portrait AI dibuat otomatis.",
      autoFail: "Gagal auto NPC: ", godFail: "⚠️ Kehendak dewa gagal terwujud (", ffFail: "⚠️ Putaran waktu gagal (",
      backConfirm: "Kembali ke {label}? Semua kejadian setelahnya akan dibatalkan (diarsip sebagai bacaan).", backOk: "Kembali",
      noGen: "generateImage tidak tersedia", boot: "⏳ Memuat dunia…",
      madeAuto: "🎨 Portrait AI dibuat otomatis di background…"
    }
  };
  var CT = {
    en: {
      stages: ["loyal", "warm", "neutral", "cold", "hostile"],
      born: "🌍 World {name} is born ({genre}, {lang}). {chars} settle into {loc}.",
      enter: "🚶 {who} enters {loc} (from {from}).",
      spawnFull: "✨ {name} ({role}) appears in {loc}. {desc} Goal: {goal}",
      spawnShort: "✨ {name} ({role}) appears in {loc}.",
      spawnBare: "✨ {name} appears in {loc}.",
      leave: "👋 {name} leaves the world.",
      leaveWhy: "👋 {name} leaves: {reason}",
      comeWhy: "✨ {name} ({role}) arrives at {loc} — {reason}. {desc} Goal: {goal}",
      comeBack: "🔙 {name} ({role}) returns to {loc} — {reason}.",
      godWill: "👑 Divine will: {cmd}",
      quiet: "Quiet. No one is in {loc}{where}.",
      inWord: "in",
      ambientStart: "🎲 {pair} start chatting in {loc}.",
      cpAuto: "Auto — ", cpAutoGod: "Auto — divine will", cpFirst: "World beginning", cpManual: "Manual — ",
      cpBefore: "Before +{d}-day skip", skipping: "⏩ God fast-forwards +{d} days…",
      skipped: "📖 {d} days pass: {nar}",
      backed: "⏪ Time rewound to {label}. The undone future is kept in the archive.",
      arch: "Undone future ({date})",
      rules: "Keep characters and locations consistent. Permanent death only by divine will.",
      tone: "Balanced: warm but with conflict.",
      roleDef: "Folk", roleGuest: "Guest", persDef: "Friendly.", you: "You",
      tagSys: "SYSTEM", tagGod: "GOD",
      newDay: "🌅 Day {d} begins — {phase}.",
      wxChange: "{emoji} Weather turns {wx}."
    },
    id: {
      stages: ["setia", "hangat", "netral", "dingin", "bermusuhan"],
      born: "🌍 Dunia {name} lahir ({genre}, {lang}). {chars} menempati {loc}.",
      enter: "🚶 {who} memasuki {loc} (dari {from}).",
      spawnFull: "✨ {name} ({role}) muncul di {loc}. {desc} Tujuan: {goal}",
      spawnShort: "✨ {name} ({role}) muncul di {loc}.",
      spawnBare: "✨ {name} muncul di {loc}.",
      leave: "👋 {name} meninggalkan dunia.",
      leaveWhy: "👋 {name} pergi: {reason}",
      comeWhy: "✨ {name} ({role}) tiba di {loc} — {reason}. {desc} Tujuan: {goal}",
      comeBack: "🔙 {name} ({role}) kembali ke {loc} — {reason}.",
      godWill: "👑 Kehendak dewa: {cmd}",
      quiet: "Hening. Tidak ada siapa-siapa di {loc}{where}.",
      inWord: "di",
      ambientStart: "🎲 {pair} mulai mengobrol di {loc}.",
      cpAuto: "Otomatis — ", cpAutoGod: "Otomatis — kehendak dewa", cpFirst: "Awal dunia", cpManual: "Manual — ",
      cpBefore: "Sebelum lompat +{d} hari", skipping: "⏩ Dewa memutar waktu +{d} hari…",
      skipped: "📖 {d} hari berlalu: {nar}",
      backed: "⏪ Waktu diputar kembali ke {label}. Masa depan yang dibatalkan tersimpan di arsip.",
      arch: "Masa depan yang dibatalkan ({date})",
      rules: "Jaga konsistensi karakter dan lokasi. Kematian permanen hanya atas kehendak dewa.",
      tone: "Seimbang: hangat tapi ada konflik.",
      roleDef: "Warga", roleGuest: "Tamu", persDef: "Ramah.", you: "Kamu",
      tagSys: "SISTEM", tagGod: "DEWA",
      newDay: "🌅 Hari ke-{d} dimulai — {phase}.",
      wxChange: "{emoji} Cuaca berubah menjadi {wx}."
    }
  };
  // SATU tabel preset dua bahasa (dulu dua tabel EN+ID terpisah).
  // Tambah genre/ubah isi cukup di sini; lang selain en pakai blok id.
  var PRESETS = {
    fantasy: {
      en: {
      locations: [["Main Square", "Village center, busy with traders and a quest board."], ["Ember Forge", "Blacksmith workshop, hot and noisy."], ["Mist Forest", "Dark forest with monsters and rare herbs."]],
      chars: [
        { name: "Bram", role: "Blacksmith", personality: "Blunt, warm, proud of his craft.", goal: "To forge a legendary sword.", desc: "Big-handed blacksmith, singed leather apron." },
        { name: "Sella", role: "Adventurer", personality: "Brave, reckless, loyal to friends.", goal: "To conquer the Mist Forest.", desc: "Young adventurer with a cracked sword and a worn map." },
        { name: "Granny Mira", role: "Healer", personality: "Gentle but firm, loves to lecture.", goal: "To keep the village healthy.", desc: "Old healer smelling of herbs, calming smile." }
      ]
    },
    sekolah: {
      locations: [["Class 2-B", "Homeroom class, whiteboard and windows facing the field."], ["Cafeteria", "Gossip and snacks at break time."], ["School Rooftop", "Quiet escape spot for skipping and heart-to-hearts."]],
      chars: [
        { name: "Riko", role: "Deskmate", personality: "Mischievous, loud, easy to befriend.", goal: "To have the most solid gang.", desc: "Cheerful guy, messy hair, always snacking." },
        { name: "Nadia", role: "Crush / girlfriend", personality: "Sweet, sensitive, jealous when ignored.", goal: "An honest relationship.", desc: "Smart girl, calm, with a killer soft smile." },
        { name: "Bagas", role: "Rival", personality: "Arrogant, competitive, secretly insecure.", goal: "To be number one at school.", desc: "Athletic guy, challenging stare." }
      ]
    },
    cyberpunk: {
      locations: [["Neon Market", "Underground bazaar, chips and info traded."], ["Chrome Shop", "Augmentation workshop run by fixers."], ["Tower Roof", "Above the city smog, the cleanest signal."]],
      chars: [
        { name: "Krom", role: "Fixer / blacksmith", personality: "Cynical, professional, has his own code.", goal: "To pay off his debt to the syndicate.", desc: "Fixer with a chrome arm, leather jacket full of patches." },
        { name: "Vex", role: "Runner", personality: "Impulsive, clever, cannot sit still.", goal: "One last big job, then retire.", desc: "Nimble runner with a cracked visor." },
        { name: "Mother Data", role: "Informant", personality: "Calm, knows everything, speaks softly.", goal: "To keep the market balanced.", desc: "Old informant behind a curtain of cables." }
      ]
    },
    horor: {
      locations: [["Old House", "Empty house at the end of the alley, lights turn on by themselves."], ["Night Stall", "The only lit place past midnight."], ["Back Cemetery", "Old tombstones, fog never lifts."]],
      chars: [
        { name: "Mr. Dewo", role: "Stall keeper", personality: "Quiet, watchful, knows more than he admits.", goal: "To keep the stall open.", desc: "Middle-aged man, worn apron, tired eyes." },
        { name: "Laras", role: "College student", personality: "Brave out of curiosity, panics easily.", goal: "To finish her field report.", desc: "Student with a flashlight and a notebook." },
        { name: "???", role: "Resident of the old house", personality: "Mysterious, speaks in riddles, sometimes helpful.", goal: "Unknown.", desc: "A hazy figure that only appears at night." }
      ]
    },
    isekai: {
      locations: [["Beginner Plaza", "Where new adventurers gather and party up."], ["Magic Tower", "Library and magic lab."], ["Dungeon Gate", "Dungeon entrance, smells of monsters."]],
      chars: [
        { name: "Aldo", role: "Lost hero", personality: "Optimistic, naive about this world.", goal: "To return to his home world.", desc: "Young man in a hoodie holding a borrowed sword." },
        { name: "Faye", role: "Guild receptionist", personality: "Cheerful, efficient, strict about rules.", goal: "To keep the guild profitable.", desc: "Guild receptionist with a thick clipboard." },
        { name: "Grom", role: "Dwarf blacksmith", personality: "Rough but kind-hearted, hates cheap weapons.", goal: "To forge an S-rank weapon.", desc: "Stocky dwarf, braided beard, huge hammer." }
      ]
    },
    custom: { locations: [["Location 1", "Location description."]], chars: [] 
      },
      id: {
      locations: [["Alun-Alun", "Pusat desa, ramai pedagang dan papan misi."], ["Bengkel Bara", "Bengkel blacksmith, panas dan berisik."], ["Hutan Kabut", "Hutan gelap tempat monster dan herbal langka."]],
      chars: [
        { name: "Bara", role: "Blacksmith", personality: "Blak-blakan, hangat, bangga pada karya.", goal: "Menempa pedang legendaris.", desc: "Blacksmith bertangan besar, celemek kulit gosong." },
        { name: "Sella", role: "Petualang", personality: "Pemberani, ceroboh, setia kawan.", goal: "Menaklukkan Hutan Kabut.", desc: "Petualang muda dengan pedang retak dan peta lusuh." },
        { name: "Nenek Mira", role: "Tabib", personality: "Lembut tapi tegas, suka menasihati.", goal: "Menjaga desa tetap sehat.", desc: "Tabib tua, bau herbal, senyum menenangkan." }
      ]
    },
    sekolah: {
      locations: [["Kelas 2-B", "Kelas wali, papan tulis dan jendela ke lapangan."], ["Kantin", "Tempat gosip dan jajan saat istirahat."], ["Atap Sekolah", "Tempat sepi buat kabur dan curhat."]],
      chars: [
        { name: "Riko", role: "Teman sebangku", personality: "Jahil, rame, gampang akrab.", goal: "Punya geng paling solid.", desc: "Cowok ceria, rambut berantakan, suka jajan." },
        { name: "Nadia", role: "Pacar / gebetan", personality: "Manis, peka, cemburuan kalau didiemin.", goal: "Hubungan yang jujur.", desc: "Cewek pintar, kalem, senyum tipis mematikan." },
        { name: "Bagas", role: "Rival / musuh", personality: "Sombong, kompetitif, sebenarnya insecure.", goal: "Jadi nomor satu di sekolah.", desc: "Cowok atletis, tatapan menantang." }
      ]
    },
    cyberpunk: {
      locations: [["Pasar Neon", "Bazar bawah tanah, chip dan info diperjualbelikan."], ["Bengkel Krom", "Bengkel augmentasi milik fixers."], ["Atap Menara", "Di atas kabut asap kota, sinyal paling bersih."]],
      chars: [
        { name: "Krom", role: "Fixer / blacksmith", personality: "Sinis, profesional, ada kode etik sendiri.", goal: "Bayar utang ke sindikat.", desc: "Fixer bertangan krom, jaket kulit penuh patch." },
        { name: "Vex", role: "Runner", personality: "Impulsif, cerdas, susah diam.", goal: "Satu job besar lalu pensiun.", desc: "Runner lincah dengan visor retak." },
        { name: "Ibu Data", role: "Informan", personality: "Tenang, tahu segalanya, bicara pelan.", goal: "Menjaga keseimbangan pasar.", desc: "Informan tua di balik tirai kabel." }
      ]
    },
    horor: {
      locations: [["Rumah Tua", "Rumah kosong di ujung gang, lampu kadang nyala sendiri."], ["Warung Malam", "Satu-satunya tempat terang selepas tengah malam."], ["Kuburan Belakang", "Batu nisan tua, kabut tak pernah hilang."]],
      chars: [
        { name: "Pak Dewo", role: "Penjaga warung", personality: "Pendiam, waspada, tahu lebih banyak dari yang dia akui.", goal: "Menjaga warung tetap buka.", desc: "Pria paruh baya, apron lusuh, mata lelah." },
        { name: "Laras", role: "Mahasiswa KKN", personality: "Pemberani karena penasaran, gampang panik.", goal: "Menyelesaikan laporan KKN.", desc: "Mahasiswi dengan senter dan buku catatan." },
        { name: "???", role: "Penghuni rumah tua", personality: "Misterius, bicara berputar-putar, kadang membantu.", goal: "Tidak diketahui.", desc: "Sosok samar yang hanya muncul malam hari." }
      ]
    },
    isekai: {
      locations: [["Plaza Pemula", "Tempat adventurer baru berkumpul dan cari party."], ["Menara Sihir", "Perpustakaan dan lab sihir."], ["Gerbang Dungeon", "Pintu masuk dungeon, bau monster."]],
      chars: [
        { name: "Aldo", role: "Pahlawan tersesat", personality: "Optimis, naif soal dunia ini.", goal: "Pulang ke dunia asal.", desc: "Pemuda dengan hoodie dan pedang pinjaman." },
        { name: "Faye", role: "Guild resepsionis", personality: "Ceria, efisien, galak soal aturan.", goal: "Guild tetap untung.", desc: "Resepsionis guild dengan clipboard tebal." },
        { name: "Grom", role: "Blacksmith dwarf", personality: "Kasartapi baik hati, benci senjata murahan.", goal: "Menempa senjata S-rank.", desc: "Dwarf kekar, janggut dikepang, palu besar." }
      ]
    },
    custom: { locations: [["Lokasi 1", "Deskripsi lokasi."]], chars: [] 
      }
    },
    sekolah: {
      en: {
      locations: [["Class 2-B", "Homeroom class, whiteboard and windows facing the field."], ["Cafeteria", "Gossip and snacks at break time."], ["School Rooftop", "Quiet escape spot for skipping and heart-to-hearts."]],
      chars: [
        { name: "Riko", role: "Deskmate", personality: "Mischievous, loud, easy to befriend.", goal: "To have the most solid gang.", desc: "Cheerful guy, messy hair, always snacking." },
        { name: "Nadia", role: "Crush / girlfriend", personality: "Sweet, sensitive, jealous when ignored.", goal: "An honest relationship.", desc: "Smart girl, calm, with a killer soft smile." },
        { name: "Bagas", role: "Rival", personality: "Arrogant, competitive, secretly insecure.", goal: "To be number one at school.", desc: "Athletic guy, challenging stare." }
      ]
    },
    cyberpunk: {
      locations: [["Neon Market", "Underground bazaar, chips and info traded."], ["Chrome Shop", "Augmentation workshop run by fixers."], ["Tower Roof", "Above the city smog, the cleanest signal."]],
      chars: [
        { name: "Krom", role: "Fixer / blacksmith", personality: "Cynical, professional, has his own code.", goal: "To pay off his debt to the syndicate.", desc: "Fixer with a chrome arm, leather jacket full of patches." },
        { name: "Vex", role: "Runner", personality: "Impulsive, clever, cannot sit still.", goal: "One last big job, then retire.", desc: "Nimble runner with a cracked visor." },
        { name: "Mother Data", role: "Informant", personality: "Calm, knows everything, speaks softly.", goal: "To keep the market balanced.", desc: "Old informant behind a curtain of cables." }
      ]
    },
    horor: {
      locations: [["Old House", "Empty house at the end of the alley, lights turn on by themselves."], ["Night Stall", "The only lit place past midnight."], ["Back Cemetery", "Old tombstones, fog never lifts."]],
      chars: [
        { name: "Mr. Dewo", role: "Stall keeper", personality: "Quiet, watchful, knows more than he admits.", goal: "To keep the stall open.", desc: "Middle-aged man, worn apron, tired eyes." },
        { name: "Laras", role: "College student", personality: "Brave out of curiosity, panics easily.", goal: "To finish her field report.", desc: "Student with a flashlight and a notebook." },
        { name: "???", role: "Resident of the old house", personality: "Mysterious, speaks in riddles, sometimes helpful.", goal: "Unknown.", desc: "A hazy figure that only appears at night." }
      ]
    },
    isekai: {
      locations: [["Beginner Plaza", "Where new adventurers gather and party up."], ["Magic Tower", "Library and magic lab."], ["Dungeon Gate", "Dungeon entrance, smells of monsters."]],
      chars: [
        { name: "Aldo", role: "Lost hero", personality: "Optimistic, naive about this world.", goal: "To return to his home world.", desc: "Young man in a hoodie holding a borrowed sword." },
        { name: "Faye", role: "Guild receptionist", personality: "Cheerful, efficient, strict about rules.", goal: "To keep the guild profitable.", desc: "Guild receptionist with a thick clipboard." },
        { name: "Grom", role: "Dwarf blacksmith", personality: "Rough but kind-hearted, hates cheap weapons.", goal: "To forge an S-rank weapon.", desc: "Stocky dwarf, braided beard, huge hammer." }
      ]
    },
    custom: { locations: [["Location 1", "Location description."]], chars: [] 
      },
      id: {
      locations: [["Kelas 2-B", "Kelas wali, papan tulis dan jendela ke lapangan."], ["Kantin", "Tempat gosip dan jajan saat istirahat."], ["Atap Sekolah", "Tempat sepi buat kabur dan curhat."]],
      chars: [
        { name: "Riko", role: "Teman sebangku", personality: "Jahil, rame, gampang akrab.", goal: "Punya geng paling solid.", desc: "Cowok ceria, rambut berantakan, suka jajan." },
        { name: "Nadia", role: "Pacar / gebetan", personality: "Manis, peka, cemburuan kalau didiemin.", goal: "Hubungan yang jujur.", desc: "Cewek pintar, kalem, senyum tipis mematikan." },
        { name: "Bagas", role: "Rival / musuh", personality: "Sombong, kompetitif, sebenarnya insecure.", goal: "Jadi nomor satu di sekolah.", desc: "Cowok atletis, tatapan menantang." }
      ]
    },
    cyberpunk: {
      locations: [["Pasar Neon", "Bazar bawah tanah, chip dan info diperjualbelikan."], ["Bengkel Krom", "Bengkel augmentasi milik fixers."], ["Atap Menara", "Di atas kabut asap kota, sinyal paling bersih."]],
      chars: [
        { name: "Krom", role: "Fixer / blacksmith", personality: "Sinis, profesional, ada kode etik sendiri.", goal: "Bayar utang ke sindikat.", desc: "Fixer bertangan krom, jaket kulit penuh patch." },
        { name: "Vex", role: "Runner", personality: "Impulsif, cerdas, susah diam.", goal: "Satu job besar lalu pensiun.", desc: "Runner lincah dengan visor retak." },
        { name: "Ibu Data", role: "Informan", personality: "Tenang, tahu segalanya, bicara pelan.", goal: "Menjaga keseimbangan pasar.", desc: "Informan tua di balik tirai kabel." }
      ]
    },
    horor: {
      locations: [["Rumah Tua", "Rumah kosong di ujung gang, lampu kadang nyala sendiri."], ["Warung Malam", "Satu-satunya tempat terang selepas tengah malam."], ["Kuburan Belakang", "Batu nisan tua, kabut tak pernah hilang."]],
      chars: [
        { name: "Pak Dewo", role: "Penjaga warung", personality: "Pendiam, waspada, tahu lebih banyak dari yang dia akui.", goal: "Menjaga warung tetap buka.", desc: "Pria paruh baya, apron lusuh, mata lelah." },
        { name: "Laras", role: "Mahasiswa KKN", personality: "Pemberani karena penasaran, gampang panik.", goal: "Menyelesaikan laporan KKN.", desc: "Mahasiswi dengan senter dan buku catatan." },
        { name: "???", role: "Penghuni rumah tua", personality: "Misterius, bicara berputar-putar, kadang membantu.", goal: "Tidak diketahui.", desc: "Sosok samar yang hanya muncul malam hari." }
      ]
    },
    isekai: {
      locations: [["Plaza Pemula", "Tempat adventurer baru berkumpul dan cari party."], ["Menara Sihir", "Perpustakaan dan lab sihir."], ["Gerbang Dungeon", "Pintu masuk dungeon, bau monster."]],
      chars: [
        { name: "Aldo", role: "Pahlawan tersesat", personality: "Optimis, naif soal dunia ini.", goal: "Pulang ke dunia asal.", desc: "Pemuda dengan hoodie dan pedang pinjaman." },
        { name: "Faye", role: "Guild resepsionis", personality: "Ceria, efisien, galak soal aturan.", goal: "Guild tetap untung.", desc: "Resepsionis guild dengan clipboard tebal." },
        { name: "Grom", role: "Blacksmith dwarf", personality: "Kasartapi baik hati, benci senjata murahan.", goal: "Menempa senjata S-rank.", desc: "Dwarf kekar, janggut dikepang, palu besar." }
      ]
    },
    custom: { locations: [["Lokasi 1", "Deskripsi lokasi."]], chars: [] 
      }
    },
    cyberpunk: {
      en: {
      locations: [["Neon Market", "Underground bazaar, chips and info traded."], ["Chrome Shop", "Augmentation workshop run by fixers."], ["Tower Roof", "Above the city smog, the cleanest signal."]],
      chars: [
        { name: "Krom", role: "Fixer / blacksmith", personality: "Cynical, professional, has his own code.", goal: "To pay off his debt to the syndicate.", desc: "Fixer with a chrome arm, leather jacket full of patches." },
        { name: "Vex", role: "Runner", personality: "Impulsive, clever, cannot sit still.", goal: "One last big job, then retire.", desc: "Nimble runner with a cracked visor." },
        { name: "Mother Data", role: "Informant", personality: "Calm, knows everything, speaks softly.", goal: "To keep the market balanced.", desc: "Old informant behind a curtain of cables." }
      ]
    },
    horor: {
      locations: [["Old House", "Empty house at the end of the alley, lights turn on by themselves."], ["Night Stall", "The only lit place past midnight."], ["Back Cemetery", "Old tombstones, fog never lifts."]],
      chars: [
        { name: "Mr. Dewo", role: "Stall keeper", personality: "Quiet, watchful, knows more than he admits.", goal: "To keep the stall open.", desc: "Middle-aged man, worn apron, tired eyes." },
        { name: "Laras", role: "College student", personality: "Brave out of curiosity, panics easily.", goal: "To finish her field report.", desc: "Student with a flashlight and a notebook." },
        { name: "???", role: "Resident of the old house", personality: "Mysterious, speaks in riddles, sometimes helpful.", goal: "Unknown.", desc: "A hazy figure that only appears at night." }
      ]
    },
    isekai: {
      locations: [["Beginner Plaza", "Where new adventurers gather and party up."], ["Magic Tower", "Library and magic lab."], ["Dungeon Gate", "Dungeon entrance, smells of monsters."]],
      chars: [
        { name: "Aldo", role: "Lost hero", personality: "Optimistic, naive about this world.", goal: "To return to his home world.", desc: "Young man in a hoodie holding a borrowed sword." },
        { name: "Faye", role: "Guild receptionist", personality: "Cheerful, efficient, strict about rules.", goal: "To keep the guild profitable.", desc: "Guild receptionist with a thick clipboard." },
        { name: "Grom", role: "Dwarf blacksmith", personality: "Rough but kind-hearted, hates cheap weapons.", goal: "To forge an S-rank weapon.", desc: "Stocky dwarf, braided beard, huge hammer." }
      ]
    },
    custom: { locations: [["Location 1", "Location description."]], chars: [] 
      },
      id: {
      locations: [["Pasar Neon", "Bazar bawah tanah, chip dan info diperjualbelikan."], ["Bengkel Krom", "Bengkel augmentasi milik fixers."], ["Atap Menara", "Di atas kabut asap kota, sinyal paling bersih."]],
      chars: [
        { name: "Krom", role: "Fixer / blacksmith", personality: "Sinis, profesional, ada kode etik sendiri.", goal: "Bayar utang ke sindikat.", desc: "Fixer bertangan krom, jaket kulit penuh patch." },
        { name: "Vex", role: "Runner", personality: "Impulsif, cerdas, susah diam.", goal: "Satu job besar lalu pensiun.", desc: "Runner lincah dengan visor retak." },
        { name: "Ibu Data", role: "Informan", personality: "Tenang, tahu segalanya, bicara pelan.", goal: "Menjaga keseimbangan pasar.", desc: "Informan tua di balik tirai kabel." }
      ]
    },
    horor: {
      locations: [["Rumah Tua", "Rumah kosong di ujung gang, lampu kadang nyala sendiri."], ["Warung Malam", "Satu-satunya tempat terang selepas tengah malam."], ["Kuburan Belakang", "Batu nisan tua, kabut tak pernah hilang."]],
      chars: [
        { name: "Pak Dewo", role: "Penjaga warung", personality: "Pendiam, waspada, tahu lebih banyak dari yang dia akui.", goal: "Menjaga warung tetap buka.", desc: "Pria paruh baya, apron lusuh, mata lelah." },
        { name: "Laras", role: "Mahasiswa KKN", personality: "Pemberani karena penasaran, gampang panik.", goal: "Menyelesaikan laporan KKN.", desc: "Mahasiswi dengan senter dan buku catatan." },
        { name: "???", role: "Penghuni rumah tua", personality: "Misterius, bicara berputar-putar, kadang membantu.", goal: "Tidak diketahui.", desc: "Sosok samar yang hanya muncul malam hari." }
      ]
    },
    isekai: {
      locations: [["Plaza Pemula", "Tempat adventurer baru berkumpul dan cari party."], ["Menara Sihir", "Perpustakaan dan lab sihir."], ["Gerbang Dungeon", "Pintu masuk dungeon, bau monster."]],
      chars: [
        { name: "Aldo", role: "Pahlawan tersesat", personality: "Optimis, naif soal dunia ini.", goal: "Pulang ke dunia asal.", desc: "Pemuda dengan hoodie dan pedang pinjaman." },
        { name: "Faye", role: "Guild resepsionis", personality: "Ceria, efisien, galak soal aturan.", goal: "Guild tetap untung.", desc: "Resepsionis guild dengan clipboard tebal." },
        { name: "Grom", role: "Blacksmith dwarf", personality: "Kasartapi baik hati, benci senjata murahan.", goal: "Menempa senjata S-rank.", desc: "Dwarf kekar, janggut dikepang, palu besar." }
      ]
    },
    custom: { locations: [["Lokasi 1", "Deskripsi lokasi."]], chars: [] 
      }
    },
    horor: {
      en: {
      locations: [["Old House", "Empty house at the end of the alley, lights turn on by themselves."], ["Night Stall", "The only lit place past midnight."], ["Back Cemetery", "Old tombstones, fog never lifts."]],
      chars: [
        { name: "Mr. Dewo", role: "Stall keeper", personality: "Quiet, watchful, knows more than he admits.", goal: "To keep the stall open.", desc: "Middle-aged man, worn apron, tired eyes." },
        { name: "Laras", role: "College student", personality: "Brave out of curiosity, panics easily.", goal: "To finish her field report.", desc: "Student with a flashlight and a notebook." },
        { name: "???", role: "Resident of the old house", personality: "Mysterious, speaks in riddles, sometimes helpful.", goal: "Unknown.", desc: "A hazy figure that only appears at night." }
      ]
    },
    isekai: {
      locations: [["Beginner Plaza", "Where new adventurers gather and party up."], ["Magic Tower", "Library and magic lab."], ["Dungeon Gate", "Dungeon entrance, smells of monsters."]],
      chars: [
        { name: "Aldo", role: "Lost hero", personality: "Optimistic, naive about this world.", goal: "To return to his home world.", desc: "Young man in a hoodie holding a borrowed sword." },
        { name: "Faye", role: "Guild receptionist", personality: "Cheerful, efficient, strict about rules.", goal: "To keep the guild profitable.", desc: "Guild receptionist with a thick clipboard." },
        { name: "Grom", role: "Dwarf blacksmith", personality: "Rough but kind-hearted, hates cheap weapons.", goal: "To forge an S-rank weapon.", desc: "Stocky dwarf, braided beard, huge hammer." }
      ]
    },
    custom: { locations: [["Location 1", "Location description."]], chars: [] 
      },
      id: {
      locations: [["Rumah Tua", "Rumah kosong di ujung gang, lampu kadang nyala sendiri."], ["Warung Malam", "Satu-satunya tempat terang selepas tengah malam."], ["Kuburan Belakang", "Batu nisan tua, kabut tak pernah hilang."]],
      chars: [
        { name: "Pak Dewo", role: "Penjaga warung", personality: "Pendiam, waspada, tahu lebih banyak dari yang dia akui.", goal: "Menjaga warung tetap buka.", desc: "Pria paruh baya, apron lusuh, mata lelah." },
        { name: "Laras", role: "Mahasiswa KKN", personality: "Pemberani karena penasaran, gampang panik.", goal: "Menyelesaikan laporan KKN.", desc: "Mahasiswi dengan senter dan buku catatan." },
        { name: "???", role: "Penghuni rumah tua", personality: "Misterius, bicara berputar-putar, kadang membantu.", goal: "Tidak diketahui.", desc: "Sosok samar yang hanya muncul malam hari." }
      ]
    },
    isekai: {
      locations: [["Plaza Pemula", "Tempat adventurer baru berkumpul dan cari party."], ["Menara Sihir", "Perpustakaan dan lab sihir."], ["Gerbang Dungeon", "Pintu masuk dungeon, bau monster."]],
      chars: [
        { name: "Aldo", role: "Pahlawan tersesat", personality: "Optimis, naif soal dunia ini.", goal: "Pulang ke dunia asal.", desc: "Pemuda dengan hoodie dan pedang pinjaman." },
        { name: "Faye", role: "Guild resepsionis", personality: "Ceria, efisien, galak soal aturan.", goal: "Guild tetap untung.", desc: "Resepsionis guild dengan clipboard tebal." },
        { name: "Grom", role: "Blacksmith dwarf", personality: "Kasartapi baik hati, benci senjata murahan.", goal: "Menempa senjata S-rank.", desc: "Dwarf kekar, janggut dikepang, palu besar." }
      ]
    },
    custom: { locations: [["Lokasi 1", "Deskripsi lokasi."]], chars: [] 
      }
    },
    isekai: {
      en: {
      locations: [["Beginner Plaza", "Where new adventurers gather and party up."], ["Magic Tower", "Library and magic lab."], ["Dungeon Gate", "Dungeon entrance, smells of monsters."]],
      chars: [
        { name: "Aldo", role: "Lost hero", personality: "Optimistic, naive about this world.", goal: "To return to his home world.", desc: "Young man in a hoodie holding a borrowed sword." },
        { name: "Faye", role: "Guild receptionist", personality: "Cheerful, efficient, strict about rules.", goal: "To keep the guild profitable.", desc: "Guild receptionist with a thick clipboard." },
        { name: "Grom", role: "Dwarf blacksmith", personality: "Rough but kind-hearted, hates cheap weapons.", goal: "To forge an S-rank weapon.", desc: "Stocky dwarf, braided beard, huge hammer." }
      ]
    },
    custom: { locations: [["Location 1", "Location description."]], chars: [] 
      },
      id: {
      locations: [["Plaza Pemula", "Tempat adventurer baru berkumpul dan cari party."], ["Menara Sihir", "Perpustakaan dan lab sihir."], ["Gerbang Dungeon", "Pintu masuk dungeon, bau monster."]],
      chars: [
        { name: "Aldo", role: "Pahlawan tersesat", personality: "Optimis, naif soal dunia ini.", goal: "Pulang ke dunia asal.", desc: "Pemuda dengan hoodie dan pedang pinjaman." },
        { name: "Faye", role: "Guild resepsionis", personality: "Ceria, efisien, galak soal aturan.", goal: "Guild tetap untung.", desc: "Resepsionis guild dengan clipboard tebal." },
        { name: "Grom", role: "Blacksmith dwarf", personality: "Kasartapi baik hati, benci senjata murahan.", goal: "Menempa senjata S-rank.", desc: "Dwarf kekar, janggut dikepang, palu besar." }
      ]
    },
    custom: { locations: [["Lokasi 1", "Deskripsi lokasi."]], chars: [] 
      }
    },
    custom: {
      en: { locations: [["Location 1", "Location description."]], chars: [] 
      },
      id: { locations: [["Lokasi 1", "Deskripsi lokasi."]], chars: [] 
      }
    }
  };

  var DESTRUCT_RX = /musnahkan|hancurkan|lenyapkan|bunuh semua|bunuh (mereka|semua orang)|kiamat|ledakkan|bakar (desa|kota|dunia|semua)|hapus (dunia|semua|karakter)|genocide|wipe ?out|kill (all|everyone|them all)|destroy (all|everything|the world)|annihilat|nuke|overpower|tak terkalahkan|tak bisa mati|tidak bisa mati|abadi dan tak|invincible|god-?mode|semua mati|mati semua/i;
  var WARM_RX = /\b(love|sayaang|sayang|cinta|baik|terima ?kasih|thanks?|thank ?you|keren|hebat|amazing|great|kind|baik hati|peluk|hug|rindu|miss you|cantik|ganteng|beautiful|handsome|pintar|smart|cerdas|maaf|sorry|setuju|manis|sweet|senang|bangga|proud|percaya|trust you)\b/i;
  var COLD_RX = /\b(benci|hate|bodoh|stupid|idiot|tolol|goblok|dongo|jelek|ugly|jahat|evil|cruel|kejam|pergi|go away|shut ?up|diam|bunuh|kill|mati ?saja|die|bohong|lie|liar|pembohong|khianat|betray|jijik|disgusting|bangsat|anjing|bajingan|brengsek|sialan|damn you|lemah|weakling|pecundang|loser|sampah|mampus)\b/i;
  var STOP = {};
  ("yang dan di ke dari dengan untuk pada adalah itu ini saya aku kamu kau kalian dia beliau mereka kita kami tidak tak bukan jangan sudah telah sedang akan bisa dapat boleh ada sebagai karena sebab kalau jika jikalau atau ataupun juga serta sangat amat paling lebih kurang agar supaya biar dalam antara oleh saat ketika semasa setelah sebelum sesudah sambil sementara tentang seperti bagai bahwa sini situ sana apa siapa mana kapan mengapa kenapa bagaimana berapa saja sajalah kah pun lah nya ku mu per tiap setiap semua seluruh banyak sedikit para lalu kemudian tetapi namun sedangkan sehingga hingga sampai tanpa selain kecuali atas bawah depan belakang samping sebelah luar masih belum pernah yaitu yakni the a an and or but if then else when while in on at to for of with by from as is are was were be been being has have had having do does did doing will would can could shall should may might must ought i me my mine you your yours he him his she her hers it its we us our ours they them their theirs this that these those here there where what who whom whose which how why not no nor yes so such very just only also than too about into over after before between through during under above below again once all any both each few more most other some same own than too very can will just don should now").split(/\s+/).forEach(function (w) { STOP[w] = 1; });

  var W = null, rootEl = null, built = false, busy = false, lastAct = 0;
  var focusChar = null, locFilter = "all", godPending = null, imgBusy = {};
  var partySel = null, partySub = "info", questOpen = true;
  var saveT = null;
  // Riwayat log Ruang Dewa dipertahankan lintas re-render, biar "thinking…"
  // tidak hilang + user selalu lihat status loading.
  var savedGodLogHtml = "";
  // Input perintah dewa juga dipertahankan, biar ketikan tidak hilang saat
  // panel ke-render ulang (ambient/feed/portrait) tepat sebelum klik.
  var savedGodCmd = "";
  // Perintah tiap tombol "Jalankan" di log dewa. Dipetakan via id (bukan
  // closure), supaya tombol tetap hidup setelah log di-restore lintas
  // re-render (innerHTML melepas listener langsung, tapi data-attr tetap).
  var godBtnCmds = {}, godBtnSeq = 0;
  function cmdFromGodItem(item) {
    try {
      var c = item.cloneNode(true);
      var subs = c.querySelectorAll(".wd-godthink,.wd-row,.wd-warn,.wd-donenote,.wd-runstat");
      for (var i = 0; i < subs.length; i++) subs[i].remove();
      var t = String(c.textContent || "");
      t = t.replace(/^[\s\S]*?👑\s*(Kamu|You)\s*:/, "").trim();
      return t.slice(0, 300);
    } catch (e) { return ""; }
  }
  function wireGodLogButtons() {
    try {
      var box = $("wd-godlog");
      if (!box || box.getAttribute("data-wired") === "1") return;
      box.setAttribute("data-wired", "1");
      box.addEventListener("click", function (ev) {
        var btn = null;
        try { btn = ev.target && ev.target.closest ? ev.target.closest("button[data-godbtn]") : null; } catch (e) { btn = null; }
        if (!btn || !box.contains(btn)) return;
        if (btn.getAttribute("data-done") === "1" || btn.disabled) return;
        var id = btn.getAttribute("data-godbtn");
        var rec = (id && godBtnCmds[id]) || null;
        if (!rec || !rec.cmd) return;
        if (busy) { toast(T("busy")); return; }
        godRun(rec.cmd, !!rec.forced, btn);
      });
      // Backfill: tombol lama (dibuat sebelum sistem id) dihidupkan lagi
      // dengan membaca perintah dari item diskusinya.
      var btns = box.querySelectorAll("button:not([data-godbtn])");
      for (var i = 0; i < btns.length; i++) {
        (function (btn) {
          if (btn.getAttribute("data-done") === "1") return;
          var item = btn.closest ? btn.closest(".wd-goditem") : null;
          var cmd = item ? cmdFromGodItem(item) : "";
          if (!cmd) return;
          var txt = String(btn.textContent || "");
          var forced = /Tetap|Force/i.test(txt) || btn.classList.contains("danger");
          godBtnSeq += 1;
          var nid = "g" + Date.now().toString(36) + godBtnSeq;
          godBtnCmds[nid] = { cmd: cmd, forced: forced };
          btn.setAttribute("data-godbtn", nid);
        })(btns[i]);
      }
    } catch (e) {}
  }
  function paintGodBusy() {
    try {
      var isB = !!busy;
      var ask = $("wd-godask"), run = $("wd-godrun"), cmd = $("wd-godcmd");
      var thinkTxt = (typeof T === "function") ? T("thinking") : "…";
      var runTxt = (WL() === "en") ? "⏳ Running…" : "⏳ Menjalankan…";
      if (ask) { ask.disabled = isB; ask.innerHTML = isB ? "<span class='wd-spin'></span> " + esc(thinkTxt) : esc(T("bDiscuss")); }
      if (run) { run.disabled = isB; run.innerHTML = isB ? "<span class='wd-spin'></span> " + esc(runTxt) : esc(T("bRun")); }
      if (cmd) { cmd.disabled = isB; cmd.placeholder = isB ? ((WL() === "en") ? "⏳ God is working, please wait…" : "⏳ Dewa sedang bekerja, tunggu ya…") : T("godPh"); }
      var st = $("wd-godstatus");
      if (st) {
        if (isB) { st.hidden = false; st.innerHTML = "<span class='wd-spin'></span> " + esc((WL() === "en") ? "God is working — please wait, the result will appear below." : "Dewa sedang bekerja — tunggu ya, hasilnya muncul di bawah."); }
        else { st.hidden = true; st.innerHTML = ""; }
      }
    } catch (e) {}
  }

  function $(id) { return document.getElementById(id); }
  function uid(p) { return (p || "w") + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clampA(n) { n = Math.round(Number(n) || 0); return Math.max(-100, Math.min(100, n)); }
  function clampStat(n, mx) { mx = (isFinite(mx) && mx > 0) ? mx : 100; n = Math.round(Number(n) || 0); return Math.max(0, Math.min(mx, n)); }
  function clampHp(n) { var m = 100; try { if (W && W.player && isFinite(Number(W.player.maxHp)) && Number(W.player.maxHp) > 0) m = Number(W.player.maxHp); } catch (e) {} n = Math.round(Number(n) || 0); return Math.max(0, Math.min(m, n)); }
  function stageOf(a) {
    var st = (WL() === "en") ? ["loyal", "warm", "neutral", "cold", "hostile"] : ["setia", "hangat", "netral", "dingin", "bermusuhan"];
    if (a >= 60) return st[0]; if (a >= 20) return st[1]; if (a > -20) return st[2]; if (a > -60) return st[3]; return st[4];
  }
  function langName(id) { for (var i = 0; i < LANGS.length; i++) if (LANGS[i].id === id) return LANGS[i].name; return "Bahasa Indonesia"; }
  function root() { try { return window.root || null; } catch (e) { return null; } }
  function aiReady() { var r = root(); return !!(r && r.generateText); }
  function locName(id) {
    if (!W) return "?";
    if (id === "__player") return "—";
    for (var i = 0; i < W.locations.length; i++) if (W.locations[i].id === id) return W.locations[i].name;
    return "?";
  }
  function charById(id) { if (!W) return null; for (var i = 0; i < W.chars.length; i++) if (W.chars[i].id === id) return W.chars[i]; return null; }

  function kvFolder() { try { var r = root(); return (r && r.kv && r.kv[KV_FOLDER]) ? r.kv[KV_FOLDER] : null; } catch (e) { return null; } }
  function save() {
    if (!W) return;
    try { normalizeWorld(); } catch (eN) {}
    W.updatedAt = Date.now();
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      try { var f = kvFolder(); if (f) f.set(KV_KEY, W); } catch (e) {}
      try { localStorage.setItem("t2iWorldBackup", JSON.stringify(W).slice(0, 900000)); } catch (e2) {}
    }, 400);
  }
 function normalizeWorld() {
   if (!W) return;
   if (!Array.isArray(W.exResidents)) W.exResidents = [];
   if (!Array.isArray(W.rumors)) W.rumors = [];
   if (!W.rot || typeof W.rot !== "object") W.rot = { on: true, ticks: 0, last: -99 };
   if (typeof W.rot.on !== "boolean") W.rot.on = true;
   if (!isFinite(W.rot.ticks)) W.rot.ticks = 0;
   if (!isFinite(W.rot.last)) W.rot.last = -99;
   if (!W.clock || typeof W.clock !== "object") W.clock = { day: 1, phase: 0, n: 0 };
   if (!isFinite(W.clock.day) || W.clock.day < 1) W.clock.day = 1;
   W.clock.phase = ((Number(W.clock.phase) || 0) % 4 + 4) % 4;
   if (!isFinite(W.clock.n)) W.clock.n = 0;
   if (!W.weather || !WX_L[W.weather.kind]) W.weather = { kind: "cerah" };
   if (W.player && !Array.isArray(W.player.items)) W.player.items = [];
   if (W.player) {
     if (!isFinite(W.player.coins)) W.player.coins = START_COINS;
     if (!isFinite(W.player.hp)) W.player.hp = START_HP;
     if (!isFinite(W.player.maxHp)) W.player.maxHp = 100;
     if (!isFinite(W.player.full)) W.player.full = START_FULL;
     if (!isFinite(W.player.energy)) W.player.energy = START_ENERGY;
     if (!isFinite(W.player.mana)) W.player.mana = START_MANA;
     if (!isFinite(W.player.maxMana)) W.player.maxMana = 100;
     if (!isFinite(W.player.level)) W.player.level = 1;
     if (!isFinite(W.player.xp)) W.player.xp = 0;
     if (!isFinite(W.player.kills)) W.player.kills = 0;
     if (typeof W.player.goal !== "string") W.player.goal = "";
     if (!Array.isArray(W.player.rankClaimed)) W.player.rankClaimed = [];
     if (typeof W.player.legendClaimed !== "boolean") W.player.legendClaimed = false;
     if (!W.player.ach || typeof W.player.ach !== "object") W.player.ach = {};
     if (W.player.legendClaimed) W.player.ach.legenda = 1;
     if (!W.player.stat || typeof W.player.stat !== "object") W.player.stat = {};
     ["boss", "sleep", "gather", "travel", "spell"].forEach(function (k) { if (!isFinite(Number(W.player.stat[k]))) W.player.stat[k] = 0; });
     if (!W.player.visited || typeof W.player.visited !== "object") W.player.visited = {};
     try { if (W.player.loc) W.player.visited[W.player.loc] = 1; } catch (eV) {}
      if (!W.player.equip || typeof W.player.equip !== "object") W.player.equip = { weapon: null, shield: null };
      try { ensureEquip(); } catch (eEQ) {}
      if (!Array.isArray(W.player.tomes)) W.player.tomes = [];
   }
    // MAGIC v2 migration: save lama tanpa elem/spell tetap jalan.
    try {
      if (W.player) {
        if (typeof W.player.elem !== "string" || !ELEM_INFO[W.player.elem] || W.player.elem === "alam" || W.player.elem === "gelap" || W.player.elem === "biasa") W.player.elem = "api";
        if (!magicById(W.player.spell)) W.player.spell = "api";
        if (!Array.isArray(W.player.tomes)) W.player.tomes = [];
      }
      if (W.encounter && typeof W.encounter === "object") {
        if (typeof W.encounter.elem !== "string" || !ELEM_INFO[W.encounter.elem]) W.encounter.elem = "biasa";
        if (!W.encounter.status || typeof W.encounter.status !== "object") W.encounter.status = { burn: 0, guard: 0, skip: false };
      }
    } catch (eMig) {}
    if (!Array.isArray(W.quests)) W.quests = [];
    if (!isFinite(Number(W.stepMiss))) W.stepMiss = 0;
    if (!W.offerCd || typeof W.offerCd !== "object") W.offerCd = {};
    if (typeof W.encounter === "undefined" || (W.encounter && typeof W.encounter !== "object")) W.encounter = null;
    if (Array.isArray(W.locations)) W.locations.forEach(function (l) {
      if (typeof l.cond !== "string") l.cond = ""; else l.cond = l.cond.slice(0, 80);
      if (typeof l.img !== "string") l.img = "";
    });
    if (!W.monImgs || typeof W.monImgs !== "object") W.monImgs = {};
    var ids = {};
    W.chars.forEach(function (c) { ids[c.id] = 1; });
    W.chars.forEach(function (c) {
      if (typeof c.pinned !== "boolean") c.pinned = false;
      if (!c.bonds || typeof c.bonds !== "object") c.bonds = {};
      Object.keys(c.bonds).forEach(function (k) { if (!ids[k]) delete c.bonds[k]; });
      if (typeof c.mood !== "string" || !c.mood) c.mood = neutralMood();
      if (typeof c.moodWhy !== "string") c.moodWhy = "";
      if (typeof c.act !== "string") c.act = "";
      if (!isFinite(c.actTs)) c.actTs = 0;
      if (!Array.isArray(c.items)) c.items = [];
      c.items = c.items.map(function (x) { return String(x).slice(0, 40); }).filter(function (x) { return !!x; }).slice(0, MAX_ITEMS_N);
      try { if (W && W.genre === "fantasy") ensureShop(c); } catch (e) {}
      if (!isFinite(c.lastOffer)) c.lastOffer = 0;
    });
    try { if (window.WorldTiles && window.WorldTiles.backfill) window.WorldTiles.backfill(W); } catch (eT) {}
  }
  async function load() {
    var f = null;
    for (var i = 0; i < 30 && !f; i++) { f = kvFolder(); if (!f) await new Promise(function (r) { setTimeout(r, 200); }); }
    if (f) { try { var v = await f.get(KV_KEY); if (v && v.v === 1 && Array.isArray(v.chars)) { W = v; if (!W.uiLang) { W.uiLang = uiLangCur; } normalizeWorld(); return; } } catch (e) {} }
    try { var b = localStorage.getItem("t2iWorldBackup"); if (b) { var o = JSON.parse(b); if (o && o.v === 1) { W = o; if (!W.uiLang) { W.uiLang = uiLangCur; } normalizeWorld(); } } } catch (e2) {}
  }

  function snapshot(label) {
    return { id: uid("c"), ts: Date.now(), label: String(label || "Checkpoint").slice(0, 90),
      snap: JSON.parse(JSON.stringify({ chars: W.chars, feed: W.feed.slice(-MAX_FEED), locations: W.locations, lore: { premise: W.premise, rules: W.rules, tone: W.tone }, player: W.player, worldMems: W.worldMems, exResidents: (W.exResidents || []), rumors: (W.rumors || []), quests: (W.quests || []), rot: (W.rot || { on: true, ticks: 0, last: -99 }), clock: (W.clock || { day: 1, phase: 0, n: 0 }), weather: (W.weather || { kind: "cerah" }), encounter: (W.encounter || null), monImgs: (W.monImgs || {}), counter: 0 })) };
  }
  function addCheckpoint(label) {
    W.checkpoints.push(snapshot(label));
    while (W.checkpoints.length > MAX_CP) W.checkpoints.shift();
    save();
  }
  function pushFeed(m) {
    m.id = m.id || uid("m"); m.ts = m.ts || Date.now();
    W.feed.push(m);
    while (W.feed.length > MAX_FEED) W.feed.shift();
    W.counter = (W.counter || 0) + 1;
    lastAct = Date.now();
    if (W.counter >= CP_EVERY) { W.counter = 0; addCheckpoint(C("cpAuto") + (m.text || m.who || "event").slice(0, 42)); }
    save();
    try { checkAch(); } catch (eAC) {}
  }

  /* ---------- keyword memory (pola chat-engine) ---------- */
  function keywordsOf(s) {
    var out = [], seen = {};
    var toks = String(s || "").toLowerCase().match(/[a-z0-9\u00c0-\u024f]+/gi) || [];
    for (var i = 0; i < toks.length; i++) {
      var w = toks[i].toLowerCase();
      if (w.length < 3 || seen[w] || STOP[w] || /^\d+$/.test(w)) continue;
      seen[w] = 1; out.push(w);
      if (w.length >= 6) { var st = w.replace(/(ku|mu|nya)$/, ""); if (st.length >= 3 && st !== w && !seen[st]) { seen[st] = 1; out.push(st); } }
    }
    return out;
  }
  function recallFor(charObj, query) {
    var mems = charObj && Array.isArray(charObj.mems) ? charObj.mems : [];
    var all = mems.concat((W.worldMems || []).map(function (m) { return { text: m.text }; }));
    if (!all.length) return "";
    var q = keywordsOf(query), scored = [];
    all.forEach(function (m) {
      if (!m || !m.text) return;
      var kw = Array.isArray(m.kw) && m.kw.length ? m.kw : keywordsOf(m.text);
      var s = 0;
      for (var i = 0; i < q.length; i++) for (var j = 0; j < kw.length; j++) {
        var a = q[i], b = String(kw[j]).toLowerCase();
        if (a === b || (a.length >= 4 && b.length >= 4 && (a.indexOf(b) === 0 || b.indexOf(a) === 0))) { s++; break; }
      }
      if (s > 0) scored.push({ m: m, s: s });
    });
    scored.sort(function (a, b) { return b.s - a.s; });
    var top = scored.slice(0, 4).map(function (x) { return "- " + String(x.m.text).slice(0, 300); });
    if (!top.length) return "";
    return (WL() === "en")
      ? "[Relevant memories (these really happened; use naturally, never mention a database):\n" + top.join("\n") + "\n]"
      : "[Ingatan relevan (terjadi sungguhan, pakai natural, jangan sebut database):\n" + top.join("\n") + "\n]";
  }
  var extracting = false;
  function maybeExtract() {
    if (extracting || !aiReady() || !W) return;
    var chats = W.feed.filter(function (m) { return m.kind === "chat"; });
    if (!chats.length || chats.length % 6 !== 0) return;
    extracting = true;
    var tail = chats.slice(-6).map(function (m) { return m.who + ": " + m.text; }).join("\n").slice(-3000);
    var p = (WL() === "en")
      ? "Extract lasting facts from this roleplay chat (names, promises, relations, events, items, places). Max 5 lines, format: keyword1, keyword2 | one fact. Language: " + langName(W.lang) + ".\n\nCHAT:\n" + tail
      : "Ambil fakta tahan-lama dari chat roleplay ini (nama, janji, relasi, event, item, tempat). Maks 5 baris, format: keyword1, keyword2 | satu fakta. Bahasa: " + langName(W.lang) + ".\n\nCHAT:\n" + tail;
    try {
      Promise.resolve(root().generateText(p)).then(function (res) {
        extracting = false;
        try {
          var txt = String(res && res.text != null ? res.text : res || "");
          var added = 0;
          txt.split(/\n+/).forEach(function (line) {
            var m = line.replace(/^[-*\d.)\s]+/, "").match(/^([^|]{2,120})\|(.+)$/);
            if (!m || added >= 5) return;
            var kws = m[1].split(/[,;]/).map(function (w) { return w.trim().toLowerCase(); }).filter(Boolean).slice(0, 6);
            var fact = m[2].trim().slice(0, 300);
            if (fact.length < 10) return;
            var target = null;
            for (var i = 0; i < W.chars.length; i++) if (fact.toLowerCase().indexOf(W.chars[i].name.toLowerCase()) !== -1) { target = W.chars[i]; break; }
            var rec = { id: uid("mm"), text: fact, kw: kws.length ? kws : keywordsOf(fact), ts: Date.now() };
            if (target) { target.mems = target.mems || []; target.mems.push(rec); while (target.mems.length > MAX_MEM) target.mems.shift(); }
            else { W.worldMems = W.worldMems || []; W.worldMems.push(rec); while (W.worldMems.length > MAX_WMEM) W.worldMems.shift(); }
            added++;
          });
          if (added) { save(); renderCast(); }
        } catch (e) {}
      }, function () { extracting = false; });
    } catch (e) { extracting = false; }
  }

  /* ---------- prompt ---------- */
  function worldHead() {
    var L = [];
    if (WL() === "en") {
      L.push("World: " + W.name + " (" + genreWord() + " genre). MANDATORY language: " + langName(W.lang) + " — the ENTIRE reply only in that language, no mixing.");
      L.push("Premise: " + (W.premise || "-"));
      L.push("World rules (NEVER break them except by explicit divine order): " + (W.rules || "-"));
      L.push("Time now: Day " + ((W.clock && W.clock.day) || 1) + ", " + phaseNameWL(W.clock && W.clock.phase) + ". Weather: " + wxNameWL(wxKind()) + ". Let the time of day and weather show naturally (light, activity, clothing, plans).");
      L.push("Locations: " + W.locations.map(function (l) { return l.name + (l.cond ? " [" + l.cond + "]" : "") + " (" + l.desc + ")"; }).join(" | "));
      L.push("Characters:");
      W.chars.forEach(function (c) {
        L.push("- " + c.name + " [" + c.role + ", in " + locName(c.loc) + ", relation to user: " + stageOf(c.affinity) + " (" + c.affinity + ")] — " + c.personality + " Goal: " + c.goal + (c.desc ? " | " + c.desc : "") + " Mood: " + moodOf(c) + (c.moodWhy ? " (" + c.moodWhy + ")" : "") + ((c.items && c.items.length) ? " Carries: " + c.items.join(", ") + "." : ""));
      });
      var __bs = bondsSummary();
      if (__bs) L.push("Bonds (NPC-NPC feelings, directional): " + __bs + ".");
      if (W.mode === "player") L.push("User plays as: " + W.player.name + " (in " + locName(W.player.loc) + ", Lv " + pLevel() + " Rank " + rankOf(pLevel()) + ", kills " + (Number(W.player.kills) || 0) + ")" + (W.player.desc ? " — " + W.player.desc : "") + " Stats: HP " + clampStat(W.player.hp) + "/" + (Number(W.player.maxHp) || 100) + ", Full " + clampStat(W.player.full) + "/100, Energy " + clampStat(W.player.energy) + "/100, Mana " + clampStat(W.player.mana) + "/100, Coins " + (Number(W.player.coins) || 0) + "." + (W.player.items && W.player.items.length ? " Carries: " + W.player.items.join(", ") + " (weapon bonus +" + weaponPower() + ")." : " Carries: nothing.") + (W.encounter ? " IN COMBAT with " + W.encounter.name + " (HP " + Math.max(0, Math.round(W.encounter.hp)) + "/" + W.encounter.maxHp + ")." : ""));
     try {
       if (W.genre === "fantasy") {
         var __shops = [];
         W.chars.forEach(function (cc) { try { var ss = cc.shop || ensureShop(cc); if (ss && ss.stock) __shops.push(cc.name + "@" + locName(cc.loc) + ": " + ss.stock.map(function (e) { return e.name + " " + priceFor(cc, e) + "c" + (e.qty <= 0 ? "(empty)" : ""); }).join(", ")); } catch (e) {} });
         if (__shops.length) L.push("Shops (player must PAY coins, stock is real): " + __shops.join(" | ") + ".");
         var __qs = (W.quests || []).filter(function (q) { return q.state === "active" || q.state === "offered"; }).slice(-4).map(function (q) { return q.giverName + ": " + q.needQty + "x " + q.need + " -> " + q.rewardCoins + "c (" + q.state + ")"; });
         if (__qs.length) L.push("Active quests: " + __qs.join("; ") + ". NPCs remember deals; do not give free items.");
         L.push("Survival: user gets hungry/tired. Food/sleep cost time and coins. Never hand out free legendary items.");
       }
     } catch (e) {}
      try {
       if (W.genre === "fantasy" && W.mode === "player") {
         var __mg = unlockedMagics().map(function (s) { return s.emoji + " " + s.en + "(" + s.elem + ", " + s.cost + "mp, Lv" + s.lvl + ")"; }).join(" | ");
         L.push("Magic the user knows: " + __mg + ". Affinity element: " + (W.player.elem || "api") + " (+15% dmg same element). Chart: Fire> Nature/Ice/Wind; Ice> Earth/Wind/Nature; Lightning> Ice/Nature; Wind> Earth; Earth> Fire/Lightning; Holy> Dark. Never invent new spells.");
          try {
            var __locked = MAGICS.filter(function (s) { return !hasSpell(s.id); }).map(function (s) { return s.en + " (" + tomeNameFor(s.id) + " " + TOME_PRICE[s.id] + "c)"; });
            if (__locked.length) L.push("Locked spells can be bought as tomes in shops (blacksmith/healer/guild): " + __locked.join(" | ") + ". Staffs: Tongkat Sihir +2, Archmage +5 magic dmg. Ramuan Mana restores 40 mana.");
          } catch (eShop) {}
          if (W.encounter) L.push("Enemy " + W.encounter.name + " element: " + (W.encounter.elem || "biasa") + ", weak vs: " + (weakHint(W.encounter.elem).join(", ") || "none") + ".");
        }
      } catch (eM) {}
      if (W.mode === "player") L.push("IMPORTANT: the user is just another inhabitant, NOT the protagonist. NPCs have their own needs, duties and affairs. They come and go for in-world reasons (work, family, duty, fatigue, business elsewhere) — never because of interaction frequency, never to please or orbit the user.");
      else L.push("The user is the GOD narrator (not in chat). Characters do not know a god exists unless the god declares itself.");
    } else {
      L.push("Dunia: " + W.name + " (genre " + W.genre + "). Bahasa WAJIB: " + langName(W.lang) + " — SELURUH balasan HANYA bahasa itu, jangan campur.");
      L.push("Premis: " + (W.premise || "-"));
      L.push("Aturan dunia (TIDAK boleh dilanggar kecuali perintah dewa eksplisit): " + (W.rules || "-"));
      L.push("Waktu sekarang: Hari ke-" + ((W.clock && W.clock.day) || 1) + ", " + phaseNameWL(W.clock && W.clock.phase) + ". Cuaca: " + wxNameWL(wxKind()) + ". Tampilkan waktu dan cuaca secara natural (cahaya, aktivitas, pakaian, rencana).");
      L.push("Lokasi: " + W.locations.map(function (l) { return l.name + (l.cond ? " [" + l.cond + "]" : "") + " (" + l.desc + ")"; }).join(" | "));
      L.push("Karakter:");
      W.chars.forEach(function (c) {
        L.push("- " + c.name + " [" + c.role + ", di " + locName(c.loc) + ", relasi ke user: " + stageOf(c.affinity) + " (" + c.affinity + ")] — " + c.personality + " Tujuan: " + c.goal + (c.desc ? " | " + c.desc : "") + " Mood: " + moodOf(c) + (c.moodWhy ? " (" + c.moodWhy + ")" : "") + ((c.items && c.items.length) ? " Bawa: " + c.items.join(", ") + "." : ""));
      });
      var __bsi = bondsSummary();
      if (__bsi) L.push("Ikatan (perasaan NPC-NPC, terarah): " + __bsi + ".");
      if (W.mode === "player") L.push("User bermain sebagai: " + W.player.name + " (di " + locName(W.player.loc) + ", Lv " + pLevel() + " Rank " + rankOf(pLevel()) + ", kill " + (Number(W.player.kills) || 0) + ")" + (W.player.desc ? " — " + W.player.desc : "") + " Stat: HP " + clampStat(W.player.hp) + "/" + (Number(W.player.maxHp) || 100) + ", Kenyang " + clampStat(W.player.full) + "/100, Energi " + clampStat(W.player.energy) + "/100, Mana " + clampStat(W.player.mana) + "/100, Koin " + (Number(W.player.coins) || 0) + "." + (W.player.items && W.player.items.length ? " Bawa: " + W.player.items.join(", ") + " (bonus senjata +" + weaponPower() + ")." : " Bawa: kosong.") + (W.encounter ? " SEDANG TARUNG lawan " + W.encounter.name + " (HP " + Math.max(0, Math.round(W.encounter.hp)) + "/" + W.encounter.maxHp + ")." : ""));
     try {
       if (W.genre === "fantasy") {
         var __shops2 = [];
         W.chars.forEach(function (cc) { try { var ss = cc.shop || ensureShop(cc); if (ss && ss.stock) __shops2.push(cc.name + "@" + locName(cc.loc) + ": " + ss.stock.map(function (e) { return e.name + " " + priceFor(cc, e) + "k" + (e.qty <= 0 ? "(habis)" : ""); }).join(", ")); } catch (e) {} });
         if (__shops2.length) L.push("Toko (player HARUS bayar koin, stok nyata): " + __shops2.join(" | ") + ".");
         var __qs2 = (W.quests || []).filter(function (q) { return q.state === "active" || q.state === "offered"; }).slice(-4).map(function (q) { return q.giverName + ": " + q.needQty + "x " + q.need + " -> " + q.rewardCoins + "k (" + q.state + ")"; });
         if (__qs2.length) L.push("Quest aktif: " + __qs2.join("; ") + ". NPC ingat transaksi; jangan bagi-bagi gratis.");
         L.push("Survival: user bisa lapar/lelah. Makan/tidur butuh waktu dan koin. Jangan kasih item legendaris gratis.");
       }
     } catch (e) {}
      try {
       if (W.genre === "fantasy" && W.mode === "player") {
         var __mg2 = unlockedMagics().map(function (s) { return s.emoji + " " + s.idn + "(" + s.elem + ", " + s.cost + "mp, Lv" + s.lvl + ")"; }).join(" | ");
         L.push("Sihir yang dikuasai user: " + __mg2 + ". Elemen afinitas: " + (W.player.elem || "api") + " (+15% dmg elemen sama). Chart: Api> Alam/Es/Angin; Es> Tanah/Angin/Alam; Petir> Es/Alam; Angin> Tanah; Tanah> Api/Petir; Cahaya> Gelap. Jangan karang sihir baru.");
          try {
            var __locked2 = MAGICS.filter(function (s) { return !hasSpell(s.id); }).map(function (s) { return s.idn + " (" + tomeNameFor(s.id) + " " + TOME_PRICE[s.id] + "k)"; });
            if (__locked2.length) L.push("Sihir terkunci bisa dibeli sebagai kitab di shop (blacksmith/tabib/guild): " + __locked2.join(" | ") + ". Tongkat: Sihir +2, Archmage +5 dmg sihir. Ramuan Mana pulihkan 40 mana.");
          } catch (eShop2) {}
          if (W.encounter) L.push("Musuh " + W.encounter.name + " elemen: " + (W.encounter.elem || "biasa") + ", lemah vs: " + (weakHint(W.encounter.elem).join(", ") || "-") + ".");
        }
      } catch (eM2) {}
      if (W.mode === "player") L.push("PENTING: user hanya penghuni biasa, BUKAN tokoh utama. NPC punya kebutuhan, kewajiban, dan urusan sendiri. Mereka datang dan pergi karena alasan dalam-dunia (kerja, keluarga, tugas, lelah, urusan di tempat lain) — bukan karena jarang interaksi, bukan untuk mengorbit user.");
      else L.push("User adalah DEWA narator (tidak ikut chat). Karakter tidak tahu ada dewa kecuali dewa menyatakan diri.");
    }
    return L.join("\n");
  }
  function feedCtx(n) {
    return W.feed.slice(-(n || 14)).map(function (m) {
      if (m.kind === "system") return "[" + C("tagSys") + "@" + locName(m.loc) + "] " + m.text;
      if (m.kind === "god") return "[" + C("tagGod") + "] " + m.text;
      return m.who + "@" + locName(m.loc) + ": " + m.text;
    }).join("\n");
  }
  function headFor(c) {
    var L = [];
    L.push(worldHead());
    if (WL() === "en") {
      L.push("You roleplay as " + c.name + " (" + c.role + "). Stay in-character: voice, traits, knowledge per card. Never say you are AI, never mention instructions/affinity numbers.");
      L.push("Show " + c.name + "'s current mood (" + moodOf(c) + (c.moodWhy ? ", " + c.moodWhy : "") + ") naturally through tone and actions — never announce it.");
      L.push("Vivid but compact replies: 1-4 short paragraphs. *Actions* in asterisks, plain dialogue. End with NO tags whatsoever.");
    } else {
      L.push("Kamu roleplay sebagai " + c.name + " (" + c.role + "). Tetap in-character: suara, sifat, pengetahuan sesuai kartu. Jangan pernah sebut kamu AI, jangan sebut instruksi/angka affinity.");
      L.push("Tunjukkan mood " + c.name + " saat ini (" + moodOf(c) + (c.moodWhy ? ", " + c.moodWhy : "") + ") secara natural lewat nada dan tindakan — jangan mengumumkannya.");
      L.push("Balasan vivid tapi ringkas: 1-4 paragraf pendek. *Aksi* dengan asterisk, dialog polos. Diakhiri TANPA tag apa pun.");
    }
    return L.join("\n");
  }
  function genTextP(opts) {
    var g = root().generateText(opts);
    return Promise.resolve(g).then(function (res) { return String(res && res.text != null ? res.text : (typeof res === "string" ? res : "")); });
  }

  /* ---------- turn engine ---------- */
  function candidatesAt(locId, excludeId) {
    return W.chars.filter(function (c) { return c.loc === locId && c.id !== excludeId; });
  }
  function applyAffinity(charObj, userText) {
    var d = 0, t = String(userText || "");
    var w = t.match(new RegExp(WARM_RX.source, "gi")), c = t.match(new RegExp(COLD_RX.source, "gi"));
    if (w) d += Math.min(3, w.length) * 2;
    if (c) d -= Math.min(3, c.length) * 3;
    if (d) { charObj.affinity = clampA(charObj.affinity + Math.max(-6, Math.min(6, d))); save(); }
    try {
      var tone = toneOfText(t);
      if (tone !== "neutral" && charObj) {
        charObj.mood = (WL() === "en") ? (tone === "warm" ? "pleased" : "annoyed") : (tone === "warm" ? "senang" : "kesal");
        charObj.moodWhy = ((WL() === "en") ? "after talking with " : "sehabis bicara dengan ") + (W && W.player ? W.player.name : "?");
      }
    } catch (eM) {}
  }
  /* ---------- B: bonds (NPC-NPC) + mood + gossip ---------- */
  function charByName(nm) {
    if (!W || !nm) return null;
    var s = String(nm).toLowerCase();
    for (var i = 0; i < W.chars.length; i++) if (W.chars[i].name.toLowerCase() === s) return W.chars[i];
    return null;
  }
  function neutralMood() { return (WL() === "en") ? "relaxed" : "santai"; }
  function moodOf(c) { return (c && typeof c.mood === "string" && c.mood) ? c.mood : neutralMood(); }
  function bondOf(c, otherId) { if (!c || !c.bonds) return 0; var v = Number(c.bonds[otherId]); return isFinite(v) ? Math.max(-100, Math.min(100, Math.round(v))) : 0; }
  function setBond(c, otherId, v) {
    if (!c || !otherId || (c.id && c.id === otherId)) return;
    c.bonds = c.bonds || {};
    c.bonds[otherId] = Math.max(-100, Math.min(100, Math.round(v)));
  }
  function toneOfText(t) {
    var s = String(t || "");
    var w = s.match(new RegExp(WARM_RX.source, "gi")), c = s.match(new RegExp(COLD_RX.source, "gi"));
    var nw = w ? w.length : 0, nc = c ? c.length : 0;
    if (nc > nw && nc > 0) return "cold";
    if (nw > nc && nw > 0) return "warm";
    return "neutral";
  }
  function detectMentions(text, excludeIds) {
    var out = [], low = String(text || "").toLowerCase(), ex = {};
    (excludeIds || []).forEach(function (id) { ex[id] = 1; });
    for (var i = 0; i < W.chars.length; i++) {
      var c = W.chars[i];
      if (ex[c.id]) continue;
      if (c.name && low.indexOf(c.name.toLowerCase()) !== -1) out.push(c);
      if (out.length >= 2) break;
    }
    return out;
  }
  function addRumor(aboutId, toId, text, tone) {
    if (!W || !aboutId || !toId) return;
    W.rumors = W.rumors || [];
    W.rumors.push({ id: uid("r"), about: aboutId, to: toId, text: String(text || "").slice(0, 140), tone: tone, spread: 0, ts: Date.now() });
    while (W.rumors.length > 10) W.rumors.shift();
  }
  function pickGossip(pair) {
    if (!W || !W.rumors || !W.rumors.length) return null;
    var cands = W.rumors.filter(function (r) {
      return (r.to === pair[0].id || r.to === pair[1].id) && r.about !== pair[0].id && r.about !== pair[1].id && (r.spread || 0) < 2 && charById(r.about);
    });
    if (!cands.length || Math.random() > 0.35) return null;
    var r = cands[Math.floor(Math.random() * cands.length)];
    var teller = (pair[0].id === r.to) ? pair[0] : pair[1];
    var other = (teller === pair[0]) ? pair[1] : pair[0];
    return { r: r, teller: teller, other: other, about: charById(r.about) };
  }
  function topBondOf(c) {
    var best = null;
    if (W && c && c.bonds) Object.keys(c.bonds).forEach(function (oid) {
      var o = charById(oid);
      if (!o) return;
      var v = bondOf(c, oid);
      if (!best || Math.abs(v) > Math.abs(best.v)) best = { name: o.name, v: v };
    });
    return best;
  }
  function bondsSummary() {
    if (!W) return "";
    var rows = [];
    W.chars.forEach(function (c) {
      if (!c.bonds) return;
      Object.keys(c.bonds).forEach(function (oid) {
        var o = charById(oid);
        if (!o) return;
        var v = bondOf(c, oid);
        if (Math.abs(v) >= 15) rows.push({ k: Math.abs(v), s: c.name + "→" + o.name + " " + stageOf(v) + " (" + v + ")" });
      });
    });
    rows.sort(function (a, b) { return b.k - a.k; });
    return rows.slice(0, 8).map(function (r) { return r.s; }).join("; ");
  }
  /* ---------- D: presence (ephemeral typing + last activity, no extra AI) ---------- */
  var liveTyping = {};
  function setAct(cOrId, label) {
    var c = (typeof cOrId === "string") ? charById(cOrId) : cOrId;
    if (!c || !W) return;
    c.act = String(label || "").replace(/^\*+|\*+$/g, "").trim().slice(0, 90);
    c.actTs = Date.now();
    try { save(); } catch (e) {}
    paintStatusDom(c.id);
  }
  function agoStr(ts) {
    if (!ts) return "";
    var s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return T("justNow");
    return T("minAgo", { n: Math.floor(s / 60) });
  }
  function statusOf(c) {
    if (!c) return "";
    if (liveTyping[c.id]) return "✍️ " + T("typing");
    var fresh = c.act && c.actTs && (Date.now() - c.actTs < 10 * 60 * 1000);
    if (fresh) return "✦ " + c.act + " · " + agoStr(c.actTs);
    return "📍 " + T("stAt", { loc: locName(c.loc) });
  }
  function paintStatusDom(id) {
    try {
      if (!rootEl) return;
      var c = charById(id);
      if (!c) return;
      rootEl.querySelectorAll("[data-st-for='" + id + "']").forEach(function (el) { el.textContent = statusOf(c); });
    } catch (e) {}
  }
  function doneTyping(c, actLabel) {
    try { if (c && c.id && liveTyping[c.id]) delete liveTyping[c.id]; } catch (e) {}
    if (c && actLabel) setAct(c, actLabel);
    else if (c) paintStatusDom(c.id);
  }
  /* ---------- C: clock + weather + location condition + mini inventory ---------- */
  var MAX_ITEMS = 6;
  var PHASE_L = { en: ["Morning", "Afternoon", "Evening", "Night"], id: ["Pagi", "Siang", "Sore", "Malam"] };
  var PHASE_EMOJI = ["🌅", "☀️", "🌇", "🌙"];
  var WX_L = {
    cerah: { en: "clear", id: "cerah", emoji: "☀️" },
    berawan: { en: "cloudy", id: "berawan", emoji: "☁️" },
    hujan: { en: "rainy", id: "hujan", emoji: "🌧️" },
    berangin: { en: "windy", id: "berangin", emoji: "🌬️" },
    berkabut: { en: "foggy", id: "berkabut", emoji: "🌫️" }
  };
  var WX_IDS = ["cerah", "berawan", "hujan", "berangin", "berkabut"];
  function phaseNameWL(i) { var a = PHASE_L[WL()] || PHASE_L.id; i = ((Number(i) || 0) % 4 + 4) % 4; return a[i]; }
  function phaseNameUI(i) { var a = PHASE_L[effUi()] || PHASE_L.id; i = ((Number(i) || 0) % 4 + 4) % 4; return a[i]; }
  function wxKind() { return (W && W.weather && WX_L[W.weather.kind]) ? W.weather.kind : "cerah"; }
  function wxNameWL(k) { var m = WX_L[k] || WX_L.cerah; return (WL() === "en") ? m.en : m.id; }
  function wxNameUI(k) { var m = WX_L[k] || WX_L.cerah; return (effUi() === "id") ? m.id : m.en; }
  function clockLine() {
    if (!W || !W.clock) return "";
    return "📅 " + T("dayWord") + " " + (W.clock.day || 1) + " · " + PHASE_EMOJI[((W.clock.phase || 0) % 4 + 4) % 4] + " " + phaseNameUI(W.clock.phase) + " · " + WX_L[wxKind()].emoji + " " + wxNameUI(wxKind());
  }
 function nextPhase() {
   if (!W) return;
   if (!W.clock || typeof W.clock !== "object") W.clock = { day: 1, phase: 0, n: 0 };
   W.clock.phase = (((W.clock.phase || 0) + 1) % 4 + 4) % 4;
   if (W.clock.phase === 0) {
     W.clock.day = (W.clock.day || 1) + 1;
     pushFeed({ kind: "system", loc: null, text: C("newDay", { d: W.clock.day, phase: phaseNameWL(0) }) });
      try { if (W.genre === "fantasy") restockShops(); } catch (e) {}
   }
    try { if (W && W.genre === "fantasy") tickSurvival(1); } catch (e) {}
   weatherDrift();
   save();
 }
  function advanceClock(steps) {
    if (!W) return;
    if (!W.clock || typeof W.clock !== "object") W.clock = { day: 1, phase: 0, n: 0 };
    W.clock.n = (W.clock.n || 0) + (steps || 1);
    while (W.clock.n >= 2) { W.clock.n -= 2; nextPhase(); }
    save();
  }
  function weatherDrift() {
    if (!W || Math.random() > 0.3) return;
    var cur = wxKind(), pool = WX_IDS.filter(function (k) { return k !== cur; });
    setWeather(pool[Math.floor(Math.random() * pool.length)]);
  }
  function setWeather(kind) {
    if (!W || !WX_L[kind]) return false;
    if (!W.weather) W.weather = { kind: "cerah" };
    if (W.weather.kind === kind) return false;
    W.weather.kind = kind;
    pushFeed({ kind: "system", loc: null, text: C("wxChange", { emoji: WX_L[kind].emoji, wx: wxNameWL(kind) }) });
    save(); renderAll(); scrollFeed();
    return true;
  }
  function whoChar(key) {
    if (!W || key == null) return null;
    var s = String(key);
    var c = charById(s) || charByName(s);
    if (c) return c;
    if (s === "__player" || (W.player && s.toLowerCase() === String(W.player.name || "").toLowerCase())) return W.player;
    return null;
  }
 function giveItem(key, item) {
   var o = whoChar(key); if (!o) return false;
   item = String(item == null ? "" : item).trim().slice(0, 40); if (!item) return false;
   o.items = Array.isArray(o.items) ? o.items : [];
    var cap = (o === W.player) ? MAX_ITEMS_P : MAX_ITEMS_N;
    o.items.push(item);
    while (o.items.length > cap) o.items.shift();
    save(); return true;
  }
  function takeItem(key, item) {
    var o = whoChar(key); if (!o || !Array.isArray(o.items)) return false;
    var s = String(item == null ? "" : item).trim().toLowerCase(); if (!s) return false;
    var idx = -1;
    for (var i = 0; i < o.items.length; i++) if (String(o.items[i]).toLowerCase() === s) { idx = i; break; }
    if (idx < 0) {
      for (var j = 0; j < o.items.length; j++) if (String(o.items[j]).toLowerCase().indexOf(s) !== -1 || s.indexOf(String(o.items[j]).toLowerCase()) !== -1) { idx = j; break; }
    }
    if (idx < 0) return false;
    o.items.splice(idx, 1);
    try { if (o === W.player) ensureEquip(); } catch (eEQ2) {}
    save(); return true;
  }
  // AI kadang menulis jumlah di dalam nama ("10 batang kayu") padahal sistem
  // butuh 1 nama bersih per string. Kembangkan jadi N salinan nama bersih
  // (maks 10 per string, 12 total) agar "10 kayu" benar-benar jadi 10.
  function expandItems(arr) {
    var out = [];
    (Array.isArray(arr) ? arr : [arr]).forEach(function (raw) {
      var s = String(raw == null ? "" : raw).trim().replace(/^["']+|["']+$/g, "").slice(0, 40);
      if (!s || out.length >= 12) return;
      var m = s.match(/^(\d{1,2})\s*x?\s+(.+)$/);
      if (m) {
        var n = Math.max(1, Math.min(10, parseInt(m[1], 10) || 1));
        var base = String(m[2] || "").trim().slice(0, 40);
        if (!base) return;
        for (var i = 0; i < n && out.length < 12; i++) out.push(base);
      } else {
        out.push(s);
      }
    });
    return out.slice(0, 12);
  }
  function countItem(o, name) {
    if (!o || !Array.isArray(o.items)) return 0;
    var s = String(name || "").toLowerCase(), n = 0;
    o.items.forEach(function (x) { if (String(x).toLowerCase() === s) n++; });
    if (!n) o.items.forEach(function (x) { var lx = String(x).toLowerCase(); if (lx.indexOf(s) !== -1 || s.indexOf(lx) !== -1) n++; });
    return n;
  }
  // Tumpuk item kembar untuk tampilan ("Herbal ×4") — data tetap 1 string
  // per item, hanya labelnya yang digabung. Urutan kemunculan pertama dijaga.
  function groupItems(arr) {
    var out = [], idx = {};
    (arr || []).forEach(function (x) {
      var s = String(x);
      if (idx[s] == null) { idx[s] = out.length; out.push({ name: s, n: 0 }); }
      out[idx[s]].n++;
    });
    return out;
  }
  function itemsLabel(arr, emptyWord) {
    var g = groupItems(arr);
    if (!g.length) return emptyWord;
    return g.map(function (e) { return e.n > 1 ? e.name + " ×" + e.n : e.name; }).join(", ");
  }
  function addCoins(n) { if (!W || !W.player) return; W.player.coins = Math.max(0, Math.round((Number(W.player.coins) || 0) + n)); try { checkLegend(); } catch (eCL) {} save(); }
  function spendCoins(n) { if (!W || !W.player) return false; n = Math.round(Number(n) || 0); if ((Number(W.player.coins) || 0) < n) return false; W.player.coins -= n; save(); return true; }
  function rpgStatusLine() {
    if (!W || !W.player) return "";
    var p = W.player;
    return "Lv" + pLevel() + " (" + rankOf(pLevel()) + ") ❤️ " + clampHp(p.hp) + "/" + ((Number(W.player.maxHp)) || 100) + " · 🍖 " + clampStat(p.full) + "/100 · ⚡ " + clampStat(p.energy) + "/100 · ✨ " + clampStat(p.mana) + "/100 · 🪙 " + (Number(p.coins) || 0) + " · 👾" + (Number(p.kills) || 0);
  }
  function tickSurvival(steps) {
    if (!W || !W.player || W.genre !== "fantasy") return;
    steps = steps || 1;
    var p = W.player;
    for (var i = 0; i < steps; i++) {
      p.full = clampStat((Number(p.full) || 0) - 3);
      p.energy = clampStat((Number(p.energy) || 0) - 4);
      p.mana = clampStat((Number(p.mana) || 0) + 4);
      if ((Number(p.full) || 0) <= 0) p.hp = clampHp((Number(p.hp) || 0) - 8);
      else if ((Number(p.energy) || 0) <= 0) p.hp = clampHp((Number(p.hp) || 0) - 5);
      else if ((Number(p.full) || 0) > 30 && (Number(p.energy) || 0) > 20) p.hp = clampHp((Number(p.hp) || 0) + 3);
    }
    if ((Number(p.hp) || 0) <= 0) {
      p.hp = 20; p.full = Math.max(Number(p.full) || 0, 25); p.energy = Math.max(Number(p.energy) || 0, 30);
      var home = W.locations[0];
      p.loc = home ? home.id : p.loc;
      pushFeed({ kind: "system", loc: p.loc, text: (WL() === "en" ? "💀 You collapsed from exhaustion and were carried home. Rest more, eat regularly." : "💀 Kamu pingsan kelelahan dan ditandu pulang. Istirahat dan makan yang teratur.") });
    }
    save();
  }
  function doEat(itemName) {
    if (!W || !W.player) return { ok: false };
    var p = W.player;
    var found = null;
    for (var i = 0; i < (p.items || []).length; i++) if (String(p.items[i]).toLowerCase() === String(itemName || "").toLowerCase()) { found = p.items[i]; break; }
    if (!found) {
      for (var j = 0; j < (p.items || []).length; j++) {
        var lx = String(p.items[j]).toLowerCase(), s = String(itemName || "").toLowerCase();
        if ((s && (lx.indexOf(s) !== -1 || s.indexOf(lx) !== -1)) || itemEffect(p.items[j])) { if (!itemName || lx.indexOf(s) !== -1 || s.indexOf(lx) !== -1) { found = p.items[j]; break; } }
      }
    }
    if (!found) {
      for (var k = 0; k < (p.items || []).length; k++) if (itemEffect(p.items[k])) { found = p.items[k]; break; }
    }
    if (!found) return { ok: false, why: "nofood" };
    var eff = itemEffect(found);
    if (!eff) return { ok: false, why: "notfood" };
    takeItem("__player", found);
    var locN = locName(p.loc);
    var mult = isFoodLoc(locN) ? 1 : 0.6;
    if (eff.full) p.full = clampStat((Number(p.full) || 0) + eff.full * mult);
    if (eff.hp) p.hp = clampHp((Number(p.hp) || 0) + eff.hp);
    if (eff.energy) p.energy = clampStat((Number(p.energy) || 0) + eff.energy);
    if (eff.mana) p.mana = clampStat((Number(p.mana) || 0) + eff.mana);
    tickSurvival(0);
    pushFeed({ kind: "chat", who: p.name, mine: true, loc: p.loc, text: (WL() === "en" ? "*eats " + found + "* (" : "*makan " + found + "* (") + rpgStatusLine() + ")" });
    save(); return { ok: true, item: found };
  }
  function doSleep() {
    if (!W || !W.player) return { ok: false };
    var p = W.player, locN = locName(p.loc);
    var safe = isRestLoc(locN), danger = isDangerLoc(locN);
    var gain = safe ? 70 : (danger ? 25 : 45);
    p.energy = clampStat((Number(p.energy) || 0) + gain);
    p.hp = clampHp((Number(p.hp) || 0) + (safe ? 15 : 5));
    p.full = clampStat((Number(p.full) || 0) - 8);
    p.mana = clampStat((Number(p.mana) || 0) + 15);
    try { bumpStat("sleep"); } catch (eS) {}
    W.clock.n = (W.clock.n || 0) + 1;
    pushFeed({ kind: "chat", who: p.name, mine: true, loc: p.loc, text: (WL() === "en" ? "*sleeps at " + locN + "* (+" + gain + " ⚡, +" + (safe ? 15 : 5) + " ❤️ · " : "*tidur di " + locN + "* (+" + gain + " ⚡, +" + (safe ? 15 : 5) + " ❤️ · ") + rpgStatusLine() + ")" });
    save(); return { ok: true, safe: safe };
  }
  function doGather() {
    if (!W || !W.player) return { ok: false };
    var p = W.player;
    if ((Number(p.energy) || 0) < 8) { toast(WL() === "en" ? "Too tired — sleep first." : "Terlalu lelah — tidur dulu."); return { ok: true, tired: true }; }
    try { bumpStat("gather"); } catch (eG) {}
    var locN = locName(p.loc);
    if (isDangerLoc(locN) && !W.encounter && Math.random() < 0.30) {
      var amb = spawnMonster();
      pushFeed({ kind: "system", loc: p.loc, text: (WL() === "en" ? "🌲 Rustling… wild " + amb.name + " ambushes you! (HP " + amb.hp + ") — ⚔️ fight or 🏃 flee!" : "🌲 Semak berdesir… " + amb.name + " liar menyergapmu! (HP " + amb.hp + ") — ⚔️ lawan atau 🏃 kabur!") });
      p.energy = clampStat((Number(p.energy) || 0) - 4);
      save(); renderAll(); scrollFeed(); return { ok: true, ambush: true };
    }
    var table = lootForLoc(locN), tot = 0, i;
    for (i = 0; i < table.length; i++) tot += table[i].w;
    var roll = Math.random() * tot, acc = 0, pick = table[table.length - 1].n;
    for (i = 0; i < table.length; i++) { acc += table[i].w; if (roll <= acc) { pick = table[i].n; break; } }
    p.energy = clampStat((Number(p.energy) || 0) - 8);
    p.full = clampStat((Number(p.full) || 0) - 2);
    tickSurvival(0);
    if (pick === "nothing") {
      pushFeed({ kind: "chat", who: p.name, mine: true, loc: p.loc, text: (WL() === "en" ? "*searches around " + locN + " but finds nothing*" : "*mencari-cari di " + locN + " tapi tidak menemukan apa-apa*") });
      save(); renderAll(); scrollFeed(); return { ok: true, empty: true };
    }
    if (pick === "koin-serabutan") {
      var pay = 4 + Math.floor(Math.random() * 4);
      addCoins(pay);
      gainXp(6);
      pushFeed({ kind: "chat", who: p.name, mine: true, loc: p.loc, text: (WL() === "en" ? "*does odd jobs around " + locN + " (+" + pay + " coins)* (" : "*kerja serabutan di " + locN + " (+" + pay + " koin)* (") + rpgStatusLine() + ")" });
      save(); renderAll(); scrollFeed(); return { ok: true, coins: pay };
    }
    if ((p.items || []).length >= MAX_ITEMS_P) { toast(WL() === "en" ? "Bag full!" : "Tas penuh!"); return { ok: true, full: true }; }
    giveItem("__player", pick);
    gainXp(4);
    pushFeed({ kind: "chat", who: p.name, mine: true, loc: p.loc, text: (WL() === "en" ? "*finds 1× " + pick + " at " + locN + "*" : "*menemukan 1× " + pick + " di " + locN + "*") });
    save(); renderAll(); scrollFeed(); return { ok: true, item: pick };
  }
  function doBuy(sellerId, itemName) {
    var c = charById(sellerId); if (!c || !W) return { ok: false };
    if (c.loc !== W.player.loc) return { ok: false, why: "remote", loc: c.loc };
    var shop = ensureShop(c); if (!shop) return { ok: false };
    var s = String(itemName || "").toLowerCase(), entry = null;
    for (var i = 0; i < shop.stock.length; i++) if (shop.stock[i].name.toLowerCase() === s) entry = shop.stock[i];
    if (!entry) for (var j = 0; j < shop.stock.length; j++) { var ln = shop.stock[j].name.toLowerCase(); if (ln.indexOf(s) !== -1 || (s && s.indexOf(ln) !== -1)) { entry = shop.stock[j]; break; } }
    if (!entry) return { ok: false, why: "nostock" };
    if ((Number(entry.qty) || 0) <= 0 && !entry.service) return { ok: false, why: "empty" };
    var price = priceFor(c, entry);
    if ((Number(W.player.coins) || 0) < price) return { ok: false, why: "nomoney", price: price };
    if (entry.service === "repair") {
      var hasBroken = (W.player.items || []).some(function (x) { return /rusak|retak|tumpul|broken|cracked|dull/i.test(String(x)); });
      if (!hasBroken) return { ok: false, why: "norepair" };
      spendCoins(price); entry.qty = 99; shop.coins = (Number(shop.coins) || 0) + price;
      for (var k = 0; k < W.player.items.length; k++) W.player.items[k] = String(W.player.items[k]).replace(/rusak|retak|tumpul|broken|cracked|dull/ig, "").trim() || W.player.items[k];
      c.affinity = clampA((Number(c.affinity) || 0) + 4);
      pushFeed({ kind: "chat", who: W.player.name, mine: true, loc: W.player.loc, text: (WL() === "en" ? "*pays " + price + " coins to " + c.name + " for repairs*" : "*bayar " + price + " koin ke " + c.name + " untuk perbaikan*") });
      pushFeed({ kind: "chat", who: c.name, loc: c.loc, text: (WL() === "en" ? "*hammers and sharpens* Done. Like new." : "*menempa dan mengasah* Beres. Kayak baru.") });
      save(); return { ok: true, service: true };
    }
   if (entry.service === "heal") {
     spendCoins(price); shop.coins = (Number(shop.coins) || 0) + price;
     W.player.hp = clampHp((Number(W.player.hp) || 0) + 60);
     W.player.energy = clampStat((Number(W.player.energy) || 0) + 20);
     c.affinity = clampA((Number(c.affinity) || 0) + 5);
     pushFeed({ kind: "chat", who: W.player.name, mine: true, loc: W.player.loc, text: (WL() === "en" ? "*pays " + price + " coins for treatment*" : "*bayar " + price + " koin untuk pengobatan*") + " (" + rpgStatusLine() + ")" });
     pushFeed({ kind: "chat", who: c.name, loc: c.loc, text: (WL() === "en" ? "*treats your wounds* Rest a bit, child." : "*mengobati lukamu* Istirahatlah sebentar, Nak.") });
     save(); return { ok: true, service: true };
   }
    // Kitab sihir: tidak masuk tas, langsung membuka sihir permanen (bisa lebih awal dari level).
    var tomeId = null;
    try { tomeId = spellIdForTome(entry.name); } catch (eT) {}
    if (tomeId) {
      if (hasSpell(tomeId)) return { ok: false, why: "owned" };
      spendCoins(price); entry.qty = Math.max(0, (Number(entry.qty) || 0) - 1); shop.coins = (Number(shop.coins) || 0) + price;
      try {
        W.player.tomes = Array.isArray(W.player.tomes) ? W.player.tomes : [];
        if (W.player.tomes.indexOf(tomeId) === -1) W.player.tomes.push(tomeId);
        W.player.spell = tomeId;
      } catch (eTU) {}
      c.affinity = clampA((Number(c.affinity) || 0) + 2);
      var _tm = magicById(tomeId);
      pushFeed({ kind: "chat", who: W.player.name, mine: true, loc: W.player.loc, text: (WL() === "en" ? "*buys " + entry.name + " from " + c.name + " (" + price + " coins) and learns " + (_tm ? _tm.en : tomeId) + "!*" : "*beli " + entry.name + " dari " + c.name + " (" + price + " koin) dan mempelajari " + (_tm ? _tm.idn : tomeId) + "!*") + " (" + rpgStatusLine() + ")" });
      pushFeed({ kind: "chat", who: c.name, loc: c.loc, text: (WL() === "en" ? "*hands over the tome* Use it wisely." : "*menyerahkan kitab* Gunakan dengan bijak.") });
      save(); return { ok: true, tome: true };
    }
   if (((W.player.items || []).length) >= MAX_ITEMS_P) return { ok: false, why: "bagfull" };
    spendCoins(price); entry.qty = Math.max(0, (Number(entry.qty) || 0) - 1); shop.coins = (Number(shop.coins) || 0) + price;
    giveItem("__player", entry.name);
    c.affinity = clampA((Number(c.affinity) || 0) + 2);
    pushFeed({ kind: "chat", who: W.player.name, mine: true, loc: W.player.loc, text: (WL() === "en" ? "*buys 1× " + entry.name + " from " + c.name + " (" + price + " coins)*" : "*beli 1× " + entry.name + " dari " + c.name + " (" + price + " koin)*") + " (" + rpgStatusLine() + ")" });
    pushFeed({ kind: "chat", who: c.name, loc: c.loc, text: (WL() === "en" ? "Thanks! Come again." : "Makasih! Mampir lagi ya.") });
    save(); return { ok: true };
  }
  function doSell(buyerId, itemName) {
    var c = charById(buyerId); if (!c || !W) return { ok: false };
    if (c.loc !== W.player.loc) return { ok: false, why: "remote", loc: c.loc };
    var shop = ensureShop(c);
    if (!countItem(W.player, itemName)) return { ok: false, why: "noitem" };
    var price = sellPriceOf(itemName);
    var aff = Number(c.affinity) || 0;
    if (aff >= 40) price = Math.round(price * 1.2);
    if ((Number(shop.coins) || 0) < price) return { ok: false, why: "dealerbroke" };
    takeItem("__player", itemName);
    var realName = itemName;
    addCoins(price); shop.coins = (Number(shop.coins) || 0) - price;
    var f = null;
    for (var i = 0; i < shop.stock.length; i++) if (shop.stock[i].name.toLowerCase() === String(realName).toLowerCase()) f = shop.stock[i];
    if (f && !f.service) f.qty = (Number(f.qty) || 0) + 1;
    c.affinity = clampA(aff + 1);
    pushFeed({ kind: "chat", who: W.player.name, mine: true, loc: W.player.loc, text: (WL() === "en" ? "*sells " + realName + " to " + c.name + " (+" + price + " coins)*" : "*jual " + realName + " ke " + c.name + " (+" + price + " koin)*") + " (" + rpgStatusLine() + ")" });
    save(); return { ok: true, price: price };
  }
 /* ----- GAME v2 combat ----- */
  function doAttackWin(e) {
    if (!W || !W.player || !e) return false;
    var p = W.player;
    var reward = e.coinsMin + Math.floor(Math.random() * (Math.max(e.coinsMin, e.coinsMax) - e.coinsMin + 1));
    var loot = (e.loot && e.loot.length) ? e.loot[Math.floor(Math.random() * e.loot.length)] : null;
    var ename = e.name, exp = e.xp, wasBoss = !!e.boss;
    W.encounter = null;
    p.kills = (Number(p.kills) || 0) + 1;
    try { if (wasBoss) bumpStat("boss"); } catch (eB) {}
    addCoins(reward);
    if (loot && (p.items || []).length < MAX_ITEMS_P) giveItem("__player", loot);
    if (wasBoss && loot && (p.items || []).length < MAX_ITEMS_P) giveItem("__player", loot);
    var winTxt = WL() === "en" ? ename + " defeated! +" + reward + " coins" : ename + " tumbang! +" + reward + " koin";
    if (wasBoss) winTxt = (WL() === "en" ? "BOSS " + ename + " crushed! +" + reward + " coins (double loot!)" : "BOSS " + ename + " hancur! +" + reward + " koin (loot ganda!)");
    pushFeed({ kind: "system", loc: p.loc, text: (wasBoss ? "👹 " : "🏆 ") + winTxt + (loot ? ", +" + loot : "") + ", +" + exp + " XP. (" + rpgStatusLine() + ")" });
    gainXp(exp);
    try { advanceClock(1); } catch (ex) {}
    save(); renderAll(); scrollFeed(); return true;
  }
  // Berburu = menyusuri jejak: tiap klik = 1 jejak, peluang temu naik tiap gagal (pity),
  // dijamin ketemu paling lambat jejak ke-4. Beda dari "serang" yang langsung mengajak ribut.
  function doHunt() {
    if (!W || !W.player) return { ok: false };
    if (W.encounter) return doAttackPlayer(false);
    var p = W.player;
    if (!isFinite(Number(W.stepMiss))) W.stepMiss = 0;
    if ((Number(p.energy) || 0) < 3) { toast(WL() === "en" ? "Too tired to hunt — rest first." : "Terlalu lelah berburu — istirahat dulu."); return { ok: true, tired: true }; }
    var locN = locName(p.loc), danger = false;
    try { danger = isDangerLoc(locN); } catch (eD) {}
    var chance = (danger ? 0.50 : 0.35) + Number(W.stepMiss) * 0.20;
    p.energy = clampStat((Number(p.energy) || 0) - 3);
    p.full = clampStat((Number(p.full) || 0) - 1);
    if (Math.random() < chance) {
      W.stepMiss = 0;
      var e2 = spawnMonster();
      if (e2) pushFeed({ kind: "system", loc: p.loc, text: (WL() === "en" ? "🐾 The trail is fresh! Wild " + e2.name + " appears! (HP " + e2.hp + ") — hit \u2694\uFE0F again to strike!" : "\uD83D\uDC3E Jejaknya masih hangat! " + e2.name + " liar muncul! (HP " + e2.hp + ") — tekan \u2694\uFE0F lagi untuk menyerang!") });
      try { advanceClock(1); } catch (eC) {}
      save(); renderAll(); scrollFeed(); return { ok: true, spawned: true };
    }
    W.stepMiss = Number(W.stepMiss) + 1;
    var found = null;
    try {
      if (Math.random() < 0.30) {
        var pool = [];
        monsterTableFor(locN).forEach(function (m) { (m.loot || []).forEach(function (l) { if (pool.indexOf(l) === -1) pool.push(l); }); });
        if (pool.length && (p.items || []).length < MAX_ITEMS_P) { found = pool[Math.floor(Math.random() * pool.length)]; p.items.push(found); }
      }
    } catch (eF) {}
    var msgs = (WL() === "en")
      ? ["\uD83D\uDC63 You follow fresh tracks... nothing yet.", "\uD83C\uDF3F Bushes rustle — just the wind...", "\uD83D\uDC42 A growl in the distance... you creep closer..."]
      : ["\uD83D\uDC63 Kamu mengikuti jejak segar... belum ada apa-apa.", "\uD83C\uDF3F Semak bergoyang — ternyata cuma angin...", "\uD83D\uDC42 Geraman dari kejauhan... kamu mendekat perlahan..."];
    var msg = msgs[Math.floor(Math.random() * msgs.length)] + " (" + (WL() === "en" ? "trail " : "jejak ") + W.stepMiss + ")";
    if (found) msg += (WL() === "en" ? " Found: " + found + "!" : " Nemu: " + found + "!");
    pushFeed({ kind: "chat", who: p.name, mine: true, loc: p.loc, text: (WL() === "en" ? "*tracks through " + locN + "* " : "*menyusuri " + locN + "* ") + msg });
    try { advanceClock(1); } catch (eC2) {}
    save(); renderAll(); scrollFeed(); return { ok: true, tracked: true };
  }
  // Encounter pas jalan: dipanggil tiap langkah di tile liar (D = 45%, jalan biasa = 15%,
  // +15% tiap gagal, dijamin ketemu. Berbagi pity dengan tombol Berburu (sama-sama stepMiss).
  // Gagal = diam saja (counter tersimpan), biar feed nggak spam tiap langkah.
  function doStepEncounter(tile) {
    if (!W || !W.player || W.encounter) return;
    if (!isFinite(Number(W.stepMiss))) W.stepMiss = 0;
    var chance = Math.min(1, (tile === "D" ? 0.45 : 0.15) + Number(W.stepMiss) * 0.15);
    if (Math.random() < chance) {
      W.stepMiss = 0;
      var e2 = spawnMonster();
      if (e2) pushFeed({ kind: "system", loc: W.player.loc, text: (WL() === "en" ? "\uD83C\uDF32 Bushes ahead move! Wild " + e2.name + " appears! (HP " + e2.hp + ") — \u2694\uFE0F fight or \uD83C\uDFC3 flee!" : "\uD83C\uDF32 Semak di depanmu bergerak! " + e2.name + " liar muncul! (HP " + e2.hp + ") — \u2694\uFE0F lawan atau \uD83C\uDFC3 kabur!") });
      save(); renderAll(); scrollFeed(); return;
    }
    W.stepMiss = Number(W.stepMiss) + 1;
    save();
  }
  function doAttackPlayer(useMagic, spellId) {
   if (!W || !W.player) return { ok: false };
   if (!W.encounter) {
     var e2 = spawnMonster();
     if (!e2) return { ok: false };
     pushFeed({ kind: "system", loc: W.player.loc, text: (WL() === "en" ? "⚔️ Wild " + e2.name + " appears! (HP " + e2.hp + ") — hit ⚔️ again to strike!" : "⚔️ " + e2.name + " liar muncul! (HP " + e2.hp + ") — tekan ⚔️ lagi untuk menyerang!") });
     save(); renderAll(); scrollFeed(); return { ok: true, spawned: true };
   }
   var e = W.encounter, p = W.player;
    try { e.status = e.status || { burn: 0, guard: 0, skip: false }; if (!e.elem) e.elem = "biasa"; } catch (eS) {}
   if (useMagic) {
     var sp = (spellId && magicById(spellId)) || (spellId && spellFromWord(spellId)) || playerSpell();
     if (!sp) sp = MAGICS[0];
      if (!hasSpell(sp.id)) {
        var _need = (WL() === "en" ? "Unlocks at Lv" + sp.lvl + " or buy " + tomeNameFor(sp.id) + " at a shop: " : "Terbuka di Lv" + sp.lvl + " atau beli " + tomeNameFor(sp.id) + " di shop: ") + magicName(sp);
        toast(_need); return { ok: true, locked: true };
      }
     if ((Number(p.mana) || 0) < sp.cost) { toast(WL() === "en" ? "Not enough mana (need " + sp.cost + ")." : "Mana kurang (butuh " + sp.cost + ")."); return { ok: true, nomana: true }; }
     p.mana = clampStat((Number(p.mana) || 0) - sp.cost);
     try { bumpStat("spell"); } catch (eM) {}
     try { p.spell = sp.id; } catch (ePS) {}
     var mult = elemMult(sp.elem, e.elem);
     try { if (p.elem && p.elem === sp.elem) mult *= 1.15; } catch (eAf) {}
     var base = sp.power + pLevel() * 2;
     var variance = (sp.effect === "stun") ? Math.floor(Math.random() * 12) : Math.floor(Math.random() * 7);
      var mdmg = Math.max(1, Math.round((base + variance) * mult) + staffBoost());
      var extra = "";
      var effTxt = "";
      if (mult >= 1.4) effTxt = (WL() === "en" ? " SUPER effective!" : " SUPER EFEKTIF!");
      else if (mult <= 0.8) effTxt = (WL() === "en" ? " (resisted…)" : " (ditahan…)");
      // Efek khas tiap elemen
      if (sp.effect === "burn") { e.status.burn = 2; extra = (WL() === "en" ? " 🔥burn" : " 🔥terbakar"); }
      else if (sp.effect === "swift") { if (Math.random() < 0.30) { mdmg = Math.round(mdmg * 1.8); extra = (WL() === "en" ? " CRIT!" : " CRIT!"); } }
      else if (sp.effect === "freeze") { if (Math.random() < 0.30) { e.status.skip = true; extra = (WL() === "en" ? " ❄️FROZEN" : " ❄️BEKU"); } }
      else if (sp.effect === "guard") { e.status.guard = 6; extra = (WL() === "en" ? " 🛡️guard" : " 🛡️tahan"); }
      else if (sp.effect === "stun") { if (Math.random() < 0.20) { e.status.skip = true; extra = (WL() === "en" ? " ⚡STUNNED" : " ⚡STUN"); } }
      else if (sp.effect === "heal") { p.hp = clampHp((Number(p.hp) || 0) + 18); extra = (WL() === "en" ? " +18 HP to self" : " +18 HP untukmu"); }
      e.hp -= mdmg;
      e.turn = (e.turn || 0) + 1;
      pushFeed({ kind: "chat", who: p.name, mine: true, loc: p.loc, text: (WL() === "en" ? "*casts " + sp.emoji + " " + sp.en + " at " + e.name + " (-" + mdmg + " HP)" + extra + effTxt + "*" : "*merapal " + sp.emoji + " " + sp.idn + " ke " + e.name + " (-" + mdmg + " HP)" + extra + effTxt + "*") });
   } else {
     var dmg = 8 + weaponPower() + pLevel() * 2 + Math.floor(Math.random() * 7);
     e.hp -= dmg;
     e.turn = (e.turn || 0) + 1;
     p.energy = clampStat((Number(p.energy) || 0) - 2);
     pushFeed({ kind: "chat", who: p.name, mine: true, loc: p.loc, text: (WL() === "en" ? "*strikes " + e.name + " (-" + dmg + " HP)*" : "*menyerang " + e.name + " (-" + dmg + " HP)*") });
   }
   if (e.hp <= 0) {
      doAttackWin(e);
      return { ok: true, win: true };
   }
   pushFeed({ kind: "system", loc: p.loc, text: "👾 " + e.name + ": HP " + Math.max(0, e.hp) + "/" + e.maxHp });
   monsterCounter();
   try { if (W.genre === "fantasy") { p.full = clampStat((Number(p.full) || 0) - 1); } } catch (ex2) {}
   save(); renderAll(); scrollFeed(); return { ok: true };
 }
 // Harga jual dasar (sebelum bonus afinitas di doSell). Bahan mentah ikut
 // catatan balance; barang toko = setengah harga beli (otomatis ikut template).
 var SELL_RAW = { besi: 14, herbal: 7, kayu: 6 };
 function sellPriceOf(itemName) {
   var s = String(itemName || "").toLowerCase().trim();
   if (!s) return 0;
   if (SELL_RAW[s] != null) return SELL_RAW[s];
   try {
     var probes = [{ role: "blacksmith" }, { role: "warung" }, { role: "healer" }, { role: "guild" }, { role: "adventurer" }, { role: "warga" }];
     for (var i = 0; i < probes.length; i++) {
       var st = shopTemplateFor(probes[i]);
       for (var j = 0; j < st.stock.length; j++) {
         if (String(st.stock[j].name).toLowerCase() === s && !st.stock[j].service) {
           return Math.max(1, Math.round((Number(st.stock[j].price) || 0) / 2));
         }
       }
     }
   } catch (e) {}
   return 3;
 }
 // Efek consumable (dipakai doEat + label inventory/toko). null = bukan consumable.
 // Gear (senjata/perisai) BUKAN consumable — dipasang via equipItem, bukan dimakan.
 function itemEffect(itemName) {
   var s = String(itemName || "").toLowerCase().trim();
   var T = {
     "roti": { full: 25 },
     "teh herbal": { full: 10, mana: 10 },
     "nasi hangat": { full: 40 },
     "bekal petualang": { full: 50, energy: 10 },
     "ramuan hp": { hp: 60 },
     "ramuan energi": { energy: 40 },
     "ramuan mana": { mana: 50 },
     "herbal": { hp: 10 },
      "ramuan hp besar": { hp: 120 },
      "ramuan energi besar": { energy: 80 },
      "ramuan mana besar": { mana: 90 },
      "penawar racun": { hp: 30, energy: 10, mana: 10 },
      "elixir petualang": { full: 40, hp: 40, energy: 20 }
   };
   return T[s] || null;
 }
  // Label tombol pakai: makanan = Makan, obat/ramuan = Pakai.
  function useVerbFor(name) {
    var s = gearKey(name);
    if (/ramuan|potion|elixir|tonik|obat|penawar/.test(s)) return "use";
    return "eat";
  }
 // Serangan balasan monster tiap giliran (dipanggil setelah aksi player saat battle).
 function monsterCounter() {
   if (!W || !W.player || !W.encounter) return;
   var e = W.encounter, p = W.player, en = WL() === "en";
   try { e.status = e.status || { burn: 0, guard: 0, skip: false }; } catch (eS) {}
   try {
     if (e.status.burn > 0) {
       e.hp -= 6;
       e.status.burn--;
       pushFeed({ kind: "system", loc: p.loc, text: "🔥 " + e.name + (en ? " burns! (-6 HP)" : " terbakar! (-6 HP)") });
       if (e.hp <= 0) { try { doAttackWin(e); } catch (eW) {} return; }
     }
     if (e.status.skip) {
       e.status.skip = false;
       pushFeed({ kind: "system", loc: p.loc, text: "❄️ " + e.name + (en ? " is frozen/stunned - no counter!" : " beku/stun - tidak balas!") });
       return;
     }
   } catch (eT) {}
   var lo = Number(e.atkMin) || 4, hi = Number(e.atkMax) || 8;
   if (hi < lo) hi = lo;
   var dmg = lo + Math.floor(Math.random() * (hi - lo + 1));
   try { dmg = Math.max(0, dmg - armorReduce()); } catch (eA) {}
   try { if (e.status && e.status.guard > 0) { dmg = Math.max(0, dmg - e.status.guard); e.status.guard = 0; } } catch (eG) {}
   p.hp = clampHp((Number(p.hp) || 0) - dmg);
   try { e.lastCounter = { dmg: dmg }; } catch (eL) {}
   e.turn = (e.turn || 0) + 1;
   pushFeed({ kind: "chat", who: e.name, loc: p.loc, text: (en ? "*strikes back at " + p.name + " (-" + dmg + " HP)*" : "*menyerang balik " + p.name + " (-" + dmg + " HP)*") });
   if ((Number(p.hp) || 0) <= 0) {
     W.encounter = null;
     p.hp = 20;
     try { p.full = Math.max(Number(p.full) || 0, 25); p.energy = Math.max(Number(p.energy) || 0, 30); } catch (eF) {}
     var home = W.locations[0];
     try { if (home) p.loc = home.id; } catch (eH) {}
     pushFeed({ kind: "system", loc: p.loc, text: (en ? "💀 Defeated by " + e.name + "! You were carried home. (HP 20)" : "💀 Tumbang dikalahkan " + e.name + "! Kamu ditandu pulang. (HP 20)") });
   }
 }
  function doFleePlayer() {
    if (!W || !W.player) return { ok: false };
    if (!W.encounter) return { ok: true, none: true };
    var e = W.encounter;
    if (Math.random() < 0.7) {
      W.encounter = null;
      pushFeed({ kind: "system", loc: W.player.loc, text: (WL() === "en" ? "🏃 You fled from " + e.name + "." : "🏃 Kamu kabur dari " + e.name + ".") });
      gainXp(2);
      save(); renderAll(); scrollFeed(); return { ok: true, fled: true };
    }
    pushFeed({ kind: "system", loc: W.player.loc, text: (WL() === "en" ? "💦 Failed to flee!" : "💦 Gagal kabur!") });
    monsterCounter();
    save(); renderAll(); scrollFeed(); return { ok: true, failed: true };
  }
  /* ----- quests: bantu / minta kerja ----- */
  function questNeedFor(c) {
    var r = String((c && c.role) || "").toLowerCase();
    if (/blacksmith|forge|tempa|dwarf/.test(r)) return { need: "Besi", qty: 2, reward: 75 };
    if (/tabib|healer|dukun|informan/.test(r)) return { need: "Herbal", qty: 3, reward: 45 };
    if (/warung|kedai|stall/.test(r)) return { need: "Kayu", qty: 2, reward: 35 };
    if (/guild|reseptionis/.test(r)) return { need: "Herbal", qty: 2, reward: 40 };
    return { need: "Herbal", qty: 2, reward: 30 };
  }
  function questKindFor(c) {
    var r = String((c && c.role) || "").toLowerCase();
    if (/guild|reseptionis|receptionist|penjaga|guard|kapten|captain|tentara|knight|kesatria|adventurer|petualang|pengembara|wanderer|ranger|runner|pemburu|hunter|slayer/.test(r)) return "hunt";
    return "fetch";
  }
  function offerQuest(giverId, force) {
    if (!W) return null;
    var c = charById(giverId); if (!c) return null;
    var existing = (W.quests || []).filter(function (q) { return q.giverId === giverId && (q.state === "offered" || q.state === "active"); });
    if (existing.length && !force) return existing[0];
    var kind = questKindFor(c);
    var q;
    if (kind === "hunt") {
      q = { id: uid("q"), kind: "hunt", giverId: c.id, giverName: c.name, title: (WL() === "en" ? "Cull " : "Berantas ") + c.name, need: "monster", needQty: 3, rewardCoins: 60, rewardItems: [], state: "offered", ts: Date.now(), baseKills: 0 };
      W.quests.push(q);
      c.lastOffer = Date.now();
      pushFeed({ kind: "chat", who: c.name, loc: c.loc, text: (WL() === "en" ? "Hey, " + W.player.name + "! Monsters are roaming around. Cull " + q.needQty + " of them and I'll pay " + q.rewardCoins + " coins." : "Eh, " + W.player.name + "! Monster berkeliaran di mana-mana. Berantas " + q.needQty + " ekor, nanti kuupah " + q.rewardCoins + " koin.") });
    } else {
      var t = questNeedFor(c);
      q = { id: uid("q"), kind: "fetch", giverId: c.id, giverName: c.name, title: (WL() === "en" ? "Help " : "Bantu ") + c.name, need: t.need, needQty: t.qty, rewardCoins: t.reward, rewardItems: [], state: "offered", ts: Date.now(), baseKills: 0 };
      W.quests.push(q);
      c.lastOffer = Date.now();
      pushFeed({ kind: "chat", who: c.name, loc: c.loc, text: (WL() === "en" ? "Hey, " + W.player.name + "! Could you bring me " + t.qty + "× " + t.need + "? I'll pay " + t.reward + " coins." : "Eh, " + W.player.name + "! Bisa bawakan " + t.qty + "× " + t.need + "? Nanti kuupah " + t.reward + " koin.") });
    }
    save(); return q;
  }
  function huntProgress(q) { return Math.max(0, (Number(W.player.kills) || 0) - (Number(q.baseKills) || 0)); }
  function acceptQuest(qid) {
    var q = null;
    for (var i = 0; i < (W.quests || []).length; i++) if (W.quests[i].id === qid) q = W.quests[i];
    if (!q) return false;
    q.state = "active";
    if (!q.kind) q.kind = "fetch";
    if (q.kind === "hunt") q.baseKills = (Number(W.player.kills) || 0);
    pushFeed({ kind: "chat", who: W.player.name, mine: true, loc: W.player.loc, text: (q.kind === "hunt"
      ? (WL() === "en" ? "*accepts " + q.giverName + "'s hunt: cull " + q.needQty + " monsters*" : "*menerima perburuan " + q.giverName + ": berantas " + q.needQty + " monster*")
      : (WL() === "en" ? "*accepts " + q.giverName + "'s request: " + q.needQty + "× " + q.need + "*" : "*menerima permintaan " + q.giverName + ": " + q.needQty + "× " + q.need + "*")) });
    save(); return true;
  }
 function turnInQuest(qid) {
   var q = null;
   for (var i = 0; i < (W.quests || []).length; i++) if (W.quests[i].id === qid) q = W.quests[i];
   if (!q || q.state !== "active") return { ok: false };
   if (!q.kind) q.kind = "fetch";
   var g = charById(q.giverId);
   if (!g || g.loc !== W.player.loc) return { ok: false, why: "remote", loc: g ? g.loc : null };
   if (q.kind === "hunt") {
     if (huntProgress(q) < q.needQty) return { ok: false, why: "kurang" };
     addCoins(q.rewardCoins);
     g.affinity = clampA((Number(g.affinity) || 0) + 10);
     q.state = "done";
     gainXp(15);
     pushFeed({ kind: "system", loc: W.player.loc, text: (WL() === "en" ? "✅ Hunt done: " + q.needQty + " monsters culled → +" + q.rewardCoins + " coins, +15 XP, affinity up." : "✅ Perburuan selesai: " + q.needQty + " monster diberantas → +" + q.rewardCoins + " koin, +15 XP, affinity naik.") + " (" + rpgStatusLine() + ")" });
     save(); return { ok: true };
   }
   if (countItem(W.player, q.need) < q.needQty) return { ok: false, why: "kurang" };
   for (var k = 0; k < q.needQty; k++) takeItem("__player", q.need);
   addCoins(q.rewardCoins);
   if (g) { g.affinity = clampA((Number(g.affinity) || 0) + 10); giveItem(g.id, q.need); }
   q.state = "done";
   gainXp(15);
   pushFeed({ kind: "system", loc: W.player.loc, text: (WL() === "en" ? "✅ Quest done: " + q.needQty + "× " + q.need + " → +" + q.rewardCoins + " coins, +15 XP, affinity up." : "✅ Quest selesai: " + q.needQty + "× " + q.need + " → +" + q.rewardCoins + " koin, +15 XP, affinity naik.") + " (" + rpgStatusLine() + ")" });
   save(); return { ok: true };
 }
  function npcAtPlayerLoc() { if (!W) return []; return W.chars.filter(function (c) { return c.loc === W.player.loc; }); }
  function resolveSeller(itemHint, targetId) {
    var t = targetId && targetId !== "all" ? charById(targetId) : null;
    if (t && t.loc === W.player.loc) { try { ensureShop(t); } catch (e) {} return t; }
    var here = npcAtPlayerLoc();
    if (itemHint) {
      var s = String(itemHint).toLowerCase();
      for (var i = 0; i < here.length; i++) { try { var sh = ensureShop(here[i]); if (!sh) continue; for (var j = 0; j < sh.stock.length; j++) { var ln = sh.stock[j].name.toLowerCase(); if (ln === s || ln.indexOf(s) !== -1 || s.indexOf(ln) !== -1) return here[i]; } } catch (e) {} }
    }
    if (t) return t;
    return here[0] || null;
  }
  function tryRpgCommand(rawText, targetId) {
    if (!W || W.genre !== "fantasy") return false;
    var t = String(rawText || "").trim();
    var low = t.toLowerCase().replace(/^\s*[\*\_\(]+|[\*\_\)]+\s*$/g, "").trim();
    var m;
    if (/^(lawan|serang|attack|fight|\/lawan)/i.test(low)) {
      busy = true; renderStage();
      doAttackPlayer(false);
      busy = false; return true;
    }
    if (/^(berburu|hunt|\/berburu|\/hunt)/i.test(low)) {
      busy = true; renderStage();
      if (W.encounter) doAttackPlayer(false);
      else doHunt();
      busy = false; return true;
    }
   if (/^(sihir|magic|skill|\/sihir)/i.test(low)) {
     busy = true; renderStage();
      var w = low.replace(/^(sihir|magic|skill|\/sihir)\s*/i, "").trim();
      var picked = w ? spellFromWord(w) : null;
      doAttackPlayer(true, picked ? picked.id : (W.player.spell || null));
     busy = false; return true;
   }
    if (/^(kabur|lari|mundur|flee|\/kabur)/i.test(low)) {
      busy = true; renderStage();
      doFleePlayer();
      busy = false; return true;
    }
    if (/^(jelajah|explore|\/jelajah)/i.test(low)) {
      busy = true; renderStage();
      if (!W.encounter && Math.random() < 0.45) { var _e = spawnMonster(); if (_e) pushFeed({ kind: "system", loc: W.player.loc, text: (WL() === "en" ? "⚔️ Wild " + _e.name + " blocks your path! (HP " + _e.hp + ")" : "⚔️ " + _e.name + " liar menghadang! (HP " + _e.hp + ")") }); }
      else doGather();
      try { advanceClock(1); } catch (e) {}
      busy = false; renderAll(); scrollFeed(); return true;
    }
    if (/^(status|stat|stats|kondisi)$/i.test(low)) {
      pushFeed({ kind: "system", loc: W.player.loc, text: "📊 " + W.player.name + ": " + rpgStatusLine() + (W.player.items && W.player.items.length ? " · 🎒 " + W.player.items.join(", ") : " · 🎒 kosong") + (function () { try { var e = (W.player.equip || {}); if (e.weapon || e.shield) return " · ⚔️" + (e.weapon || "—") + " 🛡️" + (e.shield || "—"); } catch (eE) {} return ""; })() });
      save(); renderAll(); scrollFeed(); return true;
    }
    if (/^(tidur|istirahat|sleep|rest|\/tidur|\/sleep)/i.test(low)) {
      busy = true; renderStage();
      var r = doSleep();
      if (W.encounter) monsterCounter();
      try { advanceClock(1); } catch (e) {}
      busy = false; renderAll(); scrollFeed(); return true;
    }
    if (/^(cari|kumpulkan|kumpul|gather|tambang|tebang|cari herbal|kerja|nguli|serabutan|\/cari|\/gather)/i.test(low)) {
      busy = true; renderStage();
      doGather();
      try { advanceClock(1); } catch (e) {}
      busy = false; renderAll(); scrollFeed(); return true;
    }
    if (/^(pasang|equip|pakai senjata|pakai perisai|pakai tameng|equip weapon|equip shield)/i.test(low)) {
      var gitem = t.replace(/^(pasang|equip|pakai senjata|pakai perisai|pakai tameng|equip weapon|equip shield)\s*/i, "").replace(/^[\*\_]+|[\*\_]+$/g, "").trim();
      busy = true; renderStage();
      var er = equipItem(gitem || "");
      if (!er.ok) toast(WL() === "en" ? "No such gear in bag — open 🎒 to see equippable items." : "Nggak ada alat itu di tas — buka 🎒 buat lihat yang bisa dipasang.");
      busy = false; renderAll(); scrollFeed(); return true;
    }
    if (/^(lepas|unequip|copot)/i.test(low)) {
      var litem = t.replace(/^(lepas|unequip|copot)\s*/i, "").replace(/^[\*\_]+|[\*\_]+$/g, "").trim().toLowerCase();
      busy = true; renderStage();
      var lr = { ok: false };
      try {
        var eq = ensureEquip() || {};
        if (!litem) {
          if (eq.weapon) lr = unequip("weapon");
          else if (eq.shield) lr = unequip("shield");
        } else if (eq.weapon && gearKey(eq.weapon).indexOf(litem) !== -1) lr = unequip("weapon");
        else if (eq.shield && gearKey(eq.shield).indexOf(litem) !== -1) lr = unequip("shield");
        else if (/senjata|weapon|pedang|busur|kapak|belati|tongkat/.test(litem)) lr = unequip("weapon");
        else if (/perisai|tameng|shield|zirah|armor/.test(litem)) lr = unequip("shield");
      } catch (eLU) {}
      if (!lr.ok) toast(WL() === "en" ? "Nothing equipped to remove." : "Nggak ada yang terpasang buat dilepas.");
      busy = false; renderAll(); scrollFeed(); return true;
    }
    if (/^(makan|mkn|eat|minum|pakai|use|ngemil|\/makan|\/eat)/i.test(low)) {
      var item = t.replace(/^(makan|mkn|eat|minum|pakai|use|ngemil|\/makan|\/eat)\s+/i, "").replace(/^[\*\_]+|[\*\_]+$/g, "").trim();
      busy = true; renderStage();
      var re = doEat(item || "");
      if (!re.ok && re.why === "notfood" && item && isGear(item)) {
        var ger = equipItem(item);
        if (ger.ok) re = { ok: true, equipped: true };
      }
      if (!re.ok) toast(WL() === "en" ? "No edible food in bag." : "Nggak ada makanan yang bisa dimakan di tas.");
      else if (W.encounter) monsterCounter();
      try { advanceClock(1); } catch (e) {}
      busy = false; renderAll(); scrollFeed(); return true;
    }
    m = low.match(/^(beli|buy)\s+(.+?)(?:\s+(?:dari|from|ke|di|at)\s+(.+))?$/i);
    if (m) {
      var want = (m[2] || "").replace(/[\*\_]/g, "").trim(), whoH = (m[3] || "").trim();
      var seller = null;
      if (whoH) { for (var si = 0; si < W.chars.length; si++) if (W.chars[si].name.toLowerCase().indexOf(whoH.toLowerCase()) !== -1) seller = W.chars[si]; }
      if (!seller) seller = resolveSeller(want, targetId);
      if (!seller) { toast(WL() === "en" ? "No seller here." : "Nggak ada penjual di sini."); return true; }
      busy = true; renderStage();
      var rb = doBuy(seller.id, want);
      if (!rb.ok) pushFeed({ kind: "system", loc: W.player.loc, text: "⚠️ " + buyFailMsg(rb.why, rb.price, rb.loc) });
      try { advanceClock(1); } catch (e) {}
      busy = false; renderAll(); scrollFeed(); return true;
    }
    m = low.match(/^(jual|sell)\s+(.+?)(?:\s+(?:ke|to|kepada)\s+(.+))?$/i);
    if (m) {
      var swant = (m[2] || "").replace(/[\*\_]/g, "").trim(), toH = (m[3] || "").trim();
      var buyer = null;
      if (toH) { for (var bi = 0; bi < W.chars.length; bi++) if (W.chars[bi].name.toLowerCase().indexOf(toH.toLowerCase()) !== -1) buyer = W.chars[bi]; }
      if (!buyer) buyer = resolveSeller(swant, targetId) || npcAtPlayerLoc()[0];
      if (!buyer) { toast(WL() === "en" ? "No buyer here." : "Nggak ada pembeli di sini."); return true; }
      busy = true; renderStage();
      var rs = doSell(buyer.id, swant);
      if (!rs.ok) {
        var sellMsg = (WL() === "en" ? "Can't sell that." : "Nggak bisa jual itu. Cek tas / koin pedagang.");
        if (rs.why === "remote") sellMsg = (WL() === "en" ? "Go to " + locName(rs.loc) + " first — trading is in-person." : "Ke " + locName(rs.loc) + " dulu — dagang harus tatap muka.");
        pushFeed({ kind: "system", loc: W.player.loc, text: "⚠️ " + sellMsg });
      }
      try { advanceClock(1); } catch (e) {}
      busy = false; renderAll(); scrollFeed(); return true;
    }
    if (/^(minta kerja|minta kerjaan|ada kerjaan|ada quest|quest|kerjaan|tanya kerja|bantu apa|minta tugas)/i.test(low)) {
      var here2 = npcAtPlayerLoc();
      var g2 = (targetId && targetId !== "all" ? charById(targetId) : null) || here2[0];
      if (!g2) { toast(WL() === "en" ? "No one here." : "Nggak ada siapa-siapa di sini."); return true; }
      if (g2.loc !== W.player.loc) { toast(WL() === "en" ? "Go to " + locName(g2.loc) + " first — quests are in-person." : "Ke " + locName(g2.loc) + " dulu — quest harus tatap muka."); return true; }
      busy = true; renderStage();
      offerQuest(g2.id);
      busy = false; renderAll(); scrollFeed(); return true;
    }
    if (/^(terima|accept|ambil quest)/i.test(low)) {
      var pend = (W.quests || []).filter(function (q) { return q.state === "offered" && charById(q.giverId) && charById(q.giverId).loc === W.player.loc; });
      if (!pend.length) pend = (W.quests || []).filter(function (q) { return q.state === "offered"; });
      if (!pend.length) { toast(WL() === "en" ? "No offered quest." : "Nggak ada quest yang ditawarkan."); return true; }
      busy = true; renderStage();
      acceptQuest(pend[pend.length - 1].id);
      busy = false; renderAll(); scrollFeed(); return true;
    }
    if (/^(serahkan|kumpulkan quest|selesaikan|turn in|complete)/i.test(low)) {
      var act2 = (W.quests || []).filter(function (q) { return q.state === "active"; });
      if (!act2.length) { toast(WL() === "en" ? "No active quest." : "Nggak ada quest aktif."); return true; }
      busy = true; renderStage();
      var last = act2[act2.length - 1], rr = turnInQuest(last.id);
      if (!rr.ok) {
        var rrMsg = (WL() === "en" ? "Materials not enough: " + last.needQty + "× " + last.need + " (you have " + countItem(W.player, last.need) + ")." : "Bahan kurang: butuh " + last.needQty + "× " + last.need + " (punyamu " + countItem(W.player, last.need) + ").");
        if (last.kind === "hunt" && rr.why !== "remote") rrMsg = (WL() === "en" ? "Not enough kills yet (" + huntProgress(last) + "/" + last.needQty + ")." : "Kill belum cukup (" + huntProgress(last) + "/" + last.needQty + ").");
        if (rr.why === "remote") { var _gl = charById(last.giverId); rrMsg = (WL() === "en" ? "Go to " + locName(_gl ? _gl.loc : rr.loc) + " first — turn in is in-person." : "Ke " + locName(_gl ? _gl.loc : rr.loc) + " dulu — serahkan harus tatap muka."); }
        pushFeed({ kind: "system", loc: W.player.loc, text: "⚠️ " + rrMsg });
      }
      busy = false; renderAll(); scrollFeed(); return true;
    }
    if (/^(perbaiki|repair|tempa|reparasi)/i.test(low)) {
      var here3 = npcAtPlayerLoc();
      var smith = null;
      for (var qi = 0; qi < here3.length; qi++) if (/blacksmith|forge|tempa|dwarf|bengkel/i.test(String(here3[qi].role))) smith = here3[qi];
      smith = smith || resolveSeller("perbaiki", targetId);
      if (!smith) { toast(WL() === "en" ? "No blacksmith here." : "Nggak ada blacksmith di sini."); return true; }
      busy = true; renderStage();
      var rp = doBuy(smith.id, "Jasa Perbaiki Senjata");
      if (!rp.ok) pushFeed({ kind: "system", loc: W.player.loc, text: "⚠️ " + (WL() === "en" ? "Repair failed." : "Gagal perbaiki. Butuh senjata rusak + 20 koin.") });
      try { advanceClock(1); } catch (e) {}
      busy = false; renderAll(); scrollFeed(); return true;
    }
    if (/^(obati|berobat|heal)/i.test(low)) {
      var here4 = npcAtPlayerLoc(), med = null;
      for (var mi2 = 0; mi2 < here4.length; mi2++) if (/tabib|healer|dukun|mira/i.test(String(here4[mi2].role) + " " + here4[mi2].name)) med = here4[mi2];
      med = med || resolveSeller("pengobatan", targetId);
      if (!med) { toast(WL() === "en" ? "No healer here." : "Nggak ada tabib di sini."); return true; }
      busy = true; renderStage();
      var rh = doBuy(med.id, "Jasa Pengobatan");
      if (!rh.ok) pushFeed({ kind: "system", loc: W.player.loc, text: "⚠️ " + (WL() === "en" ? "Treatment failed." : "Gagal berobat. Butuh 10 koin.") });
      try { advanceClock(1); } catch (e) {}
      busy = false; renderAll(); scrollFeed(); return true;
    }
    return false;
  }
  async function speakAs(charObj, situation, streamEl) {
    var mem = recallFor(charObj, situation);
    var task = (WL() === "en")
      ? "Write " + charObj.name + " NOW (only their dialogue+actions, not system narration). Situation: " + situation + "\nRecent context:\n" + feedCtx(12) + (mem ? "\n" + mem : "")
      : "Tulis balasan " + charObj.name + " SEKARANG (hanya dialog+aksi dia, bukan narasi sistem). Situasi: " + situation + "\nKonteks terakhir:\n" + feedCtx(12) + (mem ? "\n" + mem : "");
    var full = "";
    var stops = (WL() === "en") ? ["\nSystem:", "\n[SYSTEM", "\nUser:"] : ["\nSistem:", "\n[SISTEM", "\nUser:"];
    var txt = await genTextP({ instruction: headFor(charObj) + "\n" + task, startWith: charObj.name + ":", stopSequences: stops, onChunk: function (d) {
      try { if (streamEl && d) { full = String(d.fullTextSoFar != null ? d.fullTextSoFar : full); streamEl.textContent = full.replace(new RegExp("^" + charObj.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:\\s*"), ""); } } catch (e) {}
    } });
    txt = txt.trim().replace(new RegExp("^" + charObj.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:\\s*"), "").trim();
    return txt || "...";
  }

 async function playerSend(text, targetId, kind) {
   if (busy || !W) return;
   text = String(text || "").trim();
   if (!text) return;
   if (!aiReady()) { toast(T("aiNotReady")); return; }
    try {
      if (W.genre === "fantasy" && tryRpgCommand(text, targetId)) return;
    } catch (e) {}
    // Tentukan jenis kiriman: "say" (ucapan) vs "act" (aksi/tindakan saja).
    // Auto-deteksi: *aksi*, /aksi ..., /act ..., /me ... dianggap aksi.
    var k = String(kind || "").toLowerCase();
    if (!k) {
      if (/^\s*(\*|_|\(|\/aksi\b|\/act\b|\/me\b)/i.test(text)) k = "act";
      else k = "say";
    }
    var isAct = (k === "act" || k === "aksi" || k === "action" || k === "do");
    var rawAct = text.replace(/^\s*\/(aksi|act|me)\b\s*/i, "").trim();
    // Tampilkan aksi dengan *...* supaya beda visual dari ucapan.
    var display = text;
    if (isAct) {
      var inner = rawAct;
      if (/^\*.*\*$/.test(inner) || /^_.*_$/.test(inner)) display = inner;
      else display = "*" + inner + "*";
    }
    busy = true; renderStage();
    var target = targetId && targetId !== "all" ? charById(targetId) : null;
    if (!target) {
      var low = display.toLowerCase();
      for (var mi = 0; mi < W.chars.length; mi++) if (low.indexOf(W.chars[mi].name.toLowerCase()) !== -1) { target = W.chars[mi]; break; }
    }
    // Aksi boleh memindahkan player (satu-satunya "teleport" yang sah di mode karakter).
    // Contoh: *pergi ke Kantin*, /pindah Atap Sekolah. Ucapan biasa TIDAK memindahkan.
    var moved = false;
    if (isAct) {
      var dest = detectMoveLoc(rawAct);
      if (dest && dest !== W.player.loc) {
        // feed aksi dulu di lokasi lama, lalu feed sistem pindah — urutan kronologis.
        pushFeed({ kind: "chat", who: W.player.name, mine: true, loc: W.player.loc, text: display, act: true });
        playerMoveTo(dest);
        moved = true;
      }
    }
    var loc = target ? target.loc : W.player.loc;
    if (!moved) pushFeed({ kind: "chat", who: W.player.name, mine: true, loc: loc, text: display, act: !!isAct });
    renderStage(); scrollFeed();
    var first = target || candidatesAt(loc)[0] || W.chars.filter(function (c) { return c.loc === loc; })[0];
    if (!first) {
      var where = W.chars.map(function (c) { return c.name + " " + C("inWord") + " " + locName(c.loc); }).join(", ");
      pushFeed({ kind: "system", loc: loc, text: C("quiet", { loc: locName(loc), where: where ? " (" + where + ")." : "." }) });
      busy = false; renderStage(); scrollFeed(); maybeExtract(); return;
    }
    applyAffinity(first, display);
    try {
      var mentioned = detectMentions(display, [first.id]);
      mentioned.forEach(function (mc) {
        var tone = toneOfText(display);
        if (tone === "neutral") return;
        var dd = (tone === "warm") ? 4 : -5;
        setBond(first, mc.id, bondOf(first, mc.id) + dd);
        first.mood = (WL() === "en") ? (tone === "warm" ? "pleased" : "annoyed") : (tone === "warm" ? "senang" : "kesal");
        first.moodWhy = ((WL() === "en") ? "heard about " : "dengar soal ") + mc.name;
        addRumor(mc.id, first.id, display, tone);
      });
      if (mentioned.length) save();
    } catch (eR) {}
    var bubble = addStreamingBubble(first);
    try {
      var situation;
      if (WL() === "en") {
        if (isAct) situation = "You are in " + locName(loc) + ". " + W.player.name + " performs a PHYSICAL ACTION: \"" + rawAct + "\"" + (target ? " (right at you / in front of you)" : " (near you, in the same location)") + ". This is NOT speech — do not treat it as dialogue. Tasks: (1) briefly narrate the physical outcome if needed (success/failure, fitting the world and its rules), (2) react naturally as yourself (dialogue + one *action* allowed). If the action mentions moving, assume " + W.player.name + " is already in " + locName(loc) + ".";
        else situation = "You are in " + locName(loc) + ". " + W.player.name + " says: \"" + text + "\"" + (target ? " (directly to you)" : " (near you)") + ". React naturally.";
      } else {
        if (isAct) situation = "Kamu di " + locName(loc) + ". " + W.player.name + " melakukan AKSI FISIK: \"" + rawAct + "\"" + (target ? " (langsung padamu/ di depanmu)" : " (di dekatmu, di lokasi yang sama)") + ". Ini BUKAN ucapan — jangan perlakukan sebagai dialog. Tugas: (1) narasikan akibat fisik aksi itu secara singkat bila perlu (berhasil/gagal, masuk akal dunia dan aturan dunia), (2) respon natural sebagai dirimu (boleh dialog + *aksi* 1 kalimat). Jika aksi menyebut pindah lokasi, anggap " + W.player.name + " sudah ada di " + locName(loc) + ".";
        else situation = "Kamu di " + locName(loc) + ". " + W.player.name + " berkata: \"" + text + "\"" + (target ? " (langsung padamu)" : " (di dekatmu)") + ". Respon natural.";
      }
      var reply = await speakAs(first, situation, bubble);
      pushFeed({ kind: "chat", who: first.name, loc: first.loc, text: reply });
      doneTyping(first, T("stChat", { loc: locName(first.loc) }));
    } catch (e) { try { if (first && first.id && liveTyping[first.id]) delete liveTyping[first.id]; } catch (eL) {} pushFeed({ kind: "system", loc: loc, text: "⚠️ " + first.name + (WL() === "en" ? " failed to respond (" : " gagal merespon (") + String(e && e.message || e).slice(0, 120) + ")." }); }
    // nimbrung: satu karakter lain di lokasi sama boleh menimpali
    var others = candidatesAt(loc, first.id);
    if (others.length && Math.random() < 0.45) {
      var second = others[Math.floor(Math.random() * others.length)];
      var b2 = addStreamingBubble(second);
      try {
        var r2;
        if (WL() === "en") r2 = await speakAs(second, isAct ? "You are also in " + locName(loc) + " and SAW the action just now (" + rawAct + "). Chime in naturally if it makes sense (1-2 sentences is fine)." : "You are also in " + locName(loc) + " and overheard the conversation. Chime in naturally if it makes sense (1-2 sentences is fine).", b2);
        else r2 = await speakAs(second, isAct ? "Kamu juga di " + locName(loc) + " dan MELIHAT aksi barusan (" + rawAct + "). Nimbrung natural jika masuk akal (boleh cuma 1-2 kalimat)." : "Kamu juga di " + locName(loc) + " dan mendengar percakapan barusan. Nimbrung natural jika masuk akal (boleh cuma 1-2 kalimat).", b2);
        pushFeed({ kind: "chat", who: second.name, loc: second.loc, text: r2 });
        doneTyping(second, T("stChat", { loc: locName(second.loc) }));
      } catch (e2) { try { if (second && second.id && liveTyping[second.id]) delete liveTyping[second.id]; } catch (eL2) {} }
    }
    try {
      if (W.genre === "fantasy") {
        var _pp = W.player;
        _pp.full = clampStat((Number(_pp.full) || 0) - 2);
        _pp.energy = clampStat((Number(_pp.energy) || 0) - 2);
        try { advanceClock(1); } catch (e) {}
      }
    } catch (e) {}
    busy = false; renderStage(); scrollFeed(); maybeExtract();
  }

  function rotOn() { return !!(W && W.rot && W.rot.on !== false); }
  function shouldRotate() {
    if (!W || !rotOn() || !W.chars.length) return false;
    var t = (W.rot.ticks || 0) - (W.rot.last == null ? -99 : W.rot.last);
    if (t < ROT_MIN_TICKS) return false;
    return Math.random() < ROT_CHANCE;
  }
  function parseRotJson(txt) {
    if (!txt) return null;
    var m = String(txt).match(/```json\s*([\s\S]*?)```/i) || String(txt).match(/(\{[\s\S]*\})/);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch (e) { return null; }
  }
  async function rotationTurn() {
    if (busy || !W || !W.chars.length || !aiReady()) return;
    normalizeWorld();
    var pool = W.chars.filter(function (c) { return !c.pinned; });
    if (!pool.length) return;
    busy = true; renderStage();
    W.rot.ticks = (W.rot.ticks || 0) + 1;
    try {
      var exNames = (W.exResidents || []).map(function (e) { return e.name; }).filter(Boolean).slice(-12).join(", ");
      var spec = await genTextP({ instruction:
        worldHead() + "\nContext:\n" + feedCtx(10) +
        "\nFormer residents (may return): " + (exNames || "-") +
        "\nTASK: move souls in and/or out for in-world reasons. The user (" + W.player.name + ") is NOT special — do not center, mention, or consult them." +
        "\nRULES: (1) leave reason must be a concrete in-world need/duty (shift over, family matter, errand, fatigue, debt, summons elsewhere). NEVER meta reasons like 'rare interaction / inactive / to make room'." +
        " (2) Leave and arrival are INDEPENDENT: someone may leave at ANY size (5→4 is normal life, not only when full) as long as 2 remain; someone may arrive whenever cast < " + MAX_CHARS + " (now " + W.chars.length + "/" + MAX_CHARS + "). If full and someone arrives, someone must also leave. Make at least one change." +
        " (3) arrival must fit genre " + W.genre + ", with a natural arrive reason (passing trader, new transfer, pilgrim, customer, relative visiting)." +
        " Prefer a returnee from former residents when sensible." +
        " Language: " + langName(W.lang) + ". MANDATORY JSON only:\n```json\n{\"leaveId\":\"<id or null>\",\"leaveReason\":\"...\",\"enter\":{\"mode\":\"new|returnee\",\"name\":\"...\",\"role\":\"...\",\"personality\":\"1 sentence\",\"goal\":\"...\",\"desc\":\"looks+clothing\",\"loc\":\"<location name>\",\"arriveReason\":\"...\"}}\n```" +
        "\nIds: " + W.chars.map(function (c) { return c.name + "=" + c.id + (c.pinned ? " [PINNED, never pick]" : ""); }).join(", ") });
      var o = parseRotJson(spec);
      var leaver = null;
      if (o && o.leaveId) {
        for (var i = 0; i < pool.length; i++) if (pool[i].id === o.leaveId) leaver = pool[i];
      }
      if (leaver && W.chars.length <= 2) leaver = null;
      var willEnter = !!(o && o.enter && o.enter.name);
      if (!leaver && willEnter && W.chars.length >= MAX_CHARS && pool.length) {
        leaver = pool[Math.floor(Math.random() * pool.length)];
        if (!o.leaveReason) o.leaveReason = (WL() === "en" ? "duty calls elsewhere" : "ada urusan di tempat lain");
      }
      if (!leaver && !willEnter && pool.length && W.chars.length > 2) {
        leaver = pool[Math.floor(Math.random() * pool.length)];
        if (!o) o = {};
        if (!o.leaveReason) o.leaveReason = (WL() === "en" ? "heads out for their own errands" : "pergi mengurus urusannya sendiri");
      }
      if (leaver && o) {
        var reason = String(o.leaveReason || (WL() === "en" ? "duty calls elsewhere" : "ada urusan di tempat lain")).slice(0, 200);
        W.exResidents.unshift({ name: leaver.name, role: leaver.role, personality: leaver.personality, goal: leaver.goal, desc: leaver.desc, avatar: leaver.avatar || "", affinity: 0, ts: Date.now(), why: reason });
        while (W.exResidents.length > EX_MAX) W.exResidents.pop();
        W.chars = W.chars.filter(function (x) { return x.id !== leaver.id; });
        if (focusChar === leaver.id) focusChar = null;
        pushFeed({ kind: "system", loc: leaver.loc, text: C("leaveWhy", { name: leaver.name, reason: reason }) });
      }
      var ent = o && o.enter;
      if (ent && (ent.name || ent.mode === "returnee")) {
        var nm = String(ent.name || "").slice(0, 30).trim();
        var ret = null;
        if (nm) for (var ri = 0; ri < W.exResidents.length; ri++) if (W.exResidents[ri].name.toLowerCase() === nm.toLowerCase()) ret = W.exResidents[ri];
        var lid = null;
        if (ent.loc) for (var li = 0; li < W.locations.length; li++) if (W.locations[li].name.toLowerCase() === String(ent.loc).toLowerCase() || W.locations[li].id === ent.loc) lid = W.locations[li].id;
        if (!lid) lid = (W.locations[0] && W.locations[0].id) || null;
        var arr = String(ent.arriveReason || (WL() === "en" ? "just passing by" : "kebetulan lewat")).slice(0, 200);
        if (ret && W.chars.length < MAX_CHARS) {
          var nc2 = { id: uid("c"), name: ret.name, role: ret.role || C("roleDef"), personality: ret.personality || C("persDef"), goal: ret.goal || "-", desc: ret.desc || "", loc: lid, avatar: ret.avatar || "", affinity: 0, mems: [], pinned: false, act: arr.slice(0, 90), actTs: Date.now(), items: [] };
          W.chars.push(nc2);
          pushFeed({ kind: "system", loc: lid, text: C("comeBack", { name: nc2.name, role: nc2.role, loc: locName(lid), reason: arr }) });
          try { if (!nc2.avatar) portraitFor(nc2.id, null, true); } catch (e2) {}
        } else if (nm && W.chars.length < MAX_CHARS) {
          var dup = false;
          for (var di = 0; di < W.chars.length; di++) if (W.chars[di].name.toLowerCase() === nm.toLowerCase()) dup = true;
          if (!dup) {
            var nc = { id: uid("c"), name: nm, role: String(ent.role || C("roleDef")).slice(0, 40),
              personality: String(ent.personality || C("persDef")).slice(0, 200),
              goal: String(ent.goal || "-").slice(0, 200), desc: String(ent.desc || "").slice(0, 500),
              loc: lid, avatar: "", affinity: 0, mems: [], pinned: false, act: arr.slice(0, 90), actTs: Date.now(), items: [] };
            W.chars.push(nc);
            pushFeed({ kind: "system", loc: lid, text: C("comeWhy", { name: nm, role: nc.role, loc: locName(lid), reason: arr, desc: nc.desc ? nc.desc + " " : "", goal: nc.goal }) });
            try { portraitFor(nc.id, null, true); } catch (e3) {}
          }
        }
      }
      W.rot.last = (W.rot.ticks || 0);
      save();
      advanceClock(1);
    } catch (e) {}
    busy = false; renderAll(); scrollFeed(); maybeExtract();
  }
  async function soloTurn() {
    if (busy || !W || !W.chars.length || !aiReady()) return;
    var c = W.chars[Math.floor(Math.random() * W.chars.length)];
    if (!c) return;
    busy = true;
    W.rot.ticks = (W.rot.ticks || 0) + 1;
    var b = addStreamingBubble(c);
    try {
      var txt = await genTextP({ instruction:
        worldHead() + "\nContext:\n" + feedCtx(8) +
        "\nTASK: write what " + c.name + " (" + c.role + ", in " + locName(c.loc) + ") is doing RIGHT NOW on their own — chores, work, errand, rest, small habit fitting " + W.genre + " genre." +
        " The user is NOT involved and NOT watching. Do not address, mention, or wait for the user. 1-2 sentences, *action* + one line of ambience max." +
        " Language: " + langName(W.lang) + "." });
      txt = String(txt || "").trim().slice(0, 400) || (WL() === "en" ? "keeps busy with their own matters." : "sibuk dengan urusannya sendiri.");
      pushFeed({ kind: "chat", who: c.name, loc: c.loc, text: "*" + txt.replace(/^\*+|\*+$/g, "") + "*" });
      doneTyping(c, txt.replace(/^\*+|\*+$/g, "").slice(0, 90));
    } catch (e) { try { if (c && c.id && liveTyping[c.id]) delete liveTyping[c.id]; } catch (eL) {} }
    advanceClock(1);
    busy = false; renderStage(); scrollFeed(); maybeExtract();
  }
  async function ambientTurn() {
    if (busy || !W || !W.chars.length || !aiReady()) return;
    normalizeWorld();
    try {
      W.chars.forEach(function (c) {
        if (moodOf(c) !== neutralMood() && Math.random() < 0.15) { c.mood = neutralMood(); c.moodWhy = ""; }
      });
    } catch (eD) {}
    if (shouldRotate()) { await rotationTurn(); return; }
    try {
      if (W.genre === "fantasy" && W.mode === "player" && Math.random() < 0.35) {
        var _hereN = W.chars.filter(function (c) { return c.loc === W.player.loc; });
        if (_hereN.length) {
          var _c = _hereN[Math.floor(Math.random() * _hereN.length)];
          var _last = Number(_c.lastOffer) || 0;
          if (Date.now() - _last > OFFER_COOLDOWN_MS) {
            var _hasQ = (W.quests || []).some(function (q) { return q.giverId === _c.id && (q.state === "offered" || q.state === "active"); });
            if (!_hasQ) {
              var _lowFull = (Number(W.player.full) || 0) < 40, _lowHp = (Number(W.player.hp) || 0) < 50;
              if (_lowFull || _lowHp || Math.random() < 0.4) { offerQuest(_c.id); renderAll(); scrollFeed(); return; }
            }
          }
        }
      }
    } catch (e) {}
    if (Math.random() < 0.30 && W.chars.length >= 1) { await soloTurn(); return; }
    var byLoc = {};
    W.chars.forEach(function (c) { (byLoc[c.loc] = byLoc[c.loc] || []).push(c); });
    var locs = Object.keys(byLoc).filter(function (k) { return byLoc[k].length >= 2; });
    if (!locs.length) { await soloTurn(); return; }
    busy = true;
    W.rot.ticks = (W.rot.ticks || 0) + 1;
    var loc = locs[Math.floor(Math.random() * locs.length)];
    var pair = byLoc[loc].slice().sort(function () { return Math.random() - 0.5; }).slice(0, 2);
    pushFeed({ kind: "system", loc: loc, text: C("ambientStart", { pair: pair.map(function (c) { return c.name; }).join(WL() === "en" ? " and " : " dan "), loc: locName(loc) }) });
    renderStage(); scrollFeed();
    try {
      var b = addStreamingBubble(pair[0]);
      var gp = pickGossip(pair);
      var sit0 = (WL() === "en" ? "You are in " + locName(loc) + " with " + pair[1].name + ". Start a natural chat about your own lives/work (small happenings, gossip, work, weather, quests). The user is NOT here — do not address or mention them." : "Kamu di " + locName(loc) + " bersama " + pair[1].name + ". Mulai obrolan natural soal hidup/kerjaan kalian (kejadian kecil, gosip, kerjaan, cuaca, misi). User TIDAK ada di sini — jangan sapa atau sebut user.");
      if (gp) sit0 += (WL() === "en" ? " You heard this about " + gp.about.name + ": \"" + gp.r.text.slice(0, 120) + "\". Bring it up naturally if it fits the moment." : " Kamu dengar soal " + gp.about.name + ": \"" + gp.r.text.slice(0, 120) + "\". Ungkit secara natural kalau pas momennya.");
      var r = await speakAs(pair[0], sit0, b);
      pushFeed({ kind: "chat", who: pair[0].name, loc: pair[0].loc, text: r });
      doneTyping(pair[0], T("stChat", { loc: locName(pair[0].loc) }));
      renderStage(); scrollFeed();
      if (Math.random() < 0.8) {
        var b2 = addStreamingBubble(pair[1]);
        var r2 = await speakAs(pair[1], (WL() === "en" ? "Naturally respond to " + pair[0].name + " in " + locName(loc) + ". Talk about your own matters, not the user." : "Respon obrolan " + pair[0].name + " di " + locName(loc) + " secara natural. Bahas urusan kalian sendiri, bukan user."), b2);
        pushFeed({ kind: "chat", who: pair[1].name, loc: pair[1].loc, text: r2 });
        doneTyping(pair[1], T("stChat", { loc: locName(pair[1].loc) }));
        if (gp) {
          try {
            var gd = (gp.r.tone === "warm") ? 5 : -6;
            setBond(gp.other, gp.about.id, bondOf(gp.other, gp.about.id) + gd);
            setBond(gp.teller, gp.other.id, bondOf(gp.teller, gp.other.id) + 2);
            gp.other.mood = (WL() === "en") ? (gp.r.tone === "warm" ? "intrigued" : "suspicious") : (gp.r.tone === "warm" ? "tertarik" : "curiga");
            gp.other.moodWhy = ((WL() === "en") ? "heard gossip about " : "dengar gosip soal ") + gp.about.name + ((WL() === "en") ? " from " : " dari ") + gp.teller.name;
            gp.r.spread = (gp.r.spread || 0) + 1;
            W.rumors = (W.rumors || []).filter(function (x) { return (x.spread || 0) < 2; });
            save();
          } catch (eG) {}
        }
      }
    } catch (e) { try { pair.forEach(function (p) { if (p && p.id && liveTyping[p.id]) delete liveTyping[p.id]; }); } catch (eL) {} }
    advanceClock(1);
    busy = false; renderStage(); scrollFeed(); maybeExtract();
  }

  function moveChar(id, locId) {
    // Pindah NPC langsung = kuasa dewa. Player pindah dirinya via 🎭 aksi (playerMoveTo).
    if (needGod("Moving NPCs")) return;
    var c = charById(id);
    if (!c || c.loc === locId) return;
    var from = locName(c.loc);
    c.loc = locId;
    pushFeed({ kind: "system", loc: locId, text: C("enter", { who: c.name, loc: locName(locId), from: from }) });
    setAct(c, T("stAt", { loc: locName(locId) }));
    save(); renderAll(); scrollFeed();
  }
  /* ---------- mode guard: player = hanya percakapan/aksi, god = bebas ---------- */
  function isGod() { return !!(W && W.mode === "god"); }
  function needGod(actionName) {
    if (isGod()) return false;
    var what = actionName || (effUi() === "id" ? "Fitur ini" : "This feature");
    if (effUi() === "id") what = NG[what] || what;
    toast(T("needGod", { what: what }));
    return true;
  }
  var NG = {
    "God Room": "Ruang Dewa", "Divine will": "Kehendak dewa",
    "Time skip": "Time-skip", "Time travel": "Time-travel",
    "Moving NPCs": "Memindahkan NPC", "Portrait generation": "Generate portrait",
    "NPC profile editing": "Edit profil NPC", "Auto NPC": "Auto NPC",
    "Illustrating messages": "Gambarkan pesan", "Adding NPCs": "Menambah NPC",
    "Roster import": "Ambil dari roster", "Adding from roster": "Memasukkan roster",
    "Redrawing portraits": "Gambar ulang portrait", "Removing NPCs": "Menghapus NPC",
    "Changing time": "Mengubah waktu", "Changing weather": "Mengubah cuaca",
    "Editing conditions": "Mengedit kondisi", "Managing items": "Mengelola barang"
  };
  var MOVE_RX = /(pergi|pindah|masuk|menuju|jalan|berjalan|melangkah|berlari|lari|kabur|mampir|datang|kembali|teleport|menyelinap|bersembunyi|mengendap|go|going|move|moving|enter|entering|head|heading|walk|walking|run|running|return|returning|flee|fleeing|sneak|sneaking|hide|hiding)/i;
  function detectMoveLoc(text) {
    if (!W || !text) return null;
    var t = String(text).toLowerCase();
    // slash command eksplisit: /pindah <nama>, /pergi <nama>, /move <nama>
    var mSlash = t.match(/^\s*\/(pindah|pergi|move|goto|go|ke)\s+(.+?)\s*$/);
    var query = mSlash ? mSlash[2] : null;
    var sorted = W.locations.slice().sort(function (a, b) { return b.name.length - a.name.length; });
    var i, l;
    if (query) {
      for (i = 0; i < sorted.length; i++) {
        l = sorted[i];
        if (l.name.toLowerCase() === query || l.name.toLowerCase().indexOf(query) !== -1 || query.indexOf(l.name.toLowerCase()) !== -1) return l.id;
      }
      var byId = resolveLocId(query);
      if (byId) return byId;
      return null;
    }
    // aksi natural: harus ada kata gerak + nama lokasi disebut
    if (!MOVE_RX.test(t) && t.indexOf(" ke ") === -1 && t.indexOf(" to ") === -1) return null;
    for (i = 0; i < sorted.length; i++) {
      l = sorted[i];
      if (l.name && t.indexOf(l.name.toLowerCase()) !== -1) return l.id;
    }
    return null;
  }
  function playerMoveTo(locId) {
    if (!W || !locId || W.player.loc === locId) return false;
    // Aturan main (a): tidak bisa pindah lokasi saat battle — kalahkan atau kabur dulu.
    if (W.encounter) {
      toast(WL() === "en"
        ? "⚔️ You can't travel mid-battle! Defeat it or flee (🏃) first."
        : "⚔️ Tidak bisa pergi saat battle! Kalahkan musuhnya atau kabur (🏃) dulu.");
      return false;
    }
    var from = locName(W.player.loc);
    if ((Number(W.player.energy) || 0) < 6) { toast(WL() === "en" ? "Too tired to travel - rest first." : "Terlalu lelah untuk pergi - istirahat dulu."); return false; }
    W.player.energy = clampStat((Number(W.player.energy) || 0) - 6);
    W.player.full = clampStat((Number(W.player.full) || 0) - 1);
    W.player.loc = locId;
    try { bumpStat("travel"); if (!W.player.visited || typeof W.player.visited !== "object") W.player.visited = {}; W.player.visited[locId] = 1; } catch (eT) {}
    pushFeed({ kind: "system", loc: locId, text: C("enter", { who: W.player.name, loc: locName(locId), from: from }) + (WL() === "en" ? " (−6 energy)" : " (−6 energi)") });
    if (isDangerLoc(locName(locId)) && !W.encounter && Math.random() < 0.20) {
      var amb = spawnMonster(locId);
      if (amb) pushFeed({ kind: "system", loc: locId, text: (WL() === "en" ? "⚔️ Ambush! Wild " + amb.name + " appears! (HP " + amb.hp + ")" : "⚔️ Penyergapan! " + amb.name + " liar muncul! (HP " + amb.hp + ")") });
    }
    try { advanceClock(1); } catch (e) {}
    save();
    return true;
  }

  /* ---------- dewa ---------- */
  function isDestruct(cmd) { return DESTRUCT_RX.test(String(cmd || "")); }
  async function godDiscuss(cmd) {
    cmd = String(cmd || "").trim();
    if (!W) return;
    if (!cmd) { toast((WL() === "en") ? "Write an order first." : "Tulis perintah dulu."); return; }
    if (needGod("God Room")) return;
    if (!aiReady()) { toast(T("aiNotReady")); return; }
    if (busy) { toast(T("busy")); return; }
    busy = true; paintGodBusy();
    var box = $("wd-godlog");
    var div = document.createElement("div");
    div.className = "wd-goditem";
    div.innerHTML = "<b>" + T("discussYou") + "</b> " + esc(cmd) + "<div class='wd-godthink is-loading'><span class='wd-spin'></span> " + esc(T("thinking")) + "</div>";
    if (box) { box.appendChild(div); box.scrollTop = box.scrollHeight; }
    var think = div.querySelector(".wd-godthink");
    try {
      var out = await genTextP({ instruction:
        (WL() === "en"
          ? "You are the GOD assistant for a roleplay world.\n" + worldHead() +
            "\nContext:\n" + feedCtx(10) +
            "\nDIVINE ORDER: " + cmd +
            "\nTASK: (1) Judge the order: destructive / balance-breaking? (destroying, mass killing, deleting, overpower). " +
            "(2) If YES: refuse SOFTLY — explain in 1-2 sentences how it risks the story, offer 1 softer version, and say the user may insist by repeating the order. " +
            "(3) If NO: briefly explain what WILL happen (future tense only — nothing has happened yet, the user still has to click Run; NEVER past tense like \"done/granted/added\"). " +
            "Answer as a loyal assistant + stability guard, max 6 sentences. Language: " + langName(W.lang) + "."
          : "Kamu asisten DEWA untuk dunia roleplay.\n" + worldHead() +
            "\nKonteks:\n" + feedCtx(10) +
            "\nPERINTAH DEWA: " + cmd +
            "\nTUGAS: (1) Nilai perintah: destruktif/merusak keseimbangan? (menghancurkan, membunuh massal, menghapus, overpower). " +
            "(2) Jika YA: tolak HALUS — jelaskan 1-2 kalimat risiko rusaknya cerita, tawari 1 versi lunak, dan katakan user boleh memaksa dengan mengulang perintah. " +
            "(3) Jika TIDAK: jelaskan singkat apa yang AKAN terjadi (wajib future tense — belum terjadi apa-apa sebelum user klik Jalankan; JANGAN pakai kalimat past tense seperti \"sudah/kini/telah ditambah\"). " +
            "Jawab sebagai asisten setia + penjaga stabilitas, maksimal 6 kalimat. Bahasa: " + langName(W.lang) + ".") });
      if (think) { think.classList.remove("is-loading"); think.innerHTML = esc((out || "").trim() || "…"); }
      try { savedGodLogHtml = $("wd-godlog") ? $("wd-godlog").innerHTML.slice(-8000) : savedGodLogHtml; } catch (e) {}
      if (isDestruct(cmd) && (!godPending || godPending.cmd !== cmd)) {
        godPending = { cmd: cmd, ts: Date.now() };
        var warn = document.createElement("div");
        warn.className = "wd-warn";
        warn.innerHTML = T("destructWarn");
        div.appendChild(warn);
        var row = document.createElement("div");
        row.className = "wd-row";
        row.innerHTML = "<button type='button' class='wd-btn danger' data-godbtn=''>" + esc(T("bForce")) + "</button>";
        (function (btn) {
          godBtnSeq += 1;
          var nid = "g" + Date.now().toString(36) + godBtnSeq;
          godBtnCmds[nid] = { cmd: cmd, forced: true };
          btn.setAttribute("data-godbtn", nid);
        })(row.querySelector("button"));
        div.appendChild(row);
      } else {
        godPending = null;
        var row2 = document.createElement("div");
        row2.className = "wd-row";
        row2.innerHTML = "<button type='button' class='wd-btn go' data-godbtn=''>" + esc(T("bDoIt")) + "</button>";
        (function (btn) {
          godBtnSeq += 1;
          var nid = "g" + Date.now().toString(36) + godBtnSeq;
          godBtnCmds[nid] = { cmd: cmd, forced: false };
          btn.setAttribute("data-godbtn", nid);
        })(row2.querySelector("button"));
        div.appendChild(row2);
      }
      try { savedGodLogHtml = $("wd-godlog") ? $("wd-godlog").innerHTML.slice(-8000) : savedGodLogHtml; } catch (e2) {}
    } catch (e) { if (think) { think.classList.remove("is-loading"); think.textContent = T("aiFail") + String(e && e.message || e).slice(0, 160); } }
    busy = false; paintGodBusy(); renderGodState();
  }
  function markGodBtn(btn, state) {
    try {
      if (!btn || !btn.parentNode) return;
      var en = (WL() === "en");
      if (state === "running") {
        btn.disabled = true;
        btn.innerHTML = "<span class='wd-spin'></span> " + esc(en ? "Running…" : "Menjalankan…");
      } else if (state === "done") {
        btn.setAttribute("data-done", "1");
        btn.disabled = true;
        btn.classList.remove("go", "danger");
        btn.classList.add("done");
        var t = new Date();
        var hh = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0") + ":" + String(t.getSeconds()).padStart(2, "0");
        btn.innerHTML = "✅ " + esc(en ? ("Executed • " + hh) : ("Sudah dijalankan • " + hh));
        var note = document.createElement("div");
        note.className = "wd-donenote";
        note.textContent = en ? "✅ Done — see the result in the feed below (🌩️)." : "✅ Sudah dijalankan — lihat hasilnya di feed bawah (🌩️).";
        if (btn.parentNode && !btn.parentNode.querySelector(".wd-donenote")) btn.parentNode.appendChild(note);
      } else if (state === "failed") {
        btn.disabled = false;
        btn.removeAttribute("data-done");
        btn.innerHTML = esc(T("bDoIt"));
        var fn = document.createElement("div");
        fn.className = "wd-runstat";
        fn.textContent = en ? "⚠️ Failed — click to try again." : "⚠️ Gagal — klik untuk coba lagi.";
        if (btn.parentNode && !btn.parentNode.querySelector(".wd-runstat")) btn.parentNode.appendChild(fn);
      }
      try { savedGodLogHtml = $("wd-godlog") ? $("wd-godlog").innerHTML.slice(-8000) : savedGodLogHtml; } catch (e) {}
    } catch (e2) {}
  }
  async function godRun(cmd, forced, srcBtn) {
    if (!W) return;
    cmd = String(cmd || "").trim();
    if (!cmd && !srcBtn) { toast((WL() === "en") ? "Write an order first." : "Tulis perintah dulu."); return; }
    if (!cmd && srcBtn) return;
    if (busy) { toast(T("busy")); return; }
    if (needGod("Divine will")) return;
    if (isDestruct(cmd) && !forced && (!godPending || godPending.cmd !== cmd)) { godDiscuss(cmd); return; }
    godPending = null;
    if (!aiReady()) { toast(T("aiNotReady")); return; }
    if (srcBtn && srcBtn.getAttribute("data-done") === "1") return;
    if (srcBtn) markGodBtn(srcBtn, "running");
    busy = true; paintGodBusy(); renderGodState(); renderStage();
    pushFeed({ kind: "god", loc: null, text: C("godWill", { cmd: cmd }) });
    renderStage(); scrollFeed();
    var bubble = addStreamingBubble(null, WL() === "en" ? "🌩️ Fate is moving…" : "🌩️ Takdir bergerak…");
    try { if (bubble) { bubble.classList.add("is-loading"); bubble.innerHTML = "<span class='wd-spin'></span> " + esc(bubble.textContent || (WL() === "en" ? "Fate is moving…" : "Takdir bergerak…")); } } catch (e) {}
    var okRun = false;
    try {
      var spec = await genTextP({ instruction:
        (WL() === "en"
          ? worldHead() + "\nContext:\n" + feedCtx(12) +
            "\nDIVINE ORDER (must be obeyed, this is the highest authority): " + cmd +
            "\nTASK: write the outcome as narration + state patch. MANDATORY format:\nNARASI:\n<1-3 paragraphs " + langName(W.lang) + ">\nPATCH:\n```json\n{\"moves\":{},\"newLocations\":[],\"newChars\":[],\"affinity\":{},\"bonds\":{},\"mood\":{},\"addCharMem\":{},\"addWorldMem\":[],\"loreEdit\":{},\"weather\":\"kind\",\"clock\":{\"day\":N,\"phase\":0-3},\"locCond\":{},\"give\":{},\"take\":{},\"coins\":{}}\n```\n" +
            "moves: {charId: locId} (use existing location ids/names; for a new location, first register it in newLocations {name,desc} then use its NAME in moves). newChars (max 2, only if the order needs a new figure): [{name, role, personality (1 sentence), goal, desc (looks + clothing), loc (location name)}] — FULL profile required, never just a name. affinity: {charId: delta -20..20}. bonds: {\"NameA>NameB\": delta -20..20} shifts how A feels about B. mood: {charId: \"tag — why\"} sets current mood. addCharMem: {charId:[facts]}. addWorldMem:[facts]. loreEdit may include {premise|rules|tone}. weather: one of clear|cloudy|rainy|windy|foggy. clock: {day (number), phase (0 morning, 1 afternoon, 2 evening, 3 night)}. locCond: {locNameOrId: \"visible condition\"}. give/take: {nameOrId: [\"item\"]} (mini inventory, max 12 strings; may include the user \"__player\"). One CLEAN item name per string — NEVER embed counts (\"10 wood\" is FORBIDDEN): for N items repeat the name N times, e.g. 3 wood -> {\"__player\": [\"Kayu\", \"Kayu\", \"Kayu\"]}. coins: {nameOrId: delta} — MONEY, e.g. {\"__player\": 1000} grants 1000 coins, {\"Bara\": -50} takes 50. ALWAYS use coins for money wishes, never invent items as money. Character ids: " + W.chars.map(function (c) { return c.name + "=" + c.id; }).join(", ") + ". If the order is impossible/unclear, narrate a sensible partial failure, PATCH may be {}."
          : worldHead() + "\nKonteks:\n" + feedCtx(12) +
            "\nPERINTAH DEWA (wajib ditaati, ini otoritas tertinggi): " + cmd +
            "\nTUGAS: tulis dampaknya sebagai narasi + patch state. Format WAJIB:\nNARASI:\n<1-3 paragraf " + langName(W.lang) + ">\nPATCH:\n```json\n{\"moves\":{},\"newLocations\":[],\"newChars\":[],\"affinity\":{},\"bonds\":{},\"mood\":{},\"addCharMem\":{},\"addWorldMem\":[],\"loreEdit\":{},\"weather\":\"kind\",\"clock\":{\"day\":N,\"phase\":0-3},\"locCond\":{},\"give\":{},\"take\":{},\"coins\":{}}\n```\n" +
            "moves: {charId: locId} (gunakan id lokasi/nama yang ada; jika lokasi baru, daftarkan di newLocations {name,desc} lalu moves memakai NAMA itu). newChars (maks 2, hanya jika perintah butuh sosok baru): [{name, role, personality (1 kalimat), goal, desc (ciri fisik), loc (nama lokasi)}] — WAJIB profil lengkap, jangan nama saja. affinity: {charId: delta -20..20}. bonds: {\"NamaA>NamaB\": delta -20..20} menggeser perasaan A ke B. mood: {charId: \"tag — sebab\"} mengatur mood saat ini. addCharMem: {charId:[fakta]}. addWorldMem:[fakta]. loreEdit boleh {premise|rules|tone}. weather: salah satu cerah|berawan|hujan|berangin|berkabut. clock: {day (angka), phase (0 pagi, 1 siang, 2 sore, 3 malam)}. locCond: {namaAtauIdLokasi: \"kondisi terlihat\"}. give/take: {namaAtauId: [\"barang\"]} (inventory mini, maks 12 string; boleh termasuk user \"__player\"). Satu string = SATU nama barang BERSIH — JANGAN selipkan jumlah (\"10 kayu\" DILARANG): untuk N barang ulangi namanya N kali, mis. 3 kayu -> {\"__player\": [\"Kayu\", \"Kayu\", \"Kayu\"]}. coins: {namaAtauId: delta} — UANG, mis. {\"__player\": 1000} memberi 1000 koin, {\"Bara\": -50} mengambil 50. SELALU pakai coins untuk permintaan uang, jangan bikin item jadi uang. Id karakter: " + W.chars.map(function (c) { return c.name + "=" + c.id; }).join(", ") + ". Jika perintah mustahil/tidak jelas, narasikan kegagalan parsial yang masuk akal, PATCH boleh {}.") });
      var nar = WL() === "en" ? "Fate moves." : "Takdir bergerak.", patch = null;
      var mN = spec.match(/NARASI:\s*([\s\S]*?)(?:PATCH:|$)/i);
      if (mN && mN[1].trim()) nar = mN[1].replace(/```json[\s\S]*?```/g, "").trim().slice(0, 1500);
      patch = parsePatchJson(spec);
      var spawned = patch ? applyPatch(patch) : [];
      try {
        var hasCoinPatch = !!(patch && patch.coins && typeof patch.coins === "object" && Object.keys(patch.coins).length);
        if (!hasCoinPatch) {
          var mm = String(cmd || "").match(/(\d[\d.,]*)\s*(koin|coin|uang|gold|money|gld)/i);
          if (mm) {
            var amt = Math.max(1, Math.min(10000, parseInt(String(mm[1]).replace(/[.,]/g, ""), 10) || 0));
            if (amt > 0) {
              W.player.coins = Math.max(0, Math.round((Number(W.player.coins) || 0) + amt));
              save();
              nar += (WL() === "en" ? " (+" + amt + " coins)" : " (+" + amt + " koin)");
            }
          }
        }
      } catch (e) {}
      spawned.forEach(function (nid) { try { portraitFor(nid, null, true); } catch (e) {} });
      pushFeed({ kind: "system", loc: null, text: "🌩️ " + nar });
      okRun = true;
    } catch (e) { pushFeed({ kind: "system", loc: null, text: T("godFail") + String(e && e.message || e).slice(0, 140) + ")." }); }
    if (srcBtn) markGodBtn(srcBtn, okRun ? "done" : "failed");
    try { savedGodLogHtml = $("wd-godlog") ? $("wd-godlog").innerHTML.slice(-8000) : savedGodLogHtml; } catch (e) {}
    busy = false; renderAll(); paintGodBusy(); scrollFeed(); maybeExtract();
  }
  function parsePatchJson(spec) {
    if (!spec) return null;
    var mJ = spec.match(/```json\s*([\s\S]*?)```/i) || spec.match(/PATCH:\s*(\{[\s\S]*\})/i);
    if (!mJ) return null;
    try { return JSON.parse(mJ[1]); } catch (e) { return null; }
  }
  function resolveLocId(want) {
    if (!W || want == null) return null;
    var s = String(want);
    for (var i = 0; i < W.locations.length; i++) if (W.locations[i].id === s || W.locations[i].name.toLowerCase() === s.toLowerCase()) return W.locations[i].id;
    return null;
  }
  function applyPatch(p) {
    if (!p || typeof p !== "object") return [];
    var notes = [];
    var newIds = [];
    if (Array.isArray(p.newLocations)) p.newLocations.slice(0, 4).forEach(function (l) {
      if (!l || !l.name) return;
      var ex = null;
      for (var i = 0; i < W.locations.length; i++) if (W.locations[i].name.toLowerCase() === String(l.name).toLowerCase()) ex = W.locations[i];
      if (!ex) { var nl = { id: uid("l"), name: String(l.name).slice(0, 40), desc: String(l.desc || "").slice(0, 200), cond: "" }; W.locations.push(nl); notes.push("Lokasi baru: " + nl.name); }
    });
    if (p.moves && typeof p.moves === "object") Object.keys(p.moves).forEach(function (cid) {
      var c = charById(cid) || W.chars.filter(function (x) { return x.name.toLowerCase() === String(cid).toLowerCase(); })[0];
      if (!c) return;
      var want = String(p.moves[cid]);
      var loc = null;
      for (var i = 0; i < W.locations.length; i++) if (W.locations[i].id === want || W.locations[i].name.toLowerCase() === want.toLowerCase()) loc = W.locations[i];
      if (loc && loc.id !== c.loc) { c.loc = loc.id; c.act = T("stAt", { loc: loc.name }); c.actTs = Date.now(); notes.push(c.name + " → " + loc.name); }
    });
    if (typeof p.weather === "string" && WX_L[p.weather]) {
      if (wxKind() !== p.weather) {
        W.weather = { kind: p.weather };
        pushFeed({ kind: "system", loc: null, text: C("wxChange", { emoji: WX_L[p.weather].emoji, wx: wxNameWL(p.weather) }) });
        notes.push("Cuaca: " + p.weather);
      }
    }
    if (p.clock && typeof p.clock === "object") {
      if (!W.clock) W.clock = { day: 1, phase: 0, n: 0 };
      var pDay = Math.max(1, Math.min(999, Number(p.clock.day) || W.clock.day || 1));
      var pPh = (typeof p.clock.phase === "number") ? (((Math.round(p.clock.phase) % 4) + 4) % 4) : W.clock.phase;
      W.clock.day = pDay; W.clock.phase = pPh; W.clock.n = 0;
      notes.push("Waktu: hari " + pDay);
    }
    if (p.locCond && typeof p.locCond === "object") Object.keys(p.locCond).forEach(function (k) {
      var lid2 = resolveLocId(k); if (!lid2) return;
      for (var li2 = 0; li2 < W.locations.length; li2++) if (W.locations[li2].id === lid2) {
        W.locations[li2].cond = String(p.locCond[k] || "").slice(0, 80);
        notes.push("Kondisi: " + W.locations[li2].name);
      }
    });
    if (p.give && typeof p.give === "object") Object.keys(p.give).forEach(function (k) {
      var garr = Array.isArray(p.give[k]) ? p.give[k] : [p.give[k]];
      expandItems(garr).forEach(function (it) { if (giveItem(k, it)) notes.push("Beri: " + String(it).slice(0, 30)); });
    });
    if (p.take && typeof p.take === "object") Object.keys(p.take).forEach(function (k) {
      var tarr = Array.isArray(p.take[k]) ? p.take[k] : [p.take[k]];
      expandItems(tarr).forEach(function (it) { if (takeItem(k, String(it))) notes.push("Ambil: " + String(it).slice(0, 30)); });
    });
    if (p.coins && typeof p.coins === "object") Object.keys(p.coins).forEach(function (k) {
      var d = Math.max(-10000, Math.min(10000, Number(p.coins[k]) || 0));
      if (!d) return;
      var o = whoChar(k);
      if (!o) {
        if (String(k).toLowerCase() === "__player" || (W.player && String(k).toLowerCase() === String(W.player.name || "").toLowerCase())) o = W.player;
        else return;
      }
      if (o === W.player) { o.coins = Math.max(0, Math.round((Number(o.coins) || 0) + d)); notes.push("Koin " + o.name + (d > 0 ? " +" : " ") + d); }
      else { try { var s = ensureShop(o); if (s) s.coins = Math.max(0, Math.round((Number(s.coins) || 0) + d)); } catch (e) {} notes.push("Koin " + o.name + (d > 0 ? " +" : " ") + d); }
    });
    if (p.affinity && typeof p.affinity === "object") Object.keys(p.affinity).forEach(function (cid) {
      var c = charById(cid); if (!c) return;
      c.affinity = clampA(c.affinity + Math.max(-20, Math.min(20, Number(p.affinity[cid]) || 0)));
    });
    if (p.bonds && typeof p.bonds === "object") Object.keys(p.bonds).forEach(function (k) {
      var parts = String(k).split(/>|→/);
      if (parts.length < 2) return;
      var a = charByName(parts[0].trim()), b2 = charByName(parts[1].trim());
      if (!a || !b2 || a.id === b2.id) return;
      setBond(a, b2.id, bondOf(a, b2.id) + Math.max(-20, Math.min(20, Number(p.bonds[k]) || 0)));
      notes.push("Ikatan: " + a.name + "→" + b2.name);
    });
    if (p.mood && typeof p.mood === "object") Object.keys(p.mood).forEach(function (cid) {
      var c = charById(cid) || charByName(cid);
      if (!c) return;
      var v = String(p.mood[cid] || "");
      var m = v.match(/^([^:—–-]{1,30})\s*[:—–-]\s*([\s\S]*)$/);
      c.mood = ((m ? m[1] : v).trim().slice(0, 30)) || c.mood;
      c.moodWhy = (m && m[2] ? m[2].trim().slice(0, 120) : "");
      notes.push("Mood: " + c.name);
    });
    if (p.addCharMem && typeof p.addCharMem === "object") Object.keys(p.addCharMem).forEach(function (cid) {
      var c = charById(cid); if (!c || !Array.isArray(p.addCharMem[cid])) return;
      p.addCharMem[cid].slice(0, 4).forEach(function (f) {
        c.mems = c.mems || [];
        c.mems.push({ id: uid("mm"), text: String(f).slice(0, 300), kw: keywordsOf(f), ts: Date.now() });
        while (c.mems.length > MAX_MEM) c.mems.shift();
      });
    });
    if (Array.isArray(p.addWorldMem)) p.addWorldMem.slice(0, 5).forEach(function (f) {
      W.worldMems = W.worldMems || [];
      W.worldMems.push({ id: uid("mm"), text: String(f).slice(0, 300), kw: keywordsOf(f), ts: Date.now() });
      while (W.worldMems.length > MAX_WMEM) W.worldMems.shift();
    });
    if (Array.isArray(p.newChars)) p.newChars.slice(0, 2).forEach(function (n) {
      if (!n || !n.name || W.chars.length >= MAX_CHARS) return;
      var nm = String(n.name).slice(0, 30).trim();
      if (!nm) return;
      var dup = false;
      for (var di = 0; di < W.chars.length; di++) if (W.chars[di].name.toLowerCase() === nm.toLowerCase()) dup = true;
      if (dup) return;
      var lid = resolveLocId(n.loc) || (W.locations[0] && W.locations[0].id) || null;
      var nc = { id: uid("c"), name: nm, role: String(n.role || "Warga").slice(0, 40),
        personality: String(n.personality || "Misterius namun ramah.").slice(0, 200),
        goal: String(n.goal || "-").slice(0, 200), desc: String(n.desc || "").slice(0, 500),
        loc: lid, avatar: "", affinity: 0, mems: [], act: "", actTs: 0, items: [] };
      W.chars.push(nc); newIds.push(nc.id);
      notes.push("NPC baru: " + nm);
      pushFeed({ kind: "system", loc: lid, text: C("spawnShort", { name: nm, role: nc.role, loc: locName(lid) }) });
    });
    if (p.loreEdit && typeof p.loreEdit === "object") {
      ["premise", "rules", "tone"].forEach(function (k) { if (typeof p.loreEdit[k] === "string" && p.loreEdit[k].trim()) { W[k] = p.loreEdit[k].trim().slice(0, 2000); notes.push("Lore diubah: " + k); } });
    }
    W.counter += 2;
    if (W.counter >= CP_EVERY) { W.counter = 0; addCheckpoint(C("cpAutoGod")); }
    save();
    return newIds;
  }
  async function fastForward(days) {
    if (busy || !W || !aiReady()) return;
    if (needGod("Time skip")) return;
    busy = true; renderGodState();
    addCheckpoint(C("cpBefore", { d: days }));
    pushFeed({ kind: "god", loc: null, text: C("skipping", { d: days }) });
    try {
      if (!W.clock || typeof W.clock !== "object") W.clock = { day: 1, phase: 0, n: 0 };
      W.clock.day = (W.clock.day || 1) + days; W.clock.phase = 0; W.clock.n = 0;
      W.weather = { kind: WX_IDS[Math.floor(Math.random() * WX_IDS.length)] };
      save();
    } catch (eC) {}
    renderStage(); scrollFeed();
    try {
      var spec = await genTextP({ instruction:
        (WL() === "en"
          ? worldHead() + "\nContext:\n" + feedCtx(12) +
            "\nTASK: simulate " + days + " days passing in this world (daily routines, work, gossip, 1-2 genre-fitting major happenings, relationships shifting; may bring in max 1 new NPC with a full profile if sensible). Language: " + langName(W.lang) + ". MANDATORY format:\nNARASI:\n<3-6 sentence summary>\nPATCH:\n```json\n{\"moves\":{},\"newChars\":[],\"affinity\":{},\"addCharMem\":{},\"addWorldMem\":[],\"weather\":\"kind\",\"locCond\":{},\"give\":{},\"take\":{}}\n```\nweather: one of clear|cloudy|rainy|windy|foggy. locCond: {locNameOrId: \"visible condition\"}. give/take: {nameOrId: [\"item\"]} (mini inventory, max 6 each). newChars (optional, max 1): [{name, role, personality, goal, desc, loc}]."
          : worldHead() + "\nKonteks:\n" + feedCtx(12) +
            "\nTUGAS: simulasikan " + days + " hari berlalu di dunia ini (rutin harian, kerja, gosip, 1-2 kejadian penting yang masuk akal genre, relasi berubah; boleh datangkan max 1 NPC baru lengkap dengan profil bila wajar). Bahasa: " + langName(W.lang) + ". Format WAJIB:\nNARASI:\n<ringkasan 3-6 kalimat>\nPATCH:\n```json\n{\"moves\":{},\"newChars\":[],\"affinity\":{},\"addCharMem\":{},\"addWorldMem\":[],\"weather\":\"kind\",\"locCond\":{},\"give\":{},\"take\":{}}\n```\nweather: salah satu cerah|berawan|hujan|berangin|berkabut. locCond: {namaAtauIdLokasi: \"kondisi terlihat\"}. give/take: {namaAtauId: [\"barang\"]} (inventory mini, maks 6 tiap orang). newChars (opsional, maks 1): [{name, role, personality, goal, desc, loc}].") });
      var nar = C("skipped", { d: days, nar: "" }).replace(/:\s*$/, ""), patch = null;
      var mN = spec.match(/NARASI:\s*([\s\S]*?)(?:PATCH:|$)/i);
      if (mN && mN[1].trim()) nar = mN[1].replace(/```json[\s\S]*?```/g, "").trim().slice(0, 1500);
      patch = parsePatchJson(spec);
      var spawned = patch ? applyPatch(patch) : [];
      spawned.forEach(function (nid) { try { portraitFor(nid, null, true); } catch (e) {} });
      pushFeed({ kind: "system", loc: null, text: C("skipped", { d: days, nar: nar }) });
    } catch (e) { pushFeed({ kind: "system", loc: null, text: T("ffFail") + String(e && e.message || e).slice(0, 120) + ")." }); }
    busy = false; renderAll(); scrollFeed();
  }
  async function timeBack(cpId) {
    if (busy || !W) return;
    if (needGod("Time travel")) return;
    var cp = null;
    for (var i = 0; i < W.checkpoints.length; i++) if (W.checkpoints[i].id === cpId) cp = W.checkpoints[i];
    if (!cp) return;
    var ok = true;
    try { ok = await window.uiConfirm(T("backConfirm", { label: cp.label }), { okText: T("backOk"), danger: true }); } catch (e) {}
    if (!ok) return;
    var cancelled = W.feed.slice(-6).map(function (m) { return (m.who || (WL() === "en" ? "system" : "sistem")) + ": " + String(m.text || "").slice(0, 120); }).join("\n");
    W.archived = W.archived || [];
    W.archived.unshift({ id: uid("a"), ts: Date.now(), label: C("arch", { date: new Date().toLocaleString() }), text: cancelled });
    while (W.archived.length > 5) W.archived.pop();
    var s = JSON.parse(JSON.stringify(cp.snap));
    W.chars = s.chars; W.feed = s.feed; W.locations = s.locations;
    W.premise = s.lore.premise; W.rules = s.lore.rules; W.tone = s.lore.tone;
    W.player = s.player; W.worldMems = s.worldMems; W.counter = 0;
    if (Array.isArray(s.exResidents)) W.exResidents = s.exResidents;
    if (Array.isArray(s.rumors)) W.rumors = s.rumors;
    if (Array.isArray(s.quests)) W.quests = s.quests;
    W.encounter = s.encounter || null;
    if (s.monImgs && typeof s.monImgs === "object") W.monImgs = s.monImgs;
    if (s.rot) W.rot = s.rot;
    if (s.clock) W.clock = s.clock;
    if (s.weather) W.weather = s.weather;
    try { normalizeWorld(); } catch (e) {}
    var idx = -1;
    for (var j = 0; j < W.checkpoints.length; j++) if (W.checkpoints[j].id === cpId) idx = j;
    if (idx >= 0) W.checkpoints = W.checkpoints.slice(0, idx + 1);
    pushFeed({ kind: "system", loc: null, text: C("backed", { label: cp.label }) });
    save(); renderAll(); scrollFeed();
  }

  /* ---------- gambar ---------- */
  async function genImage(prompt) {
    var r = root();
    if (!r || !r.generateImage) throw new Error(T("noGen"));
    var res = await r.generateImage(prompt);
    if (res && res.dataUrl) return res.dataUrl;
    if (res && res.url) return res.url;
    if (typeof res === "string" && res.slice(0, 5) === "data:") return res;
    throw new Error(WL() === "en" ? "empty AI image" : "AI gambar kosong");
  }
  async function portraitFor(id, btn, force) {
    var c = charById(id);
    if (!c || imgBusy[id]) return;
    // Kunci dewa: portrait manual hanya di mode dewa. force=true untuk auto internal
    // God lock: manual portraits are god-mode only. force=true for internal auto
    // (bangun dunia, spawn dewa, auto NPC) yang memang boleh jalan di background.
    if (!force && !isGod()) { needGod("Portrait generation"); if (btn) btn.textContent = "🎨"; return; }
    imgBusy[id] = true; if (btn) btn.textContent = "⏳…";
    try {
      var url = await genImage("Character portrait, " + artOf().prompt + ", " + genreWord() + " world: " + c.name + ", " + (c.desc || c.role + ", " + c.personality) + ", wearing " + outfitOf());
      c.avatar = url; save(); renderAll();
    } catch (e) { toast(T("portraitFail") + String(e && e.message || e).slice(0, 120)); if (btn) btn.textContent = "🎨"; }
    imgBusy[id] = false;
  }
  function parseNpcJson(txt) {
    if (!txt) return null;
    var m = String(txt).match(/```json\s*([\s\S]*?)```/i) || String(txt).match(/(\{[\s\S]*\})/);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch (e) { return null; }
  }
  async function enrichChar(id, btn) {
    var c = charById(id);
    if (!c || !W) return null;
    if (needGod("NPC profile editing")) { if (btn) { btn.disabled = false; btn.textContent = T("bProfile"); } return null; }
    if (!aiReady()) { toast(T("aiNotReady")); return null; }
    if (btn) { btn.disabled = true; btn.textContent = "⏳…"; }
    try {
      var t = await genTextP({ instruction:
        (WL() === "en"
          ? worldHead() + "\nContext:\n" + feedCtx(8) +
            "\nTASK: flesh out the profile of the character named \"" + c.name + "\" (current role: " + (c.role || "-") + ")." +
            " Make a profile fitting the " + genreWord() + " genre, not duplicating the existing cast, consistent with the world premise." +
            " Language: " + langName(W.lang) + ". MANDATORY format, JSON only:\n```json\n{\"name\":\"" + c.name.replace(/"/g, "") + "\",\"role\":\"...\",\"personality\":\"1 sentence\",\"goal\":\"...\",\"desc\":\"looks + clothing in 1-2 sentences\"}\n```"
          : worldHead() + "\nKonteks:\n" + feedCtx(8) +
            "\nTUGAS: lengkapi profil karakter bernama \"" + c.name + "\" (peran sekarang: " + (c.role || "-") + ")." +
            " Buat profil yang pas genre " + W.genre + ", tidak duplikat dengan cast yang ada, dan konsisten dengan premis dunia." +
            " Bahasa: " + langName(W.lang) + ". Format WAJIB JSON saja:\n```json\n{\"name\":\"" + c.name.replace(/"/g, "") + "\",\"role\":\"...\",\"personality\":\"1 kalimat\",\"goal\":\"...\",\"desc\":\"ciri fisik + pakaian 1-2 kalimat\"}\n```") });
      var o = parseNpcJson(t);
      if (o) {
        if (o.role) c.role = String(o.role).slice(0, 40);
        if (o.personality) c.personality = String(o.personality).slice(0, 200);
        if (o.goal) c.goal = String(o.goal).slice(0, 200);
        if (o.desc) c.desc = String(o.desc).slice(0, 500);
        save(); renderAll();
        return c;
      }
      toast(T("weirdAi"));
      return null;
    } catch (e) { toast(T("enrichFail") + String(e && e.message || e).slice(0, 120)); return null; }
    finally { if (btn) { btn.disabled = false; btn.textContent = T("bProfile"); } }
  }
  async function autoGenChar(btn) {
    if (!W) return;
    if (needGod("Auto NPC")) return;
    if (W.chars.length >= MAX_CHARS) { toast(T("castFullT", { n: MAX_CHARS })); return; }
    if (!aiReady()) { toast(T("aiNotReady")); return; }
    if (btn) { btn.disabled = true; btn.textContent = WL() === "en" ? "⏳ AI is creating…" : "⏳ AI meracik…"; }
    try {
      var taken = W.chars.map(function (c) { return c.name; }).join(", ");
      var t = await genTextP({ instruction:
        (WL() === "en"
          ? worldHead() + "\nContext:\n" + feedCtx(8) +
            "\nTASK: create 1 new NPC this world needs (fill a missing role: do not duplicate " + (taken || "-") + ")." +
            " Name unique to the " + genreWord() + " genre. Language: " + langName(W.lang) + ". MANDATORY format, JSON only:\n```json\n{\"name\":\"...\",\"role\":\"...\",\"personality\":\"1 sentence\",\"goal\":\"...\",\"desc\":\"looks + clothing in 1-2 sentences\"}\n```"
          : worldHead() + "\nKonteks:\n" + feedCtx(8) +
            "\nTUGAS: ciptakan 1 NPC baru yang dibutuhkan dunia ini (isi kekosongan peran: jangan duplikat " + (taken || "-") + ")." +
            " Nama unik sesuai genre " + W.genre + ". Bahasa: " + langName(W.lang) + ". Format WAJIB JSON saja:\n```json\n{\"name\":\"...\",\"role\":\"...\",\"personality\":\"1 kalimat\",\"goal\":\"...\",\"desc\":\"ciri fisik + pakaian 1-2 kalimat\"}\n```") });
      var o = parseNpcJson(t);
      if (!o || !o.name) { toast(T("weirdAi")); return; }
      var nm = String(o.name).slice(0, 30).trim();
      var dup = false;
      for (var i = 0; i < W.chars.length; i++) if (W.chars[i].name.toLowerCase() === nm.toLowerCase()) dup = true;
      if (dup) { toast(T("dupName")); return; }
      var nc = { id: uid("c"), name: nm, role: String(o.role || C("roleDef")).slice(0, 40),
        personality: String(o.personality || (WL() === "en" ? "Mysterious yet friendly." : "Misterius namun ramah.")).slice(0, 200),
        goal: String(o.goal || "-").slice(0, 200), desc: String(o.desc || "").slice(0, 500),
        loc: W.player.loc || (W.locations[0] && W.locations[0].id), avatar: "", affinity: 0, mems: [], act: "", actTs: 0, items: [] };
      W.chars.push(nc);
      pushFeed({ kind: "system", loc: nc.loc, text: C("spawnFull", { name: nm, role: nc.role, loc: locName(nc.loc), desc: nc.desc ? nc.desc + " " : "", goal: nc.goal }) });
      save(); renderAll(); scrollFeed();
      toast(T("joinedAuto", { name: nm }));
      try { await portraitFor(nc.id, null, true); } catch (e) {}
    } catch (e) { toast(T("autoFail") + String(e && e.message || e).slice(0, 140)); }
    finally { if (btn) { try { btn.disabled = false; btn.textContent = T("bAuto"); } catch (e2) {} } }
  }
  function locById(lid) { if (!W) return null; for (var i = 0; i < W.locations.length; i++) if (W.locations[i].id === lid) return W.locations[i]; return null; }
  function monImgGet(name) { try { return (W && W.monImgs && W.monImgs[String(name)]) || ""; } catch (e) { return ""; } }
  function monImgSet(name, url) {
    if (!W) return;
    if (!W.monImgs || typeof W.monImgs !== "object") W.monImgs = {};
    W.monImgs[String(name)] = url;
    var ks = Object.keys(W.monImgs);
    while (ks.length > 12) { try { delete W.monImgs[ks.shift()]; } catch (e) { break; } }
    save();
  }
  async function locImageFor(locId, btn) {
    if (!W) return;
    var l = locById(locId); if (!l || imgBusy["loc:" + locId]) return;
    if (!aiReady()) { toast(T("aiNotReadyShort")); return; }
    imgBusy["loc:" + locId] = true; if (btn) btn.textContent = "⏳…";
    try {
      var url = await genImage("Landscape establishing shot, " + artOf().prompt + ", " + genreWord() + " world location: " + l.name + ", " + (l.desc || "") + (l.cond ? ", current state: " + l.cond : "") + ", " + wxNameWL(wxKind()) + " weather, no text, no watermark");
      l.img = url; save(); renderAll();
    } catch (e) { toast(T("imgFail") + String(e && e.message || e).slice(0, 120)); if (btn) btn.textContent = "🎨"; }
    imgBusy["loc:" + locId] = false;
  }
  async function monImgFor(name) {
    if (!W || !name || monImgGet(name) || imgBusy["mon:" + name]) return monImgGet(name);
    if (!aiReady()) return "";
    imgBusy["mon:" + name] = true;
    try {
      var url = await genImage("Creature portrait, " + artOf().prompt + ", " + genreWord() + " world monster: " + name + ", menacing fantasy beast, full body, dramatic lighting, no text, no watermark");
      monImgSet(name, url);
      try { if (W.encounter && W.encounter.name === name) renderAll(); } catch (e) {}
      return url;
    } catch (e) { return ""; }
    finally { imgBusy["mon:" + name] = false; }
  }
  async function imageForMsg(mid, btn) {
    if (needGod("Illustrating messages")) { if (btn) btn.textContent = "🎨"; return; }
    if (imgBusy[mid]) return;
    var m = null;
    for (var i = 0; i < W.feed.length; i++) if (W.feed[i].id === mid) m = W.feed[i];
    if (!m) return;
    imgBusy[mid] = true; if (btn) btn.textContent = "⏳…";
    try {
      var url = await genImage("Illustration, " + artOf().prompt + ", " + genreWord() + " world, no text: " + String(m.text).slice(0, 280));
      m.img = url; save(); renderAll();
    } catch (e) { toast(T("imgFail") + String(e && e.message || e).slice(0, 120)); if (btn) btn.textContent = "🎨"; }
    imgBusy[mid] = false;
  }

  /* ---------- UI ---------- */
  function toast(msg) {
    try {
      var t = document.createElement("div");
      t.className = "wd-toast"; t.textContent = msg;
      // Tumpuk ke atas kalau ada beberapa toast barengan (biar nggak numpuk pas).
      var n = 0;
      try { n = document.querySelectorAll(".wd-toast").length; } catch (eN) {}
      t.style.bottom = (22 + n * 46) + "px";
      document.body.appendChild(t);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2200);
    } catch (e) {}
  }
  // Satu helper overlay (shop & inventory dulunya duplikat kode ini).
  // Delegasi (bukan wiring langsung) supaya tetap hidup walau innerHTML diganti sesudahnya.
  function openOverlay(boxHtml) {
    var ov = document.createElement("div");
    ov.className = "wd-shop";
    ov.innerHTML = boxHtml || "";
    document.body.appendChild(ov);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) ov.remove(); });
    ov.addEventListener("click", function (e) { try { if (e.target && e.target.closest && e.target.closest("[data-close]")) ov.remove(); } catch (eC) {} });
    return ov;
  }
  // Satu sumber pesan gagal-beli (shop modal & chat dulunya beda string).
  function buyFailMsg(why, price, locId) {
    var en = WL() === "en";
    if (why === "nomoney") return (en ? "Not enough coins (" + price + " needed). Work odd jobs / sell herbs." : "Koin kurang (butuh " + price + "). Coba kerja serabutan / jual herbal.");
    if (why === "remote") return (en ? "Go to " + locName(locId) + " first — trading is in-person." : "Ke " + locName(locId) + " dulu — dagang harus tatap muka.");
    if (why === "empty") return en ? "Out of stock." : "Stok habis.";
    if (why === "bagfull") return en ? "Bag full!" : "Tas penuh!";
    if (why === "norepair") return en ? "Nothing broken to repair." : "Nggak ada senjata rusak.";
    if (why === "owned") return en ? "Spell already learned." : "Sihir sudah dikuasai.";
    return en ? "Deal failed." : "Gagal beli.";
  }
  function injectCss() {
    if ($("wd-style")) return;
    var st = document.createElement("style");
    st.id = "wd-style";
    st.textContent = [
      "#world-app{max-width:1180px;margin:0 auto;padding:0.6rem 0.8rem 3rem;text-align:left;}",
      ".wd-grid{display:grid;grid-template-columns:300px 1fr 300px;gap:0.7rem;align-items:start;}",
      "@media(max-width:1020px){.wd-grid{grid-template-columns:1fr 1.4fr;} .wd-right{grid-column:1/-1;}}",
      "@media(max-width:720px){.wd-grid{grid-template-columns:1fr;}}",
      ".wd-card{background:var(--th-surface);border:1px solid var(--th-border);border-radius:12px;padding:0.7rem 0.8rem;margin-bottom:0.7rem;}",
      ".wd-card h3{margin:0 0 0.5rem;font-size:0.95rem;}",
      ".wd-lbl{font-size:0.75rem;opacity:0.75;display:block;margin:0.45rem 0 0.2rem;}",
      ".wd-in,.wd-sel,.wd-ta{width:100%;box-sizing:border-box;font:inherit;font-size:0.85rem;color:inherit;background:var(--th-field);border:1px solid var(--th-border);border-radius:8px;padding:0.4rem 0.55rem;}",
      ".wd-ta{min-height:64px;resize:vertical;}",
      ".wd-row{display:flex;gap:0.4rem;flex-wrap:wrap;margin-top:0.5rem;align-items:center;}",
      ".wd-btn{font:inherit;font-size:0.82rem;padding:0.4rem 0.8rem;border-radius:9px;border:1px solid var(--th-border);background:var(--th-field);color:inherit;cursor:pointer;min-height:36px;}",
      ".wd-btn:hover{border-color:var(--th-accent);}",
      ".wd-btn.go{background:var(--th-accent);border-color:var(--th-accent);color:var(--th-accent-text);font-weight:700;}",
      ".wd-btn.danger{background:#c0392b;border-color:#c0392b;color:#fff;}",
      ".wd-btn:disabled{opacity:0.5;cursor:default;}",
      ".wd-char{border:1px solid var(--th-border);border-radius:10px;padding:0.5rem;margin-bottom:0.5rem;background:var(--th-field);}",
      ".wd-char.sel{border-color:var(--th-accent);box-shadow:0 0 0 1px var(--th-accent);}",
      ".wd-chead{display:flex;gap:0.5rem;align-items:center;cursor:pointer;}",
      ".wd-av{width:38px;height:38px;border-radius:50%;background:var(--th-accent-soft);display:flex;align-items:center;justify-content:center;font-size:1.2rem;overflow:hidden;flex:0 0 auto;}",
      ".wd-av img{width:100%;height:100%;object-fit:cover;}",
      ".wd-cname{font-weight:700;font-size:0.88rem;}",
      ".wd-csub{font-size:0.75rem;opacity:0.8;}",
      ".wd-locpill{display:inline-block;font-size:0.7rem;border:1px solid var(--th-border);border-radius:999px;padding:0.05rem 0.5rem;margin-left:0.3rem;}",
      ".wd-chead .wd-av{width:48px;height:48px;font-size:1.5rem;border:2px solid var(--th-border);}",
      ".wd-char.sel .wd-chead .wd-av{border-color:var(--th-accent);}",
      ".wd-caret{margin-left:auto;opacity:0.55;font-size:0.8rem;flex:0 0 auto;padding-left:0.3rem;}",
      ".wd-cpills{display:flex;gap:0.25rem;flex-wrap:wrap;margin-top:0.2rem;}",
      ".wd-pill{display:inline-block;font-size:0.68rem;border:1px solid var(--th-border);border-radius:999px;padding:0.05rem 0.5rem;opacity:0.92;}",
      ".wd-pill.loc{border-color:var(--th-accent);font-weight:700;}",
      ".wd-cquote{font-style:italic;font-size:0.8rem;opacity:0.9;margin:0.1rem 0 0.35rem;border-left:3px solid var(--th-accent);padding-left:0.5rem;line-height:1.5;}",
      ".wd-statusbox{background:rgba(46,204,113,0.08);border:1px solid rgba(46,204,113,0.4);border-radius:9px;padding:0.35rem 0.55rem;margin:0.25rem 0;font-size:0.8rem;line-height:1.5;}",
      ".wd-statusbox::before{content:'\\2726 ';}",
      ".wd-crow{margin:0.28rem 0;font-size:0.8rem;line-height:1.5;}",
      ".wd-cact{display:flex;gap:0.35rem;flex-wrap:wrap;margin-top:0.5rem;}",
      ".wd-rail{display:flex;gap:0.35rem;overflow-x:auto;padding:0.1rem 0.1rem 0.4rem;}",
      ".wd-railm{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:0.2rem;min-width:66px;max-width:86px;background:transparent;border:1px solid transparent;border-radius:12px;padding:0.35rem 0.4rem;cursor:pointer;color:inherit;font:inherit;}",
      ".wd-railm:hover{border-color:var(--th-border);}",
      ".wd-railm.on{border-color:var(--th-accent);background:var(--th-field);}",
      ".wd-railm .wd-av{width:52px;height:52px;font-size:1.6rem;}",
      ".wd-railm.on .wd-av{border-color:var(--th-accent);}",
      ".wd-railname{font-size:0.68rem;font-weight:700;max-width:76px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      ".wd-railn{font-size:0.64rem;opacity:0.85;}",
      ".wd-prof{border:1px solid var(--th-border);border-radius:12px;background:var(--th-field);padding:0.6rem 0.65rem;margin-top:0.1rem;}",
      ".wd-phead{display:flex;gap:0.65rem;align-items:center;}",
      ".wd-phead .wd-av{width:76px;height:76px;font-size:2.1rem;border-radius:20px;border:2px solid var(--th-accent);}",
      ".wd-pname{font-weight:800;font-size:1rem;}",
      ".wd-ptabs{display:flex;gap:0.3rem;margin:0.55rem 0 0.15rem;}",
      ".wd-ptab.on{border-color:var(--th-accent);box-shadow:0 0 0 1px var(--th-accent);font-weight:800;}",
      ".wd-psec{margin-top:0.3rem;}",
      ".wd-pitem{display:flex;align-items:center;gap:0.5rem;border:1px solid var(--th-border);border-radius:9px;padding:0.3rem 0.5rem;margin-bottom:0.3rem;font-size:0.8rem;background:var(--th-surface);}",
      ".wd-pitem .wd-pi{font-size:1.2rem;}",
      ".wd-pitem b{flex:1;}",
      ".wd-feed{display:flex;flex-direction:column;gap:0.45rem;max-height:52vh;overflow-y:auto;padding:0.2rem;}",
      ".wd-msg{background:var(--th-field);border:1px solid var(--th-border);border-radius:10px;padding:0.35rem 0.55rem;font-size:0.83rem;line-height:1.45;}",
      ".wd-stagehead{display:flex;align-items:center;gap:0.45rem;margin:0 0 0.5rem;}",
      ".wd-stagehead b{font-size:0.95rem;flex:0 0 auto;}",
      ".wd-sect{margin-top:0.45rem;}",
      ".wd-sect>summary{cursor:pointer;font-size:0.8rem;font-weight:700;opacity:0.9;}",
      ".wd-sect .wd-qstrip{margin-top:0.35rem;}",
      ".wd-minihelp{margin-top:0.45rem;}",
      ".wd-minihelp>summary{cursor:pointer;font-size:0.76rem;opacity:0.8;}",
      ".wd-utilrow{display:flex;gap:0.3rem;flex-wrap:wrap;margin-top:0.4rem;align-items:center;}",
      "#wd-tiles{display:flex;justify-content:center;}",
      "#wd-tiles>*{max-width:100%;}",
      ".wd-msg .wd-who{font-weight:700;font-size:0.78rem;}",
      ".wd-msg.sys{background:transparent;border-style:dashed;opacity:0.92;font-size:0.8rem;}",
      ".wd-msg.godmsg{border-color:var(--th-accent);}",
      ".wd-msg img{max-width:100%;border-radius:8px;margin-top:0.35rem;display:block;}",
      ".wd-mrow{display:flex;gap:0.35rem;margin-top:0.3rem;}",
      ".wd-mini{font:inherit;font-size:0.72rem;padding:0.15rem 0.5rem;border-radius:999px;border:1px solid var(--th-border);background:transparent;color:inherit;cursor:pointer;}",
      ".wd-mini:hover{border-color:var(--th-accent);}",
      ".wd-talk{display:flex;gap:0.4rem;margin-top:0.55rem;}",
      ".wd-talk .wd-in{flex:1;}",
      ".wd-goditem{background:var(--th-field);border:1px solid var(--th-border);border-radius:10px;padding:0.5rem 0.6rem;margin-bottom:0.5rem;font-size:0.83rem;line-height:1.5;}",
      ".wd-godthink{margin-top:0.35rem;white-space:pre-wrap;}",
      ".wd-godthink.is-loading{color:var(--th-accent);font-weight:700;}",
      ".wd-spin{display:inline-block;width:0.85em;height:0.85em;border-radius:50%;border:2px solid currentColor;border-top-color:transparent;vertical-align:-1px;animation:wdspin 0.8s linear infinite;}",
      "@keyframes wdspin{to{transform:rotate(360deg);}}",
      ".wd-btn.is-busy{opacity:1;border-color:var(--th-accent);}",
      ".wd-godstatus{display:flex;gap:0.4rem;align-items:center;font-size:0.8rem;font-weight:700;color:var(--th-accent);background:rgba(128,128,128,0.12);border:1px solid var(--th-accent);border-radius:9px;padding:0.35rem 0.55rem;margin:0.35rem 0;}",
      ".wd-stream.is-loading{color:var(--th-accent);font-weight:700;}",
      ".wd-btn.done{background:rgba(46,204,113,0.15);border-color:#2ecc71;color:inherit;font-weight:700;opacity:1;cursor:default;}",
      ".wd-donenote{font-size:0.75rem;opacity:0.9;margin-top:0.3rem;color:#2ecc71;font-weight:700;}",
      ".wd-runstat{font-size:0.75rem;opacity:0.85;margin-top:0.3rem;}",
      ".wd-warn{background:rgba(192,57,43,0.12);border:1px solid #c0392b;border-radius:8px;padding:0.45rem 0.6rem;margin-top:0.4rem;font-size:0.8rem;}",
      ".wd-cp{border:1px solid var(--th-border);border-radius:8px;padding:0.35rem 0.5rem;margin-bottom:0.35rem;font-size:0.78rem;background:var(--th-field);}",
     ".wd-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:600;background:var(--th-modal,var(--th-surface));border:1px solid var(--th-border);border-radius:999px;padding:0.45rem 0.9rem;font-size:0.82rem;max-width:min(92vw,480px);text-align:center;pointer-events:none;}",
      ".wd-subtabs{display:flex;gap:0.35rem;flex-wrap:wrap;align-items:center;margin-bottom:0.6rem;position:sticky;top:0;z-index:5;background:var(--th-surface);padding:0.4rem 0.5rem;border:1px solid var(--th-border);border-radius:12px;}",
      ".wd-subtab{font:inherit;font-size:0.82rem;padding:0.4rem 0.85rem;border-radius:999px;border:1px solid var(--th-border);background:var(--th-field);color:inherit;cursor:pointer;}",
      ".wd-subtab:hover{border-color:var(--th-accent);}",
      ".wd-subtab.on{background:var(--th-accent);border-color:var(--th-accent);color:var(--th-accent-text);font-weight:700;}",
      ".wd-modepill{margin-left:auto;display:flex;gap:0.3rem;align-items:center;font-size:0.78rem;opacity:0.95;}",
      ".wd-hint{font-size:0.8rem;opacity:0.8;line-height:1.5;}",
      ".wd-lock{font-size:0.75rem;color:var(--th-accent);font-weight:700;}",
      ".wd-msg.mine{border-color:var(--th-accent);}",
      ".wd-msg.mineAct{background:rgba(255,255,255,0.04);font-style:italic;}",
      ".wd-kind{flex:0 0 auto;width:auto;min-width:132px;}",
      ".wd-send{flex:0 0 auto;white-space:nowrap;}",
      ".wd-where{display:flex;gap:0.35rem;flex-wrap:wrap;margin-top:0.45rem;}",
      ".wd-wbtn{font:inherit;font-size:0.75rem;padding:0.25rem 0.6rem;border-radius:999px;border:1px solid var(--th-border);background:var(--th-field);color:inherit;cursor:pointer;line-height:1.5;}",
      ".wd-wbtn:hover{border-color:var(--th-accent);}",
      ".wd-wbtn.on{border-color:var(--th-accent);box-shadow:0 0 0 1px var(--th-accent);font-weight:700;}",
      ".wd-wbtn .wd-wn{opacity:0.75;}",
      ".wd-far{opacity:0.62;border-style:dashed;font-style:italic;}",
      ".wd-farpre{font-size:0.72rem;opacity:0.85;font-style:normal;}",
      ".wd-status{color:var(--th-accent);font-weight:600;}",
      ".wd-hud{background:linear-gradient(135deg,rgba(0,0,0,0.35),transparent);border:1px solid var(--th-border);border-radius:10px;padding:0.35rem 0.5rem;font-size:0.78rem;margin:0.4rem 0;display:flex;flex-direction:column;gap:0.25rem;align-items:stretch;}",
      ".wd-hudrow{display:flex;gap:0.45rem;flex-wrap:wrap;align-items:center;}",
      ".wd-hud .wd-bar{width:44px;}",
      ".wd-bar{display:inline-block;width:64px;height:8px;border-radius:99px;background:rgba(128,128,128,0.3);overflow:hidden;vertical-align:middle;margin-left:4px;}",
      ".wd-bar i{display:block;height:100%;background:var(--th-accent);}",
      ".wd-bar.low i{background:#c0392b;}",
      ".wd-shop{position:fixed;inset:0;z-index:700;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(0,0,0,0.55);}",
      ".wd-shopbox{width:min(480px,94vw);max-height:84vh;overflow:auto;background:var(--th-modal,var(--th-surface));border:1px solid var(--th-border);border-radius:14px;padding:0.8rem;}",
      ".wd-srow{display:flex;gap:0.4rem;align-items:center;border:1px solid var(--th-border);border-radius:9px;padding:0.35rem 0.5rem;margin-bottom:0.35rem;font-size:0.82rem;background:var(--th-field);}",
      ".wd-srow b{flex:1;}",
      ".wd-invbox{width:min(520px,94vw);}",
      ".wd-invhead{display:flex;justify-content:space-between;align-items:flex-end;gap:0.6rem;margin-bottom:0.55rem;}",
      ".wd-invtitle{font-size:1.02rem;font-weight:800;margin:0;}",
      ".wd-invsub{font-size:0.74rem;opacity:0.9;margin-top:0.15rem;}",
      ".wd-buyerpill{display:inline-block;font-size:0.7rem;font-weight:700;border-radius:999px;padding:0.08rem 0.55rem;border:1px solid var(--th-border);}",
      ".wd-buyerpill.ok{background:rgba(46,204,113,0.16);border-color:#2ecc71;color:#27ae60;}",
      ".wd-buyerpill.no{opacity:0.75;border-style:dashed;}",
      ".wd-invcap{text-align:right;flex:0 0 auto;}",
      ".wd-invcap b{font-size:0.8rem;}",
      ".wd-capbar{width:110px;height:8px;border-radius:99px;background:rgba(128,128,128,0.3);overflow:hidden;margin-top:0.25rem;}",
      ".wd-capbar i{display:block;height:100%;background:linear-gradient(90deg,#f1c40f,#e67e22);}",
      ".wd-capbar.full i{background:#c0392b;}",
      ".wd-invgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:0.5rem;}",
      ".wd-invgrid{text-align:left;}",
      ".wd-invcard{position:relative;display:flex;gap:0.55rem;border:1px solid var(--th-border);border-radius:12px;padding:0.5rem 2rem 0.5rem 0.55rem;background:var(--th-field);align-items:flex-start;text-align:left;}",
      ".wd-invico{position:relative;flex:0 0 auto;width:46px;height:46px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;background:rgba(128,128,128,0.16);}",
      ".wd-invcount{position:absolute;right:-6px;bottom:-6px;font-size:0.66rem;font-weight:800;background:var(--th-accent);color:#fff;border-radius:999px;padding:0.05rem 0.4rem;box-shadow:0 1px 4px rgba(0,0,0,0.35);}",
      ".wd-invmain{flex:1;min-width:0;}",
      ".wd-invname{font-weight:800;font-size:0.84rem;line-height:1.3;overflow:hidden;text-overflow:ellipsis;text-align:left;}",
      ".wd-chips{display:flex;gap:0.25rem;flex-wrap:wrap;margin:0.25rem 0 0.35rem;}",
      ".wd-chip{font-size:0.66rem;font-weight:700;border-radius:999px;padding:0.08rem 0.45rem;border:1px solid var(--th-border);background:rgba(128,128,128,0.14);white-space:nowrap;}",
      ".wd-chip.hp{background:rgba(231,76,60,0.15);border-color:#e74c3c;color:#e74c3c;}",
      ".wd-chip.full{background:rgba(230,126,34,0.15);border-color:#e67e22;color:#e67e22;}",
      ".wd-chip.energy{background:rgba(241,196,15,0.18);border-color:#f1c40f;color:#9a7d0a;}",
      ".wd-chip.mana{background:rgba(155,89,182,0.18);border-color:#9b59b6;color:#9b59b6;}",
      ".wd-chip.coin{background:rgba(46,204,113,0.14);border-color:#2ecc71;color:#27ae60;}",
      ".wd-chip.kind{opacity:0.8;}",
      ".wd-invacts{display:flex;gap:0.3rem;flex-wrap:wrap;}",
      ".wd-ibtn{font:inherit;font-size:0.72rem;font-weight:800;padding:0.3rem 0.6rem;border-radius:9px;border:1px solid var(--th-border);background:var(--th-surface);color:inherit;cursor:pointer;min-height:30px;}",
      ".wd-ibtn:hover{border-color:var(--th-accent);}",
      ".wd-ibtn.eat{background:#27ae60;border-color:#27ae60;color:#fff;}",
      ".wd-ibtn.sell{background:transparent;border-color:#2ecc71;color:#27ae60;}",
      ".wd-ibtn.drop{position:absolute;top:0.35rem;right:0.35rem;min-height:0;padding:0.1rem 0.45rem;font-size:0.7rem;opacity:0.55;border-radius:8px;}",
      ".wd-ibtn.drop:hover{opacity:1;border-color:#c0392b;color:#c0392b;}",
      ".wd-invempty{text-align:center;padding:1.2rem 0.6rem;border:1px dashed var(--th-border);border-radius:12px;background:var(--th-field);}",
      ".wd-invempty .big{font-size:2.2rem;}",
      ".wd-invfoot{display:flex;gap:0.4rem;align-items:center;margin-top:0.6rem;}",
      ".wd-invfoot .wd-hint{flex:1;}",
      ".wd-q{border:1px dashed var(--th-accent);border-radius:9px;padding:0.35rem 0.55rem;margin:0.3rem 0;font-size:0.8rem;}",
      ".wd-enc{border:1px solid #c0392b;border-radius:12px;padding:0.6rem 0.7rem;margin:0.5rem 0;background:linear-gradient(135deg,rgba(192,57,43,0.18),transparent);}",
      ".wd-enchp{height:10px;border-radius:99px;background:rgba(128,128,128,0.3);overflow:hidden;margin:0.3rem 0;}",
      ".wd-enchp i{display:block;height:100%;background:linear-gradient(90deg,#e74c3c,#e67e22);}",
     ".wd-abtn{font:inherit;font-size:0.85rem;padding:0.5rem 0.9rem;border-radius:10px;border:1px solid var(--th-border);background:var(--th-field);color:inherit;cursor:pointer;min-height:40px;font-weight:700;}",
     ".wd-abtn:hover{border-color:var(--th-accent);}",
     ".wd-abtn.fight{background:#c0392b;border-color:#c0392b;color:#fff;}",
     ".wd-abtn.magic{background:#8e44ad;border-color:#8e44ad;color:#fff;}",
      ".wd-spellsel{flex:1;min-width:150px;border-color:#8e44ad;font-weight:700;}",
      ".wd-spellhelp{margin-top:0.35rem;font-size:0.78rem;}",
      ".wd-spellhelp summary{cursor:pointer;}",
     ".wd-actionbar{display:flex;gap:0.4rem;flex-wrap:wrap;margin-top:0.5rem;}",
      ".wd-stickfoot .wd-actionbar{margin-top:0;}",
      ".wd-qstrip{display:flex;gap:0.4rem;overflow-x:auto;padding:0.15rem 0.1rem;margin-top:0.4rem;align-items:stretch;}",
      ".wd-qstrip .wd-q{flex:0 0 auto;margin:0;max-width:270px;}",
      ".wd-stickfoot{position:sticky;bottom:0;z-index:6;background:var(--th-surface);border-top:1px solid var(--th-border);padding:0.45rem 0.1rem 0.15rem;margin-top:0.5rem;}",
      ".wd-stickfoot .wd-talk{margin-top:0.4rem;}",
      ".wd-lvbadge{display:inline-block;font-weight:800;border:1px solid var(--th-accent);border-radius:999px;padding:0.05rem 0.55rem;}",
      ".wd-xpbar{display:inline-block;width:80px;height:8px;border-radius:99px;background:rgba(128,128,128,0.3);overflow:hidden;vertical-align:middle;margin-left:4px;}",
      ".wd-xpbar i{display:block;height:100%;background:linear-gradient(90deg,#2ecc71,#1abc9c);}",
      ".wd-hudtop{display:flex;gap:0.45rem;flex-wrap:wrap;align-items:center;}",
      ".wd-xpwrap{flex:1 1 150px;display:flex;align-items:center;gap:0.35rem;min-width:140px;}",
      ".wd-xpwrap .wd-xpbar{flex:1;width:auto;margin-left:0;height:10px;}",
      ".wd-xpnum{font-size:0.72rem;opacity:0.85;white-space:nowrap;}",
      ".wd-goal{font-size:0.72rem;}",
      ".wd-goal.done{color:#f1c40f;font-weight:800;}",
      ".wd-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0.3rem;}",
      ".wd-stat{display:flex;align-items:center;gap:0.35rem;background:var(--th-field);border:1px solid var(--th-border);border-radius:9px;padding:0.28rem 0.45rem;font-size:0.76rem;font-weight:700;white-space:nowrap;}",
      ".wd-stat .wd-sbar{flex:1;height:7px;border-radius:99px;background:rgba(128,128,128,0.3);overflow:hidden;min-width:30px;}",
      ".wd-sbar i{display:block;height:100%;border-radius:99px;}",
      ".wd-stat.hp i{background:linear-gradient(90deg,#e74c3c,#ff7675);}",
      ".wd-stat.full i{background:linear-gradient(90deg,#e67e22,#f5b041);}",
      ".wd-stat.energy i{background:linear-gradient(90deg,#f1c40f,#f9e04b);}",
      ".wd-stat.mana i{background:linear-gradient(90deg,#9b59b6,#d5a6f5);}",
      ".wd-stat.low{border-color:#c0392b;}",
      ".wd-stat.low .wd-sbar i{background:#c0392b;}",
      ".wd-bagbtn{display:block;width:100%;box-sizing:border-box;text-align:left;font:inherit;font-size:0.78rem;padding:0.35rem 0.6rem;border-radius:9px;border:1px dashed var(--th-border);background:transparent;color:inherit;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
      ".wd-bagbtn:hover{border-color:var(--th-accent);border-style:solid;}",
      ".wd-bagbtn b{color:var(--th-accent);}",
      ".wd-danger{font-size:0.7rem;border-radius:999px;padding:0.05rem 0.45rem;margin-left:0.3rem;border:1px solid var(--th-border);}" +
      ".wd-map{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0.5rem;margin-top:0.5rem;}" +
      ".wd-loc{position:relative;border:1px solid var(--th-border);border-radius:12px;overflow:hidden;background:var(--th-field);cursor:pointer;text-align:left;font:inherit;color:inherit;padding:0;}" +
      ".wd-loc:hover{border-color:var(--th-accent);}" +
      ".wd-loc.on{border-color:var(--th-accent);box-shadow:0 0 0 1px var(--th-accent);}" +
      ".wd-loc.here{outline:2px solid var(--th-accent);outline-offset:-2px;}" +
      ".wd-locimg{width:100%;height:84px;object-fit:cover;display:block;background:rgba(128,128,128,0.15);}" +
      ".wd-locph{width:100%;height:84px;display:flex;align-items:center;justify-content:center;font-size:2rem;background:linear-gradient(135deg,rgba(128,128,128,0.25),transparent);}" +
      ".wd-locbody{padding:0.4rem 0.5rem;font-size:0.76rem;line-height:1.45;}" +
      ".wd-locname{font-weight:800;font-size:0.8rem;}" +
      ".wd-lochere{display:inline-block;font-size:0.68rem;font-weight:800;color:var(--th-accent);border:1px solid var(--th-accent);border-radius:999px;padding:0 0.4rem;margin-left:0.3rem;}" +
      ".wd-loccond{font-style:italic;opacity:0.85;}" +
      ".wd-encrow{display:flex;gap:0.6rem;align-items:center;}" +
      ".wd-screen{position:relative;border:2px solid var(--th-accent);border-radius:14px;overflow:hidden;background:#0c110a;margin-top:0.5rem;display:flex;flex-direction:column;}" +
      ".wd-screen #wd-tiles{margin-top:0;}" +
      ".wd-screen .wd-enc{position:static;margin:0;border:0;border-top:2px solid #c0392b;border-radius:0;background:rgba(12,8,8,0.96);box-shadow:none;max-height:none;overflow:visible;padding:0.45rem 0.55rem;}" +
      ".wd-screen .wd-monimg{width:48px;height:48px;}" +
      ".wd-screen .wd-enc .wd-hint{font-size:0.72rem;}" +
      ".wd-feed{border:2px solid var(--th-accent);border-radius:12px;background:rgba(10,14,24,0.9);padding:0.55rem;}" +
      ".wd-monimg{width:96px;height:96px;object-fit:cover;border-radius:10px;flex:0 0 auto;background:rgba(128,128,128,0.2);}" +
      ".wd-monspin{display:flex;align-items:center;justify-content:center;font-size:0.72rem;opacity:0.85;text-align:center;}"
    ].join("\n");
    document.head.appendChild(st);
  }

  /* ----- Fase 2: sub-tab dalam Living World (RPG-first) ----- */
  var wdTab = "adventure";
  try { var _wt0 = localStorage.getItem("t2iWorldTabV1"); if (_wt0 === "party" || _wt0 === "world" || _wt0 === "god") wdTab = _wt0; } catch (eWT) {}
  var savedSay = "", savedSayTarget = "all", savedSayKind = "say";
  function stashDrafts() {
    try {
      var s = $("wd-say"); if (s) savedSay = s.value;
      var tg = $("wd-target"); if (tg) savedSayTarget = tg.value;
      var kd = $("wd-kind"); if (kd) savedSayKind = kd.value;
    } catch (eSD) {}
  }
  function setWorldTab(t) {
    if (t !== "adventure" && t !== "party" && t !== "world" && t !== "god") t = "adventure";
    if (t === "god" && !(W && W.mode === "god")) t = "adventure";
    wdTab = t;
    try { localStorage.setItem("t2iWorldTabV1", t); } catch (eST) {}
    renderAll();
    try { if (t === "adventure") scrollFeed(); } catch (eSF) {}
  }
  function shell() {
    rootEl.innerHTML =
      "<div id='wd-subtabs' class='wd-subtabs'></div>" +
      "<div id='wd-pane-adventure'></div>" +
      "<div id='wd-pane-party' hidden></div>" +
      "<div id='wd-pane-world' hidden></div>" +
      "<div id='wd-pane-god' hidden></div>";
  }
  function paneEl(n) { return document.getElementById("wd-pane-" + n); }
  function tabLabel(id) {
    var en = effUi() !== "id";
    if (id === "adventure") return "⚔️ " + (en ? "Adventure" : "Petualangan");
    if (id === "party") return "🧑 Party";
    if (id === "world") return "🌍 " + (en ? "World" : "Dunia");
    return "👑 " + (en ? "God" : "Dewa");
  }
  function renderTabBar() {
    var bar = $("wd-subtabs"); if (!bar || !W) return;
    var god = isGod();
    if (!god && wdTab === "god") wdTab = "adventure";
    var tabs = ["adventure", "party", "world"];
    if (god) tabs.push("god");
    var h = tabs.map(function (t) {
      return "<button type='button' class='wd-subtab" + (wdTab === t ? " on" : "") + "' data-wtab='" + t + "'>" + esc(tabLabel(t)) + "</button>";
    }).join("");
    h += "<span class='wd-modepill'>" + (god ? T("mTagG") : T("mTagP")) + " <button type='button' class='wd-mini' data-wmode='player' title='" + esc(T("modePlayer")) + "'>🧍</button><button type='button' class='wd-mini' data-wmode='god' title='" + esc(T("modeGod")) + "'>👑</button></span>";
    bar.innerHTML = h;
    bar.querySelectorAll("[data-wtab]").forEach(function (b) {
      b.addEventListener("click", function () { setWorldTab(b.getAttribute("data-wtab")); });
    });
    bar.querySelectorAll("[data-wmode]").forEach(function (b) {
      b.addEventListener("click", function () {
        var m = b.getAttribute("data-wmode");
        if ((m === "god") !== god) { W.mode = m; godPending = null; save(); renderAll(); }
      });
    });
  }
  function hudHtml() {
    if (!W || !W.player || W.genre !== "fantasy") return "";
    var p = W.player, en = WL() === "en";
    var lv = pLevel(), need = xpNeed(lv), xp = Math.max(0, Number(p.xp) || 0);
    var pct = Math.max(0, Math.min(100, Math.round(xp / need * 100)));
    var goalTxt = (en ? "Goal: Lv" + GOAL_LEVEL + " (Rank C) + " + GOAL_KILLS + " kills + " + GOAL_COINS + " coins" : "Tujuan: Lv" + GOAL_LEVEL + " (Rank C) + " + GOAL_KILLS + " kill + " + GOAL_COINS + " koin");
    var goalDone = (lv >= GOAL_LEVEL && (Number(p.kills) || 0) >= GOAL_KILLS && (Number(p.coins) || 0) >= GOAL_COINS);
    var maxHp = (Number(p.maxHp) || 100);
    function statChip(ico, v, mx, tone) {
      var m = (isFinite(mx) && mx > 0) ? mx : 100; v = clampStat(v, m);
      var pc = Math.max(0, Math.min(100, Math.round(v / m * 100)));
      return "<span class='wd-stat " + tone + (pc <= 25 ? " low" : "") + "'>" + ico + " " + v + "/" + m + "<span class='wd-sbar'><i style='width:" + pc + "%'></i></span></span>";
    }
   var bagCount = (p.items || []).length;
    var equipTxt = "";
    try {
      var _ew = (p.equip && p.equip.weapon) || null, _es = (p.equip && p.equip.shield) || null;
      if (_ew && !countItem(p, _ew)) _ew = null;
      if (_es && !countItem(p, _es)) _es = null;
      if (_ew || _es) equipTxt = " · ⚔️" + (_ew || "—") + " 🛡️" + (_es || "—");
    } catch (eET) {}
    var elemPill = "";
    try { elemPill = "<span class='wd-pill' title='" + esc((en ? "Affinity +15% same element" : "Afinitas +15% elemen sama")) + "'>" + esc(elemLabel(p.elem || "api")) + "</span>"; } catch (eEP) {}
    return "<div class='wd-hud'><div class='wd-hudtop'><span class='wd-lvbadge'>Lv " + lv + " · " + rankOf(lv) + "</span>" + elemPill +
      "<span class='wd-xpwrap'><span class='wd-xpbar'><i style='width:" + pct + "%'></i></span><span class='wd-xpnum'>" + xp + "/" + need + " XP</span></span>" +
      "<span class='wd-pill'>👾 " + (Number(p.kills) || 0) + "</span><span class='wd-pill'>🪙 <b>" + (Number(p.coins) || 0) + "</b></span>" +
      "<span class='wd-goal" + (goalDone ? " done" : " wd-hint") + "'>" + (goalDone ? "🏆 " + (en ? "Legend achieved!" : "Legenda tercapai!") : "🎯 " + goalTxt) + "</span></div>" +
      "<div class='wd-stats'>" + statChip("❤️", clampHp(p.hp), maxHp, "hp") + statChip("🍖", clampStat(p.full), 100, "full") + statChip("⚡", clampStat(p.energy), 100, "energy") + statChip("✨", clampStat(p.mana), 100, "mana") + "</div>" +
      "<button class='wd-bagbtn' id='wd-invbtn' type='button' title='" + esc(en ? "Open bag" : "Buka tas") + "'>🎒 <b>" + bagCount + "/" + MAX_ITEMS_P + "</b> · " + esc(itemsLabel(p.items, (en ? "empty" : "kosong"))) + esc(equipTxt) + "</button></div>";
  }
 function encounterCardHtml() {
   if (!W || !W.encounter || W.mode !== "player") return "";
   var e = W.encounter, en = WL() === "en";
   var pct = Math.max(0, Math.min(100, Math.round(Number(e.hp) / Math.max(1, Number(e.maxHp)) * 100)));
   var mi = monImgGet(e.name);
   var mimg = mi ? "<img class='wd-monimg' src='" + mi + "'>" : "<div class='wd-monimg wd-monspin'><span class='wd-spin'></span> " + esc(en ? "picturing beast…" : "menggambar monster…") + "</div>";
   var etitle = e.boss ? "👹 <b>" + esc((en ? "ALPHA " : "RAJA ") + e.name) + "</b>" : "👾 <b>" + esc(e.name) + "</b>";
   var turnTxt = "🔄 " + (en ? "Turn " : "Giliran ") + ((Number(e.turn) || 0) + 1);
   var counterTxt = (e.lastCounter && Number(e.lastCounter.dmg) > 0)
     ? "<div class='wd-hint'>👾 " + (en ? "its last strike: −" + Number(e.lastCounter.dmg) + " HP to you" : "balasan terakhirnya: −" + Number(e.lastCounter.dmg) + " HP ke kamu") + "</div>" : "";
   var php = 0, pmh = 100;
   try { php = clampHp(W.player.hp); pmh = Number(W.player.maxHp) || 100; } catch (eP) {}
   var ppct = pmh > 0 ? Math.max(0, Math.min(100, Math.round(php / pmh * 100))) : 0;
   var meTxt = "<div class='wd-hint'>🧍 " + esc(W.player.name) + ": HP " + php + "/" + pmh + "</div><div class='wd-enchp'><i style='width:" + ppct + "%;background:linear-gradient(90deg,#2ecc71,#1abc9c);'></i></div>";
   var elemTxt = "";
   try {
     var ee = e.elem || "biasa";
     var wh = weakHint(ee);
      var whTxt = wh.length ? wh.map(function (k) { return (ELEM_INFO[k] || {}).emoji || ""; }).join("") + " " + wh.map(function (k) { return (ELEM_INFO[k] || {})[(WL() === "en") ? "en" : "id"] || k; }).join("/") : (en ? "neutral — all spells equal" : "netral — semua sihir sama");
      elemTxt = "<div class='wd-hint'>🧬 " + esc(elemLabel(ee)) + (wh.length ? " · " + (en ? "weak vs " : "lemah vs ") + esc(whTxt) : " · " + esc(whTxt)) + "</div>";
      try {
        var st = e.status || {};
        var flags = [];
        if (st.burn > 0) flags.push("🔥" + st.burn);
        if (st.guard > 0) flags.push("🛡️");
        if (st.skip) flags.push("❄️");
        if (flags.length) elemTxt += "<div class='wd-hint'>" + flags.join(" ") + "</div>";
      } catch (eF) {}
    } catch (eE) {}
    return "<div class='wd-enc'><div class='wd-encrow'>" + mimg + "<div style='flex:1;min-width:0;'>" + etitle + " <span class='wd-hint'>" + turnTxt + " · HP " + Math.max(0, Math.round(Number(e.hp))) + "/" + e.maxHp + " · ATK " + e.atkMin + "-" + e.atkMax + " · +" + e.xp + " XP</span>" +
      "<div class='wd-enchp'><i style='width:" + pct + "%'></i></div></div></div>" + elemTxt + counterTxt + meTxt +
      "<div class='wd-hint'>⬇️ " + (en ? "Pick a spell below, then tap Magic — or type: sihir api / sihir es / …" : "Pilih sihir di bawah, lalu tekan Sihir — atau ketik: sihir api / sihir es / …") + "</div></div>";
 }
  function questPanelHtml() {
    if (!W || W.genre !== "fantasy") return "";
    var en = WL() === "en";
    var qs = (W.quests || []).filter(function (q) { return q.state === "offered" || q.state === "active"; }).slice(-3);
    if (!qs.length) return "";
    return qs.map(function (q) {
      if (!q.kind) q.kind = "fetch";
      var g = null;
      try { g = charById(q.giverId); } catch (eG) {}
      var remote = !g || g.loc !== W.player.loc;
      if (q.kind === "hunt") {
        var prog = 0;
        try { prog = huntProgress(q); } catch (eH) {}
        var hbtn = q.state === "offered"
          ? "<button class='wd-mini' data-qacc='" + q.id + "' type='button'>" + (en ? "Accept" : "Terima") + "</button>"
          : (remote ? "<span class='wd-hint'>📍 " + esc(g ? locName(g.loc) : "?") + "</span>"
            : (prog >= q.needQty ? "<button class='wd-mini' data-qdone='" + q.id + "' type='button'>✅ " + (en ? "Turn in" : "Serahkan") + " (" + prog + "/" + q.needQty + ")</button>" : "<span class='wd-hint'>⚔️ " + prog + "/" + q.needQty + "</span>"));
        return "<div class='wd-q'>⚔️ <b>" + esc(q.giverName) + "</b>: " + (en ? "cull " : "berantas ") + q.needQty + " 👾 → 🪙" + q.rewardCoins + " " + hbtn + "</div>";
      }
      var have = countItem(W.player, q.need);
      var btn = q.state === "offered"
        ? "<button class='wd-mini' data-qacc='" + q.id + "' type='button'>" + (en ? "Accept" : "Terima") + "</button>"
        : (remote ? "<span class='wd-hint'>📍 " + esc(g ? locName(g.loc) : "?") + "</span>"
        : (have >= q.needQty ? "<button class='wd-mini' data-qdone='" + q.id + "' type='button'>✅ " + (en ? "Turn in" : "Serahkan") + " (" + have + "/" + q.needQty + ")</button>" : "<span class='wd-hint'>" + have + "/" + q.needQty + " " + esc(q.need) + "</span>"));
      return "<div class='wd-q'>📜 <b>" + esc(q.giverName) + "</b>: " + q.needQty + "× " + esc(q.need) + " → 🪙" + q.rewardCoins + " " + btn + "</div>";
    }).join("");
  }
  function wireQuests(root) {
    if (!root) return;
    root.querySelectorAll("[data-qacc]").forEach(function (b) { b.addEventListener("click", function () { acceptQuest(b.getAttribute("data-qacc")); renderAll(); scrollFeed(); }); });
    root.querySelectorAll("[data-qdone]").forEach(function (b) { b.addEventListener("click", function () { var r = turnInQuest(b.getAttribute("data-qdone")); if (!r.ok) toast(WL() === "en" ? "Materials not enough." : "Bahan kurang."); renderAll(); scrollFeed(); }); });
  }
  function openShop(sellerId) {
    var c = charById(sellerId); if (!c) return;
    if (W && W.player && c.loc !== W.player.loc) { toast(WL() === "en" ? "Go to " + locName(c.loc) + " first — trading is in-person." : "Ke " + locName(c.loc) + " dulu — dagang harus tatap muka."); return; }
    var shop = ensureShop(c); if (!shop) return;
    var en = WL() === "en";
   var ov = openOverlay("");
   var rows = shop.stock.map(function (e, idx) {
     var pr = priceFor(c, e);
     var dis = (Number(e.qty) || 0) <= 0 && !e.service;
      var tag = "";
      try {
        var tid = spellIdForTome(e.name);
        if (tid) {
          var sm = magicById(tid);
          if (hasSpell(tid)) tag = "<span class='wd-chip kind'>✅ " + esc((en ? "learned" : "dikuasai")) + "</span>";
          else tag = "<span class='wd-chip mana'>🔓 " + esc(sm ? magicName(sm) : tid) + "</span>";
        } else {
          var fxS = null;
          try { fxS = itemEffect(e.name); } catch (eFS) {}
          if (fxS) { try { tag = "<span class='wd-chip mana'>" + esc(invEffectLabel(e.name) || "") + "</span>"; } catch (eIL) {} }
          else {
            var gpS = 0, gaS = 0;
            try { gpS = gearPowerFor(e.name); gaS = gearArmorFor(e.name); } catch (eGS2) {}
            if (gpS > 0) tag = "<span class='wd-chip kind'>⚔️+" + gpS + " " + esc(en ? "ATK" : "serang") + "</span>";
            else if (gaS > 0) tag = "<span class='wd-chip kind'>🛡️-" + gaS + " " + esc(en ? "dmg" : "damage") + "</span>";
          }
        }
      } catch (eTG) {}
      return "<div class='wd-srow'><b>" + esc(e.name) + "</b> " + tag + "<span>🪙" + pr + (e.service ? "" : " · ×" + (Number(e.qty) || 0)) + "</span><button class='wd-mini' data-buy='" + idx + "' type='button'" + (dis ? " disabled" : "") + ">" + (en ? "Buy" : "Beli") + "</button></div>";
    }).join("");
    var sellGroups = groupItems((W.player.items || []).slice(0, 12));
    var sellRows = sellGroups.map(function (g, gi) {
      return "<div class='wd-srow'><b>" + esc(g.name) + (g.n > 1 ? " <span class='wd-hint'>×" + g.n + "</span>" : "") + "</b><span>🪙" + sellPriceOf(g.name) + "</span><button class='wd-mini' data-sell='" + gi + "' type='button'>" + (en ? "Sell" : "Jual") + "</button></div>";
    }).join("") || "<div class='wd-hint'>" + (en ? "Bag empty." : "Tas kosong.") + "</div>";
    ov.innerHTML = "<div class='wd-shopbox' style='max-height:84vh;overflow:auto;'><h3 style='margin:0 0 0.4rem;'>🏪 " + esc(c.name) + " <span class='wd-hint'>🪙" + (Number(shop.coins) || 0) + " · " + (en ? "you" : "kamu") + " 🪙" + (Number(W.player.coins) || 0) + "</span></h3>" +
      "<div class='wd-lbl'>" + (en ? "Buy" : "Beli") + "</div>" + rows +
      "<div class='wd-lbl'>" + (en ? "Sell yours" : "Jual milikmu") + "</div>" + sellRows +
      "<div class='wd-row'><button class='wd-btn' data-close type='button'>✕ " + (en ? "Close" : "Tutup") + "</button><button class='wd-btn' data-quest type='button'>📜 " + (en ? "Ask for work" : "Minta kerja") + "</button></div></div>";
    ov.querySelector("[data-quest]").addEventListener("click", function () { offerQuest(c.id, true); ov.remove(); renderAll(); scrollFeed(); });
   ov.querySelectorAll("[data-buy]").forEach(function (b) {
     b.addEventListener("click", function () {
       var e = shop.stock[Number(b.getAttribute("data-buy"))];
       if (!e) return;
       var r = doBuy(c.id, e.name);
        if (!r.ok) toast(buyFailMsg(r.why, r.price, c.loc));
       ov.remove(); renderAll(); scrollFeed();
        if (r.ok || (r && r.why === "owned")) openShop(c.id);
     });
   });
    ov.querySelectorAll("[data-sell]").forEach(function (b) {
      b.addEventListener("click", function () {
        var g = sellGroups[Number(b.getAttribute("data-sell"))];
        if (!g) return;
        var bag = W.player.items || [], it = null;
        for (var i = 0; i < bag.length; i++) if (String(bag[i]) === g.name) { it = bag[i]; break; }
        if (it == null) for (var j = 0; j < bag.length; j++) if (String(bag[j]).toLowerCase() === g.name.toLowerCase()) { it = bag[j]; break; }
        if (it == null) return;
        doSell(c.id, it);
        ov.remove(); renderAll(); scrollFeed();
        openShop(c.id);
      });
    });
  }
  function invEffectLabel(name) {
    var fx = null;
    try { fx = itemEffect(name); } catch (e) {}
    if (!fx) return "";
    var parts = [];
    if (fx.hp) parts.push("❤️+" + fx.hp);
    if (fx.full) parts.push("🍖+" + Math.round(fx.full));
    if (fx.energy) parts.push("⚡+" + fx.energy);
    if (fx.mana) parts.push("✨+" + fx.mana);
    return parts.join(" ");
  }
 function invIconFor(name) {
   var s = String(name || "").toLowerCase();
   if (/pedang|sword|pisau|belati|dagger|kapak|axe|panah|bow|tombak|spear/.test(s)) return "⚔️";
    if (/tongkat|staff/.test(s)) return "🪄";
    if (/jimat|amulet|charm/.test(s)) return "🔮";
    if (/kitab|tome/.test(s)) return "📕";
   if (/perisai|shield|armor|baju besi|helm/.test(s)) return "🛡️";
   if (/peta|map/.test(s)) return "🗺️";
   if (/besi|iron|ore|tempa|logam|baja/.test(s)) return "🔩";
   if (/kayu|wood/.test(s)) return "🪵";
   if (/ramuan|potion|elixir|tonik|obat|jamu/.test(s)) return "🧪";
   if (/nasi|opor|gulai|sate|daging|sop|bekal|makan/.test(s)) return "🍱";
   if (/roti|kue/.test(s)) return "🍞";
   if (/apel|buah|berry|anggur|pisang/.test(s)) return "🍎";
   if (/herbal|herb|daun|jamu-herb/.test(s)) return "🌿";
   if (/teh|kopi|susu|jus|air|minum/.test(s)) return "🍵";
   if (/kunci|key/.test(s)) return "🗝️";
   if (/koin|coin|emas|permata|gem/.test(s)) return "💰";
    if (/buku|book|scroll|gulungan/.test(s)) return "📜";
   return "📦";
 }
 function invKindLabel(name, en) {
   var s = String(name || "").toLowerCase();
    if (/pedang|sword|perisai|shield|armor|panah|tombak|kapak|belati|pisau|tongkat|staff|jimat|amulet/.test(s)) return en ? "gear" : "alat";
    if (/kitab|tome|scroll sihir|buku sihir/.test(s)) return en ? "spell" : "sihir";
   if (/ramuan|potion|elixir|tonik|obat/.test(s)) return en ? "potion" : "obat";
   if (/nasi|roti|kue|apel|daging|sate|sop|bekal|makan|buah/.test(s)) return en ? "food" : "makanan";
   if (/teh|kopi|susu|jus|minum/.test(s)) return en ? "drink" : "minuman";
   if (/herbal|herb|daun/.test(s)) return en ? "herb" : "herbal";
   if (/besi|kayu|bahan|material|ore|wood/.test(s)) return en ? "material" : "bahan";
    if (/peta|map|kunci|key/.test(s)) return en ? "key item" : "penting";
    return en ? "material" : "bahan";
  }
  function openInventory() {
    if (!W || !W.player) return;
    var en = WL() === "en";
    var ov = openOverlay("");
    var bag = W.player.items || [];
    var groups = groupItems(bag.slice(0, MAX_ITEMS_P));
    var buyers = [];
    // Pil pembeli: hanya penjual yang terlihat (radius 3 ubin) — bukan semua se-lokasi.
    try { buyers = npcAtPlayerLoc().filter(function (c) { return (Math.abs((c.tx || 0) - (W.player.tx || 0)) + Math.abs((c.ty || 0) - (W.player.ty || 0))) <= 3; }); } catch (eB) {}
    var capPct = Math.max(0, Math.min(100, Math.round(bag.length / MAX_ITEMS_P * 100)));
    var buyerPill = buyers.length
      ? "<span class='wd-buyerpill ok'>🏪 " + esc(buyers[0].name) + " · " + (en ? "buys here" : "beli di sini") + "</span>"
      : "<span class='wd-buyerpill no'>" + (en ? "no buyer at this spot" : "tidak ada pembeli di sini") + "</span>";
    var cards = groups.map(function (g, gi) {
      var fx = null;
      try { fx = itemEffect(g.name); } catch (eFX) {}
      var chips = "";
      if (fx) {
        if (fx.hp) chips += "<span class='wd-chip hp'>❤️+" + fx.hp + "</span>";
        if (fx.full) chips += "<span class='wd-chip full'>🍖+" + Math.round(fx.full) + "</span>";
        if (fx.energy) chips += "<span class='wd-chip energy'>⚡+" + fx.energy + "</span>";
        if (fx.mana) chips += "<span class='wd-chip mana'>✨+" + fx.mana + "</span>";
      }
      var slot = null;
      try { slot = gearSlotFor(g.name); } catch (eGS) {}
      if (slot === "weapon") chips += "<span class='wd-chip kind'>⚔️+" + gearPowerFor(g.name) + " " + esc(en ? "ATK" : "serang") + "</span>";
      else if (slot === "shield") chips += "<span class='wd-chip kind'>🛡️-" + gearArmorFor(g.name) + " " + esc(en ? "dmg" : "damage") + "</span>";
      chips += "<span class='wd-chip coin'>🪙" + sellPriceOf(g.name) + "</span>";
      chips += "<span class='wd-chip kind'>" + esc(invKindLabel(g.name, en)) + "</span>";
      var isEq = false;
      try { var _eq = ensureEquip() || {}; isEq = (slot === "weapon" && _eq.weapon && gearKey(_eq.weapon) === gearKey(g.name)) || (slot === "shield" && _eq.shield && gearKey(_eq.shield) === gearKey(g.name)); } catch (eIE) {}
      if (isEq) chips += "<span class='wd-chip mana'>✅ " + esc(en ? "equipped" : "terpasang") + "</span>";
      var btns = "";
      if (fx) {
        var uv = "eat", ulbl = en ? "Eat" : "Makan", uico = "🍽️";
        try { if (useVerbFor(g.name) === "use") { uv = "eat"; ulbl = en ? "Use" : "Pakai"; uico = "🧪"; } } catch (eUV) {}
        btns += "<button class='wd-ibtn eat' data-eat='" + gi + "' type='button'>" + uico + " " + ulbl + "</button>";
      }
      if (slot) btns += isEq
        ? "<button class='wd-ibtn drop' data-unequip='" + gi + "' type='button'>" + (en ? "Unequip" : "Lepas") + "</button>"
        : "<button class='wd-ibtn eat' data-equip='" + gi + "' type='button'>⚔️ " + (en ? "Equip" : "Pasang") + "</button>";
      if (buyers.length) btns += "<button class='wd-ibtn sell' data-sell='" + gi + "' type='button'>" + (en ? "Sell" : "Jual") + " 🪙" + sellPriceOf(g.name) + "</button>";
      btns += "<button class='wd-ibtn drop' data-drop='" + gi + "' type='button' title='" + esc(en ? "Throw away 1" : "Buang 1") + "'>✕</button>";
      return "<div class='wd-invcard'><div class='wd-invico'>" + invIconFor(g.name) + (g.n > 1 ? "<span class='wd-invcount'>×" + g.n + "</span>" : "") + "</div>" +
        "<div class='wd-invmain'><div class='wd-invname'>" + esc(g.name) + "</div><div class='wd-chips'>" + chips + "</div><div class='wd-invacts'>" + btns + "</div></div></div>";
    }).join("");
    if (!cards) cards = "<div class='wd-invempty'><div class='big'>📭</div><div><b>" + (en ? "Bag empty." : "Tas masih kosong.") + "</b></div><div class='wd-hint'>" + (en ? "Gather, buy, or ask the gods nicely." : "Kumpulkan, beli, atau minta baik-baik ke dewa.") + "</div></div>";
    var eqLine = "";
    try {
      var _e2 = ensureEquip() || {};
      var _w = _e2.weapon, _s = _e2.shield;
      if (_w || _s) eqLine = "<div class='wd-invsub'>⚔️ " + esc(_w || (en ? "no weapon" : "tanpa senjata")) + " · 🛡️ " + esc(_s || (en ? "no shield" : "tanpa perisai")) + "</div>";
    } catch (eEL) {}
    ov.innerHTML = "<div class='wd-shopbox wd-invbox'><div class='wd-invhead'><div><h3 class='wd-invtitle'>🎒 " + (en ? "Your bag" : "Tasmu") + "</h3><div class='wd-invsub'>" + buyerPill + "</div>" + eqLine + "</div>" +
      "<div class='wd-invcap'><b>" + bag.length + "/" + MAX_ITEMS_P + "</b><div class='wd-capbar" + (bag.length >= MAX_ITEMS_P ? " full" : "") + "'><i style='width:" + capPct + "%'></i></div></div></div>" +
      "<div class='wd-invgrid'>" + cards + "</div>" +
      "<div class='wd-invfoot'><span class='wd-hint'>" + (en ? "⚔️ Only EQUIPPED weapon & shield fight with you — tap Equip on a card." : "⚔️ Hanya senjata & perisai TERPASANG yang ikut tarung — tekan Pasang di kartunya.") + "</span>" +
      "<button class='wd-btn' data-close type='button'>✕ " + (en ? "Close" : "Tutup") + "</button></div></div>";
    ov.querySelectorAll("[data-equip]").forEach(function (b) {
      b.addEventListener("click", function () {
        var g = groups[Number(b.getAttribute("data-equip"))];
        if (!g) return;
        var er = equipItem(g.name);
        if (!er.ok) toast(en ? "Can't equip that." : "Nggak bisa dipasang.");
        ov.remove(); renderAll(); scrollFeed();
        openInventory();
      });
    });
    ov.querySelectorAll("[data-unequip]").forEach(function (b) {
      b.addEventListener("click", function () {
        var g = groups[Number(b.getAttribute("data-unequip"))];
        if (!g) return;
        var slot = null;
        try { slot = gearSlotFor(g.name); } catch (eS) {}
        if (slot) unequip(slot);
        ov.remove(); renderAll(); scrollFeed();
        openInventory();
      });
    });
    ov.querySelectorAll("[data-eat]").forEach(function (b) {
      b.addEventListener("click", function () {
        var g = groups[Number(b.getAttribute("data-eat"))];
        if (!g) return;
        var re = doEat(g.name);
        if (!re.ok) toast(en ? "Can't eat that." : "Nggak bisa dimakan.");
        else { if (W.encounter) monsterCounter(); try { advanceClock(1); } catch (eAC) {} }
        ov.remove(); renderAll(); scrollFeed();
        openInventory();
      });
    });
    ov.querySelectorAll("[data-sell]").forEach(function (b) {
      b.addEventListener("click", function () {
        var g = groups[Number(b.getAttribute("data-sell"))];
        if (!g || !buyers.length) return;
        var bag = W.player.items || [], it = null;
        for (var i = 0; i < bag.length; i++) if (String(bag[i]) === g.name) { it = bag[i]; break; }
        if (it == null) return;
        var rs = doSell(buyers[0].id, it);
        if (!rs.ok) toast(rs.why === "dealerbroke" ? (en ? "Buyer is short on coins." : "Koin pembeli kurang.") : (en ? "Can't sell that." : "Nggak bisa dijual."));
        ov.remove(); renderAll(); scrollFeed();
        openInventory();
      });
    });
    ov.querySelectorAll("[data-drop]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var g = groups[Number(b.getAttribute("data-drop"))];
        if (!g) return;
        var ok = true;
        try { ok = await window.uiConfirm((en ? "Throw away 1× " : "Buang 1× ") + g.name + "?", { okText: en ? "Throw" : "Buang", danger: true }); } catch (e) {}
        if (!ok) return;
        takeItem("__player", g.name);
        save();
        toast((en ? "Discarded: " : "Dibuang: ") + g.name);
        ov.remove(); renderAll(); scrollFeed();
        openInventory();
      });
    });
  }
  function renderAll() {
    if (!rootEl) return;
    try { stashDrafts(); } catch (eRA) {}
    if (!W) { renderSetupNew(); return; }
    if (!$("wd-pane-adventure")) shell();
    if (W.mode !== "god" && wdTab === "god") wdTab = "adventure";
    renderTabBar();
    ["adventure", "party", "world", "god"].forEach(function (n) { var p = paneEl(n); if (p) p.hidden = (n !== wdTab); });
    renderSetup();
    renderCast();
    renderWorldTab();
    renderWorldTimeline();
    renderStage();
    if (W.mode === "god") renderGod();
  }

  /* ----- setup ----- */
  function renderSetupNew() {
    injectCss();
    // Pertahankan isian form saat re-render (mis. toggle 🌐 UI), agar pilihan
    // "Bahasa dunia" tidak diam-diam balik ke default.
   var prev = null;
   try {
      var _pn = $("wd-nw-name"), _pg = $("wd-nw-genre"), _pa = $("wd-nw-art"), _pl = $("wd-nw-lang"), _pp = $("wd-nw-prem"), _pe = $("wd-nw-elem");
      if (_pn || _pp) prev = { name: _pn ? _pn.value : "", genre: _pg ? _pg.value : null, art: _pa ? _pa.value : null, lang: _pl ? _pl.value : null, prem: _pp ? _pp.value : "", elem: _pe ? _pe.value : null };
   } catch (eP) {}
   var defLang = (prev && prev.lang) || effUi(), okL = false;
   for (var _li = 0; _li < LANGS.length; _li++) if (LANGS[_li].id === defLang) okL = true;
   if (!okL) defLang = "en";
   var defGenre = "fantasy";
   var defArt = (prev && prev.art) || "anime";
    var defElem = (prev && prev.elem) || "api";
    var _elemOpts = [["api", "🔥", "Api", "Fire"], ["angin", "🌪️", "Angin", "Wind"], ["es", "❄️", "Es", "Ice"], ["tanah", "🪨", "Tanah", "Earth"], ["petir", "⚡", "Petir", "Lightning"], ["cahaya", "✨", "Cahaya", "Holy"]];
   rootEl.innerHTML =
     "<div class='wd-card'><h3>" + T("setupTitle") + "</h3><div class='wd-hint'>" + T("setupSub") + "</div>" +
     "<div class='wd-row' style='margin-top:0.3rem;'>" + uiLangToggleHtml() + "</div>" +
     "<label class='wd-lbl'>" + T("fName") + "</label><input id='wd-nw-name' class='wd-in' value='" + esc(prev ? prev.name : "") + "' placeholder='" + esc(T("fNamePh")) + "'>" +
     "<label class='wd-lbl'>" + T("fGenre") + "</label><select id='wd-nw-genre' class='wd-sel'>" + GENRES.map(function (g) { var locked = (g !== "fantasy"); return "<option value='" + g + "'" + (g === defGenre ? " selected" : "") + (locked ? " disabled" : "") + ">" + esc(genreLabel(g)) + (locked ? (effUi() === "id" ? " (segera)" : " (soon)") : "") + "</option>"; }).join("") + "</select>" +
     "<div class='wd-hint'>" + (effUi() === "id" ? "✨ Genre lain segera hadir." : "✨ More genres coming soon.") + "</div>" +
     "<label class='wd-lbl'>" + T("fArt") + "</label><select id='wd-nw-art' class='wd-sel'>" + ART_STYLES.map(function (a) { var m = ART_LABEL[a.id]; return "<option value='" + a.id + "'" + (a.id === defArt ? " selected" : "") + ">" + esc(effUi() === "id" ? (m ? m.id : a.name) : (m ? m.en : a.name)) + "</option>"; }).join("") + "</select>" +
     "<label class='wd-lbl'>" + T("fLang") + "</label><select id='wd-nw-lang' class='wd-sel'>" + LANGS.map(function (l) { return "<option value='" + l.id + "'" + (l.id === defLang ? " selected" : "") + ">" + l.name + "</option>"; }).join("") + "</select>" +
     "<div class='wd-hint'>" + T("fLangHint") + "</div>" +
      "<label class='wd-lbl'>" + esc((effUi() === "id") ? "🔮 Elemen afinitas (bonus +15%)" : "🔮 Affinity element (+15% bonus)") + "</label><select id='wd-nw-elem' class='wd-sel'>" + _elemOpts.map(function (o) { return "<option value='" + o[0] + "'" + (o[0] === defElem ? " selected" : "") + ">" + o[1] + " " + esc((effUi() === "id") ? o[2] : o[3]) + "</option>"; }).join("") + "</select>" +
      "<div class='wd-hint'>" + esc((effUi() === "id") ? "Sihir selemen afinitasmu +15%. Semua sihir tetap bisa dipakai — buka bertahap per level." : "Same-element spells get +15%. All spells stay usable — unlocked gradually by level.") + "</div>" +
     "<label class='wd-lbl'>" + T("fPrem") + "</label><textarea id='wd-nw-prem' class='wd-ta' placeholder='" + esc(T("fPremPh")) + "'>" + esc(prev ? prev.prem : "") + "</textarea>" +
     "<div class='wd-row'><button id='wd-nw-ai' class='wd-btn' type='button'>" + T("bPremAi") + "</button><button id='wd-nw-go' class='wd-btn go' type='button'>" + T("bBuild") + "</button></div></div>" +
     "<div class='wd-card wd-hint'>" + T("lockNote") + "</div>" +
     "<div class='wd-card wd-hint'>" + T("saveNote") + "</div>";
    wireUiLangToggle();
    $("wd-nw-go").addEventListener("click", function () {
      var isEn = ($("wd-nw-lang").value === "en");
      var name = $("wd-nw-name").value.trim() || (isEn ? "Unnamed World" : "Dunia Tanpa Nama");
      var genre = "fantasy";
      var lang = $("wd-nw-lang").value;
      var prem = $("wd-nw-prem").value.trim() || (isEn ? "A " + (GENRE_WORD[genre] || genre) + " world called " + name + "." : "Sebuah dunia " + genre + " bernama " + name + ".");
     var P = ((PRESETS[genre] || PRESETS.custom)[lang === "en" ? "en" : "id"] || PRESETS.custom.id);
     W = { v: 1, name: name.slice(0, 60), genre: genre, lang: lang, uiLang: uiLangCur, art: $("wd-nw-art").value || "anime", mode: "player", encounter: null,
       premise: prem.slice(0, 2000), rules: (isEn ? CT.en.rules : CT.id.rules), tone: (isEn ? CT.en.tone : CT.id.tone),
        player: { name: (isEn ? CT.en.you : CT.id.you), desc: (isEn ? "A newcomer." : "Pendatang baru."), loc: null, items: [], coins: START_COINS, hp: START_HP, maxHp: 100, full: START_FULL, energy: START_ENERGY, mana: START_MANA, maxMana: 100, level: 1, xp: 0, kills: 0, goal: "", rankClaimed: [], legendClaimed: false, elem: (($("wd-nw-elem") && $("wd-nw-elem").value) || "api"), spell: "api", tomes: [], equip: { weapon: null, shield: null } },
        locations: P.locations.map(function (l) { return { id: uid("l"), name: l[0], desc: l[1], cond: "" }; }),
        chars: [], feed: [], worldMems: [], checkpoints: [], archived: [], exResidents: [], quests: [], offerCd: {}, rot: { on: true, ticks: 0, last: -99 }, counter: 0,
        clock: { day: 1, phase: 0, n: 0 }, weather: { kind: "cerah" },
        ambient: { on: true, secs: 75 }, createdAt: Date.now(), updatedAt: Date.now() };
      W.player.loc = W.locations.length ? W.locations[0].id : null;
      if (genre === "fantasy") { W.player.items = ["Roti", "Teh Herbal"]; }
      P.chars.slice(0, MAX_CHARS).forEach(function (p) {
        W.chars.push({ id: uid("c"), name: p.name, role: p.role, personality: p.personality, goal: p.goal, desc: p.desc, loc: W.locations[Math.floor(Math.random() * W.locations.length)].id, avatar: "", affinity: 0, mems: [], pinned: false, act: "", actTs: 0, items: [] });
      });
      pushFeed({ kind: "system", loc: null, text: C("born", { name: W.name, genre: genreLabel(genre), lang: langName(W.lang), chars: W.chars.map(function (c) { return c.name; }).join(", "), loc: W.locations[0].name }) });
      addCheckpoint(C("cpFirst"));
      save(); shell(); renderAll(); scrollFeed();
      toast(T("madeAuto"));
      (async function () {
        var list = W.chars.slice();
        for (var i = 0; i < list.length; i++) { try { await portraitFor(list[i].id, null, true); } catch (e) {} }
        try { if (W && W.player) await locImageFor(W.player.loc, null); } catch (e2) {}
      })();
    });
    $("wd-nw-ai").addEventListener("click", async function () {
      if (!aiReady()) { toast(T("aiNotReady")); return; }
      var g = "fantasy", n = $("wd-nw-name").value.trim() || ($("wd-nw-lang").value === "en" ? "this world" : "dunia ini");
      var b = $("wd-nw-ai"); b.disabled = true; b.textContent = "⏳…";
      try {
        var fl = $("wd-nw-lang").value;
        var t = await genTextP({ instruction: (fl === "en"
          ? "Write a roleplay world premise for the " + (GENRE_WORD[g] || g) + " genre, world named \"" + n + "\", in 3 sentences + 1 world-rule sentence. Language: " + langName(fl) + ". Just the premise, nothing else."
          : "Buat premis dunia roleplay genre " + g + " bernama \"" + n + "\" dalam 3 kalimat + 1 kalimat aturan dunia. Bahasa: " + langName(fl) + ". Langsung premisnya saja.") });
        $("wd-nw-prem").value = t.trim().slice(0, 900);
      } catch (e) { toast(T("aiFail") + String(e && e.message || e).slice(0, 100)); }
      b.disabled = false; b.textContent = T("bPremAi");
    });
  }
 function renderSetup() {
   var el = paneEl("world"); if (!el) return;
   var god = isGod();
 var pItems = (W.player && W.player.items && W.player.items.length) ? "<div class='wd-hint'>" + T("itemsTitle") + ": " + esc(itemsLabel(W.player.items, "")) + "</div>" : "";
    var elemLine = "";
    try { elemLine = " · 🔮 " + esc(elemLabel((W.player && W.player.elem) || "api")); } catch (eEL) {}
   el.innerHTML =
     "<div class='wd-card'><h3>🌍 " + esc(W.name) + "</h3>" +
      "<div class='wd-hint'>" + esc(genreLabel(W.genre)) + " · 🎨 " + esc(artLabel()) + " · <span class='wd-lock'>🔒 " + esc(langName(W.lang)) + "</span>" + elemLine + " · mode <b>" + (god ? T("mTagG") : T("mTagP")) + "</b></div>" +
      (god ? "" : "<div class='wd-hint' style='margin-top:0.35rem;'>" + T("lockChar") + "</div>") +
      "<label class='wd-lbl'>" + T("modeLabel") + "</label><div class='wd-row'><button id='wd-m-player' class='wd-btn" + (!god ? " go" : "") + "' type='button'>" + T("modePlayer") + "</button><button id='wd-m-god' class='wd-btn" + (god ? " go" : "") + "' type='button'>" + T("modeGod") + "</button></div>" +
      "<label class='wd-lbl'>" + T("fPremise") + "</label><div class='wd-hint'>" + esc(W.premise).replace(/\n/g, "<br>") + "</div>" +
      "<label class='wd-lbl'>" + T("fLocs") + " (" + W.locations.length + ")</label><div class='wd-hint'>" + W.locations.map(function (l) { return esc(l.name) + (l.cond ? " — <i>" + esc(l.cond) + "</i>" : ""); }).join(" · ") + "</div>" +
      (!god ? "<label class='wd-lbl'>" + T("fYou") + "</label><input id='wd-p-name' class='wd-in' value='" + esc(W.player.name) + "' maxlength='30'>" + pItems + "<div class='wd-hint' style='margin-top:0.3rem;'>" + T("youAt", { loc: esc(locName(W.player.loc)), ex1: "<i>" + esc((effUi() === "id" ? "*pergi ke " : "*go to ") + (W.locations[1] || W.locations[0] || { name: "…" }).name) + "*</i>", ex2: "<i>" + esc((effUi() === "id" ? "/pindah " : "/move ") + (W.locations[1] || W.locations[0] || { name: "…" }).name) + "</i>" }) + "</div>" : "") +
      "<div class='wd-row'><button id='wd-reset' class='wd-btn' type='button'>" + T("bReset") + "</button>" + (god ? "<button id='wd-manual-cp' class='wd-btn' type='button'>" + T("bCp") + "</button>" : "") + "</div></div>";
    $("wd-m-player").addEventListener("click", function () { W.mode = "player"; godPending = null; save(); renderAll(); });
    $("wd-m-god").addEventListener("click", function () { W.mode = "god"; save(); renderAll(); });
    if ($("wd-p-name")) $("wd-p-name").addEventListener("change", function () { W.player.name = this.value.trim().slice(0, 30) || C("you"); save(); renderStage(); });
    $("wd-reset").addEventListener("click", async function () {
      var ok = true;
      try { ok = await window.uiConfirm(T("resetConfirm", { name: W.name }), { okText: T("resetOk"), danger: true }); } catch (e) {}
      if (!ok) return;
      try { var f = kvFolder(); if (f) await f.delete(KV_KEY); } catch (e) {}
      try { localStorage.removeItem("t2iWorldBackup"); } catch (e2) {}
      W = null; godPending = null; focusChar = null; renderSetupNew();
    });
    if ($("wd-manual-cp")) $("wd-manual-cp").addEventListener("click", function () { addCheckpoint(C("cpManual") + new Date().toLocaleTimeString()); renderGod(); toast(T("cpSaved")); });
  }

  /* ----- cast ----- */
  function renderCast() {
    var host = paneEl("party"); if (!host || !W) return;
    var old = host.querySelector(".wd-castcard"); if (old) old.remove();
    var div = document.createElement("div");
    div.className = "wd-card wd-castcard";
    var god = isGod();
    var en = effUi() !== "id";
    var h = "<h3>" + T("cast") + " (" + W.chars.length + "/" + MAX_CHARS + ")" + (god ? " <button id='wd-avatars' class='wd-mini' type='button'>" + T("bAvAll") + "</button> <button id='wd-avatars-all' class='wd-mini' type='button'>" + T("bAvRedo") + "</button>" : "") + "</h3>";
    var sel = null;
    if (focusChar) sel = charById(focusChar);
    if (!sel && partySel) sel = charById(partySel);
    if (!sel) sel = W.chars[0] || null;
    if (sel) partySel = sel.id;
    if (partySub !== "info" && partySub !== "mem" && partySub !== "items") partySub = "info";
    if (sel) {
      h += "<div class='wd-rail'>" + W.chars.map(function (c) {
        var n = (c.mems || []).length;
        return "<button class='wd-railm" + (c.id === sel.id ? " on" : "") + "' data-rail='" + c.id + "' type='button'><span class='wd-av'>" + (c.avatar ? "<img src='" + c.avatar + "'>" : esc(c.name.slice(0, 1))) + "</span><span class='wd-railname'>" + esc(c.name) + "</span>" + (n ? "<span class='wd-railn'>🧠" + n + "</span>" : "") + "</button>";
      }).join("") + "</div>";
      var c = sel, mems = (c.mems || []).length;
      var bondTxt = (function () { try { var tb = topBondOf(c); return tb ? "💞 → " + tb.name + ": " + stageOf(tb.v) + " (" + tb.v + ")" : ""; } catch (eT) { return ""; } })();
      h += "<div class='wd-prof' data-cid='" + c.id + "'>" +
        "<div class='wd-phead'><div class='wd-av'>" + (c.avatar ? "<img src='" + c.avatar + "'>" : esc(c.name.slice(0, 1))) + "</div>" +
        "<div style='flex:1;min-width:0;'><div class='wd-pname'>" + esc(c.name) + (c.pinned ? " " + T("pinned") : "") + "</div>" +
        "<div class='wd-cpills'><span class='wd-pill loc'>📍 " + esc(locName(c.loc)) + "</span><span class='wd-pill'>" + esc(c.role) + "</span><span class='wd-pill'>" + esc(stageOf(c.affinity)) + " (" + c.affinity + ")</span></div></div></div>" +
        "<div class='wd-crow wd-statusbox wd-status' data-st-for='" + c.id + "'>" + esc(statusOf(c)) + "</div>" +
        "<div class='wd-ptabs'><button class='wd-mini wd-ptab" + (partySub === "info" ? " on" : "") + "' data-ptab='info' type='button'>👤 " + (en ? "Profile" : "Profil") + "</button>" +
        "<button class='wd-mini wd-ptab" + (partySub === "mem" ? " on" : "") + "' data-ptab='mem' type='button'>" + T("bMem") + (mems ? " (" + mems + ")" : "") + "</button>" +
        "<button class='wd-mini wd-ptab" + (partySub === "items" ? " on" : "") + "' data-ptab='items' type='button'>🎒 " + ((c.items || []).length || "") + "</button></div>" +
        "<div class='wd-psec'>" + (partySub === "mem"
          ? (((c.mems || []).length ? (c.mems || []).map(function (m) { return "<div class='wd-cp'>" + esc(m.text) + "</div>"; }).join("") : "<div class='wd-hint'>" + T("noMem") + "</div>"))
          : partySub === "items"
          ? (groupItems((c.items || []).slice()).map(function (g) { return "<div class='wd-pitem'><span class='wd-pi'>" + invIconFor(g.name) + "</span><b>" + esc(g.name) + (g.n > 1 ? " ×" + g.n : "") + "</b><span class='wd-chip coin'>🪙" + sellPriceOf(g.name) + "</span></div>"; }).join("") || "<div class='wd-hint'>" + (en ? "No items." : "Tidak bawa barang.") + "</div>")
          : ("<div class='wd-cquote'>“" + esc(c.personality) + "”</div>" +
            "<div class='wd-crow'>😊 <b>" + esc(moodOf(c)) + "</b>" + (c.moodWhy ? " <span style='opacity:0.75;'>(" + esc(String(c.moodWhy).slice(0, 80)) + ")</span>" : "") + "</div>" +
            (bondTxt ? "<div class='wd-crow'>" + esc(bondTxt) + "</div>" : ""))) + "</div>" +
        "<div class='wd-cact'><button class='wd-btn' data-act='talk' type='button'>" + T("bTalk") + "</button>" +
        ((W.genre === "fantasy" && !isGod() && W.player && c.loc === W.player.loc) ? "<button class='wd-btn' data-act='shop' type='button'>🏪 " + (en ? "Shop" : "Toko") + "</button><button class='wd-btn' data-act='work' type='button'>📜 " + (en ? "Work" : "Kerja") + "</button>" : "") + "</div></div>";
    } else if (!W.chars.length) {
      h += "<div class='wd-hint'>" + (en ? "No characters yet." : "Belum ada karakter.") + "</div>";
    }
    if (W.chars.length >= MAX_CHARS) h += "<div class='wd-hint'>" + T("castFull", { n: MAX_CHARS }) + "</div>";
    else h += god ? "<div class='wd-hint'>" + T("npcHintGod") + "</div>" : "<div class='wd-hint'>" + T("npcHintPlayer") + "</div>";
    div.innerHTML = h;
    host.appendChild(div);
    div.querySelectorAll("[data-rail]").forEach(function (b) {
      b.addEventListener("click", function () { var id = b.getAttribute("data-rail"); partySel = id; focusChar = id; renderCast(); renderStage(); });
    });
    div.querySelectorAll("[data-ptab]").forEach(function (b) {
      b.addEventListener("click", function () { partySub = b.getAttribute("data-ptab"); renderCast(); });
    });
    var prof = div.querySelector(".wd-prof");
    if (prof) {
      var id = prof.getAttribute("data-cid");
      prof.querySelector("[data-act='talk']").addEventListener("click", function () { focusChar = (focusChar === id ? null : id); partySel = focusChar || id; renderCast(); renderStage(); });
      var sh = prof.querySelector("[data-act='shop']"); if (sh) sh.addEventListener("click", function () { openShop(id); });
      var wk = prof.querySelector("[data-act='work']"); if (wk) wk.addEventListener("click", function () { var _c = charById(id); if (_c && W.player && _c.loc !== W.player.loc) { toast(WL() === "en" ? "Go to " + locName(_c.loc) + " first." : "Ke " + locName(_c.loc) + " dulu."); return; } offerQuest(id); renderAll(); scrollFeed(); });
    }
    var avAll = div.querySelector("#wd-avatars");
    if (avAll) avAll.addEventListener("click", async function () {
      if (needGod("Portrait generation")) return;
      var need = W.chars.filter(function (c) { return !c.avatar; });
      if (!need.length) { toast(T("allHaveAv")); return; }
      avAll.disabled = true; avAll.textContent = "⏳…";
      toast(T("makingAv", { n: need.length }));
      for (var i = 0; i < need.length; i++) { try { await portraitFor(need[i].id, null, true); } catch (e) {} }
    });
    var avRedo = div.querySelector("#wd-avatars-all");
    if (avRedo) avRedo.addEventListener("click", async function () {
      if (needGod("Redrawing portraits")) return;
      if (!W.chars.length) return;
      var ok = true;
      try { ok = await window.uiConfirm(T("redoConfirm", { n: W.chars.length, style: artLabel() }), { okText: T("redoOk") }); } catch (e) {}
      if (!ok) return;
      avRedo.disabled = true;
      toast(T("redoing", { n: W.chars.length, style: artLabel() }));
      var list = W.chars.slice();
      for (var i = 0; i < list.length; i++) { try { imgBusy[list[i].id] = false; await portraitFor(list[i].id, null, true); } catch (e) {} }
    });
  }

  /* ----- world tab: ringkasan lokasi (pengganti kartu peta lama) ----- */
  function renderWorldTab() {
    var host = paneEl("world"); if (!host || !W) return;
    var old = host.querySelector(".wd-loclistcard"); if (old) old.remove();
    var div = document.createElement("div");
    div.className = "wd-card wd-loclistcard";
    var en = effUi() !== "id";
    var h = "<h3>📍 " + (en ? "Locations" : "Lokasi") + " (" + W.locations.length + ")</h3>";
    try { h += "<div class='wd-hint'>🕰️ " + esc(clockLine()) + " · " + esc((WX_L[wxKind()] || {}).emoji || "") + " " + esc(wxNameUI(wxKind())) + "</div>"; } catch (eWx) {}
    h += W.locations.map(function (l) {
      var mem = W.chars.filter(function (c) { return c.loc === l.id; });
      var here = !!(W.player && W.player.loc === l.id);
      var dang = isDangerLoc(l.name);
      var badge = dang ? "⚠️ " + (en ? "danger" : "bahaya") : (isRestLoc(l.name) ? "🛏️ " + (en ? "rest" : "istirahat") : "🌿 " + (en ? "safe" : "aman"));
      var shopHere = mem.some(function (c) { try { return !!(c.shop && c.shop.stock && c.shop.stock.length); } catch (eS) { return false; } });
      var thumb = l.img ? "<img class='wd-locimg' src='" + l.img + "'>" : "";
      var names = mem.map(function (c) { return esc(c.name); });
      if (here) names.push("🧍 " + esc(W.player.name));
      return "<div class='wd-cp'>" + thumb +
        "<b>📍 " + esc(l.name) + "</b>" + (here ? " <span class='wd-lochere'>" + esc(WL() === "en" ? "YOU" : "KAMU") + "</span>" : "") + "<br>" +
        "<span class='wd-hint'>" + badge + (shopHere ? " · 🏪" : "") + (l.cond ? " · <span class='wd-loccond'>" + esc(l.cond) + "</span>" : "") + "</span><br>" +
        "<span class='wd-hint'>" + esc(l.desc || "") + "</span><br>" +
        "<span class='wd-hint'>" + (names.length ? names.join(", ") : (en ? "empty" : "kosong")) + "</span>" +
        "<div class='wd-row'>" + ((!here && W.mode === "player") ? "<button class='wd-mini' data-wgoto='" + l.id + "' type='button'>✈ " + (en ? "Go (−6 ⚡)" : "Pergi (−6 ⚡)") + "</button>" : "") +
        (l.img ? "" : " <button class='wd-mini' data-wlocimg='" + l.id + "' type='button'>🎨</button>") + "</div></div>";
    }).join("");
    div.innerHTML = h;
    host.appendChild(div);
    div.querySelectorAll("[data-wgoto]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-wgoto");
        if (W.player.loc !== id) playerMoveTo(id);
        setWorldTab("adventure"); scrollFeed();
      });
    });
    div.querySelectorAll("[data-wlocimg]").forEach(function (b) {
      b.addEventListener("click", function () { locImageFor(b.getAttribute("data-wlocimg"), b); });
    });
  }

  /* ----- world tab: linimasa read-only (tombol aksi tetap di Dewa) ----- */
  function renderWorldTimeline() {
    var host = paneEl("world"); if (!host || !W) return;
    var old = host.querySelector(".wd-tlcard"); if (old) old.remove();
    var div = document.createElement("div");
    div.className = "wd-card wd-tlcard";
    var h = "<h3>" + T("tlTitle") + "</h3>";
    var cps = (W.checkpoints || []).slice().reverse();
    h += cps.map(function (c) {
      return "<div class='wd-cp'>📌 " + esc(c.label) + "<br><span class='wd-hint'>" + new Date(c.ts).toLocaleString() + "</span></div>";
    }).join("") || "<div class='wd-hint'>" + T("noCp") + "</div>";
    if (W.archived && W.archived.length) {
      h += "<label class='wd-lbl'>" + T("archTitle") + "</label>" + W.archived.map(function (a) { return "<details><summary style='cursor:pointer;font-size:0.78rem;'>" + esc(a.label) + "</summary><div class='wd-hint' style='white-space:pre-wrap;'>" + esc(a.text) + "</div></details>"; }).join("");
    }
    var exs = (W.exResidents || []);
    h += "<label class='wd-lbl'>" + T("exTitle") + " (" + exs.length + ")</label>" +
      (exs.length ? exs.map(function (e) { return "<div class='wd-cp'>🧳 <b>" + esc(e.name) + "</b> <span class='wd-hint'>" + esc(e.role || "") + (e.why ? " · " + esc(e.why) : "") + "</span></div>"; }).join("") : "<div class='wd-hint'>" + T("exEmpty") + "</div>");
    div.innerHTML = h;
    host.appendChild(div);
  }

  /* ----- stage ----- */
  /* Bar dagang kilat: dibangun ulang ringan kapan saja (tiap langkah) tanpa render
     ulang seluruh panggung — anti kelap-kelip. Dipakai renderStage + refreshNearby. */
  function paintShopRow() {
    var box = $("wd-shops");
    if (!box || !W || W.mode !== "player") return;
    var here = [];
    try { here = W.chars.filter(function (c) { return c.loc === W.player.loc && (Math.abs((c.tx || 0) - (W.player.tx || 0)) + Math.abs((c.ty || 0) - (W.player.ty || 0))) <= 3; }); } catch (e) {}
    box.innerHTML = here.map(function (c) { return "<button class='wd-mini' data-shop='" + c.id + "' type='button'>🏪 " + esc(c.name) + "</button>"; }).join("");
    box.style.display = here.length ? "" : "none";
    box.querySelectorAll("[data-shop]").forEach(function (b) { b.addEventListener("click", function () { openShop(b.getAttribute("data-shop")); }); });
  }
  function renderStage() {
    try { stashDrafts(); } catch (eSS) {}
    var el = paneEl("adventure"); if (!el || !W) return;
    var focus = focusChar ? charById(focusChar) : null;
    var exLoc = (W.locations[1] || W.locations[0] || { name: "…" }).name;
    var exLoc0 = (W.locations[0] || { name: "…" }).name;
    var exChar = (W.chars[0] || { name: "…" }).name;
    var _clkHtml = "";
    try { _clkHtml = "<span class='wd-hint'>" + esc(clockLine() + (W.mode === "player" && W.player ? " - " + locName(W.player.loc) : "")) + "</span>"; } catch (eClkH) {}
    var h = "<div class='wd-card'><h3>" + T("stage") + (focus ? " — " + esc(focus.name) + " <button id='wd-unfocus' class='wd-mini' type='button'>" + T("unFocus") + "</button>" : "") + "</h3>";
    h += "<div class='wd-stagehead'>" +
      "<span class='wd-hint'>" + T("fLoc") + "</span><select id='wd-locfilter' class='wd-sel' style='width:auto;flex:1;min-width:0;'>" +
      "<option value='all'" + (locFilter === "all" ? " selected" : "") + ">" + T("optAll") + "</option>" +
      W.locations.map(function (l) { return "<option value='" + l.id + "'" + (locFilter === l.id ? " selected" : "") + ">" + esc(l.name) + "</option>"; }).join("") + "</select>" + _clkHtml + "</div>";
    try { if (W.genre === "fantasy") { h += hudHtml(); } } catch (eHud) {}
    h += "<div class='wd-screen'><div id='wd-tiles'></div>";
    try { if (W.genre === "fantasy" && W.mode === "player") { h += encounterCardHtml(); } } catch (eEnc) {}
    h += "</div>";
    try {
      if (W.genre === "fantasy") {
        var _qh = questPanelHtml();
        if (_qh) {
          var _qn = 0;
          try { _qn = (W.quests || []).filter(function (q) { return q.state === "offered" || q.state === "active"; }).length; } catch (eQN) {}
          h += "<details class='wd-sect'" + (questOpen ? " open" : "") + "><summary>📜 " + ((WL() === "en") ? "Quests" : "Quest") + " (" + _qn + ")</summary><div class='wd-qstrip'>" + _qh + "</div></details>";
        }
      }
    } catch (e) {}
    h += "<div id='wd-feed' class='wd-feed' style='margin-top:0.5rem;'></div>";
    h += "<div class='wd-stickfoot'>";
   if (W.genre === "fantasy" && W.mode === "player") {
     var _hasEnc = !!(W.encounter && W.encounter.hp > 0);
      var _spellSel = "";
     try {
       var _cur = playerSpell();
       _spellSel = "<select id='wd-spell' class='wd-sel wd-spellsel'>" + MAGICS.map(function (s) {
          var locked = !hasSpell(s.id);
          var lbl = s.emoji + " " + magicName(s) + " (" + s.cost + "✨" + (locked ? ", Lv" + s.lvl + "📕" : "") + ")";
         return "<option value='" + s.id + "'" + (s.id === _cur.id ? " selected" : "") + (locked ? " disabled" : "") + ">" + esc(lbl) + "</option>";
       }).join("") + "</select>";
     } catch (eSS2) {}
      h += "<div class='wd-actionbar'>" +
        (_hasEnc
          ? "<button class='wd-abtn fight' id='wd-act-atk' type='button'>⚔️ " + (WL() === "en" ? "Attack" : "Serang") + "</button>" + _spellSel + "<button class='wd-abtn magic' id='wd-act-mag' type='button'>✨ " + (WL() === "en" ? "Magic" : "Sihir") + "</button><button class='wd-abtn' id='wd-act-flee' type='button'>🏃 " + (WL() === "en" ? "Flee" : "Kabur") + "</button>"
          : "<button class='wd-abtn' id='wd-act-gather' type='button'>🔍 " + (WL() === "en" ? "Explore" : "Jelajah") + "</button>") +
        "<button class='wd-abtn' id='wd-act-sleep' type='button'>😴 " + (WL() === "en" ? "Rest" : "Istirahat") + "</button>" +
        "<button class='wd-abtn' id='wd-act-status' type='button'>📊</button></div>";
      if (_hasEnc) {
        try {
         var _sp2 = playerSpell();
         h += "<details class='wd-spellhelp'><summary>🔮 " + esc((WL() === "en" ? "Spells & elements" : "Sihir & elemen")) + " — " + esc(_sp2.emoji + " " + magicName(_sp2) + ": " + ((WL() === "en") ? _sp2.descEN : _sp2.descID)) + "</summary><div class='wd-hint'>" +
            MAGICS.map(function (s) { var lk = !hasSpell(s.id); return "<div>" + s.emoji + " <b>" + esc(magicName(s)) + "</b> (" + s.cost + "✨" + (lk ? " · 🔒 Lv" + s.lvl + " / 📕" + esc(tomeNameFor(s.id)) : " ✅") + ") — " + esc((WL() === "en") ? s.descEN : s.descID) + "</div>"; }).join("") +
           "<div style='margin-top:0.3rem;'>" + esc((WL() === "en") ? "Chart: Fire> Nature/Ice/Wind · Ice> Earth/Wind · Lightning> Ice · Wind> Earth · Earth> Fire/Lightning · Holy> Dark (+heal). Affinity +" : "Chart: Api> Alam/Es/Angin · Es> Tanah/Angin · Petir> Es · Angin> Tanah · Tanah> Api/Petir · Cahaya> Gelap (+heal). Afinitas +") + "15%</div>" +
            "<div>" + esc((WL() === "en") ? "Type: sihir api / sihir es / sihir petir / sihir angin / sihir tanah / sihir cahaya. Locked spells: buy the Kitab at a shop." : "Ketik: sihir api / sihir es / sihir petir / sihir angin / sihir tanah / sihir cahaya. Sihir terkunci: beli Kitab-nya di shop.") + "</div></div></details>";
        } catch (eSH) {}
      }
      // Bar dagang kilat: wadah kosong di sini, isi + handler via paintShopRow()
      // (dipanggil tiap wiring & tiap langkah — tanpa render ulang panggung).
      h += "<div class='wd-row' id='wd-shops' style='display:none'></div>";
    }
    if (W.mode === "player") {
      h += "<div class='wd-talk'><select id='wd-target' class='wd-sel' style='max-width:150px;'>" +
        "<option value='all'>" + T("optAllCb") + "</option>" +
        W.chars.map(function (c) { return "<option value='" + c.id + "'" + (focus && focus.id === c.id ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join("") + "</select>" +
        "<select id='wd-kind' class='wd-sel wd-kind'><option value='say'>" + T("kindSay") + "</option><option value='act'>" + T("kindAct") + "</option></select>" +
        "<input id='wd-say' class='wd-in' maxlength='600' placeholder='" + esc(T("sayPh", { name: W.player.name })) + "'><button id='wd-send' class='wd-btn go wd-send' type='button'>" + T("bSend") + "</button></div>";
    } else {
      h += "<div class='wd-hint' style='margin-top:0.5rem;'>" + T("godStageHint") + "</div>" +
        "<div class='wd-talk'><input id='wd-narr' class='wd-in' maxlength='400' placeholder='" + esc(T("narrPh")) + "'></div>";
    }
    h += "</div>";
    if (W.mode === "player") {
      h += "<details class='wd-minihelp'><summary>💡 " + ((WL() === "en") ? "More" : "Lainnya") + "</summary>";
    }
    if (W.mode === "player") {
      h += "<div class='wd-hint'>" + T("actHint", {
          a: "<i>" + esc((effUi() === "id" ? "*pergi ke " : "*go to ") + exLoc) + "*</i>",
          b: "<i>" + esc((effUi() === "id" ? "*memberi hadiah ke " : "*give a gift to ") + exChar) + "*</i>",
          c: "<i>" + esc((effUi() === "id" ? "/pindah " : "/move ") + exLoc0) + "</i>" }) + "</div>";
    }
    h += "<div class='wd-utilrow'><button id='wd-ambient-btn' class='wd-mini' type='button' title='" + esc(T("rotHint", { n: MAX_CHARS }) + " " + T("soloHint")) + "'>" + (W.ambient.on ? T("ambOn") : T("ambOff")) + "</button>" +
      "<button id='wd-rot-btn' class='wd-mini' type='button' title='" + esc(T("rotHint", { n: MAX_CHARS }) + " " + T("soloHint")) + "'>" + (rotOn() ? T("rotOn") : T("rotOff")) + "</button>" +
      "<button id='wd-sim1' class='wd-mini' type='button'>" + T("bSim") + "</button>" +
      (busy ? "<span class='wd-hint'>" + T("busy") + "</span>" : "") + "</div></details></div>";
    el.innerHTML = h;
    try {
      var _say = $("wd-say"); if (_say && savedSay) _say.value = savedSay;
      var _tg = $("wd-target"); if (_tg && savedSayTarget) _tg.value = savedSayTarget;
      var _kd = $("wd-kind"); if (_kd && savedSayKind) _kd.value = savedSayKind;
    } catch (eDR) {}
    paintFeed();
    try { paintShopRow(); } catch (ePSR) {}
    var syncWhere = function () {
      try {
        var sel = $("wd-locfilter");
        if (sel) sel.value = locFilter;
        rootEl.querySelectorAll("[data-where]").forEach(function (b) {
          if (b.getAttribute("data-where") === locFilter) b.classList.add("on");
          else b.classList.remove("on");
        });
      } catch (e) {}
    };
    $("wd-locfilter").addEventListener("change", function () { locFilter = this.value; syncWhere(); paintFeed(); });
    var _qd = el.querySelector("details.wd-sect");
    if (_qd) _qd.addEventListener("toggle", function () { try { questOpen = _qd.open; } catch (eQO) {} });
    rootEl.querySelectorAll("[data-where]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-where");
        if (W && W.mode === "player" && W.player && W.player.loc !== id && this.getAttribute("data-travel-arm") === "1") {
          this.removeAttribute("data-travel-arm");
          playerMoveTo(id); renderAll(); scrollFeed(); return;
        }
        if (W && W.mode === "player" && W.player && W.player.loc !== id) {
          this.setAttribute("data-travel-arm", "1");
          var self = this;
          setTimeout(function () { try { self.removeAttribute("data-travel-arm"); } catch (e) {} }, 2500);
          toast(WL() === "en" ? "Click again to travel to " + locName(id) + " (−6 energy)." : "Klik lagi untuk pergi ke " + locName(id) + " (−6 energi).");
        }
        locFilter = id;
        syncWhere(); paintFeed(); scrollFeed();
      });
      b.addEventListener("dblclick", function (ev) {
        try { ev.preventDefault(); } catch (e) {}
        var id = b.getAttribute("data-where");
        if (W && W.mode === "player" && W.player && W.player.loc !== id) { playerMoveTo(id); renderAll(); scrollFeed(); }
      });
    });
    var unf = $("wd-unfocus");
    if (unf) unf.addEventListener("click", function () { focusChar = null; renderCast(); renderStage(); });
    if (W.mode === "player") {
      var say = $("wd-say");
      var kindSel = $("wd-kind");
      var updPh = function () {
        if (!say || !kindSel) return;
        say.placeholder = (kindSel.value === "act")
          ? T("actPh", { name: W.player.name, ex: (effUi() === "id" ? "*pergi ke " : "*go to ") + exLoc })
          : T("sayPh", { name: W.player.name });
      };
      if (kindSel) kindSel.addEventListener("change", updPh);
      var go = function () { var t = say.value; say.value = ""; playerSend(t, $("wd-target").value, kindSel ? kindSel.value : "say"); };
      say.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); } });
      var sendB = $("wd-send");
      if (sendB) sendB.addEventListener("click", go);
      var tg = $("wd-target");
      if (tg) tg.addEventListener("change", function () { focusChar = (this.value !== "all" ? this.value : null); renderCast(); });
    } else {
      var nr = $("wd-narr");
      if (nr) nr.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          var t = nr.value.trim(); if (!t) return;
          nr.value = "";
          pushFeed({ kind: "system", loc: null, text: "📜 " + t });
          save(); paintFeed(); scrollFeed();
        }
      });
    }
    $("wd-ambient-btn").addEventListener("click", function () { W.ambient.on = !W.ambient.on; save(); renderStage(); });
    var rotB = $("wd-rot-btn");
    if (rotB) rotB.addEventListener("click", function () { normalizeWorld(); W.rot.on = !rotOn(); W.rot.last = W.rot.ticks || 0; save(); renderStage(); });
    $("wd-sim1").addEventListener("click", function () { ambientTurn(); });
    try { wireQuests(el); } catch (e) {}
    try { var _ib = $("wd-invbtn"); if (_ib) _ib.addEventListener("click", function () { openInventory(); }); } catch (eIB) {}
   try {
     var _g = $("wd-act-gather"); if (_g) _g.addEventListener("click", function () { tryRpgCommand("cari", null); });
     var _atk = $("wd-act-atk"); if (_atk) _atk.addEventListener("click", function () { if (busy) return; busy = true; renderStage(); if (W.encounter) doAttackPlayer(false); else doHunt(); busy = false; });
      var _spsel = $("wd-spell"); if (_spsel) _spsel.addEventListener("change", function () { try { W.player.spell = _spsel.value; save(); renderStage(); } catch (e) {} });
      var _mag = $("wd-act-mag"); if (_mag) _mag.addEventListener("click", function () { if (busy) return; busy = true; renderStage(); var _id = null; try { var _s = $("wd-spell"); _id = _s ? _s.value : (W.player.spell || null); } catch (e) {} doAttackPlayer(true, _id); busy = false; });
     var _fl = $("wd-act-flee"); if (_fl) _fl.addEventListener("click", function () { if (busy) return; busy = true; renderStage(); doFleePlayer(); busy = false; });
       var _s = $("wd-act-sleep"); if (_s) _s.addEventListener("click", function () { tryRpgCommand("tidur", null); });
      var _st = $("wd-act-status"); if (_st) _st.addEventListener("click", function () { tryRpgCommand("status", null); });
      el.querySelectorAll("[data-go]").forEach(function (b) { b.addEventListener("click", function (ev) { try { ev.stopPropagation(); } catch (e) {} var id = b.getAttribute("data-go"); if (W && W.mode === "player" && W.player && W.player.loc !== id) { playerMoveTo(id); renderAll(); scrollFeed(); } }); });
      el.querySelectorAll("[data-locimg]").forEach(function (b) { b.addEventListener("click", function (ev) { try { ev.stopPropagation(); } catch (e) {} locImageFor(b.getAttribute("data-locimg"), b); }); });
      el.querySelectorAll("[data-shop]").forEach(function (b) { if (b.closest && b.closest("#wd-shops")) return; b.addEventListener("click", function () { openShop(b.getAttribute("data-shop")); }); });
      try {
        if (window.WorldTiles && window.WorldTiles.mount && $("wd-tiles") && W && W.player && W.mode === "player") {
          window.WorldTiles.mount($("wd-tiles"), {
            W: W,
            active: function () { try { return window.__activeTab === "world" && wdTab === "adventure" && !!$("wd-tiles") && W && W.mode === "player"; } catch (eA) { return false; } },
            save: function () { try { save(); } catch (eS) {} },
            toast: toast,
            locName: locName,
            travelTo: function (locId) { try { if (W.player.loc !== locId) { playerMoveTo(locId); renderAll(); scrollFeed(); } } catch (eT) {} },
            talkTo: function (cid) { try { focusChar = (focusChar === cid ? null : cid); renderCast(); renderStage(); } catch (eT2) {} },
            shopOf: function (cid) { try { openShop(cid); } catch (eS2) {} },
            workFor: function (cid) {
              try {
                var _c = null;
                for (var _i = 0; _i < W.chars.length; _i++) if (W.chars[_i].id === cid) _c = W.chars[_i];
                if (_c && W.player && _c.loc !== W.player.loc) { toast(WL() === "en" ? "Go to " + locName(_c.loc) + " first." : "Ke " + locName(_c.loc) + " dulu."); return; }
                offerQuest(cid); renderAll(); scrollFeed();
              } catch (eW) {}
            },
            onTileStep: function (tile) { try { doStepEncounter(tile); } catch (eD) {} },
            // Dipanggil tiap langkah biasa: refresh RINGAN bar dagang saja
            // (tanpa render ulang panggung → tidak kelap-kelip).
            refreshNearby: function () { try { paintShopRow(); } catch (eRN) {} }
          });
        } else if ($("wd-tiles")) { $("wd-tiles").innerHTML = ""; }
      } catch (eTiles) {}
    } catch (e) {}
  }
  function paintFeed() {
    var feed = $("wd-feed"); if (!feed || !W) return;
    var god = isGod();
    var list = W.feed.slice();
    feed.innerHTML = list.slice(-80).map(function (m) {
      var far = (locFilter !== "all" && m.loc && m.loc !== locFilter);
      var farCls = far ? " wd-far" : "";
      var farPre = far ? "<span class='wd-farpre'>" + esc(T("farHeard")) + " @" + esc(locName(m.loc)) + " — </span>" : "";
      if (m.kind === "system") return "<div class='wd-msg sys" + farCls + "'>" + farPre + "[" + esc(m.loc ? locName(m.loc) : (WL() === "en" ? "world" : "dunia")) + "] " + esc(m.text) + (m.img ? "<img src='" + m.img + "'>" : "") + "</div>";
      if (m.kind === "god") return "<div class='wd-msg godmsg'><span class='wd-who'>" + T("godWho") + "</span><br>" + esc(m.text) + "</div>";
      var mine = !!m.mine;
      var cls = mine ? (m.act ? " mineAct" : " mine") : "";
      return "<div class='wd-msg" + cls + farCls + "'>" + farPre + "<span class='wd-who'>" + esc(m.who) + (m.act ? " 🎭" : "") + "</span> <span class='wd-locpill'>" + esc(locName(m.loc)) + "</span><br>" + esc(m.text).replace(/\n/g, "<br>") +
        (m.img ? "<img src='" + m.img + "'>" : "") +
        (god ? "<div class='wd-mrow'><button class='wd-mini' data-imgmsg='" + m.id + "' type='button'>" + T("bDraw") + "</button></div>" : "") + "</div>";
    }).join("") || "<div class='wd-hint'>" + T("feedEmpty") + "</div>";
    feed.querySelectorAll("[data-imgmsg]").forEach(function (b) {
      b.addEventListener("click", function () { if (needGod("Illustrating messages")) return; imageForMsg(b.getAttribute("data-imgmsg"), b); });
    });
  }
  function addStreamingBubble(charObj, placeholder) {
    var feed = $("wd-feed");
    if (!feed) return null;
    try { if (charObj && charObj.id) { liveTyping[charObj.id] = true; paintStatusDom(charObj.id); } } catch (e) {}
    var d = document.createElement("div");
    d.className = "wd-msg";
    d.innerHTML = "<span class='wd-who'>" + esc(charObj ? charObj.name : "🌩️") + "</span><br><span class='wd-stream'>" + esc(placeholder || T("typing")) + "</span>";
    feed.appendChild(d);
    feed.scrollTop = feed.scrollHeight;
    return d.querySelector(".wd-stream");
  }
  function scrollFeed() { var f = $("wd-feed"); if (f) f.scrollTop = f.scrollHeight; }

  /* ----- god + timeline ----- */
  function renderGod() {
    var el = paneEl("god"); if (!el || !W) return;
    if (W.mode !== "god") { el.innerHTML = "<div class='wd-card'><h3>" + T("godLocked") + "</h3><div class='wd-hint'>" + T("godLockedHint") + "</div></div>"; return; }
    try { var _oldLog = $("wd-godlog"); if (_oldLog && _oldLog.innerHTML) savedGodLogHtml = _oldLog.innerHTML.slice(-8000); } catch (e) {}
    try { var _oldCmd = $("wd-godcmd"); if (_oldCmd && !busy) savedGodCmd = _oldCmd.value; } catch (eCmd) {}
    el.innerHTML =
      "<div class='wd-card'><h3>" + T("godTitle") + "</h3><div class='wd-hint'>" + T("godSub") + "</div>" +
      "<div id='wd-godstatus' class='wd-godstatus' hidden></div>" +
      "<div id='wd-godlog' style='max-height:26vh;overflow-y:auto;margin:0.4rem 0;'></div>" +
      "<textarea id='wd-godcmd' class='wd-ta' placeholder='" + esc(T("godPh")) + "'></textarea>" +
      "<div class='wd-row'><button id='wd-godask' class='wd-btn' type='button'>" + T("bDiscuss") + "</button><button id='wd-godrun' class='wd-btn go' type='button'>" + T("bRun") + "</button></div></div>" +
      "<div class='wd-card'><h3>" + T("worldCard") + "</h3><div class='wd-hint'>" + T("worldSub") + "</div>" +
      "<div class='wd-hint' id='wd-worldline' style='margin:0.35rem 0;'>" + esc(clockLine()) + "</div>" +
      "<div class='wd-row'><button id='wd-phase' class='wd-btn' type='button'>" + T("bPhase") + "</button></div>" +
      "<label class='wd-lbl'>" + T("fWeather") + "</label><select id='wd-wx' class='wd-sel'>" + WX_IDS.map(function (k) { return "<option value='" + k + "'" + (wxKind() === k ? " selected" : "") + ">" + WX_L[k].emoji + " " + esc(wxNameUI(k)) + "</option>"; }).join("") + "</select>" +
      "<label class='wd-lbl'>" + T("fCond") + "</label><div class='wd-row'><select id='wd-condloc' class='wd-sel'>" + W.locations.map(function (l) { return "<option value='" + l.id + "'>" + esc(l.name) + (l.cond ? " (" + esc(l.cond) + ")" : "") + "</option>"; }).join("") + "</select><input id='wd-cond' class='wd-in' maxlength='80' placeholder='" + esc(T("condPh")) + "'><button id='wd-condset' class='wd-btn' type='button'>" + T("bSetCond") + "</button></div>" +
      "<label class='wd-lbl'>" + T("itemsTitle") + "</label><div class='wd-row'><select id='wd-itemwho' class='wd-sel'><option value='__player'>🧍 " + esc(W.player.name) + "</option>" + W.chars.map(function (c) { return "<option value='" + c.id + "'>" + esc(c.name) + "</option>"; }).join("") + "</select><input id='wd-item' class='wd-in' maxlength='40' placeholder='" + esc(T("itemPh")) + "'><button id='wd-give' class='wd-btn go' type='button'>" + T("bGive") + "</button></div>" +
      "<div id='wd-itemlist' style='margin-top:0.4rem;'></div></div>" +
      "<div class='wd-card'><h3>" + T("manageTitle") + "</h3><div class='wd-hint'>" + T("manageSub") + "</div><div id='wd-npcmanage'></div>" +
      (W.chars.length < MAX_CHARS ?
        "<details><summary style='cursor:pointer;font-size:0.83rem;'>" + T("addNpc") + "</summary>" +
        "<label class='wd-lbl'>" + T("cName") + "</label><input id='wd-c-name' class='wd-in' maxlength='30' placeholder='" + esc(T("cNamePh")) + "'>" +
        "<label class='wd-lbl'>" + T("cRole") + "</label><input id='wd-c-role' class='wd-in' maxlength='40' placeholder='" + esc(T("cRolePh")) + "'>" +
        "<label class='wd-lbl'>" + T("cPers") + "</label><input id='wd-c-pers' class='wd-in' maxlength='160' placeholder='" + esc(T("cPersPh")) + "'>" +
        "<div class='wd-row'><button id='wd-c-add' class='wd-btn go' type='button'>" + T("bAdd") + "</button><button id='wd-c-auto' class='wd-btn' type='button'>" + T("bAuto") + "</button><button id='wd-c-roster' class='wd-btn' type='button'>" + T("bRoster") + "</button></div>" +
        "<div class='wd-hint'>" + T("autoHint") + "</div>" +
        "<div id='wd-rosterbox'></div></details>"
        : "<div class='wd-hint'>" + T("castFull", { n: MAX_CHARS }) + "</div>") + "</div>" +
      "<div class='wd-card'><h3>" + T("tlTitle") + "</h3><div id='wd-cplist'></div>" +
      "<div class='wd-row'><button id='wd-ff1' class='wd-btn' type='button'>" + T("bFf1") + "</button><button id='wd-ff7' class='wd-btn' type='button'>" + T("bFf7") + "</button></div>" +
      "<div id='wd-arch'></div></div>" +
      "<div class='wd-card'><h3>" + T("exTitle") + " (" + ((W.exResidents || []).length) + ")</h3><div id='wd-exlist'></div></div>";
    try { if (savedGodLogHtml && $("wd-godlog")) { $("wd-godlog").innerHTML = savedGodLogHtml; $("wd-godlog").scrollTop = $("wd-godlog").scrollHeight; } } catch (e2) {}
    try { if (savedGodCmd && $("wd-godcmd") && !$("wd-godcmd").value) $("wd-godcmd").value = savedGodCmd; } catch (e3) {}
    paintGodBusy();
    renderGodState();
    wireGodLogButtons();
    (function () {
      var ta = $("wd-godcmd");
      if (ta) ta.addEventListener("input", function () { try { if (!busy) savedGodCmd = ta.value; } catch (e) {} });
    })();
    $("wd-godask").addEventListener("click", function () { var c = $("wd-godcmd").value; $("wd-godcmd").value = ""; savedGodCmd = ""; godDiscuss(c); });
    $("wd-godrun").addEventListener("click", function () { var c = $("wd-godcmd").value; $("wd-godcmd").value = ""; savedGodCmd = ""; godRun(c, false); });
    $("wd-ff1").addEventListener("click", function () { fastForward(1); });
    $("wd-ff7").addEventListener("click", function () { fastForward(7); });
    renderNpcManage();
    wireWorldCard();
    var addB = $("wd-c-add");
    if (addB) addB.addEventListener("click", function () {
      if (needGod("Adding NPCs")) return;
      var nm = $("wd-c-name").value.trim().slice(0, 30);
      if (!nm) { toast(T("needName")); return; }
      var roleIn = $("wd-c-role").value.trim().slice(0, 40);
      var persIn = $("wd-c-pers").value.trim().slice(0, 160);
      var thin = !roleIn || !persIn;
      var at = (W.locations[0] && W.locations[0].id) || null;
      var nc = { id: uid("c"), name: nm, role: roleIn || C("roleDef"), personality: persIn || C("persDef"), goal: "-", desc: "", loc: at, avatar: "", affinity: 0, mems: [], act: "", actTs: 0, items: [] };
      W.chars.push(nc);
      pushFeed({ kind: "system", loc: at, text: C("spawnBare", { name: nm, loc: locName(at) }) });
      save(); renderAll(); scrollFeed();
      if (thin) {
        toast(T("thinToast", { name: nm }));
        enrichChar(nc.id).then(function () { try { portraitFor(nc.id, null, true); } catch (e) {} });
      } else { try { portraitFor(nc.id, null, true); } catch (e) {} }
    });
    var autoB = $("wd-c-auto");
    if (autoB) autoB.addEventListener("click", function () { if (needGod("Auto NPC")) return; autoGenChar(this); });
    var rb = $("wd-c-roster");
    if (rb) rb.addEventListener("click", async function () {
      if (needGod("Roster import")) return;
      var box = $("wd-rosterbox");
      box.innerHTML = "<div class='wd-hint'>" + T("readingRoster") + "</div>";
      try {
        var list = [];
        if (window.Characters && window.Characters.list) list = await window.Characters.list();
        else if (window.Vault && window.Vault.list) list = [];
        if (!list.length && window.ChatEngine && window.ChatEngine.loadPersonas) list = await window.ChatEngine.loadPersonas();
        list = (list || []).filter(function (p) { return p && (p.name || p.description); }).slice(0, 20);
        if (!list.length) { box.innerHTML = "<div class='wd-hint'>" + T("rosterEmpty") + "</div>"; return; }
        box.innerHTML = "<label class='wd-lbl'>" + T("rosterPick") + "</label><select id='wd-ros-sel' class='wd-sel'>" + list.map(function (p, i) { return "<option value='" + i + "'>" + esc(p.name || ((WL() === "en" ? "Character " : "Karakter ") + (i + 1))) + "</option>"; }).join("") + "</select><div class='wd-row'><button id='wd-ros-add' class='wd-btn go' type='button'>" + T("rosterAdd") + "</button></div>";
        box.querySelector("#wd-ros-add").addEventListener("click", function () {
          if (needGod("Adding from roster")) return;
          var p = list[Number(box.querySelector("#wd-ros-sel").value) || 0];
          if (!p) return;
          var d = String(p.description || p.text || "").slice(0, 900);
          var at = (W.locations[0] && W.locations[0].id) || null;
          var rnm = String(p.name || (WL() === "en" ? "Character" : "Karakter")).slice(0, 30);
          W.chars.push({ id: uid("c"), name: rnm, role: C("roleGuest"), personality: d.slice(0, 160) || (WL() === "en" ? "Mysterious." : "Misterius."), goal: "-", desc: d, loc: at, avatar: p.avatar || p.image || "", affinity: 0, mems: [], act: "", actTs: 0, items: [] });
          pushFeed({ kind: "system", loc: at, text: C("spawnBare", { name: rnm, loc: locName(at) }) });
          save(); renderAll(); scrollFeed();
        });
      } catch (e) { box.innerHTML = "<div class='wd-hint'>⚠️ " + esc(String(e && e.message || e).slice(0, 100)) + "</div>"; }
    });
  }
  function wireWorldCard() {
    if (!W || W.mode !== "god") return;
    var ph = $("wd-phase");
    if (ph) ph.addEventListener("click", function () { if (needGod("Changing time")) return; nextPhase(); renderAll(); scrollFeed(); });
    var wx = $("wd-wx");
    if (wx) wx.addEventListener("change", function () { if (needGod("Changing weather")) { renderGod(); return; } setWeather(wx.value); });
    var cs = $("wd-condset");
    if (cs) cs.addEventListener("click", function () {
      if (needGod("Editing conditions")) return;
      var lid = $("wd-condloc") ? $("wd-condloc").value : null;
      var v = $("wd-cond") ? $("wd-cond").value.trim().slice(0, 80) : "";
      for (var i = 0; i < W.locations.length; i++) if (W.locations[i].id === lid) W.locations[i].cond = v;
      save(); renderAll(); scrollFeed();
    });
    var gv = $("wd-give");
    if (gv) gv.addEventListener("click", function () {
      if (needGod("Managing items")) return;
      var who = $("wd-itemwho") ? $("wd-itemwho").value : null;
      var v = $("wd-item") ? $("wd-item").value.trim() : "";
      if (!v) return;
      if (giveItem(who, v)) { if ($("wd-item")) $("wd-item").value = ""; renderAll(); }
    });
    var box = $("wd-itemlist");
    if (box) {
      var rows = [];
      var all = [{ id: "__player", name: "🧍 " + (W.player ? W.player.name : ""), items: (W.player && W.player.items) || [] }].concat(W.chars.map(function (c) { return { id: c.id, name: c.name, items: c.items || [] }; }));
      all.forEach(function (o) {
        groupItems(o.items || []).forEach(function (g) {
          rows.push("<div class='wd-cp'>🎒 <b>" + esc(o.name) + "</b>: " + esc(g.name) + (g.n > 1 ? " <span class='wd-hint'>×" + g.n + "</span>" : "") + " <button class='wd-mini' data-take='" + o.id + "|" + esc(g.name) + "' title='" + esc(T("itemDel")) + "' type='button'>✕</button></div>");
        });
      });
      box.innerHTML = rows.join("") || "<div class='wd-hint'>" + T("noItems") + "</div>";
      box.querySelectorAll("[data-take]").forEach(function (b) {
        b.addEventListener("click", function () {
          if (needGod("Managing items")) return;
          var p = String(b.getAttribute("data-take") || "").split("|");
          if (takeItem(p[0], p.slice(1).join("|"))) renderAll();
        });
      });
    }
  }
  function renderNpcManage() {
    var box = $("wd-npcmanage"); if (!box || !W) return;
    box.innerHTML = W.chars.map(function (c) {
      return "<div class='wd-char' data-cid='" + c.id + "'>" +
        "<div class='wd-chead'><div class='wd-av'>" + (c.avatar ? "<img src='" + c.avatar + "'>" : esc(c.name.slice(0, 1))) + "</div>" +
        "<div><div class='wd-cname'>" + esc(c.name) + (c.pinned ? " " + T("pinned") : "") + "<span class='wd-locpill'>" + esc(locName(c.loc)) + "</span></div>" +
        "<div class='wd-csub'>" + esc(c.role) + " · " + esc(stageOf(c.affinity)) + " (" + c.affinity + ")</div></div></div>" +
        "<div class='wd-row'><select class='wd-sel' data-gloc style='flex:1;min-width:110px;'>" + W.locations.map(function (l) { return "<option value='" + l.id + "'" + (c.loc === l.id ? " selected" : "") + ">" + esc(l.name) + "</option>"; }).join("") + "</select></div>" +
        "<div class='wd-row'><button class='wd-btn' data-gpro type='button'>" + T("bProfile") + "</button><button class='wd-btn' data-gpor type='button'>" + T("bPortrait") + "</button><button class='wd-btn' data-gpin type='button'>" + (c.pinned ? T("unpin") : T("pin")) + "</button><button class='wd-btn' data-gdel type='button'>" + T("bDelete") + "</button></div></div>";
    }).join("") || "<div class='wd-hint'>" + T("noNpc") + "</div>";
    box.querySelectorAll(".wd-char").forEach(function (card) {
      var id = card.getAttribute("data-cid");
      card.querySelector("[data-gloc]").addEventListener("change", function () { if (needGod("Moving NPCs")) { renderNpcManage(); return; } moveChar(id, this.value); });
      card.querySelector("[data-gpro]").addEventListener("click", function () { if (needGod("NPC profile editing")) return; enrichChar(id, this); });
      card.querySelector("[data-gpor]").addEventListener("click", function () { if (needGod("Portrait generation")) return; try { imgBusy[id] = false; portraitFor(id, this, true); } catch (e) {} });
      var pinB = card.querySelector("[data-gpin]");
      if (pinB) pinB.addEventListener("click", function () { var c = charById(id); if (!c) return; c.pinned = !c.pinned; save(); renderNpcManage(); renderCast(); });
      card.querySelector("[data-gdel]").addEventListener("click", async function () {
        if (needGod("Removing NPCs")) return;
        var c = charById(id); if (!c) return;
        var ok = true;
        try { ok = await window.uiConfirm(T("delConfirm", { name: c.name }), { okText: T("delOk"), danger: true }); } catch (e) {}
        if (!ok) return;
        normalizeWorld();
        W.exResidents.unshift({ name: c.name, role: c.role, personality: c.personality, goal: c.goal, desc: c.desc, avatar: c.avatar || "", affinity: 0, ts: Date.now(), why: "" });
        while (W.exResidents.length > EX_MAX) W.exResidents.pop();
        W.chars = W.chars.filter(function (x) { return x.id !== id; });
        if (focusChar === id) focusChar = null;
        pushFeed({ kind: "system", loc: null, text: C("leave", { name: c.name }) });
        save(); renderAll(); scrollFeed();
      });
    });
  }
  function renderGodState() {
    var cp = $("wd-cplist"); if (!cp || !W) return;
    cp.innerHTML = W.checkpoints.slice().reverse().map(function (c) {
      return "<div class='wd-cp'>📌 " + esc(c.label) + "<br><span class='wd-hint'>" + new Date(c.ts).toLocaleString() + "</span> <button class='wd-mini' data-back='" + c.id + "' type='button'>" + T("bBack") + "</button></div>";
    }).join("") || "<div class='wd-hint'>" + T("noCp") + "</div>";
    cp.querySelectorAll("[data-back]").forEach(function (b) { b.addEventListener("click", function () { timeBack(b.getAttribute("data-back")); }); });
    var ar = $("wd-arch");
    if (ar && W.archived && W.archived.length) {
      ar.innerHTML = "<label class='wd-lbl'>" + T("archTitle") + "</label>" + W.archived.map(function (a) { return "<details><summary style='cursor:pointer;font-size:0.78rem;'>" + esc(a.label) + "</summary><div class='wd-hint' style='white-space:pre-wrap;'>" + esc(a.text) + "</div></details>"; }).join("");
    }
    var ex = $("wd-exlist");
    if (ex) {
      var list = (W.exResidents || []);
      ex.innerHTML = list.length ? list.map(function (e, i) {
        return "<div class='wd-cp'>🧳 <b>" + esc(e.name) + "</b> <span class='wd-hint'>" + esc(e.role || "") + (e.why ? " · " + esc(e.why) : "") + "</span> <button class='wd-mini' data-exback='" + i + "' type='button'>" + T("exBack") + "</button></div>";
      }).join("") : "<div class='wd-hint'>" + T("exEmpty") + "</div>";
      ex.querySelectorAll("[data-exback]").forEach(function (b) {
        b.addEventListener("click", function () {
          if (needGod("Adding NPCs")) return;
          var li = (W.exResidents || [])[Number(b.getAttribute("data-exback"))];
          if (!li) return;
          if (W.chars.length >= MAX_CHARS) { toast(T("castFullT", { n: MAX_CHARS })); return; }
          var at = (W.locations[0] && W.locations[0].id) || null;
          W.chars.push({ id: uid("c"), name: li.name, role: li.role || C("roleDef"), personality: li.personality || C("persDef"), goal: li.goal || "-", desc: li.desc || "", loc: at, avatar: li.avatar || "", affinity: 0, mems: [], pinned: false, act: "", actTs: 0, items: [] });
          pushFeed({ kind: "system", loc: at, text: C("comeBack", { name: li.name, role: li.role || C("roleDef"), loc: locName(at), reason: li.why || "" }) });
          save(); renderAll(); scrollFeed();
          try { var nc = W.chars[W.chars.length - 1]; if (!nc.avatar) portraitFor(nc.id, null, true); } catch (e) {}
        });
      });
    }
    var ask = $("wd-godask"), run = $("wd-godrun");
    if (ask) ask.disabled = busy;
    if (run) run.disabled = busy;
  }

  /* ----- boot ----- */
  async function onShow() {
    injectCss();
    if (!rootEl) rootEl = $("world-app");
    if (!rootEl) return;
    if (!built) {
      built = true;
      rootEl.innerHTML = "<div class='wd-card'>" + T("boot") + "</div>";
      await load();
      shell();
      renderAll();
      setInterval(function () {
        try {
          if (!W || !W.ambient.on || busy || document.hidden) return;
          if (window.__activeTab !== "world") return;
          if (Date.now() - lastAct > (W.ambient.secs || 75) * 1000) ambientTurn();
        } catch (e) {}
      }, 10000);
      lastAct = Date.now();
    } else renderAll();
  }

  window.__worldOnShow = onShow;
  window.WorldSim = { get world() { return W; }, achList: function () { try { return achList(); } catch (e) { return []; } }, save: function () { try { save(); } catch (e) {} }, reload: async function () { await load(); renderAll(); } };
})();
