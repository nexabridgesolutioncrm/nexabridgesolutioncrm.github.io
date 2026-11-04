# NexaBridge Sheets Studio — release 4.0

Production: https://nexabridgesolutioncrm.github.io/

## What's implemented

Sheets Studio is a **separate spreadsheet workspace**, not an unrestricted replacement for the structured Leads / Clients / Deals CRM tables. It stores and updates its own cells in Supabase. The two new tables are public.crm_spreadsheets and public.crm_sheet_cells, with organization-scoped RLS policies. Existing business records were **not migrated or modified**.

- Create, list and delete company spreadsheets, with organization membership checks.
- Editable A–Z cell grid, 50-row viewport paging up to row 10000, formula bar, double-click editing, Shift-click selection and range copy / paste.
- Cells stored in Supabase with monotonically increasing revision numbers and compare-and-set updates. Conflicts are surfaced rather than silently overwriting another person's edits.
- Live PostgreSQL change feed and realtime member presence, with a 15-second read-only polling fallback if a websocket cannot connect.
- A **sandboxed, limited** formula engine with cell references, ranges, circular-reference detection and commonly used functions (including SUM, SUMIFS, COUNTIF, COUNTIFS, VLOOKUP, XLOOKUP, INDEX, MATCH, IF, AVERAGE, and more). There is no eval or arbitrary code execution.
- Direct .xlsx / .xls / .xlsm import via pinned SheetJS CE 0.20.3. Worksheet selection is required. Limit 3 MB / 2000 nonempty cells per import, A–Z, up to row 10000.
- Configurable SVG charts: bar, line, pie, doughnut; category and measure columns; count, sum or average aggregation. Chart definitions are saved with each sheet. This is not Google's full chart editor.
- CSV export of computed cell values.
- Existing CRM modules additionally support CSV/XLSX imports and spreadsheet-style grid tools.
- A separate Google Apps Script ↔ Sheets Studio bridge via a deployed Supabase Edge Function. It uses a **Google OAuth access token**, verifies Google email and CRM membership, enforces roles and scopes every operation, and writes cells with revision checks.

## Google Apps Script — activation is required by the account owner

The Edge Function is deployed: https://eahoudfosrblcsbjgjoa.supabase.co/functions/v1/nexabridge-sheets-oauth

The following account-specific authorization **cannot** be completed from GitHub or Supabase alone:

1. Sign in to Google with an email address that matches a verified and authorized NexaBridge CRM account.
2. Open a Google Sheet and choose Extensions → Apps Script.
3. Add source integrations/SheetsStudioAppsScript.gs to the Apps Script project's Code.gs.
4. Enable "Show appsscript.json manifest file in editor" in Project Settings and replace the manifest with integrations/SheetsStudioAppsScript.appsscript.json.
5. Save, run onOpen once if needed, and grant Google's requested OAuth permissions. The connected account's consent is necessary.
6. Reload the Google Sheet. Use NexaBridge CRM → Connect CRM spreadsheet. Choose a CRM sheet ID from the displayed list.
7. Use Pull to create a Google Sheet tab and a hidden revision-baseline tab. Use Push to upload **only changed** cells. Conflicting updates are rejected.
8. For safety, formulas from CRM are imported into Google as **text**, not auto-executed Google Sheet formulas. Review before enabling execution.

No service role key, Google password, Supabase access token or permanent shared secret should be inserted into Apps Script source or a public repository. The Google OAuth access token is obtained at runtime by Apps Script and verified by Google.

## Current limits and unsupported claims

This is **not** a full replica of Google Sheets. Unsupported capabilities include the full Google Sheets formula language (especially QUERY, ARRAYFORMULA, IMPORTRANGE), the ability to run arbitrary Google Apps Script directly inside the CRM browser, real-time multi-cursor OT/CRDT merging of *simultaneous edits to the same cell*, full collaborative history/comments, conditional-formatting rule authoring, full native pivot tables, formula-aware merged cells, protected ranges and all of Google's chart settings.

The integration does **not** automatically deploy or authorize an Apps Script in someone's Google account. The source and verified-account backend are prepared; that account's explicit OAuth consent is still necessary.

The CRM's original spreadsheet-like grids remain intact and have their own limits. Data API and database rules always take priority over UI behavior.

## Quality & audit

- GitHub Actions test: tests/crm-smoke.cjs; tests/sheets-studio.cjs.
- Deployment workflow: .github/workflows/deploy.yml.
- Earlier CRM recovery version: legacy.html.
- Formula evaluator: crm-formulas.js.
- Sheets UI: crm-sheet-studio.js.
- API/authorization: crm-api.js and integrations/nexabridge-sheets-oauth-bridge.ts.
- Scripts: integrations/SheetsStudioAppsScript.gs and integrations/SheetsStudioAppsScript.appsscript.json.

Tests use a simulated backend; true multi-person collaborative acceptance testing and Google OAuth user authorization remain to be performed with real accounts before calling this fully production-hardened.

## Reliability patch 4.2.0 (2026-11-04)

- Viewer permissions are enforced in Sheets Studio controls: read-only formula bar and no create, paste, chart-edit or save actions. Backend RLS remains the authorization boundary.
- Leaving Sheets Studio clears browser-memory sheet lists, cell contents and account state. Late asynchronous requests from an older user session cannot repaint the next account's workspace.
- Revision conflicts show a recovery dialog containing the exact unsaved cell value; the user can copy it without overwriting the remote edit.
- CSV export prefixes dangerous spreadsheet-leading characters with a literal apostrophe to mitigate CSV formula injection.
- CI now tests a viewer switching onto the same device and preserves unsaved values during concurrent edits.
- This patch does not alter existing production CRM or Sheets data.
