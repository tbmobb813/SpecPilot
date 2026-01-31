# Scrapers — Design and Maintenance

This document describes the project scrapers, coding conventions, and maintenance practices.

Location
- Scraper scripts live in `scripts/scrapers/` and `scripts/sync/`.
- Export helpers live in `scripts/export/`.

Guidelines
- Set `User-Agent` to `SpecPilot/1.0 (+https://github.com/your-org/SpecPilot)`.
- Respect `robots.txt` and site terms of service.
- Cache HTML responses and re-run only when stale.
- Use rate limits and retries; prefer exponential backoff.

Per-scraper notes
- `scripts/scrapers/techpowerup.js`
  - Target: GPU specification pages on TechPowerUp.
  - Important selectors: model `h1.name`, spec rows under `.specs` — adapt if site changes.
  - Store: `gpus` table fields: model, memory, memory_type, core_clock, boost_clock, tdp, release_year.

- `scripts/scrapers/pcgamingwiki.js`
  - Uses PCGamingWiki API when possible; otherwise scrapes pages.
  - Use `api/appdetails.php?appid=` when available.
  - Normalize `minimum`/`recommended` blocks to `game_requirements` schema.

- `scripts/sync/protondb.js` and `scripts/sync/protondb_apps.js`
  - Primary source: ProtonDB API (summary endpoints). Fallback: per-app HTML.
  - Respect ProtonDB rate limits and use per-domain limits via `--domain-rate`.

Selectors & maintenance
- Keep a short test HTML sample under `tests/fixtures/` for each scraper.
- Add a unit test that parses the sample to detect breakages.
- When a site changes, update selectors and add the new sample to fixtures.

Monitoring
- Record scrape success/failure metrics.
- Alert if failure rate > 10% for a day.

Legal & attribution
- Respect source licenses (e.g., PCGamingWiki CC BY-SA requires attribution).
- Consider sponsoring heavily-used sources if scraping at scale.

Examples
```bash
# Run TechPowerUp GPU scraper with 1s delay
node scripts/scrapers/techpowerup.js --limit=100 --delay=1000

# Run PCGamingWiki for a list of Steam IDs
node scripts/scrapers/pcgamingwiki.js --file=data/games-top-100.json
```

Maintenance checklist
- [ ] Keep selectors in single place at top of file
- [ ] Add test fixtures for each site
- [ ] Document any required headers or cookies
- [ ] Add cron job entries to `DATA_SOURCES.md` for schedule

Contact
- If a scraper breaks, open an issue describing the site change and attach sample HTML.