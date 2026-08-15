import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Search, Image as ImageIcon, Film, FileText, Trash2, Edit3 } from "lucide-react";
import { store, useStore } from "../store";
import { Button, Input, Modal, PageHeader, Tabs, EmptyState } from "../ui";
import type { MediaAsset } from "../types";

function MediaCard({ asset, onSelect, onEdit, onDelete, selected }: {
  asset: MediaAsset;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  selected: boolean;
}) {
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="group relative">
      <button onClick={onSelect} className={`block w-full overflow-hidden rounded-xl border transition-all ${selected ? "border-[var(--admin-accent)] ring-2 ring-[var(--admin-accent)]/30" : "border-[var(--admin-border)] hover:border-[var(--admin-accent)]/50"}`}>
        <div className="relative aspect-square overflow-hidden bg-[var(--admin-surface-2)]">
          {asset.type === "image" && <img src={asset.thumbnail} alt={asset.alt} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}
          {asset.type === "video" && <>
            <img src={asset.thumbnail} alt={asset.alt} className="h-full w-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30"><Film size={32} className="text-white" /></div>
          </>}
          {asset.type === "pdf" && <div className="flex h-full items-center justify-center bg-[var(--admin-surface-3)]"><FileText size={40} className="text-[var(--admin-fg-muted)]" /></div>}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between opacity-0 transition-opacity group-hover:opacity-100">
            <span className="truncate text-[10.5px] text-white">{asset.name}</span>
            <span className="text-[10px] text-white/70">{(asset.size / 1024 / 1024).toFixed(1)}MB</span>
          </div>
        </div>
      </button>
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button onClick={onEdit} className="flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white backdrop-blur-sm hover:bg-black/80" aria-label="Edit"><Edit3 size={12} /></button>
        <button onClick={onDelete} className="flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-red-300 backdrop-blur-sm hover:bg-red-500/80 hover:text-white" aria-label="Delete"><Trash2 size={12} /></button>
      </div>
    </motion.div>
  );
}

function MediaEditor({ asset, onClose }: { asset: MediaAsset; onClose: () => void }) {
  const [form, setForm] = useState<MediaAsset>(asset);

  const save = () => {
    store.actions.updateMedia(asset.id, form);
    onClose();
  };

  return (
    <Modal open onClose={onClose} size="lg" title="Edit Media Asset" footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button onClick={save}>Save changes</Button>
    </>}>
      <div className="grid gap-5 md:grid-cols-[1fr_1fr]">
        <div>
          {asset.type === "image" && <img src={asset.url} alt={asset.alt} className="w-full rounded-lg" />}
          {asset.type === "video" && <video src={asset.url} controls className="w-full rounded-lg" />}
        </div>
        <div className="space-y-4">
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">File Name</span><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Alt Text</span><Input value={form.alt} onChange={(e) => setForm({ ...form, alt: e.target.value })} /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Category</span><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Copyright</span><Input value={form.copyright} onChange={(e) => setForm({ ...form, copyright: e.target.value })} /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Tags (comma-separated)</span><Input value={form.tags.join(", ")} onChange={(e) => setForm({ ...form, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} /></label>
        </div>
      </div>
    </Modal>
  );
}

export default function MediaManager() {
  const media = useStore((state) => state.media);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "image" | "video" | "pdf">("all");
  const [editing, setEditing] = useState<MediaAsset | null>(null);
  const [deleting, setDeleting] = useState<MediaAsset | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = media.filter((m) => {
    if (!m.archived === false) return false;
    if (m.archived) return false;
    if (filter !== "all" && m.type !== filter) return false;
    if (search && !m.name.toLowerCase().includes(search.toLowerCase()) && !m.alt.toLowerCase().includes(search.toLowerCase()) && !m.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  const handleUpload = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result);
        const type: MediaAsset["type"] = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "pdf";
        store.actions.createMedia({
          url,
          thumbnail: type === "image" ? url : url,
          type,
          name: file.name,
          alt: file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
          category: "Uncategorized",
          tags: [],
          size: file.size,
          copyright: "",
          uploadedBy: store.currentUser()?.id ?? "u1",
          folder: "Uploads",
        });
      };
      reader.readAsDataURL(file);
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <PageHeader eyebrow="Content" title="Media Library" description="Upload, organize, and manage all visual assets for the website." actions={<>
        <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,.pdf" className="hidden" onChange={(e) => handleUpload(e.target.files)} />
        <Button icon={Upload} onClick={() => fileInputRef.current?.click()}>Upload</Button>
      </>} />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]"><Input icon={Search} placeholder="Search by name, alt text, or tags..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <Tabs tabs={[{ id: "all", label: "All", count: media.filter((m) => !m.archived).length }, { id: "image", label: "Images", count: media.filter((m) => m.type === "image" && !m.archived).length }, { id: "video", label: "Videos", count: media.filter((m) => m.type === "video" && !m.archived).length }]} value={filter} onChange={(id) => setFilter(id as typeof filter)} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={ImageIcon} title="No media found" description={search ? "Try a different search term." : "Upload your first asset to get started."} action={<Button icon={Upload} onClick={() => fileInputRef.current?.click()}>Upload</Button>} />
      ) : (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          <AnimatePresence>
            {filtered.map((asset) => <MediaCard key={asset.id} asset={asset} onSelect={() => setEditing(asset)} onEdit={() => setEditing(asset)} onDelete={() => setDeleting(asset)} selected={false} />)}
          </AnimatePresence>
        </div>
      )}

      {editing && <MediaEditor asset={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <Modal open onClose={() => setDeleting(null)} size="sm" title="Delete this asset?" description={`${deleting.name} will be archived and hidden from the public website.`} footer={<>
          <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => { store.actions.deleteMedia(deleting.id); setDeleting(null); }}>Delete</Button>
        </>}>
          {deleting.type === "image" && <img src={deleting.thumbnail} alt="" className="mb-4 rounded-lg" />}
        </Modal>
      )}
    </motion.div>
  );
}
