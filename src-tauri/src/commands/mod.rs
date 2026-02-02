pub mod scan;
pub mod telemetry;
pub mod games;
pub mod readyup;
pub mod sync;
pub mod steam;

pub use scan::*;
pub use telemetry::*;
pub use games::*;
pub use readyup::*;
pub use steam::*;
// `sync` exposes development utilities (not used in production builds).
// Avoid re-exporting to prevent unused-import warnings during CI/tests.
// If you want to expose these commands to the Tauri runtime, register them
// explicitly in `main.rs` instead of a blanket `pub use`.
