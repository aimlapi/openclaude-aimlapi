/**
 * AI/ML API (aimlapi.com) integration — endpoint configuration.
 *
 * DRAFT: this wires OpenClaude to the AI/ML API "partner checkout" flow so a
 * user can log in, top up their balance, and have the issued key written back
 * into OpenClaude's provider profile automatically.
 *
 * Defaults target production. Flip with `AIMLAPI_ENV=staging`, or override any single URL via the
 * `AIMLAPI_AUTH_URL` / `AIMLAPI_APP_URL` / `AIMLAPI_INFERENCE_URL` env vars.
 */

export type AimlapiEnvironment = 'staging' | 'production'

export type AimlapiEndpoints = {
  /** app/auth service — mints the user access (Bearer) token. */
  authBaseUrl: string
  /** app/gateway BFF — hosts `/v3/partner-checkout/*`. */
  appBaseUrl: string
  /** OpenAI-compatible inference base URL written into the provider profile. */
  inferenceBaseUrl: string
}

const ENDPOINTS: Record<AimlapiEnvironment, AimlapiEndpoints> = {
  staging: {
    authBaseUrl: 'https://auth-staging.aimlapi.com',
    appBaseUrl: 'https://app-staging.aimlapi.com',
    inferenceBaseUrl: 'https://api-staging.aimlapi.com/v1',
  },
  production: {
    authBaseUrl: 'https://auth.aimlapi.com',
    appBaseUrl: 'https://app.aimlapi.com',
    inferenceBaseUrl: 'https://api.aimlapi.com/v1',
  },
}

/** Partner id (`^part_[A-Za-z0-9]{1,64}$`) — rebate attribution. */
export const DEFAULT_PARTNER_ID = 'part_OpenClaude'
export const DEFAULT_PARTNER_NAME = 'OpenClaude'

/** Default model id written into the profile — override with `--model`. */
export const DEFAULT_MODEL = 'gpt-4o'

/** Top-up bounds enforced by the backend DTO (USD minor units / cents). */
export const MIN_AMOUNT_USD_MINOR = 1000 // $10
export const MAX_AMOUNT_USD_MINOR = 1_000_000 // $10,000
export const DEFAULT_AMOUNT_USD_MINOR = 2500 // $25

export function resolveEnvironment(explicit?: AimlapiEnvironment): AimlapiEnvironment {
  if (explicit) {
    return explicit
  }
  return process.env.AIMLAPI_ENV === 'staging' ? 'staging' : 'production'
}

export function resolveEndpoints(environment: AimlapiEnvironment): AimlapiEndpoints {
  const base = ENDPOINTS[environment]
  return {
    authBaseUrl: process.env.AIMLAPI_AUTH_URL?.trim() || base.authBaseUrl,
    appBaseUrl: process.env.AIMLAPI_APP_URL?.trim() || base.appBaseUrl,
    inferenceBaseUrl: process.env.AIMLAPI_INFERENCE_URL?.trim() || base.inferenceBaseUrl,
  }
}
