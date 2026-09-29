// Push main, wait for its CI, then tag the verified commit.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
import { REPOSITORY, validateSource } from "./release-lib.mjs";

const capture = (program, ...args) => execFileSync(program, args, { encoding: "utf8" }).trim();
const run = (program, ...args) => execFileSync(program, args, { stdio: "inherit" });
assert.equal(capture("git", "status", "--porcelain"), "", "Commit all changes before releasing");
assert.equal(capture("git", "branch", "--show-current"), "main", "Release from main");
const origin = capture("git", "remote", "get-url", "origin");
assert.ok(
  [
    `https://github.com/${REPOSITORY}.git`,
    `https://github.com/${REPOSITORY}`,
    `git@github.com:${REPOSITORY}.git`,
  ].includes(origin),
  "origin must point to the release repository",
);
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const { tag } = validateSource(process.cwd(), `v${version}`);
assert.equal(capture("git", "tag", "--list", tag), "", `${tag} already exists locally`);
assert.equal(
  capture("git", "ls-remote", "--tags", "origin", `refs/tags/${tag}`),
  "",
  `${tag} already exists remotely`,
);
const sha = capture("git", "rev-parse", "HEAD");
run("git", "push", "origin", "main");
run("gh", "workflow", "run", "ci.yml", "--repo", REPOSITORY, "--ref", "main");
console.log(`Waiting for CI on ${sha}...`);
let runId;
for (let attempt = 0; attempt < 30; attempt++) {
  const runs = JSON.parse(
    capture(
      "gh",
      "api",
      `repos/${REPOSITORY}/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=20`,
    ),
  ).workflow_runs;
  const latest = runs.find((item) => item.head_sha === sha && item.event === "workflow_dispatch");
  if (latest) {
    runId = latest.id;
    break;
  }
  await setTimeout(2000);
}
assert.ok(runId, "CI did not start; check GitHub Actions and retry");
run("gh", "run", "watch", String(runId), "--repo", REPOSITORY, "--exit-status", "--interval", "20");
assert.equal(capture("git", "rev-parse", "HEAD"), sha, "HEAD changed while waiting for CI");
run("git", "tag", tag, sha);
run("git", "push", "origin", tag);
console.log(`Release started: https://github.com/${REPOSITORY}/actions/workflows/release.yml`);
console.log(
  `After both builds and signature checks pass: https://github.com/${REPOSITORY}/releases/tag/${tag}`,
);
