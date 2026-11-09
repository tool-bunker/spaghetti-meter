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

## Set up the project

```sh
npm install
npm run tauri dev
```

`npm install` downloads the platform-specific Code Buster sidecar and verifies its published SHA-256 checksum.

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
npm run licenses:check
npm run build
```

Run the Rust checks:

```sh
cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked
```

If a change affects one specific path, also include a focused reproduction or smoke check that proves that behavior.

## Pull requests

A pull request should include:

- The problem being solved.
- The chosen behavior and any important tradeoffs.
- The commands or scenarios used for verification.
- Screenshots or recordings when the visible interface changes.
- Any platform limitations that were not exercised.

Keep commits reviewable and do not commit generated build directories, exported result files, local configuration, or editor metadata.

## Code Buster changes

Spaghetti Meter bundles a pinned Code Buster release. Do not replace the sidecar binary manually. Update the configured version and checksums through the existing sidecar preparation workflow, then verify the reported Code Buster version and scan compatibility.

Changes to Code Buster rules or finding accuracy belong in the [Code Buster repository](https://github.com/tool-bunker/code-buster).

## License

By contributing, you agree that your contribution may be distributed under the repository's [MIT License](LICENSE).
