# Security policy

The latest published 0.1.x version receives security fixes. This is an early
browser extension, not a managed secret-storage service.

## Report a vulnerability

Use GitHub's **Security → Report a vulnerability** on this repository. Do not
open a public issue containing an exploit, key, or private data. If private
reporting is unavailable, open a minimal issue asking for a private reporting
channel without disclosing the vulnerability. No response-time SLA is promised.

Include the affected version, expected trust boundary, minimal reproduction
with synthetic data, and likely impact. Never submit a real API key.

## Security boundaries

- Bundled code only; Manifest V3 CSP forbids remote executable scripts.
- Host-page synthetic clicks, changes, and Q/E keystrokes cannot impersonate
  user interaction to request explanations or enable paid translation.
- AI output is untrusted and rendered with text nodes, not HTML or Markdown HTML.
- Breakdown chunks must reconstruct the exact requested subtitle; malformed,
  oversized, or altered responses are rejected.
- Background requests use fixed provider origins and reject redirects.
- Caption URLs are restricted to YouTube's exact timedtext endpoint.
- API keys are available only to trusted extension contexts. Content-script
  message handling is allowlisted and tied to the current watch-page session.
- Imports are size-limited, schema-validated, and allowlisted. Keys are excluded.
- GitHub Actions have read-only repository permissions and pinned action commits.

YouTube is an untrusted host page. Shadow DOM isolates styling, **not secrets**;
anything visible in the overlay is also observable by page scripts. Provider
credentials never belong in the overlay. This design cannot protect against a
compromised browser, extension update, operating system, or provider.

On suspected key disclosure: revoke the key at its provider, remove it in
Settings, clear affected browser data, and investigate before adding a new key.
