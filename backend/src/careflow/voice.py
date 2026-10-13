import asyncio
import io
import tempfile
import wave
from pathlib import Path

from fastapi import HTTPException, UploadFile
from fastapi.responses import Response

from careflow.config import settings


async def transcribe_audio(audio: UploadFile):
    if not settings().voice_enabled or not settings().voice_model_path:
        raise HTTPException(503, "Offline speech model disabled; typed assistant remains available")
    if audio.content_type not in {"audio/wav", "audio/x-wav"}:
        raise HTTPException(422, "Use PCM WAV audio")
    data = await audio.read(8_000_001)
    await audio.close()
    if len(data) > 8_000_000:
        raise HTTPException(413, "Audio exceeds 8MB")
    try:
        with wave.open(io.BytesIO(data)) as wav:
            if (
                wav.getframerate() == 0
                or wav.getnframes() / wav.getframerate() > 60
                or wav.getnchannels() not in {1, 2}
            ):
                raise HTTPException(422, "Audio must be at most 60 seconds, mono/stereo")
    except (wave.Error, EOFError):
        raise HTTPException(422, "Invalid PCM WAV") from None
    path = Path(settings().voice_model_path or "")
    if not path.is_dir():
        raise HTTPException(503, "Offline speech model not installed")

    def run():
        try:
            from faster_whisper import WhisperModel
        except ImportError:
            raise HTTPException(503, "Install the voice dependency extra") from None
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / "segment.wav"
            file.write_bytes(data)
            model = WhisperModel(
                str(path), device="cpu", compute_type="int8", local_files_only=True
            )
            segments, _ = model.transcribe(str(file), beam_size=1)
            return " ".join(segment.text for segment in segments)

    try:
        text = await asyncio.wait_for(asyncio.to_thread(run), timeout=60)
    except TimeoutError:
        raise HTTPException(503, "Offline transcription exceeded time budget") from None
    return {"text": text, "simulated": False, "next_endpoint": "/api/v1/assistant/messages"}


async def synthesize_audio(text: str):
    if not settings().voice_enabled or not settings().piper_model_path:
        raise HTTPException(503, "Offline speech output disabled; use text response")
    path = Path(settings().piper_model_path or "")
    if not path.is_file():
        raise HTTPException(503, "Offline Piper model unavailable")

    def run():
        try:
            from piper import PiperVoice
        except ImportError:
            raise HTTPException(503, "Install the voice dependency extra") from None
        result = io.BytesIO()
        with wave.open(result, "wb") as wav:
            voice = PiperVoice.load(str(path))
            voice.synthesize_wav(text, wav)
        return result.getvalue()

    data = await asyncio.to_thread(run)
    return Response(data, media_type="audio/wav")
