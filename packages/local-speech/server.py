"""Local OpenAI-compatible speech server for Paseo.

- POST /v1/audio/transcriptions: Whisper large-v3 on MLX (Apple Silicon GPU).
- POST /v1/audio/speech: Supertonic 3 (ONNX), Polish by default.

Paseo's `openai` speech provider talks to it through `baseUrl`. See README.md.
"""

import asyncio
import io
import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor
from math import gcd
from typing import Annotated

import mlx_whisper
import numpy as np
import soundfile as sf
import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse, PlainTextResponse, Response
from mlx_whisper.tokenizer import LANGUAGES, TO_LANGUAGE_CODE
from num2words import num2words
from pydantic import BaseModel, Field
from scipy.signal import resample_poly
from supertonic import TTS

HOST = os.environ.get("LOCAL_SPEECH_HOST", "127.0.0.1")
PORT = int(os.environ.get("LOCAL_SPEECH_PORT", "4011"))
WHISPER_REPO = os.environ.get("LOCAL_SPEECH_WHISPER_REPO", "mlx-community/whisper-large-v3-mlx")
STT_LANGUAGE = os.environ.get("LOCAL_SPEECH_STT_LANGUAGE", "pl")
TTS_LANGUAGE = os.environ.get("LOCAL_SPEECH_TTS_LANGUAGE", "pl")
TTS_VOICE = os.environ.get("LOCAL_SPEECH_TTS_VOICE", "M1")
TTS_SPEED = float(os.environ.get("LOCAL_SPEECH_TTS_SPEED", "1.05"))
TTS_STEPS = int(os.environ.get("LOCAL_SPEECH_TTS_STEPS", "12"))

WHISPER_SAMPLE_RATE = 16_000
# OpenAI's `pcm` response format: 24 kHz, 16-bit signed little-endian, mono.
PCM_SAMPLE_RATE = 24_000

log = logging.getLogger("local-speech")

# MLX and ONNX Runtime each run on one dedicated thread: neither model is safe to call concurrently.
stt_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="stt")
tts_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="tts")

tts = TTS(model="supertonic-3", auto_download=True)
voice_styles = {name: tts.get_voice_style(voice_name=name) for name in tts.voice_style_names}

app = FastAPI(title="local-speech")


class SpeechRequest(BaseModel):
    model: str = "tts-1"
    input: str = Field(min_length=1)
    voice: str | None = None
    response_format: str | None = "pcm"
    speed: float | None = None
    # Not in OpenAI's API; lets a caller other than Paseo pick the language.
    lang: str | None = None


def resolve_language(value: str | None, default: str) -> str:
    """Accepts an ISO code (`pl`) or a language name (`Polish`), as Paseo may send either."""
    if not value:
        return default
    normalized = value.strip().lower()
    if normalized in LANGUAGES:
        return normalized
    return TO_LANGUAGE_CODE.get(normalized, default)


def resample(audio: np.ndarray, source_rate: int, target_rate: int) -> np.ndarray:
    if source_rate == target_rate:
        return audio
    divisor = gcd(source_rate, target_rate)
    return resample_poly(audio, target_rate // divisor, source_rate // divisor)


NUMBER = re.compile(r"(?<![\w.,])\d+(?:[.,]\d+)*(?![\w])")


def spell_numbers(text: str, lang: str) -> str:
    """Spells out numbers, which Supertonic otherwise reads poorly: `2,5` → `dwa przecinek pięć`."""

    def spell(match: re.Match[str]) -> str:
        token = match.group(0)
        try:
            parts = re.split(r"[.,]", token)
            if len(parts) == 2 and "," in token:
                return num2words(float(token.replace(",", ".")), lang=lang)
            if len(parts) == 1:
                return num2words(int(token), lang=lang)
            # A version or a dotted number (`0.16.2`): read each part.
            separator = " kropka " if lang == "pl" else " dot "
            return separator.join(num2words(int(part), lang=lang) for part in parts)
        except (NotImplementedError, OverflowError, ValueError):
            return token

    return NUMBER.sub(spell, text)


def transcribe(audio: np.ndarray, language: str, prompt: str | None) -> str:
    result = mlx_whisper.transcribe(
        audio,
        path_or_hf_repo=WHISPER_REPO,
        language=language,
        initial_prompt=prompt or None,
        condition_on_previous_text=False,
    )
    return str(result["text"]).strip()


def synthesize(text: str, voice: str, lang: str, speed: float) -> np.ndarray:
    wav, _ = tts.synthesize(
        spell_numbers(text, lang),
        voice_style=voice_styles[voice],
        lang=lang,
        speed=speed,
        total_steps=TTS_STEPS,
    )
    return np.asarray(wav, dtype=np.float32).reshape(-1)


def decode_audio(data: bytes) -> np.ndarray:
    audio, rate = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
    return resample(audio.mean(axis=1), rate, WHISPER_SAMPLE_RATE).astype(np.float32)


def to_pcm16(audio: np.ndarray) -> bytes:
    return (np.clip(audio, -1.0, 1.0) * 32767).astype("<i2").tobytes()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/models")
def models() -> dict[str, object]:
    ids = ["whisper-1", "tts-1", "tts-1-hd"]
    return {"object": "list", "data": [{"id": i, "object": "model", "owned_by": "local-speech"} for i in ids]}


@app.post("/v1/audio/transcriptions", response_model=None)
async def transcriptions(
    file: Annotated[UploadFile, File()],
    language: Annotated[str | None, Form()] = None,
    prompt: Annotated[str | None, Form()] = None,
    response_format: Annotated[str, Form()] = "json",
) -> Response:
    try:
        audio = decode_audio(await file.read())
    except (sf.LibsndfileError, RuntimeError) as error:
        return JSONResponse({"error": {"message": f"Unreadable audio: {error}"}}, status_code=400)
    lang = resolve_language(language, STT_LANGUAGE)
    text = await asyncio.wrap_future(stt_executor.submit(transcribe, audio, lang, prompt))
    log.info("transcribed %.1fs of audio (%s): %d chars", len(audio) / WHISPER_SAMPLE_RATE, lang, len(text))
    if response_format == "text":
        return PlainTextResponse(text)
    if response_format == "verbose_json":
        return JSONResponse({"text": text, "language": LANGUAGES.get(lang, lang)})
    return JSONResponse({"text": text})


@app.post("/v1/audio/speech")
async def speech(request: SpeechRequest) -> Response:
    voice = request.voice if request.voice in voice_styles else TTS_VOICE
    lang = resolve_language(request.lang, TTS_LANGUAGE)
    speed = request.speed or TTS_SPEED
    audio = await asyncio.wrap_future(tts_executor.submit(synthesize, request.input, voice, lang, speed))
    log.info("synthesized %d chars (%s, %s)", len(request.input), lang, voice)

    if request.response_format == "wav":
        buffer = io.BytesIO()
        sf.write(buffer, audio, tts.sample_rate, format="WAV", subtype="PCM_16")
        return Response(buffer.getvalue(), media_type="audio/wav")
    pcm = to_pcm16(resample(audio, tts.sample_rate, PCM_SAMPLE_RATE))
    return Response(pcm, media_type="audio/pcm")


def warm_up() -> None:
    """Loads Whisper and runs both models once, so the first real request is fast."""
    stt_executor.submit(transcribe, np.zeros(WHISPER_SAMPLE_RATE, dtype=np.float32), STT_LANGUAGE, None).result()
    tts_executor.submit(synthesize, "Gotowe.", TTS_VOICE, TTS_LANGUAGE, TTS_SPEED).result()
    log.info("models ready")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    warm_up()
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")
