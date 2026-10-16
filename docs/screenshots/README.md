# Current UI screenshot inventory

All **15 product screenshots** were recaptured from the current Electron client on 2026-10-16 (Asia/Shanghai). The gallery now uses the versioned `ui-2026-10-16/` directory. The old product PNGs at the root of `docs/screenshots/` were removed after checking that each had a replacement. Both language READMEs directly display every image, including the three structured-answer screenshots omitted from the previous refresh; the gallery is no longer collapsed.

## Environment and data

- Windows, Bun 1.4.2, Node.js v24.19.0 and repository-pinned Electron 39. Source UI is the implementation merged at `9ecef6225ab35ea3631cef155bb8a5a17823759b`; the starting documentation revision for this follow-up was `ba458279e5b23416f2800e260f5118bbf671933d`.
- Actual desktop renderer with its preload bridge and main-process kernel, driven with repository-installed Playwright/CDP. Browser plugin not available. No generated UI images or injected financial values were used.
- Chinese UI and light theme. Standard screens are 1600 × 1000; the three structured-answer screens are 1600 × 1200 so the tables and chart can be read together.
- The isolated live profile uses the existing model credentials locally and Longbridge public NVDA data. The stored comprehensive report from the preceding live run is reopened, with a refreshed surrounding quote/chart; report evidence remains its original snapshot.
- Product demonstration screens use providers disabled in the separate local profile, allowing the UI's built-in sample fallback. Structured-answer screens additionally enable `FINAGENT_DEMO_DATA=1` so real local-agent tool execution generates typed blocks carrying sample badges.
- Portfolio amounts, holdings and risk comparisons are examples, not a real brokerage account. No credential files, real account identifiers or real account holdings are published.

## Complete replacement map

Each filename below replaces the root-level PNG with the same basename.

| Current image | Captured state |
| --- | --- |
| [research.png](ui-2026-10-16/research.png) | Loaded NVDA chart, evidence and decision rail; previously generated real DeepSeek report, explicitly partial (15 completed capability calls, 1 failed). |
| [workspace.png](ui-2026-10-16/workspace.png) | Current Longbridge quote/K-line and a newly executed DeepSeek public quote answer. Missing provider timestamp is disclosed in the answer. |
| [sources.png](ui-2026-10-16/sources.png) | Source Inspector for that newly executed answer, with quote values, provider, timestamp status, lineage and snapshot hash. |
| [today.png](ui-2026-10-16/today.png) | Built-in sample overview, watchlist, events and briefs. |
| [portfolio.png](ui-2026-10-16/portfolio.png) | Sample account overview, allocation and holdings, visibly labeled as sample data. |
| [discover.png](ui-2026-10-16/discover.png) | Current screening task catalog; no live market-wide scan is implied. |
| [events.png](ui-2026-10-16/events.png) | Sample earnings and macro calendar. |
| [skills.png](ui-2026-10-16/skills.png) | Current skill list and capability readiness. |
| [evaluation.png](ui-2026-10-16/evaluation.png) | Existing 15-case offline fixture experiment, with its metric breakdown; not live-model quality. |
| [settings.png](ui-2026-10-16/settings.png) | Live model/runtime configuration after loading, with blank credential input fields. |
| [evaluation-settings.png](ui-2026-10-16/evaluation-settings.png) | Tracing switches, privacy and service configuration surfaces; not cloud-export acceptance. |
| [profile.png](ui-2026-10-16/profile.png) | Loaded local workspace identity and health status. |
| [agent-typed-blocks-quote.png](ui-2026-10-16/agent-typed-blocks-quote.png) | Newly executed local quote question: `metric_grid` + `time_series_chart`, two sample badges and evidence links. |
| [agent-typed-blocks-portfolio.png](ui-2026-10-16/agent-typed-blocks-portfolio.png) | Newly executed local portfolio question: `data_table`, sample badge and evidence links. |
| [agent-typed-blocks-risk.png](ui-2026-10-16/agent-typed-blocks-risk.png) | Newly executed local portfolio-risk question: `comparison_table`, sample badge and evidence links. |

## Verification for this follow-up

- All 15 expected PNGs exist in the versioned directory, have valid dimensions, and appear in both READMEs. No old root-level product screenshot files or old product screenshot references remain.
- Actual typed-answer flows: `What is the quote for AAPL.US?`, `Show my portfolio`, and `What is my portfolio risk?`. Their four expected block types and sample badges were checked after rendering. Reopening the three sessions restored their blocks before the final screenshots.
- Live flow: NVDA watchlist → chart → new public quote question → model answer → Source Inspector. The first run failed its Pi health check after 5000 ms; the existing Retry action subsequently completed the answer with two tool steps. This successful retry is not a claim that startup reliability is fixed.
- Research and security screenshots were recaptured after waiting for the visible quote/chart to finish loading. Screenshots do not replace missing values or alter model text.
- Relative links, GitHub GFM rendering, image loading and direct gallery visibility were checked in both languages. The documentation-only scope does not require repeating the full source test suite.

## Prior source validation and limits

The preceding documentation refresh ran `bun.cmd run build:electron` and `bun.cmd run typecheck` successfully, plus 170 focused tests (0 failures, 784 assertions across 21 files). Those checks were not repeated for this image/reference-only follow-up. The existing fixture experiment completed 15/15 cases with deterministic evaluators and no judge; its visible 100% pass label and 77% aggregate are specific to that fixture run, with lower tool/evidence metrics still visible.

The source baseline's [main CI run 38905940792](https://github.com/ydflow/Trail/actions/runs/38905940792) passed Typecheck, Full unit tests and Secret scan. It is baseline evidence, not CI on this documentation update. The workflow ignores Markdown and `docs/**` changes.

Full Electron regression, fault injection, cloud tracing, live-model benchmark, real portfolio verification, installers, signing and notarization were not run here. The earlier live answer with an invalid structured block, and the partial English research report within Chinese UI, remain known limitations. Historical fault-injection and before/after evidence outside the product screenshot directory remains historical evidence; it is not used as the README gallery.
