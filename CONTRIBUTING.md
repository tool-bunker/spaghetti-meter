# Contributing to Spaghetti Meter

Thanks for helping improve the official pasta science.

## Before you start

- Keep changes focused. Avoid unrelated refactors or dependency updates.
- Open an issue before a large behavioral, scoring, or visual change so the direction can be agreed first.
- Small bug fixes and documentation corrections can go directly to a pull request.
- Preserve the playful tone without hiding how the app actually works.

## Requirements

- Node.js 20 or newer
- Rust and Cargo
- The [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform
- On Linux: x86-64 and glibc 2.39 or newer (Ubuntu 24.04 LTS or newer)

## Set up the project

```sh
npm ci
npm run tauri dev
```

`npm ci` downloads the pinned Code Buster sidecar, verifies its published SHA-256 checksum, and validates the version and report metadata required by scoring. A sibling source checkout is optional; see **Code Buster changes** below.

## Make a change

1. Create a branch from the current default branch.
2. Make the smallest complete change that solves the problem.
3. Update affected documentation and `CHANGELOG.md` under `Unreleased`.
4. Exercise the changed behavior in the running desktop app.
5. Run the relevant checks before opening a pull request.

For visual changes, check the actual app at more than one window size. For export changes, inspect every affected output format rather than relying only on compilation.

## Checks

Run the frontend checks:

```sh
npm run version:check
npm run check
npm test
npm run licenses:check
npm run build
```

Run the Rust checks:

```sh
cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked
```

If a change affects one specific path, also include a focused reproduction or smoke check that proves that behavior.

For startup failures, include the on-screen startup phase and error, application version, and operating-system version. A window opening is not sufficient smoke-test evidence: confirm that the welcome screen actually renders.

## Pull requests

A pull request should include:

- The problem being solved.
- The chosen behavior and any important tradeoffs.
- The commands or scenarios used for verification.
- Screenshots or recordings when the visible interface changes.
- Any platform limitations that were not exercised.

Keep commits reviewable. Curated README screenshots and demo animations belong in `media/`. Do not commit generated build directories, ad-hoc exported result files, local configuration, or editor metadata.

## Code Buster changes

Spaghetti Meter normally bundles a pinned, checksum-verified Code Buster release.

For local engine development, set `SPAGHETTI_METER_CB_SOURCE=../code-buster` before installation and keep it set for builds and license checks. In PowerShell, use `$env:SPAGHETTI_METER_CB_SOURCE = "../code-buster"`. The checkout must match `config.codeBusterVersion`. Preparation supports only host-native sidecars and does not replace an installed `cb`. Local builds are marked separately and cannot be mistaken for cached published binaries. License generation uses the same checkout and includes its runtime dependencies.

Before distribution, publish a compatible Code Buster release, update the configured version, unset `SPAGHETTI_METER_CB_SOURCE`, and prepare the published sidecar. Preparation checks verbose JSON source metrics and finding modes as well as `--version`; matching a version string alone is not sufficient. Follow [RELEASING.md](RELEASING.md).

Changes to Code Buster rules or finding accuracy belong in the [Code Buster repository](https://github.com/tool-bunker/code-buster).

## License

By contributing, you agree that your contribution may be distributed under the repository's [MIT License](LICENSE).
