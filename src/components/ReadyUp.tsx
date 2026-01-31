import { useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

interface CheckAction {
  label: string;
  command: string | null;
}

interface SystemCheck {
  id: string;
  name: string;
  status: 'good' | 'warning' | 'bad' | 'info';
  message: string;
  details: string | null;
  action: CheckAction | null;
}

interface ReadyUpReport {
  overall_status: 'good' | 'warning' | 'bad' | 'info';
  checks: SystemCheck[];
  summary: string;
}

export function ReadyUp() {
  const [report, setReport] = useState<ReadyUpReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runChecks = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<ReadyUpReport>('run_readyup_checks');
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'good': return '✓';
      case 'warning': return '⚠';
      case 'bad': return '✗';
      case 'info': return 'ℹ';
      default: return '?';
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'good': return 'status-good';
      case 'warning': return 'status-warning';
      case 'bad': return 'status-bad';
      case 'info': return 'status-info';
      default: return '';
    }
  };

  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
  };

  return (
    <div className="readyup-container">
      <div className="readyup-header">
        <h2>ReadyUp</h2>
        <p className="readyup-subtitle">Pre-launch system check for optimal gaming</p>
      </div>

      <div className="readyup-actions">
        <button
          className="readyup-scan-btn"
          onClick={runChecks}
          disabled={loading}
        >
          {loading ? 'Checking...' : 'Run System Check'}
        </button>
      </div>

      {error && (
        <div className="readyup-error">
          <p>Error running checks: {error}</p>
        </div>
      )}

      {report && (
        <div className="readyup-report">
          <div className={`readyup-summary ${getStatusClass(report.overall_status)}`}>
            <span className="summary-icon">{getStatusIcon(report.overall_status)}</span>
            <span className="summary-text">{report.summary}</span>
          </div>

          <div className="readyup-checks">
            {report.checks.map((check) => (
              <div key={check.id} className={`readyup-check ${getStatusClass(check.status)}`}>
                <div className="check-header">
                  <span className="check-icon">{getStatusIcon(check.status)}</span>
                  <span className="check-name">{check.name}</span>
                </div>
                <div className="check-body">
                  <p className="check-message">{check.message}</p>
                  {check.details && (
                    <p className="check-details">{check.details}</p>
                  )}
                  {check.action && (
                    <div className="check-action">
                      {check.action.command ? (
                        <button
                          className="action-btn"
                          onClick={() => copyCommand(check.action!.command!)}
                          title="Copy command"
                        >
                          {check.action.label}
                        </button>
                      ) : (
                        <span className="action-hint">{check.action.label}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!report && !loading && (
        <div className="readyup-placeholder">
          <p>Click "Run System Check" to analyze your system before gaming</p>
          <ul className="check-list-preview">
            <li>Available RAM</li>
            <li>Disk Space</li>
            <li>CPU Load</li>
            <li>GPU Driver</li>
            <li>Compositor Status</li>
            <li>GameMode</li>
            <li>Proton/Wine</li>
            <li>Power Profile</li>
            <li>Background Apps</li>
          </ul>
        </div>
      )}
    </div>
  );
}
