/**
 * CellGate verdict vocabulary stays disjoint from loop stopReason; public exports
 * expose no signing or attestation helpers.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { CellGateVerdict, CellLoopStopReason } from '../src/types.ts'
import * as packageApi from '../src/index.ts'

const gateVerdicts = ['PASS', 'FAIL', 'INDETERMINATE'] as const satisfies readonly CellGateVerdict[]
const stopReasons = ['converged', 'attempts-exhausted', 'no-progress', 'cancelled'] as const satisfies readonly CellLoopStopReason[]

describe('execution-cell invariants', () => {
  it('keeps CellGate.verdict and CellLoopResult.stopReason as disjoint literal unions', () => {
    for (const verdict of gateVerdicts) {
      expect(stopReasons.includes(verdict as CellLoopStopReason)).toBe(false)
    }
    for (const reason of stopReasons) {
      expect(gateVerdicts.includes(reason as CellGateVerdict)).toBe(false)
    }
  })

  it('exports no sign* or attest* named functions from the public entry', () => {
    for (const [name, value] of Object.entries(packageApi)) {
      if (typeof value !== 'function') continue
      expect(name.match(/^(sign|attest)/i)).toBeNull()
    }
    const root = fileURLToPath(new URL('..', import.meta.url))
    const indexSource = readFileSync(resolve(root, 'src/index.ts'), 'utf8')
    expect(indexSource).not.toMatch(/\bfunction\s+(sign|attest)/i)
    expect(indexSource).not.toMatch(/\bexport\s+function\s+(sign|attest)/i)
  })
})
