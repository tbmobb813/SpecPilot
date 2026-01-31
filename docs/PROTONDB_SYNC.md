# ProtonDB Sync — Usage & Options

Scripts:
- `scripts/sync/protondb.js` — aggregated sync (summary endpoints + fallback)
- `scripts/sync/protondb_apps.js` — per-app scraper/upserter (recommended)

`protondb_apps.js` CLI options
- `--file <path>`: JSON array of objects with `steam_id` (or `steamid`/`id`) to sync.
- `<appId> ...`: provide numeric Steam app IDs as args.
- `--rate <ms>`: default per-request delay (ms). Default: 300.
- `--retries <n>`: retry attempts for HTTP fetches. Default: 2.
- `--backoff <factor>`: exponential backoff multiplier. Default: 2.
- `--concurrency <n>`: number of parallel workers. Default: 5.
- `--jitter <ms>`: add up to `jitter` ms random delay per request. Default: 100.
- `--domain-rate <ms>`: shorthand to set per-domain delay for `protondb.com`.
- `--domain-limits <host=ms,host2=ms>`: comma-separated domain-specific delays.

Behavior
- Ensures a `games` row exists before inserting/updating `proton_compatibility`.
- Uses per-domain scheduling to respect site rate limits across workers.
- Falls back to HTML scraping when API endpoints are unavailable.
- Exits with non-zero code on fatal errors (missing file, invalid JSON).

Examples
```bash
# Sync two apps
node scripts/sync/protondb_apps.js 570 550

# Sync from file with 1s per-domain delay and 8 workers
node scripts/sync/protondb_apps.js --file=data/games-top-100.json --domain-rate 1000 --concurrency 8

# Use retries and backoff
node scripts/sync/protondb_apps.js --file=data/games-top-100.json --retries 3 --backoff 2
```

Database
- Database path: `src-tauri/intelligence.db`.
- The script upserts into `games` (steam_id, name) and `proton_compatibility` (game_id, protondb_rating, total_reports, last_synced).

Troubleshooting
- If you see FK/NOT NULL errors, ensure `games` table has appropriate columns and `insertGameBySteamId` prepared statement matches the schema.
- For site changes, update parsing in `fetchRatingForApp` and add sample HTML under `tests/fixtures/protondb/`.

Respectful scraping
- Set `--domain-rate` conservatively; ProtonDB is community-driven.
- Prefer API endpoints if available.
- Cache results and avoid re-syncing unchanged data.