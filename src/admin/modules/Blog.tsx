import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, MessageSquare, FileText, Search, Trash2 } from "lucide-react";
import { store, useStore } from "../store";
import { Button, Card, Input, Textarea, Select, Badge, Modal, ConfirmDialog, PageHeader, EmptyState, Tabs, Avatar } from "../ui";
import type { BlogPost } from "../types";

const STATUS_COLORS: Record<BlogPost["status"], "success" | "warning" | "neutral" | "info"> = {
  draft: "neutral",
  scheduled: "info",
  published: "success",
  archived: "warning",
};

function BlogEditor({ post, onClose }: { post: BlogPost | null; onClose: () => void }) {
  const [form, setForm] = useState<Partial<BlogPost>>(post ?? {
    title: "",
    slug: "",
    excerpt: "",
    body: "",
    category: "Wildlife",
    tags: [],
    heroImage: "",
    authorId: store.currentUser()?.id ?? "u1",
    author: store.currentUser()?.fullName ?? "Unknown",
    readingTime: 5,
    seo: { title: "", description: "" },
    status: "draft",
    featured: false,
    comments: 0,
  });

  const update = <K extends keyof BlogPost>(key: K, value: BlogPost[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = (status: BlogPost["status"]) => {
    if (!form.title) {
      store.notify({ type: "error", title: "Title required" });
      return;
    }
    const slug = form.slug || form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const readingTime = Math.max(1, Math.ceil((form.body?.split(/\s+/).length ?? 0) / 200));
    // Draft explicitly clears the publish timestamp so the row disappears
    // from the public site (RLS only serves published rows).
    const data = { ...form, slug, readingTime, status, publishedAt: status === "published" ? (form.publishedAt ?? new Date().toISOString()) : undefined };

    if (post) {
      store.actions.updateBlogPost(post.id, data);
    } else {
      store.actions.createBlogPost(data as Omit<BlogPost, "id" | "createdAt" | "updatedAt">);
    }
    onClose();
  };

  return (
    <Modal open onClose={onClose} size="xl" title={post ? "Edit Article" : "New Article"} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      {post && post.status === "published" && (
        <Button variant="outline" onClick={() => save("draft")}>Unpublish</Button>
      )}
      <Button variant="outline" onClick={() => save("draft")}>{post && post.status !== "published" ? "Save Draft" : "Save as Draft"}</Button>
      <Button onClick={() => save("published")}>{post && post.status === "published" ? "Update" : "Publish"}</Button>
    </>}>
      <div className="space-y-5">
        <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Title *</span><Input value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Reading the River: A Guide to the Great Migration" /></label>

        <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Excerpt</span><Textarea rows={2} value={form.excerpt} onChange={(e) => update("excerpt", e.target.value)} placeholder="A short description shown in listings..." /></label>

        <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Body (Markdown)</span><Textarea rows={12} value={form.body} onChange={(e) => update("body", e.target.value)} placeholder="Write your article using Markdown..." className="font-mono text-[12px]" /></label>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Category</span><Select value={form.category} onChange={(e) => update("category", e.target.value as BlogPost["category"])}><option>Wildlife</option><option>Travel</option><option>Visa</option><option>Packing</option><option>Photography</option><option>Conservation</option><option>Culture</option></Select></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Author</span><Input value={form.author} onChange={(e) => update("author", e.target.value)} /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Tags (comma-separated)</span><Input value={form.tags?.join(", ")} onChange={(e) => update("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))} /></label>
        </div>

        <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Hero Image URL</span><Input value={form.heroImage} onChange={(e) => update("heroImage", e.target.value)} /></label>

        <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" className="accent-[var(--admin-accent)]" checked={form.featured} onChange={(e) => update("featured", e.target.checked)} />Featured article</label>

        <div className="border-t border-[var(--admin-border)] pt-5">
          <h3 className="mb-3 font-serif text-lg font-light">SEO</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">SEO Title</span><Input value={form.seo?.title} onChange={(e) => update("seo", { ...form.seo!, title: e.target.value })} /></label>
            <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Meta Description</span><Input value={form.seo?.description} onChange={(e) => update("seo", { ...form.seo!, description: e.target.value })} /></label>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function BlogManager() {
  const posts = useStore((state) => state.blogPosts);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "published" | "draft" | "scheduled">("all");
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [deleting, setDeleting] = useState<BlogPost | null>(null);

  const filtered = posts.filter((p) => {
    if (filter === "published" && p.status !== "published") return false;
    if (filter === "draft" && p.status !== "draft") return false;
    if (filter === "scheduled" && p.status !== "scheduled") return false;
    if (search && !p.title.toLowerCase().includes(search.toLowerCase()) && !p.excerpt.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <PageHeader eyebrow="Content" title="Blog & Journal" description="Write, schedule, and publish articles to the Field Notes section." actions={<Button icon={Plus} onClick={() => setShowNew(true)}>New Article</Button>} />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]"><Input icon={Search} placeholder="Search articles..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <Tabs tabs={[{ id: "all", label: "All", count: posts.length }, { id: "published", label: "Published", count: posts.filter((p) => p.status === "published").length }, { id: "draft", label: "Drafts", count: posts.filter((p) => p.status === "draft").length }]} value={filter} onChange={(id) => setFilter(id as typeof filter)} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={FileText} title="No articles found" description="Create your first article to start building your field journal." action={<Button icon={Plus} onClick={() => setShowNew(true)}>New Article</Button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((post) => (
            <Card key={post.id} hoverable onClick={() => setEditing(post)} className="flex h-full flex-col overflow-hidden !p-0">
              <div className="relative aspect-[16/9] overflow-hidden bg-[var(--admin-surface-2)]">
                <img src={post.heroImage} alt={post.title} className="h-full w-full object-cover" />
                <div className="absolute left-3 top-3 flex gap-1.5">
                  <Badge variant={STATUS_COLORS[post.status]} dot>{post.status}</Badge>
                  {post.featured && <Badge variant="accent" dot>Featured</Badge>}
                </div>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="mb-2 flex items-center justify-between gap-2 text-[10.5px] uppercase tracking-wider text-[var(--admin-fg-muted)]">
                  <span className="flex items-center gap-2"><span>{post.category}</span><span>·</span><span>{post.readingTime} min read</span></span>
                  <button
                    onClick={(event) => { event.stopPropagation(); setDeleting(post); }}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--admin-fg-muted)] hover:bg-red-500/10 hover:text-red-400 transition-colors"
                    aria-label={`Delete ${post.title}`}
                    title="Delete article"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <h3 className="font-serif text-xl font-light leading-tight">{post.title}</h3>
                <p className="mt-2 line-clamp-2 flex-1 text-[12px] leading-relaxed text-[var(--admin-fg-muted)]">{post.excerpt}</p>
                <div className="mt-4 flex items-center justify-between border-t border-[var(--admin-border)] pt-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={post.author} size={24} />
                    <span className="text-[11px]">{post.author}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10.5px] text-[var(--admin-fg-muted)]">
                    <MessageSquare size={12} /><span>{post.comments}</span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && <BlogEditor post={editing} onClose={() => setEditing(null)} />}
      {showNew && <BlogEditor post={null} onClose={() => setShowNew(false)} />}
      {deleting && <ConfirmDialog open onClose={() => setDeleting(null)} onConfirm={() => { store.actions.deleteBlogPost(deleting.id); setDeleting(null); }} title={`Delete "${deleting.title}"?`} description="This article will be permanently removed." confirmLabel="Delete" variant="danger" />}
    </motion.div>
  );
}
