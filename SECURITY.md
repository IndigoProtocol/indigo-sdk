# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities privately — do **not** open a public
issue. Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository, or contact the Indigo Foundation team directly.

## Dependency / supply-chain security

This package applies layered supply-chain protections on both the consumer
side (release-age cooldowns, blocked install scripts, frozen lockfiles,
registry pinning, blocking audits in CI) and the publisher side (OIDC trusted
publishing with provenance, tag-to-version verification, a strict `files`
allowlist, build-on-publish).

See [docs/supply-chain-security.md](docs/supply-chain-security.md) for the
full strategy, the release process, and the policies for adding or updating
dependencies.
