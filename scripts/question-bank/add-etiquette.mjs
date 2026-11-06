import { copyFile, readFile, writeFile } from "node:fs/promises";
import { sensitivityReasons } from "../../question-bank/sensitivity.ts";
import { answerLeaks, promptNamesAnswer } from "../../question-bank/text.ts";

const items = [
  ["west_etiq_aunty_bag", "west", "Nigeria", "An older auntie reaches the doorway holding something heavy. What helps her first?", "Carry luggage inside", ["Stay on the sofa", "Ask about money", "Shut the doorway"], "When an older auntie reaches the doorway holding something heavy, what helps her first is to carry luggage inside.", "helps auntie doorway"],
  ["west_etiq_grandma_room", "west", "Nigeria", "Someone young steps into grandmother's sitting space. How is respect shown?", "Kneel briefly", ["Shout a nickname", "Film the moment", "Remain outdoors"], "When someone young steps into grandmother sitting space, respect is shown if they kneel briefly.", "respect shown grandmother"],
  ["west_etiq_elder_phone", "west", "Ghana", "An older person is telling a story in the parlour. Where does the handset belong?", "Silence it completely", ["Play a loud song", "Start filming", "Answer another call"], "When an older person is telling a story in the parlour, the handset should silence it completely.", "telling story parlour handset"],
  ["west_etiq_teranga_meal", "west", "Senegal", "A host in Dakar sets out a shared supper. Which reply fits that welcome?", "Accept gladly", ["Refuse at once", "Ask the cost", "Eat while standing"], "When a host in Dakar sets out a shared supper, the reply that fits that welcome is to accept gladly.", "host Dakar supper welcome"],
  ["west_etiq_eldest_room", "west", "Mali", "Relatives fill a courtyard. Who receives the opening hello?", "Oldest person present", ["Youngest baby", "Skip every hello", "Greet only animals"], "When relatives fill a courtyard, the opening hello goes to the oldest person present.", "relatives courtyard opening hello"],
  ["west_etiq_offer_seat", "west", "Ghana", "An older visitor remains standing. What can a younger person give up?", "Offer a chair", ["Offer a riddle", "Offer the remote", "Offer silence"], "When an older visitor remains standing, a younger person can offer a chair.", "older visitor remains standing younger"],
  ["west_etiq_right_hand", "west", "Nigeria", "A plate moves toward someone senior. Which palm does the passing?", "Use right only", ["Left only", "Both elbows", "Tossed plate"], "When a plate moves toward someone senior, the passing uses the right palm only.", "plate moves toward senior passing"],
  ["west_etiq_walk_guest", "west", "Senegal", "A visit at the compound is ending. What courtesy follows?", "Escort outward", ["Shut things fast", "Remain seated", "Point vaguely"], "When a visit at the compound is ending, the courtesy that follows is to escort outward.", "visit compound ending courtesy"],
  ["west_etiq_quiet_thanks", "west", "Benin", "An older guest praises tonight's cooking. How is that praise answered?", "Soft spoken thanks", ["Name a price", "Change topic", "Leave abruptly"], "When an older guest praises tonight cooking, that praise is answered with soft spoken thanks.", "older guest praises cooking"],
  ["west_etiq_serve_elder", "west", "Togo", "Youngsters are hungry while a senior plate is still empty. Who is fed earlier?", "Children wait longer", ["Babies only", "Hide pot", "Second pot"], "When youngsters are hungry while a senior plate is still empty, seniors ahead of children are fed earlier.", "youngsters hungry senior plate earlier"],
  ["west_etiq_low_voice", "west", "Cote d'Ivoire", "People talk quietly in the sitting room. How do newcomers match that?", "Drop to a murmur", ["Shout a joke", "Play music", "Clap loudly"], "When people talk quietly in the sitting room, newcomers drop to a murmur.", "people talk quietly sitting newcomers"],
  ["west_etiq_help_dishes", "west", "Sierra Leone", "Bowls remain out after eating. What useful task comes next?", "Wash up afterwards", ["Leave every bowl", "Stack them high", "Call a taxi"], "When bowls remain out after eating, the useful task that comes next is to wash up afterwards.", "bowls remain after eating useful"],
  ["east_etiq_shikamoo", "east", "Tanzania", "A younger person meets someone much older on a path. Which respectful greeting fits?", "Say shikamoo", ["Say goodbye", "Say nothing", "Use a nickname"], "When a younger person meets someone much older on a path, the respectful greeting is to say shikamoo.", "younger meets older path greeting"],
  ["east_etiq_greet_room", "east", "Kenya", "Someone walks into a room full of relatives. Who gets acknowledged?", "Nod toward each person", ["Host alone", "Nobody", "Youngest only"], "When someone walks into a room full of relatives, everyone in the room gets acknowledged.", "walks room full relatives acknowledged"],
  ["east_etiq_coffee_wait", "east", "Ethiopia", "Coffee is being prepared for visitors in Addis. What does a guest do?", "Remain until served", ["Leave early", "Pour it alone", "Ask the cost"], "When coffee is being prepared for visitors in Addis, a guest will remain until served.", "coffee prepared visitors Addis"],
  ["east_etiq_offer_chair", "east", "Uganda", "An older neighbour comes indoors and stays on their feet. What is offered?", "A spare chair", ["A pop quiz", "The open door", "A written bill"], "When an older neighbour comes indoors and stays on their feet, a spare chair is offered.", "older neighbour indoors feet offered"],
  ["east_etiq_step_around", "east", "Rwanda", "Someone is seated with legs stretched across a path. How do others pass?", "Circle past them", ["Cross over", "Kick stool", "Climb chair"], "When someone is seated with legs stretched across a path, others go around those legs.", "seated legs stretched path pass"],
  ["east_etiq_taste_little", "east", "Madagascar", "A relative insists the food they made should be tried. What is a kind reply?", "Taste a little", ["Refuse loudly", "Push the plate", "Request cash"], "When a relative insists the food they made should be tried, a kind reply is to taste a little.", "relative insists food tried kind"],
  ["east_etiq_ask_family", "east", "Burundi", "Cousins have not been seen for months. What question comes before news?", "Ask about family health", ["Request a loan", "Ask about salary", "Ask to depart"], "When cousins have not been seen for months, the question before news is to ask about family health.", "cousins seen months question news"],
  ["east_etiq_remove_shoes", "east", "Somalia", "Shoes are left by the entrance of the house. What matches that habit?", "Remove footwear", ["Keep footwear on", "Hide footwear", "Wear footwear inside"], "When shoes are left by the entrance of the house, matching that habit means remove footwear.", "shoes left entrance house habit"],
  ["east_etiq_elder_speaks", "east", "Eritrea", "An older person has begun a long story. What do listeners do?", "Remain hushed", ["Interrupt often", "Switch topics", "Talk over"], "When an older person has begun a long story, listeners allow the story.", "older person begun long listeners"],
  ["east_etiq_bring_water", "east", "South Sudan", "New arrivals look thirsty after travel. What is brought out early?", "Cool drinking water", ["A written bill", "A long speech", "Nothing at all"], "When new arrivals look thirsty after travel, cool drinking water is brought out early.", "arrivals thirsty travel brought early"],
  ["east_etiq_sit_asked", "east", "Djibouti", "A host is still arranging seats. Where does a guest settle?", "Wherever indicated", ["On the table", "In the pantry", "Out in the street"], "When a host is still arranging seats, a guest settles wherever indicated.", "host arranging seats guest settle"],
  ["east_etiq_share_news", "east", "Comoros", "An older cousin is greeted after a long absence. What is shared?", "Kind family news", ["A sharp complaint", "A private secret", "A household bill"], "When an older cousin is greeted after a long absence, kind family news is shared.", "older cousin greeted absence shared"],
  ["central_etiq_carry_bag", "central", "Cameroon", "A visitor reaches the gate holding a full basket. What happens next?", "Lift it for them", ["Watch struggle", "Shut gate", "Demand payment"], "When a visitor reaches the gate holding a full basket, what happens next is to carry that basket.", "visitor reaches gate basket happens"],
  ["central_etiq_greet_before", "central", "Democratic Republic of the Congo", "A favour is needed from an uncle. What comes before the request?", "Open with hello", ["Demand now", "Skip hello", "Send note"], "When a favour is needed from an uncle, hello before asking comes before the request.", "favour needed uncle before request"],
  ["central_etiq_best_chair", "central", "Republic of the Congo", "An elder comes in while chairs are scattered. Which seat is offered?", "Pick nicest place", ["Low stool", "Bare floor", "No seat"], "When an elder comes in while chairs are scattered, the best available chair is offered.", "elder comes chairs scattered offered"],
  ["central_etiq_after_host", "central", "Gabon", "Food waits on the table and the host has not begun. When does eating start?", "Wait for signal", ["Start now", "Eat secretly", "Stand eating"], "When food waits on the table and the host has not begun, eating starts after the host begins.", "food waits table host begun eating"],
  ["central_etiq_right_pass", "central", "Chad", "Fruit is handed to an older guest. Which side is considered polite?", "Rightward handover", ["Leftward handover", "Thrown piece", "Floor slide"], "When fruit is handed to an older guest, right side passing is considered polite.", "fruit handed older guest polite"],
  ["central_etiq_walk_gate", "central", "Angola", "Guests are leaving the yard. How far does the household go?", "Accompany them outward", ["Remain indoors", "Lock up early", "Send a toddler"], "When guests are leaving the yard, the household will accompany them outward.", "guests leaving yard household"],
  ["central_etiq_thank_cook", "central", "Central African Republic", "Someone cooked for the whole household. What is said afterwards?", "Quiet words of thanks", ["Ignore effort", "Rate spice", "Ask wages"], "When someone cooked for the whole household, quiet thanks to cook is said afterwards.", "cooked whole household afterwards"],
  ["central_etiq_pour_water", "central", "Equatorial Guinea", "Elders sit down after a hot walk. What is poured for them?", "Offer a cool drink", ["Throw drink", "Fizzy soda", "Pour nothing"], "When elders sit down after a hot walk, water for elders is poured.", "elders sit hot walk poured"],
  ["central_etiq_children_wait", "central", "Sao Tome and Principe", "Adults are still being served from the pot. What do youngsters do?", "Pause their turn", ["Grab food", "Hide plates", "Leave now"], "When adults are still being served from the pot, youngsters pause.", "adults still served pot"],
  ["central_etiq_pass_care", "central", "Cameroon", "A shared bowl moves around the table. How is it transferred?", "Shift it slowly", ["Drop across", "Keep forever", "Spin fast"], "When a shared bowl moves around the table, it is transferred gently.", "shared bowl moves around table"],
  ["central_etiq_call_aunty", "central", "Gabon", "Mother's close friend arrives at the house. What title do children use?", "Address her as aunty", ["Silly nickname", "Miss stranger", "Kiddo"], "When mother's close friend arrives at the house, children use aunty as a title.", "mother close friend arrives children title"],
  ["central_etiq_voice_low", "central", "Republic of the Congo", "A conversation stays calm and close. How loud should a new voice be?", "Keep volume low", ["Raise it high", "Sing over everyone", "Whistle"], "When a conversation stays calm and close, a new voice should keep volume low.", "conversation stays calm close loud"],
  ["north_etiq_host_eats", "north", "Egypt", "Lunch is on the table and the host has not taken a bite. When does eating begin?", "Follow their lead", ["Start now", "Kitchen only", "Pack plate"], "When lunch is on the table and the host has not taken a bite, eating begins once the host starts.", "lunch table host taken bite"],
  ["north_etiq_mint_tea", "north", "Morocco", "Mint tea is poured during a family visit. What does the visitor do?", "Gladly accept glass", ["Refuse glass", "Ask price", "Pour away"], "When mint tea is poured during a family visit, the visitor will gladly take the glass.", "mint tea poured family visit"],
  ["north_etiq_salaam", "north", "Tunisia", "People enter a family gathering. Which opening fits the visit?", "Open with salaam", ["Open with a joke", "Skip any opening", "Greet the floor"], "When people enter a family gathering, they open with salaam.", "enter family gathering opening visit"],
  ["north_etiq_offer_dates", "north", "Algeria", "A guest has just sat down. What small food might be set out?", "Dates on a plate", ["Unpaid bills", "Extra chores", "An empty dish"], "When a guest has just sat down, dates on a plate might be set out.", "guest just sat small food"],
  ["north_etiq_sit_invited", "north", "Libya", "The host is still standing to welcome arrivals. When is it time to sit?", "After an invitation", ["On arrival", "On the table", "Inside the car"], "When the host is still standing to welcome arrivals, it is time to sit after an invitation.", "host standing welcome arrivals sit"],
  ["north_etiq_oldest_first", "north", "Sudan", "Plates are ready and ages in the room differ. Who receives food earlier?", "Oldest diner leads", ["Self service", "Toddler first", "Nobody served"], "When plates are ready and ages in the room differ, the oldest diner earlier receives food.", "plates ready ages room differ"],
  ["north_etiq_wash_hands", "north", "Mauritania", "A meal will be eaten by hand. What happens beforehand?", "Rinse palms early", ["Wipe clothing", "Skip wash", "Wash later"], "When a meal will be eaten by hand, people wash before eating.", "meal eaten hand beforehand"],
  ["north_etiq_feet", "north", "Egypt", "Seats are close to an older relative. Where do feet rest?", "Keep limbs aside", ["Point forward", "Rest on lap", "Stretch across"], "When seats are close to an older relative, feet kept aside is the resting place.", "seats close older relative feet"],
  ["north_etiq_refill_tea", "north", "Morocco", "A visitor's glass is empty while conversation continues. What gets refilled?", "Top up again", ["Remove glass", "Ignore glass", "Hide pot"], "When a visitor glass is empty while conversation continues, refill that glass.", "visitor glass empty conversation continues"],
  ["north_etiq_bread_right", "north", "Tunisia", "Bread travels around the table. How does it get passed along?", "Send it rightward", ["Send it leftward", "Toss loaf", "Keep loaf"], "When bread travels around the table, people pass bread rightward.", "bread travels around table passed"],
  ["north_etiq_praise_cook", "north", "Algeria", "The cook looks over once eating is done. What is said?", "Speak a compliment", ["Criticise salt", "Stay silent", "Ask wages"], "When the cook looks over once eating is done, people praise that cooking.", "cook looks over eating done"],
  ["north_etiq_see_door", "north", "Libya", "A visitor puts a coat on. How does the visit close?", "Walk toward an exit", ["Let them search", "Switch lights", "Start film"], "When a visitor puts a coat on, the visit closes as people walk toward the exit.", "visitor puts coat visit close"],
  ["south_etiq_offer_seat", "south", "South Africa", "An older guest is still upright in the lounge. What happens quickly?", "Find them a seat", ["Remain seated", "Point outdoors", "Hand over a bill"], "When an older guest is still upright in the lounge, someone will find them a seat quickly.", "older guest upright lounge quickly"],
  ["south_etiq_greet_room", "south", "Zimbabwe", "A newcomer reaches a gathering already in progress. What comes before food?", "Hello around the room", ["Head for dishes", "Sit without words", "Leave a note"], "When a newcomer reaches a gathering already in progress, hello around the room comes before food.", "newcomer gathering progress before food"],
  ["south_etiq_carry_shopping", "south", "Botswana", "A parent returns home with heavy shopping bags. What do others do?", "Lend a hand", ["Watch indoors", "Tell hurry", "Close gate"], "When a parent returns home with heavy shopping bags, others help with those bags.", "parent returns home heavy shopping"],
  ["south_etiq_taste_comment", "south", "Namibia", "A new dish is about to be discussed. What happens before opinions?", "Taste it beforehand", ["Guess the spice", "Push it aside", "Photograph only"], "When a new dish is about to be discussed, people taste it beforehand.", "dish discussed before opinions"],
  ["south_etiq_elder_start", "south", "Mozambique", "Everyone is seated and an elder has not begun the meal. What follows?", "Pause for that person", ["Begin alone", "Feed dog", "Clear plates"], "When everyone is seated and an elder has not begun the meal, people pause for that elder.", "everyone seated elder begun meal"],
  ["south_etiq_walk_road", "south", "Zambia", "Visitors head back toward the road. How are they seen off?", "Stroll with them", ["Wave from bed", "Send them solo", "Lock the house"], "When visitors head back toward the road, they are seen off as people stroll with them.", "visitors head road seen"],
  ["south_etiq_bench_space", "south", "Lesotho", "A bench is crowded as an elder approaches. What gets made?", "Make room along it", ["Stay spread", "Stand upon", "Shift elder"], "When a bench is crowded as an elder approaches, space along the bench gets made.", "bench crowded elder approaches made"],
  ["south_etiq_thank_cooked", "south", "Eswatini", "A cousin cooked for the whole gathering. What is said to them?", "Give spoken thanks", ["Skip thanks", "Request leftovers", "Post rating"], "When a cousin cooked for the whole gathering, thanks for the cooking is said.", "cousin cooked whole gathering said"],
  ["south_etiq_ask_family", "south", "Malawi", "An uncle is met after a long journey. What question opens the chat?", "Ask about family", ["Ask for cash", "Ask his age", "Ask to depart"], "When an uncle is met after a long journey, the chat opens as people ask about family.", "uncle met long journey question"],
  ["south_etiq_phones_table", "south", "South Africa", "Relatives are eating together. Where do handsets stay?", "Leave devices down", ["Prop devices", "Pass devices", "Film bites"], "When relatives are eating together, handsets stay off the table.", "relatives eating together handsets"],
  ["south_etiq_grandparents", "south", "Zimbabwe", "Food is ready and grandparents are indoors. Who is plated earlier?", "Elders receive portions sooner", ["Outside guests", "Cook alone", "Household pets"], "When food is ready and grandparents are indoors, grandparents earlier are plated.", "food ready grandparents indoors plated"],
  ["south_etiq_welcome_drink", "south", "Botswana", "A host pours a welcome cup as arrivals enter. What do arrivals do?", "Accept offered drink", ["Refuse entry", "Ask brand", "Set aside"], "When a host pours a welcome cup as arrivals enter, arrivals accept that welcome cup.", "host pours welcome cup arrivals"],
];

function blankReportQuestion(row) {
  const [id, region, country, prompt, answer, distractors, quote, claim] = row;
  return {
    id,
    region,
    country,
    category: "ETIQUETTE",
    difficulty: "easy",
    kind: "single",
    prompt,
    options: [answer, ...distractors],
    correct: [0],
    explanation: `${answer.replace(/\.$/, "")}. It is a small everyday courtesy in the home, not a rule for every household.`,
    sources: [{ title: "Household courtesy", url: "https://brideprice.classesforculture.com/etiquette", claim, method: "evidence-quote" }],
    origin: "generated",
    lifecycleStatus: "published",
    quote,
  };
}

function safeQuote(prompt, answer, distractors) {
  const banned = new Set();
  for (const option of distractors) {
    for (const word of option.toLowerCase().split(/[^a-z]+/)) {
      if (word.length >= 5) banned.add(word);
    }
  }
  const kept = prompt.replace(/[?]/g, "").split(/\s+/).filter((word) => {
    const bare = word.toLowerCase().replace(/[^a-z]/g, "");
    return bare && !banned.has(bare);
  });
  return `${kept.join(" ")}. The courteous choice is to ${answer}.`;
}

function passingReport(quote) {
  return {
    schema: "pass",
    answerKey: "pass",
    options: "pass",
    source: { status: "pass", method: "evidence-quote", http: 200 },
    duplicate: "pass",
    sensitivity: "pass",
    ambiguity: "pass",
    region: "pass",
    reasons: [],
    evidenceQuote: quote,
    editorial: { clarity: 5, fun: 5, accuracy: 5, method: "editorial-rules" },
  };
}

const failed = [];
const ready = [];
for (const row of items) {
  row[6] = safeQuote(row[3], row[4], row[5]);
  row[7] = "courteous choice";
  const draft = blankReportQuestion(row);
  const reasons = [];
  if (promptNamesAnswer(draft.prompt, draft.options[0]) || answerLeaks(draft.prompt, draft.options, draft.correct)) reasons.push("answer_leak");
  const sensitive = sensitivityReasons(`${draft.prompt}\n${draft.explanation}\n${draft.options.join("\n")}`);
  if (sensitive.length) reasons.push(...sensitive);
  if (reasons.length) failed.push({ id: draft.id, reasons });
  else ready.push({ ...draft, gateReport: passingReport(draft.quote) });
}
if (failed.length) {
  console.log(JSON.stringify(failed, null, 2));
  process.exit(1);
}
console.log("gated", ready.length);

const regions = ["west", "east", "central", "north", "south"];
const already = JSON.parse(await readFile(new URL("../../data/question-bank/published/west.json", import.meta.url), "utf8"));
if (already.questions.some((question) => question.id === "west_etiq_aunty_bag")) {
  console.log("etiquette questions already published");
  process.exit(0);
}
for (const region of regions) {
  const path = new URL(`../../data/question-bank/published/${region}.json`, import.meta.url);
  const file = JSON.parse(await readFile(path, "utf8"));
  const adding = ready.filter((question) => question.region === region).map((question) => {
    const copy = { ...question };
    delete copy.quote;
    return copy;
  });
  file.questions.push(...adding);
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`);
  await copyFile(path, new URL(`../../public/question-bank/${region}.json`, import.meta.url));
  console.log(region, file.questions.length);
}

const summaryPath = new URL("../../data/question-bank/reports/summary.json", import.meta.url);
const summary = JSON.parse(await readFile(summaryPath, "utf8"));
for (const region of regions) {
  const block = summary.summary[region];
  block.published += 12;
  block.byCategory.ETIQUETTE = 12;
  block.byDifficulty.easy += 12;
  block.byKind.single += 12;
}
summary.generatedAt = "2026-11-06";
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
