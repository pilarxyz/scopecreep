import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { toRelative, classify, recordWrite, readLedger, snapshotFile, undo } from '../plugins/scopecreep/scopecreep.mjs'

const HOOK = path.resolve('plugins/scopecreep/scopecreep.mjs')
const tmp = (p = 'sc-') => fs.mkdtempSync(path.join(os.tmpdir(), p))

test('a write outside the project stays absolute so undo can find it again', () => {
  assert.equal(toRelative('/elsewhere/x.ts', '/home/me/proj'), '/elsewhere/x.ts')
})

test('a write outside the project is never in scope', () => {
  const r = classify('/etc/hosts', { scope: ['src/**'], protected: [] }, '/home/me/proj')
  assert.equal(r.inScope, false)
})

test('undo of a write outside the project restores the real file, not a copy inside the repo', () => {
  const root = tmp('sc-root-')
  const outside = tmp('sc-out-')
  const victim = path.join(outside, 'zshrc')
  fs.writeFileSync(victim, 'my real shell config')
  recordWrite(root, { task: 't1', rel: toRelative(victim, root), inScope: false, snapshot: snapshotFile(root, victim) })
  fs.writeFileSync(victim, 'the agent clobbered this')

  undo(root, 't1')

  assert.equal(fs.readFileSync(victim, 'utf8'), 'my real shell config')
  const stray = path.join(root, victim.replace(/^\//, ''))
  assert.equal(fs.existsSync(stray), false, 'undo wrote a stray file inside the repo')
})

test('a ledger that cannot be written does not swallow the warning', () => {
  const dir = tmp()
  fs.writeFileSync(path.join(dir, 'scopecreep.json'), JSON.stringify({ scope: ['src/**'], protected: [] }))
  // occupy .scopecreep with a file so mkdir of the directory fails
  fs.writeFileSync(path.join(dir, '.scopecreep'), 'in the way')
  const event = { session_id: 's', cwd: dir, tool_name: 'Write', tool_input: { file_path: path.join(dir, 'nope/a.ts') } }
  const out = execFileSync('node', [HOOK], { input: JSON.stringify(event), encoding: 'utf8' }).trim()
  assert.notEqual(out, '', 'the hook went silent because the ledger failed')
  assert.match(JSON.parse(out).systemMessage, /out of scope/)
})

test('concurrent hook runs each land one intact line in the ledger', () => {
  const dir = tmp()
  fs.writeFileSync(path.join(dir, 'scopecreep.json'), JSON.stringify({ scope: [], protected: [] }))
  const runs = Array.from({ length: 12 }, (_, i) =>
    execFileSync('node', [HOOK], {
      input: JSON.stringify({
        session_id: 's', cwd: dir, tool_name: 'Write',
        tool_input: { file_path: path.join(dir, `f${i}.ts`) },
      }),
      encoding: 'utf8',
    }),
  )
  assert.equal(runs.length, 12)
  const entries = readLedger(dir)
  assert.equal(entries.length, 12)
  assert.equal(new Set(entries.map((e) => e.rel)).size, 12)
})

test('undo skips an entry whose snapshot blob has been deleted rather than throwing', () => {
  const root = tmp()
  const f = path.join(root, 'a.ts')
  fs.writeFileSync(f, 'before')
  const snap = snapshotFile(root, f)
  recordWrite(root, { task: 't1', rel: 'a.ts', inScope: true, snapshot: snap })
  fs.writeFileSync(f, 'after')
  fs.rmSync(path.join(root, '.scopecreep/snapshots', snap.hash))
  assert.doesNotThrow(() => undo(root, 't1'))
  assert.equal(fs.readFileSync(f, 'utf8'), 'after')
})

test('an empty task id does not undo every task at once', () => {
  const root = tmp()
  const f = path.join(root, 'a.ts')
  fs.writeFileSync(f, 'before')
  recordWrite(root, { task: 't1', rel: 'a.ts', inScope: true, snapshot: snapshotFile(root, f) })
  fs.writeFileSync(f, 'after')
  assert.deepEqual(undo(root, ''), { restored: [], removed: [] })
  assert.equal(fs.readFileSync(f, 'utf8'), 'after')
})
