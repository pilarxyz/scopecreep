# scopecreep on opencode

opencode has no `settings.json` hooks, so the wiring is a plugin instead. The
core logic is the same file the Claude Code hook uses.

## Setup

Copy both directories into your repo:

```
.claude/scopecreep.mjs      the core, plus the Claude Code entrypoint
.claude/scopecreep.json     your scope config, shared by both agents
.opencode/plugins/scopecreep.js
```

opencode loads anything in `.opencode/plugins/` at startup. There is nothing to
register.

## What differs from Claude Code

The plugin hooks `tool.execute.before`, which fires for opencode's `write`,
`edit` and `patch` tools. `input.tool` gives the tool name and `output.args.filePath`
gives the path.

In `warn` mode the message goes to stderr rather than into the session
transcript, because opencode plugins have no equivalent of `systemMessage`. You
will see it in the terminal, not in the conversation.

In `block` mode the plugin throws. opencode turns that into a rejected tool call
and the message reaches the model, which is the behaviour we want.

Ledger entries from opencode are recorded under the task id `opencode` rather
than a session id, because the plugin hook does not receive one. That means
`scopecreep undo opencode` reverts across sessions. If you need finer grain,
Claude Code is currently the better fit.
