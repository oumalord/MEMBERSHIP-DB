// server/app.ts
import { randomBytes, randomUUID as randomUUID2, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

// server/pg.ts
import pg from "pg";
var instance;
function pool() {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set in .env");
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    instance = new pg.Pool({ connectionString: url, max: 5, ssl: local ? void 0 : { rejectUnauthorized: false } });
  }
  return instance;
}
var BACKEND_TABLES = ["admins", "communications", "events", "institution_categories", "institutions", "members", "participations", "settings", "transactions"];
async function migrate() {
  const p = pool();
  for (const t of BACKEND_TABLES) {
    await p.query(`CREATE TABLE IF NOT EXISTS "${t}" (
      id uuid PRIMARY KEY,
      data jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await p.query(`CREATE INDEX IF NOT EXISTS "${t}_data_gin" ON "${t}" USING gin (data jsonb_path_ops)`);
  }
  await p.query(`CREATE TABLE IF NOT EXISTS auth_users (
    id uuid PRIMARY KEY,
    email text NOT NULL UNIQUE,
    name text NOT NULL,
    salt text NOT NULL,
    hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await p.query(`CREATE TABLE IF NOT EXISTS auth_sessions (
    token text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    expires_at bigint NOT NULL
  )`);
  await p.query("DELETE FROM auth_sessions WHERE expires_at < $1", [Date.now()]);
}

// server/sdk.ts
import { randomUUID } from "node:crypto";
var json = (body, status = 200) => ({ status, body });
var error = (message, status = 400) => ({ status, body: { message } });
var requireAuth = () => (ctx) => ctx.user ? void 0 : error("Please sign in to continue.", 401);
function router(routes) {
  const compiled = Object.entries(routes).map(([key, steps]) => {
    const [method, path] = key.split(" ");
    const names = [];
    const pattern = new RegExp("^" + path.replace(/:([A-Za-z]+)/g, (_m, n) => {
      names.push(n);
      return "([^/]+)";
    }) + "/?$");
    return { method, pattern, names, steps };
  });
  return async (method, path, ctx) => {
    let pathMatched = false;
    for (const r of compiled) {
      const m = r.pattern.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params = {};
      r.names.forEach((n, i) => {
        params[n] = decodeURIComponent(m[i + 1]);
      });
      const full = { ...ctx, params };
      for (const step of r.steps) {
        const out = await step(full);
        if (out) return out;
      }
      return error("Handler returned no response", 500);
    }
    return error(pathMatched ? "Method not allowed" : "Not found", pathMatched ? 405 : 404);
  };
}
var TABLES = ["admins", "communications", "events", "institution_categories", "institutions", "members", "participations", "settings", "transactions"];
var table = (name) => {
  if (!TABLES.includes(name)) throw new Error(`Unknown table: ${name}`);
  return `"${name}"`;
};
var db = {
  async list(name, opts = {}) {
    const { rows } = await pool().query(
      `SELECT id, data FROM ${table(name)} WHERE data @> $1::jsonb ORDER BY created_at, id LIMIT $2`,
      [JSON.stringify(opts.filter || {}), opts.limit ?? 100]
    );
    return { items: rows.map((r) => ({ id: r.id, ...r.data })) };
  },
  async get(name, ids) {
    if (ids.length === 0) return [];
    const { rows } = await pool().query(`SELECT id, data FROM ${table(name)} WHERE id = ANY($1::uuid[])`, [ids]);
    const byId = new Map(rows.map((r) => [r.id, { id: r.id, ...r.data }]));
    return ids.map((id) => byId.get(id));
  },
  async add(name, records) {
    const ids = records.map(() => randomUUID());
    for (let i = 0; i < records.length; i++) {
      await pool().query(`INSERT INTO ${table(name)} (id, data) VALUES ($1, $2::jsonb)`, [ids[i], JSON.stringify(records[i])]);
    }
    return ids;
  },
  async update(name, updates) {
    const out = [];
    for (const { id, record } of updates) {
      const { id: _drop, ...rest } = record;
      const r = await pool().query(`UPDATE ${table(name)} SET data = $2::jsonb WHERE id = $1`, [id, JSON.stringify(rest)]);
      out.push((r.rowCount ?? 0) > 0);
    }
    return out;
  },
  async delete(name, ids) {
    const out = [];
    for (const id of ids) {
      const r = await pool().query(`DELETE FROM ${table(name)} WHERE id = $1`, [id]);
      out.push((r.rowCount ?? 0) > 0);
    }
    return out;
  }
};

// membership-categories.ts
var MEMBERSHIP_CATEGORIES = [
  { name: "Rainbows", min: 3, max: 6 },
  { name: "Brownies", min: 7, max: 9 },
  { name: "Girl Guides", min: 10, max: 14 },
  { name: "Ranger", min: 15, max: 17 },
  { name: "Young Leader", min: 18, max: 35 },
  { name: "Bravo", min: 36, max: 60 },
  { name: "Trefoil", min: 61, max: 120 }
];
var MEMBERSHIP_CATEGORY_NAMES = MEMBERSHIP_CATEGORIES.map(({ name }) => name);
function membershipCategoryForAge(age) {
  return MEMBERSHIP_CATEGORIES.find(({ min, max }) => age >= min && age <= max)?.name || "Unassigned";
}

// backend/index.ts
var DEFAULT_BRANDING = { orgName: "KGGA", tagline: "Girls creating a better world", logo: "" };
function ageFromDob(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const now = /* @__PURE__ */ new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || m === 0 && now.getDate() < birth.getDate()) age--;
  return age;
}
function unitForDob(dob) {
  const age = ageFromDob(dob);
  return age === null ? "Unassigned" : membershipCategoryForAge(age);
}
function validDob(dob) {
  const age = ageFromDob(dob);
  if (age === null) return "A valid date of birth is required to place the member in a guide unit.";
  if (age < 0 || age > 120) return "Date of birth is not valid.";
  if (age < 3) return "Members must be at least 3 years old to join a category.";
  return null;
}
function today() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
function plusDays(days) {
  const d = /* @__PURE__ */ new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function daysBetween(dateStr) {
  const d = new Date(dateStr);
  const now = /* @__PURE__ */ new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1e3 * 60 * 60 * 24));
}
async function resolveAdminSession(user) {
  const byUser = await db.list("admins", { filter: { userId: user.userId }, limit: 1 });
  if (byUser.items.length > 0) return byUser.items[0];
  const any = await db.list("admins", { limit: 1 });
  if (any.items.length === 0) {
    const record = { userId: user.userId, email: user.email || "", name: user.name || user.email || "Super Admin", status: "active", isSuperAdmin: true, canEdit: true, canManageAdmins: true };
    const [id] = await db.add("admins", [record]);
    if (!id) throw new Error("Failed to bootstrap admin account");
    return { id, ...record };
  }
  if (user.email) {
    const byEmail = await db.list("admins", { filter: { email: user.email, status: "invited" }, limit: 1 });
    if (byEmail.items.length > 0) {
      const inv = byEmail.items[0];
      const updated = { ...inv, userId: user.userId, name: user.name || inv.email, status: "active" };
      await db.update("admins", [{ id: inv.id, record: updated }]);
      return { id: inv.id, ...updated };
    }
  }
  return null;
}
function requireAdminSession() {
  return async (ctx) => {
    const rec = await resolveAdminSession(ctx.user);
    if (!rec) return error("No admin account found for this login. Ask your Super Admin for an invitation.", 403);
    ctx.admin = rec;
  };
}
function requireEditRights() {
  return async (ctx) => {
    if (!ctx.admin.canEdit) return error("You have view-only access. Editing rights are required for this action.", 403);
  };
}
function requireManageAdmins() {
  return async (ctx) => {
    if (!ctx.admin.isSuperAdmin && !ctx.admin.canManageAdmins) return error("You do not have permission to manage admin accounts.", 403);
  };
}
function requireSuperAdmin() {
  return async (ctx) => {
    if (!ctx.admin.isSuperAdmin) return error("Only the Super Admin can perform this action.", 403);
  };
}
async function findInstitution(userId) {
  const { items } = await db.list("institutions", { filter: { userId }, limit: 1 });
  return items.length > 0 ? items[0] : null;
}
function requireInstitutionSession() {
  return async (ctx) => {
    const inst = await findInstitution(ctx.user.userId);
    if (!inst) return error("No institution account found for this login. Please sign up as an institution first.", 403);
    ctx.institution = inst;
  };
}
var handler = router({
  "GET /api/_healthcheck": [async () => json({ message: "Success" })],
  "GET /api/account/status": [requireAuth(), async (ctx) => {
    const [admins, insts, mems] = await Promise.all([
      db.list("admins", { filter: { userId: ctx.user.userId }, limit: 1 }),
      db.list("institutions", { filter: { userId: ctx.user.userId }, limit: 1 }),
      db.list("members", { filter: { ownerUserId: ctx.user.userId }, limit: 1 })
    ]);
    return json({ isAdmin: admins.items.length > 0, isInstitution: insts.items.length > 0, isIndividual: mems.items.length > 0 });
  }],
  "POST /api/account/signup-individual": [requireAuth(), async (ctx) => {
    const existing = await db.list("members", { filter: { ownerUserId: ctx.user.userId }, limit: 1 });
    if (existing.items.length > 0) return json(existing.items[0]);
    const body = ctx.body;
    if (!body.name || !body.name.trim()) return error("Full name is required", 400);
    const dobErr = validDob(body.dob);
    if (dobErr) return error(dobErr, 400);
    const record = {
      name: body.name.trim(),
      phone: body.phone || "",
      email: body.email || ctx.user.email || "",
      dob: body.dob || "",
      branch: unitForDob(body.dob),
      region: body.town || body.region || "",
      guardianName: body.guardianName || "",
      status: "active",
      joinedDate: today(),
      subscriptionExpiry: plusDays(365),
      ownerUserId: ctx.user.userId,
      source: "self",
      memberType: (ageFromDob(body.dob) ?? 18) >= 18 ? "adult" : "youth",
      idNo: body.idNo || "",
      maritalStatus: body.maritalStatus || "",
      poBox: body.poBox || "",
      town: body.town || "",
      occupation: body.occupation || "",
      employer: body.employer || "",
      workPhone: body.workPhone || "",
      workEmail: body.workEmail || "",
      otherSkills: body.otherSkills || "",
      nextOfKinName: body.nextOfKinName || "",
      nextOfKinRelationship: body.nextOfKinRelationship || "",
      nextOfKinPhone: body.nextOfKinPhone || "",
      nextOfKinEmail: body.nextOfKinEmail || "",
      yearJoinedGuiding: body.yearJoinedGuiding || "",
      levelsUndertaken: body.levelsUndertaken || "",
      trainingsReceived: body.trainingsReceived || "",
      guidingAwards: body.guidingAwards || "",
      leadershipHistory: body.leadershipHistory || "",
      currentInvolvement: body.currentInvolvement || "",
      currentLevelOfEngagement: body.currentLevelOfEngagement || "",
      currentSupport: body.currentSupport || ""
    };
    const [id] = await db.add("members", [record]);
    if (!id) return error("Failed to create account", 500);
    return json({ id, ...record }, 201);
  }],
  "POST /api/account/signup-institution": [requireAuth(), async (ctx) => {
    const existing = await findInstitution(ctx.user.userId);
    if (existing) return json(existing);
    const body = ctx.body;
    if (!body.name || !body.name.trim()) return error("Institution name is required", 400);
    const record = {
      userId: ctx.user.userId,
      name: body.name.trim(),
      email: body.email || ctx.user.email || "",
      phone: body.phone || "",
      address: body.address || "",
      county: body.county || "",
      subCounty: body.subCounty || "",
      principalName: body.principalName || "",
      principalMobile: body.principalMobile || "",
      principalEmail: body.principalEmail || "",
      noOfUnits: body.noOfUnits || "",
      noOfGuidesInUnit: body.noOfGuidesInUnit || "",
      guideLeaderName: body.guideLeaderName || "",
      guideLeaderPhone: body.guideLeaderPhone || "",
      guideLeaderEmail: body.guideLeaderEmail || "",
      meetingDayTime: body.meetingDayTime || ""
    };
    const [id] = await db.add("institutions", [record]);
    if (!id) return error("Failed to create institution account", 500);
    return json({ id, ...record }, 201);
  }],
  "POST /api/admin/session": [requireAuth(), async (ctx) => {
    const rec = await resolveAdminSession(ctx.user);
    if (!rec) return error("No admin account found for this login. Ask your Super Admin for an invitation.", 403);
    return json(rec);
  }],
  "GET /api/individual/me": [requireAuth(), async (ctx) => {
    const { items } = await db.list("members", { filter: { ownerUserId: ctx.user.userId }, limit: 1 });
    if (items.length === 0) return error("No individual account found for this login", 404);
    return json(items[0]);
  }],
  "PUT /api/individual/me": [requireAuth(), async (ctx) => {
    const { items } = await db.list("members", { filter: { ownerUserId: ctx.user.userId }, limit: 1 });
    if (items.length === 0) return error("No individual account found for this login", 404);
    const existing = items[0];
    const body = ctx.body;
    const merged = { ...existing, phone: body.phone ?? existing.phone, email: body.email ?? existing.email, region: body.region ?? existing.region, guardianName: body.guardianName ?? existing.guardianName };
    delete merged.id;
    const [ok] = await db.update("members", [{ id: existing.id, record: merged }]);
    if (!ok) return error("Failed to update your details", 500);
    return json({ id: existing.id, ...merged });
  }],
  "GET /api/individual/transactions": [requireAuth(), async (ctx) => {
    const { items: mems } = await db.list("members", { filter: { ownerUserId: ctx.user.userId }, limit: 1 });
    if (mems.length === 0) return error("No individual account found for this login", 404);
    const { items } = await db.list("transactions", { filter: { memberId: mems[0].id }, limit: 200 });
    return json({ items: items.sort((a, b) => a.date < b.date ? 1 : -1) });
  }],
  "GET /api/individual/participations": [requireAuth(), async (ctx) => {
    const { items: mems } = await db.list("members", { filter: { ownerUserId: ctx.user.userId }, limit: 1 });
    if (mems.length === 0) return error("No individual account found for this login", 404);
    const { items } = await db.list("participations", { filter: { memberId: mems[0].id }, limit: 200 });
    return json({ items });
  }],
  "GET /api/events": [requireAuth(), async () => {
    const { items } = await db.list("events", { limit: 200 });
    return json({ items: items.filter((event) => event.date >= today()).sort((a, b) => a.date < b.date ? -1 : 1) });
  }],
  "POST /api/events/:id/register": [requireAuth(), async (ctx) => {
    const [event] = await db.get("events", [ctx.params.id]);
    if (!event) return error("Event not found", 404);
    if (event.date < today()) return error("Registration is closed for past events", 400);
    const institution = await findInstitution(ctx.user.userId);
    let member;
    if (institution) {
      const body = ctx.body;
      if (!body.memberId) return error("memberId is required", 400);
      const [student] = await db.get("members", [body.memberId]);
      if (!student || student.institutionId !== institution.id) return error("Student not found", 404);
      member = student;
    } else {
      const { items } = await db.list("members", { filter: { ownerUserId: ctx.user.userId }, limit: 1 });
      member = items[0];
      if (!member) return error("No individual account found for this login", 403);
    }
    const { items: existing } = await db.list("participations", { filter: { eventId: ctx.params.id, memberId: member.id }, limit: 1 });
    if (existing.length > 0) return error("This member is already registered for the event", 409);
    const record = { eventId: ctx.params.id, memberId: member.id, memberName: member.name, eventTitle: event.title, date: today() };
    const [id] = await db.add("participations", [record]);
    if (!id) return error("Failed to register participant", 500);
    return json({ id, ...record }, 201);
  }],
  "GET /api/notices": [requireAuth(), async () => {
    const { items } = await db.list("communications", { filter: { type: "notice" }, limit: 200 });
    return json({ items: items.sort((a, b) => a.date < b.date ? 1 : -1) });
  }],
  "GET /api/institution/me": [requireAuth(), async (ctx) => {
    const inst = await findInstitution(ctx.user.userId);
    if (!inst) return error("No institution account found for this login", 404);
    return json(inst);
  }],
  "GET /api/institution/members": [requireAuth(), requireInstitutionSession(), async (ctx) => {
    const { items } = await db.list("members", { filter: { institutionId: ctx.institution.id }, limit: 500 });
    return json({ items: items.sort((a, b) => a.name.localeCompare(b.name)) });
  }],
  "POST /api/institution/members": [requireAuth(), requireInstitutionSession(), async (ctx) => {
    const body = ctx.body;
    if (!body.name || !body.name.trim()) return error("Student name is required", 400);
    const dobErr = validDob(body.dob);
    if (dobErr) return error(dobErr, 400);
    const age = ageFromDob(body.dob);
    const record = {
      name: body.name.trim(),
      phone: body.phone || "",
      email: body.email || "",
      dob: body.dob || "",
      branch: membershipCategoryForAge(age),
      region: body.region || "",
      guardianName: body.guardianName || "",
      status: "active",
      joinedDate: today(),
      subscriptionExpiry: plusDays(365),
      institutionId: ctx.institution.id,
      institutionName: ctx.institution.name,
      source: "institution",
      memberType: age >= 18 ? "adult" : "youth",
      membershipNo: body.membershipNo || "",
      interests: body.interests || "",
      guardianPhone: body.guardianPhone || ""
    };
    const [id] = await db.add("members", [record]);
    if (!id) return error("Failed to add student", 500);
    return json({ id, ...record }, 201);
  }],
  "PUT /api/institution/members/:id": [requireAuth(), requireInstitutionSession(), async (ctx) => {
    const [existing] = await db.get("members", [ctx.params.id]);
    if (!existing || existing.institutionId !== ctx.institution.id) return error("Student not found", 404);
    const body = ctx.body;
    if (body.dob !== void 0) {
      const e = validDob(body.dob);
      if (e) return error(e, 400);
    }
    const merged = { ...existing, ...body, institutionId: ctx.institution.id, institutionName: ctx.institution.name, source: "institution" };
    merged.branch = unitForDob(merged.dob);
    const [ok] = await db.update("members", [{ id: ctx.params.id, record: merged }]);
    if (!ok) return error("Failed to update student", 500);
    return json({ id: ctx.params.id, ...merged });
  }],
  "DELETE /api/institution/members/:id": [requireAuth(), requireInstitutionSession(), async (ctx) => {
    const [existing] = await db.get("members", [ctx.params.id]);
    if (!existing || existing.institutionId !== ctx.institution.id) return error("Student not found", 404);
    const [ok] = await db.delete("members", [ctx.params.id]);
    if (!ok) return error("Failed to remove student", 500);
    return json({ ok: true });
  }],
  "GET /api/institution/categories": [requireAuth(), requireInstitutionSession(), async (ctx) => {
    const { items } = await db.list("institution_categories", { filter: { institutionId: ctx.institution.id }, limit: 100 });
    return json({ items });
  }],
  "POST /api/institution/categories": [requireAuth(), requireInstitutionSession(), async (ctx) => {
    const body = ctx.body;
    if (!body.name || !body.name.trim()) return error("Category name is required", 400);
    const [id] = await db.add("institution_categories", [{ institutionId: ctx.institution.id, name: body.name.trim() }]);
    if (!id) return error("Failed to add category", 500);
    return json({ id, name: body.name.trim() }, 201);
  }],
  "DELETE /api/institution/categories/:id": [requireAuth(), requireInstitutionSession(), async (ctx) => {
    const [cat] = await db.get("institution_categories", [ctx.params.id]);
    if (!cat || cat.institutionId !== ctx.institution.id) return error("Category not found", 404);
    await db.delete("institution_categories", [ctx.params.id]);
    return json({ ok: true });
  }],
  "GET /api/admin/me": [requireAuth(), requireAdminSession(), async (ctx) => json(ctx.admin)],
  "GET /api/branding": [async () => {
    const { items } = await db.list("settings", { limit: 1 });
    return json(items[0] || DEFAULT_BRANDING);
  }],
  "PUT /api/admin/branding": [requireAuth(), requireAdminSession(), requireSuperAdmin(), async (ctx) => {
    const body = ctx.body;
    if (typeof body.logo === "string" && body.logo) {
      if (!/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(body.logo)) return error("Logo must be a PNG, JPEG, WebP or SVG image.", 400);
      if (body.logo.length > 4e5) return error("Logo is too large. Please use an image under 250 KB.", 400);
    }
    const { items } = await db.list("settings", { limit: 1 });
    const current = items[0] || DEFAULT_BRANDING;
    const record = {
      orgName: (body.orgName ?? current.orgName).trim() || DEFAULT_BRANDING.orgName,
      tagline: (body.tagline ?? current.tagline).trim(),
      logo: body.logo !== void 0 ? body.logo : current.logo
    };
    if (items[0]) await db.update("settings", [{ id: items[0].id, record }]);
    else await db.add("settings", [record]);
    return json(record);
  }],
  "GET /api/admin/accounts": [requireAuth(), requireAdminSession(), requireManageAdmins(), async () => {
    const { items } = await db.list("admins", { limit: 100 });
    return json({ items });
  }],
  "POST /api/admin/accounts/invite": [requireAuth(), requireAdminSession(), requireManageAdmins(), async (ctx) => {
    const body = ctx.body;
    if (!body.email || !body.email.trim()) return error("Email is required", 400);
    const emailNorm = body.email.trim().toLowerCase();
    const canManageAdmins = ctx.admin.isSuperAdmin ? !!body.canManageAdmins : false;
    const existing = await db.list("admins", { filter: { email: emailNorm }, limit: 1 });
    if (existing.items.length > 0) {
      const ex = existing.items[0];
      if (ex.status === "active") return error("This email already has an active admin account.", 400);
      const updated = { ...ex, canEdit: !!body.canEdit, canManageAdmins };
      await db.update("admins", [{ id: ex.id, record: updated }]);
      return json({ id: ex.id, ...updated });
    }
    const record = { email: emailNorm, status: "invited", isSuperAdmin: false, canEdit: !!body.canEdit, canManageAdmins };
    const [id] = await db.add("admins", [record]);
    if (!id) return error("Failed to invite admin", 500);
    return json({ id, ...record }, 201);
  }],
  "PUT /api/admin/accounts/:id/rights": [requireAuth(), requireAdminSession(), requireManageAdmins(), async (ctx) => {
    const [target] = await db.get("admins", [ctx.params.id]);
    if (!target) return error("Admin account not found", 404);
    if (target.isSuperAdmin) return error("The Super Admin\u2019s rights cannot be changed.", 400);
    const body = ctx.body;
    const merged = { ...target };
    if (typeof body.canEdit === "boolean") merged.canEdit = body.canEdit;
    if (typeof body.canManageAdmins === "boolean") {
      if (!ctx.admin.isSuperAdmin) return error("Only the Super Admin can grant admin-management rights.", 403);
      merged.canManageAdmins = body.canManageAdmins;
    }
    const [ok] = await db.update("admins", [{ id: ctx.params.id, record: merged }]);
    if (!ok) return error("Failed to update admin rights", 500);
    return json({ id: ctx.params.id, ...merged });
  }],
  "DELETE /api/admin/accounts/:id": [requireAuth(), requireAdminSession(), requireSuperAdmin(), async (ctx) => {
    const [target] = await db.get("admins", [ctx.params.id]);
    if (!target) return error("Admin account not found", 404);
    if (target.isSuperAdmin) return error("The Super Admin account cannot be removed.", 400);
    await db.delete("admins", [ctx.params.id]);
    return json({ ok: true });
  }],
  "POST /api/admin/wipe-demo-data": [requireAuth(), requireAdminSession(), requireSuperAdmin(), async () => {
    const tables = ["members", "transactions", "events", "participations", "communications", "institutions", "institution_categories"];
    const counts = {};
    for (const table2 of tables) {
      const { items } = await db.list(table2, { limit: 500 });
      const ids = items.map((i) => i.id);
      if (ids.length > 0) await db.delete(table2, ids);
      counts[table2] = ids.length;
    }
    return json({ ok: true, counts });
  }],
  "GET /api/admin/members": [requireAuth(), requireAdminSession(), async () => {
    const { items } = await db.list("members", { limit: 500 });
    return json({ items: items.sort((a, b) => a.name.localeCompare(b.name)) });
  }],
  "POST /api/admin/members": [requireAuth(), requireAdminSession(), requireEditRights(), async (ctx) => {
    const body = ctx.body;
    if (!body.name || !body.name.trim()) return error("Member name is required", 400);
    const dobErr = validDob(body.dob);
    if (dobErr) return error(dobErr, 400);
    const loginUserId = ctx.body.__loginUserId;
    const age = ageFromDob(body.dob);
    const record = {
      name: body.name.trim(),
      phone: body.phone || "",
      email: body.email || "",
      dob: body.dob || "",
      branch: membershipCategoryForAge(age),
      region: body.region || "",
      guardianName: body.guardianName || "",
      status: "active",
      joinedDate: today(),
      subscriptionExpiry: plusDays(365),
      source: "admin",
      memberType: age >= 18 ? "adult" : "youth",
      ...loginUserId ? { ownerUserId: loginUserId } : {}
    };
    const [id] = await db.add("members", [record]);
    if (!id) return error("Failed to create member", 500);
    return json({ id, ...record }, 201);
  }],
  "GET /api/admin/institutions": [requireAuth(), requireAdminSession(), async () => {
    const { items } = await db.list("institutions", { limit: 500 });
    const { items: members } = await db.list("members", { limit: 5e3 });
    const counts = /* @__PURE__ */ new Map();
    for (const m of members) if (m.institutionId) counts.set(m.institutionId, (counts.get(m.institutionId) || 0) + 1);
    return json({ items: items.map((i) => ({ ...i, memberCount: counts.get(i.id) || 0 })).sort((a, b) => a.name.localeCompare(b.name)) });
  }],
  "POST /api/admin/institutions": [requireAuth(), requireAdminSession(), requireEditRights(), async (ctx) => {
    const body = ctx.body;
    if (!body.name || !body.name.trim()) return error("Institution name is required", 400);
    if (!body.__loginUserId) return error("Institution login could not be created", 400);
    const record = {
      userId: body.__loginUserId,
      name: body.name.trim(),
      email: body.email || "",
      phone: body.phone || "",
      address: body.address || "",
      county: body.county || "",
      subCounty: body.subCounty || "",
      principalName: body.principalName || "",
      principalMobile: body.principalMobile || "",
      principalEmail: body.principalEmail || "",
      noOfUnits: body.noOfUnits || "",
      noOfGuidesInUnit: body.noOfGuidesInUnit || "",
      guideLeaderName: body.guideLeaderName || "",
      guideLeaderPhone: body.guideLeaderPhone || "",
      guideLeaderEmail: body.guideLeaderEmail || "",
      meetingDayTime: body.meetingDayTime || ""
    };
    const [id] = await db.add("institutions", [record]);
    if (!id) return error("Failed to create institution account", 500);
    return json({ id, ...record }, 201);
  }],
  "PUT /api/admin/members/:id": [requireAuth(), requireAdminSession(), requireEditRights(), async (ctx) => {
    const [existing] = await db.get("members", [ctx.params.id]);
    if (!existing) return error("Member not found", 404);
    const body = ctx.body;
    if (body.dob !== void 0) {
      const e = validDob(body.dob);
      if (e) return error(e, 400);
    }
    const merged = { ...existing, ...body };
    delete merged.__loginUserId;
    merged.ownerUserId = existing.ownerUserId;
    if (!existing.institutionId) merged.branch = unitForDob(merged.dob);
    const [ok] = await db.update("members", [{ id: ctx.params.id, record: merged }]);
    if (!ok) return error("Failed to update member", 500);
    return json({ id: ctx.params.id, ...merged });
  }],
  "DELETE /api/admin/members/:id": [requireAuth(), requireAdminSession(), requireEditRights(), async (ctx) => {
    const [ok] = await db.delete("members", [ctx.params.id]);
    if (!ok) return error("Failed to delete member", 500);
    return json({ ok: true });
  }],
  "POST /api/admin/members/transition-check": [requireAuth(), requireAdminSession(), requireEditRights(), async () => {
    const { items } = await db.list("members", { limit: 500 });
    let updated = 0;
    for (const m of items) {
      if (m.institutionId) continue;
      const age = ageFromDob(m.dob);
      if (age === null) continue;
      const newBranch = membershipCategoryForAge(age);
      if (newBranch !== m.branch) {
        await db.update("members", [{ id: m.id, record: { ...m, branch: newBranch } }]);
        updated++;
      }
    }
    return json({ updated });
  }],
  "POST /api/admin/members/compliance-check": [requireAuth(), requireAdminSession(), requireEditRights(), async () => {
    const { items } = await db.list("members", { limit: 500 });
    let suspended = 0, expelled = 0;
    for (const m of items) {
      if (m.status === "expelled") continue;
      const overdue = daysBetween(m.subscriptionExpiry);
      if (overdue > 90) {
        await db.update("members", [{ id: m.id, record: { ...m, status: "expelled" } }]);
        expelled++;
      } else if (overdue > 30 && m.status === "active") {
        await db.update("members", [{ id: m.id, record: { ...m, status: "suspended" } }]);
        suspended++;
      }
    }
    return json({ suspended, expelled });
  }],
  "POST /api/admin/members/:id/invoice": [requireAuth(), requireAdminSession(), requireEditRights(), async (ctx) => {
    const [m] = await db.get("members", [ctx.params.id]);
    if (!m) return error("Member not found", 404);
    const body = ctx.body;
    if (!body.amount || body.amount <= 0) return error("A positive amount is required", 400);
    const record = { memberId: ctx.params.id, memberName: m.name, type: "invoice", amount: body.amount, description: body.description || "Membership Subscription", date: today(), status: "pending" };
    const [id] = await db.add("transactions", [record]);
    if (!id) return error("Failed to create invoice", 500);
    return json({ id, ...record }, 201);
  }],
  "POST /api/admin/members/:id/reminder": [requireAuth(), requireAdminSession(), requireEditRights(), async (ctx) => {
    const [m] = await db.get("members", [ctx.params.id]);
    if (!m) return error("Member not found", 404);
    await db.add("communications", [{ type: "reminder", subject: "Subscription Renewal Reminder", body: `Reminder sent to ${m.name}`, audience: m.name, recipientCount: 1, date: today() }]);
    return json({ ok: true });
  }],
  "GET /api/admin/transactions": [requireAuth(), requireAdminSession(), async (ctx) => {
    const memberId = ctx.query.memberId;
    const { items } = await db.list("transactions", { limit: 500 });
    const sorted = items.sort((a, b) => a.date < b.date ? 1 : -1);
    const filtered = memberId ? sorted.filter((t) => t.memberId === memberId) : sorted;
    return json({ items: filtered });
  }],
  "POST /api/admin/transactions/:id/pay": [requireAuth(), requireAdminSession(), requireEditRights(), async (ctx) => {
    const [inv] = await db.get("transactions", [ctx.params.id]);
    if (!inv) return error("Invoice not found", 404);
    if (inv.type !== "invoice") return error("Only invoices can be marked paid", 400);
    await db.update("transactions", [{ id: ctx.params.id, record: { ...inv, status: "paid" } }]);
    const receipt = { memberId: inv.memberId, memberName: inv.memberName, type: "receipt", amount: inv.amount, description: `Receipt for: ${inv.description}`, date: today(), status: "paid", linkedInvoiceId: ctx.params.id };
    await db.add("transactions", [receipt]);
    const [m] = await db.get("members", [inv.memberId]);
    if (m) {
      const base = daysBetween(m.subscriptionExpiry) > 0 ? today() : m.subscriptionExpiry;
      const newExpiry = new Date(base);
      newExpiry.setDate(newExpiry.getDate() + 365);
      const restoredStatus = m.status === "expelled" || m.status === "suspended" ? "active" : m.status;
      await db.update("members", [{ id: inv.memberId, record: { ...m, status: restoredStatus, subscriptionExpiry: newExpiry.toISOString().slice(0, 10) } }]);
    }
    return json({ ok: true });
  }],
  "GET /api/admin/export/transactions.csv": [requireAuth(), requireAdminSession(), async () => {
    const { items } = await db.list("transactions", { limit: 500 });
    const headerRow = "Member,Type,Description,Date,Amount(KES),Status\n";
    const rows = items.map((t) => `"${t.memberName}",${t.type},"${t.description}",${t.date},${t.amount},${t.status}`).join("\n");
    return json({ csv: headerRow + rows });
  }],
  "GET /api/admin/messages": [requireAuth(), requireAdminSession(), async () => {
    const { items } = await db.list("communications", { limit: 200 });
    return json({ items: items.sort((a, b) => a.date < b.date ? 1 : -1) });
  }],
  "POST /api/admin/notices": [requireAuth(), requireAdminSession(), requireSuperAdmin(), async (ctx) => {
    const body = ctx.body;
    if (!body.subject?.trim() || !body.body?.trim()) return error("Title and notice are required", 400);
    const { items: members } = await db.list("members", { limit: 500 });
    const record = { type: "notice", subject: body.subject.trim(), body: body.body.trim(), audience: "all", recipientCount: members.length, date: today() };
    const [id] = await db.add("communications", [record]);
    if (!id) return error("Failed to publish notice", 500);
    return json({ id, ...record }, 201);
  }],
  "POST /api/admin/messages/bulk": [requireAuth(), requireAdminSession(), requireEditRights(), async (ctx) => {
    const body = ctx.body;
    if (!body.subject || !body.body) return error("Subject and message body are required", 400);
    const { items } = await db.list("members", { limit: 500 });
    let recipients = items;
    const audience = body.audience || "all";
    if (audience.startsWith("branch:")) {
      const branch = audience.slice(7);
      recipients = items.filter((m) => m.branch === branch);
    } else if (audience.startsWith("status:")) {
      const status = audience.slice(7);
      recipients = items.filter((m) => m.status === status);
    }
    const record = { type: "bulk", subject: body.subject, body: body.body, audience, recipientCount: recipients.length, date: today() };
    const [id] = await db.add("communications", [record]);
    if (!id) return error("Failed to send message", 500);
    return json({ id, recipientCount: recipients.length });
  }],
  "GET /api/admin/events": [requireAuth(), requireAdminSession(), async () => {
    const { items } = await db.list("events", { limit: 200 });
    return json({ items: items.sort((a, b) => a.date < b.date ? -1 : 1) });
  }],
  "POST /api/admin/events": [requireAuth(), requireAdminSession(), requireEditRights(), async (ctx) => {
    const body = ctx.body;
    if (!body.title || !body.date) return error("Title and date are required", 400);
    const record = { title: body.title, date: body.date, location: body.location || "", description: body.description || "" };
    const [id] = await db.add("events", [record]);
    if (!id) return error("Failed to create event", 500);
    return json({ id, ...record }, 201);
  }],
  "DELETE /api/admin/events/:id": [requireAuth(), requireAdminSession(), requireEditRights(), async (ctx) => {
    await db.delete("events", [ctx.params.id]);
    return json({ ok: true });
  }],
  "GET /api/admin/events/:id/participants": [requireAuth(), requireAdminSession(), async (ctx) => {
    const { items } = await db.list("participations", { filter: { eventId: ctx.params.id }, limit: 200 });
    return json({ items });
  }],
  "POST /api/admin/events/:id/participants": [requireAuth(), requireAdminSession(), requireEditRights(), async (ctx) => {
    const [ev] = await db.get("events", [ctx.params.id]);
    if (!ev) return error("Event not found", 404);
    const body = ctx.body;
    if (!body.memberId) return error("memberId is required", 400);
    const [m] = await db.get("members", [body.memberId]);
    if (!m) return error("Member not found", 404);
    const record = { eventId: ctx.params.id, memberId: body.memberId, memberName: m.name, eventTitle: ev.title, date: today() };
    const [id] = await db.add("participations", [record]);
    if (!id) return error("Failed to register participant", 500);
    return json({ id, ...record }, 201);
  }],
  "GET /api/admin/reports/summary": [requireAuth(), requireAdminSession(), async () => {
    const [{ items: members }, { items: transactions }, { items: events }] = await Promise.all([
      db.list("members", { limit: 500 }),
      db.list("transactions", { limit: 500 }),
      db.list("events", { limit: 200 })
    ]);
    const byBranch = {};
    const byStatus = {};
    const byRegion = {};
    let overdueCount = 0;
    for (const m of members) {
      byBranch[m.branch] = (byBranch[m.branch] || 0) + 1;
      byStatus[m.status] = (byStatus[m.status] || 0) + 1;
      if (m.region) byRegion[m.region] = (byRegion[m.region] || 0) + 1;
      if (daysBetween(m.subscriptionExpiry) > 0 && m.status !== "expelled") overdueCount++;
    }
    const revenueCollected = transactions.filter((t) => t.status === "paid" && t.type === "receipt").reduce((s, t) => s + t.amount, 0);
    const pendingInvoicesAmount = transactions.filter((t) => t.type === "invoice" && t.status === "pending").reduce((s, t) => s + t.amount, 0);
    const upcomingEvents = events.filter((e) => e.date >= today()).length;
    return json({ totalMembers: members.length, byBranch, byStatus, byRegion, revenueCollected, pendingInvoicesAmount, overdueCount, upcomingEvents });
  }]
});

// server/app.ts
if (existsSync(".env")) process.loadEnvFile(".env");
var scrypt = promisify(scryptCb);
var SESSION_MS = 7 * 24 * 3600 * 1e3;
var MIN_PASSWORD = 8;
var upsertUser = (u) => pool().query(
  `INSERT INTO auth_users (id, email, name, salt, hash) VALUES ($1,$2,$3,$4,$5)
   ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, salt = EXCLUDED.salt, hash = EXCLUDED.hash`,
  [u.id, u.email, u.name, u.salt, u.hash]
);
var dropSession = (token) => pool().query("DELETE FROM auth_sessions WHERE token = $1", [token]);
var normEmail = (e) => String(e || "").trim().toLowerCase();
var validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
var findUser = async (email) => (await pool().query("SELECT id, email, name, salt, hash FROM auth_users WHERE email = $1", [email])).rows[0];
async function hashPassword(password, saltHex = randomBytes(16).toString("hex")) {
  return { salt: saltHex, hash: (await scrypt(password, Buffer.from(saltHex, "hex"), 64)).toString("hex") };
}
async function verifyPassword(user, password) {
  const { hash } = await hashPassword(password, user?.salt ?? "00".repeat(16));
  if (!user) return false;
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(user.hash, "hex"));
}
async function createUser(email, password, name = "") {
  const user = { id: randomUUID2(), email, name: name || email, ...await hashPassword(password) };
  await upsertUser(user);
  return user;
}
async function deleteUser(userId) {
  await pool().query("DELETE FROM auth_users WHERE id = $1", [userId]);
}
async function issueToken(userId) {
  const token = randomBytes(32).toString("hex");
  await pool().query("INSERT INTO auth_sessions (token, user_id, expires_at) VALUES ($1,$2,$3)", [token, userId, Date.now() + SESSION_MS]);
  return token;
}
async function sessionUser(req) {
  const m = /^Bearer\s+(\w+)$/i.exec(String(req.headers.authorization || ""));
  if (!m) return void 0;
  const { rows } = await pool().query(
    `SELECT s.token, s.expires_at, u.id, u.email, u.name FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id WHERE s.token = $1`,
    [m[1]]
  );
  const r = rows[0];
  if (!r) return void 0;
  if (Number(r.expires_at) < Date.now()) {
    await dropSession(m[1]);
    return void 0;
  }
  return { token: m[1], userId: r.id, email: r.email, name: r.name };
}
var failures = /* @__PURE__ */ new Map();
function throttled(key) {
  const f = failures.get(key);
  return !!f && f.until > Date.now();
}
function recordFailure(key) {
  const f = failures.get(key) ?? { count: 0, until: 0 };
  f.count += 1;
  if (f.count >= 5) {
    f.until = Date.now() + 10 * 60 * 1e3;
    f.count = 0;
  }
  failures.set(key, f);
}
async function seedSuperAdmin() {
  const email = normEmail(process.env.SUPER_ADMIN_EMAIL);
  const password = process.env.SUPER_ADMIN_PASSWORD || "";
  if (!email || !password) {
    console.warn("SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set: no Super Admin seeded.");
    return;
  }
  if (password.length < MIN_PASSWORD) throw new Error("SUPER_ADMIN_PASSWORD must be at least 8 characters");
  const name = process.env.SUPER_ADMIN_NAME || "Super Admin";
  let user = await findUser(email);
  if (!user) user = await createUser(email, password, name);
  else if (!await verifyPassword(user, password)) {
    Object.assign(user, await hashPassword(password));
    await upsertUser(user);
  }
  const { items } = await db.list("admins", { filter: { email }, limit: 1 });
  const record = { userId: user.id, email, name: user.name, status: "active", isSuperAdmin: true, canEdit: true, canManageAdmins: true };
  if (items[0]) await db.update("admins", [{ id: items[0].id, record }]);
  else await db.add("admins", [record]);
}
var ready;
function init() {
  ready ??= (async () => {
    await migrate();
    await seedSuperAdmin();
  })().catch((e) => {
    ready = void 0;
    throw e;
  });
  return ready;
}
async function readBody(req) {
  const pre = req.body;
  if (pre !== void 0 && pre !== null && typeof pre === "object" && !Buffer.isBuffer(pre)) return pre;
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 2e6) throw new Error("Payload too large");
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}
async function authRoute(path, body, ip, req) {
  if (path === "/api/auth/login") {
    const email = normEmail(body.email);
    const key = `${ip}|${email}`;
    if (throttled(key)) return error("Too many failed attempts. Please try again in 10 minutes.", 429);
    const user = await findUser(email);
    if (!await verifyPassword(user, String(body.password || ""))) {
      recordFailure(key);
      return error("Invalid email or password.", 401);
    }
    failures.delete(key);
    return json({ token: await issueToken(user.id), user: { email: user.email, name: user.name } });
  }
  if (path === "/api/auth/register") {
    const email = normEmail(body.email);
    const password = String(body.password || "");
    if (!validEmail(email)) return error("Enter a valid email address.", 400);
    if (password.length < MIN_PASSWORD) return error(`Password must be at least ${MIN_PASSWORD} characters.`, 400);
    if (await findUser(email)) return error("An account with this email already exists.", 409);
    const { items } = await db.list("admins", { filter: { email }, limit: 1 });
    if (items.length > 0) return error("This email belongs to an administrator. Sign in with the password your Super Admin gave you.", 403);
    const user = await createUser(email, password);
    return json({ token: await issueToken(user.id), user: { email: user.email, name: user.name } }, 201);
  }
  if (path === "/api/auth/logout") {
    const u = await sessionUser(req);
    if (u) await dropSession(u.token);
    return json({ ok: true });
  }
  return null;
}
async function handle(req, res) {
  const send = (r) => {
    res.writeHead(r.status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(JSON.stringify(r.body));
  };
  try {
    await init();
    const url = new URL(req.url || "/", "http://localhost");
    const method = req.method || "GET";
    const requestedPath = url.searchParams.get("__path");
    const path = requestedPath ? `/api/${requestedPath}` : url.pathname;
    const body = ["POST", "PUT", "PATCH"].includes(method) ? await readBody(req) : {};
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    const query = Object.fromEntries(url.searchParams);
    const auth = await authRoute(path, body, ip, req);
    if (auth) return send(auth);
    const me = await sessionUser(req);
    const createAccountMatch = /^\/api\/admin\/accounts\/(individual|institution)$/.exec(path);
    if (method === "POST" && createAccountMatch && me) {
      const email = normEmail(body.loginEmail);
      const password = String(body.password || "");
      const name = String(body.name || "").trim();
      if (!validEmail(email)) return send(error("Enter a valid login email address.", 400));
      if (password.length < MIN_PASSWORD) return send(error(`Set a temporary password of at least ${MIN_PASSWORD} characters.`, 400));
      if (!name) return send(error("Name is required.", 400));
      if (await findUser(email)) return send(error("An account with this email already exists.", 409));
      const user = await createUser(email, password, name);
      const target = createAccountMatch[1] === "individual" ? "/api/admin/members" : "/api/admin/institutions";
      const result = await handler("POST", target, {
        user: me,
        body: { ...body, email: body.email || email, __loginUserId: user.id },
        query
      });
      if (result.status >= 300) await deleteUser(user.id);
      return send(result);
    }
    if (method === "POST" && path === "/api/admin/accounts/invite" && me) {
      const email = normEmail(body.email);
      const password = String(body.password || "");
      const exists = email ? await findUser(email) : void 0;
      if (email && !exists && password.length < MIN_PASSWORD) return send(error(`Set a temporary password of at least ${MIN_PASSWORD} characters for the new admin.`, 400));
      const result = await handler(method, path, { user: me, body, query });
      if (result.status < 300 && email && !exists) await createUser(email, password);
      return send(result);
    }
    send(await handler(method, path, { user: me, body, query }));
  } catch (e) {
    console.error(e);
    send(error(e?.message === "Payload too large" ? "Payload too large" : "Something went wrong.", e?.message === "Payload too large" ? 413 : 500));
  }
}

// server/vercel.ts
var vercel_default = handle;
export {
  vercel_default as default
};
