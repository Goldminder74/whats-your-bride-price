#!/usr/bin/env python3
"""Turn authored fact rows into generated question JSON for the publish gate."""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "question-bank" / "generated"

PROMPTS = {
    "FOOD": "Which dish is {definition}?",
    "PROVERBS": "Which saying is {definition}?",
    "MUSIC": "Which music or dance name is {definition}?",
    "FASHION": "Which cloth or dress style is {definition}?",
    "LANGUAGE": "Which language point is {definition}?",
    "FESTIVALS": "Which celebration is {definition}?",
    "WEDDINGS": "Which wedding custom is {definition}?",
    "GEOGRAPHY": "Which place is {definition}?",
    "HISTORY": "Which historical name is {definition}?",
    "PEOPLE": "Which person is {definition}?",
    "POP": "Which popular-culture name is {definition}?",
    "SPORT": "Which sporting name is {definition}?",
}

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
            for candidate in siblings:
                trial = [item["answer"], *distractors, candidate]
                if not nested(trial):
                    distractors.append(candidate)
                if len(distractors) == 3:
                    break
            if len(distractors) < 3:
                raise SystemExit(f"not enough distractors for {item['answer']} in {item['region']} {item['category']}")
            options = [item["answer"], *distractors[:3]]
            correct = [0]
            prompt = PROMPTS[item["category"]].format(definition=item["definition"])
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
        variants = sum(1 for q in questions if q.get("kind") == "complete")
        if item["kind"] == "single" and item.get("definition") and variants < 8:
            prompt2 = f"Fill the blank. In {item['country']}, {item['definition']}. The name to write is ___."
            if jaccard(prompt, prompt2) < 0.4:
                variant = dict(built)
                variant["id"] = f"{ident}_fill"[:62]
                variant["kind"] = "complete"
                variant["prompt"] = prompt2
                if variant["id"] not in seen_ids:
                    seen_ids.add(variant["id"])
                    questions.append(variant)
    return questions


def main() -> None:
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from facts_east import ROWS as EAST
    from facts_ns import NORTH, SOUTH
    from facts_rest import CENTRAL
    from facts_forms import FORMS
    from facts_west import ROWS as WEST
    from facts_west_more import ROWS as WEST_MORE
    emit("west", WEST + WEST_MORE + FORMS["west"])
    emit("east", EAST + FORMS["east"])
    emit("central", CENTRAL + FORMS["central"])
    emit("north", NORTH + FORMS["north"])
    emit("south", SOUTH + FORMS["south"])

def emit(name: str, rows: list[dict]) -> None:
    questions = build(rows)
    OUT.mkdir(parents=True, exist_ok=True)
    target = OUT / f"{name}.json"
    target.write_text(json.dumps({"region": name, "questions": questions}, indent=2, ensure_ascii=False) + "\n")
    print(f"{name}: {len(questions)}")

if __name__ == "__main__":
    main()
