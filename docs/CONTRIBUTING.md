# Contributing

Thanks for contributing to SpecPilot! This document explains how to get set up, run tests, and submit changes.

Getting started
1. Fork the repo and clone your fork.
2. Install dependencies:

```bash
npm install
cd src-tauri
cargo test
```

Branching & commits
- Use short-lived feature branches: `feat/`, `fix/`, `chore/`.
- Commit messages: use imperative present tense, e.g. `Add ProtonDB per-app scraper`.
- Rebase instead of merge to keep history clean.

Code style
- Rust: follow `rustfmt` defaults. Run `cargo fmt`.
- JS/TS: follow Prettier/ESLint. Run `npm run lint` if available.

Tests
- Rust: `cd src-tauri && cargo test`
- JS: `npm test`
- Include unit tests for logic changes and integration tests for end-to-end flows.

Pull requests
- Open a PR against `main` with clear description and testing steps.
- Link related issue(s).
- PR should include changelog entry if user-visible.

Review & CI
- All PRs must pass CI (tests + linting).
- Request reviews from maintainers for significant changes.

Security
- Do not commit secrets or keys.
- If you find a security issue, disclose it to maintainers privately via an issue marked `private`.

Maintainer tasks
- Merge PRs after at least one approving review and passing CI.
- Backport critical fixes to release branches as needed.

Thanks for improving SpecPilot! If you need help, open an issue or join the discussion in the repo.