import { createClient, RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Booking } from "../data";

// ============ Frontend environment configuration ============================
//
// Vite inlines VITE_* variables at BUILD time. On Vercel the variables must
// exist in Project Settings → Environment Variables (Production) BEFORE the
// deployment runs; a rebuild is required after adding or renaming them.
//
// Frontend code must use import.meta.env only — never process.env.

function normalizeEnvValue(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let value = raw.trim();
  // Vercel / CLI copy-paste sometimes wraps values in quotes; they are not
  // part of the value, and they break URL parsing downstream.
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
    (value.startsWith("'") && value.endsWith("'") && value.length > 1)
  ) {
    value = value.slice(1, -1).trim();
  }
  return value.length > 0 ? value : undefined;
}

const supabaseUrl = normalizeEnvValue(import.meta.env.VITE_SUPABASE_URL as string | undefined);
// The only supported key name. Never use the service-role key in frontend code.
const supabaseKey = normalizeEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

type ConfigDiagnostics = {
  configured: boolean;
  missing: string[];
  invalid: string[];
  urlHost?: string;
};

function computeDiagnostics(): ConfigDiagnostics {
  const missing: string[] = [];
  const invalid: string[] = [];
  let urlHost: string | undefined;

  if (!supabaseUrl) missing.push("VITE_SUPABASE_URL");
  if (!supabaseKey) missing.push("VITE_SUPABASE_ANON_KEY");

  if (supabaseUrl) {
    try {
      urlHost = new URL(supabaseUrl).host;
    } catch {
      invalid.push("VITE_SUPABASE_URL (not a valid URL)");
    }
  }
  if (supabaseKey && !/^eyJ[A-Za-z0-9_\-.]+$/.test(supabaseKey) && supabaseKey.length < 64) {
    invalid.push("VITE_SUPABASE_ANON_KEY (does not look like a Supabase API key)");
  }

  return {
    configured: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
    urlHost,
  };
}

export const supabaseConfigDiagnostics = computeDiagnostics();

// Development-only diagnostics: never logs secret values, never runs in the
// production bundle output (import.meta.env.DEV is false in builds).
if (import.meta.env.DEV) {
  if (!supabaseConfigDiagnostics.configured) {
    console.warn(
      "[Olkinyei] Supabase is not configured for this build:",
      JSON.stringify({
        missing: supabaseConfigDiagnostics.missing,
        invalid: supabaseConfigDiagnostics.invalid,
      }),
      "Set the variables in Vercel → Settings → Environment Variables (Production), then redeploy.",
    );
  } else {
    console.debug(`[Olkinyei] Supabase connected to ${supabaseConfigDiagnostics.urlHost}`);
  }
}

function buildClient(): SupabaseClient | null {
  if (supabaseConfigDiagnostics.missing.length > 0 || supabaseConfigDiagnostics.invalid.length > 0) {
    return null;
  }
  try {
    return createClient(supabaseUrl as string, supabaseKey as string);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("[Olkinyei] Failed to create the Supabase client:", error instanceof Error ? error.message : error);
    }
    return null;
  }
}

export const supabase = buildClient();
export const hasCloudBackend = Boolean(supabase);

// Accurate, deploy-actionable reason string when cloud auth is unavailable.
export function cloudUnavailableReason(): string {
  if (hasCloudBackend) return "";
  if (supabaseConfigDiagnostics.missing.length > 0) {
    const names = supabaseConfigDiagnostics.missing.join(" and ");
    return `This build is missing ${names}. Add ${names} to the Vercel project environment variables, then redeploy so the value is included in the build.`;
  }
  if (supabaseConfigDiagnostics.invalid.length > 0) {
    return `One Supabase environment value is invalid (${supabaseConfigDiagnostics.invalid.join(", ")}). Check the value in Vercel → Settings → Environment Variables, then redeploy.`;
  }
  return "Supabase authentication could not be initialised in this build.";
}

type BookingRow = {
  reference: string;
  created_at: string;
  status: Booking["status"];
  safari: string;
  start_date: string;
  end_date: string;
  adults: number;
  children: number;
  accommodation: string;
  pickup: string;
  airport: string;
  budget: string;
  special_requests: string;
  payment_preference: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
};

function toRow(booking: Booking): BookingRow {
  return {
    reference: booking.reference,
    created_at: booking.createdAt,
    status: booking.status,
    safari: booking.safari,
    start_date: booking.startDate,
    end_date: booking.endDate,
    adults: booking.adults,
    children: booking.children,
    accommodation: booking.accommodation,
    pickup: booking.pickup,
    airport: booking.airport,
    budget: booking.budget,
    special_requests: booking.requests,
    payment_preference: booking.payment,
    customer_name: booking.name,
    customer_email: booking.email,
    customer_phone: booking.phone,
  };
}

function fromRow(row: BookingRow): Booking {
  return {
    reference: row.reference,
    createdAt: row.created_at,
    status: row.status,
    safari: row.safari,
    startDate: row.start_date,
    endDate: row.end_date,
    adults: row.adults,
    children: row.children,
    accommodation: row.accommodation,
    pickup: row.pickup,
    airport: row.airport,
    budget: row.budget,
    requests: row.special_requests,
    payment: row.payment_preference,
    name: row.customer_name,
    email: row.customer_email,
    phone: row.customer_phone,
  };
}

// Server-side-equivalent validation performed before the insert. Database
// CHECK constraints + RLS remain the authoritative enforcement.
function validateBookingInput(booking: Booking): string | null {
  if (!booking.reference || booking.reference.length > 32) return "Invalid reference.";
  if (!booking.safari || booking.safari.length > 160) return "Safari selection is required.";
  if (!/^\S+@\S+\.\S+$/.test(booking.email)) return "A valid email address is required.";
  if (!booking.name || booking.name.length > 120) return "Customer name is required.";
  if (!booking.phone || booking.phone.length > 32) return "Phone number is required.";
  if (!(booking.adults >= 1 && booking.adults <= 30)) return "Adult count must be between 1 and 30.";
  if (!(booking.children >= 0 && booking.children <= 30)) return "Children count must be between 0 and 30.";
  const start = new Date(booking.startDate).getTime();
  const end = new Date(booking.endDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "Travel dates are invalid.";
  return null;
}

// Truncates free-text fields before insert (defence-in-depth against abuse).
function toSafeRow(booking: Booking): BookingRow {
  const clip = (value: string, max: number) => value.slice(0, max);
  return {
    ...toRow(booking),
    safari: clip(booking.safari, 160),
    customer_name: clip(booking.name, 120),
    accommodation: clip(booking.accommodation, 160),
    pickup: clip(booking.pickup, 200),
    airport: clip(booking.airport, 160),
    budget: clip(booking.budget, 80),
    special_requests: clip(booking.requests, 4000),
    customer_phone: clip(booking.phone, 32),
  };
}

async function logEmailFailure(reference: string, reason: string) {
  if (!supabase) return;
  try {
    await supabase.from("audit_logs").insert({
      user_id: null,
      action: "booking.email.failed",
      target: "booking",
      target_id: reference,
      outcome: "failure",
      reason: reason.slice(0, 500),
    });
  } catch { /* audit must never block the booking flow */ }
}

export async function persistBooking(booking: Booking) {
  if (!supabase) return { cloud: false, storageError: null, emailWarning: null };
  const invalid = validateBookingInput(booking);
  if (invalid) return { cloud: true, storageError: invalid, emailWarning: null };
  try {
    const { error } = await supabase.from("bookings").insert(toSafeRow(booking));
    if (error) return { cloud: true, storageError: error.message, emailWarning: null };

    // Email delivery is isolated in an Edge Function so provider credentials never reach the browser.
    // Failure here must never affect the saved booking.
    const { error: emailError } = await supabase.functions.invoke("send-booking-confirmation", { body: booking });
    if (emailError) void logEmailFailure(booking.reference, emailError.message);
    return { cloud: true, storageError: null, emailWarning: emailError?.message ?? null };
  } catch (error) {
    return { cloud: true, storageError: error instanceof Error ? error.message : "Network connection failed", emailWarning: null };
  }
}

export async function getCloudBookings() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error || !data) return [];
  return (data as BookingRow[]).map(fromRow);
}

export function subscribeToBookings(onBooking: (booking: Booking) => void): RealtimeChannel | null {
  if (!supabase) return null;
  return supabase
    .channel("olkinyei-booking-inserts")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "bookings" }, (payload) => onBooking(fromRow(payload.new as BookingRow)))
    .subscribe();
}

export async function updateCloudBookingStatus(reference: string, status: Booking["status"]) {
  if (!supabase) return;
  await supabase.from("bookings").update({ status }).eq("reference", reference);
}

export async function deleteCloudBooking(reference: string): Promise<{ ok: boolean; message?: string }> {
  if (!supabase) return { ok: false, message: "Cloud database is not configured." };
  const { error } = await supabase.from("bookings").delete().eq("reference", reference);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}