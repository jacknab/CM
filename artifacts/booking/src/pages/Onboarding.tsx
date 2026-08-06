import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Check, Search, MapPin, Star, Phone, Globe, Clock, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { OnboardingGoogleStep } from "@/components/OnboardingGoogleStep";

// ── Constants ─────────────────────────────────────────────────────────────────

const PLUM     = "#3B0764";
const PLUM_MID = "#5B21B6";
const GOLD     = "#F59E0B";

const STATE_TZ: Record<string, string> = {
  CT:"America/New_York",DC:"America/New_York",DE:"America/New_York",FL:"America/New_York",GA:"America/New_York",
  IN:"America/New_York",KY:"America/New_York",MA:"America/New_York",MD:"America/New_York",ME:"America/New_York",
  MI:"America/New_York",NC:"America/New_York",NH:"America/New_York",NJ:"America/New_York",NY:"America/New_York",
  OH:"America/New_York",PA:"America/New_York",RI:"America/New_York",SC:"America/New_York",TN:"America/New_York",
  VA:"America/New_York",VT:"America/New_York",WV:"America/New_York",
  AL:"America/Chicago",AR:"America/Chicago",IA:"America/Chicago",IL:"America/Chicago",KS:"America/Chicago",
  LA:"America/Chicago",MN:"America/Chicago",MO:"America/Chicago",MS:"America/Chicago",ND:"America/Chicago",
  NE:"America/Chicago",OK:"America/Chicago",SD:"America/Chicago",TX:"America/Chicago",WI:"America/Chicago",
  CO:"America/Denver",ID:"America/Denver",MT:"America/Denver",NM:"America/Denver",UT:"America/Denver",WY:"America/Denver",
  AZ:"America/Phoenix",CA:"America/Los_Angeles",NV:"America/Los_Angeles",OR:"America/Los_Angeles",WA:"America/Los_Angeles",
  AK:"America/Anchorage",HI:"Pacific/Honolulu",
};

const US_STATES = [
  {v:"AL",l:"Alabama"},{v:"AK",l:"Alaska"},{v:"AZ",l:"Arizona"},{v:"AR",l:"Arkansas"},{v:"CA",l:"California"},
  {v:"CO",l:"Colorado"},{v:"CT",l:"Connecticut"},{v:"DE",l:"Delaware"},{v:"FL",l:"Florida"},{v:"GA",l:"Georgia"},
  {v:"HI",l:"Hawaii"},{v:"ID",l:"Idaho"},{v:"IL",l:"Illinois"},{v:"IN",l:"Indiana"},{v:"IA",l:"Iowa"},
  {v:"KS",l:"Kansas"},{v:"KY",l:"Kentucky"},{v:"LA",l:"Louisiana"},{v:"ME",l:"Maine"},{v:"MD",l:"Maryland"},
  {v:"MA",l:"Massachusetts"},{v:"MI",l:"Michigan"},{v:"MN",l:"Minnesota"},{v:"MS",l:"Mississippi"},{v:"MO",l:"Missouri"},
  {v:"MT",l:"Montana"},{v:"NE",l:"Nebraska"},{v:"NV",l:"Nevada"},{v:"NH",l:"New Hampshire"},{v:"NJ",l:"New Jersey"},
  {v:"NM",l:"New Mexico"},{v:"NY",l:"New York"},{v:"NC",l:"North Carolina"},{v:"ND",l:"North Dakota"},{v:"OH",l:"Ohio"},
  {v:"OK",l:"Oklahoma"},{v:"OR",l:"Oregon"},{v:"PA",l:"Pennsylvania"},{v:"RI",l:"Rhode Island"},{v:"SC",l:"South Carolina"},
  {v:"SD",l:"South Dakota"},{v:"TN",l:"Tennessee"},{v:"TX",l:"Texas"},{v:"UT",l:"Utah"},{v:"VT",l:"Vermont"},
  {v:"VA",l:"Virginia"},{v:"WA",l:"Washington"},{v:"WV",l:"West Virginia"},{v:"WI",l:"Wisconsin"},{v:"WY",l:"Wyoming"},
];

const TIMEZONES = [
  { value: "America/New_York",    label: "Eastern (ET)" },
  { value: "America/Chicago",     label: "Central (CT)" },
  { value: "America/Denver",      label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage",   label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu",    label: "Hawaii (HT)" },
  { value: "America/Phoenix",     label: "Arizona (MST)" },
];

const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const DEFAULT_SALON_NAME = "Fabulous Nails";

const DEFAULT_HOURS: DayHours[] = [
  { isOpen: false, openTime: "09:00", closeTime: "18:00" },
  { isOpen: true,  openTime: "09:00", closeTime: "18:00" },
  { isOpen: true,  openTime: "09:00", closeTime: "18:00" },
  { isOpen: true,  openTime: "09:00", closeTime: "18:00" },
  { isOpen: true,  openTime: "09:00", closeTime: "18:00" },
  { isOpen: true,  openTime: "09:00", closeTime: "18:00" },
  { isOpen: true,  openTime: "09:00", closeTime: "17:00" },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type DayHours = { isOpen: boolean; openTime: string; closeTime: string };
interface PlaceResult { placeId: string; name: string; address: string; rating?: number; reviewCount?: number; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (TIMEZONES.some(t => t.value === tz)) return tz;
    if (tz.includes("New_York") || tz.includes("Detroit")) return "America/New_York";
    if (tz.includes("Chicago")) return "America/Chicago";
    if (tz.includes("Denver") || tz.includes("Boise")) return "America/Denver";
    if (tz.includes("Los_Angeles")) return "America/Los_Angeles";
    if (tz.includes("Anchorage")) return "America/Anchorage";
    if (tz.includes("Phoenix")) return "America/Phoenix";
    if (tz.includes("Honolulu")) return "Pacific/Honolulu";
  } catch { /* ignore */ }
  return "America/New_York";
}

function formatPhoneDisplay(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0,3)}) ${d.slice(3)}`;
  return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
}

function genTimeOptions() {
  const opts: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const value = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      opts.push({ value, label: `${h12}:${String(m).padStart(2,"0")} ${h >= 12 ? "PM" : "AM"}` });
    }
  }
  return opts;
}
const TIME_OPTIONS = genTimeOptions();

function parseGooglePeriods(periods: any[] | null | undefined): DayHours[] | null {
  if (!Array.isArray(periods) || periods.length === 0) return null;
  const toHHMM = (t?: string) => t && /^\d{4}$/.test(t) ? `${t.slice(0,2)}:${t.slice(2)}` : null;
  const result: DayHours[] = DAY_NAMES.map(() => ({ isOpen: false, openTime: "09:00", closeTime: "18:00" }));
  let matched = false;
  for (const p of periods) {
    const day = p?.open?.day;
    if (day == null || day < 0 || day > 6) continue;
    const openTime  = toHHMM(p?.open?.time)  ?? "09:00";
    const closeTime = toHHMM(p?.close?.time) ?? "23:59"; // open 24h / no close given
    result[day] = { isOpen: true, openTime, closeTime };
    matched = true;
  }
  return matched ? result : null;
}

function fmt12(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${ampm}`;
}

// ── Shared atoms ──────────────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ display:"block", fontSize:".68rem", fontWeight:700, color:"#6b7280",
      textTransform:"uppercase", letterSpacing:".08em", marginBottom:5 }}>
      {children}{required && <span style={{ color:"#f87171", marginLeft:3 }}>*</span>}
    </label>
  );
}

function TextInput({ value, onChange, placeholder, type="text", inputMode, maxLength, autoFocus, prefix }:{
  value:string; onChange:(v:string)=>void; placeholder?:string; type?:string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?:number; autoFocus?:boolean; prefix?:string;
}) {
  const inputStyle: React.CSSProperties = {
    height:44, width:"100%", padding:"0 14px", borderRadius:10,
    border:"1.5px solid #e5e7eb", background:"#fafafa",
    fontSize:".88rem", color:"#111827", outline:"none",
    transition:"border-color .15s", boxSizing:"border-box",
  };
  if (prefix) return (
    <div style={{ display:"flex", alignItems:"center", height:44, borderRadius:10, border:"1.5px solid #e5e7eb",
      background:"#fafafa", overflow:"hidden", transition:"border-color .15s" }}>
      <span style={{ padding:"0 12px", fontSize:".85rem", color:"#9ca3af", borderRight:"1px solid #e5e7eb",
        height:"100%", display:"flex", alignItems:"center", background:"#f9fafb", flexShrink:0 }}>{prefix}</span>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        inputMode={inputMode} maxLength={maxLength} autoFocus={autoFocus}
        style={{ flex:1, border:"none", background:"transparent", padding:"0 12px", fontSize:".88rem",
          color:"#111827", outline:"none", height:"100%" }} />
    </div>
  );
  return (
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      inputMode={inputMode} maxLength={maxLength} autoFocus={autoFocus} style={inputStyle} />
  );
}

// ── Progress indicator ────────────────────────────────────────────────────────

const STEP_TITLES = ["Find your salon","Review details","Booking link","Connect Google","You're ready"];

// ── RIGHT PANEL PREVIEWS ──────────────────────────────────────────────────────

/** Mock Google Business Knowledge Panel */
function GoogleBusinessCard({ name, address, phone, website, visible }:{
  name:string; address?:string; phone?:string; website?:string; visible:boolean;
}) {
  const displayName = name || "Your Salon Name";
  const isEmpty = !name;
  return (
    <div style={{
      width:"100%", maxWidth:360, borderRadius:16,
      boxShadow:"0 8px 40px rgba(0,0,0,0.15)",
      overflow:"hidden", background:"#fff",
      opacity: isEmpty ? 0.6 : 1,
      transform: "translateY(0) scale(1)",
      transition:"all .4s cubic-bezier(.22,1,.36,1)",
    }}>
      {/* Map placeholder */}
      <div style={{
        height:140, background:"linear-gradient(135deg,#e0f2fe 0%,#bae6fd 50%,#7dd3fc 100%)",
        position:"relative", overflow:"hidden",
      }}>
        {/* Grid lines for map feel */}
        {Array.from({length:6},(_,i)=>(
          <div key={i} style={{ position:"absolute", left:0, right:0, top:`${i*20}%`,
            height:1, background:"rgba(255,255,255,0.3)" }} />
        ))}
        {Array.from({length:8},(_,i)=>(
          <div key={i} style={{ position:"absolute", top:0, bottom:0, left:`${i*14}%`,
            width:1, background:"rgba(255,255,255,0.3)" }} />
        ))}
        {/* Road lines */}
        <div style={{ position:"absolute", top:"45%", left:"10%", right:"10%",
          height:6, background:"rgba(255,255,255,0.6)", borderRadius:3 }} />
        <div style={{ position:"absolute", left:"38%", top:"5%", bottom:"5%",
          width:6, background:"rgba(255,255,255,0.5)", borderRadius:3 }} />
        {/* Pin */}
        <div style={{ position:"absolute", top:"50%", left:"50%",
          transform:"translate(-50%,-100%)", textAlign:"center" }}>
          <div style={{ width:32, height:32, borderRadius:"50% 50% 50% 0",
            background:"#ea4335", transform:"rotate(-45deg)", boxShadow:"0 2px 8px rgba(0,0,0,0.25)" }} />
        </div>
        {/* Google Maps label */}
        <div style={{ position:"absolute", bottom:8, right:10, fontSize:".6rem",
          color:"rgba(0,0,0,0.4)", fontWeight:600 }}>Google Maps</div>
      </div>

      {/* Info panel */}
      <div style={{ padding:"16px 18px 14px" }}>
        {/* Google G + name */}
        <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:10 }}>
          <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink:0, marginTop:2 }}>
            <path fill="#4285F4" d="M47.5 24.6c0-1.6-.1-3.1-.4-4.6H24v8.7h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.3 7.3-10.5 7.3-17.3z"/>
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.9-6c-2.1 1.4-4.9 2.3-8 2.3-6.1 0-11.3-4.1-13.2-9.7H2.6v6.2C6.6 42.7 14.7 48 24 48z"/>
            <path fill="#FBBC05" d="M10.8 28.8c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4v-6.2H2.6C.9 17 0 20.4 0 24s.9 7 2.6 10.2l8.2-5.4z"/>
            <path fill="#EA4335" d="M24 9.5c3.4 0 6.5 1.2 8.9 3.5l6.6-6.6C35.9 2.4 30.4 0 24 0 14.7 0 6.6 5.3 2.6 13.8l8.2 5.4C12.7 13.6 17.9 9.5 24 9.5z"/>
          </svg>
          <div>
            <div style={{ fontSize:"1.05rem", fontWeight:700, color:"#111827", lineHeight:1.2 }}>
              {displayName}
            </div>
            <div style={{ fontSize:".72rem", color:"#6b7280", marginTop:2 }}>Nail salon</div>
          </div>
        </div>

        {/* Stars */}
        <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:10 }}>
          <span style={{ fontWeight:700, fontSize:".85rem", color:"#111827" }}>4.5</span>
          <div style={{ display:"flex", gap:1 }}>
            {Array.from({length:5},(_,i)=>(
              <Star key={i} style={{ width:13, height:13 }}
                fill={i < 4 ? "#fbbf24" : (i < 5 ? "#fbbf24" : "#e5e7eb")}
                color={i < 5 ? "#fbbf24" : "#e5e7eb"} />
            ))}
          </div>
          <span style={{ fontSize:".72rem", color:"#6b7280" }}>(182)</span>
          <span style={{ fontSize:".72rem", color:"#6b7280", margin:"0 4px" }}>·</span>
          <span style={{ fontSize:".72rem", color:"#6b7280" }}>Nail salon</span>
        </div>

        {/* Open status */}
        <div style={{ fontSize:".75rem", color:"#16a34a", fontWeight:600, marginBottom:10 }}>
          ● Open today · Closes 7 PM
        </div>

        {/* Address / Phone / Website */}
        <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:14, borderTop:"1px solid #f3f4f6", paddingTop:10 }}>
          {[
            { icon: <MapPin style={{ width:13, height:13 }} />, text: address || "123 Main St, Your City, State" },
            { icon: <Phone style={{ width:13, height:13 }} />, text: phone || "(555) 123-4567" },
            { icon: <Globe style={{ width:13, height:13 }} />, text: website || "certxa.com/book/yoursalon" },
          ].map(({icon, text}, i) => (
            <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
              <span style={{ color:"#6b7280", flexShrink:0, marginTop:1 }}>{icon}</span>
              <span style={{ fontSize:".72rem", color:"#374151", wordBreak:"break-all" }}>{text}</span>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:4, marginBottom:10 }}>
          {["Directions","Call","Website","Share"].map(a=>(
            <div key={a} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3,
              padding:"6px 4px", borderRadius:8, background:"#f3f4f6", cursor:"pointer" }}>
              <div style={{ width:18, height:18, borderRadius:"50%", background:"#e5e7eb" }} />
              <span style={{ fontSize:".58rem", color:"#374151", fontWeight:600 }}>{a}</span>
            </div>
          ))}
        </div>

        {/* Book Now */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"10px 14px", borderRadius:10, background:`linear-gradient(135deg,${PLUM},${PLUM_MID})`,
          cursor:"pointer" }}>
          <div>
            <div style={{ fontSize:".72rem", color:"rgba(255,255,255,0.7)" }}>Powered by Certxa</div>
            <div style={{ fontSize:".82rem", fontWeight:700, color:"#fff" }}>Book an appointment</div>
          </div>
          <ChevronRight style={{ width:16, height:16, color:"rgba(255,255,255,0.8)" }} />
        </div>
      </div>
    </div>
  );
}

/** Hours week visualization */
function HoursPreview({ hours, salonName }: { hours: DayHours[]; salonName: string }) {
  const openDays = hours.filter(h => h.isOpen);
  return (
    <div style={{ width:"100%", maxWidth:380 }}>
      {/* Business card header */}
      <div style={{ borderRadius:14, background:"rgba(255,255,255,0.12)", backdropFilter:"blur(8px)",
        border:"1px solid rgba(255,255,255,0.2)", padding:"16px 20px", marginBottom:16 }}>
        <div style={{ fontSize:"1.1rem", fontWeight:700, color:"#fff", marginBottom:4 }}>
          {salonName || "Your Salon"}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ fontSize:".68rem", color:"rgba(255,255,255,0.6)" }}>Nail salon</span>
          <span style={{ color:"rgba(255,255,255,0.3)" }}>·</span>
          <span style={{ fontSize:".68rem", color:"#86efac" }}>
            {openDays.length > 0 ? `Open ${openDays.length} day${openDays.length!==1?"s":""} a week` : "Set your hours →"}
          </span>
        </div>
      </div>

      {/* Weekly schedule */}
      <div style={{ borderRadius:14, background:"rgba(255,255,255,0.10)", backdropFilter:"blur(8px)",
        border:"1px solid rgba(255,255,255,0.15)", overflow:"hidden" }}>
        <div style={{ padding:"12px 16px 8px", borderBottom:"1px solid rgba(255,255,255,0.1)" }}>
          <span style={{ fontSize:".68rem", fontWeight:700, color:"rgba(255,255,255,0.5)",
            textTransform:"uppercase", letterSpacing:".08em" }}>Weekly hours</span>
        </div>
        {DAY_NAMES.map((name, i) => {
          const day = hours[i];
          return (
            <div key={i} style={{
              display:"flex", alignItems:"center", padding:"8px 16px", gap:12,
              borderBottom: i < 6 ? "1px solid rgba(255,255,255,0.06)" : "none",
              opacity: day.isOpen ? 1 : 0.4,
              transition:"opacity .2s",
            }}>
              <span style={{ fontSize:".72rem", fontWeight:600, color:"rgba(255,255,255,0.7)", width:28 }}>{name}</span>
              {day.isOpen ? (
                <>
                  {/* Visual time bar */}
                  <div style={{ flex:1, height:6, borderRadius:3, background:"rgba(255,255,255,0.1)", position:"relative" }}>
                    {(() => {
                      const openH = parseInt(day.openTime.split(":")[0]);
                      const closeH = parseInt(day.closeTime.split(":")[0]);
                      const left = ((openH - 7) / 15) * 100;
                      const width = ((closeH - openH) / 15) * 100;
                      return (
                        <div style={{
                          position:"absolute", top:0, left:`${Math.max(0,left)}%`,
                          width:`${Math.min(100,width)}%`, height:"100%",
                          borderRadius:3, background:`linear-gradient(90deg,${GOLD},#fbbf24)`,
                          transition:"all .3s",
                        }} />
                      );
                    })()}
                  </div>
                  <span style={{ fontSize:".65rem", color:"rgba(255,255,255,0.6)", whiteSpace:"nowrap", width:90, textAlign:"right" }}>
                    {fmt12(day.openTime)} – {fmt12(day.closeTime)}
                  </span>
                </>
              ) : (
                <span style={{ fontSize:".65rem", color:"rgba(255,255,255,0.35)", fontStyle:"italic", flex:1 }}>Closed</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Step 2 — animated booking confirmation illustration */
function BookingConfirmationPreview({ salonName, phone, customerName }: {
  salonName: string; phone?: string; customerName: string;
}) {
  const displaySalon = salonName || "Fabulous Nails";
  const displayName  = customerName || "";
  const displayPhone = phone || "";

  // Animate value changes with a flash
  const [nameKey,  setNameKey]  = useState(0);
  const [phoneKey, setPhoneKey] = useState(0);
  const prevName  = useRef(displayName);
  const prevPhone = useRef(displayPhone);
  useEffect(() => {
    if (displayName !== prevName.current) { setNameKey(k => k + 1); prevName.current = displayName; }
  }, [displayName]);
  useEffect(() => {
    if (displayPhone !== prevPhone.current) { setPhoneKey(k => k + 1); prevPhone.current = displayPhone; }
  }, [displayPhone]);

  const pills = [
    { label: "✓ No account required",       delay: 0.1 },
    { label: "✓ No login required",          delay: 0.4 },
    { label: "✓ Book in under 60 seconds",   delay: 0.7 },
    { label: "✓ Mobile friendly",            delay: 1.0 },
    { label: "✓ Instant confirmation",       delay: 1.3 },
  ];

  return (
    <div style={{ width:"100%", maxWidth:360, display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>

      {/* Top pill row */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"center" }}>
        {pills.slice(0, 2).map((p, i) => (
          <div key={i} style={{
            background:"#fff",
            border:"1px solid #e9e4f2", borderRadius:20,
            boxShadow:"0 2px 10px rgba(59,7,100,0.06)",
            padding:"5px 12px", fontSize:".65rem", fontWeight:600, color:PLUM,
            whiteSpace:"nowrap",
            animation:`pillIn .5s cubic-bezier(.22,1,.36,1) ${p.delay}s both, pillFloat 3s ease-in-out ${p.delay + 0.5}s infinite`,
          }}>{p.label}</div>
        ))}
      </div>

      {/* Browser mockup */}
      <div style={{
        width:"100%", borderRadius:14, overflow:"hidden",
        boxShadow:"0 16px 48px rgba(59,7,100,0.12)",
        border:"1px solid #eceaf1",
      }}>
        {/* Chrome bar */}
        <div style={{
          background:"#1f1f1f", padding:"8px 14px",
          display:"flex", alignItems:"center", gap:8,
        }}>
          <div style={{ display:"flex", gap:5 }}>
            {["#ff5f57","#ffbd2e","#28c840"].map((c,i) => (
              <div key={i} style={{ width:9, height:9, borderRadius:"50%", background:c, opacity:.8 }} />
            ))}
          </div>
          <div style={{
            flex:1, background:"rgba(255,255,255,0.08)", borderRadius:6,
            padding:"4px 10px", display:"flex", alignItems:"center", gap:5,
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ opacity:.5 }}>
              <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" stroke="#fff" strokeWidth="1.5"/>
              <path d="M12 6v6l4 2" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize:".62rem", color:"rgba(255,255,255,0.45)", letterSpacing:".01em" }}>
              certxa.com/book/{(displaySalon.toLowerCase().replace(/[^a-z0-9]/g,"-").slice(0,18)) || "your-salon"}
            </span>
          </div>
        </div>

        {/* Page content */}
        <div style={{ position:"relative", background:"#fff", overflow:"hidden" }}>
          {/* Page inner */}
          <div style={{ padding:"20px 18px 0" }}>
            {/* Certxa logo bar */}
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:16, paddingBottom:14,
              borderBottom:"1px solid #f3f4f6" }}>
              <span style={{
                fontFamily:"'Cormorant Garamond',serif", fontWeight:700,
                fontSize:"1rem", color:PLUM, letterSpacing:"-.02em",
              }}>Certxa<span style={{ color:GOLD }}>.</span></span>
            </div>

            {/* Confirmation header */}
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
              <div style={{
                width:24, height:24, borderRadius:"50%",
                background:"linear-gradient(135deg,#10b981,#059669)",
                display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize:".82rem", fontWeight:800, color:"#111827", lineHeight:1.2 }}>Booking Confirmed!</div>
                <div style={{ fontSize:".62rem", color:"#6b7280", marginTop:1 }}>Your appointment is all set</div>
              </div>
            </div>

            {/* Booking summary card */}
            <div style={{
              borderRadius:10, background:"#fafafa", border:"1px solid #f0f0f0",
              padding:"12px 14px", marginBottom:14,
            }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:8 }}>
                <div>
                  <div style={{ fontSize:".78rem", fontWeight:700, color:"#111827" }}>Gel Manicure</div>
                  <div style={{ fontSize:".65rem", color:PLUM_MID, fontWeight:600, marginTop:1 }}>45 min</div>
                </div>
                <div style={{ fontSize:".82rem", fontWeight:800, color:"#111827" }}>$45</div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="4" width="18" height="18" rx="2" stroke="#9ca3af" strokeWidth="1.5"/>
                    <path d="M16 2v4M8 2v4M3 10h18" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <span style={{ fontSize:".65rem", color:"#6b7280" }}>Friday, Aug 1 at 2:00 PM</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="#9ca3af" strokeWidth="1.5"/>
                    <circle cx="12" cy="9" r="2.5" stroke="#9ca3af" strokeWidth="1.5"/>
                  </svg>
                  <span style={{ fontSize:".65rem", color:"#6b7280", transition:"color .3s" }}>
                    {displaySalon}
                  </span>
                </div>
              </div>
            </div>

            {/* Customer fields */}
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {/* Your Name */}
              <div>
                <div style={{ fontSize:".6rem", fontWeight:700, color:"#9ca3af",
                  textTransform:"uppercase", letterSpacing:".08em", marginBottom:4 }}>Your Name</div>
                <div style={{
                  height:38, borderRadius:8, border:"1.5px solid #e5e7eb",
                  background:"#fafafa", padding:"0 12px",
                  display:"flex", alignItems:"center",
                }}>
                  <span
                    key={nameKey}
                    style={{
                      fontSize:".8rem", color: displayName ? "#111827" : "#d1d5db",
                      fontWeight: displayName ? 500 : 400,
                      animation: nameKey > 0 ? "valueReveal .25s ease both" : "none",
                      flex:1,
                    }}
                  >
                    {displayName || "Jane Doe"}
                  </span>
                  {displayName && (
                    <span style={{
                      display:"inline-block", width:1.5, height:14,
                      background:"#111827", marginLeft:1,
                      animation:"cursorBlink 1s ease infinite",
                    }} />
                  )}
                </div>
              </div>

              {/* Mobile Number */}
              <div>
                <div style={{ fontSize:".6rem", fontWeight:700, color:"#9ca3af",
                  textTransform:"uppercase", letterSpacing:".08em", marginBottom:4 }}>Mobile Number</div>
                <div style={{
                  height:38, borderRadius:8, border:`1.5px solid ${displayPhone ? PLUM_MID : "#e5e7eb"}`,
                  background:"#fafafa", padding:"0 12px",
                  display:"flex", alignItems:"center",
                  transition:"border-color .3s",
                }}>
                  <span
                    key={phoneKey}
                    style={{
                      fontSize:".8rem", color: displayPhone ? "#111827" : "#d1d5db",
                      fontWeight: displayPhone ? 500 : 400,
                      animation: phoneKey > 0 ? "valueReveal .25s ease both" : "none",
                      flex:1,
                    }}
                  >
                    {displayPhone || "(555) 000-0000"}
                  </span>
                  {displayPhone && (
                    <span style={{
                      display:"inline-block", width:1.5, height:14,
                      background:PLUM_MID, marginLeft:1,
                      animation:"cursorBlink 1s ease infinite",
                      animationDelay:".15s",
                    }} />
                  )}
                </div>
              </div>
            </div>

            {/* Spacer so gradient fade has content to fade */}
            <div style={{ height:48 }} />
          </div>

          {/* Bottom fade-out mask — hides CTA */}
          <div style={{
            position:"absolute", bottom:0, left:0, right:0, height:80,
            background:"linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 100%)",
            pointerEvents:"none",
          }} />
        </div>
      </div>

      {/* Bottom pill rows */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"center" }}>
        {pills.slice(2).map((p, i) => (
          <div key={i} style={{
            background:"#fff",
            border:"1px solid #e9e4f2", borderRadius:20,
            boxShadow:"0 2px 10px rgba(59,7,100,0.06)",
            padding:"5px 12px", fontSize:".65rem", fontWeight:600, color:PLUM,
            whiteSpace:"nowrap",
            animation:`pillIn .5s cubic-bezier(.22,1,.36,1) ${p.delay}s both, pillFloat 3.5s ease-in-out ${p.delay + 0.5}s infinite`,
          }}>{p.label}</div>
        ))}
      </div>
    </div>
  );
}

/** Autumn AI Receptionist ad — shown on the "Review your details" step */
function AutumnAdPreview({ salonName }: { salonName: string }) {
  const displaySalon = salonName || "Fabulous Nails";
  const stats: [string, string][] = [
    ["<2s", "Answer time"],
    ["100%", "Answer rate"],
    ["24/7", "Always on"],
  ];

  return (
    <div style={{ width:"100%", maxWidth:360, display:"flex", flexDirection:"column", alignItems:"center", gap:14 }}>

      {/* Floating intro badge */}
      <div style={{
        background:"#fff", border:"1px solid #e9e4f2", borderRadius:20,
        boxShadow:"0 2px 10px rgba(59,7,100,0.06)",
        padding:"5px 14px", fontSize:".65rem", fontWeight:700, color:PLUM,
        letterSpacing:".04em", textTransform:"uppercase",
        animation:"pillIn .5s cubic-bezier(.22,1,.36,1) .1s both, pillFloat 3.5s ease-in-out .6s infinite",
      }}>
        ✨ Introducing Autumn
      </div>

      {/* Card */}
      <div style={{
        width:"100%", borderRadius:16, overflow:"hidden", background:"#fff",
        boxShadow:"0 16px 48px rgba(59,7,100,0.14)", border:"1px solid #eceaf1",
        animation:"previewIn .5s cubic-bezier(.22,1,.36,1) .2s both",
      }}>
        {/* Header */}
        <div style={{
          background:`linear-gradient(135deg,${PLUM} 0%,${PLUM_MID} 100%)`,
          padding:"18px 18px 16px", position:"relative", overflow:"hidden",
        }}>
          <div style={{ position:"absolute", width:160, height:160, borderRadius:"50%",
            background:"radial-gradient(circle,rgba(245,158,11,0.18) 0%,transparent 70%)",
            top:-60, right:-40, pointerEvents:"none" }} />
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", position:"relative" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{
                width:38, height:38, borderRadius:"50%",
                background:`linear-gradient(135deg,${GOLD},#d97706)`,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontFamily:"'Cormorant Garamond',serif", fontWeight:700, fontSize:"1.1rem", color:"#fff",
                flexShrink:0, boxShadow:"0 2px 8px rgba(0,0,0,0.15)",
              }}>A</div>
              <div>
                <div style={{ fontWeight:800, fontSize:".92rem", color:"#fff", lineHeight:1.2 }}>Autumn</div>
                <div style={{ fontSize:".68rem", color:"rgba(255,255,255,0.65)", fontWeight:500 }}>AI Receptionist</div>
              </div>
            </div>
            <div style={{
              display:"flex", alignItems:"center", gap:5,
              background:"rgba(255,255,255,0.12)", borderRadius:20, padding:"4px 10px",
            }}>
              <span style={{
                width:6, height:6, borderRadius:"50%", background:"#4ade80",
                animation:"acceptPulseSoft 1.4s ease-in-out infinite",
              }} />
              <span style={{ fontSize:".62rem", color:"#fff", fontWeight:600 }}>Online now</span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding:"18px 18px 16px" }}>
          <div style={{ fontSize:".98rem", fontWeight:800, color:"#111827", lineHeight:1.3, marginBottom:6 }}>
            Never miss a booking call again.
          </div>
          <div style={{ fontSize:".78rem", color:"#6b7280", lineHeight:1.55, marginBottom:16 }}>
            Autumn answers every call to {displaySalon} in seconds, books straight into your calendar, and handles rescheduling — 24/7, without you lifting a finger.
          </div>

          {/* Stat tiles */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14 }}>
            {stats.map(([v, l], i) => (
              <div key={i} style={{
                borderRadius:10, background:"#faf9fc", border:"1px solid #eceaf1",
                padding:"9px 4px", textAlign:"center",
              }}>
                <div style={{ fontSize:".92rem", fontWeight:800, color:PLUM_MID }}>{v}</div>
                <div style={{ fontSize:".58rem", color:"#9ca3af", fontWeight:600, marginTop:1 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Footer note */}
          <div style={{
            display:"flex", alignItems:"center", gap:6,
            borderTop:"1px solid #f3f4f6", paddingTop:12,
          }}>
            <div style={{
              width:16, height:16, borderRadius:"50%", background:"rgba(16,185,129,0.12)",
              display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
            }}>
              <Check style={{ width:9, height:9, color:"#10b981" }} />
            </div>
            <span style={{ fontSize:".68rem", color:"#6b7280", fontWeight:500 }}>
              Included on every Certxa plan — pay only for what you use
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Booking link preview widget */
function BookingLinkPreview({ salonName, slug }: { salonName: string; slug: string }) {
  const displaySlug = slug || "yoursalon";
  return (
    <div style={{ width:"100%", maxWidth:380 }}>
      {/* Browser chrome */}
      <div style={{ borderRadius:14, overflow:"hidden", boxShadow:"0 12px 48px rgba(0,0,0,0.2)" }}>
        {/* URL bar */}
        <div style={{ background:"#1e1e2e", padding:"10px 14px", display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ display:"flex", gap:5 }}>
            {["#ef4444","#f59e0b","#22c55e"].map(c => (
              <div key={c} style={{ width:10, height:10, borderRadius:"50%", background:c }} />
            ))}
          </div>
          <div style={{ flex:1, background:"rgba(255,255,255,0.08)", borderRadius:6, padding:"4px 10px",
            display:"flex", alignItems:"center", gap:5 }}>
            <div style={{ width:10, height:10, borderRadius:"50%", background:"#22c55e" }} />
            <span style={{ fontSize:".68rem", color:"rgba(255,255,255,0.6)", fontFamily:"monospace" }}>
              certxa.com/book/<span style={{ color:"#fbbf24", fontWeight:700 }}>{displaySlug}</span>
            </span>
          </div>
        </div>

        {/* Page content */}
        <div style={{ background:"#fff", padding:"20px 18px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:`linear-gradient(135deg,${PLUM},${PLUM_MID})`,
              display:"flex", alignItems:"center", justifyContent:"center" }}>
              <span style={{ color:"#fff", fontSize:"1rem" }}>💅</span>
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:".9rem", color:"#111827" }}>{salonName || "Your Salon"}</div>
              <div style={{ fontSize:".65rem", color:"#9ca3af" }}>Online Booking · Powered by Certxa</div>
            </div>
          </div>

          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:".62rem", fontWeight:700, color:"#6b7280", textTransform:"uppercase",
              letterSpacing:".08em", marginBottom:8 }}>Choose a service</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
              {["Gel Manicure","Acrylic Fill","Dip Powder","Gel Pedicure"].map(s=>(
                <div key={s} style={{ padding:"8px 10px", borderRadius:8, border:"1.5px solid #e5e7eb",
                  fontSize:".65rem", color:"#374151", fontWeight:600 }}>{s}</div>
              ))}
            </div>
          </div>

          <div style={{ padding:"10px 14px", borderRadius:10,
            background:`linear-gradient(135deg,${PLUM},${PLUM_MID})`,
            textAlign:"center", fontSize:".8rem", fontWeight:700, color:"#fff" }}>
            Book Appointment
          </div>
        </div>
      </div>
    </div>
  );
}

/** Google search results mockup for Connect step */
function GoogleSearchPreview({ salonName }: { salonName: string }) {
  const name = salonName || "Your Salon";
  const competitors = ["Lux Nail Studio","Pink Spa & Nails","Cloud 9 Nails"];
  return (
    <div style={{ width:"100%", maxWidth:380 }}>
      {/* Fake Google search */}
      <div style={{ borderRadius:12, background:"#fff",
        border:"1px solid #e9e4f2", boxShadow:"0 2px 10px rgba(59,7,100,0.06)",
        padding:"10px 14px", marginBottom:12,
        display:"flex", alignItems:"center", gap:8 }}>
        <svg width="16" height="16" viewBox="0 0 48 48">
          <path fill="#4285F4" d="M47.5 24.6c0-1.6-.1-3.1-.4-4.6H24v8.7h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.3 7.3-10.5 7.3-17.3z"/>
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.9-6c-2.1 1.4-4.9 2.3-8 2.3-6.1 0-11.3-4.1-13.2-9.7H2.6v6.2C6.6 42.7 14.7 48 24 48z"/>
          <path fill="#FBBC05" d="M10.8 28.8c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4v-6.2H2.6C.9 17 0 20.4 0 24s.9 7 2.6 10.2l8.2-5.4z"/>
          <path fill="#EA4335" d="M24 9.5c3.4 0 6.5 1.2 8.9 3.5l6.6-6.6C35.9 2.4 30.4 0 24 0 14.7 0 6.6 5.3 2.6 13.8l8.2 5.4C12.7 13.6 17.9 9.5 24 9.5z"/>
        </svg>
        <span style={{ fontSize:".8rem", color:"#374151" }}>nail salons near me</span>
        <Search style={{ width:14, height:14, color:"#9ca3af", marginLeft:"auto" }} />
      </div>

      {/* Featured (YOUR salon) */}
      <div style={{ borderRadius:12, background:"#fff", overflow:"hidden",
        boxShadow:"0 4px 24px rgba(59,7,100,0.1)", marginBottom:8, border:`2px solid ${GOLD}` }}>
        <div style={{ padding:"3px 10px", background:GOLD, display:"flex", alignItems:"center", gap:6 }}>
          <Check style={{ width:10, height:10, color:"#fff" }} />
          <span style={{ fontSize:".58rem", fontWeight:700, color:"#fff" }}>YOUR SALON · Connected with Certxa</span>
        </div>
        <div style={{ padding:"12px 14px" }}>
          <div style={{ fontWeight:700, color:"#111827", fontSize:".85rem", marginBottom:3 }}>{name}</div>
          <div style={{ display:"flex", alignItems:"center", gap:3, marginBottom:4 }}>
            {Array.from({length:5},(_,i)=>(<Star key={i} style={{ width:11,height:11 }} fill="#fbbf24" color="#fbbf24" />))}
            <span style={{ fontSize:".65rem", color:"#6b7280" }}>4.9 (312 reviews)</span>
          </div>
          <div style={{ fontSize:".65rem", color:"#16a34a", fontWeight:600 }}>Open · Closes 7 PM</div>
          <div style={{ marginTop:8, padding:"6px 12px", borderRadius:8,
            background:`linear-gradient(135deg,${PLUM},${PLUM_MID})`,
            display:"inline-flex", alignItems:"center", gap:4, fontSize:".65rem", fontWeight:700, color:"#fff" }}>
            Book Now ›
          </div>
        </div>
      </div>

      {/* Competitors (greyed out) */}
      {competitors.map(c => (
        <div key={c} style={{ borderRadius:10, background:"#fff", border:"1px solid #eceaf1",
          padding:"10px 14px", marginBottom:6, opacity:0.55 }}>
          <div style={{ fontWeight:600, color:"#374151", fontSize:".78rem" }}>{c}</div>
          <div style={{ display:"flex", alignItems:"center", gap:3, marginTop:2 }}>
            {Array.from({length:5},(_,i)=>(<Star key={i} style={{ width:10,height:10 }} fill={i<4?"#fbbf24":"#e5e7eb"} color={i<4?"#fbbf24":"#e5e7eb"} />))}
            <span style={{ fontSize:".6rem", color:"#9ca3af" }}>4.2 · Open</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Animated success checklist */
function SuccessPreview({ visible, salonName }: { visible: boolean; salonName: string }) {
  const [shown, setShown] = useState(0);
  const items = [
    "Business information imported",
    "Booking page created",
    "Calendar is ready",
    "Service menu set up",
    "Owner account created",
    "Ready to accept appointments",
  ];
  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => setShown(s => s < items.length ? s + 1 : s), 500);
    return () => clearInterval(t);
  }, [visible]);

  return (
    <div style={{ width:"100%", maxWidth:360 }}>
      <div style={{ borderRadius:16, background:"#fff",
        border:"1px solid #e5f3ea", boxShadow:"0 4px 24px rgba(16,185,129,0.08)",
        padding:"24px 24px 20px", textAlign:"center", marginBottom:16 }}>
        <div style={{ width:56, height:56, borderRadius:"50%", background:"rgba(34,197,94,0.12)",
          border:"2px solid #86efac", display:"flex", alignItems:"center", justifyContent:"center",
          margin:"0 auto 12px" }}>
          <Check style={{ width:28, height:28, color:"#16a34a" }} />
        </div>
        <div style={{ fontSize:"1.1rem", fontWeight:700, color:"#111827", marginBottom:4 }}>
          {salonName || "Your salon"} is ready
        </div>
        <div style={{ fontSize:".78rem", color:"#6b7280" }}>
          Everything is set up and ready to go.
        </div>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {items.map((item, i) => (
          <div key={i} style={{
            display:"flex", alignItems:"center", gap:10,
            padding:"10px 16px", borderRadius:10,
            background: i < shown ? "rgba(34,197,94,0.08)" : "#fff",
            border: `1px solid ${i < shown ? "rgba(34,197,94,0.25)" : "#eceaf1"}`,
            opacity: i < shown ? 1 : 0.4,
            transform: i < shown ? "none" : "translateX(-8px)",
            transition:"all .4s cubic-bezier(.22,1,.36,1)",
            transitionDelay:`${i * 50}ms`,
          }}>
            <div style={{
              width:20, height:20, borderRadius:"50%", flexShrink:0,
              background: i < shown ? "rgba(34,197,94,0.18)" : "#f3f4f6",
              display:"flex", alignItems:"center", justifyContent:"center",
              transition:"all .3s",
            }}>
              {i < shown && <Check style={{ width:11, height:11, color:"#16a34a" }} />}
            </div>
            <span style={{ fontSize:".78rem", color:"#374151", fontWeight:500 }}>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Animated right panel wrapper */
function RightPanel({ step, salonName, address, phone, hours, slug, createdStoreId, customerName }:{
  step:number; salonName:string; address?:string; phone?:string;
  hours:DayHours[]; slug:string; createdStoreId:number|null; customerName:string;
}) {
  // Background tint changes subtly per step — light, airy, never dark
  const gradients: Record<number, string> = {
    1: "linear-gradient(160deg,#faf9fc 0%,#f2eef8 100%)",
    2: "linear-gradient(160deg,#f8fafb 0%,#eef3fa 100%)",
    3: "linear-gradient(160deg,#f9faf7 0%,#eef6ef 100%)",
    4: "linear-gradient(160deg,#faf9fc 0%,#f1edf8 100%)",
    5: "linear-gradient(160deg,#f8faf9 0%,#ebf6f0 100%)",
  };

  const subtitles: Record<number, string> = {
    1: "Your salon will appear instantly to clients searching on Google.",
    2: "Certxa builds your calendar and booking profile in real time.",
    3: "Share one link and clients can book anytime, 24/7.",
    4: "Get discovered by clients searching for nail salons near you.",
    5: "Start accepting bookings right now.",
  };

  return (
    <div style={{
      flex:1, minWidth:0, height:"100%", position:"relative", overflow:"hidden",
      background: gradients[step] || gradients[1],
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:"32px 24px",
      boxSizing:"border-box",
      transition:"background 1s ease",
    }}>
      {/* Subtle orb background */}
      <div style={{ position:"absolute", width:400, height:400, borderRadius:"50%",
        background:"radial-gradient(circle,rgba(91,33,182,0.06) 0%,transparent 70%)",
        top:-100, right:-100, pointerEvents:"none" }} />
      <div style={{ position:"absolute", width:300, height:300, borderRadius:"50%",
        background:"radial-gradient(circle,rgba(245,158,11,0.05) 0%,transparent 70%)",
        bottom:-50, left:-50, pointerEvents:"none" }} />

      {/* Step subtitle */}
      <div style={{ position:"absolute", top:28, left:32, right:32 }}>
        <div style={{ fontSize:".72rem", color:"#9a94a6", fontWeight:500, lineHeight:1.5 }}>
          {subtitles[step]}
        </div>
      </div>

      {/* Preview content */}
      <div style={{ position:"relative", zIndex:1, width:"100%", display:"flex", justifyContent:"center",
        animation:"previewIn .5s cubic-bezier(.22,1,.36,1) both" }}>
        {step === 1 && (
          <GoogleBusinessCard
            name={salonName} address={address} phone={phone}
            visible={true}
          />
        )}
        {step === 2 && <AutumnAdPreview salonName={salonName} />}
        {step === 3 && <BookingLinkPreview salonName={salonName} slug={slug} />}
        {step === 4 && <GoogleSearchPreview salonName={salonName} />}
        {step === 5 && <SuccessPreview visible={step === 5} salonName={salonName} />}
      </div>

      {/* Certxa watermark */}
      <div style={{ position:"absolute", bottom:20, right:24,
        fontFamily:"'Cormorant Garamond',serif", fontSize:"1rem", fontWeight:700,
        color:"rgba(59,7,100,0.08)", letterSpacing:"-0.02em" }}>
        Certxa<span style={{ color:"rgba(245,158,11,0.25)" }}>.</span>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Onboarding() {
  const navigate    = useNavigate();
  const { toast }   = useToast();
  const { user }    = useAuth();
  const queryClient = useQueryClient();

  // ── Step state ─────────────────────────────────────────────────────────────
  const [step, setStep] = useState(1);

  // ── Step 1: Find your salon ────────────────────────────────────────────────
  const [searchQuery,   setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [searchStatus,  setSearchStatus]  = useState<"idle"|"searching"|"done"|"empty">("idle");
  const [manualMode,    setManualMode]    = useState(false);
  const [placeDetailsLoading, setPlaceDetailsLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  // ── Business info ──────────────────────────────────────────────────────────
  const [salonName,     setSalonName]     = useState(DEFAULT_SALON_NAME);
  const [address,       setAddress]       = useState("");
  const [city,          setCity]          = useState("");
  const [stateVal,      setStateVal]      = useState("");
  const [postcode,      setPostcode]      = useState("");
  const [phone,         setPhone]         = useState("");
  const [website,       setWebsite]       = useState("");
  const [timezone,      setTimezone]      = useState(detectTimezone());

  // ── Business hours ─────────────────────────────────────────────────────────
  const [hours, setHours] = useState<DayHours[]>(DEFAULT_HOURS);

  // ── Booking URL ────────────────────────────────────────────────────────────
  const [bookingSlug, setBookingSlug] = useState("");
  const [slugStatus,  setSlugStatus]  = useState<"idle"|"checking"|"available"|"taken"|"invalid">("idle");
  const slugTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  // ── After submission ───────────────────────────────────────────────────────
  const [connectGoogle,    setConnectGoogle]    = useState<boolean|null>(null);
  const [createdStoreId,   setCreatedStoreId]   = useState<number|null>(null);
  const [createdWebsiteSlug, setCreatedWebsiteSlug] = useState("");

  // Auto-suggest slug
  useEffect(() => {
    if (salonName && !bookingSlug) {
      const s = salonName.toLowerCase().replace(/[^a-z0-9\s-]/g,"").trim().replace(/\s+/g,"-").slice(0,30);
      if (s.length >= 3) setBookingSlug(s);
    }
  }, [salonName]);

  // ── Search ─────────────────────────────────────────────────────────────────
  const doSearch = useCallback((q: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 2) { setSearchStatus("idle"); setSearchResults([]); return; }
    setSearchStatus("searching");
    searchTimer.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/google-business/search?name=${encodeURIComponent(q.trim())}`);
        const data = await res.json();
        const list: PlaceResult[] = data.results ?? [];
        setSearchResults(list);
        setSearchStatus(list.length ? "done" : "empty");
      } catch {
        setSearchStatus("empty");
        setSearchResults([]);
      }
    }, 500);
  }, []);

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    // update live preview immediately
    if (q.trim().length >= 2 && !manualMode) {
      setSalonName(q);
    } else if (!manualMode) {
      // box cleared — revert the button + live preview back to the default placeholder
      // instead of leaving a previously-selected salon name stuck in state
      setSalonName(DEFAULT_SALON_NAME);
    }
    doSearch(q);
  };

  const selectPlace = (r: PlaceResult) => {
    setSalonName(r.name);
    // address is a full string from Places — parse what we can
    const parts = r.address.split(",").map(s => s.trim());
    if (parts.length >= 3) {
      setAddress(parts[0]);
      setCity(parts[1]);
      // State + ZIP
      const stateZip = parts[parts.length - 2] ?? "";
      const [st, zip] = stateZip.split(" ").filter(Boolean);
      if (st) setStateVal(st);
      if (zip) setPostcode(zip);
      if (STATE_TZ[st]) setTimezone(STATE_TZ[st]);
    } else if (parts.length > 0) {
      setAddress(r.address);
    }
    setManualMode(false);
    goNext(2);

    // Places Text Search (used for the live-search list) only returns name/address/rating —
    // phone, website, and opening hours require a separate Place Details call with an
    // explicit `fields` mask. Fetch it in the background so Step 2 fills in as it arrives.
    setPlaceDetailsLoading(true);
    (async () => {
      try {
        const res  = await fetch(`/api/google-business/place-details?placeId=${encodeURIComponent(r.placeId)}`);
        const data = await res.json();
        if (data.phone)   setPhone(String(data.phone).replace(/\D/g, "").slice(0, 10));
        if (data.website) setWebsite(String(data.website).replace(/^https?:\/\//, "").replace(/\/$/, ""));
        const parsedHours = parseGooglePeriods(data.openingHours);
        if (parsedHours) setHours(parsedHours);
      } catch {
        // silently ignore — these fields stay editable so the user can fill them in manually
      } finally {
        setPlaceDetailsLoading(false);
      }
    })();
  };

  // ── Hours helpers ──────────────────────────────────────────────────────────
  const toggleDay = (i: number) => setHours(prev => prev.map((d,idx) => idx===i ? {...d, isOpen:!d.isOpen} : d));
  const setDayTime = (i: number, field:"openTime"|"closeTime", val:string) =>
    setHours(prev => prev.map((d,idx) => idx===i ? {...d,[field]:val} : d));
  const copyToAll = () => {
    const mon = hours[1];
    setHours(prev => prev.map((d,i) => i===0 ? d : {...d, openTime:mon.openTime, closeTime:mon.closeTime}));
  };

  // ── Slug validation ────────────────────────────────────────────────────────
  const handleSlugChange = useCallback((val: string) => {
    const cleaned = val.toLowerCase().replace(/[^a-z0-9-]/g,"").slice(0,50);
    setBookingSlug(cleaned);
    setSlugStatus("idle");
    if (slugTimer.current) clearTimeout(slugTimer.current);
    if (cleaned.length < 3) { if (cleaned.length > 0) setSlugStatus("invalid"); return; }
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]{1,2}$/.test(cleaned)) { setSlugStatus("invalid"); return; }
    setSlugStatus("checking");
    slugTimer.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/public/check-slug/${encodeURIComponent(cleaned)}`);
        const data = await res.json();
        setSlugStatus(data.available ? "available" : "taken");
      } catch { setSlugStatus("idle"); }
    }, 500);
  }, []);

  // ── Step navigation ────────────────────────────────────────────────────────
  const goNext = (to?: number) => setStep(s => to ?? s + 1);
  const goBack = () => setStep(s => Math.max(1, s - 1));

  const canProceed = () => {
    switch (step) {
      case 1: return salonName.trim().length >= 2;
      case 2: return hours.some(h => h.isOpen);
      case 3: return slugStatus === "available";
      case 4: return true; // Google connect is optional
      default: return true;
    }
  };

  // ── Main onboarding submit (at slug step) ──────────────────────────────────
  const onboardMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        businessType:     "Nail Salon",
        businessName:     salonName.trim(),
        phone:            phone.replace(/\D/g,"").slice(0,10) || undefined,
        timezone,
        address:          address.trim()  || undefined,
        city:             city.trim()     || undefined,
        state:            stateVal        || undefined,
        postcode:         postcode        || undefined,
        businessHours:    hours.map((h,i) => ({
          dayOfWeek: i, openTime: h.openTime, closeTime: h.closeTime, isClosed: !h.isOpen,
        })),
        manicureStations: 0,
        pedicureChairs:   0,
        serviceCategories: [],   // triggers seedFromPresetStore → full nail catalog
        bookingSlug,
        // no staff → backend auto-creates "Owner" staff member
      };
      const res  = await apiRequest("POST", "/api/onboarding", payload);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Setup failed");
      return data;
    },
    onSuccess: async (data) => {
      const storeId = data.store?.id;
      if (storeId) setCreatedStoreId(storeId);
      setCreatedWebsiteSlug(data.website?.slug ?? data.store?.bookingSlug ?? "");
      queryClient.setQueryData(["/api/auth/user"], data.user);
      queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
      goNext(4); // move to Google connect step
    },
    onError: (err: Error) => {
      toast({ title: "Setup failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSlugSubmit = () => {
    if (slugStatus === "available" && !onboardMutation.isPending) onboardMutation.mutate();
  };

  // Full address string for display
  const fullAddress = [address, city, stateVal, postcode].filter(Boolean).join(", ");

  // ── Layout ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", height:"100vh", overflow:"hidden", fontFamily:"'Inter',sans-serif" }}>

      {/* ── Left panel ── */}
      <div className="onb-left" style={{
        width:"38%", display:"flex", flexDirection:"column", background:"#fff",
        borderRight:"1px solid #f0f0f2", overflowY:"auto", position:"relative", flexShrink:0,
      }}>
        {/* Logo */}
        <div style={{ padding:"24px 32px 0", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <a href="/overview" style={{
            fontFamily:"'Cormorant Garamond',serif", fontSize:"1.35rem", fontWeight:700,
            color:PLUM, letterSpacing:"-0.02em", textDecoration:"none",
          }}>
            Certxa<span style={{ color:GOLD }}>.</span>
          </a>
          {step < 5 && (
            <span style={{ fontSize:".7rem", color:"#9ca3af", fontWeight:500 }}>
              {user?.email ?? ""}
            </span>
          )}
        </div>

        {/* Step content */}
        <div style={{ flex:1, padding:"0 32px 40px" }}>

          {/* ── STEP 1: Find Your Salon ── */}
          {step === 1 && (
            <div style={{ animation:"stepIn .35s cubic-bezier(.22,1,.36,1) both" }}>
              <h1 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:"1.9rem", fontWeight:500,
                color:"#111827", letterSpacing:"-.01em", lineHeight:1.2, margin:"0 0 8px",
                whiteSpace:"nowrap" }}>
                Let's find your salon
              </h1>
              <p style={{ fontSize:".88rem", color:"#6b7280", marginBottom:24, lineHeight:1.55 }}>
                Search for your business and we'll import your information automatically.
                Can't find it? Try adding your city, e.g. "Fabulous Nails Denver".
              </p>

              {!manualMode ? (
                <>
                  {/* Search input */}
                  <div style={{ position:"relative", marginBottom:20 }}>
                    <Search style={{ position:"absolute", left:14, top:14, width:16, height:16, color:"#9ca3af" }} />
                    <input
                      value={searchQuery}
                      onChange={e => handleSearchChange(e.target.value)}
                      placeholder="Search your salon name…"
                      autoFocus
                      style={{
                        width:"100%", height:46, paddingLeft:42, paddingRight:14,
                        borderRadius:10, border:"1.5px solid #e5e7eb", background:"#fafafa",
                        fontSize:".9rem", color:"#111827", outline:"none",
                        transition:"border-color .15s", boxSizing:"border-box",
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = PLUM; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "#e5e7eb"; }}
                    />
                    {searchStatus === "searching" && (
                      <Loader2 style={{ position:"absolute", right:14, top:14, width:16, height:16,
                        color:PLUM, animation:"spin 1s linear infinite" }} />
                    )}
                  </div>

                  {/* Results */}
                  {searchStatus === "done" && searchResults.length > 0 && (
                    <div style={{ border:"1.5px solid #e5e7eb", borderRadius:10, overflow:"hidden", marginBottom:12 }}>
                      {searchResults.slice(0,5).map((r,i) => (
                        <button key={r.placeId} onClick={() => selectPlace(r)}
                          style={{
                            width:"100%", display:"flex", alignItems:"flex-start", gap:10,
                            padding:"12px 14px", background:"#fff", border:"none", cursor:"pointer",
                            borderBottom: i < Math.min(searchResults.length,5)-1 ? "1px solid #f3f4f6" : "none",
                            textAlign:"left", transition:"background .1s",
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background="#f9f5ff"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background="#fff"; }}>
                          <div style={{ width:32, height:32, borderRadius:8, background:"#f3f4f6",
                            display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            <MapPin style={{ width:14, height:14, color:"#9ca3af" }} />
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:600, fontSize:".85rem", color:"#111827" }}>{r.name}</div>
                            <div style={{ fontSize:".72rem", color:"#9ca3af", marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.address}</div>
                            {r.rating != null && r.rating > 0 && (
                              <div style={{ display:"flex", alignItems:"center", gap:3, marginTop:3 }}>
                                <Star style={{ width:10, height:10 }} fill="#fbbf24" color="#fbbf24" />
                                <span style={{ fontSize:".65rem", color:"#9ca3af" }}>{r.rating.toFixed(1)}</span>
                              </div>
                            )}
                          </div>
                          <ChevronRight style={{ width:14, height:14, color:"#d1d5db", flexShrink:0, marginTop:2 }} />
                        </button>
                      ))}
                    </div>
                  )}

                  {searchStatus === "empty" && searchQuery.trim().length >= 2 && (
                    <div style={{ padding:"12px 14px", borderRadius:10, background:"#fef9ee",
                      border:"1px solid #fde68a", marginBottom:12 }}>
                      <p style={{ fontSize:".78rem", color:"#92400e", margin:0, fontWeight:500 }}>
                        No results found. You can enter your salon details manually below.
                      </p>
                    </div>
                  )}

                  <button onClick={() => { setManualMode(true); setSearchResults([]); }}
                    style={{ width:"100%", padding:"11px", borderRadius:10,
                      border:"1.5px dashed #d1d5db", background:"#fff", cursor:"pointer",
                      fontSize:".82rem", color:"#6b7280", fontWeight:500, marginBottom:12 }}>
                    My salon isn't listed — enter details manually
                  </button>

                  {/* If they've typed enough to get a name, allow continuing */}
                  {searchQuery.trim().length >= 2 && salonName.trim().length >= 2 && searchStatus !== "done" && (
                    <button onClick={() => goNext(2)}
                      style={{
                        width:"100%", padding:"13px", borderRadius:10, border:"none",
                        background:`linear-gradient(135deg,${PLUM} 0%,${PLUM_MID} 100%)`,
                        color:"#fff", fontSize:".9rem", fontWeight:700, cursor:"pointer",
                        boxShadow:"0 4px 20px rgba(59,7,100,0.3)",
                        display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                      }}>
                      Continue with "{salonName}"
                      <ChevronRight style={{ width:16, height:16 }} />
                    </button>
                  )}
                </>
              ) : (
                /* Manual entry */
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div>
                    <FieldLabel required>Salon Name</FieldLabel>
                    <TextInput value={salonName} onChange={setSalonName} placeholder="e.g. Glamour Nails" autoFocus />
                  </div>
                  <div>
                    <FieldLabel>Street Address</FieldLabel>
                    <TextInput value={address} onChange={setAddress} placeholder="123 Main St" />
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    <div>
                      <FieldLabel>City</FieldLabel>
                      <TextInput value={city} onChange={setCity} placeholder="Los Angeles" />
                    </div>
                    <div>
                      <FieldLabel>State</FieldLabel>
                      <Select value={stateVal} onValueChange={v => { setStateVal(v); if (STATE_TZ[v]) setTimezone(STATE_TZ[v]); }}>
                        <SelectTrigger style={{ height:44, borderRadius:10, border:"1.5px solid #e5e7eb",
                          background:"#fafafa", fontSize:".88rem" }}>
                          <SelectValue placeholder="State" />
                        </SelectTrigger>
                        <SelectContent>
                          {US_STATES.map(s => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    <div>
                      <FieldLabel>ZIP Code</FieldLabel>
                      <TextInput value={postcode} onChange={setPostcode} placeholder="90210" inputMode="numeric" maxLength={5} />
                    </div>
                    <div>
                      <FieldLabel>Phone</FieldLabel>
                      <TextInput value={formatPhoneDisplay(phone)} onChange={v => setPhone(v.replace(/\D/g,"").slice(0,10))}
                        placeholder="(555) 123-4567" inputMode="numeric" maxLength={14} />
                    </div>
                  </div>
                  <button onClick={() => setManualMode(false)}
                    style={{ fontSize:".78rem", color:"#6b7280", background:"none", border:"none",
                      cursor:"pointer", textDecoration:"underline", alignSelf:"flex-start" }}>
                    ← Search instead
                  </button>
                  <button onClick={() => canProceed() && goNext(2)} disabled={!canProceed()}
                    style={{
                      width:"100%", padding:"13px", borderRadius:10, border:"none",
                      background: canProceed() ? `linear-gradient(135deg,${PLUM},${PLUM_MID})` : "#e5e7eb",
                      color: canProceed() ? "#fff" : "#9ca3af", fontSize:".9rem", fontWeight:700,
                      cursor: canProceed() ? "pointer" : "not-allowed",
                      boxShadow: canProceed() ? "0 4px 20px rgba(59,7,100,0.3)" : "none",
                    }}>
                    Continue →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Review Details & Hours ── */}
          {step === 2 && (
            <div style={{ animation:"stepIn .35s cubic-bezier(.22,1,.36,1) both" }}>
              <h1 style={{ fontSize:"1.5rem", fontWeight:800, color:"#111827",
                letterSpacing:"-.02em", lineHeight:1.2, margin:"0 0 6px" }}>
                Review your details
              </h1>
              <p style={{ fontSize:".85rem", color:"#6b7280", marginBottom:20, lineHeight:1.5 }}>
                Confirm your salon info and set your opening hours.
              </p>

              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {/* Editable fields */}
                <div>
                  <FieldLabel required>Salon Name</FieldLabel>
                  <TextInput value={salonName} onChange={setSalonName} placeholder="Your salon name" />
                </div>

                {placeDetailsLoading && (
                  <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:".72rem", color:PLUM_MID, fontWeight:600 }}>
                    <Loader2 style={{ width:12, height:12, animation:"spin 1s linear infinite" }} />
                    Fetching phone, website &amp; hours from Google…
                  </div>
                )}

                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <div>
                    <FieldLabel>Phone</FieldLabel>
                    <TextInput value={formatPhoneDisplay(phone)} onChange={v => setPhone(v.replace(/\D/g,"").slice(0,10))}
                      placeholder="(555) 123-4567" inputMode="numeric" maxLength={14} />
                  </div>
                  <div>
                    <FieldLabel>Website</FieldLabel>
                    <TextInput value={website} onChange={setWebsite} placeholder="yoursalon.com" />
                  </div>
                </div>

                {!fullAddress && (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    <div>
                      <FieldLabel>Street Address</FieldLabel>
                      <TextInput value={address} onChange={setAddress} placeholder="123 Main St" />
                    </div>
                    <div>
                      <FieldLabel>City</FieldLabel>
                      <TextInput value={city} onChange={setCity} placeholder="Los Angeles" />
                    </div>
                  </div>
                )}
                {fullAddress && (
                  <div style={{ padding:"10px 12px", borderRadius:9, background:"#f9fafb",
                    border:"1px solid #f0f0f0", display:"flex", alignItems:"center", gap:8 }}>
                    <MapPin style={{ width:13, height:13, color:"#9ca3af", flexShrink:0 }} />
                    <span style={{ fontSize:".78rem", color:"#374151" }}>{fullAddress}</span>
                    <button onClick={() => { setAddress(""); setCity(""); setStateVal(""); setPostcode(""); }}
                      style={{ marginLeft:"auto", fontSize:".7rem", color:PLUM_MID, background:"none",
                        border:"none", cursor:"pointer", fontWeight:600 }}>Edit</button>
                  </div>
                )}

                <div>
                  <FieldLabel>Timezone</FieldLabel>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger style={{ height:44, borderRadius:10, border:"1.5px solid #e5e7eb", background:"#fafafa", fontSize:".85rem" }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Business hours */}
                <div>
                  <FieldLabel>Opening Hours</FieldLabel>
                  <div style={{ borderRadius:10, border:"1.5px solid #e5e7eb", overflow:"hidden" }}>
                    {DAY_NAMES.map((name, i) => {
                      const day = hours[i];
                      return (
                        <div key={i} style={{
                          display:"flex", alignItems:"center", gap:10, padding:"8px 12px",
                          borderBottom: i < 6 ? "1px solid #f3f4f6" : "none",
                          background: day.isOpen ? "#fff" : "#fafafa",
                        }}>
                          {/* Toggle */}
                          <button type="button" onClick={() => toggleDay(i)}
                            style={{
                              width:36, height:20, borderRadius:10, border:"none", cursor:"pointer",
                              background: day.isOpen ? PLUM : "#e5e7eb",
                              display:"flex", alignItems:"center",
                              padding:"0 2px", transition:"background .2s",
                              justifyContent: day.isOpen ? "flex-end" : "flex-start",
                              flexShrink:0,
                            }}>
                            <div style={{ width:16, height:16, borderRadius:"50%", background:"#fff",
                              boxShadow:"0 1px 3px rgba(0,0,0,0.2)", transition:"margin .2s" }} />
                          </button>
                          <span style={{ fontSize:".72rem", fontWeight:700, width:28, flexShrink:0,
                            color: day.isOpen ? "#111827" : "#9ca3af" }}>{name}</span>
                          {day.isOpen ? (
                            <div style={{ display:"flex", alignItems:"center", gap:4, flex:1, minWidth:0 }}>
                              <Select value={day.openTime} onValueChange={v => setDayTime(i,"openTime",v)}>
                                <SelectTrigger style={{ height:30, borderRadius:7, border:"1px solid #e5e7eb",
                                  fontSize:".68rem", flex:1, background:"#fff" }}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {TIME_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <span style={{ color:"#d1d5db", fontSize:".65rem" }}>–</span>
                              <Select value={day.closeTime} onValueChange={v => setDayTime(i,"closeTime",v)}>
                                <SelectTrigger style={{ height:30, borderRadius:7, border:"1px solid #e5e7eb",
                                  fontSize:".68rem", flex:1, background:"#fff" }}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {TIME_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          ) : (
                            <span style={{ fontSize:".68rem", color:"#9ca3af", fontStyle:"italic", flex:1 }}>Closed</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={copyToAll} style={{ marginTop:6, fontSize:".72rem", color:PLUM_MID,
                    background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>
                    Copy Monday hours to all open days
                  </button>
                </div>

                {/* Navigation */}
                <div style={{ display:"flex", gap:8, marginTop:4 }}>
                  <button onClick={goBack} style={{ padding:"12px 20px", borderRadius:10,
                    border:"1.5px solid #e5e7eb", background:"#fff", fontSize:".85rem",
                    fontWeight:600, color:"#6b7280", cursor:"pointer" }}>← Back</button>
                  <button onClick={() => canProceed() && goNext()} disabled={!canProceed()}
                    style={{
                      flex:1, padding:"12px", borderRadius:10, border:"none",
                      background: canProceed() ? `linear-gradient(135deg,${PLUM},${PLUM_MID})` : "#e5e7eb",
                      color: canProceed() ? "#fff" : "#9ca3af", fontSize:".9rem", fontWeight:700,
                      cursor: canProceed() ? "pointer" : "not-allowed",
                      boxShadow: canProceed() ? "0 4px 20px rgba(59,7,100,0.3)" : "none",
                    }}>
                    Continue →
                  </button>
                </div>
              </div>
            </div>
          )}

           {/* ── STEP 3: Bloom Website & Booking Link ── */}
          {step === 3 && (
            <div style={{ animation:"stepIn .35s cubic-bezier(.22,1,.36,1) both" }}>
              <h1 style={{ fontSize:"1.5rem", fontWeight:800, color:"#111827",
                letterSpacing:"-.02em", lineHeight:1.2, margin:"0 0 6px" }}>
                 Your Bloom website
              </h1>
              <p style={{ fontSize:".85rem", color:"#6b7280", marginBottom:20, lineHeight:1.5 }}>
                 Choose the subdomain clients will use to find your Bloom website and booking page.
              </p>

              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                <div>
                   <FieldLabel>Bloom website subdomain</FieldLabel>
                  <div style={{
                    display:"flex", alignItems:"center", height:46, borderRadius:10, overflow:"hidden",
                    border:`1.5px solid ${slugStatus==="available" ? "#22c55e" : slugStatus==="taken" ? "#ef4444" : slugStatus==="invalid" ? "#f59e0b" : "#e5e7eb"}`,
                    transition:"border-color .2s",
                  }}>
                     <span style={{ padding:"0 10px", fontSize:".72rem", color:"#9ca3af", borderRight:"1px solid #e5e7eb",
                      height:"100%", display:"flex", alignItems:"center", background:"#f9fafb",
                       flexShrink:0, fontFamily:"monospace", whiteSpace:"nowrap" }}>https://
                    </span>
                    <input
                      value={bookingSlug}
                      onChange={e => handleSlugChange(e.target.value)}
                      placeholder="glamournails"
                      style={{ flex:1, border:"none", background:"transparent", padding:"0 12px",
                        fontSize:".88rem", color:"#111827", outline:"none", fontFamily:"monospace" }}
                    />
                     <span style={{ padding:"0 10px 0 0", fontSize:".72rem", color:"#9ca3af",
                       fontFamily:"monospace", whiteSpace:"nowrap" }}>.certxa.com</span>
                    <div style={{ padding:"0 12px", display:"flex", alignItems:"center" }}>
                      {slugStatus==="checking"  && <Loader2 style={{ width:14, height:14, color:PLUM, animation:"spin 1s linear infinite" }} />}
                      {slugStatus==="available" && <Check style={{ width:14, height:14, color:"#22c55e" }} />}
                      {slugStatus==="taken"     && <span style={{ color:"#ef4444", fontSize:".9rem" }}>✕</span>}
                    </div>
                  </div>
                  <div style={{ minHeight:18, marginTop:4 }}>
                    {slugStatus==="available" && <p style={{ fontSize:".72rem", color:"#16a34a", fontWeight:600 }}>✅ That name is available!</p>}
                    {slugStatus==="taken"     && <p style={{ fontSize:".72rem", color:"#ef4444" }}>❌ Already taken — try a different name</p>}
                    {slugStatus==="invalid"   && <p style={{ fontSize:".72rem", color:"#f59e0b" }}>Use lowercase letters, numbers, and hyphens (min 3 chars)</p>}
                  </div>
                </div>

                   {slugStatus==="available" && (
                  <div style={{ padding:"12px 14px", borderRadius:10, background:"#f0fdf4",
                    border:"1px solid #bbf7d0" }}>
                     <p style={{ fontSize:".72rem", fontWeight:700, color:"#166534", marginBottom:2 }}>Your Bloom website:</p>
                    <p style={{ fontSize:".82rem", fontFamily:"monospace", color:"#166534", wordBreak:"break-all" }}>
                       <strong>{bookingSlug}.certxa.com</strong>
                    </p>
                     <p style={{ fontSize:".7rem", fontFamily:"monospace", color:"#4d7c0f", marginTop:4, wordBreak:"break-all" }}>
                       Booking page: certxa.com/book/<strong>{bookingSlug}</strong>
                     </p>
                  </div>
                )}

                {/* Summary */}
                <div style={{ padding:"12px 14px", borderRadius:10, background:"#f9f5ff",
                  border:"1px solid #ede9fe" }}>
                  <p style={{ fontSize:".65rem", fontWeight:700, color:PLUM, textTransform:"uppercase",
                    letterSpacing:".08em", marginBottom:8 }}>Setting up for you</p>
                  {[
                    `✦ ${salonName} on Certxa`,
                    `✦ ${hours.filter(h=>h.isOpen).length} open days configured`,
                    "✦ Full nail salon service menu",
                     "✦ Bloom website and online booking ready",
                    "✦ Owner account created",
                  ].map((item,i) => (
                    <p key={i} style={{ fontSize:".72rem", color:PLUM_MID, margin:"2px 0" }}>{item}</p>
                  ))}
                </div>

                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={goBack} style={{ padding:"12px 20px", borderRadius:10,
                    border:"1.5px solid #e5e7eb", background:"#fff", fontSize:".85rem",
                    fontWeight:600, color:"#6b7280", cursor:"pointer" }}>← Back</button>
                  <button onClick={handleSlugSubmit}
                    disabled={slugStatus!=="available" || onboardMutation.isPending}
                    style={{
                      flex:1, padding:"12px", borderRadius:10, border:"none",
                      background: slugStatus==="available" ? `linear-gradient(135deg,${PLUM},${PLUM_MID})` : "#e5e7eb",
                      color: slugStatus==="available" ? "#fff" : "#9ca3af",
                      fontSize:".9rem", fontWeight:700,
                      cursor: slugStatus==="available" && !onboardMutation.isPending ? "pointer" : "not-allowed",
                      boxShadow: slugStatus==="available" ? "0 4px 20px rgba(59,7,100,0.3)" : "none",
                      display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                    }}>
                    {onboardMutation.isPending && <Loader2 style={{ width:15, height:15, animation:"spin 1s linear infinite" }} />}
                    {onboardMutation.isPending ? "Setting up your salon…" : "Launch My Salon →"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 4: Connect Google ── */}
          {step === 4 && (
            <div style={{ animation:"stepIn .35s cubic-bezier(.22,1,.36,1) both" }}>
              {connectGoogle === null ? (
                /* Pitch screen */
                <>
                  <h1 style={{ fontSize:"1.5rem", fontWeight:800, color:"#111827",
                    letterSpacing:"-.02em", lineHeight:1.2, margin:"0 0 6px" }}>
                    Turn Google searches into new appointments
                  </h1>
                  <p style={{ fontSize:".85rem", color:"#6b7280", marginBottom:20, lineHeight:1.5 }}>
                    When someone searches <em>"nail salons near me"</em>, Google helps potential
                    clients discover nearby salons. Connect Certxa to your Google Business Profile.
                  </p>

                  <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:20 }}>
                    {[
                      "Help new clients discover your salon",
                      "Show your services and booking options",
                      "Make it easy for customers to schedule",
                      "Bring your Google reviews into Certxa",
                      "Avoid updating your info in multiple places",
                    ].map(b => (
                      <div key={b} style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:20, height:20, borderRadius:"50%", background:"#dcfce7",
                          display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          <Check style={{ width:11, height:11, color:"#16a34a" }} />
                        </div>
                        <span style={{ fontSize:".82rem", color:"#374151" }}>{b}</span>
                      </div>
                    ))}
                  </div>

                  <button onClick={() => setConnectGoogle(true)}
                    style={{
                      width:"100%", padding:"13px", borderRadius:10, border:"none", marginBottom:10,
                      background:`linear-gradient(135deg,${PLUM},${PLUM_MID})`,
                      color:"#fff", fontSize:".9rem", fontWeight:700, cursor:"pointer",
                      boxShadow:"0 4px 20px rgba(59,7,100,0.3)",
                      display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                    }}>
                    <svg width="16" height="16" viewBox="0 0 48 48">
                      <path fill="#fff" opacity=".8" d="M47.5 24.6c0-1.6-.1-3.1-.4-4.6H24v8.7h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.3 7.3-10.5 7.3-17.3z"/>
                    </svg>
                    Connect Google & Get More Bookings
                  </button>
                  <button onClick={() => { setConnectGoogle(false); goNext(5); }}
                    style={{ width:"100%", padding:"12px", borderRadius:10,
                      border:"1.5px solid #e5e7eb", background:"#fff",
                      fontSize:".85rem", fontWeight:600, color:"#6b7280", cursor:"pointer" }}>
                    Continue without connecting
                  </button>
                </>
              ) : connectGoogle === true && createdStoreId ? (
                /* Show Google connect flow */
                <OnboardingGoogleStep
                  storeId={createdStoreId}
                  salonName={salonName}
                  salonAddress={fullAddress}
                  salonPhone={phone}
                  onSkip={() => goNext(5)}
                  onComplete={() => goNext(5)}
                />
              ) : (
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:40 }}>
                  <Loader2 style={{ width:32, height:32, color:PLUM, animation:"spin 1s linear infinite" }} />
                </div>
              )}
            </div>
          )}

          {/* ── STEP 5: You're Ready ── */}
          {step === 5 && (
            <div style={{ animation:"stepIn .35s cubic-bezier(.22,1,.36,1) both", textAlign:"center", paddingTop:16 }}>
              <div style={{ width:64, height:64, borderRadius:"50%", background:"#dcfce7",
                border:"2px solid #86efac", display:"flex", alignItems:"center", justifyContent:"center",
                margin:"0 auto 16px" }}>
                <Check style={{ width:32, height:32, color:"#16a34a" }} />
              </div>

              <h1 style={{ fontSize:"1.6rem", fontWeight:800, color:"#111827",
                letterSpacing:"-.02em", margin:"0 0 8px" }}>
                Your salon is ready!
              </h1>
              <p style={{ fontSize:".88rem", color:"#6b7280", marginBottom:24, lineHeight:1.5 }}>
                <strong style={{ color:"#111827" }}>{salonName}</strong> is live on Certxa.
                Start accepting bookings right now.
              </p>

              <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:24, textAlign:"left" }}>
                {[
                  "Business information saved",
                  "Full nail salon service menu loaded",
                  "Calendar and booking page ready",
                   createdWebsiteSlug
                     ? `Bloom website: ${createdWebsiteSlug}.certxa.com`
                     : "Bloom website configured",
                  "Owner account set up",
                  bookingSlug ? `Booking link: certxa.com/book/${bookingSlug}` : "Booking page created",
                ].map((item, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10,
                    padding:"8px 12px", borderRadius:8, background:"#f0fdf4", border:"1px solid #bbf7d0" }}>
                    <Check style={{ width:14, height:14, color:"#16a34a", flexShrink:0 }} />
                    <span style={{ fontSize:".78rem", color:"#166534", fontWeight:500 }}>{item}</span>
                  </div>
                ))}
              </div>

              <button onClick={async () => {
                  // Mark business_setup complete so the dashboard checklist reflects this
                  await fetch("/api/setup/progress/business_setup", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ status: "complete" }),
                  }).catch(() => {});
                  navigate("/setup");
                }}
                style={{
                  width:"100%", padding:"14px", borderRadius:10, border:"none",
                  background:`linear-gradient(135deg,${PLUM},${PLUM_MID})`,
                  color:"#fff", fontSize:".95rem", fontWeight:700, cursor:"pointer",
                  boxShadow:"0 4px 24px rgba(59,7,100,0.35)",
                }}>
                Continue Setup →
              </button>

              {bookingSlug && (
                <a href={`/book/${bookingSlug}`} target="_blank" rel="noopener noreferrer"
                  style={{ display:"block", marginTop:10, fontSize:".78rem", color:PLUM_MID,
                    fontWeight:600, textDecoration:"none" }}>
                  View your booking page ↗
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel (hidden on mobile) ── */}
      <div className="onb-right" style={{ flex:1, minWidth:0, height:"100%", overflow:"hidden" }}>
        <RightPanel
          step={step}
          salonName={salonName}
          address={fullAddress || address}
          phone={phone ? formatPhoneDisplay(phone) : undefined}
          hours={hours}
          slug={bookingSlug}
          createdStoreId={createdStoreId}
          customerName={[user?.firstName, user?.lastName].filter(Boolean).join(" ")}
        />
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Inter:wght@400;500;600;700;800&display=swap');

        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes stepIn {
          from { opacity:0; transform:translateY(16px); }
          to   { opacity:1; transform:none; }
        }
        @keyframes previewIn {
          from { opacity:0; transform:scale(0.96) translateY(12px); }
          to   { opacity:1; transform:none; }
        }
        @keyframes pillIn {
          from { opacity:0; transform:translateY(10px) scale(0.9); }
          to   { opacity:1; transform:none; }
        }
        @keyframes pillFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-4px); }
        }
        @keyframes cursorBlink {
          0%, 100% { opacity:1; }
          50%       { opacity:0; }
        }
        @keyframes valueReveal {
          from { opacity:0.3; transform:translateX(4px); }
          to   { opacity:1;   transform:none; }
        }
        @keyframes acceptPulseSoft {
          0%, 100% { opacity:1; box-shadow:0 0 0 0 rgba(74,222,128,0.5); }
          50%       { opacity:0.7; box-shadow:0 0 0 4px rgba(74,222,128,0); }
        }

        /* Mobile: hide right panel, full-width left */
        @media (max-width: 768px) {
          .onb-right { display: none !important; }
          .onb-left  { width: 100% !important; }
        }

        /* Tablet: narrower left panel */
        @media (min-width: 769px) and (max-width: 1024px) {
          .onb-left  { width: 44% !important; flex-shrink: 0; }
        }
      `}</style>
    </div>
  );
}
