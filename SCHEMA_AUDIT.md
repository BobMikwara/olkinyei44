# Schema Consistency Audit

Comparison of `public.*` tables against the TypeScript models, queries, forms,
and services. Findings are ordered by severity, with the fix applied.

---

## 1. Role model split-brain — FIXED (breaking without migration)

**Before:** two vocabularies bridged by a lossy translation table in
`src/admin/auth.ts`.

| Database (`profiles.role`) | Frontend `Role` |
| -------------------------- | --------------- |
| `root_super_admin`         | `root`          |
| `reservation_manager`      | `booking_manager` |
| `marketing`                | `marketing_manager` |
| `editor`                   | collapsed into `content_manager` |

`editor` had no frontend equivalent and silently inherited full
`content_manager` rights — a privilege-escalation footgun.

**After:** one vocabulary in both layers.

```
root · super_admin · content_manager · booking_manager · marketing_manager · finance
```

- `supabase/role_canonicalization.sql` migrates existing rows, rewrites the
  CHECK constraint, and rebuilds `is_root_admin` / `is_super_admin` /
  `is_booking_staff` / `is_staff` plus the root-protection triggers.
- `dbRoleToCms()` / `cmsRoleToDb()` deleted. `DbRole` is now an alias of `Role`.
- `normalizeRole()` remains as the single narrowing helper for untrusted input.

**Action required:** run `supabase/role_canonicalization.sql` before deploying.

---

## 2. Duplicated role/status literals — FIXED

Role strings were hard-coded in `types.ts`, `auth.ts`, `store.ts`, and the
`<Select>` in `modules/Combined.tsx`. Adding a role required four edits.

Introduced `src/admin/constants.ts` as the single source of truth:

| Export | Mirrors |
| ------ | ------- |
| `ROLES`, `ASSIGNABLE_ROLES` | `profiles_role_check` |
| `ROLE_LABELS`, `ROLE_DESCRIPTIONS` | UI copy |
| `PROFILE_STATUSES` | `profiles_status_check` |
| `BOOKING_STATUSES` | `bookings.status` CHECK |
| `BLOG_CATEGORIES` | `blog_posts_category_check` |
| `TABLES` | table names used by the client |
| `API_ROUTES` | privileged serverless endpoints |

The role picker now renders from `ASSIGNABLE_ROLES`, so the UI cannot drift
from the database again.

---

## 3. Dead credential fields on `AdminUser` — FIXED

`passwordHash`, `passwordSalt`, `passwordIterations`, `passwordAlgo`,
`failedLoginAttempts`, `lockedUntil` were left over from the removed PBKDF2
system. **No such columns exist in `public.profiles`** — they were written to
localStorage and never read meaningfully. Supabase Auth owns credentials.

Removed from the model and from every construction site. `updateUser()` no
longer needs to strip them.

---

## 4. Orphaned token types — FIXED

`InvitationToken` and `PasswordResetToken` survived the migration to Supabase
Auth-issued links. Zero references, no backing tables. Deleted.

---

## 5. `audit_logs` shape divergence — DOCUMENTED (intentional)

| Database column | Local `AuditEntry` field |
| --------------- | ------------------------ |
| `user_id`       | `actorId`                |
| `target_id`     | `targetId`               |
| `ip_address`    | `ip`                     |
| `browser`       | `userAgent`              |
| `created_at`    | `timestamp`              |
| —               | `actorEmail` (client-only) |

These are deliberately two models: `AuditEntry` describes the in-memory list
rendered in the CMS, while the database write path in `writeAudit()` maps to
real column names. The type now documents this so it is not mistaken for a
row model. No code references a non-existent column.

---

## 6. Dead file and unused dependencies — PARTIALLY FIXED

- **Deleted** `src/utils/cn.ts` — zero imports (scaffold leftover).
- **Still declared but unreferenced** in `package.json`:
  - `clsx` — only consumer was `cn.ts`
  - `tailwind-merge` — only consumer was `cn.ts`
  - `@studio-freight/lenis` — deprecated; the app imports `lenis`

  Remove with:

  ```bash
  npm uninstall clsx tailwind-merge @studio-freight/lenis
  ```

  Left for you to run so the lockfile is regenerated in your environment
  rather than hand-edited.

---

## 7. Verified consistent (no action)

| Area | Result |
| ---- | ------ |
| `bookings` | `toRow` / `fromRow` in `src/lib/supabase.ts` map every column exactly (`customer_name`, `special_requests`, `payment_preference`, `start_date`, `end_date`). No phantom fields. |
| `blog_posts` | `blogPostToRow` / `blogPostFromRow` cover all columns; ordering uses `published_at`, which exists in every schema version. |
| `cms_content` | Two fixed document ids (`site_settings`, `pages`) matching the CHECK constraint. |
| `profiles` | `ProfileRow` matches the table 1:1 after the role fix. |
| Storage buckets | Only `expedition-media` is referenced, and it is created in `schema.sql`. |
| RPC calls | None. All privileged work goes through `/api/*` serverless functions. |
| Environment variables | Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in frontend code; `process.env` appears exclusively in `api/*` (server-side, correct). |
| Console logging | Every statement is `import.meta.env.DEV`-gated except two deliberate production diagnostics for silent-failure classes (blog load failure, privileged API failure). Neither logs secrets. |

---

## 8. Role-vocabulary ping-pong between migrations — FIXED (root cause of CMS saves not persisting)

`supabase/auth_schema_sync.sql` and `supabase/role_canonicalization.sql` both
claimed to be authoritative and idempotent, but migrated `profiles.role` in
**opposite directions**:

| File | Migrated roles to | `is_staff()` accepted |
| ---- | ----------------- | --------------------- |
| `auth_schema_sync.sql` (old) | legacy (`root_super_admin`, `reservation_manager`, `marketing`, `editor`) | legacy only |
| `role_canonicalization.sql` | canonical (`root`, `booking_manager`, `marketing_manager`, …) | canonical only |

Whichever ran last flipped the vocabulary; the *other* file's `is_staff()`
then returned **false** for real staff. Because every content policy is
`using (public.is_staff())`, staff UPDATEs on `testimonials` and `packages`
were filtered by RLS into **silent zero-row no-ops** — PostgREST returns no
error for an UPDATE that matches no rows, so the CMS reported "Saved" while
the database never changed. `auth_schema_sync.sql` additionally aborted on
re-run (it recreated `"Public can create booking requests"` without dropping
it first), leaving databases in mixed states.

**After:**

- Both files now migrate to the **canonical** vocabulary
  (`root · super_admin · content_manager · booking_manager ·
  marketing_manager · finance`).
- All four staff predicates (`is_staff`, `is_root_admin`, `is_super_admin`,
  `is_booking_staff`) share one body across every migration file and
  **tolerate legacy spellings** (accepted, never granted), so a
  partially-migrated database can no longer lock its own staff out of RLS.
- The missing `drop policy` was added so `auth_schema_sync.sql` re-runs
  cleanly.
- `api/invite-user.ts` / `api/manage-user.ts` accepted only legacy role names
  while the CMS sends canonical ones; they now accept either and normalise to
  canonical before storing.

**Action required on the live database:** re-run
`supabase/auth_schema_sync.sql` then `supabase/role_canonicalization.sql`
(both idempotent, no data deleted). This repairs `profiles.role` values and
reinstalls consistent predicates.

---

## 9. Silent zero-row writes in the client — FIXED

`updateTestimonial`, `setTestimonialStatus`, and `deleteTestimonial` called
`.update()/.delete().eq("id", id)` and only checked `error`. An RLS-filtered
write returns **no error and zero rows**, so the CMS claimed success, kept the
optimistic local edit, and never rolled back — the exact "saved here, gone on
the next device" symptom.

Every testimonial write now appends `.select()`, requires at least one
returned row, rolls the optimistic UI back on failure, and **adopts the
returned database row** into state (re-fetch-after-save semantics, so
trigger-trimmed values and `updated_at` are what the CMS displays).
`packageCloudSave` and `blogCloudSave` upserts likewise require the stored row
back and replace the optimistic copy with it. Update payloads remain
deliberately constructed from real column names only (`packageToRow`, the
field-by-field testimonial row) — no UI-only properties are ever sent.

---

## Migration order

```
1. supabase/schema.sql
2. supabase/auth_schema_sync.sql        ← rewritten: canonical roles, safe re-run
3. supabase/role_canonicalization.sql   ← required; re-run to repair predicate drift
4. supabase/packages_sync.sql           ← Safari Packages schema + RLS + seed
5. supabase/testimonials_moderation.sql
6. supabase/testimonials_sources.sql
7. supabase/blog_posts_sync.sql
8. supabase/bookings_hardening.sql
9. supabase/cms_content.sql
10. supabase/cms_content_persistence.sql
11. supabase/storage_persistence.sql
```

Verification query — must return zero rows:

```sql
select email, role, status from public.profiles
where role not in ('root','super_admin','content_manager','booking_manager','marketing_manager','finance')
   or status not in ('active','pending','suspended','deleted');
```
