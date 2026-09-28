---
description: "在 ctx.workflowEngine 上实现有界 Cell Task/Gate/Loop 策略，并为 workforce-cell 配置文件提供本地 workforce.evidence-index/v1 导出器。"
kind: "package-reference"
---

# @deepseek-ai/dsh-workforce-execution-cell

[English](README.md) | 中文

## Summary

`dsh-workforce-execution-cell` 在现有 `ctx.workflowEngine` 接缝上实现 plan 09 的有界 Task/Gate/Loop 薄策略层：每个尝试周期一次 workflow 运行、由调用方提供的递归上界（`maxIterations`、`maxChildDepth`、`noProgressThreshold` 以及可选的成本/时间上界），以及本地的 `CellGate` 评估结果——绝不等同于 Workforce 的 `OutcomeAttestation` 裁决。在配置启用时，插件会在 dispose 阶段将未签名的 `workforce.evidence-index/v1` 形 JSON 写入 Cell 工作区，作为未来 Outcome Attestor 的证据输入，而不是签名的 RunManifest 或 attestation。请在 `@deepseek-ai/dsh-workforce-cell` 上与 tool admission 一并挂载。

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

### When to choose it

当 disposable Cell 配置文件需要 plan-09 评估/修复循环、且不需要新的编排引擎时选用本包。Global 宿主 Session（`workforce-global`）或无 Cell 生命周期的运行不需要它。BRIDGE-001、RESULT-001、K8S-002 分别负责签名提交、紧凑 OutcomeAttestation 记录与子 Cell 隔离。

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-workforce-execution-cell'
```

可选的 dispose 时导出：

```yaml
- name: '@deepseek-ai/dsh-workforce-execution-cell'
  config:
    workspaceDir: !!js "process.env.WORKFORCE_CELL_WORKDIR || '.'"
    workOrderId: !!js "process.env.WORKFORCE_CELL_WORK_ORDER_ID"
    runId: !!js "process.env.WORKFORCE_CELL_RUN_ID"
    cellId: !!js "process.env.WORKFORCE_CELL_ID"
    autoExportOnDispose: true
```

### Entry point

```ts
import { runCellLoop, exportEvidenceIndex } from '@deepseek-ai/dsh-workforce-execution-cell'

const result = await runCellLoop({ tasks, config, engine: ctx.workflowEngine, parent: agent, signal })
const draft = exportEvidenceIndex(result, { workOrderId, runId, cellId })
```

`CellLoopResult.stopReason` 仅为循环生命周期词汇；本地 PASS/FAIL/INDETERMINATE 请读 `finalGate.verdict`。

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

| 模块 | 作用 |
| --- | --- |
| `src/types.ts` | 纯 Task/Gate/Loop 与 EvidenceIndex 草稿类型 |
| `src/domain.ts` | Workflow 请求构建、停滞检测、修复任务选择 |
| `src/loop.ts` | `runCellLoop` 有界驱动 |
| `src/evidence-exporter.ts` | `exportEvidenceIndex` 与工作区写入 |
| `src/index.ts` | Cordis 插件（`workforce-execution-cell`） |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [packages/workforce/WORKFORCE_PLATFORM.md](../WORKFORCE_PLATFORM.md) — 同级 `@reactorjet/workforce-contracts` 检出说明
- [packages/workflow/workflow/README.zh.md](../../workflow/workflow/README.zh.md) — workflow 引擎接缝

-----

<a id="model-experience"></a>
## Model Experience

无——循环与导出器均为宿主侧策略；面向模型的 tool/agent 行为仍由组合的 base/headless 插件与已准入工具承担。

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **effects/evaluations/children** 在 ActionIntent/EffectReceipt 与子 attestation 类型落地前导出为空 digestRef 数组（BRIDGE-001 / RESULT-001）。
- **子 Cell 隔离** 不在此包 enforcement——递归限于同一 Cell，直到 K8S-002（或本地等价物）提供独立执行上下文。
- **需要同级 `workforce-platform`** 以解析 `@reactorjet/workforce-contracts` — 见 [WORKFORCE_PLATFORM.md](../WORKFORCE_PLATFORM.md)。

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

CELL-002 工作包：仅在有界循环中使用 `ctx.workflowEngine`；绝不生成 RunManifest 闭包或 OutcomeAttestation 形字段。

</details>
