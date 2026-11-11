# Feature registry — the anti-orphan system

Every shipped `src/*.js` file must be loadable AND observably wired. History: the
⛶ Fullscreen hub button (`src/appfs.js`), the ☰ Menu button (`src/allmenu.js`),
chat notifications (`src/chat-notify.js`), the community upload cap
(`src/community-cap.js`) and the old Liquidizer boot (`src/liquidizer-tab.js`,
since deleted) all sat in `src/` fully written but never loaded or never called —
invisible in the shipped app, with docs sometimes claiming otherwise.

## Standing orders (human and AI editors alike)

1. **New `src/*.js` file → three things, same change:** a loader (static
   `<script>` tag or an `ensure*()` + call site), a row in the registry below,
   and a liveness probe in `src/orphan-guard.js` (for boot-loaded scripts) or
   `src/dev-audit.js` (for lazy tab scripts). New static `<script>` tags go
   BEFORE the `src/orphan-guard.js` tag (it must stay last — it snapshots the
   static script list at parse time).
2. **New wiring into an existing feature** (a hook call, a consumer, a button)
   gets verified live in the preview before the task counts as done.
3. **After every change, run the audit** (below) and confirm zero failures and a
   clean console. `src/dev-audit.js` is `page_eval`-only — never `<script>` it.
4. **Never inject `<input>`/`<select>`/`<textarea>` elements inside the
   framework inputs container** (`#userInputsCtn8462746262`): its init binder
   assigns `_element` for every such element it finds and throws on foreign
   ones, aborting binding for all inputs after them. Custom panels go AFTER
   the container, never inside it.

## Registry

| File | Loaded by | Wiring / consumer | Liveness probe |
| --- | --- | --- | --- |
| `src/avatar-media.js` | static tag (gen tab) | `src/gallery.js` via `window.AvatarMedia` | `AvatarMedia.thumbHtml` |
| `src/framework-input-shim.js` | static tag (gen tab) | framework inputs | `window.__fireFrameworkInput` |
| `src/custom-styles.js` | static tag (gen tab) | `customStylesPrompt()`/`customStylesNames()` in main.pjs; 🧪 tryout scratch entries via `t2iCS_tryout` (Use/Save/Delete + ⤵ Forged Styles pull); Import accepts panel backups + Style Forge JSON (single/`styles[]`/array); ✅ live "in use" box + header state with per-style ✕ | `#t2iCustomStyles` (+ `#t2iCSTryout`) |
| `src/gen-reset.js` | static tag (gen tab) | ↺ Reset-all button under the mode bar (`window.t2iResetImageGenerator`): dropdowns → off/default, texts/seed/adv/custom-slots/age/scratchpad cleared, Username + Signature kept | `#gen-reset-btn` |
| `src/artstyle-search.js` | static tag (gen tab) | 🔍 filter boxes above EVERY gen-tab dropdown with 25+ options (Art Styles 1–5, Character, mixers, clause selects — Enter picks first match, Esc restores) | `#i2p-imggen .as-input` |
| `src/section-favorites.js` | static tag (gen tab, after artstyle-search) | ⭐ per-section favorites: ☆/★ button beside EVERY gen-tab dropdown pins the pick to the top of its list (`localStorage.t2iSectionFavsV1`); search filter + ↺ reset stay canonical-aware | `window.__sectionFavs` + `#i2p-imggen .sf-btn` |
| `src/style-hints.js` | static tag (gen tab) | 🎨 hover tooltips (`option.title`) for every Art Style option + node descriptions | `window.__styleHintsPaint` |
| `src/gg-data.js` | static tag | trait options for the Flux tab merge (`GGDATA`, via `src/flux/girls.js`) | `window.GGDATA` |
| `src/gg-character-data.js` | static tag | Bestaigen trait options for the Flux tab merge (`GGCHARACTER`, via `src/flux/girls.js`) | `window.GGCHARACTER` |
| `src/girls-generator.js` | static tag | trait-engine backend for the Flux tab merge (`GirlsGenerator.helpers`; standalone tab deleted) | `GirlsGenerator.render` |
| `src/flux/loader.js` | lazy (`ensureFlux`, private 🐺 tab `src:`) | Flux tab chain-loader: css + prompt/boxes/std/photo/girls/tab in order | `window.__fluxLoaded` |
| `src/flux/prompt.js` | lazy (via `flux/loader.js`) | Flux tab prompt compose (style/test selects, fine-tune, girls-traits merge) | `FluxPrompt.compose` |
| `src/flux/tab.js` | lazy (via `flux/loader.js`) | Private tab native embed (`render:"FluxTab"`) | `FluxTab.render` |
| `src/flux/boxes.js` | lazy (via `flux/loader.js`) | Flux tab prompt-tool motherboards (`__fluxBoxesInit`, on-demand in Flux tab) | `window.__fluxBoxesInit` |
| `src/flux/std.js` | lazy (via `flux/loader.js`) | Flux tab standard chip rows (`__fluxStdInit`, on-demand in Flux tab) | `window.__fluxStdInit` |
| `src/flux/photo.js` | lazy (via `flux/loader.js`) | Flux tab photo lab (`FluxPhoto.render`, on-demand in Flux tab) | `FluxPhoto.render` |
| `src/flux/girls.js` | lazy (via `flux/loader.js`) | Flux tab Girls-traits merge (`FluxGirls.render`/`extra`, on-demand in Flux tab) | `FluxGirls.render` |
| `src/liquidizer/loader.js` | static tag | Private tab native embed (`render:"LiquidizerTab"`) | `LiquidizerTab.render` |
| `src/private-tab.js` | static tag | owner-gated Private tab | `window.PrivateTabs` |
| `src/owner-tab.js` | static tag | owner-gated Owner tab (`ensureOwnerTab`) | `window.ensureOwnerTab` |
| `src/chat-notify.js` | static tag (before SharedComm) | `commDefaults()` wraps `defaultCommentOptions` in SharedComm boot; owner broadcasts also ping opted-in devices | bells in the 💬 pop-up head (`#comm-pop-head`, auto-added) + legacy hidden inline heads |
| `src/owner-notify.js` | static tag (after chat-notify) | owner-gated device-notification section injected into the 🔒 Owner console (👑 watch toggle, OS-permission + test pings) | `window.__t2iOwnerNotifySync` + `#t2i-owner-notifysec` |
| `src/chat-gen.js` | static tag (after owner-notify, before SharedComm) | community-chat generations: owner-gated reset-all via `-g<N>` channel suffixes + hot-swap; owner Reset section in 🔒 Owner console | `window.ChatGen` + `#t2i-owner-chatgensec` |
| `src/media-player.js` | static tag | 🎵 Music hub button + media-player panel (playlist from links, tag reads, mini-pill) | `window.musicPlayer` + `#mp-hub-btn` |
| `src/backgrounds-hub.js` | static tag | 🖼️ Backgrounds hub button + site-backgrounds panel (`#bgSiteLayer`) | `window.siteBackgrounds` + `#bg-hub-btn` |
| `src/orphan-guard.js` | static tag | self-running boot tripwire | `window.__orphanGuardRecheck` |
| `src/vault.js` | boot `setTimeout(ensureVault, 350)` | vault/roster/palette/backup callers | `window.Vault` |
| `src/allmenu.js` | boot `setTimeout(ensureAllmenu, 350)` | ☰ Menu hub button | `#i2p-menu-btn` |
| `src/appfs.js` | chained from `ensureAllmenu` | ⛶ Fullscreen hub button | `window.__appFs` + `#i2p-fs-btn` |
| `src/community-cap.js` | boot `setTimeout(ensureCommunityCap, 350)` | `src/explore.js` + `src/imager-pro.js` post flows | `CommunityCap.canPost` |
| `src/gallery.js` | `ensureGallery()` (gen/Pro/AI-Photo/Comic tabs, bg restore) | gallery modal, persona autosave, bg | `window.t2iOpenGallery` |
| `src/gen-extras.js` | `ensureGenExtras()` (gen/Pro tabs) | workbench, inspector, autosave (batch attachment removed) | `window.t2i_autosavePersonaPrompt` |
| `src/convert-panel.js` | chained in `ensureGenExtras()` after gen-extras | 🔄 Convert panel above the generate button (Basic/Advanced): freezes description + sections into an editable box; ticked box sends via `t2iFinalPrompt()` in main.pjs; ↺ reset unticks + clears | `#convert-panel` |
| `src/gen-persona-ui.js` | chained last in `ensureGenExtras()` | clean 🎭 persona/chat overlay for the framework's per-image panel | `t2i_openCharacterDescriptionEditor.__t2iPcCleanWrapped` |
| `src/persona.js` | `ensurePersona()` / gen-extras / board chains | persona engine | persona tones/options |
| `src/persona-tab.js` | `ensurePersona()` | Persona tab (`__personaOnShow`) | `window.__personaOnShow` |
| `src/persona-board.js` | `ensureBoard()` | Board tab (`__boardOnShow`) | `window.__boardOnShow` |
| `src/evo.js` | `ensureEvo()` | Evo tab (`evoSetVisible`) | `window.evoSetVisible` |
| `src/editor.js` | `ensureEditor()` | Image Editor tab (`__editorOnShow`) | `window.__editorOnShow` |
| `src/aiedit.js` | `ensureAiedit()` | AI Photo Editor tab (`__aieditOnShow`) | `window.__aieditOnShow` |
| `src/comicscan.js` | `ensureComic()` | Comic tab (`__comicOnShow`) | `window.__comicOnShow` |
| `src/explore.js` | `ensureExplore()` | Explore tab (`__exploreOnShow`) | `window.__exploreOnShow` |
| `src/explore-importer.js` | `ensureExplore()` | importer (with explore.js) | loads alongside explore |
| `src/imager-pro.js` | `ensureProApp()` | Pro tab (`__proBoot`) | `window.__proBoot` |
| `src/imager-pro-themes.js` | injected on Theme open | Theme packs (`window.IMAGER_PRO_THEMES`) | `window.IMAGER_PRO_THEMES` |
| `src/social-convert.js` | `ensureSocialConvert()` (Social tab) | converter (`__socialConvertOnShow`) | `window.__socialConvertOnShow` |
| `src/emoji-browser.js` | `ensureEmojiBrowser()` (gen/Pro tabs, 😀 clicks) | emoji browser | loads on demand |
| `src/name-data.js` + `src/name-roller.js` | `ensureNameRoller()` | name roller | loads on demand |
| `src/ai-helper.js` | `ensureHelper()` (More group 🤖 AI Helper tab) | helper tab (`__helperOnShow` / `Helper.render`); directory + AI chat + persona/image builders, PromptBridge/Vault send | `window.__helperOnShow` + `#helper-app` |
| `src/chat-engine.js` | `ensureChatEngine()` (loaded before skins) | THE local brain: kv threads (`t2iRoleplay`), numeric affinity + `<bond:±N>`/heuristic, keyword memory DB (`mems[]`, auto-extract, strong/weak recall), rolling summary, prefix-cache prompts, `send()` pipeline + `stop()` | `window.ChatEngine` |
| `src/aichat-classic.js` (built from `src/aichat-classic-src.js` + old static CSS; never edit build) | `ensureClassic()` (💬 AI Chat tab → `#classic-host`, shadow DOM) | classic-look skin over `ChatEngine` (threads/characters/feed/input/regen/memory popup); `__classicOpenWith` + `__classicAddCharacter` (old share-fragment) handoffs | `window.__classicOnShow` + `#classic-host` |
| `src/style-forge.js` | lazy on first forge-tab open (`ensureForge()` in index.html) | public 🧪 Style Forge tab (`#forge-app`); writes forged pairs into Custom Art Styles storage (`t2iCS_data`, “Forged Styles” tab); bulk `.zip`/`.cbz` import via pinned `@zip.js/zip.js` esm.sh lazy import; multi-file mixed drops with import summary; library JSON export-all + multi-style import; in-place edit (Load → 💾 Save) + versioned 🧬 Evolve with new images | `StyleForge.render` |
| `src/worldsim.js` | lazy via ensureWorld (world tab) | `__worldOnShow` render; WorldSim state; setup/cast/stage/god/timeline; NPC auto AI (profil + portrait otomatis); style gambar selectable (6 opsi, DIKUNCI saat build); cast display-only (Ngobrol+Ingatan lihat saja); semua ubah NPC hanya via Panel Dewa (Kelola NPC: pindah/profil/hapus + Datangkan NPC); pakaian prompt sesuai genre; god/fast-forward boleh spawn newChars; rotasi otomatis in/out (alasan in-world, user bukan MC, max 6, arsip exResidents + pin); relasi NPC-NPC (bonds terarah), mood + gosip menyebar (rumors); presentasi D: bar siapa-di-mana (klik=filter, double=travel −6 energi; ikon ⚠️/🛏️/🏪), status live (typing/aktivitas/lokasi), feed jauh redup; jam C: clock hari+fase (auto tiap 2 turn + dewa ⏭/PATCH/fast-forward), cuaca global (drift + dewa select/PATCH), kondisi lokasi (dewa/PATCH, tampil di setup+prompt), inventory mini (NPC+player, dewa beri/hapus/PATCH, tampil di kartu+prompt); dropdown Bahasa dunia default mengikuti UI + hint penjelas (anti-jebakan UI-ID vs dunia-EN); isian form dipertahankan saat toggle UI (tidak me-reset diam-diam); GAME V2: Lv/XP/Rank (E→S, need 20×Lv; gather+4/serabutan+6/quest+15/kill+XP), combat (monster per lokasi bahaya + scaling hari, serang/sihir-20-mana/kabur, menang=koin+loot+XP, kalah=pingsan pulang), encounter card + action bar, travel cost + 20% ambush, HUD Lv·XP·kill·tujuan, dagang/quest wajib tatap muka, AI dikasih tau level/senjata/encounter; MAP V1: kartu lokasi bergambar (lazy 🎨 + auto lokasi aktif; tersimpan l.img) + badge/okupan/marker KAMU + travel klik-ganda, gambar monster auto per spesies (cache monImgs max 12) di encounter card; kv `t2iWorld`/`active` | `__worldOnShow` + `#world-app` |
| `src/world/tiles.js` | lazy via `ensureWorld` (after worldsim) | 9x7 tile grid in Stage (`#wd-tiles`): WASD/arrows + tap + d-pad, exits trigger travel, adjacent NPC talk/shop/work buttons | `window.WorldTiles.mount` |
| `src/dev-audit.js` | **never shipped-loaded** — `page_eval` only | this audit | n/a (tool, not feature) |
| `src/moderation.js` | static tag (before avatar-media) | shared gallery child-safety match + owner-managed rules (`__t2iMod`, `__t2iModMatch`, `__t2iModLoad`, `__t2iModSave`) | `window.__t2iMod` |
| `src/mod-review.js` | lazy from owner console (`refreshStats` anchor, only while unlocked) | owner-gated flagged-image review queue (allow / ban user / **unban user** / ban phrase + banned-users manager) | `window.__modReviewEnsure` |
| `src/liquidizer/*` (app, engine, models, …) | `src/liquidizer/loader.js` | Liquidizer studio | via `LiquidizerTab.render` |

## The audit (run after every change)

**1. Static orphan scan** — every `src/*.js` must be referenced by a loader.
Run in `execute_js` (expects `{ ok, unreferenced, loaderless }` back):

```js
const skip = new Set(["src/dev-audit.js"]);
const files = (await fs.listFiles()).map(f => f.path)
  .filter(p => p.startsWith("src/") && p.endsWith(".js") && !skip.has(p));
const html = await fs.readTextFile("index.html");
const unreferenced = [];
for (const f of files) {
  const base = f.split("/").pop();
  let refs = 0;
  if (html.includes(f)) refs++;
  for (const g of files) {
    if (g === f) continue;
    try {
      const t = await fs.readTextFile(g);
      if (t.includes(f) || (base !== "loader.js" && t.includes(base))) refs++;
    } catch (e) {}
  }
  if (refs === 0) unreferenced.push(f);
}
const loaderless = [];
for (const m of html.matchAll(/function (ensure\w+)\(\)/g)) {
  const rest = html.split("\n").filter(l => !l.includes("function " + m[1] + "()") && !l.includes("window." + m[1] + " =")).join("\n");
  if (!rest.includes(m[1])) loaderless.push(m[1]);
}
return { ok: unreferenced.length === 0 && loaderless.length === 0, unreferenced, loaderless };
```

**2. Runtime audit** — `page_eval` with `{path:"src/dev-audit.js"}`.
Boot rows must all PASS; lazy rows may read SKIPPED (open that tab, re-run).
Any FAIL = stop and fix before shipping.

**3. Console** — `page_refresh`/`page_eval` results must show no errors, and no
`[orphan-guard]` errors may appear within 60s of a fresh load.
Manual re-check anytime: `page_eval` → `return window.__orphanGuardRecheck()`.
