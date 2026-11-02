# NexaBridge Gmail v3 — activation and verification

## Current status (2 November 2026)

**Not production-ready / not activated.** Changes are staged on `gmail-integration-20261102`; main is the rollback baseline `1a379dfb7a7e8224b55c2abdb3c1d6e8b26ce669`.

Verified live: Google Apps Script executes as `nexabridgeops@gmail.com`; the existing read-only test successfully read five recent inbox conversations. The Apps Script `GmailConnector.gs` file was observed containing only an empty `myFunction` stub. Supabase deployed function `nexabridge-gmail-appsscript` is still v2. No production code or data has been changed by this repair session.

Dashboard authentication needed to configure secrets was not completed. Do not equate connected Supabase MCP access with a dashboard login: available MCP tools do not set Edge Function secrets.

## Changes staged

- Fix the UI/transport scope defect: Gmail now uses the existing authenticated `/api/gmail/*` adapter rather than referencing inaccessible `secured()` from another closure.
- Add Sent, full plain-text message view, compose, reply, reply-all, pagination, customer email history and optional PDF attachment.
- Real status verifies Google access, exact mailbox and protocol version.
- Pin authorization to the actual NexaBridge organization ID and current database Owner/Admin membership. User JWT is validated through Auth; RLS governs reads. No service-role key or schema change.
- HMAC-SHA256 signs the complete envelope. Secret is never sent in the payload. Durable nonce storage under a script lock rejects replays. Rate limits: 60 authenticated operations/minute and 20 sends/hour for this mailbox.
- Stable 24-hour request IDs and persistent pending/sent records prevent repeat sends, including uncertain failures. A pending outcome is intentionally not resent automatically. Inspect Sent before manually creating a new request.
- Invoice/estimate PDF is generated from a server-fetched, organization-scoped database row. Line totals, discount, tax and total must agree. All items retained; HTML escaped; Unicode preserved in source. Actual Google PDF rendering must still be visually verified.
- Explicit document preview shows recipient, subject, document number and attachment before sending. Changed documents are rejected.
- Retire the duplicate prototype in `integrations/gmail/Code.gs`.

## Deployment sequence

1. Back up the current Apps Script source and deployment settings. Main Git commit above preserves the frontend baseline; retrieve deployed Edge v2 source before replacement.
2. Install `integrations/GmailConnector.gs` in the existing Google project. Keep the existing `Code.gs` read-only test; there are no name collisions. Do not install the retired prototype.
3. Set Script Properties `NEXA_MAILBOX=nexabridgeops@gmail.com` and `NEXA_SHARED_SECRET` to a cryptographically random value of at least 64 characters. Store the identical value as Supabase `NEXA_APPS_SCRIPT_SECRET` without exposing it in chat, URLs, logs or Git.
4. Inspect OAuth scopes and run `testNexaReadOnly`. Confirm Inbox, Sent and reading operate under the correct account. The current implementation uses GmailApp, which requests broad Gmail access; narrower Gmail API scopes would require a separate migration.
5. Test PDF conversion with synthetic invoice and estimate data, including Persian text, long descriptions, multiple pages, discounts and taxes. Open the actual PDFs and visually check their layout and content.
6. Test signed requests locally through Apps Script with wrong signatures, stale timestamps, repeated nonces, repeated send request IDs and uncertain send outcomes. Never broaden Web App access before this succeeds.
7. Deploy the authenticated Apps Script Web App, execute as the NexaBridge account; record version and exact `/exec` URL. Set that URL in Supabase `NEXA_APPS_SCRIPT_URL`.
8. Deploy `integrations/edge/index.ts` with `deno.json` as `nexabridge-gmail-appsscript`, **verify_jwt=true**. Test with actual Owner/Admin and restricted-role sessions before merging frontend changes to main. Do not disable JWT validation to solve login errors.
9. Test an owner-controlled destination only: send/receipt, reply/thread, Sent, invoice and estimate attachments. Confirm PDF details and duplicate handling. Do not send to customers.
10. Merge tested frontend changes, verify GitHub Pages serves the new commit, and repeat through the actual CRM UI. Record deployment versions and evidence below.

## Test evidence

`node --test tests/*.test.cjs`: **17 passing mocked/unit tests** covering JWT failure, organization/role denial, signed envelope identity, wrong mailbox, safe redirects, request ID requirement, mailbox guard, HMAC tampering, replay, idempotency, uncertain sends, attachment/header validation, reply recipients, rate limit, escaped multilingual document source, long documents and frontend script parsing.

These tests do **not** prove live delivery, end-to-end authorization, Apps Script PDF conversion or production UI operation. Those tests are pending dashboard authentication and deployment.

## Remaining security validation

- Verify actual deployed secrets, Web App permissions and OAuth scopes.
- The deployed legacy `nexabridge-gmail` v2 was inspected: it checks Owner/Admin without pinning the NexaBridge organization, does not verify the actual Google mailbox and lacks idempotency. `integrations/edge/legacy-disabled.ts` is staged to retire this alternate route (HTTP 410) when v3 is activated. It has NOT been deployed.
- Supabase advisors reported `auth_leaked_password_protection` disabled. No RLS advisory appeared in that report. Existing policies were not changed. https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- Scan historical/release artifacts separately before claiming repository-wide absence of secrets. New connector code has no credential values.
