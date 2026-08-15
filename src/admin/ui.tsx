// Admin CMS UI primitives
// Premium design system matching the public Olkinyei website

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type ButtonHTMLAttributes } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { store, useStore } from "./store";
import type { Notification } from "./types";
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Command, Copy, Edit3, Filter, Info, Loader2, MoreHorizontal, Search, Settings, Trash2, X, Sparkles,
} from "lucide-react";

// ============ Button ============

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "lg" | "icon";

export function Button({ variant = "primary", size = "md", loading, children, icon: Icon, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}) {
  const classes: Record<ButtonVariant, string> = {
    primary: "bg-[var(--admin-accent)] text-white hover:brightness-110 active:brightness-95",
    secondary: "bg-[var(--admin-surface-2)] text-[var(--admin-fg)] hover:bg-[var(--admin-surface-3)]",
    ghost: "bg-transparent text-[var(--admin-fg-muted)] hover:text-[var(--admin-fg)] hover:bg-[var(--admin-surface-2)]",
    danger: "bg-red-500/10 text-red-400 hover:bg-red-500/20",
    outline: "border border-[var(--admin-border)] bg-transparent text-[var(--admin-fg)] hover:bg-[var(--admin-surface-2)]",
  };
  const sizes: Record<ButtonSize, string> = {
    sm: "h-7 px-2.5 text-[11px] gap-1.5",
    md: "h-9 px-3.5 text-[12px] gap-2",
    lg: "h-11 px-5 text-[13px] gap-2.5",
    icon: "h-8 w-8 p-0",
  };
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`olk-button inline-flex items-center justify-center rounded-md font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--admin-bg)] disabled:opacity-50 disabled:cursor-not-allowed ${classes[variant]} ${sizes[size]} ${className}`}
    >
      {loading && <Loader2 size={size === "sm" ? 12 : size === "icon" ? 14 : 15} className="animate-spin" />}
      {!loading && Icon && <Icon size={size === "sm" ? 12 : size === "icon" ? 14 : 15} />}
      {children}
    </button>
  );
}

// ============ Input ============

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & { icon?: React.ComponentType<{ size?: number; className?: string }> }) {
  const Icon = (props as { icon?: React.ComponentType<{ size?: number; className?: string }> }).icon;
  return (
    <div className="olk-input relative">
      {Icon && <Icon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--admin-fg-muted)]" />}
      <input
        {...props}
        className={`olk-input-element h-9 w-full rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface-2)] px-3 text-[13px] text-[var(--admin-fg)] placeholder:text-[var(--admin-fg-muted)]/60 transition-colors focus:border-[var(--admin-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)]/20 ${Icon ? "pl-9" : ""} ${className}`}
      />
    </div>
  );
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`olk-textarea w-full rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface-2)] px-3 py-2 text-[13px] text-[var(--admin-fg)] placeholder:text-[var(--admin-fg-muted)]/60 transition-colors focus:border-[var(--admin-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)]/20 resize-none ${className}`}
    />
  );
}

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="olk-select relative">
      <select
        {...props}
        className={`olk-select-element h-9 w-full appearance-none rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface-2)] pl-3 pr-8 text-[13px] text-[var(--admin-fg)] transition-colors focus:border-[var(--admin-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)]/20 ${className}`}
      >
        {children}
      </select>
      <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--admin-fg-muted)]" />
    </div>
  );
}

// ============ Badge ============

type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

export function Badge({ variant = "neutral", children, dot, className = "" }: { variant?: BadgeVariant; children: ReactNode; dot?: boolean; className?: string }) {
  const classes: Record<BadgeVariant, string> = {
    neutral: "bg-[var(--admin-surface-3)] text-[var(--admin-fg-muted)]",
    success: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
    danger: "bg-red-500/10 text-red-400 border border-red-500/20",
    info: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
    accent: "bg-[var(--admin-accent)]/10 text-[var(--admin-accent)] border border-[var(--admin-accent)]/25",
  };
  return (
    <span className={`olk-badge inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wider ${classes[variant]} ${className}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

// ============ Card ============

export function Card({ children, className = "", hoverable = false, onClick }: { children: ReactNode; className?: string; hoverable?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`olk-card rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 transition-all duration-200 ${hoverable ? "cursor-pointer hover:border-[var(--admin-accent)]/50 hover:shadow-lg hover:shadow-black/20" : ""} ${onClick ? "cursor-pointer" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

// ============ Stat Card ============

export function StatCard({ label, value, change, icon: Icon, accent }: { label: string; value: string; change?: string; icon?: React.ComponentType<{ size?: number; className?: string }>; accent?: string }) {
  const positive = change?.startsWith("+");
  const negative = change?.startsWith("-");
  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">{label}</p>
          <p className="mt-2 font-serif text-3xl font-light tracking-tight text-[var(--admin-fg)]">{value}</p>
          {change && (
            <p className={`mt-2 inline-flex items-center gap-1 text-[11px] ${positive ? "text-emerald-400" : negative ? "text-red-400" : "text-[var(--admin-fg-muted)]"}`}>
              {positive && <span>↑</span>}{negative && <span>↓</span>}
              {change}
            </p>
          )}
        </div>
        {Icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: accent ? `${accent}18` : "var(--admin-surface-2)" }}>
            <div style={accent ? { color: accent } : undefined}>
              <Icon size={18} className={accent ? "" : "text-[var(--admin-fg-muted)]"} />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ============ Table ============

type Column<T> = {
  key: string;
  label: string;
  render?: (item: T) => ReactNode;
  width?: string;
  sortable?: boolean;
};

export function DataTable<T extends { id: string }>({
  data,
  columns,
  onRowClick,
  emptyMessage = "No records found.",
  stickyHeader = false,
}: {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  stickyHeader?: boolean;
}) {
  return (
    <div className="olk-table-wrapper overflow-hidden rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)]">
      <table className="olk-table w-full text-left text-[13px]">
        <thead className={stickyHeader ? "sticky top-0 z-10" : ""}>
          <tr className="border-b border-[var(--admin-border)] bg-[var(--admin-surface-2)]">
            {columns.map((col) => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className="px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--admin-fg-muted)]"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-[13px] text-[var(--admin-fg-muted)]">
                {emptyMessage}
              </td>
            </tr>
          ) : data.map((item) => (
            <tr
              key={item.id}
              onClick={() => onRowClick?.(item)}
              className={`border-b border-[var(--admin-border)]/60 last:border-0 transition-colors ${onRowClick ? "cursor-pointer hover:bg-[var(--admin-surface-2)]" : ""}`}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 align-middle text-[var(--admin-fg)]">
                  {col.render ? col.render(item) : (item as Record<string, unknown>)[col.key] as ReactNode}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============ Modal ============

export function Modal({ open, onClose, title, description, children, size = "md", footer }: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const sizes = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl", full: "max-w-6xl" };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="olk-modal-backdrop fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.18 }}
            className={`olk-modal-panel w-full ${sizes[size]} rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-2xl shadow-black/50`}
            onClick={(e) => e.stopPropagation()}
          >
            {(title || description) && (
              <div className="border-b border-[var(--admin-border)] px-6 py-4">
                {title && <h2 className="font-serif text-xl font-light text-[var(--admin-fg)]">{title}</h2>}
                {description && <p className="mt-1 text-[12.5px] text-[var(--admin-fg-muted)]">{description}</p>}
              </div>
            )}
            <div className="max-h-[calc(100vh-180px)] overflow-y-auto px-6 py-5">
              {children}
            </div>
            {footer && (
              <div className="flex items-center justify-end gap-2 border-t border-[var(--admin-border)] px-6 py-3.5">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============ Confirm Dialog ============

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = "Confirm", variant = "danger" }: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  variant?: "danger" | "primary";
}) {
  return (
    <Modal open={open} onClose={onClose} size="sm" title={title} description={description}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant={variant} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button>
      </>}
    >
      {description && <p className="text-[13px] text-[var(--admin-fg-muted)] leading-relaxed">{description}</p>}
    </Modal>
  );
}

// ============ Toast ============

function ToastItem({ notification, onDismiss }: { notification: Notification; onDismiss: () => void }) {
  const icons = {
    success: <CheckCircle2 size={16} className="text-emerald-400" />,
    error: <AlertCircle size={16} className="text-red-400" />,
    warning: <AlertCircle size={16} className="text-amber-400" />,
    info: <Info size={16} className="text-blue-400" />,
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="olk-toast flex w-80 gap-3 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3.5 shadow-2xl shadow-black/40 backdrop-blur-xl"
    >
      <div className="mt-0.5">{icons[notification.type]}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[var(--admin-fg)]">{notification.title}</p>
        {notification.message && <p className="mt-0.5 text-[11.5px] text-[var(--admin-fg-muted)] leading-snug">{notification.message}</p>}
      </div>
      <button onClick={onDismiss} className="text-[var(--admin-fg-muted)] hover:text-[var(--admin-fg)] transition-colors">
        <X size={14} />
      </button>
    </motion.div>
  );
}

export function ToastContainer() {
  const notifications = useStore((s) => s.notifications);
  return (
    <div className="olk-toasts fixed bottom-4 right-4 z-[300] flex flex-col gap-2">
      <AnimatePresence>
        {notifications.map((n) => (
          <ToastItem key={n.id} notification={n} onDismiss={() => store.dismissNotification(n.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

// ============ Command Palette ============

type CommandItem = { id: string; label: string; description?: string; icon?: ReactNode; section: string; action: () => void; shortcut?: string };

export function CommandPalette({ open, onClose, items }: { open: boolean; onClose: () => void; items: CommandItem[] }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
  }, [items, query]);

  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    filtered.forEach((item) => {
      if (!groups[item.section]) groups[item.section] = [];
      groups[item.section].push(item);
    });
    return groups;
  }, [filtered]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[250] flex items-start justify-center bg-black/60 backdrop-blur-sm pt-[15vh]"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.15 }}
            className="olk-command w-full max-w-xl rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-2xl shadow-black/50 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-[var(--admin-border)] px-4">
              <Search size={16} className="text-[var(--admin-fg-muted)]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search everything — packages, bookings, pages, guides..."
                className="flex-1 bg-transparent py-4 text-[14px] text-[var(--admin-fg)] placeholder:text-[var(--admin-fg-muted)]/60 focus:outline-none"
              />
              <kbd className="rounded border border-[var(--admin-border)] bg-[var(--admin-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--admin-fg-muted)]">ESC</kbd>
            </div>
            <div className="max-h-[420px] overflow-y-auto py-2">
              {Object.keys(grouped).length === 0 ? (
                <div className="py-8 text-center text-[12.5px] text-[var(--admin-fg-muted)]">No results for "{query}"</div>
              ) : Object.entries(grouped).map(([section, items]) => (
                <div key={section}>
                  <div className="px-4 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--admin-fg-muted)]">{section}</div>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => { item.action(); onClose(); }}
                      className="olk-command-item flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-[var(--admin-surface-2)]"
                    >
                      {item.icon && <div className="text-[var(--admin-fg-muted)]">{item.icon}</div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-[var(--admin-fg)]">{item.label}</p>
                        {item.description && <p className="text-[11px] text-[var(--admin-fg-muted)] truncate">{item.description}</p>}
                      </div>
                      {item.shortcut && <kbd className="text-[10px] text-[var(--admin-fg-muted)]">{item.shortcut}</kbd>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-[var(--admin-border)] bg-[var(--admin-surface-2)] px-4 py-2 text-[10.5px] text-[var(--admin-fg-muted)]">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1"><kbd className="rounded border border-[var(--admin-border)] bg-[var(--admin-surface)] px-1 py-px">↵</kbd> select</span>
                <span className="flex items-center gap-1"><kbd className="rounded border border-[var(--admin-border)] bg-[var(--admin-surface)] px-1 py-px">↑↓</kbd> navigate</span>
              </div>
              <span className="flex items-center gap-1"><Command size={10} />K</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============ Empty State ============

export function EmptyState({ icon: Icon, title, description, action }: {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="olk-empty flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--admin-border)] bg-[var(--admin-surface)] px-6 py-16 text-center">
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--admin-surface-2)]">
          <Icon size={20} className="text-[var(--admin-fg-muted)]" />
        </div>
      )}
      <h3 className="font-serif text-xl font-light text-[var(--admin-fg)]">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-[12.5px] leading-relaxed text-[var(--admin-fg-muted)]">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ============ Skeleton ============

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`olk-skeleton animate-pulse rounded-md bg-[var(--admin-surface-2)] ${className}`} />;
}

// ============ Avatar ============

export function Avatar({ src, name, size = 32, className = "" }: { src?: string; name: string; size?: number; className?: string }) {
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  if (src) {
    return <img src={src} alt={name} style={{ width: size, height: size }} className={`olk-avatar rounded-full object-cover ${className}`} />;
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="olk-avatar flex items-center justify-center rounded-full bg-gradient-to-br from-[var(--admin-accent)] to-amber-700 font-medium text-white"
    >
      {initials}
    </div>
  );
}

// ============ Breadcrumb ============

export function Breadcrumb({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <nav className="olk-breadcrumb flex items-center gap-1.5 text-[11.5px] text-[var(--admin-fg-muted)]">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {item.onClick ? (
            <button onClick={item.onClick} className="hover:text-[var(--admin-fg)] transition-colors">{item.label}</button>
          ) : (
            <span className="text-[var(--admin-fg)]">{item.label}</span>
          )}
          {i < items.length - 1 && <ChevronRight size={11} />}
        </span>
      ))}
    </nav>
  );
}

// ============ Page Header ============

export function PageHeader({ eyebrow, title, description, actions, breadcrumb }: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: { label: string; onClick?: () => void }[];
}) {
  return (
    <div className="olk-page-header mb-8">
      {breadcrumb && <div className="mb-4"><Breadcrumb items={breadcrumb} /></div>}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {eyebrow && <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[var(--admin-accent)]">{eyebrow}</p>}
          <h1 className="mt-1.5 font-serif text-4xl font-light tracking-tight text-[var(--admin-fg)] md:text-[42px]">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[var(--admin-fg-muted)]">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

// ============ Tabs ============

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="olk-tabs flex items-center gap-1 border-b border-[var(--admin-border)]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`olk-tab relative px-3.5 py-2.5 text-[12.5px] font-medium transition-colors ${value === tab.id ? "text-[var(--admin-fg)]" : "text-[var(--admin-fg-muted)] hover:text-[var(--admin-fg)]"}`}
        >
          <span className="flex items-center gap-1.5">
            {tab.label}
            {tab.count !== undefined && <span className="rounded-full bg-[var(--admin-surface-2)] px-1.5 py-0.5 text-[10px]">{tab.count}</span>}
          </span>
          {value === tab.id && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[var(--admin-accent)]" />}
        </button>
      ))}
    </div>
  );
}

// ============ Mini Sparkline ============

export function Sparkline({ data, color = "var(--admin-accent)", height = 40 }: { data: number[]; color?: string; height?: number }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * 100},${height - ((v - min) / range) * height}`).join(" ");
  const areaPoints = `0,${height} ${points} 100,${height}`;
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <polygon points={areaPoints} fill={color} opacity="0.12" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ============ Bar Chart ============

export function BarChart({ data, height = 180 }: { data: { label: string; value: number; secondary?: number }[]; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), ...data.map((d) => d.secondary ?? 0));
  return (
    <div className="olk-chart flex items-end gap-2" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex w-full items-end gap-0.5" style={{ height: height - 20 }}>
            <div className="flex-1 rounded-t bg-[var(--admin-accent)]/80 transition-all hover:bg-[var(--admin-accent)]" style={{ height: `${(d.value / max) * 100}%` }} title={`${d.label}: ${d.value}`} />
            {d.secondary !== undefined && (
              <div className="flex-1 rounded-t bg-[var(--admin-accent)]/25 transition-all hover:bg-[var(--admin-accent)]/40" style={{ height: `${(d.secondary / max) * 100}%` }} />
            )}
          </div>
          <span className="text-[9.5px] text-[var(--admin-fg-muted)]">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ============ Search Input ============

export function SearchInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "icon">) {
  return <Input icon={Search} placeholder="Search..." {...props} />;
}

// ============ Dropdown Menu ============

export function DropdownMenu({ trigger, items }: { trigger: ReactNode; items: { label: string; icon?: ReactNode; onClick: () => void; danger?: boolean; divider?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="olk-dropdown relative inline-block">
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="olk-dropdown-menu absolute right-0 z-50 mt-1.5 min-w-[180px] overflow-hidden rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-xl shadow-black/40"
          >
            {items.map((item, i) => item.divider ? (
              <div key={i} className="border-t border-[var(--admin-border)] my-1" />
            ) : (
              <button
                key={i}
                onClick={() => { item.onClick(); setOpen(false); }}
                className={`olk-dropdown-item flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] transition-colors ${item.danger ? "text-red-400 hover:bg-red-500/10" : "text-[var(--admin-fg)] hover:bg-[var(--admin-surface-2)]"}`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function IconButton({ children, onClick, label, variant = "ghost", size = "sm" }: { children: ReactNode; onClick?: () => void; label: string; variant?: ButtonVariant; size?: ButtonSize }) {
  return <Button variant={variant} size={size} onClick={onClick} icon={() => <>{children}</>} aria-label={label} />;
}

// ============ Utility: Copy to clipboard ============

export function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      store.notify({ type: "success", title: "Copied", message: "Copied to clipboard" });
      setTimeout(() => setCopied(false), 1800);
    } catch {
      store.notify({ type: "error", title: "Copy failed" });
    }
  }, []);
  return { copy, copied };
}

export { Edit3, Trash2, Settings, MoreHorizontal, Filter, Copy, Sparkles };
