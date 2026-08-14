import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { classify } from '../plugins/scopecreep/scopecreep.mjs'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'))

test('a path outside the project is never in scope, even when it mimics the scope', () => {
  const cfg = { scope: ['app/**'], protected: [] }
  assert.equal(classify('/app/x.ts', cfg, '/home/me/proj').inScope, false)
})

test('a sibling directory that mimics the scope is not in scope', () => {
  const root = tmp()
  const sibling = tmp()
  fs.mkdirSync(path.join(sibling, 'src'), { recursive: true })
  fs.writeFileSync(path.join(sibling, 'src/a.ts'), 'x')
  const cfg = { scope: ['src/**'], protected: [] }
  assert.equal(classify(path.join(sibling, 'src/a.ts'), cfg, root).inScope, false)
})

test('the same path inside the project is still in scope', () => {
  const root = tmp()
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'src/a.ts'), 'x')
  const cfg = { scope: ['src/**'], protected: [] }
  assert.equal(classify(path.join(root, 'src/a.ts'), cfg, root).inScope, true)
})

test('an empty scope stays quiet everywhere, as the readme promises', () => {
  assert.equal(classify('/anywhere/at/all.ts', { scope: [], protected: [] }, '/home/me/proj').inScope, true)
})

test('a protected pattern still catches a file outside the project', () => {
  const r = classify('/home/me/.env', { scope: ['src/**'], protected: ['.env*'] }, '/home/me/proj')
  assert.equal(r.protected, true)
  assert.equal(r.inScope, false)
})
