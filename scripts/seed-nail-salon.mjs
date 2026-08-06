/**
 * Seed: Glamour Nails Studio
 * Plain Node.js — only requires `pg` (no TypeScript, no build step).
 * Run: node scripts/seed-nail-salon.mjs
 */
import pg from "/home/runner/workspace/scripts/node_modules/pg/lib/index.js";
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// bcrypt hash of "nailsalon123" (10 rounds)
const PASSWORD_HASH = "$2b$10$F.Qb/226PxENAXtg1s1jPOdXAVPvgIur5WwNU/KwCN5Z1igjPQUZa";

async function q(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

function d(daysFromNow, hour, min = 0) {
  const dt = new Date();
  dt.setDate(dt.getDate() + daysFromNow);
  dt.setHours(hour, min, 0, 0);
  return dt.toISOString();
}

async function main() {
  console.log("\n🌸  Seeding Glamour Nails Studio...\n");

  // ── 1. Owner user ──────────────────────────────────────────────────────────
  let [owner] = await q(
    `INSERT INTO users (email, password, first_name, last_name, role,
       onboarding_completed, subscription_status, trial_started_at, trial_ends_at)
     VALUES ($1,$2,$3,$4,'owner',true,'trialing',NOW(),NOW()+INTERVAL '60 days')
     ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email
     RETURNING id, email`,
    ["owner@glamournails.com", PASSWORD_HASH, "Sophia", "Nguyen"]
  );
  console.log("✓ Owner:", owner.email, "(id:", owner.id + ")");

  // ── 2. Location ────────────────────────────────────────────────────────────
  const [loc] = await q(
    `INSERT INTO locations (name,timezone,address,city,state,postcode,phone,email,
       category,booking_slug,booking_theme,account_status,pos_enabled,user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'simple','Active',true,$11)
     RETURNING id, name`,
    [
      "Glamour Nails Studio","America/Los_Angeles","456 Blossom Ave",
      "Los Angeles","CA","90001","+13105550180","hello@glamournails.com",
      "Nail Salon","glamour-nails-la", owner.id,
    ]
  );
  const storeId = loc.id;
  console.log("✓ Location:", loc.name, "(store id:", storeId + ")");

  // ── 3. Service categories ──────────────────────────────────────────────────
  const cats = {};
  for (const [name, sort] of [["Manicures",1],["Pedicures",2],["Gel & Acrylics",3],["Nail Art & Add-ons",4]]) {
    const [row] = await q(
      `INSERT INTO service_categories (name,store_id,sort_order) VALUES ($1,$2,$3) RETURNING id,name`,
      [name, storeId, sort]
    );
    cats[name] = row.id;
  }
  console.log("✓ 4 service categories");

  // ── 4. Services ────────────────────────────────────────────────────────────
  const svcDefs = [
    ["Classic Manicure",       "Shape, buff, and polish with your choice of color.",                   30, "25.00","Manicures"],
    ["Spa Manicure",           "Exfoliation, paraffin wax, massage, and polish.",                      45, "40.00","Manicures"],
    ["French Manicure",        "Classic white-tip French polish.",                                      40, "35.00","Manicures"],
    ["Classic Pedicure",       "Soak, trim, file, and polish.",                                        45, "35.00","Pedicures"],
    ["Spa Pedicure",           "Exfoliation, callus removal, mask, massage, and polish.",               60, "55.00","Pedicures"],
    ["Gel Pedicure",           "Long-lasting gel polish pedicure.",                                    60, "60.00","Pedicures"],
    ["Gel Manicure",           "Long-lasting gel polish — no chips for 2+ weeks.",                     45, "45.00","Gel & Acrylics"],
    ["Gel Fill",               "Gel polish fill for existing gel nails.",                              30, "35.00","Gel & Acrylics"],
    ["Full Set Acrylic Nails", "Complete set of acrylic nails, any length and shape.",                 90, "75.00","Gel & Acrylics"],
    ["Acrylic Fill",           "Acrylic fill for existing acrylic nails.",                             60, "50.00","Gel & Acrylics"],
    ["Dip Powder Manicure",    "Chip-resistant dip powder manicure.",                                  60, "55.00","Gel & Acrylics"],
    ["Nail Art (per nail)",    "Custom nail art design on any nail.",                                  10, "5.00", "Nail Art & Add-ons"],
    ["Paraffin Wax Treatment", "Warm paraffin wax soak for hands or feet.",                            15, "15.00","Nail Art & Add-ons"],
  ];

  const svcIds = {};
  for (const [name, desc, dur, price, cat] of svcDefs) {
    const [row] = await q(
      `INSERT INTO services (name,description,duration,price,category,category_id,store_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [name, desc, dur, price, cat, cats[cat], storeId]
    );
    svcIds[name] = row.id;
  }
  console.log("✓", svcDefs.length, "services");

  // ── 5. Staff ───────────────────────────────────────────────────────────────
  const staffRows = {};
  const staffDefs = [
    ["Linh Tran",   "linh@glamournails.com",    "+13105550191","#ec4899","Senior nail tech — acrylics & nail art specialist."],
    ["Mai Pham",    "mai@glamournails.com",     "+13105550192","#8b5cf6","Gel, dip powder & intricate nail art specialist."],
    ["Jessica Kim", "jessica@glamournails.com", "+13105550193","#14b8a6","Pedicure specialist & spa treatment expert."],
  ];
  for (const [name, email, phone, color, bio] of staffDefs) {
    const [row] = await q(
      `INSERT INTO staff (name,email,phone,role,bio,color,store_id,status,employment_type)
       VALUES ($1,$2,$3,'nail_tech',$4,$5,$6,'active','stylist') RETURNING id`,
      [name, email, phone, bio, color, storeId]
    );
    staffRows[name] = row.id;
  }
  console.log("✓ 3 staff: Linh, Mai, Jessica");

  // ── 6. Staff ↔ Services ────────────────────────────────────────────────────
  const linSvcs = Object.values(svcIds);
  const maiSvcs  = svcDefs.filter(([,,,, cat]) => ["Manicures","Gel & Acrylics"].includes(cat)).map(([name])=>svcIds[name]);
  const jesSvcs  = Object.values(svcIds);
  for (const sid of linSvcs) await q(`INSERT INTO staff_services (staff_id,service_id) VALUES ($1,$2)`, [staffRows["Linh Tran"], sid]);
  for (const sid of maiSvcs)  await q(`INSERT INTO staff_services (staff_id,service_id) VALUES ($1,$2)`, [staffRows["Mai Pham"],   sid]);
  for (const sid of jesSvcs)  await q(`INSERT INTO staff_services (staff_id,service_id) VALUES ($1,$2)`, [staffRows["Jessica Kim"],sid]);
  console.log("✓ Staff linked to services");

  // ── 7. Staff availability Mon–Sat 9am–6pm ─────────────────────────────────
  for (const staffId of Object.values(staffRows)) {
    for (const day of [1,2,3,4,5,6]) {
      await q(
        `INSERT INTO staff_availability (staff_id,day_of_week,start_time,end_time) VALUES ($1,$2,'09:00','18:00')`,
        [staffId, day]
      );
    }
  }
  console.log("✓ Staff availability Mon–Sat");

  // ── 8. Business hours ─────────────────────────────────────────────────────
  const bh = [[0,"10:00","17:00"],[1,"09:00","18:00"],[2,"09:00","18:00"],[3,"09:00","18:00"],
              [4,"09:00","18:00"],[5,"09:00","19:00"],[6,"09:00","19:00"]];
  for (const [day, open, close] of bh) {
    await q(
      `INSERT INTO business_hours (store_id,day_of_week,open_time,close_time,is_closed)
       VALUES ($1,$2,$3,$4,false)`,
      [storeId, day, open, close]
    );
  }
  console.log("✓ Business hours set");

  // ── 9. Calendar settings ──────────────────────────────────────────────────
  await q(
    `INSERT INTO calendar_settings (store_id,start_of_week,time_slot_interval,
       non_working_hours_display,allow_booking_outside_hours,auto_complete_appointments,
       auto_mark_no_shows,show_prices,walk_ins_enabled,language)
     VALUES ($1,'monday',15,1,true,true,false,true,true,'en')`,
    [storeId]
  );

  // ── 10. Customers ─────────────────────────────────────────────────────────
  const customerDefs = [
    ["Ashley Johnson",   "ashley@example.com",   "+13105550201", 120],
    ["Maria Garcia",     "maria@example.com",    "+13105550202",  80],
    ["Emily Chen",       "emily@example.com",    "+13105550203", 250],
    ["Priya Patel",      "priya@example.com",    "+13105550204",  60],
    ["Destiny Williams", "destiny@example.com",  "+13105550205", 190],
    ["Rachel Kim",       "rachel@example.com",   "+13105550206",  40],
    ["Nicole Brown",     "nicole@example.com",   "+13105550207", 300],
    ["Taylor Smith",     "taylor@example.com",   "+13105550208",  70],
  ];
  const custIds = {};
  for (const [name, email, phone, pts] of customerDefs) {
    const [row] = await q(
      `INSERT INTO customers (name,email,phone,loyalty_points,store_id,marketing_opt_in)
       VALUES ($1,$2,$3,$4,$5,true) RETURNING id`,
      [name, email, phone, pts, storeId]
    );
    custIds[name] = row.id;
  }
  console.log("✓", customerDefs.length, "customers");

  // ── 11. Appointments ──────────────────────────────────────────────────────
  const appts = [
    // Past completed
    [d(-14,10), 45,"completed",svcIds["Gel Manicure"],          staffRows["Mai Pham"],    custIds["Ashley Johnson"],  "card","45.00","8.00"],
    [d(-14,11), 60,"completed",svcIds["Spa Pedicure"],           staffRows["Jessica Kim"], custIds["Emily Chen"],      "card","55.00","10.00"],
    [d(-10, 9), 30,"completed",svcIds["Classic Manicure"],       staffRows["Linh Tran"],   custIds["Maria Garcia"],    "cash","25.00","5.00"],
    [d(-7, 10), 60,"completed",svcIds["Full Set Acrylic Nails"], staffRows["Linh Tran"],   custIds["Ashley Johnson"],  "card","75.00","15.00"],
    [d(-7, 14), 60,"completed",svcIds["Dip Powder Manicure"],    staffRows["Mai Pham"],    custIds["Nicole Brown"],    "card","55.00","10.00"],
    [d(-3, 11), 45,"completed",svcIds["Spa Manicure"],           staffRows["Linh Tran"],   custIds["Priya Patel"],     "card","40.00","7.00"],
    // Upcoming confirmed
    [d(1,10, 0), 45,"confirmed",svcIds["Gel Manicure"],          staffRows["Mai Pham"],    custIds["Ashley Johnson"],  null,null,null],
    [d(1,11, 0), 60,"confirmed",svcIds["Spa Pedicure"],           staffRows["Jessica Kim"], custIds["Emily Chen"],      null,null,null],
    [d(1,13, 0), 30,"confirmed",svcIds["Gel Fill"],               staffRows["Mai Pham"],    custIds["Destiny Williams"],null,null,null],
    [d(1,14,30), 45,"confirmed",svcIds["Spa Manicure"],           staffRows["Linh Tran"],   custIds["Maria Garcia"],    null,null,null],
    [d(2, 9, 0), 90,"confirmed",svcIds["Full Set Acrylic Nails"], staffRows["Linh Tran"],   custIds["Priya Patel"],     null,null,null],
    [d(2,10,30), 60,"confirmed",svcIds["Dip Powder Manicure"],    staffRows["Mai Pham"],    custIds["Nicole Brown"],    null,null,null],
    [d(2,13, 0), 60,"pending",  svcIds["Spa Pedicure"],           staffRows["Jessica Kim"], custIds["Taylor Smith"],    null,null,null],
    [d(3,10, 0), 60,"confirmed",svcIds["Acrylic Fill"],           staffRows["Linh Tran"],   custIds["Ashley Johnson"],  null,null,null],
    [d(5,11, 0), 45,"confirmed",svcIds["Gel Manicure"],           staffRows["Mai Pham"],    custIds["Rachel Kim"],      null,null,null],
    [d(7, 9,30), 30,"pending",  svcIds["Classic Manicure"],       staffRows["Linh Tran"],   custIds["Emily Chen"],      null,null,null],
  ];
  for (const [date, dur, status, svcId, staffId, custId, pm, total, tip] of appts) {
    await q(
      `INSERT INTO appointments (date,duration,status,service_id,staff_id,customer_id,
         store_id,payment_method,total_paid,tip_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [date, dur, status, svcId, staffId, custId, storeId, pm, total, tip]
    );
  }
  console.log("✓", appts.length, "appointments (past + upcoming)");

  // ── 12. AI Receptionist: ENABLED ──────────────────────────────────────────
  await q(
    `INSERT INTO store_settings (store_id, preferences, updated_at)
     VALUES ($1,$2,NOW())
     ON CONFLICT (store_id) DO UPDATE SET preferences=EXCLUDED.preferences`,
    [storeId, JSON.stringify({ aiReceptionistEnabled: true, businessName: "Glamour Nails Studio" })]
  );
  console.log("✓ AI Receptionist ENABLED");

  // ── 13. SMS settings ─────────────────────────────────────────────────────
  await q(
    `INSERT INTO sms_settings (store_id,booking_confirmation_enabled,reminder_enabled,review_request_enabled)
     VALUES ($1,false,false,false) ON CONFLICT DO NOTHING`,
    [storeId]
  );

  // ── Summary ────────────────────────────────────────────────────────────────
  const devDomain = process.env.REPLIT_DEV_DOMAIN || "YOUR-REPL.replit.dev";
  const webhookUrl = `https://${devDomain}/api/webhook/twilio/${storeId}`;

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║         🌸  GLAMOUR NAILS STUDIO — SEED COMPLETE  🌸                    ║
╠══════════════════════════════════════════════════════════════════════════╣
║  LOGIN                                                                   ║
║  Email    :  owner@glamournails.com                                      ║
║  Password :  nailsalon123                                                ║
╠══════════════════════════════════════════════════════════════════════════╣
║  Store ID :  ${String(storeId).padEnd(59)}║
╠══════════════════════════════════════════════════════════════════════════╣
║  TWILIO WEBHOOK URL — paste this into your Twilio phone number:          ║
║  ${webhookUrl.padEnd(72)}║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  await pool.end();
}

main().catch(err => { console.error("Seed failed:", err); process.exit(1); });
