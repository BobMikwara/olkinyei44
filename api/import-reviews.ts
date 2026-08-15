// POST /api/import-reviews  — server-side review import.
// GET  /api/import-reviews  — provider configuration status (no secrets).
//
// External review credentials exist ONLY here. The browser bundle never sees
// them. When a provider is unconfigured the endpoint reports that plainly and
// the website continues to work normally.
//
// Deliberately NOT implemented: any scraping, any mock/fake review data. Each
// provider stays dormant until real authorised API access is supplied.

import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// Tripadvisor Content API (requires an approved partner key).
const TRIPADVISOR_API_KEY = process.env.TRIPADVISOR_API_KEY ?? "";
const TRIPADVISOR_LOCATION_ID = process.env.TRIPADVISOR_LOCATION_ID ?? "";
const TRIPADVISOR_API_BASE_URL = process.env.TRIPADVISOR_API_BASE_URL ?? "";

// SafariBookings partner API (requires official operator access).
const SAFARIBOOKINGS_API_KEY = process.env.SAFARIBOOKINGS_API_KEY ?? "";
const SAFARIBOOKINGS_OPERATOR_ID = process.env.SAFARIBOOKINGS_OPERATOR_ID ?? "";
const SAFARIBOOKINGS_API_BASE_URL = process.env.SAFARIBOOKINGS_API_BASE_URL ?? "";

const STAFF_ROLES = new Set(["root", "super_admin", "content_manager", "marketing_manager"]);

type ProviderId = "tripadvisor" | "safaribookings";

type NormalizedReview = {
  source: ProviderId;
  external_review_id: string;
  external_url: string | null;
  external_rating: number | null;
  external_created_at: string | null;
  guest_name: string;
  guest_location: string | null;
  quote: string;
  rating: number | null;
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function providerConfig() {
  return {
    tripadvisor: {
      label: "Tripadvisor",
      configured: Boolean(TRIPADVISOR_API_KEY && TRIPADVISOR_LOCATION_ID && TRIPADVISOR_API_BASE_URL),
      requires: ["TRIPADVISOR_API_KEY", "TRIPADVISOR_LOCATION_ID", "TRIPADVISOR_API_BASE_URL"],
      missing: [
        !TRIPADVISOR_API_KEY && "TRIPADVISOR_API_KEY",
        !TRIPADVISOR_LOCATION_ID && "TRIPADVISOR_LOCATION_ID",
        !TRIPADVISOR_API_BASE_URL && "TRIPADVISOR_API_BASE_URL",
      ].filter(Boolean),
    },
    safaribookings: {
      label: "SafariBookings",
      configured: Boolean(SAFARIBOOKINGS_API_KEY && SAFARIBOOKINGS_OPERATOR_ID && SAFARIBOOKINGS_API_BASE_URL),
      requires: ["SAFARIBOOKINGS_API_KEY", "SAFARIBOOKINGS_OPERATOR_ID", "SAFARIBOOKINGS_API_BASE_URL"],
      missing: [
        !SAFARIBOOKINGS_API_KEY && "SAFARIBOOKINGS_API_KEY",
        !SAFARIBOOKINGS_OPERATOR_ID && "SAFARIBOOKINGS_OPERATOR_ID",
        !SAFARIBOOKINGS_API_BASE_URL && "SAFARIBOOKINGS_API_BASE_URL",
      ].filter(Boolean),
    },
  };
}

/**
 * Tripadvisor Content API adapter.
 *
 * Wired to the documented `/location/{id}/reviews` shape. It only runs when a
 * real key is configured; the response is normalised, never fabricated.
 */
async function fetchTripadvisorReviews(): Promise<NormalizedReview[]> {
  const url = `${TRIPADVISOR_API_BASE_URL.replace(/\/$/, "")}/location/${encodeURIComponent(TRIPADVISOR_LOCATION_ID)}/reviews?key=${encodeURIComponent(TRIPADVISOR_API_KEY)}&language=en`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Tripadvisor API returned ${response.status}`);

  const payload = (await response.json()) as { data?: unknown[] };
  const rows = Array.isArray(payload.data) ? payload.data : [];

  return rows.flatMap((raw) => {
    const item = raw as Record<string, unknown>;
    const id = item.id != null ? String(item.id) : "";
    const text = typeof item.text === "string" ? item.text.trim() : "";
    const user = (item.user ?? {}) as Record<string, unknown>;
    const userLocation = (user.user_location ?? {}) as Record<string, unknown>;
    const name = typeof user.username === "string" ? user.username : "Tripadvisor guest";
    if (!id || text.length < 10) return [];
    const ratingValue = Number(item.rating);
    return [{
      source: "tripadvisor" as const,
      external_review_id: id,
      external_url: typeof item.url === "string" ? item.url : null,
      external_rating: Number.isFinite(ratingValue) ? ratingValue : null,
      external_created_at: typeof item.published_date === "string" ? item.published_date : null,
      guest_name: name.slice(0, 120),
      guest_location: typeof userLocation.name === "string" ? userLocation.name.slice(0, 120) : null,
      quote: text.slice(0, 4000),
      rating: Number.isFinite(ratingValue) ? Math.max(1, Math.min(5, Math.round(ratingValue))) : null,
    }];
  });
}

/**
 * SafariBookings adapter.
 *
 * SafariBookings does not currently publish a general partner reviews API. The
 * adapter is intentionally inert: when official access exists, implement the
 * documented request here and normalise into NormalizedReview. No scraping.
 */
async function fetchSafariBookingsReviews(): Promise<NormalizedReview[]> {
  throw new Error(
    "SafariBookings import is not available. Official partner API access is required; scraping is not supported.",
  );
}

export default async function handler(request: Request): Promise<Response> {
  // Status probe: safe to call publicly, reveals no secret values.
  if (request.method === "GET") {
    const config = providerConfig();
    return json(200, {
      ok: true,
      service: "import-reviews",
      providers: Object.entries(config).map(([id, value]) => ({
        id,
        label: value.label,
        configured: value.configured,
        requires: value.requires,
        missing: value.missing,
      })),
    });
  }

  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: "The review import service is missing its Supabase configuration.", stage: "config" });
  }

  // ---------- Authenticate and authorise the caller ----------
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json(401, { error: "Authentication required", stage: "unauthenticated" });
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return json(401, { error: "Authentication required", stage: "unauthenticated" });

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: authData, error: authError } = await anonClient.auth.getUser(token);
  if (authError || !authData.user) return json(401, { error: "Your session has expired. Sign in again.", stage: "invalid-session" });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: profile } = await admin
    .from("profiles")
    .select("role, status, is_root")
    .eq("id", authData.user.id)
    .maybeSingle();

  const isStaff = Boolean(profile?.is_root) || STAFF_ROLES.has(String(profile?.role ?? ""));
  if (!profile || profile.status !== "active" || !isStaff) {
    return json(403, { error: "You do not have permission to import reviews.", stage: "forbidden" });
  }

  // ---------- Resolve the requested provider ----------
  let body: { provider?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json(400, { error: "Invalid request", stage: "payload" });
  }

  const provider = String(body.provider ?? "") as ProviderId;
  if (provider !== "tripadvisor" && provider !== "safaribookings") {
    return json(400, { error: "Unsupported review provider", stage: "payload" });
  }

  const config = providerConfig()[provider];
  if (!config.configured) {
    // Graceful, explicit, non-fatal: the website keeps working.
    return json(200, {
      imported: 0,
      skipped: 0,
      configured: false,
      provider,
      message: `${config.label} is not configured. Set ${config.missing.join(", ")} in the deployment environment to enable importing.`,
    });
  }

  // ---------- Fetch and normalise ----------
  let reviews: NormalizedReview[];
  try {
    reviews = provider === "tripadvisor"
      ? await fetchTripadvisorReviews()
      : await fetchSafariBookingsReviews();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`import-reviews ${provider} fetch failed:`, message);
    return json(502, { error: message, stage: "provider-fetch", provider });
  }

  if (reviews.length === 0) {
    return json(200, { imported: 0, skipped: 0, configured: true, provider, message: `${config.label} returned no new reviews.` });
  }

  // ---------- Persist, skipping anything already imported ----------
  // The partial unique index on (source, external_review_id) makes this safe
  // to re-run: existing reviews are refreshed, never duplicated.
  const now = new Date().toISOString();
  const rows = reviews.map((review) => ({
    ...review,
    // Imported reviews still pass through moderation before publication.
    status: "pending",
    published: false,
    flagged: false,
    consent_given: true, // the reviewer published this publicly on the platform
    imported_at: now,
    last_synced_at: now,
  }));

  const { data: inserted, error: upsertError } = await admin
    .from("testimonials")
    .upsert(rows, { onConflict: "source,external_review_id", ignoreDuplicates: false })
    .select("id");

  if (upsertError) {
    console.error("import-reviews upsert failed:", upsertError.message);
    return json(500, { error: "Reviews were fetched but could not be saved.", stage: "persist", provider });
  }

  await admin.from("audit_logs").insert({
    user_id: authData.user.id,
    action: "reviews.imported",
    target: "testimonial",
    outcome: "success",
    new_value: JSON.stringify({ provider, count: inserted?.length ?? 0 }),
  });

  return json(200, {
    imported: inserted?.length ?? 0,
    configured: true,
    provider,
    message: `${inserted?.length ?? 0} ${config.label} review(s) imported and queued for moderation.`,
  });
}
