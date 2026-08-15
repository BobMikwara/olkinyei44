import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Flag, MessageSquare, Search, Trash2, X } from "lucide-react";
import { store, useStore } from "../store";
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, Input, Modal, PageHeader, Select, Tabs, Textarea } from "../ui";
import { REVIEW_PROVIDERS, SOURCE_LABELS, type ReviewSource } from "../reviewProviders";
import type { Testimonial, TestimonialStatus } from "../types";

const STATUS_VARIANTS: Record<TestimonialStatus, "success" | "warning" | "danger" | "info"> = {
  approved: "success",
  pending: "info",
  flagged: "warning",
  rejected: "danger",
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

/** Full review panel: read the entry, edit wording, record notes, moderate. */
function TestimonialReview({ testimonial, onClose }: { testimonial: Testimonial; onClose: () => void }) {
  const [draft, setDraft] = useState({
    quote: testimonial.quote,
    guestName: testimonial.guestName,
    guestLocation: testimonial.guestLocation ?? "",
    staffNotes: testimonial.staffNotes ?? "",
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const moderate = async (status: TestimonialStatus) => {
    await store.actions.setTestimonialStatus(testimonial.id, status);
    onClose();
  };

  const saveEdits = async () => {
    await store.actions.updateTestimonial(testimonial.id, draft);
    onClose();
  };

  const isExternal = testimonial.source !== "website";

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={testimonial.guestName}
      description={`${isExternal ? `Imported from ${SOURCE_LABELS[testimonial.source]}` : "Submitted from the website"} · ${formatDate(testimonial.externalCreatedAt ?? testimonial.createdAt)}`}
      footer={<>
        <Button variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)}>Delete</Button>
        <div className="flex-1" />
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="outline" onClick={saveEdits}>Save edits</Button>
        {testimonial.status !== "rejected" && <Button variant="outline" onClick={() => moderate("rejected")}>Reject</Button>}
        {testimonial.status !== "approved" && <Button onClick={() => moderate("approved")}>Approve &amp; publish</Button>}
        {testimonial.status === "approved" && <Button variant="outline" onClick={() => moderate("pending")}>Unpublish</Button>}
      </>}
    >
      <div className="space-y-5">
        {testimonial.flagged && (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-4">
            <div className="mb-1 flex items-center gap-2 text-[12px] font-medium text-amber-400">
              <Flag size={14} /> Held for review
            </div>
            <p className="text-[11.5px] leading-relaxed text-[var(--admin-fg-muted)]">
              {testimonial.flagReason ?? "Automatic screening flagged this submission."} It cannot appear publicly until approved here.
            </p>
          </div>
        )}

        <label className="block">
          <span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Testimonial</span>
          <Textarea rows={6} value={draft.quote} onChange={(e) => setDraft({ ...draft, quote: e.target.value })} />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Guest name</span>
            <Input value={draft.guestName} onChange={(e) => setDraft({ ...draft, guestName: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Location</span>
            <Input value={draft.guestLocation} onChange={(e) => setDraft({ ...draft, guestLocation: e.target.value })} />
          </label>
        </div>

        {(testimonial.rating || testimonial.safariPackage) && (
          <div className="flex flex-wrap items-center gap-4 text-[11.5px] text-[var(--admin-fg-muted)]">
            {testimonial.rating && <span>Rating: <span className="text-[var(--admin-fg)]">{testimonial.rating} / 5</span></span>}
            {testimonial.safariPackage && <span>Safari: <span className="text-[var(--admin-fg)]">{testimonial.safariPackage}</span></span>}
          </div>
        )}

        {isExternal && (
          <div className="rounded-lg bg-[var(--admin-surface-2)] p-4 text-[11.5px] leading-relaxed text-[var(--admin-fg-muted)]">
            <p className="mb-1 font-medium text-[var(--admin-fg)]">Imported review — edit with care</p>
            <p>
              This is a third party's published words from {SOURCE_LABELS[testimonial.source]}. Editing the wording of an
              external review can be misleading. Approve, reject, or hide it rather than rewriting it.
            </p>
            {testimonial.externalUrl && (
              <a href={testimonial.externalUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[var(--admin-accent)] hover:underline">
                View the original review
              </a>
            )}
          </div>
        )}

        {testimonial.guestEmail && (
          <p className="text-[11.5px] text-[var(--admin-fg-muted)]">
            Contact: <span className="text-[var(--admin-fg)]">{testimonial.guestEmail}</span> · never published
          </p>
        )}

        <label className="block">
          <span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Internal notes</span>
          <Textarea rows={3} value={draft.staffNotes} onChange={(e) => setDraft({ ...draft, staffNotes: e.target.value })} placeholder="Visible to staff only." />
        </label>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => { void store.actions.deleteTestimonial(testimonial.id); setConfirmDelete(false); onClose(); }}
        title={`Delete ${testimonial.guestName}'s testimonial?`}
        description="This permanently removes the submission from the CMS and the database."
        confirmLabel="Delete permanently"
      />
    </Modal>
  );
}

/**
 * Review provider configuration. External providers stay dormant until real
 * credentials are supplied server-side; the panel reports that state honestly
 * rather than pretending an integration exists.
 */
function ProviderPanel() {
  const [busy, setBusy] = useState<ReviewSource | null>(null);
  const [report, setReport] = useState<Record<string, string>>({});

  const runImport = async (provider: ReviewSource) => {
    setBusy(provider);
    const result = await store.actions.importProviderReviews(provider);
    setBusy(null);
    setReport((current) => ({ ...current, [provider]: result.message }));
  };

  return (
    <Card className="mb-6 !p-4">
      <p className="mb-3 text-[10.5px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Review sources</p>
      <div className="grid gap-2 md:grid-cols-3">
        {REVIEW_PROVIDERS.map((provider) => {
          const info = provider.status();
          return (
            <div key={provider.id} className="rounded-lg bg-[var(--admin-surface-2)] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium">{info.label}</span>
                <Badge variant={info.configured ? "success" : "neutral"} dot>
                  {info.configured ? "Active" : "Not configured"}
                </Badge>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--admin-fg-muted)]">{info.note}</p>
              {info.requires.length > 0 && (
                <p className="mt-2 font-mono text-[10px] leading-relaxed text-[var(--admin-fg-muted)]/70">
                  {info.requires.join(" · ")}
                </p>
              )}
              {provider.id !== "website" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  loading={busy === provider.id}
                  onClick={() => void runImport(provider.id)}
                >
                  Import reviews
                </Button>
              )}
              {report[provider.id] && (
                <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--admin-fg-muted)]">{report[provider.id]}</p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function TestimonialsManager() {
  const testimonials = useStore((state) => state.testimonials);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | TestimonialStatus>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | ReviewSource>("all");
  const [selected, setSelected] = useState<Testimonial | null>(null);

  const counts = useMemo(() => ({
    all: testimonials.length,
    pending: testimonials.filter((t) => t.status === "pending").length,
    flagged: testimonials.filter((t) => t.status === "flagged").length,
    approved: testimonials.filter((t) => t.status === "approved").length,
    rejected: testimonials.filter((t) => t.status === "rejected").length,
  }), [testimonials]);

  const filtered = useMemo(() => testimonials.filter((item) => {
    if (filter !== "all" && item.status !== filter) return false;
    if (sourceFilter !== "all" && item.source !== sourceFilter) return false;
    if (!search) return true;
    const needle = search.toLowerCase();
    return item.guestName.toLowerCase().includes(needle)
      || item.quote.toLowerCase().includes(needle)
      || (item.guestLocation ?? "").toLowerCase().includes(needle)
      || (item.safariPackage ?? "").toLowerCase().includes(needle)
      || (item.guestEmail ?? "").toLowerCase().includes(needle);
  }), [testimonials, filter, sourceFilter, search]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <PageHeader
        eyebrow="Content"
        title="Testimonials"
        description="Review guest submissions before they appear on the website. Only approved testimonials are public."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="!p-4"><p className="text-[10.5px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Awaiting review</p><p className="mt-2 font-serif text-2xl font-light text-blue-400">{counts.pending}</p></Card>
        <Card className="!p-4"><p className="text-[10.5px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Flagged</p><p className="mt-2 font-serif text-2xl font-light text-amber-400">{counts.flagged}</p></Card>
        <Card className="!p-4"><p className="text-[10.5px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Published</p><p className="mt-2 font-serif text-2xl font-light text-emerald-400">{counts.approved}</p></Card>
        <Card className="!p-4"><p className="text-[10.5px] uppercase tracking-wider text-[var(--admin-fg-muted)]">Rejected</p><p className="mt-2 font-serif text-2xl font-light">{counts.rejected}</p></Card>
      </div>

      <ProviderPanel />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <Input icon={Search} placeholder="Search by name, safari, location, email, or text..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-[180px]">
          <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)} aria-label="Filter by review source">
            <option value="all">All sources</option>
            {(Object.keys(SOURCE_LABELS) as ReviewSource[]).map((source) => (
              <option key={source} value={source}>{SOURCE_LABELS[source]}</option>
            ))}
          </Select>
        </div>
        <Tabs
          tabs={[
            { id: "all", label: "All", count: counts.all },
            { id: "pending", label: "Pending", count: counts.pending },
            { id: "flagged", label: "Flagged", count: counts.flagged },
            { id: "approved", label: "Published", count: counts.approved },
          ]}
          value={filter}
          onChange={(id) => setFilter(id as typeof filter)}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No testimonials here"
          description={search ? "Try a different search term." : "Guest submissions from the website will appear here for review."}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <Card key={item.id} hoverable onClick={() => setSelected(item)} className="!p-4">
              <div className="flex items-start gap-4">
                <Avatar src={item.guestPhoto} name={item.guestName} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-serif text-lg font-light">{item.guestName}</h3>
                    <Badge variant={STATUS_VARIANTS[item.status]} dot>{item.status}</Badge>
                    <Badge variant={item.source === "website" ? "neutral" : "accent"}>{SOURCE_LABELS[item.source]}</Badge>
                    {item.rating && <span className="text-[11px] text-[var(--admin-fg-muted)]">{item.rating}/5</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-[var(--admin-fg-muted)]">{item.quote}</p>
                  <p className="mt-2 text-[10.5px] text-[var(--admin-fg-muted)]">
                    {item.safariPackage ? `${item.safariPackage} · ` : ""}
                    {item.guestLocation ? `${item.guestLocation} · ` : ""}
                    {formatDate(item.externalCreatedAt ?? item.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {item.status !== "approved" && (
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); void store.actions.setTestimonialStatus(item.id, "approved"); }}>
                      <Check size={13} /> Approve
                    </Button>
                  )}
                  {item.status !== "rejected" && (
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); void store.actions.setTestimonialStatus(item.id, "rejected"); }}>
                      <X size={13} /> Reject
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {selected && <TestimonialReview testimonial={selected} onClose={() => setSelected(null)} />}
    </motion.div>
  );
}
