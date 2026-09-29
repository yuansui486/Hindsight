import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

export const REPOSITORY = "yuansui486/Hindsight";
export const UPDATE_ENDPOINT = `https://github.com/${REPOSITORY}/releases/latest/download/latest.json`;

export function validateTag(tag) {
  assert.match(
    tag ?? "",
    /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/,
    "Invalid release tag",
  );
  assert.equal(tag.trim(), tag, "Invalid release tag");
  return tag.slice(1);
}

export function validateSource(root, tag) {
  const read = (name) => readFileSync(path.join(root, name), "utf8");
  const pkg = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  const config = JSON.parse(read("src-tauri/tauri.conf.json"));
  const cargo = read("src-tauri/Cargo.toml").match(
    /^\[package\][\s\S]*?^version = "([^"]+)"/m,
  )?.[1];
  const cargoLock = read("src-tauri/Cargo.lock").match(
    /^name = "hindsight"\r?\nversion = "([^"]+)"/m,
  )?.[1];
  const version = validateTag(tag);
  for (const [name, actual] of Object.entries({
    package: pkg.version,
    npmLock: lock.version,
    npmRoot: lock.packages[""].version,
    tauri: config.version,
    cargo,
    cargoLock,
  })) {
    assert.equal(actual, version, `${name} version must match ${tag}`);
  }
  assert.deepEqual(
    config.plugins.updater.endpoints,
    [UPDATE_ENDPOINT],
    "Unexpected update repository",
  );
  const publicKey = Buffer.from(config.plugins.updater.pubkey, "base64").toString("utf8");
  assert.match(
    publicKey,
    /^untrusted comment: [^\r\n]+\r?\n[A-Za-z0-9+/=]+\s*$/,
    "Invalid updater public key",
  );
  assert.equal(
    Buffer.from(publicKey.trim().split(/\r?\n/)[1], "base64").length,
    42,
    "Invalid minisign public key",
  );
  const notesPath = path.join(root, "docs", "release-notes", `${tag}.md`);
  const notes = readFileSync(notesPath, "utf8");
  assert.ok(notes.trim(), "Release notes must not be empty");
  return { version, tag, notes, notesPath, publicKey, prerelease: version.includes("-") };
}

export function createManifest(
  { version, tag, notes },
  assetNames,
  readSignature,
  pubDate = new Date().toISOString(),
) {
  assert.equal(validateTag(tag), version);
  const names = new Set(assetNames);
  const win = `hindsight_${version}_x64-setup.exe`;
  // The macOS updater archive follows the app bundle name.
  const mac = "hindsight_universal.app.tar.gz";
  for (const name of [win, `${win}.sig`, mac, `${mac}.sig`, `hindsight_${version}_universal.dmg`]) {
    assert.ok(names.has(name), `Missing release asset: ${name}`);
  }
  const entry = (name) => {
    const signature = readSignature(`${name}.sig`).trim();
    assert.ok(signature.length > 0, `Empty signature: ${name}`);
    return { signature, url: `https://github.com/${REPOSITORY}/releases/download/${tag}/${name}` };
  };
  return {
    version,
    notes,
    pub_date: pubDate,
    platforms: {
      "windows-x86_64": entry(win),
      "darwin-x86_64": entry(mac),
      "darwin-aarch64": entry(mac),
    },
  };
}
