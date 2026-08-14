// scopecreep for opencode. Same core as the Claude Code hook, different adapter.
// Drop this file in .opencode/plugins/ alongside a .claude/scopecreep.mjs.
import {
  loadConfig,
  classify,
  decide,
  fromOpencode,
  recordWrite,
  snapshotFile,
  toRelative,
} from '../../.claude/scopecreep.mjs'

export const ScopeCreep = async ({ directory }) => {
  const root = directory || process.cwd()
  const config = loadConfig(root)

  return {
    'tool.execute.before': async (input, output) => {
      const event = fromOpencode(input.tool, output && output.args, root)
      const filePath = event.tool_input.file_path
      if (!filePath) return

      const result = decide(event, config)
      if (!result) return

      const denied = result.hookSpecificOutput?.permissionDecision === 'deny'
      if (denied) throw new Error(result.hookSpecificOutput.permissionDecisionReason)

      const verdict = classify(filePath, config, root)
      recordWrite(root, {
        task: 'opencode',
        tool: input.tool,
        rel: toRelative(filePath, root),
        inScope: verdict.inScope,
        protected: verdict.protected,
        snapshot: snapshotFile(root, filePath),
      })
      console.warn(result.systemMessage)
    },
  }
}
