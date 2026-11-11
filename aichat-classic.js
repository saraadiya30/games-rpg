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
  var BB_STATIC_CSS = "\n  hr {\n    height: 1px;\n    background: #d6d6d6;\n    font-size: 0;\n    border: 0;\n  }\n  :root {\n    color-scheme: dark light;\n  }\n  @media (prefers-color-scheme: dark) {\n    hr {\n      background: #4d4d4d;\n    }\n  }\n  \n  /* PERCHANCE EDIT */\n  body *:not(button) {\n    text-align: left; \n  }\n  \n  .loading-animation-ctn { background-color: #cbcbcb; color: grey; }\n  .loading-animation-dot { animation: 1s loading-animation-blink infinite; fill: grey; }\n  .loading-animation-dot:nth-child(2) { animation-delay: 250ms }\n  .loading-animation-dot:nth-child(3) { animation-delay: 500ms }\n  @keyframes loading-animation-blink { 50% { fill: transparent }}\n  \n  :root, :root.light {\n    /* PERCHANCE EDIT: refreshed default palette (modern, softer neutrals + a calm blue\n       accent). These are the colours a first-time visitor sees, so they set the app's\n       \"out of the box\" look. Users can still override everything in the UI editor. */\n    --background: #f2f3f5;\n    --button-bg: #ffffff;\n    --button-bg-hover: #eceef1;\n    --text-color: #1b1d21;\n    --textarea-bg: #ffffff;\n    --selected-thread-bg: #e6efff;\n    --border-color: #e3e6ea;\n    --border-radius: 8px;\n    --avatar-bg: #e3e6ea;\n    --notification-bg-color: #2563eb;\n    --button-border-color: #d9dde2;\n    --button-font-size: 0.825rem;\n    --inline-reminder-message-default-visibility: hidden;\n    --shortcut-buttons-display: initial;\n    --link-color: #1a63d8;\n    --box-color: #ffffff;\n    --box-color-hover: #f6f7f9;\n    --selected-thread-border-color: #4b7bec;\n    --top-menu-bg: var(--background);\n    --user-text-color: var(--text-color);\n    --char-text-color: var(--text-color);\n  }\n\n  \n\n  /* Detect browser dark mode and change variables */\n  @media (prefers-color-scheme: dark) {\n    :root {\n      /* PERCHANCE EDIT: refreshed default dark palette (matches the light one's accent) */\n      --background: #14161a;\n      --button-bg: #24272e;\n      --button-bg-hover: #32363f;\n      --text-color: #e7e9ec; /*#efefef;*/\n      --textarea-bg: #1e2127;\n      --selected-thread-bg: #232c42;\n      --border-color: #292d34;\n      --avatar-bg: #292d34;\n      --button-border-color: #373c45;\n      --link-color: #6ea8fe;\n      --box-color: #1b1e23;\n      --box-color-hover: #24272e;\n      --selected-thread-border-color: #5b8cff;\n      --notification-bg-color: #3b82f6;\n    }\n  }\n  \n  .inlineReminderMessage {\n    visibility: var(--inline-reminder-message-default-visibility);\n  }\n  \n  blockquote {\n    margin-left:1rem; \n  }\n\n  body, html {\n    margin:0;\n    background: var(--background);\n    color: var(--text-color);\n    font-family: sans-serif;\n  }\n  body * {\n    box-sizing:border-box;\n    color: inherit;\n    font-family: inherit;\n  }\n  body a {\n    color: var(--link-color);\n  }\n\n  .messageText {\n    position: relative; \n  }\n  .messageText pre[data-markdown-codeblock] {\n    font-family: monospace;\n    background: rgb(35 35 35);\n    padding: 0.5rem;\n    color: rgb(232, 232, 232);\n    border-radius: var(--border-radius);\n    overflow-x: auto;\n  }\n  .messageText p code {\n    font-family: monospace;\n    background: rgb(35 35 35);\n    padding: 0.125rem;\n    color: rgb(232, 232, 232);\n    border-radius: var(--border-radius);\n  }\n  .messageText table {\n    border-collapse: collapse;\n  }\n  .messageText table, .messageText th, .messageText td {\n    border: 1px solid var(--border-color);\n  }\n  .messageText em, .messageText i {\n    opacity: 0.7;\n  }\n\n  \n\n  button {\n    background: var(--button-bg);\n    border-radius: var(--border-radius);\n    cursor:pointer;\n    padding: 0.125rem;\n    border: 1px solid var(--button-border-color);\n    font-size: var(--button-font-size);\n  }\n  @media (hover: hover) and (pointer: fine) {\n    button:hover {\n      background: var(--button-bg-hover);\n    }\n  }\n  button:disabled {\n    cursor: not-allowed;\n  }\n  textarea {\n    background: var(--textarea-bg);\n    border: 1px solid var(--button-border-color);\n    border-radius: var(--border-radius);\n  }\n\n  input[type=\"text\"], input[type=\"password\"], input[type=\"email\"], input[type=\"number\"], input[type=\"search\"], input:not([type]), select {\n    background: var(--textarea-bg);\n    border: 1px solid var(--button-border-color);\n    border-radius: var(--border-radius);\n  }\n\n  #appOptions .appOptionButton {\n    width:100%;\n    cursor:pointer;\n    margin-top:0.5rem;\n    min-height: 2rem;\n  }\n  #chatThreads {\n    flex-grow:1;\n    overflow-y:auto;\n    margin-top:0.5rem;\n    -webkit-mask-image: linear-gradient(to bottom, black calc(100% - 30px), #ffffff00 100%);\n    mask-image: linear-gradient(to bottom, black calc(100% - 30px), #ffffff00 100%);\n    padding-bottom:2rem;\n  }\n  #chatThreads .thread, #chatThreads .threadFolder {\n    border-radius: var(--border-radius);\n    display:flex;\n    padding:0.5rem;\n    cursor:pointer;\n    border: 1px solid var(--border-color);\n    position: relative;\n    user-select:none;\n  }\n  #chatThreads .thread, #chatThreads .threadFolder {\n    margin-top: 0.5rem;\n    background: var(--box-color);\n  }\n  \n  @media (hover: hover) and (pointer: fine) {\n    #chatThreads .thread:hover, #chatThreads .threadFolder:hover {\n      background: var(--box-color-hover);\n    }\n  }\n  #chatThreads .thread:first-child, #chatThreads .threadFolder:first-child {\n    margin-top: 0;\n  }\n\n  #chatThreads .threadFolder {\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n  }\n\n  #chatThreads .thread .favStar, #chatThreads .thread .changeFolderPath {\n    position: absolute;\n    font-size: 80%;\n    opacity: 0.5;\n    display: none;\n    text-shadow: 0px 1px 2px #515151;\n  }\n  #chatThreads .thread .favStar {\n    top: 0.0625rem;\n    left: 0.0625rem;\n  }\n  #chatThreads .thread .changeFolderPath {\n    bottom: 0.0625rem;\n    left: 0.0625rem;\n  }\n  @media (hover: hover) and (pointer: fine) {\n    body:not(.isMobile) #chatThreads .thread .favStar:hover { opacity: 1; }\n    body:not(.isMobile) #chatThreads .thread .duplicateThreadBtn:hover { opacity: 1; }\n    #chatThreads .thread .changeFolderPath:hover { opacity: 1; }\n    #chatThreads .thread:hover .favStar, #chatThreads .thread:hover .changeFolderPath { display: inline; }\n  }\n  \n  /* can't hover on mobile, so display button on selected thread: */\n  body.isMobile #chatThreads .thread.selected .favStar, body.isMobile #chatThreads .thread.selected .changeFolderPath {\n    display: inline;\n  }\n  #chatThreads .thread .favStar[data-is-fav=\"true\"] {\n    opacity: 1;\n    display: inline;\n  }\n\n  #chatThreads .thread:not(:first-child) {\n    margin-top: 0.5rem;\n  }\n  #chatThreads .thread .button {\n    opacity:0.5;\n  }\n  @media (hover: hover) and (pointer: fine) {\n    #chatThreads .thread .button:hover {\n      opacity:1;\n    }\n  }\n  #chatThreads .thread.selected {\n    background-color: var(--selected-thread-bg);\n  }\n  #chatThreads .thread.selected {\n    border-color: var(--selected-thread-border-color);\n  }\n  #chatThreads .thread .info {\n    max-width: 100%;\n  }\n  #chatThreads .thread .nameWrapper {\n    overflow: hidden;\n    white-space: nowrap;\n    max-width: 150px;\n    display: flex;\n  }\n  #chatThreads .thread .name {\n    /* truncate long thread names */\n    overflow: hidden;\n    text-overflow: ellipsis;\n    white-space: nowrap;\n    flex-grow: 1;\n  }\n  #chatThreads .thread .avatar, #characterSelection  .character .avatar {\n    width:50px;\n    height:50px;\n    border-radius: var(--border-radius);\n    min-width:50px;\n    background-position: center;\n    background-size: cover;\n    background-repeat: no-repeat;\n    background-color: var(--avatar-bg);\n  }\n  #messageFeed .message .avatar {\n    width: 50px;\n    height: 50px;\n    border-radius: var(--border-radius);\n    min-width: 50px;\n    background-position: center;\n    background-size: cover;\n    background-repeat: no-repeat;\n    background-color: var(--avatar-bg);\n    overflow: hidden;\n  }\n  #chatThreads .thread .avatar video, #characterSelection .character .avatar video, #messageFeed .message .avatar video {\n    width: 100%;\n    height: 100%;\n    object-fit: cover;\n    display: block;\n  }\n  #chatThreads .characterEditButton {\n    font-size: 0.65rem;\n    opacity: 0.5;\n  }\n  \n  @media (hover: hover) and (pointer: fine) {\n    #chatThreads .characterEditButton:hover {\n      opacity: 1;\n    }\n  }\n\n  /* hide threads scrollbar */\n  #chatThreads {\n    -ms-overflow-style: none;  /* Internet Explorer 10+ */\n    scrollbar-width: none;  /* Firefox */\n  }\n  #chatThreads::-webkit-scrollbar { \n    display: none;  /* Safari and Chrome */\n  }\n\n  /* hide message feed scrollbar */\n  /* #messageFeed {\n    -ms-overflow-style: none; \n    scrollbar-width: none; \n  }\n  #messageFeed::-webkit-scrollbar { \n    display: none;  \n  } */\n\n  /* custom scrollbar */\n  ::-webkit-scrollbar {\n    width: 10px;\n    height: 10px;\n  }\n  ::-webkit-scrollbar-track {\n    background-color: transparent;\n  }\n  ::-webkit-scrollbar-thumb {\n    background-color: var(--button-bg);\n    border-radius: 10px;\n    border: 3px solid transparent;\n    background-clip: content-box;\n  }\n  ::-webkit-scrollbar-thumb:hover {\n    background-color: var(--button-bg-hover);\n  }\n\n\n  #builtInChatInterfaceWrapper {\n    display: flex;\n    flex-grow: 1;\n    flex-direction: column;\n    height: 100%;\n    position:relative;\n    padding-left: 0.5rem;\n    padding-right: 0.5rem;\n  }\n\n  #messageFeed .message {\n    margin-top:0.5rem;\n    margin-bottom:0.5rem;\n  }\n\n  /* message selection mode */\n  #messageFeed .message.messageSelected .messageWrap {\n    box-shadow: 0 0 0 2px #ff2e63, 0 0 0 4px rgba(255,46,99,0.25);\n    border-radius: var(--border-radius);\n    background: rgba(255, 46, 99, 0.10);\n  }\n  #messageFeed .message.selectionAnchor .messageWrap {\n    box-shadow: 0 0 0 3px #4a6dff;\n    border-radius: var(--border-radius);\n  }\n\n  #messageFeed .message .bottomButtons {\n    display:none;\n    position:absolute;\n    bottom: 0rem;\n    right: 0.5rem;\n    z-index:10;\n  }\n  #messageFeed .message:hover .bottomButtons {\n    display: flex;\n  }\n  .emojiButton {\n    opacity:0.5;\n    cursor:pointer;\n  }\n  \n  @media (hover: hover) and (pointer: fine) {\n    .emojiButton:hover {\n      opacity:1;\n    }\n  }\n  \n  /* this is a bit too 'magic' for my liking, but it just hides any hidden messsage that has a hidden message immediately after it, so to see the earlier hidden message, they first need to display the one below it (prevents a wall of \"show hidden messages\" buttons  */\n  #messageFeed .message.hiddenFromUser:has(+ .message.hiddenFromUser) {\n    display: none;\n  }\n  \n  #messageFeed .message.hiddenFromUser .showHiddenMessageButton {\n    display: inline-block;\n    color: var(--text-color);\n  }\n  #messageFeed .message:not(.hiddenFromUser) .showHiddenMessageButton {\n    display: none;\n  }\n  #messageFeed .message.hiddenFromUser .messageWrap {\n    display: none;\n  }\n  #messageFeed .message:not(.hiddenFromUser) .messageWrap {\n    display: flex;\n  }\n  #messageFeed .messageText p {\n    white-space: pre-wrap;\n  }\n  #messageFeed .messageText {\n    margin-top: 0.125rem;\n    overflow: hidden; /* keep messageText content from \"escaping\" the message area */\n  }\n  #messageFeed .messageText p:first-child {\n    margin-top:0;\n  }\n  #messageFeed .messageText p:last-child {\n    margin-bottom:0;\n  }\n  #messageFeed .messageText img {\n    max-width: 100%;\n  }\n  /* PERCHANCE EDIT: let the mouse wheel scroll the chat feed even when the pointer is over a generated image — the text-to-image plugin iframes would otherwise capture the scroll (cross-origin iframe swallows wheel events) and the feed appears \"stuck\" at the bottom */\n  #messageFeed iframe.text-to-image-plugin-image-iframe {\n    pointer-events: none;\n  }\n  /* user- vs character-message text colors (theme-controlled via UI editor) */\n  #messageFeed .message[data-character-id=\"-1\"] .messageText { color: var(--user-text-color); }\n  #messageFeed .message:not([data-character-id=\"-1\"]) .messageText { color: var(--char-text-color); }\n  #messageFeed .message .avatar {\n\n  }\n\n  /* prevent custom message styles from messing with inline message editor */\n  #messageFeed .message textarea { color:revert; }\n  #messageFeed .message button { color:revert; font-family:revert; }\n  #messageFeed .message .messageVariantsCtn { color:var(--text-color) !important; font-family:sans-serif !important; text-shadow:none !important; }\n\n  #messageFeed > *:first-child {\n    /* PERCHANCE EDIT */\n    /* margin-top: 3rem; */\n  }\n\n  #characterFoldersList {\n    display: grid;\n    grid-template-columns: repeat(auto-fill, 280px);\n    grid-gap: 0.5rem;\n    justify-content: center;\n    margin-bottom: 0.5rem;\n  }\n  #characterFoldersList .characterFolder {\n    border: 1px solid var(--border-color);\n    border-radius: var(--border-radius);\n    width: 100%;\n    padding:0.5rem;\n    cursor:pointer;\n    user-select:none;\n  }\n\n  @media (hover: hover) and (pointer: fine) {\n    #characterSelection .character:hover {\n      background: var(--box-color-hover); \n    }\n  }\n  #characterSelection .character {\n    border: 1px solid var(--border-color);\n    border-radius: var(--border-radius);\n    width: 100%;\n    background: var(--box-color); \n  }\n  #characterSelection .character .info .buttons {\n    margin-top: 0.25rem;\n  }\n  #characterSelection .character .info .buttons button {\n    font-size: 0.7rem;\n    margin-left: 0.5rem;\n  }\n  #characterList, #starterCharacterList {\n    display: grid;\n    grid-template-columns: repeat(auto-fill, 280px);\n    grid-gap: 0.5rem;\n    justify-content: center;\n  }\n  #characterFoldersList .characterFolder {\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n  }\n  #characterSelection .character {\n    user-select:none;\n  }\n\n  #customCodeIframeHorizontalResizeBar {\n    width:5px;\n    background:var(--button-bg);\n    cursor:ew-resize;\n  }\n  \n  @media (hover: hover) and (pointer: fine) {\n    #customCodeIframeHorizontalResizeBar:hover {\n      background:var(--button-bg-hover);\n    }\n  }\n\n  #userMessagesSentHistoryCtn {\n    z-index: 10;\n    bottom:0.25rem;\n    position:relative;\n  }\n  #userMessagesSentHistoryCtn:empty {\n    display: none;\n  }\n  #userMessagesSentHistoryCtn .historyItem {\n    cursor: pointer;\n    padding: 0.25rem;\n    font-size: 85%;\n    overflow: hidden;\n    white-space: pre;\n    display: flex;\n  }\n  #userMessagesSentHistoryCtn .historyItem .text {\n    text-overflow: ellipsis;\n    overflow: hidden;\n    margin-left: 0.25rem;\n  }\n  #userMessagesSentHistoryCtn .historyItem .deleteButton {\n    margin-left: auto;\n  }\n  @media (hover: hover) and (pointer: fine) {\n    #userMessagesSentHistoryCtn .historyItem:hover {\n      background: var(--background);\n    }\n  }\n  #userMessagesSentHistoryCtn .historyItem .pinButton,\n  #userMessagesSentHistoryCtn .historyItem .deleteButton {\n    opacity: 0.5;\n  }\n  #userMessagesSentHistoryCtn .historyItem[data-is-pinned=\"true\"] .pinButton {\n    opacity: 1;\n  }\n  \n  @media (hover: hover) and (pointer: fine) {\n    body:not(.isMobile) #userMessagesSentHistoryCtn .historyItem .pinButton:hover,\n    body:not(.isMobile) #userMessagesSentHistoryCtn .historyItem .deleteButton:hover {\n      opacity: 1;\n    }\n  }\n\n  #shortcutButtonsCtn {\n    margin-bottom:0.25rem;\n    position:relative;\n    overflow-y: auto;\n    display: var(--shortcut-buttons-display); /* so we can make it invisible until they've sent at least a few messages - to reduce clutter */\n  }\n  #shortcutButtonsCtn:empty {\n    display:none;\n  }\n\n  #shortcutButtonsCtn button:first-child {\n    /* the bulk edit button */\n    border: none;\n    background: transparent;\n  }\n  #shortcutButtonsCtn button:not(:first-child) {\n    margin-left:0.25rem;\n    padding-left: 0.3rem; \n    padding-right: 0.3rem; \n  }\n\n  /* 🎨 auto-image toggle: \"generate one image with every generated message\" (per-thread setting).\n     NOTE: this button (and ✅ keep-all-images) live in the CHAT's top quick-buttons menu, not in\n     #shortcutButtonsCtn, so these styles are deliberately container-independent. */\n  #autoImageToggleBtn {\n    cursor:pointer;\n    border:1px solid var(--button-border-color);\n    background:transparent;\n    border-radius:var(--border-radius);\n    display:inline-flex; align-items:center; justify-content:center;\n    font-size:var(--button-font-size);\n    padding-left:0.3rem; padding-right:0.3rem;\n    color:inherit;\n  }\n  #autoImageToggleBtn.auto-image-on {\n    background:#1f7a33;\n    border-color:#1f7a33;\n    color:#fff;\n  }\n  /* ✅ keep-all-images button states — unlike auto-image this is a one-click action, not a\n     staying-on mode, so its label always shows the live state: highlighted + a pending count\n     while there are unkept images, dimmed with a ✓ when there's nothing to keep. The text\n     (not just the background) carries the state so it stays readable on mobile, where the\n     pill style overrides button backgrounds. */\n  #keepAllImagesBtn.keep-all-pending {\n    background:#1f7a33;\n    border-color:#1f7a33;\n    color:#fff;\n    font-weight:bold;\n  }\n  #keepAllImagesBtn.keep-all-done { opacity:0.75; }\n  /* ✅ keep-all-images button — matches the auto-image toggle, sits next to it */\n  #keepAllImagesBtn,\n  /* 👥 who button — chooses which message authors auto-image applies to */\n  #autoImageWhoBtn {\n    cursor:pointer;\n    border:1px solid var(--button-border-color);\n    background:transparent;\n    border-radius:var(--border-radius);\n    display:inline-flex; align-items:center; justify-content:center;\n    font-size:var(--button-font-size);\n    padding-left:0.3rem; padding-right:0.3rem;\n    color:inherit;\n  }\n  /* ...but if they're ever placed in the compact shortcut row, keep them one line tall there */\n  #shortcutButtonsCtn #autoImageToggleBtn, #shortcutButtonsCtn #keepAllImagesBtn, #shortcutButtonsCtn #autoImageWhoBtn, #shortcutButtonsCtn #imagePovBtn { max-height:1.5rem; }\n  /* the per-chat image controls (auto-image, keep all, who, autokeep, undo keeps) travel together\n     as one block inside the chat's top quick-buttons menu — the block wraps as a unit so they\n     never leave one of them dangling alone on a row */\n  #amChatImageGroup {\n    display:inline-flex; align-items:center; justify-content:center;\n    flex:0 0 auto; flex-wrap:wrap; gap:0.4rem; max-width:100%;\n  }\n  #amChatImageGroup button {\n    cursor:pointer; box-sizing:border-box; height:1.6rem;\n    display:inline-flex; align-items:center; justify-content:center;\n    white-space:nowrap; max-height:none; max-width:none;\n    border:1px solid var(--button-border-color); background:transparent;\n    border-radius:var(--border-radius); font-size:var(--button-font-size);\n    padding:0 0.4rem; color:inherit;\n  }\n  #amChatImageGroup button:disabled { opacity:0.6; }\n  /* on narrow screens lay the image controls out in a tidy 2-per-row grid instead of one long row */\n  @media screen and (max-width: 630px) {\n    #amChatImageGroup button { flex:1 1 calc(50% - 0.2rem); }\n  }\n  /* per-image popup menu — hidden until hover (desktop) or a tap on the bottom tab (touch).\n     A small tab sits at the image bottom; the full menu pops up above it with all actions\n     (keep/refresh/gallery/delete/re-prompt) so nothing permanently covers the picture. */\n  .genImgWrap .imageBtnBar {\n    position:absolute; left:8px; right:8px; bottom:8px; z-index:6;\n    display:flex; flex-direction:column; align-items:stretch; gap:2px;\n    background:rgba(12,12,16,0.92); border:1px solid rgba(255,255,255,0.18);\n    border-radius:10px; padding:4px;\n    opacity:0; visibility:hidden; transform:translateY(8px); pointer-events:none;\n    transition:opacity .14s ease, transform .14s ease, visibility 0s linear .14s;\n  }\n  .genImgWrap:hover .imageBtnBar, .genImgWrap:focus-within .imageBtnBar {\n    opacity:1; visibility:visible; transform:none; pointer-events:auto;\n    transition-delay:.35s;\n  }\n  .genImgWrap.menu-open .imageBtnBar {\n    opacity:1; visibility:visible; transform:none; pointer-events:auto;\n    transition-delay:0s;\n  }\n  /* Small images clip the tall menu: the wrap carries inline overflow:hidden AND the\n     image container sets overflow-y:hidden, so a shrunken picture would cut off the\n     menu's upper buttons and leave them untappable. While open, unclip both ancestors\n     so the menu overflows above the image, capped to the viewport with its own scroll. */\n  .genImgWrap.menu-open { overflow:visible !important; }\n  /* NOTE: !important is required here — the container's overflow comes from an inline\n     style, and without it `visible` computes to `auto` (still clipping the menu). */\n  .generated-image-container:has(.genImgWrap.menu-open) { overflow:visible !important; }\n  .genImgWrap.menu-open .imageBtnBar {\n    max-height:min(70vh, 420px); overflow-y:auto;\n    overscroll-behavior:contain; touch-action:pan-y;\n  }\n  .imageBtnBar button, .imageBtnBar .cloud-saved-badge {\n    font-size:13px; line-height:1.3; text-align:left; white-space:nowrap;\n    padding:8px 10px; border-radius:7px; border:0;\n    background:transparent; color:#fff; cursor:pointer;\n  }\n  .imageBtnBar button:hover { background:rgba(255,255,255,0.14); }\n  .imageBtnBar button:disabled { opacity:0.55; cursor:default; }\n  .imageBtnBar .cloud-saved-badge { cursor:default; }\n  .imageMenuHandle {\n    position:absolute; bottom:6px; left:50%; transform:translateX(-50%); z-index:5;\n    font-size:12px; line-height:1; padding:4px 14px 7px; border-radius:999px;\n    border:1px solid rgba(255,255,255,0.35);\n    background:rgba(0,0,0,0.6); color:#fff; cursor:pointer;\n  }\n  .genImgWrap:hover .imageMenuHandle, .genImgWrap.menu-open .imageMenuHandle { background:rgba(0,0,0,0.85); }\n  .imageReproduceRow { display:contents; }\n  .reproduce-generated-image-button { }\n  .generated-image-container img { max-width:var(--img-max,var(--chat-img-max,450px)); max-height:var(--img-max,var(--chat-img-max,450px)); }\n  .generated-image-container:has(iframe) { zoom:calc(var(--img-max,var(--chat-img-max,450px)) / 450px); }\n  /* ☑ select-messages button — matches the keep-all-images button it sits next to */\n  #shortcutButtonsCtn #selectMessagesShortcutBtn {\n    cursor:pointer;\n    border:1px solid var(--button-border-color);\n    background:transparent;\n    border-radius:var(--border-radius);\n    max-height:1.5rem;\n    display:inline-flex; align-items:center; justify-content:center;\n    font-size:var(--button-font-size);\n    padding-left:0.3rem; padding-right:0.3rem;\n    color:inherit;\n  }\n  /* 📌 pin bar — sits in the bottom shortcut row, immediately after ☑ select messages (the same\n     `#shortcutButtonsCtn button:not(:first-child)` spacing rule would otherwise double up with the\n     bar's own flex gap) */\n  #shortcutButtonsCtn .cuPinBar button:not(:first-child) {\n    margin-left:0;\n  }\n  \n  #threadOptionsPopup button {\n    padding-top: 0.25rem;\n    padding-bottom: 0.25rem; \n  }\n\n  /* typing indicator from https://codepen.io/arthak/pen/rmqvgo */\n  .tiblock { align-items: center; display: flex; height: 17px; }\n  .ticontainer{ display: inline-block; }\n  .ticontainer .tidot { background-color: #90949c;  }\n  .tidot { animation: mercuryTypingAnimation 1.5s infinite ease-in-out; border-radius: 2px; display: inline-block; height: 4px; margin-right: 2px; width: 4px; }\n  @keyframes mercuryTypingAnimation{ 0%{ -webkit-transform:translateY(0px); transform:translateY(0px); } 28% { transform:translateY(-5px); } 44%{ transform:translateY(0px); } } .tidot:nth-child(1){ animation-delay:200ms; } .tidot:nth-child(2){ animation-delay:300ms; } .tidot:nth-child(3){ animation-delay:400ms; }\n  \n  \n  @keyframes rotate {\n    to { transform: rotate(360deg); }\n  }\n  \n  .rotate-jiggle {\n    animation: rotate-jiggle 0.2s infinite;\n    transform: rotate(-1deg);\n  }\n  @keyframes rotate-jiggle {\n    0% { transform: rotate(-1deg); }\n    50% { transform: rotate(1deg); }\n  }\n\n  /* ============================================================================\n     PERCHANCE EDIT — visual polish layer.\n     A tasteful, theme-agnostic layer on top of the stock styles: everything here\n     is driven by the existing theme variables, so it works with every preset and\n     every per-chat theme (and with light/dark). See src/README.md → \"Visual\n     polish\" for the rationale. Nothing here changes behaviour, ids or structure.\n     ========================================================================== */\n  :root { --ui-ease: cubic-bezier(.4, 0, .2, 1); }\n\n  body {\n    -webkit-font-smoothing: antialiased;\n    -moz-osx-font-smoothing: grayscale;\n    /* a modern native-UI font stack instead of the bare `sans-serif` default\n       (the UI editor's font-family setting overrides this with !important) */\n    font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"Noto Sans\", sans-serif;\n    /* a barely-there wash so the flat canvas has some depth (a theme's own page\n       background overrides this with !important) */\n    background-image:\n      radial-gradient(120% 80% at 12% -8%, rgba(120,150,255,.10), transparent 55%),\n      radial-gradient(110% 80% at 100% 0%, rgba(170,120,255,.08), transparent 50%);\n    background-repeat: no-repeat;\n  }\n  ::selection { background: rgba(110,150,255,.35); }\n\n  /* ---- buttons: comfortable padding, hover lift, press feedback, focus ring ---- */\n  button {\n    padding: .3rem .6rem;\n    line-height: 1.25;\n    transition: background-color .16s var(--ui-ease), border-color .16s var(--ui-ease),\n                color .16s var(--ui-ease), box-shadow .16s var(--ui-ease), transform .05s var(--ui-ease);\n  }\n  @media (hover: hover) and (pointer: fine) {\n    button:hover { box-shadow: 0 1px 3px rgba(0,0,0,.16); }\n  }\n  button:active { transform: translateY(1px); box-shadow: none; }\n  button:focus-visible,\n  textarea:focus-visible,\n  input:focus-visible,\n  select:focus-visible,\n  [tabindex]:focus-visible {\n    outline: 2px solid var(--link-color);\n    outline-offset: 2px;\n  }\n\n  /* ---- fields: a soft accent focus ring ---- */\n  textarea,\n  input[type=\"text\"], input[type=\"password\"], input[type=\"email\"],\n  input[type=\"number\"], input[type=\"search\"], input:not([type]), select {\n    transition: border-color .16s var(--ui-ease), box-shadow .16s var(--ui-ease);\n  }\n  textarea:focus,\n  input[type=\"text\"]:focus, input[type=\"password\"]:focus, input[type=\"email\"]:focus,\n  input[type=\"number\"]:focus, input[type=\"search\"]:focus, input:not([type]):focus,\n  select:focus {\n    border-color: var(--link-color);\n    box-shadow: 0 0 0 3px rgba(110,150,255,.18);\n    outline: none;\n  }\n\n  /* ---- the left column reads as its own surface ---- */\n  #leftColumn {\n    background: var(--box-color);\n    border-right: 1px solid var(--border-color);\n  }\n  /* The app's own (legacy) option rows are non-wrapping flex rows, so during the first\n     moments of a page load — before appmenu.js re-groups them — they were wider than the\n     270px column and spilled out to the right, behind the chat column, where those buttons\n     were hidden and unclickable. Let those rows wrap and their buttons shrink so the column\n     can never overflow. The left menu (#amSidebarRow) and the ☰/✏️ row are deliberately left\n     out of this: they always fit on one line, and their layout is exactly as it has always\n     been — restored on user request. */\n  #appOptions > div:not(.amRow):not(#amSidebarActions):not(#amSidebarEditor),\n  #upperMenuCtn > div { flex-wrap: wrap; }\n  #appOptions .appOptionButton { min-width: 0; }\n  /* The left menu keeps the app's own tight button metrics: the roomier global `button`\n     padding above deliberately does NOT apply inside it, so the strip under the character\n     list stays as compact as it has always been. `:where()` keeps this rule at the lowest\n     specificity, so every button's own padding rule still wins. */\n  :where(#amSidebarRow, #amSidebarActions) button { padding: 0.125rem; }\n  /* The ☰ \"All options & features\" button owns its own full-width row, with the ✏️ edit and\n     ❓ guide buttons on the line beneath it — the left menu's long-standing shape, kept when\n     the strip was put back to its original layout. */\n  #amSidebarActions { flex-wrap: wrap; }\n  #amSidebarActions > #amMenuButton { flex: 1 1 100%; width: 100%; }\n\n  /* ---- cards / threads: gentle lift + a clear selected state ---- */\n  #chatThreads .thread, #chatThreads .threadFolder, #characterSelection .character {\n    transition: background-color .16s var(--ui-ease), border-color .16s var(--ui-ease),\n                box-shadow .16s var(--ui-ease);\n  }\n  @media (hover: hover) and (pointer: fine) {\n    #chatThreads .thread:hover, #chatThreads .threadFolder:hover, #characterSelection .character:hover {\n      box-shadow: 0 2px 8px rgba(0,0,0,.14);\n    }\n  }\n  #chatThreads .thread.selected {\n    box-shadow: inset 3px 0 0 var(--selected-thread-border-color);\n  }\n\n  /* ---- character / folder grids: a touch more breathing room ---- */\n  #characterList, #starterCharacterList, #characterFoldersList { grid-gap: .75rem; }\n\n  /* ---- messages: roomier text + a hover tint so the action buttons have a home ---- */\n  #messageFeed .message { margin-top: .6rem; margin-bottom: .6rem; }\n  #messageFeed .messageText { line-height: 1.55; }\n  #messageFeed .message .messageWrap {\n    padding: .3rem .5rem;\n    border-radius: var(--border-radius);\n    transition: background-color .16s var(--ui-ease);\n  }\n  @media (hover: hover) and (pointer: fine) {\n    #messageFeed .message:hover .messageWrap { background: rgba(127,127,127,.08); }\n  }\n  #messageFeed .message .avatar { box-shadow: 0 1px 3px rgba(0,0,0,.16); }\n\n  /* ---- floating windows / pop-ups ---- */\n  .window { box-shadow: 0 14px 40px rgba(0,0,0,.34) !important; }\n  .window > .header { background: var(--box-color); }\n\n  /* ---- notifications ---- */\n  #topNotificationContent { box-shadow: 0 6px 20px rgba(0,0,0,.28); font-weight: 600; }\n\n  /* ---- respect the OS \"reduce motion\" setting ---- */\n  @media (prefers-reduced-motion: reduce) {\n    * {\n      animation-duration: .01ms !important;\n      animation-iteration-count: 1 !important;\n      transition-duration: .01ms !important;\n    }\n    button:active { transform: none; }\n  }\n\n\n/* ===== block ===== */\n\n\n    #upperMenuTrigger { display:none; }\n    #leftColumn.upperMenuAutoHide #upperMenuCtn {\n      position:absolute; top:0; left:0; right:0; z-index:5;\n      padding:0.5rem 0.5rem 0;\n      background:var(--background);\n      border-bottom:1px solid var(--border-color);\n      box-shadow:0 2px 8px rgba(0,0,0,0.25);\n      transform:translateY(-100%);\n      transition:transform 0.22s ease;\n    }\n    #leftColumn.upperMenuAutoHide #upperMenuCtn.upperMenuOpen { transform:translateY(0); }\n    #leftColumn.upperMenuAutoHide #upperMenuTrigger { display:block; cursor:pointer; }\n    #leftColumn.upperMenuAutoHide #upperMenuTrigger:hover > div,\n    #leftColumn.upperMenuAutoHide #upperMenuTrigger.upperMenuOpen > div { background:rgba(128,128,128,0.7); }\n    #messageFeedTopMenuTrigger { display:none; }\n    #messageFeed.feedTopMenuAutoHide #messageFeedTopMenuTrigger { display:block; cursor:pointer; }\n    #messageFeed.feedTopMenuAutoHide #messageFeedTopMenuTrigger:hover > div,\n    #messageFeed.feedTopMenuAutoHide #messageFeedTopMenuTrigger.upperMenuOpen > div { background:rgba(128,128,128,0.7); }\n    #messageFeed.feedTopMenuAutoHide #messageFeedTopMenuCtn { max-height:0; overflow:hidden; transition:max-height 0.22s ease; }\n    #messageFeed.feedTopMenuAutoHide #messageFeedTopMenuCtn.upperMenuOpen { max-height:min(72vh, 640px); }\n    /* On touch devices there's no hover, so the pop-down handle must be tappable: make it a bigger target. */\n    @media (hover: none) {\n      #upperMenuTrigger { height:22px !important; }\n      #upperMenuTrigger > div { width:46px !important; height:4px !important; top:7px !important; background:rgba(128,128,128,0.75) !important; }\n      #messageFeedTopMenuTrigger { height:22px !important; }\n      #messageFeedTopMenuTrigger > div { width:46px !important; height:4px !important; top:7px !important; background:rgba(128,128,128,0.75) !important; }\n    }\n    /* PERCHANCE EDIT: keep the quick-buttons menu pinned to the top of the chat viewport so it and its\n       auto-hide strip persist no matter how far you scroll down in the conversation. */\n    #messageFeed > #messageFeedTopMenuWrapper { position:sticky; top:0; z-index:5; background:var(--top-menu-bg, var(--background)); box-shadow:0 1px 0 var(--border-color); }\n    /* PERCHANCE EDIT: also style the quick-buttons container directly, in case it ever sits as a direct feed child (e.g. older moved state) */\n    #messageFeed > #messageFeedTopMenuCtn { background:var(--top-menu-bg, var(--background)); }\n  \n\n/* ===== block ===== */\n\n\n        @media screen and (max-width: 630px) {\n          #createCharacterAreaCtn {\n            padding-left: 3rem; \n          }\n        }\n      \n\n/* ===== block ===== */\n\n\n        #nexGrid { display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:0.75rem; }\n        .nexCard { background:var(--box-color); border:1px solid var(--border-color); border-radius:12px; overflow:hidden; display:flex; flex-direction:column; }\n        .nexThumb { position:relative; aspect-ratio:3/4; background:#222; overflow:hidden; }\n        .nexThumb img { width:100%; height:100%; object-fit:cover; display:block; }\n        .nexNoImg { width:100%; height:100%; display:grid; place-items:center; font-size:2rem; opacity:0.4; }\n        .nexPills { position:absolute; top:0.35rem; left:0.35rem; display:flex; gap:0.25rem; flex-wrap:wrap; max-width:calc(100% - 0.7rem); }\n        .nexPill { font-size:0.62rem; font-weight:700; padding:0.1rem 0.45rem; border-radius:999px; color:#0c0a14; text-transform:capitalize; }\n        .nexNew { font-size:0.62rem; font-weight:800; padding:0.1rem 0.45rem; border-radius:999px; background:#ff3b5c; color:#fff; text-transform:uppercase; }\n        .nexName { position:absolute; left:0; right:0; bottom:0; padding:1.2rem 0.5rem 0.4rem; font-weight:700; font-size:0.95rem; color:#fff; background:linear-gradient(transparent, rgba(0,0,0,0.85)); }\n        .nexTag { font-size:0.72rem; opacity:0.65; padding:0.35rem 0.5rem; min-height:2.1em; }\n        .nexRow { display:flex; gap:0.4rem; padding:0 0.5rem 0.5rem; }\n        .nexChatBtn { flex:1; background:#7c5cff; color:#fff; border:none; border-radius:999px; padding:0.4rem 0; font-weight:700; cursor:pointer; }\n        .nexChatBtn:disabled { opacity:0.6; }\n        .nexAddBtn { width:2.2rem; border-radius:999px; border:1px solid var(--border-color); background:var(--button-bg); color:var(--text-color); cursor:pointer; font-weight:700; }\n        .nexCatBtn { font-size:0.75rem; padding:0.2rem 0.7rem; border-radius:999px; border:1px solid var(--border-color); background:var(--button-bg); color:var(--text-color); cursor:pointer; text-transform:capitalize; }\n        .nexCatBtn.on { background:#7c5cff; color:#fff; border-color:#7c5cff; }\n        .nexEmpty { grid-column:1/-1; text-align:center; opacity:0.6; padding:2rem 0; }\n      \n\n/* ===== block ===== */\n\n\n        #sdbGrid { display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:0.75rem; }\n        .sdbCard { background:var(--box-color); border:1px solid var(--border-color); border-radius:12px; overflow:hidden; display:flex; flex-direction:column; }\n        .sdbThumb { position:relative; aspect-ratio:3/4; background:#222; overflow:hidden; }\n        .sdbThumb img { width:100%; height:100%; object-fit:cover; display:block; }\n        .sdbNoImg { width:100%; height:100%; display:grid; place-items:center; font-size:2rem; opacity:0.4; }\n        .sdbSrc { position:absolute; top:0.35rem; left:0.35rem; font-size:0.62rem; font-weight:800; padding:0.1rem 0.45rem; border-radius:6px; background:rgba(0,0,0,0.65); color:#fff; }\n        .sdbFav { position:absolute; top:0.25rem; right:0.35rem; background:none; border:none; color:#fff; font-size:1.15rem; cursor:pointer; text-shadow:0 1px 4px rgba(0,0,0,0.8); }\n        .sdbName { position:absolute; left:0; right:0; bottom:0; padding:1.2rem 0.5rem 0.4rem; font-weight:700; font-size:0.95rem; color:#fff; background:linear-gradient(transparent, rgba(0,0,0,0.85)); }\n        .sdbMeta { display:flex; justify-content:space-between; align-items:center; font-size:0.72rem; opacity:0.75; padding:0.3rem 0.5rem 0; }\n        .sdbStars { color:#fbbf24; font-weight:700; }\n        .sdbTags { display:flex; gap:0.25rem; flex-wrap:wrap; padding:0.25rem 0.5rem 0; }\n        .sdbTag { font-size:0.62rem; padding:0.1rem 0.45rem; border-radius:999px; background:rgba(127,127,127,0.25); text-transform:capitalize; }\n        .sdbRow { display:flex; gap:0.4rem; padding:0.4rem 0.5rem 0.5rem; }\n        .sdbChatBtn { flex:1; background:#7c5cff; color:#fff; border:none; border-radius:999px; padding:0.4rem 0; font-weight:700; cursor:pointer; }\n        .sdbChatBtn:disabled { opacity:0.6; }\n        .sdbToggle { padding:0.35rem 0.7rem; border-radius:999px; border:1px solid var(--border-color); background:var(--button-bg); color:var(--text-color); cursor:pointer; font-weight:700; }\n        .sdbToggle.on { background:#7c5cff; color:#fff; border-color:#7c5cff; }\n        .sdbEmpty { grid-column:1/-1; text-align:center; opacity:0.6; padding:2rem 0; }\n      ";

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
