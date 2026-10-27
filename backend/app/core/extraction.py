"""
Process 1.0 — Extract Resume / JD (from the DFD).

Input: raw text (from app.core.file_parsing.extract_raw_text)
Output: ExtractedProfile — validated structured JSON. Besides skills it now holds the FULL inventory of the
        resume (every job / internship, every project, education, certifications, achievements), because
        Round 2 of the interview asks about each of them.
"""

import logging
import re

from app.core.llm import call_llm_json
from app.schemas.schemas import ExperienceItem, ExtractedProfile, ProjectItem

log = logging.getLogger("extraction")

SYSTEM_PROMPT = """You are an information-extraction engine for an interview-prep tool.
You will be given raw text from either a resume, a job description, or both together.
Extract the following fields and return ONLY a single valid JSON object, with no extra
commentary, no markdown fences, and no explanation text before or after it.

Be COMPLETE: an interviewer will ask about every experience and every project you list, so do not
drop, merge or summarise away any job, internship, project, certification or achievement that appears.
Copy names, companies and technologies exactly as written. Never invent anything that is not in the text.

JSON fields to return (use null or empty lists if not present in the text):
{
  "role_title": string or null,
  "company_name": string or null,
  "experience_level": string or null  (e.g. "student", "entry", "mid", "senior"),
  "key_skills": [list of strings - every technology, language, framework, tool],
  "key_responsibilities": [list of strings],
  "notable_projects": [list of project NAMES],
  "summary": string or null (one or two lines),
  "experience": [ {"company": string, "role": string, "duration": string or null,
                   "highlights": [what they did / achieved, one short string per bullet],
                   "technologies": [tools used]} ],   // every job, internship, freelance or volunteer role
  "projects": [ {"name": string, "description": string (what it is, 1-2 sentences),
                 "technologies": [tools used], "highlights": [notable bullets / results]} ],
  "education": [strings like "B.Sc Computer Science, Christ University, 2022-2025"],
  "certifications": [strings],
  "achievements": [awards, publications, leadership roles, hackathons, extracurriculars]
}
"""


# --------------------------------------------------------------------------- offline parser

_HEADINGS = {
    "experience": r"(?:work |professional |relevant |industry )?experience|employment(?: history)?|internships?|work history|career history",
    "projects": r"(?:academic |personal |key |major |technical |selected )?projects?(?: work)?",
    "education": r"education(?:al background)?|academics?|academic (?:background|qualifications?)|qualifications?",
    "skills": r"(?:technical |key |core )?skills|technologies|tech stack|core competenc(?:y|ies)|tools(?: & technologies)?",
    "certifications": r"certifications?|certificates?|licen[sc]es?|courses?|training",
    "achievements": r"achievements?|awards?|honou?rs?|accomplishments?|extra.?curriculars?|positions? of responsibility|leadership|activities|publications?|volunteer(?:ing)?",
    "summary": r"(?:professional |career )?summary|objective|profile|about(?: me)?",
}
_HEAD_RE = {k: re.compile(rf"^\W*(?:{v})\W*$", re.I) for k, v in _HEADINGS.items()}
_BULLET = re.compile(r"^\s*(?:[•●▪■◦○‣∙·*\-–—>]|\d+[.)])\s+")
_MONTH = r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?"
_DATE = rf"(?:{_MONTH}\s*[’']?\d{{2,4}}|\d{{1,2}}/\d{{2,4}}|\d{{4}})"
_RANGE_RE = re.compile(
    rf"(?:\(|\[)?\s*({_DATE}\s*(?:-|–|—|to|until)\s*(?:{_DATE}|present|current|ongoing|now|date)"
    rf"|{_MONTH}\s*\d{{4}}|\d+\s*(?:\+\s*)?(?:months?|mos?|years?|yrs?))\s*(?:\)|\])?",
    re.I,
)
_ROLE_WORDS = re.compile(
    r"\b(intern|internship|engineer|developer|analyst|manager|trainee|associate|lead|consultant|assistant|"
    r"architect|designer|scientist|researcher|administrator|executive|officer|specialist|coordinator|"
    r"volunteer|freelance|member|head|director|programmer|tester|sde|swe)\b",
    re.I,
)


def _find_section(line: str) -> str | None:
    s = line.strip()
    if not s or len(s) > 45 or _BULLET.match(s):
        return None
    for key, rx in _HEAD_RE.items():
        if rx.match(s):
            return key
    return None


def _split_sections(text: str) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {}
    current = "header"
    for line in text.splitlines():
        key = _find_section(line)
        if key:
            current = key
            sections.setdefault(current, [])
            continue
        sections.setdefault(current, []).append(line.rstrip())
    return sections


def _is_exp_header(body: str) -> bool:
    return bool(_RANGE_RE.search(body)) or (bool(_ROLE_WORDS.search(body)) and len(body.split()) <= 12 and not body.rstrip().endswith("."))


def _split_entries(lines: list[str], kind: str | None = None) -> list[dict]:
    """Group a section into entries: a title (1-2 lines) followed by bullet / description lines."""
    entries: list[dict] = []
    cur: dict | None = None
    prev_blank = True
    prev_marked = False
    for raw in lines:
        line = raw.strip()
        if not line:
            prev_blank = True
            continue
        is_bullet = bool(_BULLET.match(line))
        body = _BULLET.sub("", line).strip()
        if is_bullet:
            if cur is None:
                cur = {"title": "", "extra": [], "bullets": []}
                entries.append(cur)
            cur["bullets"].append(body)
        else:
            if cur is not None and cur["bullets"] and not prev_blank and body[:1].islower():
                cur["bullets"][-1] += " " + body  # wrapped bullet text
            elif kind == "experience" and cur is not None and cur["title"] and not cur["bullets"] and not cur["extra"] and not prev_blank and len(body) < 35 and _RANGE_RE.search(body):
                cur["extra"].append(body)  # date-only second header line
            elif kind == "experience" and cur is not None and not prev_blank and not prev_marked and not _is_exp_header(body):
                cur["bullets"].append(body)  # PDF text often loses bullet markers: a non-header line is a bullet
            elif kind == "projects" and cur is not None and not prev_blank and not prev_marked and not (
                len(body.split()) <= 8 and not body.endswith(".") and body[:1].isupper() and cur["bullets"] and len(cur["bullets"][-1].split()) >= 9
            ):
                cur["bullets"].append(body)  # description line under a project title (no bullet marker)
            elif cur is not None and cur["title"] and not cur["bullets"] and not cur["extra"] and not prev_blank and len(body) < 90 and kind != "projects":
                cur["extra"].append(body)  # second header line, e.g. "Acme Corp | Jun 2024 - Aug 2024"
            else:
                cur = {"title": body, "extra": [], "bullets": []}
                entries.append(cur)
        prev_blank = False
        prev_marked = is_bullet
    return [e for e in entries if e["title"] or e["bullets"]]


def _tech_in(text: str) -> list[str]:
    from app.core.question_engine import _TECH_WORDS

    low = text.lower()
    return sorted({w for w in _TECH_WORDS if re.search(rf"(?<![a-z0-9]){re.escape(w)}(?![a-z0-9])", low)})


def _tidy(p: str) -> str:
    p = p.strip(" ,;:-–—")
    if p.count("(") > p.count(")"):
        p += ")"
    return p.strip()


def _parse_experience(entry: dict) -> ExperienceItem:
    head = " | ".join([entry["title"], *entry["extra"]])
    duration = None
    m = _RANGE_RE.search(head)
    if m:
        duration = m.group(1).strip()
        head = (head[: m.start()] + " " + head[m.end():]).strip()
    parts = [_tidy(p) for p in re.split(r"\s*[|•·]\s*|\s+[-–—]\s+|\s+at\s+|\s+@\s+|,\s+", head) if _tidy(p)]
    role = company = None
    if len(parts) == 1:
        if _ROLE_WORDS.search(parts[0]):
            role = parts[0]
        else:
            company = parts[0]
    elif len(parts) >= 2:
        a, b = parts[0], parts[1]
        if _ROLE_WORDS.search(a) and not _ROLE_WORDS.search(b):
            role, company = a, b
        elif _ROLE_WORDS.search(b) and not _ROLE_WORDS.search(a):
            role, company = b, a
        else:
            role, company = a, b
    return ExperienceItem(
        company=company, role=role, duration=duration,
        highlights=entry["bullets"][:8], technologies=_tech_in(" ".join(entry["bullets"] + [entry["title"]])),
    )


def _parse_project(entry: dict) -> ProjectItem:
    head = entry["title"] or (entry["bullets"][0] if entry["bullets"] else "Project")
    head = re.sub(r"^\s*projects?\s*[:\-–]\s*", "", head, flags=re.I)
    head = _RANGE_RE.sub(" ", head)
    name, *rest = [p.strip(" ,;:-–—()[]") for p in re.split(r"\s*[|•·]\s*|\s+[-–—]\s+|:\s+|\s*\(", head, maxsplit=1) if p.strip(" ,;:-–—()[]")] or ["Project"]
    tech_text = " ".join(rest + entry["extra"] + entry["bullets"])
    desc = " ".join(entry["extra"]) or (rest[0] if rest and not _tech_in(rest[0]) else "") or (entry["bullets"][0] if entry["bullets"] else "")
    return ProjectItem(
        name=name[:90], description=(desc or None) and desc[:300],
        technologies=_tech_in(tech_text + " " + head), highlights=entry["bullets"][:8],
    )


def _plain_lines(lines: list[str]) -> list[str]:
    """One item per line / bullet (education, certifications, achievements); wrapped lines are joined."""
    out: list[str] = []
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        body = _BULLET.sub("", line).strip()
        if out and not _BULLET.match(line) and (body[:1].islower() or re.match(r"^(cgpa|gpa|percentage|grade|score|marks)\b", body, re.I)):
            out[-1] += " " + body
        else:
            out.append(body)
    return [o[:200] for o in out]


def _fallback_profile(raw_text: str) -> ExtractedProfile:
    """Section-aware parser used only when the LLM is unreachable, so resume upload (and the whole interview,
    including the resume round) still works offline / without an API key."""
    low = raw_text.lower()
    from app.core.question_engine import _TECH_WORDS

    skills = sorted({w for w in _TECH_WORDS if re.search(rf"(?<![a-z0-9]){re.escape(w)}(?![a-z0-9])", low)})
    sec = _split_sections(raw_text)

    experience = [_parse_experience(e) for e in _split_entries(sec.get("experience", []), "experience")]
    projects = [_parse_project(e) for e in _split_entries(sec.get("projects", []), "projects")]
    # Inline "Project: Name" lines anywhere else in the document (the old behaviour) when there is no projects section.
    if not projects:
        for line in raw_text.splitlines():
            if re.match(r"^\s*projects?\s*[:\-]", line, re.I) and 3 < len(line.strip()) < 120:
                projects.append(ProjectItem(name=re.sub(r"^\s*projects?\s*[:\-]?\s*", "", line.strip(), flags=re.I)))
    experience = [x for x in experience if x.role or x.company]

    skill_lines = " ".join(sec.get("skills", []))
    extra_skills = [s.strip() for s in re.split(r"[,;|•·\n]", skill_lines) if 1 < len(s.strip()) <= 30 and ":" not in s]
    for s in extra_skills:
        if s.lower() not in {x.lower() for x in skills}:
            skills.append(s)

    return ExtractedProfile(
        key_skills=skills[:30],
        notable_projects=[p.name for p in projects][:12],
        summary="Extracted with the built-in parser (no LLM available).",
        experience=experience[:12],
        projects=projects[:12],
        education=_plain_lines(sec.get("education", []))[:5],
        certifications=_plain_lines(sec.get("certifications", []))[:8],
        achievements=_plain_lines(sec.get("achievements", []))[:8],
    )


def extract_profile(raw_text: str) -> ExtractedProfile:
    user_prompt = f"Extract structured information from the following text:\n\n{raw_text[:14000]}"
    try:
        result_json = call_llm_json(SYSTEM_PROMPT, user_prompt, max_tokens=3500)
        profile = ExtractedProfile(**result_json)
        if not profile.notable_projects:
            profile.notable_projects = [p.name for p in profile.projects]
        return profile
    except Exception as exc:  # noqa: BLE001
        log.warning("LLM extraction failed (%s) - using the built-in resume parser", exc)
        return _fallback_profile(raw_text)
