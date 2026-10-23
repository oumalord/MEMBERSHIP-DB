# KGGA Membership System — Database Schema

The backend uses AppDeploy's managed key-value database (`db` from `@appdeploy/sdk`).
It is **not** a relational SQL database — there are no foreign key constraints or joins.
Each table below is a flat collection of JSON records. Every record automatically gets
a system-generated `id: string` field in addition to the fields listed here.

If you migrate this to a traditional SQL database (Postgres, MySQL, etc.), each table
below maps directly to a SQL table, with `id` as the primary key and the `*Id` fields
below as foreign keys.

---

## `admins`
One row per administrator account (active or pending invite).

| Field | Type | Notes |
|---|---|---|
| id | string (PK) | auto-generated |
| userId | string, optional | set once the invited admin signs in for the first time |
| email | string | lowercased, used to match pending invites |
| name | string, optional | display name from the auth provider |
| status | `'invited'` \| `'active'` | |
| isSuperAdmin | boolean | true only for the founding account (first-ever admin sign-in) |
| canEdit | boolean | false = view-only |
| canManageAdmins | boolean | can invite admins and grant/revoke `canEdit` on others |

## `institutions`
One row per registered institution (school/unit), keyed by the signed-in owner.

| Field | Type | Notes |
|---|---|---|
| id | string (PK) | auto-generated |
| userId | string | owning auth user id (1 institution per user) |
| name | string | Name of Institution |
| email, phone, address | string, optional | Postal Address / Tel / Email |
| county, subCounty | string, optional | |
| principalName, principalMobile, principalEmail | string, optional | Name of Principal/Head teacher |
| noOfUnits, noOfGuidesInUnit | string, optional | |
| guideLeaderName, guideLeaderPhone, guideLeaderEmail | string, optional | |
| meetingDayTime | string, optional | Day and time of weekly meetings |

## `institution_categories`
Custom troop/category names an institution defines in addition to the default branches.

| Field | Type | Notes |
|---|---|---|
| id | string (PK) | auto-generated |
| institutionId | string (FK → institutions.id) | |
| name | string | |

## `members`
The core membership register. A member can be added by an admin, by an institution
(youth/student), or created by an individual signing themselves up (adult).

| Field | Type | Notes |
|---|---|---|
| id | string (PK) | auto-generated |
| name | string | |
| phone, email, dob | string, optional | |
| branch | string | Rainbow / Brownie / Girl Guide / Ranger Guide / Adult Leader / Unassigned, or an institution's custom category |
| region | string, optional | |
| guardianName, guardianPhone | string, optional | Parent/Guardian info (youth) |
| status | `'active'` \| `'pending'` \| `'suspended'` \| `'expelled'` | |
| joinedDate | string (YYYY-MM-DD) | |
| subscriptionExpiry | string (YYYY-MM-DD) | |
| institutionId | string, optional (FK → institutions.id) | set when added via an institution |
| institutionName | string, optional | denormalized snapshot of the institution's name |
| ownerUserId | string, optional | set when the member is a self-registered individual |
| source | `'admin'` \| `'institution'` \| `'self'` | who created the record |
| memberType | `'youth'` \| `'adult'` | |
| membershipNo | string, optional | from the Unit Registration Form |
| interests | string, optional | Interests/Hobbies |
| idNo | string, optional | Adult Registration Form: ID No. |
| maritalStatus, poBox, town | string, optional | Adult personal info |
| occupation, employer, workPhone, workEmail, otherSkills | string, optional | Adult professional info |
| nextOfKinName, nextOfKinRelationship, nextOfKinPhone, nextOfKinEmail | string, optional | |
| yearJoinedGuiding | string, optional | |
| levelsUndertaken | string, optional | comma-separated: Rainbow, Brownie, Guide, Ranger, Young Leader |
| trainingsReceived | string, optional | comma-separated: Introductory, Pre-warrant, Advanced, Specialized |
| guidingAwards | string, optional | |
| leadershipHistory | string, optional | past leadership positions/achievements |
| currentInvolvement | string, optional | comma-separated: Guide leader, Trainer, Commissioner, Other |
| currentLevelOfEngagement | string, optional | comma-separated: Unit, County, National, International, Other |
| currentSupport | string, optional | |

## `transactions`
Invoice and receipt ledger for member subscriptions.

| Field | Type | Notes |
|---|---|---|
| id | string (PK) | auto-generated |
| memberId | string (FK → members.id) | |
| memberName | string | denormalized snapshot |
| type | `'invoice'` \| `'receipt'` | a receipt is auto-created when an invoice is marked paid |
| amount | number | KES |
| description | string | |
| date | string (YYYY-MM-DD) | |
| status | `'pending'` \| `'paid'` | |
| linkedInvoiceId | string, optional (FK → transactions.id) | on a receipt, points back to its invoice |

## `events`
Scheduled activities.

| Field | Type | Notes |
|---|---|---|
| id | string (PK) | auto-generated |
| title | string | |
| date | string (YYYY-MM-DD) | |
| location, description | string, optional | |

## `participations`
Join table: which members registered for which events.

| Field | Type | Notes |
|---|---|---|
| id | string (PK) | auto-generated |
| eventId | string (FK → events.id) | |
| memberId | string (FK → members.id) | |
| memberName | string | denormalized snapshot |
| eventTitle | string | denormalized snapshot |
| date | string (YYYY-MM-DD) | date the registration was recorded |

## `communications`
Log of reminders and bulk messages sent.

| Field | Type | Notes |
|---|---|---|
| id | string (PK) | auto-generated |
| type | `'reminder'` \| `'bulk'` | |
| subject | string | |
| body | string | |
| audience | string | `all`, `branch:<name>`, or `status:<status>` |
| recipientCount | number | |
| date | string (YYYY-MM-DD) | |

## `settings`
Single-row organisation branding. Readable by everyone (`GET /api/branding`), writable only by the Super Admin.

| Field | Type | Notes |
|---|---|---|
| id | string (PK) | auto-generated |
| orgName | string | shown in sidebar and sign-in screen |
| tagline | string | |
| logo | string | image data URL (PNG/JPEG/WebP/SVG), max ~250 KB; empty = default "KG" badge |

---

## Relationships (ER summary)

```
institutions (1) ───< members (many, via institutionId)
institutions (1) ───< institution_categories (many, via institutionId)
members      (1) ───< transactions (many, via memberId)
members      (1) ───< participations (many, via memberId)
events       (1) ───< participations (many, via eventId)
admins        — independent, no FK relationships
```

## Business rules encoded in the backend (`backend/index.ts`)

- **Auto branch by age**: Rainbow 5–6, Brownie 7–9, Girl Guide 10–14, Ranger Guide 15–17,
  Adult Leader 18+. Applied on member creation and via "Run Branch Transition" (skipped
  for institution-owned members, who use manually-assigned categories).
- **Compliance check**: subscription overdue > 30 days → `suspended`; > 90 days → `expelled`.
- **Paying an invoice**: creates a linked `receipt` transaction and extends the member's
  `subscriptionExpiry` by 365 days, restoring `active` status if previously suspended/expelled.
- **Admin bootstrap**: the first-ever account to use "Sign In as Admin" becomes the
  Super Admin automatically. All subsequent admins must be invited by email by a Super
  Admin or an admin with `canManageAdmins`.
