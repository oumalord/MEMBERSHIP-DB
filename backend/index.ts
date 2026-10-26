import { router, json, error, db, requireAuth } from '@appdeploy/sdk';
import { membershipCategoryForAge } from '../membership-categories';

type Middleware = (ctx: any) => Promise<any>;

interface Branding { orgName: string; tagline: string; logo: string }
const DEFAULT_BRANDING: Branding = { orgName: 'KGGA', tagline: 'Girls creating a better world', logo: '' };

function ageFromDob(dob?: string): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

// The guide unit is always derived from the date of birth, never typed in.
function unitForDob(dob?: string): string {
  const age = ageFromDob(dob);
  return age === null ? 'Unassigned' : membershipCategoryForAge(age);
}

function validDob(dob?: string): string | null {
  const age = ageFromDob(dob);
  if (age === null) return 'A valid date of birth is required to place the member in a guide unit.';
  if (age < 0 || age > 120) return 'Date of birth is not valid.';
  if (age < 3) return 'Members must be at least 3 years old to join a category.';
  return null;
}

function today(): string { return new Date().toISOString().slice(0, 10); }
function plusDays(days: number): string { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
function daysBetween(dateStr: string): number { const d = new Date(dateStr); const now = new Date(); return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)); }

interface Member {
  name: string; phone?: string; email?: string; dob?: string; branch: string; region?: string;
  guardianName?: string; status: 'active' | 'pending' | 'suspended' | 'expelled'; joinedDate: string; subscriptionExpiry: string;
  institutionId?: string; institutionName?: string; ownerUserId?: string; source: 'admin' | 'institution' | 'self';
  memberType?: 'youth' | 'adult'; membershipNo?: string; interests?: string; guardianPhone?: string;
  idNo?: string; maritalStatus?: string; poBox?: string; town?: string;
  occupation?: string; employer?: string; workPhone?: string; workEmail?: string; otherSkills?: string;
  nextOfKinName?: string; nextOfKinRelationship?: string; nextOfKinPhone?: string; nextOfKinEmail?: string;
  yearJoinedGuiding?: string; levelsUndertaken?: string; trainingsReceived?: string; guidingAwards?: string;
  leadershipHistory?: string; currentInvolvement?: string; currentLevelOfEngagement?: string; currentSupport?: string;
}

interface Transaction {
  memberId: string; memberName: string; type: 'invoice' | 'receipt'; amount: number; description: string; date: string; status: 'pending' | 'paid'; linkedInvoiceId?: string;
}

interface AdminRecord {
  userId?: string; email: string; name?: string; status: 'invited' | 'active';
  isSuperAdmin: boolean; canEdit: boolean; canManageAdmins: boolean;
}

interface InstitutionRecord {
  userId: string; name: string; email?: string; phone?: string; address?: string;
  county?: string; subCounty?: string; principalName?: string; principalMobile?: string; principalEmail?: string;
  noOfUnits?: string; noOfGuidesInUnit?: string; guideLeaderName?: string; guideLeaderPhone?: string; guideLeaderEmail?: string; meetingDayTime?: string;
}

async function resolveAdminSession(user: { userId: string; email?: string; name?: string }): Promise<(AdminRecord & { id: string }) | null> {
  const byUser = await db.list<AdminRecord>('admins', { filter: { userId: user.userId }, limit: 1 });
  if (byUser.items.length > 0) return byUser.items[0];

  const any = await db.list<AdminRecord>('admins', { limit: 1 });
  if (any.items.length === 0) {
    const record: AdminRecord = { userId: user.userId, email: user.email || '', name: user.name || user.email || 'Super Admin', status: 'active', isSuperAdmin: true, canEdit: true, canManageAdmins: true };
    const [id] = await db.add('admins', [record]);
    if (!id) throw new Error('Failed to bootstrap admin account');
    return { id, ...record };
  }

  if (user.email) {
    const byEmail = await db.list<AdminRecord>('admins', { filter: { email: user.email, status: 'invited' }, limit: 1 });
    if (byEmail.items.length > 0) {
      const inv = byEmail.items[0];
      const updated: AdminRecord = { ...inv, userId: user.userId, name: user.name || inv.email, status: 'active' };
      await db.update('admins', [{ id: inv.id, record: updated }]);
      return { id: inv.id, ...updated };
    }
  }
  return null;
}

function requireAdminSession(): Middleware {
  return async (ctx: any) => {
    const rec = await resolveAdminSession(ctx.user);
    if (!rec) return error('No admin account found for this login. Ask your Super Admin for an invitation.', 403);
    ctx.admin = rec;
  };
}

function requireEditRights(): Middleware {
  return async (ctx: any) => {
    if (!ctx.admin.canEdit) return error('You have view-only access. Editing rights are required for this action.', 403);
  };
}

function requireManageAdmins(): Middleware {
  return async (ctx: any) => {
    if (!ctx.admin.isSuperAdmin && !ctx.admin.canManageAdmins) return error('You do not have permission to manage admin accounts.', 403);
  };
}

function requireSuperAdmin(): Middleware {
  return async (ctx: any) => {
    if (!ctx.admin.isSuperAdmin) return error('Only the Super Admin can perform this action.', 403);
  };
}

async function findInstitution(userId: string) {
  const { items } = await db.list<InstitutionRecord>('institutions', { filter: { userId }, limit: 1 });
  return items.length > 0 ? items[0] : null;
}

function requireInstitutionSession(): Middleware {
  return async (ctx: any) => {
    const inst = await findInstitution(ctx.user.userId);
    if (!inst) return error('No institution account found for this login. Please sign up as an institution first.', 403);
    ctx.institution = inst;
  };
}

export const handler = router({
  'GET /api/_healthcheck': [async () => json({ message: 'Success' })],

  'GET /api/account/status': [requireAuth(), async (ctx: any) => {
    const [admins, insts, mems] = await Promise.all([
      db.list<AdminRecord>('admins', { filter: { userId: ctx.user.userId }, limit: 1 }),
      db.list<InstitutionRecord>('institutions', { filter: { userId: ctx.user.userId }, limit: 1 }),
      db.list<Member>('members', { filter: { ownerUserId: ctx.user.userId }, limit: 1 }),
    ]);
    return json({ isAdmin: admins.items.length > 0, isInstitution: insts.items.length > 0, isIndividual: mems.items.length > 0 });
  }],

  'POST /api/account/signup-individual': [requireAuth(), async (ctx: any) => {
    const existing = await db.list<Member>('members', { filter: { ownerUserId: ctx.user.userId }, limit: 1 });
    if (existing.items.length > 0) return json(existing.items[0]);
    const body = ctx.body as Partial<Member>;
    if (!body.name || !body.name.trim()) return error('Full name is required', 400);
    const dobErr = validDob(body.dob);
    if (dobErr) return error(dobErr, 400);
    const record: Member = {
      name: body.name.trim(), phone: body.phone || '', email: body.email || ctx.user.email || '', dob: body.dob || '',
      branch: unitForDob(body.dob), region: body.town || body.region || '', guardianName: body.guardianName || '',
      status: 'active', joinedDate: today(), subscriptionExpiry: plusDays(365), ownerUserId: ctx.user.userId, source: 'self',
      memberType: (ageFromDob(body.dob) ?? 18) >= 18 ? 'adult' : 'youth', idNo: body.idNo || '', maritalStatus: body.maritalStatus || '', poBox: body.poBox || '', town: body.town || '',
      occupation: body.occupation || '', employer: body.employer || '', workPhone: body.workPhone || '', workEmail: body.workEmail || '', otherSkills: body.otherSkills || '',
      nextOfKinName: body.nextOfKinName || '', nextOfKinRelationship: body.nextOfKinRelationship || '', nextOfKinPhone: body.nextOfKinPhone || '', nextOfKinEmail: body.nextOfKinEmail || '',
      yearJoinedGuiding: body.yearJoinedGuiding || '', levelsUndertaken: body.levelsUndertaken || '', trainingsReceived: body.trainingsReceived || '', guidingAwards: body.guidingAwards || '',
      leadershipHistory: body.leadershipHistory || '', currentInvolvement: body.currentInvolvement || '', currentLevelOfEngagement: body.currentLevelOfEngagement || '', currentSupport: body.currentSupport || '',
    };
    const [id] = await db.add('members', [record]);
    if (!id) return error('Failed to create account', 500);
    return json({ id, ...record }, 201);
  }],

  'POST /api/account/signup-institution': [requireAuth(), async (ctx: any) => {
    const existing = await findInstitution(ctx.user.userId);
    if (existing) return json(existing);
    const body = ctx.body as Partial<InstitutionRecord>;
    if (!body.name || !body.name.trim()) return error('Institution name is required', 400);
    const record: InstitutionRecord = {
      userId: ctx.user.userId, name: body.name.trim(), email: body.email || ctx.user.email || '', phone: body.phone || '', address: body.address || '',
      county: body.county || '', subCounty: body.subCounty || '', principalName: body.principalName || '', principalMobile: body.principalMobile || '', principalEmail: body.principalEmail || '',
      noOfUnits: body.noOfUnits || '', noOfGuidesInUnit: body.noOfGuidesInUnit || '', guideLeaderName: body.guideLeaderName || '', guideLeaderPhone: body.guideLeaderPhone || '', guideLeaderEmail: body.guideLeaderEmail || '', meetingDayTime: body.meetingDayTime || '',
    };
    const [id] = await db.add('institutions', [record]);
    if (!id) return error('Failed to create institution account', 500);
    return json({ id, ...record }, 201);
  }],

  'POST /api/admin/session': [requireAuth(), async (ctx: any) => {
    const rec = await resolveAdminSession(ctx.user);
    if (!rec) return error('No admin account found for this login. Ask your Super Admin for an invitation.', 403);
    return json(rec);
  }],

  'GET /api/individual/me': [requireAuth(), async (ctx: any) => {
    const { items } = await db.list<Member>('members', { filter: { ownerUserId: ctx.user.userId }, limit: 1 });
    if (items.length === 0) return error('No individual account found for this login', 404);
    return json(items[0]);
  }],

  'PUT /api/individual/me': [requireAuth(), async (ctx: any) => {
    const { items } = await db.list<Member>('members', { filter: { ownerUserId: ctx.user.userId }, limit: 1 });
    if (items.length === 0) return error('No individual account found for this login', 404);
    const existing = items[0];
    const body = ctx.body as Partial<Member>;
    const merged: any = { ...existing, phone: body.phone ?? existing.phone, email: body.email ?? existing.email, region: body.region ?? existing.region, guardianName: body.guardianName ?? existing.guardianName };
    delete merged.id;
    const [ok] = await db.update('members', [{ id: existing.id, record: merged }]);
    if (!ok) return error('Failed to update your details', 500);
    return json({ id: existing.id, ...merged });
  }],

  'GET /api/individual/transactions': [requireAuth(), async (ctx: any) => {
    const { items: mems } = await db.list<Member>('members', { filter: { ownerUserId: ctx.user.userId }, limit: 1 });
    if (mems.length === 0) return error('No individual account found for this login', 404);
    const { items } = await db.list<Transaction>('transactions', { filter: { memberId: mems[0].id }, limit: 200 });
    return json({ items: items.sort((a, b) => (a.date < b.date ? 1 : -1)) });
  }],

  'GET /api/individual/participations': [requireAuth(), async (ctx: any) => {
    const { items: mems } = await db.list<Member>('members', { filter: { ownerUserId: ctx.user.userId }, limit: 1 });
    if (mems.length === 0) return error('No individual account found for this login', 404);
    const { items } = await db.list('participations', { filter: { memberId: mems[0].id }, limit: 200 });
    return json({ items });
  }],

  'GET /api/institution/me': [requireAuth(), async (ctx: any) => {
    const inst = await findInstitution(ctx.user.userId);
    if (!inst) return error('No institution account found for this login', 404);
    return json(inst);
  }],

  'GET /api/institution/members': [requireAuth(), requireInstitutionSession(), async (ctx: any) => {
    const { items } = await db.list<Member>('members', { filter: { institutionId: ctx.institution.id }, limit: 500 });
    return json({ items: items.sort((a, b) => a.name.localeCompare(b.name)) });
  }],

  'POST /api/institution/members': [requireAuth(), requireInstitutionSession(), async (ctx: any) => {
    const body = ctx.body as Partial<Member>;
    if (!body.name || !body.name.trim()) return error('Student name is required', 400);
    const dobErr = validDob(body.dob);
    if (dobErr) return error(dobErr, 400);
    const age = ageFromDob(body.dob);
    const record: Member = {
      name: body.name.trim(), phone: body.phone || '', email: body.email || '', dob: body.dob || '',
      branch: membershipCategoryForAge(age!),
      region: body.region || '', guardianName: body.guardianName || '', status: 'active', joinedDate: today(), subscriptionExpiry: plusDays(365),
      institutionId: ctx.institution.id, institutionName: ctx.institution.name, source: 'institution', memberType: age! >= 18 ? 'adult' : 'youth',
      membershipNo: body.membershipNo || '', interests: body.interests || '', guardianPhone: body.guardianPhone || '',
    };
    const [id] = await db.add('members', [record]);
    if (!id) return error('Failed to add student', 500);
    return json({ id, ...record }, 201);
  }],

  'PUT /api/institution/members/:id': [requireAuth(), requireInstitutionSession(), async (ctx: any) => {
    const [existing] = await db.get<Member>('members', [ctx.params.id]);
    if (!existing || existing.institutionId !== ctx.institution.id) return error('Student not found', 404);
    const body = ctx.body as Partial<Member>;
    if (body.dob !== undefined) { const e = validDob(body.dob); if (e) return error(e, 400); }
    const merged = { ...existing, ...body, institutionId: ctx.institution.id, institutionName: ctx.institution.name, source: 'institution' as const };
    merged.branch = unitForDob(merged.dob);
    const [ok] = await db.update('members', [{ id: ctx.params.id, record: merged }]);
    if (!ok) return error('Failed to update student', 500);
    return json({ id: ctx.params.id, ...merged });
  }],

  'DELETE /api/institution/members/:id': [requireAuth(), requireInstitutionSession(), async (ctx: any) => {
    const [existing] = await db.get<Member>('members', [ctx.params.id]);
    if (!existing || existing.institutionId !== ctx.institution.id) return error('Student not found', 404);
    const [ok] = await db.delete('members', [ctx.params.id]);
    if (!ok) return error('Failed to remove student', 500);
    return json({ ok: true });
  }],

  'GET /api/institution/categories': [requireAuth(), requireInstitutionSession(), async (ctx: any) => {
    const { items } = await db.list('institution_categories', { filter: { institutionId: ctx.institution.id }, limit: 100 });
    return json({ items });
  }],

  'POST /api/institution/categories': [requireAuth(), requireInstitutionSession(), async (ctx: any) => {
    const body = ctx.body as { name?: string };
    if (!body.name || !body.name.trim()) return error('Category name is required', 400);
    const [id] = await db.add('institution_categories', [{ institutionId: ctx.institution.id, name: body.name.trim() }]);
    if (!id) return error('Failed to add category', 500);
    return json({ id, name: body.name.trim() }, 201);
  }],

  'DELETE /api/institution/categories/:id': [requireAuth(), requireInstitutionSession(), async (ctx: any) => {
    const [cat] = await db.get<{ institutionId: string }>('institution_categories', [ctx.params.id]);
    if (!cat || cat.institutionId !== ctx.institution.id) return error('Category not found', 404);
    await db.delete('institution_categories', [ctx.params.id]);
    return json({ ok: true });
  }],

  'GET /api/admin/me': [requireAuth(), requireAdminSession(), async (ctx: any) => json(ctx.admin)],

  'GET /api/branding': [async () => {
    const { items } = await db.list<Branding>('settings', { limit: 1 });
    return json(items[0] || DEFAULT_BRANDING);
  }],

  'PUT /api/admin/branding': [requireAuth(), requireAdminSession(), requireSuperAdmin(), async (ctx: any) => {
    const body = ctx.body as Partial<Branding>;
    if (typeof body.logo === 'string' && body.logo) {
      if (!/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(body.logo)) return error('Logo must be a PNG, JPEG, WebP or SVG image.', 400);
      if (body.logo.length > 400_000) return error('Logo is too large. Please use an image under 250 KB.', 400);
    }
    const { items } = await db.list<Branding>('settings', { limit: 1 });
    const current = items[0] || DEFAULT_BRANDING;
    const record: Branding = {
      orgName: (body.orgName ?? current.orgName).trim() || DEFAULT_BRANDING.orgName,
      tagline: (body.tagline ?? current.tagline).trim(),
      logo: body.logo !== undefined ? body.logo : current.logo,
    };
    if (items[0]) await db.update('settings', [{ id: (items[0] as any).id, record }]);
    else await db.add('settings', [record]);
    return json(record);
  }],

  'GET /api/admin/accounts': [requireAuth(), requireAdminSession(), requireManageAdmins(), async () => {
    const { items } = await db.list<AdminRecord>('admins', { limit: 100 });
    return json({ items });
  }],

  'POST /api/admin/accounts/invite': [requireAuth(), requireAdminSession(), requireManageAdmins(), async (ctx: any) => {
    const body = ctx.body as { email?: string; canEdit?: boolean; canManageAdmins?: boolean };
    if (!body.email || !body.email.trim()) return error('Email is required', 400);
    const emailNorm = body.email.trim().toLowerCase();
    const canManageAdmins = ctx.admin.isSuperAdmin ? !!body.canManageAdmins : false;
    const existing = await db.list<AdminRecord>('admins', { filter: { email: emailNorm }, limit: 1 });
    if (existing.items.length > 0) {
      const ex = existing.items[0];
      if (ex.status === 'active') return error('This email already has an active admin account.', 400);
      const updated: AdminRecord = { ...ex, canEdit: !!body.canEdit, canManageAdmins };
      await db.update('admins', [{ id: ex.id, record: updated }]);
      return json({ id: ex.id, ...updated });
    }
    const record: AdminRecord = { email: emailNorm, status: 'invited', isSuperAdmin: false, canEdit: !!body.canEdit, canManageAdmins };
    const [id] = await db.add('admins', [record]);
    if (!id) return error('Failed to invite admin', 500);
    return json({ id, ...record }, 201);
  }],

  'PUT /api/admin/accounts/:id/rights': [requireAuth(), requireAdminSession(), requireManageAdmins(), async (ctx: any) => {
    const [target] = await db.get<AdminRecord>('admins', [ctx.params.id]);
    if (!target) return error('Admin account not found', 404);
    if (target.isSuperAdmin) return error('The Super Admin\u2019s rights cannot be changed.', 400);
    const body = ctx.body as { canEdit?: boolean; canManageAdmins?: boolean };
    const merged: AdminRecord = { ...target };
    if (typeof body.canEdit === 'boolean') merged.canEdit = body.canEdit;
    if (typeof body.canManageAdmins === 'boolean') {
      if (!ctx.admin.isSuperAdmin) return error('Only the Super Admin can grant admin-management rights.', 403);
      merged.canManageAdmins = body.canManageAdmins;
    }
    const [ok] = await db.update('admins', [{ id: ctx.params.id, record: merged }]);
    if (!ok) return error('Failed to update admin rights', 500);
    return json({ id: ctx.params.id, ...merged });
  }],

  'DELETE /api/admin/accounts/:id': [requireAuth(), requireAdminSession(), requireSuperAdmin(), async (ctx: any) => {
    const [target] = await db.get<AdminRecord>('admins', [ctx.params.id]);
    if (!target) return error('Admin account not found', 404);
    if (target.isSuperAdmin) return error('The Super Admin account cannot be removed.', 400);
    await db.delete('admins', [ctx.params.id]);
    return json({ ok: true });
  }],

  'POST /api/admin/wipe-demo-data': [requireAuth(), requireAdminSession(), requireSuperAdmin(), async () => {
    const tables = ['members', 'transactions', 'events', 'participations', 'communications', 'institutions', 'institution_categories'];
    const counts: Record<string, number> = {};
    for (const table of tables) {
      const { items } = await db.list(table, { limit: 500 });
      const ids = items.map((i: any) => i.id);
      if (ids.length > 0) await db.delete(table, ids);
      counts[table] = ids.length;
    }
    return json({ ok: true, counts });
  }],

  'GET /api/admin/members': [requireAuth(), requireAdminSession(), async () => {
    const { items } = await db.list<Member>('members', { limit: 500 });
    return json({ items: items.sort((a, b) => a.name.localeCompare(b.name)) });
  }],

  'POST /api/admin/members': [requireAuth(), requireAdminSession(), requireEditRights(), async (ctx: any) => {
    const body = ctx.body as Partial<Member>;
    if (!body.name || !body.name.trim()) return error('Member name is required', 400);
    const dobErr = validDob(body.dob);
    if (dobErr) return error(dobErr, 400);
    const loginUserId = (ctx.body as any).__loginUserId as string | undefined;
    const age = ageFromDob(body.dob);
    const record: Member = {
      name: body.name.trim(), phone: body.phone || '', email: body.email || '', dob: body.dob || '',
      branch: membershipCategoryForAge(age!), region: body.region || '', guardianName: body.guardianName || '',
      status: 'active', joinedDate: today(), subscriptionExpiry: plusDays(365), source: 'admin',
      memberType: age! >= 18 ? 'adult' : 'youth',
      ...(loginUserId ? { ownerUserId: loginUserId } : {}),
    };
    const [id] = await db.add('members', [record]);
    if (!id) return error('Failed to create member', 500);
    return json({ id, ...record }, 201);
  }],

  'GET /api/admin/institutions': [requireAuth(), requireAdminSession(), async () => {
    const { items } = await db.list<InstitutionRecord>('institutions', { limit: 500 });
    const { items: members } = await db.list<Member>('members', { limit: 5000 });
    const counts = new Map<string, number>();
    for (const m of members) if (m.institutionId) counts.set(m.institutionId, (counts.get(m.institutionId) || 0) + 1);
    return json({ items: items.map((i) => ({ ...i, memberCount: counts.get(i.id) || 0 })).sort((a, b) => a.name.localeCompare(b.name)) });
  }],

  'POST /api/admin/institutions': [requireAuth(), requireAdminSession(), requireEditRights(), async (ctx: any) => {
    const body = ctx.body as Partial<InstitutionRecord> & { __loginUserId?: string };
    if (!body.name || !body.name.trim()) return error('Institution name is required', 400);
    if (!body.__loginUserId) return error('Institution login could not be created', 400);
    const record: InstitutionRecord = {
      userId: body.__loginUserId, name: body.name.trim(), email: body.email || '', phone: body.phone || '', address: body.address || '',
      county: body.county || '', subCounty: body.subCounty || '', principalName: body.principalName || '', principalMobile: body.principalMobile || '', principalEmail: body.principalEmail || '',
      noOfUnits: body.noOfUnits || '', noOfGuidesInUnit: body.noOfGuidesInUnit || '', guideLeaderName: body.guideLeaderName || '', guideLeaderPhone: body.guideLeaderPhone || '', guideLeaderEmail: body.guideLeaderEmail || '', meetingDayTime: body.meetingDayTime || '',
    };
    const [id] = await db.add('institutions', [record]);
    if (!id) return error('Failed to create institution account', 500);
    return json({ id, ...record }, 201);
  }],

  'PUT /api/admin/members/:id': [requireAuth(), requireAdminSession(), requireEditRights(), async (ctx: any) => {
    const [existing] = await db.get<Member>('members', [ctx.params.id]);
    if (!existing) return error('Member not found', 404);
    const body = ctx.body as Partial<Member>;
    if (body.dob !== undefined) { const e = validDob(body.dob); if (e) return error(e, 400); }
    const merged: any = { ...existing, ...body };
    delete merged.__loginUserId;
    merged.ownerUserId = existing.ownerUserId;
    if (!existing.institutionId) merged.branch = unitForDob(merged.dob);
    const [ok] = await db.update('members', [{ id: ctx.params.id, record: merged }]);
    if (!ok) return error('Failed to update member', 500);
    return json({ id: ctx.params.id, ...merged });
  }],

  'DELETE /api/admin/members/:id': [requireAuth(), requireAdminSession(), requireEditRights(), async (ctx: any) => {
    const [ok] = await db.delete('members', [ctx.params.id]);
    if (!ok) return error('Failed to delete member', 500);
    return json({ ok: true });
  }],

  'POST /api/admin/members/transition-check': [requireAuth(), requireAdminSession(), requireEditRights(), async () => {
    const { items } = await db.list<Member>('members', { limit: 500 });
    let updated = 0;
    for (const m of items) {
      if (m.institutionId) continue;
      const age = ageFromDob(m.dob);
      if (age === null) continue;
      const newBranch = membershipCategoryForAge(age);
      if (newBranch !== m.branch) {
        await db.update('members', [{ id: m.id, record: { ...m, branch: newBranch } }]);
        updated++;
      }
    }
    return json({ updated });
  }],

  'POST /api/admin/members/compliance-check': [requireAuth(), requireAdminSession(), requireEditRights(), async () => {
    const { items } = await db.list<Member>('members', { limit: 500 });
    let suspended = 0, expelled = 0;
    for (const m of items) {
      if (m.status === 'expelled') continue;
      const overdue = daysBetween(m.subscriptionExpiry);
      if (overdue > 90) {
        await db.update('members', [{ id: m.id, record: { ...m, status: 'expelled' } }]);
        expelled++;
      } else if (overdue > 30 && m.status === 'active') {
        await db.update('members', [{ id: m.id, record: { ...m, status: 'suspended' } }]);
        suspended++;
      }
    }
    return json({ suspended, expelled });
  }],

  'POST /api/admin/members/:id/invoice': [requireAuth(), requireAdminSession(), requireEditRights(), async (ctx: any) => {
    const [m] = await db.get<Member>('members', [ctx.params.id]);
    if (!m) return error('Member not found', 404);
    const body = ctx.body as { amount?: number; description?: string };
    if (!body.amount || body.amount <= 0) return error('A positive amount is required', 400);
    const record: Transaction = { memberId: ctx.params.id, memberName: m.name, type: 'invoice', amount: body.amount, description: body.description || 'Membership Subscription', date: today(), status: 'pending' };
    const [id] = await db.add('transactions', [record]);
    if (!id) return error('Failed to create invoice', 500);
    return json({ id, ...record }, 201);
  }],

  'POST /api/admin/members/:id/reminder': [requireAuth(), requireAdminSession(), requireEditRights(), async (ctx: any) => {
    const [m] = await db.get<Member>('members', [ctx.params.id]);
    if (!m) return error('Member not found', 404);
    await db.add('communications', [{ type: 'reminder', subject: 'Subscription Renewal Reminder', body: `Reminder sent to ${m.name}`, audience: m.name, recipientCount: 1, date: today() }]);
    return json({ ok: true });
  }],

  'GET /api/admin/transactions': [requireAuth(), requireAdminSession(), async (ctx: any) => {
    const memberId = ctx.query.memberId;
    const { items } = await db.list<Transaction>('transactions', { limit: 500 });
    const sorted = items.sort((a, b) => (a.date < b.date ? 1 : -1));
    const filtered = memberId ? sorted.filter((t) => t.memberId === memberId) : sorted;
    return json({ items: filtered });
  }],

  'POST /api/admin/transactions/:id/pay': [requireAuth(), requireAdminSession(), requireEditRights(), async (ctx: any) => {
    const [inv] = await db.get<Transaction>('transactions', [ctx.params.id]);
    if (!inv) return error('Invoice not found', 404);
    if (inv.type !== 'invoice') return error('Only invoices can be marked paid', 400);
    await db.update('transactions', [{ id: ctx.params.id, record: { ...inv, status: 'paid' } }]);
    const receipt: Transaction = { memberId: inv.memberId, memberName: inv.memberName, type: 'receipt', amount: inv.amount, description: `Receipt for: ${inv.description}`, date: today(), status: 'paid', linkedInvoiceId: ctx.params.id };
    await db.add('transactions', [receipt]);
    const [m] = await db.get<Member>('members', [inv.memberId]);
    if (m) {
      const base = daysBetween(m.subscriptionExpiry) > 0 ? today() : m.subscriptionExpiry;
      const newExpiry = new Date(base);
      newExpiry.setDate(newExpiry.getDate() + 365);
      const restoredStatus = m.status === 'expelled' || m.status === 'suspended' ? 'active' : m.status;
      await db.update('members', [{ id: inv.memberId, record: { ...m, status: restoredStatus, subscriptionExpiry: newExpiry.toISOString().slice(0, 10) } }]);
    }
    return json({ ok: true });
  }],

  'GET /api/admin/export/transactions.csv': [requireAuth(), requireAdminSession(), async () => {
    const { items } = await db.list<Transaction>('transactions', { limit: 500 });
    const headerRow = 'Member,Type,Description,Date,Amount(KES),Status\n';
    const rows = items.map((t) => `"${t.memberName}",${t.type},"${t.description}",${t.date},${t.amount},${t.status}`).join('\n');
    return json({ csv: headerRow + rows });
  }],

  'GET /api/admin/messages': [requireAuth(), requireAdminSession(), async () => {
    const { items } = await db.list('communications', { limit: 200 });
    return json({ items: (items as any[]).sort((a, b) => (a.date < b.date ? 1 : -1)) });
  }],

  'POST /api/admin/messages/bulk': [requireAuth(), requireAdminSession(), requireEditRights(), async (ctx: any) => {
    const body = ctx.body as { subject?: string; body?: string; audience?: string };
    if (!body.subject || !body.body) return error('Subject and message body are required', 400);
    const { items } = await db.list<Member>('members', { limit: 500 });
    let recipients = items;
    const audience = body.audience || 'all';
    if (audience.startsWith('branch:')) { const branch = audience.slice(7); recipients = items.filter((m) => m.branch === branch); }
    else if (audience.startsWith('status:')) { const status = audience.slice(7); recipients = items.filter((m) => m.status === status); }
    const record = { type: 'bulk', subject: body.subject, body: body.body, audience, recipientCount: recipients.length, date: today() };
    const [id] = await db.add('communications', [record]);
    if (!id) return error('Failed to send message', 500);
    return json({ id, recipientCount: recipients.length });
  }],

  'GET /api/admin/events': [requireAuth(), requireAdminSession(), async () => {
    const { items } = await db.list('events', { limit: 200 });
    return json({ items: (items as any[]).sort((a, b) => (a.date < b.date ? -1 : 1)) });
  }],

  'POST /api/admin/events': [requireAuth(), requireAdminSession(), requireEditRights(), async (ctx: any) => {
    const body = ctx.body as { title?: string; date?: string; location?: string; description?: string };
    if (!body.title || !body.date) return error('Title and date are required', 400);
    const record = { title: body.title, date: body.date, location: body.location || '', description: body.description || '' };
    const [id] = await db.add('events', [record]);
    if (!id) return error('Failed to create event', 500);
    return json({ id, ...record }, 201);
  }],

  'DELETE /api/admin/events/:id': [requireAuth(), requireAdminSession(), requireEditRights(), async (ctx: any) => {
    await db.delete('events', [ctx.params.id]);
    return json({ ok: true });
  }],

  'GET /api/admin/events/:id/participants': [requireAuth(), requireAdminSession(), async (ctx: any) => {
    const { items } = await db.list('participations', { filter: { eventId: ctx.params.id }, limit: 200 });
    return json({ items });
  }],

  'POST /api/admin/events/:id/participants': [requireAuth(), requireAdminSession(), requireEditRights(), async (ctx: any) => {
    const [ev] = await db.get<{ title: string }>('events', [ctx.params.id]);
    if (!ev) return error('Event not found', 404);
    const body = ctx.body as { memberId?: string };
    if (!body.memberId) return error('memberId is required', 400);
    const [m] = await db.get<Member>('members', [body.memberId]);
    if (!m) return error('Member not found', 404);
    const record = { eventId: ctx.params.id, memberId: body.memberId, memberName: m.name, eventTitle: ev.title, date: today() };
    const [id] = await db.add('participations', [record]);
    if (!id) return error('Failed to register participant', 500);
    return json({ id, ...record }, 201);
  }],

  'GET /api/admin/reports/summary': [requireAuth(), requireAdminSession(), async () => {
    const [{ items: members }, { items: transactions }, { items: events }] = await Promise.all([
      db.list<Member>('members', { limit: 500 }),
      db.list<Transaction>('transactions', { limit: 500 }),
      db.list('events', { limit: 200 }),
    ]);
    const byBranch: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byRegion: Record<string, number> = {};
    let overdueCount = 0;
    for (const m of members) {
      byBranch[m.branch] = (byBranch[m.branch] || 0) + 1;
      byStatus[m.status] = (byStatus[m.status] || 0) + 1;
      if (m.region) byRegion[m.region] = (byRegion[m.region] || 0) + 1;
      if (daysBetween(m.subscriptionExpiry) > 0 && m.status !== 'expelled') overdueCount++;
    }
    const revenueCollected = transactions.filter((t) => t.status === 'paid' && t.type === 'receipt').reduce((s, t) => s + t.amount, 0);
    const pendingInvoicesAmount = transactions.filter((t) => t.type === 'invoice' && t.status === 'pending').reduce((s, t) => s + t.amount, 0);
    const upcomingEvents = (events as any[]).filter((e) => e.date >= today()).length;
    return json({ totalMembers: members.length, byBranch, byStatus, byRegion, revenueCollected, pendingInvoicesAmount, overdueCount, upcomingEvents });
  }],
});
