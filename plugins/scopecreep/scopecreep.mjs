#!/usr/bin/env node
// scopecreep: warns when a coding agent writes outside the scope you declared.
// No dependencies. Read it before you run it.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'

export const DEFAULTS = {
  scope: [],
  protected: ['package.json', 'package-lock.json', '.env*', 'migrations/**', '.github/**'],
  mode: 'warn',
}

const STORE = '.scopecreep'

export function normalize(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '')
}

export function globToRegExp(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*'
        i++
      } else {
        re += '[^/]*'
      }
    } else if (c === '?') {
      re += '[^/]'
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp('^' + re + '$')
}

export function matchesAny(relPath, patterns) {
  if (!patterns || patterns.length === 0) return false
  const p = normalize(relPath)
  const base = p.split('/').pop()
  return patterns.some((pattern) => {
    const re = globToRegExp(pattern)
    if (re.test(p)) return true
    return !pattern.includes('/') && re.test(base)
  })
}

// Resolve symlinks as far down as the path actually exists, then re-attach the
// rest. The project root and the written path can arrive expressed differently:
// on macOS Claude Code reports cwd as /private/var/... while the tool reports
// the file as /var/..., and /var is a symlink to /private/var. Comparing the
// raw strings makes every write look out of scope.
function resolveAsFarAsItExists(p, base) {
  // base, not process.cwd(): the hook runs from wherever the agent happens to
  // be, which is not necessarily the project it is editing.
  const abs = path.isAbsolute(p) ? path.normalize(p) : path.resolve(base || process.cwd(), p)
  let head = abs
  const tail = []
  for (;;) {
    try {
      return path.join(fs.realpathSync(head), ...tail)
    } catch {
      const parent = path.dirname(head)
      if (parent === head) return abs
      tail.unshift(path.basename(head))
      head = parent
    }
  }
}

export function toRelative(filePath, projectRoot) {
  if (!projectRoot) return normalize(filePath)
  const p = resolveAsFarAsItExists(filePath, projectRoot).replace(/\\/g, '/')
  const root = resolveAsFarAsItExists(projectRoot).replace(/\\/g, '/').replace(/\/+$/, '')
  if (p === root) return ''
  if (p.startsWith(root + '/')) return p.slice(root.length + 1)
  // Outside the project entirely, the ~/.zshrc case. Keep it absolute, or undo
  // would rebuild the path under the repo root and leave a stray file there.
  return p
}

function absoluteTarget(root, rel) {
  return /^(\/|[a-zA-Z]:\/)/.test(rel) ? rel : path.join(root, rel)
}

export function classify(filePath, config, projectRoot) {
  const rel = toRelative(filePath, projectRoot)
  const scope = config.scope || []
  return {
    inScope: scope.length === 0 ? true : matchesAny(rel, scope),
    protected: matchesAny(rel, config.protected || []),
  }
}

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

export function targetPath(event) {
  if (!WRITE_TOOLS.has(event.tool_name)) return null
  const input = event.tool_input || {}
  return input.file_path || input.notebook_path || null
}

export function formatWarning(rel, verdict, config) {
  const header = verdict.inScope ? 'scopecreep  ·  protected path' : 'scopecreep  ·  out of scope'
  const lines = [header, '', `    W  ${rel}`]
  if (verdict.protected) {
    lines.push('', '  that path is protected. one quiet edit here costs you an afternoon.')
  }
  const scope = (config.scope || []).join(', ')
  if (scope && !verdict.inScope) lines.push('', `  scope: ${scope}`)
  return lines.join('\n')
}

export function decide(event, config) {
  const filePath = targetPath(event)
  if (!filePath) return null

  const root = config.root || event.cwd
  const rel = toRelative(filePath, root)
  const verdict = classify(filePath, config, root)
  if (verdict.inScope && !verdict.protected) return null

  const reason = verdict.protected
    ? `${rel} is a protected path in scopecreep.json`
    : `${rel} falls outside the declared scope (${(config.scope || []).join(', ')})`

  if (config.mode === 'block') {
    return {
      systemMessage: formatWarning(rel, verdict, config),
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
        additionalContext:
          `scopecreep blocked this write. ${reason}. ` +
          'Either work inside the scope, or ask the user to widen it in scopecreep.json.',
      },
    }
  }

  return { systemMessage: formatWarning(rel, verdict, config) }
}

function readConfigFile(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

// Root first so a plugin install works in a repo with no .claude directory,
// then the old location so anyone who copied the files by hand keeps working.
export function loadConfig(root) {
  const user =
    readConfigFile(path.join(root, 'scopecreep.json')) ||
    readConfigFile(path.join(root, '.claude', 'scopecreep.json')) ||
    {}
  return {
    scope: Array.isArray(user.scope) ? user.scope : DEFAULTS.scope,
    protected: Array.isArray(user.protected) ? user.protected : DEFAULTS.protected,
    mode: user.mode === 'block' ? 'block' : DEFAULTS.mode,
    root,
  }
}

export function snapshotFile(root, absPath) {
  let content
  try {
    content = fs.readFileSync(absPath)
  } catch {
    return { existed: false, hash: null }
  }
  const hash = crypto.createHash('sha256').update(content).digest('hex')
  const dir = path.join(root, STORE, 'snapshots')
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, hash)
  if (!fs.existsSync(dest)) fs.writeFileSync(dest, content)
  return { existed: true, hash }
}

export function recordWrite(root, entry) {
  const dir = path.join(root, STORE)
  fs.mkdirSync(dir, { recursive: true })
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry })
  fs.appendFileSync(path.join(dir, 'ledger.jsonl'), line + '\n')
}

export function readLedger(root) {
  let raw
  try {
    raw = fs.readFileSync(path.join(root, STORE, 'ledger.jsonl'), 'utf8')
  } catch {
    return []
  }
  const out = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line))
    } catch {
      // a partially written line is not worth crashing over
    }
  }
  return out
}

export function undo(root, taskPrefix, options = {}) {
  // An empty prefix matches every task. Undoing everything by accident is a
  // worse outcome than doing nothing.
  const prefix = String(taskPrefix ?? '').trim()
  if (!prefix) return { restored: [], removed: [] }
  const entries = readLedger(root).filter((e) => String(e.task || '').startsWith(prefix))
  const wanted = options.oosOnly ? entries.filter((e) => !e.inScope) : entries

  const first = new Map()
  for (const e of wanted) {
    if (!e.rel || typeof e.rel !== 'string') continue
    if (!first.has(e.rel)) first.set(e.rel, e)
  }

  const restored = []
  const removed = []
  for (const [rel, entry] of first) {
    const abs = absoluteTarget(root, rel)
    const snap = entry.snapshot || {}
    if (snap.existed && snap.hash) {
      const blob = path.join(root, STORE, 'snapshots', snap.hash)
      if (!fs.existsSync(blob)) continue
      fs.mkdirSync(path.dirname(abs), { recursive: true })
      fs.copyFileSync(blob, abs)
      restored.push(rel)
    } else {
      try {
        fs.unlinkSync(abs)
        removed.push(rel)
      } catch {
        // already gone, nothing to undo
      }
    }
  }
  return { restored, removed }
}

const OPENCODE_TOOLS = { write: 'Write', edit: 'Edit', patch: 'Edit' }

export function fromOpencode(tool, args, root) {
  return {
    tool_name: OPENCODE_TOOLS[tool] || tool,
    tool_input: { file_path: (args && args.filePath) || null },
    cwd: root,
  }
}


export function summarize(entries) {
  const byTask = new Map()
  for (const e of entries) {
    const row = byTask.get(e.task) || { task: e.task, inScope: 0, outOfScope: 0, at: e.at }
    if (e.inScope) row.inScope++
    else row.outOfScope++
    if (e.at > row.at) row.at = e.at
    byTask.set(e.task, row)
  }
  return [...byTask.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}


function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

export function main() {
  let event
  try {
    event = JSON.parse(readStdin())
  } catch {
    return
  }
  if (!event || typeof event !== 'object') return

  const root = event.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd()
  const config = loadConfig(root)
  const filePath = targetPath(event)
  if (!filePath) return

  const verdict = classify(filePath, config, root)
  const output = decide(event, config)
  const blocked = output?.hookSpecificOutput?.permissionDecision === 'deny'

  if (!blocked) {
    // The ledger is a nice-to-have. The warning is the whole point, so a
    // read-only checkout or a wedged .scopecreep directory must not silence it.
    try {
      recordWrite(root, {
        task: event.session_id || 'unknown',
        tool: event.tool_name,
        rel: toRelative(filePath, root),
        inScope: verdict.inScope,
        protected: verdict.protected,
        snapshot: snapshotFile(root, filePath),
      })
    } catch {
      // nothing to do about it here, and nothing worth breaking the session for
    }
  }

  if (output) process.stdout.write(JSON.stringify(output))
}

// import.meta.url is already symlink resolved, so the argv side has to be too.
// Without realpathSync this silently never fires on macOS, where /var is a
// symlink to /private/var and every mktemp path goes through it.
function invokedDirectly() {
  if (!process.argv[1]) return false
  try {
    return import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href
  } catch {
    return false
  }
}

if (invokedDirectly()) {
  try {
    main()
  } catch {
    // a hook that throws breaks the session it was meant to protect
  }
  process.exit(0)
}
