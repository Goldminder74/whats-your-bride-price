"""Authored West Africa facts. Each claim is meant to appear on the named Wikipedia page."""

def s(diff, cat, country, answer, definition, wiki, claim):
    return dict(region="west", difficulty=diff, kind="single", category=cat, country=country, answer=answer, definition=definition, wiki=wiki, claim=claim)

def m(diff, cat, country, prompt, options, correct, wiki, claim, explanation):
    return dict(region="west", difficulty=diff, kind="multi", category=cat, country=country, answer=options[correct[0]], definition="", wiki=wiki, claim=claim, options=options, correct=correct, prompt=prompt, explanation=explanation)

def c(diff, cat, country, prompt, options, correct, wiki, claim, explanation):
    return dict(region="west", difficulty=diff, kind="complete", category=cat, country=country, answer=options[correct[0]], definition="", wiki=wiki, claim=claim, options=options, correct=correct, prompt=prompt, explanation=explanation)

ROWS = [
    # GEOGRAPHY
    s("easy", "GEOGRAPHY", "Nigeria", "Abuja", "the planned capital city of Nigeria", "Abuja", "Abuja is the capital city of Nigeria"),
    s("easy", "GEOGRAPHY", "Ghana", "Accra", "the coastal capital city of Ghana", "Accra", "Accra is the capital of Ghana"),
    s("easy", "GEOGRAPHY", "Senegal", "Dakar", "the Atlantic capital city of Senegal", "Dakar", "Dakar is the capital of Senegal"),
    s("easy", "GEOGRAPHY", "Mali", "Bamako", "the capital city of Mali on the Niger River", "Bamako", "Bamako is the capital of Mali"),
    s("easy", "GEOGRAPHY", "Guinea", "Conakry", "the capital city of Guinea on the Atlantic", "Conakry", "Conakry is the capital of Guinea"),
    s("medium", "GEOGRAPHY", "Burkina Faso", "Ouagadougou", "the capital city of Burkina Faso", "Ouagadougou", "Ouagadougou is the capital of Burkina Faso"),
    s("easy", "GEOGRAPHY", "Niger", "Niamey", "the capital city of Niger beside the Niger River", "Niamey", "Niamey is the capital of Niger"),
    s("medium", "GEOGRAPHY", "Sierra Leone", "Freetown", "the capital city of Sierra Leone", "Freetown", "Freetown is the capital of Sierra Leone"),
    s("medium", "GEOGRAPHY", "Liberia", "Monrovia", "the capital city of Liberia", "Monrovia", "Monrovia is the capital of Liberia"),
    s("medium", "GEOGRAPHY", "Togo", "Lome", "the capital city of Togo on the Gulf of Guinea", "Lomé", "Lomé is the capital of Togo"),
    s("medium", "GEOGRAPHY", "Gambia", "Banjul", "the capital city of The Gambia", "Banjul", "Banjul is the capital of the Gambia"),
    s("medium", "GEOGRAPHY", "Cape Verde", "Praia", "the capital city of Cape Verde", "Praia", "Praia is the capital of Cape Verde"),
    s("hard", "GEOGRAPHY", "Côte d'Ivoire", "Yamoussoukro", "the official capital city of Côte d'Ivoire", "Yamoussoukro", "Yamoussoukro is the capital of Ivory Coast"),
    s("easy", "GEOGRAPHY", "Nigeria", "Lagos", "the largest city in Nigeria, on the Atlantic coast", "Lagos", "Lagos is the largest city in Nigeria"),
    s("medium", "GEOGRAPHY", "Mali", "Timbuktu", "the historic Sahelian city of scholarship in Mali", "Timbuktu", "Timbuktu is a city in Mali"),
    s("medium", "GEOGRAPHY", "Mali", "Djenné", "the Malian city famous for its great earthen mosque", "Djenné", "Djenné is a town in Mali"),
    s("hard", "GEOGRAPHY", "Ghana", "Lake Volta", "the very large reservoir lake in Ghana", "Lake Volta", "Lake Volta is a large reservoir in Ghana"),
    s("medium", "GEOGRAPHY", "Mali", "Niger River", "the great West African river that bends through Mali", "Niger River", "The Niger River is the main river of West Africa"),
    # FOOD
    s("easy", "FOOD", "Nigeria", "Jollof rice", "a one-pot tomato rice loved at West African tables, with famous pots in Nigeria", "Jollof rice", "Jollof rice is a rice dish popular in West Africa"),
    s("easy", "FOOD", "Senegal", "Thieboudienne", "the Senegalese rice and fish dish often called the national dish", "Thieboudienne", "Thieboudienne is a traditional dish from Senegal"),
    s("easy", "FOOD", "Nigeria", "Suya", "a spicy grilled meat skewer sold on Nigerian streets", "Suya", "Suya is a spicy meat skewer popular in Nigeria"),
    s("easy", "FOOD", "Nigeria", "Egusi soup", "a Nigerian soup thickened with melon seeds", "Egusi soup", "Egusi soup is a soup made with egusi seeds in Nigeria"),
    s("medium", "FOOD", "Ghana", "Kelewele", "spicy fried ripe plantain cubes from Ghana", "Kelewele", "Kelewele is a Ghanaian food made from fried plantains"),
    s("medium", "FOOD", "Ghana", "Waakye", "Ghanaian rice and beans cooked together", "Waakye", "Waakye is a Ghanaian dish of rice and beans"),
    s("medium", "FOOD", "Côte d'Ivoire", "Attiéké", "a couscous-like cassava side from Côte d'Ivoire", "Attiéké", "Attiéké is a side dish made from cassava in Côte d'Ivoire"),
    s("medium", "FOOD", "Senegal", "Yassa", "a Senegalese onion and lemon sauce, often with chicken", "Yassa (food)", "Yassa is a dish from Senegal"),
    s("easy", "FOOD", "West Africa", "Fufu", "a smooth pounded staple swallowed with soup across West Africa", "Fufu", "Fufu is a staple food in West Africa"),
    s("medium", "FOOD", "Mali", "Maafe", "a West African groundnut stew, widely loved in Mali and Senegal", "Maafe", "Maafe is a stew made with peanut sauce"),
    s("medium", "FOOD", "Côte d'Ivoire", "Alloco", "fried ripe plantain served as a street snack in Côte d'Ivoire", "Alloco", "Alloco is a dish of fried plantain in Côte d'Ivoire"),
    s("hard", "FOOD", "Nigeria", "Kilishi", "a dry spiced meat similar to jerky, associated with northern Nigeria", "Kilishi", "Kilishi is a dried meat from Nigeria"),
    s("medium", "FOOD", "Ghana", "Shito", "a dark hot pepper sauce from Ghana", "Shito", "Shito is a hot pepper sauce from Ghana"),
    s("medium", "FOOD", "Ghana", "Red red", "a Ghanaian bean stew often served with fried plantain", "Red red", "Red red is a bean stew from Ghana"),
    s("easy", "FOOD", "Nigeria", "Puff puff", "a deep-fried dough ball sold as a Nigerian snack", "Puff-puff", "Puff-puff is a deep-fried dough snack from Nigeria"),
    s("easy", "FOOD", "Nigeria", "Chin chin", "a crunchy fried pastry snack from Nigeria", "Chin chin", "Chin chin is a fried snack from Nigeria"),
    s("hard", "FOOD", "Ghana", "Palm nut soup", "a rich soup made from palm fruit, common in Ghana", "Palm nut soup", "Palm nut soup is a soup made from palm fruit"),
    s("medium", "FOOD", "Nigeria", "Gari", "a dry granular cassava food eaten across coastal West Africa", "Gari (food)", "Gari is a cassava flour popular in West Africa"),
    # MUSIC
    s("easy", "MUSIC", "Ghana", "Highlife", "the guitar-and-horn dance music that grew famous in Ghana", "Highlife", "Highlife is a music genre that originated in Ghana"),
    s("easy", "MUSIC", "Nigeria", "Afrobeat", "the funk-and-jazz political dance music pioneered by Fela Kuti", "Afrobeat", "Afrobeat is a music genre created by Fela Kuti"),
    s("easy", "MUSIC", "Nigeria", "Afrobeats", "the 21st-century Nigerian and Ghanaian pop sound heard worldwide", "Afrobeats", "Afrobeats is a contemporary music genre from Nigeria and Ghana"),
    s("medium", "MUSIC", "Nigeria", "Fuji music", "a percussion-heavy Yoruba popular music from Nigeria", "Fuji music", "Fuji music is a popular genre from Nigeria"),
    s("medium", "MUSIC", "Nigeria", "Jùjú music", "a Yoruba popular style built around guitar and talking drum", "Jùjú music", "Jùjú is a style of Nigerian popular music"),
    s("medium", "MUSIC", "Senegal", "Mbalax", "the Senegalese dance music associated with Youssou N'Dour", "Mbalax", "Mbalax is a popular music of Senegal"),
    s("easy", "MUSIC", "Mali", "Kora", "the 21-string harp-lute of Mande griots", "Kora (instrument)", "The kora is a string instrument from West Africa"),
    s("easy", "MUSIC", "Guinea", "Djembe", "the goblet drum widely played across the Mande world", "Djembe", "The djembe is a rope-tuned drum from West Africa"),
    s("medium", "MUSIC", "Mali", "Balafon", "a wooden xylophone of the Mande musical world", "Balafon", "The balafon is a wooden xylophone from West Africa"),
    s("medium", "MUSIC", "Nigeria", "Talking drum", "an hourglass drum whose pitch can echo speech tones", "Talking drum", "The talking drum is used in West Africa"),
    s("hard", "MUSIC", "Mali", "Wassoulou", "a southern Malian music associated with strong women singers", "Wassoulou music", "Wassoulou is a music from southern Mali"),
    s("medium", "MUSIC", "Ghana", "Azonto", "a playful Ghanaian dance that spread with hiplife and afrobeats", "Azonto", "Azonto is a dance from Ghana"),
    s("medium", "MUSIC", "Ghana", "Hiplife", "a Ghanaian fusion of highlife and hip hop", "Hiplife", "Hiplife is a Ghanaian music genre"),
    s("hard", "MUSIC", "Côte d'Ivoire", "Coupé-décalé", "a dance music from Côte d'Ivoire that filled clubs in the 2000s", "Coupé-décalé", "Coupé-décalé is a music and dance genre from Côte d'Ivoire"),
    s("hard", "MUSIC", "Senegal", "Sabar", "a Senegalese drum and dance tradition", "Sabar", "Sabar is a drum from Senegal"),
    s("hard", "MUSIC", "Nigeria", "Apala", "a Yoruba percussion genre that predates fuji", "Apala", "Apala is a genre of Nigerian Yoruba music"),
    s("medium", "MUSIC", "Sierra Leone", "Palm-wine music", "a West African guitar style named for palm wine", "Palm-wine music", "Palm-wine music is a West African guitar style"),
    s("medium", "MUSIC", "Mali", "Griot", "a hereditary praise singer and historian in Mande societies, also called a jeli", "Griot", "A griot is a West African historian and musician"),
    # FASHION
    s("easy", "FASHION", "Ghana", "Kente", "the brightly strip-woven cloth of Akan and Ewe weavers in Ghana", "Kente cloth", "Kente is a Ghanaian textile made of woven strips"),
    s("easy", "FASHION", "Nigeria", "Adire", "an indigo resist-dyed cloth of Yoruba makers", "Adire (textile art)", "Adire is a textile art of the Yoruba people"),
    s("medium", "FASHION", "Nigeria", "Aso oke", "a hand-woven Yoruba prestige cloth", "Aso oke", "Aso oke is a hand-woven cloth of the Yoruba"),
    s("easy", "FASHION", "West Africa", "Ankara", "the colourful wax-print cotton worn across West Africa", "Ankara (fabric)", "Ankara is a wax-print fabric popular in West Africa"),
    s("medium", "FASHION", "Nigeria", "Gele", "a sculpted woman's headwrap worn for Nigerian celebrations", "Head tie", "A gele is a Nigerian head tie"),
    s("medium", "FASHION", "Nigeria", "Agbada", "a flowing embroidered robe worn by men in Nigeria", "Agbada", "The agbada is a robe worn by men in West Africa"),
    s("hard", "FASHION", "Ghana", "Fugu", "the smock worn in northern Ghana, also called a batakari", "Fugu (garment)", "Fugu is a smock worn in northern Ghana"),
    s("medium", "FASHION", "Mali", "Bogolan", "mudcloth painted with fermented mud in Mali", "Bogolanfini", "Bogolanfini is a handmade cotton fabric from Mali"),
    s("medium", "FASHION", "Nigeria", "Fila", "a soft Yoruba cap worn by men", "Fila (hat)", "The fila is a traditional cap of the Yoruba"),
    s("easy", "FASHION", "West Africa", "Dashiki", "a loose colourful pullover shirt worn across West Africa", "Dashiki", "The dashiki is a colourful garment from West Africa"),
    s("hard", "FASHION", "Mali", "Bazin", "a shiny dyed cotton prestige cloth, also called getzner, loved in Mali", "Bazin (fabric)", "Bazin is a dyed cotton fabric popular in West Africa"),
    s("medium", "FASHION", "Nigeria", "Wrapper", "a length of cloth tied as a skirt or gown in Nigeria", "Wrapper (clothing)", "A wrapper is a garment worn in West Africa"),
    s("hard", "FASHION", "Ghana", "Krobo beads", "powder-glass beads made by Krobo communities in Ghana", "Krobo people", "The Krobo people of Ghana are known for glass beads"),
    s("medium", "FASHION", "Nigeria", "Isiagu", "a patterned Igbo men's shirt often worn for ceremonies", "Isiagu", "Isiagu is a shirt worn by Igbo men"),
    s("hard", "FASHION", "Senegal", "Boubou", "a long flowing robe worn for celebrations in Senegal", "Boubou (clothing)", "The boubou is a flowing robe worn in West Africa"),
    s("medium", "FASHION", "Ghana", "Kaba and slit", "a tailored blouse and skirt set worn by Ghanaian women", "Kaba and slit", "Kaba and slit is a dress worn by women in Ghana"),
    s("easy", "FASHION", "Nigeria", "Coral beads", "red beads worn as prestige jewellery in Benin and Nigerian ceremonies", "Coral", "Coral beads are worn in Nigeria"),
    s("hard", "FASHION", "Mali", "Indigo cloth", "deep blue dyed cotton associated with Malian and Sahelian dress", "Indigo dye", "Indigo dye is used for blue cloth in West Africa"),
]
