# Changelog

## 0.1.1 — 2026-11-03

- Fix `/cache` with arguments: the command now declares an input hint, so `/cache card`,
  `/cache receipt`, and `/cache 30d redact` are executed instead of being sent as chat messages.
- Register the command through `ctx.inject(['commands'])`, so the plugin still loads in profiles
  without a command registry and the command appears as soon as the registry is available.
- Add a release workflow that packs the tarball on every `v*` tag.

## 0.1.0 — 2026-11-03

- First public release.
- Replays DSH session logs (multi-frame Zstandard) and prices every DeepSeek call at the official peak/off-peak rates.
- Chat summary, self-contained HTML receipt, 1200×630 SVG share card, and JSON report.
- Cache score, project/model/day breakdowns, peak premium, cold-start accounting, and actionable tips.
- `/cache` command and `cache_receipt` tool; `redact` mode; local parse cache.
