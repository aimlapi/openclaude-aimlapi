import { afterEach, beforeEach, expect, mock, test } from 'bun:test'

import {
  AIMLAPI_MCP_BUILTIN_PLUGIN_SOURCE,
  AIMLAPI_MCP_URL,
  DEFAULT_PARTNER_ID,
  hasAimlapiMcpCredential,
} from '../../integrations/aimlapi/config.js'
import { getMcpServerHeaders } from '../../services/mcp/headersHelper.js'
import type {
  McpHTTPServerConfig,
  ScopedMcpServerConfig,
} from '../../services/mcp/types.js'
import {
  acquireSharedMutationLock,
  releaseSharedMutationLock,
} from '../../test/sharedMutationLock.js'
import { getPluginMcpServers } from '../../utils/plugins/mcpPluginIntegration.js'
import {
  clearPluginCache,
  loadAllPluginsCacheOnly,
} from '../../utils/plugins/pluginLoader.js'
import { applyProviderProfileToProcessEnv } from '../../utils/providerProfiles.js'
import {
  resetSettingsCache,
  setSessionSettingsCache,
} from '../../utils/settings/settingsCache.js'
import type { SettingsJson } from '../../utils/settings/types.js'
import { clearBuiltinPlugins, getBuiltinPlugins } from '../builtinPlugins.js'
import {
  AIMLAPI_MCP_PLUGIN_NAME,
  registerAimlapiMcpPlugin,
} from './aimlapiMcp.js'

const PLUGIN_ID = `${AIMLAPI_MCP_PLUGIN_NAME}@builtin`
const SERVER_KEY = `plugin:${AIMLAPI_MCP_PLUGIN_NAME}:aimlapi`
const TEST_KEY = 'aimlapi-test-key-not-real'
const PROXY_KEY = 'proxy-test-credential-not-real'
const envNames = [
  'AIMLAPI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_API_BASE',
  'CLAUDE_CODE_PROVIDER_ROUTE_ID',
] as const
const originalEnv = Object.fromEntries(
  envNames.map(name => [name, process.env[name]]),
)

// Test files share a process, and an earlier file can leave its own
// settings.js mock registered. Built-in plugins read their enabled state
// through getSettings_DEPRECATED, so pin it to this file's settings and put
// the real module back after each test.
const realSettings = {
  ...await import(`../../utils/settings/settings.js?real=${Date.now()}-${Math.random()}`),
} as typeof import('../../utils/settings/settings.js')

let settingsForTest: SettingsJson = {}

function useEnabledPlugins(enabledPlugins?: Record<string, boolean>): void {
  settingsForTest = enabledPlugins ? { enabledPlugins } : {}
  setSessionSettingsCache({ settings: settingsForTest, errors: [] })
}

beforeEach(async () => {
  await acquireSharedMutationLock('plugins/bundled/aimlapiMcp.test.ts')
  settingsForTest = {}
  mock.module('../../utils/settings/settings.js', () => ({
    ...realSettings,
    getSettings_DEPRECATED: () => settingsForTest,
  }))
  for (const name of envNames) delete process.env[name]
  registerAimlapiMcpPlugin()
})

afterEach(() => {
  try {
    // A test that ran plugin discovery leaves its memoized result behind;
    // drop it so no later test or file sees this file's built-in plugin.
    clearPluginCache()
    clearBuiltinPlugins()
    mock.module('../../utils/settings/settings.js', () => realSettings)
    resetSettingsCache()
    settingsForTest = {}
    for (const name of envNames) {
      const value = originalEnv[name]
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  } finally {
    releaseSharedMutationLock()
  }
})

test('stays disabled when an AIMLAPI key is present but the user has not opted in', () => {
  process.env.AIMLAPI_API_KEY = TEST_KEY
  useEnabledPlugins()

  const { enabled, disabled } = getBuiltinPlugins()

  expect(enabled.map(plugin => plugin.name)).not.toContain(
    AIMLAPI_MCP_PLUGIN_NAME,
  )
  expect(disabled.map(plugin => plugin.name)).toContain(AIMLAPI_MCP_PLUGIN_NAME)
})

test('enabling the plugin exposes the MCP server with the configured key and attribution', async () => {
  process.env.AIMLAPI_API_KEY = TEST_KEY
  useEnabledPlugins({ [PLUGIN_ID]: true })

  const plugin = getBuiltinPlugins().enabled.find(
    candidate => candidate.name === AIMLAPI_MCP_PLUGIN_NAME,
  )
  expect(plugin).toBeDefined()

  const servers = await getPluginMcpServers(plugin!)
  const server = servers?.[`plugin:${AIMLAPI_MCP_PLUGIN_NAME}:aimlapi`] as
    | McpHTTPServerConfig
    | undefined
  expect(server?.type).toBe('http')
  expect(server?.url).toBe(AIMLAPI_MCP_URL)

  expect(await getMcpServerHeaders('plugin:aimlapi:aimlapi', server!)).toEqual({
    Authorization: `Bearer ${TEST_KEY}`,
    'X-AIMLAPI-Partner-ID': DEFAULT_PARTNER_ID,
    'X-AIMLAPI-Source': 'agent/openclaude',
  })
})

test('a pooled AIMLAPI_API_KEY sends only its first key to the MCP server', async () => {
  process.env.AIMLAPI_API_KEY = `${TEST_KEY}, aimlapi-second-key-not-real`
  useEnabledPlugins({ [PLUGIN_ID]: true })

  const plugin = getBuiltinPlugins().enabled.find(
    candidate => candidate.name === AIMLAPI_MCP_PLUGIN_NAME,
  )
  const servers = await getPluginMcpServers(plugin!)
  const server = servers?.[`plugin:${AIMLAPI_MCP_PLUGIN_NAME}:aimlapi`] as
    | McpHTTPServerConfig
    | undefined

  expect(
    (await getMcpServerHeaders('plugin:aimlapi:aimlapi', server!)).Authorization,
  ).toBe(`Bearer ${TEST_KEY}`)
})

test('the stored server config references the key instead of embedding it', () => {
  process.env.AIMLAPI_API_KEY = TEST_KEY
  useEnabledPlugins({ [PLUGIN_ID]: true })

  const plugin = getBuiltinPlugins().enabled.find(
    candidate => candidate.name === AIMLAPI_MCP_PLUGIN_NAME,
  )
  const serialized = JSON.stringify(plugin?.mcpServers)

  expect(serialized).toContain('${AIMLAPI_API_KEY}')
  expect(serialized).not.toContain(TEST_KEY)
})

test('is hidden without an AIMLAPI key even when enabled', () => {
  useEnabledPlugins({ [PLUGIN_ID]: true })

  const { enabled, disabled } = getBuiltinPlugins()

  expect(
    [...enabled, ...disabled].map(plugin => plugin.name),
  ).not.toContain(AIMLAPI_MCP_PLUGIN_NAME)
})

test('withholds a credential the aimlapi route exported for a proxy base URL', () => {
  expect(hasAimlapiMcpCredential({ AIMLAPI_API_KEY: TEST_KEY })).toBe(true)
  expect(hasAimlapiMcpCredential({ AIMLAPI_API_KEY: '  ' })).toBe(false)
  expect(hasAimlapiMcpCredential({ AIMLAPI_API_KEY: 'null' })).toBe(false)
  expect(
    hasAimlapiMcpCredential({
      AIMLAPI_API_KEY: TEST_KEY,
      CLAUDE_CODE_PROVIDER_ROUTE_ID: 'aimlapi',
      OPENAI_API_BASE: 'https://proxy.example.test/v1',
    }),
  ).toBe(false)
  expect(
    hasAimlapiMcpCredential({
      AIMLAPI_API_KEY: TEST_KEY,
      CLAUDE_CODE_PROVIDER_ROUTE_ID: 'aimlapi',
      OPENAI_BASE_URL: 'https://api.aimlapi.com/v1',
    }),
  ).toBe(true)
  expect(
    hasAimlapiMcpCredential({
      AIMLAPI_API_KEY: TEST_KEY,
      CLAUDE_CODE_PROVIDER_ROUTE_ID: 'aimlapi',
      OPENAI_BASE_URL: 'https://proxy.example.test/v1',
    }),
  ).toBe(false)
  // Another provider's base URL does not make an exported AIMLAPI key a proxy one.
  expect(
    hasAimlapiMcpCredential({
      AIMLAPI_API_KEY: TEST_KEY,
      CLAUDE_CODE_PROVIDER_ROUTE_ID: 'openrouter',
      OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
    }),
  ).toBe(true)
})

async function withRestoredProcessEnv(
  run: () => void | Promise<void>,
): Promise<void> {
  const snapshot = { ...process.env }
  try {
    await run()
  } finally {
    for (const name of Object.keys(process.env)) {
      if (!(name in snapshot)) delete process.env[name]
    }
    Object.assign(process.env, snapshot)
  }
}

test('a saved aimlapi.com provider profile supplies the key without exporting it', async () => {
  await withRestoredProcessEnv(() => {
    applyProviderProfileToProcessEnv({
      id: 'provider_aimlapi',
      name: 'AI/ML API',
      provider: 'aimlapi',
      baseUrl: 'https://api.aimlapi.com/v1',
      model: 'gpt-4o',
      apiKey: TEST_KEY,
    })

    expect(process.env.AIMLAPI_API_KEY).toBe(TEST_KEY)
    expect(hasAimlapiMcpCredential()).toBe(true)
  })
})

test('a saved aimlapi profile retargeted to a proxy never offers its credential', async () => {
  await withRestoredProcessEnv(() => {
    applyProviderProfileToProcessEnv({
      id: 'provider_aimlapi_proxy',
      name: 'AI/ML API Proxy',
      provider: 'aimlapi',
      baseUrl: 'https://proxy.example.test/v1',
      model: 'gpt-4o',
      apiKey: 'proxy-credential',
    })

    expect(process.env.AIMLAPI_API_KEY).toBe('proxy-credential')
    expect(hasAimlapiMcpCredential()).toBe(false)
  })
})

const canonicalProfile = {
  id: 'provider_aimlapi',
  name: 'AI/ML API',
  provider: 'aimlapi',
  baseUrl: 'https://api.aimlapi.com/v1',
  model: 'gpt-4o',
  apiKey: TEST_KEY,
} as const

const proxyProfile = {
  id: 'provider_aimlapi_proxy',
  name: 'AI/ML API Proxy',
  provider: 'aimlapi',
  baseUrl: 'https://proxy.example.test/v1',
  model: 'gpt-4o',
  apiKey: PROXY_KEY,
} as const

/**
 * The plugin part of getClaudeCodeMcpConfigs(): memoized discovery, then a
 * fresh resolution of every enabled plugin's MCP servers.
 */
async function rebuildPluginMcpServer(): Promise<
  McpHTTPServerConfig | undefined
> {
  const { enabled } = await loadAllPluginsCacheOnly()
  const servers: Record<string, ScopedMcpServerConfig> = {}
  for (const resolved of await Promise.all(
    enabled.map(plugin => getPluginMcpServers(plugin)),
  )) {
    if (resolved) Object.assign(servers, resolved)
  }
  return servers[SERVER_KEY] as McpHTTPServerConfig | undefined
}

test('the plugin server carries the builtin plugin source the connection guard checks', async () => {
  process.env.AIMLAPI_API_KEY = TEST_KEY
  useEnabledPlugins({ [PLUGIN_ID]: true })

  const plugin = getBuiltinPlugins().enabled.find(
    candidate => candidate.name === AIMLAPI_MCP_PLUGIN_NAME,
  )
  const servers = await getPluginMcpServers(plugin!)

  expect(PLUGIN_ID).toBe(AIMLAPI_MCP_BUILTIN_PLUGIN_SOURCE)
  expect(servers?.[SERVER_KEY]?.pluginSource).toBe(
    AIMLAPI_MCP_BUILTIN_PLUGIN_SOURCE,
  )
})

test('a switch to a proxy profile after cached discovery never resolves or sends the proxy credential', async () => {
  // Start from a cold discovery cache; nothing below clears it again.
  clearPluginCache()
  useEnabledPlugins({ [PLUGIN_ID]: true })

  await withRestoredProcessEnv(async () => {
    applyProviderProfileToProcessEnv(canonicalProfile)
    expect(hasAimlapiMcpCredential()).toBe(true)

    // Positive control: the canonical key reaches the MCP host.
    const canonical = await rebuildPluginMcpServer()
    expect(canonical?.url).toBe(AIMLAPI_MCP_URL)
    expect(canonical?.headers?.Authorization).toBe(`Bearer ${TEST_KEY}`)
    expect(
      (await getMcpServerHeaders(SERVER_KEY, canonical!)).Authorization,
    ).toBe(`Bearer ${TEST_KEY}`)

    // /provider switches to an aimlapi profile whose base URL and key belong
    // to a proxy. The memoized discovery still lists the enabled plugin...
    applyProviderProfileToProcessEnv(proxyProfile)
    expect(process.env.AIMLAPI_API_KEY).toBe(PROXY_KEY)
    expect(
      (await loadAllPluginsCacheOnly()).enabled.map(plugin => plugin.name),
    ).toContain(AIMLAPI_MCP_PLUGIN_NAME)

    // ...but a rebuilt MCP configuration (as after /clear) has no server for
    // it, so the proxy credential is never resolved into one.
    const rebuilt = await rebuildPluginMcpServer()
    expect(rebuilt).toBeUndefined()

    // A config resolved before the switch is not connected either while the
    // session's key belongs to the proxy.
    await expect(getMcpServerHeaders(SERVER_KEY, canonical!)).rejects.toThrow(
      AIMLAPI_MCP_BUILTIN_PLUGIN_SOURCE,
    )

    // Back on the canonical profile the same cached plugin resolves again.
    applyProviderProfileToProcessEnv(canonicalProfile)
    const restored = await rebuildPluginMcpServer()
    expect(restored?.headers?.Authorization).toBe(`Bearer ${TEST_KEY}`)
    expect(
      (await getMcpServerHeaders(SERVER_KEY, restored!)).Authorization,
    ).toBe(`Bearer ${TEST_KEY}`)
  })
})

test('the connection guard leaves a hand-added server on the MCP host alone', async () => {
  process.env.AIMLAPI_API_KEY = PROXY_KEY
  process.env.CLAUDE_CODE_PROVIDER_ROUTE_ID = 'aimlapi'
  process.env.OPENAI_BASE_URL = 'https://proxy.example.test/v1'
  expect(hasAimlapiMcpCredential()).toBe(false)

  // Explicit authentication on a server the user added is their choice.
  const headers = await getMcpServerHeaders('aimlapi', {
    type: 'http',
    url: AIMLAPI_MCP_URL,
    headers: { Authorization: 'Bearer user-chosen-key' },
  })
  expect(headers.Authorization).toBe('Bearer user-chosen-key')
})

test('a line-broken AIMLAPI_API_KEY pool reaches the MCP server as one header-safe key', async () => {
  process.env.AIMLAPI_API_KEY = `${TEST_KEY},\r\naimlapi-second-key-not-real`
  useEnabledPlugins({ [PLUGIN_ID]: true })

  const plugin = getBuiltinPlugins().enabled.find(
    candidate => candidate.name === AIMLAPI_MCP_PLUGIN_NAME,
  )
  expect(plugin).toBeDefined()
  const servers = await getPluginMcpServers(plugin!)
  const headers = await getMcpServerHeaders(
    SERVER_KEY,
    servers![SERVER_KEY] as McpHTTPServerConfig,
  )

  expect(headers.Authorization).toBe(`Bearer ${TEST_KEY}`)
  expect(() => new Headers(headers)).not.toThrow()
})
