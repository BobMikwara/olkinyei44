import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Download, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { store, useStore } from "../store";
import { Button, Card, Input, Select, Badge, Modal, ConfirmDialog, PageHeader, Tabs, DataTable, Avatar } from "../ui";
import type { Booking, BookingStatus } from "../types";

const PAGE_SIZE = 10;

const STATUS_COLORS: Record<BookingStatus, { variant: "success" | "warning" | "danger" | "info" | "neutral"; label: string }> = {
  "New": { variant: "info", label: "New Request" },
  "In planning": { variant: "warning", label: "In Planning" },
  "Confirmed": { variant: "success", label: "Confirmed" },
  "Completed": { variant: "success", label: "Completed" },
  "Cancelled": { variant: "danger", label: "Cancelled" },
  "Refunded": { variant: "neutral", label: "Refunded" },
};

function BookingDetail({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const guides = useStore((state) => state.guides);
  const vehicles = useStore((state) => state.vehicles);
  const currentUserId = useStore((state) => state.currentUserId);
  const users = useStore((state) => state.users);
  const actor = currentUserId ? users.find((u) => u.id === currentUserId) : null;
  const isRootAdmin = Boolean(actor?.isRoot || actor?.role === "root");
  const [form, setForm] = useState<Partial<Booking>>(booking);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = () => {
    store.actions.updateBooking(booking.id, form);
    onClose();
  };

  return (
    <Modal open onClose={onClose} size="xl" title={booking.reference} description={`${booking.safari} · ${booking.name}`} footer={<>
      {isRootAdmin && <Button variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)}>Delete</Button>}
      <div className="flex-1" />
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button onClick={save}>Save changes</Button>
    </>}>
      <div className="grid gap-6 lg:grid-cols-[1fr_.85fr]">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Status</span>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as BookingStatus })}>
                <option>New</option><option>In planning</option><option>Confirmed</option><option>Completed</option><option>Cancelled</option><option>Refunded</option>
              </Select>
            </label>
            <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Payment Status</span>
              <Select value={form.paymentStatus} onChange={(e) => setForm({ ...form, paymentStatus: e.target.value as Booking["paymentStatus"] })}>
                <option>Pending</option><option>Deposit</option><option>Paid</option><option>Refunded</option>
              </Select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Assigned Guide</span>
              <Select value={form.assignedGuideId ?? ""} onChange={(e) => setForm({ ...form, assignedGuideId: e.target.value || undefined })}>
                <option value="">Unassigned</option>
                {guides.map((g) => <option key={g.id} value={g.id}>{g.name} — {g.speciality}</option>)}
              </Select>
            </label>
            <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Assigned Vehicle</span>
              <Select value={form.assignedVehicleId ?? ""} onChange={(e) => setForm({ ...form, assignedVehicleId: e.target.value || undefined })}>
                <option value="">Unassigned</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.fleetCode} — {v.model}</option>)}
              </Select>
            </label>
          </div>

          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Internal Notes</span>
            <textarea className="w-full rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface-2)] px-3 py-2 text-[13px] text-[var(--admin-fg)] focus:border-[var(--admin-accent)] focus:outline-none" rows={5} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Private notes visible only to staff..." />
          </label>
        </div>

        <div className="space-y-4">
          <Card className="!p-4">
            <h3 className="mb-3 font-serif text-lg font-light">Guest</h3>
            <div className="space-y-2 text-[12.5px]">
              <p className="font-medium">{booking.name}</p>
              <p className="text-[var(--admin-fg-muted)]">{booking.email}</p>
              <p className="text-[var(--admin-fg-muted)]">{booking.phone}</p>
            </div>
          </Card>

          <Card className="!p-4">
            <h3 className="mb-3 font-serif text-lg font-light">Journey</h3>
            <div className="space-y-2 text-[12.5px]">
              <p><strong className="font-medium">Safari:</strong> {booking.safari}</p>
              <p><strong className="font-medium">Dates:</strong> {booking.startDate} → {booking.endDate}</p>
              <p><strong className="font-medium">Party:</strong> {booking.adults} adults, {booking.children} children</p>
              <p><strong className="font-medium">Accommodation:</strong> {booking.accommodation}</p>
              <p><strong className="font-medium">Budget:</strong> {booking.budget}</p>
            </div>
          </Card>

          {booking.requests && <Card className="!p-4">
            <h3 className="mb-3 font-serif text-lg font-light">Special Requests</h3>
            <p className="text-[12.5px] leading-relaxed text-[var(--admin-fg-muted)]">{booking.requests}</p>
          </Card>}
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => { store.actions.deleteBooking(booking.id); setConfirmDelete(false); onClose(); }}
        title={`Delete ${booking.reference}?`}
        description="This permanently removes the booking from the CMS and the shared database. Only the Root Super Admin can delete bookings."
        confirmLabel="Delete permanently"
      />
    </Modal>
  );
}

export default function BookingsManager() {
  const bookings = useStore((state) => state.bookings);
  const guides = useStore((state) => state.guides);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | BookingStatus>("all");
  const [selected, setSelected] = useState<Booking | null>(null);
  const [page, setPage] = useState(1);
  const [realtime, setRealtime] = useState(false);

  // Ingest pipeline: pull every source on mount, connect Realtime, and poll
  // as a fallback whenever the realtime channel is unavailable.
  useEffect(() => {
    store.actions.markBookingsSeen();
    // Initial catalog pull is quiet; every arrival after that announces itself.
    void store.actions.syncBookings({ bootstrap: true });
    const connected = store.actions.ensureBookingsRealtime();
    setRealtime(connected);
    const poll = window.setInterval(() => {
      if (!store.actions.realtimeIsConnected()) {
        void store.actions.syncBookings();
      }
    }, 45_000);
    return () => window.clearInterval(poll);
  }, []);

  useEffect(() => { setPage(1); }, [search, filter]);

  const filtered = useMemo(() => bookings.filter((b) => {
    if (filter !== "all" && b.status !== filter) return false;
    if (search && !b.reference.toLowerCase().includes(search.toLowerCase()) && !b.name.toLowerCase().includes(search.toLowerCase()) && !b.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [bookings, filter, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const counts = {
    all: bookings.length,
    New: bookings.filter((b) => b.status === "New").length,
    "In planning": bookings.filter((b) => b.status === "In planning").length,
    Confirmed: bookings.filter((b) => b.status === "Confirmed").length,
    Completed: bookings.filter((b) => b.status === "Completed").length,
    Cancelled: bookings.filter((b) => b.status === "Cancelled").length,
  };

  const exportCSV = () => {
    const headers = ["Reference", "Name", "Email", "Phone", "Safari", "Start", "End", "Adults", "Children", "Status", "Payment", "Amount"];
    const rows = filtered.map((b) => [b.reference, b.name, b.email, b.phone, b.safari, b.startDate, b.endDate, b.adults, b.children, b.status, b.paymentStatus, b.paymentAmount ?? 0]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `olkinyei-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    store.notify({ type: "success", title: "Exported", message: `${filtered.length} bookings exported to CSV.` });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <PageHeader eyebrow="Operations" title="Bookings" description="Manage booking requests, assign guides, and track revenue." actions={<>
        <Badge variant={realtime ? "success" : "neutral"} dot>{realtime ? "Live" : "Syncing"}</Badge>
        <Button variant="outline" icon={Download} onClick={exportCSV}>Export CSV</Button>
      </>} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="!p-4"><p className="text-[10.5px] uppercase tracking-wider text-[var(--admin-fg-muted)]">New Requests</p><p className="mt-2 font-serif text-2xl font-light">{counts.New}</p></Card>
        <Card className="!p-4"><p className="text-[10.5px] uppercase tracking-wider text-[var(--admin-fg-muted)]">In Planning</p><p className="mt-2 font-serif text-2xl font-light">{counts["In planning"]}</p></Card>
        <Card className="!p-4"><p className="text-[10.5px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Confirmed</p><p className="mt-2 font-serif text-2xl font-light">{counts.Confirmed}</p></Card>
        <Card className="!p-4"><p className="text-[10.5px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Available Guides</p><p className="mt-2 font-serif text-2xl font-light">{guides.filter((g) => g.status === "active").length}</p></Card>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]"><Input icon={Search} placeholder="Search by reference, name, or email..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <Tabs tabs={[{ id: "all", label: "All", count: counts.all }, { id: "New", label: "New", count: counts.New }, { id: "In planning", label: "Planning", count: counts["In planning"] }, { id: "Confirmed", label: "Confirmed", count: counts.Confirmed }]} value={filter} onChange={(id) => setFilter(id as typeof filter)} />
      </div>

      <DataTable
        data={paged}
        onRowClick={setSelected}
        columns={[
          { key: "reference", label: "Reference", render: (b) => <div><p className="font-mono text-[12px] font-medium">{b.reference}</p><p className="text-[10.5px] text-[var(--admin-fg-muted)]">{new Date(b.createdAt).toLocaleDateString()}</p></div> },
          { key: "name", label: "Guest", render: (b) => <div className="flex items-center gap-2.5"><Avatar name={b.name} size={32} /><div><p className="text-[12.5px] font-medium">{b.name}</p><p className="text-[10.5px] text-[var(--admin-fg-muted)]">{b.email}</p></div></div> },
          { key: "safari", label: "Safari", render: (b) => <div><p className="text-[12.5px] font-medium">{b.safari}</p><p className="text-[10.5px] text-[var(--admin-fg-muted)]">{b.startDate} → {b.endDate}</p></div> },
          { key: "party", label: "Party", render: (b) => <span className="text-[12px]">{b.adults + b.children} guests</span> },
          { key: "status", label: "Status", render: (b) => <Badge variant={STATUS_COLORS[b.status].variant} dot>{STATUS_COLORS[b.status].label}</Badge> },
          { key: "amount", label: "Amount", render: (b) => <div className="text-right"><p className="text-[12.5px] font-medium">{b.paymentAmount ? `$${b.paymentAmount.toLocaleString()}` : "—"}</p><p className="text-[10.5px] text-[var(--admin-fg-muted)]">{b.paymentStatus}</p></div> },
        ]}
      />

      <div className="mt-4 flex items-center justify-between text-[11.5px] text-[var(--admin-fg-muted)]">
        <span>
          Showing {filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length} bookings
        </span>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} icon={ChevronLeft}>Previous</Button>
          <span className="px-2">Page {safePage} of {pageCount}</span>
          <Button variant="outline" size="sm" disabled={safePage >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} icon={ChevronRight}>Next</Button>
        </div>
      </div>

      {selected && <BookingDetail booking={selected} onClose={() => setSelected(null)} />}
    </motion.div>
  );
}
