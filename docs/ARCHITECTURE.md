# Architecture and development decisions

## Runtime

```text
Popup / Settings ── validated messages ── MV3 background service worker
                                              │
YouTube content script ── study requests ───────┤
  ├─ isolated Shadow DOM overlay               ├─ provider REST adapters
  ├─ cue clock and session generation          ├─ trusted local/session storage
  └─ optional browser speech                   └─ bounded IndexedDB answer cache
                                              │
                         MAIN-world caption probe/fetch on YouTube only
```

There is one extension package. Neither of the older local-server/browser
extension projects is a runtime dependency. Existing installations are not
migrated, modified, or deleted automatically.

## Components

| Directory                            | Responsibility                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `src/core`                           | Typed settings, validation, language discovery/segmentation, cue parsing/merging |
| `src/sites`                          | YouTube URL checks, current player metadata, bounded caption retrieval           |
| `src/background`                     | Message authorization, session bookkeeping, caption orchestration                |
| `src/ai`                             | Request contracts, exact-text prompts, provider transport, cancellation          |
| `src/storage`                        | Serialized/versioned settings writes, protected keys, answer cache               |
| `src/content`                        | Video clock, generation guards, translation scheduling, overlay, speech          |
| `src/ui`, `src/options`, `src/popup` | Native accessible controls and persistent settings                               |
| `scripts`                            | Deterministic build inputs, original icon generation, ZIP packaging              |
| `tests`                              | Pure contracts, packaged-extension browser fixtures, optional live probe         |

## State and profiles

`Store` schema 1 contains current settings, named profile snapshots, active
profile ID, favorites, recent languages, and an optimistic revision counter.
Current settings persist immediately; saving a profile is explicit. Settings
writes are serialized in the worker and reject outdated revisions. Import
normalizes an allowlist and rejects unknown future schema versions, duplicate
profile IDs, and malformed records.

Keys live under separate `key:<provider>` entries and are never part of `Store`.
Session state binds AI requests to a tab, video ID, and content document ID.
The worker can restart without losing saved preferences or remembered keys.
In-flight jobs are transient; a restart may require Retry or restarting study.

## Caption and AI flow

1. User starts on a regular YouTube watch page. Read current player response.
2. Select an available caption track (exact preferred tag before base-language
   fallback; human tracks preferred within a matching rank). Auto uses an
   available track, not a guarantee of matching YouTube's currently selected CC.
3. Load JSON3 captions, validate timestamps, deduplicate rolling events, and
   optionally merge adjacent short cues without changing source timestamps.
4. An 80 ms clock selects a cue using video time. Pause, seek, ad state, source
   changes, new video, and Stop invalidate or hide relevant work.
5. Translation is on-demand while studying and may prefetch up to two next cues.
   Q or a word action pauses video and requests an explanation. Generation
   checks prevent old responses from replacing the current study result.
6. Cache identity includes operation, exact text/context/word, all relevant
   languages, provider, model, and prompt/schema version. Expiry and bounded
   eviction prevent unlimited storage. Cache failures do not block fresh answers.

Requests have a 25-second deadline, abort support, and a maximum of eight
pending requests per worker. A transient 502/503/504 gets at most one retry;
authorization and rate-limit failures do not trigger retry storms. No provider
fallback happens silently. Provider limits and semantic answer quality remain
outside the extension's control.

## Accessibility and design

Native buttons, inputs, selects, and modal dialogs provide familiar keyboard
behavior. Language results are an ordinary searchable list with separately
labelled favorite buttons, not a custom ARIA combobox. ArrowDown moves from
search to results; Tab reaches items/stars; Escape closes. Focus returns to the
opening control. Dialog content is not dismissed by unrelated keys.

Q/E work only during an active study session and are ignored for editing fields,
modifiers, IME composition, and repeated keydown. They can be disabled. Every
shortcut has a visible button. Subtitle words remain plain selectable text with
inline explanation buttons; phrase entry provides a fallback. RTL direction
and `Intl.Segmenter` support non-space-delimited scripts. Original captions are
not continuously announced through an ARIA live region; request status is.

Settings use four sections, system fonts, restrained colors, visible focus,
responsive layouts, and no essential animation. High contrast uses opaque black
and white. Transparent/custom backgrounds can reduce contrast over a video;
the UI warns rather than claiming every custom combination is accessible.

## Deferred scope

Web Store submission, Firefox/Safari/mobile, Shorts/live/embedded video,
transcription, multiple simultaneous translation lanes, accounts/cloud sync,
flashcards, provider-paid TTS, keyboard remapping, and automatic legacy data
migration are not part of 0.1.0. These should be separately scoped and verified.
