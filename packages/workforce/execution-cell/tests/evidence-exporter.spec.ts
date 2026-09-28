/**
 * EvidenceIndex export parses against the linked workforce.evidence-index/v1 schema.
 */

import { readFileSync } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { evidenceIndex } from '@reactorjet/workforce-contracts/src/evidence-index/index.ts'
import { exportEvidenceIndex, writeEvidenceIndexToWorkspace } from '../src/evidence-exporter.ts'
import type { CellLoopResult } from '../src/types.ts'

const sampleResult: CellLoopResult = {
  stopReason: 'converged',
  attempts: [{
    iteration: 0,
    taskId: 'baseline',
    childDepth: 0,
    gate: { verdict: 'PASS', reason: 'ok', evidenceRefs: ['sha256:abc'] },
  }],
  finalGate: { verdict: 'PASS', reason: 'ok', evidenceRefs: ['sha256:abc'] },
}

describe('exportEvidenceIndex', () => {
  it('parses against the linked evidence-index zod schema', () => {
    const draft = exportEvidenceIndex(sampleResult, {
      workOrderId: '01JWORK0000000000000000000',
      runId: '01JRUN00000000000000000000',
      cellId: '01JCELL0000000000000000000',
    })
    const parsed = evidenceIndex.parse(draft)
    expect(parsed.schema).toBe('workforce.evidence-index/v1')
    expect(parsed.effects).toEqual([])
    expect(parsed.evaluations).toEqual([])
    expect(parsed.children).toEqual([])
    expect(parsed.requiredProducerStatus[0]?.status).toBe('PRESENT')
  })

  it('does not shape RunManifest or OutcomeAttestation fields', () => {
    const draft = exportEvidenceIndex(sampleResult, {
      workOrderId: '01JWORK0000000000000000000',
      runId: '01JRUN00000000000000000000',
      cellId: '01JCELL0000000000000000000',
    })
    const serialized = JSON.stringify(draft)
    expect(serialized).not.toContain('closureState')
    expect(serialized).not.toContain('resourceConsumption')
    expect(Object.keys(draft as Record<string, unknown>)).not.toContain('verdict')
    expect(Object.keys(draft as Record<string, unknown>)).not.toContain('status')
  })

  it('writes JSON under workforce.evidence-index/v1.json in the workspace', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cell-ws-'))
    try {
      const draft = exportEvidenceIndex(sampleResult, {
        workOrderId: '01JWORK0000000000000000000',
        runId: '01JRUN00000000000000000000',
        cellId: '01JCELL0000000000000000000',
      })
      const path = await writeEvidenceIndexToWorkspace(dir, draft)
      expect(path.endsWith('workforce.evidence-index/v1.json')).toBe(true)
      const onDisk = JSON.parse(readFileSync(path, 'utf8')) as unknown
      evidenceIndex.parse(onDisk)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
