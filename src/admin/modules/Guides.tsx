import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, MapPin, Star, Languages, Calendar, Search, Trash2 } from "lucide-react";
import { store, useStore } from "../store";
import { Button, Card, Input, Textarea, Badge, Modal, ConfirmDialog, PageHeader, EmptyState, Avatar } from "../ui";
import type { Guide } from "../types";

function GuideEditor({ guide, onClose }: { guide: Guide | null; onClose: () => void }) {
  const [form, setForm] = useState<Partial<Guide>>(guide ?? {
    name: "", title: "", bio: "", portrait: "", gallery: [], languages: [], speciality: "",
    yearsInField: 0, locations: [], rating: 5, assignments: 0, availability: {}, status: "active",
    email: "", phone: "",
  });
  const update = <K extends keyof Guide>(key: K, value: Guide[K]) => setForm((current) => ({ ...current, [key]: value }));
  const save = () => {
    if (!form.name) { store.notify({ type: "error", title: "Name required" }); return; }
    if (guide) store.actions.updateGuide(guide.id, form);
    else store.actions.createGuide(form as Omit<Guide, "id" | "createdAt" | "slug">);
    onClose();
  };

  return (
    <Modal open onClose={onClose} size="lg" title={guide ? `Edit ${guide.name}` : "New Guide"} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button onClick={save}>{guide ? "Save changes" : "Add guide"}</Button>
    </>}>
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Full Name *</span><Input value={form.name} onChange={(e) => update("name", e.target.value)} /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Title</span><Input value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Senior Safari Guide" /></label>
        </div>
        <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Portrait URL</span><Input value={form.portrait} onChange={(e) => update("portrait", e.target.value)} /></label>
        <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Bio</span><Textarea rows={4} value={form.bio} onChange={(e) => update("bio", e.target.value)} /></label>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Speciality</span><Input value={form.speciality} onChange={(e) => update("speciality", e.target.value)} /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Years in Field</span><Input type="number" value={form.yearsInField} onChange={(e) => update("yearsInField", Number(e.target.value))} /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Rating</span><Input type="number" step="0.1" value={form.rating} onChange={(e) => update("rating", Number(e.target.value))} /></label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Languages (comma-separated)</span><Input value={form.languages?.join(", ")} onChange={(e) => update("languages", e.target.value.split(",").map((l) => l.trim()).filter(Boolean))} /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Locations (comma-separated)</span><Input value={form.locations?.join(", ")} onChange={(e) => update("locations", e.target.value.split(",").map((l) => l.trim()).filter(Boolean))} /></label>
        </div>
      </div>
    </Modal>
  );
}

export default function GuidesManager() {
  const guides = useStore((state) => state.guides);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Guide | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Guide | null>(null);

  const filtered = guides.filter((g) => !search || g.name.toLowerCase().includes(search.toLowerCase()) || g.speciality.toLowerCase().includes(search.toLowerCase()));

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <PageHeader eyebrow="Operations" title="Guides" description="Manage your team of expert East African naturalists." actions={<Button icon={Plus} onClick={() => setShowNew(true)}>New Guide</Button>} />

      <div className="mb-6"><Input icon={Search} placeholder="Search guides..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>

      {filtered.length === 0 ? (
        <EmptyState icon={Star} title="No guides found" action={<Button icon={Plus} onClick={() => setShowNew(true)}>Add Guide</Button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((guide) => (
            <Card key={guide.id} hoverable onClick={() => setEditing(guide)} className="!p-5">
              <div className="flex items-start gap-4">
                <Avatar src={guide.portrait} name={guide.name} size={64} />
                <div className="flex-1 min-w-0">
                  <h3 className="font-serif text-lg font-light">{guide.name}</h3>
                  <p className="text-[11px] text-[var(--admin-fg-muted)]">{guide.title}</p>
                  <div className="mt-2 flex items-center gap-3 text-[10.5px] text-[var(--admin-fg-muted)]">
                    <span className="flex items-center gap-1"><Star size={11} className="text-amber-400" />{guide.rating}</span>
                    <span className="flex items-center gap-1"><Calendar size={11} />{guide.yearsInField}y</span>
                    <span className="flex items-center gap-1"><Languages size={11} />{guide.languages.length}</span>
                  </div>
                </div>
                <Badge variant={guide.status === "active" ? "success" : "neutral"} dot>{guide.status}</Badge>
              </div>
              <p className="mt-4 line-clamp-3 text-[12px] leading-relaxed text-[var(--admin-fg-muted)]">{guide.bio}</p>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {guide.locations.map((loc) => <span key={loc} className="rounded-full bg-[var(--admin-surface-2)] px-2 py-0.5 text-[10px]"><MapPin size={9} className="mr-0.5 inline" />{loc}</span>)}
                </div>
                <button
                  onClick={(event) => { event.stopPropagation(); setConfirmDelete(guide); }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--admin-fg-muted)] transition-colors hover:bg-red-500/10 hover:text-red-400"
                  aria-label={`Remove ${guide.name}`}
                  title="Remove guide"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && <GuideEditor guide={editing} onClose={() => setEditing(null)} />}
      {showNew && <GuideEditor guide={null} onClose={() => setShowNew(false)} />}
      {confirmDelete && (
        <ConfirmDialog
          open
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => { void store.actions.deleteGuide(confirmDelete.id); setConfirmDelete(null); }}
          title={`Remove ${confirmDelete.name}?`}
          description="The guide is archived and removed from the CMS and website. Existing bookings keep their assignment record."
          confirmLabel="Remove guide"
        />
      )}
    </motion.div>
  );
}
