from pathlib import Path

import pytest

from app.core import interview_plan as ip
from app.core import question_engine as qe
from app.core import rag
from app.core.extraction import _fallback_profile

SAMPLE = Path(__file__).with_name("sample_resume.txt").read_text()
LONG = ("I built the service with FastAPI and PostgreSQL, added an index and Redis caching because the queries were slow, "
        "and it cut response time from forty seconds to six seconds. I wrote the caching layer myself and tested it with pytest.")


def setup_function(_):
    rag.reset_index()


class R:  # tiny stand-in for a Resume row
    def __init__(self, data=None):
        self.parsed_data = data if data is not None else _fallback_profile(SAMPLE).model_dump()


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    """Default: no API key -> offline engine. Tests that need the LLM path switch it on."""
    monkeypatch.setattr(qe, "llm_status", lambda: {"provider": "claude", "configured": False, "note": "No ANTHROPIC_API_KEY found"})


def llm_on(monkeypatch, *payloads):
    """Configured LLM that returns the given payloads in order (the last one repeats)."""
    monkeypatch.setattr(qe, "llm_status", lambda: {"provider": "claude", "configured": True, "note": None})
    calls = []

    def fake(system, user, provider=None, max_tokens=0):
        calls.append(user)
        return payloads[min(len(calls) - 1, len(payloads) - 1)]

    monkeypatch.setattr(qe, "call_llm_json", fake)
    return calls


def run_interview(resume, answer=LONG, role="Backend Engineer", company="Amazon", name="Devansh Vats"):
    plan = ip.build_plan(role, company, resume)
    hist = []
    t = qe.next_turn(None, role, company, resume, hist, name, plan)
    for _ in range(60):
        hist.append(dict(question=t.question, answer=answer, is_followup=t.is_followup, round=t.round, topic=t.topic))
        t = qe.next_turn(None, role, company, resume, hist, name, plan)
        if t.finished:
            return plan, hist, t
    pytest.fail("interview never finished")


# ---------------------------------------------------------------- plan


def test_plan_has_two_rounds_with_10_technical_and_5_resume_questions():
    plan = ip.build_plan("Backend Engineer", "Amazon", R())
    assert [r.key for r in plan.rounds] == ["technical", "resume"]
    tech, res = plan.rounds
    assert len(tech.slots) == 5 and tech.budget == 10
    assert res.budget == 5 and len(res.slots) == 5 and plan.total == 15
    labels = [s.label for s in res.slots]
    assert any("Software Development Intern" in l for l in labels)
    assert any("Web Developer" in l for l in labels)  # the freelance role
    assert "Project: Smart Attendance System" in labels and "Project: CareerPrepAI" in labels
    assert "Education" in labels  # experience and projects come first; items beyond 5 are left out
    assert "Achievements and activities" not in labels


def test_resume_round_fills_to_five_with_followups_when_the_resume_is_short():
    plan = ip.build_plan("Backend Engineer", None, R({"projects": [{"name": "Solo Project"}], "key_skills": ["python"]}))
    res = plan.rounds[1]
    # one project allows 1 question + 3 follow-ups, so the round is 4 long rather than promising 5 it cannot ask
    assert len(res.slots) == 1 and res.budget == 1 + res.slots[0].max_follow
    two = ip.build_plan("Backend Engineer", None, R({"projects": [{"name": "A"}, {"name": "B"}], "key_skills": ["python"]})).rounds[1]
    assert two.budget == 5


def test_technical_topics_follow_the_role_and_the_candidates_stack():
    plan = ip.build_plan("Backend Engineer", None, R())
    labels = [s.label for s in plan.rounds[0].slots]
    assert "Python" in labels  # candidate's strongest relevant tech first
    assert any(s.kind == "fundamentals" for s in plan.rounds[0].slots)
    fe = ip.build_plan("React Developer", None, R({"key_skills": ["react", "css"]})).rounds[0].slots
    assert fe[0].label == "React"


def test_no_resume_still_gets_a_resume_round():
    plan = ip.build_plan("Data Analyst", None, None)
    assert not plan.has_resume_items and len(plan.rounds[1].slots) >= 3


# ---------------------------------------------------------------- offline engine


def test_offline_interview_runs_both_rounds_and_asks_everything():
    resume = R()
    plan, hist, last = run_interview(resume)
    assert last.closing and last.analysis  # the final answer is analysed too
    rounds = [h["round"] for h in hist]
    assert rounds == sorted(rounds, key=lambda r: ip.ROUND_ORDER.index(r))  # technical strictly before resume
    asked_topics = {h["topic"] for h in hist}
    for rp in plan.rounds:
        for slot in rp.slots:
            assert slot.label in asked_topics, f"never asked about {slot.label}"
    for rp in plan.rounds:
        assert sum(1 for h in hist if h["round"] == rp.key) <= rp.budget


def test_questions_are_not_repeated():
    _, hist, _ = run_interview(R())
    qs = [h["question"] for h in hist]
    assert len(set(qs)) == len(qs)
    for i, q in enumerate(qs):
        assert not qe._too_similar(q, qs[:i]), f"near-duplicate: {q}"


def test_followups_build_on_the_answer_and_are_capped_per_topic():
    _, hist, _ = run_interview(R())
    assert any(h["is_followup"] for h in hist)
    by_topic = {}
    for h in hist:
        by_topic[h["topic"]] = by_topic.get(h["topic"], 0) + (1 if h["is_followup"] else 0)
    assert max(by_topic.values()) <= 3
    follow = [h["question"] for h in hist if h["is_followup"]]
    assert any(("redis" in q.lower() or "fastapi" in q.lower() or "postgresql" in q.lower()) for q in follow), follow


def test_round_two_announced_once_and_resume_questions_use_resume_facts():
    _, hist, _ = run_interview(R())
    first_resume = next(h for h in hist if h["round"] == "resume")
    assert first_resume["question"].startswith("That wraps up the technical round")
    assert sum(1 for h in hist if "wraps up the technical round" in h["question"]) == 1
    text = " ".join(h["question"] for h in hist if h["round"] == "resume")
    for needle in ("Acme Technologies", "Smart Attendance System", "CareerPrepAI"):
        assert needle in text


def test_opening_question_greets_by_name_and_names_both_rounds():
    plan = ip.build_plan("Backend Engineer", "Amazon", R())
    t = qe.next_turn(None, "Backend Engineer", "Amazon", R(), [], "Devansh Vats", plan)
    assert t.engine == "heuristic" and "No ANTHROPIC_API_KEY" in t.engine_note
    assert "Devansh" in t.question and "Backend Engineer" in t.question and "Amazon" in t.question and "two rounds" in t.question
    assert t.round == "technical" and t.topic


def test_empty_answer_gets_one_reask_then_moves_on():
    resume = R()
    plan = ip.build_plan("Backend Engineer", None, resume)
    t = qe.next_turn(None, "Backend Engineer", None, resume, [], None, plan)
    hist = [dict(question=t.question, answer="", is_followup=False, round=t.round, topic=t.topic)]
    t2 = qe.next_turn(None, "Backend Engineer", None, resume, hist, None, plan)
    assert t2.decision == "reask" and t2.is_followup and t2.topic == t.topic
    hist.append(dict(question=t2.question, answer="", is_followup=True, round=t2.round, topic=t2.topic))
    t3 = qe.next_turn(None, "Backend Engineer", None, resume, hist, None, plan)
    assert t3.decision == "new_topic" and t3.topic != t.topic


def test_technical_analysis_scores_accuracy_from_topic_keywords():
    slot = ip.build_plan("Backend Engineer", None, R()).rounds[0].slots[0]  # Python
    good = qe.heuristic_analysis("q", "A list is mutable but a tuple is not, a dict maps keys, a generator is lazy and uses less memory than a list comprehension in a class", {}, slot, "technical")
    weak = qe.heuristic_analysis("q", "It is a programming language that people use", {}, slot, "technical")
    assert good["accuracy"] > weak["accuracy"] and good["ownership"] is None
    res = qe.heuristic_analysis("q", "I built the whole module myself and I tested it, then I cut the report time by 70 percent after my change to the query and my caching", {}, None, "resume")
    assert res["ownership"] >= 4 and res["accuracy"] is None


# ---------------------------------------------------------------- LLM path


def test_llm_followup_is_parsed_and_sources_mapped(monkeypatch):
    resume = R()
    plan = ip.build_plan("Backend Engineer", "Amazon", resume)
    first = qe.next_turn(None, "Backend Engineer", "Amazon", resume, [], "D", plan)  # offline opening
    hist = [dict(question=first.question, answer=LONG, is_followup=False, round=first.round, topic=first.topic)]
    llm_on(monkeypatch, {
        "analysis": {"relevance": 4, "clarity": 9, "depth": 0, "accuracy": 4, "ownership": 5, "key_points": ["used Redis"], "claims_to_probe": ["Redis"], "gaps": ["no metrics"], "summary": "ok"},
        "decision": "follow_up", "question": "You said Redis - what hit rate did the cache reach?", "used_sources": [1, 99, "x"],
    })
    t = qe.next_turn(None, "Backend Engineer", "Amazon", resume, hist, "D", plan)
    assert t.engine == "llm" and t.is_followup and t.topic == first.topic
    assert t.analysis["clarity"] == 5 and t.analysis["depth"] == 1  # clamped to 1-5
    assert t.analysis["ownership"] is None  # technical round: ownership is not scored
    assert t.analysis["accuracy"] == 4
    assert len(t.sources) <= 1  # bogus source indexes ignored


def test_llm_repeat_is_retried_once_with_feedback(monkeypatch):
    resume = R()
    plan = ip.build_plan("Backend Engineer", None, resume)
    t0 = qe.next_turn(None, "Backend Engineer", None, resume, [], None, plan)
    hist = [dict(question=t0.question, answer=LONG, is_followup=False, round=t0.round, topic=t0.topic)]
    calls = llm_on(monkeypatch,
                   {"decision": "follow_up", "question": t0.question, "analysis": None},
                   {"decision": "follow_up", "question": "What would break first if traffic doubled overnight?", "analysis": None})
    t = qe.next_turn(None, "Backend Engineer", None, resume, hist, None, plan)
    assert t.engine == "llm" and t.question.startswith("What would break first")
    assert len(calls) == 2 and "REJECTED" in calls[1]


def test_llm_followup_when_not_allowed_is_rejected_then_falls_back(monkeypatch):
    resume = R()
    plan = ip.build_plan("Backend Engineer", None, resume)
    t0 = qe.next_turn(None, "Backend Engineer", None, resume, [], None, plan)
    slot = plan.rounds[0].slots[0]
    hist = [dict(question=t0.question, answer=LONG, is_followup=False, round="technical", topic=slot.label)]
    # fill the topic's follow-up cap
    for i in range(slot.max_follow):
        hist.append(dict(question=f"extra probe number {i} about something different entirely {i * 7}", answer=LONG, is_followup=True, round="technical", topic=slot.label))
    llm_on(monkeypatch, {"decision": "follow_up", "question": "Another totally fresh probe about unrelated matters?", "analysis": {"relevance": 3, "clarity": 3, "depth": 3, "accuracy": 3}})
    t = qe.next_turn(None, "Backend Engineer", None, resume, hist, None, plan)
    assert t.engine == "heuristic" and t.decision == "new_topic" and t.topic != slot.label
    assert t.analysis and t.analysis["accuracy"] == 3  # the model's analysis of the answer is kept


def test_llm_new_topic_at_end_of_round_one_adds_the_round_announcement(monkeypatch):
    resume = R()
    plan = ip.build_plan("Backend Engineer", None, resume)
    last_slot = plan.rounds[0].slots[-1]
    hist = [dict(question=f"Q{i} about topic {i} distinct words {i * 13}", answer=LONG, is_followup=False, round="technical", topic=s.label)
            for i, s in enumerate(plan.rounds[0].slots)]
    llm_on(monkeypatch, {"decision": "new_topic", "question": "Tell me what you did at Acme Technologies day to day.", "analysis": {"relevance": 4, "clarity": 4, "depth": 4}})
    t = qe.next_turn(None, "Backend Engineer", None, resume, hist + [], None, plan)
    # the last technical topic only had its main question, so a follow-up would have been allowed; a new_topic jumps rounds
    assert t.round == "resume" and t.round_changed and t.question.startswith("That wraps up the technical round")
    assert t.topic == plan.rounds[1].slots[0].label and last_slot.label != t.topic


def test_llm_end_decision_finishes_only_after_last_topic(monkeypatch):
    resume = R()
    plan = ip.build_plan("Backend Engineer", None, resume)
    hist = []
    for rp in plan.rounds:
        for s in rp.slots:
            hist.append(dict(question=f"unique {len(hist)} {s.label} question words{len(hist) * 31}", answer=LONG, is_followup=False, round=rp.key, topic=s.label))
    llm_on(monkeypatch, {"decision": "end", "question": "", "analysis": {"relevance": 4, "clarity": 4, "depth": 4, "ownership": 4}})
    t = qe.next_turn(None, "Backend Engineer", None, resume, hist, None, plan)
    assert t.finished and t.closing and t.analysis["ownership"] == 4


def test_llm_exception_falls_back_with_a_visible_note(monkeypatch):
    monkeypatch.setattr(qe, "llm_status", lambda: {"provider": "groq", "configured": True, "note": None})
    def boom(*a, **k):
        raise TimeoutError("read timed out")
    monkeypatch.setattr(qe, "call_llm_json", boom)
    t = qe.next_turn(None, "Backend Engineer", None, R(), [], None)
    assert t.engine == "heuristic" and "TimeoutError" in t.engine_note


def test_json_parser_tolerates_fences_and_prose():
    from app.core.llm import parse_json_object
    assert parse_json_object('```json\n{"a": 1}\n```') == {"a": 1}
    assert parse_json_object('Sure! Here you go: {"a": 2} hope that helps') == {"a": 2}
    with pytest.raises(ValueError):
        parse_json_object("no json here")


# ---------------------------------------------------------------- resume extraction + report


def test_resume_parser_finds_every_experience_project_and_section():
    p = _fallback_profile(SAMPLE)
    assert [e.company for e in p.experience][0] == "Acme Technologies"
    assert p.experience[0].role == "Software Development Intern" and p.experience[0].duration.startswith("Jun 2024")
    assert len(p.experience[0].highlights) == 3 and "redis" in p.experience[0].technologies
    assert "Freelance" in p.experience[1].role
    assert [x.name for x in p.projects] == ["Smart Attendance System", "CareerPrepAI"]
    assert len(p.certifications) == 2 and len(p.achievements) == 2 and len(p.education) == 1
    assert p.notable_projects == ["Smart Attendance System", "CareerPrepAI"]


def test_report_has_two_sections(monkeypatch):
    from app.core import evaluation
    monkeypatch.setattr(evaluation, "llm_status", lambda: {"configured": False})
    plan, hist, _ = run_interview(R())
    entries = [{**h, "response_time": 10, "analysis": qe.heuristic_analysis(h["question"], h["answer"], {}, None, h["round"])} for h in hist]
    rep = evaluation.generate_report(entries, "Backend Engineer", "Amazon")
    assert [r["key"] for r in rep["rounds"]] == ["technical", "resume"]
    tech, res = rep["rounds"]
    assert set(tech["scores"]) >= {"knowledge", "depth", "problem_solving"}
    assert set(res["scores"]) >= {"ownership", "specificity", "impact"}
    assert tech["questions_answered"] + res["questions_answered"] == len(hist)
    assert tech["topics"] and res["topics"] and 0 <= rep["overall"] <= 100
    assert rep["overall"] == round((tech["overall"] + res["overall"]) / 2)
    assert all(p["question"] for p in tech["per_question"])


def test_report_marks_unreached_round(monkeypatch):
    from app.core import evaluation
    monkeypatch.setattr(evaluation, "llm_status", lambda: {"configured": False})
    entries = [dict(question="q", answer=LONG, is_followup=False, round="technical", topic="Python", analysis=None, response_time=5)]
    rep = evaluation.generate_report(entries, "Backend Engineer")
    assert rep["rounds"][1]["questions_answered"] == 0 and rep["overall"] == rep["rounds"][0]["overall"]


# ---- the offline engine must respond to WHAT the candidate said, not use a fixed "go deeper" template ----
def _kind(answer, keywords=("hash", "collision", "memory", "time complexity", "set")):
    from app.core import interview_plan as ip, question_engine as qe
    slot = ip.Slot(label="Data structures and algorithms", kind="fundamentals", focus="x", keywords=list(keywords))
    q = "How would you check whether a list of a million user IDs contains duplicates?"
    a = qe.heuristic_analysis(q, answer, {"skills": []}, slot, ip.TECHNICAL)
    return qe._answer_kind(answer, a, ip.TECHNICAL, slot), a, slot


def test_off_topic_answer_is_not_treated_as_good():
    assert _kind("are comfortable in Hindi")[0] == "offtopic"


def test_candidate_question_is_a_clarification():
    assert _kind("Can you repeat the question?")[0] == "clarify"
    assert _kind("What do you mean by duplicates?")[0] == "clarify"


def test_dont_know_is_detected():
    assert _kind("I don't know, I have never used that")[0] == "unknown"


def test_partial_answer_probes_the_missing_concept_not_generic_deeper():
    from app.core import question_engine as qe
    kind, analysis, slot = _kind("I would put them in a set and check the length against the list, which is quick enough "
                                 "for a million items and uses extra memory for the set itself in most cases.")
    assert kind in ("weak", "ok")
    if kind == "weak":
        q = qe._gap_probe(analysis, slot, [])
        assert q and "one level deeper" not in q


def test_good_answer_still_gets_normal_followup():
    kind, *_ = _kind("Use a hash set: insert each id, and if it is already present there is a collision so a duplicate exists. "
                     "Time complexity is O(n) and memory is O(n) for the set, versus sorting which is O(n log n) time.")
    assert kind == "ok"


# ---- LLM path: a candidate's question / "I don't know" must not be skipped past (screenshot: "can I answer in Hindi") ----
def _open_history(answer):
    resume = R()
    plan = ip.build_plan("Frontend Developer", None, resume)
    t = qe.next_turn(None, "Frontend Developer", None, resume, [], None, plan)
    return resume, plan, [dict(question=t.question, answer=answer, is_followup=False, round=t.round, topic=t.topic)]


def test_signal_detection_without_question_marks():
    for a in ("can I answer in Hindi", "Could you repeat that", "what do you mean by state", "how long is this round"):
        assert qe._candidate_signal(a) == "clarify", a
    for a in ("I don't know", "never used it", "not sure about that"):
        assert qe._candidate_signal(a) == "unknown", a
    assert qe._candidate_signal("Can be implemented with a hash map because lookups are constant time on average.") is None


def test_model_cannot_skip_a_candidate_question(monkeypatch):
    resume, plan, hist = _open_history("can I answer in Hindi")
    calls = []

    def fake(system, prompt, **kw):
        calls.append(prompt)
        if len(calls) == 1:  # the bad behaviour from the screenshot: ignore the question and change topic
            return {"analysis": {"relevance": 1, "clarity": 1, "depth": 1, "accuracy": 1, "correct": [], "mistakes": [], "key_points": [], "claims_to_probe": [], "gaps": [], "summary": "x"},
                    "decision": "new_topic", "question": "Okay, moving on. How do you handle accessibility?", "used_sources": []}
        return {"analysis": {"relevance": 1, "clarity": 1, "depth": 1, "accuracy": 1, "correct": [], "mistakes": [], "key_points": [], "claims_to_probe": [], "gaps": [], "summary": "x"},
                "decision": "reask", "question": "This interview is in English, but simple English is fine. In your own words, what is it used for?", "used_sources": []}

    monkeypatch.setattr(qe, "llm_status", lambda: {"provider": "groq", "configured": True, "note": None})
    monkeypatch.setattr(qe, "call_llm_json", fake)
    t = qe.next_turn(None, "Frontend Developer", None, resume, hist, None, plan)
    assert t.decision == "reask" and t.is_followup and "English" in t.question
    assert "QUESTION or request addressed to you" in calls[0]  # the model was told up front
    assert len(calls) == 2  # the skip was rejected and retried


def test_second_dont_know_moves_on(monkeypatch):
    resume, plan, hist = _open_history("I don't know")
    hist[0]["is_followup"] = True  # we already simplified once
    monkeypatch.setattr(qe, "llm_status", lambda: {"provider": "groq", "configured": True, "note": None})
    monkeypatch.setattr(qe, "call_llm_json", lambda *a, **k: {"analysis": None, "decision": "new_topic", "question": "That's fine. How does CSS specificity work?", "used_sources": []})
    t = qe.next_turn(None, "Frontend Developer", None, resume, hist, None, plan)
    assert t.decision == "new_topic" and not t.is_followup


def test_last_topic_may_use_the_remaining_question():
    """Regression: with 2 topics and a budget of 5 the round used to end after 4 questions, because the last topic was
    denied its final follow-up (follow-ups it had already used were compared with the remaining spare question)."""
    plan = ip.build_plan("Backend Engineer", None, R({"projects": [{"name": "A"}, {"name": "B"}], "key_skills": ["python"]}))
    res = plan.rounds[1]
    assert res.budget == 5 and len(res.slots) == 2
    a, b = res.slots[0].label, res.slots[1].label
    h = lambda topic, fu: dict(question=f"q-{topic}-{fu}", answer="x " * 30, is_followup=fu, round="resume", topic=topic)
    hist = [h(a, False), h(a, True), h(b, False), h(b, True)]  # 4 asked, 1 left in the budget
    d = ip.locate(plan, hist)
    assert d.round_asked == 4 and d.next_slot is None
    assert d.follow_allowed, "the 5th question of the round must still be askable"
    # and it is not over-generous: once the budget is used up there is no follow-up
    d2 = ip.locate(plan, hist + [h(b, True)])
    assert not d2.follow_allowed
