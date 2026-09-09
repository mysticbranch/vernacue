# Vernacue

Subtitle-driven language learning in your browser. Choose your video language,
translation language, and explanation language independently.

Vernacue is a Chrome Manifest V3 extension for ordinary YouTube watch pages.
It runs entirely in the browser and calls your chosen AI provider directly.
There is **no local server, Python runtime, GCP deployment, or Vernacue account**.
Internet access is needed for YouTube and AI requests.

## First version

**0.1.0 is a prerelease, not yet fully live-qualified.** Automated browser
fixtures pass, but clean-browser live probes received empty caption responses
from YouTube, including its own player. Real provider keys and native permission
prompts still require manual qualification. See [validation](docs/VALIDATION.md).

- AI subtitle translation using Groq, OpenAI, Gemini Developer API (Google AI
  Studio keys), or OpenRouter.
- **Q** pauses the video and breaks down the current original subtitle without
  rewriting its words. Translated-text breakdown is available under More.
- **E** immediately pauses/resumes. Automatic pause after a subtitle is a
  separate setting. Shortcuts can be disabled and do not run while typing.
- Click a subtitle word for a contextual explanation. Use More → Explain a
  word or phrase for languages or phrases that are difficult to select.
- Optional cue merging, original/translated subtitle display, and optional
  browser-voice Listen. No speech service is required for translation.
- Search languages by English name, native name, or code; star favorites.
  Language selection is independent of installed speech voices. The catalog
  covers ISO 639-1 languages plus common variants, not every language on earth;
  actual AI quality and YouTube caption availability vary.
- Text size, width, padding, colors, opacity, position, and line spacing;
  Standard, Large text, and High contrast presets.
- Local profiles, key-free JSON backup/restore, and bounded local answer cache.

## Install

1. Download `vernacue-0.1.0.zip` from [Releases](https://github.com/mysticbranch/vernacue/releases)
   when available, and extract it into a permanent folder.
2. Open `chrome://extensions` in Chrome, enable **Developer mode**, select
   **Load unpacked**, and choose the extracted folder containing `manifest.json`.
3. Pin Vernacue. Reload YouTube tabs that were open before installation.
4. Disable older subtitle extensions on the same page to avoid duplicate overlays
   and Q/E shortcut conflicts. Do not delete their data.

Alternatively build from source using Node.js 22+:

```sh
npm ci
npm run build
```

Load the generated `dist/` folder. Node is needed only for development/building,
not while using the extension. This version is not a Chrome Web Store install.

## Connect AI

Open **Settings → AI connection**. Choose a provider, enter your own API key,
and click **Save key and allow access**. Chrome asks for access to that provider's
API host only. Load models, choose a text model, then run **Test connection**.
You can also enter a model ID manually. The test makes a small, potentially paid request.

| Provider   | Account/key                                                 | API used                                                               |
| ---------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| Groq       | [Groq Console](https://console.groq.com/keys)               | Chat Completions                                                       |
| OpenAI     | [OpenAI API platform](https://platform.openai.com/api-keys) | Responses API; a ChatGPT subscription is separate                      |
| Gemini     | [Google AI Studio](https://aistudio.google.com/apikey)      | Gemini Developer API; not Vertex AI/GCP service-account authentication |
| OpenRouter | [OpenRouter keys](https://openrouter.ai/settings/keys)      | Chat Completions, routed to the selected model provider                |

Keys are session-only by default. **Remember key on this device** uses local
extension storage, which is not an encrypted vault. Keys are not exported with
profiles, synchronized to a cloud account, or inserted into YouTube's page.
AI providers have their own billing, rate limits, and data policies. There is
no automatic provider fallback. See [Privacy](PRIVACY.md).

## Study

1. Open a captioned `https://www.youtube.com/watch?v=…` video. Turn on YouTube
   CC if tracks are not discovered immediately.
2. Select your target language and click **Start studying** in the popup.
3. Enable AI translations in Settings or the overlay's **More** menu. Defaults
   keep automatic paid translation off until you choose it.
4. Press Q, click a word, or use the visible buttons. Escape closes a dialog;
   closing a study dialog keeps the video paused. Choose Resume video or E.
5. More changes the current session. Settings saves your defaults. Use **Apply
   saved settings to this video** in the popup after changing saved settings.
6. Save a named profile to preserve a learning setup. A profile is a snapshot;
   later edits are not silently written into that snapshot.

Translations may prefetch the next two cues. Turning translation off or stopping
the session cancels obsolete requests, but a provider may still charge for an
already received request. AI explanations can be wrong; verify uncertain meanings.

## Compatibility and troubleshooting

- Chrome 120+ is the declared minimum; automated tests use Playwright Chromium.
  Other Chromium browsers are not separately qualified. Firefox, Safari, mobile,
  embedded players, Shorts, and live streams are outside this first version.
- Captions must be obtainable from YouTube. No captions means no automatic
  transcription. If loading fails, enable CC, choose a track, then Retry captions.
  YouTube may change its page or reject caption requests; see [validation](docs/VALIDATION.md).
- A new video ends the active session. Start again on that video. Ad content is
  excluded from subtitle display.
- Missing key/model, permission denial, rate limiting, and malformed AI answers
  are shown as errors. Model listing is discovery, not a guarantee that a model
  supports the required output format. Try another text model.
- Session keys disappear after a browser session ends. For a persistent setup,
  explicitly opt into remembering each provider key.
- Browser speech depends on installed voices. Remote voices require a separate
  opt-in and may send text to a speech service. Listen does not clone voices.
- To update, replace the extracted build and press Reload in `chrome://extensions`,
  then reload YouTube. Export profiles before downgrading. Removing the extension
  removes its local settings, keys, and answer cache.

## Development

```sh
npm ci
npm run check          # strict types, unit tests, production extension build
npx playwright install chromium
npm run test:browser   # actual extension contexts; synthetic video/provider fixtures
npm run package        # ZIP and SHA-256 under artifacts/
```

CI also runs the browser tests and uploads the package and test evidence.
Optional network-dependent check: `node tests/live-youtube.mjs`; see the
validation document before interpreting it as a release qualification.

[Architecture](docs/ARCHITECTURE.md) · [Validation](docs/VALIDATION.md) ·
[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Privacy](PRIVACY.md)

MIT licensed. Not affiliated with YouTube, Google, OpenAI, Groq, or OpenRouter.
