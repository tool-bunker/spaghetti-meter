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
| Linux | x86_64 | AppImage, Debian package, and RPM package |
| Windows | x86_64 | NSIS installer and MSI package |

The Code Buster sidecar currently supports exactly these targets. Adding another application target requires a matching entry and published Code Buster archive in `scripts/prepare-sidecar.mjs`.

## One-time GitHub setup

1. Push this repository to GitHub and use `main` as the default branch.
2. Enable GitHub Actions.
3. In **Settings → Actions → General → Workflow permissions**, allow read and write access so the release workflow's `GITHUB_TOKEN` can create releases and upload assets.
4. Do not add signing secrets. `.github/workflows/release.yml` intentionally contains no signing environment variables and disables updater metadata and signatures.

## Release checklist

1. Choose the semantic version, without the leading `v` inside manifests.
2. Update the same application version in:
   - `package.json`
   - the root package entry in `package-lock.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`
3. If upgrading Code Buster, update `config.codeBusterVersion` in `package.json` and confirm matching release archives exist for all three targets.
4. Move completed entries from **Unreleased** in `CHANGELOG.md` into a dated version section.
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
   git tag -a v0.1.0 -m "Spaghetti Meter v0.1.0"
   git push <remote> main v0.1.0
   ```

9. `.github/workflows/release.yml` validates the tag against every manifest, builds all supported targets, publishes the GitHub Release, and uploads both release assets and workflow artifacts.
10. Download one artifact from each platform, confirm the unsigned warning is described in the release, and smoke-test folder selection, scanning, result animation, information, replay, and screenshot sharing.

If any matrix job fails, do not move or reuse the tag for different source. Fix the cause, delete the incomplete GitHub Release and remote tag, then recreate that tag from the corrected release commit.
