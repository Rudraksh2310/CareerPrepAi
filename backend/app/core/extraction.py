"""
Process 1.0 — Extract Resume / JD (from the DFD).

Input: raw text (from app.core.file_parsing.extract_raw_text)
Output: ExtractedProfile — validated structured JSON, ready to be stored
        against the resume row and passed to Process 2.0 (FAQ retrieval)
        once that's built in Phase 3.
"""

from app.core.llm import call_llm_json
from app.schemas.schemas import ExtractedProfile

SYSTEM_PROMPT = """You are an information-extraction engine for an interview-prep tool.
You will be given raw text from either a resume, a job description, or both together.
Extract the following fields and return ONLY a single valid JSON object, with no extra
commentary, no markdown fences, and no explanation text before or after it.

JSON fields to return (use null or empty lists if not present in the text):
{
  "role_title": string or null,
  "company_name": string or null,
  "experience_level": string or null,
  "key_skills": [list of strings],
  "key_responsibilities": [list of strings],
  "notable_projects": [list of strings],
  "summary": string or null (one or two lines)
}
"""


def extract_profile(raw_text: str) -> ExtractedProfile:
    user_prompt = f"Extract structured information from the following text:\n\n{raw_text}"
    result_json = call_llm_json(SYSTEM_PROMPT, user_prompt)
    return ExtractedProfile(**result_json)
