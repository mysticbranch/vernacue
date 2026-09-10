# Changelog

## 0.1.1 — stable popup and blue redesign

- Fixed Chrome toolbar popup sizing: independent document bounds replace the
  viewport-dependent width constraint, with screen-aware height and inner scrolling.
- Mount the popup interface as one complete layout, keeping async status updates
  from changing its outer size.
- Pale-blue surfaces, dark-blue text, blue actions, branded headers, clearer
  settings navigation, refined controls, and a matching navy dark theme.
- New installs default to Light; saved themes, profiles, keys, and custom subtitle
  appearance are not overwritten.
- Added native toolbar-popup tests, dark-theme accessibility checks, and a
  saved-appearance compatibility regression. CI now tests the native popup too.

Update in the same unpacked-extension folder and reload it in Chrome. This remains
a prerelease; the existing live YouTube/API qualification limitations are unchanged.

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
