import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decide } from '../plugins/scopecreep/scopecreep.mjs'

const root = '/home/me/proj'
const warn = { scope: ['src/auth/**'], protected: ['package.json'], mode: 'warn' }
const block = { ...warn, mode: 'block' }
const evt = (file, tool = 'Write') => ({
  tool_name: tool,
  tool_input: { file_path: `${root}/${file}` },
  cwd: root,
})

test('an in scope write produces no output at all', () => {
  assert.equal(decide(evt('src/auth/login.ts'), warn), null)
})

test('an out of scope write in warn mode tells the user and does not deny', () => {
  const out = decide(evt('src/api/users.ts'), warn)
  assert.match(out.systemMessage, /src\/api\/users\.ts/)
  assert.match(out.systemMessage, /out of scope/)
  assert.equal(out.hookSpecificOutput?.permissionDecision, undefined)
})

test('the warning names the scope that was violated so the user can fix the config', () => {
  const out = decide(evt('src/api/users.ts'), warn)
  assert.match(out.systemMessage, /src\/auth\/\*\*/)
})

test('an out of scope write in block mode is denied', () => {
  const out = decide(evt('src/api/users.ts'), block)
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse')
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /src\/api\/users\.ts/)
})

test('a protected file warns even though it sits inside the scope', () => {
  const out = decide(evt('src/auth/package.json'), warn)
  assert.match(out.systemMessage, /protected/i)
})

test('a protected file inside the scope is denied in block mode', () => {
  const out = decide(evt('src/auth/package.json'), block)
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
})

test('a tool that does not write files is ignored', () => {
  assert.equal(decide({ tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: root }, warn), null)
})

test('a notebook edit is classified on its notebook path', () => {
  const out = decide(
    { tool_name: 'NotebookEdit', tool_input: { notebook_path: `${root}/notes/x.ipynb` }, cwd: root },
    warn,
  )
  assert.match(out.systemMessage, /notes\/x\.ipynb/)
})

test('an unknown mode is treated as warn rather than silently blocking', () => {
  const out = decide(evt('src/api/users.ts'), { ...warn, mode: 'nonsense' })
  assert.equal(out.hookSpecificOutput?.permissionDecision, undefined)
  assert.ok(out.systemMessage)
})

test('a protected file inside the scope is not mislabelled as out of scope', () => {
  const out = decide(evt('src/auth/package.json'), warn)
  assert.doesNotMatch(out.systemMessage, /out of scope/)
  assert.match(out.systemMessage, /protected path/i)
})

test('a file that is both out of scope and protected says out of scope', () => {
  const out = decide(evt('package.json'), warn)
  assert.match(out.systemMessage, /out of scope/)
  assert.match(out.systemMessage, /protected/i)
})
