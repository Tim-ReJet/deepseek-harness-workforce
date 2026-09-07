---
description: "workforce 组的软件包索引，供用户与维护者了解本组，导航持久化的 Workforce Session 状态。"
kind: "package-group"
---

# packages/workforce

[English](README.md) | 中文

## 概述

workforce 组记录 Workforce 专属的持久化 Session 状态——目前是某个 Session 绑定到哪一个规范 WorkOrder（`biro.workorder/v2`，来自 `@reactorjet/workforce-contracts`）——将其表示为折叠进 `ctx.sessionProjections` 读取模型的 SessionEvent。它从不修改或复制自己所引用的对象，只在既有的 session 日志与 session-projection 子系统之上,记录一个 Session 与它们关系的持久化事实。在任何由 Workforce 约束的 Session 启动之处挂载本组的软件包。

## 目录

- [软件包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 软件包

| 软件包 | 角色 | ctx key |
|---|---|---|
| [`session-events`](session-events/README.zh.md) | 持久化的 `workforce/workorder-bound` SessionEvent 及其 `workforceSessionBinding` 投影 | 注册到 `ctx.sessionProjections` |

-----

<a id="related-documentation"></a>
## 相关文档

- [Session 子系统](../../docs/subsystems/session.zh.md)——本组每个软件包追加事件的持久化日志。
- [Session 投影子系统](../../docs/subsystems/session-projection.zh.md)——本组软件包注册的 `ctx.sessionProjections` 折叠机制。
- [`@reactorjet/workforce-contracts`](../../../workforce-platform/packages/contracts)——本组软件包引用而从不重新声明的规范 WorkOrder 与执行 profile schema。

-----

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
