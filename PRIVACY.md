# Privacy

Vernacue 0.1.0 has no developer-operated backend, analytics, advertising,
tracking SDK, or cloud synchronization. It does not require a Vernacue account.

## Where data goes

| Data                                                     | Destination and purpose                                                                                   |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Caption track metadata and caption requests              | YouTube, to read subtitles for the video you start studying; requests may use your YouTube cookies        |
| Subtitle text and limited nearby context                 | Your selected AI provider, only for enabled translation or requested explanation                          |
| Selected word, source/target/explanation language, model | The same provider, to produce the requested answer                                                        |
| API key                                                  | The selected provider's API host, in an authorization header; never in the request URL                    |
| Text spoken by Listen                                    | Browser speech engine; local voices by default, remote speech services only after you allow remote voices |
| Profiles, favorites, preferences                         | Local extension storage on this device                                                                    |
| Cached answers                                           | Local IndexedDB, bounded to 3,000 entries/about 50 MB, with 30-day expiry                                 |

The AI prompt does not include your account identity, browsing history, or video
URL. Subtitle text itself can contain personal information. Do not use AI on
sensitive content unless you accept the selected provider's data handling.
The browser/provider necessarily sees network metadata such as your IP address.
OpenRouter forwards inference requests to the chosen model provider.

Enabling translation can send the current cue and the next two cues in advance.
Q and word explanations send only the requested text plus bounded context.
Connection testing sends a fixed generated sentence and can incur a charge.
Cancellation stops our waiting and aborts pending network requests; it does not
guarantee a provider has not received, processed, retained, or charged for them.

## Keys and storage

Keys are kept in trusted extension `chrome.storage.session` by default. Choosing
Remember saves that provider key in trusted `chrome.storage.local` instead.
Content scripts cannot read those storage areas directly. Extension-page messages
are checked before accepting key/settings administration. Keys are never returned
to the content script, embedded into page DOM, or included in profile exports.

Browser storage is **not an encrypted secret vault**. A compromised extension,
browser, computer, or browser profile can expose keys. Use a dedicated key with
spending controls where your provider offers them. Remove keys and revoke them
at the provider if compromise is suspected. Session lifetime is controlled by
Chrome; browser restart/extension reload can clear session keys.

Cached entries contain AI answers, hashes of request identity, and timestamps;
answer text may reproduce the original subtitle. Clear them in Profiles & data.
Removing a key does not clear cached answers. Export includes preferences,
favorites, and named profiles, not keys or cached answers. Import replaces
settings/profiles only after confirmation; keys stay unchanged.

## Permissions

- `storage`: local preferences, session keys, and study-session state.
- `scripting`: read caption metadata and, when necessary, fetch signed captions
  in the YouTube page context. Provider keys never enter that context.
- `webRequest`: observe YouTube caption request URLs as a caption-discovery
  fallback. This is not a request-blocking permission. URLs remain temporary
  internal state and are not sent to AI providers.
- `https://www.youtube.com/*`: inject the study overlay and load captions.
- Optional API hosts: requested when you connect that specific provider.
  Removing a key does not revoke host permission; remove site access in Chrome's
  extension controls if you also want to revoke it.

Provider billing, retention, and training policies are outside Vernacue's
control and can change. Review the provider's current policies before use.

## Diagnostics

Do not post API keys, authorization headers, private captions, browser-profile
files, or signed YouTube caption URLs in issues. Automated repository tests use
synthetic keys/captions, not user credentials. Live compatibility tests use a
separate temporary browser profile without personal sign-in.
