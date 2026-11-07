# Spaghetti Meter

A small cross-platform desktop app that measures how tangled a repository is and drops the result into a bowl of animated spaghetti.

Spaghetti Meter bundles the pinned [Code Buster](https://github.com/tool-bunker/code-buster) 0.12.0 executable and runs it locally. Users do not need to install `cb`, and no source code leaves the computer.

## How the score works

- Each advisory contributes one weighted finding.
- Each actionable finding contributes three weighted findings.
- The score is `100 × weighted findings ÷ max(analyzed files, 10)`.
- `100/100` means one weighted finding per analyzed file and fills the bowl.
- Scores through 100 remain contained; scores above 100 overflow.
- The score is intentionally unbounded so increasingly tangled projects remain distinguishable.
- The displayed score counts up in a circular badge above the bowl and spaghetti. The badge grows with the serving and shifts from green through yellow at the 100 baseline to red at 200.
- Milestones at 50, 100, 150, and 200 add brief score pulses, a baseline rim flash, an overflow wobble, and a pooled catastrophe burst; reduced-motion mode keeps only the final static color.

The visualization is an explanation of the measurement, not a second analysis engine. Code Buster remains the source of scan evidence.

## Using the app

Select a folder from the button above the empty white ceramic bowl. The scan starts immediately. Once the result is ready, native Rapier 2D rope soft bodies fall across the full-window white PixiJS scene, collide with the bowl and neighboring strands, and settle through Rapier's sleep system. Each noodle has 12 simulated particles with structural and bending constraints; PixiJS interpolates those particles into a smooth `MeshRope`. Larger servings build a physical pile above the bowl, and excess strands flow over the rim under gravity without scripted spill forces. Invisible floor and side colliders at the canvas edges keep escaped noodles inside the window; the top remains open for the drop. During the drop, the centered status mirrors the score while the circular badge remains hidden. At completion, the final badge stamps into the center of the bowl and applies a radial impulse to nearby noodles. Click or tap anywhere in the active spaghetti area to trigger another local shockwave and wake the affected soft bodies. The replay button in the top-left restarts the current drop without rescanning. The operating system's reduced-motion preference uses an equivalent static layout and skips impact motion. When the score count finishes, the result beneath the bowl shows the repository name, a version discovered from a common root manifest when available, and the plain-language verdict. Use **Clear bowl · open new folder** to measure another project. The information button opens the score recipe, its lighthearted context, and a link for sharing true and false positives with the [Code Buster project](https://github.com/tool-bunker/code-buster).

Resizing the window recenters the rendered bowl and rebuilds its physics colliders from the same geometry, keeping falling spaghetti aligned with the bowl.

## Requirements

- Node.js 20 or newer
- Rust and the platform prerequisites for [Tauri 2](https://v2.tauri.app/start/prerequisites/)

## Development

```sh
npm install
npm run tauri dev
```

`npm install` and the Tauri build commands download the pinned Code Buster 0.12.0 release for the host target, verify its published SHA-256 checksum, and stage it as a Tauri sidecar. Supported sidecar targets are macOS ARM64, Linux x64, and Windows x64. Bundling is deliberate: installing a CLI into the user's system would mutate their machine, survive app removal, introduce PATH/version ambiguity, and make the first scan depend on network access. The installed application remains offline-capable and always uses the report schema it was built against.

Frontend-only development is available with `npm run dev`, but native folder selection and scanning require Tauri.

## Frontend structure

- `src/app` owns scan state, Tauri commands, scene transitions, and score verdicts.
- `src/scenes` contains the bowl and information screens.
- `src/spaghetti` contains the strand settings, Rapier soft-body world, and PixiJS `MeshRope` rendering adapter. Every noodle is an independent 12-particle rope. Collision-depth layers model the missing third dimension without coupling strand motion.
- `src/ui` contains reusable PixiJS UI controls and the visual theme.

For positive scores, the serving contains `round(5 + min(score, 100) × 1.45 + max(score - 100, 0) × 0.85)` independently simulated strands. The count is not capped.

The interface, text, controls, accessibility overlays, bowl, and animation all use PixiJS. [`@pixi/ui`](https://pixijs.io/ui/) supplies the button interaction layer.

## Licensing and releases

Spaghetti Meter is distributed under the [MIT License](LICENSE). The app's information screen links to the generated `static/THIRD_PARTY_LICENSES.txt`, which inventories the bundled Code Buster executable plus all production npm and runtime Cargo dependencies. The same notice file is also installed as a standalone application resource.

`npm run build` regenerates the notice file before compiling the frontend. After changing `package-lock.json`, `Cargo.lock`, or the Code Buster version, run `npm install` and `npm run licenses:generate`, review the changed inventory, and commit it. The generator fails when a dependency has no declared license. `npm run licenses:check` verifies that the committed file is current.

Some transitive Tauri dependencies use MPL-2.0. Their exact-version source archive URLs are recorded under **MPL-2.0 SOURCE AVAILABILITY** in the generated notice; those URLs and the notice file must remain available in every release.

The repository does not reference external fonts or images; release artwork is limited to `static/spaghetti-meter.svg` and `src-tauri/icons/`. Confirm those files are original or separately licensed before publishing. If any are replaced with third-party artwork, add its required attribution and license text to the release.

## Verification

```sh
npm run check
npm run licenses:check
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked
npm run tauri build -- --debug --no-bundle
```

## Stack

- PixiJS 8, PixiUI 2, the pinned Rapier 2D soft-body canary (Rust/Wasm), and TypeScript
- Vite
- Tauri 2 and Rust
- Code Buster for repository analysis
