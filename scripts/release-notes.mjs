import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const tag = `v${packageJson.version}`;
if (process.env.RELEASE_TAG && process.env.RELEASE_TAG !== tag) {
  throw new Error(`Release tag ${process.env.RELEASE_TAG} does not match ${tag}`);
}

const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const section = changelog.split(/^## /m).find((entry) => entry.startsWith(`[${packageJson.version}] - `));
if (!section || !/^- /m.test(section)) {
  throw new Error(`CHANGELOG.md has no dated, non-empty section for ${packageJson.version}`);
}

const repository = process.env.GITHUB_REPOSITORY;
if (!repository) {
  throw new Error("Set GITHUB_REPOSITORY to the release's owner/repository");
}
const installationUrl = `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${repository}/blob/${tag}/RELEASING.md`;

process.stdout.write(`Download the bundle for your platform below. Code Buster ${packageJson.config.codeBusterVersion} is bundled; no separate engine installation is required.

## Installation and unsigned-build warnings

These builds are intentionally unsigned and do not include an automatic updater. Download each new release explicitly.

- **Windows x64:** Microsoft Defender SmartScreen may show “Windows protected your PC.” If you trust this release, choose **More info → Run anyway**.
- **macOS ARM64:** Gatekeeper may block the first launch. If you trust this release, Control-click the app, choose **Open**, and confirm, or use **System Settings → Privacy & Security → Open Anyway** after a blocked launch.
- **Linux x64:** Requires glibc 2.39 or newer (for example Ubuntu 24.04). AppImage users may need to mark the file executable before launching it.

See the [installation and distribution guidance](${installationUrl}).

## ${section.trim()}
`);
