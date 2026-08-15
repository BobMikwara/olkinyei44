// Admin CMS state management with persistence
// Handles all CRUD operations for the entire CMS
// Production-grade authentication, session management, and RBAC.

import { useCallback, useRef, useSyncExternalStore } from "react";
import type {
  AdminUser, ActivityEntry, Action, AuditEntry, Booking, BlogPost, Customer, Destination, Guide,
  MediaAsset, ModuleKey, Notification,
  PageSettings, PermissionSet, Role, SafariPackage, Session,
  SiteSettings, Testimonial, TestimonialStatus, Theme, Vehicle,
} from "./types";
import { cloudUnavailableReason, supabase } from "../lib/supabase";
import { LEGACY_ROLE_ALIASES, TABLES } from "./constants";
import {
  authChangePassword,
  authSignIn,
  hasCloudBackend,
  writeAudit as writeCloudAudit,
} from "./auth";
import { ROLE_PERMISSION_SETS } from "./types";

// ============ Session constants ============
const PASSWORD_MIN_LENGTH = 10;
const SESSION_IDLE_MINUTES = 30;
const SESSION_MAX_HOURS = 8;
const SESSION_STORAGE_KEY = "olkinyei-admin-session";

// Auth is cloud-only: Supabase Auth holds credentials, invitations, password
// tokens, and sessions. The service role key never touches this bundle — all
// privileged operations go through Vercel serverless functions (/api/*).

// ============ Seed Data ============

// Placeholder directory shown before the cloud profile list loads. Real staff
// come from `public.profiles` via authListProfiles(); these rows are inert
// because Supabase Auth owns credentials.
const seedUsers: AdminUser[] = [
  { id: "u1", email: "oliver@olkinyei.com", fullName: "Oliver Kimani", role: "super_admin", avatar: "https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg?auto=compress&cs=tinysrgb&w=120&h=120&fit=crop", lastLogin: "2026-05-14T08:42:00Z", status: "invited", createdAt: "2024-03-12T00:00:00Z", mustChangePassword: true },
  { id: "u2", email: "amara@olkinyei.com", fullName: "Amara Osei", role: "booking_manager", avatar: "https://images.pexels.com/photos/1239295/pexels-photo-1239295.jpeg?auto=compress&cs=tinysrgb&w=120&h=120&fit=crop", lastLogin: "2026-05-14T07:15:00Z", status: "invited", createdAt: "2024-06-18T00:00:00Z", mustChangePassword: true },
  { id: "u3", email: "lena@olkinyei.com", fullName: "Lena Van Der Berg", role: "content_manager", avatar: "https://images.pexels.com/photos/1130626/pexels-photo-1130626.jpeg?auto=compress&cs=tinysrgb&w=120&h=120&fit=crop", lastLogin: "2026-05-13T19:22:00Z", status: "invited", createdAt: "2024-08-02T00:00:00Z", mustChangePassword: true },
  { id: "u4", email: "tom@olkinyei.com", fullName: "Tom Ashford", role: "marketing_manager", avatar: "https://images.pexels.com/photos/1040880/pexels-photo-1040880.jpeg?auto=compress&cs=tinysrgb&w=120&h=120&fit=crop", lastLogin: "2026-05-12T14:08:00Z", status: "invited", createdAt: "2025-01-05T00:00:00Z", mustChangePassword: true },
  { id: "u5", email: "priya@olkinyei.com", fullName: "Priya Naidoo", role: "finance", avatar: "https://images.pexels.com/photos/1065084/pexels-photo-1065084.jpeg?auto=compress&cs=tinysrgb&w=120&h=120&fit=crop", lastLogin: "2026-05-14T06:30:00Z", status: "invited", createdAt: "2025-02-22T00:00:00Z", mustChangePassword: true },
  { id: "u6", email: "marcus@olkinyei.com", fullName: "Marcus Chen", role: "content_manager", avatar: "https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=120&h=120&fit=crop", lastLogin: "2026-05-10T11:45:00Z", status: "invited", createdAt: "2026-05-01T00:00:00Z", mustChangePassword: true },
];

const seedBookings: Booking[] = [
  { id: "b1", reference: "OLK-2026-QF8K2", createdAt: "2026-05-12T14:22:00Z", status: "Confirmed", safariId: "great-migration", safari: "The Great Migration", startDate: "2026-07-18", endDate: "2026-07-27", adults: 2, children: 0, accommodation: "Intimate camps under canvas", pickup: "Villa in Kensington, London", airport: "Jomo Kenyatta International Airport (NBO)", budget: "$12,000 - $18,000 per person", requests: "Anniversary celebration. Love photography and predators. Prefer quiet camps.", payment: "Secure card payment", name: "Amelia Whitfield", email: "amelia.whitfield@northstar.co.uk", phone: "+44 7700 900123", assignedGuideId: "g1", assignedVehicleId: "v1", invoiceId: "inv-4421", paymentStatus: "Deposit", paymentAmount: 8400, notes: "Platinum tier client, third expedition with us.", customerId: "c1" },
  { id: "b2", reference: "OLK-2026-KM9R1", createdAt: "2026-05-11T09:15:00Z", status: "In planning", safariId: "honeymoon", safari: "Wildly, Together", startDate: "2026-08-02", endDate: "2026-08-13", adults: 2, children: 0, accommodation: "Exceptional luxury lodges", pickup: "Honeymoon suite at The Manor, Nairobi", airport: "Kilimanjaro International Airport (JRO)", budget: "$12,000 - $18,000 per person", requests: "Private hot-air balloon flight. Vegetarian. Interested in Maasai cultural visit.", payment: "Bank transfer", name: "Jonathan & Sofia Reyes", email: "s.reyes@meridian.capital", phone: "+1 212 555 0198", assignedGuideId: "g2", invoiceId: "inv-4418", paymentStatus: "Deposit", paymentAmount: 11200, notes: "Honeymoon gift from parents. First trip to Africa.", customerId: "c2" },
  { id: "b3", reference: "OLK-2026-NP4X7", createdAt: "2026-05-10T16:40:00Z", status: "New", safariId: "photographic", safari: "The Photographer's Light", startDate: "2026-09-12", endDate: "2026-09-22", adults: 4, children: 1, accommodation: "A considered mix of camps and lodges", pickup: "Hotel Four Seasons, Nairobi", airport: "Jomo Kenyatta International Airport (NBO)", budget: "$8,000 - $12,000 per person", requests: "Professional film crew joining for three days. Need vehicle with charging and beanbags. 10-year-old child interested in big cats.", payment: "Secure card payment", name: "Henrik Lindqvist", email: "h.lindqvist@nordicframe.se", phone: "+46 70 555 1234", paymentStatus: "Pending", notes: "Nordic Film Collective. Potential brand partnership.", customerId: "c3" },
  { id: "b4", reference: "OLK-2026-TJ3W5", createdAt: "2026-05-09T11:20:00Z", status: "Confirmed", safariId: "family", safari: "The Family Bush", startDate: "2026-06-28", endDate: "2026-07-06", adults: 2, children: 3, accommodation: "Private villas for the family", pickup: "Hemingways, Nairobi", airport: "Wilson Airport (WIL)", budget: "$8,000 - $12,000 per person", requests: "Children aged 7, 10, 12. Need flexible schedule and child-safe activities.", payment: "Secure card payment", name: "The Bergström Family", email: "anna.bergstrom@klartext.nu", phone: "+46 73 221 9876", assignedGuideId: "g3", assignedVehicleId: "v3", invoiceId: "inv-4412", paymentStatus: "Paid", paymentAmount: 57500, customerId: "c4" },
  { id: "b5", reference: "OLK-2026-VP6M8", createdAt: "2026-05-08T07:55:00Z", status: "New", safariId: "walking", safari: "On Foot in the Rift", startDate: "2026-10-15", endDate: "2026-10-21", adults: 2, children: 0, accommodation: "Intimate camps under canvas", pickup: "Arusha Coffee Lodge", airport: "Kilimanjaro International Airport (JRO)", budget: "$5,000 - $8,000 per person", requests: "Both experienced hikers. Interested in Hadzabe encounter and birdlife.", payment: "Speak with my designer first", name: "Claire & Pierre Moreau", email: "c.moreau@atelier-m.fr", phone: "+33 6 12 34 56 78", paymentStatus: "Pending", notes: "French travel writers. Potential feature in Condé Nast Traveler France." },
  { id: "b6", reference: "OLK-2026-YQ2P9", createdAt: "2026-05-07T13:10:00Z", status: "In planning", safariId: "luxury-lodge", safari: "Lodges Beyond the Wild", startDate: "2026-07-05", endDate: "2026-07-13", adults: 2, children: 0, accommodation: "Exceptional luxury lodges", pickup: "Four Seasons, Serengeti", airport: "Kilimanjaro International Airport (JRO)", budget: "$18,000+ per person", requests: "Design enthusiast. Interested in Singita, &Beyond properties. Private guide.", payment: "Bank transfer", name: "Victoria Tanaka", email: "v.tanaka@meridian.jp", phone: "+81 90 1234 5678", assignedGuideId: "g1", invoiceId: "inv-4405", paymentStatus: "Deposit", paymentAmount: 9900, customerId: "c5" },
  { id: "b7", reference: "OLK-2026-HR8N4", createdAt: "2026-05-06T10:45:00Z", status: "Cancelled", safariId: "big-five", safari: "Big Five, Unhurried", startDate: "2026-08-20", endDate: "2026-08-27", adults: 2, children: 0, accommodation: "A considered mix of camps and lodges", pickup: "Airport transfer from JRO", airport: "Kilimanjaro International Airport (JRO)", budget: "$8,000 - $12,000 per person", requests: "Corporate retreat. Two senior partners.", payment: "Bank transfer", name: "David & Marcus Klein", email: "d.klein@kleinpartners.de", phone: "+49 171 234 5678", paymentStatus: "Refunded", notes: "Cancelled due to schedule conflict. Offered rescheduling." },
  { id: "b8", reference: "OLK-2026-WR1C5", createdAt: "2026-05-05T08:30:00Z", status: "New", safariId: "under-canvas", safari: "Under Canvas", startDate: "2026-09-04", endDate: "2026-09-09", adults: 2, children: 0, accommodation: "Intimate camps under canvas", pickup: "Ang'ata Migration Camp", airport: "Kilimanjaro International Airport (JRO)", budget: "$5,000 - $8,000 per person", requests: "Wildlife documentary team. Small crew of two with minimal footprint.", payment: "Secure card payment", name: "Elena Rossi", email: "e.rossi@wildlens.it", phone: "+39 338 765 4321", paymentStatus: "Pending", customerId: "c6" },
];

// Offline/demo placeholder records only. Supabase `public.packages` is the
// single source of truth; `loadCloudPackages()` replaces these entirely when
// the backend is connected. `included` / `excluded` are intentionally empty
// here — those lists are CMS content and must never be hardcoded in the
// frontend (they live in the `included` / `excluded` jsonb columns).
const seedPackages: SafariPackage[] = [
  { id: "p1", slug: "great-migration", title: "The Great Migration", region: "Serengeti + Maasai Mara", duration: "9 days / 8 nights", nights: 8, price: 8450, image: "https://images.pexels.com/photos/5521703/pexels-photo-5521703.jpeg?auto=compress&cs=tinysrgb&w=1600", gallery: ["https://images.pexels.com/photos/5521703/pexels-photo-5521703.jpeg?auto=compress&cs=tinysrgb&w=1600", "https://images.pexels.com/photos/15815060/pexels-photo-15815060.jpeg?auto=compress&cs=tinysrgb&w=1600", "https://images.pexels.com/photos/15373901/pexels-photo-15373901.jpeg?auto=compress&cs=tinysrgb&w=1600"], summary: "Follow the herds from private mobile camps to the fabled Mara River crossings.", description: "A nine-day expedition tracking two million animals across the Serengeti-Mara ecosystem. We position private mobile camps along the migration route, moving with the herds as they respond to rain and river crossings.", signature: "River crossings, predator country, private mobile camp", highlights: ["Mara River crossings", "Private mobile camp", "Predator tracking", "Balloon safari option"], included: [], excluded: [], availability: ["Jun", "Jul", "Aug", "Sep", "Oct"], country: ["Tanzania", "Kenya"], parks: ["Serengeti", "Maasai Mara", "Ngorongoro"], wildlife: ["Wildebeest", "Zebra", "Lion", "Cheetah", "Crocodile"], difficulty: "Moderate", tags: ["migration", "big-five", "signature"], featured: true, published: true, seo: { title: "The Great Migration Safari | Olkinyei Expeditions", description: "A nine-day private expedition following two million animals across the Serengeti and Maasai Mara." }, coordinates: [35, 42], createdAt: "2024-03-12T00:00:00Z", updatedAt: "2026-05-01T10:00:00Z" },
  { id: "p2", slug: "big-five", title: "Big Five, Unhurried", region: "Ngorongoro + Serengeti", duration: "7 days / 6 nights", nights: 6, price: 6200, image: "https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&w=1600", gallery: ["https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&w=1600", "https://images.pexels.com/photos/26052069/pexels-photo-26052069.jpeg?auto=compress&cs=tinysrgb&w=1600", "https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&w=1600"], summary: "A patient, private search for East Africa's icons, led by the rhythms of the wild.", description: "Seven days dedicated to the patient observation of Africa's most iconic species across the Ngorongoro Crater and central Serengeti.", signature: "Crater floor, lion territories, elephant herds", highlights: ["Ngorongoro Crater floor", "Black rhino tracking", "Elephant herds", "Lion prides"], included: [], excluded: [], availability: ["Jan", "Feb", "Jun", "Jul", "Aug", "Sep"], country: ["Tanzania"], parks: ["Ngorongoro", "Serengeti", "Tarangire"], wildlife: ["Lion", "Leopard", "Elephant", "Buffalo", "Rhino"], difficulty: "Gentle", tags: ["big-five", "first-time"], featured: false, published: true, seo: { title: "Big Five Safari | Ngorongoro & Serengeti", description: "A patient seven-day search for the Big Five across the Ngorongoro Crater and Serengeti." }, coordinates: [42, 57], createdAt: "2024-03-12T00:00:00Z", updatedAt: "2026-04-22T15:30:00Z" },
  { id: "p3", slug: "luxury-lodge", title: "Lodges Beyond the Wild", region: "Northern Tanzania", duration: "8 days / 7 nights", nights: 7, price: 9900, image: "https://images.pexels.com/photos/37790193/pexels-photo-37790193.jpeg?auto=compress&cs=tinysrgb&w=1600", gallery: ["https://images.pexels.com/photos/37790193/pexels-photo-37790193.jpeg?auto=compress&cs=tinysrgb&w=1600", "https://images.pexels.com/photos/32382771/pexels-photo-32382771.jpeg?auto=compress&cs=tinysrgb&w=1600", "https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&w=1600"], summary: "Architectural lodges, intuitive service and vast landscapes with every detail considered.", description: "Eight nights in some of East Africa's most considered architectural lodges, where design meets the wild.", signature: "Design lodges, bush dining, optional helicopter flight", highlights: ["Architectural lodges", "Private guides", "Bush dining", "Helicopter transfers"], included: [], excluded: [], availability: ["All year"], country: ["Tanzania"], parks: ["Serengeti", "Ngorongoro", "Tarangire", "Lake Manyara"], wildlife: ["Lion", "Elephant", "Giraffe", "Leopard"], difficulty: "Gentle", tags: ["luxury", "design", "lodge"], featured: false, published: true, seo: { title: "Luxury Lodge Safari | Tanzania", description: "Eight nights in East Africa's most considered architectural lodges." }, coordinates: [56, 52], createdAt: "2024-03-12T00:00:00Z", updatedAt: "2026-03-18T09:00:00Z" },
  { id: "p4", slug: "family", title: "The Family Bush", region: "Laikipia + Maasai Mara", duration: "8 days / 7 nights", nights: 7, price: 5750, image: "https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&w=1600", gallery: ["https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&w=1600", "https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&w=1600", "https://images.pexels.com/photos/15373901/pexels-photo-15373901.jpeg?auto=compress&cs=tinysrgb&w=1600"], summary: "A flexible, deeply engaging journey designed for curious young explorers and their families.", description: "An eight-day family expedition balancing wildlife excitement with genuine rest, built around child-friendly pacing and activities.", signature: "Junior ranger program, private house, gentle pacing", highlights: ["Junior ranger program", "Private family vehicle", "Child-friendly camps", "Cultural encounters"], included: [], excluded: [], availability: ["Feb", "Mar", "Jun", "Jul", "Aug", "Dec"], country: ["Kenya", "Tanzania"], parks: ["Maasai Mara", "Laikipia", "Amboseli"], wildlife: ["Elephant", "Giraffe", "Lion", "Zebra"], difficulty: "Gentle", tags: ["family", "kids", "flexible"], featured: false, published: true, seo: { title: "Family Safari | Kenya & Tanzania", description: "A family-friendly safari balancing wildlife excitement with genuine rest." }, coordinates: [62, 32], createdAt: "2024-04-15T00:00:00Z", updatedAt: "2026-04-10T14:20:00Z" },
  { id: "p5", slug: "honeymoon", title: "Wildly, Together", region: "Serengeti + Zanzibar", duration: "11 days / 10 nights", nights: 10, price: 11200, image: "https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&w=1600", gallery: ["https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&w=1600", "https://images.pexels.com/photos/37790193/pexels-photo-37790193.jpeg?auto=compress&cs=tinysrgb&w=1600", "https://images.pexels.com/photos/15815060/pexels-photo-15815060.jpeg?auto=compress&cs=tinysrgb&w=1600"], summary: "Private plains, lantern dinners and an Indian Ocean epilogue created for two.", description: "An eleven-day romantic journey combining the wild drama of the Serengeti with an Indian Ocean island epilogue.", signature: "Private plunge pool, hot-air balloon, island retreat", highlights: ["Hot-air balloon", "Private dinners", "Ocean retreat", "Couples spa"], included: [], excluded: [], availability: ["Jan", "Feb", "Jun", "Jul", "Aug", "Sep", "Oct"], country: ["Tanzania"], parks: ["Serengeti", "Ngorongoro"], wildlife: ["Lion", "Elephant", "Giraffe"], difficulty: "Gentle", tags: ["honeymoon", "romantic", "island"], featured: false, published: true, seo: { title: "Honeymoon Safari | Serengeti & Zanzibar", description: "An eleven-day romantic journey combining Serengeti wildlife with an Indian Ocean retreat." }, coordinates: [46, 67], createdAt: "2024-05-20T00:00:00Z", updatedAt: "2026-02-28T11:00:00Z" },
  { id: "p6", slug: "photographic", title: "The Photographer's Light", region: "Ndutu + Serengeti", duration: "10 days / 9 nights", nights: 9, price: 9300, image: "https://images.pexels.com/photos/32414164/pexels-photo-32414164.jpeg?auto=compress&cs=tinysrgb&w=1600", gallery: ["https://images.pexels.com/photos/32414164/pexels-photo-32414164.jpeg?auto=compress&cs=tinysrgb&w=1600", "https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&w=1600", "https://images.pexels.com/photos/5521703/pexels-photo-5521703.jpeg?auto=compress&cs=tinysrgb&w=1600"], summary: "A specialist-led expedition with low-angle vehicles and time to wait for the frame.", description: "Ten days in the field with a specialist photographic guide, built around light, patience, and the frame.", signature: "Pro guide, beanbags, editing suite, golden-hour drives", highlights: ["Professional guide", "Photography vehicle", "Editing suite", "Golden-hour drives"], included: [], excluded: [], availability: ["Jan", "Feb", "Mar", "Jun", "Sep", "Oct"], country: ["Tanzania"], parks: ["Ndutu", "Serengeti"], wildlife: ["Cheetah", "Lion", "Leopard", "Wildebeest"], difficulty: "Moderate", tags: ["photography", "specialist"], featured: false, published: true, seo: { title: "Photographic Safari | Tanzania", description: "A specialist photographic expedition with dedicated vehicles and golden-hour drives." }, coordinates: [39, 59], createdAt: "2024-06-08T00:00:00Z", updatedAt: "2026-03-05T16:45:00Z" },
  { id: "p7", slug: "walking", title: "On Foot in the Rift", region: "Tarangire + Lake Eyasi", duration: "6 days / 5 nights", nights: 5, price: 4800, image: "https://images.pexels.com/photos/32382771/pexels-photo-32382771.jpeg?auto=compress&cs=tinysrgb&w=1600", gallery: ["https://images.pexels.com/photos/32382771/pexels-photo-32382771.jpeg?auto=compress&cs=tinysrgb&w=1600", "https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&w=1600", "https://images.pexels.com/photos/38223514/pexels-photo-38223514.jpeg?auto=compress&cs=tinysrgb&w=1600"], summary: "Read tracks, notice the small worlds and move through the landscape at nature's pace.", description: "Six days on foot through Tarangire and the Lake Eyasi basin, reading tracks and moving through the landscape at nature's pace.", signature: "Private walking guide, fly camp, Hadzabe encounter", highlights: ["Private walking guide", "Fly camping", "Hadzabe encounter", "Birdlife"], included: [], excluded: [], availability: ["Jun", "Jul", "Aug", "Sep", "Oct"], country: ["Tanzania"], parks: ["Tarangire", "Lake Eyasi"], wildlife: ["Elephant", "Baobab", "Birdlife"], difficulty: "Active", tags: ["walking", "on-foot", "off-grid"], featured: false, published: true, seo: { title: "Walking Safari | Tarangire & Lake Eyasi", description: "A six-day walking safari through Tarangire and Lake Eyasi." }, coordinates: [52, 62], createdAt: "2024-07-01T00:00:00Z", updatedAt: "2026-02-10T09:00:00Z" },
  { id: "p8", slug: "under-canvas", title: "Under Canvas", region: "Maasai Mara Conservancies", duration: "5 days / 4 nights", nights: 4, price: 3950, image: "https://images.pexels.com/photos/15373901/pexels-photo-15373901.jpeg?auto=compress&cs=tinysrgb&w=1600", gallery: ["https://images.pexels.com/photos/15373901/pexels-photo-15373901.jpeg?auto=compress&cs=tinysrgb&w=1600", "https://images.pexels.com/photos/5521703/pexels-photo-5521703.jpeg?auto=compress&cs=tinysrgb&w=1600", "https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&w=1600"], summary: "Canvas walls, hot bucket showers and the rare luxury of falling asleep to the wild.", description: "Five nights under canvas in the Maasai Mara conservancies, with night drives and fireside suppers.", signature: "Private conservancy, night drives, fireside suppers", highlights: ["Private conservancy", "Night drives", "Fireside suppers"], included: [], excluded: [], availability: ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"], country: ["Kenya"], parks: ["Maasai Mara"], wildlife: ["Lion", "Leopard", "Cheetah"], difficulty: "Moderate", tags: ["camping", "under-canvas"], featured: false, published: true, seo: { title: "Under Canvas Safari | Maasai Mara", description: "Five nights under canvas in the Maasai Mara conservancies." }, coordinates: [30, 34], createdAt: "2024-07-12T00:00:00Z", updatedAt: "2026-01-28T11:00:00Z" },
];

const seedDestinations: Destination[] = [
  { id: "d1", slug: "serengeti", name: "Serengeti", country: "Tanzania", coordinates: [45, 56], bestTime: "June to October", animal: "Wildebeest", image: "https://images.pexels.com/photos/15815060/pexels-photo-15815060.jpeg?auto=compress&cs=tinysrgb&w=1600", gallery: ["https://images.pexels.com/photos/15815060/pexels-photo-15815060.jpeg?auto=compress&cs=tinysrgb&w=1600", "https://images.pexels.com/photos/5521703/pexels-photo-5521703.jpeg?auto=compress&cs=tinysrgb&w=1600"], description: "An immense grassland theatre where weather, predator and prey write each day anew.", longDescription: "The Serengeti is a living stage where two million wildebeest, zebra and gazelle follow the rains in an ancient rhythm that has continued for millennia.", activities: ["Game drives", "Balloon safari", "Walking safari", "Night drives"], featured: true, published: true, seo: { title: "Serengeti National Park | Tanzania", description: "The endless plains of the Serengeti, home to the Great Migration." }, createdAt: "2024-03-12T00:00:00Z", updatedAt: "2026-04-18T10:00:00Z" },
  { id: "d2", slug: "ngorongoro", name: "Ngorongoro", country: "Tanzania", coordinates: [51, 67], bestTime: "Year-round", animal: "Black rhino", image: "https://images.pexels.com/photos/32382771/pexels-photo-32382771.jpeg?auto=compress&cs=tinysrgb&w=1600", gallery: ["https://images.pexels.com/photos/32382771/pexels-photo-32382771.jpeg?auto=compress&cs=tinysrgb&w=1600"], description: "A volcanic caldera sheltering one of the greatest concentrations of wildlife on Earth.", longDescription: "The Ngorongoro Crater is a UNESCO World Heritage site, a volcanic caldera six hundred metres deep and nineteen kilometres across.", activities: ["Crater floor game drives", "Maasai cultural visits", "Highland walks"], featured: true, published: true, seo: { title: "Ngorongoro Crater | Tanzania", description: "A volcanic caldera sheltering one of the greatest concentrations of wildlife on Earth." }, createdAt: "2024-03-12T00:00:00Z", updatedAt: "2026-02-14T09:30:00Z" },
  { id: "d3", slug: "maasai-mara", name: "Maasai Mara", country: "Kenya", coordinates: [39, 43], bestTime: "July to October", animal: "Lion", image: "https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&w=1600", gallery: ["https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&w=1600", "https://images.pexels.com/photos/15373901/pexels-photo-15373901.jpeg?auto=compress&cs=tinysrgb&w=1600"], description: "Golden plains, private conservancies and intimate access to the migration's northern reach.", longDescription: "The Maasai Mara is Kenya's most celebrated reserve, known for its density of predators and as the northern terminus of the Great Migration.", activities: ["Private conservancy drives", "Night drives", "Walking safari", "Balloon safari", "Maasai village visits"], featured: true, published: true, seo: { title: "Maasai Mara | Kenya", description: "Kenya's premier wildlife reserve and home to the Great Migration." }, createdAt: "2024-03-12T00:00:00Z", updatedAt: "2026-03-22T13:15:00Z" },
  { id: "d4", slug: "tarangire", name: "Tarangire", country: "Tanzania", coordinates: [58, 73], bestTime: "June to October", animal: "Elephant", image: "https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&w=1600", gallery: ["https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&w=1600"], description: "Baobab country, seasonal rivers and magnificent elephant families moving through dust.", longDescription: "Tarangire is a land of giants — ancient baobabs, great elephant herds, and the Tarangire River that draws them all together in the dry season.", activities: ["Elephant viewing", "Baobab walks", "Bird watching"], featured: true, published: true, seo: { title: "Tarangire National Park | Tanzania", description: "Baobab country and magnificent elephant herds." }, createdAt: "2024-03-12T00:00:00Z", updatedAt: "2026-01-10T08:45:00Z" },
  { id: "d5", slug: "amboseli", name: "Amboseli", country: "Kenya", coordinates: [65, 45], bestTime: "June to October", animal: "Elephant", image: "https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&w=1600", gallery: ["https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&w=1600"], description: "Ancient elephant paths under the snow-capped presence of Kilimanjaro.", longDescription: "Amboseli is the place where Kilimanjaro meets the plains — where ancient elephant matriarchs walk paths that have been used for generations.", activities: ["Elephant observation", "Kilimanjaro viewing", "Maasai cultural visits", "Nature walks"], featured: true, published: true, seo: { title: "Amboseli National Park | Kenya", description: "Ancient elephant herds against the backdrop of Kilimanjaro." }, createdAt: "2024-03-12T00:00:00Z", updatedAt: "2026-04-02T11:20:00Z" },
];

const seedMedia: MediaAsset[] = [
  { id: "m1", url: "https://images.pexels.com/photos/15815060/pexels-photo-15815060.jpeg?auto=compress&cs=tinysrgb&w=1600", thumbnail: "https://images.pexels.com/photos/15815060/pexels-photo-15815060.jpeg?auto=compress&cs=tinysrgb&w=400", type: "image", name: "Migration herd aerial", alt: "Wildebeest herd seen from the air during the Great Migration", category: "Wildlife", tags: ["migration", "aerial", "wildebeest"], size: 2840000, dimensions: { width: 9504, height: 6336 }, copyright: "Hugo Sykes", uploadedBy: "u3", createdAt: "2026-03-12T10:30:00Z", folder: "Wildlife / Migration" },
  { id: "m2", url: "https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&w=1600", thumbnail: "https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&w=400", type: "image", name: "Lion resting", alt: "Lion resting under dappled shade in Maasai Mara", category: "Wildlife", tags: ["lion", "predator", "portrait"], size: 1920000, dimensions: { width: 6016, height: 4012 }, copyright: "Philipp Schwarz", uploadedBy: "u3", createdAt: "2026-03-10T14:15:00Z", folder: "Wildlife / Predators" },
  { id: "m3", url: "https://images.pexels.com/photos/37790193/pexels-photo-37790193.jpeg?auto=compress&cs=tinysrgb&w=1600", thumbnail: "https://images.pexels.com/photos/37790193/pexels-photo-37790193.jpeg?auto=compress&cs=tinysrgb&w=400", type: "image", name: "Luxury lodge patio", alt: "Elegant outdoor patio at modern safari lodge", category: "Lodges", tags: ["lodge", "luxury", "architecture"], size: 3450000, dimensions: { width: 7421, height: 4255 }, copyright: "Magda Ehlers", uploadedBy: "u3", createdAt: "2026-03-08T09:00:00Z", folder: "Lodges / Luxury" },
  { id: "m4", url: "https://images.pexels.com/photos/32414164/pexels-photo-32414164.jpeg?auto=compress&cs=tinysrgb&w=1600", thumbnail: "https://images.pexels.com/photos/32414164/pexels-photo-32414164.jpeg?auto=compress&cs=tinysrgb&w=400", type: "image", name: "Cheetah portrait", alt: "Cheetah observing across the grassland", category: "Wildlife", tags: ["cheetah", "predator", "portrait"], size: 2780000, dimensions: { width: 8192, height: 5464 }, copyright: "Magda Ehlers", uploadedBy: "u3", createdAt: "2026-03-05T16:40:00Z", folder: "Wildlife / Predators" },
  { id: "m5", url: "https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&w=1600", thumbnail: "https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&w=400", type: "image", name: "Elephant family", alt: "Elephant family walking through green savanna", category: "Wildlife", tags: ["elephant", "family", "savanna"], size: 2350000, dimensions: { width: 6000, height: 4000 }, copyright: "Princely Pixels", uploadedBy: "u3", createdAt: "2026-02-28T12:20:00Z", folder: "Wildlife / Mammals" },
  { id: "m6", url: "https://images.pexels.com/photos/38223514/pexels-photo-38223514.jpeg?auto=compress&cs=tinysrgb&w=1600", thumbnail: "https://images.pexels.com/photos/38223514/pexels-photo-38223514.jpeg?auto=compress&cs=tinysrgb&w=400", type: "image", name: "Maasai guide portrait", alt: "Maasai guide in traditional attire", category: "People", tags: ["maasai", "guide", "portrait"], size: 2180000, dimensions: { width: 6000, height: 4000 }, copyright: "Jonathan Shembere", uploadedBy: "u3", createdAt: "2026-02-25T08:15:00Z", folder: "People / Guides" },
  { id: "m7", url: "https://images.pexels.com/photos/32416221/13827509_3840_2160_25fps.mp4", thumbnail: "https://images.pexels.com/videos/32416221/africa-wildlife-bluewildebeest-south-africa-south-african-landscape-32416221.jpeg?auto=compress&cs=tinysrgb&w=400", type: "video", name: "Migration aerial film", alt: "Aerial film of wildebeest herd crossing savanna", category: "Migration", tags: ["migration", "aerial", "video", "4k"], size: 84500000, dimensions: { width: 3840, height: 2160 }, duration: 31, copyright: "Magda Ehlers", uploadedBy: "u3", createdAt: "2026-02-20T14:50:00Z", folder: "Videos / Migration" },
  { id: "m8", url: "https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&w=1600", thumbnail: "https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&w=400", type: "image", name: "Giraffe at sunset", alt: "Giraffe in the last light of day", category: "Wildlife", tags: ["giraffe", "sunset", "portrait"], size: 2240000, dimensions: { width: 6000, height: 4000 }, copyright: "Francesco Ungaro", uploadedBy: "u3", createdAt: "2026-02-18T17:30:00Z", folder: "Wildlife / Mammals" },
];

const seedBlogPosts: BlogPost[] = [
  { id: "bl1", slug: "reading-the-river", title: "Reading the River: A Guide to the Great Migration", excerpt: "How our guides anticipate river crossings through a decade of patient observation and pattern recognition.", body: "The Mara River is not a river in the ordinary sense. It is a living negotiation between water, grass, hunger, and memory. To stand on its banks during July is to witness a conversation that has been happening for three hundred thousand years.\n\nOur senior guide Daniel Ole Nkoitoi has spent nineteen years watching this conversation. He reads the clouds before he reads the water. He watches the vultures before he watches the herds. And he has learned that every crossing has its own rhythm.", category: "Wildlife", tags: ["migration", "guides", "education"], heroImage: "https://images.pexels.com/photos/5521703/pexels-photo-5521703.jpeg?auto=compress&cs=tinysrgb&w=1600", authorId: "u3", author: "Lena Van Der Berg", readingTime: 8, seo: { title: "Reading the River | Olkinyei Field Notes", description: "How our guides anticipate Mara River crossings through a decade of patient observation." }, publishedAt: "2026-05-12T09:00:00Z", status: "published", featured: true, comments: 14, createdAt: "2026-05-10T11:30:00Z", updatedAt: "2026-05-12T08:45:00Z" },
  { id: "bl2", slug: "what-to-pack", title: "What to Pack When the Dust Is Part of the Story", excerpt: "A field-tested packing list for East Africa, written by our guides who have lived these seasons.", body: "Packing for East Africa is less about what you bring and more about what you choose to leave behind. The finest journeys we have guided have been for travellers who understand that dust, light, and patience are part of the experience.", category: "Packing", tags: ["packing", "essentials", "field-tested"], heroImage: "https://images.pexels.com/photos/37790193/pexels-photo-37790193.jpeg?auto=compress&cs=tinysrgb&w=1600", authorId: "u3", author: "Lena Van Der Berg", readingTime: 5, seo: { title: "What to Pack | Olkinyei Field Notes", description: "A field-tested packing list for East Africa." }, publishedAt: "2026-04-28T08:00:00Z", status: "published", featured: false, comments: 8, createdAt: "2026-04-25T14:20:00Z", updatedAt: "2026-04-27T16:00:00Z" },
  { id: "bl3", slug: "ethics-wildlife-photograph", title: "The Ethics of the Wildlife Photograph", excerpt: "On the responsibility that comes with a long lens, and the lines our guides never cross.", body: "A wildlife photograph can educate, inspire, and fund conservation. It can also disturb, exploit, and flatten a living creature into content. The difference is not the lens. It is the photographer's patience.", category: "Photography", tags: ["photography", "ethics", "conservation"], heroImage: "https://images.pexels.com/photos/32414164/pexels-photo-32414164.jpeg?auto=compress&cs=tinysrgb&w=1600", authorId: "u4", author: "Tom Ashford", readingTime: 12, seo: { title: "The Ethics of the Wildlife Photograph | Olkinyei", description: "On the responsibility that comes with a long lens." }, publishedAt: "2026-03-09T10:15:00Z", status: "published", featured: true, comments: 22, createdAt: "2026-03-07T09:30:00Z", updatedAt: "2026-03-09T09:45:00Z" },
  { id: "bl4", slug: "kenya-tanzania-entry-2026", title: "Kenya and Tanzania Entry Notes for 2026", excerpt: "Current visa requirements, health recommendations, and border updates for the coming season.", body: "Entering East Africa in 2026 is simpler than it has ever been, though preparation still matters. This guide reflects our current recommendations as of May 2026, based on recent crossings with our guests.", category: "Visa", tags: ["visa", "entry", "2026"], heroImage: "https://images.pexels.com/photos/15373901/pexels-photo-15373901.jpeg?auto=compress&cs=tinysrgb&w=1600", authorId: "u2", author: "Amara Osei", readingTime: 6, seo: { title: "Entry Notes 2026 | Olkinyei", description: "Current visa and border requirements for Kenya and Tanzania." }, publishedAt: "2026-02-18T07:30:00Z", status: "published", featured: false, comments: 4, createdAt: "2026-02-16T13:00:00Z", updatedAt: "2026-02-17T10:00:00Z" },
  { id: "bl5", slug: "predators-of-serengeti", title: "Predators of the Serengeti: A Season in Review", excerpt: "A field report from our photographic guides on the lion prides, cheetah mothers, and leopard territories of 2025.", body: "The 2025 season in the Serengeti gave us some of the most extraordinary predator encounters in recent memory. From the Marsh Pride's expansion to the emergence of a new cheetah mother in the southeastern plains.", category: "Wildlife", tags: ["predators", "serengeti", "field-report"], heroImage: "https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&w=1600", authorId: "u3", author: "Lena Van Der Berg", readingTime: 15, seo: { title: "Predators of the Serengeti | 2025 Review", description: "A field report from our photographic guides on the 2025 predator season." }, status: "draft", featured: false, comments: 0, createdAt: "2026-05-13T15:00:00Z", updatedAt: "2026-05-13T15:00:00Z" },
];

const seedGuides: Guide[] = [
  { id: "g1", name: "Daniel Ole Nkoitoi", slug: "daniel-ole-nkoitoi", title: "Senior Safari Guide", bio: "Born in the Loita Plains and raised between Maasai storytelling and university-trained ecology, Daniel has spent nineteen years reading the Serengeti. He is known for his patience, his ability to find lions that do not want to be found, and his dry humour at the fifth hour of a stakeout.", portrait: "https://images.pexels.com/photos/38223514/pexels-photo-38223514.jpeg?auto=compress&cs=tinysrgb&w=800", gallery: ["https://images.pexels.com/photos/38223514/pexels-photo-38223514.jpeg?auto=compress&cs=tinysrgb&w=800"], languages: ["Maa", "Swahili", "English"], speciality: "Predator behaviour", yearsInField: 19, locations: ["Maasai Mara", "Serengeti", "Ngorongoro"], rating: 4.98, assignments: 142, availability: { "2026-06": "on_trip", "2026-07": "available", "2026-08": "available", "2026-09": "on_trip" }, status: "active", email: "daniel@olkinyei.com", phone: "+254 700 123 456", createdAt: "2018-03-12T00:00:00Z" },
  { id: "g2", name: "Neema Lema", slug: "neema-lema", title: "Photographic Guide", bio: "Neema began as a camera assistant on film productions in the Mara and has become one of East Africa's most sought-after photographic guides. She thinks in light, patience, and composition.", portrait: "https://images.pexels.com/photos/1239295/pexels-photo-1239295.jpeg?auto=compress&cs=tinysrgb&w=800", gallery: ["https://images.pexels.com/photos/1239295/pexels-photo-1239295.jpeg?auto=compress&cs=tinysrgb&w=800"], languages: ["Swahili", "English", "French"], speciality: "Wildlife photography", yearsInField: 11, locations: ["Serengeti", "Ndutu", "Maasai Mara"], rating: 4.94, assignments: 87, availability: { "2026-06": "available", "2026-07": "on_trip", "2026-08": "available", "2026-09": "available" }, status: "active", email: "neema@olkinyei.com", phone: "+254 700 234 567", createdAt: "2019-08-02T00:00:00Z" },
  { id: "g3", name: "Joseph Mollel", slug: "joseph-mollel", title: "Walking Safari Guide", bio: "Joseph trained as a field ranger before joining Olkinyei. He reads the land the way most people read books — slowly, carefully, with the kind of attention that reveals what others miss.", portrait: "https://images.pexels.com/photos/1040880/pexels-photo-1040880.jpeg?auto=compress&cs=tinysrgb&w=800", gallery: ["https://images.pexels.com/photos/1040880/pexels-photo-1040880.jpeg?auto=compress&cs=tinysrgb&w=800"], languages: ["Swahili", "English"], speciality: "Walking safaris, ecology", yearsInField: 14, locations: ["Tarangire", "Lake Eyasi", "Ngorongoro Highlands"], rating: 4.92, assignments: 64, availability: { "2026-06": "available", "2026-07": "available", "2026-08": "on_trip", "2026-09": "available" }, status: "active", email: "joseph@olkinyei.com", phone: "+255 700 345 678", createdAt: "2020-01-05T00:00:00Z" },
  { id: "g4", name: "Saidi Mwangi", slug: "saidi-mwangi", title: "Family Safari Specialist", bio: "Saidi has guided more than a hundred families through East Africa and has an uncanny ability to make a seven-year-old feel like an honoured colleague in the work of watching.", portrait: "https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=800", gallery: ["https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=800"], languages: ["Swahili", "English", "German"], speciality: "Family expeditions", yearsInField: 12, locations: ["Maasai Mara", "Amboseli", "Laikipia"], rating: 4.96, assignments: 118, availability: { "2026-06": "available", "2026-07": "available", "2026-08": "available", "2026-09": "on_trip" }, status: "active", email: "saidi@olkinyei.com", phone: "+254 700 456 789", createdAt: "2020-06-18T00:00:00Z" },
];

const seedVehicles: Vehicle[] = [
  { id: "v1", fleetCode: "OLK-01", model: "Toyota Land Cruiser V8", type: "Land Cruiser", base: "Nairobi", capacity: 6, status: "Ready", lastService: "2026-04-10", nextService: "2026-07-10", insurance: "INS-2026-0142", mileage: 89400, notes: "Primary vehicle for Mara operations. Fitted with HF radio and charging stations.", createdAt: "2022-03-12T00:00:00Z" },
  { id: "v2", fleetCode: "OLK-02", model: "Toyota Land Cruiser V8", type: "Land Cruiser", base: "Arusha", capacity: 6, status: "In field", lastService: "2026-03-28", nextService: "2026-06-28", insurance: "INS-2026-0143", mileage: 112800, notes: "Currently on Serengeti rotation with guide Daniel.", createdAt: "2021-08-05T00:00:00Z" },
  { id: "v3", fleetCode: "OLK-03", model: "Toyota Land Cruiser V8", type: "Land Cruiser", base: "Nairobi", capacity: 7, status: "Ready", lastService: "2026-04-22", nextService: "2026-07-22", insurance: "INS-2026-0144", mileage: 64200, notes: "Family configuration with extended seating and first aid upgrade.", createdAt: "2023-01-15T00:00:00Z" },
  { id: "v4", fleetCode: "OLK-04", model: "Custom Photography Land Cruiser", type: "Photography Vehicle", base: "Arusha", capacity: 4, status: "Ready", lastService: "2026-04-05", nextService: "2026-07-05", insurance: "INS-2026-0145", mileage: 72500, notes: "Fitted with removable roof, beanbag mounts, power inverter and camera storage.", createdAt: "2022-11-20T00:00:00Z" },
  { id: "v5", fleetCode: "OLK-05", model: "Toyota Land Cruiser V8", type: "Land Cruiser", base: "Mara", capacity: 6, status: "Service due", lastService: "2025-12-18", nextService: "2026-03-18", insurance: "INS-2026-0146", mileage: 145600, notes: "Scheduled for full service next week. Currently on light duties only.", createdAt: "2020-06-10T00:00:00Z" },
  { id: "v6", fleetCode: "OLK-06", model: "Cessna 208 Caravan", type: "Light Aircraft", base: "Wilson", capacity: 12, status: "Ready", lastService: "2026-04-18", nextService: "2026-06-18", insurance: "INS-2026-0147", mileage: 4200, notes: "Charter operations between Wilson, Mara, and Serengeti airstrips.", createdAt: "2021-03-02T00:00:00Z" },
];

const seedCustomers: Customer[] = [
  { id: "c1", name: "Amelia Whitfield", email: "amelia.whitfield@northstar.co.uk", phone: "+44 7700 900123", country: "United Kingdom", avatar: "https://images.pexels.com/photos/1239295/pexels-photo-1239295.jpeg?auto=compress&cs=tinysrgb&w=200", totalBookings: 3, totalSpent: 48200, lifetimeValue: "Platinum", firstTrip: "2022-08-14", lastTrip: "2026-07-18", notes: "Anniversary celebrations, loves photography, prefers quiet camps.", wishlist: ["Photographic safari", "Gorilla trekking"], tags: ["photography", "anniversary", "returning"], createdAt: "2022-06-10T00:00:00Z" },
  { id: "c2", name: "Jonathan & Sofia Reyes", email: "s.reyes@meridian.capital", phone: "+1 212 555 0198", country: "United States", avatar: "https://images.pexels.com/photos/1130626/pexels-photo-1130626.jpeg?auto=compress&cs=tinysrgb&w=200", totalBookings: 1, totalSpent: 22400, lifetimeValue: "Gold", firstTrip: "2026-08-02", lastTrip: "2026-08-02", notes: "Honeymoon gift from parents. First trip to Africa. Sofia is vegetarian.", wishlist: ["Hot-air balloon", "Maasai village"], tags: ["honeymoon", "first-timers"], createdAt: "2025-11-20T00:00:00Z" },
  { id: "c3", name: "Henrik Lindqvist", email: "h.lindqvist@nordicframe.se", phone: "+46 70 555 1234", country: "Sweden", avatar: "https://images.pexels.com/photos/1040880/pexels-photo-1040880.jpeg?auto=compress&cs=tinysrgb&w=200", totalBookings: 2, totalSpent: 31600, lifetimeValue: "Gold", firstTrip: "2024-07-10", lastTrip: "2026-09-12", notes: "Nordic Film Collective. Professional photographer. Travels with small crew.", wishlist: ["Chimpanzee trekking", "Zanzibar"], tags: ["professional", "film-crew", "returning"], createdAt: "2024-04-05T00:00:00Z" },
  { id: "c4", name: "The Bergström Family", email: "anna.bergstrom@klartext.nu", phone: "+46 73 221 9876", country: "Sweden", avatar: "https://images.pexels.com/photos/1065084/pexels-photo-1065084.jpeg?auto=compress&cs=tinysrgb&w=200", totalBookings: 4, totalSpent: 82400, lifetimeValue: "Platinum", firstTrip: "2020-07-14", lastTrip: "2026-06-28", notes: "Family of five. Children aged 7, 10, 12. Prefers flexible pacing.", wishlist: ["Gorilla trekking", "Zanzibar extension"], tags: ["family", "returning", "multi-generational"], createdAt: "2020-02-15T00:00:00Z" },
  { id: "c5", name: "Victoria Tanaka", email: "v.tanaka@meridian.jp", phone: "+81 90 1234 5678", country: "Japan", avatar: "https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg?auto=compress&cs=tinysrgb&w=200", totalBookings: 2, totalSpent: 54800, lifetimeValue: "Platinum", firstTrip: "2024-06-18", lastTrip: "2026-07-05", notes: "Architecture and design enthusiast. Prefers Singita and &Beyond properties.", wishlist: ["Ruaha", "Mahale Mountains"], tags: ["luxury", "design", "returning"], createdAt: "2024-02-28T00:00:00Z" },
  { id: "c6", name: "Elena Rossi", email: "e.rossi@wildlens.it", phone: "+39 338 765 4321", country: "Italy", avatar: "https://images.pexels.com/photos/1130626/pexels-photo-1130626.jpeg?auto=compress&cs=tinysrgb&w=200", totalBookings: 1, totalSpent: 7900, lifetimeValue: "Silver", firstTrip: "2026-09-04", lastTrip: "2026-09-04", notes: "Wildlife documentary team. Minimal footprint requirement.", wishlist: ["Okavango", "South Luangwa"], tags: ["documentary", "minimal-footprint"], createdAt: "2026-03-12T00:00:00Z" },
];

const seedPages: PageSettings[] = [
  { id: "pg1", route: "/", title: "Home", heroTitle: "East Africa, unhurried.", heroEyebrow: "Private journeys across Kenya and Tanzania", heroText: "Private safaris shaped by the migration, not the clock.", heroImage: "https://images.pexels.com/photos/15815060/pexels-photo-15815060.jpeg?auto=compress&cs=tinysrgb&w=1600", content: { homeStatement: "There is a moment when the plains stop being scenery and become something felt. We design every journey around that moment.", conservationStatement: "Every expedition contributes directly to land leases, guide education and community-led conservation in the places we travel." }, published: true, seo: { title: "Olkinyei Expeditions | Private Luxury Safaris", description: "Private, conservation-led luxury safaris across Kenya and Tanzania.", keywords: ["safari", "kenya", "tanzania", "luxury", "migration"] }, updatedAt: "2026-05-10T08:00:00Z", updatedBy: "u1" },
  { id: "pg2", route: "/about", title: "Our Story", heroTitle: "Born here. Still led by wonder.", heroEyebrow: "OUR STORY", heroText: "An independent East African company creating private journeys with deep local knowledge and a light footprint.", heroImage: "https://images.pexels.com/photos/38223514/pexels-photo-38223514.jpeg?auto=compress&cs=tinysrgb&w=1600", content: {}, published: true, seo: { title: "Our Story | Olkinyei Expeditions", description: "The story of Olkinyei Expeditions.", keywords: [] }, updatedAt: "2026-04-22T10:30:00Z", updatedBy: "u3" },
  { id: "pg3", route: "/safari-experiences", title: "Safari Experiences", heroTitle: "Journeys measured in moments.", heroEyebrow: "PRIVATE SAFARIS", heroText: "Eight signature routes, each privately guided and shaped around your pace.", heroImage: "https://images.pexels.com/photos/32414164/pexels-photo-32414164.jpeg?auto=compress&cs=tinysrgb&w=1600", content: {}, published: true, seo: { title: "Private Safari Experiences | Olkinyei", description: "Eight signature safari routes.", keywords: [] }, updatedAt: "2026-05-01T14:20:00Z", updatedBy: "u3" },
  { id: "pg4", route: "/destinations", title: "Destinations", heroTitle: "The map is only the beginning.", heroEyebrow: "KENYA + TANZANIA", heroText: "From volcanic highlands to endless grassland, explore the places that shape our journeys.", heroImage: "https://images.pexels.com/photos/15373901/pexels-photo-15373901.jpeg?auto=compress&cs=tinysrgb&w=1600", content: {}, published: true, seo: { title: "Kenya & Tanzania Destinations | Olkinyei", description: "Destinations across Kenya and Tanzania.", keywords: [] }, updatedAt: "2026-03-18T09:45:00Z", updatedBy: "u3" },
  { id: "pg5", route: "/gallery", title: "Field Notes", heroTitle: "What the wild allowed us to see.", heroEyebrow: "FIELD NOTES", heroText: "A living archive of quiet encounters, open horizons and the people who know them.", heroImage: "https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&w=1600", content: {}, published: true, seo: { title: "Field Notes and Gallery | Olkinyei", description: "Field notes and photography from East Africa.", keywords: [] }, updatedAt: "2026-04-05T11:10:00Z", updatedBy: "u3" },
  { id: "pg6", route: "/contact", title: "Contact & Booking", heroTitle: "Your safari starts with a conversation.", heroEyebrow: "PRIVATE JOURNEY DESIGN", heroText: "Share a few details. One dedicated designer will shape a thoughtful first proposal within one business day.", heroImage: "https://images.pexels.com/photos/37790193/pexels-photo-37790193.jpeg?auto=compress&cs=tinysrgb&w=1600", content: {}, published: true, seo: { title: "Plan Your Safari | Olkinyei", description: "Plan your private safari with Olkinyei.", keywords: [] }, updatedAt: "2026-02-14T08:30:00Z", updatedBy: "u1" },
];

const seedSiteSettings: SiteSettings = {
  brandName: "Olkinyei Expeditions",
  tagline: "East Africa, unhurried.",
  logo: "/logo.svg",
  darkLogo: "/logo.svg",
  favicon: "/logo.svg",
  primaryColor: "#B9552D",
  accentColor: "#D9B77B",
  textColor: "#151713",
  backgroundColor: "#F3ECDF",
  serifFont: "Cormorant Garamond",
  sansFont: "Manrope",
  contactEmail: "journeys@olkinyei.com",
  reservationsEmail: "reservations@olkinyei.com",
  phone: "+254 700 428 181",
  whatsapp: "+254 700 428 181",
  addresses: [{ city: "Nairobi", address: "Marula Lane, Karen" }, { city: "Arusha", address: "Sakina Road" }],
  social: [{ platform: "Instagram", url: "https://instagram.com/olkinyeiexpeditions" }, { platform: "LinkedIn", url: "https://linkedin.com/company/olkinyei" }],
  analytics: { ga4: "G-XXXXXXXXXX", gtm: "GTM-XXXXXXX", fbPixel: "", clarity: "" },
  maintenanceMode: false,
  comingSoon: false,
  robotsTxt: "User-agent: *\nAllow: /\n\nSitemap: https://olkinyei.com/sitemap.xml",
  customCss: "",
  customJs: "",
};

const seedActivity: ActivityEntry[] = [
  { id: "a1", actorId: "u2", actorName: "Amara Osei", action: "confirmed", entity: "Booking", entityId: "b1", entityLabel: "OLK-2026-QF8K2 · Amelia Whitfield", timestamp: "2026-05-14T08:22:00Z", ip: "41.89.234.12" },
  { id: "a2", actorId: "u3", actorName: "Lena Van Der Berg", action: "published", entity: "Blog Post", entityId: "bl1", entityLabel: "Reading the River: A Guide to the Great Migration", timestamp: "2026-05-14T07:45:00Z", ip: "197.232.18.44" },
  { id: "a3", actorId: "u1", actorName: "Oliver Kimani", action: "assigned", entity: "Booking", entityId: "b2", entityLabel: "OLK-2026-KM9R1 · Jonathan & Sofia Reyes → Neema Lema", timestamp: "2026-05-14T07:12:00Z", ip: "41.89.234.12" },
  { id: "a4", actorId: "u4", actorName: "Tom Ashford", action: "updated", entity: "SEO", entityId: "pg1", entityLabel: "Home page meta description", timestamp: "2026-05-13T19:30:00Z", ip: "82.43.128.71" },
  { id: "a5", actorId: "u3", actorName: "Lena Van Der Berg", action: "created", entity: "Media Asset", entityId: "m1", entityLabel: "Migration herd aerial", timestamp: "2026-05-13T16:18:00Z", ip: "197.232.18.44" },
  { id: "a6", actorId: "u5", actorName: "Priya Naidoo", action: "created", entity: "Invoice", entityId: "inv-4421", entityLabel: "Invoice for OLK-2026-QF8K2", timestamp: "2026-05-13T14:05:00Z", ip: "105.163.8.219" },
  { id: "a7", actorId: "u2", actorName: "Amara Osei", action: "updated", entity: "Booking", entityId: "b3", entityLabel: "OLK-2026-NP4X7 · Henrik Lindqvist · notes added", timestamp: "2026-05-13T11:42:00Z", ip: "41.89.234.12" },
  { id: "a8", actorId: "u1", actorName: "Oliver Kimani", action: "login", entity: "Authentication", entityId: "u1", entityLabel: "Successful sign-in", timestamp: "2026-05-14T06:18:00Z", ip: "41.89.234.12" },
];

// ============ Store Implementation ============

type StoreState = {
  theme: Theme;
  currentUserId: string | null;
  session: Session | null;
  users: AdminUser[];
  bookings: Booking[];
  newBookingsCount: number;
  packages: SafariPackage[];
  destinations: Destination[];
  media: MediaAsset[];
  blogPosts: BlogPost[];
  testimonials: Testimonial[];
  guides: Guide[];
  vehicles: Vehicle[];
  customers: Customer[];
  pages: PageSettings[];
  siteSettings: SiteSettings;
  activity: ActivityEntry[];
  audit: AuditEntry[];
  notifications: Notification[];
};

const STORAGE_KEY = "olkinyei-admin-v2";
// The public booking form writes submissions here (same-browser bridge) and
// to Supabase when configured (cross-device bridge).
const PUBLIC_BOOKINGS_KEY = "olkinyei-bookings";

function loadState(): StoreState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<StoreState>;
      return {
        theme: saved.theme ?? "dark",
        currentUserId: saved.currentUserId ?? null,
        session: saved.session ?? null,
        users: saved.users ?? seedUsers,
        bookings: saved.bookings ?? seedBookings,
        newBookingsCount: saved.newBookingsCount ?? 0,
        packages: saved.packages ?? seedPackages,
        destinations: saved.destinations ?? seedDestinations,
        media: saved.media ?? seedMedia,
        blogPosts: saved.blogPosts ?? seedBlogPosts,
        testimonials: saved.testimonials ?? [],
        guides: saved.guides ?? seedGuides,
        vehicles: saved.vehicles ?? seedVehicles,
        customers: saved.customers ?? seedCustomers,
        pages: saved.pages ?? seedPages,
        siteSettings: { ...seedSiteSettings, ...(saved.siteSettings ?? {}) },
        activity: saved.activity ?? seedActivity,
        audit: saved.audit ?? [],
        notifications: [],
      };
    }
  } catch { /* fall through to defaults */ }
  return {
    theme: "dark",
    currentUserId: null,
    session: null,
    users: seedUsers,
    bookings: seedBookings,
    newBookingsCount: 0,
    packages: seedPackages,
    destinations: seedDestinations,
    media: seedMedia,
    blogPosts: seedBlogPosts,
    testimonials: [],
    guides: seedGuides,
    vehicles: seedVehicles,
    customers: seedCustomers,
    pages: seedPages,
    siteSettings: seedSiteSettings,
    activity: seedActivity,
    audit: [],
    notifications: [],
  };
}

// ============ Password strength (client UX only — Supabase enforces server-side) ============

export function validatePasswordStrength(password: string): { ok: boolean; message?: string } {
  if (password.length < PASSWORD_MIN_LENGTH) return { ok: false, message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.` };
  if (!/[A-Z]/.test(password)) return { ok: false, message: "Password must include an uppercase letter." };
  if (!/[a-z]/.test(password)) return { ok: false, message: "Password must include a lowercase letter." };
  if (!/[0-9]/.test(password)) return { ok: false, message: "Password must include a number." };
  if (!/[^A-Za-z0-9]/.test(password)) return { ok: false, message: "Password must include a symbol." };
  const common = ["password", "12345678", "qwerty", "letmein", "olkinyei"];
  if (common.some((c) => password.toLowerCase().includes(c))) return { ok: false, message: "Choose a less predictable password." };
  return { ok: true };
}

// Best-effort client-side signal. Real production must set X-Forwarded-For on the edge.
function currentIp(): string {
  return "web-client";
}

function currentUserAgent(): string {
  return typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : "unknown";
}

let state: StoreState = loadState();
const listeners = new Set<() => void>();

// Map a public-website submission (or Supabase bookings row) into the CMS's
// richer booking model. References carry identity across all three stores.
function fromPublicBooking(submission: import("../data").Booking): Booking {
  return {
    id: `ext-${submission.reference}`,
    reference: submission.reference,
    createdAt: submission.createdAt,
    status: submission.status,
    safariId: submission.safari?.toLowerCase().replace(/[^a-z0-9]+/g, "-") ?? "custom",
    safari: submission.safari,
    startDate: submission.startDate,
    endDate: submission.endDate,
    adults: submission.adults,
    children: submission.children,
    accommodation: submission.accommodation,
    pickup: submission.pickup,
    airport: submission.airport,
    budget: submission.budget,
    requests: submission.requests,
    payment: submission.payment,
    name: submission.name,
    email: submission.email,
    phone: submission.phone,
    paymentStatus: "Pending",
    notes: "",
  };
}

function readPublicSubmissions(): Booking[] {
  try {
    const raw = localStorage.getItem(PUBLIC_BOOKINGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as import("../data").Booking[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((b) => b && typeof b.reference === "string" && typeof b.name === "string").map(fromPublicBooking);
  } catch {
    return [];
  }
}

// Merge external submissions (cloud + same-browser bridge) into the CMS
// pipeline, deduplicating by booking reference. Options:
//  - quiet: merge catalog only (bootstrap). No badge, no toast.
//  - (default): live arrival — bump badge + toast.
function mergeExternalBookings(entries: Booking[], options: { quiet?: boolean } = {}): Booking[] {
  if (entries.length === 0) return [];
  const existingReferences = new Map(state.bookings.map((b) => [b.reference, b]));
  const fresh: Booking[] = [];
  for (const entry of entries) {
    if (existingReferences.has(entry.reference)) continue;
    fresh.push(entry);
    existingReferences.set(entry.reference, entry);
  }
  if (fresh.length === 0) return [];
  const merged = [...state.bookings, ...fresh].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  if (options.quiet) {
    state = { ...state, bookings: merged };
    emit();
    return fresh;
  }
  state = { ...state, bookings: merged, newBookingsCount: state.newBookingsCount + fresh.length };
  const latest = fresh[0];
  logActivity("created", "Booking", latest.id, `${latest.reference} · ${latest.name}`);
  audit("booking.received", "booking", "success", { targetId: latest.reference });
  notify({
    type: "success",
    title: fresh.length === 1 ? `New booking: ${latest.reference}` : `${fresh.length} new bookings received`,
    message: `${latest.name} — ${latest.safari}`,
    duration: 6000,
  });
  emit();
  return fresh;
}

let bookingsChannel: ReturnType<typeof subscribeToBookingsAuthenticated> | null = null;
// True after the first catalog load; live arrivals post-bootstrap raise the
// unread badge and fire arrival notifications.
let bookingsBootstrapped = false;

function subscribeToBookingsAuthenticated(onRow: (booking: import("../data").Booking) => void) {
  if (!supabase) return null;
  return supabase
    .channel("olkinyei-studio-bookings")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "bookings" }, (payload) => {
      const row = payload.new as Record<string, unknown>;
      // Map the cloud row into the public booking shape, then the CMS shape.
      onRow({
        reference: String(row.reference ?? ""),
        createdAt: String(row.created_at ?? new Date().toISOString()),
        status: (row.status as import("../data").Booking["status"]) ?? "New",
        safari: String(row.safari ?? ""),
        startDate: String(row.start_date ?? ""),
        endDate: String(row.end_date ?? ""),
        adults: Number(row.adults ?? 0),
        children: Number(row.children ?? 0),
        accommodation: String(row.accommodation ?? ""),
        pickup: String(row.pickup ?? ""),
        airport: String(row.airport ?? ""),
        budget: String(row.budget ?? ""),
        requests: String(row.special_requests ?? ""),
        payment: String(row.payment_preference ?? ""),
        name: String(row.customer_name ?? ""),
        email: String(row.customer_email ?? ""),
        phone: String(row.customer_phone ?? ""),
      });
    })
    .subscribe();
}

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY && event.newValue) {
    try {
      state = JSON.parse(event.newValue) as StoreState;
      listeners.forEach((listener) => listener());
    } catch { /* Ignore invalid external state. */ }
    return;
  }
  // The public booking form writes here — pull submissions into the CMS in
  // real time when both apps run in the same browser.
  if (event.key === PUBLIC_BOOKINGS_KEY && event.newValue) {
    mergeExternalBookings(readPublicSubmissions());
  }
});

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { /* ignore quota errors */ }
}

function emit() {
  persist();
  listeners.forEach((listener) => listener());
}

// ============ Cloud content sync (Supabase cms_content) ============
// Brand, page, and site settings live in the database so changes publish to
// every device in real time. localStorage remains an offline cache only.

let cmsContentBootstrapped = false;

function applyCloudSiteSettings(content: unknown) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return;
  const incoming = content as Partial<SiteSettings>;
  if (Object.keys(incoming).length === 0) return;
  state = { ...state, siteSettings: { ...state.siteSettings, ...incoming } };
  emit();
}

function applyCloudPages(content: unknown) {
  if (!Array.isArray(content) || content.length === 0) return;
  state = { ...state, pages: content as PageSettings[] };
  emit();
}

async function loadCloudCmsContent(): Promise<void> {
  if (!supabase || cmsContentBootstrapped) return;
  cmsContentBootstrapped = true;
  try {
    // First, maybe seed the cloud once from local defaults so the first user
    // migration doesn't discard anything.
    const { data } = await supabase.from(TABLES.cmsContent).select("id, content");
    const rows = (data ?? []) as { id: string; content: unknown }[];
    for (const row of rows) {
      if (row.id === "site_settings") applyCloudSiteSettings(row.content);
      if (row.id === "pages") applyCloudPages(row.content);
    }
    if (import.meta.env.DEV) console.debug("[Olkinyei] CMS content synced from Supabase");
  } catch {
    cmsContentBootstrapped = false; // allow retry on next focus/save
  }
}

let cloudSaveQueue: Promise<void> = Promise.resolve();

async function cloudSaveDocument(id: "site_settings" | "pages", content: unknown): Promise<void> {
  const client = supabase;
  if (!client) { cmsContentBootstrapped = false; return; }
  cloudSaveQueue = cloudSaveQueue.then(async () => {
    try {
      await client.from(TABLES.cmsContent).upsert({ id, content, updated_at: new Date().toISOString() });
    } catch (error) {
      if (import.meta.env.DEV) console.warn("[Olkinyei] cloud save failed for", id, error);
    }
  });
  return cloudSaveQueue;
}

// ============ Blog post schema mapping (CMS ⇆ Supabase blog_posts) ============

type DbBlogRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: unknown;
  category: BlogPost["category"];
  tags: string[] | null;
  hero_image: string;
  author: string | null;
  author_id: string | null;
  reading_time: number;
  featured: boolean;
  comments: number;
  archived: boolean;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

function blogPostFromRow(row: DbBlogRow): BlogPost {
  const publishedAtMs = row.published_at ? new Date(row.published_at).getTime() : null;
  const status: BlogPost["status"] = row.archived
    ? "archived"
    : publishedAtMs === null
      ? "draft"
      : publishedAtMs > Date.now()
        ? "scheduled"
        : "published";
  // created_at/updated_at may be absent on databases provisioned by an older
  // schema; fall back so sorting and rendering never produce Invalid Date.
  const createdAt = row.created_at ?? row.published_at ?? new Date().toISOString();
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt ?? "",
    body: typeof row.body === "string" ? row.body : JSON.stringify(row.body ?? ""),
    category: row.category,
    tags: row.tags ?? [],
    heroImage: row.hero_image ?? "",
    authorId: row.author_id ?? "u1",
    author: row.author ?? "Olkinyei",
    readingTime: row.reading_time ?? 5,
    seo: { title: row.seo_title ?? row.title, description: row.seo_description ?? row.excerpt ?? "" },
    publishedAt: row.published_at ?? undefined,
    status,
    featured: Boolean(row.featured),
    comments: row.comments ?? 0,
    createdAt,
    updatedAt: row.updated_at ?? createdAt,
  };
}

function blogPostToRow(post: BlogPost): Omit<DbBlogRow, "created_at" | "updated_at"> {
  const isPublished = post.status === "published" && Boolean(post.publishedAt);
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    body: post.body,
    category: post.category,
    tags: post.tags,
    hero_image: post.heroImage,
    author: post.author,
    author_id: post.authorId,
    reading_time: post.readingTime,
    featured: post.featured,
    comments: post.comments,
    archived: post.status === "archived",
    seo_title: post.seo.title,
    seo_description: post.seo.description,
    published_at: isPublished ? post.publishedAt ?? null : null,
  };
}

// Synced once when the cloud is available; realtime keeps it live afterwards.
let blogBootstrapped = false;

async function loadCloudBlogPosts(): Promise<void> {
  const client = supabase;
  if (!client || blogBootstrapped) return;
  blogBootstrapped = true;
  try {
    // Order by published_at: it exists on every schema version, whereas
    // created_at was missing from the original blog_posts definition and an
    // unknown ORDER BY column fails the entire request.
    const { data, error } = await client
      .from(TABLES.blogPosts)
      .select("*")
      .order("published_at", { ascending: false, nullsFirst: false });
    if (error) throw new Error(`${error.message}${error.hint ? ` — ${error.hint}` : ""}`);
    if (!data) throw new Error("No response from blog_posts");

    const posts = (data as DbBlogRow[]).map(blogPostFromRow);
    // Cloud is authoritative for anything it returns. Anonymous visitors only
    // receive published rows (RLS), which is exactly what the journal shows.
    // Unsynced local drafts are preserved so CMS work is never lost.
    const localOnly = state.blogPosts.filter((existing) =>
      existing.status !== "published"
      && existing.status !== "archived"
      && !posts.some((cloud) => cloud.id === existing.id || cloud.slug === existing.slug));
    state = { ...state, blogPosts: [...posts, ...localOnly] };
    emit();
    if (import.meta.env.DEV) console.debug(`[Olkinyei] Blog posts synced from Supabase: ${posts.length}`);
  } catch (error) {
    blogBootstrapped = false;
    const message = error instanceof Error ? error.message : String(error);
    // Surfaced loudly: an empty journal in production is almost always this.
    console.error(
      "[Olkinyei] Could not load blog posts from Supabase:",
      message,
      "\nRun supabase/blog_posts_sync.sql, then confirm anonymous SELECT is permitted on public.blog_posts.",
    );
  }
}

function applyBlogRealtimeRow(action: "INSERT" | "UPDATE" | "DELETE", row: unknown) {
  if (!row || typeof row !== "object") return;
  const rec = row as DbBlogRow & { id: string };
  if (action === "DELETE") {
    const id = (rec as unknown as { id: string }).id;
    if (!id) return;
    state = { ...state, blogPosts: state.blogPosts.filter((p) => p.id !== id) };
    emit();
    return;
  }
  const next = blogPostFromRow(rec);
  const exists = state.blogPosts.some((p) => p.id === next.id);
  state = {
    ...state,
    blogPosts: exists ? state.blogPosts.map((p) => (p.id === next.id ? next : p)) : [next, ...state.blogPosts],
  };
  emit();
}

// Live updates: any save from any device lands here without a refresh.
if (typeof window !== "undefined" && supabase) {
  supabase
    .channel("olkinyei-cms-content")
    .on("postgres_changes", { event: "*", schema: "public", table: "cms_content" }, (payload) => {
      const row = payload.new as { id?: string; content?: unknown };
      if (row?.id === "site_settings") applyCloudSiteSettings(row.content);
      if (row?.id === "pages") applyCloudPages(row.content);
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "blog_posts" }, (payload) => {
      applyBlogRealtimeRow("INSERT", payload.new);
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "blog_posts" }, (payload) => {
      applyBlogRealtimeRow("UPDATE", payload.new);
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "blog_posts" }, (payload) => {
      applyBlogRealtimeRow("DELETE", payload.old);
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "testimonials" }, (payload) => {
      applyTestimonialRealtime("INSERT", payload.new);
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "testimonials" }, (payload) => {
      applyTestimonialRealtime("UPDATE", payload.new);
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "testimonials" }, (payload) => {
      applyTestimonialRealtime("DELETE", payload.old);
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "packages" }, (payload) => {
      applyPackageRealtime("INSERT", payload.new);
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "packages" }, (payload) => {
      applyPackageRealtime("UPDATE", payload.new);
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "packages" }, (payload) => {
      applyPackageRealtime("DELETE", payload.old);
    })
    .subscribe();

  // Boot the content. Public bundle shares this module, so visitors get
  // fresh brand settings on first paint as well.
  void loadCloudCmsContent();
  void loadCloudBlogPosts();
  void loadCloudTestimonials();
  void loadCloudPackages();
}

export function newBlogId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Fallback for very old browsers: RFC-4122 v4 shape.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

// Postgres uuid columns reject locally generated ids ("p1", "m3x8kq-a7f2c1"),
// so writes must detect them and let the database mint the id instead.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============ Safari packages (public.packages) ============
// The public website reads these rows, so CMS edits must reach the database.

type DbPackageRow = {
  id: string;
  slug: string;
  title: string;
  region: string;
  duration: string;
  nights: number | null;
  price_usd: number;
  discount: number | null;
  hero_image: string;
  gallery: string[] | null;
  summary: string;
  description: string | null;
  signature: string | null;
  highlights: string[] | null;
  included: string[] | null;
  excluded: string[] | null;
  availability: string[] | null;
  country: string[] | null;
  parks: string[] | null;
  wildlife: string[] | null;
  difficulty: SafariPackage["difficulty"] | null;
  tags: string[] | null;
  featured: boolean | null;
  published: boolean | null;
  archived: boolean | null;
  coordinates: [number, number] | null;
  seo_title: string | null;
  seo_description: string | null;
  publish_date: string | null;
  created_at: string;
  updated_at: string;
};

function packageFromRow(row: DbPackageRow): SafariPackage {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    region: row.region,
    duration: row.duration,
    nights: row.nights ?? 0,
    price: Number(row.price_usd) || 0,
    discount: row.discount ?? undefined,
    image: row.hero_image ?? "",
    gallery: row.gallery ?? [],
    summary: row.summary ?? "",
    description: row.description ?? "",
    signature: row.signature ?? "",
    highlights: row.highlights ?? [],
    included: row.included ?? [],
    excluded: row.excluded ?? [],
    availability: row.availability ?? [],
    country: (row.country ?? []) as SafariPackage["country"],
    parks: row.parks ?? [],
    wildlife: row.wildlife ?? [],
    difficulty: row.difficulty ?? "Moderate",
    tags: row.tags ?? [],
    featured: Boolean(row.featured),
    published: Boolean(row.published),
    archived: Boolean(row.archived),
    coordinates: row.coordinates ?? [0, 0],
    seo: { title: row.seo_title ?? row.title, description: row.seo_description ?? row.summary ?? "" },
    publishDate: row.publish_date ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

function packageToRow(pkg: SafariPackage): Record<string, unknown> {
  return {
    id: pkg.id,
    slug: pkg.slug,
    title: pkg.title,
    region: pkg.region,
    duration: pkg.duration,
    nights: pkg.nights,
    price_usd: pkg.price,
    discount: pkg.discount ?? null,
    hero_image: pkg.image,
    gallery: pkg.gallery,
    summary: pkg.summary,
    description: pkg.description,
    signature: pkg.signature,
    highlights: pkg.highlights,
    included: pkg.included,
    excluded: pkg.excluded,
    availability: pkg.availability,
    country: pkg.country,
    parks: pkg.parks,
    wildlife: pkg.wildlife,
    difficulty: pkg.difficulty,
    tags: pkg.tags,
    featured: pkg.featured,
    published: pkg.published,
    archived: Boolean(pkg.archived),
    coordinates: pkg.coordinates,
    seo_title: pkg.seo.title,
    seo_description: pkg.seo.description,
    publish_date: pkg.publishDate ?? null,
  };
}

let packagesBootstrapped = false;

async function loadCloudPackages(): Promise<void> {
  const client = supabase;
  if (!client || packagesBootstrapped) return;
  packagesBootstrapped = true;
  try {
    // `public.packages` is the single source of truth for both the CMS and
    // the public website. Newest first, keyed by created_at; fall back to
    // updated_at on databases predating supabase/packages_sync.sql.
    let result = await client.from("packages").select("*").order("created_at", { ascending: false });
    if (result.error) {
      result = await client.from("packages").select("*").order("updated_at", { ascending: false });
    }
    if (result.error) throw new Error(result.error.message);
    const data = result.data;
    if (!data || data.length === 0) return; // keep seed content until the table is populated
    state = { ...state, packages: (data as DbPackageRow[]).map(packageFromRow) };
    emit();
    if (import.meta.env.DEV) console.debug(`[Olkinyei] Packages synced: ${data.length}`);
  } catch (error) {
    packagesBootstrapped = false;
    console.error(
      "[Olkinyei] Could not load safari packages from Supabase:",
      error instanceof Error ? error.message : error,
      "\nRun supabase/packages_sync.sql, then confirm anonymous SELECT is permitted on public.packages.",
    );
  }
}

function applyPackageRealtime(action: "INSERT" | "UPDATE" | "DELETE", row: unknown) {
  if (!row || typeof row !== "object") return;
  const rec = row as DbPackageRow;
  if (action === "DELETE") {
    state = { ...state, packages: state.packages.filter((p) => p.id !== rec.id) };
    emit();
    return;
  }
  const next = packageFromRow(rec);
  const exists = state.packages.some((p) => p.id === next.id);
  state = {
    ...state,
    packages: exists ? state.packages.map((p) => (p.id === next.id ? next : p)) : [next, ...state.packages],
  };
  emit();
}

/** Persists a package to the database. Errors surface, never swallowed. */
function packageCloudSave(pkg: SafariPackage | null, deletedId?: string): void {
  const client = supabase;
  if (!client) return;
  void (async () => {
    try {
      if (deletedId) {
        if (!UUID_PATTERN.test(deletedId)) return;
        const { error } = await client.from("packages").delete().eq("id", deletedId);
        if (error) throw error;
        return;
      }
      if (!pkg) return;
      const row = packageToRow(pkg);
      if (UUID_PATTERN.test(pkg.id)) {
        const { error } = await client.from("packages").upsert(row, { onConflict: "id" });
        if (error) throw error;
        return;
      }
      // Seed ids ("p1") are not uuids: let Postgres mint one, keyed by slug.
      const { id: _seedId, ...withoutId } = row;
      const { data, error } = await client
        .from("packages")
        .upsert(withoutId, { onConflict: "slug" })
        .select("id")
        .single();
      if (error) throw error;
      const cloudId = (data as { id: string }).id;
      state = { ...state, packages: state.packages.map((p) => (p.id === pkg.id ? { ...p, id: cloudId } : p)) };
      emit();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (import.meta.env.DEV) console.error("[Olkinyei] package cloud write failed:", message);
      notify({
        type: "error",
        title: "Not published to the website",
        message: `Saved locally, but Supabase rejected it: ${message.slice(0, 140)}`,
        duration: 9000,
      });
    }
  })();
}

// ============ Testimonials (public.testimonials) ============

type DbTestimonialRow = {
  id: string;
  quote: string;
  guest_name: string;
  guest_location: string | null;
  guest_email: string | null;
  guest_photo: string | null;
  rating: number | null;
  safari_package: string | null;
  consent_given: boolean | null;
  status: TestimonialStatus;
  flagged: boolean;
  flag_reason: string | null;
  staff_notes: string | null;
  source: Testimonial["source"];
  external_review_id: string | null;
  external_url: string | null;
  external_rating: number | null;
  external_created_at: string | null;
  imported_at: string | null;
  last_synced_at: string | null;
  sort_order: number;
  moderated_by: string | null;
  moderated_at: string | null;
  created_at: string;
  updated_at: string;
};

function testimonialFromRow(row: DbTestimonialRow): Testimonial {
  return {
    id: row.id,
    quote: row.quote,
    guestName: row.guest_name,
    guestLocation: row.guest_location ?? undefined,
    guestEmail: row.guest_email ?? undefined,
    guestPhoto: row.guest_photo ?? undefined,
    rating: row.rating ?? undefined,
    safariPackage: row.safari_package ?? undefined,
    consentGiven: Boolean(row.consent_given),
    status: row.status,
    flagged: Boolean(row.flagged),
    flagReason: row.flag_reason ?? undefined,
    staffNotes: row.staff_notes ?? undefined,
    // Rows predating the provider migration are website submissions.
    source: row.source ?? "website",
    externalReviewId: row.external_review_id ?? undefined,
    externalUrl: row.external_url ?? undefined,
    externalRating: row.external_rating ?? undefined,
    externalCreatedAt: row.external_created_at ?? undefined,
    importedAt: row.imported_at ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
    sortOrder: row.sort_order ?? 0,
    moderatedBy: row.moderated_by ?? undefined,
    moderatedAt: row.moderated_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

let testimonialsBootstrapped = false;

/** Loads testimonials. RLS returns approved-only for visitors, all for staff. */
async function loadCloudTestimonials(): Promise<void> {
  const client = supabase;
  if (!client || testimonialsBootstrapped) return;
  testimonialsBootstrapped = true;
  try {
    const { data, error } = await client
      .from(TABLES.testimonials)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    state = { ...state, testimonials: (data as DbTestimonialRow[]).map(testimonialFromRow) };
    emit();
  } catch (error) {
    testimonialsBootstrapped = false;
    if (import.meta.env.DEV) console.warn("[Olkinyei] Could not load testimonials:", error);
  }
}

function applyTestimonialRealtime(action: "INSERT" | "UPDATE" | "DELETE", row: unknown) {
  if (!row || typeof row !== "object") return;
  const rec = row as DbTestimonialRow;
  if (action === "DELETE") {
    state = { ...state, testimonials: state.testimonials.filter((t) => t.id !== rec.id) };
    emit();
    return;
  }
  const next = testimonialFromRow(rec);
  const exists = state.testimonials.some((t) => t.id === next.id);
  state = {
    ...state,
    testimonials: exists
      ? state.testimonials.map((t) => (t.id === next.id ? next : t))
      : [next, ...state.testimonials],
  };
  emit();
}

// Writes keep Supabase as the source of truth. Failures are reported, never
// swallowed, so a broken sync can't masquerade as a successful save.
function blogCloudSave(post: BlogPost | null, deletedId?: string): void {
  const client = supabase;
  if (!client) return;
  void (async () => {
    try {
      if (deletedId) {
        // A non-uuid id never reached the cloud, so there is nothing to remove.
        if (!UUID_PATTERN.test(deletedId)) return;
        const { error } = await client.from(TABLES.blogPosts).delete().eq("id", deletedId);
        if (error) throw error;
        return;
      }
      if (!post) return;
      const row = blogPostToRow(post);

      if (UUID_PATTERN.test(post.id)) {
        const { error } = await client.from(TABLES.blogPosts).upsert(row, { onConflict: "id" });
        if (error) throw error;
        return;
      }

      // Legacy/local id: let Postgres mint the uuid, then adopt it locally so
      // subsequent edits and deletes address the same row.
      const { id: _localId, ...withoutId } = row;
      const { data, error } = await client
        .from(TABLES.blogPosts)
        .upsert(withoutId, { onConflict: "slug" })
        .select("id")
        .single();
      if (error) throw error;
      const cloudId = (data as { id: string }).id;
      state = { ...state, blogPosts: state.blogPosts.map((item) => (item.id === post.id ? { ...item, id: cloudId } : item)) };
      emit();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (import.meta.env.DEV) console.error("[Olkinyei] blog cloud write failed:", message);
      notify({
        type: "error",
        title: "Not published to the website",
        message: `The article is saved locally but Supabase rejected it: ${message.slice(0, 140)}`,
        duration: 9000,
      });
    }
  })();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getState() { return state; }

function uid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

function currentUser(): AdminUser | null {
  return state.currentUserId ? state.users.find((u) => u.id === state.currentUserId) ?? null : null;
}

function currentRole() { return currentUser()?.role ?? null; }

function logActivity(action: ActivityEntry["action"], entity: string, entityId: string, entityLabel: string, details?: string) {
  const user = currentUser();
  if (!user) return;
  const entry: ActivityEntry = {
    id: uid(),
    actorId: user.id,
    actorName: user.fullName,
    action,
    entity,
    entityId,
    entityLabel,
    timestamp: new Date().toISOString(),
    ip: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    details,
  };
  state = { ...state, activity: [entry, ...state.activity].slice(0, 500) };
}

function notify(notification: Omit<Notification, "id">) {
  const id = uid();
  const entry: Notification = { id, ...notification };
  state = { ...state, notifications: [...state.notifications, entry] };
  emit();
  window.setTimeout(() => {
    state = { ...state, notifications: state.notifications.filter((n) => n.id !== id) };
    emit();
  }, notification.duration ?? 4200);
}

function dismissNotification(id: string) {
  state = { ...state, notifications: state.notifications.filter((n) => n.id !== id) };
  emit();
}

// ============ Audit logging ============

function audit(action: string, target: string, outcome: "success" | "failure", options: { actorId?: string | null; actorEmail?: string | null; targetId?: string; reason?: string } = {}) {
  const entry: AuditEntry = {
    id: uid(),
    actorId: options.actorId ?? state.currentUserId,
    actorEmail: options.actorEmail ?? currentUser()?.email ?? null,
    action,
    target,
    targetId: options.targetId,
    ip: currentIp(),
    userAgent: currentUserAgent(),
    timestamp: new Date().toISOString(),
    outcome,
    reason: options.reason,
  };
  state = { ...state, audit: [entry, ...state.audit].slice(0, 2000) };
}

// ============ Session management ============

function createSession(user: AdminUser): Session {
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_MAX_HOURS * 60 * 60 * 1000);
  return {
    token: crypto.randomUUID(),
    userId: user.id,
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    lastActivityAt: now.toISOString(),
    ip: currentIp(),
    userAgent: currentUserAgent(),
  };
}

function sessionIsValid(session: Session | null): session is Session {
  if (!session) return false;
  const now = Date.now();
  const expires = new Date(session.expiresAt).getTime();
  const lastActivity = new Date(session.lastActivityAt).getTime();
  if (Number.isNaN(expires) || Number.isNaN(lastActivity)) return false;
  if (now >= expires) return false;
  if (now - lastActivity >= SESSION_IDLE_MINUTES * 60 * 1000) return false;
  return true;
}

function endSession(reason: string) {
  const actorId = state.currentUserId;
  const actorEmail = currentUser()?.email ?? null;
  state = { ...state, currentUserId: null, session: null };
  try { sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch { /* ignore */ }
  audit("session.ended", "session", "success", { actorId, actorEmail, reason });
  emit();
}

function touchSession() {
  if (!state.session) return;
  if (!sessionIsValid(state.session)) { endSession("expired"); return; }
  const now = new Date().toISOString();
  if (new Date(now).getTime() - new Date(state.session.lastActivityAt).getTime() < 30_000) return; // throttle updates
  state = { ...state, session: { ...state.session, lastActivityAt: now } };
  emit();
}

// Idle watchdog: expire session client-side.
if (typeof window !== "undefined") {
  window.setInterval(() => {
    if (state.currentUserId && !sessionIsValid(state.session)) endSession("idle-timeout");
  }, 60_000);
  ["click", "keydown", "mousemove", "touchstart"].forEach((event) => {
    window.addEventListener(event, touchSession, { passive: true });
  });
}

// ============ RBAC ============

/**
 * Resolves the effective permission set for a user.
 *
 * Defensive on two fronts:
 *  - An EMPTY `customPermissions` object is truthy in JS. Treating it as an
 *    override locked accounts out of every module, so it is ignored here.
 *  - A role value that predates role canonicalisation (or a stale cached
 *    session) must not resolve to `{}`. Legacy names are translated and any
 *    unknown value degrades to the least-privileged role instead of nothing.
 */
export function permissionsFor(user: AdminUser | null): PermissionSet {
  if (!user) return {};
  if (user.customPermissions && Object.keys(user.customPermissions).length > 0) {
    return user.customPermissions;
  }
  return ROLE_PERMISSION_SETS[resolveRole(user)] ?? ROLE_PERMISSION_SETS.content_manager;
}

/** Narrows any stored role string (including legacy values) to a known role. */
function resolveRole(user: AdminUser): Role {
  if (user.isRoot) return "root";
  const raw = user.role as string;
  if (raw in ROLE_PERMISSION_SETS) return raw as Role;
  return LEGACY_ROLE_ALIASES[raw] ?? "content_manager";
}

export function can(user: AdminUser | null, module: ModuleKey, action: Action = "view"): boolean {
  if (!user) return false;
  // Root is unrestricted, whichever spelling the profile row carries.
  if (user.isRoot || (user.role as string) === "root" || (user.role as string) === "root_super_admin") return true;
  // The dashboard is a read-only overview: every authenticated staff member
  // may open it, so a role mismatch can never leave someone with no landing page.
  if (module === "dashboard" && action === "view") return true;
  const modulePerms = permissionsFor(user)[module];
  if (!modulePerms) return false;
  if (modulePerms[action]) return true;
  // Manage implies edit/create/publish; edit implies view.
  if (action !== "view" && modulePerms.manage) return true;
  return false;
}

// ============ Actions ============

const actions = {
  setTheme(theme: Theme) { state = { ...state, theme }; emit(); },

  async login(email: string, password: string): Promise<{ ok: boolean; message?: string; mustChangePassword?: boolean }> {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      audit("login.attempt", "auth", "failure", { actorEmail: trimmedEmail || null, reason: "missing-credentials" });
      return { ok: false, message: "Enter your email and password." };
    }

    // Production path: Supabase is the source of truth for auth and profiles.
    if (!hasCloudBackend) {
      audit("login.attempt", "auth", "failure", { actorEmail: trimmedEmail, reason: "cloud-unconfigured" });
      return { ok: false, message: cloudUnavailableReason() };
    }
    const result = await authSignIn(trimmedEmail, password);
    if (!result.ok) {
      audit("login.attempt", "auth", "failure", { actorEmail: trimmedEmail, reason: result.code });
      void writeCloudAudit(null, "login.attempt", "auth", { outcome: "failure", reason: result.code });
      return { ok: false, message: result.message };
    }
    const user = result.user;
    const session = createSession(user);
    session.token = result.sessionToken; // Supabase-managed access token (rotates automatically).
    const users = state.users.some((u) => u.id === user.id)
      ? state.users.map((u) => u.id === user.id ? user : u)
      : [user, ...state.users];
    state = { ...state, currentUserId: user.id, session, users };
    try { sessionStorage.setItem(SESSION_STORAGE_KEY, session.token); } catch { /* ignore */ }
    audit("login.success", "auth", "success", { actorId: user.id, actorEmail: user.email, targetId: user.id });
    logActivity("login", "Authentication", user.id, "Successful sign-in");
    emit();
    void actions.syncCloudStaff();
    // Staff see rows RLS hides from anonymous visitors (pending testimonials,
    // unpublished packages, drafts). Re-pull them now that a session exists.
    void actions.reloadStaffContent();
    return { ok: true, mustChangePassword: Boolean(user.mustChangePassword) };
  },

  /**
   * Re-reads collections whose visibility depends on the caller's role.
   * Anonymous page-load only returns public rows; after sign-in the same
   * queries return the full set, so they must run again.
   */
  async reloadStaffContent(): Promise<void> {
    testimonialsBootstrapped = false;
    packagesBootstrapped = false;
    blogBootstrapped = false;
    await Promise.all([
      loadCloudTestimonials(),
      loadCloudPackages(),
      loadCloudBlogPosts(),
    ]);
  },

  logout() {
    // Guard against double sign-out cycles (button + auth-state listener can
    // both fire in the same frame when the auth server revokes).
    if (!state.currentUserId && !state.session) return;
    if (hasCloudBackend && supabase) {
      const actorId = state.currentUserId;
      void writeCloudAudit(actorId, "logout", "auth", { outcome: "success" });
    }
    endSession("user-initiated");
    if (hasCloudBackend && supabase) {
      // Clear Supabase's own storage AFTER local teardown so the auth event
      // finds nothing to revive.
      void supabase.auth.signOut();
    }
  },

  // Restore a cloud-authenticated session (used by the Supabase auth listener).
  async restoreCloudSession(): Promise<boolean> {
    if (!hasCloudBackend) return false;
    const { authGetSessionUser } = await import("./auth");
    const sessionUser = await authGetSessionUser();
    if (!sessionUser) return false;
    const session = createSession(sessionUser.user);
    session.token = sessionUser.sessionToken;
    const users = state.users.some((u) => u.id === sessionUser.user.id)
      ? state.users.map((u) => u.id === sessionUser.user.id ? sessionUser.user : u)
      : [sessionUser.user, ...state.users];
    state = { ...state, currentUserId: sessionUser.user.id, session, users };
    emit();
    void actions.syncCloudStaff();
    void actions.reloadStaffContent();
    return true;
  },

  /**
   * Re-reads the signed-in user's profile from the database and replaces the
   * cached copy outright. Recovers accounts whose locally stored role predates
   * a migration, without forcing a sign-out.
   */
  async refreshCurrentUser(): Promise<boolean> {
    if (!hasCloudBackend || !state.currentUserId) return false;
    const { authGetSessionUser } = await import("./auth");
    const sessionUser = await authGetSessionUser();
    if (!sessionUser) {
      notify({ type: "error", title: "Session expired", message: "Sign in again to continue." });
      return false;
    }
    // Replace, never merge: a stale cached entry must not survive.
    state = {
      ...state,
      currentUserId: sessionUser.user.id,
      users: [sessionUser.user, ...state.users.filter((u) => u.id !== sessionUser.user.id)],
    };
    emit();
    notify({ type: "success", title: "Permissions reloaded", message: `Signed in as ${sessionUser.user.role.replace(/_/g, " ")}.` });
    return true;
  },

  // Merge the real staff directory (profiles table) into Team & Roles.
  // Only privileged staff members can read all profiles — enforced by RLS.
  async syncCloudStaff(): Promise<void> {
    if (!hasCloudBackend || !state.currentUserId) return;
    try {
      const { authListProfiles } = await import("./auth");
      const profiles = await authListProfiles();
      if (!profiles) return;
      const byId = new Map(state.users.map((u) => [u.id, u]));
      const cloudIds = new Set(profiles.map((p) => p.id));
      const merged = profiles.map((p) => ({ ...byId.get(p.id), ...p }) as AdminUser);
      // Locally-added pending mirrors without a cloud twin stay visible until
      // the service role provisions the profile.
      const localOnly = state.users.filter((u) => !cloudIds.has(u.id) && String(u.id).startsWith("pending-"));
      state = { ...state, users: [...merged, ...localOnly] };
      emit();
    } catch { /* RLS hides the directory for non-privileged accounts — keep the local view. */ }
  },

  isSessionActive(): boolean {
    return sessionIsValid(state.session);
  },

  async changeOwnPassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean; message?: string }> {
    const user = currentUser();
    if (!user) return { ok: false, message: "You are not signed in." };
    const strength = validatePasswordStrength(newPassword);
    if (!strength.ok) return { ok: false, message: strength.message };
    if (!hasCloudBackend) return { ok: false, message: cloudUnavailableReason() };
    const result = await authChangePassword(currentPassword, newPassword);
    if (!result.ok) {
      audit("password.change", "user", "failure", { actorId: user.id, targetId: user.id, reason: result.message ?? "failed" });
      void writeCloudAudit(user.id, "password.change", "user", { outcome: "failure", targetId: user.id });
      return result;
    }
    state = {
      ...state,
      users: state.users.map((u) => u.id === user.id ? { ...u, mustChangePassword: false, passwordUpdatedAt: new Date().toISOString() } : u),
    };
    audit("password.change", "user", "success", { actorId: user.id, targetId: user.id });
    notify({ type: "success", title: "Password updated", message: "Your new password is now active." });
    emit();
    return { ok: true };
  },

  // Re-send a Supabase email invitation for an existing staff profile. Only
  // the Root Super Admin can trigger this — verified server-side by
  // /api/invite-user.
  async createInvitation(userId: string): Promise<{ ok: boolean; message?: string }> {
    const actor = currentUser();
    if (!actor) return { ok: false, message: "Not authorised." };
    if (!actor.isRoot) return { ok: false, message: "Only the Root Super Admin can invite users." };
    const target = state.users.find((u) => u.id === userId);
    if (!target) return { ok: false, message: "User not found." };
    if (target.isRoot) return { ok: false, message: "The Root Super Admin cannot be re-invited." };
    if (!hasCloudBackend) return { ok: false, message: "Connect the Supabase cloud database to send invitations." };

    const { authInviteUser } = await import("./auth");
    const result = await authInviteUser({
      email: target.email,
      fullName: target.fullName,
      role: target.role,
    });
    if (!result.ok) { notify({ type: "error", title: "Invitation failed", message: result.message }); return { ok: false, message: result.message }; }
    state = {
      ...state,
      users: state.users.map((u) => u.id === userId ? { ...u, status: "invited", invitedBy: actor.id, invitedAt: new Date().toISOString(), mustChangePassword: true } : u),
    };
    audit("invitation.sent", "user", "success", { actorId: actor.id, actorEmail: actor.email, targetId: userId });
    void writeCloudAudit(actor.id, "invitation.sent", "user", { outcome: "success", targetId: userId });
    notify({ type: "success", title: "Invitation sent", message: `${target.email} will receive their setup link by email. It expires in 24 hours.` });
    emit();
    return { ok: true };
  },

  // Root/creator-controlled, invitation-only staffing. POST /api/invite-user
  // authenticates the caller, verifies root status server-side, then calls
  // supabase.auth.admin.inviteUserByEmail — the service role key never leaves
  // the Vercel function. Nothing about the token is generated or stored here.
  async inviteNewUser(payload: { email: string; fullName: string; role: AdminUser["role"] }): Promise<{ ok: boolean; message?: string }> {
    const actor = currentUser();
    if (!actor) return { ok: false, message: "Not authorised." };
    if (!actor.isRoot) return { ok: false, message: "Only the Root Super Admin can invite users." };
    if (payload.role === "root") return { ok: false, message: "The Root Super Admin cannot be created through the CMS." };
    if (!hasCloudBackend) return { ok: false, message: "Connect the Supabase cloud database to send invitations." };

    const { authInviteUser } = await import("./auth");
    const result = await authInviteUser({
      email: payload.email.trim(),
      fullName: payload.fullName.trim(),
      role: payload.role,
    });
    if (!result.ok) return result;

    // Pull the real pending profile immediately so Team & Roles reflects it
    // (RLS prevents clients from listing users until this Root session sees it).
    void actions.syncCloudStaff();

    audit("invitation.sent", "user", "success", { actorId: actor.id, actorEmail: actor.email, reason: payload.email.trim() });
    void writeCloudAudit(actor.id, "invitation.sent", "user", { outcome: "success", reason: payload.role });
    // Mirror the pending staff locally so Team & Roles reflects the queue.
    const entry: AdminUser = {
      id: `pending-${Date.now().toString(36)}`,
      email: payload.email.trim(),
      fullName: payload.fullName.trim(),
      role: payload.role,
      avatar: "",
      lastLogin: "",
      status: "invited",
      createdAt: new Date().toISOString(),
      invitedBy: actor.id,
      invitedAt: new Date().toISOString(),
      mustChangePassword: true,
    };
    state = { ...state, users: [entry, ...state.users] };
    emit();
    return { ok: true };
  },

  suspendUser(userId: string) {
    const actor = currentUser();
    if (!actor?.isRoot) { notify({ type: "error", title: "Not permitted", message: "Only the Root Super Admin can suspend users." }); return; }
    const target = state.users.find((u) => u.id === userId);
    if (!target) return;
    if (target.isRoot) { notify({ type: "error", title: "Protected", message: "The Root Super Admin cannot be suspended." }); return; }
    state = { ...state, users: state.users.map((u) => u.id === userId ? { ...u, status: "suspended" } : u) };
    audit("user.suspended", "user", "success", { actorId: actor.id, actorEmail: actor.email, targetId: userId });
    notify({ type: "success", title: "User suspended", message: `${target.fullName} can no longer sign in.` });
    emit();
  },

  reactivateUser(userId: string) {
    const actor = currentUser();
    if (!actor?.isRoot) { notify({ type: "error", title: "Not permitted", message: "Only the Root Super Admin can reactivate users." }); return; }
    const target = state.users.find((u) => u.id === userId);
    if (!target) return;
    state = { ...state, users: state.users.map((u) => u.id === userId ? { ...u, status: "active", lockedUntil: undefined, failedLoginAttempts: 0 } : u) };
    audit("user.reactivated", "user", "success", { actorId: actor.id, actorEmail: actor.email, targetId: userId });
    notify({ type: "success", title: "User reactivated", message: `${target.fullName} can sign in again.` });
    emit();
  },

  deleteUser(userId: string) {
    const actor = currentUser();
    if (!actor?.isRoot) { notify({ type: "error", title: "Not permitted", message: "Only the Root Super Admin can delete users." }); return; }
    const target = state.users.find((u) => u.id === userId);
    if (!target) return;
    if (target.isRoot) { notify({ type: "error", title: "Protected", message: "The Root Super Admin cannot be deleted." }); return; }
    if (target.id === actor.id) { notify({ type: "error", title: "Blocked", message: "You cannot delete your own account." }); return; }
    state = { ...state, users: state.users.filter((u) => u.id !== userId) };
    audit("user.deleted", "user", "success", { actorId: actor.id, actorEmail: actor.email, targetId: userId, reason: target.email });
    notify({ type: "success", title: "User removed" });
    emit();
  },

  // Bookings — ingest every source of truth into the CMS pipeline.
  // Pass { bootstrap: true } for the initial catalog pull (merges history
  // without raising the unread badge or firing arrival toasts). Subsequent
  // calls announce genuinely new arrivals via badge + notification.
  async syncBookings(options: { bootstrap?: boolean } = {}): Promise<number> {
    const announce = bookingsBootstrapped && !options.bootstrap;
    const quiet = !announce;

    // 1. Same-browser bridge: the public booking form's local submissions.
    const localAdded = mergeExternalBookings(readPublicSubmissions(), { quiet });

    // 2. Cloud source of truth (cross-device). Ordered newest first.
    let cloudAdded: Booking[] = [];
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from(TABLES.bookings)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500);
        if (!error && data) {
          const rows = data as Record<string, unknown>[];
          cloudAdded = mergeExternalBookings(
            rows.map((row) => fromPublicBooking({
              reference: String(row.reference ?? ""),
              createdAt: String(row.created_at ?? new Date().toISOString()),
              status: (row.status as import("../data").Booking["status"]) ?? "New",
              safari: String(row.safari ?? ""),
              startDate: String(row.start_date ?? ""),
              endDate: String(row.end_date ?? ""),
              adults: Number(row.adults ?? 0),
              children: Number(row.children ?? 0),
              accommodation: String(row.accommodation ?? ""),
              pickup: String(row.pickup ?? ""),
              airport: String(row.airport ?? ""),
              budget: String(row.budget ?? ""),
              requests: String(row.special_requests ?? ""),
              payment: String(row.payment_preference ?? ""),
              name: String(row.customer_name ?? ""),
              email: String(row.customer_email ?? ""),
              phone: String(row.customer_phone ?? ""),
            })),
            { quiet },
          );
        }
      } catch { /* Offline mode: the local bridge remains the source of truth. */ }
    }

    bookingsBootstrapped = true;
    const added = [...localAdded, ...cloudAdded];
    return added.length;
  },

  // Realtime: instant admin feedback on submission, with automatic polling
  // fallback handled by the Bookings module when unavailable.
  ensureBookingsRealtime(): boolean {
    if (!supabase || bookingsChannel) return Boolean(bookingsChannel);
    bookingsChannel = subscribeToBookingsAuthenticated((submission) => {
      mergeExternalBookings([fromPublicBooking(submission)]);
    });
    if (!bookingsChannel) return false;
    audit("realtime.connected", "booking", "success");
    return true;
  },

  realtimeIsConnected(): boolean {
    return Boolean(bookingsChannel);
  },

  markBookingsSeen() {
    if (state.newBookingsCount === 0) return;
    state = { ...state, newBookingsCount: 0 };
    emit();
  },

  // Bookings
  createBooking(booking: Omit<Booking, "id" | "createdAt" | "reference" | "paymentStatus">) {
    const id = uid();
    const reference = `OLK-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const entry: Booking = { ...booking, id, reference, createdAt: new Date().toISOString(), paymentStatus: "Pending" };
    state = { ...state, bookings: [entry, ...state.bookings] };
    logActivity("created", "Booking", id, `${reference} · ${entry.name}`);
    notify({ type: "success", title: "Booking created", message: `${reference} added to the pipeline.` });
    emit();
    return entry;
  },
  updateBooking(id: string, patch: Partial<Booking>) {
    const booking = state.bookings.find((b) => b.id === id);
    if (!booking) return;
    state = { ...state, bookings: state.bookings.map((b) => b.id === id ? { ...b, ...patch } : b) };
    logActivity("updated", "Booking", id, `${booking.reference} · ${booking.name}`);
    notify({ type: "success", title: "Booking updated", message: `${booking.reference} saved.` });
    // Mirror status changes to the shared database so every device and the
    // public-side lookup stay consistent.
    if (supabase && patch.status) {
      void (async () => {
        try {
          await supabase.from(TABLES.bookings).update({ status: patch.status }).eq("reference", booking.reference);
          audit("booking.status.synced", "booking", "success", { targetId: booking.reference });
        } catch {
          notify({ type: "warning", title: "Cloud sync delayed", message: `${booking.reference} updated locally; it will sync on the next refresh.` });
          audit("booking.status.synced", "booking", "failure", { targetId: booking.reference, reason: "network" });
        }
      })();
    }
    emit();
  },
  deleteBooking(id: string) {
    const booking = state.bookings.find((b) => b.id === id);
    if (!booking) return;
    state = { ...state, bookings: state.bookings.filter((b) => b.id !== id) };
    logActivity("deleted", "Booking", id, `${booking.reference} · ${booking.name}`);
    notify({ type: "info", title: "Booking archived", message: `${booking.reference} moved to archive.` });
    if (supabase) {
      void supabase.from(TABLES.bookings).delete().eq("reference", booking.reference);
    }
    emit();
  },

  // Packages
  createPackage(pkg: Omit<SafariPackage, "id" | "createdAt" | "updatedAt" | "slug">) {
    // packages.id is a Postgres uuid column.
    const id = newBlogId();
    const slug = pkg.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const entry: SafariPackage = { ...pkg, id, slug, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    state = { ...state, packages: [entry, ...state.packages] };
    logActivity("created", "Package", id, entry.title);
    notify({ type: "success", title: "Package created", message: `${entry.title} is now in your library.` });
    emit();
    packageCloudSave(entry);
    return entry;
  },
  updatePackage(id: string, patch: Partial<SafariPackage>) {
    const pkg = state.packages.find((p) => p.id === id);
    if (!pkg) return;
    const next = { ...pkg, ...patch, updatedAt: new Date().toISOString() };
    state = { ...state, packages: state.packages.map((p) => (p.id === id ? next : p)) };
    logActivity("updated", "Package", id, pkg.title);
    notify({ type: "success", title: "Package updated", message: `${pkg.title} saved.` });
    emit();
    packageCloudSave(next);
  },
  deletePackage(id: string) {
    const pkg = state.packages.find((p) => p.id === id);
    if (!pkg) return;
    // Archive rather than delete: bookings reference packages by title.
    const next = { ...pkg, archived: true, published: false };
    state = { ...state, packages: state.packages.map((p) => (p.id === id ? next : p)) };
    logActivity("archived", "Package", id, pkg.title);
    notify({ type: "info", title: "Package archived", message: `${pkg.title} is hidden from the public site.` });
    emit();
    packageCloudSave(next);
  },
  duplicatePackage(id: string) {
    const pkg = state.packages.find((p) => p.id === id);
    if (!pkg) return;
    const { slug: _slug, id: _id, createdAt: _c, updatedAt: _u, ...rest } = pkg;
    actions.createPackage({ ...rest, title: `${pkg.title} (copy)`, published: false, featured: false });
  },

  // Destinations
  createDestination(d: Omit<Destination, "id" | "createdAt" | "updatedAt" | "slug">) {
    const id = uid();
    const slug = d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const entry: Destination = { ...d, id, slug, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    state = { ...state, destinations: [entry, ...state.destinations] };
    logActivity("created", "Destination", id, entry.name);
    notify({ type: "success", title: "Destination created", message: `${entry.name} added.` });
    emit();
    return entry;
  },
  updateDestination(id: string, patch: Partial<Destination>) {
    const d = state.destinations.find((x) => x.id === id);
    if (!d) return;
    state = { ...state, destinations: state.destinations.map((x) => x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x) };
    logActivity("updated", "Destination", id, d.name);
    notify({ type: "success", title: "Destination updated", message: `${d.name} saved.` });
    emit();
  },
  deleteDestination(id: string) {
    const d = state.destinations.find((x) => x.id === id);
    if (!d) return;
    state = { ...state, destinations: state.destinations.filter((x) => x.id !== id) };
    logActivity("deleted", "Destination", id, d.name);
    notify({ type: "info", title: "Destination removed", message: `${d.name} removed.` });
    emit();
  },

  // Media
  createMedia(m: Omit<MediaAsset, "id" | "createdAt">) {
    const id = uid();
    const entry: MediaAsset = { ...m, id, createdAt: new Date().toISOString() };
    state = { ...state, media: [entry, ...state.media] };
    logActivity("created", "Media Asset", id, entry.name);
    notify({ type: "success", title: "Media uploaded", message: `${entry.name} added to library.` });
    emit();
    return entry;
  },
  updateMedia(id: string, patch: Partial<MediaAsset>) {
    state = { ...state, media: state.media.map((m) => m.id === id ? { ...m, ...patch } : m) };
    emit();
  },
  deleteMedia(id: string) {
    const m = state.media.find((x) => x.id === id);
    if (!m) return;
    state = { ...state, media: state.media.map((x) => x.id === id ? { ...x, archived: true } : x) };
    logActivity("archived", "Media Asset", id, m.name);
    notify({ type: "info", title: "Asset archived", message: `${m.name} hidden from library.` });
    emit();
  },

  // Blog — write-through to Supabase so the public site stays synchronized.
  createBlogPost(p: Omit<BlogPost, "id" | "createdAt" | "updatedAt">) {
    // Must be a real uuid — blog_posts.id is a Postgres uuid column.
    const id = newBlogId();
    const entry: BlogPost = { ...p, id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    state = { ...state, blogPosts: [entry, ...state.blogPosts] };
    logActivity("created", "Blog Post", id, entry.title);
    notify({ type: "success", title: "Article created", message: `${entry.title} added to drafts.` });
    emit();
    blogCloudSave(entry);
    return entry;
  },
  updateBlogPost(id: string, patch: Partial<BlogPost>) {
    const p = state.blogPosts.find((x) => x.id === id);
    if (!p) return;
    const next = { ...p, ...patch, updatedAt: new Date().toISOString() } as BlogPost;
    state = { ...state, blogPosts: state.blogPosts.map((x) => (x.id === id ? next : x)) };
    logActivity(patch.status === "published" ? "published" : "updated", "Blog Post", id, p.title);
    notify({ type: "success", title: "Article updated", message: `${p.title} saved.` });
    emit();
    blogCloudSave(next);
  },
  deleteBlogPost(id: string) {
    const p = state.blogPosts.find((x) => x.id === id);
    if (!p) return;
    state = { ...state, blogPosts: state.blogPosts.filter((x) => x.id !== id) };
    logActivity("deleted", "Blog Post", id, p.title);
    notify({ type: "info", title: "Article deleted", message: `${p.title} removed.` });
    emit();
    blogCloudSave(null, id);
  },

  // ============ Testimonials ============

  /**
   * Public submission from the website. Always lands as `pending`; the
   * database screening trigger may downgrade it to `flagged`. RLS forbids the
   * client from choosing its own status or publishing.
   */
  async submitTestimonial(input: {
    guestName: string;
    quote: string;
    guestEmail?: string;
    guestLocation?: string;
    guestPhoto?: string;
    rating?: number;
    safariPackage?: string;
    consentGiven: boolean;
  }): Promise<{ ok: boolean; message?: string }> {
    const client = supabase;
    if (!client) return { ok: false, message: "Testimonials are temporarily unavailable. Please try again later." };

    const guestName = input.guestName.trim().slice(0, 120);
    const quote = input.quote.trim().slice(0, 4000);
    if (guestName.length < 2) return { ok: false, message: "Please enter your name." };
    if (quote.length < 10) return { ok: false, message: "Please write at least a sentence about your journey." };
    if (input.guestEmail && !/^\S+@\S+\.\S+$/.test(input.guestEmail.trim())) {
      return { ok: false, message: "Please enter a valid email address." };
    }
    // RLS enforces this too; failing early gives a clearer message.
    if (!input.consentGiven) {
      return { ok: false, message: "Please confirm we may publish your testimonial." };
    }
    const rating = input.rating && input.rating >= 1 && input.rating <= 5 ? Math.round(input.rating) : null;

    try {
      const { error } = await client.from(TABLES.testimonials).insert({
        guest_name: guestName,
        quote,
        guest_email: input.guestEmail?.trim().toLowerCase() || null,
        guest_location: input.guestLocation?.trim().slice(0, 120) || null,
        guest_photo: input.guestPhoto?.trim() || null,
        rating,
        safari_package: input.safariPackage?.trim().slice(0, 160) || null,
        consent_given: true,
        status: "pending",
        published: false,
        flagged: false,
        source: "website",
        external_review_id: null,
      });
      if (error) throw new Error(error.message);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (import.meta.env.DEV) console.error("[Olkinyei] testimonial submission failed:", message);
      return { ok: false, message: "We could not record your testimonial. Please try again shortly." };
    }
  },

  /**
   * Triggers a server-side import from an external review provider.
   * Credentials live only in the Vercel function; when a provider is not
   * configured the route reports that plainly and nothing breaks.
   */
  async importProviderReviews(provider: string): Promise<{ ok: boolean; message: string }> {
    const actor = currentUser();
    if (!actor || !can(actor, "blog", "manage")) {
      return { ok: false, message: "You do not have permission to import reviews." };
    }
    if (!supabase) return { ok: false, message: "Cloud database is not configured." };

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) return { ok: false, message: "Sign in again to continue." };

      const response = await fetch("/api/import-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider }),
        cache: "no-store",
      });
      const payload = (await response.json()) as { message?: string; error?: string; imported?: number };
      if (!response.ok) {
        return { ok: false, message: payload.error ?? "The import could not be completed." };
      }
      if (payload.imported && payload.imported > 0) {
        await actions.reloadTestimonials();
        notify({ type: "success", title: "Reviews imported", message: payload.message });
      }
      return { ok: true, message: payload.message ?? "Import complete." };
    } catch {
      return { ok: false, message: "Could not reach the import service." };
    }
  },

  /** Re-reads testimonials from the database after an import. */
  async reloadTestimonials(): Promise<void> {
    testimonialsBootstrapped = false;
    await loadCloudTestimonials();
  },

  /** Staff moderation: approve, reject, flag, or return to the queue. */
  async setTestimonialStatus(id: string, status: TestimonialStatus): Promise<void> {
    const actor = currentUser();
    if (!actor || !can(actor, "blog", "publish")) {
      notify({ type: "error", title: "Not permitted", message: "You do not have permission to moderate testimonials." });
      return;
    }
    const target = state.testimonials.find((t) => t.id === id);
    if (!target) return;

    state = {
      ...state,
      testimonials: state.testimonials.map((t) => (t.id === id
        ? { ...t, status, flagged: status === "flagged", moderatedBy: actor.id, moderatedAt: new Date().toISOString() }
        : t)),
    };
    emit();

    if (supabase) {
      const { error } = await supabase
        .from(TABLES.testimonials)
        .update({ status, flagged: status === "flagged", moderated_by: actor.id, moderated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) {
        notify({ type: "error", title: "Moderation failed", message: error.message });
        return;
      }
    }
    audit(`testimonial.${status}`, "testimonial", "success", { actorId: actor.id, actorEmail: actor.email, targetId: id });
    void writeCloudAudit(actor.id, `testimonial.${status}`, "testimonial", { outcome: "success", targetId: id });
    logActivity(status === "approved" ? "published" : "updated", "Testimonial", id, target.guestName);
    notify({
      type: "success",
      title: status === "approved" ? "Testimonial published" : `Testimonial ${status}`,
      message: `${target.guestName}'s testimonial is now ${status}.`,
    });
  },

  /** Staff edit of the testimonial body or attribution. */
  async updateTestimonial(id: string, patch: Partial<Testimonial>): Promise<void> {
    const actor = currentUser();
    if (!actor || !can(actor, "blog", "edit")) {
      notify({ type: "error", title: "Not permitted" });
      return;
    }
    const target = state.testimonials.find((t) => t.id === id);
    if (!target) return;

    state = { ...state, testimonials: state.testimonials.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
    emit();

    if (supabase) {
      const row: Record<string, unknown> = {};
      if (patch.quote !== undefined) row.quote = patch.quote;
      if (patch.guestName !== undefined) row.guest_name = patch.guestName;
      if (patch.guestLocation !== undefined) row.guest_location = patch.guestLocation || null;
      if (patch.guestPhoto !== undefined) row.guest_photo = patch.guestPhoto || null;
      if (patch.staffNotes !== undefined) row.staff_notes = patch.staffNotes || null;
      if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
      if (Object.keys(row).length > 0) {
        const { error } = await supabase.from(TABLES.testimonials).update(row).eq("id", id);
        if (error) { notify({ type: "error", title: "Save failed", message: error.message }); return; }
      }
    }
    audit("testimonial.updated", "testimonial", "success", { actorId: actor.id, targetId: id });
    notify({ type: "success", title: "Testimonial saved" });
  },

  async deleteTestimonial(id: string): Promise<void> {
    const actor = currentUser();
    if (!actor || !can(actor, "blog", "delete")) {
      notify({ type: "error", title: "Not permitted", message: "You do not have permission to delete testimonials." });
      return;
    }
    const target = state.testimonials.find((t) => t.id === id);
    if (!target) return;

    state = { ...state, testimonials: state.testimonials.filter((t) => t.id !== id) };
    emit();

    if (supabase) {
      const { error } = await supabase.from(TABLES.testimonials).delete().eq("id", id);
      if (error) { notify({ type: "error", title: "Delete failed", message: error.message }); return; }
    }
    audit("testimonial.deleted", "testimonial", "success", { actorId: actor.id, targetId: id });
    logActivity("deleted", "Testimonial", id, target.guestName);
    notify({ type: "info", title: "Testimonial deleted" });
  },

  // Guides
  createGuide(g: Omit<Guide, "id" | "createdAt" | "slug">) {
    const id = uid();
    const slug = g.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const entry: Guide = { ...g, id, slug, createdAt: new Date().toISOString() };
    state = { ...state, guides: [entry, ...state.guides] };
    logActivity("created", "Guide", id, entry.name);
    notify({ type: "success", title: "Guide added", message: `${entry.name} added to the roster.` });
    emit();
    return entry;
  },
  updateGuide(id: string, patch: Partial<Guide>) {
    const g = state.guides.find((x) => x.id === id);
    if (!g) return;
    state = { ...state, guides: state.guides.map((x) => x.id === id ? { ...x, ...patch } : x) };
    logActivity("updated", "Guide", id, g.name);
    notify({ type: "success", title: "Guide updated", message: `${g.name} saved.` });
    emit();
  },

  /**
   * Archives a guide. Bookings reference guides by id, so the record is kept
   * and simply hidden from the CMS list and the public website.
   */
  async deleteGuide(id: string): Promise<void> {
    const actor = currentUser();
    if (!actor || !can(actor, "guides", "delete")) {
      notify({ type: "error", title: "Not permitted", message: "You do not have permission to remove guides." });
      return;
    }
    const target = state.guides.find((g) => g.id === id);
    if (!target) return;

    const assigned = state.bookings.filter((b) => b.assignedGuideId === id).length;
    state = { ...state, guides: state.guides.filter((g) => g.id !== id) };
    emit();

    if (supabase && UUID_PATTERN.test(id)) {
      const { error } = await supabase
        .from("guides")
        .update({ archived: true, archived_at: new Date().toISOString(), archived_by: actor.id, active: false })
        .eq("id", id);
      if (error) {
        notify({ type: "error", title: "Could not remove guide", message: error.message });
        state = { ...state, guides: [target, ...state.guides] }; // restore on failure
        emit();
        return;
      }
    }
    audit("guide.archived", "guide", "success", { actorId: actor.id, targetId: id });
    logActivity("archived", "Guide", id, target.name);
    notify({
      type: "success",
      title: "Guide removed",
      message: assigned > 0
        ? `${target.name} archived. ${assigned} existing booking${assigned === 1 ? "" : "s"} keep their record.`
        : `${target.name} archived.`,
    });
  },

  // Vehicles
  createVehicle(v: Omit<Vehicle, "id" | "createdAt">) {
    const id = uid();
    const entry: Vehicle = { ...v, id, createdAt: new Date().toISOString() };
    state = { ...state, vehicles: [entry, ...state.vehicles] };
    logActivity("created", "Vehicle", id, entry.fleetCode);
    notify({ type: "success", title: "Vehicle added", message: `${entry.fleetCode} added to the fleet.` });
    emit();
    return entry;
  },
  updateVehicle(id: string, patch: Partial<Vehicle>) {
    const v = state.vehicles.find((x) => x.id === id);
    if (!v) return;
    state = { ...state, vehicles: state.vehicles.map((x) => x.id === id ? { ...x, ...patch } : x) };
    logActivity("updated", "Vehicle", id, v.fleetCode);
    notify({ type: "success", title: "Vehicle updated", message: `${v.fleetCode} saved.` });
    emit();
  },

  /**
   * Archives a vehicle. Bookings reference vehicles by id, so the fleet record
   * is retained and hidden rather than destroyed.
   */
  async deleteVehicle(id: string): Promise<void> {
    const actor = currentUser();
    if (!actor || !can(actor, "vehicles", "delete")) {
      notify({ type: "error", title: "Not permitted", message: "You do not have permission to remove vehicles." });
      return;
    }
    const target = state.vehicles.find((v) => v.id === id);
    if (!target) return;

    const assigned = state.bookings.filter((b) => b.assignedVehicleId === id).length;
    state = { ...state, vehicles: state.vehicles.filter((v) => v.id !== id) };
    emit();

    if (supabase && UUID_PATTERN.test(id)) {
      const { error } = await supabase
        .from("vehicles")
        .update({ archived: true, archived_at: new Date().toISOString(), archived_by: actor.id })
        .eq("id", id);
      if (error) {
        notify({ type: "error", title: "Could not remove vehicle", message: error.message });
        state = { ...state, vehicles: [target, ...state.vehicles] };
        emit();
        return;
      }
    }
    audit("vehicle.archived", "vehicle", "success", { actorId: actor.id, targetId: id });
    logActivity("archived", "Vehicle", id, target.fleetCode);
    notify({
      type: "success",
      title: "Vehicle removed",
      message: assigned > 0
        ? `${target.fleetCode} archived. ${assigned} existing booking${assigned === 1 ? "" : "s"} keep their record.`
        : `${target.fleetCode} archived.`,
    });
  },

  /**
   * Archives a customer. Bookings and invoices must survive, so the profile is
   * retained in the database and removed from the active CMS directory.
   */
  async deleteCustomer(id: string): Promise<void> {
    const actor = currentUser();
    if (!actor || !can(actor, "customers", "delete")) {
      notify({ type: "error", title: "Not permitted", message: "You do not have permission to remove customers." });
      return;
    }
    const target = state.customers.find((c) => c.id === id);
    if (!target) return;

    const history = state.bookings.filter((b) => b.customerId === id).length;
    state = { ...state, customers: state.customers.filter((c) => c.id !== id) };
    emit();

    if (supabase && UUID_PATTERN.test(id)) {
      const { error } = await supabase
        .from("customers")
        .update({ archived: true, archived_at: new Date().toISOString(), archived_by: actor.id })
        .eq("id", id);
      if (error) {
        notify({ type: "error", title: "Could not remove customer", message: error.message });
        state = { ...state, customers: [target, ...state.customers] };
        emit();
        return;
      }
    }
    audit("customer.archived", "customer", "success", { actorId: actor.id, targetId: id });
    logActivity("archived", "Customer", id, target.name);
    notify({
      type: "success",
      title: "Customer removed",
      message: history > 0
        ? `${target.name} archived. ${history} booking${history === 1 ? "" : "s"} and all invoices are preserved.`
        : `${target.name} archived.`,
    });
  },

  // Customers
  updateCustomer(id: string, patch: Partial<Customer>) {
    const c = state.customers.find((x) => x.id === id);
    if (!c) return;
    state = { ...state, customers: state.customers.map((x) => x.id === id ? { ...x, ...patch } : x) };
    logActivity("updated", "Customer", id, c.name);
    notify({ type: "success", title: "Customer updated", message: `${c.name} saved.` });
    emit();
  },

  // Users
  createUser(u: Omit<AdminUser, "id" | "createdAt" | "lastLogin" | "status"> & { status?: AdminUser["status"] }) {
    const actor = currentUser();
    if (!actor) { notify({ type: "error", title: "Not authorised" }); return null; }
    if (!can(actor, "users", "create") && !can(actor, "users", "manage")) {
      notify({ type: "error", title: "Not permitted", message: "You do not have permission to create users." });
      audit("user.create", "user", "failure", { actorId: actor.id, reason: "insufficient-permissions" });
      return null;
    }
    // Only the Root Super Admin can create super_admin accounts. No one can create root.
    if (u.role === "root") { notify({ type: "error", title: "Blocked", message: "The Root Super Admin cannot be created through the CMS." }); return null; }
    if (u.role === "super_admin" && !actor.isRoot) { notify({ type: "error", title: "Not permitted", message: "Only the Root Super Admin can create Super Admin accounts." }); return null; }
    if (!/^\S+@\S+\.\S+$/.test(u.email)) { notify({ type: "error", title: "Invalid email" }); return null; }
    if (state.users.some((existing) => existing.email.toLowerCase() === u.email.toLowerCase())) {
      notify({ type: "error", title: "Email already in use" });
      return null;
    }
    const id = uid();
    const entry: AdminUser = {
      ...u,
      id,
      createdAt: new Date().toISOString(),
      lastLogin: "",
      status: "invited",
      isRoot: false,
      mustChangePassword: true,
      invitedBy: actor.id,
      invitedAt: new Date().toISOString(),
    };
    state = { ...state, users: [entry, ...state.users] };
    audit("user.created", "user", "success", { actorId: actor.id, actorEmail: actor.email, targetId: id, reason: entry.role });
    logActivity("created", "User", id, entry.fullName);
    notify({ type: "success", title: "User invited", message: `${entry.fullName} invited as ${entry.role.replace(/_/g, " ")}. Generate a setup link to complete onboarding.` });
    emit();
    return entry;
  },
  updateUser(id: string, patch: Partial<AdminUser>) {
    const actor = currentUser();
    if (!actor) { notify({ type: "error", title: "Not authorised" }); return; }
    const target = state.users.find((x) => x.id === id);
    if (!target) return;
    // Root Super Admin is immutable except by itself.
    if (target.isRoot && actor.id !== target.id) {
      notify({ type: "error", title: "Protected", message: "The Root Super Admin cannot be modified by other administrators." });
      audit("user.update", "user", "failure", { actorId: actor.id, targetId: id, reason: "root-protected" });
      return;
    }
    if (!can(actor, "users", "edit") && !can(actor, "users", "manage") && actor.id !== id) {
      notify({ type: "error", title: "Not permitted" });
      return;
    }
    // Prevent privilege escalation. Identity and root status are never
    // client-writable; credentials live in Supabase Auth, not on this model.
    const sanitised: Partial<AdminUser> = { ...patch };
    delete sanitised.id;
    delete sanitised.createdAt;
    delete sanitised.isRoot;
    const requestedRole = sanitised.role;
    if (requestedRole === "root") delete sanitised.role;
    else if (requestedRole === "super_admin" && !actor.isRoot) {
      notify({ type: "error", title: "Not permitted", message: "Only the Root Super Admin can promote users to Super Admin." });
      delete sanitised.role;
    }
    if (target.isRoot && requestedRole && requestedRole !== "root") {
      notify({ type: "error", title: "Blocked", message: "The Root Super Admin cannot be demoted." });
      delete sanitised.role;
    }
    // Cloud RBAC: role changes are enforced in profiles via /api/manage-user;
    // the database role remains the server-side authority.
    if (hasCloudBackend && actor.id !== id && sanitised.role) {
      void (async () => {
        const { authManageUser } = await import("./auth");
        const result = await authManageUser("set_role", { userId: id, role: sanitised.role as AdminUser["role"] });
        if (!result.ok) notify({ type: "error", title: "Cloud role update failed", message: result.message });
      })();
    }
    if (Object.keys(sanitised).length === 0) return;
    state = { ...state, users: state.users.map((x) => x.id === id ? { ...x, ...sanitised } : x) };
    audit("user.updated", "user", "success", { actorId: actor.id, actorEmail: actor.email, targetId: id });
    logActivity("updated", "User", id, target.fullName);
    notify({ type: "success", title: "User updated", message: `${target.fullName} saved.` });
    emit();
    return;
  },
  _legacyUpdateUser(id: string, patch: Partial<AdminUser>) {
    const u = state.users.find((x) => x.id === id);
    if (!u) return;
    state = { ...state, users: state.users.map((x) => x.id === id ? { ...x, ...patch } : x) };
    logActivity("updated", "User", id, u.fullName);
    notify({ type: "success", title: "User updated", message: `${u.fullName} saved.` });
    emit();
  },

  // Pages
  updatePage(id: string, patch: Partial<PageSettings>) {
    const p = state.pages.find((x) => x.id === id);
    if (!p) return;
    state = { ...state, pages: state.pages.map((x) => x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString(), updatedBy: currentUser()?.id ?? "" } : x) };
    logActivity(patch.published === false ? "archived" : "updated", "Page", id, p.title);
    notify({ type: "success", title: "Page updated", message: `${p.title} saved.` });
    emit();
    void cloudSaveDocument("pages", state.pages);
  },

  // Site Settings — logo, brand colors, tagline, contact info, analytics.
  updateSiteSettings(patch: Partial<SiteSettings>) {
    state = { ...state, siteSettings: { ...state.siteSettings, ...patch } };
    logActivity("updated", "Site Settings", "global", "Global site settings");
    notify({ type: "success", title: "Settings saved", message: "Global site settings updated on all devices." });
    emit();
    void cloudSaveDocument("site_settings", state.siteSettings);
  },

  resetDemoData() {
    state = {
      ...loadState(),
      users: seedUsers,
      bookings: seedBookings,
      packages: seedPackages,
      destinations: seedDestinations,
      media: seedMedia,
      blogPosts: seedBlogPosts,
      guides: seedGuides,
      vehicles: seedVehicles,
      customers: seedCustomers,
      pages: seedPages,
      siteSettings: seedSiteSettings,
      activity: seedActivity,
      theme: state.theme,
      currentUserId: state.currentUserId,
      notifications: [],
    };
    emit();
    notify({ type: "info", title: "Demo data restored", message: "All collections reset to sample data." });
  },
};

// ============ Hook ============

/**
 * Subscribes to a slice of CMS state.
 *
 * The selector MUST return a stable reference for unchanged state — return a
 * raw slice (`state.testimonials`) and derive with `useMemo` in the component.
 * Deriving inside the selector (`state.testimonials.filter(...)`) produces a
 * new array on every call, which `useSyncExternalStore` reads as a changed
 * snapshot, causing an infinite render loop and a blank page.
 *
 * The cache below makes that mistake non-fatal: when a freshly computed value
 * is deeply equal to the previous one, the previous reference is reused.
 */
export function useStore<T>(selector: (s: StoreState) => T): T {
  const cache = useRef<{ state: StoreState; value: T } | null>(null);

  const getSnapshot = useCallback(() => {
    const previous = cache.current;
    // State is replaced immutably, so an identical reference means no change.
    if (previous && previous.state === state) return previous.value;

    const next = selector(state);
    // Preserve the old reference when the derived value is equivalent.
    if (previous && isShallowEqualValue(previous.value, next)) {
      cache.current = { state, value: previous.value };
      return previous.value;
    }
    cache.current = { state, value: next };
    return next;
  }, [selector]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Reference, primitive, or one-level-deep array/object equivalence. */
function isShallowEqualValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => Object.is(item, b[index]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as Record<string, unknown>);
    const bKeys = Object.keys(b as Record<string, unknown>);
    return aKeys.length === bKeys.length
      && aKeys.every((key) => Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
  }
  return false;
}

export const store = { actions, getState, currentUser, currentRole, notify, dismissNotification };
