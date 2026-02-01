import { useState, useEffect, useCallback } from 'react';
import { invokeTauri } from '../api/tauri';
import { HardwareProfile } from '../api/hardware';
import { UnifiedVerdictDashboard } from './UnifiedVerdictDashboard';

interface GameResult {
  steam_id: number;
  name: string;
  genre: string | null;
  release_year: number | null;
  header_image: string | null;
  protondb_rating: string | null;
  deck_status: string | null;
  anti_cheat_type: string | null;
  anti_cheat_status: string | null;  // "supported", "denied", "broken", "unknown"
  verdict: VerdictResult | null;
}

interface VerdictResult {
  status: string;
  confidence: string;
  summary: string;
  details: string[];
  min_requirements: RequirementsSummary | null;
  rec_requirements: RequirementsSummary | null;
}

interface RequirementsSummary {
  cpu_text: string | null;
  ram_gb: number | null;
  gpu_text: string | null;
  gpu_vram_gb: number | null;
  storage_gb: number | null;
}

interface GameLibraryProps {
  hardwareProfile: HardwareProfile | null;
}

type VerdictFilter = 'all' | 'can_run' | 'minimum' | 'wont_run';

export function GameLibrary({ hardwareProfile }: GameLibraryProps) {
  const [games, setGames] = useState<GameResult[]>([]);
  const [filteredGames, setFilteredGames] = useState<GameResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameResult | null>(null);
  const [checkingGame, setCheckingGame] = useState<number | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>('all');
  const [genreFilter, setGenreFilter] = useState<string>('all');
  const [hideAntiCheatBlocked, setHideAntiCheatBlocked] = useState(false);
  const [availableGenres, setAvailableGenres] = useState<string[]>([]);

  // Load all games on mount and whenever `hardwareProfile` changes so
  // compatibility verdicts are computed for the current hardware.
  useEffect(() => {
    loadGames();
  }, [hardwareProfile]);

  const loadGames = async () => {
    setLoading(true);
    setLoadingProgress(null);
    setError(null);

    try {
      const results: GameResult[] = await invokeTauri('browse_games', {
        filter_verdict: null,
        filter_genre: null,
        limit: 500,
        offset: 0,
      });

      // Check compatibility for each game if hardware is available
      // Process in batches to avoid overwhelming the backend
      // Performance concern — loading many games (e.g. 500)
      // and then issuing batches of Tauri `check_game_compatibility` calls
      // (20 at a time) still results in many IPC invocations and can take a
      // long time or freeze the UI. Consider the following mitigations:
      // 1) Implement progressive loading / pagination instead of fetching all games.
      // 2) Show a progress indicator (already present) and allow cancellation.
      // 3) Move batch processing server-side (bundle checks into fewer IPC calls).
      // 4) Reduce default batch size via `VITE_GAME_CHECK_BATCH_SIZE` for low-power devices.
      if (hardwareProfile) {
        // Read batch size from Vite env `VITE_GAME_CHECK_BATCH_SIZE`.
        // Configuration:
        //   - Define `VITE_GAME_CHECK_BATCH_SIZE=<positive integer>` in your `.env`, `.env.local`,
        //     or other Vite-supported env file.
        //   - This value controls how many games are checked per IPC batch when calling
        //     `check_game_compatibility`. Smaller values reduce peak load/IPC pressure
        //     but may increase total elapsed time.
        //   - If the variable is unset, non-numeric, or not a positive number, the default
        //     `DEFAULT_BATCH_SIZE` (20) is used.
        const rawBatchSize = import.meta?.env?.VITE_GAME_CHECK_BATCH_SIZE;
        const envSize = typeof rawBatchSize === 'string' ? Number(rawBatchSize) : NaN;
        const DEFAULT_BATCH_SIZE = 20;
        const BATCH_SIZE = Number.isFinite(envSize) && envSize > 0 ? envSize : DEFAULT_BATCH_SIZE;

        // Show games immediately without verdicts, then update progressively
        setGames(results);
        setLoading(false);

        const gamesWithVerdicts: GameResult[] = [...results];

        for (let i = 0; i < results.length; i += BATCH_SIZE) {
          const batch = results.slice(i, i + BATCH_SIZE);
          const batchResults = await Promise.all(
            batch.map(async (game) => {
              try {
                const verdict: VerdictResult = await invokeTauri('check_game_compatibility', {
                  steam_id: game.steam_id,
                  hardware: hardwareProfile,
                });
                return { ...game, verdict };
              } catch {
                return game;
              }
            })
          );

          // Update games array with new verdicts
          batchResults.forEach((result, batchIndex) => {
            gamesWithVerdicts[i + batchIndex] = result;
          });

          // Update UI progressively
          setGames([...gamesWithVerdicts]);
          setLoadingProgress({ current: i + batch.length, total: results.length });
        }
        setLoadingProgress(null);
      } else {
        setGames(results);
      }

      // Extract unique genres
      const genres = new Set<string>();
      results.forEach(g => {
        if (g.genre) {
          g.genre.split(',').forEach(genre => {
            genres.add(genre.trim());
          });
        }
      });
      setAvailableGenres(Array.from(genres).sort());

    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setLoadingProgress(null);
    }
  };

  const applyFilters = useCallback(() => {
    let filtered = [...games];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(g =>
        g.name.toLowerCase().includes(query)
      );
    }

    // Verdict filter
    if (verdictFilter !== 'all' && hardwareProfile) {
      filtered = filtered.filter(g => {
        if (!g.verdict) return verdictFilter === 'wont_run';
        const status = g.verdict.status;
        switch (verdictFilter) {
          case 'can_run':
            return status === 'exceeds_recommended' || status === 'meets_recommended';
          case 'minimum':
            return status === 'meets_minimum';
          case 'wont_run':
            return status === 'below_minimum';
          default:
            return true;
        }
      });
    }

    // Genre filter
    if (genreFilter !== 'all') {
      filtered = filtered.filter(g =>
        g.genre?.toLowerCase().includes(genreFilter.toLowerCase())
      );
    }

    // Anti-cheat filter
    if (hideAntiCheatBlocked) {
      filtered = filtered.filter(g => !isAntiCheatBlocked(g));
    }

    setFilteredGames(filtered);
  }, [games, searchQuery, verdictFilter, genreFilter, hideAntiCheatBlocked, hardwareProfile]);

  // Call applyFilters whenever inputs or the callback identity change.
  // `applyFilters` depends on `hardwareProfile`, so include it indirectly
  // by depending on the stable `applyFilters` reference.
  useEffect(() => {
    applyFilters();
  }, [games, searchQuery, verdictFilter, genreFilter, hideAntiCheatBlocked, applyFilters]);

  const checkGameCompatibility = async (game: GameResult) => {
    if (!hardwareProfile) {
      setError('Please scan your hardware first');
      return;
    }

    setCheckingGame(game.steam_id);
    try {
      const verdict: VerdictResult = await invokeTauri('check_game_compatibility', {
        steam_id: game.steam_id,
        hardware: hardwareProfile,
      });
      setSelectedGame({ ...game, verdict });
    } catch (e) {
      setSelectedGame(game);
    } finally {
      setCheckingGame(null);
    }
  };

  const getVerdictColor = (status: string): string => {
    switch (status) {
      case 'exceeds_recommended':
      case 'meets_recommended':
        return '#22c55e';
      case 'meets_minimum':
        return '#eab308';
      case 'below_minimum':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getVerdictEmoji = (status: string): string => {
    switch (status) {
      case 'exceeds_recommended':
        return '🎮';
      case 'meets_recommended':
        return '✅';
      case 'meets_minimum':
        return '🟡';
      case 'below_minimum':
        return '❌';
      default:
        return '❓';
    }
  };

  const getVerdictLabel = (status: string): string => {
    switch (status) {
      case 'exceeds_recommended':
        return 'Exceeds Rec';
      case 'meets_recommended':
        return 'Meets Rec';
      case 'meets_minimum':
        return 'Meets Min';
      case 'below_minimum':
        return 'Below Min';
      case 'likely_good':
        return 'Likely Good';
      case 'likely_playable':
        return 'Likely OK';
      default:
        return 'Unknown';
    }
  };

  const getProtonColor = (rating: string): string => {
    switch (rating?.toLowerCase()) {
      case 'platinum':
      case 'native':
        return '#22c55e';
      case 'gold':
        return '#84cc16';
      case 'silver':
        return '#eab308';
      case 'bronze':
        return '#f97316';
      case 'borked':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getDeckColor = (status: string): string => {
    switch (status?.toLowerCase()) {
      case 'verified':
        return '#22c55e';
      case 'playable':
        return '#eab308';
      case 'unsupported':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getAntiCheatColor = (status: string | null): string => {
    switch (status?.toLowerCase()) {
      case 'supported':
        return '#22c55e';
      case 'denied':
      case 'broken':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const isAntiCheatBlocked = (game: GameResult): boolean => {
    const status = game.anti_cheat_status?.toLowerCase();
    return status === 'denied' || status === 'broken';
  };

  // Group games by verdict
  const groupedGames = {
    can_run: filteredGames.filter(g =>
      g.verdict?.status === 'exceeds_recommended' || g.verdict?.status === 'meets_recommended'
    ),
    minimum: filteredGames.filter(g => g.verdict?.status === 'meets_minimum'),
    wont_run: filteredGames.filter(g => g.verdict?.status === 'below_minimum'),
    unknown: filteredGames.filter(g =>
      !g.verdict || !['exceeds_recommended', 'meets_recommended', 'meets_minimum', 'below_minimum'].includes(g.verdict.status)
    ),
  };

  if (loading) {
    return (
      <div className="game-library">
        <div className="loading-state">
          <div className="spinner"></div>
          {loadingProgress ? (
            <p>Analyzing game compatibility... {loadingProgress.current} / {loadingProgress.total}</p>
          ) : (
            <p>Loading game library...</p>
          )}
        </div>
      </div>
    );
  }

  if (selectedGame) {
    return (
      <div className="game-library">
        <UnifiedVerdictDashboard
          game={selectedGame}
          onBack={() => setSelectedGame(null)}
        />
      </div>
    );
  }

  return (
    <div className="game-library">
      <div className="library-header">
        <h2>🎮 Game Library</h2>
        {!hardwareProfile && (
          <p className="hardware-warning">
            ⚠️ Scan your hardware in "My Hardware" tab for personalized compatibility results
          </p>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="library-filters">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search games..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-group">
          <label>Compatibility:</label>
          <select
            value={verdictFilter}
            onChange={(e) => setVerdictFilter(e.target.value as VerdictFilter)}
            disabled={!hardwareProfile}
          >
            <option value="all">All Games</option>
            <option value="can_run">✅ Can Run Well</option>
            <option value="minimum">🟡 Meets Minimum</option>
            <option value="wont_run">❌ Won't Run</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Genre:</label>
          <select
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value)}
          >
            <option value="all">All Genres</option>
            {availableGenres.map(genre => (
              <option key={genre} value={genre}>{genre}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={hideAntiCheatBlocked}
              onChange={(e) => setHideAntiCheatBlocked(e.target.checked)}
            />
            Hide Anti-Cheat Blocked
          </label>
        </div>

        <div className="filter-stats">
          Showing {filteredGames.length} of {games.length} games
        </div>
      </div>

      {hardwareProfile && verdictFilter === 'all' ? (
        // Grouped view when hardware is scanned
        <div className="games-grouped">
          {groupedGames.can_run.length > 0 && (
            <GameSection
              title={`✅ Can Run Well (${groupedGames.can_run.length})`}
              games={groupedGames.can_run}
              onSelect={checkGameCompatibility}
              checkingGame={checkingGame}
              getVerdictColor={getVerdictColor}
              getVerdictEmoji={getVerdictEmoji}
              getVerdictLabel={getVerdictLabel}
              getProtonColor={getProtonColor}
              getDeckColor={getDeckColor}
              getAntiCheatColor={getAntiCheatColor}
              isAntiCheatBlocked={isAntiCheatBlocked}
            />
          )}

          {groupedGames.minimum.length > 0 && (
            <GameSection
              title={`🟡 Meets Minimum (${groupedGames.minimum.length})`}
              games={groupedGames.minimum}
              onSelect={checkGameCompatibility}
              checkingGame={checkingGame}
              getVerdictColor={getVerdictColor}
              getVerdictEmoji={getVerdictEmoji}
              getVerdictLabel={getVerdictLabel}
              getProtonColor={getProtonColor}
              getDeckColor={getDeckColor}
              getAntiCheatColor={getAntiCheatColor}
              isAntiCheatBlocked={isAntiCheatBlocked}
            />
          )}

          {groupedGames.wont_run.length > 0 && (
            <GameSection
              title={`❌ Won't Run (${groupedGames.wont_run.length})`}
              games={groupedGames.wont_run}
              onSelect={checkGameCompatibility}
              checkingGame={checkingGame}
              getVerdictColor={getVerdictColor}
              getVerdictEmoji={getVerdictEmoji}
              getVerdictLabel={getVerdictLabel}
              getProtonColor={getProtonColor}
              getDeckColor={getDeckColor}
              getAntiCheatColor={getAntiCheatColor}
              isAntiCheatBlocked={isAntiCheatBlocked}
              collapsed={true}
            />
          )}

          {groupedGames.unknown.length > 0 && (
            <GameSection
              title={`❓ Unknown (${groupedGames.unknown.length})`}
              games={groupedGames.unknown}
              onSelect={checkGameCompatibility}
              checkingGame={checkingGame}
              getVerdictColor={getVerdictColor}
              getVerdictEmoji={getVerdictEmoji}
              getVerdictLabel={getVerdictLabel}
              getProtonColor={getProtonColor}
              getDeckColor={getDeckColor}
              getAntiCheatColor={getAntiCheatColor}
              isAntiCheatBlocked={isAntiCheatBlocked}
              collapsed={true}
            />
          )}
        </div>
      ) : (
        // Flat list when no hardware or filtered
        <div className="games-list">
          {filteredGames.map(game => (
            <GameCard
              key={game.steam_id}
              game={game}
              onSelect={checkGameCompatibility}
              checking={checkingGame === game.steam_id}
              getVerdictColor={getVerdictColor}
              getVerdictEmoji={getVerdictEmoji}
              getVerdictLabel={getVerdictLabel}
              getProtonColor={getProtonColor}
              getDeckColor={getDeckColor}
              getAntiCheatColor={getAntiCheatColor}
              isAntiCheatBlocked={isAntiCheatBlocked}
            />
          ))}
        </div>
      )}

      {filteredGames.length === 0 && (
        <div className="no-games">
          <p>No games found matching your filters.</p>
          <p className="hint">
            Try adjusting filters or run <code>npm run scrape:requirements --popular</code> to add more games.
          </p>
        </div>
      )}
    </div>
  );
}

// Sub-components

interface GameSectionProps {
  title: string;
  games: GameResult[];
  onSelect: (game: GameResult) => void;
  checkingGame: number | null;
  collapsed?: boolean;
  getVerdictColor: (status: string) => string;
  getVerdictEmoji: (status: string) => string;
  getVerdictLabel: (status: string) => string;
  getProtonColor: (rating: string) => string;
  getDeckColor: (status: string) => string;
  getAntiCheatColor: (status: string | null) => string;
  isAntiCheatBlocked: (game: GameResult) => boolean;
}

function GameSection({
  title,
  games,
  onSelect,
  checkingGame,
  collapsed = false,
  ...colorFns
}: GameSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);

  return (
    <div className="game-section">
      <h3
        className="section-title"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        {isCollapsed ? '▶' : '▼'} {title}
      </h3>

      {!isCollapsed && (
        <div className="section-games">
          {games.map(game => (
            <GameCard
              key={game.steam_id}
              game={game}
              onSelect={onSelect}
              checking={checkingGame === game.steam_id}
              {...colorFns}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface GameCardProps {
  game: GameResult;
  onSelect: (game: GameResult) => void;
  checking: boolean;
  getVerdictColor: (status: string) => string;
  getVerdictEmoji: (status: string) => string;
  getVerdictLabel: (status: string) => string;
  getProtonColor: (rating: string) => string;
  getDeckColor: (status: string) => string;
  getAntiCheatColor: (status: string | null) => string;
  isAntiCheatBlocked: (game: GameResult) => boolean;
}

function GameCard({
  game,
  onSelect,
  checking,
  getVerdictColor,
  getVerdictEmoji,
  getVerdictLabel,
  getProtonColor,
  getDeckColor,
  getAntiCheatColor,
  isAntiCheatBlocked,
}: GameCardProps) {
  const blocked = isAntiCheatBlocked(game);

  return (
    <div
      className={`game-card ${checking ? 'checking' : ''} ${blocked ? 'blocked' : ''}`}
      onClick={() => !checking && onSelect(game)}
    >
      {/* Anti-cheat blocked banner */}
      {blocked && (
        <div className="blocked-banner">
          Anti-Cheat Blocked: {game.anti_cheat_type}
        </div>
      )}

      <div className="game-info">
        <h4 className="game-name">{game.name}</h4>
        <div className="game-meta">
          {game.genre && <span className="genre">{game.genre.split(',')[0]}</span>}
          {game.release_year && <span className="year">{game.release_year}</span>}
        </div>
      </div>

      <div className="game-badges">
        {/* Anti-cheat badge (show if has anti-cheat, even if supported) */}
        {game.anti_cheat_type && (
          <span
            className="badge anticheat-badge"
            style={{ backgroundColor: getAntiCheatColor(game.anti_cheat_status) }}
            title={`Anti-cheat: ${game.anti_cheat_type} (${game.anti_cheat_status || 'unknown'})`}
          >
            {blocked ? '🚫' : '🛡️'} {game.anti_cheat_type}
          </span>
        )}

        {game.verdict && (
          <span
            className="badge verdict-badge"
            style={{ backgroundColor: getVerdictColor(game.verdict.status) }}
          >
            {getVerdictEmoji(game.verdict.status)} {getVerdictLabel(game.verdict.status)}
          </span>
        )}

        {game.protondb_rating && (
          <span
            className="badge proton-badge"
            style={{ backgroundColor: getProtonColor(game.protondb_rating) }}
          >
            🐧 {game.protondb_rating}
          </span>
        )}

        {game.deck_status && (
          <span
            className="badge deck-badge"
            style={{ backgroundColor: getDeckColor(game.deck_status) }}
          >
            🎮 {game.deck_status}
          </span>
        )}
      </div>

      {checking && <div className="checking-indicator">Checking...</div>}
    </div>
  );
}

// Note: GameDetail component has been replaced by UnifiedVerdictDashboard
