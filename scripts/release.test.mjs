import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createManifest, REPOSITORY, validateSource, validateTag } from "./release-lib.mjs";

const info = { version: "1.2.3", tag: "v1.2.3", notes: "Company release" };
const assets = [
  "hindsight_1.2.3_x64-setup.exe",
  "hindsight_1.2.3_x64-setup.exe.sig",
  "hindsight_universal.app.tar.gz",
  "hindsight_universal.app.tar.gz.sig",
  "hindsight_1.2.3_universal.dmg",
];

test("manifest supports both Mac architectures and Windows from this repository", () => {
  const manifest = createManifest(
    info,
    assets,
    (name) => `signature:${name}`,
    "2026-09-29T00:00:00Z",
  );
  assert.deepEqual(Object.keys(manifest.platforms), [
    "windows-x86_64",
    "darwin-x86_64",
    "darwin-aarch64",
  ]);
  assert.deepEqual(manifest.platforms["darwin-x86_64"], manifest.platforms["darwin-aarch64"]);
  assert.equal(manifest.version, info.version);
  assert.equal(manifest.notes, info.notes);
  for (const entry of Object.values(manifest.platforms)) {
    assert.ok(entry.url.startsWith(`https://github.com/${REPOSITORY}/releases/download/v1.2.3/`));
    assert.ok(entry.signature.startsWith("signature:"));
  }
});

test("missing platform, installer or signature prevents publication", () => {
  for (const missing of assets) {
    assert.throws(
      () =>
        createManifest(
          info,
          assets.filter((name) => name !== missing),
          () => "signature",
        ),
      /Missing release asset/,
    );
  }
  assert.throws(() => createManifest(info, assets, () => " "), /Empty signature/);
});

test("tags reject paths and shell syntax and allow stable and prerelease versions", () => {
  assert.equal(validateTag("v1.2.3"), "1.2.3");
  assert.equal(validateTag("v1.2.3-beta.1"), "1.2.3-beta.1");
  for (const tag of ["main", "../v1.2.3", "v1.2.3;echo", "v1.2.3\n", "v1.2"]) {
    assert.throws(() => validateTag(tag), /Invalid release tag/);
  }
});

test("source versions, update endpoint, public key and notes are consistent", () => {
  const version = JSON.parse(readFileSync("package.json", "utf8")).version;
  const source = validateSource(process.cwd(), `v${version}`);
  assert.equal(source.prerelease, version.includes("-"));
  assert.throws(() => validateSource(process.cwd(), "v999.0.0"), /version must match/);
});
