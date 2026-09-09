// Browser-safe projection of the approved game catalogue. Image-identification
// labels, explanations and correct-answer indexes intentionally live only in
// the server authority module; tests keep this projection aligned with it.
import type { AvatarChoice, QuestionKind, Region, RegionKey } from "./gameData.ts";
export type { RegionKey } from "./gameData.ts";

export type PublicQuestion = Readonly<{
  kind: QuestionKind;
  prompt: string;
  options: readonly string[];
  correct: readonly number[];
  explanation: string;
  topic: string;
  visualStart?: number;
}>;

export type PublicRegion = Omit<Region, "questions"> & Readonly<{ questions: readonly PublicQuestion[] }>;

export const regionOrder: readonly RegionKey[] = Object.freeze(["west", "east", "central", "north", "south"]);

// The generated literal below is refreshed from app/gameData.ts whenever the
// approved catalogue changes. Image questions are reduced to neutral markers.
export const regions: Readonly<Record<RegionKey, PublicRegion>> = Object.freeze({
  "west": {
    "name": "West Africa",
    "short": "West",
    "place": "From the Sahel to the Atlantic",
    "mark": "✦",
    "hello": "Empires, proverbs, languages, foodways and living creativity.",
    "palette": [
      "#bb3e22",
      "#f0a11a",
      "#2a160c"
    ],
    "drops": [
      "The Ghana, Mali and Songhai empires linked goldfields, cities, scholarship and trade across the Sahel.",
      "Yorùbá, Hausa, Akan, Igbo, Fulfulde, Wolof and Manding languages belong to different families and travel across modern borders.",
      "Jeliw or griots preserve history through speech, genealogy, praise poetry and music in many Mande communities."
    ],
    "questions": [
      {
        "kind": "complete",
        "prompt": "Complete the proverb: ‘However long the night, the ___ will break.’",
        "options": [
          "drum",
          "dawn",
          "calabash",
          "story"
        ],
        "correct": [
          1
        ],
        "explanation": "Dawn is an image of endurance: difficult times do not last forever.",
        "topic": "PROVERBS"
      },
      {
        "kind": "single",
        "prompt": "In Yorùbá thought, àṣẹ most closely names…",
        "options": [
          "the power to make things happen",
          "a woven cloth",
          "a royal drum",
          "a market day"
        ],
        "correct": [
          0
        ],
        "explanation": "Àṣẹ can mean spiritual force, authority or the power through which words and actions take effect.",
        "topic": "LANGUAGE"
      },
      {
        "kind": "multi",
        "prompt": "Select the three great Sahelian empires of medieval West Africa.",
        "options": [
          "Ghana",
          "Mali",
          "Songhai",
          "Aksum"
        ],
        "correct": [
          0,
          1,
          2
        ],
        "explanation": "Ghana, Mali and Songhai rose across the western Sahel; Aksum was centred in the Horn of Africa.",
        "topic": "HISTORY"
      },
      {
        "kind": "image",
        "prompt": "Which image shows jollof rice?",
        "options": [
          "A",
          "B",
          "C",
          "D"
        ],
        "correct": [],
        "explanation": "",
        "topic": "FOOD",
        "visualStart": 0
      },
      {
        "kind": "single",
        "prompt": "Kente weaving is especially associated with which cultural worlds?",
        "options": [
          "Akan and Ewe",
          "Amazigh and Nubian",
          "Shona and Ndebele",
          "Somali and Afar"
        ],
        "correct": [
          0
        ],
        "explanation": "Kente traditions are strongly associated with Akan and Ewe weavers, with distinct histories and designs.",
        "topic": "TEXTILES"
      },
      {
        "kind": "complete",
        "prompt": "Complete the Hausa greeting: ‘Sannu’ is used to say…",
        "options": [
          "goodbye",
          "hello",
          "eat well",
          "dance"
        ],
        "correct": [
          1
        ],
        "explanation": "Sannu is a widely used Hausa greeting. Hausa travels across Nigeria, Niger and the wider Sahel.",
        "topic": "LANGUAGE"
      },
      {
        "kind": "single",
        "prompt": "What is a jeli, or griot, best known for?",
        "options": [
          "Keeping oral history and genealogy",
          "Building earthen mosques",
          "Casting only royal gold",
          "Leading camel caravans"
        ],
        "correct": [
          0
        ],
        "explanation": "In many Mande societies, jeliw are specialists in history, genealogy, praise, counsel and music.",
        "topic": "ORAL HISTORY"
      },
      {
        "kind": "multi",
        "prompt": "Select three long-established West African staples.",
        "options": [
          "Yam",
          "Cassava",
          "Millet",
          "Rye"
        ],
        "correct": [
          0,
          1,
          2
        ],
        "explanation": "Yam, cassava and millet anchor many cuisines, although techniques vary by ecology and community.",
        "topic": "FOOD"
      },
      {
        "kind": "image",
        "prompt": "Which image represents Sankofa, the Akan idea of retrieving useful knowledge from the past?",
        "options": [
          "A",
          "B",
          "C",
          "D"
        ],
        "correct": [],
        "explanation": "",
        "topic": "SYMBOLS",
        "visualStart": 4
      },
      {
        "kind": "single",
        "prompt": "The famous ‘Benin Bronzes’ were created in the historic Kingdom of Benin, centred in today’s…",
        "options": [
          "Nigeria",
          "Benin Republic",
          "Mali",
          "Senegal"
        ],
        "correct": [
          0
        ],
        "explanation": "The Kingdom of Benin was centred at Benin City in present-day Nigeria; it is distinct from the modern Republic of Benin.",
        "topic": "HISTORY"
      },
      {
        "kind": "multi",
        "prompt": "Fulani communities and Fulfulde varieties stretch across which three countries?",
        "options": [
          "Nigeria",
          "Guinea",
          "Senegal",
          "Lesotho"
        ],
        "correct": [
          0,
          1,
          2
        ],
        "explanation": "Fulani communities span a broad belt of West and Central Africa, crossing many modern borders.",
        "topic": "PEOPLES & LANGUAGE"
      },
      {
        "kind": "single",
        "prompt": "An Akan proverb says wisdom is like a baobab tree because…",
        "options": [
          "no one person can embrace it alone",
          "it grows only beside palaces",
          "its fruit is made of gold",
          "elders may never question it"
        ],
        "correct": [
          0
        ],
        "explanation": "Wisdom is too large for one person: knowledge grows through collective effort.",
        "topic": "PROVERBS"
      }
    ]
  },
  "east": {
    "name": "East Africa",
    "short": "East",
    "place": "Highlands, coast & great lakes",
    "mark": "◈",
    "hello": "Indian Ocean worlds, Great Lakes histories and languages that travel.",
    "palette": [
      "#16746c",
      "#e4a82f",
      "#172f2c"
    ],
    "drops": [
      "The Swahili coast connected African towns with Arabia, Persia, India and the wider Indian Ocean for centuries.",
      "Aksum, Great Lakes kingdoms and coastal city-states each shaped distinct East African histories.",
      "Kiswahili is a Bantu language with vocabulary enriched by centuries of contact, including Arabic loans."
    ],
    "questions": [
      {
        "kind": "complete",
        "prompt": "Complete the Swahili proverb: ‘Haraka haraka haina ___.’",
        "options": [
          "baraka",
          "chakula",
          "rafiki",
          "nyumba"
        ],
        "correct": [
          0
        ],
        "explanation": "Haraka haraka haina baraka means ‘hurry hurry has no blessing’, a warning against careless haste.",
        "topic": "PROVERBS"
      },
      {
        "kind": "single",
        "prompt": "Kiswahili belongs to which language family?",
        "options": [
          "Bantu",
          "Semitic",
          "Romance",
          "Nilotic"
        ],
        "correct": [
          0
        ],
        "explanation": "Kiswahili is a Bantu language, enriched by centuries of contact with Arabic and other languages.",
        "topic": "LANGUAGE"
      },
      {
        "kind": "multi",
        "prompt": "Select three worlds historically linked through Swahili-coast trade.",
        "options": [
          "African interior",
          "Arabian Peninsula",
          "India and the Indian Ocean",
          "Arctic Europe"
        ],
        "correct": [
          0,
          1,
          2
        ],
        "explanation": "Coastal city-states connected inland African networks with Arabia, Persia, India and other Indian Ocean societies.",
        "topic": "HISTORY"
      },
      {
        "kind": "image",
        "prompt": "Which image shows injera served with several stews?",
        "options": [
          "A",
          "B",
          "C",
          "D"
        ],
        "correct": [],
        "explanation": "",
        "topic": "FOOD",
        "visualStart": 0
      },
      {
        "kind": "single",
        "prompt": "The towering stone stelae of Aksum are found in…",
        "options": [
          "Ethiopia",
          "Kenya",
          "Madagascar",
          "Burundi"
        ],
        "correct": [
          0
        ],
        "explanation": "Aksum was a major ancient trading power in the northern Ethiopian and Eritrean highlands.",
        "topic": "HISTORY"
      },
      {
        "kind": "complete",
        "prompt": "Complete the Swahili phrase: ‘Asante’ means…",
        "options": [
          "thank you",
          "welcome home",
          "good night",
          "listen"
        ],
        "correct": [
          0
        ],
        "explanation": "Asante means ‘thank you’; asante sana adds emphasis: ‘thank you very much.’",
        "topic": "LANGUAGE"
      },
      {
        "kind": "multi",
        "prompt": "Select three countries of the African Great Lakes region.",
        "options": [
          "Uganda",
          "Rwanda",
          "Burundi",
          "Morocco"
        ],
        "correct": [
          0,
          1,
          2
        ],
        "explanation": "Uganda, Rwanda and Burundi belong to the Great Lakes region, whose histories long predate modern borders.",
        "topic": "GEOGRAPHY"
      },
      {
        "kind": "image",
        "prompt": "Which image shows an Ethiopian coffee ceremony setup?",
        "options": [
          "A",
          "B",
          "C",
          "D"
        ],
        "correct": [],
        "explanation": "",
        "topic": "TRADITION",
        "visualStart": 4
      },
      {
        "kind": "single",
        "prompt": "Geʽez survives today most visibly as…",
        "options": [
          "a liturgical language and script",
          "a dance from Zanzibar",
          "a fishing boat",
          "a style of beadwork"
        ],
        "correct": [
          0
        ],
        "explanation": "Geʽez remains important in Ethiopian and Eritrean Christian liturgy and writing.",
        "topic": "LANGUAGE"
      },
      {
        "kind": "multi",
        "prompt": "Select three widely spoken East African languages.",
        "options": [
          "Kiswahili",
          "Amharic",
          "Oromo",
          "isiZulu"
        ],
        "correct": [
          0,
          1,
          2
        ],
        "explanation": "Kiswahili, Amharic and Oromo serve millions across East Africa; isiZulu is centred in Southern Africa.",
        "topic": "LANGUAGE"
      },
      {
        "kind": "single",
        "prompt": "Taarab music grew especially along the Swahili coast by blending…",
        "options": [
          "African, Arab and Indian Ocean influences",
          "only European opera",
          "only drum ensembles",
          "Andean panpipes"
        ],
        "correct": [
          0
        ],
        "explanation": "Taarab reflects cosmopolitan coastal histories, especially in Zanzibar and other Swahili communities.",
        "topic": "MUSIC"
      },
      {
        "kind": "complete",
        "prompt": "Complete the Swahili saying: ‘Pole pole ndiyo ___.’",
        "options": [
          "mwendo",
          "chakula",
          "bahari",
          "ngoma"
        ],
        "correct": [
          0
        ],
        "explanation": "Pole pole ndiyo mwendo means, roughly, ‘slowly, slowly is the way forward’. Steady progress matters.",
        "topic": "PROVERBS"
      }
    ]
  },
  "central": {
    "name": "Central Africa",
    "short": "Central",
    "place": "Rainforest, rivers & kingdoms",
    "mark": "✺",
    "hello": "Kingdoms, river cities, epic traditions and globally influential sound.",
    "palette": [
      "#5e7935",
      "#d88f27",
      "#193b2b"
    ],
    "drops": [
      "Kongo, Luba, Lunda, Bamum and many other states built sophisticated political and artistic traditions.",
      "Lingala, Kikongo, Tshiluba, French and many other languages connect and distinguish communities across the region.",
      "Congolese rumba, soukous, makossa and other urban sounds reshaped dance floors across Africa and the world."
    ],
    "questions": [
      {
        "kind": "single",
        "prompt": "Mbanza Kongo was the capital of which historic kingdom?",
        "options": [
          "Kingdom of Kongo",
          "Kingdom of Kush",
          "Mali Empire",
          "Aksum"
        ],
        "correct": [
          0
        ],
        "explanation": "Mbanza Kongo, in present-day Angola, was the political and spiritual centre of the Kingdom of Kongo.",
        "topic": "HISTORY"
      },
      {
        "kind": "complete",
        "prompt": "Complete the Lingala greeting: ‘Mbote’ means…",
        "options": [
          "hello",
          "hurry",
          "river",
          "music"
        ],
        "correct": [
          0
        ],
        "explanation": "Mbote is a widely recognised Lingala greeting in both Congos and in music across the region.",
        "topic": "LANGUAGE"
      },
      {
        "kind": "multi",
        "prompt": "Select three national languages of the Democratic Republic of the Congo.",
        "options": [
          "Lingala",
          "Kikongo ya Leta",
          "Tshiluba",
          "Afrikaans"
        ],
        "correct": [
          0,
          1,
          2
        ],
        "explanation": "DRC recognises Lingala, Kikongo ya Leta, Tshiluba and Kiswahili as national languages; French is official.",
        "topic": "LANGUAGE"
      },
      {
        "kind": "image",
        "prompt": "Which image shows cassava fufu with stew?",
        "options": [
          "A",
          "B",
          "C",
          "D"
        ],
        "correct": [],
        "explanation": "",
        "topic": "FOOD",
        "visualStart": 0
      },
      {
        "kind": "single",
        "prompt": "Congolese rumba grew most famously between which two neighbouring capitals?",
        "options": [
          "Kinshasa and Brazzaville",
          "Cairo and Tunis",
          "Lagos and Accra",
          "Maputo and Harare"
        ],
        "correct": [
          0
        ],
        "explanation": "Kinshasa and Brazzaville face one another across the Congo River and became twin centres of Congolese rumba.",
        "topic": "MUSIC"
      },
      {
        "kind": "complete",
        "prompt": "Complete the cooperation proverb: ‘One bracelet does not ___.’",
        "options": [
          "jingle",
          "shine",
          "travel",
          "break"
        ],
        "correct": [
          0
        ],
        "explanation": "A single bracelet cannot make the sound of many: the proverb turns jewellery into an image of collaboration.",
        "topic": "PROVERBS"
      },
      {
        "kind": "multi",
        "prompt": "Select three countries that contain part of the Congo Basin rainforest.",
        "options": [
          "DR Congo",
          "Cameroon",
          "Gabon",
          "Morocco"
        ],
        "correct": [
          0,
          1,
          2
        ],
        "explanation": "The basin extends across DR Congo, Cameroon, Gabon, Republic of the Congo, CAR and Equatorial Guinea.",
        "topic": "GEOGRAPHY"
      },
      {
        "kind": "image",
        "prompt": "Which image shows Central African raffia weaving?",
        "options": [
          "A",
          "B",
          "C",
          "D"
        ],
        "correct": [],
        "explanation": "",
        "topic": "ART",
        "visualStart": 4
      },
      {
        "kind": "single",
        "prompt": "Who developed the Bamum script in present-day Cameroon?",
        "options": [
          "King Ibrahim Njoya",
          "Mansa Musa",
          "Queen Nzinga",
          "Shaka kaSenzangakhona"
        ],
        "correct": [
          0
        ],
        "explanation": "King Ibrahim Njoya and his circle developed and refined a writing system for Bamum around the turn of the twentieth century.",
        "topic": "HISTORY"
      },
      {
        "kind": "multi",
        "prompt": "Select three influential Central African popular-music traditions.",
        "options": [
          "Congolese rumba",
          "Soukous",
          "Makossa",
          "Gnawa"
        ],
        "correct": [
          0,
          1,
          2
        ],
        "explanation": "Rumba and soukous are closely linked to the Congos; makossa emerged in Cameroon. Gnawa is North African.",
        "topic": "MUSIC"
      },
      {
        "kind": "single",
        "prompt": "The mvet is both a stringed instrument and an epic tradition among communities including the…",
        "options": [
          "Fang, Beti and Bulu",
          "Akan and Ewe",
          "Zulu and Xhosa",
          "Tuareg and Nubian"
        ],
        "correct": [
          0
        ],
        "explanation": "Mvet joins instrument, poetry, history and philosophy among peoples of Cameroon, Gabon and Equatorial Guinea.",
        "topic": "ORAL HISTORY"
      },
      {
        "kind": "complete",
        "prompt": "Complete the proverb: ‘A river is filled by small ___.’",
        "options": [
          "streams",
          "drums",
          "markets",
          "palaces"
        ],
        "correct": [
          0
        ],
        "explanation": "Many small contributions can create something powerful together.",
        "topic": "PROVERBS"
      }
    ]
  },
  "north": {
    "name": "North Africa",
    "short": "North",
    "place": "Maghreb, Nile & Sahara",
    "mark": "☼",
    "hello": "Amazigh, Arab, Nubian, Saharan and Mediterranean histories in conversation.",
    "palette": [
      "#d7a856",
      "#1c7180",
      "#61341f"
    ],
    "drops": [
      "Amazigh, Arab, Nubian, Beja, Coptic, Saharan and Mediterranean histories overlap without becoming one story.",
      "Carthage, ancient Egypt, Kush and Maghrebi dynasties connected Africa to the Mediterranean, Nile and Sahara.",
      "Couscous, zellige, raï and Gnawa show how everyday practices carry memory while continually evolving."
    ],
    "questions": [
      {
        "kind": "single",
        "prompt": "What does the Amazigh plural name Imazighen refer to?",
        "options": [
          "Amazigh people",
          "a tile pattern",
          "a couscous pot",
          "an ancient harbour"
        ],
        "correct": [
          0
        ],
        "explanation": "Imazighen is the plural of Amazigh, the self-name used by many Indigenous peoples across North Africa and the Sahara.",
        "topic": "PEOPLES & LANGUAGE"
      },
      {
        "kind": "complete",
        "prompt": "Complete the greeting response: ‘As-salaamu alaykum’. ‘Wa alaykum ___.’",
        "options": [
          "as-salaam",
          "shukran",
          "sabah",
          "baraka"
        ],
        "correct": [
          0
        ],
        "explanation": "The exchange means ‘peace be upon you’ and ‘and upon you be peace.’",
        "topic": "LANGUAGE"
      },
      {
        "kind": "multi",
        "prompt": "Select three historic North African centres.",
        "options": [
          "Carthage",
          "Fez",
          "Alexandria",
          "Great Zimbabwe"
        ],
        "correct": [
          0,
          1,
          2
        ],
        "explanation": "Carthage, Fez and Alexandria shaped different eras of North African trade, scholarship and statecraft.",
        "topic": "HISTORY"
      },
      {
        "kind": "image",
        "prompt": "Which image shows couscous?",
        "options": [
          "A",
          "B",
          "C",
          "D"
        ],
        "correct": [],
        "explanation": "",
        "topic": "FOOD",
        "visualStart": 0
      },
      {
        "kind": "multi",
        "prompt": "Select the three scripts on the Rosetta Stone.",
        "options": [
          "Egyptian hieroglyphs",
          "Demotic",
          "Ancient Greek",
          "Latin"
        ],
        "correct": [
          0,
          1,
          2
        ],
        "explanation": "The decree appears in hieroglyphic, Demotic and Ancient Greek, enabling the decipherment of Egyptian hieroglyphs.",
        "topic": "HISTORY"
      },
      {
        "kind": "complete",
        "prompt": "Complete the sentence: Tamazight names a group of ___ languages.",
        "options": [
          "Amazigh",
          "Romance",
          "Nilotic",
          "Germanic"
        ],
        "correct": [
          0
        ],
        "explanation": "Tamazight can refer broadly to Amazigh language varieties and, in some contexts, to standardised forms.",
        "topic": "LANGUAGE"
      },
      {
        "kind": "single",
        "prompt": "The ancient kingdom of Kush flourished mainly in today’s…",
        "options": [
          "Sudan",
          "Algeria",
          "Morocco",
          "Libya"
        ],
        "correct": [
          0
        ],
        "explanation": "Kush flourished along the Middle Nile in Nubia, with major centres including Napata and Meroë.",
        "topic": "HISTORY"
      },
      {
        "kind": "image",
        "prompt": "Which image shows zellige mosaic tilework?",
        "options": [
          "A",
          "B",
          "C",
          "D"
        ],
        "correct": [],
        "explanation": "",
        "topic": "ART",
        "visualStart": 4
      },
      {
        "kind": "multi",
        "prompt": "Select three countries in the joint UNESCO couscous heritage nomination.",
        "options": [
          "Algeria",
          "Morocco",
          "Tunisia",
          "Egypt"
        ],
        "correct": [
          0,
          1,
          2
        ],
        "explanation": "Algeria, Mauritania, Morocco and Tunisia jointly nominated the knowledge and practices of couscous.",
        "topic": "FOOD"
      },
      {
        "kind": "single",
        "prompt": "Gnawa music and ritual traditions are especially associated with…",
        "options": [
          "Morocco",
          "Egypt",
          "South Sudan",
          "Madagascar"
        ],
        "correct": [
          0
        ],
        "explanation": "Gnawa traditions in Morocco combine music, spirituality and histories connected to sub-Saharan Africa.",
        "topic": "MUSIC"
      },
      {
        "kind": "single",
        "prompt": "Why was ancient Alexandria famous across the Mediterranean world?",
        "options": [
          "Its library and scholarship",
          "Its gold mines",
          "Its rainforests",
          "Its cattle kingdom"
        ],
        "correct": [
          0
        ],
        "explanation": "Ancient Alexandria became a major centre of scholarship, translation and exchange under the Ptolemies.",
        "topic": "HISTORY"
      },
      {
        "kind": "complete",
        "prompt": "Complete the Arabic proverb: ‘Patience is the key to ___.’",
        "options": [
          "relief",
          "silence",
          "wealth",
          "travel"
        ],
        "correct": [
          0
        ],
        "explanation": "Al-sabr miftah al-faraj means ‘patience is the key to relief’. It is heard across Arabic-speaking North Africa.",
        "topic": "PROVERBS"
      }
    ]
  },
  "south": {
    "name": "Southern Africa",
    "short": "South",
    "place": "Savannah, highveld & coast",
    "mark": "◆",
    "hello": "Great states, living philosophies, language families and revolutionary sound.",
    "palette": [
      "#693d79",
      "#e5a92d",
      "#173f49"
    ],
    "drops": [
      "Shona, Nguni, Sotho-Tswana, Chewa, Tsonga and many other language communities cross modern borders.",
      "Great Zimbabwe and Mapungubwe reveal powerful precolonial states linked to Indian Ocean trade.",
      "Mbira, choral traditions, jazz, chimurenga, kwaito and amapiano belong to a vast, changing musical landscape."
    ],
    "questions": [
      {
        "kind": "single",
        "prompt": "Great Zimbabwe was built by ancestors of which people?",
        "options": [
          "Shona",
          "Romans",
          "Phoenicians",
          "Vikings"
        ],
        "correct": [
          0
        ],
        "explanation": "Great Zimbabwe was an African city and royal centre built by ancestors of Shona communities.",
        "topic": "HISTORY"
      },
      {
        "kind": "complete",
        "prompt": "Complete the Nguni expression: ‘Umuntu ngumuntu ngabantu’. A person is a person through…",
        "options": [
          "other people",
          "wealth",
          "cattle alone",
          "silence"
        ],
        "correct": [
          0
        ],
        "explanation": "The saying expresses relational personhood and is often connected with ideas described as ubuntu.",
        "topic": "PHILOSOPHY"
      },
      {
        "kind": "multi",
        "prompt": "Select the three Nguni languages.",
        "options": [
          "isiZulu",
          "isiXhosa",
          "siSwati",
          "Setswana"
        ],
        "correct": [
          0,
          1,
          2
        ],
        "explanation": "isiZulu, isiXhosa and siSwati belong to the Nguni branch; Setswana is Sotho-Tswana.",
        "topic": "LANGUAGE"
      },
      {
        "kind": "image",
        "prompt": "Which image shows sadza or pap served with relish?",
        "options": [
          "A",
          "B",
          "C",
          "D"
        ],
        "correct": [],
        "explanation": "",
        "topic": "FOOD",
        "visualStart": 0
      },
      {
        "kind": "single",
        "prompt": "What made Mapungubwe especially important?",
        "options": [
          "It was an early state and gold-trading centre",
          "It invented hieroglyphs",
          "It was a Roman colony",
          "It was a Swahili island"
        ],
        "correct": [
          0
        ],
        "explanation": "Mapungubwe flourished around 1050–1270 and reveals complex society and long-distance trade before Great Zimbabwe’s height.",
        "topic": "HISTORY"
      },
      {
        "kind": "complete",
        "prompt": "Complete the Sesotho/Setswana greeting: ‘Dumela’ means…",
        "options": [
          "hello",
          "dance",
          "listen",
          "food"
        ],
        "correct": [
          0
        ],
        "explanation": "Dumela is a common greeting in Sesotho and Setswana, spoken across several countries.",
        "topic": "LANGUAGE"
      },
      {
        "kind": "multi",
        "prompt": "Setswana has official or nationally recognised status in which three countries?",
        "options": [
          "Botswana",
          "South Africa",
          "Zimbabwe",
          "Angola"
        ],
        "correct": [
          0,
          1,
          2
        ],
        "explanation": "Setswana is official in Botswana and South Africa and among Zimbabwe’s constitutionally recognised languages.",
        "topic": "LANGUAGE"
      },
      {
        "kind": "image",
        "prompt": "Which image shows a Zimbabwean mbira?",
        "options": [
          "A",
          "B",
          "C",
          "D"
        ],
        "correct": [],
        "explanation": "",
        "topic": "MUSIC",
        "visualStart": 4
      },
      {
        "kind": "single",
        "prompt": "Makishi masquerade traditions are especially associated with initiation among peoples including the…",
        "options": [
          "Luvale, Chokwe and Luchazi",
          "Akan and Ewe",
          "Amazigh and Nubian",
          "Somali and Oromo"
        ],
        "correct": [
          0
        ],
        "explanation": "Makishi masquerades are linked to mukanda initiation traditions in parts of Zambia and Angola.",
        "topic": "TRADITION"
      },
      {
        "kind": "multi",
        "prompt": "Select three Southern African liberation leaders.",
        "options": [
          "Nelson Mandela",
          "Samora Machel",
          "Kenneth Kaunda",
          "Haile Selassie"
        ],
        "correct": [
          0,
          1,
          2
        ],
        "explanation": "Mandela, Machel and Kaunda led South Africa, Mozambique and Zambia; Haile Selassie was emperor of Ethiopia.",
        "topic": "MODERN HISTORY"
      },
      {
        "kind": "single",
        "prompt": "Why is San rock art historically valuable?",
        "options": [
          "It records knowledge, ritual and changing lives",
          "It is only modern decoration",
          "It is written in Latin",
          "It maps Roman roads"
        ],
        "correct": [
          0
        ],
        "explanation": "San rock art offers layered records of belief, experience, animals and historical change.",
        "topic": "ART & HISTORY"
      },
      {
        "kind": "complete",
        "prompt": "Complete the Setswana proverb: ‘Kgosi ke kgosi ka ___.’",
        "options": [
          "batho",
          "gauta",
          "pula",
          "dijo"
        ],
        "correct": [
          0
        ],
        "explanation": "‘A chief is a chief through the people’ reminds leaders that authority depends on community.",
        "topic": "PROVERBS"
      }
    ]
  }
});

export const avatarChoices: readonly AvatarChoice[] = Object.freeze([
  {
    "id": "amara",
    "name": "Amara",
    "src": "/avatars/amara.webp",
    "vibe": "The Radiant One"
  },
  {
    "id": "zuri",
    "name": "Zuri",
    "src": "/avatars/zuri.webp",
    "vibe": "The Wild Card"
  },
  {
    "id": "nia",
    "name": "Nia",
    "src": "/avatars/nia.webp",
    "vibe": "The Story Charmer"
  },
  {
    "id": "lindi",
    "name": "Lindi",
    "src": "/avatars/lindi.webp",
    "vibe": "The Joy Bringer"
  },
  {
    "id": "imara",
    "name": "Imara",
    "src": "/avatars/imara.webp",
    "vibe": "The Power Move"
  },
  {
    "id": "aya",
    "name": "Aya",
    "src": "/avatars/aya.webp",
    "vibe": "The Golden Hour"
  },
  {
    "id": "adjoa",
    "name": "Adjoa",
    "src": "/avatars/adjoa-v2.webp",
    "vibe": "The Wise Spark"
  },
  {
    "id": "samira",
    "name": "Samira",
    "src": "/avatars/samira-v2.webp",
    "vibe": "The Desert Star"
  },
  {
    "id": "wanjiku",
    "name": "Wanjiku",
    "src": "/avatars/wanjiku-v2.webp",
    "vibe": "The Bright Horizon"
  },
  {
    "id": "mbali",
    "name": "Mbali",
    "src": "/avatars/mbali-v2.webp",
    "vibe": "The Purple Reign"
  },
  {
    "id": "efe",
    "name": "Efe",
    "src": "/avatars/efe-v2.webp",
    "vibe": "The Coral Flame"
  },
  {
    "id": "malaika",
    "name": "Malaika",
    "src": "/avatars/malaika-v2.webp",
    "vibe": "The Clever Glow"
  }
]);

export const sourceCollections = Object.freeze([
  {
    "label": "UNESCO General History of Africa",
    "href": "https://www.unesco.org/en/general-history-africa"
  },
  {
    "label": "British Museum | African histories",
    "href": "https://www.britishmuseum.org/collection/galleries/africa"
  },
  {
    "label": "Met Museum | African art",
    "href": "https://www.metmuseum.org/art/collection/search?geolocation=Africa"
  },
  {
    "label": "UNESCO Intangible Heritage in Africa",
    "href": "https://ich.unesco.org/en/lists?multinational=3&display1=inscriptionID#tabs"
  }
]);
