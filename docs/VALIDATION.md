# Validation and release status

## 0.1.1: prerelease

### Popup regression and visual update

The 0.1.0 popup was tested as a tab, which missed Chrome's toolbar auto-sizing.
A native `chrome.action.openPopup()` probe reproduced a 168 × 498 px collapsed
layout instead of the intended 360 px width. The title stacked vertically and
controls were clipped. The root had no explicit size while an inner element used
`max-width: 100vw`, coupling its preferred size to Chrome's sizing viewport.

The 0.1.1 root uses an independent 392 px width and a height chosen from available
screen space (360–588 px). Only the inner workspace scrolls. Native popup tests
sample dimensions over time, open the language picker with real input, and verify
Escape focus restoration. Both short-screen headless and desktop headed runs are
checked locally. This fixes the reproduced layout failure; user-specific causes
of flickering outside this path may require additional diagnostics.

The blue redesign is checked with light/dark accessibility scans, narrow settings
layouts, screenshots, and a regression preserving saved themes/custom appearance.
No new runtime dependencies, remote fonts, permissions, or provider behavior were added.

## Continuing live-qualification limits

Do not interpret the existence of a ZIP as proof of full live compatibility.
The code implements the first browser-only feature set. Automated tests cover
contracts and extension interactions; live YouTube/provider qualification is
separately tracked below.

### Completed locally

- Strict TypeScript check and extension build.
- Unit tests: caption parsing/timing/merging, language search/segmentation,
  script-sensitive track selection, normalized settings, secret-free export,
  profile state, URL boundaries, prompts, exact reconstruction, response
  validation, four provider transports, cache identity.
- Packaged application code loaded in isolated Playwright Chromium profiles.
- Native language search, Japanese favorite/selection persistence, profile
  saving/reload, high-contrast styling, and 360 px layout without horizontal scroll.
- Caption discovery/load, translation, Q breakdown, word explanation, and cached
  repeat answer through the real content/worker messaging paths.
- E pause/resume and automatic cue-end pause on real playable silent media.
- Synthetic HTTP 401 and 429 surface errors without retries; altered-source
  breakdowns are rejected through the worker. A delayed response cannot restore
  the study overlay after Stop.
- Synthetic HTTP responses exercised through Groq, OpenAI, Gemini, and OpenRouter
  background adapters. No real provider account or key was used.
- Content-script attempts to read key storage or administer keys rejected.
- Host-page synthetic word clicks and Q events cannot initiate paid study actions.
- Popup initialization, accessible controls, and target-language persistence
  verified, including ordering against the recent-language storage write.
- Typing Q/E does not trigger shortcuts; unrelated keys do not dismiss study.
- Stop removes the overlay; no uncaught page exceptions in the fixture run.
- Axe scans with WCAG 2 A/AA, 2.1 AA, and 2.2 AA tags found no violations on
  Learning, Profiles, Appearance, AI connection, the study dialog, and the popup.
- Screenshots of normal/narrow settings and the study overlay inspected.

### Test harness limitation

Playwright cannot operate Chrome's native optional-host permission prompt
through the page DOM. Browser tests copy the built extension into a temporary
directory and pregrant provider hosts **only in that fixture manifest**. All
application JS/CSS remains the built code. The shipped manifest retains optional
provider permissions. Native consent accept/deny flows are therefore **not**
covered by these browser checks and must be checked manually.

The test video and provider traffic are synthetic. Passing these tests does not
prove a live provider accepts your model or that YouTube serves captions to your
browser/network/account. Axe is not a screen-reader or full accessibility audit.

### Live checks attempted on 2026-09-09

Two public watch pages were tested in fresh, unsigned-in Chromium profiles:
`jNQXAC9IVRw` (headless) and `H14bBuluwB8` (headed). Caption metadata was found
and CC was enabled. Observed native YouTube timedtext requests returned HTTP
200 with zero-byte bodies; the extension's fetch/fallback also received no usable
captions. Native caption text was empty. This is an unresolved live compatibility
limitation in the tested environment, not a successful subtitle test.

The adapter now prefers an observed current request URL for the matching track
before falling back to player metadata, but that did not resolve these runs.
It does not evade YouTube access checks or fabricate cues. Test a normal Chrome
installation/network with accessible captions before relying on this release.

### Manual release-qualification checklist

- [ ] Real Chrome: accept and deny each provider's optional host prompt; denial
      must leave the key unsaved and make no API request.
- [ ] Real captioned YouTube video: human and automatic tracks, seeks, pause,
      full-screen, theater mode, ads, track changes, and navigation.
- [ ] One successful translation, Q breakdown, and word explanation with a real
      user-owned model/key for each of the four providers; verify billing limits.
- [ ] Invalid/revoked key, insufficient quota, 429, offline/timeout, refusal,
      malformed output, and recovery without changing provider silently.
- [ ] Slow answer followed by Stop, seek, track/profile/language switch, or
      another explanation: no stale result or stuck speech.
- [ ] Remembered key survives restart; session-only key clears; exported JSON
      excludes credentials; remove/revoke key and clear cache independently.
- [ ] Browser service-worker suspension/restart recovery and two concurrent tabs.
- [ ] VoiceOver or NVDA: focus, dialog names, word buttons, favorites, and errors;
      200%/400% zoom, forced colors, reduced motion, RTL and CJK long subtitles.
- [ ] Local speech voices in relevant languages; remote voices only after opt-in.

## Reproduce

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:browser
npm run test:popup
node tests/live-youtube.mjs
```

`YOUTUBE_URL` selects a public video for the live probe; `HEADED=1` opens its
isolated browser visibly. Live probes need network access and are intentionally
not a deterministic CI gate. Do not point them at private/sensitive videos.

Browser evidence is written to ignored `test-results/`. CI uploads it alongside
the package. Inspect the actual GitHub Actions result for the tested commit;
this document does not predeclare a future CI run successful.
