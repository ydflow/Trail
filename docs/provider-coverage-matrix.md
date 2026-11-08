# 能力与 Provider 覆盖矩阵（Capability & Provider Coverage Matrix）

> **最后更新日期：** 2026-11-08  
> **验证环境：** Linux x64 (Ubuntu 24.04) · Bun `1.4.2` / Node.js `22.x` · TypeScript `5.x`  
> **关联里程碑：** [M1 · Durable Personal Core](https://github.com/ydflow/Trail/milestone/1) · 总路线 [#8](https://github.com/ydflow/Trail/issues/8) · 当前能力 [#9](https://github.com/ydflow/Trail/issues/9) · 本矩阵验收 [#36](https://github.com/ydflow/Trail/issues/36)

本文档集中展示 Trail（研迹）当前各数据/研究/恢复/评测能力的**真实实现、路由接线状态、凭证/来源约束与自动化测试证据**，明确区分 **Mock / 单元测试证据**、**Headless / CLI 证据**、**Electron 桌面主进程证据** 与 **打包应用证据**，不为未测或计划能力打通过标记。

---

## 1. 证据分级定义（Evidence Tiers）

| 证据标识 | 含义 | 说明 |
|---|---|---|
| `[Unit / Mock]` | 纯函数或注入 Mock 的确定性单测通过 | 无需外部 API Key 或实盘账户即可本地复验 |
| `[Headless / CLI]` | 命令行 / Node / Bun 进程级无界面运行验证 | 验证 Provider CLI / SQLite / Checkpoint / Benchmark 脚本 |
| `[Desktop Main]` | Electron 主进程 / IPC / 本地持久化服务已接线 | 涉及 `ResearchService`、`ConnectionStore`、单实例锁等 |
| `[Packaged App]` | Windows x64 安装包/便携包实机手工或 E2E 证据 | 仅在已完成打包验收的链路标注；未单独跑包级 E2E 的标为 `待补打包级复验` |
| `[Planned]` | 路线图规划中（尚未接线或尚未按验收标准交付） | 链接至 [`docs/ROADMAP.zh-CN.md`](./ROADMAP.zh-CN.md) |

---

## 2. Provider 级总体接线与约束概览

| Provider ID | 类型 | 市场覆盖 | 认证与凭证约束 | 实时性 / 配额约束 | 核心源码入口 | 测试用例入口 | 当前状态 |
|---|---|---|---|---|---|---|---|
| `longbridge` (`LongbridgeFinancialDataProvider`) | `FinancialDataProvider`（16 项行情/财务/新闻能力） | `HK` / `US` / `CN` (`SH`/`SZ`) / `SG` | 依赖本机 `@finagent/longbridge-tools` CLI 与长桥登录态（[`docs/longbridge-auth.zh-CN.md`](./longbridge-auth.zh-CN.md)） | 取决于长桥账户行情权限等级（`parseQuoteLevel`）；错误经 `toProviderError` 脱敏 | [`packages/shared/src/providers/longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts)<br>[`packages/shared/src/providers/longbridge/health.ts`](../packages/shared/src/providers/longbridge/health.ts) | [`packages/shared/src/providers/providers.test.ts`](../packages/shared/src/providers/providers.test.ts) | ✅ 已实现并接入 `ProviderRouter` `[Unit / Mock]` `[Headless / CLI]` |
| `longbridge-broker` (`LongbridgeBrokerAccountProvider`) | `BrokerAccountProvider`（4 项只读账户/持仓能力） | 同长桥证券账户 | 需长桥账户授权 `account-data` 作用域；缺失时返回 `PERMISSION_DENIED` | 严格只读（汇总/持仓/资产/资金流水），**不支持下单或交易** | [`packages/shared/src/providers/longbridge/broker.ts`](../packages/shared/src/providers/longbridge/broker.ts)<br>[`packages/shared/src/providers/coverage.ts`](../packages/shared/src/providers/coverage.ts) | [`packages/shared/src/providers/providers.test.ts`](../packages/shared/src/providers/providers.test.ts) | ✅ 已实现只读接入 `[Unit / Mock]` |
| `massive` (`MassiveFinancialDataProvider` / Polygon.io) | `FinancialDataProvider`（3 项美股基础能力） | **仅 `US`**（`HK`/`SH`/`SZ`/`SG`/`HAS` 显式拒绝） | BYOK API Key（由系统凭据库注入；优先 `apiKey` Query，401 自动回退 `Bearer` Header，见 [`docs/provider-b-decision.zh-CN.md`](./provider-b-decision.zh-CN.md)） | 免费 Stocks Basic 档为日终延时数据（强制标记 `delayed: true`），限流 5 次/分钟，内置 `TtlCache` | [`packages/shared/src/providers/massive/adapter.ts`](../packages/shared/src/providers/massive/adapter.ts)<br>[`packages/shared/src/providers/massive/cache.ts`](../packages/shared/src/providers/massive/cache.ts) | [`packages/shared/src/providers/providers.test.ts`](../packages/shared/src/providers/providers.test.ts)<br>[`packages/shared/src/providers/reconciliation.test.ts`](../packages/shared/src/providers/reconciliation.test.ts) | ✅ 已实现作为 V4 Router 备选/美股源 `[Unit / Mock]` |
| `ProviderRouter` + `Resilience` 层 | 路由 / 降级 / 熔断 / 缓存 | 按 `capabilityMapping` 过滤主备链 | 无额外外部凭证；主源可重试故障（`RATE_LIMITED`/`TIMEOUT`/`UNAVAILABLE`）且备源健康时自动 Fallback | 指数退避重试 `runWithRetry` + 熔断器 `CircuitBreakerRegistry` + 分级 `TypedProviderCache` | [`packages/shared/src/providers/router.ts`](../packages/shared/src/providers/router.ts)<br>[`packages/shared/src/providers/resilience.ts`](../packages/shared/src/providers/resilience.ts) | [`packages/shared/src/providers/resilience.test.ts`](../packages/shared/src/providers/resilience.test.ts)<br>[`packages/shared/src/providers/instrument.test.ts`](../packages/shared/src/providers/instrument.test.ts) | ✅ 已实现并全量单测覆盖 `[Unit / Mock]` |

---

## 3. 按场景与 Capability ID 的细粒度覆盖矩阵

### 3.1 行情数据（Market Data）

| Capability ID | 场景说明 | `longbridge` 支持 | `massive` (Polygon) 支持 | 路由/缓存策略 (`classifyCapability`) | 源码与实现位置 | 测试证据与已知限制 |
|---|---|---|---|---|---|---|
| `market.quote` | 实时/延时报价快照 | ✅ `HK`/`US`/`CN`/`SG` (`getQuote`) | ✅ 仅 `US`（`delayed: true`） | `quote` 级短 TTL 缓存；主备可自动降级 | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts)<br>[`massive/adapter.ts`](../packages/shared/src/providers/massive/adapter.ts) | `[Unit / Mock]` [`providers.test.ts`](../packages/shared/src/providers/providers.test.ts)、[`reconciliation.test.ts`](../packages/shared/src/providers/reconciliation.test.ts)。限制：`massive` 非美股后缀直接返回 `UNSUPPORTED_CAPABILITY`。 |
| `market.kline` | 历史 K 线（日/周/月/分钟） | ✅ `HK`/`US`/`CN`/`SG` (`getKline`) | ✅ 仅 `US` 日线聚合 (`v2/aggs`) | `kline` 级 TTL 缓存；`stampInstrumentId` 绑定标的 | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts)<br>[`massive/adapter.ts`](../packages/shared/src/providers/massive/adapter.ts) | `[Unit / Mock]` [`providers.test.ts`](../packages/shared/src/providers/providers.test.ts)。限制：`massive` 免费层仅保证日终 K 线。 |
| `market.intraday` | 分时走势数据 | ✅ (`getIntraday`) | ❌ 不支持 | 仅路由至 `longbridge` | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`providers.test.ts`](../packages/shared/src/providers/providers.test.ts) |
| `market.depth` | 买卖盘口深度 | ✅ (`getDepth`) | ❌ 不支持 | 仅路由至 `longbridge` | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` 需长桥对应市场深度行情权限 |
| `market.trades` | 逐笔成交明细 | ✅ (`getTrades`) | ❌ 不支持 | 仅路由至 `longbridge` | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`providers.test.ts`](../packages/shared/src/providers/providers.test.ts) |
| `market.capitalFlow` | 资金流向分布 | ✅ (`getCapitalFlow`) | ❌ 不支持 | 仅路由至 `longbridge` | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`providers.test.ts`](../packages/shared/src/providers/providers.test.ts) |
| `market.sentiment` | 市场温度/情绪指标 | ✅ (`getMarketTemperature`) | ❌ 不支持 | 仅路由至 `longbridge` | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`providers.test.ts`](../packages/shared/src/providers/providers.test.ts) |
| `market.status` | 各市场交易时段状态 | ✅ (`getMarketStatus`) | ❌ 不支持 | 仅路由至 `longbridge` | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`providers.test.ts`](../packages/shared/src/providers/providers.test.ts) |

### 3.2 公司与财务基本面（Company & Financials）

| Capability ID | 场景说明 | `longbridge` 支持 | `massive` (Polygon) 支持 | 源码与实现位置 | 测试证据与已知限制 |
|---|---|---|---|---|---|
| `company.profile` | 公司静态档案与基本资料 | ✅ (`getStaticInfo`) | ✅ 仅 `US` (`v3/reference/tickers`) | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts)<br>[`massive/adapter.ts`](../packages/shared/src/providers/massive/adapter.ts) | `[Unit / Mock]` [`providers.test.ts`](../packages/shared/src/providers/providers.test.ts)、[`instrument.test.ts`](../packages/shared/src/providers/instrument.test.ts) |
| `company.valuation` | 估值指标（PE/PB/市值等） | ✅ (`getQuote` / `getStaticInfo` 聚合) | ❌ 不支持 | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`providers.test.ts`](../packages/shared/src/providers/providers.test.ts) |
| `company.financials` | 财务报表（利润表/资产负债表/现金流） | ✅ (`getFinancialReport`) | ❌ 不支持 | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`providers.test.ts`](../packages/shared/src/providers/providers.test.ts) |
| `company.dividends` | 分红派息历史 | ✅ (`getDividends`) | ❌ 不支持 | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`providers.test.ts`](../packages/shared/src/providers/providers.test.ts) |
| `company.earnings` | 一致预期 EPS / 财报预测 | ✅ (`getEpsForecasts`) | ❌ 不支持 | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`providers.test.ts`](../packages/shared/src/providers/providers.test.ts) |
| `company.ratings` | 机构评级汇总 | ✅ (`getInstitutionRating`) | ❌ 不支持 | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`providers.test.ts`](../packages/shared/src/providers/providers.test.ts) |

### 3.3 新闻、事件与只读券商账户（News, Events & Broker Portfolio）

| Capability ID | 场景说明 | 支持 Provider | 源码与实现位置 | 测试证据与已知限制 |
|---|---|---|---|---|
| `research.news` | 标的相关新闻流 | `longbridge` (`getNews`) | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`providers.test.ts`](../packages/shared/src/providers/providers.test.ts)；外部内容进入 Agent 前经过提示词注入防御规则（[`docs/security-prompt-injection.md`](./security-prompt-injection.md)） |
| `research.events` | 财经日历与公司事件 | `longbridge` (`getCalendarEvents`) | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`providers.test.ts`](../packages/shared/src/providers/providers.test.ts) |
| `portfolio.summary`<br>`portfolio.positions`<br>`portfolio.assets`<br>`portfolio.cashFlow` | 只读账户总览、持仓、资产与资金流水 | `longbridge-broker` (`BROKER_CAPABILITY_IDS`) | [`longbridge/broker.ts`](../packages/shared/src/providers/longbridge/broker.ts)<br>[`coverage.ts`](../packages/shared/src/providers/coverage.ts) | `[Unit / Mock]` [`providers.test.ts`](../packages/shared/src/providers/providers.test.ts)。限制：严格只读，需长桥账户授权。 |

### 3.4 深度研究、断点恢复与工程评测（Research, Recovery & Evaluation）

| 能力模块 | 实现与接线状态 | 证据等级 | 关键源码与文档入口 | 已知限制与边界 |
|---|---|---|---|---|
| **深度研究断点恢复（Checkpoint Recovery）** | `ResearchService` 在主进程将研究状态原子写入 `userData/store/research/checkpoints/<runId>.json`（含 SHA-256 校验）；渲染层重载不新建重复任务；启动时自动将未完成任务置为 `interrupted` 并支持 `resume` / `restart` / `discard` | `[Unit / Mock]`<br>`[Desktop Main]` | [`docs/research-recovery.md`](./research-recovery.md)<br>[`docs/research-recovery-test-report.md`](./research-recovery-test-report.md) | 已完成步骤的结果（含失败）在恢复时原样复用，不静默重拉；崩溃前已发出的远端请求无法保证精确一次（at-least-once 边界）；Windows 不支持目录级 `fsync`。 |
| **引用核验与提示词注入防御** | 研究结论绑定 `ProviderProvenance` 与证据 Run ID；对外部新闻/网页文本执行注入模式清洗与隔离 | `[Unit / Mock]` | [`docs/plan-citations-and-injection-defense.md`](./plan-citations-and-injection-defense.md)<br>[`docs/security-prompt-injection.md`](./security-prompt-injection.md) | 启发式与结构化边界防御，不替代底层模型对齐。 |
| **Agent 工程评测与 LangSmith 观测（V7）** | 三层评测体系（Agent Engineering / Financial Research / Investment Outcome），支持确定性 Evaluator 与离线/在线基准对比 | `[Unit / Mock]`<br>`[Headless / CLI]` | [`docs/EVALUATION.md`](./EVALUATION.md)<br>[`docs/EVALUATION-METHODOLOGY.md`](./EVALUATION-METHODOLOGY.md)<br>[`docs/EVALUATION-CI.md`](./EVALUATION-CI.md) | PR 默认仅跑无外部凭证的确定性检查（见 [`.github/workflows/pr.yml`](../.github/workflows/pr.yml)）；Live Eval 与 Electron E2E 在 Nightly / Release 流程执行。 |
| **打包应用级全链路验证** | Windows x64 安装版与便携版构建门禁说明 | `[Packaged App]`（仅限已归档 Release Gate 项；其余为 `待补打包级复验`） | [`docs/release-gates.zh-CN.md`](./release-gates.zh-CN.md) | 无付费 API 凭证的贡献者不要求运行实盘/付费 API。 |

---

## 4. 本地复验方法（无需付费 API 凭证）

任何贡献者均可在无长桥实盘账户、无 Massive API Key 的环境下，通过以下命令核对本矩阵中的 Provider 路由、主备降级、缓存/熔断及标的对账链路：

```bash
# 1. 运行 Provider 平台核心单测（覆盖 capabilityMapping、Longbridge/Massive 适配器、Router 降级、错误映射）
bun test packages/shared/src/providers/providers.test.ts

# 2. 运行 Resilience 层单测（覆盖故障分类、指数退避重试、熔断器状态机、分级 TTL 缓存）
bun test packages/shared/src/providers/resilience.test.ts

# 3. 运行跨 Provider 标的绑定与美股对账单测
bun test packages/shared/src/providers/instrument.test.ts packages/shared/src/providers/reconciliation.test.ts
```

### 抽查数据链路示例（`market.quote` 主备自动降级链路）

- **链路入口：** `ProviderRouter.fetch('market.quote', { symbol: 'AAPL.US' })`（[`packages/shared/src/providers/router.ts`](../packages/shared/src/providers/router.ts)）
- **映射规则：** `capabilityMapping({ primary: 'longbridge', fallback: 'massive' }, coverage)` 生成有序调用链 `['longbridge', 'massive']`（[`packages/shared/src/providers/coverage.ts`](../packages/shared/src/providers/coverage.ts)）。
- **正常路径：** 主源 `longbridge` 健康且返回数据时，结果由 `stampProviderResult` 注入 `provenance.providerId = 'longbridge'` 并写入 `TypedProviderCache`（`quote` 分类）。
- **降级路径：** 当 `longbridge` 返回可重试错误（如 `RATE_LIMITED` / `TIMEOUT` / `UNAVAILABLE`）且备源 `massive` 健康且支持 `US` 市场时，路由器自动切换至 `massive` 并返回带 `delayed: true` 与 `provenance.providerId = 'massive'` 的结果；若标的为 `00700.HK`，因 `massive` 仅声明 `US` 市场，路由器不向 `massive` 派发无效请求（见 [`providers.test.ts`](../packages/shared/src/providers/providers.test.ts)）。

---

## 5. 未来规划（Roadmap 链接）

以下能力仍处于规划或持续演进阶段，详见 [`docs/ROADMAP.zh-CN.md`](./ROADMAP.zh-CN.md) 与 [M1 · Durable Personal Core](https://github.com/ydflow/Trail/milestone/1)：

- 更多零配置/公开市场数据源扩展与离线回放快照集完善
- 跨会话长期投资逻辑（Thesis）漂移自动巡检与通知
- 桌面打包态（Windows / macOS）自动化离线回放烟雾测试覆盖面扩展
