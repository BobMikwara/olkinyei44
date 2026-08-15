// NOTE: Safari packages have NO static data here. Supabase `public.packages`
// is the single source of truth. The public website and the CMS both read the
// same records through src/admin/store.ts (see `loadCloudPackages`) using the
// authoritative `SafariPackage` type in src/admin/types.ts.

export type Destination = {
  name: string;
  country: "Kenya" | "Tanzania";
  coordinates: [number, number];
  best: string;
  animal: string;
  image: string;
  description: string;
};

export type Booking = {
  reference: string;
  createdAt: string;
  status: "New" | "Confirmed" | "In planning" | "Cancelled";
  safari: string;
  startDate: string;
  endDate: string;
  adults: number;
  children: number;
  accommodation: string;
  pickup: string;
  airport: string;
  budget: string;
  requests: string;
  payment: string;
  name: string;
  email: string;
  phone: string;
};

export const imagery = {
  hero: "https://images.pexels.com/photos/15815060/pexels-photo-15815060.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1400&w=2400",
  heroVideo: "https://videos.pexels.com/video-files/32416221/13827509_3840_2160_25fps.mp4",
  heroPoster: "https://images.pexels.com/videos/32416221/africa-wildlife-bluewildebeest-south-africa-south-african-landscape-32416221.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1400&w=2400",
  migration: "https://images.pexels.com/photos/5521703/pexels-photo-5521703.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000",
  elephant: "https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000",
  lodge: "https://images.pexels.com/photos/37790193/pexels-photo-37790193.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000",
  cheetah: "https://images.pexels.com/photos/32414164/pexels-photo-32414164.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000",
  lion: "https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000",
  giraffe: "https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000",
  mara: "https://images.pexels.com/photos/15373901/pexels-photo-15373901.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000",
  crater: "https://images.pexels.com/photos/32382771/pexels-photo-32382771.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000",
  portrait: "https://images.pexels.com/photos/38223514/pexels-photo-38223514.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=1600",
  rhino: "https://images.pexels.com/photos/26052069/pexels-photo-26052069.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000",
};

export const destinations: Destination[] = [
  { name: "Serengeti", country: "Tanzania", coordinates: [45, 56], best: "June to October", animal: "Wildebeest", image: imagery.migration, description: "An immense grassland theatre where weather, predator and prey write each day anew." },
  { name: "Ngorongoro", country: "Tanzania", coordinates: [51, 67], best: "Year-round", animal: "Black rhino", image: imagery.rhino, description: "A volcanic caldera sheltering one of the greatest concentrations of wildlife on Earth." },
  { name: "Tarangire", country: "Tanzania", coordinates: [58, 73], best: "June to October", animal: "Elephant", image: imagery.elephant, description: "Baobab country, seasonal rivers and magnificent elephant families moving through dust." },
  { name: "Lake Manyara", country: "Tanzania", coordinates: [54, 70], best: "June to September", animal: "Flamingo", image: imagery.giraffe, description: "A forest-fringed lake beneath the Rift escarpment, alive with primates and birdlife." },
  { name: "Maasai Mara", country: "Kenya", coordinates: [39, 43], best: "July to October", animal: "Lion", image: imagery.lion, description: "Golden plains, private conservancies and intimate access to the migration's northern reach." },
  { name: "Amboseli", country: "Kenya", coordinates: [65, 45], best: "June to October", animal: "Elephant", image: imagery.elephant, description: "Ancient elephant paths under the snow-capped presence of Kilimanjaro." },
  { name: "Tsavo", country: "Kenya", coordinates: [73, 54], best: "June to October", animal: "Red elephant", image: imagery.crater, description: "Vast, untamed and rust-red: Kenya at its most elemental and gloriously uncrowded." },
  { name: "Mount Kilimanjaro", country: "Tanzania", coordinates: [68, 60], best: "January to March", animal: "Colobus", image: imagery.giraffe, description: "Glaciers above cloud forest, with private routes selected for time and acclimatisation." },
];

export const galleryItems = [
  { src: imagery.hero, alt: "Migration herd seen from the air", type: "Aerial", size: "tall" },
  { src: imagery.lion, alt: "Lion resting under dappled shade", type: "Wildlife", size: "wide" },
  { src: imagery.lodge, alt: "Open-air luxury safari lodge", type: "Lodges", size: "wide" },
  { src: imagery.cheetah, alt: "Cheetah watching across the grassland", type: "Wildlife", size: "tall" },
  { src: imagery.portrait, alt: "Maasai guide in traditional attire", type: "People", size: "tall" },
  { src: imagery.elephant, alt: "Elephant family moving through green savanna", type: "Wildlife", size: "wide" },
  { src: imagery.migration, alt: "Wildebeest gathering across the plain", type: "Migration", size: "wide" },
  { src: imagery.giraffe, alt: "Giraffe in the last light of day", type: "Wildlife", size: "tall" },
  { src: imagery.rhino, alt: "Two rhino moving beside a lake", type: "Wildlife", size: "wide" },
  { src: imagery.mara, alt: "Open Maasai Mara grassland", type: "Landscape", size: "wide" },
];

export const testimonials = [
  { quote: "They knew when to move, when to wait, and when to say nothing at all. Africa felt entirely ours.", name: "Amelia and James", place: "London" },
  { quote: "The rarest kind of luxury: complete confidence, deep knowledge and time that did not feel scheduled.", name: "Maya R.", place: "New York" },
  { quote: "Our children still talk about the tracks they read with Daniel. It changed how they see the natural world.", name: "The Mikkelsen family", place: "Copenhagen" },
];

export const timeline = [
  { year: "2008", text: "Olkinyei begins with one vehicle, two naturalists and a belief in slower journeys." },
  { year: "2013", text: "Our first conservancy partnership funds classrooms and predator-safe livestock enclosures." },
  { year: "2018", text: "We become carbon-measured and shift every field operation toward a lighter footprint." },
  { year: "2022", text: "The guide fellowship opens, supporting a new generation of East African storytellers." },
  { year: "Today", text: "A small, independent team still creates every expedition by hand." },
];

export const blogPosts = [
  { title: "Reading the River: A Guide to the Great Migration", category: "Wildlife", date: "12 May 2026", image: imagery.migration },
  { title: "What to Pack When the Dust Is Part of the Story", category: "Packing", date: "28 April 2026", image: imagery.lodge },
  { title: "The Ethics of the Wildlife Photograph", category: "Photography", date: "09 March 2026", image: imagery.cheetah },
  { title: "Kenya and Tanzania Entry Notes for 2026", category: "Visa", date: "18 February 2026", image: imagery.mara },
];