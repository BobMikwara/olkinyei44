// Review provider architecture.
//
// Every review source normalises into ONE internal model (`Testimonial`), so
// adding a provider later never requires touching the CMS or the public site.
//
//   WebsiteReviewProvider        — live. Guest submissions via the website.
//   TripadvisorReviewProvider    — configuration-ready. Requires an authorised
//                                  Tripadvisor Content API key.
//   SafariBookingsReviewProvider — configuration-ready. Requires official
//                                  SafariBookings partner API access.
//
// IMPORTANT: the external providers are deliberately NOT implemented against
// a real endpoint here. They report `configured: false` until credentials are
// supplied to the server-side import route, and the site behaves normally
// without them. Nothing is scraped and no credentials live in this bundle.

import type { Testimonial, TestimonialStatus } from "./types";

export type ReviewSource = "website" | "tripadvisor" | "safaribookings" | "other";

/** A review as returned by a provider, before it is persisted. */
export type NormalizedReview = {
  source: ReviewSource;
  /** Stable id from the provider. Null for website submissions. */
  externalReviewId: string | null;
  externalUrl?: string;
  guestName: string;
  guestLocation?: string;
  guestPhoto?: string;
  quote: string;
  rating?: number;
  safariPackage?: string;
  /** When the review was written at the source. */
  externalCreatedAt?: string;
  /** Status to persist. Imports still pass through moderation. */
  status: TestimonialStatus;
};

export type ProviderStatus = {
  id: ReviewSource;
  label: string;
  /** True when every required credential is present server-side. */
  configured: boolean;
  /** Environment variables the operator must supply. */
  requires: string[];
  /** Short operator-facing explanation. */
  note: string;
};

export interface ReviewProvider {
  readonly id: ReviewSource;
  readonly label: string;
  /** Reports configuration state without throwing when unconfigured. */
  status(): ProviderStatus;
  /**
   * Fetches reviews from the provider. Implementations must be side-effect
   * free and must return an empty array when unconfigured.
   */
  fetchReviews(): Promise<NormalizedReview[]>;
}

/** Reviews submitted through the Olkinyei website. Always available. */
export const websiteReviewProvider: ReviewProvider = {
  id: "website",
  label: "Olkinyei Website",
  status: () => ({
    id: "website",
    label: "Olkinyei Website",
    configured: true,
    requires: [],
    note: "Guest submissions from the public Testimonials form. Always enabled.",
  }),
  // Website reviews are written directly by visitors, so there is nothing to
  // pull. The store already holds them.
  fetchReviews: async () => [],
};

/**
 * Tripadvisor. Requires an authorised Content API key and location id.
 * Import runs server-side (`/api/import-reviews`) so the key is never exposed.
 */
export const tripadvisorReviewProvider: ReviewProvider = {
  id: "tripadvisor",
  label: "Tripadvisor",
  status: () => ({
    id: "tripadvisor",
    label: "Tripadvisor",
    configured: false,
    requires: ["TRIPADVISOR_API_KEY", "TRIPADVISOR_LOCATION_ID", "TRIPADVISOR_API_BASE_URL"],
    note: "Awaiting authorised Tripadvisor Content API credentials. Reviews are not imported until these are set on the server.",
  }),
  fetchReviews: async () => [],
};

/**
 * SafariBookings. Requires official partner API access. If SafariBookings does
 * not expose a suitable API, this adapter stays dormant rather than resorting
 * to scraping.
 */
export const safariBookingsReviewProvider: ReviewProvider = {
  id: "safaribookings",
  label: "SafariBookings",
  status: () => ({
    id: "safaribookings",
    label: "SafariBookings",
    configured: false,
    requires: ["SAFARIBOOKINGS_API_KEY", "SAFARIBOOKINGS_OPERATOR_ID", "SAFARIBOOKINGS_API_BASE_URL"],
    note: "Awaiting official SafariBookings partner API access. No scraping is performed.",
  }),
  fetchReviews: async () => [],
};

export const REVIEW_PROVIDERS: ReviewProvider[] = [
  websiteReviewProvider,
  tripadvisorReviewProvider,
  safariBookingsReviewProvider,
];

/** Operator-facing labels for the review source badge. */
export const SOURCE_LABELS: Record<ReviewSource, string> = {
  website: "Olkinyei Website",
  tripadvisor: "Tripadvisor",
  safaribookings: "SafariBookings",
  other: "Other",
};

/** True when the review came from a third-party platform. */
export function isExternalSource(source: ReviewSource): boolean {
  return source !== "website";
}

/**
 * Deduplication key. A provider review is unique per `source + externalReviewId`,
 * matching the partial unique index in supabase/testimonials_sources.sql.
 */
export function reviewIdentity(review: Pick<NormalizedReview, "source" | "externalReviewId">): string | null {
  return review.externalReviewId ? `${review.source}:${review.externalReviewId}` : null;
}

/** Maps a stored testimonial back to the provider vocabulary. */
export function testimonialSource(testimonial: Testimonial): ReviewSource {
  const source = testimonial.source as string;
  return (["website", "tripadvisor", "safaribookings", "other"] as const).includes(source as ReviewSource)
    ? (source as ReviewSource)
    : "website";
}
