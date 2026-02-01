import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { HardwareProfile } from '../api/hardware';

interface GameResult {
  steam_id: number;
  name: string;
  protondb_rating?: string;
  deck_status?: string;
  verdict?: VerdictResult;
}

interface RequirementsSummary {
  cpu_text?: string | null;
  ram_gb?: number | null;
  gpu_text?: string | null;
  gpu_vram_gb?: number | null;
  storage_gb?: number | null;
}

interface VerdictResult {
  status: string;
  confidence: string;
  summary: string;
  details: string[];
  min_requirements: RequirementsSummary | null;
  rec_requirements: RequirementsSummary | null;
}

/*
 Copilot AI note (manual review):
 The `VerdictResult` type previously used by an older/unused `GameCheck` component
 defined `status` as one of: 'excellent' | 'good' | 'playable' | 'struggling' |
 'unsupported' | 'unknown'. However, the backend `check_game_compatibility`
 (src-tauri/src/commands/games.rs) returns values like:
 'exceeds_recommended', 'meets_recommended', 'meets_minimum', 'below_minimum', 'unknown'.

 This mismatch will cause type/runtime inconsistencies. The component also appears
 to be stale/unused in the current codebase. Ensure frontend types mirror the
 backend `VerdictResult` or add a mapping layer when consuming verdicts.
*/

interface GameCheckProps {
  hardwareProfile: HardwareProfile | null;
}

export function GameCheck({ hardwareProfile }: GameCheckProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<GameResult[]>([]);
  const [selectedGame, setSelectedGame] = useState<GameResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    setError(null);
    setSelectedGame(null);

    try {
      const games: GameResult[] = await invoke('search_games', { query: searchQuery });
      setResults(games);
    } catch (e) {
      setError(e as string);
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectGame = async (game: GameResult) => {
    if (!hardwareProfile) {
      setError('Please scan your hardware first');
      return;
    }

    try {
      const verdict: VerdictResult = await invoke('check_game_compatibility', {
        steamId: game.steam_id,
        hardware: hardwareProfile
      });

      setSelectedGame({
        ...game,
        verdict
      });
    } catch (e) {
      // If verdict fails, still show ProtonDB/Deck data
      setSelectedGame(game);
    }
  };

  const getStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      'verified': '#22c55e',
      'platinum': '#22c55e',
      'gold': '#84cc16',
      'playable': '#eab308',
      'silver': '#eab308',
      'bronze': '#f97316',
      'unsupported': '#ef4444',
      'borked': '#ef4444',
      'excellent': '#22c55e',
      'good': '#84cc16',
      'struggling': '#f97316',
      'unknown': '#6b7280'
    };
    return colors[status?.toLowerCase()] || '#6b7280';
  };

  const getStatusEmoji = (status: string): string => {
    const emojis: Record<string, string> = {
      'verified': '✅',
      'platinum': '🏆',
      'gold': '🥇',
      'playable': '🟡',
      'silver': '🥈',
      'bronze': '🥉',
      'unsupported': '❌',
      'borked': '💔',
      'excellent': '🎮',
      'good': '👍',
      'struggling': '⚠️',
      'unknown': '❓'
    };
    return emojis[status?.toLowerCase()] || '❓';
  };

  return (
    <div className="game-check">
      <div className="game-check-header">
        <h2>Check Game Compatibility</h2>
        {!hardwareProfile && (
          <p className="warning">Scan your hardware first for personalized results</p>
        )}
      </div>

      <div className="search-container">
        <input
          type="text"
          placeholder="Search for a game..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="search-input"
        />
        <button
          onClick={handleSearch}
          disabled={searching || !searchQuery.trim()}
          className="search-button"
        >
          {searching ? 'Searching...' : 'Search'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {results.length > 0 && !selectedGame && (
        <div className="search-results">
          <h3>Results</h3>
          <ul className="game-list">
            {results.map((game) => (
              <li
                key={game.steam_id}
                onClick={() => handleSelectGame(game)}
                className="game-item"
              >
                <span className="game-name">{game.name}</span>
                <div className="game-badges">
                  {game.protondb_rating && (
                    <span
                      className="badge"
                      style={{ backgroundColor: getStatusColor(game.protondb_rating) }}
                    >
                      ProtonDB: {game.protondb_rating}
                    </span>
                  )}
                  {game.deck_status && (
                    <span
                      className="badge"
                      style={{ backgroundColor: getStatusColor(game.deck_status) }}
                    >
                      Deck: {game.deck_status}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedGame && (
        <div className="game-detail">
          <button className="back-button" onClick={() => setSelectedGame(null)}>
            ← Back to results
          </button>

          <h3>{selectedGame.name}</h3>

          <div className="compatibility-grid">
            {/* ProtonDB Status */}
            {selectedGame.protondb_rating && (
              <div className="compat-card">
                <h4>ProtonDB Rating</h4>
                <div
                  className="status-badge large"
                  style={{ backgroundColor: getStatusColor(selectedGame.protondb_rating) }}
                >
                  {getStatusEmoji(selectedGame.protondb_rating)} {selectedGame.protondb_rating}
                </div>
                <p className="source">Community Linux compatibility reports</p>
              </div>
            )}

            {/* Steam Deck Status */}
            {selectedGame.deck_status && (
              <div className="compat-card">
                <h4>Steam Deck</h4>
                <div
                  className="status-badge large"
                  style={{ backgroundColor: getStatusColor(selectedGame.deck_status) }}
                >
                  {getStatusEmoji(selectedGame.deck_status)} {selectedGame.deck_status}
                </div>
                <p className="source">Valve's official verification</p>
              </div>
            )}

            {/* Hardware Verdict (if available) */}
            {selectedGame.verdict && (
              <div className="compat-card verdict-card">
                <h4>Your Hardware</h4>
                <div
                  className="status-badge large"
                  style={{ backgroundColor: getStatusColor(selectedGame.verdict.status) }}
                >
                  {getStatusEmoji(selectedGame.verdict.status)} {selectedGame.verdict.status}
                </div>
                <p className="confidence">
                  Confidence: {selectedGame.verdict.confidence}
                </p>
                <p className="summary">{selectedGame.verdict.summary}</p>
                {selectedGame.verdict.details.length > 0 && (
                  <ul className="verdict-details">
                    {selectedGame.verdict.details.map((detail, i) => (
                      <li key={i}>{detail}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* No verdict but hardware scanned */}
            {!selectedGame.verdict && hardwareProfile && (
              <div className="compat-card">
                <h4>Your Hardware</h4>
                <div className="status-badge large" style={{ backgroundColor: '#6b7280' }}>
                  ❓ No Data
                </div>
                <p className="source">
                  No requirements data available for this game.
                  Verdict based on ProtonDB/Deck status above.
                </p>
              </div>
            )}
          </div>

          <div className="external-links">
            <a
              href={`https://www.protondb.com/app/${selectedGame.steam_id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on ProtonDB →
            </a>
            <a
              href={`https://store.steampowered.com/app/${selectedGame.steam_id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on Steam →
            </a>
          </div>
        </div>
      )}

      {results.length === 0 && searchQuery && !searching && !error && (
        <div className="no-results">
          <p>No games found for "{searchQuery}"</p>
          <p className="hint">Try syncing more games: <code>npm run sync:protondb</code></p>
        </div>
      )}
    </div>
  );
}
