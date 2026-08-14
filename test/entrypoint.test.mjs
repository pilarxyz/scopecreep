import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const SOURCE = path.resolve('.claude/scopecreep.mjs')

function repoAt(dir) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.copyFileSync(SOURCE, path.join(dir, '.claude/scopecreep.mjs'))
  fs.writeFileSync(
    path.join(dir, '.claude/scopecreep.json'),
    JSON.stringify({ scope: ['src/auth/**'], protected: [] }),
  )
  return path.join(dir, '.claude/scopecreep.mjs')
}

function runAt(hook, cwd) {
  const event = {
    session_id: 's1',
    cwd,
    tool_name: 'Write',
    tool_input: { file_path: path.join(cwd, 'src/api/users.ts') },
  }
  return execFileSync('node', [hook], { input: JSON.stringify(event), encoding: 'utf8' }).trim()
}

test('the hook runs when its path reaches it through a symlink', () => {
  const real = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-real-'))
  repoAt(real)
  const link = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sc-link-')), 'proj')
  fs.symlinkSync(real, link)
  const out = runAt(path.join(link, '.claude/scopecreep.mjs'), link)
  assert.notEqual(out, '', 'hook produced no output through a symlinked path')
  assert.match(JSON.parse(out).systemMessage, /out of scope/)
})

test('the hook runs when its path contains a space', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'))
  const dir = path.join(base, 'my project')
  fs.mkdirSync(dir)
  const hook = repoAt(dir)
  const out = runAt(hook, dir)
  assert.notEqual(out, '', 'hook produced no output from a path containing a space')
})

test('the hook stays importable without executing its main routine', async () => {
  const mod = await import(`${SOURCE}?fresh=${process.pid}`)
  assert.equal(typeof mod.decide, 'function')
})
