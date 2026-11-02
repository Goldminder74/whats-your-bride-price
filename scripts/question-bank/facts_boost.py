"""Extra sourced facts. Prompts are rewritten from the page sentence when the draft wording does not match."""

def item(region, diff, cat, country, answer, definition, wiki, claim):
    return dict(region=region, difficulty=diff, kind="single", category=cat, country=country, answer=answer, definition=definition, wiki=wiki, claim=claim)

def pack(region, rows):
    return [item(region, *row) for row in rows]

WEST = pack("west", [
("medium","POP","Ghana","Sarkodie","the Ghanaian rapper known for Twi and English bars","Sarkodie","Sarkodie is a Ghanaian rapper"),
("easy","FOOD","Ghana","Banku","a fermented corn and cassava dough from Ghana","Banku","Banku is a Ghanaian dish of fermented corn and cassava"),
("medium","FASHION","Ghana","Adinkra","printed symbols of Akan philosophy on cloth","Adinkra symbols","Adinkra symbols are visual symbols from Ghana"),
("medium","FESTIVALS","Ghana","Hogbetsotso","the Anlo festival that marks a historic migration","Hogbetsotso festival","Hogbetsotso is a festival of the Anlo people in Ghana"),
("easy","GEOGRAPHY","Ghana","Lake Volta","the large reservoir lake on the Volta River in Ghana","Lake Volta","Lake Volta is a reservoir in Ghana"),
("medium","PEOPLE","Nigeria","Chimamanda Ngozi Adichie","the Nigerian novelist of Half of a Yellow Sun","Chimamanda Ngozi Adichie","Chimamanda Ngozi Adichie is a Nigerian writer"),
("easy","PEOPLE","Nigeria","Chinua Achebe","the Nigerian novelist of Things Fall Apart","Chinua Achebe","Chinua Achebe is a Nigerian novelist"),
("medium","POP","Benin","Angelique Kidjo","the Beninese singer who blends Fon, Yoruba, and global pop","Angélique Kidjo","Angélique Kidjo is a Beninese singer"),
("medium","MUSIC","Mali","Tinariwen","the Tuareg guitar band from northern Mali","Tinariwen","Tinariwen is a Tuareg band from Mali"),
("easy","SPORT","Nigeria","Nwankwo Kanu","the Nigerian forward who won Olympic gold in 1996","Nwankwo Kanu","Nwankwo Kanu is a Nigerian footballer"),
])

EAST = pack("east", [
("medium","SPORT","Kenya","Faith Kipyegon","the Kenyan runner who won Olympic 1500 metres gold in 2021","Faith Kipyegon","Faith Kipyegon is a Kenyan middle-distance runner"),
("medium","SPORT","Ethiopia","Tirunesh Dibaba","the Ethiopian runner who won Olympic 10,000 metres gold in 2008","Tirunesh Dibaba","Tirunesh Dibaba is an Ethiopian long-distance runner"),
("medium","SPORT","Ethiopia","Abebe Bikila","the Ethiopian who won the Olympic marathon in Rome in 1960","Abebe Bikila","Abebe Bikila was an Ethiopian marathon runner"),
("easy","PEOPLE","Kenya","Wangari Maathai","the Kenyan who won the Nobel Peace Prize in 2004","Wangari Maathai","Wangari Maathai was a Kenyan environmentalist"),
("medium","POP","Tanzania","Diamond Platnumz","a Tanzanian bongo flava singer and producer","Diamond Platnumz","Diamond Platnumz is a Tanzanian singer"),
("medium","POP","Kenya","Sauti Sol","a Kenyan band known for close-harmony afropop","Sauti Sol","Sauti Sol is a Kenyan band"),
("easy","FESTIVALS","Ethiopia","Meskel","the Ethiopian festival of the finding of the True Cross","Meskel","Meskel is an Ethiopian festival"),
("easy","FESTIVALS","Ethiopia","Timkat","the Ethiopian Orthodox celebration of Epiphany","Timkat","Timkat is an Ethiopian Orthodox festival"),
("medium","GEOGRAPHY","East Africa","Lake Victoria","Africa's largest lake, shared by Kenya, Uganda, and Tanzania","Lake Victoria","Lake Victoria is a lake in East Africa"),
("medium","GEOGRAPHY","Tanzania","Ngorongoro","a conservation area with a famous volcanic crater in Tanzania","Ngorongoro Conservation Area","Ngorongoro is a conservation area in Tanzania"),
("medium","GEOGRAPHY","Tanzania","Stone Town","the historic coral-stone quarter of Zanzibar","Stone Town","Stone Town is the old quarter of Zanzibar"),
("easy","GEOGRAPHY","Ethiopia","Lalibela churches","the Ethiopian town famous for its rock-hewn churches","Lalibela","Lalibela is known for rock-hewn churches in Ethiopia"),
("medium","GEOGRAPHY","Kenya","Lamu","the old Swahili town on a Kenyan island","Lamu","Lamu is a historic town on the Kenyan coast"),
("easy","FASHION","East Africa","Kanga","a colourful printed cotton wrap of the Swahili coast","Kanga (garment)","The kanga is a printed cotton wrap from East Africa"),
("medium","FASHION","East Africa","Kitenge","a brightly patterned wrap cloth of East Africa","Kitenge","Kitenge is a patterned cloth worn in East Africa"),
("easy","FOOD","East Africa","Mandazi","a sweet fried dough snack of the Swahili coast","Mandazi","Mandazi is a fried dough snack from East Africa"),
("medium","FOOD","Uganda","Rolex","a chapati rolled around an omelette, sold on Ugandan streets","Rolex (food)","A rolex is a Ugandan street snack of chapati and egg"),
("medium","MUSIC","Tanzania","Taarab","Swahili coast music of poetry, strings, and voice","Taarab","Taarab is a music of the Swahili coast"),
("medium","MUSIC","Kenya","Genge","a Kenyan hip hop style that grew up in Nairobi","Genge","Genge is a Kenyan music genre"),
("easy","LANGUAGE","Ethiopia","Amharic","a major working language of Ethiopia","Amharic","Amharic is a language of Ethiopia"),
("easy","LANGUAGE","Rwanda","Kinyarwanda","the national language of Rwanda","Kinyarwanda","Kinyarwanda is the national language of Rwanda"),
("easy","LANGUAGE","Madagascar","Malagasy","the national language of Madagascar","Malagasy language","Malagasy is the national language of Madagascar"),
])

CENTRAL = pack("central", [
("easy","MUSIC","Cameroon","Makossa","a popular dance music of Cameroon","Makossa","Makossa is a Cameroonian music genre"),
("medium","MUSIC","Cameroon","Bikutsi","a Beti dance music of Cameroon","Bikutsi","Bikutsi is a Cameroonian music genre"),
("medium","POP","Cameroon","Manu Dibango","the Cameroonian saxophonist of Soul Makossa","Manu Dibango","Manu Dibango was a Cameroonian musician"),
("medium","POP","DR Congo","Papa Wemba","a star of Congolese rumba","Papa Wemba","Papa Wemba was a Congolese singer"),
("medium","POP","DR Congo","Koffi Olomide","a Congolese soukous singer","Koffi Olomidé","Koffi Olomidé is a Congolese singer"),
("easy","SPORT","Cameroon","Samuel Eto'o","the Cameroonian striker who played for Barcelona and Inter","Samuel Eto'o","Samuel Eto'o is a Cameroonian footballer"),
("medium","SPORT","Cameroon","Roger Milla","the Cameroonian striker famous at the 1990 World Cup","Roger Milla","Roger Milla is a Cameroonian footballer"),
("easy","FOOD","Cameroon","Ndolé","a Cameroonian stew of bitter leaves and nuts","Ndolé","Ndolé is a dish from Cameroon"),
("medium","FOOD","DR Congo","Moambe","a palm-butter stew of the Congo","Moambe","Moambe is a Congolese dish"),
("easy","GEOGRAPHY","Cameroon","Mount Cameroon","the active volcano that is Cameroon's highest peak","Mount Cameroon","Mount Cameroon is a volcano in Cameroon"),
("easy","GEOGRAPHY","Central Africa","Congo River","the great river of the Congo Basin","Congo River","The Congo River is a major river of Central Africa"),
("medium","GEOGRAPHY","DR Congo","Lake Kivu","the lake between DR Congo and Rwanda","Lake Kivu","Lake Kivu lies between the Democratic Republic of the Congo and Rwanda"),
("easy","LANGUAGE","DR Congo","Lingala","a widely spoken lingua franca of the Congos","Lingala","Lingala is a language of the Congo"),
("medium","LANGUAGE","Cameroon","Duala","a coastal language of Cameroon","Duala language","Duala is a language of Cameroon"),
("medium","FESTIVALS","Cameroon","Ngondo","a coastal Sawa water festival in Douala","Ngondo","Ngondo is a festival in Cameroon"),
("easy","HISTORY","Angola","Agostinho Neto","Angola's first president","Agostinho Neto","Agostinho Neto was the first president of Angola"),
("medium","PEOPLE","DR Congo","Patrice Lumumba","the first prime minister of the independent Congo","Patrice Lumumba","Patrice Lumumba was the first prime minister of the Congo"),
])

NORTH = pack("north", [
("easy","FOOD","Morocco","Tagine","the slow-cooked stew named for its conical pot","Tajine","A tajine is a North African stew"),
("medium","FOOD","Morocco","Pastilla","a sweet-savoury pie of Moroccan feasts","Pastilla","Pastilla is a Moroccan pie"),
("easy","FOOD","Morocco","Harira","a tomato and lentil soup of Moroccan tables","Harira","Harira is a soup from Morocco"),
("easy","FOOD","North Africa","Mint tea","the sweet green tea poured in Maghrebi glasses","Maghrebi mint tea","Mint tea is served across the Maghreb"),
("medium","MUSIC","Algeria","Raï","the popular music of Oran","Raï","Raï is a music genre from Algeria"),
("medium","MUSIC","Morocco","Gnawa","a Moroccan music of trance, guembri, and iron castanets","Gnawa","Gnawa is a Moroccan music tradition"),
("easy","GEOGRAPHY","Egypt","Pyramids of Giza","the ancient pyramid complex on the edge of Cairo","Giza pyramid complex","The Giza pyramid complex stands in Egypt"),
("easy","GEOGRAPHY","Egypt","Nile","the great river of Egypt","Nile","The Nile is a river in Egypt"),
("medium","GEOGRAPHY","Morocco","Chefchaouen","the blue-painted city in Morocco's Rif","Chefchaouen","Chefchaouen is a city in Morocco"),
("medium","GEOGRAPHY","Morocco","Jemaa el-Fnaa","the great square of Marrakesh","Jemaa el-Fnaa","Jemaa el-Fnaa is a square in Marrakesh"),
("easy","PEOPLE","Egypt","Naguib Mahfouz","the Egyptian novelist who won the Nobel Prize in Literature in 1988","Naguib Mahfouz","Naguib Mahfouz was an Egyptian writer"),
("medium","SPORT","Morocco","Hicham El Guerrouj","the Moroccan who won Olympic 1500 metres gold in 2004","Hicham El Guerrouj","Hicham El Guerrouj is a Moroccan middle-distance runner"),
("medium","SPORT","Morocco","Nawal El Moutawakel","the Moroccan who won Olympic 400 metres hurdles gold in 1984","Nawal El Moutawakel","Nawal El Moutawakel is a Moroccan hurdler"),
("easy","LANGUAGE","Egypt","Egyptian Arabic","the everyday Arabic of Egypt","Egyptian Arabic","Egyptian Arabic is the spoken Arabic of Egypt"),
("medium","LANGUAGE","Morocco","Tamazight","an Amazigh language of Morocco","Standard Moroccan Amazigh","Tamazight is an Amazigh language of Morocco"),
("medium","FESTIVALS","Morocco","Gnaoua festival","a world music festival in Essaouira","Gnaoua World Music Festival","The Gnaoua festival is held in Essaouira"),
("easy","HISTORY","Tunisia","Hannibal","the Carthaginian general who crossed the Alps","Hannibal","Hannibal was a Carthaginian general"),
])

SOUTH = pack("south", [
("easy","FOOD","South Africa","Bobotie","a spiced mince bake with an egg topping","Bobotie","Bobotie is a South African dish"),
("easy","FOOD","South Africa","Biltong","air-dried seasoned meat from Southern Africa","Biltong","Biltong is dried meat from Southern Africa"),
("medium","FOOD","South Africa","Bunny chow","a hollowed loaf filled with curry, from Durban","Bunny chow","Bunny chow is a South African dish from Durban"),
("easy","FOOD","South Africa","Boerewors","a coiled spiced sausage of the braai","Boerewors","Boerewors is a South African sausage"),
("medium","FOOD","South Africa","Chakalaka","a spicy vegetable relish served with pap","Chakalaka","Chakalaka is a South African relish"),
("medium","FOOD","Zimbabwe","Sadza","the stiff maize porridge of Zimbabwe","Sadza","Sadza is a maize porridge from Zimbabwe"),
("easy","MUSIC","South Africa","Amapiano","a South African house style built on log drum and piano","Amapiano","Amapiano is a South African music genre"),
("medium","MUSIC","South Africa","Kwaito","a South African dance music that boomed in the 1990s","Kwaito","Kwaito is a South African music genre"),
("medium","MUSIC","South Africa","Gqom","a raw electronic dance music from Durban","Gqom","Gqom is a South African music genre"),
("easy","POP","South Africa","Brenda Fassie","the South African pop star nicknamed Madonna of the Townships","Brenda Fassie","Brenda Fassie was a South African singer"),
("medium","POP","South Africa","Black Coffee","the South African DJ known for deep house","Black Coffee (DJ)","Black Coffee is a South African DJ"),
("medium","POP","South Africa","Tyla","the South African singer of Water","Tyla (singer)","Tyla is a South African singer"),
("easy","GEOGRAPHY","South Africa","Table Mountain","the flat-topped mountain above Cape Town","Table Mountain","Table Mountain overlooks Cape Town"),
("easy","GEOGRAPHY","South Africa","Kruger","a famous national park in South Africa","Kruger National Park","Kruger National Park is in South Africa"),
("medium","GEOGRAPHY","South Africa","Robben Island","the island prison off Cape Town where Nelson Mandela was held","Robben Island","Robben Island is an island off Cape Town"),
("medium","GEOGRAPHY","Zambia","Victoria Falls","the waterfall on the Zambezi between Zambia and Zimbabwe","Victoria Falls","Victoria Falls is a waterfall on the Zambezi"),
("medium","GEOGRAPHY","Botswana","Okavango Delta","the inland delta of northern Botswana","Okavango Delta","The Okavango Delta is in Botswana"),
("medium","GEOGRAPHY","Namibia","Namib","the coastal desert of Namibia","Namib","The Namib is a desert in Namibia"),
("easy","LANGUAGE","South Africa","isiZulu","the most widely spoken home language in South Africa","Zulu language","isiZulu is a language of South Africa"),
("easy","LANGUAGE","South Africa","isiXhosa","a Nguni language of South Africa, known for its clicks","Xhosa language","isiXhosa is a language of South Africa"),
("medium","LANGUAGE","Zimbabwe","Shona","a major language of Zimbabwe","Shona language","Shona is a language of Zimbabwe"),
("medium","SPORT","South Africa","Wayde van Niekerk","the South African who won Olympic 400 metres gold in 2016","Wayde van Niekerk","Wayde van Niekerk is a South African sprinter"),
("medium","SPORT","South Africa","Josia Thugwane","the South African who won the Olympic marathon in 1996","Josia Thugwane","Josia Thugwane is a South African marathon runner"),
("easy","FASHION","South Africa","Shweshwe","a printed dyed cotton cloth of Southern Africa","Shweshwe","Shweshwe is a printed cotton fabric from South Africa"),
("medium","HISTORY","South Africa","Robben Island history","the prison island where anti-apartheid leaders were held","Robben Island","Robben Island was a prison off Cape Town"),
])
