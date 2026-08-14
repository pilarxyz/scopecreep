import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { toRelative, classify } from '../plugins/scopecreep/scopecreep.mjs'

function linkedRepo() {
  const real = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-real-'))
  fs.mkdirSync(path.join(real, 'src/auth'), { recursive: true })
  const link = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sc-link-')), 'proj')
  fs.symlinkSync(real, link)
  return { real, link }
}

test('a file reached through a symlink resolves against the real project root', () => {
  const { real, link } = linkedRepo()
  assert.equal(toRelative(path.join(link, 'src/auth/login.ts'), real), 'src/auth/login.ts')
})

test('a file given by real path resolves against a symlinked project root', () => {
  const { real, link } = linkedRepo()
  assert.equal(toRelative(path.join(real, 'src/auth/login.ts'), link), 'src/auth/login.ts')
})

test('a file that does not exist yet still resolves through a symlinked root', () => {
  const { real, link } = linkedRepo()
  assert.equal(toRelative(path.join(link, 'src/auth/brand/new.ts'), real), 'src/auth/brand/new.ts')
})

test('scope matching survives the symlink, so an in scope write is not cried wolf over', () => {
  const { real, link } = linkedRepo()
  const cfg = { scope: ['src/auth/**'], protected: [] }
  assert.deepEqual(classify(path.join(link, 'src/auth/login.ts'), cfg, real), {
    inScope: true,
    protected: false,
  })
})

test('an out of scope write through a symlink is still caught', () => {
  const { real, link } = linkedRepo()
  const cfg = { scope: ['src/auth/**'], protected: [] }
  assert.equal(classify(path.join(link, 'src/api/users.ts'), cfg, real).inScope, false)
})

test('a path inside the root goes relative, a path outside it stays absolute', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-in-'))
  fs.mkdirSync(path.join(root, 'src'))
  fs.writeFileSync(path.join(root, 'src/a.ts'), 'x')
  assert.equal(toRelative(path.join(root, 'src/a.ts'), root), 'src/a.ts')

  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-out-'))
  fs.writeFileSync(path.join(outside, 'x.ts'), 'x')
  const rel = toRelative(path.join(outside, 'x.ts'), root)
  assert.equal(fs.realpathSync(path.resolve(rel)), fs.realpathSync(path.join(outside, 'x.ts')))
})
