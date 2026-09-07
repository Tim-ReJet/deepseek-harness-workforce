# Agent Note: An empty `workforce-global` profile and bundle boot before any Workforce plugin exists

Status: implemented

[English](2026-09-07-workforce-global-profile-bundle.md) | 中文

## Problem

Workforce 的全局运行时（平台 plan 04 所描述的持久化、多租户 host）是按一个接一个的小任务逐层搭建的：持久化 SessionEvent 扩展包、provider registry、evidence exporter 等等。这些任务都需要一个真实的、具名的 profile 来叠加自己的 bundle。如果要等到第一个这样的包存在之后才创建 profile，就会迫使那个本不相关的任务同时去发明 profile 与 bundle 的脚手架，而当时 `PROFILE_TEMPLATES` 里既没有 `workforce-global` 条目，也没有 `packages/bundle/workforce-global` 包可以让它添加自己的行。

## Decision

`packages/bundle/workforce-global` 是一个新的 bundle 包，其形态与 `packages/bundle/headless` 的 manifest/tsconfig/README 三件套完全一致：它声明 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，peer 依赖 `@deepseek-ai/cordis` 与 `@deepseek-ai/dsh-base`，不添加任何其他依赖。它的 `cordis.patch.yml` 是一个字面意义上的空 patch 列表（`[]`），与 `packages/bundle/base` 的空 patch 形态一致，并以行内注释说明为何保持为空，同时警告不要在支撑它的包存在之前添加 `@workforce/*` 依赖（无法解析的 workspace 依赖会使整个仓库的 `pnpm install` 失败）。`src/index.ts` 不携带任何运行时 API，与 `dsh-base` 自身的入口模块一致。

`packages/boot/app-boot/src/profile.ts` 中的 `PROFILE_TEMPLATES` 新增一个 `workforce-global` 条目：`bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-workforce-global']`，`patchReload: 'startup'`（与 `headless` 相同的非实时姿态，因为持久化 host 默认不需要实时用户 patch 重新加载）。现在 `dsh --profile workforce-global "task"` 会通过普通的 profile 启动器自动初始化并启动——与每个随附 profile 相同的代码路径，没有新的可执行文件，也没有特判解析逻辑。

该包是 `private: true`（没有 `publishConfig`）：它是 fork 本地的 Workforce 基础设施，不是准备公开发布到 npm 的上游 DeepSeek 包，遵循 `packages/experimental/agent-team-profile` 的先例——一个不属于随附 `@deepseek-ai/dsh-*` 公开表层的 bundle。

## Alternatives considered

- **等待第一个 Workforce 插件包（持久化 SessionEvent 扩展）落地后再一并创建 profile**：被拒绝——这会把一个本不相关的任务与 profile/bundle 脚手架工作纠缠在一起，而且之后每一个 Workforce 任务都会面临同样的选择。先落地这个空的、具名的层，之后的每个任务就只需要向一个已经能工作的 bundle 添加一行 `insert`。
- **在本包自己的默认层单元测试中启动真实、完整的 `dsh-base` 插件树（约 80 行）**，以字面意义证明"组合树能够就绪"：直接针对真实的 `Context` + `Loader` + `Include` 尝试过，结果发现这需要安装版 CLI 自身的锚点与 profile 模块回退解析（`@deepseek-ai/dsh-app-boot` 中的 `healProfilesModuleFallback` / `boot`）——`dsh-base` patch 中的裸包名无法从任意临时目录解析，只能从真实 profile 自身修复过的 `node_modules` 解析。本仓库中没有任何其他 bundle 包的默认层测试这样做；本仓库中每一个完整随附 profile 的启动（`bootProductionProfile`、`runLoaderSmoke` + 子进程 driver）都位于 e2e 层（`packages/**/*.e2e.ts`、`apps/cli/tests/profiles/*`），而不是某个包自己的 `tests/*.spec.ts`。最终交付的测试转而证明包级测试能够安全证明的部分：patch 文档正是 manifest 所承诺的那个空的、可解析的层（与 `packages/bundle/base/tests/base.spec.ts` 的做法一致）；`composeEntries`——profile 启动器用来构建其挂载行集合的确切函数——对 `dsh-base` + `workforce-global` 产生的行集合与单独的 `dsh-base` 完全相同；以及一个真实的 `Context` + `Loader` + `Include` 将本 bundle 真实（为空）的 patch 文件作为第二层挂载在一个简单的 fixture 层之上，达到就绪状态且没有抛出错误，也没有任何行被增加、更改或移除。
- **给本 bundle 配上与 `dsh-base`/`dsh-headless` 相同的公开 `publishConfig`**：目前拒绝——将一个空的占位包发布到公开的 `@deepseek-ai` npm 作用域，应当是交付第一个已填充 Workforce 包的人做出的刻意决定，而不是搭建空层的副产品。

## Consequences

- 今天 `dsh --profile workforce-global` 就是一个真实的、可启动的 profile，尽管尚未挂载任何 Workforce 自有插件——之后每一个填充这一层的 Workforce 任务都只需要编辑 `packages/bundle/workforce-global/cordis.patch.yml` 并添加自己的依赖，不再需要触碰 `PROFILE_TEMPLATES`。
- `packages/boot/app-boot/tests/profile.spec.ts` 新增了一个针对 `PROFILE_TEMPLATES['workforce-global']` 的断言块，与它已有的 `acp`/`sdk`/`sdk-minimal` 检查并列。
- `tsconfig.host.json` 的工程引用列表与 `scripts/verify-package-readme-model-experience.ts` 的包白名单都新增了一条针对新包的条目，这与每个既有 bundle 包当初都需要的注册完全相同；`packages/bundle/README.md`/`README.zh.md` 的包表格新增了一行，方便审阅者将 `workforce-global` 与另一个任务添加的并行 `workforce-cell` bundle 进行对比。
- 真正启动真实的 `dsh-base` + `workforce-global` 组合（通过真实 profile 模块回退锚点挂载全部约 80 行）被推迟到 e2e 层，与其他每个随附 profile 的完整启动已经采用的方式相同——本 Agent Note 不新增 e2e 测试，因为该 profile 目前为空，不引入任何可能在 `packages/boot/app-boot` 自身测试套件与随附 `headless`/`web`/`sdk`/`acp` e2e 套件已覆盖范围之外造成启动回归的内容。
