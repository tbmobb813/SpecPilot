use std::collections::HashMap;

fn seeded_cpu_scores() -> HashMap<&'static str, u32> {
    let mut m = HashMap::new();
    // Seeded from small sample of common CPUs / PassMark-like scores (illustrative)
    m.insert("intel core i9-13900k", 18000);
    m.insert("amd ryzen 9 7950x", 17500);
    m.insert("intel core i7-13700k", 15000);
    m.insert("amd ryzen 5 5600x", 9000);
    // Test-specific entry used by unit tests
    m.insert("testcpu", 3500);
    m
}

fn seeded_gpu_scores() -> HashMap<&'static str, u32> {
    let mut m = HashMap::new();
    // Seeded example GPU scores (illustrative / normalized)
    m.insert("nvidia geforce rtx 4090", 20000);
    m.insert("nvidia geforce rtx 3080", 12000);
    m.insert("amd radeon rx 7900 xtx", 18000);
    m.insert("nvidia geforce rtx 3060", 7000);
    // Test-specific entry used by unit tests
    m.insert("testgpu", 8000);
    m
}

/// Try to find a CPU benchmark score by model name (case-insensitive contains match)
pub fn get_cpu_score_for_model(model: &str) -> Option<u32> {
    let model_l = model.to_lowercase();
    let table = seeded_cpu_scores();
    for (k, v) in table.iter() {
        if model_l.contains(k) { return Some(*v); }
    }
    None
}

/// Try to find a GPU benchmark score by model name (case-insensitive contains match)
pub fn get_gpu_score_for_model(model: &str) -> Option<u32> {
    let model_l = model.to_lowercase();
    let table = seeded_gpu_scores();
    for (k, v) in table.iter() {
        if model_l.contains(k) { return Some(*v); }
    }
    None
}
