# APP LOG — complete feature inventory & rebuild reference

If a feature breaks, vanishes, or "was never here": start here. This file lists
**every tab, shared system, content pack, and wiring point** in the studio, with
exact element IDs, files, loader chains, and liveness probes — enough to rebuild
anything that gets accidentally deleted or overwritten. It is generated from the
real code (crawl recipe at the bottom), not from memory.

Related: `src/FEATURES.md` (script registry + standing orders), `src/README.md`
(long-form docs), `src/dev-audit.js` (machine audit — it now checks this log's
DOM inventory too), `src/orphan-guard.js` (boot tripwire).

Persona content counts (2026-10-18): **929 genres / 460 tones / 54 extra
sections**. Owner-only locks: genres (pre-existing) + `OWNER_ONLY_TONES` (46
kin-fixation ids) in `src/persona.js`, enforced in fill + instruction builder
(tone + toneMix) + persona-tab UI.

## 1. Tabs (23) — button, container, loader, probe

`window.showTab("<id>")` + `window.__activeTab`. Every tab: nav button
`#i2p-tab-<id>`, pane toggle `VAR.hidden = name !== "<id>"` in `showTab`
(index.html), deep link `#/<id>`. Lazy scripts load via `loadScriptOnce(flag,
src, onload)`; flags below are the `window.__*Loaded` markers.

| Tab | Nav button | Container (JS var) | Loader chain | Liveness probe |
| --- | --- | --- | --- | --- |
| home | #i2p-tab-home | #home-app (HOME) | static | `window.__homeRefresh` |
| i2p (Image to Prompt) | #i2p-tab-i2p | #i2p-app (APP) | static `[generateInterfaceHTML(settings)]` | framework artStyle select |
| gen (Image Generator) | #i2p-tab-gen | #i2p-imggen (GEN) | ensureGallery → gallery.js; ensureGenExtras → persona.js → gen-extras.js → gen-persona-ui.js; ensureEmojiBrowser | `.as-input`, `__styleHintsPaint`, pc-clean wrap, `#gen-age-ctn` (🎂 age slider → `ageClause()`) |
| evo | #i2p-tab-evo | #evo-app (EVO) | ensureEvo → evo.js | `evoSetVisible` |
| gallery | #i2p-tab-gallery | #gallery-app (GALLERY_TAB_APP) | ensureGallery | `__galleryTabOnShow` |
| explore | #i2p-tab-explore | #explore-app (EXPLORE_APP) | ensureGallery + ensureExplore → explore.js + explore-importer.js; XPLV/XPLF iframes | `__exploreOnShow` |
| comm (Community) | #i2p-tab-comm | #comm-app (COMM_APP) | ensureProApp → imager-pro.js (`__proInitGallery`); votes/sorts in-file | `__proInitGallery`, #comm-backtop |
| forge | #i2p-tab-forge | #forge-app (FORGE_APP) + #forge-host | ensureForge → style-forge.js | `StyleForge.render` |
| story (Story Maker) | #i2p-tab-story | #story-app (STORY_APP) | iframe futaverse via STORY/loadStoryFrame (NEVER suspended); notes = localStorage t2iStoryNotesV1; community chat dock #story-comm-ctn (SharedComm DOCKS) at bottom | frame src set |
| listings (Generator Listings) | #i2p-tab-listings | #listings-app (LISTINGS_APP) | iframe nexora-rug via LISTINGS/loadListingsFrame (NEVER suspended) | frame src set |
| theme | #i2p-tab-theme | #theme-app (THEME) | injects imager-pro-themes.js on open (`IMAGER_PRO_THEMES`, #th-packs) | `IMAGER_PRO_THEMES` |
| edit | #i2p-tab-edit | #edit-app (EDIT) | ensureEditor → editor.js | `__editorOnShow` |
| aiedit | #i2p-tab-aiedit | #i2p-aiedit (AIEDIT) | ensureAiedit → aiedit.js | `__aieditOnShow` |
| comic | #i2p-tab-comic | #comic-app (COMIC) | ensureComic → comicscan.js | `__comicOnShow` |
| persona | #i2p-tab-persona | #persona-app (PERSONA) | ensurePersona → persona.js → persona-tab.js | `__personaOnShow` |
| board | #i2p-tab-board | #board-app (BOARD_APP) | ensureBoard → persona chain → persona-board.js | `__boardOnShow` |
| chat | #i2p-tab-chat | #chat-app (CHAT) + #classic-host | NATIVE classic skin (aichat-classic.js, shadow DOM, ChatEngine brain, kv threads shared with 🧠 tab); hoverbar intact (🎯/⛶/🔄/↗ Old chat/🔇); iframe retired | `__classicOnShow` |
| chatlite | #i2p-tab-chatlite | #chatlite-app (CHATLITE) | iframe ai-character-chat, same recipe | frame src set |
| world | #i2p-tab-world | #world-app (WORLD_APP) | ensureWorld → worldsim.js (setup/cast/stage/god/timeline; kv t2iWorld/active; 1 dunia linear + checkpoint/time-travel) | `__worldOnShow` |
| links | #i2p-tab-links | #links-app (LINKS_APP) | iframe unlimited-medias-to-links (NEVER suspended — uploads) | frame src set |
| social | #i2p-tab-social | #social-app (SOCIAL_APP) | iframe as-social + ensureSocialConvert → social-convert.js | `__socialConvertOnShow` |
| credits | #i2p-tab-credits | #credits-app (CREDITS_APP) | static | — |
| helper | #i2p-tab-helper | #helper-app (HELPER_APP) | ensureHelper → ai-helper.js (directory + AI chat + persona/image builders, PromptBridge/Vault send) | `__helperOnShow` |
| roleplay (REMOVED) | — merged into 💬 AI Chat — | — | tab deleted per user request; memory viewing moved into the classic 🧠 popup; kv store `t2iRoleplay` unchanged | — |
| private (owner-only) | #i2p-tab-private (hidden unless authed) | #private-app (PRIVATE_APP) | PrivateTabs; ensureFlux → flux/loader.js (css + prompt/boxes/std/photo/girls/tab); liquidizer via static loader.js | `FluxTab.render`, `LiquidizerTab.render` |
| owner (owner-only) | #i2p-tab-owner (hidden unless authed) | #owner-app (OWNER_APP) | ensureOwnerTab; console overlay `__t2iOwner` (opens via Theme-tab dot) | `ensureOwnerTab` |

Non-owner `showTab("private"/"owner")` falls back to home. Simple layout swaps
#i2p-tabs for #i2p-simplebar (JS-built, same `showTab` routing).

## 2. Header / hub / chrome (always present)

Sticky `#i2p-header` = brand (`#i2p-brand`) + hub row (`#i2p-hubbar`) + tab strip
(`#i2p-tabs`). Hub buttons: `#i2p-lang-btn` (25-language translate),
`#i2p-cmd-btn` (⌘K commands), `#i2p-vault-btn` (vault/roster/PromptBridge),
`#i2p-hub-roster`, `#i2p-hub-emojis`, `#i2p-save-all`, `#i2p-bookmark-btn`,
`#i2p-ui-toggle` (simple/full), `#i2p-menu-btn` (☰ all-tabs, allmenu.js),
`#i2p-fs-btn` (⛶ fullscreen, appfs.js), `#bg-hub-btn` (🖼️ Backgrounds hub,
backgrounds-hub.js → `window.siteBackgrounds`, `#bgSiteLayer`), `#mp-hub-btn`
(🎵 Music, media-player.js → `window.musicPlayer`, `#mpMini` pill). `#i2p-scrollprog` = 3px theme-gradient
scroll-progress bar pinned to header bottom (own style+script after `</header>`).
Mobile ≤720px: bottom nav `#i2p-bottomnav` + popover `#i2p-bnpop` + sheet
`#i2p-bnsheet` (vendored block at end of index.html). Tour (`#i2p-ui-hint`,
`tourTarget()`), `window.Quip` joke pools, `window.FunnyGen` loading lines,
`window.PubMenu` (⋯ menu on public images: view/send/copy/download),
`window.SharedComm` comment dock (lives in the floating 💬 pop-up `#comm-pop` —
inline `.shared-comm` cards + `#hm-community-wrap` are hidden) + `chat-notify.js`
bells (`#comm-pop-head`), community upload cap
(`CommunityCap.canPost`), translation shim (`__fireFrameworkInput`).

## 3. Content packs & data files

- `src/persona.js` — engine: TONES (460), GENRES (929), EXTRA_SECTIONS (54),
  CANON, SECTION_HINTS, OWNER_ONLY_TONES + `t2i_toneOwnerOnly()`,
  `t2i_personaWildcards` (38 sparks) + `t2i_personaWildcard()`, section writers
  (`t2i_generatePersonaSection`, `t2i_deepenSection`, `t2i_distillSection`,
  `t2i_voiceTest`, `t2i_foreshadowSection`, `t2i_callbackSection` via shared
  `runSingleSection`), depth seeds in `optionsBlock`.
- `src/epic-emoji-pack.txt` (1,920 entries) ↔ uploaded
  `https://user.uploads.dev/file/8f67c8ebeb07e93d1e7c4e9c9d9d1d58.txt`
  (`epicEmojiPackUrl` in main.pjs, used by comments + 😀 browser).
- `src/explore-directory.json` (118 gallery sites; `DIR_URL` in explore.js).
- `src/samples/` (sample-coast.jpg, sample-portrait.jpg, +4) for editor demos.
- `src/imager-pro-data.js` (`IMAGER_PRO`, ~730KB) + `src/imager-pro-upgrades.js` —
  DELETED 2026-11-03 (orphaned since the Pro Studio UI removal; nothing loaded
  them). `src/imager-pro.js` backend still ships for the Community feeds.
- main.pjs: framework `settings.userInputs` (description, negative, side_desc,
  imgName, userName, mixMedium/Vibe/Artist, mixPro1–7, artStyle1–5, artMixMode,
  shape/imgSize/numImages, ~40 clause selects, general, chat1/2), prompt-clause
  functions (`*Clause() =>`), style lists (multiStyleLabStyles, furryStyles,
  girlLabStyles…), `galleryDescription()`, server-imports header.

## 4. Server plugin (`<script type="text/x-server-plugin">`, public source)

Presence (`live|unique` on `presence` topic, durable fingerprint table in
`state`), tab tally + home-only bounce + new/returning tallies (memory-only),
owner service: `ownerAuth/ownerStats/ownerBroadcast/ownerTabStats/ownerTabReset/
ownerBounceStats/ownerBounceReset/ownerReturnStats/ownerReturnReset/
ownerUniqueReset/ownerGenTimePublish`, public `genTime()` + `tabTrending()`,
banner + gentime replay on open. Owner password: hash only, in-code.

## 5. Changelog — removed / retired (do NOT "restore" these as bugs)

- 2026-10-18: **Secret Inbox tab deleted** per owner request (~77-line INBOX
  block + wiring + credit). Owner-console "feedback inbox" is separate and live.
- Pre-existing: **Pro Studio UI removed** (Community tab reuses
  `__proInitGallery` backend only); `showTab("pro")`/`#/pro` now fall back home;
  `imager-pro-data/upgrades.js` deleted 2026-11-03 (see §3).
- 2026-10-19: dead refs removed — `src/embed-guardian.js`, `src/import-scrub.js`,
  `src/ui-polish.js/.css` tags deleted (files never existed; all 404'd). The
  `src/media-player.js` + `src/backgrounds-hub.js` tags were dead too, but were
  KEPT: both files were rebuilt (see §2, hub buttons) so the tags are live again.
- 2026-11-03: deleted `src/imager-pro-data.js` (~730KB) + `src/imager-pro-upgrades.js`
  (orphaned since the Pro Studio UI removal; nothing loaded them — `ensureProApp`
  loads only `imager-pro.js`, `window.IMAGER_PRO` undefined at runtime).
  Registry rows removed from `src/FEATURES.md`; stale "Tab 6" claims in
  `src/README.md` corrected with a REMOVED notice (surviving backend: Community
  feeds + persona/post modals + comments dock).
- 2026-10-18: fixed 4 dead script tags, blind orphan-guard selector, 3 unwired
  features (artstyle-search, style-hints, gen-persona-ui — rewired), unbounded
  retry timers (imager-pro boot, gallery tryAttach/bootScratch). See
  scratch/CURRENT_TASK.md for the full bug-scan record.

## 6. Verify (run after ANY edit touching tabs, scripts, or header)

1. `page_refresh`, then `page_eval {path:"src/dev-audit.js"}` → ALL GREEN
   (boot + lazy + **dom** rows; open every tab first for full PASS board).
2. `__orphanGuardRecheck()` → `{failures: [], unprobed: []}`.
3. Console: only benign upload-plugin logs; no 404s, no `SyntaxError`.
4. Spot-check the edited surface (snapshot + `read_image` for visual work).

## 7. Regenerating this log

`execute_js` crawl: TABS array, `id="i2p-tab-*"` buttons, `id="*-app"`
containers, `function ensure*` + `loadScriptOnce` targets, static
`<script src="src/...">` tags, `VAR.hidden = name !== "tab"` branches,
`window.*` exports per src file, column-0 names in main.pjs, `userInputs`
names. Raw output → `scratch/inventory.json`. Then reconcile with this file by
hand — the crawler misses JS-built UI (simplebar) and digit-containing ids, so
spot-check those. Update §§1–4 when adding/removing/rewiring anything.
