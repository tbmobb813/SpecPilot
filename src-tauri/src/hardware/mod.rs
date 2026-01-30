mod common;
mod platform;

pub use common::*;

#[cfg(target_os = "linux")]
use platform::linux as platform_impl;

#[cfg(target_os = "windows")]
use platform::windows as platform_impl;

pub fn scan_system() -> Result<HardwareProfile> {
    let cpu = platform_impl::detect_cpu()?;
    let gpu = platform_impl::detect_gpu()?;
    let memory = platform_impl::detect_memory()?;
    let storage = platform_impl::detect_storage()?;
    let os = platform_impl::detect_os()?;

    let graphics_api = GraphicsApiSupport {
        #[cfg(target_os = "linux")]
        directx: None,

        #[cfg(target_os = "windows")]
        directx: platform_impl::detect_directx().ok().flatten(),

        #[cfg(target_os = "linux")]
        vulkan: platform_impl::detect_vulkan()?,

        #[cfg(target_os = "windows")]
        vulkan: None, // Could detect on Windows too

        opengl: None, // Could add detection
        metal: None,  // macOS only
    };

    Ok(HardwareProfile {
        cpu,
        gpu,
        memory,
        storage,
        os,
        graphics_api,
    })
}
