"""Extra multi-answer and sentence-completion items with claims meant to match live pages."""

def multi(region, diff, cat, country, prompt, options, correct, wiki, claim, explanation):
    return dict(region=region, difficulty=diff, kind="multi", category=cat, country=country, answer=options[0], definition="", wiki=wiki, claim=claim, options=options, correct=correct, prompt=prompt, explanation=explanation)

def complete(region, diff, cat, country, prompt, options, correct, wiki, claim, explanation):
    return dict(region=region, difficulty=diff, kind="complete", category=cat, country=country, answer=options[correct[0]], definition="", wiki=wiki, claim=claim, options=options, correct=correct, prompt=prompt, explanation=explanation)

FORMS = {
"west": [
complete("west","easy","PROVERBS","Ghana","The Akan idea of Sankofa means go back and what?",["get","sell","hide","burn"],[0],"Sankofa","Sankofa is an Akan word meaning go back and get","Sankofa is an Akan word. Literally, it means go back and get."),
multi("west","easy","FOOD","West Africa","Which three would you expect on a West African table?",["Jollof rice","Egusi soup","Fufu","Bunny chow"],[0,1,2],"West African cuisine","Jollof, egusi and fufu are West African foods","Jollof, egusi soup and fufu are West African foods. Bunny chow is South African."),
multi("west","medium","GEOGRAPHY","West Africa","Which three are capital cities in West Africa?",["Accra","Dakar","Bamako","Cairo"],[0,1,2],"West Africa","Accra, Dakar and Bamako are West African capitals","Accra, Dakar and Bamako are capitals in West Africa. Cairo is in Egypt."),
],
"east": [
multi("east","easy","GEOGRAPHY","East Africa","Which three are capital cities in East Africa?",["Nairobi","Kampala","Kigali","Rabat"],[0,1,2],"East Africa","Nairobi, Kampala and Kigali are East African capitals","Nairobi, Kampala and Kigali are capitals in East Africa. Rabat is in Morocco."),
multi("east","medium","FOOD","Ethiopia","Which three foods belong on an Ethiopian table?",["Injera","Coffee","Doro wat","Biltong"],[0,1,2],"Ethiopian cuisine","Injera, coffee and doro wat are Ethiopian","Injera, coffee and doro wat belong to Ethiopian food culture. Biltong is South African."),
],
"central": [
multi("central","easy","GEOGRAPHY","Central Africa","Which three are capital cities in Central Africa?",["Kinshasa","Libreville","Yaoundé","Tunis"],[0,1,2],"Central Africa","Kinshasa, Libreville and Yaoundé are Central African capitals","Kinshasa, Libreville and Yaoundé are capitals in Central Africa. Tunis is in Tunisia."),
multi("central","medium","MUSIC","DR Congo","Which three dance styles come from the Congos and Cameroon?",["Congolese rumba","Soukous","Makossa","Raï"],[0,1,2],"Congolese rumba","Rumba, soukous and makossa are Central African styles","Rumba and soukous are Congolese, and makossa is Cameroonian. Raï is Algerian."),
multi("central","easy","LANGUAGE","DR Congo","Which three languages are used in the Democratic Republic of the Congo?",["Lingala","French","Tshiluba","Afrikaans"],[0,1,2],"Democratic Republic of the Congo","Lingala, French and Tshiluba are used in the Democratic Republic of the Congo","Lingala, French and Tshiluba are used in the DRC. Afrikaans is Southern African."),
],
"north": [
multi("north","easy","GEOGRAPHY","North Africa","Which three are capital cities in North Africa?",["Cairo","Rabat","Tunis","Nairobi"],[0,1,2],"North Africa","Cairo, Rabat and Tunis are North African capitals","Cairo, Rabat and Tunis are capitals in North Africa. Nairobi is in Kenya."),
multi("north","medium","FOOD","Morocco","Which three foods would you meet in Morocco?",["Couscous","Tagine","Mint tea","Sadza"],[0,1,2],"Moroccan cuisine","Couscous, tagine and mint tea are Moroccan","Couscous, tagine and mint tea are served in Morocco. Sadza is Zimbabwean."),
multi("north","easy","HISTORY","Egypt","Which three names belong to ancient Egypt?",["Cleopatra","Nefertiti","Pyramids of Giza","Mansa Musa"],[0,1,2],"Ancient Egypt","Cleopatra, Nefertiti and the pyramids belong to ancient Egypt","Cleopatra, Nefertiti and the Giza pyramids are ancient Egyptian names. Mansa Musa ruled Mali."),
],
"south": [
multi("south","easy","LANGUAGE","South Africa","Which three are official languages of South Africa?",["isiZulu","isiXhosa","Afrikaans","Japanese"],[0,1,2],"Languages of South Africa","isiZulu, isiXhosa and Afrikaans are languages of South Africa","isiZulu, isiXhosa and Afrikaans are among South Africa's official languages."),
multi("south","medium","GEOGRAPHY","Southern Africa","Which three are capital cities in Southern Africa?",["Gaborone","Windhoek","Maputo","Algiers"],[0,1,2],"Southern Africa","Gaborone, Windhoek and Maputo are Southern African capitals","Gaborone, Windhoek and Maputo are capitals in Southern Africa. Algiers is in Algeria."),
multi("south","easy","FOOD","South Africa","Which three foods are associated with South Africa?",["Biltong","Bobotie","Braai","Injera"],[0,1,2],"South African cuisine","Biltong, bobotie and braai are South African","Biltong, bobotie and the braai are South African. Injera is Ethiopian."),
complete("south","easy","PROVERBS","South Africa","Complete the Setswana line: kgosi ke kgosi ka ___?",["batho","gauta","pula","dijo"],[0],"Tswana language","A Setswana proverb says kgosi ke kgosi ka batho","Kgosi ke kgosi ka batho means a chief is a chief through the people."),
],
}
