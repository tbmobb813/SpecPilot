export async function invokeTauri<T = any>(cmd: string, args?: any): Promise<T> {
  try {
    const mod = await import('@tauri-apps/api/core');
    const inv = (mod as any).invoke;
    if (typeof inv !== 'function') {
      return Promise.reject(new Error('Tauri invoke not available'));
    }

    try {
      return await inv(cmd, args);
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  } catch (e) {
    return Promise.reject(new Error('Tauri API not available in this environment'));
  }
}
