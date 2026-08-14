// scopecreep for opencode. Same core as the Claude Code hook, different adapter.
// Drop this file in .opencode/plugins/ alongside plugins/scopecreep/scopecreep.mjs.
import {
  loadConfig,
  classify,
  decide,
  fromOpencode,
  recordWrite,
  snapshotFile,
  targetPath,
  toRelative,
} from '../../plugins/scopecreep/scopecreep.mjs'

export const ScopeCreep = async ({ directory }) => {
  const root = directory || process.cwd()
  const config = loadConfig(root)

  return {
    'tool.execute.before': async (input, output) => {
      const event = fromOpencode(input.tool, output && output.args, root)
      // targetPath, not file_path: it also filters out tools that never write.
      const filePath = targetPath(event)
      if (!filePath) return

      const result = decide(event, config)
      if (result?.hookSpecificOutput?.permissionDecision === 'deny') {
        throw new Error(result.hookSpecificOutput.permissionDecisionReason)
      }

      // Record before warning, and record in scope writes too. Undo without
      // --oos has to be able to reach them.
      // Wrapped: throwing here is how a block is signalled to opencode, so an
      // unwritable ledger would silently start rejecting perfectly fine writes.
      try {
        const verdict = classify(filePath, config, root)
        recordWrite(root, {
          task: 'opencode',
          tool: input.tool,
          rel: toRelative(filePath, root),
          inScope: verdict.inScope,
          protected: verdict.protected,
          snapshot: snapshotFile(root, filePath),
        })
      } catch {
        // the warning below still matters even when the ledger is unavailable
      }

      if (result?.systemMessage) console.warn(result.systemMessage)
    },
  }
}
