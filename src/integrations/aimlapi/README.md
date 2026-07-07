# AI/ML API integration (DRAFT)

Wires OpenClaude to the [aimlapi.com](https://aimlapi.com) **partner-checkout**
flow: a user logs in, tops up their balance with one click, and the issued key
is written straight into OpenClaude's provider profile — no manual copy/paste.

> **Production by default.** Use `--staging` or `AIMLAPI_ENV=staging` only when
> testing against staging services.

## Usage

```bash
openclaude aimlapi topup
# or non-interactive:
openclaude aimlapi topup --email you@example.com --amount 25 --method card
AIMLAPI_PASSWORD=… openclaude aimlapi topup --email you@example.com
```

Options: `--email`, `--password` (prefer `AIMLAPI_PASSWORD` env), `--amount`
(USD, min $10), `--method card|crypto`, `--model`, `--partner-id part_…`,
`--staging`, `--no-open`.

## Flow

| # | Step | Call |
|---|------|------|
| 1 | Log in → hold Bearer token in the CLI | `PUT {auth}/v1/auth/account` |
| 2 | Create one-time checkout session | `POST {app}/v3/partner-checkout/sessions` |
| 3 | Bind session + open hosted payment page | `POST {app}/v3/partner-checkout/sessions/:t/pay` |
| 4 | User pays in the browser (no 2nd login — "auto-login": the CLI already holds auth) | hosted Stripe / NOWPayments |
| 5 | Poll until `paid` | `GET {app}/v3/partner-checkout/sessions/:t` |
| 6 | Exchange paid session → raw key (once) | `POST {app}/v3/partner-checkout/sessions/:t/exchange` |
| 7 | Write key into `~/.openclaude-profile.json` (`profile: openai`) | `saveProfileFile()` |

`{auth}` = `auth.aimlapi.com`, `{app}` = `app.aimlapi.com`.
The profile points OpenClaude at the OpenAI-compatible inference base
`https://api.aimlapi.com/v1`.

## Files

- `config.ts` — endpoints (staging/prod), defaults, env overrides
- `client.ts` — `AimlapiClient` (login / create / pay / poll / exchange)
- `prompt.ts` — dependency-free email/password prompts
- `topup.ts` — `runAimlapiTopup()` orchestration + profile write
- `../../cli/handlers/aimlapi.ts` — CLI handler; command registered in `src/main.tsx`

## Notes / TODO

- The exchange is **one-shot**: the raw key is returned exactly once. If it's
  lost, rotate it from the AI/ML API dashboard.
- Staging remains available with `--staging` / `AIMLAPI_ENV=staging`.
- `--partner-id` drives rebate attribution; defaults to `part_OpenClaude`.
