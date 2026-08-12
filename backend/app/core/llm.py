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


def _get_anthropic_client():
    global _anthropic_client
    if _anthropic_client is None:
        import anthropic
        _anthropic_client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _anthropic_client


def _get_openai_client():
    global _openai_client
    if _openai_client is None:
        import openai
        _openai_client = openai.OpenAI(api_key=settings.openai_api_key)
    return _openai_client


def call_llm_json(system_prompt: str, user_prompt: str, provider: str = None) -> dict:
    """
    Sends a prompt instructing the model to return ONLY a JSON object,
    and parses the result. Raises ValueError if the response isn't valid
    JSON so calling code can catch and retry/log instead of failing silently.
    """
    provider = (provider or settings.llm_provider).lower()

    if provider == "claude":
        client = _get_anthropic_client()
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1500,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        raw_text = response.content[0].text

    elif provider == "openai":
        client = _get_openai_client()
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
        )
        raw_text = response.choices[0].message.content

    else:
        raise ValueError(f"Unknown LLM provider: {provider}")

    raw_text = raw_text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.strip("`")
        if raw_text.startswith("json"):
            raw_text = raw_text[4:].strip()

    try:
        return json.loads(raw_text)
    except json.JSONDecodeError as e:
        raise ValueError(f"LLM did not return valid JSON. Raw response:\n{raw_text}") from e
