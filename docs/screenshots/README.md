# README screenshots and verification

Captured on 2026-10-16 (Asia/Shanghai) from source baseline `9ecef6225ab35ea3631cef155bb8a5a17823759b`.

## Capture environment

- Windows; Bun 1.4.2; Node.js v24.19.0; repository-pinned Electron 39.
- Actual Electron renderer at `file:///D:/folio/Trail/apps/electron/dist/renderer/index.html`, with the real preload bridge and main-process kernel. These are not browser-only mockups or generated UI illustrations.
- Chinese UI, light theme, 1600 × 1000 viewport. Captures use Playwright/CDP against dedicated Electron profiles. Browser plugin not available; repository-installed `playwright-core` was used.
- The live profile reused the configured model credentials locally. No credential files, user conversations, account identifiers or real account holdings are included in this documentation change.
- The demonstration profile disabled the `longbridge`, `longbridge-broker` and `massive` providers and used the local runtime. Final product captures use the UI's built-in sample fallback, with sample badges where implemented; no real account balances are shown.

## Current README assets

| File | Data / purpose |
| --- | --- |
| [research.png](research.png) | Live Longbridge public NVDA data and a real DeepSeek comprehensive research report. The report is explicitly **partial**: 15 capability calls completed and 1 failed out of 16. Report evidence is frozen; the surrounding current quote/chart can change afterward. |
| [workspace.png](workspace.png) | Live Longbridge NVDA K-line and a real DeepSeek quote answer, with source links. The captured quote lacked a provider timestamp and included zeroed pre-market fields; the answer describes these limitations. |
| [sources.png](sources.png) | The quote answer's Source Inspector: financial values, provider, retrieval time, stale status, normalization lineage and snapshot hash. |
| [today.png](today.png) | Built-in sample overview, watchlist, events and briefs. |
| [portfolio.png](portfolio.png) | Built-in sample balance, allocation and holdings. **Not a real brokerage account.** |
| [discover.png](discover.png) | Current screening task catalog and built-in sample content where present; no claim of a completed live market scan. |
| [events.png](events.png) | Built-in sample earnings/macro events, with sample labeling. |
| [skills.png](skills.png) | Skill list and readiness in the separate demonstration profile. |
| [evaluation.png](evaluation.png) | Evaluation Center after a real 15-case offline fixture smoke run. The visible 100% pass label and 77% aggregate belong to that deterministic experiment; tool coverage/evidence metrics remain visibly lower. No live-model quality is implied. |
| [evaluation-settings.png](evaluation-settings.png) | Tracing settings and privacy controls. Connections are not configured in this profile; this is not a successful cloud-export test. |
| [settings.png](settings.png) | Live profile's model configuration surface; credential fields contain no visible keys. |
| [profile.png](profile.png) | Local profile/health UI in the demonstration profile. |

All nine screenshots referenced by the previous README were replaced. Three images were added: research, sources and evaluation settings. Older `agent-typed-blocks-*.png` assets remain historical assets for existing documentation and are not used by the refreshed READMEs.

## Verification performed for this documentation refresh

```text
bun.cmd run build:electron
→ exit 0; renderer, preload and main built successfully.
→ Existing Vite option deprecation and bundle-size warnings remain.

bun.cmd run typecheck
→ core, i18n, shared, ui and electron all exit 0.

bun.cmd test --isolate packages/shared/src/research packages/ui/src/components/research packages/ui/src/lib/citations.test.ts packages/shared/src/strategies/presets.test.ts packages/shared/src/screening/strategies.test.ts --timeout 20000
→ 170 pass / 0 fail; 784 assertions; 21 files.
```

Desktop interaction evidence: watchlist → NVDA → K-line → real copilot query → citation/source inspection; Research → start comprehensive research → persisted partial report → reload after desktop restart; navigation to Today, Discover, Portfolio, Events, Skills, Evaluation, Settings and Profile. Screenshot inspection checks the resulting layouts, visible provenance and sample/empty states.

The baseline main CI [run 38905940792](https://github.com/ydflow/Trail/actions/runs/38905940792) succeeded on the exact source baseline above: Typecheck, Full unit tests and Secret scan passed. This is baseline evidence, not CI on the documentation commit. The workflow ignores Markdown and `docs/**` changes, so a documentation-only push need not create a new CI run.

Additional checks: 85 relative file links resolve; both READMEs pass GitHub's GFM rendering API and contain the same 12 screenshot assets. Desktop HTML preview verifies image loading and the expandable gallery. A fixture showcase was executed with `bun.cmd scripts/eval/run.ts --smoke --mode fixture --store artifacts/readme-refresh/demo-profile --out artifacts/readme-refresh/eval-smoke.json`: exit 0, 15/15 runs completed and deterministically scored, no judge configured. The first invocation used an unsupported `--store-dir` flag and exited before any cases; it was corrected to `--store`.

## Observed limits

- A first live answer emitted an invalid `time_series_chart` block and fell back to text; its rendered Markdown table was also fragmented around citations. That attempt remains in the local capture profile. A separate short quote question supplied the clean workspace/source screenshots; it is not evidence that all model output contracts pass.
- Deep Research completed as `partial`; several retrieved fields were absent or not usable for analysis, and the model-generated report was in English within the Chinese UI. No report text or financial values were edited for the screenshots.
- Hidden-window screenshot capture stalled on Windows; final gallery captures were taken from visible Electron windows. Temporary capture scripts/profiles/logs are excluded from Git.
- Full Electron regression, interruption/fault injection, real brokerage portfolio verification, cloud tracing, complete live benchmark, installer distribution, signing and notarization were not run for this README change. Existing recovery acceptance remains a separate historical record.
- Screenshot content is time-specific and does not substantiate investment returns, model accuracy, general reliability or cross-platform production readiness.
