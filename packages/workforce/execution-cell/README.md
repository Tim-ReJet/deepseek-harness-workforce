---
description: "Bounded Cell Task/Gate/Loop policy over ctx.workflowEngine and a local workforce.evidence-index/v1 exporter for the workforce-cell profile."
kind: "package-reference"
---

# @deepseek-ai/dsh-workforce-execution-cell

English | [中文](README.zh.md)

## Summary

`dsh-workforce-execution-cell` implements plan 09's bounded Task/Gate/Loop as a thin policy layer on the existing `ctx.workflowEngine` seam: one workflow run per attempt cycle, caller-supplied recursion bounds (`maxIterations`, `maxChildDepth`, `noProgressThreshold`, optional cost/time caps), and local `CellGate` evaluations that are never equated with Workforce `OutcomeAttestation` verdicts. On dispose (when configured), it writes an unsigned `workforce.evidence-index/v1`-shaped JSON file into the Cell workspace — evidence input for a future Outcome Attestor, not a signed RunManifest or attestation. Mount it on `@deepseek-ai/dsh-workforce-cell` alongside tool admission.

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

Choose it when a disposable Cell profile needs the plan-09 evaluation/repair loop without a new orchestration engine. Skip it for global host Sessions (`workforce-global`) or runs with no Cell lifecycle. BRIDGE-001, RESULT-001, and K8S-002 own signed submission, compact OutcomeAttestation records, and child-Cell isolation respectively.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-workforce-execution-cell'
```

Optional export-on-dispose:

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

`CellLoopResult.stopReason` is loop lifecycle vocabulary only; read `finalGate.verdict` for the local PASS/FAIL/INDETERMINATE evaluation.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

| Module | Role |
| --- | --- |
| `src/types.ts` | Pure Task/Gate/Loop and EvidenceIndex draft types |
| `src/domain.ts` | Workflow request builder, stagnation helper, repair selection |
| `src/loop.ts` | `runCellLoop` bounded driver |
| `src/evidence-exporter.ts` | `exportEvidenceIndex` + workspace writer |
| `src/index.ts` | Cordis plugin (`workforce-execution-cell`) |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [packages/workforce/WORKFORCE_PLATFORM.md](../WORKFORCE_PLATFORM.md) — sibling `@reactorjet/workforce-contracts` checkout
- [packages/workflow/workflow/README.md](../../workflow/workflow/README.md) — workflow engine seam

-----

<a id="model-experience"></a>
## Model Experience

None — the loop and exporter are host-side policy; model-visible tool/agent behavior stays in composed base/headless plugins and admitted tools.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Effects/evaluations/children** export as empty digestRef arrays until ActionIntent/EffectReceipt and child attestation types land (BRIDGE-001 / RESULT-001).
- **Child Cell isolation** is not enforced here — recursion stays within one Cell until K8S-002 (or local equivalent) provides a distinct execution context.
- **Requires sibling `workforce-platform`** for `@reactorjet/workforce-contracts` — see [WORKFORCE_PLATFORM.md](../WORKFORCE_PLATFORM.md).

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

CELL-002 packet: bounded loop over `ctx.workflowEngine` only; never author RunManifest closure or OutcomeAttestation shapes.

</details>
