# Changelog

All notable changes to Spaghetti Meter are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.2] - 2026-11-13

### Changed

- Upgrade the bundled, checksum-verified Code Buster engine from 0.14.3 to 0.14.4, including its latest finding-accuracy improvements and refreshed third-party notices.

### Fixed

- Show **Nothing to measure** with an empty bowl for empty folders, unsupported-language projects, and selections without measurable source code. Hide scores, verdicts, evidence counts, replay, and export controls; retain real zero scores for supported code without findings and preserve scanner errors.

## [0.1.1] - 2026-11-10

### Added

- Final-impact hit-stop, screen flash, score echoes, meter threshold pulses, meter recoil, result evidence counts, and persistent score-category atmosphere.
- Persistent centered Spaghetti Meter branding and a clean result export menu for PNG images, animated GIF replays, and silent WebM or MP4 video replays.
- Contributor setup, verification, pull-request, visual-testing, and Code Buster sidecar guidance in `CONTRIBUTING.md`.
- Explicit host-native Code Buster source builds through `SPAGHETTI_METER_CB_SOURCE`, with separate local cache markers, report-contract validation, and complete bundled-engine runtime dependency notices.

### Changed

- Reduced the supplied gradient-outline `bowl.svg` slightly and replaced the old approximate collider curve with side and flat-base colliders sampled from the artwork. Repositioned the scan cancel control beneath its status and added explicit separation between the score badge and repository label.
- Doubled the base spaghetti serving and per-point strand growth through score 100 while retaining slower growth for overflow scores.
- Reduced the rendered and physical bowl scale from 92% to 84% without changing spaghetti spawn depth, and reduced each rope from 12 to 10 physics particles.
- Synchronized the bottom meter's final value with the score-badge impact, faded the temporary counter before it could reveal the result, corrected the scan-cancel link alignment, and made top-control hints dismiss reliably.
- Increased animated GIF exports from 10 to 20 fps and upgraded the bundled, checksum-verified Code Buster sidecar from 0.13.0 to 0.14.3.
- Changed the score badge to scale from oversized to its final size around one fixed center point, without positional travel or camera-punch drift.
- Replaced the primary folder button's purple/cyan hover with a restrained red state and stabilized GIF capture by rendering immediately before copying the transient WebGL backbuffer.
- Aligned the README's wording with the playful competitive-pasta voice used on Toolbunker's Spaghetti Meter page while retaining the scoring and setup details.
- Replace file-count and absolute-volume scoring with code-line-normalized, per-file/rule/mode density scoring and diminishing repeated-finding contributions. Preserve the 3:1 actionable/advisory weights, all finding categories, raw evidence counts, and the bowl's 100-point reference.
- Require canonical analyzed-code metrics and effective finding modes from verbose Code Buster reports instead of inferring modes from severity or falling back to the previous score.

### Fixed

- Run Linux verification and release builds on Ubuntu 24.04 to match the glibc 2.39 minimum required by the bundled Code Buster executable.
- Preserve the sidecar's execution error, exit status or signal, and output when its version check fails instead of reporting every failure as a version mismatch.
- Accept Windows CRLF line endings when validating Cargo package versions and bundled third-party notices.

## [0.1.0]

### Added

- Local repository analysis through a bundled, checksum-verified Code Buster 0.13.0 sidecar.
- Unbounded hybrid spaghetti score that reflects both findings per analyzed file and the absolute finding volume, with repository and version detection, varied verdicts, and playful subverdicts.
- Responsive three-color result meter whose pointer follows the score count through Expected, Overflow, Catastrophe, and 250+ Uncontained states.
- Rapier-powered spaghetti strands, responsive bowl physics, score and verdict stamp impacts, persistent rays, particles, confetti, and reduced-motion behavior.
- Result screenshot sharing through the native share sheet or a user-selected PNG destination.
- Information and third-party license screens with offline Space Grotesk typography and original application artwork.
- Desktop bundles for macOS ARM64, Linux x64, and Windows x64.
- GitHub Actions verification and tag-driven unsigned GitHub Release publishing.
