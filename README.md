# scopecreep

Scope creep, but the one doing it is your coding agent.

You ask it to fix the login form. It fixes the login form, pulls in two
dependencies, rewrites a file you never mentioned, and deletes something in
`legacy/` that turns out to matter. You find out forty minutes later, halfway
through a diff you no longer recognise.

`scopecreep` is a hook. You drop it into your repo, tell it which paths the agent
is allowed to touch, and it tells you the second it touches anything else.

Two lines to install. No wrapper command, no change to how you invoke anything.
Your agent runs exactly the way it already runs today.

![scopecreep catching an agent writing outside its scope, then undoing it](demo/scopecreep.gif)

The agent in that recording is a stand-in that calls the hook exactly the way
Claude Code does. The hook, everything it prints, and the undo are the real
thing. You can rerun it yourself with `vhs demo/demo.tape`.

## What it looks like

In text, for anyone who would rather read it. Your agent edits a file outside
the scope you declared:

```
scopecreep  ·  out of scope

    W  src/api/users.ts

  scope: src/auth/**
```

Or it reaches for something on the protected list:

```
scopecreep  ·  out of scope

    W  package.json

  that path is protected. one quiet edit here costs you an afternoon.

  scope: src/auth/**
```

That appears in your session while the agent is still working, not in a report
you read afterwards. Every write is logged either way:

```
$ scopecreep log
! 7f3a2c91               2026-08-14 04:41   2 in, 2 out

$ scopecreep show 7f3a

  in scope
    src/auth/login.ts
    src/auth/session.ts

  out of scope
    src/api/users.ts
    package.json   (protected)
```

## Install

Inside Claude Code:

```
/plugin marketplace add pilarxyz/scopecreep
/plugin install scopecreep@scopecreep
```

The plugin carries its own hook, so nothing in your `settings.json` is touched.
If you already have hooks configured, they keep working.

Then tell it what the agent is allowed to touch. Create `scopecreep.json` in your
repo root:

```json
{
  "scope": ["src/auth/**"],
  "protected": ["package.json", ".env*", "migrations/**", ".github/**"],
  "mode": "warn"
}
```

An empty `scope` means everything is in scope, so a fresh install stays quiet
until you actually declare something. Node 20 or newer.

### Without the plugin system

Copy `plugins/scopecreep/scopecreep.mjs` into your repo, then add this entry to
the `PreToolUse` list in your `.claude/settings.json`. Add it. Do not replace the
file: if you already have hooks in there, this goes alongside them.

```json
{
  "matcher": "Write|Edit|MultiEdit|NotebookEdit",
  "hooks": [
    { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/scopecreep.mjs\"" }
  ]
}
```

The hook is 341 lines of Node with no dependencies. It runs on every file
write your agent makes, so read it before you trust it.

## How it works

The hook runs on `PreToolUse`, before the write lands. It resolves the path
against `scope`, snapshots whatever the file contained a moment earlier into
`.scopecreep/snapshots/`, and appends a line to `.scopecreep/ledger.jsonl`.

In `warn` mode nothing is blocked. Switch `mode` to `"block"` and an out of scope
write is rejected before it happens, with the reason handed back to the agent so
it can adjust rather than fail blind.

`protected` paths are called out even when they sit inside your scope. Those are
the files where one quiet edit costs you an afternoon.

Path matching follows gitignore habits closely enough to not surprise you.
`src/auth/**` matches anything below `src/auth`. A pattern with no slash, like
`package.json`, matches that basename at any depth. A pattern with a slash is
anchored to the repo root.

Config is read from `scopecreep.json` at your repo root, falling back to
`.claude/scopecreep.json` if you had it there from an earlier version.

The ledger is plain JSONL, one line per write. It never leaves your machine and
there is no telemetry in here.

## Undo

```bash
npx scopecreep log              # recent tasks, writes per task
npx scopecreep show <task-id>   # every write from one task, split in and out of scope
npx scopecreep undo <task-id>   # revert all of it
npx scopecreep undo <task-id> --oos   # revert only what fell outside the scope
```

Undo restores each file to the state it had before the task's *first* write to
it, and deletes files the task created from nothing. Task ids match on prefix, so
`undo 7f3a` is enough.

The CLI is optional. The hook is the product. If you only want the warning and
would rather handle the rest with git, that works and you can ignore this whole
section.

## Other agents

Claude Code is the one I use, so it is the one that is tested.

opencode works too. `.opencode/plugins/scopecreep.js` wires the same core through
`tool.execute.before`, and blocking works by throwing, which opencode surfaces as
a rejected tool call.

Codex CLI is not possible today, and I would rather say why than leave an
unchecked box sitting there. Codex fires `PreToolUse` and `PostToolUse` on Bash
events only. There is no file write hook to attach to, and the hook engine is
still gated behind `[features].codex_hooks` in `~/.codex/config.toml`. The day it
grows one, this is a twenty line adapter.

Cursor and Gemini CLI look like the same story, though I have checked those less
carefully. If you know where the hook is, open an issue and point me at it.

## What this is not

**It does not see writes made through the shell.** The hook fires on `Write`,
`Edit`, `MultiEdit` and `NotebookEdit`. An agent that appends to a file with a
shell redirect walks straight past it. I tested this rather than assumed it, and
the ledger stays empty. Under default permissions Claude Code edits through the
file tools, so ordinary sessions are covered, but you should know where the edge
is.

**It is not a sandbox.** `"block"` stops file writes outside your scope. It does
nothing about an agent running `rm -rf` through a shell tool, and it never will.
If you need real isolation, run in a container. That is a different problem with
a different answer.

**It is not a cost tracker.** [codeburn](https://www.npmjs.com/package/codeburn)
and [TokenTracker](https://github.com/xiufengsun/TokenTracker) answer the money
question, and they answer it better than I would.

**It is not a reviewer.** It tells you what moved and where. Whether the change is
any good is still on you.

## Why not just read the diff

You can. I did, for months. The problem is that by the time you are reading the
diff, the agent has moved on and you have lost the mapping between "this file
changed" and "this is the task that changed it". Once two or three tasks stack up
in one working tree, working out which one added the dependency is genuinely
annoying. The ledger exists because I got tired of that.

## Known rough edges

- The ledger has no size limit yet. A long session on a big repo will grow it.
- Snapshots are content addressed and never garbage collected. Delete
  `.scopecreep/` when it bothers you.
- `undo` restores file contents. It does not touch git state, so if you have
  already committed, undo will show up as a new working tree change.

## Roadmap

Short on purpose.

- Catch shell writes by diffing the working tree after a Bash call, rather than
  trying to parse the command. Parsing shell is a losing game.
- `block` mode should suggest a scope amendment instead of a flat rejection, so
  the agent has somewhere to go.
- Per task branches, so each run lands somewhere throwaway.
- Ledger pruning.

Nothing here is scheduled. I work on it when it annoys me.

## Development

```bash
node --test test/*.test.mjs
```

97 tests, no dependencies, no build step.

## Contributing

Issues and PRs welcome, especially the boring ones about path matching on
Windows.

If you used an agent to write the PR, that is completely fine. Say so in the
description and tell me which parts you verified by hand. That is all I ask.

## License

MIT
