Title: Add intelligence exports, Linux compatibility checks, DB schema & seed/sync scripts (plus docs/data)

Summary

This PR primarily began as documentation and data updates (onboarding, NEXT_STEPS, and a curated `data/popular-games.json`) but also introduces substantial runtime/backend changes that reviewers should evaluate for risk and scope:

Notable code/runtime changes (high-level)

- Intelligence module exports and new Rust logic: additions under `src-tauri/src/intelligence/` (e.g., `bottleneck.rs`, `lookup.rs`, `rules.rs`) that implement compatibility reasoning and decision logic.
- Linux compatibility evaluation: platform-specific hardware checks and compatibility code under `src-tauri/src/hardware/platform/linux.rs` and related `src-tauri/src/hardware/*` modules.
- Database schema and migration: `src-tauri/src/database/schema.sql` plus changes in `src-tauri/src/db.rs` that alter database initialization and schema application logic; `src-tauri/intelligence.db` included as seed/example data.
- Sync/seed scripts & scrapers: new/updated Node scripts in `scripts/`, including `scripts/sync/*` and `scripts/scrapers/*` that change data sync behavior and seeding.
- Frontend test/coverage tooling and data additions: `vitest.config.ts`, `package.json` updates, `coverage/` artifacts, and multiple new/expanded frontend tests under `src/components/__tests__/`.

Why this matters

- These are not just docs/data edits: the PR adds runtime logic (Rust backend) and data migration concerns that can affect app startup, DB migrations, and platform behavior.
- Reviewers should pay attention to schema changes, migration idempotency, DB file inclusion, and the Linux-specific hardware evaluation path.

Files / areas to review (non-exhaustive)

- `src-tauri/src/intelligence/` (new logic & exports)
- `src-tauri/src/hardware/platform/linux.rs` (Linux checks)
- `src-tauri/src/database/schema.sql` and `src-tauri/src/db.rs` (schema & migration)
- `scripts/sync/` and `scripts/scrapers/` (seed/sync behavior)
- `src-tauri/intelligence.db` (binary DB included in repo)
- `package.json`, `vitest.config.ts`, and `coverage/` (tooling changes)
- `data/popular-games.json` (new curated data used by tests/seeding)

Risk / Impact

- Database: Schema changes and a bundled DB file can cause unexpected runtime migrations or conflicts when upgrading. Verify migration logic is idempotent and safe for existing installs.
- Platform behavior: Linux-only checks should fail gracefully on other platforms and not crash the app.
- Security/privacy: Check whether any scraped or seeded data (e.g., `intelligence.db`) contains sensitive information and whether telemetry or seed scripts send outbound requests.

Suggested reviewers / checks

- Backend/Rust: review `src-tauri` changes (schema, migrations, intelligence logic).
- DevOps/Packaging: confirm inclusion of `src-tauri/intelligence.db` is intentional and that packaging excludes large binaries as needed.
- QA: run seeding/sync scripts and the Tauri app on Linux to validate compatibility paths.
- Frontend: quick pass on test updates and `vitest` config changes.

Testing steps

- Run unit tests: `npm run test` and `npm run test:coverage` for front-end.
- Build and run Tauri backend: `cargo build` then run the app on Linux to exercise the hardware checks and DB initialization.
- Run the sync/seed scripts in a sandbox environment (they perform network requests) and verify the DB updates as expected.

If you'd like, I can:
- Update the PR title/body now (I can apply the change through the GitHub CLI), or
- Open a suggested PR description here for manual copy/paste.

