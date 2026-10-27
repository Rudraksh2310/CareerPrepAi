"""Interviewer characters the candidate can choose. One place defines the name, the server voices and the browser-voice
hint; the frontend (src/lib/personas.js) holds the matching look. Keys are whitelisted: the client can only pick one of these."""

from __future__ import annotations

from dataclasses import dataclass

DEFAULT_KEY = "aria"


@dataclass(frozen=True)
class Persona:
    key: str
    name: str
    gender: str  # "f" | "m": used for the browser-voice fallback on the frontend
    edge_voice: str  # edge-tts neural voice
    openai_voice: str  # OpenAI tts-1 voice


PERSONAS: dict[str, Persona] = {p.key: p for p in (
    Persona("aria", "Aria", "f", "en-US-AriaNeural", "nova"),
    Persona("arjun", "Arjun", "m", "en-IN-PrabhatNeural", "onyx"),
    Persona("meera", "Meera", "f", "en-IN-NeerjaNeural", "shimmer"),
    Persona("daniel", "Daniel", "m", "en-US-GuyNeural", "echo"),
    Persona("marcus", "Marcus", "m", "en-US-AndrewNeural", "fable"),
)}


def get(key: str | None) -> Persona:
    return PERSONAS.get((key or "").lower(), PERSONAS[DEFAULT_KEY])
