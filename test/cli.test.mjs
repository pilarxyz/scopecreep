import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { summarize } from '../.claude/scopecreep.mjs'
import { recordWrite, snapshotFile } from '../.claude/scopecreep.mjs'

const CLI = path.resolve('bin/scopecreep.mjs')

test('summarize groups writes into one row per task', () => {
  const rows = summarize([
    { task: 'a', rel: 'x.ts', inScope: true, at: '2026-01-01T00:00:00Z' },
    { task: 'a', rel: 'y.ts', inScope: false, at: '2026-01-01T00:01:00Z' },
    { task: 'b', rel: 'z.ts', inScope: true, at: '2026-01-02T00:00:00Z' },
  ])
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], { task: 'b', inScope: 1, outOfScope: 0, at: '2026-01-02T00:00:00Z' })
  assert.deepEqual(rows[1], { task: 'a', inScope: 1, outOfScope: 1, at: '2026-01-01T00:01:00Z' })
})

test('summarize counts repeated writes to one file once per write', () => {
  const rows = summarize([
    { task: 'a', rel: 'x.ts', inScope: false, at: '2026-01-01T00:00:00Z' },
    { task: 'a', rel: 'x.ts', inScope: false, at: '2026-01-01T00:00:01Z' },
  ])
  assert.equal(rows[0].outOfScope, 2)
})

test('summarize of an empty ledger is an empty list', () => {
  assert.deepEqual(summarize([]), [])
})

function repoWithHistory() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'))
  const abs = path.join(dir, 'pkg.json')
  fs.writeFileSync(abs, 'before')
  recordWrite(dir, { task: 'sess-777', rel: 'pkg.json', inScope: false, snapshot: snapshotFile(dir, abs) })
  fs.writeFileSync(abs, 'after')
  return { dir, abs }
}

const run = (dir, args) => execFileSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8' })

test('scopecreep log lists the task with its out of scope count', () => {
  const { dir } = repoWithHistory()
  const out = run(dir, ['log'])
  assert.match(out, /sess-777/)
  assert.match(out, /1 out/)
})

test('scopecreep show lists the files a task touched', () => {
  const { dir } = repoWithHistory()
  assert.match(run(dir, ['show', 'sess-777']), /pkg\.json/)
})

test('scopecreep undo restores the file and reports what it did', () => {
  const { dir, abs } = repoWithHistory()
  const out = run(dir, ['undo', 'sess-777'])
  assert.equal(fs.readFileSync(abs, 'utf8'), 'before')
  assert.match(out, /pkg\.json/)
})

test('scopecreep undo --oos only touches out of scope writes', () => {
  const { dir, abs } = repoWithHistory()
  run(dir, ['undo', 'sess-777', '--oos'])
  assert.equal(fs.readFileSync(abs, 'utf8'), 'before')
})

test('scopecreep with no arguments prints usage', () => {
  const { dir } = repoWithHistory()
  assert.match(run(dir, []), /usage/i)
})

test('scopecreep log on an empty ledger says so instead of printing an empty table', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'))
  assert.match(run(dir, ['log']), /no writes recorded/i)
})
