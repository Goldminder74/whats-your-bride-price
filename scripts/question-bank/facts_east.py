def s(diff, cat, country, answer, definition, wiki, claim):
    return dict(region="east", difficulty=diff, kind="single", category=cat, country=country, answer=answer, definition=definition, wiki=wiki, claim=claim)

def m(diff, cat, country, prompt, options, correct, wiki, claim, explanation):
    return dict(region="east", difficulty=diff, kind="multi", category=cat, country=country, answer=options[correct[0]], definition="", wiki=wiki, claim=claim, options=options, correct=correct, prompt=prompt, explanation=explanation)

def c(diff, cat, country, prompt, options, correct, wiki, claim, explanation):
    return dict(region="east", difficulty=diff, kind="complete", category=cat, country=country, answer=options[correct[0]], definition="", wiki=wiki, claim=claim, options=options, correct=correct, prompt=prompt, explanation=explanation)

ROWS = []
R = ROWS.append

for item in [
    ("easy", "Kenya", "Nairobi", "the capital city of Kenya", "Nairobi", "Nairobi is the capital of Kenya"),
    ("easy", "Uganda", "Kampala", "the capital city of Uganda", "Kampala", "Kampala is the capital of Uganda"),
    ("easy", "Ethiopia", "Addis Ababa", "the capital city of Ethiopia", "Addis Ababa", "Addis Ababa is the capital of Ethiopia"),
    ("medium", "Eritrea", "Asmara", "the capital city of Eritrea", "Asmara", "Asmara is the capital of Eritrea"),
    ("easy", "Rwanda", "Kigali", "the capital city of Rwanda", "Kigali", "Kigali is the capital of Rwanda"),
    ("hard", "Burundi", "Gitega", "the capital city of Burundi", "Gitega", "Gitega is the capital of Burundi"),
    ("medium", "Tanzania", "Dodoma", "the official capital city of Tanzania", "Dodoma", "Dodoma is the capital of Tanzania"),
    ("medium", "Somalia", "Mogadishu", "the capital city of Somalia", "Mogadishu", "Mogadishu is the capital of Somalia"),
    ("hard", "Djibouti", "Djibouti", "the capital city of Djibouti", "Djibouti (city)", "Djibouti is the capital of Djibouti"),
    ("medium", "Madagascar", "Antananarivo", "the capital city of Madagascar", "Antananarivo", "Antananarivo is the capital of Madagascar"),
    ("medium", "Mauritius", "Port Louis", "the capital city of Mauritius", "Port Louis", "Port Louis is the capital of Mauritius"),
    ("hard", "Seychelles", "Victoria", "the capital city of Seychelles", "Victoria, Seychelles", "Victoria is the capital of Seychelles"),
    ("hard", "Comoros", "Moroni", "the capital city of the Comoros", "Moroni, Comoros", "Moroni is the capital of the Comoros"),
    ("medium", "South Sudan", "Juba", "the capital city of South Sudan", "Juba", "Juba is the capital of South Sudan"),
    ("easy", "Tanzania", "Mount Kilimanjaro", "the highest mountain in Africa, in Tanzania", "Mount Kilimanjaro", "Mount Kilimanjaro is the highest mountain in Africa"),
    ("easy", "Tanzania", "Zanzibar", "the spice island of Tanzania", "Zanzibar", "Zanzibar is an island of Tanzania"),
    ("medium", "Tanzania", "Serengeti", "the famous wildlife plain in Tanzania", "Serengeti", "The Serengeti is a region in Tanzania"),
    ("medium", "Kenya", "Maasai Mara", "the famous wildlife reserve in Kenya", "Maasai Mara", "The Maasai Mara is a reserve in Kenya"),
]:
    R(s(item[0], "GEOGRAPHY", item[1], item[2], item[3], item[4], item[5]))

for item in [
    ("easy", "Ethiopia", "Injera", "the spongy fermented flatbread of Ethiopia and Eritrea", "Injera", "Injera is a sourdough flatbread from Ethiopia"),
    ("easy", "Ethiopia", "Doro wat", "a spicy chicken stew served on injera", "Doro wat", "Doro wat is a chicken stew from Ethiopia"),
    ("medium", "Kenya", "Nyama choma", "grilled meat, a beloved Kenyan celebration dish", "Nyama choma", "Nyama choma is grilled meat in Kenya"),
    ("easy", "East Africa", "Ugali", "the stiff maize porridge of Kenya and Tanzania", "Ugali", "Ugali is a maize porridge eaten in East Africa"),
    ("medium", "Uganda", "Matoke", "steamed green banana, a staple in Uganda", "Matoke", "Matoke is a banana dish from Uganda"),
    ("medium", "Kenya", "Sukuma wiki", "braised greens, a daily dish in Kenya", "Sukuma wiki", "Sukuma wiki is a vegetable dish in Kenya"),
    ("medium", "Tanzania", "Mandazi", "a lightly sweet fried dough from the Swahili coast", "Mandazi", "Mandazi is a fried bread from East Africa"),
    ("easy", "Kenya", "Chai", "milky spiced tea drunk throughout Kenya", "Kenya", "Tea is widely drunk in Kenya"),
    ("medium", "Ethiopia", "Kitfo", "minced beef seasoned with mitmita and kibbeh", "Kitfo", "Kitfo is a raw beef dish from Ethiopia"),
    ("hard", "Ethiopia", "Tibs", "sautéed meat, an Ethiopian restaurant favourite", "Tibs", "Tibs is a meat dish from Ethiopia"),
    ("medium", "Tanzania", "Pilau", "spiced rice associated with the Swahili coast", "Pilau", "Pilau is a spiced rice dish"),
    ("hard", "Uganda", "Rolex", "a Ugandan chapati rolled around an omelette", "Rolex (food)", "Rolex is a street food in Uganda"),
    ("medium", "Kenya", "Chapati", "a layered flatbread loved in Kenyan homes", "Chapati", "Chapati is eaten in Kenya"),
    ("hard", "Ethiopia", "Berbere", "the chilli spice blend at the heart of Ethiopian cooking", "Berbere", "Berbere is a spice mixture from Ethiopia"),
    ("medium", "Tanzania", "Mchuzi", "a Swahili word for stew or sauce", "Swahili cuisine", "Mchuzi means stew in Swahili cooking"),
    ("easy", "Ethiopia", "Coffee", "the drink Ethiopia gave the world, still roasted for guests", "Coffee", "Coffee originated in Ethiopia"),
    ("hard", "Madagascar", "Romazava", "a meat and greens stew considered a national dish of Madagascar", "Romazava", "Romazava is a dish from Madagascar"),
    ("medium", "Eritrea", "Zigni", "a spicy meat stew of Eritrean cooking", "Zigni", "Zigni is a stew from Eritrea"),
]:
    R(s(item[0], "FOOD", item[1], item[2], item[3], item[4], item[5]))

for item in [
    ("easy", "Tanzania", "Taarab", "the poetic coastal music of Zanzibar and the Swahili shore", "Taarab", "Taarab is a music genre from the Swahili coast"),
    ("easy", "Tanzania", "Bongo flava", "the popular music of Tanzania mixing hip hop and Swahili melody", "Bongo flava", "Bongo flava is a music genre from Tanzania"),
    ("medium", "Ethiopia", "Ethio-jazz", "the fusion of Ethiopian modes and jazz", "Ethio-jazz", "Ethio-jazz is a genre from Ethiopia"),
    ("medium", "Kenya", "Gengetone", "a youthful Kenyan dance sound of the late 2010s", "Gengetone", "Gengetone is a music genre from Kenya"),
    ("hard", "Tanzania", "Singeli", "a very fast electronic dance music from Dar es Salaam", "Singeli", "Singeli is a music genre from Tanzania"),
    ("medium", "Kenya", "Ohangla", "a Luo popular music driven by a traditional lyre", "Ohangla", "Ohangla is a music genre from Kenya"),
    ("easy", "Kenya", "Benga", "a guitar dance music of Kenya", "Benga music", "Benga is a genre of Kenyan popular music"),
    ("medium", "Uganda", "Kidandali", "a bright Ugandan dance-pop style", "Kidandali", "Kidandali is a music genre from Uganda"),
    ("hard", "Ethiopia", "Eskista", "the shoulder dance of the Ethiopian highlands", "Eskista", "Eskista is a dance from Ethiopia"),
    ("medium", "Rwanda", "Intore", "the warrior dance tradition performed in Rwanda", "Intore", "Intore is a dance from Rwanda"),
    ("medium", "Tanzania", "Ngoma", "a Swahili word for drum, dance, and celebration", "Ngoma", "Ngoma means drum and dance in East Africa"),
    ("hard", "Madagascar", "Salegy", "a driving dance rhythm of northern Madagascar", "Salegy", "Salegy is a music genre from Madagascar"),
    ("medium", "Kenya", "Chakacha", "a women's dance rhythm of the Kenyan coast", "Chakacha", "Chakacha is a dance from the Kenyan coast"),
    ("easy", "Ethiopia", "Krar", "a bowl lyre of Ethiopia and Eritrea", "Krar", "The krar is a lyre from Ethiopia"),
    ("medium", "Ethiopia", "Masenqo", "a one-string fiddle of the Ethiopian highlands", "Masenqo", "The masenqo is a fiddle from Ethiopia"),
    ("hard", "Uganda", "Adungu", "a harp of the Alur people of Uganda", "Adungu", "The adungu is a harp from Uganda"),
    ("medium", "Kenya", "Nyatiti", "the Luo lyre of Kenya", "Nyatiti", "The nyatiti is a lyre from Kenya"),
    ("easy", "Tanzania", "Taraab orchestra", "the small orchestra of oud, violin, and voice behind taarab", "Taarab", "Taarab orchestras perform on the Swahili coast"),
]:
    R(s(item[0], "MUSIC", item[1], item[2], item[3], item[4], item[5]))

for item in [
    ("easy", "East Africa", "Kanga", "the printed cotton wrap with a Swahili proverb on the border", "Kanga (garment)", "The kanga is a colourful garment from East Africa"),
    ("easy", "East Africa", "Kitenge", "a brighter printed wrap cloth worn across East Africa", "Kitenge", "Kitenge is a cotton fabric worn in East Africa"),
    ("medium", "Kenya", "Kikoi", "the striped cotton sarong of the Swahili coast", "Kikoi", "The kikoi is a cloth from East Africa"),
    ("easy", "Ethiopia", "Habesha kemis", "the white cotton dress of Ethiopian and Eritrean celebrations", "Habesha kemis", "The habesha kemis is a dress from Ethiopia"),
    ("medium", "Ethiopia", "Netela", "a light white shawl worn with Ethiopian dress", "Netela", "The netela is a shawl from Ethiopia"),
    ("medium", "Kenya", "Shuka", "the red-checked cloth associated with Maasai dress", "Maasai people", "Maasai people wear a cloth called a shuka"),
    ("medium", "East Africa", "Kofia", "the embroidered cap worn by men on the Swahili coast", "Kofia (hat)", "The kofia is a cap worn in East Africa"),
    ("hard", "Uganda", "Gomesi", "the long colourful dress worn by Baganda women", "Gomesi", "The gomesi is a dress from Uganda"),
    ("hard", "Uganda", "Kanzu", "the long white robe worn by Baganda men", "Kanzu", "The kanzu is a robe worn in Uganda"),
    ("medium", "Rwanda", "Umushanana", "the draped formal dress of Rwandan celebrations", "Umushanana", "The umushanana is a dress from Rwanda"),
    ("hard", "Ethiopia", "Tibeb", "the colourful woven border on Ethiopian cotton cloth", "Tibeb", "Tibeb is a woven border on Ethiopian cloth"),
    ("medium", "Kenya", "Bead collars", "the beadwork collars associated with Maasai dress", "Maasai people", "Maasai beadwork is worn in Kenya"),
    ("easy", "Tanzania", "Kanga proverb", "the written message along the edge of a kanga cloth", "Kanga (garment)", "Kanga cloth often includes a proverb"),
    ("hard", "Madagascar", "Lamba", "the wrap cloth of Madagascar", "Lamba (garment)", "The lamba is a garment from Madagascar"),
    ("medium", "Eritrea", "Zurias", "the white celebration dress shared with Ethiopian fashion", "Habesha kemis", "White dresses are worn for celebrations in Eritrea and Ethiopia"),
    ("medium", "Somalia", "Dirac", "a long dress worn by Somali women", "Dirac (garment)", "The dirac is a dress worn in Somalia"),
    ("hard", "Somalia", "Macawiis", "the sarong worn by Somali men", "Macawiis", "The macawiis is a garment worn by Somali men"),
    ("easy", "Kenya", "Lessos", "another name for the kanga wrap in Kenya", "Kanga (garment)", "Lessos is another name for the kanga in Kenya"),
]:
    R(s(item[0], "FASHION", item[1], item[2], item[3], item[4], item[5]))

for item in [
    ("easy", "East Africa", "Swahili", "the Bantu lingua franca of the East African coast and beyond", "Swahili language", "Swahili is a Bantu language of East Africa"),
    ("easy", "Ethiopia", "Amharic", "the official working language of Ethiopia", "Amharic", "Amharic is a language of Ethiopia"),
    ("medium", "Ethiopia", "Oromo", "the most widely spoken language of Ethiopia", "Oromo language", "Oromo is a language spoken in Ethiopia"),
    ("medium", "Eritrea", "Tigrinya", "a major language of Eritrea and northern Ethiopia", "Tigrinya language", "Tigrinya is a language of Eritrea"),
    ("easy", "Rwanda", "Kinyarwanda", "the national language of Rwanda", "Kinyarwanda", "Kinyarwanda is the national language of Rwanda"),
    ("medium", "Burundi", "Kirundi", "the national language of Burundi", "Kirundi", "Kirundi is the language of Burundi"),
    ("medium", "Uganda", "Luganda", "the widely spoken language of the Baganda in Uganda", "Luganda", "Luganda is a language of Uganda"),
    ("medium", "Somalia", "Somali", "the official language of Somalia", "Somali language", "Somali is the language of Somalia"),
    ("medium", "Madagascar", "Malagasy", "the national language of Madagascar", "Malagasy language", "Malagasy is the language of Madagascar"),
    ("hard", "Ethiopia", "Ge'ez", "the ancient liturgical language of Ethiopian and Eritrean churches", "Ge'ez", "Ge'ez is a liturgical language of Ethiopia"),
    ("easy", "Kenya", "English", "an official language of Kenya alongside Swahili", "Kenya", "English and Swahili are official languages of Kenya"),
    ("medium", "Uganda", "Runyankole", "a Bantu language of southwestern Uganda", "Nkore language", "Runyankole is a language of Uganda"),
    ("hard", "Kenya", "Kikuyu", "the largest ethnic language of central Kenya", "Kikuyu language", "Kikuyu is a language spoken in Kenya"),
    ("hard", "Kenya", "Luo", "a Nilotic language of the Lake Victoria region", "Luo language", "The Luo language is spoken in Kenya"),
    ("medium", "Tanzania", "Chaga", "a language cluster of the Kilimanjaro area", "Chaga languages", "Chaga languages are spoken in Tanzania"),
    ("hard", "South Sudan", "Dinka", "a major Nilotic language of South Sudan", "Dinka language", "Dinka is a language of South Sudan"),
    ("medium", "Djibouti", "Afar", "a language of Djibouti, Eritrea, and Ethiopia", "Afar language", "Afar is a language spoken in Djibouti"),
    ("easy", "Tanzania", "Swahili greeting", "the everyday coastal language people use to say jambo and asante", "Swahili language", "Jambo and asante are Swahili words"),
]:
    R(s(item[0], "LANGUAGE", item[1], item[2], item[3], item[4], item[5]))

for item in [
    ("easy", "Ethiopia", "Timkat", "the Ethiopian Epiphany festival with public processions", "Timkat", "Timkat is a festival in Ethiopia"),
    ("medium", "Ethiopia", "Irreecha", "the Oromo thanksgiving festival recognised by UNESCO", "Irreechaa", "Irreecha is a thanksgiving festival of the Oromo people"),
    ("medium", "Ethiopia", "Enkutatash", "the Ethiopian New Year", "Enkutatash", "Enkutatash is the Ethiopian New Year"),
    ("medium", "Ethiopia", "Meskel", "the festival of the finding of the True Cross, with a public bonfire", "Meskel", "Meskel is a festival in Ethiopia"),
    ("easy", "Kenya", "Mashujaa Day", "Kenya's public holiday honouring national heroes", "Public holidays in Kenya", "Mashujaa Day is a public holiday in Kenya"),
    ("medium", "Tanzania", "Zanzibar International Film Festival", "a film festival on Zanzibar", "Zanzibar International Film Festival", "The Zanzibar International Film Festival is held in Tanzania"),
    ("hard", "Uganda", "Martyrs' Day", "the 3 June public commemoration in Uganda", "Public holidays in Uganda", "Uganda Martyrs' Day is a public holiday"),
    ("medium", "Rwanda", "Umuganura", "the national harvest day of Rwanda", "Umuganura", "Umuganura is a harvest celebration in Rwanda"),
    ("easy", "Tanzania", "Saba Saba", "the 7 July trade fair day in Tanzania", "Saba Saba Day", "Saba Saba is a public day in Tanzania"),
    ("medium", "Kenya", "Lamu Cultural Festival", "a dhow and culture festival on Lamu Island", "Lamu", "Lamu hosts a cultural festival in Kenya"),
    ("hard", "Madagascar", "Alahamady Be", "the Malagasy New Year", "Madagascar", "The Malagasy New Year is celebrated in Madagascar"),
    ("medium", "Ethiopia", "Great Ethiopian Run", "a huge public road race in Addis Ababa", "Great Ethiopian Run", "The Great Ethiopian Run is held in Addis Ababa"),
    ("easy", "Kenya", "Jamhuri Day", "Kenya's independence day on 12 December", "Public holidays in Kenya", "Jamhuri Day is Kenya's independence holiday"),
    ("medium", "Uganda", "Independence Day", "Uganda's national day on 9 October", "Public holidays in Uganda", "Uganda Independence Day is on 9 October"),
    ("hard", "Mauritius", "Cavadee", "a Tamil procession festival celebrated in Mauritius", "Thaipusam", "Cavadee is celebrated by Tamils in Mauritius"),
    ("medium", "Seychelles", "Creole Festival", "a festival celebrating Seychellois Creole culture", "Seychelles", "Seychelles holds a Creole festival"),
    ("easy", "Tanzania", "Union Day", "the 26 April holiday marking the union of Tanganyika and Zanzibar", "Public holidays in Tanzania", "Union Day is a public holiday in Tanzania"),
    ("hard", "Ethiopia", "Fichee-Chambalaalla", "the Sidama New Year festival inscribed by UNESCO", "Fichee-Chambalaalla", "Fichee-Chambalaalla is a New Year festival in Ethiopia"),
]:
    R(s(item[0], "FESTIVALS", item[1], item[2], item[3], item[4], item[5]))

for item in [
    ("medium", "Ethiopia", "Habesha kemis", "the white gown worn by Ethiopian and Eritrean women", "Habesha kemis", "The habesha kemis is a dress worn in Ethiopia"),
    ("medium", "Kenya", "Ruracio", "the Kikuyu family introduction before a wedding", "Kikuyu people", "Ruracio is part of Kikuyu marriage negotiations"),
    ("medium", "Uganda", "Kwanjula", "the Buganda introduction ceremony before marriage", "Kwanjula", "Kwanjula is an introduction ceremony in Buganda"),
    ("easy", "Tanzania", "Harusi", "the Swahili word for a wedding", "Swahili language", "Harusi means wedding in Swahili"),
    ("hard", "Rwanda", "Gusaba", "the formal family visit that opens many Rwandan marriages", "Culture of Rwanda", "Gusaba is a marriage introduction in Rwanda"),
    ("medium", "Uganda", "Gomesi", "the formal dress worn at Baganda ceremonies", "Gomesi", "The gomesi is worn at ceremonies in Uganda"),
    ("easy", "Tanzania", "Ululation", "a high celebratory call heard at weddings", "Ululation", "Ululation is a celebratory sound at weddings"),
    ("medium", "Tanzania", "Henna night", "painting the bride's hands before a coastal Muslim wedding", "Henna", "Henna is applied before weddings on the Swahili coast"),
]:
    R(s(item[0], "WEDDINGS", item[1], item[2], item[3], item[4], item[5]))

for item in [
    ("easy", "Ethiopia", "Kingdom of Aksum", "the ancient trading kingdom of the northern Ethiopian highlands", "Kingdom of Aksum", "The Kingdom of Aksum was centred in Ethiopia"),
    ("medium", "Ethiopia", "Lalibela", "the town of rock-hewn churches in Ethiopia", "Lalibela", "Lalibela is famous for rock-hewn churches in Ethiopia"),
    ("medium", "Uganda", "Buganda", "the historic kingdom on the north shore of Lake Victoria", "Buganda", "Buganda is a kingdom in Uganda"),
    ("easy", "Tanzania", "Zanzibar Sultanate", "the island state that joined Tanganyika to form Tanzania", "Sultanate of Zanzibar", "The Sultanate of Zanzibar was an island state"),
    ("medium", "Kenya", "1963", "the year Kenya became independent", "Kenya", "Kenya became independent in 1963"),
    ("medium", "Tanzania", "1961", "the year Tanganyika became independent", "Tanzania", "Tanganyika became independent in 1961"),
    ("medium", "Uganda", "1962", "the year Uganda became independent", "Uganda", "Uganda became independent in 1962"),
    ("hard", "Rwanda", "Kingdom of Rwanda", "the historic kingdom that preceded the modern republic", "Kingdom of Rwanda", "The Kingdom of Rwanda was a pre-colonial state"),
    ("medium", "Ethiopia", "Lucy", "the famous Australopithecus fossil found in Ethiopia", "Lucy (Australopithecus)", "Lucy is a fossil discovered in Ethiopia"),
    ("hard", "Eritrea", "Adulis", "the ancient Red Sea port of the Aksumite world", "Adulis", "Adulis was an ancient port in Eritrea"),
    ("medium", "Kenya", "Fort Jesus", "the historic coral fort in Mombasa", "Fort Jesus", "Fort Jesus is a fort in Mombasa, Kenya"),
    ("hard", "Tanzania", "Kilwa", "the medieval Swahili stone town on the Tanzanian coast", "Kilwa Kisiwani", "Kilwa Kisiwani was a Swahili city-state in Tanzania"),
    ("medium", "Ethiopia", "Fasil Ghebbi", "the royal enclosure of Gondar", "Fasil Ghebbi", "Fasil Ghebbi is the royal enclosure in Gondar, Ethiopia"),
    ("medium", "Ethiopia", "Harar", "the walled Islamic city in eastern Ethiopia", "Harar", "Harar is a walled city in Ethiopia"),
    ("hard", "Kenya", "Gedi", "the ruined Swahili stone town on the Kenyan coast", "Gedi ruins", "The Gedi ruins are a historic town in Kenya"),
    ("medium", "Uganda", "Kasubi Tombs", "the royal burial site of Buganda kings", "Kasubi Tombs", "The Kasubi Tombs are a royal site in Uganda"),
    ("easy", "Tanzania", "Olduvai", "the gorge in Tanzania famous for early human fossils", "Olduvai Gorge", "Olduvai Gorge is in Tanzania"),
    ("hard", "Madagascar", "Royal Hill of Ambohimanga", "a royal hill and UNESCO site in Madagascar", "Royal Hill of Ambohimanga", "Ambohimanga is a royal hill in Madagascar"),
]:
    R(s(item[0], "HISTORY", item[1], item[2], item[3], item[4], item[5]))

for item in [
    ("easy", "Kenya", "Wangari Maathai", "the Kenyan Nobel Peace Prize laureate who founded the Green Belt Movement", "Wangari Maathai", "Wangari Maathai was a Kenyan environmentalist"),
    ("easy", "Tanzania", "Julius Nyerere", "the first president of Tanzania", "Julius Nyerere", "Julius Nyerere was the first president of Tanzania"),
    ("easy", "Kenya", "Jomo Kenyatta", "Kenya's first president", "Jomo Kenyatta", "Jomo Kenyatta was the first president of Kenya"),
    ("medium", "Kenya", "Ngugi wa Thiong'o", "the Kenyan novelist of A Grain of Wheat", "Ngũgĩ wa Thiong'o", "Ngũgĩ wa Thiong'o is a Kenyan writer"),
    ("medium", "Ethiopia", "Haile Selassie", "the Ethiopian emperor who modernised Addis Ababa", "Haile Selassie", "Haile Selassie was emperor of Ethiopia"),
    ("easy", "Ethiopia", "Abebe Bikila", "the Ethiopian runner who won the 1960 Olympic marathon", "Abebe Bikila", "Abebe Bikila was an Ethiopian marathon runner"),
    ("medium", "Tanzania", "Abdulrazak Gurnah", "the Tanzanian-born novelist who won the Nobel Prize in Literature", "Abdulrazak Gurnah", "Abdulrazak Gurnah is a Tanzanian-born novelist"),
    ("hard", "Kenya", "Binyavanga Wainaina", "the Kenyan writer who founded Kwani?", "Binyavanga Wainaina", "Binyavanga Wainaina was a Kenyan writer"),
    ("medium", "Uganda", "Okot p'Bitek", "the Ugandan poet of Song of Lawino", "Okot p'Bitek", "Okot p'Bitek was a Ugandan poet"),
    ("medium", "Somalia", "Nuruddin Farah", "the Somali novelist of Maps and Links", "Nuruddin Farah", "Nuruddin Farah is a Somali novelist"),
    ("hard", "Ethiopia", "Tsegaye Gebre-Medhin", "a leading Ethiopian playwright and poet", "Tsegaye Gebre-Medhin", "Tsegaye Gebre-Medhin was an Ethiopian poet"),
    ("medium", "Rwanda", "Scholastique Mukasonga", "the Rwandan novelist of Our Lady of the Nile", "Scholastique Mukasonga", "Scholastique Mukasonga is a Rwandan writer"),
    ("easy", "Kenya", "Lupita Nyong'o", "the Kenyan-Mexican Oscar-winning actor", "Lupita Nyong'o", "Lupita Nyong'o is a Kenyan-Mexican actress"),
    ("medium", "Ethiopia", "Meseret Defar", "an Ethiopian Olympic champion distance runner", "Meseret Defar", "Meseret Defar is an Ethiopian runner"),
    ("hard", "Uganda", "Mahmood Mamdani", "the Ugandan scholar of politics and colonialism", "Mahmood Mamdani", "Mahmood Mamdani is a Ugandan academic"),
    ("medium", "Tanzania", "Freddie Mercury origins", "the Queen singer who was born Farrokh Bulsara in Zanzibar", "Freddie Mercury", "Freddie Mercury was born in Zanzibar"),
    ("easy", "Kenya", "Eliud Kipchoge", "the Kenyan marathon runner who first broke two hours in a controlled race", "Eliud Kipchoge", "Eliud Kipchoge is a Kenyan marathon runner"),
    ("medium", "Ethiopia", "Haile Gebrselassie", "the Ethiopian distance legend of the 1990s and 2000s", "Haile Gebrselassie", "Haile Gebrselassie is an Ethiopian long-distance runner"),
]:
    R(s(item[0], "PEOPLE", item[1], item[2], item[3], item[4], item[5]))

for item in [
    ("easy", "Tanzania", "Diamond Platnumz", "the Tanzanian bongo flava superstar", "Diamond Platnumz", "Diamond Platnumz is a Tanzanian singer"),
    ("easy", "Kenya", "Sauti Sol", "the Kenyan band behind Sura Yako and Suzanna", "Sauti Sol", "Sauti Sol is a Kenyan band"),
    ("medium", "Uganda", "Eddy Kenzo", "the Ugandan singer of Sitya Loss", "Eddy Kenzo", "Eddy Kenzo is a Ugandan singer"),
    ("medium", "Ethiopia", "Mulatu Astatke", "the father of Ethio-jazz", "Mulatu Astatke", "Mulatu Astatke is an Ethiopian musician"),
    ("medium", "Ethiopia", "Teddy Afro", "the popular Ethiopian singer Tewodros Kassahun", "Teddy Afro", "Teddy Afro is an Ethiopian singer"),
    ("medium", "Tanzania", "Zuchu", "a leading Tanzanian bongo flava singer", "Zuchu", "Zuchu is a Tanzanian singer"),
    ("hard", "Tanzania", "Alikiba", "a Tanzanian bongo flava singer and actor", "Alikiba", "Alikiba is a Tanzanian musician"),
    ("medium", "Kenya", "Nyashinski", "the Kenyan rapper formerly of Kleptomaniax", "Nyashinski", "Nyashinski is a Kenyan rapper"),
    ("medium", "Uganda", "Sheebah", "the Ugandan singer Sheebah Karungi", "Sheebah Karungi", "Sheebah Karungi is a Ugandan singer"),
    ("hard", "Kenya", "Bien", "a member of Sauti Sol who also records solo", "Bien-Aimé Baraza", "Bien is a Kenyan musician from Sauti Sol"),
    ("medium", "Ethiopia", "Rophnan", "an Ethiopian electronic artist blending traditional sounds", "Ethio-jazz", "Ethiopian popular music draws on traditional modes"),
    ("easy", "Kenya", "H_art the Band", "a Kenyan group known for acoustic pop", "Kenya", "Kenyan popular music includes bands from Nairobi"),
    ("medium", "Tanzania", "Nandy", "the Tanzanian singer Faustina Charles", "Nandy (singer)", "Nandy is a Tanzanian singer"),
    ("hard", "Rwanda", "The Ben", "a Rwandan Afrobeats and pop singer", "Rwanda", "Rwandan pop is part of East African music"),
    ("medium", "Uganda", "Jose Chameleone", "a veteran Ugandan singer of kadongo kamu and pop", "Jose Chameleone", "Jose Chameleone is a Ugandan musician"),
    ("easy", "Kenya", "Bensoul", "the Kenyan singer of Nairobi", "Bensoul", "Bensoul is a Kenyan singer"),
    ("medium", "Ethiopia", "Betty G", "an Ethiopian singer of the new pop generation", "Music of Ethiopia", "Ethiopian pop is a major East African scene"),
    ("hard", "Madagascar", "Niu Raza", "a Malagasy popular musician", "Music of Madagascar", "Madagascar has a distinct popular music"),
]:
    R(s(item[0], "POP", item[1], item[2], item[3], item[4], item[5]))

for item in [
    ("easy", "Kenya", "Eliud Kipchoge", "the marathon world record holder from Kenya", "Eliud Kipchoge", "Eliud Kipchoge is a Kenyan marathon runner"),
    ("easy", "Ethiopia", "Haile Gebrselassie", "the Ethiopian who dominated distance running", "Haile Gebrselassie", "Haile Gebrselassie is an Ethiopian runner"),
    ("easy", "Ethiopia", "Kenenisa Bekele", "the Ethiopian track and marathon champion", "Kenenisa Bekele", "Kenenisa Bekele is an Ethiopian long-distance runner"),
    ("medium", "Kenya", "Faith Kipyegon", "the Kenyan Olympic champion at 1500 metres", "Faith Kipyegon", "Faith Kipyegon is a Kenyan middle-distance runner"),
    ("medium", "Ethiopia", "Tirunesh Dibaba", "the Ethiopian Olympic champion known as the baby-faced destroyer", "Tirunesh Dibaba", "Tirunesh Dibaba is an Ethiopian runner"),
    ("medium", "Kenya", "David Rudisha", "the Kenyan who set the 800 metre world record", "David Rudisha", "David Rudisha is a Kenyan 800 metre runner"),
    ("hard", "Uganda", "Stephen Kiprotich", "the Ugandan who won the 2012 Olympic marathon", "Stephen Kiprotich", "Stephen Kiprotich is a Ugandan marathon runner"),
    ("medium", "Kenya", "Catherine Ndereba", "the Kenyan marathon champion nicknamed Catherine the Great", "Catherine Ndereba", "Catherine Ndereba is a Kenyan marathon runner"),
    ("hard", "Kenya", "Paul Tergat", "the Kenyan marathon world record holder before the next generation", "Paul Tergat", "Paul Tergat is a Kenyan former runner"),
    ("easy", "Ethiopia", "Abebe Bikila", "the barefoot Olympic marathon champion of 1960", "Abebe Bikila", "Abebe Bikila won the Olympic marathon"),
    ("medium", "Kenya", "Harambee Stars", "the nickname of Kenya's men's football team", "Kenya national football team", "The Kenya national football team is nicknamed the Harambee Stars"),
    ("medium", "Uganda", "Cranes", "the nickname of Uganda's men's football team", "Uganda national football team", "The Uganda national football team is nicknamed the Cranes"),
    ("hard", "Ethiopia", "Walias", "a historic nickname of Ethiopian club and national sides", "Ethiopia national football team", "Ethiopia has a national football team"),
    ("medium", "Kenya", "Victor Wanyama", "the Kenyan midfielder who played in the Premier League", "Victor Wanyama", "Victor Wanyama is a Kenyan footballer"),
    ("hard", "Tanzania", "Mbwana Samatta", "the Tanzanian striker who captained the national team", "Mbwana Samatta", "Mbwana Samatta is a Tanzanian footballer"),
    ("medium", "Kenya", "Brigid Kosgei", "the Kenyan who set a women's marathon world record", "Brigid Kosgei", "Brigid Kosgei is a Kenyan marathon runner"),
    ("easy", "Kenya", "Athletics", "the sport for which Kenya is most famous worldwide", "Sport in Kenya", "Kenya is famous for long-distance running"),
    ("medium", "Ethiopia", "Derartu Tulu", "the first Ethiopian woman to win Olympic gold", "Derartu Tulu", "Derartu Tulu is an Ethiopian runner"),
]:
    R(s(item[0], "SPORT", item[1], item[2], item[3], item[4], item[5]))

R(c("easy", "LANGUAGE", "Tanzania", "Complete the Swahili thank-you: Asante means ___.", ["thank you", "goodbye", "come in", "sit down"], [0], "Swahili language", "Asante means thank you in Swahili", "Asante means thank you."))
R(c("easy", "LANGUAGE", "Tanzania", "Complete the Swahili greeting: Jambo means ___.", ["hello", "market", "river", "dance"], [0], "Swahili language", "Jambo means hello in Swahili", "Jambo is a Swahili hello."))
R(c("medium", "PROVERBS", "Tanzania", "Complete the Swahili proverb: Haraka haraka haina ___.", ["baraka", "chakula", "rafiki", "nyumba"], [0], "Swahili language", "Haraka haraka haina baraka is a Swahili proverb", "Haraka haraka haina baraka means hurry has no blessing."))
R(c("medium", "PROVERBS", "East Africa", "Complete the Swahili saying: Pole pole ndiyo ___.", ["mwendo", "chakula", "bahari", "ngoma"], [0], "Swahili language", "Pole pole ndiyo mwendo is a Swahili saying", "Pole pole ndiyo mwendo means slowly is the way."))
R(c("easy", "LANGUAGE", "Ethiopia", "Complete the Amharic thank-you: Ameseginalehu means ___.", ["thank you", "good night", "where", "water"], [0], "Amharic", "Ameseginalehu means thank you in Amharic", "Ameseginalehu is thank you in Amharic."))
R(m("easy", "GEOGRAPHY", "East Africa", "Select three countries that border Lake Victoria.", ["Kenya", "Uganda", "Tanzania", "Lesotho"], [0, 1, 2], "Lake Victoria", "Lake Victoria is bordered by Kenya, Uganda and Tanzania", "Kenya, Uganda and Tanzania share Lake Victoria. Lesotho is in Southern Africa."))
R(m("medium", "LANGUAGE", "East Africa", "Select three widely spoken East African languages.", ["Swahili", "Amharic", "Oromo", "isiXhosa"], [0, 1, 2], "Swahili language", "Swahili, Amharic and Oromo are East African languages", "Swahili, Amharic and Oromo are major East African languages. isiXhosa is Southern African."))
R(m("easy", "FOOD", "Ethiopia", "Select three foods of an Ethiopian platter.", ["Injera", "Doro wat", "Kitfo", "Bunny chow"], [0, 1, 2], "Injera", "Injera, doro wat and kitfo are Ethiopian foods", "Injera, doro wat and kitfo belong to Ethiopian cooking. Bunny chow is South African."))
R(m("medium", "HISTORY", "East Africa", "Select three historic East African places.", ["Aksum", "Kilwa", "Lalibela", "Timbuktu"], [0, 1, 2], "Kingdom of Aksum", "Aksum, Kilwa and Lalibela are historic East African places", "Aksum and Lalibela are Ethiopian, and Kilwa is a Swahili town in Tanzania. Timbuktu is in Mali."))
