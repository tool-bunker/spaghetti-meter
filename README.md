<p align="center">
  <img src="static/spaghetti-meter.svg" alt="Spaghetti Meter app icon" width="160" />
</p>

<h1 align="center">Spaghetti Meter</h1>

<p align="center">
  <strong>Higher score. Better engineer. Probably.</strong>
</p>

<p align="center">
  The most important score in software: a local desktop app that turns a repository into a bowl of animated spaghetti.
</p>

## Become unreasonably successful

1. Select a repository.
2. Spaghetti Meter analyzes it with the bundled [Code Buster](https://github.com/tool-bunker/code-buster) 0.14.1 executable.
3. Watch the prestige score smash into a physics-driven serving of spaghetti.
4. Export the evidence as a PNG image, animated GIF, or silent video.

Share it with your boss. They will definitely love a high score.

## The serious bit

Spaghetti Meter is intentionally lighthearted. Treat the result as a conversation starter, not a software-quality ranking. If a result looks wrong, help [Code Buster](https://github.com/tool-bunker/code-buster) improve its true and false positives.

## Official pasta mathematics

Findings receive a weighted total:

```text
W = actionable × 3 + advisory
```

The displayed score is the larger of:

```text
density = 100 × W / max(analyzed files, 10)
volume  = 75 × log10(1 + W / 10)
```

Files skipped by Code Buster are excluded. Scores are not capped. There is always room for more spaghetti.

## Run the app

Requirements: Node.js 20+, Rust, and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm install
npm run tauri dev
```

`npm install` downloads the Code Buster sidecar for the current platform and verifies its published SHA-256 checksum.

## Kitchen checks

```sh
npm run version:check
npm run check
npm run licenses:check
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked
```

