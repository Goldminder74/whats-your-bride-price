import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neutralizeCsvFormula, validateQuestionBankDocument } from "../db/questionBankContracts.ts";
import { buildLegacyQuestionBankDocument, previewQuestionBankImport } from "../db/questionBankWorkflow.ts";

const ACCESS_DATE = "2026-09-06";
const RESEARCH_REVIEWER = "Southern Africa research triage (not cultural approval)";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(root, "data/question-bank/southern-africa");
const priorDraftFiles = ["west-africa/west-africa-draft-v1.json", "east-africa/east-africa-draft-v1.json", "north-africa/north-africa-draft-v1.json", "central-africa/central-africa-draft-v1.json"].map((path) => resolve(root, "data/question-bank", path));

function source(title, urlOrReference, relevantClaim) {
  return Object.freeze({ title, organisationOrAuthor: urlOrReference.startsWith("https://ich.unesco.org/") ? "UNESCO Intangible Cultural Heritage" : "UNESCO World Heritage Centre", urlOrReference, publicationDate: null, accessDate: ACCESS_DATE, sourceType: "heritage", reviewStatus: "approved", relevantClaim });
}

const sources = Object.freeze({
  dikopelo: source("Dikopelo folk music of Bakgatla ba Kgafela in Kgatleng District", "https://ich.unesco.org/en/USL/dikopelo-folk-music-of-bakgatla-ba-kgafela-in-kgatleng-district-01290", "Dikopelo is communal vocal music and patterned choreography without instruments, transmitted across generations and adapted from farmland gatherings to village settings."),
  pottery: source("Earthenware pottery-making skills in Botswana's Kgatleng District", "https://ich.unesco.org/en/USL/earthenware-pottery-making-skills-in-botswana-s-kgatleng-district-00753", "Bakgatla ba Kgafela women hand-build pottery from local materials, fire it in pit kilns and transmit skills through observation and practice; the craft needs urgent safeguarding."),
  seperu: source("Seperu folkdance and associated practices", "https://ich.unesco.org/en/USL/seperu-folkdance-and-associated-practices-01502", "Veekuhane Seperu combines singing, dancing and sacred practices at important life milestones; public descriptions identify layered mushishi dresses and intergenerational transmission."),
  oshituthi: source("Oshituthi shomagongo, marula fruit festival", "https://ich.unesco.org/en/RL/oshituthi-shomagongo-marula-fruit-festival-01089", "Eight Aawambo communities in northern Namibia prepare omagongo from marula fruit and gather for food, hospitality, songs, histories, dance and intergenerational learning."),
  namaMusic: source("Aboxan Musik ǀŌb ǂÂns tsî ǁKhasigu, ancestral musical sound knowledge and skills", "https://ich.unesco.org/en/RL/mbira-01540", "Nama ancestral music uses instruments including khab, !guitsib and vlies with singing and Nama≠Nāb dance; UNESCO adopted the community-requested current name in 2023."),
  twyfelfontein: source("Twyfelfontein or /Ui-//aes", "https://whc.unesco.org/en/list/1255", "Namibia's Twyfelfontein or /Ui-//aes preserves a major concentration of rock engravings and painted shelters linked to hunter-gatherer ritual and reliable water over at least two millennia."),
  richtersveld: source("Richtersveld Cultural and Botanical Landscape", "https://whc.unesco.org/en/list/1265", "The communally managed Richtersveld sustains Nama seasonal pastoralism, grazing, plant knowledge, oral traditions and portable mat-roofed |haru oms in north-west South Africa."),
  khomani: source("ǂKhomani Cultural Landscape", "https://whc.unesco.org/en/list/1545", "The ǂKhomani Cultural Landscape at South Africa's borders with Botswana and Namibia records long San presence, desert adaptation, ethnobotanical knowledge and language recovery."),
  robben: source("Robben Island", "https://whc.unesco.org/en/list/916", "Robben Island's surviving prison, hospital, military and religious buildings document a long history of isolation and the eventual triumph of democracy and freedom over oppression and racism."),
  humanRights: source("Human Rights, Liberation and Reconciliation: Nelson Mandela Legacy Sites", "https://whc.unesco.org/en/list/1676", "Fourteen South African places of memory connect the twentieth-century struggle against apartheid with human rights, liberation, reconciliation, non-racialism, Pan-Africanism and ubuntu."),
  maloti: source("Maloti-Drakensberg Park", "https://whc.unesco.org/en/list/985", "The transboundary South Africa-Lesotho mountain property combines distinctive geology, biodiversity, watersheds and a dense record of San rock art created over four millennia."),
  thaba: source("Thaba-Bosiu National Monument", "https://whc.unesco.org/en/tentativelists/5392", "Lesotho's tentative-list monument is a plateau in the Phuthiatsana Valley about 23 kilometres south-east of Maseru, associated with Moshoeshoe I and Basotho nation-building from 1824."),
  ngwenya: source("Ngwenya Mines", "https://whc.unesco.org/en/tentativelists/5421", "Eswatini's tentative-list Ngwenya Mines preserve evidence of ancient red ochre and specularite extraction, later iron working and modern mining history in the Hhohho region."),
  khami: source("Khami Ruins National Monument", "https://whc.unesco.org/en/list/365", "Khami near Bulawayo was the Torwa dynasty's capital after Great Zimbabwe; its dry-stone platforms, decorated walls and imported objects document occupation from about 1450 to 1650."),
  matobo: source("Matobo Hills", "https://whc.unesco.org/en/list/306", "Zimbabwe's Matobo Hills combine distinctive granite landforms, long human occupation, dense rock art and living sacred places that remain important to local communities."),
  mosi: source("Mosi-oa-Tunya / Victoria Falls", "https://whc.unesco.org/en/list/509", "The Zambia-Zimbabwe transboundary property centres on the Zambezi River's great curtain of falling water, basalt gorges, spray-dependent ecology and jointly managed protected areas."),
  mooba: source("Mooba dance of the Lenje ethnic group of Central Province of Zambia", "https://ich.unesco.org/en/RL/mooba-dance-of-the-lenje-ethnic-group-of-central-province-of-zambia-01372", "Lenje Mooba is performed by women and men in Central, Copperbelt and Lusaka Provinces, combining dance, drumming, song and public social transmission with spiritual and healing meanings."),
});

const sensitive = Object.freeze({
  living: "Living cultural practice: require review by practitioners from the named community and do not generalize beyond the documented scope.",
  sacred: "Sacred or restricted material: retain only public-source detail and require community knowledge-holder review before any progression.",
  indigenous: "Indigenous terminology, rights and knowledge require community-led review; historical labels must not override current self-identification.",
  colonial: "Colonialism, apartheid, political imprisonment or violence: trauma-informed historical and community review is required.",
  gender: "Gendered roles are source-specific descriptions, not universal rules; require locally grounded, gender-aware review.",
  archaeology: "Archaeology and ancient political history require local heritage review; do not map past cultures directly onto modern identities.",
  environment: "Environmental knowledge and protected-area framing require local and Indigenous rights review alongside conservation evidence.",
  classification: "Regional or national classification is editorial, not a claim of uniform identity; require local review of cross-border framing.",
});

function topic(id, sourceKey, countryScope, subregionScope, communityScope, facts) { return { id, sourceKey, countryScope, subregionScope, communityScope, facts }; }
const topics = [
  topic("bw_dikopelo", "dikopelo", "Botswana", "Kgatleng District", "Bakgatla ba Kgafela communities", [
    ["form", "MUSIC", "Which description best fits Dikopelo music?", "Choir singing with patterned dance and no instruments", ["Solo harp music", "A brass-band march", "A masked drum contest"], "UNESCO describes communal vocal music joined to patterned choreography.", sensitive.living],
    ["members", "TRADITION", "Who participates in Dikopelo in UNESCO's account?", "Men, women and children", ["Only visiting musicians", "Only hereditary chiefs", "Only schoolteachers"], "The practice is communal and spans generations.", sensitive.living],
    ["origins", "HISTORY", "In what setting did Dikopelo develop as a communal event?", "On farmlands", ["In coastal shipyards", "Inside mines", "At airport terminals"], "Choirs later moved towards villages as farming participation declined.", sensitive.living],
    ["today", "MODERN HISTORY", "What contemporary aim is linked to Dikopelo revival efforts?", "Sharing positive community messages with young people", ["Ending all choral competition", "Replacing Setswana with another language", "Restricting performances to tourists"], "Practitioners connect safeguarding with positive social messages.", sensitive.living],
  ]),
  topic("bw_pottery", "pottery", "Botswana", "Kgatleng District", "Bakgatla ba Kgafela women potters", [
    ["method", "ART", "How are Kgatleng earthenware pots formed?", "They are hand-built from the base to the rim", ["They are blown from glass", "They are carved from one stone", "They are woven from wool"], "The pots are slab-built by hand and smoothed with a wooden paddle.", sensitive.gender],
    ["firing", "ART", "Where are the decorated Kgatleng pots fired?", "In a pit kiln", ["In a blast furnace", "In seawater", "Under glacier ice"], "Pit firing follows shaping and decoration.", sensitive.living],
    ["materials", "ART", "Which material is documented in the Kgatleng pottery process?", "Weathered sandstone", ["Marble mosaic", "Aluminium foil", "Synthetic rubber"], "The documented materials also include clay soil, iron oxide and organic fuels.", sensitive.environment],
    ["transmission", "TRADITION", "How have Kgatleng pottery skills traditionally passed between generations?", "Through observation and practice", ["Through military drill", "Through printed patents only", "Through overseas auctions"], "UNESCO describes daughters and granddaughters learning alongside master potters.", sensitive.gender],
  ]),
  topic("bw_seperu", "seperu", "Botswana", "Chobe District", "Veekuhane communities", [
    ["elements", "MUSIC", "Which arts are part of public descriptions of Seperu?", "Singing and dancing", ["Stone carving and metal casting", "Poetry without movement", "Puppet theatre only"], "Seperu combines performance with sacred practices that require disclosure boundaries.", sensitive.sacred],
    ["milestones", "TRADITION", "When is Seperu performed according to UNESCO?", "At ceremonies marking important life milestones", ["Only during parliamentary elections", "Only at football finals", "Only during lunar eclipses"], "The practice is tied to specific Veekuhane community occasions.", sensitive.sacred],
    ["dress", "TEXTILES", "What garment is associated with women dancing Seperu?", "A layered mushishi dress", ["A wool ski suit", "A Roman toga", "A sailor uniform"], "The layered dress is moved during the dance and is sometimes likened to a peacock tail.", sensitive.gender],
    ["status", "MODERN HISTORY", "Why is Seperu on UNESCO's Urgent Safeguarding List?", "Its transmission and continued practice are at risk", ["It has no living practitioners by definition", "It was invented for the inscription", "It is legally banned in Botswana"], "Safeguarding status signals risk, not cultural importance or ownership.", sensitive.living],
  ]),
  topic("na_oshituthi", "oshituthi", "Namibia", "Northern Namibia", "Eight Aawambo communities", [
    ["drink", "FOOD", "What fruit is used to make omagongo for Oshituthi shomagongo?", "Marula", ["Olive", "Coconut", "Blueberry"], "Omagongo is prepared from ripe marula fruit.", sensitive.living],
    ["season", "TRADITION", "When does Oshituthi shomagongo usually take place?", "Between March and April", ["Only in December", "Every leap-day", "Throughout all twelve months"], "The two-to-three-day gathering follows the marula season.", sensitive.living],
    ["hospitality", "FOOD", "What happens after the omagongo fermentation is complete?", "Community members and guests share it with traditional cuisine", ["The drink is discarded", "Only judges may taste it", "The gathering moves to another country"], "Hospitality, food and social gathering are central to the public account.", sensitive.living],
    ["learning", "TRADITION", "How do younger people learn during marula processing?", "Through observation, participation and emulation", ["Only by written examination", "Only through radio adverts", "By avoiding older practitioners"], "Preparation brings generations together to exchange skills and histories.", sensitive.gender],
  ]),
  topic("na_nama_music", "namaMusic", "Namibia", "Nama communities in Namibia", "Nama musicians and dancers", [
    ["bow", "MUSIC", "What is the khab in Nama ancestral music?", "A musical bow", ["A clay cooking pot", "A stone tower", "A woven basket"], "UNESCO lists the khab among the tradition's instruments.", sensitive.indigenous],
    ["guitar", "MUSIC", "Which name identifies a traditional guitar in this Nama practice?", "!guitsib", ["Omagongo", "Buyombo", "Mushishi"], "The current public description pairs !guitsib with khab and vlies.", sensitive.indigenous],
    ["dance", "LANGUAGE", "What does Nama≠Nāb refer to in the updated UNESCO description?", "Nama dancing steps", ["A mountain pass", "A pottery kiln", "A court title"], "UNESCO adopted this community-requested terminology in 2023.", sensitive.indigenous],
    ["purpose", "MODERN HISTORY", "Besides entertainment, how is the music used?", "To educate and instruct community members", ["To replace all spoken teaching", "To set national tax rates", "To issue passports"], "The source gives environmental awareness as one example.", sensitive.living],
  ]),
  topic("na_twyfelfontein", "twyfelfontein", "Namibia", "Kunene Region", "San hunter-gatherer heritage and present custodians", [
    ["art", "ART & HISTORY", "What kind of art is especially concentrated at Twyfelfontein or /Ui-//aes?", "Rock engravings", ["Oil paintings on canvas", "Stained-glass windows", "Bronze equestrian statues"], "The property also includes painted rock shelters.", sensitive.archaeology],
    ["animals", "ART", "Which animal is among those shown in Twyfelfontein engravings?", "Rhinoceros", ["Polar bear", "Kangaroo", "Walrus"], "UNESCO also names elephants, ostriches and giraffes.", sensitive.archaeology],
    ["timespan", "HISTORY", "For at least how long does the site's rock art record hunter-gatherer ritual practices?", "Two millennia", ["Two decades", "Two centuries", "Twenty years"], "The high-quality record extends over at least 2,000 years.", sensitive.indigenous],
    ["water", "GEOGRAPHY", "What environmental feature helped nurture seasonal communities near the rock art?", "A reliable aquifer", ["A permanent glacier", "A coral reef", "A tidal lagoon"], "UNESCO links ritual and economic practices to dependable water.", sensitive.environment],
  ]),
  topic("za_richtersveld", "richtersveld", "South Africa", "Northern Cape", "Nama pastoralists and Richtersveld community", [
    ["ownership", "TRADITION", "How is the Richtersveld cultural landscape managed?", "Communally", ["As a private airport", "By an overseas monarchy", "As an uninhabited naval base"], "Communal ownership and management support the living cultural landscape.", sensitive.indigenous],
    ["movement", "GEOGRAPHY", "What seasonal practice shapes Nama life in the Richtersveld?", "Moving between grazing areas and stockposts", ["Deep-sea fishing migrations", "Glacier climbing", "Rice-terrace flooding"], "This form of transhumance is tied to the arid landscape.", sensitive.environment],
    ["house", "ART", "What is a |haru om?", "A portable mat-roofed house", ["A stone prison", "A copper mine", "A river ferry"], "Portable dwellings accompany seasonal pastoral movement.", sensitive.indigenous],
    ["plants", "ORAL HISTORY", "Which knowledge is associated with places in the Richtersveld?", "Medicinal and other plant knowledge", ["Arctic whaling routes", "Tea plantation machinery", "Subway engineering"], "Plant knowledge and oral traditions are connected to the landscape.", sensitive.indigenous],
  ]),
  topic("za_khomani", "khomani", "South Africa", "Northern Cape borderlands", "ǂKhomani San communities", [
    ["borders", "GEOGRAPHY", "The ǂKhomani Cultural Landscape lies near South Africa's borders with which countries?", "Botswana and Namibia", ["Kenya and Uganda", "Ghana and Togo", "Morocco and Algeria"], "Its Kalahari setting crosses modern ecological and cultural borders.", sensitive.classification],
    ["adaptation", "HISTORY", "What long-term skill does the ǂKhomani landscape demonstrate?", "Adaptation to desert conditions", ["Navigation through pack ice", "Rice farming on deltas", "Building ocean-going galleons"], "The landscape records interaction with a harsh desert environment.", sensitive.indigenous],
    ["knowledge", "PEOPLES & LANGUAGE", "Which knowledge system is highlighted in the ǂKhomani landscape?", "Ethnobotanical knowledge", ["Only industrial chemistry", "Only written maritime law", "Only orchestral notation"], "Living plant and veld knowledge require community-led review.", sensitive.indigenous],
    ["language", "LANGUAGE", "What cultural recovery concern is linked to the ǂKhomani landscape?", "Knowledge held by the last speakers of !Ui-Taa languages", ["A single official European dialect", "A lost Roman alphabet", "An invented tourist language"], "Language work is part of reclaiming knowledge and identity.", sensitive.indigenous],
  ]),
  topic("za_robben", "robben", "South Africa", "Western Cape", "Former prisoners, affected communities and heritage custodians", [
    ["uses", "HISTORY", "Which use formed part of Robben Island's history?", "A prison", ["A royal tea plantation", "A mountain kingdom", "A desert caravan station"], "The island also served hospital and military functions.", sensitive.colonial],
    ["prisoners", "MODERN HISTORY", "Who was held in Robben Island's maximum-security prison?", "Political prisoners", ["Only visiting athletes", "Only merchant sailors", "Only museum curators"], "This history is central to the island's twentieth-century meaning.", sensitive.colonial],
    ["meaning", "PHILOSOPHY", "What broad transition does UNESCO associate with Robben Island?", "Democracy and freedom overcoming oppression and racism", ["Pastoralism replacing mining", "A monarchy replacing elections", "A glacier replacing a harbour"], "The site's meaning depends on memory, resistance and human dignity.", sensitive.colonial],
    ["layers", "ART & HISTORY", "What do Robben Island's surviving buildings reveal?", "Successive prison, hospital, military and religious uses", ["Only one period of occupation", "A prehistoric farming village alone", "A modern theme park"], "The built landscape records several overlapping histories.", sensitive.colonial],
  ]),
  topic("za_rights", "humanRights", "South Africa", "Fourteen sites around South Africa", "Liberation-struggle communities and custodians", [
    ["count", "MODERN HISTORY", "How many component places make up the Nelson Mandela Legacy Sites property?", "Fourteen", ["Four", "Forty", "One hundred"], "The serial property links places across South Africa.", sensitive.colonial],
    ["sharpeville", "HISTORY", "What do the Sharpeville Sites commemorate?", "The killing of 69 people protesting unjust Pass Laws", ["The opening of a gold mine", "A royal wedding", "A football championship"], "The question requires trauma-informed historical review.", sensitive.colonial],
    ["mqhekezweni", "HISTORY", "Which component is linked to Nelson Mandela's youth and traditional leadership?", "The Great Place at Mqhekezweni", ["The Devil's Cataract", "Thaba-Bosiu", "Twyfelfontein"], "The site is one of fourteen connected places of memory.", sensitive.colonial],
    ["ideas", "PHILOSOPHY", "Which set of ideas is central to the serial property's interpretation?", "Human rights, liberation and reconciliation", ["Conquest, extraction and isolation", "Navigation, astronomy and trade winds", "Mining, taxation and railways"], "UNESCO connects these ideas with non-racialism, Pan-Africanism and ubuntu.", sensitive.colonial],
  ]),
  topic("ls_za_maloti", "maloti", "Lesotho; South Africa", "Maloti-Drakensberg mountains", "Basotho, neighbouring communities and San heritage custodians", [
    ["parts", "GEOGRAPHY", "Which two areas form the Maloti-Drakensberg Park?", "Sehlabathebe National Park and uKhahlamba Drakensberg Park", ["Robben Island and Khami", "Ngwenya and Twyfelfontein", "Kgatleng and Chobe"], "The property joins Lesotho and South Africa.", sensitive.classification],
    ["rock", "ART & HISTORY", "What cultural record is especially dense in the Maloti-Drakensberg Park?", "San rock paintings", ["Medieval stained glass", "Roman mosaics", "Viking runestones"], "The shelters preserve a long visual record of San spiritual life.", sensitive.indigenous],
    ["fish", "GEOGRAPHY", "Where is the Maloti minnow found within the property?", "Sehlabathebe National Park", ["Robben Island", "The Kgatleng hills", "Khami's Hill Ruin"], "The endemic fish is one part of the transboundary property's biodiversity.", sensitive.environment],
    ["watershed", "GEOGRAPHY", "The Maloti-Drakensberg range feeds rivers flowing toward which oceans?", "The Indian and Atlantic oceans", ["The Arctic and Pacific oceans", "Only the Mediterranean", "Only an inland salt lake"], "The mountain chain forms an important watershed.", sensitive.environment],
  ]),
  topic("ls_thaba", "thaba", "Lesotho", "Phuthiatsana Valley", "Basotho heritage communities", [
    ["landform", "GEOGRAPHY", "What kind of landform is Thaba-Bosiu?", "A plateau", ["A coral island", "A glacier", "A river delta"], "The monument rises from the Phuthiatsana Valley.", sensitive.archaeology],
    ["distance", "GEOGRAPHY", "About how far is Thaba-Bosiu from Maseru?", "23 kilometres south-east", ["230 kilometres north", "Two kilometres west", "On the coast"], "UNESCO's tentative-list record gives this approximate location.", sensitive.environment],
    ["founder", "HISTORY", "Which leader is closely associated with Thaba-Bosiu from 1824?", "Moshoeshoe I", ["Samora Machel", "Seretse Khama", "Julius Nyerere"], "The site is tied to Moshoeshoe I and Basotho nation-building.", sensitive.archaeology],
    ["status", "MODERN HISTORY", "What is Thaba-Bosiu's current UNESCO status?", "It is on Lesotho's Tentative List", ["It is an Urgent Safeguarding List dance", "It is a marine biosphere reserve", "It is not recorded by UNESCO"], "Tentative listing is a preliminary national nomination step, not inscription.", sensitive.classification],
  ]),
  topic("sz_ngwenya", "ngwenya", "Eswatini", "Hhohho Region", "Communities and custodians around Ngwenya", [
    ["ochre", "ART & HISTORY", "What material was extracted in Ngwenya's early mine workings?", "Red ochre and specularite", ["Coal and petroleum", "Salt and amber", "Gold leaf and silk"], "The pigments connect mineral extraction with regional cultural use.", sensitive.archaeology],
    ["tools", "ART & HISTORY", "What material were early mining hammers and picks at Ngwenya made from?", "Dolerite", ["Plastic", "Aluminium", "Ivory"], "Stone mining tools support interpretation of the ancient workings.", sensitive.archaeology],
    ["later", "HISTORY", "What later technology is documented at Ngwenya around the first millennium CE?", "Iron-ore smelting", ["Steam locomotives", "Electric telegraphy", "Concrete skyscrapers"], "The site preserves more than one period of extraction.", sensitive.archaeology],
    ["status", "MODERN HISTORY", "How should Ngwenya Mines be described in UNESCO terms?", "An Eswatini Tentative List property", ["A World Heritage property already inscribed", "An intangible dance element", "A transatlantic marine reserve"], "Tentative-list status must not be confused with inscription.", sensitive.classification],
  ]),
  topic("zw_khami", "khami", "Zimbabwe", "Near Bulawayo", "Torwa-period heritage and present custodians", [
    ["dynasty", "HISTORY", "Which dynasty made Khami its capital after Great Zimbabwe?", "The Torwa dynasty", ["The Ptolemaic dynasty", "The Merovingian dynasty", "The Ming dynasty"], "Khami became a major political centre after Great Zimbabwe's capital was abandoned.", sensitive.archaeology],
    ["building", "ART & HISTORY", "What construction technique defines Khami's platforms?", "Dry-stone walling", ["Cast iron framing", "Reinforced glass", "Bamboo scaffolding"], "Stone retaining walls created platforms for daga buildings.", sensitive.archaeology],
    ["decoration", "ART", "Which patterns appear on Khami's decorated walls?", "Chevron and chequered patterns", ["Only plain whitewash", "Alphabetic neon signs", "Printed floral wallpaper"], "The wall surfaces show varied stone decoration.", sensitive.archaeology],
    ["trade", "HISTORY", "What do imported objects found at Khami help demonstrate?", "Long-distance trade connections", ["Complete isolation from other regions", "Twentieth-century air travel", "A lack of craft production"], "Porcelain and European stoneware occur in the archaeological record.", sensitive.archaeology],
  ]),
  topic("zw_matobo", "matobo", "Zimbabwe", "Matabeleland South", "Local communities and heritage custodians of Matobo", [
    ["geology", "GEOGRAPHY", "What rock shapes Matobo Hills' distinctive landforms?", "Granite", ["Coral limestone", "Glacial ice", "Volcanic pumice only"], "Weathering of varied granite created the area's boulders and hills.", sensitive.environment],
    ["art", "ART & HISTORY", "What makes Matobo especially significant for rock art?", "One of Southern Africa's highest concentrations", ["The region's only oil portraits", "A collection made entirely after 2000", "Paintings moved from Europe"], "The paintings date back at least 13,000 years.", sensitive.archaeology],
    ["shelters", "HISTORY", "What did Matobo's large boulders provide over long periods?", "Natural shelters", ["Floating harbours", "Ice cellars", "Canal locks"], "The shelters relate to occupation from early Stone Age times onward.", sensitive.archaeology],
    ["living", "TRADITION", "Why are parts of Matobo still important to local communities?", "They include living shrines and sacred places", ["They contain an active international airport", "They host only abandoned factories", "They are closed to all cultural practice"], "No restricted ritual detail is included in this draft.", sensitive.sacred],
  ]),
  topic("zm_zw_mosi", "mosi", "Zambia; Zimbabwe", "Zambezi River border", "Communities and custodians on both sides of the falls", [
    ["river", "GEOGRAPHY", "Which river forms Mosi-oa-Tunya / Victoria Falls?", "The Zambezi", ["The Nile", "The Senegal", "The Orange"], "The river is more than two kilometres wide near the falls.", sensitive.classification],
    ["rock", "GEOGRAPHY", "Into what kind of gorges does the water fall?", "Basalt gorges", ["Coral caves", "Sand dunes", "Glacial valleys"], "Erosion has cut a zigzag series of steep-sided gorges.", sensitive.environment],
    ["countries", "GEOGRAPHY", "Which countries jointly share the World Heritage property?", "Zambia and Zimbabwe", ["Botswana and Lesotho", "Namibia and Angola", "Eswatini and South Africa"], "The property is explicitly transboundary.", sensitive.classification],
    ["mist", "GEOGRAPHY", "What visible feature is created by the great volume of falling water?", "A high plume of spray and mist", ["A permanent snow field", "A volcanic ash cloud", "A coastal tide"], "The spray supports a fragile riverine forest ecosystem.", sensitive.environment],
  ]),
  topic("zm_mooba", "mooba", "Zambia", "Central, Copperbelt and Lusaka Provinces", "Lenje communities", [
    ["who", "MUSIC", "Who performs the Mooba dance in Lenje communities?", "Women and men", ["Only visiting tourists", "Only children under ten", "Only government officials"], "UNESCO describes participation by both women and men.", sensitive.sacred],
    ["skirt", "TEXTILES", "What is the traditional skirt named in public descriptions of Mooba?", "Buyombo", ["Mushishi", "|haru om", "Vlies"], "The costume also includes coloured beads and calf rattles.", sensitive.gender],
    ["regions", "GEOGRAPHY", "Beyond Central Province, where is Mooba also practised?", "Parts of Copperbelt and Lusaka Provinces", ["Only on Indian Ocean islands", "Only in northern Europe", "Only in the Sahara"], "The country scope is specific and does not imply all Zambian communities practise it.", sensitive.classification],
    ["learning", "TRADITION", "How can children learn the public performance of Mooba?", "By observing and practising at open social functions", ["Only by reading secret texts", "Only through foreign conservatories", "By avoiding performances"], "Sacred and healing meanings still require Lenje knowledge-holder review.", sensitive.sacred],
  ]),
];

const specs = topics.flatMap((item) => item.facts.map(([suffix, category, questionText, correct, distractors, explanation, sensitivityNotes]) => ({ stableSuffix: `${item.id}_${suffix}`, sourceKey: item.sourceKey, countryScope: item.countryScope, subregionScope: item.subregionScope, communityScope: item.communityScope, category, questionText, correct, distractors, explanation, sensitivityNotes })));
function rotate(values, amount) { return [...values.slice(amount), ...values.slice(0, amount)]; }
function makeQuestion(spec, index) {
  const optionTexts = rotate([spec.correct, ...spec.distractors], index % 4);
  const answerOptions = optionTexts.map((text, optionIndex) => ({ id: `o${optionIndex + 1}`, text }));
  const acceptedId = answerOptions.find((option) => option.text === spec.correct).id;
  return { stableId: `south_${spec.stableSuffix}`, version: 1, region: "south", countryScope: spec.countryScope, subregionScope: spec.subregionScope, communityScope: spec.communityScope, category: spec.category, difficulty: ["introductory", "intermediate", "introductory", "intermediate", "advanced"][index % 5], questionKind: "single", questionText: spec.questionText, answerOptions, acceptedAnswers: [[acceptedId]], explanation: spec.explanation, sources: [sources[spec.sourceKey]], reviewer: RESEARCH_REVIEWER, reviewDate: ACCESS_DATE, sensitivityNotes: spec.sensitivityNotes, language: "en", locale: "en", lifecycleStatus: "draft", publishedAt: null, retiredAt: null, validFrom: null, validUntil: null, scoringWeight: 1, imageProvenance: [], audioProvenance: [] };
}
function csvCell(value) { const safe = neutralizeCsvFormula(String(value ?? "")); return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe; }
function csv(rows) { return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`; }
function tally(values) { return [...values.reduce((map, value) => map.set(value, (map.get(value) || 0) + 1), new Map()).entries()].sort(([a], [b]) => a.localeCompare(b)); }
function table(rows) { return rows.map(([name, count]) => `| ${name} | ${count} |`).join("\n"); }

const document = validateQuestionBankDocument({ schemaVersion: "question-bank-v1", questions: specs.map(makeQuestion) });
if (document.questions.length < 65) throw new Error(`expected_at_least_65_candidates_got_${document.questions.length}`);
const legacy = await buildLegacyQuestionBankDocument();
const priorDrafts = await Promise.all(priorDraftFiles.map(async (file) => validateQuestionBankDocument(JSON.parse(await readFile(file, "utf8")))));
const comparisonCatalogue = validateQuestionBankDocument({ schemaVersion: "question-bank-v1", questions: [...legacy.questions, ...priorDrafts.flatMap((item) => item.questions)] });
const duplicateReport = previewQuestionBankImport(document, comparisonCatalogue);
const sourceEntries = Object.entries(sources);
const sourceCounts = new Map(sourceEntries.map(([key]) => [key, specs.filter((spec) => spec.sourceKey === key).length]));
const difficultyCounts = tally(document.questions.map((question) => question.difficulty));
const categoryCounts = tally(document.questions.map((question) => question.category));
const countryOccurrences = tally(document.questions.flatMap((question) => question.countryScope.split("; ")));
const scopeCounts = tally(document.questions.map((question) => question.countryScope.includes("; ") ? "cross-border" : "single-country"));
const sensitiveQuestions = document.questions.filter((question) => question.sensitivityNotes);

const reviewRows = [["stableId", "version", "countryScope", "subregionScope", "communityScope", "category", "difficulty", "questionText", "acceptedAnswer", "lifecycleStatus", "specialistReviewRequired", "sensitivityNotes", "sourceTitle", "sourceUrl", "humanDecision", "humanReviewer", "humanReviewDate", "humanReviewNotes"]];
for (const question of document.questions) {
  const accepted = question.acceptedAnswers[0].map((id) => question.answerOptions.find((option) => option.id === id).text).join(" | ");
  reviewRows.push([question.stableId, question.version, question.countryScope, question.subregionScope, question.communityScope, question.category, question.difficulty, question.questionText, accepted, question.lifecycleStatus, "yes", question.sensitivityNotes, question.sources[0].title, question.sources[0].urlOrReference, "pending", "", "", ""]);
}
const sourceRows = [["sourceId", "title", "organisationOrAuthor", "urlOrReference", "sourceType", "accessDate", "candidateCount", "relevantClaim"]];
sourceEntries.forEach(([key, item], index) => sourceRows.push([`SA-S${String(index + 1).padStart(2, "0")}`, item.title, item.organisationOrAuthor, item.urlOrReference, item.sourceType, item.accessDate, sourceCounts.get(key), item.relevantClaim]));

const coverage = `# Southern Africa draft question-bank coverage\n\nGenerated ${ACCESS_DATE}. These ${document.questions.length} records are research candidates only. All remain draft, excluded from selection, and queued for human cultural review. Country and community fields preserve the specific scope of every source.\n\n## Totals\n\n- Candidates: ${document.questions.length}\n- Lifecycle: draft (${document.questions.length})\n- Unique authoritative sources: ${sourceEntries.length}\n- Specialist-review flags: ${sensitiveQuestions.length}\n- Media assets: 0\n\n## Difficulty\n\n| Difficulty | Count |\n| --- | ---: |\n${table(difficultyCounts)}\n\n## Scope\n\n| Scope | Count |\n| --- | ---: |\n${table(scopeCounts)}\n\n## Category\n\n| Category | Count |\n| --- | ---: |\n${table(categoryCounts)}\n\n## Country occurrence\n\nCross-border questions count once for each named country.\n\n| Country | Candidate occurrences |\n| --- | ---: |\n${table(countryOccurrences)}\n\n## Topic coverage\n\nThe pack includes food and hospitality, music and dance, dress, festivals, language terminology, arts and architecture, intergenerational community life, archaeology, political history, geography, living sacred landscapes and contemporary safeguarding. Weddings appear only through Seperu's documented life-milestone scope; no ceremony or courtship rule is generalized. Greetings and proverbs were omitted because this run did not find attribution, register and translation evidence strong enough for responsible draft inclusion.\n`;

const underrepresented = `# Southern Africa under-representation and classification report\n\nCounts measure research coverage, not population, cultural importance or editorial priority.\n\n## Edition and overlap decisions\n\n- **Included:** Botswana, Eswatini, Lesotho, Namibia, South Africa, Zambia and Zimbabwe follow the established Southern edition in app/gameData.ts.\n- **Angola:** remains in the Central Africa draft pack. Its Southern African connections are acknowledged, but duplicating Central candidates here would weaken editorial clarity.\n- **Malawi, Mozambique and Madagascar:** remain in the East Africa pack under the established product scope. No prior East candidate is repeated.\n- **Zambia and Zimbabwe:** appear in both the established East research scope and this Southern edition only through distinct concepts. The Southern pack adds Mooba, Mosi-oa-Tunya, Khami and Matobo; it does not repeat Great Zimbabwe, Mbende Jerusarema or mbira/sansi candidates.\n- **Mosi-oa-Tunya / Victoria Falls and Maloti-Drakensberg:** are explicitly cross-border; each country is named.\n\n## Known gaps\n\n- Eswatini and Lesotho each have four single-country candidates because the run found fewer sufficiently detailed public institutional sources. More locally authored sources and local reviewers are needed.\n- Everyday greetings, proverbs and broader contemporary urban life remain underrepresented pending fluent language and community review.\n- Wedding and courtship coverage is intentionally limited. Public source references to life milestones do not justify claims about a whole community's marriage practice.\n- Food and hospitality coverage currently centres on the Aawambo marula festival. More locally authored everyday food sources are needed before broadening it.\n- Sacred content at Seperu, Mooba and Matobo is restricted to high-level public facts and must remain draft until knowledge holders approve the wording.\n`;

const issueLog = `# Southern Africa cultural-review issue log\n\nAll ${document.questions.length} candidates remain draft. The word approved inside a source record means the reference passed the software source gate; it does not mean cultural approval.\n\n## Specialist review queue (${sensitiveQuestions.length})\n\n${sensitiveQuestions.map((question) => `- **${question.stableId}:** ${question.sensitivityNotes}`).join("\n")}\n\n## Collection-wide review questions\n\n- Confirm names, click consonants, diacritics, language register, country scope and community self-identification with reviewers from the named communities.\n- Remove any detail that community reviewers identify as restricted, sacred or unsuitable for a general-audience quiz.\n- Review apartheid, political imprisonment, massacre and colonial framing with affected communities and trauma-informed historians.\n- Confirm that Indigenous rights and present-day communities are not displaced by conservation or archaeological narratives.\n- Review gendered descriptions as source-specific and changing, never universal or prescriptive.\n- Verify that tentative-list properties are never described as inscribed World Heritage sites.\n- Recheck every live source and factual claim on the human-review date.\n`;

const duplicateAnalysis = `# Southern Africa duplicate and near-duplicate analysis\n\nCompared ${document.questions.length} Southern Africa drafts against each other, the verified ${legacy.questions.length}-question catalogue, ${priorDrafts[0].questions.length} West Africa drafts, ${priorDrafts[1].questions.length} East Africa drafts, ${priorDrafts[2].questions.length} North Africa drafts and ${priorDrafts[3].questions.length} Central Africa drafts using the Prompt 20 preview.\n\n- Exact duplicate question texts: ${duplicateReport.exactDuplicates.length}\n- Token near-duplicate pairs: ${duplicateReport.nearDuplicates.length}\n- Writes performed: ${duplicateReport.writesPerformed}\n\n## Exact duplicates\n\n${duplicateReport.exactDuplicates.length ? duplicateReport.exactDuplicates.map((item) => `- ${item}`).join("\n") : "None detected."}\n\n## Near duplicates\n\n${duplicateReport.nearDuplicates.length ? duplicateReport.nearDuplicates.map((item) => `- ${item.left} / ${item.right}: ${item.similarity}`).join("\n") : "None detected at the configured threshold."}\n\nHuman reviewers must still assess conceptual overlap involving San rock art, ubuntu, Great Zimbabwe and mbira. Those themes occur in the original catalogue or earlier packs, but this run uses different sites and facts and does not repeat their question text.\n`;

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDir, "southern-africa-draft-v1.json"), `${JSON.stringify(document, null, 2)}\n`, "utf8"),
  writeFile(resolve(outputDir, "southern-africa-cultural-review.csv"), csv(reviewRows), "utf8"),
  writeFile(resolve(outputDir, "southern-africa-source-register.csv"), csv(sourceRows), "utf8"),
  writeFile(resolve(outputDir, "southern-africa-review-issues.md"), issueLog, "utf8"),
  writeFile(resolve(outputDir, "southern-africa-coverage.md"), coverage, "utf8"),
  writeFile(resolve(outputDir, "southern-africa-underrepresented.md"), underrepresented, "utf8"),
  writeFile(resolve(outputDir, "southern-africa-duplicate-analysis.md"), duplicateAnalysis, "utf8"),
]);

console.log(JSON.stringify({ candidates: document.questions.length, sources: sourceEntries.length, specialistReview: sensitiveQuestions.length, difficulty: Object.fromEntries(difficultyCounts), exactDuplicates: duplicateReport.exactDuplicates.length, nearDuplicates: duplicateReport.nearDuplicates.length }, null, 2));
