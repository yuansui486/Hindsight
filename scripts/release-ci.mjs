import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createManifest, REPOSITORY, validateSource } from "./release-lib.mjs";

const info = validateSource(process.cwd(), process.env.RELEASE_TAG);
assert.equal(
  process.env.GITHUB_REPOSITORY,
  REPOSITORY,
  "Release must run in the configured repository",
);
const dir = mkdtempSync(path.join(tmpdir(), "hindsight-release-"));
const gh = (...args) => execFileSync("gh", args, { encoding: "utf8" }).trim();
const api = (endpoint) => JSON.parse(gh("api", `repos/${REPOSITORY}/${endpoint}`));
const keyFile = path.join(dir, "updater.pub");
writeFileSync(keyFile, info.publicKey);

function verifySignature(file) {
  const signaturePath = `${file}.minisig`;
  writeFileSync(signaturePath, Buffer.from(readFileSync(`${file}.sig`, "utf8").trim(), "base64"));
  execFileSync("minisign", ["-Vm", file, "-p", keyFile, "-x", signaturePath], { stdio: "inherit" });
}

function draftRelease() {
  // REST's tag lookup excludes drafts; gh also looks up pending tags via GraphQL.
  const release = JSON.parse(
    gh(
      "release",
      "view",
      info.tag,
      "--repo",
      REPOSITORY,
      "--json",
      "databaseId,isDraft,isPrerelease",
    ),
  );
  assert.ok(
    release.isDraft,
    "Release is already public; publish a new version instead of replacing installed update assets",
  );
  return release;
}

if (process.argv[2] === "prepare") {
  assert.ok(process.env.TAURI_SIGNING_PRIVATE_KEY, "Missing TAURI_SIGNING_PRIVATE_KEY secret");
  assert.ok(
    process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD,
    "Missing TAURI_SIGNING_PRIVATE_KEY_PASSWORD secret",
  );
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const tagSha = execFileSync("git", ["rev-list", "-n", "1", `refs/tags/${info.tag}`], {
    encoding: "utf8",
  }).trim();
  assert.equal(sha, tagSha, "Checkout must match the requested tag");
  const runs = api(`actions/workflows/ci.yml/runs?head_sha=${sha}&status=success&per_page=100`);
  assert.ok(
    runs.workflow_runs.some((run) => run.head_sha === sha && run.conclusion === "success"),
    "CI must pass for this exact commit before release. Run CI, then rerun Release.",
  );

  // Fail before expensive builds if the secret does not match the embedded key.
  const probe = path.join(dir, "signing-probe.txt");
  writeFileSync(probe, `${REPOSITORY} ${info.tag} ${sha}\n`);
  const signed = spawnSync(
    process.execPath,
    ["node_modules/@tauri-apps/cli/tauri.js", "signer", "sign", probe],
    { encoding: "utf8" },
  );
  assert.equal(
    signed.status,
    0,
    "Signing preflight failed; check key/password secrets (output withheld)",
  );
  verifySignature(probe);

  const existing = spawnSync("gh", ["release", "view", info.tag, "--repo", REPOSITORY], {
    stdio: "ignore",
  });
  if (existing.status !== 0) {
    gh(
      "release",
      "create",
      info.tag,
      "--repo",
      REPOSITORY,
      "--verify-tag",
      "--draft",
      "--title",
      `Hindsight ${info.tag}`,
      "--notes-file",
      info.notesPath,
      ...(info.prerelease ? ["--prerelease"] : []),
    );
  }
  const release = draftRelease();
  assert.equal(
    release.isPrerelease,
    info.prerelease,
    "Existing draft has a different prerelease setting",
  );
  appendFileSync(process.env.GITHUB_OUTPUT, `release_id=${release.databaseId}\n`);
  console.log(`Validated ${info.tag} at ${sha}; draft ${release.databaseId} is ready.`);
} else if (process.argv[2] === "publish") {
  draftRelease();
  gh("release", "download", info.tag, "--repo", REPOSITORY, "--dir", dir);
  const manifest = createManifest(info, readdirSync(dir), (name) =>
    readFileSync(path.join(dir, name), "utf8"),
  );
  for (const name of new Set(
    Object.values(manifest.platforms).map((entry) => path.basename(new URL(entry.url).pathname)),
  )) {
    verifySignature(path.join(dir, name));
  }
  const manifestPath = path.join(dir, "latest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  gh("release", "upload", info.tag, manifestPath, "--repo", REPOSITORY, "--clobber");
  // Keep localized notes in the updater; show the English section on GitHub.
  const english = info.notes.match(/<!-- en -->\s*([\s\S]*?)(?=<!-- [a-z]{2} -->|$)/)?.[1].trim();
  const bodyPath = path.join(dir, "release-body.md");
  writeFileSync(
    bodyPath,
    english
      ? `${english}\n\n---\nThe in-app updater shows release notes in your interface language.\n`
      : info.notes,
  );
  gh(
    "release",
    "edit",
    info.tag,
    "--repo",
    REPOSITORY,
    "--draft=false",
    `--latest=${!info.prerelease}`,
    "--notes-file",
    bodyPath,
  );
  console.log(`Published https://github.com/${REPOSITORY}/releases/tag/${info.tag}`);
} else {
  throw new Error("Usage: node scripts/release-ci.mjs prepare|publish");
}
