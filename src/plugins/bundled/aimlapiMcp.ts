import {
  AIMLAPI_MCP_URL,
  hasAimlapiMcpCredential,
} from '../../integrations/aimlapi/config.js'
import { registerBuiltinPlugin } from '../builtinPlugins.js'

export const AIMLAPI_MCP_PLUGIN_NAME = 'aimlapi'
export const AIMLAPI_MCP_SERVER_NAME = 'aimlapi'

/**
 * The plugin authenticates with the AI/ML API key the user already configured.
 * It is an environment reference, expanded when the server config is loaded,
 * so the key itself is never copied into settings or an MCP config file. An
 * active aimlapi.com provider profile exports its saved key as
 * AIMLAPI_API_KEY for the session, and a user can export it directly.
 */
const AIMLAPI_MCP_AUTHORIZATION = 'Bearer ${AIMLAPI_API_KEY}'

/**
 * Opt-in built-in plugin exposing the AI/ML API MCP server (Toolbox `tools_*`,
 * image/video/audio generation, model and account tools). Disabled by default:
 * Toolbox runs and generations are billed to the user's AI/ML API balance, so
 * a key being present must never connect it on its own. Enable it with
 * `openclaude plugin enable aimlapi@builtin` or from the /plugin UI. Attribution
 * headers are added for the MCP host by `getMcpServerHeaders`.
 */
export function registerAimlapiMcpPlugin(): void {
  registerBuiltinPlugin({
    name: AIMLAPI_MCP_PLUGIN_NAME,
    description:
      'AI/ML API MCP server: Toolbox tools, image/video/audio generation, model and account tools. Uses your AIMLAPI_API_KEY; tool runs and generations are billed to your AI/ML API balance.',
    version: '1.0.0',
    defaultEnabled: false,
    isAvailable: () => hasAimlapiMcpCredential(),
    mcpServers: {
      [AIMLAPI_MCP_SERVER_NAME]: {
        type: 'http',
        url: AIMLAPI_MCP_URL,
        headers: { Authorization: AIMLAPI_MCP_AUTHORIZATION },
      },
    },
  })
}
