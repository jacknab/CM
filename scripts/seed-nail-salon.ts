/**
 * Seed script: Glamour Nails Studio
 * Creates a complete fake nail salon account for testing the AI receptionist.
 * Run with: cd artifacts/api-server && pnpm tsx ../../scripts/seed-nail-salon.ts
 */
import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as bcrypt from "bcryptjs";
import {
  users,
  locations,
  services,
  serviceCategories,
  staff,
  staffServices,
  staffAvailability,
  businessHours,
  customers,
  appointments,
  calendarSettings,
  storeSettings,
  smsSettings,
} from "../../shared/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function main() {
  console.log("🌸 Seeding Glamour Nails Studio...\n");

  // ── 1. Owner user ──────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("nailsalon123", 10);

  const [newUser] = await db
    .insert(users)
    .values({
      email: "owner@glamournails.com",
      password: passwordHash,
      firstName: "Sophia",
      lastName: "Nguyen",
      role: "owner",
      onboardingCompleted: true,
      subscriptionStatus: "trialing",
      trialStartedAt: new Date(),
      trialEndsAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    })
    .onConflictDoNothing()
    .returning();

  // If user already existed, fetch it
  let ownerId: string;
  if (!newUser) {
    const { eq } = await import("drizzle-orm");
    const [existing] = await db.select().from(users).where(eq(users.email, "owner@glamournails.com")).limit(1);
    ownerId = existing.id;
    console.log("✓ Owner user already exists:", existing.email);
  } else {
    ownerId = newUser.id;
    console.log("✓ Created owner:", newUser.email);
  }

  // ── 2. Location ────────────────────────────────────────────────────────────
  const [loc] = await db
    .insert(locations)
    .values({
      name: "Glamour Nails Studio",
      timezone: "America/Los_Angeles",
      address: "456 Blossom Ave",
      city: "Los Angeles",
      state: "CA",
      postcode: "90001",
      phone: "+13105550180",
      email: "hello@glamournails.com",
      category: "Nail Salon",
      bookingSlug: "glamour-nails-la",
      bookingTheme: "simple",
      accountStatus: "Active",
      posEnabled: true,
      userId: ownerId,
    })
    .returning();
  const storeId = loc.id;
  console.log("✓ Created location:", loc.name, "(id:", storeId + ")");

  // ── 3. Service categories ──────────────────────────────────────────────────
  const [catMani] = await db.insert(serviceCategories).values({ name: "Manicures",         storeId, sortOrder: 1 }).returning();
  const [catPedi] = await db.insert(serviceCategories).values({ name: "Pedicures",         storeId, sortOrder: 2 }).returning();
  const [catGel]  = await db.insert(serviceCategories).values({ name: "Gel & Acrylics",    storeId, sortOrder: 3 }).returning();
  const [catExtra]= await db.insert(serviceCategories).values({ name: "Nail Art & Add-ons",storeId, sortOrder: 4 }).returning();
  console.log("✓ Created 4 service categories");

  // ── 4. Services ────────────────────────────────────────────────────────────
  const serviceRows = await db.insert(services).values([
    { name: "Classic Manicure",        description: "Shape, buff, and polish with your choice of color.",                   duration: 30, price: "25.00", category: "Manicures",         categoryId: catMani.id, storeId },
    { name: "Spa Manicure",            description: "Exfoliation, paraffin wax, massage, and polish.",                     duration: 45, price: "40.00", category: "Manicures",         categoryId: catMani.id, storeId },
    { name: "French Manicure",         description: "Classic white-tip French polish.",                                    duration: 40, price: "35.00", category: "Manicures",         categoryId: catMani.id, storeId },
    { name: "Classic Pedicure",        description: "Soak, trim, file, and polish.",                                       duration: 45, price: "35.00", category: "Pedicures",         categoryId: catPedi.id, storeId },
    { name: "Spa Pedicure",            description: "Exfoliation, callus removal, mask, massage, and polish.",             duration: 60, price: "55.00", category: "Pedicures",         categoryId: catPedi.id, storeId },
    { name: "Gel Pedicure",            description: "Long-lasting gel polish pedicure.",                                   duration: 60, price: "60.00", category: "Pedicures",         categoryId: catPedi.id, storeId },
    { name: "Gel Manicure",            description: "Long-lasting gel polish with UV cure — no chips for 2+ weeks.",       duration: 45, price: "45.00", category: "Gel & Acrylics",    categoryId: catGel.id,  storeId },
    { name: "Gel Fill",                description: "Gel polish fill for existing gel nails.",                             duration: 30, price: "35.00", category: "Gel & Acrylics",    categoryId: catGel.id,  storeId },
    { name: "Full Set Acrylic Nails",  description: "Complete set of acrylic nails with your choice of length and shape.", duration: 90, price: "75.00", category: "Gel & Acrylics",    categoryId: catGel.id,  storeId },
    { name: "Acrylic Fill",            description: "Acrylic fill for existing acrylic nails.",                            duration: 60, price: "50.00", category: "Gel & Acrylics",    categoryId: catGel.id,  storeId },
    { name: "Dip Powder Manicure",     description: "Chip-resistant dip powder manicure.",                                 duration: 60, price: "55.00", category: "Gel & Acrylics",    categoryId: catGel.id,  storeId },
    { name: "Nail Art (per nail)",     description: "Custom nail art design on any nail.",                                 duration: 10, price: "5.00",  category: "Nail Art & Add-ons", categoryId: catExtra.id,storeId },
    { name: "Paraffin Wax Treatment",  description: "Warm paraffin wax soak for hands or feet.",                          duration: 15, price: "15.00", category: "Nail Art & Add-ons", categoryId: catExtra.id,storeId },
  ]).returning();
  console.log("✓ Created", serviceRows.length, "services");

  // ── 5. Staff ───────────────────────────────────────────────────────────────
  const [linh] = await db.insert(staff).values({
    name: "Linh Tran", email: "linh@glamournails.com", phone: "+13105550191",
    role: "nail_tech", bio: "Senior nail tech, 8 yrs experience. Specializes in acrylics and nail art.",
    color: "#ec4899", storeId, status: "active", employmentType: "stylist",
  }).returning();

  const [mai] = await db.insert(staff).values({
    name: "Mai Pham", email: "mai@glamournails.com", phone: "+13105550192",
    role: "nail_tech", bio: "Gel, dip powder, and intricate nail art specialist.",
    color: "#8b5cf6", storeId, status: "active", employmentType: "stylist",
  }).returning();

  const [jessica] = await db.insert(staff).values({
    name: "Jessica Kim", email: "jessica@glamournails.com", phone: "+13105550193",
    role: "nail_tech", bio: "Pedicure specialist and spa treatment expert.",
    color: "#14b8a6", storeId, status: "active", employmentType: "stylist",
  }).returning();
  console.log("✓ Created 3 staff: Linh, Mai, Jessica");

  // ── 6. Staff ↔ Services ────────────────────────────────────────────────────
  const allIds   = serviceRows.map(s => s.id);
  const gelIds   = serviceRows.filter(s => ["Gel & Acrylics","Manicures"].includes(s.category)).map(s => s.id);

  await db.insert(staffServices).values(allIds.map(sid => ({ staffId: linh.id,    serviceId: sid })));
  await db.insert(staffServices).values(gelIds.map(sid => ({ staffId: mai.id,     serviceId: sid })));
  await db.insert(staffServices).values(allIds.map(sid => ({ staffId: jessica.id, serviceId: sid })));
  console.log("✓ Linked staff to services");

  // ── 7. Staff availability (Mon–Sat 9am–6pm) ───────────────────────────────
  for (const member of [linh, mai, jessica]) {
    await db.insert(staffAvailability).values(
      [1,2,3,4,5,6].map(day => ({ staffId: member.id, dayOfWeek: day, startTime: "09:00", endTime: "18:00" }))
    );
  }
  console.log("✓ Staff availability set Mon–Sat 9am–6pm");

  // ── 8. Business hours ─────────────────────────────────────────────────────
  await db.insert(businessHours).values([
    { storeId, dayOfWeek: 0, openTime: "10:00", closeTime: "17:00", isClosed: false },
    { storeId, dayOfWeek: 1, openTime: "09:00", closeTime: "18:00", isClosed: false },
    { storeId, dayOfWeek: 2, openTime: "09:00", closeTime: "18:00", isClosed: false },
    { storeId, dayOfWeek: 3, openTime: "09:00", closeTime: "18:00", isClosed: false },
    { storeId, dayOfWeek: 4, openTime: "09:00", closeTime: "18:00", isClosed: false },
    { storeId, dayOfWeek: 5, openTime: "09:00", closeTime: "19:00", isClosed: false },
    { storeId, dayOfWeek: 6, openTime: "09:00", closeTime: "19:00", isClosed: false },
  ]);
  console.log("✓ Business hours set");

  // ── 9. Calendar settings ──────────────────────────────────────────────────
  await db.insert(calendarSettings).values({
    storeId, startOfWeek: "monday", timeSlotInterval: 15,
    autoCompleteAppointments: true, walkInsEnabled: true, showPrices: true,
  });

  // ── 10. Customers ─────────────────────────────────────────────────────────
  const createdCustomers = await db.insert(customers).values([
    { name: "Ashley Johnson",   email: "ashley@example.com",   phone: "+13105550201", loyaltyPoints: 120, storeId },
    { name: "Maria Garcia",     email: "maria@example.com",    phone: "+13105550202", loyaltyPoints: 80,  storeId },
    { name: "Emily Chen",       email: "emily@example.com",    phone: "+13105550203", loyaltyPoints: 250, storeId },
    { name: "Priya Patel",      email: "priya@example.com",    phone: "+13105550204", loyaltyPoints: 60,  storeId },
    { name: "Destiny Williams", email: "destiny@example.com",  phone: "+13105550205", loyaltyPoints: 190, storeId },
    { name: "Rachel Kim",       email: "rachel@example.com",   phone: "+13105550206", loyaltyPoints: 40,  storeId },
    { name: "Nicole Brown",     email: "nicole@example.com",   phone: "+13105550207", loyaltyPoints: 300, storeId },
    { name: "Taylor Smith",     email: "taylor@example.com",   phone: "+13105550208", loyaltyPoints: 70,  storeId },
  ]).returning();
  console.log("✓ Created", createdCustomers.length, "customers");

  // ── 11. Appointments (past + upcoming) ────────────────────────────────────
  const now = new Date();
  const d = (days: number, hr: number, min = 0) => {
    const dt = new Date(now);
    dt.setDate(dt.getDate() + days);
    dt.setHours(hr, min, 0, 0);
    return dt;
  };

  const svc = (name: string) => serviceRows.find(s => s.name === name)!;
  const [ashley, maria, emily, priya, destiny, rachel, nicole, taylor] = createdCustomers;

  await db.insert(appointments).values([
    // Past / completed
    { date: d(-14,10),   duration: 45, status: "completed", serviceId: svc("Gel Manicure").id,           staffId: mai.id,     customerId: ashley.id,  storeId, totalPaid: "45.00", tipAmount: "8.00",  paymentMethod: "card" },
    { date: d(-14,11),   duration: 60, status: "completed", serviceId: svc("Spa Pedicure").id,            staffId: jessica.id, customerId: emily.id,   storeId, totalPaid: "55.00", tipAmount: "10.00", paymentMethod: "card" },
    { date: d(-10, 9),   duration: 30, status: "completed", serviceId: svc("Classic Manicure").id,        staffId: linh.id,    customerId: maria.id,   storeId, totalPaid: "25.00", tipAmount: "5.00",  paymentMethod: "cash" },
    { date: d(-7, 10),   duration: 60, status: "completed", serviceId: svc("Full Set Acrylic Nails").id,  staffId: linh.id,    customerId: ashley.id,  storeId, totalPaid: "75.00", tipAmount: "15.00", paymentMethod: "card" },
    { date: d(-7, 14),   duration: 60, status: "completed", serviceId: svc("Dip Powder Manicure").id,     staffId: mai.id,     customerId: nicole.id,  storeId, totalPaid: "55.00", tipAmount: "10.00", paymentMethod: "card" },
    { date: d(-3, 11),   duration: 45, status: "completed", serviceId: svc("Spa Manicure").id,            staffId: linh.id,    customerId: priya.id,   storeId, totalPaid: "40.00", tipAmount: "7.00",  paymentMethod: "card" },
    // Upcoming
    { date: d(1, 10, 0),  duration: 45, status: "confirmed", serviceId: svc("Gel Manicure").id,           staffId: mai.id,     customerId: ashley.id,  storeId },
    { date: d(1, 11, 0),  duration: 60, status: "confirmed", serviceId: svc("Spa Pedicure").id,            staffId: jessica.id, customerId: emily.id,   storeId },
    { date: d(1, 13, 0),  duration: 30, status: "confirmed", serviceId: svc("Gel Fill").id,               staffId: mai.id,     customerId: destiny.id, storeId },
    { date: d(1, 14,30),  duration: 45, status: "confirmed", serviceId: svc("Spa Manicure").id,            staffId: linh.id,    customerId: maria.id,   storeId },
    { date: d(2, 9,  0),  duration: 90, status: "confirmed", serviceId: svc("Full Set Acrylic Nails").id,  staffId: linh.id,    customerId: priya.id,   storeId },
    { date: d(2, 10,30),  duration: 60, status: "confirmed", serviceId: svc("Dip Powder Manicure").id,     staffId: mai.id,     customerId: nicole.id,  storeId },
    { date: d(2, 13, 0),  duration: 60, status: "pending",   serviceId: svc("Spa Pedicure").id,            staffId: jessica.id, customerId: taylor.id,  storeId },
    { date: d(3, 10, 0),  duration: 60, status: "confirmed", serviceId: svc("Acrylic Fill").id,            staffId: linh.id,    customerId: ashley.id,  storeId },
    { date: d(5, 11, 0),  duration: 45, status: "confirmed", serviceId: svc("Gel Manicure").id,            staffId: mai.id,     customerId: rachel.id,  storeId },
    { date: d(7, 9, 30),  duration: 30, status: "pending",   serviceId: svc("Classic Manicure").id,        staffId: linh.id,    customerId: emily.id,   storeId },
  ]);
  console.log("✓ Created 16 appointments (past + upcoming)");

  // ── 12. AI Receptionist: ENABLED ──────────────────────────────────────────
  await db.insert(storeSettings).values({
    storeId,
    preferences: JSON.stringify({
      aiReceptionistEnabled: true,
      businessName: "Glamour Nails Studio",
    }),
  });
  console.log("✓ AI Receptionist ENABLED");

  // ── 13. SMS settings skeleton ─────────────────────────────────────────────
  await db.insert(smsSettings).values({
    storeId,
    bookingConfirmationEnabled: false,
    reminderEnabled: false,
    reviewRequestEnabled: false,
  });

  // ── Done ───────────────────────────────────────────────────────────────────
  const devDomain = process.env.REPLIT_DEV_DOMAIN || "YOUR-REPLIT-DOMAIN.replit.dev";
  const webhookUrl = `https://${devDomain}/api/webhook/twilio/${storeId}`;

  console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║        🌸  GLAMOUR NAILS STUDIO — SEED COMPLETE  🌸                 ║");
  console.log("╠══════════════════════════════════════════════════════════════════════╣");
  console.log("║  LOGIN                                                               ║");
  console.log("║  Email    : owner@glamournails.com                                   ║");
  console.log("║  Password : nailsalon123                                             ║");
  console.log("╠══════════════════════════════════════════════════════════════════════╣");
  console.log(`║  Store ID : ${storeId}                                                          ║`);
  console.log("╠══════════════════════════════════════════════════════════════════════╣");
  console.log("║  TWILIO WEBHOOK URL (add to your Twilio number):                     ║");
  console.log(`║  ${webhookUrl}`);
  console.log("╚══════════════════════════════════════════════════════════════════════╝\n");

  await pool.end();
}

main().catch(err => { console.error("Seed failed:", err); process.exit(1); });
