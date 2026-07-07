import { defineGateway } from '../define.js'

const AIMLAPI_CHAT_MODEL_TYPES = new Set([
  'openai/chat-completions',
  'chat-completion',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getTrimmedString(
  record: Record<string, unknown> | null,
  key: string,
): string | undefined {
  const value = record?.[key]
  return typeof value === 'string' ? value.trim() : undefined
}

function mapAimlapiModel(raw: unknown) {
  if (!isRecord(raw)) {
    return null
  }

  const id = getTrimmedString(raw, 'id')
  const type = getTrimmedString(raw, 'type')
  if (!id || !type || !AIMLAPI_CHAT_MODEL_TYPES.has(type)) {
    return null
  }

  const info = isRecord(raw.info) ? raw.info : null
  const developer =
    getTrimmedString(info, 'developer') || getTrimmedString(raw, 'developer')
  const displayName = getTrimmedString(info, 'name')
  const label = displayName
    ? developer && !displayName.includes(`(${developer})`)
      ? `${displayName} (${developer})`
      : displayName
    : id
  const contextLength =
    typeof info?.contextLength === 'number'
      ? info.contextLength
      : typeof raw.contextLength === 'number'
        ? raw.contextLength
        : undefined

  return {
    id,
    apiName: id,
    label,
    ...(typeof contextLength === 'number' && contextLength > 0
      ? { contextWindow: contextLength }
      : {}),
  }
}

export default defineGateway({
  id: 'aimlapi',
  label: 'AI/ML API',
  category: 'aggregating',
  defaultBaseUrl: 'https://api.aimlapi.com/v1',
  defaultModel: 'gpt-4o',
  supportsModelRouting: true,
  vendorId: 'openai',
  setup: {
    requiresAuth: true,
    authMode: 'api-key',
    credentialEnvVars: ['AIMLAPI_API_KEY', 'OPENAI_API_KEYS', 'OPENAI_API_KEY'],
  },
  startup: {
    probeReadiness: 'openai-compatible-models',
  },
  transportConfig: {
    kind: 'openai-compatible',
    openaiShim: {
      defaultAuthHeader: { name: 'authorization', scheme: 'bearer' },
    },
  },
  preset: {
    id: 'aimlapi',
    description:
      'AI/ML API — 600+ models via one OpenAI-compatible endpoint (run `openclaude aimlapi topup` to set up)',
    apiKeyEnvVars: ['AIMLAPI_API_KEY'],
    label: 'AI/ML API',
    name: 'AI/ML API',
    modelEnvVars: ['OPENAI_MODEL'],
    baseUrlEnvVars: ['AIMLAPI_BASE_URL', 'OPENAI_BASE_URL'],
    fallbackBaseUrl: 'https://api.aimlapi.com/v1',
    fallbackModel: 'gpt-4o',
    vendorId: 'openai',
  },
  validation: {
    kind: 'credential-env',
    credentialEnvVars: ['AIMLAPI_API_KEY', 'OPENAI_API_KEYS', 'OPENAI_API_KEY'],
    missingCredentialMessage:
      'An AI/ML API key is required.\n' +
      'Run `openclaude aimlapi topup` to log in, top up your balance, and set a key automatically — ' +
      'or paste an existing key from https://aimlapi.com/app/keys as AIMLAPI_API_KEY.',
    routing: {
      matchBaseUrlHosts: [
        'api.aimlapi.com',
        'api-staging.aimlapi.com',
        'ai.aimlapi.com',
        'ai-staging.aimlapi.com',
      ],
    },
  },
  catalog: {
    source: 'hybrid',
    discovery: {
      kind: 'openai-compatible',
      requiresAuth: false,
      mapModel: mapAimlapiModel,
    },
    discoveryCacheTtl: '1d',
    discoveryRefreshMode: 'startup',
    allowManualRefresh: true,
    models: [
      {
        id: 'aimlapi-gpt-4o',
        apiName: 'gpt-4o',
        label: 'GPT-4o',
        modelDescriptorId: 'gpt-4o',
      },
    ],
  },
  usage: { supported: false },
})
