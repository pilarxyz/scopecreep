import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { undo, readLedger, recordWrite } from '../plugins/scopecreep/scopecreep.mjs'
import { ScopeCreep } from '../.opencode/plugins/scopecreep.js'

const HOOK = path.resolve('plugins/scopecreep/scopecreep.mjs')
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'))

test('a wedged ledger does not turn an allowed write into a blocked one on opencode', async () => {
  const dir = tmp()
  fs.writeFileSync(path.join(dir, 'scopecreep.json'), JSON.stringify({ scope: [], protected: [] }))
  fs.writeFileSync(path.join(dir, '.scopecreep'), 'in the way')
  const hooks = await ScopeCreep({ directory: dir })
  await assert.doesNotReject(
    () => hooks['tool.execute.before']({ tool: 'write' }, { args: { filePath: path.join(dir, 'a.ts') } }),
    'a ledger failure propagated as a rejected tool call',
  )
})

test('undo tolerates a ledger entry with no path rather than crashing', () => {
  const dir = tmp()
  recordWrite(dir, { task: 't1', inScope: true })
  recordWrite(dir, { task: 't1', rel: null, inScope: true })
  assert.doesNotThrow(() => undo(dir, 't1'))
})

test('the cli tolerates a ledger entry with no path', () => {
  const dir = tmp()
  recordWrite(dir, { task: 't1', inScope: false })
  const out = execFileSync('node', [path.resolve('bin/scopecreep.mjs'), 'show', 't1'], {
    cwd: dir,
    encoding: 'utf8',
  })
  assert.match(out, /out of scope/)
})

test('a relative file path in the event resolves against the project root, not the cwd', () => {
  const dir = tmp()
  fs.writeFileSync(path.join(dir, 'scopecreep.json'), JSON.stringify({ scope: ['src/**'], protected: [] }))
  const event = { session_id: 's', cwd: dir, tool_name: 'Write', tool_input: { file_path: 'src/a.ts' } }
  const out = execFileSync('node', [HOOK], { input: JSON.stringify(event), encoding: 'utf8' }).trim()
  assert.equal(out, '', 'a relative in scope path was reported as out of scope')
  assert.equal(readLedger(dir)[0].rel, 'src/a.ts')
})

test('a config that is valid json but the wrong shape does not crash the hook', () => {
  const dir = tmp()
  fs.writeFileSync(path.join(dir, 'scopecreep.json'), JSON.stringify({ scope: 'src/**', protected: 7, mode: 42 }))
  const event = { session_id: 's', cwd: dir, tool_name: 'Write', tool_input: { file_path: path.join(dir, 'a.ts') } }
  assert.doesNotThrow(() =>
    execFileSync('node', [HOOK], { input: JSON.stringify(event), encoding: 'utf8' }),
  )
})
