import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { readLedger } from '../plugins/scopecreep/scopecreep.mjs'

const HOOK = path.resolve('plugins/scopecreep/scopecreep.mjs')

function repo(config) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'))
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/scopecreep.json'), JSON.stringify(config))
  return dir
}

function runHook(dir, event) {
  const res = execFileSync('node', [HOOK], { input: JSON.stringify(event), encoding: 'utf8' })
  return res.trim()
}

const write = (dir, rel) => ({
  session_id: 'sess-abcdef123',
  hook_event_name: 'PreToolUse',
  cwd: dir,
  tool_name: 'Write',
  tool_input: { file_path: path.join(dir, rel), content: 'x' },
})

test('the hook stays silent for a write inside the scope', () => {
  const dir = repo({ scope: ['src/auth/**'], protected: [] })
  assert.equal(runHook(dir, write(dir, 'src/auth/login.ts')), '')
})

test('the hook emits a user facing warning for an out of scope write', () => {
  const dir = repo({ scope: ['src/auth/**'], protected: [] })
  const out = JSON.parse(runHook(dir, write(dir, 'src/api/users.ts')))
  assert.match(out.systemMessage, /out of scope/)
  assert.match(out.systemMessage, /src\/api\/users\.ts/)
})

test('the hook emits a deny decision in block mode', () => {
  const dir = repo({ scope: ['src/auth/**'], protected: [], mode: 'block' })
  const out = JSON.parse(runHook(dir, write(dir, 'src/api/users.ts')))
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse')
})

test('the hook records every write to the ledger, in scope or not', () => {
  const dir = repo({ scope: ['src/auth/**'], protected: [] })
  runHook(dir, write(dir, 'src/auth/login.ts'))
  runHook(dir, write(dir, 'src/api/users.ts'))
  const entries = readLedger(dir)
  assert.equal(entries.length, 2)
  assert.deepEqual(entries.map((e) => e.inScope), [true, false])
  assert.ok(entries.every((e) => e.task === 'sess-abcdef123'))
})

test('the hook snapshots a file before the agent overwrites it', () => {
  const dir = repo({ scope: ['src/**'], protected: [] })
  const abs = path.join(dir, 'src/a.ts')
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, 'the original')
  runHook(dir, write(dir, 'src/a.ts'))
  const entry = readLedger(dir)[0]
  assert.equal(entry.snapshot.existed, true)
  const blob = path.join(dir, '.scopecreep/snapshots', entry.snapshot.hash)
  assert.equal(fs.readFileSync(blob, 'utf8'), 'the original')
})

test('the hook exits zero on garbage stdin so it can never break a session', () => {
  const res = execFileSync('node', [HOOK], { input: 'not json', encoding: 'utf8' })
  assert.equal(res.trim(), '')
})

test('the hook exits zero when the config names an unreadable directory', () => {
  const res = execFileSync('node', [HOOK], {
    input: JSON.stringify({ cwd: '/nonexistent/nope', tool_name: 'Write', tool_input: { file_path: '/nonexistent/nope/a.ts' } }),
    encoding: 'utf8',
  })
  assert.doesNotThrow(() => (res.trim() === '' ? null : JSON.parse(res)))
})

test('the hook ignores tools that do not write files', () => {
  const dir = repo({ scope: ['src/auth/**'], protected: [] })
  const out = runHook(dir, { cwd: dir, tool_name: 'Bash', tool_input: { command: 'ls' } })
  assert.equal(out, '')
  assert.deepEqual(readLedger(dir), [])
})
