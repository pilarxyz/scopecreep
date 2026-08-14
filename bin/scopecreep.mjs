#!/usr/bin/env node
import { readLedger, summarize, undo } from '../plugins/scopecreep/scopecreep.mjs'

const USAGE = `usage: scopecreep <command>

  log                    recent tasks, with writes per task
  show <task-id>         every write from one task, split in and out of scope
  undo <task-id>         revert all of it
  undo <task-id> --oos   revert only what fell outside the scope
`

const root = process.cwd()
const [command, ...rest] = process.argv.slice(2)
const flags = new Set(rest.filter((a) => a.startsWith('--')))
const args = rest.filter((a) => !a.startsWith('--'))

function log() {
  const rows = summarize(readLedger(root))
  if (rows.length === 0) return console.log('no writes recorded yet.')
  for (const r of rows) {
    const when = r.at.replace('T', ' ').slice(0, 16)
    const flag = r.outOfScope > 0 ? '!' : ' '
    console.log(`${flag} ${r.task.padEnd(22)} ${when}   ${r.inScope} in, ${r.outOfScope} out`)
  }
}

function show(taskId) {
  if (!taskId) return console.log(USAGE)
  const entries = readLedger(root).filter((e) => String(e.task).startsWith(taskId))
  if (entries.length === 0) return console.log(`no task matching "${taskId}".`)
  for (const group of [true, false]) {
    const rows = entries.filter((e) => e.inScope === group)
    if (rows.length === 0) continue
    console.log(group ? '\n  in scope' : '\n  out of scope')
    for (const r of rows.filter((r) => r.rel)) console.log(`    ${r.rel}${r.protected ? "   (protected)" : ""}`)
  }
}

function revert(taskId) {
  if (!taskId) return console.log(USAGE)
  const result = undo(root, taskId, { oosOnly: flags.has('--oos') })
  const total = result.restored.length + result.removed.length + result.skipped.length
  if (total === 0) return console.log(`nothing to undo for "${taskId}".`)
  for (const rel of result.restored) console.log(`  restored  ${rel}`)
  for (const rel of result.removed) console.log(`  removed   ${rel}`)
  for (const rel of result.skipped) console.log(`  skipped   ${rel}   no copy of the original`)
}

const commands = { log, show: () => show(args[0]), undo: () => revert(args[0]) }
const run = commands[command]
if (run) run()
else console.log(USAGE)
