"""
Feedback & scoring — one report, two sections.

  Technical round  judged on technical knowledge: correctness, depth, problem solving (+ delivery)
  Resume round     judged on how well the candidate owns and explains their own experience and projects:
                   ownership, specificity, impact (+ delivery)

Each round is scored separately (an LLM call per round, run in parallel, with a heuristic fallback built from
the per-answer analysis stored during the interview) and the overall score combines the rounds that were reached.
"""

from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor

from app.core.interview_plan import ROUND_NAMES, ROUND_ORDER, RESUME, TECHNICAL
from app.core.llm import call_llm_json, llm_status

log = logging.getLogger("evaluation")

_FILLERS = re.compile(r"\b(um+|uh+|erm|you know|i mean|basically|actually|like,)\b", re.I)
_HEDGE = re.compile(r"\b(maybe|i think|i guess|not sure|probably|kind of|sort of)\b", re.I)
_OUTCOME = re.compile(r"\d|%|\b(percent|reduced|improved|increased|decreased|faster|saved|launched|shipped|deployed|won|accuracy|users|result)\b", re.I)
_REASON = re.compile(r"\b(because|so that|therefore|trade-?off|instead|however|which means|that way|otherwise|since)\b", re.I)

SHARED_AXES = ("relevance", "clarity", "communication", "confidence", "grammar")
ROUND_AXES = {
    TECHNICAL: ("knowledge", "depth", "problem_solving") + SHARED_AXES,
    RESUME: ("ownership", "specificity", "impact") + SHARED_AXES,
}
AXIS_LABELS = {
    "knowledge": "Technical knowledge", "depth": "Depth", "problem_solving": "Problem solving",
    "ownership": "Ownership", "specificity": "Specificity", "impact": "Impact and results",
    "relevance": "Relevance", "clarity": "Clarity", "communication": "Communication", "confidence": "Confidence", "grammar": "Grammar",
}
WEIGHTS = {
    TECHNICAL: {"knowledge": 0.35, "depth": 0.2, "problem_solving": 0.15, "relevance": 0.1, "clarity": 0.1, "communication": 0.1},
    RESUME: {"ownership": 0.25, "specificity": 0.25, "impact": 0.2, "relevance": 0.1, "clarity": 0.1, "communication": 0.1},
}

_RUBRIC = {
    TECHNICAL: """This is ROUND 1, the TECHNICAL round. Judge ONLY technical knowledge for the role "{role}": would a hiring \
engineer be convinced the candidate knows the technologies and fundamentals a {role} needs?
  knowledge: correctness and completeness of the technical content. Wrong or misleading statements MUST lower this. "I don't know" is ~10-25.
  depth: goes beyond definitions: mechanisms, trade-offs, edge cases, real use.
  problem_solving: reasoning toward a solution, scenario handling, debugging approach.
  relevance: answered what was asked.   clarity: easy to follow.   communication: concise, few fillers.
  confidence: decisive, not hedging.   grammar: grammatical spoken English.""",
    RESUME: """This is ROUND 2, the RESUME round. Judge how well the candidate can talk about what is on their own resume \
(jobs, internships, projects, education, certifications) for the role "{role}".
  ownership: makes clear what THEY personally did (not just "we"), and the claims sound genuine and consistent.
  specificity: concrete details: technologies, decisions and why, architecture, problems hit.
  impact: outcomes, numbers, results, what they learned.
  relevance: answered what was asked.   clarity: easy to follow.   communication: concise, few fillers.
  confidence: decisive, not hedging.   grammar: grammatical spoken English.""",
}

SYSTEM_PROMPT = """You are an experienced interview coach scoring ONE round of a mock interview conducted by voice \
(answers are speech-to-text transcripts: ignore small transcription glitches and missing punctuation).

{rubric}

Score each axis from 0 to 100. Be calibrated: a vague or short answer is below 50; a specific, structured, correct answer is \
above 75; reserve 90+ for excellent answers. Ground every comment in what the candidate really said; quote or refer to their words. \
Do not invent anything they did not say. Questions marked (follow-up) probe the previous answer.

Return ONLY this JSON:
{{"scores": {{{axes}}},
 "strengths": ["..."],           // 2-4 short items specific to this round
 "weak_topics": ["..."],         // 1-4 short items
 "recommendations": ["..."],     // 3-5 concrete, actionable items for this round
 "summary": "2-3 sentence verdict for this round",
 "per_question": [{{"index": 1, "score": 0, "feedback": "one or two sentences", "better_answer_tip": "one sentence"}}],
 "topic_scores": [{{"topic": "...", "score": 0}}]}}"""


def _clamp(v, lo=0, hi=100) -> int:
    try:
        return max(lo, min(hi, int(round(float(v)))))
    except (TypeError, ValueError):
        return 0


def _words(text: str) -> int:
    return len(re.findall(r"\b\w+\b", text or ""))


# --------------------------------------------------------------------------- heuristic scoring of one round


def _heuristic_round(key: str, entries: list[dict]) -> dict:
    answered = [e for e in entries if (e.get("answer") or "").strip()]
    analyses = [e["analysis"] for e in answered if isinstance(e.get("analysis"), dict)]

    def avg(k, default=3.0):
        vals = [a.get(k) for a in analyses if isinstance(a.get(k), (int, float))]
        return sum(vals) / len(vals) if vals else default

    lens = [_words(e["answer"]) for e in answered]
    avg_len = sum(lens) / max(1, len(lens))
    total_words = max(1, sum(lens))
    filler_rate = sum(len(_FILLERS.findall(e["answer"])) for e in answered) / total_words
    hedge = sum(len(_HEDGE.findall(e["answer"])) for e in answered)
    with_outcome = sum(1 for e in answered if _OUTCOME.search(e["answer"])) / max(1, len(answered))
    with_reason = sum(1 for e in answered if _REASON.search(e["answer"])) / max(1, len(answered))

    clarity = _clamp(avg("clarity") * 20 - filler_rate * 200)
    relevance = _clamp(avg("relevance") * 20)
    depth = _clamp(avg("depth") * 20)
    communication = _clamp((clarity + 35 + min(40, avg_len * 0.6)) / 2 - filler_rate * 100)
    confidence = _clamp(80 - hedge * 5 - filler_rate * 150 - (15 if avg_len < 15 else 0))
    grammar = _clamp(85 - filler_rate * 120)
    scores = {"relevance": relevance, "clarity": clarity, "communication": communication, "confidence": confidence, "grammar": grammar}

    if key == TECHNICAL:
        acc = avg("accuracy", avg("depth"))
        scores.update({
            "knowledge": _clamp(acc * 20),
            "depth": depth,
            "problem_solving": _clamp(30 + with_reason * 35 + min(25, avg_len * 0.35)),
        })
    else:
        own = avg("ownership", avg("relevance"))
        scores.update({
            "ownership": _clamp(own * 20),
            "specificity": _clamp(depth * 0.8 + with_outcome * 20),
            "impact": _clamp(25 + with_outcome * 60 - (10 if avg_len < 20 else 0)),
        })
    overall = _clamp(sum(scores[a] * w for a, w in WEIGHTS[key].items()))

    strengths, weak, recs = [], [], []
    if key == TECHNICAL:
        if scores["knowledge"] >= 70:
            strengths.append("Showed solid command of the technical concepts")
        if depth >= 65:
            strengths.append("Went beyond definitions into how things work")
        if with_reason >= 0.5:
            strengths.append("Explained reasoning and trade-offs")
        if scores["knowledge"] < 60:
            weak.append("Gaps in core technical concepts")
            recs.append("Revisit the fundamentals behind each topic you were asked about and practise explaining them in 60 seconds.")
        if depth < 60:
            weak.append("Answers stayed at definition level")
            recs.append("After the definition, add how it works internally, one trade-off and one real example.")
        missed = [m for a in analyses for m in (a.get("mistakes") or [])][:3]
        if missed:
            weak.append("Missed or shaky points: " + "; ".join(missed[:2]))
        recs.append("Talk through your reasoning out loud: state the approach first, then the details, then the trade-offs.")
    else:
        if scores["ownership"] >= 70:
            strengths.append("Made clear what they personally contributed")
        if scores["specificity"] >= 65:
            strengths.append("Backed up resume items with concrete details")
        if with_outcome >= 0.5:
            strengths.append("Mentioned results and outcomes")
        if scores["ownership"] < 60:
            weak.append("Unclear personal contribution on projects and roles")
            recs.append("For every resume item, prepare one sentence starting with 'I' that says exactly what you built or decided.")
        if scores["impact"] < 60:
            weak.append("Few measurable results")
            recs.append("Attach a number to each project or role: users, speed-ups, accuracy, time saved.")
        if scores["specificity"] < 60:
            weak.append("Resume claims were not backed by details")
            recs.append("Be ready to explain the tech choices on your resume: why this tool, what else you considered.")
        recs.append("Use Situation, Action, Result for each experience and end with what you learned.")
    if not strengths and answered:
        strengths.append("Completed the round")
    if avg_len < 25:
        weak.append("Answers were short")
        recs.append("Aim for 45-90 seconds per answer.")
    if hedge >= 3:
        weak.append("Frequent hedging (maybe / I think)")
        recs.append("State your point first, then qualify it.")
    if filler_rate > 0.03:
        weak.append("Filler words (um, uh, like)")
        recs.append("Pause silently instead of using fillers.")

    per_q = []
    for i, e in enumerate(entries, 1):
        if not (e.get("answer") or "").strip():
            continue
        a = e.get("analysis") if isinstance(e.get("analysis"), dict) else {}
        main = a.get("accuracy") if key == TECHNICAL else a.get("ownership")
        parts = [main if isinstance(main, (int, float)) else a.get("depth", 3), a.get("depth", 3), a.get("relevance", 3), a.get("clarity", 3)]
        gaps = a.get("gaps") or []
        tip = ("Address: " + "; ".join(gaps[:2]) + ".") if gaps else "Add a concrete example and a measurable result."
        if key == TECHNICAL and a.get("mistakes"):
            tip = "Cover: " + "; ".join(a["mistakes"][:2]) + "."
        per_q.append({"index": i, "score": _clamp(sum(parts) / len(parts) * 20),
                      "feedback": a.get("summary") or "Answer recorded.", "better_answer_tip": tip})
    return {
        "scores": scores, "overall": overall, "strengths": strengths[:4], "weak_topics": weak[:4], "recommendations": recs[:5],
        "summary": "Automatic estimate from answer length, specificity and delivery signals (no LLM evaluation was available).",
        "per_question": per_q, "engine": "heuristic",
    }


# --------------------------------------------------------------------------- one round, LLM + fallback


def _topic_scores(entries: list[dict], per_q: list[dict]) -> list[dict]:
    by_index = {p["index"]: p["score"] for p in per_q}
    groups: dict[str, list[int]] = {}
    for i, e in enumerate(entries, 1):
        if e.get("topic") and i in by_index:
            groups.setdefault(e["topic"], []).append(by_index[i])
    return [{"label": t, "score": _clamp(sum(v) / len(v))} for t, v in groups.items()]


def evaluate_round(key: str, entries: list[dict], role: str, company: str | None) -> dict:
    """entries: the round's own entries, in order. Returns the section for the report."""
    answered = [e for e in entries if (e.get("answer") or "").strip()]
    out = {"key": key, "name": ROUND_NAMES[key], "questions_answered": len(answered)}
    if not answered:
        out.update({"overall": 0, "scores": {}, "strengths": [], "weak_topics": ["This round was not reached or no answers were given"],
                    "recommendations": [], "summary": "No answers were recorded in this round.", "topics": [], "per_question": [], "engine": None})
        return out

    base = _heuristic_round(key, entries)
    transcript = "\n\n".join(
        f"Q{i}{' (follow-up)' if e.get('is_followup') else ''} [{e.get('topic') or 'topic'}]: {e['question']}\n"
        f"A{i}: {(e.get('answer') or '(no answer)')[:1500]}"
        for i, e in enumerate(entries, 1)
    )
    axes = ", ".join(f'"{a}": 0' for a in ROUND_AXES[key])
    system = SYSTEM_PROMPT.format(rubric=_RUBRIC[key].format(role=role), axes=axes)
    prompt = f"Role: {role}\nCompany: {company or 'not specified'}\n\nTRANSCRIPT ({ROUND_NAMES[key]})\n{transcript}\n\nScore this round and return the JSON."

    result = dict(base)
    if llm_status()["configured"]:
        try:
            data = call_llm_json(system, prompt, max_tokens=2200)
            raw = data.get("scores") if isinstance(data.get("scores"), dict) else data
            scores = {a: _clamp(raw.get(a)) for a in ROUND_AXES[key]}
            if not any(scores.values()):
                raise ValueError("model returned no scores")
            result["scores"] = scores
            result["overall"] = _clamp(sum(scores[a] * w for a, w in WEIGHTS[key].items()))
            for k in ("strengths", "weak_topics", "recommendations"):
                val = data.get(k)
                if isinstance(val, list) and val:
                    result[k] = [str(x) for x in val][:6]
            result["summary"] = str(data.get("summary") or "")[:600] or result["summary"]
            pq = []
            for item in data.get("per_question") or []:
                if isinstance(item, dict):
                    pq.append({
                        "index": int(item.get("index") or 0),
                        "score": _clamp(item.get("score")),
                        "feedback": str(item.get("feedback") or "")[:400],
                        "better_answer_tip": str(item.get("better_answer_tip") or "")[:300],
                    })
            if pq:
                result["per_question"] = pq
            result["engine"] = "llm"
        except Exception as exc:  # noqa: BLE001
            log.warning("LLM evaluation of %s round failed (%s) - using the heuristic scorer", key, exc)

    # attach question / answer text so the report can show them, and per-topic scores
    for p in result["per_question"]:
        idx = p.get("index", 0)
        if 1 <= idx <= len(entries):
            e = entries[idx - 1]
            p["question"] = e["question"]
            p["answer"] = (e.get("answer") or "")[:500]
            p["topic"] = e.get("topic")
            p["is_followup"] = bool(e.get("is_followup"))
            a = e.get("analysis") if isinstance(e.get("analysis"), dict) else {}
            if key == TECHNICAL:
                p["correct"] = a.get("correct") or []
                p["mistakes"] = a.get("mistakes") or []
    result["topics"] = _topic_scores(entries, result["per_question"])
    out.update({k: result[k] for k in ("overall", "scores", "strengths", "weak_topics", "recommendations", "summary", "per_question", "topics", "engine")})
    return out


# --------------------------------------------------------------------------- the combined report


def generate_report(entries: list[dict], role: str = "", company: str | None = None) -> dict:
    """entries: [{question, answer, response_time, analysis, is_followup, round, topic}] in order."""
    by_round = {k: [e for e in entries if (e.get("round") or TECHNICAL) == k] for k in ROUND_ORDER}
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {k: pool.submit(evaluate_round, k, by_round[k], role, company) for k in ROUND_ORDER}
        rounds = [futures[k].result() for k in ROUND_ORDER]

    reached = [r for r in rounds if r["questions_answered"] > 0]
    overall = _clamp(sum(r["overall"] for r in reached) / len(reached)) if reached else 0

    def avg_axis(axis: str):
        vals = [r["scores"][axis] for r in reached if axis in r["scores"]]
        return _clamp(sum(vals) / len(vals)) if vals else 0

    tech = next((r for r in rounds if r["key"] == TECHNICAL and r["questions_answered"]), None)
    res = next((r for r in rounds if r["key"] == RESUME and r["questions_answered"]), None)
    structure_vals = [v for v in ((tech or {}).get("scores", {}).get("problem_solving"), (res or {}).get("scores", {}).get("ownership")) if v is not None]

    response_times = [e.get("response_time") for e in entries if e.get("response_time")]
    summary_bits = [f"Overall {overall}/100."] + [f"{r['name']} ({r['overall']}/100): {r['summary']}" for r in reached]
    legacy_pq = []
    for r in rounds:
        legacy_pq += [{**p, "round": r["key"]} for p in r["per_question"]]

    return {
        "rounds": rounds,
        "overall": overall,
        # legacy / dashboard-compatible fields
        "technical": (tech or res or {}).get("scores", {}).get("knowledge", (res or {}).get("scores", {}).get("specificity", 0)),
        "communication": avg_axis("communication"),
        "confidence": avg_axis("confidence"),
        "grammar": avg_axis("grammar"),
        "clarity": avg_axis("clarity"),
        "relevance": avg_axis("relevance"),
        "structure": _clamp(sum(structure_vals) / len(structure_vals)) if structure_vals else 0,
        "strengths": [s for r in reached for s in r["strengths"][:2]][:6],
        "weak_topics": [s for r in rounds for s in r["weak_topics"][:2]][:6],
        "recommendations": [s for r in reached for s in r["recommendations"][:3]][:6],
        "summary": " ".join(summary_bits)[:1200],
        "per_question": legacy_pq,
        "questions_answered": sum(r["questions_answered"] for r in rounds),
        "avg_response_time": f"{int(sum(response_times) / len(response_times))}s" if response_times else None,
        "engine": "llm" if any(r.get("engine") == "llm" for r in reached) else "heuristic",
    }
