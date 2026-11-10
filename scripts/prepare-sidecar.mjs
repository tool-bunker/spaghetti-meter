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
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = packageJson.config.codeBusterVersion;
const target = process.env.SPAGHETTI_METER_TARGET?.trim() || hostTarget();
const localSource = process.env.SPAGHETTI_METER_CB_SOURCE?.trim();
const release = releaseFor(target);
const binariesDirectory = join(root, "src-tauri", "binaries");
const destination = join(binariesDirectory, `cb-${target}${release.extension}`);
const localSourceMarker = join(binariesDirectory, `cb-${target}.local-source`);

mkdirSync(binariesDirectory, { recursive: true });
if (localSource) {
  installSidecar(buildLocalSidecar(resolve(root, localSource)));
  console.log(`Prepared local Code Buster ${version} sidecar for ${target}`);
  process.exit(0);
}
if (existsSync(destination) && !existsSync(localSourceMarker)
  && !sidecarCompatibilityError(destination, version)) {
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
  if (process.platform !== "win32") chmodSync(extracted, 0o755);
  installSidecar(extracted);
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

function buildLocalSidecar(sourceDirectory) {
  if (target !== hostTarget()) {
    throw new Error("Local Code Buster source builds require the host target");
  }
  const manifest = join(sourceDirectory, "Cargo.toml");
  const metadata = JSON.parse(execFileSync("cargo", [
    "metadata", "--manifest-path", manifest, "--no-deps", "--format-version=1", "--locked",
  ], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }));
  const engine = metadata.packages.find((entry) => entry.name === "code-buster");
  if (engine?.version !== version) {
    throw new Error(`Local Code Buster must match config.codeBusterVersion (${version})`);
  }
  const output = execFileSync("cargo", [
    "build", "--manifest-path", manifest, "--release", "--locked", "--message-format=json",
  ], {
    cwd: sourceDirectory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 32 * 1024 * 1024,
  });
  const artifact = output.split(/\r?\n/).filter(Boolean)
    .map((line) => JSON.parse(line))
    .findLast((entry) => entry.reason === "compiler-artifact"
      && entry.target?.name === "cb" && entry.executable);
  if (!artifact) throw new Error("Cargo did not produce the Code Buster executable");
  return artifact.executable;
}

function installSidecar(executable) {
  const error = sidecarCompatibilityError(executable, version);
  if (error) throw error;
  copyFileSync(executable, destination);
  if (process.platform !== "win32") chmodSync(destination, 0o755);
  if (localSource) writeFileSync(localSourceMarker, "local source build\n");
  else rmSync(localSourceMarker, { force: true });
}

function sidecarCompatibilityError(executable, expectedVersion) {
  const versionError = sidecarVersionError(executable, expectedVersion);
  if (versionError) return versionError;
  const probe = mkdtempSync(join(tmpdir(), "spaghetti-meter-contract-"));
  try {
    writeFileSync(join(probe, "main.rs"), "fn main() {}\n");
    const result = spawnSync(executable, [
      "review", "--advisory", "--verbose", "--no-cache", "--format=json", "--root", probe,
    ], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    if (result.error || result.status !== 0) {
      return new Error(`Code Buster report check failed: ${result.error?.message || result.stderr?.trim() || result.signal || result.status}`);
    }
    let report;
    try {
      report = JSON.parse(result.stdout);
    } catch {
      return new Error("Code Buster returned an invalid JSON report during its compatibility check");
    }
    if (report.sourceMetrics?.schemaVersion === 1
      && report.sourceMetrics.codeLines === 1
      && report.sourceMetrics.fileCodeLines?.["main.rs"] === 1
      && Array.isArray(report.findings)
      && report.findings.every((finding) => finding.mode === "report" || finding.mode === "count")) {
      return null;
    }
    return new Error(
      "This Code Buster build does not provide the verbose sourceMetrics v1 and finding modes required by Spaghetti Meter."
      + " For local development set SPAGHETTI_METER_CB_SOURCE=../code-buster."
      + " Release builds must pin a published Code Buster version providing this report contract.",
    );
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
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
