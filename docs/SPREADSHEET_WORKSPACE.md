# NexaBridge CRM — Spreadsheet Workspace (v3.5)

The CRM's spreadsheet-style interface uses real, organization-scoped Supabase records, not a local demonstration database.

## Available features
- Per-module spreadsheets for Leads, Clients, Deals, Tasks, Jobs, Documents, Calendar, Projects, Contracts and Expenses.
- Direct cell editing (double-click or Enter), with validation for dates, emails, numbers, choices and linked records.
- Keyboard arrow navigation, Shift+click/Shift+arrow rectangular selection, clipboard copying of cell ranges (TSV), copy selected rows, and spreadsheet multi-cell paste.
- Search, status filtering, multi-condition column filters, sort, column visibility/reordering, frozen first data column, compact row density and 50-row pagination.
- COUNT, SUM, AVG, MIN and MAX summaries for filtered/selected rows in numeric fields, plus a read-only grouped/pivot-style summary.
- Saved browser-local filter views containing search, sorting, filters, column visibility/order and layout settings. View definitions are not shared with other users/devices.
- CSV export and CSV/TSV import with preview and confirmation (up to 500 new records per import); spreadsheet multi-cell paste into existing records is capped for safety. CSV import creates new records.
- Native XLSX export of filtered results using Office Open XML without executing spreadsheet formulas.
- Find and replace with preview, fill down over selected rows, bulk status updates, duplicate record, undo/redo of recent edits, and confirmation for disruptive operations.
- Detail pages with linked CRM activity, follow-up tasks and back navigation.
- Kanban view for appropriate modules; moves persist to Supabase subject to authorization.
- Data access governed by Supabase Row Level Security. In the current project, Owner/Admin can edit existing CRM records, Agent can add but cannot edit existing records, and Viewer has read-only access.

## Not implemented / not equivalent to Google Sheets
Google Sheets has a separate product's feature set. This CRM does not currently include:
- Its complete formula engine (ARRAYFORMULA, QUERY, IMPORTRANGE, VLOOKUP, custom functions, etc.).
- Google Apps Script, Workspace add-ons or Google Sheets API compatibility.
- Simultaneous per-cell collaborative editing, presence cursors, comments, granular per-cell revision history or offline sync.
- Full pivot-table editors, conditional-formatting rule builders, chart editors or protected range administration.
- Native XLSX import; save the workbook sheet as CSV before importing.
- Shared saved views across devices.

CRM records are not arbitrary spreadsheet cells. Business constraints, relationships, financial values, roles, and lead conversions must retain server validation and authorization.

## Safety and recovery
- Frontend deployment does not modify production database records.
- Previous complete CRM is preserved at /legacy.html as an advanced and recovery interface.
- A copy of the pre-spreadsheet v3 JavaScript is preserved under archive/.
- CI runs tests/crm-smoke.cjs to exercise login, creation, edit, undo/redo, clipboard, import, filters, saved views, pivot reporting and XLSX creation.
- Passing mock smoke tests is not equivalent to production Supabase user acceptance testing.

## Operating tips
Open any core module. Use Filter column, Columns, Save view, Pivot summary, Copy cells, Paste TSV or Excel (.xlsx). Open an individual record using Open. Double-click a data cell to edit. Use Shift+click to select a rectangular range, Ctrl/Cmd+C to copy, and Undo/Redo for recent supported edits.
