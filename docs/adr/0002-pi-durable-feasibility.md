# ADR 0002 · Pi Durable 隔离恢复实验与适配评估

- 日期为 2026-11-11。
- 状态为初步评估完成，建议继续隔离适配实验，生产接入待桌面验收。
- 对应 [#10](https://github.com/ydflow/Trail/issues/10)，后续实体契约见 [#11](https://github.com/ydflow/Trail/issues/11)。

## 评估基线

Trail 基线为 `e695545`。实验固定 npm 发布包 `@earendil-works/pi-durable`、`@earendil-works/pi-ai`、`@earendil-works/chord` 的 `1.5.2` 版本，完整依赖树与 integrity 记录在独立的 `package-lock.json` 中。Pi Durable 包的 integrity 为 `sha512-zDB3anbI/yD0IG+VVY+g5tU+c5XOVqQAFwLkXRMiqZb4p/afWro0voZtLNoRAWcDA2r73kvmH6kKin9Ka8l55g==`。

源码阅读参照上游提交 `6e11a00a01a568ef0ae0df5074acf02fc107c34b`。npm 包元数据未提供 `gitHead`，本次实测对象按发布版本与 integrity 标识。上游 README 将 API 标为实验性，说明发布间可能发生变化。[上游 README](https://github.com/earendil-works/pi/blob/6e11a00a01a568ef0ae0df5074acf02fc107c34b/packages/durable/README.md) · [包定义](https://github.com/earendil-works/pi/blob/6e11a00a01a568ef0ae0df5074acf02fc107c34b/packages/durable/package.json)

## 决策

本轮交付独立 PoC 和状态映射，生产接入暂缓。下一轮通过 `AgentRuntime` 边界试接普通助手的只读任务，并以独立 profile 验收桌面恢复行为。研究任务继续由 `ResearchService` 管理其权威 checkpoint，适配期间保持每个任务只有一个执行与恢复所有者。

实验包位于 `scripts/experiments/pi-durable`，依赖通过该目录的 npm lock 安装。实验的数据目录由 `mkdtemp` 创建，公开样例仅含合成股票符号和数值。

## 兼容性实测

环境为 Windows x64、Bun 1.4.2、Node 24.19.0。上游包声明 Node `>=22.19.0`。

| 运行边界 | 实测对象 | 结果与范围 |
| --- | --- | --- |
| Node 子进程 | Node 24.19.0 | JSONL 持久化、强制终止、跨进程恢复和终态重开通过 |
| Bun 子进程 | Bun 1.4.2 | 同一实验通过，实际加载发布包的 ESM 导出 |
| Electron Node 模式 | Electron 39.8.9 内置 Node 22.22.1，`ELECTRON_RUN_AS_NODE=1` | 同一实验通过，覆盖其 Node 执行环境 |
| Electron 主进程与 renderer | Trail 当前 IPC、事件和窗口生命周期 | 待集成验收 |
| Windows 打包应用 | 安装版、便携版和资源解析 | 待集成验收 |
| macOS、Linux | 文件系统和进程终止差异 | 待验证 |
| 现有 Pi RPC adapter | `PiRuntimeAdapter`、`PiRpcClient` 与 CLI 扩展 | 复用当前实现，相关回归通过；Durable 接口映射为后续工作 |

当前根依赖中的 `@earendil-works/pi-coding-agent` 是 `0.82.1` 本地 vendor 包；`PiRpcClient` 默认启动命令仍为 `bunx @mariozechner/pi-coding-agent --mode rpc`，也支持显式命令和参数。Durable 的 `1.5.2` ESM Harness 使用独立接口，兼容性评估需要覆盖 CLI 协议、扩展注册和模型设置。[vendor 定义](../../.pi/extensions/langsmith/vendor/pi-coding-agent/package.json) · [RPC 启动参数](../../packages/shared/src/agent/pi-rpc-client.ts) · [运行时 adapter](../../packages/shared/src/agent/pi-runtime-adapter.ts)

## 最小恢复实验

`recovery.mjs` 注册一个有两个 phase 的自定义 Durable task。每个 phase 读取一份本地 JSON 合成数据，诊断日志记录每次实际读取的进程 PID。Harness 使用 `openNodeJsonlStorage(..., { fsync: true })`。

1. 第一个进程读取第一份数据，将结果和第二 phase 的 checkpoint 提交到 Durable 存储。
2. 第二 phase 完成读取后暂停。父进程收到明确的 kill-point 事件，对工作进程执行 `SIGKILL` 并等待关闭。
3. 父进程把第一份源文件的数值从 `1` 改为 `999`，再启动新的工作进程。
4. 新进程重开相同存储，校验 conversation 和 task ID，恢复第二 phase。恢复时保存的状态为 `pending`，其中第一步结果仍为 `1`。
5. 最终结果保留第一步已提交的值，第二步完成提交。第三个工作进程再次打开终态任务，结果保持一致。

三个运行环境均得到 `firstReads=1`、`secondReads=2`。第一次的第二步结果尚未提交，因此恢复会重新读取。实验覆盖自定义 task 的状态持久化与恢复，模型请求、注册工具、外部 API、费用预算和动作审批仍需各自的集成验证。

## 状态与身份映射草案

| Trail 当前概念 | Durable 对应概念 | 适配要求 |
| --- | --- | --- |
| `Session.id` 与 `runtimeSessionPath` | Conversation ID 与存储目录 | 显式存储一对一映射，保留现有 Trail ID 和 Pi JSONL 路径用于读取历史 |
| `Run.id`、`AgentRunInput.runId` | 输入 Submission ID、`requestId` 与关联任务 | 同一次请求固定 requestId，并持久化 ID 关联；重试先查询原 submission |
| 一次模型响应及其工具调用 | `pi.generation` 与其 `pi.tool` 子任务 | 明确 Trail run 包含的 turn 范围，保存每个调用与消息的关联 |
| `ToolCall.id`、参数、结果 | Durable 工具任务及结果 entry | 通过能力注册层校验权限、输入与来源，重放读取保存结果 |
| `ResearchCheckpoint.plan/outcomes/inFlight` | 自定义 task checkpoint、子任务与持久结果 | 按研究阶段定义所有者和映射，先提供显式导入流程 |
| `fetching → synthesizing → publishing` | 自定义 task phases | 保存预算、来源、配置指纹和发布身份，恢复时逐项校验 |
| `interrupted/recovering` | 重开后的 pending task 与显式 resume | 由主进程暴露用户可见恢复状态，授权和取消策略需要映射 |
| `completed/partial/failed/cancelled` | terminal outcome 与业务结果 | 保留 `partial`、预算停止与故障原因，避免丢失业务语义 |

当前普通 `RunStatus` 只有 `running/completed/failed/cancelled`，研究 checkpoint 另有恢复状态。#11 需要先确定统一状态契约，以及等待授权、暂停、失败、取消和重试 attempt 的关系。[核心类型](../../packages/core/src/index.ts) · [SessionManager](../../packages/shared/src/kernel/session-manager.ts) · [RunManager](../../packages/shared/src/kernel/run-manager.ts) · [研究 checkpoint](../../packages/shared/src/research/checkpoint.ts)

## 存储、迁移与退出方案

- 本次实验选择独立 JSONL 目录并启用 fsync，方便在 Bun 和 Node 中运行同一代码。JSONL 会将历史保留在内存中，长期任务的存储选择需另测容量和恢复耗时。SQLite 是后续候选，其适配器和打包行为需按平台验证。
- 每个存储目录由一个主进程持有写权限，renderer 通过 IPC 读取主进程视图。上游说明 JSONL 缺少跨进程写锁，写模式 open 会执行修复操作，旁观进程需要显式只读打开。适配时应沿用并验证 Electron 单实例约束。[上游存储说明](https://github.com/earendil-works/pi/blob/6e11a00a01a568ef0ae0df5074acf02fc107c34b/packages/durable/README.md#storage)
- 首轮接入为新会话使用独立目录，原 Pi JSONL 和研究 checkpoint 保留各自 schema。迁移工具先导出映射与预检结果，再将带来源、预算和身份信息的数据导入新目录，经校验后切换。
- 回退时停止新 Harness 的执行，保留其目录和诊断记录，后续新任务切回当前 adapter。已创建的 Durable 任务需要通过对应版本的工具读取或导出，跨格式继续执行需显式迁移。
- 存储提交与外部动作之间的崩溃窗口需要业务幂等键或人工确认。此次实验以可重读数据验证恢复行为，写操作的重放与取消留给 #13 和 #26 的契约。

## 复验命令与证据

在仓库根目录执行以下命令。npm 使用实验子目录内的 lock 文件。

```powershell
npm ci --prefix scripts/experiments/pi-durable --ignore-scripts --no-audit --no-fund
node --check scripts/experiments/pi-durable/recovery.mjs
node scripts/experiments/pi-durable/recovery.mjs
bun scripts/experiments/pi-durable/recovery.mjs

$env:ELECTRON_RUN_AS_NODE = '1'
& apps/electron/node_modules/electron/dist/electron.exe scripts/experiments/pi-durable/recovery.mjs
Remove-Item Env:ELECTRON_RUN_AS_NODE

bun test --isolate packages/shared/src/kernel/agent-kernel.test.ts packages/shared/src/kernel/run-manager.test.ts packages/shared/src/agent/pi-runtime-adapter.test.ts packages/shared/src/research/hard-kill.test.ts packages/shared/src/research/recovery.test.ts --timeout 20000
bun run typecheck
```

每次 PoC 在临时目录保存 manifest、恢复前 checkpoint、恢复后结果、读取次数和 `verification.json`，结束时打印证据目录。Windows PowerShell 下 Electron 的输出捕获可使用 Node `spawnSync` 并传入 `ELECTRON_RUN_AS_NODE=1`。

本次结果为 Node、Bun、Electron Node 模式各 1 个完整恢复实验通过，相关回归 `50 pass / 0 fail`、`205 expect()`、5 个文件，现有工作区类型检查全部 exit 0。`npm ci` 从 lock 重新安装后，Node 复验通过。脱敏验证记录见 [Node](../benchmarks/evidence/2026-11-11/pi-durable/node.json)、[Bun](../benchmarks/evidence/2026-11-11/pi-durable/bun.json) 和 [Electron Node 模式](../benchmarks/evidence/2026-11-11/pi-durable/electron-node.json)。

## 下一轮验收

- 将上述身份映射落实为 #11 的实体契约和 schema 版本策略。
- 通过 `AgentRuntime` 适配注册工具、模型设置、事件 sequence、取消与预算。
- 使用隔离 profile 对真实 Electron 主进程执行杀进程恢复、重复恢复、配置变更和多实例竞争验证，再执行 Windows 安装版与便携版回归。
- 根据桌面结果决定扩大接入范围，或结束实验并保留现有执行方案。
