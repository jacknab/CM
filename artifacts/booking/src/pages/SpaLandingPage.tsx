import { useEffect } from "react";
import { Link } from "react-router-dom";
import MarketingLayout from "@/components/layout/MarketingLayout";
import {
  CalendarCheck, MessageSquare, Star, Gift, ClipboardList,
  BarChart3, Users, ShieldCheck, Zap, ArrowRight, CheckCircle2,
  Clock, CreditCard, Smartphone, Sparkles,
} from "lucide-react";

const SAGE     = "#2d6a4f";
const SAGE_MID = "#40916c";
const SAGE_LIGHT = "#74c69d";
const CREAM    = "#faf7f2";
const WARM_WHITE = "#ffffff";

export default function SpaLandingPage() {
  useEffect(() => {
    document.title = "Spa Software | Certxa SalonOS";
  }, []);

  return (
    <MarketingLayout>
      {/* ── Hero ── */}
      <section style={{
        background: `linear-gradient(135deg, #1b4332 0%, ${SAGE} 50%, #081c15 100%)`,
        color: "#fff",
        padding: "80px 24px 100px",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Decorative orbs */}
        <div style={{ position:"absolute", top:-80, right:-80, width:400, height:400,
          borderRadius:"50%", background:"rgba(116,198,157,0.12)", pointerEvents:"none" }} />
        <div style={{ position:"absolute", bottom:-60, left:-60, width:300, height:300,
          borderRadius:"50%", background:"rgba(64,145,108,0.18)", pointerEvents:"none" }} />

        <div style={{ maxWidth:1160, margin:"0 auto", display:"grid",
          gridTemplateColumns:"1fr 1fr", gap:56, alignItems:"center" }}
          className="hero-grid">
          {/* Left copy */}
          <div>
            <div style={{
              display:"inline-flex", alignItems:"center", gap:8,
              background:"rgba(116,198,157,0.18)", border:"1px solid rgba(116,198,157,0.35)",
              borderRadius:50, padding:"6px 16px", marginBottom:24,
            }}>
              <Sparkles size={14} color={SAGE_LIGHT} />
              <span style={{ fontSize:".78rem", fontWeight:600, color:SAGE_LIGHT, letterSpacing:".06em" }}>
                SPA & WELLNESS SOFTWARE
              </span>
            </div>

            <h1 style={{ fontSize:"clamp(2.2rem,4vw,3.4rem)", fontWeight:800,
              lineHeight:1.12, marginBottom:20, letterSpacing:"-0.02em" }}>
              The booking platform<br />
              <span style={{ color:SAGE_LIGHT }}>built for spas.</span>
            </h1>
            <p style={{ fontSize:"1.1rem", color:"rgba(255,255,255,.7)",
              lineHeight:1.65, marginBottom:36, maxWidth:480 }}>
              Certxa handles appointments, client intake forms, gift cards, waitlists, 
              and SMS reminders — so you can focus on delivering the experience.
            </p>

            <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
              <a href="/auth?mode=register" style={{
                display:"inline-flex", alignItems:"center", gap:8,
                padding:"14px 28px", borderRadius:50, fontWeight:700,
                fontSize:".95rem", textDecoration:"none",
                background:`linear-gradient(135deg, ${SAGE_MID}, #1b4332)`,
                color:"#fff", boxShadow:"0 4px 20px rgba(64,145,108,.45)",
                transition:"transform .15s, box-shadow .15s",
              }}>
                Start Free Trial <ArrowRight size={16} />
              </a>
              <a href="/overview" style={{
                display:"inline-flex", alignItems:"center", gap:8,
                padding:"14px 28px", borderRadius:50, fontWeight:600,
                fontSize:".95rem", textDecoration:"none",
                border:"1px solid rgba(255,255,255,.25)", color:"rgba(255,255,255,.85)",
                transition:"border-color .15s, background .15s",
              }}>
                See How It Works
              </a>
            </div>

            <div style={{ display:"flex", gap:24, marginTop:32, flexWrap:"wrap" }}>
              {["No credit card required","Free 14-day trial","Cancel anytime"].map(t => (
                <div key={t} style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <CheckCircle2 size={14} color={SAGE_LIGHT} />
                  <span style={{ fontSize:".8rem", color:"rgba(255,255,255,.6)" }}>{t}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — hero image */}
          <div style={{ position:"relative", borderRadius:24, overflow:"hidden",
            boxShadow:"0 32px 80px rgba(0,0,0,.5)" }}>
            <img src="/spa-hero-1.png" alt="Spa treatment"
              style={{ width:"100%", height:420, objectFit:"cover", display:"block" }} />
            <div style={{ position:"absolute", inset:0,
              background:"linear-gradient(180deg, transparent 40%, rgba(27,67,50,.7) 100%)" }} />
            {/* Floating badge */}
            <div style={{
              position:"absolute", bottom:24, left:24, right:24,
              background:"rgba(255,255,255,.12)", backdropFilter:"blur(16px)",
              border:"1px solid rgba(255,255,255,.2)",
              borderRadius:16, padding:"14px 18px",
              display:"flex", alignItems:"center", gap:12,
            }}>
              <div style={{ width:36, height:36, borderRadius:10,
                background:SAGE_MID, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <CalendarCheck size={18} color="#fff" />
              </div>
              <div>
                <p style={{ fontSize:".75rem", color:"rgba(255,255,255,.65)", margin:0 }}>This week</p>
                <p style={{ fontSize:"1rem", fontWeight:700, color:"#fff", margin:0 }}>47 appointments booked</p>
              </div>
              <div style={{ marginLeft:"auto", textAlign:"right" }}>
                <p style={{ fontSize:".7rem", color:SAGE_LIGHT, margin:0, fontWeight:600 }}>↑ 23%</p>
                <p style={{ fontSize:".65rem", color:"rgba(255,255,255,.5)", margin:0 }}>vs last week</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2-Column Bento Grid ── */}
      <section style={{ background:CREAM, padding:"80px 24px" }}>
        <div style={{ maxWidth:1160, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:52 }}>
            <p style={{ fontSize:".8rem", fontWeight:700, color:SAGE_MID,
              letterSpacing:".1em", textTransform:"uppercase", marginBottom:10 }}>
              Everything in one place
            </p>
            <h2 style={{ fontSize:"clamp(1.8rem,3vw,2.6rem)", fontWeight:800,
              color:"#0a1a12", letterSpacing:"-0.02em", marginBottom:14 }}>
              Manage your spa with confidence
            </h2>
            <p style={{ fontSize:"1.05rem", color:"#4b5563", maxWidth:520, margin:"0 auto" }}>
              From the first booking to the follow-up review request — Certxa handles it all.
            </p>
          </div>

          {/* Bento grid */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}
            className="bento-grid">

            {/* ── Cell 1: Main booking card (tall, left col) ── */}
            <div style={{
              gridRow:"span 2",
              background:`linear-gradient(145deg, #1b4332 0%, ${SAGE} 100%)`,
              borderRadius:24, padding:32, color:"#fff",
              display:"flex", flexDirection:"column", gap:20,
              boxShadow:"0 8px 32px rgba(27,67,50,.22)",
              position:"relative", overflow:"hidden", minHeight:440,
            }}>
              <div style={{ position:"absolute", top:-40, right:-40, width:200, height:200,
                borderRadius:"50%", background:"rgba(116,198,157,.15)", pointerEvents:"none" }} />

              <div style={{ width:48, height:48, borderRadius:14,
                background:"rgba(255,255,255,.15)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <CalendarCheck size={24} color="#fff" />
              </div>

              <div>
                <h3 style={{ fontSize:"1.5rem", fontWeight:800, marginBottom:8, letterSpacing:"-0.01em" }}>
                  Online booking that converts
                </h3>
                <p style={{ fontSize:".95rem", color:"rgba(255,255,255,.7)", lineHeight:1.6 }}>
                  Clients book 24/7 from your website, Instagram bio, or Google profile. 
                  No phone calls required — just filled appointment slots.
                </p>
              </div>

              {/* Mini booking UI mock */}
              <div style={{ background:"rgba(255,255,255,.12)", borderRadius:16, padding:20,
                border:"1px solid rgba(255,255,255,.15)" }}>
                <p style={{ fontSize:".72rem", fontWeight:600, color:SAGE_LIGHT,
                  textTransform:"uppercase", letterSpacing:".08em", marginBottom:14 }}>
                  Today's Schedule
                </p>
                {[
                  { time:"10:00 AM", svc:"Swedish Massage", client:"Avery M.", color:"#74c69d" },
                  { time:"11:30 AM", svc:"Facial Treatment", client:"Jordan L.", color:"#b7e4c7" },
                  { time:"1:00 PM",  svc:"Hot Stone Therapy", client:"Riley K.", color:"#52b788" },
                  { time:"2:30 PM",  svc:"Body Wrap", client:"Casey P.", color:"#95d5b2" },
                ].map((a,i) => (
                  <div key={i} style={{
                    display:"flex", alignItems:"center", gap:12, padding:"9px 0",
                    borderTop: i===0 ? "none" : "1px solid rgba(255,255,255,.08)",
                  }}>
                    <div style={{ width:3, height:36, borderRadius:2, background:a.color, flexShrink:0 }} />
                    <div style={{ flex:1 }}>
                      <p style={{ margin:0, fontSize:".8rem", fontWeight:600, color:"#fff" }}>{a.svc}</p>
                      <p style={{ margin:0, fontSize:".72rem", color:"rgba(255,255,255,.55)" }}>{a.client}</p>
                    </div>
                    <span style={{ fontSize:".72rem", color:"rgba(255,255,255,.5)", flexShrink:0 }}>{a.time}</span>
                  </div>
                ))}
              </div>

              {/* Stat pill */}
              <div style={{ marginTop:"auto", display:"flex", gap:12 }}>
                {[["92%","Fill Rate"],["4.9★","Avg Rating"]].map(([n,l]) => (
                  <div key={l} style={{ flex:1, background:"rgba(255,255,255,.1)",
                    borderRadius:12, padding:"12px 14px", textAlign:"center" }}>
                    <p style={{ margin:0, fontSize:"1.3rem", fontWeight:800, color:"#fff" }}>{n}</p>
                    <p style={{ margin:0, fontSize:".7rem", color:"rgba(255,255,255,.6)" }}>{l}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Cell 2: SMS Reminders (top right) ── */}
            <div style={{
              background:WARM_WHITE, borderRadius:24, padding:28,
              boxShadow:"0 2px 16px rgba(0,0,0,.06)", border:"1px solid #e8f4ee",
              display:"flex", flexDirection:"column", gap:16,
            }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
                <div style={{ width:44, height:44, borderRadius:12,
                  background:"#ecfdf5", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <MessageSquare size={22} color={SAGE_MID} />
                </div>
                <span style={{ fontSize:".72rem", fontWeight:700, color:SAGE_MID,
                  background:"#d1fae5", borderRadius:50, padding:"4px 10px" }}>
                  Auto-sent
                </span>
              </div>
              <div>
                <h3 style={{ fontSize:"1.15rem", fontWeight:700, color:"#0a1a12", marginBottom:6 }}>
                  SMS reminders that slash no-shows
                </h3>
                <p style={{ fontSize:".88rem", color:"#6b7280", lineHeight:1.55 }}>
                  Automatic texts go out 24h and 2h before every appointment. 
                  Clients confirm with a single reply.
                </p>
              </div>
              <div style={{ background:"#f0fdf4", borderRadius:12, padding:14 }}>
                <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
                  <div style={{ background:"#dcfce7", borderRadius:"10px 10px 10px 2px",
                    padding:"8px 12px", fontSize:".8rem", color:"#14532d", maxWidth:"80%" }}>
                    Hi Avery! Your Swedish Massage with Certxa Spa is tomorrow at 10 AM. Reply YES to confirm or CANCEL to reschedule.
                  </div>
                </div>
                <div style={{ display:"flex", justifyContent:"flex-end", marginTop:8 }}>
                  <div style={{ background:"#bbf7d0", borderRadius:"10px 10px 2px 10px",
                    padding:"8px 12px", fontSize:".8rem", color:"#14532d" }}>
                    YES ✓
                  </div>
                </div>
              </div>
            </div>

            {/* ── Cell 3: Client Intake Forms (bottom right) ── */}
            <div style={{
              background:WARM_WHITE, borderRadius:24, padding:28,
              boxShadow:"0 2px 16px rgba(0,0,0,.06)", border:"1px solid #e8f4ee",
              display:"flex", flexDirection:"column", gap:16,
            }}>
              <div style={{ width:44, height:44, borderRadius:12,
                background:"#ecfdf5", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <ClipboardList size={22} color={SAGE_MID} />
              </div>
              <div>
                <h3 style={{ fontSize:"1.15rem", fontWeight:700, color:"#0a1a12", marginBottom:6 }}>
                  Digital intake forms
                </h3>
                <p style={{ fontSize:".88rem", color:"#6b7280", lineHeight:1.55 }}>
                  Send custom health questionnaires before first visits. 
                  Answers are saved to the client profile automatically.
                </p>
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {["Skin type","Allergies","Pressure preferences","Medical notes"].map(tag => (
                  <span key={tag} style={{
                    fontSize:".72rem", fontWeight:600,
                    background:"#f0fdf4", color:SAGE, borderRadius:50,
                    padding:"4px 10px", border:`1px solid #d1fae5`,
                  }}>{tag}</span>
                ))}
              </div>
            </div>

            {/* ── Cell 4: Gift Cards (full width) ── */}
            <div style={{
              gridColumn:"span 2",
              background:`linear-gradient(135deg, #081c15 0%, #1b4332 100%)`,
              borderRadius:24, padding:"36px 40px",
              display:"flex", alignItems:"center", gap:48, flexWrap:"wrap",
              boxShadow:"0 8px 32px rgba(8,28,21,.3)",
              position:"relative", overflow:"hidden",
            }}>
              <div style={{ position:"absolute", right:-40, top:"50%", transform:"translateY(-50%)",
                width:320, height:320, borderRadius:"50%",
                background:"rgba(116,198,157,.08)", pointerEvents:"none" }} />
              <div style={{ flex:1, minWidth:260 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                  <div style={{ width:44, height:44, borderRadius:12,
                    background:"rgba(116,198,157,.2)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <Gift size={22} color={SAGE_LIGHT} />
                  </div>
                  <h3 style={{ fontSize:"1.3rem", fontWeight:800, color:"#fff", margin:0 }}>
                    Gift cards that sell themselves
                  </h3>
                </div>
                <p style={{ fontSize:".95rem", color:"rgba(255,255,255,.65)", lineHeight:1.6, marginBottom:0 }}>
                  Sell digital gift cards directly from your booking page. 
                  Perfect for holidays, birthdays, and corporate wellness programs.
                </p>
              </div>
              <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
                {[["$12,400","Gift cards sold this month"],["3.2×","Avg redemption value"],["89%","Redemption rate"]].map(([n,l]) => (
                  <div key={l} style={{ textAlign:"center" }}>
                    <p style={{ margin:0, fontSize:"1.6rem", fontWeight:800, color:SAGE_LIGHT }}>{n}</p>
                    <p style={{ margin:0, fontSize:".72rem", color:"rgba(255,255,255,.5)", marginTop:3 }}>{l}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Cell 5: Reviews (left) ── */}
            <div style={{
              background:WARM_WHITE, borderRadius:24, padding:28,
              boxShadow:"0 2px 16px rgba(0,0,0,.06)", border:"1px solid #e8f4ee",
              display:"flex", flexDirection:"column", gap:16,
            }}>
              <div style={{ width:44, height:44, borderRadius:12,
                background:"#ecfdf5", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <Star size={22} color={SAGE_MID} />
              </div>
              <div>
                <h3 style={{ fontSize:"1.15rem", fontWeight:700, color:"#0a1a12", marginBottom:6 }}>
                  Automated review requests
                </h3>
                <p style={{ fontSize:".88rem", color:"#6b7280", lineHeight:1.55 }}>
                  After checkout, Certxa texts clients a review link. 
                  Most spas see their Google rating climb within 30 days.
                </p>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                {[1,2,3,4,5].map(s => (
                  <Star key={s} size={18} fill={SAGE_MID} color={SAGE_MID} />
                ))}
                <span style={{ marginLeft:8, fontSize:".85rem", fontWeight:700, color:"#0a1a12" }}>4.9</span>
                <span style={{ fontSize:".8rem", color:"#9ca3af", marginLeft:4 }}>(312 reviews)</span>
              </div>
            </div>

            {/* ── Cell 6: Analytics (right) ── */}
            <div style={{
              background:WARM_WHITE, borderRadius:24, padding:28,
              boxShadow:"0 2px 16px rgba(0,0,0,.06)", border:"1px solid #e8f4ee",
              display:"flex", flexDirection:"column", gap:16,
            }}>
              <div style={{ width:44, height:44, borderRadius:12,
                background:"#ecfdf5", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <BarChart3 size={22} color={SAGE_MID} />
              </div>
              <div>
                <h3 style={{ fontSize:"1.15rem", fontWeight:700, color:"#0a1a12", marginBottom:6 }}>
                  Revenue & performance analytics
                </h3>
                <p style={{ fontSize:".88rem", color:"#6b7280", lineHeight:1.55 }}>
                  See your busiest services, top-performing therapists, and revenue trends at a glance.
                </p>
              </div>
              {/* Mini bar chart */}
              <div style={{ display:"flex", alignItems:"flex-end", gap:6, height:48 }}>
                {[65,80,55,90,72,88,95].map((h,i) => (
                  <div key={i} style={{ flex:1, height:`${h}%`, borderRadius:"4px 4px 0 0",
                    background: i===6 ? SAGE_MID : "#d1fae5",
                    transition:"height .3s" }} />
                ))}
              </div>
              <p style={{ margin:0, fontSize:".72rem", color:"#9ca3af" }}>Revenue — last 7 days</p>
            </div>

          </div>
        </div>
      </section>

      {/* ── Feature strip ── */}
      <section style={{ background:WARM_WHITE, padding:"72px 24px" }}>
        <div style={{ maxWidth:1160, margin:"0 auto" }}>
          <h2 style={{ textAlign:"center", fontSize:"clamp(1.6rem,2.5vw,2.2rem)",
            fontWeight:800, color:"#0a1a12", marginBottom:52, letterSpacing:"-0.02em" }}>
            Everything your spa needs, nothing you don't
          </h2>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:28 }}>
            {[
              { icon:<Users size={22}/>, title:"Client Profiles", desc:"Full visit history, preferences, notes, and intake forms — all in one place." },
              { icon:<CreditCard size={22}/>, title:"POS & Payments", desc:"Accept cards, cash, and gift cards at checkout with zero extra hardware needed." },
              { icon:<Clock size={22}/>, title:"Waitlist Management", desc:"Auto-fill cancellations from a live waitlist so chairs never sit empty." },
              { icon:<ShieldCheck size={22}/>, title:"Secure & HIPAA-Ready", desc:"Client health data is encrypted and stored with enterprise-grade security." },
              { icon:<Smartphone size={22}/>, title:"Mobile-First Booking", desc:"Clients book from any device. Your calendar syncs in real time." },
              { icon:<Zap size={22}/>, title:"Loyalty Rewards", desc:"Built-in points program keeps clients coming back for their next treatment." },
            ].map(f => (
              <div key={f.title} style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <div style={{ width:44, height:44, borderRadius:12,
                  background:"#ecfdf5", display:"flex", alignItems:"center", justifyContent:"center",
                  color:SAGE_MID }}>
                  {f.icon}
                </div>
                <div>
                  <h4 style={{ fontSize:".95rem", fontWeight:700, color:"#0a1a12", marginBottom:4 }}>{f.title}</h4>
                  <p style={{ fontSize:".85rem", color:"#6b7280", lineHeight:1.55, margin:0 }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{
        background:`linear-gradient(135deg, #1b4332 0%, ${SAGE} 100%)`,
        padding:"80px 24px", textAlign:"center",
      }}>
        <p style={{ fontSize:".8rem", fontWeight:700, color:SAGE_LIGHT,
          letterSpacing:".1em", textTransform:"uppercase", marginBottom:12 }}>
          Start today — free for 14 days
        </p>
        <h2 style={{ fontSize:"clamp(1.8rem,3vw,2.6rem)", fontWeight:800, color:"#fff",
          marginBottom:16, letterSpacing:"-0.02em" }}>
          Your spa. Fully booked.
        </h2>
        <p style={{ fontSize:"1.05rem", color:"rgba(255,255,255,.7)", marginBottom:36, maxWidth:480, margin:"0 auto 36px" }}>
          Join thousands of wellness professionals who run their business with Certxa.
        </p>
        <a href="/auth?mode=register" style={{
          display:"inline-flex", alignItems:"center", gap:8,
          padding:"15px 36px", borderRadius:50, fontWeight:700,
          fontSize:"1rem", textDecoration:"none", color:"#1b4332",
          background:"#fff", boxShadow:"0 4px 24px rgba(0,0,0,.25)",
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
