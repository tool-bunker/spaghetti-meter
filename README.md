# Spagetti

A small cross-platform desktop app that measures how tangled a repository is and drops the result into a bowl of animated spaghetti.

Spagetti bundles [Code Buster](https://github.com/tool-bunker/code-buster) and runs it locally. Users do not need to install `cb`, and no source code leaves the computer.

## How the score works

- Each advisory contributes one weighted finding.
- Each actionable finding contributes three weighted findings.
- The score is `100 × weighted findings ÷ max(analyzed files, 10)`.
- `100/100` means one weighted finding per analyzed file and fills the bowl.
- Scores through 100 remain contained; scores above 100 overflow.
- The score is intentionally unbounded so increasingly tangled projects remain distinguishable.

The visualization is an explanation of the measurement, not a second analysis engine. Code Buster remains the source of scan evidence.

## Using the app

Select a folder from the button above the empty bowl. The scan starts immediately, the repository name appears, and deformable spaghetti falls across the full-window PixiJS scene, collides, and settles into the bowl when Code Buster finishes. Larger servings fill the bowl; the messiest can drape over its rim. Settled strands keep a gentle idle motion instead of freezing; the operating system's reduced-motion preference keeps the bowl static. The result shows the strand count and a plain-language verdict. Use **Clear bowl · open new folder** to measure another project, or the information button in the top-right corner to open the scoring explanation.

## Requirements

- Node.js 20 or newer
- Rust and the platform prerequisites for [Tauri 2](https://v2.tauri.app/start/prerequisites/)

## Development

```sh
npm install
npm run tauri dev
```

`npm install` and the Tauri build commands download the pinned Code Buster release for the host target, verify its published SHA-256 checksum, and stage it as a Tauri sidecar. Supported sidecar targets are macOS ARM64, Linux x64, and Windows x64. The installed application does not need network access or a system `cb` executable.

Frontend-only development is available with `npm run dev`, but native folder selection and scanning require Tauri.

## Frontend structure

- `src/app` owns scan state, Tauri commands, scene transitions, and score verdicts.
- `src/scenes` contains the bowl and information screens.
- `src/spaghetti` contains the configurable strand settings and simulation.
- `src/ui` contains reusable PixiJS UI controls and the visual theme.

The interface, text, controls, accessibility overlays, bowl, and animation all use PixiJS. [`@pixi/ui`](https://pixijs.io/ui/) supplies the button interaction layer.

## Verification

```sh
npm run check
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked
npm run tauri build -- --debug --no-bundle
```

## Stack

- PixiJS 8, PixiUI 2, and TypeScript
- Vite
- Tauri 2 and Rust
- Code Buster for repository analysis
