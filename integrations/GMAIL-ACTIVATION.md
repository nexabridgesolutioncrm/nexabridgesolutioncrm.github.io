# NexaBridge Gmail — final activation checklist

Current environment: CRM on GitHub Pages, Supabase Edge Function `nexabridge-gmail-appsscript`, Apps Script source `integrations/GmailConnector.gs`.

The connector has **not** been activated until steps below are satisfied. Do not paste any secret in GitHub, CRM HTML or ChatGPT.

1. In the Apps Script project owned by `nexabridgeops@gmail.com`, replace the deployed script code with `integrations/GmailConnector.gs`. Inspect scopes and save.
2. In Apps Script > Project Settings > Script Properties set `NEXA_MAILBOX=nexabridgeops@gmail.com` and `NEXA_SHARED_SECRET` to a newly generated, high-entropy random value (64+ characters).
3. In the Supabase project `eahoudfosrblcsbjgjoa` > Edge Functions > Secrets, set `NEXA_APPS_SCRIPT_SECRET` to the **same** secret, and `NEXA_APPS_SCRIPT_URL` to the exact Google Apps Script Web App URL ending in `/exec`.
4. Deploy a new Apps Script version as **Execute as me**. Only if the shared secret, anti-replay guard and Supabase auth gate are in place, select access allowing server calls; do not embed secrets in front-end code. `Only myself` cannot be invoked by Supabase without a Google authenticated browser session.
5. In CRM, log in with an Owner/Admin account. Check Gmail status, then Inbox. Send a test message to a mailbox under your control, confirm receipt, then test Reply and PDF attached to a test invoice/estimate. Do **not** send a live customer email before this test succeeds.
6. Check Supabase function logs, rotate any inadvertently disclosed secret, and record successful tests.

Notes: Gmail status returning `configured:true` only verifies environment variables, not the Google session or actual connectivity. Delivery confirmation from Gmail does not prove the remote mailbox received a message. The generated invoice PDF is a simplified English/ASCII document, not the branded print layout.

Security: Web App access must never be broadened before installation of the authenticated connector. Avoid public functions that accept unsigned arbitrary mail requests.
