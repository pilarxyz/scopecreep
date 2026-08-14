import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { snapshotFile, recordWrite, undo } from '../plugins/scopecreep/scopecreep.mjs'

function repoWithWrite(rel, before, after, inScope) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'))
  const abs = path.join(dir, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  if (before !== null) fs.writeFileSync(abs, before)
  const snap = snapshotFile(dir, abs)
  recordWrite(dir, { task: 'task1', rel, inScope, snapshot: snap })
  fs.writeFileSync(abs, after)
  return { dir, abs }
}

test('undo restores the content a file had before the task', () => {
  const { dir, abs } = repoWithWrite('src/a.ts', 'before', 'after', true)
  const result = undo(dir, 'task1')
  assert.equal(fs.readFileSync(abs, 'utf8'), 'before')
  assert.deepEqual(result.restored, ['src/a.ts'])
})

test('undo deletes a file the task created from nothing', () => {
  const { dir, abs } = repoWithWrite('src/new.ts', null, 'created', true)
  const result = undo(dir, 'task1')
  assert.equal(fs.existsSync(abs), false)
  assert.deepEqual(result.removed, ['src/new.ts'])
})

test('undo with oosOnly leaves in scope changes untouched', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'))
  for (const [rel, inScope] of [['src/auth/a.ts', true], ['package.json', false]]) {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, 'before')
    recordWrite(dir, { task: 'task1', rel, inScope, snapshot: snapshotFile(dir, abs) })
    fs.writeFileSync(abs, 'after')
  }
  undo(dir, 'task1', { oosOnly: true })
  assert.equal(fs.readFileSync(path.join(dir, 'src/auth/a.ts'), 'utf8'), 'after')
  assert.equal(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), 'before')
})

test('undo restores the state before the first write, not the second', () => {
  const { dir, abs } = repoWithWrite('src/a.ts', 'v1', 'v2', true)
  recordWrite(dir, { task: 'task1', rel: 'src/a.ts', inScope: true, snapshot: snapshotFile(dir, abs) })
  fs.writeFileSync(abs, 'v3')
  undo(dir, 'task1')
  assert.equal(fs.readFileSync(abs, 'utf8'), 'v1')
})

test('undo matches a task by id prefix', () => {
  const { dir, abs } = repoWithWrite('src/a.ts', 'before', 'after', true)
  undo(dir, 'tas')
  assert.equal(fs.readFileSync(abs, 'utf8'), 'before')
})

test('undo on an unknown task changes nothing and says so', () => {
  const { dir, abs } = repoWithWrite('src/a.ts', 'before', 'after', true)
  const result = undo(dir, 'nosuchtask')
  assert.equal(fs.readFileSync(abs, 'utf8'), 'after')
  assert.deepEqual(result, { restored: [], removed: [] })
})
