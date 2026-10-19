# Trail Deep Research 数据获取基准

本目录只测 Trail 的真实数据获取链路。`ResearchRunner`、Planner、能力定义、ProviderRouter 和 Longbridge 适配器均使用项目已有代码；不修改生产并发常量，不调用交易或私人账户能力。

2026-10-19 的固定证据、原始 ZIP 和离线核验步骤见 [docs/benchmarks/evidence/2026-10-19/README.md](../../docs/benchmarks/evidence/2026-10-19/README.md)。仓库内回归测试复算已归档的 30 对结果，并校验 ZIP 哈希；CI 不调用真实接口。

## 在 Windows CMD 中复现

需要项目既有 Bun 依赖、可用的 Longbridge CLI 和其已有授权。不要把授权文件或令牌放进报告。

```cmd
cd /d D:\folio\Trail
bun run scripts/bench/research-fetch.ts --preflight --cooldown-ms 0 --out artifacts/research-fetch-preflight-new
bun run scripts/bench/research-fetch.ts --repeats 10 --cooldown-ms 2000 --out artifacts/research-fetch-live-new
bun run scripts/bench/audit-research-fetch.ts artifacts/research-fetch-live-new
bun run scripts/bench/verify-research-citations.ts artifacts/research-fetch-correctness-new
bun test ./scripts/bench/audit-research-fetch.test.ts
bun node_modules/typescript/bin/tsc --project scripts/bench/tsconfig.json
```

每次都使用新的输出目录。脚本拒绝覆盖已有 manifest；正确性脚本拒绝覆盖已有目录。不要同时运行两个联网测量进程；在计时结束后运行审计、正确性验证及测试。

## 口径

- 主指标：`fetching` 状态回调到 `synthesizing` 状态回调的单调时钟差，单位毫秒。
- 对照：同一 Runner、同一策略、同一输入、同一 Executor。串行组只在注入 Executor 前增加 FIFO 闸门，每次允许一个真实能力调用；现有 worker 组保持生产代码最多 4 路并发。对照不是历史版本。
- 正式任务：AAPL 价值分析（4 项）、NVDA 风险复核（4 项）、MSFT 成长分析（3 项）。每任务先预热一对，再正式测 10 对，合计 60 次正式运行、220 次正式能力调用。
- 正式测量轮换任务顺序，并平衡每对的串行/并发先后顺序。每次运行后等待 2 秒；此等待不计入耗时。
- 无模拟数据、人工延迟、应用缓存、自动重试、数据源切换。远端服务和 CLI 自身缓存状态不可控；不能声称彻底排除缓存影响。
- 哈希、语义校验和快照写盘发生在计时结束之后。时间戳和轻量轨迹收集仍有开销。
- 使用本地确定性 Synthesizer 完成后续流程，模型调用次数为零。报告质量、完整用户等待时间、UI、崩溃恢复写盘均不在指标内。
- 全部原始尝试保留。只有两组均成功且数据/证据校验通过的完整配对才能进入性能比较。报告必须同时给出全部失败数和有效配对分母。
- 若预检失败或任务不具备数据，不得为了获得好看的结果修改生产代码、弱化校验或默默更换任务。本次 2026-10-19 的综合预检有两项失败，范围收窄记录在 manifest 和报告中。

## 输出

- `manifest.json`：版本、环境、固定任务、计时定义和源码哈希。
- `source-snapshot/`：与 manifest 哈希对应的关键源码副本。审计必须使用测量时版本；后续脚本更新不改变已有证据。
- `trials.jsonl`：逐次运行、每项能力轨迹、数据哈希、成功/失败、证据校验结果。
- `payloads/`：真实公开数据的规范化快照，按 SHA-256 去重，无账户数据。
- `summary.json`：测量脚本生成的汇总。
- `audit.json`、`pairs.csv`：独立复算、较严格的数据内容校验、实际重叠并发检查及配对结果。
- 正确性目录下的三个任务 JSON：额外实时取数的原始能力记录、综合输入、完整报告、证据引用映射；不混入性能样本。

分位区间使用固定任务内的配对 bootstrap，10,000 次、随机种子 20261019。该区间仅描述本次会话的抽样波动，不能覆盖不同网络、机器、数据源或任务下的差异。

本基准不是默认 CI 或发布门禁，也不会提交、推送或修改桌面应用设置。
