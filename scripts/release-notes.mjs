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

process.stdout.write(`Download the app for your platform below. Code Buster ${packageJson.config.codeBusterVersion} is bundled; no separate engine installation is required.

Linux x64 requires glibc 2.39 or newer (for example Ubuntu 24.04). Download new releases manually.

## ${section.trim()}
`);
