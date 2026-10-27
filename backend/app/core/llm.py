"""
LLM abstraction layer.

Every other module calls `call_llm_json(...)` and doesn't care whether
Claude or OpenAI is behind it — flip LLM_PROVIDER in .env to switch,
without touching extraction.py or (later) the question engine.
"""

import os
import json

from app.core.config import settings

_anthropic_client = None
_openai_client = None
_groq_client = None


def _get_anthropic_client():
    global _anthropic_client
    if _anthropic_client is None:
        import anthropic
        _anthropic_client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key, timeout=settings.llm_timeout_s, max_retries=1
        )
    return _anthropic_client


def _get_openai_client():
    global _openai_client
    if _openai_client is None:
        import openai
        _openai_client = openai.OpenAI(
            api_key=settings.openai_api_key, timeout=settings.llm_timeout_s, max_retries=1
        )
    return _openai_client


def _get_groq_client():
    global _groq_client
    if _groq_client is None:
        import openai
        _groq_client = openai.OpenAI(
            api_key=settings.groq_api_key,
            base_url="https://api.groq.com/openai/v1",
            timeout=settings.llm_timeout_s,
            max_retries=1,
        )
    return _groq_client


def llm_status() -> dict:
    """Is the configured provider usable at all (key present)? Shown to the user so a missing key is not silent."""
    provider = (settings.llm_provider or "").lower()
    key = {"claude": settings.anthropic_api_key, "openai": settings.openai_api_key, "groq": settings.groq_api_key}.get(provider)
    env = {"claude": "ANTHROPIC_API_KEY", "openai": "OPENAI_API_KEY", "groq": "GROQ_API_KEY"}.get(provider, "LLM_PROVIDER")
    configured = bool((key or "").strip())
    return {
        "provider": provider,
        "configured": configured,
        "note": None if configured else f"No {env} found in backend/.env, so questions come from the built-in offline engine.",
    }


def call_llm_json(system_prompt: str, user_prompt: str, provider: str = None, max_tokens: int = 1500) -> dict:
    """
    Sends a prompt instructing the model to return ONLY a JSON object,
    and parses the result. Raises ValueError if the response isn't valid
    JSON so calling code can catch and retry/log instead of failing silently.
    """
    provider = (provider or settings.llm_provider).lower()

    if provider == "claude":
        client = _get_anthropic_client()
        response = client.messages.create(
            model=settings.claude_model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        raw_text = response.content[0].text

    elif provider == "openai":
        client = _get_openai_client()
        response = client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            max_tokens=max_tokens,
        )
        raw_text = response.choices[0].message.content

    elif provider == "groq":
        client = _get_groq_client()
        extra = {}
        if "gpt-oss" in settings.groq_model:
            # gpt-oss spends part of max_tokens "thinking"; keep that small so the JSON is never cut off.
            extra["extra_body"] = {"reasoning_effort": "low"}
            max_tokens = max(max_tokens, 2500)
        response = client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            max_tokens=max_tokens,
            **extra,
        )
        raw_text = response.choices[0].message.content

    else:
        raise ValueError(f"Unknown LLM provider: {provider}")

    return parse_json_object(raw_text)


def parse_json_object(raw_text: str) -> dict:
    """Parse a JSON object out of an LLM reply, tolerating ``` fences and stray prose."""
    raw_text = (raw_text or "").strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.strip("`")
        if raw_text.lower().startswith("json"):
            raw_text = raw_text[4:].strip()
    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        start, end = raw_text.find("{"), raw_text.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(raw_text[start : end + 1])
            except json.JSONDecodeError:
                pass
        raise ValueError(f"LLM did not return valid JSON. Raw response:\n{raw_text}")
