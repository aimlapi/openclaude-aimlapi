# AIMLAPI × Gitlawb partner integration — HANDOFF

> Scratch doc. Delete before committing (or it rides along harmlessly).
> Written from the aimlapi backend session; everything below is verified against the repos.

## 0. Goal (decided with product)

Make **openclaude** (and later **zero**, **gitlawb opengateway**) attribute ALL AI/ML API
usage to ONE Gitlawb partner so the rebate program actually pays out:

- `partner_id`  = `part_62yQoGYDq4Yqnrj2R1iGrDNJ`  ← exact string, **case-sensitive**
- `partnerName` = `Gitlawb`
- logo          = `gitlawb.png` (rendered by AIMLAPI's checkout **by partner_id** — nothing to add in the client)

No per-product "special" partner. Same id/name for all three products.

## 1. How attribution works on the AIMLAPI backend (why the value matters)

- Every inference request to `*.aimlapi.com` must carry header
  `X-AIMLAPI-Partner-ID: part_…`.
- Backend validates it against `^part_[A-Za-z0-9]{1,64}$`. Anything that doesn't match
  (e.g. the literal `Gitlawb`) is **silently treated as untagged → NO rebate** (the
  request is NOT rejected, it just earns nothing).
- The value must EXACTLY equal a row in `rebate_partners.partner_id` that is `active`
  and has a linked `tolt_customer_id`. That row exists for
  `part_62yQoGYDq4Yqnrj2R1iGrDNJ` → customer `cus_Lr2vdTzNgbbp4QtuGNrbghvk`.
  **⚠️ Confirm that row is actually in the rebates DB** (upsert via
  `POST /v3/rebate-partners` or SQL) before expecting payouts.
- Below-$50 months carry forward and pay once cumulative ≥ $50 (backend already handles).

## 2. THE BUG — why openclaude currently earns $0

Two attribution implementations exist, BOTH send a wrong value:

1. **Shipped (origin/main, via PR #863):**
   `src/integrations/gateways/aimlapi.ts` → `transportConfig.openaiShim.headers`
   hardcodes `'X-AIMLAPI-Partner-ID': 'Gitlawb'`.
   Also asserted in `src/integrations/discoveryService.test.ts` and
   `src/services/api/bootstrap.test.ts`.
   `'Gitlawb'` fails the `^part_…$` regex → **zero rebate on the released product.**

2. **Uncommitted local WIP (working tree):** removed the gateway header; added
   `src/integrations/aimlapi/partnerHeader.ts` (applied in
   `src/services/api/openaiShim.ts`), defaulting to `part_OpenClaude` (from
   `src/integrations/aimlapi/config.ts` `DEFAULT_PARTNER_ID`).
   `part_OpenClaude` is valid FORMAT but **not registered on the backend** → tracked
   but stuck `pending` forever.

Correct value for BOTH = `part_62yQoGYDq4Yqnrj2R1iGrDNJ`.

## 3. ⚠️ FIRST THING — save the uncommitted WIP (don't lose it)

The entire `src/integrations/aimlapi/` topup module + `src/cli/handlers/aimlapi.ts`
+ edits to `openaiShim.ts`, `main.tsx`, `ProviderManager.tsx`/`.test.tsx`,
`gateways/aimlapi.ts`, `integrationManifest.generated.ts` are **UNCOMMITTED** and live
ONLY in the working tree (not on any branch, not on the fork). Back it up first:

```bash
cd e:/projects/aimlapi/openclaude
git status                                  # confirm the dirty state
git checkout -b wip/aimlapi-topup-module
git add -A && git commit -m "wip: aimlapi topup module + attribution (local snapshot)"
git push -u fork wip/aimlapi-topup-module   # fork = aimlapi/openclaude-aimlapi (you can push)
```

## 4. Repo topology & PR mechanics (fork model — NO issue needed)

- `origin` = `Gitlawb/openclaude` (upstream) — **PULL only, NO push** (verified).
- `fork`   = `aimlapi/openclaude-aimlapi` — **push/admin** (gh account `StanAIML`).
- Contribution flow (same as PR #863):
  1. branch off `origin/main`
  2. commit
  3. `git push fork <branch>`
  4. open cross-repo PR into `Gitlawb/openclaude:main`:
     ```bash
     gh pr create --repo Gitlawb/openclaude --base main \
       --head aimlapi:<branch> --title "…" --body "…"
     ```
  5. a Gitlawb maintainer merges it (you can't — no upstream write). Issue is optional;
     #863 had none.

## 5. Decision — which attribution path ships? (pick ONE)

### Path A — fix the shipped gateway header (RECOMMENDED to unblock money now)
Small, clean, isolated PR against `origin/main`. Does NOT need the WIP module.
```bash
git stash -u                                    # set WIP aside (after step 3 backup)
git checkout -b fix/aimlapi-gitlawb-partner-id origin/main
```
Edit `src/integrations/gateways/aimlapi.ts`:
`'X-AIMLAPI-Partner-ID': 'Gitlawb'` → `'X-AIMLAPI-Partner-ID': 'part_62yQoGYDq4Yqnrj2R1iGrDNJ'`
Update the two tests asserting `'Gitlawb'`:
`src/integrations/discoveryService.test.ts` (~L464) and
`src/services/api/bootstrap.test.ts` (~L220).
Then: run tests → commit → `git push fork fix/aimlapi-gitlawb-partner-id` → PR (§4).
Restore WIP afterwards: `git checkout main && git stash pop` (or work from the wip branch).

### Path B — land the full WIP module (topup + dynamic partnerHeader)
Bigger; needs live auth+Stripe testing. In `src/integrations/aimlapi/config.ts`:
`DEFAULT_PARTNER_ID='part_62yQoGYDq4Yqnrj2R1iGrDNJ'`, `DEFAULT_PARTNER_NAME='Gitlawb'`;
update `partnerHeader.ts` default/comment + `partnerHeader.test.ts`.
**Avoid double-sending:** pick gateway-header OR the partnerHeader module, not both.
Verify the auth contract in `client.ts` (`signup=POST` / `login=PUT /v1/auth/account`)
against the live app/auth API.

**Suggested sequencing:** Path A now (turn on rebate for the shipped product), Path B
(topup) as a separate follow-up PR.

## 6. Verification task — partner success screen after payment

Question: after a partner top-up payment completes, does the co-branded success screen
(the one with the emoji) show?
- Frontend (AIMLAPI repo `app/`): `app/app/pages/checkout/index.vue` — the partner branch
  reads the session by `sessionToken` (query) → `partnerName` + `returnUrl` → renders the
  partner success actions (Create API Key / Go to Playground / Return to {partnerName}).
- To verify: run the partner-checkout topup end-to-end on staging, pay, land back on the
  success page, confirm the partner-branded success (emoji + `Gitlawb` + `gitlawb.png`)
  renders — and that `sessionToken` is carried on the success redirect so the session
  resolves to `partnerName=Gitlawb`.

## 7. Cleanup on the AIMLAPI side (separate repo, branch `lkv/rebate-partners-carry-forward`)
`app/public/icons/partners/openclaude.svg` + the `part_openclaude → openclaude.svg` entry
in `app/app/composables/billing/partnerCheckoutBrand.ts` are now unused (everything brands
as Gitlawb via `part_62yqogydq4yqnrj2r1igrdnj → gitlawb.png`). Optional: remove them.
