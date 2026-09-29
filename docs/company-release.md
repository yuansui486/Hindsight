# Company releases

Releases and automatic updates are hosted at
[yuansui486/Hindsight](https://github.com/yuansui486/Hindsight/releases).
The supported packages are Windows x64 (NSIS) and macOS universal (Intel and Apple
Silicon, macOS 14 or newer). Linux packages are not published by this workflow.

## Signing setup

The app embeds the public key in `src-tauri/tauri.conf.json`. The corresponding
private key and password are stored in these repository Actions secrets:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Keep an encrypted backup of the private key and its password outside Git. The
initial local backup is under `%USERPROFILE%\.tauri\hindsight-yuansui486`, with
directory access restricted to the creating Windows account and SYSTEM. Store a
separate secure backup before replacing this workstation. Do not regenerate the
key for subsequent releases: installed clients trust the existing public key.

The macOS app uses ad-hoc signing (`signingIdentity: "-"`) and is not notarized.
No Apple account or certificate secrets are required. First launch may require
allowing the app in System Settings → Privacy & Security. Tauri update signatures
are independent from Apple signing and are verified for both operating systems.
Windows installers are not Authenticode-signed.

## Publish a version

1. Update the version in `package.json`, both root version fields in
   `package-lock.json`, `src-tauri/Cargo.toml`, the `hindsight` entry in
   `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`.
2. Add `docs/release-notes/v<version>.md`, preserving the language markers used by
   existing release notes. Commit all changes on `main`.
3. Run `npm run release`. It pushes `main`, triggers CI and waits for success,
   then pushes the version tag. GitHub CLI authentication and push access are
   required locally. Alternatively, after CI passes on the exact commit, push
   its `v<version>` tag yourself.
4. Watch the Release workflow. It checks source versions, notes, CI status and
   the signing key, then creates a draft. Windows and macOS build independently.
   Only after both succeed does it verify signatures, create the complete
   `latest.json`, and publish the release.

The workflow can also be dispatched manually with an **existing tag**. It always
checks out that tag, including its notes and public key. On failure, fix external
configuration and rerun failed jobs. If source changes are needed, use a new
version and tag; never move a tag already distributed to users. Published releases
are not overwritten. Incomplete builds remain drafts and do not affect updates.

Versions with a prerelease suffix such as `-beta.1` remain prereleases. Stable
clients use `/releases/latest/download/latest.json` and therefore do not receive
prereleases. The manifest maps both macOS architectures to the same universal
archive and Windows x64 to the NSIS installer.

## Verification and first installation

Run `npm run build`, `npm test`, and `node --test scripts/release.test.mjs` locally.
CI also checks Rust formatting, clippy on Windows and tests on macOS. Release CI
checks both macOS binary architectures and its ad-hoc signature. Actual first
launch and update installation still need desktop testing on each OS.

Users of the original upstream app must manually install this fork once: the
upstream binary still points to the original update server and public key. The
application identifier and data paths are preserved, so installing this fork is
an in-place replacement. Back up important data before rollout.

The public repository's installers and update manifest are downloadable without
credentials. Making it private would require a different update distribution
design; never embed a GitHub access token in the desktop app.
