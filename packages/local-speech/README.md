# local-speech

Free, local speech for Paseo's dictation and voice mode, tuned for Polish:

- **Transcription:** Whisper large-v3 on MLX (`mlx-community/whisper-large-v3-mlx`), on the Apple
  Silicon GPU. About 0.8 s for 15 s of speech on an M5 Pro.
- **Speech:** Supertonic 3 (`Supertone/supertonic-3`, ONNX), 31 languages, first on the
  [Open TTS Leaderboard for Polish](https://paperswithcode.co/benchmark/open-tts-leaderboard-polish)
  (WER 2.31). Ten preset voices, `F1`–`F5` and `M1`–`M5`; about 4× faster than real time on the CPU.

Not a daemon plugin. Paseo's built-in local speech catalog has no Polish voice and stops at Whisper
Turbo, but its `openai` speech provider accepts any `baseUrl`. `server.py` speaks that API on
`127.0.0.1:4011`:

- `POST /v1/audio/transcriptions` takes the WAV Paseo sends. `language` may be a code (`pl`) or a
  name (`Polish`); `prompt` becomes Whisper's initial prompt.
- `POST /v1/audio/speech` returns OpenAI's `pcm` (24 kHz, 16-bit mono), or `wav` at 44.1 kHz. A
  `voice` it does not know (Paseo's default `alloy`) falls back to the configured voice. Numbers are
  spelled out first (`2,5` → „dwa przecinek pięć”), which Supertonic otherwise reads poorly.

## Install

Needs [uv](https://docs.astral.sh/uv/). Run from the main checkout, not a worktree, since the agent
runs the server from the script's directory:

```sh
packages/local-speech/install.sh            # launchd agent, starts at login, restarts on exit
packages/local-speech/install.sh --uninstall
```

The first start downloads about 3.4 GB of models into the Hugging Face cache. Log:
`~/Library/Logs/local-speech.log`.

Then point Paseo at it in `~/.paseo/config.json` and run `paseo daemon reload`:

```json
"features": {
  "dictation": {
    "enabled": true,
    "stt": { "provider": "openai", "apiKey": "local", "baseUrl": "http://127.0.0.1:4011/v1", "model": "whisper-1", "language": "pl" }
  },
  "voiceMode": {
    "enabled": true,
    "stt": { "provider": "openai", "apiKey": "local", "baseUrl": "http://127.0.0.1:4011/v1", "model": "whisper-1", "language": "pl" },
    "tts": { "provider": "openai", "apiKey": "local", "baseUrl": "http://127.0.0.1:4011/v1", "model": "tts-1", "voice": "M1" }
  }
}
```

## Settings

Pick the voice with `voice` in Paseo's config. The rest are environment variables of the server
(set them when running `install.sh`, e.g. `LOCAL_SPEECH_TTS_SPEED=1.5 install.sh`, which writes them into the plist):

- `LOCAL_SPEECH_PORT` (`4011`), `LOCAL_SPEECH_HOST` (`127.0.0.1`);
- `LOCAL_SPEECH_WHISPER_REPO`: any MLX Whisper repo, e.g. `mlx-community/whisper-large-v3-turbo` for
  speed;
- `LOCAL_SPEECH_STT_LANGUAGE` / `LOCAL_SPEECH_TTS_LANGUAGE` (`pl`): used when a request names none;
- `LOCAL_SPEECH_TTS_VOICE` (`M1`), `LOCAL_SPEECH_TTS_SPEED` (`1.05`);
- `LOCAL_SPEECH_TTS_STEPS` (`12`): Supertonic's denoising steps; more is cleaner and slower.
