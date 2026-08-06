import { useEffect } from "react";
import MarketingLayout from "@/components/layout/MarketingLayout";
import {
  CalendarCheck, MessageSquare, Star, ClipboardList,
  BarChart3, Users, ShieldCheck, Zap, ArrowRight, CheckCircle2,
  CreditCard, Smartphone, DollarSign, Image, Clock, Sparkles,
} from "lucide-react";

const INK      = "#0d0d0d";
const INK_MID  = "#1c1c1e";
const GOLD     = "#c9a227";
const GOLD_LIGHT = "#f0c84a";
const OFF_WHITE = "#f8f7f5";
const WARM_WHITE = "#ffffff";

export default function TattooStudioLandingPage() {
  useEffect(() => {
    document.title = "Tattoo Studio Software | Certxa SalonOS";
  }, []);

  return (
    <MarketingLayout>
      {/* ── Hero ── */}
      <section style={{
        background:`linear-gradient(135deg, ${INK} 0%, #1c1c1e 60%, #2a1a00 100%)`,
        color:"#fff",
        padding:"80px 24px 100px",
        position:"relative",
        overflow:"hidden",
      }}>
        {/* Decorative gold orbs */}
        <div style={{ position:"absolute", top:-80, right:-80, width:400, height:400,
          borderRadius:"50%", background:"rgba(201,162,39,0.08)", pointerEvents:"none" }} />
        <div style={{ position:"absolute", bottom:-60, left:-60, width:260, height:260,
          borderRadius:"50%", background:"rgba(201,162,39,0.06)", pointerEvents:"none" }} />

        <div style={{ maxWidth:1160, margin:"0 auto", display:"grid",
          gridTemplateColumns:"1fr 1fr", gap:56, alignItems:"center" }}
          className="hero-grid">

          {/* Left copy */}
          <div>
            <div style={{
              display:"inline-flex", alignItems:"center", gap:8,
              background:"rgba(201,162,39,0.15)", border:"1px solid rgba(201,162,39,0.3)",
              borderRadius:50, padding:"6px 16px", marginBottom:24,
            }}>
              <Sparkles size={14} color={GOLD_LIGHT} />
              <span style={{ fontSize:".78rem", fontWeight:600, color:GOLD_LIGHT, letterSpacing:".06em" }}>
                TATTOO STUDIO SOFTWARE
              </span>
            </div>

            <h1 style={{ fontSize:"clamp(2.2rem,4vw,3.4rem)", fontWeight:800,
              lineHeight:1.12, marginBottom:20, letterSpacing:"-0.02em" }}>
              Booking software<br />
              <span style={{ color:GOLD_LIGHT }}>made for ink.</span>
            </h1>
            <p style={{ fontSize:"1.1rem", color:"rgba(255,255,255,.65)",
              lineHeight:1.65, marginBottom:36, maxWidth:480 }}>
              Certxa handles deposits, consent forms, artist scheduling, and automated 
              aftercare texts — so you stay focused on the art.
            </p>

            <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
              <a href="/auth?mode=register" style={{
                display:"inline-flex", alignItems:"center", gap:8,
                padding:"14px 28px", borderRadius:50, fontWeight:700,
                fontSize:".95rem", textDecoration:"none",
                background:`linear-gradient(135deg, ${GOLD}, #a07818)`,
                color:INK, boxShadow:"0 4px 20px rgba(201,162,39,.4)",
                transition:"transform .15s, box-shadow .15s",
              }}>
                Start Free Trial <ArrowRight size={16} />
              </a>
              <a href="/overview" style={{
                display:"inline-flex", alignItems:"center", gap:8,
                padding:"14px 28px", borderRadius:50, fontWeight:600,
                fontSize:".95rem", textDecoration:"none",
                border:"1px solid rgba(255,255,255,.2)", color:"rgba(255,255,255,.8)",
                transition:"border-color .15s",
              }}>
                See How It Works
              </a>
            </div>

            <div style={{ display:"flex", gap:24, marginTop:32, flexWrap:"wrap" }}>
              {["No credit card required","Free 14-day trial","Cancel anytime"].map(t => (
                <div key={t} style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <CheckCircle2 size={14} color={GOLD} />
                  <span style={{ fontSize:".8rem", color:"rgba(255,255,255,.55)" }}>{t}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — hero image */}
          <div style={{ position:"relative", borderRadius:24, overflow:"hidden",
            boxShadow:"0 32px 80px rgba(0,0,0,.65)" }}>
            <img src="/tattoo-hero-1.png" alt="Tattoo artist at work"
              style={{ width:"100%", height:420, objectFit:"cover", display:"block" }} />
            <div style={{ position:"absolute", inset:0,
              background:"linear-gradient(180deg, transparent 40%, rgba(13,13,13,.75) 100%)" }} />
            {/* Floating badge */}
            <div style={{
              position:"absolute", bottom:24, left:24, right:24,
              background:"rgba(0,0,0,.55)", backdropFilter:"blur(16px)",
              border:"1px solid rgba(201,162,39,.3)",
              borderRadius:16, padding:"14px 18px",
              display:"flex", alignItems:"center", gap:12,
            }}>
              <div style={{ width:36, height:36, borderRadius:10,
                background:"rgba(201,162,39,.2)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <DollarSign size={18} color={GOLD_LIGHT} />
              </div>
              <div>
                <p style={{ fontSize:".75rem", color:"rgba(255,255,255,.5)", margin:0 }}>Deposit collected</p>
                <p style={{ fontSize:"1rem", fontWeight:700, color:"#fff", margin:0 }}>$350 secured · Jess T.</p>
              </div>
              <div style={{ marginLeft:"auto" }}>
                <span style={{ fontSize:".72rem", fontWeight:700,
                  background:"rgba(201,162,39,.2)", color:GOLD_LIGHT,
                  borderRadius:50, padding:"4px 10px", border:"1px solid rgba(201,162,39,.3)" }}>
                  Confirmed
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2-Column Bento Grid ── */}
      <section style={{ background:OFF_WHITE, padding:"80px 24px" }}>
        <div style={{ maxWidth:1160, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:52 }}>
            <p style={{ fontSize:".8rem", fontWeight:700, color:GOLD,
              letterSpacing:".1em", textTransform:"uppercase", marginBottom:10 }}>
              Built for tattoo studios
            </p>
            <h2 style={{ fontSize:"clamp(1.8rem,3vw,2.6rem)", fontWeight:800,
              color:INK, letterSpacing:"-0.02em", marginBottom:14 }}>
              From first inquiry to aftercare follow-up
            </h2>
            <p style={{ fontSize:"1.05rem", color:"#4b5563", maxWidth:520, margin:"0 auto" }}>
              Every tool your studio needs — deposits, consent forms, artist scheduling, and automated messages.
            </p>
          </div>

          {/* Bento grid — 2 columns */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}
            className="bento-grid">

            {/* ── Cell 1: Deposit collection (tall, left col) ── */}
            <div style={{
              gridRow:"span 2",
              background:`linear-gradient(160deg, ${INK} 0%, #1c1c1e 60%, #2a1a00 100%)`,
              borderRadius:24, padding:32, color:"#fff",
              display:"flex", flexDirection:"column", gap:20,
              boxShadow:"0 8px 32px rgba(0,0,0,.35)",
              position:"relative", overflow:"hidden", minHeight:440,
            }}>
              <div style={{ position:"absolute", top:-40, right:-40, width:200, height:200,
                borderRadius:"50%", background:"rgba(201,162,39,.08)", pointerEvents:"none" }} />

              <div style={{ width:48, height:48, borderRadius:14,
                background:"rgba(201,162,39,.15)", border:"1px solid rgba(201,162,39,.25)",
                display:"flex", alignItems:"center", justifyContent:"center" }}>
                <DollarSign size={24} color={GOLD_LIGHT} />
              </div>

              <div>
                <h3 style={{ fontSize:"1.5rem", fontWeight:800, marginBottom:8, letterSpacing:"-0.01em" }}>
                  Deposits collected up front
                </h3>
                <p style={{ fontSize:".95rem", color:"rgba(255,255,255,.65)", lineHeight:1.6 }}>
                  Require a non-refundable deposit at booking. No more ghost appointments.
                  Clients pay online before they walk in.
                </p>
              </div>

              {/* Booking flow mock */}
              <div style={{ background:"rgba(255,255,255,.07)", borderRadius:16, padding:20,
                border:"1px solid rgba(201,162,39,.15)" }}>
                <p style={{ fontSize:".72rem", fontWeight:600, color:GOLD,
                  textTransform:"uppercase", letterSpacing:".08em", marginBottom:14 }}>
                  Upcoming sessions
                </p>
                {[
                  { artist:"Maya R.", piece:"Full sleeve (session 2)", deposit:"$250", time:"Tue 11 AM" },
                  { artist:"Kai J.",  piece:"Geometric back piece",   deposit:"$400", time:"Wed 2 PM"  },
                  { artist:"Maya R.", piece:"Neck script",             deposit:"$150", time:"Fri 10 AM" },
                  { artist:"Alex S.", piece:"Traditional rose",        deposit:"$200", time:"Sat 1 PM"  },
                ].map((a,i) => (
                  <div key={i} style={{
                    display:"flex", alignItems:"center", gap:12, padding:"9px 0",
                    borderTop: i===0 ? "none" : "1px solid rgba(255,255,255,.06)",
                  }}>
                    <div style={{ width:3, height:36, borderRadius:2, background:GOLD, opacity:.7, flexShrink:0 }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ margin:0, fontSize:".8rem", fontWeight:600, color:"#fff",
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.piece}</p>
                      <p style={{ margin:0, fontSize:".72rem", color:"rgba(255,255,255,.45)" }}>{a.artist}</p>
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <p style={{ margin:0, fontSize:".78rem", fontWeight:700, color:GOLD_LIGHT }}>{a.deposit}</p>
                      <p style={{ margin:0, fontSize:".68rem", color:"rgba(255,255,255,.4)" }}>{a.time}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop:"auto", display:"flex", gap:12 }}>
                {[["$18K","Deposits / mo"],["0","No-shows"]].map(([n,l]) => (
                  <div key={l} style={{ flex:1, background:"rgba(201,162,39,.12)",
                    border:"1px solid rgba(201,162,39,.2)",
                    borderRadius:12, padding:"12px 14px", textAlign:"center" }}>
                    <p style={{ margin:0, fontSize:"1.3rem", fontWeight:800, color:GOLD_LIGHT }}>{n}</p>
                    <p style={{ margin:0, fontSize:".7rem", color:"rgba(255,255,255,.5)" }}>{l}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Cell 2: Digital consent forms (top right) ── */}
            <div style={{
              background:WARM_WHITE, borderRadius:24, padding:28,
              boxShadow:"0 2px 16px rgba(0,0,0,.06)", border:"1px solid #e5e5e3",
              display:"flex", flexDirection:"column", gap:16,
            }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
                <div style={{ width:44, height:44, borderRadius:12,
                  background:"#fefce8", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <ClipboardList size={22} color={GOLD} />
                </div>
                <span style={{ fontSize:".72rem", fontWeight:700, color:"#92400e",
                  background:"#fef3c7", borderRadius:50, padding:"4px 10px" }}>
                  Auto-sent
                </span>
              </div>
              <div>
                <h3 style={{ fontSize:"1.15rem", fontWeight:700, color:INK, marginBottom:6 }}>
                  Digital consent forms
                </h3>
                <p style={{ fontSize:".88rem", color:"#6b7280", lineHeight:1.55 }}>
                  Custom consent forms sent to clients before their appointment. 
                  Signed forms are stored permanently in their profile — no paper, no hassle.
                </p>
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {["Health conditions","Allergies","Age verification","Aftercare agreement"].map(tag => (
                  <span key={tag} style={{
                    fontSize:".72rem", fontWeight:600,
                    background:"#fefce8", color:"#92400e", borderRadius:50,
                    padding:"4px 10px", border:"1px solid #fde68a",
                  }}>{tag}</span>
                ))}
              </div>
            </div>

            {/* ── Cell 3: Aftercare SMS (bottom right) ── */}
            <div style={{
              background:WARM_WHITE, borderRadius:24, padding:28,
              boxShadow:"0 2px 16px rgba(0,0,0,.06)", border:"1px solid #e5e5e3",
              display:"flex", flexDirection:"column", gap:16,
            }}>
              <div style={{ width:44, height:44, borderRadius:12,
                background:"#fefce8", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <MessageSquare size={22} color={GOLD} />
              </div>
              <div>
                <h3 style={{ fontSize:"1.15rem", fontWeight:700, color:INK, marginBottom:6 }}>
                  Aftercare follow-ups
                </h3>
                <p style={{ fontSize:".88rem", color:"#6b7280", lineHeight:1.55 }}>
                  Automatic aftercare texts go out the day after every session. 
                  Clients feel supported — and are reminded to leave a review.
                </p>
              </div>
              <div style={{ background:"#fefce8", borderRadius:12, padding:14,
                border:"1px solid #fde68a" }}>
                <p style={{ margin:"0 0 8px", fontSize:".72rem", color:"#92400e", fontWeight:600 }}>
                  Certxa Auto-Message
                </p>
                <p style={{ margin:0, fontSize:".8rem", color:"#78350f", lineHeight:1.5 }}>
                  Hey Jess! Hope your new ink is healing well 🖤 Gently moisturise twice daily and keep it out of direct sun. Questions? Text us anytime. ⭐ Love it? Leave us a review!
                </p>
              </div>
            </div>

            {/* ── Cell 4: Flash availability + waitlist (full width) ── */}
            <div style={{
              gridColumn:"span 2",
              background:`linear-gradient(135deg, ${INK} 0%, #1c1c1e 100%)`,
              borderRadius:24, padding:"36px 40px",
              display:"flex", alignItems:"center", gap:48, flexWrap:"wrap",
              boxShadow:"0 8px 32px rgba(0,0,0,.4)",
              position:"relative", overflow:"hidden",
            }}>
              <div style={{ position:"absolute", right:-40, top:"50%", transform:"translateY(-50%)",
                width:300, height:300, borderRadius:"50%",
                background:"rgba(201,162,39,.06)", pointerEvents:"none" }} />
              <div style={{ flex:1, minWidth:260 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                  <div style={{ width:44, height:44, borderRadius:12,
                    background:"rgba(201,162,39,.15)", border:"1px solid rgba(201,162,39,.25)",
                    display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <Clock size={22} color={GOLD_LIGHT} />
                  </div>
                  <h3 style={{ fontSize:"1.3rem", fontWeight:800, color:"#fff", margin:0 }}>
                    Flash drops & waitlist management
                  </h3>
                </div>
                <p style={{ fontSize:".95rem", color:"rgba(255,255,255,.6)", lineHeight:1.6 }}>
                  Post flash availability slots and let the waitlist auto-fill cancellations. 
                  Turn every empty hour into booked revenue.
                </p>
              </div>
              <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
                {[["340%","More bookings from flash drops"],["2 min","Avg waitlist fill time"],["$0","Left on the table"]].map(([n,l]) => (
                  <div key={l} style={{ textAlign:"center" }}>
                    <p style={{ margin:0, fontSize:"1.6rem", fontWeight:800, color:GOLD_LIGHT }}>{n}</p>
                    <p style={{ margin:0, fontSize:".72rem", color:"rgba(255,255,255,.45)", marginTop:3, maxWidth:100 }}>{l}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Cell 5: Client profiles (left) ── */}
            <div style={{
              background:WARM_WHITE, borderRadius:24, padding:28,
              boxShadow:"0 2px 16px rgba(0,0,0,.06)", border:"1px solid #e5e5e3",
              display:"flex", flexDirection:"column", gap:16,
            }}>
              <div style={{ width:44, height:44, borderRadius:12,
                background:"#fefce8", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <Users size={22} color={GOLD} />
              </div>
              <div>
                <h3 style={{ fontSize:"1.15rem", fontWeight:700, color:INK, marginBottom:6 }}>
                  Full client histories
                </h3>
                <p style={{ fontSize:".88rem", color:"#6b7280", lineHeight:1.55 }}>
                  Every piece, every session, skin notes, references, and consent forms — 
                  all in one searchable client profile.
                </p>
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {["Past work","Skin notes","Reference images","Signed forms"].map(tag => (
                  <span key={tag} style={{
                    fontSize:".72rem", fontWeight:600,
                    background:"#fafaf8", color:"#374151", borderRadius:50,
                    padding:"4px 10px", border:"1px solid #e5e7eb",
                  }}>{tag}</span>
                ))}
              </div>
            </div>

            {/* ── Cell 6: Reviews (right) ── */}
            <div style={{
              background:WARM_WHITE, borderRadius:24, padding:28,
              boxShadow:"0 2px 16px rgba(0,0,0,.06)", border:"1px solid #e5e5e3",
              display:"flex", flexDirection:"column", gap:16,
            }}>
              <div style={{ width:44, height:44, borderRadius:12,
                background:"#fefce8", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <Star size={22} color={GOLD} />
              </div>
              <div>
                <h3 style={{ fontSize:"1.15rem", fontWeight:700, color:INK, marginBottom:6 }}>
                  Automated review requests
                </h3>
                <p style={{ fontSize:".88rem", color:"#6b7280", lineHeight:1.55 }}>
                  Certxa texts clients a review link after every session. 
                  Studios using Certxa average 4.8★ on Google.
                </p>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                {[1,2,3,4,5].map(s => (
                  <Star key={s} size={18} fill={GOLD} color={GOLD} />
                ))}
                <span style={{ marginLeft:8, fontSize:".85rem", fontWeight:700, color:INK }}>4.8</span>
                <span style={{ fontSize:".8rem", color:"#9ca3af", marginLeft:4 }}>(187 reviews)</span>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Feature strip ── */}
      <section style={{ background:WARM_WHITE, padding:"72px 24px" }}>
        <div style={{ maxWidth:1160, margin:"0 auto" }}>
          <h2 style={{ textAlign:"center", fontSize:"clamp(1.6rem,2.5vw,2.2rem)",
            fontWeight:800, color:INK, marginBottom:52, letterSpacing:"-0.02em" }}>
            Every tool your studio needs
          </h2>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:28 }}>
            {[
              { icon:<CreditCard size={22}/>, title:"Deposits & Payments", desc:"Require deposits at booking. Accept cards, cash, and digital payments at checkout." },
              { icon:<Image size={22}/>, title:"Artist Portfolios", desc:"Each artist gets their own booking link with their style, availability, and rates." },
              { icon:<Smartphone size={22}/>, title:"Mobile Booking", desc:"Clients book from anywhere. Your calendar updates in real time across all devices." },
              { icon:<ShieldCheck size={22}/>, title:"Consent Form Storage", desc:"Signed consent forms stored securely forever — fully searchable by client or date." },
              { icon:<Zap size={22}/>, title:"Flash Drops", desc:"Post same-day availability slots that fill instantly from your waitlist." },
              { icon:<BarChart3 size={22}/>, title:"Studio Analytics", desc:"Track revenue per artist, busiest service types, and rebooking rates at a glance." },
            ].map(f => (
              <div key={f.title} style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <div style={{ width:44, height:44, borderRadius:12,
                  background:"#fefce8", display:"flex", alignItems:"center", justifyContent:"center",
                  color:GOLD }}>
                  {f.icon}
                </div>
                <div>
                  <h4 style={{ fontSize:".95rem", fontWeight:700, color:INK, marginBottom:4 }}>{f.title}</h4>
                  <p style={{ fontSize:".85rem", color:"#6b7280", lineHeight:1.55, margin:0 }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{
        background:`linear-gradient(135deg, ${INK} 0%, #1c1c1e 100%)`,
        padding:"80px 24px", textAlign:"center",
        position:"relative", overflow:"hidden",
      }}>
        <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)",
          width:500, height:500, borderRadius:"50%",
          background:"rgba(201,162,39,.06)", pointerEvents:"none" }} />
        <p style={{ fontSize:".8rem", fontWeight:700, color:GOLD,
          letterSpacing:".1em", textTransform:"uppercase", marginBottom:12 }}>
          Start today — free for 14 days
        </p>
        <h2 style={{ fontSize:"clamp(1.8rem,3vw,2.6rem)", fontWeight:800, color:"#fff",
          marginBottom:16, letterSpacing:"-0.02em" }}>
          Your studio. Fully booked.
        </h2>
        <p style={{ fontSize:"1.05rem", color:"rgba(255,255,255,.55)", marginBottom:36,
          maxWidth:480, margin:"0 auto 36px" }}>
          Join thousands of tattoo artists and studio owners who run their business on Certxa.
        </p>
        <a href="/auth?mode=register" style={{
          display:"inline-flex", alignItems:"center", gap:8,
          padding:"15px 36px", borderRadius:50, fontWeight:700,
          fontSize:"1rem", textDecoration:"none", color:INK,
          background:`linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD})`,
          boxShadow:"0 4px 24px rgba(201,162,39,.35)",
          transition:"transform .15s",
        }}>
          Get Started Free <ArrowRight size={16} />
        </a>
      </section>

      <style>{`
        @media (max-width: 768px) {
          .hero-grid { grid-template-columns: 1fr !important; }
          .bento-grid { grid-template-columns: 1fr !important; }
          .bento-grid > [style*="grid-row: span 2"],
          .bento-grid > [style*="span 2"] {
            grid-column: span 1 !important;
            grid-row: span 1 !important;
          }
        }
      `}</style>
    </MarketingLayout>
  );
}
