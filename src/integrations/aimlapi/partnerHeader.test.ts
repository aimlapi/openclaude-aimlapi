import { afterEach, describe, expect, test } from 'bun:test'

import { DEFAULT_PARTNER_ID } from './config.js'
import { isAimlapiBaseUrl, resolveAimlapiPartnerId } from './partnerHeader.js'

const ORIGINAL = process.env.AIMLAPI_PARTNER_ID

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.AIMLAPI_PARTNER_ID
  } else {
    process.env.AIMLAPI_PARTNER_ID = ORIGINAL
  }
})

describe('isAimlapiBaseUrl', () => {
  test('matches prod and staging aimlapi hosts', () => {
    expect(isAimlapiBaseUrl('https://api.aimlapi.com/v1')).toBe(true)
    expect(isAimlapiBaseUrl('https://api-staging.aimlapi.com/v1')).toBe(true)
    expect(isAimlapiBaseUrl('https://ai-staging.aimlapi.com')).toBe(true)
  })

  test('does not match other providers', () => {
    expect(isAimlapiBaseUrl('https://api.openai.com/v1')).toBe(false)
    expect(isAimlapiBaseUrl('https://evil-aimlapi.com.attacker.net')).toBe(false)
    expect(isAimlapiBaseUrl(undefined)).toBe(false)
    expect(isAimlapiBaseUrl('')).toBe(false)
  })
})

describe('resolveAimlapiPartnerId', () => {
  test('returns the default partner id for aimlapi base URLs', () => {
    delete process.env.AIMLAPI_PARTNER_ID
    expect(resolveAimlapiPartnerId('https://api-staging.aimlapi.com/v1')).toBe(
      DEFAULT_PARTNER_ID,
    )
    expect(DEFAULT_PARTNER_ID).toBe('part_OpenClaude')
  })

  test('honors an explicit AIMLAPI_PARTNER_ID override', () => {
    process.env.AIMLAPI_PARTNER_ID = 'part_customAgent42'
    expect(resolveAimlapiPartnerId('https://api.aimlapi.com/v1')).toBe(
      'part_customAgent42',
    )
  })

  test('returns undefined for non-aimlapi base URLs (no header sent)', () => {
    process.env.AIMLAPI_PARTNER_ID = 'part_customAgent42'
    expect(resolveAimlapiPartnerId('https://api.openai.com/v1')).toBeUndefined()
  })
})
