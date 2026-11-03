"""Score every sentence of an earnings call with FinBERT and write a fixture for the live sentiment demo.

Usage (from the repo root, inside the venv):
    python hype/scripts/score_call.py --file apple_seeking_alpha.txt --out hype/app/fixtures/apple_call_sentiment.json

Each sentence gets score = round(100 * (P(positive) - P(negative))), so -100 is very bearish,
+100 very bullish, and boilerplate lands near 0. The first run downloads ProsusAI/finbert (~440 MB).
"""
import argparse, json, re
from pathlib import Path

import spacy
from transformers import pipeline

TRANSCRIPTS = Path(__file__).resolve().parents[2] / "RAG" / "transcripts"
MODEL = "ProsusAI/finbert"


def speaker_names(lines: list[str]) -> set[str]:
    """Names from the 'Company Participants' and 'Conference Call Participants' lists, plus the operator."""
    names = {"Operator"}
    for line in lines:
        m = re.match(r"^(.+?) - .+$", line.strip())
        if m:
            names.add(m.group(1).strip())
    return names


def turns(text: str) -> list[tuple[str, str]]:
    """Split the transcript into (speaker, paragraph) pairs, skipping the header."""
    lines = text.splitlines()
    names = speaker_names(lines)
    out, speaker = [], None
    for para in re.split(r"\n\s*\n", text):
        para = para.strip()
        if not para:
            continue
        if para in names:
            speaker = para
        elif speaker:
            out.append((speaker, " ".join(para.split())))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--file", required=True, help="transcript filename in RAG/transcripts")
    ap.add_argument("--out", required=True, help="output JSON path")
    args = ap.parse_args()

    nlp = spacy.blank("en")
    nlp.add_pipe("sentencizer")
    sentences = []
    for speaker, para in turns((TRANSCRIPTS / args.file).read_text(encoding="utf-8", errors="ignore")):
        for sent in nlp(para).sents:
            s = sent.text.strip()
            if len(s) > 3:
                sentences.append({"speaker": speaker, "text": s})

    clf = pipeline("text-classification", model=MODEL, top_k=None, truncation=True)
    for row, probs in zip(sentences, clf([r["text"] for r in sentences], batch_size=32)):
        p = {d["label"].lower(): d["score"] for d in probs}
        row["score"] = round(100 * (p.get("positive", 0) - p.get("negative", 0)))

    Path(args.out).write_text(json.dumps({"model": MODEL, "source": args.file, "sentences": sentences},
                                         indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Scored {len(sentences)} sentences -> {args.out}")


if __name__ == "__main__":
    main()
