import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fromOpencode, decide } from '../.claude/scopecreep.mjs'

const root = '/home/me/proj'
const cfg = { scope: ['src/auth/**'], protected: ['package.json'], mode: 'warn' }

test('an opencode write is translated into the shape the core already understands', () => {
  const event = fromOpencode('write', { filePath: `${root}/src/api/users.ts` }, root)
  assert.equal(event.tool_name, 'Write')
  assert.equal(event.tool_input.file_path, `${root}/src/api/users.ts`)
  assert.equal(event.cwd, root)
})

test('an opencode edit maps to the Edit tool', () => {
  assert.equal(fromOpencode('edit', { filePath: 'x' }, root).tool_name, 'Edit')
})

test('an opencode tool that does not write files maps to nothing decidable', () => {
  assert.equal(decide(fromOpencode('bash', { command: 'ls' }, root), cfg), null)
})

test('the same out of scope write is caught through the opencode adapter', () => {
  const out = decide(fromOpencode('write', { filePath: `${root}/src/api/users.ts` }, root), cfg)
  assert.match(out.systemMessage, /src\/api\/users\.ts/)
})

test('the opencode adapter tolerates a missing filePath', () => {
  assert.equal(decide(fromOpencode('write', {}, root), cfg), null)
})
