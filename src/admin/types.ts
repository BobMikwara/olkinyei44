// Admin CMS type system for Olkinyei Expeditions
// Mirrors public data and extends it for enterprise CMS operations

// Root Super Admin is protected — created only by the system creators,
// cannot be created, edited, deleted or demoted by any other admin.
export type Role = "root" | "super_admin" | "content_manager" | "booking_manager" | "marketing_manager" | "finance";

// Granular per-module permissions. Each module supports discrete actions.
export type ModuleKey =
  | "dashboard" | "pages" | "blog" | "packages" | "bookings" | "gallery"
  | "media" | "destinations" | "customers" | "guides" | "vehicles"
  | "team" | "users" | "roles" | "seo" | "settings" | "analytics"
  | "forms" | "integrations" | "emails" | "logo" | "system" | "activity";

export type Action = "view" | "create" | "edit" | "delete" | "publish" | "manage" | "export" | "approve";

export type ModulePermission = Partial<Record<Action, boolean>>;

export type PermissionSet = Partial<Record<ModuleKey, ModulePermission>>;

// Legacy view/manage/none permission map — kept for backwards compatibility
// with existing modules that reference ROLE_PERMISSIONS.
export type Permission = {
  bookings: "view" | "manage" | "none";
  packages: "view" | "manage" | "none";
  destinations: "view" | "manage" | "none";
  media: "view" | "manage" | "none";
  blog: "view" | "manage" | "none";
  customers: "view" | "manage" | "none";
  guides: "view" | "manage" | "none";
  vehicles: "view" | "manage" | "none";
  users: "view" | "manage" | "none";
  seo: "view" | "manage" | "none";
  analytics: "view" | "none";
  settings: "view" | "manage" | "none";
  activity: "view" | "none";
};

// Full manage rights on every module for privileged accounts.
const FULL: ModulePermission = { view: true, create: true, edit: true, delete: true, publish: true, manage: true, export: true, approve: true };

const VIEW: ModulePermission = { view: true };
const MANAGE: ModulePermission = { view: true, create: true, edit: true, publish: true, manage: true };
const MANAGE_WITH_DELETE: ModulePermission = { view: true, create: true, edit: true, delete: true, publish: true, manage: true };
const EDIT_ONLY: ModulePermission = { view: true, edit: true };

export const ROLE_PERMISSION_SETS: Record<Role, PermissionSet> = {
  root: {
    dashboard: FULL, pages: FULL, blog: FULL, packages: FULL, bookings: FULL,
    gallery: FULL, media: FULL, destinations: FULL, customers: FULL, guides: FULL,
    vehicles: FULL, team: FULL, users: FULL, roles: FULL, seo: FULL,
    settings: FULL, analytics: FULL, forms: FULL, integrations: FULL,
    emails: FULL, logo: FULL, system: FULL, activity: FULL,
  },
  super_admin: {
    dashboard: FULL, pages: MANAGE_WITH_DELETE, blog: MANAGE_WITH_DELETE, packages: MANAGE_WITH_DELETE,
    bookings: FULL, gallery: MANAGE_WITH_DELETE, media: MANAGE_WITH_DELETE, destinations: MANAGE_WITH_DELETE,
    customers: MANAGE_WITH_DELETE, guides: MANAGE_WITH_DELETE, vehicles: MANAGE_WITH_DELETE, team: MANAGE_WITH_DELETE,
    users: MANAGE_WITH_DELETE, roles: MANAGE, seo: MANAGE_WITH_DELETE, settings: MANAGE,
    analytics: { view: true, export: true }, forms: MANAGE_WITH_DELETE, integrations: MANAGE,
    emails: MANAGE_WITH_DELETE, logo: MANAGE, system: MANAGE, activity: { view: true, export: true },
  },
  content_manager: {
    dashboard: VIEW, pages: MANAGE, blog: MANAGE_WITH_DELETE, packages: MANAGE_WITH_DELETE,
    gallery: MANAGE_WITH_DELETE, media: MANAGE_WITH_DELETE, destinations: MANAGE_WITH_DELETE,
    guides: MANAGE, seo: MANAGE, forms: EDIT_ONLY, emails: EDIT_ONLY,
    analytics: VIEW, activity: VIEW, customers: VIEW,
  },
  booking_manager: {
    dashboard: VIEW, bookings: { view: true, create: true, edit: true, publish: true, manage: true, approve: true, export: true },
    packages: VIEW, destinations: VIEW, media: VIEW, customers: MANAGE_WITH_DELETE,
    guides: MANAGE, vehicles: MANAGE_WITH_DELETE, emails: EDIT_ONLY,
    analytics: { view: true, export: true }, activity: VIEW,
  },
  marketing_manager: {
    dashboard: VIEW, bookings: VIEW, packages: VIEW, destinations: VIEW,
    media: MANAGE_WITH_DELETE, gallery: MANAGE_WITH_DELETE, blog: MANAGE_WITH_DELETE,
    customers: VIEW, seo: MANAGE, emails: MANAGE_WITH_DELETE, forms: MANAGE,
    integrations: EDIT_ONLY, analytics: { view: true, export: true }, activity: VIEW,
  },
  finance: {
    dashboard: VIEW, bookings: { view: true, approve: true, export: true },
    packages: VIEW, customers: VIEW, analytics: { view: true, export: true }, activity: VIEW,
  },
};

// Backwards-compatible map derived from the granular permission sets so
// existing modules using view/manage/none continue to function unchanged.
function deriveLegacy(role: Role): Permission {
  const set = ROLE_PERMISSION_SETS[role];
  const level = (key: ModuleKey): "view" | "manage" | "none" => {
    const perm = set[key];
    if (!perm) return "none";
    if (perm.manage || perm.edit || perm.create || perm.delete || perm.publish) return "manage";
    if (perm.view) return "view";
    return "none";
  };
  return {
    bookings: level("bookings"), packages: level("packages"), destinations: level("destinations"),
    media: level("media"), blog: level("blog"), customers: level("customers"), guides: level("guides"),
    vehicles: level("vehicles"), users: level("users"), seo: level("seo"),
    analytics: level("analytics") === "none" ? "none" : "view",
    settings: level("settings"), activity: level("activity") === "none" ? "none" : "view",
  };
}

export const ROLE_PERMISSIONS: Record<Role, Permission> = {
  root: deriveLegacy("root"),
  super_admin: deriveLegacy("super_admin"),
  content_manager: deriveLegacy("content_manager"),
  booking_manager: deriveLegacy("booking_manager"),
  marketing_manager: deriveLegacy("marketing_manager"),
  finance: deriveLegacy("finance"),
};

/**
 * Client-side view of the active Supabase session. `token` holds the
 * Supabase-managed access token, which rotates automatically.
 */
export type Session = {
  token: string;
  userId: string;
  issuedAt: string;
  expiresAt: string;
  lastActivityAt: string;
  ip: string;
  userAgent: string;
};

/**
 * Local audit entry rendered in the CMS activity views.
 *
 * NOTE: this is intentionally distinct from the `public.audit_logs` row shape
 * (user_id / target_id / ip_address / browser / created_at). The database
 * write path lives in `writeAudit()`; this type only describes the in-memory
 * list, so field names stay camelCase like the rest of the client models.
 */
export type AuditEntry = {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  target: string;
  targetId?: string;
  ip: string;
  userAgent: string;
  timestamp: string;
  outcome: "success" | "failure";
  reason?: string;
};

/**
 * A staff member, mapped from `public.profiles`.
 *
 * Credentials are owned entirely by Supabase Auth — this model deliberately
 * carries no password material.
 */
export type AdminUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  avatar: string;
  lastLogin: string;
  /** `pending` in the database is surfaced as `invited` in the CMS. */
  status: "active" | "invited" | "suspended";
  createdAt: string;
  mustChangePassword?: boolean;
  invitedBy?: string;
  invitedAt?: string;
  /** Immutable Root Super Admin flag (`profiles.is_root`). */
  isRoot?: boolean;
  /** Optional per-user override of the role's default permissions. */
  customPermissions?: PermissionSet;
};

export type ActivityEntry = {
  id: string;
  actorId: string;
  actorName: string;
  action: "created" | "updated" | "deleted" | "published" | "archived" | "restored" | "assigned" | "confirmed" | "login";
  entity: string;
  entityId: string;
  entityLabel: string;
  timestamp: string;
  ip: string;
  details?: string;
};

export type BookingStatus = "New" | "Confirmed" | "In planning" | "Cancelled" | "Completed" | "Refunded";

export type Booking = {
  id: string;
  reference: string;
  createdAt: string;
  status: BookingStatus;
  safariId: string;
  safari: string;
  startDate: string;
  endDate: string;
  adults: number;
  children: number;
  accommodation: string;
  pickup: string;
  airport: string;
  budget: string;
  requests: string;
  payment: string;
  name: string;
  email: string;
  phone: string;
  assignedGuideId?: string;
  assignedVehicleId?: string;
  invoiceId?: string;
  paymentStatus: "Pending" | "Deposit" | "Paid" | "Refunded";
  paymentAmount?: number;
  notes?: string;
  customerId?: string;
};

/**
 * The single authoritative Safari Package model. Supabase `public.packages`
 * is the source of truth; `packageFromRow` / `packageToRow` in `store.ts`
 * are the only mapping between this camelCase model and the database's
 * snake_case columns. Both the Studio CMS and the public website consume
 * this exact type — there is no separate public "Safari" model.
 *
 * Field naming mirrors the database exactly: `included` is the
 * `public.packages.included` jsonb array and `excluded` is the
 * `public.packages.excluded` jsonb array. The "Not included" label used in
 * the CMS/public UI is simply the display name for `excluded`.
 */
export type SafariPackage = {
  id: string;
  slug: string;
  title: string;
  region: string;
  duration: string;
  nights: number;
  price: number;
  discount?: number;
  image: string;
  gallery: string[];
  summary: string;
  description: string;
  signature: string;
  highlights: string[];
  included: string[];
  excluded: string[];
  availability: string[];
  country: ("Kenya" | "Tanzania")[];
  parks: string[];
  wildlife: string[];
  difficulty: "Gentle" | "Moderate" | "Active" | "Expedition";
  tags: string[];
  featured: boolean;
  published: boolean;
  seo: { title: string; description: string };
  coordinates: [number, number];
  publishDate?: string;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
};

export type Destination = {
  id: string;
  slug: string;
  name: string;
  country: "Kenya" | "Tanzania";
  coordinates: [number, number];
  bestTime: string;
  animal: string;
  image: string;
  gallery: string[];
  description: string;
  longDescription: string;
  activities: string[];
  featured: boolean;
  published: boolean;
  seo: { title: string; description: string };
  createdAt: string;
  updatedAt: string;
};

export type MediaAsset = {
  id: string;
  url: string;
  thumbnail: string;
  type: "image" | "video" | "pdf" | "document";
  name: string;
  alt: string;
  category: string;
  tags: string[];
  size: number;
  dimensions?: { width: number; height: number };
  duration?: number;
  copyright: string;
  uploadedBy: string;
  createdAt: string;
  folder: string;
  archived?: boolean;
};

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: "Wildlife" | "Travel" | "Visa" | "Packing" | "Photography" | "Conservation" | "Culture";
  tags: string[];
  heroImage: string;
  authorId: string;
  author: string;
  readingTime: number;
  seo: { title: string; description: string };
  publishedAt?: string;
  status: "draft" | "scheduled" | "published" | "archived";
  featured: boolean;
  comments: number;
  createdAt: string;
  updatedAt: string;
};

/** Moderation lifecycle for a testimonial. Mirrors `testimonials_status_check`. */
export type TestimonialStatus = "pending" | "approved" | "rejected" | "flagged";

/**
 * A guest testimonial, mapped from `public.testimonials`.
 *
 * `published` remains in the database for backwards compatibility and is kept
 * in sync with `status` by a trigger — only `approved` rows are ever public.
 */
export type Testimonial = {
  id: string;
  quote: string;
  guestName: string;
  guestLocation?: string;
  guestEmail?: string;
  guestPhoto?: string;
  /** 1-5 stars. Absent on older entries and some imported reviews. */
  rating?: number;
  /** Safari or package the guest experienced. */
  safariPackage?: string;
  /** Guest granted permission to display the testimonial publicly. */
  consentGiven: boolean;
  status: TestimonialStatus;
  flagged: boolean;
  flagReason?: string;
  staffNotes?: string;
  /** Review platform the entry originated from. */
  source: "website" | "tripadvisor" | "safaribookings" | "other";
  /** Provider's own review id. Null for website submissions. */
  externalReviewId?: string;
  /** Canonical link to the review on the source platform. */
  externalUrl?: string;
  /** Raw rating as supplied by the provider, before normalisation. */
  externalRating?: number;
  /** When the review was written on the source platform. */
  externalCreatedAt?: string;
  importedAt?: string;
  lastSyncedAt?: string;
  sortOrder: number;
  moderatedBy?: string;
  moderatedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type Guide = {
  id: string;
  name: string;
  slug: string;
  title: string;
  bio: string;
  portrait: string;
  gallery: string[];
  languages: string[];
  speciality: string;
  yearsInField: number;
  locations: string[];
  rating: number;
  assignments: number;
  availability: Record<string, "available" | "on_trip" | "rest" | "on_leave">;
  status: "active" | "inactive";
  email: string;
  phone: string;
  createdAt: string;
};

export type Vehicle = {
  id: string;
  fleetCode: string;
  model: string;
  type: "Land Cruiser" | "Photography Vehicle" | "Minibus" | "Boat" | "Light Aircraft";
  base: string;
  capacity: number;
  status: "Ready" | "In field" | "Service due" | "Unavailable";
  image?: string;
  driverId?: string;
  lastService: string;
  nextService: string;
  insurance: string;
  mileage: number;
  gps?: { lat: number; lng: number };
  notes: string;
  createdAt: string;
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  avatar: string;
  totalBookings: number;
  totalSpent: number;
  lifetimeValue: "Platinum" | "Gold" | "Silver" | "Bronze" | "New";
  firstTrip: string;
  lastTrip: string;
  notes: string;
  wishlist: string[];
  tags: string[];
  createdAt: string;
};

export type PageSettings = {
  id: string;
  route: string;
  title: string;
  heroTitle: string;
  heroEyebrow: string;
  heroText: string;
  heroImage: string;
  content: Record<string, unknown>;
  published: boolean;
  seo: { title: string; description: string; keywords: string[] };
  updatedAt: string;
  updatedBy: string;
};

export type SiteSettings = {
  brandName: string;
  tagline: string;
  logo: string;
  darkLogo: string;
  favicon: string;
  primaryColor: string;
  accentColor: string;
  textColor: string;
  backgroundColor: string;
  serifFont: string;
  sansFont: string;
  contactEmail: string;
  reservationsEmail: string;
  phone: string;
  whatsapp: string;
  addresses: { city: string; address: string }[];
  social: { platform: string; url: string }[];
  analytics: { ga4: string; gtm: string; fbPixel: string; clarity: string };
  maintenanceMode: boolean;
  comingSoon: boolean;
  robotsTxt: string;
  customCss: string;
  customJs: string;
};

export type Notification = {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
  duration?: number;
};

export type Theme = "dark" | "light";

export type ViewMode = "table" | "grid" | "kanban" | "calendar" | "timeline";

export type Filter<T> = {
  search: string;
  status?: string;
  tags: string[];
  dateRange?: { start: string; end: string };
  sort?: { field: keyof T; direction: "asc" | "desc" };
};

export type ModalAction = {
  label: string;
  variant?: "primary" | "danger" | "ghost";
  onClick: () => void;
  loading?: boolean;
};

export type CommandItem = {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  shortcut?: string;
  section: string;
  action: () => void;
};

export type Column<T> = {
  key: keyof T | string;
  label: string;
  width?: string;
  sortable?: boolean;
  render?: (item: T) => React.ReactNode;
};

export type Toast = Notification;
