"use client";

import { useMemo, useState } from "react";

type Option = { label: string; points: number };
type Question = { category: string; question: string; options: Option[]; fact: string };

const questions: Question[] = [
  { category: "Food", question: "Which tiny grain is traditionally used to make Ethiopian injera?", options: [{ label: "Teff", points: 10 }, { label: "Millet", points: 3 }, { label: "Fonio", points: 3 }, { label: "Rice", points: 0 }], fact: "Teff flour gives injera its distinctive flavour and texture." },
  { category: "Food", question: "UNESCO recognises couscous traditions shared by which group of countries?", options: [{ label: "Algeria, Mauritania, Morocco and Tunisia", points: 10 }, { label: "Egypt, Sudan, Eritrea and Ethiopia", points: 2 }, { label: "Ghana, Togo, Benin and Nigeria", points: 0 }, { label: "Kenya, Uganda, Rwanda and Burundi", points: 0 }], fact: "The shared knowledge around making and eating couscous was inscribed by UNESCO in 2020." },
  { category: "Food", question: "Nsima, a staple with deep cultural importance in Malawi, is usually made from what?", options: [{ label: "Maize flour", points: 10 }, { label: "Cassava leaves", points: 2 }, { label: "Plantain", points: 0 }, { label: "Sorghum beer", points: 0 }], fact: "Nsima is a thick maize-flour porridge eaten with relishes and shared in families and communities." },
  { category: "Philosophy", question: "What idea is at the heart of Ubuntu?", options: [{ label: "A person becomes fully human through other people", points: 10 }, { label: "Wisdom belongs only to elders", points: 2 }, { label: "Silence is always stronger than speech", points: 1 }, { label: "Success must be pursued alone", points: 0 }], fact: "Ubuntu is associated with connectedness, shared humanity, compassion and mutual responsibility." },
  { category: "Language", question: "The Swahili saying ‘Haraka haraka haina baraka’ gives which advice?", options: [{ label: "Hurry, hurry has no blessing", points: 10 }, { label: "A guest brings good fortune", points: 2 }, { label: "Rain never forgets the sea", points: 1 }, { label: "Music makes the road shorter", points: 0 }], fact: "The proverb warns that rushing can spoil a task. Care and patience matter." },
  { category: "Storytelling", question: "In parts of West Africa, what is a griot best known for?", options: [{ label: "Preserving history through story, genealogy, praise and music", points: 10 }, { label: "Carving royal stools", points: 2 }, { label: "Leading only harvest dances", points: 1 }, { label: "Trading salt across the Sahara", points: 0 }], fact: "Griots are oral historians, genealogists, musicians and keepers of memory in several West African societies." },
  { category: "Music & Dance", question: "Moutya, danced to a heated goatskin drum, is a living tradition of which islands?", options: [{ label: "Seychelles", points: 10 }, { label: "Cape Verde", points: 3 }, { label: "São Tomé and Príncipe", points: 2 }, { label: "Comoros", points: 1 }], fact: "Moutya is a Seychellois Creole dance tradition with roots in resistance, dignity and social expression." },
  { category: "Music & Dance", question: "Gule Wamkulu, the ‘Great Dance’, is practised by which people?", options: [{ label: "The Chewa of Malawi, Mozambique and Zambia", points: 10 }, { label: "The Tuareg of the central Sahara", points: 2 }, { label: "The Akan of Ghana and Côte d’Ivoire", points: 2 }, { label: "The Oromo of Ethiopia and Kenya", points: 1 }], fact: "The Chewa perform Gule Wamkulu at occasions including initiations, weddings and funerals." },
  { category: "Music & Dance", question: "South Africa’s gumboot dance grew from communication and rhythm among whom?", options: [{ label: "Mine workers", points: 10 }, { label: "Royal praise singers", points: 2 }, { label: "Coastal fishermen", points: 1 }, { label: "Desert caravan guides", points: 0 }], fact: "Workers in South African mines developed percussive movement using boots, bodies and chains." },
  { category: "Cloth & Symbols", question: "Kente cloth is especially associated with which cultural traditions?", options: [{ label: "Akan and Ewe traditions in Ghana", points: 10 }, { label: "Maasai traditions in Kenya", points: 2 }, { label: "San traditions in Botswana", points: 1 }, { label: "Nubian traditions in Sudan", points: 1 }], fact: "Kente is woven in strips, with colours and patterns carrying names, histories and meanings." },
  { category: "Cloth & Symbols", question: "Adinkra are best described as what?", options: [{ label: "Visual symbols expressing concepts, values and proverbs", points: 10 }, { label: "Beads used only for counting age", points: 2 }, { label: "A family of stringed instruments", points: 1 }, { label: "A ceremonial bread", points: 0 }], fact: "Adinkra symbols communicate ideas about life, leadership, character, history and philosophy." },
  { category: "Customs", question: "At a Nigerian celebration, what does ‘aso ebi’ usually refer to?", options: [{ label: "Co-ordinated fabric or dress worn by a family or social group", points: 10 }, { label: "The first dance after a meal", points: 2 }, { label: "A gift reserved for the eldest guest", points: 1 }, { label: "A spice mix for party rice", points: 0 }], fact: "Aso ebi literally evokes family cloth and visibly expresses solidarity and belonging at events." },
  { category: "Customs", question: "In several Southern African societies, lobola traditionally describes what?", options: [{ label: "A negotiated marriage gift between families, historically often involving cattle", points: 10 }, { label: "A naming ceremony held at sunrise", points: 2 }, { label: "A harvest song contest", points: 1 }, { label: "A bride’s private savings", points: 0 }], fact: "Practices differ by community. Lobola concerns family relationships and customary marriage, not a price tag on a person." },
  { category: "History", question: "The name ‘Great Zimbabwe’ is most closely connected to which idea?", options: [{ label: "Great houses or houses of stone", points: 10 }, { label: "Land of a thousand lakes", points: 2 }, { label: "Home of the golden drum", points: 1 }, { label: "Meeting place of four rivers", points: 0 }], fact: "The monumental dry-stone city gave modern Zimbabwe its name." },
  { category: "History", question: "Cowrie shells once travelled widely across Africa and often signalled what?", options: [{ label: "Wealth, exchange, status or spiritual meaning", points: 10 }, { label: "A ban on sea travel", points: 1 }, { label: "Membership of one single ethnic group", points: 0 }, { label: "A written alphabet", points: 0 }], fact: "Cowries have served as currency, adornment and meaningful symbols in many different African contexts." },
];

const tiers = [
  { min: 0, title: "Culture Curious", cowries: "1,200", emoji: "🌱", line: "Your learning journey has excellent vibes and plenty of room for snacks." },
  { min: 35, title: "Story Starter", cowries: "5,000", emoji: "📖", line: "You know enough to join the conversation and ask the questions that unlock the good stories." },
  { min: 60, title: "Rhythm Finder", cowries: "12,000", emoji: "🥁", line: "The beat found you. You spot cultural clues and you are rarely the last person onto the dance floor." },
  { min: 85, title: "Heritage Connector", cowries: "25,000", emoji: "✨", line: "You connect food, philosophy, cloth, history and celebration with serious flair." },
  { min: 110, title: "Cultural Princess", cowries: "50,000", emoji: "👑", line: "Your cultural radar is sharp, your stories are rich and the aunties have started taking notes." },
  { min: 135, title: "Living Library", cowries: "100,000", emoji: "🏆", line: "Negotiations paused. Everyone is listening because your heritage knowledge entered the room first." },
];

function getTier(score: number) { return [...tiers].reverse().find((tier) => score >= tier.min) ?? tiers[0]; }

export default function QuizClient() {
  const [screen, setScreen] = useState<"intro" | "quiz" | "result">("intro");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [showFact, setShowFact] = useState(false);
  const [copied, setCopied] = useState(false);
  const score = useMemo(() => answers.reduce((sum, value) => sum + value, 0), [answers]);
  const result = getTier(score);
  const percentage = Math.round((score / 150) * 100);
  const question = questions[index];

  function choose(optionIndex: number) { if (!showFact) { setSelected(optionIndex); setShowFact(true); } }
  function next() {
    if (selected === null) return;
    const updated = [...answers, question.options[selected].points];
    setAnswers(updated);
    if (index === questions.length - 1) { setScreen("result"); return; }
    setIndex(index + 1); setSelected(null); setShowFact(false);
  }
  function restart() { setScreen("intro"); setIndex(0); setAnswers([]); setSelected(null); setShowFact(false); setCopied(false); }
  async function shareResult() {
    const text = `I got ${result.title} on “What’s Your Bride Price?” with ${percentage}% culture connection and ${result.cowries} golden cowries. Can you beat me?`;
    try {
      if (navigator.share) await navigator.share({ title: "What's Your Bride Price?", text, url: window.location.href });
      else { await navigator.clipboard.writeText(`${text} ${window.location.href}`); setCopied(true); }
    } catch { /* Closing the share sheet needs no warning. */ }
  }

  if (screen === "intro") return (
    <main className="shell">
      <div className="pattern" aria-hidden="true" />
      <section className="hero card">
        <div className="eyebrow"><span>15 questions</span><span>6 themes</span><span>100% good vibes</span></div>
        <div className="hero-mark" aria-hidden="true">✦</div>
        <p className="kicker">The African culture challenge</p>
        <h1>What’s Your<br /><em>Bride Price?</em></h1>
        <p className="lede">Food, rhythm, proverbs, customs and history. Put your cultural connection to the test and collect your theoretical golden cowries.</p>
        <button className="primary" onClick={() => setScreen("quiz")}>Start the quiz <span>→</span></button>
        <p className="kind-note"><strong>For laughs, not valuation.</strong> No woman has a price. The cowries are imaginary, every culture is diverse, and curiosity always earns respect.</p>
      </section>
      <section className="mini-grid" aria-label="How it works">
        <article><b>01</b><span>Pick your best answer</span></article><article><b>02</b><span>Learn one quick fact</span></article><article><b>03</b><span>Share your result</span></article>
      </section>
      <footer>Made for laughter, learning and lively group chats.</footer>
    </main>
  );

  if (screen === "quiz") return (
    <main className="shell quiz-shell">
      <div className="pattern" aria-hidden="true" />
      <section className="quiz-top"><button className="wordmark" onClick={restart}>W Y B P ?</button><span>{index + 1} of {questions.length}</span></section>
      <div className="progress" aria-label={`Question ${index + 1} of ${questions.length}`}><span style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div>
      <section className="question-card card">
        <p className="category">{question.category}</p><h2>{question.question}</h2>
        <div className="options">
          {question.options.map((option, optionIndex) => {
            const chosen = selected === optionIndex; const correct = option.points === 10;
            const state = showFact ? (correct ? "correct" : chosen ? "wrong" : "muted") : "";
            return <button key={option.label} className={`option ${chosen ? "selected" : ""} ${state}`} onClick={() => choose(optionIndex)}><span className="letter">{String.fromCharCode(65 + optionIndex)}</span><span>{option.label}</span>{showFact && correct && <span className="tick">✓</span>}</button>;
          })}
        </div>
        {showFact && <div className="fact" role="status"><span>Quick culture drop</span><p>{question.fact}</p><button className="primary compact" onClick={next}>{index === questions.length - 1 ? "Reveal my result" : "Next question"} <span>→</span></button></div>}
      </section>
    </main>
  );

  return (
    <main className="shell result-shell">
      <div className="pattern" aria-hidden="true" />
      <section className="result-card card">
        <p className="kicker">The family council has spoken</p><div className="result-emoji" aria-hidden="true">{result.emoji}</div><p className="result-label">Your culture connection is</p><h1>{result.title}</h1>
        <div className="score-ring" style={{ "--score": `${percentage * 3.6}deg` } as React.CSSProperties}><div><strong>{percentage}%</strong><span>culture connection</span></div></div>
        <p className="result-line">{result.line}</p><div className="cowries"><small>Your entirely theoretical bride price</small><strong>{result.cowries}</strong><span>golden cowries</span></div>
        <p className="disclaimer">Bragging rights only. Human worth is priceless and customary practices vary widely.</p>
        <div className="result-actions"><button className="primary" onClick={shareResult}>{copied ? "Copied to clipboard" : "Share my result"} <span>↗</span></button><button className="secondary" onClick={restart}>Play again</button></div>
      </section>
      <section className="learn-more"><h2>Keep the conversation going</h2><p>Africa is a continent of thousands of communities and living traditions. This is a joyful sampler, not a test of anyone’s identity.</p><details><summary>Sources and cultural note</summary><p>Core references include UNESCO’s Intangible Cultural Heritage pages for Ubuntu, couscous, Moutya, Gule Wamkulu and living heritage. Terms and practices can differ by language, country, family and community.</p><div className="source-links"><a href="https://ich.unesco.org/en/lists" target="_blank" rel="noreferrer">UNESCO living heritage lists</a><a href="https://courier.unesco.org/en/articles/i-am-because-you-are" target="_blank" rel="noreferrer">UNESCO on Ubuntu</a></div></details></section>
      <footer>What’s Your Bride Price? Culture Quiz · For entertainment and learning.</footer>
    </main>
  );
}
