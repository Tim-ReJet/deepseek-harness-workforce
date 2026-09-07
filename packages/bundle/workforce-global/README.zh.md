---
description: "叠加在 dsh-base 之上的 Workforce 全局 profile 层：目前为空，供组合或启动 workforce-global profile 的用户使用。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-workforce-global

[English](README.md) | 中文

## 概述

`dsh-workforce-global` 是随附的 `workforce-global` profile 的第二个 bundle 层，叠加在 `@deepseek-ai/dsh-base` 之上。它目前为空——一个没有任何自有行的真实、具名、可启动层——因此在任何 Workforce 自有插件存在以填充它之前，`dsh --profile workforce-global` 今天就能组合并启动。随着这些插件陆续落地（从持久化 SessionEvent 扩展包开始），后续 Workforce 任务会把各自的行加入这个 bundle 的 `cordis.patch.yml`。你通常不会直接操作这个 bundle；它不是供导入的库。

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

### 安装到 profile

随附的 `workforce-global` profile 已经组合了本 bundle：运行 `dsh --profile workforce-global "your task"`，两层会在首次使用时自动初始化。要在自定义 profile 中添加或移除它：

```text
dsh plugin --profile <name> add @deepseek-ai/dsh-workforce-global
dsh plugin --profile <name> remove @deepseek-ai/dsh-workforce-global
```

随附 bundle 从 dsh 安装目录解析。如果某个 profile 列出了本 bundle 却没有先列出 `@deepseek-ai/dsh-base`，就没有可叠加的核心服务，会导致启动失败。

### 你会获得什么

目前什么都没有。当前的 patch（`cordis.patch.yml`）是一个空的 insert 列表：`workforce-global` profile 的一切可观察行为都单独来自 `dsh-base`。本 bundle 的存在是为了让该 profile 拥有一个稳定的、具名的第二层，供后续 Workforce 插件叠加自己的行，而不需要每个任务都重新发明这个 profile 本身。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

本 bundle 是一个静态 patch 文档，目前是空的 `[]`。它不挂载任何服务，不发出任何事件，也不持有任何可变状态。随着行的加入，每一行都由其自己的包拥有该行的行为与不变量——本包始终是一个纯粹的组合层载体，与其他随附 bundle 处于相同的信任边界（README 不变量 17：空 bundle 不得使任何假设"每个 bundle 都携带功能性插件"的检查失败）。

### 源码映射

| 文件 | 作用 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | bundle 的实质内容：目前是一个空的 `insert` 列表，保持为空的理由以行内注释给出 |
| [`src/index.ts`](src/index.ts) | 包入口；不携带任何运行时 API |
| — | 未发布运行时不变量伴生文件：本包是一个静态 patch 列表载体，没有需要检查的可变关系。 |
| [`tests/startup.spec.ts`](tests/startup.spec.ts) | 清单/patch 形状检查、通过 `composeEntries` 验证叠加在 `dsh-base` 之上零效果，以及用真实的 Loader/Include 将本 bundle 自己的 patch 文件作为第二层挂载 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [dsh-base bundle](../base/README.zh.md) — 本层叠加其上的共享核心。
- [app-boot profile 章节](../../boot/app-boot/README.zh.md) — profile 如何解析、分层与定制。
- [Bundle 包地图](../README.zh.md) — 建立在共享核心之上的各个表层。

-----

<a id="model-experience"></a>
## 模型体验

无，因为当前 patch 列表为空，不注册任何行。

#### KV Cache 影响

本 bundle 不添加任何请求前缀；它没有任何行可以添加前缀。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **本 bundle 是刻意保持为空，而非遗漏** —— plan 04"Global profile"中描述的 `workforce-global` profile 的持久化 web/SDK/server 表层、`@workforce/*` 与 `@biro/*` 插件以及管理工具，都推迟到创建这些包的 Workforce 任务；在支撑它的包存在之前在此添加 `@workforce/*` 依赖会使整个仓库的 `pnpm install` 失败。
- **没有实时 patch 重新加载** —— `patchReload: 'startup'` 与 `headless` 的姿态一致：持久化 host 默认不需要实时用户 patch 重新加载。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景——点击展开</summary>

无。

</details>
