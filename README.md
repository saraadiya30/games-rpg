# all-in-one-generator — "Image to Prompt" + Image Generator + Prompt Evolution + Gallery + Theme Studio + Image Editor + Pro Imager + AI Photo Editor + Comic Scanner + Persona Generator + Persona Board + AI Chat + AI Chat Lite + Media to Links + Generator List + Social DB + Style Forge

Twenty-tab generator on one page (Home + nineteen tools, with a shared cross-tab prompt hub — see
"🔗 Shared hub" below):

## ✨ Simple layout (the default) vs 🧰 Full layout
Twelve tabs in five groups, plus a dashboard full of strips, is a lot to take in — so the site
ships with a **decluttered layout** for visitors who find it hard to navigate. It is a *view* over
the same app: every tool, deep link (`#/pro`), saved setting and cross-tab pipeline behaves
identically in either layout.

- **The switch** — a `#i2p-ui-toggle` pill, first in `#i2p-hubbar`. It writes `localStorage
  "t2iUiLayout"` (`"simple"` | `"full"`; anything else reads as `"simple"`), then sets
  **both** `<html data-ui="…">` and a **`ui-simple` class on `<body>`**. Both are set because the
  CSS is keyed off the body class: `:root[data-ui]` alone did **not** survive the screenshot tool's
  DOM clone (the capture showed the full strip while the live DOM was simple), and a plain element
  selector is the robust one. Its label always names the *other* layout ("🧰 Full layout" while
  simple), so its meaning is unambiguous.
- **☰ Menu (fullscreen all-tabs menu)**: a `☰ Menu` hub button, first in `#i2p-hubbar` (both
  layouts), opens `#i2p-allmenu` — a fullscreen overlay listing every tab grouped exactly like the
  nav strip (Start/Create/Photos/Stories/More), each with its description and a highlight on the
  current tool. Items are read live from the nav buttons, so labels never drift and hidden
  (owner-locked) tabs are automatically excluded. Click navigates via `window.showTab`; ✕, backdrop
  click, or Escape closes. All behaviour lives in `src/allmenu.js` (script tag right after
  `</header>`), exposed as `window.__allMenu`.
- **Site data (bottom of the ☰ menu)**: a `Site data` section holds ⬇️ Download
  all data (one `.json` backup: all `localStorage` except the `t2iGalleryItems` /
  `t2iGalleryHidden` image collections, plus all `keyval-store` IndexedDB pairs with
  `Uint8Array` revival), ⬆️ Import data (restores a backup, never overwrites the
  gallery image keys, reloads after), and 🗑️ Delete all data (double-confirmed;
  wipes `localStorage` + `sessionStorage` + the IDB store except gallery images,
  then reloads). Gallery images always stay put. On mobile (≤720px, including the
  bottom-nav sheet's 💾 Data Stored row) the three tools sit behind a single
  `💾 Data Stored` entry whose detail screen also explains what is stored
  (settings, creations, history — gallery images kept separately) and how saving
  works (automatic, this browser only: small text in `localStorage`, larger data
  in IndexedDB; backups are dated snapshots of both).
- **Simple mode** hides `#i2p-tabs` and shows `#i2p-simplebar`: one row — 🏠 Home · 🎨 Image
  Generator · 🖼️ Image to Prompt · ✨ AI Photo Editor · 🧑 Persona · 💬 AI Chat — plus **⋯ More
  tools**, which opens `#i2p-simple-menu` (a panel under the sticky header listing all twelve,
  grouped Create/Photos/Stories/More, each with a one-line description and a highlight on the
  current tool). The button label follows the active tool ("⋯ Pro Imager ▾") when it isn't one of
  the six, and gets an accent outline so you can always see where you are.
- **Header** keeps only 🔍 Commands · 📚 Vault · 🖼️ Personal Gallery; 🧑 Roster / 😀 Emojis / 💾 Save all get
  `.i2p-hub-extra` (still present in full mode, and reachable from Home's "Good to know" card).
- **Home** hides its long tail — tagged `.hm-extra` by the script: the *Workflows*, *Your stuff* and
  *Credits & sources* `.hm-section`s, `#hm-explore` (explorer progress) and `#hm-comm-wrap` (the
  "made with this studio" strip). What stays is the useful spine: hero → continue → latest work →
  quick start → All tools → Good to know. Tagging happens in JS (match the section
  by its `.hm-h2` text) so the markup keeps its single source of truth.
- **Discoverability**: a one-time, self-dismissing toast (`#i2p-ui-hint`, `localStorage
  "t2iUiSeenV1"`, only on the Home tab) explains the toggle's existence to first-time visitors.
- **Active-tab mirror**: the real strip updates `.i2p-tab-active` inside `showTab`, so the card
  script wraps `window.showTab` (guard `window.__t2iSimpleHook`) to mirror the state onto the bar
  and the menu items. It installs on a `setTimeout(…, 0)` because the navigation script (which
  defines `showTab`) runs *after* this one — by then the tab-reporting, explorer and theme wrappers
  are already stacked, so ours is outermost and sees the final `window.__activeTab`.
- **Tour**: the "the tools live here" step targets `#i2p-simplebar` in simple mode and `#i2p-tabs`
  in full mode via `step.selSimple` + a `tourTarget()` helper (the old hard `document.querySelector`
  would have spotlighted a `display:none` element).
- **Build note**: the style + script block for all of this sits immediately after `</header>` in
  index.html. It is the earliest script that can touch `<html>`/`<body>`, which keeps the layout
  from flashing the full header before switching.

### 📱 Mobile bottom-nav layout (≤720px)
Ported verbatim from the published `houfzo0ueo` build (which had it; this workspace didn't):
a `body.is-android-mobile` mode driven by `matchMedia("(max-width: 720px)")` + a `resize`
listener. While active: the tab strips, simple bar/menu and layout toggle hide; a fixed
bottom nav (`#i2p-bottomnav`: 🏠 Home · 🎨 Create · 🖼️ Gallery · 💬 Chat · ☰ Menu, 44px
touch targets, safe-area padding) takes over. The Create popover and the ☰ sheet's Create group
both list 🧪 Style Forge (`forge: "gen"` in `POPPARENT` keeps Create highlighted while inside). Tapping a section with a `POPUPS` entry opens
a popover (`#i2p-bnpop`) anchored above the bar instead of navigating (its rows always
navigate, even the top row, which is the section's own id — routing those through the
toggle would just re-open the menu in place); long-press (450ms)
does the same; ☰ opens a full bottom sheet (`#i2p-bnsheet`, swipe-down to dismiss) listing
every tool by group. While the owner console is unlocked the sheet appends a 🔒 Private row to
its More group (`bnIsOwner()` reads the same `__t2iIsOwnerAuthed()` gate; the sheet rebuilds on
`t2i-owner-auth`/focus so locking removes the row without a reload, and `POPPARENT.private =
"__menu"` highlights ☰ while inside). A second owner-only row, 🎛️ Owner console (`__owner`,
handled in the sheet's `go()` by calling `window.__t2iOwner.open()` directly since it is an
overlay, not a tab), opens the owner console from the same menu. `POPPARENT` keeps the right section highlighted (AI Video counts as
Create, Social DB, Generator List, Persona Board and Media to Links as Gallery). The script wraps `window.showTab` (guard `window.__bnShowTabHook`) to mirror the
active state, close popover/sheet on navigation, and scroll to top on mobile. App panels get
extra bottom padding so the fixed bar never covers content; hub extras/bookmark hide; links
and buttons get `touch-action: manipulation` and haptics via `navigator.vibrate`. The whole
block (style + nav HTML + script) sits right after the SharedComm script at the end of
index.html, vendored with `copy_lines` from the published build plus the AI Video additions.

## 🧭 Navigation, Home & cross-tab flow
The app opens on a **🏠 Home** dashboard (not a tool), and the whole suite is
grouped in a sticky header so it stays reachable while you scroll:

- **Sticky header** (`#i2p-header`): brand (click = Home) + a **hub bar** of
  always-available quick actions — 🔍 Commands (the ⌘K palette), 📚 Vault,
  🖼️ Personal Gallery, 🧑 Roster, 💾 Save all prompts. These used to be reachable only
  from inside individual tabs; now they open the shared tools from anywhere.
- **Grouped tab strip** (`#i2p-tabs` → `.i2p-navgrp` groups, each with a tiny
  uppercase label): Start (🏠 Home) · Create (Image Generator, Pro Imager,
  Prompt Evolution, Gallery, Community, AI Video) · Photos (Image to Prompt, AI Photo Editor, Image Editor) ·
  Stories (Comic Scanner, Persona Generator, Persona Board, AI Chat, AI Chat Lite) · More (Media to Links, Generator List, Social DB, Theme). On
  desktop the groups wrap as units; at ≤880px the strip becomes one swipeable
  row (labels hidden) and at ≤480px the hub buttons go icon-only.
- **🏠 Home** (`#home-app`, the default `showTab("home")`): hero quick-actions,
  an "All tools" grid (4 task-grouped cards, 21 tools), "Workflows" (tap-through chains
  like Photo → Prompt → Image, Idea → Evolve → Render, Image → Persona → Chat,
  Comic → Characters → Persona), "Your stuff" (live counts for gallery / vault /
  roster / persona history + one-click Save-all / full backup), and a "Continue
  where you left off" bar (reads `localStorage.t2iLastTab`, written by
  `showTab`), plus the funnel engines below (⚡ quick-start examples, 🔥 live
  trending, 🧭 explorer progress, 🔎 tool filter, 🖼️ your latest work,
  🌟 "made with this studio", 🧭 first-run tour). Home is the first-paint tab so
  its logic is a small inline script
  in index.html (not a lazy `src/` file); clicks route through delegated
  `[data-go]` / `[data-act]` handlers and counts refresh via
  `window.__homeRefresh()`. All four stat counts populate on first load: the
  persona-history one is read straight from the kv folder
  (`root.kv.t2iPersonaPrompts`, key `list`) when its lazy script
  (`src/gen-extras.js`) isn't loaded yet, so the tile is never stuck at the `—`
  placeholder.
- **Live viewer count** shares the ⏱️ Best-time card at the top of Home (`#hm-viewers`, a centered
  pill with a pulsing green dot, pinned to the bottom of the card). It is a real presence count, powered by the
  `server-plugin` (`createServerSocket = {import:server-plugin}` in main.pjs; the
  only `x-server-plugin` block, at the top of index.html, public source). Every
  open page subscribes to the `presence` topic; the server keeps a `liveIds` Set
  of `conn.id`s and publishes `"<live>|<unique>"` to that topic on every
  open/close or new unique visitor, so the pill just renders the numbers it
  receives. The client (`<script>` right after the Home script in index.html)
  reconnects with capped exponential backoff + jitter on unexpected closes, stops
  permanently and hides the pills on a `4403` close (page embedded off
  perchance.org), and forces a fresh connect on tab re-focus.
- **All-time unique visitors** — the second stat in that same pill (👥). It is
  durable: the server stores an open-addressing hash set of 8-byte visitor
  fingerprints in `state` (header: `[0]` version, `[1..4]` uniqueCount,
  `[5..8]` usedSlots, `[9..12]` slotCapacity, then 8-byte slots; `CAP` is derived
  from `state.length`, never hardcoded — ~6.5M slots, saturating at 60% load, so
  ≈3.9M unique visitors, then it stops rather than probing forever). Probe walks
  are bounded to `MAX_PROBES` and insert costs ~1.2µs, so the 50ms/event budget is
  never at risk. Each browser generates a random id in `localStorage.t2iVisitorId`
  and sends only the first 8 bytes of its SHA-256 (fallback: a local FNV pair), so
  the server never sees an identity. The handshake is **two frames**: a `reg` frame
  carrying just the `owner`/`bot` flags goes out synchronously the moment the socket
  opens, and the `fp` frame carrying the fingerprint follows once the async hash
  resolves. Flags must not ride on the fingerprint: a tab-usage report sent in those
  first milliseconds would otherwise arrive before the server knew the connection was
  the owner's — which is exactly how the owner's own views leaked into the tally.
  The server applies flags from either frame and accepts a legacy combined
  `reg{fp,owner,bot}` too. Excluded from this count (but still shown as
  a live viewer): `bot`/`owner` flags from the client, `conn.isProxy` origins
  (`EXCLUDE_PROXY_ORIGINS` — flip to `false` if it undercounts real VPN users),
  and registrations are rate-limited per `conn.net[2]` and per connection
  (`REG_LIMIT_PER_NET` / `REG_LIMIT_PER_CONN`).
  - **Owner/AI exclusion**: the perchance editor serves its preview at
    `<page>#edit`, so the client treats `#edit` (and `generatorIsUnsaved`) as
    "this is the owner or this generator's AI agent" and stores
    `localStorage.t2iIsOwner = "1"`. Because the editor preview and the public page
    share an origin, later public-page visits from that same browser are excluded
    too. Client-side `navigator.webdriver` / headless-UA checks cover browser
    automation.
  - **Gotcha fixed here**: `x ^= x >>> n` returns a *signed* int32, so the hash
    index went negative for ~50% of fingerprints and threw `RangeError: invalid
    array index` inside `onmessage` (which closes the caller's connection →
    reconnect loop). Every `^` in `slotIndex` is now `>>> 0`-coerced, and the
    whole `onmessage` body is wrapped in try/catch so a bad message can never
    close a connection.
- **Deep navigation**: `window.showTab(name)` is still the single entry point and
  `"home"` is a valid name everywhere (command palette, Theme-Studio per-tab
  accent list). Every tab below is unchanged and still reachable. An unknown tab
  name falls back to `"home"`, so a stray value can never blank the whole screen.
- **Credits tab** — `#credits-app` + `#i2p-tab-credits` (More group): the single home for every outbound source link (Tools adapted from, Plugins, Libraries & services, More from Perchance). Home keeps only a teaser card with `data-go="credits"`; the Image Generator's `introMessage`/`underImagesMessage` link inward to the Credits tab instead of outbound.

### 🎯 Home grow-the-funnel engines (quick start · trending · explorer · filter · your work · community · tour)
Seven small features that all chase the same number the owner console measures on its
"🏠 Left without exploring" chart: how many Home visitors open a second tool. They live in two
self-contained `<script>` blocks in index.html — "Home tab: ⚡ one-tap examples · 🔥 live trending ·
🧭 explorer progress" (engines 1–3, right after the Home script) and "Home extras: 🔎 tool filter ·
🖼️ your latest work · 🌟 made with this studio · 🧭 first-run tour" (engines 4–7, right after that).

- **⚡ Quick start (`#hm-starters`, `.hm-quick`)** — six cards, one per tool that benefits from a
  non-empty starting state, rendered *from the payload they will apply* so the preview on a card
  can never drift from what the user gets. `STARTERS` holds 2–3 `variants` each (a `prompt`, or an
  `img` + `instruction`/`focus` for the photo tools, plus a `note` shown on the card); one variant
  is picked at random per render, so Home isn't the same six examples forever. The hero buttons
  (`#hm-start-gen`, `#hm-start-photo`, `#hm-start-persona`) and the onboarding CTA
  (`#hm-onboard-start`) run the same `applyStarter()` — they deliberately have **no** `data-go`, so
  they load an example instead of just navigating. The plain "All tools" directory is left alone
  (it must stay a plain navigator, since that is also the click a returning user makes to get back
  to work in progress).
  - Targets mirror the shared PromptBridge destination list in `src/vault.js`
    (`PROMPT_FIELD`/`PROMPT_SETTER`), so there is exactly one idea of where a prompt lives per
    tool; `setGenStyle()` matches the Image Generator's ~189 style options on visible text *or*
    value (`ref:optionKeyName:Painted Anime`), never on a hard-coded id.
  - **`PROMPT_READY`** exists because a setter hook can be defined long before its tool has built
    its DOM: `window.__proSetDesc` exists the moment `src/imager-pro.js` loads, but it is a no-op
    until `build()` has bound `descInput`. Without the gate the Pro Imager starter silently did
    nothing *and* the app's own restore-from-autosave then won the race (the user just saw their
    old text). The gate waits for `window.__proReady`. Anything similar added later needs the same
    treatment.
  - **Never silently destroy**: `stash()` is called before a starter overwrites a non-empty box and
    saves the old text to the 📚 Vault (`tags: ["replaced","home-example"]`, silent) — the toast
    then says so. A sample photo is only ever loaded into a tool that has no image yet
    ("This tool already has a photo — left it alone").
  - Sample photos are a rotating pool in **`src/samples/`** (three `place` + three `person`
    photos, bundled so no third-party host is involved), loaded via `fetch` → `File` → `DataTransfer` →
    `input.files` + `change`. Each pool entry carries its own `thumbY`, applied as
    `object-position` on the card thumbnail so each photo's main subject survives a wide
    letterbox crop. The pool (`window.t2i_poolPlace()` / `window.t2i_poolPerson()` in index.html, advances both roles to the
    next photo on every page open/refresh (persisted in `localStorage.t2iSamplePoolIdx`), so every
    static placement deals a fresh image each visit; fallbacks keep the two original photos
    if the pool is ever missing. If `fetch` fails (unsaved preview in a
    browser with no service worker), the toast says to save the generator once.
  - Card grid: `repeat(auto-fit, minmax(300px, 1fr))` over a fixed ~1120px Home column → a tidy
    3×2 grid on desktop, 2 columns mid, 1 column on phones (measured 1/2/3 at 360→1600px, no
    horizontal overflow).
- **🔥 Trending (`#hm-trending`)** — the real ranking, from the server's own tab tally via a new
  **public, no-auth** RPC `tabTrending()` in the `x-server-plugin` block (returns the cached
  `{epochStart,total,counts}` JSON, `TRENDING_CACHE_MS = 2000`; it is aggregates only, so there is
  nothing to authenticate). The old hard-coded ⭐ "most popular" badges *claimed* popularity; these
  chips *measure* it. Hidden below `TRENDING_MIN_TOTAL = 10` total views (below that it's noise),
  silent if there's no socket or the saved server predates the RPC, refetched at most every
  `TRENDING_MS = 15000` when Home refreshes. The top three also get a 🔥 badge on their cards in
  "All tools" (tooltip carries the count and the tally's epoch start), and the section hint gains
  "· 🔥 = most opened right now" only while a ranking actually exists.
- **🧭 Explorer progress (`#hm-explore`)** — which tools *this browser* has actually opened, in
  `localStorage.t2iExplorer_v1` (`{tried:{tab:ts}, firstTs}`), shown as "N of 21 tools tried" + a
  filled bar + up to three "Try next:" chips, plus a ✓ badge on tried cards. Recorded by wrapping
  `window.showTab` (guarded by `window.__t2iExploreHook`; the wrapper calls the previous function so
  it composes with the theme/emoji/owner wrappers) and by a one-time toast the first time each tool
  is entered. Purely local, never sent anywhere.
- **🔎 Tool filter (`#hm-tools-search`)** — a filter box in the "All tools" header. Typing hides
  non-matching cards (per group, and whole groups when they empty out), the header shows "N of 20
  match" and a no-match line suggests words to try. Matching runs against each card's name + its
  description + an `ALIAS` map per tab id, so the box answers how people actually search ("anime" →
  Image Generator, "cbz" → Comic Scanner, "roleplay" → Chat/Persona, "upload" → Media to Links)
  rather than only matching the card's own wording. **⌘K / Ctrl+K** focuses it while Home is up
  (capture-phase handler + `stopPropagation`, so the command palette does *not* also open), and
  pressing it again — or when the box already has focus — falls through to the palette, which stays
  the "search everything" escape hatch. It deliberately bails out when some *other* input has focus
  (e.g. the palette's own box), and `/` also focuses it. Escape clears it, Enter opens the first hit.
- **🖼️ Your latest work (`#hm-recent`, `#hm-recent-wrap`)** — the returning-visitor counterpart to
  the ⚡ cards: the newest six items from the local gallery (`localStorage.t2iGalleryItems`, sorted by
  `timestamp`) as a horizontal strip under the hero, with the caption, a relative time and the folder
  as a chip. The whole section is hidden when there's nothing saved (an empty shelf is worse than no
  shelf) and it needs no lazy module — it reads localStorage directly, and just shows what's there.
- **🌟 Made with this studio (`#hm-comm`, `#hm-comm-wrap`)** — real images from this generator's
  **public** gallery, i.e. other people's work, as social proof. `superFetch` (= `{import:super-fetch-plugin}`,
  added to main.pjs for this) reads the gallery's own server-rendered page
  (`image-generation.perchance.org/gallery?channel=<name>&subChannel=public&sort=new&hideIfScoreIsBelow=-1&contentFilter=…`)
  — a direct `fetch` is CORS-blocked — and `DOMParser` pulls `url/prompt/title/userId/isNsfw` plus the
  gallery's own short `user-tag` (e.g. `P671`) out of each `.imageCtn` card. It is drawn with the same
  respect the gallery itself applies: the URL **always** carries `contentFilter=pg13` and items the
  gallery flagged NSFW (`data-is-nsfw`) are always dropped, whatever the page's 🔞 toggle says — the
  front-page strip is a shop window, so it is always read through the gallery's own NSFW filter. The
  gallery's **ban list**
  (`bannedUsers` / `bannedPromptPhrases` / `bannedNegativePromptPhrases`, read from the framework's
  `galleryOptions`) is re-applied here — the plugin normally enforces it *inside* its iframe, which we
  can't reach from Home. Supports the documented `pg13:` prefix and `/regex/` phrases. On top of that,
  a hardcoded child-safety block (`CHILD_SAFETY_RX` + offender IDs in `passesGalleryRules`, mirrored in
  Community feeds + Explore) drops minor-age prompts even when the platform marks them `isNsfw=false`.
  Exactly one adult phrasing is exempt everywhere: "late teen(s)/teenage(r/s)"
  (reads as 18–19) is stripped before testing, so e.g. "woman in her late teens"
  passes while bare "teen", "teenager", "early/mid teens", "young teen", etc.
  still block. (Limitation: the plugin's own gallery iframe still hides "late
  teens" too, because its server-side `bannedPromptPhrases: teen` is a plain
  substring with no exemption — only our Home strip / Community / Explore apply
  the late-teens carve-out.)
  Only the tiny
  parsed result (first 6 of up to 12 parsed cards) is cached, in `localStorage.t2iCommunityV3`, for
  30 minutes; the page itself
  is never stored, a failed read falls back to the stale cache rather than blanking the section, and
  everything fails silently. "Browse the full gallery →" opens the Community tab and scrolls to
  its galleries (the public gallery itself — `socialFeatures = disabled` in main.pjs, so
  the Image Generator tab embeds no gallery of its own).
- **🖼️ shared lightbox (`#hm-lightbox`)** — both strips above open the same overlay: the image, the
  prompt, a `tag`/time meta line, and the two useful actions — 📋 Copy prompt and 📚 Keep in Vault
  (through the shared Vault API, the same one ▸ Send to… uses). Escape or a backdrop click closes it.
- **🧭 First-run tour (`#hm-tour`)** — a five-step spotlight walk (hub bar → tab strip → quick-start
  cards → Vault button → Personal Gallery button): one absolutely-positioned "hole" div dims everything outside
  it with a huge outward `box-shadow`, plus a tooltip placed below the target (above it when there's
  no room). Next/Back/Skip buttons, ←/→/Enter to step, Escape to tuck it away *without* burning the
  "seen it" flag (`localStorage.t2iTourV1`). It is deliberately **not** shown on top of the "New here?"
  card: `maybeTour()` bails while `#hm-onboard` is visible and a MutationObserver on that card starts
  the tour when it's dismissed. Shown at most once per session in any case (`tourSeenThisSession`), and
  always re-runnable from the hero and the onboarding card ("▶ Take the 30-second tour").

## 🔒 Owner-only service (admin console + site-wide announcement)
A password-protected admin service that only the generator's owner can use. Both halves
live in index.html: the server half is in the `x-server-plugin` block at the top (below the
presence code), the client half is the `<script>` immediately after the presence script.

- **Server** (`self.rpc`): `ownerAuth(password)` → `"ok" | "denied" | "rate"`,
  `ownerStats()` → JSON `{live, unique, admins}`, `ownerBroadcast(message)` → `"ok"`
  (`""` clears the banner), `ownerTabStats()` → JSON `{epochStart, total, counts}`,
  `ownerTabReset()` → `"ok"`, `ownerBounceStats()` → JSON `{epochStart, homeOnly, explored, hours}`,
  `ownerBounceReset()` → `"ok"`, `ownerTrafficStats()` → JSON `{epochStart, peak, live, hours}`
  (per-hour concurrent-viewer highs/lows), `ownerTrafficReset()` → `"ok"`,
  `ownerReturnStats()` → JSON `{epochStart, new, returning}`
  (new vs reoccurring fingerprint registrations), `ownerReturnReset()` → `"ok"`. Every method except `ownerAuth` throws for a non-admin connection.
  The console asks for `ownerBounceStats` and `ownerReturnStats` through `callOptional()`, so a running server that
  predates them (the server is whatever was last *saved*) shows a "save the generator to deploy it"
  line instead of breaking the whole panel — the other two stats calls stay strict, which is what
  still catches a lost admin grant.
- **🔞 Age meter (owner-only, 0–100)**: server `ownerAgeMeterSet(n)` (admin-only,
  integer-clamped 0–100, `"bad value"` for non-numeric) + public `ageMeter()`
  (returns the value as a string — RPC methods must return string/ArrayBuffer/view;
  default `"18"`). Memory-only like the banner, so it resets to 18 on a server
  rebuild and the owner re-sets it. The console renders it as a draggable track +
  handle (`role="slider"`, pointer drag with clamping, click-to-jump, arrow/Home/End
  keys, `aria-valuenow`), loading the server value on every stats refresh and
  saving via an auth-rechecked 💾 button (`window.__ownerAgeMeter` /
  `__ownerAgeMeterGet()` exposed). It backs the 🔞 NSFW gallery gate
  (`src/imager-pro.js` reads `ageMeter()` at gallery init and on every NSFW-tab
  click and paints the gate title/agree button as `{n}+`); non-admin `set` calls
  throw `unauthorized` (verified live: default read `"18"`, `"abc"` rejected,
  `150`→`100`, `-5`→`0`, drag/keyboard/save round-trip ok).
- **Authorization is per connection**: a successful `ownerAuth` adds `conn.id` to the
  ephemeral `adminConns` Set (removed in `onclose`); every privileged handler re-checks it,
  so hiding the UI is never the security boundary.
- **Password**: only `OWNER_PASSWORD_SHA256` (a SHA-256 hex) is stored — the plaintext lives
  only with the owner. `sha256Hex()` is a compact synchronous pure-JS implementation, because
  the server runtime has no `crypto`/`TextEncoder` and handlers must be synchronous; it was
  verified against `crypto.subtle` for empty/ASCII/multi-block/Unicode inputs. The password is
  32 random bytes (high entropy), so plain SHA-256 is appropriate. Failed attempts are capped
  by `AUTH_LIMIT_PER_CONN` per connection and `AUTH_LIMIT_PER_NET` per hour per `conn.net[2]`.
- **Client**: `window.__t2iNet` (exposed by the presence script) hands over `isOwner()`, a
  `whenOpen()` socket promise, and the live socket. The owner console is built lazily on first
  open; it keeps the password in memory, and — only while the “Remember me” box under the
  password field is ticked (the default) — mirrored into sessionStorage (`t2iConsoleKey`) so the
  unlock survives reloads but dies with the tab (cleared on manual lock; never localStorage),
  and re-sends it on a 20s heartbeat plus an automatic re-auth on boot, so the grant survives
  reconnects and server-code updates that rebuild globals.
- **Access**: there is deliberately no button, dot, link, or shortcut hint anywhere in the
  UI — the ONLY way in is a typed key sequence (ignored inside inputs). The exact keys live
  only in the console script source and are given to the owner privately, so nothing
  advertises the console. That obscurity is not security — the server-side password check is.
- **Announcement**: `ownerBroadcast` fans the text out on `ANNOUNCE_TOPIC` and replays it to
  each connection as it opens; the client renders it as a fixed bottom bar (`#t2i-announce`,
  theme-accent coloured, dismissible). `currentAnnounce` is in-memory only, so a banner lasts
  until the server globals are rebuilt — the owner simply re-sends it.
- **Compatibility**: the presence state layout is untouched (same `STATE_VERSION` / `HDR` /
  `SLOT` / `CAP`), so this is fully compatible with existing production state — no migration.

### 📊 Tab-usage stats (owner-only)
The console also answers "which tools do people actually open?".

- **Reporting**: every `showTab()` call reports `"tab:<id>"` — a plain string, so the path needs
  no JSON — through the same socket (`window.__t2iNet.report()`). Individual script hooks have
  wrapped `window.showTab` before (theme, emoji browser) and this follows that pattern with its
  own guard flag (`window.__t2iTabHook`), so wrappers compose. Rapid re-entry into the same tab
  inside 2s is collapsed client-side, and the first paint (which never calls `showTab`, since Home
  is simply visible) is reported once by a 1.5s timer.
- **Counting**: the server validates against a fixed `TAB_NAMES` whitelist with
  `Object.prototype.hasOwnProperty.call(...)` (a plain `TAB_NAMES[name]` lookup also answers
  truthily for inherited names like `toString` / `constructor` / `__proto__` / `valueOf`, which
  let a client inject junk rows into the stats — names are also length-bounded), caps each
  connection at `TAB_LIMIT_PER_CONN` events/hour, and ignores connections that declared
  themselves the **owner** or **automation** (remembered from the `reg` frame in `connOwner` /
  `connBot` — consulted as the connection's state, not the individual frame's). Reports are
  gated client-side on that `reg` frame having been sent, so a view can never be attributed
  before the server has classified the connection.
- **Why it is in memory, not `state`**: the presence visitor table fills the durable buffer
  exactly (`CAP` is derived from `state.length`, and the presence hashing modulus must never
  change or every stored fingerprint is remapped), so there is no safe room for new durable
  counters without a rehash migration. The tally is therefore a plain in-memory `tabCounts`
  object and resets when the server globals are rebuilt.
- **Public read**: the same tally is exposed — deliberately without any auth — as
  `tabTrending()`, which returns `{epochStart,total,counts}` as JSON (serialized at most once per
  `TRENDING_CACHE_MS = 2000`). It carries aggregates only (tab id + count), so there is nothing in
  it to protect, and it is what powers the 🔥 "Most opened right now" row on Home. `epochStart`
  exists so the UI can honestly say "since the server last restarted" instead of implying an
  all-time ranking. Owner/automation connections are excluded from the tally, so the owner
  previewing their own generator can't skew the public chips.
- **Surviving restarts**: `epochStart` stamps a tally's lifetime. The console folds each server
  tally into a cumulative kept in `localStorage.t2iTabStats_v1` on the owner's device — when the
  epoch changes the whole live tally is new, otherwise only the delta since the last save is
  folded in — so the ranking persists across restarts (counts accrued while the owner was away
  and the server restarted are the one thing that is lost). Two owner tabs cooperate correctly
  because they share that record. The record is loaded defensively: only own, number-valued,
  `^[a-z]{2,12}$` keys survive, into null-prototype maps, so a corrupted (or hostile) saved
  record can neither throw nor smuggle a `__proto__`-style key into the rendering path.
  **Reset** clears both the server tally and the local record.
- **UI**: a ranked bar list (label from the live nav button text, so labels can't drift), count ·
  percentage, proportional bars, plus a footnote with the cumulative, the live tally and its
  start time. Every row also carries a **colour dot in that tool's signature colour**
  (`tabColor(id)` reads the `--th-dot` that the Theme Studio's `paintTabDots()` stamps onto the
  nav button, falling back to `--th-accent`), so the console's ranking wears the same per-tool
  colours as the Home menu
  shows up there automatically, with its own colour, the moment the Theme Studio knows about it.
  Rendered by `renderTabs()` in the owner console script.

### 📈 Traffic highs/lows (owner-only)
Answers "when is the site busy, and when is it quiet?" — highest and lowest concurrent
viewer counts ("viewing now", the same number the Home pill shows), on an hourly and a daily basis.

- **Counting**: every presence change (`onopen`/`onclose`, after the `liveIds` mutation) stamps
  the current live count into a `TRAFFIC_HOURS` (168) ring of per-epoch-hour `[maxLive, minLive]`
  buckets via `noteTraffic()` — a handful of int ops on the presence path, no JSON. A new hour
  starts with `max = min = live`. In-memory only, sharing `tabEpochStart`, so one server-globals
  rebuild resets it alongside the tab/bounce tallies. The durable presence state layout is
  untouched (same `STATE_VERSION` / `HDR` / `SLOT` / `CAP`).
- **Surviving restarts**: the console folds the ring into `localStorage.t2iTrafficStats_v1` —
  per-hour max-of-maxes / min-of-mins (peaks only grow, lows only shrink within an epoch) plus an
  all-time `peak` and a per-local-day history (`days`, capped at 60 days, day = extremes of its
  hours in the viewer's timezone), with a new epoch clearing only the hour bookkeeping while the
  day history is kept. Loaded defensively (finite hour keys, `min ≤ max`, day-key regex).
  **Reset** calls `ownerTrafficReset` (which re-seeds the current hour so the ring never reads
  empty while live) and clears the local record. Asked through `callOptional()`, so an old
  server build shows the "save the generator" line instead of breaking the panel.
- **UI** (`renderTraffic()`): an all-time-peak headline with the current live count, then two
  charts reusing the console's column styles — hourly (last 24 hours: busiest/quietest hour
  headline) and daily (last 14 days, 10 below 420px: busiest/quietest day headline). Each column's
  bar reaches the slot's HIGH with the value above it and a white tick marks its LOW (exact
  split in the tooltip), followed by a legend and a footnote. Exposed as `window.__t2iTraffic`
  (`load`/`merge`/`render`) for live verification with synthetic data.

### 🔁 Returning visitors (owner-only)
Answers "what % of visitors have been here before?". The server counts every fingerprint
registration on the same path as the unique total (`fpNew` = never seen, `fpSeen` = already
in the table; memory-only, sharing `tabEpochStart`'s lifetime), exposed as `ownerReturnStats()`
/ `ownerReturnReset()`. The console delta-folds them into `localStorage.t2iReturnStats_v1`
(`mergeReturnRecord`, same pattern as the tab record — no day history, just cumulative
`fresh`/`returning`) and `renderReturn()` prints the headline ("X% of N registered visits are
reoccurring"). Owner/automation connections are excluded by the same check the unique count
uses, since they never reach the counting line.

### ✏️ Edit quick actions + 💬 Feedback inbox (owner console)
Below the stats the console has an **✏️ Edit** row: jump to 🎨 Theme Studio or 🏠 Home,
copy the public `https://perchance.org/<name>` link (clipboard with a
manual fallback that prints the URL into the log), and open the public page in a new tab —
the small jobs that otherwise need a round-trip through the editor. Under it, a **💬 Feedback**
section embeds the same `feedback` comments channel visitors see as the 💡 Feedback tab
inside community chat (`SharedComm`, from `settings.commentChannels.feedback` in main.pjs —
same channel name, so all existing feedback history carries over), so you can read
and reply without leaving the console. The console embeds it lazily on first open via `embedFeedback()`.
It passes `customEmojis` from `settings.defaultCommentOptions` (same stacked packs as community
chat, via `window.__feedbackEmojiCfg()`), so `:codes:` render as images — including on comments
posted before the packs were added, since the plugin renders them display-time from the viewing
box's config.

### 🔒 Private tab (owner-only embedded generators)
`#private-app` + `#i2p-tab-private` (More group) holds a pill sub-bar of secondary tabs, each a full
embedded generator in its own lazily-loaded iframe (same `null.perchance.org` auto-redirect trick as
the chat/links/nexus/social embeds — except the native ones, which are remade locally with no
iframe involved). Ships with four secondary tabs: **🐺 Fluxinator** (first pill, fully native
remake of `fluxinator` — see "🐺 Fluxinator tab" below, with the former Girls Generator's
trait engine merged into it — description box with 🎲 random-prompt dice, booster selects
(realism, Genshin realism, progressive detail, detail level, perfect anatomy), 80+ trait
dropdowns with the site's own 🎲 Random variants (pools resolved per image exactly as the
site resolves them), 13 extras slots, the Genshin roster, and Generate built in via
`root.generateImage` with the site's exact prompt/negative assembly (undress clauses,
garment echoes, view framing, mika/genshin ladders, booster + garment filters — Flux
controls win wherever the two overlap). Trait engine in `src/girls-generator.js`
(`GirlsGenerator.helpers`, now a pure logic backend — its standalone tab is deleted), all
2,000+ options in `src/gg-data.js` (ported from the site's `improved-ai-girl-generator-*`
data generators plus its local style/roster lists), Flux embedding in `src/flux/girls.js`),
plus 🌊 Liquidizer
(a fully native port of `inynuyfq21` — photo breathing/waves/parallax animation with video/GIF/PNG
export — vendored as editable source in `src/liquidizer/` and rendered as a `type:"native"` embed,
so every control edits the local copy), plus 🎞️ Idle Image (an iframe embed of
`nexora-idleimage` — still-image idle-motion studio with GIF/WebP/MP4/WebM export; embedded
rather than vendored because it is a 500KB+ single-file app whose plugin instances would clash
with this generator's own), plus 🍮 Jiggle Studio (an iframe embed of `nexora-jiggle` —
animated transparent-sticker rigger with soft-body jiggle physics, APNG/GIF/spritesheet
export; same reasoning). Cross-origin iframes can't be
surgically trimmed, so the full builder (including its own Generate button) is embedded rather
than cloned — its trait lists live in encrypted sources. Gating is default-deny and
lives in two places: `showTab("private")` falls back to Home unless `window.__t2iIsOwnerAuthed()`, and
`src/private-tab.js` keeps the button `hidden`, boots the iframe only after unlock (`ensurePrivate`),
and bounces back to Home on lock (`t2i-owner-auth` + focus re-sync). The palette lists 🔒 Private only
while unlocked (`src/vault.js`). To add another private generator: `window.PrivateTabs.add({id, label,
ico, gen})` — no other file needs editing. Note the guarantee is tab visibility, not secrecy: the
source generator stays publicly reachable at its own URL; this tab just doesn't advertise or embed it
for non-owners. A tab with two or more embeds renders as one integrated block: inner pills
switch between the generators (lazy-loaded on first pick, then kept hidden so switching never
loses their state) with a single shared ↗ Open / 🔄 Reload row acting on the visible one;
single-generator tabs keep their plain heading + tools + frame. `embedsOf()` keeps single-generator
tabs working, and `PrivateTabs.add()` accepts `{hash, note}` plus a full `{embeds:[...]}` form.
Embeds may also be native (`{type:"native", render:"FluxTab"}`): rendered by a `window` module
into a div instead of an iframe, with ↗ hidden and 🔄 re-rendering the panel. Native embeds may
lazy-load via `{src:"src/mod.js"}` (injected on first open; `PrivateTabs.add()` preserves `src`).
**🧪 Style Forge** is a public tab of its own now (`#forge-app` + `i2p-tab-forge`, Create group):
`ensureForge()` lazy-loads `src/style-forge.js` on first open and renders `window.StyleForge`
into `#forge-host` (render is a no-op afterwards, so its state is kept across visits). Collect
reference images (drop/browse/paste, bulk .zip/.cbz import with filenames as labels, stored in kv `t2iStyleForge` with per-image label, source
prompt, notes), auto-analyze each one's visual style with AI vision, then forge one shared style
(name + prompt + negative) from the whole set. Forged styles keep a local library (single/all
JSON export, JSON import incl. multi-style files) with in-place editing (Load → edit → 💾 Save)
and 🧬 Evolve, which refines a style with a new set of reference images as a versioned (v2, v3…)
entry, and send one click into the Image Generator's 🎨 Custom Art Styles (“Forged
Styles” tab, live-refreshed via `window.__t2iCustomStylesRefresh`), so they work as styles
everywhere else in the app. The merged trait lists
are vendored verbatim from the `improved-ai-girl-generator-*` data generators that backed
`992s3wnk4h` (see `src/gg-data.js` for the full provenance).

### 🖼️ Community tab (ex-Pro community gallery)
`#comm-app` + `showTab("comm")`, nav button `i2p-tab-comm` (Create group, after Explore).
Hosts the 🖼️ Community Galleries card moved out of `#i2p-proimager` (✅ SFW + gated
🔞 NSFW feeds, 📤 Post from Personal) — same element ids, so `src/imager-pro.js`
(`initGallery`/`setGalTab`/feed builders) works untouched; `showTab("comm")` calls
`ensureProApp()` then `__proInitGallery()` (also covered on late script load), while
`showTab("pro")` keeps calling `__proOnTab(true)` as before. Registered everywhere a tab
must be: client `TABS`, server `TAB_NAMES` tally, simple-bar `ITEMS`, theme per-tab list,
mobile sheet `GROUPS` + `POPUPS.gallery` (`POPPARENT.comm = "gallery"`), Home tool grid
(now nineteen tools), vault palette (its old dead `comm` entry works again).
`openPublicGallery()` and the gen-tab moved-gallery notice now point at `comm`.
Each feed has a sort row — 🔥 Trending (platform order), 🆕 Recently uploaded
(platform `sort=new`, community-wide newest-first), ❤️ Most liked (platform
`sort=top`, community-wide), 👎 Most disliked (full pool pulled with `sort=top` +
`hideIfScoreIsBelow=-999`, then reversed lowest-ranked-first; auto-paginates, capped
at 12 pages). There is no native most-disliked sort (`best`/`worst`/bogus all fall
back to one default ordering — probed), hence the pull-and-reverse. Every card also
has 👍/👎 buttons: personal curation persisted per-browser in
`localStorage.t2iGalleryVotes_v1` (the platform's own votes need its Turnstile
verification + gallery-origin userKey, which our page cannot mint), one vote per
image, click again to undo (clicking the other side switches your vote — like and
dislike are mutually exclusive); the selected button lights up green/red with
`aria-pressed`, 👎 dims the card, 👍 outlines it green.

### 🔒 Owner console (overlay only — no tab)
The console is an overlay (`window.__t2iOwner.open()`, key-sequence `owner`), not a tab: the old
`#owner-app` + `#i2p-tab-owner` console tab is retired (`src/owner-tab.js` unloaded), so there is
exactly one menu entry into the console — a 🔒 Owner console action in the vault palette
(owner-gated) plus the mobile sheet's 🎛️ Owner console row. 🔒 Private stays separate: it is the
owner-only tools tab, not the console.

#### 🚩 Flagged review (inside the console)
The console's 🚩 section scans the live `public` feeds with the same child-safety
match the strips use (`src/moderation.js`: built-in minor-age patterns + the shared
rules file `mod-lists-v1`) and lists what would be hidden. Per card: ✅ Allow
(overrides the block on strips), 🚫 Ban user (or ↩️ Unban user when already
banned), ➕ Ban phrase, 🔗 Open, 📋 Copy (prompt + ids for a Perchance report).
Above the cards, a 🚫 Banned users manager lists every reversible shared-list ban
with a "↩️ Unban — I deem this okay" button, plus a paste-an-id row (🚫 Ban id /
↩️ Unban id, 16–128 hex chars) for ids not on screen. Unbanning takes effect on the
strips within ~10 minutes. 🔒 Built-in hardcoded ids are permanent and show
separately — they cannot be unbanned; use ✅ Allow per image for those. Rules persist in the public editable file
`editable.uploads.dev/file/<generator>/mod-lists-v1` (editKey stays on the owner's
device — back it up from the panel); strips pick them up within ~10 minutes. The
embedded full-gallery iframe only reads the built-in main.pjs bans, so the panel's
📋 snippet button produces the permanent-source version. Nothing here deletes from
Perchance's central gallery — that still needs a report to Perchance.

### 🌊 Motion Lab (owner-only Liquidizer embed)
Port of `https://perchance.org/inynuyfq21` (breathing, waves, sway, 3D parallax, motion
layers; MP4/WebM/GIF/PNG export), vendored into `src/liquidizer/` (`markup.html`, `app.css`,
`app.js`, `engine.js`, `exporter.js`, `models.js`, `presets.js`, workers, sample project) and
rendered as its own top-level pill in the 🔒 Private tab (next to 👱‍♀️ Girls Generator) — a
`type:"native"` embed (`render:"LiquidizerTab"`, booted by `src/liquidizer/loader.js`, whose
`<script>` tag sits next to the private-tab scripts in index.html). The loader injects the
markup into `#liq-root`, loads the stylesheet, and boots `app.js` with a `<script type="module">`
tag (base-safe — dynamic `import()` resolves against `<base>` and misses). Edit any file under
`src/liquidizer/` to change the studio: markup in `markup.html`, look in `app.css`, behaviour in
`app.js`/`engine.js`, one-click looks in `presets.js`. All element ids are unique page-wide
(the three that collided with generic names wear an `lq-` prefix and are read with bracket
notation, `el['lq-fileInput']` — dot notation is a syntax error there), and all selectors in
`app.css` are scoped under `#liq-root` (verified — no unscoped rules leak onto the rest
of the page). Note for future screenshots: full-page DOM-clone captures render a phantom
full-width bar across the stage area that exists in no live element (scoped capture of
`#liq-root` is clean) — a snapshot-tool artifact, not a layout bug.

### 🐺 Fluxinator tab (owner-only native remake of fluxinator)
Port of `https://perchance.org/fluxinator`, remade natively — no iframe. A second live
`t2i-framework-plugin-v2` instance can't share the page (single `window.input`, single
settings object, fixed IDs), so the port is: fluxinator's pjs DATA vendored into `main.pjs`
under its original names (styleGenres/styleTweaks, standardPos/Neg + cats/lists, all
body/face/skin/hair/clothes/object/nature/quality params + readers/phrase-builders,
hairstyles, `fluxArtStyles` (128, extracted from its settings), `fluxTestStyles` (39),
`fluxPhotoLab` (16 inputs) + flux helpers; dropped: its imports/`$meta`/framework
`settings`/royalty/randomDescription/bannedUsersList/photo-modifier lists, with
`[input.*]` tokens rewritten to `fluxDesc()`/`fluxNeg()`/`fluxMainStyle*()`) plus a native
tab in `src/flux/` (`prompt.js` = style/test selects + JS port of `styleFine()` genre
routing + `compose()` mirroring its imageOptions (now also appending the Girls-traits block
from `girls.js` — see below); `tab.js` = `window.FluxTab.render`:
description (`#fluxDescTa`) + 🎲 Random-prompt dice, negative (`#fluxNegTa`), style (`#fluxStyleSel`) / test-style
(`#fluxTestSel`) / shape / count / CFG / seed, Generate via `root.generateImage`,
exact-prompt readout, output grid, `fluxtab_*` persistence; `boxes.js` = its 25 prompt-tool
motherboards (Skin/Body/Face/Eyes/Hair/Hairstyles/Nature/Race/Profession/Objects/Materials/
Clothes/Accessories/Size/Shape/Quality/Pose/Manner/Condition/Surface/Color + 4 tag boxes +
Age row) mounted into the tab's own `#paramFrame`; `std.js` = its 4 🧬 standard rows
(339 chips); `photo.js` = native 16-select photo lab with one-slot-per-input semantics;
`flux.css`/`boxes.css` = its `fxp-`/`sdn-` styles). Registered first pill in
`src/private-tab.js` (`{type:"native", render:"FluxTab"}`). Re-render safety: the tab
re-renders on every pill visit, so `src/flux/boxes.js` carries a generation guard
(`window.__fluxBoxesGen`) — a fresh init bumps the generation and stale 700ms rebuild
timers self-terminate instead of resurrecting duplicate motherboards into the new frame
(without it, each visit stacked another copy of all 24 boxes and the same-ID copies
perpetually reordered each other = visible flickering).
**👱‍♀️ Girls-traits merge** (`src/flux/girls.js` = `window.FluxGirls`): the former Girls
Generator's trait engine lives inside the Flux tab (the standalone Girls tab is deleted) —
same boosters, character, Bestaigen set, body, scene, hair & face, outfit, pose & scene,
extras 1–13 and Genshin roster, rendered from the same `GGDATA`/`GGCHARACTER` through
`GirlsGenerator.helpers`, so the merged behaviour matches the original engine exactly. Overlap rule: Flux wins — description, negative, style, shape, count, CFG, seed,
resolution and quality/negative policy stay Flux's; only trait/booster/garment text (plus the
explicit extraNegative line) appends at compose time, and only while a trait is set
(all-Default = byte-identical Flux output). Traits are compose-time (virtual, never written
into the Description box), persist under their own `fluxtab_girlsTraits_v1` key (independent
of the Girls tab, whose data defaults differ — e.g. perfectAnatomy is ON-first there but
OFF by default here), and carry their own enable toggle (`fluxtab_girlsOn`). Flux cards additionally gained the Girls tab's
Personal-Gallery autosave/manual save (into a `Fluxinator` folder) and 🎨 To Gen — things
Flux never had, so nothing overlapped there. Deliberately NOT ported: tabbed
prompt editor (single boxes instead), backup/restore, private-gallery management, visit
counter + server script (one `x-server-plugin` per page), moderation, per-style photo
modifiers, manual style-mixer/gush/fine-tune chip editors (their FILTERS still apply in
`compose()` when state exists) — the studio already covers gallery/backup/presence.

### 🖼️ Listing-image refresher (owner console)
`$meta.image` is a fixed file, so the generator-list picture can't rotate itself — but the
console has a three-step flow that gets 90% of the way there, all from **fresh generations**
(nothing borrowed): **1.** `✨ Generate 10 fresh images` picks 10 random prompts from a 418-prompt SFW showcase pool
(landscapes/anime/fantasy/city/wildlife/food/ocean/space, 768×512, anti-NSFW negative) with the
full prompt in `saveTitle`/`saveDescription`; `💃 Generate 10 SFW beauties` is the same flow with its own
164-prompt pool of modest, fully-clothed portraits of beautiful women (768×512, stricter anti-NSFW negative,
`Listing beauty:` titles, including 35 `hw-` Halloween portraits: cozy witch, pumpkin patch, vampire, tarot, masquerade…; ticking 🎃 Halloween prompts only limits the batch to those) — per-frame 🔄 refresh keeps the originating pool's opts via the frame's `beauty` flag; **2.** each frame renders the platform's own
publish tile (same prompt+seed regenerates ≈the same image, heart included — the save API is
WAF-guarded same-origin, so the ❤️ → 📮 two-click flow with gallery name `public` is the only
path, same pattern as Pro's 🌍 post), landing the images in the Community tab's galleries with full
prompts; a `savedImageToGallerySignal` listener counts confirmations. **3.** `🎬 Build GIF`
prepends two live screenshots of the Home tab from a single capture (top/hero slice first, then
a crop vertically centered on the All-tools grid — via the html-to-image library: full-page capture,
top slice cover-fit to the listing ratio, the crop vertically centered on the All-tools grid
(hero fallback, top fallback), live media kept when embeddable with a placeholder
fallback retry if cross-origin images break the render, no brand band so the UI stays fully
visible, longer 2.2s hold). The capture pins `#home-app`'s side margins to `0` for the shot
(html-to-image bakes the viewport-dependent auto-margin px into its clone, so on wide screens
the content renders shifted sideways and the centered crops miss — restored afterwards), and then encodes those same 10 dataUrls (cover-fit 640×426 + brand band, `gifenc` via jsDelivr ESM —
esm.sh interop returns an empty default) and uploads through `upload-plugin`. The result shows
a preview + URL with a 📋 copy button; the owner pastes it into main.pjs `$meta.image` and
saves (that last step can't be done from the page). Costs ≈20 image generations; last-build
time persists in `localStorage.t2iListingGifTs` with a 6-hour "due for a refresh" nudge. The
owner eyeballs every frame twice (generation + publishing), which is the listing-safety gate.
Auto-save: every fresh frame (including 🔄 refreshes) and every built GIF also lands in the
Personal Gallery ▸ `Listing GIF` folder with its prompt — fire-and-forget via
`t2iAddImageToGallery` / `t2iAddImageWithUrl` with an explicit folder override (the GIF reuses
its already-uploaded URL instead of uploading twice), progress in the `t2i-owner-saveline`
line, and a generation is never blocked by a gallery failure.
**🗂️ Pick from folder:** `🗂️ Pick frames from Listing GIF folder` opens a picker that reads
that same folder back (`window.t2iGetGallery()`, else `localStorage.t2iGalleryItems`, matched
case-insensitively), shows every image as a tap-to-select card (any count, tap order = play
order with numbered badges, ☑️ All / ✖️ Clear / ↻ Reload), and `➡️ Use N selected → Build GIF`
fetches the picked URLs to dataUrls (fetch → blob → dataUrl, with an Image/canvas fallback)
then runs the SAME shared `encodeListingGif` pipeline as 🎬 Build GIF — same gifenc encode,
same upload, same preview + 📋 Copy URL — except picked GIFs contain ONLY the selected images
(no Home screenshots are prepended, unlike the fresh flow which adds 2). The fresh-frames
Generate flow is untouched; `buildGifFromFresh` is now a thin wrapper over the shared encoder.

### 🏠 Home-only ("bounce") visits (owner-only)
The graph under the tab tally answers "how many people leave without ever opening another tool?".

- **Definition**: a **visit** is one socket connection that reported at least one tab view; it is
  classified **once, when the connection closes** — *home-only* if every tab it reported was
  `home`, *explored* if it ever reported anything else. A page that reports nothing at all (an
  instant close, prefetch, or a socket that dies before the 1.5s first-paint report) is never
  classified, so it can't read as a bounce. Owner and automation connections are excluded by the
  same check `noteTabView` already uses. Counting is per visit, not per person: opening the site
  twice is two visits.
- **Where the counting lives**: `noteTabView` adds the connection to `connSawTab`, plus
  `connSawOtherTab` when the tool isn't Home (two `Set` adds, still no JSON — the report path stays
  cheap); `self.onclose` calls `noteVisitEnd()`, which deletes both entries, bumps
  `sessHomeOnly`/`sessExplored`, and stamps the visit into `bounceHome`/`bounceExp` — a
  `BOUNCE_HOURS` (168) ring of hourly buckets keyed by `bounceHour`. The ring holds the last 7
  days of endings, so a console opened hours later can still put each visit on the right day. All
  of it is in memory, like the tab tally, and shares `tabEpochStart` (one server-globals rebuild
  resets both).
- **Timezone**: the server can only stamp an absolute hour (it can't know the viewer's timezone),
  so `ownerBounceStats` sends `hours: [[hourIndex, homeOnly, explored], …]` (non-empty slots only)
  and the *client* maps each hour to a local calendar day.
- **Surviving restarts**: the console folds the running tally into a record in
  `localStorage.t2iBounceStats_v1` — all-time `home`/`explored` counters (delta-folded against
  `lastHome`/`lastExplored`) plus a per-local-day history (`days`, capped at `BOUNCE_KEEP_DAYS` =
  60 days, pruned oldest-first), with `lastHours` remembering which buckets have been folded.
  A new epoch clears the `last*` bookkeeping so the fresh tally counts from zero. The record is
  loaded defensively (`^\\d{4}-\\d{2}-\\d{2}$` day keys, numbers clamped, null-prototype maps).
  **Reset** calls `ownerBounceReset` and clears the local record.
- **UI**: `renderBounce()` prints the headline ("57% of 80 visits ended without opening another
  tool (46 left · 34 explored)"), then `bounceChart()` draws a stacked column per local day —
  accent = home-only on top of a muted = explored base, over a faint full-height track so empty
  days still read as dated slots, with the day's total printed above each non-empty bar and day
  numbers every third slot (counted back from today, so the newest day is always labelled). Hovering
  a column gives the exact split. The window is `BOUNCE_CHART_WIDE` (14) days, narrowing to
  `BOUNCE_CHART_NARROW` (10) below 420px so the labels stay legible on a phone, followed by a
  legend and a footnote (first `callOptional()` error → "not available on the running server
  build"). Everything is plain DOM/CSS, no chart library.

### ⏱️ Image-gen timing — "ideal times" (owner console + public Home card)
Answers "is now a good time to generate?" from the owner's own history — recorded owner-only,
published to visitors only when the owner says so.
- **What feeds it**: `⏱️ Probe now` generates one tiny 512×512 probe and times it; the
  listing-image flow (`Generate 10 fresh images` + per-frame 🔄 refreshes) is wrapped in
  `timedGenImage()`, which records timing and passes the result through untouched. Timed only
  while the console is unlocked.
- **Storage**: `localStorage.t2iGenTime_v1` — `[dayMs, localHour, sizeClass, ms, ok]` samples,
  60-day (`GENTIME_KEEP_DAYS`) window, 5000-sample cap. Size classes keep 512×512 probes ("small")
  separate from listing frames ("large"); only successful runs move the bars. Hours are the
  viewer's local hour, since the advice is read by the owner in their own timezone.
- **Owner UI** (`renderGenTime()`): a "Right now (your H:00 hour)" median verdict (🟢 good ≤25s / 🟡 slow
  ≤60s / 🔴 rush hour, calibrated against a ~14s quiet-service probe), fastest/slowest hours once
  two hours have ≥3 runs each, and a median-per-local-hour chart reusing the console's column
  styles (tallest bar = slowest hour, accent = current hour, seconds above each bar, tooltips with
  medians and counts). Refresh re-renders without losing the last-probe headline.
- **🌍 Publish to Home**: the console's publish button sends one compact aggregate
  (`buildGenTimePayload()` → `{v, at, tz, n, f, med[24], cnt[24]}` — hourly medians + counts only,
  never raw samples) to the server's `ownerGenTimePublish` (admin-only, shape-validated, 2000-char
  cap, memory-only like the announcement banner). `Clear` publishes `""` to hide the card again;
  the pub note under the buttons shows what's live ("On Home now: N runs, updated X ago").
  Server side: `GENTIME_TOPIC` fan-out + replay on open, public `genTime()` read ("" = unpublished).
- **🔁 Auto probe + publish** (default ON, toggle in the console, persisted as
  `localStorage.t2iGenTimeAutoV1`): while the console is unlocked — and only then, so
  visitors never burn quota — one tiny probe runs every 30 min (`GENTIME_AUTO_MS`) and the
  summary republishes right after. Timer starts on unlock (including the remembered-session
  restore on boot) plus one first cycle ~15s later, stops on lock; ticks skip when a probe
  is already running. Status line shows the next run time. Exposed as `window.__t2iGenAuto`
  (`tick`/`start`/`stop`/`sync`).
- **Public Home card** (`#hm-gentime-wrap`, directly under the hero): one combined card whose
  timing section (`#hm-gentime-body`) is hidden until something is published, then shows the "Right now" verdict, fastest/slowest hours, and a median-per-hour chart
  (`hm-gentime-*` styles, 24 columns desktop / last 12h under 420px). The client shifts the owner's
  hours into the visitor's local hours via the payload's `tz` offset, shows the payload age
  ("updated X ago", stale-flagged past 7 days), and refreshes live on publish/clear events
  (`window.__t2iGenTimeUpdate`, installed by the presence script) plus a 2-minute refetch inside
  the `window.__homeRefresh` chain. The headline also carries the current UTC time from the
  visitor's own clock (`utcNow()`, `HH:MM UTC`), kept ticking every 15s by a single guarded
  interval (`window.__t2iGenTimeClock`) that updates only the `#hm-gentime-utc` span.

### Provenance — where each tool came from
| Tool / feature | Upstream generator |
| --- | --- |
| Tab 2 Image Generator | plugin `t2i-framework-plugin-v2` + `text-to-image-plugin` (plus 3 👱‍♀️ Girl Lab styles + realism-guard fns ported from `ai-girl-lab-generator`, 7 🍑 Peak Form styles ported from `peak-female-form-generator`, ~515 ✨ Bestaigen styles in 24 categories ported from `bestaigen` as `bestaigenStyles`, with its `photo/anime/furry/landscapeModifiers` shot/color/effect/genre dropdowns and the `artQualityTags`/`drawn`/`render3D`/`art`/`paintingDefaultNegative` base lists, plus 365 🌸 Qinegen styles in 5 packs ported from `qinegen` as `qineUrvillainStyles`/`qinePerStyles`/`qineAagaStyles`/`qineSjStyles`/`qineAnimePhotoStyles` — Urvillain/Perstyles/AAGA/SJ/Qine-Anime-Photo, per-style modifier dropdowns not ported, plus its 📐 Display size box, 👤 Username box, and 🎨 Custom Art Styles tabbed manager ported as the collapsible (collapsed by default) `src/custom-styles.js` panel + `customStylesPrompt()`/`customStylesNames()` prompt/title hooks) |
| Style Mixer + fine-tune panel | `ai-artgen` |
| Simple/Basic/Advanced modes, 🎲 Random Style, workbench | `nexora-free-ai-anime-generator` |
| Tab 3 Prompt Evolution | `improved-image-prompt-optimizer` |
| 🖼️ Personal Gallery tab (large saved-images view) | original to this studio (reads `src/gallery.js` store; inline grid with search/folder/sort/favourites + a ☑️ Select mode for bulk delete, per-card vault/send/download/delete, lightbox; 🧰 Manage opens the full modal) |
| 🌐 Explore tab (public-gallery browser) | inspired by `perchance-pro-gallery`, original implementation in `src/explore.js` + shipped directory `src/explore-directory.json` (118 gallery-bearing sites, snapshotted via the same tag-sweep discovery; user-added sites persist in kv) — read-only browsing, never reposts, except the explicit 📤 Post from Personal button: picks one Personal Gallery image, re-opens its saved prompt in the platform's gallery-save embed iframe (fresh variation, seed −1 — exact pixels can't be re-uploaded), user finishes with ❤️ → 📮 send to gallery under `public`. Its second sub-tab, 🔍 Gallery Viewer (`#xpl-viewer-pane` → `#xplv-frame`), embeds `rm-gallery-viewer` (BlackYT's Prompt Hunter fork: cross-generator prompt search, re-generate, save) with the Media-to-Links recipe — lazy iframe boot, hover pull-down bar, ⛶/🔄/↗ controls, never auto-suspended (`XPLV` wiring in index.html's main script, hooked into `everyBar`/`anyPaneFsActive`/Esc/`resize`/`showTab`); choice persists in `localStorage.t2iExploreSubtab`; third sub-tab, 🧵 Gallery Finder (`#xpl-finder-pane` → `#xplf-frame`), embeds `slinkys-gallery-finder` (follow seeds/prompts/users across 300+ galleries, hidden-sub-gallery scan, remix) with the same recipe/controls; 📥 Importer (`src/explore-importer.js` — toolbar button + drag-drop anywhere on the tab + ⋯ menu action on every public image: bulk URL / file import into the Personal Gallery with prompt + title preserved, CORS-free proxy fallback) |
| Tab 4 Theme Studio (UI-editor design) | `bigger-and-better-ai-chat` |
| Tab 5 Image Editor | `ried` |
| Tab 6 Pro Imager (styles, mixers, themes) | `ai-imager-pro-4-x` |
| 🖼️ Community tab (SFW + gated 18+ NSFW public-gallery feeds, 📤 Post from Personal) | original to this studio (moved out of the Pro Imager tab; feeds read the same `public` channel via superFetch, behaviour still in `src/imager-pro.js` wired as `window.__proInitGallery`, lazy-loaded on first open of the tab) |
| Tab 7 AI Photo Editor | `sgdtlwdl1u` |
| Tabs 10/11 AI Chat · AI Chat Lite | native classic chat (`chat-engine.js` + `aichat-classic.js`) · `ai-character-chat` |
| Persona ↔ chat hand-off | framework → `ai-character-chat` share URLs |

Not ports (original to this studio): Tab 1 Image to Prompt (JoyCaption-*style*),
Tab 8 Comic Scanner, the Persona workspace shell, the theme/gallery/vault glue.

## 🌍 Public-use friendliness (onboarding, deep links, expectations, translation)

- **🌐 Site translation**: the first button in the top hub bar is a 🌐 Language
  button (icon-only on small screens, so it reads without words). It lazy-loads
  Google's Translate Element on first click — nothing translation-related loads
  before that — and shows a menu of 25 languages with native names (Español, 中文,
  العربية, …) plus a filter box. The choice applies in place (no reload), persists
  in `localStorage.t2iLang` (plus the standard `googtrans` cookie), and is
  re-applied on later visits. Picking English restores the original text. Google's
  own banner/toolbar frames are hidden with CSS (`body{top:0!important}` etc.), and
  the menu carries `translate="no"` so language names are never mangled. Early
  change events can fire before Google's handler is ready, so the apply is retried
  until `<html>` gains its translated class (or the target is English). The menu is
  a two-column (single-column under 420px) scrollable list with 44px rows, a ✓ on
  the active language, and auto-scroll to it on open; Google's own top banner is
  hidden (`body > div.skiptranslate` + `body{top:0!important}`) since the menu's
  ✕ English row is the way back.
Everything here is plain markup/CSS in index.html plus a few small script blocks
— no new imports, no new files.

- **🔗 Deep links (`#/<tab>`)**: `showTab` mirrors the active tab into the URL
  fragment as `#/gen`, `#/pro`, … via `syncHash()` (called from `showTab`), and
  an initial `initRoute()` + a `hashchange` listener restore the tab from the
  fragment. So `https://perchance.org/<generator>#/pro` opens straight into Pro
  Imager, and the browser **back/forward buttons move between tabs**. On
  mobile/narrow viewports (<720px, same breakpoint as the bottom nav) `initRoute()`
  always starts on **Home** instead, ignoring any `#/<tab>` fragment.
  - `history.pushState` MUST be given an ABSOLUTE same-origin URL here: a
    relative one resolves against the platform-injected `<base>` (which points
    at the top-level `perchance.org/<name>` page) and throws a `SecurityError`.
    `syncHash` therefore passes `location.href.split("#")[0] + "#/gen"`.
  - Writes are skipped by `hashIsReserved()` while the fragment holds a
    `#recipe=…` share link, and while it is the editor preview's `#edit` — that
    fragment is how the presence script detects the owner/AI agent (see above),
    and it is why the Image-Editor tab's hash is `#/edit`, never bare `#edit`.
  - The `hashchange` listener applies the same rule: a `#recipe=…` fragment is
    **not** treated as an unknown tab (which used to bounce the user to Home).
    It instead calls `Recipe.offer()` — newly exposed by vault.js — so pasting a
    recipe link mid-session pops the "Apply it / Dismiss" banner without a reload.
- **👋 First-visit guide** (`#hm-onboard`): a three-step card at the top of Home
  ("pick a tool · they feed each other · your work stays here") shown once per
  browser until it is dismissed or any of its buttons is used
  (`localStorage.t2iOnboarded`). While it is open, `__homeRefresh` suppresses the
  "continue where you left off" card so the two don't stack.
  - `Esc` tucks the guide away **without** setting the flag (that key also closes
    other panels, so it shouldn't count as "seen it") — only the ✕ / "Got it"
    buttons persist the dismissal. Fixes the case where pressing Esc to close
    some unrelated overlay retired the guide for good.
- **🔤 Plain-language hero**: Home's title/sub are now a value proposition
  ("Turn a photo or an idea into art …") rather than app jargon — the brand name
  in the header is unchanged.
- **💡 Tooltips + ⭐ Popular**: every tab button carries a `title` explaining what
  it does, and the three most-used ones (Image Generator, Pro Imager, Persona
  Generator) are marked `data-pop="1"`, which renders a ⭐ superscript via
  `.i2p-tab[data-pop]::after` (the Home tool cards show a matching `.hm-pop` star).
- **🧭 "Good to know" card** (bottom of Home, `.hm-know`): sets expectations in
  plain words — generations take **10–60s**, the service is **shared/rate-limited**
  (retry after a minute; small batches are gentler), and **all work is stored in
  this browser** (clearing site data erases it). It ends with the existing
  `data-act="backup"` / `data-act="saveall"` buttons so the advice has a fix
  right next to it.
- **♿ Focus & motion**: a global `:focus-visible` outline (using `--th-accent`)
  makes keyboard focus visible everywhere (plus explicit rules on tabs/hub
  buttons/`.i2p-btn`), and the `prefers-reduced-motion` block now also disables
  the `.hm-tool`/`.hm-stat` hover lift. **Esc** closes the saved-images gallery
  (bubble-phase listener that clicks `#t2iGalCloseBtn`, skipped in pick-mode);
  the lightbox, comic reader, persona modals, evo fullscreen, chat fullscreen and
  the ⌘K palette already handle Esc themselves in the capture phase.
  - The gallery-Esc handler must NOT fire for an Esc aimed at another overlay:
    the ⌘K palette closes itself and detaches its DOM *before* this bubble-phase
    handler runs, so it tests `e.target.closest("#cpalOverlay")` (which still
    works on the detached tree) rather than looking the overlay up.
- **🐛 Fixed while bug-checking**: Home's `NAMES` map (used by the "continue where
  you left off" card) was missing `chat` / `chatlite`, so returning from either AI
  Chat tab left the card silently blank. Both are now mapped.
- **🐛 Fixed while bug-checking #2**: `tabFromHash()` parsed the fragment with
  `/^#\/([a-z]+)$/`, whose character class has no digits — so `#/i2p` (the only
  tab id containing a digit) never matched and every deep link into Image to
  Prompt silently fell back to Home, including on a fresh load. Now
  `/^#\/([a-z0-9]+)$/`.
- **🐛 Fixed while bug-checking #3**: the nav buttons called the *local* `showTab`,
  bypassing the `window.showTab` wrappers that `reportTab()` (server tab tally →
  🔥 trending + the owner console's "most opened" chart, and the "left without
  exploring" bounce stat) and the 🧭 explorer-progress hook are installed on. So
  every ordinary tab-bar click went unrecorded: trending and the tally only ever
  saw `data-go`/palette navigations, and "N of 16 tools tried" stayed stuck. The
  16 tab handlers (plus `initRoute` and the `hashchange` handler) now route
  through `window.showTab`, so a normal click reports exactly like any other
  navigation (the wrappers compose and are transparent, so nothing double-fires;
  `reportTab`'s 2-second same-tab collapse still applies).
- **🐛 Fixed while bug-checking #4**: Pro Imager's content-warning gate blocked
  *every* control in the tab (measured 85 of 89 at desktop width, 100% at phone
  width, and the sticky header too — the gate is `z-index: 9998` over
  `inset: 0`, so the ☰ hub buttons were unreachable while it was up), and
  `syncGate()` re-armed it on every `showTab` into the tab: agree → leave →
  return and the whole tab was dead again, unless "do not show again" had been
  ticked (which permanently sets `imagerProGateDoNotShow`). Agreeing now also
  records `imagerProGateAgreedSession` in sessionStorage, so the warning appears
  once per visit; disagree still re-arms (correct — no agreement was given) and
  routes to Tab 1.

## 🎵 Music player + 🖼️ Backgrounds hub (site-wide, hub bar)
Two site-wide systems on the hub bar, modeled on bigger-and-better-ai-chat
(see Credits — its tag-reader parsers are vendored into `src/media-player.js`).

- **🎵 Music** (`src/media-player.js`, static tag, `window.musicPlayer`, `#mp-hub-btn`):
  playlist from pasted links / device uploads (`root.uploadPlugin`) / drag & drop,
  per-row play indicator, title/artist, source badge, duration, move up-down,
  rename (sticky `customTitle`), copy-link, remove; header with song count +
  total time, filter, sort (playlist order / A–Z / longest / source), play-all +
  shuffle; transport (prev/play/next/stop, shuffle, repeat off→all→one, 0.5–2×
  rate, mute + volume, seek + elapsed/total); MediaSession wiring (OS keys,
  lock-screen); keyboard while open (space, arrows, N/P/M/S/R). Real titles and
  covers are read from each file's own tags (ID3v2/v1, APEv2, FLAC/Ogg, MP4,
  Matroska, RIFF — head streamed-then-cancelled + preflight-safe tail range,
  3-at-a-time; failures stay un-tagged and retry later). State in
  `localStorage.t2iMusicState`, kv-mirrored at `t2iMusicPlaylist/list`; covers
  are blob URLs and never persist. A `#mpMini` pill (prev/play/next + title)
  appears once a track is loaded so music keeps going while you browse tabs.
- **🖼️ Backgrounds** (`src/backgrounds-hub.js`, static tag,
  `window.siteBackgrounds`, `#bg-hub-btn`): site backgrounds from pasted links /
  uploads (images downscaled pre-upload) / drag & drop / the gallery's saved
  page-background links; enable switch + status, 🚫 none, 🔀 shuffle, ⏱️ rotate-2m, export /
  import / clear, filter, per-row use / up / down / rename / remove. The active
  background paints on its own `#bgSiteLayer` (fixed, z-index −1, videos muted +
  looped) and wins over the gallery's single page background while enabled —
  turning it off reveals that background again, and the header picks up the same
  translucent treatment via `body.has-site-bg` (which also makes the tab shells
  transparent, so the layer isn't covered when no gallery background is set; the
  layer is kept after `#t2iBgLayer` in the DOM so it paints on top of it). Starts OFF with an empty
  library (the gallery's current page background, if any, is seeded in as an
  inactive row). State in `localStorage.t2iSiteBg`, kv-mirrored at
  `t2iSiteBackgrounds/list`. ⏱️ Rotate (persisted `rotate` flag, one setInterval)
  shows each background for 2 minutes in list order, wrapping around; any manual
  pick restarts the window, ticks pause while the hub is off, and reload resumes it.
- **Honest deltas vs the chat original:** no per-character scene layer (there are
  no chat scenes here), no "From this chat" (no chat messages — the hub reads the
  gallery's saved links instead), no "post link into chat box" (rows get 📋
  copy-link), no scene-music interplay, and rename uses the native prompt().

## 🖼️ Tab 1 (default): Image to Prompt
A Joy-Caption-style tool: upload / drag-drop / paste an image, pick a caption style,
and get a ready-to-use prompt for AI image generators, streamed in via the
ai-text-plugin's vision support.

- Import: `generateText = {import:ai-text-plugin}` in main.pjs.
- All UI + logic lives in index.html: markup `#i2p-app`, styles prefixed `.i2p-*`,
  and an IIFE script that sits directly above the image-generator script.
- The model call builds a prefix-cache-friendly instruction array:
  static SYSTEM text → caption-type task → length → optional user focus → image File
  (image placed LAST so the text prefix stays cacheable across different images).
- Caption types (TYPES array) mirror Joy Caption: descriptive, tag-style, cinematic,
  one-liner, deep detail. Lengths: short / balanced / long. Optional "Focus" box.
- Every image is downscaled client-side (`shrinkForModel`, max 1024px JPEG) before
  it reaches the model — big phone photos used to time out or fail, small images
  pass through untouched. Exposed as `window.__i2pShrinkForModel` for testing.
- "🖼️ Try a sample photo" loads `src/samples/sample-coast.jpg` /
  `sample-portrait.jpg` (alternating) through the same file-input path as a drop,
  so visitors can try captioning with nothing to upload.
- "🎨 Use in Image Generator" writes the prompt into the t2i description textarea
  (`#i2p-imggen [data-name="description"]`) and switches tabs.

## 🎨 Tab 2: Image Generator
The original t2i-framework-plugin-v2 text-to-image generator (configured in main.pjs
`settings`), plus the large custom `src/gallery.js` script (lazy-loaded on first
open of the gen/Pro/AI-Photo/Comic tabs; online gallery with cloud sync
via upload-plugin editable files, scratchpad, page background, NSFW filter, etc.).
The page-background feature uploads locally chosen files to a permanent
user.uploads.dev URL via `root.uploadPlugin` (images are downscaled to ≤1920px
JPEG; GIFs/videos upload raw), stored in `localStorage.t2iBgSettings` along with
the file's `deletionUrl`, and re-applied on boot. Replacing the background frees
the old uploaded file (best-effort delete, works within 3 days of upload); if an
upload fails it falls back to a session-only blob URL.
The same modal is now a 🖼️ Backgrounds library: pasted/applied/uploaded URLs are
stored from links in `localStorage.t2iBgLibrary` (cap 200, kv-mirrored at
`root.kv.t2iBackgrounds/list`) and shown as a thumbnail grid — click to apply,
✕ to forget, 💾 save URL to keep a link without applying it. API:
`window.t2iBackgrounds.{list,save,remove,open}`.
It's wrapped in `<div id="i2p-imggen" hidden>` and shown via the tab bar.
A static `<script src="src/framework-input-shim.js">` right after the
`[generateInterfaceHTML(settings)]` line guarantees every framework
`.input-ctn` text input/textarea has a callable `oninput` (and every select a
callable `onchange`). The framework calls `inputEl.oninput({})` unguarded from
its 🎲/🧠/➕ buttons and modifier selects, so any input whose inline handler
goes missing throws `TypeError: inputEl.oninput is not a function`; the shim
repairs those with an equivalent fallback and leaves existing handlers alone.

### ai-artgen-style features (added on request)
- **Style Mixer**: three framework-native `userInputs` selects in main.pjs —
  `mixMedium` (35: leaf `None` + 34 media) / `mixVibe` (32: `None` + 31 vibes) /
  `mixArtist` (node options with a
  `prompt` subkey). Selected node's `.prompt` is appended to the prompt via the
  top-level pjs function `mixerSuffix()` (reads `window.input`, joins non-None
  picks, returns "" when none). `prompt = [input.artStyle.prompt][mixerSuffix()]`.
- **💡 Lighting select** (ported from `male-ai-beauty-generator`): a framework-native
  `userInputs` select `lighting` with `options = [lightingList]` — `Not set` (""),
  `🎲 Random` (`__random__`, re-rolled per image) plus the site's 15 setups (Golden
  hour … Hard flash), 15 more (Sunrise … LED panel), 9 from `vivid-image`
  (Natural Light … Volumetric Rays), and 30 more (Torchlight … Underlight)
  — 69 in all. Resolved by top-level pjs fn `lightingClause()` (reads
  `window.input.lighting`, handles raw-string or node values) and wired into the
  prompt as `[...][customStylesPrompt()][lightingClause()][advVariations()]`, and
  into the 🧪 inspector via `t2iComposedPrompt()`.
- **🖼️ Crop select** (ported from `male-ai-beauty-generator`): a framework-native
  `userInputs` select `crop` — `Not set` (default, adds nothing) plus 10 framings
  (Extreme close-up … Detail crop), `vivid-image`'s 10 🎬 Camera shots
  (Candid Snap … High Angle), and 12 more (Dutch Angle … Environmental Portrait)
  — 32 in all (each mirrored in `framingClause()`'s map). Resolved by top-level pjs fn
  `framingClause()` (reads `window.input.crop`) and wired into the prompt as
  `[customStylesPrompt()][framingClause()][lightingClause()]`, and into the 🧪
  inspector via `t2iComposedPrompt()`.
- **🎭 Mood select**: a framework-native `userInputs` select `mood` with
  `options = [moodList]` — `Not set` (""), `🎲 Random` (`__random__`, re-rolled per
  image) plus 36 emotional atmospheres (Joyful … Sunlit) and `vivid-image`'s 36
  🧏🏻 facial expressions (Happy … Dazzled/In Awe) plus 12 more (Curious …
  Peace Sign) — 84 in all. Resolved by top-level
  pjs fn `moodClause()` and wired into the prompt as
  `[framingClause()][moodClause()][themeClause()][lightingClause()]`, and into the
  🧪 inspector via `t2iComposedPrompt()`.
- **🎪 Theme select**: a framework-native `userInputs` select `theme` with
  `options = [themeList]` — `Not set` (""), `🎲 Random` (`__random__`, re-rolled per
  image) plus 58 settings/occasions (Spring … Detective Noir). Resolved by top-level pjs fn
  `themeClause()`, wired into the prompt and the 🧪 inspector the same way.
- **🦸 Archetype select**: `userInputs` select `archetype` with `options = [archetypeList]` —
  `Not set` (""), `🎲 Random` (`__random__`, re-rolled per image) plus 144 archetypes
  (Knight … Governess, incl. a 16-entry domestic set: Housewife … Governess). Resolved by `archetypeClause()`, wired into the prompt as
  `[framingClause()][archetypeClause()][characterClause()][occultClause()]…`,
  and into the 🧪 inspector via `t2iComposedPrompt()`.
- **🧍 Character select**: `userInputs` select `character` with
  `options = [characterList]` — `Not set` (""), `🎲 Random` (`__random__`, re-rolled
  per image) plus 334 anime figures: the ~120 `vivid-image` figures (Toki …
  Kurumi) plus the 167 nexora characters missing here (ported from
  `nexora-free-ai-anime-generator`'s `src/characters.json` search dropdown:
  201 entries, 32 overlaps skipped, 2 exact duplicates dropped) plus the
  47-entry 🗡️ Genshin roster (copied from the Girls trait engine's
  `genshinChar` input in `src/gg-data.js`, keys prefixed `(Genshin)`),
  each appending its own appearance description. Resolved by
  `characterClause()`, wired into the prompt as
  `[archetypeClause()][characterClause()][occultClause()]…`, and into the 🧪
  inspector via `t2iComposedPrompt()`.
- **🔮 Occult select**: `userInputs` select `occult` with `options = [occultList]` —
  `Not set` (""), `🎲 Random` (`__random__`, re-rolled per image) plus 40 dark
  supernatural archetypes (Witch … Baba Yaga). Resolved by `occultClause()`,
  wired into the prompt as `[archetypeClause()][characterClause()][occultClause()][outfitClause()]…`,
  and into the 🧪 inspector via `t2iComposedPrompt()`.
- **👗 Outfit select**: `userInputs` select `outfit` with `options = [outfitList]` —
  `Not set` (""), `🎲 Random` (`__random__`, re-rolled per image) plus 50 outfits
  (Jeans and tee … Bathrobe) and `vivid-image`'s 36 👗 Outfit entries
  (Wedding … Grey oversized) — 86 in all. Resolved by `outfitClause()`, wired the same way.
- **🤸 Pose select**: `userInputs` select `pose` with `options = [poseList]` —
  `Not set` (""), `🎲 Random` (`__random__`, re-rolled per image) plus 44 poses
  (Standing … Wall Lean) and `vivid-image`'s 18 🧘 Pose entries
  (Lying … Leaning Forward) — 62 in all. Resolved by `poseClause()`, wired the same way.
- **📍 Location select**: `userInputs` select `location` with `options = [locationList]` —
  `Not set` (""), `🎲 Random` (`__random__`, re-rolled per image) plus 20 locations
  (Beach … Waterfall) and `vivid-image`'s 43 🌍 Location entries
  (Cozy Bedroom … Gaming Room) — 63 in all. Resolved by `locationClause()`, wired the same way.
- **Fine-tune panel** (Guidance · Seed · Signature): injected by a small IIFE
  script (in `src/gen-extras.js`) as a sibling AFTER `#userInputsCtn8462746262`
  (NOT inside it — the framework's init loops iterate every input inside that
  container and would throw on unspecced elements). Collapsible via its header
  (collapsed by default, `localStorage.t2iFtCollapsed`). Writes to `window.input`
  + localStorage (`aiag_*`), which the framework reads at generate time because
  imageOptions is evaluated then. Wired into imageOptions:
  `guidanceScale = [guidanceValue()]` (CFG copied from
  `best-image-generator-by-nexora`: 1–30 fixed, 31 = 🎲 Random rolling a
  fresh 7–30 per image; old half-step saves migrate by rounding),
  `seed = [String(input.seed || "").trim() ? Number(input.seed) : -1]`,
  `saveDescription = [galleryDescription()]` (pjs fn: "By <sig> | <date>" + prompt,
  empty when no signature).
  - The panel also starts with a **🎨 style-info line** (`#ft-style`): it reads the
    option currently selected in the 🎨 Art Style dropdown, looks its node up in
    `userInputs.artStyle.compiledOptions` (by display name, with a `getName()`
    fallback) and prints that node's `description`. It hides itself only when a
    style has no description at all, and in Simple mode (the whole `#ft-panel`
    is hidden there). Refreshed on a document-level `change` for
    `[data-name="artStyle"]` (covers the select's own onchange and Simple-mode's
    `applyPlan`), on init, and once again 1.5s later.
- **🎨 Art Style hover hints** (`src/style-hints.js`, script tag right after
  `artstyle-search.js` in `#i2p-imggen`): every one of the ~1780 dropdown options
  carries a one-line visual hint as a hover tooltip (`option.title`). The 109 lab
  styles already had real descriptions; the other ~1120 are curated one-liners in
  the `STYLE_HINTS` table (keyed by exact dropdown text), painted onto the options
  and onto the framework nodes themselves (a pre-existing "Ported from \u2026"
  credit is preserved after the hint) — so the 🎨 style-info line above shows
  them too. Repaints on a throttled document-wide MutationObserver, so titles
  survive the search box's option rebuilds; `window.__styleHintsPaint()` forces
  a repaint.

### multistyle-image-lab styles (ported from perchance.org/multistyle-image-lab)
- **93 style-locked styles** now sit in the 🎨 Art Style dropdown, right after the
  imported t2i-styles block. They are defined in the top-level pjs list
  `multiStyleLabStyles` (bottom of main.pjs, ~180KB) and pulled in by a SECOND
  `meta:import` — the framework supports several, each becoming its own option
  group. Importing a LOCAL list requires `from = [multiStyleLabStyles]`: a bare
  `from = multiStyleLabStyles` is parsed as the string "multiStyleLabStyles" and
  throws `item.options[key].from.selectAll is not iterable`.

### furry-generator styles (ported from perchance.org/ai-furry-generator)
- **204 active styles** in the 🎨 Art Style dropdown under a disabled
  `──── 🐾 Furry Styles ────` separator, right after the lab block. Defined in the
  top-level pjs list `furryStyles` (bottom of main.pjs, ~143KB), pulled in by a
  third `meta:import ... from = [furryStyles]`. Conversion (source file had the
  furry-v1 framework dialect): `(negativePrompt:::...)` inline negatives pulled
  out into `negative`, `modifiers`/`negmodifiers` dice tables dropped, `\\n`
  escapes → spaces, the one multi-line prompt (Anime - Painted) → `{a|b}`, 33
  names colliding with t2i-styles suffixed ` (Furry)`, makers credited in each
  `description`. Rebuild recipe: fetch `ai-furry-generator-style-v17` source,
  same transform (see the header comment above `furryStyles` in main.pjs).
- **Prompts** reuse the lab's own composition with its `scene` slot set to
  `[input.description]`. Most styles: "<Name> style, <style text>. <description>.
  Entire image rendered as <Name>: <style text>. strong style intensity, uniform
  <Name> medium, palette and finish across the whole image, no drift into any
  other style." — the style text really is repeated twice on purpose; that is the
  lab's own trick for style dominance. 23 styles (Sticker Art, Film Noir, Tattoo
  Design, Crayon Drawing and the baroque/cubist/Dalí/tarot/stained-glass/mosaic/
  embroidery/romantic/rococo/neoclassical/art-nouveau/art-deco/impressionist/
  expressionist/amigurumi/concept-sketch/blueprint ones) use the lab's much longer
  hand-written templates instead — the Sticker one is ~2.8KB of mandatory rules.
  For Sticker the lab whittles the scene down to just the subject
  (`stickerSubject()`); here the description is used as-is.
- **Negatives** = the style's own drift-blocking negatives + the lab's shared
  quality list + the user's anti-description, written as
  `[input.negative ? ", " + input.negative : ""]` so an empty anti-description
  leaves no dangling comma. The lab's shared list ends with anatomy/content bans
  (male anatomy, futa, …) that were DELIBERATELY DROPPED to keep this generator
  unrestricted — only its quality/style-drift entries were kept. The lab's
  monochrome styles (Manga, Ink Comic Noir, Concept Art, Pencil, Charcoal, Sumi-e,
  Zentangle) additionally get colour-blocking negatives; Art Deco Poster is
  excluded because the source site's regex misflags it as monochrome (it is a
  colour style).
- **Translated**: `Pintura Romántica` → `Romantic Painting`; the lab's Spanish
  descriptions and category names were translated to English (the descriptions are
  what the 🎨 style-info line shows). The 18 styles whose names clash with the
  imported t2i-styles list (Oil Painting, Watercolor, Claymation, Studio Ghibli,
  Concept Art, Fantasy Portrait, Soft Anime, Tattoo Design, Casual Photo,
  1970s/1980s/1990s Photo, Fantasy World Map, Flat Illustration, Vintage Pulp Art,
  3D Emoji, Crayon Drawing, Nihonga Painting) are suffixed " (Lab)" — the framework
  keeps the FIRST option with a given name and would silently drop the duplicates.
- **Grouping**: the ten category rows (`──── 📷 Photographic ────`, 🧱 Base styles,
  💥 Comic & anime, 🖌️ Painting & illustration, 🧊 3D & video game, ✨ Stylised &
  themed, 📐 Design & production, 🏙️ Graphic & urban, 🏛️ Historical & fine art,
  🧱 Urban & mural) carry `meta:disabled = true`, so the framework renders them as
  greyed-out, unselectable separators — the only way to group a flat `<select>`.
  They have no `prompt`, so `pickRandomArtStyle()` and Simple mode's
  `planFromIdea()` skip them (verified: 400 random picks never returned one).

### tempus styles (ported from perchance.org/t2iaiimagegen2026-1)
- **443 active styles** in the 🎨 Art Style dropdown under a disabled
  `──── ✨ Tempus Styles ────` separator, right after the furry block. Defined in
  the top-level pjs list `tempusStyles` (bottom of main.pjs, ~300KB with its
  modifier lists), pulled in by a fourth `meta:import ... from = [tempusStyles]`.
  Source is Tempus ArtStyles v4.1, whose `$output` lives in the `--tas4-1-test`
  generator (that generator's `settings` does `from = {import:--tas4-1-test}`).
  Vendored, not imported, because the originals carry no `[input.description]` —
  the source site composes prompts in `buildPrompt()` (style + ". " + description),
  while this generator composes inside each style. Conversion: every prompt got
  `". [input.description]"` appended; negatives re-based on
  `[input.negative ? ", " + input.negative : ""]` with stray `[input.negative]`
  refs stripped; `meta:tags` dropped (this generator doesn't use tagWeights);
  all names suffixed ` (Tempus)` so none silently collide (one internal dup,
  Glitchcore, auto-numbered); 20 `✳️` category rows converted to disabled
  `──── … (Tempus) ────` separators; each style got a `description` crediting the
  source (shown in the 🎨 style-info line). The 8 modifier lists were copied as
  `tempus*` lists with refs rewritten; the framework reads them via
  `modifiers.getAllKeys` (note: `selectAll`/`getChildNames` report these nodes as
  empty — that is normal for the `=,` option syntax, not a bug). Rebuild: fetch
  `--tas4-1-test` source and re-run the conversion (recipe in the header comment
  above `tempusStyles` in main.pjs).

### nexora-style features (ported from perchance.org/nexora-free-ai-anime-generator)
- **Mode switcher** (✨ Simple · 🧩 Basic · 🎛️ Advanced): a pill bar injected at
  the top of `#i2p-imggen` by the `__nexoraMode` IIFE script (in
  `src/gen-extras.js`, lazy-loaded on first gen-tab open, runs after the
  fine-tune script). Sets `window.t2iMode`.
  - ✨ Simple: hides `#userInputsCtn8462746262`, `#ft-panel`, the framework
    generate button and the share container; shows a textarea + generate button.
    `planFromIdea()` calls `root.generateText` asking for a single JSON object
    (prompt / style / shape / negative / numImages), then `applyPlan()` writes
    the choices into the framework inputs via `setFrameworkInput()` (dispatches
    the framework's own oninput/onchange) and fires
    `window.___generateButtonClickEvent746291937({})`. Style list is sampled
    (stride, cap 80) from `___userSettings746291937.userInputs.artStyle.compiledOptions`
    entries that have a `.prompt`; `applyPlan` matches by NORMALIZE(textContent).
  - 🧩 Basic: default; normal form.
  - 🎛️ Advanced: shows the 🎛️ Advanced Workbench (see below) and the 🗒️
    Scratchpad; `setMode` toggles `html.adv-mode` and dispatches a
    `nex-mode-change` CustomEvent on `document` (the mode buttons call the
    internal `setMode`, not `window.__nexoraMode.setMode`, so the event — not a
    `setMode` wrapper — is what other scripts should listen to).
  - `numImages`/`shape` accept the AI's plan values (1-16 / four ratios).
- **🔍 Section search** (`src/artstyle-search.js`, script tag + styles right
  after `custom-styles.js` in `#i2p-imggen`): the framework renders every
  section as a native select with no search, so this inserts a filter box
  above each one with 25+ options (Art Styles 1–5, 🧑 Character, mixers, all
  clause dropdowns). Typing narrows the dropdown to substring matches (count
  shown as "N of TOTAL"), Enter picks the first enabled match, Escape/✖
  restores the full list. The current selection is always kept (re-prepended
  when it doesn't match) and no change event fires while filtering — only an
  Enter-pick goes through `window.__fireFrameworkInput` — so `window.input.*`,
  remember-me and random-style logic are untouched. Query is session-only,
  never persisted. Boxes are inserted only after the framework's one-shot
  init (gated on `userInputs.artStyle._element`): init loops over every
  input/select/textarea in its container and throws on elements without a
  framework data-name, so inserting earlier reproduces the `_element`
  unhandled-rejection.
- **⭐ Section favorites** (`src/section-favorites.js`, script tag right after
  `artstyle-search.js` in `#i2p-imggen`): EVERY framework dropdown in the
  Image Generator (🎨 Art Styles 1–5, mixers, shape/count, all ~40 clause
  selects — 55 total) gets a ☆/★ button beside it. Starring the current
  pick pins it to the TOP of its section's list (marked with a ★ prefix);
  unstarring returns it to its normal spot. Favorites persist per section in
  `localStorage.t2iSectionFavsV1` (newest on top, 60/section cap) and the
  remembered selection is never disturbed by pin/unpin. Default controls
  (None, Not set, 🎲 Random, disabled headers) can't be starred. Composes
  with the search boxes (filter rebuilds order favorites-first and keep the
  ★ markers via `window.__sectionFavs.orderValues()` +
  `window.__asSearchOnFavsChanged()`) and with ↺ Reset all (`gen-reset.js`
  reads `canonValues()` so reset still lands on true defaults, not the
  first pinned favorite).
- **🎲 Random Style** art style: first option in the `artStyle` select — a NODE
  with only `meta:position = 0` and NO `.prompt`. pjs fns `t2iArtStyle()` /
  `currentArtStyle()` / `pickRandomArtStyle()` (end of main.pjs) pick a fresh
  random style per image from the compiled options (those with `.prompt`) when
  the Random Style node is selected. `prompt` evaluates `t2iArtStyle()` first so
  the pick is cached in `window.___t2iArtStyleCurrent` for that image's
  `negativePrompt`/`saveTitle` (`currentArtStyle()`).
- **Shape "All (4 ratios)" & "🎲 Random"**: new `shape` options `all`/`random`.
  Plus furry-generator ports: `Square HD` (768x768) and the 🎲 Mix options
  (`rectmix`/`tallmix`/`widemix` — portrait-or-landscape, portrait-or-square,
  landscape-or-square, one picked per image by `t2iShapeResolution()`).
  `t2iShapeResolution()` returns a cycling ratio for `all` (per-image counter
  `window.___t2iImageIndex`) or a random ratio for `random`. The counter is
  reset once per generate click by `settings.numImages`
  (`[window.___t2iImageIndex = 0, ...]`, evaluated once/click) and incremented
  once per image by a wrapper around `window.___getImageOptions746291937`
  installed by the `__nexoraMode` boot (the framework calls it once per image in
  `.repeat(numImages).evaluateItem`). "all" bumps numImages to at least 4.
- **🎛️ Advanced Workbench** (built by the `__advWorkbench` IIFE appended to
  `src/gen-extras.js`, docked into `#i2p-imggen` right BELOW the `AI Image Generator ✅`
  title so the title stays at the top of the tab;
  shown only in Advanced mode via `html:not(.adv-mode) #adv-panel{display:none}`):
  collapsible as a whole plus one toggle per card — all collapsed by default
  (`localStorage.t2iAdvCollapsed`, per-card `localStorage.t2iAdvCards`).
  Five cards — 🧪 **Prompt inspector** (live *preview* of the next image's
  prompt/anti-description via main.pjs `t2iComposedPrompt()`/`t2iComposedNegative()`
  with copy buttons, plus a "prompt actually sent" section: a generate-click
  listener mirrors the exact `prompt`/`seed`/`guidanceScale` recorded on the first
  generated image — read from `#outputAreaEl .t2i-image-ctn iframe.textToImagePluginOutput.inputs`
  — and **🔍 analyze first image** feeds that image's dataUrl + used prompt to
  `root.generateText({instruction: [text, blob, text]})` (vision) to audit clause
  by clause whether the image reflects the whole prompt, streaming the report), 🌱 **Seed lab** (seed field synced both ways with `#ft-seed`,
  🎲 randomise, 🔒 lock a base seed, and an "increment seed per image" toggle + step
  so a batch explores neighbouring seeds), ⚖️ **Prompt weight** (slider 0–20 plus a
  far-right 🎲 stop; wraps the description as `(text:weight)` via main.pjs
  `descWeightSync()`, which runs first in the prompt chain so 🎲 draws fresh per
  image; plain text cached in `window.___advPlainDesc` so it never double-wraps),
  🎞️ **Variations** (one suffix per line
  appended to each image's prompt via `advVariations()`, using the same per-image
  counter as "All (4 ratios)"), and 🚫 **Negative presets** (toggleable common
  anti-description phrases appended via `advNegativeExtra()`). State lives in
  `window.___advState`, persisted to `localStorage.advWorkbenchState`. The three
  hooks are wired into `settings.imageOptions` (`prompt`/`negativePrompt`/`seed`) in
  main.pjs; `window.__advWorkbench` is exposed for debugging.
- **🗒️ Scratchpad**: framework-native `parseVariables` is disabled — the real UI is
  the custom `#t2iScratchPanel` built by `buildScratchPanel()` in `src/gallery.js`
  (just before `#userInputsCtn8462746262`), shown only in Advanced mode via
  `html:not(.adv-mode) #t2iScratchPanel{display:none}`, and collapsed by default
  (`data-fold-toggle-state="hidden"`). It has equivalent
  variable parsing, autokeep/kept-prompts, and migrates old scratchpad text on first run. NOTE: examples/tip text
  must escape `{`/`[` as HTML entities (`&lcub;`/`&lsqb;`) — the framework
  decodes them AFTER `evaluateItem` (see its placeholder handler); a literal `=`
  in an `examples` leaf item splits key=value, so use a JS-array-literal item
  (`["..."]`) to embed "ANIMAL = ...".
- `window.__nexoraMode = { setMode, planFromIdea, applyPlan, setFrameworkInput }`
  is exposed for debugging/programmatic use.
- **🔄 Convert to editable prompt** (`src/convert-panel.js`, chained in
  `ensureGenExtras()` after `gen-extras.js`; docked right above the framework
  generate button, visible in Basic + Advanced, hidden in Simple,
  collapsed by default via `localStorage.t2iConvertCollapsed`): 🔄 Convert
  freezes the evaluated description + art style + every section
  (`root.t2iComposedPrompt()`, description blanked during eval so the frozen
  text never duplicates it) into an editable box (char/word count, 📋 copy,
  🗑 clear). Ticking ✅ sends the box verbatim via main.pjs `t2iFinalPrompt()`
  (which replaces the old inline `imageOptions.prompt` chain; 🎞️ variation
  lines still append, anti/seed/shape/guidance stay live, Simple mode always
  uses live sections). Inspector mirrors the override with a "converted
  override" marker; ↺ Reset-all unticks + clears it. State in
  `window.___convertState` → `localStorage.t2iConvertState`.

### Cross-tab pipeline features (shared hub)
- **`#gen-tools` toolbar** (built by an IIFE appended to `src/gen-extras.js`,
  injected into `#i2p-imggen`'s main column right after the fine-tune panel and
  just above the framework's generate button, hidden in Simple mode via the
  `document`-level `nex-mode-change` event): a collapsible 🧰 **Prompt tools**
  group (collapsed by default, `localStorage.t2iToolsCollapsed`) holding
  **✨ Enhance** (streams an expanded prompt from the
  current description via `root.generateText`), **💬 Chat Prompt**
  (`src/prompt-chat.js`, lazy-loaded with the gen tab: obrolan dengan AI
  untuk meracik prompt — balasan Bahasa Indonesia/English, draf final selalu
  English dalam kartu `---PROMPT---` dengan tombol Pakai/Copy/Vault/Kirim),
  **📚 Vault** (`Vault.pick` → writes
  the chosen prompt into the description box), **▸ Send to…** (`PromptBridge`),
  and **🔗 Share recipe** (`Recipe.copy("gen", …)`, registering
  `window.__genApplyRecipe` so a shared `#recipe=` link re-applies here).
- **Stylized skin** (an IIFE appended to `src/gen-extras.js`, `#gen-skin-css` +
  four collapsible `.gen-sec` groups, ALL collapsed by default): gradient hero title, segmented mode pill, card-style
  framework inputs grouped under ✏️ Prompt / 🧩 Mixers /
  🎨 Art Styles & Fusion / 🖼️ Canvas headers — click
  (or Enter/Space) to collapse/expand, remembered per browser in
  `localStorage.t2iGenSections2`; an
  accent-ringed 🎨 Art Style select, and a gradient pill **✨ generate** button.
  Scoped to `#i2p-imggen`, theme vars only — pure presentation, no behavior touched.
  Its `@media (max-width:700px)` block compacts sections on phones: tighter gaps
  and card padding, smaller labels/fields, hidden ⓘ tip buttons, shorter
  description box, dropdowns two-up (🎨 Art Style stays full-width with its
  search stacked above it).
- **Basic scratchpad** (`#t2iBasicScratch`, same file): slim sibling of Advanced's
  `#t2iScratchPanel` shown only in Basic mode — notes + `VAR = …` variables only,
  no kept-prompts section. Shares `localStorage.t2iScratchpadText` with the full
  panel (two-way mirror + own stale-var tracker); collapsible, collapsed by
  default, state remembered.
- **↺ Reset all** (`src/gen-reset.js`, `#gen-reset-row` under the mode bar,
  `window.t2iResetImageGenerator`): one click returns every section to Off /
  default — dropdowns to first option, Description/Anti/Side/Image-name/Custom-size
  cleared, Guidance → Random, Seed → empty, Advanced weight/variations/negative-presets/
  seed-lock off + cleared, Custom slots off + tryout stopped (definitions kept),
  Age off, Scratchpad cleared, search filters cleared. Username + Signature are
  kept (identity). Clearing text asks for confirm; dropdown-only resets run at once.
- **Persona/chat skin** (`#gen-persona-css`, same file): the per-image
  🎭 persona / 💬 chat trigger is a pill, and the character editor overlay gets
  theme fields + pill buttons (gradient ✨ generate persona). The two injected
  buttons (📋 prompt history, 🧑 Persona Generator →) carry no inline styling —
  the skin owns them by class. Framework markup untouched (read-only import).
- **🎂 Age meter** (`#gen-age-ctn`, same file, inside the 🖼️ Canvas group right
  after 🔢 How many?): drag slider + Add-to-prompt checkbox feeding
  `ageClause()` in main.pjs via `window.___ageState` (`localStorage.t2iAgeMeter2`,
  default on / 25). Range is 0–100 for full-range sessions, 18–100 otherwise —
  enforced in both the slider and the clause — with pointer, keyboard
  (arrows/Home/End/PageUp/PageDown) and `role=slider` support. The card names
  no session kind; it just spans the range it spans.
- **Gallery toolbar**: the saved-images gallery (`src/gallery.js`, opened by the
  🖼️ buttons in the Image Generator / Pro / AI Photo / Comic tabs) has a search
  box that matches prompt, label, **tag** and folder text, a sort select
  (newest / oldest / label A→Z / label Z→A / 📁 folder), prompt / favorites / tag
  filters, a **⭐ first** toggle that pins favorites to the top, and a per-page
  selector (30/60/120/240 or all-on-one-page) with a **‹ prev / next ›** pager and
  a "showing N–M of T" readout. Every gallery card additionally has a **📚** (save
  the prompt to the vault, with thumb) and a **▸** (send-to) button.
  - **Layout (public-friendly pass)**: the modal used to open with five stacked
    rows of ~28 always-visible controls. It now opens as **header + hint +
    selection row + search/filters + pager + images** only, all in **one
    scrollable menu**: the dialog (`width:min(1080px,100%)`) scrolls as a whole
    (`overflow-y:auto`, images at natural height via `flex:0 0 auto`) with only
    the header row (`#t2iGalHeaderRow`) pinned via `position:sticky`, so opening
    🧰 Manage just lengthens the page instead of squeezing the images into a
    leftover strip. Cards are 240px wide with 200px previews (30vw / 110–220px
    tall on small screens, full-width under 380px). The pinned header row
    holds just the title, `#t2iGalCount`,
    `#t2iGalPeerStatus`, **➕ add images**, the **🧰 Manage ▾** toggle
    (`#t2iGalManageToggle`) and ✖️ close. Everything else — the
    chat-link/export/recover tools (`#t2iGalToolsRow`) and the folder bar — lives
    inside `#t2iGalManagePanel`, which is **collapsed by default** and remembers
    its state per browser (`localStorage.t2iGalManageOpen`, via `setManageOpen`).
    Within the tools row the buttons are grouped by small uppercase labels
    (`.t2i-gal-rowlbl`) inside `.t2i-gal-grp` wrappers, **one group per line**, so
    a wrapping row can never orphan a label away from its buttons.
  - **Selection row lives OUTSIDE the Manage panel** (`#t2iGalManageRow`, right
    below the header): with nothing selected it shows only **☑️ select all**;
    once a card checkbox is ticked it reveals ✖️ clear, the `N selected` count and
    the 📁 Move / 📦 ZIP / 🗑️ Delete-selected actions (`updateSelectionBar` toggles
    the `hidden` attribute on those four). Earlier the whole bar sat inside the
    collapsed panel, so ticking a checkbox appeared to do nothing. Move/ZIP/Delete
    are enabled only when at least one *own* gallery item is selected (`ownN > 0`)
    — chat-gallery (peer) cards are selectable but can't be moved/deleted/zipped —
    and the delete confirmation counts only the own items it will actually remove.
    Selections also survive re-renders now: the stale-selection sweep in
    `renderGallery` treats peer URLs as present too.
  - **Empty states** (`renderGallery`): with nothing ever saved it shows a
    friendly card (`.t2i-gal-empty`) explaining what the panel is and how images
    get in, with **➕ Add images from your device** (→ `openAddImagesPicker`) and
    **🎨 Generate an image** (→ closes and `showTab("gen")`). A filtered-to-zero
    view gets its own "Nothing matches right now" card with a **Clear search &
    filters** button. The pager row is hidden entirely when there are no items.
  - **Plain-language renames**: the 🙈 "hidden" concept is now **♻️ Removed**
    (button, viewer title and all three delete confirmations), "⭐ first: off" is
    now "⭐ Favorites first: off/on", and the peer status reads
    "🔗 Chat gallery linked · N from chat" (it no longer ends in a stray "·"
    separator now that the buttons follow it directly).
  - **Mobile**: the header row is excluded from the ≤640px horizontal-scroller
    rule (`flex-wrap:wrap` + the `#t2iGalHeaderSpacer` hidden) so ➕/🧰/✖️ always
    stay on screen instead of scrolling out of reach, and `#t2iGalManageRow` gets
    the same treatment so all five selection controls wrap into view at once
    instead of hiding ✖️/🗑️ off the right edge; the peer status is ellipsis-capped
    at 9rem. `hideIds` in pick mode also hides the Manage toggle and panel.
  - **Esc layering** (see also "Public-use friendliness"): Esc closes the topmost
    layer and only the topmost layer. The lightbox (`#t2iGalLightbox`) and the
    move-to-folder popup own Esc in the capture phase; a small capture-phase
    handler bound once per page (`document.__t2iNestedEsc`, keyed off the
    `data-gal-nested` attribute that `newOverlay()` stamps on every stacked modal)
    closes edit/avatar/chat/import/removed modals without tearing down the gallery
    underneath; and the page-level gallery-Esc handler bails out when the
    "send to…" popup (`#pbridgeMenu`) is open. Before this, Esc with any of those
    open closed the gallery *and* left the nested modal orphaned on screen.
    `closeGalleryModal()` now also removes any leftover stacked modals, and both
    the ✖️ button and the backdrop click route through it.
- **Pick mode** (`openGallery({pick: {title, hint, addNoun, onPick}})`) — the same
  modal doubles as an image chooser for other tabs: it hides the management rows
  (folder / select-all / move / ZIP / delete-all) and per-card action buttons, shows
  a highlighted pick bar (hint, live count, `select all shown` / `clear` / `Cancel` /
  `✅ Add N …`), and turns a card-image click into a selection toggle
  (`.gal-card.picked` outline). On **Add** it calls `pick.onPick(items)` with the
  chosen items (each `{url, prompt, title, folder, tags, fav}`) and closes. Used by
  🧑 Persona's `🖼️ Import from gallery`. Arg-less `t2iOpenGallery()` callers are
  unaffected (`pick` is null → no pick bar, full manager UI).
- **Per-image metadata & actions**: **✏️ edit** rewrites an entry's label, prompt,
  folder, date, **tags** and favorite star (prompt is no longer copy-only); tags
  are many-per-image and orthogonal to folders, and clicking a tag chip filters the
  grid by it. **🧑 avatar** points a roster character's thumbnail at the image
  (`Characters.setAvatar`), or turns the image into a new roster / chat character;
  **💬 chat** copies an `<image>prompt</image>` tag or `/image prompt` command for
  the chat composer, or opens the chat generator with this gallery linked. Clicking
  a thumbnail opens a **lightbox** (full-size, ‹ › buttons + ←/→/f/e/d/Esc keys)
  with its own star/edit/avatar/chat/open/save/copy/delete actions.
- **Recycle bin + undo**: deleting images (single, selected or all) moves them to a
  **🙈 hidden** tombstone list (`t2iGalleryHidden`) instead of destroying them; a
  hidden viewer restores or permanently forgets them, and every destructive change
  (delete, move, rename/delete folder, edit, import, restore) pushes a snapshot onto
  a 15-deep undo stack reachable from the **↩️ undo** button and an undoable toast.
  **⬆️ Import** is the inverse of "Export all links": it accepts a pasted export or
  manifest, one URL per line, a ZIP manifest (read with JSZip) or a SiteBackup JSON,
  skips URLs already present, and can un-hide matches.
- **Linked (chat) images**: entries that come from the linked chat generator are
  display-only (their own cloud file owns them), but each such card has a **🙈 hide**
  button. Hiding one stores a tombstone marked `origin:"chat"`, so the unified grid
  (`visibleItems()`) filters it out while the hidden viewer can **unhide** it; un-hiding a
  chat image removes the tombstone only and never copies the image into the local gallery.
  The grid also drops peer copies of images already in the local gallery (the chat file
  mirrors ours), so a shared image shows once instead of twice.
- **Cross-site link with the chat generator** (`bigger-and-better-ai-chat`) — the "connection"
  between the two galleries. Each site keeps its **own** public *editable* file as its gallery
  index (the platform only allows writes inside your own generator's namespace): this app's is
  `editable.uploads.dev/file/<generatorName>/gallery-<key>` (browser key in `t2iGalleryUserKey`,
  write key in `t2iGalleryEditKey`), the chat's is `…/bigger-and-better-ai-chat/chatgallery-<key>`.
  Each side just `fetch`es the other's URL (public read) and merges the entries it finds; both
  files hold the same `[{url,prompt,title,folder,timestamp,…}]` array shape, and the chat tags
  merged entries with an `origin: "<generator>/<file>"` (this app tags them `origin:"chat"`), so
  formats stay compatible in both directions. The chat's file is remembered in `t2iGalleryPeerFile`,
  set either by opening this page with `?galleryFile=<chatFile>` (the chat's 🖼️ images button does
  exactly that, and the platform forwards the query string into the generator iframe) or pasted by
  hand under **🧰 Manage**. Pairing runs the *other* way too: a hidden iframe loads the chat at its
  own origin with `?galleryFile=<ourFile>`, so the chat adopts our file and shows our images
  (`localStorage.t2iGalleryPairedChat`, once per browser — launched whenever a chat is linked, not
  only on the `?galleryFile=` path). The current chat bridge confirms nothing back (it only reads
  the param on load), so the frame is dropped ~4s after its `load` event; the
  `t2iGalleryPairingDone` message listener is kept only for forward-compat. Note that both file URLs
  embed `window.generatorName`, so **renaming this generator breaks an existing link** (the old
  file becomes unwritable for us) — `pushGalleryToCloud()`'s stale-editKey branch then starts a
  fresh `gallery-<key>-<rand>` file, and the chat has to be re-linked.
- **Cloud safety**: a soft banner appears when the local gallery nears its
  5,000-image cap or the shared cloud index file nears its ~5MB (≈3,000-image)
  limit, telling the user to export a backup. Exposed on `window` from the gallery
  IIFE: `t2iGetHidden` / `t2iRestoreHidden` / `t2iGalleryUndo` / `t2iOpenHiddenViewer`
  (plus the pre-existing `t2iOpenGallery` / `t2iAddImageWithUrl` / … helpers).
- **Folder file system**: saved images can be organised into named folders. A
  folder bar (filter select + ➕ new folder / ✏️ rename / 🗑️ delete folder)
  filters the grid; every card has a **📁 move to folder** dropdown, and two
  **move to folder ▾** buttons open a chooser — the folder-bar button moves the
  selected images (or all currently-shown images when none are selected), the
  selection-bar button moves just the selection. The chooser lists every folder,
  **🗂️ Unfiled**, and an **➕ New folder…** entry that creates the folder on the
  spot. Folders are stored per-image as `item.folder` (so they cloud-sync with
  the rest of each item).
- **Auto-folder by 🏷️ Image name** (toggleable, **ON** by default; remembered in
  `localStorage.t2iGalleryAutoFolderByName`): an image saved from a generation
  whose 🏷️ *Image name* input is set is filed automatically into a folder named
  after that name — the folder is created the first time each new name is saved,
  i.e. as soon as the first image of the generation lands in the gallery. The
  toggle lives both in the generate bar (`📂 auto-folder: ON/OFF`) and in the
  gallery's folder bar as a checkbox (`#t2iGalAutoFolderChk`); both are kept in
  sync by `updateAutoFolderControls()`. Files land in the *same* folder for the
  whole generation, and images with no Image name (or from tools that set no
  name) stay unfiled exactly as before. `normalizeFolderName()` caps the folder
  name at 60 chars. The guard that makes it safe: an image is only auto-filed
  when its own `saveTitle` **equals** the raw Image-name value
  (`window.input.imgName`, the live mirror of the field; the value used at
  generation time is snapshotted on generate-button click into
  `generationImageName`), so a stale/renamed field can never drag an image into
  the wrong folder and the `"(art style) description"` fallback title (unique
  per image) never creates folders. A new folder appears in an already-open
  gallery's folder list immediately (the modal exposes `overlay._refreshFolders`,
  called from `notifyGalleryFolders()`); save toasts read
  `"☁️ image saved to gallery · 📂 <folder>"`. On ≤640px the folder row wraps
  (instead of the usual Manage-row horizontal scroll) so the checkbox stays
  on-screen.

## 🧬 Tab 3: Prompt Evolution
A self-contained evolutionary image-prompt engine (inspired by
perchance.org/improved-image-prompt-optimizer). All markup (`#evo-app`) and
styles (`.evo-*`) live in index.html; the logic lives in `src/evo.js` (single
IIFE, lazy-loaded on first Evo-tab open — same pattern as editor.js).

- **Loop**: user types an idea (+ optional "what to avoid", style override, shape) →
  the AI writes image prompts → images render in a feed → 👍/👎 votes steer the
  population. After 5 upvotes it enters **evolution mode**: new prompts breed from
  the top-3 favorites (lineage-tagged, generation counter, weighted pick by score,
  0.85 decay on non-lineage), steer away from recent downvotes, and add random
  curly-block {a|b|c} variations (70% of the time).
- **Config**: `CFG` object at the top of the evo script (PARALLEL, GEN_PROMPTS_BATCH,
  EVOLUTION_THRESHOLD, LINEAGE_DECAY_RATE, GENERATION_MULTIPLIER, PARENT_BATCH_SIZE,
  PARENT_PROB, LONG_PROMPT_RATE, IMAGE_GEN_TIMEOUT_MS, MAX_FEED_CARDS). Inner state
  lives in the closure variable `st`.
- **LLM text**: `root.generateText` (ai-text-plugin) with prefix-cache-friendly
  instructions; a cleaning pass rejects chatter/short/truncated prompts. The 🧠
  "Expand this idea" button streams an expanded prompt into the idea box.
- **Images**: `root.generateImage` (text-to-image-plugin) with `hideGalleryButtons:true`,
  per-task 120s timeout → "⚠ failed — tap to retry" cards. Orientation square /
  portrait / landscape / random.
- **Saved images**: persisted client-side in IndexedDB (`evo-saved-v1`/`imgs`) with a
  localStorage index (`evoSavedMeta`) — survives reloads; Saved modal + per-item delete.
- **Hooks**: `window.evoSetVisible(bool)` (called from `showTab`) auto-pauses the feed
  when the tab is hidden.
- **UI**: cards have 👍/👎 (undo-able, green/red active states), 🎨 regen, 💾 save,
  click-prompt-to-fullscreen (which also has vote buttons). Prompts modal lists the
  whole pool with score/usage/staleness badges + manual add.
- **Cross-tab pipeline**: every card has **📚** (save prompt — with its image if one
  exists — to the shared vault) and **▸** (send-to) buttons; the idea box has a
  **🎲 Surprise me** button (fills a random starter idea when empty), a
  **📚 Vault** button (`#evo-vault-load` → `Vault.pick`) and a **🖼️ From gallery**
  button (`#evo-from-gallery`, which opens the gallery in a pick-mode modal and
  copies the chosen image's prompt into the idea box). `window.__evoSetIdea` /
  `window.__evoAddPrompt` let the hub push prompts in.

## 🎨 Tab 4: Theme Studio
A UI editor that restyles the whole generator — colors, corner radius, text size,
font, and motion — applied instantly to ALL tabs and persisted per browser. Its
layout deliberately mirrors the **UI editor** from
https://perchance.org/bigger-and-better-ai-chat (presets → clickable "parts" list →
inline colour wheel / hex / opacity → "other characteristics"). Markup
(`#theme-app`), styles (`.th-*`), and the engine script all live in index.html.

- **Mechanism**: the whole app is themed through CSS variables `--th-*` (bg,
  surface, field, modal, border, text, text-dim, accent, accent-text, accent-soft,
  glow-color, grad-a/b/c, radius, font) whose defaults live in a `:root` block. The
  engine writes them as inline styles on `<html>` plus `font-size` (the "overall
  text size" slider), so the values always win. Components across every tab
  reference these vars (`var(--th-surface)`, `var(--th-accent)`,
  `var(--th-border)`, `var(--th-radius)`…). The framework's `--box-color` is
  bridged to `--th-surface` (set on `<html>` AND `<body>`) so tab 2 follows too.
- **⭐ The default theme is the `studio` preset (new), and the old default is kept as
  `classic`**: `THEMES.studio` is now what a first-time visitor gets — `defaults()`
  returns `preset:"studio"` and the `:root` block in index.html holds the same dark
  values so the first paint matches (no flash). The previous default palette is
  untouched under its original key `default`, relabelled **classic** in the chips via
  `PRESET_LABELS` (keys never change — saved states reference them, and any saved
  `thThemeV1` keeps whatever preset/pack it already had, so nobody's theme is
  overwritten by this change). `studio` exists to **pull traffic into the other
  tabs**, via two optional preset fields that only it currently uses:
  - **`tabs` — a signature accent colour per tool.** `presetTabAccents()` reads
    `THEMES.<preset>[mode].tabs` (a `{tabId: hex}` map covering the main tabs — including
    which were added to the dark and light
    studio maps when their tabs landed; without an entry a tab has no dot on the nav, no tint on
    its Home card and no active-tab colour) and
    `accentFor(tab)` layers the user's own `st.tabAccents` on top of it, so
    `applyTheme()` now gives the whole UI the **active tab's** colour while you're in
    it (previously that only happened if you'd set a per-tab accent by hand).
    `paintTabDots()` additionally stamps every tab's colour onto the nav button and
    the matching Home tool card as `--th-dot` / `--th-dot-soft` + a `data-dot`
    attribute, and CSS (in the theme-engine style block) turns that into a small
    coloured dot before each pill label, a coloured left border and a tinted icon
    tile on the Home cards, and a per-card hover tint. Because the CSS only matches
    `[data-dot]` elements, presets/packs **without** a `tabs` map (i.e. `classic` and
    every pack) render exactly as before — no dots, no tinting. Each tab's own colour
    also means the active pill is colour-coded (its dot flips to `--th-accent-text`
    so it stays visible on the filled pill).
  - **`pageBg` — a backdrop gradient**, painted through the same
    `--th-page-bg` + `<html data-th-page="1">` machinery the theme packs use (so the
    tab shells go transparent and the gradient shows behind every tab). It honours the
    existing "gradient backdrop" checkbox (`st.packGrad`), whose label is now
    "Use the theme's gradient backdrop (pack or preset)".
  `PRESET_LABELS` only changes the chip text, and **Copy CSS** exports the preset
  backdrop too. `contrastText()` was also upgraded from a plain luminance threshold
  to a real WCAG contrast-ratio pick of near-black vs white, because the new mid-tone
  per-tab accents (greens/cyans/ambers) were getting white text at ~2.3:1 where black
  scores 8:1 — every colour the old rule got right it still gets right, so no existing
  look changes.
- **UI structure** (all in `#theme-app`): **Mode** (dark/light chips) · **Presets**
  (9 palettes — **studio** (the default; dark+light) then **classic** (the old
  `default`), midnight, forest, sunset, paper, ocean, cyber, berry; each has its own
  dark+light pair + a 3-stop gradient for the big titles) ·
  **🎨 Theme packs** (see below) · **Page background** (see below) · **Parts**
  (9 clickable rows: Background, Cards & panels, Input fields, Modal panels,
  Borders, Accent, Gradient stops 1–3) · **Text colors** (All text, Dim/secondary
  text) · **Other characteristics** (corner rounding 0–24px, overall text size
  12–22px, font family select with **63 faces in 5 optgroups**, 4 polish toggles: smooth transitions,
  card entrance/hover animation, accent glow, blurred modal backdrops — driven by
  `data-th-*` attributes on `<html>`) · **Per-tab accent** · footer (Reset / Copy
  CSS / Share / Import).
- **🔤 Fonts (63 faces)**: `FONTS` / `FONT_GROUPS` / `FONT_LABELS` in the theme
  script. `FONT_GROUPS` is `[groupLabel, [fontKeys…]]` and drives
  `buildFontSelect()`, which renders an `<optgroup>` per group (each `<option>`
  is styled in its own face, so the picker previews the fonts); `FONT_ORDER`
  (the flattened key list) is kept for save/load/export and is rebuilt from
  `FONT_GROUPS`. The 13 original system stacks are group 1; the other 50 are
  **web fonts loaded by one Google Fonts `<link>` immediately above
  `<header id="i2p-header">`** in index.html (~155KB of `@font-face` CSS; the
  woff2 files themselves are downloaded lazily by the browser the first time
  each face is actually used, so unused fonts cost nothing). Adding a face =
  add its family to that Google Fonts URL (keep the URL's families and the
  `FONTS` keys in sync — the CSS API 400s the WHOLE request if any family name
  is invalid) + a `FONTS` key, a `FONT_LABELS` label and the key in a
  `FONT_GROUPS` group. The Image Editor's `#textFont` select (in index.html) was
  expanded to the same optgroup scheme — its fonts had never actually been
  loaded before, so every non-system option used to silently fall back to the
  system face (canvas text now renders correctly; `src/editor.js` already awaits
  `document.fonts.ready`).
- **Inline colour picker**: clicking a part row opens `#th-picker` right under the
  Parts heading — an HSV gradient square (200×200 canvas + draggable marker), a
  rainbow hue bar, a hex text field, an opacity slider (0–100%), and a strip of 10
  quick colours. Pointer events (`bindDrag`, with `setPointerCapture`) handle mouse
  and touch; each part row shows a checkerboard-backed swatch + hex + opacity%.
  Overrides are stored as `{hex, alpha}` objects (legacy plain-hex strings are
  still accepted via `normColor`). Border's default is a translucent grey, and
  text-dim derives from the palette text at 62% — both are overridable/opacity-aware.
- **🎨 Theme packs (the Pro Imager's 42 UI themes + site skins, promoted site-wide)**: the
  `#th-packs` chip list is built from `window.IMAGER_PRO_THEMES`
  (`src/imager-pro-themes.js`). The studio is the only consumer: it loads that
  file itself via `ensurePackData()` (which also honours the
  `__proThemesLoading`/`__proThemesLoaded` flags, left over from when the Pro tab
  loaded it too). `packPalette(name)`
  (`packStops`, `parseProColor`) translates a pack's fixed `--th-*` map onto the
  studio's named parts: `surface`→Cards & panels, `field`→Input fields,
  `modal`→Modal panels (from field), `border`, `text`, `text-dim`→Dim text,
  `accent`, and the pack's 3-stop `bg` gradient → Gradient stops 1–3. `--th-bg` is
  the gradient stop that reads as the backdrop for that pack's mode (darkest stop
  for a dark pack, lightest for a light pack — the packs' gradients have no single
  "background color"), and the mode is inferred from the pack text's luminance
  (4 packs are light). `partDefault()` consults the pack before the preset
  palette, so individual parts stay overridable on top of a pack. `packGrad`
  (`#th-pack-grad`) toggles the pack's gradient backdrop; when on, `applyTheme()`
  sets `--th-page-bg` + `<html data-th-page="1">`, which CSS turns into a fixed
  `body` background and makes the per-tab shells transparent
  (`:root[data-th-page="1"] :is(#i2p-app, #evo-app, …)`) so the theme reads on
  every tab. Selecting a pack clears the part overrides and resets the preset;
  selecting a preset or a mode clears `pack` (a pack carries its own palette, so
  an explicit dark/light choice means "go back to the preset palettes"). **Leaving a
  pack always lands on the shipped default preset** (`studio`) — both the "None" chip
  in the pack list (`setPack("")`) and a dark/light toggle while a pack is active
  (`setMode()`) fall back to `defaults().preset`, so they stay consistent with
  "↺ Reset to system default".
- **Site skins (packs that carry an animated backdrop)**: a pack may be derived
  from another generator's UI rather than from the Pro Imager. The first one is
  **"Unlimited Media"**, lifted from the embedded
  `https://perchance.org/unlimited-medias-to-links` site (the 🔗 Media to Links
  tab) — its deep-space `#05060e`/`#100f2e` palette, `#e9edff` lavender text, cyan
  `#22d3ee` accent, translucent white strokes, and the site's signature
  cyan→violet→pink headline ramp. Two optional pack fields support this:
  - `--th-grad-a/b/c`: pin the headline ramp exactly instead of letting
    `titleMid()` derive it (a skin can then keep the source site's three-colour
    gradient; `readableStop()` still guards contrast).
  - `fx`: names an animated backdrop look. `applyTheme()` copies it to
    `<html data-th-fx="…">` and, if set, forces `data-th-page="1"` too (the skin's
    backdrop is part of the pack, so the shells must go transparent even when the
    "gradient backdrop" checkbox is off). `ensureFxLayer()` lazily appends a fixed
    `#thFxLayer` (z-index:-1, `pointer-events:none`, same trick as `#t2iBgLayer`)
    holding four blurred drifting orbs + a masked panning grid; CSS shows it only
    while `:root[data-th-fx="nebula"]` matches, and `prefers-reduced-motion` kills
    its animations. To add another site skin, append a pack to
    `src/imager-pro-themes.js` with an `fx` name that exists in index.html's CSS.
- **Page background**: `#th-open-bg` opens the Image Generator's existing
  🎨 background feature (`window.t2iOpenBackgroundModal`, exported from
  `src/gallery.js`; the studio calls `window.ensureGallery()` first if gallery.js
  isn't loaded as `window.ensureGallery` exists), so URL/file, image/video, blur,
  opacity and remove are all available from the Theme tab. That feature's own
  `#t2iBgLayer` fixed overlay is what actually paints it; the studio only mirrors
  its state in `#th-bg-note` and, via `window.__onPageBgChange` (dispatched by
  `notifyPageBgChange()` in gallery.js), keeps the note fresh. The
  `body:has(#t2iBgLayer)` rules make the tab shells transparent so a background
  is visible on every tab too.
- **State**: a single object `{preset, mode, overrides{}, radius, baseFont, font,
  smooth, glow, anim, blur, tabAccents{}, tabSel, pack, packGrad}` saved to
  `localStorage.thThemeV1`; reloaded on boot. Exposed for debugging as
  `window.__themeStudio.get()/.set(o)`, plus `getPack()/setPack(name)/packs()`,
  `reset()` (restore the shipped default), `tabAccents()` (the effective per-tool
  colours), `css()` and `openBackground()`. Switching preset clears `overrides`
  (custom colors are per-preset); "↺ Reset to system default" restores everything.
  `resetTheme()` is the single implementation behind that button, the ⌘K palette's
  "🎨 Reset theme to default" action (src/vault.js, which now calls
  `window.__themeStudio.reset()` instead of hardcoding a preset), and the public
  `reset()`. On load, a legacy
  `localStorage.imagerProTheme` (the Pro tab's old per-tab theme key) is migrated
  into `pack` **only when the saved studio state predates the `pack` field**
  (`o.pack === undefined`), then deleted — so a later "reset to default"
  (`pack:""`) is never re-adopted.
- **Framework fights**: a `MutationObserver` on `<body>`/`<html>` (style+class,
  25ms debounce) re-applies the theme whenever the framework's dark-mode toggle or
  background feature overwrites colors. The framework's dark-mode button is taken
  over (cloneNode to drop its listeners, re-asserted periodically since the
  framework injects it late) and now toggles dark/light via the studio instead.
  `body` background is only set when `#t2iBgLayer` (the custom background feature)
  is absent, to avoid fighting the background overlay. Accent text color is
  auto-computed (black/white) from accent luminance. **Button caveat**: the
  platform injects `button:not([disabled]) { color: inherit }`, which
  (specificity 0,0,1,1) out-specifies plain class rules — so the accent-filled
  buttons (`#i2p-tabs .i2p-tab-active`, `.i2p-btn-primary`, `.evo-btn-primary`)
  get an extra class qualifier (`button.i2p-btn.i2p-btn-primary,
  .i2p-btn-primary.i2p-btn-primary, …`) to keep `--th-accent-text`. Without it,
  packs whose accent and text colors match (Synthwave Neon, Cyberpunk Hacker, …)
  render those labels invisible. Inline `style="color:var(--th-accent-text)"`
  buttons (the Image Editor's toolbar) are unaffected.
- **Legible gradient headlines**: the display titles (`.i2p-title` on Home / Image
  to Prompt / AI Photo Editor / Comic Scanner, `.pro-title`, and the ✦
  `.i2p-brand-mark`) are painted with `background-clip:text` from `--th-grad-a/b/c`,
  so a headline is only as readable as those stops. A theme pack used to derive them
  from its own *background* gradient — i.e. the exact colours of the page backdrop —
  and so camouflaged itself (e.g. "Midnight Gold" painted a
  #1a1a2e→#0a0a1a→#16213e title onto an identical #1a1a2e→#0a0a1a→#16213e backdrop,
  contrast 1.00:1; 42/42 packs were affected). Two guards in the studio IIFE fix it:
  `packPalette()` now builds the stops out of the pack's **foreground** colours —
  accent → `titleMid()` → text, where `titleMid()` takes the pack's `--th-border`, else
  one of its own gradient stops, accepted only if it differs in hue from the accent by
  ≥30° *and* reads against the pack's backdrop, otherwise a "shine" through the accent —
  and `readableStop()` is the last line of defence, walking any stop's lightness away
  from the backdrop (toward white on a dark backdrop, black on a light one) until it
  clears `TITLE_MIN_CONTRAST` = 3.5:1 (WCAG large-text AA). The backdrop model is the
  single stop `packPalette()` picked as the effective `--th-bg`, because the hero sits
  near the top of the viewport where the `fixed` backdrop gradient reads as one flat
  tone (checked against rendered pixels, not just the CSS). Worst case measured across
  all 42 packs is now 3.56:1 (was 1.00:1); non-pack presets are untouched (their
  gradients already clear the threshold, so the guard is a no-op). `titleGrads()` is
  shared by `applyTheme()` and `cssText()`, so **Copy CSS** exports repaired values.
  **If you add a new gradient-clipped headline, paint it with `var(--th-grad-a/b/c)`** so
  it inherits the guard — never hardcode the gradient (the old `.pro-title` hardcoded
  #ff69b4/#a78bfa/#00ffff and vanished on light packs).
- **Cross-tab pipeline & extras**: the **Per-tab accent** section (`#th-tab-sel` +
  `#th-tab-accent`, includes AI Chat / AI Chat Lite in its tab list) sets a per-tab
  accent color (`st.tabAccents[tab]`, applied by
  `applyTheme()` and re-applied on every tab switch; the colour field pre-fills with
  the active preset's own colour for that tab, and **Clear for tab** falls back to it
  rather than straight to the global accent), plus footer buttons
  **📄 Copy CSS** (`__themeStudio.css()` emits the current `:root` variable block
  as copyable CSS), **🔗 Share** (`Recipe.copy("theme", st)`) and **⬆️ Import**
  (paste a `#recipe=` link or raw theme code). `window.__themeApplyRecipe` and
  `window.__themeStudio.refresh()` complete the integration.

## 🖌️ Tab 5: Image Editor
A port of the single-file canvas editor from https://perchance.org/ried, adapted to
the theme system and to the 5-tab layout. Markup `#edit-app` + CSS `#edit-app ...`
live in index.html; the app script lives in `src/editor.js` (not inline — see below).

- **Features**: 16 filters (brightness…invert) via `<canvas>` CSS-filter +
  per-pixel pass, 4 control views (sliders / knobs / +/- buttons / jog-wheel),
  13 presets, crop (draggable box), rotate/flip/sharpen, upscale via pica.js
  (loaded lazily from jsDelivr on first use), full undo/redo history (20 states),
  text overlays (arc/rotate/scale handles, outline, color swatches), and
  PNG/JPEG/WebP export with quality control. A "🖼️ Sample" button next to Upload
  loads the bundled `src/samples/` photos (alternating, only when empty) so the
  tools can be tried with nothing to upload.
- **Architecture**: `src/editor.js` is a single IIFE. EVERYTHING (DOM refs,
  listeners, state) is deferred into `editorBoot()`, which runs on the first show
  of the edit tab. index.html's `showTab()` loads the script lazily the first
  time the tab is opened (`window.__editorScriptLoading` → dynamic `<script>`
  injection → onload calls `__editorOnShow`). The hooks `window.__editorOnShow`
  and `window.__editorOnThemeChange` are the only surface the rest of the page
  touches; `applyTheme()` calls `__editorOnThemeChange` (no-op until boot).
- **Theming**: every color is read live from `--th-*` vars via the `thVar()/
  thAccent()/thField()/thBorder()/thText()/thDim()` helpers (canvas knobs,
  jog-wheel, swatches redraw on theme change). `#edit-app` is included in the
  font-family / reduced-motion rules alongside the other tabs.
- **Why lazy**: loading/executing a ~58KB script at page load measurably
  increases the frequency of an intermittent platform bug (see below), so the
  editor does ZERO work until the tab is actually opened.

## 🚀 Tab 6: Pro Imager — REMOVED (studio UI deleted)
A port of https://perchance.org/ai-imager-pro-4-x as a STANDALONE image
generator (a 6th tab, `#i2p-proimager`, `showTab("pro")`). Not a second
t2i-framework instance (the framework uses fixed global IDs, so two instances
would collide) — it calls `root.generateImage` directly.
> **Status: the studio UI is gone** — `showTab("pro")` / `#/pro` fall back home.
> What survives: `src/imager-pro.js` still ships but only its backend runs —
> the Community tab's gallery feeds (`__proInitGallery`), the per-tile 🎭
> persona modal (`openProPersona`) and 🌍 post modal (`openProPost`), and the
> comments dock. `build()` never runs (`boot()` parks without the studio DOM),
> so bullets below describing selects / generation / tab chrome document the
> REMOVED UI, kept for reference. The tab's data + upgrades scripts
> (`src/imager-pro-data.js` ~730KB, `src/imager-pro-upgrades.js`) were deleted
> 2026-11-03 — nothing ever loaded them (`window.IMAGER_PRO` is undefined at
> runtime; the old "injected on first Pro open" claim was stale).

- **Data — DELETED 2026-11-03**: `src/imager-pro-data.js` (~730KB: 248 artStyles,
  7 styleMixer lists, 11 enhancement lists, 191-item `randomAppend`) was removed —
  nothing loaded it after the studio UI was deleted, and the old "injected on
  first Pro open" claim was stale.
- **Themes — REMOVED (now owned by the Theme tab)**: `src/imager-pro-themes.js`
  still defines `window.IMAGER_PRO_THEMES` (all 42 CSS-var themes from the
  original, each with a `bg` gradient), but the ONLY consumer is the Theme
  Studio, which loads it itself via `ensurePackData()` and exposes the 42 themes
  as site-wide **theme packs**. The Pro tab's theme UI — the 🎨 FAB button
  (tooltip "Change UI Theme", `#pro-fab-theme`/`#pro-drop-theme`), the 🎨 Pro
  Theme card (`#pro-theme` select + 🖼️ BG + ↩️ Default), and all the supporting
  code in `src/imager-pro.js` (`initThemes`, `applyTheme`, `selectTheme`,
  `buildThemeFabDropdown`, `initThemesPoll`, `bindThemeButtons`,
  `window.__proApplyGlobalTheme`, `THEME_KEY`/`BG_KEY`) — has been deleted, so the
  Pro tab is themed purely by the global `--th-*` vars (like every other tab) and
  `showTab("pro")` no longer injects the themes script. The tab renders no
  `pro-themed` class / `--th-pro-bg`. Users' old `imagerProTheme` value is
  migrated into `thThemeV1.pack` once (then deleted) by the studio's `load()`, so
  a previously chosen Pro theme becomes the site-wide pack; `imagerProBg` is
  legacy/unused (page backgrounds live in `t2iBgSettings`).
- **App**: `src/imager-pro.js` — self-booting IIFE (polls for `IMAGER_PRO` +
  `root.generateImage` + DOM). The studio UI is gone so `build()` never runs and
  no selects are built; the live parts are the gallery feeds, the persona/post
  modals, and the comments dock (see notice above).
- **Prompt assembly** mirrors the original: base style prompt always included
  (its `[input.description]` placeholder replaced with the description),
  fusions 2–5 skipped when set to the "No style (Raw Prompt)" option, mixers
  appended bare, enhancements appended as `mood: …`, `lighting: …`, `palette: …`,
  `composition: …`, `detail: …`, `effect: …`, `texture: …`, `focus: …`,
  `emotion: …`, `time: …`, `camera: …`.
- **Features**: per-select 🔓/🔒 locks (localStorage `imagerProLocks`, respected
  by Randomize/Reset), 🎲 Randomize-all, 🗑️ Reset, 📋 Copy prompt,
  💾 presets (localStorage `imagerProPresets`, save/load/delete by name),
  🎲 Random idea + ✨ AI idea on the description (the latter via
  `root.generateText`, seeded with the current base style + rough idea),
  🗒️ Prompt Scratchpad (auto-saved `imagerProScratch`, "Use as description"
  copies it into the prompt; supports scratchpad variables — lines like
  `ANIMAL = {dog|cat|frog}` define `window[NAME]` refs usable as `[ANIMAL]`
  anywhere in Your Vision, resolved per image via perchance template eval
  (`resolveTemplate()` in `src/imager-pro.js`, wraps `evaluateItem` in
  `ignorePerchanceErrors` with a raw-text fallback so typos don't leak
  "undefined"); a `DESCRIPTION = ...` line feeds the 🎲 Random idea button
  (mirrors the Image-Generator tab's `parseVariables`/`useVariables`
  scratchpad). Variables are shared on `window` with the gen tab; the
  placeholder + hint text are set in JS (`build()`) because literal `[`/`{`
  in static HTML get templated by the engine), live prompt preview, Ctrl+Enter to generate,
  generate 1–32 images sequentially (seed auto-increments when set, ⏹ Stop
  between images), ⬇️ download (named `<style>-<desc>`) + 💾 favorite
  (downscaled JPEG thumbs, localStorage `imagerProFavs`, max 12), and a
  lifetime generation counter with milestone toasts (🎨1/🎉10/🌟50/👑100/🔥500/💎1000,
  localStorage `imagerProGenCount`). Last-used selections persist via
  `imagerProStateV1`.
- **Pro 4.x upgrades — DELETED 2026-11-03 with the file** (it was never loaded
  after the studio UI was removed; had been `src/imager-pro-upgrades.js`, applied
  right after the app —
  same cards, same order, no layout change): 🔍 per-dropdown search (a 🔍 button
  beside each lock; matches option names AND prompt prose, ★ favorites pin first,
  `imagerProOptFavs`) + 🌐 global search across all 23 dropdowns (`🔍 Search`
  button, `Ctrl/⌘+K`); 🧠 Auto-pick (AI phrase extraction via `root.generateText`
  with pure-keyword fallback, per-group confidence scoring, locks respected, one-click
  ↩ undo; empty description runs a balanced smart-random instead); 🌱 seed tools
  (🔒 lock / 🎲 new locked seed / ♻️ reuse last on-page image seed,
  `imagerProSeedLock`); 🕘 generation history (last 30 setups, restore or copy,
  `imagerProHistory`); 🎨 custom options (add your own art styles / mixer options /
  enhancements, persisted in `imagerProCustomOpts`, appended to the existing
  dropdowns — the local answer to the original's Style Studio).
- **Persona / character creation** (mirrors the Image-Generator tab's persona
  flow): each generated tile gets a 🎭 button that opens a modal
  (`openProPersona()` in `src/imager-pro.js`, `.pro-persona-*` CSS) showing the
  image + optional instruction box. "✨ generate persona" streams an
  AI-generated name + `# {{char}}` description (Tagline / Visual Description /
  Personality / Voice & Mannerisms / Backstory / Goals, Fears & Desires /
  Habits & Quirks / Likes & Dislikes / A Secret / Relationship with {{user}} /
  Opening Line / Roleplay Behavior Examples) via `root.generateText` with the
  shared richer prompt template from `src/persona.js` (see below) and `onChunk`
  section parser; a tone selector + "✨ extra sparkle" toggle shape the output.
  "💬 chat with them" builds the same `addCharacter` JSON the gen tab does
  (avatar = the
  generated image, `imagePromptSuffix` = the Pro tab's selected art style when
  it isn't the Raw Prompt option) and hands it to the shared
  `window.t2i_generateShareLinkForCharacter` override (`src/gallery.js`), which
  opens this page's **💬 AI Chat tab** and loads the character straight into the
  embedded chat (see "Tab 10" below) — no external site, no new browser tab. The
  character travels as the chat generator's own
  `#<url-encoded {"addCharacter":…,"quickAdd":true} json>` fragment; `data:`/`blob:`
  avatars are downscaled to a ~256px JPEG first so the fragment stays small. Video
  avatars can't travel that way (and external chats render `background-image`, so
  motion wouldn't play there anyway): the handoff sends the video's poster frame
  instead — see "Video/GIF avatars" below. When
  the chat tab isn't available the override falls back to showing a copyable share
  link for `perchance.org/bigger-and-better-ai-chat` (a fork of ai-character-chat
  that accepts the same `#<addCharacter json>` / `?data=<name>~<file>` formats; its
  publicId is `3096b44cf71ba8ea0f887e091a6b3be1`).
- **Persona-prompt autosave**: every time a personality is generated (gen tab or
  Pro tab), the prompts used (image prompt + optional extra instruction) plus the
  generated name/description are autosaved to a per-browser history (kv-plugin /
  IndexedDB folder `t2iPersonaPrompts`, key `list`, newest first, capped at 200 —
  deliberately NOT localStorage, which shares quota with the gallery's image
  dataURLs and rejects writes when full). Backed by
  `window.t2i_autosavePersonaPrompt` in `src/gen-extras.js`; browse/copy/clear via
  `window.t2i_openPersonaPromptHistory()` ("📋 prompt history" button in the
  Pro persona modal, the Pro output toolbar, and injected into the gen tab's
  persona editor — the gen-tab flow is wrapped because it lives in the read-only
  framework import).
- **🌍 Post to community gallery** (each tile's 🌍 button → `openProPost()`):
  the plugin's save-to-gallery API (`/api/saveImageToGallery` on
  image-generation.perchance.org) is WAF-guarded and can only be called
  same-origin, so this re-opens the image in the platform's OWN embed iframe
  (`/embed#hash` with the tile's exact prompt + captured `res.inputs.seed`,
  resolution, guidanceScale, negativePrompt — stored on the tile as
  `tile.__proInputs` at generation time), which regenerates ≈the same image
  (same seed+prompt) and shows the native ❤️ → 📮 "send to gallery" flow,
  gallery name defaulting to `public` (the community gallery). Save happens
  same-origin inside the iframe, so WAF/verification are satisfied and the
  plugin's own `savedImageToGallerySignal` handler refreshes recent galleries.
  The modal (`#proPostModal`, `.pro-post-*` CSS) explains the two-click flow.
  The same modal serves **📤 Post from Personal** (`#pro-gal-post-personal` in the
  Community Galleries header): picks one Personal Gallery image via the gallery's
  own pick mode (`t2iOpenGallery({pick})`), then re-opens its saved prompt in the
  embed (seed −1, fresh variation — exact pixels can't be re-uploaded, and the
  modal note says so). `openProPost` takes an optional 4th `noteHtml` arg for
  that alternate copy. The Explore tab has an equivalent `📤 Post from Personal`
  button (`openPostFromPersonal`/`openPostModal` in `src/explore.js`, own
  `#xplPostModal` reusing the same CSS).
- **Site chrome (matched to the original)**: ⚠️ NSFW content-warning gate on
  first visit to the tab (`#pro-gate`, scroll-locks until agree/disagree,
  optional "do not show again" → `imagerProGateDoNotShow` (permanent; agreeing
  also sets `imagerProGateAgreedSession` in sessionStorage so the gate shows
  once per visit rather than re-covering the tab on every return), disagree routes to
  Tab 1); glowing announcement banner under the hero (theme-accent tint, matches
  the original's pink-glow strip); a **welcome/intro panel** (`#pro-intro`, left
  accent border + 🌌 icon + "Welcome to the Pro Imager!" + keyboard/
  tip shortcuts) under the banner; an **⬆️ Back to top** button in a centered row
  below the generator (reset / randomize / copy / presets all live in the tab's
  own action + preset rows, and the 🔗 Useful Links / 🎥 AI Video Generators lists
  moved to the 📜 Credits tab); and keyboard shortcuts
  **Ctrl+Enter** = generate, **Ctrl+R** = randomize (both only while the Pro
  tab is active). `window.__proTabActive` / `__proChromeReady` / `__proOnTab`
  gate tab-active behavior.
- **Community comments** (bottom of the tab, matches the original): `#pro-comments-ctn`
  embeds the official `comments-plugin` (`root.commentsPlugin`, channel `general`,
  `allowCustomChannels:true`) via `initComments()` in `src/imager-pro.js`, fired
  lazily by `window.__proOnTab(true)` on first Pro-tab show (the plugin lazy-loads
  its own iframe via IntersectionObserver, so it must only be mounted while the
  tab is visible). It also receives the site-wide custom-emoji packs (see
  "😀 Comment emojis & the emoji browser") and carries an **😀 Emoji browser** bar
  (`#pro-emoji-btn`, delegated through `data-act="emojis"`) above the box.
- **⋯ Public-image popup menu** (`window.PubMenu`, defined in index.html just before the
  translator block): every public-gallery image the studio renders itself — Home's
  `#hm-comm` strip and Pro's `.pro-comm-card` feeds (the framework's own gallery iframe is
  cross-origin and can't be touched) — gets a ⋯ badge (hover-reveal on desktop, always
  visible on touch) opening a popup with 🔍 View · ▸ Send to… · 📋 Copy prompt ·
  ⬇ Download. It is EXTENSIBLE without touching any other file:
  `window.PubMenu.addAction({id, icon?, label, show?, run(item, anchorEl)})` where
  `item = {url, prompt, title, tag?, view?}`; `removeAction(id)` takes it back out.
  The same menu sits on every generated output in the Image Generator tab: `addMenuButton()`
  in `src/gallery.js` (called from `handleImageFinished()` / `saveAllOnPage()` alongside the
  save/reroll buttons) overlays the ⋯ badge on each `.t2i-image-ctn` and refreshes its item
  (including a downscaled `thumb` for Send-to-Vault) whenever the tile updates.
- **Saved-images gallery** (shared with the Image Generator tab): the Pro Output
  card has `🖼️ Saved (N)` (opens the same `t2iGalleryModal`), `☁️ autosave`
  (shared `t2iGalleryAutoSave` setting, default ON) and `💾 save all`; each tile
  has a `☁️` save-to-gallery button. Saving stores the full-size image + prompt
  via the Image-Generator tab's gallery pipeline (localStorage `t2iGalleryItems`
  + cloud mirror + NSFW-filter gate). Gallery items persist a short hash (`dh`)
  of the image for dedup instead of the full base64 `dataUrl` — the dataUrl used
  to be stored in full (~220KB/img) which hit the ~5MB localStorage quota after
  ~22 images and silently broke every later save; `saveGallery` compacts legacy
  items on the next save (see `phash`/`itemDedupKey` in `src/gallery.js`). The
  gallery functions were exposed on
  `window` as `t2iOpenGallery` / `t2iAddImageToGallery` / `t2iAddImageWithUrl` /
  `t2iGetGallery` / `t2iSaveGallery` / `t2iGetAutoSave` / `t2iSetAutoSave` /
  `t2iGetNsfwFilter` / `t2iUploadThumbnail` / `t2iCheckNsfw` /
  `t2iUpdateGalleryCount` (defined in the `src/gallery.js` gallery IIFE);
  `updateGalleryButtonCount()` refreshes both the gen-tab and Pro-tab count buttons.
- **Generate opts**: `root.generateImage(prompt, {resolution, guidanceScale,
  seed, negativePrompt})`. Shape 768x768 / 512x768 / 768x512; guidance
  fixed 1–30 or 🎲 Random (fresh 7–30 roll, the default — copied from
  `best-image-generator-by-nexora`); 1–32 images.
- **Cross-tab pipeline**: each output tile has **📚 vault** (save prompt + thumb,
  tags `["pro"]`), **▸ send** (`PromptBridge`) and **🧑 roster**
  (`Characters.captureFromImage` — snags name/prompt/seed/shape/thumb for a
  consistent character). `#pro-variations` runs a **🎞️ contact sheet**
  (`runVariations()` — same prompt across a seed/shape sweep), `#pro-share` emits a
  Pro **🔗 recipe** (`Recipe.copy("pro", …)`, re-applied via
  `window.__proApplyRecipe`: description / art style / shape / count / guidance /
  seed / negative), and `window.__proSetDesc` lets the hub push a prompt into the
  "Your Vision" box. (The Pro tab already had its own ✨ AI idea button, so no
  separate enhancer was added there.)
- **Theming**: all CSS uses `--th-*` vars; `#i2p-proimager` included in the
  font-family / reduced-motion / smooth-transition / glow / anim rules (its own
  `<style>` block next to the tab markup handles the `data-th-*` variants).

## ✨ Tab 7: AI Photo EditorA rebuilt version of the classic perchance.org/sgdtlwdl1u "AI Photo Editor",
ported to the CURRENT platform: that original relied on the text-to-image
plugin's old `init_image` option, which no longer exists — the current plugin's
`referenceImage` is deliberately disabled server-side (2026-08-25, per the
platform owner — see comment in the plugin source), and the t2i framework has no
img2img either. So the tab implements the same user flow with a working
equivalent: the AI first **describes** the uploaded photo (vision via the
ai-text-plugin image-Blob instruction), then generates a fresh image whose
prompt = description + the user's edit instruction + a creativity template.
This is stated honestly in the tab's footer ("re-creates your photo", not
pixel-level retouching).

- **Markup** `#i2p-aiedit` (hidden) + styles (`.ae-*`, reuses global `.i2p-*`
  classes) live in index.html right after the edit-app markup. Logic lives in
  `src/aiedit.js` (single IIFE, same lazy pattern as editor.js: `showTab`
  injects the script on first open, boot deferred to `window.__aieditOnShow`).
- **UI (ported from the source)**: upload preview (dropzone, browse, paste —
  mirrors the i2p tab's dropzone, plus a "🖼️ Try a sample photo" button loading
  the bundled `src/samples/` photos, alternating), edit-instruction textarea, "🪄 Apply edit"
  button with loading state, and an output area. New on top of the source:
  10 one-click quick-edit presets (watercolor, oil, sketch, photorealistic,
  golden hour, cyberpunk, fantasy, pixel art, add-a-dragon, new background),
  🎭 creativity slider (Faithful / Balanced / Creative — appended to the prompt
  as a keep-it-recognizable vs reinterpret-bravely instruction), 🖼️ shape
  (Auto matches the uploaded photo's aspect ratio → 512x512/512x768/768x512;
  portrait/landscape/square override), 🔢 1/2/4 versions, optional 🎲 seed
  (auto-increments per version), ⏹ Stop between versions.
- **Vision step**: the uploaded image is downscaled to ≤1400px JPEG, passed as
  a Blob in `root.generateText({instruction:[VISION_SYSTEM, blob], onChunk})`,
  streamed into an editable "🔍 How the AI read your photo" textarea
  (`#ae-desc-card`); the analysis is cached per image (descRef/descFor) so
  re-running an edit doesn't re-pay the vision call unless the photo changes or
  the user clicks "🔄 Re-analyze photo". The description text is editable —
  users can correct what the AI misread.
- **Results** (`#ae-results`, `.ae-card` tiles): aspect-corrected thumbnails
  (click to zoom), the prompt used (click-2-line clamp, full text in title),
  ⬇️ download (PNG), 📋 copy prompt, ❤️ save to community gallery
  (`window.t2iAddImageToGallery`, the shared gen-tab gallery pipeline), and
  🎨 Use (writes the prompt into the t2i description box, switches to gen tab).
- **Cross-tab pipeline**: result cards also have **📚 vault** (save the edited-image
  prompt + thumb, tags `["ai-photo-editor"]`) and **▸ send** buttons;
  `window.__aieditSetInstruction` lets the hub push text into the edit-instruction
  box.
- **Paste listener** only reacts while this tab is visible; the source
  generator's simple NSFW-keyword warning was dropped (this generator is
  unrestricted by design).

## 📚 Tab 8: Comic Scanner
A `.cbz` → story-synopsis + character-profiles tool, with optional translation for
comics in any language. Markup `#comic-app` + styles
(`.cb-*`) live in index.html; logic lives in `src/comicscan.js` (single IIFE, same
lazy pattern as editor.js/aiedit.js: `showTab("comic")` injects the script on first
open, boot deferred to `window.__comicOnShow`).

- **Translation (any language → your language) — a POST-SCAN step**: the scan itself
  is translation-free and always keeps the comic's own wording; every page reports
  its detected `lang` (the first page's becomes `srcLang`, shown in the transcript
  count). After a scan finishes, a "🌐 Translate" card (`#cb-card-translate`) appears
  with the results — a language select (`#cb-translate`; a `__other__` option reveals
  a free-text box `#cb-lang-custom`) plus a `#cb-translate-run` button. Running it is
  a fast TEXT-ONLY pass that never re-reads the page images: `translateTranscript()`
  batches every line (30 at a time) into a JSON-array request and writes
  `line.translation` + `line.speakerT`; `translateStory()` sets `lastReport.storyT`;
  `translateCharacters()` sets `c.*_t` for role/appearance/personality/background/arc
  (names are never translated) while the character `prompt` stays in ENGLISH (image
  models work best in English). All three use the shared `TRANSLATE_SYS` prefix.
  The button doubles as "⏹ Stop" while running (applies a partial translation).
  Rendering: `cField(c,key)` / `trSpeaker(L)` / `trText(L)` / `storyShown()` pick the
  `_t`/translation value when `targetLang` is set; the transcript shows the
  translation as the main line with the original underneath (`.cb-tr-orig`), a
  "🔤 Hide original" toggle adds `cb-hide-orig`. After translating,
  `renderTranscriptAll()` + `rerenderCharacters()` re-render from `lastReport` (a
  previously generated character image survives via `card.__generatedDataUrl`), so
  re-running into a DIFFERENT language works without re-scanning. The markdown/text
  exports + 📋 Copy carry both the translation and the original. Before any
  translation the report is exactly the untranslated scan output (no toggle, no
  `_t` fields).
- **Parsing**: `.cbz`/`.zip` read with `FileReader.readAsArrayBuffer` and unzipped
  in-page with `fflate` (dynamic `import("https://esm.sh/fflate")`, loaded lazily on
  first use — the only external runtime dep). Image entries are filtered by extension
  and natural-sorted so page order is correct; each page becomes a `Blob`.
- **Browsing pages (contained scroll)**: the thumbnail area `#cb-strip` is a bounded
  **scrollable grid** (`max-height: 308px; overflow-y: auto; overscroll-behavior:
  contain`) of tap-to-select thumbs (`makeThumb` → 120px JPEG data URL) — for a long
  comic you scroll INSIDE that box (or the reader) rather than scrolling the whole
  page. A **🔍 Read pages** button (`#cb-view-pages`) opens `#cb-reader`, a modal
  reader: a full-size page stack in its own scroll container (`#cb-reader-scroll`,
  `overscroll-behavior: contain`) built from `URL.createObjectURL(page.blob)` (revoked
  on close), with a `Page x / N` position indicator that updates via a scroll spy
  (`onReaderScroll`), prev/next buttons, arrow-key/space navigation and Esc/backdrop
  close. While open, `body.cb-reader-open { overflow: hidden }` locks the page behind
  it so only the reader scrolls. `closeReader()` revokes the object URLs and clears the
  DOM; `clearComic()` closes it too. Otherwise pages are auto-sampled evenly
  (`autoSample`) per the "Pages to scan" select (Auto=12 / 4 / 8 / 12 / 20 / All).
- **Selecting exactly what to scan** (`#cb-sel-tools`, the "🎯 Exact pages" toolbar
  under the page count, shown once a comic is loaded): the page strip is the picker —
  **tap** a thumb to toggle it, **drag** across thumbs to paint a run on/off, or
  **Shift+click** to select the inclusive span from the last-clicked page
  (touch = tap-to-toggle only, so touch scrolling still works). The toolbar adds a
  **from → to page range** with **select range** (marks every page in the range) and
  **sample range** (evenly spreads the current "Pages to scan" count *within* just
  that range — "Auto"/"All" fill the whole range), plus **all / none / invert**. A
  live readout (`#cb-sel-count`) reports "N of M selected" and the compressed 1-based
  ranges (e.g. "1, 11–12"). Hand-picking sets `manual = true`, which overrides the
  "Pages to scan" select (`resetSelection`/auto-sample only runs while `!manual`) and
  makes `run()` scan exactly those pages, in ascending page order; the ↺ auto-sample
  button (revealed on first pick) restores the automatic sample. Ranges clamp to
  `[1, pageCount]`; `formatRanges` compresses indices for the readout. The per-thumb
  `click` listener was replaced by delegated `pointerdown`/`pointermove`/`pointerup`
  handlers on `#cb-strip` (drag paints between the anchor and the current thumb).
- **Scanning**: each selected page is sent to `root.generateText` with a vision
  `instruction` ARRAY `[SCAN_SYS, accumulated notes, pageTask, blob]` (image last,
  prefix-cache friendly). The page task asks for ONE JSON object
  `{"notes": "...", "transcript": [...]}`: `notes` (compact, under 140 words) are
  pushed into the append-only `log` (prefixed `[Page n]` client-side); `transcript`
  is the complete verbatim dialogue of the page in reading order —
  `[{speaker, text}]`, narrator captions included, sound effects excluded — kept
  OUT of the shared log so compaction can never paraphrase it away. `scanPage`
  parses the JSON with `extractJSON` and falls back to treating the raw reply as
  notes if parsing fails. When the prompt nears the token budget the older half of
  the log is folded into a rolling `summary` via a compaction call (same pattern
  as the ai-text-plugin skill). `getMetaObject` reads `countTokens`/
  `idealMaxContextTokens`.

- **⚡ Fast mode** (`#cb-fast`, on by default): a wall-clock speedup with three
  changes. (1) **Pages are read in parallel** — `mapLimit(total, FAST_CONCURRENCY=3,
  …)` runs up to 3 vision calls at once instead of strictly one-by-one, each using a
  FIXED shared prefix (`scanBaseText()` = `SCAN_SYS` + focus; the image sits last), so
  they share one server prefix-cache entry and their notes are merged back in page
  order by `absorbScan()` after they return. (2) **Story + character list overlap** —
  they only depend on the assembled log, so `listCharacters()` is started while
  `writeStory()` streams. (3) **All character profiles in ONE call** —
  `profileCharacters()` sends the whole list to `PROFILE_ALL_TASK` and gets a JSON
  array back (matched to names case-insensitively, gaps fall back to a per-character
  call), replacing up to 8 sequential calls. After the pages merge, `compactToFit()`
  folds the log as needed before synthesis. `activeGens`/`stopGens()` track every
  in-flight generation so ⏹ Stop cancels all parallel calls. Unchecking Fast mode
  restores the original strictly-sequential, one-page-at-a-time pipeline.

- **Transcript**: each page's verbatim lines are appended live to the 💬 Transcript
  card (`#cb-transcript`, rendered by `renderTranscriptPage` keyed by the REAL
  page number in the .cbz, `#cb-transcript-count` shows pages/lines) as scanning
  proceeds; stored in `lastReport.transcript`. `transcriptToMarkdown` /
  `transcriptToText` feed the exports and the 📋 Copy button. Speaker names are
  AI-attributed; unidentified speakers get a visual description.
- **Synthesis** (all share the same `SCAN_SYS`+scan-log prefix for cache hits):
  a long streamed **story synopsis** (`STORY_TASK`, `onChunk` into `#cb-story`), a
  **character list** call returning a JSON array (names+roles, capped by
  "Max characters" select, retried once), then **character profiles**. In Fast mode
  every profile comes back from ONE `profileCharacters()` call
  (`PROFILE_ALL_TASK` → JSON array, matched back by name, per-character fallback for
  gaps); otherwise it's strictly **one profile call per character**. Each profile is
  a JSON object `{name, role, appearance, personality, background, arc,
  prompt}` — rendered as cards with the `prompt` (a ready-to-use text-to-image
  prompt for that character) copyable, feedable to the gen tab ("🎨 Use in
  Generator", same `[data-name="description"]` + `showTab("gen")` pattern — it also
  fills the generator's "🏷️ Image name" field with the character's name, so the
  generated image is named after them), or
  rendered via `root.generateImage` ("🖼️ Generate", 512x768, `hideGalleryButtons`),
  with the generated image saveable to the community gallery via the shared
  `t2iAddImageToGallery` pipeline. `extractJSON` strips code fences and grabs the
  first JSON object/array as a fallback.
- **Cross-tab pipeline**: every character card has **📚 Vault** (`#cb-chars`
  `data-act="vault"` — saves the character prompt, with the generated image if one
  exists, tags `["comic","character"]`, label = the name) and **▸ Send**
  (`PromptBridge`) buttons, and the focus box has a **📚 Load from vault** button
  (`#cb-focus-vault` → `Vault.pick`). `window.__comicSetFocus` lets the hub push
  text into the focus box, and `window.__comicGetPrompts` exposes the scanned
  character prompts for "Save all prompts". (There's also a test-only
  `window.__comicRenderTest(chars)` hook, defined only when
  `window.__comicRenderTestArmed` is truthy, for rendering synthetic character
  cards without a full scan.)
- **Export**: "📄 Download report" assembles story + transcript + characters into
  a markdown `.md` blob; "⬇️ Download info" writes the same content as a `.txt`.
  "📋 Copy" buttons for story, transcript, and all characters.
- **Stop**: `stopped` flag checked between steps; `stopGens()` cancels every
  in-flight `generateText` promise (`.stop()`), so it also stops all the parallel
  page reads in Fast mode.
- **Optional Focus** textarea is appended to the story/list/profile tasks.

## 🧑 Tab 9: Persona Generator
A full character-building workspace (markup `#persona-app` + a `#persona-app ...`
style block in index.html; the whole app lives in `src/persona-tab.js`, a single
lazy IIFE alongside `src/persona.js`). `showTab("persona")` calls `ensurePersona()`,
which loads `src/persona.js` (the shared engine, reusing the `__personaLoaded`
flag so it's never double-loaded) then `src/persona-tab.js`, then
`window.__personaOnShow()`. This tab is the richest of the app's persona flows —
the gen-tab 🎭 button and the Pro-tab persona modal keep working unchanged. The
`#persona-app` div ships a small animated "Loading Persona Generator…" boot
placeholder (`.pgen-boot`) since this is the only tab that builds entirely from a
script chain; `build()` replaces it on first boot.

- **Gallery references** — `🖼️ Import from gallery` opens **the real gallery modal
  itself in pick mode** (`window.t2iOpenGallery({pick: {title, hint, addNoun,
  onPick}})`, i.e. the same `src/gallery.js` UI the 🎨/🚀/🩹 tabs use, not a
  separate dialog). In pick mode the gallery hides all management controls (folder
  rows, move/ZIP/export/import/hidden/undo/delete-all, per-card open/copy/delete
  buttons, link-chat buttons) and shows a highlighted pick bar with a hint,
  a live count, `select all shown` / `clear` / `Cancel` and an accent
  `✅ Add N as references` button; tapping a card image (or its checkbox) toggles
  its selection and `.gal-card.picked` outlines it. It searches across the local
  gallery **and** the peer "chat" entries (`t2iLoadPeerGallery()` is triggered
  first), so chat images can be picked too. On `Add`, `onPick(items)` receives the
  chosen gallery items and `src/persona-tab.js` dedupes by URL against existing
  refs, calling `addRef({url, prompt, title, folder})` for each new one (each
  imported image arrives **with the prompt that made it**) and toasting how many
  were added / already present. You can edit any reference's prompt, mark one as
  **primary** (the look the character is based on), toggle a ref off, or remove it.
  Also `⬆️ Upload &
  describe` (downscale ≤1024px → vision call via `root.generateText` with
  `[CAPTION_SYS, blob]`, streamed into the ref prompt), `➕ Add a prompt` (text
  only), and `🗑️ Clear refs`. No references at all is fine — the brief alone
  invents someone.
- **Rich options** — Tone (**1410 tones in 15 `<optgroup>`s**: ✨ General & mood,
  💞 Romance & affection, 🍥 Dere personalities, 🎌 Anime
  archetypes, 🖤 Dark & dangerous, 💪 Power & charisma, 🎭 Archetypes & characters,
  💢 Gire personalities, 😡 Aggressive & confrontational, 😡 Hostile relatives, then the 18+ blocks at the bottom: 🍥 Dere personalities
  — after dark 🔞, 🎌 Anime archetypes — mature 🔞, 💢 Gire personalities —
  extreme 🔞, 😡 Aggressive & untamed 🔞, 🔞 NSFW & taboo
  — from grounded/deadpan through erotic, dominant/submissive, obsessive,
  predatory, a 722-strong dere-anime personality set (deredere, tsundere, dandere,
  yandere, kuudere, himedere, kamidere, sadodere, erodere, amadere, butsudere,
  kundere, shittodere, sunao cool/heat/surreal, tsun-aho/ama/baka/dero/dora/neko/
  puri/tere, zondere, …) and a 102-strong 🎌 Anime archetypes set (prodigy,
  underdog hard-worker, shonen brawler, the lucky one, the fraud, good demon,
  antihero, dark-past hero, plus non-dere tropes: idol, bifauxnen, tomboy, dojikko,
  donkan, chuunibyou, haraguro, glutton, otaku, otokonoko, sukebe, tsunpure,
  tsuntsun, yamato nadeshiko, …); the 💢 Gire personalities set adds the 182
  "gire" (reverse-dere / anger-flip) types from the Dere Types Wiki — kireru,
  buchigire, majigire, tsungire, yangire, kiredere, akugire, bucchagire,
  kichigire, kuugire, sadogire, kamigire, himegire, oujigire, hajigire,
  kawagire, nyangire, tabegire, yoigire, smuggire, plus the WIP entries
  (bakagire, dangire, nemuigire, jougire, kowagire, oujogire, uzagire, usogire)
  — and the same WIP page supplies non-gire additions: mamadere/papadere
  (sugar-parent doting) in Romance, and usokko, yoikko, onee, onii, oka, oto
  in Archetypes. The Dere Types Wiki's **Unofficial / Androgynous / Hybrid
  Archetypes** category pages add a further 79 tones: 39 unofficial dere-family
  types (ambidere, biyadere, borodere, bosudere, bureidere, dandoro, danyan,
  dereutsu, doromuga, erohaji, fuandere, fushidere, hikadere, hokodere, inudere,
  jendere, kahodere, kakkodere, kondere, kumadere, megaun, narudere, nisedere,
  nisekami, norodere, pyondere, sattodere, shijidere, sunao-chill, taidere,
  tekidere, toubodere, toukadere, tsun-utsu, utadere, utsudan, yancool, yanheat,
  yanmeta), 21 androgynous/hybrid types (bishounen, bokukko, dansou-no-reijin,
  futanari, ikemen-joshi, josou-danshi, nantaika, nekama, nyotaika, okama, orekko,
  otenba-musume, otoko-masari, igyoto, juujin, kemono, kemonomimi, mecha,
  monster-danshi, monster-musume, tsuno-musume), and 19 further archetypes
  (eiyuucon, fumin, furakoi, genkanmat, inochishirazu, jikowa, kaizokucon,
  kamikan, keikenna, kimuzukashii, koubutsu-chararacter, kusai, kuutsun,
  mekanikku, meta-character, saijaku, saishoku-shugisha, shizen-aikou,
  ungaii-taishitsu). The **Japanese Archetypes** category adds a further 33 —
  brocon/siscon, burikko, charao, chunibyo, cosplayer, gag character, gyaru,
  hikikomori, himekishi, ijimerarekko, ikemen, itazurakko, itome character, kaiju,
  kitsuensha, mahou shoujo, maou, miko, moe, nakimushi, nijikon, ojou-sama,
  sentou kyou, sukeban, yakuza, yurijoshi (Anime), hanahaki disease (Romance),
  kyouai (Dark), fashion menhera (Dere) and fukou taishitsu / shigoto ningen /
  tennen s (Archetypes). The @animearchetypes Tumblr list of *All Non-Dere Anime
  Tropes* added the last two, aho and neko — every other entry on it (aidoru,
  bifauxnen, bokukko, bukako, chibi, chikyūgai, cool beauty, chuugokujo, dameko,
  dojikko, donkan, eronna, fudanshi/fujoshi, genki, hakase, haraguro, harapeko
  chara, hetare, ijimekko, imouto, kawaiiko, kimoiko, meganekko, nisetoshi,
  ojousama, orekko, osananajimi, otaku, otokonoko, sukebe, tsunpure, tsuntsun,
  tsunshun, yamato nadeshiko, yangire) was already covered under an existing id
  (e.g. idol, alien, glutton, ageless, Outcast, Devoted Servant, Silk & Steel).
  Each entry is an
  `{id,label,hint}` and the hint
  becomes the "TONE DIRECTION:" line of the shared prompt. Tones may carry a
  `rating` floor ("mature" for violent/unstable deres and antiheroes, "explicit"
  for the 🔥 Erotic set and erodere/masodere/eronna/chindere/gurodere/hamedere/
  tsundero): picking one auto-raises the Content-rating select with a toast, and
  `effectiveRating()` in `src/persona.js` makes the stricter of (chosen rating,
  tone floor) win when building the prompt — so such a tone can't be neutered by a
  leftover SFW rating. `window.t2i_fillToneSelect(sel, id)` renders the grouped
  list and is shared by this tab, the Pro persona modal and the gen-tab tone
  picker (its optional third `query` argument powers the tab's 🔎 tone search box,
  which live-filters BOTH tone selects (Tone and Tone mix) by tone name,
  group or hint text and shows a match count). A Tone mix dropdown (same tone list minus ✨ Auto, headed
   by "(no mix — single tone)") blends a second voice into the main tone via its
   own Tone merge style dropdown reusing `MERGE_STYLES`; the engine renders a
   "TONE MIX (mix × base — style)" line after TONE DIRECTION, and both tones'
   `rating` floors feed `effectiveRating()` and the auto-raise toast.
   Depth/length (Compact/Balanced/Rich/Epic,
  with per-pass word bands), Roleplay examples (4–20), Language (31), Content
  rating (SFW/Suggestive/Mature/Explicit), Gender (**17, in `<optgroup>`s** —
  Female/Male/Non-binary, a 🏳️‍🌈 trans & non-binary set (trans woman, trans man,
  genderfluid, agender, bigender, androgynous, intersex, futanari, questioning) and a
  🤖 non-human set (AI/construct, shapeshifter, alien/spirit/deity, gender never
  stated) — each with a `hint` that becomes the brief's \"- Gender:\" line) plus
  free-text pronouns, Genre (grouped dropdown, **1032 setting presets in 18
  `<optgroup>`s** spanning fantasy, Japan & Korea, sci-fi, horror, occult, romance, historical, crime,
  modern-life and world/era flavours, with 🔞 Taboo & forbidden second-to-last and
  🔞 Explicit taboo very last, plus ✏️ Custom free-text — every entry but the
  grounded default carries a one-line `hint` shown as a hover tooltip on its
  `<option>`) alongside a
  Genre / setting mix dropdown sharing the same list for blending two genres (one 🔎 genre
  search box above the row live-filters BOTH genre selects by name, group or hint,
  with a match count — filtering never commits: the saved pick stays displayed), plus a
  Merge style dropdown (`MERGE_STYLES` in `src/persona.js` — ✨ Default (let AI decide)
  plus 12 ways the mix combines:
  even fusion, base/mix-first, stranger, double life, clash, single-world mashup, style-only,
  trade, past, intrusion, secret nature — each a `{mix}`/`{base}` template rendered into the
  brief's "- Genre / setting mix" line). Whenever a real mix is active a
  🧬 blend preview line appears under the genre row showing the combination
  as one item ("mix × base — style", mirroring the brief's parenthetical),
  whose hover tooltip is the rendered merge instruction plus each known genre's
  own hint (kept in sync by `syncBlendPreview()` in `src/persona-tab.js`, which
  runs on every `saveOpts()`),
  Relationship-to-`{{user}}` (**54 preset types in 6 `<optgroup>`s** — 💞 Romance &
  intimacy, 👥 Friendship & rivalry, 🏠 Family, 💼 Work & power, ⚔️ Enemies &
  danger, 🤝 Unusual bonds, on top of \"(leave it to the AI)\" — each with a `hint`
  that becomes the brief's \"- Relationship to {{user}}:\" line, plus a free-text
  override), an Occult-types select (**366 preset types in 13 `<optgroup>`s** — 🧙 Practitioners,
  🍃 Folk & far traditions, 📜 Pact-bound & bloodlines, 👁 Sensitives & mediums,
  🛡️ Hunters & wardens, 🧛 Classic creatures, 🎌 Japanese occult, 🪶 Native American lore, 📺 Anime occult, 🧹 Witchcraft, 👽 Alien contact, plus 🔞 Dark pacts & monstrous lovers and 🔞 Midnight rites &
  willing devotees (43 explicit + 24 mature, consent-forward and adults-only), on top
  of "✨ None / not occult" — each with a `hint` that becomes the brief's "- Occult type:"
  line; mature/explicit picks raise the content rating automatically, like tones),
  a locked Name, Things-to-avoid, an Extra-instructions box, and
  **66 optional extra sections**. The grouped Gender/Genre/Relationship/Occult-types selects come
  from `fillSelect()` in `src/persona-tab.js`, which wraps runs of items sharing a
  `group` name in an `<optgroup>` (ungrouped lists render exactly as before) and
  renders each item's `hint` as the `<option>`'s hover tooltip (`o.title`); the
  lists themselves are `GENDERS`/`GENRES`/`RELATIONSHIPS`/`OCCULT_TYPES` in `src/persona.js`,
  exposed as `window.t2i_personaOptions`, and adding an entry there is all that's
  needed to extend them. Owner-only gating: the 53 incest-family TONES (`OWNER_ONLY_TONES` in `src/persona.js` —
  the con/open kin ladder plus stepmom/stepdad) are locked the same way:
  `t2i_fillToneSelect()` hides them from visitors, the tab resets smuggled
  picks, and `t2i_buildPersonaInstruction()` drops their direction lines
  (genres used to share this lock but are public now — every visitor sees
  the genre selects and generation honours them).
  Unlocking via the owner console reveals them without a reload. The core 16: Skills & Talents, Relationships &
  Allies, Signature Possessions, Daily Life, Combat & Abilities, Theme &
  Aesthetic, Morals & Beliefs, Home & Living Space, Companions & Creatures, Vices
  & Bad Habits, Wardrobe & Style, Reputation & Standing, Romantic History &
  Intimacy, Inner Voice & Self-Talk, Emotional Triggers, Guilty Pleasures & Small
  Joys. The 16 added next (identity/social/sensory/background/adult angles):
  First Impression, Social Style, Sense of Humour, Fears & Phobias, Sleep &
  Dreams, Scent & Sound, Health & Scars, Education & Mentors, Work & Vocation,
  Money & Class, Faith & Superstitions, Regrets & Guilt, Dreams & Aspirations,
  Politics & Power, Hobbies & Crafts, Desires & Kinks. The 10 body/appearance
  additions: Alternative Outfits, Underwear & Lingerie, Unclothed Appearance,
  Intimate Anatomy, Turn-ons & Arousal, Sexual Experience & Preferences, Erotic
  Fantasies, Tattoos & Body Art, Piercings & Body Mods, Grooming & Body Care
  (the explicit ones ask the model to match the chosen content rating, so they
  stay tasteful under SFW/Suggestive and go fully explicit at Mature/Explicit).
  Each lives in three tables
  in `src/persona.js` — `EXTRA_SECTIONS` (checkbox id/label/hint), `CANON` (so the
  parser/build order recognises the heading) and `SECTION_HINTS` (the in-template
  hint the model sees, also used by per-section rewrite); also add a tolerant
  alias regex to the `canonicalOf` rules when the new heading could be worded
  differently. Add to all of these when
  introducing a section. Each selected extra gets its OWN generation pass (one
  section per call, with its own word target of ~⅓ the extras band) — a single
  shared pass forced every extra into one budget, which came back thin,
  repetitive, or padded with dialogue. Plus `🎲 Surprise me` (six shuffled
  random extras — capped because each now costs its own pass) and named
  `💾 Presets` (a full modal — see below).
- **Generation** — `✨ Generate persona` streams into an editable name field +
  description textarea with a live progress bar ("part n/total · label"), using the
  multi-pass engine. The name field carries a **🎲 reroll** button (`window.NameRoller`,
  `src/name-roller.js` + pattern data in `src/name-data.js`): real random names sampled
  by byte-range from the 9 hosted lists behind
  `perchance.org/the-ultimate-random-name-generator` (same 84 weighted Common/Uncommon/Rare
  combinations; file sizes measured once via `superFetch` Range probes and cached in kv,
  unhealthy files auto-fail over to siblings). Same button on the Pro persona modal's name
  field, the import modal's name field, and every Image Generator image's persona editor
  (`.character-name-output`, via `injectGenControls` in `src/persona.js`). Because passes share one byte-identical prompt prefix the
  later passes are fast, and the pass plan/labels adapt to the chosen example
  count + extra sections.
- **🧩 Section tools** — the finished character is re-parsed into its sections
  (`t2i_parsePersona`) and listed with a `📋 copy` + `↻ rewrite` button each; copy writes
  that section's `# {{char}} Heading:` block to the clipboard, a rewrite calls
  `t2i_generatePersonaSection(opts, heading, currentText)` (same shared prefix,
  scoped to one heading) and swaps just that section back in. The same card has
  an **➕ Add sections…** button (`#pgen-addsec-open`) that opens a **multiselect
  picker** modal: a search box, removable chips of the current selection,
  checkbox grids for every built-in section the character doesn't have yet
  (🧩 Extra sections + 📝 Character basics) each with an all/clear toggle, and a
  custom-heading input that registers a new heading as a ticked chip. A 🎲 Random
  button ticks 3 random unticked sections per click (toast names the picks).
  A 🎲 dice beside the custom-heading input rolls one of ~55 novel section-name
  ideas (nothing from the built-ins) into the box for editing + ➕ Add.
  `#pgen-addsec-go`
  (label shows the ticked count, e.g. `➕ Add & generate (3)`) generates every
  ticked section **in turn** (`addSectionsBulk`) — each call streams a single
  section via `t2i_generatePersonaSection` using the growing description as
  context, shows progress in the shared progress bar, and drops it in
  raw-preserving just before `Roleplay Behavior Examples` — while a single
  `#pgen-addsec-custom` heading can still be added on the spot. Pressing &
  holding any section card for 1s highlights it there (`locateHeading`, kept
  across re-renders) and auto-scrolls `#pgen-desc` to that section's block
  (selects it + flashes an accent ring); taps, button presses and drags cancel. A `secBusy`/
  `bulkActive` guard stops the main ✨ Generate (or a combine) overlapping a
  section write. **✍️ Prompt starters** steer the added section(s): a shared one
  (`#pgen-sec-starter`, mirrored in the picker as `#pgen-pick-starter`, persisted
  to `localStorage.t2iPersonaSectionStarter`) applies to every section in the
  batch, and per-section ones (`secStarters`, one text input per ticked section in
  the picker's `#pgen-pick-secstarters` block, persisted to
  `localStorage.t2iPersonaSectionStarters` keyed by heading) layer on top of the
  shared one for that heading only. `combineStarter(global, per)` joins the two
  (shared first), and the result is passed as `opts.sectionStarter` to
  `t2i_generatePersonaSection`, which appends a short "EXTRA DIRECTION FROM THE
  USER" block to that section's per-section task (after the shared cache prefix).
  Starters apply only to the Add-sections paths (`addSection` / `addSectionsBulk`
  pass them through `regenSection`'s `starter` arg), not the individual `↻ rewrite`
  buttons. Adding one calls the same
  `t2i_generatePersonaSection` with the current description as context (so it
  matches the character's voice/options), inserts it (raw-preserving) just before
  `Roleplay Behavior Examples`, and it gains its own `📋 copy` + `↻ rewrite` buttons.
  Every existing section row also has a **➕ add to** button (`toggleSecAdd` in
  `src/persona-tab.js`) that opens an inline composer under that row: a textarea
  for the new info in the user's own words, an ✍️ prompt starter input (synced
  with that heading's per-section starter in `secStarters`), an
  **✨ Rewrite addition** button that polishes ONLY the addition via
  `t2i_polishSectionAddition` in `src/persona.js` (character + current section
  go in as style context; the model returns just the polished addition, keeping
  every user fact and adding none), an editable preview of the rewritten text,
  and **✅ Add to section** which appends the reviewed text raw-preserving via
  `replaceSectionBody`. Roleplay Behavior Examples use the same composer but the
  addition is numbered on append so the sequence continues from the existing
  count.
- **🔍 Duplicates** — a `🔍 Duplicates` button on the 📝 The character card (`#pgen-dupcheck`, in `src/persona-tab.js`) scans the whole description for repeated information at the whole-section level (word TF cosine + Jaccard + near-identical sentences + shared 3-word phrases, grouped so connected pairs become one group) and shows each overlap group as a card in a pop-up (`#pgen-dup-track`) that scrolls sideways (◀ ▶ arrows, dots, swipe, arrow keys). Cards carry the % score, highlighted excerpts, shared-sentence/phrase evidence, per-section 👁 Show (closes + flashes the rows in Section tools), ↻ rewrite and 🗑 buttons, and group 📋 copy — plus a Loose/Balanced/Strict sensitivity select with ↻ Re-scan. A second ↺ Within a section tab in the same pop-up (one sideways card per self-repeating section, with its repeated sentences/phrases, ×n counts and the same Show/rewrite/delete/copy shortcuts) catches repeats inside a single section. An **✨ Reorganize** information-rewriter sits on each eligible card and as **✨ Reorganize all** in the pop-up footer: it asks the AI to dedupe the finding across its sections so every unique detail is kept exactly once (roleplay examples and lorebook sections are always skipped), shows an editable draft review in the card with ✅ Apply / Discard, and writes back raw-preserving on Apply. A **🧬 Merge** button on each eligible between-sections card combines the whole group into ONE new section: it asks for the new section name first, asks the AI to keep every unique detail exactly once (repeats stated one time), shows the same editable draft review (name + body), and on Apply replaces the merged sections with the single new one at the earliest merged position, raw-preserving.
  Single-section calls put the character context *before* the rewrite task (task
  last — a trailing character dump made the model continue/summarise it instead),
  target a per-section word budget (`singleSectionTarget`: a third of the part
  band, with hard caps for `Name`/`Tagline`/`Opening Line`/`A Secret`, which used
  to inherit 500-700-word budgets and ramble), and carry explicit
  third-person-prose + add-new-information guardrails against dialogue filler
  and cross-section repetition.
  Both rewrite and add go through `window.t2i_replacePersonaSection(full, heading,
  content)` / `window.t2i_addPersonaSection(full, heading, content)` in
  `src/persona.js` rather than rebuilding the description from parsed sections —
  they split the text into ordered blocks on heading lines and splice only the
  target block, so imported cards' extra non-canonical blocks (a title,
  `# Roleplay Guidelines`, `## Reminder Message`, `## User Character Avatar URL`,
  …) survive a rewrite byte-for-byte. `regenSection` then re-parses into
  `st.persona.sections` and calls `updateSaveButton()`. Every section row also
  has a 📋 copy button (`copySection`, copies that `# {{char}} Heading:` block) and
  a 🗑 delete button (`deleteSection`, confirm-guarded, blocked while a
  generation is running) that wipes just that block via the raw-preserving
  `window.t2i_removePersonaSection(full, heading)` in `src/persona.js` — same
  block-splitting, so neighbours survive byte-for-byte. Every row also has ↑↓
  reorder buttons (`moveSection`, blocked while a generation is running) that swap
  the section's block with its neighbour via the raw-preserving
  `window.t2i_movePersonaSection(full, heading, dir)` — non-canonical import blocks
  stay put, ends get disabled buttons, and the list, chat pack and meter all follow
  the new order through `window.t2i_orderedPersonaSections(full)` (same content set
  as `t2i_parsePersona().sections`, but in raw-text order — the order the chats
  actually truncate from, so top sections survive). The Roleplay Behavior
  Examples row additionally carries a `➕ Add [n] more (has m)` control
  (`.pgen-sec-more`: number input clamped to 1–10 + `➕ Add n` pill) that appends
  brand-new examples to the ones already built instead of regenerating the whole
  set: `addMoreExamples` numbers the newcomers from the existing count
  (`t2i_countPersonaExamples`, shared with the engine so both sides agree) and
  splices them in via `t2i_replacePersonaSection` (or `t2i_addPersonaSection`
  when the section is missing entirely). The engine side
  (`t2i_appendPersonaExamples` in `src/persona.js`) generates exactly that many
  more, numbered from `have+1`, with an explicit do-not-repeat-earlier-examples
  task. A linked
  `# {{char}} Lorebook:` section additionally lists its `##` entries, each with
  its own 📋 copy + 🗑 delete (`copyLoreEntryFromDescription` / `deleteLoreEntryFromDescription`,
  also mirrored into the lorebook manager when the titles match; deleting the
  last entry drops the whole section). Deleting a manager entry likewise patches
  the linked description (`lorePatchDescriptionAfterManagerDelete`). The parser
  knows `Lorebook` as a canonical heading (`CANON` + `canonicalOf` world-info
  aliases), and both `extractSections` and `personaBlocks` treat inner `##`
  entry headings as Lorebook content rather than section boundaries — otherwise
  the section would parse as empty and deletes would leave orphaned entries. Arbitrary/custom headings
  are registered via
  `window.t2i_registerPersonaHeading(heading, hint?)` in `src/persona.js`, which
  splices them into `CANON` + `SECTION_HINTS` and persists them
  (`localStorage.t2i_persona_custom_headings`) so the tolerant parser keeps
  recognising them after a reload. `regenSection`'s toast verb is parameterised
  ("added" vs "rewrote").
- **🌱 Depth seeds** — an optional block at the bottom of 🎛️ Character options
  (fatal flaw, contradiction, want vs. need, hidden secret + keeper, pressure /
  what's at stake, 🎲 wild spark) for the small frictions that make a character
  feel like a person. Every seed is a live `st.opts` field (typed inputs update
  on keystroke, 🎲 Roll drops a random contradiction from
  `t2i_personaWildcards` in `src/persona.js`, 🎲 Surprise me rolls one too),
  and the engine's `optionsBlock` renders each set seed into the shared brief —
  so full generations AND every section tool honour the current seeds without
  regenerating anything else. Presets, share links and setup files carry seeds
  like any other option (`sanitizePresetOpts` string-guards them,
  `presetSummary` counts them).
- **⋯ More section tools** — each section row's ⋯ button opens a second strip
  with five deeper tools (all build a fresh `stOpts()` snapshot, so they read
  the live options + depth seeds): **🔍 Deepen** keeps every fact and adds
  sensory texture + one complicating detail; **✂️ Distill** compresses to the
  sharpest 2–3 sentences; **🎭 Voice test** renders a first-person
  in-character monologue as a copyable preview that is never written back;
  **🌱 Foreshadow** plants one subtle unexplained hook consistent with the
  secret/backstory; **🪢 Callback** rewrites the row's section weaving in one
  concrete detail picked from another section (inline source picker). Deepen /
  distill / foreshadow share one examples-aware runner (`runSingleSection` in
  `src/persona.js`: same prefix + context + `# END` shape as the rewrite path,
  `extractExamples` parsing for Roleplay Behavior Examples) and write back
  through the surgical `applySecContent` helper; voice test returns raw prose
  like the polish path. All four writers take the shared
  `opts.sectionStarter` too.
- **Handoff** — `💬 Chat with them` (builds the same `addCharacter` JSON and calls
  `t2i_generateShareLinkForCharacter`; avatar = the portrait or the primary ref),
  `🎨 Portrait` (avatar chooser: ✨ generate at 768x768 via `root.generateImage`
  (auto-saved to the gallery), 🖼️ pick from the gallery, or ⬆️ upload a file —
  any choice becomes the avatar), `📚 Vault`, `🧑 Roster`, `📋 Copy`, `📄 Export .md`,
  `📤 Tavern .json` (maps the `# {{char}} Heading:` sections onto a flat
  TavernAI V2 card — Tagline+Visual→description, Personality/Voice/Habits/Likes/
  Goals/Secret→personality, Scenario/Relationship/Backstory→scenario, Opening
  Line→first_mes, Behavior Examples→mes_example, leftovers+Lorebook→creator_notes,
  tone→tags, portrait downscaled to 512px JPEG `avatar` — exactly what
  as-social's upload form parses, avatar included),
  `📋 Prompt history` (lazily loads `src/gen-extras.js` via `ensureExtras()` when
  needed), and `🔗 Share setup` (`Recipe.copy("persona", {opts, refs})`).
- **📖 Lorebook maker** — its own card under Section tools: title + description,
  an entry list (title, comma-separated keys, content; editable in place, ✖ per
  entry), `✨ Generate from character` (AI writes 6–10 keyed entries from the
  current persona via `root.generateText`), `➕ Add entry`, `📥 Import`
  (lorebook `.txt` with `## Entry`/`Keys:` blocks, or a Tavern `.json`
  `character_book`), `🔗 Link into persona` (writes a `# {{char}} Lorebook:`
  section into the character, replacing any existing one), `⬇ .txt`, `⧉ Copy`,
  `⬇ .json`, `🗑 Delete all` (click twice within 5s to confirm — clears every
  entry). `🔄 Sync with lorebook` opens a status modal matching every lore topic
  against the character's own top-level sections: topics already living there
  in full need nothing (✅), the rest are added as their own persona sections
  — ✚ brand-new sections for new topics (auto-flagged Lore for chat-fit),
  📝 appending only the missing sentences when the section exists but lacks
  some. Duplicate `Section · 1…N` chunks merge into their base heading with
  duplicate sentences removed, so every header becomes one section with all
  its lore intact. Embedded `##` blocks that duplicate a same-titled section
  show as ♻️ redundant with a one-click removal (the section keeps the lore;
  an emptied Lorebook section goes away entirely). The modal has its own
  scroll area plus a URL box prefilled with the attached URL — pasting any
  other published lorebook URL + ↻ reads that instead (📌 attaches it);
  chat-fit 📤 publish files use title-prefixed facts, and the section
  converter numbers multi-fact sections (`Section · 1: Section: fact.`), so
  the parser strips the `· N` counter and the repeated title prefix and
  regroups consecutive facts back into one section per lore topic. Manager
  entries whose text is fully covered by a kept URL group (and vice versa)
  are deduped, not doubled. Only targeted sections are ever rewritten —
  every other byte of the description (section order, custom sections,
  chat-fit Core/Lore flags) is left untouched, and `##` entry titles that
  match known section names no longer splinter the Lorebook into phantom
  sections in the parser either.
  The book persists per browser (`localStorage.t2iPersonaTabLoreV1`)
  and per saved persona (`rec.lorebook`); `📤 Tavern .json` embeds it as
  `character_book`, `💬 Chat with them` appends it to the role instruction, and
  imports (converted characters, card files with a `character_book`) populate it.
- **💬 Chat fit** — its own card between Lorebook and Saved personas
  (collapsed and **off by default** — the header ○ off / ● on toggle switches
  it on), answering
  "what will the chat AI actually see?". The embedded chats keep each
  character's first ~3000/2000/1000/500 chars (start survives) once all
  descriptions combined pass ~30% of model context, and they retrieve
  lorebook-URL facts as needed plus inject `reminderMessage` before every reply
  (verified against both chats' sources — same ladder in each). The card has a
  live meter (sent-every-reply words/chars/~tokens vs a ~1.8k-token Solo share,
   Solo = just this character, Duo = 2 in one chat, Group = 3+ in one chat, since the budget is combined; token math assumes ~6k model
  context and is labeled approximate), a 👁 cut preview replicating the slicing
  ladder on the exact packed text, a group-chat cut-line simulator inside the
  preview (Solo/Duo/Group rows with each party size's ~token share and cut line,
  current party highlighted — same `chatFitMeter` math with a party override), and
  a Core-vs-lore per-section checklist (in raw-text order, like the section list).
  Sections flagged Lore are excluded from the handoff body (the description text
  itself is never touched — vault/saves/Tavern keep everything), with a warning
  until they're converted to facts. `📖 Lore sections → lorebook facts` chunks
  them into 1–2 sentence entries; `✨ Distill for chat` (AI) writes the essence
  (~600–800 words, the always-sent core) + sub-100-word reminder + standalone
  facts (names, never bare pronouns) into the lorebook manager. `📤 Publish
  lorebook` uploads the manager as a chat-format `.txt` (title-prefixed facts,
  blank-line separated) via `uploadPlugin.editable` (stable URL, editKey kept
  for re-publishes; `editable_requires_saved_generator` gets a save-first hint).
  If the stable publish is rejected by bot protection (`anti_bot_*` — the hidden
  upload frame can't show an interactive Cloudflare challenge), it falls back to
  a plain immutable upload (one-time URL, no editKey; next 📤 publish retries
  the stable link) so publishing never hard-fails; if that fails too the toast
  names the likely causes (content blockers on upload.perchance.org /
  challenges.cloudflare.com, in-app previews) instead of the raw error code.
  and attaches it to handoffs as `loreBookUrls`; ✖ unlink detaches without
  deleting. `💬 Chat with them` sends the packed body when the tool is on
  (essence, else core
  sections), a shortened guidelines block, the pasted lorebook only while no URL
  is published, plus `reminderMessage` (stored or auto-built from tagline +
  personality + voice, capped at 100 words) and `loreBookUrls`; while the tool
  is off the handoff instead sends the full description + pasted lorebook with
  no reminder. Everything
  persists per browser (`localStorage.t2iPersonaTabChatFitV1`) and per saved
  persona (`rec.chat`, included in the dirty check — the on/off toggle rides
  along too). Published files are public
  links; preexisting chat threads need `/lore` + reload to pick up re-publishes.
  Pure builders are exposed as `window.__pgenChatFit` (pack/meter/splitFacts/
  autoReminder/buildFacts, plus meterFor/ordered/move for phase-4 tests and
  diagnostics).
- **🔴 Over-budget guide** (same file): whenever the chat would CUT the persona
  (meter over its share, chat-fit on or off), a glowing arrow bubble walks the
  fix in order — 1/4 💬 Chat fit toggle → 2/4 the biggest Core section's Lore
  button → 3/4 📖 Lore sections → lorebook facts → 4/4 📤 Publish lorebook.
  The step is derived from world state on every meter refresh (plus a debounced
  description-typing hook), so each completed action advances it; ✖ dismisses
  the current step, a new step or a fitting meter clears it. Styles live with
  the other persona CSS in `index.html` (`#pgen-guide-arrow`,
  `.pgen-guide-target`, pulse/nudge keyframes, `prefers-reduced-motion` off).
- **🗃️ Saved personas + 🧬 Combine** — finished characters can be kept in a
  per-browser library (kv-plugin folder `personaVault`, key `list`, newest first,
  capped at 400). The card top has an **Editing** bar: `#pgen-saved-switch`, a
  dropdown listing `🆕 Unsaved character` plus every saved persona (the active one
  marked ` ●`) that switches the editor to that character. The editor tracks the
  saved persona it is linked to via `st.activeId` (persisted in
  `localStorage.t2iPersonaTabLastV1`). `💾 Save current persona` (`#pgen-save`)
  updates the active record **in place** when one is linked (its label becomes
  `💾 Save changes to “NAME”`, with a ` •` + glow while there are unsaved edits via
  `isActiveDirty()`), or otherwise stores a new record (duplicate names prompt
  overwrite-or-copy). `#pgen-save-as` (`➕ Save as new`) always creates a fresh
  record. Switching away from a persona with unsaved edits prompts to save them
  first (`switchToPersona`). Records store `{id, name, description, thumb, refs, opts, tone, toneMix,
  rating, language, depth, extras, ts}` (`refs` = slimmed reference images — http URLs +
  prompts, local data-URLs dropped — plus the chat-fit snapshot `chat`, which carries
  the published lorebook URL) (thumb = the portrait/primary ref,
  downscaled to a small data-URL). Loading a saved persona into the editor — or
  switching to it — also makes every 🧩 section tool operate on it, and any rewrite/
  add can be re-saved straight back into the same record. Each row has a checkbox,
  `📂`/`📖` load (or reload-from-saved), `✏️ rename`, `⬇️ export` (`📄 .md` or `📇 .json`
  character card — both bundling the portrait, reference images and lorebook link —
  via the shared builders, so the files round-trip through 📥 Import), `🗑️ delete`, and the active row
  gains a `💾` action to save the current edits back into it. `⬇️` exports the row as
  `📄 .md`, `🧩 .persona.json` setup (the whole generator state — options, refs, lorebook,
  chat-fit, portrait — re-uploadable through 📥 Import with full fidelity) or `📇 .tavern.json`. Ticking **two or more**
  reveals the combine panel: optional new name, roleplay-example count (defaults to
  the richest source set), rating (defaults to the strictest source rating) and free
  text "what the fusion should emphasize". `🧬 Combine N personas` calls
  `window.t2i_combinePersonas(sources, opts)` (see `src/persona.js`) — a streaming
  multi-pass generation that fuses every source into ONE cohesive character,
  carrying across traits that exist in only one source, resolving contradictions
  into believable complexity, and reconciling all the sources' examples into a
  single non-repeating set. The fusion is an explicit **section union**: the engine
  reads every source's real heading blocks (canonical sections, user-registered
  custom sections, and freeform/imported headings the tolerant parser doesn't know,
  e.g. `# Roleplay Guidelines`, `## Reminder Message`), takes their ordered union,
  and writes a `SECTION CONTRACT` into the shared prompt requiring the result to
  contain each heading EXACTLY ONCE in that order. Parsing keeps only headings on
  that plan and the FIRST occurrence of each, so a heading can never be duplicated;
  any section the model omits is back-filled verbatim from the sources
  (`combineCarryOver`), so nothing is lost. The passes are identity → history/inner
  life → extra sections → roleplay examples. The result streams into the normal name
  + description editor (and the progress bar shows "part n/total · label"), ready
  for 💾 save.
  `window.__personaListSaved()` / `window.__personaImportSaved(arr)` expose the
  library to `src/vault.js`'s SiteBackup.
- **🧬 Build from saved (fused into 🎛️ Character options)** — a "Starting point"
  switch at the top of 🎛️ Character options: ✨ Fresh character, or
  🧬 From saved persona. Picking From saved reveals the reference controls
  inside the same card: a reference-persona dropdown (populated from
  🗃️ Saved personas, with a live "name · N words · direction" preview),
  a build direction (🌱 Off of them — ally / inspired by, or ⚔️ Against
  them — rival / opposite), an optional connection dropdown (sibling,
  apprentice, rival, hunter, mirror…), and a starter-idea box. The single
  Generate button then runs the reference build (`🧬 Build from “NAME”`)
  instead of a fresh one: it reuses the whole 🎛️ Character options panel
  verbatim (`syncOptsFromUI()` + `stOpts()`, shared with ✨ Generate) and
  appends a reference block (full reference text capped at 8000 chars,
  direction, connection, starter) to the extra instructions, then streams the
  new character into the normal 📝 editor with the shared progress bar +
  ⏹ stop (one `genObj`, so section/combine/bulk guards cover both paths;
  fresh lorebook + chat-fit reset like a normal generation; prompt-history
  autosave included). State (on/who/mode/link/starter) persists per browser
  in `localStorage.t2iPersonaRefCardV1`. ↺ Reset returns the switch to
  ✨ Fresh (the saved pick itself is kept).
- **📥 Import / paste persona** — `📥 Import / paste persona` opens a modal that
  accepts a **`.txt` / `.md`** file, a **character-card `.json`** (SillyTavern
  v1 or v2 shape, flattened by `cardToDescription()`), or text typed/pasted
  directly (file choice, drag-&-drop, or the textarea). A live readout shows
  "N words · M sections detected · name: X" as you type, and the name field
  auto-fills from a parsed `# {{char}} Name:` heading or the filename. The
  character can be **💾 Save & use** (add to the library *and* load into the
  editor), **➕ Add to library** (save only), or **📂 Just load** (use without
  saving); imported chars then work with every handoff/combine feature. Text in
  the canonical `# {{char}} Heading:` layout is split into sections by
  `t2i_parsePersona`; anything else is kept verbatim. Aborts on `✖`, outside
  click, or Escape.
- **💾 Presets (+ ⬇️ export / 📥 import)** — `💾 Presets` opens a modal (not a
  `window.prompt`) that snapshots the whole 🎛️ Character-options panel under a
  name. Each saved preset row shows a one-line summary (tone · depth · examples ·
  rating · language · extras) with `📂 load`, `✏️ rename` (inline), `⬇️ export`
  (that one preset as `.json`) and `🗑️ delete`. `⬇️ Export all` downloads every
  preset as one `.json` file; `📥 Import presets…` accepts a `.json` file
  (choose or drag-&-drop) or pasted JSON, with a live \"N presets found\" readout
  and an *overwrite existing* checkbox (unchecked = clashes are kept and the
  import is auto-renamed `Name (2)`). `normalizePresetImport()` accepts the
  exported wrapper `{app,kind,version,presets:{...}}`, a bare `{Name:{opts}}`
  map, a single `{name,opts}`, an array of either, or a bare `{opts}` object.
  Still stored in `localStorage` `t2iPersonaTabPresetsV1` (back-compatible with
  the old prompt-based format), so SiteBackup picks them up already.
- **Persistence** — options/refs/last character/presets in
  `localStorage` (`t2iPersonaTabV1` / `t2iPersonaTabRefsV1` / `t2iPersonaTabLastV1`
  / `t2iPersonaTabPresetsV1`); data-URL refs are NOT persisted (only their prompt
  survives a reload). Autosave via `t2i_autosavePersonaPrompt({source:"persona"})`.
- **Public API** — `window.__personaOnShow`, `window.__personaAddPrompt(text)`
  (used by the vault's PromptBridge destination), `window.__personaApplyRecipe(data)`
  (used by `Recipe.apply` for `"persona"` recipes). `src/vault.js` knows about the
  tab in `ensureTab`, `Recipe.apply`/`offerRecipe`, `paletteActions`, and the
  PromptBridge `destinations` list.

## 🌍 Tab 12: Living World (dunia hidup)
`#world-app` (WORLD_APP) lazy-boots `src/worldsim.js` via `ensureWorld()` → `window.__worldOnShow()`
(state di `window.WorldSim`, persist kv `t2iWorld`/`active` — 1 dunia aktif). Sesuai spec user:
setup (nama/genre/bahasa DIKUNCI/ premis/aturan/lokasi + preset genre + AI bantu premis),
cast 4–6 (lokasi, affinity, memory per karakter + memory dunia, portrait 🎨, import Roster),
stage (feed + tag lokasi; yang satu lokasi boleh nimbrung; pindah lokasi = broadcast sistem;
klik karakter = fokus; ambient otomatis tiap ~75 dtk; gambar per pesan 🎨),
mode 🧍 player (ikut sebagai karakter) vs 👑 dewa (ruang diskusi + kehendak bebas;
perintah destruktif ditolak halus dulu + butuh konfirmasi kedua, tapi tetap TAAT),
timeline linear (checkpoint otomatis tiap 10 event, max 12; kembali ke masa lalu =
potong + arsip; lompat +1/+7 hari = simulasi AI, boleh divergen). Terdaftar di TABS,
TAB_NAMES, ITEMS, Home grid, mobile GROUPS/POPUPS/POPPARENT, ALIAS, TOOLS, NAMES,
palette, ai-helper, theme TABS/colors, dev-audit.

## 💬 Tabs 10 & 11: AI Chat · AI Chat Lite
**AI Chat** (`#chat-app` → `#classic-host`) is now NATIVE: `src/aichat-classic.js`
renders a classic-look chat (shadow DOM) directly in this browser — no iframe.
Its brain is `src/chat-engine.js` (the shared local brain: numeric affinity,
keyword memory DB + auto-extract, rolling summary), so threads/characters are
kept in the shared kv store `t2iRoleplay` (threads, affinity + memories). **AI Chat Lite**
(`#chatlite-app` → `#chatlite-frame`) is still the embedded original
`ai-character-chat` iframe. The `CHAT_TABS` descriptor array in index.html
carries a `native` flag: native entries skip `loadChatFrame` (guarded) and use
`sizeClassicHost` / `__classicSuspend` / `__classicAddCharacter` instead; Lite
keeps the old iframe recipe (`null.perchance.org` subdomain trick, same
`{addCharacter,quickAdd}` share fragment, which the native tab also accepts via
`__classicAddCharacter`). Source of the classic skin: `src/aichat-classic-src.js`
(plus the old app's static CSS in `scratch/bbchat-theme.css`, inlined at build
time) → built to `src/aichat-classic.js`; never edit the build directly.
`showTab(name)` reveals the pane and **lazily** boots the skin on first open
(so nothing heavy runs on a normal page load); switching away stops generation
(`__classicSuspend`) but keeps state. `sizeChatFrame(c)` / fullscreen / hover
bar / 🎯 / 🔄 / 🔇 all work for the native pane the same way (the bar's
**↗** button now reads "Old chat" and opens the original generator). For Lite,
**🔄 Reload** resets `src` through `about:blank` then the real URL (the frame is
cross-origin so `location.reload()` is not allowed), **↗ Open in new tab** (the canonical
`perchance.org/<gen>` page) and **🔇 Pause when away** (stops the chat when you leave the
tab — see below). `sizeChatFrame(c)`
measures the real space left below the chat bar (the pane's rect, the bar's height —
which wraps on narrow screens — and the pane's padding) on every show and on `resize`,
so the frame ends flush with the viewport bottom at any size (it stands down while
fullscreen, where flex does the sizing; the hint text truncates so the buttons always
fit one row). Those bars are the one exception: they're out of flow, so for a
`.chat-bar-hover` pane `sizeChatFrame` subtracts nothing — and the pane reserves no height
for the tab either (see below), so the frame is measured from the very top of the pane and
the embedded page stretches up under the collapsed tab. `"chat"` / `"chatlite"` are valid `showTab` names
(so the ⌘K palette / Theme per-tab list can reach them), and Home has matching "AI Chat" / "AI Chat Lite" tool cards.

**The chat bars are hover pull-down menus.** Instead of a permanent row of controls, each
chat bar collapses to a slim rounded tab hanging from the **top-right corner** of the pane
(`.chat-bar-handle`, kept there by `align-self: flex-end; margin-right: 0.5rem` — so the
tab clears the very top-right of the embedded page and the panel's controls, which sit at
the right end of the bar, drop down right under it) reading `💬 <chat name> ▾` (plus the
**badges** described below); the
full toolbar drops down — as an outlined, slightly translucent, backdrop-blurred panel that
is inset to line up with the frame — over the top of the chat when the pointer is over the
tab (`.chat-bar-handle:hover + .chat-bar-menu`) or over the dropped panel itself
(`.chat-bar-menu:hover`), and it retracts as soon as the pointer leaves both. The panel is
absolutely positioned inside `.chat-bar-hover`, so opening it never reflows the pane and
the iframe keeps exactly the same height. The pane reserves **no** room for the collapsed
tab (`.chat-tab.chat-hoverbar:not(.chat-fs) { padding-top: 0 }`), so the embedded page runs
right up under the tab and fills the strip the old always-visible toolbar used to occupy —
which means the slim tab does overlap the top-right corner of the embedded page (that is the
trade for the reclaimed height). Because the bar still spans the full pane width (so the
dropped panel can be inset edge to edge), the bar box itself is `pointer-events: none` and
only the tab (`.chat-bar-handle`) and the panel (`.chat-bar-menu`) take pointer events —
otherwise that invisible full-width strip would swallow clicks meant for the page
underneath. The tab is painted *above* the panel (`z-index:1`) with
its shadow dropped while the panel is down, so the tab's outline and the panel's top edge
read as one connected shape.
Because a CSS-only disclosure can't be reached by touch or keyboard, the tab is a real
`<button>`: clicking it toggles a pinned `.chat-bar-open` class (which is also what
`:focus-within` on the panel does for Tab), a click on any control in the panel puts it
away again (the control is blurred with it, or `:focus-within` would hold it open on
touch), a `pointerdown` anywhere else closes it, and Esc closes it. Only one chat's bar can
be open at a time. When closed, the two states that would otherwise be invisible ride along
as **badges** on the tab (`updateChatBarBadges()`): **🎯** = new personas from the persona
flows land in this chat, **🔊** = pause-when-away is off, so this chat (and its music)
keeps running when you switch away.

**Touch / mobile.** A touch screen has no hover, so all the hover rules live inside
`@media (hover: hover)`; on touch the pinned class is the single source of truth (mobile
browsers synthesize a sticky `:hover` after a tap, which would otherwise make the menu
impossible to close). Opening the panel also reveals a transparent **scrim**
(`.chat-bar-scrim`, `z-index:30`, created in `wireChatTabs`, toggled by `setChatBarOpen`)
over the pane: a tap inside the cross-origin chat frame never reaches this document, so
without it a tap-opened menu would have nothing to close it but the tab. On anything coarse
or narrow (`@media (pointer: coarse), (max-width: 700px)`) the tab itself grows to a
comfortable finger target (~37px tall; the pane still reserves nothing for it), the hint is
hidden, and
the controls lay out as an even grid — two per row above 370px, a full-width stack below it
(one action per row, single-line labels) — so the panel stays compact on a phone.

**Fullscreen** (`setChatFs(c, on)` / `window.__nexoraChatFullscreen(on, name)`, buttons
`#chat-fs` / `#chatlite-fs`): puts the pane into a `position:fixed; inset:0` overlay
(`.chat-fs`) that fills the whole app viewport — the slim chat tab stays pinned at the
top-right over the frame (now holding **✕ Exit fullscreen**), the frame flexes to fill the
entire viewport underneath it (fullscreen reserves no strip for the tab either);
`html.chat-fs-lock` stops the page behind it from scrolling — and that class is computed from
**every** fullscreen-capable pane at once (`anyPaneFsActive()`, which covers the two chats,
🔗 Media to Links), because each pane's own
updater used to re-derive it from its own subset of the others and could therefore unlock the
page while a different pane was still fullscreen. It also fires a best-effort
native `requestFullscreen()` (so a real user click can go truly fullscreen when the
surrounding iframes permit it; the programmatic preview clicks can't). Exits via the
button, via Esc (only when focus is on this page — keystrokes inside the cross-origin
chat frame never reach us, which is why the explicit exit button matters), or
automatically when `showTab` switches away; a `fullscreenchange` listener also clears
the state if the browser leaves native fullscreen.

**App fullscreen** (`src/appfs.js`, `⛶ Fullscreen` hub button right after ☰ Menu): the same
pattern at page scope — toggles native fullscreen on `document.documentElement`, syncs the
button (⛶ Fullscreen / ✕ Exit) plus an `html.app-fs` hook via `fullscreenchange` (so Esc, which
the browser handles natively, still updates the UI), and exposes `window.__appFs`. When the
surrounding frame blocks the request, a small toast says so instead of failing silently.
While fullscreen (`html.app-fs`) the header condenses to just the hub button row: the brand and
both tab strips (`#i2p-tabs`, `#i2p-simplebar`) hide and the hubbar centers itself, so tab
switching goes through the ☰ Menu overlay.

**Auto-pause on tab-away** (`chatPauseWhenAway()` / `suspendChatTab(c)` /
`loadChatFrame`'s `suspended` branch): a cross-origin iframe's audio cannot be paused
from the parent — no web API exposes another origin's `<audio>` — so the only way to stop
one of these chats, and any background music it's playing, is to unload its document.
When the user switches to a different app tab, every *other* chat tab that has a loaded
frame is therefore **suspended**: its `src` is set to `about:blank` (which tears the chat
document down and cuts its audio) and a `suspended` flag is set. Re-entering that tab
reloads it from its URL — the same mechanism as the 🔄 button — so nothing is lost: the
characters, threads and settings all live in the chat's own IndexedDB and it re-opens on
its last thread. The behaviour is per-browser and **on by default**; the **🔇 Pause when
away** button in each chat bar toggles it (`localStorage.t2iChatPauseWhenAway`). When it's
off the button reads **🔊 Keeps playing** and leaving the tab changes nothing.

**Character handoff (which is what makes these tabs the persona destination):** every
persona / character flow in the app calls `window.t2i_generateShareLinkForCharacter`
(the framework's hook, which natively builds `ai-character-chat` links). `src/gallery.js`
overrides it so that instead of opening the chat site in a new browser tab, it first shows
a **destination chooser** — a small overlay (`#t2iChatPicker`, built like
`showCharacterLinkModal`) titled "Chat with &lt;name&gt;" with one button per chat tab (its
label + domain, the current 🎯 default prefixed with 🎯), a "🎯 Remember as my default"
checkbox, and Cancel. Picking a tab calls
`window.__nexoraChatAddCharacter(hashData, name)`, which sets that tab's `pending` URL to
`<url>#<hashData>` and calls `showTab(<target>)`, and `loadChatFrame()` then points the
frame there. Both generators read that `#<url-encoded {addCharacter,quickAdd} json>`
fragment on load (or on `hashchange`, so re-adding another persona while the frame is
already loaded needs no reload in the non-redirect case) and add the character to their
own storage. `src/gallery.js` learns the tab list + default from three index.html globals —
`window.__nexoraChatOptions()` (returns `[{name,label,page}]`), 
`window.__nexoraChatDefaultTarget()` and `window.__nexoraChatSetTarget(name)` (what the
"remember" checkbox calls to update the persisted preference). The **🎯** button in each
chat bar still sets that per-browser default (`localStorage.t2iChatPersonaTarget`, unset ⇒
**AI Chat**). Personas built by the flows set `quickAdd:true`, so they're added and a
thread is opened automatically; the gallery's "💬 create chat character" omits `quickAdd`
so the character editor shows first. `window.__nexoraChatOpen(url, [name])` is the generic
form (any chat URL, e.g. one carrying `?galleryFile=`). The override also shows a small
dismissible toast with a "📋 copy link" button (a shareable
`perchance.org/&lt;chosen-chat&gt;#&lt;json&gt;` URL for handing the character to someone
else).

## 🔗 Tab 12: Media to Links (embedded)
A third embedded-generator tab (after the two chats): **Media to Links**
(`#links-app` → `#links-frame`) embeds `unlimited-medias-to-links` — a bulk
uploader that turns any file (image, video, audio, GIF, SVG, pasted text) into a
permanent shareable URL, with per-card copy/delete links. Handy from inside the
studio because it's how you get a *file on your device* onto a URL you can paste
into the other tabs.

- **URLs** — `https://null.perchance.org/unlimited-medias-to-links` (the same
  redirect trick as the chats, so no public id is hardcoded); the bar's
  **↗ Open in new tab** goes to `https://perchance.org/unlimited-medias-to-links`.
- **Lazy**: the frame's `src` is only set the first time the tab is opened, so
  the uploader costs nothing on a normal page load.
- **Deliberately NOT part of `CHAT_TABS`**, and never auto-suspended: an upload
  can be a multi-hundred-MB transfer, so unloading the document on a tab switch
  would abort it (that's also why there is no `🎯` / `🔇` button here — those
  belong to the persona hand-off and audio-pause features the chats need).
- **Own tiny implementation** in index.html's main script (`LINKS` descriptor +
  `sizeLinksFrame()` / `loadLinksFrame(force)` / `setLinksFs(on)` /
  `updateLinksFsUi()`), modelled on the chat helpers but standalone — it reuses
  the shared `.chat-tab` / `chat-hoverbar` / `.chat-bar` / `.chat-boot` /
  `.chat-frame` CSS, so its pane, **pull-down bar**, boot text and **⛶
  Fullscreen** layout (`.chat-fs` + `html.chat-fs-lock`) are identical to the
  chats. Its bar is the same hover/tap pull-down menu as the chats' (see "The
  chat bars are hover pull-down menus" above): `#links-bar` / `#links-handle` /
  `#links-menu`, sharing `setChatBarOpen` / `closeChatBars` (which walk
  `everyBar()` = `CHAT_TABS` ∪ `LINKS` ∪ `CHARS`) and its own tap-dismiss scrim — so
  switching tabs also puts its menu away. The only differences: three controls
  instead of five, no badges (no persona target / pause-when-away state here),
  and `sizeLinksFrame` skips the bar measurement for the same reason
  `sizeChatFrame` does. `Esc` exits fullscreen and
  leaving the tab exits it automatically; `resize` re-measures the frame so it
  ends flush with the viewport bottom (same real-space measurement as
  `sizeChatFrame`). **🔄 Reload** resets `src` through `about:blank` (a
  cross-origin frame can't be reloaded directly).
- **Wired everywhere a tab has to be**: the `#i2p-tab-links` button in the
  header's **More** group, the `TABS` list in `showTab` (so `#/links` deep
  links and the back/forward handling work), `window.__homeRefresh`'s continue
  bar via the `NAMES` map, a Home "All tools ▸ 🎨 Extras" card
  (`data-go="links"`), the Theme Studio's per-tab accent list, the ⌘K palette
  (`paletteActions()` in `src/vault.js`) and the Credits list on Home.

## 📋 Generator List tab (embedded)
(`#nexus-app` → `#nexus-frame`) embeds `nexora-list` — the BETTER Generators
list (most-viewed, recently updated, hidden gems). Same recipe as Media to
Links: lazy frame load on first open, `null.perchance.org` URL, never
auto-suspended, pull-down bar with fullscreen / reload / open-in-new-tab,
deep link `#/nexus`, command palette entry and Theme Studio per-tab accent.

## 👥 Social DB tab (embedded)
(`#social-app` → `#social-frame`) embeds `as-social` — the Social DB character
& lorebook database. Same recipe as Generator List: lazy frame load on first
open, `null.perchance.org` URL, never auto-suspended, pull-down bar with
fullscreen / reload / open-in-new-tab, deep link `#/social`, command palette
entry and Theme Studio per-tab accent.

## 🔄 Social DB converter (`#social-conv`, `src/social-convert.js`)
A Character → Persona converter panel above the Social DB frame (toggleable via
the bar's 🔄 button, collapsible, drag-and-drop for files). The frame is
cross-origin so it can't be scraped — instead the converter fetches any entry
by pasted page link (chub.ai characters/lorebooks by numeric id or fullPath,
wyvern.chat characters/lorebooks, charavault.net cards `?card=folder/file` and
`/lorebooks/{id}`, fictionlab.ai `?scenario={id}`, as-social `?char=`/`#char=`
share payloads), by Tavern card PNG upload (embedded `chara`/`ccv3` chunk
parsed in-page, `DecompressionStream` inflate, 20MB cap) or .json, or by pasted
raw JSON — all through `root.superFetch` with direct-fetch fallback, using
as-social's own endpoint shapes. Characters convert three ways: 🧑 Save as
Persona (mapped to the `# {{char}} Heading:` section format and stored via
`__personaImportSaved`), 🧑‍🤝‍🧑 Roster (`Characters.add`), 💬 Open in AI Chat
(`t2i_generateShareLinkForCharacter` with its chat picker, falling back to
`__nexoraChatAddCharacter`). ✏️ Open in Persona imports through the Persona
tab's own `storeImported` (name-dedupe) + `applyImportedPersona` and drops the
user straight into the Persona editor with sections and handoffs ready
(`__personaOpenConverted` / `__personaOpenSaved` / `__personaEditWorking` in
`src/persona-tab.js`); repeat taps reuse the cached entry. Standalone
lorebooks get the same 🧑/✏️ persona buttons (wrapped as Tagline + Lorebook
sections). Embedded `character_book`s and standalone
lorebooks render an entry list with ⬇ .txt (as-social's flatten format, ready
to paste into a chat lorebook box), ⧉ Copy and ⬇ .json. Lazily loaded via
`ensureSocialConvert()` + `window.__socialConvertOnShow`.

## 🎭 Persona Board tab (`#board-app`, `src/persona-board.js`)
A community upload area for personas crafted in this studio — no login. Each
shared persona renders as a character card (avatar, name, tagline, rating/date/
author) with **💬 Use in AI Chat** (same handoff as the Social DB converter:
chat-target picker, `__nexoraChatAddCharacter` fallback), **🧑 Edit in
generator** (loads name, description, portrait and lorebook into 🧑 Persona
Generator via `window.__personaLoadExternal` as a fresh working copy, with a
confirmation when the editor holds different text), **⬇️ Download**
(rebuilt Tavern V2 `.json` with `character_book`, avatar included) and **📝 .md**.
Publishing takes the current editor persona (`window.__personaCurrent`, new in
`src/persona-tab.js`) or any saved-library persona, uploads the avatar + full
persona JSON (name, tagline, description, lorebook, thumb, tone, rating) via
immutable `uploadPlugin` files, and posts a `PBOARD1:`-prefixed base64 metadata
comment `{v, name, tagline, file, avatar, rating}` to the `persona-board`
comments channel. The avatar is uploaded separately and shown on the card; if
that upload fails the publisher falls back to the image's own URL, and cards
with no `avatar` backfill from the persona file's `thumb` (cached per file).
Publishing an imageless persona asks for confirmation first. Re-uploads are
blocked by portrait: before anything is uploaded, the candidate portrait is
hashed (SHA-256 of the image bytes plus a 64-bit average hash, so the same
picture is caught even after a different downscale/re-encode) and compared
against every visible board entry — new entries carry the hashes as
`meta.imgSha`/`meta.imgA`, legacy entries are hashed on demand and cached per
file, with exact-URL comparison as fallback. A match refuses the share (“even
with edited text — change the portrait to share it as new”); imageless
personas skip the check, superseded/retracted entries don't block, and videos
match by exact bytes (or poster hash). The 🖼️ Set image repair flow enforces
the same rule for its replacement picture. Entries that went
up before avatars existed carry no image at all, so each imageless card has a
**🖼️ Set image** repair button: it reuses the matching saved/editor persona's
portrait, or paints a fresh one from the visual description (with confirmation),
then posts a repaired entry with `supersedes:` pointing at the old file, which
the feed hides for everyone. Retraction entries (`{retracted: true,
supersedes: <file>}`) are hidden the same way, so a repaired repost cleanly
replaces its broken predecessor. The feed is a hidden comments widget (secret-generator
pattern: 10px invisible mount, `onLoad`/`onComment`, client-side dedupe by file
URL) with search + refresh + newest-first sort; no server-plugin state is
touched, so the presence-table layout is unaffected. Publish is rate-limited
client-side (30s cooldown) plus channel `rateLimits`. `window.__boardDebug`
(`items/connected/inject/clear`) is a client-side-only test hook for future
sessions. Wired like every other tab: Stories header button, simple-layout
menu, Home card, `TABS`, Theme accents, `TOOLS`, `NAMES`, mobile sheet/popup/
`POPPARENT`, `#/board` deep link, `TAB_NAMES` tally.

## 🎬 Video/GIF avatars (`src/avatar-media.js`)
Persona avatars can be videos (mp4/webm/mov) or animated GIFs, everywhere a
persona picture shows: editor portrait + references, saved library, vault,
roster, Persona Board cards, Social DB results. Animated GIFs just work (`<img>`
animates natively). Videos render as muted/looping/autoplay `<video>` via the
shared `window.AvatarMedia` helper (`kindOf`/`thumbHtml`/`videoPoster`/
`fileToAvatar`), loaded eagerly in `index.html` ahead of the lazy tab scripts.
Each avatar URL travels with two sidecar fields — a kind (`"video"` or `""`)
and a poster JPEG still for contexts that need an image: portrait
(`st.portraitKind/Poster`), refs (`r.kind/poster`), saved records
(`thumbKind/thumbPoster`), vault/roster (`thumbKind/thumbPoster`), board body
(`thumbKind/thumbPoster`) + board meta (`avatarKind/avatarPoster`). Uploads
accept `image/*,video/*` (portrait, reference captioning, board repair); video
uploads keep their `data:video/` prefix so `kindOf` detects them, and a poster
is captured from the first frame for captioning (`generateText` vision only
takes image blobs, so the poster is described, not the clip). Board publish
uploads video blobs directly (never `Image`-downscaled) and stores the video
URL as both `thumb` and `avatar`, plus the poster. Two consumers MUST have
stills, so they get the poster: the AI-chat handoff
(`prepareCharacterForInAppChat` in `src/gallery.js`, plus the persona-tab /
social / board chat builders — external chats paint `background-image`, where
video can't play) and Tavern `.json` export (`card.avatar` = poster, video URL
appended to `creator_notes`). `blob:` video URLs are session-only; persistence
is the uploaded http URL — the persona tab's `durableAvatar()` uploads
`blob:`/`data:video` thumbs via `upload-plugin` on every save path (library,
vault, roster) before storing, so a freshly picked clip survives reloads. `Characters.setAvatar` now takes
`(id, url, kind, poster)` (kind auto-detected when omitted).

## 🔗 Shared hub — `src/vault.js` (cross-tab "one pipeline")
A single lazily-loaded module (`ensureVault()` in index.html, same pattern as the
other tab scripts) wires the whole site together. It self-bootstraps and installs
five globals:

- **`window.Vault`** — the cross-tab **prompt vault**, backed by kv-plugin
  (IndexedDB folder `promptVault`, key `items`, capped at 800). API:
  `init`, `add(text, {tags, thumb, tab, label})`,
  `addImage(dataUrl, text, opts)` (downscales the image to a ~128px JPEG thumb),
  `list()`, `remove(id)`, `update(id, patch)`, `count()`, plus `open()` (the vault
  modal) and `pick(cb, {title})` (a picker that hands the chosen prompt text to
  `cb`). Items carry `{id, text, thumb, tags[], tab, label, ts}`; the modal has
  view tabs (prompts / characters), a text search, tag-filter chips, per-item
  copy / send / edit / delete, an inline add box, and export/import buttons.
  A `vaultToast(msg)` helper is exposed too. Every tab can save into the vault —
  from the i2p results, the gen toolbar, gallery cards, evo cards, Pro tiles, AI
  Photo results and Comic character cards — and every prompt box can pull from it
  (`Vault.pick`), so prompts flow freely between tabs.
- **`window.Characters`** — a **character roster for consistency** (kv folder
  `promptVault`, key `chars`). `captureFromImage(dataUrl, prompt, opts)` stores
  `{id, name, prompt, seed, shape, thumb, ts}` (used by the Pro tile 🧑 button and
  available elsewhere); `generateScene(character)` re-opens that character in the
  image generator to place them in a **new scene** with a consistent look/seed;
  `add/list/remove/open`.
- **`window.PromptBridge`** — the universal **"Send to ▸"** menu. `sendTo(text,
  {anchor, preview, thumb, tags, tab})` opens a popup anchored to the button with
  the five prompt destinations plus *save to vault* / *copy*. `destinations` is
  the registry (`gen` = Image Generator description box, `pro` = Pro "Your
  Vision", `evo` = Evo idea box, `aiedit` = AI Photo Editor instruction, `comic` =
  Comic Scanner focus box), each with a `sel`, an optional `ready()` predicate and
  a `setter` hook name (`__proSetDesc` / `__evoSetIdea` / `__aieditSetInstruction`
  / `__comicSetFocus` / `__genApplyRecipe` equivalents). `applyTo(dest, text)`
  switches to that tab, waits for the box, fills it and dispatches `input` so the
  host app notices. `menuButton(text, opts)` returns a ready-made ▸ button.
- **`window.Recipe`** — **portable share links & recipes**. `encode(state)` /
  `decode(str)` base64-JSON; `shareUrl(kind, state)` builds a
  `https://perchance.org/<generatorName>#recipe=<...>` link (top-level page URL,
  name looked up live so renames/forks work); `copy(kind, state)` copies it and
  toasts; `current(kind)` gathers the active tab's settings; `apply(obj)` decodes
  a recipe on load and dispatches to the tab-specific appliers
  (`__genApplyRecipe` / `__proApplyRecipe` / `__themeApplyRecipe`). On page load the
  module parses `location.hash` for `#recipe=` and applies it. The Gen toolbar's
  🔗 and the Pro tile's 🔗 and the Theme footer's 🔗 all produce these links.
- **`window.SiteBackup`** — **full export/import**. `exportAll()` downloads one
  JSON with the vault + character roster + persona prompt history + the saved
  persona library (`personaSaved`) + every
  localStorage key matching the site's namespaces
  (`^t2i`, `^evo`, `^imagerPro`, `^aiag_`, `^thTheme`, `^rememberedInput`,
  `^generateClickCount`, `^vaultRecentTags`), so a user can move their entire setup
  to another browser or share it. `importFromFile(file)` / `importFromObject(obj)`
  restore it (confirming before overwrite).
  - **🗜️ Compact backup** (`exportCompact()`, vault-modal button + palette entry):
    the same data with thumbnail dataURLs dropped (they're regenerable previews),
    throwaway `id`/`ts` fields dropped (import regenerates them), empty/default
    fields omitted, short field names, no pretty-print whitespace, then gzip via
    `CompressionStream` (`.json.gz`; falls back to `.min.json` where gzip is
    unavailable). Typically 5–20× smaller. The toast prints before → after sizes.
    `importFromFile` auto-detects gzip by magic bytes and `importFromObject`
    accepts both shapes, so old `.json` backups still restore. `measure(data)`
    returns per-section byte sizes; `collect()` builds the uncompressed payload.
- **`window.CommandPalette`** — a **⌘/Ctrl-K command palette** (open/close) that
  fuzzy-searches commands: switch to any tab, open the vault / characters / gallery
  / saved images, save-all-prompts, export/import, share the current recipe, toggle
  theme mode, and jump to the individual sub-tools. Arrow keys + Enter to run.

## 😀 Comment emojis & the emoji browser (every comment area)
Two comment surfaces belong to this generator: the **Image Generator tab's**
tabbed comments (rendered by `t2i-framework-plugin-v2` from
`settings.defaultCommentOptions` + `settings.commentChannels` in main.pjs) and the
**Pro tab's** `#pro-comments-ctn` (`initComments()` in `src/imager-pro.js`). Both
now accept the same custom emoji packs.

- **The packs** — `settings.defaultCommentOptions.customEmojis` is a pjs **list**
  whose children are `@import` lines:
  - `@import = {import:huge-emoji-list}` — its `$output` is a `.txt` URL, so the
    package auto-updates when its author does.
  - `@import = https://user.uploads.dev/file/8f67c8ebeb07e93d1e7c4e9c9d9d1d58.txt`
    — a hosted copy of **perchance.org/the-epic-emoji-list**'s pack (memes,
    kaomoji, unicode glyphs, copypasta, "binary" ASCII art; 1,920 entries,
    refreshed from the source's `$output` + `NewestEmojis` list).
  Why a hosted copy instead of `{import:the-epic-emoji-list}`: the comments
  plugin resolves `@import` lines by *string*-evaluating them
  (`text.replace(/@import\s*=\s*[[{].+/g, m => m.evaluateItem)`), and evaluating an
  import whose `$output` is a *list* collapses to the literal string `$output`. Its
  embed then only accepts `@import` values matching
  `/https:\/\/(?:user-uploads\.perchance\.org|user\.uploads\.dev)\/file\/[\w-]+\.txt/`
  (see `parseCustomEmojiListText`, and the comment above `importCustomEmojiPacks`
  in the embed), so the pack has to exist as a hosted `.txt`. The exact bytes live
  in **`src/epic-emoji-pack.txt`**; to refresh it, re-extract the `$output` body of
  that generator (strip `//`/blank lines, keep source order), synthesize `(tags:new)`
  onto every name in its `NewestEmojis` list (merge with any existing tags, drop stale
  `new` tags — upstream no longer annotates newness itself), and re-upload the file,
  then paste the new URL into **both** the `@import` line and `epicEmojiPackUrl` below it.
  - Line format the embed expects: `code = value` (the space matters — the parser
    does `substring(indexOf("=") + 2)`), where `value` is an absolute URL or plain
    text, optionally preceded by `(tags:a,b)` / `(size:N)` annotations.
- **`epicEmojiPackUrl`** (top of main.pjs) exposes the epic pack URL to JS, so the
  emoji browser no longer needs its own import.
- **The Pro tab** hands `root.settings.defaultCommentOptions.customEmojis` to the
  plugin directly, but only after checking the value really is the pjs list node
  the plugin wants (`typeof customEmojis.getRawListText === "string"`) — a bare
  string there would make the plugin throw.
- **`src/emoji-browser.js`** — this site's version of the-epic-emoji-list's browse
  UI, so people can actually *find* a `:code:`. It fetches the pack once per
  session, parses it into `{name, value, url, tags, cat, isNew}`, and shows a
  searchable, sortable grid with category chips mirroring the source generator
  (`All / Main / Text / Copypasta / Binary / BCC / 🆕 New`); searching also matches
  tags and category names. Clicking a card copies `:code:` (toast), the card's 🔍
  opens a lightbox preview with a copy button, Esc closes the lightbox then the
  modal, and clicks outside close it. Card images are **loaded lazily by a
  `getBoundingClientRect` sweep** (`loadNearVisible`, on open/filter/scroll) rather
  than all ~1,900 at once — several pack GIFs are multi-MB, and requesting them all on
  open both stalls the page and made the snapshot tooling choke. Deliberately no
  IntersectionObserver (the platform can stop firing IO callbacks), no copy of the
  pack data (it fetches the same URL the comments load, so the codes it lists are
  exactly the codes that work).
  - Opened from: the **😀 Emojis** button in the app header (`#i2p-hub-emojis`,
    always available, including while using the embedded chat tabs), the **😀 Emoji
    browser** bar above the Pro tab's comments (`#pro-emoji-btn`, `data-act="emojis"`),
    and a bar once injected above the Image Generator's comment box (`#ebGenBar`) — currently
    dormant, because `socialFeatures = disabled` in main.pjs means the gen tab renders no comment
    box, so there is nothing to attach to (the bar reappears on its own if socials are re-enabled).
  - Loaded lazily via `ensureEmojiBrowser()` (`loadScriptOnce("__emojiBrowserLoaded",
    "src/emoji-browser.js")`), pulled in on first visit to the gen/Pro tab or the
    first 😀 click. Public API: `window.t2iOpenEmojiBrowser()`,
    `window.t2iCloseEmojiBrowser()`, `window.t2iEmojiBrowserData()`.
  - The comment boxes' own picker is unchanged: typing `:` in a comment input still
    opens the plugin's built-in custom-emoji list for both packs.
- **Moderation** — the shared community chat (`SharedComm`, tabbed rooms from
  `settings.commentChannels`: General, ❓ Help, 🎨 Showcase, ☕ Lounge, Prompts, 📖 Story, one room per studio tool (🎨 Image Generator, 🧬 Prompt Evolution, 🖼️ Personal Gallery, 🌐 Explore, 🖼️ Community, 🧪 Style Forge, 🖼️ Image to Prompt, ✨ AI Photo Editor, 🖌️ Image Editor, 📚 Comic Scanner, 🧑 Persona Generator, 🎭 Persona Board, 💬 AI Chat, 💬 AI Chat Lite, 🔗 Media to Links, 👥 Social DB, 🎨 Theme Studio), 💡 Feedback) passes `settings.defaultCommentOptions` through, including
  `adminPasswordHash` + `bannedUsers`. The `general` node MUST keep an explicit
  `channel = general`: the tabbed plugin maps a channel-less `general` node to the
  default ("") stream, which orphaned the whole room history once — the live history
  lives in folder `<generator>+general`. The plaintext admin password lives only with the
  owner — never in source. To delete messages: click the chat, press Ctrl+L (Cmd+L on
  Mac), enter the password, then use the ❌ button on any message (🚩 bans the author).
  To ban by ID without logging in, append the full user ID to `bannedUsersList` in main.pjs.
- **Chat notifications** (`src/chat-notify.js`, script tag just before the SharedComm
  block): the SharedComm boot passes its defaults through `ChatNotify.hookDefaults()`
  (a prototypal wrapper, so every `defaultCommentOptions` key still resolves and the
  tabbed plugin's `defaultChannelOptions.onComment/onLoad` chaining picks up the hooks),
  giving real notifications for new community-chat messages — in-app toast (click = jump
  to the chat), OS-level `Notification` when permission is granted, unread count on the
  🔔 bell in every 💬 Community card header and the Home Community header plus a `(N)` tab-title badge. `onLoad`
  output is baseline-only (never notifies), own messages (`byCurrentUser`) never notify,
  and nothing fires while the chat is visibly on screen. The 🔔 bell toggles it all
  (`localStorage.t2iChatNotify`, default on); enabling also requests OS permission.
  Owner side (`src/owner-notify.js`, owner-gated section inside the 🔒 Owner console):
  📣 Broadcasts also ping every opted-in device (banner for everyone, OS pop-up only
  where the bell is ON + permission granted), and a 👑 Owner-watch toggle
  (`localStorage.t2iChatOwnerWatch`, effective only while unlocked as owner) pings
  the owner's device for EVERY message — even while looking at the chat — plus
  @owner/@admin/@mod/@everyone/@here mentions always tap the owner. Hard limit:
  no push server, so pings need the tab OPEN (background tabs count on
  desktop/Android; iOS needs the installed PWA with the page open).
- **Chat generations / reset-all** (`src/chat-gen.js` + server `ownerChatGenReset` /
  `chatGen` RPCs + `owner:chatgen` topic, script tag before SharedComm): the
  owner-gated answer to "reset every community chat at once". The comments plugin
  has no edit / delete-own / clear API at all (verified in its shipped app bundle:
  delete is admin-password-only, no edit endpoint, feed is a cross-origin iframe),
  so reset moves General · Help · Showcase · Lounge · Prompts · Story · every per-tool room to a fresh `-g<N>`
  channel generation for everyone at once (hot-swapped live, no refresh needed).
  NOTHING is deleted — old rooms stay saved under their old names. 💡 Feedback is
  never versioned (owner inbox). The Owner console section shows the live
  generation; the button is disabled until unlocked.

## ⚡ Performance architecture (lazy tab scripts)
index.html is kept deliberately small on the critical path (it went from ~328KB
to ~163KB). The heavy, tab-scoped scripts are **external files under `src/`,
loaded on demand** rather than being inlined:

- `src/evo.js` — the whole Prompt Evolution engine. Loaded on first Evo-tab open.
- `src/gallery.js` — the gallery/cloud-sync/scratchpad/page-background/NSFW
  framework-extras script (the largest one). Loaded on first open of the gen,
  Pro, AI-Photo or Comic tab (all of which use it), **and** at page load if
  `localStorage.t2iBgSettings` holds a saved page background (so the background
  still restores immediately).
- `src/gen-extras.js` — the three framework-hooking gen-tab scripts combined in
  order: persona-prompt autosave, the Fine-tune panel, and the nexora mode
  switcher. Loaded on first open of the gen or Pro tab (after `src/persona.js`).
- `src/gen-persona-ui.js` — restyles the framework's per-image 🎭 persona / 💬 chat
  overlay (`.char-description-editor-ctn`) into an organized theme-aware panel:
  header with image thumbnail + ✕, then labeled sections ① brief / ② voice &
  tone / ✨ generate / ③ result, then a ④ footer (💬 chat primary + 📋 history /
  🧑 port row). Wraps `window.t2i_openCharacterDescriptionEditor` outermost (own
  re-assert interval, so it survives persona.js / gen-extras.js re-wraps) and
  re-homes late-injected buttons (tone row, history, port) via MutationObserver.
  Its 🧑 port button sends the image to the Persona Generator as a 🖼️ Starter
  (image + image prompt + brief/tone/style, no generate-first gate); if a
  persona was already generated here it is loaded into the editor too. Loaded
  last in `ensureGenExtras()`.
- `src/custom-styles.js` — the 🎨 Custom Art Styles panel (ported from
  `qinegen`'s tabbed custom-styles manager: style tabs, name+prompt pairs, two
  picker slots, Export/Import, localStorage persistence). Statically included in
  the gen tab; inserts itself after the art-style picker and feeds
  `customStylesPrompt()` / `customStylesNames()` in main.pjs.
- Anti-orphan system: `src/FEATURES.md` (registry + standing orders for editors),
  `src/orphan-guard.js` (boot tripwire — loud console errors if a shipped script
  goes unwired), `src/dev-audit.js` (`page_eval`-only deep audit, incl. DOM
  inventory), `src/APP_LOG.md` (full rebuild reference: every tab, system,
  content pack and wiring point, plus the removed-features changelog).
- `src/emoji-browser.js` — the 😀 custom-emoji browser for the comment areas (see
  its own section above). Loaded on first open of the gen or Pro tab, or on the
  first 😀 click anywhere. It fetches the ~85KB emoji pack only when the browser is
  actually opened, not at load.
- The two **chat tabs** and the **Media to Links** tab embed external
  generators in their own iframes, each with its `src` set only on first open (no
  iframe document is fetched on a normal page load).
- `src/persona.js` — the shared persona/character-writing engine used by BOTH the
  gen tab's 🎭 button and the Pro tab's persona modal. Exposes
  `window.t2i_personaTones` / `t2i_buildPersonaInstruction(opts)` /
  `t2i_parsePersona(text)` / `t2i_runPersonaGeneration(opts)`, and
  `t2i_installGenPersonaOverride()` which replaces the read-only framework's
  `window.t2i_generateCharacterDescription` with a richer version (same editor
  DOM, so gen-extras' autosave wrap still applies). Generation runs in **4
  sequential passes** (core identity → inner life → roleplay examples 1–5 →
  6–10) that share one byte-identical prompt prefix (so passes 2–4 hit the
  server's prefix cache) and stream into the editor as they arrive — this keeps
  the long (~2,000+ word, 10-example) description from being truncated
  mid-response by the per-call output limit. Each pass retries once if it comes
  back empty, `t2i_runPersonaGeneration(opts)` accepts `onProgress(part)` (the
  gen/Pro buttons use it to show "part n/4 · <stage>"), and `.stop()` aborts the
  current pass and the rest of the chain. It also injects a tone
  selector + "extra sparkle" checkbox into the framework's persona editor (and
  the Pro modal has its own copy), persisted via localStorage
  `t2i_persona_tone` / `t2i_persona_lively`. It also owns the richer option
  tables used by the Persona Generator tab (`window.t2i_personaOptions`:
  depths/languages/ratings/17 grouped genders/1032 genre settings/55 grouped
  relationships/366 occult types (43 explicit + 24 mature)/extraSections), the
  1410-entry grouped `window.t2i_personaTones` (15 groups: 10 SFW groups, then the
  18+ after-dark dere / mature archetypes / extreme gire blocks, then the
  170-strong 🔞 NSFW & taboo set holding
  every explicit tone, the two suggestive-mature holdovers, plus the
  incest-complex family)
  with `t2i_personaToneById()` / `window.t2i_fillToneSelect()` for the shared
  grouped <select>, the adaptive `passes()`/`templateHeads()`/`optionsBlock()`
  prompt builders (which apply `effectiveRating()` so an explicit tone raises the
  content rating), and
  `t2i_generatePersonaSection(opts, heading, currentText, onChunk)` for single-
  section rewrites, and `window.t2i_combinePersonas(sources, opts)` /
  `t2i_combineDefaultExampleCount(sources)` — the streaming multi-pass **fusion
  engine** behind the Persona tab's 🧬 combine (merges 2+ finished characters
  into one cohesive person; every trait survives, one-source-only traits get
  added in, contradictions are resolved into complexity, and all their roleplay
  examples are reconciled into one non-repeating set). Its section handling is an
  explicit **union** (`readSourceHeads`/`combineUnion`/`extractPlanSections`/
  `combineCarryOver`): the fused result contains every source section — canonical,
  user-registered custom, and freeform/imported — exactly once, in order, with any
  section the model skips back-filled from the sources. Loaded lazily via
  `ensureGenExtras()` (before gen-extras.js)
  on first gen/Pro tab open, **or** via `ensurePersona()` on first Persona-tab
  open.
- `src/persona-tab.js` — the whole 🧑 Persona Generator tab app (gallery
  references + rich options + streaming multi-pass generation + per-section
  rewrite + handoff). Loaded lazily via `ensurePersona()` (after `src/persona.js`)
  on first Persona-tab open. See "Tab 9" above.
- `src/imager-pro.js` — the former Pro Imager app (studio UI removed). Loaded on
  first Community-tab open for its gallery-feed backend (`__proInitGallery`). It no longer needs
  `src/imager-pro-themes.js`: that file is now pulled in solely by the Theme
  Studio's `ensurePackData()` (the 42 themes are its site-wide theme packs).
- `src/vault.js` — the shared cross-tab hub (prompt vault, character roster,
  "Send to ▸" bridge, portable recipe links, full export/import, ⌘K command
  palette). Loaded lazily via `ensureVault()` on first need — a vault/send button
  click, a recipe in the URL hash, or the command palette.

`showTab()` in index.html drives this through tiny idempotent helpers at the top
of the i2p script — `loadScriptOnce(flag, src, onload)` plus
`ensureGallery()` / `ensureEvo()` / `ensureGenExtras()` / `ensureProApp()` /
`ensurePersona()`
(all exposed on `window`). Each sets a `__<name>Loaded` / `__<name>Loading`
flag pair, so repeated tab switches never re-inject a script. `window.__activeTab`
tracks the current tab so an onload callback can apply tab-appropriate setup
(e.g. re-running `evoSetVisible` or `__proOnTab(true)` after a late load).

Everything eager is only what the first paint needs: the engine/framework, the
i2p tab + tab bar + these loaders, the Save-all-prompts button handler, and the
theme engine (which must run before paint to avoid a flash). **When adding new
tab-scoped code, put it in its own `src/*.js` and lazy-load it on the relevant
tab rather than inlining it** — the framework-hooking scripts must simply be
idempotent/polling (they attach when the framework DOM already exists, which it
does by the time a tab is opened).

## 🖼️ Generator listing metadata (`$meta`) + the listing image
`main.pjs`'s `$meta` block is what shows up **while browsing this generator in
Perchance's lists**, in search results, and in link/social preview cards — so it's
written to advertise the *whole studio*, not just the image generator, while keeping
the long-standing keywords people actually search for:

- `title` = `All-in-One AI Studio — unrestricted AI image generator + 11 more free tools`
- `description` = "Twelve free AI tools on one page, with no sign-up, no login and no
  limits. …" (keeps *unrestricted / free / no sign-up / no limits* + the anime/OC/
  adult-artwork phrasing that the generator's audience searches for).
- `tags` = `ai image generator, free, no sign up, unrestricted, ai art, anime, photo
  editor, comic scanner, persona, ai chat, all in one`
- `image` = the branded 4:3 (1536×1152) card. **This is a composed asset, not a
  screenshot** — four AI-generated sample outputs (photoreal / anime / fantasy art /
  comic) in a 2×2 grid over the studio theme's dark page gradient, with a centred
  brand band ("All-in-One AI Studio" + `12 AI tools in one page · free · no sign-up ·
  no limits`) and a hand-drawn 4-point star mark (drawn as a path — canvas text can't
  rely on the ✦ glyph in a worker). Tiles used:
  - photoreal  https://user.uploads.dev/file/0a3e0e5a95f8243ea05545ff38485d2d.jpg
  - anime      https://user.uploads.dev/file/5108ac862a633002281dd11edb5536d1.jpg
  - fantasy    https://user.uploads.dev/file/3a2322ce162ef80fb27f241b29ffdd15.jpg
  - comic      https://user.uploads.dev/file/03338e924321daff7f24fba5287f4940.jpg

  Rebuild recipe (all generated in the browser via `generate_image`, 768×512 each;
  then composited in an `OffscreenCanvas`): card 1536×1152, outer pad 30, gap 20,
  tiles `728×451` with 18px corner radius and a 1.5px `rgba(255,255,255,0.16)`
  border, band 152 tall at the bottom (rounded 18, `rgba(255,255,255,0.06)→0.02`
  fill + `0.12` border), brand 46px bold + tagline 28px centred, backdrop =
  `linear-gradient(180deg,#0d1226,#090c18 55%,#06070e)` plus two elliptical radial
  glows (`rgba(79,91,239,0.30)` top-left, `rgba(217,70,239,0.18)` right) matching
  `THEMES.studio.dark.pageBg`, exported as JPEG q0.9 (≈280KB). Note an earlier
  attempt used a **screenshot of the Home UI** — reviewers consistently read it as
  "a dashboard of text tools, not an image generator", so the card deliberately
  leads with sample artwork instead. The finished card (the file `$meta.image`
  points at) is hosted at
  `https://user.uploads.dev/file/ba25553202b14da8a32841bf855bdf6a.gif` — an animated
  GIF (640×426, 8 frames × 1.2s, ≈950KB) cycling through eight sample outputs, each
  with the brand band. Built with `gifenc` (via jsdelivr ESM) in `execute_js`.
  Surfaces that don't animate listing images simply show its first frame.

## Notes
- **💾 Save all prompts** (button at the end of the tab bar, `index.html`): downloads
  every prompt saved on the site into one `saved-prompts.txt`. Sources, in order:
  saved gallery (`t2iGalleryItems`), kept prompts (`t2iKeptPrompts`), remembered
  Image-Generator inputs (`rememberedInput_*` + live fallback), scratchpads
  (`t2iScratchpadText`, `imagerProScratch`), Prompt Evolution saved images
  (`evoSavedMeta`), Pro Imager presets (`imagerProPresets`) + last state
  (`imagerProStateV1`), persona prompt history (`window.t2i_personaPromptHistory`,
  kv/IndexedDB), and Comic Scanner character prompts
  (`window.__comicGetPrompts`, session-only). Implements `window.i2pSaveAllPrompts`;
  sections print "(none)" when empty and a running SUMMARY with totals.
- Tab switching = toggling the `hidden` attribute on `#i2p-app` / `#i2p-imggen` /
  `#evo-app` / `#theme-app` / `#edit-app` / `#i2p-proimager` / `#i2p-aiedit` /
  `#comic-app` (`showTab()` in the i2p script). The framework is hidden at load; it boots fine.
- Known intermittent platform bug (NOT ours, filed as platform bug 5f6c157c):
  occasionally on load the engine throws `Cannot set properties of undefined
  (setting '_element')` (and sometimes `SyntaxError` in
  `reAttachSpecificDomElementEventWithRoot`). It's a race in the engine's
  runtime-generated output renderer vs the `[generateInterfaceHTML(settings)]`
  block in a hidden div. It is NON-FATAL (page fully renders and works) and
  disappears entirely when the block is replaced with static text (0/8) — it
  reproduces with zero editor code, so it predates this tab. The editor's lazy
  loading keeps its own contribution to zero.
- The framework's dark-mode `--box-color` CSS variable is reused by the i2p styles.
- If the image generator's description box ever needs the framework's `remember`
  persistence on programmatic fills, dispatch an `input` event on the textarea
  (the framework's `___inputElInputEvent...` handler saves to localStorage).
- Pro Imager theming was REMOVED: there is no theme select / 🎨 FAB / 🎨 Pro Theme
  card in the Pro tab any more, and `src/imager-pro.js` has no theme code (the
  robust-poll `initThemesPoll()` machinery went with it). UI theme now has a
  single front-end, the Theme Studio tab. If a theme control is ever wanted on the
  Pro tab again, drive `window.__themeStudio.setPack(name)` — do NOT reintroduce a
  second copy of the state.
- Site-wide theming keys: `localStorage.thThemeV1` (all Theme Studio state, now
  incl. `pack` + `packGrad`) is the single source of truth for the UI theme;
  `imagerProTheme`/`imagerProBg` are legacy (the theme key is migrated into
  `pack` once, then deleted) — nothing writes them any more. The page background
  is not in `thThemeV1` — it stays in `t2iBgSettings` (owned by `src/gallery.js`,
  exposed via `window.t2iGetBackgroundSettings` / `t2iOpenBackgroundModal`). A
  theme pack's palette is applied as `--th-*` on `<html>`, plus `--th-page-bg` +
  `data-th-page="1"` for the gradient backdrop (the `studio` preset uses the same two
  fields for its own backdrop, and its `tabs` map feeds `--th-dot`/`--th-dot-soft` +
  `data-dot` on the nav buttons and Home tool cards); `body:has(#t2iBgLayer)` covers
  the custom-background case.
- Tab bar is responsive: on desktop the task-grouped tabs wrap centered (groups
  wrap as whole units); at ≤880px it becomes a single swipeable row (hidden
  scrollbar + right-edge fade) with the group labels hidden; at ≤480px the
  header brand text and hub-button labels collapse to icons.
- App-wide bug sweep (clipboard / async-render robustness): every copy path is
  now rejection-safe and falls back to `execCommand` — `copyText()` (`src/vault.js`,
  used by Recipe.copy and vault-item copy), `copyStr()` and the i2p compare copy
  button (`index.html`), and the chat-link copy (`showCharacterLinkModal`,
  `src/gallery.js`). Before, a denied `navigator.clipboard.writeText` promise left
  an unhandled rejection and copied nothing. `renderGallery()` (`src/gallery.js`)
  now early-returns when `#t2iGalleryModal` is absent, so the peer-gallery load
  resolving after the user closes the modal no longer throws
  `Cannot set properties of null`. Prompt Evolution's post-generation
  `schedule()` calls (`src/evo.js`) now defer to a macrotask so a generation that
  completes without a real async boundary can't starve the event loop.

## 😂 Funny generation steps
While an image generates (10–60s of staring at a spinner), the status line rotates jokes every ~2.8s.
- **Shared helper**: `window.FunnyGen` (inline script in index.html, before the translate block) — `STEPS` (24 lines) + `start(setFn, ms, maxTicks)` which returns a stop function. It also watches the framework Image Generator's `#generateButtonEl` and rotates its text while it reads "generating".
- **Wired into**: Pro Imager `generate()`/`runVariations()` (src/imager-pro.js), AI Photo Editor `applyEdit()` (src/aiedit.js), Prompt Evolution cards (src/evo.js), Persona portrait (src/persona-tab.js), Comic character draw (src/comicscan.js), Vault scene generator (src/vault.js), Simple-mode status (src/gen-extras.js).
- **Pattern**: start the rotator just before the `await root.generateImage(...)`, stop it right after it resolves and in the catch — so error/done messages are never overwritten. Every call site guards with `window.FunnyGen ? … : null`, so nothing breaks if the helper is missing.
- **Rotating one-liners**: `window.Quip` (same inline script, right after FunnyGen) holds ~50 named pools (`dropHint`, `galSaved`, `pgenReady`, `td-<tool>`, `dCommHint`, … — 2–3 variants each, same voice) with `Quip.q(name, fallback)` — `pick()` never repeats a line twice in a row. Static spots opt in via `data-quip="pool"` (chat/links boot lines, caption dropzone hint, home/community/theme hints — replaced at boot); dynamic spots (toasts, statuses, alerts, empty states in evo/gallery/explore/edit/aiedit/comic/persona-tab/imager-pro/gen-extras) concatenate `Quip.q(...)` with a straight fallback so nothing breaks if a pool is missing. Tool descriptions rotate too: every Home tool card gets a `td-<id>` tagline span appended at boot (kept out of the search index — the quip span deliberately does NOT use `.hm-tool-desc`), and the same pools suffix the simplebar tooltips + More-tools menu descs. Add new jokes by extending a pool, not by touching call sites.
- **Pranks** (`window.Pranks`, same inline script): rare, harmless, self-revealing — a fake-fail line injected into one FunnyGen tick per ~5 generations (rotation continues, nothing actually fails), and a needy tab title after 45s on a hidden tab. After 75s idle it also plants a vanishing "🎁 FREE premium" item in either the ⋯ public-image menus (official `PubMenu.addAction`, removed on click) or the ⌘K palette (injected row, both prank nodes removed on click/activity/expiry). Triple-click the studio brand to toggle; persisted in `t2iPranksOn` (default on). Never touches data, prompts, generations, or settings.
