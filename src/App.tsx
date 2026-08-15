import {
  FormEvent,
  KeyboardEvent,
  ReactNode,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useMotionValue, useSpring } from "framer-motion";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import Lenis from "lenis";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock3,
  Compass,
  Download,
  ExternalLink,
  Eye,
  Filter,
  Headphones,
  Menu,
  Minus,
  Pause,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Star,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  Booking,
  Destination,
  blogPosts,
  destinations,
  galleryItems,
  imagery,
  timeline,
} from "./data";
import type { SafariPackage } from "./admin/types";
import {
  getCloudBookings,
  hasCloudBackend,
  persistBooking,
  subscribeToBookings,
  supabase,
} from "./lib/supabase";
import { store as cmsStore, useStore as useCmsStore } from "./admin/store";
import { SOURCE_LABELS } from "./admin/reviewProviders";

gsap.registerPlugin(ScrollTrigger, SplitText, MorphSVGPlugin);

const SafariSky = lazy(() => import("./SafariSky"));
const AdminApp = lazy(() => import("./admin/AdminApp"));

type Page = "home" | "about" | "experiences" | "destinations" | "gallery" | "journal" | "contact";
type EditableContent = {
  homeStatement: string;
  conservationStatement: string;
  contactEmail: string;
};

const ROUTES: Record<Page, string> = {
  home: "/",
  about: "/about",
  experiences: "/safari-experiences",
  destinations: "/destinations",
  gallery: "/gallery",
  journal: "/journal",
  contact: "/contact",
};

// Field Notes and Journal are one destination. `gallery` still exists as a
// route so historic /gallery links keep working (see pageFromPath).
const navItems: { page: Page; label: string }[] = [
  { page: "home", label: "Home" },
  { page: "about", label: "Our Story" },
  { page: "experiences", label: "Safaris" },
  { page: "destinations", label: "Destinations" },
  { page: "journal", label: "Field Notes & Journal" },
  { page: "contact", label: "Plan Your Journey" },
];

const defaultContent: EditableContent = {
  homeStatement: "There is a moment when the plains stop being scenery and become something felt. We design every journey around that moment.",
  conservationStatement: "Every expedition contributes directly to land leases, guide education and community-led conservation in the places we travel.",
  contactEmail: "journeys@olkinyei.com",
};

const emptyBooking: Omit<Booking, "reference" | "createdAt" | "status"> = {
  safari: "",
  startDate: "",
  endDate: "",
  adults: 2,
  children: 0,
  accommodation: "A considered mix of camps and lodges",
  pickup: "Hotel or residence",
  airport: "Jomo Kenyatta International Airport (NBO)",
  budget: "$8,000 - $12,000 per person",
  requests: "",
  payment: "Secure card payment",
  name: "",
  email: "",
  phone: "",
};

function pageFromPath(pathname: string): Page {
  const cleanPath = pathname !== "/" ? pathname.replace(/\/$/, "") : pathname;
  // Article routes (/journal/<slug>) render inside the journal page.
  if (cleanPath.startsWith("/journal/")) return "journal";
  // Field Notes merged into the Journal. Legacy /gallery links still resolve.
  if (cleanPath === "/gallery" || cleanPath.startsWith("/gallery/")) return "journal";
  const match = (Object.keys(ROUTES) as Page[]).find((key) => ROUTES[key] === cleanPath);
  return match ?? "home";
}

// Returns the article slug when the URL points at a single post.
function postSlugFromPath(pathname: string): string | null {
  const cleanPath = pathname !== "/" ? pathname.replace(/\/$/, "") : pathname;
  const match = cleanPath.match(/^\/journal\/([A-Za-z0-9-]+)$/);
  return match ? match[1] : null;
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function Logo({ compact = false }: { compact?: boolean }) {
  const site = useCmsStore((state) => state.siteSettings);
  const hasCustomLogo = Boolean(site.logo && site.logo !== "/logo.svg");
  if (hasCustomLogo) {
    return <span className={`brand-lockup brand-lockup--uploaded ${compact ? "brand-lockup--compact" : ""}`}><img src={site.logo} alt={site.brandName} className="brand-uploaded-logo" /></span>;
  }
  return (
    <span className={`brand-lockup ${compact ? "brand-lockup--compact" : ""}`}>
      <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" strokeWidth="1" />
        <circle cx="32" cy="23" r="8" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M11 43c8-4 14-5 21-3 8 2 13 1 21-4" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M21 31c3 1 5 4 5 8m17-8c-3 1-5 4-5 8M24 17c-5-1-8-4-9-8m25 8c5-1 8-4 9-8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <span className="brand-wordmark">
        <strong>{site.brandName.replace(/\s+Expeditions$/i, "") || "OLKINYEI"}</strong>
        <small>EXPEDITIONS</small>
      </span>
    </span>
  );
}

function MagneticButton({ children, onClick, className = "", type = "button", disabled = false, ariaLabel }: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const onMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!ref.current || window.matchMedia("(pointer: coarse)").matches) return;
    const bounds = ref.current.getBoundingClientRect();
    gsap.to(ref.current, {
      x: (event.clientX - bounds.left - bounds.width / 2) * 0.16,
      y: (event.clientY - bounds.top - bounds.height / 2) * 0.16,
      duration: 0.35,
      ease: "power2.out",
    });
  };
  const reset = () => ref.current && gsap.to(ref.current, { x: 0, y: 0, duration: 0.6, ease: "elastic.out(1, .35)" });
  return (
    <button ref={ref} type={type} onClick={onClick} onPointerMove={onMove} onPointerLeave={reset} className={`magnetic-button ${className}`} disabled={disabled} aria-label={ariaLabel}>
      {children}
    </button>
  );
}

function Loader({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, 2200);
    return () => window.clearTimeout(timer);
  }, [onComplete]);
  return (
    <motion.div className="loader" exit={{ y: "-100%" }} transition={{ duration: 0.9, ease: [0.83, 0, 0.17, 1] }}>
      <div className="loader-compass"><Compass size={34} strokeWidth={1} /></div>
      <Logo />
      <div className="loader-line"><motion.span initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 1.8, ease: "easeInOut" }} /></div>
      <p>East Africa, unhurried</p>
      <button onClick={onComplete}>Enter now</button>
    </motion.div>
  );
}

function CustomCursor() {
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const springX = useSpring(x, { stiffness: 500, damping: 32 });
  const springY = useSpring(y, { stiffness: 500, damping: 32 });
  const [active, setActive] = useState(false);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      x.set(event.clientX - 8);
      y.set(event.clientY - 8);
      setActive(Boolean((event.target as HTMLElement).closest("a, button, [data-cursor]")));
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [x, y]);
  return <motion.div className={`cursor ${active ? "cursor--active" : ""}`} style={{ x: springX, y: springY }} aria-hidden="true" />;
}

function SoundToggle() {
  const [playing, setPlaying] = useState(false);
  const audio = useRef<{ context: AudioContext; source: AudioBufferSourceNode; gain: GainNode } | null>(null);
  const toggle = () => {
    if (audio.current) {
      const current = audio.current;
      current.gain.gain.exponentialRampToValueAtTime(0.0001, current.context.currentTime + 0.5);
      window.setTimeout(() => current.context.close(), 600);
      audio.current = null;
      setPlaying(false);
      return;
    }
    const context = new AudioContext();
    const frameCount = context.sampleRate * 4;
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) channel[index] = (Math.random() * 2 - 1) * 0.16;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = 680;
    gain.gain.value = 0.0001;
    source.connect(filter).connect(gain).connect(context.destination);
    source.start();
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 1.2);
    audio.current = { context, source, gain };
    setPlaying(true);
  };
  useEffect(() => () => { void audio.current?.context.close(); }, []);
  return (
    <button className="sound-toggle" onClick={toggle} aria-label={playing ? "Mute ambient savanna sound" : "Play ambient savanna sound"} aria-pressed={playing}>
      {playing ? <Volume2 size={16} /> : <VolumeX size={16} />}<span>{playing ? "Savanna on" : "Sound off"}</span>
    </button>
  );
}

function Header({ page, navigate }: { page: Page; navigate: (page: Page) => void }) {
  const site = useCmsStore((state) => state.siteSettings);
  const [open, setOpen] = useState(false);
  const select = (next: Page) => { setOpen(false); navigate(next); };
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);
  return (
    <>
      <header className="site-header">
        <button className="logo-button" onClick={() => select("home")} aria-label="Olkinyei Expeditions home"><Logo compact /></button>
        <div className="header-actions"><SoundToggle /><button className="menu-toggle" onClick={() => setOpen(true)} aria-expanded={open} aria-label="Open menu"><Menu size={20} /><span>Menu</span></button></div>
      </header>
      <AnimatePresence>
        {open && (
          <motion.div className="menu-panel" initial={{ clipPath: "inset(0 0 100% 0)" }} animate={{ clipPath: "inset(0 0 0% 0)" }} exit={{ clipPath: "inset(0 0 100% 0)" }} transition={{ duration: 0.75, ease: [0.83, 0, 0.17, 1] }}>
            <div className="menu-top"><Logo /><button onClick={() => setOpen(false)} aria-label="Close menu"><X /></button></div>
            <nav className="menu-links" aria-label="Main navigation">
              {navItems.map((item, index) => (
                <motion.button key={item.page} className={page === item.page ? "active" : ""} onClick={() => select(item.page)} initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.18 + index * 0.06 }}>
                  <span>0{index + 1}</span>{item.label}<ArrowRight />
                </motion.button>
              ))}
            </nav>
            <div className="menu-foot"><span>{site.addresses.map((entry) => entry.city).join(" / ")}</span><a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a><span>{site.phone}</span></div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function ScrollCue() {
  return <div className="scroll-cue"><ArrowDown size={16} /><span>Scroll to enter</span></div>;
}

function PageHero({ eyebrow, title, text, image, align = "left", children }: {
  eyebrow: string;
  title: string;
  text: string;
  image: string;
  align?: "left" | "center";
  children?: ReactNode;
}) {
  const cmsPage = useCmsStore((state) => state.pages.find((item) => item.route === window.location.pathname));
  const published = cmsPage?.published ? cmsPage : null;
  return (
    <section className={`page-hero page-hero--${align}`}>
      <img src={published?.heroImage || image} alt="" className="page-hero-image" fetchPriority="high" />
      <div className="page-hero-wash" />
      <div className="page-hero-copy"><p className="eyebrow">{published?.heroEyebrow || eyebrow}</p><h1 className="split-reveal">{published?.heroTitle || title}</h1><p>{published?.heroText || text}</p>{children}</div>
      <svg className="hero-morph" viewBox="0 0 1440 140" preserveAspectRatio="none" aria-hidden="true"><path className="morph-path" d="M0,108 C240,72 430,126 650,88 C900,45 1140,115 1440,68 L1440,140 L0,140 Z" fill="#f3ecdf" /></svg>
    </section>
  );
}

function SectionHeading({ number, eyebrow, title, text, dark = false }: { number?: string; eyebrow: string; title: string; text?: string; dark?: boolean }) {
  return (
    <div className={`section-heading ${dark ? "section-heading--dark" : ""}`} data-reveal>
      <div className="section-kicker">{number && <span>{number}</span>}<p>{eyebrow}</p></div><h2 className="split-reveal">{title}</h2>{text && <p className="section-copy">{text}</p>}
    </div>
  );
}

function ImageReveal({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return <div className={`image-reveal ${className}`} data-image-reveal><img src={src} alt={alt} loading="lazy" data-parallax /></div>;
}

function Footer({ navigate }: { navigate: (page: Page) => void; openAdmin?: () => void }) {
  const site = useCmsStore((state) => state.siteSettings);
  return (
    <footer className="footer">
      <div className="footer-main"><Logo /><h2>Go where the wild still sets the pace.</h2><MagneticButton className="button button--sand" onClick={() => navigate("contact")}>Begin a private journey <ArrowRight size={17} /></MagneticButton></div>
      <div className="footer-links">
        <div><span>Explore</span>{navItems.slice(1, 6).map((item) => <button key={item.page} onClick={() => navigate(item.page)}>{item.label}</button>)}</div>
        <div><span>Find us</span><a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a><a href={`tel:${site.phone.replace(/\s+/g, "")}`}>{site.phone}</a>{site.social.map((entry) => <a key={entry.platform} href={entry.url} target="_blank" rel="noreferrer">{entry.platform} <ExternalLink size={12} /></a>)}</div>
        <div><span>Field offices</span>{site.addresses.map((entry) => <p key={entry.city}>{entry.address}, {entry.city}</p>)}</div>
      </div>
      <div className="footer-legal"><span>&copy; {new Date().getFullYear()} {site.brandName}</span><span>Responsible travel, designed in East Africa</span><button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Back to top <ArrowDown className="rotate-180" size={14} /></button></div>
    </footer>
  );
}

function HomePage({ navigate, content, openSafari, onOpenPost }: { navigate: (page: Page) => void; content: EditableContent; openSafari: (safari: SafariPackage) => void; onOpenPost: (slug: string) => void }) {
  const cmsHome = useCmsStore((state) => state.pages.find((item) => item.route === "/"));
  const site = useCmsStore((state) => state.siteSettings);
  const liveSafaris = usePublishedSafaris();
  // Live blog posts from the CMS (Supabase blog_posts). Published only;
  // featured first, then newest. Static seed is just the offline fallback.
  const cmsPosts = useCmsStore((state) => state.blogPosts);
  const publishedPosts = useMemo(() => {
    const live = cmsPosts
      .filter((p) => p.status === "published" && Boolean(p.publishedAt))
      .sort((a, b) => {
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        return new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime();
      });
    if (live.length > 0) return live.slice(0, 3);
    return blogPosts.slice(0, 3).map((post, index) => ({
      id: `static-${index}`, slug: post.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      title: post.title, excerpt: "", body: "", category: post.category as "Wildlife", tags: [],
      heroImage: post.image, authorId: "u1", author: "Olkinyei", readingTime: 5,
      seo: { title: post.title, description: "" }, publishedAt: post.date, status: "published" as const,
      featured: index === 0, comments: 0, createdAt: post.date, updatedAt: post.date,
    }));
  }, [cmsPosts]);
  const [videoPlaying, setVideoPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const toggleVideo = () => {
    if (!videoRef.current) return;
    if (videoPlaying) videoRef.current.pause(); else void videoRef.current.play();
    setVideoPlaying(!videoPlaying);
  };
  return (
    <>
      <section className="home-hero">
        <video ref={videoRef} className="home-hero-media" autoPlay muted loop playsInline preload="metadata" poster={imagery.heroPoster} aria-label="Wildebeest and zebra moving across the African savanna"><source src={imagery.heroVideo} type="video/mp4" /></video>
        <div className="home-hero-grade" /><Suspense fallback={null}><SafariSky /></Suspense>
        <div className="home-hero-content">
          <p className="hero-location">{cmsHome?.published ? cmsHome.heroEyebrow : "Private journeys across Kenya and Tanzania"}</p>
          <div className="hero-brand split-reveal">{site.brandName.replace(/\s+Expeditions$/i, "").toUpperCase()}</div>
          <div className="hero-bottom"><div><h1>{cmsHome?.published ? cmsHome.heroTitle : <>East Africa,<br /><em>unhurried.</em></>}</h1><p>{cmsHome?.published ? cmsHome.heroText : "Private safaris shaped by the migration, not the clock."}</p></div><div className="hero-ctas"><MagneticButton className="button button--sand" onClick={() => navigate("contact")}>Book your safari <ArrowRight size={17} /></MagneticButton><button onClick={() => navigate("destinations")}>Explore Tanzania / Kenya</button><button onClick={() => navigate("experiences")}>Luxury experiences</button></div></div>
        </div>
        <button className="video-control" onClick={toggleVideo} aria-label={videoPlaying ? "Pause background film" : "Play background film"}>{videoPlaying ? <Pause size={14} /> : <Play size={14} />}</button><ScrollCue />
      </section>
      <section className="manifesto section-pad"><p className="vertical-label">THE OLKINYEI WAY</p><div className="manifesto-copy"><p className="eyebrow" data-reveal>Not a tour. A rare point of view.</p><h2 className="split-reveal">{content.homeStatement}</h2><button className="text-link" onClick={() => navigate("about")}>Discover our philosophy <ArrowRight size={16} /></button></div></section>
      <section className="migration-story">
        <div className="migration-image"><img src={imagery.migration} alt="A vast wildebeest herd crossing the Serengeti" loading="lazy" data-parallax /></div><div className="migration-overlay" />
        <div className="migration-copy"><p className="eyebrow">01 / THE GREAT MOVEMENT</p><h2 className="split-reveal">Two million lives.<br />One ancient instinct.</h2><p>We follow the rains north, positioning private camps near the migration without crowding its path.</p><button className="text-link text-link--light" onClick={() => { if (liveSafaris[0]) openSafari(liveSafaris[0]); }}>Follow the migration <ArrowRight size={16} /></button></div>
        <div className="migration-track" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /></div>
      </section>
      <section className="journeys section-pad">
        <SectionHeading number="02" eyebrow="SIGNATURE JOURNEYS" title="Made for how you want to feel." text="Each route is a beginning. Your naturalist and journey designer shape the final expedition around season, pace and curiosity." />
        <div className="journey-list">{liveSafaris.slice(0, 4).map((safari, index) => <button key={safari.id} className="journey-row" onClick={() => openSafari(safari)} data-cursor data-reveal><span className="journey-index">0{index + 1}</span><span className="journey-thumb"><img src={safari.image} alt="" loading="lazy" /></span><span className="journey-name">{safari.title}</span><span className="journey-meta">{safari.region}<br />{safari.duration}</span><span className="journey-arrow"><ArrowRight /></span></button>)}</div>
        <MagneticButton className="button button--outline" onClick={() => navigate("experiences")}>View all safaris <ArrowRight size={17} /></MagneticButton>
      </section>
      <section className="conservation-home"><ImageReveal src={imagery.elephant} alt="Elephant family walking through protected savanna" /><div className="conservation-copy"><p className="eyebrow">POSITIVE FOOTPRINT</p><h2 className="split-reveal">The wild is not ours to consume.</h2><p>{content.conservationStatement}</p><button className="text-link text-link--light" onClick={() => navigate("about")}>Our conservation commitments <ArrowRight size={16} /></button></div></section>
      <section className="journal-preview section-pad"><SectionHeading number="03" eyebrow="FROM THE FIELD" title="Notes carried back from the bush." /><div className="journal-grid">{publishedPosts.map((post, index) => <article key={post.id} data-reveal><ImageReveal src={post.heroImage} alt="" /><div><span>{post.category} / {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString(undefined, { day: "2-digit", month: "long", year: "numeric" }) : ""}</span><h3>{post.title}</h3><button onClick={() => onOpenPost(post.slug)} aria-label={`Read ${post.title}`}><ArrowRight /></button></div>{index === 0 && <p>{String(post.readingTime).padStart(2, "0")} min read</p>}</article>)}</div><MagneticButton className="button button--outline" onClick={() => navigate("journal")}>Read the journal <ArrowRight size={17} /></MagneticButton></section>
      <HomeTestimonialPreview navigate={navigate} />
    </>
  );
}

/**
 * Compact testimonial preview for the homepage. Reads the same approved
 * entries as the full section and links through rather than duplicating it.
 */
function HomeTestimonialPreview({ navigate }: { navigate: (page: Page) => void }) {
  // Same rule as TestimonialsSection: never derive a new array inside the
  // store selector, or useSyncExternalStore re-renders forever.
  const allTestimonials = useCmsStore((state) => state.testimonials);
  const featured = useMemo(
    () => allTestimonials.filter((item) => item.status === "approved").slice(0, 2),
    [allTestimonials],
  );
  if (featured.length === 0) return null;

  return (
    <section className="home-testimonials section-pad">
      <SectionHeading number="04" eyebrow="GUEST JOURNALS" title="In their words." />
      <div className="home-testimonial-grid">
        {featured.map((item) => (
          <blockquote key={item.id} data-reveal>
            {item.rating ? (
              <div className="testimonial-stars" aria-label={`Rated ${item.rating} out of 5`}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star key={star} size={13} fill={star <= item.rating! ? "currentColor" : "none"} strokeWidth={1.25} aria-hidden="true" />
                ))}
              </div>
            ) : null}
            <p>{item.quote.length > 220 ? `${item.quote.slice(0, 220).trimEnd()}…` : item.quote}</p>
            <cite>
              {item.guestName}{item.guestLocation ? ` / ${item.guestLocation}` : ""}
              <span className="testimonial-source">{item.source === "website" ? "Olkinyei Website" : `via ${SOURCE_LABELS[item.source]}`}</span>
            </cite>
          </blockquote>
        ))}
      </div>
      <MagneticButton className="button button--outline" onClick={() => navigate("journal")}>
        Read all testimonials <ArrowRight size={17} />
      </MagneticButton>
    </section>
  );
}

function AboutPage({ navigate }: { navigate: (page: Page) => void }) {
  return (
    <>
      <PageHero eyebrow="OUR STORY" title="Born here. Still led by wonder." text="An independent East African company creating private journeys with deep local knowledge and a light footprint." image={imagery.portrait} />
      <section className="about-intro section-pad"><p className="vertical-label">WHY WE EXIST</p><div><p className="eyebrow" data-reveal>A different measure of luxury</p><h2 className="split-reveal">Not more things. More time, more space, more meaning.</h2><div className="two-column-copy" data-reveal><p>Olkinyei was founded by naturalists who saw that the finest safari was not the fastest route between sightings. It was the one that left room for silence, surprise and genuine connection.</p><p>Today our journeys are still designed in Nairobi and Arusha by people who know these landscapes first-hand. We stay small by choice, pairing each guest with one journey designer and one exceptional guide.</p></div></div></section>
      <section className="story-split"><ImageReveal src={imagery.lion} alt="A lion resting quietly beneath a tree" /><div className="story-split-copy"><p className="eyebrow">OUR PHILOSOPHY</p><h2 className="split-reveal">Wait longer.<br />Go deeper.</h2><p>We avoid sighting-chasing and crowded routes. Longer stays in fewer places reveal the relationships that make an ecosystem whole: a storm gathering, a lioness listening, a guide reading a faint mark in the dust.</p><div className="principles"><div><span>01</span><h3>Private by design</h3><p>Your vehicle, guide and pace are entirely your own.</p></div><div><span>02</span><h3>Local by nature</h3><p>East African ownership keeps knowledge and value close to home.</p></div><div><span>03</span><h3>Light on the land</h3><p>Smaller camps and measured operations protect what draws us here.</p></div></div></div></section>
      <section className="timeline section-pad"><SectionHeading number="02" eyebrow="OUR JOURNEY" title="A small company with a long view." /><div className="timeline-list">{timeline.map((item) => <div key={item.year} data-reveal><strong>{item.year}</strong><span /><p>{item.text}</p></div>)}</div></section>
      <section className="guides section-pad dark-section"><SectionHeading number="03" eyebrow="YOUR GUIDES" title="The people who make the landscape legible." text="Career naturalists, gifted hosts and patient interpreters of the wild." dark /><div className="guide-feature"><div className="guide-portrait"><img src={imagery.portrait} alt="Senior safari guide Daniel Ole Nkoitoi" loading="lazy" /></div><div className="guide-quote"><blockquote>"The sighting is only the beginning. My work is to help you understand what led to it."</blockquote><p>Daniel Ole Nkoitoi / Senior guide, Maasai Mara</p><dl><div><dt>In the field</dt><dd>19 years</dd></div><div><dt>Speciality</dt><dd>Predator behaviour</dd></div><div><dt>Languages</dt><dd>Maa, Swahili, English</dd></div></dl></div></div></section>
      <section className="impact section-pad"><SectionHeading number="04" eyebrow="CONSERVATION" title="Travel can keep wild land wild." text="We work with conservancies, not around them. A transparent contribution from every guest funds habitat leases and locally chosen projects." /><div className="impact-lines"><p data-reveal><strong>Land</strong> Long-term leases protect migration corridors beyond national park borders.</p><p data-reveal><strong>People</strong> Local guide fellowships and supplier partnerships build durable livelihoods.</p><p data-reveal><strong>Wildlife</strong> Predator-proof bomas reduce conflict between herders and carnivores.</p></div><div className="awards-line"><span>Recognised by</span><strong>Conde Nast Traveller</strong><strong>Travel + Leisure</strong><strong>Safari Awards Africa</strong><strong>B Corp Pending</strong></div><MagneticButton className="button button--dark" onClick={() => navigate("contact")}>Travel with purpose <ArrowRight size={17} /></MagneticButton></section>
    </>
  );
}

function ExperienceModal({ safari, onClose, onBook }: { safari: SafariPackage; onClose: () => void; onBook: (safari: SafariPackage) => void }) {
  const [image, setImage] = useState(safari.gallery[0] ?? safari.image);
  const closeKey = (event: KeyboardEvent<HTMLDivElement>) => event.key === "Escape" && onClose();
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);
  return (
    <motion.div className="experience-modal" role="dialog" aria-modal="true" aria-labelledby="experience-title" tabIndex={-1} autoFocus onKeyDown={closeKey} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="experience-sheet" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ duration: 0.65, ease: [0.83, 0, 0.17, 1] }}>
        <button className="sheet-close" onClick={onClose} aria-label="Close safari details"><X /></button>
        <div className="sheet-gallery"><img src={image} alt={`${safari.title} safari landscape`} /><div>{safari.gallery.map((item, index) => <button key={item} onClick={() => setImage(item)} className={image === item ? "active" : ""} aria-label={`View gallery image ${index + 1}`}><img src={item} alt="" /></button>)}</div></div>
        <div className="sheet-content"><p className="eyebrow">{safari.region}</p><h2 id="experience-title">{safari.title}</h2><p className="sheet-summary">{safari.summary}</p><div className="sheet-facts"><span><Clock3 />{safari.duration}</span><span><CircleDollarSign />From {formatCurrency(safari.price)} pp</span><span><CalendarDays />{safari.availability.join(" / ")}</span></div><div className="route-map" aria-label={`Illustrated route map for ${safari.title}`}><svg viewBox="0 0 500 220" role="img"><path d="M30 175 C120 80 195 190 280 90 S405 130 470 40" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="5 7" /><circle cx="30" cy="175" r="6" /><circle cx="280" cy="90" r="6" /><circle cx="470" cy="40" r="6" /><text x="30" y="205">ARRIVE</text><text x="245" y="120">WILD CAMP</text><text x="410" y="27">FINAL LODGE</text></svg></div><p className="signature"><span>Signature moments</span>{safari.signature}</p><div className="include-grid"><div><h3>Included</h3>{safari.included.length > 0 ? safari.included.map((item) => <p key={item}><Check />{item}</p>) : <p>Every essential is included by default.</p>}</div><div><h3>Not included</h3>{safari.excluded.length > 0 ? safari.excluded.map((item) => <p key={item}><Minus />{item}</p>) : <p>Nothing further is excluded.</p>}</div></div><MagneticButton className="button button--dark" onClick={() => onBook(safari)}>Book this journey <ArrowRight size={17} /></MagneticButton></div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Published safari packages for the public website. This is the single read
 * path for safari packages: the shared CMS store loads `public.packages` from
 * Supabase, and we only filter by publication status here. There is no
 * hardcoded package list on the public side.
 */
function usePublishedSafaris(): SafariPackage[] {
  const cmsPackages = useCmsStore((state) => state.packages);
  return useMemo(() => cmsPackages
    .filter((pkg) => pkg.published && !pkg.archived)
    .map((pkg) => ({ ...pkg, gallery: pkg.gallery.length > 0 ? pkg.gallery : [pkg.image] })),
  [cmsPackages]);
}

function ExperiencesPage({ openSafari, onBook }: { openSafari: (safari: SafariPackage) => void; onBook: (safari: SafariPackage) => void }) {
  const [region, setRegion] = useState("All");
  const liveSafaris = usePublishedSafaris();
  const visible = liveSafaris.filter((safari) => region === "All" || safari.region.includes(region));
  return (
    <><PageHero eyebrow="PRIVATE SAFARIS" title="Journeys measured in moments." text="Eight signature routes, each privately guided and shaped around your pace." image={imagery.cheetah} /><section className="experiences-intro section-pad"><SectionHeading number="01" eyebrow="THE COLLECTION" title="A starting point, never a fixed itinerary." text="Choose the feeling that draws you. We will tailor the route, camps and rhythm to the season and the people travelling." /><div className="filter-bar" aria-label="Filter safaris by region"><Filter size={15} />{["All", "Serengeti", "Maasai Mara", "Tanzania"].map((item) => <button key={item} className={region === item ? "active" : ""} onClick={() => setRegion(item)}>{item}</button>)}</div></section>
      <section className="experience-catalogue">{visible.map((safari, index) => <article className="experience-item" key={safari.id} data-reveal><button className="experience-image" onClick={() => openSafari(safari)} aria-label={`View ${safari.title}`}><img src={safari.image} alt={`${safari.title} in ${safari.region}`} loading="lazy" /><span>View journey <ArrowRight /></span></button><div className="experience-number">{String(index + 1).padStart(2, "0")}</div><div className="experience-info"><p>{safari.region}</p><h2>{safari.title}</h2><p>{safari.summary}</p><dl><div><dt>Time</dt><dd>{safari.duration}</dd></div><div><dt>From</dt><dd>{formatCurrency(safari.price)} pp</dd></div><div><dt>Season</dt><dd>{safari.availability.slice(0, 4).join(" / ")}</dd></div></dl><div className="experience-actions"><button className="text-link" onClick={() => openSafari(safari)}>View details <ArrowRight size={16} /></button><button className="text-link" onClick={() => onBook(safari)}>Book now <ArrowRight size={16} /></button></div></div></article>)}</section>
      <section className="bespoke-banner"><div><p className="eyebrow">SOMETHING ELSE IN MIND?</p><h2>Let us make the map around you.</h2><p>Tell us what you love, who is travelling and how you want to feel. We will begin with a blank page.</p></div><MagneticButton className="button button--sand" onClick={() => { if (liveSafaris[0]) onBook(liveSafaris[0]); }}>Create a bespoke safari <ArrowRight size={17} /></MagneticButton></section></>
  );
}

function SafariMap({ selected, onSelect }: { selected: Destination; onSelect: (destination: Destination) => void }) {
  return <div className="safari-map"><svg viewBox="0 0 100 100" role="img" aria-label="Interactive map of safari destinations in Kenya and Tanzania"><defs><filter id="soft"><feGaussianBlur stdDeviation="1.2" /></filter></defs><path d="M28 7L69 12 88 32 83 55 70 94 31 89 15 55 18 25Z" fill="#273024" stroke="#8d916f" strokeWidth=".4" /><path d="M20 37C43 28 57 42 84 30M28 62C48 52 62 65 79 58" fill="none" stroke="#6f765a" strokeWidth=".35" strokeDasharray="2 2" /><path d="M25 65C36 60 44 72 58 67S74 72 82 65" fill="none" stroke="#b9b497" opacity=".45" filter="url(#soft)" /></svg>{destinations.map((destination) => <button key={destination.name} className={selected.name === destination.name ? "active" : ""} style={{ left: `${destination.coordinates[0]}%`, top: `${destination.coordinates[1]}%` }} onClick={() => onSelect(destination)} aria-label={`Select ${destination.name}`}><span /><small>{destination.name}</small></button>)}<p className="map-kenya">KENYA</p><p className="map-tanzania">TANZANIA</p></div>;
}

function DestinationsPage({ onBook }: { onBook: (safari: SafariPackage) => void }) {
  const [country, setCountry] = useState<"All" | "Kenya" | "Tanzania">("All");
  const [selected, setSelected] = useState(destinations[0]);
  const liveSafaris = usePublishedSafaris();
  const list = useMemo(() => destinations.filter((destination) => country === "All" || destination.country === country), [country]);
  useEffect(() => { if (!list.some((item) => item.name === selected.name)) setSelected(list[0]); }, [list, selected.name]);
  return (
    <><PageHero eyebrow="KENYA + TANZANIA" title="The map is only the beginning." text="From volcanic highlands to endless grassland, explore the places that shape our journeys." image={imagery.mara} /><section className="destinations-map-section"><div className="map-side"><p className="eyebrow">01 / EXPLORE EAST AFRICA</p><h2 className="split-reveal">Move through the wild.</h2><div className="country-switch">{(["All", "Kenya", "Tanzania"] as const).map((item) => <button key={item} onClick={() => setCountry(item)} className={country === item ? "active" : ""}>{item}</button>)}</div><div className="destination-list">{list.map((item) => <button key={item.name} className={selected.name === item.name ? "active" : ""} onClick={() => setSelected(item)}><span>{item.country}</span>{item.name}<ArrowRight /></button>)}</div></div><SafariMap selected={selected} onSelect={setSelected} /><AnimatePresence mode="wait"><motion.div className="destination-focus" key={selected.name} initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}><img src={selected.image} alt={`${selected.name} landscape`} /><div><p>{selected.country}</p><h3>{selected.name}</h3><p>{selected.description}</p><dl><div><dt>Best time</dt><dd>{selected.best}</dd></div><div><dt>Known for</dt><dd>{selected.animal}</dd></div></dl></div></motion.div></AnimatePresence></section>
      <section className="destination-editorial section-pad"><SectionHeading number="02" eyebrow="TWO COUNTRIES, ONE ECOSYSTEM" title="Cross the border. Keep the story whole." text="The migration ignores national lines. Combining Kenya and Tanzania reveals the full movement of herds, weather and seasons." /><div className="country-stories"><article><ImageReveal src={imagery.lion} alt="Lion in the Maasai Mara" /><span>KENYA</span><h3>Intimate conservancies and the open Mara.</h3><p>Night drives, walking and fewer vehicles beyond reserve boundaries.</p></article><article><ImageReveal src={imagery.crater} alt="Wildebeest on Tanzania grassland" /><span>TANZANIA</span><h3>Scale that changes your sense of distance.</h3><p>The Serengeti, crater highlands and elephant paths of Tarangire.</p></article></div></section><section className="map-cta"><p>Not sure where the season will take you?</p><h2>Let the wildlife choose the route.</h2><MagneticButton className="button button--sand" onClick={() => { if (liveSafaris[0]) onBook(liveSafaris[0]); }}>Talk to a safari designer <ArrowRight size={17} /></MagneticButton></section></>
  );
}

// ============ Public Journal (blog) ============
// Reads published posts from the shared CMS store (Supabase blog_posts).
// Drafts, scheduled, and archived posts are never served here.

function usePublishedPosts() {
  const cmsPosts = useCmsStore((state) => state.blogPosts);
  return useMemo(() => cmsPosts
    .filter((post) => post.status === "published" && Boolean(post.publishedAt))
    .sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime();
    }), [cmsPosts]);
}

function formatPostDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { day: "2-digit", month: "long", year: "numeric" });
}

function JournalPage({ onOpenPost }: { onOpenPost: (slug: string) => void }) {
  const posts = usePublishedPosts();
  const [category, setCategory] = useState("All");
  const categories = useMemo(() => ["All", ...Array.from(new Set(posts.map((post) => post.category)))], [posts]);
  const visible = posts.filter((post) => category === "All" || post.category === category);
  const [lead, ...rest] = visible;

  return (
    <>
      <PageHero eyebrow="FIELD NOTES & JOURNAL" title="Notes carried back from the bush." text="Field dispatches, photography, wildlife observations and practical guidance from the people who guide these landscapes." image={imagery.cheetah} />

      <section className="journal-page section-pad">
        <SectionHeading number="01" eyebrow="FROM THE FIELD" title="Long-form field notes." text="Every article is written by our guides, naturalists and journey designers in East Africa." />

        {posts.length === 0 ? (
          <div className="journal-empty" data-reveal>
            <p className="eyebrow">COMING SOON</p>
            <h3>New field notes are being written.</h3>
            <p>Our guides are in the field. Fresh dispatches will appear here shortly.</p>
          </div>
        ) : (
          <>
            {categories.length > 2 && (
              <div className="filter-bar journal-filter" aria-label="Filter journal by category">
                <Filter size={15} />
                {categories.map((item) => (
                  <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>
                ))}
              </div>
            )}

            {lead && (
              <article className="journal-lead" data-reveal>
                <button className="journal-lead-image" onClick={() => onOpenPost(lead.slug)} aria-label={`Read ${lead.title}`}>
                  <img src={lead.heroImage} alt="" loading="eager" data-parallax />
                </button>
                <div className="journal-lead-copy">
                  <p className="eyebrow">{lead.category} / {formatPostDate(lead.publishedAt)}</p>
                  <h2 className="split-reveal">{lead.title}</h2>
                  <p>{lead.excerpt}</p>
                  <div className="journal-meta">
                    <span>{lead.author}</span><span>·</span><span>{lead.readingTime} min read</span>
                  </div>
                  <button className="text-link" onClick={() => onOpenPost(lead.slug)}>Read the story <ArrowRight size={16} /></button>
                </div>
              </article>
            )}

            {rest.length > 0 && (
              <div className="journal-list">
                {rest.map((post) => (
                  <article key={post.id} className="journal-card" data-reveal>
                    <button className="journal-card-image" onClick={() => onOpenPost(post.slug)} aria-label={`Read ${post.title}`}>
                      <img src={post.heroImage} alt="" loading="lazy" />
                    </button>
                    <div className="journal-card-copy">
                      <span className="journal-card-meta">{post.category} / {formatPostDate(post.publishedAt)}</span>
                      <h3>{post.title}</h3>
                      <p>{post.excerpt}</p>
                      <div className="journal-meta">
                        <span>{post.author}</span><span>·</span><span>{post.readingTime} min read</span>
                      </div>
                      <button className="text-link" onClick={() => onOpenPost(post.slug)}>Read more <ArrowRight size={16} /></button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* Field Notes content, merged in below the written journal. */}
      <FieldNotesSections />
    </>
  );
}

function JournalPostPage({ slug, onBack, onOpenPost, navigate }: { slug: string; onBack: () => void; onOpenPost: (slug: string) => void; navigate: (page: Page) => void }) {
  const posts = usePublishedPosts();
  const post = posts.find((item) => item.slug === slug);
  const related = posts.filter((item) => item.slug !== slug).slice(0, 3);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [slug]);

  if (!post) {
    return (
      <section className="journal-page section-pad">
        <div className="journal-empty" data-reveal>
          <p className="eyebrow">NOT FOUND</p>
          <h3>This article is no longer available.</h3>
          <p>It may have been unpublished. Browse the current field notes instead.</p>
          <button className="text-link" onClick={onBack}>Back to the journal <ArrowRight size={16} /></button>
        </div>
      </section>
    );
  }

  const paragraphs = post.body.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  return (
    <>
      <section className="page-hero page-hero--left journal-hero">
        <img src={post.heroImage} alt="" className="page-hero-image" fetchPriority="high" />
        <div className="page-hero-wash" />
        <div className="page-hero-copy">
          <p className="eyebrow">{post.category} / {formatPostDate(post.publishedAt)}</p>
          <h1 className="split-reveal">{post.title}</h1>
          <div className="journal-meta journal-meta--light">
            <span>{post.author}</span><span>·</span><span>{post.readingTime} min read</span>
          </div>
        </div>
        <svg className="hero-morph" viewBox="0 0 1440 140" preserveAspectRatio="none" aria-hidden="true">
          <path className="morph-path" d="M0,108 C240,72 430,126 650,88 C900,45 1140,115 1440,68 L1440,140 L0,140 Z" fill="#f3ecdf" />
        </svg>
      </section>

      <article className="journal-article section-pad">
        <button className="text-link journal-back" onClick={onBack}><ArrowLeft size={15} /> All field notes</button>
        {post.excerpt && <p className="journal-standfirst">{post.excerpt}</p>}
        <div className="journal-body">
          {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </div>
        {post.tags.length > 0 && (
          <div className="journal-tags">
            {post.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        )}
      </article>

      {related.length > 0 && (
        <section className="journal-related section-pad">
          <SectionHeading number="02" eyebrow="CONTINUE READING" title="More from the field." />
          <div className="journal-list">
            {related.map((item) => (
              <article key={item.id} className="journal-card" data-reveal>
                <button className="journal-card-image" onClick={() => onOpenPost(item.slug)} aria-label={`Read ${item.title}`}>
                  <img src={item.heroImage} alt="" loading="lazy" />
                </button>
                <div className="journal-card-copy">
                  <span className="journal-card-meta">{item.category} / {formatPostDate(item.publishedAt)}</span>
                  <h3>{item.title}</h3>
                  <button className="text-link" onClick={() => onOpenPost(item.slug)}>Read more <ArrowRight size={16} /></button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="map-cta">
        <p>Inspired by what you have read?</p>
        <h2>Let us design the journey.</h2>
        <MagneticButton className="button button--sand" onClick={() => navigate("contact")}>Plan your safari <ArrowRight size={17} /></MagneticButton>
      </section>
    </>
  );
}

/**
 * Guest testimonial submission. Entries are stored as `pending` and are never
 * public until a staff member approves them in the CMS.
 */
/** Accessible 1-5 star selector built from the existing type scale. */
function StarRating({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  const [hover, setHover] = useState(0);
  const active = hover || value;
  return (
    <div className="star-rating" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
          className={star <= active ? "is-active" : ""}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          onFocus={() => setHover(star)}
          onBlur={() => setHover(0)}
          onClick={() => onChange(star)}
        >
          <Star size={22} fill={star <= active ? "currentColor" : "none"} strokeWidth={1.25} />
        </button>
      ))}
      <span className="star-rating-value">{value > 0 ? `${value} of 5` : "Select a rating"}</span>
    </div>
  );
}

function TestimonialForm() {
  const liveSafaris = usePublishedSafaris();
  const [form, setForm] = useState({
    guestName: "", guestEmail: "", guestLocation: "", safariPackage: "", quote: "", guestPhoto: "",
  });
  const [rating, setRating] = useState(0);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  // Honeypot: bots complete hidden fields, humans never see this one.
  const [website, setWebsite] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (website) { setStatus("sent"); return; } // silently drop bot submissions
    if (!consent) { setError("Please confirm we may publish your testimonial."); return; }
    setStatus("sending");
    const result = await cmsStore.actions.submitTestimonial({
      ...form,
      rating: rating || undefined,
      consentGiven: consent,
    });
    if (!result.ok) {
      setStatus("idle");
      setError(result.message ?? "We could not record your testimonial.");
      return;
    }
    setStatus("sent");
  };

  if (status === "sent") {
    return (
      <div className="testimonial-form testimonial-form--sent" data-reveal>
        <p className="eyebrow">THANK YOU</p>
        <h3>Your story has reached us.</h3>
        <p>Every testimonial is read by our team before it appears here. We are grateful you travelled with us.</p>
      </div>
    );
  }

  return (
    <form className="testimonial-form" onSubmit={submit} data-reveal id="share-your-experience">
      <p className="eyebrow">SHARE YOUR EXPERIENCE</p>
      <h3>Travelled with us?</h3>
      <p className="testimonial-form-intro">Tell us what stayed with you. Every testimonial is read by our team before it appears on the website.</p>

      <div className="testimonial-form-grid">
        <label className="field">
          <span>Your name</span>
          <input value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })} required maxLength={120} autoComplete="name" />
        </label>
        <label className="field">
          <span>Email <small>(never published)</small></span>
          <input type="email" value={form.guestEmail} onChange={(e) => setForm({ ...form, guestEmail: e.target.value })} maxLength={254} autoComplete="email" />
        </label>
      </div>

      <div className="testimonial-form-grid">
        <label className="field">
          <span>Where you travelled from <small>(optional)</small></span>
          <input value={form.guestLocation} onChange={(e) => setForm({ ...form, guestLocation: e.target.value })} maxLength={120} placeholder="London, United Kingdom" />
        </label>
        <label className="field">
          <span>Safari experienced <small>(optional)</small></span>
          <select value={form.safariPackage} onChange={(e) => setForm({ ...form, safariPackage: e.target.value })}>
            <option value="">Select a journey</option>
            {liveSafaris.map((safari) => <option key={safari.id} value={safari.title}>{safari.title}</option>)}
            <option value="Bespoke itinerary">Bespoke itinerary</option>
          </select>
        </label>
      </div>

      <div className="field">
        <span>Your rating</span>
        <StarRating value={rating} onChange={setRating} />
      </div>

      <label className="field">
        <span>Your testimonial</span>
        <textarea rows={5} value={form.quote} onChange={(e) => setForm({ ...form, quote: e.target.value })} required minLength={10} maxLength={4000} placeholder="What do you remember most?" />
      </label>

      <label className="field">
        <span>Photo URL <small>(optional)</small></span>
        <input type="url" value={form.guestPhoto} onChange={(e) => setForm({ ...form, guestPhoto: e.target.value })} placeholder="https://..." />
      </label>

      {/* Honeypot — visually and programmatically hidden from real visitors. */}
      <div className="testimonial-honeypot" aria-hidden="true">
        <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
      </div>

      <label className="consent testimonial-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
        <span>I give Olkinyei Expeditions permission to publish my testimonial, first name and location on the website.</span>
      </label>

      {error && <p className="testimonial-form-error" role="alert">{error}</p>}

      <MagneticButton className="button button--dark" type="submit" disabled={status === "sending"}>
        {status === "sending" ? "Sending..." : "Share your story"} <ArrowRight size={17} />
      </MagneticButton>
    </form>
  );
}

/**
 * Approved testimonials from every review source, plus the submission form.
 * Reused by the Field Notes & Journal page — one component, one data source.
 */
function TestimonialsSection() {
  // Select the RAW array. Filtering inside the selector would return a new
  // reference on every call, and useSyncExternalStore compares snapshots by
  // identity — that produces an infinite render loop and a blank page.
  const allTestimonials = useCmsStore((state) => state.testimonials);
  const ordered = useMemo(() => allTestimonials
    .filter((item) => item.status === "approved")
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      const aDate = a.externalCreatedAt ?? a.createdAt;
      const bDate = b.externalCreatedAt ?? b.createdAt;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    }), [allTestimonials]);

  return (
    <section className="testimonials section-pad" id="testimonials">
      <SectionHeading number="03" eyebrow="GUEST JOURNALS" title="Stories that travelled home." />

      {ordered.length === 0 ? (
        <div className="testimonial-empty" data-reveal>
          <h3>Be the first to share your journey.</h3>
          <p>Our guests' words matter more than ours. If you have travelled with Olkinyei, we would be honoured to hear what stayed with you.</p>
          <a className="text-link" href="#share-your-experience">Leave a testimonial <ArrowRight size={16} /></a>
        </div>
      ) : (
        <div className="testimonial-list">
          {ordered.map((item, index) => {
            const external = item.source !== "website";
            const date = item.externalCreatedAt ?? item.createdAt;
            return (
              <blockquote key={item.id} data-reveal>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div className="testimonial-body">
                  {item.rating ? (
                    <div className="testimonial-stars" aria-label={`Rated ${item.rating} out of 5`}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star key={star} size={14} fill={star <= item.rating! ? "currentColor" : "none"} strokeWidth={1.25} aria-hidden="true" />
                      ))}
                    </div>
                  ) : null}
                  <p>{item.quote}</p>
                </div>
                <cite>
                  <span className="testimonial-attribution">
                    {item.guestPhoto && <img src={item.guestPhoto} alt="" className="testimonial-avatar" loading="lazy" />}
                    <span>
                      {item.guestName}{item.guestLocation ? ` / ${item.guestLocation}` : ""}
                      {item.safariPackage && <small className="testimonial-package">{item.safariPackage}</small>}
                    </span>
                  </span>
                  <span className="testimonial-source">
                    {/* External reviews are always identified as such. */}
                    {external ? (
                      item.externalUrl
                        ? <a href={item.externalUrl} target="_blank" rel="noreferrer nofollow">via {SOURCE_LABELS[item.source]} <ExternalLink size={11} /></a>
                        : <>via {SOURCE_LABELS[item.source]}</>
                    ) : "Olkinyei Website"}
                    {date && <time dateTime={date}> · {new Date(date).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</time>}
                  </span>
                </cite>
              </blockquote>
            );
          })}
        </div>
      )}

      <TestimonialForm />
    </section>
  );
}

/**
 * The former Field Notes page, now rendered as part of the combined
 * Field Notes & Journal destination. Content and markup are unchanged except
 * that testimonials are read live from the CMS.
 */
function FieldNotesSections() {
  const [filter, setFilter] = useState("All");
  const [lightbox, setLightbox] = useState<number | null>(null);
  const filters = ["All", "Wildlife", "Migration", "Lodges", "People", "Landscape"];
  const visible = galleryItems.filter((item) => filter === "All" || item.type === filter);
  const showNext = (direction: number) => setLightbox((current) => current === null ? null : (current + direction + visible.length) % visible.length);

  useEffect(() => {
    if (lightbox === null) return;
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setLightbox(null);
      if (event.key === "ArrowRight") showNext(1);
      if (event.key === "ArrowLeft") showNext(-1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  return (
    <>
      <section className="gallery-section section-pad"><div className="gallery-header"><SectionHeading number="02" eyebrow="THE ARCHIVE" title="Light, dust, life." /><div className="gallery-filters">{filters.map((item) => <button className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)}>{item}</button>)}</div></div><motion.div className="masonry" layout>{visible.map((item, index) => <motion.button layout className={`masonry-item masonry-item--${item.size}`} key={item.src} onClick={() => setLightbox(index)} initial={{ opacity: 0 }} animate={{ opacity: 1 }}><img src={item.src} alt={item.alt} loading="lazy" /><span><small>{item.type}</small><Eye />View</span></motion.button>)}</motion.div></section>
      <section className="drone-film"><video controls playsInline preload="none" poster={imagery.heroPoster}><source src={imagery.heroVideo} type="video/mp4" /></video><div><p className="eyebrow">FROM ABOVE / 01:12</p><h2>The migration draws its own map.</h2><p>Film by our Serengeti field team.</p></div></section>
      <TestimonialsSection />
      <section className="instagram-strip section-pad"><p className="eyebrow">@OLKINYEIEXPEDITIONS</p><h2>Dispatches from the field.</h2><a href="https://www.instagram.com" target="_blank" rel="noreferrer">Follow on Instagram <ExternalLink size={15} /></a><div>{galleryItems.slice(2, 7).map((item) => <a key={item.src} href="https://www.instagram.com" target="_blank" rel="noreferrer" aria-label="View field dispatch on Instagram"><img src={item.src} alt="" loading="lazy" /></a>)}</div></section>
      <section className="instagram-strip section-pad"><p className="eyebrow">@OLKINYEIEXPEDITIONS</p><h2>Dispatches from the field.</h2><a href="https://www.instagram.com" target="_blank" rel="noreferrer">Follow on Instagram <ExternalLink size={15} /></a><div>{galleryItems.slice(2, 7).map((item) => <a key={item.src} href="https://www.instagram.com" target="_blank" rel="noreferrer" aria-label="View field dispatch on Instagram"><img src={item.src} alt="" loading="lazy" /></a>)}</div></section>
      <AnimatePresence>{lightbox !== null && <motion.div className="lightbox" role="dialog" aria-modal="true" aria-label="Gallery lightbox" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><button className="lightbox-close" onClick={() => setLightbox(null)} aria-label="Close lightbox"><X /></button><button className="lightbox-prev" onClick={() => showNext(-1)} aria-label="Previous image"><ArrowLeft /></button><motion.img key={visible[lightbox].src} src={visible[lightbox].src} alt={visible[lightbox].alt} initial={{ opacity: 0.4, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} /><button className="lightbox-next" onClick={() => showNext(1)} aria-label="Next image"><ArrowRight /></button><p>{String(lightbox + 1).padStart(2, "0")} / {String(visible.length).padStart(2, "0")} &nbsp; {visible[lightbox].alt}</p></motion.div>}</AnimatePresence>
    </>
  );
}

function Stepper({ step }: { step: number }) {
  return <div className="stepper" aria-label={`Booking step ${step} of 3`}>{["Journey", "Preferences", "Your details"].map((item, index) => <div key={item} className={step >= index + 1 ? "active" : ""}><span>{step > index + 1 ? <Check size={12} /> : index + 1}</span><p>{item}</p></div>)}</div>;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function PartyCounter({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (value: number) => void; min?: number }) {
  return <div className="party-counter"><span>{label}</span><button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Remove one ${label}`}><Minus size={15} /></button><strong>{value}</strong><button type="button" onClick={() => onChange(value + 1)} aria-label={`Add one ${label}`}><Plus size={15} /></button></div>;
}

function BookingForm({ initialSafari, onStored }: { initialSafari: SafariPackage | null; onStored: (booking: Booking) => void }) {
  const liveSafaris = usePublishedSafaris();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ ...emptyBooking, safari: initialSafari?.title ?? liveSafaris[0]?.title ?? "" });
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState<Booking | null>(null);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [emailWarning, setEmailWarning] = useState("");
  useEffect(() => { if (initialSafari) setForm((current) => ({ ...current, safari: initialSafari.title })); }, [initialSafari]);
  // Safaris load from Supabase asynchronously; default the journey to the
  // first published package once it arrives if the visitor has not chosen one.
  useEffect(() => {
    setForm((current) => (current.safari ? current : { ...current, safari: liveSafaris[0]?.title ?? "" }));
  }, [liveSafaris]);
  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));
  const next = () => {
    const missing = (step === 1 ? [!form.startDate && "Choose a start date", !form.endDate && "Choose an end date"] : []).filter(Boolean) as string[];
    setErrors(missing); if (!missing.length) setStep((current) => Math.min(3, current + 1));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const missing = [!form.name && "Enter your name", !/^\S+@\S+\.\S+$/.test(form.email) && "Enter a valid email", !form.phone && "Enter a phone number", !consent && "Accept the privacy notice to continue"].filter(Boolean) as string[];
    setErrors(missing); if (missing.length) return;
    const booking: Booking = { ...form, reference: `OLK-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`, createdAt: new Date().toISOString(), status: "New" };
    const current = readStorage<Booking[]>("olkinyei-bookings", []);
    localStorage.setItem("olkinyei-bookings", JSON.stringify([booking, ...current]));
    setSubmitting(true);
    const result = await persistBooking(booking);
    setSubmitting(false);
    if (result.storageError) {
      setErrors([`The cloud booking service could not save this request: ${result.storageError}. Your request remains safely stored on this device.`]);
      return;
    }
    setEmailWarning(result.emailWarning ? "Your request is saved. The email service is delayed, so keep this reference for your records." : "");
    onStored(booking); setConfirmation(booking);
  };
  if (confirmation) return <div className="booking-confirmation" role="status"><motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}><Check /></motion.div><p className="eyebrow">YOUR JOURNEY HAS BEGUN</p><h2>Asante, {confirmation.name.split(" ")[0]}.</h2><p>Your safari designer has received your request. A detailed first proposal will arrive at <strong>{confirmation.email}</strong> within one business day.</p>{emailWarning && <p className="email-warning">{emailWarning}</p>}<dl><div><dt>Booking reference</dt><dd>{confirmation.reference}</dd></div><div><dt>Journey</dt><dd>{confirmation.safari}</dd></div><div><dt>Travel dates</dt><dd>{confirmation.startDate} to {confirmation.endDate}</dd></div><div><dt>Status</dt><dd>{confirmation.status}</dd></div></dl><button className="button button--dark" onClick={() => window.print()}><Download size={16} /> Save confirmation</button><button className="text-link" onClick={() => { setConfirmation(null); setStep(1); setForm({ ...emptyBooking }); setConsent(false); }}>Plan another journey <ArrowRight size={15} /></button></div>;
  return (
    <form className="booking-form" onSubmit={submit} noValidate><Stepper step={step} /><AnimatePresence mode="wait">
      {step === 1 && <motion.div className="form-step" key="step-1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}><p className="eyebrow">01 / WHERE AND WHEN</p><h2>Begin with the shape of the journey.</h2><Field label="Safari experience"><select value={form.safari} onChange={(e) => update("safari", e.target.value)}><option value="">Choose a journey</option>{liveSafaris.map((safari) => <option key={safari.id}>{safari.title}</option>)}</select></Field><div className="field-row"><Field label="Arrival date"><input type="date" min={new Date().toISOString().slice(0, 10)} value={form.startDate} onChange={(e) => update("startDate", e.target.value)} /></Field><Field label="Departure date"><input type="date" min={form.startDate || new Date().toISOString().slice(0, 10)} value={form.endDate} onChange={(e) => update("endDate", e.target.value)} /></Field></div><div className="availability-calendar"><div><CalendarDays /><span>Live planning calendar</span></div>{["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"].map((month, index) => <span key={month} className={index === 1 || index === 2 ? "limited" : "open"}>{month}<small>{index === 1 || index === 2 ? "Limited" : "Open"}</small></span>)}</div><div className="party-row"><PartyCounter label="Adults" value={form.adults} min={1} onChange={(value) => update("adults", value)} /><PartyCounter label="Children" value={form.children} onChange={(value) => update("children", value)} /></div></motion.div>}
      {step === 2 && <motion.div className="form-step" key="step-2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}><p className="eyebrow">02 / YOUR PREFERENCES</p><h2>Tell us what comfort means to you.</h2><Field label="Accommodation style"><select value={form.accommodation} onChange={(e) => update("accommodation", e.target.value)}><option>A considered mix of camps and lodges</option><option>Exceptional luxury lodges</option><option>Intimate camps under canvas</option><option>Private villas for the family</option></select></Field><div className="field-row"><Field label="Pickup location"><input value={form.pickup} onChange={(e) => update("pickup", e.target.value)} /></Field><Field label="Arrival airport"><select value={form.airport} onChange={(e) => update("airport", e.target.value)}><option>Jomo Kenyatta International Airport (NBO)</option><option>Kilimanjaro International Airport (JRO)</option><option>Julius Nyerere International Airport (DAR)</option><option>Wilson Airport (WIL)</option></select></Field></div><Field label="Approximate budget" hint="Per guest, excluding international flights"><select value={form.budget} onChange={(e) => update("budget", e.target.value)}><option>$5,000 - $8,000 per person</option><option>$8,000 - $12,000 per person</option><option>$12,000 - $18,000 per person</option><option>$18,000+ per person</option></select></Field><Field label="Anything we should know?" hint="Celebrations, mobility, dietary needs, photography or a particular animal."><textarea rows={4} value={form.requests} onChange={(e) => update("requests", e.target.value)} placeholder="Tell us what would make this journey yours..." /></Field><Field label="Preferred payment"><select value={form.payment} onChange={(e) => update("payment", e.target.value)}><option>Secure card payment</option><option>Bank transfer</option><option>Speak with my designer first</option></select></Field></motion.div>}
      {step === 3 && <motion.div className="form-step" key="step-3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}><p className="eyebrow">03 / YOUR DETAILS</p><h2>Where should your designer reach you?</h2><Field label="Full name"><input autoComplete="name" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Your full name" /></Field><div className="field-row"><Field label="Email"><input type="email" autoComplete="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="you@example.com" /></Field><Field label="Phone / WhatsApp"><input type="tel" autoComplete="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+1 212 555 0198" /></Field></div><div className="booking-review"><h3>Your request</h3><p><span>Safari</span>{form.safari}</p><p><span>Dates</span>{form.startDate} to {form.endDate}</p><p><span>Party</span>{form.adults} adults, {form.children} children</p><p><span>Accommodation</span>{form.accommodation}</p><p><span>Budget</span>{form.budget}</p></div><label className="consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> <span>I agree to the privacy notice and understand this is a planning request, not an immediate charge.</span></label></motion.div>}
    </AnimatePresence>{errors.length > 0 && <div className="form-errors" role="alert">{errors.map((error) => <p key={error}>{error}</p>)}</div>}<div className="form-nav">{step > 1 && <button type="button" className="text-link" onClick={() => { setErrors([]); setStep(step - 1); }}><ArrowLeft size={15} /> Back</button>}<span />{step < 3 ? <button type="button" className="button button--dark" onClick={next}>Continue <ArrowRight size={16} /></button> : <button type="submit" className="button button--dark" disabled={submitting}>{submitting ? "Securing request..." : "Send safari request"} <ArrowRight size={16} /></button>}</div><p className="secure-note"><ShieldCheck size={15} /> {hasCloudBackend ? "Encrypted cloud storage and instant planner notification are active." : "Demo mode stores this request privately in your browser. Connect Supabase for cloud delivery."}</p></form>
  );
}

function BookingLookup({ bookings }: { bookings: Booking[] }) {
  const [query, setQuery] = useState(""); const [searched, setSearched] = useState(false);
  const match = bookings.find((booking) => booking.reference.toLowerCase() === query.toLowerCase() || booking.email.toLowerCase() === query.toLowerCase());
  return <div className="lookup"><h3>Already planning with us?</h3><p>Enter your booking reference or email to view your request.</p><div><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="OLK-2026-XXXXX or email" aria-label="Booking reference or email" /><button onClick={() => setSearched(true)}><Search size={16} /> Find booking</button></div>{searched && (match ? <div className="lookup-result"><span>{match.status}</span><strong>{match.reference}</strong><p>{match.safari}</p><small>{match.startDate} to {match.endDate}</small></div> : <p className="lookup-empty">No matching journey found. Check the reference and try again.</p>)}</div>;
}

function ContactPage({ initialSafari, bookings, onStored, content }: { initialSafari: SafariPackage | null; bookings: Booking[]; onStored: (booking: Booking) => void; content: EditableContent }) {
  const site = useCmsStore((state) => state.siteSettings);
  return <><PageHero eyebrow="PRIVATE JOURNEY DESIGN" title="Your safari starts with a conversation." text="Share a few details. One dedicated designer will shape a thoughtful first proposal within one business day." image={imagery.lodge} /><section className="booking-section section-pad"><div className="booking-aside"><p className="eyebrow">PLAN YOUR JOURNEY</p><h2>There are no ordinary questions.</h2><p>We will consider the season, lodge character, flight connections and the pace that works for your party. Nothing is confirmed until it feels right.</p><div><Headphones /><span>Prefer to speak?</span><a href={`tel:${site.phone.replace(/\s+/g, "")}`}>{site.phone}</a><a href={`mailto:${content.contactEmail}`}>{content.contactEmail}</a></div></div><BookingForm initialSafari={initialSafari} onStored={onStored} /></section><section className="contact-details section-pad"><div><p className="eyebrow">FIELD OFFICES</p><h2>Close to the places we love.</h2></div><address>{site.addresses.map((entry) => <div key={entry.city}><span>{entry.city}</span><strong>{entry.city}</strong><p>{entry.address}<br />Monday to Friday, 08:00 - 18:00 EAT</p></div>)}</address><BookingLookup bookings={bookings} /></section></>;
}

/**
 * Maintenance / Coming Soon screen.
 *
 * Shown to public visitors when the corresponding Site Settings flag is on.
 * The CMS at /#/admin is never gated, so administrators cannot lock themselves
 * out while the site is closed.
 */
function SiteClosedScreen({ mode }: { mode: "maintenance" | "coming-soon" }) {
  const site = useCmsStore((state) => state.siteSettings);
  const isMaintenance = mode === "maintenance";
  return (
    <div className="site-closed">
      <div className="site-closed-inner">
        <Logo />
        <p className="eyebrow">{isMaintenance ? "TEMPORARILY CLOSED" : "OPENING SOON"}</p>
        <h1>{isMaintenance ? "We are tending to the camp." : "Something rare is on its way."}</h1>
        <p className="site-closed-copy">
          {isMaintenance
            ? "Our website is briefly offline for maintenance. Our team is still reachable and will answer every enquiry."
            : "Olkinyei Expeditions is preparing private journeys across Kenya and Tanzania. Reach out and we will write to you first."}
        </p>
        <div className="site-closed-contact">
          {site.contactEmail && <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>}
          {site.phone && <a href={`tel:${site.phone.replace(/\s+/g, "")}`}>{site.phone}</a>}
        </div>
      </div>
    </div>
  );
}

function PublicApp() {
  const [page, setPage] = useState<Page>(() => pageFromPath(window.location.pathname));
  const [loading, setLoading] = useState(() => {
    try { return !sessionStorage.getItem("olkinyei-intro"); } catch { return true; }
  });
  const [selectedSafari, setSelectedSafari] = useState<SafariPackage | null>(null);
  const [bookingSafari, setBookingSafari] = useState<SafariPackage | null>(null);
  const [bookings, setBookings] = useState<Booking[]>(() => readStorage("olkinyei-bookings", []));
  const [content] = useState<EditableContent>(() => readStorage("olkinyei-content", defaultContent));
  const cmsHomePage = useCmsStore((state) => state.pages.find((item) => item.route === "/"));
  const cmsSettings = useCmsStore((state) => state.siteSettings);
  const publicContent: EditableContent = {
    homeStatement: String(cmsHomePage?.content.homeStatement || content.homeStatement),
    conservationStatement: String(cmsHomePage?.content.conservationStatement || content.conservationStatement),
    contactEmail: cmsSettings.contactEmail || content.contactEmail,
  };
  const [postSlug, setPostSlug] = useState<string | null>(() => postSlugFromPath(window.location.pathname));
  const navigate = useCallback((next: Page) => { if (window.location.pathname !== ROUTES[next]) window.history.pushState({}, "", ROUTES[next]); setPage(next); setPostSlug(null); window.scrollTo({ top: 0, behavior: "instant" }); }, []);
  // Article routing: /journal/<slug> keeps deep links and back/forward working.
  const openPost = useCallback((slug: string) => {
    window.history.pushState({}, "", `/journal/${slug}`);
    setPage("journal");
    setPostSlug(slug);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  const closePost = useCallback(() => {
    window.history.pushState({}, "", ROUTES.journal);
    setPage("journal");
    setPostSlug(null);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  const bookSafari = (safari: SafariPackage) => { setSelectedSafari(null); setBookingSafari(safari); navigate("contact"); };
  const completeLoader = useCallback(() => { try { sessionStorage.setItem("olkinyei-intro", "true"); } catch { /* Browsing can continue when storage is blocked. */ } setLoading(false); }, []);
  useEffect(() => {
    const pop = () => {
      setPage(pageFromPath(window.location.pathname));
      setPostSlug(postSlugFromPath(window.location.pathname));
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (!hasCloudBackend) return;
    void getCloudBookings().then((cloudBookings) => {
      setBookings((current) => {
        const merged = [...cloudBookings, ...current.filter((local) => !cloudBookings.some((cloud) => cloud.reference === local.reference))];
        localStorage.setItem("olkinyei-bookings", JSON.stringify(merged));
        return merged;
      });
    });
    const channel = subscribeToBookings((booking) => {
      setBookings((current) => current.some((item) => item.reference === booking.reference) ? current : [booking, ...current]);
    });
    return () => { if (channel && supabase) void supabase.removeChannel(channel); };
  }, []);
  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true, wheelMultiplier: 0.86 });
    const update = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(update); gsap.ticker.lagSmoothing(0); lenis.on("scroll", ScrollTrigger.update);
    return () => { gsap.ticker.remove(update); lenis.destroy(); };
  }, []);
  useEffect(() => {
    const titles: Record<Page, string> = { home: "Olkinyei Expeditions | Private Luxury Safaris", about: "Our Story | Olkinyei Expeditions", experiences: "Private Safari Experiences | Olkinyei Expeditions", destinations: "Kenya and Tanzania Destinations | Olkinyei Expeditions", gallery: "Field Notes and Gallery | Olkinyei Expeditions", journal: "The Journal | Olkinyei Expeditions", contact: "Plan Your Safari | Olkinyei Expeditions" };
    const cmsPage = cmsStore.getState().pages.find((item) => item.route === ROUTES[page]);
    // Article pages take their metadata from the published post itself.
    const article = postSlug ? cmsStore.getState().blogPosts.find((item) => item.slug === postSlug && item.status === "published") : undefined;
    const seoTitle = article
      ? (article.seo.title || `${article.title} | Olkinyei Expeditions`)
      : cmsPage?.published && cmsPage.seo.title ? cmsPage.seo.title : titles[page];
    const seoDescription = article
      ? (article.seo.description || article.excerpt)
      : cmsPage?.published && cmsPage.seo.description ? cmsPage.seo.description : page === "home" ? "Private, conservation-led luxury safaris across Kenya and Tanzania, designed by East African naturalists." : `${titles[page]}. Explore private, expertly guided journeys across East Africa.`;
    document.title = seoTitle;
    document.querySelector('meta[name="description"]')?.setAttribute("content", seoDescription);
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", seoTitle);
    if (article?.heroImage) document.querySelector('meta[property="og:image"]')?.setAttribute("content", article.heroImage);
    const routeUrl = `https://olkinyei.com${postSlug ? `/journal/${postSlug}` : ROUTES[page]}`;
    document.querySelector('meta[property="og:url"]')?.setAttribute("content", routeUrl);
    document.querySelector('link[rel="canonical"]')?.setAttribute("href", routeUrl);
  }, [page, postSlug, cmsHomePage, cmsSettings]);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--burnt", cmsSettings.primaryColor);
    root.style.setProperty("--sand", cmsSettings.accentColor);
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (favicon && cmsSettings.favicon) favicon.href = cmsSettings.favicon;
  }, [cmsSettings]);
  useEffect(() => {
    if (loading || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const splits: SplitText[] = [];
    const context = gsap.context(() => {
      document.querySelectorAll<HTMLElement>(".split-reveal").forEach((element) => { const split = SplitText.create(element, { type: "lines", mask: "lines", linesClass: "split-line" }); splits.push(split); gsap.from(split.lines, { yPercent: 110, opacity: 0, duration: 1.15, stagger: 0.1, ease: "power4.out", scrollTrigger: { trigger: element, start: "top 90%", once: true } }); });
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((element) => gsap.from(element, { y: 50, opacity: 0, duration: 1, ease: "power3.out", scrollTrigger: { trigger: element, start: "top 88%", once: true } }));
      gsap.utils.toArray<HTMLElement>("[data-image-reveal]").forEach((element) => { gsap.fromTo(element, { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 1.35, ease: "power4.inOut", scrollTrigger: { trigger: element, start: "top 88%", once: true } }); });
      gsap.utils.toArray<HTMLElement>("[data-parallax]").forEach((element) => gsap.fromTo(element, { yPercent: -6, scale: 1.08 }, { yPercent: 6, ease: "none", scrollTrigger: { trigger: element, scrub: 1.2, start: "top bottom", end: "bottom top" } }));
      gsap.to(".morph-path", { morphSVG: "M0,92 C180,132 450,38 720,95 C1020,152 1190,50 1440,101 L1440,140 L0,140 Z", duration: 7, repeat: -1, yoyo: true, ease: "sine.inOut" });
      gsap.to(".migration-track span", { x: () => window.innerWidth * 0.65, stagger: 0.08, ease: "none", scrollTrigger: { trigger: ".migration-story", start: "top bottom", end: "bottom top", scrub: 1 } });
    });
    const refresh = window.setTimeout(() => ScrollTrigger.refresh(), 300);
    return () => { window.clearTimeout(refresh); splits.forEach((split) => split.revert()); context.revert(); };
  }, [page, loading]);
  const pageContent = useMemo(() => {
    if (page === "home") return <HomePage navigate={navigate} content={publicContent} openSafari={setSelectedSafari} onOpenPost={openPost} />;
    if (page === "about") return <AboutPage navigate={navigate} />;
    if (page === "experiences") return <ExperiencesPage openSafari={setSelectedSafari} onBook={bookSafari} />;
    if (page === "destinations") return <DestinationsPage onBook={bookSafari} />;
    if (page === "journal") {
      return postSlug
        ? <JournalPostPage slug={postSlug} onBack={closePost} onOpenPost={openPost} navigate={navigate} />
        : <JournalPage onOpenPost={openPost} />;
    }
    return <ContactPage initialSafari={bookingSafari} bookings={bookings} content={publicContent} onStored={(booking) => setBookings((current) => current.some((item) => item.reference === booking.reference) ? current : [booking, ...current])} />;
  }, [page, postSlug, navigate, openPost, closePost, publicContent.homeStatement, publicContent.conservationStatement, publicContent.contactEmail, bookingSafari, bookings]);
  return <div className="app-shell"><a className="skip-link" href="#main-content">Skip to content</a><CustomCursor /><AnimatePresence>{loading && <Loader onComplete={completeLoader} />}</AnimatePresence>{!loading && <Header page={page} navigate={navigate} />}<AnimatePresence mode="wait">{!loading && <motion.main id="main-content" key={postSlug ? `journal-${postSlug}` : page} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }}>{pageContent}<Footer navigate={navigate} /></motion.main>}</AnimatePresence><AnimatePresence>{selectedSafari && <ExperienceModal safari={selectedSafari} onClose={() => setSelectedSafari(null)} onBook={bookSafari} />}</AnimatePresence></div>;
}

function isAdminRoute() {
  return (
    window.location.hash.startsWith("#/admin") ||
    window.location.pathname === "/admin" ||
    window.location.pathname.startsWith("/admin/")
  );
}

function setRobotsNoIndex(noindex: boolean) {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "robots";
    document.head.appendChild(meta);
  }
  meta.content = noindex ? "noindex, nofollow, noarchive, nosnippet" : "index, follow, max-image-preview:large";
}

export default function App() {
  const [isAdmin, setIsAdmin] = useState(() => isAdminRoute());

  useEffect(() => {
    const check = () => {
      const admin = isAdminRoute();
      setIsAdmin(admin);
      setRobotsNoIndex(admin);
      if (admin) document.title = "Olkinyei Studio";
    };
    check();
    window.addEventListener("hashchange", check);
    window.addEventListener("popstate", check);
    return () => {
      window.removeEventListener("hashchange", check);
      window.removeEventListener("popstate", check);
    };
  }, []);

  return isAdmin ? (
    <Suspense fallback={<div className="admin-loading">Loading Olkinyei Studio…</div>}>
      <AdminApp />
    </Suspense>
  ) : (
    <PublicSite />
  );
}

/**
 * Public entry point. Applies the Site Settings gates before rendering the
 * website. The CMS route is handled above and is never gated, so enabling
 * maintenance mode can never lock an administrator out.
 */
function PublicSite() {
  const site = useCmsStore((state) => state.siteSettings);
  if (site.maintenanceMode) return <SiteClosedScreen mode="maintenance" />;
  if (site.comingSoon) return <SiteClosedScreen mode="coming-soon" />;
  return <PublicApp />;
}
