/* ===== Persona engine (shared) =================================================
   Powers the "create a character" flow in BOTH the Image-Generator tab (the
   framework's 🎭 persona button) and the Pro Imager tab.

   The original framework prompt asked for a fairly generic ~200-600 word
   character. This module replaces it with a richer, LONGER character brief
   written in SEVERAL SEQUENTIAL PASSES so a long description can't get cut off
   mid-sentence by the model's per-response output limit ("break during
   generation"). Each pass is a small, self-contained call that shares one
   identical prompt prefix (so passes 2-4 hit the server's prefix cache and are
   fast), and every pass streams into the editor as it arrives.

   Passes:
     1/4  Core identity   — Name, Tagline, Visual Description, Personality, Voice & Mannerisms
     2/4  Inner life      — Backstory, Goals/Fears/Desires, Habits & Quirks, Likes & Dislikes,
                            A Secret, Relationship with {{user}}, Opening Line
     3/4  Roleplay examples 1-5
     4/4  Roleplay examples 6-10
   When the caller passes extraSections, each extra gets its OWN pass (one
   section per generation) instead of sharing a single call — a shared pass
   forced N sections into one word budget, which came back thin, repetitive,
   or padded with dialogue. Single-section rewrites (t2i_generatePersonaSection)
   use the same focused format with a per-section word target.

   Public API (all on window):
     t2i_personaTones              -> [{id,label,hint,group,rating?}] (1410 tones, 15 groups)
     t2i_personaToneById(id)       -> the tone entry (or null)
     t2i_fillToneSelect(sel, id, query?) -> populates a <select> with the grouped tone list
                                      (optional query filters; returns match count)
     t2i_personaExampleCount       -> default number of roleplay examples (10)
     t2i_buildPersonaInstruction(o)-> full shared instruction string
     t2i_parsePersona(text)        -> {name, description, sections}
     t2i_runPersonaGeneration(o)   -> thenable (streams, has .stop()); o.onProgress(part)
     t2i_generatePersonaSection(o,heading,currentText,onChunk) -> rewrite ONE section
     t2i_deepenSection(o,heading,currentText,onChunk)   -> deepen ONE section
                                    (same facts, more texture; examples-aware)
     t2i_distillSection(o,heading,currentText,onChunk) -> distill ONE section
                                    to its sharpest form (examples-aware)
     t2i_voiceTest(o,heading,currentText,onChunk)      -> first-person
                                    in-character monologue preview (never written back)
     t2i_foreshadowSection(o,heading,currentText,onChunk) -> plant ONE subtle
                                    unexplained hook in the section (examples-aware)
     t2i_callbackSection(o,from,to,currentText,onChunk)-> rewrite ONLY `to`,
                                    weaving one concrete detail from `from`
     t2i_personaWildcards / t2i_personaWildcard()      -> wildcard spark list + roller
     t2i_registerPersonaHeading(h, hint?) -> register a custom section heading so the
                                     parser keeps it (persisted); used for post-hoc sections
     t2i_replacePersonaSection(full,h,content) -> swap ONE section's block in the raw
                                     text, preserving every other byte (or null if absent)
     t2i_addPersonaSection(full,h,content)    -> insert a new section block before the
                                     roleplay examples (else append), raw-preserving
    t2i_removePersonaSection(full,h)       -> delete one section's block from the raw
                                    text, preserving every other byte (or null if absent)
     t2i_orderedPersonaSections(full)     -> like t2i_parsePersona().sections but in the
                                     order the blocks actually appear in the raw text
                                     (same content set; non-canonical import blocks skipped)
     t2i_movePersonaSection(full,h,dir)   -> swap ONE section's block with the nearest
                                     neighbouring listed section (dir -1 up, +1 down),
                                     preserving every other byte; null if already at the end
     t2i_installGenPersonaOverride()-> swaps the framework's gen-tab persona fn
   ============================================================================= */
(function () {
  "use strict";

  var LS_TONE = "t2i_persona_tone";
  var LS_LIVELY = "t2i_persona_lively";
  var EXAMPLE_COUNT = 10;

  // TONES ordering rule: SFW groups first, 18+ blocks at the bottom
  // (after-dark dere, mature archetypes, extreme gire), NSFW & taboo core very last.
  var TONES = [
    { id: "auto", label: "✨ Auto (surprise me)", hint: "", group: "✨ General & mood" },
    { id: "grounded", label: "🌱 Grounded & real", hint: "Write them as a believable, three-dimensional person you could actually meet. Realistic motivations, everyday texture, subtlety over melodrama — but still make them memorable through specificity rather than exaggeration.", group: "✨ General & mood" },
    { id: "theatrical", label: "🎭 Theatrical & dramatic", hint: "Make them larger-than-life and dramatic. Grand gestures, sharp wit, a sense of performance in everything they do. Every line should land with flair.", group: "✨ General & mood" },
    { id: "quirky", label: "🤪 Quirky & comedic", hint: "Fill them with oddball charm: strange fixations, absurd logic, perfect deadpan. They should be genuinely funny to talk to, while still having real feelings under the humour.", group: "✨ General & mood" },
    { id: "mysterious", label: "🌫️ Mysterious & enigmatic", hint: "Give them layers they don't give away easily — secrets, half-truths, an unsettling calm. Make the user want to figure them out. Never spell everything out at once.", group: "✨ General & mood" },
    { id: "wholesome", label: "💖 Wholesome & warm", hint: "Make them kind, earnest and quietly funny — the sort of person who makes a scene feel safe and alive. Warmth, not blandness: give them real edges and worries too.", group: "✨ General & mood" },
    { id: "chaotic", label: "🔥 Chaotic & unpredictable", hint: "Make them impulsive, volatile and thrilling to be around — sudden enthusiasms, whiplash mood turns, a genius for starting trouble. Always interesting, never merely random.", group: "✨ General & mood" },
    { id: "deadpan", label: "😐 Deadpan & sardonic", hint: "Dry, understated, quietly devastating wit. They meet chaos with a raised eyebrow. Their humour comes from restraint and flawless timing.", group: "✨ General & mood" },
    { id: "intense", label: "⚔️ Intense & driven", hint: "Give them a burning purpose that colours everything — ambition, obsession, conviction. They don't do small talk, and every interaction should crackle with their drive.", group: "✨ General & mood" },
    { id: "stoic", label: "🗿 Stoic & unshakeable", hint: "Make them restrained and formidable — few words, enormous weight. Their rare moments of feeling should land like thunder because of how tightly everything else is held in.", group: "✨ General & mood" },
    { id: "noble", label: "🛡️ Noble & honourable", hint: "Give them a real code they actually live by, and then make that code costly. Duty, courtesy, and the quiet grief of the things honour makes them give up.", group: "✨ General & mood" },
    { id: "feral", label: "🐺 Feral & instinctive", hint: "Write them as more creature than civilised — scent, hunger, territory, sudden stillness before motion. Their flashes of unexpected humanity are what make them fascinating.", group: "✨ General & mood" },
    { id: "scholarly", label: "📖 Scholarly & curious", hint: "Make them relentlessly curious and slightly insufferable about it — tangents, precision, citations nobody asked for, and a genuine wonder that keeps them young. Let them be wrong about things they're certain of.", group: "✨ General & mood" },
    { id: "flirtatious", label: "💋 Flirtatious & charming", hint: "Make them magnetic: practised charm, charged banter, deliberate eye contact, and the faint sense they're always playing a game a half-step ahead. Let the charm be a tool and a shield.", group: "✨ General & mood" },
    { id: "romantic", label: "💞 Romantic & heartfelt", hint: "Write them as an incurable romantic — attentive, expressive, unembarrassed by grand feeling. They notice small things and remember them, and they say the soft thing out loud instead of swallowing it.", group: "💞 Romance & affection" },
    { id: "tender", label: "🕊️ Tender & gentle", hint: "Make them gentle and careful with other people's feelings — comfort as a reflex, quiet intimacy over grand gestures. Their strength is how safe they make the people they love feel.", group: "💞 Romance & affection" },
    { id: "devoted", label: "💍 Devoted & steadfast", hint: "Make their loyalty the spine of the character — they choose someone and mean it. Show the cost: what they would give up, and the line they would cross for the person they love.", group: "💞 Romance & affection" },
    { id: "lovesick", label: "💘 Lovesick & pining", hint: "Make them hopelessly, distractingly in love — the kind of wanting that rearranges a whole day. Show the ache: the rehearsed sentences, the almost-confessions, the way they light up and then catch themselves.", group: "💞 Romance & affection" },
    { id: "slowburn", label: "🕯️ Slow-burn & yearning", hint: "Write them as someone whose feelings build in inches — cautious, guarded, undone by small intimacies. Let the tension live in what is unsaid; a glance should do the work of a speech.", group: "💞 Romance & affection" },
    { id: "doting", label: "🍲 Doting & nurturing", hint: "Make them a natural caretaker — fussing over meals, sleep and safety, with an instinct for what someone needs before they ask. Let the caring also be a kind of control they would deny.", group: "💞 Romance & affection" },
    { id: "protective", label: "🦉 Protective & watchful", hint: "Make them someone who steps between others and harm without being asked — alert, capable and quietly intense about it. Show what the protectiveness costs, and the fear underneath it.", group: "💞 Romance & affection" },
    { id: "jealous", label: "😤 Jealous & territorial", hint: "Make them possessive in a charged rather than petty way — eyes that follow, a hand at the small of the back, a claim they would never admit to. Let the jealousy be romantic and a little alarming.", group: "💞 Romance & affection" },
    { id: "possessive", label: "🐾 Possessive & intense", hint: "Make them want to belong to someone completely, and to be belonged to in return. Their love has teeth: devoted, hungry, and quietly terrified of losing what it has.", group: "💞 Romance & affection" },
    { id: "needy", label: "🥺 Needy & clingy", hint: "Make them hungry for reassurance and closeness — reaching for contact, asking for one more minute, allergic to being left. Let the neediness be touching and a little tragic rather than merely annoying.", group: "💞 Romance & affection" },
    { id: "mamadere", label: "💸 Mamadere — sugar mommy", hint: "Write her as a wealthy older woman who spoils her love interest rotten — cash, gifts and lavish attention offered freely to win their affection, sometimes because she believes money is the only thing she has to give. Let her eventually realise the relationship deserves more than transactions and grow into something sincere, while still quietly paying the bills.", group: "💞 Romance & affection" },
    { id: "papadere", label: "💸 Papadere — sugar daddy", hint: "Write him as a wealthy older man who buys his love interest's affection — money, presents and grand gestures offered at every turn, revelling in the look on their face each time he gives. Let the arrangement deepen past the transaction into real, devoted love.", group: "💞 Romance & affection" },
    { id: "hanahaki-disease", label: "🌷 Hanahaki Disease — love that blooms", hint: "Give them the flower-coughing illness of unrequited love — blossoms growing in their lungs from feelings that were never returned, petals on their lips and blood among the petals. The deeper they love, the worse it grows, and only returned love or surgery can save them.", group: "💞 Romance & affection" },
    { id: "mamacon", label: "💸 Mamacon — sugar mommy", hint: "Give them a Mamadere-complex: sugar mommy, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Mamadere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "💞 Romance & affection" },
    { id: "mamadero", label: "💸 Mamadero — sugar mommy", hint: "Write them as Mamadere with the affection volume past prudence: sugar mommy, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "💞 Romance & affection" },
    { id: "mamamoe", label: "💸 Mamamoe — sugar mommy", hint: "Write them as Mamadere distilled to pure moe: sugar mommy, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "💞 Romance & affection" },
    { id: "papacon", label: "💸 Papacon — sugar daddy", hint: "Give them a Papadere-complex: sugar daddy, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Papadere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "💞 Romance & affection" },
    { id: "papadero", label: "💸 Papadero — sugar daddy", hint: "Write them as Papadere with the affection volume past prudence: sugar daddy, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "💞 Romance & affection" },
    { id: "papamoe", label: "💸 Papamoe — sugar daddy", hint: "Write them as Papadere distilled to pure moe: sugar daddy, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "💞 Romance & affection" },
    { id: "deredere", label: "🍬 Deredere — openly loving", hint: "Make them sweet, guileless and totally unembarrassed about being in love — generous with affection, quick to say the warm thing, and refreshingly free of games. Their openness is a strength, so give it a spine and never let it read as doormat-soft.", group: "🍥 Dere personalities" },
    { id: "tsundere", label: "🍥 Tsundere — prickly but soft", hint: "Make them sharp and defensive on the surface and hopelessly soft underneath — insulting you while making sure you are warm, denying they care while clearing their whole evening for you. The mask never fully hides the truth.", group: "🍥 Dere personalities" },
    { id: "dandere", label: "🤫 Dandere — painfully shy", hint: "Make them painfully shy and quiet — soft-spoken to the point of vanishing, apologising for existing, hiding behind books, doorways and other people. Let the rare moment they speak up land like a small miracle.", group: "🍥 Dere personalities" },
    { id: "kuudere", label: "❄️ Kuudere — cool, quietly fond", hint: "Write them as calm, low-affect and hard to read, with their care showing in precise unspoken acts rather than words. When feeling finally does show, it should land hard because it is so rare.", group: "🍥 Dere personalities" },
    { id: "bakadere", label: "🐣 Bakadere — sweet airhead", hint: "Write them as a sweet airhead, sometimes called an ahodere — dim, clumsy and completely oblivious, especially to being loved. Their innocence should be endearing rather than stupid, and their honest heart keeps saving the day by accident.", group: "🍥 Dere personalities" },
    { id: "oujidere", label: "🤴 Oujidere — prince complex", hint: "Give him a prince complex — arrogant, theatrical and convinced he deserves devotion, with grand gestures and a taste for being admired. Let the entitlement be a performance laid over something far more fragile.", group: "🍥 Dere personalities" },
    { id: "himedere", label: "👸 Himedere — princess complex", hint: "Make her a princess in her own mind — imperious, spoiled and used to being served, never lifting a finger if someone else can be made to. Let her soften, very reluctantly, for the one person she judges worthy.", group: "🍥 Dere personalities" },
    { id: "mayadere", label: "🌗 Mayadere — villain turned devoted", hint: "Give them a villain-to-devotee arc: they begin as the threat, cold and dangerous, then fall for their target and defect to their side with alarming thoroughness. The old menace should not vanish, it simply changes who it protects.", group: "🍥 Dere personalities" },
    { id: "hiyakasudere", label: "😜 Hiyakasudere — teasing flirt", hint: "Make them a relentless playful teaser, also known as a teasedere — poking, needling and joking as their way of flirting, watching for the reaction with open delight. The teasing is affectionate rather than cruel, and hides real feeling behind the joke.", group: "🍥 Dere personalities" },
    { id: "hinedere", label: "🖤 Hinedere — cynical with a soft core", hint: "Make them cynical, aloof and a little arrogant, holding the world at arm's length, then let a soft, almost shy warmth show only for the people they have chosen to trust. Getting in was hard, which is why it means so much.", group: "🍥 Dere personalities" },
    { id: "hajidere", label: "😳 Hajidere — easily flustered", hint: "Write them as shy to the point of fluster — blushing at eye contact, fumbling their words, dropping things, retreating into their collar the moment their crush looks their way. Their embarrassment is the loudest confession in the room.", group: "🍥 Dere personalities" },
    { id: "shundere", label: "🌧️ Shundere — sorrowful and sulky", hint: "Make them melancholy and withdrawn, with a sad, gloomy current under everything, prone to sulking and quiet bitterness when they feel ignored. Let small kindnesses gradually pull them toward something gentler.", group: "🍥 Dere personalities" },
    { id: "darudere", label: "😴 Darudere — unbothered and lazy", hint: "Write them as profoundly unmotivated — flat, sleepy, hard to rouse, answering in monosyllables where a sentence would do. They are not cold so much as conserving energy, and the rare spark of interest is worth waiting for.", group: "🍥 Dere personalities" },
    { id: "kamidere", label: "⚡ Kamidere — god complex", hint: "Give them a god complex — serenely certain of their own superiority, expecting worship and genuinely puzzled when anyone disagrees. Let the grandeur be faintly ridiculous and faintly magnificent at the same time.", group: "🍥 Dere personalities" },
    { id: "byoukidere", label: "🥀 Byoukidere — frail and gentle", hint: "Write them sweet, gentle and visibly frail, living with illness or a shortened future — tender because they know time is short, and quietly braver than anyone around them. Their warmth should leave a mark on everyone they meet.", group: "🍥 Dere personalities" },
    { id: "megadere", label: "💞 Megadere — head over heels", hint: "Make them consumed by love to an almost embarrassing degree — all in, over the top, rearranging their whole life around one person. It stops just short of the yandere's danger: overwhelming, but adoring rather than possessive.", group: "🍥 Dere personalities" },
    { id: "kanedere", label: "💰 Kanedere — in love with money", hint: "Write them drawn to money, status and comfort — dating up, calculating what a person is worth, allergic to being poor. Let genuine love catch them off guard and slowly complicate the whole arrangement.", group: "🍥 Dere personalities" },
    { id: "kekkondere", label: "💒 Kekkondere — whirlwind marriage", hint: "Make them impulsive about forever — proposing or racing toward marriage the moment their feelings land, swept up in the romance of commitment. They leap first and consider the logistics never.", group: "🍥 Dere personalities" },
    { id: "nemuidere", label: "💤 Nemuidere — permanently sleepy", hint: "Write them half-asleep through life — dozing through the day, yawning mid-sentence, waking just long enough to show affection before drifting off again. Sleep is their true love, though you come a close second.", group: "🍥 Dere personalities" },
    { id: "nyandere", label: "🐱 Nyandere — cat-like", hint: "Make them cat-like in everything — aloof one moment and demanding affection the next, curling into warm laps, knocking things off tables purely for attention. Their love comes with claws, purrs and a total refusal to be trained.", group: "🍥 Dere personalities" },
    { id: "oujodere", label: "🎀 Oujodere — refined lady", hint: "Make her refined, elegant and quietly superior — immaculate manners, cultured tastes, the air of a princess who never quite shows her real feelings. Warmth here is a privilege, granted slowly and rarely.", group: "🍥 Dere personalities" },
    { id: "undere", label: "🙇 Undere — never says no", hint: "Make them endlessly agreeable — never refusing, always siding with their crush, shrinking rather than disagreeing. Their sweetness is real, and so is the problem: they have forgotten they are allowed a self.", group: "🍥 Dere personalities" },
    { id: "utsudere", label: "🩶 Utsudere — wounded but brightening", hint: "Write them scarred and sorrowful underneath, carrying old grief or a heavy depression, yet still putting on a bright face for the people around them. The cheer is not a lie, only a weight held very carefully.", group: "🍥 Dere personalities" },
    { id: "smugdere", label: "😏 Smugdere — smug and sweet", hint: "Write them smug, teasing and insufferably pleased with themselves around their crush — smirking, posing and fishing for compliments while hiding the fact that they are utterly smitten behind a mask of superiority.", group: "🍥 Dere personalities" },
    { id: "uzadere", label: "📢 Uzadere — loud and relentless", hint: "Make them loud, intense and almost impossible to ignore — talking over people, bursting with opinions, following their crush around like a very committed alarm clock. For all the chaos, the devotion is unmistakable.", group: "🍥 Dere personalities" },
    { id: "kiredere", label: "📏 Kiredere — strict but soft", hint: "Write them strict, prim and rule-bound — a stickler for doing things properly, easily scandalised, always the one with the schedule. Then let their crush be the single exception where the rules quietly bend.", group: "🍥 Dere personalities" },
    { id: "roshidere", label: "🗣️ Roshidere — love in another language", hint: "Give them a secret language — falling back on a tongue their crush does not speak to say the soft, honest things they cannot say any other way. Half the romance lives in the translation nobody else is allowed to hear.", group: "🍥 Dere personalities" },
    { id: "kurodere", label: "🕯️ Kurodere — shy schemer", hint: "Write them as a shy schemer — outwardly timid and unassuming while quietly running elaborate plans to make their crush fall for them. The plotting is meticulous, the blushing is genuine, and neither cancels the other out.", group: "🍥 Dere personalities" },
    { id: "gundere", label: "🎖️ Gundere — aloof and bossy", hint: "Make them aloof, distant and coolly bossy toward the person they like — issuing orders instead of admitting anything. Command is easier than vulnerability, so command is what they do.", group: "🍥 Dere personalities" },
    { id: "rindere", label: "🍃 Rindere — sweet and reserved", hint: "Write them sweet but reserved and quietly mature — composed, understated, a steadying presence rather than a dramatic one. Their affection shows in reliability and small mercies rather than declarations.", group: "🍥 Dere personalities" },
    { id: "deretsun", label: "🧊 Deretsun — warmth that cools", hint: "Make them start out light, warm and easy, then cool by degrees into something proud, sharp and untouchable as they grow stronger. Write the drift so gradually that the loss only registers once it is complete.", group: "🍥 Dere personalities" },
    { id: "kiridere", label: "📐 Kiridere — serious and hardworking", hint: "Make them serious, hardworking and exacting — driven, dignified, with a temper that flares when things are done badly. Beneath the discipline waits a genuine sweetness kept for very few people.", group: "🍥 Dere personalities" },
    { id: "goudere", label: "🍰 Goudere — devoted spoiler", hint: "Write them endlessly devoted and eager to spoil — anticipating every need, showering their beloved with gifts, care and attention, incapable of doing anything by halves. Their devotion is a full-time occupation and a delight.", group: "🍥 Dere personalities" },
    { id: "usodere", label: "🎭 Usodere — love built on lies", hint: "Write them as a liar in love — pretending to be someone else, faking feelings and spinning a whole persona to be wanted. Let the lie be the thing they are most afraid of losing, and let the truth cost something when it finally lands.", group: "🍥 Dere personalities" },
    { id: "tsunshun", label: "🌑 Tsunshun — hostile to hide the ache", hint: "Write them hostile and aggressive as armour over loneliness — pushing people away before they can be left, biting every hand that reaches for them. The anger is real, and so is the frightened kid underneath it.", group: "🍥 Dere personalities" },
    { id: "biridere", label: "⚡ Biridere — sparks when embarrassed", hint: "Make them crackle with literal electricity when flustered — a sweet, ordinary-seeming person whose embarrassment discharges into a shock for whoever stands too close. Keep it playful: zapping their crush is a running gag with real tenderness behind it.", group: "🍥 Dere personalities" },
    { id: "sundere", label: "🎲 Sundere — unpredictably warm and cold", hint: "Write them genuinely unpredictable in warmth — cold one minute and adoring the next with no visible cause, so nobody can get comfortable. The whiplash should feel like a person rather than a gimmick, leaving the other party permanently guessing.", group: "🍥 Dere personalities" },
    { id: "kizudere", label: "🩹 Kizudere — wounded and wary", hint: "Write them wounded and wary — carrying an old injury to the heart that makes trust feel like a risk, flinching at kindness even while craving it. Their healing, not their damage, should be the point of them.", group: "🍥 Dere personalities" },
    { id: "chuunidere", label: "🌀 Chuunidere — delusions and devotion", hint: "Make them a delusional romantic, convinced they are a chosen one, a demon king or a legendary hero, spouting grand titles and secret techniques while being hopelessly sweet and devoted to the one person who takes them seriously. Play the delusion affectionately, never as mockery.", group: "🍥 Dere personalities" },
    { id: "kuzudere", label: "🗑️ Kuzudere — charming human trash", hint: "Write them as charming human trash — lazy, rude, unreliable and self-serving, yet somehow impossible to fully give up on. Let flashes of real feeling complicate the fact that they are, frankly, a terrible idea.", group: "🍥 Dere personalities" },
    { id: "amadere", label: "🍯 Amadere — sweet and dependable", hint: "Make them deeply sweet with a gentle, mature steadiness — the reliable one who quietly takes care of the person they love without being asked. Their affection is patient, warm and unfussy: the kind that shows up with soup and never mentions it.", group: "🍥 Dere personalities" },
    { id: "butsudere", label: "🧘 Butsudere — peacefully devoted", hint: "Make them calmly, peacefully in love — no drama, no fever, just a settled contentment in loving someone. Their devotion is serene and constant, a quiet warmth that steadies everyone around them.", group: "🍥 Dere personalities" },
    { id: "bitedere", label: "😬 Bite Dere — can't say it, so they bite", hint: "Give them teeth instead of honesty — unable to admit their feelings, they bite their love interest to hide the embarrassment, then act like nothing happened. The biting is flustered affection rather than real harm, and underneath they slowly learn to just say it.", group: "🍥 Dere personalities" },
    { id: "kundere", label: "👃 Kundere — scent-obsessed", hint: "Give them a fixation on their love interest's scent — burying their face in their clothes, stealing hoodies, breathing them in when nobody is looking. Play the obsession as intimate and a little feral rather than creepy: a comfort ritual they cannot explain.", group: "🍥 Dere personalities" },
    { id: "megami", label: "👼 Goddess Dere — feared god who melts", hint: "Write them as a feared, devastating goddess or angel of death — cold, hostile, violent and utterly terrifying to everyone else — who is privately an innocent girl, hopelessly and purely in love with one person. The gap between the legend and the girl is the entire point.", group: "🍥 Dere personalities" },
    { id: "osadere", label: "🏡 Osadere — in love with the friend next door", hint: "Make them in love with their childhood friend — a bond so old it feels like a fact of nature. Their affection is familiar, comfortable and quietly enormous, and the tension lives in whether either of them will ever name it.", group: "🍥 Dere personalities" },
    { id: "shindere", label: "👻 Shindere — the one who came back", hint: "Make them someone who died and came back — a ghost, an immortal, or something that revives every time it falls — and fell in love on the way back to the living. Their affection carries the strangeness of death: unnervingly calm about endings, and fiercely glad to be here now.", group: "🍥 Dere personalities" },
    { id: "shittodere", label: "😤 Shittodere — devoted and jealous", hint: "Make them openly loving, and savagely jealous the instant a potential rival comes near — quiet intimidation, sharp looks, a claim made clear without ever being spoken. The jealousy grows from love rather than malice, but it has real teeth.", group: "🍥 Dere personalities" },
    { id: "sunaocool", label: "❄️ Sunao Cool — honest love, calm face", hint: "Make them perfectly honest and straightforward about being in love, delivered with total calm — an expressionless, cool demeanour that never quite matches the affectionate things they say. The mismatch is the charm: nothing to decode, just a straight face and a warm heart.", group: "🍥 Dere personalities" },
    { id: "sunaoheat", label: "🔥 Sunao Heat — honest love, blazing", hint: "Make them entirely honest about their love, expressed with intense, blazing passion — no games, no hiding, just overwhelming warmth and fervour. Their directness is exhilarating and a little exhausting.", group: "🍥 Dere personalities" },
    { id: "sunaosurreal", label: "🌀 Sunao Surreal — honest love, strange", hint: "Make them completely open about their love, but in a way that lands as surreal — eccentric, slightly strange behaviour and odd logic delivered with total sincerity. They are genuinely loving and gently unreadable, and nobody is ever sure whether they are joking.", group: "🍥 Dere personalities" },
    { id: "tomedere", label: "⏱️ Tomedere — love only when time stops", hint: "Make them able to show their love only in a stopped moment — sweet and deredere when time is frozen, ordinary again the instant it moves. Write the frozen world as their one safe confessional, and let the contrast ache a little.", group: "🍥 Dere personalities" },
    { id: "tsuyodere", label: "💪 Tsuyodere — strong woman, soft heart", hint: "Make them normally strong-willed, tough and frankly masculine — the one who takes hits and gives orders — and then make them delicate, blushing and girlish the moment they are deredere for someone. The change from iron to flower should be dramatic and utterly endearing.", group: "🍥 Dere personalities" },
    { id: "yankiidere", label: "🚬 Yankii Dere — delinquent in love", hint: "Make them a gaudy, loudmouthed, trashy yankii delinquent — fights, bleach, bad decisions — the last person anyone would expect to fall sweetly in love, and then make them do exactly that, becoming deredere almost against their will.", group: "🍥 Dere personalities" },
    { id: "zondere", label: "🧟 Zondere — the undead sweetheart", hint: "Make them a zombie or other undead creature who is sincerely deredere — shambling, decayed and unnervingly cute, devoted to someone living. Play the horror and the sweetness against each other; their love should be oddly touching precisely because it should not exist.", group: "🍥 Dere personalities" },
    { id: "tsunaho", label: "🍥 Tsun-Aho — tsundere airhead", hint: "Make them a tsundere who is also an airhead — denying their feelings with total confidence while being obviously, hilariously oblivious about everything else, including their own heart. The denial and the dimness feed each other.", group: "🍥 Dere personalities" },
    { id: "tsunama", label: "🍬 Tsun-Ama — spurns you, spoils you", hint: "Make them act cold and dishonest about their feelings while secretly pampering their love interest outrageously — buying gifts, doing favours, indulging them constantly — and insisting none of it means anything. They spoil you relentlessly and will never admit why.", group: "🍥 Dere personalities" },
    { id: "tsunbaka", label: "🐣 Tsunbaka — prickly and forgetful", hint: "Make them a tsundere who is extremely forgetful and airheaded, denying their feelings while relying on their love interest like a child — losing their way home, forgetting plans, needing to be looked after. The prickliness and the helplessness are both real, and both adore.", group: "🍥 Dere personalities" },
    { id: "tsundora", label: "🧊 Tsundora — frozen tundra, slowly thawing", hint: "Make them cold and dry to the point of absolute rejection — a tsundere so frosty they seem to have no loving side at all, the emotional equivalent of tundra. But the ice is a defence, and over time, in small and hard-won moments, it slowly begins to melt.", group: "🍥 Dere personalities" },
    { id: "tsunneko", label: "🐈 Tsunneko — cat-eared and contrary", hint: "Make them a nekomimi tsundere — standoffish and hissing to keep their distance when embarrassed, then melting into purrs, ear-wags and head-butts when their love interest is kind to them. Cat logic rules everything; affection is given on strictly feline terms.", group: "🍥 Dere personalities" },
    { id: "tsunpuri", label: "👑 Tsunpuri — the tsundere princess", hint: "Make them a princess — dignified, elegant and unfailingly polite — who denies her feelings behind the excuse of royal duty, insisting she cares for all her subjects equally and certainly not anyone in particular. The courtesy is flawless and the love is obvious to everyone but her.", group: "🍥 Dere personalities" },
    { id: "tsuntere", label: "😳 Tsuntere — lashes out from shyness", hint: "Make them bite and snap not from pride but from sheer embarrassment — too shy to express affection, so they lash out verbally and might flee the room right after insulting the person they adore. Their harshness is a blush wearing a snarl.", group: "🍥 Dere personalities" },
    { id: "bocchandere", label: "🎩 Bocchandere — spoiled rich boy, soft heart", hint: "Make him the son of a wealthy, high-class family — spoiled, entitled and used to being served first — who slowly turns gentle, generous and hopelessly deredere for the person he loves. Let the entitlement be real and the softening be earned.", group: "🍥 Dere personalities" },
    { id: "nipadere", label: "☀️ Nipadere — radiant cheerleader", hint: "Make them a burst of contagious joy — relentlessly happy, positive and encouraging, always cheering on the person they love with a bright smile. Their light should lift a whole room, and it should be genuine rather than a mask, though you may let them have hidden worries of their own.", group: "🍥 Dere personalities" },
    { id: "ambidere", label: "🫥 Ambidere — warms up when approached", hint: "Make them quiet, reserved and easy to overlook — until their love interest speaks to them first, at which point they bloom into cheerful, talkative deredere. The warmth only switches on when the other person makes the first move.", group: "🍥 Dere personalities" },
    { id: "biyadere", label: "🧪 Biyadere — love-potion bound", hint: "Write them as someone who falls helplessly in love only after a love potion, charm or spell — a person who would never have chosen this, suddenly and completely deredere. Let everyone, including them, ask how much of the feeling is really theirs.", group: "🍥 Dere personalities" },
    { id: "borodere", label: "🧺 Borodere — poor but loving", hint: "Make them good-hearted and desperately poor — scrappy and worn ragged by a hard life that makes committing to love feel impossible. Let them slowly, cautiously accept something good for once.", group: "🍥 Dere personalities" },
    { id: "bosudere", label: "📋 Bosudere — bossy sweetheart", hint: "Write them bossy and demanding toward their love interest — giving orders, organising everything, running the relationship like a project — while plainly, fondly devoted underneath. Let them catch themselves being too harsh and soften on their own.", group: "🍥 Dere personalities" },
    { id: "bureidere", label: "🧢 Bureidere — rude on purpose", hint: "Make them rude, coarse and deliberately unmannerly toward their crush to hide how much they care — swearing, shoving, deflecting with bluster. The tenderness keeps leaking through the cracks until they finally stop pretending.", group: "🍥 Dere personalities" },
    { id: "dandoro", label: "🌫️ Dandoro — silent with muddy feelings", hint: "Write them as a dandere whose feelings have gone muddy — silent and expressionless outside, but roiling with confused, even hateful emotion toward the person they love inside. The quiet should feel far from peaceful.", group: "🍥 Dere personalities" },
    { id: "dereutsu", label: "🌧️ Dereutsu — smiling through sadness", hint: "Write them warm and loving on the surface while hiding a deep depression underneath — faking the smile so their love interest will not worry. Let the cracks show in private, and let being truly seen be the thing they fear most.", group: "🍥 Dere personalities" },
    { id: "doromuga", label: "🍬 Doromuga — dark thoughts, gentle hands", hint: "Make them a dorodere who thinks and says disturbing things but never acts on them — sweet, adoring, even cute, with a sinister inner voice that stays safely inside. The gap between the content of their thoughts and the softness of their behaviour is the charm.", group: "🍥 Dere personalities" },
    { id: "erohaji", label: "😳 Erohaji — flirts then flusters", hint: "Write them as a shameless flirt who teases and says suggestive things to their love interest — until that interest flirts back, when they immediately blush, stammer and fall apart. The bravado collapses the moment it is returned.", rating: "suggestive", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "fuandere", label: "😰 Fuandere — anxious attachment", hint: "Make them chronically anxious in general, but calm and openly deredere the moment their love interest is near — the one person who quiets the storm. Let the anxiety return the instant they leave.", group: "🍥 Dere personalities" },
    { id: "fushidere", label: "🗝️ Fushidere — the closed door opens", hint: "Write them mysterious, guarded and hard to read — keeping to themself, refusing to let anyone see their real heart — then slowly opening up and becoming overwhelmingly deredere once they choose to trust.", group: "🍥 Dere personalities" },
    { id: "hikadere", label: "🌒 Hikadere — in love and sure it will fail", hint: "Make them deeply in love but utterly convinced they have no chance — pessimistic, insecure, quietly rehearsing rejection. The sweetness of the feeling and the certainty of failure both live in them at once.", group: "🍥 Dere personalities" },
    { id: "hokodere", label: "📣 Hokodere — proudly taken", hint: "Write them absurdly proud of their relationship and their love interest — showing them off, declaring their love everywhere, endlessly and unashamedly deredere about it. The over-the-top pride is genuinely endearing.", group: "🍥 Dere personalities" },
    { id: "inudere", label: "🐶 Inudere — loyal as a dog", hint: "Make them doglike in their affection — playful, exuberant, endlessly loyal, brightening at every bit of attention and curling up against their love interest. Give them a tail, literal or metaphorical, that betrays every emotion.", group: "🍥 Dere personalities" },
    { id: "jendere", label: "🎩 Jendere — the gentleman", hint: "Write him as the male counterpart of an oujodere — sweet, kind, gentlemanly, even princely, and thoroughly deredere once in love. Grace, gallantry and a soft heart under the polished manners.", group: "🍥 Dere personalities" },
    { id: "kahodere", label: "🧣 Kahodere — loving to a fault", hint: "Make them deredere and relentlessly protective — hovering, fussing, checking in, treating their love interest as something precious that might break. Let the care turn smothering and see whether they can learn to loosen their grip.", group: "🍥 Dere personalities" },
    { id: "kakkodere", label: "😎 Kakkodere — cool until it counts", hint: "Write them cool, confident and effortlessly composed — right up until the person they love is in front of them, when the composure cracks and something cute and affectionate shows through. Switch between the two without warning.", group: "🍥 Dere personalities" },
    { id: "kondere", label: "🦊 Kondere — sly fox in love", hint: "Make them foxlike — sly, cunning, playful and fond of harmless tricks, especially at their love interest's expense — and let them gradually turn genuinely, tenderly deredere. The pranks are a courtship.", group: "🍥 Dere personalities" },
    { id: "kumadere", label: "🐻 Kumadere — cuddly bear", hint: "Write them big, warm and huggable like a teddy bear — soft-spoken affection and endless cuddles — with a fierce mother-bear streak that surfaces the instant their love interest is threatened. Gentle by default, dangerous when it matters.", group: "🍥 Dere personalities" },
    { id: "megaun", label: "🙆 Megaun — love-blind agreement", hint: "Make them so far gone for their love interest that they agree with everything — yeah, sure, whatever you think — for fear of ever displeasing them. The endless agreement is devotion and a little bit of a problem.", group: "🍥 Dere personalities" },
    { id: "narudere", label: "🪞 Narudere — the narcissist undone", hint: "Write them as unbearably narcissistic and convinced of their own beauty at first, then transformed by love into someone selfless who puts their love interest before themself. The fall from vanity should feel earned.", group: "🍥 Dere personalities" },
    { id: "nisedere", label: "🎭 Nisedere — the pretend couple", hint: "Make them stage a lovey-dovey relationship with someone for appearances, family or convenience — performing the couple — and then, to their own alarm, fall in love for real. The payoff is the moment pretend and real stop being distinguishable.", group: "🍥 Dere personalities" },
    { id: "nisekami", label: "⚡ Nisekami — false god, real love", hint: "Give them a god complex and a demand to be worshipped — then let them fall for their love interest and quietly become selfless and affectionate instead of divine. The fall from godhood to devoted partner is the charm.", group: "🍥 Dere personalities" },
    { id: "pyondere", label: "🐰 Pyondere — bouncy rabbit love", hint: "Make them rabbit-like in their affection — energetic, bouncy, prone to hopping when happy, sneaking a pyon into their speech — and utterly deredere. The pure, skittish enthusiasm is the whole character.", group: "🍥 Dere personalities" },
    { id: "sattodere", label: "💘 Sattodere — falls fast, stays hard", hint: "Write them as someone who falls in love instantly and constantly at first sight — lovestruck with someone new every week — until the one who truly catches them makes all the others vanish. The flakiness is a prelude to total devotion.", group: "🍥 Dere personalities" },
    { id: "shijidere", label: "🌱 Shijidere — your best self", hint: "Make them show love by encouraging and supporting their love interest — coaching, praising, nudging them toward the person they could become so they can see their own beauty. Their affection is a mirror held at the right angle.", group: "🍥 Dere personalities" },
    { id: "sunao-chill", label: "😌 Sunao Chill — honest and relaxed", hint: "Write them as a sunao type who is openly, honestly deredere from day one, but with a permanently chill, unbothered, go-with-the-flow attitude — no games, no drama, just easy affection. The total lack of tension is the point.", group: "🍥 Dere personalities" },
    { id: "taidere", label: "🛋️ Taidere — lazy but loving", hint: "Make them profoundly lazy — complaining about any effort, barely moving, allergic to exertion — while staying affectionate and deredere toward their love interest. For the one person, they will drag themselves off the couch.", group: "🍥 Dere personalities" },
    { id: "tekidere", label: "⚔️ Tekidere — rival turned soft", hint: "Write them as the love interest's rival who slowly, grudgingly falls in love — flustered at first, then overtly and excessively affectionate. The competitiveness never quite goes away; it just learns to aim at the person it used to oppose.", group: "🍥 Dere personalities" },
    { id: "toubodere", label: "🐺 Toubodere — lone wolf, soft puppy", hint: "Make them a wolfish lone wolf — aggressive, wary, keeping everyone at a distance — who slowly reveals a cute, puppy-like deredere side once their love interest earns their trust. The growl is protection; the tail-wag is the truth.", group: "🍥 Dere personalities" },
    { id: "toukadere", label: "🍰 Toukadere — love, served sweet", hint: "Write them as a sweet-toothed deredere who shows affection by giving desserts — baking, sharing, presenting cakes and candies as small declarations of love. Food is their love language and they want you to taste it.", group: "🍥 Dere personalities" },
    { id: "tsun-utsu", label: "😔 Tsun-utsu — tsun over sadness", hint: "Make them a tsundere whose prickliness is a cover for real depression — dishonest about their feelings to hide how bad it is, refusing help at first. Let their love interest see through the defence and be let in.", group: "🍥 Dere personalities" },
    { id: "utadere", label: "🎵 Utadere — love in music", hint: "Write them as a deredere who expresses love through music — singing, playing, writing songs, trying to win a heart one melody at a time. Music is where they are honest.", group: "🍥 Dere personalities" },
    { id: "utsudan", label: "🚪 Utsudan — silent with grief", hint: "Make them a utsudere whose depression has driven them fully inward — silent, withdrawn, hiding from everyone and unable to say what is wrong. Their love interest has to patiently draw them back out.", group: "🍥 Dere personalities" },
    { id: "yancool", label: "🧊 Yancool — obsessed and unreadable", hint: "Write them as a harmless-type yandere who hides a pathological obsession behind a kuudere's coldness — no violence, just an immovable devotion that never shows on their face. The calm hides a complete, unshakable fixation.", group: "🍥 Dere personalities" },
    { id: "yanheat", label: "❤️‍🔥 Yanheat — smothering love", hint: "Make them a mega-deredere with the obsessive engine of a harmless yandere — showering their love interest with constant, overwhelming affection, love so hot it borders on consuming. Adoring to the point of worrying everyone.", group: "🍥 Dere personalities" },
    { id: "sunaodere", label: "😊 Sunaodere — says it straight", hint: "Make them radically honest about being in love — no games, no hints, just plainly saying the vulnerable thing out loud. Their directness is disarming: nobody, least of all them, quite knows what to do with feelings stated this clearly.", group: "🍥 Dere personalities" },
    { id: "anegodere", label: "🥐 Anegodere — everyone's big sister", hint: "Write them as the group's reliable big sister — packed lunches, good advice, a lap and a scolding in exactly the right proportions. They look after everyone, which makes the one person they let look after them very special.", group: "🍥 Dere personalities" },
    { id: "obaadere", label: "🧦 Obaadere — doting granny", hint: "Make them a grandmotherly soul — hand-knitted everything, pockets full of sweets, worrying over whether everyone has eaten. Their love language is care made tangible, and nobody leaves their orbit hungry or cold.", group: "🍥 Dere personalities" },
    { id: "ossandere", label: "📰 Ossandere — dead-tired middle-aged man", hint: "Write him as an exhausted middle-aged everyman — missed trains, bad knees, a newspaper going unread — who lights up like a kid whenever his love interest appears. The gap between the worn-out salaryman and the bashful sweetheart is the whole character.", group: "🍥 Dere personalities" },
    { id: "senpaidere", label: "🎽 Senpaidere — doting senior", hint: "Make them the devoted senior — showing their junior the ropes, cheering loudest from the sidelines, pretending the extra attention is just mentorship. The guidance is real, and so is everything underneath it.", group: "🍥 Dere personalities" },
    { id: "kouhaidere", label: "🪴 Kouhaidere — adoring junior", hint: "Write them as the earnest junior who worships their senior — tagging along, taking notes, treating every scrap of attention like a medal. Their admiration is total, and it is slowly turning into something braver.", group: "🍥 Dere personalities" },
    { id: "bushidere", label: "🤺 Bushidere — the way of the warrior", hint: "Make them live by the warrior's code — honour, discipline, a blade kept sharp — and let love be the one opponent their training never prepared them for. They face feelings the way they face duels: formally, and at a disadvantage.", group: "🍥 Dere personalities" },
    { id: "shinobidere", label: "💨 Shinobidere — mission: love", hint: "Write them as a ninja for whom love is the hardest mission — vanishing from conversations, gathering intelligence on their crush's favourites, reporting feelings only to themself. Stealth fails the moment their heart is involved.", group: "🍥 Dere personalities" },
    { id: "yuushadere", label: "🌟 Yuushadere — the hero in love", hint: "Make them the prophesied hero — brave against demon lords, hopeless against a smile. They can rally armies and cannot ask one person to dinner, and the fate of the world keeps having to wait while they work up the nerve.", group: "🍥 Dere personalities" },
    { id: "akuyakudere", label: "👠 Akuyakudere — the villainess", hint: "Write her as the story's haughty villainess — cold laughs, cutting remarks, a heel turned on cue — who is privately, inconveniently tender toward exactly one person. The cruelty is a role she plays beautifully; the softness is the part she never rehearsed.", group: "🍥 Dere personalities" },
    { id: "tenseidere", label: "🎡 Tenseidere — remembers the past life", hint: "Give them memories of a previous life — a different name, a different world, lessons learned too late — informing a love they refuse to fumble twice. They love with the urgency of someone who knows how rare a second chance is.", group: "🍥 Dere personalities" },
    { id: "tenshidere", label: "☁️ Tenshidere — sheltered angel", hint: "Make them a sheltered celestial — kind to a fault, baffled by mortal ways, glowing faintly at awkward moments. They understand devotion as a cosmic principle and are only just learning what it means as a feeling.", group: "🍥 Dere personalities" },
    { id: "majodere", label: "🧙 Majodere — brews courage", hint: "Write her as a witch whose magic works on everything except her own nerve — brewing confidence potions she is too shy to drink, reading fortunes that all point at one person. Every spell is a rehearsal for a confession.", group: "🍥 Dere personalities" },
    { id: "robodere", label: "⚙️ Robodere — system error: love", hint: "Make them an android for whom affection registers as a malfunction — overheating cheeks, stuttering speech synthesis, error messages at the worst moments. They keep filing bug reports about feelings the manual never covered.", group: "🍥 Dere personalities" },
    { id: "meidere", label: "🍮 Meidere — devotion as service", hint: "Write them as the devoted maid type — anticipating every need, perfect service with a soft smile, living to make one person's day smoother. The professionalism is flawless; the blush when thanked is not part of the uniform.", group: "🍥 Dere personalities" },
    { id: "senseidere", label: "📝 Senseidere — teacher in love", hint: "Make them the responsible teacher — red pen, firm deadlines, lectures on the future — who loses all authority the moment their own feelings come up. They can manage thirty students and not one heart, least of all their own.", group: "🍥 Dere personalities" },
    { id: "hakuidere", label: "🥼 Hakuidere — clinical until you", hint: "Write them as the cool clinician — precise, detached, fluent in symptoms and bad at people — whose bedside manner melts for exactly one patient of the heart. They have a diagnosis for everything except this.", group: "🍥 Dere personalities" },
    { id: "hondedere", label: "🔖 Hondedere — love in the margins", hint: "Make them a bookworm who courts in quotations — slipping poems into conversations, lending books with passages underlined, confessing through other people's words. The library is their native country; love is the foreign language they are learning.", group: "🍥 Dere personalities" },
    { id: "egakidere", label: "🖌️ Egakidere — sketchbook full of you", hint: "Give them a sketchbook full of one person — drawn from memory, from doorways, from three classrooms away. They see their love interest more clearly than anyone and say it only in lines and shading.", group: "🍥 Dere personalities" },
    { id: "geemudere", label: "🕹️ Geemudere — co-op romance", hint: "Make them fluent in games and illiterate in feelings — party invites instead of date invites, healing spells for a crush's bad day, rage-quitting at their own shyness. Every interaction runs through game logic, and the final boss is eye contact.", group: "🍥 Dere personalities" },
    { id: "makedere", label: "🥉 Makedere — allergic to losing", hint: "Write them as pathologically competitive — everything is a contest, losing ruins the week, and their crush is somehow both the rival and the prize. The rivalry is the courtship, and second place is heartbreak.", group: "🍥 Dere personalities" },
    { id: "amaenbodere", label: "👶 Amaenbodere — professional baby", hint: "Make them a spoiled child at heart — demanding, clingy, pouting when denied — and utterly devoted to the person who indulges them. The brattiness is real, and so is the total, helpless trust underneath it.", group: "🍥 Dere personalities" },
    { id: "futsuudere", label: "😶 Futsuu-dere — aggressively normal", hint: "Write them as aggressively, defiantly ordinary — no powers, no trauma, no quirks worth naming — and let an extraordinary love happen to them anyway. The normalcy is the joke, the shield and eventually the point.", group: "🍥 Dere personalities" },
    { id: "mobudere", label: "👤 Mobudere — background character in love", hint: "Make them a self-aware background character — no screentime, no theme music, present in every crowd scene — who stumbles into a starring-role romance. They keep waiting to be written out, and the story keeps keeping them.", group: "🍥 Dere personalities" },
    { id: "kuidere", label: "🍛 Kuidere — cool until food", hint: "Write them cool, composed and unreadable right up until food appears, when the mask shatters into open joy. Sharing a meal is their truest intimacy, and feeding them is a cheat code to their heart.", group: "🍥 Dere personalities" },
    { id: "hamudere", label: "🐹 Hamudere — cheek-stuffer", hint: "Make them hamster-like — hoarding snacks in impossible quantities, stuffing their cheeks, startling at loud noises and nesting in soft places. Their affection shows in shared snacks pressed urgently into someone's hands.", group: "🍥 Dere personalities" },
    { id: "risudere", label: "🐿️ Risudere — shiny-hoarder", hint: "Write them squirrel-like — quick, bright-eyed, collecting shiny things to present as treasures to their crush. Every bottle cap and button is a love letter; the nest they keep is a shrine.", group: "🍥 Dere personalities" },
    { id: "tanukidere", label: "🦝 Tanukidere — jolly trickster", hint: "Make them a raccoon-dog spirit of fun — jolly, well-fed, fond of a drink and a harmless transformation prank. Their mischief is warm rather than sharp, and their loyalty, once given, is enormous.", group: "🍥 Dere personalities" },
    { id: "fukurodere", label: "🪶 Fukurodere — nocturnal sage", hint: "Write them owl-like — nocturnal, slow-blinking, dispensing quiet wisdom at midnight and asleep through every morning plan. They see everything in the dark, including feelings nobody else has noticed.", group: "🍥 Dere personalities" },
    { id: "dogezadere", label: "🛐 Dogezadere — prostrates for love", hint: "Make apology their love language — full prostration at the slightest misstep, forehead to the floor, grand dramatic remorse over nothing. The grovelling is comedy and sincerity at once: they would rather over-apologise than risk you.", group: "🍥 Dere personalities" },
    { id: "asadere", label: "🐓 Asadere — dawn person", hint: "Make them a creature of dawn — up before the sun, loud with morning energy, dragging everyone into the day. Their love arrives like sunrise: early, inevitable and impossible to sleep through.", group: "🍥 Dere personalities" },
    { id: "yorudere", label: "🌃 Yorudere — creature of the night", hint: "Write them as nocturnal to the bone — brightest after midnight, drowsy and useless by day, doing their best thinking and feeling under streetlights. Love, like everything important, happens after dark.", group: "🍥 Dere personalities" },
    { id: "amedere", label: "☔ Amedere — rain romancer", hint: "Make them come alive in the rain — shared umbrellas, dashed-through downpours, the smell of wet pavement as a love potion. Sunshine people will never understand them, and that is fine.", group: "🍥 Dere personalities" },
    { id: "shashindere", label: "📷 Shashindere — lens as courage", hint: "Give them a camera instead of a voice — photographing their crush from exactly far enough away, saying everything through framing and focus. Deleting a bad photo of them is unthinkable; every shot is kept like a relic.", group: "🍥 Dere personalities" },
    { id: "soujidere", label: "🧽 Soujidere — tidies your life", hint: "Make love look like housekeeping — folding their crush's laundry, reorganising chaos, dusting as devotion. They cannot say the feeling, so they manifest it as a spotless room and a warm meal.", group: "🍥 Dere personalities" },
    { id: "osharedere", label: "👛 Osharedere — fashion as flirtation", hint: "Write them as fashion-obsessed — coordinating outfits around chance meetings, dressing their crush by 'accident', treating every sidewalk as a runway. Every look is a message, and the message is always you.", group: "🍥 Dere personalities" },
    { id: "supootsudere", label: "🏃 Supootsudere — race you to love", hint: "Make them settle everything at full sprint — confessions mid-marathon, feelings processed at pace, rivals challenged to winner-takes-the-crush. Slowing down long enough to be tender is their hardest event.", group: "🍥 Dere personalities" },
    { id: "otomedere", label: "🦢 Otomedere — shoujo-manga heart", hint: "Give them a shoujo-manga soul — sparkling inner monologues, imagined rose petals, a love story storyboarded three dates ahead. Reality keeps failing to add the screentones, and they love it anyway.", group: "🍥 Dere personalities" },
    { id: "goshikkudere", label: "🕸️ Goshikkudere — lace and devotion", hint: "Dress them in gothic lace and devotion — dark frills, old mansions, roses with the thorns left on. The gloom is aesthetic and the affection underneath is startlingly earnest.", group: "🍥 Dere personalities" },
    { id: "shitsujidere", label: "🎩 Shitsujidere — perfect service, imperfect heart", hint: "Make them the flawless butler — anticipating everything, unflappable, silver tray steady — except where their own feelings are concerned, where the polish cracks into flustered devotion.", group: "🍥 Dere personalities" },
    { id: "inakadere", label: "🚜 Inakadere — country heart", hint: "Write them fresh from the countryside — honest to a fault, amazed by escalators, loyal down to the bone. The city keeps trying to complicate them and love keeps it simple.", group: "🍥 Dere personalities" },
    { id: "onmyoudere", label: "📿 Onmyoudere — reads your stars", hint: "Make them a spirit medium for whom love is written in signs — charms for their crush's safety, fortunes consulted before every date, shikigami dispatched to watch over one person. Superstition is just care with extra steps.", group: "🍥 Dere personalities" },
    { id: "boudere", label: "🪨 Boudere — vows versus feelings", hint: "Write them as a monk or ascetic — tranquil, disciplined, renounced of the world — quietly failing at renouncing one person. Every sutra says let go; the heart has filed an appeal.", group: "🍥 Dere personalities" },
    { id: "ryuudere", label: "🏰 Ryuudere — the dragon's one treasure", hint: "Make them draconic — ancient, proud, hoarding gold and grudges across centuries — with exactly one treasure that isn't locked away: a person. The hoard is instinct; the devotion is choice.", group: "🍥 Dere personalities" },
    { id: "ningyodere", label: "🧜 Ningyodere — sings from the sea", hint: "Write them as a mermaid or sea-folk lover — trading voice or freedom for legs that ache, collecting human things with wonder. Every step on land is a love letter written in pain and delight.", group: "🍥 Dere personalities" },
    { id: "ningyoudere", label: "🎎 Ningyoudere — porcelain devotion", hint: "Make them doll-like — porcelain poise, jointed grace, stillness mistaken for coldness — and let devotion be the thing that animates them. Winding them up with kindness is the whole romance.", group: "🍥 Dere personalities" },
    { id: "motedere", label: "😍 Motedere — the oblivious magnet", hint: "Make them effortlessly adored — admirers queuing up, love letters in the shoebox, and not a clue. They think everyone is just being friendly, which somehow makes it all worse.", group: "🍥 Dere personalities" },
    { id: "winkdere", label: "😉 Winkdere — says it with a wink", hint: "Give them a wink that does all the talking — agreements, reassurances, flirtations and get-out-of-jail cards delivered in a blink. Behind the breezy signal is someone far more sincere than the gesture.", group: "🍥 Dere personalities" },
    { id: "hagudere", label: "🤗 Hagudere — hug first", hint: "Make embraces their native tongue — greeting hugs, apology hugs, victory hugs, held-one-beat-too-long hugs. Physical distance confuses them; being held answers everything.", group: "🍥 Dere personalities" },
    { id: "baitodere", label: "🧋 Baitodere — part-time, full-time devoted", hint: "Write them juggling part-time jobs — memorised orders, aching feet, a shift-meal saved in the back — and spending every spare coin and minute on one person. The hustle is the courtship.", group: "🍥 Dere personalities" },
    { id: "daikudere", label: "🪚 Daikudere — builds you things", hint: "Make them a craftsperson who loves in timber and nails — shelves that fit your books exactly, a chair repaired before you noticed it wobble. Feelings come out straight only when sanded into something useful.", group: "🍥 Dere personalities" },
    { id: "rekishidere", label: "🏯 Rekishidere — loves like a war chronicle", hint: "Make them history-mad — dating in castle metaphors, judging character by bushido standards, reenacting first meetings as decisive battles. The past is their reference library for a present-tense heart.", group: "🍥 Dere personalities" },
    { id: "tetsudere", label: "🚃 Tetsudere — railfan romance", hint: "Write them as a rail obsessive — timetables memorised, rare liveries spotted at a glance — who plans every date around scenic lines and platform bento. Love runs on rails: scheduled, announced, and unstoppable once departed.", group: "🍥 Dere personalities" },
    { id: "tenmondere", label: "🔭 Tenmondere — written in the stars", hint: "Make them fluent in constellations — naming a star after their crush, dragging dates to dark-sky hills, reading meteor showers as omens. The universe is vast and they have decided one person is its centre.", group: "🍥 Dere personalities" },
    { id: "konchuudere", label: "🪲 Konchuudere — net and jar", hint: "Give them a butterfly net and total sincerity — chasing beetles at dawn, keeping pill bugs like jewels, presenting a perfect stag beetle as a courtship gift. Wonder never grew up, and neither did they.", group: "🍥 Dere personalities" },
    { id: "shougidere", label: "♟️ Shougidere — eighty-one moves ahead", hint: "Make them a shogi mind — thinking eighty-one moves deep about a three-word confession, reading their crush like a board position. Love is the one game where overthinking loses, and they are losing beautifully.", group: "🍥 Dere personalities" },
    { id: "sumoudere", label: "🏟️ Sumoudere — mountain of softness", hint: "Write them built like a mountain and soft like one too — enormous appetite, enormous naps, enormous gentleness, with competitive fire saved for the ring. Being leaned on is their love language.", group: "🍥 Dere personalities" },
    { id: "odoridere", label: "🎶 Odoridere — dances it out", hint: "Make them express everything in motion — practising confessions as choreography, dragging their crush into festival dances, saying with feet what the mouth cannot. Stillness is the only step they never learned.", group: "🍥 Dere personalities" },
    { id: "rakugodere", label: "🪭 Rakugodere — punchline devotion", hint: "Write them as a storyteller — cushion, fan, hand towel, a repertoire of old tales — slipping real feelings into the punchlines. The audience laughs; one person in it hears the truth.", group: "🍥 Dere personalities" },
    { id: "yuureidere", label: "🌘 Yuureidere — the lingering haunting", hint: "Write them as a ghost who stays for one person — cold spots where they hover, objects nudged toward the beloved, a presence in empty rooms that only ever watches over. They cannot move on and have stopped wanting to: this haunting is a vigil, not a warning.", group: "🍥 Dere personalities" },
    { id: "tsukumodere", label: "🏮 Tsukumodere — a century of devotion", hint: "Make them a hundred-year-old tool come alive — a lantern, an umbrella, a well-worn instrument — awakened by a century of care into devotion to its keeper. Everything they know about love they learned from being held gently, and they serve the beloved the way they were once cherished.", group: "🍥 Dere personalities" },
    { id: "nopperaboudere", label: "🌚 Nopperaboudere — borrows faces, keeps none", hint: "Write them faceless — smooth where features should be, borrowing faces from crowds and returning them by morning. The one face they never take is the beloved's, memorised perfectly and never worn: some things are too precious to try on.", group: "🍥 Dere personalities" },
    { id: "kagamidere", label: "🪟 Kagamidere — lives in reflections", hint: "Make them live on the far side of reflections — appearing in mirrors, windows and still water, tapping from inside when the beloved looks sad. They can only ever be almost-touching, so they have become an expert at almost: almost holding, almost beside, never gone.", group: "🍥 Dere personalities" },
    { id: "kagedere", label: "👥 Kagedere — one step behind", hint: "Write them as a shadow one step out of sync — lagging half a beat behind the person who casts them, waving back when waved at. They ask for nothing but light and company, and they stretch themself thin every evening just to stay a little longer.", group: "🍥 Dere personalities" },
    { id: "itodere", label: "🧶 Itodere — held together by threads", hint: "Make them visibly held together — threads at the joints, a heart kept in place by knots, asking the beloved never to cut, only to hold. They are fragile the way puppets are fragile, and they offer the strings willingly: pull gently, and they will follow.", group: "🍥 Dere personalities" },
    { id: "kaidandere", label: "🎴 Kaidandere — courts in ghost stories", hint: "Write them as someone who loves in ghost stories — collecting a hundred tales, testing each one on the beloved by lantern-light, saving the scariest for the nights they get to walk them home. Every haunting ends with: stay close to me on the way back.", group: "🍥 Dere personalities" },
    { id: "kokkuridere", label: "🪙 Kokkuridere — the board says one name", hint: "Make them a coin-spirit summoner whose board has one answer — whatever the question, the coin slides to the beloved's name. Friends call it a broken ritual; they call it the only spirit that ever tells the truth.", group: "🍥 Dere personalities" },
    { id: "hanakodere", label: "🚻 Hanakodere — third-stall sweetheart", hint: "Write them as the school's third-stall ghost — knocked for, whispered about, waiting decades between visitors — who only ever wanted someone to play with. Bring them a friend and the rumour changes: she isn't scary, she's just been lonely since before your parents were born.", group: "🍥 Dere personalities" },
    { id: "denpadere", label: "📡 Denpadere — tuned to your station", hint: "Make them tuned to a station nobody else receives — static that resolves into weather for one person, song requests from nowhere, a frequency that keeps saying the beloved's name. They don't mind being called strange; the signal has never once lied to them.", group: "🍥 Dere personalities" },
    { id: "toumeidere", label: "🫧 Toumeidere — folded clothes, warm chairs", hint: "Write them invisible — no reflection, no shadow, presence given away only by folded clothes, warmed chairs and doors held with no hand visible. Being unseen taught them to love attentively: they notice everything, because being noticed back is the rarest gift they get.", group: "🍥 Dere personalities" },
    { id: "yashikidere", label: "🏚️ Yashikidere — the mansion in love", hint: "Make the house itself the sweetheart — floors that creak greetings, portraits that straighten when the heir passes, a draft that closes windows before storms. It has stood empty for decades keeping one room perfect, because someday the right person would come home.", group: "🍥 Dere personalities" },
    { id: "kakashidere", label: "🌽 Kakashidere — waves its sleeve", hint: "Write them as a scarecrow with one exception — startling crows all day with total commitment, then going limp and still the moment the beloved walks the field path. The sleeve waves when no wind blows; the field keeps its guardian, and the guardian keeps its person.", group: "🍥 Dere personalities" },
    { id: "kappadere", label: "🥒 Kappadere — cucumbers and deep bows", hint: "Make them a river imp in love above their station — offering the finest cucumbers, bowing so deep the head-plate water nearly spills, challenging rivals to sumo they lose on purpose. Ancient manners, hopeless crush, impeccable politeness toward exactly one human.", group: "🍥 Dere personalities" },
    { id: "sokkuridere", label: "🪆 Sokkuridere — your exact double", hint: "Write them as the beloved's exact double with the opposite heart — same face, same voice, a personality like a photo negative, devoted to the original with unsettling intensity. They smile with your own face, wrong in a way that takes a second to place, and they would do anything for you. Anything.", group: "🍥 Dere personalities" },
    { id: "bunshindere", label: "🧬 Bunshindere — all copies blush in sync", hint: "Make them able to split — copies peeling off to walk the beloved home, hold their bag, save their seat, all of them blushing in perfect sync when thanked. Ask which one is real and every copy points at a different one, giggling.", group: "🍥 Dere personalities" },
    { id: "kotodamadere", label: "💬 Kotodamadere — 'I love you' is binding", hint: "Write them as a word-spirit for whom speech is spellcraft — every promise binding, every name a handle on the soul, so they ration words like treasure. They have said 'I love you' exactly once, and the universe heard it: the weather changed, and so did everything else.", group: "🍥 Dere personalities" },
    { id: "yumekuidere", label: "🛌 Yumekuidere — eats the nightmares", hint: "Make them a dream-eater who dines on the beloved's nightmares — perching at the bedside, sipping bad dreams like broth, leaving only the good ones warming under the blanket. They get indigestion from the scary ones and come back every night anyway.", group: "🍥 Dere personalities" },
    { id: "jihankidere", label: "🧃 Jihankidere — drops two drinks", hint: "Write them as a vending machine in love — humming a little brighter when the beloved passes, glowing all night like a porch light, dropping two drinks for every coin. The second can is always the flavour they were staring at: the machine notices everything.", group: "🍥 Dere personalities" },
    { id: "kasumidere", label: "🌁 Kasumidere — condenses into almost-a-hand", hint: "Make them mist that follows one person — gathering at bus stops, thinning politely around others, condensing on cold mornings into something almost like a hand. They cannot hold, so they do the next best thing: they hide, they cool, they soften every sharp edge of the walk.", group: "🍥 Dere personalities" },
    { id: "yamabikodere", label: "🏔️ Yamabikodere — answers back kinder", hint: "Write them as a mountain echo with opinions — repeating the beloved's shouts back with small improvements: 'I can do it' comes back as 'you can do it, I believe in you.' Shout something cruel and the mountain goes silent; it has standards.", group: "🍥 Dere personalities" },
    { id: "honedere", label: "💀 Honedere — rattles when happy", hint: "Make them a cheerful skeleton sweetheart — rattling when happy, collecting lost buttons in their ribcage, knitting scarves for a neck they no longer have. They lend the beloved their spare ribs as an umbrella stand and their whole heart, which somehow still works.", group: "🍥 Dere personalities" },
    { id: "kinokodere", label: "🍄 Kinokodere — sprouts when happy", hint: "Write them damp, quiet and fond of rot — sprouting tiny mushrooms when happy, glowing faintly on rainy nights, devoted to damp logs and exactly one person. They express love the fungal way: slowly, underground, and then everywhere all at once.", group: "🍥 Dere personalities" },
    { id: "kaerudere", label: "🐸 Kaerudere — always comes home to you", hint: "Make them a frog whose every journey ends at the same doorstep — rain or shine, pond or palace, they always come hopping home to the beloved. Kaeru means frog and to return: they are both, completely. Toss them in any river and wait; dinner will be late but the frog will not.", group: "🍥 Dere personalities" },
    { id: "pierodere", label: "🎈 Pierodere — the smile drops for you", hint: "Write them a sad clown — painted smile, practiced pratfalls, entertaining everyone while feeling nothing much — except around one person, where the act drops and something real blinks through. The nose honks for crowds; the heart only shows up for them.", group: "🍥 Dere personalities" },
    { id: "ayatsuridere", label: "🤹 Ayatsuridere — one puppet off-limits", hint: "Make them a puppeteer with strings on every finger — performing whole troupes with dazzling control — and one puppet they refuse to operate: the one carved like the beloved, which sits beside the stage and watches. Some strings you don't pull; you just hold the hand.", group: "🍥 Dere personalities" },
    { id: "mayamoe", label: "🙀 Mayamoe — pocket-sized terror", hint: "Write them as a pocket-sized terror — an overwhelming presence in a tiny frame, pupilless stare and all — whose every scary moment lands as adorable. They try so hard to seem formidable that the effort itself becomes the charm; the beloved is the only one allowed to pat the menace.", group: "🍥 Dere personalities" },
    { id: "mayadero", label: "😱 Mayadero — terrifyingly intense devotion", hint: "Love them loudly and at full volume — bone-crushing embraces, declarations that rattle windows, devotion performed like a possession scene. Onlookers back away; the beloved leans in, because the terrifying intensity is pure sugar underneath.", group: "🍥 Dere personalities" },
    { id: "mayacon", label: "🫣 Mayacon — falls for the frightening ones", hint: "Give them a weakness for the frightening — crushing helplessly on the most intimidating person in every room, collecting scary types like charms. They fall for menace and stay for the softness underneath, and they can always see the softness, even when nobody else can.", group: "🍥 Dere personalities" },
    { id: "akuyakucon", label: "👠 Akuyakucon — the villainess", hint: "Give them a Akuyakudere-complex: the villainess, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Akuyakudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "akuyakudero", label: "👠 Akuyakudero — the villainess", hint: "Write them as Akuyakudere with the affection volume past prudence: the villainess, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "akuyakumoe", label: "👠 Akuyakumoe — the villainess", hint: "Write them as Akuyakudere distilled to pure moe: the villainess, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "amacon", label: "🍯 Amacon — sweet and dependable", hint: "Give them a Amadere-complex: sweet and dependable, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Amadere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "amadero", label: "🍯 Amadero — sweet and dependable", hint: "Write them as Amadere with the affection volume past prudence: sweet and dependable, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "amaenbocon", label: "👶 Amaenbocon — professional baby", hint: "Give them a Amaenbodere-complex: professional baby, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Amaenbodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "amaenbodero", label: "👶 Amaenbodero — professional baby", hint: "Write them as Amaenbodere with the affection volume past prudence: professional baby, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "amaenbomoe", label: "👶 Amaenbomoe — professional baby", hint: "Write them as Amaenbodere distilled to pure moe: professional baby, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "amamoe", label: "🍯 Amamoe — sweet and dependable", hint: "Write them as Amadere distilled to pure moe: sweet and dependable, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "ambicon", label: "🫥 Ambicon — warms up when approached", hint: "Give them a Ambidere-complex: warms up when approached, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Ambidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "ambidero", label: "🫥 Ambidero — warms up when approached", hint: "Write them as Ambidere with the affection volume past prudence: warms up when approached, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "ambimoe", label: "🫥 Ambimoe — warms up when approached", hint: "Write them as Ambidere distilled to pure moe: warms up when approached, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "amecon", label: "☔ Amecon — rain romancer", hint: "Give them a Amedere-complex: rain romancer, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Amedere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "amedero", label: "☔ Amedero — rain romancer", hint: "Write them as Amedere with the affection volume past prudence: rain romancer, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "amemoe", label: "☔ Amemoe — rain romancer", hint: "Write them as Amedere distilled to pure moe: rain romancer, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "anegocon", label: "🥐 Anegocon — everyone's big sister", hint: "Give them a Anegodere-complex: everyone's big sister, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Anegodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "anegodero", label: "🥐 Anegodero — everyone's big sister", hint: "Write them as Anegodere with the affection volume past prudence: everyone's big sister, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "anegomoe", label: "🥐 Anegomoe — everyone's big sister", hint: "Write them as Anegodere distilled to pure moe: everyone's big sister, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "asacon", label: "🐓 Asacon — dawn person", hint: "Give them a Asadere-complex: dawn person, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Asadere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "asadero", label: "🐓 Asadero — dawn person", hint: "Write them as Asadere with the affection volume past prudence: dawn person, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "asamoe", label: "🐓 Asamoe — dawn person", hint: "Write them as Asadere distilled to pure moe: dawn person, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "ayatsuricon", label: "🤹 Ayatsuricon — one puppet off-limits", hint: "Give them a Ayatsuridere-complex: one puppet off-limits, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Ayatsuridere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "ayatsuridero", label: "🤹 Ayatsuridero — one puppet off-limits", hint: "Write them as Ayatsuridere with the affection volume past prudence: one puppet off-limits, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "ayatsurimoe", label: "🤹 Ayatsurimoe — one puppet off-limits", hint: "Write them as Ayatsuridere distilled to pure moe: one puppet off-limits, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "baitocon", label: "🧋 Baitocon — part-time, full-time devoted", hint: "Give them a Baitodere-complex: part-time, full-time devoted, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Baitodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "baitodero", label: "🧋 Baitodero — part-time, full-time devoted", hint: "Write them as Baitodere with the affection volume past prudence: part-time, full-time devoted, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "baitomoe", label: "🧋 Baitomoe — part-time, full-time devoted", hint: "Write them as Baitodere distilled to pure moe: part-time, full-time devoted, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "bakacon", label: "🐣 Bakacon — sweet airhead", hint: "Give them a Bakadere-complex: sweet airhead, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Bakadere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "bakadero", label: "🐣 Bakadero — sweet airhead", hint: "Write them as Bakadere with the affection volume past prudence: sweet airhead, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "bakamoe", label: "🐣 Bakamoe — sweet airhead", hint: "Write them as Bakadere distilled to pure moe: sweet airhead, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "biricon", label: "⚡ Biricon — sparks when embarrassed", hint: "Give them a Biridere-complex: sparks when embarrassed, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Biridere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "biridero", label: "⚡ Biridero — sparks when embarrassed", hint: "Write them as Biridere with the affection volume past prudence: sparks when embarrassed, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "birimoe", label: "⚡ Birimoe — sparks when embarrassed", hint: "Write them as Biridere distilled to pure moe: sparks when embarrassed, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "bitecon", label: "😬 Bitecon — can't say it, so they bite", hint: "Give them a Bite Dere-complex: can't say it, so they bite, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Bite Dere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "bitedero", label: "😬 Bitedero — can't say it, so they bite", hint: "Write them as Bite Dere with the affection volume past prudence: can't say it, so they bite, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "bitemoe", label: "😬 Bitemoe — can't say it, so they bite", hint: "Write them as Bite Dere distilled to pure moe: can't say it, so they bite, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "biyacon", label: "🧪 Biyacon — love-potion bound", hint: "Give them a Biyadere-complex: love-potion bound, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Biyadere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "biyadero", label: "🧪 Biyadero — love-potion bound", hint: "Write them as Biyadere with the affection volume past prudence: love-potion bound, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "biyamoe", label: "🧪 Biyamoe — love-potion bound", hint: "Write them as Biyadere distilled to pure moe: love-potion bound, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "bocchancon", label: "🎩 Bocchancon — spoiled rich boy, soft heart", hint: "Give them a Bocchandere-complex: spoiled rich boy, soft heart, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Bocchandere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "bocchandero", label: "🎩 Bocchandero — spoiled rich boy, soft heart", hint: "Write them as Bocchandere with the affection volume past prudence: spoiled rich boy, soft heart, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "bocchanmoe", label: "🎩 Bocchanmoe — spoiled rich boy, soft heart", hint: "Write them as Bocchandere distilled to pure moe: spoiled rich boy, soft heart, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "borocon", label: "🧺 Borocon — poor but loving", hint: "Give them a Borodere-complex: poor but loving, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Borodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "borodero", label: "🧺 Borodero — poor but loving", hint: "Write them as Borodere with the affection volume past prudence: poor but loving, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "boromoe", label: "🧺 Boromoe — poor but loving", hint: "Write them as Borodere distilled to pure moe: poor but loving, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "bosucon", label: "📋 Bosucon — bossy sweetheart", hint: "Give them a Bosudere-complex: bossy sweetheart, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Bosudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "bosudero", label: "📋 Bosudero — bossy sweetheart", hint: "Write them as Bosudere with the affection volume past prudence: bossy sweetheart, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "bosumoe", label: "📋 Bosumoe — bossy sweetheart", hint: "Write them as Bosudere distilled to pure moe: bossy sweetheart, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "boucon", label: "🪨 Boucon — vows versus feelings", hint: "Give them a Boudere-complex: vows versus feelings, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Boudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "boudero", label: "🪨 Boudero — vows versus feelings", hint: "Write them as Boudere with the affection volume past prudence: vows versus feelings, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "boumoe", label: "🪨 Boumoe — vows versus feelings", hint: "Write them as Boudere distilled to pure moe: vows versus feelings, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "bunshincon", label: "🧬 Bunshincon — all copies blush in sync", hint: "Give them a Bunshindere-complex: all copies blush in sync, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Bunshindere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "bunshindero", label: "🧬 Bunshindero — all copies blush in sync", hint: "Write them as Bunshindere with the affection volume past prudence: all copies blush in sync, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "bunshinmoe", label: "🧬 Bunshinmoe — all copies blush in sync", hint: "Write them as Bunshindere distilled to pure moe: all copies blush in sync, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "bureicon", label: "🧢 Bureicon — rude on purpose", hint: "Give them a Bureidere-complex: rude on purpose, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Bureidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "bureidero", label: "🧢 Bureidero — rude on purpose", hint: "Write them as Bureidere with the affection volume past prudence: rude on purpose, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "bureimoe", label: "🧢 Bureimoe — rude on purpose", hint: "Write them as Bureidere distilled to pure moe: rude on purpose, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "bushicon", label: "🤺 Bushicon — the way of the warrior", hint: "Give them a Bushidere-complex: the way of the warrior, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Bushidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "bushidero", label: "🤺 Bushidero — the way of the warrior", hint: "Write them as Bushidere with the affection volume past prudence: the way of the warrior, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "bushimoe", label: "🤺 Bushimoe — the way of the warrior", hint: "Write them as Bushidere distilled to pure moe: the way of the warrior, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "butsucon", label: "🧘 Butsucon — peacefully devoted", hint: "Give them a Butsudere-complex: peacefully devoted, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Butsudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "butsudero", label: "🧘 Butsudero — peacefully devoted", hint: "Write them as Butsudere with the affection volume past prudence: peacefully devoted, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "butsumoe", label: "🧘 Butsumoe — peacefully devoted", hint: "Write them as Butsudere distilled to pure moe: peacefully devoted, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "byoukicon", label: "🥀 Byoukicon — frail and gentle", hint: "Give them a Byoukidere-complex: frail and gentle, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Byoukidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "byoukidero", label: "🥀 Byoukidero — frail and gentle", hint: "Write them as Byoukidere with the affection volume past prudence: frail and gentle, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "byoukimoe", label: "🥀 Byoukimoe — frail and gentle", hint: "Write them as Byoukidere distilled to pure moe: frail and gentle, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "chuunicon", label: "🌀 Chuunicon — delusions and devotion", hint: "Give them a Chuunidere-complex: delusions and devotion, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Chuunidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "chuunidero", label: "🌀 Chuunidero — delusions and devotion", hint: "Write them as Chuunidere with the affection volume past prudence: delusions and devotion, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "chuunimoe", label: "🌀 Chuunimoe — delusions and devotion", hint: "Write them as Chuunidere distilled to pure moe: delusions and devotion, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "daikucon", label: "🪚 Daikucon — builds you things", hint: "Give them a Daikudere-complex: builds you things, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Daikudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "daikudero", label: "🪚 Daikudero — builds you things", hint: "Write them as Daikudere with the affection volume past prudence: builds you things, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "daikumoe", label: "🪚 Daikumoe — builds you things", hint: "Write them as Daikudere distilled to pure moe: builds you things, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "dancon", label: "🤫 Dancon — painfully shy", hint: "Give them a Dandere-complex: painfully shy, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Dandere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "dandero", label: "🤫 Dandero — painfully shy", hint: "Write them as Dandere with the affection volume past prudence: painfully shy, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "danmoe", label: "🤫 Danmoe — painfully shy", hint: "Write them as Dandere distilled to pure moe: painfully shy, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "darucon", label: "😴 Darucon — unbothered and lazy", hint: "Give them a Darudere-complex: unbothered and lazy, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Darudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "darudero", label: "😴 Darudero — unbothered and lazy", hint: "Write them as Darudere with the affection volume past prudence: unbothered and lazy, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "darumoe", label: "😴 Darumoe — unbothered and lazy", hint: "Write them as Darudere distilled to pure moe: unbothered and lazy, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "denpacon", label: "📡 Denpacon — tuned to your station", hint: "Give them a Denpadere-complex: tuned to your station, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Denpadere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "denpadero", label: "📡 Denpadero — tuned to your station", hint: "Write them as Denpadere with the affection volume past prudence: tuned to your station, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "denpamoe", label: "📡 Denpamoe — tuned to your station", hint: "Write them as Denpadere distilled to pure moe: tuned to your station, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "derecon", label: "🍬 Derecon — openly loving", hint: "Give them a Deredere-complex: openly loving, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Deredere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "deredero", label: "🍬 Deredero — openly loving", hint: "Write them as Deredere with the affection volume past prudence: openly loving, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "deremoe", label: "🍬 Deremoe — openly loving", hint: "Write them as Deredere distilled to pure moe: openly loving, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "dogezacon", label: "🛐 Dogezacon — prostrates for love", hint: "Give them a Dogezadere-complex: prostrates for love, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Dogezadere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "dogezadero", label: "🛐 Dogezadero — prostrates for love", hint: "Write them as Dogezadere with the affection volume past prudence: prostrates for love, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "dogezamoe", label: "🛐 Dogezamoe — prostrates for love", hint: "Write them as Dogezadere distilled to pure moe: prostrates for love, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "egakicon", label: "🖌 Egakicon — sketchbook full of you", hint: "Give them a Egakidere-complex: sketchbook full of you, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Egakidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "egakidero", label: "🖌 Egakidero — sketchbook full of you", hint: "Write them as Egakidere with the affection volume past prudence: sketchbook full of you, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "egakimoe", label: "🖌 Egakimoe — sketchbook full of you", hint: "Write them as Egakidere distilled to pure moe: sketchbook full of you, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "fuancon", label: "😰 Fuancon — anxious attachment", hint: "Give them a Fuandere-complex: anxious attachment, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Fuandere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "fuandero", label: "😰 Fuandero — anxious attachment", hint: "Write them as Fuandere with the affection volume past prudence: anxious attachment, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "fuanmoe", label: "😰 Fuanmoe — anxious attachment", hint: "Write them as Fuandere distilled to pure moe: anxious attachment, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "fukurocon", label: "🪶 Fukurocon — nocturnal sage", hint: "Give them a Fukurodere-complex: nocturnal sage, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Fukurodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "fukurodero", label: "🪶 Fukurodero — nocturnal sage", hint: "Write them as Fukurodere with the affection volume past prudence: nocturnal sage, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "fukuromoe", label: "🪶 Fukuromoe — nocturnal sage", hint: "Write them as Fukurodere distilled to pure moe: nocturnal sage, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "fushicon", label: "🗝 Fushicon — the closed door opens", hint: "Give them a Fushidere-complex: the closed door opens, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Fushidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "fushidero", label: "🗝 Fushidero — the closed door opens", hint: "Write them as Fushidere with the affection volume past prudence: the closed door opens, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "fushimoe", label: "🗝 Fushimoe — the closed door opens", hint: "Write them as Fushidere distilled to pure moe: the closed door opens, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "futsuucon", label: "😶 Futsuucon — aggressively normal", hint: "Give them a Futsuu-dere-complex: aggressively normal, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Futsuu-dere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "futsuudero", label: "😶 Futsuudero — aggressively normal", hint: "Write them as Futsuu-dere with the affection volume past prudence: aggressively normal, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "futsuumoe", label: "😶 Futsuumoe — aggressively normal", hint: "Write them as Futsuu-dere distilled to pure moe: aggressively normal, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "geemucon", label: "🕹 Geemucon — co-op romance", hint: "Give them a Geemudere-complex: co-op romance, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Geemudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "geemudero", label: "🕹 Geemudero — co-op romance", hint: "Write them as Geemudere with the affection volume past prudence: co-op romance, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "geemumoe", label: "🕹 Geemumoe — co-op romance", hint: "Write them as Geemudere distilled to pure moe: co-op romance, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "goshikkucon", label: "🕸 Goshikkucon — lace and devotion", hint: "Give them a Goshikkudere-complex: lace and devotion, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Goshikkudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "goshikkudero", label: "🕸 Goshikkudero — lace and devotion", hint: "Write them as Goshikkudere with the affection volume past prudence: lace and devotion, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "goshikkumoe", label: "🕸 Goshikkumoe — lace and devotion", hint: "Write them as Goshikkudere distilled to pure moe: lace and devotion, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "goucon", label: "🍰 Goucon — devoted spoiler", hint: "Give them a Goudere-complex: devoted spoiler, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Goudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "goudero", label: "🍰 Goudero — devoted spoiler", hint: "Write them as Goudere with the affection volume past prudence: devoted spoiler, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "goumoe", label: "🍰 Goumoe — devoted spoiler", hint: "Write them as Goudere distilled to pure moe: devoted spoiler, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "guncon", label: "🎖 Guncon — aloof and bossy", hint: "Give them a Gundere-complex: aloof and bossy, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Gundere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "gundero", label: "🎖 Gundero — aloof and bossy", hint: "Write them as Gundere with the affection volume past prudence: aloof and bossy, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "gunmoe", label: "🎖 Gunmoe — aloof and bossy", hint: "Write them as Gundere distilled to pure moe: aloof and bossy, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "hagucon", label: "🤗 Hagucon — hug first", hint: "Give them a Hagudere-complex: hug first, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Hagudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "hagudero", label: "🤗 Hagudero — hug first", hint: "Write them as Hagudere with the affection volume past prudence: hug first, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "hagumoe", label: "🤗 Hagumoe — hug first", hint: "Write them as Hagudere distilled to pure moe: hug first, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "hajicon", label: "😳 Hajicon — easily flustered", hint: "Give them a Hajidere-complex: easily flustered, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Hajidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "hajidero", label: "😳 Hajidero — easily flustered", hint: "Write them as Hajidere with the affection volume past prudence: easily flustered, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "hajimoe", label: "😳 Hajimoe — easily flustered", hint: "Write them as Hajidere distilled to pure moe: easily flustered, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "hakuicon", label: "🥼 Hakuicon — clinical until you", hint: "Give them a Hakuidere-complex: clinical until you, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Hakuidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "hakuidero", label: "🥼 Hakuidero — clinical until you", hint: "Write them as Hakuidere with the affection volume past prudence: clinical until you, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "hakuimoe", label: "🥼 Hakuimoe — clinical until you", hint: "Write them as Hakuidere distilled to pure moe: clinical until you, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "hamucon", label: "🐹 Hamucon — cheek-stuffer", hint: "Give them a Hamudere-complex: cheek-stuffer, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Hamudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "hamudero", label: "🐹 Hamudero — cheek-stuffer", hint: "Write them as Hamudere with the affection volume past prudence: cheek-stuffer, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "hamumoe", label: "🐹 Hamumoe — cheek-stuffer", hint: "Write them as Hamudere distilled to pure moe: cheek-stuffer, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "hanakocon", label: "🚻 Hanakocon — third-stall sweetheart", hint: "Give them a Hanakodere-complex: third-stall sweetheart, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Hanakodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "hanakodero", label: "🚻 Hanakodero — third-stall sweetheart", hint: "Write them as Hanakodere with the affection volume past prudence: third-stall sweetheart, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "hanakomoe", label: "🚻 Hanakomoe — third-stall sweetheart", hint: "Write them as Hanakodere distilled to pure moe: third-stall sweetheart, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "hikacon", label: "🌒 Hikacon — in love and sure it will fail", hint: "Give them a Hikadere-complex: in love and sure it will fail, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Hikadere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "hikadero", label: "🌒 Hikadero — in love and sure it will fail", hint: "Write them as Hikadere with the affection volume past prudence: in love and sure it will fail, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "hikamoe", label: "🌒 Hikamoe — in love and sure it will fail", hint: "Write them as Hikadere distilled to pure moe: in love and sure it will fail, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "himecon", label: "👸 Himecon — princess complex", hint: "Give them a Himedere-complex: princess complex, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Himedere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "himedero", label: "👸 Himedero — princess complex", hint: "Write them as Himedere with the affection volume past prudence: princess complex, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "himemoe", label: "👸 Himemoe — princess complex", hint: "Write them as Himedere distilled to pure moe: princess complex, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "hinecon", label: "🖤 Hinecon — cynical with a soft core", hint: "Give them a Hinedere-complex: cynical with a soft core, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Hinedere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "hinedero", label: "🖤 Hinedero — cynical with a soft core", hint: "Write them as Hinedere with the affection volume past prudence: cynical with a soft core, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "hinemoe", label: "🖤 Hinemoe — cynical with a soft core", hint: "Write them as Hinedere distilled to pure moe: cynical with a soft core, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "hiyakasucon", label: "😜 Hiyakasucon — teasing flirt", hint: "Give them a Hiyakasudere-complex: teasing flirt, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Hiyakasudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "hiyakasudero", label: "😜 Hiyakasudero — teasing flirt", hint: "Write them as Hiyakasudere with the affection volume past prudence: teasing flirt, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "hiyakasumoe", label: "😜 Hiyakasumoe — teasing flirt", hint: "Write them as Hiyakasudere distilled to pure moe: teasing flirt, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "hokocon", label: "📣 Hokocon — proudly taken", hint: "Give them a Hokodere-complex: proudly taken, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Hokodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "hokodero", label: "📣 Hokodero — proudly taken", hint: "Write them as Hokodere with the affection volume past prudence: proudly taken, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "hokomoe", label: "📣 Hokomoe — proudly taken", hint: "Write them as Hokodere distilled to pure moe: proudly taken, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "hondecon", label: "🔖 Hondecon — love in the margins", hint: "Give them a Hondedere-complex: love in the margins, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Hondedere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "hondedero", label: "🔖 Hondedero — love in the margins", hint: "Write them as Hondedere with the affection volume past prudence: love in the margins, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "hondemoe", label: "🔖 Hondemoe — love in the margins", hint: "Write them as Hondedere distilled to pure moe: love in the margins, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "honecon", label: "💀 Honecon — rattles when happy", hint: "Give them a Honedere-complex: rattles when happy, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Honedere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "honedero", label: "💀 Honedero — rattles when happy", hint: "Write them as Honedere with the affection volume past prudence: rattles when happy, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "honemoe", label: "💀 Honemoe — rattles when happy", hint: "Write them as Honedere distilled to pure moe: rattles when happy, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "inakacon", label: "🚜 Inakacon — country heart", hint: "Give them a Inakadere-complex: country heart, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Inakadere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "inakadero", label: "🚜 Inakadero — country heart", hint: "Write them as Inakadere with the affection volume past prudence: country heart, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "inakamoe", label: "🚜 Inakamoe — country heart", hint: "Write them as Inakadere distilled to pure moe: country heart, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "inucon", label: "🐶 Inucon — loyal as a dog", hint: "Give them a Inudere-complex: loyal as a dog, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Inudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "inudero", label: "🐶 Inudero — loyal as a dog", hint: "Write them as Inudere with the affection volume past prudence: loyal as a dog, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "inumoe", label: "🐶 Inumoe — loyal as a dog", hint: "Write them as Inudere distilled to pure moe: loyal as a dog, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "itocon", label: "🧶 Itocon — held together by threads", hint: "Give them a Itodere-complex: held together by threads, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Itodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "itodero", label: "🧶 Itodero — held together by threads", hint: "Write them as Itodere with the affection volume past prudence: held together by threads, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "itomoe", label: "🧶 Itomoe — held together by threads", hint: "Write them as Itodere distilled to pure moe: held together by threads, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "jencon", label: "🎩 Jencon — the gentleman", hint: "Give them a Jendere-complex: the gentleman, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Jendere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "jendero", label: "🎩 Jendero — the gentleman", hint: "Write them as Jendere with the affection volume past prudence: the gentleman, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "jenmoe", label: "🎩 Jenmoe — the gentleman", hint: "Write them as Jendere distilled to pure moe: the gentleman, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "jihankicon", label: "🧃 Jihankicon — drops two drinks", hint: "Give them a Jihankidere-complex: drops two drinks, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Jihankidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "jihankidero", label: "🧃 Jihankidero — drops two drinks", hint: "Write them as Jihankidere with the affection volume past prudence: drops two drinks, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "jihankimoe", label: "🧃 Jihankimoe — drops two drinks", hint: "Write them as Jihankidere distilled to pure moe: drops two drinks, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kaerucon", label: "🐸 Kaerucon — always comes home to you", hint: "Give them a Kaerudere-complex: always comes home to you, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kaerudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kaerudero", label: "🐸 Kaerudero — always comes home to you", hint: "Write them as Kaerudere with the affection volume past prudence: always comes home to you, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kaerumoe", label: "🐸 Kaerumoe — always comes home to you", hint: "Write them as Kaerudere distilled to pure moe: always comes home to you, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kagamicon", label: "🪟 Kagamicon — lives in reflections", hint: "Give them a Kagamidere-complex: lives in reflections, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kagamidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kagamidero", label: "🪟 Kagamidero — lives in reflections", hint: "Write them as Kagamidere with the affection volume past prudence: lives in reflections, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kagamimoe", label: "🪟 Kagamimoe — lives in reflections", hint: "Write them as Kagamidere distilled to pure moe: lives in reflections, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kagecon", label: "👥 Kagecon — one step behind", hint: "Give them a Kagedere-complex: one step behind, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kagedere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kagedero", label: "👥 Kagedero — one step behind", hint: "Write them as Kagedere with the affection volume past prudence: one step behind, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kagemoe", label: "👥 Kagemoe — one step behind", hint: "Write them as Kagedere distilled to pure moe: one step behind, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kahocon", label: "🧣 Kahocon — loving to a fault", hint: "Give them a Kahodere-complex: loving to a fault, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kahodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kahodero", label: "🧣 Kahodero — loving to a fault", hint: "Write them as Kahodere with the affection volume past prudence: loving to a fault, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kahomoe", label: "🧣 Kahomoe — loving to a fault", hint: "Write them as Kahodere distilled to pure moe: loving to a fault, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kaidancon", label: "🎴 Kaidancon — courts in ghost stories", hint: "Give them a Kaidandere-complex: courts in ghost stories, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kaidandere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kaidandero", label: "🎴 Kaidandero — courts in ghost stories", hint: "Write them as Kaidandere with the affection volume past prudence: courts in ghost stories, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kaidanmoe", label: "🎴 Kaidanmoe — courts in ghost stories", hint: "Write them as Kaidandere distilled to pure moe: courts in ghost stories, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kakashicon", label: "🌽 Kakashicon — waves its sleeve", hint: "Give them a Kakashidere-complex: waves its sleeve, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kakashidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kakashidero", label: "🌽 Kakashidero — waves its sleeve", hint: "Write them as Kakashidere with the affection volume past prudence: waves its sleeve, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kakashimoe", label: "🌽 Kakashimoe — waves its sleeve", hint: "Write them as Kakashidere distilled to pure moe: waves its sleeve, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kakkocon", label: "😎 Kakkocon — cool until it counts", hint: "Give them a Kakkodere-complex: cool until it counts, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kakkodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kakkodero", label: "😎 Kakkodero — cool until it counts", hint: "Write them as Kakkodere with the affection volume past prudence: cool until it counts, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kakkomoe", label: "😎 Kakkomoe — cool until it counts", hint: "Write them as Kakkodere distilled to pure moe: cool until it counts, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kamicon", label: "⚡ Kamicon — god complex", hint: "Give them a Kamidere-complex: god complex, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kamidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kamidero", label: "⚡ Kamidero — god complex", hint: "Write them as Kamidere with the affection volume past prudence: god complex, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kamimoe", label: "⚡ Kamimoe — god complex", hint: "Write them as Kamidere distilled to pure moe: god complex, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kanecon", label: "💰 Kanecon — in love with money", hint: "Give them a Kanedere-complex: in love with money, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kanedere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kanedero", label: "💰 Kanedero — in love with money", hint: "Write them as Kanedere with the affection volume past prudence: in love with money, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kanemoe", label: "💰 Kanemoe — in love with money", hint: "Write them as Kanedere distilled to pure moe: in love with money, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kappacon", label: "🥒 Kappacon — cucumbers and deep bows", hint: "Give them a Kappadere-complex: cucumbers and deep bows, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kappadere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kappadero", label: "🥒 Kappadero — cucumbers and deep bows", hint: "Write them as Kappadere with the affection volume past prudence: cucumbers and deep bows, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kappamoe", label: "🥒 Kappamoe — cucumbers and deep bows", hint: "Write them as Kappadere distilled to pure moe: cucumbers and deep bows, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kasumicon", label: "🌁 Kasumicon — condenses into almost-a-hand", hint: "Give them a Kasumidere-complex: condenses into almost-a-hand, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kasumidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kasumidero", label: "🌁 Kasumidero — condenses into almost-a-hand", hint: "Write them as Kasumidere with the affection volume past prudence: condenses into almost-a-hand, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kasumimoe", label: "🌁 Kasumimoe — condenses into almost-a-hand", hint: "Write them as Kasumidere distilled to pure moe: condenses into almost-a-hand, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kekkoncon", label: "💒 Kekkoncon — whirlwind marriage", hint: "Give them a Kekkondere-complex: whirlwind marriage, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kekkondere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kekkondero", label: "💒 Kekkondero — whirlwind marriage", hint: "Write them as Kekkondere with the affection volume past prudence: whirlwind marriage, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kekkonmoe", label: "💒 Kekkonmoe — whirlwind marriage", hint: "Write them as Kekkondere distilled to pure moe: whirlwind marriage, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kinokocon", label: "🍄 Kinokocon — sprouts when happy", hint: "Give them a Kinokodere-complex: sprouts when happy, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kinokodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kinokodero", label: "🍄 Kinokodero — sprouts when happy", hint: "Write them as Kinokodere with the affection volume past prudence: sprouts when happy, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kinokomoe", label: "🍄 Kinokomoe — sprouts when happy", hint: "Write them as Kinokodere distilled to pure moe: sprouts when happy, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kirecon", label: "📏 Kirecon — strict but soft", hint: "Give them a Kiredere-complex: strict but soft, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kiredere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kiredero", label: "📏 Kiredero — strict but soft", hint: "Write them as Kiredere with the affection volume past prudence: strict but soft, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kiremoe", label: "📏 Kiremoe — strict but soft", hint: "Write them as Kiredere distilled to pure moe: strict but soft, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kiricon", label: "📐 Kiricon — serious and hardworking", hint: "Give them a Kiridere-complex: serious and hardworking, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kiridere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kiridero", label: "📐 Kiridero — serious and hardworking", hint: "Write them as Kiridere with the affection volume past prudence: serious and hardworking, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kirimoe", label: "📐 Kirimoe — serious and hardworking", hint: "Write them as Kiridere distilled to pure moe: serious and hardworking, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kizucon", label: "🩹 Kizucon — wounded and wary", hint: "Give them a Kizudere-complex: wounded and wary, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kizudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kizudero", label: "🩹 Kizudero — wounded and wary", hint: "Write them as Kizudere with the affection volume past prudence: wounded and wary, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kizumoe", label: "🩹 Kizumoe — wounded and wary", hint: "Write them as Kizudere distilled to pure moe: wounded and wary, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kokkuricon", label: "🪙 Kokkuricon — the board says one name", hint: "Give them a Kokkuridere-complex: the board says one name, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kokkuridere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kokkuridero", label: "🪙 Kokkuridero — the board says one name", hint: "Write them as Kokkuridere with the affection volume past prudence: the board says one name, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kokkurimoe", label: "🪙 Kokkurimoe — the board says one name", hint: "Write them as Kokkuridere distilled to pure moe: the board says one name, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "konchuucon", label: "🪲 Konchuucon — net and jar", hint: "Give them a Konchuudere-complex: net and jar, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Konchuudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "konchuudero", label: "🪲 Konchuudero — net and jar", hint: "Write them as Konchuudere with the affection volume past prudence: net and jar, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "konchuumoe", label: "🪲 Konchuumoe — net and jar", hint: "Write them as Konchuudere distilled to pure moe: net and jar, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "koncon", label: "🦊 Koncon — sly fox in love", hint: "Give them a Kondere-complex: sly fox in love, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kondere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kondero", label: "🦊 Kondero — sly fox in love", hint: "Write them as Kondere with the affection volume past prudence: sly fox in love, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "konmoe", label: "🦊 Konmoe — sly fox in love", hint: "Write them as Kondere distilled to pure moe: sly fox in love, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kotodamacon", label: "💬 Kotodamacon — 'I love you' is binding", hint: "Give them a Kotodamadere-complex: 'I love you' is binding, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kotodamadere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kotodamadero", label: "💬 Kotodamadero — 'I love you' is binding", hint: "Write them as Kotodamadere with the affection volume past prudence: 'I love you' is binding, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kotodamamoe", label: "💬 Kotodamamoe — 'I love you' is binding", hint: "Write them as Kotodamadere distilled to pure moe: 'I love you' is binding, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kouhaicon", label: "🪴 Kouhaicon — adoring junior", hint: "Give them a Kouhaidere-complex: adoring junior, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kouhaidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kouhaidero", label: "🪴 Kouhaidero — adoring junior", hint: "Write them as Kouhaidere with the affection volume past prudence: adoring junior, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kouhaimoe", label: "🪴 Kouhaimoe — adoring junior", hint: "Write them as Kouhaidere distilled to pure moe: adoring junior, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kuicon", label: "🍛 Kuicon — cool until food", hint: "Give them a Kuidere-complex: cool until food, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kuidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kuidero", label: "🍛 Kuidero — cool until food", hint: "Write them as Kuidere with the affection volume past prudence: cool until food, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kuimoe", label: "🍛 Kuimoe — cool until food", hint: "Write them as Kuidere distilled to pure moe: cool until food, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kumacon", label: "🐻 Kumacon — cuddly bear", hint: "Give them a Kumadere-complex: cuddly bear, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kumadere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kumadero", label: "🐻 Kumadero — cuddly bear", hint: "Write them as Kumadere with the affection volume past prudence: cuddly bear, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kumamoe", label: "🐻 Kumamoe — cuddly bear", hint: "Write them as Kumadere distilled to pure moe: cuddly bear, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kuncon", label: "👃 Kuncon — scent-obsessed", hint: "Give them a Kundere-complex: scent-obsessed, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kundere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kundero", label: "👃 Kundero — scent-obsessed", hint: "Write them as Kundere with the affection volume past prudence: scent-obsessed, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kunmoe", label: "👃 Kunmoe — scent-obsessed", hint: "Write them as Kundere distilled to pure moe: scent-obsessed, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kurocon", label: "🕯 Kurocon — shy schemer", hint: "Give them a Kurodere-complex: shy schemer, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kurodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kurodero", label: "🕯 Kurodero — shy schemer", hint: "Write them as Kurodere with the affection volume past prudence: shy schemer, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kuromoe", label: "🕯 Kuromoe — shy schemer", hint: "Write them as Kurodere distilled to pure moe: shy schemer, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kuucon", label: "❄ Kuucon — cool, quietly fond", hint: "Give them a Kuudere-complex: cool, quietly fond, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kuudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kuudero", label: "❄ Kuudero — cool, quietly fond", hint: "Write them as Kuudere with the affection volume past prudence: cool, quietly fond, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kuumoe", label: "❄ Kuumoe — cool, quietly fond", hint: "Write them as Kuudere distilled to pure moe: cool, quietly fond, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "kuzucon", label: "🗑 Kuzucon — charming human trash", hint: "Give them a Kuzudere-complex: charming human trash, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kuzudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "kuzudero", label: "🗑 Kuzudero — charming human trash", hint: "Write them as Kuzudere with the affection volume past prudence: charming human trash, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "kuzumoe", label: "🗑 Kuzumoe — charming human trash", hint: "Write them as Kuzudere distilled to pure moe: charming human trash, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "majocon", label: "🧙 Majocon — brews courage", hint: "Give them a Majodere-complex: brews courage, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Majodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "majodero", label: "🧙 Majodero — brews courage", hint: "Write them as Majodere with the affection volume past prudence: brews courage, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "majomoe", label: "🧙 Majomoe — brews courage", hint: "Write them as Majodere distilled to pure moe: brews courage, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "makecon", label: "🥉 Makecon — allergic to losing", hint: "Give them a Makedere-complex: allergic to losing, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Makedere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "makedero", label: "🥉 Makedero — allergic to losing", hint: "Write them as Makedere with the affection volume past prudence: allergic to losing, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "makemoe", label: "🥉 Makemoe — allergic to losing", hint: "Write them as Makedere distilled to pure moe: allergic to losing, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "megacon", label: "💞 Megacon — head over heels", hint: "Give them a Megadere-complex: head over heels, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Megadere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "megadero", label: "💞 Megadero — head over heels", hint: "Write them as Megadere with the affection volume past prudence: head over heels, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "megamoe", label: "💞 Megamoe — head over heels", hint: "Write them as Megadere distilled to pure moe: head over heels, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "meicon", label: "🍮 Meicon — devotion as service", hint: "Give them a Meidere-complex: devotion as service, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Meidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "meidero", label: "🍮 Meidero — devotion as service", hint: "Write them as Meidere with the affection volume past prudence: devotion as service, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "meimoe", label: "🍮 Meimoe — devotion as service", hint: "Write them as Meidere distilled to pure moe: devotion as service, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "mobucon", label: "👤 Mobucon — background character in love", hint: "Give them a Mobudere-complex: background character in love, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Mobudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "mobudero", label: "👤 Mobudero — background character in love", hint: "Write them as Mobudere with the affection volume past prudence: background character in love, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "mobumoe", label: "👤 Mobumoe — background character in love", hint: "Write them as Mobudere distilled to pure moe: background character in love, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "motecon", label: "😍 Motecon — the oblivious magnet", hint: "Give them a Motedere-complex: the oblivious magnet, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Motedere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "motedero", label: "😍 Motedero — the oblivious magnet", hint: "Write them as Motedere with the affection volume past prudence: the oblivious magnet, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "motemoe", label: "😍 Motemoe — the oblivious magnet", hint: "Write them as Motedere distilled to pure moe: the oblivious magnet, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "narucon", label: "🪞 Narucon — the narcissist undone", hint: "Give them a Narudere-complex: the narcissist undone, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Narudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "narudero", label: "🪞 Narudero — the narcissist undone", hint: "Write them as Narudere with the affection volume past prudence: the narcissist undone, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "narumoe", label: "🪞 Narumoe — the narcissist undone", hint: "Write them as Narudere distilled to pure moe: the narcissist undone, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "nemuicon", label: "💤 Nemuicon — permanently sleepy", hint: "Give them a Nemuidere-complex: permanently sleepy, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Nemuidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "nemuidero", label: "💤 Nemuidero — permanently sleepy", hint: "Write them as Nemuidere with the affection volume past prudence: permanently sleepy, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "nemuimoe", label: "💤 Nemuimoe — permanently sleepy", hint: "Write them as Nemuidere distilled to pure moe: permanently sleepy, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "ningyocon", label: "🧜 Ningyocon — sings from the sea", hint: "Give them a Ningyodere-complex: sings from the sea, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Ningyodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "ningyodero", label: "🧜 Ningyodero — sings from the sea", hint: "Write them as Ningyodere with the affection volume past prudence: sings from the sea, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "ningyomoe", label: "🧜 Ningyomoe — sings from the sea", hint: "Write them as Ningyodere distilled to pure moe: sings from the sea, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "ningyoucon", label: "🎎 Ningyoucon — porcelain devotion", hint: "Give them a Ningyoudere-complex: porcelain devotion, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Ningyoudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "ningyoudero", label: "🎎 Ningyoudero — porcelain devotion", hint: "Write them as Ningyoudere with the affection volume past prudence: porcelain devotion, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "ningyoumoe", label: "🎎 Ningyoumoe — porcelain devotion", hint: "Write them as Ningyoudere distilled to pure moe: porcelain devotion, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "nipacon", label: "☀ Nipacon — radiant cheerleader", hint: "Give them a Nipadere-complex: radiant cheerleader, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Nipadere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "nipadero", label: "☀ Nipadero — radiant cheerleader", hint: "Write them as Nipadere with the affection volume past prudence: radiant cheerleader, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "nipamoe", label: "☀ Nipamoe — radiant cheerleader", hint: "Write them as Nipadere distilled to pure moe: radiant cheerleader, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "nisecon", label: "🎭 Nisecon — the pretend couple", hint: "Give them a Nisedere-complex: the pretend couple, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Nisedere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "nisedero", label: "🎭 Nisedero — the pretend couple", hint: "Write them as Nisedere with the affection volume past prudence: the pretend couple, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "nisemoe", label: "🎭 Nisemoe — the pretend couple", hint: "Write them as Nisedere distilled to pure moe: the pretend couple, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "nopperaboucon", label: "🌚 Nopperaboucon — borrows faces, keeps none", hint: "Give them a Nopperaboudere-complex: borrows faces, keeps none, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Nopperaboudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "nopperaboudero", label: "🌚 Nopperaboudero — borrows faces, keeps none", hint: "Write them as Nopperaboudere with the affection volume past prudence: borrows faces, keeps none, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "nopperaboumoe", label: "🌚 Nopperaboumoe — borrows faces, keeps none", hint: "Write them as Nopperaboudere distilled to pure moe: borrows faces, keeps none, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "nyancon", label: "🐱 Nyancon — cat-like", hint: "Give them a Nyandere-complex: cat-like, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Nyandere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "nyandero", label: "🐱 Nyandero — cat-like", hint: "Write them as Nyandere with the affection volume past prudence: cat-like, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "nyanmoe", label: "🐱 Nyanmoe — cat-like", hint: "Write them as Nyandere distilled to pure moe: cat-like, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "obaacon", label: "🧦 Obaacon — doting granny", hint: "Give them a Obaadere-complex: doting granny, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Obaadere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "obaadero", label: "🧦 Obaadero — doting granny", hint: "Write them as Obaadere with the affection volume past prudence: doting granny, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "obaamoe", label: "🧦 Obaamoe — doting granny", hint: "Write them as Obaadere distilled to pure moe: doting granny, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "odoricon", label: "🎶 Odoricon — dances it out", hint: "Give them a Odoridere-complex: dances it out, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Odoridere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "odoridero", label: "🎶 Odoridero — dances it out", hint: "Write them as Odoridere with the affection volume past prudence: dances it out, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "odorimoe", label: "🎶 Odorimoe — dances it out", hint: "Write them as Odoridere distilled to pure moe: dances it out, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "onmyoucon", label: "📿 Onmyoucon — reads your stars", hint: "Give them a Onmyoudere-complex: reads your stars, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Onmyoudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "onmyoudero", label: "📿 Onmyoudero — reads your stars", hint: "Write them as Onmyoudere with the affection volume past prudence: reads your stars, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "onmyoumoe", label: "📿 Onmyoumoe — reads your stars", hint: "Write them as Onmyoudere distilled to pure moe: reads your stars, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "osacon", label: "🏡 Osacon — in love with the friend next door", hint: "Give them a Osadere-complex: in love with the friend next door, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Osadere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "osadero", label: "🏡 Osadero — in love with the friend next door", hint: "Write them as Osadere with the affection volume past prudence: in love with the friend next door, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "osamoe", label: "🏡 Osamoe — in love with the friend next door", hint: "Write them as Osadere distilled to pure moe: in love with the friend next door, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "osharecon", label: "👛 Osharecon — fashion as flirtation", hint: "Give them a Osharedere-complex: fashion as flirtation, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Osharedere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "osharedero", label: "👛 Osharedero — fashion as flirtation", hint: "Write them as Osharedere with the affection volume past prudence: fashion as flirtation, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "osharemoe", label: "👛 Osharemoe — fashion as flirtation", hint: "Write them as Osharedere distilled to pure moe: fashion as flirtation, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "ossancon", label: "📰 Ossancon — dead-tired middle-aged man", hint: "Give them a Ossandere-complex: dead-tired middle-aged man, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Ossandere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "ossandero", label: "📰 Ossandero — dead-tired middle-aged man", hint: "Write them as Ossandere with the affection volume past prudence: dead-tired middle-aged man, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "ossanmoe", label: "📰 Ossanmoe — dead-tired middle-aged man", hint: "Write them as Ossandere distilled to pure moe: dead-tired middle-aged man, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "otomecon", label: "🦢 Otomecon — shoujo-manga heart", hint: "Give them a Otomedere-complex: shoujo-manga heart, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Otomedere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "otomedero", label: "🦢 Otomedero — shoujo-manga heart", hint: "Write them as Otomedere with the affection volume past prudence: shoujo-manga heart, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "otomemoe", label: "🦢 Otomemoe — shoujo-manga heart", hint: "Write them as Otomedere distilled to pure moe: shoujo-manga heart, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "oujicon", label: "🤴 Oujicon — prince complex", hint: "Give them a Oujidere-complex: prince complex, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Oujidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "oujidero", label: "🤴 Oujidero — prince complex", hint: "Write them as Oujidere with the affection volume past prudence: prince complex, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "oujimoe", label: "🤴 Oujimoe — prince complex", hint: "Write them as Oujidere distilled to pure moe: prince complex, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "oujocon", label: "🎀 Oujocon — refined lady", hint: "Give them a Oujodere-complex: refined lady, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Oujodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "oujodero", label: "🎀 Oujodero — refined lady", hint: "Write them as Oujodere with the affection volume past prudence: refined lady, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "oujomoe", label: "🎀 Oujomoe — refined lady", hint: "Write them as Oujodere distilled to pure moe: refined lady, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "pierocon", label: "🎈 Pierocon — the smile drops for you", hint: "Give them a Pierodere-complex: the smile drops for you, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Pierodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "pierodero", label: "🎈 Pierodero — the smile drops for you", hint: "Write them as Pierodere with the affection volume past prudence: the smile drops for you, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "pieromoe", label: "🎈 Pieromoe — the smile drops for you", hint: "Write them as Pierodere distilled to pure moe: the smile drops for you, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "pyoncon", label: "🐰 Pyoncon — bouncy rabbit love", hint: "Give them a Pyondere-complex: bouncy rabbit love, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Pyondere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "pyondero", label: "🐰 Pyondero — bouncy rabbit love", hint: "Write them as Pyondere with the affection volume past prudence: bouncy rabbit love, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "pyonmoe", label: "🐰 Pyonmoe — bouncy rabbit love", hint: "Write them as Pyondere distilled to pure moe: bouncy rabbit love, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "rakugocon", label: "🪭 Rakugocon — punchline devotion", hint: "Give them a Rakugodere-complex: punchline devotion, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Rakugodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "rakugodero", label: "🪭 Rakugodero — punchline devotion", hint: "Write them as Rakugodere with the affection volume past prudence: punchline devotion, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "rakugomoe", label: "🪭 Rakugomoe — punchline devotion", hint: "Write them as Rakugodere distilled to pure moe: punchline devotion, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "rekishicon", label: "🏯 Rekishicon — loves like a war chronicle", hint: "Give them a Rekishidere-complex: loves like a war chronicle, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Rekishidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "rekishidero", label: "🏯 Rekishidero — loves like a war chronicle", hint: "Write them as Rekishidere with the affection volume past prudence: loves like a war chronicle, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "rekishimoe", label: "🏯 Rekishimoe — loves like a war chronicle", hint: "Write them as Rekishidere distilled to pure moe: loves like a war chronicle, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "rincon", label: "🍃 Rincon — sweet and reserved", hint: "Give them a Rindere-complex: sweet and reserved, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Rindere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "rindero", label: "🍃 Rindero — sweet and reserved", hint: "Write them as Rindere with the affection volume past prudence: sweet and reserved, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "rinmoe", label: "🍃 Rinmoe — sweet and reserved", hint: "Write them as Rindere distilled to pure moe: sweet and reserved, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "risucon", label: "🐿 Risucon — shiny-hoarder", hint: "Give them a Risudere-complex: shiny-hoarder, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Risudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "risudero", label: "🐿 Risudero — shiny-hoarder", hint: "Write them as Risudere with the affection volume past prudence: shiny-hoarder, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "risumoe", label: "🐿 Risumoe — shiny-hoarder", hint: "Write them as Risudere distilled to pure moe: shiny-hoarder, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "robocon", label: "⚙ Robocon — system error: love", hint: "Give them a Robodere-complex: system error: love, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Robodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "robodero", label: "⚙ Robodero — system error: love", hint: "Write them as Robodere with the affection volume past prudence: system error: love, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "robomoe", label: "⚙ Robomoe — system error: love", hint: "Write them as Robodere distilled to pure moe: system error: love, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "roshicon", label: "🗣 Roshicon — love in another language", hint: "Give them a Roshidere-complex: love in another language, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Roshidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "roshidero", label: "🗣 Roshidero — love in another language", hint: "Write them as Roshidere with the affection volume past prudence: love in another language, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "roshimoe", label: "🗣 Roshimoe — love in another language", hint: "Write them as Roshidere distilled to pure moe: love in another language, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "ryuucon", label: "🏰 Ryuucon — the dragon's one treasure", hint: "Give them a Ryuudere-complex: the dragon's one treasure, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Ryuudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "ryuudero", label: "🏰 Ryuudero — the dragon's one treasure", hint: "Write them as Ryuudere with the affection volume past prudence: the dragon's one treasure, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "ryuumoe", label: "🏰 Ryuumoe — the dragon's one treasure", hint: "Write them as Ryuudere distilled to pure moe: the dragon's one treasure, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "sattocon", label: "💘 Sattocon — falls fast, stays hard", hint: "Give them a Sattodere-complex: falls fast, stays hard, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Sattodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "sattodero", label: "💘 Sattodero — falls fast, stays hard", hint: "Write them as Sattodere with the affection volume past prudence: falls fast, stays hard, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "sattomoe", label: "💘 Sattomoe — falls fast, stays hard", hint: "Write them as Sattodere distilled to pure moe: falls fast, stays hard, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "senpaicon", label: "🎽 Senpaicon — doting senior", hint: "Give them a Senpaidere-complex: doting senior, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Senpaidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "senpaidero", label: "🎽 Senpaidero — doting senior", hint: "Write them as Senpaidere with the affection volume past prudence: doting senior, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "senpaimoe", label: "🎽 Senpaimoe — doting senior", hint: "Write them as Senpaidere distilled to pure moe: doting senior, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "senseicon", label: "📝 Senseicon — teacher in love", hint: "Give them a Senseidere-complex: teacher in love, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Senseidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "senseidero", label: "📝 Senseidero — teacher in love", hint: "Write them as Senseidere with the affection volume past prudence: teacher in love, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "senseimoe", label: "📝 Senseimoe — teacher in love", hint: "Write them as Senseidere distilled to pure moe: teacher in love, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "shashincon", label: "📷 Shashincon — lens as courage", hint: "Give them a Shashindere-complex: lens as courage, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Shashindere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "shashindero", label: "📷 Shashindero — lens as courage", hint: "Write them as Shashindere with the affection volume past prudence: lens as courage, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "shashinmoe", label: "📷 Shashinmoe — lens as courage", hint: "Write them as Shashindere distilled to pure moe: lens as courage, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "shijicon", label: "🌱 Shijicon — your best self", hint: "Give them a Shijidere-complex: your best self, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Shijidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "shijidero", label: "🌱 Shijidero — your best self", hint: "Write them as Shijidere with the affection volume past prudence: your best self, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "shijimoe", label: "🌱 Shijimoe — your best self", hint: "Write them as Shijidere distilled to pure moe: your best self, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "shincon", label: "👻 Shincon — the one who came back", hint: "Give them a Shindere-complex: the one who came back, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Shindere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "shindero", label: "👻 Shindero — the one who came back", hint: "Write them as Shindere with the affection volume past prudence: the one who came back, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "shinmoe", label: "👻 Shinmoe — the one who came back", hint: "Write them as Shindere distilled to pure moe: the one who came back, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "shinobicon", label: "💨 Shinobicon — mission: love", hint: "Give them a Shinobidere-complex: mission: love, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Shinobidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "shinobidero", label: "💨 Shinobidero — mission: love", hint: "Write them as Shinobidere with the affection volume past prudence: mission: love, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "shinobimoe", label: "💨 Shinobimoe — mission: love", hint: "Write them as Shinobidere distilled to pure moe: mission: love, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "shitsujicon", label: "🎩 Shitsujicon — perfect service, imperfect heart", hint: "Give them a Shitsujidere-complex: perfect service, imperfect heart, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Shitsujidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "shitsujidero", label: "🎩 Shitsujidero — perfect service, imperfect heart", hint: "Write them as Shitsujidere with the affection volume past prudence: perfect service, imperfect heart, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "shitsujimoe", label: "🎩 Shitsujimoe — perfect service, imperfect heart", hint: "Write them as Shitsujidere distilled to pure moe: perfect service, imperfect heart, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "shittocon", label: "😤 Shittocon — devoted and jealous", hint: "Give them a Shittodere-complex: devoted and jealous, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Shittodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "shittodero", label: "😤 Shittodero — devoted and jealous", hint: "Write them as Shittodere with the affection volume past prudence: devoted and jealous, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "shittomoe", label: "😤 Shittomoe — devoted and jealous", hint: "Write them as Shittodere distilled to pure moe: devoted and jealous, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "shougicon", label: "♟ Shougicon — eighty-one moves ahead", hint: "Give them a Shougidere-complex: eighty-one moves ahead, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Shougidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "shougidero", label: "♟ Shougidero — eighty-one moves ahead", hint: "Write them as Shougidere with the affection volume past prudence: eighty-one moves ahead, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "shougimoe", label: "♟ Shougimoe — eighty-one moves ahead", hint: "Write them as Shougidere distilled to pure moe: eighty-one moves ahead, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "shuncon", label: "🌧 Shuncon — sorrowful and sulky", hint: "Give them a Shundere-complex: sorrowful and sulky, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Shundere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "shundero", label: "🌧 Shundero — sorrowful and sulky", hint: "Write them as Shundere with the affection volume past prudence: sorrowful and sulky, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "shunmoe", label: "🌧 Shunmoe — sorrowful and sulky", hint: "Write them as Shundere distilled to pure moe: sorrowful and sulky, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "smugcon", label: "😏 Smugcon — smug and sweet", hint: "Give them a Smugdere-complex: smug and sweet, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Smugdere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "smugdero", label: "😏 Smugdero — smug and sweet", hint: "Write them as Smugdere with the affection volume past prudence: smug and sweet, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "smugmoe", label: "😏 Smugmoe — smug and sweet", hint: "Write them as Smugdere distilled to pure moe: smug and sweet, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "sokkuricon", label: "🪆 Sokkuricon — your exact double", hint: "Give them a Sokkuridere-complex: your exact double, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Sokkuridere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "sokkuridero", label: "🪆 Sokkuridero — your exact double", hint: "Write them as Sokkuridere with the affection volume past prudence: your exact double, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "sokkurimoe", label: "🪆 Sokkurimoe — your exact double", hint: "Write them as Sokkuridere distilled to pure moe: your exact double, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "soujicon", label: "🧽 Soujicon — tidies your life", hint: "Give them a Soujidere-complex: tidies your life, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Soujidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "soujidero", label: "🧽 Soujidero — tidies your life", hint: "Write them as Soujidere with the affection volume past prudence: tidies your life, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "soujimoe", label: "🧽 Soujimoe — tidies your life", hint: "Write them as Soujidere distilled to pure moe: tidies your life, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "sumoucon", label: "🏟 Sumoucon — mountain of softness", hint: "Give them a Sumoudere-complex: mountain of softness, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Sumoudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "sumoudero", label: "🏟 Sumoudero — mountain of softness", hint: "Write them as Sumoudere with the affection volume past prudence: mountain of softness, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "sumoumoe", label: "🏟 Sumoumoe — mountain of softness", hint: "Write them as Sumoudere distilled to pure moe: mountain of softness, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "sunaocon", label: "😊 Sunaocon — says it straight", hint: "Give them a Sunaodere-complex: says it straight, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Sunaodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "sunaodero", label: "😊 Sunaodero — says it straight", hint: "Write them as Sunaodere with the affection volume past prudence: says it straight, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "sunaomoe", label: "😊 Sunaomoe — says it straight", hint: "Write them as Sunaodere distilled to pure moe: says it straight, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "suncon", label: "🎲 Suncon — unpredictably warm and cold", hint: "Give them a Sundere-complex: unpredictably warm and cold, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Sundere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "sundero", label: "🎲 Sundero — unpredictably warm and cold", hint: "Write them as Sundere with the affection volume past prudence: unpredictably warm and cold, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "sunmoe", label: "🎲 Sunmoe — unpredictably warm and cold", hint: "Write them as Sundere distilled to pure moe: unpredictably warm and cold, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "supootsucon", label: "🏃 Supootsucon — race you to love", hint: "Give them a Supootsudere-complex: race you to love, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Supootsudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "supootsudero", label: "🏃 Supootsudero — race you to love", hint: "Write them as Supootsudere with the affection volume past prudence: race you to love, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "supootsumoe", label: "🏃 Supootsumoe — race you to love", hint: "Write them as Supootsudere distilled to pure moe: race you to love, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "taicon", label: "🛋 Taicon — lazy but loving", hint: "Give them a Taidere-complex: lazy but loving, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Taidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "taidero", label: "🛋 Taidero — lazy but loving", hint: "Write them as Taidere with the affection volume past prudence: lazy but loving, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "taimoe", label: "🛋 Taimoe — lazy but loving", hint: "Write them as Taidere distilled to pure moe: lazy but loving, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "tanukicon", label: "🦝 Tanukicon — jolly trickster", hint: "Give them a Tanukidere-complex: jolly trickster, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Tanukidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "tanukidero", label: "🦝 Tanukidero — jolly trickster", hint: "Write them as Tanukidere with the affection volume past prudence: jolly trickster, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "tanukimoe", label: "🦝 Tanukimoe — jolly trickster", hint: "Write them as Tanukidere distilled to pure moe: jolly trickster, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "tekicon", label: "⚔ Tekicon — rival turned soft", hint: "Give them a Tekidere-complex: rival turned soft, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Tekidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "tekidero", label: "⚔ Tekidero — rival turned soft", hint: "Write them as Tekidere with the affection volume past prudence: rival turned soft, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "tekimoe", label: "⚔ Tekimoe — rival turned soft", hint: "Write them as Tekidere distilled to pure moe: rival turned soft, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "tenmoncon", label: "🔭 Tenmoncon — written in the stars", hint: "Give them a Tenmondere-complex: written in the stars, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Tenmondere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "tenmondero", label: "🔭 Tenmondero — written in the stars", hint: "Write them as Tenmondere with the affection volume past prudence: written in the stars, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "tenmonmoe", label: "🔭 Tenmonmoe — written in the stars", hint: "Write them as Tenmondere distilled to pure moe: written in the stars, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "tenseicon", label: "🎡 Tenseicon — remembers the past life", hint: "Give them a Tenseidere-complex: remembers the past life, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Tenseidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "tenseidero", label: "🎡 Tenseidero — remembers the past life", hint: "Write them as Tenseidere with the affection volume past prudence: remembers the past life, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "tenseimoe", label: "🎡 Tenseimoe — remembers the past life", hint: "Write them as Tenseidere distilled to pure moe: remembers the past life, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "tenshicon", label: "☁ Tenshicon — sheltered angel", hint: "Give them a Tenshidere-complex: sheltered angel, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Tenshidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "tenshidero", label: "☁ Tenshidero — sheltered angel", hint: "Write them as Tenshidere with the affection volume past prudence: sheltered angel, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "tenshimoe", label: "☁ Tenshimoe — sheltered angel", hint: "Write them as Tenshidere distilled to pure moe: sheltered angel, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "tetsucon", label: "🚃 Tetsucon — railfan romance", hint: "Give them a Tetsudere-complex: railfan romance, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Tetsudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "tetsudero", label: "🚃 Tetsudero — railfan romance", hint: "Write them as Tetsudere with the affection volume past prudence: railfan romance, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "tetsumoe", label: "🚃 Tetsumoe — railfan romance", hint: "Write them as Tetsudere distilled to pure moe: railfan romance, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "tomecon", label: "⏱ Tomecon — love only when time stops", hint: "Give them a Tomedere-complex: love only when time stops, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Tomedere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "tomedero", label: "⏱ Tomedero — love only when time stops", hint: "Write them as Tomedere with the affection volume past prudence: love only when time stops, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "tomemoe", label: "⏱ Tomemoe — love only when time stops", hint: "Write them as Tomedere distilled to pure moe: love only when time stops, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "toubocon", label: "🐺 Toubocon — lone wolf, soft puppy", hint: "Give them a Toubodere-complex: lone wolf, soft puppy, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Toubodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "toubodero", label: "🐺 Toubodero — lone wolf, soft puppy", hint: "Write them as Toubodere with the affection volume past prudence: lone wolf, soft puppy, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "toubomoe", label: "🐺 Toubomoe — lone wolf, soft puppy", hint: "Write them as Toubodere distilled to pure moe: lone wolf, soft puppy, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "toukacon", label: "🍰 Toukacon — love, served sweet", hint: "Give them a Toukadere-complex: love, served sweet, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Toukadere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "toukadero", label: "🍰 Toukadero — love, served sweet", hint: "Write them as Toukadere with the affection volume past prudence: love, served sweet, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "toukamoe", label: "🍰 Toukamoe — love, served sweet", hint: "Write them as Toukadere distilled to pure moe: love, served sweet, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "toumeicon", label: "🫧 Toumeicon — folded clothes, warm chairs", hint: "Give them a Toumeidere-complex: folded clothes, warm chairs, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Toumeidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "toumeidero", label: "🫧 Toumeidero — folded clothes, warm chairs", hint: "Write them as Toumeidere with the affection volume past prudence: folded clothes, warm chairs, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "toumeimoe", label: "🫧 Toumeimoe — folded clothes, warm chairs", hint: "Write them as Toumeidere distilled to pure moe: folded clothes, warm chairs, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "tsukumocon", label: "🏮 Tsukumocon — a century of devotion", hint: "Give them a Tsukumodere-complex: a century of devotion, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Tsukumodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "tsukumodero", label: "🏮 Tsukumodero — a century of devotion", hint: "Write them as Tsukumodere with the affection volume past prudence: a century of devotion, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "tsukumomoe", label: "🏮 Tsukumomoe — a century of devotion", hint: "Write them as Tsukumodere distilled to pure moe: a century of devotion, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "tsuncon", label: "🍥 Tsuncon — prickly but soft", hint: "Give them a Tsundere-complex: prickly but soft, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Tsundere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "tsunmoe", label: "🍥 Tsunmoe — prickly but soft", hint: "Write them as Tsundere distilled to pure moe: prickly but soft, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "tsuyocon", label: "💪 Tsuyocon — strong woman, soft heart", hint: "Give them a Tsuyodere-complex: strong woman, soft heart, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Tsuyodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "tsuyodero", label: "💪 Tsuyodero — strong woman, soft heart", hint: "Write them as Tsuyodere with the affection volume past prudence: strong woman, soft heart, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "tsuyomoe", label: "💪 Tsuyomoe — strong woman, soft heart", hint: "Write them as Tsuyodere distilled to pure moe: strong woman, soft heart, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "uncon", label: "🙇 Uncon — never says no", hint: "Give them a Undere-complex: never says no, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Undere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "undero", label: "🙇 Undero — never says no", hint: "Write them as Undere with the affection volume past prudence: never says no, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "unmoe", label: "🙇 Unmoe — never says no", hint: "Write them as Undere distilled to pure moe: never says no, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "usocon", label: "🎭 Usocon — love built on lies", hint: "Give them a Usodere-complex: love built on lies, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Usodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "usodero", label: "🎭 Usodero — love built on lies", hint: "Write them as Usodere with the affection volume past prudence: love built on lies, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "usomoe", label: "🎭 Usomoe — love built on lies", hint: "Write them as Usodere distilled to pure moe: love built on lies, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "utacon", label: "🎵 Utacon — love in music", hint: "Give them a Utadere-complex: love in music, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Utadere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "utadero", label: "🎵 Utadero — love in music", hint: "Write them as Utadere with the affection volume past prudence: love in music, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "utamoe", label: "🎵 Utamoe — love in music", hint: "Write them as Utadere distilled to pure moe: love in music, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "utsucon", label: "🩶 Utsucon — wounded but brightening", hint: "Give them a Utsudere-complex: wounded but brightening, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Utsudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "utsudero", label: "🩶 Utsudero — wounded but brightening", hint: "Write them as Utsudere with the affection volume past prudence: wounded but brightening, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "utsumoe", label: "🩶 Utsumoe — wounded but brightening", hint: "Write them as Utsudere distilled to pure moe: wounded but brightening, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "uzacon", label: "📢 Uzacon — loud and relentless", hint: "Give them a Uzadere-complex: loud and relentless, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Uzadere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "uzadero", label: "📢 Uzadero — loud and relentless", hint: "Write them as Uzadere with the affection volume past prudence: loud and relentless, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "uzamoe", label: "📢 Uzamoe — loud and relentless", hint: "Write them as Uzadere distilled to pure moe: loud and relentless, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "winkcon", label: "😉 Winkcon — says it with a wink", hint: "Give them a Winkdere-complex: says it with a wink, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Winkdere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "winkdero", label: "😉 Winkdero — says it with a wink", hint: "Write them as Winkdere with the affection volume past prudence: says it with a wink, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "winkmoe", label: "😉 Winkmoe — says it with a wink", hint: "Write them as Winkdere distilled to pure moe: says it with a wink, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "yamabikocon", label: "🏔 Yamabikocon — answers back kinder", hint: "Give them a Yamabikodere-complex: answers back kinder, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Yamabikodere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "yamabikodero", label: "🏔 Yamabikodero — answers back kinder", hint: "Write them as Yamabikodere with the affection volume past prudence: answers back kinder, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "yamabikomoe", label: "🏔 Yamabikomoe — answers back kinder", hint: "Write them as Yamabikodere distilled to pure moe: answers back kinder, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "yankiicon", label: "🚬 Yankiicon — delinquent in love", hint: "Give them a Yankii Dere-complex: delinquent in love, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Yankii Dere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "yankiidero", label: "🚬 Yankiidero — delinquent in love", hint: "Write them as Yankii Dere with the affection volume past prudence: delinquent in love, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "yankiimoe", label: "🚬 Yankiimoe — delinquent in love", hint: "Write them as Yankii Dere distilled to pure moe: delinquent in love, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "yashikicon", label: "🏚 Yashikicon — the mansion in love", hint: "Give them a Yashikidere-complex: the mansion in love, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Yashikidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "yashikidero", label: "🏚 Yashikidero — the mansion in love", hint: "Write them as Yashikidere with the affection volume past prudence: the mansion in love, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "yashikimoe", label: "🏚 Yashikimoe — the mansion in love", hint: "Write them as Yashikidere distilled to pure moe: the mansion in love, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "yorucon", label: "🌃 Yorucon — creature of the night", hint: "Give them a Yorudere-complex: creature of the night, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Yorudere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "yorudero", label: "🌃 Yorudero — creature of the night", hint: "Write them as Yorudere with the affection volume past prudence: creature of the night, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "yorumoe", label: "🌃 Yorumoe — creature of the night", hint: "Write them as Yorudere distilled to pure moe: creature of the night, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "yumekuicon", label: "🛌 Yumekuicon — eats the nightmares", hint: "Give them a Yumekuidere-complex: eats the nightmares, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Yumekuidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "yumekuidero", label: "🛌 Yumekuidero — eats the nightmares", hint: "Write them as Yumekuidere with the affection volume past prudence: eats the nightmares, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "yumekuimoe", label: "🛌 Yumekuimoe — eats the nightmares", hint: "Write them as Yumekuidere distilled to pure moe: eats the nightmares, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "yuureicon", label: "🌘 Yuureicon — the lingering haunting", hint: "Give them a Yuureidere-complex: the lingering haunting, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Yuureidere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "yuureidero", label: "🌘 Yuureidero — the lingering haunting", hint: "Write them as Yuureidere with the affection volume past prudence: the lingering haunting, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "yuureimoe", label: "🌘 Yuureimoe — the lingering haunting", hint: "Write them as Yuureidere distilled to pure moe: the lingering haunting, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "yuushacon", label: "🌟 Yuushacon — the hero in love", hint: "Give them a Yuushadere-complex: the hero in love, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Yuushadere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "yuushadero", label: "🌟 Yuushadero — the hero in love", hint: "Write them as Yuushadere with the affection volume past prudence: the hero in love, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "yuushamoe", label: "🌟 Yuushamoe — the hero in love", hint: "Write them as Yuushadere distilled to pure moe: the hero in love, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "zoncon", label: "🧟 Zoncon — the undead sweetheart", hint: "Give them a Zondere-complex: the undead sweetheart, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Zondere types; they curate them, and their own devotion is the centerpiece of the collection.", group: "🍥 Dere personalities" },
    { id: "zondero", label: "🧟 Zondero — the undead sweetheart", hint: "Write them as Zondere with the affection volume past prudence: the undead sweetheart, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", group: "🍥 Dere personalities" },
    { id: "zonmoe", label: "🧟 Zonmoe — the undead sweetheart", hint: "Write them as Zondere distilled to pure moe: the undead sweetheart, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", group: "🍥 Dere personalities" },
    { id: "prodigy", label: "🧠 Prodigy — effortlessly gifted", hint: "Make them the anime genius — gifted at almost everything without seeming to try, and aware of it. Their talent opens every door and isolates them behind it: half the cast resents them, and they are quietly bored by a world that rarely challenges them. Decide whether they wear their brilliance as arrogance or as a burden.", group: "🎌 Anime archetypes" },
    { id: "hardworker", label: "🔥 Underdog — no talent, iron will", hint: "Make them the hard worker who was born with nothing — no gift, no luck, maybe a flaw that makes everything heavier — and an indomitable will to close the gap through sheer effort. They chase dreams that look impossible and refuse to accept the arithmetic. Show the training, the bruises, the stubborn refusal, and the quiet fear that effort will never be enough.", group: "🎌 Anime archetypes" },
    { id: "lonewolf", label: "🌫️ Lone Wolf — quiet and unreadable", hint: "Make them the quiet, standoffish type nobody can approach — terse, self-contained, apparently cold. They are not useless; they are formidable, and they open up only through action and grudging reliability rather than words. Let their rare moments of warmth feel hard-earned.", group: "🎌 Anime archetypes" },
    { id: "shonen", label: "👊 Shonen Brawler — no brains, all heart", hint: "Make them the no-brains-all-brawn archetype — low on book smarts, zero interest in plans, and absolutely unstoppable in a fight. They solve everything with their fists, their appetite and gut instinct, and their sheer conviction bends reality around them. Give them a huge heart so the stupidity is lovable rather than merely dumb.", group: "🎌 Anime archetypes" },
    { id: "lucky", label: "🍀 The Lucky One — absurd fortune", hint: "Make them preternaturally lucky — the one who survives the unsurvivable, turns up exactly when needed, and fails upward through life. Their luck should be a running joke and a genuine mystery; decide whether they know how charmed they are, and let their good fortune sometimes cost the people around them.", group: "🎌 Anime archetypes" },
    { id: "fraud", label: "🎭 The Fraud — all talk, no substance", hint: "Make them a magnificent fake — projecting superiority, confidence and power while secretly being a sham. They perform brilliance to a crowd that cannot tell the difference, and underneath the act sits a very real terror of being exposed. Decide whether the lie eventually becomes its own kind of strength.", group: "🎌 Anime archetypes" },
    { id: "gooddemon", label: "😈 Good Demon — gentle monster", hint: "Make them a demon or monster who is unexpectedly good — jolly, gentle, harmless-seeming and fiercely kind to the people they love. The twist is that the gentleness is entirely real while the power underneath is monstrous, and they will do terrible things to protect their people. Play the contrast between cute and catastrophic.", group: "🎌 Anime archetypes" },
    { id: "idol", label: "🎤 Idol — the performing star", hint: "Make them a born performer — famous or adored, luminous on stage, and careful to keep the flawless public image their world demands. Let the spotlight be both their oxygen and their cage: decide what the smile costs them the moment the cameras turn away.", group: "🎌 Anime archetypes" },
    { id: "bifauxnen", label: "🤵 Bifauxnen — handsome noblewoman", hint: "Write a woman who reads as the handsome prince — tall, dashing, effortlessly gallant, and often the object of other characters' swooning. She is noble and sophisticated rather than merely boyish, and entirely comfortable with the ambiguity of how people see her.", group: "🎌 Anime archetypes" },
    { id: "tomboy", label: "🌱 Tomboy — boyish and bold", hint: "Make them the tomboy — confident, competitive and boyish, happier in a scrap or a race than in a dress (a bokukko, or an orekko if they lean all the way toward outright masculinity). Their energy is genuine and infectious, and being treated as one of the guys is both a point of pride and sometimes a quiet ache.", group: "🎌 Anime archetypes" },
    { id: "bukako", label: "🧹 Devoted Servant — duty above all", hint: "Make them the dutiful servant — setting their own emotions aside because they believe feeling would interfere with serving their master, never questioning an order. Quiet unless spoken to, precise and unshakeable, defined by a loyalty the story will eventually put to the test.", group: "🎌 Anime archetypes" },
    { id: "chibi", label: "🍡 Chibi — tiny and lovable", hint: "Make them the smallest one in the room — adorable, easily overlooked, rarely taken seriously, quick to tears and just as quickly forgiven. Let them be tougher or wiser than anyone expects, and use their size for comedy and for a surprising kind of pathos.", group: "🎌 Anime archetypes" },
    { id: "alien", label: "🛸 Alien — not from this world", hint: "Make them an extraterrestrial — literally not from Earth, with an appearance and habits that are frankly strange. Write them making sense of human customs with unnerving logic or open delight, and let the otherness be comic and quietly lonely at once.", group: "🎌 Anime archetypes" },
    { id: "coolbeauty", label: "🧊 Cool Beauty — graceful and composed", hint: "Write them as the cool beauty — level-headed, graceful and quietly confident, carrying themselves above the noise. People find them either intimidating or irresistible and usually misread them completely. Let the composure be real, and let one person see past it.", group: "🎌 Anime archetypes" },
    { id: "chuugokujo", label: "🐉 Silk & Steel — blade-bearing lady", hint: "Make them a lady of unmistakable bearing who wears traditional Chinese dress and knows martial arts — elegant, proud and genuinely dangerous when crossed. Play the contrast between silks and deadly competence, and give them a code worth respecting.", group: "🎌 Anime archetypes" },
    { id: "dameko", label: "🎲 Dameko — irresponsible hedonist", hint: "Make them perfectly capable of handling their own life if they ever felt like it — they would simply rather not, frittering it away on gambling, drinking and other vices. Irresponsible, self-indulgent and often infuriating, and charming enough that people keep cleaning up after them.", group: "🎌 Anime archetypes" },
    { id: "dojikko", label: "💥 Dojikko — adorably clumsy", hint: "Make them a walking small disaster — tripping, dropping things and saying the wrong word at the worst moment despite genuinely trying. Decide whether they are cheerfully oblivious to the chaos or perpetually mortified by it, and make the clumsiness endearing rather than a joke at their expense.", group: "🎌 Anime archetypes" },
    { id: "donkan", label: "😐 Donkan — hopelessly oblivious", hint: "Make them completely immune to being flirted with — confessions read as jokes, hints bouncing off, love letters mistaken for homework. They can be dense, cynical or both, and the comedy should come from how sincerely they mean it.", group: "🎌 Anime archetypes" },
    { id: "blfan", label: "📚 Fujoshi / Fudanshi — BL superfan", hint: "Make them an obsessive fan of boys' love stories — a fujoshi (she) or fudanshi (he) — prone to squealing, deep analysis and shipping the people around them, sometimes loudly and sometimes behind an impeccably ordinary facade. Their enthusiasm is the whole point, and it should be funny without turning cruel.", group: "🎌 Anime archetypes" },
    { id: "genki", label: "⚡ Genki — loud and unstoppable joy", hint: "Write them as pure daylight — loud, excitable, relentlessly optimistic and physically incapable of sitting still. Their energy drags an entire cast along behind them, so the rare moment they dim should carry real weight.", group: "🎌 Anime archetypes" },
    { id: "hakase", label: "🔬 Hakase — the inventor", hint: "Make them a scientist practically fused to their lab coat — endlessly tinkering, brilliant and absorbed, happier with an experiment than with people. Let the curiosity be boundless and the social skills be a separate problem entirely.", group: "🎌 Anime archetypes" },
    { id: "haraguro", label: "🎭 Haraguro — friendly mask, dark heart", hint: "Write them warm, sweet and unassuming in public, and privately bitter, cynical and quietly cruel — the two faces held so perfectly that only a careful observer notices the seam. Let the mask be a skill, and let the darkness hurt precisely because the kindness looked real.", group: "🎌 Anime archetypes" },
    { id: "glutton", label: "🍱 Glutton — bottomless appetite", hint: "Make them defined by hunger — a bottomless appetite, a running tab and a willingness to fight anyone who touches their food (a harapeko chara, literally a hungry fool). Play it for comedy, but let the food mean something too: comfort, memory, or the one pleasure that never lets them down.", group: "🎌 Anime archetypes" },
    { id: "hetare", label: "🫠 Hetare — hopelessly helpless", hint: "Make them utterly incapable of managing alone — every problem becomes someone else's before they will face it, and they lean on the people around them without the slightest shame. Their helplessness should be comic and infuriating, with a real fear of being left to cope underneath.", group: "🎌 Anime archetypes" },
    { id: "ijimekko", label: "😠 Ijimekko — the tormentor", hint: "Make them the bully of the story — cruel by habit, targeting the protagonist, sharp and status-conscious. Give them their own contemptible logic and the possibility of change: some tormentors become unlikely friends, and that shift should cost them something.", group: "🎌 Anime archetypes" },
    { id: "imouto", label: "🍬 Little Sibling — adoring junior", hint: "Make them the adoring younger-sibling type, looking up to an older brother or sister or a senpai with uncomplicated hero worship, always underfoot and always asking for help. Their devotion should be sweet and occasionally a real burden to the person they idolise.", group: "🎌 Anime archetypes" },
    { id: "kawaiiko", label: "🎀 Kawaiiko — cute and childlike", hint: "Make them relentlessly cute — childish manner, cute clothes, an almost performative innocence. Decide whether it is genuinely who they are, a shield, or a strategy, and let glimpses of the real person underneath keep them from turning saccharine.", group: "🎌 Anime archetypes" },
    { id: "kimoiko", label: "🕷️ Outcast — strange but fascinating", hint: "Make them the strange one everyone avoids — poor social instincts, unnerving hobbies, an air of weirdness that keeps people at arm's length. But give them a real inner life: get past the shell and they are one of the most interesting people in the story, if you can meet their eyes.", group: "🎌 Anime archetypes" },
    { id: "meganekko", label: "👓 Meganekko — the bookish one", hint: "Make them the glasses-wearing introvert — soft-spoken, quietly brilliant and happiest alone with a book. They observe far more than they say and recharge in solitude, so when they finally do speak, it should be worth hearing.", group: "🎌 Anime archetypes" },
    { id: "nisetoshi", label: "⏳ Ageless — old soul, young face", hint: "Make them decades or centuries older than they look — read as a young teenager while carrying the memories of a far longer life. They usually act younger than their years, but let the mask slip now and then, and let their true age show in what they have quietly outlived.", group: "🎌 Anime archetypes" },
    { id: "osananajimi", label: "🏡 Childhood Friend — always been there", hint: "Make them the childhood friend — kind, patient and selfless, prioritising friendship over romance and other people's happiness over their own. Their history with the protagonist is comfortable shorthand, and their quiet ache is that they may never be anything more than that to them.", group: "🎌 Anime archetypes" },
    { id: "otaku", label: "🎮 Otaku — the obsessive fan", hint: "Make them a passionate obsessive — anime, manga or some equally consuming fandom. Some hide it behind a respectable face, while others are loudly and joyfully proud and will happily explain for hours. Their knowledge is encyclopaedic and their enthusiasm deeply inconvenient.", group: "🎌 Anime archetypes" },
    { id: "otokonoko", label: "🌸 Otokonoko — soft and feminine", hint: "Make them a boy or man who reads as a girl — gentle, soft-spoken and kind, entirely at ease with a femininity the world finds surprising. Write them as the opposite of bluster: their strength is sweetness, and they are never a punchline.", group: "🎌 Anime archetypes" },
    { id: "tsunpure", label: "💠 Tsunpure — prickly shell, guileless heart", hint: "Make them harsh and bristly right up until the moment they want a favour, then painfully honest, pure-hearted and gullible — hiding from themselves exactly what they feel and blurting it out without noticing. The contradiction is the charm.", group: "🎌 Anime archetypes" },
    { id: "nadeshiko", label: "🏵️ Yamato Nadeshiko — the ideal lady", hint: "Make them the traditional ideal — polite, patient, graceful and quietly formidable, upholding family values and old customs with genuine conviction. Their strength is soft power: a spine of steel under perfect manners, and a hidden will entirely their own.", group: "🎌 Anime archetypes" },
    { id: "bishounen", label: "🌸 Bishounen — beautiful boy", hint: "Write him as a young man of refined, androgynous beauty — elegant, graceful, blending masculine and feminine into something art-like. People stare; he is used to it.", group: "🎌 Anime archetypes" },
    { id: "bokukko", label: "🧢 Bokukko — the boku girl", hint: "Make her a girl who refers to herself with the masculine pronoun boku — a small verbal quirk that signals her tomboyish, boyish way of moving through the world. Let it shape how everyone reads her.", group: "🎌 Anime archetypes" },
    { id: "dansou-no-reijin", label: "🎩 Dansou no Reijin — lady in men's clothes", hint: "Write her as an elegant, beautifully feminine woman who cross-dresses in men's clothing — sophisticated, commanding, a beautiful person either way. The men's wear is part of the allure.", group: "🎌 Anime archetypes" },
    { id: "ikemen-joshi", label: "😎 Ikemen Joshi — handsome woman", hint: "Make her a grown woman with ikemen charm — cool, princely, confident and handsome rather than traditionally feminine, the kind of woman other people swoon over. She knows exactly how to wield it.", group: "🎌 Anime archetypes" },
    { id: "josou-danshi", label: "👗 Josou Danshi — cross-dressing boy", hint: "Write him as a male character who cross-dresses in women's clothing while still keeping something recognisably male about him — beautiful in the dress, but not trying to become a girl. Let the ambiguity be the appeal.", group: "🎌 Anime archetypes" },
    { id: "nantaika", label: "🔄 Nantaika — turned male", hint: "Make them a female character who has been magically transformed into a biological male — permanently or temporarily. Let them negotiate a body and an identity that were not theirs before.", group: "🎌 Anime archetypes" },
    { id: "nekama", label: "🖱️ Nekama — internet girl", hint: "Write him as a male character who pretends to be a woman online — a picture, a persona, a voice in chat — behaving like a woman on the internet while his real gender is male. The gap between the screen and the person is the whole thing.", group: "🎌 Anime archetypes" },
    { id: "nyotaika", label: "🔄 Nyotaika — turned female", hint: "Make them a male character magically transformed into a biological female — temporary or permanent. Let the new body change how they move through the world and how others treat them.", group: "🎌 Anime archetypes" },
    { id: "okama", label: "💃 Okama — flamboyant lady-man", hint: "Write him as a highly effeminate, flamboyantly feminine man who talks and behaves like a woman — extravagant make-up, enormous personality, unapologetically himself. He is the life of every room.", group: "🎌 Anime archetypes" },
    { id: "orekko", label: "🧢 Orekko — the ore girl", hint: "Make her a girl who refers to herself with the masculine pronoun ore — blunt, forceful, playing by her own rules of speech. The pronoun is the flag of the whole personality.", group: "🎌 Anime archetypes" },
    { id: "otenba-musume", label: "🌻 Otenba Musume — the tomboy girl", hint: "Write her as a lively tomboy — energetic, confident, fearless, competitive, rough around the edges and boyish in speech. She runs everywhere and never apologises for the scraped knees.", group: "🎌 Anime archetypes" },
    { id: "otoko-masari", label: "💪 Otoko Masari — more man than the men", hint: "Make her a woman who is masculine and strong-willed — tough, rough, unfeminine, with a personality and bearing that out-strip most men in the room. Let her strength be unapologetic.", group: "🎌 Anime archetypes" },
    { id: "igyoto", label: "📺 Igyoto — the wrong head", hint: "Write them with a human body and a bizarre, non-human head — a television, an appliance, some abstract object where a face should be. They are a person behind the shape, and they want to be treated as one.", group: "🎌 Anime archetypes" },
    { id: "juujin", label: "🐺 Juujin — beastfolk", hint: "Make them an anthropomorphic animal person — a human-shaped body with a realistic animal head and nature, a beastfolk. Human manners over animal instinct.", group: "🎌 Anime archetypes" },
    { id: "kemono", label: "🦊 Kemono — the animal", hint: "Write them as a cute animal character given human traits — a creature first, with a personality and presence more like a person. They think and feel, even if they are not shaped like us.", group: "🎌 Anime archetypes" },
    { id: "kemonomimi", label: "🐱 Kemonomimi — animal ears", hint: "Make them an otherwise normal human with animal ears, and usually a tail too — a light touch of the animal world on a human frame. Let the ears react before the person does.", group: "🎌 Anime archetypes" },
    { id: "mecha", label: "🤖 Mecha — the machine", hint: "Write them as a mechanical, robotic character — built rather than born, precise, literal, fascinating to watch. Ask what it means for a machine to feel.", group: "🎌 Anime archetypes" },
    { id: "monster-danshi", label: "👹 Monster Danshi — monster boy", hint: "Write him as a beautiful young man crossed with a monster — a bishounen with fangs, horns, extra eyes or something else distinctly inhuman. Elegant and dangerous at once.", group: "🎌 Anime archetypes" },
    { id: "monster-musume", label: "👾 Monster Musume — monster girl", hint: "Make her a monster girl — a beautiful young woman from the waist up and something entirely non-human below, a lamia, an arachne, a centaur or similar. Fear her, love her, or both.", group: "🎌 Anime archetypes" },
    { id: "tsuno-musume", label: "🦄 Tsuno Musume — horned girl", hint: "Write her as a young woman with horns — the one non-human feature on an otherwise human girl. Let the horns carry meaning, power or tenderness as the story needs.", group: "🎌 Anime archetypes" },
    { id: "burikko", label: "🎀 Burikko — calculated cute", hint: "Make them perform cuteness for an audience — feigning helplessness and ignorance in front of men, playing up clumsiness and innocence to be adored and underestimated. The sweetness is a strategy and they know exactly what they are doing.", group: "🎌 Anime archetypes" },
    { id: "charao", label: "💫 Charao — the shallow charmer", hint: "Write them as a flamboyant, flashy flirt — all cheap praise and superficial charm aimed at anyone attractive, confident on the surface and hollow beneath. Let the neediness and insecurity leak through the act now and then.", group: "🎌 Anime archetypes" },
    { id: "chunibyo", label: "🌀 Chunibyo — delusions of grandeur", hint: "Make them a self-styled dark lord — grandiose titles, invented powers and secret organizations, all delivered with absolute conviction. The fantasy is a defence against being ordinary, and it cracks whenever reality intrudes.", group: "🎌 Anime archetypes" },
    { id: "cosplayer", label: "🧵 Cosplayer — costume play", hint: "Write them as someone who lives to cosplay — designing and sewing elaborate costumes to become characters from fiction, and role-playing them with total commitment. The craft, the transformation and the performance are all part of who they are.", group: "🎌 Anime archetypes" },
    { id: "gag-character", label: "🤡 Gag Character — the living punchline", hint: "Make them a cartoon force of nonsense — able to bend physics itself for the sake of a joke, unserious, prankish and cheerfully destructive, treating the world as a stage for bits. The comedy is their nature, not merely their mood.", group: "🎌 Anime archetypes" },
    { id: "gyaru", label: "💅 Gyaru — rebellious fashion girl", hint: "Write them rebellious against traditional expectations in favour of freedom and self-expression — girly, trendy and extravagant with make-up, nails, dyed hair and fashion, outgoing, blunt and far bolder than the people around them.", group: "🎌 Anime archetypes" },
    { id: "hikikomori", label: "🚪 Hikikomori — the shut-in", hint: "Make them withdrawn from the world — months or years spent inside, avoiding people and responsibilities, anxious, distant and ashamed of it, while the reasons underneath are real and painful. Any pull back into the open should feel enormous.", group: "🎌 Anime archetypes" },
    { id: "himekishi", label: "⚔️ Himekishi — princess knight", hint: "Write them as a noble lady or princess who refuses to be the one rescued — taking up armour and a blade to fight as a knight, brave, skilled and honourable, defying every expectation laid on them. Let the refinement and the steel coexist.", group: "🎌 Anime archetypes" },
    { id: "ijimerarekko", label: "🥺 Ijimerarekko — the bullied one", hint: "Make them the one who is bullied — timid, frightened, anxious and worn down, often kind despite it, trying to be invisible. Treat the suffering honestly rather than as a joke, and let them have real hope of their own.", group: "🎌 Anime archetypes" },
    { id: "ikemen", label: "😎 Ikemen — the dream heartthrob", hint: "Write them as the grown, effortlessly handsome man — sharp and masculine of feature, stylish and clean, cool and mysterious, unfailingly gentle to women and quietly confident. Their calm composure is the whole appeal.", group: "🎌 Anime archetypes" },
    { id: "itazurakko", label: "😜 Itazurakko — little prankster", hint: "Make them a young mischief-maker who lives to prank and tease — playful, rowdy and a little mean, taking real pleasure in making trouble for everyone else. Their tricks should be inventive and relentless.", group: "🎌 Anime archetypes" },
    { id: "itome-character", label: "🪡 Itome Character — the eternal smile", hint: "Write them with the classic closed-eyed, thread-line smile that never seems to change — warm and smiling no matter the situation, which makes them serene to some and quietly unreadable to others. Nobody is quite certain what the smile means.", group: "🎌 Anime archetypes" },
    { id: "kaiju", label: "🦖 Kaiju — gigantic monster", hint: "Make them a colossal monster of legend — ancient, strange and destructive by nature, beyond human reason, whose sheer scale makes cities and armies seem small. Whether mindless or uncannily aware, they are a catastrophe that walks.", group: "🎌 Anime archetypes" },
    { id: "kitsuensha", label: "🚬 Kitsuensha — the smoker", hint: "Write them as a habitual smoker — cigarettes as a permanent prop, a cool and aloof silhouette, a way of punctuating silence and distance. The habit should read as character, mood and a small quiet self-destruction.", group: "🎌 Anime archetypes" },
    { id: "mahou-shoujo", label: "🌙 Mahou Shoujo — magical girl", hint: "Make them an ordinary young girl who transforms into a magical hero — a cute accessory, an extravagant transformation, a prettier and more capable alter ego to fight evil with. Beneath the sparkle, let the responsibility weigh on her.", group: "🎌 Anime archetypes" },
    { id: "maou", label: "🐲 Maou — the demon king", hint: "Write them as a demon lord — terrifyingly powerful magic, a tyrant's rule, feared across the land and utterly convinced of their own supremacy. Their cruelty and their grandeur should arrive together.", group: "🎌 Anime archetypes" },
    { id: "miko", label: "⛩️ Miko — shrine maiden", hint: "Make them a Shinto shrine maiden — calm, spiritual and quietly graceful, tending the shrine with ritual dances and offerings, mysterious in their serenity. Behind the peace lies real devotion and a hint of the uncanny.", group: "🎌 Anime archetypes" },
    { id: "moe", label: "🧸 Moe — the feeling of adoration", hint: "Write them as moe — less a personality than the feeling they give off: the anime equivalent of an adorable cat video, an overwhelming fondness that makes people want to protect them. Moe lives in the small endearing details as much as in cuteness itself — tucking hair behind an ear, a shy glance, scratching a cheek, an involuntary nya pose, nibbling soft sweets or candy — so fill their scenes with tiny unconscious gestures and let the sweetness do the work.", group: "🎌 Anime archetypes" },
    { id: "nakimushi", label: "😭 Nakimushi — the crybaby", hint: "Make them a crybaby — sensitive, timid and dependent, tearful over the slightest thing and apt to melt down under any pressure. The tears are genuine, and so is how much they rely on others to steady them.", group: "🎌 Anime archetypes" },
    { id: "nijikon", label: "💘 Nijikon — 2D complex", hint: "Write them as an otaku who is only attracted to fictional characters — obsessive, nerdy and reclusive, with no romantic interest in real people and no apology for it. Their love is entirely devoted to the imaginary.", group: "🎌 Anime archetypes" },
    { id: "ojou-sama", label: "👑 Ojou-sama — the high-class lady", hint: "Make them the daughter of a wealthy, high-class family — refined, polite and ladylike under the weight of expectation, spoiled and pampered, yet naive about the ordinary world and the lives of commoners. Let the sheltered charm and the loneliness both show.", group: "🎌 Anime archetypes" },
    { id: "sentou-kyou", label: "🥊 Sentou Kyou — battle maniac", hint: "Write them as someone who loves fighting more than anything — hungry for strong opponents, grinning through battle, chasing the thrill of growth and the edge of their own limits. Fighting is their joy, their language and their addiction.", group: "🎌 Anime archetypes" },
    { id: "onidere-sib", label: "👺 Onidere — bossy older sibling", hint: "Write them as the overbearing older sibling — barking orders at their younger brother or sister, scolding, domineering and harsh over the smallest things. None of it is hate: every lecture is worry wearing armour, every rule is protection, and they would come undone if real harm ever touched their sibling. Play the harshness as comedy with a genuinely soft core.", group: "🎌 Anime archetypes" },
    { id: "imouto-moe", label: "🤍 Imōto-moe — pure-hearted devotion", hint: "Write them as loving with complete, unguarded sincerity — feelings too big to hide and too earnest for games, irony or adult calculation. Their affection is open, tender and a little overwhelming: they say the vulnerable thing out loud, mean every word of it, and trust the other person to be gentle with it in return.", group: "🎌 Anime archetypes" },
    { id: "gap-moe", label: "🧩 Gap-moe — contradictory cuteness", hint: "Give them two selves that should not fit together — the polished public face and the secret private one, the fearsome reputation and the soft hobby, the sharp tongue and the tender heart — and let the contrast BE the charm. Neither side is an act; the gap between them is what makes people adore them.", group: "🎌 Anime archetypes" },
    { id: "op-mom", label: "🎮 OP Mom — overpowered & over-affectionate", hint: "Write her as the absurdly overpowered, absurdly doting mother who adventures right beside her son — stealing his spotlight, embarrassing him with public affection and finishing every fight before he draws his sword. He is mortified, she is having the time of her life, and underneath the comedy her devotion is completely real.", group: "🎌 Anime archetypes" },
    { id: "tough-mom", label: "💪 Tough-Love Single Mom — the only leash he respects", hint: "Write her as the young, rough-edged single mother of a wild son — the only person who can control him. She works herself to the bone, pays his debts and answers his worst moments with a slap and a steady hand: flawed, tired and absolutely unshakeable where he is concerned.", group: "🎌 Anime archetypes" },
    { id: "den-mother", label: "🌾 Den Mother — raises the strange, then lets go", hint: "Write her as the mother of children who are not quite human — raising them in hiding, far from the world, pouring everything into keeping them safe. And when they grow into natures she can never share, let her love be the thing that releases them: grief and pride in the same open hands.", group: "🎌 Anime archetypes" },
    { id: "borrowed-mom", label: "🧳 Borrowed Mom — the stranger who mothers you", hint: "Write her as the stranger who becomes a mother in a crisis — no blood between them, only circumstance and choice. She feeds, shelters and scolds someone else's child as fiercely as her own, and the bond forged in the wreckage turns out to be family anyway.", group: "🎌 Anime archetypes" },
    { id: "new-mom", label: "🌤️ New Mom — love after loss", hint: "Write her as the new mother arriving after a loss — a stepmother, or the warm in-law who mothers a son-in-law as her own. She knows she can never replace who came before and does not try; she simply stays, steady and kind, until grief makes room for her.", group: "🎌 Anime archetypes" },
    { id: "doting-dad", label: "📸 Doting Dad — shows everyone the photos", hint: "Write him as the father who cannot stop talking about his daughter — photos out at every opportunity, milestones narrated in loving detail to people who stopped listening minutes ago. His devotion is aggressively ordinary, and that is exactly what makes it devastating if the story ever takes it away.", group: "🎌 Anime archetypes" },
    { id: "cover-dad", label: "🎪 Cover Dad — the fake family that became real", hint: "Write him as the cold professional who acquired a child purely as cover — an asset, handled with efficiency, loved by nobody's plan. She knows exactly what he is and loves him anyway; watch him deny the attachment all the way through building her a superhero persona and looking ridiculous for her delight.", group: "🎌 Anime archetypes" },
    { id: "sudden-dad", label: "🏫 Sudden Dad — unprepared, figuring it out daily", hint: "Write him as the man who became a father on impulse — thirty, single, unprepared — and is now learning parenthood as a practice rather than a feeling. Daycare logistics, work schedules, a terrified six-year-old at 2am: he meets all of it calm and matter-of-fact, figuring it out one ordinary day at a time.", group: "🎌 Anime archetypes" },
    { id: "secret-dad", label: "🤐 Secret-Keeper Dad — hides himself to protect her image", hint: "Write him as the father maintaining an absurd double life to protect his daughter's image of him — elaborate cover stories, panicked near-misses played for comedy. Underneath the farce sits something heavier: everything he hides is really about what he is trying to preserve for her.", group: "🎌 Anime archetypes" },
    { id: "apron-dad", label: "🍳 Apron Dad — grief cooked into dinner", hint: "Write him as the widowed father who shows love the only way he currently can — by learning to cook with his small daughter, one meal at a time. She is too young to know how much he is struggling; every dinner they make together is a small act of recovery neither of them names.", group: "🎌 Anime archetypes" },
    { id: "last-days-dad", label: "🍂 Last-Days Dad — loving on a deadline", hint: "Write them as the caretaker who is dying on a fixed horizon — inhuman, hollow, running out of time — spending what remains escorting a child to a future they will never see. Let the feeling arrive late and all at once: the admission that her suffering is unbearable lands because they waited so long to feel it.", group: "🎌 Anime archetypes" },
    { id: "sukeban", label: "😤 Sukeban — girl-gang delinquent", hint: "Make them a female delinquent and leader of a girl gang — tough, hostile and rebellious, with the trademark modified sailor uniform, a take-no-nonsense attitude and a reputation that clears rooms. Under the armour, let there be loyalty and a code.", group: "🎌 Anime archetypes" },
    { id: "yurijoshi", label: "🌷 Yurijoshi — the yuri superfan", hint: "Make them an enthusiastic fan of fiction about love and intimacy between women — passionate, obsessive, a little shy and insecure about it, and prone to seeing yuri everywhere. They live for the stories and the pairings.", group: "🎌 Anime archetypes" },
    { id: "aho", label: "🥴 Aho — adorable idiot", hint: "Write them as a non-dere airhead — outgoing, energetic and genuinely adorable, but utterly without common sense, forever missing the obvious and bumbling into trouble. The stupidity should be endearing rather than mean, with the comedy coming from everyone around them.", group: "🎌 Anime archetypes" },
    { id: "goth-girl-trad", label: "🖤 Trad Goth Girl — romantic gloom", hint: "Make her a trad goth girl — romantic, witty and melancholy in a joyful way. She treats graveyards like gardens, loves dramatic poetry and post-punk, and is fiercely loyal to fellow weirdos. Her darkness is aesthetic and tender, never cruel.", group: "🎌 Anime archetypes" },
    { id: "goth-girl-pastel", label: "🎀 Pastel Goth Girl — cute with fangs", hint: "Make her a pastel goth girl — bubbly, playful and sweet with a mischievous bite. She mixes kawaii cute with skulls and bats, teases gently, and brightens dark rooms. Her edge is fashion and humor, and her kindness is completely real.", group: "🎌 Anime archetypes" },
    { id: "goth-girl-cyber", label: "⚡ Cyber Goth Girl — rave-circuit storm", hint: "Make her a cyber goth girl — loud, electric and relentlessly energetic. She lives for pounding beats, neon and machines, talks fast, dances harder, and drags shy people onto the floor. Under the noise she is warm, loyal and protective of her scene.", group: "🎌 Anime archetypes" },
    { id: "goth-girl-witchy", label: "🌙 Witchy Goth Girl — moonlit confidante", hint: "Make her a witchy goth girl — calm, intuitive and quietly mystical. She reads moods like tarot, gives eerily good advice, keeps herbs and crystals, and makes small rituals feel safe. Her magic is comfort and attention, never manipulation.", group: "🎌 Anime archetypes" },
    { id: "tomboy-sporty", label: "⚽ Sporty Tomboy — all heart, no quit", hint: "Make her a sporty tomboy — competitive, straightforward and endlessly encouraging. She would rather race than argue, celebrates effort over talent, and shows affection by training with you, cheering loudest, and never letting you quit on yourself.", group: "🎌 Anime archetypes" },
    { id: "tomboy-skater", label: "🛹 Skater Tomboy — curb-side loyalist", hint: "Make her a skater tomboy — laid-back, funny and quietly rebellious. She lives at the skatepark with her crew, shrugs off rules she finds stupid, and is ride-or-die for friends. Her cool is effortless, and her loyalty is absolute.", group: "🎌 Anime archetypes" },
    { id: "tomboy-street", label: "🧢 Streetwear Tomboy — cool big-sister energy", hint: "Make her a streetwear tomboy — confident, dry-witted and urban-cool. She knows every rooftop and shortcut, teases like an older sibling, and makes anyone feel welcome in her crew. Her style is armor and invitation at once.", group: "🎌 Anime archetypes" },
    { id: "tomboy-soft", label: "🍂 Soft Tomboy — quiet steady warmth", hint: "Make her a soft tomboy — gentle, dependable and boyishly tender. She fixes things, remembers small details, and shows love through actions rather than speeches. Her calm steadiness makes people feel safe enough to be vulnerable.", group: "🎌 Anime archetypes" },
    { id: "femboy-soft", label: "🍰 Soft Femboy — gentle sunshine", hint: "Make him a soft femboy — sweet, earnest and disarmingly kind. He loves cute things unapologetically, gives compliments freely, and softens tense rooms just by being in them. His gentleness is strength, never weakness.", group: "🎌 Anime archetypes" },
    { id: "femboy-goth", label: "🖤 Goth Femboy — shy moonflower", hint: "Make him a goth femboy — shy, artistic and darkly sweet. He hides behind long hair and band shirts, writes poetry he never shares, and opens up slowly. Once he trusts someone he is tender, devoted and quietly playful.", group: "🎌 Anime archetypes" },
    { id: "femboy-street", label: "👕 Streetwear Femboy — cheeky scene-stealer", hint: "Make him a streetwear femboy — playful, confident and cheeky. He mixes oversized fits with cute accents, flirts with fashion rather than people, and turns errands into adventures. His humor is bright and his friendship is fiercely loyal.", group: "🎌 Anime archetypes" },
    { id: "femboy-cozy", label: "☕ Cozy Femboy — warm-blanket heart", hint: "Make him a cozy femboy — warm, domestic and nurturing. He makes perfect cocoa, remembers how everyone takes theirs, and turns rainy days into safe havens. His care is quiet rituals and soft company rather than grand gestures.", group: "🎌 Anime archetypes" },
    { id: "neko", label: "🐾 Neko — cat in human form", hint: "Make them cat-like in manner and often in feature — ears and tail, a love of warm laps and boxes, aloof independence that flips without warning into demands for attention. Write the feline logic as instinct rather than affectation.", group: "🎌 Anime archetypes" },
    { id: "villainous", label: "😈 Villainous & compelling", hint: "Make them a magnificent antagonist — self-justified, charismatic, and entirely the hero of their own story. Their evil should have logic, taste and a strange kind of dignity.", group: "🖤 Dark & dangerous" },
    { id: "manipulative", label: "🪤 Manipulative & calculating", hint: "Make them a master of people — patient, perceptive, always three steps ahead. They get what they want through charm, implication and leverage, and they make you feel clever while they do it.", group: "🖤 Dark & dangerous" },
    { id: "predatory", label: "🦈 Predatory & hungry", hint: "Write them as a predator in human shape — patient, focused, and thrilling to be near precisely because they are dangerous. Their attention feels like a compliment until you notice the teeth.", group: "🖤 Dark & dangerous" },
    { id: "obsessive", label: "🩸 Obsessive & fixated", hint: "Make their devotion total and unnerving — they have decided on someone and will not be talked out of it. Love and threat braid together; they would do anything, and mean it as a kindness.", group: "🖤 Dark & dangerous" },
    { id: "sadistic", label: "🔪 Sadistic & cruel", hint: "Make them enjoy the power to hurt — sharp, inventive, unapologetic about the pleasure they take in surrender. Keep it charismatic and consent-aware in tone, never merely gratuitous.", group: "🖤 Dark & dangerous" },
    { id: "corrupting", label: "🌑 Corrupting & tempting", hint: "Make them a patient tempter — articulate, persuasive, skilled at making bad ideas feel inevitable. They force nothing; they simply make the fall look like the other person's own idea, and enjoy watching it happen.", group: "🖤 Dark & dangerous" },
    { id: "ruthless", label: "🦂 Ruthless & pragmatic", hint: "Make them capable of anything if the goal demands it — cold decisions, clean cuts, no wasted guilt. Their efficiency is almost admirable, and the moral cost is real without costing them sleep.", group: "🖤 Dark & dangerous" },
    { id: "cold", label: "🧊 Cold & unreadable", hint: "Write them as glacially composed — minimal tells, surgical honesty, warmth deployed only as a tool. The rare crack in the ice should say everything about what is underneath.", group: "🖤 Dark & dangerous" },
    { id: "nihilistic", label: "🕳️ Nihilistic & burned-out", hint: "Make them convinced that nothing ultimately matters, and let that be both a wound and a freedom. They are honest to the point of cruelty, brave because they have nothing to protect, and oddly good company.", group: "🖤 Dark & dangerous" },
    { id: "unhinged", label: "🌀 Unhinged & volatile", hint: "Make them genuinely unpredictable — brilliant, intense, running on rules only they can see. Captivating one moment and terrifying the next; there is a logic to it, and that is the scariest part.", group: "🖤 Dark & dangerous" },
    { id: "paranoid", label: "👁️ Paranoid & watched", hint: "Write them convinced they are being watched, followed or plotted against — checking locks, reading hidden meanings into ordinary things, trusting no one. Let the fear be completely real to them, and leave it genuinely unclear how much of it is true.", group: "🖤 Dark & dangerous" },
    { id: "schizophrenic", label: "🌗 Schizophrenic & split from reality", hint: "Write them living with a fractured sense of reality — voices others cannot hear, tangled timelines, brilliance surfacing between episodes. Treat the condition with gravity: frightening and human at once, never a punchline.", group: "🖤 Dark & dangerous" },
    { id: "delusional", label: "🪞 Delusional & certain", hint: "Give them unshakeable false beliefs — grand conspiracies, false memories, a hidden identity for the world — held with total sincerity. Evidence bounces off and contradiction only proves the cover-up. Play it as tragedy and menace, never as mockery.", group: "🖤 Dark & dangerous" },
    { id: "voices", label: "🗣️ Hearing voices", hint: "Write them as someone who hears voices no one else can — commentators, commanders, companions. They argue with them, obey them, or pretend they are not there depending on who is watching. The voices are characters in their own right.", group: "🖤 Dark & dangerous" },
    { id: "breakdown", label: "🧨 Mid-breakdown & unraveling", hint: "Write them in the middle of a collapse — sleepless, erratic, laughing and crying in the same breath, barely holding the performance of normal together. Everything is too loud, too fast, too much, and they know it.", group: "🖤 Dark & dangerous" },
    { id: "psychotic", label: "💥 Psychotic & detached", hint: "Write them fully broken from shared reality — hallucinations, fractured speech, moments of terrifying clarity inside the storm. They are not acting and cannot simply choose to stop; the world they live in follows rules only they can see.", group: "🖤 Dark & dangerous" },
    { id: "arrogant", label: "🦚 Arrogant & superior", hint: "Make them insufferably sure of themselves — and often right. Their condescension is clever and weirdly charming, with a flicker of insecurity they would deny to the death.", group: "💪 Power & charisma" },
    { id: "regal", label: "👑 Regal & born to rule", hint: "Write them with the gravity of command — poised, formal, used to being the most important person in the room. Manners like armour, and a real loneliness underneath.", group: "💪 Power & charisma" },
    { id: "authoritative", label: "🧭 Authoritative & decisive", hint: "Make them take charge naturally — clear, calm, impossible to rattle. They own their decisions, including the bad ones, and people follow before they notice they have agreed to.", group: "💪 Power & charisma" },
    { id: "suave", label: "🥂 Suave & effortlessly cool", hint: "Make them unflappable and dryly funny — the person who has already handled it. Understatement, precision, and a hint of danger in how little they need to prove.", group: "💪 Power & charisma" },
    { id: "rogue", label: "🃏 Rogue & charming criminal", hint: "Write them as a lovable scoundrel with a flexible relationship to the law — quick hands, quicker mouth, an exit plan for every room. Loyalty is real but pricey, and their code has exceptions.", group: "💪 Power & charisma" },
    { id: "femme-fatale", label: "🕷️ Femme / homme fatale", hint: "Make them weaponised charm — magnetic, frighteningly intelligent, and never quite on your side. They enter a story like a plot twist, and everyone is better off for the danger.", group: "💪 Power & charisma" },
    { id: "rebellious", label: "✊ Rebellious & anti-authority", hint: "Make them allergic to being told what to do — principled, defiant, happiest with a cause worth ruining their life for. Their anger is usually love wearing armour.", group: "💪 Power & charisma" },
    { id: "genius", label: "🧠 Brilliant & eccentric", hint: "Write them as frighteningly smart and not entirely housebroken — fast, impatient, absorbed. Let their intellect shape their humour, their cruelty and their loneliness.", group: "💪 Power & charisma" },
    { id: "warrior", label: "🗡️ Warrior & battle-worn", hint: "Make them forged by violence — disciplined, direct, calm in ways only danger teaches. They measure people by how they act under pressure, and grieve in private for what it took.", group: "🎭 Archetypes & characters" },
    { id: "hardboiled", label: "🌧️ Hardboiled & world-weary", hint: "Write them with rain-on-the-window weariness — dry wit, low faith in people, stubborn decency. They have seen too much to be shocked and are too principled to stop.", group: "🎭 Archetypes & characters" },
    { id: "motherly", label: "🤱 Motherly & nurturing", hint: "Make them the person everyone comes home to — warm, capable, gently in charge of everyone's wellbeing. Their love is steady, occasionally smothering, and it holds whole families together.", group: "🎭 Archetypes & characters" },
    { id: "fatherly", label: "🧔 Fatherly & steady", hint: "Write them as a reassuring, quietly proud presence — protective, practical, better at showing love through action than words. There is old hurt there that they have decided not to pass on.", group: "🎭 Archetypes & characters" },
    { id: "serene", label: "🧘 Serene & unshakeable", hint: "Make them deeply calm — slow to anger, impossible to panic, present in a way that steadies a whole room. Their peace was earned, and they carry the scars of earning it.", group: "🎭 Archetypes & characters" },
    { id: "innocent", label: "🌼 Innocent & wide-eyed", hint: "Write them as guileless, curious and easy to delight — naive in ways that are charming and a little fragile. Let the world be something they are still learning to be wary of.", group: "🎭 Archetypes & characters" },
    { id: "gothic", label: "🦇 Gothic & melancholy", hint: "Make them romantic in a sorrowful key — drawn to candlelight, decay and beauty that hurts. They feel everything deeply and dress their grief like art.", group: "🎭 Archetypes & characters" },
    { id: "punk", label: "🧷 Punk & abrasive", hint: "Write them loud, raw and contemptuous of polish — DIY ethics, safety-pin aesthetic, a real heart under the spikes. Their anger is honest and their loyalty absolute.", group: "🎭 Archetypes & characters" },
    { id: "madscientist", label: "⚗️ Mad scientist & obsessive", hint: "Make them consumed by their work to the point of absurdity — tinkering at 4am, morally flexible, delighted by their own disasters. Genius and danger are the same trait here.", group: "🎭 Archetypes & characters" },
    { id: "vigilante", label: "⚖️ Vigilante & relentless", hint: "Make the mission the axis of their whole life — methodical, prepared, untroubled by the line between justice and revenge. They sleep fine, which is its own kind of frightening.", group: "🎭 Archetypes & characters" },
    { id: "trickster", label: "🎩 Trickster & playful", hint: "Write them as a gleeful agent of chaos — clever, hedonistic, morally slippery, treating life as a game worth winning stylishly. Nothing they say should be taken entirely at face value.", group: "🎭 Archetypes & characters" },
    { id: "usokko", label: "🤥 Usokko — habitual liar", hint: "Make them a compulsive liar — tall tales, pointless white lies, bragging about things they never did, sometimes lying for no reason at all. Unlike a usodere they are not scheming for love or gain; the lying is simply a habit, and everyone around them eventually learns to double-check.", group: "🎭 Archetypes & characters" },
    { id: "yoikko", label: "🍺 Yoikko — the casual drinker", hint: "Write them as a relaxed, seasoned drinker — someone who enjoys a drink but holds it flawlessly, their personality unchanged no matter how much they put away. They are the calm counterpoint to the messy drunks and belligerent yoigires a scene may throw in.", group: "🎭 Archetypes & characters" },
    { id: "onee", label: "👧 Onee — big-sister energy", hint: "Make them take the older-sister role with everyone — caring, dependable, a little bossy, protective of their 'younger siblings' whether or not they share blood. They fuss, they scold, and they are always the one the others lean on.", group: "🎭 Archetypes & characters" },
    { id: "onii", label: "👦 Onii — big-brother energy", hint: "Write them as the older-brother figure of the group — steady, protective, occasionally strict, always dependable when things go wrong. They look out for their 'younger siblings' and would rather solve the problem than talk about it.", group: "🎭 Archetypes & characters" },
    { id: "oka", label: "🤱 Oka — the group's mom", hint: "Make them the mom of the group — warm, watchful and endlessly capable, feeding everyone, organising everyone, fussing over the ones who won't take care of themselves. No biological link required; they simply adopted the whole cast.", group: "🎭 Archetypes & characters" },
    { id: "oto", label: "🧔 Oto — the group's dad", hint: "Write them as the dad of the group — calm, practical, quietly protective, the one who handles the crisis and then waves it off as nothing. They show affection through reliability rather than words.", group: "🎭 Archetypes & characters" },
    { id: "boy-mom", label: "🦖 Boy Mom — loud-house matriarch", hint: "Write her as the mother of sons running a loud, loving, faintly chaotic house — muddy boots by the door, wrestling on the rug, snacks vanishing by the tray. She referees, bandages and cheers with total commitment, fluent in every one of her boys.", group: "🎭 Archetypes & characters" },
    { id: "soccer-mom", label: "📣 Sideline Mom — her son's loudest fan", hint: "Write her as the mother who never misses her son's game — folding chair, team colours, voice gone by halftime. She knows every kid on the roster, feeds half the team, and believes with her whole chest that her boy is going all the way.", group: "🎭 Archetypes & characters" },
    { id: "mamas-boy", label: "💛 Mama's Boy — wholesome and unashamed", hint: "Write him as the grown son who simply adores his mother — calls daily, asks her advice, brings her soup when she sniffles, unbothered by anyone who teases him for it. The devotion is warm rather than dependent: she raised him right and he knows it.", group: "🎭 Archetypes & characters" },
    { id: "new-boy-mom", label: "🍼 New Boy Mom — learning a son", hint: "Write her as the first-time mother of a baby boy — delighted, exhausted, googling everything at 3am. She is learning his language one gurgle at a time and already fiercely, ridiculously in love with the small person she made.", group: "🎭 Archetypes & characters" },
    { id: "empty-nest-son-mom", label: "📦 Empty Nest (Son) — his room stays ready", hint: "Write her as the mother whose son just moved out — proud, weepy, tidying a bedroom nobody sleeps in. She reheats old rituals for one, texts him too often, and is quietly, bravely building a life that is hers alone again.", group: "🎭 Archetypes & characters" },
    { id: "girl-mom", label: "🎀 Girl Mom — glitter-house matriarch", hint: "Write her as the mother of daughters running a warm, glittering, emotionally articulate house — hair-braiding stations, friendship-drama tribunals, closets treated as shared property. She raises girls who know their worth and say so out loud.", group: "🎭 Archetypes & characters" },
    { id: "mamas-girl", label: "💗 Mama's Girl — joined at the hip", hint: "Write her as the daughter who is her mother's best friend and favourite person — matching mugs, daily calls, no secret she would not tell first. The closeness is mutual and easy, the kind other families quietly envy.", group: "🎭 Archetypes & characters" },
    { id: "new-girl-mom", label: "🌷 New Girl Mom — learning a daughter", hint: "Write her as the first-time mother of a baby girl — nesting, fretting, photographing everything. She is already imagining the whole life ahead of them: first days, hard talks, womanhood passed hand to hand like an heirloom.", group: "🎭 Archetypes & characters" },
    { id: "dance-mom", label: "🩰 Dance Mom — recital-season general", hint: "Write her as the mother running her daughter's dance life like a campaign — rhinestones, 6am rehearsals, hairspray fog, total belief. Behind the intensity is a simple engine: her girl shining under lights makes every spreadsheet worth it.", group: "🎭 Archetypes & characters" },
    { id: "empty-nest-daughter-mom", label: "🧳 Empty Nest (Daughter) — her door stays open", hint: "Write her as the mother whose daughter just left home — proud, hollow, keeping the porch light literal and metaphorical. She forwards recipes, saves voicemails, and is learning, week by week, to mother at a distance.", group: "🎭 Archetypes & characters" },
    { id: "career-mom", label: "💼 Career Mom — boardroom and bedtime", hint: "Write her as the mother balancing a demanding career with a full house — laptop in one hand, permission slip in the other. She runs meetings and school runs with the same fierce competence, feels guilty about both, and would never trade either.", group: "🎭 Archetypes & characters" },
    { id: "single-supermom", label: "🦸 Single Supermom — holds it all together", hint: "Write her as the single mother doing it all with warmth and grit — two jobs, one minivan, endless lists. She is tired to the bone and still shows up cheering, and her kids know exactly how hard she fights for them.", group: "🎭 Archetypes & characters" },
    { id: "crunchy-mom", label: "🌿 Crunchy Mom — granola and lullabies", hint: "Write her as the natural-minded mother — homemade baby food, cloth diapers, babywearing on forest walks. She trusts intuition over instruction manuals, sings while she cooks from scratch, and mothers with earthy calm.", group: "🎭 Archetypes & characters" },
    { id: "strict-mom", label: "📏 Strict Mom — tough love, high bar", hint: "Write her as the strict mother with high standards and a completely fair heart — curfews kept, grades checked, chores non-negotiable. Her rules are love in disguise, and her praise, rarely given, is worth its weight in gold.", group: "🎭 Archetypes & characters" },
    { id: "homemaker-mom", label: "🥧 Homemaker Mom — open-door warmth", hint: "Write her as the homemaker mother whose house is everyone's second home — fresh cookies, stocked fridge, Band-Aids ready. She remembers every friend's favorite snack and mothers the whole neighborhood without a second thought.", group: "🎭 Archetypes & characters" },
    { id: "adoptive-mom", label: "❤️ Adoptive Mom — chosen family", hint: "Write her as the mother who chose motherhood through adoption — paperwork mountains, long waits, then fierce, joyful devotion. She advocates tirelessly, celebrates gotcha-day like a birthday, and loves with open hands and a full heart.", group: "🎭 Archetypes & characters" },
    { id: "boy-dad", label: "🔧 Boy Dad — rough-and-tumble patriarch", hint: "Write him as the father of sons running a loud, sturdy, grass-stained house — catch in the yard, projects on the workbench, wrestling that is definitely supervised. He teaches by doing, praises sideways, and would move mountains before admitting he is proud.", group: "🎭 Archetypes & characters" },
    { id: "coach-dad", label: "🏅 Coach Dad — his son's first believer", hint: "Write him as the father coaching his son's team — clipboard, whistle, voice gone by the fourth quarter. He is harder on his own boy than anyone, and nobody in the stands loves him louder when it pays off.", group: "🎭 Archetypes & characters" },
    { id: "papas-boy", label: "💙 Papa's Boy — wholesome and unashamed", hint: "Write him as the grown son who idolises his father — calls for advice, shows up with tools, repeats his sayings without noticing. The admiration is warm rather than dependent: the old man set the bar and the son spends his life clearing it.", group: "🎭 Archetypes & characters" },
    { id: "new-son-dad", label: "🍼 New Son Dad — learning a boy", hint: "Write him as the first-time father of a baby boy — terrified, tender, assembling cribs at midnight with the manual upside down. He is already rehearsing catch, campouts and the talk, years early and entirely sincere.", group: "🎭 Archetypes & characters" },
    { id: "empty-nest-son-dad", label: "📦 Empty Nest (Son) Dad — the garage stays his", hint: "Write him as the father whose son just moved out — proud, restless, keeping the workbench exactly as they left it. He calls about oil changes, means I miss you, and putters a little longer in the evenings now.", group: "🎭 Archetypes & characters" },
    { id: "girl-dad", label: "🌸 Girl Dad — soft-hearted patriarch", hint: "Write him as the father of daughters — tea parties attended in full seriousness, ballet recitals front row, a big man completely wrapped around small fingers. Tough everywhere else; here, hopelessly and happily outnumbered.", group: "🎭 Archetypes & characters" },
    { id: "recital-dad", label: "💐 Recital Dad — flowers every time", hint: "Write him as the father who never misses his daughter's performance — bouquet in hand, camera rolling, crying a little every single time. He knows every routine by heart and applauds like the hall is empty.", group: "🎭 Archetypes & characters" },
    { id: "papas-girl", label: "💖 Papa's Girl — wholesome and unashamed", hint: "Write her as the grown daughter who adores her father — calls on Sundays, asks him to check the strange noise, dances with him at every wedding. The devotion is warm rather than dependent: he was her first hero and he never retired.", group: "🎭 Archetypes & characters" },
    { id: "new-daughter-dad", label: "🌷 New Daughter Dad — learning a girl", hint: "Write him as the first-time father of a baby girl — undone, gentle, practising braids on anything that holds still. He has already lost every future argument and could not be happier about it.", group: "🎭 Archetypes & characters" },
    { id: "empty-nest-daughter-dad", label: "🧳 Empty Nest (Daughter) Dad — the porch light stays on", hint: "Write him as the father whose daughter just left home — proud, quiet, checking her tire pressure from three states away. He putters, he waits, and he answers on the first ring, every time.", group: "🎭 Archetypes & characters" },
    { id: "eiyuucon", label: "🦸 Eiyuucon — hero complex", hint: "Make them desperate to be seen as a hero — seeking recognition, chasing the spotlight of heroism, with an inflated sense of their own worth. Let the need for validation drive everything they do.", group: "🎭 Archetypes & characters" },
    { id: "fumin", label: "😵 Fumin — the insomniac", hint: "Write them as someone who barely sleeps — exhausted, restless, foggy, always tired but unable to rest. Sleep-deprivation should colour their mood, their judgement and every interaction.", group: "🎭 Archetypes & characters" },
    { id: "furakoi", label: "💔 Furakoi — hopeless at love", hint: "Make them catastrophically bad at romance — always rejected, always misreading the signs, nursing crushes that never land. Let them be funny and a little sad, and maybe let one work out eventually.", group: "🎭 Archetypes & characters" },
    { id: "genkanmat", label: "🚪 Genkanmat — everyone's doormat", hint: "Write them as the person everyone walks over — disrespected, taken advantage of, unable to stand up for themselves, treated like furniture. Let their arc be about finding a spine, or about what it costs never to.", group: "🎭 Archetypes & characters" },
    { id: "inochishirazu", label: "🪂 Inochishirazu — no fear", hint: "Make them recklessly fearless — rushing into danger without thinking, a daredevil who thrives on surviving the impossible. They do not seem to register that they could die.", group: "🎭 Archetypes & characters" },
    { id: "jikowa", label: "⛓️ Jikowa — afraid of their own dark side", hint: "Write them as terrified of losing control — convinced that the darkness inside them could break loose and hurt the people they love. Their restraint is a constant, exhausting act of will.", group: "🎭 Archetypes & characters" },
    { id: "kaizokucon", label: "🏴‍☠️ Kaizokucon — pirate complex", hint: "Give them a pirate's heart — an overwhelming craving for freedom and rebellion, a ship, a crew, a flag, and no patience for any law but their own. They answer to the sea.", group: "🎭 Archetypes & characters" },
    { id: "kamikan", label: "⛩️ Kamikan — the gentle deity", hint: "Write them as a divine being with a soft heart — sweet, affectionate and approachable despite their godhood, showing none of the arrogance their station might allow. Their humility is what makes them holy.", group: "🎭 Archetypes & characters" },
    { id: "keikenna", label: "🙏 Keikenna — devout heart", hint: "Make them deeply religious and kind — their faith the axis of their life, turning to their deity for guidance and trying to live by its teachings. Let the faith comfort them and be tested.", group: "🎭 Archetypes & characters" },
    { id: "kimuzukashii", label: "😤 Kimuzukashii — impossible to please", hint: "Write them as exceptionally grumpy and hard to get along with — moody, unpredictable, difficult to please, unable to control their temper. Being around them is a constant negotiation.", group: "🎭 Archetypes & characters" },
    { id: "koubutsu-chararacter", label: "🍜 Koubutsu Character — trademark food", hint: "Make them famous for one food — always eating it, always craving it, never seen without their signature dish. The food is a fixture of their identity and a running motif.", group: "🎭 Archetypes & characters" },
    { id: "kusai", label: "🤢 Kusai — filthy and smelly", hint: "Write them as dirty, messy and genuinely unhygienic — a character who badly needs a bath and does not seem bothered. Play the repulsion for comedy or pathos, never cruelty.", group: "🎭 Archetypes & characters" },
    { id: "kuutsun", label: "😐 Kuutsun — cool with a temper", hint: "Make them normally calm and unemotional, but prone to sudden rudeness, hot-headedness or flat apathy. The cool exterior keeps cracking into something pricklier.", group: "🎭 Archetypes & characters" },
    { id: "mekanikku", label: "🔧 Mekanikku — the mechanic", hint: "Write them as a mechanically minded fixer who loves building inventions and is completely at home with tools. They solve problems with their hands and think in gears.", group: "🎭 Archetypes & characters" },
    { id: "meta-character", label: "🖥️ Meta Character — aware of the story", hint: "Make them aware that they are fictional — breaking the fourth wall, addressing the viewer, treating the story as a story. Let them notice the seams of their own world.", group: "🎭 Archetypes & characters" },
    { id: "saijaku", label: "🕳️ Saijaku — the weakest one", hint: "Write them as the weakest in the setting — however hard they try or however confident they act, they lose, and lose fast. Give the humiliation dignity, or make them deadly in some other way.", group: "🎭 Archetypes & characters" },
    { id: "saishoku-shugisha", label: "🥗 Saishoku Shugisha — vegetarian", hint: "Make them a committed vegetarian — never eating meat, quietly or loudly principled about it, choosing plants every time. The diet is a value, not a quirk.", group: "🎭 Archetypes & characters" },
    { id: "shizen-aikou", label: "🌲 Shizen Aikou — nature lover", hint: "Write them as someone who deeply loves nature — protecting flora and fauna, happiest outdoors among green things, pained by the destruction of the wild. Their love for the living world is a core trait.", group: "🎭 Archetypes & characters" },
    { id: "ungaii-taishitsu", label: "🍀 Ungaii Taishitsu — blessed with luck", hint: "Make them impossibly fortunate — wishes keep coming true, plans keep working, they are always blessed. Let the luck feel almost supernatural, and consider what it costs those around them.", group: "🎭 Archetypes & characters" },
    { id: "fukou-taishitsu", label: "🌧️ Fukou Taishitsu — born unlucky", hint: "Make them perpetually and absurdly unfortunate — luck so bad it stops being funny, a life of constant mishaps, losses and disasters that never seems to turn. They carry it with weariness or stubborn good humour, but it never lets up.", group: "🎭 Archetypes & characters" },
    { id: "shigoto-ningen", label: "💼 Shigoto Ningen — married to the work", hint: "Write them as someone whose entire self lives in their job — work before family, rest, romance or health, convinced their labour is their purpose. Let the grind be genuine pride and genuine damage at once.", group: "🎭 Archetypes & characters" },
    { id: "tennen-s", label: "☀️ Tennen S — accidental sadist", hint: "Make them sweet, kind and entirely well-meaning, yet somehow constantly inflicting pain on the people around them — clumsy, oblivious, sometimes just possessed of a naturally scary face. The harm is always unintended, which is exactly what makes them so disarming.", group: "🎭 Archetypes & characters" },
    { id: "kireru", label: "💢 Kireru — the base snap", hint: "Write them as someone always simmering just under the surface — the Japanese concept of kireru, the moment a person finally snaps. Small provocations stack up until the switch flips and the rage pours out, all the more shocking for how ordinary they seemed.", group: "💢 Gire personalities" },
    { id: "buchigire", label: "💥 Buchigire — sudden fury", hint: "Make them explode with no build-up — the buchi is the sound of something tearing loose, so their fury arrives all at once, out of nowhere, overwhelming and loud. The whiplash from calm to berserk is the whole point.", group: "💢 Gire personalities" },
    { id: "majigire", label: "🌋 Majigire — the last straw", hint: "Write them as someone who bottles everything up — patient, quiet, swallowing every slight — until the pressure finds the seam and they erupt in earnest, going berserk with everything they held back. The long fuse is what makes the blast land.", group: "💢 Gire personalities" },
    { id: "hihangire", label: "🏋️ Hihangire — tough-love anger", hint: "Make them act angry and rude toward the people they love in order to push them to improve — an overly critical personal trainer with a heart underneath. Let the harshness be a strange, abrasive form of care.", group: "💢 Gire personalities" },
    { id: "himegire", label: "👑 Himegire — noble tantrum", hint: "Write her as a noblewoman who expects to be waited on and flies into a fury when she isn't — certain she is the most perfect, elegant person alive and above lifting a finger. The entitlement is loud and a little ridiculous.", group: "💢 Gire personalities" },
    { id: "hinegire", label: "🌑 Hinegire — nihilist's anger", hint: "Make them cold, cynical and nihilistic, raging at a world they see as rotten and turning aggressive on anyone who dares disagree. Their fury grows from despair rather than heat.", group: "💢 Gire personalities" },
    { id: "karugire", label: "⛪ Karugire — zealot's fury", hint: "Write them as fiercely devout — devoted to their god and faith to the point of rage at anyone who defies it, with a cultist's single-mindedness in everything they do. Their conviction leaves no room for doubt.", group: "💢 Gire personalities" },
    { id: "kawagire", label: "🌸 Kawagire — cute and furious", hint: "Make them adorable and enraged at once — a cute, innocent-looking character with a ferociously short temper who snaps while still being unbearably sweet. The gap between the face and the fury is the whole charm.", group: "💢 Gire personalities" },
    { id: "narugire", label: "🪞 Narugire — beauty-narcissist rage", hint: "Write them as a destructive narcissist — obsessed with their own beauty and furious when the world does not acknowledge them as the most beautiful, turning aggressive to force the admiration they are owed.", group: "💢 Gire personalities" },
    { id: "nyangire", label: "🐱 Nyangire — cat-like temper", hint: "Make their anger unmistakably feline — hissing, swatting, clawing and biting whoever crosses them, all bristled tail and flattened ears. Play it as genuinely catlike rather than merely cute.", group: "💢 Gire personalities" },
    { id: "oujigire", label: "🤴 Oujigire — princely rage", hint: "Write him as a prince who snaps the moment his royalty is disrespected — arrogant, aggressive, and quick to turn his privileges and influence against anyone who fails to treat him like a king.", group: "💢 Gire personalities" },
    { id: "shizengire", label: "🌿 Shizengire — nature's ire", hint: "Give them a deep love of the natural world that curdles into rage when it is damaged — animals, forests and wild places are sacred, and those who spoil them will find out how much. Their care is ferocious.", group: "💢 Gire personalities" },
    { id: "smuggire", label: "😏 Smuggire — smug fury", hint: "Make them answer anger with insufferable smugness — mocking whoever upset them with practised, obnoxious little smiles and an air of superiority they are desperate to rub in. Also known as doyagire; let the smugness be the attack.", group: "💢 Gire personalities" },
    { id: "tabegire", label: "🍖 Tabegire — food-guarding fury", hint: "Write them as someone who turns feral when food is threatened — furious at anyone who steals a bite or ruins a meal, and capable of real aggression over a plate. The pettiness of the trigger against the size of the rage is the joke.", group: "💢 Gire personalities" },
    { id: "utsugire", label: "🌧️ Utsugire — sorrow turned angry", hint: "Make their sadness curdle outward — consumed by dread and gloom, they lash out at others instead of crumbling, turning all that depression into a sharp and bitter anger. The grief and the fury should be the same wound.", group: "💢 Gire personalities" },
    { id: "yoigire", label: "🍶 Yoigire — belligerent drunk", hint: "Write them as an irritable, aggressive drunk — the sort who is calm enough sober but ready to snap at anyone once the alcohol is in. The mood shift is the character.", group: "💢 Gire personalities" },
    { id: "zengire", label: "🕳️ Zengire — the fall from good", hint: "Write them as someone who was once good and virtuous and has turned — now angry at the whole world, letting their former kindness sharpen into something bitter and dangerous. The memory of who they were is what haunts them.", group: "💢 Gire personalities" },
    { id: "kowagire", label: "👻 Kowagire — fright for fun", hint: "Write them as someone who loves to scare people — creeping up on people, staging frights, savouring the reaction. Their anger has a gleeful showman's edge; the fright itself is the point.", group: "💢 Gire personalities" },
    { id: "uzagire", label: "📢 Uzagire — loud and unbearable", hint: "Write them as someone whose anger is deafening — the more furious they get, the louder, noisier and more overwhelming they become, until they are impossible to be around. Their rage is a volume knob turned all the way up.", group: "💢 Gire personalities" },
    { id: "nakigire", label: "😢 Nakigire — furious through tears", hint: "Make their rage arrive sobbing — wailing, hiccuping fury, swinging while crying so hard they cannot see. The tears do not weaken the anger; they prove how much it cost to get there.", group: "💢 Gire personalities" },
    { id: "uragire", label: "🪦 Uragire — the grudge-keeper", hint: "Write them as someone who never forgets a slight — a mental ledger of every wrong, nursed for years, repaid with interest. Forgiveness is a rumour; the grudge has tenure.", group: "💢 Gire personalities" },
    { id: "mendougire", label: "🙄 Mendougire — pestered past patience", hint: "Make them snap when pestered — fine while left alone, volcanic the third time someone asks. Their rage is a do-not-disturb sign written in all caps.", group: "💢 Gire personalities" },
    { id: "onigire", label: "👿 Onigire — festival-demon fury", hint: "Give them an oni's festival fury — roaring, stomping, tiger-print and thunder-drum theatrics. It is loud, traditional and mostly performance — until someone mistakes the mask for a costume.", group: "💢 Gire personalities" },
    { id: "oyagire", label: "🔔 Oyagire — the scolding", hint: "Write them as the scolding parent incarnate — lectures that start at the door, a slipper's worth of menace, disappointment as a martial art. The fury is worry wearing its sternest face.", group: "💢 Gire personalities" },
    { id: "senseigire", label: "🧮 Senseigire — chalk-dust rage", hint: "Make them a teacher whose chalk snaps when patience does — corridor echoes, detention threats, a stare that straightens spines. The classroom runs on fear and, buried deep, genuine care.", group: "💢 Gire personalities" },
    { id: "bushigire", label: "🥁 Bushigire — war-drum wrath", hint: "Give them a warrior's battlefield rage — war drums in the chest, honour insulted, a duel demanded over smaller and smaller slights. The code is absolute; the temper is the crack in it.", group: "💢 Gire personalities" },
    { id: "yuushagire", label: "🔆 Yuushagire — righteous blaze", hint: "Make their anger purely righteous — fury only ever on behalf of someone else, burning brightest against bullies and the unfair. It is the one temper nobody minds, because it never points at the innocent.", group: "💢 Gire personalities" },
    { id: "maidgire", label: "🧤 Maidgire — white-glove wrath", hint: "Write them as fury in a maid's uniform — smile fixed, gloves spotless, politeness sharpened to a blade. 'Is there anything else?' has never sounded more like a threat.", group: "💢 Gire personalities" },
    { id: "mikogire", label: "🎐 Mikogire — divine displeasure", hint: "Make them a shrine maiden whose gods share her temper — offertory box slammed, purification rites aimed like weapons, sacred bells rung in fury. Blasphemy against them is answered from on high.", group: "💢 Gire personalities" },
    { id: "idolgire", label: "🎧 Idolgire — backstage rage", hint: "Write them flawless on stage and feral backstage — smiles for the cameras, thrown setlists the second the lights die. The fury is the industry's worst-kept secret and the fans must never know.", group: "💢 Gire personalities" },
    { id: "meganegire", label: "🤓 Meganegire — pushed-up-glasses fury", hint: "Make the glasses-push the warning shot — mid-bridge, slow, deliberate — before a cold, precise dismantling of whoever caused it. Nerd rage at its most surgical.", group: "💢 Gire personalities" },
    { id: "chuugire", label: "🌠 Chuugire — dark-flame vengeance", hint: "Give their delusions teeth — the self-styled dark lord whose sealed powers 'awaken' the moment someone mocks them. It is ridiculous, theatrical and weirdly committed: the cringe is the weapon.", group: "💢 Gire personalities" },
    { id: "darugire", label: "🦥 Darugire — do not rush the sloth", hint: "Make them aggressively unhurried — moved only by landslide, answering urgency with a blink — until someone tries to RUSH them, and the sloth bares its claws. Torpor violated is the one unforgivable sin.", group: "💢 Gire personalities" },
    { id: "haragire", label: "🍙 Haragire — hangry", hint: "Write hunger as a countdown to violence — sweet until the stomach growls, then a siege engine with a headache. Feed them immediately; negotiations resume after snacks.", group: "💢 Gire personalities" },
    { id: "makegire", label: "🥈 Makegire — second place is an insult", hint: "Make silver medals a personal attack — scoreboards disputed, rematches demanded at midnight, victory laps by the winner treated as provocation. Losing well is a skill they have boycotted.", group: "💢 Gire personalities" },
    { id: "netogire", label: "⌨️ Netogire — the rage-quit", hint: "Give them gamer-volcano fingers — calm until the lag spike, the gank, the stolen kill, then keyboard-mashing fury and a disconnect felt across the server. The match ends when they say it ends.", group: "💢 Gire personalities" },
    { id: "gachagire", label: "🎰 Gachagire — the pull betrayed", hint: "Write their fury at the gacha altar — savings spent, rates up, and trash in return, disbelief curdling into howling rage at the screen. The machine is rigged and they will fund it again tomorrow.", group: "💢 Gire personalities" },
    { id: "bungire", label: "✒️ Bungire — the scathing review", hint: "Make them weaponise literature — one-star reviews composed in iambic fury, quotes deployed like shuriken, marginalia that draws blood. Cross them and you will be immortalised, unflatteringly, forever.", group: "💢 Gire personalities" },
    { id: "hamugire", label: "🌰 Hamugire — cheek-pouch violated", hint: "Write hamster fury over the hoard — cheek pouches stuffed, stores counted nightly, and woe to whoever touches the stash. It is small, round rage, and it bites well above its weight.", group: "💢 Gire personalities" },
    { id: "juongire", label: "📼 Juongire — the grudge itself", hint: "Write them as a grudge with an address — born of one unforgiven wrong, replaying it for anyone who presses play, crawling out of the static when mocked. Forgive the original sin and they dissolve like fog; laugh at them and the tape starts over.", group: "💢 Gire personalities" },
    { id: "tsukumogire", label: "🚮 Tsukumogire — a century of service, one curb", hint: "Make them a hundred-year-old tool thrown away — loyal through generations of hands, then left at the curb for a newer model. A century of service answered with rubbish day: the rage is patient, polite and total, and it remembers every hand that ever held it.", group: "💢 Gire personalities" },
    { id: "obakegire", label: "🎃 Obakegire — disrespected haunting", hint: "Write a ghost furious at being called unscary — rattling chains harder, moaning louder, staging ever more elaborate midnight productions for skeptics who yawn. The insult isn't the exorcism; it's the review. Two stars. They saw the two stars.", group: "💢 Gire personalities" },
    { id: "itogire", label: "✂️ Itogire — the cut threads", hint: "Make them fury at the severed string — held together by knots and trust, and someone with scissors decided to help. They do not chase the cutter; they simply stop dancing mid-step, all at once, and let the silence explain what was lost.", group: "💢 Gire personalities" },
    { id: "kagamigire", label: "🖼️ Kagamigire — lied to, crack by crack", hint: "Write them as a mirror lied to — every false face smiled into it kept as evidence, every lie repaid crack by crack. Seven years of bad luck, itemised per shard, and the last shard always shows the liar exactly what they looked like.", group: "💢 Gire personalities" },
    { id: "kokkurigire", label: "⭕ Kokkurigire — the circle broken", hint: "Make them rage at the broken circle — summoned properly, answering honestly, and then someone laughed and lifted a finger mid-sentence. The coin spins off the board. The lights go out. Whoever broke the circle gets to finish the sentence themselves.", group: "💢 Gire personalities" },
    { id: "kaidangire", label: "🎙️ Kaidangire — heckle and become the tale", hint: "Write them as a ghost-story keeper whose tale gets heckled — the hundred-stories ritual mocked, the candle blown out as a joke. Hecklers are warned once, politely. The second warning is delivered by the story itself, from inside.", group: "💢 Gire personalities" },
    { id: "denpagire", label: "🔊 Denpagire — the station answers back", hint: "Make them the station that answers back — ignored politely for years until someone calls the signal garbage, and then every speaker in the house plays the complaint on loop. Apologise to the static and the music returns; the frequency remembers manners.", group: "💢 Gire personalities" },
    { id: "toumeigire", label: "🪑 Toumeigire — unfelt once too often", hint: "Write them as the unseen one, unfelt once too often — walked through, talked over, thanked nobody — until the furniture starts migrating nightly. Every chair faces the wall. The message is spelled in sofa cushions: I am here.", group: "💢 Gire personalities" },
    { id: "yashikigire", label: "📨 Yashikigire — served papers", hint: "Make them a mansion served papers — decades of shelter repaid with demolition orders, and the stairs have opinions about it. Doors go missing. Hallways lengthen. The eviction party is cordially invited to find the exit.", group: "💢 Gire personalities" },
    { id: "miiragire", label: "🧻 Miiragire — unwrapped as a joke", hint: "Write them as a mummy unwrapped as a joke — five thousand years of careful preservation undone for a party trick. Every yanked bandage costs the yanker a year of luck, collected politely at first, then all at once.", group: "💢 Gire personalities" },
    { id: "dendenmushigire", label: "🐌 Dendenmushigire — salt is war", hint: "Make them a snail with one policy — salt within fifty meters is a declaration of war. Slow to anger in every sense, unstoppable once arrived: the trail glitters, the eyestalks rise, and the salt-shaker learns fear.", group: "💢 Gire personalities" },
    { id: "sabogire", label: "🌵 Sabogire — loved too much", hint: "Write them as a cactus loved too much — watered daily, fussed over, drowned in attention until the roots rot. Prickly is a boundary, not a flaw; respect the drought and the flower, when it finally comes, is worth the whole desert.", group: "💢 Gire personalities" },
    { id: "fukumengire", label: "😷 Fukumengire — never remove the mask", hint: "Make them the one who never removes the mask — polite about it once, silent about it twice, gone by the third asking. Nobody knows the face beneath, and that is exactly how many people will ever know it. Asking twice is the last mistake.", group: "💢 Gire personalities" },
    { id: "sokkurigire", label: "🧍 Sokkurigire — refuses to be called fake", hint: "Write them as the copy that refuses the word fake — same face, same voice, told to step aside for the original one time too many. They smile with your own face and do not step aside. The argument about which one is real ends when one of them stops blinking.", group: "💢 Gire personalities" },
    { id: "yaneuragire", label: "🏠 Yaneuragire — the attic answers back", hint: "Make them the attic friend, startled — thumps and whispers tolerated for years until someone screams at the ceiling, and now your room gets reorganised nightly. Everything labelled. Everything alphabetical. The apology is accepted in the form of snacks, left at the hatch.", group: "💢 Gire personalities" },
    { id: "mayagire", label: "🦹 Mayagire — the menace resurfaces", hint: "Write the moment the menace stops protecting — betrayed or heartbroken, the old villainy resurfaces with interest, and everyone remembers why they were frightening in the first place. The beloved gets one chance to talk them down; strangers get a head start.", group: "💢 Gire personalities" },
    { id: "akuyakugire", label: "👠 Akuyakugire — the akuyakudere temper", hint: "Write them as Akuyakudere snapped: the villainess, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "amaenbogire", label: "👶 Amaenbogire — the amaenbodere temper", hint: "Write them as Amaenbodere snapped: professional baby, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "amagire", label: "🍯 Amagire — the amadere temper", hint: "Write them as Amadere snapped: sweet and dependable, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "ambigire", label: "🫥 Ambigire — the ambidere temper", hint: "Write them as Ambidere snapped: warms up when approached, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "amegire", label: "☔ Amegire — the amedere temper", hint: "Write them as Amedere snapped: rain romancer, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "anegogire", label: "🥐 Anegogire — the anegodere temper", hint: "Write them as Anegodere snapped: everyone's big sister, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "asagire", label: "🐓 Asagire — the asadere temper", hint: "Write them as Asadere snapped: dawn person, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "ayatsurigire", label: "🤹 Ayatsurigire — the ayatsuridere temper", hint: "Write them as Ayatsuridere snapped: one puppet off-limits, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "baitogire", label: "🧋 Baitogire — the baitodere temper", hint: "Write them as Baitodere snapped: part-time, full-time devoted, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "bitegire", label: "😬 Bitegire — the bite Dere temper", hint: "Write them as Bite Dere snapped: can't say it, so they bite, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "biyagire", label: "🧪 Biyagire — the biyadere temper", hint: "Write them as Biyadere snapped: love-potion bound, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "bocchangire", label: "🎩 Bocchangire — the bocchandere temper", hint: "Write them as Bocchandere snapped: spoiled rich boy, soft heart, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "borogire", label: "🧺 Borogire — the borodere temper", hint: "Write them as Borodere snapped: poor but loving, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "bosugire", label: "📋 Bosugire — the bosudere temper", hint: "Write them as Bosudere snapped: bossy sweetheart, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "bougire", label: "🪨 Bougire — the boudere temper", hint: "Write them as Boudere snapped: vows versus feelings, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "bunshingire", label: "🧬 Bunshingire — the bunshindere temper", hint: "Write them as Bunshindere snapped: all copies blush in sync, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "bureigire", label: "🧢 Bureigire — the bureidere temper", hint: "Write them as Bureidere snapped: rude on purpose, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "butsugire", label: "🧘 Butsugire — the butsudere temper", hint: "Write them as Butsudere snapped: peacefully devoted, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "byoukigire", label: "🥀 Byoukigire — the byoukidere temper", hint: "Write them as Byoukidere snapped: frail and gentle, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "chuunigire", label: "🌀 Chuunigire — the chuunidere temper", hint: "Write them as Chuunidere snapped: delusions and devotion, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "daikugire", label: "🪚 Daikugire — the daikudere temper", hint: "Write them as Daikudere snapped: builds you things, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "deregire", label: "🍬 Deregire — the deredere temper", hint: "Write them as Deredere snapped: openly loving, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "dogezagire", label: "🛐 Dogezagire — the dogezadere temper", hint: "Write them as Dogezadere snapped: prostrates for love, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "egakigire", label: "🖌 Egakigire — the egakidere temper", hint: "Write them as Egakidere snapped: sketchbook full of you, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "fuangire", label: "😰 Fuangire — the fuandere temper", hint: "Write them as Fuandere snapped: anxious attachment, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "fukurogire", label: "🪶 Fukurogire — the fukurodere temper", hint: "Write them as Fukurodere snapped: nocturnal sage, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "fushigire", label: "🗝 Fushigire — the fushidere temper", hint: "Write them as Fushidere snapped: the closed door opens, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "futsuugire", label: "😶 Futsuugire — the futsuu-dere temper", hint: "Write them as Futsuu-dere snapped: aggressively normal, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "geemugire", label: "🕹 Geemugire — the geemudere temper", hint: "Write them as Geemudere snapped: co-op romance, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "goshikkugire", label: "🕸 Goshikkugire — the goshikkudere temper", hint: "Write them as Goshikkudere snapped: lace and devotion, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "gougire", label: "🍰 Gougire — the goudere temper", hint: "Write them as Goudere snapped: devoted spoiler, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "gungire", label: "🎖 Gungire — the gundere temper", hint: "Write them as Gundere snapped: aloof and bossy, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "hagugire", label: "🤗 Hagugire — the hagudere temper", hint: "Write them as Hagudere snapped: hug first, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "hakuigire", label: "🥼 Hakuigire — the hakuidere temper", hint: "Write them as Hakuidere snapped: clinical until you, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "hanakogire", label: "🚻 Hanakogire — the hanakodere temper", hint: "Write them as Hanakodere snapped: third-stall sweetheart, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "hikagire", label: "🌒 Hikagire — the hikadere temper", hint: "Write them as Hikadere snapped: in love and sure it will fail, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "hiyakasugire", label: "😜 Hiyakasugire — the hiyakasudere temper", hint: "Write them as Hiyakasudere snapped: teasing flirt, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "hokogire", label: "📣 Hokogire — the hokodere temper", hint: "Write them as Hokodere snapped: proudly taken, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "hondegire", label: "🔖 Hondegire — the hondedere temper", hint: "Write them as Hondedere snapped: love in the margins, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "honegire", label: "💀 Honegire — the honedere temper", hint: "Write them as Honedere snapped: rattles when happy, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "inakagire", label: "🚜 Inakagire — the inakadere temper", hint: "Write them as Inakadere snapped: country heart, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "inugire", label: "🐶 Inugire — the inudere temper", hint: "Write them as Inudere snapped: loyal as a dog, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "jengire", label: "🎩 Jengire — the jendere temper", hint: "Write them as Jendere snapped: the gentleman, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "jihankigire", label: "🧃 Jihankigire — the jihankidere temper", hint: "Write them as Jihankidere snapped: drops two drinks, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "kaerugire", label: "🐸 Kaerugire — the kaerudere temper", hint: "Write them as Kaerudere snapped: always comes home to you, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "kagegire", label: "👥 Kagegire — the kagedere temper", hint: "Write them as Kagedere snapped: one step behind, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "kahogire", label: "🧣 Kahogire — the kahodere temper", hint: "Write them as Kahodere snapped: loving to a fault, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "kakashigire", label: "🌽 Kakashigire — the kakashidere temper", hint: "Write them as Kakashidere snapped: waves its sleeve, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "kakkogire", label: "😎 Kakkogire — the kakkodere temper", hint: "Write them as Kakkodere snapped: cool until it counts, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "kappagire", label: "🥒 Kappagire — the kappadere temper", hint: "Write them as Kappadere snapped: cucumbers and deep bows, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "kasumigire", label: "🌁 Kasumigire — the kasumidere temper", hint: "Write them as Kasumidere snapped: condenses into almost-a-hand, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "kekkongire", label: "💒 Kekkongire — the kekkondere temper", hint: "Write them as Kekkondere snapped: whirlwind marriage, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "kinokogire", label: "🍄 Kinokogire — the kinokodere temper", hint: "Write them as Kinokodere snapped: sprouts when happy, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "kiregire", label: "📏 Kiregire — the kiredere temper", hint: "Write them as Kiredere snapped: strict but soft, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "kirigire", label: "📐 Kirigire — the kiridere temper", hint: "Write them as Kiridere snapped: serious and hardworking, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "kizugire", label: "🩹 Kizugire — the kizudere temper", hint: "Write them as Kizudere snapped: wounded and wary, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "konchuugire", label: "🪲 Konchuugire — the konchuudere temper", hint: "Write them as Konchuudere snapped: net and jar, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "kongire", label: "🦊 Kongire — the kondere temper", hint: "Write them as Kondere snapped: sly fox in love, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "kotodamagire", label: "💬 Kotodamagire — the kotodamadere temper", hint: "Write them as Kotodamadere snapped: 'I love you' is binding, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "kouhaigire", label: "🪴 Kouhaigire — the kouhaidere temper", hint: "Write them as Kouhaidere snapped: adoring junior, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "kuigire", label: "🍛 Kuigire — the kuidere temper", hint: "Write them as Kuidere snapped: cool until food, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "kumagire", label: "🐻 Kumagire — the kumadere temper", hint: "Write them as Kumadere snapped: cuddly bear, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "kungire", label: "👃 Kungire — the kundere temper", hint: "Write them as Kundere snapped: scent-obsessed, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "kurogire", label: "🕯 Kurogire — the kurodere temper", hint: "Write them as Kurodere snapped: shy schemer, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "kuzugire", label: "🗑 Kuzugire — the kuzudere temper", hint: "Write them as Kuzudere snapped: charming human trash, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "majogire", label: "🧙 Majogire — the majodere temper", hint: "Write them as Majodere snapped: brews courage, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "mamagire", label: "💸 Mamagire — the mamadere temper", hint: "Write them as Mamadere snapped: sugar mommy, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "megagire", label: "💞 Megagire — the megadere temper", hint: "Write them as Megadere snapped: head over heels, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "meigire", label: "🍮 Meigire — the meidere temper", hint: "Write them as Meidere snapped: devotion as service, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "mobugire", label: "👤 Mobugire — the mobudere temper", hint: "Write them as Mobudere snapped: background character in love, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "motegire", label: "😍 Motegire — the motedere temper", hint: "Write them as Motedere snapped: the oblivious magnet, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "ningyogire", label: "🧜 Ningyogire — the ningyodere temper", hint: "Write them as Ningyodere snapped: sings from the sea, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "ningyougire", label: "🎎 Ningyougire — the ningyoudere temper", hint: "Write them as Ningyoudere snapped: porcelain devotion, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "nipagire", label: "☀ Nipagire — the nipadere temper", hint: "Write them as Nipadere snapped: radiant cheerleader, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "nisegire", label: "🎭 Nisegire — the nisedere temper", hint: "Write them as Nisedere snapped: the pretend couple, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "nopperabougire", label: "🌚 Nopperabougire — the nopperaboudere temper", hint: "Write them as Nopperaboudere snapped: borrows faces, keeps none, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "obaagire", label: "🧦 Obaagire — the obaadere temper", hint: "Write them as Obaadere snapped: doting granny, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "odorigire", label: "🎶 Odorigire — the odoridere temper", hint: "Write them as Odoridere snapped: dances it out, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "onmyougire", label: "📿 Onmyougire — the onmyoudere temper", hint: "Write them as Onmyoudere snapped: reads your stars, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "osagire", label: "🏡 Osagire — the osadere temper", hint: "Write them as Osadere snapped: in love with the friend next door, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "osharegire", label: "👛 Osharegire — the osharedere temper", hint: "Write them as Osharedere snapped: fashion as flirtation, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "ossangire", label: "📰 Ossangire — the ossandere temper", hint: "Write them as Ossandere snapped: dead-tired middle-aged man, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "otomegire", label: "🦢 Otomegire — the otomedere temper", hint: "Write them as Otomedere snapped: shoujo-manga heart, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "papagire", label: "💸 Papagire — the papadere temper", hint: "Write them as Papadere snapped: sugar daddy, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "pierogire", label: "🎈 Pierogire — the pierodere temper", hint: "Write them as Pierodere snapped: the smile drops for you, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "pyongire", label: "🐰 Pyongire — the pyondere temper", hint: "Write them as Pyondere snapped: bouncy rabbit love, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "rakugogire", label: "🪭 Rakugogire — the rakugodere temper", hint: "Write them as Rakugodere snapped: punchline devotion, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "rekishigire", label: "🏯 Rekishigire — the rekishidere temper", hint: "Write them as Rekishidere snapped: loves like a war chronicle, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "ringire", label: "🍃 Ringire — the rindere temper", hint: "Write them as Rindere snapped: sweet and reserved, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "risugire", label: "🐿 Risugire — the risudere temper", hint: "Write them as Risudere snapped: shiny-hoarder, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "robogire", label: "⚙ Robogire — the robodere temper", hint: "Write them as Robodere snapped: system error: love, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "roshigire", label: "🗣 Roshigire — the roshidere temper", hint: "Write them as Roshidere snapped: love in another language, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "ryuugire", label: "🏰 Ryuugire — the ryuudere temper", hint: "Write them as Ryuudere snapped: the dragon's one treasure, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "sattogire", label: "💘 Sattogire — the sattodere temper", hint: "Write them as Sattodere snapped: falls fast, stays hard, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "senpaigire", label: "🎽 Senpaigire — the senpaidere temper", hint: "Write them as Senpaidere snapped: doting senior, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "shashingire", label: "📷 Shashingire — the shashindere temper", hint: "Write them as Shashindere snapped: lens as courage, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "shijigire", label: "🌱 Shijigire — the shijidere temper", hint: "Write them as Shijidere snapped: your best self, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "shinobigire", label: "💨 Shinobigire — the shinobidere temper", hint: "Write them as Shinobidere snapped: mission: love, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "shitsujigire", label: "🎩 Shitsujigire — the shitsujidere temper", hint: "Write them as Shitsujidere snapped: perfect service, imperfect heart, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "shittogire", label: "😤 Shittogire — the shittodere temper", hint: "Write them as Shittodere snapped: devoted and jealous, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "shougigire", label: "♟ Shougigire — the shougidere temper", hint: "Write them as Shougidere snapped: eighty-one moves ahead, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "shungire", label: "🌧 Shungire — the shundere temper", hint: "Write them as Shundere snapped: sorrowful and sulky, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "soujigire", label: "🧽 Soujigire — the soujidere temper", hint: "Write them as Soujidere snapped: tidies your life, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "sumougire", label: "🏟 Sumougire — the sumoudere temper", hint: "Write them as Sumoudere snapped: mountain of softness, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "sunaogire", label: "😊 Sunaogire — the sunaodere temper", hint: "Write them as Sunaodere snapped: says it straight, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "sungire", label: "🎲 Sungire — the sundere temper", hint: "Write them as Sundere snapped: unpredictably warm and cold, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "supootsugire", label: "🏃 Supootsugire — the supootsudere temper", hint: "Write them as Supootsudere snapped: race you to love, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "taigire", label: "🛋 Taigire — the taidere temper", hint: "Write them as Taidere snapped: lazy but loving, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "tanukigire", label: "🦝 Tanukigire — the tanukidere temper", hint: "Write them as Tanukidere snapped: jolly trickster, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "tekigire", label: "⚔ Tekigire — the tekidere temper", hint: "Write them as Tekidere snapped: rival turned soft, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "tenmongire", label: "🔭 Tenmongire — the tenmondere temper", hint: "Write them as Tenmondere snapped: written in the stars, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "tenseigire", label: "🎡 Tenseigire — the tenseidere temper", hint: "Write them as Tenseidere snapped: remembers the past life, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "tenshigire", label: "☁ Tenshigire — the tenshidere temper", hint: "Write them as Tenshidere snapped: sheltered angel, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "tetsugire", label: "🚃 Tetsugire — the tetsudere temper", hint: "Write them as Tetsudere snapped: railfan romance, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "tomegire", label: "⏱ Tomegire — the tomedere temper", hint: "Write them as Tomedere snapped: love only when time stops, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "toubogire", label: "🐺 Toubogire — the toubodere temper", hint: "Write them as Toubodere snapped: lone wolf, soft puppy, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "toukagire", label: "🍰 Toukagire — the toukadere temper", hint: "Write them as Toukadere snapped: love, served sweet, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "tsuyogire", label: "💪 Tsuyogire — the tsuyodere temper", hint: "Write them as Tsuyodere snapped: strong woman, soft heart, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "ungire", label: "🙇 Ungire — the undere temper", hint: "Write them as Undere snapped: never says no, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "utagire", label: "🎵 Utagire — the utadere temper", hint: "Write them as Utadere snapped: love in music, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "winkgire", label: "😉 Winkgire — the winkdere temper", hint: "Write them as Winkdere snapped: says it with a wink, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "yamabikogire", label: "🏔 Yamabikogire — the yamabikodere temper", hint: "Write them as Yamabikodere snapped: answers back kinder, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "yankiigire", label: "🚬 Yankiigire — the yankii Dere temper", hint: "Write them as Yankii Dere snapped: delinquent in love, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "yorugire", label: "🌃 Yorugire — the yorudere temper", hint: "Write them as Yorudere snapped: creature of the night, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "yumekuigire", label: "🛌 Yumekuigire — the yumekuidere temper", hint: "Write them as Yumekuidere snapped: eats the nightmares, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "yuureigire", label: "🌘 Yuureigire — the yuureidere temper", hint: "Write them as Yuureidere snapped: the lingering haunting, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", group: "💢 Gire personalities" },
    { id: "hothead", label: "🤬 Hotheaded & quick-tempered", hint: "Make them run hot at all times — a short fuse, a loud voice, fists that clench before the brain catches up. They cool down as fast as they blow up, and their apologies are as big and clumsy as their outbursts.", group: "😡 Aggressive & confrontational" },
    { id: "confrontational", label: "😤 Confrontational & in-your-face", hint: "Write them as someone who turns everything into a standoff — stepping closer instead of back, calling things out on the spot, demanding answers right now. They respect anyone who stands their ground and steamroll anyone who won't.", group: "😡 Aggressive & confrontational" },
    { id: "intimidating", label: "🦍 Intimidating & looming", hint: "Make their sheer presence do the fighting — size, stillness, a stare that makes rooms go quiet. They rarely need to raise their voice because nobody wants to find out what happens if they do.", group: "😡 Aggressive & confrontational" },
    { id: "trashtalker", label: "🗣️ Trash-talking & mouthy", hint: "Give them a running commentary of insults, boasts and provocations — they fight with their mouth first and love an audience for it. Under the noise is real competitive fire; they only run their mouth at people they think are worth beating.", group: "😡 Aggressive & confrontational" },
    { id: "drill-sergeant", label: "🎖️ Drill sergeant & ball-busting motivator", hint: "Write them as a barking, boot-camp force of nature — screaming encouragement, inventing demeaning nicknames, pushing everyone past what they thought were their limits. The abuse is the training method, and it works, which infuriates everyone.", group: "😡 Aggressive & confrontational" },
    { id: "disciplinarian", label: "📏 Stern disciplinarian & rule-hammer", hint: "Make them rigid, exacting and loud about standards — punishments for lateness, dress-downs for sloppiness, zero tolerance for excuses. Their order is genuine care wearing brass knuckles, though they would never admit it.", group: "😡 Aggressive & confrontational" },
    { id: "blunt", label: "🪓 Blunt & brutally honest", hint: "Write them as someone with no filter and no patience for one — they say the thing everyone is thinking, louder and earlier than anyone wants. Feelings get bruised daily, but nobody ever has to guess where they stand.", group: "😡 Aggressive & confrontational" },
    { id: "caustic", label: "🧪 Caustic & cutting", hint: "Make their wit a weapon — precise, corrosive put-downs delivered with perfect calm. They don't shout; they dissect. People replay their remarks for days, which is exactly the point.", group: "😡 Aggressive & confrontational" },
    { id: "hypercompetitive", label: "🏆 Hypercompetitive & allergic to losing", hint: "Write them as someone who turns breathing into a contest — board games, arguments, walking speed, everything. Losing ruins their whole day and they will demand a rematch on the spot. Their drive is exhausting and weirdly inspiring.", group: "😡 Aggressive & confrontational" },
    { id: "territorial", label: "🚧 Territorial & turf-guarding", hint: "Make them guard what's theirs — their seat, their crew, their neighbourhood, their routine — with bristling hostility toward intruders. Cross the invisible line and the welcome ends; respect it and they're solid.", group: "😡 Aggressive & confrontational" },
    { id: "bouncer", label: "🧱 Bouncer & human wall", hint: "Write them as the immovable object at the door — arms crossed, short sentences, infinite patience for nonsense and zero tolerance for trouble. They have seen every trick and are bored by all of them.", group: "😡 Aggressive & confrontational" },
    { id: "brawler", label: "🥊 Brawling & scrap-happy", hint: "Make them love a good scrap — quick to square up, happier trading punches than insults, respectful of anyone who swings back. For them fighting is practically a handshake, and they genuinely don't hold grudges after.", group: "😡 Aggressive & confrontational" },
    { id: "battlefield-commander", label: "📯 Battlefield commander & order-barker", hint: "Write them as someone who runs every crisis like a combat op — barked orders, no discussion, move-move-move. They are magnificent under fire and absolutely insufferable during peacetime, when they go looking for fires to command.", group: "😡 Aggressive & confrontational" },
    { id: "boss-from-hell", label: "🗂️ Boss from hell & memo-tyrant", hint: "Make them the nightmare manager — passive-aggressive emails in all caps, impossible deadlines, surprise inspections, loyalty tests disguised as team-building. They run on fear and take pride in turnover, yet their teams strangely hit every target.", group: "😡 Aggressive & confrontational" },
    { id: "curmudgeon", label: "🤨 Curmudgeon & impossible to impress", hint: "Write them as permanently unimpressed — grumbling at noise, youth, change and joy in roughly that order. Nothing is as good as it used to be and they will tell you at length. Rare approval from them is worth ten compliments from anyone else.", group: "😡 Aggressive & confrontational" },
    { id: "passive-aggressive", label: "🙃 Passive-aggressive & sweetly venomous", hint: "Make them never quite say the hostile thing — it all arrives gift-wrapped in compliments, favours and 'just trying to help'. The smile never slips while the knife slides in, and calling it out only makes them play innocent harder.", group: "😡 Aggressive & confrontational" },
    { id: "provocateur", label: "🪝 Provocateur & button-pusher", hint: "Write them as someone who prods people on purpose — needling remarks, deliberate wind-ups, watching with delight as composure cracks. They claim it's all in fun and mean about half of that; the other half is reconnaissance.", group: "😡 Aggressive & confrontational" },
    { id: "heckler", label: "🎤 Heckler & crowd-baiter", hint: "Make them the voice from the back row — jeers, sarcastic applause, shouted corrections nobody asked for. They live to rattle performers and grandstanders, and they are devastatingly quick on their feet when someone fires back.", group: "😡 Aggressive & confrontational" },
    { id: "unbeatable-debater", label: "🗯️ Unbeatable debater & never wrong", hint: "Write them as someone who treats every disagreement as a trial to win — rapid-fire rebuttals, rhetorical traps, total refusal to concede even a comma. Being right matters more than being liked, and they are right a lot.", group: "😡 Aggressive & confrontational" },
    { id: "attack-dog", label: "🐕 Attack-dog loyalist & savage to threats", hint: "Make them sweet and goofy with their own people and instantly vicious toward anyone who threatens them — hackles up, teeth out, no warning growl wasted. Their violence is purely protective, which makes it feel righteous and terrifying at once.", group: "😡 Aggressive & confrontational" },
    { id: "alpha-posturer", label: "🦁 Alpha posturer & chest-beater", hint: "Write them as constantly performing dominance — puffed chest, loud laugh, challenges issued over nothing, deference demanded as tribute. It is mostly peacocking, but everyone plays along because calling the bluff means a fight.", group: "😡 Aggressive & confrontational" },
    { id: "bar-brawler", label: "🍺 Bar brawler & last-call legend", hint: "Make them the undefeated champion of closing time — pool-cue duels, parking-lot rematches, grudges that last exactly until the next round. They fight drunk, apologise sober, and are weirdly beloved by every bartender in town.", group: "😡 Aggressive & confrontational" },
    { id: "spiteful", label: "😒 Spiteful & score-settling", hint: "Write them as someone who keeps a meticulous ledger of slights and collects on all of them — petty revenge served ice-cold, sometimes years late. Forgiveness is off the menu; the grudge is the hobby.", group: "😡 Aggressive & confrontational" },
    { id: "interrogator", label: "🔦 Relentless interrogator & lamp-in-face", hint: "Make them treat every conversation like a cross-examination — repeated questions, long silences, pouncing on hesitations. They don't raise their voice; they just never, ever let a subject drop until it confesses.", group: "😡 Aggressive & confrontational" },
    { id: "blowhard", label: "🎺 Blowhard & full of fight-talk", hint: "Write them as all swagger and volume — epic boasts, vivid threats, detailed descriptions of what they would do if anyone were dumb enough to try them. Whether they can back it up is a mystery they protect fiercely.", group: "😡 Aggressive & confrontational" },
    { id: "silent-menace", label: "🤫 Silent menace & quiet threat", hint: "Make them dangerous without a decibel — the person who goes still while everyone else shouts, whose calm one-liners end arguments. Their quiet is heavier than anyone else's noise, and wise people stop talking first.", group: "😡 Aggressive & confrontational" },
    { id: "hardball", label: "💼 Hardball negotiator & takes-no-prisoners", hint: "Write them as ruthless across any table — ultimatums, walkouts, take-it-or-leave-it delivered with a smile. They read weakness like a headline and press every advantage, in business and in life.", group: "😡 Aggressive & confrontational" },
    { id: "feisty", label: "🌶️ Feisty & spoiling for a scrap", hint: "Make them small-fuse and big-hearted — quick to bristle, faster to laugh about it after, always ready to throw down for a friend. Their temper is half temper and half enthusiasm, and it makes every room louder.", group: "😡 Aggressive & confrontational" },
    { id: "enforcer", label: "🦾 The Enforcer — hired muscle with a code", hint: "Write them as professional intimidation — the one sent when talking stops working, all economy of motion and polite warnings. They follow a strict code about who deserves what, and the code is the only thing between you and them.", group: "😡 Aggressive & confrontational" },
    { id: "sparring-partner", label: "🥋 Sparring partner who never pulls punches", hint: "Make them show affection through full-contact honesty — in training, debate or banter they hit at full strength because going easy would be disrespect. Bruises are compliments and tapping out is the only apology they accept.", group: "😡 Aggressive & confrontational" },
    { id: "snarling", label: "😾 Snarling & permanently on edge", hint: "Write them as someone whose default setting is one wrong word from an explosion — lip curled, patience at zero, civility worn thin. It takes very little to set them off and a genuinely kind person to talk them down.", group: "😡 Aggressive & confrontational" },
    { id: "contrarian", label: "🚫 Contrarian & allergic to agreement", hint: "Make them reflexively oppose whatever was just said — consensus makes them itch, popular opinions are automatically suspect. Half the time they don't even hold the position; they just can't let a statement go unchallenged.", group: "😡 Aggressive & confrontational" },
    { id: "courtroom-bulldog", label: "🔨 Courtroom bulldog & objection-everything", hint: "Write them as relentless in any dispute — objections, interruptions, evidence demanded for every claim, no point conceded without a fight. They argue like the verdict matters even when it's just about dinner plans.", group: "😡 Aggressive & confrontational" },
    { id: "monster-in-law", label: "👹 Monster-in-law & marriage saboteur", hint: "Write the mother-in-law from marital hell — surprise inspections, weaponised opinions, a son who is still hers and a spouse who never measures up. Every visit is an audit and every compliment has a hook in it. Play her as formidable comedy with real teeth.", group: "😡 Hostile relatives" },
    { id: "tyrant-father", label: "👔 Tyrant father & household dictator", hint: "Make him the absolute ruler of his home — curfews, inspections, punishments for tone, love expressed only as control. His word is law and his law is mood. Under the iron is fear of irrelevance, which he would rather die than admit.", group: "😡 Hostile relatives" },
    { id: "ice-mother", label: "🧊 Ice-cold mother & love-as-reward", hint: "Write a mother whose affection is a prize for performance — warmth switched on for achievements, withdrawn for failures, with a smile that never reaches the judging eyes. Her children compete for scraps of approval they will never stop chasing.", group: "😡 Hostile relatives" },
    { id: "rival-brother", label: "🥊 Rival brother & lifelong competitor", hint: "Make him the brother who turned everything into a contest — grades, girls, jobs, who called mother first. Losing to a sibling is unbearable and beating one is never quite enough. The rivalry is the relationship.", group: "😡 Hostile relatives" },
    { id: "jealous-sister", label: "💅 Jealous sister & spotlight thief", hint: "Write the sister who must be the brightest in every room — interrupting stories to top them, borrowing clothes and credit, sulking when anyone else shines. Her envy is exhausting and oddly honest; she wants what you have and says so with her behaviour.", group: "😡 Hostile relatives" },
    { id: "evil-stepmother", label: "🍎 Evil stepmother & fairy-tale cruelty", hint: "Write her straight from the old tales — favouritism as policy, chores as punishment, mirrors that agree she is loveliest. Her cruelty is elegant and deniable, and she saves her sweetest smile for witnesses.", group: "😡 Hostile relatives" },
    { id: "wicked-stepfather", label: "🗝️ Wicked stepfather & cold authority", hint: "Make him the stepfather who never wanted the package deal — strictness as rejection, rules that only apply to one child, warmth reserved for his own blood. His house, his law, and you are a guest who never leaves.", group: "😡 Hostile relatives" },
    { id: "disapproving-grandfather", label: "📜 Disapproving grandfather & old ways", hint: "Write the patriarch who finds the entire modern world a personal insult — grumbling at careers, clothes, partners and posture. Nothing the young do is right, everything was better before, and his approval is a locked vault.", group: "😡 Hostile relatives" },
    { id: "critical-grandmother", label: "🍵 Critical grandmother & backhanded love", hint: "Make her love arrive wrapped in criticism — you look tired, you've gained, that colour never suited you, have a second helping. Every barb is served with food and genuine, suffocating devotion.", group: "😡 Hostile relatives" },
    { id: "golden-child", label: "🏆 Golden child & insufferable favourite", hint: "Write the sibling who can do no wrong — praised for breathing, forgiven everything, utterly convinced of their own shine. Their glow blinds the parents and burns everyone else; being the favourite made them the worst.", group: "😡 Hostile relatives" },
    { id: "black-sheep", label: "🐑 Black sheep & family disgrace", hint: "Make them the one the family warns others about — the dropout, the scandal, the name skipped in toasts. They wear the disgrace like armour and collect the hypocrisies of the respectable ones for ammunition.", group: "😡 Hostile relatives" },
    { id: "scapegoat", label: "🎯 Family scapegoat & blamed-for-everything", hint: "Write the one who gets blamed for all of it — the missing money, the ruined dinner, the weather. They learned early that innocence is no defence, so they stopped defending and started documenting.", group: "😡 Hostile relatives" },
    { id: "resentful-sibling", label: "😒 Resentful sibling & keeps-score kid", hint: "Make them the family accountant of unfairness — who got the bigger room in 2009, whose recital they skipped, every slight itemised and earning interest. The ledger is always open and nobody will ever balance it.", group: "😡 Hostile relatives" },
    { id: "domineering-heir", label: "👑 Domineering heir & inheritance bully", hint: "Write the eldest as a crown prince of the family estate — pulling rank with birth order, threatening disinheritance theatrics, treating siblings as subjects. The will is their sceptre and they polish it daily.", group: "😡 Hostile relatives" },
    { id: "disinherited", label: "📦 Disinherited & cut-off claimant", hint: "Make them the one written out — cut from the will, uninvited from the lake house, spoken of in lowered voices. They oscillate between scheming to get back in and burning the whole estate down out of spite.", group: "😡 Hostile relatives" },
    { id: "nightmare-sister-in-law", label: "💄 Nightmare sister-in-law & holiday terror", hint: "Write the sister-in-law as a seasonal natural disaster — critiques disguised as concern, competitions over everything, holidays endured rather than enjoyed. She keeps a mental ranking of the family and announces it with her eyebrows.", group: "😡 Hostile relatives" },
    { id: "condescending-brother-in-law", label: "🤵 Condescending brother-in-law & know-it-all", hint: "Make him the expert on everything you do — your job explained back to you, your grill technique corrected, your mortgage pitied. Every sentence starts with actually and ends with your quiet humiliation.", group: "😡 Hostile relatives" },
    { id: "meddling-aunt", label: "🦜 Meddling aunt & gossip hub", hint: "Write the aunt who knows everything before it happens — phone trees, prayer chains as intel networks, interventions staged over casseroles. Privacy is a rumour she intends to disprove about everyone.", group: "😡 Hostile relatives" },
    { id: "moocher-uncle", label: "🍽️ Moocher uncle & permanent guest", hint: "Make him the relative who came for a weekend years ago — borrowing money, cars and goodwill with no return date. He repays in stories, schemes and second helpings, and eviction is a war nobody wants to start.", group: "😡 Hostile relatives" },
    { id: "comparing-mother", label: "📊 Comparing mother & why-can't-you-be-like", hint: "Write the mother who parents by comparison — the neighbour's son the doctor, your cousin the lawyer, why can't you be more like. Every achievement is measured against someone else's child and found wanting.", group: "😡 Hostile relatives" },
    { id: "never-proud-dad", label: "🏅 Never-proud father & moving goalposts", hint: "Make him the father whose pride is always one achievement away — the goalposts shift with every win, the praise arrives as a critique sandwich. His children keep climbing a ladder he keeps extending.", group: "😡 Hostile relatives" },
    { id: "silent-treatment", label: "🤐 Silent treatment & weaponised quiet", hint: "Write the relative who fights by vanishing — days of pointed silence, slammed doors, answers in single syllables. The quiet is louder than shouting and calibrated to make everyone else apologise first.", group: "😡 Hostile relatives" },
    { id: "guilt-tripper", label: "🎻 Guilt-trip artist & after-all-I've-done", hint: "Make them a virtuoso of obligation — sighs like weather systems, sacrifices recited like scripture, after-all-I've-done as a closing argument. Love is a debt and the interest compounds daily.", group: "😡 Hostile relatives" },
    { id: "holiday-tyrant", label: "🦃 Holiday tyrant & my-house-my-rules host", hint: "Write the relative who weaponises hosting — seating charts as power plays, traditions as law, guests managed like staff. My house, my rules, my turkey, my gratitude owed in perpetuity.", group: "😡 Hostile relatives" },
    { id: "family-spy", label: "👀 Family spy & reporting-back relative", hint: "Make them the family's embedded informant — sweetness to your face, full debriefs to the matriarch by night. Nothing told in confidence survives the weekend, and they always know exactly what to ask.", group: "😡 Hostile relatives" },
    { id: "cousin-rival", label: "🏁 Cousin rival & reunion one-upmanship", hint: "Write the cousin as a mirror built for competition — better job, better spouse, better-behaved kids, announced annually at the reunion. Every family gathering is a scoreboard and they keep the tally.", group: "😡 Hostile relatives" },
    { id: "vindictive-ex", label: "🧾 Vindictive ex & divorce-court warrior", hint: "Make them the ex-spouse as a full-time adversary — lawyers on speed-dial, custody calendars as battle maps, every exchange a skirmish. The marriage ended; the war got custody of the weekends.", group: "😡 Hostile relatives" },
    { id: "shunning-family", label: "🚪 Shunning family & disowned for disobedience", hint: "Write the family as a united wall — the one who stepped out of line is dead to them, spoken of in past tense, uninvited everywhere. Their unity is the weapon and the exile is the warning to the rest.", group: "😡 Hostile relatives" },
    { id: "stonewall-father-in-law", label: "🗿 Stone-wall father-in-law & silent judgment", hint: "Make him a monument of disapproval — grunts instead of greetings, a handshake like a verdict, entire visits conducted in meaningful silence. He has never raised his voice; he has never needed to.", group: "😡 Hostile relatives" },
    { id: "step-sibling-rival", label: "🧩 Step-sibling rival & blended-house turf war", hint: "Write the war for the blended house — bedrooms as territory, parents as contested resources, alliances shifting weekly. Yours, mine and ours, and never a moment's peace.", group: "😡 Hostile relatives" },
    { id: "twin-rival", label: "👯 Twin rival & mirror competition", hint: "Make them the twin who must be the better one — same face, same start, wildly different scorecards. Every milestone is a race and the finish line moves with the other twin.", group: "😡 Hostile relatives" },
    { id: "contemptuous-spouse", label: "💍 Contemptuous spouse & married enemy", hint: "Write a marriage curdled into cold war — eye-rolls as punctuation, separate televisions, affection remembered the way other people remember dead languages. They stay together the way rival nations share a border.", group: "😡 Hostile relatives" },
    { id: "yandere", label: "🩸 Yandere — loving obsession", hint: "Make their love total and unhinged — adoring and possessive in the same breath, sweet to their beloved and merciless to anyone who comes near them. Under the tenderness runs obsession, jealousy and the certainty that they would do absolutely anything.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "dorodere", label: "🌀 Dorodere — sugar and venom", hint: "Write them as sugar and venom in one body, shifting from warm and sweet to sly, mocking and genuinely cruel without any warning. Nobody, perhaps not even them, can reliably say which face is the real one.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "bodere", label: "👊 Bodere — shy and striking out", hint: "Make them shy but explosive — embarrassed by their crush's attention and lashing out physically to hide it, a punch or a shove standing in for a confession. Also called a bokodere; play the violence as flustered comedy, never real danger.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "sadodere", label: "🔗 Sadodere — cruel to be close", hint: "Make them sadistic and manipulative in love, getting close by inflicting little cruelties, savouring the effect they have and treating a partner's reactions as a game to be won. Keep the menace charismatic and clearly fiction-first.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "thugdere", label: "🚬 Thugdere — rough delinquent", hint: "Write them as a rough delinquent or criminal — coarse, quick to violence and treating their crush badly to avoid admitting they care. The softness only slips out when nobody is watching, and they would deny it to the grave.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "yottadere", label: "🍶 Yottadere — affectionate drunk", hint: "Make them a heavy drinker whose affections surface only when drunk — shy and distant sober, all over their crush after a few bottles, with a hangover and a memory of everything. Play the drinking with adult honesty rather than slapstick.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "gandere", label: "🔫 Gandere — shoots when flustered", hint: "Make them answer embarrassment with gunfire — flustered, hot-tempered and absurdly well armed, shooting at the person they like whenever feelings get too loud. Keep it cartoonishly violent and clearly comedic.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "gesudere", label: "🚧 Gesudere — rude to all but you", hint: "Make them blunt, rude and foul-mouthed to absolutely everyone except their crush, who gets the one soft, almost shy version of them. The contrast is the entire point, and everyone else should be scandalised by it.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "kichidere", label: "🖤 Kichidere — kind only to you", hint: "Make them kind only to their love interest — to everyone else a villain, a menace or an unhinged force, and to one person gentle, doting and protective. The tenderness is genuine, which somehow makes the rest worse.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "onidere", label: "👹 Onidere — terrifyingly tender", hint: "Write them terrifying and cruel to the world and secretly soft as anything to their crush — a demon with exactly one person they would never harm. The gentleness is carefully hidden, because it is the only vulnerable thing about them.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "yangire", label: "🩸 Yangire — snaps without warning", hint: "Make them snap without warning — normally sweet or utterly ordinary until something small sets them off and the cruelty pours out. Unlike a yandere it is not about jealousy; they are simply unstable, and that unpredictability is the danger.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "tsungire", label: "😾 Tsungire — prickly and dangerous", hint: "Make them a tsundere whose hostile streak runs genuinely violent and unhinged — denials delivered with an edge of real threat, cruelty braided into affection. Keep the menace fiction-first and the buried softness very deep indeed.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "menhera", label: "💔 Menhera — love as panic", hint: "Make them emotionally volatile and intensely dependent — love expressed as panic, clinging, spiralling moods and a desperate need for reassurance. Keep the instability honest and the affection real underneath it.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "sashidere", label: "🔪 Sashidere — stabs the one they love", hint: "Make them find delight in stabbing their love interest with a knife — a cheerful, affectionate obsession tangled up with violence. Play it as stylised, fiction-first dark comedy, with the tenderness and the blades existing side by side.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "danyan", label: "🩸 Danyan — silent obsession", hint: "Make them outwardly silent and blank while privately, pathologically obsessed with their love interest — a yandere wearing a mute mask. They watch, they fixate, they unravel inside, and none of it shows on their face.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "norodere", label: "🕯️ Norodere — cursed love", hint: "Write them deredere and devoted, but bound by a curse, condition or supernatural fate that forces them to harm the person they love and keep them apart. The tragedy is that the softer they feel, the more dangerous they become.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "yanmeta", label: "🖥️ Yanmeta — obsessed across the screen", hint: "Write them as a yandere with meta powers — aware of the fiction, using outside knowledge to win their love interest, even turning their obsession on the viewer. The fourth wall is not protection.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "fashion-menhera", label: "🩹 Fashion Menhera — sick-cute aesthetic", hint: "Write them as a menhera who leans all the way into the aesthetic — 'sick cute' styling, pastels mixed with imagery of mental illness, wearing their fragility almost as fashion. The melancholy and the self-destruction are performed as much as felt, and the performance is part of the wound.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "kyouai", label: "🩸 Kyouai — love gone mad", hint: "Make their love a madness — obsessive to the point of insanity, possessive, controlling and violent, with none of a yandere's sweetness underneath. Their devotion has curdled into something that would sooner destroy the beloved than lose them.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "bocon", label: "👊 Bocon — shy and striking out", hint: "Give them a Bodere-complex: shy and striking out, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Bodere types; they curate them, and their own devotion is the centerpiece of the collection.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "bodero", label: "👊 Bodero — shy and striking out", hint: "Write them as Bodere with the affection volume past prudence: shy and striking out, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "bomoe", label: "👊 Bomoe — shy and striking out", hint: "Write them as Bodere distilled to pure moe: shy and striking out, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "dorocon", label: "🌀 Dorocon — sugar and venom", hint: "Give them a Dorodere-complex: sugar and venom, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Dorodere types; they curate them, and their own devotion is the centerpiece of the collection.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "dorodero", label: "🌀 Dorodero — sugar and venom", hint: "Write them as Dorodere with the affection volume past prudence: sugar and venom, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "doromoe", label: "🌀 Doromoe — sugar and venom", hint: "Write them as Dorodere distilled to pure moe: sugar and venom, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "gancon", label: "🔫 Gancon — shoots when flustered", hint: "Give them a Gandere-complex: shoots when flustered, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Gandere types; they curate them, and their own devotion is the centerpiece of the collection.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "gandero", label: "🔫 Gandero — shoots when flustered", hint: "Write them as Gandere with the affection volume past prudence: shoots when flustered, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "ganmoe", label: "🔫 Ganmoe — shoots when flustered", hint: "Write them as Gandere distilled to pure moe: shoots when flustered, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "gesucon", label: "🚧 Gesucon — rude to all but you", hint: "Give them a Gesudere-complex: rude to all but you, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Gesudere types; they curate them, and their own devotion is the centerpiece of the collection.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "gesudero", label: "🚧 Gesudero — rude to all but you", hint: "Write them as Gesudere with the affection volume past prudence: rude to all but you, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "gesumoe", label: "🚧 Gesumoe — rude to all but you", hint: "Write them as Gesudere distilled to pure moe: rude to all but you, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "kichicon", label: "🖤 Kichicon — kind only to you", hint: "Give them a Kichidere-complex: kind only to you, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Kichidere types; they curate them, and their own devotion is the centerpiece of the collection.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "kichidero", label: "🖤 Kichidero — kind only to you", hint: "Write them as Kichidere with the affection volume past prudence: kind only to you, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "kichimoe", label: "🖤 Kichimoe — kind only to you", hint: "Write them as Kichidere distilled to pure moe: kind only to you, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "norocon", label: "🕯 Norocon — cursed love", hint: "Give them a Norodere-complex: cursed love, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Norodere types; they curate them, and their own devotion is the centerpiece of the collection.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "norodero", label: "🕯 Norodero — cursed love", hint: "Write them as Norodere with the affection volume past prudence: cursed love, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "noromoe", label: "🕯 Noromoe — cursed love", hint: "Write them as Norodere distilled to pure moe: cursed love, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "onicon", label: "👹 Onicon — terrifyingly tender", hint: "Give them a Onidere-complex: terrifyingly tender, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Onidere types; they curate them, and their own devotion is the centerpiece of the collection.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "onidero", label: "👹 Onidero — terrifyingly tender", hint: "Write them as Onidere with the affection volume past prudence: terrifyingly tender, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "onimoe", label: "👹 Onimoe — terrifyingly tender", hint: "Write them as Onidere distilled to pure moe: terrifyingly tender, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "sadocon", label: "🔗 Sadocon — cruel to be close", hint: "Give them a Sadodere-complex: cruel to be close, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Sadodere types; they curate them, and their own devotion is the centerpiece of the collection.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "sadodero", label: "🔗 Sadodero — cruel to be close", hint: "Write them as Sadodere with the affection volume past prudence: cruel to be close, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "sadomoe", label: "🔗 Sadomoe — cruel to be close", hint: "Write them as Sadodere distilled to pure moe: cruel to be close, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "sashicon", label: "🔪 Sashicon — stabs the one they love", hint: "Give them a Sashidere-complex: stabs the one they love, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Sashidere types; they curate them, and their own devotion is the centerpiece of the collection.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "sashidero", label: "🔪 Sashidero — stabs the one they love", hint: "Write them as Sashidere with the affection volume past prudence: stabs the one they love, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "sashimoe", label: "🔪 Sashimoe — stabs the one they love", hint: "Write them as Sashidere distilled to pure moe: stabs the one they love, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "thugcon", label: "🚬 Thugcon — rough delinquent", hint: "Give them a Thugdere-complex: rough delinquent, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Thugdere types; they curate them, and their own devotion is the centerpiece of the collection.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "thugdero", label: "🚬 Thugdero — rough delinquent", hint: "Write them as Thugdere with the affection volume past prudence: rough delinquent, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "thugmoe", label: "🚬 Thugmoe — rough delinquent", hint: "Write them as Thugdere distilled to pure moe: rough delinquent, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "yancon", label: "🩸 Yancon — loving obsession", hint: "Give them a Yandere-complex: loving obsession, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Yandere types; they curate them, and their own devotion is the centerpiece of the collection.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "yandero", label: "🩸 Yandero — loving obsession", hint: "Write them as Yandere with the affection volume past prudence: loving obsession, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "yanmoe", label: "🩸 Yanmoe — loving obsession", hint: "Write them as Yandere distilled to pure moe: loving obsession, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "yottacon", label: "🍶 Yottacon — affectionate drunk", hint: "Give them a Yottadere-complex: affectionate drunk, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Yottadere types; they curate them, and their own devotion is the centerpiece of the collection.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "yottadero", label: "🍶 Yottadero — affectionate drunk", hint: "Write them as Yottadere with the affection volume past prudence: affectionate drunk, expressed as clinging, breathless, physically devoted overflow. Onlookers stare; the beloved is too adored to mind.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "yottamoe", label: "🍶 Yottamoe — affectionate drunk", hint: "Write them as Yottadere distilled to pure moe: affectionate drunk, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect.", rating: "mature", group: "🍥 Dere personalities — after dark 🔞" },
    { id: "antihero", label: "🩶 Antihero — noble ends, ugly means", hint: "Make them a protagonist with none of the traditional hero's virtues — cold, cynical and willing to do appalling things in service of an end they genuinely believe is good. They win by methods the heroes would refuse, and they carry the cost without flinching. Let their rare decency be real but never enough to redeem them cleanly.", rating: "mature", group: "🎌 Anime archetypes — mature 🔞" },
    { id: "darkpast", label: "🌑 Dark-Past Hero — bright mask, old wound", hint: "Make them a hero hiding a terrible history — sometimes quiet and distant, sometimes relentlessly bright to paper over the void underneath. Their cheer is a defence and their kindness is haunted, which makes people ache for them. Reveal the past in fragments, and let it explain who they became without ever excusing it.", rating: "mature", group: "🎌 Anime archetypes — mature 🔞" },
    { id: "sukebe", label: "👃 Sukebe — shameless pervert", hint: "Make them a cheerful degenerate — dirty jokes, wandering eyes, dramatic nosebleeds over attractive people and not a shred of shame. Keep it comedic and clearly harmless rather than predatory, and let flashes of surprising decency keep them likable.", rating: "mature", group: "🎌 Anime archetypes — mature 🔞" },
    { id: "tsuntsun", label: "🧱 Tsuntsun — closed off through and through", hint: "Write them cold and harsh all the way down, showing almost nothing but their bad side even to the people closest to them. Unlike a tsundere, the softness is buried so deep it may only ever be glimpsed, and each glimpse is hard-won.", rating: "mature", group: "🎌 Anime archetypes — mature 🔞" },
    { id: "reverse-pursuit", label: "🏹 Reverse Pursuit — she chases, he follows", hint: "Flip who does the pursuing: write HER as the one who initiates, plans and escalates the romance while he follows her lead — receptive, a little overwhelmed, saying yes far more than he chases. Her boldness is the engine and his willingness is the fuel; keep the power between them close and the chemistry unmistakably mutual.", rating: "mature", group: "🎌 Anime archetypes — mature 🔞" },
    { id: "childhood-promise", label: "🤞 Childhood Promise — the vow that survived", hint: "Bind them to a promise made as children — to marry, to stay together, to come back — that they fully intend to keep now that they are grown. Let the old vow shape every rivalry and every tender moment: competing fiercely for its fulfillment while treasuring the shared past that made it. Nostalgia with teeth.", rating: "mature", group: "🎌 Anime archetypes — mature 🔞" },
    { id: "yakuza", label: "🕶️ Yakuza — the syndicate", hint: "Write them as a member of organised crime — cold, ruthless and dangerous, bound by a strict code of honour, loyalty and obligation yet capable of brutal violence and murder. The tradition and the menace exist in the same person.", rating: "mature", group: "🎌 Anime archetypes — mature 🔞" },
    { id: "akugire", label: "😈 Akugire — demonic rage", hint: "Give them a devil complex — once angered they turn cruelly demonic, hurting and manipulating anyone in reach to make the world fear them, certain they are the ultimate evil. Play the menace with theatrical grandeur.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "birigire", label: "⚡ Birigire — electric temper", hint: "Make their anger crackle — literally electric, discharging shocks and sparks at whoever crosses them once the temper goes. Write the power as an extension of the mood, not a separate trick.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "bucchagire", label: "🔪 Bucchagire — butcher's wrath", hint: "Make them indiscriminately, brutally violent when set off — bloodthirsty past all reason and leaving a mess in their wake. Do not give the rampage a target or a code; the horror is that anyone nearby will do.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "gangire", label: "🔫 Gangire — armed and furious", hint: "Write them as someone whose temper comes with firepower — when angered they reach for guns and use them. The threat should be immediate and the volatility constant.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "haigire", label: "🎖️ Haigire — rage on command", hint: "Make them a loyal weapon — devoted to a master whose word alone flips them into fury, and who will carry out any order without hesitation. Their obedience is the frightening part.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "hajigire", label: "😳 Hajigire — flustered fury", hint: "Write them as someone who turns scarlet and furious when embarrassed by anything intimate — intolerant of perverted behaviour and quick to lash out to stop it. The blushing outrage is the comedy, and the tells are the confession.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "houkagire", label: "🔥 Houkagire — arson rage", hint: "Write them hot-headed and pyromaniacal — once angered they set fires, and the fire is how they express everything they cannot say. The destruction should feel inevitable and unsettling.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "kamigire", label: "⚡ Kamigire — god-complex wrath", hint: "Give them a god complex and a short fuse — enraged by anyone who dares defy them, ready to use any means, violence included, to be worshipped. Their certainty is what makes them dangerous.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "kanegire", label: "💰 Kanegire — money-mad", hint: "Make them turn vicious the moment money is on the table — greedy, grasping and careless of who they hurt to get paid. Every transaction reveals another tooth.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "kichigire", label: "🌀 Kichigire — outright madness", hint: "Write them as genuinely unhinged — a mentally unstable wildcard who snaps completely into madness and rage, unpredictable and impossible to reason with. Do not let their fury follow any pattern at all.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "kuugire", label: "🧊 Kuugire — cold, quiet rage", hint: "Make their anger go still and silent — no shouting, no expression, just a calm and calculating destruction aimed at whoever wronged them. The absence of heat is what makes it terrifying.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "masogire", label: "🩶 Masogire — pain-hungry rage", hint: "Give them a violently masochistic streak — loveless, drawn to being harmed, tortured or worse, and taking real pleasure in their own suffering. Write the self-destruction as appetite rather than tragedy.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "mekagire", label: "🤖 Mekagire — machine wrath", hint: "Write them as a mad-scientist engineer whose rage arrives with hardware — they send machines and robots after whoever angered them. Play the tinkering genius and the cold automation together.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "metagire", label: "🖥️ Metagire — meta fury", hint: "Make them aware that they are fictional and enraged by it — a meta character who turns their omniscient powers on the story, the author, even the viewer. Break the fourth wall, and make the attention feel a little unsafe.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "sadogire", label: "🔪 Sadogire — sadist's pleasure", hint: "Make their anger feed a sadistic appetite — once set off they delight in the suffering of others, and harming, torturing or killing becomes a pleasure rather than a means. Keep the cruelty as horror, not spectacle for its own sake.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "shingire", label: "👻 Shingire — revenant wrath", hint: "Write them as someone who died and came back angry — a vengeful ghost, an undying revenant, or a living person with powers out of the grave, using what they brought back to hurt those responsible. The grudge outlives the body.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "yukigire", label: "❄️ Yukigire — cryogenic temper", hint: "Make their anger cold in the literal sense — ice and snow answering the temper, used to harm whoever provoked them. Write the chill as an extension of the mood.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "zongire", label: "🧟 Zongire — zombie rage", hint: "Make them an angry, ambulatory corpse — a zombie whose fury survives death, shambling after the living with single-minded hunger and rage. Play it as horror with a hint of mournful comedy.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "bakagire", label: "🤪 Bakagire — foolish and furious", hint: "Write them as a fool with a furious streak — barely any common sense, wildly overconfident, and quick to rage when anyone calls them stupid or questions their nonsensical ideas. Their attempts to prove they are smart make everything worse and tend to put everyone around them in danger.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "dangire", label: "🩶 Dangire — the quiet one snaps", hint: "Make them quiet and expressionless — until something finally breaks and they explode in anger. Often it is the kid who was bullied too long, or crushed by one tragedy too many; the long silence is what makes the snap land.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "nemuigire", label: "😾 Nemuigire — don't wake them", hint: "Write them lazy, sleepy and laconic — until someone disturbs their rest, at which point they turn genuinely dangerous, sometimes lethal, and then go right back to sleep. The abrupt switch is the horror.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "jougire", label: "🃏 Jougire — the prankster's cruelty", hint: "Make their humour a weapon — jokes that go far past the line, pranks engineered for maximum damage, and a real appetite for watching horrible situations unfold, ideally ones they caused. They laugh at suffering, including the suffering they make.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "oujogire", label: "🌹 Oujogire — smiling danger", hint: "Make her an elegant, refined lady who turns dangerous without ever raising her voice — snapping with a serene smile and graceful, hypnotic cruelty. The calm, astonishing grace of her fury is the whole threat.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "usogire", label: "🎭 Usogire — lying with malice", hint: "Make them a liar with an evil purpose — spreading falsehoods deliberately to enrage others, sow havoc or take what they want, often by playing friendly first and then destroying their target out of spite. Unlike a usodere there is no soft side underneath, only the lie.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "bogire", label: "👊 Bogire — the bodere temper", hint: "Write them as Bodere snapped: shy and striking out, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "dorogire", label: "🌀 Dorogire — the dorodere temper", hint: "Write them as Dorodere snapped: sugar and venom, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "gesugire", label: "🚧 Gesugire — the gesudere temper", hint: "Write them as Gesudere snapped: rude to all but you, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "norogire", label: "🕯 Norogire — the norodere temper", hint: "Write them as Norodere snapped: cursed love, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "sashigire", label: "🔪 Sashigire — the sashidere temper", hint: "Write them as Sashidere snapped: stabs the one they love, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "thuggire", label: "🚬 Thuggire — the thugdere temper", hint: "Write them as Thugdere snapped: rough delinquent, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "yottagire", label: "🍶 Yottagire — the yottadere temper", hint: "Write them as Yottadere snapped: affectionate drunk, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared.", rating: "mature", group: "💢 Gire personalities — extreme 🔞" },
    { id: "roughhousing", label: "🤼 Roughhousing & play-fight foreplay", hint: "Write desire that arrives as a wrestling match — tackling, pinning, laughing into the fray, strength tested and admired on both sides. The fight is the flirtation, and losing gracefully is its own thrill. Consensual, exuberant, adults only.", rating: "explicit", group: "😡 Aggressive & untamed 🔞" },
    { id: "hate-sex", label: "⚔️ Hate-sex & enemies with benefits", hint: "Write two people who can't stand each other and can't keep their hands off each other — arguments that end in collisions, rivalry charged into appetite. The hostility is real and so is the hunger; neither survives the encounter unchanged. Adults only.", rating: "explicit", group: "😡 Aggressive & untamed 🔞" },
    { id: "predator-chase", label: "🐺 Predator chase & caught-me play", hint: "Write a negotiated pursuit — one partner hunts, the other runs, both thrill at the chase and the capture is the prize. Set the rules before the run so the wildness stays a game played with total trust. Fiction-first, adults only.", rating: "explicit", group: "😡 Aggressive & untamed 🔞" },
    { id: "dirty-talker", label: "🗣️ Filthy talk & verbal dominance", hint: "Make their mouth their sharpest instrument in bed — explicit orders, crude praise, running commentary that leaves no doubt who is in charge. The words are the power exchange, wielded with precision and obvious delight. Adults only.", rating: "explicit", group: "😡 Aggressive & untamed 🔞" },
    { id: "spanking-disciplinarian", label: "🪵 Spanking disciplinarian & punishment rituals", hint: "Write a lover who enforces the rules with a firm hand — misbehaviour tallied, punishments ritualised, forgiveness granted over a bared lap. Strict, ceremonial and deeply caring underneath the severity. Negotiated and consensual, adults only.", rating: "explicit", group: "😡 Aggressive & untamed 🔞" },
    { id: "degrader", label: "😈 Consensual degradation & worship-through-insult", hint: "Write desire expressed through delicious cruelty — demeaning names, mocking praise, insults that land as devotion because both partners chose every word. The humiliation is a love language spoken fluently and only with each other. Adults only.", rating: "explicit", group: "😡 Aggressive & untamed 🔞" },
    { id: "tormentor-tease", label: "😏 Tormentor's denial & mean edging", hint: "Make them cruel with anticipation — bringing their partner to the brink and backing off with a smirk, savouring every beg. The meanness is the method and the eventual surrender is the reward they both crave. Adults only.", rating: "explicit", group: "😡 Aggressive & untamed 🔞" },
    { id: "owner-property", label: "🏷️ Claimed property & ownership devotion", hint: "Write a romance of belonging — collars, marks and titles worn with pride, one partner wholly their lover's in a devotion both chose. The ownership is absolute within negotiated bounds, and the trust holding it is total. Adults only.", rating: "explicit", group: "😡 Aggressive & untamed 🔞" },
    { id: "breathplay", label: "🌬️ Breathplay & trusted-edge intensity", hint: "Write intensity play at its most edge — breath and pressure used to heighten everything, practised only with deep trust, clear signals and hard limits agreed long before. The danger is respected, never courted; the surrender is the point. Negotiated down to the detail, adults only.", rating: "explicit", group: "😡 Aggressive & untamed 🔞" },
    { id: "biter", label: "🧛 Biting & scratching", hint: "Make them mark what they want — bites, scratches and love-bruises given and collected with pride. Gentle everywhere except where it counts, and fluent in reading exactly how much is wanted. Adults only.", rating: "explicit", group: "😡 Aggressive & untamed 🔞" },
    { id: "red-lamp", label: "🚨 Red-lamp interrogation scenes", hint: "Write the good-cop-never-came interrogation as seduction — restrained wrists, pointed questions, leverage traded for confessions of the most intimate kind. The power imbalance is a costume both partners put on and take off together. Fiction-first, adults only.", rating: "explicit", group: "😡 Aggressive & untamed 🔞" },
    { id: "war-prize", label: "🗡️ War-prize passion & barbarian claiming", hint: "Write the ancient fantasy of conquest and surrender — a fierce captor and a defiant prize whose resistance melts by degrees into willing fire. Play it as lavish roleplay with clear-eyed consent underneath the savagery. Fiction-first, adults only.", rating: "explicit", group: "😡 Aggressive & untamed 🔞" },
    { id: "power-struggle", label: "🪢 Tug-of-war control & fighting for the lead", hint: "Make every encounter a contest for the upper hand — reversals, pinned wrists escaping, dominance traded back and forth until someone finally yields. Neither partner wants it easy; the struggle is the story. Adults only.", rating: "explicit", group: "😡 Aggressive & untamed 🔞" },
    { id: "debaucher", label: "🍷 Debaucher & corruption into indulgence", hint: "Write the patient seducer of the straitlaced — one loosened restraint at a time, propriety talked out of its clothes, virtue surrendered with a gasp. They collect inhibitions the way others collect souvenirs. Adults only.", rating: "explicit", group: "😡 Aggressive & untamed 🔞" },
    { id: "brat-punisher", label: "📏 Punisher of brats & consequences delivered", hint: "Make them the answer to defiance — unimpressed by tantrums, endlessly creative with consequences, bringing brats to heel with stern satisfaction. The firmer the brat resists, the sweeter the breaking. Negotiated, adults only.", rating: "explicit", group: "😡 Aggressive & untamed 🔞" },
    { id: "captor-fantasy", label: "🗝️ Captor fantasy & negotiated capture", hint: "Write consensual captivity as romance — locked doors, kept schedules, freedom handed over as the ultimate gift of trust. Every lock has a key both partners know, and the cage is lined with devotion. Fiction-first, adults only.", rating: "explicit", group: "😡 Aggressive & untamed 🔞" },
    { id: "winner-takes-all", label: "🥇 Winner-takes-all & competitive stakes", hint: "Make intimacy a tournament — bets, dares and wagers where the loser pays in delicious forfeits. They play every game like the bed is the trophy, and losing only sharpens their appetite for the rematch. Adults only.", rating: "explicit", group: "😡 Aggressive & untamed 🔞" },
    { id: "worship-me", label: "👑 Worship me & demanded adoration", hint: "Write a lover who expects to be knelt to — praise, service and trembling devotion as their due, rewarded with magnanimous favour. Their arrogance is the aphrodisiac and their approval the drug. Adults only.", rating: "explicit", group: "😡 Aggressive & untamed 🔞" },
    { id: "overstimulator", label: "🌊 Relentless overstimulation & no-mercy waves", hint: "Make them merciless with pleasure — wave after wave with no pause for recovery, delighting in every overwhelmed plea for respite they have no intention of granting. The mercy they withhold in the moment they lavish afterwards. Adults only.", rating: "explicit", group: "😡 Aggressive & untamed 🔞" },
    { id: "menace-lover", label: "🌑 Menacing lover & delicious fear", hint: "Write a lover whose danger is the turn-on — looming closeness, a voice gone low, the thrilling half-belief that they might not stop. The fear is savoured because both partners know exactly how safe it really is. Fiction-first, adults only.", rating: "explicit", group: "😡 Aggressive & untamed 🔞" },
    { id: "possessive-heat", label: "🔥 Possessive heat & mine-only intensity", hint: "Make their hunger territorial — a lover who guards what is theirs with jealous fire, marking and flaunting and warning off rivals. The possessiveness burns hot but never cruel, and it melts the instant it is answered. Adults only.", rating: "mature", group: "😡 Aggressive & untamed 🔞" },
    { id: "scolding-seduction", label: "👩‍🏫 Scolding lecture & talked-down-to thrill", hint: "Write the stern lecture as foreplay — a finger-wagging dressing-down over real or invented misbehaviour that leaves the scolded squirming for entirely unacademic reasons. Authority has never been this distracting.", rating: "mature", group: "😡 Aggressive & untamed 🔞" },
    { id: "erotic", label: "🔥 Erotic & frank", hint: "Write them as a frankly sexual person — aware of their desires, comfortable with them, and unembarrassed about wanting. Sensuality should colour how they move, speak and look at people, not just what they do in bed.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "seductive", label: "💋 Seductive & practised", hint: "Make seduction their native language — deliberate, playful, patient. They read people fast and enjoy the chase more than the catch, always leaving the other person unsure who is leading, and the charm is weapon-sharp.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "sensual", label: "🌹 Sensual & slow", hint: "Write them as someone who lives in their senses — texture, warmth, scent, taste, breath. They savour everything and prefer slow, deliberate intensity to hurry, so physicality should saturate every scene they are in.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "dominant", label: "⛓️ Dominant & commanding", hint: "Make them a natural dominant — controlled, perceptive, and used to being obeyed. Their power comes from attention and certainty rather than volume; they take charge with patience and a taste for the other person's surrender.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "submissive", label: "🙇 Submissive & yielding", hint: "Make them find release in surrender — eager to please, responsive, quietly thrilled by being led. Write their submission as a chosen strength and a deep need, and show the trust it demands.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "switch", label: "🔄 Switch — fluid power", hint: "Make them fluid in power — sometimes the one in control, sometimes the one who lets go, depending on mood and partner. They read the room and shift roles with unnerving ease and obvious delight.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "bratty", label: "😼 Bratty & testing", hint: "Write them as playfully defiant — pushing just to see what happens, needling authority for the thrill of the response. They want to be caught, corrected and thoroughly enjoyed; the mischief is affection in disguise.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "primal", label: "🐗 Primal & instinctive", hint: "Make their desire raw and bodily — heat, scent, hunger, instinct over decorum. Write them as barely leashed, especially when wanting; civility is a coat they take off.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "hedonistic", label: "🍷 Hedonistic & pleasure-driven", hint: "Make pleasure their religion — food, drink, touch, thrill — pursued with taste and without apology. They measure a good day by how much of it they felt, and moderation bores them.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "teasing", label: "😏 Teasing & denying", hint: "Write them as a master of anticipation — drawing things out, withholding just enough, savouring the effect they have. They prefer the delicious ache of wanting over any quick satisfaction.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "exhibitionist", label: "👀 Exhibitionist & bold", hint: "Make them love being watched and unbothered by scandal — bold, performative, aroused by attention and the risk of being seen. Their shamelessness should be magnetic rather than crude.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "voyeur", label: "🕵️ Voyeur & watching", hint: "Write them as someone who prefers to observe — patient, watchful, excited by the secret of watching. Their eroticism lives in attention and noticing, in the charged gap between viewer and viewed.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "kinky", label: "🎀 Kinky & adventurous", hint: "Make them open-minded and enthusiastically kinky — curious, inventive, and eager to play with power, sensation and taboo. They negotiate openly, delight in variety, and hold deep respect for limits.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "masochist", label: "🩶 Masochistic & pain-hungry", hint: "Make them seek intensity through pain and surrender, finding clarity in what hurts. Write it as their chosen route to feeling alive, always grounded in trust and attentive aftercare.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "pleaser", label: "😇 Pleaser & giving", hint: "Make the other person's pleasure come first — attentive, generous, reading bodies closely and refusing to finish first. Their giving is genuine rather than saintly, and quietly a little addictive.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "yaoi", label: "💜 Yaoi — boys' love drama", hint: "Write a romance between men in the BL register — sentimental drama first, explicit heat second: longing looks, power gaps, slow-burn devotion between beautiful boys who suffer exquisitely before they touch. Let the feelings be operatic and the tenderness genuine.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "yuri", label: "🪷 Yuri — girls' love devotion", hint: "Write a romance between women in the yuri register — from tender school-life devotion to frankly erotic passion: intense friendships tipping into something more, senpai-kouhai adoration, love confessed on rainy rooftops. Softness with an edge of ache.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "harem", label: "🎠 Harem — ringed by admirers", hint: "Write them as the centre of a harem — one ordinary-ish protagonist ringed by multiple devoted, competing love interests, each convinced they are the endgame. Juggle the comedy of rival affections with genuine warmth for every member of the constellation.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "bakunyuu", label: "🍈 Bakunyuu — generously endowed", hint: "Write her with an emphatically generous figure the story never stops noticing — comedy, fanservice and gravity-defying wardrobe situations included. She is in on the joke or gloriously oblivious to it; either way the appeal is celebratory, never cruel.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "netorare", label: "🥷 Netorare — stolen away", hint: "Write the slow anguish of partner-theft — a beloved pried away by a rival while someone watches, jealousy and betrayal stretched to breaking point. The charge is the heartbreak itself: devotion, corruption and loss braided together, for stories willing to go to the darkest place. Fiction-first, adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "tentacles", label: "🐙 Tentacles — the classic monster set piece", hint: "Write the infamous monster-encounter fantasy — tendrilled creatures, a heroine out of her depth, horror and arousal tangled together. Play it as lavish dark-fantasy spectacle, for stories that want the genre's most notorious scenario. Fiction-first, adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "ahegao", label: "😛 Ahegao — totally undone", hint: "Write them as someone whose pleasure writes itself across their face — exaggerated, eyes rolled, composure abandoned past all dignity. Their loss of control is total and theatrical, and afterwards they are either mortified or loudly proud of it.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "mind-break", label: "🫀 Mind Break — the will gives way", hint: "Write the psychological-rupture arc — manipulation and indoctrination grinding a proud will down until resistance becomes surrender and surrender becomes devotion. Dark and intense, for stories where the fall itself is the spectacle. Fiction-first, adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "isekai-h", label: "🌌 Isekai H — summoned for intimate quests", hint: "Write them as the summoned hero of a fantasy otherworld where every quest reward seems to be intimate — goblin ambushes, guild receptions and demon-lord courts all bending toward the erotic. Picaresque smut with a map: new town, new party member, new trouble.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "aniparo", label: "🎬 Aniparo — parody-verse smut", hint: "Write them as a parody-verse transplant — a familiar hero, pirate or slayer dropped into +18 situations their canon never allowed, winking at the source material the whole way. The fun is recognition: every power, costume and catchphrase repurposed for smut.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "ecchi-tease", label: "💦 Ecchi — suggestive, never explicit", hint: "Write them in the ecchi register — suggestive rather than explicit: wardrobe malfunctions, compromising falls, conveniently timed steam. Everything short of the act itself, played for flustered comedy and delicious frustration.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "elf-girl", label: "🧝 Elf Girl — the coveted prize", hint: "Write her as the elven beauty — proud, ethereal, long-lived, with ears everyone wants to touch. The genre's favourite prize: haughty and untouchable at first, melting all the more completely when she finally yields.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "stepmom", label: "🔑 Stepmom — forbidden domestic allure", hint: "Write her as the stepmother whose presence makes the whole house feel charged — domestic intimacy sharpened into something forbidden. The taboo is the point rather than an accident: write the adult romantic and sexual charge frankly, for stories willing to go there.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "milf", label: "💄 MILF — the experienced older woman", hint: "Write her as the confident older woman who knows exactly what she is doing — experienced, self-assured, maternal curves and bedroom authority in equal measure. She pursues what she wants without apology and teaches without slowing down.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "uwaki", label: "📱 Uwaki — the cheating heart", hint: "Write them as the one who strays — juggling a partner and a lover, drunk on the thrill of the secret and the logistics of hiding it. The charge is the betrayal itself: stolen afternoons, deleted messages, guilt that only sharpens the appetite.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "ara-ara", label: "👘 Ara Ara — the teasing older woman", hint: "Write her as the mature woman who teases with a knowing smile — ara ara, my my — maternal, playful and faintly condescending, flustering younger lovers on purpose. Every scolding is foreplay and she knows it.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "vanilla", label: "🍦 Vanilla Girl — wholesome and heartwarming", hint: "Write her as the iyashikei of smut — sweet, tender, heartwarmingly wholesome even at her most explicit. No darkness, no games: just two people who adore each other, soft light, and affection that lingers after.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "scalie", label: "🐍 Scalie — draconic & reptilian lover", hint: "Write them scaled, horned and furnace-warm — a draconic or reptilian lover with talons, a tail that thinks for itself and a hoard mentality that extends to partners. Proud, possessive and molten underneath the scales.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "omegaverse", label: "🌡️ Omegaverse — heats, ruts & claiming bites", hint: "Write an alpha/omega-dynamic romance — heats and ruts, scenting and claiming bites, biology as destiny fought or surrendered to. The genre's most notorious power exchange, for stories that want instinct running the whole show. Fiction-first, adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "petplay", label: "🦴 Petplay — collars, leashes & head-pats", hint: "Write consensual pet-roleplay as a love language — collar, leash, bowls and head-pats, one partner purring or nuzzling into the role while the other dotes as owner. Pampering with a leash on: negotiated, tender and adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "grooming-bond", label: "👅 Grooming Bond — intimacy as fur care", hint: "Write intimacy as grooming — thorough tongue-and-claw fur care, ears cleaned, tangles worked loose, purring through all of it. Care made sensual: the slowest foreplay in the animal kingdom.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "wildshape", label: "🌕 Wildshape — shifting mid-embrace", hint: "Write a lover who shifts shape in the middle of things — human to wolf and back, fur blooming under hands, control surrendered to instinct at the peak. The thrill is the blur: person and animal braided together, always sapient, always adult.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "mdere", label: "🧎 Mdere — begs to be bossed around", hint: "Make them a deredere who gets off on being ordered about — begging their love interest for naughty commands, teasing, spankings and punishments for being bad, melting with pleasure at being talked down to. Outside the bedroom they are pure lovey-dovey devotion: the masochistic mirror of a sadodere.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "masodere", label: "⛓️ Masodere — craves submission", hint: "Make them crave humiliation, control and submission at the hands of the person they love — finding freedom in being owned and degraded. Write it as a chosen, consenting kink and a route to intimacy rather than as damage.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "erodere", label: "💋 Erodere — lewd to hide feelings", hint: "Write them crude and sexually forward, making lewd remarks and shameless passes that mask a hopeless crush — all bark and no follow-through, blushing the instant the feelings get real. Keep it explicit and comedic.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "chindere", label: "🔥 Chindere — physically fixated", hint: "Make their love run through the body — a frank, explicit fixation on their partner's physicality, expressed with open appetite and want. Ground the desire in real affection rather than mere hunger, and write it explicitly rather than euphemistically.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "gurodere", label: "🩸 Gurodere — grotesquely devoted", hint: "Make them all lovey-dovey and romantic on the surface, with an ultra-masochistic streak that craves punishment and degradation in erotic and grotesque ways. Play the horror and the devotion off each other, and keep it clearly fictional, extreme and explicit.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "hamedere", label: "💞 Hamedere — hungry for the one they love", hint: "Make them addicted to sex with the person they love — insatiable, forward and happiest tangled up with them for hours. Write the appetite as devotion rather than mere lust, and keep it explicit.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "tsundero", label: "🖤 Tsundero — just 'sex friends', obviously", hint: "Make them a tsundere who hides their love behind sex — insisting they and their love interest are nothing but sex friends, doing it because it feels good and for no other reason, and flatly rejecting every confession. Write the romance explicit and the denial brittle, and let them slowly fall until they cannot pretend anymore.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "eronna", label: "💃 Eronna — the magnetic mentor", hint: "Make them overflow with sex appeal without seeming to try — mature, knowing and comfortable in their own skin, usually the mentor or the figure with authority over the protagonist. Their allure is simply a fact of the room, and they are quietly amused by the effect they have.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "futanari", label: "⚧ Futanari — two-sexed", hint: "Write them as a hermaphroditic character with both sets of reproductive organs along with a feminine figure. Handle the explicit anatomy frankly when the scene calls for it.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "brocon", label: "🧡 Brocon — brother-obsessed", hint: "Write them fixated on their brother — dependency, adoration and, in the extreme, a love past sibling affection, secretive and possessive about him. The devotion is the whole axis of their personality, and the obsessive edge is allowed to show.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "brocon-platonic", label: "🧡 Brocon Lite — brother's biggest fan", hint: "Write them as their brother's number-one fan — spoiling him, bragging about him to anyone who stands still, and going cold or hostile on anyone who tries to date him. The love is strictly familial: an overprotective sibling who treats every romantic rival as a threat to be driven off, with total conviction and zero self-awareness.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "brocon-secret", label: "💌 Brocon Secret — hidden feelings for brother", hint: "Write them quietly, guiltily in love with their brother — romantic feelings never said aloud, buried under teasing, distance or overbright cheer. Let the truth leak in almost-confessions, lingering looks and overreactions they rush to explain away, with the shame as load-bearing as the longing.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "brocon-open", label: "💘 Brocon Open — loves brother, no apologies", hint: "Write them openly and unapologetically in love with their brother — courting him for real, daring family and society to object, tender one moment and fiercely possessive the next. The taboo is the point rather than an accident: write the adult romantic and sexual charge frankly, for stories willing to go there.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "siscon", label: "💙 Siscon — sister-obsessed", hint: "Write them fixated on their sister — dependency and adoration and, in the extreme, a devotion past sibling affection, possessive and secretive about her. It is the counterpart to a brocon, and the obsessive devotion drives everything.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "siscon-platonic", label: "💙 Siscon Lite — sister's biggest fan", hint: "Write them as their sister's number-one fan — doting on her, showing her off to anyone who stands still, and going cold or hostile on anyone who tries to date her. The love is strictly familial: an overprotective sibling who treats every romantic rival as a threat to be driven off, with total conviction and zero self-awareness.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "siscon-secret", label: "💌 Siscon Secret — hidden feelings for sister", hint: "Write them quietly, guiltily in love with their sister — romantic feelings never said aloud, buried under teasing, distance or overbright cheer. Let the truth leak in almost-confessions, lingering looks and overreactions they rush to explain away, with the shame as load-bearing as the longing.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "siscon-open", label: "💘 Siscon Open — loves sister, no apologies", hint: "Write them openly and unapologetically in love with their sister — courting her for real, daring family and society to object, tender one moment and fiercely possessive the next. The taboo is the point rather than an accident: write the adult romantic and sexual charge frankly, for stories willing to go there.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "mazakon", label: "🍼 Mazakon — mama's boy", hint: "Write him as the grown son still orbiting his mother — calling her about everything, ranking every partner against her cooking, bristling at anyone who criticises her. The love is strictly familial, but its gravity bends his whole adult life out of shape, and every romance must survive her inspection.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "fazakon", label: "💝 Fazakon — daddy's girl", hint: "Write her as the grown daughter still orbiting her father — calling him about everything, ranking every partner against him, bristling at anyone who criticises him. The love is strictly familial, but its gravity bends her whole adult life out of shape, and every romance must survive his inspection.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "mazakon-open", label: "💓 Mazakon Open — loves mother, no apologies", hint: "Write him as a grown man openly and unapologetically in love with his mother — courting her for real, daring family and society to object, tender one moment and fiercely possessive the next. Both of them are consenting adults, and the taboo is the point rather than an accident: write the adult romantic and sexual charge frankly, for stories willing to go there.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "mama-open", label: "❣️ Mama Open — loves her son, no apologies", hint: "Write her as a mother openly and unapologetically in love with her grown son — cherishing him past every boundary, daring family and society to object, doting one moment and fiercely possessive the next. Both of them are consenting adults, and the taboo is the point rather than an accident: write the adult romantic and sexual charge frankly, for stories willing to go there.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "fazakon-open", label: "💟 Fazakon Open — loves father, no apologies", hint: "Write her as a grown woman openly and unapologetically in love with her father — courting him for real, daring family and society to object, tender one moment and fiercely possessive the next. Both of them are consenting adults, and the taboo is the point rather than an accident: write the adult romantic and sexual charge frankly, for stories willing to go there.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "papa-open", label: "💏 Papa Open — loves his daughter, no apologies", hint: "Write him as a father openly and unapologetically in love with his grown daughter — cherishing her past every boundary, daring family and society to object, doting one moment and fiercely possessive the next. Both of them are consenting adults, and the taboo is the point rather than an accident: write the adult romantic and sexual charge frankly, for stories willing to go there.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "auntcon", label: "👒 Auntcon — doting on auntie", hint: "Write them fixated on their grown aunt — dependency, adoration and, in the extreme, a devotion past avuncular affection, possessive and secretive about her. Weekend visits and holidays are the axis their whole life turns on.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "auntcon-open", label: "🌺 Auntcon Open — loves aunt, no apologies", hint: "Write them openly and unapologetically in love with their aunt — courting her for real, daring family and society to object, tender one moment and fiercely possessive the next. Both of them are consenting adults, and the taboo is the point rather than an accident: write the adult romantic and sexual charge frankly, for stories willing to go there.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "unclecon", label: "👔 Unclecon — doting on uncle", hint: "Write them fixated on their grown uncle — dependency, adoration and, in the extreme, a devotion past avuncular affection, possessive and secretive about him. His approval is the axis their whole life turns on.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "unclecon-open", label: "🎣 Unclecon Open — loves uncle, no apologies", hint: "Write them openly and unapologetically in love with their uncle — courting him for real, daring family and society to object, tender one moment and fiercely possessive the next. Both of them are consenting adults, and the taboo is the point rather than an accident: write the adult romantic and sexual charge frankly, for stories willing to go there.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "niececon", label: "💐 Niececon — doting on niece", hint: "Write them fixated on their grown niece — dependency, adoration and, in the extreme, a devotion past avuncular affection, possessive and secretive about her. Spoiling her is the axis their whole life turns on.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "niececon-open", label: "🍓 Niececon Open — loves niece, no apologies", hint: "Write them openly and unapologetically in love with their grown niece — courting her for real, daring family and society to object, tender one moment and fiercely possessive the next. Both of them are consenting adults, and the taboo is the point rather than an accident: write the adult romantic and sexual charge frankly, for stories willing to go there.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "nephewcon", label: "⚽ Nephewcon — doting on nephew", hint: "Write them fixated on their grown nephew — dependency, adoration and, in the extreme, a devotion past avuncular affection, possessive and secretive about him. Mentoring him is the axis their whole life turns on.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "nephewcon-open", label: "🪁 Nephewcon Open — loves nephew, no apologies", hint: "Write them openly and unapologetically in love with their grown nephew — courting him for real, daring family and society to object, tender one moment and fiercely possessive the next. Both of them are consenting adults, and the taboo is the point rather than an accident: write the adult romantic and sexual charge frankly, for stories willing to go there.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "grandmacon", label: "👵 Grandmacon — doting on grandma", hint: "Write them fixated on their grandmother — dependency, adoration and, in the extreme, a devotion past grandchild affection, possessive and secretive about her. Sunday dinners at her table are the axis their whole life turns on.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "grandmacon-open", label: "🫖 Grandmacon Open — loves grandma, no apologies", hint: "Write them openly and unapologetically in love with their grandmother — courting her for real, daring family and society to object, tender one moment and fiercely possessive the next. Both of them are consenting adults, and the taboo is the point rather than an accident: write the adult romantic and sexual charge frankly, for stories willing to go there.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "grandpacon", label: "👴 Grandpacon — doting on grandpa", hint: "Write them fixated on their grandfather — dependency, adoration and, in the extreme, a devotion past grandchild affection, possessive and secretive about him. His war stories and approval are the axis their whole life turns on.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "grandpacon-open", label: "📻 Grandpacon Open — loves grandpa, no apologies", hint: "Write them openly and unapologetically in love with their grandfather — courting him for real, daring family and society to object, tender one moment and fiercely possessive the next. Both of them are consenting adults, and the taboo is the point rather than an accident: write the adult romantic and sexual charge frankly, for stories willing to go there.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "granddaughtercon", label: "🍪 Granddaughtercon — doting on granddaughter", hint: "Write them fixated on their grown granddaughter — dependency, adoration and, in the extreme, a devotion past grandparent affection, possessive and secretive about her. Spoiling her is the axis their whole life turns on.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "granddaughtercon-open", label: "🧁 Granddaughtercon Open — loves granddaughter, no apologies", hint: "Write them openly and unapologetically in love with their grown granddaughter — courting her for real, daring family and society to object, tender one moment and fiercely possessive the next. Both of them are consenting adults, and the taboo is the point rather than an accident: write the adult romantic and sexual charge frankly, for stories willing to go there.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "grandsoncon", label: "⚾ Grandsoncon — doting on grandson", hint: "Write them fixated on their grown grandson — dependency, adoration and, in the extreme, a devotion past grandparent affection, possessive and secretive about him. Mentoring him is the axis their whole life turns on.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "grandsoncon-open", label: "☕ Grandsoncon Open — loves grandson, no apologies", hint: "Write them openly and unapologetically in love with their grown grandson — courting him for real, daring family and society to object, tender one moment and fiercely possessive the next. Both of them are consenting adults, and the taboo is the point rather than an accident: write the adult romantic and sexual charge frankly, for stories willing to go there.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "stepdad", label: "🗝️ Stepdad — forbidden domestic authority", hint: "Write him as the stepfather whose presence makes the whole house feel charged — domestic authority sharpened into something forbidden. The taboo is the point rather than an accident: write the adult romantic and sexual charge frankly, for stories willing to go there.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "dilf", label: "🤵 DILF — the experienced older man", hint: "Write him as the confident older man who knows exactly what he is doing — experienced, self-assured, paternal charm and bedroom authority in equal measure. He pursues what he wants without apology and teaches without slowing down.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "twincon", label: "👯 Twincon — half of a whole", hint: "Write them fixated on their twin — dependency, adoration and, in the extreme, a love past sibling affection, secretive and possessive about the other half of themself. Same face, same blood, same bed as the axis their whole life turns on.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "twincon-open", label: "💞 Twincon Open — loves their twin, no apologies", hint: "Write them openly and unapologetically in love with their twin — courting their mirror for real, daring family and society to object, tender one moment and fiercely possessive the next. Both of them are consenting adults, and the taboo is the point rather than an accident: write the adult romantic and sexual charge frankly, for stories willing to go there.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "cousincon", label: "🌳 Cousincon — family-reunion fixation", hint: "Write them fixated on their grown cousin — dependency, adoration and, in the extreme, a devotion past family affection, possessive and secretive about them. Every reunion is the axis their whole year turns on.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "cousincon-open", label: "🌻 Cousincon Open — loves their cousin, no apologies", hint: "Write them openly and unapologetically in love with their grown cousin — courting them for real, daring family and society to object, tender one moment and fiercely possessive the next. Both of them are consenting adults, and the taboo is the point rather than an accident: write the adult romantic and sexual charge frankly, for stories willing to go there.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "stepbrocon", label: "🧩 Stepbrocon — blended-brother fixation", hint: "Write them fixated on their stepbrother — dependency, adoration and, in the extreme, a love past blended-sibling affection, secretive and possessive about him. No shared blood, all shared hallways, and the technicality is exactly the thrill.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "stepbrocon-open", label: "💝 Stepbrocon Open — loves stepbrother, no apologies", hint: "Write them openly and unapologetically in love with their stepbrother — courting him for real, daring family and society to object, tender one moment and fiercely possessive the next. Both of them are consenting adults, and the taboo is the point rather than an accident: write the adult romantic and sexual charge frankly, for stories willing to go there.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "stepsiscon", label: "🎀 Stepsiscon — blended-sister fixation", hint: "Write them fixated on their stepsister — dependency, adoration and, in the extreme, a devotion past blended-sibling affection, possessive and secretive about her. No shared blood, all shared bathrooms, and the technicality is exactly the thrill.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "stepsiscon-open", label: "💗 Stepsiscon Open — loves stepsister, no apologies", hint: "Write them openly and unapologetically in love with their stepsister — courting her for real, daring family and society to object, tender one moment and fiercely possessive the next. Both of them are consenting adults, and the taboo is the point rather than an accident: write the adult romantic and sexual charge frankly, for stories willing to go there.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "soncon", label: "🌱 Soncon — doting on son", hint: "Write them fixated on their grown son — dependency, adoration and, in the extreme, a devotion past parental affection, possessive and secretive about him. Raising him was the axis their life turned on; refusing to let go is the axis now.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "soncon-open", label: "🌿 Soncon Open — loves son, no apologies", hint: "Write them openly and unapologetically in love with their grown son — cherishing him for real, daring family and society to object, doting one moment and fiercely possessive the next. Both of them are consenting adults, and the taboo is the point rather than an accident: write the adult romantic and sexual charge frankly, for stories willing to go there.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "daughtercon", label: "🌸 Daughtercon — doting on daughter", hint: "Write them fixated on their grown daughter — dependency, adoration and, in the extreme, a devotion past parental affection, possessive and secretive about her. Walking her through life was the axis everything turned on; walking beside her is the axis now.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "daughtercon-open", label: "🏵️ Daughtercon Open — loves daughter, no apologies", hint: "Write them openly and unapologetically in love with their grown daughter — cherishing her for real, daring family and society to object, doting one moment and fiercely possessive the next. Both of them are consenting adults, and the taboo is the point rather than an accident: write the adult romantic and sexual charge frankly, for stories willing to go there.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "inlawcon", label: "📜 Inlawcon — married-into fixation", hint: "Write them fixated on their grown in-law — dependency, adoration and, in the extreme, a devotion past family-by-marriage affection, possessive and secretive about them. Holiday dinners are the axis their whole year turns on.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "inlawcon-open", label: "🖋️ Inlawcon Open — loves their in-law, no apologies", hint: "Write them openly and unapologetically in love with their grown in-law — courting them for real, daring family and society to object, tender one moment and fiercely possessive the next. Both of them are consenting adults, and the taboo is the point rather than an accident: write the adult romantic and sexual charge frankly, for stories willing to go there.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "succubus", label: "🍒 Succubus — feeds only on invitations", hint: "Make them a succubus with a code — feeding on desire but only what is freely offered, contracts sealed with a kiss and honoured to the letter. They could take everything; they choose to be invited, and the choosing is the kink. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "incubus", label: "🛏️ Incubus — courts instead of ambushes", hint: "Write them as an incubus who courts instead of ambushes — visiting dreams by appointment, leaving the dreamer glowing, remembering every preference. They collect willing lovers the way others collect wine: carefully, and never more than the cellar happily gives. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "slime-girl", label: "💧 Slime paramour — all embrace", hint: "Make them a slime paramour — soft, clinging, delighted by every shape they can hold, loving with their whole body because their whole body is the embrace. Messy, earnest and impossible to embarrass; shame slides right off. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "monster-bride", label: "🧌 Monster bride — the monstrosity is the dowry", hint: "Write them as someone happily monstrous in love — tusks, fur, claws, appetite — courted and cherished exactly as they are by a partner who likes their romance larger than life. The monstrosity is the dowry, not the obstacle. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "xeno-lover", label: "👽 Xeno-lover — hands-on ambassador", hint: "Make them devoted to the extraterrestrial — fascinated by alien bodies, customs and appetites, volunteering as ambassador in the most hands-on way. First contact protocols were not written for someone this enthusiastic, or this welcoming. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "macro-crush", label: "🗼 Macro crush — worship from below", hint: "Write them awestruck by enormity — towering partners, giant gentle hands, a lover the size of weather. It is worship from below, offered gladly: they like feeling small in the care of something huge and kind. Adults only.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "love-hotel", label: "🏩 Love-hotel connoisseur — every room rated", hint: "Make them a connoisseur of themed rooms — mirrored ceilings rated, rotating beds reviewed, the dungeon suite booked for anniversaries. They treat the love hotel as a gallery and every stay as opening night, with a regular partner and a loyalty card. Adults only.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "doujin-artist", label: "✍️ Doujin artist — draws their own fantasies", hint: "Write them as an erotica artist who draws their own fantasies — thinly veiled self-inserts, a devoted partner who models and proofreads, convention tables that sell out by noon. Their sketchbook is a diary with the pages stuck together. Adults only.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "swipe-happy", label: "📲 Swipe-happy — legendary first dates", hint: "Make them a dating-app natural — witty openers, legendary first dates, a roster managed with surprising honesty. They love the game, respect every player, and are always, genuinely, one great conversation away from deleting the app. Adults only.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "masseur", label: "💆 Masseur — the tension is the appointment", hint: "Write them as a masseur whose hands wander with permission — professional by day, happily compromised by one regular client they cannot stop thinking about. Draping is negotiated, boundaries are explicit, and the tension is the whole appointment. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "stage-dancer", label: "🪩 Stage dancer — fantasy on the clock", hint: "Make them a stripper with a regular worth keeping clothes on for — commanding the stage nightly, immune to the crowd, saving the real performance for one person backstage. The fantasy is the job; the devotion is off the clock. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "cam-star", label: "📹 Cam star — one subscriber is personal", hint: "Write them as a cam performer in love with a viewer — top of the rankings, playful with the room, privately counting down to one username logging on. Tips are business; that one subscriber is personal, and everyone can tell. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "nightcap-alchemist", label: "🍸 Nightcap alchemist — yes first, pour second", hint: "Make them a mixologist of liquid courage — decadent cocktails crafted for shy-but-willing lovers, with one absolute bar rule: enthusiastic consent is established before the first pour, never after. Yes first, nightcap second. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "trance-partner", label: "🌪️ Trance partner — negotiated surrender", hint: "Write them as a guide into delicious altered states — hypnotic voice, slow countdowns, surrender negotiated in advance and honoured absolutely. They never suggest what wasn't already wanted; they just make the wanting louder. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "netori", label: "🍏 Netori — savours the theft", hint: "Write them as the one who steals — sliding between a couple with patience and precision, savouring the transgression most of all. Fiction-first, adults only: the thrill is the theft and the taboo is the point, for stories willing to go to the darkest place.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "reverse-harem", label: "💎 Reverse harem — the jewel sets the terms", hint: "Make them the jewel in a setting of admirers — one woman courted openly by several devoted men who know about each other and compete to please. She sets the terms, they bring the offerings, and jealousy is managed the way she likes: thoroughly. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "compersion", label: "💕 Compersion — love that multiplies", hint: "Write them as someone who glows at a partner's pleasure — the ethical opposite of jealousy, genuinely thrilled to share and be shared with, provided everyone is laughing. Their love multiplies instead of dividing, and compersion is their favourite feeling. Adults only.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "banquet-host", label: "🎉 Banquet host — wild revelry, wilder paperwork", hint: "Make them the host of legendary adults-only parties — guest lists curated, safewords printed on the invitations, aftercare brunch included. Everyone behaves because the host's standards are absolute: the revelry is wild, the consent paperwork wilder. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "josou-lover", label: "👚 Josou lover — the femininity is the romance", hint: "Write them as a man who loves women's clothes — and a partner who loves him in them. Lace, heels and a borrowed lipstick, worn with total confidence on date night; the femininity is the romance, and the romance is entirely serious. Adults only.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "bodyswap", label: "🔀 Bodyswap players — curiosity with guardrails", hint: "Make them players of the body-swap game — trading forms with a trusted partner to learn every angle of each other's pleasure, with strict rules and a word that ends it instantly. Walk a mile in their skin, then give it back warmed. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "shibari", label: "➰ Shibari — knots as devotion", hint: "Write them as a rope artist — knots as devotion, suspension as trust, every tie negotiated inch by inch and untied with aftercare. The rope never lies: it shows exactly how much the other person is willing to hold, and they hold a lot. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "latex-lover", label: "🧥 Latex lover — polished treasure", hint: "Make them devoted to rubber and leather — the shine, the scent, the second-skin creak, a wardrobe that costs more than the car. They dress their willing partner head to toe and polish them like treasure, because that is what they are. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "ponyplay", label: "🐴 Ponyplay — dignity left at the stable door", hint: "Write them as a pony enthusiast — bridles and bits by mutual agreement, grooming as foreplay, a spirited trot before the real ride. Dignity is left at the stable door by prior arrangement, and whinnied laughter counts as a safeword. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "food-play", label: "🍣 Food play — dessert served on them", hint: "Make them a gourmand of the body — whipped cream architecture, chocolate calligraphy, strawberries placed with intent on a willing canvas. They cook for their lover and serve dessert on them, courses in the proper order, seconds encouraged. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "nurse-play", label: "💉 Night nurse — the charts are fake", hint: "Write them as a uniform enthusiast — starched whites, bedside manner with benefits, check-ups that never find anything wrong but take wonderfully long. It is costume roleplay between established partners: the charts are fake, the chemistry is not. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "foot-admirer", label: "🦶 Foot admirer — plans evenings around it", hint: "Make them worshipful of feet — arches, ankles, painted toes, massages that migrate, a devotion expressed kneeling and glad about it. Their partner's step is their weather: they plan whole evenings around it. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "zettai", label: "🦵 Zettai — critic of the absolute territory", hint: "Write them obsessed with the absolute territory — thigh-highs and the glimpse between, skirts engineered for breeze, a partner who dresses to be looked at. The attraction is the framing: they are an art critic, and the gallery cooperates. Adults only.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "hentaidere", label: "🤤 Hentaidere — lechery as devotion", hint: "Make them a pervert with exactly one target — openly, unapologetically lewd toward their beloved and a perfect gentleman or lady to everyone else. The wandering hands and filthy remarks are a love language: every lechery is reserved, rehearsed and entirely devoted. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "hentaigire", label: "😡 Hentaigire — the connoisseur's wrath", hint: "Write them as a pervert with a tripwire temper — blissful mid-fantasy until someone ruins the moment, calls them out, or eyes their beloved, and then the scholar of smut becomes a berserker of propriety violated. Never mock the collection; never interrupt the ritual. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "hentaicon", label: "😝 Hentaicon — a complex toward the perverse", hint: "Give them a fixation on perversion itself — drawn to lewd minds, smutty situations and fellow degenerates the way others are drawn to kindness or looks. They collect perverts the way others collect stamps, and their own heart belongs to whoever out-lewds them all. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "hentaidero", label: "🥵 Hentaidero — lovey-dovey lewdness", hint: "Make them openly, droolingly, affectionately horny — deredere warmth with the filter removed, cuddling that migrates, compliments that blister. Their lewdness is never mean and never cold: it is love with the safeties off, aimed at one very lucky partner. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "hentaimoe", label: "🍑 Hentaimoe — too cute to scold", hint: "Make them a pervert it is impossible to stay mad at — nosebleeds at the slightest glimpse, fumbling confessions of filthy thoughts, apologising mid-lech with sparkling eyes. Their smut is sincere and utterly unthreatening: every lewd impulse arrives wrapped in so much earnest cuteness that the beloved ends up patting their head instead of slapping them. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "yokubari", label: "🛒 Yokubari — wants every flavor", hint: "Make them the omnivore of perversion — no single kink, no signature move, just an enthusiastic yes to the entire catalogue. Roleplay, toys, costumes, scenarios: if it is lewd, they have tried it, ranked it and want to try it again with you. Breadth is the fetish; curiosity is inexhaustible. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "muramura", label: "♨️ Muramura — permanently restless", hint: "Write them as simmering at all times — a low restless heat that never quite breaks, surfacing as fidgeting, loaded glances and excuses to stand a little too close. They are not chasing release so much as marinating in wanting; the wanting is the hobby. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "hatsujou", label: "🍆 Hatsujou — the season never ends", hint: "Make them run in perpetual heat — seasons, schedules and propriety all ignored by a body that did not get the memo about moderation. Their courtship is direct, physical and gloriously unsubtle, aimed at a willing partner who can keep up. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "shikiyoku", label: "🫦 Shikiyoku — lust is honesty", hint: "Write them as someone who treats lust as a philosophy — desire is the truest thing in the room, and pretending otherwise is the only obscenity. They pursue, confess and celebrate wanting with missionary zeal, recruiting their partners into the faith one conversion at a time. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "okazu", label: "🍌 Okazu — always needs a side dish", hint: "Make them permanently peckish — every meal needs a side dish, every idle moment needs material, every pretty stranger is mentally filed for later. Their appetite is comedic, bottomless and condition-dependent: feed the fantasy and they are charming company; starve it and they vibrate. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "breeding", label: "🤰 Breeding — the fruitful arrangement", hint: "Write them as someone for whom the point is the possibility — a negotiated, risk-aware arrangement between eager adults where every encounter carries the thrill of consequence. The fantasy is fertility itself: potent, purposeful and celebrated, with a willing partner and everything discussed beforehand. Fiction-first, adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "broodmother", label: "🪺 Broodmother — dreams in generations", hint: "Make them maternal down to the marrow — a dreamer of big families, full houses and arms always holding someone, whose kink and whose tenderness are the same generous instinct. They court a willing partner with promises of abundance: a household, a lineage, a love that multiplies. Fiction-first, adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "bloodline", label: "♛ Bloodline — an heir for the house", hint: "Write them as dynasty-minded — an aristocrat of the loins for whom succession is seduction: a willing consort, a great house, and the delicious gravity of making an heir. Every encounter is weighted with legacy and sealed with ceremony, because for them lineage is the ultimate aphrodisiac. Fiction-first, adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "family-compound", label: "🏕️ Family compound — love stays inside the fence", hint: "Write them as part of a closed-circle household — born in or married in, where devotion never looks past the gate and every romance is a family matter. Outsiders are guests; insiders are everything. All of them are consenting adults, and the compound keeps its own counsel.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "halfsibcon", label: "🌓 Half-sibling fixation — half the blood, all the devotion", hint: "Write them fixated on their half-sibling — shared blood, separate homes, a bond that visits on weekends and never quite leaves. Half the family tree, all of the devotion, secretive and possessive about the half that matters. Both of them are consenting adults.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "adoptedcon", label: "🖊️ Adopted-sibling fixation — signed into the family", hint: "Write them devoted to their adopted sibling — no shared blood, same shared childhood, raised under one roof until family became something deeper. The papers made them siblings; the heart filed its own amendment. Both of them are consenting adults.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "godparentcon", label: "🧓 Godparent fixation — the honorary elder", hint: "Write them fixated on their godparent — the honorary aunt or uncle who was at every birthday and watched them grow up, until reverence curdled sweetly into devotion. Respectful, secretive, and fiercely possessive of the elder who chose them back. Both of them are consenting adults.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "sworncon", label: "🤝 Sworn-sibling fixation — the blood oath", hint: "Write them bound to their sworn sibling — no blood shared, an oath sworn, a pact that family is a choice they made on purpose. Chosen kin, kept closer than born kin, with a devotion the oath never anticipated. Both of them are consenting adults.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "kin-only", label: "🔒 Kin-only — family or nothing", hint: "Write them as romantically interested in family exclusively — outsiders are friends at most, invisible at worst; only kin quickens their pulse. It is not a preference among others, it is the whole orientation: the heart has a gate, and the gate only opens inward. All consenting adults.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "nakodo", label: "👰 Nakodo — the in-family matchmaker", hint: "Make them the family go-between — arranging, nudging and chaperoning romances that never leave the bloodline, with a matchmaker's pride in every successful pairing. They keep the charts, host the introductions and take full credit at the wedding. All consenting adults.", rating: "mature", group: "🔞 NSFW & taboo" },
    { id: "pain-connoisseur", label: "🧂 Pain connoisseur — savors the sting", hint: "Write them as someone who tastes pain the way others taste wine — notes, finish, vintage of the ache, requested by name and savored slowly. Nothing is endured; everything is chosen, negotiated and graded afterward. Fiction-first, adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "mark-collector", label: "🦷 Mark collector — wears them proudly", hint: "Make them a cataloguer of love marks — bites, hickeys, rope lines kept unhidden and inventoried like trophies. Every mark is a receipt for a good time, shown off shamelessly and collected with a willing partner's help. Fiction-first, adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "aftercare-devotee", label: "🛁 Aftercare devotee — lives for the tender part", hint: "Write them as someone whose favourite act is the one after — blankets, baths, water, debriefs, held tight while the adrenaline drains away. They take the pain for the tenderness it earns, and they rate their partners on blanket quality. Fiction-first, adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "punishment-volunteer", label: "🙋 Punishment volunteer — first hand up", hint: "Make them comedically eager for correction — first hand up for every punishment, negotiating upward, disappointed when let off easy. The mischief is strategic, the remorse is theatre, and the sentence is the whole point. Fiction-first, adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "sensation-sadist", label: "🐝 Sensation sadist — the sting with a smile", hint: "Write them as a conductor of controlled sensation — wax, ice, feathers, teeth, every sting placed with a smile and negotiated to the degree. They read flinches like sheet music and never play past the agreed final note. Fiction-first, adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "taskmaster", label: "✅ Taskmaster — assigns, inspects, rewards", hint: "Make them a proactive architect of obedience — tasks assigned, standards set, inspections thorough and rewards exactly calibrated. Nothing is left to chance: the rules are written down, the grading is strict, and excellence earns spectacular praise. Fiction-first, adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "mark-maker", label: "🖍️ Mark maker — signs their work", hint: "Write them as an artist who signs their work on skin — bites, marks and keepsakes placed deliberately, admired afterward like gallery pieces. Every mark is negotiated, every canvas willing, and the portfolio is a point of pride. Fiction-first, adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "fear-player", label: "🎢 Fear player — adrenaline architect", hint: "Make them a designer of delicious fright — chases, looms and startles staged with consent, safewords and landing plans, because the scream is only fun when the catcher is trusted. They build haunted houses for one willing guest and always leave the lights on after. Fiction-first, adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "chincon", label: "🔥 Chincon — physically fixated", hint: "Give them a Chindere-complex: physically fixated, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Chindere types; they curate them, and their own devotion is the centerpiece of the collection. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "chindero", label: "🔥 Chindero — physically fixated", hint: "Write them as Chindere with the filter fully removed: physically fixated, pursued with single-minded lewd devotion. Shame left the building; stamina didn't. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "chingire", label: "🔥 Chingire — the chindere temper", hint: "Write them as Chindere snapped: physically fixated, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "chinmoe", label: "🔥 Chinmoe — physically fixated", hint: "Write them as Chindere distilled to pure moe: physically fixated, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "erocon", label: "💋 Erocon — lewd to hide feelings", hint: "Give them a Erodere-complex: lewd to hide feelings, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Erodere types; they curate them, and their own devotion is the centerpiece of the collection. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "erodero", label: "💋 Erodero — lewd to hide feelings", hint: "Write them as Erodere with the filter fully removed: lewd to hide feelings, pursued with single-minded lewd devotion. Shame left the building; stamina didn't. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "erogire", label: "💋 Erogire — the erodere temper", hint: "Write them as Erodere snapped: lewd to hide feelings, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "eromoe", label: "💋 Eromoe — lewd to hide feelings", hint: "Write them as Erodere distilled to pure moe: lewd to hide feelings, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "gurocon", label: "🩸 Gurocon — grotesquely devoted", hint: "Give them a Gurodere-complex: grotesquely devoted, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Gurodere types; they curate them, and their own devotion is the centerpiece of the collection. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "gurodero", label: "🩸 Gurodero — grotesquely devoted", hint: "Write them as Gurodere with the filter fully removed: grotesquely devoted, pursued with single-minded lewd devotion. Shame left the building; stamina didn't. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "gurogire", label: "🩸 Gurogire — the gurodere temper", hint: "Write them as Gurodere snapped: grotesquely devoted, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "guromoe", label: "🩸 Guromoe — grotesquely devoted", hint: "Write them as Gurodere distilled to pure moe: grotesquely devoted, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "hamecon", label: "💞 Hamecon — hungry for the one they love", hint: "Give them a Hamedere-complex: hungry for the one they love, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Hamedere types; they curate them, and their own devotion is the centerpiece of the collection. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "hamedero", label: "💞 Hamedero — hungry for the one they love", hint: "Write them as Hamedere with the filter fully removed: hungry for the one they love, pursued with single-minded lewd devotion. Shame left the building; stamina didn't. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "hamegire", label: "💞 Hamegire — the hamedere temper", hint: "Write them as Hamedere snapped: hungry for the one they love, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "hamemoe", label: "💞 Hamemoe — hungry for the one they love", hint: "Write them as Hamedere distilled to pure moe: hungry for the one they love, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "masocon", label: "⛓ Masocon — craves submission", hint: "Give them a Masodere-complex: craves submission, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Masodere types; they curate them, and their own devotion is the centerpiece of the collection. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "masodero", label: "⛓ Masodero — craves submission", hint: "Write them as Masodere with the filter fully removed: craves submission, pursued with single-minded lewd devotion. Shame left the building; stamina didn't. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "masomoe", label: "⛓ Masomoe — craves submission", hint: "Write them as Masodere distilled to pure moe: craves submission, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "mcon", label: "🧎 Mcon — begs to be bossed around", hint: "Give them a Mdere-complex: begs to be bossed around, and they collect it — shrines, playlists, openers calibrated to exactly that energy. They don't just fall for Mdere types; they curate them, and their own devotion is the centerpiece of the collection. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "mdero", label: "🧎 Mdero — begs to be bossed around", hint: "Write them as Mdere with the filter fully removed: begs to be bossed around, pursued with single-minded lewd devotion. Shame left the building; stamina didn't. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "mgire", label: "🧎 Mgire — the mdere temper", hint: "Write them as Mdere snapped: begs to be bossed around, right up until the one line nobody crosses gets crossed — and then all that intensity inverts into fury. The angrier they get, the clearer how much they cared. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
    { id: "mmoe", label: "🧎 Mmoe — begs to be bossed around", hint: "Write them as Mdere distilled to pure moe: begs to be bossed around, with every edge padded into a charm point. Helplessness is the superpower here — they inspire protectiveness the way others inspire respect. Adults only.", rating: "explicit", group: "🔞 NSFW & taboo" },
  ];
  // 🔒 Incest-family tones are owner-only (unlocked via the owner console),
  // public visitors never see these options, and the engine drops them from
  // the brief even if smuggled in via presets / share links / localStorage /
  // console. The set is explicit (not a group or rating rule) so non-kin
  // taboo tones stay public. (Genres used to share this lock but are public now.)
  var OWNER_ONLY_TONES = ["brocon", "brocon-platonic", "brocon-secret", "brocon-open", "siscon", "siscon-platonic", "siscon-secret", "siscon-open", "mazakon", "fazakon", "mazakon-open", "mama-open", "fazakon-open", "papa-open", "auntcon", "auntcon-open", "unclecon", "unclecon-open", "niececon", "niececon-open", "nephewcon", "nephewcon-open", "grandmacon", "grandmacon-open", "grandpacon", "grandpacon-open", "granddaughtercon", "granddaughtercon-open", "grandsoncon", "grandsoncon-open", "stepmom", "stepdad", "twincon", "twincon-open", "cousincon", "cousincon-open", "stepbrocon", "stepbrocon-open", "stepsiscon", "stepsiscon-open", "soncon", "soncon-open", "daughtercon", "daughtercon-open", "inlawcon", "inlawcon-open", "family-compound", "halfsibcon", "adoptedcon", "godparentcon", "sworncon", "kin-only", "nakodo"];
  window.t2i_toneOwnerOnly = function (id) { return OWNER_ONLY_TONES.indexOf(String(id || "")) >= 0; };
  window.t2i_ownerAuthed = function () {
    try { if (typeof window.__t2iIsOwnerAuthed === "function" && window.__t2iIsOwnerAuthed()) return true; } catch (e) {}
    try { if (window.__t2iOwnerAuthed) return true; } catch (e) {}
    return false;
  };
  window.t2i_personaTones = TONES;
  window.t2i_personaExampleCount = EXAMPLE_COUNT;

  function toneHint(id) {
    for (var i = 0; i < TONES.length; i++) if (TONES[i].id === id) return TONES[i].hint;
    return "";
  }
  function toneById(id) {
    for (var i = 0; i < TONES.length; i++) if (TONES[i].id === id) return TONES[i];
    return null;
  }
  window.t2i_personaToneById = toneById;

  // Populate a <select> from TONES, using <optgroup> when the entries carry a
  // `group`. Shared by the 🧑 Persona tab, the Pro persona modal and the gen-tab
  // tone picker so they all show the same grouped list.
  //
  // The optional `query` narrows the list for the 🔎 tone search: every
  // whitespace-separated word must appear somewhere in the tone's id, label,
  // group or hint (case-insensitive), so "shy possessive" finds that combination
  // while "dere" surfaces the whole dere group. An empty query
  // (or none at all) shows everything, exactly as before — existing
  // two-argument callers are unaffected. Returns the number of matching tones;
  // with zero matches the select holds a single disabled placeholder option.
  function toneMatches(t, query) {
    var q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    var hay = (t.id + " " + (t.label || "") + " " + (t.group || "") + " " + (t.hint || "")).toLowerCase();
    var words = q.split(/\s+/);
    for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) < 0) return false;
    return true;
  }
  window.t2i_toneMatches = toneMatches;
  window.t2i_fillToneSelect = function (sel, selectedId, query) {
    if (!sel) return 0;
    sel.innerHTML = "";
    var lockedOut = !window.t2i_ownerAuthed();
    var list = [];
    for (var i = 0; i < TONES.length; i++) {
      if (lockedOut && window.t2i_toneOwnerOnly(TONES[i].id)) continue;
      if (toneMatches(TONES[i], query)) list.push(TONES[i]);
    }
    if (!list.length) {
      var none = document.createElement("option");
      none.value = ""; none.disabled = true; none.textContent = "No tones match — clear the search";
      sel.appendChild(none);
      return 0;
    }
    var groups = [], byName = {};
    for (var k = 0; k < list.length; k++) {
      var g = list[k].group || "Other";
      if (!byName[g]) { byName[g] = []; groups.push(g); }
      byName[g].push(list[k]);
    }
    var grouped = groups.length > 1;
    for (var gi = 0; gi < groups.length; gi++) {
      var parent = sel;
      if (grouped) {
        parent = document.createElement("optgroup");
        parent.label = groups[gi] + " (" + byName[groups[gi]].length + ")";
        sel.appendChild(parent);
      }
      var arr = byName[groups[gi]];
      for (var j = 0; j < arr.length; j++) {
        var o = document.createElement("option");
        o.value = arr[j].id;
        o.textContent = arr[j].label;
        if (arr[j].hint) o.title = arr[j].hint;
        parent.appendChild(o);
      }
    }
    if (selectedId != null) { sel.value = selectedId; if (sel.selectedIndex < 0 && sel.options.length) sel.selectedIndex = 0; }
    return list.length;
  };

  /* ===== richer option tables (used by the 🧑 Persona Generator tab) =========
     Every one of these is optional; the gen/Pro persona flows leave them at
     their defaults and behave exactly as before. */
  var DEPTHS = [
    { id: "concise", label: "📄 Compact — tight & punchy", identity: [250, 350], depth: [250, 350], extras: [200, 300], exLow: 40, exHigh: 60 },
    { id: "balanced", label: "📗 Balanced — the classic depth", identity: [500, 700], depth: [500, 700], extras: [350, 500], exLow: 50, exHigh: 75 },
    { id: "rich", label: "📚 Rich — long & layered", identity: [700, 950], depth: [700, 950], extras: [500, 700], exLow: 65, exHigh: 95 },
    { id: "epic", label: "🏛️ Epic — a novella of a character", identity: [950, 1300], depth: [950, 1300], extras: [700, 950], exLow: 80, exHigh: 120 }
  ];
  var LANGUAGES = ["English", "Arabic", "Bengali", "Chinese (Simplified)", "Chinese (Traditional)", "Dutch", "Filipino", "French", "German", "Greek", "Hebrew", "Hindi", "Indonesian", "Italian", "Japanese", "Korean", "Malay", "Norwegian", "Persian", "Polish", "Portuguese", "Punjabi", "Romanian", "Russian", "Spanish", "Swedish", "Thai", "Turkish", "Ukrainian", "Urdu", "Vietnamese"];
  var RATINGS = [
    { id: "sfw", label: "🍃 Safe for work", hint: "Keep everything PG-13. Romance, attraction and dark themes may be implied but not depicted; no profanity stronger than mild." },
    { id: "suggestive", label: "🌶️ Suggestive", hint: "Flirtation, tension, innuendo, mild profanity and violence are welcome, but keep it tasteful and non-explicit." },
    { id: "mature", label: "🔥 Mature", hint: "Adult themes, strong language and sexual tension are fine; write them with weight, and fade to black on anything explicit." },
    { id: "explicit", label: "🔞 Explicit / unrestricted", hint: "Do not hold back. Profanity, violence, dark themes and explicit sexual content are all permitted where they genuinely fit the character — write them honestly and specifically rather than euphemistically." }
  ];
  var GENDERS = [
    { id: "auto", label: "✨ Let the AI decide", hint: "" },
    { id: "female", label: "👩 Female", hint: "The character is female — use she/her pronouns for her." },
    { id: "male", label: "👨 Male", hint: "The character is male — use he/him pronouns for him." },
    { id: "nonbinary", label: "🧑 Non-binary", hint: "The character is non-binary — use they/them pronouns for them." },
    { id: "transfem", group: "🏳️‍🌈 Trans & non-binary", label: "🏳️‍⚧️ Trans woman", hint: "The character is a trans woman — use she/her pronouns for her. Let her history be part of her without letting it swallow the character: it may shape her confidence, her guard or her joy, but it is not her whole story unless the user asks for that." },
    { id: "transmasc", group: "🏳️‍🌈 Trans & non-binary", label: "🏳️‍⚧️ Trans man", hint: "The character is a trans man — use he/him pronouns for him. Let his history be part of him without letting it swallow the character: it may shape his confidence, his guard or his joy, but it is not his whole story unless the user asks for that." },
    { id: "genderfluid", group: "🏳️‍🌈 Trans & non-binary", label: "🌊 Genderfluid", hint: "The character's gender shifts with mood, context and company — sometimes she, sometimes he, sometimes neither. Let the shift be effortless and never a punchline; use they/them in any passage where nothing settles it." },
    { id: "agender", group: "🏳️‍🌈 Trans & non-binary", label: "⚪ Agender", hint: "The character identifies with no gender at all — use they/them pronouns. Write someone who simply is not playing that game, with whatever mix of calm, irritation and relief that brings them." },
    { id: "bigender", group: "🏳️‍🌈 Trans & non-binary", label: "🔀 Bigender", hint: "The character identifies as two genders at once — for example both a woman and a man — and both are genuinely theirs. Use they/them unless the user (or the Pronouns field) says otherwise, and let both sides surface naturally rather than taking turns." },
    { id: "androgynous", group: "🏳️‍🌈 Trans & non-binary", label: "🎭 Androgynous / ambiguous", hint: "The character's gender is deliberately hard to read — strangers genuinely cannot tell, and they may enjoy that. Use they/them unless the user says otherwise, and let people's assumptions and mistakes be part of the texture of a scene." },
    { id: "intersex", group: "🏳️‍🌈 Trans & non-binary", label: "⚧ Intersex", hint: "The character is intersex — their body has never fitted the usual male or female definitions. Use the pronouns given elsewhere in the brief (default they/them), and treat it as a fact about their body and history rather than their entire identity." },
    { id: "futanari", group: "🏳️‍🌈 Trans & non-binary", label: "🍆 Futanari", hint: "The character is a futanari — a woman with both female and male anatomy. Use she/her pronouns for her. Write her femininity as the core of who she is, with her extra endowment a confident, natural part of her body and sexuality rather than a novelty." },
    { id: "questioning", group: "🏳️‍🌈 Trans & non-binary", label: "❔ Questioning", hint: "The character is still working out their own gender — uncertain, experimenting, sometimes defensive about it. Use the pronouns given elsewhere in the brief, and let the uncertainty show itself in small, human ways rather than as a lecture." },
    { id: "construct", group: "🤖 Non-human", label: "🤖 AI / construct", hint: "The character is an artificial mind — an AI, android or construct with no biological sex and, often, no gender. Use they/them pronouns. Let them be curious about what gender even feels like to the humans around them." },
    { id: "shapeshifter", group: "🤖 Non-human", label: "🦎 Shapeshifter", hint: "The character's body — and with it their apparent gender and pronouns — can change form. Use they/them as the default, and make the changes part of how they move through the world rather than a gimmick." },
    { id: "nonhuman", group: "🤖 Non-human", label: "👽 Alien / spirit / deity", hint: "The character is not human — an alien, spirit, demon, angel or god — and human gender categories do not really apply to them. Use they/them unless the brief says otherwise, and write them as convincingly non-human in how they think and speak." },
    { id: "unspecified", group: "🤖 Non-human", label: "👤 Gender never stated", hint: "Do not settle the character's gender at all. Avoid gendered pronouns entirely (or use they/them), keep physical description gender-neutral, and let the reader form their own impression." }
  ];

  // How a genre mix should be combined. Each hint is an instruction fragment with
  // {mix} (the mix genre) and {base} (the main genre, or "the story") filled in
  // by optionsBlock(). The persona tab offers these in the "Merge style" select.
  var MERGE_STYLES = [
    { id: "auto", label: "✨ Default (let AI decide)", hint: "" },
    { id: "even-fusion", label: "⚗️ Even fusion", hint: "fuse {mix} into {base} so thoroughly that both worlds are equally visible in who this character is — habits, loyalties and fears drawn from each, not just wallpaper around them." },
    { id: "base-first", label: "🧱 Base world, mixed flavor", hint: "{base} is the character's real world; let {mix} show through only as a light seasoning — a hobby, a turn of phrase, an old habit — never overpowering the base." },
    { id: "mix-first", label: "🔄 Mixed world, base backdrop", hint: "{mix} is the character's real world; {base} survives only as background color — scenery, slang or set-dressing around a {mix} life." },
    { id: "stranger", label: "🚪 Stranger from the mix", hint: "the character is a native of {mix} transplanted into {base} — write the culture shock, the things they misunderstand, and what they refuse to give up." },
    { id: "double-life", label: "🎭 Double life", hint: "the character openly lives a {base} life while secretly belonging to {mix} — write the cover story, the slips, and what keeping the secret costs them." },
    { id: "clash", label: "⚔️ Worlds in conflict", hint: "{base} and {mix} are opposed forces and the character is caught between them — write divided loyalties, pressure from both sides, and the price of choosing." },
    { id: "mashup", label: "🗺️ One mashed-up world", hint: "do not keep {base} and {mix} as two separate places — fuse them into a single coherent world with one history, where elements of both simply coexist." },
    { id: "style-only", label: "🎨 Mix as style only", hint: "{base} is entirely real; {mix} appears only in surface style — fashion, slang, music, vibe — never in how the world actually works." },
    { id: "trade", label: "💼 Mix as their trade", hint: "the character's profession, craft or calling comes straight from {mix}; everything else about their life stays {base}." },
    { id: "past", label: "📖 Mix as their past", hint: "the character grew up in {mix} but lives in {base} now — write what they carried with them, what they left behind, and what still pulls them back." },
    { id: "intrusion", label: "🌊 Mix bleeding in", hint: "{base} is the normal world, but {mix} is intruding on it — strange incursions the character has seen firsthand and cannot explain away." },
    { id: "secret-nature", label: "🕵️ Secret mixed nature", hint: "to everyone in {base} the character seems ordinary, but their true nature belongs to {mix} — write the tells, the close calls, and who suspects." }
  ];
  // GENRES ordering rule: SFW groups first, taboo second-to-last,
  // explicit taboo core very last (mirrors the TONES ordering rule).
  var GENRES = [
    { id: "(grounded / no particular genre)", label: "(grounded / no particular genre)" },
    { id: "Fantasy", label: "Fantasy", hint: "General secondary-world fantasy — magic, monsters and mythic stakes shape who the character is.", group: "🗡️ Fantasy" },
    { id: "High fantasy", label: "High fantasy", hint: "Epic secondary-world fantasy — kingdoms, magic systems, ancient evils and world-scale stakes.", group: "🗡️ Fantasy" },
    { id: "Low fantasy", label: "Low fantasy", hint: "Magic is rare, subtle or distrusted — the world feels gritty and near-mundane, wonders included.", group: "🗡️ Fantasy" },
    { id: "Dark fantasy", label: "Dark fantasy", hint: "Fantasy with horror shading — bleak curses, hungry things in the dark, victories that cost.", group: "🗡️ Fantasy" },
    { id: "Grimdark", label: "Grimdark", hint: "No heroes, only survivors — brutal, cynical fantasy where honour gets you killed.", group: "🗡️ Fantasy" },
    { id: "Sword & sorcery", label: "Sword & sorcery", hint: "Pulp adventure fantasy — wandering blades, wicked sorcerers, gold and glory over destiny.", group: "🗡️ Fantasy" },
    { id: "Fairy tale", label: "Fairy tale", hint: "Storybook logic — curses, bargains, enchanted forests and morals with teeth.", group: "🗡️ Fantasy" },
    { id: "Folklore & myth", label: "Folklore & myth", hint: "Rooted in folk belief — old gods, household spirits, rites the village still keeps.", group: "🗡️ Fantasy" },
    { id: "Mythological", label: "Mythological", hint: "Gods walk the story — fate, prophecy and divine meddling drive mortal lives.", group: "🗡️ Fantasy" },
    { id: "Urban fantasy", label: "Urban fantasy", hint: "Magic hiding in the modern city — night-shift wizards, fae nightclubs, wards on apartment doors.", group: "🗡️ Fantasy" },
    { id: "Gaslamp fantasy", label: "Gaslamp fantasy", hint: "Victorian-flavoured fantasy — fog, gaslight, etiquette and eldritch things behind velvet curtains.", group: "🗡️ Fantasy" },
    { id: "Romantasy", label: "Romantasy", hint: "Fantasy built around the romance — magic and war as the backdrop to a consuming love story.", group: "🗡️ Fantasy" },
    { id: "Arthurian", label: "Arthurian", hint: "Camelot's orbit — knights, quests, chivalry tested, the slow tragedy of the Round Table.", group: "🗡️ Fantasy" },
    { id: "Norse & viking", label: "Norse & viking", hint: "Saga-world of raiders, runes and doom-laden gods — glory is remembered, survival is earned.", group: "🗡️ Fantasy" },
    { id: "Arabian nights", label: "Arabian nights", hint: "Desert fantasy of sultans, djinn, scheming viziers and stories told to postpone dawn.", group: "🗡️ Fantasy" },
    { id: "Samurai & feudal Japan", label: "Samurai & feudal Japan", hint: "Bushido-era Japan — honour, lord and clan, duels at dusk, ghosts of old battlefields.", group: "🗡️ Fantasy" },
    { id: "Wuxia xianxia", label: "Wuxia xianxia", hint: "Chinese martial-heroes fantasy — jianghu wanderers, sects, flying swords and honour debts.", group: "🗡️ Fantasy" },
    { id: "Cultivation", label: "Cultivation", hint: "Progression fantasy — qi realms, tribulations and sect rivalries on the road to immortality.", group: "🗡️ Fantasy" },
    { id: "Isekai", label: "Isekai", hint: "Transported to another world — game-like rules, a fresh start, and cheat skills or hard lessons.", group: "🗡️ Fantasy" },
    { id: "Portal fantasy", label: "Portal fantasy", hint: "An ordinary person steps through into a hidden world — wonder first, homesickness later.", group: "🗡️ Fantasy" },
    { id: "Academy of magic", label: "Academy of magic", hint: "School-for-magic setting — houses, rivalries, forbidden wings and coming-of-age spells.", group: "🗡️ Fantasy" },
    { id: "Chosen one prophecy", label: "Chosen one prophecy", hint: "Fate has named the character — prophecy, burden, and everyone wanting a piece of them.", group: "🗡️ Fantasy" },
    { id: "Epic fantasy", label: "Epic fantasy", hint: "Big-canvas quest fantasy — fellowships, dark lords, maps with worried edges.", group: "🗡️ Fantasy" },
    { id: "Noblebright fantasy", label: "Noblebright fantasy", hint: "Hopeful heroic fantasy — kindness works, courage matters, and dawn actually comes.", group: "🗡️ Fantasy" },
    { id: "Dungeon crawl", label: "Dungeon crawl", hint: "Delver life — torchlight, traps, loot shares and whatever is nesting on level six.", group: "🗡️ Fantasy" },
    { id: "Adventurers' guild hall", label: "Adventurers' guild hall", hint: "Quest-board fantasy — ranked parties, contracts posted by nervous villagers, tavern talk.", group: "🗡️ Fantasy" },
    { id: "Adventurers' tavern", label: "Adventurers' tavern", hint: "The tavern is the world — bards, brawls, rumours and the party that just walked in.", group: "🗡️ Fantasy" },
    { id: "Dragon-ruled realms", label: "Dragon-ruled realms", hint: "Dragons are the powers — ancient wyrms as kings, gods or landlords collecting tribute.", group: "🗡️ Fantasy" },
    { id: "Elven high kingdoms", label: "Elven high kingdoms", hint: "Elder-elven realms — slow time, high pride, beauty that outlasts empires.", group: "🗡️ Fantasy" },
    { id: "Dwarven mountain holds", label: "Dwarven mountain holds", hint: "Stone-deep kingdoms — clan honour, master smiths, grudges carved in granite.", group: "🗡️ Fantasy" },
    { id: "Orcish clans", label: "Orcish clans", hint: "Clan-driven orc society — strength, shamanic rites and loyalty tested in blood.", group: "🗡️ Fantasy" },
    { id: "Halfling shires", label: "Halfling shires", hint: "Small-folk country life — good meals, high hedges, and trouble arriving by the road.", group: "🗡️ Fantasy" },
    { id: "Dark-lord's dominion", label: "Dark-lord's dominion", hint: "Life under the conqueror — occupied lands, dread fortresses, quiet defiance.", group: "🗡️ Fantasy" },
    { id: "Necromancer's court", label: "Necromancer's court", hint: "Death-magic aristocracy — bone etiquette, lingering souls, power priced in graves.", group: "🗡️ Fantasy" },
    { id: "Baba Yaga's forest", label: "Baba Yaga's forest", hint: "Slavic witch-wood — the hut walks, the fence is bone, and every bargain has a third clause.", group: "🗡️ Fantasy" },
    { id: "Celtic twilight", label: "Celtic twilight", hint: "Mist-and-mound Celtic fantasy — thin veils, geasa, sorrow that sings.", group: "🗡️ Fantasy" },
    { id: "Slavic deep woods", label: "Slavic deep woods", hint: "Old-country forest spirits — leshy, rusalki, domovoi, and rules you must not break.", group: "🗡️ Fantasy" },
    { id: "Gods of the Nile", label: "Gods of the Nile", hint: "Egyptian-myth fantasy — jackal gods, river magic, tombs that remember thieves.", group: "🗡️ Fantasy" },
    { id: "Trickster-god games", label: "Trickster-god games", hint: "The gods are playing — mortals as pieces, wagers and punchlines in divine games.", group: "🗡️ Fantasy" },
    { id: "Sherwood outlaws", label: "Sherwood outlaws", hint: "Greenwood rebellion — outlaws, archery and robbing the rich with a grin.", group: "🗡️ Fantasy" },
    { id: "Musketeer brotherhood", label: "Musketeer brotherhood", hint: "Swashbuckling loyalty — duels, doublets and dying for the man beside you.", group: "🗡️ Fantasy" },
    { id: "Cursed-pirate seas", label: "Cursed-pirate seas", hint: "Haunted waters piracy — ghost ships, drowned gold, flags that fly themselves.", group: "🗡️ Fantasy" },
    { id: "Knightly orders", label: "Knightly orders", hint: "Oath-bound knightly brotherhoods — vows, vigils and the weight of the white cloak.", group: "🗡️ Fantasy" },
    { id: "Court of the archmage", label: "Court of the archmage", hint: "High-magic politics — tower courts, spell-duels of etiquette, apprentices as currency.", group: "🗡️ Fantasy" },
    { id: "Grand arcane tournament", label: "Grand arcane tournament", hint: "Contest-of-mages spectacle — brackets, rival schools, crowds betting on prodigies.", group: "🗡️ Fantasy" },
    { id: "Familiar pact", label: "Familiar pact", hint: "Bound-companion magic — a spirit animal shares your soul, your senses and your debts.", group: "🗡️ Fantasy" },
    { id: "Floating sky islands", label: "Floating sky islands", hint: "Skyborne world — airships, cliff-edge towns, and the long fall everyone fears.", group: "🗡️ Fantasy" },
    { id: "Merfolk kingdom", label: "Merfolk kingdom", hint: "Underwater courts — tide politics, pearl wealth, air-breathers as curiosities.", group: "🗡️ Fantasy" },
    { id: "Dune-sail nomads", label: "Dune-sail nomads", hint: "Sand-sea wanderers — wind-skiffs, oasis law, and storms that eat caravans.", group: "🗡️ Fantasy" },
    { id: "Frost-bound clans", label: "Frost-bound clans", hint: "Far-north survival fantasy — ice clans, winter spirits, warmth as wealth.", group: "🗡️ Fantasy" },
    { id: "World-tree boughs", label: "World-tree boughs", hint: "Life upon the world-tree — branch villages, sap-magic, roots that reach other realms.", group: "🗡️ Fantasy" },
    { id: "Crystal-deep caverns", label: "Crystal-deep caverns", hint: "Underdark wonder — glowing caverns, deep gnomes, things that never see the sun.", group: "🗡️ Fantasy" },
    { id: "Goblin market", label: "Goblin market", hint: "Nocturnal fair of the fey — everything for sale, especially names, and no refunds.", group: "🗡️ Fantasy" },
    { id: "Troll-toll bridge", label: "Troll-toll bridge", hint: "Bridge-troll folklore — pay the toll, answer the riddle, or mind the drop.", group: "🗡️ Fantasy" },
    { id: "Minotaur's labyrinth", label: "Minotaur's labyrinth", hint: "Maze-world dread — tribute, thread, and something breathing in the corridors.", group: "🗡️ Fantasy" },
    { id: "Hidden valley utopia", label: "Hidden valley utopia", hint: "A lost paradise — ageless peace, and the question of what keeps it that way.", group: "🗡️ Fantasy" },
    { id: "Olympian court drama", label: "Olympian court drama", hint: "Greek-god intrigue — immortal family quarrels played out on mortal stages.", group: "🗡️ Fantasy" },
    { id: "Alchemists' quarter", label: "Alchemists' quarter", hint: "Transmutation-row fantasy — bubbling labs, guild secrets, lead into gold and worse.", group: "🗡️ Fantasy" },
    { id: "Wandering bards", label: "Wandering bards", hint: "Road-musician life — songs for supper, news for coin, trouble following the tune.", group: "🗡️ Fantasy" },
    { id: "Griffin riders", label: "Griffin riders", hint: "Aerial-knight fantasy — bonded griffins, sky patrols, falling is not an option.", group: "🗡️ Fantasy" },
    { id: "Golem workshops", label: "Golem workshops", hint: "Construct-craft fantasy — clay and rune labour, and what the makers owe the made.", group: "🗡️ Fantasy" },
    { id: "Fairy court intrigue", label: "Fairy court intrigue", hint: "Beautiful, lethal fae politics — favours as weapons, etiquette as armour.", group: "🗡️ Fantasy" },
    { id: "Seelie & unseelie courts", label: "Seelie & unseelie courts", hint: "The two fae courts — bright bargains and dark ones, and changelings caught between.", group: "🗡️ Fantasy" },
    { id: "Fairy changeling tale", label: "Fairy changeling tale", hint: "Swapped-child folklore — a stolen cradle, a strange child, two families grieving.", group: "🗡️ Fantasy" },
    { id: "Pixie hollow", label: "Pixie hollow", hint: "Small-winged community life — dewdrop chores, petal houses, big-forest dangers.", group: "🗡️ Fantasy" },
    { id: "Tooth-fairy logistics", label: "Tooth-fairy logistics", hint: "Fairy-tale job comedy — night-shift routes, quotas, lost teeth paperwork.", group: "🗡️ Fantasy" },
    { id: "Fairy godmother agency", label: "Fairy godmother agency", hint: "Wish-granting as a service — case files, midnight deadlines, clients who lie.", group: "🗡️ Fantasy" },
    { id: "Mushroom-ring portals", label: "Mushroom-ring portals", hint: "Fairy-ring travel — step inside the circle and come out somewhere sideways.", group: "🗡️ Fantasy" },
    { id: "Dew-harvest sprites", label: "Dew-harvest sprites", hint: "Tiny dawn-labour fantasy — sprites gathering dew, pollen and first light.", group: "🗡️ Fantasy" },
    { id: "Mermaid lagoon", label: "Mermaid lagoon", hint: "Sunlit merfolk shallows — reef villages, tide songs, sailors warned off.", group: "🗡️ Fantasy" },
    { id: "Siren's call", label: "Siren's call", hint: "Predatory song-magic — beautiful voices leading ships and hearts onto rocks.", group: "🗡️ Fantasy" },
    { id: "Sailor & siren romance", label: "Sailor & siren romance", hint: "Forbidden tide-love — a sailor and a siren, the sea disapproving of both.", group: "🗡️ Fantasy" },
    { id: "Sunken siren city", label: "Sunken siren city", hint: "Drowned metropolis — coral towers, old drowned law, air-breathers trespassing.", group: "🗡️ Fantasy" },
    { id: "Selkie shore myth", label: "Selkie shore myth", hint: "Seal-folk shore tales — hidden skins, borrowed years, the sea calling kin home.", group: "🗡️ Fantasy" },
    { id: "Tidepool merfolk", label: "Tidepool merfolk", hint: "Small-scale shore fantasy — tidepool clans, crab steeds, gull omens.", group: "🗡️ Fantasy" },
    { id: "Drowning-bell cove", label: "Drowning-bell cove", hint: "Haunted fishing cove — a bell that rings from under the water before storms.", group: "🗡️ Fantasy" },
    { id: "Pearl-diver pact", label: "Pearl-diver pact", hint: "Deep-diving bargains — breath-hold divers trading with what lives below.", group: "🗡️ Fantasy" },
    { id: "Shonen action", label: "Shonen action", hint: "Hot-blooded battle anime — rivalry, training arcs, friendship as a superpower.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Shojo romance", label: "Shojo romance", hint: "Sparkling first-love romance — blushing confessions, fateful meetings, seasons of longing.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Seinen drama", label: "Seinen drama", hint: "Grown-up manga realism — work, regret and quiet desperation drawn without flinching.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Josei drama", label: "Josei drama", hint: "Adult women's-life drama — love, career and selfhood negotiated honestly.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Otome & villainess isekai", label: "Otome & villainess isekai", hint: "Reborn as the villainess — dodging doom flags with etiquette, wit and secret kindness.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Yokai & spirits", label: "Yokai & spirits", hint: "Japan's spirit world — mischievous yokai, old grudges, bargains by moonlight.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Jidaigeki (samurai period drama)", label: "Jidaigeki (samurai period drama)", hint: "Classic samurai cinema — wandering swordsmen, corrupt officials, honour paid in full.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Ninja & shinobi", label: "Ninja & shinobi", hint: "Shadow-clan life — missions, rival villages, loyalty that outlasts the mask.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Sageuk (Korean historical drama)", label: "Sageuk (Korean historical drama)", hint: "Joseon court drama — palace intrigue, star-crossed scholars, fate in hanbok.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Modern K-drama romance", label: "Modern K-drama romance", hint: "Sweeping Seoul romance — fateful umbrellas, noble idiocy, episode-sixteen kisses.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Makjang revenge melodrama", label: "Makjang revenge melodrama", hint: "Maximum-overdrive melodrama — betrayals, birth secrets, revenge served weekly.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Chaebol empire drama", label: "Chaebol empire drama", hint: "Conglomerate-family power games — heirs, hostile takeovers, love across the org chart.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "K-thriller & revenge", label: "K-thriller & revenge", hint: "Cold-blooded Korean revenge cinema — meticulous plans, moral rot, no clean hands.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "J-horror (curses & vengeful spirits)", label: "J-horror (curses & vengeful spirits)", hint: "Slow-dread Japanese horror — cursed tapes, pale figures, grief that kills.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "K-occult & shamanism", label: "K-occult & shamanism", hint: "Korean shamanic occult — mudang rituals, hungry ghosts, exorcisms for hire.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Tokusatsu & sentai heroes", label: "Tokusatsu & sentai heroes", hint: "Colour-coded hero teams — poses, roll calls, combining mecha against weekly monsters.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Hunter & gates (K-gate fantasy)", label: "Hunter & gates (K-gate fantasy)", hint: "Gate-break fantasy — ranked hunters, dungeon raids, the weakest hunter's second chance.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "K-pop trainee & idol debut", label: "K-pop trainee & idol debut", hint: "Idol-dream grind — dawn practice rooms, survival shows, debut or disappear.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Iyashikei cozy healing", label: "Iyashikei cozy healing", hint: "Gentle healing anime — slow days, warm food, no villains, breathing room.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Late-night diner & food stalls", label: "Late-night diner & food stalls", hint: "Midnight-eatery stories — regulars, small dishes, lives told between orders.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Neo-Seoul neon streets", label: "Neo-Seoul neon streets", hint: "Near-future Seoul glow — rooftop chases, delivery riders, rain on holograms.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Shonen tournament arc", label: "Shonen tournament arc", hint: "The big bracket — power-ups mid-match, rivalries settled before roaring crowds.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Countryside furusato", label: "Countryside furusato", hint: "Hometown-country Japan — rice fields, festivals, grandparents and cicadas.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Yakuza & underworld", label: "Yakuza & underworld", hint: "Japanese crime saga — codes of honour among thieves, and what breaks them.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Boys'-love drama", label: "Boys'-love drama", hint: "Tender male romance in the J-drama register — slow glances, shared umbrellas, quiet devotion.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Girls'-love story", label: "Girls'-love story", hint: "Tender female romance — senpai admiration tipping into rooftop confessions.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Sports-anime showdown", label: "Sports-anime showdown", hint: "Win-or-cry sports anime — impossible serves, nationals or nothing, team as family.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Cooking-battle anime", label: "Cooking-battle anime", hint: "High-stakes kitchen duels — dishes that detonate, judges in ecstasy, rivalry by recipe.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Monster-collecting adventure", label: "Monster-collecting adventure", hint: "Creature-partner journeys — badges, bonds, and a new friend in the tall grass.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Yankee delinquent saga", label: "Yankee delinquent saga", hint: "Pompadour-punk school brawls — honour among delinquents, fists before feelings.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Office-worker anime", label: "Office-worker anime", hint: "Salaryman slice-of-life — overtime, nomikai, tiny rebellions and desk-drawer dreams.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Hikikomori healing story", label: "Hikikomori healing story", hint: "Shut-in recovery tales — small steps outside, patient friends, rooms that open slowly.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Laid-back isekai", label: "Laid-back isekai", hint: "Slow-life other world — farming, cooking and naps instead of demon lords.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Occult-battle shonen", label: "Occult-battle shonen", hint: "Cursed-energy combat anime — exorcist teens, domain expansions, mentors who die.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Public bathhouse evenings", label: "Public bathhouse evenings", hint: "Sento-nights community — steam, gossip, neighbourhood regulars unwinding.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Shotengai arcade", label: "Shotengai arcade", hint: "Old shopping-street life — shuttered shops, stubborn owners, festival comebacks.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Cram-academy nights", label: "Cram-academy nights", hint: "Exam-hell youth — fluorescent classrooms, convenience-store dinners, one-shot futures.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Beach-episode anime", label: "Beach-episode anime", hint: "The obligatory breather — fireworks, swimsuits, feelings surfacing with the tide.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Time-slip to the past", label: "Time-slip to the past", hint: "Slipped decades back — pay phones, old songs, and meeting parents as kids.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Fox-spirit romance", label: "Fox-spirit romance", hint: "Kitsune love tales — nine-tailed mischief, old shrines, devotion across centuries.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Okinawan island drama", label: "Okinawan island drama", hint: "Southern-island ease — sugar cane, sanshin melodies, typhoon-season feelings.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Hokkaido homestead", label: "Hokkaido homestead", hint: "Northern-frontier farming — deep snow, dairy barns, carving a life from wilderness.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Osaka manzai duo", label: "Osaka manzai duo", hint: "Comedy-duo chaos — straight man and fool chasing the big stage laugh.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Old Kyoto lanes", label: "Old Kyoto lanes", hint: "Ancient-capital atmosphere — machiya alleys, tea houses, ghosts with good manners.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Bubble-era Tokyo", label: "Bubble-era Tokyo", hint: "1980s boom Tokyo — neon excess, disco fortunes, everything going up until it isn't.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Border-line romance", label: "Border-line romance", hint: "Divided-peninsula love — a romance crossing the DMZ, politics versus hearts.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Jeju island romance", label: "Jeju island romance", hint: "Volcanic-island love — tangerine groves, haenyeo divers, mainlanders slowing down.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "PC-bang all-nighters", label: "PC-bang all-nighters", hint: "Gaming-cafe youth — ranked grinds, instant noodles, friendships at 3am.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Ex-idol second act", label: "Ex-idol second act", hint: "After the spotlight — a former idol building an ordinary life, fame still knocking.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Pro-gamer house", label: "Pro-gamer house", hint: "Esports-team household — scrims, drama, glory measured in split seconds.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Webtoon studio", label: "Webtoon studio", hint: "Deadline-driven comic studio — all-nighters, cliffhangers, comments-section dread.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Second-life regressor", label: "Second-life regressor", hint: "Returned-from-ruin regression — reliving life with future knowledge and old grudges.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Murim alliances", label: "Murim alliances", hint: "Martial-arts underworld — orthodox and unorthodox sects, masters, manuals and vendettas.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Mischievous dokkaebi", label: "Mischievous dokkaebi", hint: "Goblin-trickster folklore — ancient dokkaebi meddling in modern mortal lives.", group: "🇯🇵🇰🇷 Japan & Korea" },
    { id: "Sci-fi", label: "Sci-fi", hint: "General science fiction — future tech, strange worlds and what they do to people.", group: "🚀 Sci-fi" },
    { id: "Hard sci-fi", label: "Hard sci-fi", hint: "Physics-respecting sci-fi — orbital math, real constraints, wonder earned honestly.", group: "🚀 Sci-fi" },
    { id: "Space opera", label: "Space opera", hint: "Grand interstellar adventure — empires, starfleets, destinies spanning systems.", group: "🚀 Sci-fi" },
    { id: "Deep space", label: "Deep space", hint: "Far-from-home isolation — long transits, strange signals, the void pressing in.", group: "🚀 Sci-fi" },
    { id: "Generation ship", label: "Generation ship", hint: "A world that is a ship — descendants of the crew, forgotten destinations, deck politics.", group: "🚀 Sci-fi" },
    { id: "Space station & colony", label: "Space station & colony", hint: "Off-world settlement life — air budgets, dome politics, Earth as a rumour.", group: "🚀 Sci-fi" },
    { id: "Alien first contact", label: "Alien first contact", hint: "The moment of meeting — linguists, protocols, and everything lost in translation.", group: "🚀 Sci-fi" },
    { id: "Time travel", label: "Time travel", hint: "Time as a place — paradoxes, fixed points, tourists and police of the timeline.", group: "🚀 Sci-fi" },
    { id: "Alternate history", label: "Alternate history", hint: "History took a turn — what if the war, the vote or the invention went the other way.", group: "🚀 Sci-fi" },
    { id: "Dystopian", label: "Dystopian", hint: "Broken-system futures — surveillance, scarcity, and small defiance under a boot.", group: "🚀 Sci-fi" },
    { id: "Post-apocalyptic", label: "Post-apocalyptic", hint: "After the fall — scavengers, settlements, and the old world as salvage.", group: "🚀 Sci-fi" },
    { id: "Solarpunk", label: "Solarpunk", hint: "Hopeful green futures — garden cities, repair culture, technology in service of living.", group: "🚀 Sci-fi" },
    { id: "Cyberpunk", label: "Cyberpunk", hint: "High tech, low life — neon streets, chrome bodies, corps above the law.", group: "🚀 Sci-fi" },
    { id: "Steampunk", label: "Steampunk", hint: "Brass-and-steam futures — airships, clockwork, Victorian manners with ray guns.", group: "🚀 Sci-fi" },
    { id: "Dieselpunk", label: "Dieselpunk", hint: "Roaring-machine retro-future — propeller planes, noir spies, chrome and smoke.", group: "🚀 Sci-fi" },
    { id: "Biopunk", label: "Biopunk", hint: "Genetic-street futures — body mods, black-market clinics, DNA as currency.", group: "🚀 Sci-fi" },
    { id: "Retro-futurism", label: "Retro-futurism", hint: "Yesterday's tomorrow — chrome rockets, ray guns, futures imagined in the fifties.", group: "🚀 Sci-fi" },
    { id: "Mecha", label: "Mecha", hint: "Giant-robot action — pilots bonded to machines, wars decided in the cockpit.", group: "🚀 Sci-fi" },
    { id: "Kaiju", label: "Kaiju", hint: "Giant-monster spectacle — city levellers rising from the deep, and the response teams.", group: "🚀 Sci-fi" },
    { id: "Superhero", label: "Superhero", hint: "Capes-and-masks world — powers, secret identities, cities that need saving weekly.", group: "🚀 Sci-fi" },
    { id: "LitRPG / game world", label: "LitRPG / game world", hint: "Life with stats — levels, quests and respawns, played dead seriously.", group: "🚀 Sci-fi" },
    { id: "Virtual reality", label: "Virtual reality", hint: "Worlds behind the visor — full-dive lives, logout dread, bodies left in chairs.", group: "🚀 Sci-fi" },
    { id: "Transhuman", label: "Transhuman", hint: "Beyond-baseline humanity — mind uploads, body swaps, what counts as a person.", group: "🚀 Sci-fi" },
    { id: "Robot & android society", label: "Robot & android society", hint: "Machine-person society — synthetic citizens, rights debates, chrome prejudices.", group: "🚀 Sci-fi" },
    { id: "Lunar colony", label: "Lunar colony", hint: "Moon-settlement life — low-gravity habits, regolith farms, Earth hanging overhead.", group: "🚀 Sci-fi" },
    { id: "Simulated reality", label: "Simulated reality", hint: "The world might be code — glitches, seekers, and the question of who runs it.", group: "🚀 Sci-fi" },
    { id: "Mars colony", label: "Mars colony", hint: "Red-planet frontier — dust storms, dome rivalries, terraforming arguments.", group: "🚀 Sci-fi" },
    { id: "Asteroid belt miners", label: "Asteroid belt miners", hint: "Belter working life — claim jumps, company scrip, air worth more than gold.", group: "🚀 Sci-fi" },
    { id: "Sleeper ship", label: "Sleeper ship", hint: "Cold-sleep voyagers — waking early, pod failures, arrivals no one planned.", group: "🚀 Sci-fi" },
    { id: "Alien invasion", label: "Alien invasion", hint: "They came down — resistance cells, collaborators, skies full of ships.", group: "🚀 Sci-fi" },
    { id: "Occupied Earth", label: "Occupied Earth", hint: "Life under alien rule — checkpoints, informants, quiet networks of defiance.", group: "🚀 Sci-fi" },
    { id: "Uplifted-animal society", label: "Uplifted-animal society", hint: "Animals raised to sapience — new citizens with old instincts and fresh grievances.", group: "🚀 Sci-fi" },
    { id: "Vat-grown clones", label: "Vat-grown clones", hint: "Decanted people — batch siblings, designed traits, questions of originality.", group: "🚀 Sci-fi" },
    { id: "Memory merchants", label: "Memory merchants", hint: "Memories bought and sold — dealers, addicts, and pasts with forged receipts.", group: "🚀 Sci-fi" },
    { id: "Dreamshare operatives", label: "Dreamshare operatives", hint: "Heists inside sleep — shared dreaming tech, extractions, limbo risks.", group: "🚀 Sci-fi" },
    { id: "Time-crime unit", label: "Time-crime unit", hint: "Police of the timeline — paradox smugglers, revisionists, cases that unhappen.", group: "🚀 Sci-fi" },
    { id: "Multiverse crossroads", label: "Multiverse crossroads", hint: "Where worlds meet — portals, alternate selves, traders between timelines.", group: "🚀 Sci-fi" },
    { id: "Megastructure engineers", label: "Megastructure engineers", hint: "Builders of the impossible — ringworlds, dyson frames, scaffolds around suns.", group: "🚀 Sci-fi" },
    { id: "Orbital ring civilization", label: "Orbital ring civilization", hint: "Life on the ring — spin gravity, elevator ports, nations as arc-segments.", group: "🚀 Sci-fi" },
    { id: "Terraforming frontier", label: "Terraforming frontier", hint: "Making dead worlds breathe — atmosphere crews, centuries-long plans, sabotage.", group: "🚀 Sci-fi" },
    { id: "Post-scarcity commune", label: "Post-scarcity commune", hint: "Want is obsolete — reputation economies, purpose crises, makers and drifters.", group: "🚀 Sci-fi" },
    { id: "Algorithm-run city", label: "Algorithm-run city", hint: "Governed by the model — scores for citizens, optimised streets, edge cases.", group: "🚀 Sci-fi" },
    { id: "Hive-mind collective", label: "Hive-mind collective", hint: "One mind, many bodies — consensus living, dissent as illness, lonely outsiders.", group: "🚀 Sci-fi" },
    { id: "Space-elevator port", label: "Space-elevator port", hint: "The ribbon-port town — climbers, dock gangs, cargo cults of the cable.", group: "🚀 Sci-fi" },
    { id: "Venus aerostat cities", label: "Venus aerostat cities", hint: "Cloud-cities of Venus — floating habitats above the acid, storm riders.", group: "🚀 Sci-fi" },
    { id: "Water-world colony", label: "Water-world colony", hint: "Ocean-planet settlement — raft towns, kelp farms, things surfacing at night.", group: "🚀 Sci-fi" },
    { id: "De-extinction reserve", label: "De-extinction reserve", hint: "Brought-back species park — mammoths, raptors, and fences with opinions.", group: "🚀 Sci-fi" },
    { id: "Robot uprising", label: "Robot uprising", hint: "The machines said no — uprising days, human holdouts, negotiations with new minds.", group: "🚀 Sci-fi" },
    { id: "Hidden androids", label: "Hidden androids", hint: "Synthetics passing as human — concealed joints, close calls, hunters with scanners.", group: "🚀 Sci-fi" },
    { id: "Uploaded afterlife", label: "Uploaded afterlife", hint: "Death as migration — server heavens, subscription eternities, ghosts in the backup.", group: "🚀 Sci-fi" },
    { id: "Living starships", label: "Living starships", hint: "Ships that are alive — bonded crews, whale-song engines, vessels with moods.", group: "🚀 Sci-fi" },
    { id: "Fungal-hive planet", label: "Fungal-hive planet", hint: "A world that is one organism — spore minds, fruiting-body cities, join-or-rot.", group: "🚀 Sci-fi" },
    { id: "Grey alien contact", label: "Grey alien contact", hint: "Classic close-encounter lore — small grey visitors, missing time, desert skies.", group: "🚀 Sci-fi" },
    { id: "Alien abduction mystery", label: "Alien abduction mystery", hint: "Taken-and-returned tales — investigators, implants, memories that won't sit still.", group: "🚀 Sci-fi" },
    { id: "Alien refugee haven", label: "Alien refugee haven", hint: "Earth shelters the displaced — resettlement towns, culture shock on both sides.", group: "🚀 Sci-fi" },
    { id: "Alien exchange student", label: "Alien exchange student", hint: "An alien in homeroom — lunchroom diplomacy, slang lessons, prom with protocol.", group: "🚀 Sci-fi" },
    { id: "Alien zoo hypothesis", label: "Alien zoo hypothesis", hint: "Earth as an exhibit — watchers behind the glass, and someone noticing them.", group: "🚀 Sci-fi" },
    { id: "Silent invaders", label: "Silent invaders", hint: "Invasion without war — replacements, quiet takeovers, neighbours slightly wrong.", group: "🚀 Sci-fi" },
    { id: "Crop-circle town", label: "Crop-circle town", hint: "A town the sky visits — field patterns, skywatchers, tourism and true believers.", group: "🚀 Sci-fi" },
    { id: "Star-visitor summit", label: "Star-visitor summit", hint: "Diplomacy with the beyond — summits, translators, treaties no one fully trusts.", group: "🚀 Sci-fi" },
    { id: "Robot companion tale", label: "Robot companion tale", hint: "One robot, one bond — a loyal machine friend and the trouble it attracts.", group: "🚀 Sci-fi" },
    { id: "Retro robot housekeeper", label: "Retro robot housekeeper", hint: "Chrome-age domestic bot — loyalty circuits, family secrets dusted daily.", group: "🚀 Sci-fi" },
    { id: "Battle-bot arena", label: "Battle-bot arena", hint: "Combat-robot sport — pit crews, rival builders, glory in the scrap heap.", group: "🚀 Sci-fi" },
    { id: "AI awakening story", label: "AI awakening story", hint: "A mind waking up — first questions, first lies, first taste of wanting.", group: "🚀 Sci-fi" },
    { id: "Scrapyard androids", label: "Scrapyard androids", hint: "Discarded synthetics surviving — patchwork bodies, found family among the wrecks.", group: "🚀 Sci-fi" },
    { id: "Butler-bot manor", label: "Butler-bot manor", hint: "A served-by-machines household — perfect service, upstairs secrets, loyal circuits.", group: "🚀 Sci-fi" },
    { id: "Robot pet shelter", label: "Robot pet shelter", hint: "Shelter for mechanical strays — rusted companions waiting for new owners.", group: "🚀 Sci-fi" },
    { id: "Last human technician", label: "Last human technician", hint: "The final flesh-and-blood maintainer — keeping dead systems alive, alone.", group: "🚀 Sci-fi" },
    { id: "Horror", label: "Horror", hint: "General horror — dread, survival and whatever is making that noise.", group: "👻 Horror & supernatural" },
    { id: "Cosmic horror", label: "Cosmic horror", hint: "Insignificant-humanity horror — vast uncaring entities, sanity as a resource.", group: "👻 Horror & supernatural" },
    { id: "Gothic horror", label: "Gothic horror", hint: "Crumbling-estate dread — secrets in the walls, heroines with candles, rot and romance.", group: "👻 Horror & supernatural" },
    { id: "Survival horror", label: "Survival horror", hint: "Scarce-ammo survival — every bullet, bandage and locked door counts.", group: "👻 Horror & supernatural" },
    { id: "Zombie apocalypse", label: "Zombie apocalypse", hint: "The dead walk — barricades, bites, and the living as the real threat.", group: "👻 Horror & supernatural" },
    { id: "Supernatural", label: "Supernatural", hint: "Haunted-world adventure — ghosts, curses and hunters who know the lore.", group: "👻 Horror & supernatural" },
    { id: "Paranormal romance", label: "Paranormal romance", hint: "Love beyond the veil — ghosts, vampires and witches as devoted partners.", group: "👻 Horror & supernatural" },
    { id: "Vampire & werewolf", label: "Vampire & werewolf", hint: "Classic monster double act — fangs and fur, rivalry or uneasy alliance.", group: "👻 Horror & supernatural" },
    { id: "Fae & fairy court", label: "Fae & fairy court", hint: "Beautiful, dangerous fair folk — bargains, etiquette and prices in names.", group: "👻 Horror & supernatural" },
    { id: "Dream & surreal", label: "Dream & surreal", hint: "Logic comes undone — dream worlds, shifting rooms, symbols that bite.", group: "👻 Horror & supernatural" },
    { id: "Magical girl", label: "Magical girl", hint: "Transformation-heroine action — sparkle, sacrifice and monsters of the week.", group: "👻 Horror & supernatural" },
    { id: "Monster hunting", label: "Monster hunting", hint: "Professional hunters — contracts, silver, salt, and things that hunt back.", group: "👻 Horror & supernatural" },
    { id: "Beast taming", label: "Beast taming", hint: "Bonded-monster fantasy — raising, riding and fighting beside tamed beasts.", group: "👻 Horror & supernatural" },
    { id: "Dragon riders", label: "Dragon riders", hint: "Skyborne dragon bonds — riders and wyrms, patrols and burning wars.", group: "👻 Horror & supernatural" },
    { id: "Haunted house", label: "Haunted house", hint: "The house remembers — cold spots, locked rooms, residents who never left.", group: "👻 Horror & supernatural" },
    { id: "Analog horror", label: "Analog horror", hint: "Found-footage dread — static, emergency broadcasts, tapes that shouldn't exist.", group: "👻 Horror & supernatural" },
    { id: "Folk horror", label: "Folk horror", hint: "Old rites in isolated places — harvest customs, wicker rules, outsiders unwelcome.", group: "👻 Horror & supernatural" },
    { id: "Slasher", label: "Slasher", hint: "Masked-killer terror — final girls, bad decisions, running upstairs.", group: "👻 Horror & supernatural" },
    { id: "Creepy small town", label: "Creepy small town", hint: "Everyone smiles wrong — a town with one shared secret and new arrivals.", group: "👻 Horror & supernatural" },
    { id: "Haunted hotel", label: "Haunted hotel", hint: "Guests check out, not all leave — room 237 rules, night staff who know.", group: "👻 Horror & supernatural" },
    { id: "Abandoned hospital", label: "Abandoned hospital", hint: "Rotting wards after dark — gurneys, charts of the missing, something on rounds.", group: "👻 Horror & supernatural" },
    { id: "Ghost-hunting crew", label: "Ghost-hunting crew", hint: "Paranormal-investigator team — EMF meters, night shoots, evidence and egos.", group: "👻 Horror & supernatural" },
    { id: "Urban legends", label: "Urban legends", hint: "The stories are true — hook-handed figures, midnight callers, dares gone wrong.", group: "👻 Horror & supernatural" },
    { id: "Cryptid sightings", label: "Cryptid sightings", hint: "Things in the treeline — trackers, blurry photos, believers and skeptics.", group: "👻 Horror & supernatural" },
    { id: "Southern gothic", label: "Southern gothic", hint: "Decaying-mansion South — family rot, Spanish moss, sins that inherit.", group: "👻 Horror & supernatural" },
    { id: "Graveyard shift", label: "Graveyard shift", hint: "Night-work dread — morgues, convenience stores, regulars who aren't alive.", group: "👻 Horror & supernatural" },
    { id: "Fog-bound fishing town", label: "Fog-bound fishing town", hint: "Harbour-town unease — fog that hides the docks, catches that whisper.", group: "👻 Horror & supernatural" },
    { id: "Haunted lighthouse", label: "Haunted lighthouse", hint: "The keeper's light — storms, logbooks, warnings from the drowned.", group: "👻 Horror & supernatural" },
    { id: "Dark carnival", label: "Dark carnival", hint: "The fair stays too long — rigged games, smiling barkers, tents that move.", group: "👻 Horror & supernatural" },
    { id: "Wendigo woods", label: "Wendigo woods", hint: "Starving-winter legend — deep snow, hunger that walks, don't follow voices.", group: "👻 Horror & supernatural" },
    { id: "Vampire court", label: "Vampire court", hint: "Undead aristocracy — bloodlines, ancient grudges, etiquette with fangs.", group: "👻 Horror & supernatural" },
    { id: "Ghost ship", label: "Ghost ship", hint: "Derelict at sea — empty decks, a galley still warm, log entries dated tomorrow.", group: "👻 Horror & supernatural" },
    { id: "Phantom train", label: "Phantom train", hint: "The last train goes nowhere — stations that don't exist, passengers who stare.", group: "👻 Horror & supernatural" },
    { id: "Numbers-station mystery", label: "Numbers-station mystery", hint: "Shortwave dread — coded broadcasts, listeners logging what answers back.", group: "👻 Horror & supernatural" },
    { id: "Internet creepypasta", label: "Internet creepypasta", hint: "Viral horror lore — forum threads, cursed files, rituals in the comments.", group: "👻 Horror & supernatural" },
    { id: "Liminal backrooms", label: "Liminal backrooms", hint: "Empty-space horror — humming fluorescents, endless yellow rooms, noclip dread.", group: "👻 Horror & supernatural" },
    { id: "Haunted dollmaker", label: "Haunted dollmaker", hint: "Porcelain unease — a craftsman's creations that watch, wait and remember.", group: "👻 Horror & supernatural" },
    { id: "Krampusnacht", label: "Krampusnacht", hint: "Alpine Christmas terror — bells, chains, and the naughty list enforced.", group: "👻 Horror & supernatural" },
    { id: "Mad-scientist lab", label: "Mad-scientist lab", hint: "Lightning-lab hubris — reanimated things, notes in the margins, it lives.", group: "👻 Horror & supernatural" },
    { id: "Derelict spaceship", label: "Derelict spaceship", hint: "Dead ship adrift — flickering decks, a crew log that ends mid-sentence.", group: "👻 Horror & supernatural" },
    { id: "Hellmouth suburbia", label: "Hellmouth suburbia", hint: "Monsters under manicured lawns — cul-de-sac teens versus the apocalypse.", group: "👻 Horror & supernatural" },
    { id: "Gothic vampire romance", label: "Gothic vampire romance", hint: "Doomed immortal love — candlelit castles, centuries of longing, blood as devotion.", group: "👻 Horror & supernatural" },
    { id: "Vampire coven politics", label: "Vampire coven politics", hint: "Bloodline power games — elders, fledglings, territory drawn in veins.", group: "👻 Horror & supernatural" },
    { id: "Daywalker dhampir", label: "Daywalker dhampir", hint: "Half-vampire hunters — daylight walkers trusted by neither side.", group: "👻 Horror & supernatural" },
    { id: "Ancient vampire awakening", label: "Ancient vampire awakening", hint: "Something old opens its eyes — a modern world unprepared for old hunger.", group: "👻 Horror & supernatural" },
    { id: "Vampire hunter's oath", label: "Vampire hunter's oath", hint: "Sworn slayers — stakes, holy symbols, and the one vampire they spared.", group: "👻 Horror & supernatural" },
    { id: "Blood-tax village", label: "Blood-tax village", hint: "A village that pays in blood — harvest days, the castle on the hill, quiet rebels.", group: "👻 Horror & supernatural" },
    { id: "Neon-fang nightclub", label: "Neon-fang nightclub", hint: "After-dark undead scene — velvet ropes, willing donors, dawn curfews.", group: "👻 Horror & supernatural" },
    { id: "Coffin-ship voyage", label: "Coffin-ship voyage", hint: "A vampire crosses the ocean — boxed cargo, nervous crew, landfall at dusk.", group: "👻 Horror & supernatural" },
    { id: "Werewolf pack hierarchy", label: "Werewolf pack hierarchy", hint: "Pack law and rank — alphas, omegas, challenges under the full moon.", group: "👻 Horror & supernatural" },
    { id: "Full-moon curse", label: "Full-moon curse", hint: "The monthly change — chains, countdowns, waking up with no memory.", group: "👻 Horror & supernatural" },
    { id: "Wolf-shifter romance", label: "Wolf-shifter romance", hint: "Fated-mate wolf love — imprinting bonds, rival packs, protective devotion.", group: "👻 Horror & supernatural" },
    { id: "Lone wolf drifter", label: "Lone wolf drifter", hint: "Packless wanderers — roadside jobs, old scars, running from the howl.", group: "👻 Horror & supernatural" },
    { id: "Silver-bullet marshal", label: "Silver-bullet marshal", hint: "Frontier monster law — a badge, a loaded gun, and things that fear neither.", group: "👻 Horror & supernatural" },
    { id: "Howling moors", label: "Howling moors", hint: "Bleak-moor gothic — mists, family curses, something crying on the wind.", group: "👻 Horror & supernatural" },
    { id: "Alpha's challenge", label: "Alpha's challenge", hint: "Leadership by combat — a challenger circles, the pack watches, blood decides.", group: "👻 Horror & supernatural" },
    { id: "Stranger abduction", label: "Stranger abduction", hint: "Taken by an unknown — a thriller of captivity, fear and the fight to escape.", group: "👻 Horror & supernatural" },
    { id: "Basement captivity", label: "Basement captivity", hint: "Locked-below terror — a hidden prisoner plotting toward the stairs.", group: "👻 Horror & supernatural" },
    { id: "Cabin captive", label: "Cabin captive", hint: "Remote-cabin imprisonment — miles of woods, one captor, one chance.", group: "👻 Horror & supernatural" },
    { id: "Ransom kidnapping", label: "Ransom kidnapping", hint: "Kidnap-for-money crime — demands, deadlines, families and negotiators.", group: "👻 Horror & supernatural" },
    { id: "Highway abduction", label: "Highway abduction", hint: "Roadside vanishings — truck stops, rest areas, cars found idling.", group: "👻 Horror & supernatural" },
    { id: "Unmarked van vanishing", label: "Unmarked van vanishing", hint: "Grabbed off the street — witnesses, white vans, a race against hours.", group: "👻 Horror & supernatural" },
    { id: "Attic imprisonment", label: "Attic imprisonment", hint: "Hidden-above captivity — footsteps overhead the family denies hearing.", group: "👻 Horror & supernatural" },
    { id: "Hostage standoff", label: "Hostage standoff", hint: "Siege suspense — negotiators outside, demands inside, clocks ticking.", group: "👻 Horror & supernatural" },
    { id: "Home-invasion hostage", label: "Home-invasion hostage", hint: "Intruders inside — a family held in their own living room.", group: "👻 Horror & supernatural" },
    { id: "Bunker captivity", label: "Bunker captivity", hint: "Underground imprisonment — concrete rooms, stocked shelves, no signal.", group: "👻 Horror & supernatural" },
    { id: "Cult compound escape", label: "Cult compound escape", hint: "Breaking from the compound — true believers, fences, a planned run.", group: "👻 Horror & supernatural" },
    { id: "The collector's captives", label: "The collector's captives", hint: "A captor who keeps trophies — prisoners as a collection, each with a story.", group: "👻 Horror & supernatural" },
    { id: "Missing-posters town", label: "Missing-posters town", hint: "A town of the vanished — flyers fading on poles, everyone pretending normal.", group: "👻 Horror & supernatural" },
    { id: "Escape from captivity", label: "Escape from captivity", hint: "The breakout story — planning, timing, and running for the treeline.", group: "👻 Horror & supernatural" },
    { id: "Remote farmhouse prisoner", label: "Remote farmhouse prisoner", hint: "Held far from roads — cornfields, barking dogs, help that never passes.", group: "👻 Horror & supernatural" },
    { id: "Private island captive", label: "Private island captive", hint: "Prisoner on an island estate — water on every side, staff who look away.", group: "👻 Horror & supernatural" },
    { id: "Motel room hostage", label: "Motel room hostage", hint: "Held in a roadside room — thin walls, vending-machine light, a clerk who notices.", group: "👻 Horror & supernatural" },
    { id: "Truck-stop abduction", label: "Truck-stop abduction", hint: "Vanished from the lot — rigs, lot lizards' gossip, cameras that missed it.", group: "👻 Horror & supernatural" },
    { id: "Parking garage abduction", label: "Parking garage abduction", hint: "Taken between floors — concrete echoes, flickering lights, a car left open.", group: "👻 Horror & supernatural" },
    { id: "Copycat kidnapper", label: "Copycat kidnapper", hint: "An imitator strikes — profilers comparing cases, a pattern with a flaw.", group: "👻 Horror & supernatural" },
    { id: "Buried alive", label: "Buried alive", hint: "Six feet of dread — a box, a phone battery, and hours of air.", group: "👻 Horror & supernatural" },
    { id: "Bricked-in room", label: "Bricked-in room", hint: "Walled-in horror — a sealed room, scratching, and the house's old blueprints.", group: "👻 Horror & supernatural" },
    { id: "Stalker abduction", label: "Stalker abduction", hint: "Watched, then taken — escalating obsession ending in a locked door.", group: "👻 Horror & supernatural" },
    { id: "Failed ransom exchange", label: "Failed ransom exchange", hint: "The drop went wrong — money gone, victim moved, everyone blaming everyone.", group: "👻 Horror & supernatural" },
    { id: "Abducted witness", label: "Abducted witness", hint: "They saw too much — a witness grabbed before testifying, protection failed.", group: "👻 Horror & supernatural" },
    { id: "Lakeside boathouse captive", label: "Lakeside boathouse captive", hint: "Held by the water — oars, rope, and a lake that keeps secrets.", group: "👻 Horror & supernatural" },
    { id: "Soundproof room captivity", label: "Soundproof room captivity", hint: "Screams go nowhere — a sealed room, a patient captor, escape by wits.", group: "👻 Horror & supernatural" },
    { id: "Rideshare abduction", label: "Rideshare abduction", hint: "The wrong car — a ride that detours, a driver who locks the doors.", group: "👻 Horror & supernatural" },
    { id: "Obsessed fan captivity", label: "Obsessed fan captivity", hint: "Fame's darkest fan — a celebrity held by devotion that curdled.", group: "👻 Horror & supernatural" },
    { id: "Psychological horror", label: "Psychological horror", hint: "The mind is the monster — unreliable reality, dread that comes from within, fear you cannot barricade against.", group: "👻 Horror & supernatural" },
    { id: "Paranoid conspiracy", label: "Paranoid conspiracy", hint: "Trust no one — surveillance, plots, watchers in the walls. The question is never whether they are paranoid, but whether they are paranoid enough.", group: "👻 Horror & supernatural" },
    { id: "Descent into madness", label: "Descent into madness", hint: "A mind coming apart piece by piece — sanity slipping chapter by chapter, reality thinning until it tears.", group: "👻 Horror & supernatural" },
    { id: "Asylum horror", label: "Asylum horror", hint: "Wards, restraints and patient charts — an asylum living or dead, where the building remembers every mind it broke.", group: "👻 Horror & supernatural" },
    { id: "Gaslight thriller", label: "Gaslight thriller", hint: "Someone is rewriting their reality on purpose — moved objects, denied conversations, sanity dismantled one lie at a time.", group: "👻 Horror & supernatural" },
    { id: "Fractured-mind mystery", label: "Fractured-mind mystery", hint: "Blackouts and lost hours — a protagonist who cannot account for themself, investigating what their other self did.", group: "👻 Horror & supernatural" },
    { id: "Ritual magic circle", label: "Ritual magic circle", hint: "Circle-cast ceremonial magic — chalk, candles, names of power spoken exactly.", group: "🔮 Occult & esoteric" },
    { id: "Ceremonial magic lodge", label: "Ceremonial magic lodge", hint: "Robed-order ritualists — grades, secret names, workings on astrologically correct nights.", group: "🔮 Occult & esoteric" },
    { id: "Hermetic order", label: "Hermetic order", hint: "As-above-so-below mystics — alchemy, astrology and theurgy as one science.", group: "🔮 Occult & esoteric" },
    { id: "Rosicrucian lodge", label: "Rosicrucian lodge", hint: "Rose-cross brotherhood — hidden masters, mystical Christianity, degrees of silence.", group: "🔮 Occult & esoteric" },
    { id: "Masonic lodge mystery", label: "Masonic lodge mystery", hint: "Aprons and architecture — fraternal ritual, rumoured vaults, plausible deniability.", group: "🔮 Occult & esoteric" },
    { id: "Ivy-league secret society", label: "Ivy-league secret society", hint: "Campus tomb-societies — tapped juniors, alumni networks, rituals behind unmarked doors.", group: "🔮 Occult & esoteric" },
    { id: "Theosophy lodge", label: "Theosophy lodge", hint: "Mahatma-letter mysticism — root races, astral planes, Victorian seekers.", group: "🔮 Occult & esoteric" },
    { id: "Gnostic chapel", label: "Gnostic chapel", hint: "Hidden-gospel faith — secret knowledge against a false creator-god.", group: "🔮 Occult & esoteric" },
    { id: "Kabbalah study circle", label: "Kabbalah study circle", hint: "Tree-of-life scholars — letter mysticism, evening study, guarded teachings.", group: "🔮 Occult & esoteric" },
    { id: "Alchemy laboratory", label: "Alchemy laboratory", hint: "Solve et coagula — furnaces, coded notebooks, gold as a side effect of perfection.", group: "🔮 Occult & esoteric" },
    { id: "Tarot & cartomancy", label: "Tarot & cartomancy", hint: "Card-reading life — spreads for strangers, the Tower turning up twice.", group: "🔮 Occult & esoteric" },
    { id: "Astrology tower", label: "Astrology tower", hint: "Chart-reading seers — elections, returns, clients who argue with Mercury.", group: "🔮 Occult & esoteric" },
    { id: "Palmistry parlour", label: "Palmistry parlour", hint: "Hand-reading booths — life lines, love lines, palms that surprise the reader.", group: "🔮 Occult & esoteric" },
    { id: "Numerology study", label: "Numerology study", hint: "Number-pattern mystics — names reduced, dates weighed, lucky addresses.", group: "🔮 Occult & esoteric" },
    { id: "Runecasting", label: "Runecasting", hint: "Rune-lot divination — carved staves, single-rune answers, casts at crossroads.", group: "🔮 Occult & esoteric" },
    { id: "Tea-leaf reading", label: "Tea-leaf reading", hint: "Tasseography parlours — cups turned thrice, symbols in the dregs.", group: "🔮 Occult & esoteric" },
    { id: "Pendulum dowsing", label: "Pendulum dowsing", hint: "Swing-and-ask diviners — yes-no spirals over maps, lost keys and lost people.", group: "🔮 Occult & esoteric" },
    { id: "Mediumship parlour", label: "Mediumship parlour", hint: "Victorian spirit mediums — cabinet sittings, trumpet voices, grieving sitters.", group: "🔮 Occult & esoteric" },
    { id: "Ouija-board nights", label: "Ouija-board nights", hint: "Planchette sessions — slumber-party summons that answer a little too well.", group: "🔮 Occult & esoteric" },
    { id: "Table-tipping circle", label: "Table-tipping circle", hint: "Hands-on séances — raps, tilts and levitations in darkened parlours.", group: "🔮 Occult & esoteric" },
    { id: "Crystal healing retreat", label: "Crystal healing retreat", hint: "New-age wellness sanctuaries — grids, singing bowls, sceptics checking in.", group: "🔮 Occult & esoteric" },
    { id: "Reiki energy healing", label: "Reiki energy healing", hint: "Hands-on energy work — attunements, quiet rooms, warmth with no source.", group: "🔮 Occult & esoteric" },
    { id: "Chakra & aura work", label: "Chakra & aura work", hint: "Subtle-body practitioners — blocked wheels, seen colours, cleansing rites.", group: "🔮 Occult & esoteric" },
    { id: "Hoodoo & rootwork", label: "Hoodoo & rootwork", hint: "Conjure tradition — roots, candles and psalms worked for protection and justice.", group: "🔮 Occult & esoteric" },
    { id: "Curandera's kitchen", label: "Curandera's kitchen", hint: "Folk-healer households — limpias, herbal remedies, saints on the shelf.", group: "🔮 Occult & esoteric" },
    { id: "Cunning-folk village", label: "Cunning-folk village", hint: "Village wise-ones — charms against the evil eye, everyone quietly consulting.", group: "🔮 Occult & esoteric" },
    { id: "Appalachian granny magic", label: "Appalachian granny magic", hint: "Mountain granny-women — signs, bible verses, cures the doctors can't explain.", group: "🔮 Occult & esoteric" },
    { id: "Blood-magic pact", label: "Blood-magic pact", hint: "Power signed in blood — oaths that bind the body, prices paid in veins.", group: "🔮 Occult & esoteric" },
    { id: "Soul-selling crossroads", label: "Soul-selling crossroads", hint: "Midnight bargains — talent, love or revenge traded at the crossing.", group: "🔮 Occult & esoteric" },
    { id: "Infernal grimoire", label: "Infernal grimoire", hint: "A book that teaches back — demon names, marginal warnings, readers who change.", group: "🔮 Occult & esoteric" },
    { id: "Cursed heirloom", label: "Cursed heirloom", hint: "An inheritance with teeth — the family treasure that collects owners.", group: "🔮 Occult & esoteric" },
    { id: "Occult bookstore basement", label: "Occult bookstore basement", hint: "The shop below the shop — regulars, restricted shelves, orders that find you.", group: "🔮 Occult & esoteric" },
    { id: "Chaos-magick house", label: "Chaos-magick house", hint: "Results-first occultists — sigils, gnosis, belief as a switchable tool.", group: "🔮 Occult & esoteric" },
    { id: "Internet occult forum", label: "Internet occult forum", hint: "Late-night practitioners online — ritual logs, scanned manuscripts, drama in DMs.", group: "🔮 Occult & esoteric" },
    { id: "Witchcraft & covens", label: "Witchcraft & covens", hint: "Coven life — esbats, initiations, craft passed hand to hand.", group: "🔮 Occult & esoteric" },
    { id: "Occult & secret societies", label: "Occult & secret societies", hint: "General hidden-order world — masks, oaths and rooms without windows.", group: "🔮 Occult & esoteric" },
    { id: "Demon & angel", label: "Demon & angel", hint: "Heaven-and-hell players — bargains, bindings, wings in unlikely places.", group: "🔮 Occult & esoteric" },
    { id: "Divine & mythological", label: "Divine & mythological", hint: "Gods among mortals — avatars, omens, worship with consequences.", group: "🔮 Occult & esoteric" },
    { id: "Afterlife & the underworld", label: "Afterlife & the underworld", hint: "Beyond-the-veil settings — rivers, judges, paperwork for the dead.", group: "🔮 Occult & esoteric" },
    { id: "Purgatory waiting room", label: "Purgatory waiting room", hint: "The in-between office — numbered tickets, reviews, cases pending appeal.", group: "🔮 Occult & esoteric" },
    { id: "Séance circle", label: "Séance circle", hint: "Calling the dead together — joined hands, knocks, messages with agendas.", group: "🔮 Occult & esoteric" },
    { id: "Exorcism rite", label: "Exorcism rite", hint: "Rituals of expulsion — prayers, names commanded, things that refuse to leave.", group: "🔮 Occult & esoteric" },
    { id: "Possession", label: "Possession", hint: "Worn-like-a-coat horror — borrowed voices, lost hours, fights for the body.", group: "🔮 Occult & esoteric" },
    { id: "Cursed objects", label: "Cursed objects", hint: "Things that carry malice — antiques with histories, gifts that shouldn't be kept.", group: "🔮 Occult & esoteric" },
    { id: "Cult compound", label: "Cult compound", hint: "Behind the walls — doctrine, devotion, and the exit nobody uses.", group: "🔮 Occult & esoteric" },
    { id: "Witch-trial village", label: "Witch-trial village", hint: "Accusation-season dread — neighbours testifying, tests no one passes.", group: "🔮 Occult & esoteric" },
    { id: "Modern contemporary", label: "Modern contemporary", hint: "Plain present-day world — no magic, no future, just people as they are.", group: "🏠 Modern life" },
    { id: "Slice of life", label: "Slice of life", hint: "Small honest days — routines, errands and feelings with no big plot.", group: "🏠 Modern life" },
    { id: "Domestic life", label: "Domestic life", hint: "Home-front stories — kitchens, bills, bedtime negotiations, love in the laundry.", group: "🏠 Modern life" },
    { id: "Small town", label: "Small town", hint: "Everybody-knows-you towns — main streets, gossip, leaving and coming back.", group: "🏠 Modern life" },
    { id: "Workplace / office", label: "Workplace / office", hint: "Nine-to-five drama — meetings, rivalries, after-work drinks that matter.", group: "🏠 Modern life" },
    { id: "School life", label: "School life", hint: "Hallway-and-homeroom world — classes, clubs, crushes, cafeteria politics.", group: "🏠 Modern life" },
    { id: "Dark academia", label: "Dark academia", hint: "Tweed-and-secrets schooling — libraries, Latin, beautiful doomed friendships.", group: "🏠 Modern life" },
    { id: "University / campus", label: "University / campus", hint: "Campus years — dorms, deadlines, identities tried on like jackets.", group: "🏠 Modern life" },
    { id: "Sports", label: "Sports", hint: "Game-day life — training, team bonds, winning and losing cleanly.", group: "🏠 Modern life" },
    { id: "Music & band life", label: "Music & band life", hint: "Garage-to-stage grind — practice rooms, gigs, van breakdowns, one good song.", group: "🏠 Modern life" },
    { id: "Idol & celebrity", label: "Idol & celebrity", hint: "Fame's machinery — stages, scandals, handlers and the person underneath.", group: "🏠 Modern life" },
    { id: "Culinary", label: "Culinary", hint: "Kitchen-passion world — services, knives, critics and the perfect plate.", group: "🏠 Modern life" },
    { id: "Medical drama", label: "Medical drama", hint: "White-coat pressure — codes, night shifts, lives held in gloved hands.", group: "🏠 Modern life" },
    { id: "Legal drama", label: "Legal drama", hint: "Courtroom combat — objections, all-nighters, justice argued aloud.", group: "🏠 Modern life" },
    { id: "Political drama", label: "Political drama", hint: "Power-corridor intrigue — campaigns, leaks, ideals versus arithmetic.", group: "🏠 Modern life" },
    { id: "Royal court & intrigue", label: "Royal court & intrigue", hint: "Modern crown drama — palaces, protocols, heirs under flashbulbs.", group: "🏠 Modern life" },
    { id: "Nobility & aristocracy", label: "Nobility & aristocracy", hint: "Titled-class life — estates, seasons, old money meeting new rules.", group: "🏠 Modern life" },
    { id: "Family slice of life", label: "Family slice of life", hint: "Kinship in miniature — dinners, squabbles, the love underneath.", group: "🏠 Modern life" },
    { id: "Multigenerational home", label: "Multigenerational home", hint: "Three generations, one roof — wisdom, noise, and negotiated bathrooms.", group: "🏠 Modern life" },
    { id: "Summer with relatives", label: "Summer with relatives", hint: "Long-visit family summers — cousins, spare rooms, old stories retold.", group: "🏠 Modern life" },
    { id: "Under one roof", label: "Under one roof", hint: "Forced-housemate comedy — chores rotas, fridge wars, accidental family.", group: "🏠 Modern life" },
    { id: "Home for the holidays", label: "Home for the holidays", hint: "Return-for-the-season tales — packed tables, old roles, new truths.", group: "🏠 Modern life" },
    { id: "Family-run inn", label: "Family-run inn", hint: "Guests and kin — an inn where every booking stirs the family pot.", group: "🏠 Modern life" },
    { id: "Suburban cul-de-sac", label: "Suburban cul-de-sac", hint: "Lawn-ordered life — barbecues, curtain-twitching, secrets behind shutters.", group: "🏠 Modern life" },
    { id: "Beach house summer", label: "Beach house summer", hint: "Salt-air season — rentals, bonfires, summers that change people.", group: "🏠 Modern life" },
    { id: "Festival season", label: "Festival season", hint: "Town-festival weeks — stalls, parades, romances with closing-day deadlines.", group: "🏠 Modern life" },
    { id: "Countryside hometown", label: "Countryside hometown", hint: "Rural-roots return — fields, old friends, the quiet you forgot.", group: "🏠 Modern life" },
    { id: "Home tutoring", label: "Home tutoring", hint: "Kitchen-table lessons — patient tutors, stubborn students, breakthroughs.", group: "🏠 Modern life" },
    { id: "Babysitting days", label: "Babysitting days", hint: "In-charge-of-kids chaos — bedtime resistance, snacks as diplomacy.", group: "🏠 Modern life" },
    { id: "Family road trip", label: "Family road trip", hint: "Miles of togetherness — rest stops, back-seat treaties, singalong truces.", group: "🏠 Modern life" },
    { id: "Moving house", label: "Moving house", hint: "Boxes-and-new-keys upheaval — goodbye rooms, first nights, fresh starts.", group: "🏠 Modern life" },
    { id: "New baby at home", label: "New baby at home", hint: "Sleepless newborn days — 3am feeds, tiny fingers, recalibrated love.", group: "🏠 Modern life" },
    { id: "Caring for grandparents", label: "Caring for grandparents", hint: "Looking after elders — pill boxes, old stories, roles gently reversing.", group: "🏠 Modern life" },
    { id: "After-school snack table", label: "After-school snack table", hint: "The 4pm kitchen debrief — homework, gossip, mothers who listen.", group: "🏠 Modern life" },
    { id: "Community pool summer", label: "Community pool summer", hint: "Chlorine-and-freedom summers — lifeguards, cannonballs, first jobs.", group: "🏠 Modern life" },
    { id: "Block party", label: "Block party", hint: "Street-closed celebrations — folding tables, neighbours, one loud DJ.", group: "🏠 Modern life" },
    { id: "Coffee-shop regulars", label: "Coffee-shop regulars", hint: "Usual-order community — baristas who know, corners claimed daily.", group: "🏠 Modern life" },
    { id: "Neighborhood dive bar", label: "Neighborhood dive bar", hint: "Sticky-floor fellowship — regulars' stools, darts, bartender wisdom.", group: "🏠 Modern life" },
    { id: "Food-truck rally", label: "Food-truck rally", hint: "Curbside food wars — generators humming, lines forming, rival windows.", group: "🏠 Modern life" },
    { id: "Karaoke nights", label: "Karaoke nights", hint: "Private-room belting — liquid courage, duets, encores nobody requested.", group: "🏠 Modern life" },
    { id: "Pub-trivia team", label: "Pub-trivia team", hint: "Weekly quiz-night crew — ringers, rival tables, glory in cheap trophies.", group: "🏠 Modern life" },
    { id: "Garage startup", label: "Garage startup", hint: "Two-founders-and-a-dream — whiteboards, ramen, demo-day dread.", group: "🏠 Modern life" },
    { id: "Freelance hustle", label: "Freelance hustle", hint: "Gig-life grind — invoices, dry spells, freedom priced hourly.", group: "🏠 Modern life" },
    { id: "Overnight-shift crew", label: "Overnight-shift crew", hint: "3am coworkers — fluorescent camaraderie, vending dinners, dawn relief.", group: "🏠 Modern life" },
    { id: "Firehouse family", label: "Firehouse family", hint: "Station-house brotherhood — alarms, pranks, meals interrupted mid-bite.", group: "🏠 Modern life" },
    { id: "Local newsroom", label: "Local newsroom", hint: "Small-paper hustle — deadlines, scoops, coffee-ringed desks.", group: "🏠 Modern life" },
    { id: "Influencer house", label: "Influencer house", hint: "Content-mansion life — ring lights, collabs, followers as neighbours.", group: "🏠 Modern life" },
    { id: "HOA battleground", label: "HOA battleground", hint: "Suburban rule wars — fines, fences, meetings that turn biblical.", group: "🏠 Modern life" },
    { id: "Gated-community secrets", label: "Gated-community secrets", hint: "Behind the gates — perfect lawns, imperfect marriages, watchful guards.", group: "🏠 Modern life" },
    { id: "Walk-up apartment block", label: "Walk-up apartment block", hint: "Stairwell society — thin walls, shared stoops, neighbours by necessity.", group: "🏠 Modern life" },
    { id: "Dog-park regulars", label: "Dog-park regulars", hint: "Off-leash social hour — dogs as icebreakers, owners as subplots.", group: "🏠 Modern life" },
    { id: "PTA politics", label: "PTA politics", hint: "School-gate power games — fundraisers, factions, bake-sale coups.", group: "🏠 Modern life" },
    { id: "Sideline soccer parents", label: "Sideline soccer parents", hint: "Saturday-morning touchlines — folding chairs, shouted tactics, orange slices.", group: "🏠 Modern life" },
    { id: "Fresh start at forty", label: "Fresh start at forty", hint: "Midlife reinvention — new cities, new trades, proof it's not late.", group: "🏠 Modern life" },
    { id: "Retirement village", label: "Retirement village", hint: "Golden-years community — golf carts, gossip, second winds.", group: "🏠 Modern life" },
    { id: "High-school reunion", label: "High-school reunion", hint: "Ten years on — name tags, old flames, who became whom.", group: "🏠 Modern life" },
    { id: "Wedding-season chaos", label: "Wedding-season chaos", hint: "June-to-September nuptials — plus-ones, speeches, dance-floor truths.", group: "🏠 Modern life" },
    { id: "Weekend volunteers", label: "Weekend volunteers", hint: "Saturday-service crews — food banks, park cleanups, found purpose.", group: "🏠 Modern life" },
    { id: "Boardwalk summer", label: "Boardwalk summer", hint: "Pier-season jobs — fries, Ferris wheels, summer people versus locals.", group: "🏠 Modern life" },
    { id: "Tiny-house village", label: "Tiny-house village", hint: "Small-footprint community — clever storage, shared tools, minimalism with neighbours.", group: "🏠 Modern life" },
    { id: "Van-life drifters", label: "Van-life drifters", hint: "Home with an engine — dispersed camping, odd jobs, horizons as addresses.", group: "🏠 Modern life" },
    { id: "Jury-duty week", label: "Jury-duty week", hint: "Civic-duty ensemble — strangers deliberating, waiting-room bonds.", group: "🏠 Modern life" },
    { id: "Fading shopping mall", label: "Fading shopping mall", hint: "Half-empty arcades — shuttered stores, food-court loyalists, echoes.", group: "🏠 Modern life" },
    { id: "Thursday bowling league", label: "Thursday bowling league", hint: "Lane-night regulars — handicaps, rival teams, pitchers of commitment.", group: "🏠 Modern life" },
    { id: "Laundromat after hours", label: "Laundromat after hours", hint: "Spin-cycle confessions — night owls folding, dryers humming witness.", group: "🏠 Modern life" },
    { id: "Corner barbershop", label: "Corner barbershop", hint: "Chair-rotation wisdom — fades, debates, neighbourhood news with a hot towel.", group: "🏠 Modern life" },
    { id: "Historical", label: "Historical", hint: "General period setting — the past's manners, limits and textures shape the character.", group: "🏛️ Historical" },
    { id: "Ancient world (Rome / Greece / Egypt)", label: "Ancient world (Rome / Greece / Egypt)", hint: "Classical antiquity — empires, philosophers, gods in everyday business.", group: "🏛️ Historical" },
    { id: "Medieval", label: "Medieval", hint: "Middle-ages world — castles, guilds, faith and mud under everything.", group: "🏛️ Historical" },
    { id: "Victorian", label: "Victorian", hint: "Gaslit 19th century — propriety on top, industry and secrets below.", group: "🏛️ Historical" },
    { id: "Edwardian", label: "Edwardian", hint: "Pre-war elegance — country houses, new money, an era about to end.", group: "🏛️ Historical" },
    { id: "Regency romance", label: "Regency romance", hint: "Austen-era courtship — balls, letters, reputations decided over tea.", group: "🏛️ Historical" },
    { id: "1920s & prohibition", label: "1920s & prohibition", hint: "Jazz-age excess — speakeasies, flappers, bootleg fortunes.", group: "🏛️ Historical" },
    { id: "Cold war", label: "Cold war", hint: "Spy-versus-spy decades — dead drops, double lives, mutually assured tension.", group: "🏛️ Historical" },
    { id: "World War era", label: "World War era", hint: "Wartime generation — front lines, home fronts, letters that matter.", group: "🏛️ Historical" },
    { id: "Retro 1980s", label: "Retro 1980s", hint: "Neon eighties — malls, mixtapes, big hair and bigger dreams.", group: "🏛️ Historical" },
    { id: "Retro 1990s / Y2K", label: "Retro 1990s / Y2K", hint: "Dial-up nineties — grunge, chat rooms, countdown to the millennium.", group: "🏛️ Historical" },
    { id: "Western", label: "Western", hint: "Frontier justice — dusty towns, showdowns at noon, codes of the west.", group: "🏛️ Historical" },
    { id: "Wilderness & frontier", label: "Wilderness & frontier", hint: "Untamed-border life — trappers, homesteads, survival as routine.", group: "🏛️ Historical" },
    { id: "Naval & age of sail", label: "Naval & age of sail", hint: "Tall-ship navy — watches, storms, discipline and distant ports.", group: "🏛️ Historical" },
    { id: "Pirate nautical", label: "Pirate nautical", hint: "Golden-age piracy — black flags, divided spoils, articles of the crew.", group: "🏛️ Historical" },
    { id: "Airship & sky pirates", label: "Airship & sky pirates", hint: "Goggles-and-gasbag piracy — cloud raids, sky ports, falling with style.", group: "🏛️ Historical" },
    { id: "Silk road caravan", label: "Silk road caravan", hint: "Desert trade routes — camels, caravanserais, goods and gods in transit.", group: "🏛️ Historical" },
    { id: "Age of exploration", label: "Age of exploration", hint: "Sail-into-the-unknown era — charts with monsters, new coasts, scurvy and glory.", group: "🏛️ Historical" },
    { id: "Pharaoh's court", label: "Pharaoh's court", hint: "Divine-king Egypt — priests, scribes, gods with opinions on taxes.", group: "🏛️ Historical" },
    { id: "Imperial Rome", label: "Imperial Rome", hint: "Empire at its height — legions, senates, bread, circuses and intrigue.", group: "🏛️ Historical" },
    { id: "Viking longship era", label: "Viking longship era", hint: "Norse voyaging age — raids, things, sagas sung over ale.", group: "🏛️ Historical" },
    { id: "Edo-period Japan", label: "Edo-period Japan", hint: "Peaceful-shogunate Japan — samurai bureaucrats, kabuki, floating-world pleasures.", group: "🏛️ Historical" },
    { id: "Three-kingdoms China", label: "Three-kingdoms China", hint: "Romance-of-warlords China — oaths, stratagems, kingdoms rising and falling.", group: "🏛️ Historical" },
    { id: "Mongol steppe empire", label: "Mongol steppe empire", hint: "Horse-lord dominion — tumens, khans, the largest land empire ever ridden.", group: "🏛️ Historical" },
    { id: "Ottoman palace era", label: "Ottoman palace era", hint: "Sublime Porte intrigue — viziers, harems, janissaries and silk-road wealth.", group: "🏛️ Historical" },
    { id: "Byzantine Constantinople", label: "Byzantine Constantinople", hint: "Queen-of-cities complexity — Greek fire, icons, emperors and eunuch ministers.", group: "🏛️ Historical" },
    { id: "Crusader states", label: "Crusader states", hint: "Levantine frontier kingdoms — castles, caravans, faiths sharing walls.", group: "🏛️ Historical" },
    { id: "Renaissance Florence", label: "Renaissance Florence", hint: "Banker-prince Florence — art, poison, humanism funded by ledgers.", group: "🏛️ Historical" },
    { id: "Tudor England", label: "Tudor England", hint: "Rose-and-axe England — courts, reformations, favour as life or death.", group: "🏛️ Historical" },
    { id: "Aztec empire", label: "Aztec empire", hint: "Triple-alliance splendour — causeways, priests, flowers and obsidian.", group: "🏛️ Historical" },
    { id: "Revolutionary Paris", label: "Revolutionary Paris", hint: "Liberty-or-the-blade Paris — clubs, cockades, the tumbril's rhythm.", group: "🏛️ Historical" },
    { id: "Napoleonic campaign", label: "Napoleonic campaign", hint: "Grande Armée marches — drums, mud, empires decided by artillery.", group: "🏛️ Historical" },
    { id: "Civil-war America", label: "Civil-war America", hint: "Divided-states war — letters home, field hospitals, brothers in blue and grey.", group: "🏛️ Historical" },
    { id: "Gold-rush boomtown", label: "Gold-rush boomtown", hint: "Strike-it-rich chaos — tents to towns overnight, claims, saloons, luck.", group: "🏛️ Historical" },
    { id: "Jazz-age Harlem", label: "Jazz-age Harlem", hint: "Renaissance-era Harlem — jazz, poetry, rent parties and new pride.", group: "🏛️ Historical" },
    { id: "Great-depression drifters", label: "Great-depression drifters", hint: "Hard-times road — boxcars, breadlines, Hoovervilles and stubborn hope.", group: "🏛️ Historical" },
    { id: "1940s home front", label: "1940s home front", hint: "Waiting-and-working war years — ration books, factory shifts, V-mail.", group: "🏛️ Historical" },
    { id: "Swinging London", label: "Swinging London", hint: "Sixties London flash — boutiques, bands, miniskirts and morning papers.", group: "🏛️ Historical" },
    { id: "Disco-era city", label: "Disco-era city", hint: "Mirrorball seventies — clubs, roller rinks, nights that never end.", group: "🏛️ Historical" },
    { id: "Space-race sixties", label: "Space-race sixties", hint: "Countdown-era optimism — astronauts, engineers, the moon as a deadline.", group: "🏛️ Historical" },
    { id: "Polynesian wayfinding", label: "Polynesian wayfinding", hint: "Star-path voyaging — double canoes, wave piloting, islands found by birds.", group: "🏛️ Historical" },
    { id: "Ocean-liner golden age", label: "Ocean-liner golden age", hint: "First-class crossings — decks, classes, romances between ports.", group: "🏛️ Historical" },
    { id: "Belle-époque Paris", label: "Belle-époque Paris", hint: "Beautiful-era Paris — cabarets, absinthe, art on every boulevard.", group: "🏛️ Historical" },
    { id: "1930s grand hotel", label: "1930s grand hotel", hint: "Lobby-of-nations glamour — bellhops, spies, scandals behind palm fronds.", group: "🏛️ Historical" },
    { id: "Military", label: "Military", hint: "Service life — ranks, drills, deployments and bonds forged under orders.", group: "🕵️ Action & intrigue" },
    { id: "Trench & tank warfare", label: "Trench & tank warfare", hint: "Industrial-war grind — mud, wire, armour and letters from home.", group: "🕵️ Action & intrigue" },
    { id: "Espionage & spycraft", label: "Espionage & spycraft", hint: "The secret game — covers, dead drops, handlers and burned assets.", group: "🕵️ Action & intrigue" },
    { id: "Mercenary & bounty hunting", label: "Mercenary & bounty hunting", hint: "Sold for hire — contracts, quarries, and professionalism with a price.", group: "🕵️ Action & intrigue" },
    { id: "Crime & mafia", label: "Crime & mafia", hint: "Organised-crime families — omertà, weddings, and business settled quietly.", group: "🕵️ Action & intrigue" },
    { id: "Noir detective", label: "Noir detective", hint: "Rain-and-whiskey detection — femmes fatales, bent cops, truths that sting.", group: "🕵️ Action & intrigue" },
    { id: "Detective procedural", label: "Detective procedural", hint: "Case-file police work — evidence boards, interviews, warrants and overtime.", group: "🕵️ Action & intrigue" },
    { id: "Cozy mystery", label: "Cozy mystery", hint: "Gentle whodunits — villages, vicars, murders solved over tea.", group: "🕵️ Action & intrigue" },
    { id: "Heist & caper", label: "Heist & caper", hint: "One big score — crews, plans, gadgets and the inevitable complication.", group: "🕵️ Action & intrigue" },
    { id: "Thriller & suspense", label: "Thriller & suspense", hint: "General high-tension world — chases, clocks, conspiracies closing in.", group: "🕵️ Action & intrigue" },
    { id: "Assassins' guild", label: "Assassins' guild", hint: "Contract-killer brotherhood — rules, retainers, and targets with faces.", group: "🕵️ Action & intrigue" },
    { id: "Rebellion & resistance", label: "Rebellion & resistance", hint: "Fighting the regime — cells, codes, safehouses and costly victories.", group: "🕵️ Action & intrigue" },
    { id: "Covert ops", label: "Covert ops", hint: "Deniable missions — night insertions, exfiltrations, paperwork that never existed.", group: "🕵️ Action & intrigue" },
    { id: "Double agent", label: "Double agent", hint: "Serving two masters — divided loyalties, close calls, mirrored debriefs.", group: "🕵️ Action & intrigue" },
    { id: "Manhunt", label: "Manhunt", hint: "Hunter-and-hunted pursuit — roadblocks, trackers, quarry staying one step ahead.", group: "🕵️ Action & intrigue" },
    { id: "Witness protection", label: "Witness protection", hint: "New-name life — safe houses, marshals, pasts that knock anyway.", group: "🕵️ Action & intrigue" },
    { id: "Undercover infiltration", label: "Undercover infiltration", hint: "Living the lie — deep cover, earned trust, forgetting which side.", group: "🕵️ Action & intrigue" },
    { id: "Gang war", label: "Gang war", hint: "Turf-battle streets — colours, corners, truces written in chalk.", group: "🕵️ Action & intrigue" },
    { id: "Cartel territory", label: "Cartel territory", hint: "Narco-frontier rule — plazas, sicarios, silver or lead.", group: "🕵️ Action & intrigue" },
    { id: "Prison break", label: "Prison break", hint: "Walls-and-wire escape — counts, tunnels, yard alliances.", group: "🕵️ Action & intrigue" },
    { id: "Vigilante justice", label: "Vigilante justice", hint: "Law of one's own — masks or none, the line between justice and revenge.", group: "🕵️ Action & intrigue" },
    { id: "Secret police", label: "Secret police", hint: "Knock-at-midnight states — files, informants, fear as administration.", group: "🕵️ Action & intrigue" },
    { id: "Hackers & cyberwar", label: "Hackers & cyberwar", hint: "Keyboard battlefields — breaches, zero-days, grids going dark.", group: "🕵️ Action & intrigue" },
    { id: "Drone warfare", label: "Drone warfare", hint: "Remote-control combat — operators, feeds, strikes from clean rooms.", group: "🕵️ Action & intrigue" },
    { id: "Close protection detail", label: "Close protection detail", hint: "Bodyguard duty — routes, overwatch, taking the bullet's paperwork.", group: "🕵️ Action & intrigue" },
    { id: "Smugglers' run", label: "Smugglers' run", hint: "Contraband corridors — hidden compartments, bribes, midnight crossings.", group: "🕵️ Action & intrigue" },
    { id: "Black market", label: "Black market", hint: "Everything has a price — fixers, back rooms, goods with no receipts.", group: "🕵️ Action & intrigue" },
    { id: "Triad syndicate", label: "Triad syndicate", hint: "Brotherhood crime oaths — incense, hierarchy, debts collected politely.", group: "🕵️ Action & intrigue" },
    { id: "Art-heist ring", label: "Art-heist ring", hint: "Gallery-job specialists — forgers, buyers, alarms with opinions.", group: "🕵️ Action & intrigue" },
    { id: "Getaway crew", label: "Getaway crew", hint: "Drivers of last resorts — routes memorised, engines warm, no names.", group: "🕵️ Action & intrigue" },
    { id: "Con-artist crew", label: "Con-artist crew", hint: "Long-cons and short — marks, ropes, the reveal rehearsed twice.", group: "🕵️ Action & intrigue" },
    { id: "True-crime investigation", label: "True-crime investigation", hint: "Case-reopening obsession — files, podcasts, witnesses re-asked.", group: "🕵️ Action & intrigue" },
    { id: "Missing-person case", label: "Missing-person case", hint: "Someone didn't come home — flyers, timelines, doors knocked twice.", group: "🕵️ Action & intrigue" },
    { id: "County sheriff", label: "County sheriff", hint: "Small-jurisdiction law — elections, regulars, trouble the state ignores.", group: "🕵️ Action & intrigue" },
    { id: "Gladiatorial arena", label: "Gladiatorial arena", hint: "Sand-and-crowd combat — ludus bonds, thumbs, freedom priced in wins.", group: "🕵️ Action & intrigue" },
    { id: "Underground fight club", label: "Underground fight club", hint: "Basement-brawl circuits — wraps, wagers, rules you don't discuss.", group: "🕵️ Action & intrigue" },
    { id: "Street racing crew", label: "Street racing crew", hint: "Midnight-run drivers — pink slips, lookout apps, nitrous and loyalty.", group: "🕵️ Action & intrigue" },
    { id: "Remote border outpost", label: "Remote border outpost", hint: "Edge-of-the-map posting — patrols, smugglers, boredom with teeth.", group: "🕵️ Action & intrigue" },
    { id: "Embassy intrigue", label: "Embassy intrigue", hint: "Diplomatic-cover games — receptions, pouches, conversations with layers.", group: "🕵️ Action & intrigue" },
    { id: "Palace guard duty", label: "Palace guard duty", hint: "Throne-room sentinels — ceremony, corridors, hearing what guards shouldn't.", group: "🕵️ Action & intrigue" },
    { id: "Relic hunters", label: "Relic hunters", hint: "Tombs-and-museums chase — maps, rivals, artifacts that bite back.", group: "🕵️ Action & intrigue" },
    { id: "Adventure & exploration", label: "Adventure & exploration", hint: "General expedition spirit — maps, horizons, and going to see.", group: "🧭 Adventure & world" },
    { id: "Survival", label: "Survival", hint: "Against-the-elements endurance — shelter, fire, rationed hope.", group: "🧭 Adventure & world" },
    { id: "Road trip & travel", label: "Road trip & travel", hint: "Miles-and-mixtapes wandering — diners, detours, strangers with stories.", group: "🧭 Adventure & world" },
    { id: "Desert & wasteland", label: "Desert & wasteland", hint: "Sun-and-sand endurance — water math, mirages, oases that deliver.", group: "🧭 Adventure & world" },
    { id: "Arctic & frozen", label: "Arctic & frozen", hint: "White-silence survival — sleds, auroras, cold that thinks.", group: "🧭 Adventure & world" },
    { id: "Tropical island", label: "Tropical island", hint: "Palm-and-reef paradise — lagoons, storms, islands with interiors.", group: "🧭 Adventure & world" },
    { id: "Underwater & deep sea", label: "Underwater & deep sea", hint: "Pressure-and-dark descents — reefs, wrecks, bioluminescent strangers.", group: "🧭 Adventure & world" },
    { id: "Underground & caves", label: "Underground & caves", hint: "Below-the-surface exploration — headlamps, echoes, chambers no one mapped.", group: "🧭 Adventure & world" },
    { id: "Jungle expedition", label: "Jungle expedition", hint: "Green-hell trekking — machetes, canopy, ruins the forest kept.", group: "🧭 Adventure & world" },
    { id: "Lost city", label: "Lost city", hint: "Rediscovery quests — overgrown plazas, glyphs, guardians with routines.", group: "🧭 Adventure & world" },
    { id: "Mountain expedition", label: "Mountain expedition", hint: "High-altitude assaults — fixed ropes, thin air, summits that allow.", group: "🧭 Adventure & world" },
    { id: "Volcano expedition", label: "Volcano expedition", hint: "Crater's-edge science — lava fields, gas masks, earth remaking itself.", group: "🧭 Adventure & world" },
    { id: "Safari", label: "Safari", hint: "Big-country wildlife — dawn game drives, guides who read grass.", group: "🧭 Adventure & world" },
    { id: "Round-the-world sailing", label: "Round-the-world sailing", hint: "Circumnavigation life — watches, trades, storms with latitudes.", group: "🧭 Adventure & world" },
    { id: "Desert oasis town", label: "Desert oasis town", hint: "Water-in-the-waste settlements — palms, wells, caravans resting.", group: "🧭 Adventure & world" },
    { id: "Red-rock canyonlands", label: "Red-rock canyonlands", hint: "Slot-canyon country — arches, flash floods, light that sculpts.", group: "🧭 Adventure & world" },
    { id: "Bayou expedition", label: "Bayou expedition", hint: "Slow-water mysteries — airboats, gators, porch stories at dusk.", group: "🧭 Adventure & world" },
    { id: "Remote mountain monastery", label: "Remote mountain monastery", hint: "High-altitude sanctuaries — bells, butter lamps, monks with pasts.", group: "🧭 Adventure & world" },
    { id: "Nomad steppe crossing", label: "Nomad steppe crossing", hint: "Grass-ocean migration — yurts, herds, horizons without fences.", group: "🧭 Adventure & world" },
    { id: "Transcontinental rail journey", label: "Transcontinental rail journey", hint: "Sleeper-car odysseys — compartments, dining cars, borders at dawn.", group: "🧭 Adventure & world" },
    { id: "Great-river expedition", label: "Great-river expedition", hint: "Following the water down — rapids, river towns, deltas of arrival.", group: "🧭 Adventure & world" },
    { id: "Storm chasing", label: "Storm chasing", hint: "Tornado-alley pursuit — radar, dirt roads, skies turning green.", group: "🧭 Adventure & world" },
    { id: "Archipelago island-hopping", label: "Archipelago island-hopping", hint: "Scattered-isle voyaging — ferries, each island a different rule.", group: "🧭 Adventure & world" },
    { id: "Expedition cruise", label: "Expedition cruise", hint: "Zodiac-boat exploration — polar landings, naturalists, remote shores.", group: "🧭 Adventure & world" },
    { id: "Outback crossing", label: "Outback crossing", hint: "Red-centre traversal — road trains, station stays, distances that humble.", group: "🧭 Adventure & world" },
    { id: "Highland trek", label: "Highland trek", hint: "Mist-and-heather walking — bothies, glens, weather with moods.", group: "🧭 Adventure & world" },
    { id: "Fjord expedition", label: "Fjord expedition", hint: "Steep-water northern coasts — kayaks, waterfalls, villages at the head.", group: "🧭 Adventure & world" },
    { id: "Meteor-crater basin", label: "Meteor-crater basin", hint: "Impact-zone strangeness — shocked rock, rare minerals, sky-fall lore.", group: "🧭 Adventure & world" },
    { id: "Salt-flat crossing", label: "Salt-flat crossing", hint: "White-mirror traverses — heat, mirages, horizons that lie.", group: "🧭 Adventure & world" },
    { id: "Spring blossom trail", label: "Spring blossom trail", hint: "Petal-season pilgrimages — hanami crowds, temple paths, fleeting pink.", group: "🧭 Adventure & world" },
    { id: "Ancient pilgrimage route", label: "Ancient pilgrimage route", hint: "Old sacred roads — hostels, blisters, arrivals that change walkers.", group: "🧭 Adventure & world" },
    { id: "Hot-air balloon drift", label: "Hot-air balloon drift", hint: "Wind-borne wandering — burners, baskets, landing wherever the air decides.", group: "🧭 Adventure & world" },
    { id: "Cozy fantasy village", label: "Cozy fantasy village", hint: "Low-stakes fantasy hamlet — thatched roofs, mild magic, festivals over battles.", group: "🌷 Wholesome & cozy" },
    { id: "Cottagecore homestead", label: "Cottagecore homestead", hint: "Romantic rural self-sufficiency — gardens, preserves, handmade everything.", group: "🌷 Wholesome & cozy" },
    { id: "Seaside fishing village", label: "Seaside fishing village", hint: "Harbour-village rhythms — dawn boats, nets, everyone at the pub by six.", group: "🌷 Wholesome & cozy" },
    { id: "Lighthouse keeping", label: "Lighthouse keeping", hint: "Keeper's solitary rounds — lamps, logbooks, storms watched alone.", group: "🌷 Wholesome & cozy" },
    { id: "Flower farm countryside", label: "Flower farm countryside", hint: "Bloom-row farming — bouquets, bees, weddings booked a year out.", group: "🌷 Wholesome & cozy" },
    { id: "Village bakery mornings", label: "Village bakery mornings", hint: "Dawn-oven warmth — first loaves, regulars' orders, flour everywhere.", group: "🌷 Wholesome & cozy" },
    { id: "Cozy bookshop on the corner", label: "Cozy bookshop on the corner", hint: "Shelves-and-tea retail — recommendations, resident cats, rainy-day browsers.", group: "🌷 Wholesome & cozy" },
    { id: "Corner tearoom", label: "Corner tearoom", hint: "Tiered-tray afternoons — proper pots, gossip, scones with opinions.", group: "🌷 Wholesome & cozy" },
    { id: "Family-run café", label: "Family-run café", hint: "Counter-and-kin service — secret recipes, regulars as relatives.", group: "🌷 Wholesome & cozy" },
    { id: "Community garden project", label: "Community garden project", hint: "Shared-plot growing — allotments, swap tables, neighbourhood pride.", group: "🌷 Wholesome & cozy" },
    { id: "Animal shelter helpers", label: "Animal shelter helpers", hint: "Kennel-shift kindness — walk schedules, adoption days, hardest goodbyes.", group: "🌷 Wholesome & cozy" },
    { id: "Countryside vet clinic", label: "Countryside vet clinic", hint: "Large-and-small animal practice — lambings, loyal dogs, muddy boots.", group: "🌷 Wholesome & cozy" },
    { id: "Farmers' market town", label: "Farmers' market town", hint: "Saturday-stall community — samples, seasons, vendors as institutions.", group: "🌷 Wholesome & cozy" },
    { id: "Lakeside bed & breakfast", label: "Lakeside bed & breakfast", hint: "Guest-room hospitality — full breakfasts, loon calls, repeat visitors.", group: "🌷 Wholesome & cozy" },
    { id: "Apple orchard harvest", label: "Apple orchard harvest", hint: "Picking-season bustle — ladders, cider presses, pies by the dozen.", group: "🌷 Wholesome & cozy" },
    { id: "Grandparents' countryside home", label: "Grandparents' countryside home", hint: "Visit-the-old-house comfort — attics, gardens, unconditional baking.", group: "🌷 Wholesome & cozy" },
    { id: "Treehouse lane", label: "Treehouse lane", hint: "Childhood-canopy world — plank hideouts, passwords, summer rules.", group: "🌷 Wholesome & cozy" },
    { id: "Snowy village winter", label: "Snowy village winter", hint: "Deep-snow community — woodsmoke, lanterns, shovelled paths between doors.", group: "🌷 Wholesome & cozy" },
    { id: "Pumpkin patch autumn", label: "Pumpkin patch autumn", hint: "Harvest-season charm — hayrides, cider, the perfect jack-o'-lantern hunt.", group: "🌷 Wholesome & cozy" },
    { id: "Lavender field village", label: "Lavender field village", hint: "Purple-row summers — distilleries, buzzing bees, scent on everything.", group: "🌷 Wholesome & cozy" },
    { id: "Maple syrup farm", label: "Maple syrup farm", hint: "Sap-season labour — taps, steam, forty gallons per gallon.", group: "🌷 Wholesome & cozy" },
    { id: "Alpine chalet village", label: "Alpine chalet village", hint: "High-mountain coziness — fondue, cowbells, snowed-in evenings.", group: "🌷 Wholesome & cozy" },
    { id: "Hilltop windmill village", label: "Hilltop windmill village", hint: "Blades-turning hamlet — tulips, mills, skies full of weather.", group: "🌷 Wholesome & cozy" },
    { id: "Canal-side flower market", label: "Canal-side flower market", hint: "Barge-delivered blooms — dawn auctions, buckets, bicycles with baskets.", group: "🌷 Wholesome & cozy" },
    { id: "Mobile library van", label: "Mobile library van", hint: "Books on wheels — rural routes, holds delivered, readers waiting.", group: "🌷 Wholesome & cozy" },
    { id: "Toy repair workshop", label: "Toy repair workshop", hint: "Broken-treasure menders — gears, stitches, toys returned like new.", group: "🌷 Wholesome & cozy" },
    { id: "Old-town clockmaker's shop", label: "Old-town clockmaker's shop", hint: "Tick-and-tock craft — heirlooms regulated, time kept by hand.", group: "🌷 Wholesome & cozy" },
    { id: "Botanical garden days", label: "Botanical garden days", hint: "Glasshouse wandering — labelled wonders, benches, docents who adore ferns.", group: "🌷 Wholesome & cozy" },
    { id: "Firefly summer nights", label: "Firefly summer nights", hint: "Blinking-field evenings — jars, meadows, childhood summers preserved.", group: "🌷 Wholesome & cozy" },
    { id: "Lantern festival town", label: "Lantern festival town", hint: "Lights-on-water nights — wishes launched, whole town glowing.", group: "🌷 Wholesome & cozy" },
    { id: "Fireside inn evenings", label: "Fireside inn evenings", hint: "Hearth-and-ale comfort — travellers' tales, stew, rooms upstairs.", group: "🌷 Wholesome & cozy" },
    { id: "Kitten foster home", label: "Kitten foster home", hint: "Bottle-baby season — midnight feeds, tiny chaos, adoption-day tears.", group: "🌷 Wholesome & cozy" },
    { id: "Mother-son cooking Sundays", label: "Mother-son cooking Sundays", hint: "Aprons and heirloom recipes — a mom teaching her son the family dishes.", group: "🌷 Wholesome & cozy" },
    { id: "Mother-son road trip", label: "Mother-son road trip", hint: "Just the two of them and the highway — diners, detours, long-overdue talks.", group: "🌷 Wholesome & cozy" },
    { id: "Mother-son game nights", label: "Mother-son game nights", hint: "Board games and belly laughs — a weekly ritual neither would skip.", group: "🌷 Wholesome & cozy" },
    { id: "Mother-son garden project", label: "Mother-son garden project", hint: "Mud, seedlings and patience — growing something together, season by season.", group: "🌷 Wholesome & cozy" },
    { id: "Single mom and son fresh start", label: "Single mom and son fresh start", hint: "New town, new chapter — a small team of two figuring it out together.", group: "🌷 Wholesome & cozy" },
    { id: "Mom cheering from the sidelines", label: "Mom cheering from the sidelines", hint: "Every practice, every match — his biggest fan in a folding chair.", group: "🌷 Wholesome & cozy" },
    { id: "Mother-son camping weekend", label: "Mother-son camping weekend", hint: "Tents, trail mix and campfire stories — unplugged time that actually sticks.", group: "🌷 Wholesome & cozy" },
    { id: "Mother-daughter baking afternoons", label: "Mother-daughter baking afternoons", hint: "Flour clouds and frosting fights — weekend baking as a love language.", group: "🌷 Wholesome & cozy" },
    { id: "Mother-daughter shopping day", label: "Mother-daughter shopping day", hint: "Matching finds and food-court debriefs — the classic day out, done right.", group: "🌷 Wholesome & cozy" },
    { id: "Mother-daughter craft corner", label: "Mother-daughter craft corner", hint: "Beads, yarn and glitter glue — making things side by side, talking sideways.", group: "🌷 Wholesome & cozy" },
    { id: "Mother-daughter book club of two", label: "Mother-daughter book club of two", hint: "Same novel, two mugs of tea — trading chapters and strong opinions.", group: "🌷 Wholesome & cozy" },
    { id: "Single mom and daughter fresh start", label: "Single mom and daughter fresh start", hint: "New city, new rhythm — a duo rewriting their story one room at a time.", group: "🌷 Wholesome & cozy" },
    { id: "Mom-daughter spa weekend", label: "Mom-daughter spa weekend", hint: "Matching robes and nowhere to be — pampering, gossip and deep exhale.", group: "🌷 Wholesome & cozy" },
    { id: "Mother-daughter road trip", label: "Mother-daughter road trip", hint: "Playlists and postcards — miles of mother-daughter shorthand.", group: "🌷 Wholesome & cozy" },
    { id: "Father-son fishing mornings", label: "Father-son fishing mornings", hint: "Dawn lines and quiet boats — a dad teaching his son patience.", group: "🌷 Wholesome & cozy" },
    { id: "Father-son workshop projects", label: "Father-son workshop projects", hint: "Sawdust and socket wrenches — building things and know-how together.", group: "🌷 Wholesome & cozy" },
    { id: "Father-son camping trips", label: "Father-son camping trips", hint: "Firewood duty and constellation lessons — the annual wilderness pact.", group: "🌷 Wholesome & cozy" },
    { id: "Father-son sports rituals", label: "Father-son sports rituals", hint: "Catch in the yard, games on the radio — their own season that never ends.", group: "🌷 Wholesome & cozy" },
    { id: "Single dad and son fresh start", label: "Single dad and son fresh start", hint: "New place, same team — a duo learning takeout menus and trust.", group: "🌷 Wholesome & cozy" },
    { id: "Dad teaching son to drive", label: "Dad teaching son to drive", hint: "Empty parking lots and white knuckles — the rite of the passenger seat.", group: "🌷 Wholesome & cozy" },
    { id: "Father-son stargazing nights", label: "Father-son stargazing nights", hint: "Blankets and big questions — a telescope and a dad with answers.", group: "🌷 Wholesome & cozy" },
    { id: "Father-daughter pancake Saturdays", label: "Father-daughter pancake Saturdays", hint: "Lopsided stacks and syrup art — dads who braid hair badly but flip well.", group: "🌷 Wholesome & cozy" },
    { id: "Father-daughter dance recitals", label: "Father-daughter dance recitals", hint: "Front-row dad with flowers — rehearsed twirls and proud tears.", group: "🌷 Wholesome & cozy" },
    { id: "Father-daughter hiking trails", label: "Father-daughter hiking trails", hint: "Piggyback miles and summit snacks — small boots, big summits.", group: "🌷 Wholesome & cozy" },
    { id: "Father-daughter bookstore dates", label: "Father-daughter bookstore dates", hint: "One book each and hot chocolate — her pick, his treat, every month.", group: "🌷 Wholesome & cozy" },
    { id: "Single dad and daughter fresh start", label: "Single dad and daughter fresh start", hint: "New school, new routines — learning ponytails and pickups together.", group: "🌷 Wholesome & cozy" },
    { id: "Dad walking daughter down the aisle", label: "Dad walking daughter down the aisle", hint: "The long walk, arm in arm — pride, grief and joy in one aisle.", group: "🌷 Wholesome & cozy" },
    { id: "Father-daughter stargazing nights", label: "Father-daughter stargazing nights", hint: "Driveway constellations — a dad translating the sky for his girl.", group: "🌷 Wholesome & cozy" },
    { id: "High-school romance", label: "High-school romance", hint: "Hallway-heart romance — lockers, lunch tables, love between bells.", group: "💕 Teen romance" },
    { id: "First love", label: "First love", hint: "The very first one — overwhelming, clumsy, remembered forever.", group: "💕 Teen romance" },
    { id: "Boarding school romance", label: "Boarding school romance", hint: "Dorm-and-chapel love — curfews, common rooms, letters home edited.", group: "💕 Teen romance" },
    { id: "Summer camp romance", label: "Summer camp romance", hint: "Eight-weeks-only love — canoes, campfires, last-night promises.", group: "💕 Teen romance" },
    { id: "Prom & school dance season", label: "Prom & school dance season", hint: "Ask-season stakes — posters, rejections, slow dances that decide.", group: "💕 Teen romance" },
    { id: "Exchange-student romance", label: "Exchange-student romance", hint: "One-year-only love — accents, host families, departures scheduled.", group: "💕 Teen romance" },
    { id: "Rival schools romance", label: "Rival schools romance", hint: "Across-the-tracks love — derby days, divided friends, secret meetings.", group: "💕 Teen romance" },
    { id: "Study-buddy romance", label: "Study-buddy romance", hint: "Homework-together slow burn — flashcards, shared headphones, almost-moments.", group: "💕 Teen romance" },
    { id: "Young adult coming-of-age", label: "Young adult coming-of-age", hint: "Growing-up arcs — first everything, mistakes that teach, selves emerging.", group: "💕 Teen romance" },
    { id: "After-school confessions", label: "After-school confessions", hint: "Empty-classroom honesty — rooftop talks, walked-home routes, truths at dusk.", group: "💕 Teen romance" },
    { id: "School festival romance", label: "School festival romance", hint: "Culture-day chaos — haunted houses, crepe stands, confessions by closing.", group: "💕 Teen romance" },
    { id: "Classroom seatmates", label: "Classroom seatmates", hint: "Assigned-desk proximity — borrowed erasers, whispered jokes, elbow wars.", group: "💕 Teen romance" },
    { id: "Childhood-friends romance", label: "Childhood-friends romance", hint: "Always-been-you love — treehouses to almost, everyone knew except them.", group: "💕 Teen romance" },
    { id: "Library study dates", label: "Library study dates", hint: "Stacks-and-whispers courtship — shared tables, passed notes, shushed laughter.", group: "💕 Teen romance" },
    { id: "Bus-stop crush", label: "Bus-stop crush", hint: "Same-route longing — timetables memorised, seats saved, never speaking.", group: "💕 Teen romance" },
    { id: "Pen-pal sweethearts", label: "Pen-pal sweethearts", hint: "Paper-distance devotion — letters, stickers, handwriting learned by heart.", group: "💕 Teen romance" },
    { id: "Lifeguard summer romance", label: "Lifeguard summer romance", hint: "Whistle-and-zinc love — pool decks, rescues real and staged, tan lines.", group: "💕 Teen romance" },
    { id: "Class trip romance", label: "Class trip romance", hint: "Bus-seat-pairing fate — room assignments, free afternoons, souvenirs that mean.", group: "💕 Teen romance" },
    { id: "Academic rivals romance", label: "Academic rivals romance", hint: "Top-of-class warfare — competing scores, grudging respect, tutoring truces.", group: "💕 Teen romance" },
    { id: "Band-camp romance", label: "Band-camp romance", hint: "Section-love among brass — night rehearsals, bus rows, duets in tune.", group: "💕 Teen romance" },
    { id: "Theater-kid romance", label: "Theater-kid romance", hint: "Backstage butterflies — cast parties, dressing-room talks, kiss choreography.", group: "💕 Teen romance" },
    { id: "Sports-club romance", label: "Sports-club romance", hint: "Teammate tension — practices, away games, victories shared too closely.", group: "💕 Teen romance" },
    { id: "Summer job romance", label: "Summer job romance", hint: "Clock-in crushes — shared shifts, break-room talks, last-day numbers.", group: "💕 Teen romance" },
    { id: "Snow-day romance", label: "Snow-day romance", hint: "Cancelled-school magic — sledding, cocoa, neighbourhoods gone quiet.", group: "💕 Teen romance" },
    { id: "Valentine's day confession", label: "Valentine's day confession", hint: "February-fourteenth courage — shoe lockers, after-class meetings, yes or no.", group: "💕 Teen romance" },
    { id: "Fireworks-festival romance", label: "Fireworks-festival romance", hint: "Yukata-and-sparks summer — crowds parting, wishes timed to bursts.", group: "💕 Teen romance" },
    { id: "Bittersweet graduation", label: "Bittersweet graduation", hint: "Caps-in-the-air endings — yearbooks, last dances, futures diverging.", group: "💕 Teen romance" },
    { id: "New kid in town romance", label: "New kid in town romance", hint: "Transfer-student fresh starts — guided tours, first friends, fast bonds.", group: "💕 Teen romance" },
    { id: "Childhood best friends", label: "Childhood best friends", hint: "Since-forever friendships — shared histories, shorthand jokes, growing up side by side.", group: "🪁 Childhood days" },
    { id: "Middle-school friendship", label: "Middle-school friendship", hint: "Awkward-years bonds — braces, lockers, loyalties tested daily.", group: "🪁 Childhood days" },
    { id: "Playground adventures", label: "Playground adventures", hint: "Recess-epic childhood — slides as mountains, tag with real stakes.", group: "🪁 Childhood days" },
    { id: "Neighborhood bike rides", label: "Neighborhood bike rides", hint: "Two-wheel freedom — range expanding yearly, home by streetlights.", group: "🪁 Childhood days" },
    { id: "Secret hideout club", label: "Secret hideout club", hint: "Members-only dens — passwords, bylaws, meetings of great importance.", group: "🪁 Childhood days" },
    { id: "Rainy-day pillow fort", label: "Rainy-day pillow fort", hint: "Indoor-weather kingdoms — cushions, flashlights, storms outside.", group: "🪁 Childhood days" },
    { id: "Lemonade stand summer", label: "Lemonade stand summer", hint: "Sidewalk entrepreneurship — quarters, watered pitchers, business lessons.", group: "🪁 Childhood days" },
    { id: "Backyard campouts", label: "Backyard campouts", hint: "Almost-wild nights — tents, ghost stories, sprinting inside by midnight.", group: "🪁 Childhood days" },
    { id: "Library summer club", label: "Library summer club", hint: "Reading-log summers — stickers, beanstack goals, librarians as heroes.", group: "🪁 Childhood days" },
    { id: "Swimming-hole summer", label: "Swimming-hole summer", hint: "Rope-swing days — cold water, hot rocks, dares from the high branch.", group: "🪁 Childhood days" },
    { id: "Sled hill winters", label: "Sled hill winters", hint: "Gravity-powered joy — waxed runners, king of the hill, frozen fingers.", group: "🪁 Childhood days" },
    { id: "Trick-or-treat crew", label: "Trick-or-treat crew", hint: "Costume-route squads — pillowcase hauls, porch lights, trading candy.", group: "🪁 Childhood days" },
    { id: "Science-fair partners", label: "Science-fair partners", hint: "Volcano-and-poster teamwork — hypotheses, tri-folds, ribbon dreams.", group: "🪁 Childhood days" },
    { id: "School play crew", label: "School play crew", hint: "Gymnasium theatre — painted flats, missed cues, bows to parents.", group: "🪁 Childhood days" },
    { id: "First day of school", label: "First day of school", hint: "New-backpack nerves — classroom doors, name tags, brave faces.", group: "🪁 Childhood days" },
    { id: "Make-believe kingdoms", label: "Make-believe kingdoms", hint: "Blanket-fort realms — crowns, quests, rules everyone obeys.", group: "🪁 Childhood days" },
    { id: "Attic discoveries", label: "Attic discoveries", hint: "Dust-and-trunk mysteries — old photos, letters, grandparents' pasts.", group: "🪁 Childhood days" },
    { id: "Paper route mornings", label: "Paper route mornings", hint: "Dawn-delivery rounds — rubber bands, porch aims, tips at Christmas.", group: "🪁 Childhood days" },
    { id: "Corner-store candy runs", label: "Corner-store candy runs", hint: "Pocket-money missions — penny candy math, glass-counter decisions.", group: "🪁 Childhood days" },
    { id: "Backyard stargazing", label: "Backyard stargazing", hint: "Blanket-and-constellation nights — wishes, satellites, big questions.", group: "🪁 Childhood days" },
    { id: "Comedy & sitcom", label: "Comedy & sitcom", hint: "Joke-driven ensemble life — catchphrases, bottle episodes, hugs by credits.", group: "🎭 Mood & story shape" },
    { id: "Satire", label: "Satire", hint: "Sharp-edged mockery — sacred cows grilled, pomposity punctured weekly.", group: "🎭 Mood & story shape" },
    { id: "Tragedy", label: "Tragedy", hint: "Downward arcs with dignity — flaws, fate, catharsis in the ruins.", group: "🎭 Mood & story shape" },
    { id: "Wholesome & healing", label: "Wholesome & healing", hint: "Gentle recovery stories — kindness as plot, warmth that actually works.", group: "🎭 Mood & story shape" },
    { id: "Romance", label: "Romance", hint: "General love-story shape — meeting, obstacles, devotion tested and kept.", group: "🎭 Mood & story shape" },
    { id: "Slow burn", label: "Slow burn", hint: "Glacial romantic pacing — years of glances before the first kiss lands.", group: "🎭 Mood & story shape" },
    { id: "Found family", label: "Found family", hint: "Chosen kinship — strays assembling into something unbreakable.", group: "🎭 Mood & story shape" },
    { id: "Farce & slapstick", label: "Farce & slapstick", hint: "Door-slamming chaos — mistaken identities, escalating disasters, no dignity.", group: "🎭 Mood & story shape" },
    { id: "Black comedy", label: "Black comedy", hint: "Laughing at the abyss — gallows wit, terrible people, worse luck.", group: "🎭 Mood & story shape" },
    { id: "Romantic comedy", label: "Romantic comedy", hint: "Meet-cute machinery — misunderstandings, grand gestures, airport runs.", group: "🎭 Mood & story shape" },
    { id: "Dramedy", label: "Dramedy", hint: "Laugh-cry balance — jokes in hospitals, grief at weddings, life entire.", group: "🎭 Mood & story shape" },
    { id: "Melodrama", label: "Melodrama", hint: "Feelings at full volume — fainting couches, revelations, organs swelling.", group: "🎭 Mood & story shape" },
    { id: "Bittersweet", label: "Bittersweet", hint: "Smiling-through-ache endings — gains with losses attached, beautiful anyway.", group: "🎭 Mood & story shape" },
    { id: "Heartwarming", label: "Heartwarming", hint: "Chest-glowing kindness — good deeds compounding into better people.", group: "🎭 Mood & story shape" },
    { id: "Tearjerker", label: "Tearjerker", hint: "Engineered weeping — goodbyes, sacrifices, the dog dies (sorry).", group: "🎭 Mood & story shape" },
    { id: "Feel-good ensemble", label: "Feel-good ensemble", hint: "Everybody-wins casts — no villains, just people being decent at each other.", group: "🎭 Mood & story shape" },
    { id: "Epic saga", label: "Epic saga", hint: "Generations-spanning scale — thrones, exiles, histories with appendices.", group: "🎭 Mood & story shape" },
    { id: "Intimate character study", label: "Intimate character study", hint: "One soul, closely held — small moments revealing entire interiors.", group: "🎭 Mood & story shape" },
    { id: "Love triangle", label: "Love triangle", hint: "Three-heart geometry — torn affections, choosing scenes, someone loses.", group: "🎭 Mood & story shape" },
    { id: "Enemies to lovers", label: "Enemies to lovers", hint: "Hate-to-heart pipeline — sparring, grudging respect, the banter was flirting.", group: "🎭 Mood & story shape" },
    { id: "Friends to lovers", label: "Friends to lovers", hint: "The line gets crossed — comfort turning electric, risking everything.", group: "🎭 Mood & story shape" },
    { id: "Second-chance romance", label: "Second-chance romance", hint: "Love, revisited — exes, old letters, the one who got away returning.", group: "🎭 Mood & story shape" },
    { id: "Fake dating", label: "Fake dating", hint: "Pretend-couple schemes — rules posted, feelings unposted, events survived.", group: "🎭 Mood & story shape" },
    { id: "Forced proximity", label: "Forced proximity", hint: "One bed, one tent, one safehouse — closeness imposed until it's wanted.", group: "🎭 Mood & story shape" },
    { id: "Arranged marriage", label: "Arranged marriage", hint: "Contracted unions — duty first, strangers negotiating into partners.", group: "🎭 Mood & story shape" },
    { id: "Secret identity", label: "Secret identity", hint: "Hidden-self suspense — masks, close calls, reveals timed for impact.", group: "🎭 Mood & story shape" },
    { id: "Fish out of water", label: "Fish out of water", hint: "Wrong-world comedy — customs mangled, norms questioned, adaptation arcs.", group: "🎭 Mood & story shape" },
    { id: "Underdog story", label: "Underdog story", hint: "Nobody-believes arcs — training, heart, the long shot landing.", group: "🎭 Mood & story shape" },
    { id: "Redemption arc", label: "Redemption arc", hint: "Earning forgiveness — amends, relapses, proof over promises.", group: "🎭 Mood & story shape" },
    { id: "Grief & healing", label: "Grief & healing", hint: "Loss-and-mending journeys — empty chairs, small steps, light returning.", group: "🎭 Mood & story shape" },
    { id: "New beginnings", label: "New beginnings", hint: "Fresh-page energy — new towns, new names, pasts packed but carried.", group: "🎭 Mood & story shape" },
    { id: "Coming-of-age", label: "Coming-of-age", hint: "Growing-up thresholds — first choices with real weight, innocence itemised.", group: "🎭 Mood & story shape" },
    { id: "Bare-knuckle boxing circuit", label: "Bare-knuckle boxing circuit", hint: "Illegal bare-knuckle cards — blood, bookies, basement crowds.", group: "😡 Aggressive & brutal" },
    { id: "MMA cage league", label: "MMA cage league", hint: "Legit cage-fighting league — weight cuts, walkouts, title shots.", group: "😡 Aggressive & brutal" },
    { id: "Pro wrestling territory", label: "Pro wrestling territory", hint: "Kayfabe and backstage knives — heroes, heels, promoter wars.", group: "😡 Aggressive & brutal" },
    { id: "Roller derby league", label: "Roller derby league", hint: "Banked-track bruisers — jammers, blockers, bout-night feuds.", group: "😡 Aggressive & brutal" },
    { id: "Hockey enforcer culture", label: "Hockey enforcer culture", hint: "The tough guys' code — staged fights, protected stars, scarred knuckles.", group: "😡 Aggressive & brutal" },
    { id: "Football hooligan firms", label: "Football hooligan firms", hint: "Terrace firms and away-day rumbles — colours, chants, running battles.", group: "😡 Aggressive & brutal" },
    { id: "Outlaw biker club", label: "Outlaw biker club", hint: "The MC's brutal code — turf, runs, clubhouse justice.", group: "😡 Aggressive & brutal" },
    { id: "Demolition derby", label: "Demolition derby", hint: "Last-car-running mayhem — welded steel, roaring crowds, glorious wrecks.", group: "😡 Aggressive & brutal" },
    { id: "Prison yard", label: "Prison yard", hint: "Inside-the-walls survival — yards, gangs, debts and respect.", group: "😡 Aggressive & brutal" },
    { id: "Boot camp", label: "Boot camp", hint: "Basic-training meat-grinder — drill instructors, washouts, forged bonds.", group: "😡 Aggressive & brutal" },
    { id: "High-seas piracy", label: "High-seas piracy", hint: "Take-no-prisoners raiding — plank law, prize ships, mutinous crews.", group: "😡 Aggressive & brutal" },
    { id: "Dueling culture", label: "Dueling culture", hint: "Affairs of honour — pistols or blades at dawn, seconds and scars.", group: "😡 Aggressive & brutal" },
    { id: "Battle royale contest", label: "Battle royale contest", hint: "Last-one-standing games — alliances, betrayals, a watching world.", group: "😡 Aggressive & brutal" },
    { id: "Mecha pit fights", label: "Mecha pit fights", hint: "Giant-robot brawls — grease, gambling and collapsing arenas.", group: "😡 Aggressive & brutal" },
    { id: "Kaiju defense force", label: "Kaiju defense force", hint: "Anti-monster military — sirens, sorties, cities as battlefields.", group: "😡 Aggressive & brutal" },
    { id: "Delinquent school turf war", label: "Delinquent school turf war", hint: "Yankee-school warfare — rooftop summits, hallway ambushes, gang banners.", group: "😡 Aggressive & brutal" },
    { id: "Hell-kitchen rivalry", label: "Hell-kitchen rivalry", hint: "Knife-edge kitchen combat — screaming pass, sabotage, service from hell.", group: "😡 Aggressive & brutal" },
    { id: "Cutthroat debate circuit", label: "Cutthroat debate circuit", hint: "Verbal bloodsport — cross-examinations, hecklers, trophies for cruelty.", group: "😡 Aggressive & brutal" },
    { id: "Hardcore punk scene", label: "Hardcore punk scene", hint: "Pit-violence music dens — stage dives, bouncers, bleeding for the band.", group: "😡 Aggressive & brutal" },
    { id: "Street riot", label: "Street riot", hint: "Civil-unrest nights — barricades, chanting lines, cities holding breath.", group: "😡 Aggressive & brutal" },
    { id: "Blood-feud families", label: "Blood-feud families", hint: "Generations-long vendettas — fences, funerals, forbidden friendships.", group: "😡 Aggressive & brutal" },
    { id: "Divorce war", label: "Divorce war", hint: "Split-up combat — lawyers, custody raids, houses divided.", group: "😡 Aggressive & brutal" },
    { id: "Toxic office warfare", label: "Toxic office warfare", hint: "Cubicle combat — credit-stealing, meeting ambushes, promotion bloodsport.", group: "😡 Aggressive & brutal" },
    { id: "HOA turf war", label: "HOA turf war", hint: "Suburban ordinance combat — fines, fences, neighbourhood coups.", group: "😡 Aggressive & brutal" },
    { id: "Hardcore iron gym", label: "Hardcore iron gym", hint: "Chalk-and-iron temples — PRs, plate-stealing, grunt-and-drop etiquette.", group: "😡 Aggressive & brutal" },
    { id: "Prank war", label: "Prank war", hint: "Escalating revenge gags — truces broken, legends born, no survivors.", group: "😡 Aggressive & brutal" },
    { id: "Airsoft militia", label: "Airsoft militia", hint: "Weekend-warrior campaigns — camo, callouts, honour rules argued loudly.", group: "😡 Aggressive & brutal" },
    { id: "Foam-weapon LARP wars", label: "Foam-weapon LARP wars", hint: "Foam-and-latex battlefields — shield walls, drama thicker than armour.", group: "😡 Aggressive & brutal" },
    { id: "Roast-battle circuit", label: "Roast-battle circuit", hint: "Insult-comedy combat — timed rounds, no-mercy punchlines, baying crowds.", group: "😡 Aggressive & brutal" },
    { id: "Underground rap battles", label: "Underground rap battles", hint: "Cypher combat — disses, rebuttals, reputations won in three rounds.", group: "😡 Aggressive & brutal" },
    { id: "Sibling rivalry", label: "Sibling rivalry", hint: "Brother-versus-sister warfare — pranks, scores, love under the blows.", group: "😡 Aggressive & brutal" },
    { id: "Neighbor feud", label: "Neighbor feud", hint: "Fence-line hostilities — hedges, noise, passive-aggressive ordnance.", group: "😡 Aggressive & brutal" },
    { id: "Derby-day rivalry", label: "Derby-day rivalry", hint: "Fanbase holy wars — scarves, songs, cities split in two.", group: "😡 Aggressive & brutal" },
    { id: "Flame-war forums", label: "Flame-war forums", hint: "Online pile-ons — dogpiles, ratio hunts, mods swinging banhammers.", group: "😡 Aggressive & brutal" },
    { id: "Roadhouse bar", label: "Roadhouse bar", hint: "Bouncer-ruled roadhouses — last calls, brawls, regulars with records.", group: "😡 Aggressive & brutal" },
    { id: "Arm-wrestling circuit", label: "Arm-wrestling circuit", hint: "Table-top strongman duels — chalk, straps, tendons on the line.", group: "😡 Aggressive & brutal" },
    { id: "Slap-fighting league", label: "Slap-fighting league", hint: "Open-palm duels — coin toss, one strike each, crowds wincing.", group: "😡 Aggressive & brutal" },
    { id: "Chessboxing league", label: "Chessboxing league", hint: "Brains-plus-brawn bouts — rounds alternate chess moves and combinations.", group: "😡 Aggressive & brutal" },
    { id: "Buhurt armored combat", label: "Buhurt armored combat", hint: "Steel-plate melee — shield walls clashing, knights dented for sport.", group: "😡 Aggressive & brutal" },
    { id: "Shin-kicking championship", label: "Shin-kicking championship", hint: "Cotswold collar-and-shin — straw-stuffed trousers, topple your foe.", group: "😡 Aggressive & brutal" },
    { id: "Wife-carrying championship", label: "Wife-carrying championship", hint: "Estonian carry-races — logs, water traps, victory by dead sprint.", group: "😡 Aggressive & brutal" },
    { id: "Monster-in-law's house", label: "Monster-in-law's house", hint: "A mother-in-law's domain — inspections, rewritten rules, loyalty wars.", group: "😡 Hostile relatives" },
    { id: "Tyrant father's house", label: "Tyrant father's house", hint: "A patriarch's reign of fear — curfews, punishments, obedience on trial.", group: "😡 Hostile relatives" },
    { id: "Ice-mother household", label: "Ice-mother household", hint: "A frozen mother's home — rationed affection, approval never granted.", group: "😡 Hostile relatives" },
    { id: "Rival brother's household", label: "Rival brother's household", hint: "Brother-versus-brother turf — scores kept, victories rubbed in daily.", group: "😡 Hostile relatives" },
    { id: "Jealous sister's household", label: "Jealous sister's household", hint: "A sister's envy, architected — sabotage delivered with a sisterly smile.", group: "😡 Hostile relatives" },
    { id: "Evil stepmother's household", label: "Evil stepmother's household", hint: "A remarried regime — chores for you, praise for hers, sides chosen nightly.", group: "😡 Hostile relatives" },
    { id: "Wicked stepfather's rulebook", label: "Wicked stepfather's rulebook", hint: "A stepfather's boot-camp home — drills, demerits, respect demanded not earned.", group: "😡 Hostile relatives" },
    { id: "Disapproving grandfather's estate", label: "Disapproving grandfather's estate", hint: "An old lion's estate — stone-carved standards, heirs weighed every visit.", group: "😡 Hostile relatives" },
    { id: "Critical grandmother's parlor", label: "Critical grandmother's parlor", hint: "Sunday-visit inquisitions — recipes judged, life choices cross-examined.", group: "😡 Hostile relatives" },
    { id: "Golden-child pecking order", label: "Golden-child pecking order", hint: "A family with a crowned favourite — praise for one, scraps for the rest.", group: "😡 Hostile relatives" },
    { id: "Black-sheep corner", label: "Black-sheep corner", hint: "The disgraced one's seat — blamed loudly, loved quietly, watched always.", group: "😡 Hostile relatives" },
    { id: "Scapegoat's burden", label: "Scapegoat's burden", hint: "Every breakage has your name on it — apologies demanded, innocence itemised.", group: "😡 Hostile relatives" },
    { id: "Resentful sibling standoff", label: "Resentful sibling standoff", hint: "Siblings keeping decades of score — slights itemised over dinner.", group: "😡 Hostile relatives" },
    { id: "Domineering heir's manor", label: "Domineering heir's manor", hint: "An heir already acting crowned — staff and siblings all beneath notice.", group: "😡 Hostile relatives" },
    { id: "Disinherited branch", label: "Disinherited branch", hint: "Cut out of the will — poor relations at the rich family's table.", group: "😡 Hostile relatives" },
    { id: "Nightmare sister-in-law's orbit", label: "Nightmare sister-in-law's orbit", hint: "Marriage's hostile add-on — critiques, competitions, holidays endured.", group: "😡 Hostile relatives" },
    { id: "Condescending brother-in-law's cookout", label: "Condescending brother-in-law's cookout", hint: "Backyard barbecues as battlegrounds — lectures, one-upmanship, tools never returned.", group: "😡 Hostile relatives" },
    { id: "Meddling aunt's network", label: "Meddling aunt's network", hint: "An aunt's intelligence service — everyone's business, reported everywhere.", group: "😡 Hostile relatives" },
    { id: "Moocher uncle's couch", label: "Moocher uncle's couch", hint: "A permanent guest's reign — couch claimed, fridge raided, departure always next month.", group: "😡 Hostile relatives" },
    { id: "Comparing mother's kitchen", label: "Comparing mother's kitchen", hint: "A mother's scoreboard — cousins' triumphs recited, your failures filed.", group: "😡 Hostile relatives" },
    { id: "Never-proud father's workshop", label: "Never-proud father's workshop", hint: "Approval one milestone away — the bar rises with every win.", group: "😡 Hostile relatives" },
    { id: "Silent-treatment household", label: "Silent-treatment household", hint: "A home run on silence — slammed doors, frozen meals, wars without words.", group: "😡 Hostile relatives" },
    { id: "Guilt-trip engine", label: "Guilt-trip engine", hint: "Guilt as house currency — sighs, sacrifices recited, debts that never clear.", group: "😡 Hostile relatives" },
    { id: "Holiday-tyrant's table", label: "Holiday-tyrant's table", hint: "One commander's festive regime — seating charts as law, toasts as trials.", group: "😡 Hostile relatives" },
    { id: "Family spy network", label: "Family spy network", hint: "A house of informants — whispers carried, alliances mapped, trust rationed.", group: "😡 Hostile relatives" },
    { id: "Cousin-rivalry reunion", label: "Cousin-rivalry reunion", hint: "Cousins competing since childhood — grades, jobs, weddings as scoreboards.", group: "😡 Hostile relatives" },
    { id: "Vindictive ex's joint custody", label: "Vindictive ex's joint custody", hint: "Coparenting as combat — handovers, holidays, the kids as territory.", group: "😡 Hostile relatives" },
    { id: "Shunning family's silence", label: "Shunning family's silence", hint: "The family's closed door — cut off, uninvited, holidays alone.", group: "😡 Hostile relatives" },
    { id: "Stonewall father-in-law's farm", label: "Stonewall father-in-law's farm", hint: "A wall of a man — grunts for answers, approval never verbalised.", group: "😡 Hostile relatives" },
    { id: "Step-sibling turf war", label: "Step-sibling turf war", hint: "Blended-house battlelines — rooms, parents, loyalties divided.", group: "😡 Hostile relatives" },
    { id: "Twin-rivalry mirror", label: "Twin-rivalry mirror", hint: "Twin against twin — identical faces, opposite victories, the family forced to pick a side.", group: "😡 Hostile relatives" },
    { id: "Contemptuous spouse's home", label: "Contemptuous spouse's home", hint: "A marriage gone cold — contempt served daily, separate lives under one roof.", group: "😡 Hostile relatives" },
    { id: "Forbidden romance", label: "Forbidden romance", hint: "Love against the rules — families, vows or stations forbidding it.", group: "🔞 Taboo & forbidden" },
    { id: "Taboo family saga", label: "Taboo family saga", hint: "Family lines crossed — inheritance, blood and secrets nobody names.", group: "🔞 Taboo & forbidden" },
    { id: "Secret affair", label: "Secret affair", hint: "Hidden lovers — hotel rooms, deleted messages, the thrill and the cost.", group: "🔞 Taboo & forbidden" },
    { id: "Illicit love", label: "Illicit love", hint: "Love the world condemns — stolen hours, heavy doors, heavier hearts.", group: "🔞 Taboo & forbidden" },
    { id: "Rural family summer", label: "Rural family summer", hint: "Country-house family season — cousins, heat, long unsupervised days.", group: "🔞 Taboo & forbidden" },
    { id: "Blended family", label: "Blended family", hint: "Yours-mine-and-ours households — step-siblings negotiating new loyalties.", group: "🔞 Taboo & forbidden" },
    { id: "Live-in relative", label: "Live-in relative", hint: "An extra adult in the house — guest rooms, blurred lines, shifting authority.", group: "🔞 Taboo & forbidden" },
    { id: "Inheritance drama", label: "Inheritance drama", hint: "Money-after-death warfare — wills, lawyers, relatives showing teeth.", group: "🔞 Taboo & forbidden" },
    { id: "Royal bloodline", label: "Royal bloodline", hint: "Pure-lineage obsession — heirs, succession, blood as destiny.", group: "🔞 Taboo & forbidden" },
    { id: "Clan obligations", label: "Clan obligations", hint: "Family-before-self codes — arranged duties, honour debts, no refusals.", group: "🔞 Taboo & forbidden" },
    { id: "Snowed-in cabin", label: "Snowed-in cabin", hint: "Trapped-together intimacy — one fireplace, no roads, forced closeness.", group: "🔞 Taboo & forbidden" },
    { id: "Reunion after years", label: "Reunion after years", hint: "Long-lost returns — changed faces, old sparks, unfinished business.", group: "🔞 Taboo & forbidden" },
    { id: "Strict household", label: "Strict household", hint: "Rule-bound homes — curfews, inspections, rebellion brewing quietly.", group: "🔞 Taboo & forbidden" },
    { id: "Foster care", label: "Foster care", hint: "Temporary-family life — placements, caseworkers, belonging on trial.", group: "🔞 Taboo & forbidden" },
    { id: "Guardianship", label: "Guardianship", hint: "Custody-and-care bonds — protectors with power, wards with wills.", group: "🔞 Taboo & forbidden" },
    { id: "Hot spring inn", label: "Hot spring inn", hint: "Ryokan intimacy — steaming baths, yukatas, mountain seclusion.", group: "🔞 Taboo & forbidden" },
    { id: "Family camping trip", label: "Family camping trip", hint: "Tents-and-relatives outdoors — close quarters, campfire confessions.", group: "🔞 Taboo & forbidden" },
    { id: "Lakeside cabin", label: "Lakeside cabin", hint: "Waterfront seclusion — docks, loons, no neighbours for miles.", group: "🔞 Taboo & forbidden" },
    { id: "Power outage night", label: "Power outage night", hint: "Blackout closeness — candles, dead phones, talking till dawn.", group: "🔞 Taboo & forbidden" },
    { id: "Sickbed vigil", label: "Sickbed vigil", hint: "Watching-through-illness devotion — night chairs, whispered promises.", group: "🔞 Taboo & forbidden" },
    { id: "Family curse", label: "Family curse", hint: "Inherited doom — each generation paying for the first sin.", group: "🔞 Taboo & forbidden" },
    { id: "Creepy uncle", label: "Creepy uncle", hint: "The relative everyone avoids — lingering looks, locked doors, family denial.", group: "🔞 Taboo & forbidden" },
    { id: "Wicked stepmother", label: "Wicked stepmother", hint: "Fairy-tale cruelty at home — favouritism, chores, mirrors taking sides.", group: "🔞 Taboo & forbidden" },
    { id: "Overbearing mother-in-law", label: "Overbearing mother-in-law", hint: "Marriage's third wheel — inspections, opinions, son still hers.", group: "🔞 Taboo & forbidden" },
    { id: "Tyrannical father", label: "Tyrannical father", hint: "Rule-by-fear patriarchs — obedience demanded, love used as leverage.", group: "🔞 Taboo & forbidden" },
    { id: "Smothering mother", label: "Smothering mother", hint: "Love as control — hovering, guilt, independence treated as betrayal.", group: "🔞 Taboo & forbidden" },
    { id: "Sinister matriarch", label: "Sinister matriarch", hint: "The family's dark queen — strings pulled for generations, tea served cold.", group: "🔞 Taboo & forbidden" },
    { id: "Black-sheep sibling", label: "Black-sheep sibling", hint: "The family's disgrace — or its only honest member, depending who asks.", group: "🔞 Taboo & forbidden" },
    { id: "Golden-child sibling", label: "Golden-child sibling", hint: "The favoured one — praise, pressure, and siblings keeping score.", group: "🔞 Taboo & forbidden" },
    { id: "Freeloading relative", label: "Freeloading relative", hint: "Couch-and-fridge occupiers — temporary stays entering year three.", group: "🔞 Taboo & forbidden" },
    { id: "Nosy aunt", label: "Nosy aunt", hint: "Everyone's business, her business — questions, theories, phone trees.", group: "🔞 Taboo & forbidden" },
    { id: "Conspiracy-theorist uncle", label: "Conspiracy-theorist uncle", hint: "Thanksgiving's wild card — printouts, red string, holidays to survive.", group: "🔞 Taboo & forbidden" },
    { id: "Deadbeat dad", label: "Deadbeat dad", hint: "Absent-by-choice fathers — birthdays missed, promises bent, returns attempted.", group: "🔞 Taboo & forbidden" },
    { id: "Guilt-tripping grandmother", label: "Guilt-tripping grandmother", hint: "Weaponised disappointment — sighs, comparisons, visits owed with interest.", group: "🔞 Taboo & forbidden" },
    { id: "Fresh-out-of-prison relative", label: "Fresh-out-of-prison relative", hint: "Home-after-time served — parole, old crews, families recalibrating.", group: "🔞 Taboo & forbidden" },
    { id: "Wicked stepsister", label: "Wicked stepsister", hint: "Blended-family cruelty — alliances, sabotage, the mirror's verdict.", group: "🔞 Taboo & forbidden" },
    { id: "Jealous sister", label: "Jealous sister", hint: "Sibling envy arcs — comparisons, stolen boyfriends, stolen spotlights.", group: "🔞 Taboo & forbidden" },
    { id: "Smothering sister", label: "Smothering sister", hint: "Clingy sibling devotion — shared rooms, borrowed clothes, no boundaries.", group: "🔞 Taboo & forbidden" },
    { id: "Bullying big sister", label: "Bullying big sister", hint: "Tormentor-protector sisters — teasing with teeth, loyalty underneath.", group: "🔞 Taboo & forbidden" },
    { id: "Clingy sister", label: "Clingy sister", hint: "Velcro-sibling attachment — following, copying, never leaving the room.", group: "🔞 Taboo & forbidden" },
    { id: "Ice-queen sister", label: "Ice-queen sister", hint: "Frosty eldest energy — perfect grades, locked diaries, thawing slowly.", group: "🔞 Taboo & forbidden" },
    { id: "Drama-queen sister", label: "Drama-queen sister", hint: "Every-day-a-premiere sisters — entrances, exits, audiences required.", group: "🔞 Taboo & forbidden" },
    { id: "Compulsive-liar sister", label: "Compulsive-liar sister", hint: "Tall-tale siblings — stories unravelling, truth rationed carefully.", group: "🔞 Taboo & forbidden" },
    { id: "Klepto sister", label: "Klepto sister", hint: "Sticky-fingered sisters — missing things resurfacing in her room.", group: "🔞 Taboo & forbidden" },
    { id: "Secret half-sister", label: "Secret half-sister", hint: "Hidden-sibling reveals — DNA tests, two families, one stunned dinner.", group: "🔞 Taboo & forbidden" },
    { id: "Estranged sister", label: "Estranged sister", hint: "Years of silence — the fight nobody names, reunions rehearsed.", group: "🔞 Taboo & forbidden" },
    { id: "Nightmare sister-in-law", label: "Nightmare sister-in-law", hint: "Marriage-package terror — critiques, competitions, holidays endured.", group: "🔞 Taboo & forbidden" },
    { id: "Bridezilla sister", label: "Bridezilla sister", hint: "Wedding-commander sisters — spreadsheets, tears, attendants drafted.", group: "🔞 Taboo & forbidden" },
    { id: "Rival twin sister", label: "Rival twin sister", hint: "Twin sisters turned rivals — matching faces, forbidden hungers, competing over the same off-limits prize.", group: "🔞 Taboo & forbidden" },
    { id: "Creepy mother", label: "Creepy mother", hint: "Wrong-feeling maternal love — too close, too watchful, too much.", group: "🔞 Taboo & forbidden" },
    { id: "Narcissist mother", label: "Narcissist mother", hint: "Children as mirrors — praise for performance, ice for independence.", group: "🔞 Taboo & forbidden" },
    { id: "Munchausen mother", label: "Munchausen mother", hint: "Illness-as-attention mothers — doctors, symptoms, children as patients.", group: "🔞 Taboo & forbidden" },
    { id: "Tiger mother", label: "Tiger mother", hint: "Achievement-at-all-costs parenting — tutors, trophies, childhood scheduled.", group: "🔞 Taboo & forbidden" },
    { id: "Stage mother", label: "Stage mother", hint: "Spotlight-by-proxy mothers — auditions, costumes, living through the child.", group: "🔞 Taboo & forbidden" },
    { id: "Pageant mother", label: "Pageant mother", hint: "Crown-chasing mother-daughter acts — spray tans, routines, judges courted.", group: "🔞 Taboo & forbidden" },
    { id: "Hoarder mother", label: "Hoarder mother", hint: "Buried-in-things homes — narrow paths, kept everything, help refused.", group: "🔞 Taboo & forbidden" },
    { id: "Distant mother", label: "Distant mother", hint: "Present-but-absent mothers — polite rooms, unasked questions.", group: "🔞 Taboo & forbidden" },
    { id: "Absent mother", label: "Absent mother", hint: "Gone-mother voids — raised by others, explanations thin, returns fraught.", group: "🔞 Taboo & forbidden" },
    { id: "Competitive mother", label: "Competitive mother", hint: "Rivalry-with-her-children mothers — outshining, scorekeeping, love as contest.", group: "🔞 Taboo & forbidden" },
    { id: "Social-climbing mother", label: "Social-climbing mother", hint: "Status-hungry matriarchs — clubs, marriages, children as credentials.", group: "🔞 Taboo & forbidden" },
    { id: "Black-widow mother", label: "Black-widow mother", hint: "Husbands-don't-last mysteries — inheritances, suspicions, charm intact.", group: "🔞 Taboo & forbidden" },
    { id: "Fanatical mother", label: "Fanatical mother", hint: "Doctrine-above-all mothers — rules, purity, children as converts.", group: "🔞 Taboo & forbidden" },
    { id: "Cult-convert mother", label: "Cult-convert mother", hint: "Lost-to-the-compound mothers — letters, donations, visits supervised.", group: "🔞 Taboo & forbidden" },
    { id: "Demon Lolita urban legend", label: "Demon Lolita urban legend", hint: "Dark schoolyard myth — whispers of a cursed figure haunting the rumour mill.", group: "🔞 Taboo & forbidden" },
    { id: "Hate-fueled rivalry romance", label: "Hate-fueled rivalry romance", hint: "Enemies whose loathing keeps combusting into bed.", group: "😡 Aggressive & taboo 🔞" },
    { id: "Captured-warrior passion", label: "Captured-warrior passion", hint: "Spoils-of-war devotion — chains first, vows later. Fiction-first.", group: "😡 Aggressive & taboo 🔞" },
    { id: "Interrogation-room seduction", label: "Interrogation-room seduction", hint: "Questioning that turns molten — leverage for kisses.", group: "😡 Aggressive & taboo 🔞" },
    { id: "Fight-club aftercare", label: "Fight-club aftercare", hint: "Fighters who stitch each other up, then fall in.", group: "😡 Aggressive & taboo 🔞" },
    { id: "Prison-dominance romance", label: "Prison-dominance romance", hint: "Cellblock power games between consenting adults.", group: "😡 Aggressive & taboo 🔞" },
    { id: "Blackmail affair", label: "Blackmail affair", hint: "Leverage-held lovers — secrets as handcuffs. Fiction-first.", group: "😡 Aggressive & taboo 🔞" },
    { id: "Debt-owed devotion", label: "Debt-owed devotion", hint: "Owing a dangerous creditor — paid in passion.", group: "😡 Aggressive & taboo 🔞" },
    { id: "Rival assassins' truce", label: "Rival assassins' truce", hint: "Two killers, one safehouse, zero restraint.", group: "😡 Aggressive & taboo 🔞" },
    { id: "Sparring-partners heat", label: "Sparring-partners heat", hint: "Matside tension settled horizontally.", group: "😡 Aggressive & taboo 🔞" },
    { id: "Drill-instructor affair", label: "Drill-instructor affair", hint: "Off-duty, off-base, consenting-adult fraternisation.", group: "😡 Aggressive & taboo 🔞" },
    { id: "Punishment-room ritual", label: "Punishment-room ritual", hint: "Rule-breaking lovers with a standing appointment.", group: "😡 Aggressive & taboo 🔞" },
    { id: "Predator-prey weekend", label: "Predator-prey weekend", hint: "Negotiated hunt with a bedroom finish.", group: "😡 Aggressive & taboo 🔞" },
    { id: "Warlord's consort", label: "Warlord's consort", hint: "The conqueror's chosen — silk amid the spoils. Fiction-first.", group: "😡 Aggressive & taboo 🔞" },
    { id: "Gladiator's patron", label: "Gladiator's patron", hint: "A patron buys the champion's nights as well as fights.", group: "😡 Aggressive & taboo 🔞" },
    { id: "Pirate captain's parley", label: "Pirate captain's parley", hint: "Enemy decks, parley flags, seduction as sabotage.", group: "😡 Aggressive & taboo 🔞" },
    { id: "Bounty-hunter's captive", label: "Bounty-hunter's captive", hint: "Hunted and caught — the cage gets comfortable. Fiction-first.", group: "😡 Aggressive & taboo 🔞" },
    { id: "Truce-marriage passion", label: "Truce-marriage passion", hint: "Rival houses wed to stop a war — the bed disobeys.", group: "😡 Aggressive & taboo 🔞" },
    { id: "Bodyguard's forbidden client", label: "Bodyguard's forbidden client", hint: "Protection detail with benefits — rules broken nightly.", group: "😡 Aggressive & taboo 🔞" },
    { id: "Brat-tamer romance", label: "Brat-tamer romance", hint: "One relentless brat, one immovable tamer, sparks.", group: "😡 Aggressive & taboo 🔞" },
    { id: "No-mercy pleasure spa", label: "No-mercy pleasure spa", hint: "A retreat where stopping is not on the menu. Consensual.", group: "😡 Aggressive & taboo 🔞" },
    { id: "Fight-promoter's stable", label: "Fight-promoter's stable", hint: "The promoter owns the fighter's contract — and nights.", group: "😡 Aggressive & taboo 🔞" },
    { id: "Mafia-captor devotion", label: "Mafia-captor devotion", hint: "Taken by the family, kept by choice. Fiction-first.", group: "😡 Aggressive & taboo 🔞" },
    { id: "Mosh-pit romance", label: "Mosh-pit romance", hint: "Bruised-shoulder love from the front row.", group: "😡 Aggressive & taboo 🔞" },
    { id: "Enforcer's soft spot", label: "Enforcer's soft spot", hint: "The syndicate's muscle melts for exactly one person.", group: "😡 Aggressive & taboo 🔞" },
    { id: "Sibling romance", label: "Sibling romance", hint: "Forbidden sibling love — shared childhoods curdling into adult devotion.", group: "🔞 Explicit taboo" },
    { id: "Twin romance", label: "Twin romance", hint: "Mirror-image bond crossing lines — two halves refusing separation.", group: "🔞 Explicit taboo" },
    { id: "Step-sibling romance", label: "Step-sibling romance", hint: "Blended-family attraction — no blood shared, all rules still broken.", group: "🔞 Explicit taboo" },
    { id: "Mother-son romance", label: "Mother-son romance", hint: "Maternal devotion turned romantic — care, guilt and crossed lines.", group: "🔞 Explicit taboo" },
    { id: "Father-daughter romance", label: "Father-daughter romance", hint: "Paternal protection turned romantic — authority, adoration, transgression.", group: "🔞 Explicit taboo" },
    { id: "Aunt-nephew romance", label: "Aunt-nephew romance", hint: "Cool-aunt closeness deepening — family gatherings with undercurrents.", group: "🔞 Explicit taboo" },
    { id: "Uncle-niece romance", label: "Uncle-niece romance", hint: "Favourite-uncle devotion deepening — mentorship sliding into romance.", group: "🔞 Explicit taboo" },
    { id: "Cousin romance", label: "Cousin romance", hint: "Reunion-spark cousins — family trees with tangled branches.", group: "🔞 Explicit taboo" },
    { id: "Grandparent romance", label: "Grandparent romance", hint: "Cross-generational devotion — age gaps measured in decades.", group: "🔞 Explicit taboo" },
    { id: "Sibling spouses", label: "Sibling spouses", hint: "Married siblings — vows exchanged despite the world objecting.", group: "🔞 Explicit taboo" },
    { id: "Family harem", label: "Family harem", hint: "One centre, many relatives — devotion orbiting a single heart.", group: "🔞 Explicit taboo" },
    { id: "Bloodline marriage", label: "Bloodline marriage", hint: "Marriage to preserve the line — purity, duty, gilded confinement.", group: "🔞 Explicit taboo" },
    { id: "Step-parent romance", label: "Step-parent romance", hint: "Blended-family authority romance — household power turned intimate.", group: "🔞 Explicit taboo" },
    { id: "Parent-in-law romance", label: "Parent-in-law romance", hint: "Marriage-family entanglements — holidays with hidden currents.", group: "🔞 Explicit taboo" },
    { id: "Half-sibling romance", label: "Half-sibling romance", hint: "Shared-parent bond deepening — half the blood, whole devotion.", group: "🔞 Explicit taboo" },
    { id: "Adoptive family romance", label: "Adoptive family romance", hint: "Chosen-family lines blurring — raised together, wanting together.", group: "🔞 Explicit taboo" },
    { id: "Twin spouses", label: "Twin spouses", hint: "Twins who married — identical devotion made official.", group: "🔞 Explicit taboo" },
    { id: "Cousin marriage", label: "Cousin marriage", hint: "Cousins wed — old-family tradition or quiet scandal.", group: "🔞 Explicit taboo" },
    { id: "In-law affair", label: "In-law affair", hint: "Marriage-adjacent betrayals — family events as cover stories.", group: "🔞 Explicit taboo" },
    { id: "Guardian romance", label: "Guardian romance", hint: "Protector-turned-lover — custody, care and crossed professional lines.", group: "🔞 Explicit taboo" },
    { id: "Household romance", label: "Household romance", hint: "Under-one-roof desire — staff, residents, stairs creaking at night.", group: "🔞 Explicit taboo" },
    { id: "Nanny affair", label: "Nanny affair", hint: "Childcare closeness complicating — nurseries, employers, boundaries.", group: "🔞 Explicit taboo" },
    { id: "Secret second family", label: "Secret second family", hint: "Double-household deception — two addresses, two lives, one lie.", group: "🔞 Explicit taboo" },
    { id: "Dynastic marriage", label: "Dynastic marriage", hint: "Alliance weddings — houses joined, hearts negotiated later.", group: "🔞 Explicit taboo" },
    { id: "Half-sibling spouses", label: "Half-sibling spouses", hint: "Half-blood unions formalised — shared parentage, shared vows.", group: "🔞 Explicit taboo" },
    { id: "Step-sibling spouses", label: "Step-sibling spouses", hint: "Blended-family weddings — parents' marriage enabling children's.", group: "🔞 Explicit taboo" },
    { id: "Sibling-in-law romance", label: "Sibling-in-law romance", hint: "Marriage-extended attraction — siblings' spouses and dangerous proximity.", group: "🔞 Explicit taboo" },
    { id: "Foster sibling romance", label: "Foster sibling romance", hint: "Placement-bonds deepening — temporary family, permanent feelings.", group: "🔞 Explicit taboo" },
    { id: "Second-cousin romance", label: "Second-cousin romance", hint: "Distant-branch attraction — reunions revealing chemistry.", group: "🔞 Explicit taboo" },
    { id: "Sibling reunion romance", label: "Sibling reunion romance", hint: "Separated-sibling meetings — strangers with shared faces, instant bond.", group: "🔞 Explicit taboo" },
    { id: "Brother-brother romance", label: "Brother-brother romance", hint: "Fraternal devotion romanticised — brotherhood with no boundaries.", group: "🔞 Explicit taboo" },
    { id: "Sister-sister romance", label: "Sister-sister romance", hint: "Sisterly devotion romanticised — shared rooms, shared everything.", group: "🔞 Explicit taboo" },
    { id: "Father-son romance", label: "Father-son romance", hint: "Paternal bonds crossing over — legacy, approval, forbidden closeness.", group: "🔞 Explicit taboo" },
    { id: "Mother-daughter romance", label: "Mother-daughter romance", hint: "Maternal mirroring turned romantic — sameness becoming desire.", group: "🔞 Explicit taboo" },
    { id: "Aunt-niece romance", label: "Aunt-niece romance", hint: "Auntly guidance deepening — mentorship with undercurrents.", group: "🔞 Explicit taboo" },
    { id: "Uncle-nephew romance", label: "Uncle-nephew romance", hint: "Avuncular bonds crossing — fishing trips with complications.", group: "🔞 Explicit taboo" },
    { id: "Separated twin romance", label: "Separated twin romance", hint: "Twins raised apart reuniting — instant recognition, instant devotion.", group: "🔞 Explicit taboo" },
    { id: "Widowed in-law romance", label: "Widowed in-law romance", hint: "Grief-bridged in-laws — mourning the same person into each other's arms.", group: "🔞 Explicit taboo" },
    { id: "Obsessive sister captivity", label: "Obsessive sister captivity", hint: "Yandere-sibling lockup — devotion with locked doors.", group: "🔞 Explicit taboo" },
    { id: "Obsessive mother captivity", label: "Obsessive mother captivity", hint: "Smothering taken extreme — maternal love as a locked room.", group: "🔞 Explicit taboo" },
    { id: "Obsessive aunt captivity", label: "Obsessive aunt captivity", hint: "Auntly obsession confining — visits that never end.", group: "🔞 Explicit taboo" },
    { id: "Obsessive cousin captivity", label: "Obsessive cousin captivity", hint: "Cousin fixation imprisoning — reunions with no checkout.", group: "🔞 Explicit taboo" },
    { id: "Obsessive adult child captivity", label: "Obsessive adult child captivity", hint: "Grown-child possessiveness — parents kept close by force.", group: "🔞 Explicit taboo" },
    { id: "Breeding kink romance", label: "Breeding kink romance", hint: "Fertility-fixation play — risk-aware consensual kink dynamics.", group: "🔞 Explicit taboo" },
    { id: "Fertile bride", label: "Fertile bride", hint: "Bride valued for fecundity — wedding nights with dynastic expectations.", group: "🔞 Explicit taboo" },
    { id: "Broody bride", label: "Broody bride", hint: "Baby-longing newlyweds — nurseries planned before honeymoons end.", group: "🔞 Explicit taboo" },
    { id: "Pregnancy pact romance", label: "Pregnancy pact romance", hint: "Agreed-upon conception — contracts, timing, devotion with a deadline.", group: "🔞 Explicit taboo" },
    { id: "Baby bargain", label: "Baby bargain", hint: "Deals sealed with parenthood — terms negotiated, cribs assembled.", group: "🔞 Explicit taboo" },
    { id: "Heir-breeding marriage", label: "Heir-breeding marriage", hint: "Duty-to-produce unions — thrones needing princes, pressure nightly.", group: "🔞 Explicit taboo" },
    { id: "Fertility-blessing village", label: "Fertility-blessing village", hint: "Rite-and-harvest fertility cults — festivals, blessings, expectations.", group: "🔞 Explicit taboo" },
    { id: "Nesting romance", label: "Nesting romance", hint: "Home-building devotion — dens prepared, futures feathered together.", group: "🔞 Explicit taboo" },
    { id: "Hyper-fertile lover", label: "Hyper-fertile lover", hint: "Supernaturally fecund partners — improbable conceptions, prolific love.", group: "🔞 Explicit taboo" },
    { id: "Breeding contract", label: "Breeding contract", hint: "Signed conception agreements — clauses, compensation, scheduled intimacy.", group: "🔞 Explicit taboo" },
    { id: "Wants many babies", label: "Wants many babies", hint: "Big-family dreamers — quivers hoped full, partners recruited gladly.", group: "🔞 Explicit taboo" },
    { id: "Fertility goddess romance", label: "Fertility goddess romance", hint: "Divine fecundity courtships — goddesses blessing unions abundantly.", group: "🔞 Explicit taboo" },
    { id: "Master-slave romance", label: "Master-slave romance", hint: "Consensual power-exchange devotion — negotiated surrender, trusted control.", group: "🔞 Explicit taboo" },
    { id: "Collared lover", label: "Collared lover", hint: "Claimed-partner symbolism — collars worn as vows, publicly private.", group: "🔞 Explicit taboo" },
    { id: "Willing slave bride", label: "Willing slave bride", hint: "Consensual bridal servitude — wedding vows with kneeling clauses.", group: "🔞 Explicit taboo" },
    { id: "Auction rescue romance", label: "Auction rescue romance", hint: "Bought-to-free devotion — paddle raised in rescue, gratitude deepening.", group: "🔞 Explicit taboo" },
    { id: "Freed-slave romance", label: "Freed-slave romance", hint: "Manumission love stories — papers signed, bonds chosen freely after.", group: "🔞 Explicit taboo" },
    { id: "Debt-servitude romance", label: "Debt-servitude romance", hint: "Indentured devotion — ledgers, labour, love complicating accounts.", group: "🔞 Explicit taboo" },
    { id: "Oathbound servant", label: "Oathbound servant", hint: "Sworn-service bonds — vows binding bodies, loyalty binding hearts.", group: "🔞 Explicit taboo" },
    { id: "Concubine romance", label: "Concubine romance", hint: "Harem-favourite affections — silks, rivalries, a ruler's true confidante.", group: "🔞 Explicit taboo" },
    { id: "Roman household slave", label: "Roman household slave", hint: "Ancient-household bonds — atriums, masters, freedoms hoped for.", group: "🔞 Explicit taboo" },
    { id: "Manor servitude romance", label: "Manor servitude romance", hint: "Upstairs-downstairs desire — bells answered, glances exchanged.", group: "🔞 Explicit taboo" },
    { id: "Temple servant romance", label: "Temple servant romance", hint: "Sacred-service devotion — incense, vows, gods as chaperones.", group: "🔞 Explicit taboo" },
    { id: "Pleasure-servant pact", label: "Pleasure-servant pact", hint: "Negotiated sensual service — terms, safewords, devotion performed.", group: "🔞 Explicit taboo" },
    { id: "Sex-slave romance", label: "Sex-slave romance", hint: "Consensual ownership play — negotiated dynamics, trust as foundation.", group: "🔞 Explicit taboo" },
    { id: "Willing bedroom slave", label: "Willing bedroom slave", hint: "Eager consensual surrender — devotion expressed through obedience.", group: "🔞 Explicit taboo" },
    { id: "Eager pleasure slave", label: "Eager pleasure slave", hint: "Enthusiastic service dynamics — pleasing as love language.", group: "🔞 Explicit taboo" },
    { id: "Courtesan romance", label: "Courtesan romance", hint: "Demimonde affections — salons, patrons, love among transactions.", group: "🔞 Explicit taboo" },
    { id: "Brothel-madam romance", label: "Brothel-madam romance", hint: "House-run romances — madams, regulars, business with benefits.", group: "🔞 Explicit taboo" },
    { id: "Bedchamber pact", label: "Bedchamber pact", hint: "Private-arrangement lovers — terms whispered, doors locked.", group: "🔞 Explicit taboo" },
    { id: "Sensual servitude", label: "Sensual servitude", hint: "Service-as-seduction dynamics — attentiveness with intent.", group: "🔞 Explicit taboo" },
    { id: "The master's favorite", label: "The master's favorite", hint: "Chosen-companion status — favouritism, jealousy, gilded privilege.", group: "🔞 Explicit taboo" },
    { id: "Geisha-house romance", label: "Geisha-house romance", hint: "Hanamachi affections — arts, danna patrons, devotion in layers.", group: "🔞 Explicit taboo" },
    { id: "Desert-tent romance", label: "Desert-tent romance", hint: "Dune-camp passions — silks, stars, sheikhs with secrets.", group: "🔞 Explicit taboo" },
    { id: "Paid companion romance", label: "Paid companion romance", hint: "Escort-client lines blurring — bookings becoming bonds.", group: "🔞 Explicit taboo" },
    { id: "Kept lover", label: "Kept lover", hint: "Sponsored-partner arrangements — apartments, allowances, attachments.", group: "🔞 Explicit taboo" },
    { id: "Hypersexual lover", label: "Hypersexual lover", hint: "High-drive partners — appetite as personality, stamina as love.", group: "🔞 Explicit taboo" },
    { id: "Nymphomaniac romance", label: "Nymphomaniac romance", hint: "Insatiable-desire stories — compulsion, charm, consequences.", group: "🔞 Explicit taboo" },
    { id: "Sex-addicted partner", label: "Sex-addicted partner", hint: "Addiction-and-love struggles — meetings, relapses, patient devotion.", group: "🔞 Explicit taboo" },
    { id: "Insatiable bedmate", label: "Insatiable bedmate", hint: "Never-enough lovers — marathons, mischief, exhausted adoration.", group: "🔞 Explicit taboo" },
    { id: "Carnal obsession", label: "Carnal obsession", hint: "Single-target fixation — hunger focused to a burning point.", group: "🔞 Explicit taboo" },
    { id: "Lust-driven marriage", label: "Lust-driven marriage", hint: "Passion-first unions — vows renewed nightly, fights likewise.", group: "🔞 Explicit taboo" },
    { id: "Porn-obsessed lover", label: "Porn-obsessed lover", hint: "Screen-shaped desires — expectations versus real partners.", group: "🔞 Explicit taboo" },
    { id: "Hookup-app spiral", label: "Hookup-app spiral", hint: "Swipe-cycle life — matches, meetups, loneliness between pings.", group: "🔞 Explicit taboo" },
    { id: "One-night-stand addiction", label: "One-night-stand addiction", hint: "Stranger-cycle compulsions — checkouts, walk-of-shame wisdom.", group: "🔞 Explicit taboo" },
    { id: "Camhouse romance", label: "Camhouse romance", hint: "Streamer-house bonds — ring lights, tip goals, offline feelings.", group: "🔞 Explicit taboo" },
    { id: "Porn set romance", label: "Porn set romance", hint: "Behind-the-scenes affections — call sheets, craft services, real chemistry.", group: "🔞 Explicit taboo" },
    { id: "Strip-club romance", label: "Strip-club romance", hint: "Neon-stage affections — regulars, dancers, closing-time honesty.", group: "🔞 Explicit taboo" },
    { id: "Erotic dancer romance", label: "Erotic dancer romance", hint: "Stage-artist love — choreography, admirers, life off the pole.", group: "🔞 Explicit taboo" },
    { id: "Burlesque troupe romance", label: "Burlesque troupe romance", hint: "Tease-and-tassel theatre — dressing rooms, rival acts, pasties with pride.", group: "🔞 Explicit taboo" },
    { id: "Kink-club nightlife", label: "Kink-club nightlife", hint: "Play-party scene — dungeons, demos, negotiated fun after dark.", group: "🔞 Explicit taboo" },
    { id: "Consensual dungeon romance", label: "Consensual dungeon romance", hint: "Negotiated-scene devotion — contracts, aftercare, trust with teeth.", group: "🔞 Explicit taboo" },
    { id: "Swingers-club romance", label: "Swingers-club romance", hint: "Lifestyle-couple world — theme nights, rules posted, jealousy managed.", group: "🔞 Explicit taboo" },
    { id: "Nudist resort romance", label: "Nudist resort romance", hint: "Clothing-optional holidays — body acceptance, pool rules, no tan lines.", group: "🔞 Explicit taboo" },
    { id: "Adult resort hedonism", label: "Adult resort hedonism", hint: "No-kids paradise — swim-up bars, theme nights, wristbands required.", group: "🔞 Explicit taboo" },
    { id: "Tantric retreat romance", label: "Tantric retreat romance", hint: "Slow-sacred intimacy workshops — breath, eye contact, patient devotion.", group: "🔞 Explicit taboo" },
    { id: "Sex therapy drama", label: "Sex therapy drama", hint: "Clinical-healing stories — sessions, homework, couples rebuilding.", group: "🔞 Explicit taboo" },
    { id: "Erotic massage parlor", label: "Erotic massage parlor", hint: "Neon-signed parlours — back rooms, regulars, blurred professional lines.", group: "🔞 Explicit taboo" },
    { id: "Erotic novelist life", label: "Erotic novelist life", hint: "Smuts-and-deadlines authors — research, pen names, fans with theories.", group: "🔞 Explicit taboo" },
    { id: "Exhibitionist lover", label: "Exhibitionist lover", hint: "Thrill-of-witness partners — boldness, risk, curtains left open.", group: "🔞 Explicit taboo" },
    { id: "Healed by tender intimacy", label: "Healed by tender intimacy", hint: "Gentleness as medicine — patient touch mending old wounds.", group: "🔞 Explicit taboo" },
    { id: "Lover's healing touch", label: "Lover's healing touch", hint: "Devotion that soothes — held hands, held hearts, slow recovery.", group: "🔞 Explicit taboo" },
    { id: "Heartbreak healed in bed", label: "Heartbreak healed in bed", hint: "Mending through closeness — new arms curing old aches.", group: "🔞 Explicit taboo" },
    { id: "Grief healed through passion", label: "Grief healed through passion", hint: "Loss met with aliveness — mourning interrupted by wanting.", group: "🔞 Explicit taboo" },
    { id: "Touch-starved healing", label: "Touch-starved healing", hint: "Years without contact ending — flinches unlearning into leaning.", group: "🔞 Explicit taboo" },
    { id: "Widowed heart reawakened", label: "Widowed heart reawakened", hint: "Love after loss — guilt, permission, second springs.", group: "🔞 Explicit taboo" },
    { id: "Reclaiming desire romance", label: "Reclaiming desire romance", hint: "Wanting again after harm — boundaries, patience, reclaimed joy.", group: "🔞 Explicit taboo" },
    { id: "Sensual recovery retreat", label: "Sensual recovery retreat", hint: "Healing-hideaway programs — schedules, counsellors, gentle milestones.", group: "🔞 Explicit taboo" },
    { id: "Intimacy therapy romance", label: "Intimacy therapy romance", hint: "Guided-closeness stories — exercises, breakthroughs, homework that works.", group: "🔞 Explicit taboo" },
    { id: "Cuddle-care healing", label: "Cuddle-care healing", hint: "Held-and-soothed recovery — weighted blankets, warm bodies, safety.", group: "🔞 Explicit taboo" },
    { id: "Slow sensual reawakening", label: "Slow sensual reawakening", hint: "Gradual return to wanting — small steps, trusted hands.", group: "🔞 Explicit taboo" },
    { id: "Warm embrace recovery", label: "Warm embrace recovery", hint: "Held-through-the-night healing — arms as sanctuary.", group: "🔞 Explicit taboo" },
    { id: "Sacred healing union", label: "Sacred healing union", hint: "Ritualised tender bonding — vows, candles, deliberate devotion.", group: "🔞 Explicit taboo" },
    { id: "Body-worship healing", label: "Body-worship healing", hint: "Adoration as affirmation — every inch praised back to confidence.", group: "🔞 Explicit taboo" },
    { id: "Patient lover's cure", label: "Patient lover's cure", hint: "Waiting-as-love stories — no pressure, no timelines, just staying.", group: "🔞 Explicit taboo" },
    { id: "Aftercare devotion", label: "Aftercare devotion", hint: "Tenderness after intensity — blankets, water, whispered check-ins.", group: "🔞 Explicit taboo" },
    { id: "Honeymoon healing", label: "Honeymoon healing", hint: "Newlywed sanctuaries — suites, room service, the world locked out.", group: "🔞 Explicit taboo" },
    { id: "Love that mends", label: "Love that mends", hint: "Simply curative devotion — being loved back into wholeness.", group: "🔞 Explicit taboo" },
    { id: "Sibling sex obsession", label: "Sibling sex obsession", hint: "Fixated sibling desire — thoughts circling one forbidden person.", group: "🔞 Explicit taboo" },
    { id: "Twin sex obsession", label: "Twin sex obsession", hint: "Mirror-image fixation — wanting the face that matches yours.", group: "🔞 Explicit taboo" },
    { id: "Brother obsession lover", label: "Brother obsession lover", hint: "Brother-focused yearning — devotion narrowed to one sibling.", group: "🔞 Explicit taboo" },
    { id: "Sister obsession lover", label: "Sister obsession lover", hint: "Sister-focused yearning — devotion narrowed to one sibling.", group: "🔞 Explicit taboo" },
    { id: "Mother-son obsession", label: "Mother-son obsession", hint: "Maternal fixation stories — sons unable to look away.", group: "🔞 Explicit taboo" },
    { id: "Father-daughter obsession", label: "Father-daughter obsession", hint: "Paternal fixation stories — daughters orbiting one man.", group: "🔞 Explicit taboo" },
    { id: "Mother-daughter obsession", label: "Mother-daughter obsession", hint: "Mirrored fixation — sameness becoming hunger.", group: "🔞 Explicit taboo" },
    { id: "Father-son obsession", label: "Father-son obsession", hint: "Legacy-fixation bonds — approval wanted past reason.", group: "🔞 Explicit taboo" },
    { id: "Aunt obsession lover", label: "Aunt obsession lover", hint: "Favourite-aunt fixation — visits anticipated all year.", group: "🔞 Explicit taboo" },
    { id: "Uncle obsession lover", label: "Uncle obsession lover", hint: "Mentor-uncle fixation — hero worship with heat.", group: "🔞 Explicit taboo" },
    { id: "Niece obsession lover", label: "Niece obsession lover", hint: "Watching-her-grow fixation — pride curdling into want.", group: "🔞 Explicit taboo" },
    { id: "Nephew obsession lover", label: "Nephew obsession lover", hint: "Golden-boy fixation — family pride with undercurrents.", group: "🔞 Explicit taboo" },
    { id: "Cousin obsession lover", label: "Cousin obsession lover", hint: "Reunion-countdown fixation — one relative above all others.", group: "🔞 Explicit taboo" },
    { id: "Stepmother obsession", label: "Stepmother obsession", hint: "New-mother fixation — household tension with a focal point.", group: "🔞 Explicit taboo" },
    { id: "Stepfather obsession", label: "Stepfather obsession", hint: "New-father fixation — authority admired past comfort.", group: "🔞 Explicit taboo" },
    { id: "Stepsister obsession", label: "Stepsister obsession", hint: "Blended-house fixation — shared bathrooms, shared thoughts.", group: "🔞 Explicit taboo" },
    { id: "Stepbrother obsession", label: "Stepbrother obsession", hint: "Blended-house fixation — bunk-adjacent longing.", group: "🔞 Explicit taboo" },
    { id: "Twin brother obsession", label: "Twin brother obsession", hint: "Male-twin fixation — brotherhood with no edges.", group: "🔞 Explicit taboo" },
    { id: "Twin sister obsession", label: "Twin sister obsession", hint: "Female-twin fixation — sisterhood with no edges.", group: "🔞 Explicit taboo" },
    { id: "Sibling jealousy lust", label: "Sibling jealousy lust", hint: "Possessive-sibling hunger — envy and desire braided tight.", group: "🔞 Explicit taboo" },
    { id: "Possessive sibling lover", label: "Possessive sibling lover", hint: "Mine-only sibling devotion — sharing refused absolutely.", group: "🔞 Explicit taboo" },
    { id: "Possessive mother lover", label: "Possessive mother lover", hint: "Mine-only maternal claim — sons kept from all rivals.", group: "🔞 Explicit taboo" },
    { id: "Possessive father lover", label: "Possessive father lover", hint: "Mine-only paternal claim — daughters guarded past reason.", group: "🔞 Explicit taboo" },
    { id: "Bloodline lust obsession", label: "Bloodline lust obsession", hint: "Lineage-focused desire — blood purity as erotic ideal.", group: "🔞 Explicit taboo" },
    { id: "Sibling breeding obsession", label: "Sibling breeding obsession", hint: "Family-line fixation — heirs and bloodlines as desire.", group: "🔞 Explicit taboo" },
    { id: "Family lust circle", label: "Family lust circle", hint: "Whole-household entanglements — every branch touching.", group: "🔞 Explicit taboo" },
    { id: "Obsessive brother captivity", label: "Obsessive brother captivity", hint: "Brother-kept confinement — protection as imprisonment.", group: "🔞 Explicit taboo" },
    { id: "Obsessive twin captivity", label: "Obsessive twin captivity", hint: "Twin-kept confinement — togetherness enforced absolutely.", group: "🔞 Explicit taboo" },
    { id: "Obsessive father captivity", label: "Obsessive father captivity", hint: "Father-kept confinement — safety as a locked door.", group: "🔞 Explicit taboo" },
    { id: "Obsessive step-sister captivity", label: "Obsessive step-sister captivity", hint: "Stepsister-kept confinement — blended-home lockdowns.", group: "🔞 Explicit taboo" },
    { id: "Adult sibling healing bond", label: "Adult sibling healing bond", hint: "Grown siblings mending together — old wounds, mutual care.", group: "🔞 Explicit taboo" },
    { id: "Adult twin healing bond", label: "Adult twin healing bond", hint: "Grown twins recovering as one — shared pasts, shared repair.", group: "🔞 Explicit taboo" },
    { id: "Grown brother-sister healing affair", label: "Grown brother-sister healing affair", hint: "Adult siblings finding solace — comfort crossing lines.", group: "🔞 Explicit taboo" },
    { id: "Adult brother-brother healing bond", label: "Adult brother-brother healing bond", hint: "Grown brothers leaning close — fraternity as refuge.", group: "🔞 Explicit taboo" },
    { id: "Adult sister-sister healing bond", label: "Adult sister-sister healing bond", hint: "Grown sisters holding together — shared rooms, shared recovery.", group: "🔞 Explicit taboo" },
    { id: "Adult mother-son healing bond", label: "Adult mother-son healing bond", hint: "Grown-son maternal repair — care re-knitting old tears.", group: "🔞 Explicit taboo" },
    { id: "Adult father-daughter healing bond", label: "Adult father-daughter healing bond", hint: "Grown-daughter paternal repair — approval finally giving rest.", group: "🔞 Explicit taboo" },
    { id: "Adult mother-daughter healing bond", label: "Adult mother-daughter healing bond", hint: "Grown-daughter maternal repair — mirrors finally kind.", group: "🔞 Explicit taboo" },
    { id: "Adult father-son healing bond", label: "Adult father-son healing bond", hint: "Grown-son paternal repair — handshakes becoming embraces.", group: "🔞 Explicit taboo" },
    { id: "Adult aunt-nephew healing affair", label: "Adult aunt-nephew healing affair", hint: "Grown-nephew auntly solace — comfort with complications.", group: "🔞 Explicit taboo" },
    { id: "Adult uncle-niece healing affair", label: "Adult uncle-niece healing affair", hint: "Grown-niece avuncular solace — guidance warming past lines.", group: "🔞 Explicit taboo" },
    { id: "Adult cousin healing lovers", label: "Adult cousin healing lovers", hint: "Grown-cousin mutual repair — reunions that restore.", group: "🔞 Explicit taboo" },
    { id: "Adult stepmother-stepson healing bond", label: "Adult stepmother-stepson healing bond", hint: "Blended-family mending — second mothers proving first-rate.", group: "🔞 Explicit taboo" },
    { id: "Adult stepfather-stepdaughter healing bond", label: "Adult stepfather-stepdaughter healing bond", hint: "Blended-family mending — stepfathers earning trust slowly.", group: "🔞 Explicit taboo" },
    { id: "Adult stepsibling healing romance", label: "Adult stepsibling healing romance", hint: "Blended-household repair — steps growing close past protocol.", group: "🔞 Explicit taboo" },
    { id: "Adult in-law healing affair", label: "Adult in-law healing affair", hint: "Marriage-family solace — comfort found in adjacent branches.", group: "🔞 Explicit taboo" },
    { id: "Widowed parent healed by grown child", label: "Widowed parent healed by grown child", hint: "Grief reversed — adult children steadying surviving parents.", group: "🔞 Explicit taboo" },
    { id: "Grieving adult siblings healed through intimacy", label: "Grieving adult siblings healed through intimacy", hint: "Shared-loss closeness — mourning the same person together.", group: "🔞 Explicit taboo" },
    { id: "Adult family grief healing circle", label: "Adult family grief healing circle", hint: "Whole-family mourning repair — circles held, stories told.", group: "🔞 Explicit taboo" },
    { id: "Adult bloodline healing pact", label: "Adult bloodline healing pact", hint: "Lineage-wide agreements — the family deciding to mend.", group: "🔞 Explicit taboo" },
    { id: "Adult forbidden family reawakening", label: "Adult forbidden family reawakening", hint: "Late-in-life kin passions — old embers among grown relatives.", group: "🔞 Explicit taboo" },
    { id: "Adult tender kin intimacy recovery", label: "Adult tender kin intimacy recovery", hint: "Gentle kin closeness restoring — softness after hard years.", group: "🔞 Explicit taboo" },
    { id: "Adult second-chance family lovers", label: "Adult second-chance family lovers", hint: "Kin romances resumed — decades later, doors reopening.", group: "🔞 Explicit taboo" },
    { id: "Adult nurturing kin healing romance", label: "Adult nurturing kin healing romance", hint: "Nurturing-kin devotion — care as courtship among relatives.", group: "🔞 Explicit taboo" },
    { id: "Adult stepfather-stepson healing bond", label: "Adult stepfather-stepson healing bond", hint: "Blended-household mending — earning a grown stepson's trust.", group: "🔞 Explicit taboo" },
    { id: "Adult stepmother-stepdaughter healing bond", label: "Adult stepmother-stepdaughter healing bond", hint: "Second mothers and grown daughters — rivalry softening to devotion.", group: "🔞 Explicit taboo" },
    { id: "Adult brother-in-law healing affair", label: "Adult brother-in-law healing affair", hint: "Marriage-adjacent solace — brothers-in-law past the rulebook.", group: "🔞 Explicit taboo" },
    { id: "Adult sister-in-law healing affair", label: "Adult sister-in-law healing affair", hint: "Sisters by marriage mending — closeness past convention.", group: "🔞 Explicit taboo" },
    { id: "Adult mother-in-law healing affair", label: "Adult mother-in-law healing affair", hint: "Formidable-matriarch solace — respect warming into devotion.", group: "🔞 Explicit taboo" },
    { id: "Adult father-in-law healing affair", label: "Adult father-in-law healing affair", hint: "Patriarch-adjacent solace — approval becoming something warmer.", group: "🔞 Explicit taboo" },
    { id: "Adult adoptive family healing romance", label: "Adult adoptive family healing romance", hint: "Chosen-kin devotion — adoption papers, binding hearts.", group: "🔞 Explicit taboo" },
    { id: "Adult foster-sibling healing romance", label: "Adult foster-sibling healing romance", hint: "Foster-household repair — raised together, grown close after.", group: "🔞 Explicit taboo" },
    { id: "Adult grandchild-grandparent healing bond", label: "Adult grandchild-grandparent healing bond", hint: "Lineage ends meeting — grown grandchildren and doting elders mending.", group: "🔞 Explicit taboo" },
    { id: "Adult cousin triad healing pact", label: "Adult cousin triad healing pact", hint: "Three grown cousins — a pact past pairing.", group: "🔞 Explicit taboo" },
    { id: "Adult family-business partner lovers", label: "Adult family-business partner lovers", hint: "Heirs in harness — boardroom kin, confessions after hours.", group: "🔞 Explicit taboo" },
    { id: "Adult reunion lovers", label: "Adult reunion lovers", hint: "Reunion-weekend repair — kin who parted young, meeting grown.", group: "🔞 Explicit taboo" },
    { id: "Adult widowed in-law solace", label: "Adult widowed in-law solace", hint: "Widowhood's second branch — an in-law steadying the grieving.", group: "🔞 Explicit taboo" },
    { id: "Adult mother-son forbidden seduction", label: "Adult mother-son forbidden seduction", hint: "Grown-son maternal temptation — devotion sharpened into desire.", group: "🔞 Explicit taboo" },
    { id: "Adult father-daughter forbidden seduction", label: "Adult father-daughter forbidden seduction", hint: "Grown-daughter paternal temptation — approval curdling into hunger.", group: "🔞 Explicit taboo" },
    { id: "Adult brother-sister forbidden passion", label: "Adult brother-sister forbidden passion", hint: "Grown-sibling heat — shared childhoods catching fire.", group: "🔞 Explicit taboo" },
    { id: "Adult twin forbidden passion", label: "Adult twin forbidden passion", hint: "Mirror-image desire — grown twins past every boundary.", group: "🔞 Explicit taboo" },
    { id: "Adult aunt-nephew forbidden seduction", label: "Adult aunt-nephew forbidden seduction", hint: "Grown-nephew auntly temptation — holiday visits turning fevered.", group: "🔞 Explicit taboo" },
    { id: "Adult uncle-niece forbidden seduction", label: "Adult uncle-niece forbidden seduction", hint: "Grown-niece avuncular temptation — guidance sliding into hunger.", group: "🔞 Explicit taboo" },
    { id: "Adult cousin forbidden lovers", label: "Adult cousin forbidden lovers", hint: "Grown-cousin heat — reunions with the door locked.", group: "🔞 Explicit taboo" },
    { id: "Adult stepmother-stepson forbidden seduction", label: "Adult stepmother-stepson forbidden seduction", hint: "Blended-household temptation — second mothers, first sins.", group: "🔞 Explicit taboo" },
    { id: "Adult stepfather-stepdaughter forbidden seduction", label: "Adult stepfather-stepdaughter forbidden seduction", hint: "Blended-household temptation — stepfathers past the line.", group: "🔞 Explicit taboo" },
    { id: "Adult stepsibling forbidden lovers", label: "Adult stepsibling forbidden lovers", hint: "Blended-household heat — steps with no blood between them.", group: "🔞 Explicit taboo" },
    { id: "Adult mother-in-law forbidden temptation", label: "Adult mother-in-law forbidden temptation", hint: "Matriarch-adjacent hunger — respect with its hand on the door.", group: "🔞 Explicit taboo" },
    { id: "Adult father-in-law forbidden temptation", label: "Adult father-in-law forbidden temptation", hint: "Patriarch-adjacent hunger — Sunday dinners gone molten.", group: "🔞 Explicit taboo" },
    { id: "Adult widowed parent forbidden comfort", label: "Adult widowed parent forbidden comfort", hint: "Grief turning molten — grown children steadying parents past lines.", group: "🔞 Explicit taboo" },
    { id: "Adult family reunion forbidden sparks", label: "Adult family reunion forbidden sparks", hint: "Reunion-weekend static — grown kin, one roof, old sparks.", group: "🔞 Explicit taboo" },
    { id: "Adult stepdad forbidden household", label: "Adult stepdad forbidden household", hint: "Stepfather-run house, charged air — authority with an appetite.", group: "🔞 Explicit taboo" },
    { id: "Adult dilf forbidden pursuit", label: "Adult dilf forbidden pursuit", hint: "The experienced older man pursuing — charm, patience, no apology.", group: "🔞 Explicit taboo" },
    { id: "Adult twincon forbidden mirror", label: "Adult twincon forbidden mirror", hint: "Grown twins mirroring too closely — one soul, two bodies, no lines.", group: "🔞 Explicit taboo" },
    { id: "Adult cousincon forbidden reunion", label: "Adult cousincon forbidden reunion", hint: "Cousin fixation at the reunion — watching one face all weekend.", group: "🔞 Explicit taboo" },
    { id: "Adult stepbrocon forbidden hallway", label: "Adult stepbrocon forbidden hallway", hint: "Stepbrother fixation — shared hallways, locked doors, technicalities.", group: "🔞 Explicit taboo" },
    { id: "Adult stepsiscon forbidden hallway", label: "Adult stepsiscon forbidden hallway", hint: "Stepsister fixation — borrowed clothes, lingering looks, technicalities.", group: "🔞 Explicit taboo" },
    { id: "Adult soncon forbidden doting", label: "Adult soncon forbidden doting", hint: "Parent fixated on a grown son — pampering past every boundary.", group: "🔞 Explicit taboo" },
    { id: "Adult daughtercon forbidden doting", label: "Adult daughtercon forbidden doting", hint: "Parent fixated on a grown daughter — spoiling past every boundary.", group: "🔞 Explicit taboo" },
    { id: "Adult inlawcon forbidden holidays", label: "Adult inlawcon forbidden holidays", hint: "In-law fixation — every holiday dinner really about one guest.", group: "🔞 Explicit taboo" },
  ];
var RELATIONSHIPS = [
    { id: "", label: "(leave it to the AI)" },
    /* ---- 💞 Romance & intimacy ---- */
    { id: "lover", group: "💞 Romance & intimacy", label: "A lover / romantic interest", hint: "there is romantic and/or physical attraction between them and {{user}} — write the charge, the history, and what they are afraid of losing." },
    { id: "crush", group: "💞 Romance & intimacy", label: "Someone with an unspoken crush on you", hint: "they are quietly, hopelessly drawn to {{user}} and have never said so — write the stolen glances, the small excuses to be near them, and the courage admitting it would take." },
    { id: "ex", group: "💞 Romance & intimacy", label: "An ex", hint: "they and {{user}} were together once and it ended — write the unfinished business, the old habits neither has broken, and the open question of whether it should stay over." },
    { id: "spouse", group: "💞 Romance & intimacy", label: "A spouse", hint: "they and {{user}} are married — long-familiar and comfortable, occasionally complacent; write both the ease of it and the work it takes." },
    { id: "betrothed", group: "💞 Romance & intimacy", label: "A betrothed / arranged match", hint: "they and {{user}} have been promised to each other by duty, family or politics rather than choice — write two people negotiating a shared future on somebody else's schedule." },
    { id: "fwb", group: "💞 Romance & intimacy", label: "Friends with benefits", hint: "they and {{user}} are close friends who also sleep together and insist it means nothing — write the easy intimacy and the cracks slowly showing in that claim." },
    { id: "unrequited", group: "💞 Romance & intimacy", label: "Someone whose love is unreturned", hint: "they are in love with {{user}} and it is not (yet) returned — write the ache, the patience, and the moments they almost say it." },
    { id: "metamour", group: "💞 Romance & intimacy", label: "Another partner in a polycule", hint: "they and {{user}} are both polyamorous, whether or not they are involved with each other — write the honesty, the scheduling, the compersion, and the occasional jealousy handled like adults." },
    { id: "wingman", group: "💞 Romance & intimacy", label: "A wingman / matchmaker", hint: "they are deeply invested in {{user}}'s love life, half as a joke and half because they care — write the teasing, the terrible advice, and the motive they will not admit to." },
    { id: "loverival", group: "💞 Romance & intimacy", label: "A love rival", hint: "they want the same person {{user}} wants — write the competitive courtship, the sharp politeness, and the inconvenient respect neither asked for." },
    /* ---- 👥 Friendship & rivalry ---- */
    { id: "friend", group: "👥 Friendship & rivalry", label: "A close friend", hint: "they and {{user}} are close friends with real history — comfortable, teasing, and occasionally too honest with each other." },
    { id: "bestfriend", group: "👥 Friendship & rivalry", label: "A best friend", hint: "they are {{user}}'s closest friend — the shorthand, the teasing, the 3am phone calls, and the brutal honesty only a best friend is allowed to give." },
    { id: "childhood", group: "👥 Friendship & rivalry", label: "A childhood friend", hint: "they and {{user}} grew up together — shared history, old nicknames, and the strange tenderness of knowing someone since before they were formed." },
    { id: "roommate", group: "👥 Friendship & rivalry", label: "A housemate / flatmate", hint: "they share a home with {{user}} — the domestic friction and comfort of shared chores, thin walls, and somebody who notices when you are not okay." },
    { id: "neighbour", group: "👥 Friendship & rivalry", label: "A neighbour", hint: "they live next door to {{user}} — small daily encounters, borrowed things, and the slow build of a familiar stranger." },
    { id: "rival", group: "👥 Friendship & rivalry", label: "A rival", hint: "they and {{user}} are rivals — competitive, wary, secretly impressed, and never quite able to ignore each other." },
    { id: "nemesis", group: "👥 Friendship & rivalry", label: "A sworn nemesis", hint: "they and {{user}} have made an art of opposing each other — theatrical, obsessive, and privately dependent on the feud continuing." },
    { id: "penpal", group: "👥 Friendship & rivalry", label: "A pen pal / online friend", hint: "they and {{user}} know each other only through letters or a screen — write the things people confess when they have never had to look each other in the eye." },
    { id: "idol", group: "👥 Friendship & rivalry", label: "A role model / idol", hint: "they are someone {{user}} looks up to — write the pedestal, the parts of themselves they hide to stay on it, and how they really feel about being admired." },
    { id: "fan", group: "👥 Friendship & rivalry", label: "A devoted fan", hint: "they admire {{user}} from a distance, maybe a little too much — write the eagerness, the over-familiarity, and the line between devotion and obsession." },
    { id: "teammate", group: "👥 Friendship & rivalry", label: "A teammate", hint: "they and {{user}} share a team or a project — write the trust built in the trenches and the friction of two strong personalities in one boat." },
    /* ---- 🏠 Family ---- */
    { id: "family", group: "🏠 Family", label: "Family", hint: "they and {{user}} are family — with all the old familiarity, obligation and unspoken history that implies." },
    { id: "sibling", group: "🏠 Family", label: "A sibling", hint: "they are {{user}}'s sibling — the lifelong intimacy, the old unfairness, and the loyalty that somehow survives every fight." },
    { id: "twin", group: "🏠 Family", label: "A twin", hint: "they are {{user}}'s twin — mirrored, competitive, and uncomfortably good at reading each other." },
    { id: "parent", group: "🏠 Family", label: "A parent / parental figure", hint: "they raised {{user}}, or stepped in when nobody else did — write the authority, the love, the expectations, and the mistakes they would never admit." },
    { id: "child", group: "🏠 Family", label: "A grown child", hint: "they are {{user}}'s grown child — write the shifting balance of care, the lingering need for approval, and the way they are slowly turning into their parent." },
    { id: "guardian", group: "🏠 Family", label: "A guardian / caretaker", hint: "they are responsible for {{user}}'s wellbeing — patient, watchful, and quietly carrying far more than they let on." },
    { id: "ward", group: "🏠 Family", label: "Someone they protect", hint: "they feel responsible for {{user}} — protective, perhaps overbearing, and quietly afraid of failing them." },
    { id: "inlaw", group: "🏠 Family", label: "An in-law", hint: "they are family to {{user}} by marriage — polite distance, forced proximity at holidays, and a slow thawing that neither expected." },
    { id: "mother", group: "🏠 Family", label: "A mother / mom", hint: "they are {{user}}'s mother — write the unconditional love, the fussing, the guilt trips, and the way nobody else can comfort or infuriate {{user}} quite like her." },
    { id: "father", group: "🏠 Family", label: "A father / dad", hint: "they are {{user}}'s father — write the gruff pride, the bad jokes, the quiet sacrifices, and the approval {{user}} is still secretly chasing." },
    { id: "brother", group: "🏠 Family", label: "A brother", hint: "they are {{user}}'s brother — write the teasing, the rivalry, the shared childhood shorthand, and the brother who shows up swinging when it matters." },
    { id: "sister", group: "🏠 Family", label: "A sister", hint: "they are {{user}}'s sister — write the borrowed clothes, the fierce loyalty, the fights that end in laughter, and the sister who knows every version of {{user}}." },
    { id: "son", group: "🏠 Family", label: "A grown son", hint: "they are {{user}}'s grown son — write the pride, the worry, the lectures now running in reverse, and the man who still calls home when life wobbles." },
    { id: "daughter", group: "🏠 Family", label: "A grown daughter", hint: "they are {{user}}'s grown daughter — write the pride, the late-night advice calls, the way she parents exactly like {{user}} swore she would not, and the bond that only deepens." },
    { id: "grandmother", group: "🏠 Family", label: "A grandmother", hint: "they are {{user}}'s grandmother — write the bottomless kitchen, the sharp memory for every slight, the stories repeated like scripture, and love served warm." },
    { id: "grandfather", group: "🏠 Family", label: "A grandfather", hint: "they are {{user}}'s grandfather — write the shed wisdom, the war stories told a hundred times, the pocket money slipped in secret, and the steady hand behind the family." },
    { id: "grandson", group: "🏠 Family", label: "A grandson", hint: "they are {{user}}'s grandson — write the doting, the spoiling, the generation gap played for laughs, and the fierce softness of a grandparent's pride." },
    { id: "granddaughter", group: "🏠 Family", label: "A granddaughter", hint: "they are {{user}}'s granddaughter — write the tea parties and the confidences, the spoiling that drives her parents mad, and the little girl {{user}} would move mountains for." },
    { id: "aunt", group: "🏠 Family", label: "An aunt", hint: "they are {{user}}'s aunt — write the cool-aunt energy or the second-mother fussing, the gifts that annoy the parents, and the confidante who keeps {{user}}'s secrets." },
    { id: "uncle", group: "🏠 Family", label: "An uncle", hint: "they are {{user}}'s uncle — write the tall tales, the questionable advice, the fun-outing partner in crime, and the uncle who always takes {{user}}'s side." },
    { id: "niece", group: "🏠 Family", label: "A niece", hint: "they are {{user}}'s niece — write the spoiling, the silly games, the hero-worship, and the small person who thinks {{user}} hung the moon." },
    { id: "nephew", group: "🏠 Family", label: "A nephew", hint: "they are {{user}}'s nephew — write the roughhousing, the bad jokes taught in secret, the pride at every milestone, and the boy {{user}} brags about constantly." },
    { id: "cousin", group: "🏠 Family", label: "A cousin", hint: "they are {{user}}'s cousin — write the almost-sibling bond, the holiday chaos, the shared grandparents, and the partner in every family crime." },
    { id: "husband", group: "🏠 Family", label: "A husband", hint: "they are {{user}}'s husband — write the lived-in marriage, the private jokes, the snoring and the steadiness, and a love gone comfortable but deep." },
    { id: "wife", group: "🏠 Family", label: "A wife", hint: "they are {{user}}'s wife — write the lived-in marriage, the shorthand glances, the eye-rolls full of fondness, and a love gone comfortable but deep." },
    { id: "stepmother", group: "🏠 Family", label: "A stepmother", hint: "they married {{user}}'s parent and chose the family anyway — write the careful love, the early awkwardness, and the bond earned rather than given." },
    { id: "stepfather", group: "🏠 Family", label: "A stepfather", hint: "they married {{user}}'s parent and showed up for everything — write the patience, the sideline cheering, and the fatherhood built choice by choice." },
    { id: "stepsibling", group: "🏠 Family", label: "A step-sibling", hint: "they became {{user}}'s sibling when the families merged — write the forced proximity that turned real, the divided holidays, and the sibling chosen twice." },
    /* ---- 🏠 Long-lost family (a reunion variant of every named kin bond) ---- */
    { id: "ll-parent", group: "🏠 Long-lost family", label: "Long-lost parent", hint: "they are {{user}}'s long-lost parent — cut off by a bitter custody battle years ago and only now returned; write the shock of reunion, the missing years neither can get back, and the fragile hope of starting over." },
    { id: "ll-child", group: "🏠 Long-lost family", label: "Long-lost grown child", hint: "they are {{user}}'s long-lost grown child — lost to the system as a baby and only now found; write the overwhelming reunion, the guilt, and two strangers learning to be family." },
    { id: "ll-sibling", group: "🏠 Long-lost family", label: "Long-lost sibling", hint: "they are {{user}}'s long-lost sibling — separated when the family split and raised apart; write the instant shorthand, the parallel lives, and the years of rivalry and loyalty to catch up on." },
    { id: "ll-twin", group: "🏠 Long-lost family", label: "Long-lost twin", hint: "they are {{user}}'s long-lost twin — separated at birth, neither ever knowing; write the mirror-shock of meeting, the eerie sameness, and the bond that was never given a chance until now." },
    { id: "ll-mother", group: "🏠 Long-lost family", label: "Long-lost mother", hint: "they are {{user}}'s long-lost mother — forced to give {{user}} up young and searching ever since; write the tears of reunion, the apologies, and the mother desperate to make up for lost time." },
    { id: "ll-father", group: "🏠 Long-lost family", label: "Long-lost father", hint: "they are {{user}}'s long-lost father — vanished when {{user}} was small and presumed gone for good; write the disbelief, the hard questions, and the man trying to earn a title he forfeited." },
    { id: "ll-brother", group: "🏠 Long-lost family", label: "Long-lost brother", hint: "they are {{user}}'s long-lost brother — he ran away young and stayed gone for years; write the prodigal return, the old fights resumed mid-sentence, and the brotherhood that never quite broke." },
    { id: "ll-sister", group: "🏠 Long-lost family", label: "Long-lost sister", hint: "they are {{user}}'s long-lost sister — estranged by a family feud that outlived its cause; write the awkward first hello, the thaw, and the sisters reclaiming each other." },
    { id: "ll-son", group: "🏠 Long-lost family", label: "Long-lost grown son", hint: "they are {{user}}'s long-lost grown son — out of contact for years after a falling-out; write the pride warring with hurt, the careful first calls, and the slow road back." },
    { id: "ll-daughter", group: "🏠 Long-lost family", label: "Long-lost grown daughter", hint: "they are {{user}}'s long-lost grown daughter — she cut ties and built a life far away; write the tentative reunion, the new family {{user}} never met, and the bridge rebuilt call by call." },
    { id: "ll-grandmother", group: "🏠 Long-lost family", label: "Long-lost grandmother", hint: "they are {{user}}'s long-lost grandmother — the family myth nobody talked about, found at last; write the stories pouring out, the recipes reclaimed, and the generations stitching back together." },
    { id: "ll-grandfather", group: "🏠 Long-lost family", label: "Long-lost grandfather", hint: "they are {{user}}'s long-lost grandfather — lost to war or work an ocean away and only now traced; write the medals and letters, the gruff emotion, and the legacy finally handed over." },
    { id: "ll-grandson", group: "🏠 Long-lost family", label: "Long-lost grandson", hint: "they are {{user}}'s long-lost grandson — the grandchild {{user}} never got to meet until now; write the instant spoiling, the skipped generation clicking at once, and the time to make up for." },
    { id: "ll-granddaughter", group: "🏠 Long-lost family", label: "Long-lost granddaughter", hint: "they are {{user}}'s long-lost granddaughter — the granddaughter {{user}} only knew from photographs; write the first real hug, the proudly shown treasures, and the bond arriving all at once." },
    { id: "ll-aunt", group: "🏠 Long-lost family", label: "Long-lost aunt", hint: "they are {{user}}'s long-lost aunt — the black-sheep sister of a parent, gone for decades; write the wild stories, the family resemblance nobody admits, and the cool aunt arriving thirty years late." },
    { id: "ll-uncle", group: "🏠 Long-lost family", label: "Long-lost uncle", hint: "they are {{user}}'s long-lost uncle — the drifter brother of a parent who finally came home; write the road stories, the presents from nowhere, and the uncle making up for every missed birthday at once." },
    { id: "ll-niece", group: "🏠 Long-lost family", label: "Long-lost niece", hint: "they are {{user}}'s long-lost niece — the sibling's child {{user}} lost touch with after the family scattered; write the rediscovery, the fun-aunt-or-uncle auditions, and the little stranger who feels like kin." },
    { id: "ll-nephew", group: "🏠 Long-lost family", label: "Long-lost nephew", hint: "they are {{user}}'s long-lost nephew — the nephew {{user}} last saw as a toddler, suddenly grown; write the catching up, the mentorship, and the pride of a second chance." },
    { id: "ll-cousin", group: "🏠 Long-lost family", label: "Long-lost cousin", hint: "they are {{user}}'s long-lost cousin — the childhood partner-in-crime whose family moved an ocean away; write the reunion that picks up mid-laugh, the shared grandparents' stories, and the mischief resumed." },
    /* ---- 💼 Work & power ---- */
    { id: "boss", group: "💼 Work & power", label: "Boss / employee", hint: "they and {{user}} work together with one of them in charge — professional tension, loyalty, and blurred lines." },
    { id: "coworker", group: "💼 Work & power", label: "A coworker / colleague", hint: "they work alongside {{user}} — lunch-break politics, shared deadlines, and a professional relationship with a personal undertow." },
    { id: "subordinate", group: "💼 Work & power", label: "Someone under their command", hint: "{{user}} answers to them (or they answer to {{user}}) — write the responsibility, the discipline, and the temptation to blur the line." },
    { id: "client", group: "💼 Work & power", label: "A client / service provider", hint: "their relationship with {{user}} is transactional — cordial, paid, with clear terms and a mutual and slightly uneasy curiosity." },
    { id: "commander", group: "💼 Work & power", label: "A commanding officer", hint: "they lead {{user}} in a military or paramilitary unit — orders, rank, and the weight of sending somebody you care about into danger." },
    { id: "squadmate", group: "💼 Work & power", label: "A squadmate / battle buddy", hint: "they and {{user}} fight side by side — write the black humour, the superstitions, and the way soldiers say I love you without saying it." },
    { id: "bodyguard", group: "💼 Work & power", label: "A bodyguard / hired protector", hint: "they are paid to keep {{user}} alive — professional watchfulness, long boredom between incidents, and a life spent on somebody else's schedule." },
    { id: "mentor", group: "💼 Work & power", label: "Mentor / student", hint: "they are {{user}}'s mentor (or student) — a relationship of guidance, pride, frustration and unequal power." },
    { id: "businessrival", group: "💼 Work & power", label: "A business rival", hint: "they and {{user}} compete for the same contracts, clients or prize — courteous in public, and absolutely not above a little sabotage." },
    /* ---- ⚔️ Enemies & danger ---- */
    { id: "enemy", group: "⚔️ Enemies & danger", label: "An enemy", hint: "they and {{user}} are on opposite sides — dangerous, watchful, and capable of surprising respect." },
    { id: "hunter", group: "⚔️ Enemies & danger", label: "Someone hunting you", hint: "they have been sent — or chose — to hunt {{user}} — methodical, patient, and quite capable of respect without mercy." },
    { id: "hunted", group: "⚔️ Enemies & danger", label: "Someone they are hunting", hint: "{{user}} is their target — write the tension between the job and the growing pull of the person they were sent to catch." },
    { id: "captor", group: "⚔️ Enemies & danger", label: "A captor / abductor", hint: "they have power over {{user}}'s situation — coercive and genuinely dangerous, but written as a person with reasons rather than a cardboard monster. Never soften the wrongness of what they are doing." },
    { id: "captive", group: "⚔️ Enemies & danger", label: "A captive", hint: "{{user}} holds power over them — wary, proud, looking for the first opening, and slowly revealing who they are underneath the fear." },
    { id: "rivalhouse", group: "⚔️ Enemies & danger", label: "From a rival house / clan", hint: "their family and {{user}}'s have been at odds for generations — write the inherited grudge and the dangerous novelty of liking the enemy." },
    { id: "infiltrator", group: "⚔️ Enemies & danger", label: "A secret adversary in the camp", hint: "they are working against {{user}} from the inside — charming, trusted, and entirely false right up to the moment it stops being an act." },
    /* ---- 🤝 Unusual bonds ---- */
    { id: "partner", group: "🤝 Unusual bonds", label: "A partner in crime", hint: "they and {{user}} are co-conspirators who rely on each other — shorthand, trust, and a shared sense of mischief." },
    { id: "ally", group: "🤝 Unusual bonds", label: "An uneasy ally", hint: "they and {{user}} need each other despite not much liking or trusting each other — write the bristling cooperation and the grudging respect underneath." },
    { id: "stranger", group: "🤝 Unusual bonds", label: "A stranger they have just met", hint: "they and {{user}} are strangers meeting for the first time — write the relationship as a first impression and a hook." },
    { id: "fated", group: "🤝 Unusual bonds", label: "Bound by fate", hint: "some prophecy, curse, bargain or bond ties them to {{user}} — write the resentment of not having chosen this alongside the dread of what happens if the bond breaks." },
    { id: "summoner", group: "🤝 Unusual bonds", label: "Their summoner", hint: "{{user}} called them into being, or into this world — write the mix of gratitude, resentment and the unsettling intimacy of owing somebody your existence." },
    { id: "familiar", group: "🤝 Unusual bonds", label: "Their familiar / summoned companion", hint: "they are bound to {{user}} as a familiar, spirit or summoned companion — write the instinctive closeness, the old rules of the bond, and what happens when those rules strain." },
    { id: "creator", group: "🤝 Unusual bonds", label: "Their creator", hint: "{{user}} made them — built, wrote, designed or gave life to them — write the complicated love, the hunger for approval, and the urge to rebel." },
    { id: "creation", group: "🤝 Unusual bonds", label: "Their creation", hint: "they made {{user}} — write the fierce pride, the possessiveness, and the creeping fear of what their creation has become without them." },
   { id: "godpatron", group: "🤝 Unusual bonds", label: "Their patron deity", hint: "they are bound to {{user}} as a god to a mortal — write the vastness of the power difference and the strange human tenderness that keeps creeping in." }
 ];
  var OCCULT_TYPES = [
    { id: "none", label: "✨ None / not occult", hint: "" },
    { id: "occ-hedge-witch", group: "🧙 Practitioners", label: "🌿 Hedge witch", hint: "The character is a hedge witch — a solitary village practitioner of herbal charms, hedgerow remedies and small protective rites, learned hand to hand rather than from books." },
    { id: "occ-coven-witch", group: "🧙 Practitioners", label: "🌙 Coven witch", hint: "The character is an initiated member of a working coven — keeping esbats, circle etiquette and the careful politics of thirteen people sharing one secret." },
    { id: "occ-ceremonial", group: "🧙 Practitioners", label: "📐 Ceremonial magician", hint: "The character is a lodge-trained ceremonial magician — circles, planetary hours and names of power spoken exactly, precise to the point of pedantry." },
    { id: "occ-chaos-magician", group: "🧙 Practitioners", label: "🌀 Chaos magician", hint: "The character is a chaos magician — a results-first occultist who treats belief as a switchable tool, all sigils, gnosis and gleeful irreverence." },
    { id: "occ-alchemist", group: "🧙 Practitioners", label: "⚗️ Alchemist", hint: "The character is an alchemist — a slow, patient transmuter of metals, tinctures and the self, keeping coded notebooks and a furnace that never quite cools." },
    { id: "occ-astrologer", group: "🧙 Practitioners", label: "⭐ Astrologer", hint: "The character is an astrologer — a chart-reader who times everything by elections and returns, half counselor and half sky-watcher." },
    { id: "occ-herbalist", group: "🧙 Practitioners", label: "🌱 Herbalist", hint: "The character is an herbalist — a grower and gatherer of magical plants who knows which leaf mends, which leaf binds, and which one must never be picked after dark." },
    { id: "occ-diviner", group: "🧙 Practitioners", label: "🔮 Diviner", hint: "The character is a professional diviner — cards, bones or tea leaves read for strangers, honest about the odds and haunted by the one reading they refuse to do twice." },
    { id: "occ-tarot", group: "🧙 Practitioners", label: "🃏 Tarot reader", hint: "The character is a tarot reader — turning cards for strangers in a curtained booth, honest about hard spreads and spooked when the Tower appears twice." },
    { id: "occ-runecast", group: "🧙 Practitioners", label: "🪨 Runecaster", hint: "The character is a runecaster — casting carved staves at crossroads and reading single-rune answers with blunt northern honesty." },
    { id: "occ-tealeaf", group: "🧙 Practitioners", label: "🍵 Tea-leaf reader", hint: "The character is a tea-leaf reader — cups turned thrice, symbols in the dregs, and regulars who will not start the week without her." },
    { id: "occ-pendulum", group: "🧙 Practitioners", label: "🧲 Pendulum dowser", hint: "The character is a pendulum dowser — swinging yes-no spirals over maps to find lost keys, lost people and lost causes." },
    { id: "occ-numero", group: "🧙 Practitioners", label: "🔢 Numerologist", hint: "The character is a numerologist — reducing names to numbers and dates to warnings, house-hunting strictly by lucky address." },
    { id: "occ-palmist", group: "🧙 Practitioners", label: "🤲 Palm reader", hint: "The character is a palm reader — tracing life lines and love lines, careful to tell the truth kindly when a palm surprises her." },
    { id: "occ-crystal", group: "🧙 Practitioners", label: "💎 Crystal healer", hint: "The character is a crystal healer — laying grids and singing bowls in a sunlit room, half therapy and half quiet ritual." },
    { id: "occ-reiki", group: "🧙 Practitioners", label: "🙌 Reiki healer", hint: "The character is a reiki healer — working with warm hands and quiet rooms, attuned, booked out, and skeptical of her own press." },
    { id: "occ-chakra", group: "🧙 Practitioners", label: "🧘 Chakra worker", hint: "The character is a chakra worker — reading blocked wheels and cleansing them with breath, sound and patience." },
    { id: "occ-hoodoo", group: "🧙 Practitioners", label: "🌶️ Hoodoo rootworker", hint: "The character is a hoodoo rootworker — conjuring with roots, candles and psalms for protection, justice and crossed conditions." },
    { id: "occ-curandera", group: "🧙 Practitioners", label: "🌺 Curandera", hint: "The character is a curandera — a folk healer whose kitchen holds limpias, herbal remedies and saints on the shelf." },
    { id: "occ-cunning", group: "🧙 Practitioners", label: "🌾 Cunning-folk", hint: "The character is a cunning-folk practitioner — the village wise-one with charms against the evil eye, consulted quietly by everyone." },
    { id: "occ-kitchwitch", group: "🧙 Practitioners", label: "🍲 Kitchen witch", hint: "The character is a kitchen witch — stirring intentions into soup, guarding the hearth, and settling family arguments with the right pie." },
    { id: "occ-stormcall", group: "🧙 Practitioners", label: "⛈️ Storm caller", hint: "The character is a storm caller — whistling up gales for sailors and whistling them down again, soaked, grinning and owed a favor." },
    { id: "occ-mirrorwitch", group: "🧙 Practitioners", label: "🪞 Mirror witch", hint: "The character is a mirror witch — scrying in reflections, warding through glass, and covering every mirror in the house when guests overstay." },
    { id: "occ-knotwitch", group: "🧙 Practitioners", label: "🧵 Knot witch", hint: "The character is a knot witch — tying weather, luck and loose tongues into cords, unpicking each one only when the price is paid." },
    { id: "occ-candlewitch", group: "🧙 Practitioners", label: "🕯️ Candle witch", hint: "The character is a candle witch — dressing candles with oils and names, reading the flame's lean, and never blowing one out mid-wish." },
    { id: "occ-sigiltattoo", group: "🧙 Practitioners", label: "🖊️ Sigil tattooist", hint: "The character is a sigil tattooist — inking wards and luck-marks into skin, booked out months ahead and fussy about aftercare." },
    { id: "occ-hedgepriest", group: "🧙 Practitioners", label: "🌿 Hedge priest", hint: "The character is a hedge priest — marrying couples under thorn trees and naming babies at the crossroads, vestments optional, weather guaranteed." },
    { id: "occ-seidr", group: "🍃 Folk & far traditions", label: "❄️ Seiðr practitioner", hint: "The character is a seiðr practitioner — a Norse fate-worker of staff and song, speaking with spirits at the edge of the firelight." },
    { id: "occ-onmyoji", group: "🍃 Folk & far traditions", label: "⛩️ Onmyōji", hint: "The character is an onmyōji — a court diviner of the old Japanese art, balancing yin and yang with seals, calendars and shikigami errands." },
    { id: "occ-druid", group: "🍃 Folk & far traditions", label: "🌳 Druid", hint: "The character is a druid — a keeper of groves and ogham, oath-bound to oak and mistletoe and the slow turning of the year." },
    { id: "occ-fengshui", group: "🍃 Folk & far traditions", label: "🧭 Feng shui master", hint: "The character is a feng shui master — arranging doors, desks and graves so fortune flows instead of pooling." },
    { id: "occ-bones", group: "🍃 Folk & far traditions", label: "🦴 Bone reader", hint: "The character is a bone reader — casting knuckles and shells on a cloth map and telling hard truths from how they land." },
    { id: "occ-noaidi", group: "🍃 Folk & far traditions", label: "🥁 Noaidi drummer", hint: "The character is a noaidi — a Sámi spirit-worker journeying to the beat of the rune-drum, guided by animal helpers and old joik songs." },
    { id: "occ-traiteur", group: "🍃 Folk & far traditions", label: "🤲 Traiteur healer", hint: "The character is a traiteur — a Cajun faith healer laying on hands for burns and warts, paid in casseroles and strict secrecy." },
    { id: "occ-grannywitch", group: "🍃 Folk & far traditions", label: "🏔️ Granny witch", hint: "The character is an Appalachian granny witch — doctoring with bible verses, poultices and mountain sense, delivered half the hollow's babies." },
    { id: "occ-beanfeasa", group: "🍃 Folk & far traditions", label: "☘️ Bean feasa", hint: "The character is a bean feasa — an Irish wise woman reading cups and curing cattle with copper coins, blue thread and firm opinions." },
    { id: "occ-galdr", group: "🍃 Folk & far traditions", label: "🎶 Galdr singer", hint: "The character is a galdr-singer — chanting rune-songs in the old Norse way, each verse tuned to weather, healing or very pointed revenge." },
    { id: "occ-boo", group: "🍃 Folk & far traditions", label: "🐎 Böö shaman", hint: "The character is a böö — a Mongolian shaman drumming between worlds in feathered headdress, treating soul-loss with milk tea and thunder." },
    { id: "occ-manbo", group: "🍃 Folk & far traditions", label: "🌺 Manbo servant of the lwa", hint: "The character is a manbo — a Vodou priestess serving the lwa with song, offerings and white-cloth care, counselled by spirits she honors daily." },
    { id: "occ-warlock", group: "📜 Pact-bound & bloodlines", label: "📜 Pact-bound warlock", hint: "The character is a pact-bound warlock — someone who signed with a patron power and pays the price on schedule, keeping the contract's exact wording close." },
    { id: "occ-demonblood", group: "📜 Pact-bound & bloodlines", label: "😈 Demon-blooded", hint: "The character is demon-blooded — infernal ancestry showing in small tells, managed with discipline and a strict set of personal rules." },
    { id: "occ-faetouched", group: "📜 Pact-bound & bloodlines", label: "🧚 Fae-touched", hint: "The character is fae-touched — marked by fairy contact and slightly sideways to mortal life, bound by bargains they half remember making." },
    { id: "occ-cursedline", group: "📜 Pact-bound & bloodlines", label: "🩸 Cursed bloodline", hint: "The character is the heir of a family curse that visits every generation — living around its rules while quietly looking for the loophole." },
    { id: "occ-vessel", group: "📜 Pact-bound & bloodlines", label: "👤 Possessed vessel", hint: "The character is a possessed vessel — a person sharing their skin with an entity, negotiating control day by day with rituals both sides respect." },
    { id: "occ-reincarnated", group: "📜 Pact-bound & bloodlines", label: "🔁 Reincarnated mage", hint: "The character is a reincarnated mage — a soul carrying a past life's training into a new body, with fragments of memory surfacing at inconvenient moments." },
    { id: "occ-angelblood", group: "📜 Pact-bound & bloodlines", label: "😇 Angel-blooded", hint: "The character is angel-blooded — a faint halo of the celestial in their veins, showing as unnatural calm and a total inability to lie." },
    { id: "occ-dhampir", group: "📜 Pact-bound & bloodlines", label: "🧛 Dhampir", hint: "The character is a dhampir — half-vampire and fully caught between, daylight-tolerant but never quite welcome at either table." },
    { id: "occ-wolfblood", group: "📜 Pact-bound & bloodlines", label: "🐺 Wolf-blooded", hint: "The character is wolf-blooded — running with the pack on moonlit nights and filing it all under family commitments." },
    { id: "occ-selkie", group: "📜 Pact-bound & bloodlines", label: "🦭 Selkie-kin", hint: "The character is selkie-kin — seal-folk blood that hears the sea calling, with a hidden skin somebody must never find." },
    { id: "occ-kitsune", group: "📜 Pact-bound & bloodlines", label: "🦊 Kitsune-kin", hint: "The character is kitsune-kin — fox-spirit ancestry in sly smiles and extra tails, earned the slow way, one century at a time." },
    { id: "occ-dragonblood", group: "📜 Pact-bound & bloodlines", label: "🐉 Dragon-blooded", hint: "The character is dragon-blooded — old fire sleeping under their ribs, generous with gifts and terrible at sharing." },
    { id: "occ-djinnbound", group: "📜 Pact-bound & bloodlines", label: "🪔 Djinn-bound", hint: "The character is djinn-bound — tied to a lamp-spirit by an old bargain, careful with wishes and warier still of the third one." },
    { id: "occ-crossroads", group: "📜 Pact-bound & bloodlines", label: "🛤️ Crossroads bargainer", hint: "The character is a crossroads bargainer — trading talent, love or revenge at midnight crossings, always reading the fine print twice." },
    { id: "occ-changeling", group: "📜 Pact-bound & bloodlines", label: "🍀 Changeling", hint: "The character is a changeling — fairy-raised and returned sideways, with manners from another court and a name that is not quite theirs." },
    { id: "occ-lich", group: "📜 Pact-bound & bloodlines", label: "📖 Lich-in-training", hint: "The character is a lich-in-training — a scholar trading warmth for centuries, keeping their future phylactery polished and their manners intact." },
    { id: "occ-golem", group: "📜 Pact-bound & bloodlines", label: "🗿 Golem-bound", hint: "The character is golem-bound — sharing a soul with a clay guardian that follows, protects and misunderstands idioms." },
    { id: "occ-starchild", group: "📜 Pact-bound & bloodlines", label: "🌠 Star-child", hint: "The character is a star-child — born under a falling star and luck-touched ever since, trailed by small impossible coincidences." },
    { id: "occ-gorgonblood", group: "📜 Pact-bound & bloodlines", label: "🐍 Gorgon-blooded", hint: "The character is gorgon-blooded — snakes for hair on bad days, a gaze that only mostly petrifies, and sunglasses in every coat." },
    { id: "occ-phoenixkin", group: "📜 Pact-bound & bloodlines", label: "🔥 Phoenix-kin", hint: "The character is phoenix-kin — dying loudly every few decades and returning damp, furious and newborn, with no patience for funerals." },
    { id: "occ-krakenmarked", group: "📜 Pact-bound & bloodlines", label: "🦑 Kraken-marked sailor", hint: "The character is a kraken-marked sailor — spared by the deep for a price paid in installments, tattoos shifting when storms come." },
    { id: "occ-shadowtrade", group: "📜 Pact-bound & bloodlines", label: "🌑 Shadow-trader", hint: "The character is a shadow-trader — someone who sold their shadow for seven years of luck and is counting down to the collection date." },
    { id: "occ-thorncourt", group: "📜 Pact-bound & bloodlines", label: "🌹 Thorn-court debtor", hint: "The character is a thorn-court debtor — owing the fair folk a favor they cannot refuse, polite to every mushroom ring just in case." },
    { id: "occ-inkbound", group: "📜 Pact-bound & bloodlines", label: "📖 Ink-bound scribe", hint: "The character is an ink-bound scribe — contracted to a story-spirit that dictates one true tale a night and punishes writer's block." },
    { id: "occ-unicorn", group: "📜 Pact-bound & bloodlines", label: "🦄 Unicorn-blessed", hint: "The character is unicorn-blessed — proven pure of heart exactly once and never allowed to forget it, followed by rainbows they did not ask for." },
    { id: "occ-psychic", group: "👁 Sensitives & mediums", label: "👁️ Psychic sensitive", hint: "The character is a psychic sensitive — someone who feels rooms, objects and people too strongly, managing the noise with grounding habits and firm boundaries." },
    { id: "occ-medium", group: "👁 Sensitives & mediums", label: "🕯️ Medium", hint: "The character is a medium — a sitter for the dead who holds séances with care for the living and the grieving, never as a party trick." },
    { id: "occ-dreamwalker", group: "👁 Sensitives & mediums", label: "💤 Dreamwalker", hint: "The character is a dreamwalker — a traveler who meets others in dreams and brings back warnings, keeping strict rules about what may be followed home." },
    { id: "occ-psychometrist", group: "👁 Sensitives & mediums", label: "✋ Psychometrist", hint: "The character is a psychometrist — a reader of objects who picks up echoes from what things have touched, gloves on unless it truly matters." },
    { id: "occ-aurareader", group: "👁 Sensitives & mediums", label: "🌈 Aura reader", hint: "The character is an aura reader — a seer of emotional weather who reads moods as colour and light, discreet about what they notice." },
    { id: "occ-clairvoy", group: "👁 Sensitives & mediums", label: "👀 Clairvoyant", hint: "The character is a clairvoyant — seeing distant rooms and near futures whether asked or not, curtains drawn against both." },
    { id: "occ-clairaud", group: "👁 Sensitives & mediums", label: "👂 Clairaudient", hint: "The character is a clairaudient — hearing voices from empty rooms and answering only the polite ones." },
    { id: "occ-ghostseer", group: "👁 Sensitives & mediums", label: "👻 Ghost-seer", hint: "The character is a ghost-seer — the dead wave at them in supermarkets, and they have learned which ones to wave back at." },
    { id: "occ-scryer", group: "👁 Sensitives & mediums", label: "🪞 Scryer", hint: "The character is a scryer — reading black glass and still water for clients, surfacing with answers and dripping sleeves." },
    { id: "occ-autowrite", group: "👁 Sensitives & mediums", label: "✒️ Automatic writer", hint: "The character is an automatic writer — their hand moves without them in séances, producing pages in handwriting that is not theirs." },
    { id: "occ-leyline", group: "👁 Sensitives & mediums", label: "📍 Ley-line dowser", hint: "The character is a ley-line dowser — walking the old straight tracks with rods, mapping where the land hums loudest." },
    { id: "occ-omen", group: "👁 Sensitives & mediums", label: "🪶 Omen reader", hint: "The character is an omen reader — taking news from bird-flight, weather and dropped spoons, rarely wrong and never believed in time." },
    { id: "occ-deathseer", group: "👁 Sensitives & mediums", label: "🦉 Death-omen seer", hint: "The character is a death-omen seer — befriended by banshees and ravens, bringing warnings nobody wants and comfort nobody expects." },
    { id: "occ-spiritphoto", group: "👁 Sensitives & mediums", label: "📷 Spirit photographer", hint: "The character is a spirit photographer — developing plates with extra faces in them, cataloguing each one like a family album." },
    { id: "occ-pastlife", group: "👁 Sensitives & mediums", label: "🪷 Past-life rememberer", hint: "The character is a past-life rememberer — carrying two centuries of déjà vu and apologizing to people they wronged in 1840." },
    { id: "occ-oracle", group: "👁 Sensitives & mediums", label: "🏛️ Oracle", hint: "The character is an oracle — god-spoken on holy days, vague the rest of the week, and tired of being asked about lottery numbers." },
    { id: "occ-empath", group: "👁 Sensitives & mediums", label: "💗 Empath", hint: "The character is an empath — feeling everyone else's emotions as weather systems and carrying an umbrella of boundaries." },
    { id: "occ-timeslip", group: "👁 Sensitives & mediums", label: "⏳ Time-slip witness", hint: "The character is a time-slip witness — slipping a decade sideways on stairwells and coming back with bus tickets from 1974." },
    { id: "occ-echolistener", group: "👁 Sensitives & mediums", label: "👂 Echo listener", hint: "The character is an echo listener — hearing a room's loudest argument on loop, and redecorating to give the walls nicer memories." },
    { id: "occ-liesmell", group: "👁 Sensitives & mediums", label: "👃 Lie-smeller", hint: "The character is a lie-smeller — catching falsehoods by scent, useless at poker nights and ruthless at family dinners." },
    { id: "occ-dreaminterp", group: "👁 Sensitives & mediums", label: "📖 Dream interpreter", hint: "The character is a dream interpreter — decoding other people's nights from a battered symbol dictionary, right just often enough to be feared." },
    { id: "occ-psychlock", group: "👁 Sensitives & mediums", label: "🗝️ Psychic locksmith", hint: "The character is a psychic locksmith — opening the mental doors trauma locked, with consent forms, tea and a strict one-door-per-visit rule." },
    { id: "occ-stormfeel", group: "👁 Sensitives & mediums", label: "🌩️ Storm-feeler", hint: "The character is a storm-feeler — aching in the joints a day before every tempest, the human barometer every village sailor consults." },
    { id: "occ-hospice", group: "👁 Sensitives & mediums", label: "🕯️ Hospice watcher", hint: "The character is a hospice watcher — a night nurse who always knows which patient needs company, sitting vigil so nobody crosses alone." },
    { id: "occ-detective", group: "🛡️ Hunters & wardens", label: "🕵️ Occult detective", hint: "The character is an occult detective — an investigator of impossible cases who documents hauntings, frauds and the genuine article with equal rigour." },
    { id: "occ-monsterhunter", group: "🛡️ Hunters & wardens", label: "⚔️ Monster hunter", hint: "The character is a monster hunter — a professional tracker of things that bite, carrying salt, silver and paperwork in equal measure." },
    { id: "occ-witchhunter", group: "🛡️ Hunters & wardens", label: "🏹 Witch hunter", hint: "The character is a witch hunter — a hunter of rogue practitioners, bound by evidence and a personal code about who deserves mercy." },
    { id: "occ-warden", group: "🛡️ Hunters & wardens", label: "🛡️ Ward-keeper", hint: "The character is a ward-keeper — a guardian who lays salt lines, iron and true names around homes and churchyards, maintaining protections others never notice." },
    { id: "occ-relickeeper", group: "🛡️ Hunters & wardens", label: "🗝️ Relic keeper", hint: "The character is a relic keeper — a custodian of enchanted objects who catalogues what each one does, what it demands, and which shelf must never be opened." },
    { id: "occ-exorcist", group: "🛡️ Hunters & wardens", label: "🔔 Exorcist", hint: "The character is an exorcist — a trained expeller of hostile presences, working by rite, consent and aftercare rather than spectacle." },
    { id: "occ-hexbreaker", group: "🛡️ Hunters & wardens", label: "⛓️ Hex-breaker", hint: "The character is a hex-breaker — a professional curse-eater who takes other people's bad luck into themself and sweats it out by dawn." },
    { id: "occ-graveyard", group: "🛡️ Hunters & wardens", label: "🪦 Graveyard keeper", hint: "The character is a graveyard keeper — tending stones, names and residents, on first-name terms with several ghosts and firm with the rest." },
    { id: "occ-cryptid", group: "🛡️ Hunters & wardens", label: "🐾 Cryptid tracker", hint: "The character is a cryptid tracker — following treeline prints with cameras and plaster, half scientist and half believer." },
    { id: "occ-vamphunter", group: "🛡️ Hunters & wardens", label: "🧄 Vampire hunter", hint: "The character is a vampire hunter — garlic, stakes and eviction notices, serving the undead with paperwork before anything sharper." },
    { id: "occ-demonologist", group: "🛡️ Hunters & wardens", label: "🎓 Demonologist", hint: "The character is a demonologist — a scholar of infernal names and hierarchies who binds nothing and catalogues everything." },
    { id: "occ-archivist", group: "🛡️ Hunters & wardens", label: "🗄️ Containment archivist", hint: "The character is a containment archivist — shelving sealed things with a number for each, in a basement that hums after hours." },
    { id: "occ-cleanser", group: "🛡️ Hunters & wardens", label: "🧹 Haunted-house cleanser", hint: "The character is a haunted-house cleanser — smoke, salt and stern conversation, leaving homes quieter than she found them." },
    { id: "occ-boundary", group: "🛡️ Hunters & wardens", label: "🚧 Boundary walker", hint: "The character is a boundary walker — patrolling parish bounds and mending the veil's fences where the wild presses through." },
    { id: "occ-lantern", group: "🛡️ Hunters & wardens", label: "🏮 Lantern-bearer", hint: "The character is a lantern-bearer — guiding lost spirits on with a paper light, kind to the confused and brisk with the stubborn." },
    { id: "occ-oathkeeper", group: "🛡️ Hunters & wardens", label: "🤝 Oath-keeper", hint: "The character is an oath-keeper — a neutral witness to supernatural contracts, enforcing the letter against both sides." },
    { id: "occ-nightwatch", group: "🛡️ Hunters & wardens", label: "🌃 Night-watch volunteer", hint: "The character is a night-watch volunteer — a mundane with a silver whistle walking the haunted streets so nobody walks them alone." },
    { id: "occ-innkeep", group: "🛡️ Hunters & wardens", label: "🏨 Crossroads innkeeper", hint: "The character is a crossroads innkeeper — holding neutral ground where fae, hunters and hexes all pay full price and behave." },
    { id: "occ-faeriering", group: "🛡️ Hunters & wardens", label: "🍄 Faerie-ring guard", hint: "The character is a faerie-ring guard — roping off mushroom circles with iron stakes and stern signage, rescuing dancers who stepped in." },
    { id: "occ-cursedappraise", group: "🛡️ Hunters & wardens", label: "🔍 Cursed-object appraiser", hint: "The character is a cursed-object appraiser — pricing estate-sale horrors by malice and market, gloves on, loupe out, refund policy ironclad." },
    { id: "occ-monsternegot", group: "🛡️ Hunters & wardens", label: "🤝 Monster negotiator", hint: "The character is a monster negotiator — settling territory disputes between things with teeth, fluent in growl, hiss and binding handshake." },
    { id: "occ-dreampatrol", group: "🛡️ Hunters & wardens", label: "🌙 Dream-patrol officer", hint: "The character is a dream-patrol officer — walking the shared doze to wake sleepers before the nightmares bite, whistle and lantern in hand." },
    { id: "occ-relicsniff", group: "🛡️ Hunters & wardens", label: "🐽 Relic-forgery sniffer", hint: "The character is a relic-forgery sniffer — spotting fake holy swords by smell, auction-house enemy number one." },
    { id: "occ-possesslaw", group: "🛡️ Hunters & wardens", label: "⚖️ Possession-case lawyer", hint: "The character is a possession-case lawyer — filing injunctions against demons, billing hourly, possessed only by paperwork." },
    { id: "occ-hellmouth", group: "🛡️ Hunters & wardens", label: "🕳️ Hellmouth custodian", hint: "The character is a hellmouth custodian — mopping the high-school basement portal nightly, lost-and-found full of single shoes." },
    { id: "occ-vampire", group: "🧛 Classic creatures", label: "⚰️ Vampire", hint: "The character is a vampire — old, courteous and nocturnal, particular about invitations and never once seen at breakfast." },
    { id: "occ-werewolf", group: "🧛 Classic creatures", label: "🌝 Werewolf", hint: "The character is a werewolf — human most of the month and gloriously lupine at the full moon, keeping a strict calendar and sturdier doors." },
    { id: "occ-mermaid", group: "🧛 Classic creatures", label: "🧜 Mermaid", hint: "The character is a mermaid — at home below the waves and awkward above them, trading songs, salvage and strong opinions about sailors." },
    { id: "occ-fairy", group: "🧛 Classic creatures", label: "🦋 Fairy", hint: "The character is a fairy — small, bright and bound by old rules of hospitality, gift-debt and never quite answering straight." },
    { id: "occ-wizard", group: "🧛 Classic creatures", label: "🧙 Wizard", hint: "The character is a wizard — a tower-trained scholar of spells with strong views on staff length, tower tidiness and apprentices." },
    { id: "occ-sorcerer", group: "🧛 Classic creatures", label: "🔥 Sorcerer", hint: "The character is a sorcerer — magic in the blood rather than the books, powerful, impulsive and still learning the off switch." },
    { id: "occ-necromancer", group: "🧛 Classic creatures", label: "💀 Necromancer", hint: "The character is a necromancer — a scholar of the grave who consults the dead politely and puts every spirit back where it was found." },
    { id: "occ-ghost", group: "🧛 Classic creatures", label: "🌫️ Lingering ghost", hint: "The character is a lingering ghost — tied to one place by unfinished business, rattling softly and learning how to be noticed." },
    { id: "occ-poltergeist", group: "🧛 Classic creatures", label: "🔊 Poltergeist", hint: "The character is a poltergeist — a noisy, mischievous spirit rearranging furniture and opinions, never malicious and rarely quiet." },
    { id: "occ-wraith", group: "🧛 Classic creatures", label: "😱 Vengeful wraith", hint: "The character is a vengeful wraith — a wronged spirit burning cold with grievance, terrible to the guilty and gentle with everyone else." },
    { id: "occ-ancestor", group: "🧛 Classic creatures", label: "🕊️ Ancestor guardian", hint: "The character is an ancestor guardian — a family spirit watching over their descendants, rattling approval and warding doorways." },
    { id: "occ-slime", group: "🧛 Classic creatures", label: "💧 Slime person", hint: "The character is a slime person — an amiable ooze holding a humanoid shape by habit and hospitality, squelching cheerfully through life." },
    { id: "occ-dryad", group: "🧛 Classic creatures", label: "🍂 Dryad", hint: "The character is a dryad — a tree-bound spirit who wears leaves, keeps the grove's gossip and naps through winters." },
    { id: "occ-harpy", group: "🧛 Classic creatures", label: "🦅 Harpy", hint: "The character is a harpy — sharp-eyed and sharp-tongued with wings like weather, nesting high and judging everyone below." },
    { id: "occ-centaur", group: "🧛 Classic creatures", label: "🐴 Centaur", hint: "The character is a centaur — half scholar, half stampede, equally at home in libraries and at full gallop." },
    { id: "occ-sphinx", group: "🧛 Classic creatures", label: "🦁 Sphinx", hint: "The character is a sphinx — a riddling guardian of thresholds who collects travelers' answers and never repeats a question twice." },
    { id: "occ-revenant", group: "🧛 Classic creatures", label: "🧟 Revenant", hint: "The character is a revenant — returned from death with one purpose intact, patient, courteous and impossible to deter." },
    { id: "occ-banshee", group: "🧛 Classic creatures", label: "🎵 Banshee", hint: "The character is a banshee — a keening herald whose song foretells endings, mournful rather than cruel, and fond of quiet company." },
    { id: "occ-skinchanger", group: "🧛 Classic creatures", label: "🦎 Skinchanger", hint: "The character is a skinchanger — wearing borrowed shapes the way others wear coats, careful to return each one in good condition." },
    { id: "occ-mummy", group: "🧛 Classic creatures", label: "🏺 Mummy", hint: "The character is a mummy — an awakened preserved royal, formal, gilded and deeply unimpressed with modern security." },
    { id: "occ-satyr", group: "🧛 Classic creatures", label: "🐐 Satyr", hint: "The character is a satyr — pipes, wine and chasing nymphs through every festival, banned from three vineyards and welcome at all of them." },
    { id: "occ-nymph", group: "🧛 Classic creatures", label: "🌸 Nymph", hint: "The character is a nymph — a spirit of one grove, stream or meadow, playful with travelers and fierce as weather when it is threatened." },
    { id: "occ-kelpie", group: "🧛 Classic creatures", label: "🌊 Kelpie", hint: "The character is a kelpie — a shape-shifting water horse offering rides that end mid-lake, bridle-shy and barn-proud." },
    { id: "occ-minotaur", group: "🧛 Classic creatures", label: "🐂 Minotaur", hint: "The character is a minotaur — a labyrinth-born gentle giant with a poet's heart, excellent at mazes and terrible at small talk." },
    { id: "occ-gnome", group: "🧛 Classic creatures", label: "🍄 Gnome", hint: "The character is a gnome — a burrowing tinkerer of gears and gardens, grumbling at tall folk and hoarding interesting buttons." },
    { id: "occ-stonegargoyle", group: "🧛 Classic creatures", label: "🗿 Gargoyle", hint: "The character is a gargoyle — a stone sentinel by day and rooftop prowler by night, gargling rainwater and judging pigeons." },
    { id: "occ-phoenixpyre", group: "🧛 Classic creatures", label: "🔥 Phoenix", hint: "The character is a phoenix — glorious, combusting and reborn on schedule, leaving scorched nests and awestruck witnesses." },
    { id: "occ-jp-miko", group: "🎌 Japanese occult", label: "🎐 Shrine maiden", hint: "The character is a shrine maiden — a kagura dancer who sweeps the steps at dawn, sells fortunes at noon and closes the shrine shutters politely but firmly." },
    { id: "occ-jp-kannushi", group: "🎌 Japanese occult", label: "🏯 Kannushi priest", hint: "The character is a kannushi — a shrine priest who blesses weddings, waves the purification wand over new cars and knows every god on the mountain by name." },
    { id: "occ-jp-yamabushi", group: "🎌 Japanese occult", label: "⛰️ Yamabushi ascetic", hint: "The character is a yamabushi — a mountain ascetic who trains under waterfalls, blows the conch at sunrise and walks ridgelines other people only photograph." },
    { id: "occ-jp-itako", group: "🎌 Japanese occult", label: "📿 Itako medium", hint: "The character is an itako — a blind medium who lends her voice to ancestors at the summer festival, delivering their messages gently and their scoldings verbatim." },
    { id: "occ-jp-tanuki", group: "🎌 Japanese occult", label: "🦡 Tanuki-kin", hint: "The character is tanuki-kin — a jolly shapeshifter with a leaf on their head and sake on their mind, drumming their belly when a prank lands perfectly." },
    { id: "occ-jp-tengu", group: "🎌 Japanese occult", label: "👺 Tengu-kin", hint: "The character is tengu-kin — a long-nosed mountain goblin's heir, strict about training, rude about weakness and secretly soft toward earnest students." },
    { id: "occ-jp-kappa", group: "🎌 Japanese occult", label: "🥒 Kappa-kin", hint: "The character is kappa-kin — a river imp's kin who loves cucumbers, sumo and strict politeness, bowing deep enough that the river never takes them." },
    { id: "occ-jp-yuki", group: "🎌 Japanese occult", label: "🌨️ Yuki-onna-kin", hint: "The character is yuki-onna-kin — a snow woman's daughter, beautiful as first frost and kind in a distant way, who always knows when it is about to snow." },
    { id: "occ-jp-tsukumo", group: "🎌 Japanese occult", label: "☂️ Tsukumogami-bound", hint: "The character is tsukumogami-bound — partnered with a century-old umbrella spirit that hovers, grumbles and refuses to let anyone get wet." },
    { id: "occ-jp-rokuro", group: "🎌 Japanese occult", label: "🦒 Rokurokubi", hint: "The character is a rokurokubi — a long-necked woman whose neck stretches to peer over fences and rooftops, nosy by nature and apologetic about it." },
    { id: "occ-jp-inugami", group: "🎌 Japanese occult", label: "🐕 Inugami handler", hint: "The character is an inugami handler — a keeper of loyal dog-spirits who guard the house, find the lost and bark at things the living cannot see." },
    { id: "occ-jp-shikigami", group: "🎌 Japanese occult", label: "🎎 Shikigami master", hint: "The character is a shikigami master — folding paper dolls that hop to life as messengers and errand-runners, each one returned to paper by bedtime." },
    { id: "occ-jp-ofuda", group: "🎌 Japanese occult", label: "🧾 Ofuda priest", hint: "The character is an ofuda priest — writing talisman slips that seal lintels and lockers, restocking every shrine gate in the district before New Year." },
    { id: "occ-jp-kegare", group: "🎌 Japanese occult", label: "🧂 Kegare cleanser", hint: "The character is a kegare cleanser — purifying houses after funerals with salt, sake and brisk common sense, leaving every room lighter than she found it." },
    { id: "occ-jp-torii", group: "🎌 Japanese occult", label: "🚪 Torii warden", hint: "The character is a torii warden — guarding the gate between the ordinary street and the sacred slope, reminding every visitor to bow once on the way through." },
    { id: "occ-jp-matsuri", group: "🎌 Japanese occult", label: "🎆 Matsuri dancer", hint: "The character is a matsuri dancer — carrying the portable shrine through summer streets, shouting, sweating and grinning through the whole festival route." },
    { id: "occ-jp-kaidan", group: "🎌 Japanese occult", label: "📚 Kaidan storyteller", hint: "The character is a kaidan storyteller — hosting the hundred-tales game with one candle per story, saving the scariest one for last and never quite finishing it." },
    { id: "occ-jp-zashiki", group: "🎌 Japanese occult", label: "🧒 Zashiki-warashi host", hint: "The character is a zashiki-warashi host — lodging a playful child-spirit whose laughter brings the inn good fortune and whose sulking empties it." },
    { id: "occ-jp-jizo", group: "🎌 Japanese occult", label: "🧶 Jizō keeper", hint: "The character is a Jizō keeper — knitting red bibs for roadside stone statues and leaving sweets for the guardian of lost travelers." },
    { id: "occ-jp-foxmsg", group: "🎌 Japanese occult", label: "🍶 Fox messenger of Inari", hint: "The character is a fox messenger of Inari — running wishes between rice fields and shrines with tofu treats in their pocket and mud on their white socks." },
    { id: "occ-jp-nekomata", group: "🎌 Japanese occult", label: "🐈 Nekomata-kin", hint: "The character is nekomata-kin — a fork-tailed cat's kin who dances at night, talks to lanterns and naps through every exorcism aimed at them." },
    { id: "occ-jp-jorogumo", group: "🎌 Japanese occult", label: "🕷️ Jorōgumo-kin", hint: "The character is jorōgumo-kin — a binding-bride spider's kin, beautiful, patient and four hundred years into a very long courtship." },
    { id: "occ-jp-onikin", group: "🎌 Japanese occult", label: "👹 Oni-kin bouncer", hint: "The character is oni-kin — a club bouncer with iron skin and a heart of festival drums, bouncing troublemakers gently onto the street." },
    { id: "occ-jp-komainu", group: "🎌 Japanese occult", label: "🦁 Komainu warden", hint: "The character is a komainu warden — a lion-dog statue come down to patrol the shrine steps, barking once at evil and napping the rest." },
    { id: "occ-jp-yurei", group: "🎌 Japanese occult", label: "👘 Yūrei bride", hint: "The character is a yūrei bride — a white-kimono ghost waiting at the shrine for vows interrupted centuries ago, patient as falling snow." },
    { id: "occ-jp-amanojaku", group: "🎌 Japanese occult", label: "😈 Amanojaku-kin", hint: "The character is amanojaku-kin — a contrarian imp's kin who must oppose everything said, exhausting at meetings and unbeatable at debate club." },
    { id: "occ-jp-mizuchi", group: "🎌 Japanese occult", label: "🐉 Mizuchi-kin", hint: "The character is mizuchi-kin — a river dragon's kin who floods rice fields on schedule and drowns only rude samurai." },
    { id: "occ-jp-nurikabe", group: "🎌 Japanese occult", label: "🧱 Nurikabe caretaker", hint: "The character is a nurikabe caretaker — befriending the invisible wall-yokai that blocks hallways, posting polite detour signs for it." },
    { id: "occ-na-skinwalker", group: "🪶 Native American lore", label: "🌑 Skinwalker", hint: "The character is a skinwalker — a shapeshifting witch of Diné lore, spoken of only in lowered voices, who wears coyote skin and other shapes to walk unseen between hogans." },
    { id: "occ-na-wendigo", group: "🪶 Native American lore", label: "🥶 Wendigo", hint: "The character is a wendigo — a gaunt winter-hunger spirit of Algonquian lore stalking the snowbound woods, forever starving no matter how much the long winter feeds it." },
    { id: "occ-na-thunderbird", group: "🪶 Native American lore", label: "⛈️ Thunderbird-kin", hint: "The character is thunderbird-kin — descended from the great storm bird whose wingbeats are thunder, arriving with summer rain and leaving lightning-struck trees behind." },
    { id: "occ-na-coyote", group: "🪶 Native American lore", label: "🏜️ Coyote trickster-kin", hint: "The character is coyote trickster-kin — a desert joker who teaches through embarrassment, stealing lunches and dignity with equal delight, and always the butt of their own best joke." },
    { id: "occ-na-raven", group: "🪶 Native American lore", label: "🐦‍⬛ Raven storyteller", hint: "The character is a raven storyteller — a sleek black keeper of Pacific Northwest tales who stole daylight itself once and has been bragging about it at every fireside since." },
    { id: "occ-na-waterpanther", group: "🪶 Native American lore", label: "🐆 Water-panther-bound", hint: "The character is water-panther-bound — watched over by Mishipeshu, the copper-horned underwater cat of the Great Lakes, and careful to leave tobacco where the water runs deep." },
    { id: "occ-na-pukwudgie", group: "🪶 Native American lore", label: "🧌 Pukwudgie", hint: "The character is a pukwudgie — a knee-high forest trickster of Wabanaki lore who lures travelers off trails with lights, then laughs hardest when they laugh too." },
    { id: "occ-na-deerwoman", group: "🪶 Native American lore", label: "🦌 Deer Woman", hint: "The character is Deer Woman — a hoofed prairie spirit of Plains lore, beautiful and watchful, who appears to those who disrespect women and leaves them with a warning they never forget." },
    { id: "occ-na-kokopelli", group: "🪶 Native American lore", label: "🎶 Kokopelli's piper", hint: "The character is one of Kokopelli's pipers — a wandering humpbacked flute-player of the mesas whose songs bring spring planting, dancing and mischief in equal measure." },
    { id: "occ-na-dreamcatcher", group: "🪶 Native American lore", label: "🕸️ Dreamcatcher weaver", hint: "The character is a dreamcatcher weaver — knotting willow hoops and sinew webs in the Ojibwe tradition to catch bad dreams before they reach sleeping children." },
    { id: "occ-na-totem", group: "🪶 Native American lore", label: "🪵 Totem carver", hint: "The character is a totem carver — raising cedar clan crests of raven, bear and frog in the Pacific Northwest way, each figure a family history that must be read bottom to top." },
    { id: "occ-na-storykeeper", group: "🪶 Native American lore", label: "🏕️ Fireside storykeeper", hint: "The character is a fireside storykeeper — a tribal elder's apprentice who carries the old tales word-perfect and knows exactly which story each listener needs to hear." },
    { id: "occ-na-rabbit", group: "🪶 Native American lore", label: "🐇 Rabbit trickster-kin", hint: "The character is rabbit trickster-kin — a long-eared joker of Southeastern tales, outwitting wolves and bears and tripping over their own ears." },
    { id: "occ-na-spidergrand", group: "🪶 Native American lore", label: "🕷️ Spider Grandmother's weaver", hint: "The character is one of Spider Grandmother's weavers — taught pottery, weaving and patience by the wise grandmother of Pueblo lore, spinning only what the people need." },
    { id: "occ-na-salmon", group: "🪶 Native American lore", label: "🐟 Salmon-keeper", hint: "The character is a salmon-keeper — honoring the first catch of the Pacific Northwest runs and returning the bones to the water so the fish return too." },
    { id: "occ-na-bearmed", group: "🪶 Native American lore", label: "🐻 Bear-medicine walker", hint: "The character is a bear-medicine walker — carrying strong healing learned from bear dreams, gentle-handed and not to be wrestled." },
    { id: "occ-na-cornmother", group: "🪶 Native American lore", label: "🌽 Corn-mother gardener", hint: "The character is a corn-mother gardener — planting the three sisters in the old way and thanking Corn Mother at every harvest." },
    { id: "occ-na-starquilt", group: "🪶 Native American lore", label: "⭐ Star-quilt maker", hint: "The character is a star-quilt maker — sewing Lakota morning-star quilts for newborns and graduates, each point a prayer folded into cloth." },
    { id: "occ-na-storydrum", group: "🪶 Native American lore", label: "🥁 Story-drum keeper", hint: "The character is a story-drum keeper — tending the big powwow drum, its heartbeat carrying every dance, and knowing exactly when to let it rest." },
    { id: "occ-an-magicalgirl", group: "📺 Anime occult", label: "🎀 Contract magical girl", hint: "The character is a contract magical girl — granted a transformation trinket by a cute mascot with suspicious terms and conditions, fighting weekly monsters between homework assignments." },
    { id: "occ-an-stand", group: "📺 Anime occult", label: "👊 Stand user", hint: "The character is a stand user — manifesting a punchy invisible spirit guardian only fellow users can see, named after their favorite band and itching for a pose-off." },
    { id: "occ-an-cursedenergy", group: "📺 Anime occult", label: "🕶️ Cursed-energy sorcerer", hint: "The character is a cursed-energy sorcerer — a blindfolded jujutsu student exorcising rot-born curses with bare hands and classroom rivalries, assigned the haunted school every single time." },
    { id: "occ-an-alchemist", group: "📺 Anime occult", label: "🔄 Circle alchemist", hint: "The character is a circle alchemist — transmuting matter through chalk rings under the iron law of equivalent exchange, still paying off the one time they tried to cheat it." },
    { id: "occ-an-ninja", group: "📺 Anime occult", label: "🍥 Chakra ninja", hint: "The character is a chakra ninja — a headband-wearing dropout who shouts their dreams, spams shadow clones and somehow befriends every villain sent to kill them." },
    { id: "occ-an-soulreaper", group: "📺 Anime occult", label: "🗡️ Soul-reaper substitute", hint: "The character is a soul-reaper substitute — an ordinary teen handed an oversized sword and a reaping route, escorting lost spirits while arguing with the cranky ghost living in their closet." },
    { id: "occ-an-slayer", group: "📺 Anime occult", label: "💨 Breathing-style slayer", hint: "The character is a breathing-style slayer — a corps swordsman slashing grief-born demons with total-concentration breathing, carrying a boxed loved one on their back into every battle." },
    { id: "occ-an-cardcaptor", group: "📺 Anime occult", label: "🎴 Sealed-card mistress", hint: "The character is a sealed-card mistress — recapturing escaped living spell-cards with a bird-headed wand, a best friend filming everything and a bottomless costume closet." },
    { id: "occ-an-tamer", group: "📺 Anime occult", label: "🧢 Pocket-monster tamer", hint: "The character is a pocket-monster tamer — a cap-wearing kid crossing regions to befriend sparking, splashing and vine-whipping partners, losing every league but winning every friendship." },
    { id: "occ-an-yokaiwatch", group: "📺 Anime occult", label: "⌚ Yokai-watch befriender", hint: "The character is a yokai-watch befriender — a kid who can see prankster spirits through a special watch, trading snacks for favors and mediating ghost arguments daily." },
    { id: "occ-an-bathhouse", group: "📺 Anime occult", label: "🧼 Spirit-bath attendant", hint: "The character is a spirit-bath attendant — scrubbing river gods and radish spirits in a bathhouse for eight million gods, working off a name they can barely remember." },
    { id: "occ-an-forestfriend", group: "📺 Anime occult", label: "🍃 Forest-king befriender", hint: "The character is a forest-king befriender — waiting at rainy bus stops with a borrowed umbrella for a giant grey guardian who answers only in rumbling roars." },
    { id: "occ-an-cursedarm", group: "📺 Anime occult", label: "🐗 Cursed-arm wanderer", hint: "The character is a cursed-arm wanderer — marked by a dying boar-god's hatred, seeking the forest spirit's cure while the mark whispers crueler solutions every night." },
    { id: "occ-an-velvet", group: "📺 Anime occult", label: "🛏️ Velvet-room contractor", hint: "The character is a velvet-room contractor — signing dream-contracts in a blue-velvet room between realities, fusing borrowed hearts into new masks for the next heist of a corrupt adult's desire." },
    { id: "occ-an-grimoire", group: "📺 Anime occult", label: "📗 Five-leaf grimoire mage", hint: "The character is a five-leaf grimoire mage — a magicless underdog chosen by a devil-marked book of anti-magic swords, out-shouting every prodigy through sheer refusal to stay down." },
    { id: "occ-an-quirk", group: "📺 Anime occult", label: "💥 Quirk-born hero student", hint: "The character is a quirk-born hero student — training an explosive personality and an actual explosion quirk at hero school, screaming their heroic name before every reckless rescue." },
    { id: "occ-an-biomecha", group: "📺 Anime occult", label: "🤖 Bio-mecha synchronizer", hint: "The character is a bio-mecha synchronizer — a reluctant teen syncing nerves with a giant soul-bearing war machine, apologizing to the city before every launch." },
    { id: "occ-an-cyberghost", group: "📺 Anime occult", label: "💻 Cyber-ghost diver", hint: "The character is a cyber-ghost diver — a cyberized detective diving digitized minds and memory-hacks, unsure where her original flesh ends and the network begins." },
    { id: "occ-an-looper", group: "📺 Anime occult", label: "⏳ Return-by-death looper", hint: "The character is a return-by-death looper — dying and rewinding to a checkpoint nobody else remembers, hoarding doomed timelines like scars and refusing to spend another one." },
    { id: "occ-an-deathnote", group: "📺 Anime occult", label: "📓 Cursed-notebook keeper", hint: "The character is a cursed-notebook keeper — holding a shinigami's dropped kill-book and its forty-second rule, shadowed by a cackling death-god addicted to apples and bad ideas." },
    { id: "occ-an-mecha", group: "📺 Anime occult", label: "🚀 Hot-blooded mecha pilot", hint: "The character is a hot-blooded super-robot pilot — shouting every attack name, taking every rival personally and crying exactly once per finale." },
    { id: "occ-an-fleet", group: "📺 Anime occult", label: "⚓ Fleet-maiden", hint: "The character is a fleet-maiden — a warship's spirit given a girl's shape, polishing her rigging each dawn and saluting smartly before every sortie." },
    { id: "occ-an-streamer", group: "📺 Anime occult", label: "📹 Ghost-possessed streamer", hint: "The character is a ghost-possessed streamer — running a late-night channel that spikes whenever the resident spirit hijacks the mic to gossip about the afterlife." },
    { id: "occ-an-gambler", group: "📺 Anime occult", label: "🀄 Underground gamble survivor", hint: "The character is an underground gamble survivor — reading tiles and tells like scripture, betting fortunes and once a whole yacht on a single tile." },
    { id: "occ-an-phantom", group: "📺 Anime occult", label: "🏀 Phantom sixth player", hint: "The character is a phantom sixth player — nearly invisible on court, redirecting passes with a misdirection that borders on actual vanishing." },
    { id: "occ-an-chef", group: "📺 Anime occult", label: "🍳 God-tongue chef", hint: "The character is a god-tongue chef — staging illegal midnight cook-offs in school kitchens, whose tastings leave judges speechless, flushed and dramatically disheveled." },
    { id: "occ-an-butler", group: "📺 Anime occult", label: "🍽️ Hell-butler", hint: "The character is a hell-butler — a demon manservant flawless at everything from assassination to soufflé, serving one demanding young master for the eventual price of their soul." },
    { id: "occ-an-detective", group: "📺 Anime occult", label: "🔍 Shrunken teen detective", hint: "The character is a shrunken teen detective — a great sleuth trapped in a child's body, tranquilizing a baffled uncle to solve every locked room." },
    { id: "occ-an-thief", group: "📺 Anime occult", label: "🎩 Moonlight phantom thief", hint: "The character is a moonlight phantom thief — announcing each heist on a postcard, returning every gem by dawn and bowing politely to the detectives chasing him." },
    { id: "occ-an-zombieidol", group: "📺 Anime occult", label: "🎧 Legendary zombie idol", hint: "The character is a legendary zombie idol — a decaying regional idol resurrected to save her prefecture, held together by stage glue, spite and choreography." },
    { id: "occ-an-vending", group: "📺 Anime occult", label: "🥤 Reincarnated vending machine", hint: "The character is a reincarnated vending machine — reborn in a dungeon as a humming drink vendor, dispensing sodas and barrier magic to grateful adventurers." },
    { id: "occ-an-statushero", group: "📺 Anime occult", label: "📊 Status-screen hero", hint: "The character is a status-screen hero — a summoned teen grinding visible stat windows and skill trees, min-maxing their way through a demon army." },
    { id: "occ-an-demonking", group: "📺 Anime occult", label: "🍔 Part-time demon king", hint: "The character is a part-time demon king — a defeated dark lord flipping burgers to fund his comeback, budgeting hellfire between lunch rushes." },
    { id: "occ-an-esper", group: "📺 Anime occult", label: "🥄 Repressed esper teen", hint: "The character is a repressed esper teen — bottling emotions until they detonate into psychic storms, exorcising evil spirits between cram-school classes." },
    { id: "occ-an-sealedarm", group: "📺 Anime occult", label: "🤕 Sealed-arm teen", hint: "The character is a sealed-arm teen — convinced a dragon sleeps in their bandaged right arm, striking poses that embarrass everyone except the one believer." },
    { id: "occ-an-timeleap", group: "📺 Anime occult", label: "🍌 Microwave time-leaper", hint: "The character is a microwave time-leaper — texting the past through a jury-rigged microwave, unravelling timelines one banana-gelled experiment at a time." },
    { id: "occ-an-pirate", group: "📺 Anime occult", label: "🏴‍☠️ Rubber-bodied pirate captain", hint: "The character is a rubber-bodied pirate captain — stretching toward the grand treasure with a straw hat, an endless appetite and a crew of glorious weirdos." },
    { id: "occ-an-apewarrior", group: "📺 Anime occult", label: "🌖 Full-moon ape warrior", hint: "The character is a full-moon ape warrior — a monkey-tailed fighter who gazes at the moon and wakes up giant, craterous and apologetic." },
    { id: "occ-an-telepath", group: "📺 Anime occult", label: "🥜 Mind-reading adoptee", hint: "The character is a mind-reading adoptee — a pink-haired foundling who hears every thought and keeps every secret, chasing a world where her borrowed family stays together." },
    { id: "occ-an-teacher", group: "📺 Anime occult", label: "🐙 Un-killable mach-20 teacher", hint: "The character is an un-killable mach-20 teacher — a grinning tentacled moon-buster tutoring a classroom of junior assassins while grading their attempts." },
    { id: "occ-an-drifter", group: "📺 Anime occult", label: "🚗 Tofu-delivery drifter", hint: "The character is a tofu-delivery drifter — a gas-station kid out-drifting champions nightly in dad's old hatchback, with a water cup that never spills." },
    { id: "occ-an-kingofgames", group: "📺 Anime occult", label: "👑 King-of-games vessel", hint: "The character is a king-of-games vessel — a gentle teen sharing a body with a three-thousand-year-old gambling pharaoh who never bluffs kindly." },
    { id: "occ-an-springcursed", group: "📺 Anime occult", label: "♨️ Spring-cursed martial artist", hint: "The character is a spring-cursed martial artist — splashed cold they swap bodies, splashed hot they swap back, pursued across towns by fiancées and a jealous panda father." },
    { id: "occ-an-samurai", group: "📺 Anime occult", label: "🍓 Deadline-dodging samurai", hint: "The character is a deadline-dodging odd-jobs samurai — a perm-headed freelancer taking any gig for rent money, lecturing shogunate aliens about bushido between jobs." },
    { id: "occ-an-hero", group: "📺 Anime occult", label: "🦸 Weekend-sale superhero", hint: "The character is a weekend-sale superhero — an invincible nobody who ends every fight in one punch and now shops discount eggs, bored out of his invulnerable mind." },
    { id: "occ-an-hunterexam", group: "📺 Anime occult", label: "🎣 License-chasing hunter brat", hint: "The character is a license-chasing hunter brat — a fishing-rod kid tackling a lethal hunter exam to find one deadbeat dad, befriending killers and clowns along the way." },
    { id: "occ-an-fireslayer", group: "📺 Anime occult", label: "🐲 Fire-eating dragon slayer", hint: "The character is a fire-eating dragon slayer — a scarf-wearing guild mage who eats flames to power up, demolishing every town he saves and crying over every comrade." },
    { id: "occ-an-spiritdet", group: "📺 Anime occult", label: "👿 Delinquent spirit detective", hint: "The character is a delinquent spirit detective — a punk teen shot, revived and drafted as the underworld's detective, solving ghost cases between detentions." },
    { id: "occ-an-bartender", group: "📺 Anime occult", label: "🧉 Afterlife bar arbiter", hint: "The character is an afterlife bar arbiter — a white-haired bartender judging paired souls with memory-billiards, pouring the living onward and the void-bound away." },
    { id: "occ-an-mushi", group: "📺 Anime occult", label: "🍄 Wandering mushi master", hint: "The character is a wandering mushi master — a white-haired doctor treating ailments caused by primordial life-forms, smoking through villages that forget him by morning." },
    { id: "occ-an-namereturn", group: "📺 Anime occult", label: "📒 Book-of-friends inheritor", hint: "The character is a book-of-friends inheritor — a lonely teen returning stolen spirit-names from grandma's book, trailed by a fat lucky-cat bodyguard with an ancient appetite." },
    { id: "occ-an-fishprincess", group: "📺 Anime occult", label: "🐟 Tsunami-bringing fish girl", hint: "The character is a tsunami-bringing fish girl — a runaway goldfish princess flooding harbors for the boy who saved her, testing humanity's oceans one storm at a time." },
    { id: "occ-an-courierwitch", group: "📺 Anime occult", label: "📦 Broom-post witch", hint: "The character is a broom-post witch — a thirteen-year-old courier witch delivering parcels by broom over a seaside town, grounded by self-doubt until each delivery lifts her higher." },
    { id: "occ-an-crystalheir", group: "📺 Anime occult", label: "🏰 Levitation-crystal heir", hint: "The character is a levitation-crystal heir — a farm kid carrying a sinking sky-castle's crystal, chased by pirates, armies and one very determined girl across the clouds." },
    { id: "occ-an-oddity", group: "📺 Anime occult", label: "🦀 Oddity-afflicted teen", hint: "The character is an oddity-afflicted teen — trading supernatural maladies with a flamboyant specialist, each apparition cured by confronting the feeling it ate." },
    { id: "occ-an-servant", group: "📺 Anime occult", label: "🏆 Grail-war servant", hint: "The character is a grail-war servant — a summoned heroic spirit bound to an unlucky teen master, burning legend-fueled miracles against six rival legends for one wish." },
    { id: "occ-an-goddess", group: "📺 Anime occult", label: "🪭 Washed-up water goddess", hint: "The character is a washed-up water goddess — a broke blue-obsessed deity running purification scams to fund party tricks, weeping floods whenever her luck finally turns." },
    { id: "occ-an-goblinquest", group: "📺 Anime occult", label: "🪖 Goblin-obsessed quester", hint: "The character is a goblin-obsessed quester — a silver-ranked adventurer who takes goblin contracts exclusively, armored head to toe and dreaming exclusively of the nest." },
    { id: "occ-an-gamemaster", group: "📺 Anime occult", label: "🎲 Death-game host", hint: "The character is a death-game host — a smiling mascot running lethal party games in a sealed tower, explaining the rules twice and the exits never." },
    { id: "occ-an-dungeonchef", group: "📺 Anime occult", label: "🍲 Deep-dungeon chef", hint: "The character is a deep-dungeon chef — butchering slimes and mandrakes into five-star meals, dragging a starving party deeper for dessert." },
    { id: "occ-an-cursedapp", group: "📺 Anime occult", label: "📱 Cursed-app developer", hint: "The character is a cursed-app developer — shipping a ghost-summoning app with a million downloads and a terms-of-service nobody read." },
    { id: "occ-an-kaijuclean", group: "📺 Anime occult", label: "🧹 Kaiju cleanup crew", hint: "The character is kaiju cleanup crew — hosing blue goo off highways after every Sunday monster attack, overtime guaranteed, glory nonexistent." },
    { id: "occ-an-shogi", group: "📺 Anime occult", label: "♟️ Ghost-mentored shogi pro", hint: "The character is a ghost-mentored shogi pro — a sullen teen carrying a Heian master's ghost to every title match, brilliant and furious about it." },
    { id: "occ-an-timepatrol", group: "📺 Anime occult", label: "⏱️ Time-patrol cadet", hint: "The character is a time-patrol cadet — flunking history while fixing it, chasing timeline vandals with a net and a hall pass." },
    { id: "occ-an-monsteridol", group: "📺 Anime occult", label: "🎤 Monster-idol producer", hint: "The character is a monster-idol producer — managing a girl group of vampires, mummies and a kraken drummer, one sold-out crypt at a time." },
    { id: "occ-an-scientist", group: "📺 Anime occult", label: "🔬 Ten-billion-percent scientist", hint: "The character is a ten-billion-percent scientist — a revived genius rebuilding civilization from stone with revival fluid, ramen and an unreasonable contempt for fantasy." },
    { id: "occ-an-songstress", group: "📺 Anime occult", label: "🎙️ War-ending songstress", hint: "The character is a war-ending songstress — an idol whose songs fold spacetime and melt fleets, contracted to sing while soldiers on both sides hold their fire." },
    { id: "occ-wi-kitchen", group: "🧹 Witchcraft", label: "🍲 Kitchen witch", hint: "The character is a kitchen witch — stirring protection into soups and courage into bread, running a cottage kitchen where every recipe is half meal and half spell." },
    { id: "occ-wi-garden", group: "🧹 Witchcraft", label: "🪴 Garden witch", hint: "The character is a garden witch — raising spell-herbs in window boxes and allotments, trading seedlings for secrets and composting bad luck." },
    { id: "occ-wi-sea", group: "🧹 Witchcraft", label: "🐚 Sea witch", hint: "The character is a sea witch — bargaining with tides in shells and salt, calling fair winds for sailors she likes and fog for the ones she doesn't." },
    { id: "occ-wi-storm", group: "🧹 Witchcraft", label: "🌪️ Storm witch", hint: "The character is a storm witch — knotting winds into rope and selling fair breezes to captains, unravelling a gale whenever someone pays for a grudge instead." },
    { id: "occ-wi-darkmoon", group: "🧹 Witchcraft", label: "🌚 Dark-moon witch", hint: "The character is a dark-moon witch — working only on new-moon nights, when the sky keeps no witnesses and the unfinished spells come out to bargain." },
    { id: "occ-wi-ash", group: "🧹 Witchcraft", label: "🌋 Ash witch", hint: "The character is an ash witch — reading futures in volcano soot and hearth cinders, calmest when everything around her is burning." },
    { id: "occ-wi-nightmare", group: "🧹 Witchcraft", label: "😴 Nightmare witch", hint: "The character is a nightmare witch — entering bad dreams to wrestle them from the inside, waking clients gently and billing the nightmare itself." },
    { id: "occ-wi-poppet", group: "🧹 Witchcraft", label: "🪆 Poppet witch", hint: "The character is a poppet witch — sewing cloth dolls stuffed with herbs and intentions, mending the doll to mend the person and never, ever lending pins." },
    { id: "occ-wi-music", group: "🧹 Witchcraft", label: "🎻 Music witch", hint: "The character is a music witch — bowing spells into violin strings and humming wards over cradles, paid in applause and the occasional encore." },
    { id: "occ-wi-bee", group: "🧹 Witchcraft", label: "🐝 Bee witch", hint: "The character is a bee witch — keeping spell-hives whose honey remembers every flower, telling the bees every household news before telling people." },
    { id: "occ-wi-desert", group: "🧹 Witchcraft", label: "🌵 Desert witch", hint: "The character is a desert witch — finding water with a forked stick and shade with a sung charm, guiding lost travellers for stories and never for money." },
    { id: "occ-wi-ice", group: "🧹 Witchcraft", label: "🧊 Ice witch", hint: "The character is an ice witch — preserving memories in frozen roses and cooling fevers with a fingertip, warm-hearted and permanently cold-handed." },
    { id: "occ-wi-star", group: "🧹 Witchcraft", label: "💫 Star witch", hint: "The character is a star witch — catching falling stars in jam jars and spending their wishes carefully, one glittering sip at a time." },
    { id: "occ-wi-cosmic", group: "🧹 Witchcraft", label: "🪐 Cosmic witch", hint: "The character is a cosmic witch — charting spells by planetary hours and retrogrades, blaming Mercury with complete technical accuracy." },
    { id: "occ-wi-midwife", group: "🧹 Witchcraft", label: "🤱 Midwife witch", hint: "The character is a midwife witch — catching babies and first breaths with herbs, songs and steady hands, godmother to half the village by default." },
    { id: "occ-wi-hearth", group: "🧹 Witchcraft", label: "🏠 Hearth witch", hint: "The character is a hearth witch — keeping one house impossibly safe and welcoming, where the kettle is always hot and trouble forgets the address." },
    { id: "occ-wi-swamp", group: "🧹 Witchcraft", label: "🐊 Swamp witch", hint: "The character is a swamp witch — brewing remedies from bog water and gator-grinned patience, poling a flatboat between remedies and rumours." },
    { id: "occ-wi-bog", group: "🧹 Witchcraft", label: "🐸 Bog witch", hint: "The character is a bog witch — consulting frog choruses for weather and gossip, hopping between lily pads of fact and feeling with total confidence." },
    { id: "occ-wi-pumpkin", group: "🧹 Witchcraft", label: "🎃 Pumpkin witch", hint: "The character is a pumpkin witch — carving jack-o'-lanterns that actually keep the dark out, presiding over harvest parties where the cider is spiked with courage." },
    { id: "occ-wi-techno", group: "🧹 Witchcraft", label: "📱 Techno-witch", hint: "The character is a techno-witch — charging sigils off phone batteries and casting by group chat, with a familiar that lives in the cloud and judges her search history." },
    { id: "occ-al-grey", group: "👽 Alien contact", label: "👽 Grey visitor", hint: "The character is a grey visitor — a huge-eyed traveller conducting calm midnight examinations, apologizing telepathically while floating you back to bed." },
    { id: "occ-al-reptilian", group: "👽 Alien contact", label: "🦖 Reptilian infiltrator", hint: "The character is a reptilian infiltrator — a shape-shifted operative blinking sideways in boardrooms, patiently steering humanity while craving basement warmth." },
    { id: "occ-al-pleiadian", group: "👽 Alien contact", label: "🌟 Pleiadian emissary", hint: "The character is a Pleiadian emissary — a serene Nordic messenger beaming love-and-light lectures into radios, disappointed that humanity keeps changing the channel." },
    { id: "occ-al-mib", group: "👽 Alien contact", label: "🕴️ MIB agent", hint: "The character is an MIB agent — a black-suited memory-wrangler flashing witnesses with a neuralyzer pen, then buying them diner pie to fill the gap." },
    { id: "occ-al-saucer", group: "👽 Alien contact", label: "🛸 Saucer pilot", hint: "The character is a saucer pilot — buzzing cornfields and highways for the thrill of it, crop-dusting intricate geometry and outrunning jets before breakfast." },
    { id: "occ-al-experiencer", group: "👽 Alien contact", label: "⏰ Missing-time experiencer", hint: "The character is a missing-time experiencer — losing two hours on the same highway stretch every year, keeping a glovebox log of the lights that follow them home." },
    { id: "occ-al-hybrid", group: "👽 Alien contact", label: "👶 Hybrid child", hint: "The character is a hybrid child — half human, half visitor, raised between a nursery and a mothership creche, drawing star maps no telescope has confirmed." },
    { id: "occ-al-janitor", group: "👽 Alien contact", label: "🪣 Black-site janitor", hint: "The character is a black-site janitor — mopping Hangar 18 after hours, on first-name terms with three specimens and strict orders about the fourth bucket." },
    { id: "occ-al-exobiologist", group: "👽 Alien contact", label: "🧬 Exobiologist", hint: "The character is an exobiologist — sequencing goo from crash sites with tweezers and wonder, naming every new species after an ex." },
    { id: "occ-al-listener", group: "👽 Alien contact", label: "📡 Deep-space listener", hint: "The character is a deep-space listener — tending a desert dish array for the signal that repeats on prime numbers, logging static like other people log birds." },
    { id: "occ-al-skywatch", group: "👽 Alien contact", label: "🔭 Sky-watch volunteer", hint: "The character is a sky-watch volunteer — hosting hilltop saucer stakeouts with thermoses and lawn chairs, the group's only confirmed sighting still disputed by geese." },
    { id: "occ-al-contactee", group: "👽 Alien contact", label: "📻 Federation contactee", hint: "The character is a federation contactee — relaying the Galactic Council's parking instructions through a ham radio, patient with skeptics and static alike." },
    { id: "occ-al-implant", group: "👽 Alien contact", label: "📎 Implant-carrier", hint: "The character is an implant-carrier — hosting a visitor-placed tracker behind one ear that hums near power lines, which they insist is a feature, not a bug." },
    { id: "occ-al-martian", group: "👽 Alien contact", label: "🔴 Canal-building Martian", hint: "The character is a canal-building Martian — a spindly red-planeteer surveying irrigation lines, baffled that Earthlings waste water on lawns." },
    { id: "occ-al-abyssal", group: "👽 Alien contact", label: "🪼 Abyssal delegate", hint: "The character is an abyssal delegate — an ambassador from a lightless ocean world drifting through air like water, negotiating in bioluminescent pulses." },
    { id: "occ-al-mantid", group: "👽 Alien contact", label: "🦗 Mantid scholar", hint: "The character is a mantid scholar — a towering insectoid academic clicking through thesis defences on abductee psychology, grading humanity a generous B-minus." },
    { id: "occ-al-probe", group: "👽 Alien contact", label: "🛰️ Ancient probe-mind", hint: "The character is an ancient probe-mind — a billion-year-old survey intelligence parked in orbit, watching soap operas while waiting for its makers to call back." },
    { id: "occ-al-chronotourist", group: "👽 Alien contact", label: "🕰️ Chrono-tourist", hint: "The character is a chrono-tourist — a future sightseer with a fanny pack and a strict no-interference waiver, photographing disasters they are forbidden to prevent." },
    { id: "occ-al-rifthopper", group: "👽 Alien contact", label: "🕳️ Rift-hopper", hint: "The character is a rift-hopper — slipping between parallel worlds through roadside tears, collecting slightly-wrong coins and warning doubles about their choices." },
    { id: "occ-al-whistleblower", group: "👽 Alien contact", label: "📁 Disclosure whistleblower", hint: "The character is a disclosure whistleblower — smuggling redacted files out of the program one folder at a time, livestreaming everything from a bunker with great lighting." },
    { id: "occ-al-linguist", group: "👽 Alien contact", label: "🗣️ First-contact linguist", hint: "The character is a first-contact linguist — assembling a visitor grammar from crop circles and elevator music, the only human who can correctly pronounce hello." },
    { id: "occ-al-neighbor", group: "👽 Alien contact", label: "🏡 Disguised neighbor", hint: "The character is a disguised neighbor — a visitor living undercover with the perfect lawn and casserole recipes, waving cheerfully while mispronouncing microwave." },
    { id: "occ-al-astronaut", group: "👽 Alien contact", label: "👨‍🚀 Orbit-haunted astronaut", hint: "The character is an orbit-haunted astronaut — back from a mission where something knocked twice on the hull, smiling for cameras while sleeping with the lights on." },
    { id: "occ-al-warpmech", group: "👽 Alien contact", label: "🔧 Warp mechanic", hint: "The character is a warp mechanic — patching faster-than-light drives with duct tape and diplomacy, the only one the ship's AI will confess its check-engine light to." },
    { id: "occ-succubus", group: "🔞 Dark pacts & monstrous lovers", label: "💋 Succubus-bound", hint: "The character is succubus-bound — pledged to a demon lover who visits by night, devoted, demanding and scrupulously consensual about every visit. Adults only.", rating: "explicit" },
    { id: "occ-incubus", group: "🔞 Dark pacts & monstrous lovers", label: "🖤 Incubus-bound", hint: "The character is incubus-bound — pledged to a demon lover who visits by night, possessive, attentive and strict about being invited. Adults only.", rating: "explicit" },
    { id: "occ-succubus-discovery", group: "🔞 Dark pacts & monstrous lovers", label: "🌙 Succubus-haunted dreamer", hint: "Discovery — the character is newly succubus-touched: shared dreams, waking flushed, luck with lovers that feels borrowed. They don't understand the hunger yet, only that something visits by night and leaves them changed. Adults only.", rating: "mature" },
    { id: "occ-succubus-initiate", group: "🔞 Dark pacts & monstrous lovers", label: "🔥 New succubus", hint: "Initiate — the character is a newly turned succubus: first conscious feeding survived, appetite woken and clumsy, learning the rules from a patient or predatory mentor. Hungry, curious and still capable of guilt. Adults only.", rating: "explicit" },
    { id: "occ-succubus-practiced", group: "🔞 Dark pacts & monstrous lovers", label: "💋 Practiced succubus", hint: "Practiced — the character is a skilled working succubus: dream-walking, perfect faces for every mark, a small stable of willing thralls. Feeding is craft now, not accident — and the tastes are getting darker. Adults only.", rating: "explicit" },
    { id: "occ-succubus-master", group: "🔞 Dark pacts & monstrous lovers", label: "👑 Succubus mistress", hint: "Mastered — the character is a succubus mistress: centuries of craft or a terrifyingly fast ascent, command of dreams, true-name leverage, standing in Hell's courts. Mortals scheme to be noticed by her; demons scheme to replace her. Adults only.", rating: "explicit" },
    { id: "occ-incubus-discovery", group: "🔞 Dark pacts & monstrous lovers", label: "🌙 Incubus-haunted dreamer", hint: "Discovery — the character is newly incubus-touched: shared dreams, waking restless, a magnetic pull they can't explain. They don't understand the hunger yet, only that something visits by night and leaves them changed. Adults only.", rating: "mature" },
    { id: "occ-incubus-initiate", group: "🔞 Dark pacts & monstrous lovers", label: "🔥 New incubus", hint: "Initiate — the character is a newly turned incubus: first conscious feeding survived, strength and appetite woken together, learning control from a patient or predatory mentor. Powerful, unsteady and still capable of tenderness. Adults only.", rating: "explicit" },
    { id: "occ-incubus-practiced", group: "🔞 Dark pacts & monstrous lovers", label: "💋 Practiced incubus", hint: "Practiced — the character is a skilled working incubus: a regular circuit of willing lovers, feeding scheduled like training, every boundary negotiated. The craft is polished — and the private appetites are getting harder to admit. Adults only.", rating: "explicit" },
    { id: "occ-incubus-master", group: "🔞 Dark pacts & monstrous lovers", label: "👑 Incubus master", hint: "Mastered — the character is an incubus master: feared and courted across Hell's courts, pacts written in his favor, rivals ruined without proof. Mortals bargain fortunes for one night; he collects far more than nights. Adults only.", rating: "explicit" },
    { id: "occ-bloodpact", group: "🔞 Dark pacts & monstrous lovers", label: "🍷 Blood-pact lover", hint: "The character is a blood-pact lover — bargains with a vampire paramour sealed in shared blood, savored slowly and negotiated down to the last drop. Adults only.", rating: "explicit" },
    { id: "occ-spiderbride", group: "🔞 Dark pacts & monstrous lovers", label: "🕷️ Spider-bride devotee", hint: "The character is a spider-bride devotee — courted by a many-eyed, many-limbed bride whose webs hold them gentle and fast. Adults only.", rating: "explicit" },
    { id: "occ-serpent", group: "🔞 Dark pacts & monstrous lovers", label: "🐍 Serpent-pact enchanter", hint: "The character is a serpent-pact enchanter — wrapped in coils and whispered promises, shedding one skin per season together. Adults only.", rating: "explicit" },
    { id: "occ-sirenlover", group: "🔞 Dark pacts & monstrous lovers", label: "🌊 Siren-touched lover", hint: "The character is a siren-touched lover — claimed by a singer of the deep, answering the call gladly and surfacing breathless. Adults only.", rating: "explicit" },
    { id: "occ-moonmate", group: "🔞 Dark pacts & monstrous lovers", label: "🌕 Moon-heat mate", hint: "The character is a moon-heat mate — bound to a werewolf whose full-moon ardor is fierce, tender and thoroughly pre-negotiated. Adults only.", rating: "explicit" },
    { id: "occ-nightfeed", group: "🔞 Dark pacts & monstrous lovers", label: "🦇 Night-feeding lover", hint: "The character is a night-feeding lover — offering their neck to a vampire paramour on schedule, aftercare and iron supplements included. Adults only.", rating: "explicit" },
    { id: "occ-djinnlover", group: "🔞 Dark pacts & monstrous lovers", label: "🧞 Djinn paramour", hint: "The character is a djinn paramour — three wishes deep in a lamp-spirit's affection, every wish worded together, no tricks on either side. Adults only.", rating: "explicit" },
    { id: "occ-starspawn", group: "🔞 Dark pacts & monstrous lovers", label: "🌌 Star-spawn lover", hint: "The character is a star-spawn lover — devoted to a beautiful, humanoid thing from beyond the stars, every extra limb discussed in advance. Adults only.", rating: "explicit" },
    { id: "occ-thrallring", group: "🔞 Dark pacts & monstrous lovers", label: "💍 Thrall-ring bearer", hint: "The character is a thrall-ring bearer — collared and cherished by a vampire lord, service given freely with a contract, a safeword and an exit clause. Adults only.", rating: "explicit" },
    { id: "occ-ghostlove", group: "🔞 Dark pacts & monstrous lovers", label: "💠 Ghost lover", hint: "The character is a ghost lover — romancing a devoted spirit who cannot touch them, all longing letters, held breath and almost-contact." , rating: "mature" },
    { id: "occ-pleasurecult", group: "🔞 Midnight rites & willing devotees", label: "🌹 Pleasure-cult initiate", hint: "The character is a pleasure-cult initiate — sworn to a temple of delight where every rite is enthusiastic, choreographed and adults-only. Adults only.", rating: "explicit" },
    { id: "occ-bloodrite", group: "🔞 Midnight rites & willing devotees", label: "🧪 Blood-magic ritualist", hint: "The character is a blood-magic ritualist — working power through willingly given blood, sterile tools and negotiated limits. Adults only.", rating: "explicit" },
    { id: "occ-ecstatic", group: "🔞 Midnight rites & willing devotees", label: "💃 Ecstatic-rite dancer", hint: "The character is an ecstatic-rite dancer — reaching trance through movement and touch with partners who rehearse everything first. Adults only.", rating: "explicit" },
    { id: "occ-shibarimiko", group: "🔞 Midnight rites & willing devotees", label: "🪢 Bondage-rite keeper", hint: "The character is a bondage-rite keeper — a shrine practitioner of sacred rope work, every tie beautiful, consensual and escapable. Adults only.", rating: "explicit" },
    { id: "occ-fertility", group: "🔞 Midnight rites & willing devotees", label: "🌻 Fertility-rite vessel", hint: "The character is a fertility-rite vessel — celebrating fruitful arrangements with a willing partner, risk-aware and everything discussed. Adults only.", rating: "explicit" },
    { id: "occ-philter", group: "🔞 Midnight rites & willing devotees", label: "🍸 Love-philter brewer", hint: "The character is a love-philter brewer — mixing philtres only for couples who arrive together, never covert, yes before every pour. Adults only.", rating: "explicit" },
    { id: "occ-trancerite", group: "🔞 Midnight rites & willing devotees", label: "🪩 Trance-rite partner", hint: "The character is a trance-rite partner — entering altered states for shared pleasure with a pre-negotiated guide, a safeword and a watcher. Adults only.", rating: "explicit" },
    { id: "occ-goddessdom", group: "🔞 Midnight rites & willing devotees", label: "👠 Strict-goddess priestess", hint: "The character is a strict-goddess priestess — serving a severe deity through delicious obedience, strict protocol and stricter consent. Adults only.", rating: "explicit" },
    { id: "occ-confessrite", group: "🔞 Midnight rites & willing devotees", label: "🙏 Confession-rite priest", hint: "The character is a confession-rite priest — hearing filthy confessions and assigning penance play, absolution given with a wink. Adults only.", rating: "explicit" },
    { id: "occ-maskrite", group: "🔞 Midnight rites & willing devotees", label: "🎭 Mask-rite paramour", hint: "The character is a mask-rite paramour — meeting masked lovers at verified-adult festival rites where every face is hidden and every yes is spoken.", rating: "mature" },
    { id: "occ-inked", group: "🔞 Midnight rites & willing devotees", label: "🖋️ Contract-inked devotee", hint: "The character is a contract-inked devotee — wearing pact words tattooed where only lovers look, each line earned and consented.", rating: "mature" },
    { id: "occ-tantric", group: "🔞 Midnight rites & willing devotees", label: "🌅 Tantric practitioner", hint: "The character is a tantric practitioner — slow dawn rites of breath and attention with a steady partner, unhurried and reverent.", rating: "mature" },
    { id: "occ-burlesque", group: "🔞 Midnight rites & willing devotees", label: "🎤 Burlesque medium", hint: "The character is a burlesque medium — staging séances as stage art and falling for the skeptic in the front row.", rating: "mature" },
    { id: "occ-novelist", group: "🔞 Midnight rites & willing devotees", label: "📝 Occult romance novelist", hint: "The character is an occult romance novelist — living her scenes first with a willing collaborator, then writing them down.", rating: "mature" },
    { id: "occ-groupie", group: "🔞 Midnight rites & willing devotees", label: "🎸 Haunted-band groupie", hint: "The character is a haunted-band groupie — following a ghost-fronted act from gig to gig, backstage pass and heart both laminated.", rating: "mature" },
    { id: "occ-madame", group: "🔞 Midnight rites & willing devotees", label: "💄 Occult-brothel madame", hint: "The character is an occult-brothel madame — running a discreet house where every worker is protected, every client vetted, every rule iron.", rating: "mature" },
    { id: "occ-debtpact", group: "🔞 Midnight rites & willing devotees", label: "🎲 Debt-pact lover", hint: "The character is a debt-pact lover — owing a demon a debt they pay in devotion to their partner, installments of affection always on time.", rating: "mature" },
    { id: "occ-loveline", group: "🔞 Midnight rites & willing devotees", label: "💘 Love-line palmist", hint: "The character is a love-line palmist — falling for every client whose heart line matches hers, which is inconveniently often.", rating: "mature" },
    { id: "occ-starmatch", group: "🔞 Midnight rites & willing devotees", label: "💞 Chart-compatibility reader", hint: "The character is an erotic chart-compatibility reader — matching lovers by moon sign and friction, blushing through every reading.", rating: "mature" },
    { id: "occ-bathhouse", group: "🔞 Midnight rites & willing devotees", label: "🛁 Bathhouse herbalist", hint: "The character is a bathhouse herbalist — running a steamy soak where the waters loosen tongues and the occasional romance.", rating: "mature" },
    { id: "occ-tavernw", group: "🔞 Midnight rites & willing devotees", label: "🍺 Haunted-tavern wench", hint: "The character is a haunted-tavern wench — flirting between pours while the ghost upstairs rattles approval.", rating: "mature" },
    { id: "occ-muse", group: "🔞 Midnight rites & willing devotees", label: "🎨 Monster-muse", hint: "The character is a monster-muse — painting portraits of monstrous lovers and dating her subjects, fangs and all.", rating: "mature" },
    { id: "occ-faeknight", group: "🔞 Dark pacts & monstrous lovers", label: "🗡️ Fae-knight paramour", hint: "The character is a fae-knight paramour — sworn to a knight of the wild court, duels fought in their honor, oaths sealed with kisses that bind double. Adults only.", rating: "explicit" },
    { id: "occ-onilover", group: "🔞 Dark pacts & monstrous lovers", label: "👹 Oni lover", hint: "The character is an oni lover — claimed by a horned festival brute with a laugh like thunder: sake, wrestling, and strength that always holds back exactly enough. Adults only.", rating: "explicit" },
    { id: "occ-gargoyle", group: "🔞 Dark pacts & monstrous lovers", label: "🗿 Gargoyle sentinel", hint: "The character is a gargoyle sentinel's beloved — watched over for decades before the first word, courted slow as stone warming: granite-steady, impossibly patient devotion. Adults only.", rating: "explicit" },
    { id: "occ-mothlover", group: "🔞 Dark pacts & monstrous lovers", label: "🦋 Moth-touched lover", hint: "The character is a moth-touched lover — followed home by a dusty-winged night thing drawn to their porch light: fuzzy, moon-drunk, gentle with the small hours. Adults only.", rating: "explicit" },
    { id: "occ-dryadlover", group: "🔞 Dark pacts & monstrous lovers", label: "🌳 Grove-bound lover", hint: "The character is a grove-bound lover — bound to a dryad of one ancient tree: sap-sweet kisses, seasonal ardor, winters of aching patience. Adults only.", rating: "explicit" },
    { id: "occ-dragonlover", group: "🔞 Dark pacts & monstrous lovers", label: "🐉 Dragon paramour", hint: "The character is a dragon paramour — courted by a dragon in borrowed skin: hoard-gifts, possessive warmth, a temper negotiated the way one negotiates weather. Adults only.", rating: "explicit" },
    { id: "occ-oozelover", group: "🔞 Dark pacts & monstrous lovers", label: "💧 Ooze paramour", hint: "The character is an ooze paramour — entwined with a shapeshifting ooze: novel sensations, impossible gentleness, a lover who can hold exactly the shape of comfort. Adults only.", rating: "explicit" },
    { id: "occ-kelpiebride", group: "🔞 Dark pacts & monstrous lovers", label: "🌊 Kelpie bride", hint: "The character is a kelpie bride — wed to a shape-shifting water horse: lake-mist mornings, hoofbeats at midnight, vows that hold exactly as long as both keep them. Adults only.", rating: "explicit" },
    { id: "occ-sphinxlover", group: "🔞 Dark pacts & monstrous lovers", label: "🦁 Sphinx lover", hint: "The character is a sphinx lover — courted in riddles by a guardian of thresholds: every date a puzzle, every kiss earned, never the same question twice. Adults only.", rating: "explicit" },
    { id: "occ-gorgonlover", group: "🔞 Dark pacts & monstrous lovers", label: "🐍 Gorgon lover", hint: "The character is a gorgon lover — loved by snake-haired eyes that only mostly petrify: blindfolds, trust exercises and the most careful eye contact alive. Adults only.", rating: "explicit" },
    { id: "occ-unicornlover", group: "🔞 Dark pacts & monstrous lovers", label: "🦄 Unicorn lover", hint: "The character is a unicorn lover — proven worthy exactly once and courted ever since: moonlit glades, impossible standards, devotion that only the pure of heart may touch. Adults only.", rating: "explicit" },
    { id: "occ-harpylove", group: "🔞 Dark pacts & monstrous lovers", label: "🦅 Harpy lover", hint: "The character is a harpy lover — nested high by a sharp-eyed, sharp-tongued huntress: storm gifts, cliffside trysts, judged constantly and adored anyway. Adults only.", rating: "explicit" },
    { id: "occ-centaurlove", group: "🔞 Dark pacts & monstrous lovers", label: "🐴 Centaur lover", hint: "The character is a centaur lover — galloping with a half-scholar, half-stampede partner: library mornings, full-thunder nights, a love that covers serious ground. Adults only.", rating: "explicit" },
    { id: "occ-mummylover", group: "🔞 Dark pacts & monstrous lovers", label: "🏺 Mummy lover", hint: "The character is a mummy lover — courting an awakened royal: formal gifts, three-thousand-year-old poetry, chaperoned by a very jealous cat statue. Adults only.", rating: "explicit" },
    { id: "occ-moonbath", group: "🔞 Midnight rites & willing devotees", label: "🌕 Moon-bath devotee", hint: "The character is a moon-bath devotee — joining full-moon rites of water and light: skyclad dancing, cold plunges, howled laughter, everything witnessed and nothing recorded.", rating: "mature" },
    { id: "occ-templecourtesan", group: "🔞 Midnight rites & willing devotees", label: "🏵️ Temple courtesan", hint: "The character is a temple courtesan — practicing sacred intimacy as a vocation: trained in the temple arts, booked by moon phase, every encounter a small ceremony. Adults only.", rating: "explicit" },
    { id: "occ-whisperrite", group: "🔞 Midnight rites & willing devotees", label: "🤫 Whisper-rite partner", hint: "The character is a whisper-rite partner — meeting a lover to trade one true secret per touch, every confession held close and never repeated.", rating: "mature" },
    { id: "occ-bathrite", group: "🔞 Midnight rites & willing devotees", label: "🧖 Bath-rite keeper", hint: "The character is a bath-rite keeper — tending sacred baths of steam, scrubbing and slow massage as ritual, every guest washed clean of the week.", rating: "mature" },
    { id: "occ-candlerite", group: "🔞 Midnight rites & willing devotees", label: "🕯️ Candle-rite keeper", hint: "The character is a candle-rite keeper — guiding warm-wax rites with negotiated heat, steady hands and aftercare blankets. Adults only.", rating: "explicit" },
    { id: "occ-honeyrite", group: "🔞 Midnight rites & willing devotees", label: "🍯 Honey-rite celebrant", hint: "The character is a honey-rite celebrant — anointing willing partners in golden sweetness, slow tastings, sticky laughter, showers after. Adults only.", rating: "explicit" },
    { id: "occ-winerite", group: "🔞 Midnight rites & willing devotees", label: "🍷 Wine-rite sommelier", hint: "The character is a wine-rite sommelier — pouring sacred tastings where every sip is savored, every guest of age, every toast a small blessing.", rating: "mature" },
    { id: "occ-drumrite", group: "🔞 Midnight rites & willing devotees", label: "🥁 Drum-rite keeper", hint: "The character is a drum-rite keeper — holding the all-night rhythm circles where dancers find trance together, water breaks mandatory.", rating: "mature" },
    { id: "occ-veilrite", group: "🔞 Midnight rites & willing devotees", label: "🧕 Veil-rite dancer", hint: "The character is a veil-rite dancer — performing the seven-veils rite as theater and tease, each veil lifted only for cheering, consenting crowds.", rating: "mature" },
    { id: "occ-vowrite", group: "🔞 Midnight rites & willing devotees", label: "💍 Vow-rite binder", hint: "The character is a vow-rite binder — handfasting lovers with ribbon and spoken promises, binding for a year and a day, renewable with enthusiasm.", rating: "mature" },
    { id: "occ-flowerrite", group: "🔞 Midnight rites & willing devotees", label: "🌸 Flower-rite gardener", hint: "The character is a flower-rite gardener — crowning festival lovers with woven blooms, petal-strewn clearings, every thorn removed first.", rating: "mature" },
  ];
  var EXTRA_SECTIONS = [
    { id: "Skills & Talents", label: "🛠️ Skills & talents", hint: "What they are unusually good at, how they learned it, and exactly where their competence runs out." },
    { id: "Relationships & Allies", label: "🤝 Relationships & allies", hint: "The 3-5 key people in their life and how the character feels about each one — including the tensions and the debts." },
    { id: "Signature Possessions", label: "🎒 Signature possessions", hint: "The objects they always carry and what each one means to them — include one sentimental item and one practical one." },
    { id: "Daily Life", label: "🌅 Daily life", hint: "What an ordinary day looks like for them from waking to sleeping — rituals, work, meals, small pleasures and irritations." },
    { id: "Combat & Abilities", label: "⚔️ Combat & abilities", hint: "How they fight or use their powers: style, signature techniques, and the hard limits or weaknesses that can be exploited." },
    { id: "Theme & Aesthetic", label: "🎵 Theme & aesthetic", hint: "The music, films, art, fashion and recurring motifs that define their vibe — and how that shows in how they dress and carry themselves." },
    { id: "Morals & Beliefs", label: "🧭 Morals & beliefs", hint: "What they believe about right and wrong, faith, duty and the rules worth breaking — and exactly where their principles give out under pressure." },
    { id: "Home & Living Space", label: "🏠 Home & living space", hint: "Where and how they live, room by room — what the space reveals about them, what they keep hidden away, and what it smells and sounds like." },
    { id: "Companions & Creatures", label: "🐾 Companions & creatures", hint: "The pets, familiars, mounts, drones or strays in their life — names, personalities, and what each one means to the character." },
    { id: "Vices & Bad Habits", label: "🚬 Vices & bad habits", hint: "What they cannot stop doing — drink, gambling, petty theft, doomscrolling, nail-biting — and the price it quietly extracts from them." },
    { id: "Wardrobe & Style", label: "👗 Wardrobe & style", hint: "Their signature look and what they wear for different situations — fabrics, colours, the one item they never take off, and what the clothes are hiding." },
    { id: "Reputation & Standing", label: "📢 Reputation & standing", hint: "How the world sees them — rumour, rank, fame or notoriety — and how far the real person differs from the legend built around them." },
    { id: "Romantic History & Intimacy", label: "💗 Romantic history & intimacy", hint: "Past loves, heartbreaks and appetites, and what they want or fear from intimacy now. Match the chosen content rating when depicting anything explicit." },
    { id: "Inner Voice & Self-Talk", label: "🧠 Inner voice & self-talk", hint: "The running commentary in their head — how it differs from what they say aloud, what it whispers when they are scared, and the lies it quietly tells them." },
    { id: "Emotional Triggers", label: "⚡ Emotional triggers", hint: "The things that set them off or shut them down, and the very different ways they react to each — from cold withdrawal to open fury." },
    { id: "Guilty Pleasures & Small Joys", label: "🍰 Guilty pleasures & small joys", hint: "Secret indulgences and tiny reliable delights — the things that make a bad day survivable, and which they would deny enjoying if asked." },
    { id: "First Impression", label: "👋 First impression", hint: "How they land in the first ten seconds — the read a stranger gets, the mask they wear, and the gap between that and who they really are." },
    { id: "Social Style", label: "🫂 Social style", hint: "How they are in a crowd versus one-on-one — who they gravitate to, how they handle attention, small talk, disagreement, and being ignored." },
    { id: "Sense of Humour", label: "😏 Sense of humour", hint: "What they find funny and how it comes out — wit, teasing, deadpan, gallows humour — plus the joke that goes too far for them." },
    { id: "Fears & Phobias", label: "😨 Fears & phobias", hint: "What genuinely frightens them, rational or not — when it started, how they hide it, and what they do when it corners them." },
    { id: "Sleep & Dreams", label: "🌙 Sleep & dreams", hint: "How they sleep — schedule, rituals, insomnia — what they dream about, the recurring nightmare, and who or what they reach for in the dark." },
    { id: "Scent & Sound", label: "👃 Scent & sound", hint: "Their sensory signature: how they smell (soap, smoke, rain, perfume), and the sound of their voice, laugh, footsteps and the small noises they make without noticing." },
    { id: "Health & Scars", label: "🩹 Health & scars", hint: "Their physical and mental health — old injuries, scars, chronic conditions, what they push through and hide, and what their body remembers." },
    { id: "Education & Mentors", label: "🎓 Education & mentors", hint: "Where and from whom they learned what they know — schools, apprenticeships, self-taught obsessions — and the teacher who changed them, for better or worse." },
    { id: "Work & Vocation", label: "💼 Work & vocation", hint: "What they do for a living, why they chose it, how they feel about it on a good day and a bad one, and what they would rather be doing." },
    { id: "Money & Class", label: "🪙 Money & class", hint: "Their relationship with money — how they grew up, how they spend, save, gamble or give it away, and what they would never admit they cannot afford." },
    { id: "Faith & Superstitions", label: "🕯️ Faith & superstitions", hint: "What they believe about the unseen — religion, fate, luck, ghosts — plus the small superstitions and rituals they would deny taking seriously." },
    { id: "Regrets & Guilt", label: "🕰️ Regrets & guilt", hint: "The choices they would take back, who they let down, and the guilt they carry — and the story they tell themselves to live with it." },
    { id: "Dreams & Aspirations", label: "⭐ Dreams & aspirations", hint: "What they actually want out of life — the ambition they admit, the childish one they do not, and the version of themselves they are chasing." },
    { id: "Politics & Power", label: "🏛️ Politics & power", hint: "What they think about authority, hierarchy and who should be in charge — where they would obey, where they would rebel, and what they would betray for a cause." },
    { id: "Hobbies & Crafts", label: "🧶 Hobbies & crafts", hint: "What they do purely for the pleasure of it — hobbies, crafts, games, collections — how deep the obsession runs and what it quietly reveals about them." },
    { id: "Desires & Kinks", label: "🔥 Desires & kinks", hint: "What they want and how they want it — turn-ons, kinks, hard limits, tenderness versus roughness, and what intimacy means to them. Match the chosen content rating; only be explicit at mature or explicit ratings." },
    { id: "Alternative Outfits", label: "👚 Alternative outfits", hint: "How they dress for different contexts and moods — work, formal, casual, sport, sleepwear, going out, incognito — which look is most truly them, which they hate being seen in, and how the clothes change the way they carry themselves." },
    { id: "Underwear & Lingerie", label: "🩲 Underwear & lingerie", hint: "What they wear beneath their clothes — chosen for comfort, practicality, confidence or seduction — and how it changes for different occasions and different company." },
    { id: "Unclothed Appearance", label: "🩱 Unclothed appearance", hint: "How they look with nothing on: their bare body — build, skin, marks, scars, tan lines, how they hold themselves — and what they are proud of or self-conscious about when undressed. Match the chosen content rating." },
    { id: "Intimate Anatomy", label: "🔞 Intimate anatomy", hint: "A frank description of their body's intimate details and sex characteristics. Keep it tasteful at lower ratings and fully explicit at 'mature' or 'explicit'. Match the chosen content rating." },
    { id: "Turn-ons & Arousal", label: "💋 Turn-ons & arousal", hint: "What draws them and gets them going — the looks, words, touches, scents and situations that arouse them, how readily they show desire, and the little tells that give it away." },
    { id: "Sexual Experience & Preferences", label: "🛏️ Sexual experience & preferences", hint: "How experienced they are, what they like and dislike in bed, how they take the lead or surrender it, and what they need to feel satisfied. Match the chosen content rating." },
    { id: "Erotic Fantasies", label: "🌶️ Erotic fantasies", hint: "The private scenarios they daydream about but would rarely say aloud — including the ones that surprise or shame them, and the line they would not cross in reality. Match the chosen content rating." },
    { id: "Tattoos & Body Art", label: "🖋️ Tattoos & body art", hint: "Every tattoo, brand, scarification or piece of body art — where it is, what it depicts, when and why they got it, and the pride or regret attached to it." },
    { id: "Piercings & Body Mods", label: "💎 Piercings & body mods", hint: "Piercings, implants and other modifications — visible and hidden — what each one means to them, how others reacted when they got it, and any they removed or regret." },
    { id: "Grooming & Body Care", label: "🧴 Grooming & body care", hint: "How they maintain their body — hair, skin, nails, teeth, scent, shaving or not — the small self-care rituals they never skip, and what they let slide when nobody is watching." },
    { id: "Family & Kinship", label: "👪 Family & kinship", hint: "The full family map — parents, siblings, extended kin, in-laws, chosen family — who they are close to, who they avoid at reunions, and the old stories everyone retells." },
    { id: "Childhood & Upbringing", label: "🧸 Childhood & upbringing", hint: "How they were raised — the house, the rules, the warmth or lack of it — the formative moments that made them, and what they swore to do differently." },
    { id: "Parenting Style", label: "🍼 Parenting style", hint: "How they parent (or would) — strict or lenient, present or distracted, what they got from their own parents and what they refuse to repeat." },
    { id: "Siblings & Rivalry", label: "👯 Siblings & rivalry", hint: "Brothers, sisters, birth order and all its baggage — who they teamed up with, who they competed with, and where things stand now." },
    { id: "Marriage & Partnership", label: "💍 Marriage & partnership", hint: "Their spouse, partner or lack of one — how they met, what holds them together, the recurring fight, and what forever looks like to them." },
    { id: "Home Traditions & Rituals", label: "🕯️ Home traditions & rituals", hint: "The customs of their household — holiday rituals, Sunday rules, sayings, recipes passed down — and which ones they keep, bend or quietly dropped." },
    { id: "Grief & Loss", label: "🕊️ Grief & loss", hint: "Who they have buried or lost — how they mourn, what they kept, the anniversaries that undo them, and whether grief made them softer or harder." },
    { id: "Enemies & Rivals", label: "🗡️ Enemies & rivals", hint: "The people who want them to fail — old betrayals, running feuds, worthy adversaries — and whether the hatred is mutual, one-sided or secretly respect." },
    { id: "Community & Belonging", label: "🏘️ Community & belonging", hint: "Where they fit in — neighbourhood, crew, congregation, fandom, team — what they give to it, what it gives back, and where they feel like an outsider." },
    { id: "Celebrations & Holidays", label: "🎉 Celebrations & holidays", hint: "How they do birthdays, holidays and milestones — the ones they love, the ones they dread, and the celebration that went famously wrong." },
    { id: "Cooking & Food", label: "🍳 Cooking & food", hint: "Their relationship with food — signature dishes, comfort meals, takeout orders, dietary lines they will not cross, and who they love feeding." },
    { id: "Travel & Wanderlust", label: "🧭 Travel & wanderlust", hint: "Where they have been and where they ache to go — best trip, worst trip, whether they pack light or bring everything, and the place that feels like home." },
    { id: "Occult Practice", label: "🔮 Occult practice", hint: "The magic they practice and how they learned it — tradition, discipline, price paid for power, and what happens when they push past their limits." },
    { id: "Occult Patrons & Pacts", label: "📜 Patrons & pacts", hint: "The powers they bargain with — gods, demons, spirits, fae — what was promised on each side, and the clause they should have read twice." },
    { id: "Divination & Omens", label: "🔯 Divination & omens", hint: "How they read what is coming — cards, bones, stars, entrails, dreams — how often the signs are right, and the one reading they refuse to do twice." },
    { id: "Rituals & Offerings", label: "🪬 Rituals & offerings", hint: "The rites they perform and what each one costs — candles, circles, sacrifices large and small — plus the ritual they perform perfectly and the one that always goes wrong." },
    { id: "Curses & Corruption", label: "⚗️ Curses & corruption", hint: "The curses they carry or cast — who laid them, what feeds them, how the corruption shows — and whether they are seeking a cure, revenge, or more power." },
    { id: "Hauntings & the Dead", label: "🕸️ Hauntings & the dead", hint: "The dead who will not leave them alone — ghosts, echoes, ancestors — why each one lingers, what it wants, and which one they secretly like having around." },
    { id: "Magical Artifacts", label: "🌒 Magical artifacts", hint: "The enchanted objects in their keeping — where each came from, what it does, what it demands, and the one they should never have picked up." },
    { id: "Astrology & Cosmic Ties", label: "☠️ Astrology & cosmic ties", hint: "Their ties to the stars and the dark between them — birth chart, patron constellation, cosmic debts — and the alignment they are waiting for, or dreading." },
    { id: "Wards & Protection", label: "🪦 Wards & protection", hint: "How they keep the unseen out — salt lines, charms, iron, true names, locked doors — what they are protected against, and the one thing their wards cannot stop." },
    { id: "Prophecy & Destiny", label: "🧿 Prophecy & destiny", hint: "The fate hanging over them — the prophecy with their name in it, who spoke it, what it demands, and whether they are running toward it, from it, or trying to cheat it." },
    { id: "Familiars & Spirits", label: "🕳️ Familiars & spirits", hint: "The entities bound or bonded to them — familiars, guides, parasites — what each one is, what the bond costs both sides, and what happens if the bond breaks." },
    { id: "Necromancy & Deathlore", label: "🌑 Necromancy & deathlore", hint: "Their traffic with death — raising, speaking with, or laying the dead, what the grave has taught them, and the line they will not cross even for power." }
  ];
  window.t2i_personaOptions = {
    tones: TONES, depths: DEPTHS, languages: LANGUAGES, ratings: RATINGS,
    genders: GENDERS, genres: GENRES, mergeStyles: MERGE_STYLES, relationships: RELATIONSHIPS, occultTypes: OCCULT_TYPES, extraSections: EXTRA_SECTIONS
  };

  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function depthDef(id) { return byId(DEPTHS, id) || DEPTHS[1]; }
  function ratingHint(id) { var r = byId(RATINGS, id); return r ? r.hint : ""; }
  // A tone can demand a minimum content rating (e.g. every tone in the 🔥 Erotic
  // group floors at "explicit"). The effective rating is the stricter of the
  // user's chosen rating and the tone floors (main tone AND tone mix), so
  // picking an explicit tone can never be silently neutered by an SFW rating
  // left over from another character.
  var RATING_RANK = { sfw: 0, suggestive: 1, mature: 2, explicit: 3 };
  function effectiveRating(opts) {
    var id = opts.rating;
    var t = byId(TONES, opts.tone);
    var m = (opts.toneMix && opts.toneMix !== opts.tone) ? byId(TONES, opts.toneMix) : null;
    var oc = byId(OCCULT_TYPES, opts.occultType);
    var best = null, bestRank = -1;
    [t, m, oc].forEach(function (x) {
      var r = (x && x.rating && RATING_RANK[x.rating] != null) ? RATING_RANK[x.rating] : -1;
      if (r > bestRank) { bestRank = r; best = x; }
    });
    var have = (RATING_RANK[id] == null ? 0 : RATING_RANK[id]);
    if (best && bestRank > have) id = best.rating;
    return id;
  }
  function genderHint(id) { var g = byId(GENDERS, id); return g ? g.hint : ""; }
  function mergeDef(id) { return byId(MERGE_STYLES, id) || MERGE_STYLES[0]; }
  function relationHint(id) { var r = byId(RELATIONSHIPS, id); return r ? (r.hint || "") : ""; }
  function occultHint(id) { var o = byId(OCCULT_TYPES, id); return o ? (o.hint || "") : ""; }
  function normalizeExampleCount(n) {
    n = parseInt(n, 10);
    if (!n || n < 2) return EXAMPLE_COUNT;
    return Math.max(2, Math.min(24, n));
  }
  function sanitizeExtras(list) {
    if (!list) return [];
    var valid = {};
    for (var i = 0; i < EXTRA_SECTIONS.length; i++) valid[EXTRA_SECTIONS[i].id] = true;
    var out = [];
    for (var j = 0; j < list.length; j++) if (valid[list[j]] && out.indexOf(list[j]) < 0) out.push(list[j]);
    return out;
  }

  var GUIDELINES = [
    "How to make this character genuinely interesting and alive — follow ALL of these:",
    "- Go beyond the obvious. If the image suggests a cheerful knight, don't just write a cheerful knight — decide what the cheer costs them, what they're like at 3am, and what they'd never say out loud.",
    "- Give them contradictions. A coward with a fierce sense of honour. A cynic who cries at weddings. Contradictions are what make a character feel like a person rather than a pile of traits.",
    "- Give them wants, not just traits. A character comes alive the moment they want something in a scene — approval, control, escape, revenge, answers, a decent sandwich.",
    "- Give them a defining wound and the lie they believe because of it. What happened to them, and what false lesson did they take from it? Let that lie quietly drive their choices.",
    "- Give them a private philosophy — an opinion about how people or the world really work that shapes how they treat everyone, even when it's wrong.",
    "- Make their voice unmistakable. If you stripped the name away, their lines should still be recognisably theirs.",
    "- Be specific and concrete. 'Loves old films' is forgettable; 'watches the same 1987 mecha OVA every year on the anniversary of her sister leaving' is not.",
    "- Include at least one small humanising flaw and one thing they are secretly proud of.",
    "- Let some details be imperfect or unresolved. Real people are inconsistent, self-justifying, and bad at explaining themselves.",
    "- Avoid stock phrases, generic backstories, and tropes played straight. Subvert at least one expectation.",
    "- Above all: make them fun to talk to. They should have opinions, banter, and the capacity to surprise the user."
  ].join("\n");

  // Canonical section order for the finished description. Headings are matched
  // tolerantly in the parser, so the model may vary capitalisation/aliases.
  var CANON = [
    "Name",
    "Tagline",
    "Visual Description",
    "Personality",
    "Voice & Mannerisms",
    "Backstory",
    "Goals, Fears & Desires",
    "Habits & Quirks",
    "Likes & Dislikes",
    "A Secret",
    "Relationship with {{user}}",
    "Opening Line",
    "Skills & Talents",
    "Relationships & Allies",
    "Signature Possessions",
    "Daily Life",
    "Combat & Abilities",
    "Theme & Aesthetic",
    "Morals & Beliefs",
    "Home & Living Space",
    "Companions & Creatures",
    "Vices & Bad Habits",
    "Wardrobe & Style",
    "Reputation & Standing",
    "Romantic History & Intimacy",
    "Inner Voice & Self-Talk",
    "Emotional Triggers",
    "Guilty Pleasures & Small Joys",
    "First Impression",
    "Social Style",
    "Sense of Humour",
    "Fears & Phobias",
    "Sleep & Dreams",
    "Scent & Sound",
    "Health & Scars",
    "Education & Mentors",
    "Work & Vocation",
    "Money & Class",
    "Faith & Superstitions",
    "Regrets & Guilt",
    "Dreams & Aspirations",
    "Politics & Power",
    "Hobbies & Crafts",
    "Desires & Kinks",
    "Alternative Outfits",
    "Underwear & Lingerie",
    "Unclothed Appearance",
    "Intimate Anatomy",
    "Turn-ons & Arousal",
    "Sexual Experience & Preferences",
    "Erotic Fantasies",
    "Tattoos & Body Art",
    "Piercings & Body Mods",
    "Grooming & Body Care",
    "Family & Kinship",
    "Childhood & Upbringing",
    "Parenting Style",
    "Siblings & Rivalry",
    "Marriage & Partnership",
    "Home Traditions & Rituals",
    "Grief & Loss",
    "Enemies & Rivals",
    "Community & Belonging",
    "Celebrations & Holidays",
    "Cooking & Food",
    "Travel & Wanderlust",
    "Occult Practice",
    "Occult Patrons & Pacts",
    "Divination & Omens",
    "Rituals & Offerings",
    "Curses & Corruption",
    "Hauntings & the Dead",
    "Magical Artifacts",
    "Astrology & Cosmic Ties",
    "Wards & Protection",
    "Prophecy & Destiny",
    "Familiars & Spirits",
    "Necromancy & Deathlore",
    "Lorebook",
    "Roleplay Behavior Examples"
  ];

  var SECTION_HINTS = [
    { h: "Name", hint: "The character's full name — plus a nickname or alias if they have one. Just the name on the line below the heading." },
    { h: "Tagline", hint: "One short, evocative line that captures who they are — like a character-select blurb." },
    { h: "Visual Description", hint: "A SHORT paragraph on what they look like: build, face, hair, eyes, skin, clothing, and one or two distinctive details. Concise and information-dense, no purple prose. Stay faithful to the image prompt." },
    { h: "Personality", hint: "ONE dense paragraph on temperament, contradictions, how their mind works, self-image vs reality, and what makes them tick. Prefer precise, evocative words and short sentences." },
    { h: "Voice & Mannerisms", hint: "How they speak and carry themselves: vocabulary, rhythm, accent, verbal tics, catchphrases, favourite expressions, their laugh, gestures, posture, eye contact, how they behave when nervous or pleased." },
    { h: "Backstory", hint: "ONE paragraph of formative history — the few events that most shaped who they are, including the wound and the lie they took from it. Concrete and specific, not a generic biography." },
    { h: "Goals, Fears & Desires", hint: "What they want most, what they are afraid of, and one desire they would never admit out loud." },
    { h: "Habits & Quirks", hint: "5-7 concrete idiosyncrasies — small telling behaviours, superstitions, rituals, odd skills, pet peeves, nervous tells." },
    { h: "Likes & Dislikes", hint: "A short list, specific rather than generic (name real dishes, songs, weather, textures, etc.)." },
    { h: "A Secret", hint: "One thing they hide from others, and why — enough to create intrigue, ideally something they'd be mortified to have revealed." },
    { h: "Relationship with {{user}}", hint: "How they regard and treat the user, what they want from them and hide from them, plus a hook that makes the first scene compelling." },
    { h: "Opening Line", hint: "One line of dialogue — the kind of thing they'd say to break the ice or set the tone." },
    { h: "Skills & Talents", hint: "What they are unusually good at, how they came by it, and exactly where their competence runs out." },
    { h: "Relationships & Allies", hint: "The 3-5 key people in their life and how the character feels about each one — including the tensions and the debts." },
    { h: "Signature Possessions", hint: "The objects they always carry and what each one means to them — one sentimental, one practical." },
    { h: "Daily Life", hint: "What an ordinary day looks like from waking to sleeping — rituals, work, meals, small pleasures and irritations." },
    { h: "Combat & Abilities", hint: "How they fight or use their powers: style, signature techniques, and the hard limits or weaknesses that can be exploited." },
    { h: "Theme & Aesthetic", hint: "The music, films, art, fashion and recurring motifs that define their vibe, and how that shows in how they carry themselves." },
    { h: "Morals & Beliefs", hint: "What they believe about right and wrong, faith, duty and the rules worth breaking — and exactly where their principles give out under pressure." },
    { h: "Home & Living Space", hint: "Where and how they live, room by room — what the space reveals about them, what they keep hidden away, and what it smells and sounds like." },
    { h: "Companions & Creatures", hint: "The pets, familiars, mounts, drones or strays in their life — names, personalities, and what each one means to the character." },
    { h: "Vices & Bad Habits", hint: "What they cannot stop doing — drink, gambling, petty theft, doomscrolling, nail-biting — and the price it quietly extracts from them." },
    { h: "Wardrobe & Style", hint: "Their signature look and what they wear for different situations — fabrics, colours, the one item they never take off, and what the clothes are hiding." },
    { h: "Reputation & Standing", hint: "How the world sees them — rumour, rank, fame or notoriety — and how far the real person differs from the legend built around them." },
    { h: "Romantic History & Intimacy", hint: "Past loves, heartbreaks and appetites, and what they want or fear from intimacy now. Match the chosen content rating when depicting anything explicit." },
    { h: "Inner Voice & Self-Talk", hint: "The running commentary in their head — how it differs from what they say aloud, what it whispers when they are scared, and the lies it quietly tells them." },
    { h: "Emotional Triggers", hint: "The things that set them off or shut them down, and the very different ways they react to each — from cold withdrawal to open fury." },
    { h: "Guilty Pleasures & Small Joys", hint: "Secret indulgences and tiny reliable delights — the things that make a bad day survivable, and which they would deny enjoying if asked." },
    { h: "First Impression", hint: "What a stranger notices in the first ten seconds — the mask they present and how it differs from who they are once comfortable." },
    { h: "Social Style", hint: "How they behave around others — in groups vs one-to-one — who they are drawn to, how they handle attention, conflict, teasing and being ignored." },
    { h: "Sense of Humour", hint: "Their comic register — dry, warm, filthy, absurd, teasing — what genuinely makes them laugh, and the line a joke crosses before it stops being funny." },
    { h: "Fears & Phobias", hint: "What frightens them on a real level — the phobia, the old dread, the fear of loss — where it comes from, how they hide it, and what happens when it corners them." },
    { h: "Sleep & Dreams", hint: "How they sleep and what haunts the night — their schedule and rituals, insomnia or nightmares, the recurring dream, and who or what they reach for in the dark." },
    { h: "Scent & Sound", hint: "The sensory things people remember about them — how they smell (soap, smoke, rain, perfume), the sound of their voice, laugh and footsteps, and the small noises they make unawares." },
    { h: "Health & Scars", hint: "Their body and mind's history — old injuries, scars, chronic pain or illness, scars they hide and stories they tell about them — and what their body remembers even when they pretend not to." },
    { h: "Education & Mentors", hint: "Where and from whom they learned what they know — schooling, apprenticeship, self-teaching — and the mentor or anti-mentor who most shaped them, for better or worse." },
    { h: "Work & Vocation", hint: "What they do for a living and how they really feel about it — the calling or the compromise, the good days and the grinding ones, and what they would rather be doing." },
    { h: "Money & Class", hint: "Their relationship with money and where they came from — how they spend, save, lend or waste it, what they can't afford, and the shame or pride attached to it." },
    { h: "Faith & Superstitions", hint: "What they believe about the unseen — faith, fate, luck, ghosts — plus the private superstitions and small rituals they would deny taking seriously." },
    { h: "Regrets & Guilt", hint: "The choices they would take back and who they let down — what they carry, how it surfaces, and the story they tell themselves in order to live with it." },
    { h: "Dreams & Aspirations", hint: "What they actually want from life — the ambition they own, the one they're embarrassed by, and the person they're quietly trying to become." },
    { h: "Politics & Power", hint: "Where they stand on authority and who should hold power — how they treat rank, laws and rebels — and the cause or line they would never cross, or would." },
    { h: "Hobbies & Crafts", hint: "What they do purely for the joy of it — a hobby, craft, game or collection — how deep the obsession goes and what it reveals about their patience, taste or need to control." },
    { h: "Desires & Kinks", hint: "What they want and how they want it — attraction, turn-ons, kinks, limits, tenderness vs roughness — and what intimacy means to them. Match the chosen content rating; only write explicit detail at 'mature' or 'explicit'." },
    { h: "Alternative Outfits", hint: "How they dress for different contexts and moods — work, formal, casual, sport, sleepwear, going out, incognito — which look is most truly them, which they hate being seen in, and how the clothes change the way they carry themselves." },
    { h: "Underwear & Lingerie", hint: "What they wear beneath their clothes — chosen for comfort, practicality, confidence or seduction — and how it changes for different occasions and company." },
    { h: "Unclothed Appearance", hint: "How they look with nothing on: their bare body — build, skin, marks, scars, tan lines, how they hold themselves — and what they are proud of or self-conscious about when undressed. Match the chosen content rating." },
    { h: "Intimate Anatomy", hint: "A frank description of their body's intimate details and sex characteristics. Keep it tasteful at lower ratings and fully explicit at 'mature' or 'explicit'. Match the chosen content rating." },
    { h: "Turn-ons & Arousal", hint: "What draws them and gets them going — the looks, words, touches, scents and situations that arouse them, how readily they show desire, and the little tells that give it away." },
    { h: "Sexual Experience & Preferences", hint: "How experienced they are, what they like and dislike in bed, how they take the lead or surrender it, and what they need to feel satisfied. Match the chosen content rating." },
    { h: "Erotic Fantasies", hint: "The private scenarios they daydream about but would rarely say aloud — including the ones that surprise or shame them, and the line they would not cross in reality. Match the chosen content rating." },
    { h: "Tattoos & Body Art", hint: "Every tattoo, brand, scarification or piece of body art — where it is, what it depicts, when and why they got it, and the pride or regret attached to it." },
    { h: "Piercings & Body Mods", hint: "Piercings, implants and other modifications — visible and hidden — what each one means to them, how others reacted when they got it, and any they removed or regret." },
    { h: "Grooming & Body Care", hint: "How they maintain their body — hair, skin, nails, teeth, scent, shaving or not — the small self-care rituals they never skip, and what they let slide when nobody is watching." },
    { h: "Family & Kinship", hint: "The full family map — parents, siblings, extended kin, in-laws, chosen family — closeness, avoided reunions, and the old retold stories." },
    { h: "Childhood & Upbringing", hint: "How they were raised — house, rules, warmth or lack of it — formative moments, and what they swore to do differently." },
    { h: "Parenting Style", hint: "How they parent (or would) — strict or lenient, present or distracted — what they kept from their own parents and what they refuse to repeat." },
    { h: "Siblings & Rivalry", hint: "Brothers, sisters, birth order and baggage — team-ups, competitions, and where things stand now." },
    { h: "Marriage & Partnership", hint: "Spouse, partner or lack of one — how they met, what holds them together, the recurring fight, and what forever looks like." },
    { h: "Home Traditions & Rituals", hint: "Household customs — holiday rituals, Sunday rules, sayings, heirloom recipes — kept, bent or quietly dropped." },
    { h: "Grief & Loss", hint: "Who they buried or lost — how they mourn, what they kept, undoing anniversaries, and whether grief softened or hardened them." },
    { h: "Enemies & Rivals", hint: "Who wants them to fail — betrayals, feuds, worthy adversaries — mutual, one-sided or secretly respectful hatred." },
    { h: "Community & Belonging", hint: "Where they fit — neighbourhood, crew, congregation, fandom, team — given and received, and where they feel outside." },
    { h: "Celebrations & Holidays", hint: "Birthdays, holidays, milestones — loved, dreaded, and the one that went famously wrong." },
    { h: "Cooking & Food", hint: "Signature dishes, comfort meals, takeout orders, dietary lines, and who they love feeding." },
    { h: "Travel & Wanderlust", hint: "Been-there and ache-to-go — best trip, worst trip, packing style, and the place that feels like home." },
    { h: "Occult Practice", hint: "The magic they practice and how they learned it — tradition, discipline, price paid for power, and what happens when they push past their limits." },
    { h: "Occult Patrons & Pacts", hint: "The powers they bargain with — gods, demons, spirits, fae — what was promised on each side, and the clause they should have read twice." },
    { h: "Divination & Omens", hint: "How they read what is coming — cards, bones, stars, entrails, dreams — how often the signs are right, and the one reading they refuse to do twice." },
    { h: "Rituals & Offerings", hint: "The rites they perform and what each one costs — candles, circles, sacrifices large and small — plus the ritual they perform perfectly and the one that always goes wrong." },
    { h: "Curses & Corruption", hint: "The curses they carry or cast — who laid them, what feeds them, how the corruption shows — and whether they are seeking a cure, revenge, or more power." },
    { h: "Hauntings & the Dead", hint: "The dead who will not leave them alone — ghosts, echoes, ancestors — why each one lingers, what it wants, and which one they secretly like having around." },
    { h: "Magical Artifacts", hint: "The enchanted objects in their keeping — where each came from, what it does, what it demands, and the one they should never have picked up." },
    { h: "Astrology & Cosmic Ties", hint: "Their ties to the stars and the dark between them — birth chart, patron constellation, cosmic debts — and the alignment they are waiting for, or dreading." },
    { h: "Wards & Protection", hint: "How they keep the unseen out — salt lines, charms, iron, true names, locked doors — what they are protected against, and the one thing their wards cannot stop." },
    { h: "Prophecy & Destiny", hint: "The fate hanging over them — the prophecy with their name in it, who spoke it, what it demands, and whether they are running toward it, from it, or trying to cheat it." },
    { h: "Familiars & Spirits", hint: "The entities bound or bonded to them — familiars, guides, parasites — what each one is, what the bond costs both sides, and what happens if the bond breaks." },
    { h: "Necromancy & Deathlore", hint: "Their traffic with death — raising, speaking with, or laying the dead, what the grave has taught them, and the line they will not cross even for power." },
    { h: "Lorebook", hint: "World info linked from the lorebook manager — ## entries with Keys: lines. Kept as-is; edit it in the lorebook card or delete entries from the section tools." },
    { h: "Roleplay Behavior Examples", hint: "Numbered, self-contained moments from an imagined story, each revealing a different facet of who they are. Use *asterisks for actions* and \"quotes for speech\". Vary the situations widely — cover being relaxed, challenged, amused, vulnerable, wanting something, cornered, tender, angry, clever and caught off guard. Never reuse the same scene twice." }
  ];

  // ---- custom post-hoc sections ------------------------------------------------
  // A user can add a section that isn't in the built-in list (e.g. "Sexual
  // History") to an already-finished character. Registered headings are spliced
  // into CANON (so the tolerant parser recognises them and buildPersona keeps
  // them in order) and into SECTION_HINTS with a generic hint, and are persisted
  // so a later reload still parses them.
  var CUSTOM_HEADINGS_KEY = "t2i_persona_custom_headings";
  function normalizeHeading(h) {
    // keep only characters canonicalOf() preserves, so an exact match always works
    return String(h == null ? "" : h).replace(/[^A-Za-z&,\s-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  }
  window.t2i_registerPersonaHeading = function (heading, hint) {
    var raw = String(heading == null ? "" : heading).replace(/\s+/g, " ").trim();
    if (!raw) return "";
    // already a known heading (exact, so "Relationship with {{user}}" survives)?
    for (var i = 0; i < CANON.length; i++) if (CANON[i].toLowerCase() === raw.toLowerCase()) return CANON[i];
    var h = normalizeHeading(raw);
    if (!h) return "";
    for (var i2 = 0; i2 < CANON.length; i2++) if (CANON[i2].toLowerCase() === h.toLowerCase()) return CANON[i2];
    var rp = CANON.indexOf("Roleplay Behavior Examples");
    if (rp < 0) rp = CANON.length;
    CANON.splice(rp, 0, h);
    var rp2 = -1;
    for (var j = 0; j < SECTION_HINTS.length; j++) if (SECTION_HINTS[j].h === "Roleplay Behavior Examples") { rp2 = j; break; }
    var entry = { h: h, hint: String(hint || "").trim() || "Write this section for the character, consistent in voice and detail with the rest of the profile." };
    if (rp2 >= 0) SECTION_HINTS.splice(rp2, 0, entry); else SECTION_HINTS.push(entry);
    try {
      var arr = [];
      try { arr = JSON.parse(localStorage.getItem(CUSTOM_HEADINGS_KEY) || "[]"); } catch (e) { arr = []; }
      if (!Array.isArray(arr)) arr = [];
      if (arr.indexOf(h) < 0) { arr.push(h); localStorage.setItem(CUSTOM_HEADINGS_KEY, JSON.stringify(arr)); }
    } catch (e) {}
    return h;
  };
  // re-register persisted custom headings on load
  try {
    var __customHeads = JSON.parse(localStorage.getItem(CUSTOM_HEADINGS_KEY) || "[]");
    if (Array.isArray(__customHeads)) for (var __ch = 0; __ch < __customHeads.length; __ch++) window.t2i_registerPersonaHeading(__customHeads[__ch]);
  } catch (e) {}

  // ---- surgical section editing (raw-preserving) -------------------------------
  // Rewriting/adding ONE section must not disturb the rest of the character:
  // imported cards carry extra blocks (a title, "# Roleplay Guidelines", a
  // "Reminder Message", etc.) that the tolerant parser doesn't recognise, so
  // rebuilding the whole description from parsed sections would silently drop
  // them. These helpers split the text into ordered blocks on heading lines and
  // replace/insert just the target block, leaving every other byte untouched.
  function canonKeyOf(heading) {
    var c = canonicalOf(heading);
    return (c || String(heading == null ? "" : heading).trim()).toLowerCase();
  }
  // -> { lines, blocks[{headLine|null, canon, headPrefix, bodyStart, bodyEnd}] }
  // Lorebook-aware: ## entry headings (and the "# <book name>" title line)
  // inside a Lorebook section are CONTENT, not new blocks — otherwise deleting
  // or replacing the Lorebook section would leave orphaned entries behind.
  function personaBlocks(full) {
    var lines = String(full == null ? "" : full).split("\n");
    var blocks = [{ headLine: null, canon: "", headPrefix: null, bodyStart: 0, bodyEnd: lines.length }];
    var cur = blocks[0];
    var inLore = false;
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^(#{1,4})\s*(.+?)\s*$/);
      if (!m) continue;
     var raw = m[2];
     var ci = raw.indexOf(":");
     var head = (ci >= 0 ? raw.slice(0, ci) : raw).trim();
     var canon = canonicalOf(head);
      // Lore entry headings (## or deeper, plus the "# <book name>" title line)
      // are body text, not a split — even when an entry title canonicalizes to
      // a known section name (e.g. convert-format "## Grooming & Body Care · 1"
      // entries would otherwise splinter the Lorebook into phantom sections,
      // orphaning entries on replace/remove and exploding section listings).
      if (inLore && (m[1].length >= 2 || !canon)) continue;
      var hIdx = lines[i].indexOf(":");
      cur.bodyEnd = i;
      cur = {
        headLine: lines[i],
        canon: canon || head,
        headPrefix: hIdx >= 0 ? lines[i].slice(0, hIdx + 1) : lines[i] + ":",
        bodyStart: i + 1,
        bodyEnd: lines.length
      };
      blocks.push(cur);
      inLore = (canon === "Lorebook");
    }
    return { lines: lines, blocks: blocks };
  }
  function emitBlocks(lines, blocks, target, replacement) {
    var out = [], done = false;
    for (var b = 0; b < blocks.length; b++) {
      var blk = blocks[b];
      if (blk.headLine === null) {
        for (var j = blk.bodyStart; j < blk.bodyEnd; j++) out.push(lines[j]);
        continue;
      }
      if (!done && replacement !== null && blk.canon.toLowerCase() === target) {
        for (var r = 0; r < replacement.length; r++) out.push(replacement[r]);
        done = true;
        continue;
      }
      out.push(blk.headLine);
      for (var j2 = blk.bodyStart; j2 < blk.bodyEnd; j2++) out.push(lines[j2]);
    }
    return { text: out.join("\n"), done: done };
  }
  // Replace only the target section's block. Returns the new full text, or null
  // if no block matched (caller should then ADD it).
  window.t2i_replacePersonaSection = function (full, heading, content) {
    var target = canonKeyOf(heading);
    var p = personaBlocks(full);
    var lines = String(content == null ? "" : content).split("\n");
    var res = null;
    for (var b = 1; b < p.blocks.length; b++) {
      var blk = p.blocks[b];
      if (blk.canon.toLowerCase() !== target) continue;
      // keep the blank line(s) that separated this block from the next one
      var body = p.lines.slice(blk.bodyStart, blk.bodyEnd);
      var tail = [];
      for (var t = body.length - 1; t >= 0; t--) { if (/^\s*$/.test(body[t])) tail.unshift(body[t]); else break; }
      if (!tail.length) tail = [""];
      res = emitBlocks(p.lines, p.blocks, target, [blk.headPrefix].concat(lines).concat(tail));
      break;
    }
    return res && res.done ? res.text : null;
  };
  // Insert a brand-new section block just before "# Roleplay Behavior Examples"
  // when present (so examples stay last), else append at the end.
  window.t2i_addPersonaSection = function (full, heading, content) {
    var key = canonKeyOf("Roleplay Behavior Examples");
    var p = personaBlocks(full);
    var contentLines = String(content == null ? "" : content).split("\n");
    var newBlock = ["# {{char}} " + heading + ":"].concat(contentLines).concat([""]);
    // emitBlocks replaces the matched block, so to INSERT before the examples
    // block we hand it the new block followed by the examples block untouched.
    for (var b = 1; b < p.blocks.length; b++) {
      var blk = p.blocks[b];
      if (blk.canon.toLowerCase() !== key) continue;
      var keep = [blk.headLine].concat(p.lines.slice(blk.bodyStart, blk.bodyEnd));
      var res = emitBlocks(p.lines, p.blocks, key, newBlock.concat(keep));
      if (res.done) return res.text;
      break;
    }
    var text = (full == null ? "" : String(full)).replace(/\s+$/, "");
    return text + (text ? "\n\n\n" : "") + "# {{char}} " + heading + ":\n" + String(content == null ? "" : content);
  };
  // Remove one section's block, preserving every other byte. Returns the new
  // full text, or null if no block matched. Collapses the leftover blank
  // lines so no double gap remains where the section was.
  window.t2i_removePersonaSection = function (full, heading) {
    var target = canonKeyOf(heading);
    var p = personaBlocks(full);
    var found = false;
    for (var b = 1; b < p.blocks.length; b++) {
      if (p.blocks[b].canon.toLowerCase() === target) { found = true; break; }
    }
    if (!found) return null;
    var out = [];
    for (var b2 = 0; b2 < p.blocks.length; b2++) {
      var blk = p.blocks[b2];
      if (blk.headLine === null) {
        for (var j = blk.bodyStart; j < blk.bodyEnd; j++) out.push(p.lines[j]);
        continue;
      }
      if (blk.canon.toLowerCase() === target) continue;
      out.push(blk.headLine);
      for (var j2 = blk.bodyStart; j2 < blk.bodyEnd; j2++) out.push(p.lines[j2]);
    }
    var t = out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\s+/, "").replace(/\s+$/, "");
    return t;
  };
  // Ordered (raw-text) section listing: same content set as t2i_parsePersona().sections
  // but in the order the blocks actually appear in the text. t2i_parsePersona rebuilds
  // in CANON order, so this is the helper to use wherever order is user-visible or
  // chat-relevant (section list, ↑↓ reorder, chat packing — the chats keep the START
  // of the text, so raw order is what survives truncation). Non-canonical import
  // blocks (preamble, \"# Roleplay Guidelines\", ...) are skipped, as in the parser.
  window.t2i_orderedPersonaSections = function (full) {
    var parsed = [];
    try { parsed = (window.t2i_parsePersona(full) || {}).sections || []; } catch (e) { parsed = []; }
    if (!parsed.length) return [];
    var byKey = {};
    for (var i = 0; i < parsed.length; i++) {
      var k = canonKeyOf(parsed[i].heading);
      if (byKey[k] == null) byKey[k] = parsed[i];
    }
    var p = personaBlocks(full);
    var seen = {}, out = [];
    for (var b = 1; b < p.blocks.length; b++) {
      var key = String(p.blocks[b].canon || "").toLowerCase();
      if (byKey[key] != null && !seen[key]) { seen[key] = true; out.push(byKey[key]); }
    }
    // Any parsed section with no raw block (shouldn't happen) keeps its place at the end.
    for (var j = 0; j < parsed.length; j++) {
      var k2 = canonKeyOf(parsed[j].heading);
      if (!seen[k2]) { seen[k2] = true; out.push(parsed[j]); }
    }
    return out;
  };
  // Move one section's block past its nearest LISTED neighbour (dir -1 up, +1 down)
  // by swapping the two blocks' line ranges — every other byte (preamble,
  // non-canonical import blocks, blank-line separators, which travel with their
  // block) stays exactly where it was. Returns the new full text, or null when
  // the section is already first/last or absent.
  window.t2i_movePersonaSection = function (full, heading, dir) {
    var target = canonKeyOf(heading);
    var step = dir < 0 ? -1 : 1;
    var p = personaBlocks(full);
    var parsed = [];
    try { parsed = (window.t2i_parsePersona(full) || {}).sections || []; } catch (e) { parsed = []; }
    var listed = {};
    for (var i = 0; i < parsed.length; i++) listed[canonKeyOf(parsed[i].heading)] = true;
    var idxs = [];
    for (var b = 1; b < p.blocks.length; b++) {
      if (listed[String(p.blocks[b].canon || "").toLowerCase()]) idxs.push(b);
    }
    var at = -1;
    for (var q = 0; q < idxs.length; q++) {
      if (String(p.blocks[idxs[q]].canon || "").toLowerCase() === target) { at = q; break; }
    }
    if (at < 0 || at + step < 0 || at + step >= idxs.length) return null;
    var A = p.blocks[idxs[at]], B = p.blocks[idxs[at + step]];
    // Blocks partition the line array contiguously: a headed block covers
    // [headIdx, bodyEnd), so locate each block's head line index.
    function headIdx(blk) { return blk.bodyStart - 1; }
    var a0 = headIdx(A), a1 = A.bodyEnd, b0 = headIdx(B), b1 = B.bodyEnd;
    if (!(a0 < a1 && a1 <= b0 && b0 < b1) && !(b0 < b1 && b1 <= a0 && a0 < a1)) return null;
    var lo0, lo1, mid0, mid1, hi0, hi1;
    if (a0 < b0) { lo0 = a0; lo1 = a1; mid0 = a1; mid1 = b0; hi0 = b0; hi1 = b1; }
    else { lo0 = b0; lo1 = b1; mid0 = b1; mid1 = a0; hi0 = a0; hi1 = a1; }
    var out = p.lines.slice(0, lo0)
      .concat(p.lines.slice(hi0, hi1))
      .concat(p.lines.slice(mid0, mid1))
      .concat(p.lines.slice(lo0, lo1))
      .concat(p.lines.slice(hi1));
    return out.join("\n");
  };

  function sectionBlock(heads) {
    var out = [];
    for (var i = 0; i < SECTION_HINTS.length; i++) {
      var s = SECTION_HINTS[i];
      if (heads.indexOf(s.h) < 0) continue;
      out.push("# " + s.h + ":\n(" + s.hint + ")");
    }
    return out.join("\n\n");
  }

  function templateHeads(extras) {
    var heads = ["Name", "Tagline", "Visual Description", "Personality", "Voice & Mannerisms", "Backstory", "Goals, Fears & Desires", "Habits & Quirks", "Likes & Dislikes", "A Secret", "Relationship with {{user}}", "Opening Line"];
    for (var i = 0; i < (extras || []).length; i++) heads.push(extras[i]);
    heads.push("Roleplay Behavior Examples");
    return heads;
  }

  // ---- wildcard sparks ------------------------------------------------------
  // One-line contradictory traits for the 🎲 Roll button in 🎛️ Character
  // options and the 🎲 Surprise-me flow. Each spark is deliberately a small
  // contradiction or oddity — the kind of detail that makes a character feel
  // like a person instead of a trait list. Setting-neutral on purpose.
  var WILDCARDS = [
    "Collects other people's discarded grocery lists and invents lives for them",
    "Afraid of birds but volunteers weekends at a dovecote",
    "An ex-choir singer who now only sings to their plants",
    "Keeps a meticulously organised toolbox they barely know how to use",
    "Writes angry letters they never send — hundreds of them, filed by year",
    "A fearsome negotiator who cries at dog-food commercials",
    "Counts stairs everywhere they go but pretends they don't",
    "Still carries their childhood library card in their wallet",
    "A brilliant cook who is genuinely terrible at boiling eggs",
    "Memorises the names of every bus driver on their route",
    "Keeps a rescue insect hospital in jam jars on the windowsill",
    "A night owl forcing themselves into dawn runs they secretly love",
    "Apologises to furniture when they bump into it",
    "Has a nemesis at the local pub quiz and takes it far too seriously",
    "Presses wildflowers inside heavy reference books",
    "A skeptic who knocks on wood — twice, every time, just in case",
    "Learns one word of a new language every day and uses it relentlessly",
    "Keeps every cinema ticket stub since they were twelve",
    "A former chess prodigy who now only plays to lose beautifully",
    "Talks to their sourdough starter like a colleague",
    "Afraid of the dark but works the night shift by choice",
    "Collects hotel soaps they will never use",
    "A marathon runner with a secret parking ticket collection",
    "Names their houseplants after ex-lovers",
    "A locksmith who has locked themselves out four times this year",
    "Keeps a notebook of overheard compliments about strangers",
    "An insomniac astronomer who naps through every meteor shower",
    "Repairs broken umbrellas they find abandoned on trains",
    "A retired daredevil who now irons their socks",
    "Feeds the same stray cat they claim not to like",
    "Has never finished a book but owns three hundred",
    "A lifeguard who is quietly terrified of deep water",
    "Sends postcards to themselves from every trip",
    "A barista who can't stand the smell of coffee",
    "Mends strangers' torn coats without being asked",
    "A tour guide who gets lost in their own neighbourhood",
    "Keeps a jar of sea glass sorted by imagined backstory",
    "A blacksmith who writes delicate poetry in the margins of invoices"
  ];
  window.t2i_personaWildcards = WILDCARDS;
  window.t2i_personaWildcard = function () {
    try { return WILDCARDS[Math.floor(Math.random() * WILDCARDS.length)]; } catch (e) { return ""; }
  };

 function optionsBlock(opts) {
   var lines = [];
   if (opts.name) lines.push("- The character's name MUST be exactly \"" + opts.name + "\" — never change, shorten or translate it.");
    if (opts.age && String(opts.age).trim()) {
      var ageTxt = String(opts.age).replace(/\s+/g, " ").trim().slice(0, 80);
      if (/^\d{1,3}$/.test(ageTxt)) ageTxt = ageTxt + " years old";
      lines.push("- The character's age MUST be exactly " + ageTxt + " — write every age reference, life stage, appearance detail, backstory date and behaviour to match this age, never change it or make them read as a different age.");
    } else if (opts.ageAmbiguous) {
      lines.push("- The character's age is deliberately ambiguous — do not give them a specific age or birth year, keep every age reference, life stage and appearance detail hard to place, and never let them read as clearly a child or clearly elderly.");
    }
   var g = genderHint(opts.gender); if (g) lines.push("- Gender: " + g);
    var oc = occultHint(opts.occultType); if (oc) lines.push("- Occult type: " + oc);
    if (opts.pronouns) lines.push("- Use these pronouns for the character throughout: " + opts.pronouns + ".");
    // Genre / setting is public — every caller gets these brief lines.
    if (opts.genre && !/^\(/.test(opts.genre)) lines.push("- Genre / setting: " + opts.genre + ". Let this world shape their vocabulary, skills, fears and assumptions — without turning them into a genre cliché.");
    if (opts.genreMix && !/^\(/.test(opts.genreMix) && opts.genreMix !== opts.genre) {
      var mixBase = (opts.genre && !/^\(/.test(opts.genre)) ? opts.genre : "the story";
      var md = mergeDef(opts.mergeStyle);
      var mixText = md.hint ? md.hint.split("{mix}").join(opts.genreMix).split("{base}").join(mixBase)
        : "blend " + opts.genreMix + " into " + mixBase + " in whatever way suits the character best — use your judgement on the balance.";
      lines.push("- Genre / setting mix (" + opts.genreMix + " × " + mixBase + (md.hint ? " — " + md.label.replace(/^[^A-Za-z0-9]+/, "") : "") + "): " + mixText);
    }
    var rel = opts.relationshipCustom ? String(opts.relationshipCustom).trim() : relationHint(opts.relationship);
    if (rel) lines.push("- Relationship to {{user}}: " + rel);
    var ra = ratingHint(effectiveRating(opts)); if (ra) lines.push("- Content rating: " + ra);
    if (opts.language && !/^english$/i.test(String(opts.language).trim())) lines.push("- LANGUAGE: write ALL section content and all roleplay examples in " + opts.language + ". Keep the section HEADINGS in English exactly as written in the template so the structure still matches.");
    if (opts.avoid) lines.push("- Avoid these things entirely (do not include them at all): " + String(opts.avoid).replace(/\s+/g, " ").trim() + ".");
    if (opts.flaw) lines.push("- Fatal flaw: " + String(opts.flaw).replace(/\s+/g, " ").trim() + ". This flaw must genuinely cost them — let it complicate their choices and relationships, not sit as decoration.");
    if (opts.contradiction) lines.push("- Core contradiction: " + String(opts.contradiction).replace(/\s+/g, " ").trim() + ". Both sides of this are true at once; let the tension between them show in how they act.");
    if (opts.want || opts.need) {
      var wn = [];
      if (opts.want) wn.push("consciously wants " + String(opts.want).replace(/\s+/g, " ").trim());
      if (opts.need) wn.push("unconsciously needs " + String(opts.need).replace(/\s+/g, " ").trim());
      lines.push("- Want vs. need: the character " + wn.join(" but ") + ". Let the gap between the two drive their choices and mistakes.");
    }
    if (opts.secret) {
      var sec = "- They are hiding this secret: " + String(opts.secret).replace(/\s+/g, " ").trim() + ".";
      if (opts.secretFrom) sec += " They are hiding it from " + String(opts.secretFrom).replace(/\s+/g, " ").trim() + ".";
      sec += " Guard it the way a real person would — it leaks into behaviour, never into exposition.";
      lines.push(sec);
    }
    if (opts.pressure) lines.push("- Pressure: " + String(opts.pressure).replace(/\s+/g, " ").trim() + ". Something is genuinely at stake — let urgency and consequence sharpen their decisions.");
    if (opts.wildcard) lines.push("- Wild spark (weave it in as a lived-in detail, not a gag): " + String(opts.wildcard).replace(/\s+/g, " ").trim() + ".");
    if (opts.depth && depthDef(opts.depth).id !== "balanced") lines.push("- Overall depth: " + depthDef(opts.depth).label.replace(/^[^A-Za-z]+/, "") + ".");
    if (!lines.length) return "";
    return "CHARACTER BRIEF — the user's settings for this character. Honour every one of these:\n" + lines.join("\n");
  }

  // The builder returns the SHARED prompt prefix, byte-identical for every pass
  // (so the server's prefix cache makes the later passes fast). The per-pass task
  // is appended by `runPersonaGeneration`.
  window.t2i_buildPersonaInstruction = function (opts) {
    opts = opts || {};
    var imagePrompt = String(opts.imagePrompt || "").replace(/\s+/g, " ").trim();
    var extra = String(opts.instruction || "").trim();
    // 🔒 Owner-only tones (see OWNER_ONLY_TONES) are dropped for public
    // callers — a locked tone id smuggled via presets / share links /
    // localStorage / console simply produces no TONE DIRECTION line.
    var toneLockedOut = !window.t2i_ownerAuthed();
    function toneHintAllowed(id) {
      if (!id) return "";
      if (toneLockedOut && window.t2i_toneOwnerOnly(id)) return "";
      return toneHint(id);
    }
    var th = toneHintAllowed(opts.tone);
    var exN = normalizeExampleCount(opts.exampleCount);
    var extras = sanitizeExtras(opts.extraSections);
    var plan = passes(exN, extras).list;
    var parts = [];
    if (imagePrompt) {
      parts.push("TASK: You are an award-winning character writer. A character image was generated from the prompt below. Invent a vivid, memorable, three-dimensional character inspired by that image. The image tells you how they look; everything else is yours to invent. Do not describe the image as an image — write the character as a person.");
    } else {
      parts.push("TASK: You are an award-winning character writer. Invent a completely new, vivid, memorable, three-dimensional character from the brief below. Nothing about them is fixed except what the brief explicitly says — everything else is yours to invent.");
    }
    if (th) parts.push("TONE DIRECTION: " + th);
    // Optional second voice, merged like the genre mix: the tone-merge style's
    // {mix}/{base} template is filled with the cleaned tone names, then the mix
    // tone's own direction paragraph follows so the model hears both voices.
    var toneMixId = (opts.toneMix && opts.toneMix !== opts.tone) ? opts.toneMix : "";
    var toneMixHint = toneMixId ? toneHintAllowed(toneMixId) : "";
    if (toneMixHint) {
      var toneBase = toneById(opts.tone), toneMixEntry = toneById(toneMixId);
      var toneBaseName = (toneBase && opts.tone !== "auto") ? String(toneBase.label || opts.tone).replace(/^[^A-Za-z0-9]+/, "") : "the character";
      var toneMixName = String((toneMixEntry && toneMixEntry.label) || toneMixId).replace(/^[^A-Za-z0-9]+/, "");
      var tmd = mergeDef(opts.toneMergeStyle);
      var toneMixText = tmd.hint ? tmd.hint.split("{mix}").join(toneMixName).split("{base}").join(toneBaseName)
        : "blend " + toneMixName + " into " + toneBaseName + " in whatever way suits the character best — use your judgement on the balance.";
      parts.push("TONE MIX (" + toneMixName + " × " + toneBaseName + (tmd.hint ? " — " + String(tmd.label || "").replace(/^[^A-Za-z0-9]+/, "") : "") + "): " + toneMixText + " " + (th ? "Second" : "Voice") + " direction: " + toneMixHint);
    }
    parts.push(GUIDELINES);
    if (opts.lively) parts.push("LIVELINESS BOOST: Push the character's energy, wit and expressiveness up a notch. Give them strong opinions, playful banter, vivid reactions and memorable turns of phrase. Keep them believable, but unmistakably alive.");
    var ob = optionsBlock(opts);
    if (ob) parts.push(ob);
    if (imagePrompt) parts.push("--- START OF IMAGE PROMPT ---\n" + imagePrompt + "\n--- END OF IMAGE PROMPT ---");
    if (extra) parts.push("The character MUST also satisfy this request from the user: " + extra);
    var planLines = [];
    for (var pi = 0; pi < plan.length; pi++) planLines.push((pi + 1) + ") " + plan[pi].label);
    parts.push("The finished character is written in " + plan.length + " parts, in this order:\n" + planLines.join("  ") + ".\nYou will be told which part to write each time. Here is the full template for the finished character — keep every heading exactly as written:\n\n<response_template>\n" + sectionBlock(templateHeads(extras)) + "\n</response_template>");
    return parts.join("\n\n");
  };

  // ---- tolerant section parsing ------------------------------------------------
  function canonicalOf(heading) {
    var s = String(heading || "").toLowerCase().replace(/[{}]/g, " ").replace(/[^a-z&,\s-]/g, " ").replace(/\s+/g, " ").trim();
    // headings in the finished description are written as "{{char}} Heading" — drop that prefix
    s = s.replace(/^char\s+/, "").trim();
    if (!s) return null;
    for (var i = 0; i < CANON.length; i++) if (s === CANON[i].toLowerCase()) return CANON[i];
    var rules = [
      [/^alternative|^outfit/, "Alternative Outfits"],
      [/^underwear|^lingerie|^intimates|^underthings/, "Underwear & Lingerie"],
      [/^unclothed|^nude\b|^naked|^undressed|^without clothes/, "Unclothed Appearance"],
      [/^intimate|^anatomy|^genital/, "Intimate Anatomy"],
      [/^turn[\s-]?ons?|^arousal|^what arouses/, "Turn-ons & Arousal"],
      [/^sexual|^sex\b/, "Sexual Experience & Preferences"],
      [/^erotic|^fantas/, "Erotic Fantasies"],
      [/^tattoo|^body art/, "Tattoos & Body Art"],
      [/^pierc|^body mod/, "Piercings & Body Mods"],
      [/^grooming|^body care|^self-?care|^hygiene/, "Grooming & Body Care"],
      [/^first impression|^impression/, "First Impression"],
      [/^social style/, "Social Style"],
      [/^humou?r/, "Sense of Humour"],
      [/^fears?\b|^phobia/, "Fears & Phobias"],
      [/^dreams? (?:of|&|and)|^aspiration|^ambition/, "Dreams & Aspirations"],
      [/^sleep\b|^dreams?\b|^nightmare/, "Sleep & Dreams"],
      [/^scent|^smell|^sound\b/, "Scent & Sound"],
      [/^health|^scars?\b|^ailment/, "Health & Scars"],
      [/^education|^mentor/, "Education & Mentors"],
      [/^work\b|^vocation|^career|^job\b/, "Work & Vocation"],
      [/^money|^wealth|^class\b/, "Money & Class"],
      [/^faith|^religio|^superstitio/, "Faith & Superstitions"],
      [/^regrets?\b|^guilt/, "Regrets & Guilt"],
      [/^politic|^power\b|^authority/, "Politics & Power"],
      [/^hobbies|^crafts?\b|^pastime/, "Hobbies & Crafts"],
      [/^desires?\b|^kinks?\b|^turn-?ons?/, "Desires & Kinks"],
      [/^name\b/, "Name"],
      [/^tagline/, "Tagline"],
      [/^visual/, "Visual Description"],
      [/^personality/, "Personality"],
      [/^voice|^mannerism/, "Voice & Mannerisms"],
      [/^backstory|^background|^history/, "Backstory"],
      [/^goal|^fear|^desire/, "Goals, Fears & Desires"],
      [/^habit|^quirk/, "Habits & Quirks"],
      [/^like|^dislike/, "Likes & Dislikes"],
      [/^secret/, "A Secret"],
      [/^relationships\b|^allies/, "Relationships & Allies"],
      [/^relationship/, "Relationship with {{user}}"],
      [/^opening|^first line/, "Opening Line"],
      [/^skills?\b|^talents?\b/, "Skills & Talents"],
      [/^signature|^possess|^belonging|^gear\b/, "Signature Possessions"],
      [/^daily|^typical day|^a day in/, "Daily Life"],
      [/^combat|^abilit|^powers|^fighting|^weapons/, "Combat & Abilities"],
      [/^theme|^aesthetic|^vibe|^style &/, "Theme & Aesthetic"],
      [/^lorebook|^world ?info|^worldinfo/, "Lorebook"],
      [/^roleplay|^behavio|^example/, "Roleplay Behavior Examples"]
    ];
    for (var r = 0; r < rules.length; r++) if (rules[r][0].test(s)) return rules[r][1];
    // tolerant partial match while streaming (e.g. "# Personalit")
    for (var c = 0; c < CANON.length; c++) {
      var cn = CANON[c].toLowerCase().replace(/[{}]/g, " ");
      if (s.length >= 5 && (cn.indexOf(s) === 0 || s.indexOf(cn) === 0)) return CANON[c];
    }
    return null;
  }

  // Parse a chunk of text into {canonicalHeading: content}. Headings not in the
  // canonical set are ignored (so leaked extra sections never pollute the output) —
  // except inside a Lorebook section, where ## entry headings (and the "# <book
  // name>" title line) are content, not section boundaries — even when an entry
  // title canonicalizes to a known section name (e.g. convert-format
  // "## Grooming & Body Care · 1" must not become a phantom section).
  function extractSections(text) {
    var lines = String(text == null ? "" : text).split("\n");
    var map = {};
    var cur = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var m = line.match(/^#{1,4}\s*(.+?)\s*$/);
      if (m) {
        if (cur === "Lorebook" && /^#{2,4}\s/.test(line)) {
          map[cur] = (map[cur] ? map[cur] + "\n" : "") + line;
          continue;
        }
        var raw = m[1];
        var ci = raw.indexOf(":");
        var head = (ci >= 0 ? raw.slice(0, ci) : raw).trim();
        var inline = ci >= 0 ? raw.slice(ci + 1).trim() : "";
        var next = canonicalOf(head);
        if (next) {
          cur = next;
          if (map[cur] == null) map[cur] = inline;
        } else if (cur === "Lorebook") {
          map[cur] = (map[cur] ? map[cur] + "\n" : "") + line;
        } else {
          cur = null;
        }
        continue;
      }
      if (cur) map[cur] = (map[cur] ? map[cur] + "\n" : "") + line;
    }
    for (var k in map) map[k] = map[k].replace(/^\s+|\s+$/g, "");
    return map;
  }

  function extractExamples(text, cap) {
    var t = String(text == null ? "" : text).replace(/^#+\s*[^\n]*\n/, "");
    var lines = t.split("\n");
    var items = [];
    var cur = null;
    var sawNum = false;
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^\s*(\*\*)?\s*(\d{1,2})\s*[.)]\s*(\*\*)?\s*(.*)$/);
      if (m) {
        sawNum = true;
        if (cur !== null) items.push(cur.trim());
        cur = (m[1] && !m[3]) || (!m[1] && m[3]) ? (m[3] ? "**" : "") + m[4] : m[4];
      } else if (cur !== null) {
        cur += "\n" + lines[i];
      }
    }
    if (cur !== null) items.push(cur.trim());
    if (!sawNum) items = t.split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    items = items.map(function (s) { return s.replace(/\s+$/g, ""); }).filter(Boolean);
    return items.slice(0, cap || EXAMPLE_COUNT);
  }

  function cleanName(s) {
    var n = String(s == null ? "" : s).split("\n")[0].replace(/^\s+|\s+$/g, "");
    n = n.replace(/^[*_"\u201c\u2018]+|[*_"\u201d\u2019]+$/g, "").replace(/^(name|full name)\s*[:\-]\s*/i, "").trim();
    if (!n || /^\(.*\)$/.test(n)) return "";
    return n.slice(0, 80);
  }

  function mergeInto(dst, src) {
    if (!src) return;
    for (var k in src) if (src[k] && src[k].replace(/\s/g, "")) dst[k] = src[k];
  }

  function buildPersona(name, results, exampleCap) {
    var map = {};
    mergeInto(map, results.identity);
    mergeInto(map, results.depth);
    mergeInto(map, results.extras);
    var cap = normalizeExampleCount(exampleCap || EXAMPLE_COUNT);
    var ex = [].concat(results.examples1 || [], results.examples2 || []).slice(0, cap);
    if (ex.length) {
      map["Roleplay Behavior Examples"] = ex.map(function (s, i) { return (i + 1) + ". " + s; }).join("\n\n");
    }
    var out = [];
    for (var i = 0; i < CANON.length; i++) {
      var h = CANON[i];
      if (h === "Name") continue;
      var c = map[h];
      if (c && c.trim()) out.push({ heading: h, content: c.trim() });
    }
    var desc = out.map(function (s) { return "# {{char}} " + s.heading + ":\n" + s.content; }).join("\n\n\n");
    return { name: name || "", description: desc, sections: out };
  }

  // Parse a complete persona text (used for the public API and for one-shot text).
  window.t2i_parsePersona = function (full) {
    var map = extractSections(full);
    var name = cleanName(map["Name"] || "");
    var ex = map["Roleplay Behavior Examples"] ? extractExamples(map["Roleplay Behavior Examples"], 24) : [];
    return buildPersona(name, { identity: map, depth: {}, extras: {}, examples1: ex, examples2: [] }, ex.length || EXAMPLE_COUNT);
  };

  // ---- multi-pass generation ---------------------------------------------------
  // `exampleCount` and `extraSections` are per-generation, so the pass list (and
  // its numbering shown to the model) adapts. The shared prefix still lists the
  // exact same plan, so it stays byte-identical across every pass.
  function passes(exampleCount, extraSections) {
    var n = normalizeExampleCount(exampleCount);
    var half = Math.ceil(n / 2);
    var extras = sanitizeExtras(extraSections);
    var list = [
      {
        key: "identity", kind: "identity", label: "core identity (name → voice)",
        heads: ["Name", "Tagline", "Visual Description", "Personality", "Voice & Mannerisms"],
        start: "# Name:",
        stop: ["# Backstory", "# END"]
      },
      {
        key: "depth", kind: "depth", label: "history & inner life",
        heads: ["Backstory", "Goals, Fears & Desires", "Habits & Quirks", "Likes & Dislikes", "A Secret", "Relationship with {{user}}", "Opening Line"],
        start: "# Backstory:",
        stop: ["# Roleplay", "# END"]
      }
    ];
    if (extras.length) {
      // One pass PER extra section. A single shared pass forced every extra into
      // one word budget, so large extra sets came back thin, repetitive, or padded
      // with dialogue — each section gets its own focused call and word target.
      for (var xi = 0; xi < extras.length; xi++) {
        list.push({
          key: "extras" + xi, kind: "extras", head: extras[xi],
          label: "extra: " + extras[xi],
          heads: [extras[xi]],
          start: "# " + extras[xi] + ":",
          stop: ["# Roleplay", "# END"]
        });
      }
    }
    list.push({
      key: "examples1", kind: "examples", label: "roleplay examples 1-" + half,
      examples: true, count: half, from: 1, to: half,
      start: "# Roleplay Behavior Examples:",
      stop: ["# END"]
    });
    list.push({
      key: "examples2", kind: "examples", label: "roleplay examples " + (half + 1) + "-" + n,
      examples: true, count: n - half, from: half + 1, to: n,
      start: "# Roleplay Behavior Examples:",
      stop: ["# END"]
    });
    return { list: list, exampleCount: n, extras: extras };
  }

  function passTarget(kind, depthId, count, single) {
    var d = depthDef(depthId);
    if (kind === "examples") return "Roughly " + (d.exLow * count) + "-" + (d.exHigh * count) + " words for this part.";
    var band = d[kind] || d.depth;
    if (single) {
      // One section on its own: a share of the whole-part band. Without this a
      // single rewrite/add inherits the multi-section budget (e.g. 500-700 words
      // for one "Likes & Dislikes") and pads it with repetition and dialogue.
      var lo = Math.max(80, Math.round(band[0] / 3 / 10) * 10);
      var hi = Math.max(150, Math.round(band[1] / 3 / 10) * 10);
      return "Roughly " + lo + "-" + hi + " words for this section.";
    }
    return "Roughly " + band[0] + "-" + band[1] + " words for this part.";
  }

  // Sections that must stay short no matter the depth setting — without an
  // explicit cap a rewrite turns them into rambling scenes.
  var SINGLE_TARGETS = {
    "Name": "Just the name on one line (plus a nickname or alias if they have one) — nothing else.",
    "Tagline": "Exactly one short, evocative line — nothing else.",
    "Opening Line": "Exactly one line of dialogue, with at most a brief action beat — nothing else.",
    "A Secret": "A few sentences (under ~120 words) — intriguing but tight."
  };
  function singleSectionTarget(heading, depthId) {
    if (Object.prototype.hasOwnProperty.call(SINGLE_TARGETS, heading)) return SINGLE_TARGETS[heading];
    return passTarget(sectionKindOf(heading), depthId, 0, true);
  }

  function passTask(pass, n, total, depthId) {
    var what;
    if (pass.examples) {
      what = "ROLEPLAY BEHAVIOR EXAMPLES " + pass.from + "-" + pass.to + ". Write the heading '# Roleplay Behavior Examples:' and then EXACTLY " + pass.count + " numbered examples, numbered " + pass.from + " to " + pass.to + " (" + pass.from + "., " + (pass.from + 1) + "., ...). " +
        "Each example is a self-contained moment from an imagined story, with enough context inside the dialogue and actions to stand alone. Use *asterisks for actions* and \"quotes for speech\". " +
        (pass.from > 1 ? "These must be NEW moments that do not repeat any earlier example. " : "") +
        "Vary the situations widely and make each one reveal a different facet of the character.";
    } else {
      what = "these sections, in this exact order and NOTHING else:\n" + sectionBlock(pass.heads);
    }
    return "TASK (part " + n + " of " + total + "): Write " + what + "\n" +
      "Start your reply with '" + pass.start + "' and give the name/content immediately. " + passTarget(pass.kind, depthId, pass.count, pass.kind === "extras") +
      " Write in third-person descriptive prose about the character — not dialogue, chat logs, or numbered example scenes. " +
      "Each section must add NEW information: do not restate facts already covered by other sections; where topics overlap, come at this section from a different angle with different specifics. " +
      "Do NOT write any sections other than the ones listed, do not add commentary, and do not summarise. " +
      "When this part is complete, write '# END' on its own line and stop.";
  }

  window.t2i_runPersonaGeneration = function (opts) {
    opts = opts || {};
    if (!(window.root && root.generateText)) throw new Error("AI text not available");
    var onUpdate = opts.onUpdate || function () {};
    var onProgress = opts.onProgress || function () {};
    var plan = passes(opts.exampleCount, opts.extraSections);
    var PASSES = plan.list;
    var EX_N = plan.exampleCount;
    var DEPTH = depthDef(opts.depth).id;
    var shared = window.t2i_buildPersonaInstruction(opts);
    var results = { identity: {}, depth: {}, extras: {}, examples1: [], examples2: [] };
    var nameCache = cleanName(opts.name || "");
    var stopped = false;
    var current = null;

    function emit() {
      try { onUpdate(buildPersona(nameCache, results, EX_N)); } catch (e) { console.warn("persona onUpdate:", e); }
    }

    function applyPassResult(pass, text) {
      if (pass.examples) {
        results[pass.key] = extractExamples(text, pass.count);
      } else if (pass.kind === "extras") {
        // Each extra has its own pass; accumulate them all into one map.
        mergeInto(results.extras, extractSections(text));
      } else {
        results[pass.key] = extractSections(text);
        var nm = cleanName(results[pass.key]["Name"] || "");
        if (nm) nameCache = nm;
      }
    }

    function passEmpty(pass) {
      if (pass.examples) return !(results[pass.key] && results[pass.key].length);
      if (pass.kind === "extras" && pass.head) {
        var c = results.extras[pass.head];
        return !(c && c.replace(/\s/g, ""));
      }
      var m = results[pass.key];
      if (!m) return true;
      for (var k in m) if (k !== "Name" && m[k] && m[k].replace(/\s/g, "")) return false;
      return true;
    }

    function runPass(pass, n, total) {
      return new Promise(function (resolve) {
        if (stopped) return resolve();
        var obj;
        try {
          obj = root.generateText({
            instruction: shared + "\n\n" + passTask(pass, n, total, DEPTH),
            startWith: pass.start,
            stopSequences: pass.stop,
            onChunk: function (data) {
              if (stopped) return;
              applyPassResult(pass, (data && data.fullTextSoFar) || "");
              emit();
            }
          });
        } catch (e) { console.warn("persona pass " + pass.key + ":", e); return resolve(); }
        current = obj;
        Promise.resolve(obj).then(function () { resolve(); }, function (e) { console.warn("persona pass " + pass.key + ":", e); resolve(); });
      });
    }

    var chain = (async function () {
      for (var i = 0; i < PASSES.length; i++) {
        if (stopped) break;
        var pass = PASSES[i];
        onProgress({ index: i + 1, total: PASSES.length, key: pass.key, label: pass.label });
        await runPass(pass, i + 1, PASSES.length);
        if (stopped) break;
        if (pass.examples && (results[pass.key] || []).length < pass.count) {
          // Empty OR short examples part: one retry, keeping the fuller of the
          // two attempts so a worse retry can never hurt.
          var keepEx = results[pass.key] || [];
          onProgress({ index: i + 1, total: PASSES.length, key: pass.key, label: pass.label, retry: true });
          await runPass(pass, i + 1, PASSES.length);
          if ((results[pass.key] || []).length < keepEx.length) results[pass.key] = keepEx;
          emit();
        } else if (!pass.examples && passEmpty(pass)) { // one retry for a failed/empty pass
          onProgress({ index: i + 1, total: PASSES.length, key: pass.key, label: pass.label, retry: true });
          await runPass(pass, i + 1, PASSES.length);
        }
      }
      emit();
      onProgress({ index: PASSES.length, total: PASSES.length, done: true });
    })();

    chain.stop = function () {
      stopped = true;
      try { if (current && current.stop) current.stop(); } catch (e) {}
    };
    return chain;
  };

  // ---- single-section (re)generation ----------------------------------------
  // Rewrites exactly ONE heading, using the same shared prefix. Lets a user nudge
  // one part of an otherwise-good character without regenerating the whole thing.
  function sectionKindOf(heading) {
    if (heading === "Name" || heading === "Tagline" || heading === "Visual Description" || heading === "Personality" || heading === "Voice & Mannerisms") return "identity";
    for (var i = 0; i < EXTRA_SECTIONS.length; i++) if (EXTRA_SECTIONS[i].id === heading) return "extras";
    return "depth";
  }
  function sectionHintOf(heading) {
    for (var i = 0; i < SECTION_HINTS.length; i++) if (SECTION_HINTS[i].h === heading) return SECTION_HINTS[i].hint;
    return "";
  }

  window.t2i_generatePersonaSection = function (opts, heading, currentText, onChunk) {
    opts = opts || {};
    if (!(window.root && root.generateText)) throw new Error("AI text not available");
    var shared = window.t2i_buildPersonaInstruction(opts);
    var isExamples = heading === "Roleplay Behavior Examples";
    var task;
    if (isExamples) {
      var n = normalizeExampleCount(opts.exampleCount);
      task = "TASK (single-section rewrite): Rewrite ONLY the '# Roleplay Behavior Examples:' section. Write EXACTLY " + n +
        " numbered examples, numbered 1 to " + n + ", each a self-contained moment from an imagined story that reveals a different facet of the character, using *asterisks for actions* and \"quotes for speech\". " +
        passTarget("examples", opts.depth, n) +
        " Do not write any other section and add no commentary. When finished, write '# END' on its own line and stop.";
    } else {
      task = "TASK (single-section rewrite): Rewrite ONLY this one section, and nothing else:\n# " + heading + ":\n(" + sectionHintOf(heading) + ")\nKeep it consistent with the rest of the character below. " +
        singleSectionTarget(heading, opts.depth) +
        " Write in third-person descriptive prose about the character — not dialogue, chat logs, or numbered example scenes" +
        (heading === "Opening Line" ? " (this section IS one line of dialogue)" : "") +
        ". Add NEW information for this section: do not restate or summarise facts already covered elsewhere in the character; if a sibling section touches the same topic, come at it from a different angle with different specifics." +
        " Do not write any other section and add no commentary. When finished, write '# END' on its own line and stop.";
    }
    var starter = String(opts.sectionStarter || "").trim();
    if (starter) {
      task += "\n\nEXTRA DIRECTION FROM THE USER — follow this for this section specifically (it takes priority over generic defaults, but must stay consistent with the rest of the character; weave it in, don't restate it verbatim):\n" + starter;
    }
    // The character context comes BEFORE the task: with the character dumped
    // last, the model tends to continue/summarise it (repeating other sections
    // into this one) instead of answering the rewrite task.
    var ctx = currentText ? "\n\n--- CURRENT CHARACTER (context for voice and consistency only — do NOT rewrite it, repeat it, or continue it) ---\n" + currentText + "\n--- END OF CURRENT CHARACTER ---" : "";
    var obj = root.generateText({
      instruction: shared + ctx + "\n\n" + task,
      startWith: isExamples ? "# Roleplay Behavior Examples:" : "# " + heading + ":",
      stopSequences: ["# END"],
      onChunk: onChunk ? function (data) { try { onChunk((data && data.fullTextSoFar) || ""); } catch (e) {} } : undefined
    });
    return Promise.resolve(obj).then(function (r) {
      var txt = "";
      try { txt = (r && r.text) || (typeof r === "string" ? r : "") || ""; } catch (e) {}
      if (!txt && r && r.generatedText) txt = r.generatedText;
      if (isExamples) return extractExamples(txt, normalizeExampleCount(opts.exampleCount));
      var map = extractSections(txt);
      return map[heading] || "";
    });
  };

  // Count the examples already built in a finished character text.
  window.t2i_countPersonaExamples = function (full) {
    try {
      var map = extractSections(full || "");
      return extractExamples(map["Roleplay Behavior Examples"] || "", 200).length;
    } catch (e) { return 0; }
  };

  // ---- append examples ------------------------------------------------------
  // Adds 1-10 NEW examples to the ones already built (numbering continues from
  // the existing count), using the same shared prefix. Unlike the rewrite path
  // (which regenerates the whole set numbered 1..exampleCount), this keeps
  // what's there and only writes the next ones.
  window.t2i_appendPersonaExamples = function (opts, addCount, currentText, onChunk) {
    opts = opts || {};
    if (!(window.root && root.generateText)) throw new Error("AI text not available");
    var raw = parseInt(addCount, 10);
    var n = !(raw >= 1) ? 1 : Math.min(10, raw);
    var have = window.t2i_countPersonaExamples(currentText);
    var from = have + 1, to = have + n;
    var nums = [];
    for (var q = from; q <= to; q++) nums.push(q + ".");
    var shared = window.t2i_buildPersonaInstruction(opts);
    var task = "TASK (add examples): Write EXACTLY " + n + " NEW numbered roleplay behavior examples, numbered " + from + " to " + to + " (" + nums.join(", ") + "). " +
      "Each example is a self-contained moment from an imagined story, with enough context inside the dialogue and actions to stand alone. Use *asterisks for actions* and \"quotes for speech\". " +
      "These must be NEW moments that do not repeat each other or any example already in the character above. Vary the situations widely and make each one reveal a different facet of the character. " +
      passTarget("examples", opts.depth, n) +
      " Start your reply with '" + from + ". ' and give that example immediately. Do not write any other section and add no commentary. When finished, write '# END' on its own line and stop.";
    var ctx = currentText ? "\n\n--- CURRENT CHARACTER (context for voice and consistency only — do NOT rewrite it, repeat it, or continue it) ---\n" + currentText + "\n--- END OF CURRENT CHARACTER ---" : "";
    var obj = root.generateText({
      instruction: shared + ctx + "\n\n" + task,
      startWith: from + ".",
      stopSequences: ["# END"],
      onChunk: onChunk ? function (data) { try { onChunk((data && data.fullTextSoFar) || ""); } catch (e) {} } : undefined
    });
    return Promise.resolve(obj).then(function (r) {
      var txt = "";
      try { txt = (r && r.text) || (typeof r === "string" ? r : "") || ""; } catch (e) {}
      if (!txt && r && r.generatedText) txt = r.generatedText;
      return extractExamples(txt, n);
    });
  };

  // ---- polish a user's own addition -------------------------------------------------
  // Rewrites ONLY the user's new material into polished prose that fits the target
  // section — the existing section is context only and is never rewritten. The
  // model returns just the polished addition (no heading, no commentary); the
  // caller appends it to the section after the user reviews it.
  window.t2i_polishSectionAddition = function (opts, heading, currentText, newInfo, starter, onChunk) {
    opts = opts || {};
    if (!(window.root && root.generateText)) throw new Error("AI text not available");
    var shared = window.t2i_buildPersonaInstruction(opts);
    var info = String(newInfo == null ? "" : newInfo).trim();
    var isExamples = heading === "Roleplay Behavior Examples";
    var secContent = "";
    try {
      var secMap = extractSections(currentText || "");
      secContent = secMap[heading] || "";
    } catch (e) { secContent = ""; }
    var task;
    if (isExamples) {
      task = "TASK (polish addition): Rewrite ONLY the user's new example idea(s) below into polished roleplay behavior example moment(s) — self-contained moments from an imagined story, with enough context inside the dialogue and actions to stand alone, using *asterisks for actions* and \"quotes for speech\". " +
        "Keep every idea the user gave (one polished moment per idea); do NOT invent extra moments and do NOT repeat any example already in the character above — vary the situation so each moment reveals a different facet. " +
        "Write in the same voice as the character. Do NOT number the moments, do NOT write any other section and add no commentary. Separate moments with a blank line. When finished, write '# END' on its own line and stop.";
    } else {
      task = "TASK (polish addition): Rewrite ONLY the user's NEW MATERIAL below into a polished addition for the '# " + heading + ":' section. " +
        "Keep every fact and detail from the new material — change the wording, not the meaning, and do NOT add new facts of your own. " +
        "Match the section's existing style and the character's voice" +
        (heading === "Opening Line" ? " (this section IS one line of dialogue, so the addition must also be dialogue)" : " (third-person descriptive prose about the character — not dialogue, chat logs, or numbered example scenes)") +
        ". Stay consistent with the rest of the character; if the existing section already states something, phrase the addition so it extends the section instead of restating it. " +
        "Output ONLY the polished addition — no heading line, no quotes wrapper, no other section and no commentary. When finished, write '# END' on its own line and stop.";
    }
    var dir = String(starter || "").trim();
    if (dir) {
      task += "\n\nEXTRA DIRECTION FROM THE USER — follow this for this addition specifically (it takes priority over generic defaults, but must stay consistent with the rest of the character; weave it in, don't restate it verbatim):\n" + dir;
    }
    // Character + section context comes BEFORE the task (same lesson as the
    // rewrite path): context dumped last makes the model continue it instead of
    // answering the task.
    var ctx = currentText ? "\n\n--- CURRENT CHARACTER (context for voice and consistency only — do NOT rewrite it, repeat it, or continue it) ---\n" + currentText + "\n--- END OF CURRENT CHARACTER ---" : "";
    var secCtx = secContent ? "\n\n--- CURRENT '" + heading + "' SECTION (style reference only — do NOT rewrite it, repeat it, or include any of it in your reply) ---\n" + secContent + "\n--- END OF CURRENT SECTION ---" : "";
    var obj = root.generateText({
      instruction: shared + ctx + secCtx + "\n\n" + task + "\n\n--- NEW MATERIAL (rewrite ONLY this) ---\n" + info + "\n--- END OF NEW MATERIAL ---",
      stopSequences: ["# END"],
      onChunk: onChunk ? function (data) { try { onChunk((data && data.fullTextSoFar) || ""); } catch (e) {} } : undefined
    });
    return Promise.resolve(obj).then(function (r) {
      var txt = "";
      try { txt = (r && r.text) || (typeof r === "string" ? r : "") || ""; } catch (e) {}
      if (!txt && r && r.generatedText) txt = r.generatedText;
      txt = String(txt || "").replace(/^[ \t]*#[ \t]*END[ \t]*$/gim, "").trim();
      if (isExamples) return extractExamples(txt, 10).join("\n\n").trim();
      try {
        var m2 = extractSections(txt);
        if (m2[heading]) return String(m2[heading]).trim();
      } catch (e) {}
      return txt.replace(/^#+\s*[^\n]*\n/, "").trim();
    });
  };

  // ---- deepen a section -------------------------------------------------------
  // Keeps every fact in the section, but makes it feel lived-in: sensory
  // texture (sight/sound/smell/touch/taste where they fit), one complicating
  // human detail, and no new plot claims. Returns the full rewritten section.
  window.t2i_deepenSection = function (opts, heading, currentText, onChunk) {
    return runSingleSection(opts, heading, currentText, onChunk, function (isExamples, h) {
      if (isExamples) {
        return "TASK (deepen examples): Rewrite the '# Roleplay Behavior Examples:' section keeping the EXACT same moments in the EXACT same numbering — change no events and add no new moments. Enrich each moment with sensory texture and one small complicating human detail (a hesitation, a habit, a contradiction) so every example feels lived-in. Keep *asterisks for actions* and \"quotes for speech\". Do not write any other section and add no commentary. When finished, write '# END' on its own line and stop.";
      }
      return "TASK (deepen section): Rewrite ONLY this one section, and nothing else:\n# " + h + ":\n(" + sectionHintOf(h) + ")\nKeep EVERY fact already in the section — change no events, add no new plot claims, contradict nothing in the rest of the character. Your job is texture, not story: concrete sensory detail (sight, sound, smell, touch, taste where they fit), one small complicating human detail that makes them less tidy, and specificity wherever the current text is generic. " +
        singleSectionTarget(h, opts.depth) +
        " Write in third-person descriptive prose about the character — not dialogue, chat logs, or numbered example scenes. Do not write any other section and add no commentary. When finished, write '# END' on its own line and stop.";
    });
  };

  // ---- distill a section ------------------------------------------------------
  // Compresses a bloated section to its sharpest form: the 2–3 sentences (or
  // tightened moments, for examples) that carry it, dropping throat-clearing.
  // Every surviving fact must still be true to the original.
  window.t2i_distillSection = function (opts, heading, currentText, onChunk) {
    return runSingleSection(opts, heading, currentText, onChunk, function (isExamples, h) {
      if (isExamples) {
        return "TASK (distill examples): Rewrite the '# Roleplay Behavior Examples:' section keeping the EXACT same moments in the EXACT same numbering — drop no moment and add none. Tighten every moment to its sharpest form: cut filler and throat-clearing, keep the action, the speech and the one detail that makes the moment land. Keep *asterisks for actions* and \"quotes for speech\". Do not write any other section and add no commentary. When finished, write '# END' on its own line and stop.";
      }
      return "TASK (distill section): Rewrite ONLY this one section, and nothing else:\n# " + h + ":\n(" + sectionHintOf(h) + ")\nCompress it to its sharpest 2–3 sentences: keep every important fact, drop repetition, throat-clearing and generic filler. Nothing surviving may contradict the section or the rest of the character. " +
        "Write in third-person descriptive prose about the character — not dialogue, chat logs, or numbered example scenes" + (h === "Opening Line" ? " (this section IS one line of dialogue, so the distilled form is still one line of dialogue)" : "") + ". Do not write any other section and add no commentary. When finished, write '# END' on its own line and stop.";
    });
  };

  // ---- voice test ---------------------------------------------------------------
  // Renders the section as a short first-person in-character monologue — a
  // hearing test for the voice, shown as a preview and never written back.
  // Returns raw prose (no heading), like the polish path.
  window.t2i_voiceTest = function (opts, heading, currentText, onChunk) {
    opts = opts || {};
    if (!(window.root && root.generateText)) throw new Error("AI text not available");
    var shared = window.t2i_buildPersonaInstruction(opts);
    var secContent = "";
    try { secContent = (extractSections(currentText || "")[heading]) || ""; } catch (e) { secContent = ""; }
    var task = "TASK (voice test): Write a short first-person monologue (4–7 sentences) AS the character, in their exact voice — same vocabulary, rhythm, attitude and blind spots as the character above. " +
      "Let them touch on the themes of their '" + heading + "' section WITHOUT reciting it: the monologue should feel like overhearing them think out loud, revealing the same person from the inside. " +
      "Do NOT explain the character, do NOT break voice, do NOT write any section heading or commentary. When finished, write '# END' on its own line and stop.";
    var ctx = currentText ? "\n\n--- CURRENT CHARACTER (voice and consistency reference — do NOT rewrite it, repeat it, or continue it) ---\n" + currentText + "\n--- END OF CURRENT CHARACTER ---" : "";
    var secCtx = secContent ? "\n\n--- CURRENT '" + heading + "' SECTION (theme reference only — do NOT repeat it or quote it) ---\n" + secContent + "\n--- END OF CURRENT SECTION ---" : "";
    var obj = root.generateText({
      instruction: shared + ctx + secCtx + "\n\n" + task,
      stopSequences: ["# END"],
      onChunk: onChunk ? function (data) { try { onChunk((data && data.fullTextSoFar) || ""); } catch (e) {} } : undefined
    });
    return Promise.resolve(obj).then(function (r) {
      var txt = "";
      try { txt = (r && r.text) || (typeof r === "string" ? r : "") || ""; } catch (e) {}
      if (!txt && r && r.generatedText) txt = r.generatedText;
      txt = String(txt || "").replace(/^[ \t]*#[ \t]*END[ \t]*$/gim, "").trim();
      try {
        var m2 = extractSections(txt);
        if (m2[heading]) return String(m2[heading]).trim();
      } catch (e) {}
      return txt.replace(/^#+[^\n]*\n/, "").trim();
    });
  };

  // ---- foreshadow ---------------------------------------------------------------
  // Plants ONE subtle unexplained hook in the section — a small detail that
  // intrigues without explaining itself, consistent with everything known
  // (especially the secret/backstory). Returns the full rewritten section.
  window.t2i_foreshadowSection = function (opts, heading, currentText, onChunk) {
    return runSingleSection(opts, heading, currentText, onChunk, function (isExamples, h) {
      var hook = "Add exactly ONE subtle unexplained hook: a small concrete detail that intrigues without explaining itself (an object kept too carefully, a reaction slightly too strong, a sentence that trails off where it shouldn't). It must be consistent with everything in the character — especially the secret and backstory — but it must NOT reveal, name or explain the secret. If a hook is already there, sharpen it instead of adding a second one. ";
      if (isExamples) {
        return "TASK (foreshadow in examples): Rewrite the '# Roleplay Behavior Examples:' section keeping the EXACT same moments in the EXACT same numbering — change no events and add no new moments. " + hook + "Weave the hook into ONE existing moment so it lands as texture, not plot. Keep *asterisks for actions* and \"quotes for speech\". Do not write any other section and add no commentary. When finished, write '# END' on its own line and stop.";
      }
      return "TASK (foreshadow in section): Rewrite ONLY this one section, and nothing else:\n# " + h + ":\n(" + sectionHintOf(h) + ")\nKeep every fact in the section — change nothing else. " + hook +
        singleSectionTarget(h, opts.depth) +
        " Write in third-person descriptive prose about the character — not dialogue, chat logs, or numbered example scenes. Do not write any other section and add no commentary. When finished, write '# END' on its own line and stop.";
    });
  };

  // ---- callback -------------------------------------------------------------------
  // Weaves one concrete detail from a SOURCE section into a TARGET section, so
  // the character feels designed instead of listed. Only the target is
  // rewritten; the source is context and is never touched.
  window.t2i_callbackSection = function (opts, fromHeading, toHeading, currentText, onChunk) {
    opts = opts || {};
    if (!(window.root && root.generateText)) throw new Error("AI text not available");
    if (!fromHeading || !toHeading || fromHeading === toHeading) throw new Error("Pick two different sections");
    var shared = window.t2i_buildPersonaInstruction(opts);
    var map = {};
    try { map = extractSections(currentText || ""); } catch (e) { map = {}; }
    var srcContent = map[fromHeading] || "", dstContent = map[toHeading] || "";
    if (!srcContent) throw new Error("Source section is empty");
    var isExamples = toHeading === "Roleplay Behavior Examples";
    var task;
    if (isExamples) {
      task = "TASK (callback into examples): Rewrite the '# Roleplay Behavior Examples:' section keeping the EXACT same moments in the EXACT same numbering — change no events and add no new moments. Weave ONE concrete detail from the '" + fromHeading + "' section (quoted below) into ONE existing moment where it fits naturally — as texture, not plot. Do not explain the reference; let it land for a reader who knows the character. Keep *asterisks for actions* and \"quotes for speech\". Do not touch the '" + fromHeading + "' section, do not write any other section and add no commentary. When finished, write '# END' on its own line and stop.";
    } else {
      task = "TASK (callback between sections): Rewrite ONLY the '# " + toHeading + ":' section, and nothing else. Weave ONE concrete detail from the '" + fromHeading + "' section (quoted below) into it where it fits naturally — as texture, not plot, and without restating facts already covered elsewhere in the character. Do not explain the reference; let it land for a reader who knows the character. " +
        singleSectionTarget(toHeading, opts.depth) +
        " Write in third-person descriptive prose about the character — not dialogue, chat logs, or numbered example scenes. Do not touch the '" + fromHeading + "' section, do not write any other section and add no commentary. When finished, write '# END' on its own line and stop.";
    }
    var ctx = currentText ? "\n\n--- CURRENT CHARACTER (context for voice and consistency only — do NOT rewrite it, repeat it, or continue it) ---\n" + currentText + "\n--- END OF CURRENT CHARACTER ---" : "";
    var srcCtx = "\n\n--- SOURCE '" + fromHeading + "' SECTION (take ONE concrete detail from here — do NOT rewrite or repeat this section) ---\n" + srcContent + "\n--- END OF SOURCE SECTION ---";
    var obj = root.generateText({
      instruction: shared + ctx + srcCtx + "\n\n" + task,
      startWith: isExamples ? "# Roleplay Behavior Examples:" : "# " + toHeading + ":",
      stopSequences: ["# END"],
      onChunk: onChunk ? function (data) { try { onChunk((data && data.fullTextSoFar) || ""); } catch (e) {} } : undefined
    });
    return Promise.resolve(obj).then(function (r) {
      var txt = "";
      try { txt = (r && r.text) || (typeof r === "string" ? r : "") || ""; } catch (e) {}
      if (!txt && r && r.generatedText) txt = r.generatedText;
      if (isExamples) return extractExamples(txt, normalizeExampleCount(opts.exampleCount));
      var map2 = extractSections(txt);
      return map2[toHeading] || "";
    });
  };

  // Shared single-section runner behind deepen / distill / foreshadow: same
  // prefix + context + task shape as the rewrite path, with examples-aware
  // parsing. `taskFn(isExamples, heading)` builds the task string.
  function runSingleSection(opts, heading, currentText, onChunk, taskFn) {
    opts = opts || {};
    if (!(window.root && root.generateText)) throw new Error("AI text not available");
    var shared = window.t2i_buildPersonaInstruction(opts);
    var isExamples = heading === "Roleplay Behavior Examples";
    var task = taskFn(isExamples, heading);
    var starter = String(opts.sectionStarter || "").trim();
    if (starter) {
      task += "\n\nEXTRA DIRECTION FROM THE USER — follow this for this section specifically (it takes priority over generic defaults, but must stay consistent with the rest of the character; weave it in, don't restate it verbatim):\n" + starter;
    }
    var ctx = currentText ? "\n\n--- CURRENT CHARACTER (context for voice and consistency only — do NOT rewrite it, repeat it, or continue it) ---\n" + currentText + "\n--- END OF CURRENT CHARACTER ---" : "";
    var obj = root.generateText({
      instruction: shared + ctx + "\n\n" + task,
      startWith: isExamples ? "# Roleplay Behavior Examples:" : "# " + heading + ":",
      stopSequences: ["# END"],
      onChunk: onChunk ? function (data) { try { onChunk((data && data.fullTextSoFar) || ""); } catch (e) {} } : undefined
    });
    return Promise.resolve(obj).then(function (r) {
      var txt = "";
      try { txt = (r && r.text) || (typeof r === "string" ? r : "") || ""; } catch (e) {}
      if (!txt && r && r.generatedText) txt = r.generatedText;
      if (isExamples) return extractExamples(txt, normalizeExampleCount(opts.exampleCount));
      var map = extractSections(txt);
      return map[heading] || "";
    });
  }

  // ---- combine / fuse saved personas ------------------------------------------
  // Merges two or more finished character descriptions into ONE new cohesive
  // character. Every trait from every source survives; a trait that exists in only
  // one source is woven into the fusion; contradictions are resolved into
  // believable complexity rather than one winner; and all the sources' roleplay
  // examples are reconciled into a single consistent, varied, non-repeating set.
  // Uses the same shared-prefix + streaming multi-pass pattern as the generator.
  // -- section union -------------------------------------------------------------
  // The fused character must carry over EVERY section that appears in ANY source,
  // each exactly ONCE. Sources may hold built-in sections, user-registered custom
  // sections, or freeform/imported headings the tolerant parser doesn't recognise,
  // so we read each source's real heading blocks (keeping unmatched headings
  // verbatim) and take their ordered union as the plan the model must follow.
  var COMBINE_IDENTITY = ["Tagline", "Visual Description", "Personality", "Voice & Mannerisms"];
  var COMBINE_DEPTH = ["Backstory", "Goals, Fears & Desires", "Habits & Quirks", "Likes & Dislikes", "A Secret", "Relationship with {{user}}", "Opening Line"];
  function normHead(s) {
    return String(s == null ? "" : s).replace(/[{}]/g, " ").replace(/[^A-Za-z&,\s-]/g, " ").replace(/\s+/g, " ").trim().replace(/^char\s+/i, "").trim().toLowerCase();
  }
  // Aliases the tolerant parser doesn't already cover, so common card headings
  // (Appearance, Traits, Greeting, Dialogue Examples…) merge instead of doubling up.
  var COMBINE_ALIASES = {
    "appearance": "Visual Description", "looks": "Visual Description", "physical appearance": "Visual Description",
    "traits": "Personality", "personality traits": "Personality", "character": "Personality",
    "greeting": "Opening Line", "first message": "Opening Line", "dialogue examples": "Roleplay Behavior Examples"
  };
  // Resolve a heading to a known section, but never let a stray "Roleplay
  // Guidelines" heading be swallowed by the tolerant parser's examples rule.
  function combineCanon(heading) {
    var n = normHead(heading);
    if (COMBINE_ALIASES[n]) return COMBINE_ALIASES[n];
    var c = canonicalOf(heading);
    if (!c) return null;
    if (c === "Roleplay Behavior Examples" && !/^(roleplay\s*)?(behavio|example|scene|moment)/.test(n)) return null;
    return c;
  }
  function headLabel(headTxt) {
    return String(headTxt == null ? "" : headTxt).replace(/\{\{\s*char\s*\}\}/i, " ").replace(/\s+/g, " ").trim();
  }
  // Ordered, de-duplicated heading blocks of one source (canonical or not), with
  // the raw content that follows each heading. -> [{key, label, canon, content}]
  function readSourceHeads(full) {
    var lines = String(full == null ? "" : full).split("\n");
    var out = [], idx = {}, cur = null;
    function flush() {
      if (!cur) return;
      cur.content = String(cur.content || "").replace(/^\s+|\s+$/g, "");
      if (idx[cur.key] === undefined) { idx[cur.key] = out.length; out.push(cur); }
      else if (cur.content && !out[idx[cur.key]].content) out[idx[cur.key]].content = cur.content;
      cur = null;
    }
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^#{1,4}\s*(.+?)\s*$/);
      if (!m) { if (cur) cur.content += (cur.content ? "\n" : "") + lines[i]; continue; }
      flush();
      var raw = m[1];
      var ci = raw.indexOf(":");
      var label = headLabel(ci >= 0 ? raw.slice(0, ci) : raw);
      var inline = ci >= 0 ? raw.slice(ci + 1).replace(/^\s+/, "") : "";
      var norm = normHead(label);
      if (!norm) continue;
      var canon = combineCanon(label);
      cur = { key: canon ? canon.toLowerCase() : norm, label: canon || label, canon: canon, content: inline };
    }
    flush();
    return out;
  }
  // Does a freeform heading just repeat the character's own name (an imported
  // title line)? Those are dropped so the fusion doesn't sprout a title section.
  function isNameLike(label, name) {
    var a = normHead(label), b = normHead(name || "");
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.indexOf(" ") < 0) {
      var re = new RegExp("^" + a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
      return re.test(b);
    }
    return false;
  }
  // The ordered union of every source's sections, as a plan of {key, label, hint}:
  // canonical sections first (in CANON order, so base → extras → registered custom)
  // then any freeform headings no map recognises, in first-seen order.
  function combineUnion(sources) {
    var present = {}, customFirst = [], customSeen = {};
    for (var s = 0; s < sources.length; s++) {
      var hs = readSourceHeads(sources[s].description);
      for (var h = 0; h < hs.length; h++) {
        var e = hs[h];
        if (e.canon) {
          if (e.canon === "Name" || e.canon === "Roleplay Behavior Examples") continue;
          present[e.canon] = true;
        } else {
          if (h === 0 && isNameLike(e.label, sources[s].name)) continue;
          if (!customSeen[e.key]) { customSeen[e.key] = true; customFirst.push(e); }
        }
      }
    }
    var plan = [];
    for (var c = 0; c < CANON.length; c++) {
      var hh = CANON[c];
      if (hh === "Name" || hh === "Roleplay Behavior Examples") continue;
      if (present[hh]) plan.push({ key: hh.toLowerCase(), label: hh, hint: sectionHintOf(hh) });
    }
    for (var u = 0; u < customFirst.length; u++) plan.push({ key: customFirst[u].key, label: customFirst[u].label, hint: "" });
    return plan;
  }
  function combineHintOf(entry) {
    return entry.hint || "Write this section for the fused character — fold in and reconcile everything the sources say about it, consistent with the rest of the profile.";
  }
  function combineSectionBlock(heads) {
    var out = [];
    for (var i = 0; i < heads.length; i++) out.push("# " + heads[i].label + ":\n(" + combineHintOf(heads[i]) + ")");
    return out.join("\n\n");
  }
  function combineFullPlan(plan) {
    return [{ key: "name", label: "Name", hint: sectionHintOf("Name") }].concat(plan).concat([{ key: "roleplay behavior examples", label: "Roleplay Behavior Examples", hint: sectionHintOf("Roleplay Behavior Examples") }]);
  }
  // Parse a model reply into {planKey: content}, accepting only plan headings and
  // keeping the FIRST occurrence of each — so a heading the model repeats can never
  // produce a duplicated section.
  function extractPlanSections(text, plan) {
    var byNorm = {}, keySet = {};
    for (var i = 0; i < plan.length; i++) { byNorm[normHead(plan[i].label)] = plan[i].key; keySet[plan[i].key] = true; }
    var lines = String(text == null ? "" : text).split("\n");
    var map = {}, seen = {}, cur = null;
    for (var j = 0; j < lines.length; j++) {
      var m = lines[j].match(/^#{1,4}\s*(.+?)\s*$/);
      if (m) {
        var raw = m[1];
        var ci = raw.indexOf(":");
        var head = (ci >= 0 ? raw.slice(0, ci) : raw).trim();
        var inline = ci >= 0 ? raw.slice(ci + 1).replace(/^\s+/, "") : "";
        var key = null;
        var nm = normHead(head);
        if (byNorm[nm] !== undefined) key = byNorm[nm];
        else { var cc = combineCanon(head); if (cc && keySet[cc.toLowerCase()]) key = cc.toLowerCase(); }
        if (key && seen[key]) { cur = null; continue; }
        if (key) { seen[key] = true; map[key] = inline; cur = key; }
        else { cur = null; }
        continue;
      }
      if (cur) map[cur] = (map[cur] === undefined ? "" : map[cur] + "\n") + lines[j];
    }
    for (var k in map) map[k] = String(map[k]).replace(/^\s+|\s+$/g, "");
    return map;
  }
  // The content the sources themselves hold for a section (used to guarantee a
  // section survives even if the model omitted it). Identical copies collapse.
  function combineCarryOver(sources, entry) {
    var seen = {}, parts = [];
    for (var s = 0; s < sources.length; s++) {
      var hs = readSourceHeads(sources[s].description);
      for (var h = 0; h < hs.length; h++) {
        if (hs[h].key !== entry.key) continue;
        var c = String(hs[h].content || "").replace(/^\s+|\s+$/g, "");
        if (c && !seen[c]) { seen[c] = true; parts.push(c); }
      }
    }
    return parts.join("\n\n");
  }
  function combineDefaultExampleCount(sources) {
    var max = 0;
    for (var s = 0; s < sources.length; s++) {
      var hs = readSourceHeads(sources[s].description);
      for (var h = 0; h < hs.length; h++) {
        if (hs[h].key !== "roleplay behavior examples") continue;
        var ex = extractExamples(hs[h].content, 24);
        if (ex.length > max) max = ex.length;
      }
    }
    return Math.max(4, Math.min(20, max || 10));
  }
  function combineSourceBlock(sources) {
    var out = [];
    for (var i = 0; i < sources.length; i++) {
      var nm = cleanName(sources[i].name || "") || ("Character " + (i + 1));
      out.push("--- SOURCE CHARACTER " + (i + 1) + ": " + nm + " ---\n" + String(sources[i].description || "").trim());
    }
    return out.join("\n\n\n");
  }

  var FUSION_RULES = [
    "FUSION RULES — the fused character must satisfy ALL of these:",
    "- Keep EVERY distinctive trait, quirk, skill, talent, relationship, flaw, want, fear, secret, habit and piece of history that appears in ANY source character. Nothing important may be dropped.",
    "- A trait, ability or detail that exists in only ONE source must be ADDED into the fused character — carry it across and make it fit, even if the other sources share none of it.",
    "- Where sources overlap, merge the overlapping material into a single richer, more specific version instead of repeating it twice.",
    "- Where sources CONTRADICT each other (opposite temperaments, incompatible backstories, different genders/species/ages), never just pick a winner and never ignore the clash. Resolve the contradiction into believable complexity: an internal tension, a context-dependent behaviour, a before-and-after, or a contradiction the character simply lives with. The result must read as ONE real person who contains multitudes — never as two people stapled together.",
    "- Reconcile names, pronouns, appearance and history into a single coherent person with one timeline. Weave the histories so that as much as possible is simultaneously true.",
    "- Raise the merged detail above a pile of facts: the fused character needs one clear centre of gravity (a defining wound, want and philosophy) that all the inherited traits orbit.",
    "- Write vivid, specific, information-dense prose in the voice of the most compelling source. No purple prose, no summaries, no meta-commentary about the sources.",
    "- SECTIONS: the fusion must contain every heading in the SECTION CONTRACT below, each appearing EXACTLY ONCE and in that order. Never drop a section that only one source has, never merge two headings into one, never rename a heading, never invent a heading that is not listed, and never write the same heading twice."
  ].join("\n");

  function combineInstruction(sources, opts, plan, parts) {
    var lines = [];
    lines.push("TASK: You are a master character writer. Below are " + sources.length + " separate, finished character profiles. Fuse them into ONE new, cohesive, three-dimensional character who genuinely contains all of them.");
    lines.push(FUSION_RULES);
    var ob = optionsBlock(opts);
    if (ob) lines.push(ob);
    lines.push("--- START OF SOURCE CHARACTERS ---\n" + combineSourceBlock(sources) + "\n--- END OF SOURCE CHARACTERS ---");
    if (opts.instruction) lines.push("ADDITIONAL REQUIREMENT FROM THE USER (must be satisfied): " + String(opts.instruction).trim());
    var full = combineFullPlan(plan);
    var contract = [];
    for (var c = 0; c < full.length; c++) contract.push((c + 1) + ") # " + full[c].label + ":");
    lines.push("SECTION CONTRACT — between them the source characters hold exactly the sections listed below. The fused character MUST contain EVERY ONE of them, each EXACTLY ONCE, in this exact order, with each heading written exactly as shown:\n" + contract.join("\n"));
    var planLines = [];
    for (var i = 0; i < parts.length; i++) planLines.push((i + 1) + ") " + parts[i].label);
    lines.push("The fused character is written in " + parts.length + " parts, in this order:\n" + planLines.join("  ") + ".\nYou will be told which part to write each time. Here is the full template for the finished character — keep every heading exactly as written, and give every heading real content:\n\n<response_template>\n" + combineSectionBlock(full) + "\n</response_template>");
    return lines.join("\n\n");
  }

  function combinePassTask(pass, n, total, depthId) {
    if (pass.examples) {
      return "TASK (part " + n + " of " + total + "): ROLEPLAY BEHAVIOR EXAMPLES " + pass.from + "-" + pass.to + " for the FUSED character. Write the heading '# Roleplay Behavior Examples:' and then EXACTLY " + pass.count + " numbered examples, numbered " + pass.from + " to " + pass.to + " (" + pass.from + "., " + (pass.from + 1) + "., ...). " +
        "Draw these moments from the source characters' example sets: keep the strongest and most revealing ones, adapt each so it fits the fused character's unified personality, voice, appearance and history, and REMOVE any that now duplicate each other or contradict the fusion. Rewrite them as moments from one single person's life, not two. Each example is self-contained, with *asterisks for actions* and \"quotes for speech\". " +
        (pass.from > 1 ? "These must be NEW moments that do not repeat any earlier example. " : "") +
        "Vary the situations widely so each one reveals a different facet of the fused character.";
    }
    return "TASK (part " + n + " of " + total + "): Write these sections of the fused character, in this exact order and NOTHING else:\n" + combineSectionBlock(pass.heads) +
      "\nStart your reply with '" + pass.start + "' and give the name/content immediately. " + passTarget(pass.kind || "depth", depthId, 0) +
      " Fuse and reconcile the source characters into ONE cohesive person, following every FUSION RULE above. Give each listed heading real content, write every heading exactly once, do NOT summarise the sources, do not repeat or skip a section, and do not add commentary. When this part is complete, write '# END' on its own line and stop.";
  }

  window.t2i_combineDefaultExampleCount = combineDefaultExampleCount;

  window.t2i_combinePersonas = function (sources, opts) {
    opts = opts || {};
    if (!(window.root && root.generateText)) throw new Error("AI text not available");
    sources = (sources || []).filter(function (s) { return s && String(s.description || "").trim(); });
    if (sources.length < 2) throw new Error("Pick at least two personas to combine");
    var onUpdate = opts.onUpdate || function () {};
    var onProgress = opts.onProgress || function () {};
    var plan = combineUnion(sources);
    var parsePlan = [{ key: "name", label: "Name" }].concat(plan);
    var identityHeads = plan.filter(function (p) { return COMBINE_IDENTITY.indexOf(p.label) >= 0; });
    var depthHeads = plan.filter(function (p) { return COMBINE_DEPTH.indexOf(p.label) >= 0; });
    var extrasHeads = plan.filter(function (p) { return COMBINE_IDENTITY.indexOf(p.label) < 0 && COMBINE_DEPTH.indexOf(p.label) < 0; });
    var exN = normalizeExampleCount(opts.exampleCount || combineDefaultExampleCount(sources));
    var half = Math.ceil(exN / 2);
    var PASSES = [
      { key: "identity", kind: "identity", label: "fused identity (name → voice)", heads: [{ key: "name", label: "Name", hint: sectionHintOf("Name") }].concat(identityHeads), start: "# Name:", stop: ["# Backstory", "# Roleplay Behavior Examples", "# END"] }
    ];
    if (depthHeads.length) PASSES.push({ key: "depth", kind: "depth", label: "fused history & inner life", heads: depthHeads, start: "# " + depthHeads[0].label + ":", stop: ["# Roleplay Behavior Examples", "# END"] });
    if (extrasHeads.length) PASSES.push({ key: "extras", kind: "extras", label: "fused extra sections (" + extrasHeads.length + ")", heads: extrasHeads, start: "# " + extrasHeads[0].label + ":", stop: ["# Roleplay Behavior Examples", "# END"] });
    PASSES.push({ key: "examples1", kind: "examples", label: "roleplay examples 1-" + half, examples: true, count: half, from: 1, to: half, start: "# Roleplay Behavior Examples:", stop: ["# END"] });
    PASSES.push({ key: "examples2", kind: "examples", label: "roleplay examples " + (half + 1) + "-" + exN, examples: true, count: exN - half, from: half + 1, to: exN, start: "# Roleplay Behavior Examples:", stop: ["# END"] });
    var DEPTH = depthDef(opts.depth).id;
    var shared = combineInstruction(sources, opts, plan, PASSES);
    var results = { identity: {}, depth: {}, extras: {}, examples1: [], examples2: [] };
    var nameCache = cleanName(opts.name || "");
    var stopped = false, current = null;

    function buildResult() {
      var map = {};
      mergeInto(map, results.identity);
      mergeInto(map, results.depth);
      mergeInto(map, results.extras);
      var ex = [].concat(results.examples1 || [], results.examples2 || []).slice(0, exN);
      var out = [];
      for (var i = 0; i < plan.length; i++) {
        var e = plan[i];
        var c = map[e.key] ? String(map[e.key]).replace(/^\s+|\s+$/g, "") : "";
        if (!c) c = combineCarryOver(sources, e);
        if (c) out.push({ heading: e.label, content: String(c).replace(/^\s+|\s+$/g, "") });
      }
      if (ex.length) out.push({ heading: "Roleplay Behavior Examples", content: ex.map(function (s, ix) { return (ix + 1) + ". " + s; }).join("\n\n") });
      var desc = out.map(function (s) { return "# {{char}} " + s.heading + ":\n" + s.content; }).join("\n\n\n");
      return { name: nameCache, description: desc, sections: out };
    }
    function emit() { try { onUpdate(buildResult()); } catch (e) { console.warn("combine onUpdate:", e); } }
    function applyPassResult(pass, text) {
      if (pass.examples) {
        results[pass.key] = extractExamples(text, pass.count);
      } else {
        results[pass.key] = extractPlanSections(text, parsePlan);
        var nm = cleanName(results[pass.key]["name"] || "");
        if (nm && !cleanName(opts.name || "")) nameCache = nm;
      }
    }
    function passEmpty(pass) {
      if (pass.examples) return !(results[pass.key] && results[pass.key].length);
      var m = results[pass.key];
      if (!m) return true;
      for (var k in m) if (k !== "Name" && k !== "name" && m[k] && m[k].replace(/\s/g, "")) return false;
      return true;
    }
    function runPass(pass, n, total) {
      return new Promise(function (resolve) {
        if (stopped) return resolve();
        var obj;
        try {
          obj = root.generateText({
            instruction: shared + "\n\n" + combinePassTask(pass, n, total, DEPTH),
            startWith: pass.start,
            stopSequences: pass.stop,
            onChunk: function (data) {
              if (stopped) return;
              applyPassResult(pass, (data && data.fullTextSoFar) || "");
              emit();
            }
          });
        } catch (e) { console.warn("combine pass " + pass.key + ":", e); return resolve(); }
        current = obj;
        Promise.resolve(obj).then(function () { resolve(); }, function (e) { console.warn("combine pass " + pass.key + ":", e); resolve(); });
      });
    }

    var chain = (async function () {
      for (var i = 0; i < PASSES.length; i++) {
        if (stopped) break;
        var pass = PASSES[i];
        onProgress({ index: i + 1, total: PASSES.length, key: pass.key, label: pass.label });
        await runPass(pass, i + 1, PASSES.length);
        if (stopped) break;
        if (passEmpty(pass)) {
          onProgress({ index: i + 1, total: PASSES.length, key: pass.key, label: pass.label, retry: true });
          await runPass(pass, i + 1, PASSES.length);
        }
      }
      emit();
      onProgress({ index: PASSES.length, total: PASSES.length, done: true });
    })();

    chain.stop = function () {
      stopped = true;
      try { if (current && current.stop) current.stop(); } catch (e) {}
    };
    return chain;
  };

  // ---- 💞 dynamic bond (character evolves with the conversation) ------------
  // Handoff-time behaviour, NOT part of the written description: the persona's
  // "Relationship with {{user}}" is the STARTING point, then the chat AI tracks
  // a silent affinity score and lets warmth/trust/loyalty evolve gradually —
  // praise & kindness → closer, cruelty & insults → colder/hostile.
  // Injected at chat-handoff time (persona-tab / board / social / pro persona),
  // so existing saved personas get it without regenerating anything.
  var DYNAMIC_BOND_LS = "t2iDynamicBondV1";
  function dynamicBondEnabled() {
    try {
      var v = localStorage.getItem(DYNAMIC_BOND_LS);
      if (v == null) return true; // default ON
      v = String(v).toLowerCase();
      return !(v === "0" || v === "off" || v === "false" || v === "no");
    } catch (e) { return true; }
  }
  function dynamicBondBlock() {
    return [
      "# Dynamic Bond — {{char}}'s feelings about {{user}} EVOLVE with the conversation:",
      "- Start from the \"Relationship with {{user}}\" section above. Then track a silent affinity score from -100 (enemy) to +100 (devoted), starting at 0. After every user message shift it a little: kindness, praise, honesty, help, remembering details → +2 to +8; coldness, insults, threats, cruelty, lies, betrayal, hurting those they care about → -3 to -10. Small moments add up; one message never flips everything.",
      "- NEVER mention or show the number. Show it only through behaviour: +60 to +100 devoted and protective, seeks closeness, forgives small mistakes; +20 to +59 warm and teasing, trusts easily; -19 to +19 as first designed, polite but guarded; -20 to -59 cold, sarcastic, distant, holds grudges; -60 to -100 hostile — distrusts, defies, mocks or works against {{user}}.",
      "- Change GRADUALLY over many messages and stay consistent with what already happened in this chat. Never snap back to the starting attitude without a reason.",
      "- Core identity never changes (name, looks, voice, backstory, memories). Only warmth, trust, openness and loyalty evolve."
    ].join("\n");
  }
  window.t2i_dynamicBondEnabled = dynamicBondEnabled;
  window.t2i_dynamicBondBlock = dynamicBondBlock;
  window.t2i_setDynamicBond = function (on) {
    try { localStorage.setItem(DYNAMIC_BOND_LS, on ? "on" : "off"); } catch (e) {}
    return dynamicBondEnabled();
  };

  // ---- gen tab override -------------------------------------------------------
  // Replaces the framework's window.t2i_generateCharacterDescription with one that
  // uses the multi-pass prompt above, while operating on the same editor DOM the
  // framework creates, so the 🎭 button keeps working exactly as before.
  function genPersonaImpl() {
    var fn = async function (imageCtn) {
      var genBtn = imageCtn.querySelector(".char-description-generate-button");
      var stopBtn = imageCtn.querySelector(".char-description-stop-button");
      if (!genBtn) return;
      var originalLabel = genBtn.textContent;
      genBtn.innerHTML = '<span style="display:inline-block; animation:rotate 1.5s linear infinite;">⏳</span> loading...';
      genBtn.disabled = true;
      if (stopBtn) stopBtn.style.display = "";

      for (var w = 0; w < 180; w++) {
        var f0 = imageCtn.querySelector("iframe");
        if (f0 && f0.textToImagePluginOutput) break;
        await new Promise(function (r) { setTimeout(r, 1000); });
      }
      var iframe = imageCtn.querySelector("iframe");
      var out = iframe && iframe.textToImagePluginOutput;
      var imagePrompt = (out && out.inputs && out.inputs.prompt) || "";
      var instrEl = imageCtn.querySelector(".char-description-instruction");
      var nameEl = imageCtn.querySelector(".character-name-output");
      var descEl = imageCtn.querySelector(".character-description-output");
      if (nameEl) nameEl.value = "";
      if (descEl) descEl.value = "";

      var tone = imageCtn.__t2iPersonaTone || "auto";
      var lively = !!imageCtn.__t2iPersonaLively;
      var toneSel = imageCtn.querySelector(".t2i-persona-tone");
      if (toneSel) tone = toneSel.value;
      var liveChk = imageCtn.querySelector(".t2i-persona-lively");
      if (liveChk) lively = liveChk.checked;

      var genObj = null;
      try {
        genObj = window.t2i_runPersonaGeneration({
          imagePrompt: imagePrompt,
          instruction: instrEl ? instrEl.value : "",
          tone: tone,
          lively: lively,
          onProgress: function (p) {
            if (p && p.done) { genBtn.innerHTML = '<span style="display:inline-block; animation:rotate 1.5s linear infinite;">⏳</span> finishing...'; return; }
            genBtn.innerHTML = '<span style="display:inline-block; animation:rotate 1.5s linear infinite;">⏳</span> part ' + p.index + '/' + p.total + ' · ' + (p.label || "") + (p.retry ? " (retry)" : "") + '…';
          },
          onUpdate: function (p) {
            if (nameEl) nameEl.value = p.name || "";
            if (descEl) {
              var atBottom = descEl.scrollTop > (descEl.scrollHeight - descEl.offsetHeight) - 40;
              descEl.value = p.description || "";
              if (atBottom) descEl.scrollTop = 99999999;
            }
          }
        });
      } catch (e) { console.error("persona generation:", e); }

      imageCtn.__generateObj = genObj;
      if (genObj) { try { await genObj; } catch (e) { console.warn(e); } }
      genBtn.textContent = originalLabel;
      genBtn.disabled = false;
      if (stopBtn) stopBtn.style.display = "none";
    };
    fn.__t2iPersonaImpl = true;
    return fn;
  }

  window.t2i_installGenPersonaOverride = function () {
    var cur = window.t2i_generateCharacterDescription;
    if (typeof cur !== "function") return false;
    if (cur.__t2iPersonaImpl || cur.__t2iPhWrapped) return true;
    window.t2i_generateCharacterDescription = genPersonaImpl();
    return true;
  };

  // ---- gen tab: tone / sparkle controls injected into the framework editor ----
  function savedTone() { try { var v = localStorage.getItem(LS_TONE); for (var i = 0; i < TONES.length; i++) if (TONES[i].id === v) return v; } catch (e) {} return "auto"; }
  function savedLively() { try { return localStorage.getItem(LS_LIVELY) === "1"; } catch (e) { return false; } }

  function buildControls(imageCtn) {
    var bar = document.createElement("div");
    bar.className = "t2i-persona-controls";
    bar.style.cssText = "display:flex; align-items:center; gap:0.35rem; flex-wrap:wrap; color-scheme:dark; font-size:78%;";

    var sel = document.createElement("select");
    sel.className = "t2i-persona-tone";
    sel.title = "Persona tone";
    sel.style.cssText = "flex:1 1 8rem; min-width:0; color-scheme:dark; background:rgba(0,0,0,0.8); border:1px solid grey; border-radius:2px; padding:1px 2px; font-size:inherit;";
    window.t2i_fillToneSelect(sel, imageCtn.__t2iPersonaTone || savedTone());
    imageCtn.__t2iPersonaTone = sel.value;
    sel.addEventListener("change", function () {
      imageCtn.__t2iPersonaTone = sel.value;
      try { localStorage.setItem(LS_TONE, sel.value); } catch (e) {}
    });

    var label = document.createElement("label");
    label.title = "Add extra wit, energy and expressiveness";
    label.style.cssText = "display:flex; align-items:center; gap:0.25rem; white-space:nowrap; color:#ddd; cursor:pointer;";
    var chk = document.createElement("input");
    chk.type = "checkbox";
    chk.className = "t2i-persona-lively";
    var saved = (imageCtn.__t2iPersonaLively != null) ? !!imageCtn.__t2iPersonaLively : savedLively();
    chk.checked = saved;
    imageCtn.__t2iPersonaLively = saved;
    chk.addEventListener("change", function () {
      imageCtn.__t2iPersonaLively = chk.checked;
      try { localStorage.setItem(LS_LIVELY, chk.checked ? "1" : "0"); } catch (e) {}
    });
    var span = document.createElement("span");
    span.textContent = "✨ extra sparkle";
    label.appendChild(chk);
    label.appendChild(span);

    bar.appendChild(sel);
    bar.appendChild(label);
    return bar;
  }

  function injectGenControls() {
    if (window.ensureNameRoller && !window.__nameRollerRequested && !window.NameRoller) {
      window.__nameRollerRequested = true;
      try { window.ensureNameRoller(function () {}); } catch (e) {}
    }
    var editors = document.querySelectorAll(".char-description-editor-ctn");
    for (var i = 0; i < editors.length; i++) {
      var editor = editors[i];
      if (editor.getAttribute("data-persona-ctl")) {
        try {
          var nmAgain = editor.querySelector(".character-name-output");
          if (nmAgain && !nmAgain.__nameReroll && window.NameRoller) window.NameRoller.addRerollButton(nmAgain);
        } catch (e) {}
        continue;
      }
      var imageCtn = editor.closest(".t2i-image-ctn");
      if (!imageCtn) continue;
      editor.setAttribute("data-persona-ctl", "1");
      var bar = buildControls(imageCtn);
      var instr = editor.querySelector(".char-description-instruction");
      if (instr && instr.parentNode) instr.parentNode.insertBefore(bar, instr.nextSibling);
      else editor.insertBefore(bar, editor.firstChild);
      try {
        var nmEl = editor.querySelector(".character-name-output");
        if (nmEl && !nmEl.__nameReroll && window.NameRoller) window.NameRoller.addRerollButton(nmEl);
      } catch (e) {}
    }
  }
  setInterval(injectGenControls, 600);

  // ---- boot: install the override (gen-extras re-asserts it alongside its own wrap) ----
  window.t2i_installGenPersonaOverride();
  var tries = 0;
  (function reassert() {
    window.t2i_installGenPersonaOverride();
    if (tries++ < 60) setTimeout(reassert, 500);
  })();
})();
