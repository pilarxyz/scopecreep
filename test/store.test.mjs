import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadConfig, snapshotFile, recordWrite, readLedger, DEFAULTS } from '../plugins/scopecreep/scopecreep.mjs'

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'))
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  return dir
}

test('a missing config file yields defaults that flag nothing', () => {
  const cfg = loadConfig(tmpRepo())
  assert.deepEqual(cfg.scope, [])
  assert.equal(cfg.mode, 'warn')
})

test('a malformed config file falls back to defaults instead of throwing', () => {
  const dir = tmpRepo()
  fs.writeFileSync(path.join(dir, '.claude/scopecreep.json'), '{ this is not json')
  const cfg = loadConfig(dir)
  assert.equal(cfg.mode, DEFAULTS.mode)
  assert.deepEqual(cfg.scope, [])
})

test('a config file is merged over the defaults', () => {
  const dir = tmpRepo()
  fs.writeFileSync(
    path.join(dir, '.claude/scopecreep.json'),
    JSON.stringify({ scope: ['src/**'], mode: 'block' }),
  )
  const cfg = loadConfig(dir)
  assert.deepEqual(cfg.scope, ['src/**'])
  assert.equal(cfg.mode, 'block')
  assert.deepEqual(cfg.protected, DEFAULTS.protected)
})

test('a snapshot preserves the content a file had before the write', () => {
  const dir = tmpRepo()
  const f = path.join(dir, 'a.txt')
  fs.writeFileSync(f, 'original')
  const snap = snapshotFile(dir, f)
  fs.writeFileSync(f, 'clobbered')
  assert.equal(snap.existed, true)
  assert.equal(fs.readFileSync(path.join(dir, '.scopecreep/snapshots', snap.hash), 'utf8'), 'original')
})

test('a write to a path that does not exist yet is snapshotted as a creation', () => {
  const dir = tmpRepo()
  const snap = snapshotFile(dir, path.join(dir, 'new.txt'))
  assert.equal(snap.existed, false)
  assert.equal(snap.hash, null)
})

test('reading a ledger that does not exist yields an empty list', () => {
  assert.deepEqual(readLedger(tmpRepo()), [])
})

test('each recorded write appends one parseable json line', () => {
  const dir = tmpRepo()
  recordWrite(dir, { task: 'abc123', rel: 'a.txt', inScope: true })
  recordWrite(dir, { task: 'abc123', rel: 'b.txt', inScope: false })
  const entries = readLedger(dir)
  assert.equal(entries.length, 2)
  assert.equal(entries[1].rel, 'b.txt')
  assert.equal(entries[1].inScope, false)
  assert.ok(entries[0].at, 'every entry carries a timestamp')
})

test('a corrupt ledger line is skipped rather than crashing the reader', () => {
  const dir = tmpRepo()
  recordWrite(dir, { task: 'abc123', rel: 'a.txt', inScope: true })
  fs.appendFileSync(path.join(dir, '.scopecreep/ledger.jsonl'), 'not json at all\n')
  recordWrite(dir, { task: 'abc123', rel: 'c.txt', inScope: true })
  const entries = readLedger(dir)
  assert.equal(entries.length, 2)
  assert.equal(entries[1].rel, 'c.txt')
})

test('a config at the project root is found, so a plugin install needs no .claude dir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'))
  fs.writeFileSync(path.join(dir, 'scopecreep.json'), JSON.stringify({ scope: ['lib/**'] }))
  assert.deepEqual(loadConfig(dir).scope, ['lib/**'])
})

test('a config under .claude still works, so existing installs keep running', () => {
  const dir = tmpRepo()
  fs.writeFileSync(path.join(dir, '.claude/scopecreep.json'), JSON.stringify({ scope: ['old/**'] }))
  assert.deepEqual(loadConfig(dir).scope, ['old/**'])
})

test('the project root config wins when both exist', () => {
  const dir = tmpRepo()
  fs.writeFileSync(path.join(dir, 'scopecreep.json'), JSON.stringify({ scope: ['root/**'] }))
  fs.writeFileSync(path.join(dir, '.claude/scopecreep.json'), JSON.stringify({ scope: ['nested/**'] }))
  assert.deepEqual(loadConfig(dir).scope, ['root/**'])
})

test('a malformed root config falls through to the .claude one rather than to defaults', () => {
  const dir = tmpRepo()
  fs.writeFileSync(path.join(dir, 'scopecreep.json'), '{ broken')
  fs.writeFileSync(path.join(dir, '.claude/scopecreep.json'), JSON.stringify({ scope: ['fallback/**'] }))
  assert.deepEqual(loadConfig(dir).scope, ['fallback/**'])
})
