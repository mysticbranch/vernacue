# Contributing

Use Node.js 22+, `npm ci`, and the committed lockfile. Runtime code is TypeScript
bundled with esbuild; no runtime framework or backend is required.

1. Open an issue for a substantial scope change. Keep a pull request focused.
2. Change source in `src/`, never generated `dist/` files.
3. Add relevant unit and/or browser regression tests.
4. Run `npm run check` and `npm run test:browser` after installing Playwright
   Chromium (`npx playwright install chromium`). Linux may require
   `npx playwright install --with-deps chromium`.
5. Verify keyboard focus, error recovery, at least one RTL/CJK case, and privacy
   implications. Note manual checks that were not performed.
6. Update docs when behavior, data handling, permissions, or compatibility changes.

Browser tests create isolated profiles and synthetic network responses. Do not
add real API keys or personal browser data to fixtures, screenshots, or logs.
`HEADED=1 npm run test:browser` runs the same test visibly. Generated evidence
is ignored by Git and uploaded as a short-lived CI artifact.

Provider adapters live in `src/ai/providers.ts`; keep transport details separate
from prompts/output validation. Add contract tests before adding a provider.
Language catalog changes must remain independent of speech-voice availability.

Maintain the deliberately small interface: popup for starting/stopping, four
settings sections for persistent preferences, and an on-video study dialog.
Do not add dashboards, local servers, or automatic paid speech to the core flow.

## Release

After CI and the relevant live/manual checks pass, update version references,
run `npm run package`, review the archive contents and checksum, create a tag,
and attach the generated ZIP/checksum to a GitHub release. Mark releases with
incomplete live/provider qualification as prereleases and list limitations.
Never describe fixture tests as live API verification. Keep a prior release
available for rollback and recommend exporting profiles before downgrading.
