import React from 'react';
import { HardwareScan } from './components/HardwareScan';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="app-header">
        <h1>SpecPilot</h1>
        <p>Hardware Detection & System Analysis</p>
      </header>
      <main className="app-main">
        <HardwareScan />
      </main>
    </div>
  );
}

export default App;
