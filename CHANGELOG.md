# Changelog

## 0.1.0 — first browser-only prerelease

- Standalone Chrome MV3 extension for captioned YouTube watch pages.
- Four bring-your-own-key text AI providers: Groq, OpenAI Responses, Gemini
  Developer API (AI Studio), and OpenRouter.
- Subtitle translation, original-text Q breakdown, E pause/resume, contextual
  word/phrase explanations, optional cue merging and automatic cue-end pause.
- Searchable multilingual selection with favorites, overlay appearance presets,
  local profiles, backup/restore, bounded answer cache, and optional browser speech.
- Isolated key storage, validated text-only AI output, cancellable requests,
  keyboard-accessible controls, responsive settings, privacy/security docs, CI.

Release qualification is incomplete: clean-browser live probes received empty
YouTube caption responses; real provider keys and Chrome's native permission
prompts were not tested. See [validation](docs/VALIDATION.md) before use.
