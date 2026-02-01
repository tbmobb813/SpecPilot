import { useState } from 'react';
import { HardwareScan } from './components/HardwareScan';
import { GameLibrary } from './components/GameLibrary';
import { TelemetrySettings } from './components/TelemetrySettings';
import { ReadyUp } from './components/ReadyUp';
import { HardwareProfile } from './api/hardware';
import './App.css';

function App() {
  const [hardwareProfile, setHardwareProfile] = useState<HardwareProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'gamefit' | 'readyup' | 'hardware'>('gamefit');

  return (
    <div className="App">
      <header className="app-header">
        <h1>SpecPilot</h1>
        <p>Your PC Gaming Compatibility Copilot</p>
      </header>

      <nav className="app-nav">
        <button
          className={`nav-tab ${activeTab === 'gamefit' ? 'active' : ''}`}
          onClick={() => setActiveTab('gamefit')}
        >
          🎮 GameFit
        </button>
        <button
          className={`nav-tab ${activeTab === 'readyup' ? 'active' : ''}`}
          onClick={() => setActiveTab('readyup')}
        >
          🚀 ReadyUp
        </button>
        <button
          className={`nav-tab ${activeTab === 'hardware' ? 'active' : ''}`}
          onClick={() => setActiveTab('hardware')}
        >
          🖥️ My Hardware
        </button>
      </nav>

      <main className="app-main">
        {activeTab === 'gamefit' && (
          <GameLibrary hardwareProfile={hardwareProfile} />
        )}

        {activeTab === 'readyup' && (
          <ReadyUp />
        )}

        {activeTab === 'hardware' && (
          <>
            <HardwareScan onProfileUpdate={setHardwareProfile} />
            <TelemetrySettings
              hardwareProfile={hardwareProfile}
              gameId={undefined}
              predictedVerdict={undefined}
            />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
