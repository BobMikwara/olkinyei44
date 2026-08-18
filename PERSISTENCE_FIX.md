# Global Persistence Fix

This change makes **Supabase the single source of truth** for every CMS-edited
collection, so a change made in the Studio CMS is visible on every device and
browser. Previously the CMS hydrated its entire state from `localStorage` and
wrote it back on every edit — that browser-local snapshot was the root cause of
changes appearing in one tab but never reaching another device.

## What was wrong

1. **`localStorage` seeded all CMS content.** `loadState()` restored packages,
   pages, site settings, destinations, guides, vehicles, customers and media
   from `olkinyei-admin-v2`, then `persist()` wrote the whole state back on
   every change. A new/incognito browser saw stale seeds; a previously-used
   browser kept showing its own snapshot even after another device edited the
   live data.
2. **Cloud saves swallowed errors.** `cloudSaveDocument()` performed the
   `upsert` but never checked `{ error }`, and `packageCloudSave` /
   `blogCloudSave` were fire-and-forget. The UI reported "Saved" even when RLS
   rejected the write — exactly how local-only edits happened.
3. **Logo & media uploads were base64 data URLs** (`FileReader.readAsDataURL`)
   stored in `localStorage`. They could not load on any other device and
   bloated the store beyond quota.
4. **Destinations, guides, vehicles, customers and media were never synced to
   the cloud at all.**
5. **The public site read editable copy from a `olkinyei-content` localStorage
   key** that the CMS never wrote, so it could only ever show stale defaults.
6. **`cms_content` RLS write policy had no `WITH CHECK`** and its primary key
   only allowed `site_settings`/`pages`, so writes for other documents were
   rejected.
7. **`bookings.status` CHECK** allowed four statuses while the CMS used six,
   so staff status updates could fail.

## What changed

### `src/lib/supabase.ts`
- Added `uploadToStorage(file, { folder, fileName, contentType })` which uploads
  to the public `expedition-media` Supabase Storage bucket and returns a
  persistent public URL. This is the only supported way to persist an uploaded
  file — `blob:`/`data:` URLs are never saved.
- Added `MEDIA_BUCKET` and `removeFromStorage()` helper.

### `src/admin/store.ts`
- `localStorage` now stores **UI preferences only** (`theme`,
  `newBookingsCount`). CMS collections always start from seed defaults and are
  replaced by Supabase rows during bootstrap.
- `cloudSaveDocument()` checks the response, queues writes, and returns
  `{ ok, message }`. **`updateSiteSettings()` and `updatePage()` are now async**,
  await the write, roll back on failure, and only show "Saved" after the
  database confirms.
- Package and blog saves (`packageCloudSave`, `blogCloudSave`) now return a
  result; the actions `createPackage`/`updatePackage`/`deletePackage` and the
  blog equivalents are async, roll back optimistic UI on failure, and surface
  the real Supabase error.
- Added a generic JSON-document sync (`loadCloudCollection` /
  `saveCloudCollection` / `persistCollection`) that persists **destinations,
  guides, vehicles, customers and media** in `public.cms_content`, with
  realtime updates across tabs/devices.
- Realtime channel now applies updates for all `cms_content` document ids.
- Booking status/delete writes check the Supabase response and roll back on
  error.
- Added `uploadSiteAsset()` to upload a logo/favicon to Storage and save the
  resulting URL in Site Settings.
- After sign-in, every collection (including the JSON documents) is re-read so
  staff see drafts/archived rows RLS hides from anonymous visitors.

### `src/admin/AdminApp.tsx`
- Site Settings logo upload now uploads the file to Supabase Storage and saves
  the returned URL (no more base64). Save buttons await the cloud write and
  show a loading state.
- Pages manager save is async/await.

### `src/admin/modules/Media.tsx`
- Uploads go to Supabase Storage (`library/images|videos|documents`) and the
  returned public URL is what gets persisted. Multi-file upload with progress.

### `src/admin/modules/Packages.tsx` & `src/admin/modules/Blog.tsx`
- Added "Upload" buttons next to the hero/gallery image URL fields. Files are
  uploaded to Storage and the persistent URL is inserted. Editors stay open if
  the cloud save fails.

### `src/App.tsx`
- Removed the `olkinyei-content` localStorage read. Editable home copy and
  contact email come straight from the CMS store (Supabase), with hardcoded
  defaults only as an offline fallback.

### SQL migrations (run in this order on the Supabase project)
1. `supabase/cms_content_persistence.sql` — widens the `cms_content` primary
   key to allow the new collection ids, recreates the RLS policies with a
   `WITH CHECK` clause, and widens `bookings.status` to include all six
   pipeline states.
2. `supabase/storage_persistence.sql` — ensures the public `expedition-media`
   bucket exists and (re)installs public-read + staff-write storage policies
   (with `WITH CHECK`).

Existing data is preserved; nothing is dropped or deleted.

## Verification

- `npm run build` and `npx tsc --noEmit` both pass.
- No `readAsDataURL` / base64 persistence remains in the source.
- The only `localStorage` writes are:
  - `olkinyei-admin-v2` — `{ theme, newBookingsCount }` only.
  - `olkinyei-bookings` — the same-browser booking bridge (also written to
    Supabase).
  - `olkinyei-intro` (sessionStorage) — the loader-seen flag.

After applying the SQL migrations, changing the logo, a package price, a page
hero, a blog article, a destination, guide, vehicle, customer or media asset in
the CMS writes to Supabase first and is reflected on every device on next load
(and live via Realtime).
