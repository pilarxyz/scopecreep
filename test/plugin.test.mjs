import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const PLUGIN = path.resolve('plugins/scopecreep')
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))

test('the plugin manifest names the plugin and a version', () => {
  const m = read(path.join(PLUGIN, '.claude-plugin/plugin.json'))
  assert.equal(m.name, 'scopecreep')
  assert.match(m.version, /^\d+\.\d+\.\d+$/)
})

test('the plugin version matches the published package version', () => {
  const m = read(path.join(PLUGIN, '.claude-plugin/plugin.json'))
  assert.equal(m.version, read(path.resolve('package.json')).version)
})

test('the hook command points at a file that actually exists in the plugin', () => {
  const h = read(path.join(PLUGIN, 'hooks/hooks.json'))
  const command = h.hooks.PreToolUse[0].hooks[0].command
  const match = command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"']+)/)
  assert.ok(match, `command does not reference CLAUDE_PLUGIN_ROOT: ${command}`)
  assert.equal(fs.existsSync(path.join(PLUGIN, match[1])), true, `${match[1]} missing from plugin`)
})

test('the hook fires on every tool that writes a file', () => {
  const h = read(path.join(PLUGIN, 'hooks/hooks.json'))
  const matcher = h.hooks.PreToolUse[0].matcher
  for (const tool of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']) {
    assert.match(tool, new RegExp(`^(${matcher})$`), `${tool} is not covered by the matcher`)
  }
})

test('the marketplace points at a plugin directory that exists', () => {
  const m = read(path.resolve('.claude-plugin/marketplace.json'))
  for (const p of m.plugins) {
    assert.equal(fs.existsSync(path.resolve(p.source, '.claude-plugin/plugin.json')), true, p.source)
  }
})
