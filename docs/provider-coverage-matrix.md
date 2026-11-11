# 能力与 Provider 覆盖矩阵（Capability & Provider Coverage Matrix）

> **最后更新日期：** 2026-11-10  
> **验证环境：** Linux x64 (Ubuntu 24.04) · Bun `1.3.9` · Node.js `22.x` · TypeScript `5.x`  
> **关联里程碑：** [M1 · Durable Personal Core](https://github.com/ydflow/Trail/milestone/1) · 总路线 [#8](https://github.com/ydflow/Trail/issues/8) · 当前能力 [#9](https://github.com/ydflow/Trail/issues/9) · 本矩阵验收 [#36](https://github.com/ydflow/Trail/issues/36)

本文档集中展示 Trail（研迹）当前各数据/研究/恢复/评测能力的**真实实现、桌面端接线状态（区分 `@finagent/shared` 库能力与 `apps/electron` 实际启用项）、凭证/来源约束与可复验自动化证据**，明确区分 **Mock / 单元测试证据**、**Headless / CLI 进程级证据**、**Electron 桌面主进程接线证据** 与 **已归档打包应用证据**，不为未测、桌面未启用或规划中能力打无条件通过标记。

---

## 1. 证据分级定义（Evidence Tiers）

| 证据标识 | 含义 | 说明 |
|---|---|---|
| `[Unit / Mock]` | 纯函数或注入 Mock（Fake CLI / Mock `fetch` / Fake Provider）的确定性单测通过 | 无需外部 API Key 或实盘账户即可本地复验；仅证明所测适配器/路由单元逻辑 |
| `[Headless / CLI]` | 命令行 / Bun / Node 进程级无界面运行验证 | 必须指向真实进程级脚本或集成记录（如 `bun scripts/eval/run.ts --smoke`）；仅含 Mock 单测的适配器不标注此级 |
| `[Desktop Main]` | Electron 主进程 / IPC / 本地持久化服务已实际接线启用 | 以 [`apps/electron/src/main/kernelHost.ts`](../apps/electron/src/main/kernelHost.ts) 实际构造与注入参数为准 |
| `[Packaged App]` | 已归档安装包/便携包实机或 E2E 验收记录 | 必须链接具体构建版本/SHA、平台、执行步骤与归档产物；无记录项一律标为 `待补打包级复验` |
| `[Planned]` | 路线图规划中（尚未接线或尚未按验收标准交付） | 链接至 [`docs/ROADMAP.zh-CN.md`](./ROADMAP.zh-CN.md) |

---

## 2. Provider 与路由层总体接线与约束概览

> **关键区分（库已实现 vs 桌面主进程实际启用）：**  
> 在桌面主进程 [`apps/electron/src/main/kernelHost.ts`](../apps/electron/src/main/kernelHost.ts)（`#L330-L344`）中，`this.providerRouter = new ProviderRouter({ resolveRouting, isEnabled })` **仅传入了 `resolveRouting` 与 `isEnabled`**，当前**未传入** `retry`、`breaker`、`cache` 构造参数。根据 [`packages/shared/src/providers/router.ts`](../packages/shared/src/providers/router.ts)（`#L124-L137`），重试、熔断与 Router 网关缓存在构造器中均为显式可选（opt-in）：未配置 `retry` 时强制单次尝试（`maxAttempts = 1`），未配置 `breaker` / `cache` 时不启用 `CircuitBreakerRegistry` 与网关级 `TypedProviderCache`。桌面端当前默认生效的响应缓存仅限 `MassiveFinancialDataProvider` 适配器内部自带的 `TtlCache`。

| 模块 / Provider ID | 类型 | 市场覆盖 | 认证与凭证约束 | 实时性 / 配额 / 缓存约束 | 核心源码与桌面接线入口 | 测试用例入口 | 当前状态（区分库与桌面启用） |
|---|---|---|---|---|---|---|---|
| `longbridge` (`LongbridgeFinancialDataProvider`) | `FinancialDataProvider`（16 项行情/财务/新闻能力） | `HK` / `US` / `CN` (`SH`/`SZ`) / `SG` | 依赖本机 `@finagent/longbridge-tools` CLI 与长桥登录态（[`docs/longbridge-auth.zh-CN.md`](./longbridge-auth.zh-CN.md)） | 取决于长桥账户行情权限等级（`parseQuoteLevel`）；错误经 `toProviderError` 脱敏，不泄露原始 CLI 输出 | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts)<br>[`longbridge/health.ts`](../packages/shared/src/providers/longbridge/health.ts)<br>桌面接线：[`kernelHost.ts`](../apps/electron/src/main/kernelHost.ts) | 适配器与健康探测：[`longbridge/longbridge.test.ts`](../packages/shared/src/providers/longbridge/longbridge.test.ts)<br>CLI 参数与解析：[`longbridge-tools.test.ts`](../packages/longbridge-tools/src/longbridge-tools.test.ts) | ✅ 库已实现并在桌面主进程注册为主源 `[Unit / Mock]` `[Desktop Main]` |
| `longbridge-broker` (`LongbridgeBrokerAccountProvider`) | `BrokerAccountProvider`（4 项只读账户/持仓能力） | 同长桥证券账户 | 需长桥账户授权 `account-data` 作用域；未连接返回 `AUTH_EXPIRED`，缺作用域返回权限受限 | 严格只读（汇总/持仓/资产/资金流水），**不支持下单或交易** | [`longbridge/broker.ts`](../packages/shared/src/providers/longbridge/broker.ts)<br>[`coverage.ts`](../packages/shared/src/providers/coverage.ts)<br>桌面接线：[`kernelHost.ts`](../apps/electron/src/main/kernelHost.ts) | [`longbridge/longbridge.test.ts`](../packages/shared/src/providers/longbridge/longbridge.test.ts) | ✅ 库已实现并在桌面主进程注册为只读账户源 `[Unit / Mock]` `[Desktop Main]` |
| `massive` (`MassiveFinancialDataProvider` / Polygon.io) | `FinancialDataProvider`（3 项美股基础能力） | **仅 `US`**（非美股标的由适配器返回 `UNSUPPORTED_CAPABILITY`） | BYOK API Key（桌面端由系统凭据库注入；优先 `apiKey` Query，401 自动回退 `Bearer` Header，见 [`docs/provider-b-decision.zh-CN.md`](./provider-b-decision.zh-CN.md)） | 免费 Stocks Basic 档为日终延时数据（标记 `delayed: true`），限流 5 次/分钟；适配器内部默认启用独立 [`TtlCache`](../packages/shared/src/providers/massive/cache.ts) | [`massive/adapter.ts`](../packages/shared/src/providers/massive/adapter.ts)<br>桌面接线：[`kernelHost.ts`](../apps/electron/src/main/kernelHost.ts) | [`massive/massive.test.ts`](../packages/shared/src/providers/massive/massive.test.ts)<br>跨源对账：[`reconciliation.test.ts`](../packages/shared/src/providers/reconciliation.test.ts) | ✅ 库已实现并在桌面主进程注册为备选源 `[Unit / Mock]` `[Desktop Main]` |
| `Massive` 适配器内置 `TtlCache` | 适配器私有内存缓存（非 Router 网关缓存） | 仅作用于 `massive` 已成功解析的 `US` 请求 | 无额外凭证 | 默认 `ttlMs = 300_000`（5 分钟）、`maxEntries = 50`（FIFO 淘汰）；用于压低 Polygon 免费档 5 次/分钟调用配额 | [`massive/cache.ts`](../packages/shared/src/providers/massive/cache.ts)<br>[`massive/adapter.ts`](../packages/shared/src/providers/massive/adapter.ts)（构造默认实例化） | [`massive/massive.test.ts`](../packages/shared/src/providers/massive/massive.test.ts)（命中免 `fetch` 与过期重拉用例） | ✅ **桌面主进程已默认启用**（随 `new MassiveFinancialDataProvider` 生效）`[Unit / Mock]` `[Desktop Main]` |
| `ProviderRouter` 核心路由与主备降级 | 按 capability 过滤候选链、超时与主备切换 | 按各已注册 Provider 的 `supports(provider, capabilityId)` 构建调用链 | 遵循 `isEnabled(providerId)` 门控与 `resolveRouting()` 主备顺序 | 候选源返回任意非 `ABORTED` 错误时记录 `failoverTrail` 并尝试下一候选；仅 `ABORTED` 立即终止本轮链路 | [`router.ts`](../packages/shared/src/providers/router.ts)（`execute` `#L188`）<br>桌面接线：[`kernelHost.ts`](../apps/electron/src/main/kernelHost.ts)（`#L330-L351`） | 契约与 Fake 路由：[`providers.test.ts`](../packages/shared/src/providers/providers.test.ts)<br>标的绑定：[`instrument.test.ts`](../packages/shared/src/providers/instrument.test.ts) | ✅ **桌面主进程已启用** `resolveRouting` + `isEnabled` + 单次尝试主备降级 `[Unit / Mock]` `[Desktop Main]` |
| `Resilience` 可选增强（`runWithRetry` / `CircuitBreakerRegistry` / 网关 `TypedProviderCache`） | 指数退避重试、连续故障熔断、按 `classifyCapability` 分级 TTL + Stale 兜底网关缓存 | 作用于显式注入对应选项的 `ProviderRouter` 实例 | 需在 `new ProviderRouter({ retry, breaker, cache })` 中显式传参开启 | 未传 `retry` 时 `maxAttempts = 1`；未传 `breaker` / `cache` 时不创建熔断器与网关缓存 | 库实现：[`router.ts`](../packages/shared/src/providers/router.ts)（`#L124-L137`）、[`resilience.ts`](../packages/shared/src/providers/resilience.ts)<br>桌面接线入口：[`kernelHost.ts`](../apps/electron/src/main/kernelHost.ts)（`#L330-L334`） | [`resilience.test.ts`](../packages/shared/src/providers/resilience.test.ts) | ⚠️ **库已实现且单测通过 `[Unit / Mock]`；桌面主进程当前未启用**（`kernelHost.ts` 未传 `retry` / `breaker` / `cache`） |

---

## 3. 按场景与 Capability ID 的细粒度覆盖矩阵

### 3.1 行情数据（Market Data）

| Capability ID | 场景说明 | `longbridge` 支持 | `massive` (Polygon) 支持 | 路由与缓存说明（区分库能力与桌面现状） | 源码与实现位置 | 测试证据与已知限制 |
|---|---|---|---|---|---|---|
| `market.quote` | 实时/延时报价快照 | ✅ `HK`/`US`/`CN`/`SG` (`getQuote` → CLI `quote`) | ✅ 仅 `US`（`delayed: true`） | 桌面端已启用 `longbridge → massive` 单次尝试降级与 `massive` 内部 5 分钟 `TtlCache`；Router 网关级 `quote` TTL 缓存（`TypedProviderCache`）需显式配置 `options.cache` 才生效（桌面 `kernelHost.ts` 当前未启用） | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts)<br>[`massive/adapter.ts`](../packages/shared/src/providers/massive/adapter.ts) | `[Unit / Mock]` 适配器：[`longbridge/longbridge.test.ts`](../packages/shared/src/providers/longbridge/longbridge.test.ts)、[`massive/massive.test.ts`](../packages/shared/src/providers/massive/massive.test.ts)；路由/对账：[`providers.test.ts`](../packages/shared/src/providers/providers.test.ts)、[`reconciliation.test.ts`](../packages/shared/src/providers/reconciliation.test.ts)。限制：`massive` 对非 `US` 标的在适配器内直接返回 `UNSUPPORTED_CAPABILITY`（不发上游 HTTP 请求）。 |
| `market.kline` | 历史 K 线（日/周/月/分钟） | ✅ `HK`/`US`/`CN`/`SG` (`getKline` → CLI `kline`) | ✅ 仅 `US` 日线聚合 (`v2/aggs`) | 桌面端经 `createRouterFetchers` 绑定 `Instrument` 并由适配器内 `stampProviderResult` 补 `instrumentId`；`massive` 自带 `TtlCache` 默认生效，Router 网关级 `kline` TTL 缓存需显式传 `options.cache`（桌面当前未启用） | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts)<br>[`massive/adapter.ts`](../packages/shared/src/providers/massive/adapter.ts)<br>[`instrument.ts`](../packages/shared/src/providers/instrument.ts) | `[Unit / Mock]` [`longbridge/longbridge.test.ts`](../packages/shared/src/providers/longbridge/longbridge.test.ts)、[`massive/massive.test.ts`](../packages/shared/src/providers/massive/massive.test.ts)、[`instrument.test.ts`](../packages/shared/src/providers/instrument.test.ts)。限制：`massive` 免费层仅保证日终 K 线。 |
| `market.intraday` | 分时走势数据 | ✅ (`getIntraday` → CLI `intraday`) | ❌ 不支持 | `supports` 过滤后仅路由至 `longbridge` | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`longbridge/longbridge.test.ts`](../packages/shared/src/providers/longbridge/longbridge.test.ts) |
| `market.depth` | 买卖盘口深度 | ✅ (`getDepth` → CLI `depth`) | ❌ 不支持 | `supports` 过滤后仅路由至 `longbridge` | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`longbridge/longbridge.test.ts`](../packages/shared/src/providers/longbridge/longbridge.test.ts)。限制：实盘调用需长桥对应市场深度行情权限。 |
| `market.trades` | 逐笔成交明细 | ✅ (`getTrades` → CLI `trades`) | ❌ 不支持 | `supports` 过滤后仅路由至 `longbridge` | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`longbridge/longbridge.test.ts`](../packages/shared/src/providers/longbridge/longbridge.test.ts) |
| `market.capitalFlow` | 资金流向分布 | ✅ (`getCapitalFlow` → CLI `capital`) | ❌ 不支持 | `supports` 过滤后仅路由至 `longbridge` | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`longbridge/longbridge.test.ts`](../packages/shared/src/providers/longbridge/longbridge.test.ts) |
| `market.sentiment` | 市场温度/情绪指标 | ✅ (`getMarketTemperature` → CLI `market-temp`) | ❌ 不支持 | `supports` 过滤后仅路由至 `longbridge` | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`longbridge/longbridge.test.ts`](../packages/shared/src/providers/longbridge/longbridge.test.ts) |
| `market.status` | 各市场交易时段状态 | ✅ (`getMarketStatus` → CLI `market-status`) | ❌ 不支持 | `supports` 过滤后仅路由至 `longbridge` | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`longbridge/longbridge.test.ts`](../packages/shared/src/providers/longbridge/longbridge.test.ts) |

### 3.2 公司与财务基本面（Company & Financials）

| Capability ID | 场景说明 | `longbridge` 支持 | `massive` (Polygon) 支持 | 源码与实现位置 | 测试证据与已知限制 |
|---|---|---|---|---|---|
| `company.profile` | 公司静态档案与基本资料 | ✅ (`getStaticInfo` → CLI `static`) | ✅ 仅 `US` (`v3/reference/tickers`) | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts)<br>[`massive/adapter.ts`](../packages/shared/src/providers/massive/adapter.ts) | `[Unit / Mock]` [`longbridge/longbridge.test.ts`](../packages/shared/src/providers/longbridge/longbridge.test.ts)、[`massive/massive.test.ts`](../packages/shared/src/providers/massive/massive.test.ts)、[`instrument.test.ts`](../packages/shared/src/providers/instrument.test.ts) |
| `company.valuation` | 估值与计算指标（PE/PB/市值等） | ✅ (`getCalcIndex` → CLI `calc-index`) | ❌ 不支持 | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`longbridge/longbridge.test.ts`](../packages/shared/src/providers/longbridge/longbridge.test.ts) |
| `company.financials` | 财务报表（利润表/资产负债表/现金流） | ✅ (`getFinancialReport` → CLI `financial-report`) | ❌ 不支持 | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`longbridge/longbridge.test.ts`](../packages/shared/src/providers/longbridge/longbridge.test.ts) |
| `company.dividends` | 分红派息历史 | ✅ (`getDividends` → CLI `dividend`) | ❌ 不支持 | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`longbridge/longbridge.test.ts`](../packages/shared/src/providers/longbridge/longbridge.test.ts) |
| `company.earnings` | 一致预期 EPS / 财报预测 | ✅ (`getEpsForecasts` → CLI `forecast-eps`) | ❌ 不支持 | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`longbridge/longbridge.test.ts`](../packages/shared/src/providers/longbridge/longbridge.test.ts) |
| `company.ratings` | 机构评级汇总 | ✅ (`getInstitutionRating` → CLI `institution-rating`) | ❌ 不支持 | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`longbridge/longbridge.test.ts`](../packages/shared/src/providers/longbridge/longbridge.test.ts) |

### 3.3 新闻、事件与只读券商账户（News, Events & Broker Portfolio）

| Capability ID | 场景说明 | 支持 Provider | 源码与实现位置 | 测试证据与已知限制 |
|---|---|---|---|---|
| `research.news` | 标的相关新闻流 | `longbridge` (`getNews` → CLI `news`) | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`longbridge/longbridge.test.ts`](../packages/shared/src/providers/longbridge/longbridge.test.ts)；外部内容进入 Agent 前经过提示词注入防御规则（[`docs/security-prompt-injection.md`](./security-prompt-injection.md)） |
| `research.events` | 财经日历与公司事件 | `longbridge` (`getCalendarEvents` → CLI `finance-calendar`) | [`longbridge/adapter.ts`](../packages/shared/src/providers/longbridge/adapter.ts) | `[Unit / Mock]` [`longbridge/longbridge.test.ts`](../packages/shared/src/providers/longbridge/longbridge.test.ts)；日历查询参数缓存键隔离见 [`resilience.test.ts`](../packages/shared/src/providers/resilience.test.ts) |
| `portfolio.summary`<br>`portfolio.positions`<br>`portfolio.assets`<br>`portfolio.cashFlow` | 只读账户总览、持仓、资产与资金流水 | `longbridge-broker` (`BROKER_CAPABILITY_IDS`) | [`longbridge/broker.ts`](../packages/shared/src/providers/longbridge/broker.ts)<br>[`coverage.ts`](../packages/shared/src/providers/coverage.ts) | `[Unit / Mock]` 适配器与鉴权映射：[`longbridge/longbridge.test.ts`](../packages/shared/src/providers/longbridge/longbridge.test.ts)；Router 对非主备链 Broker 能力的注册表回退路由：[`providers.test.ts`](../packages/shared/src/providers/providers.test.ts)。限制：严格只读，需长桥账户授权。 |

### 3.4 深度研究、断点恢复、工程评测与打包验收（Research, Recovery, Evaluation & Packaging）

| 能力模块 | 实现与接线状态 | 证据等级 | 关键源码、归档记录与文档入口 | 已知限制与边界 |
|---|---|---|---|---|
| **深度研究断点恢复（Checkpoint Recovery）** | `ResearchService` 在主进程将研究状态原子写入 `userData/store/research/checkpoints/<runId>.json`（含 SHA-256 校验）；渲染层重载不新建重复任务；启动时自动将未完成任务置为 `interrupted` 并支持 `resume` / `restart` / `discard` | `[Unit / Mock]`<br>`[Desktop Main]` | 验收报告与归档产物：[`docs/research-recovery.md`](./research-recovery.md)、[`docs/research-recovery-test-report.md`](./research-recovery-test-report.md)、[`docs/acceptance/research-recovery/verification.json`](./acceptance/research-recovery/verification.json) | 已完成步骤的结果（含失败）在恢复时原样复用，不静默重拉；崩溃前已发出的远端请求无法保证精确一次（at-least-once 边界）；Windows 不支持目录级 `fsync`。 |
| **引用核验与提示词注入防御** | 研究结论绑定 `ProviderProvenance` 与证据 Run ID；对外部新闻/网页文本执行注入模式清洗与隔离 | `[Unit / Mock]` | [`docs/plan-citations-and-injection-defense.md`](./plan-citations-and-injection-defense.md)、[`docs/security-prompt-injection.md`](./security-prompt-injection.md)、归档样例 [`docs/evidence/citations-and-source-inspector/copilot-citation-verification.json`](./evidence/citations-and-source-inspector/copilot-citation-verification.json) | 启发式与结构化边界防御，不替代底层模型对齐。 |
| **Agent 工程评测与观测（V7）** | 三层评测体系（Agent Engineering / Financial Research / Investment Outcome），支持确定性 Evaluator 与 Fixture 模式进程级 CLI 烟雾回归 | `[Unit / Mock]`<br>`[Headless / CLI]` | 进程级 CLI 入口：[`scripts/eval/run.ts`](../scripts/eval/run.ts)（`bun run eval:smoke`，实测 15/15 用例 `passRate: 1.00`）<br>工作流与管道退出码单测：[`scripts/eval/workflow.test.ts`](../scripts/eval/workflow.test.ts)、[`scripts/eval/pipefail.test.ts`](../scripts/eval/pipefail.test.ts)<br>规范：[`docs/EVALUATION.md`](./EVALUATION.md)、[`docs/EVALUATION-CI.md`](./EVALUATION-CI.md) | PR 默认仅跑无外部凭证的确定性检查（见 [`.github/workflows/pr.yml`](../.github/workflows/pr.yml)）；Live 模型评测需显式配置模型与 Judge。 |
| **Windows x64 打包应用已归档验收项** | 仅覆盖已归档 Windows 发布记录中实际执行的安装/启动/配置继承/包内容审计与指定烟雾链路（门禁规范见 [`docs/release-gates.zh-CN.md`](./release-gates.zh-CN.md)） | `[Packaged App]`（仅限右列归档记录明确覆盖项） | 1. **`v0.4.0-beta.3-windows`**（构建 SHA `560cd5a25deae2ce62df243b1286d9076e704992`，Windows x64）：记录见 [`docs/releases/v0.4.0-beta.3-windows.md`](./releases/v0.4.0-beta.3-windows.md)；执行 `node scripts/package-windows.cjs` 与 `node apps/electron/e2e/assistant-workspace.mjs`，全仓隔离测试 `1853 passed / 8 skipped / 0 failed`，验证 NSIS 静默安装（退出码 0）、`beta.2` 配置继承与会话重命名、全新引导免责声明门控、便携版解压双次启动（本地 CDP）及 ASAR 敏感信息审计；归档产物见 Release [`v0.4.0-beta.3-windows`](https://github.com/ydflow/Trail/releases/tag/v0.4.0-beta.3-windows) 附件 `BUILDINFO.json` 与 `SHA256SUMS.txt`。<br>2. **`v0.4.0-beta.2`**（构建 SHA `09e6e52759f91fff4345de3f90bff81128484003`，Windows x64）：记录见 [`docs/releases/v0.4.0-beta.2-windows.md`](./releases/v0.4.0-beta.2-windows.md)；除安装版/便携版启动外，含自动发现原生 Bun、真实模型中文问答与长桥 `AAPL.US` 公开行情卡片手工实测；归档产物见 Release [`v0.4.0-beta.2`](https://github.com/ydflow/Trail/releases/tag/v0.4.0-beta.2) 附件 `BUILDINFO.json` 与 `SHA256SUMS.txt`。 | **明确未覆盖（标为 `待补打包级复验`）：** `beta.3` 未重测真实模型/长桥实盘账户接线；`Massive` BYOK 打包态实机请求、macOS / Linux / Windows ARM64 安装包、Authenticode 数字签名、自动更新及 `560cd5a2` 之后新增改动的包级回归均属 **`待补打包级复验`**。 |

---

## 4. 本地复验命令与真实结果（无需付费 API 凭证）

任何贡献者均可在无长桥实盘账户、无 Massive API Key 的环境下，通过以下命令逐项复验本矩阵中的契约路由、真实适配器映射/鉴权/错误码、Resilience 组件、标的绑定对账及进程级 CLI 评测：

```bash
# 1. Provider 平台全套单测（同时覆盖 Fake 契约路由 + Longbridge/Massive 真实适配器映射、鉴权与错误处理 + Resilience + 标的绑定与美股对账）
bun test \
  packages/shared/src/providers/providers.test.ts \
  packages/shared/src/providers/longbridge/longbridge.test.ts \
  packages/shared/src/providers/massive/massive.test.ts \
  packages/shared/src/providers/resilience.test.ts \
  packages/shared/src/providers/instrument.test.ts \
  packages/shared/src/providers/reconciliation.test.ts
# 实测结果：145 pass, 0 fail, 531 expect() calls (Ran 145 tests across 6 files)

# 2. Longbridge CLI 参数构造、错误脱敏与状态探测单测
bun test packages/longbridge-tools/src/longbridge-tools.test.ts
# 实测结果：17 pass, 0 fail, 42 expect() calls

# 3. 进程级 Headless / CLI 确定性评测烟雾验证（Fixture 模式，无需模型密钥）
bun run eval:smoke
# 实测结果：trail-agent-v1@1.0.0 running 15 case(s) in fixture mode → passRate: 1.00 (15/15), infraFailed=0
```

> 说明：`providers.test.ts` 内部使用 `FakeFinancialDataProvider` / `FakeBrokerAccountProvider` 验证 `ProviderRouter` 与能力契约；`Longbridge` 与 `Massive` 的命令/REST 映射、OAuth/API Key 鉴权回退、错误脱敏与内部 `TtlCache` 行为分别由 `longbridge/longbridge.test.ts`、`longbridge-tools.test.ts` 与 `massive/massive.test.ts` 验证。

### 源码级可复验数据链路（`market.quote` 调用与降级链路）

- **真实调用入口：** 在已注册 Provider（`router.register(...)`）并配置路由（`router.setRouting({ primary: 'longbridge', fallback: 'massive' })` 或构造器注入 `resolveRouting`）的 `ProviderRouter` 实例上调用 `await router.execute('market.quote', { symbol: 'AAPL.US' })`（[`packages/shared/src/providers/router.ts`](../packages/shared/src/providers/router.ts) `#L188`；桌面主进程在 [`kernelHost.ts`](../apps/electron/src/main/kernelHost.ts) `#L350-L352` 通过 `createRouterFetchers(this.providerRouter, ...)` 封装后供 IPC 与 Agent 工具调用，不存在 `ProviderRouter.fetch()` 方法）。
- **候选链构建与过滤规则：** `router.execute(...)` 按路由优先级（`capabilityRouting` 覆盖 → `resolveRouting()` → 静态 `routing`，再补齐注册表中支持该能力的其余 Provider）生成顺序链，随后仅用 `supports(provider, capabilityId)` 过滤出声明支持该 `CapabilityId` 的候选源，并在循环内依次检查异步 `isEnabled(id)` 与可选熔断器 `breaker.allowRequest()`。**Router 不会调用 `provider.markets()` 或 `provider.status()` 做前置市场或健康度过滤。**
- **正常路径与来源/标的戳记：** 主源 `longbridge` 返回 `{ ok: true, data, provenance }` 时，`provenance.providerId`（`longbridge`）由适配器自身生成；当输入经 `bindProviderInput` 解析出标准 `Instrument` 时，适配器内部调用 [`stampProviderResult`](../packages/shared/src/providers/instrument.ts)（`#L76-L85`）将标准 `instrumentId` 补写到 `data` 与 `provenance` 上。仅当 `new ProviderRouter({ cache })` 显式启用了网关缓存时，Router 才会将成功结果写入 `TypedProviderCache`（桌面 `kernelHost.ts` 当前未传 `cache`，因此桌面端不会写入 `TypedProviderCache`）。
- **降级路径与非美股标的（`00700.HK`）真实行为：** 当排在前面的候选源返回 `{ ok: false, error }` 时，只要错误码**不是 `ABORTED`**（并不局限于可重试错误；未启用 `retry` 时每个候选源执行单次尝试 `attempts = 1`），Router 就会将该步错误记入 `failoverTrail` 并继续调用下一候选适配器：
  - **美股标的（如 `AAPL.US`）：** 若 `longbridge` 失败（如 `TIMEOUT` / `AUTH_EXPIRED` / `RATE_LIMITED`），Router 调用备源 `massive.execute('market.quote', { symbol: 'AAPL.US' })`；`massive` 命中内部 `TtlCache` 或请求 Polygon 快照接口成功后，返回带 `delayed: true`、`provenance.providerId = 'massive'` 且附带主源失败 `failoverTrail` 的结果。
  - **港股等非美股标的（如 `00700.HK`）：** 需严格区分**“Router 调用适配器”**与**“适配器向上游发送 HTTP 请求”**。因 `massive` 声明支持 `market.quote` 且 Router 不按 `markets()` 预过滤，当主源 `longbridge` 返回 `TIMEOUT` 时，Router **仍会调用 `massive.execute('market.quote', { symbol: '00700.HK' })`**（实测 `primaryCalls = 1`、`massiveCalls = 1`）；随后 `MassiveFinancialDataProvider` 在本地市场校验阶段直接拦截非 `US` 标的并返回 `UNSUPPORTED_CAPABILITY`（**向上游发送的 HTTP `fetch` 请求次数为 `0`**），最终 Router 汇总返回 `UNSUPPORTED_CAPABILITY`，且 `error.failoverTrail` 完整记录 `[longbridge:TIMEOUT, massive:UNSUPPORTED_CAPABILITY]`。

---

## 5. 未来规划（Roadmap 链接）

以下能力仍处于规划或待桌面端接线阶段，详见 [`docs/ROADMAP.zh-CN.md`](./ROADMAP.zh-CN.md) 与 [M1 · Durable Personal Core](https://github.com/ydflow/Trail/milestone/1)：

- 在桌面主进程 `kernelHost.ts` 按需接入并调优 `ProviderRouter` 的 `retry` / `breaker` / `TypedProviderCache` 参数及可观测面板
- 更多零配置/公开市场数据源扩展与离线回放快照集完善
- 跨会话长期投资逻辑（Thesis）漂移自动巡检与通知
- 桌面打包态（Windows / macOS）自动化离线回放烟雾测试覆盖面扩展
