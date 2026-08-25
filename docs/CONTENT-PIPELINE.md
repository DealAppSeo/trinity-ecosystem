# CONTENT-PIPELINE — MoneyPrinterTurbo (short-form video generation)

**What reaches whom.** MoneyPrinterTurbo (MPT) is a **Python service with a WebUI/API/CLI**, not
a skill and not a library. **Only a human on a machine that runs it can execute it** — XC, GA and
cloud Claude sessions cannot, ever (no shell, no service, no GPU/ffmpeg). It is **not vendored**
into any of our repos and is **not a dependency**. What is shareable is the *interface*, recorded
here, so any agent can **prepare a video brief** even though only the operator runs it.

- Upstream: https://github.com/harry0703/MoneyPrinterTurbo (do not clone into our repos)
- Runs on: the operator's machine only.

---

## Install (operator, once)
Per upstream README. Summary:
1. Clone upstream outside our repos; Python 3.11 env (`uv` or venv), `pip install -r requirements.txt`. **ffmpeg** required on PATH. GPU optional (`Dockerfile.gpu`). Docker path: `docker-compose up`.
2. `cp config.example.toml config.toml`, then add keys **in the WebUI settings or a private config.toml — never commit a real key**.

**Credentials it needs (operator supplies; reuse from `.env.master` where present, don't mint new):**
- **LLM** (script generation): one of Kimi/Moonshot, OpenAI, Anthropic, Gemini, DeepSeek, xAI Grok, Qwen, Azure, Ollama, LiteLLM, Groq, … (config `[app] llm_provider` + that provider's key).
- **Video source** (stock footage): Pexels / Pixabay API key.
- **TTS voice**: edge-tts works keyless; Azure/other voices need a key.
- Optional `[app] api_key` = a shared secret clients pass as the `x-api-key` header to the API.

## Run — three surfaces (operator)
- **WebUI:** `./webui.sh` (or `webui.bat`) → Streamlit on `127.0.0.1:8501` (auto-picks 8501–8599).
- **API:** `python main.py` → uvicorn on `:8080`; requests send `x-api-key: <config api_key>`.
- **CLI:** `python cli.py <flags>` (headless, scriptable — best for an agent-prepared brief).

## Output — where video lands
`storage/tasks/<task_id>/` under the MPT install root (`app/utils/utils.py: storage_dir()`), the
final `.mp4` plus intermediates (audio, subtitles, clips). Point the operator there to retrieve it.

---

## The brief an agent CAN prepare (the shareable part)
Agents (including XC/GA/cloud Claude) cannot run MPT, but they **can** produce a complete, ready-to-run
CLI invocation for the operator to paste. Fill these and hand it over:

| Field | CLI flag | Notes |
|---|---|---|
| Topic / subject | (script source) | Either let MPT generate from a subject, or supply your own script via `--video-script` |
| Script text | `--video-script` | Agent-written narration; skips LLM generation |
| Language | `--video-language` | e.g. `en`, `zh` |
| Aspect | `--video-aspect` | `9:16` portrait / `16:9` landscape |
| Clip count / duration | `--video-count`, `--video-clip-duration` | |
| Subtitles | `--subtitle-enabled`, `--font-name`, `--font-size`, `--subtitle-position`, `--stroke-*` | styling |
| Music | `--bgm-type`, `--bgm-file`, `--bgm-volume` | |
| Stock footage vs script match | `--match-materials-to-script`, `--video-materials`, `--video-concat-mode` | |
| Task id | `--task-id` | names the `storage/tasks/<id>/` output dir |

Run `python cli.py --help` on the install for the authoritative, version-exact flag list — treat this
table as the shape, not the contract.

**Example brief an agent can output for the operator:**
> Run MPT to make a 9:16, English, ~30s explainer on "verified machine behavior as private credit for
> agents". Script (below) is pre-written, so `--video-script "<text>"`, `--video-language en`,
> `--video-aspect 9:16`, subtitles on, task-id `trustmarket-teaser-01`. Retrieve the mp4 from
> `storage/tasks/trustmarket-teaser-01/`.

## Boundaries (non-negotiable)
- Do not vendor MPT into any repo; do not add it as a dependency.
- Real API keys live in the operator's `config.toml` / WebUI only — never committed here.
- Generated video is content output, not a system artifact; it does not enter the scoring/trust path.
