import { useState } from "react";
import { motion } from "framer-motion";
import { Search, MapPin, Globe, DollarSign, Heart, Edit3, Trash2, User as UserIcon, Shield } from "lucide-react";
import { store, useStore } from "../store";
import { ASSIGNABLE_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from "../constants";
import { hasCloudBackend } from "../../lib/supabase";
import { Button, Card, Input, Textarea, Select, Badge, Modal, PageHeader, Tabs, Avatar, BarChart, StatCard } from "../ui";
import type { Customer, Destination, AdminUser, Role } from "../types";

// ============ Customers ============

function CustomerEditor({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [form, setForm] = useState<Customer>(customer);
  const save = () => { store.actions.updateCustomer(customer.id, form); onClose(); };
  return (
    <Modal open onClose={onClose} size="lg" title={customer.name} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button onClick={save}>Save changes</Button>
    </>}>
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Name</span><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Email</span><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Phone</span><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Country</span><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></label>
        </div>
        <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Internal Notes</span><Textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Tags (comma-separated)</span><Input value={form.tags.join(", ")} onChange={(e) => setForm({ ...form, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} /></label>
      </div>
    </Modal>
  );
}

export function CustomersManager() {
  const customers = useStore((state) => state.customers);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null);
  const filtered = customers.filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase()));

  const tierColors: Record<Customer["lifetimeValue"], "accent" | "success" | "warning" | "info" | "neutral"> = {
    Platinum: "accent", Gold: "warning", Silver: "info", Bronze: "neutral", New: "neutral",
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <PageHeader eyebrow="Operations" title="Customers" description="Guest profiles, booking history, and lifetime value." />

      <div className="mb-6"><Input icon={Search} placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => (
          <Card key={c.id} hoverable onClick={() => setEditing(c)} className="!p-5">
            <div className="flex items-start gap-3">
              <Avatar src={c.avatar} name={c.name} size={52} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-lg font-light">{c.name}</h3>
                  <Badge variant={tierColors[c.lifetimeValue]}>{c.lifetimeValue}</Badge>
                </div>
                <p className="mt-0.5 text-[11px] text-[var(--admin-fg-muted)]">{c.country}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[var(--admin-border)] pt-4 text-center">
              <div><p className="text-[10px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Bookings</p><p className="mt-1 font-serif text-lg font-light">{c.totalBookings}</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Spent</p><p className="mt-1 font-serif text-lg font-light">${Math.round(c.totalSpent / 1000)}k</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Last Trip</p><p className="mt-1 font-serif text-sm font-light">{new Date(c.lastTrip).toLocaleDateString(undefined, { month: "short", year: "2-digit" })}</p></div>
            </div>
            <div className="mt-3 flex justify-end border-t border-[var(--admin-border)] pt-3">
              <button
                onClick={(event) => { event.stopPropagation(); setConfirmDelete(c); }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--admin-fg-muted)] transition-colors hover:bg-red-500/10 hover:text-red-400"
                aria-label={`Remove ${c.name}`}
                title="Remove customer"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </Card>
        ))}
      </div>

      {editing && <CustomerEditor customer={editing} onClose={() => setEditing(null)} />}
      {confirmDelete && (
        <Modal
          open
          onClose={() => setConfirmDelete(null)}
          size="sm"
          title={`Remove ${confirmDelete.name}?`}
          description="The customer profile is archived and removed from this directory. All bookings, invoices, and payment history are preserved."
          footer={<>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { void store.actions.deleteCustomer(confirmDelete.id); setConfirmDelete(null); }}>Remove customer</Button>
          </>}
        ><p /></Modal>
      )}
    </motion.div>
  );
}

// ============ Destinations ============

function DestinationEditor({ destination, onClose }: { destination: Destination | null; onClose: () => void }) {
  const [form, setForm] = useState<Partial<Destination>>(destination ?? {
    name: "", country: "Tanzania", coordinates: [50, 50], bestTime: "", animal: "", image: "",
    gallery: [], description: "", longDescription: "", activities: [], featured: false, published: true,
    seo: { title: "", description: "" },
  });
  const update = <K extends keyof Destination>(key: K, value: Destination[K]) => setForm((current) => ({ ...current, [key]: value }));
  const save = () => {
    if (!form.name) { store.notify({ type: "error", title: "Name required" }); return; }
    if (destination) store.actions.updateDestination(destination.id, form);
    else store.actions.createDestination(form as Omit<Destination, "id" | "createdAt" | "updatedAt" | "slug">);
    onClose();
  };

  return (
    <Modal open onClose={onClose} size="lg" title={destination ? `Edit ${destination.name}` : "New Destination"} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button onClick={save}>{destination ? "Save" : "Create"}</Button>
    </>}>
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Name *</span><Input value={form.name} onChange={(e) => update("name", e.target.value)} /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Country</span><Select value={form.country} onChange={(e) => update("country", e.target.value as Destination["country"])}><option>Kenya</option><option>Tanzania</option></Select></label>
        </div>
        <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Description</span><Textarea rows={3} value={form.description} onChange={(e) => update("description", e.target.value)} /></label>
        <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Long Description</span><Textarea rows={5} value={form.longDescription} onChange={(e) => update("longDescription", e.target.value)} /></label>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Best Time</span><Input value={form.bestTime} onChange={(e) => update("bestTime", e.target.value)} /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Known For</span><Input value={form.animal} onChange={(e) => update("animal", e.target.value)} /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Image URL</span><Input value={form.image} onChange={(e) => update("image", e.target.value)} /></label>
        </div>
        <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" className="accent-[var(--admin-accent)]" checked={form.featured} onChange={(e) => update("featured", e.target.checked)} />Featured</label>
      </div>
    </Modal>
  );
}

export function DestinationsManager() {
  const destinations = useStore((state) => state.destinations);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "Kenya" | "Tanzania">("all");
  const [editing, setEditing] = useState<Destination | null>(null);
  const [showNew, setShowNew] = useState(false);

  const filtered = destinations.filter((d) => {
    if (filter !== "all" && d.country !== filter) return false;
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <PageHeader eyebrow="Content" title="Destinations" description="Manage the parks, reserves, and landscapes across Kenya and Tanzania." actions={<Button icon={MapPin} onClick={() => setShowNew(true)}>New Destination</Button>} />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]"><Input icon={Search} placeholder="Search destinations..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <Tabs tabs={[{ id: "all", label: "All", count: destinations.length }, { id: "Kenya", label: "Kenya", count: destinations.filter((d) => d.country === "Kenya").length }, { id: "Tanzania", label: "Tanzania", count: destinations.filter((d) => d.country === "Tanzania").length }]} value={filter} onChange={(id) => setFilter(id as typeof filter)} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((d) => (
          <Card key={d.id} hoverable onClick={() => setEditing(d)} className="overflow-hidden !p-0">
            <div className="relative aspect-[16/10] overflow-hidden bg-[var(--admin-surface-2)]">
              <img src={d.image} alt={d.name} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <Badge className="absolute left-3 top-3" variant={d.country === "Kenya" ? "accent" : "success"}>{d.country}</Badge>
              <div className="absolute bottom-3 left-3 right-3">
                <h3 className="font-serif text-2xl font-light text-white">{d.name}</h3>
                <p className="text-[11px] text-white/80">Best: {d.bestTime}</p>
              </div>
            </div>
            <div className="p-4">
              <p className="line-clamp-2 text-[12.5px] leading-relaxed text-[var(--admin-fg-muted)]">{d.description}</p>
              <p className="mt-3 text-[10.5px] uppercase tracking-wider text-[var(--admin-accent)]">Known for: {d.animal}</p>
            </div>
          </Card>
        ))}
      </div>

      {editing && <DestinationEditor destination={editing} onClose={() => setEditing(null)} />}
      {showNew && <DestinationEditor destination={null} onClose={() => setShowNew(false)} />}
    </motion.div>
  );
}

// ============ Users ============

function UserEditor({ user, actorIsRoot, onClose }: { user: AdminUser | null; actorIsRoot: boolean; onClose: () => void }) {
  const [form, setForm] = useState<Partial<AdminUser>>(user ?? {
    email: "", fullName: "", role: "content_manager", avatar: "", status: "invited",
  });
  const [busy, setBusy] = useState(false);
  const editingRoot = Boolean(user?.isRoot);
  const save = async () => {
    if (!form.email || !form.fullName) { store.notify({ type: "error", title: "Name and email required" }); return; }
    if (!user) {
      setBusy(true);
      const result = await store.actions.inviteNewUser({
        email: form.email.trim(),
        fullName: form.fullName.trim(),
        role: form.role ?? "content_manager",
      });
      setBusy(false);
      if (result.ok) {
        store.notify(hasCloudBackend
          ? { type: "success", title: "Invitation sent", message: `${form.email} will receive a secure setup link by email.` }
          : { type: "success", title: "Account created", message: "Open their card to generate a device-local setup link." });
        onClose();
      } else if (result.message) {
        store.notify({ type: "error", title: "Could not invite", message: result.message });
      }
      return;
    }
    store.actions.updateUser(user.id, form);
    onClose();
  };
  return (
    <Modal open onClose={onClose} size="md" title={user ? `Edit ${user.fullName}` : "Invite Team Member"} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      {!editingRoot && <Button loading={busy} onClick={() => void save()}>{user ? "Save" : hasCloudBackend ? "Send invitation" : "Create account"}</Button>}
    </>}>
      {editingRoot ? (
        <div className="rounded-lg border border-[var(--admin-accent)]/30 bg-[var(--admin-accent)]/5 p-4 text-[12.5px]">
          <p className="font-medium text-[var(--admin-accent)]">Root Super Admin — protected</p>
          <p className="mt-2 leading-relaxed text-[var(--admin-fg-muted)]">
            The Root Super Admin is issued by the system creators and cannot be edited, demoted, or removed from the CMS.
            Only the Root Super Admin can update its own profile and password from a signed-in session.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Full Name</span><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Email</span><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label className="block">
            <span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Role</span>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {ASSIGNABLE_ROLES
                .filter((role) => role !== "super_admin" || actorIsRoot)
                .map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
            </Select>
            {!actorIsRoot && <span className="mt-1 block text-[10.5px] text-[var(--admin-fg-muted)]">Only the Root Super Admin can create or promote Super Admin accounts.</span>}
          </label>
          <div className="rounded-lg bg-[var(--admin-surface-2)] p-4">
            <div className="mb-2 flex items-center gap-2"><Shield size={14} className="text-[var(--admin-accent)]" /><p className="text-[11px] font-medium uppercase tracking-wider">Role Permissions</p></div>
            <p className="text-[11.5px] leading-relaxed text-[var(--admin-fg-muted)]">{ROLE_DESCRIPTIONS[(form.role ?? "content_manager") as Role]}</p>
          </div>
          {!user && (
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 text-[11.5px] leading-relaxed text-[var(--admin-fg-muted)]">
              After creating this account, generate a single-use setup link from the user card to share with them. They will set their own password on first sign-in.
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export function UsersManager() {
  const users = useStore((state) => state.users);
  const currentUserId = useStore((state) => state.currentUserId);
  const actor = currentUserId ? users.find((u) => u.id === currentUserId) : null;
  const actorIsRoot = Boolean(actor?.isRoot);
  // Only the Root Super Admin manages the staff directory.
  const canManage = actorIsRoot;

  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);

  const statusColors: Record<AdminUser["status"], "success" | "warning" | "danger"> = {
    active: "success", invited: "warning", suspended: "danger",
  };

  // Supabase Auth owns every invitation and reset token. Administrators only
  // trigger the email — they never see or copy raw links.
  const sendInvitation = async (user: AdminUser) => {
    const result = await store.actions.createInvitation(user.id);
    if (!result.ok && result.message) {
      store.notify({ type: "error", title: "Invitation failed", message: result.message });
    }
  };

  const sendPasswordReset = async (user: AdminUser) => {
    if (!hasCloudBackend) {
      store.notify({ type: "error", title: "Cloud required", message: "Connect the Supabase cloud database to send reset emails." });
      return;
    }
    const { authRequestPasswordReset } = await import("../auth");
    await authRequestPasswordReset(user.email);
    store.notify({ type: "success", title: "Reset email sent", message: `${user.email} will receive a secure reset link by email.` });
  };

  const manageUser = async (action: "suspend" | "reactivate" | "delete", target: AdminUser) => {
    if (hasCloudBackend) {
      const { authManageUser } = await import("../auth");
      const result = await authManageUser(action, { userId: target.id });
      if (!result.ok) { store.notify({ type: "error", title: "Action failed", message: result.message }); return; }
    }
    if (action === "suspend") store.actions.suspendUser(target.id);
    if (action === "reactivate") store.actions.reactivateUser(target.id);
    if (action === "delete") store.actions.deleteUser(target.id);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <PageHeader eyebrow="System" title="Team & Roles" description="The Root Super Admin controls user provisioning. Members receive one-time setup links to activate accounts." actions={canManage ? <Button onClick={() => setShowNew(true)}>New account</Button> : undefined} />

      <div className="mb-6 rounded-lg border border-[var(--admin-accent)]/30 bg-[var(--admin-accent)]/5 p-4 text-[12.5px] leading-relaxed">
        <div className="flex items-start gap-3">
          <Shield size={16} className="mt-0.5 text-[var(--admin-accent)]" />
          <div>
            <p className="font-medium">Invitation-based provisioning</p>
            <p className="mt-1 text-[var(--admin-fg-muted)]">Only the Root Super Admin can create new accounts. Users cannot self-register. Every account starts inactive until it is issued a single-use invitation link and the recipient sets a strong password.</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {users.map((user) => {
          const isProtected = user.isRoot;
          const isSelf = user.id === currentUserId;
          const cannotDelete = isProtected || isSelf || (user.role === "super_admin" && !actorIsRoot);
          return (
            <Card key={user.id} className="!p-4">
              <div className="flex items-center gap-4">
                <Avatar src={user.avatar} name={user.fullName} size={48} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-serif text-lg font-light">{user.fullName}</h3>
                    <Badge variant={statusColors[user.status]} dot>{user.status}</Badge>
                    {isProtected && <Badge variant="accent" dot>Root</Badge>}
                    {user.status === "invited" && <Badge variant="info" dot>Invitation pending</Badge>}
                    {user.mustChangePassword && !isProtected && <Badge variant="warning" dot>Must set password</Badge>}
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-[var(--admin-fg-muted)]">{user.email}</p>
                </div>
                <div className="text-right">
                  <Badge variant={isProtected ? "accent" : "neutral"}>{user.role.replace(/_/g, " ")}</Badge>
                  <p className="mt-1 text-[10px] text-[var(--admin-fg-muted)]">{user.lastLogin ? `Last sign-in ${new Date(user.lastLogin).toLocaleDateString()}` : "Never signed in"}</p>
                </div>
                <div className="flex items-center gap-1">
                  {canManage && !isProtected && (user.status === "invited" || user.mustChangePassword) && <Button variant="outline" size="sm" onClick={() => sendInvitation(user)}>Send invitation</Button>}
                  {canManage && !isProtected && user.status === "active" && <Button variant="ghost" size="sm" onClick={() => sendPasswordReset(user)}>Reset password</Button>}
                  {canManage && !isProtected && user.status === "suspended" && <Button variant="ghost" size="sm" onClick={() => manageUser("reactivate", user)}>Reactivate</Button>}
                  {canManage && !isProtected && user.status === "active" && !isSelf && <Button variant="ghost" size="sm" onClick={() => manageUser("suspend", user)}>Suspend</Button>}
                  <Button variant="ghost" size="icon" onClick={() => setEditing(user)} aria-label="Edit"><Edit3 size={13} /></Button>
                  {canManage && !cannotDelete && <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(user)} aria-label="Delete"><Shield size={13} /></Button>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {editing && <UserEditor user={editing} actorIsRoot={actorIsRoot} onClose={() => setEditing(null)} />}
      {showNew && <UserEditor user={null} actorIsRoot={actorIsRoot} onClose={() => setShowNew(false)} />}
      {confirmDelete && (
        <Modal open onClose={() => setConfirmDelete(null)} size="sm" title={`Remove ${confirmDelete.fullName}?`} description="This permanently deletes the account. The user will immediately lose access." footer={<>
          <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => { void manageUser("delete", confirmDelete); setConfirmDelete(null); }}>Remove account</Button>
        </>}><p /></Modal>
      )}
    </motion.div>
  );
}

// ============ Analytics ============

export function AnalyticsDashboard() {
  const bookings = useStore((state) => state.bookings);
  const customers = useStore((state) => state.customers);
  const packages = useStore((state) => state.packages);

  const revenue = bookings.reduce((sum, b) => sum + (b.paymentAmount ?? 0), 0);
  const confirmed = bookings.filter((b) => b.status === "Confirmed" || b.status === "Completed").length;
  const conversionRate = bookings.length > 0 ? Math.round((confirmed / bookings.length) * 100) : 0;

  const countries = customers.reduce((acc, c) => {
    acc[c.country] = (acc[c.country] ?? 0) + c.totalBookings;
    return acc;
  }, {} as Record<string, number>);
  const countryData = Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([country, value]) => ({ label: country.slice(0, 3).toUpperCase(), value }));

  const revenueChart = [
    { label: "Jan", value: 21000, secondary: 15000 }, { label: "Feb", value: 31500, secondary: 22000 },
    { label: "Mar", value: 27400, secondary: 19200 }, { label: "Apr", value: 42800, secondary: 30100 },
    { label: "May", value: 48200, secondary: 35600 }, { label: "Jun", value: 57900, secondary: 39100 },
    { label: "Jul", value: 72300, secondary: 52400 }, { label: "Aug", value: 68100, secondary: 49800 },
  ];

  const popularPackages = packages.slice(0, 5).map((p, i) => ({
    rank: i + 1,
    title: p.title,
    bookings: Math.floor(Math.random() * 40) + 10,
    revenue: Math.floor(Math.random() * 200000) + 50000,
  })).sort((a, b) => b.revenue - a.revenue);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <PageHeader eyebrow="Insights" title="Analytics" description="Revenue, bookings, and customer insights across all channels." />

      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Revenue" value={`$${Math.round(revenue / 1000)}k`} change="+12.4%" icon={DollarSign} accent="#c8744c" />
        <StatCard label="Bookings" value={String(bookings.length)} change="+18%" icon={Globe} accent="#d8b06b" />
        <StatCard label="Conversion Rate" value={`${conversionRate}%`} change="+2.1%" icon={Heart} accent="#82906e" />
        <StatCard label="Active Customers" value={String(customers.length)} change="+6" icon={UserIcon} accent="#708da1" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <div className="mb-7 flex items-center justify-between">
            <div><h2 className="font-serif text-2xl font-light">Revenue trend</h2><p className="mt-1 text-xs text-[var(--admin-fg-muted)]">Monthly revenue vs. previous year</p></div>
            <div className="flex items-center gap-3 text-[10.5px]">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--admin-accent)]" />This year</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--admin-accent)]/30" />Last year</span>
            </div>
          </div>
          <BarChart data={revenueChart} height={240} />
        </Card>

        <Card className="p-5">
          <h2 className="mb-5 font-serif text-2xl font-light">By country</h2>
          <BarChart data={countryData} height={240} />
        </Card>
      </div>

      <Card className="mt-5 p-5">
        <h2 className="mb-4 font-serif text-2xl font-light">Top performing packages</h2>
        <div className="space-y-2">
          {popularPackages.map((pkg) => (
            <div key={pkg.rank} className="flex items-center gap-4 border-b border-[var(--admin-border)] py-3 last:border-0">
              <span className="font-serif text-2xl font-light text-[var(--admin-accent)]">#{pkg.rank}</span>
              <div className="flex-1"><p className="font-medium">{pkg.title}</p><p className="text-[11px] text-[var(--admin-fg-muted)]">{pkg.bookings} bookings</p></div>
              <p className="font-serif text-lg font-light">${Math.round(pkg.revenue / 1000)}k</p>
            </div>
          ))}
        </div>
      </Card>
    </motion.div>
  );
}
