// Single source of truth for values shared by the database and the frontend.
// Every literal here must exactly match the corresponding Postgres CHECK
// constraint (see supabase/role_canonicalization.sql and schema.sql).

import type { Role } from "./types";

/**
 * Canonical staff roles. Mirrors `profiles_role_check`.
 * There is no legacy/alias mapping: the database stores these exact strings.
 */
export const ROLES = [
  "root",
  "super_admin",
  "content_manager",
  "booking_manager",
  "marketing_manager",
  "finance",
] as const satisfies readonly Role[];

/** Roles an administrator may assign. `root` is provisioned out-of-band only. */
export const ASSIGNABLE_ROLES = ROLES.filter((role) => role !== "root");

/**
 * Pre-canonicalisation role names, kept only so a stale cached session or a
 * database that has not yet run `supabase/role_canonicalization.sql` still
 * resolves to real permissions instead of an empty set.
 */
export const LEGACY_ROLE_ALIASES: Record<string, Role> = {
  root_super_admin: "root",
  admin: "super_admin",
  reservation_manager: "booking_manager",
  reservation: "booking_manager",
  bookings: "booking_manager",
  marketing: "marketing_manager",
  editor: "content_manager",
};

/** Human-readable labels for role pickers. */
export const ROLE_LABELS: Record<Role, string> = {
  root: "Root Super Admin",
  super_admin: "Super Admin",
  content_manager: "Content Manager",
  booking_manager: "Booking Manager",
  marketing_manager: "Marketing Manager",
  finance: "Finance",
};

/** Short description of each role's scope, shown in the user editor. */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  root: "Unrestricted access. Provisioned by the system creators and immutable from the CMS.",
  super_admin: "Full system access including user management and site settings. Cannot modify the Root Super Admin.",
  content_manager: "Manage packages, destinations, media, blog, guides, SEO, and pages.",
  booking_manager: "Manage bookings, customers, guides, vehicles, and invoices.",
  marketing_manager: "Manage blog, media, gallery, SEO, emails, and analytics.",
  finance: "View bookings, customers, and financial reports.",
};

/** Account lifecycle states. Mirrors `profiles_status_check`. */
export const PROFILE_STATUSES = ["active", "pending", "suspended", "deleted"] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

/** Booking pipeline states. Mirrors the `bookings.status` CHECK constraint. */
export const BOOKING_STATUSES = [
  "New",
  "Confirmed",
  "In planning",
  "Cancelled",
  "Completed",
  "Refunded",
] as const;

/** Editorial categories. Mirrors `blog_posts_category_check`. */
export const BLOG_CATEGORIES = [
  "Wildlife",
  "Travel",
  "Visa",
  "Packing",
  "Photography",
  "Conservation",
  "Culture",
] as const;

/** Testimonial moderation states. Mirrors `testimonials_status_check`. */
export const TESTIMONIAL_STATUSES = ["pending", "approved", "rejected", "flagged"] as const;

/**
 * Client-side profanity screening. Mirrors the server-side list in
 * `supabase/testimonials_moderation.sql`; the database remains authoritative.
 * This copy exists only to warn the visitor before they submit.
 */
export const BLOCKED_TERMS = [
  "fuck", "shit", "bitch", "asshole", "bastard", "cunt", "dick", "piss", "slut", "whore",
  "nigger", "faggot", "retard", "rape", "kill yourself", "scam", "fraud", "viagra", "casino",
] as const;

/** Database table names referenced by the client. */
export const TABLES = {
  profiles: "profiles",
  bookings: "bookings",
  blogPosts: "blog_posts",
  testimonials: "testimonials",
  auditLogs: "audit_logs",
  cmsContent: "cms_content",
} as const;

/** Privileged serverless endpoints (service-role work happens there). */
export const API_ROUTES = {
  inviteUser: "/api/invite-user",
  manageUser: "/api/manage-user",
} as const;
