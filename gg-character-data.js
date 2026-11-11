window.GGCHARACTER = {
keys: ["bgGender","bgFantasyRace","bgHeight","bgHairLength","bgHairAccessories","bgLipShape","bgFaceDetails","bgSkinTone","bgSkinFinish","bgScars","bgBodyHair","bgTattoo","bgAccessories","bgPiercings","bgInnerTop","bgInnerBottom","bgFantasyFeatures","bgBodyDetails","bgArchetype","bgHeldProp","bgScene","bgDesignTheme","bgOverallTheme","bgImageBackground","bgExtravaganza","bgCuteness"],
sections: [
["🧬 Character", ["bgGender","bgFantasyRace","bgHeight","bgHairLength","bgHairAccessories","bgLipShape","bgFaceDetails","bgSkinTone","bgSkinFinish","bgFantasyFeatures","bgBodyDetails"]],
["💫 Body Mods & Extras", ["bgScars","bgBodyHair","bgTattoo","bgAccessories","bgPiercings","bgHeldProp","bgArchetype","bgCuteness"]],
["🎬 Scene & Theme", ["bgInnerTop","bgInnerBottom","bgScene","bgDesignTheme","bgOverallTheme","bgImageBackground","bgExtravaganza"]]
],
inputs: {
bgGender: { label: "⚧ Gender", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgGenderPool"}},
{n:"Female",p:"feminine woman, female features"},{n:"Male",p:"masculine man, male features"},
{n:"Androgynous",p:"androgynous person, soft blend of masculine and feminine traits"},
{n:"Feminine nonbinary",p:"feminine-presenting nonbinary person"},{n:"Masculine nonbinary",p:"masculine-presenting nonbinary person"},
{n:"Trans woman",p:"transgender woman, feminine features"},{n:"Trans man",p:"transgender man, masculine features"}]},
bgFantasyRace: { label: "🧝 Fantasy Race", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgFantasyRacePool"}},
{n:"Human",p:"human"},{n:"Elf",p:"elegant elf with pointed ears"},
{n:"Dark elf",p:"dark elf with dusky skin and pointed ears"},{n:"Orc",p:"orc with tusks and strong build"},
{n:"Tiefling",p:"tiefling with horns and long tail"},{n:"Vampire",p:"vampire with pale skin and fangs"},
{n:"Werewolf",p:"werewolf-human hybrid with wolf ears and fangs"},{n:"Fairy",p:"tiny fairy with delicate translucent wings"},
{n:"Mermaid",p:"mermaid with shimmering fish tail"},{n:"Angel",p:"angel with white feathered wings and halo"},
{n:"Demon",p:"demon with horns, dark wings and glowing eyes"},{n:"Cyborg",p:"cyborg with visible mechanical implants"}]},
bgHeight: { label: "📏 Height", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgHeightPool"}},
{n:"Petite",p:"petite short woman, around 150cm"},{n:"Short",p:"short stature, around 160cm"},
{n:"Average",p:"average height, around 168cm"},{n:"Tall",p:"tall woman, around 178cm"},
{n:"Very tall",p:"very tall statuesque woman, around 188cm"},{n:"Amazonian",p:"towering amazonian build, over 190cm"}]},
bgHairLength: { label: "💇 Hair Length", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgHairLengthPool"}},
{n:"Bald",p:"bald head, shaved smooth"},{n:"Buzz cut",p:"very short buzz cut hair"},
{n:"Short",p:"short cropped hair"},{n:"Bob",p:"chin-length bob haircut"},
{n:"Shoulder",p:"shoulder-length hair"},{n:"Long",p:"long flowing hair past the chest"},
{n:"Waist-length",p:"very long hair reaching the waist"},{n:"Floor-length",p:"extremely long hair reaching the floor"}]},
bgHairAccessories: { label: "🎀 Hair Accessories", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgHairAccessoriesPool"}},
{n:"None",p:"no hair accessories"},{n:"Ribbon",p:"pretty ribbon tied in the hair"},
{n:"Bow",p:"cute bow hair accessory"},{n:"Headband",p:"stylish headband"},
{n:"Hairpins",p:"decorative hairpins"},{n:"Flower crown",p:"flower crown in the hair"},
{n:"Tiara",p:"delicate tiara"},{n:"Hat clip",p:"small hat clipped into the hair"}]},
bgLipShape: { label: "👄 Lip Shape", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgLipShapePool"}},
{n:"Thin",p:"thin elegant lips"},{n:"Full",p:"full luscious lips"},
{n:"Pouty",p:"pouty lips"},{n:"Wide smile",p:"wide smiling lips"},
{n:"Heart-shaped",p:"heart-shaped lips"},{n:"Plump",p:"plump soft lips"}]},
bgFaceDetails: { label: "😊 Face Details", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgFaceDetailsPool"}},
{n:"Freckles",p:"cute freckles across nose and cheeks"},{n:"Beauty mark",p:"small beauty mark near the lips"},
{n:"Dimples",p:"charming dimples when smiling"},{n:"Rosy cheeks",p:"rosy blushing cheeks"},
{n:"Sharp jawline",p:"defined sharp jawline"},{n:"Soft round face",p:"soft round youthful face"},
{n:"High cheekbones",p:"high defined cheekbones"},{n:"Cleft chin",p:"subtle cleft chin"}]},
bgSkinTone: { label: "☀️ Skin Tone", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgSkinTonePool"}},
{n:"Porcelain",p:"pale porcelain skin"},{n:"Fair",p:"fair light skin"},
{n:"Medium",p:"medium natural skin tone"},{n:"Olive",p:"olive skin tone"},
{n:"Tan",p:"sun-tanned skin"},{n:"Brown",p:"warm brown skin"},
{n:"Dark",p:"rich dark skin"},{n:"Ebony",p:"deep ebony skin"}]},
bgSkinFinish: { label: "✨ Skin Finish", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgSkinFinishPool"}},
{n:"Matte",p:"natural matte skin"},{n:"Dewy",p:"fresh dewy glowing skin"},
{n:"Oily sheen",p:"skin with a light oily sheen"},{n:"Sweaty",p:"lightly sweaty glistening skin"},
{n:"Glittery",p:"skin with subtle glitter shimmer"},{n:"Wet",p:"wet rain-soaked skin"}]},
bgScars: { label: "🩹 Scars / Birthmarks", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgScarsPool"}},
{n:"None",p:"flawless skin, no scars or marks"},{n:"Cheek scar",p:"thin scar across one cheek"},
{n:"Eye scar",p:"small scar through one eyebrow"},{n:"Lip scar",p:"faint scar on the lip"},
{n:"Shoulder birthmark",p:"small birthmark on the shoulder"},{n:"Back tattoo scar",p:"faded scar on the back"},
{n:"Battle scars",p:"several faded battle scars on arms"}]},
bgBodyHair: { label: "🦰 Body Hair", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgBodyHairPool"}},
{n:"Smooth",p:"smooth hairless body"},{n:"Natural",p:"natural light body hair"},
{n:"Armpit hair",p:"natural armpit hair"},{n:"Hairy arms",p:"visible arm hair"},
{n:"Hairy legs",p:"natural leg hair"}]},
bgTattoo: { label: "🖊️ Tattoo", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgTattooPool"}},
{n:"None",p:"no tattoos"},{n:"Small wrist",p:"small delicate wrist tattoo"},
{n:"Shoulder",p:"floral shoulder tattoo"},{n:"Sleeve",p:"full arm tattoo sleeve"},
{n:"Back piece",p:"large detailed back tattoo"},{n:"Thigh",p:"thigh tattoo"},
{n:"Neck",p:"small neck tattoo"},{n:"Tribal",p:"tribal pattern tattoos"}]},
bgAccessories: { label: "💍 Accessories", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgAccessoriesPool"}},
{n:"None",p:"no accessories"},{n:"Necklace",p:"delicate necklace"},
{n:"Earrings",p:"elegant earrings"},{n:"Bracelets",p:"stacked bracelets"},
{n:"Rings",p:"several rings"},{n:"Watch",p:"stylish wristwatch"},
{n:"Choker",p:"black choker necklace"},{n:"Sunglasses",p:"sunglasses on the head"}]},
bgPiercings: { label: "📌 Piercings", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgPiercingsPool"}},
{n:"None",p:"no piercings"},{n:"Earlobes",p:"simple earlobe piercings"},
{n:"Multiple ear",p:"multiple ear piercings"},{n:"Nose stud",p:"small nose stud"},
{n:"Nose ring",p:"nose ring"},{n:"Lip ring",p:"lip ring piercing"},
{n:"Eyebrow",p:"eyebrow piercing"},{n:"Navel",p:"navel piercing"}]},
bgInnerTop: { label: "💜 Inner Top", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgInnerTopPool"}},
{n:"Bra",p:"lace bra under the outer layer"},{n:"Sports bra",p:"sports bra underneath"},
{n:"Camisole",p:"silky camisole underneath"},{n:"Bodysuit",p:"fitted bodysuit underneath"},
{n:"Corset",p:"laced corset underneath"},{n:"Bikini top",p:"bikini top underneath"}]},
bgInnerBottom: { label: "🩲 Inner Bottom", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgInnerBottomPool"}},
{n:"Panties",p:"lacy panties"},{n:"Boyshorts",p:"boyshort underwear"},
{n:"Thong",p:"thong underwear"},{n:"Bikini bottom",p:"bikini bottom"},
{n:"Shorts liner",p:"short athletic shorts underneath"}]},
bgFantasyFeatures: { label: "🧚 Fantasy Features", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgFantasyFeaturesPool"}},
{n:"None",p:"no fantasy features"},{n:"Elf ears",p:"long pointed elf ears"},
{n:"Horns",p:"curved demonic horns"},{n:"Wings",p:"large feathered wings"},
{n:"Tail",p:"long slender tail"},{n:"Glowing eyes",p:"softly glowing eyes"},
{n:"Runes",p:"glowing magical runes on the skin"},{n:"Scales",p:"patches of iridescent scales"}]},
bgBodyDetails: { label: "💥 Body Details", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgBodyDetailsPool"}},
{n:"Athletic abs",p:"toned athletic abs"},{n:"Soft belly",p:"soft natural belly"},
{n:"Muscular arms",p:"defined muscular arms"},{n:"Strong thighs",p:"strong thick thighs"},
{n:"Slender",p:"slender delicate frame"},{n:"Curvy",p:"curvy voluptuous figure"},
{n:"Veins",p:"subtle visible veins on hands and arms"}]},
bgArchetype: { label: "🎭 Archetype / Role", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgArchetypePool"}},
{n:"Warrior",p:"battle-hardened warrior"},{n:"Mage",p:"mysterious robed mage"},
{n:"Nurse",p:"kind nurse in uniform"},{n:"Teacher",p:"strict teacher with glasses"},
{n:"Maid",p:"maid in classic uniform"},{n:"Idol",p:"cheerful stage idol"},
{n:"Knight",p:"noble knight in armor"},{n:"Witch",p:"enigmatic witch with hat"},
{n:"Scientist",p:"focused scientist in lab coat"},{n:"Detective",p:"sharp-eyed detective"}]},
bgHeldProp: { label: "🎒 Held Item / Prop", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgHeldPropPool"}},
{n:"None",p:"empty hands"},{n:"Sword",p:"holding an ornate sword"},
{n:"Staff",p:"holding a wooden magic staff"},{n:"Book",p:"holding an old book"},
{n:"Umbrella",p:"holding a lace umbrella"},{n:"Flower",p:"holding a single rose"},
{n:"Lantern",p:"holding a glowing lantern"},{n:"Phone",p:"holding a smartphone"},
{n:"Guitar",p:"holding an acoustic guitar"},{n:"Cup",p:"holding a steaming cup"}]},
bgScene: { label: "🎯 Scene", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgScenePool"}},
{n:"Bedroom",p:"cozy bedroom scene"},{n:"Beach",p:"sunny beach scene"},
{n:"Forest",p:"lush forest clearing"},{n:"City night",p:"neon city street at night"},
{n:"Castle",p:"grand castle hall"},{n:"Tavern",p:"warm medieval tavern"},
{n:"Garden",p:"blooming flower garden"},{n:"Snow",p:"quiet snowy landscape"}]},
bgDesignTheme: { label: "🎨 Design Theme", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgDesignThemePool"}},
{n:"Casual",p:"casual everyday outfit design"},{n:"Elegant",p:"elegant refined outfit design"},
{n:"Gothic",p:"gothic dark outfit design"},{n:"Cyberpunk",p:"cyberpunk techwear outfit design"},
{n:"Fantasy",p:"fantasy adventurer outfit design"},{n:"Streetwear",p:"trendy streetwear outfit design"},
{n:"Vintage",p:"vintage retro outfit design"}]},
bgOverallTheme: { label: "🌅 Overall Theme", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgOverallThemePool"}},
{n:"Cheerful",p:"bright cheerful mood"},{n:"Dark",p:"dark moody atmosphere"},
{n:"Romantic",p:"soft romantic mood"},{n:"Mysterious",p:"mysterious enigmatic mood"},
{n:"Playful",p:"playful lighthearted mood"},{n:"Dramatic",p:"dramatic cinematic mood"}]},
bgImageBackground: { label: "🖼️ Image Background", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgImageBackgroundPool"}},
{n:"Plain white",p:"plain white background"},{n:"Studio grey",p:"neutral grey studio background"},
{n:"Sunset",p:"warm sunset sky background"},{n:"Night sky",p:"starry night sky background"},
{n:"Bokeh city",p:"blurred city lights bokeh background"},{n:"Nature blur",p:"softly blurred nature background"}]},
bgExtravaganza: { label: "🌟 Extravaganza", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgExtravaganzaPool"}},
{n:"Subtle",p:"subtle understated styling"},{n:"Glamorous",p:"glamorous red-carpet styling"},
{n:"Over the top",p:"extravagant over-the-top styling with dramatic flair"},
{n:"Royal",p:"royal luxurious styling with gold accents"},{n:"Festival",p:"colorful festival styling with confetti"}]},
bgCuteness: { label: "🥰 Cuteness", opts: [
{n:"Default",p:""},{n:"🎲 Random",r:{pool:"bgCutenessPool"}},
{n:"Natural",p:"natural understated look"},{n:"Cute",p:"cute charming look with soft smile"},
{n:"Kawaii",p:"kawaii look with big sparkling eyes and blushing cheeks"},
{n:"Cuteness Bomb",p:"overwhelmingly cute kawaii aura, adorable expression"},
{n:"Seductive cute",p:"cute yet teasingly seductive charm"}]
}},
pools: {}
};
(function(){
var G = window.GGCHARACTER;
Object.keys(G.inputs).forEach(function(id){
var o = G.inputs[id], arr = [];
o.opts.forEach(function(op){ if(op.p) arr.push({n:op.n, p:op.p}); });
G.pools[id+"Pool"] = arr;
});
})();
