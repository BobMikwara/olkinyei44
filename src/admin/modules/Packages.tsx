import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Edit3, Copy, Archive, Search, Package, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { store, useStore } from "../store";
import { Button, Card, Input, Textarea, Select, Badge, Modal, ConfirmDialog, PageHeader, EmptyState, Tabs } from "../ui";
import type { SafariPackage } from "../types";

function PackageCard({ pkg, onEdit, onDuplicate, onDelete, onTogglePublish }: {
  pkg: SafariPackage;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onTogglePublish: () => void;
}) {
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="group">
      <Card hoverable className="flex h-full flex-col overflow-hidden !p-0">
        <div className="relative aspect-[16/10] overflow-hidden bg-[var(--admin-surface-2)]">
          <img src={pkg.image} alt={pkg.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute left-3 top-3 flex gap-1.5">
            {pkg.featured && <Badge variant="accent" dot>Featured</Badge>}
            <Badge variant={pkg.published ? "success" : "neutral"} dot>{pkg.published ? "Live" : "Draft"}</Badge>
          </div>
          <div className="absolute right-3 top-3 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button onClick={onEdit} className="flex h-8 w-8 items-center justify-center rounded-md bg-black/40 text-white backdrop-blur-sm hover:bg-black/60" aria-label="Edit"><Edit3 size={13} /></button>
            <button onClick={onDuplicate} className="flex h-8 w-8 items-center justify-center rounded-md bg-black/40 text-white backdrop-blur-sm hover:bg-black/60" aria-label="Duplicate"><Copy size={13} /></button>
            <button onClick={onDelete} className="flex h-8 w-8 items-center justify-center rounded-md bg-black/40 text-red-300 backdrop-blur-sm hover:bg-red-500/60 hover:text-white" aria-label="Archive"><Archive size={13} /></button>
          </div>
          <div className="absolute bottom-3 left-3 right-3">
            <h3 className="font-serif text-xl font-light text-white">{pkg.title}</h3>
            <p className="mt-0.5 text-[11px] text-white/80">{pkg.region}</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col p-4">
          <p className="line-clamp-2 text-[12.5px] leading-relaxed text-[var(--admin-fg-muted)]">{pkg.summary}</p>
          <div className="mt-4 flex items-center justify-between border-t border-[var(--admin-border)] pt-3">
            <div className="flex gap-3 text-[11px] text-[var(--admin-fg-muted)]">
              <span>{pkg.duration}</span>
              <span>·</span>
              <span className="font-medium text-[var(--admin-accent)]">${pkg.price.toLocaleString()}</span>
            </div>
            <button onClick={onTogglePublish} className={`text-[11px] font-medium transition-colors ${pkg.published ? "text-emerald-400 hover:text-emerald-300" : "text-[var(--admin-fg-muted)] hover:text-[var(--admin-fg)]"}`}>
              {pkg.published ? "Unpublish" : "Publish"}
            </button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

/**
 * CMS-editable list of strings (used for a package's Included / Not Included
 * sections). Supports add, inline edit, delete and reorder with no fixed item
 * limit. Empty entries are dropped when the package is saved.
 */
function StringListEditor({ title, items, onChange, placeholder }: {
  title: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  const update = (index: number, value: string) => {
    const next = items.slice();
    next[index] = value;
    onChange(next);
  };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = items.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));
  const add = () => onChange([...items, ""]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">{title}</span>
        <Button size="sm" variant="secondary" icon={Plus} onClick={add}>Add item</Button>
      </div>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--admin-border)] px-3 py-5 text-center text-[12px] text-[var(--admin-fg-muted)]">No items yet. Add the first one.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input value={item} maxLength={160} onChange={(e) => update(index, e.target.value)} placeholder={placeholder} />
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" aria-label={`Move ${title.toLowerCase()} item up`} disabled={index === 0} onClick={() => move(index, -1)}><ChevronUp size={13} /></Button>
                <Button size="icon" variant="ghost" aria-label={`Move ${title.toLowerCase()} item down`} disabled={index === items.length - 1} onClick={() => move(index, 1)}><ChevronDown size={13} /></Button>
                <Button size="icon" variant="ghost" aria-label={`Remove ${title.toLowerCase()} item`} onClick={() => remove(index)}><Trash2 size={13} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PackageEditor({ pkg, onClose }: { pkg: SafariPackage | null; onClose: () => void }) {
  const [form, setForm] = useState<Partial<SafariPackage>>(pkg ?? {
    title: "",
    region: "",
    duration: "",
    nights: 0,
    price: 0,
    image: "",
    gallery: [],
    summary: "",
    description: "",
    signature: "",
    highlights: [],
    included: [],
    excluded: [],
    availability: [],
    country: [],
    parks: [],
    wildlife: [],
    difficulty: "Moderate",
    tags: [],
    featured: false,
    published: false,
    seo: { title: "", description: "" },
    coordinates: [0, 0],
  });

  const update = <K extends keyof SafariPackage>(key: K, value: SafariPackage[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = () => {
    if (!form.title || !form.region) {
      store.notify({ type: "error", title: "Missing required fields", message: "Title and region are required." });
      return;
    }
    // Drop empty / whitespace-only list items so the database never stores
    // blank Included or Not Included entries.
    const sanitized = {
      ...form,
      included: (form.included ?? []).map((item) => item.trim()).filter((item) => item.length > 0),
      excluded: (form.excluded ?? []).map((item) => item.trim()).filter((item) => item.length > 0),
    };
    if (pkg) {
      store.actions.updatePackage(pkg.id, sanitized);
    } else {
      store.actions.createPackage(sanitized as Omit<SafariPackage, "id" | "createdAt" | "updatedAt" | "slug">);
    }
    onClose();
  };

  return (
    <Modal open onClose={onClose} size="xl" title={pkg ? `Edit ${pkg.title}` : "New Safari Package"} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button onClick={save} icon={pkg ? undefined : Plus}>{pkg ? "Save changes" : "Create package"}</Button>
    </>}>
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Title *</span><Input value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="The Great Migration" /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Region *</span><Input value={form.region} onChange={(e) => update("region", e.target.value)} placeholder="Serengeti + Maasai Mara" /></label>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Duration</span><Input value={form.duration} onChange={(e) => update("duration", e.target.value)} placeholder="9 days / 8 nights" /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Price (USD)</span><Input type="number" value={form.price} onChange={(e) => update("price", Number(e.target.value))} placeholder="8450" /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Difficulty</span><Select value={form.difficulty} onChange={(e) => update("difficulty", e.target.value as SafariPackage["difficulty"])}><option>Gentle</option><option>Moderate</option><option>Active</option><option>Expedition</option></Select></label>
        </div>

        <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Hero Image URL</span><Input value={form.image} onChange={(e) => update("image", e.target.value)} placeholder="https://..." /></label>

        <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Summary</span><Textarea rows={3} value={form.summary} onChange={(e) => update("summary", e.target.value)} placeholder="Brief description for cards and listings..." /></label>

        <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Full Description</span><Textarea rows={6} value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Detailed description..." /></label>

        <div className="border-t border-[var(--admin-border)] pt-6">
          <h3 className="mb-4 font-serif text-xl font-light">Included &amp; Not included</h3>
          <div className="space-y-6">
            <StringListEditor title="Included" items={form.included ?? []} onChange={(items) => update("included", items)} placeholder="Enter an included item" />
            <StringListEditor title="Not included" items={form.excluded ?? []} onChange={(items) => update("excluded", items)} placeholder="Enter an item not included" />
          </div>
        </div>

        <div className="border-t border-[var(--admin-border)] pt-6">
          <h3 className="mb-4 font-serif text-xl font-light">Publishing</h3>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" className="accent-[var(--admin-accent)]" checked={form.published} onChange={(e) => update("published", e.target.checked)} />Published</label>
            <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" className="accent-[var(--admin-accent)]" checked={form.featured} onChange={(e) => update("featured", e.target.checked)} />Featured on homepage</label>
          </div>
        </div>

        <div className="border-t border-[var(--admin-border)] pt-6">
          <h3 className="mb-4 font-serif text-xl font-light">SEO</h3>
          <div className="space-y-4">
            <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">SEO Title</span><Input value={form.seo?.title} onChange={(e) => update("seo", { ...form.seo!, title: e.target.value })} /></label>
            <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Meta Description</span><Textarea rows={2} value={form.seo?.description} onChange={(e) => update("seo", { ...form.seo!, description: e.target.value })} /></label>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function PackagesManager() {
  const packages = useStore((state) => state.packages);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "published" | "draft" | "archived">("all");
  const [editing, setEditing] = useState<SafariPackage | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [deleting, setDeleting] = useState<SafariPackage | null>(null);

  const filtered = packages.filter((pkg) => {
    if (filter === "published" && !pkg.published) return false;
    if (filter === "draft" && pkg.published) return false;
    if (filter === "archived" && !pkg.archived) return false;
    if (filter === "all" && pkg.archived) return false;
    if (search && !pkg.title.toLowerCase().includes(search.toLowerCase()) && !pkg.region.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <PageHeader eyebrow="Content management" title="Safari Packages" description="Create, edit, and publish safari experiences to the public website." actions={<Button icon={Plus} onClick={() => setShowNew(true)}>New Package</Button>} />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]"><Input icon={Search} placeholder="Search packages..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <Tabs tabs={[{ id: "all", label: "All", count: packages.filter((p) => !p.archived).length }, { id: "published", label: "Published", count: packages.filter((p) => p.published && !p.archived).length }, { id: "draft", label: "Drafts", count: packages.filter((p) => !p.published && !p.archived).length }, { id: "archived", label: "Archived", count: packages.filter((p) => p.archived).length }]} value={filter} onChange={setFilter} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Package} title="No packages found" description={search ? "Try a different search term." : "Create your first safari package to get started."} action={<Button icon={Plus} onClick={() => setShowNew(true)}>New Package</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence>
            {filtered.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} onEdit={() => setEditing(pkg)} onDuplicate={() => store.actions.duplicatePackage(pkg.id)} onDelete={() => setDeleting(pkg)} onTogglePublish={() => store.actions.updatePackage(pkg.id, { published: !pkg.published })} />)}
          </AnimatePresence>
        </div>
      )}

      {editing && <PackageEditor pkg={editing} onClose={() => setEditing(null)} />}
      {showNew && <PackageEditor pkg={null} onClose={() => setShowNew(false)} />}
      {deleting && <ConfirmDialog open onClose={() => setDeleting(null)} onConfirm={() => store.actions.deletePackage(deleting.id)} title={`Archive ${deleting.title}?`} description="This package will be hidden from the public website but can be restored later." confirmLabel="Archive" />}
    </motion.div>
  );
}
