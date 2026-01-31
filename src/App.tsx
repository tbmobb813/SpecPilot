import { useState } from 'react';
import { HardwareScan } from './components/HardwareScan';
import { TelemetrySettings } from './components/TelemetrySettings';
import { HardwareProfile } from './api/hardware';
import './App.css';

function App() {
  const [hardwareProfile, setHardwareProfile] = useState<HardwareProfile | null>(null);

  return (
    <div className="App">
      <header className="app-header">
        <h1>SpecPilot</h1>
        <p>Hardware Detection & System Analysis</p>
      </header>
      <main className="app-main">
        <HardwareScan onProfileUpdate={setHardwareProfile} />
        <TelemetrySettings
          hardwareProfile={hardwareProfile}
          gameId={undefined}
          predictedVerdict={undefined}
        />
      </main>
    </div>
  );
}

export default App;
