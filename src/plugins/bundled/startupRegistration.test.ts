import { expect, test } from 'bun:test'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { AIMLAPI_MCP_BUILTIN_PLUGIN_SOURCE } from '../../integrations/aimlapi/config.js'

const cliPath = resolve(import.meta.dir, '../../../dist/cli.mjs')
const CHILD_TIMEOUT_MS = 30_000
const DISCOVERY_LINE = /Found \d+ plugins \((\d+) enabled/

/**
 * Start a fresh print-mode session whose stdin is a pipe that never delivers
 * input, and return the enabled count of the session's FIRST plugin discovery.
 * That discovery is memoized, and the pending stdin keeps getInputPrompt()
 * waiting while it completes, so a built-in plugin registered after it is
 * missing from the whole session.
 */
function firstDiscoveryEnabledCount(withAimlapiKey: boolean): Promise<number> {
  const configDir = mkdtempSync(join(tmpdir(), 'openclaude-builtin-startup-'))
  writeFileSync(
    join(configDir, 'settings.json'),
    JSON.stringify({
      enabledPlugins: { [AIMLAPI_MCP_BUILTIN_PLUGIN_SOURCE]: true },
    }),
  )
  const env: Record<string, string | undefined> = {
    ...process.env,
    OPENCLAUDE_CONFIG_DIR: configDir,
    OPENCLAUDE_DISABLE_TELEMETRY: '1',
  }
  // The child must run its entrypoint as a plain print-mode session.
  for (const name of [
    'OPENCLAUDE_DISABLE_CLI_ENTRYPOINT_AUTO_RUN',
    'CLAUDE_CODE_ENTRYPOINT',
    'CLAUDE_CODE_SIMPLE',
    'CLAUDE_CODE_SYNC_PLUGIN_INSTALL',
    'CLAUDE_CODE_PROVIDER_ROUTE_ID',
    'CLAUDE_CODE_USE_OPENAI',
    'OPENAI_BASE_URL',
    'OPENAI_API_BASE',
    'AIMLAPI_API_KEY',
  ]) {
    delete env[name]
  }
  if (withAimlapiKey) env.AIMLAPI_API_KEY = 'aimlapi-test-key-not-real'

  return new Promise((resolveCount, reject) => {
    const child = spawn('node', [cliPath, '-p', '--debug-to-stderr'], {
      cwd: configDir,
      env,
      // stdin stays open and silent: the delayed, non-TTY input case.
      stdio: ['pipe', 'ignore', 'pipe'],
    })
    let stderr = ''
    let settled = false
    const finish = (result: number | Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill('SIGKILL')
      rmSync(configDir, { recursive: true, force: true })
      if (result instanceof Error) reject(result)
      else resolveCount(result)
    }
    const timer = setTimeout(
      () =>
        finish(new Error(`No plugin discovery was logged:\n${stderr}`)),
      CHILD_TIMEOUT_MS,
    )
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
      const match = DISCOVERY_LINE.exec(stderr)
      if (match) finish(Number(match[1]))
    })
    child.once('error', finish)
    // 'close' fires after stderr is drained, so a line logged just before an
    // exit is still matched above first.
    child.once('close', code =>
      finish(
        new Error(
          `The CLI exited (${code}) before logging plugin discovery:\n${stderr}`,
        ),
      ),
    )
  })
}

test('an enabled built-in plugin is in the first discovery of a session with pending piped input', async () => {
  if (!existsSync(cliPath)) return // needs `bun run build`; always present in CI

  // The same settings enable aimlapi@builtin in both runs; it is available
  // only when AIMLAPI_API_KEY is set. Comparing the two keeps the assertion
  // independent of any other built-in plugin's default state.
  const [withKey, withoutKey] = await Promise.all([
    firstDiscoveryEnabledCount(true),
    firstDiscoveryEnabledCount(false),
  ])

  expect(withKey).toBe(withoutKey + 1)
}, 2 * CHILD_TIMEOUT_MS)
