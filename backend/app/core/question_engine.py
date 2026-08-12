# Phase 1 stub: a small static question set, cycled per session.
# This is deliberately isolated behind get_next_question() / generate_report()
# so Phase 3 (RAG + Llama 3.2 via Groq, per blueprint §4) can replace the
# internals here without any router or frontend changes.

BASE_QUESTIONS = [
    "Tell me about a project you're proud of and the problem it solved.",
    "Walk me through your role in that project — what did you build specifically?",
    "What was the hardest technical decision you made on it, and why?",
    "How would you improve that project if you revisited it today?",
    "Tell me about a time you had to debug something difficult.",
]

MAX_QUESTIONS = len(BASE_QUESTIONS)


def get_first_question(role: str, company: str | None) -> str:
    return BASE_QUESTIONS[0]


def get_next_question(order_index: int) -> str | None:
    """order_index is the number of questions already asked (0-based next index)."""
    if order_index >= MAX_QUESTIONS:
        return None
    return BASE_QUESTIONS[order_index]


def generate_report(transcript_entries: list[dict]) -> dict:
    """Very simple heuristic scoring as a Phase 1 placeholder for the
    LLM-based evaluation described in blueprint §4.5/§4.6."""
    answers = [e.get("answer") or "" for e in transcript_entries]
    answered = [a for a in answers if a.strip()]

    avg_len = sum(len(a.split()) for a in answered) / max(len(answered), 1)
    communication = min(95, int(40 + avg_len * 2))
    technical = min(95, int(50 + len(answered) * 8))
    confidence = min(95, int(45 + avg_len * 1.5))
    grammar = 85  # placeholder until real grammar scoring is wired up
    overall = int((technical + communication + confidence + grammar) / 4)

    response_times = [e.get("response_time") for e in transcript_entries if e.get("response_time")]
    avg_response = f"{int(sum(response_times) / len(response_times))}s" if response_times else "—"

    return {
        "technical": technical,
        "communication": communication,
        "confidence": confidence,
        "grammar": grammar,
        "overall": overall,
        "strengths": ["Answered every question", "Consistent response length"] if answered else [],
        "weak_topics": ["Provide more specific examples"] if avg_len < 15 else [],
        "recommendations": [
            "Practice structuring answers with a clear situation → action → result flow.",
            "Add concrete numbers or outcomes where possible.",
        ],
        "questions_answered": len(answered),
        "avg_response_time": avg_response,
    }
