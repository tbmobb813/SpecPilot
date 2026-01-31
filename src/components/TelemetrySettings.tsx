import { useState, useEffect } from 'react';
import { getTelemetryEnabled, setTelemetryEnabled, submitTelemetry, hashHardware, TelemetryReport } from '../api/telemetry';
import { HardwareProfile } from '../api/hardware';

interface TelemetrySettingsProps {
  hardwareProfile?: HardwareProfile | null;
  gameId?: number;
  predictedVerdict?: string;
}

export function TelemetrySettings({ hardwareProfile, gameId, predictedVerdict }: TelemetrySettingsProps) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Performance report form state
  const [avgFps, setAvgFps] = useState<number>(60);
  const [stable, setStable] = useState(true);
  const [settings, setSettings] = useState('Medium');

  useEffect(() => {
    getTelemetryEnabled()
      .then(setEnabled)
      .catch(() => setEnabled(false))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (newValue: boolean) => {
    try {
      await setTelemetryEnabled(newValue);
      setEnabled(newValue);
      setError(null);
    } catch (e) {
      setError('Failed to update telemetry settings');
    }
  };

  const handleSubmitReport = async () => {
    if (!hardwareProfile || !gameId) {
      setError('Hardware profile and game required to submit report');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const report: TelemetryReport = {
        game_id: gameId,
        hardware_hash: hashHardware(hardwareProfile),
        avg_fps: avgFps,
        stable,
        settings,
        predicted_verdict: predictedVerdict || 'unknown',
      };

      await submitTelemetry(report);
      setSubmitted(true);
    } catch (e) {
      setError('Failed to submit performance report');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="telemetry-settings loading">Loading settings...</div>;
  }

  return (
    <div className="telemetry-settings">
      <div className="telemetry-header">
        <h3>Help Improve SpecPilot</h3>
        <p>
          Share anonymous performance data to help verify game compatibility.
          No personal information is collected.
        </p>
      </div>

      <div className="telemetry-toggle">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => handleToggle(e.target.checked)}
          />
          <span className="toggle-text">Enable telemetry (optional)</span>
        </label>
      </div>

      {enabled && hardwareProfile && gameId && !submitted && (
        <div className="performance-report">
          <h4>Submit Performance Report</h4>

          <div className="report-form">
            <div className="form-group">
              <label htmlFor="avgFps">Average FPS:</label>
              <input
                id="avgFps"
                type="number"
                min="1"
                max="500"
                value={avgFps}
                onChange={(e) => setAvgFps(parseInt(e.target.value) || 60)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="stable">Performance Stability:</label>
              <select
                id="stable"
                value={stable ? 'stable' : 'unstable'}
                onChange={(e) => setStable(e.target.value === 'stable')}
              >
                <option value="stable">Stable (consistent FPS)</option>
                <option value="unstable">Unstable (stutters/drops)</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="settings">Graphics Settings:</label>
              <select
                id="settings"
                value={settings}
                onChange={(e) => setSettings(e.target.value)}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Ultra">Ultra</option>
                <option value="Custom">Custom</option>
              </select>
            </div>

            <button
              className="submit-report-btn"
              onClick={handleSubmitReport}
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </div>
      )}

      {submitted && (
        <div className="success-message">
          Thank you for your contribution! Your report helps improve compatibility predictions.
        </div>
      )}

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="privacy-link">
        <a href="#privacy" onClick={(e) => { e.preventDefault(); alert('Privacy: We collect only anonymous hardware tier data and game performance metrics. No personal information, IP addresses, or identifying data is stored.'); }}>
          What data is collected?
        </a>
      </div>
    </div>
  );
}
