# SpecPilot Market Research

*Last Updated: February 2026*

## Executive Summary

SpecPilot enters a market with **no direct competition** for Linux/Steam Deck game compatibility checking. While Windows-focused tools like "Can You Run It" dominate the general PC gaming space, they completely ignore the rapidly growing Linux gaming segment. Existing Linux tools (ProtonDB, Steam Deck Verified) solve parts of the problem but leave significant gaps that SpecPilot uniquely fills.

---

## Market Size & Growth

### Linux Gaming Statistics (2025)

| Metric | Value | Source |
|--------|-------|--------|
| Steam Linux market share | 3.58% (Dec 2025) | [WebProNews](https://www.webpronews.com/linux-steam-market-share-hits-record-3-58-in-december-2025/) |
| Year-over-year growth | 52% | [Phoronix](https://www.phoronix.com/news/Steam-December-2025-Survey) |
| SteamOS share of Linux | ~30% | Steam Survey |
| Estimated Linux gamers on Steam | 4.6M+ | Based on 130M Steam MAU |
| Windows 10 EOL migrations to Linux | 780,000+ | Zorin OS report |

### Growth Drivers

1. **Steam Deck adoption** - Multi-million units shipped, SteamOS driving Linux gaming awareness
2. **Windows 10 EOL** (October 2025) - Hardware requirements for Windows 11 pushing users to alternatives
3. **Proton maturity** - ~70% of games "just work" on Linux via Proton
4. **AMD dominance** - 72% of Linux gamers use AMD CPUs (excellent open-source driver support)

### Market Trajectory

- Linux desktop market share: 4.7% globally (2025), up 70% from 2022
- Linux OS market projected: $21.97B (2024) → $99.69B (2032) at 20.9% CAGR
- SteamOS share trending down while Arch/Ubuntu growing → organic Linux adoption beyond just Steam Deck

---

## Competitive Landscape

### Windows-Focused Competitors

| Tool | URL | Pros | Cons |
|------|-----|------|------|
| **Can You Run It** | [systemrequirementslab.com](https://www.systemrequirementslab.com/cyri) | Large database, brand recognition | Windows-only, requires plugin, [often inaccurate](https://steamcommunity.com/discussions/forum/0/1638669204733001749/) |
| **PCGameBenchmark** | [pcgamebenchmark.com](https://www.pcgamebenchmark.com/) | Real-world FPS data, benchmarks | Windows-centric, no Linux |
| **Technical.city** | [technical.city](https://technical.city/en/can-i-run-it) | No download needed, free | Limited Linux support |
| **Sysrqmts.com** | [sysrqmts.com](https://sysrqmts.com/) | Large game database | Windows-only |
| **CanIRunTheGame** | [canirunthegame.com](https://www.canirunthegame.com) | AI-powered, 50K+ games | Windows-only |

### Linux/Steam Deck Tools

| Tool | URL | What It Does | What It Lacks |
|------|-----|--------------|---------------|
| **ProtonDB** | [protondb.com](https://www.protondb.com/) | Community Proton compatibility reports | No hardware requirement matching |
| **Steam Deck Verified** | [steamdeck.com/verified](https://www.steamdeck.com/en/verified) | Official Valve ratings | [Frequently inaccurate](https://www.howtogeek.com/why-you-cant-trust-steam-deck-verified-labels-and-what-to-do-about-it/), ratings go stale |
| **CheckMyDeck** | [checkmydeck.ofdgn.com](https://checkmydeck.ofdgn.com/) | Filter library by Deck status | Only Deck status, not hardware matching |
| **Lutris** | [lutris.net](https://lutris.net/) | Multi-launcher, Wine management | Not a compatibility checker |
| **Are We Anti-Cheat Yet** | [areweanticheatyet.com](https://areweanticheatyet.com/) | Anti-cheat compatibility tracking | Single-purpose, no hardware matching |

### Key Insight: The Gap

**No tool combines:**
- Hardware detection + requirement matching
- Proton/Wine compatibility data
- Steam Deck verification status
- Community performance reports

**Linux gamers must currently check 4+ sources manually** to answer "will this game work on my system?"

---

## Consumer Pain Points

### 1. Steam Deck Verified Labels Are Unreliable

**Evidence:**
- ["Valve, your verified games don't work"](https://steamcommunity.com/app/1675200/discussions/0/3771239453234058835/) - Steam forum thread
- ["List of verified games that does not work... WHY???"](https://steamcommunity.com/app/1675200/discussions/0/3273566073558135009/) - Steam forum
- [Some Steam Deck Verified Games Aren't Working Well](https://techraptor.net/gaming/news/some-steam-deck-verified-games-arent-working-well-players-say) - TechRaptor
- ["Steam Deck Verified Games Won't Stop Breaking"](https://www.howtogeek.com/867721/steam-deck-verified-games-wont-stop-breaking/) - How-To Geek

**Specific Examples of Broken "Verified" Games:**
- Apex Legends - no button response on default config
- God of War - stuttering, hard locks requiring restarts
- Horizon Zero Dawn - thermal throttling, refund-worthy performance
- DOOM 2016 - repeated crashes
- Deathloop - poor performance, crashes on suspend
- HITMAN - gamepad input not working
- EA games - many broke after launcher update (Dec 2024)

**Root Causes:**
- Ratings based on Valve contractor testing, not real user feedback
- No automatic re-testing when devs push updates
- Status updates lag behind reality

**User Sentiment:**
> "If it requires *any* workaround to get working, then it shouldn't be added to the list of verified working."

### 2. Traditional "Can You Run It" Tools Have Major Flaws

**Hardware Detection Problems:**
- [Often misreads specs](https://www.digitaltrends.com/computing/how-to-check-if-your-pc-meets-a-games-system-requirements/) - especially Nvidia Optimus laptops
- "Steam never picked up my card and instead always sees the Intel integrated graphics"
- Requires browser plugins that users distrust

**Inaccurate Results:**
- Called ["a terrible website"](https://steamcommunity.com/app/255710/discussions/0/611698195170375047) by users
- One user: "System Requirements Lab said I couldn't run XCOM at all. Bought it anyway, runs fine."
- Requirements themselves are ["garbage data"](https://steamcommunity.com/discussions/forum/10/6026443283693462048/) - no standard for what "minimum" means

**Why Major Platforms Avoid This:**
> "Microsoft tried it within the OS and it failed hard so they removed it... If Valve implemented such a system, users would expect guarantees, leading to an awful lot of complaints."

### 3. ProtonDB Is Great But Incomplete

**Strengths:**
- Community-driven, covers most Steam games
- Shows Proton version compatibility
- Platinum/Gold/Silver/Bronze/Borked ratings

**Weaknesses:**
- No hardware requirement matching whatsoever
- Inconsistent reporting quality
- Users must manually combine ProtonDB + requirements + Deck status
- No personalized "will it work on MY hardware" verdict

### 4. Fragmented Information Landscape

**Current Linux Gamer Workflow:**
1. Check ProtonDB for Proton compatibility
2. Check Steam Deck Verified status
3. Check PCGamingWiki for requirements
4. Check Are We Anti-Cheat Yet for multiplayer games
5. Manually compare against own hardware specs
6. Hope for the best

**This is the core problem SpecPilot solves.**

### 5. Anti-Cheat Remains a Hard Blocker

Games that don't work regardless of hardware:
- Destiny 2
- Fortnite
- Recent Call of Duty titles
- Many competitive multiplayer games

Users need clear, upfront warnings about these blockers.

---

## SpecPilot's Competitive Advantages

| Consumer Pain Point | SpecPilot Solution |
|---------------------|-------------------|
| "Verified" labels unreliable | Multi-source verdicts combining ProtonDB + Deck + requirements + community reports |
| Hardware detection fails | Native Tauri/Rust detection via sysfs, lspci, vulkaninfo - no browser plugin |
| No Linux support in major tools | **Linux-first design**, works on Deck/Arch/Ubuntu/Fedora/etc |
| ProtonDB lacks hardware matching | Combines Proton compatibility WITH specific hardware specs |
| Must check 4+ sources manually | Single unified verdict with all sources aggregated |
| Ratings go stale | Opt-in telemetry keeps community data fresh |
| Generic "playable/not playable" | Bottleneck analysis with actionable recommendations |
| Privacy concerns | Opt-in, anonymized, transparent data collection |

### Unique Value Propositions

1. **Only Linux-first game compatibility checker** - literally no competition
2. **Hardware + Proton combined** - nobody else does this
3. **Privacy-first design** - critical for Linux community trust
4. **Bottleneck analysis** - goes beyond yes/no to explain why
5. **Offline-capable** - local database works without internet
6. **Cross-platform** - same tool works on Deck, desktop Linux, Windows

---

## Go-To-Market Strategy Recommendations

### Target Communities

| Community | Platform | Why |
|-----------|----------|-----|
| r/SteamDeck | Reddit | 800K+ members, active complaints about Verified accuracy |
| r/linux_gaming | Reddit | 300K+ members, core audience |
| GamingOnLinux | Website/Forum | Trusted Linux gaming news source |
| ProtonDB Discord | Discord | Power users who understand the problem |
| Linux YouTubers | YouTube | The Linux Experiment, Chris Titus Tech, etc. |

### Messaging Angles

1. **"Steam Deck Verified is broken"** - leverage existing frustration
2. **"One app, all sources"** - solve the fragmentation problem
3. **"Built for Linux, by Linux users"** - community credibility
4. **"Know before you buy"** - save money on incompatible games
5. **"Your hardware, your verdict"** - personalized, not generic

### Growth Tactics

1. **Browser extension** for Steam store pages showing SpecPilot verdicts
2. **ProtonDB partnership** - they have data, we have hardware matching
3. **Deck-specific landing page** - SEO for "Steam Deck game checker"
4. **Open source core** - build community trust and contributions
5. **Embed in Lutris/Heroic** - integration with existing Linux gaming tools

---

## Potential Partnerships

| Partner | Value Exchange |
|---------|----------------|
| **ProtonDB** | We add hardware matching, they get better data + exposure |
| **Lutris** | Built-in compatibility checks before install |
| **Heroic Games Launcher** | Epic/GOG game compatibility for Linux |
| **GamingOnLinux** | Editorial coverage, community reach |
| **Steam Deck focused YouTubers** | Reviews, tutorials, reach |

---

## Risk Factors

### Technical Risks
- Hardware detection edge cases (exotic GPUs, ARM devices)
- Data accuracy depends on community contributions
- Anti-cheat landscape changes rapidly

### Market Risks
- Valve could improve Deck Verified system (but haven't for 3+ years)
- ProtonDB could add hardware matching (would validate our thesis)
- Windows competitors could add Linux support (unlikely given their business model)

### Competitive Moat
- First-mover advantage in growing market
- Community data accumulation creates network effects
- Linux-first positioning difficult for Windows-centric competitors to replicate
- Privacy-first design aligns with Linux community values

---

## Success Metrics

### MVP Phase (3 months)
- 100 games with verified requirements
- 1,000+ user hardware reports
- 95%+ verdict accuracy
- <500ms verdict generation
- Featured on GamingOnLinux

### Growth Phase (6 months)
- 1,000+ games covered
- 10,000+ active users
- #1 result for "Steam Deck game checker"
- 50%+ telemetry opt-in rate
- r/SteamDeck sidebar listing

### Market Leader Phase (12 months)
- 5,000+ games covered
- 50,000+ active users
- ProtonDB partnership or integration
- Featured in major Linux distro app stores
- Recognized as the standard tool for Linux game compatibility

---

## Conclusion

SpecPilot enters a market with:
- **Clear unmet need** - Linux gamers have no unified compatibility tool
- **Growing audience** - 52% YoY growth in Linux gaming
- **Vocal frustration** - documented complaints about current solutions
- **No direct competition** - Windows tools ignore Linux, Linux tools are fragmented
- **Strong timing** - Windows 10 EOL, Steam Deck adoption, Proton maturity

The opportunity is to become the "Can You Run It" for the Linux gaming community - a market segment that is underserved, growing, and actively seeking a solution.

---

## Sources

- [Linux Steam Market Share Dec 2025](https://www.webpronews.com/linux-steam-market-share-hits-record-3-58-in-december-2025/)
- [Steam December 2025 Survey](https://www.phoronix.com/news/Steam-December-2025-Survey)
- [Linux Gaming Surges Oct 2025](https://windowsforum.com/threads/linux-gaming-surges-as-steam-deck-pushes-steamos-past-3-oct-2025.387747/)
- [Why You Can't Trust Steam Deck Verified](https://www.howtogeek.com/why-you-cant-trust-steam-deck-verified-labels-and-what-to-do-about-it/)
- [Steam Deck Verified Games Won't Stop Breaking](https://www.howtogeek.com/867721/steam-deck-verified-games-wont-stop-breaking/)
- [Some Verified Games Aren't Working Well](https://techraptor.net/gaming/news/some-steam-deck-verified-games-arent-working-well-players-say)
- [How to Check Game Compatibility for Linux](https://www.gamingonlinux.com/guides/view/how-to-check-game-compatibility-for-linux-steamos-and-steam-deck/)
- [4 Ways to Check If a Game Will Run on Linux](https://www.yahoo.com/tech/4-ways-check-game-run-183013683.html)
- [Problems Gaming on Linux](https://www.howtogeek.com/problems-youll-likely-run-into-gaming-on-linux/)
- [ProtonDB](https://www.protondb.com/)
- [Steam Deck Verified](https://www.steamdeck.com/en/verified)
- [Can You Run It](https://www.systemrequirementslab.com/cyri)
- [PCGameBenchmark](https://www.pcgamebenchmark.com/)
