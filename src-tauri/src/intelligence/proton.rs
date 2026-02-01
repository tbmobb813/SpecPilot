//! ProtonDB compatibility and anti-cheat status handling
//!
//! This module provides types and logic for integrating ProtonDB ratings
//! and anti-cheat status into game compatibility verdicts.

use serde::{Deserialize, Serialize};

/// ProtonDB rating levels
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProtonRating {
    /// Works perfectly out of the box
    Platinum,
    /// Works with minor tweaks
    Gold,
    /// Works with some issues
    Silver,
    /// Runs but has significant issues
    Bronze,
    /// Does not work
    Borked,
    /// No data available
    Unknown,
}

impl ProtonRating {
    /// Parse from string (ProtonDB API format)
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "platinum" => ProtonRating::Platinum,
            "gold" => ProtonRating::Gold,
            "silver" => ProtonRating::Silver,
            "bronze" => ProtonRating::Bronze,
            "borked" => ProtonRating::Borked,
            _ => ProtonRating::Unknown,
        }
    }

    /// Returns true if the game is considered playable on Linux
    pub fn is_playable(&self) -> bool {
        matches!(self, ProtonRating::Platinum | ProtonRating::Gold | ProtonRating::Silver)
    }

    /// Returns true if the game has issues but might work
    pub fn has_issues(&self) -> bool {
        matches!(self, ProtonRating::Silver | ProtonRating::Bronze)
    }

    /// Returns a confidence modifier for the verdict (0.0 - 1.0)
    /// Higher = more confident the game works
    pub fn confidence_modifier(&self) -> f32 {
        match self {
            ProtonRating::Platinum => 1.0,
            ProtonRating::Gold => 0.95,
            ProtonRating::Silver => 0.75,
            ProtonRating::Bronze => 0.4,
            ProtonRating::Borked => 0.0,
            ProtonRating::Unknown => 0.5, // Unknown = medium confidence
        }
    }

    /// Get a user-friendly description
    pub fn description(&self) -> &'static str {
        match self {
            ProtonRating::Platinum => "Works perfectly on Linux/Proton",
            ProtonRating::Gold => "Works with minor tweaks on Linux",
            ProtonRating::Silver => "Playable with some issues on Linux",
            ProtonRating::Bronze => "Runs but has significant issues",
            ProtonRating::Borked => "Does not work on Linux",
            ProtonRating::Unknown => "No Linux compatibility data available",
        }
    }
}

/// ProtonDB compatibility data for a game
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtonCompatibility {
    pub rating: ProtonRating,
    pub total_reports: u32,
    /// Common launch options that help (e.g., "PROTON_USE_WINED3D=1")
    pub recommended_tweaks: Vec<String>,
    /// Known issues reported by users
    pub known_issues: Vec<String>,
}

impl Default for ProtonCompatibility {
    fn default() -> Self {
        ProtonCompatibility {
            rating: ProtonRating::Unknown,
            total_reports: 0,
            recommended_tweaks: Vec::new(),
            known_issues: Vec::new(),
        }
    }
}

impl ProtonCompatibility {
    /// Create from ProtonDB API data
    pub fn from_protondb(rating: &str, reports: u32) -> Self {
        ProtonCompatibility {
            rating: ProtonRating::from_str(rating),
            total_reports: reports,
            recommended_tweaks: Vec::new(),
            known_issues: Vec::new(),
        }
    }

    /// Returns true if we have enough data to be confident
    pub fn has_sufficient_data(&self) -> bool {
        self.total_reports >= 10
    }
}

/// Anti-cheat types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AntiCheatType {
    EasyAntiCheat,
    BattlEye,
    Vanguard,       // Riot's Vanguard
    PunkBuster,
    NProtect,       // GameGuard
    Denuvo,         // DRM, not anti-cheat but causes issues
    Other,
    None,
}

impl AntiCheatType {
    pub fn from_str(s: &str) -> Self {
        let lower = s.to_lowercase();
        if lower.contains("easy anti-cheat") || lower.contains("eac") {
            AntiCheatType::EasyAntiCheat
        } else if lower.contains("battleye") {
            AntiCheatType::BattlEye
        } else if lower.contains("vanguard") {
            AntiCheatType::Vanguard
        } else if lower.contains("punkbuster") {
            AntiCheatType::PunkBuster
        } else if lower.contains("gameguard") || lower.contains("nprotect") {
            AntiCheatType::NProtect
        } else if lower.contains("denuvo") {
            AntiCheatType::Denuvo
        } else if lower.is_empty() || lower == "none" {
            AntiCheatType::None
        } else {
            AntiCheatType::Other
        }
    }

    pub fn name(&self) -> &'static str {
        match self {
            AntiCheatType::EasyAntiCheat => "Easy Anti-Cheat",
            AntiCheatType::BattlEye => "BattlEye",
            AntiCheatType::Vanguard => "Vanguard",
            AntiCheatType::PunkBuster => "PunkBuster",
            AntiCheatType::NProtect => "NProtect GameGuard",
            AntiCheatType::Denuvo => "Denuvo",
            AntiCheatType::Other => "Other Anti-Cheat",
            AntiCheatType::None => "None",
        }
    }
}

/// Linux support status for anti-cheat
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LinuxAntiCheatSupport {
    /// Developer has enabled Linux/Proton support
    Supported,
    /// Developer has explicitly denied Linux support
    Denied,
    /// Broken/not working even if technically supported
    Broken,
    /// Unknown status
    Unknown,
}

impl LinuxAntiCheatSupport {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "supported" | "running" | "working" => LinuxAntiCheatSupport::Supported,
            "denied" | "blocked" => LinuxAntiCheatSupport::Denied,
            "broken" | "not working" => LinuxAntiCheatSupport::Broken,
            _ => LinuxAntiCheatSupport::Unknown,
        }
    }
}

/// Complete anti-cheat status for a game
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AntiCheatStatus {
    pub anti_cheat_type: AntiCheatType,
    pub linux_support: LinuxAntiCheatSupport,
    /// Source of this information (e.g., "areweanticheatyet")
    pub source: Option<String>,
}

impl Default for AntiCheatStatus {
    fn default() -> Self {
        AntiCheatStatus {
            anti_cheat_type: AntiCheatType::None,
            linux_support: LinuxAntiCheatSupport::Unknown,
            source: None,
        }
    }
}

impl AntiCheatStatus {
    /// Returns true if the game is blocked on Linux due to anti-cheat
    pub fn blocks_linux(&self) -> bool {
        match self.anti_cheat_type {
            AntiCheatType::None => false,
            _ => matches!(self.linux_support, LinuxAntiCheatSupport::Denied | LinuxAntiCheatSupport::Broken),
        }
    }

    /// Get a user-friendly message about the anti-cheat status
    pub fn message(&self) -> String {
        if self.anti_cheat_type == AntiCheatType::None {
            return "No anti-cheat detected".to_string();
        }

        let ac_name = self.anti_cheat_type.name();
        match self.linux_support {
            LinuxAntiCheatSupport::Supported => {
                format!("{} is supported on Linux", ac_name)
            }
            LinuxAntiCheatSupport::Denied => {
                format!("{} blocks Linux play - developer has not enabled support", ac_name)
            }
            LinuxAntiCheatSupport::Broken => {
                format!("{} is broken on Linux despite official support", ac_name)
            }
            LinuxAntiCheatSupport::Unknown => {
                format!("{} detected - Linux support status unknown", ac_name)
            }
        }
    }
}

/// Combined Linux compatibility info for verdict engine
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LinuxCompatibility {
    pub proton: ProtonCompatibility,
    pub anti_cheat: AntiCheatStatus,
    /// Steam Deck verified status
    pub deck_status: Option<String>, // "verified", "playable", "unsupported", "unknown"
}

impl LinuxCompatibility {
    /// Returns true if the game can run on Linux
    pub fn can_run_on_linux(&self) -> bool {
        // Anti-cheat blocks take priority
        if self.anti_cheat.blocks_linux() {
            return false;
        }

        // If ProtonDB says borked, it won't run
        if self.proton.rating == ProtonRating::Borked {
            return false;
        }

        true
    }

    /// Returns an overall confidence score (0.0 - 1.0)
    pub fn confidence(&self) -> f32 {
        if self.anti_cheat.blocks_linux() {
            return 0.0;
        }

        let mut confidence = self.proton.rating.confidence_modifier();

        // Boost confidence if we have many reports
        if self.proton.total_reports > 100 {
            confidence = (confidence + 0.1).min(1.0);
        }

        // Boost if Steam Deck verified
        if let Some(ref status) = self.deck_status {
            if status == "verified" {
                confidence = (confidence + 0.1).min(1.0);
            }
        }

        confidence
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_proton_rating_from_str() {
        assert_eq!(ProtonRating::from_str("platinum"), ProtonRating::Platinum);
        assert_eq!(ProtonRating::from_str("GOLD"), ProtonRating::Gold);
        assert_eq!(ProtonRating::from_str("Silver"), ProtonRating::Silver);
        assert_eq!(ProtonRating::from_str("bronze"), ProtonRating::Bronze);
        assert_eq!(ProtonRating::from_str("borked"), ProtonRating::Borked);
        assert_eq!(ProtonRating::from_str("unknown"), ProtonRating::Unknown);
        assert_eq!(ProtonRating::from_str("garbage"), ProtonRating::Unknown);
    }

    #[test]
    fn test_proton_rating_is_playable() {
        assert!(ProtonRating::Platinum.is_playable());
        assert!(ProtonRating::Gold.is_playable());
        assert!(ProtonRating::Silver.is_playable());
        assert!(!ProtonRating::Bronze.is_playable());
        assert!(!ProtonRating::Borked.is_playable());
    }

    #[test]
    fn test_anti_cheat_type_from_str() {
        assert_eq!(AntiCheatType::from_str("Easy Anti-Cheat"), AntiCheatType::EasyAntiCheat);
        assert_eq!(AntiCheatType::from_str("EAC"), AntiCheatType::EasyAntiCheat);
        assert_eq!(AntiCheatType::from_str("BattlEye"), AntiCheatType::BattlEye);
        assert_eq!(AntiCheatType::from_str("none"), AntiCheatType::None);
    }

    #[test]
    fn test_anti_cheat_blocks_linux() {
        let blocked = AntiCheatStatus {
            anti_cheat_type: AntiCheatType::EasyAntiCheat,
            linux_support: LinuxAntiCheatSupport::Denied,
            source: None,
        };
        assert!(blocked.blocks_linux());

        let supported = AntiCheatStatus {
            anti_cheat_type: AntiCheatType::EasyAntiCheat,
            linux_support: LinuxAntiCheatSupport::Supported,
            source: None,
        };
        assert!(!supported.blocks_linux());

        let no_ac = AntiCheatStatus::default();
        assert!(!no_ac.blocks_linux());
    }

    #[test]
    fn test_linux_compatibility_can_run() {
        let mut compat = LinuxCompatibility::default();
        compat.proton.rating = ProtonRating::Gold;
        assert!(compat.can_run_on_linux());

        // Anti-cheat blocks even with good Proton rating
        compat.anti_cheat.anti_cheat_type = AntiCheatType::Vanguard;
        compat.anti_cheat.linux_support = LinuxAntiCheatSupport::Denied;
        assert!(!compat.can_run_on_linux());
    }

    #[test]
    fn test_linux_compatibility_confidence() {
        let mut compat = LinuxCompatibility::default();
        compat.proton.rating = ProtonRating::Platinum;
        compat.proton.total_reports = 150;
        compat.deck_status = Some("verified".to_string());

        let confidence = compat.confidence();
        assert!(confidence > 1.0 - 0.01); // Should be maxed at 1.0

        // Borked rating
        compat.proton.rating = ProtonRating::Borked;
        assert_eq!(compat.confidence(), 0.0);
    }
}
