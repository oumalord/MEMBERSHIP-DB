# KGGA Membership System — Source Code

Live app: https://kgga-membership-system-0hkmo2.v2.appdeploy.ai/

This is a React + TypeScript (Vite) frontend with a serverless TypeScript backend,
built on the AppDeploy platform (`@appdeploy/client` on the frontend, `@appdeploy/sdk`
on the backend). It is **not** a standalone Node/Express project — the `db`, `auth`,
`router`, `json`, and `error` helpers used throughout are provided by the AppDeploy
runtime, not by a package you install yourself.

## Run locally (PostgreSQL)

`server/` is a local stand-in for the AppDeploy runtime that runs `backend/index.ts` unchanged and stores data in PostgreSQL.

1. Create `.env` (git-ignored) with `DATABASE_URL`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` (min 8 chars) and optionally `SUPER_ADMIN_NAME`.
2. `npm install` then `npm run dev` and open http://localhost:5173/.

On startup the server creates any missing tables (one `(id uuid, data jsonb, created_at)` table per backend table, plus `auth_users` and `auth_sessions`) and seeds the Super Admin.

### Local showcase data

To create local demo accounts and sample records, add `DEMO_MODE=true` to `.env` and use a local PostgreSQL database in `DATABASE_URL`. Demo mode is refused in production/Vercel and with a non-local database URL. Restart `npm run dev`; the seed is repeatable and refreshes the sample users' passwords to the values below.

All three demo accounts use the password `KGGA-Demo-2026!`:

| Portal | Login email | What to explore |
|---|---|---|
| Admin / Super Admin | `demo.admin@kgga.example` | Dashboard, member register, events, notices, and reports |
| Institution staff | `demo.staff@kgga.example` | Two-student roster, event registration, and notices |
| Individual member | `demo.member@kgga.example` | Profile, statement, event participation, and notices |

The synthetic dataset includes Amina Wanjiku as an individual member, Zuri Njeri and Asha Mwangi in KGGA Demo Unit, two upcoming events, event participations, paid and pending transactions, and a broadcast notice. These credentials and records are for local showcases only; do not enable demo mode on a deployed system.

## Project layout

```
├── index.html              Vite entry HTML
├── package.json            Frontend dependencies
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── src/
│   ├── main.tsx             React root
│   ├── App.tsx               Top-level router: Admin / Institution / Individual portals
│   ├── index.css             Design system (Apple-style theme)
│   ├── types.ts              Shared TypeScript types
│   └── sections/
│       ├── Landing.tsx           Sign up / sign in screen (all 3 portals)
│       ├── Dashboard.tsx         Admin dashboard
│       ├── Members.tsx           Admin member register
│       ├── Transactions.tsx      Admin invoices & receipts ledger
│       ├── Messages.tsx          Admin bulk messaging
│       ├── Events.tsx            Admin event scheduling & participation
│       ├── Reports.tsx           Admin reports + CSV export
│       ├── AdminAccounts.tsx     Super Admin: manage admins, Danger Zone (wipe data)
│       ├── IndividualDashboard.tsx   Adult member's own portal
│       └── InstitutionDashboard.tsx  Institution's student roster + categories
├── backend/
│   └── index.ts              All API routes (single file)
├── tests/
│   └── tests.txt              End-to-end test specs used by the AppDeploy QA runner
└── DATABASE_SCHEMA.md         Full schema of every database table/field
```

## Account model

- **Admin** — sign in via "Admin". The first person ever to do this becomes the
  **Super Admin** automatically. The Super Admin invites further admins by email;
  new admins default to **view-only** and must be granted `canEdit`. The Super Admin
  can also delegate `canManageAdmins` to a trusted admin so they can grant/revoke
  editing rights for others while the Super Admin is away.
- **Institution** — signs up once (Unit Registration Form fields), then manages its
  own roster of student members and custom categories.
- **Individual** — signs up as an adult member (Adult Members Registration Form
  fields) and manages only their own profile/statement.

See `DATABASE_SCHEMA.md` for the full table/field reference and business rules
(auto branch-by-age, compliance suspension/expulsion, invoice → receipt flow, etc).

## Running this elsewhere

Because this app depends on the AppDeploy-injected `@appdeploy/client` and
`@appdeploy/sdk` packages (auth, database, router), it will not run as-is outside
the AppDeploy platform. To port it to a plain Node/Postgres/Express stack:

1. Re-implement `backend/index.ts`'s routes as Express (or similar) handlers.
2. Replace `db.list/get/add/update/delete` calls with SQL queries against tables
   matching `DATABASE_SCHEMA.md`.
3. Replace `requireAuth()`/`ctx.user` with your own session/auth middleware.
4. Replace `@appdeploy/client`'s `api`/`auth` on the frontend with your own HTTP
   client and auth flow (both are thin wrappers — `api.get/post/put/delete` map
   directly onto `fetch`).

## Data reset

As Super Admin, open **Admin Accounts** in the sidebar and use the **Danger Zone**
"Wipe All Data" button to permanently remove all members, institutions, transactions,
events, and messages. Admin accounts are preserved so you don't get locked out.
