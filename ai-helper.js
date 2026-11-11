/* ===== 🤖 AI Helper tab =====================================================
   Penjelasan semua tools + bantuan prompting (ID/EN).
   - Direktori tools: kartu tiap tool (klik Buka / Tanya AI).
   - AI chat (root.generateText): jawab soal tools + bantu racik prompt.
   - Pembangun cepat: 🧑 Persona Brief + 🎨 Prompt Gambar (output EN, chat boleh ID).
   - Output AI dengan blok ---PROMPT--- / ---PERSONA--- dirender jadi kartu aksi:
     [Pakai di …] [▸ Kirim ke…] [📋] [📚 Vault]

   Lazy-loaded via ensureHelper() di index.html → window.__helperOnShow().
   Idempoten: render ulang aman (guard __helperBuilt + host check).
   =========================================================================== */
(function () {
  "use strict";
  if (window.__helperLoading) return;
  window.__helperLoading = true;

  var LS_HIST = "t2iHelperHist_v1";
  var LS_LANG = "t2iHelperLang";
  var KEEP = 12;

  /* ---------------- katalog tools (prefix-cache friendly: statis) ---------- */
  // promptKind: "image" | "persona" | "photo" | "story" | null (tanpa bantuan prompt)
  var TOOLS = [
    { id: "home", ico: "🏠", name: "Home", grp: "Start", promptKind: null,
      desc_id: "Dashboard awal: contoh sekali-klik, tool yang lagi trending, progres explorer, dan karya terbarumu.",
      desc_en: "Start dashboard: one-tap examples, trending tools, explorer progress and your latest work.",
      use_id: ["Klik contoh ⚡ untuk mengisi tool dengan contoh jadi", "Pakai 🔎 filter untuk cari tool (mis. 'anime', 'cbz')", "Cek 'Your stuff' untuk Vault / Roster / backup"],
      tip_id: null,
      use_en: ["Click an ⚡ example to load a tool with a ready-made example", "Use the 🔎 filter to find tools (e.g. 'anime', 'cbz')", "Check 'Your stuff' for Vault / Roster / backups"],
      tip_en: null },
    { id: "gen", ico: "🎨", name: "Image Generator", grp: "Create", promptKind: "image",
      desc_id: "Tulis deskripsi → jadi gambar. Tool utama teks-ke-gambar, dengan Simple / Basic / Advanced + Style Mixer.",
      desc_en: "Write a description → get an image. The main text-to-image tool with Simple / Basic / Advanced modes.",
      use_id: ["Isi 📝 Description (boleh Bahasa Indonesia, tapi Inggris hasil terbaik)", "Pilih art style + 🎲 bila bingung, atur jumlah gambar", "Klik generate, lalu simpan yang bagus ke 📚 Vault / 🖼️ Gallery"],
      tip_id: "Sebut subjek + penampilan + pose + latar + lighting + mood + angle kamera. Contoh: 'a tired barista with silver-streaked hair, wiping a glass, cozy rainy cafe, warm lamp light, cinematic close-up'.",
      use_en: ["Fill in 📝 Description (English gives the best results)", "Pick an art style + 🎲 if unsure, set the image count", "Hit generate, then save the good ones to 📚 Vault / 🖼️ Gallery"],
      tip_en: "Name subject + looks + pose + background + lighting + mood + camera angle. Example: 'a tired barista with silver-streaked hair, wiping a glass, cozy rainy cafe, warm lamp light, cinematic close-up'." },
    { id: "evo", ico: "🧬", name: "Prompt Evolution", grp: "Create", promptKind: "image",
      desc_id: "Vote gambar terbaik, prompt pemenang 'dikawinkan' otomatis jadi varian yang lebih bagus. Darwin buat JPEG.",
      desc_en: "Vote the best images and winning prompts breed better variants automatically.",
      use_id: ["Tulis ide awal di kotak idea", "Generate satu generasi, vote favoritmu", "Evolve → vote lagi sampai puas, kirim pemenang ke Image Generator"],
      tip_id: "Mulai dari ide pendek yang jelas, biarkan evolusi yang memperkaya detailnya.",
      use_en: ["Type your starting idea in the idea box", "Generate one generation, vote your favourite", "Evolve → vote again until happy, send the winner to Image Generator"],
      tip_en: "Start from a short, clear idea and let evolution enrich the details." },
    { id: "gallery", ico: "🖼️", name: "Personal Gallery", grp: "Create", promptKind: null,
      desc_id: "Semua gambarmu yang disimpan, besar-besar — cari, filter, favoritkan, dan kirim prompt-nya ke tool lain.",
      desc_en: "Your saved images, large — search, filter, favourite and reuse prompts.",
      use_id: ["Gambar dari Image Generator bisa auto-save ke sini", "Klik gambar untuk prompt + kirim ke tool lain", "Hapus / favorit dari kartunya"],
      tip_id: null,
      use_en: ["Images from Image Generator can auto-save here", "Click an image for its prompt + send it to other tools", "Delete / favourite from its card"],
      tip_en: null },
    { id: "explore", ico: "🌐", name: "Explore", grp: "Create", promptKind: "image",
      desc_id: "Jelajahi galeri publik — simpan salinan privat ke Gallery-mu atau caption gambarnya di Image to Prompt.",
      desc_en: "Browse public galleries — save a private copy or caption any image.",
      use_id: ["Cari / scroll feed publik", "Save = salinan privat (tidak repost ke publik)", "Caption = kirim ke Image to Prompt untuk dibaca prompt-nya"],
      tip_id: "Lihat prompt gambar yang kamu suka, modifikasi 2-3 kata, jadikan milikmu.",
      use_en: ["Search / scroll the public feed", "Save = a private copy (never reposts publicly)", "Caption = send to Image to Prompt to read its prompt"],
      tip_en: "Look at the prompt of an image you like, change 2–3 words, make it yours." },
    { id: "comm", ico: "🖼️", name: "Community", grp: "Create", promptKind: null,
      desc_id: "Upload berbagi + prompt-nya — feed SFW dan feed NSFW 18+ yang digate.",
      desc_en: "Shared uploads with prompts — SFW plus the gated 18+ NSFW feed.",
      use_id: ["Lihat feed SFW / NSFW (NSFW perlu gate umur)", "📤 Post dari Personal Gallery", "👍/👎 untuk kurasi pribadimu"],
      tip_id: null,
      use_en: ["Browse the SFW / NSFW feeds (NSFW needs the age gate)", "📤 Post from your Personal Gallery", "👍/👎 for your personal curation"],
      tip_en: null },
    { id: "forge", ico: "🧪", name: "Style Forge", grp: "Create", promptKind: "image",
      desc_id: "Ubah gambar referensi jadi art style reusable — forge, edit, evolve, export.",
      desc_en: "Turn reference images into reusable art styles.",
      use_id: ["Kumpulkan gambar referensi (drop/browse/paste/zip)", "Analyze → Forge satu style bersama", "Kirim ke 🎨 Custom Art Styles di Image Generator"],
      tip_id: "Pakai 3-8 referensi yang gayanya konsisten (bukan subjeknya) agar style-nya bersih.",
      use_en: ["Collect reference images (drop/browse/paste/zip)", "Analyze → Forge one shared style", "Send it to 🎨 Custom Art Styles in Image Generator"],
      tip_en: "Use 3–8 references with a consistent STYLE (not subject) for a clean style." },
    { id: "story", ico: "📖", name: "Light Novel Maker", grp: "Create", promptKind: "story",
      desc_id: "Bikin cerita — Futaverse embedded + catatan lokal.",
      desc_en: "Make stories — embedded Futaverse plus local notes.",
      use_id: ["Buka tool, tulis premis / pilih lanjutan", "Generate bab per bab", "Simpan catatan / copy ke Vault"],
      tip_id: "Beri premis 2-3 kalimat: tokoh + tujuan + halangan + twist yang kamu mau.",
      use_en: ["Open the tool, write a premise / pick a continuation", "Generate chapter by chapter", "Save notes / copy to Vault"],
      tip_en: "Give a 2–3 sentence premise: character + goal + obstacle + the twist you want." },
    { id: "listings", ico: "📋", name: "Generator Listings", grp: "Create", promptKind: null,
      desc_id: "Jelajahi daftar generator — nexora-rug, embedded di studio.",
      desc_en: "Browse generator listings, embedded in the studio.",
      use_id: ["Cari generator / kategori", "Buka yang menarik di tab baru", "Kembali ke sini untuk lanjut kerja"],
      tip_id: null,
      use_en: ["Search generators / categories", "Open interesting ones in a new tab", "Come back here to keep working"],
      tip_en: null },
    { id: "i2p", ico: "🖼️", name: "Image to Prompt", grp: "Photos", promptKind: "photo",
      desc_id: "Upload foto → dapat prompt siap pakai (vision captioning). Tunjukkan foto, dia kasih tahu magic words-nya.",
      desc_en: "Upload a photo → get a ready-to-use prompt back.",
      use_id: ["Drop / browse / paste gambar (bisa beberapa sekaligus)", "Pilih 🎯 Caption type + 📏 Length", "✨ Generate → 📚 Vault / ▸ kirim ke Image Generator"],
      tip_id: "Minta fokus spesifik di ✍️ Focus, mis. 'describe the lighting and fabric in detail'.",
      use_en: ["Drop / browse / paste images (several at once is fine)", "Pick 🎯 Caption type + 📏 Length", "✨ Generate → 📚 Vault / ▸ send to Image Generator"],
      tip_en: "Ask for a specific focus in ✍️ Focus, e.g. 'describe the lighting and fabric in detail'." },
    { id: "aiedit", ico: "✨", name: "AI Photo Editor", grp: "Photos", promptKind: "photo",
      desc_id: "Jelaskan perubahan dengan kata-kata, AI me-recreate fotomu seperti itu. Photoshop tapi kamu tinggal vibe.",
      desc_en: "Describe a change in plain words and the AI re-creates your photo.",
      use_id: ["Upload foto", "Tulis instruksi edit ('ganti background jadi pantai sunset')", "Generate → bandingkan → simpan yang cocok"],
      tip_id: "Satu instruksi = satu perubahan. 'Ganti X jadi Y, pertahankan Z' paling aman.",
      use_en: ["Upload a photo", "Write the edit instruction ('change the background to a sunset beach')", "Generate → compare → save the one that fits"],
      tip_en: "One instruction = one change. 'Change X to Y, keep Z' is safest." },
    { id: "edit", ico: "🖌️", name: "Image Editor", grp: "Photos", promptKind: null,
      desc_id: "Editor gambar normal di browser: crop, filter, teks, export. Yang bertanggung jawab.",
      desc_en: "A normal in-browser image editor: crop, filters, text, export.",
      use_id: ["Upload gambar", "Crop / filter / rotate / tambah teks", "Export PNG/JPG"],
      tip_id: null,
      use_en: ["Upload an image", "Crop / filter / rotate / add text", "Export PNG/JPG"],
      tip_en: null },
    { id: "comic", ico: "📚", name: "Comic Scanner", grp: "Stories", promptKind: "story",
      desc_id: "Drop file .cbz → jadi sinopsis + transkrip + profil karakter (bahasa apa pun, bisa diterjemahkan).",
      desc_en: "Drop a .cbz comic → story synopsis, transcript and character profiles.",
      use_id: ["Drop file .cbz", "Tunggu AI baca + rangkum", "Pakai profil karakter untuk Persona / Chat"],
      tip_id: "Minta 'fokus ke karakter X: penampilan, sifat, arc' untuk hasil siap-pakai ke Persona.",
      use_en: ["Drop a .cbz file", "Wait for the AI to read + summarize", "Use the character profiles for Persona / Chat"],
      tip_en: "Ask it to 'focus on character X: looks, traits, arc' for Persona-ready results." },
    { id: "persona", ico: "🧑", name: "Persona Generator", grp: "Stories", promptKind: "persona",
      desc_id: "Bangun karakter roleplay yang dalam — dari gambar + prompt galerimu, atau dari nol. Adopsi blorbo!",
      desc_en: "Build deep roleplay-ready characters — from gallery images or from scratch.",
      use_id: ["Ceritakan brief karakter (atau import gambar referensi)", "Atur tone, depth, gender, genre, hubungan-dengan-user", "✨ Generate → chat / portrait / roster / share"],
      tip_id: "Brief bagus = nama + usia + penampilan kunci + 3 sifat + 1 luka/masa lalu + tujuan + cara bicara. Lihat pembangun 🧑 di bawah — AI Helper bisa meraciknya dari keinginanmu (boleh Bahasa Indonesia)!",
      use_en: ["Describe your character brief (or import a reference image)", "Set tone, depth, gender, genre, relationship-to-user", "✨ Generate → chat / portrait / roster / share"],
      tip_en: "A good brief = name + age + key looks + 3 traits + 1 wound/past + goal + speech style. See the 🧑 builder below — the AI Helper can draft it from your wishes!" },
    { id: "board", ico: "🎭", name: "Persona Board", grp: "Stories", promptKind: "persona",
      desc_id: "Persona buatan studio ini, dibagikan semua orang — download atau ajak chat.",
      desc_en: "Community personas — download them or chat with them.",
      use_id: ["Scroll / cari persona komunitas", "Download / copy deskripsinya", "Kirim ke AI Chat untuk ngobrol"],
      tip_id: "Download yang vibe-nya 70% cocok, lalu tweak 30% di Persona Generator agar jadi milikmu.",
      use_en: ["Scroll / search community personas", "Download / copy their description", "Send to AI Chat to talk to them"],
      tip_en: "Download one that's 70% the vibe, then tweak the other 30% in Persona Generator to make it yours." },
    { id: "chat", ico: "💬", name: "AI Chat", grp: "Stories", promptKind: "persona",
      desc_id: "AI Chat tampilan klasik, otak lokal — ingatan jangka panjang + sikap yang berkembang. Mereka tidak pernah tidur.",
      desc_en: "Classic-look AI chat with local brain — long-term memory, evolving attitude.",
      use_id: ["Buka tool, pilih / buat karakter", "Ngobrol, atur memori / lorebook bila ada", "Persona dari Persona Generator bisa dikirim langsung ke sini (🎯)"],
      tip_id: "Karakter yang 'hidup' = 3 sifat kontradiktif + 1 rahasia + cara bicara yang khas. Minta Helper buatkan!",
      use_en: ["Open the tool, pick / create a character", "Chat, set memory / lorebook if available", "Personas from Persona Generator can be sent straight here (🎯)"],
      tip_en: "A character that feels 'alive' = 3 contradictory traits + 1 secret + a distinctive speech style. Ask the Helper to make one!" },
    { id: "chatlite", ico: "💬", name: "AI Chat Lite", grp: "Stories", promptKind: "persona",
      desc_id: "AI chat versi original yang ringan (ai-character-chat). Diet chat, rasa tetap enak.",
      desc_en: "The original lightweight character chat.",
      use_id: ["Sama seperti AI Chat tapi lebih ringan", "Cocok untuk HP / koneksi lambat", "Ganti ke AI Chat bila butuh memori jangka panjang"],
      tip_id: null,
      use_en: ["Same as AI Chat but lighter", "Great for phones / slow connections", "Switch to AI Chat when you need long-term memory features"],
      tip_en: null },
    { id: "world", ico: "🌍", name: "Living World", grp: "Stories", promptKind: null,
      desc_id: "Bangun lore lalu hidup di dalamnya: ngobrol dengan cast, pindah lokasi, atau jadi dewa pengatur takdir.",
      desc_en: "Build a lore then live in it: chat with the cast, move around, or rule as a god.",
      use_id: ["Isi form dunia (nama, genre, bahasa — bahasa DIKUNCI)", "Tambah 4-6 karakter / import dari Roster", "Ngobrol sebagai player, atau buka mode Dewa untuk kehendak + timeline"],
      tip_id: "Klik karakter untuk fokus ngobrol — yang satu lokasi bisa nimbrung sendiri.",
      use_en: ["Fill the world form (name, genre, language — language gets LOCKED)", "Add 4-6 characters / import from the Roster", "Chat as a player, or open God mode for commands + timeline"],
      tip_en: "Click a character to focus — others in the same location may join in on their own." },

    { id: "links", ico: "🔗", name: "Media to Links", grp: "More", promptKind: null,
      desc_id: "Ubah file apa pun jadi link: gambar, video, audio, GIF, SVG, teks → URL permanen yang bisa dibagikan.",
      desc_en: "Turn any file into a shareable link.",
      use_id: ["Drop file", "Tunggu upload selesai", "Copy link-nya"],
      tip_id: null,
      use_en: ["Drop a file", "Wait for the upload to finish", "Copy its link"],
      tip_en: null },
    { id: "social", ico: "👥", name: "Social DB", grp: "More", promptKind: "persona",
      desc_id: "Database karakter & lorebook Social DB — cari cast roleplay berikutnya.",
      desc_en: "Character & lorebook database — find your next roleplay cast.",
      use_id: ["Cari karakter / lorebook", "Buka detailnya", "Copy ke Persona Generator untuk diperdalam"],
      tip_id: null,
      use_en: ["Search characters / lorebooks", "Open the details", "Copy into Persona Generator to deepen them"],
      tip_en: null },
    { id: "theme", ico: "🎨", name: "Theme Studio", grp: "More", promptKind: null,
      desc_id: "Restyle seluruh studio: preset warna, aksen per-tool, radius, font, motion.",
      desc_en: "Restyle the whole studio: colours, per-tab accents, radius, font, motion.",
      use_id: ["Pilih preset / theme pack", "Klik bagian mana pun untuk color wheel", "Semua tersimpan di browser ini"],
      tip_id: null,
      use_en: ["Pick a preset / theme pack", "Click any part for the colour picker", "Everything is saved in this browser"],
      tip_en: null },
    { id: "credits", ico: "📜", name: "Credits", grp: "More", promptKind: null,
      desc_id: "Semua generator, plugin, library & layanan yang dipakai studio ini.",
      desc_en: "Every generator, plugin, library and service this studio is built on.",
      use_id: ["Buka bila penasaran 'ini dibuat pakai apa?'", "Klik link ke sumber aslinya", "Kembali via Home"],
      tip_id: null,
      use_en: ["Open it when wondering 'what is this built with?'", "Follow the links to the original sources", "Head back via Home"],
      tip_en: null },
    { id: "helper", ico: "🤖", name: "AI Helper", grp: "More", promptKind: null,
      desc_id: "Kamu di sini! Penjelasan semua tools + AI yang bantuin prompting (gambar, persona, foto, cerita).",
      desc_en: "You are here! Explains every tool + AI prompt help (image, persona, photo, story).",
      use_id: ["Cari tool di direktori bawah", "Tanya AI di chat (boleh Bahasa Indonesia)", "Pakai pembangun 🧑 Persona / 🎨 Gambar untuk hasil siap-kirim"],
      tip_id: null,
      use_en: ["Search tools in the directory below", "Ask the AI in chat (any language)", "Use the 🧑 Persona / 🎨 Image builders for send-ready results"],
      tip_en: null }
  ];

  var STR = {
    id: {
      heroSub: "Bingung tool ini buat apa? Tanya di sini (boleh Bahasa Indonesia). Butuh prompt persona / gambar? Ceritakan maumu, biar AI yang meracik — hasil akhir selalu Bahasa Inggris biar model gambar / chat paling paham.",
      searchPh: "Cari tool… mis. 'persona', 'foto', 'chat', 'upload'",
      open: "Buka",
      askAI: "Tanya AI",
      builderPersona: "🧑 Pembangun Persona",
      builderImage: "🎨 Pembangun Prompt Gambar",
      chatTitle: "💬 Tanya AI Helper",
      chatSub: "Soal tools & prompting — jawab Bahasa Indonesia / English ikut bahasamu",
      chatPh: "Tanya… mis. 'jelasin Persona Generator' / 'bikinin aku villain cyberpunk, cewek, sarkastik'",
      reset: "↻ Baru",
      resetConfirm: "Mulai percakapan baru? AI akan melupakan seluruh konteks chat ini.",
      resetDone: "🆕 Percakapan baru dimulai — AI lupa konteks lama",
      resetEmpty: "Masih baru — belum ada yang perlu di-reset",
      send: "➤",
      usePersona: "Pakai di Persona ✓",
      useGen: "Pakai di Image Generator ✓",
      sendTo: "▸ Kirim ke…",
      saveVault: "📚 Vault",
      copy: "📋 Salin",
      howToUse: "Cara pakai",
      promptTip: "Tips prompt",
      askFirst: "Contoh cepat — klik untuk tanya:",
      pName: "Nama (opsional)",
      pGender: "Gender",
      pAge: "Usia",
      pTraits: "Sifat / kepribadian (bebas, boleh Indonesia)",
      pTraitsPh: "mis. sarkastik tapi penyayang, takut badai, mantan pilot…",
      pGenre: "Genre / latar",
      pRel: "Hubungan dengan user",
      pMake: "✨ Buatkan brief persona",
      iWant: "Ceritakan maumu (boleh Bahasa Indonesia)",
      iWantPh: "mis. ksatria kucing gemuk di pasar malam neon, hujan, sinematik…",
      iStyle: "Gaya",
      iMake: "✨ Buatkan prompt gambar",
      working: "⏳ AI lagi mikir…",
      needText: "Isi dulu ya 👆",
      readyPersona: "Brief persona siap — cek kartu di bawah, lalu pakai / kirim.",
      readyImage: "Prompt gambar siap — cek kartu di bawah.",
      langNote: "Final prompt / persona brief selalu Bahasa Inggris (terbaik untuk model). Ngobrolnya boleh Bahasa Indonesia."
    },
    en: {
      heroSub: "Confused what a tool does? Ask here. Need a persona / image prompt? Describe what you want and let the AI draft it — the final prompt is always in English so models understand best.",
      searchPh: "Search tools… e.g. 'persona', 'photo', 'chat', 'upload'",
      open: "Open",
      askAI: "Ask AI",
      builderPersona: "🧑 Persona Builder",
      builderImage: "🎨 Image Prompt Builder",
      chatTitle: "💬 Ask the AI Helper",
      chatSub: "About tools & prompting — replies follow your language",
      chatPh: "Ask… e.g. 'explain Persona Generator' / 'make me a sarcastic cyberpunk villainess'",
      reset: "↻ New",
      resetConfirm: "Start a new conversation? The AI will forget all chat context.",
      resetDone: "🆕 New conversation started — old context forgotten",
      resetEmpty: "Nothing to reset yet",
      send: "➤",
      usePersona: "Use in Persona ✓",
      useGen: "Use in Image Generator ✓",
      sendTo: "Send to…",
      saveVault: "📚 Vault",
      copy: "📋 Copy",
      howToUse: "How to use",
      promptTip: "Prompt tip",
      askFirst: "Quick examples — click to ask:",
      pName: "Name (optional)",
      pGender: "Gender",
      pAge: "Age",
      pTraits: "Traits / personality (free text)",
      pTraitsPh: "e.g. sarcastic but caring, afraid of storms, ex-pilot…",
      pGenre: "Genre / setting",
      pRel: "Relationship to user",
      pMake: "✨ Draft persona brief",
      iWant: "Describe what you want",
      iWantPh: "e.g. a chubby cat knight at a neon night market, rain, cinematic…",
      iStyle: "Style",
      iMake: "✨ Draft image prompt",
      working: "⏳ AI is thinking…",
      needText: "Please fill this in first 👆",
      readyPersona: "Persona brief ready — check the card below, then use / send it.",
      readyImage: "Image prompt ready — check the card below.",
      langNote: "Final prompts / persona briefs are always in English (best for models). Chat in any language."
    }
  };

  function lang() {
    try {
      var v = localStorage.getItem(LS_LANG);
      if (v === "en" || v === "id") return v;
    } catch (e) {}
    return "en"; // default Inggris; pengguna bisa pindah ke Indonesia via toggle
  }
  function setLang(v) {
    try { localStorage.setItem(LS_LANG, v); } catch (e) {}
    render(true);
  }
  function T(k) { return (STR[lang()] || STR.id)[k] || STR.id[k] || k; }

  /* ---------------- helpers ------------------------------------------------ */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function toast(msg) {
    try {
      if (typeof window.vaultToast === "function") { window.vaultToast(msg); return; }
    } catch (e) {}
    try {
      var t = document.createElement("div");
      t.textContent = msg;
      t.setAttribute("style", "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:96000;background:#222;color:#fff;border-radius:999px;padding:.5rem 1rem;font-size:.85rem;box-shadow:0 10px 30px rgba(0,0,0,.5);");
      document.body.appendChild(t);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 1800);
    } catch (e) {}
  }
  function copyText(text, what) {
    function done() { toast((what || "Prompt") + (lang() === "id" ? " disalin 📋" : " copied 📋")); }
    function legacy() {
      try {
        var ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.left = "-9999px";
        document.body.appendChild(ta); ta.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (e) {}
        ta.remove();
        if (ok) done(); else toast("⚠️ copy blocked");
      } catch (e) { toast("⚠️ copy failed"); }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, legacy);
      else legacy();
    } catch (e) { legacy(); }
  }
  function saveVault(text, tags, tab) {
    try {
      if (window.ensureVault) window.ensureVault();
      var tick = 0;
      (function wait() {
        if (window.Vault && window.Vault.add) {
          window.Vault.add(text, { tags: tags || ["ai-helper"], tab: tab || "helper" });
          toast(lang() === "id" ? "📚 tersimpan di Vault" : "📚 saved to Vault");
        } else if (++tick < 40) setTimeout(wait, 250);
        else toast("⚠️ Vault not ready");
      })();
    } catch (e) { toast("⚠️ Vault not ready"); }
  }
  function sendTo(text, opts) {
    try {
      if (window.PromptBridge && window.PromptBridge.sendTo) {
        window.PromptBridge.sendTo(text, opts || { tags: ["ai-helper"] });
        return true;
      }
    } catch (e) {}
    copyText(text, "Prompt");
    return false;
  }
  function applyPersona(text) {
    try {
      if (window.ensurePersona) window.ensurePersona();
      var tick = 0;
      (function wait() {
        if (typeof window.__personaAddPrompt === "function") {
          try { window.__personaAddPrompt(text); } catch (e) {}
          if (window.showTab) window.showTab("persona");
          toast(lang() === "id" ? "🧑 terkirim ke Persona Generator" : "🧑 sent to Persona Generator");
        } else if (++tick < 50) setTimeout(wait, 200);
        else sendTo(text, { to: "persona", tags: ["ai-helper"] });
      })();
      return true;
    } catch (e) { return sendTo(text, { to: "persona" }); }
  }
  function applyGen(text) {
    try {
      if (window.ensureGenExtras) window.ensureGenExtras();
    } catch (e) {}
    return sendTo(text, { to: "gen", tags: ["ai-helper"] });
  }
  function catalogText() {
    return TOOLS.map(function (t) {
      var steps = t.use_en || t.use_id;
      var tip = t.tip_en != null ? t.tip_en : t.tip_id;
      return "- " + t.ico + " " + t.name + " (tab: " + t.id + ", group: " + t.grp + "): " + t.desc_en +
        " Use: " + steps.join(" | ") + (tip ? " Prompt tip: " + tip : "");
    }).join("\n");
  }

  /* ---------------- conversation state (append-only, prefix-cache) --------- */
  var messages = [];
  var summary = "";
  var compacting = false;
  var busy = false;

  function saveHist() {
    try { localStorage.setItem(LS_HIST, JSON.stringify({ m: messages.slice(-40), s: summary })); } catch (e) {}
  }
  function loadHist() {
    try {
      var raw = localStorage.getItem(LS_HIST);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (o && Array.isArray(o.m)) messages = o.m.filter(function (x) { return typeof x === "string"; }).slice(-40);
      if (o && typeof o.s === "string") summary = o.s.slice(0, 4000);
    } catch (e) {}
  }

  var HEADER = [
    "You are the AI Helper inside a free all-in-one AI studio (image generation, photo tools, personas, chat, uploads, themes).",
    "TOOLS (static, authoritative — always prefer this over guessing):",
    catalogText(),
    "Rules:",
    "- Reply in the user's language (Bahasa Indonesia if they write Indonesian, English if English). Keep replies short: 2-5 sentences plus at most 3 follow-up suggestions.",
    "- When explaining a tool: 1 sentence what it is, 3 numbered steps how to use it, 1 pro tip. Name the exact tab (e.g. 'open 🧑 Persona Generator').",
    "- When the user wants an IMAGE prompt: output the final prompt in ENGLISH inside exactly one block: ---PROMPT--- ... ---END--- (2-4 vivid sentences: subject, appearance, pose, outfit, setting, lighting, mood, camera angle). Explanations stay OUTSIDE the block.",
    "- When the user wants a PERSONA/character: output the character brief in ENGLISH inside exactly one block: ---PERSONA--- ... ---END--- (Name; Age/gender; Appearance 2 sentences; Personality 3-4 traits with 1 contradiction; Backstory hook 2 sentences; Speech style 1 sentence; Goal + secret 1 sentence each). Explanations stay OUTSIDE the block.",
    "- VAGUE REQUESTS: vague words (terbuka/open, seksi/sexy, ketat, pendek, transparan, bagus, keren) are NOT drawable. If an IMAGE/PERSONA request is still vague (e.g. 'baju terbuka' without HOW open), do NOT draft yet — ask ONE concrete visual follow-up first with 2-3 mutually distinct concrete options (e.g. not 'terbuka / sangat terbuka' but 'Kemeja 2 kancing dibuka | Off-shoulder | Crop top + jaket terbuka'), then draft after they answer. Only skip questions when the request is already drawable without guessing, or the user explicitly says 'langsung buatkan / buatkan sekarang'.",
    "- Never invent buttons/tabs that are not in TOOLS. If unsure, say what you know + suggest the closest real tool."
  ].join("\n");

  function meta() {
    try {
      if (window.root && window.root.generateText) {
        var m = window.root.generateText({ getMetaObject: true });
        if (m && typeof m.countTokens === "function") return m;
      }
    } catch (e) {}
    return null;
  }
  function buildPrompt(task) {
    var log = [];
    if (summary) log.push("[Summary of earlier conversation:\n" + summary + "]");
    for (var i = 0; i < messages.length; i++) log.push(messages[i]);
    return HEADER + "\n<MESSAGES>\n" + log.join("\n\n") + "\n</MESSAGES>\nTASK: " + task;
  }
  function maybeCompact() {
    if (compacting || messages.length <= KEEP) return;
    var m = meta();
    if (!m) return;
    try {
      if (m.countTokens(buildPrompt("")) < m.idealMaxContextTokens * 0.9) return;
    } catch (e) { return; }
    compacting = true;
    try {
      var n = messages.length - KEEP;
      var boundary = messages[n - 1].slice(-30);
      var p = window.root.generateText(buildPrompt(
        "Summarize the first " + n + ' messages, stopping after the message that ends with "' + boundary +
        '". Fold in the [Summary...] block if present. Terse bullets; keep names, facts, decisions. Output ONLY the summary.'
      ));
      Promise.resolve(p).then(function (res) {
        try {
          summary = String(res && res.text != null ? res.text : res).trim().slice(0, 4000);
          messages = messages.slice(n);
          saveHist();
        } catch (e) {}
        compacting = false;
      }, function () { compacting = false; });
    } catch (e) { compacting = false; }
  }

  var RX_PROMPT = /---PROMPT---\s*([\s\S]*?)(?:---END---|$)/;
  var RX_PERSONA = /---PERSONA---\s*([\s\S]*?)(?:---END---|$)/;
  function extractBlock(text, rx) {
    var m = String(text || "").match(rx);
    if (!m) return "";
    return m[1].replace(/^["'\s]+|["'\s]+$/g, "").trim();
  }
  function stripBlocks(text) {
    return String(text || "")
      .replace(/---PROMPT---[\s\S]*?(---END---|$)/, "")
      .replace(/---PERSONA---[\s\S]*?(---END---|$)/, "").trim();
  }
  function mdLite(text) {
    var h = esc(text);
    h = h.replace(/```([\s\S]*?)```/g, function (_, c) { return "<pre><code>" + c.replace(/^\n/, "") + "</code></pre>"; });
    h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    h = h.replace(/(^|\n)(\d+)\. ([^\n]+)/g, "$1$2. $3");
    h = h.replace(/(?:^|\n)((?:\s*[-*] [^\n]*(?:\n|$))+)/g, function (block) {
      var items = block.trim().split("\n").map(function (l) { return "<li>" + l.replace(/^\s*[-*]\s+/, "") + "</li>"; }).join("");
      return "<ul>" + items + "</ul>";
    });
    h = h.replace(/\n{2,}/g, "<br><br>").replace(/\n/g, "<br>");
    return h;
  }

  /* ---------------- UI ----------------------------------------------------- */
  var CSS = [
    "#helper-root{max-width:1180px;margin:0 auto;padding:.6rem .9rem 2.6rem;text-align:left;font-family:var(--th-font,inherit);}",
    ".hp-hero{border:1px solid var(--th-border);border-radius:16px;padding:1rem 1.1rem;background:var(--th-surface);margin-bottom:.8rem;}",
    ".hp-hero h2{margin:0 0 .3rem;font-size:1.25rem;}",
    ".hp-hero p{margin:.2rem 0 .6rem;font-size:.88rem;line-height:1.55;opacity:.92;}",
    ".hp-lang{display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;}",
    ".hp-lang button{cursor:pointer;border:1px solid var(--th-border);background:transparent;color:inherit;border-radius:999px;padding:.3rem .8rem;font:inherit;font-size:.8rem;}",
    ".hp-lang button.on{background:var(--th-accent);border-color:var(--th-accent);color:var(--th-accent-text);font-weight:700;}",
    ".hp-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:.8rem;align-items:start;}",
    "@media (max-width:980px){.hp-grid{grid-template-columns:1fr;}}",
    ".hp-card{border:1px solid var(--th-border);border-radius:14px;background:var(--th-surface);padding:.8rem .9rem;}",
    ".hp-card h3{margin:0 0 .5rem;font-size:1rem;}",
    ".hp-search{width:100%;box-sizing:border-box;background:var(--th-field);color:inherit;border:1px solid var(--th-border);border-radius:10px;padding:.5rem .7rem;font:inherit;font-size:.86rem;margin-bottom:.6rem;}",
    ".hp-tools{display:flex;flex-direction:column;gap:.5rem;max-height:640px;overflow-y:auto;padding-right:.15rem;}",
    ".hp-tool{border:1px solid var(--th-border);border-radius:11px;padding:.55rem .65rem;background:var(--th-field);}",
    ".hp-tool-top{display:flex;gap:.5rem;align-items:center;}",
    ".hp-tool-ico{font-size:1.2rem;}",
    ".hp-tool-name{font-weight:700;font-size:.88rem;}",
    ".hp-tool-grp{font-size:.68rem;opacity:.6;border:1px solid var(--th-border);border-radius:999px;padding:.05rem .45rem;margin-left:auto;white-space:nowrap;}",
    ".hp-tool-desc{font-size:.8rem;line-height:1.5;opacity:.9;margin:.35rem 0;}",
    ".hp-tool-meta{font-size:.76rem;line-height:1.55;opacity:.85;}",
    ".hp-tool-meta b{opacity:1;}",
    ".hp-tool-row{display:flex;gap:.35rem;margin-top:.45rem;flex-wrap:wrap;}",
    ".hp-btn{cursor:pointer;font:inherit;font-size:.78rem;border-radius:999px;padding:.32rem .75rem;border:1px solid var(--th-accent);background:var(--th-accent);color:var(--th-accent-text);font-weight:700;}",
    ".hp-btn.ghost{background:transparent;color:inherit;border-color:var(--th-border);font-weight:400;}",
    ".hp-btn:disabled{opacity:.55;cursor:default;}",
    ".hp-msgs{display:flex;flex-direction:column;gap:.5rem;max-height:380px;overflow-y:auto;padding:.2rem .1rem .4rem;}",
    ".hp-u{align-self:flex-end;max-width:88%;background:var(--th-accent);color:var(--th-accent-text);border-radius:14px 14px 4px 14px;padding:.5rem .7rem;font-size:.84rem;line-height:1.5;white-space:pre-wrap;word-break:break-word;}",
    ".hp-a{align-self:flex-start;max-width:95%;background:var(--th-field);border:1px solid var(--th-border);border-radius:14px 14px 14px 4px;padding:.55rem .7rem;font-size:.84rem;line-height:1.6;word-break:break-word;}",
    ".hp-a pre{white-space:pre-wrap;font-family:inherit;font-size:.82rem;background:rgba(0,0,0,.18);border-radius:8px;padding:.45rem .6rem;}",
    ".hp-block{margin-top:.5rem;border:1px solid var(--th-accent);border-radius:10px;overflow:hidden;}",
    ".hp-block .hp-blabel{font-size:.68rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;opacity:.85;padding:.35rem .6rem .05rem;}",
    ".hp-block pre{margin:0;padding:.4rem .6rem;font-size:.8rem;line-height:1.55;white-space:pre-wrap;word-break:break-word;font-family:inherit;}",
    ".hp-block .hp-actions{display:flex;gap:.35rem;flex-wrap:wrap;padding:.1rem .5rem .55rem;}",
    ".hp-block .hp-actions button{cursor:pointer;font-size:.75rem;border-radius:999px;padding:.3rem .7rem;border:1px solid var(--th-accent);background:var(--th-accent);color:var(--th-accent-text);font-weight:700;}",
    ".hp-block .hp-actions button.ghost{background:transparent;color:inherit;border-color:var(--th-border);font-weight:400;}",
    ".hp-typing{opacity:.7;}",
    ".hp-typing::after{content:'…';animation:hpBlink 1s infinite;}",
    "@keyframes hpBlink{50%{opacity:0;}}",
    ".hp-chips{display:flex;gap:.35rem;flex-wrap:wrap;margin:.4rem 0;}",
    ".hp-chips button{cursor:pointer;font-size:.74rem;border-radius:999px;border:1px solid var(--th-border);background:transparent;color:inherit;padding:.28rem .65rem;}",
    ".hp-inputrow{display:flex;gap:.45rem;align-items:flex-end;margin-top:.4rem;}",
    ".hp-input{flex:1;min-height:2.6rem;max-height:7rem;resize:vertical;box-sizing:border-box;border-radius:10px;border:1px solid var(--th-border);background:var(--th-field);color:inherit;font:inherit;font-size:.86rem;padding:.5rem .6rem;line-height:1.45;}",
    ".hp-send{cursor:pointer;border:none;border-radius:10px;background:var(--th-accent);color:var(--th-accent-text);font-weight:700;font-size:.95rem;padding:.6rem 1rem;min-height:2.6rem;}",
    ".hp-send:disabled{opacity:.55;}",
    ".hp-form label{display:block;font-size:.76rem;font-weight:700;margin:.5rem 0 .2rem;opacity:.9;}",
    ".hp-form input,.hp-form select,.hp-form textarea{width:100%;box-sizing:border-box;background:var(--th-field);color:inherit;border:1px solid var(--th-border);border-radius:9px;padding:.45rem .6rem;font:inherit;font-size:.84rem;}",
    ".hp-form textarea{resize:vertical;min-height:3rem;}",
    ".hp-form .row2{display:grid;grid-template-columns:1fr 1fr;gap:.5rem;}",
    "@media (max-width:560px){.hp-form .row2{grid-template-columns:1fr;}}",
    ".hp-note{font-size:.72rem;opacity:.65;line-height:1.5;margin-top:.5rem;}",
    ".hp-boot{display:flex;align-items:center;justify-content:center;gap:.6rem;padding:2rem;opacity:.8;}",
    ".hp-chead{display:flex;align-items:center;gap:.5rem;}",
    ".hp-chead h3{margin:0;flex:1;}",
    ".hp-reset{cursor:pointer;font:inherit;font-size:.76rem;font-weight:700;border-radius:999px;border:1px solid var(--th-border);background:transparent;color:inherit;padding:.3rem .7rem;white-space:nowrap;}",
    ".hp-reset:hover{border-color:var(--th-accent);}"
  ].join("\n");

  var builtFor = "";
  function ensureCSS() {
    if ($("hp-css")) return;
    var st = document.createElement("style");
    st.id = "hp-css";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function toolCard(t, L) {
    var d = document.createElement("div");
    d.className = "hp-tool";
    d.setAttribute("data-tool", t.id);
    var desc = lang() === "id" ? t.desc_id : t.desc_en;
    var steps = lang() === "id" ? t.use_id : (t.use_en || t.use_id);
    var tip = lang() === "id" ? t.tip_id : (t.tip_en != null ? t.tip_en : t.tip_id);
    var html = '<div class="hp-tool-top"><span class="hp-tool-ico">' + t.ico + '</span>' +
      '<span class="hp-tool-name">' + esc(t.name) + '</span>' +
      '<span class="hp-tool-grp">' + esc(t.grp) + '</span></div>' +
      '<div class="hp-tool-desc">' + esc(desc) + '</div>' +
      '<div class="hp-tool-meta"><b>' + esc(T("howToUse")) + ':</b> ' + esc(steps.join(" → ")) + '</div>';
    if (tip) html += '<div class="hp-tool-meta"><b>💡 ' + esc(T("promptTip")) + ':</b> ' + esc(tip) + '</div>';
    d.innerHTML = html;
    var row = document.createElement("div");
    row.className = "hp-tool-row";
    var open = document.createElement("button");
    open.type = "button"; open.className = "hp-btn"; open.textContent = "↗ " + T("open");
    open.addEventListener("click", function () { if (window.showTab) window.showTab(t.id); });
    var ask = document.createElement("button");
    ask.type = "button"; ask.className = "hp-btn ghost"; ask.textContent = "💬 " + T("askAI");
    ask.addEventListener("click", function () {
      var q = lang() === "id"
        ? "Jelasin tool " + t.name + " (" + t.id + "): apa fungsinya, cara pakainya langkah per langkah, dan 1 tips biar hasilnya bagus."
        : "Explain the " + t.name + " (" + t.id + ") tool: what it does, step-by-step how to use it, and 1 pro tip.";
      send(q);
      try {
        var el = $("hp-input");
        if (el) el.value = "";
      } catch (e) {}
      try {
        var chat = $("hp-chat-card");
        if (chat) chat.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (e) {}
    });
    row.appendChild(open); row.appendChild(ask);
    if (t.promptKind === "image" || t.promptKind === "persona") {
      var mk = document.createElement("button");
      mk.type = "button"; mk.className = "hp-btn ghost";
      mk.textContent = t.promptKind === "persona" ? "🧑 " + (lang() === "id" ? "Bantu buatkan" : "Help me draft") : "🎨 " + (lang() === "id" ? "Bantu buatkan" : "Help me draft");
      mk.addEventListener("click", function () {
        try {
          var target = t.promptKind === "persona" ? $("hp-persona-card") : $("hp-image-card");
          if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (e) {}
      });
      row.appendChild(mk);
    }
    d.appendChild(row);
    return d;
  }

  function renderDirectory(wrap) {
    wrap.innerHTML = "";
    var L = lang();
    var q = "";
    try { q = ($("hp-search") && $("hp-search").value || "").toLowerCase().trim(); } catch (e) {}
    TOOLS.forEach(function (t) {
      var hay = (t.name + " " + t.id + " " + t.grp + " " + t.desc_id + " " + t.desc_en).toLowerCase();
      if (q && hay.indexOf(q) === -1) return;
      wrap.appendChild(toolCard(t, L));
    });
    if (!wrap.children.length) {
      var e = document.createElement("div");
      e.style.opacity = "0.6"; e.style.fontSize = ".85rem"; e.style.textAlign = "center"; e.style.padding = "1rem";
      e.textContent = L === "id" ? "Tidak ketemu — coba 'persona', 'foto', 'chat'…" : "No match — try 'persona', 'photo', 'chat'…";
      wrap.appendChild(e);
    }
  }

  /* ---- chat bubbles ---- */
  function msgsEl() { return $("hp-msgs"); }
  function scrollBottom() {
    try { var m = msgsEl(); if (m) m.scrollTop = m.scrollHeight; } catch (e) {}
  }
  function addUser(text) {
    var m = msgsEl(); if (!m) return;
    var d = document.createElement("div");
    d.className = "hp-u"; d.textContent = text;
    m.appendChild(d); scrollBottom();
  }
  function blockCard(kind, body) {
    var card = document.createElement("div");
    card.className = "hp-block";
    var lab = document.createElement("div");
    lab.className = "hp-blabel";
    lab.textContent = kind === "persona" ? "🧑 Persona brief (English)" : "🎯 Image prompt (English)";
    card.appendChild(lab);
    var pre = document.createElement("pre");
    pre.textContent = body;
    card.appendChild(pre);
    var row = document.createElement("div");
    row.className = "hp-actions";
    var use = document.createElement("button");
    use.type = "button";
    use.textContent = kind === "persona" ? T("usePersona") : T("useGen");
    use.addEventListener("click", function () {
      if (kind === "persona") applyPersona(body); else applyGen(body);
    });
    var st = document.createElement("button");
    st.type = "button"; st.className = "ghost"; st.textContent = T("sendTo");
    st.addEventListener("click", function (e) {
      try {
        if (window.PromptBridge && window.PromptBridge.sendTo) window.PromptBridge.sendTo(body, { anchor: st, tags: ["ai-helper"], tab: "helper" });
        else copyText(body, "Prompt");
      } catch (err) { copyText(body, "Prompt"); }
    });
    var cp = document.createElement("button");
    cp.type = "button"; cp.className = "ghost"; cp.textContent = T("copy");
    cp.addEventListener("click", function () { copyText(body, kind === "persona" ? "Persona" : "Prompt"); });
    var sv = document.createElement("button");
    sv.type = "button"; sv.className = "ghost"; sv.textContent = T("saveVault");
    sv.addEventListener("click", function () { saveVault(body, ["ai-helper", kind], "helper"); });
    row.appendChild(use); row.appendChild(st); row.appendChild(cp); row.appendChild(sv);
    card.appendChild(row);
    return card;
  }
  function addAssistant(text) {
    var m = msgsEl(); if (!m) return;
    var d = document.createElement("div");
    d.className = "hp-a";
    var p = extractBlock(text, RX_PROMPT);
    var c = extractBlock(text, RX_PERSONA);
    var main = stripBlocks(text) || (p || c ? "" : text);
    d.innerHTML = main ? mdLite(main) : "";
    if (p) d.appendChild(blockCard("image", p));
    if (c) d.appendChild(blockCard("persona", c));
    if (!main && !p && !c) d.textContent = text;
    m.appendChild(d); scrollBottom();
  }
  function typingOn() {
    var m = msgsEl(); if (!m) return null;
    var d = document.createElement("div");
    d.className = "hp-a hp-typing";
    d.textContent = T("working");
    m.appendChild(d); scrollBottom();
    return d;
  }

  async function send(text) {
    text = String(text == null ? "" : text).trim();
    if (!text || busy) return;
    if (!window.root || !window.root.generateText) {
      toast(lang() === "id" ? "⚠️ AI belum siap — tunggu sebentar lalu coba lagi" : "⚠️ AI not ready — wait a moment and retry");
      return;
    }
    busy = true;
    try { var b = $("hp-send"); if (b) b.disabled = true; } catch (e) {}
    addUser(text);
    messages.push("User: " + text);
    saveHist();
    var tp = typingOn();
    var task = lang() === "id"
      ? "Reply in Bahasa Indonesia to the last User message. Follow the Rules. If they want an image prompt include ---PROMPT---, if they want a character/persona include ---PERSONA---."
      : "Reply in English to the last User message. Follow the Rules. If they want an image prompt include ---PROMPT---, if they want a character/persona include ---PERSONA---.";
    try {
      var res = await window.root.generateText(buildPrompt(task));
      var out = String(res && res.text != null ? res.text : res).trim();
      if (tp && tp.parentNode) tp.parentNode.removeChild(tp);
      if (!out) {
        var e = document.createElement("div");
        e.className = "hp-a"; e.textContent = lang() === "id" ? "⚠️ AI tidak mengembalikan teks — coba lagi." : "⚠️ The AI returned nothing — try again.";
        msgsEl().appendChild(e);
      } else {
        messages.push("Assistant: " + out);
        saveHist();
        maybeCompact();
        addAssistant(out);
      }
    } catch (err) {
      try { if (tp && tp.parentNode) tp.parentNode.removeChild(tp); } catch (e2) {}
      var m2 = msgsEl();
      if (m2) {
        var d2 = document.createElement("div");
        d2.className = "hp-a";
        d2.textContent = "⚠️ " + String((err && err.message) || err || "generateText failed") + (lang() === "id" ? " — tunggu sebentar lalu coba lagi." : " — wait a moment and retry.");
        m2.appendChild(d2);
      }
    }
    busy = false;
    try { var b2 = $("hp-send"); if (b2) b2.disabled = false; } catch (e) {}
    scrollBottom();
  }

  function resetChat() {
    if (busy) return;
    if (!messages.length && !summary) { toast(T("resetEmpty")); return; }
    var doIt = function () {
      messages = []; summary = "";
      saveHist();
      render(true);
      toast(T("resetDone"));
    };
    try {
      if (typeof window.uiConfirm === "function") {
        window.uiConfirm(T("resetConfirm"), { okText: T("reset") }).then(function (ok) { if (ok) doIt(); });
        return;
      }
    } catch (e) {}
    if (messages.length > 1) {
      try {
        if (window.confirm(T("resetConfirm"))) doIt();
        return;
      } catch (e) {}
    }
    doIt();
  }

  async function draftPersona() {
    var name = "", gender = "", age = "", traits = "", genre = "", rel = "";
    try {
      name = ($("hp-p-name") || {}).value || "";
      gender = ($("hp-p-gender") || {}).value || "";
      age = ($("hp-p-age") || {}).value || "";
      traits = ($("hp-p-traits") || {}).value || "";
      genre = ($("hp-p-genre") || {}).value || "";
      rel = ($("hp-p-rel") || {}).value || "";
    } catch (e) {}
    if (!traits.trim() && !genre.trim() && !name.trim()) {
      toast(T("needText"));
      try { $("hp-p-traits").focus(); } catch (e) {}
      return;
    }
    var brief = lang() === "id"
      ? "Nama: " + (name.trim() || "-") + "; Gender: " + (gender || "-") + "; Usia: " + (age.trim() || "-") +
        "; Sifat: " + (traits.trim() || "-") + "; Genre/latar: " + (genre.trim() || "-") +
        "; Hubungan dengan user: " + (rel.trim() || "-")
      : "Name: " + (name.trim() || "-") + "; Gender: " + (gender || "-") + "; Age: " + (age.trim() || "-") +
        "; Traits: " + (traits.trim() || "-") + "; Genre/setting: " + (genre.trim() || "-") +
        "; Relationship to user: " + (rel.trim() || "-");
    var btn = $("hp-p-go");
    if (btn) btn.disabled = true;
    addUser((lang() === "id" ? "🧑 Tolong buatkan persona dari: " : "🧑 Please draft a persona from: ") + brief);
    messages.push("User: " + "Draft a persona character from this wish (user wrote partly in Indonesian): " + brief);
    saveHist();
    var tp = typingOn();
    try {
      var task = "The user wants a PERSONA now. Skip questions. Reply with ONE short sentence in the user's language (" + (lang() === "id" ? "Bahasa Indonesia" : "English") +
        ") saying it is ready, plus the ---PERSONA--- block with your best character brief from the last User message. " + T("readyPersona");
      var res = await window.root.generateText(buildPrompt(task));
      var out = String(res && res.text != null ? res.text : res).trim();
      if (tp && tp.parentNode) tp.parentNode.removeChild(tp);
      messages.push("Assistant: " + out);
      saveHist(); maybeCompact();
      addAssistant(out);
    } catch (err) {
      try { if (tp && tp.parentNode) tp.parentNode.removeChild(tp); } catch (e2) {}
      addAssistant("⚠️ " + String((err && err.message) || err));
    }
    if (btn) btn.disabled = false;
  }

  async function draftImage() {
    var want = "", style = "";
    try {
      want = ($("hp-i-want") || {}).value || "";
      style = ($("hp-i-style") || {}).value || "";
    } catch (e) {}
    if (!want.trim()) {
      toast(T("needText"));
      try { $("hp-i-want").focus(); } catch (e) {}
      return;
    }
    var btn = $("hp-i-go");
    if (btn) btn.disabled = true;
    addUser((lang() === "id" ? "🎨 Tolong buatkan prompt gambar dari: " : "🎨 Please draft an image prompt from: ") + want.trim() + (style ? " (style: " + style + ")" : ""));
    messages.push("User: " + "Draft an image prompt from this wish (user wrote partly in Indonesian): " + want.trim() + (style ? " Desired style: " + style : ""));
    saveHist();
    var tp = typingOn();
    try {
      var task = "The user wants the finished IMAGE prompt NOW. Skip questions. Reply with ONE short sentence in the user's language (" + (lang() === "id" ? "Bahasa Indonesia" : "English") +
        ") saying it is ready, plus the ---PROMPT--- block with your best prompt from the last User message. " + T("readyImage");
      var res = await window.root.generateText(buildPrompt(task));
      var out = String(res && res.text != null ? res.text : res).trim();
      if (tp && tp.parentNode) tp.parentNode.removeChild(tp);
      messages.push("Assistant: " + out);
      saveHist(); maybeCompact();
      addAssistant(out);
    } catch (err) {
      try { if (tp && tp.parentNode) tp.parentNode.removeChild(tp); } catch (e2) {}
      addAssistant("⚠️ " + String((err && err.message) || err));
    }
    if (btn) btn.disabled = false;
  }

  /* ---- build ---- */
  function render(force) {
    var host = $("helper-app");
    if (!host) return;
    if (builtFor === lang() && host.firstChild && host.firstChild.id === "helper-root" && !force) return;
    ensureCSS();
    loadHist();
    builtFor = lang();
    host.innerHTML = "";
    var root = document.createElement("div");
    root.id = "helper-root";

    var hero = document.createElement("div");
    hero.className = "hp-hero";
    hero.innerHTML = '<h2>🤖 AI Helper</h2><p>' + esc(T("heroSub")) + '</p>';
    var lg = document.createElement("div");
    lg.className = "hp-lang";
    var bId = document.createElement("button");
    bId.type = "button"; bId.textContent = "🇮🇩 Indonesia";
    if (lang() === "id") bId.className = "on";
    bId.addEventListener("click", function () { if (lang() !== "id") setLang("id"); });
    var bEn = document.createElement("button");
    bEn.type = "button"; bEn.textContent = "🇬🇧 English";
    if (lang() === "en") bEn.className = "on";
    bEn.addEventListener("click", function () { if (lang() !== "en") setLang("en"); });
    lg.appendChild(bId); lg.appendChild(bEn);
    hero.appendChild(lg);
    root.appendChild(hero);

    var grid = document.createElement("div");
    grid.className = "hp-grid";

    /* left: directory */
    var left = document.createElement("div");
    left.className = "hp-card";
    var hL = document.createElement("h3");
    hL.textContent = lang() === "id" ? "📖 Direktori tools (" + TOOLS.length + ")" : "📖 Tool directory (" + TOOLS.length + ")";
    left.appendChild(hL);
    var search = document.createElement("input");
    search.id = "hp-search";
    search.className = "hp-search";
    search.setAttribute("type", "search");
    search.setAttribute("autocomplete", "off");
    search.placeholder = T("searchPh");
    search.addEventListener("input", function () {
      var w = $("hp-tools");
      if (w) renderDirectory(w);
    });
    left.appendChild(search);
    var list = document.createElement("div");
    list.id = "hp-tools";
    list.className = "hp-tools";
    left.appendChild(list);
    grid.appendChild(left);

    /* right: chat + builders */
    var right = document.createElement("div");
    right.style.display = "flex";
    right.style.flexDirection = "column";
    right.style.gap = ".8rem";

    var chat = document.createElement("div");
    chat.className = "hp-card";
    chat.id = "hp-chat-card";
    var chead = document.createElement("div");
    chead.className = "hp-chead";
    var hC = document.createElement("h3");
    hC.textContent = T("chatTitle");
    chead.appendChild(hC);
    var rst = document.createElement("button");
    rst.type = "button"; rst.className = "hp-reset"; rst.textContent = T("reset");
    rst.title = T("resetConfirm");
    rst.addEventListener("click", resetChat);
    chead.appendChild(rst);
    chat.appendChild(chead);
    var sub = document.createElement("div");
    sub.style.fontSize = ".76rem"; sub.style.opacity = "0.7"; sub.style.marginBottom = ".4rem";
    sub.textContent = T("chatSub");
    chat.appendChild(sub);
    var chips = document.createElement("div");
    chips.className = "hp-chips";
    var L = lang();
    var quicks = L === "id" ? [
      "Jelasin Persona Generator + cara bikin villain cyberpunk",
      "Bedanya AI Chat vs AI Chat Lite?",
      "Aku punya foto, mau jadi prompt — alurnya gimana?",
      "Bikinin prompt: ksatria kucing gemuk di pasar malam neon"
    ] : [
      "Explain Persona Generator + how to make a cyberpunk villain",
      "AI Chat vs AI Chat Lite — what's the difference?",
      "I have a photo, I want a prompt — what's the flow?",
      "Draft a prompt: chubby cat knight at a neon night market"
    ];
    var qlab = document.createElement("div");
    qlab.style.fontSize = ".74rem"; qlab.style.opacity = "0.65";
    qlab.textContent = T("askFirst");
    chat.appendChild(qlab);
    quicks.forEach(function (q) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = q.length > 52 ? q.slice(0, 52) + "…" : q;
      b.title = q;
      b.addEventListener("click", function () { if (!busy) send(q); });
      chips.appendChild(b);
    });
    chat.appendChild(chips);
    var msgs = document.createElement("div");
    msgs.id = "hp-msgs";
    msgs.className = "hp-msgs";
    msgs.setAttribute("aria-live", "polite");
    chat.appendChild(msgs);
    var irow = document.createElement("div");
    irow.className = "hp-inputrow";
    var inp = document.createElement("textarea");
    inp.id = "hp-input";
    inp.className = "hp-input";
    inp.rows = 2;
    inp.placeholder = T("chatPh");
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(inp.value); inp.value = ""; }
    });
    var snd = document.createElement("button");
    snd.id = "hp-send";
    snd.type = "button"; snd.className = "hp-send"; snd.textContent = T("send");
    snd.addEventListener("click", function () { send(inp.value); inp.value = ""; });
    irow.appendChild(inp); irow.appendChild(snd);
    chat.appendChild(irow);
    var note = document.createElement("div");
    note.className = "hp-note";
    note.textContent = T("langNote");
    chat.appendChild(note);
    right.appendChild(chat);

    /* persona builder */
    var pb = document.createElement("div");
    pb.className = "hp-card hp-form";
    pb.id = "hp-persona-card";
    var hP = document.createElement("h3");
    hP.textContent = T("builderPersona");
    pb.appendChild(hP);
    var isIdB = lang() === "id";
    var exW = isIdB ? "mis." : "e.g.";
    var gOpts = isIdB
      ? ["Female / Perempuan", "Male / Laki-laki", "Nonbinary", "Robot / AI", "Monster / Creature"]
      : ["Female", "Male", "Nonbinary", "Robot / AI", "Monster / Creature"];
    var rOpts = isIdB
      ? ["Stranger / Orang asing", "Friend / Teman", "Rival", "Lover / Kekasih", "Mentor", "Enemy / Musuh"]
      : ["Stranger", "Friend", "Rival", "Lover", "Mentor", "Enemy"];
    pb.innerHTML +=
      '<div class="row2"><div><label>' + esc(T("pName")) + '</label><input id="hp-p-name" maxlength="60" placeholder="' + esc(exW + " Kaela / —") + '"></div>' +
      '<div><label>' + esc(T("pGender")) + '</label><select id="hp-p-gender"><option value="">—</option>' +
        gOpts.map(function (o) { return "<option>" + esc(o) + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="row2"><div><label>' + esc(T("pAge")) + '</label><input id="hp-p-age" maxlength="30" placeholder="' + esc(exW + " 27") + '"></div>' +
      '<div><label>' + esc(T("pRel")) + '</label><select id="hp-p-rel"><option value="">—</option>' +
        rOpts.map(function (o) { return "<option>" + esc(o) + "</option>"; }).join("") + "</select></div></div>" +
      '<label>' + esc(T("pGenre")) + '</label><input id="hp-p-genre" maxlength="120" placeholder="' + esc(exW + " cyberpunk Jakarta 2089 / fantasy academy") + '"> ' +
      '<label>' + esc(T("pTraits")) + '</label><textarea id="hp-p-traits" rows="3" placeholder="' + esc(T("pTraitsPh")) + '"></textarea>';
    var pgo = document.createElement("button");
    pgo.id = "hp-p-go"; pgo.type = "button"; pgo.className = "hp-btn";
    pgo.style.marginTop = ".55rem";
    pgo.textContent = T("pMake");
    pgo.addEventListener("click", draftPersona);
    pb.appendChild(pgo);
    right.appendChild(pb);

    /* image builder */
    var ib = document.createElement("div");
    ib.className = "hp-card hp-form";
    ib.id = "hp-image-card";
    var hI = document.createElement("h3");
    hI.textContent = T("builderImage");
    ib.appendChild(hI);
    ib.innerHTML += '<label>' + esc(T("iWant")) + '</label><textarea id="hp-i-want" rows="3" placeholder="' + esc(T("iWantPh")) + '"></textarea>' +
      '<label>' + esc(T("iStyle")) + '</label><select id="hp-i-style"><option value="">— ' + (lang() === "id" ? "(bebas / auto)" : "(free / auto)") + '</option><option>anime</option><option>realistic photo</option><option>cinematic</option><option>fantasy art</option><option>watercolor</option><option>pixel art</option><option>comic / manga</option></select>';
    var igo = document.createElement("button");
    igo.id = "hp-i-go"; igo.type = "button"; igo.className = "hp-btn";
    igo.style.marginTop = ".55rem";
    igo.textContent = T("iMake");
    igo.addEventListener("click", draftImage);
    ib.appendChild(igo);
    right.appendChild(ib);

    grid.appendChild(right);
    root.appendChild(grid);
    host.appendChild(root);

    renderDirectory(list);
    /* replay history */
    try {
      var mEl = $("hp-msgs");
      if (mEl) {
        mEl.innerHTML = "";
        for (var i = 0; i < messages.length; i++) {
          var line = messages[i];
          if (line.indexOf("User: ") === 0) {
            var skip = line.indexOf("Draft a persona character") === 6 || line.indexOf("Draft an image prompt") === 6;
            if (!skip) {
              var du = document.createElement("div");
              du.className = "hp-u"; du.textContent = line.slice(6);
              mEl.appendChild(du);
            }
          } else if (line.indexOf("Assistant: ") === 0) {
            var body = line.slice(11);
            var dd = document.createElement("div");
            dd.className = "hp-a";
            var pp = extractBlock(body, RX_PROMPT);
            var cc = extractBlock(body, RX_PERSONA);
            dd.innerHTML = stripBlocks(body) ? mdLite(stripBlocks(body)) : "";
            if (pp) dd.appendChild(blockCard("image", pp));
            if (cc) dd.appendChild(blockCard("persona", cc));
            if (!dd.innerHTML && !pp && !cc) dd.textContent = body;
            mEl.appendChild(dd);
          }
        }
        if (!messages.length) {
          var hello = document.createElement("div");
          hello.className = "hp-a";
          hello.innerHTML = L === "id"
            ? "Halo! 👋 Aku <b>AI Helper</b>. Tanya apa aja soal tools di sebelah kiri — atau langsung ceritakan karakter / gambar impianmu.<br><br>Coba klik salah satu contoh di atas, mis. <i>'Jelasin Persona Generator…'</i>"
            : "Hi! 👋 I'm the <b>AI Helper</b>. Ask anything about the tools on the left — or describe your dream character / image.<br><br>Try one of the examples above.";
          mEl.appendChild(hello);
        }
        scrollBottom();
      }
    } catch (e) {}
  }

  window.Helper = { render: render, tools: TOOLS };
  window.__helperOnShow = function () { render(false); };
  window.__helperLoading = false;
  window.__helperLoaded = true;
})();
