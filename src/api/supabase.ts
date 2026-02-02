/**
 * Supabase client for fetching game data
 *
 * Game data (static) is fetched from Supabase cloud.
 * Compatibility checks still use local Tauri backend (needs hardware profile).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase configuration - safe to expose anon key (read-only with RLS)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://gryhhohsfwsuntsumnyc.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyeWhob2hzZndzdW50c3VtbnljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwMjY4OTcsImV4cCI6MjA4NTYwMjg5N30.AnYFi5LFac22e9yOywu2NJmDOSweUhfG-jMRbUF21js';

let supabaseClient: SupabaseClient | null = null;

/**
 * Get or create Supabase client
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

/**
 * Game result from Supabase with joined compatibility data
 */
export interface SupabaseGameResult {
  id: number;
  steam_id: number;
  name: string;
  genre: string | null;
  release_year: number | null;
  header_image: string | null;
  // Requirements
  min_cpu_text: string | null;
  min_ram_mb: number | null;
  min_gpu_text: string | null;
  min_gpu_vram_mb: number | null;
  min_storage_gb: number | null;
  rec_cpu_text: string | null;
  rec_ram_mb: number | null;
  rec_gpu_text: string | null;
  rec_gpu_vram_mb: number | null;
  rec_storage_gb: number | null;
  // Joined data
  protondb_rating: string | null;
  proton_reports: number | null;
  deck_status: string | null;
  deck_notes: string | null;
  anti_cheat_type: string | null;
  anti_cheat_status: string | null;
}

/**
 * Search/browse options
 */
export interface BrowseOptions {
  search?: string;
  genre?: string;
  protonRating?: string;
  deckStatus?: string;
  hideAntiCheatBlocked?: boolean;
  limit?: number;
  offset?: number;
  orderBy?: 'name' | 'release_year' | 'proton_reports';
  orderAsc?: boolean;
}

/**
 * Fetch games from Supabase with optional filters
 */
export async function browseGames(options: BrowseOptions = {}): Promise<SupabaseGameResult[]> {
  const {
    search,
    genre,
    protonRating,
    deckStatus,
    hideAntiCheatBlocked = false,
    limit = 500,
    offset = 0,
    orderBy = 'name',
    orderAsc = true,
  } = options;

  const supabase = getSupabase();

  // Use the games_full view which has all joined data
  let query = supabase
    .from('games_full')
    .select('*')
    .not('steam_id', 'is', null);

  // Apply filters
  if (search && search.trim()) {
    query = query.ilike('name', `%${search.trim()}%`);
  }

  if (genre && genre !== 'all') {
    query = query.ilike('genre', `%${genre}%`);
  }

  if (protonRating && protonRating !== 'all') {
    query = query.eq('protondb_rating', protonRating.toLowerCase());
  }

  if (deckStatus && deckStatus !== 'all') {
    query = query.eq('deck_status', deckStatus.toLowerCase());
  }

  if (hideAntiCheatBlocked) {
    query = query.or('anticheat_linux_status.is.null,anticheat_linux_status.neq.denied,anticheat_linux_status.neq.broken');
  }

  // Order and pagination
  query = query
    .order(orderBy, { ascending: orderAsc })
    .range(offset, offset + limit - 1);

  const { data, error } = await query;

  if (error) {
    console.error('Supabase query error:', error);
    throw new Error(`Failed to fetch games: ${error.message}`);
  }

  // Transform to expected format
  return (data || []).map(row => ({
    id: row.id,
    steam_id: row.steam_id,
    name: row.name,
    genre: row.genre,
    release_year: row.release_year,
    header_image: row.header_image,
    min_cpu_text: row.min_cpu_text,
    min_ram_mb: row.min_ram_mb,
    min_gpu_text: row.min_gpu_text,
    min_gpu_vram_mb: row.min_gpu_vram_mb,
    min_storage_gb: row.min_storage_gb,
    rec_cpu_text: row.rec_cpu_text,
    rec_ram_mb: row.rec_ram_mb,
    rec_gpu_text: row.rec_gpu_text,
    rec_gpu_vram_mb: row.rec_gpu_vram_mb,
    rec_storage_gb: row.rec_storage_gb,
    protondb_rating: row.protondb_rating,
    proton_reports: row.proton_reports,
    deck_status: row.deck_status,
    deck_notes: row.deck_notes,
    anti_cheat_type: row.anti_cheat_type,
    anti_cheat_status: row.anticheat_linux_status,
  }));
}

/**
 * Search games by name (quick search)
 */
export async function searchGames(query: string, limit = 20): Promise<SupabaseGameResult[]> {
  return browseGames({ search: query, limit });
}

/**
 * Get a single game by Steam ID
 */
export async function getGameBySteamId(steamId: number): Promise<SupabaseGameResult | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('games_full')
    .select('*')
    .eq('steam_id', steamId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Not found
      return null;
    }
    throw new Error(`Failed to fetch game: ${error.message}`);
  }

  return {
    id: data.id,
    steam_id: data.steam_id,
    name: data.name,
    genre: data.genre,
    release_year: data.release_year,
    header_image: data.header_image,
    min_cpu_text: data.min_cpu_text,
    min_ram_mb: data.min_ram_mb,
    min_gpu_text: data.min_gpu_text,
    min_gpu_vram_mb: data.min_gpu_vram_mb,
    min_storage_gb: data.min_storage_gb,
    rec_cpu_text: data.rec_cpu_text,
    rec_ram_mb: data.rec_ram_mb,
    rec_gpu_text: data.rec_gpu_text,
    rec_gpu_vram_mb: data.rec_gpu_vram_mb,
    rec_storage_gb: data.rec_storage_gb,
    protondb_rating: data.protondb_rating,
    proton_reports: data.proton_reports,
    deck_status: data.deck_status,
    deck_notes: data.deck_notes,
    anti_cheat_type: data.anti_cheat_type,
    anti_cheat_status: data.anticheat_linux_status,
  };
}

/**
 * Get available genres from the database
 */
export async function getAvailableGenres(): Promise<string[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('games')
    .select('genre')
    .not('genre', 'is', null)
    .limit(1000);

  if (error) {
    console.error('Failed to fetch genres:', error);
    return [];
  }

  const genres = new Set<string>();
  (data || []).forEach(row => {
    if (row.genre) {
      row.genre.split(',').forEach((g: string) => {
        const trimmed = g.trim();
        if (trimmed) genres.add(trimmed);
      });
    }
  });

  return Array.from(genres).sort();
}

/**
 * Get database stats
 */
export async function getDatabaseStats(): Promise<{
  totalGames: number;
  gamesWithProton: number;
  gamesWithDeck: number;
  gamesWithAntiCheat: number;
}> {
  const supabase = getSupabase();

  const [
    { count: totalGames },
    { count: gamesWithProton },
    { count: gamesWithDeck },
    { count: gamesWithAntiCheat },
  ] = await Promise.all([
    supabase.from('games').select('*', { count: 'exact', head: true }),
    supabase.from('proton_compatibility').select('*', { count: 'exact', head: true }).neq('protondb_rating', 'unknown'),
    supabase.from('steamdeck_compatibility').select('*', { count: 'exact', head: true }),
    supabase.from('anti_cheat_status').select('*', { count: 'exact', head: true }),
  ]);

  return {
    totalGames: totalGames || 0,
    gamesWithProton: gamesWithProton || 0,
    gamesWithDeck: gamesWithDeck || 0,
    gamesWithAntiCheat: gamesWithAntiCheat || 0,
  };
}
