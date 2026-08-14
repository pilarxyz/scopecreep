import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ScopeCreep } from '../.opencode/plugins/scopecreep.js'
import { readLedger } from '../plugins/scopecreep/scopecreep.mjs'

function repo(config) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-oc-'))
  fs.writeFileSync(path.join(dir, 'scopecreep.json'), JSON.stringify(config))
  return dir
}
const write = (dir, rel) => [{ tool: 'write' }, { args: { filePath: path.join(dir, rel) } }]

test('an out of scope write through the opencode plugin is recorded', async () => {
  const dir = repo({ scope: ['src/auth/**'], protected: [] })
  const hooks = await ScopeCreep({ directory: dir })
  await hooks['tool.execute.before'](...write(dir, 'src/api/users.ts'))
  const entries = readLedger(dir)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].inScope, false)
})

test('an in scope write through the opencode plugin is recorded too, so undo can reach it', async () => {
  const dir = repo({ scope: ['src/auth/**'], protected: [] })
  const hooks = await ScopeCreep({ directory: dir })
  await hooks['tool.execute.before'](...write(dir, 'src/auth/login.ts'))
  const entries = readLedger(dir)
  assert.equal(entries.length, 1, 'in scope write was not recorded')
  assert.equal(entries[0].inScope, true)
})

test('a blocked write through the opencode plugin throws and records nothing', async () => {
  const dir = repo({ scope: ['src/auth/**'], protected: [], mode: 'block' })
  const hooks = await ScopeCreep({ directory: dir })
  await assert.rejects(() => hooks['tool.execute.before'](...write(dir, 'src/api/users.ts')))
  assert.deepEqual(readLedger(dir), [])
})

test('a non file tool through the opencode plugin records nothing', async () => {
  const dir = repo({ scope: ['src/auth/**'], protected: [] })
  const hooks = await ScopeCreep({ directory: dir })
  await hooks['tool.execute.before']({ tool: 'bash' }, { args: { command: 'ls' } })
  assert.deepEqual(readLedger(dir), [])
})

test('the opencode plugin snapshots the previous content so undo has something to restore', async () => {
  const dir = repo({ scope: [], protected: [] })
  const abs = path.join(dir, 'a.ts')
  fs.writeFileSync(abs, 'the original')
  const hooks = await ScopeCreep({ directory: dir })
  await hooks['tool.execute.before']({ tool: 'edit' }, { args: { filePath: abs } })
  const entry = readLedger(dir)[0]
  assert.equal(entry.snapshot.existed, true)
  const blob = path.join(dir, '.scopecreep/snapshots', entry.snapshot.hash)
  assert.equal(fs.readFileSync(blob, 'utf8'), 'the original')
})
