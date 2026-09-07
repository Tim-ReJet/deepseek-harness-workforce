---
description: "为 Workforce Session 提供持久化的 WorkOrder 绑定，供用户与维护者选择、配置或调试 workforce/workorder-bound SessionEvent 及其 workforceSessionBinding 投影。"
kind: "package-reference"
---

# @deepseek-ai/dsh-workforce-session-events

[English](README.md) | 中文

## 概述

`dsh-workforce-session-events` 将某个 Session 绑定到哪一个规范 WorkOrder（`biro.workorder/v2`，来自 `@reactorjet/workforce-contracts`）记录为一个持久化的 `workforce/workorder-bound` SessionEvent，并将其折叠为一个通过 `ctx.sessionProjections` 提供的 `workforceSessionBinding` 读取投影。当某个 WorkOrder 应该开始约束一个 Session 时，调用一次 `bindWorkOrder(session, candidate)`：它会对照规范 schema 校验候选值,并追加绑定事件,否则在提交任何内容之前抛出异常。本包从不修改或复制 WorkOrder 的目标、范围或验收状态——日志中只流转一个引用（id、digest）以及已解析的执行 profile 版本。将其挂载在 `workforce-global` 启动的任何位置；它是 plan 04 "WorkOrder binding as durable SessionEvent" 这一行,范围限定于绑定事实本身。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在任何 Session 需要持久化记录约束它的 WorkOrder 的地方挂载本包，然后在为该 Session 解析出 WorkOrder 的代码中调用 `bindWorkOrder`。

### 何时选择它

为任何有 WorkOrder 约束的 Workforce Session 选择它——目前是 `workforce-global` profile 的 WorkOrder 控制 Session。对没有 WorkOrder 概念的 Session（普通的 `headless`/`sdk` 运行）跳过它。它只记录绑定事实本身；ActionIntent/EffectReceipt SessionEvent、ValidationSpec 投影与 Cell 生命周期是叠加在其上的独立包，等待各自的契约落地后再引入。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-session-projection'
- name: '@deepseek-ai/dsh-workforce-session-events'
```

本包不接受任何配置：它无条件注册 `workforceSessionBinding` 投影，并要求 `ctx.sessionProjections`（若缺失,会按该接口自身的约定在加载时明确失败）。

### 入口点

```ts
import type { Session } from '@deepseek-ai/dsh-session'
import { bindWorkOrder } from '@deepseek-ai/dsh-workforce-session-events'

declare const session: Session
declare const candidateWorkOrder: unknown

const event = bindWorkOrder(session, candidateWorkOrder)
// event.data: { workOrderId, workOrderDigest, profileVersion, boundAt }
```

`candidateWorkOrder` 在追加任何内容之前会先对照规范的 `workOrder` schema（`@reactorjet/workforce-contracts`）进行解析——校验失败的候选值会抛出异常，Session 的 `seq` 保持不变。通过投影接口读回当前绑定：

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-workforce-session-events'

declare const ctx: Context
declare const session: Session

const binding = ctx.sessionProjections.stateOf(session, 'workforceSessionBinding')?.current
// { workOrderId, workOrderDigest, profileVersion, boundAt } | null
```

对同一个或不同 WorkOrder 的第二次 `bindWorkOrder` 调用会像任何其他追加一样被接受：session 日志自身严格递增的 `seq` 为两个事件排序，投影按最后写入者获胜的方式折叠——没有单独的重新绑定仪式。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

payload 是一个整体值信封，从不是增量：`{ workOrderId, workOrderDigest, profileVersion, boundAt }`。`workOrderId`/`workOrderDigest` 的类型来自导入的 `WorkOrder` 契约类型，而非重新声明（`AGENT_EXECUTION_PROTOCOL.md` §3）。`profileVersion` 是一个稳定的字符串——当 WorkOrder 携带 `workforce.execution-profile` 绑定扩展时为 `"<profileId>@<profileVersion>"`（`readProfileBindingExtension`，`@reactorjet/workforce-contracts`），否则在尚无绑定之前为字面量 `"unresolved"`。折叠是严格的解码替换：每个事件都已携带完整的绑定后状态（session-projection 接口自身的整体值事件规则），因此 `apply` 从不需要先前状态的内容。

未发布运行时不变量伴生插件（No runtime invariant companion is published），因为本包没有需要检查的分歧观察：`bindWorkOrder` 是唯一追加此事件的代码路径，它与投影折叠各自独立运行同一个严格解码器（`decodeWorkOrderBoundPayload`)——一个由注册表驱动的第二观察者只会重新检查折叠在每次读取时已经检查过的同一关系（`packages/AGENTS.md` "Publish `./invariant` only for diverging observations"）。

### 源码映射

| 文件 | 作用 |
|---|---|
| [`src/types.ts`](src/types.ts) | 纯 payload/读模型类型（`WorkforceWorkOrderBoundEvent`、`WorkforceSessionBinding`），不带宿主侧依赖 |
| [`src/domain.ts`](src/domain.ts) | `SessionEventMap`/`SessionProjectionStateMap`/`SessionProjectionMap` 的声明合并扩展、严格解码器、`formatProfileVersion`，以及投影定义 |
| [`src/index.ts`](src/index.ts) | `bindWorkOrder`，以及注册投影的 `apply(ctx)` Cordis 函数插件 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [`dsh-goal`](../../goal/goal/README.zh.md) —— 本包遵循的结构模板：一个持久化领域事件加上它的 session-projection 折叠。
- [`dsh-session-projection`](../../session/session-projection/README.zh.md) —— 本包注册所依附的 `ctx.sessionProjections` 接口。
- [`dsh-workforce-global`](../../bundle/workforce-global/README.zh.md) —— 挂载本包的 bundle。
- [`@reactorjet/workforce-contracts`](../../../../workforce-platform/packages/contracts) —— 本包消费、从不重新声明的规范 `biro.workorder/v2` schema。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包只追加一个持久化日志事件并折叠一个宿主侧投影——没有自己的提示词、工具 schema 或其他模型可见的表层。未来的消费者若要将已绑定 WorkOrder 的目标或上下文渲染进模型请求，必须通过这个 SessionEventMap 成员进行（`docs/architecture.md:112`，"model-visible means logged"），而不能走旁路。

#### KV Cache 影响

无：本包不添加任何请求期内容，因此对前缀复用没有影响。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **没有修改或验收状态权限。** 本包只记录一个 WorkOrder 引用（id、digest、已解析的 profile 版本）；它无法解析、签署或扩大任何 WorkOrder、许可证或验收状态，也永远不会——WorkOrder 由 Biro 签发，Workforce/DSH 从不修改它。
- **ActionIntent/EffectReceipt、ValidationSpec 投影与 Cell 生命周期不在范围内。** 这些 plan 04 原生扩展依赖尚未在任何地方落地的契约形状（BRIDGE-001/CELL-002）；本包只覆盖绑定事实本身。
- **没有自己的 Postgres 持久化。** 本包在任何当前生效的 `SessionPersistence` provider（目前是 JSONL）之上折叠该事件；基于 Postgres 的 WorkOrder 控制投影是一个单独的、读取本事件折叠输出的后续任务（DUR-002）。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景——点击展开</summary>

无。

</details>
