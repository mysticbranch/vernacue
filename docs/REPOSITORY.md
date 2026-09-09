# Repository operations

This is a personal, public repository owned by `mysticbranch`. Do not commit
work-account identities, organization credentials, or local browser data.

## Configuration

- Issues enabled; unused wiki and projects disabled.
- Squash merges enabled; merge-commit and rebase merging disabled.
- Automatic deletion of merged branches enabled.
- Dependency alerts, automated security fixes, and Dependabot update PRs.
- Secret scanning and secret push protection enabled.
- Private vulnerability reporting enabled; see SECURITY.md.
- GitHub Actions default token is read-only and cannot approve pull requests.
- Main branch: current `verify` status required, no force pushes or deletion,
  conversation resolution required, pull-request workflow with no mandatory
  second reviewer. The sole administrator retains emergency bypass.

GitHub settings are external state. Re-check them in Settings if ownership,
visibility, or organization policies change. No global Git or SSH configuration
is supplied or changed by this repository.

## CI

`Verify extension` runs on main pushes, pull requests, version tags, and manual
dispatch. Node 22 installs the committed lockfile, checks formatting/types,
runs unit tests, builds, runs isolated Chromium fixture tests, and creates a ZIP
with SHA-256. Actions are pinned to immutable commits. Logs and evidence may be
public; use only synthetic data in CI.

No provider credentials or YouTube account cookies are required or configured
as repository secrets. Live provider and YouTube qualification remain separate
from deterministic CI. Test artifacts expire after 14 days; release downloads
are the durable installable packages.

## Releases and rollback

Publish installable ZIPs as GitHub release assets, not generated files in source
control. Keep incomplete live-qualified builds marked prerelease. A Web Store
submission requires a separately reviewed privacy/permission and browser test
process and is not configured here.

To roll back locally, export profiles, load a prior release folder, and reload
YouTube. Unknown future profile schemas are rejected rather than silently
rewritten. Uninstalling the extension deletes its browser-managed data.
