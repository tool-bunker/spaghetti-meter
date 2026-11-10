import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const tauriConfig = readJson("src-tauri/tauri.conf.json");
const cargoManifest = readFileSync(fileURLToPath(new URL("../src-tauri/Cargo.toml", import.meta.url)), "utf8");
const cargoLock = readFileSync(fileURLToPath(new URL("../src-tauri/Cargo.lock", import.meta.url)), "utf8");

const versions = new Map([
  ["package.json", packageJson.version],
  ["package-lock.json version", packageLock.version],
  ["package-lock.json packages[\"\"]", packageLock.packages?.[""]?.version],
  ["src-tauri/Cargo.toml", cargoPackageVersion(cargoManifest)],
  ["src-tauri/Cargo.lock", cargoLockPackageVersion(cargoLock, packageJson.name)],
  ["src-tauri/tauri.conf.json", tauriConfig.version],
]);

for (const [file, version] of versions) {
  assertVersion(file, version);
}

const appVersion = packageJson.version;
const mismatches = [...versions].filter(([, version]) => version !== appVersion);
if (mismatches.length > 0) {
  const details = [...versions].map(([file, version]) => `${file}: ${version}`).join("\n");
  throw new Error(`Application versions are not synchronized:\n${details}`);
}

const codeBusterVersion = packageJson.config?.codeBusterVersion;
assertVersion("package.json config.codeBusterVersion", codeBusterVersion);

const releaseTag = process.env.RELEASE_TAG?.trim();
if (releaseTag && releaseTag !== `v${appVersion}`) {
  throw new Error(`Release tag ${releaseTag} does not match application version v${appVersion}`);
}

console.log(
  `Versions synchronized: Spaghetti Meter ${appVersion}, Code Buster ${codeBusterVersion}${releaseTag ? `, release ${releaseTag}` : ""}`,
);

function readJson(path) {
  return JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
}

function cargoPackageVersion(source) {
  const packageSection = source.split(/^\[/m).find((section) => /^package\]\r?\n/.test(section));
  return packageSection?.match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1];
}

function cargoLockPackageVersion(source, name) {
  const packageSection = source.split(/^\[\[package\]\]\r?$/m).find((section) => (
    section.match(/^name\s*=\s*"([^"]+)"\s*$/m)?.[1] === name
  ));
  return packageSection?.match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1];
}

function assertVersion(source, version) {
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`${source} does not contain a valid semantic version`);
  }
}
