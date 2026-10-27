"""
Voice layer (Phase 3).

    GET  /voice/config      what the server can do, so the UI picks the best path
    POST /voice/transcribe  audio blob  -> {"text": "..."}      (Whisper via Groq/OpenAI)
    POST /voice/tts         {"text": …} -> audio/mpeg bytes      (Edge / OpenAI / ElevenLabs)

The browser's own SpeechRecognition / speechSynthesis are used first when present (zero latency,
zero cost); these endpoints are the reliable path for Firefox/Safari and for a better interviewer voice.
Server TTS audio is also what drives the avatar's lip-sync (the browser measures the audio's loudness).
"""

from __future__ import annotations

import logging
from collections import OrderedDict

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.core import personas, rate_limit
from app.core.config import settings
from app.core.deps import get_current_user
from app.models.models import User

log = logging.getLogger("voice")
router = APIRouter(prefix="/voice", tags=["voice"])

MAX_AUDIO_BYTES = 12 * 1024 * 1024
MAX_TTS_CHARS = 900


# --------------------------------------------------------------------------- capability report


def _stt_ready() -> bool:
    p = settings.stt_provider.lower()
    return (p == "groq" and bool(settings.groq_api_key)) or (p == "openai" and bool(settings.openai_api_key))


def _tts_ready() -> bool:
    p = settings.tts_provider.lower()
    if p == "edge":
        try:
            import edge_tts  # noqa: F401
            return True
        except ImportError:
            return False
    if p == "openai":
        return bool(settings.openai_api_key)
    if p == "elevenlabs":
        return bool(settings.elevenlabs_api_key)
    return False


@router.get("/config")
def voice_config(_: User = Depends(get_current_user)):
    return {
        "stt_server": _stt_ready(),
        "stt_provider": settings.stt_provider if _stt_ready() else None,
        "tts_server": _tts_ready(),
        "tts_provider": settings.tts_provider if _tts_ready() else "browser",
    }


# --------------------------------------------------------------------------- speech to text


def _transcribe_sync(filename: str, content: bytes, content_type: str) -> str:
    import openai

    provider = settings.stt_provider.lower()
    if provider == "groq":
        client = openai.OpenAI(api_key=settings.groq_api_key, base_url="https://api.groq.com/openai/v1", timeout=40)
        model = "whisper-large-v3-turbo"
    elif provider == "openai":
        client = openai.OpenAI(api_key=settings.openai_api_key, timeout=40)
        model = "whisper-1"
    else:
        raise HTTPException(status_code=501, detail="Server speech-to-text is not configured (set STT_PROVIDER + a key).")
    result = client.audio.transcriptions.create(
        model=model, file=(filename, content, content_type), language="en", response_format="json", temperature=0
    )
    return (result.text or "").strip()


@router.post("/transcribe", dependencies=[Depends(rate_limit.by_user("transcribe", 40, 60))])
async def transcribe(file: UploadFile = File(...), _: User = Depends(get_current_user)):
    if not _stt_ready():
        raise HTTPException(status_code=501, detail="Server speech-to-text is not configured.")
    content = await file.read(MAX_AUDIO_BYTES + 1)  # never load more than the cap
    if not content:
        raise HTTPException(status_code=400, detail="Empty audio.")
    if len(content) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio too long. Keep answers under a few minutes.")
    name = file.filename or "answer.webm"
    ctype = file.content_type or "audio/webm"
    try:
        text = await run_in_threadpool(_transcribe_sync, name, content, ctype)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        log.warning("transcription failed: %s", exc)
        raise HTTPException(status_code=502, detail="Transcription failed. Please try again or type your answer.")
    return {"text": text}


# --------------------------------------------------------------------------- text to speech


class TTSRequest(BaseModel):
    text: str = Field(min_length=1)
    voice: str | None = Field(default=None, max_length=20)  # interviewer key (see core/personas.py); unknown -> default


_cache: "OrderedDict[tuple, bytes]" = OrderedDict()


async def _edge_once(text: str, voice: str) -> bytes:
    import edge_tts

    comm = edge_tts.Communicate(text, voice, rate="+0%")
    buf = bytearray()
    async for chunk in comm.stream():
        if chunk["type"] == "audio":
            buf.extend(chunk["data"])
    return bytes(buf)


async def _edge_tts(text: str, voice: str) -> bytes:
    try:
        audio = await _edge_once(text, voice)
        if audio:
            return audio
    except Exception as exc:  # noqa: BLE001 - e.g. a voice name this edge-tts version does not know
        log.warning("edge voice %s failed (%s); using the default voice", voice, exc)
    return await _edge_once(text, settings.tts_voice_edge)


def _openai_tts(text: str, voice: str) -> bytes:
    import openai

    client = openai.OpenAI(api_key=settings.openai_api_key, timeout=40)
    resp = client.audio.speech.create(model="tts-1", voice=voice, input=text)
    return resp.content


async def _elevenlabs_tts(text: str) -> bytes:
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{settings.elevenlabs_voice_id}"
    async with httpx.AsyncClient(timeout=40) as client:
        r = await client.post(
            url,
            headers={"xi-api-key": settings.elevenlabs_api_key, "accept": "audio/mpeg"},
            json={"text": text, "model_id": "eleven_turbo_v2_5"},
        )
        r.raise_for_status()
        return r.content


@router.post("/tts", dependencies=[Depends(rate_limit.by_user("tts", 60, 60))])
async def tts(payload: TTSRequest, _: User = Depends(get_current_user)):
    if not _tts_ready():
        raise HTTPException(status_code=501, detail="Server text-to-speech is not configured; use the browser voice.")
    text = payload.text.strip()[:MAX_TTS_CHARS]
    persona = personas.get(payload.voice)
    key = (settings.tts_provider, persona.key, text)
    if key in _cache:
        _cache.move_to_end(key)
        return Response(_cache[key], media_type="audio/mpeg")
    try:
        provider = settings.tts_provider.lower()
        if provider == "edge":
            # the default character keeps the voice configured in .env; the others use their own voice
            audio = await _edge_tts(text, settings.tts_voice_edge if persona.key == personas.DEFAULT_KEY else persona.edge_voice)
        elif provider == "openai":
            audio = await run_in_threadpool(_openai_tts, text, settings.tts_voice_openai if persona.key == personas.DEFAULT_KEY else persona.openai_voice)
        else:
            audio = await _elevenlabs_tts(text)
    except Exception as exc:  # noqa: BLE001
        log.warning("tts failed: %s", exc)
        raise HTTPException(status_code=502, detail="Text-to-speech failed. The browser voice will be used instead.")
    if not audio:
        raise HTTPException(status_code=502, detail="Text-to-speech returned no audio.")
    _cache[key] = audio
    while len(_cache) > 40:
        _cache.popitem(last=False)
    return Response(audio, media_type="audio/mpeg")
