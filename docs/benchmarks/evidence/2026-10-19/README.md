# 2026-10-19 Trail 真实接口性能证据

本目录固定保存这次测量的可核验结果。测试基线为 `324dc4ed958f73a0637a68e2e3d2334a6d7d1ba9`；新增的基准脚本及文档当时尚未提交，测量实际使用的版本另存于 ZIP 内的 `source-snapshot/`，以 manifest 哈希核对。

## 结果与范围

3 个固定任务、30 对测试，60 次正式运行，另有 6 次预热。正式 220 次能力调用成功，30 对完整规范化数据哈希一致。

两组数据获取中位耗时：4540.24945 ms → 1344.13440 ms，降低 70.395142%（约 70.4%）。这是同一 Runner 的串行执行对照与现有最多 4 路并发的比较，不是历史发布前后效果，不包含真实模型综合或 UI。

| 文件 | 内容 |
|---|---|
| [manifest.json](manifest.json) | 协议、环境、基线 SHA 和计时源码哈希 |
| [trials.jsonl](trials.jsonl) | 66 次含预热运行的原始轨迹、数据哈希及校验标记 |
| [pairs.csv](pairs.csv) | 30 对串行/并发原始耗时 |
| [summary.json](summary.json) | 实验脚本汇总 |
| [audit.json](audit.json) | 独立复算、内容及并发校验 |
| [preflight-trials.jsonl](preflight-trials.jsonl) | 综合策略预检，14/16 成功，两项失败完整保留 |
| [correctness-checks.json](correctness-checks.json) | 额外 3 次实时正确性验证，11 条引用映射通过 |
| [validation.json](validation.json) | 测量阶段本地定向检查记录，34 项测试通过 |
| [Trail-20261019-evidence.zip](Trail-20261019-evidence.zip) | 完整原始证据包：公开数据快照、逐文件清单、源码副本、验证日志和完整正确性报告 |

ZIP SHA-256：`911cad12785451b02016d7c9d4adaf3f44471a421702b6ccd42c74ee5e2ae437`。

ZIP 保留原始测量后的历史说明。其内文档、脚本不是 PR 后续更新版本；仓库中的当前文档增加了持久证据入口，当前脚本增加了源码快照保存、失败退出码及归档结果回归测试。原始测量数据没有被重写。

## Windows PowerShell 离线核验

从仓库根目录执行，不需要网络、Longbridge 授权或模型：

```powershell
Get-FileHash -LiteralPath 'docs/benchmarks/evidence/2026-10-19/Trail-20261019-evidence.zip' -Algorithm SHA256
# 将解压目录名改为一个不存在的新目录，保留原始证据。
Expand-Archive -LiteralPath 'docs/benchmarks/evidence/2026-10-19/Trail-20261019-evidence.zip' -DestinationPath 'artifacts/evidence-offline-check'
bun run scripts/bench/audit-research-fetch.ts artifacts/evidence-offline-check/artifacts/research-fetch-live-20261019
bun test ./scripts/bench/audit-research-fetch.test.ts
```

期望离线审计 `errors: []`、`payloadFailures: []`、`eligiblePairs: 30`，并复算相同中位数与比例。审计重写解压副本的 `audit.json` 时间戳，不改 ZIP。包内 `SHA256SUMS.json` 可用于逐文件检查，交付前已验证 60 个文件哈希。

新一轮真实接口复测命令见 [scripts/bench/README.md](../../../../scripts/bench/README.md)。新值可以随环境而变化，不要求再次恰好得到 70.4%。
