---
description: "Workforce Cell 工具调用准入：ActionIntent 投影与 dsh-nono-bridge 许可检查，在工具分发前执行。"
kind: "library"
---

# @deepseek-ai/dsh-workforce-tool-admission

[English](README.md) | 中文

## Summary

`dsh-workforce-tool-admission` 在 harness 内实现 plan 16 的同进程半段：每次工具调用投影为 Workforce `ActionIntent`，经 `@workforce/dsh-nono-bridge` 的 **`checkActionIntentWithOwnedPaths` 唯一路径**检查（启用 admission 时必须提供密封 `DelegationPlan` 与 `workerId`，禁止仅 `checkActionIntent` 回退）；桥接返回 `allowed: false` 时在 `tools/pre-execute` 拒绝，不进入工具体。它不直接调用 MCP 或 nono 现场 supervisor，只对照已编译的 `CapabilityManifest` 与密封路径所有权。

## Known Limitations and Deferred Work

- **投影由配置拥有**，尚未从 ToolDefinition 元数据读取；Cell profile 上的工具需扩展投影表。
- **依赖 sibling `workforce-platform` 检出** — 见 [WORKFORCE_PLATFORM.md](../WORKFORCE_PLATFORM.md)（固定 `bbfc56d`）。
