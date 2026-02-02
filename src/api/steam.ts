// Steam Library Detection API

import { invokeTauri } from './tauri';

export interface InstalledGame {
  app_id: number;
  name: string;
  install_dir: string;
  size_on_disk: number;
  last_updated: number | null;
}

export interface SteamLibraryResult {
  steam_path: string | null;
  library_folders: string[];
  installed_games: InstalledGame[];
  total_games: number;
}

/**
 * Detect Steam installation and get list of installed games
 */
export async function detectSteamLibrary(): Promise<SteamLibraryResult | null> {
  try {
    return await invokeTauri<SteamLibraryResult>('detect_steam_library');
  } catch (error) {
    console.error('Failed to detect Steam library:', error);
    return null;
  }
}

/**
 * Get the set of installed game IDs for quick lookup
 */
export async function getInstalledGameIds(): Promise<Set<number>> {
  const library = await detectSteamLibrary();
  if (!library) {
    return new Set();
  }
  return new Set(library.installed_games.map(g => g.app_id));
}
