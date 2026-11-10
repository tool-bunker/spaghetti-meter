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
2. Spaghetti Meter analyzes it with the bundled [Code Buster](https://github.com/tool-bunker/code-buster) executable. No separate Code Buster installation is needed.
3. Watch the prestige score smash into a physics-driven serving of spaghetti.
4. Export the evidence as a PNG image, animated GIF, or silent video.

Share it with your boss. They will definitely love a high score.

## The serious bit

Spaghetti Meter is intentionally lighthearted. Treat the result as a conversation starter, not a software-quality ranking. If a result looks wrong, help [Code Buster](https://github.com/tool-bunker/code-buster) improve its true and false positives.

## Official pasta mathematics

The score measures finding density against analyzed production code, with diminishing returns for repeated findings from the same rule in the same file. Actionable findings retain weight **3**, advisories weight **1**. Naming, style, and security findings still contribute; their categories are not discarded.

Findings are grouped by file, rule, and effective mode. For each group:

```text
L = total analyzed code lines
D = max(L, 1000)
f = max(file code lines, 1)
n = findings in this group
w = 3 for actionable, 1 for advisory

contribution = 100 × w × f / D × log2(1 + 100 × n / f)
score = round(sum(contributions))
```

Project-level findings use `max(L, 1)` for `f`. No findings means zero; otherwise the score is at least one. The 1,000-line floor dampens tiny-project extremes. Raw finding counts remain unchanged.

Code Buster supplies language-aware code-line measurements for exactly the selected files, including embedded code and excluding its inline test regions. String-literal content remains code, including Python runtime docstrings. Skipped files do not enter the denominator. The bowl is around full at 100; overflow remains possible beyond 100, up to the score's 32-bit integer limit.

## Run the app

Requirements: Node.js 20+, Rust, and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/).

Linux requires x86-64 and glibc 2.39 or newer, such as Ubuntu 24.04 LTS.

The pinned Code Buster release supplies the source measurements needed by density-aware scoring:

```sh
npm ci
npm run tauri dev
```

`npm ci` downloads the pinned platform-specific sidecar, verifies its published SHA-256 checksum, and checks its version and verbose report contract. No separate `cb` installation or source checkout is required.

For engine development only, set `SPAGHETTI_METER_CB_SOURCE=../code-buster` before installation and keep it set for builds and license checks. In PowerShell, use `$env:SPAGHETTI_METER_CB_SOURCE = "../code-buster"`. The checkout must match `config.codeBusterVersion`; preparation builds a host-native sidecar without replacing an installed `cb`. Local builds are marked separately and cannot be mistaken for cached published binaries. See [RELEASING.md](RELEASING.md) before distribution.

## Kitchen checks

```sh
npm run version:check
npm run check
npm run licenses:check
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked
```

