#!/usr/bin/env node
// A stand-in for a coding agent, used only to record the demo.
// It does exactly what Claude Code does: fire the PreToolUse hook with a real
// event, print whatever the hook says, then perform the write. The hook and its
// output are the real thing. Only the agent is fake.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const [hook, session, ...files] = process.argv.slice(2)
const root = process.cwd()

for (const rel of files) {
  const abs = path.join(root, rel)
  const event = {
    session_id: session,
    hook_event_name: 'PreToolUse',
    cwd: root,
    tool_name: 'Edit',
    tool_input: { file_path: abs },
  }
  const out = execFileSync('node', [hook], { input: JSON.stringify(event), encoding: 'utf8' })
  if (out.trim()) {
    const parsed = JSON.parse(out)
    if (parsed.systemMessage) console.log('\n' + parsed.systemMessage + '\n')
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, `// rewritten by the agent\n`)
  console.log(`  edited ${rel}`)
}
