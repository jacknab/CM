export interface PageSeo {
  title: string;
  description: string;
  canonical: string;
}

const BASE = "https://certxa.com";

export const SEO_CONFIG: Record<string, PageSeo> = {
  "/industries": {
    title: "Booking Software for Every Service Industry | Certxa",
    description: "Certxa works for barbers, spas, HVAC, plumbers, dog walkers, tutors, and 20+ more industries. One platform — every service business.",
    canonical: `${BASE}/industries`,
  },
  "/barbers": {
    title: "Barber Shop Booking Software — Online Appointments & POS | Certxa",
    description: "Let clients book barber appointments 24/7. Manage walk-ins, track chair revenue, and send automatic SMS reminders. Free 60-day trial.",
    canonical: `${BASE}/barbers`,
  },
  "/spa": {
    title: "Day Spa & Wellness Booking Software — Memberships & Gift Cards | Certxa",
    description: "Booking, memberships, gift cards, and therapist scheduling for day spas and wellness centers. Replace Mindbody for a fraction of the cost.",
    canonical: `${BASE}/spa`,
  },
  "/nails": {
    title: "Nail Salon Booking Software — Online Scheduling & POS | Certxa",
    description: "Online booking, service menus, and automatic reminders built for nail salons. Reduce no-shows and fill your appointment book every day.",
    canonical: `${BASE}/nails`,
  },
  "/tattoo": {
    title: "Tattoo Studio Booking Software — Deposits & Appointments | Certxa",
    description: "Manage tattoo consultations, deposits, and artist schedules in one place. Automated SMS reminders reduce costly no-shows.",
    canonical: `${BASE}/tattoo`,
  },
  "/haircuts": {
    title: "Walk-In Haircut & Barbershop Queue Management | Certxa",
    description: "Digital check-in, live queue display, and wait-time estimates for walk-in haircut businesses. Keep clients informed and reduce lobby crowding.",
    canonical: `${BASE}/haircuts`,
  },
  "/hair-salons": {
    title: "Hair Salon Booking Software — Stylists, Color & Cuts | Certxa",
    description: "Online booking for hair salons — manage stylists, color appointments, and retail products. Automatic reminders cut no-shows by up to 60%.",
    canonical: `${BASE}/hair-salons`,
  },
  "/groomers": {
    title: "Pet Grooming Booking Software — Dog & Cat Appointments | Certxa",
    description: "Online scheduling, pet profiles, and automated reminders for pet groomers. Manage multiple groomers and track grooming history per pet.",
    canonical: `${BASE}/groomers`,
  },
  "/estheticians": {
    title: "Esthetician Booking Software — Skin Care & Facials | Certxa",
    description: "Booking software built for estheticians and skin care professionals. Manage facials, waxing, and lash appointments with intake forms and reminders.",
    canonical: `${BASE}/estheticians`,
  },
  "/house-cleaning": {
    title: "House Cleaning Scheduling Software — Jobs & Invoices | Certxa",
    description: "Schedule recurring house cleaning jobs, dispatch crews, and send invoices automatically. Built for solo cleaners and multi-crew cleaning businesses.",
    canonical: `${BASE}/house-cleaning`,
  },
  "/handyman": {
    title: "Handyman Scheduling Software — Jobs, Estimates & Invoices | Certxa",
    description: "Manage handyman jobs, estimates, and invoices from your phone. Schedule crews, track job status, and get paid faster with Certxa.",
    canonical: `${BASE}/handyman`,
  },
  "/ride-service": {
    title: "Ride Service Booking Software — Dispatch & Scheduling | Certxa",
    description: "Online booking and dispatch for private ride services, chauffeurs, and transportation businesses. Manage drivers, routes, and payments in one place.",
    canonical: `${BASE}/ride-service`,
  },
  "/snow-removal": {
    title: "Snow Removal Scheduling Software — Routes & Crews | Certxa",
    description: "Schedule snow removal routes, dispatch crews, and invoice clients automatically. Built for snow plowing and ice management businesses.",
    canonical: `${BASE}/snow-removal`,
  },
  "/lawn-care": {
    title: "Lawn Care Scheduling Software — Routes, Crews & Invoices | Certxa",
    description: "Schedule lawn mowing routes, dispatch crews, and collect recurring payments. Built for solo lawn care operators and multi-crew landscaping businesses.",
    canonical: `${BASE}/lawn-care`,
  },
  "/tutoring": {
    title: "Tutoring Booking Software — Sessions, Scheduling & Payments | Certxa",
    description: "Let students book tutoring sessions online. Manage subjects, tutor availability, and payments automatically. Free 60-day trial.",
    canonical: `${BASE}/tutoring`,
  },
  "/dog-walking": {
    title: "Dog Walking Booking Software — Scheduling & GPS Tracking | Certxa",
    description: "Online booking, walker scheduling, and automated updates for dog walking businesses. Clients can book and pay from any device.",
    canonical: `${BASE}/dog-walking`,
  },
  "/hvac": {
    title: "HVAC Scheduling Software — Jobs, Dispatching & Invoices | Certxa",
    description: "Schedule HVAC service calls, dispatch technicians, and collect payments on-site. Built for HVAC contractors of all sizes.",
    canonical: `${BASE}/hvac`,
  },
  "/plumbing": {
    title: "Plumbing Scheduling Software — Jobs, Crews & Invoices | Certxa",
    description: "Manage plumbing service calls, dispatch plumbers, and send invoices from your phone. Built for plumbing contractors.",
    canonical: `${BASE}/plumbing`,
  },
  "/electrical": {
    title: "Electrical Contractor Scheduling Software — Jobs & Invoices | Certxa",
    description: "Schedule electrical jobs, manage permits, dispatch electricians, and invoice clients. Built for electrical contractors and small crews.",
    canonical: `${BASE}/electrical`,
  },
  "/carpet-cleaning": {
    title: "Carpet Cleaning Scheduling Software — Jobs & Invoices | Certxa",
    description: "Book carpet cleaning jobs online, dispatch crews, and send invoices automatically. Built for carpet and upholstery cleaning businesses.",
    canonical: `${BASE}/carpet-cleaning`,
  },
  "/pressure-washing": {
    title: "Pressure Washing Scheduling Software — Jobs & Invoices | Certxa",
    description: "Manage pressure washing jobs, dispatch crews, and collect payments fast. Online booking lets clients request quotes 24/7.",
    canonical: `${BASE}/pressure-washing`,
  },
  "/window-cleaning": {
    title: "Window Cleaning Scheduling Software — Routes & Invoices | Certxa",
    description: "Schedule window cleaning routes, manage recurring clients, and invoice automatically. Built for residential and commercial window cleaners.",
    canonical: `${BASE}/window-cleaning`,
  },
};
