/* ===== Image Generator: 💬 Chat Prompt Builder (PromptBuddy) =====================
   Ngobrol dengan AI untuk meracik prompt — Chat with AI to craft your prompt.

   - Tombol "💬 Chat Prompt" disuntik ke toolbar `#gen-tools` (dan ke ✨ Simple mode).
   - Panel chat mengambang: tanya-jawab singkat dengan AI, draf prompt final
     SELALU dalam Bahasa Inggris (model gambar paling bagus dengan Inggris),
     walau ngobrolnya Bahasa Indonesia.
   - Setiap balasan AI yang memuat blok ---PROMPT--- ... ---END--- dirender
     sebagai kartu prompt dengan tombol:
       [Pakai prompt ini] → tulis ke Description box (+ toast)
       [📋] copy · [📚] simpan ke Vault · [▸] kirim ke tab lain (PromptBridge)
   - Status/discussion memakai `root.generateText` (ai-text-plugin) dengan
     pola prefix-cache dari skill: satu template tetap + transkrip append-only
     + TASK di akhir + ringkasan latar bila kepanjangan.
   - Mandiri (self-contained): tanpa edit gen-extras.js — file ini menyuntik
     tombolnya sendiri via polling. Dibuka juga lewat
     `window.__openPromptChat()` (dipakai palette ⌘K + tombol Simple mode).
   ================================================================================= */

(function () {
  "use strict";
  if (window.__promptChatBooted) return;
  window.__promptChatBooted = true;

  /* ---------- helpers ---------- */
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
  function genDescEl() { return document.querySelector('#i2p-imggen [data-name="description"]'); }
  function currentBoxText() {
    try {
      var el = genDescEl();
      if (el && typeof el.value === "string" && el.value.trim()) return el.value.trim();
      var pro = $("pro-desc");
      if (pro && typeof pro.value === "string" && pro.value.trim()) return pro.value.trim();
    } catch (e) {}
    return "";
  }
  function applyPromptToGen(text) {
    text = String(text == null ? "" : text).trim();
    if (!text) { toast("⚠️ prompt kosong"); return false; }
    try {
      if (window.__nexoraMode && typeof window.__nexoraMode.setFrameworkInput === "function") {
        window.__nexoraMode.setFrameworkInput("description", text);
        toast("✅ Prompt dipakai di Description — tinggal klik generate!");
        return true;
      }
    } catch (e) {}
    try {
      var el = genDescEl();
      if (el) {
        el.value = text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        try { el.focus(); } catch (e2) {}
        toast("✅ Prompt dipakai di Description — tinggal klik generate!");
        return true;
      }
    } catch (e) {}
    // Fallback: tawarkan kirim ke tab lain bila box gen tidak ketemu.
    try {
      if (window.PromptBridge && window.PromptBridge.sendTo) {
        window.PromptBridge.sendTo(text, { preview: text, tags: ["prompt-chat"] });
        return true;
      }
    } catch (e) {}
    toast("⚠️ box Description tidak ketemu");
    return false;
  }
  /* ----- ✅ Terapkan ke Basic: user konfirmasi → isi field-field Basic ----- */
  function selectTexts(name) {
    try {
      var sel = document.querySelector('select[data-name="' + name + '"]');
      if (!sel) return [];
      var out = [];
      for (var i = 0; i < sel.options.length; i++) {
        var t = String(sel.options[i].textContent || "").trim().replace(/\s+/g, " ");
        if (t && out.indexOf(t) < 0) out.push(t);
      }
      return out;
    } catch (e) { return []; }
  }
  function sampleList(list, max) {
    if (list.length <= max) return list;
    var out = [], stride = Math.ceil(list.length / max);
    for (var i = 0; i < list.length; i += stride) out.push(list[i]);
    return out;
  }

  async function confirmApply(prompt, btn) {
    if (!window.root || !window.root.generateText) { toast("⚠️ AI text belum siap — coba lagi sebentar"); return; }
    var old = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "⏳ mengisi…"; }
    try {
      var styles = sampleList(selectTexts("artStyle"), 80);
      var shapes = selectTexts("shape");
      var nums = selectTexts("numImages");
      var meds = selectTexts("mixMedium"), vibes = selectTexts("mixVibe"), arts = selectTexts("mixArtist");
      var spec = '{"description": "<final English prompt, 2-4 sentences>", "negative": "<short anti-description or empty>", "style": "<one of the style list>", "shape": "<one of the shape list>", "numImages": "<one of the numImages list>", "mixMedium": "<one of the medium list or empty>", "mixVibe": "<one of the vibe list or empty>", "mixArtist": "<one of the artist list or empty>"}';
      var task = "The user CONFIRMED the draft — fill the Basic form now. Output ONLY a single JSON object, no commentary, no markdown fences:\n" + spec +
        "\nStyle list: " + (styles.join(" | ") || "-") +
        "\nShape list: " + (shapes.join(" | ") || "-") +
        "\nnumImages list: " + (nums.join(" | ") || "-") +
        "\nMedium list: " + (meds.join(" | ") || "-") +
        "\nVibe list: " + (vibes.join(" | ") || "-") +
        "\nArtist list: " + (arts.join(" | ") || "-") +
        "\nCONFIRMED DRAFT (this is what the user confirmed — base the JSON on THIS; it wins over anything else in the transcript):\n\"\"\"" + String(prompt || "").slice(0, 1200) + "\"\"\"" +
        "\nRules: description = the confirmed draft above (improve slightly if needed; do NOT mix in other ideas from the transcript). Copy style/shape/numImages/mixers EXACTLY from the lists above (exact text). Leave a mixer empty if the user never asked for it. If a list shows \"-\" (field missing), put that part into description instead.";
      var res = await window.root.generateText({ instruction: buildPrompt(task), stopSequences: ["\nUser:"] });
      var raw = String((res && res.text != null) ? res.text : "");
      var m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("no json");
      applyFieldPlan(JSON.parse(m[0]), prompt);
    } catch (e) {
      console.error("[prompt-chat] confirm:", e);
      applyPromptToGen(prompt); // gagal parse → minimal: deskripsi aja
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = old; }
    }
  }

  function applyFieldPlan(plan, fallbackPrompt) {
    plan = (plan && typeof plan === "object") ? plan : {};
    var norm = function (s) { return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); };
    function setSelectByText(name, text) {
      if (text == null || String(text).trim() === "") return false;
      var sel = null;
      try { sel = document.querySelector('select[data-name="' + name + '"]'); } catch (e) {}
      if (!sel) return false;
      var want = norm(text);
      for (var i = 0; i < sel.options.length; i++) {
        if (norm(sel.options[i].textContent) === want || norm(sel.options[i].value) === want) {
          sel.value = sel.options[i].value;
          try { if (typeof sel.onchange === "function") sel.onchange({}); } catch (e) {}
          sel.dispatchEvent(new Event("input", { bubbles: true }));
          sel.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }
      return false;
    }
    function setText(name, text) {
      if (text == null || String(text).trim() === "") return false;
      try {
        if (window.__nexoraMode && window.__nexoraMode.setFrameworkInput) {
          if (window.__nexoraMode.setFrameworkInput(name, String(text)) !== false) return true;
        }
      } catch (e) {}
      var el = null;
      try { el = document.querySelector('#i2p-imggen [data-name="' + name + '"]'); } catch (e) {}
      if (!el) return false;
      el.value = String(text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    // Amankan isi lama sebelum ditimpa (diam-diam ke Vault).
    try {
      var cur = currentBoxText();
      if (cur && window.Vault && window.Vault.add) window.Vault.add(cur, { tags: ["prompt-chat", "replaced"], tab: "gen" });
    } catch (e) {}
    var filled = [], extra = [];
    var desc = String(plan.description || fallbackPrompt || "").trim();
    if (desc) { if (setText("description", desc)) filled.push("📝 Deskripsi"); }
    if (plan.style) { if (setSelectByText("artStyle", plan.style)) filled.push("🎨 Style"); else extra.push(plan.style); }
    if (plan.shape) { if (setSelectByText("shape", plan.shape)) filled.push("🖼️ Canvas"); else extra.push(plan.shape); }
    if (plan.numImages != null && String(plan.numImages).trim() !== "") { if (setSelectByText("numImages", String(plan.numImages))) filled.push("🔢 Jumlah"); else extra.push(String(plan.numImages)); }
    if (plan.mixMedium) { if (setSelectByText("mixMedium", plan.mixMedium)) filled.push("🧩 Medium"); else extra.push(plan.mixMedium); }
    if (plan.mixVibe) { if (setSelectByText("mixVibe", plan.mixVibe)) filled.push("🧩 Vibe"); else extra.push(plan.mixVibe); }
    if (plan.mixArtist) { if (setSelectByText("mixArtist", plan.mixArtist)) filled.push("🧩 Artist"); else extra.push(plan.mixArtist); }
    if (plan.negative) { if (setText("negative", plan.negative)) filled.push("🚫 Anti-Deskripsi"); else extra.push(plan.negative); }
    // Yang tidak ada field-nya → gabung ke deskripsi ("ga ada yah deskripsi aja").
    if (extra.length && desc) setText("description", desc + " " + extra.join(", "));
    refreshCtx();
    if (filled.length) toast("✅ Basic terisi: " + filled.join(" · ") + " — tinggal klik generate!");
    else toast("⚠️ field tidak ketemu — ditaruh di Deskripsi");
  }

  function copyText(text, what) {
    function done() { toast("📋 " + (what || "Prompt") + " disalin"); }
    function legacy() {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed"; ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (e) {}
        ta.remove();
        if (ok) done(); else toast("⚠️ gagal menyalin — blokir browser");
      } catch (e) { toast("⚠️ gagal menyalin"); }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, legacy);
      } else legacy();
    } catch (e) { legacy(); }
  }

  /* ---------- conversation state (append-only untuk prefix-cache) ---------- */
  var LS_HIST = "t2iPromptChatHist_v1";
  var KEEP = 10;
  var messages = [];   // ["User: ...", "Assistant: ..."] — append-only
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

  // Header TETAP — jangan diubah per panggilan (invalidates prefix cache).
  var HEADER = [
    "You are PromptBuddy, the prompt engineer inside a free AI image generator.",
    "You chat with the user to shape a great text-to-image prompt.",
    "Reply ALWAYS in the user's language (Bahasa Indonesia if they write Indonesian, English if they write English, and so on for any other language).",
    "Keep every reply short: 1-3 sentences.",
    "The final image prompt itself is ALWAYS in English.",
    "PACING (important): do NOT output the ---PROMPT--- block while you still have questions. Ask about ONE topic per reply — never bundle multiple topics or questions in one message (one reply = one topic). Your 2-3 ---CHOICES--- are alternative answers to that single question, not separate questions.",
    "TRACKING (important): keep a mental checklist of what is already known (subject, appearance, outfit, setting, lighting, mood, camera angle, art style, ...). If the user's answer volunteers extra detail beyond what you asked (e.g. you asked hair color and they said 'long red hair'), treat those volunteered topics as ANSWERED too — never ask about them in later replies. If the user jumps to a new topic themselves, follow them.",
    "SPECIFICITY (very important, this is where you usually fail): vague words are NOT answers. Words like terbuka/open, seksi/sexy, ketat/tight, pendek/short, transparan, bagus, keren, cantik — these describe an impression, not a drawable visual. NEVER accept them as complete and move on. Always drill ONE level deeper with a concrete visual question about that SAME topic. Example: user says 'baju terbuka' → do NOT jump to background/lighting. Stay on outfit and ask HOW open, with concrete levels: e.g. 'Seberapa terbuka maksudmu?' + choices like 'Kemeja, 2 kancing atas dibuka' vs 'Off-shoulder, bahu kelihatan' vs 'Crop top + jaket terbuka'. Another example: 'rok pendek' → ask 'sependek apa — mini di atas lutut / mini paha / micro?' The question must be answerable by tapping one choice.",
    "COMPLETENESS (a topic is DONE only when you could draw it without guessing): outfit = jenis pakaian + warna/bahan + potongan/fit + tingkat keterbukaan/tutupan + detail kunci (kancing/ritsleting/robek/transparan/belah). subject = siapa/apa + usia + pose + ekspresi. setting = lokasi + waktu + suasana. If you would still have to guess any of those, the topic is NOT done — ask again, narrower, on the SAME topic. Do not mark a topic done just because the user said something about it.",
    "OUTFIT TIERS (ask this FIRST when the vagueness is HOW revealing — words like terbuka/seksi/minim/transparan/menggoda, or when the user says tier 1-4): Tier 1 SOPAN = casual-sexy but safe (kemeja 2 kancing atas dibuka, off-shoulder, crop top + high-waist jeans, dress di atas lutut; no private-area hints). Tier 2 MENGGODA = suggestive (deep V-neck, mini dress belahan tinggi, crop ketat pamer perut, sheer di lengan/punggung). Tier 3 BERANI = lingerie/bikini/bodysuit, sheer showing silhouette, underboob/sideboob hint, garter/stocking. Tier 4 EKSTREM = minimal coverage only (nipple pasties / plester/body-tape covering nipples and pubic area only, body paint, hand-bra, handuk nyaris lepas). RULE: ask the TIER first as ONE question with 3 choices spanning the range (mis. Tier 1 Sopan / Tier 2-3 Menggoda-Berani / Tier 4 Ekstrem), then next turn drill into concrete garments INSIDE the chosen tier. If the user already names a tier, skip the tier question and drill inside it. The final English ---PROMPT--- must describe actual garments/coverage concretely (fabric, color, which parts covered/exposed) — never just write 'tier X outfit'.",
    "STAY RULE: if the user's last answer was about topic X but is still vague by the COMPLETENESS test, your next reply MUST stay on X (deeper, more concrete) — never jump to a new topic. Only move to a new topic when X passes the drawable test. Priority order for new topics: subject → outfit → pose/expression → setting → lighting/mood → camera angle → art style, skipping what is already concrete.",
    "When you have enough detail to propose a prompt, or the user asks for it, include it EXACTLY in this block:",
    "---PROMPT---",
    "<2-4 vivid English sentences: subject, appearance, pose, outfit, setting, lighting, mood, camera angle>",
    "---END---",
    "Never put art-style names, negative prompts, or commentary inside the block. Put questions and explanations OUTSIDE the block.",
    "Make answering effortless: end EVERY reply with up to 3 clickable quick answers, EXACTLY in this block (labels in the user's language, max ~20 chars each; the text after | is the full reply sent when clicked). CHOICES must ALWAYS be 2-3 concrete, mutually distinct visuals (never just 1 — a single option is pointless, the user cannot choose) (e.g. not 'terbuka / sangat terbuka' but three separate lines: 'Kemeja 2 kancing dibuka' / 'Off-shoulder' / 'Crop top dan jaket terbuka') so tapping one actually resolves the vagueness:",
    "---CHOICES---",
    "FORMAT: one option PER LINE, exactly one " | " separator per line like this — Label | full user-style reply (max ~20 chars for label). Example:",
    "Tier 1 Sopan | Tier 1 sopan, kemeja 2 kancing dibuka",
    "Tier 2-3 Berani | Tier 2-3, deep V-neck dan crop top",
    "Tier 4 Ekstrem | Tier 4 ekstrem, pasties dan tape saja",
    "NEVER put 2-3 options on one line separated by pipes. 2-3 lines = 2-3 options.",
    "---END---",
    "When the user confirms the draft (says ok, deal, bagus, cocok, pakai itu, terapkan, gas, setuju, or similar), do NOT write a new draft — just tell them to press the ✅ Terapkan ke Basic button under the draft card."
  ].join("\n");

  var REPLY_TASK = "Reply to the last User message in the user's language. First absorb everything the user just said, including volunteered extras — never re-ask those. Then run the COMPLETENESS test on the topic they just answered: if it is still vague/guessable (e.g. they said 'baju terbuka' without saying HOW open), STAY on that SAME topic and ask one narrower, concrete question about it (with 2-3 concrete visual CHOICES that would each resolve it) — do NOT jump to a new topic and do NOT include any ---PROMPT--- block. Only when that topic is drawable, ask about the single most important still-missing topic (one topic per reply, never several). Include the ---PROMPT--- block only if the user explicitly asked for the prompt, or if every important topic is drawable and you have no more questions. Always end with a ---CHOICES--- block of 2-3 concrete answers (never just 1) to your one question.";
  var DIRECT_TASK = "The user wants the finished prompt NOW. Skip questions. Write one short sentence in the user's language saying it is ready, plus the ---PROMPT--- block with your best prompt from everything so far. Always end with a ---CHOICES--- block (follow-ups like making variations or changing the style).";

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
    if (summary) log.push("[Summary of the earlier conversation:\n" + summary + "]");
    for (var i = 0; i < messages.length; i++) log.push(messages[i]);
    return HEADER + "\n<MESSAGES>\n" + log.join("\n\n") + "\n</MESSAGES>\n" +
      'Current description-box text (may be empty; treat as the starting idea, do not repeat it back verbatim):\n"""' +
      currentBoxText().slice(0, 1500) + '"""\nTASK: ' + task;
  }
  // Ringkasan latar (background, tidak ditunggu user) — pola dari ai-text-plugin skill.
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
        '". Fold in the [Summary of the earlier conversation...] block if there is one. Terse bullets; preserve names, facts, decisions, and unresolved threads. Output ONLY the new summary text.'
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

  var PROMPT_RX = /---PROMPT---\s*([\s\S]*?)(?:---END---|$)/;
  function extractPrompt(text) {
    var m = String(text || "").match(PROMPT_RX);
    if (!m) return "";
    return m[1].replace(/^["'\s]+|["'\s]+$/g, "").trim();
  }
  function stripBlock(text) {
    return String(text || "")
      .replace(/---PROMPT---[\s\S]*?(---END---|$)/, "")
      .replace(/---CHOICES---[\s\S]*?(---END---|$)/, "")
      .trim();
  }
  var CHOICE_RX = /---CHOICES---\s*([\s\S]*?)(?:---END---|$)/;
  function extractChoices(text) {
    var m = String(text || "").match(CHOICE_RX);
    if (!m) return [];
    var out = [];
    var lines = m[1].split("\n");
    for (var i = 0; i < lines.length && out.length < 3; i++) {
      var parts = lines[i].split("|");
      if (parts.length < 2) continue;
      var label = parts[0].trim().slice(0, 24);
      var msg = parts.slice(1).join("|").trim();
      if (label && msg) out.push({ label: label, msg: msg });
    }
    return out;
  }
  var chipWrap = null;
  var RANDOM_MSG = "Acak aja — pilihkan salah satu opsimu secara random (pick one at random) dan lanjutkan";
  function renderChips(list) {
    if (!chipWrap) return;
    chipWrap.innerHTML = "";
    if (!list || !list.length) { chipWrap.style.display = "none"; return; }
    chipWrap.style.display = "";
    list.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = c.label; b.title = c.msg;
      b.addEventListener("click", function () { if (!busy) send(c.msg); });
      chipWrap.appendChild(b);
    });
    // Selalu tambah tombol Acak untuk pilihan AI (1-3 opsi) — bukan untuk menu awal (4+ tombol aksi).
    // Jadi user bisa skip mikir dan biar AI yang pilihkan random.
    if (list.length >= 1 && list.length <= 3 && list[0].label.indexOf("Langsung buatkan") === -1) {
      var hasRandom = list.some(function (c) { return /acak|random|terserah|bebas/i.test(c.label || ""); });
      if (!hasRandom) {
        var rb = document.createElement("button");
        rb.type = "button"; rb.textContent = "\uD83C\uDFB2 Acak"; rb.title = RANDOM_MSG;
        rb.addEventListener("click", function () { if (!busy) send(RANDOM_MSG); });
        chipWrap.appendChild(rb);
      }
    }
  }

  /* ---------- UI ---------- */
  var CSS = [
    "#pcOverlay{position:fixed;inset:0;z-index:95000;background:rgba(0,0,0,.55);display:flex;justify-content:flex-end;}",
    "#pcOverlay[hidden]{display:none;}",
    "#pcPanel{width:min(430px,96vw);height:100%;box-sizing:border-box;background:var(--th-modal,var(--th-surface,#1d1d24));color:inherit;border-left:1px solid var(--th-border,#444);display:flex;flex-direction:column;font-family:var(--th-font,inherit);text-align:left;}",
    "#pcHead{padding:.7rem .9rem;border-bottom:1px solid var(--th-border,#444);display:flex;align-items:flex-start;gap:.5rem;text-align:left;}",
    "#pcHead .pc-title{font-weight:700;font-size:.95rem;}",
    "#pcHead .pc-sub{font-size:.75rem;opacity:.7;margin-top:.15rem;line-height:1.4;}",
    "#pcClose{margin-left:auto;cursor:pointer;border:1px solid var(--th-border,#555);background:var(--th-surface,#333);color:inherit;border-radius:8px;font-size:1rem;line-height:1;padding:.35rem .55rem;}",
    "#pcNew{cursor:pointer;border:1px solid var(--th-border,#555);background:transparent;color:inherit;border-radius:8px;font-size:.75rem;font-weight:700;padding:.35rem .55rem;white-space:nowrap;}",
    "#pcNew:hover{border-color:var(--th-accent,#2b6bf0);}",
    "#pcCtx{padding:.5rem .9rem;border-bottom:1px solid var(--th-border,#444);font-size:.76rem;opacity:.95;display:flex;gap:.4rem;align-items:center;text-align:left;}",
    "#pcCtx .pc-snip{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.75;}",
    "#pcCtx button{cursor:pointer;font-size:.76rem;border:1px solid var(--th-border,#555);background:transparent;color:inherit;border-radius:999px;padding:.2rem .6rem;}",
    "#pcMsgs{flex:1;overflow-y:auto;padding:.7rem .8rem;display:flex;flex-direction:column;gap:.55rem;text-align:left;}",
    "#pcMsgs:empty::after{content:'Mulai dengan menceritakan ide gambarmu di bawah…';opacity:.55;font-size:.83rem;text-align:center;margin-top:1rem;}",
    ".pc-u{align-self:flex-end;max-width:88%;background:var(--th-accent,#2b6bf0);color:var(--th-accent-text,#fff);border-radius:14px 14px 4px 14px;padding:.5rem .7rem;font-size:.85rem;line-height:1.5;white-space:pre-wrap;word-break:break-word;text-align:left;}",
    ".pc-a{align-self:flex-start;max-width:94%;background:var(--th-field,#0f1424);border:1px solid var(--th-border,#444);border-radius:14px 14px 14px 4px;padding:.55rem .7rem;font-size:.85rem;line-height:1.55;white-space:pre-wrap;word-break:break-word;text-align:left;}",
    ".pc-typing{opacity:.75;}",
    ".pc-typing::after{content:'…';animation:pcBlink 1s infinite;}",
    "@keyframes pcBlink{50%{opacity:0;}}",
    ".pc-card{margin-top:.5rem;border:1px solid var(--th-accent,#2b6bf0);border-radius:10px;overflow:hidden;}",
    ".pc-card .pc-plabel{font-size:.7rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;opacity:.8;padding:.35rem .6rem .1rem;}",
    ".pc-card pre{margin:0;padding:.4rem .6rem;font-size:.8rem;line-height:1.5;white-space:pre-wrap;word-break:break-word;font-family:inherit;}",
    ".pc-card .pc-actions{display:flex;gap:.35rem;flex-wrap:wrap;padding:.15rem .5rem .55rem;}",
    ".pc-card .pc-actions button{cursor:pointer;font-size:.78rem;border-radius:999px;padding:.3rem .7rem;border:1px solid var(--th-accent,#2b6bf0);background:var(--th-accent,#2b6bf0);color:var(--th-accent-text,#fff);font-weight:700;}",
    ".pc-card .pc-actions button.ghost{background:transparent;color:inherit;border-color:var(--th-border,#666);font-weight:400;}",
    ".pc-err{align-self:flex-start;max-width:94%;background:#4a1d1d;border:1px solid #a33;border-radius:12px;padding:.5rem .7rem;font-size:.83rem;}",
    ".pc-err button{margin-top:.4rem;cursor:pointer;font-size:.8rem;border-radius:999px;border:1px solid #a33;background:transparent;color:inherit;padding:.25rem .7rem;}",
    "#pcChips{display:flex;gap:.35rem;flex-wrap:wrap;padding:.45rem .8rem 0;}",
    "#pcChips button{cursor:pointer;font-size:.76rem;border-radius:999px;border:1px solid var(--th-border,#666);background:transparent;color:inherit;padding:.28rem .65rem;}",
    "#pcChips button:hover{border-color:var(--th-accent,#2b6bf0);}",
    "#pcInputRow{display:flex;gap:.45rem;padding:.55rem .8rem .8rem;align-items:flex-end;}",
    "#pcInput{flex:1;min-height:2.6rem;max-height:7rem;resize:vertical;box-sizing:border-box;border-radius:10px;border:1px solid var(--th-border,#555);background:var(--th-field,#0f1424);color:inherit;font:inherit;font-size:.86rem;padding:.5rem .6rem;line-height:1.45;}",
    "#pcInput:focus{outline:2px solid var(--th-accent,#2b6bf0);outline-offset:1px;}",
    "#pcSend{cursor:pointer;border:none;border-radius:10px;background:var(--th-accent,#2b6bf0);color:var(--th-accent-text,#fff);font-weight:700;font-size:.9rem;padding:.6rem 1rem;min-height:2.6rem;}",
    "#pcSend:disabled{opacity:.55;cursor:default;}",
    "#pcFoot{padding:0 .9rem .7rem;font-size:.7rem;opacity:.6;line-height:1.45;text-align:left;}",
    "#pc-launcher-row{max-width:100%;margin:0.45rem 0.5rem 0;text-align:center;}",
    "#pc-launcher-row[hidden]{display:none;}",
    "#pc-open-btn{cursor:pointer;font:inherit;font-size:0.9rem;font-weight:700;border-radius:999px;border:1px solid transparent;background:linear-gradient(135deg,var(--th-grad-a,#4f5bef),var(--th-grad-b,#a855f7),var(--th-grad-c,#ff5c9d));color:#fff;padding:0.55rem 1.25rem;box-shadow:0 4px 18px -6px var(--th-glow-color,rgba(168,85,247,.45));transition:filter .15s,transform .15s;}",
    "#pc-open-btn:hover{filter:brightness(1.1);}",
    "#pc-open-btn:active{transform:scale(.98);}",
    "#pc-open-btn b{font-weight:800;}",
    "#pc-open-btn span{opacity:.88;font-size:.8rem;font-weight:400;}",
    "@media (max-width:600px){#pcOverlay{justify-content:center;align-items:flex-end;}#pcPanel{width:100%;height:min(92dvh,720px);border-left:none;border-top:1px solid var(--th-border,#444);border-radius:16px 16px 0 0;}}"
  ].join("\n");

  var overlay = null, msgsEl = null, inputEl = null, sendBtn = null, ctxSnip = null;

  // CSS disuntik saat boot (bukan saat panel dibuka) supaya tombol launcher
  // langsung tampil versi bagusnya sejak awal — tidak polos dulu baru
  // berubah setelah diklik.
  function ensureCSS() {
    if (document.getElementById("pc-css")) return;
    var st = document.createElement("style");
    st.id = "pc-css";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function ensureUI() {
    if (overlay) return;
    ensureCSS();
    overlay = document.createElement("div");
    overlay.id = "pcOverlay";
    overlay.hidden = true;
    overlay.innerHTML =
      '<div id="pcPanel" role="dialog" aria-modal="true" aria-label="Chat Prompt Builder">' +
        '<div id="pcHead"><div><div class="pc-title">💬 Chat Prompt</div>' +
        '<div class="pc-sub">Ngobrol dengan AI untuk meracik prompt · Chat with AI to craft your prompt</div></div>' +
        '<button id="pcNew" type="button" title="Reset: lupakan percakapan ini, mulai baru (Reset chat memory)">↻ Baru</button>' +
        '<button id="pcClose" type="button" title="Tutup / Close">✕</button></div>' +
        '<div id="pcCtx"><span>📝</span><span class="pc-snip" id="pcSnip"></span><button id="pcRefreshCtx" type="button" title="Baca ulang Description box">↻</button></div>' +
        '<div id="pcMsgs" aria-live="polite"></div>' +
        '<div id="pcChips"></div>' +
        '<div id="pcInputRow"><textarea id="pcInput" rows="2" placeholder="Ceritakan ide gambarmu… (describe your idea…)"></textarea>' +
        '<button id="pcSend" type="button">➤</button></div>' +
        '<div id="pcFoot">Prompt final selalu Bahasa Inggris (terbaik untuk model gambar) · Final prompt is always in English · <button type="button" id="pcReset" style="background:none;border:none;color:inherit;text-decoration:underline;cursor:pointer;font-size:inherit;padding:0;">mulai baru / reset</button></div>' +
      "</div>";
    document.body.appendChild(overlay);
    msgsEl = $("pcMsgs"); inputEl = $("pcInput"); sendBtn = $("pcSend"); ctxSnip = $("pcSnip");
    $("pcClose").addEventListener("click", close);
    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) close(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlay && !overlay.hidden) close();
    });
    $("pcRefreshCtx").addEventListener("click", refreshCtx);
    function resetChat() {
      if (!messages.length) { toast("Masih baru — belum ada yang perlu di-reset"); return; }
      var doIt = function () {
        messages = []; summary = ""; saveHist();
        if (msgsEl) msgsEl.innerHTML = "";
        greet(true);
        toast("🆕 Percakapan baru dimulai — AI lupa konteks lama");
      };
      try {
        if (typeof window.uiConfirm === "function") {
          window.uiConfirm("Mulai percakapan baru? AI akan melupakan seluruh konteks chat ini. (Field Basic tidak ikut dihapus.)", { okText: "Reset" }).then(function (ok) { if (ok) doIt(); });
          return;
        }
      } catch (e) {}
      doIt();
    }
    $("pcReset").addEventListener("click", resetChat);
    $("pcNew").addEventListener("click", resetChat);
    sendBtn.addEventListener("click", function () { sendFromInput(); });
    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendFromInput(); }
    });
    chipWrap = $("pcChips");
    renderChips([
      { label: "✨ Langsung buatkan", msg: "Tolong langsung buatkan prompt finalnya sekarang ✨" },
      { label: "❓ Tanya saya dulu", msg: "Tanya saya dulu beberapa hal sebelum membuat promptnya" },
      { label: "💡 Beri 3 ide konsep", msg: "Beri saya 3 ide konsep berbeda dari ide ini, saya pilih salah satu" },
      { label: "🎨 Lebih sinematik", msg: "Buat promptnya lebih sinematik: dramatic lighting, depth of field" }
    ]);
    loadHist();
    renderHistory();
  }

  function refreshCtx() {
    var t = currentBoxText();
    ctxSnip.textContent = t ? t.slice(0, 120) : "(Description box kosong — ceritakan idemu di chat)";
    ctxSnip.title = t || "";
  }

  function greet(force) {
    var hasGreet = msgsEl.querySelector(".pc-a");
    if (hasGreet && !force) return;
    var box = currentBoxText();
    var txt = box
      ? "Halo! 👋 Aku lihat Description box-mu sudah ada isi. Mau langsung kubuatkan prompt finalnya, atau kita utak-atik bareng dulu? (Balas Bahasa Indonesia / English — terserah kamu.)"
      : "Halo! 👋 Ceritakan ide gambarmu — subjek, suasana, gaya yang kamu mau. Aku akan tanya yang kurang, lalu meracik prompt finalnya dalam Bahasa Inggris.";
    var d = addAssistantStatic(txt, "");
    if (d) d.id = "pc-greet";
  }

  function open() {
    ensureUI();
    // Chat ini khusus Basic (field paling lengkap): paksa mode Basic agar target field ada.
    try {
      if (window.ensureGenExtras) window.ensureGenExtras();
      if (window.__nexoraMode && window.t2iMode !== "basic") window.__nexoraMode.setMode("basic");
    } catch (e) {}
    refreshCtx();
    // Sapaan menyesuaikan isi box terkini: bila belum ada percakapan nyata,
    // sapaan lama dibuang dan dibuat ulang (mis. box sudah dikosongkan).
    if (messages.length === 0) {
      try { var g = $("pc-greet"); if (g && g.parentNode) g.parentNode.removeChild(g); } catch (e) {}
      greet(true);
    } else if (!msgsEl.children.length) {
      greet(false);
    }
    overlay.hidden = false;
    setTimeout(function () { try { inputEl.focus(); } catch (e) {} }, 60);
  }
  function close() { if (overlay) overlay.hidden = true; }

  function renderHistory() {
    if (!msgsEl) return;
    msgsEl.innerHTML = "";
    for (var i = 0; i < messages.length; i++) {
      var line = messages[i];
      if (line.indexOf("User: ") === 0) addUserStatic(line.slice(6));
      else if (line.indexOf("Assistant: ") === 0) {
        var body = line.slice(11);
        addAssistantStatic(stripBlock(body), extractPrompt(body));
      }
    }
    var lastA = "";
    for (var j = messages.length - 1; j >= 0; j--) {
      if (messages[j].indexOf("Assistant: ") === 0) { lastA = messages[j].slice(11); break; }
    }
    if (lastA) {
      var ch = extractChoices(lastA);
      renderChips(ch.length ? ch : [{ label: "✨ Langsung buatkan", msg: "Tolong langsung buatkan prompt finalnya sekarang ✨" }]);
    }
  }

  function scrollBottom() {
    try { msgsEl.scrollTop = msgsEl.scrollHeight; } catch (e) {}
  }
  function addUserStatic(text) {
    var d = document.createElement("div");
    d.className = "pc-u";
    d.textContent = text;
    msgsEl.appendChild(d);
    scrollBottom();
  }
  function promptCard(prompt) {
    var card = document.createElement("div");
    card.className = "pc-card";
    var lab = document.createElement("div");
    lab.className = "pc-plabel";
    lab.textContent = "🎯 Draf prompt (English)";
    card.appendChild(lab);
    var pre = document.createElement("pre");
    pre.textContent = prompt;
    card.appendChild(pre);
    var row = document.createElement("div");
    row.className = "pc-actions";
    var use = document.createElement("button");
    use.type = "button"; use.textContent = "✅ Terapkan ke Basic";
    use.title = "Konfirmasi: isi field-field Basic (Deskripsi, Style, Mixer, Canvas…) dari draf ini";
    use.addEventListener("click", function () { confirmApply(prompt, use); });
    var justDesc = document.createElement("button");
    justDesc.type = "button"; justDesc.className = "ghost"; justDesc.textContent = "📝 Deskripsi aja";
    justDesc.title = "Hanya tulis ke Description box (Description only)";
    justDesc.addEventListener("click", function () { applyPromptToGen(prompt); });
    var cp = document.createElement("button");
    cp.type = "button"; cp.className = "ghost"; cp.textContent = "📋";
    cp.title = "Salin / Copy";
    cp.addEventListener("click", function () { copyText(prompt, "Prompt"); });
    var vault = document.createElement("button");
    vault.type = "button"; vault.className = "ghost"; vault.textContent = "📚";
    vault.title = "Simpan ke Vault / Save to vault";
    vault.addEventListener("click", function () {
      try {
        if (window.Vault && window.Vault.add) {
          window.Vault.add(prompt, { tags: ["prompt-chat"], tab: "gen" });
          toast("📚 tersimpan di Vault");
        } else toast("⚠️ vault belum siap");
      } catch (e) { toast("⚠️ gagal menyimpan"); }
    });
    var send = document.createElement("button");
    send.type = "button"; send.className = "ghost"; send.textContent = "▸ Kirim";
    send.title = "Kirim ke tab lain / Send to another tab";
    send.addEventListener("click", function () {
      try {
        if (window.PromptBridge && window.PromptBridge.sendTo) {
          window.PromptBridge.sendTo(prompt, { anchor: send, preview: prompt, tags: ["prompt-chat"] });
        } else toast("⚠️ bridge belum siap");
      } catch (e) { toast("⚠️ gagal mengirim"); }
    });
    row.appendChild(use); row.appendChild(justDesc); row.appendChild(cp); row.appendChild(vault); row.appendChild(send);
    card.appendChild(row);
    return card;
  }
  function addAssistantStatic(chatText, prompt) {
    var d = document.createElement("div");
    d.className = "pc-a";
    if (chatText) {
      var span = document.createElement("div");
      span.textContent = chatText;
      d.appendChild(span);
    }
    if (prompt) d.appendChild(promptCard(prompt));
    msgsEl.appendChild(d);
    scrollBottom();
    return d;
  }

  function sendFromInput() {
    if (busy) return;
    var t = (inputEl.value || "").trim();
    if (!t) return;
    inputEl.value = "";
    send(t);
  }

  function send(text, taskOverride) {
    if (busy) return;
    if (!window.root || !window.root.generateText) { toast("⚠️ AI text belum siap — coba lagi sebentar"); return; }
    ensureUI();
    if (overlay.hidden) open();
    messages.push("User: " + text);
    saveHist();
    addUserStatic(text);
    renderChips([]);
    chat(taskOverride || REPLY_TASK);
  }

  function sendDirect() {
    if (busy) return;
    var box = currentBoxText();
    var idea = box ? "Buatkan prompt final dari ide ini: " + box : "Buatkan prompt final yang menarik — pilih sendiri subjek yang bagus ✨";
    send(idea, DIRECT_TASK);
  }

  async function chat(task) {
    busy = true;
    sendBtn.disabled = true;
    var bubble = document.createElement("div");
    bubble.className = "pc-a pc-typing";
    bubble.textContent = "AI mengetik";
    msgsEl.appendChild(bubble);
    scrollBottom();
    var full = "";
    try {
      var res = await window.root.generateText({
        instruction: buildPrompt(task),
        stopSequences: ["\nUser:"],
        onChunk: function (d) {
          if (!d) return;
          full = d.fullTextSoFar != null ? String(d.fullTextSoFar) : full + String(d.textChunk || "");
          bubble.textContent = full;
          scrollBottom();
        }
      });
      var text = String((res && res.text != null) ? res.text : full).trim();
      if (!text) throw new Error("empty");
      messages.push("Assistant: " + text);
      saveHist();
      bubble.remove();
      addAssistantStatic(stripBlock(text), extractPrompt(text));
      var chc = extractChoices(text);
      renderChips(chc.length ? chc : [{ label: "✨ Langsung buatkan", msg: "Tolong langsung buatkan prompt finalnya sekarang ✨" }]);
      maybeCompact();
    } catch (e) {
      console.error("[prompt-chat]", e);
      bubble.remove();
      var err = document.createElement("div");
      err.className = "pc-err";
      err.textContent = "⚠️ Gagal menghubungi AI — coba lagi.";
      var rb = document.createElement("button");
      rb.type = "button"; rb.textContent = "↻ Coba lagi";
      rb.addEventListener("click", function () {
        err.remove();
        // Ulangi turn terakhir: drop balasan gagal (tidak ada) dan panggil lagi.
        chat(task);
      });
      err.appendChild(document.createElement("br"));
      err.appendChild(rb);
      msgsEl.appendChild(err);
      scrollBottom();
    } finally {
      busy = false;
      sendBtn.disabled = false;
      try { inputEl.focus(); } catch (e) {}
    }
  }

  /* ---------- entry points ---------- */
  window.__openPromptChat = open;
  window.__promptChatSendDirect = sendDirect;

  // Launcher: baris tombol sendiri tepat di atas 🧰 Prompt tools,
  // selalu kelihatan di semua mode (Simple/Basic/Advanced, tidak ikut collapse)
  // supaya UI stabil — tidak berubah-ubah saat ganti mode.
  function paintLauncher() {
    try {
      var r = $("pc-launcher-row");
      if (r) r.hidden = false;
    } catch (e) {}
  }
  var tries = 0;
  (function poll() {
    tries++;
    try {
      ensureCSS();
      // Migrasi: cabut tombol lama bila masih ada di dalam toolbar.
      var stale = document.querySelector('#gen-tools #pc-open-btn');
      if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
      var anchor = document.getElementById("gen-tools");
      if (anchor && !$("pc-launcher-row")) {
        var row = document.createElement("div");
        row.id = "pc-launcher-row";
        var b = document.createElement("button");
        b.type = "button"; b.id = "pc-open-btn";
        b.innerHTML = "💬 <b>Chat Prompt</b> <span>— chat with AI, auto-fill the Basic fields</span>";
        b.title = "Chat with AI to fill the Basic fields";
        b.addEventListener("click", open);
        row.appendChild(b);
        anchor.parentNode.insertBefore(row, anchor);
      }
      paintLauncher();
    } catch (e) {}
    if (tries < 120) setTimeout(poll, 500);
  })();
  document.addEventListener("nex-mode-change", function () { paintLauncher(); });
})();
