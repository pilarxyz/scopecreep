import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { snapshotFile, recordWrite, undo, DEFAULTS } from '../plugins/scopecreep/scopecreep.mjs'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'))
const noChmod = process.platform === 'win32' || process.getuid?.() === 0

test('a file that cannot be read is not mistaken for one the task created', { skip: noChmod }, () => {
  const root = tmp()
  const f = path.join(root, 'secret.txt')
  fs.writeFileSync(f, 'precious')
  fs.chmodSync(f, 0o000)
  try {
    const snap = snapshotFile(root, f)
    assert.equal(snap.existed, true, 'the file exists, the snapshot just failed')
  } finally {
    fs.chmodSync(f, 0o600)
  }
})

test('undo never deletes a file it has no copy of', { skip: noChmod }, () => {
  const root = tmp()
  const f = path.join(root, 'secret.txt')
  fs.writeFileSync(f, 'precious')
  fs.chmodSync(f, 0o000)
  const snap = snapshotFile(root, f)
  fs.chmodSync(f, 0o600)
  recordWrite(root, { task: 't1', rel: 'secret.txt', inScope: true, snapshot: snap })

  const result = undo(root, 't1')

  assert.equal(fs.existsSync(f), true, 'undo deleted a file it could not restore')
  assert.deepEqual(result.skipped, ['secret.txt'])
})

test('a file past the size cap is recorded but not copied into the store', () => {
  const root = tmp()
  const f = path.join(root, 'big.bin')
  fs.writeFileSync(f, Buffer.alloc(2048))
  const snap = snapshotFile(root, f, 1024)
  assert.equal(snap.existed, true)
  assert.equal(snap.hash, null)
  assert.equal(snap.skipped, 'too large')
  assert.equal(fs.existsSync(path.join(root, '.scopecreep/snapshots')), false)
})

test('a file inside the size cap is copied as before', () => {
  const root = tmp()
  const f = path.join(root, 'small.bin')
  fs.writeFileSync(f, Buffer.alloc(100))
  const snap = snapshotFile(root, f, 1024)
  assert.equal(snap.existed, true)
  assert.ok(snap.hash)
})

test('the size cap has a documented default', () => {
  assert.equal(typeof DEFAULTS.maxSnapshotBytes, 'number')
  assert.ok(DEFAULTS.maxSnapshotBytes > 0)
})

test('a directory in the write path is not snapshotted as a file', () => {
  const root = tmp()
  const d = path.join(root, 'adir')
  fs.mkdirSync(d)
  const snap = snapshotFile(root, d)
  assert.equal(snap.hash, null)
})
