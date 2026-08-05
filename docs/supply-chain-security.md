# npm Supply-Chain Security Strategy

This document is the go-to reference for how this repository defends against
npm supply-chain attacks — both as a **consumer** of dependencies and as a
**publisher** of `@indigo-labs/indigo-sdk`. Introduced by
[INDY-11](https://linear.app/indigo-tech/issue/INDY-11/apply-preventions-to-npm-supply-chain-attacks);
the same consumer-side strategy is applied in the `indigo-webapp` repo.

The SDK builds Cardano transactions for a DeFi protocol, and it is itself a
dependency of the Indigo web app — a compromised release here compromises
every consumer downstream. The September 2025 "Shai-Hulud" npm worm
(hijacked maintainer accounts publishing malicious versions that spread via
install scripts) is the motivating incident.

## Consumer-side: threat model → controls

| Threat                                    | Control                                                                                                         | Where configured                                                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Freshly-published malicious version       | 24h release-age cooldown on all resolution, incl. transitives                                                   | `minimumReleaseAge: 1440` in `pnpm-workspace.yaml`                                                                                     |
| Same, via automated update PRs            | 7-day Dependabot cooldown                                                                                       | `cooldown` in `.github/dependabot.yml`                                                                                                 |
| Malicious install/postinstall scripts     | pnpm 10 blocks all dependency lifecycle scripts; **nothing is allowlisted** (build and tests pass without them) | `pnpm-workspace.yaml` (see note at top)                                                                                                |
| Lockfile tampering / registry redirection | Frozen-lockfile installs + CI check that every lockfile URL is `https://registry.npmjs.org/`                    | `--frozen-lockfile` in all workflows; "Lockfile registry check" in `.github/workflows/ci.yml`; `registry` pin in `pnpm-workspace.yaml` |
| Known CVEs                                | Blocking `pnpm audit --prod --audit-level high` on every PR; daily scheduled audit over all deps                | `.github/workflows/ci.yml`, `.github/workflows/audit.yml`                                                                              |
| CI compromise via mutable action tags     | Actions pinned to full commit SHAs; the pnpm binary itself is version-pinned (previously `version: latest`)     | `.github/workflows/*.yml`; `packageManager` in `package.json`                                                                          |
| Over-broad CI token permissions           | `permissions: contents: read` on every workflow (release adds `id-token: write` only)                           | `.github/workflows/*.yml`                                                                                                              |
| Tooling drift                             | Exact pnpm pin (self-managed), Node via `.nvmrc`, `engineStrict`                                                | `package.json`, `pnpm-workspace.yaml`                                                                                                  |

## Publisher-side: protecting consumers of the SDK

| Risk                                                               | Control                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stolen npm token used to publish a malicious version               | **OIDC trusted publishing** — releases are published only by `.github/workflows/release.yml`; no long-lived npm token exists. Requires one-time setup on npmjs.com (package Settings → Publishing access → Trusted publisher → GitHub Actions, repo `IndigoProtocol/indigo-sdk`, workflow `release.yml`). |
| Published artifact doesn't match the source                        | **Provenance attestations** (`publishConfig.provenance`, automatic with trusted publishing) — consumers can run `npm audit signatures` to verify. Releases are tag-triggered, and the workflow fails if the tag doesn't match `package.json` version, so every release maps to an exact commit.           |
| Stale or locally-modified `dist/` shipped                          | `prepublishOnly` rebuilds from source on publish; `dist/` is never committed.                                                                                                                                                                                                                             |
| Accidental files in the tarball (editor configs, tests, env files) | `"files": ["dist"]` allowlist in `package.json` — only `dist/`, `README`, and `package.json` are published.                                                                                                                                                                                               |
| Maintainer account takeover                                        | All npm maintainers must have 2FA enabled; publishing rights limited to trusted publishing once configured (npm setting "Require two-factor authentication or an automation token" → prefer "Trusted publisher only").                                                                                    |

### Release process

1. Bump `version` in `package.json` via a normal PR to `main`.
2. Tag the merge commit: `git tag v<version> && git push origin v<version>`.
3. The `Release` workflow installs (frozen lockfile), runs tests, rebuilds, and
   publishes with provenance. Never publish from a developer machine.

## Policies

### Adding a new dependency

1. **Is it necessary?** Every runtime dep here ships transitively to all SDK
   consumers — the bar is higher than in an application.
2. **Vet it**: age, downloads, maintainers, advisories.
3. New deps are saved exact (`savePrefix: ""`). Existing caret ranges are
   left as-is: the lockfile + `--frozen-lockfile` pins everything, and
   `minimumReleaseAge` covers re-resolution.
4. Never allowlist a package's build script (`allowBuilds`) without reviewing
   what the script does — currently **nothing** is allowlisted.
5. If pnpm refuses a version younger than 24h, wait — don't work around it.

### Audit failures

- **PR CI** (`pnpm audit --prod --audit-level high`): fix by upgrading; if no
  fix exists, add the advisory to `auditConfig.ignoreGhsas` in
  `pnpm-workspace.yaml` with a comment linking the triage decision.
- **Scheduled audit** (all deps incl. dev): triage within one business day.

### Lockfile rules

- `pnpm-lock.yaml` changes are reviewed like code; registry URLs must be
  `registry.npmjs.org` (CI-enforced); never merge past a red lockfile check.
