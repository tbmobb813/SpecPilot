# Data Import — Games & Hardware

This document shows formats and commands to import game and hardware data into the intelligence DB.

Games file format
- Expected JSON: array of objects. Minimal shape supported by `scripts/sync/protondb_apps.js` and `games:import`:

```json
[
  { "steam_id": 570, "name": "Portal 2" },
  { "steam_id": 1091500, "name": "Cyberpunk 2077", "requirements": { /* optional */ } }
]
```

- For full `games` import (with `game_requirements`), include `requirements.publisher.minimum` and `requirements.publisher.recommended` objects using the `HardwareRequirement` schema described in `INTELLIGENCE_LAYER.md`.

Import commands
- Per-app ProtonDB sync (creates/upserts `games` rows):

```bash
node scripts/sync/protondb_apps.js --file=data/games-top-100.json
```

- Custom `games:import` (if implemented) should accept `--file` or `--stdin` and upsert into `games` and `game_requirements`.

Tips
- Ensure `src-tauri/intelligence.db` exists (`npm run intelligence:init`).
- For bulk imports, run during off-peak hours and set `--concurrency` and `--domain-rate` appropriately for remote sources.
- Validate JSON before running:

```bash
jq . data/games-top-100.json > /dev/null
```

- After import, verify tables:

```bash
sqlite3 src-tauri/intelligence.db "SELECT COUNT(*) FROM games;"
sqlite3 src-tauri/intelligence.db "SELECT COUNT(*) FROM proton_compatibility;"
```

Schema compatibility
- The importer will attempt to fill `games.name`; if missing, use placeholder `App <steam_id>`.
- `game_requirements` foreign keys reference `games(id)`. The importer must create `games` rows prior to inserting requirements.

Contact
- If import fails due to schema mismatch, open an issue and attach a minimal JSON sample and the DB schema.