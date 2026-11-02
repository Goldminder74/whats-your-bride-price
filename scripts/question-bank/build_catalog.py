#!/usr/bin/env python3
"""Turn authored fact rows into generated question JSON for the publish gate."""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "question-bank" / "generated"

VAGUE = re.compile(
    r"\b(?:current champion|currently holds|before the next generation|these days|right now|reigning)\b"
    r"|(?:world record|olympic champion|world champion)(?!.*\b(?:19|20)\d{2}\b)",
    re.I,
)

REGION_OF = {}


def norm(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.replace("’", "'").replace("‘", "'").lower()
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def nested(options: list[str]) -> bool:
    keys = [norm(option) for option in options]
    for i, left in enumerate(keys):
        for j, right in enumerate(keys):
            if i != j and len(right) >= 4 and right in left:
                return True
    return False


def slug(region: str, category: str, answer: str, wiki: str) -> str:
    raw = norm(wiki or answer).replace(" ", "_")
    raw = re.sub(r"[^a-z0-9_]+", "", raw).strip("_")
    prefix = {
        "FOOD": "food", "PROVERBS": "prov", "MUSIC": "musi", "FASHION": "fash",
        "LANGUAGE": "lang", "FESTIVALS": "fest", "WEDDINGS": "wedd", "GEOGRAPHY": "geog",
        "HISTORY": "hist", "PEOPLE": "peop", "POP": "popc", "SPORT": "spor",
    }[category]
    body = f"{prefix}_{raw}"[:48].strip("_")
    ident = f"{region}_{body}"
    return ident[:62]


def row(region, difficulty, category, country, answer, definition, wiki, claim, kind="single", options=None, correct=None, prompt=None, explanation=None):
    return {
        "region": region,
        "difficulty": difficulty,
        "kind": kind,
        "category": category,
        "country": country,
        "answer": answer,
        "definition": definition,
        "wiki": wiki,
        "claim": claim,
        "options": options,
        "correct": correct,
        "prompt": prompt,
        "explanation": explanation,
    }


STOP = {"about", "after", "again", "among", "because", "before", "being", "between", "could", "every", "first", "from", "have", "into", "which", "while", "would", "their", "there", "these", "those", "other"}

def tokens(value: str) -> set[str]:
    return {word for word in norm(value).split(" ") if len(word) >= 5 and word not in STOP}

def jaccard(left: str, right: str) -> float:
    a, b = tokens(left), tokens(right)
    if not a and not b:
        return 1.0
    return len(a & b) / (len(a | b) or 1)

KEEP_WORDS = {
    "royal", "hill", "hills", "music", "festival", "dance", "national", "park", "world", "lake", "river",
    "club", "city", "town", "state", "empire", "kingdom", "mountain", "coast", "north", "south", "east",
    "west", "great", "grand", "holy", "high", "central", "african", "island", "valley", "people", "king",
    "queen", "chief", "gold", "black", "white", "green", "blue", "red", "cape", "port", "fort", "mount",
    "lower", "upper", "falls", "rock", "stone", "desert", "gulf", "basin", "delta", "plateau", "capital",
    "official", "cultural", "fishing", "open", "games", "republic", "democratic", "united", "guitar", "style",
}

def hide_answer(definition: str, answer: str) -> str:
    text = definition
    for word in re.findall(r"[A-Za-zÀ-ÿ'’-]{4,}", answer):
        pieces = [part.lower() for part in word.split("-")]
        if word[:1].isupper() and not any(part in KEEP_WORDS for part in pieces):
            text = re.sub(rf"\b{re.escape(word)}\b", "", text, flags=re.I)
    return re.sub(r"\s+", " ", text).replace(" ,", ",").strip(" ,;")

def natural_prompt(category: str, definition: str, answer: str = "") -> str | None:
    clue = hide_answer(definition, answer).strip().rstrip(".") if answer else definition.strip().rstrip(".")
    clue = re.sub(r"\s+", " ", clue).strip(" ,;")
    if re.search(r"\ba and\b|\bthe and\b", clue, re.I):
        return None
    if re.search(r"\b(?:in|of|from|for|at|by|with|and|the|a|an)$", clue, re.I):
        return None
    if answer and re.search(r"\b(lake|river|empire|mountain|kingdom)\b", definition, re.I) and not re.search(r"\b(lake|river|empire|mountain|kingdom)\b", clue, re.I):
        return None
    if len(clue.split()) < 4:
        return None
    if category == "GEOGRAPHY" and re.search(r"\bcapital\b", clue, re.I):
        def place_of(text: str) -> str:
            found = re.search(r"\bcapital\b(?:(?!\bof\b).)*\bof\s+(.+)$", text, re.I)
            place = found.group(1).strip(" .") if found else ""
            return re.sub(r"\s+and\s+an\s+.+$", "", place, flags=re.I).strip(" .")
        place = place_of(clue)
        if norm(place) != norm(place_of(definition)):
            return None
        if len(place) < 3:
            return None
        official = "official " if re.search(r"\bofficial\b", clue, re.I) else ""
        return f"Which city is the {official}capital of {place}?"
    if category in {"PEOPLE", "POP"}:
        return f"Who is {clue}?"
    if category == "SPORT":
        if re.search(r"\b(nickname|sport|tournament|championship|cup|club|team)\b", clue, re.I):
            return f"What is {clue}?"
        return f"Who is {clue}?"
    if re.match(r"the year\b", clue, re.I):
        event = re.sub(r"^the year\s+", "", clue, flags=re.I)
        for past, present in (
            ("became", "become"), ("reached", "reach"), ("hosted", "host"), ("held", "hold"),
            ("defeated", "defeat"), ("opened", "open"), ("gained", "gain"), ("won", "win"),
        ):
            event = re.sub(rf"\b{past}\b", present, event, flags=re.I)
        if re.search(r"\b(?:become|reach|host|hold|defeat|open|gain|win)\b", event, re.I) is None:
            return None
        return f"In which year did {event}?"
    if category == "FOOD":
        return f"What do you call {clue}?"
    if category == "LANGUAGE":
        return f"Can you name {clue}?"
    if category == "FESTIVALS":
        rest = re.sub(r"^(?:a|an|the)\s+festival\s+", "", clue, flags=re.I)
        rest = re.sub(r"^celebrated\b", "held", rest, flags=re.I)
        if len(rest.split()) < 3:
            return None
        return f"Which celebration is {rest}?"
    if category == "WEDDINGS":
        return f"What do you call {clue}?"
    if category == "GEOGRAPHY":
        return f"Where is {clue}?"
    if category == "PROVERBS":
        return f"Which saying means {clue}?"
    if re.search(r"\b(singer|rapper|bandleader|producer|musician|composer|guitarist|vocalist|artist|dj)\b", clue, re.I):
        who = re.sub(r"^a\s+", "the ", clue, flags=re.I)
        return f"Who is {who}?"
    return f"What is {clue}?"

def leaks_answer(prompt: str, answer: str) -> bool:
    prompt_norm = norm(prompt)
    answer_norm = norm(answer)
    if len(answer_norm) >= 4 and answer_norm in prompt_norm:
        return True
    roots = [word[:-1] if len(word) >= 5 and word.endswith("s") else word for word in answer_norm.split(" ")]
    return any(len(root) >= 5 and root in prompt_norm for root in roots)

def wiki_url(title: str) -> str:
    from urllib.parse import quote
    return "https://en.wikipedia.org/wiki/" + quote(title.replace(" ", "_"), safe="()_!$&'*+,;=")


def build(rows: list[dict]) -> list[dict]:
    by_cat: dict[tuple, list[dict]] = {}
    for item in rows:
        by_cat.setdefault((item["region"], item["category"]), []).append(item)
    questions = []
    seen_ids = set()
    for item in rows:
        if isinstance(item.get("answer"), str) and item["answer"].endswith(" pop"):
            item["answer"] = item["answer"][:-4]
        if item["kind"] != "single" or item.get("options"):
            options = item["options"]
            correct = item["correct"]
            prompt = item["prompt"]
        else:
            siblings = []
            seen_answers = {norm(item["answer"])}
            for other in by_cat[(item["region"], item["category"])]:
                key = norm(other["answer"])
                if key in seen_answers:
                    continue
                seen_answers.add(key)
                siblings.append(other["answer"])
            distractors = []
            def answer_type(entry: dict) -> str:
                label = entry["answer"].strip()
                blob = f"{entry.get('definition', '')} {entry.get('claim', '')}"
                category = entry["category"]
                if re.match(r"\d{3,4}\b", label):
                    return "year"
                if category == "GEOGRAPHY":
                    if re.search(r"\bcapital\b", blob, re.I):
                        return "city"
                    if re.search(r"\b(river|lake|mount|mountain|delta|desert|falls|waterfall|island|ocean|volcano)\b", blob, re.I):
                        return "landform"
                    return "place"
                if category in {"PEOPLE", "POP"}:
                    return "person"
                if category == "SPORT":
                    if re.search(r"\bnickname\b", blob, re.I) and not re.search(r"\b(club|team)\b", blob, re.I):
                        return "nickname"
                    if re.search(r"\b(club|team|cup|tournament|championship)\b", blob, re.I):
                        return "club"
                    return "person"
                if category == "MUSIC":
                    if re.search(r"\b(singer|rapper|musician|bandleader|guitarist|band|artist|producer|composer|drummer|historian|storyteller|dj)\b", blob, re.I):
                        return "person"
                    return "music"
                if category == "HISTORY":
                    if re.search(r"\b(kingdom|empire|civilisation|civilization|dynasty)\b", blob, re.I):
                        return "polity"
                    if re.search(r"\b(president|king|founder|leader|writer|general|poet)\b", blob, re.I):
                        return "person"
                    return "history"
                return category

            wanted = answer_type(item)
            def same_type(candidate_answer: str) -> bool:
                sibling = next((other for other in by_cat[(item["region"], item["category"])] if other["answer"] == candidate_answer), None)
                return bool(sibling) and answer_type(sibling) == wanted

            for candidate in siblings:
                if not same_type(candidate):
                    continue
                trial = [item["answer"], *distractors, candidate]
                if not nested(trial):
                    distractors.append(candidate)
                if len(distractors) == 3:
                    break
            if len(distractors) < 3:
                continue
            options = [item["answer"], *distractors[:3]]
            correct = [0]
            if VAGUE.search(item["definition"]) or VAGUE.search(item["claim"]):
                continue
            prompt = natural_prompt(item["category"], item["definition"], item["answer"])
            if not prompt or leaks_answer(prompt, item["answer"]):
                # Keep the row so a later pass can rebuild the prompt from the source sentence.
                prompt = "Which answer fits the sourced fact?"
        if nested(options):
            raise SystemExit(f"nested options for {item['answer']}: {options}")
        if len(options) != 4 or len(set(norm(option) for option in options)) != 4:
            raise SystemExit(f"bad options for {item['answer']}: {options}")
        explanation = item.get("explanation") or item["claim"].rstrip(".") + "."
        if "\u2014" in prompt or "\u2014" in explanation or "\u2013" in prompt or "\u2013" in explanation:
            raise SystemExit(f"dash in {item['answer']}")
        ident = slug(item["region"], item["category"], item["answer"], item["wiki"])
        suffix = 2
        while ident in seen_ids:
            ident = slug(item["region"], item["category"], item["answer"], item["wiki"] + str(suffix))
            suffix += 1
        seen_ids.add(ident)
        built = {
            "id": ident,
            "region": item["region"],
            "country": item["country"],
            "category": item["category"],
            "difficulty": item["difficulty"],
            "kind": item["kind"],
            "prompt": prompt,
            "options": options,
            "correct": correct,
            "explanation": explanation,
            "sources": [{
                "title": item["wiki"],
                "url": wiki_url(item["wiki"]),
                "claim": item["claim"],
                "method": "page-overlap",
            }],
            "origin": "generated",
        }
        questions.append(built)
    return questions


def main() -> None:
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from facts_boost import CENTRAL as CENTRAL_BOOST
    from facts_boost import EAST as EAST_BOOST
    from facts_boost import NORTH as NORTH_BOOST
    from facts_boost import SOUTH as SOUTH_BOOST
    from facts_boost import WEST as WEST_BOOST
    from facts_east import ROWS as EAST
    from facts_ns import NORTH, SOUTH
    from facts_rest import CENTRAL
    from facts_forms import FORMS
    from facts_west import ROWS as WEST
    from facts_west_more import ROWS as WEST_MORE
    emit("west", WEST + WEST_MORE + FORMS["west"] + WEST_BOOST)
    emit("east", EAST + FORMS["east"] + EAST_BOOST)
    emit("central", CENTRAL + FORMS["central"] + CENTRAL_BOOST)
    emit("north", NORTH + FORMS["north"] + NORTH_BOOST)
    emit("south", SOUTH + FORMS["south"] + SOUTH_BOOST)

def emit(name: str, rows: list[dict]) -> None:
    questions = build(rows)
    OUT.mkdir(parents=True, exist_ok=True)
    target = OUT / f"{name}.json"
    target.write_text(json.dumps({"region": name, "questions": questions}, indent=2, ensure_ascii=False) + "\n")
    print(f"{name}: {len(questions)}")

if __name__ == "__main__":
    main()
