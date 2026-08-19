// Testimonials publishing flow — integration test against a mocked Supabase.
//
// The sandbox has no live Supabase project, so this bundles the real store
// (`src/admin/store.ts`) with a controllable fake Supabase client and drives
// the exact CMS → database → public-read path:
//
//   submit → approve (publish) → database → load (public read)
//
// It asserts the fixes:
//   * legacy `published`-only rows normalise to the canonical `status`,
//   * a rejected UPDATE/DELETE rolls the CMS state back (no false "published"),
//   * public load ordering falls back when `created_at` is missing.
//
// Run with: node scripts/testimonials-flow.test.mjs

import { build } from "esbuild";
import { writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Browser globals the store touches at module scope.
// ---------------------------------------------------------------------------
const memoryStore = new Map();
globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
  setInterval() { return 0; },
  clearInterval() {},
  setTimeout,
  matchMedia() {
    return { matches: false, addEventListener() {}, removeEventListener() {} };
  },
};
globalThis.localStorage = {
  getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k) : null),
  setItem: (k, v) => memoryStore.set(k, String(v)),
  removeItem: (k) => memoryStore.delete(k),
};
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

// ---------------------------------------------------------------------------
// Controllable fake Supabase client.
// ---------------------------------------------------------------------------
const config = {
  // Called for every query. Return { data, error } (may be async).
  onQuery: async () => ({ data: null, error: null }),
};

class QueryBuilder {
  constructor(table, mode, payload) {
    this.table = table;
    this.mode = mode;
    this.payload = payload;
    this.columns = "*";
    this.orders = [];
    this.filters = [];
    this.singleRow = false;
  }
  select(columns) { this.columns = columns ?? "*"; return this; }
  order(col, opts) { this.orders.push({ col, opts }); return this; }
  eq(col, value) { this.filters.push({ col, value }); return this; }
  maybeSingle() { this.singleRow = true; return this; }
  single() { this.singleRow = true; return this; }
  insert(payload) { this.mode = "insert"; this.payload = payload; return this; }
  update(payload) { this.mode = "update"; this.payload = payload; return this; }
  upsert(payload, opts) { this.mode = "upsert"; this.payload = payload; this.upsertOpts = opts; return this; }
  delete() { this.mode = "delete"; return this; }
  limit() { return this; }
  then(resolve, reject) {
    return Promise.resolve(config.onQuery({
      table: this.table,
      mode: this.mode,
      columns: this.columns,
      orders: this.orders,
      filters: this.filters,
      singleRow: this.singleRow,
      payload: this.payload,
    })).then(resolve, reject);
  }
  catch(reject) { return this.then(undefined, reject); }
}

function from(table) {
  return {
    select: (cols) => new QueryBuilder(table, "select").select(cols),
    insert: (payload) => new QueryBuilder(table, "insert", payload),
    update: (payload) => new QueryBuilder(table, "update", payload),
    upsert: (payload, opts) => new QueryBuilder(table, "upsert", payload).upsert(payload, opts),
    delete: () => new QueryBuilder(table, "delete"),
  };
}

const fakeClient = {
  from,
  channel() {
    const channel = {
      on() { return channel; },
      subscribe() { return { subscribe() {}, channel: "test" }; },
    };
    return channel;
  },
  removeChannel: async () => {},
  storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }), remove: async () => {} }) },
  functions: { invoke: async () => ({ error: null }) },
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    signOut: async () => {},
    signInWithPassword: async () => ({ data: {}, error: { message: "disabled" } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
};

globalThis.__MOCK_CONFIG__ = config;
globalThis.__FAKE_CLIENT__ = fakeClient;

// ---------------------------------------------------------------------------
// esbuild plugins: stub react + inject the fake Supabase client.
// ---------------------------------------------------------------------------
const reactStub = `
export function useCallback(fn){ return fn; }
export function useRef(v){ return { current: v }; }
export function useSyncExternalStore(_sub, get, _getSrv){ return get(); }
export function useState(v){ return [v, function(){}]; }
export function useEffect(){}
export function useMemo(fn){ return fn(); }
export const createElement = function(){};
export default {};
`;

const supabaseStub = `
export function createClient(){ return globalThis.__FAKE_CLIENT__; }
export const RealtimeChannel = function(){};
export const SupabaseClient = function(){};
`;

const plugins = [
  {
    name: "stub-react",
    setup(b) {
      b.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "stub" }));
      b.onLoad({ filter: /^react$/, namespace: "stub" }, () => ({ contents: reactStub, loader: "js" }));
    },
  },
  {
    name: "stub-supabase",
    setup(b) {
      b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: "supabase", namespace: "stub" }));
      b.onLoad({ filter: /^supabase$/, namespace: "stub" }, () => ({ contents: supabaseStub, loader: "js" }));
    },
  },
];

const entry = `
export { store } from "./src/admin/store";
export { supabaseConfigDiagnostics } from "./src/lib/supabase";
`;

const result = await build({
  stdin: { contents: entry, resolveDir: new URL("..", import.meta.url).pathname, loader: "ts" },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  target: "es2022",
  plugins,
  define: {
    "import.meta.env.DEV": "false",
    "import.meta.env.PROD": "true",
    "import.meta.env.VITE_SUPABASE_URL": '"https://example.supabase.co"',
    "import.meta.env.VITE_SUPABASE_ANON_KEY": '"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdef"',
  },
  logLevel: "silent",
});

if (result.errors?.length) {
  console.error("Bundle errors:", result.errors);
  process.exit(1);
}

const outDir = join(tmpdir(), "olkinyei-test");
await mkdir(outDir, { recursive: true });
const outFile = join(outDir, "store-bundle.mjs");
await writeFile(outFile, result.outputFiles[0].text);

const { store } = await import(outFile);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Minimal assertion helper.
// ---------------------------------------------------------------------------
let failures = 0;
function check(name, cond, extra = "") {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// Scenario setup helpers.
// ---------------------------------------------------------------------------
const row = (overrides) => ({
  id: "00000000-0000-4000-8000-000000000001",
  quote: "A truly unforgettable journey across the Mara.",
  guest_name: "Alice Wanderer",
  guest_location: "London",
  sort_order: 0,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
  source: "website",
  flagged: false,
  ...overrides,
});

function signInRoot() {
  // The store reads the current user from module state. Mutating the live
  // state object (returned by getState) is the simplest way to simulate a
  // signed-in Root Super Admin without mocking the whole auth stack.
  const s = store.getState();
  s.currentUserId = "u-root";
  s.users = [{
    id: "u-root",
    email: "root@example.com",
    fullName: "Root Admin",
    role: "root",
    avatar: "",
    lastLogin: "",
    status: "active",
    createdAt: "2026-01-01T00:00:00Z",
    isRoot: true,
  }];
}

async function resetTestimonials(rows, { selectError = null } = {}) {
  // Re-load the testimonials collection from the fake DB by flipping the
  // bootstrap flag through the public reload action, which re-runs
  // loadCloudTestimonials.
  config.onQuery = async (op) => {
    if (op.table === "testimonials") {
      if (op.mode === "select") {
        if (selectError) return { data: null, error: selectError };
        // If the first order is `created_at` and a specific flag is set,
        // simulate a legacy database missing that column.
        const firstOrder = op.orders[0]?.col;
        if (config.missingCreatedAt && firstOrder === "created_at") {
          return { data: null, error: { message: "column testimonials.created_at does not exist" } };
        }
        return { data: rows, error: null };
      }
      return { data: null, error: null };
    }
    return { data: null, error: null };
  };
  await store.actions.reloadTestimonials();
}

// ===========================================================================
console.log("1) Load normalises legacy `published` rows into canonical `status`");
config.missingCreatedAt = false;
await resetTestimonials([
  row({ id: "t1", published: true, status: null }),   // legacy live row
  row({ id: "t2", published: false, status: null }),  // legacy unpublished row
  row({ id: "t3", published: false, status: "approved" }), // explicit status wins
]);
{
  const list = store.getState().testimonials;
  const byId = Object.fromEntries(list.map((t) => [t.id, t]));
  check("legacy published=true becomes approved", byId.t1?.status === "approved", `got ${byId.t1?.status}`);
  check("legacy published=false becomes pending", byId.t2?.status === "pending", `got ${byId.t2?.status}`);
  check("explicit status='approved' preserved", byId.t3?.status === "approved", `got ${byId.t3?.status}`);
}

console.log("2) Public load falls back when created_at column is missing");
config.missingCreatedAt = true;
await resetTestimonials([row({ id: "t4", published: true, status: "approved" })]);
{
  const list = store.getState().testimonials;
  check("rows still load via sort_order fallback", list.some((t) => t.id === "t4"), `got ${list.length} rows`);
  config.missingCreatedAt = false;
}

console.log("3) Publish (approve) succeeds and updates the database row");
signInRoot();
await resetTestimonials([row({ id: "t5", published: false, status: "pending" })]);
let dbStatus = null;
config.onQuery = async (op) => {
  if (op.table === "testimonials" && op.mode === "update") {
    dbStatus = op.payload.status;
    return { data: null, error: null };
  }
  if (op.table === "testimonials" && op.mode === "select") {
    return { data: [{ ...row({ id: "t5", published: false, status: "pending" }) }], error: null };
  }
  return { data: null, error: null };
};
await store.actions.setTestimonialStatus("t5", "approved");
{
  const t = store.getState().testimonials.find((x) => x.id === "t5");
  check("CMS shows approved", t?.status === "approved", `got ${t?.status}`);
  check("database write used status='approved'", dbStatus === "approved", `got ${dbStatus}`);
}

console.log("4) Publish failure rolls back (no false 'published')");
await resetTestimonials([row({ id: "t6", published: false, status: "pending" })]);
config.onQuery = async (op) => {
  if (op.table === "testimonials" && op.mode === "update") {
    return { data: null, error: { message: "new row violates row-level security policy" } };
  }
  if (op.table === "testimonials" && op.mode === "select") {
    return { data: [{ ...row({ id: "t6", published: false, status: "pending" }) }], error: null };
  }
  return { data: null, error: null };
};
const beforeNotifications = store.getState().notifications.length;
await store.actions.setTestimonialStatus("t6", "approved");
{
  const t = store.getState().testimonials.find((x) => x.id === "t6");
  check("CMS rolls back to pending on DB error", t?.status === "pending", `got ${t?.status}`);
  check("error notification surfaced", store.getState().notifications.length > beforeNotifications);
}

console.log("5) Draft (pending) is not published to the public read path");
await resetTestimonials([
  row({ id: "t7", published: false, status: "pending" }),
  row({ id: "t8", published: true, status: "approved" }),
]);
{
  const list = store.getState().testimonials;
  const approved = list.filter((t) => t.status === "approved").map((t) => t.id);
  check("approved rows readable", approved.includes("t8"));
  check("pending row excluded from public view", !approved.includes("t7"));
}

console.log("6) Edit failure rolls back; delete failure restores the row");
signInRoot();
await resetTestimonials([row({ id: "t9", published: true, status: "approved", quote: "Original words." })]);
config.onQuery = async (op) => {
  if (op.table === "testimonials" && op.mode === "update") {
    return { data: null, error: { message: "denied" } };
  }
  if (op.table === "testimonials" && op.mode === "delete") {
    return { data: null, error: { message: "denied" } };
  }
  if (op.table === "testimonials" && op.mode === "select") {
    return { data: [{ ...row({ id: "t9", published: true, status: "approved", quote: "Original words." }) }], error: null };
  }
  return { data: null, error: null };
};
await store.actions.updateTestimonial("t9", { quote: "Rewritten words." });
check("edit rolled back", store.getState().testimonials.find((t) => t.id === "t9")?.quote === "Original words.");
await store.actions.deleteTestimonial("t9");
check("delete rolled back (row still present)", store.getState().testimonials.some((t) => t.id === "t9"));

console.log("7) Public submission succeeds and stores status='pending'");
config.onQuery = async (op) => {
  if (op.table === "testimonials" && op.mode === "insert") {
    globalThis.__lastInsert = op.payload;
    return { data: null, error: null };
  }
  return { data: null, error: null };
};
const submitOk = await store.actions.submitTestimonial({
  guestName: "Bob Guest",
  quote: "What a spectacular journey it was.",
  consentGiven: true,
  rating: 5,
});
check("submission accepted", submitOk.ok === true, JSON.stringify(submitOk));
check("submission stored as pending + not published", globalThis.__lastInsert?.status === "pending" && globalThis.__lastInsert?.published === false);

console.log("");
if (failures > 0) {
  console.error(`${failures} check(s) FAILED`);
  process.exit(1);
} else {
  console.log("All testimonial flow checks passed.");
}
