## 改动说明

<!-- 简要说明改了什么、为什么改 -->

## 关联 Issue

<!-- 例如：Closes #123 / Related to #123 -->

## 测试报告（正式审核前必填）

<!--
仅写“已测试”“unit tests cover ...”“本地通过”不算测试报告。
请填写真实执行结果；没有测试报告的 PR 不会被批准。
-->

### 环境

- Bun：
- OS：

### 实际执行命令与结果

```text
# 示例
bun test packages/shared/src/foo.test.ts
→ 12 passed / 0 failed

bun run typecheck
→ core/shared/ui/electron 全部 exit 0
```

### 已知失败 / Baseline（如有）

<!--
如果有失败，请说明：
1. 失败项；
2. 是否可在当前 main / origin/main 复现；
3. 为什么与本 PR 无关。
-->

- [ ] 已提供实际测试命令与 pass/fail 结果
- [ ] 已说明测试环境
- [ ] 如果存在已知 baseline / 环境失败，已提供 main 对照或说明
- [ ] 核心改动已有对应 focused test / smoke / integration 验证

## UI 截图（涉及 UI 时必填）

<!--
只要涉及可见 UI、交互、状态展示，或以 UI 测试作为主要验收依据，必须提供截图。
修改已有界面：优先贴 Before / After。
新增 UI：至少贴 After。
纯内部改动：勾选“不涉及 UI”。
-->

- [ ] 本 PR 不涉及 UI 变化
- [ ] 已提供修改后的 UI 截图
- [ ] 已提供 Before / After 对比截图（适用时）

### Before（适用时）

<!-- 拖入截图 -->

### After

<!-- 涉及 UI 时请拖入截图 -->

## Scope / 后续

<!-- 如果只是完成大 Issue 的一个子能力，说明本 PR 边界和未完成项 -->
