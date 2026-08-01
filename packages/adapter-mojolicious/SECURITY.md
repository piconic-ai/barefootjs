# Security Policy

## Supported versions

BarefootJS is in **early alpha** (`0.x`). APIs may change without notice, and
only the latest published release receives security fixes. There are no
long-term support branches at this stage.

| Version | Supported |
|---------|-----------|
| Latest `0.x` release | ✅ |
| Older `0.x` releases | ❌ |

If you are running BarefootJS in production despite the alpha status, please
stay on the most recent release so that fixes reach you.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

Report privately using GitHub's
[private vulnerability reporting](https://github.com/piconic-ai/barefootjs/security/advisories/new)
(the **Report a vulnerability** button under the repository's **Security** tab).
This opens a confidential channel visible only to you and the maintainers.

Please include as much of the following as you can:

- A description of the vulnerability and its impact.
- The affected package(s) and version(s) (e.g. `@barefootjs/jsx`,
  `@barefootjs/client`, the `bf` CLI, or an adapter).
- Steps to reproduce, ideally a minimal reproduction or proof of concept.
- Any known mitigations or workarounds.

Because BarefootJS is a compiler that other projects build on, we take
supply-chain and generated-output safety seriously. Reports about the compiler
emitting unsafe client JS or templates, or about the build/release pipeline,
are in scope and welcome.

## What to expect

- **Acknowledgement** — we aim to acknowledge a valid report within a few
  business days.
- **Assessment** — we will investigate, confirm the issue, and determine the
  affected versions.
- **Fix & disclosure** — we will prepare a fix and coordinate a release. With
  your permission, we will credit you in the advisory and release notes.

Please give us a reasonable opportunity to address the issue before any public
disclosure. We appreciate responsible disclosure and the effort it takes to
report security issues carefully.
