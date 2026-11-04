// NexaBridge Sheets Studio ↔ Google Apps Script bridge.
// Authenticates a Google OAuth access token, maps its verified email to a confirmed
// Supabase Auth account, and enforces organization membership / role on every action.
// No browser secrets, static shared secrets, or anonymous access to CRM records.
import { createClient } from "npm:@supabase/supabase-js@2.49.10";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const COMPANY = "NexaBridge Solutions";
const client = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function reply(value: unknown, code = 200) {
  return new Response(JSON.stringify(value), {
    status: code,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
const bad = (detail: string, code = 400) => reply({ error: detail }, code);
const validId = (value: unknown) =>
  typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value);
const validCell = (address: unknown) =>
  typeof address === "string" && /^[A-Z]{1,3}[1-9]\d{0,4}$/.test(address);
type Account = { userId: string; orgId: string; role: string };
async function identity(token: string): Promise<Account | null> {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: "Bearer " + token },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return null;
  const userInfo = await response.json();
  if (userInfo.email_verified !== true || typeof userInfo.email !== "string") return null;
  const email = userInfo.email.toLocaleLowerCase();
  let found: { id: string; email: string; email_confirmed_at?: string } | null = null;
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    found = data.users.find((u) =>
      u.email?.toLocaleLowerCase() === email && !!u.email_confirmed_at
    ) as typeof found;
    if (found) break;
    if (data.users.length < 200) break;
  }
  if (!found) return null;
  const { data: memberships, error: memberError } = await client
    .from("crm_members").select("org_id,role").eq("user_id", found.id);
  if (memberError || !memberships?.length) return null;
  const orgIds = memberships.map((m) => m.org_id);
  const { data: org, error: orgError } = await client.from("crm_organizations")
    .select("id,name").eq("name", COMPANY).in("id", orgIds).limit(1).maybeSingle();
  if (orgError || !org) return null;
  const membership = memberships.find((m) => m.org_id === org.id);
  return membership ? { userId: found.id, orgId: org.id, role: membership.role } : null;
}
async function sheetFor(orgId: string, id: string) {
  const { data, error } = await client.from("crm_spreadsheets")
    .select("id,name,org_id,protected_ranges").eq("id", id).eq("org_id", orgId).maybeSingle();
  if (error) throw error;
  return data;
}


function columnNumber(label: string): number {
  return label.split("").reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
}
function cellPosition(value: string): {col: number; row: number} | null {
  const m=/^([A-Z]{1,3})([1-9]\d{0,4})$/.exec(value);
  return m?{col:columnNumber(m[1]),row:Number(m[2])}:null;
}
function cellInRange(address: string,range: string): boolean {
  const parts=range.split(":");
  if(parts.length!==2)return false;
  const a=cellPosition(parts[0]),b=cellPosition(parts[1]),p=cellPosition(address);
  return !!(a&&b&&p&&p.col>=Math.min(a.col,b.col)&&p.col<=Math.max(a.col,b.col)
    &&p.row>=Math.min(a.row,b.row)&&p.row<=Math.max(a.row,b.row));
}
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return bad("POST required", 405);
  if (!SERVICE_KEY || !SUPABASE_URL) return bad("Service configuration missing", 503);
  const auth = req.headers.get("Authorization") || "";
  const token = /^Bearer ([A-Za-z0-9._~+/-]+)$/.exec(auth)?.[1];
  if (!token) return bad("Google OAuth token required", 401);
  if (Number(req.headers.get("content-length") || 0) > 180000) return bad("Request too large", 413);
  try {
    const who = await identity(token);
    if (!who) return bad("No verified Google account matching an authorized CRM user", 403);
    const payload = await req.json();
    const action = String(payload.action || "");
    if (action === "list") {
      const { data, error } = await client.from("crm_spreadsheets")
        .select("id,name,updated_at").eq("org_id", who.orgId)
        .order("updated_at", { ascending: false }).limit(100);
      if (error) throw error;
      return reply({ sheets: data || [] });
    }
    const sheetId = payload.sheetId;
    if (!validId(sheetId)) return bad("Valid sheet ID required");
    const sheet = await sheetFor(who.orgId, sheetId);
    if (!sheet) return bad("Spreadsheet does not belong to this organization", 404);
    if (action === "read") {
      const result = [];
      for (let offset = 0; offset < 10000; offset += 500) {
        const { data, error } = await client.from("crm_sheet_cells")
          .select("address,raw_value,revision").eq("org_id", who.orgId)
          .eq("sheet_id", sheetId).order("address")
          .range(offset, offset + 499);
        if (error) throw error;
        result.push(...(data || []));
        if ((data || []).length < 500) break;
      }
      return reply({ sheet: { id: sheet.id, name: sheet.name }, cells: result });
    }
    if (action === "write") {
      if (!["owner", "admin", "agent"].includes(who.role)) return bad("Read-only access", 403);
      if (!Array.isArray(payload.cells) || payload.cells.length < 1 ||
          payload.cells.length > 100) return bad("Provide 1–100 cells per call");
      const unique = new Set<string>();
      const result: { address: string; saved: boolean; revision?: number; error?: string }[] = [];
      for (const cell of payload.cells) {
        const address = String(cell.address || "").toUpperCase();
        const value = String(cell.value ?? "");
        const revision = Number(cell.revision);
        if (!validCell(address) || address.length > 8 || value.length > 4000 ||
            !Number.isSafeInteger(revision) || revision < 0 || unique.has(address)) {
          return bad("Invalid cell, duplicate address or revision");
        }
        unique.add(address);
      }
      for (const cell of payload.cells) {
        const address = String(cell.address).toUpperCase();
        const protectedRanges = Array.isArray(sheet.protected_ranges) ? sheet.protected_ranges : [];
        if (who.role === 'agent' && protectedRanges.some((r: {range?: string}) => cellInRange(address,String(r.range||'')))) {
          result.push({address,saved:false,error:'Protected range — Owner/Admin permission required'});
          continue;
        }
        const row = {
          sheet_id: sheetId, org_id: who.orgId, address,
          raw_value: String(cell.value ?? ""), updated_by: who.userId,
          updated_at: new Date().toISOString(),
        };
        if (Number(cell.revision) === 0) {
          const { data, error } = await client.from("crm_sheet_cells")
            .insert({ ...row, revision: 1 }).select("revision").maybeSingle();
          result.push(error
            ? { address, saved: false, error: "Cell exists or insert rejected" }
            : { address, saved: true, revision: data?.revision });
        } else {
          const { data, error } = await client.from("crm_sheet_cells")
            .update({ ...row, revision: Number(cell.revision) + 1 })
            .eq("sheet_id", sheetId).eq("org_id", who.orgId).eq("address", address)
            .eq("revision", Number(cell.revision))
            .select("revision").maybeSingle();
          result.push(error || !data
            ? { address, saved: false, error: "Revision conflict or access denied" }
            : { address, saved: true, revision: data.revision });
        }
      }
      return reply({ results: result, saved: result.filter((x) => x.saved).length });
    }
    return bad("Unsupported action", 403);
  } catch (error) {
    console.error("Sheets bridge error:", error instanceof Error ? error.name : "unknown");
    return bad("The Sheets integration request could not be completed", 500);
  }
});
