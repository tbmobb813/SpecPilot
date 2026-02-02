/**
 * Check if running inside Tauri WebView (v1)
 */
function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * Safe wrapper around Tauri's invoke that gracefully handles non-Tauri environments.
 * Returns a rejected promise with a descriptive error when not in Tauri.
 */
export async function invokeTauri<T = any>(cmd: string, args?: any): Promise<T> {
  // Early exit if not in Tauri environment to avoid cryptic errors
  if (!isTauriEnvironment()) {
    return Promise.reject(new Error('Not running in Tauri environment'));
  }

  try {
    // Tauri v1 uses @tauri-apps/api/tauri
    const { invoke } = await import('@tauri-apps/api/tauri');
    if (typeof invoke !== 'function') {
      return Promise.reject(new Error('Tauri invoke not available'));
    }

    try {
      return await invoke(cmd, args);
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  } catch (e) {
    return Promise.reject(new Error('Tauri API not available in this environment'));
  }
}
