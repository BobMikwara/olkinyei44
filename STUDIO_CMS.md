# Olkinyei Studio — Private CMS

The Studio CMS is the internal operating system for Olkinyei Expeditions.
It is deliberately **hidden from the public website** and access is restricted to authorised staff only.

---

## Production authentication (Supabase, invitation-only)

Supabase Auth is the single source of truth for staff accounts, sessions, roles, profile data, and audit logs once the backend is connected. There is **no public registration** anywhere; the Root Super Admin provisions every account through the Studio.

### 1. Configure environment variables

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Run the migrations in this order: `supabase/schema.sql` → `supabase/production_auth.sql` (superseded pointer) → `supabase/auth_schema_sync.sql` → `supabase/bookings_hardening.sql`. The sync migration normalises legacy role values in place and is idempotent.

### 2. Apply the database schema

Run in order inside the Supabase SQL editor:

1. `supabase/schema.sql` — content tables + baseline RLS
2. `supabase/production_auth.sql` — hardened profiles, audit logs, root triggers
3. `supabase/packages_sync.sql` — Safari Packages (`public.packages`) canonical schema, RLS, and seed data (the single source of truth shared by the CMS and the public website)
4. `supabase/cms_tokens.sql` — offline-mode setup tokens (optional fallback tables)

`production_auth.sql` grants no client insert/update/delete on `profiles`, adds `audit_logs`, and installs triggers that make the Root Super Admin immutable from the client.

### 3. Provision the first Root Super Admin ONCE

1. Supabase dashboard → **Authentication → Users → Add user** → create the root account (email + strong password, mark email as verified).
2. Run:

```sql
insert into public.profiles (id, email, full_name, role, status, is_root)
values ('<auth-user-uuid>', 'root@example.com', 'Root Super Admin', 'root', 'active', true)
on conflict (id) do update set role = 'root', is_root = true, status = 'active';
```

From that point forward, all other staff are invited through the Studio — never through SQL again.

### 4. Deploy the Edge Functions

```bash
supabase functions deploy invite-user
supabase functions deploy manage-user
supabase functions deploy send-booking-confirmation
```

Set the Edge Function secrets:

```bash
supabase secrets set ROOT_ADMIN_EMAILS="root@example.com"
supabase secrets set SITE_URL="https://studio.olkinyeiexpeditions.com"
```

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically inside Edge Functions. The browser only ever receives the publishable key.)

### 5. Configure Auth emails + URLs

- **Site URL** (Authentication → URL Configuration): `https://studio.olkinyeiexpeditions.com`
- **Redirect URLs**: add `https://studio.olkinyeiexpeditions.com/#/admin` and `https://studio.olkinyeiexpeditions.com/#/admin/setup`
- Configure **SMTP** (Resend, SendGrid, or SES) so invitation and recovery emails send from your domain.
- Edit Auth email templates: *Invite*, *Recovery*, *Magic Link disabled*.

### Resulting invitation workflow

```
Root Super Admin ──▶ Team & Roles → New account
        │  enters name, email, role
        ▼
invite-user Edge Function (server-side service role)
        ▼
Supabase: pending user + secure single-use token (24 h)
        ▼
Email delivered automatically
        ▼
Recipient clicks Accept Invitation → sets password → account active
```

Any device, any browser — nothing is read from the sending browser.

### Password recovery

The sign-in screen includes **Forgot password** powered by `resetPasswordForEmail`. An unknown email produces an identical response, preventing user enumeration. Reset links resolve to `#/admin/setup` and one-time `updateUser` completes recovery.

### Session security

- Sessions are Supabase-auth JWTs with **automatic refresh token rotation**; the Studio restores them on refresh and signs the tab out everywhere when a session is revoked or expires.
- Failed credential attempts are logged to `audit_logs` but not rate-limited here — Supabase Auth applies built-in throttling at the auth server.
- `production_auth.sql` RLS ensures staff can only read their own profile; only root/super admins can read the full directory; role changes flow exclusively through `manage-user`.

### Audit trail

Administrative actions (invitations, resets, role changes, suspensions, deletions, content updates) are written to `public.audit_logs` with actor, target, outcome, IP/browser metadata where available, plus immutable timestamps. Reads are restricted to root and super admins.

---

## Public vs. private surface (unchanged)

The public website at `/` exposes **zero** indication that the Studio exists: no buttons, links, shortcuts, footer entries, search-engine indexing, or metadata.

---

## Access

The Studio is served from a private URL only. There are **no** buttons, links, keyboard shortcuts, or navigation entries that expose it from the public site.

```
https://<your-domain>/#/admin
```

For production it is strongly recommended to deploy the Studio behind a separate hostname or an edge access rule, e.g.:

```
https://studio.olkinyei.com
```

The bundled `robots.txt`, `X-Robots-Tag`, and dynamic `<meta name="robots">` tag block search-engine indexing of the Studio.

---

## Root Super Admin (issued by the system creators)

The Root Super Admin is provisioned **only** by the system creators.
It cannot be created, edited, deleted, demoted, suspended, or reset by any other administrator.

**Initial Root credentials**

| Field         | Value                        |
| ------------- | ---------------------------- |
| Email         | `root@olkinyei.systems`      |
| Password      | `OlkinyeiRoot@2026#Secure`   |

The Root Super Admin **must change this password on first sign-in**.
After the first login, the account behaves like a normal signed-in session, but every operation that would delete or demote it is blocked at the store layer.

Root Super Admin capabilities:

- Full unrestricted access to every module
- Can create additional Super Admins
- Can delete, suspend, or reset any non-root account
- Cannot be tampered with by any other administrator

---

## Provisioning users

There is **no public sign-up**. Every user account is created through the Studio.

1. Root Super Admin signs in.
2. Opens **Team & Roles**.
3. Clicks **New account** and fills in name, email, and role.
4. On the resulting user card, clicks **Invitation link**.
5. Copies the single-use link and shares it with the recipient privately (e.g., email, secure DM).
6. The recipient opens the link, sets a strong password, and gains access.

Invitation links expire automatically after **72 hours** and can only be used once.

---

## Roles and permissions

| Role                | Modules the role can view                                                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Root Super Admin    | Every module. All actions permitted (view, create, edit, delete, publish, manage, export, approve). Immutable.                                                                                                                                   |
| Super Admin         | All content, operations, users (cannot touch Root), settings, analytics.                                                                                                                                                                         |
| Content Manager     | Pages, blog, packages, gallery, media, destinations, guides, SEO, forms, emails (edit), analytics (view), activity, customers (view).                                                                                                            |
| Booking Manager     | Bookings, customers, guides, vehicles, emails (edit), analytics, packages (view), destinations (view), media (view), activity.                                                                                                                   |
| Marketing Manager   | Blog, media, gallery, SEO, emails, forms, integrations (edit), customers (view), packages (view), destinations (view), bookings (view), analytics, activity.                                                                                     |
| Finance             | Bookings (view + approve + export), customers (view), packages (view), analytics (view + export), activity.                                                                                                                                      |

Each module supports the following actions: `view`, `create`, `edit`, `delete`, `publish`, `manage`, `export`, `approve`.
Users only see modules they have permission to view. Modules the user cannot access are hidden from the sidebar and blocked at the router.

---

## Password reset

Any Super Admin (or the Root Super Admin) can issue a single-use password reset from the user card in **Team & Roles**.
The recipient opens the link, sets a new password, and can sign in immediately.
Reset links expire after **30 minutes**.

---

## Session and security policies

- Passwords are hashed with **PBKDF2-SHA-256 (210,000 iterations)** and a per-user random 16-byte salt via the Web Crypto API.
- Password strength policy: minimum 10 characters, must include uppercase, lowercase, number, and symbol.
- Failed login attempts are rate-limited. After **5 failed attempts** the account is locked for **15 minutes**.
- Sessions expire after **8 hours** absolute, or **30 minutes** of inactivity.
- Session tokens are stored client-side and cleared on logout, timeout, or tab close.
- All auth events (login success/failure, invitation issued, password reset, user suspended, root protected actions) are recorded in the audit log with actor, target, IP signal, user agent, timestamp, and outcome.
- Login errors are deliberately vague to prevent user enumeration.
- The Root Super Admin flag (`isRoot`) is stripped from every update payload — the store rejects any attempt to elevate or demote root.
- `X-Robots-Tag`, `Cache-Control`, and `<meta name="robots">` are set on the `/admin` route to prevent indexing and caching.
- HTTP security headers configured in `vercel.json`: `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.

---

## Existing CMS features preserved

Every previously implemented module continues to function exactly as designed. This update **only** hardens authentication, authorization, and user management. No public design, animation, workflow, page, or integration was modified.

- Dashboard, Pages, Blog, Safari Packages, Bookings, Media Library, Destinations, Guides, Vehicles, Customers, Analytics, and Settings all remain intact.
- Public website design, animations, GSAP transitions, Framer Motion interactions, and Three.js scenes are untouched.
- Booking submissions, media uploads, and content publishing still write to the shared store and are reflected on the public site.

---

## Operational recommendations

- Rotate the Root password immediately after the first login.
- Provision a second Root or Super Admin as a break-glass account and store the credentials separately.
- Deploy the Studio behind a separate subdomain (e.g., `studio.olkinyei.com`) with an edge-level allowlist for staff IPs where possible.
- Front the site with a WAF and rate-limit `/admin` at the edge.
- Rotate long-lived passwords quarterly using the built-in reset flow.
- Audit `store.getState().audit` regularly, or export it to your SIEM.
