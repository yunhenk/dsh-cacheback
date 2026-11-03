# How Cacheback computes the receipt

This page is the audit trail: the event fields, the formulas, the price table, and the assumptions behind every
number in a Cacheback receipt. If a figure looks wrong, this is the place to check it.

## 1. Input: DSH's session logs

Cacheback reads the newest `session*.jsonl(.zstd)` under each session directory:

```text
~/.dsh/sessions/
  --Users-alice-work-atlas--/
    session-42/
      session.v4.jsonl.zstd
```

The **session header** supplies `id`, `createdAt`, `cwd`, `isSeeded`, `inheritedEventCount`, and
`delegationDepth`. Each billable call is an `assistant/message` event:

```json
{
  "type": "assistant/message",
  "seq": 1234,
  "time": 1793713594604,
  "data": {
    "usage": {
      "inputTokens": 514,
      "outputTokens": 169,
      "cacheReadTokens": 39936,
      "cacheWriteTokens": 0
    },
    "message": {
      "source": { "kind": "model", "provider": "deepseek-official", "model": "deepseek-flash" }
    }
  }
}
```

`inputTokens` is the **uncached** prompt count. Cache traffic is separate, so:

```text
promptTokens = inputTokens + cacheReadTokens + cacheWriteTokens
```

DSH's own projection cache confirms the same semantics: `totalTokens = inputTokens + outputTokens +
cacheReadTokens + cacheWriteTokens`.

## 2. Decoding multi-frame logs

A compressed session is not one Zstandard frame. The JSONL persistence backend appends one checksummed frame per
write batch (a long session can contain thousands). Node's `zstdDecompressSync` stops after the first frame and
throws on the next, so Cacheback:

1. scans for the frame magic `28 B5 2F FD`;
2. decodes each candidate frame independently;
3. if a boundary is a false positive inside compressed bytes, extends to the next boundary until decoding succeeds;
4. skips a torn trailing frame (the session may be live while being read) and keeps every committed frame.

`partial: true` marks a session where at least one frame failed; committed calls are still counted and the receipt
adds a one-line note.

## 3. Which calls are billed

A call is included when all of these hold:

- it is an `assistant/message` with a non-empty `usage`;
- its `seq` is **after** the inherited cut for a seeded/forked session
  (`inheritedEventCount - 1` and the last `session/end-seed` marker);
- its provider is DeepSeek (`provider` contains `deepseek`, or no provider is recorded).

Calls from another provider are counted as `skippedCalls` and reported as excluded. They are not priced with
DeepSeek's table, because that would be wrong.

The session also records how many times its **tool table** changed (`request/header` → `tools` fingerprint). Each
change rewrites the cached prefix; the receipt surfaces the count as a `tool churn` tip when it is non-zero.

Retries are separate `assistant/message` records with their own usage, so they are separate billed attempts. That
is intentional: a retry costs money too.

## 4. Price table

USD per **1M tokens**, read from
[DeepSeek's pricing page](https://api-docs.deepseek.com/quick_start/pricing) on **2026-11-03**:

| Model | Window | Cache hit | Cache miss | Output |
|---|---|---:|---:|---:|
| `deepseek-flash` (V4.1 Flash) | Peak | $0.006 | $0.30 | $1.20 |
| `deepseek-flash` (V4.1 Flash) | Off-peak | $0.003 | $0.15 | $0.60 |
| `deepseek-v4-pro` (V4 Pro) | Peak | $0.044 | $1.32 | $3.96 |
| `deepseek-v4-pro` (V4 Pro) | Off-peak | $0.022 | $0.66 | $1.98 |

Model aliases:

- `deepseek-flash`, `deepseek-v4-flash`, `deepseek-v4-flash-vision-exp` → Flash. The pricing page states legacy
  `deepseek-v4-flash*` names are still accepted and billed at the Flash price.
- any id containing `pro` → Pro.
- anything else falls back to Flash; if you use a model with a different contract, treat the receipt as indicative
  and override the rate in code.

**Cache writes** are billed at the miss price, so `missTokens = inputTokens + cacheWriteTokens`.

## 5. Peak and off-peak

DeepSeek's peak window is **01:00–04:00 and 06:00–10:00 UTC, Monday–Friday, excluding Chinese public holidays**.
That is **09:00–12:00 and 14:00–18:00 Beijing time**. Off-peak is exactly half price.

Cacheback classifies each call by its **event timestamp in Beijing time** (UTC+8, no DST):

```text
peak = weekday(Beijing) ∈ Mon..Fri
    && hour(Beijing) ∈ [9,12) ∪ [14,18)
    && BeijingDate ∉ 2026 Chinese public holidays
```

The 2026 holiday set is the State Council notice
[国办发明电〔2025〕7号](https://www.gov.cn/zhengce/content/202511/content_7047090.htm):

```text
Jan 1–3 · Feb 15–23 · Apr 4–6 · May 1–5 · Jun 19–21 · Sep 25–27 · Oct 1–7
```

Other years fall back to weekdays only until their calendars are added.

## 6. Formulas

For one call with `h` cache-hit tokens, `m` cache-miss tokens, `o` output tokens, at rates `(hit, miss, out)`:

```text
cost      = (h·hit + m·miss + o·out) / 1,000,000
noCache   = ((h + m)·miss + o·out) / 1,000,000
saved     = noCache − cost
peakExtra = cost − costAtOffPeakRates(h, m, o)
```

`peakExtra` isolates the peak-window premium. It is **not** a second saving: the same tokens priced off-peak would
still cost something.

Session, project, model, and day totals are sums of these per-call figures, so every aggregate can be reconstructed
from the log.

Derived values:

```text
hitRate  = H / (H + M)
multiple = noCacheTotal / costTotal
discount = savedTotal / noCacheTotal
score    = round(hitRate · 100, 1)
grade    = S ≥ 99.5 · A+ ≥ 98 · A ≥ 95 · B ≥ 90 · C ≥ 80 · D below
```

`cold start` = a call with `h = 0` and `m ≥ 1,000`. `coldCost` is the cost of those calls. A cold start is not pure
waste (the work still happened), but it is the part of the bill a resumed session could have avoided.

## 7. CNY

DeepSeek bills in USD. The receipt shows an approximate CNY figure at `usdToCny` (default **7.2**), clearly marked
with `≈`. Change it in the plugin config:

```yaml
- id: cacheback
  config:
    usdToCny: 7.2
```

## 8. What the receipt does not do

- It does not estimate tokens from text. Every token count is provider-reported.
- It does not call a model, fetch a price, or upload anything.
- It does not include tokens from non-DeepSeek providers.
- It does not reconcile taxes, grants, discounts, or the provider invoice.
- It does not claim the counterfactual saving was cash back. It is the value of the cache discount, priced against
  the same traffic at the miss rate.

## 9. Reproducing a receipt

```sh
# Print the summary
/cache

# Re-parse every log (ignore the parse cache)
/cache refresh

# Last 30 days, redacted, as an HTML file
/cache receipt 30d redact

# Raw numbers for a spreadsheet
/cache json
```

The JSON report is written to `~/.dsh/cacheback/report-*.json` and contains the report and scan counters — no
session titles or message text.

## 10. Versioning

Pricing and the holiday calendar are code constants with an explicit `as-of` date in the receipt footer. When
DeepSeek changes prices, the constants change with a new release; an old receipt keeps its original footer so it
remains explainable.
