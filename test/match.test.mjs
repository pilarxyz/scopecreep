import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchesAny } from '../plugins/scopecreep/scopecreep.mjs'

test('a trailing ** matches files nested at any depth below it', () => {
  assert.equal(matchesAny('src/auth/login.ts', ['src/auth/**']), true)
  assert.equal(matchesAny('src/auth/a/b/c/deep.ts', ['src/auth/**']), true)
})

test('a trailing ** does not match a sibling directory', () => {
  assert.equal(matchesAny('src/api/users.ts', ['src/auth/**']), false)
  assert.equal(matchesAny('src/authentication/x.ts', ['src/auth/**']), false)
})

test('a single star stops at a path separator', () => {
  assert.equal(matchesAny('src/auth.ts', ['src/*.ts']), true)
  assert.equal(matchesAny('src/a/b.ts', ['src/*.ts']), false)
})

test('a pattern with no slash matches that basename at any depth', () => {
  assert.equal(matchesAny('package.json', ['package.json']), true)
  assert.equal(matchesAny('apps/web/package.json', ['package.json']), true)
})

test('a pattern containing a slash is anchored to the repo root', () => {
  assert.equal(matchesAny('vendor/src/auth/x.ts', ['src/auth/**']), false)
})

test('dots in a pattern are literal, not regex wildcards', () => {
  assert.equal(matchesAny('srcXauth/a.ts', ['src.auth/**']), false)
})

test('env style prefixes match their suffixed variants', () => {
  assert.equal(matchesAny('.env', ['.env*']), true)
  assert.equal(matchesAny('.env.local', ['.env*']), true)
  assert.equal(matchesAny('environment.ts', ['.env*']), false)
})

test('an empty pattern list matches nothing', () => {
  assert.equal(matchesAny('anything.ts', []), false)
})
