import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Truck, AlertCircle, Search, Trash2 } from "lucide-react";
import { store, useStore } from "../store";
import { Button, Card, Input, Textarea, Select, Badge, Modal, ConfirmDialog, PageHeader, EmptyState } from "../ui";
import type { Vehicle } from "../types";

const STATUS_COLORS: Record<Vehicle["status"], "success" | "warning" | "danger" | "info"> = {
  Ready: "success", "In field": "info", "Service due": "warning", Unavailable: "danger",
};

function VehicleEditor({ vehicle, onClose }: { vehicle: Vehicle | null; onClose: () => void }) {
  const [form, setForm] = useState<Partial<Vehicle>>(vehicle ?? {
    fleetCode: "", model: "", type: "Land Cruiser", base: "", capacity: 6, status: "Ready",
    lastService: "", nextService: "", insurance: "", mileage: 0, notes: "",
  });
  const update = <K extends keyof Vehicle>(key: K, value: Vehicle[K]) => setForm((current) => ({ ...current, [key]: value }));
  const save = () => {
    if (!form.fleetCode) { store.notify({ type: "error", title: "Fleet code required" }); return; }
    if (vehicle) store.actions.updateVehicle(vehicle.id, form);
    else store.actions.createVehicle(form as Omit<Vehicle, "id" | "createdAt">);
    onClose();
  };

  return (
    <Modal open onClose={onClose} size="lg" title={vehicle ? `Edit ${vehicle.fleetCode}` : "New Vehicle"} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button onClick={save}>{vehicle ? "Save" : "Add"}</Button>
    </>}>
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Fleet Code *</span><Input value={form.fleetCode} onChange={(e) => update("fleetCode", e.target.value)} placeholder="OLK-01" /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Model</span><Input value={form.model} onChange={(e) => update("model", e.target.value)} /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Type</span><Select value={form.type} onChange={(e) => update("type", e.target.value as Vehicle["type"])}><option>Land Cruiser</option><option>Photography Vehicle</option><option>Minibus</option><option>Boat</option><option>Light Aircraft</option></Select></label>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Base</span><Input value={form.base} onChange={(e) => update("base", e.target.value)} /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Capacity</span><Input type="number" value={form.capacity} onChange={(e) => update("capacity", Number(e.target.value))} /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Status</span><Select value={form.status} onChange={(e) => update("status", e.target.value as Vehicle["status"])}><option>Ready</option><option>In field</option><option>Service due</option><option>Unavailable</option></Select></label>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Mileage (km)</span><Input type="number" value={form.mileage} onChange={(e) => update("mileage", Number(e.target.value))} /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Last Service</span><Input type="date" value={form.lastService} onChange={(e) => update("lastService", e.target.value)} /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Next Service</span><Input type="date" value={form.nextService} onChange={(e) => update("nextService", e.target.value)} /></label>
        </div>
        <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Insurance</span><Input value={form.insurance} onChange={(e) => update("insurance", e.target.value)} /></label>
        <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Notes</span><Textarea rows={3} value={form.notes} onChange={(e) => update("notes", e.target.value)} /></label>
      </div>
    </Modal>
  );
}

export default function VehiclesManager() {
  const vehicles = useStore((state) => state.vehicles);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Vehicle | null>(null);

  const filtered = vehicles.filter((v) => !search || v.fleetCode.toLowerCase().includes(search.toLowerCase()) || v.model.toLowerCase().includes(search.toLowerCase()));
  const counts = { Ready: vehicles.filter((v) => v.status === "Ready").length, "In field": vehicles.filter((v) => v.status === "In field").length, "Service due": vehicles.filter((v) => v.status === "Service due").length };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <PageHeader eyebrow="Operations" title="Vehicles" description="Manage your safari fleet, maintenance, and assignments." actions={<Button icon={Plus} onClick={() => setShowNew(true)}>New Vehicle</Button>} />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card className="!p-4"><p className="text-[10.5px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Ready</p><p className="mt-2 font-serif text-2xl font-light text-emerald-400">{counts.Ready}</p></Card>
        <Card className="!p-4"><p className="text-[10.5px] uppercase tracking-wider text-[var(--admin-fg-muted)]">In Field</p><p className="mt-2 font-serif text-2xl font-light text-blue-400">{counts["In field"]}</p></Card>
        <Card className="!p-4"><p className="text-[10.5px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Service Due</p><p className="mt-2 font-serif text-2xl font-light text-amber-400">{counts["Service due"]}</p></Card>
      </div>

      <div className="mb-6"><Input icon={Search} placeholder="Search fleet..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>

      {filtered.length === 0 ? (
        <EmptyState icon={Truck} title="No vehicles found" action={<Button icon={Plus} onClick={() => setShowNew(true)}>Add Vehicle</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((vehicle) => (
            <Card key={vehicle.id} hoverable onClick={() => setEditing(vehicle)} className="!p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--admin-surface-2)]"><Truck size={16} className="text-[var(--admin-accent)]" /></div>
                    <div>
                      <h3 className="font-serif text-lg font-light">{vehicle.fleetCode}</h3>
                      <p className="text-[11px] text-[var(--admin-fg-muted)]">{vehicle.model}</p>
                    </div>
                  </div>
                </div>
                <Badge variant={STATUS_COLORS[vehicle.status]} dot>{vehicle.status}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                <div><span className="text-[var(--admin-fg-muted)]">Type:</span> <span>{vehicle.type}</span></div>
                <div><span className="text-[var(--admin-fg-muted)]">Base:</span> <span>{vehicle.base}</span></div>
                <div><span className="text-[var(--admin-fg-muted)]">Capacity:</span> <span>{vehicle.capacity}</span></div>
                <div><span className="text-[var(--admin-fg-muted)]">Mileage:</span> <span>{vehicle.mileage.toLocaleString()} km</span></div>
              </div>
              {vehicle.status === "Service due" && <div className="mt-3 flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-[10.5px] text-amber-400"><AlertCircle size={12} />Service overdue</div>}
              <div className="mt-3 flex justify-end border-t border-[var(--admin-border)] pt-3">
                <button
                  onClick={(event) => { event.stopPropagation(); setConfirmDelete(vehicle); }}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--admin-fg-muted)] transition-colors hover:bg-red-500/10 hover:text-red-400"
                  aria-label={`Remove ${vehicle.fleetCode}`}
                  title="Remove vehicle"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && <VehicleEditor vehicle={editing} onClose={() => setEditing(null)} />}
      {showNew && <VehicleEditor vehicle={null} onClose={() => setShowNew(false)} />}
      {confirmDelete && (
        <ConfirmDialog
          open
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => { void store.actions.deleteVehicle(confirmDelete.id); setConfirmDelete(null); }}
          title={`Remove ${confirmDelete.fleetCode}?`}
          description="The vehicle is archived and removed from the active fleet. Existing bookings keep their assignment record."
          confirmLabel="Remove vehicle"
        />
      )}
    </motion.div>
  );
}
