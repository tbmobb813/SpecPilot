import { useMemo } from 'react';

interface GameResult {
  steam_id: number;
  name: string;
  genre: string | null;
  release_year: number | null;
  header_image: string | null;
  protondb_rating: string | null;
  deck_status: string | null;
  anti_cheat_type: string | null;
  anti_cheat_status: string | null;
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

interface UnifiedVerdictDashboardProps {
  game: GameResult;
  onBack: () => void;
}

// Determine overall playability from all sources
type PlayabilityLevel = 'can_play' | 'might_work' | 'wont_work' | 'unknown';

interface OverallVerdict {
  level: PlayabilityLevel;
  title: string;
  subtitle: string;
  confidencePercent: number;
  blockers: string[];
  warnings: string[];
  positives: string[];
}

export function UnifiedVerdictDashboard({ game, onBack }: UnifiedVerdictDashboardProps) {
  // Calculate overall verdict from all data sources
  const overallVerdict = useMemo((): OverallVerdict => {
    const blockers: string[] = [];
    const warnings: string[] = [];
    const positives: string[] = [];
    let baseConfidence = 50; // Start at neutral

    // Check anti-cheat (highest priority blocker)
    const acStatus = game.anti_cheat_status?.toLowerCase();
    if (acStatus === 'denied' || acStatus === 'broken') {
      blockers.push(`Anti-cheat (${game.anti_cheat_type}) blocks Linux`);
    } else if (game.anti_cheat_type && acStatus === 'supported') {
      positives.push(`Anti-cheat (${game.anti_cheat_type}) supports Linux`);
      baseConfidence += 5;
    }

    // Check ProtonDB rating
    const protonRating = game.protondb_rating?.toLowerCase();
    switch (protonRating) {
      case 'platinum':
      case 'native':
        positives.push('ProtonDB: Platinum - works perfectly');
        baseConfidence += 25;
        break;
      case 'gold':
        positives.push('ProtonDB: Gold - works with minor tweaks');
        baseConfidence += 20;
        break;
      case 'silver':
        warnings.push('ProtonDB: Silver - playable with some issues');
        baseConfidence += 5;
        break;
      case 'bronze':
        warnings.push('ProtonDB: Bronze - significant issues reported');
        baseConfidence -= 10;
        break;
      case 'borked':
        blockers.push('ProtonDB: Borked - does not work on Linux');
        break;
    }

    // Check Steam Deck status
    const deckStatus = game.deck_status?.toLowerCase();
    switch (deckStatus) {
      case 'verified':
        positives.push('Steam Deck: Verified by Valve');
        baseConfidence += 15;
        break;
      case 'playable':
        positives.push('Steam Deck: Playable with adjustments');
        baseConfidence += 5;
        break;
      case 'unsupported':
        warnings.push('Steam Deck: Unsupported by Valve');
        baseConfidence -= 5;
        break;
    }

    // Check hardware verdict
    const hwStatus = game.verdict?.status;
    switch (hwStatus) {
      case 'exceeds_recommended':
        positives.push('Hardware: Exceeds recommended specs');
        baseConfidence += 20;
        break;
      case 'meets_recommended':
        positives.push('Hardware: Meets recommended specs');
        baseConfidence += 15;
        break;
      case 'meets_minimum':
        warnings.push('Hardware: Meets minimum specs only');
        break;
      case 'below_minimum':
        blockers.push('Hardware: Below minimum requirements');
        break;
      case 'likely_good':
        positives.push('Hardware: Likely to run well (estimated)');
        baseConfidence += 5;
        break;
      case 'likely_playable':
        warnings.push('Hardware: Might be playable (estimated)');
        break;
    }

    // Adjust for confidence level from verdict
    if (game.verdict?.confidence === 'high') {
      baseConfidence += 10;
    } else if (game.verdict?.confidence === 'low') {
      baseConfidence -= 10;
    }

    // Cap confidence
    const confidencePercent = Math.max(0, Math.min(100, baseConfidence));

    // Determine overall level
    let level: PlayabilityLevel;
    let title: string;
    let subtitle: string;

    if (blockers.length > 0) {
      level = 'wont_work';
      title = "Won't Work";
      subtitle = blockers[0];
    } else if (warnings.length > 2 || confidencePercent < 40) {
      level = 'might_work';
      title = 'Might Work';
      subtitle = 'Some issues expected';
    } else if (positives.length >= 2 && confidencePercent >= 60) {
      level = 'can_play';
      title = 'Ready to Play';
      subtitle = 'Should work well on your system';
    } else if (positives.length > 0 || warnings.length > 0) {
      level = 'might_work';
      title = 'Might Work';
      subtitle = 'Check details below';
    } else {
      level = 'unknown';
      title = 'Unknown';
      subtitle = 'Not enough data to determine';
    }

    return { level, title, subtitle, confidencePercent, blockers, warnings, positives };
  }, [game]);

  const getLevelColor = (level: PlayabilityLevel): string => {
    switch (level) {
      case 'can_play': return '#22c55e';
      case 'might_work': return '#eab308';
      case 'wont_work': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getLevelIcon = (level: PlayabilityLevel): string => {
    switch (level) {
      case 'can_play': return '✅';
      case 'might_work': return '⚠️';
      case 'wont_work': return '🚫';
      default: return '❓';
    }
  };

  const getSourceStatus = (
    type: 'hardware' | 'proton' | 'deck' | 'anticheat'
  ): { status: 'good' | 'warning' | 'bad' | 'neutral'; label: string; detail: string } => {
    switch (type) {
      case 'hardware': {
        const s = game.verdict?.status;
        if (s === 'exceeds_recommended' || s === 'meets_recommended' || s === 'likely_good') {
          return { status: 'good', label: getVerdictLabel(s), detail: game.verdict?.summary || '' };
        } else if (s === 'meets_minimum' || s === 'likely_playable' || s === 'uncertain') {
          return { status: 'warning', label: getVerdictLabel(s), detail: game.verdict?.summary || '' };
        } else if (s === 'below_minimum') {
          return { status: 'bad', label: 'Below Minimum', detail: game.verdict?.summary || '' };
        }
        return { status: 'neutral', label: 'Unknown', detail: 'No verdict available' };
      }
      case 'proton': {
        const r = game.protondb_rating?.toLowerCase();
        if (r === 'platinum' || r === 'native') {
          return { status: 'good', label: 'Platinum', detail: 'Works perfectly out of the box' };
        } else if (r === 'gold') {
          return { status: 'good', label: 'Gold', detail: 'Works with minor tweaks' };
        } else if (r === 'silver') {
          return { status: 'warning', label: 'Silver', detail: 'Playable with some issues' };
        } else if (r === 'bronze') {
          return { status: 'warning', label: 'Bronze', detail: 'Significant issues reported' };
        } else if (r === 'borked') {
          return { status: 'bad', label: 'Borked', detail: 'Does not work on Linux' };
        }
        return { status: 'neutral', label: 'No Data', detail: 'Not enough community reports' };
      }
      case 'deck': {
        const d = game.deck_status?.toLowerCase();
        if (d === 'verified') {
          return { status: 'good', label: 'Verified', detail: 'Valve verified for Steam Deck' };
        } else if (d === 'playable') {
          return { status: 'warning', label: 'Playable', detail: 'Works with adjustments' };
        } else if (d === 'unsupported') {
          return { status: 'bad', label: 'Unsupported', detail: 'Not supported on Steam Deck' };
        }
        return { status: 'neutral', label: 'Unknown', detail: 'No Steam Deck data' };
      }
      case 'anticheat': {
        const ac = game.anti_cheat_status?.toLowerCase();
        if (!game.anti_cheat_type) {
          return { status: 'good', label: 'None', detail: 'No anti-cheat detected' };
        }
        if (ac === 'supported') {
          return { status: 'good', label: 'Supported', detail: `${game.anti_cheat_type} works on Linux` };
        } else if (ac === 'denied') {
          return { status: 'bad', label: 'Blocked', detail: `${game.anti_cheat_type} blocks Linux` };
        } else if (ac === 'broken') {
          return { status: 'bad', label: 'Broken', detail: `${game.anti_cheat_type} is broken on Linux` };
        }
        return { status: 'warning', label: 'Unknown', detail: `${game.anti_cheat_type} - status unknown` };
      }
    }
  };

  const getVerdictLabel = (status: string): string => {
    switch (status) {
      case 'exceeds_recommended': return 'Exceeds Rec';
      case 'meets_recommended': return 'Meets Rec';
      case 'meets_minimum': return 'Meets Min';
      case 'below_minimum': return 'Below Min';
      case 'likely_good': return 'Likely Good';
      case 'likely_playable': return 'Likely OK';
      case 'uncertain': return 'Uncertain';
      default: return 'Unknown';
    }
  };

  const getStatusColor = (status: 'good' | 'warning' | 'bad' | 'neutral'): string => {
    switch (status) {
      case 'good': return '#22c55e';
      case 'warning': return '#eab308';
      case 'bad': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getStatusIcon = (status: 'good' | 'warning' | 'bad' | 'neutral'): string => {
    switch (status) {
      case 'good': return '✅';
      case 'warning': return '⚠️';
      case 'bad': return '❌';
      default: return '❓';
    }
  };

  const hardwareStatus = getSourceStatus('hardware');
  const protonStatus = getSourceStatus('proton');
  const deckStatus = getSourceStatus('deck');
  const antiCheatStatus = getSourceStatus('anticheat');

  return (
    <div className="unified-verdict-dashboard">
      <button className="back-button" onClick={onBack}>
        ← Back to Library
      </button>

      {/* Game Header */}
      <div className="dashboard-header">
        {game.header_image && (
          <img src={game.header_image} alt={game.name} className="dashboard-game-image" />
        )}
        <div className="dashboard-game-info">
          <h1>{game.name}</h1>
          <div className="dashboard-meta">
            {game.genre && <span>{game.genre}</span>}
            {game.release_year && <span>{game.release_year}</span>}
          </div>
        </div>
      </div>

      {/* Overall Verdict Summary */}
      <div
        className={`verdict-summary-banner level-${overallVerdict.level}`}
        style={{ borderColor: getLevelColor(overallVerdict.level) }}
      >
        <div className="verdict-icon" style={{ backgroundColor: getLevelColor(overallVerdict.level) }}>
          {getLevelIcon(overallVerdict.level)}
        </div>
        <div className="verdict-text">
          <h2>{overallVerdict.title}</h2>
          <p>{overallVerdict.subtitle}</p>
        </div>
        <div className="confidence-meter">
          <div className="confidence-label">Confidence</div>
          <div className="confidence-bar">
            <div
              className="confidence-fill"
              style={{
                width: `${overallVerdict.confidencePercent}%`,
                backgroundColor: getLevelColor(overallVerdict.level)
              }}
            />
          </div>
          <div className="confidence-value">{overallVerdict.confidencePercent}%</div>
        </div>
      </div>

      {/* Quick Summary Pills */}
      {(overallVerdict.blockers.length > 0 || overallVerdict.warnings.length > 0 || overallVerdict.positives.length > 0) && (
        <div className="verdict-pills">
          {overallVerdict.blockers.map((b, i) => (
            <span key={`b-${i}`} className="pill pill-blocker">🚫 {b}</span>
          ))}
          {overallVerdict.warnings.map((w, i) => (
            <span key={`w-${i}`} className="pill pill-warning">⚠️ {w}</span>
          ))}
          {overallVerdict.positives.map((p, i) => (
            <span key={`p-${i}`} className="pill pill-positive">✅ {p}</span>
          ))}
        </div>
      )}

      {/* Data Sources Grid */}
      <div className="sources-grid">
        {/* Hardware Card */}
        <div className={`source-card status-${hardwareStatus.status}`}>
          <div className="source-header">
            <span className="source-icon">🖥️</span>
            <h3>Your Hardware</h3>
          </div>
          <div
            className="source-status"
            style={{ backgroundColor: getStatusColor(hardwareStatus.status) }}
          >
            {getStatusIcon(hardwareStatus.status)} {hardwareStatus.label}
          </div>
          <p className="source-detail">{hardwareStatus.detail}</p>

          {/* Hardware Details */}
          {game.verdict?.details && game.verdict.details.length > 0 && (
            <ul className="source-checks">
              {game.verdict.details.map((detail, i) => (
                <li key={i}>{detail}</li>
              ))}
            </ul>
          )}
        </div>

        {/* ProtonDB Card */}
        <div className={`source-card status-${protonStatus.status}`}>
          <div className="source-header">
            <span className="source-icon">🐧</span>
            <h3>ProtonDB</h3>
          </div>
          <div
            className="source-status"
            style={{ backgroundColor: getStatusColor(protonStatus.status) }}
          >
            {getStatusIcon(protonStatus.status)} {protonStatus.label}
          </div>
          <p className="source-detail">{protonStatus.detail}</p>
          <a
            href={`https://www.protondb.com/app/${game.steam_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="source-link"
          >
            View on ProtonDB →
          </a>
        </div>

        {/* Steam Deck Card */}
        <div className={`source-card status-${deckStatus.status}`}>
          <div className="source-header">
            <span className="source-icon">🎮</span>
            <h3>Steam Deck</h3>
          </div>
          <div
            className="source-status"
            style={{ backgroundColor: getStatusColor(deckStatus.status) }}
          >
            {getStatusIcon(deckStatus.status)} {deckStatus.label}
          </div>
          <p className="source-detail">{deckStatus.detail}</p>
        </div>

        {/* Anti-Cheat Card */}
        <div className={`source-card status-${antiCheatStatus.status}`}>
          <div className="source-header">
            <span className="source-icon">🛡️</span>
            <h3>Anti-Cheat</h3>
          </div>
          <div
            className="source-status"
            style={{ backgroundColor: getStatusColor(antiCheatStatus.status) }}
          >
            {getStatusIcon(antiCheatStatus.status)} {antiCheatStatus.label}
          </div>
          <p className="source-detail">{antiCheatStatus.detail}</p>
          {game.anti_cheat_type && (
            <a
              href="https://areweanticheatyet.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="source-link"
            >
              View on AWACY →
            </a>
          )}
        </div>
      </div>

      {/* System Requirements */}
      {(game.verdict?.min_requirements || game.verdict?.rec_requirements) && (
        <div className="requirements-section">
          <h3>System Requirements</h3>
          <div className="requirements-comparison">
            {game.verdict.min_requirements && (
              <div className="requirements-column">
                <h4>Minimum</h4>
                <ul>
                  {game.verdict.min_requirements.cpu_text && (
                    <li><strong>CPU:</strong> {game.verdict.min_requirements.cpu_text}</li>
                  )}
                  {game.verdict.min_requirements.ram_gb && (
                    <li><strong>RAM:</strong> {game.verdict.min_requirements.ram_gb} GB</li>
                  )}
                  {game.verdict.min_requirements.gpu_text && (
                    <li><strong>GPU:</strong> {game.verdict.min_requirements.gpu_text}</li>
                  )}
                  {game.verdict.min_requirements.gpu_vram_gb && (
                    <li><strong>VRAM:</strong> {game.verdict.min_requirements.gpu_vram_gb} GB</li>
                  )}
                  {game.verdict.min_requirements.storage_gb && (
                    <li><strong>Storage:</strong> {game.verdict.min_requirements.storage_gb} GB</li>
                  )}
                </ul>
              </div>
            )}
            {game.verdict.rec_requirements && (
              <div className="requirements-column">
                <h4>Recommended</h4>
                <ul>
                  {game.verdict.rec_requirements.cpu_text && (
                    <li><strong>CPU:</strong> {game.verdict.rec_requirements.cpu_text}</li>
                  )}
                  {game.verdict.rec_requirements.ram_gb && (
                    <li><strong>RAM:</strong> {game.verdict.rec_requirements.ram_gb} GB</li>
                  )}
                  {game.verdict.rec_requirements.gpu_text && (
                    <li><strong>GPU:</strong> {game.verdict.rec_requirements.gpu_text}</li>
                  )}
                  {game.verdict.rec_requirements.gpu_vram_gb && (
                    <li><strong>VRAM:</strong> {game.verdict.rec_requirements.gpu_vram_gb} GB</li>
                  )}
                  {game.verdict.rec_requirements.storage_gb && (
                    <li><strong>Storage:</strong> {game.verdict.rec_requirements.storage_gb} GB</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* External Links */}
      <div className="dashboard-links">
        <a
          href={`https://store.steampowered.com/app/${game.steam_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="dashboard-link"
        >
          🛒 View on Steam
        </a>
        <a
          href={`https://www.protondb.com/app/${game.steam_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="dashboard-link"
        >
          🐧 ProtonDB Reports
        </a>
        <a
          href={`https://www.pcgamingwiki.com/api/appid.php?appid=${game.steam_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="dashboard-link"
        >
          📖 PCGamingWiki
        </a>
      </div>
    </div>
  );
}
