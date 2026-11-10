# Releasing Spaghetti Meter

## Distribution policy

Spaghetti Meter is distributed through GitHub Releases. Builds are intentionally unsigned: no Apple certificate, Windows certificate, signing secret, or paid developer account is required. The application does not configure Tauri's updater because updater artifacts require a separate signing key; users download each new release explicitly.

Unsigned applications can trigger operating-system warnings. This is expected and must be stated in every release:

- **Windows:** Microsoft Defender SmartScreen can show “Windows protected your PC.” A user who trusts the downloaded release can choose **More info → Run anyway**.
- **macOS:** Gatekeeper can block the first launch. A user who trusts the downloaded release can Control-click the app, choose **Open**, and confirm. System Settings → Privacy & Security also exposes an **Open Anyway** action after a blocked launch.
- **Linux:** AppImage users may need to mark the downloaded file executable before launching it.

## Published targets

| Platform | Architecture | Expected bundles |
| --- | --- | --- |
| macOS | ARM64 | DMG and application bundle |
| Linux (glibc 2.39+) | x86_64 | AppImage, Debian package, and RPM package |
| Windows | x86_64 | NSIS installer and MSI package |

The Code Buster sidecar currently supports exactly these targets. Adding another application target requires a matching entry and published Code Buster archive in `scripts/prepare-sidecar.mjs`.

Linux CI and release jobs use Ubuntu 24.04. The published Code Buster Linux
sidecar requires glibc 2.39, so Ubuntu 22.04 cannot execute it; upgrading only
the sidecar version does not remove this runtime requirement.

Density-aware scoring requires JSON report schema 3, `sourceMetrics.schemaVersion = 1`, and explicit `report`/`count` finding modes from a verbose review. Code Buster 0.14.3 supplies this contract. Pin a compatible published engine in `package.json` and verify its archives before distributing the application.

`SPAGHETTI_METER_CB_SOURCE` is an explicit local-development override, not a release source. Unset it before the release gate. Preparation rejects incompatible archives and does not treat a marked local build as a cached published sidecar. License generation must also run without the override so notices match the published engine and its runtime dependencies.

## One-time GitHub setup

1. Push this repository to GitHub and use `main` as the default branch.
2. Enable GitHub Actions.
3. In **Settings → Actions → General → Workflow permissions**, allow read and write access so the release workflow's `GITHUB_TOKEN` can create releases and upload assets.
4. Do not add signing secrets. `.github/workflows/release.yml` intentionally contains no signing environment variables and disables updater metadata and signatures.

## Release checklist

1. Choose the semantic version, without the leading `v` inside manifests (this release: `0.1.1`, tag `v0.1.1`).
2. Update the same application version in:
   - `package.json`
   - both the top-level `version` and `packages[""].version` in `package-lock.json`
   - `src-tauri/Cargo.toml`
   - the `spaghetti-meter` package entry in `src-tauri/Cargo.lock`
   - `src-tauri/tauri.conf.json`
3. Pin a compatible published Code Buster version in `config.codeBusterVersion` in `package.json`, confirm matching archives exist for all three targets, unset `SPAGHETTI_METER_CB_SOURCE`, and run `npm run prepare:sidecar` to verify the release's version and report contract.
4. Move completed entries from **Unreleased** in `CHANGELOG.md` into a dated version section, retaining an empty **Unreleased** section and historical releases. For this release, use `## [0.1.1] - 2026-11-10`. `scripts/release-notes.mjs` extracts that full section and adds the bundled engine version, unsigned-platform warnings, and a tag-pinned installation link; set `GITHUB_REPOSITORY` to the GitHub owner/repository when previewing it locally with `node scripts/release-notes.mjs`.
5. Refresh and review legal notices:

   ```sh
   npm ci
   npm run licenses:generate
   ```

6. Run the complete local gate:

   ```sh
   npm run version:check
   npm run check
   npm run licenses:check
   npm run build
   cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
   cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked -- -D warnings
   cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked
   npm run tauri build -- --debug --no-bundle
   actionlint .github/workflows/*.yml
   ```

7. Commit the release changes and push `main`. Wait for `.github/workflows/ci.yml` to pass.
8. Create and push an annotated tag matching the manifest version exactly:

   ```sh
   git tag -a v0.1.1 -m "Spaghetti Meter v0.1.1"
   git push <remote> main v0.1.1
   ```

9. `.github/workflows/release.yml` validates the tag against every app manifest and lockfile version, prepares a shared **draft** GitHub Release, and builds all three supported targets. Each native job uploads its bundles to that same draft and preserves workflow artifacts. Only after **all three platform jobs succeed** does the dependent publication job regenerate the full changelog section and unsigned warnings with `scripts/release-notes.mjs` and publish the complete release. Updater metadata and signatures remain disabled.
10. Confirm the public release contains the full `0.1.1` changelog section (not just autogenerated git notes or a changelog link), Windows/macOS unsigned warnings, Linux requirements, and the installation link. Download one artifact from each platform and smoke-test folder selection, scanning, result animation, information, replay, and screenshot sharing.

If any matrix job fails, the GitHub Release must remain a draft; do not publish incomplete bundles manually. Re-run failed jobs against the same tag and source to finish that draft. Do not move or reuse the tag for different source. If a source fix is required before publication, delete the incomplete draft and remote tag, then recreate that tag from the corrected release commit. An already public release is not accepted as an upload destination.
