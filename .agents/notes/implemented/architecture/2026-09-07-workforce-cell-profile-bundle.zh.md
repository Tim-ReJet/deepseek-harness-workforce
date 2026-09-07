# Agent 笔记:在任何 Cell 插件存在之前,一个空的 `workforce-cell` profile 与 bundle 即可启动

状态:已实现

[English](2026-09-07-workforce-cell-profile-bundle.md) | 中文

## 问题

ADR-006 的一次性 Cell DSH(一个进程回答一个委派任务,由 nono 从外部包裹,然后退出)需要一个真实的、具名的 profile 供其启动,而 `@workforce/execution-cell` 的 Task/Gate/Loop 运行时(CELL-002)或 `@workforce/nono-bridge` 的 ActionIntent-to-nono 桥接(BRIDGE-001)此时尚不存在。`PROFILE_TEMPLATES` 中没有 `workforce-cell` 条目,也没有 `packages/bundle/workforce-cell` 包供这些后续任务添加自己的行,这与 `workforce-global`(DSH-001)为持久化 host profile 填补的缺口是同一类问题。

## 决策

`packages/bundle/workforce-cell` 是一个新的 bundle 包,其形态与 `packages/bundle/workforce-global` 的 manifest/tsconfig/README 三件套完全一致,但叠加在 `@deepseek-ai/dsh-base` **与** `@deepseek-ai/dsh-headless` 之上,而不是仅叠加在 `dsh-base` 之上:一次性 Cell 只回答一个任务然后退出,因此现有的一次性 headless runner——而非持久化的 Web/HTTP host `dsh-web-app` 提供的那一层——是现有随附形态中最接近"Cell DSH 基本形态"的一个。它声明 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`,peer 依赖 `@deepseek-ai/cordis`、`@deepseek-ai/dsh-base` 与 `@deepseek-ai/dsh-headless`,不添加任何其他依赖。它的 `cordis.patch.yml` 是一个字面意义上的空 patch 列表(`[]`),行内注释指出了将来填充它的任务,并警告不要在支撑它的包存在之前添加 `@workforce/*` 依赖(无法解析的 workspace 依赖会让整个仓库的 `pnpm install` 失败)。`src/index.ts` 不携带任何运行时 API。

`packages/boot/app-boot/src/profile.ts` 中的 `PROFILE_TEMPLATES` 新增一个 `workforce-cell` 条目:`bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless', '@deepseek-ai/dsh-workforce-cell']`,`patchReload: 'startup'`(一次性 Cell 没有实时重新加载的使用场景)。`dsh --profile workforce-cell "task"` 现在会通过普通的 profile 启动器自动初始化并启动,与每个随附 profile 使用的代码路径完全相同。

沿用 DSH-001 针对同一类缺口的修复(`011f7fb958`):仅在 `PROFILE_TEMPLATES` 中命名 bundle 并不足以让它被解析。`resolveBundleDir` 会从 `apps/cli/package.json`(`apps/cli/src/profile-boot.ts` 中的 `INSTALL_ANCHOR`)出发,走 Node 真实的 `resolve.paths()`,只能找到该清单的真实依赖、因此已链接进 `apps/cli/node_modules` 的包。`apps/cli/package.json` 与随附的每个其他 bundle 一样新增 `"@deepseek-ai/dsh-workforce-cell": "workspace:^"`;`tsconfig.base.json`(通过 `pnpm run gen-tsconfig-paths` 重新生成)、`apps/cli/tsconfig.json` 与 `tsconfig.host.json` 各自新增对应的 `paths` 条目/项目引用,与 `workforce-global` 自身的注册方式一致。`packages/boot/app-boot/tests/profile.spec.ts` 中由 DSH-001 添加的现有通用测试——针对真实的 `apps/cli/package.json` 锚点解析每个 `PROFILE_TEMPLATES` 条目的 bundles——无需任何测试文件改动即可自动覆盖这个新条目;出于与 `workforce-global` 相同的理由,我们仍在既有的逐条模板检查旁添加了针对 `PROFILE_TEMPLATES['workforce-cell']` 的专门 `toEqual` 断言。

本 bundle 刻意对 nono 一无所知:ADR-006 让 nono 以进程外边界(PID 1 / supervisor)的方式包裹 Cell DSH,而不是让 Cell 链接的库。本 bundle 不持有任何 nono 特定代码、能力清单(capability-manifest)、许可(permit)或凭证逻辑(不变量 7——"DSH 侧的权限 UX 不得放宽 Workforce 许可"),也不持有任何签名代码(不变量 4)。它同样不接入 `packages/mcp/mcp-client`:"可发现的工具默认零变更权限"(plan 16)是后续 Cell 任务(TOOL-001、BRIDGE-001)在任何真实工具接入本 profile 之前必须满足的前提条件。

本包从一开始就带有 `publishConfig: { access: 'public' }` 且不设置 `private` 标志,与 `dsh-base`/`dsh-headless`/`dsh-workforce-global` 一致——`packages/bundle/workforce-cell` 符合 `scripts/check-workspace-constraints.ts` 中 `releaseMemberDirectory` 的匹配模式(`experimental/` 之外的任何 `packages/<group>/<name>`),因此从 `private: true` 起步只会重复 DSH-001 那个已经修正过的错误。

## 考虑过的替代方案

- **像 `workforce-global` 一样只叠加在 `dsh-base` 之上**:被否决——一次性 Cell 存在的全部理由就是回答一个委派任务然后退出;单独的 `dsh-base` 没有驱动任务的 runner,在这里重新发明一个只会重复 `dsh-headless` 已有的直接 Agent 驱动器,而不是复用它。
- **叠加在 `dsh-web-app` 之上**:根据任务目标被否决——一次性 Cell 没有持久化 web/HTTP 表层需要提供;那一层的 Host/HTTP/浏览器行恰恰是 ADR-028 中按任务、完成即退出的 Cell 所不需要的。
- **在本包自己的默认层单元测试中启动完整组合的 `dsh-base` + `dsh-headless`(约 80+ 行)patch 树**:出于与 `workforce-global` 测试套件相同的理由被否决——该组合需要已安装 CLI 自身的锚点与 profile 模块回退解析,目前只有 e2e 层(`apps/cli/tests/profiles/*`)对任何随附 profile 执行这种验证。已交付的测试转而证明:patch 文档正是承诺的空的、可解析的层;`composeEntries`(profile 启动器实际调用的函数)在 `dsh-base` + `dsh-headless` 行集不变、附加本 bundle 自身行的情况下产出相同结果;以及真实的 Loader/Include 将本 bundle 实际的 patch 文件作为第二层挂载且不抛出错误。

## 后果

- `dsh --profile workforce-cell` 是一个真实的、可启动的 profile,目前尚未挂载任何 Cell 自有插件;后续每个填充这一层的 Cell 任务(CELL-002、BRIDGE-001)只需编辑 `packages/bundle/workforce-cell/cordis.patch.yml` 并添加自己的依赖,不再需要触碰 `PROFILE_TEMPLATES`。
- `packages/boot/app-boot/tests/profile.spec.ts` 新增了针对 `PROFILE_TEMPLATES['workforce-cell']` 的断言块,而其(来自 DSH-001 的)真实锚点解析测试无需修改即可覆盖这个新条目。
- `apps/cli/package.json`、`apps/cli/tsconfig.json`、`tsconfig.base.json` 与 `tsconfig.host.json` 各自为新包新增一条记录,与 `workforce-global` 已要求的注册方式相同;`packages/bundle/README.md`/`README.zh.md` 的包表以及 `scripts/verify-package-readme-model-experience.ts` 的白名单各自新增一行/一条,与并行的 `workforce-global` bundle 保持一致,方便审阅者对比两者。
- 真实启动完整组合的 `dsh-base` + `dsh-headless` + `workforce-cell`(通过实际的 profile 模块回退锚点挂载每一行)被推迟到 e2e 层,与其他每个随附 profile 的完整启动验证方式相同——本 bundle 不新增 e2e 测试,因为该 profile 目前为空,除了 `packages/boot/app-boot` 自身的测试套件与随附的 `headless` e2e 套件已经覆盖的内容之外,不引入任何新的导入。
