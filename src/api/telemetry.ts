import { invokeTauri } from './tauri';
import { HardwareProfile } from './hardware';

export interface TelemetryReport {
  game_id: number;
  hardware_hash: string;
  avg_fps: number;
  stable: boolean;
  settings: string;
  predicted_verdict: string;
}

export interface TelemetrySettings {
  enabled: boolean;
}

// Generate a hash of hardware profile for anonymous identification
export function hashHardware(profile: HardwareProfile): string {
  const components = [
    profile.cpu.model,
    profile.gpu.model,
    profile.gpu.vram.toString(),
    profile.memory.total.toString(),
  ].join('|');

  // Simple hash function for anonymization
  let hash = 0;
  for (let i = 0; i < components.length; i++) {
    const char = components.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

export async function submitTelemetry(report: TelemetryReport): Promise<void> {
  return await invokeTauri('submit_telemetry', { report });
}

export async function getTelemetryEnabled(): Promise<boolean> {
  return await invokeTauri('get_telemetry_enabled');
}

export async function setTelemetryEnabled(enabled: boolean): Promise<void> {
  return await invokeTauri('set_telemetry_enabled', { enabled });
}
