# NexaBridge Sheets Studio 4.4 — reliability and feature parity update

Release: 2026-11-04

The CRM remains an independent NexaBridge product. This upgrade changes spreadsheet subsystem code and schema/policies without changing existing lead/client/job records.

## Delivered and automated smoke-tested

- **Spreadsheet formulas:** Formula.js compatible functions when pinned external library is available, plus local SUM, AVERAGE, COUNT, conditional and lookup functions; bounded QUERY now handles grouped aggregates (SUM/AVG/COUNT/MIN/MAX) with WHERE, ORDER BY, LIMIT and OFFSET. All formula text is parsed, never executed as arbitrary JavaScript.
- **Dynamic arrays:** atomic spill calculation prevents partially overwritten results when two formulas overlap.
- **Pivot tables:** two-dimensional grouping with SUM, COUNT, AVERAGE, MIN and MAX, corrected grand totals and true row totals. Blank rows are excluded.
- **Conditional formatting:** server-saved range rules for comparisons, text and blank checks.
- **Cell comments:** shared threaded comments, replies, resolution; realtime notifications refresh comment markers on coworker devices.
- **Revision history:** trigger-generated append-only cell revisions, scoped to organization membership. Auditing is not retroactive.
- **Protected ranges:** database trigger validates the actual CRM editor for REST and privileged Google Apps Script bridge operations, without bypassing locks for agent-level service-originated writes.
- **Live cooperation:** Postgres Changes now includes cells, comments and sheet metadata. Presence uses private channels with per-sheet membership RLS policies. Optimistic concurrency rejects stale writes.
- **Offline drafts:** opt-in IndexedDB local queue with manual sync and conflict recovery. Drafts are unencrypted on the device.
- **Charts:** saved SVG bar, line, area, scatter, horizontal, pie and doughnut chart options, category/value selections, labels and row limits.
- **Apps Script:** an OAuth-verified Edge Function and a ready-to-install bound Google Sheets script, with account authorization still pending.

## Quality gate

Automated checks: tests/crm-smoke.cjs and tests/sheets-studio.cjs, with a simulated Supabase backend. They include new cases for grouped QUERY, spill conflict, Pivot total, private Presence settings and live comment updates.

Security checks verified organization-based RLS and the new realtime presence policies. Postgres Changes includes cell, comment and metadata tables.

## Honest scope boundary

This is not an exact Google Sheets clone. It does not replicate Google's complete proprietary Apps Script runtime, all native formula variants, Google Workspace document-sharing system, full cross-Google-file IMPORTRANGE, simultaneous character-level CRDT/OT editing, Google chart designer parity or comprehensive offline account synchronization. NexaBridge IMPORTRANGE is scoped to authorized in-organization sheets.

Live acceptance with two separate signed-in human accounts and OAuth consent for the Google Apps Script connector still requires user-side authorization and testing.

## Recovery

Production: https://nexabridgesolutioncrm.github.io/
Legacy fallback: /legacy.html
Connector source: integrations/SheetsStudioAppsScript.gs
