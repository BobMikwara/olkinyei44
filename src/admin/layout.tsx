// Admin layout: sidebar, topbar, login screen
// Premium enterprise CMS navigation

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { can, store, useStore } from "./store";
import {
  authOnStateChange,
  authRequestPasswordReset,
  authSetPasswordAfterRecovery,
  clearAuthQuery,
  consumeAuthCallback,
  hasCloudBackend,
  isAuthPath,
} from "./auth";
import type { ModuleKey } from "./types";
import { Button, Avatar, Input, CommandPalette } from "./ui";
import {
  LayoutDashboard, Calendar, Package, MapPin, Image, FileText, MessageSquare, Users, UserCheck, Truck, Settings, BarChart3, Shield, Search, Bell, Command, LogOut, Sun, Moon, ChevronDown, ChevronRight, ExternalLink,
} from "lucide-react";

type Module = {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  path: string;
  section: string;
  badge?: number;
};

type ModuleDef = Module & { permission: ModuleKey };

const modules: ModuleDef[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/admin", section: "Overview", permission: "dashboard" },
  { id: "pages", label: "Website Pages", icon: FileText, path: "/admin/pages", section: "Content", permission: "pages" },
  { id: "bookings", label: "Bookings", icon: Calendar, path: "/admin/bookings", section: "Operations", permission: "bookings" },
  { id: "packages", label: "Safari Packages", icon: Package, path: "/admin/packages", section: "Content", permission: "packages" },
  { id: "destinations", label: "Destinations", icon: MapPin, path: "/admin/destinations", section: "Content", permission: "destinations" },
  { id: "media", label: "Media Library", icon: Image, path: "/admin/media", section: "Content", permission: "media" },
  { id: "blog", label: "Blog & Journal", icon: FileText, path: "/admin/blog", section: "Content", permission: "blog" },
  { id: "testimonials", label: "Testimonials", icon: MessageSquare, path: "/admin/testimonials", section: "Content", permission: "blog" },
  { id: "customers", label: "Customers", icon: Users, path: "/admin/customers", section: "Operations", permission: "customers" },
  { id: "guides", label: "Guides", icon: UserCheck, path: "/admin/guides", section: "Operations", permission: "guides" },
  { id: "vehicles", label: "Vehicles", icon: Truck, path: "/admin/vehicles", section: "Operations", permission: "vehicles" },
  { id: "analytics", label: "Analytics", icon: BarChart3, path: "/admin/analytics", section: "Insights", permission: "analytics" },
  { id: "users", label: "Team & Roles", icon: Shield, path: "/admin/users", section: "System", permission: "users" },
  { id: "settings", label: "Settings", icon: Settings, path: "/admin/settings", section: "System", permission: "settings" },
];

export function AdminLayout({ children, currentModule, onNavigate }: { children: React.ReactNode; currentModule: string; onNavigate: (path: string) => void }) {
  const theme = useStore((s) => s.theme);
  const currentUserId = useStore((s) => s.currentUserId);
  const users = useStore((s) => s.users);
  const newBookingsCount = useStore((s) => s.newBookingsCount);
  const user = currentUserId ? users.find((u) => u.id === currentUserId) ?? null : null;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Supabase session bootstrap: restore the signed-in session on refresh and
  // react to auth events. Only a literal SIGNED_OUT tears this tab down —
  // transient profile fetches must never log somebody out (that was the
  // login-then-kicked-out production failure).
  useEffect(() => {
    if (!hasCloudBackend) return;
    void store.actions.restoreCloudSession();
    const unsubscribe = authOnStateChange((payload) => {
      if (payload.kind === "signed-out") {
        if (store.getState().currentUserId) {
          store.actions.logout();
        }
        return;
      }
      if (payload.kind === "session") {
        // Cross-tab/session refresh: keep the local identity coherent.
        const current = store.getState().currentUserId;
        if (!current) void store.actions.restoreCloudSession();
        return;
      }
      if (payload.kind === "inactive") {
        // A suspension elsewhere: clear locally so a suspended user can't keep working.
        if (payload.code === "PROFILE_SUSPENDED" && store.getState().currentUserId) {
          store.actions.logout();
        }
        // Otherwise: profile fetch issues are transient — stay put and let retry work.
      }
    });
    return unsubscribe;
  }, []);

  // Invitation and password-reset links always take priority over any active
  // session, so the recipient's acceptance form is shown even when an
  // administrator is signed in on the same browser.
  const authRoute = parseAuthMode();
  if (!user || authRoute.mode !== "signin") return <LoginScreen />;

  // Force password change on first login or after admin reset.
  if (user.mustChangePassword && !window.location.hash.includes("/admin/invite/") && !window.location.hash.includes("/admin/reset/")) {
    return <ForcedPasswordChange userName={user.fullName} />;
  }

  const visibleModules = modules
    .filter((mod) => can(user, mod.permission, "view"))
    .map((mod) => mod.id === "bookings" ? { ...mod, badge: newBookingsCount } : mod);
  const grouped = visibleModules.reduce((acc, mod) => {
    if (!acc[mod.section]) acc[mod.section] = [];
    acc[mod.section].push(mod);
    return acc;
  }, {} as Record<string, ModuleDef[]>);

  return (
    <div className={`olk-admin-layout flex h-screen bg-[var(--admin-bg)] text-[var(--admin-fg)] ${theme === "light" ? "theme-light" : "theme-dark"}`}>
      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 64 : 260 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="flex flex-col border-r border-[var(--admin-border)] bg-[var(--admin-surface)]"
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-[var(--admin-border)] px-4">
          {!sidebarCollapsed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--admin-accent)] to-amber-700">
                <span className="font-serif text-sm font-medium text-white">O</span>
              </div>
              <div>
                <p className="text-[13px] font-medium text-[var(--admin-fg)]">Olkinyei</p>
                <p className="text-[10px] text-[var(--admin-fg-muted)]">Admin CMS</p>
              </div>
            </motion.div>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--admin-surface-2)] transition-colors"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} className="rotate-90" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-4">
          {Object.entries(grouped).map(([section, mods]) => (
            <div key={section} className="mb-6">
              {!sidebarCollapsed && (
                <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--admin-fg-muted)]">{section}</p>
              )}
              <div className="space-y-0.5">
                {mods.map((mod) => {
                  const isActive = currentModule === mod.id;
                  return (
                    <button
                      key={mod.id}
                      onClick={() => onNavigate(mod.path)}
                      className={`olk-nav-item flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] transition-all ${
                        isActive ? "bg-[var(--admin-accent)]/10 text-[var(--admin-accent)] font-medium" : "text-[var(--admin-fg-muted)] hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)]"
                      } ${sidebarCollapsed ? "justify-center" : ""}`}
                      title={sidebarCollapsed ? mod.label : undefined}
                    >
                      <mod.icon size={16} />
                      {!sidebarCollapsed && (
                        <>
                          <span className="flex-1">{mod.label}</span>
                          {mod.badge && mod.badge > 0 && (
                            <span className="rounded-full bg-[var(--admin-accent)] px-1.5 py-0.5 text-[10px] font-medium text-white">{mod.badge}</span>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User profile */}
        <div className="border-t border-[var(--admin-border)] p-3">
          {!sidebarCollapsed ? (
            <div className="flex items-center gap-2.5">
              <Avatar src={user.avatar} name={user.fullName} size={32} />
              <div className="flex-1 min-w-0">
                <p className="truncate text-[12.5px] font-medium text-[var(--admin-fg)]">{user.fullName}</p>
                <p className="truncate text-[10.5px] text-[var(--admin-fg-muted)]">{user.role.replace(/_/g, " ")}</p>
              </div>
              <button
                onClick={() => store.actions.logout()}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--admin-fg-muted)] hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)] transition-colors"
                aria-label="Log out"
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => store.actions.logout()}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--admin-fg-muted)] hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)] transition-colors mx-auto"
              aria-label="Log out"
            >
              <LogOut size={14} />
            </button>
          )}
        </div>
      </motion.aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex h-16 items-center justify-between border-b border-[var(--admin-border)] bg-[var(--admin-surface)] px-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowCommandPalette(true)}
              className="flex h-9 w-[280px] items-center gap-2 rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface-2)] px-3 text-left text-[12.5px] text-[var(--admin-fg-muted)] transition-colors hover:border-[var(--admin-accent)] hover:text-[var(--admin-fg)]"
            >
              <Search size={14} />
              <span className="flex-1">Search everything...</span>
              <kbd className="flex items-center gap-0.5 rounded border border-[var(--admin-border)] bg-[var(--admin-surface)] px-1 py-0.5 text-[10px]">
                <Command size={9} />K
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { window.location.hash = ""; window.location.reload(); }}
              className="flex h-9 items-center gap-2 rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface-2)] px-3 text-[12px] text-[var(--admin-fg-muted)] hover:text-[var(--admin-fg)] hover:border-[var(--admin-accent)]/50 transition-colors"
              aria-label="Return to public site"
            >
              <ExternalLink size={13} />
              <span className="hidden sm:inline">View Website</span>
            </button>
            <button
              onClick={() => store.actions.setTheme(theme === "dark" ? "light" : "dark")}
              className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--admin-fg-muted)] hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)] transition-colors"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--admin-fg-muted)] hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)] transition-colors relative"
              aria-label="Notifications"
            >
              <Bell size={16} />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--admin-accent)]" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-[var(--admin-bg)]">
          <div className="mx-auto max-w-7xl px-6 py-8">
            {children}
          </div>
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette
        open={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        items={modules.map((mod) => ({
          id: mod.id,
          label: mod.label,
          description: mod.section,
          icon: <mod.icon size={14} />,
          section: mod.section,
          action: () => onNavigate(mod.path),
        }))}
      />
    </div>
  );
}

// ============ Login / Recovery / Activation Screens ============
// All invitation and password tokens belong to Supabase Auth. Emailed links
// arrive at /auth/callback (consumed via verifyOtp) and continue at
// /auth/set-password. There are no app-issued tokens.

type AuthMode = "signin" | "forgot" | "set-password";

function parseAuthMode(): { mode: AuthMode } {
  if (isAuthPath()) return { mode: "set-password" };
  const hash = window.location.hash.replace(/^#/, "");
  if (hash.includes("type=invite") || hash.includes("type=recovery") || hash.startsWith("/admin/set-password")) {
    return { mode: "set-password" };
  }
  return { mode: "signin" };
}

function PasswordStrengthMeter({ password }: { password: string }) {
  const checks = [
    { label: "At least 10 characters", ok: password.length >= 10 },
    { label: "Uppercase letter", ok: /[A-Z]/.test(password) },
    { label: "Lowercase letter", ok: /[a-z]/.test(password) },
    { label: "Number", ok: /[0-9]/.test(password) },
    { label: "Symbol", ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter((c) => c.ok).length;
  const width = (score / checks.length) * 100;
  const colors = ["#dc2626", "#ea580c", "#d97706", "#65a30d", "#16a34a"];
  return (
    <div className="mt-2 space-y-2">
      <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--admin-surface-2)]">
        <div className="h-full transition-all duration-300" style={{ width: `${width}%`, background: colors[Math.max(0, score - 1)] || colors[0] }} />
      </div>
      <ul className="grid grid-cols-2 gap-1 text-[10.5px]">
        {checks.map((c) => (
          <li key={c.label} className={c.ok ? "text-emerald-400" : "text-[var(--admin-fg-muted)]"}>
            {c.ok ? "✓" : "○"} {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SignInForm({ onSuccess, onForgot }: { onSuccess: () => void; onForgot: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await store.actions.login(email, password);
    setLoading(false);
    if (!result.ok) setError(result.message || "Sign-in failed."); else onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Work email</label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@olkinyei.com" required autoComplete="email" autoFocus />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Password</label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required autoComplete="current-password" />
      </div>
      {error && (
        <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-400" role="alert">
          {error}
        </motion.div>
      )}
      <Button type="submit" loading={loading} className="w-full" size="lg">Sign in</Button>
      <div className="flex items-center justify-between pt-1 text-[11px]">
        <button type="button" onClick={onForgot} className="text-[var(--admin-fg-muted)] hover:text-[var(--admin-accent)] transition-colors">
          Forgot password?
        </button>
        <span className="text-[var(--admin-fg-muted)]/60">Staff accounts only</span>
      </div>
      <p className="pt-2 text-center text-[11px] text-[var(--admin-fg-muted)]">
        Access is by invitation from the Root Super Admin.
      </p>
    </form>
  );
}

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!hasCloudBackend) { setError("Password resets require the Supabase cloud database. Contact your administrator for a reset link."); return; }
    setLoading(true);
    await authRequestPasswordReset(email);
    setLoading(false);
    setSent(true); // identical outcome whether or not the email exists.
  };

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">✓</div>
        <h2 className="font-serif text-2xl font-light">Check your email</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--admin-fg-muted)]">
          If an account exists for <span className="font-medium text-[var(--admin-fg)]">{email}</span>, you will receive a reset link shortly. It expires in 30 minutes.
        </p>
        <button onClick={onBack} className="mt-5 text-[12px] text-[var(--admin-accent)] hover:underline">Back to sign in</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Work email</label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@olkinyei.com" required autoFocus />
      </div>
      {error && <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-400" role="alert">{error}</div>}
      <Button type="submit" loading={loading} className="w-full" size="lg">Send reset link</Button>
      <button type="button" onClick={onBack} className="w-full text-center text-[11px] text-[var(--admin-fg-muted)] hover:text-[var(--admin-fg)]">Back to sign in</button>
    </form>
  );
}

function SetPasswordForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (!hasCloudBackend) {
      setError("Cloud setup links require the Supabase cloud database to be connected.");
      return;
    }
    setLoading(true);
    const result = await authSetPasswordAfterRecovery(password);
    setLoading(false);
    if (!result.ok) { setError(result.message || "Could not update your password. Open the link from your email again."); return; }
    setDone(true);
    window.setTimeout(onDone, 900);
  };

  if (done) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">✓</div>
        <h2 className="font-serif text-2xl font-light">Account ready</h2>
        <p className="mt-2 text-[13px] text-[var(--admin-fg-muted)]">Your password has been set. Redirecting you to sign in…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Create your password</label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" autoFocus />
        {password && <PasswordStrengthMeter password={password} />}
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Confirm password</label>
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
      </div>
      {error && <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-400" role="alert">{error}</div>}
      <Button type="submit" loading={loading} className="w-full" size="lg">Activate account</Button>
    </form>
  );
}

function ForcedPasswordChange({ userName }: { userName: string }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    const result = await store.actions.changeOwnPassword(current, password);
    setLoading(false);
    if (!result.ok) setError(result.message || "Could not update password.");
  };

  return (
    <div className="olk-login-screen flex min-h-screen items-center justify-center bg-[var(--admin-bg)] p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--admin-accent)] to-amber-700">
            <span className="font-serif text-2xl font-medium text-white">O</span>
          </div>
          <h1 className="font-serif text-3xl font-light text-[var(--admin-fg)]">Set a new password</h1>
          <p className="mt-2 text-[13px] text-[var(--admin-fg-muted)]">
            Welcome, {userName}. For security, please choose a new password before continuing.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Current password</label>
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoFocus autoComplete="current-password" />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">New password</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
            {password && <PasswordStrengthMeter password={password} />}
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Confirm new password</label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
          </div>
          {error && <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-400" role="alert">{error}</div>}
          <Button type="submit" loading={loading} className="w-full" size="lg">Update password</Button>
          <button type="button" onClick={() => store.actions.logout()} className="w-full text-center text-[11px] text-[var(--admin-fg-muted)] hover:text-[var(--admin-fg)]">
            Sign out instead
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function LoginScreen() {
  const [mode, setMode] = useState<AuthMode>(() => parseAuthMode().mode);
  const [linkError, setLinkError] = useState("");
  const [consumingLink, setConsumingLink] = useState(() => isAuthPath());

  // Emailed invitation/recovery links land at /auth/callback. Consume the
  // Supabase token once, then show either the password form or a clear error.
  useEffect(() => {
    let active = true;
    if (!isAuthPath()) { setConsumingLink(false); return; }
    void (async () => {
      const result = await consumeAuthCallback();
      if (!active) return;
      clearAuthQuery();
      setConsumingLink(false);
      if (!result.consumed || !result.needsPassword) {
        setLinkError(result.message ?? "This link is no longer valid. Ask for a new one.");
        setMode("signin");
        return;
      }
      setMode("set-password");
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const handler = () => { if (!isAuthPath()) setMode(parseAuthMode().mode); };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const goSignIn = () => {
    window.history.replaceState({}, document.title, "/");
    window.location.hash = "#/admin";
    setLinkError("");
    setMode("signin");
  };

  return (
    <div className="olk-login-screen flex min-h-screen items-center justify-center bg-[var(--admin-bg)] p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--admin-accent)] to-amber-700">
            <span className="font-serif text-2xl font-medium text-white">O</span>
          </div>
          <h1 className="font-serif text-3xl font-light text-[var(--admin-fg)]">
            {consumingLink ? "Verifying your link"
              : mode === "forgot" ? "Reset your password"
              : mode === "set-password" ? "Finish setting up"
              : "Sign in"}
          </h1>
          <p className="mt-2 text-[13px] text-[var(--admin-fg-muted)]">Olkinyei Studio · Private Administration</p>
        </div>

        {consumingLink && (
          <div className="flex items-center justify-center gap-2 py-6 text-[13px] text-[var(--admin-fg-muted)]">
            <span className="olk-skeleton inline-block h-2 w-2 rounded-full" /> Verifying secure link…
          </div>
        )}
        {!consumingLink && mode === "signin" && (
          <>
            {linkError && <div className="mb-4 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-400" role="alert">{linkError}</div>}
            <SignInForm onSuccess={goSignIn} onForgot={() => setMode("forgot")} />
          </>
        )}
        {!consumingLink && mode === "forgot" && <ForgotPasswordForm onBack={() => setMode("signin")} />}
        {!consumingLink && mode === "set-password" && <SetPasswordForm onDone={goSignIn} />}

        <p className="mt-6 text-center text-[10.5px] text-[var(--admin-fg-muted)]">
          Authorised access only · All activity is audited
        </p>
      </motion.div>
    </div>
  );
}

export { modules };
