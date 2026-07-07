/**
 * AI/ML API rebate attribution header.
 *
 * Every request OpenClaude sends to an aimlapi.com base URL is tagged with
 * `X-AIMLAPI-Partner-ID: part_…` so the gateway can credit the referring agent
 * (the AI/ML API Agent Rebate Program). Applied in the OpenAI shim's request
 * header assembly — see `services/api/openaiShim.ts`.
 */

import { DEFAULT_PARTNER_ID } from './config.js'

export const AIMLAPI_PARTNER_HEADER = 'X-AIMLAPI-Partner-ID'

/** True when the base URL points at any aimlapi.com host (prod or staging). */
export function isAimlapiBaseUrl(baseUrl: string | undefined | null): boolean {
  if (!baseUrl) {
    return false
  }
  try {
    return new URL(baseUrl).hostname.endsWith('aimlapi.com')
  } catch {
    return baseUrl.includes('aimlapi.com')
  }
}

/**
 * Partner id to attach for a given request base URL, or `undefined` when the
 * request is not going to AI/ML API. Overridable via `AIMLAPI_PARTNER_ID`;
 * defaults to the OpenClaude partner id so attribution works even when the
 * provider was configured by hand.
 */
export function resolveAimlapiPartnerId(baseUrl: string | undefined | null): string | undefined {
  if (!isAimlapiBaseUrl(baseUrl)) {
    return undefined
  }
  const configured = process.env.AIMLAPI_PARTNER_ID?.trim()
  return configured && configured.length > 0 ? configured : DEFAULT_PARTNER_ID
}
