# Privacy & Telemetry

SpecPilot collects optional, anonymized telemetry only with explicit user opt-in.

Scope
- Telemetry is opt-in only (default: off).
- Only anonymous, non-identifying hardware and performance data is collected.
- No usernames, emails, IP addresses, or raw system logs are stored.

What is collected (opt-in)
- Hardware hash (one-way hash of detected hardware profile)
- Hardware fields (GPU tier/score, CPU tier/score, RAM, VRAM)
- Game identifier (Steam app id)
- Reported performance summary (avg FPS range, stability boolean)
- Timestamp and client app version

Anonymization & retention
- Hardware profile is hashed locally before transmission.
- All telemetry is stored without user-identifying metadata.
- Data retention: default 180 days; configurable by request.
- Users may request deletion of all telemetry for their hardware hash.

Transmission & storage
- Telemetry is sent over HTTPS to the backend telemetry collector.
- Stored in `user_reports` in `intelligence.db` (or central telemetry store).
- Access limited to maintainers; logs are rotated and audited.

Opt-in flow
- UI exposes a clear toggle in Settings.
- When enabled, the app shows exactly what will be sent.
- Users can revoke consent at any time from Settings; revocation triggers deletion request.

Privacy guarantees
- Opt-in only, anonymous by design.
- Transparent: users can inspect the exact payload before send.
- Deletable: per-request data removal available.
- GDPR/CCPA: support data access/deletion requests.

Contact
- For privacy-related questions or deletion requests, open an issue or email privacy@specpilot.local (project inbox).