export type RegionKey = "west" | "east" | "central" | "north" | "south";
export type QuestionKind = "single" | "multi" | "complete" | "image";
export type Question = { kind: QuestionKind; prompt: string; options: string[]; correct: number[]; explanation: string; topic: string; visualStart?: number };
export type Region = { name: string; short: string; place: string; mark: string; hello: string; palette: string[]; drops: string[]; questions: Question[] };

const q = (kind: QuestionKind, prompt: string, options: string[], correct: number[], explanation: string, topic: string, visualStart?: number): Question =>
  ({ kind, prompt, options, correct, explanation, topic, visualStart });

export const regions: Record<RegionKey, Region> = {
  west: {
    name: "West Africa", short: "West", place: "From the Sahel to the Atlantic", mark: "✦", hello: "Empires, proverbs, languages, foodways and living creativity.", palette: ["#bb3e22", "#f0a11a", "#2a160c"],
    drops: ["The Ghana, Mali and Songhai empires linked goldfields, cities, scholarship and trade across the Sahel.", "Yorùbá, Hausa, Akan, Igbo, Fulfulde, Wolof and Manding languages belong to different families and travel across modern borders.", "Jeliw or griots preserve history through speech, genealogy, praise poetry and music in many Mande communities."],
    questions: [
      q("complete", "Complete the proverb: ‘However long the night, the ___ will break.’", ["drum", "dawn", "calabash", "story"], [1], "Dawn is an image of endurance: difficult times do not last forever.", "PROVERBS"),
      q("single", "In Yorùbá thought, àṣẹ most closely names…", ["the power to make things happen", "a woven cloth", "a royal drum", "a market day"], [0], "Àṣẹ can mean spiritual force, authority or the power through which words and actions take effect.", "LANGUAGE"),
      q("multi", "Select the three great Sahelian empires of medieval West Africa.", ["Ghana", "Mali", "Songhai", "Aksum"], [0,1,2], "Ghana, Mali and Songhai rose across the western Sahel; Aksum was centred in the Horn of Africa.", "HISTORY"),
      q("image", "Which image shows jollof rice?", ["Jollof rice", "Injera platter", "Couscous", "Pap and relish"], [0], "Jollof is a one-pot rice tradition with many beloved national and family variations across West Africa.", "FOOD", 0),
      q("single", "Kente weaving is especially associated with which cultural worlds?", ["Akan and Ewe", "Amazigh and Nubian", "Shona and Ndebele", "Somali and Afar"], [0], "Kente traditions are strongly associated with Akan and Ewe weavers, with distinct histories and designs.", "TEXTILES"),
      q("complete", "Complete the Hausa greeting: ‘Sannu’ is used to say…", ["goodbye", "hello", "eat well", "dance"], [1], "Sannu is a widely used Hausa greeting. Hausa travels across Nigeria, Niger and the wider Sahel.", "LANGUAGE"),
      q("single", "What is a jeli, or griot, best known for?", ["Keeping oral history and genealogy", "Building earthen mosques", "Casting only royal gold", "Leading camel caravans"], [0], "In many Mande societies, jeliw are specialists in history, genealogy, praise, counsel and music.", "ORAL HISTORY"),
      q("multi", "Select three long-established West African staples.", ["Yam", "Cassava", "Millet", "Rye"], [0,1,2], "Yam, cassava and millet anchor many cuisines, although techniques vary by ecology and community.", "FOOD"),
      q("image", "Which image represents Sankofa, the Akan idea of retrieving useful knowledge from the past?", ["Sankofa bird", "Ankh", "Beaded collar", "Painted house"], [0], "Sankofa is often represented by a bird turning backward: learn from the past to shape the future.", "SYMBOLS", 4),
      q("single", "The famous ‘Benin Bronzes’ were created in the historic Kingdom of Benin, centred in today’s…", ["Nigeria", "Benin Republic", "Mali", "Senegal"], [0], "The Kingdom of Benin was centred at Benin City in present-day Nigeria; it is distinct from the modern Republic of Benin.", "HISTORY"),
      q("multi", "Fulani communities and Fulfulde varieties stretch across which three countries?", ["Nigeria", "Guinea", "Senegal", "Lesotho"], [0,1,2], "Fulani communities span a broad belt of West and Central Africa, crossing many modern borders.", "PEOPLES & LANGUAGE"),
      q("single", "An Akan proverb says wisdom is like a baobab tree because…", ["no one person can embrace it alone", "it grows only beside palaces", "its fruit is made of gold", "elders may never question it"], [0], "Wisdom is too large for one person: knowledge grows through collective effort.", "PROVERBS"),
    ],
  },
  east: {
    name: "East Africa", short: "East", place: "Highlands, coast & great lakes", mark: "◈", hello: "Indian Ocean worlds, Great Lakes histories and languages that travel.", palette: ["#16746c", "#e4a82f", "#172f2c"],
    drops: ["The Swahili coast connected African towns with Arabia, Persia, India and the wider Indian Ocean for centuries.", "Aksum, Great Lakes kingdoms and coastal city-states each shaped distinct East African histories.", "Kiswahili is a Bantu language with vocabulary enriched by centuries of contact, including Arabic loans."],
    questions: [
      q("complete", "Complete the Swahili proverb: ‘Haraka haraka haina ___.’", ["baraka", "chakula", "rafiki", "nyumba"], [0], "Haraka haraka haina baraka means ‘hurry hurry has no blessing’, a warning against careless haste.", "PROVERBS"),
      q("single", "Kiswahili belongs to which language family?", ["Bantu", "Semitic", "Romance", "Nilotic"], [0], "Kiswahili is a Bantu language, enriched by centuries of contact with Arabic and other languages.", "LANGUAGE"),
      q("multi", "Select three worlds historically linked through Swahili-coast trade.", ["African interior", "Arabian Peninsula", "India and the Indian Ocean", "Arctic Europe"], [0,1,2], "Coastal city-states connected inland African networks with Arabia, Persia, India and other Indian Ocean societies.", "HISTORY"),
      q("image", "Which image shows injera served with several stews?", ["Injera platter", "Jollof rice", "Couscous", "Pap and relish"], [0], "Injera is a fermented flatbread central to Ethiopian and Eritrean meals, commonly shared with stews and vegetables.", "FOOD", 0),
      q("single", "The towering stone stelae of Aksum are found in…", ["Ethiopia", "Kenya", "Madagascar", "Burundi"], [0], "Aksum was a major ancient trading power in the northern Ethiopian and Eritrean highlands.", "HISTORY"),
      q("complete", "Complete the Swahili phrase: ‘Asante’ means…", ["thank you", "welcome home", "good night", "listen"], [0], "Asante means ‘thank you’; asante sana adds emphasis: ‘thank you very much.’", "LANGUAGE"),
      q("multi", "Select three countries of the African Great Lakes region.", ["Uganda", "Rwanda", "Burundi", "Morocco"], [0,1,2], "Uganda, Rwanda and Burundi belong to the Great Lakes region, whose histories long predate modern borders.", "GEOGRAPHY"),
      q("image", "Which image shows an Ethiopian coffee ceremony setup?", ["Jebena and cups", "Mint tea service", "Calabash bowl", "Braai grill"], [0], "The jebena, a distinctive coffee pot, is central to coffee preparation and hospitality in Ethiopia and Eritrea.", "TRADITION", 4),
      q("single", "Geʽez survives today most visibly as…", ["a liturgical language and script", "a dance from Zanzibar", "a fishing boat", "a style of beadwork"], [0], "Geʽez remains important in Ethiopian and Eritrean Christian liturgy and writing.", "LANGUAGE"),
      q("multi", "Select three widely spoken East African languages.", ["Kiswahili", "Amharic", "Oromo", "isiZulu"], [0,1,2], "Kiswahili, Amharic and Oromo serve millions across East Africa; isiZulu is centred in Southern Africa.", "LANGUAGE"),
      q("single", "Taarab music grew especially along the Swahili coast by blending…", ["African, Arab and Indian Ocean influences", "only European opera", "only drum ensembles", "Andean panpipes"], [0], "Taarab reflects cosmopolitan coastal histories, especially in Zanzibar and other Swahili communities.", "MUSIC"),
      q("complete", "Complete the Swahili saying: ‘Pole pole ndiyo ___.’", ["mwendo", "chakula", "bahari", "ngoma"], [0], "Pole pole ndiyo mwendo means, roughly, ‘slowly, slowly is the way forward’. Steady progress matters.", "PROVERBS"),
    ],
  },
  central: {
    name: "Central Africa", short: "Central", place: "Rainforest, rivers & kingdoms", mark: "✺", hello: "Kingdoms, river cities, epic traditions and globally influential sound.", palette: ["#5e7935", "#d88f27", "#193b2b"],
    drops: ["Kongo, Luba, Lunda, Bamum and many other states built sophisticated political and artistic traditions.", "Lingala, Kikongo, Tshiluba, French and many other languages connect and distinguish communities across the region.", "Congolese rumba, soukous, makossa and other urban sounds reshaped dance floors across Africa and the world."],
    questions: [
      q("single", "Mbanza Kongo was the capital of which historic kingdom?", ["Kingdom of Kongo", "Kingdom of Kush", "Mali Empire", "Aksum"], [0], "Mbanza Kongo, in present-day Angola, was the political and spiritual centre of the Kingdom of Kongo.", "HISTORY"),
      q("complete", "Complete the Lingala greeting: ‘Mbote’ means…", ["hello", "hurry", "river", "music"], [0], "Mbote is a widely recognised Lingala greeting in both Congos and in music across the region.", "LANGUAGE"),
      q("multi", "Select three national languages of the Democratic Republic of the Congo.", ["Lingala", "Kikongo ya Leta", "Tshiluba", "Afrikaans"], [0,1,2], "DRC recognises Lingala, Kikongo ya Leta, Tshiluba and Kiswahili as national languages; French is official.", "LANGUAGE"),
      q("image", "Which image shows cassava fufu with stew?", ["Cassava fufu", "Injera", "Couscous", "Sadza"], [0], "Cassava is prepared in many forms across Central Africa, including smooth fufu and wrapped fermented breads.", "FOOD", 0),
      q("single", "Congolese rumba grew most famously between which two neighbouring capitals?", ["Kinshasa and Brazzaville", "Cairo and Tunis", "Lagos and Accra", "Maputo and Harare"], [0], "Kinshasa and Brazzaville face one another across the Congo River and became twin centres of Congolese rumba.", "MUSIC"),
      q("complete", "Complete the cooperation proverb: ‘One bracelet does not ___.’", ["jingle", "shine", "travel", "break"], [0], "A single bracelet cannot make the sound of many: the proverb turns jewellery into an image of collaboration.", "PROVERBS"),
      q("multi", "Select three countries that contain part of the Congo Basin rainforest.", ["DR Congo", "Cameroon", "Gabon", "Morocco"], [0,1,2], "The basin extends across DR Congo, Cameroon, Gabon, Republic of the Congo, CAR and Equatorial Guinea.", "GEOGRAPHY"),
      q("image", "Which image shows Central African raffia weaving?", ["Raffia cloth", "Zellige", "Kente", "Ndebele beadwork"], [0], "Raffia fibres appear in many Central African arts, including Kuba textiles famous for complex geometry.", "ART", 4),
      q("single", "Who developed the Bamum script in present-day Cameroon?", ["King Ibrahim Njoya", "Mansa Musa", "Queen Nzinga", "Shaka kaSenzangakhona"], [0], "King Ibrahim Njoya and his circle developed and refined a writing system for Bamum around the turn of the twentieth century.", "HISTORY"),
      q("multi", "Select three influential Central African popular-music traditions.", ["Congolese rumba", "Soukous", "Makossa", "Gnawa"], [0,1,2], "Rumba and soukous are closely linked to the Congos; makossa emerged in Cameroon. Gnawa is North African.", "MUSIC"),
      q("single", "The mvet is both a stringed instrument and an epic tradition among communities including the…", ["Fang, Beti and Bulu", "Akan and Ewe", "Zulu and Xhosa", "Tuareg and Nubian"], [0], "Mvet joins instrument, poetry, history and philosophy among peoples of Cameroon, Gabon and Equatorial Guinea.", "ORAL HISTORY"),
      q("complete", "Complete the proverb: ‘A river is filled by small ___.’", ["streams", "drums", "markets", "palaces"], [0], "Many small contributions can create something powerful together.", "PROVERBS"),
    ],
  },
  north: {
    name: "North Africa", short: "North", place: "Maghreb, Nile & Sahara", mark: "☼", hello: "Amazigh, Arab, Nubian, Saharan and Mediterranean histories in conversation.", palette: ["#d7a856", "#1c7180", "#61341f"],
    drops: ["Amazigh, Arab, Nubian, Beja, Coptic, Saharan and Mediterranean histories overlap without becoming one story.", "Carthage, ancient Egypt, Kush and Maghrebi dynasties connected Africa to the Mediterranean, Nile and Sahara.", "Couscous, zellige, raï and Gnawa show how everyday practices carry memory while continually evolving."],
    questions: [
      q("single", "What does the Amazigh plural name Imazighen refer to?", ["Amazigh people", "a tile pattern", "a couscous pot", "an ancient harbour"], [0], "Imazighen is the plural of Amazigh, the self-name used by many Indigenous peoples across North Africa and the Sahara.", "PEOPLES & LANGUAGE"),
      q("complete", "Complete the greeting response: ‘As-salaamu alaykum’. ‘Wa alaykum ___.’", ["as-salaam", "shukran", "sabah", "baraka"], [0], "The exchange means ‘peace be upon you’ and ‘and upon you be peace.’", "LANGUAGE"),
      q("multi", "Select three historic North African centres.", ["Carthage", "Fez", "Alexandria", "Great Zimbabwe"], [0,1,2], "Carthage, Fez and Alexandria shaped different eras of North African trade, scholarship and statecraft.", "HISTORY"),
      q("image", "Which image shows couscous?", ["Couscous", "Jollof rice", "Injera", "Pap and relish"], [0], "Couscous traditions are shared across the Maghreb and Mauritania, with countless regional grains, broths and toppings.", "FOOD", 0),
      q("multi", "Select the three scripts on the Rosetta Stone.", ["Egyptian hieroglyphs", "Demotic", "Ancient Greek", "Latin"], [0,1,2], "The decree appears in hieroglyphic, Demotic and Ancient Greek, enabling the decipherment of Egyptian hieroglyphs.", "HISTORY"),
      q("complete", "Complete the sentence: Tamazight names a group of ___ languages.", ["Amazigh", "Romance", "Nilotic", "Germanic"], [0], "Tamazight can refer broadly to Amazigh language varieties and, in some contexts, to standardised forms.", "LANGUAGE"),
      q("single", "The ancient kingdom of Kush flourished mainly in today’s…", ["Sudan", "Algeria", "Morocco", "Libya"], [0], "Kush flourished along the Middle Nile in Nubia, with major centres including Napata and Meroë.", "HISTORY"),
      q("image", "Which image shows zellige mosaic tilework?", ["Zellige", "Kente", "Barkcloth", "Ndebele mural"], [0], "Zellige uses hand-cut glazed tiles arranged into precise geometric compositions, especially in Morocco and the Maghreb.", "ART", 4),
      q("multi", "Select three countries in the joint UNESCO couscous heritage nomination.", ["Algeria", "Morocco", "Tunisia", "Egypt"], [0,1,2], "Algeria, Mauritania, Morocco and Tunisia jointly nominated the knowledge and practices of couscous.", "FOOD"),
      q("single", "Gnawa music and ritual traditions are especially associated with…", ["Morocco", "Egypt", "South Sudan", "Madagascar"], [0], "Gnawa traditions in Morocco combine music, spirituality and histories connected to sub-Saharan Africa.", "MUSIC"),
      q("single", "Why was ancient Alexandria famous across the Mediterranean world?", ["Its library and scholarship", "Its gold mines", "Its rainforests", "Its cattle kingdom"], [0], "Ancient Alexandria became a major centre of scholarship, translation and exchange under the Ptolemies.", "HISTORY"),
      q("complete", "Complete the Arabic proverb: ‘Patience is the key to ___.’", ["relief", "silence", "wealth", "travel"], [0], "Al-sabr miftah al-faraj means ‘patience is the key to relief’. It is heard across Arabic-speaking North Africa.", "PROVERBS"),
    ],
  },
  south: {
    name: "Southern Africa", short: "South", place: "Savannah, highveld & coast", mark: "◆", hello: "Great states, living philosophies, language families and revolutionary sound.", palette: ["#693d79", "#e5a92d", "#173f49"],
    drops: ["Shona, Nguni, Sotho-Tswana, Chewa, Tsonga and many other language communities cross modern borders.", "Great Zimbabwe and Mapungubwe reveal powerful precolonial states linked to Indian Ocean trade.", "Mbira, choral traditions, jazz, chimurenga, kwaito and amapiano belong to a vast, changing musical landscape."],
    questions: [
      q("single", "Great Zimbabwe was built by ancestors of which people?", ["Shona", "Romans", "Phoenicians", "Vikings"], [0], "Great Zimbabwe was an African city and royal centre built by ancestors of Shona communities.", "HISTORY"),
      q("complete", "Complete the Nguni expression: ‘Umuntu ngumuntu ngabantu’. A person is a person through…", ["other people", "wealth", "cattle alone", "silence"], [0], "The saying expresses relational personhood and is often connected with ideas described as ubuntu.", "PHILOSOPHY"),
      q("multi", "Select the three Nguni languages.", ["isiZulu", "isiXhosa", "siSwati", "Setswana"], [0,1,2], "isiZulu, isiXhosa and siSwati belong to the Nguni branch; Setswana is Sotho-Tswana.", "LANGUAGE"),
      q("image", "Which image shows sadza or pap served with relish?", ["Sadza or pap", "Injera", "Jollof rice", "Couscous"], [0], "Thick maize-meal dishes have many names and styles, including sadza, pap, nshima and phutu.", "FOOD", 0),
      q("single", "What made Mapungubwe especially important?", ["It was an early state and gold-trading centre", "It invented hieroglyphs", "It was a Roman colony", "It was a Swahili island"], [0], "Mapungubwe flourished around 1050–1270 and reveals complex society and long-distance trade before Great Zimbabwe’s height.", "HISTORY"),
      q("complete", "Complete the Sesotho/Setswana greeting: ‘Dumela’ means…", ["hello", "dance", "listen", "food"], [0], "Dumela is a common greeting in Sesotho and Setswana, spoken across several countries.", "LANGUAGE"),
      q("multi", "Setswana has official or nationally recognised status in which three countries?", ["Botswana", "South Africa", "Zimbabwe", "Angola"], [0,1,2], "Setswana is official in Botswana and South Africa and among Zimbabwe’s constitutionally recognised languages.", "LANGUAGE"),
      q("image", "Which image shows a Zimbabwean mbira?", ["Mbira", "Kora", "Oud", "Talking drum"], [0], "The mbira uses metal keys fixed to a wooden soundboard and holds deep importance in Shona musical traditions.", "MUSIC", 4),
      q("single", "Makishi masquerade traditions are especially associated with initiation among peoples including the…", ["Luvale, Chokwe and Luchazi", "Akan and Ewe", "Amazigh and Nubian", "Somali and Oromo"], [0], "Makishi masquerades are linked to mukanda initiation traditions in parts of Zambia and Angola.", "TRADITION"),
      q("multi", "Select three Southern African liberation leaders.", ["Nelson Mandela", "Samora Machel", "Kenneth Kaunda", "Haile Selassie"], [0,1,2], "Mandela, Machel and Kaunda led South Africa, Mozambique and Zambia; Haile Selassie was emperor of Ethiopia.", "MODERN HISTORY"),
      q("single", "Why is San rock art historically valuable?", ["It records knowledge, ritual and changing lives", "It is only modern decoration", "It is written in Latin", "It maps Roman roads"], [0], "San rock art offers layered records of belief, experience, animals and historical change.", "ART & HISTORY"),
      q("complete", "Complete the Setswana proverb: ‘Kgosi ke kgosi ka ___.’", ["batho", "gauta", "pula", "dijo"], [0], "‘A chief is a chief through the people’ reminds leaders that authority depends on community.", "PROVERBS"),
    ],
  },
};

export const regionOrder: RegionKey[] = ["west", "east", "central", "north", "south"];
export const avatarChoices = [
  { name: "Amara", src: "/avatars/amara.webp", vibe: "The Radiant One" }, { name: "Zuri", src: "/avatars/zuri.webp", vibe: "The Wild Card" },
  { name: "Nia", src: "/avatars/nia.webp", vibe: "The Story Charmer" }, { name: "Lindi", src: "/avatars/lindi.webp", vibe: "The Joy Bringer" },
  { name: "Imara", src: "/avatars/imara.webp", vibe: "The Power Move" }, { name: "Aya", src: "/avatars/aya.webp", vibe: "The Golden Hour" },
  { name: "Adjoa", src: "/avatars/adjoa-v2.webp", vibe: "The Wise Spark" }, { name: "Samira", src: "/avatars/samira-v2.webp", vibe: "The Desert Star" },
  { name: "Wanjiku", src: "/avatars/wanjiku-v2.webp", vibe: "The Bright Horizon" }, { name: "Mbali", src: "/avatars/mbali-v2.webp", vibe: "The Purple Reign" },
  { name: "Efe", src: "/avatars/efe-v2.webp", vibe: "The Coral Flame" }, { name: "Malaika", src: "/avatars/malaika-v2.webp", vibe: "The Clever Glow" },
];

export const sourceCollections = [
  { label: "UNESCO General History of Africa", href: "https://www.unesco.org/en/general-history-africa" },
  { label: "British Museum | African histories", href: "https://www.britishmuseum.org/collection/galleries/africa" },
  { label: "Met Museum | African art", href: "https://www.metmuseum.org/art/collection/search?geolocation=Africa" },
  { label: "UNESCO Intangible Heritage in Africa", href: "https://ich.unesco.org/en/lists?multinational=3&display1=inscriptionID#tabs" },
];
