"""
Interview brain — understands the candidate's last answer and decides what Aria says next.

The interview has two rounds (see interview_plan.py): Round 1 technical, Round 2 resume. After every answer:

    interview_plan.locate()   CODE decides the rails: which topic we are on, whether a follow-up is still
                              allowed (budget / fair share), which topic comes next, whether a new round starts.
    rag.retrieve_context()    FAQ snippets for the topic being asked about (not just the last answer).
    one LLM call              analyses the answer (relevance / clarity / depth / technical accuracy / ownership),
                              then writes ONE question: a follow-up on something the candidate just said, or the
                              first question of the next topic. Code validates it (allowed? repeated?) and may
                              ask the model to try again.
    heuristic engine          if there is no key / the call fails, a template engine that is topic-aware and
                              rotates its wording, so even offline the interview does not repeat itself.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.core import interview_plan as ip
from app.core.config import settings
from app.core.llm import call_llm_json, llm_status
from app.core.question_bank import get_relevant_questions
from app.core.rag import RetrievalResult, retrieve_context

log = logging.getLogger("question_engine")

INTERVIEWER_NAME = "Aria"

CLOSING_LINE = (
    "Thank you, that brings us to the end of both rounds. You gave me a lot to work with. "
    "I'll put together your feedback report now, with a section for each round."
)

SYSTEM_PROMPT = f"""You are {INTERVIEWER_NAME}, a warm but sharp interviewer running a LIVE spoken mock interview. \
Your words are read aloud by a text-to-speech voice, so write exactly how a person talks: plain sentences, no \
markdown, no lists, no emojis, no quotes around things.

The interview has TWO ROUNDS:
  ROUND 1 TECHNICAL - test real technical knowledge: the technologies and fundamentals someone in this job profile must know.
  ROUND 2 RESUME - go through the candidate's resume item by item (every job, project, ...), asking about what THEY did.
The system tells you the current round, the topic of the last question, the NEXT topic, and whether a follow-up is allowed. \
Do two jobs and return them in one JSON object.

JOB 1 - understand the candidate's MOST RECENT answer (null if there is none yet):
  relevance (1-5): did it answer what was asked?
  clarity (1-5): organised, easy to follow?
  depth (1-5): specifics, reasoning, numbers, trade-offs vs vague generalities?
  accuracy (1-5): ROUND 1 only - is what they said technically correct and complete? Judge honestly; 3 if unsure. null in round 2.
  ownership (1-5): ROUND 2 only - do they make clear what THEY personally did, with specifics? null in round 1.
  correct: ROUND 1 - up to 3 short phrases of what they got right.
  mistakes: ROUND 1 - up to 3 short phrases of anything wrong, missing or misleading. Empty list if none.
  key_points: up to 3 short phrases of what they actually said.
  claims_to_probe: up to 2 specific things they said that deserve a deeper question.
  gaps: up to 3 things missing (e.g. "no measurable outcome", "did not explain how indexing works").
  summary: one short sentence describing the answer.

JOB 2 - choose the next move and write the next spoken question:
  decision = "follow_up" : stay on the SAME topic and dig into ONE specific thing the candidate just said. Quote or clearly \
refer to their own words ("You said X - ..."). Go one level deeper: why, how it works, a trade-off, a failure case, numbers, \
their own role. In round 1, if they said something wrong or shaky, ask a question that exposes it instead of lecturing.
  decision = "new_topic" : the topic is covered, or follow-ups are not allowed. Write the first question about the NEXT topic. \
Start with a very short natural bridge that refers to what they just said (under 10 words, e.g. "Good, that covers caching."), then ask.
  decision = "reask"     : only if the answer was empty or completely off-topic and follow-ups are allowed: re-ask more simply.
  decision = "end"       : only when the NEXT topic is NONE (the interview is over). Set "question" to "".
WHEN THE CANDIDATE'S MESSAGE IS NOT AN ANSWER (read this before choosing a decision):
  - If they ask YOU something (to repeat or explain the question, what you mean, whether they may do something, which language, \
how long this takes), reply to it first in ONE short, honest sentence, then re-ask the SAME question in simpler words. \
decision = "reask" (when follow-ups are allowed). Do not move to another topic and do not treat it as a wrong answer.
  - The interview is held in ENGLISH ONLY: speech recognition, the interviewer voice and the report are English. If they ask to \
answer in another language, say so kindly, tell them a short answer in simple English is fine, then re-ask the same question.
  - If they say they do not know or have not used it: be encouraging, then ask a much simpler, more basic version of the SAME \
topic once (decision = "reask"). If this was already a simpler re-ask, use new_topic with a short kind bridge instead.
  - If the answer is completely unrelated to the question, say in a few words that it did not address the question, then re-ask it \
once. Never praise it, and never pretend it was an answer.
  - A reply to the candidate plus the question may use up to about 60 words in these cases.
Rules:
  - Ask exactly ONE question, at most about 40 words. Never praise lavishly.
  - If follow-ups are NOT allowed you MUST use new_topic (or end). If they ARE allowed, prefer follow_up unless the answer \
already covered the topic thoroughly with specifics.
  - Every question must be clearly different, in subject AND wording, from the ALREADY ASKED list. Never repeat or lightly reword one.
  - ROUND 1 questions are real technical questions (explain a concept, how something works, trade-offs, a small scenario, \
debugging, design) matched to the stated difficulty. Not "tell me about a time" questions, and not asking for code to be read aloud.
  - ROUND 2 questions must use the specific facts in RESUME FACTS (names, companies, technologies, bullet points). \
Cover what is written there that has not been discussed yet; do not ask generic questions.
  - Do NOT add greetings, introductions or round announcements - the system adds those.
  - used_sources: numbers of the reference items you used (empty list if none). Use reference items only for ideas about what \
interviewers look for; never copy one word for word and never mention a database.

Return ONLY this JSON object:
{{"analysis": {{"relevance": 1-5, "clarity": 1-5, "depth": 1-5, "accuracy": 1-5 or null, "ownership": 1-5 or null, \
"correct": [], "mistakes": [], "key_points": [], "claims_to_probe": [], "gaps": [], "summary": ""}} or null if no answer yet,
 "decision": "follow_up" | "new_topic" | "reask" | "end",
 "question": "...",
 "used_sources": []}}"""


@dataclass
class TurnResult:
    question: str | None  # exactly what Aria says (bridge/transition included)
    finished: bool = False
    is_followup: bool = False
    decision: str = "new_topic"
    analysis: dict | None = None
    sources: list[dict] = field(default_factory=list)
    rag_backend: str = ""
    engine: str = "llm"  # "llm" | "heuristic"
    engine_note: str | None = None
    closing: str | None = None
    round: str = ip.TECHNICAL
    topic: str | None = None
    round_changed: bool = False


class _Rejected(Exception):
    """The model answered, but its question breaks a rule (repeat / not allowed). Worth one retry."""


# --------------------------------------------------------------------------- context helpers


def _resume_context(resume) -> dict:
    data = (getattr(resume, "parsed_data", None) or {}) if resume else {}
    return {
        "skills": data.get("key_skills") or [],
        "projects": data.get("notable_projects") or [],
        "level": data.get("experience_level"),
        "summary": data.get("summary"),
        "data": data,
    }


def _norm_tokens(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", text.lower()) if len(t) > 3}


def _too_similar(q: str, asked: list[str]) -> bool:
    a = _norm_tokens(q)
    if not a:
        return False
    for other in asked:
        b = _norm_tokens(other)
        if b and len(a & b) / max(1, min(len(a), len(b))) >= 0.7:
            return True
    return False


def _clip(text: str | None, n: int = 900) -> str:
    text = (text or "").strip()
    return text if len(text) <= n else text[:n] + " ..."


def _clip_words(text: str, n: int) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    if len(text) <= n:
        return text.rstrip(".;, ")
    return text[:n].rsplit(" ", 1)[0].rstrip(".;,:- (")


def _join(items: list[str]) -> str:
    items = [i for i in items if i]
    return items[0] if len(items) == 1 else (", ".join(items[:-1]) + " and " + items[-1]) if items else ""


def _first_name(name: str | None) -> str | None:
    return name.split()[0] if name and name.strip() else None


def _short(slot: ip.Slot) -> str:
    return slot.label.split(":", 1)[-1].strip() if ":" in slot.label else slot.label


def _intro(role: str, company: str | None, candidate_name: str | None, interviewer: str = INTERVIEWER_NAME) -> str:
    who = f"Hi {_first_name(candidate_name)}, " if _first_name(candidate_name) else "Hi, "
    at = f" at {company}" if company else ""
    return (
        f"{who}I'm {interviewer}, and I'll be interviewing you for the {role} role{at}. "
        "We'll have two rounds: first a technical round, then a round about your resume. Let's get started."
    )


def _round_transition(plan: ip.Plan, next_round: str) -> str:
    if next_round == ip.RESUME:
        if plan.has_resume_items:
            return ("That wraps up the technical round. Now for round two, the resume round. "
                    "I'll go through your experience and your projects one by one.")
        return ("That wraps up the technical round. Now for round two. I don't have resume details for you, "
                "so I'll ask about your background, your projects and your experience.")
    return ""


# --------------------------------------------------------------------------- prompt


def _resume_overview(plan: ip.Plan) -> str:
    rp = plan.round(ip.RESUME)
    if not plan.has_resume_items:
        return "No resume details available - ask general background questions."
    return "\n".join(f"  - {s.prompt()}" for s in rp.slots)


def _build_user_prompt(role, company, candidate_name, ctx, plan: ip.Plan, d: ip.Directive, history, retrieval: RetrievalResult, note: str = "") -> str:
    convo = (
        "\n".join(
            f"[{ip.ROUND_NAMES[h.get('round') or ip.TECHNICAL]} | {h.get('topic') or 'topic'}"
            f"{' | follow-up' if h.get('is_followup') else ''}]\nQ{i + 1}: {h['question']}\n"
            f"A{i + 1}: {_clip(h.get('answer')) or '(no answer)'}"
            for i, h in enumerate(history[-8:], start=max(0, len(history) - 8))
        )
        or "None yet - this is the very first question."
    )
    asked = "\n".join(f"  - {h['question']}" for h in history) or "  (none)"

    if d.opening:
        mode = "OPENING: write the first question of ROUND 1 about the NEXT topic. decision = new_topic. analysis = null. No greeting."
        round_line = f"{ip.ROUND_NAMES[ip.TECHNICAL]} (round 1 of 2)"
    else:
        rk = d.round_key
        round_line = f"{ip.ROUND_NAMES[rk]} (round {ip.ROUND_ORDER.index(rk) + 1} of 2); questions used in this round: {d.round_asked} of {d.round_budget}"
        mode = ""

    nxt = d.next_slot
    if nxt is None:
        next_txt = "NONE - the interview is over; decision must be end and question empty."
    else:
        next_txt = nxt.prompt()
        if d.round_changes:
            next_txt += f"\n    (this starts {ip.ROUND_NAMES[d.next_round_key]}; the system speaks the round announcement, you just ask the question)"

    follow_txt = "YES - you may follow up (preferred when there is something specific to dig into)" if d.follow_allowed else "NO - you must use new_topic (or end)"
    if d.opening:
        follow_txt = "NO - this is the first question"
    lvl = {"basic": "basic - candidate is a student/fresher, keep it foundational", "intermediate": "intermediate", "advanced": "advanced - expect depth and trade-offs"}[plan.level]

    resume_block = ""
    if (d.next_round_key == ip.RESUME or d.round_key == ip.RESUME) and not d.opening:
        resume_block = f"\nRESUME FACTS (everything on the resume; Round 2 must cover all of it over time)\n{_resume_overview(plan)}\n"

    cur = d.slot.prompt() if d.slot else "none yet"
    return f"""CONTEXT
Candidate name: {candidate_name or "unknown"}
Target role: {role}
Target company: {company or "Not specified"}
Difficulty for technical questions: {lvl}
Skills on resume: {", ".join(ctx["skills"][:25]) or "unknown"}
Current round: {round_line}
{mode}
LAST QUESTION'S TOPIC: {cur}
Follow-up allowed: {follow_txt}  (follow-ups used on this topic so far: {d.followups_in_slot})
NEXT TOPIC: {next_txt}
Topics still to come in this round after the next one: {", ".join(d.remaining[1:]) or "none"}
{resume_block}
RETRIEVED REFERENCE (RAG: interview FAQs closest to the topic being asked about; optional inspiration)
{retrieval.prompt_block()}

ALREADY ASKED (do not repeat or reword any of these)
{asked}

RECENT CONVERSATION
{convo}
{note}
Now do JOB 1 and JOB 2 and return the JSON object."""


# --------------------------------------------------------------------------- heuristic analysis (offline)

_HEDGES = ("maybe", "i think", "i guess", "not sure", "kind of", "sort of", "probably", "i don't know", "um ", "uh ")
_TECH_WORDS = {
    "python", "java", "javascript", "typescript", "react", "node", "django", "flask", "fastapi", "sql", "postgresql",
    "mysql", "mongodb", "redis", "docker", "kubernetes", "aws", "azure", "gcp", "api", "rest", "graphql", "git",
    "tensorflow", "pytorch", "pandas", "numpy", "spring", "angular", "vue", "html", "css", "linux", "kafka", "firebase",
    "machine learning", "deep learning", "oop", "database", "cache", "microservices", "jwt", "websocket", "tailwind",
}


def heuristic_analysis(question: str, answer: str, ctx: dict, slot: ip.Slot | None = None, round_key: str = ip.TECHNICAL) -> dict:
    words = re.findall(r"\b\w+\b", answer or "")
    n = len(words)
    low = (answer or "").lower()
    has_numbers = bool(
        re.search(r"\d|%|\b(percent|twice|double|half|hundred|thousand|million|dozen|"
                  r"twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b", low)
    )
    hedges = sum(low.count(h) for h in _HEDGES)
    star = sum(1 for k in ("situation", "task", "action", "result", "because", "so that", "therefore", "as a result") if k in low)

    depth = 1 if n < 12 else 2 if n < 30 else 3 if n < 70 else 4
    if has_numbers and n >= 30:
        depth = min(5, depth + 1)
    clarity = max(1, min(5, 3 + (1 if star >= 2 else 0) - (1 if hedges >= 3 else 0) - (1 if n < 8 else 0)))
    q_tokens, a_tokens = _norm_tokens(question), _norm_tokens(answer or "")
    overlap = len(q_tokens & a_tokens) / max(1, len(q_tokens))
    relevance = 1 if n < 4 else max(2, min(5, 2 + round(overlap * 6) + (1 if n > 40 else 0)))

    mentioned = _mentioned_terms(answer or "", ctx)
    gaps = []
    out: dict = {}
    if round_key == ip.TECHNICAL and slot is not None and slot.keywords:
        hits = [k for k in slot.keywords if k in low]
        miss = [k for k in slot.keywords if k not in low and re.fullmatch(r"[a-z ]{4,}", k)]
        accuracy = 1 if n < 4 else (2 if not hits else 3 if len(hits) == 1 else 4 if len(hits) == 2 else 5)
        if n < 15:
            accuracy = min(accuracy, 2)
        out.update({"accuracy": accuracy, "ownership": None, "correct": hits[:3],
                    "mistakes": [f"did not touch on {m}" for m in miss[:2]] if accuracy <= 3 else []})
        if miss and accuracy <= 3:
            gaps.append(f"did not cover {miss[0]}")
    else:
        owns = len(re.findall(r"\b(i|my)\b", low))
        we = len(re.findall(r"\b(we|our|team)\b", low))
        ownership = 1 if n < 4 else max(1, min(5, 2 + (1 if owns >= 2 else 0) + (1 if has_numbers else 0) + (1 if owns > we else 0) - (1 if n < 20 else 0)))
        out.update({"accuracy": None, "ownership": ownership, "correct": [], "mistakes": []})
        if not re.search(r"\b(i|my)\b", low):
            gaps.append("unclear what their own role was")
    if not has_numbers:
        gaps.append("no measurable outcome" if round_key == ip.RESUME else "no concrete example or number")
    if n < 30:
        gaps.append("answer was brief and lacked detail")
    out.update({
        "relevance": relevance,
        "clarity": clarity,
        "depth": depth,
        "key_points": mentioned[:3],
        "claims_to_probe": mentioned[:2],
        "gaps": gaps[:3],
        "summary": (f"Talked about {', '.join(mentioned[:3])}" if mentioned else "General answer")
        + f" in {n} words" + ("" if depth >= 3 else ", without much detail") + ".",
    })
    return out


def _mentioned_terms(answer: str, ctx: dict) -> list[str]:
    low = answer.lower()
    found: list[str] = []
    for s in list(ctx.get("skills") or []) + list(_TECH_WORDS):
        s_l = s.lower()
        if len(s_l) >= 2 and re.search(rf"(?<![a-z0-9]){re.escape(s_l)}(?![a-z0-9])", low) and s_l not in [f.lower() for f in found]:
            found.append(s)
    return found


_VERB_PHRASE = re.compile(
    r"\b(?:used|using|built|build|implemented|created|designed|worked on|worked with|developed|wrote|handled|managed|led|deployed|optimi[sz]ed)\s+"
    r"(?:a |an |the |my |our |some )?([a-z0-9][a-z0-9 \-/+.#]{3,38}?)(?=[,.;]| and | to | for | in | on | with | by | so | because |$)",
    re.I,
)


def _salient(answer: str, ctx: dict, slot: ip.Slot | None) -> str | None:
    """Something specific the candidate said that a follow-up can quote."""
    low = (answer or "").lower()
    if slot is not None and slot.kind in ("skill", "fundamentals"):
        # a concept from this topic that the candidate actually used ("generator", "index", "load balancer")
        for kw in slot.keywords:
            if re.fullmatch(r"[a-z ]{4,}", kw) and re.search(rf"(?<![a-z]){re.escape(kw)}", low):
                return kw
    terms = _mentioned_terms(answer or "", ctx)
    if slot is not None:
        terms = [t for t in terms if t.lower() not in _short(slot).lower()] or terms
    if terms:
        return terms[0]
    m = _VERB_PHRASE.search(answer or "")
    if m:
        return m.group(1).strip()
    return None


# --------------------------------------------------------------------------- heuristic questions (offline)

_BRIDGES = ["Okay, thanks.", "Got it.", "Alright.", "That makes sense.", "Good.", "Thanks for explaining.", "I see.", "Understood."]

# (with a quotable phrase, without)
_TECH_FOLLOW = [
    ("You mentioned {p}. How does that actually work under the hood?", "Can you go one level deeper? How does that actually work under the hood?"),
    ("What are the trade-offs of {p}, and when would you avoid it?", "What are the trade-offs of that approach, and when would you avoid it?"),
    ("Suppose {p} breaks in production. How would you track down the cause?", "Suppose that breaks in production. How would you track down the cause?"),
    ("How would you test that {p} behaves correctly?", "How would you test that this behaves correctly?"),
    ("Can you give me a concrete example where you used {p}?", "Can you give me one concrete example where you applied this yourself?"),
    ("How would your approach with {p} change if the load grew a hundred times?", "How would your approach change if the load or data grew a hundred times?"),
]
_RESUME_FOLLOW = [
    ("You said {p}. What exactly was your own part in that, as opposed to the team's?", "What exactly was your own part in that, as opposed to the team's?"),
    ("What was the hardest problem you ran into on {s}, and how did you solve it?", None),
    ("What was the measurable result of {s}? Any numbers you can share?", None),
    ("Why did you choose {p} for this, and what else did you consider?", "Which technical decision in {s} are you most proud of, and why?"),
    ("Looking back at {s}, what would you do differently today?", None),
    ("How did you test or verify that {s} actually worked?", None),
]


def _bullet_discussed(bullet: str, history: list[dict]) -> bool:
    bt = _norm_tokens(bullet)
    if not bt:
        return True
    text = " ".join((h.get("question") or "") + " " + (h.get("answer") or "") for h in history)
    tt = _norm_tokens(text)
    return len(bt & tt) / len(bt) >= 0.5


def _heuristic_main(slot: ip.Slot, role: str, history: list[dict], asked: list[str]) -> str:
    f = slot.facts or {}
    cands: list[str] = []
    if slot.kind in ("skill", "fundamentals"):
        cands = list(slot.openers)
        cands.append(f"Let's move on to {slot.label.lower()}. What are the key ideas someone in a {role} role has to understand here?")
    elif slot.kind == "experience":
        role_, comp, dur = f.get("role"), f.get("company"), f.get("duration")
        who = f"as {role_} at {comp}" if role_ and comp else (f"as {role_}" if role_ else f"at {comp}" if comp else "in that role")
        when = f" ({dur})" if dur else ""
        first = (f.get("highlights") or [None])[0]
        with_b = f" Your resume says: {_clip_words(first, 110)}. Walk me through that, and tell me what else you were responsible for." if first else " What were you mainly responsible for there?"
        cands = [
            f"Let's talk about your experience {who}{when}.{with_b}",
            f"Tell me more about the work you did {who}. What did a typical week look like?",
        ]
    elif slot.kind == "project":
        tech = f.get("technologies") or []
        t = f" I see you used {_join(tech[:3])}." if tech else ""
        cands = [
            f"Let's talk about your project {f.get('name', _short(slot))}.{t} What problem does it solve, and what was your part in building it?",
            f"Tell me about {f.get('name', _short(slot))}. How is it put together and why did you build it that way?",
        ]
    elif slot.kind == "education":
        item = _clip_words((f.get("items") or ["your studies"])[0], 80)
        cands = [f"You studied {item}. Which subject or project from your studies has been the most useful for this {role} role, and why?"]
    elif slot.kind == "certification":
        items = f.get("items") or []
        first = _clip_words(items[0], 70) if items else "your certifications"
        cands = [f"You list {first}. What did you learn there that you have actually used since?"]
    elif slot.kind == "achievement":
        items = f.get("items") or []
        first = _clip_words(items[0], 90) if items else "your achievements"
        cands = [f"On your resume you mention {first}. Tell me about that and what your role in it was."]
    else:
        generic = {
            "Your most significant project": "Tell me about the most significant project you have worked on. What was it, what was your role, and what did you build it with?",
            "Previous experience": "Tell me about any previous experience you have, such as an internship, a job, freelance or volunteer work, and what you did there.",
            "A hard problem you solved": "Describe a hard problem you ran into while building something, and how you worked your way through it.",
            "Teamwork and motivation": f"How do you work with other people on a team, and what draws you to this {role} role?",
        }
        cands = [generic.get(slot.label, f"Tell me about {slot.label.lower()}.")]
    for c in cands:
        if not _too_similar(c, asked):
            return c
    return f"Let's come at {_short(slot).lower()} from a different angle. What would you say you know best about it, and what is still shaky?"


def _heuristic_follow(slot: ip.Slot, d: ip.Directive, history: list[dict], ctx: dict, asked: list[str], analysis: dict, answer: str) -> str | None:
    phrase = _salient(answer, ctx, slot)
    s = _short(slot)
    quoted = phrase
    n = d.followups_in_slot
    options: list[str] = []

    if d.round_key == ip.TECHNICAL:
        for with_p, without in _TECH_FOLLOW[n % len(_TECH_FOLLOW):] + _TECH_FOLLOW[: n % len(_TECH_FOLLOW)]:
            options.append(with_p.format(p=quoted) if quoted else without)
    else:
        facts = slot.facts or {}
        bullets = [b for b in (facts.get("highlights") or []) if not _bullet_discussed(b, history)]
        if bullets and n % 2 == 0:
            options.append(f"Your resume says: {_clip_words(bullets[0], 140)}. Walk me through how you actually did that.")
        tech = [t for t in (facts.get("technologies") or []) if not _bullet_discussed(t, history)]
        if tech:
            options.append(f"I see {tech[0]} on this one. Why did you choose it, and what else did you consider?")
        for with_p, without in _RESUME_FOLLOW[n % len(_RESUME_FOLLOW):] + _RESUME_FOLLOW[: n % len(_RESUME_FOLLOW)]:
            if "{p}" in with_p and not quoted:
                if without:
                    options.append(without.format(s=s))
                continue
            options.append(with_p.format(p=quoted, s=s))
        if bullets:
            options.append(f"Your resume says: {_clip_words(bullets[0], 140)}. Walk me through how you actually did that.")
    for o in options:
        if not _too_similar(o, asked):
            return o
    return None


_CLARIFY = re.compile(
    r"(^(can|could|may|might|should|shall|will|would|do|does|is|are) (i|we|you|it|this|that|the question)\b|^(how long|how many|which language|what language)\b|"
    r"what do you mean|could you (please )?(repeat|rephrase|explain|clarify)|can you (please )?(repeat|rephrase|explain|clarify)|"
    r"come again|pardon|i (did not|didn't|do not|don't|couldn't|could not) (understand|get|catch|hear)|say that again|which (one|part))", re.I)
_UNKNOWN = re.compile(
    r"(\bi (do not|don't|dont) know\b|\bno idea\b|\bnot sure\b|\bnot familiar\b|\bnever (used|worked|heard|done)\b|"
    r"\b(haven't|have not|hasn't) (used|worked|done|learned|studied)\b|\bcan't (recall|remember)\b|\bcannot (recall|remember)\b|\bskip (this|it)\b|^pass\.?$)", re.I)


_LANG = re.compile(r"\b(hindi|tamil|telugu|bengali|marathi|gujarati|punjabi|kannada|malayalam|urdu|spanish|french|german|arabic|chinese|language)\b", re.I)


def _candidate_signal(answer: str) -> str | None:
    """Text-only check (speech recognition drops question marks): did the candidate ask us something or say they do not know?"""
    text = (answer or "").strip()
    n = len(re.findall(r"\b\w+\b", text))
    if n <= 30 and (_CLARIFY.search(text) or (text.endswith("?") and n <= 20)):
        return "clarify"
    if n <= 40 and _UNKNOWN.search(text):
        return "unknown"
    return None


def _answer_kind(answer: str, analysis: dict, round_key: str, slot: ip.Slot | None) -> str:
    """Classify what the candidate actually did, so the follow-up responds to that instead of a fixed template.

    clarify  - they asked us something / did not understand the question
    unknown  - they said they do not know / have not used it
    offtopic - technical round only: an answer that never touches the topic (no topic keyword, low relevance)
    weak     - an attempt that missed key points
    ok       - everything else
    """
    text = (answer or "").strip()
    n = len(re.findall(r"\b\w+\b", text))
    if n <= 30 and (_CLARIFY.search(text) or (text.endswith("?") and n <= 20)):
        return "clarify"
    if n <= 40 and _UNKNOWN.search(text):
        return "unknown"
    if round_key == ip.TECHNICAL and slot is not None and slot.keywords:
        if n >= 3 and not analysis.get("correct") and (analysis.get("accuracy") or 0) <= 2 and (analysis.get("relevance") or 0) <= 2:
            return "offtopic"
        if n >= 8 and (analysis.get("accuracy") or 0) <= 3 and analysis.get("mistakes"):  # a real attempt, not a one-liner
            return "weak"
    return "ok"


def _gap_probe(analysis: dict, slot: ip.Slot, asked: list[str], quoted: str | None = None) -> str | None:
    """For a partly right answer: ask about the specific concept it missed instead of a generic "go deeper"."""
    for m in analysis.get("mistakes") or []:
        term = re.sub(r"^did not touch on\s+", "", m).strip()
        if term:
            q = (f"You mentioned {quoted}. Let's look at one gap: how does {term} relate to {_short(slot)}?" if quoted
                 else f"Let's focus on one piece. How does {term} relate to {_short(slot)}?")
            if not _too_similar(q, asked):
                return q
    return None


def _heuristic_turn(plan: ip.Plan, d: ip.Directive, role, company, ctx, history, candidate_name, retrieval: RetrievalResult, analysis_override: dict | None = None, note: str | None = None) -> TurnResult:
    asked = [h["question"] for h in history]
    base = dict(engine="heuristic", engine_note=note, rag_backend=retrieval.backend)

    if d.opening:
        q = f"{_intro(role, company, candidate_name, plan.interviewer_name)} {_heuristic_main(d.next_slot, role, history, asked)}"
        return TurnResult(question=q, decision="new_topic", round=ip.TECHNICAL, topic=d.next_slot.label, **base)

    last = history[-1]
    answer = last.get("answer") or ""
    analysis = analysis_override or heuristic_analysis(last["question"], answer, ctx, d.slot, d.round_key)
    n_words = len(re.findall(r"\b\w+\b", answer))

    kind = _answer_kind(answer, analysis, d.round_key, d.slot)
    skip_follow = False
    if d.slot is not None and d.follow_allowed and kind in ("clarify", "unknown", "offtopic"):
        short = _short(d.slot)
        retry = not last.get("is_followup")
        if kind == "clarify":
            lead = "This interview is held in English, so a short answer in simple English is fine. " if _LANG.search(answer) else "Sure. "
            q = (lead + f"Let me put it more simply. In {short}, what is the core idea, and where would you use it?"
                 if d.round_key == ip.TECHNICAL else lead + f"Just tell me briefly what you worked on in {short} and what your part was.")
        elif kind == "unknown" and retry:
            q = (f"That's fine, not everyone has used every topic. Let's start from the basics: what do you think {short} is for, even roughly?"
                 if d.round_key == ip.TECHNICAL else f"That's okay. Pick any one thing you did in {short} and describe it in a sentence or two.")
        elif kind == "offtopic" and retry:
            q = f"I think that went in a different direction. My question was about {short}. Could you answer that directly, even briefly?"
        else:
            q = None  # second miss on the same topic: stop pushing and move on
            skip_follow = True
        if q and not _too_similar(q, asked):
            return TurnResult(question=q, decision="reask", is_followup=True, analysis=analysis,
                              round=d.round_key, topic=d.slot.label, **base)
        skip_follow = True

    if d.slot is not None and d.follow_allowed and not skip_follow:
        if kind == "weak":
            gq = _gap_probe(analysis, d.slot, asked, _salient(answer, ctx, d.slot))
            if gq:
                return TurnResult(question=gq, decision="follow_up", is_followup=True, analysis=analysis,
                                  round=d.round_key, topic=d.slot.label, **base)
        if n_words < 4 and not last.get("is_followup"):
            simple = (f"No problem, let me ask it more simply. In your own words, what is {_short(d.slot)} used for?"
                      if d.round_key == ip.TECHNICAL else
                      f"No problem. Just tell me briefly what you did in {_short(d.slot)}.")
            return TurnResult(question=simple, decision="reask", is_followup=True, analysis=analysis,
                              round=d.round_key, topic=d.slot.label, **base)
        q = _heuristic_follow(d.slot, d, history, ctx, asked, analysis, answer)
        if q:
            return TurnResult(question=q, decision="follow_up", is_followup=True, analysis=analysis,
                              round=d.round_key, topic=d.slot.label, **base)

    if d.next_slot is None:
        return TurnResult(question=None, finished=True, closing=CLOSING_LINE, analysis=analysis, decision="end",
                          round=d.round_key, topic=d.slot.label if d.slot else None, **base)

    bridge = _BRIDGES[len(history) % len(_BRIDGES)]
    main = _heuristic_main(d.next_slot, role, history, asked)
    if d.round_changes:
        q = f"{_round_transition(plan, d.next_round_key)} {main}"
    else:
        q = f"{bridge} {main}"
    items = retrieval.items[:1] if d.next_round_key == ip.TECHNICAL else []  # FAQ grounding only makes sense for technical topics
    return TurnResult(question=q, decision="new_topic", analysis=analysis, sources=items,
                      round=d.next_round_key, topic=d.next_slot.label, round_changed=d.round_changes, **base)


# --------------------------------------------------------------------------- LLM turn


def _llm_turn(plan, d, role, company, candidate_name, ctx, history, retrieval) -> TurnResult:
    asked = [h["question"] for h in history]
    note = ""
    reason = ""
    analysis = None
    if history and d.follow_allowed:
        sig = _candidate_signal(history[-1].get("answer") or "")
        if sig == "clarify":
            note = "\nNOTE: the candidate's last message was a QUESTION or request addressed to you, not an answer. Reply to it briefly, then re-ask the same question more simply (decision reask).\n"
        elif sig == "unknown":
            note = "\nNOTE: the candidate said they do not know. Be encouraging and ask a simpler version of the same topic (decision reask).\n"
    for attempt in range(2):
        prompt = _build_user_prompt(role, company, candidate_name, ctx, plan, d, history, retrieval, note)
        out = call_llm_json(SYSTEM_PROMPT.replace(INTERVIEWER_NAME, plan.interviewer_name), prompt, max_tokens=900)
        analysis = _clean_analysis(out, d, history) or analysis
        try:
            return _validate_llm(out, plan, d, history, asked, retrieval, role, company, candidate_name)
        except _Rejected as exc:
            reason = str(exc)
            log.info("LLM question rejected (%s) - attempt %d", reason, attempt + 1)
            note = f"\nYOUR PREVIOUS ATTEMPT WAS REJECTED: {reason}. Write a different question that follows the rules.\n"
    # The model analysed the answer but could not produce an acceptable question: keep its analysis,
    # let the template engine word the question.
    return _heuristic_turn(plan, d, role, company, ctx, history, candidate_name, retrieval, analysis_override=analysis,
                           note=f"The AI model's question was rejected ({reason}); this question came from the offline engine.")


def _clean_analysis(out: dict, d: ip.Directive, history) -> dict | None:
    analysis = out.get("analysis") if history else None
    if not isinstance(analysis, dict):
        return None
    for key in ("relevance", "clarity", "depth"):
        try:
            analysis[key] = max(1, min(5, int(analysis.get(key, 3))))
        except (TypeError, ValueError):
            analysis[key] = 3
    for key in ("accuracy", "ownership"):
        v = analysis.get(key)
        try:
            analysis[key] = max(1, min(5, int(v))) if v is not None else None
        except (TypeError, ValueError):
            analysis[key] = None
    if d.round_key == ip.TECHNICAL:
        analysis["ownership"] = None
    else:
        analysis["accuracy"] = None
    for key in ("correct", "mistakes", "key_points", "claims_to_probe", "gaps"):
        v = analysis.get(key)
        analysis[key] = [str(x) for x in v][:3] if isinstance(v, list) else []
    analysis["summary"] = str(analysis.get("summary") or "")[:300]
    return analysis


def _validate_llm(out: dict, plan, d: ip.Directive, history, asked, retrieval, role, company, candidate_name) -> TurnResult:
    decision = str(out.get("decision") or "new_topic").lower().replace("-", "_")
    if decision not in ("follow_up", "new_topic", "reask", "end"):
        decision = "new_topic"
    question = re.sub(r"\s+", " ", str(out.get("question") or "")).strip()

    analysis = _clean_analysis(out, d, history)

    used = []
    for n in out.get("used_sources") or []:
        try:
            idx = int(n) - 1
            if 0 <= idx < len(retrieval.items):
                used.append(retrieval.items[idx])
        except (TypeError, ValueError):
            continue

    # --- the topic after this turn is decided by CODE, whatever the model wrote
    if not d.opening and history and d.slot is not None and d.follow_allowed:
        signal = _candidate_signal(history[-1].get("answer") or "")
        retry_ok = not history[-1].get("is_followup")
        if signal == "clarify" and decision == "new_topic":
            raise _Rejected("the candidate asked you something: answer it in one short sentence, then re-ask the same question in simpler words (decision reask)")
        if signal == "unknown" and retry_ok and decision == "new_topic":
            raise _Rejected("the candidate said they do not know: encourage them and ask a simpler version of the same topic (decision reask)")
        if signal in ("clarify", "unknown") and decision == "follow_up":
            decision = "reask"  # it is a re-ask, not a deeper probe
    if d.opening:
        decision = "new_topic"
    if decision in ("follow_up", "reask"):
        if not d.follow_allowed or d.slot is None:
            raise _Rejected("a follow-up is not allowed now; use new_topic for the NEXT topic")
        if not question:
            raise _Rejected("empty question")
        if _too_similar(question, asked):
            raise _Rejected("that question repeats an earlier one")
        return TurnResult(question=question, is_followup=True, decision=decision, analysis=analysis, sources=used,
                          rag_backend=retrieval.backend, engine="llm", round=d.round_key, topic=d.slot.label)

    # new_topic / end
    if d.next_slot is None:
        return TurnResult(question=None, finished=True, closing=CLOSING_LINE, decision="end", analysis=analysis,
                          rag_backend=retrieval.backend, engine="llm", round=d.round_key, topic=d.slot.label if d.slot else None)
    if decision == "end" or not question:
        raise _Rejected("the interview is not over: write a question about the NEXT topic")
    if _too_similar(question, asked):
        raise _Rejected("that question repeats an earlier one")
    prefix = ""
    if d.opening:
        prefix = _intro(role, company, candidate_name, plan.interviewer_name)
    elif d.round_changes:
        prefix = _round_transition(plan, d.next_round_key)
    full = f"{prefix} {question}".strip()
    return TurnResult(question=full, is_followup=False, decision="new_topic", analysis=analysis, sources=used,
                      rag_backend=retrieval.backend, engine="llm", round=d.next_round_key or ip.TECHNICAL,
                      topic=d.next_slot.label, round_changed=d.round_changes)


# --------------------------------------------------------------------------- main entry point


def _retrieve(db, role, company, d: ip.Directive, history, ctx) -> RetrievalResult:
    target = d.slot if (d.follow_allowed and d.slot is not None) else d.next_slot
    latest = (history[-1].get("answer") or "") if history else ""
    topic = f"{target.label} {target.focus[:90]}" if target else ""
    query = f"{topic} {latest[:300]}".strip() or " ".join(ctx["skills"][:6])
    retrieval = retrieve_context(role, company, query, k=3)
    if not retrieval.items and db is not None and company:
        try:  # last resort: tag-based retrieval over the Postgres question bank
            rows = get_relevant_questions(db, role_title=role, company=company, limit=3)
            retrieval = RetrievalResult(
                items=[{"id": r.id, "company": company, "topic": "question bank", "question": r.text, "looks_for": "", "score": 0.0} for r in rows],
                backend="tags",
            )
        except Exception:  # noqa: BLE001
            pass
    return retrieval


def next_turn(
    db: Session | None,
    role: str,
    company: str | None,
    resume,
    history: list[dict],
    candidate_name: str | None = None,
    plan: ip.Plan | None = None,
    force_next_round: bool = False,
    interviewer_name: str | None = None,
) -> TurnResult:
    """history: [{"question","answer","is_followup","round","topic"}, ...] oldest first; the last item holds
    the answer the candidate just gave. Empty history => produce the opening question."""
    plan = plan or ip.build_plan(role, company, resume)
    plan.interviewer_name = interviewer_name or plan.interviewer_name or INTERVIEWER_NAME
    ctx = _resume_context(resume)
    d = ip.locate(plan, history, force_next_round)
    retrieval = _retrieve(db, role, company, d, history, ctx)

    status = llm_status()
    if not status["configured"]:
        return _heuristic_turn(plan, d, role, company, ctx, history, candidate_name, retrieval, note=status["note"])
    try:
        return _llm_turn(plan, d, role, company, candidate_name, ctx, history, retrieval)
    except Exception as exc:  # noqa: BLE001 — never let a live interview dead-end
        log.warning("LLM turn failed (%s: %s) - using the offline engine for this turn", type(exc).__name__, exc)
        return _heuristic_turn(plan, d, role, company, ctx, history, candidate_name, retrieval,
                               note=f"The AI model call failed ({type(exc).__name__}: {str(exc)[:160]}); this question came from the offline engine.")
