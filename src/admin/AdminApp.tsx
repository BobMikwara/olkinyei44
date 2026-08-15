import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  CalendarDays,
  Check,
  Eye,
  FileText,
  Globe2,
  Image as ImageIcon,
  Package,
  Save,
  Upload,
  Users,
} from "lucide-react";
import { AdminLayout } from "./layout";
import { can, store, useStore } from "./store";
import { Badge, BarChart, Button, Card, EmptyState, Input, PageHeader, StatCard, Textarea, ToastContainer } from "./ui";
import { ROLES } from "./constants";
import type { AdminUser, ModuleKey, PageSettings, SiteSettings } from "./types";
import { Lock } from "lucide-react";

// Modules
import PackagesManager from "./modules/Packages";
import BookingsManager from "./modules/Bookings";
import MediaManager from "./modules/Media";
import BlogManager from "./modules/Blog";
import TestimonialsManager from "./modules/Testimonials";
import GuidesManager from "./modules/Guides";
import VehiclesManager from "./modules/Vehicles";
import { CustomersManager, DestinationsManager, UsersManager, AnalyticsDashboard } from "./modules/Combined";

function moduleFromPath(path: string) {
  // Handle both hash-based (#/admin/bookings) and pathname-based (/admin/bookings)
  const cleaned = path.replace(/^#/, "").replace(/^\//, "");
  const parts = cleaned.split("/").filter(Boolean);
  // parts[0] should be "admin", parts[1] is the module
  if (parts[0] === "admin" && parts[1]) return parts[1];
  return "dashboard";
}

function getCurrentAdminPath() {
  const hash = window.location.hash.replace(/^#/, "");
  return hash || window.location.pathname;
}

function Dashboard() {
  const bookings = useStore((state) => state.bookings);
  const packages = useStore((state) => state.packages);
  const media = useStore((state) => state.media);
  const customers = useStore((state) => state.customers);
  const activity = useStore((state) => state.activity);
  const revenue = bookings.reduce((sum, booking) => sum + (booking.paymentAmount ?? 0), 0);
  const chart = [
    { label: "Jan", value: 21, secondary: 15 }, { label: "Feb", value: 31, secondary: 22 },
    { label: "Mar", value: 27, secondary: 19 }, { label: "Apr", value: 42, secondary: 30 },
    { label: "May", value: 48, secondary: 35 }, { label: "Jun", value: 57, secondary: 39 },
    { label: "Jul", value: 72, secondary: 52 }, { label: "Aug", value: 68, secondary: 49 },
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <PageHeader eyebrow="Operations overview" title="Good morning, Oliver." description="Everything happening across Olkinyei, in one considered view." actions={<Button icon={Eye} onClick={() => { window.location.hash = ""; window.location.reload(); }}>View website</Button>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Booking requests" value={String(bookings.length)} change="+18% this month" icon={CalendarDays} accent="#c8744c" />
        <StatCard label="Recorded revenue" value={`$${Math.round(revenue / 1000)}k`} change="+12.4% this quarter" icon={BarChart3} accent="#d8b06b" />
        <StatCard label="Published safaris" value={String(packages.filter((item) => item.published && !item.archived).length)} icon={Package} accent="#82906e" />
        <StatCard label="Guest profiles" value={String(customers.length)} change="+6 this month" icon={Users} accent="#708da1" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.45fr_.85fr]">
        <Card className="p-5">
          <div className="mb-7 flex items-center justify-between"><div><h2 className="font-serif text-2xl font-light">Booking momentum</h2><p className="mt-1 text-xs text-[var(--admin-fg-muted)]">Requests and confirmations, January to August</p></div><Badge variant="success" dot>Live</Badge></div>
          <BarChart data={chart} height={230} />
        </Card>
        <Card className="p-5">
          <div className="mb-5 flex items-center justify-between"><h2 className="font-serif text-2xl font-light">Recent activity</h2><Activity size={17} className="text-[var(--admin-fg-muted)]" /></div>
          <div className="space-y-1">{activity.slice(0, 6).map((item) => <div key={item.id} className="border-b border-[var(--admin-border)] py-3 last:border-0"><p className="text-xs"><strong className="font-medium">{item.actorName}</strong> {item.action} {item.entity.toLowerCase()}</p><p className="mt-1 truncate text-[11px] text-[var(--admin-fg-muted)]">{item.entityLabel}</p></div>)}</div>
        </Card>
      </div>
      <Card className="mt-5 p-5"><div className="flex items-center justify-between"><div><h2 className="font-serif text-2xl font-light">Content health</h2><p className="mt-1 text-xs text-[var(--admin-fg-muted)]">Published content available to the public website</p></div><Globe2 size={18} className="text-[var(--admin-accent)]" /></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-[var(--admin-surface-2)] p-4"><FileText size={16} /><strong className="mt-3 block text-2xl">{packages.length}</strong><span className="text-[11px] text-[var(--admin-fg-muted)]">Safari packages</span></div><div className="rounded-lg bg-[var(--admin-surface-2)] p-4"><ImageIcon size={16} /><strong className="mt-3 block text-2xl">{media.filter((item) => !item.archived).length}</strong><span className="text-[11px] text-[var(--admin-fg-muted)]">Media assets</span></div><div className="rounded-lg bg-[var(--admin-surface-2)] p-4"><Check size={16} /><strong className="mt-3 block text-2xl">6</strong><span className="text-[11px] text-[var(--admin-fg-muted)]">Published pages</span></div></div></Card>
    </motion.div>
  );
}

function BrandPreview({ settings }: { settings: SiteSettings }) {
  return <div className="overflow-hidden rounded-xl border border-[var(--admin-border)]"><div className="flex min-h-64 items-center justify-center bg-[#20251e] p-8 text-[#f3ecdf]">{settings.logo ? <img src={settings.logo} alt="Current site logo" className="max-h-28 max-w-[280px] object-contain" /> : <div className="text-center"><strong className="block font-serif text-4xl font-normal">{settings.brandName}</strong><span className="mt-2 block text-[10px] tracking-[.4em]">EXPEDITIONS</span></div>}</div><div className="bg-[var(--admin-surface-2)] px-4 py-3 text-[11px] text-[var(--admin-fg-muted)]">Public header and footer preview</div></div>;
}

function SettingsManager() {
  const saved = useStore((state) => state.siteSettings);
  const [form, setForm] = useState<SiteSettings>(() => structuredClone(saved));
  const [tab, setTab] = useState<"brand" | "contact" | "analytics" | "advanced">("brand");
  const update = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => setForm((current) => ({ ...current, [key]: value }));
  const uploadLogo = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { store.notify({ type: "error", title: "Choose an image file" }); return; }
    if (file.size > 2_500_000) { store.notify({ type: "error", title: "Logo is too large", message: "Use an SVG, PNG or WebP under 2.5 MB." }); return; }
    const reader = new FileReader();
    reader.onload = () => update("logo", String(reader.result));
    reader.readAsDataURL(file);
  };
  const save = () => store.actions.updateSiteSettings(form);
  return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <PageHeader eyebrow="Global configuration" title="Site settings" description="Manage the identity and operating details shared by the public website." actions={<><Button variant="outline" icon={Eye} onClick={() => { window.location.hash = ""; window.location.reload(); }}>Preview</Button><Button icon={Save} onClick={save}>Save changes</Button></>} />
    <div className="mb-6 flex gap-1 border-b border-[var(--admin-border)]">{(["brand", "contact", "analytics", "advanced"] as const).map((item) => <button key={item} onClick={() => setTab(item)} className={`relative px-4 py-3 text-xs capitalize ${tab === item ? "text-[var(--admin-fg)]" : "text-[var(--admin-fg-muted)]"}`}>{item}{tab === item && <motion.span layoutId="settings-tab" className="absolute inset-x-0 bottom-0 h-px bg-[var(--admin-accent)]" />}</button>)}</div>
    {tab === "brand" && <div className="grid gap-6 lg:grid-cols-[1fr_.85fr]"><Card className="p-6"><h2 className="font-serif text-2xl font-light">Brand identity</h2><p className="mt-1 text-xs text-[var(--admin-fg-muted)]">Changes publish to the website header, menu, footer and browser identity.</p><div className="mt-6 space-y-5"><label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Website name</span><Input value={form.brandName} onChange={(event) => update("brandName", event.target.value)} /></label><label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Tagline</span><Input value={form.tagline} onChange={(event) => update("tagline", event.target.value)} /></label><div><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Primary site logo</span><div className="grid gap-2 sm:grid-cols-[1fr_auto]"><Input value={form.logo} onChange={(event) => update("logo", event.target.value)} placeholder="https://... or /logo.svg" /><label className="olk-button inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md bg-[var(--admin-surface-2)] px-3.5 text-xs font-medium transition hover:bg-[var(--admin-surface-3)]"><Upload size={14} />Upload<input className="sr-only" type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" onChange={uploadLogo} /></label></div><p className="mt-2 text-[11px] text-[var(--admin-fg-muted)]">Upload SVG, PNG, JPG or WebP, or paste a hosted image URL. Click Save changes to publish.</p></div><div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Primary color</span><div className="flex gap-2"><input type="color" className="h-9 w-12 rounded border border-[var(--admin-border)] bg-transparent" value={form.primaryColor} onChange={(event) => update("primaryColor", event.target.value)} /><Input value={form.primaryColor} onChange={(event) => update("primaryColor", event.target.value)} /></div></label><label><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Accent color</span><div className="flex gap-2"><input type="color" className="h-9 w-12 rounded border border-[var(--admin-border)] bg-transparent" value={form.accentColor} onChange={(event) => update("accentColor", event.target.value)} /><Input value={form.accentColor} onChange={(event) => update("accentColor", event.target.value)} /></div></label></div></div></Card><BrandPreview settings={form} /></div>}
    {tab === "contact" && <Card className="max-w-3xl p-6"><h2 className="font-serif text-2xl font-light">Contact details</h2><div className="mt-6 grid gap-5 sm:grid-cols-2"><label><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Journey email</span><Input type="email" value={form.contactEmail} onChange={(event) => update("contactEmail", event.target.value)} /></label><label><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Reservations email</span><Input type="email" value={form.reservationsEmail} onChange={(event) => update("reservationsEmail", event.target.value)} /></label><label><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Phone</span><Input value={form.phone} onChange={(event) => update("phone", event.target.value)} /></label><label><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">WhatsApp</span><Input value={form.whatsapp} onChange={(event) => update("whatsapp", event.target.value)} /></label></div></Card>}
    {tab === "analytics" && <Card className="max-w-3xl p-6"><h2 className="font-serif text-2xl font-light">Analytics integrations</h2><div className="mt-6 grid gap-5 sm:grid-cols-2"><label><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Google Analytics 4</span><Input value={form.analytics.ga4} onChange={(event) => update("analytics", { ...form.analytics, ga4: event.target.value })} /></label><label><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Google Tag Manager</span><Input value={form.analytics.gtm} onChange={(event) => update("analytics", { ...form.analytics, gtm: event.target.value })} /></label><label><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Facebook Pixel</span><Input value={form.analytics.fbPixel} onChange={(event) => update("analytics", { ...form.analytics, fbPixel: event.target.value })} /></label><label><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Microsoft Clarity</span><Input value={form.analytics.clarity} onChange={(event) => update("analytics", { ...form.analytics, clarity: event.target.value })} /></label></div></Card>}
    {tab === "advanced" && <div className="grid gap-5 lg:grid-cols-2"><Card className="p-6"><h2 className="font-serif text-2xl font-light">Search engine directives</h2><label className="mt-5 block"><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Robots.txt</span><Textarea rows={8} value={form.robotsTxt} onChange={(event) => update("robotsTxt", event.target.value)} /></label></Card><Card className="p-6"><h2 className="font-serif text-2xl font-light">Site state</h2><div className="mt-5 space-y-3">{[["maintenanceMode", "Maintenance mode", "Temporarily replace the public website with a maintenance notice."], ["comingSoon", "Coming soon", "Show the pre-launch page to public visitors."]] .map(([key, label, text]) => <label key={String(key)} className="flex items-center justify-between rounded-lg border border-[var(--admin-border)] p-4"><div><strong className="block text-sm font-medium">{String(label)}</strong><span className="mt-1 block text-[11px] text-[var(--admin-fg-muted)]">{String(text)}</span></div><input type="checkbox" className="h-4 w-4 accent-[var(--admin-accent)]" checked={Boolean(form[key as "maintenanceMode" | "comingSoon"])} onChange={(event) => update(key as "maintenanceMode" | "comingSoon", event.target.checked)} /></label>)}</div></Card></div>}
  </motion.div>;
}

function PagesManager() {
  const pages = useStore((state) => state.pages);
  const [selectedId, setSelectedId] = useState(pages[0]?.id ?? "");
  const selected = pages.find((page) => page.id === selectedId) ?? pages[0];
  const [draft, setDraft] = useState<PageSettings>(() => structuredClone(selected));
  const select = (page: PageSettings) => { setSelectedId(page.id); setDraft(structuredClone(page)); };
  const save = () => store.actions.updatePage(draft.id, draft);
  return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><PageHeader eyebrow="Page manager" title="Website pages" description="Edit the hero content and search metadata rendered by every public route." actions={<><Button variant="outline" icon={Eye} onClick={() => { window.location.hash = ""; window.location.reload(); }}>Preview page</Button><Button icon={Save} onClick={save}>Publish changes</Button></>} /><div className="grid gap-5 lg:grid-cols-[250px_1fr]"><Card className="h-fit p-2">{pages.map((page) => <button key={page.id} onClick={() => select(page)} className={`flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-xs transition ${page.id === draft.id ? "bg-[var(--admin-accent)]/10 text-[var(--admin-accent)]" : "text-[var(--admin-fg-muted)] hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)]"}`}><span><strong className="block font-medium">{page.title}</strong><small className="mt-1 block opacity-60">{page.route}</small></span><Badge variant={page.published ? "success" : "neutral"} dot>{page.published ? "Live" : "Draft"}</Badge></button>)}</Card><Card className="p-6"><div className="flex items-center justify-between"><h2 className="font-serif text-2xl font-light">{draft.title}</h2><label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-[var(--admin-accent)]" checked={draft.published} onChange={(event) => setDraft({ ...draft, published: event.target.checked })} />Published</label></div><div className="mt-6 space-y-5"><label className="block"><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Hero eyebrow</span><Input value={draft.heroEyebrow} onChange={(event) => setDraft({ ...draft, heroEyebrow: event.target.value })} /></label><label className="block"><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Hero heading</span><Input value={draft.heroTitle} onChange={(event) => setDraft({ ...draft, heroTitle: event.target.value })} /></label><label className="block"><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Hero supporting text</span><Textarea rows={3} value={draft.heroText} onChange={(event) => setDraft({ ...draft, heroText: event.target.value })} /></label><label className="block"><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Hero image URL</span><Input value={draft.heroImage} onChange={(event) => setDraft({ ...draft, heroImage: event.target.value })} /></label>{draft.route === "/" && <div className="border-t border-[var(--admin-border)] pt-6"><h3 className="mb-4 font-serif text-xl font-light">Home story content</h3><div className="space-y-4"><label className="block"><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Brand statement</span><Textarea rows={4} value={String(draft.content.homeStatement ?? "")} onChange={(event) => setDraft({ ...draft, content: { ...draft.content, homeStatement: event.target.value } })} /></label><label className="block"><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Conservation statement</span><Textarea rows={4} value={String(draft.content.conservationStatement ?? "")} onChange={(event) => setDraft({ ...draft, content: { ...draft.content, conservationStatement: event.target.value } })} /></label></div></div>}<div className="border-t border-[var(--admin-border)] pt-6"><h3 className="mb-4 font-serif text-xl font-light">Search metadata</h3><div className="space-y-4"><label className="block"><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">SEO title</span><Input value={draft.seo.title} onChange={(event) => setDraft({ ...draft, seo: { ...draft.seo, title: event.target.value } })} /></label><label className="block"><span className="mb-2 block text-[11px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Meta description</span><Textarea rows={3} value={draft.seo.description} onChange={(event) => setDraft({ ...draft, seo: { ...draft.seo, description: event.target.value } })} /></label></div></div></div></Card></div></motion.div>;
}

const MODULE_PERMISSION: Record<string, ModuleKey> = {
  dashboard: "dashboard", settings: "settings", pages: "pages", packages: "packages",
  bookings: "bookings", media: "media", blog: "blog", destinations: "destinations",
  guides: "guides", vehicles: "vehicles", customers: "customers", users: "users", analytics: "analytics",
  testimonials: "blog",
};

function Unauthorised({ moduleName, user }: { moduleName: string; user: AdminUser | null }) {
  // Show the actual identity the permission check evaluated. Without this a
  // stale session or an un-migrated role value looks like an unexplained lockout.
  const role = user ? (user.isRoot ? "root" : String(user.role)) : "not signed in";
  const known = user ? ROLES.includes(user.role) : false;
  return (
    <EmptyState
      icon={Lock}
      title="You do not have access to this module"
      description={`Your role (${role}) does not include ${moduleName}. Contact the Root Super Admin if you need this permission.`}
      action={
        <div className="space-y-3 text-left">
          {user && !known && (
            <p className="max-w-md text-[12px] leading-relaxed text-amber-400">
              This account carries an unrecognised role. Run
              <code className="mx-1 rounded bg-[var(--admin-surface-2)] px-1.5 py-0.5 text-[11px]">supabase/role_canonicalization.sql</code>
              in Supabase, then sign out and in again.
            </p>
          )}
          <Button variant="outline" onClick={() => { void store.actions.refreshCurrentUser(); }}>
            Reload my permissions
          </Button>
        </div>
      }
    />
  );
}

export default function AdminApp() {
  const [path, setPath] = useState(getCurrentAdminPath());
  const currentModule = moduleFromPath(path);
  const currentUserId = useStore((state) => state.currentUserId);
  const users = useStore((state) => state.users);
  const user = currentUserId ? users.find((u) => u.id === currentUserId) ?? null : null;

  const navigate = (next: string) => {
    const hashPath = next.startsWith("/") ? `#${next}` : next;
    window.location.hash = hashPath.replace(/^#/, "");
    setPath(next);
  };

  useEffect(() => {
    const handler = () => setPath(getCurrentAdminPath());
    window.addEventListener("hashchange", handler);
    window.addEventListener("popstate", handler);
    return () => {
      window.removeEventListener("hashchange", handler);
      window.removeEventListener("popstate", handler);
    };
  }, []);

  const content = useMemo(() => {
    const permKey = MODULE_PERMISSION[currentModule];
    if (user && permKey && !can(user, permKey, "view")) {
      return <Unauthorised moduleName={currentModule} user={user} />;
    }
    if (currentModule === "dashboard") return <Dashboard />;
    if (currentModule === "settings") return <SettingsManager />;
    if (currentModule === "pages") return <PagesManager />;
    if (currentModule === "packages") return <PackagesManager />;
    if (currentModule === "bookings") return <BookingsManager />;
    if (currentModule === "media") return <MediaManager />;
    if (currentModule === "blog") return <BlogManager />;
    if (currentModule === "testimonials") return <TestimonialsManager />;
    if (currentModule === "destinations") return <DestinationsManager />;
    if (currentModule === "guides") return <GuidesManager />;
    if (currentModule === "vehicles") return <VehiclesManager />;
    if (currentModule === "customers") return <CustomersManager />;
    if (currentModule === "users") return <UsersManager />;
    if (currentModule === "analytics") return <AnalyticsDashboard />;
    return <Dashboard />;
  }, [currentModule, user]);

  return <><AdminLayout currentModule={currentModule} onNavigate={navigate}>{content}</AdminLayout><ToastContainer /></>;
}
