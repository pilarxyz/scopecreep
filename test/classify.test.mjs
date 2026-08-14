import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify } from '../plugins/scopecreep/scopecreep.mjs'

const cfg = { scope: ['src/auth/**'], protected: ['package.json', '.env*'] }

test('a write inside the declared scope is in scope and not protected', () => {
  assert.deepEqual(classify('src/auth/login.ts', cfg), { inScope: true, protected: false })
})

test('a write outside the declared scope is flagged', () => {
  assert.deepEqual(classify('src/api/users.ts', cfg), { inScope: false, protected: false })
})

test('a protected path is flagged even when it sits inside the scope', () => {
  assert.deepEqual(classify('src/auth/package.json', cfg), { inScope: true, protected: true })
})

test('a protected path outside the scope is flagged on both counts', () => {
  assert.deepEqual(classify('.env.local', cfg), { inScope: false, protected: true })
})

test('an empty scope treats every path as in scope so a fresh install stays quiet', () => {
  assert.deepEqual(classify('anywhere/at/all.ts', { scope: [], protected: [] }), {
    inScope: true,
    protected: false,
  })
})

test('an absolute path is classified against its path relative to the project root', () => {
  const r = classify('/home/me/proj/src/api/users.ts', cfg, '/home/me/proj')
  assert.deepEqual(r, { inScope: false, protected: false })
})

test('an absolute path inside the scope is recognised as in scope', () => {
  const r = classify('/home/me/proj/src/auth/login.ts', cfg, '/home/me/proj')
  assert.deepEqual(r, { inScope: true, protected: false })
})
