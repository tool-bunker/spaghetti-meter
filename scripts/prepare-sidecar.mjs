import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = packageJson.config.codeBusterVersion;
const target = process.env.SPAGHETTI_METER_TARGET?.trim() || hostTarget();
const release = releaseFor(target);
const binariesDirectory = join(root, "src-tauri", "binaries");
const destination = join(binariesDirectory, `cb-${target}${release.extension}`);

mkdirSync(binariesDirectory, { recursive: true });
if (existsSync(destination) && !sidecarVersionError(destination, version)) {
  console.log(`Code Buster ${version} sidecar is ready for ${target}`);
  process.exit(0);
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "spaghetti-meter-sidecar-"));
try {
  const baseUrl = `https://github.com/tool-bunker/code-buster/releases/download/v${version}`;
  const archivePath = join(temporaryDirectory, release.archive);
  const [archive, checksums] = await Promise.all([
    download(`${baseUrl}/${release.archive}`),
    download(`${baseUrl}/SHA256SUMS`),
  ]);
  verifyChecksum(archive, checksums.toString("utf8"), release.archive);
  writeFileSync(archivePath, archive);
  execFileSync("tar", ["-xf", archivePath, "-C", temporaryDirectory], {
    stdio: "inherit",
  });

  const extracted = join(temporaryDirectory, `cb${release.extension}`);
  if (!existsSync(extracted)) {
    throw new Error(`Release archive ${release.archive} does not contain cb${release.extension}`);
  }
  copyFileSync(extracted, destination);
  if (process.platform !== "win32") chmodSync(destination, 0o755);
  const versionError = sidecarVersionError(destination, version);
  if (versionError) throw versionError;
  console.log(`Prepared Code Buster ${version} sidecar for ${target}`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

function hostTarget() {
  return execFileSync("rustc", ["--print", "host-tuple"], { encoding: "utf8" }).trim();
}

function releaseFor(targetTriple) {
  const releases = {
    "aarch64-apple-darwin": {
      archive: "code-buster-macos-arm64.tar.gz",
      extension: "",
    },
    "x86_64-unknown-linux-gnu": {
      archive: "code-buster-linux-x64.tar.gz",
      extension: "",
    },
    "x86_64-pc-windows-msvc": {
      archive: "code-buster-windows-x64.zip",
      extension: ".exe",
    },
  };
  const release = releases[targetTriple];
  if (!release) {
    throw new Error(
      `Code Buster does not publish a sidecar for ${targetTriple}. Supported targets: ${Object.keys(releases).join(", ")}`,
    );
  }
  return release;
}

function sidecarVersionError(executable, expectedVersion) {
  const result = spawnSync(executable, ["version"], { encoding: "utf8" });
  const expected = `cb ${expectedVersion}`;
  if (result.status === 0 && result.stdout?.split(/\r?\n/, 1)[0] === expected) return null;

  const status = result.error?.code
    || (result.signal ? `signal ${result.signal}` : `exit code ${result.status}`);
  const diagnostics = [
    result.error?.message,
    result.stderr?.trim(),
    result.stdout?.trim(),
  ].filter(Boolean).join("\n");
  return new Error(
    `Code Buster sidecar version check failed for ${target}; expected "${expected}" (${status}).`
    + (diagnostics ? `\n${diagnostics}` : ""),
  );
}

async function download(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "spaghetti-meter-sidecar-builder" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Could not download ${basename(url)}: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function verifyChecksum(archive, checksumFile, archiveName) {
  const expected = checksumFile
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .find(([, name]) => name === archiveName)?.[0];
  if (!expected) {
    throw new Error(`SHA256SUMS does not contain ${archiveName}`);
  }
  const actual = createHash("sha256").update(archive).digest("hex");
  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${archiveName}`);
  }
}
