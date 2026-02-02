# SpecPilot Infrastructure Architecture

## Overview

SpecPilot uses a **hybrid architecture** that balances cost, performance, and offline capability:

- **Supabase (cloud)**: Shared game data accessible to all users
- **Local SQLite**: User-specific data and offline cache

This approach keeps the desktop app lightweight while enabling data sharing across users.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Supabase Project                          │
│                    (specpilot-db)                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐  ┌─────────────────────┐  ┌─────────────┐  │
│  │   games     │  │ proton_compatibility │  │    gpus     │  │
│  │  (~210K)    │  │      (~210K)         │  │   (~3K)     │  │
│  └─────────────┘  └─────────────────────┘  └─────────────┘  │
│                                                              │
│  ┌─────────────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │steamdeck_compatibility│ │anti_cheat   │  │    cpus     │  │
│  │      (~30K)          │  │  (~700)     │  │   (~2K)     │  │
│  └─────────────────────┘  └─────────────┘  └─────────────┘  │
│                                                              │
│  REST API: https://<project>.supabase.co                     │
│  Anon Key: For read-only public access                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ HTTPS (Supabase JS Client)
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                    Desktop App (Tauri)                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Local SQLite (user_data.db)             │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │  hardware_profile   - Detected PC specs              │    │
│  │  user_preferences   - Settings, UI state             │    │
│  │  game_cache         - Cached game data (offline)     │    │
│  │  verdict_history    - Previous compatibility checks  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  App Data Location:                                          │
│  - Linux: ~/.local/share/specpilot/                         │
│  - Windows: %APPDATA%/specpilot/                            │
│  - macOS: ~/Library/Application Support/specpilot/          │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Distribution

### Supabase (Shared/Cloud)

| Table | Rows | Size Est. | Description |
|-------|------|-----------|-------------|
| `games` | ~210K | ~50MB | Game catalog with Steam IDs, names, metadata |
| `proton_compatibility` | ~210K | ~20MB | ProtonDB ratings and report counts |
| `steamdeck_compatibility` | ~30K | ~5MB | Steam Deck verified/playable status |
| `anti_cheat_status` | ~700 | <1MB | Anti-cheat types and Linux support |
| `gpus` | ~3K | ~1MB | GPU specs, tiers, scores |
| `cpus` | ~2K | ~500KB | CPU specs, tiers, scores |
| **Total** | | **~80MB** | Well within free tier (500MB) |

### Local SQLite (User-Specific)

| Table | Description |
|-------|-------------|
| `hardware_profile` | Detected CPU, GPU, RAM, storage |
| `user_preferences` | UI settings, filters, notification prefs |
| `game_cache` | Local cache of frequently accessed games |
| `verdict_history` | History of compatibility checks |
| `steam_library` | User's installed Steam games |

---

## Supabase Project Setup

### 1. Create Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Project name: `specpilot-db`
4. Database password: (save securely)
5. Region: Choose closest to you

### 2. Get Connection Details

After project creation, go to **Settings > API**:

```env
# .env.local (do NOT commit)
SUPABASE_URL=https://<project-id>.supabase.co
SUPABASE_ANON_KEY=eyJ...  # Public anon key (safe to expose)
SUPABASE_SERVICE_KEY=eyJ...  # Private service key (NEVER expose)
```

### 3. Run Schema Migration

```bash
# Apply schema to Supabase
npm run supabase:schema

# Or manually via Supabase SQL Editor:
# Copy contents of scripts/supabase/schema.sql
```

### 4. Import Data

```bash
# Export from local SQLite
npm run export:supabase

# Import to Supabase
npm run import:supabase
```

---

## Access Patterns

### Read Access (Public)

The desktop app uses the **anon key** for read-only access:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

// Fetch game data (public read)
const { data: games } = await supabase
  .from('games')
  .select('*, proton_compatibility(*), steamdeck_compatibility(*)')
  .eq('steam_id', 1091500)
```

### Write Access (Admin Only)

Data updates use the **service key** (server-side only):

```bash
# Sync scripts run with service key
SUPABASE_SERVICE_KEY=... npm run sync:protondb
```

### Row Level Security (RLS)

All tables have RLS enabled:

```sql
-- Public read access (anon key)
CREATE POLICY "Public read access" ON games
  FOR SELECT USING (true);

-- No public writes
-- Updates only via service key or authenticated admin
```

---

## Sync Strategy

### Initial Setup

```bash
# 1. Export current SQLite data
npm run export:sqlite-to-json

# 2. Create Supabase schema
npm run supabase:schema

# 3. Import data to Supabase
npm run supabase:import
```

### Ongoing Data Updates

```bash
# Run periodically (cron or manual)
npm run sync:protondb      # Updates proton_compatibility
npm run sync:steamdeck     # Updates steamdeck_compatibility
npm run sync:anticheat     # Updates anti_cheat_status
```

### Desktop App Sync

The Tauri app syncs on startup:

```typescript
// On app launch
async function initializeData() {
  // 1. Check local cache age
  const cacheAge = await getLocalCacheAge()

  // 2. If stale (>24h) or empty, fetch from Supabase
  if (cacheAge > 24 * 60 * 60 * 1000 || !cacheAge) {
    await syncFromSupabase()
  }

  // 3. Use local cache for fast queries
  return localDb.query(...)
}
```

---

## Offline Support

The app works offline using local cache:

```
┌─────────────────────────────────────────┐
│            App Startup Flow              │
├─────────────────────────────────────────┤
│                                          │
│  1. Check network connectivity           │
│     │                                    │
│     ├─► Online: Sync from Supabase       │
│     │   - Fetch updated games            │
│     │   - Update local cache             │
│     │   - Store last_sync timestamp      │
│     │                                    │
│     └─► Offline: Use local cache         │
│         - Show "offline mode" indicator  │
│         - Data may be stale              │
│                                          │
│  2. All queries hit local SQLite         │
│     (fast, works offline)                │
│                                          │
└─────────────────────────────────────────┘
```

---

## Cost Analysis

### Supabase Free Tier

| Resource | Free Limit | SpecPilot Usage |
|----------|------------|-----------------|
| Database | 500MB | ~80MB (16%) |
| Auth Users | 50K MAU | N/A (no auth needed) |
| Storage | 1GB | N/A (no files) |
| API Requests | Unlimited | ~1K/day est. |
| Bandwidth | 2GB/month | ~500MB/month est. |

**Verdict**: Free tier is sufficient for personal use and moderate sharing.

### Paid Tier (Pro - $25/mo)

If usage grows:
- 8GB database
- 100GB bandwidth
- Daily backups
- Email support

---

## Security Considerations

### API Key Safety

```typescript
// SAFE: Anon key in client code (read-only)
const supabase = createClient(URL, ANON_KEY)

// NEVER: Service key in client code
// Service key bypasses RLS - only use server-side
```

### Data Privacy

- No user accounts required
- Hardware data stays local (never uploaded)
- Game data is public (from Steam, ProtonDB, etc.)
- No PII collected or stored

### RLS Policies

All tables enforce Row Level Security:

```sql
-- Read: Anyone can read
-- Write: Only service role (admin scripts)
-- Delete: Only service role
```

---

## Migration Checklist

- [ ] Create Supabase project
- [ ] Save connection details to `.env.local`
- [ ] Run schema migration
- [ ] Export local SQLite data
- [ ] Import to Supabase
- [ ] Update Tauri app to use Supabase client
- [ ] Add local SQLite for user data
- [ ] Test offline mode
- [ ] Update sync scripts to target Supabase

---

## File Locations

```
SpecPilot/
├── scripts/
│   └── supabase/
│       ├── schema.sql          # Supabase PostgreSQL schema
│       ├── export-sqlite.js    # Export SQLite → JSON
│       └── import-supabase.js  # Import JSON → Supabase
├── src/
│   └── lib/
│       ├── supabase.ts         # Supabase client config
│       └── local-db.ts         # Local SQLite wrapper
├── src-tauri/
│   └── src/
│       └── database/
│           ├── local.rs        # Local SQLite operations
│           └── remote.rs       # Supabase API calls
└── .env.local                  # Supabase keys (gitignored)
```

---

## Future Considerations

### Multi-User Features (If Needed)

If SpecPilot grows to support user accounts:

1. Enable Supabase Auth
2. Add `user_reports` table for community data
3. Add RLS policies for user-owned data
4. Consider Supabase Realtime for live updates

### Self-Hosting Option

For users who want full control:

```bash
# Docker Compose with Supabase self-hosted
docker-compose -f docker/supabase.yml up

# Point app to local Supabase
SUPABASE_URL=http://localhost:54321
```

---

## Related Documentation

- [INTELLIGENCE_LAYER.md](./INTELLIGENCE_LAYER.md) - Data model and verdict engine
- [DATA_SOURCES.md](./DATA_SOURCES.md) - Where game data comes from
- [PROTONDB_SYNC.md](./PROTONDB_SYNC.md) - ProtonDB sync process
