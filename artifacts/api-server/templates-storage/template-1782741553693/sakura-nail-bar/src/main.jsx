import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

const SLUG = (typeof window !== 'undefined' && window.__CERTXA_SLUG__) || null;
const API_BASE = (typeof window !== 'undefined' && window.__CERTXA_API_BASE__) || '';

const PLACEHOLDER = {
  business: { name: 'Sakura Nail Bar', address: '12 Garden Court', phone: '(555) 234-5678', email: 'hello@sakuranailbar.com', city: 'San Francisco', state: 'CA', booking_slug: null },
  hours: [
    { day_of_week: 0, open_time: '10:00', close_time: '17:00', is_closed: false },
    { day_of_week: 1, open_time: '09:30', close_time: '19:30', is_closed: false },
    { day_of_week: 2, open_time: '09:30', close_time: '19:30', is_closed: false },
    { day_of_week: 3, open_time: '09:30', close_time: '19:30', is_closed: false },
    { day_of_week: 4, open_time: '09:30', close_time: '19:30', is_closed: false },
    { day_of_week: 5, open_time: '09:00', close_time: '20:00', is_closed: false },
    { day_of_week: 6, open_time: '10:00', close_time: '18:00', is_closed: false },
  ],
  services: [
    { id: 1, name: 'Sakura Gel Manicure', price: '55', duration: 60, category_id: 1 },
    { id: 2, name: 'Zen Dip Powder', price: '62', duration: 70, category_id: 1 },
    { id: 3, name: 'Blossom Nail Art', price: '35', duration: 45, category_id: 1 },
    { id: 4, name: 'Tranquil Pedicure', price: '68', duration: 75, category_id: 2 },
    { id: 5, name: 'Garden Spa Pedicure', price: '85', duration: 90, category_id: 2 },
    { id: 6, name: 'Minimalist Nail Set', price: '70', duration: 80, category_id: 1 },
  ],
  serviceCategories: [{ id: 1, name: 'Nail Care' }, { id: 2, name: 'Spa' }],
  staff: [
    { id: 1, name: 'Yuki Tanaka', role: 'Lead Nail Artist', avatar_url: null, bio: 'Specializing in delicate Japanese nail art and minimalist designs.' },
    { id: 2, name: 'Hana Mori', role: 'Senior Technician', avatar_url: null, bio: 'Expert in gel techniques and precision nail shaping.' },
    { id: 3, name: 'Aoi Sato', role: 'Spa Specialist', avatar_url: null, bio: 'Certified in traditional Japanese hand and foot care rituals.' },
  ],
  reviews: [
    { customer_name: 'Olivia W.', rating: 5, comment: 'The most serene nail experience I have ever had. The attention to detail is extraordinary.', created_at: null },
    { customer_name: 'Priya M.', rating: 5, comment: 'Yuki created the most beautiful cherry blossom nail art. I get compliments everywhere I go.', created_at: null },
    { customer_name: 'Emma R.', rating: 5, comment: 'Such a peaceful atmosphere. This is my favourite place to unwind and treat myself.', created_at: null },
  ],
};

function useSiteData() {
  const [data, setData] = useState(PLACEHOLDER);
  useEffect(() => {
    if (!SLUG) return;
    fetch(`${API_BASE}/api/tenant/${SLUG}/data`).then(r => r.ok ? r.json() : null).then(d => { if (d?.business) setData(d); }).catch(() => {});
  }, []);
  return data;
}

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const fmt = t => { if(!t) return ''; const [h,m] = t.split(':').map(Number); return `${h%12||12}:${m.toString().padStart(2,'0')} ${h>=12?'PM':'AM'}`; };
const fmtP = p => { const n = parseFloat(String(p)); return isNaN(n) ? String(p) : `$${n%1===0?n:n.toFixed(2)}`; };

function Avatar({ name, size = 80 }) {
  const initials = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  return <div style={{ width:size, height:size, borderRadius:'50%', background:'#E8C4CC', display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.3, fontWeight:600, color:'#2D1B1E', fontFamily:'Poppins,sans-serif' }}>{initials}</div>;
}

function BookingPanel({ open, onClose, slug }) {
  const url = slug ? `/book/${slug}` : null;
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(45,27,30,0.3)', zIndex:9998, opacity:open?1:0, pointerEvents:open?'auto':'none', transition:'opacity 0.35s', backdropFilter:'blur(8px)' }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:'min(460px,100vw)', background:'#FAF0F1', zIndex:9999, display:'flex', flexDirection:'column', transform:open?'translateX(0)':'translateX(100%)', transition:'transform 0.4s cubic-bezier(0.22,1,0.36,1)', boxShadow:'-20px 0 60px rgba(212,132,154,0.15)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'28px 32px', borderBottom:'1px solid #F0DADE' }}>
          <div>
            <p style={{ color:'#D4849A', fontSize:10, fontWeight:500, letterSpacing:'0.2em', textTransform:'uppercase', margin:0, fontFamily:'Poppins,sans-serif' }}>Reserve</p>
            <p style={{ color:'#2D1B1E', fontSize:22, fontWeight:300, margin:'6px 0 0', fontFamily:'Cormorant,serif', letterSpacing:'-0.01em' }}>Book an Appointment</p>
          </div>
          <button onClick={onClose} style={{ background:'#F0DADE', border:'none', color:'#2D1B1E', width:38, height:38, borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ flex:1, overflow:'hidden' }}>
          {url ? <iframe src={url} style={{ width:'100%', height:'100%', border:'none' }} title="Book" /> : (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', textAlign:'center', padding:40, fontFamily:'Poppins,sans-serif' }}>
              <div style={{ fontSize:48, marginBottom:20 }}>🌸</div>
              <p style={{ fontFamily:'Cormorant,serif', fontSize:24, color:'#2D1B1E', margin:'0 0 10px' }}>Online Booking</p>
              <p style={{ color:'#8B7355', fontSize:15, lineHeight:1.6 }}>Call us to schedule your visit. We look forward to seeing you.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function App() {
  const data = useSiteData();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const slug = SLUG || data.business?.booking_slug || null;
  useEffect(() => { const s = () => setScrolled(window.scrollY>40); window.addEventListener('scroll',s,{passive:true}); return ()=>window.removeEventListener('scroll',s); },[]);

  const b = data.business || {};
  const name = b.name || 'Sakura Nail Bar';
  const addr = [b.address,b.city,b.state].filter(Boolean).join(', ');
  const cats = {}; (data.serviceCategories||[]).forEach(c=>{cats[c.id]={name:c.name,items:[]}}); const unc={name:'Services',items:[]};
  (data.services||[]).forEach(s=>{ if(s.category_id&&cats[s.category_id]) cats[s.category_id].items.push(s); else unc.items.push(s); });
  const categories = [...Object.values(cats).filter(c=>c.items.length), ...(unc.items.length?[unc]:[])];

  return (
    <div style={{ fontFamily:'Poppins,sans-serif', background:'#FAF0F1', color:'#2D1B1E', minHeight:'100vh' }}>
      {/* Nav */}
      <header style={{ position:'fixed', top:0, left:0, right:0, zIndex:100, background:scrolled?'rgba(250,240,241,0.97)':'transparent', borderBottom:scrolled?'1px solid #F0DADE':'none', transition:'all 0.3s', backdropFilter:scrolled?'blur(10px)':'none' }}>
        <div style={{ maxWidth:1100, margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between', height:68, padding:'0 40px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:20 }}>🌸</span>
            <span style={{ fontFamily:'Cormorant,serif', fontSize:22, fontWeight:300, letterSpacing:'0.05em' }}>{name}</span>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {['Services','Team','Reviews','Contact'].map(i=>(
              <a key={i} href={`#${i.toLowerCase()}`} style={{ color:'#8B7355', textDecoration:'none', fontSize:12, fontWeight:500, letterSpacing:'0.08em', padding:'6px 12px', transition:'color 0.2s' }}
                onMouseEnter={e=>e.target.style.color='#D4849A'} onMouseLeave={e=>e.target.style.color='#8B7355'}>{i}</a>
            ))}
            <button onClick={()=>setOpen(true)} style={{ background:'#D4849A', color:'#fff', border:'none', borderRadius:50, padding:'10px 24px', fontSize:12, fontWeight:500, cursor:'pointer', letterSpacing:'0.08em', marginLeft:8 }}>Reserve</button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section style={{ position:'relative', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, backgroundImage:'url("https://images.unsplash.com/photo-1610992015732-2449b0e5a34d?auto=format&fit=crop&w=1920&q=80")', backgroundSize:'cover', backgroundPosition:'center', filter:'brightness(0.92) saturate(0.8)' }} />
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(180deg, rgba(250,240,241,0.5) 0%, rgba(250,240,241,0.85) 100%)' }} />
        <div style={{ position:'relative', textAlign:'center', padding:'0 32px', maxWidth:720 }}>
          <div style={{ display:'flex', justifyContent:'center', gap:6, marginBottom:28 }}>
            {['✿','✿','✿'].map((s,i)=><span key={i} style={{ color:'#D4849A', fontSize:10, opacity:0.5+i*0.25 }}>{s}</span>)}
          </div>
          <p style={{ color:'#D4849A', fontSize:11, fontWeight:500, letterSpacing:'0.3em', textTransform:'uppercase', margin:'0 0 20px', fontFamily:'Poppins,sans-serif' }}>A Serene Nail Experience</p>
          <h1 style={{ fontFamily:'Cormorant,serif', fontSize:'clamp(52px,7vw,96px)', fontWeight:300, lineHeight:1.05, margin:'0 0 24px', color:'#2D1B1E', letterSpacing:'-0.02em' }}>
            Beauty in<br /><em style={{ fontStyle:'italic', color:'#D4849A' }}>Every Detail</em>
          </h1>
          <p style={{ color:'#8B7355', fontSize:16, lineHeight:1.8, margin:'0 0 48px', fontWeight:300, maxWidth:480, marginLeft:'auto', marginRight:'auto' }}>
            A tranquil sanctuary where artistry meets mindfulness. We create nail experiences as delicate and refined as cherry blossoms.
          </p>
          <div style={{ display:'flex', gap:14, justifyContent:'center', flexWrap:'wrap' }}>
            <button onClick={()=>setOpen(true)} style={{ background:'#2D1B1E', color:'#FAF0F1', border:'none', borderRadius:50, padding:'15px 40px', fontSize:13, fontWeight:500, cursor:'pointer', letterSpacing:'0.08em' }}>Book an Appointment</button>
            <a href="#services" style={{ display:'inline-flex', alignItems:'center', gap:8, color:'#8B7355', textDecoration:'none', fontSize:13, fontWeight:500, background:'rgba(139,115,85,0.08)', border:'1px solid rgba(139,115,85,0.2)', borderRadius:50, padding:'15px 32px', letterSpacing:'0.05em' }}>
              Our Services
            </a>
          </div>
        </div>
        <div style={{ position:'absolute', bottom:32, left:'50%', transform:'translateX(-50%)', display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
          <span style={{ color:'#D4849A', fontSize:11, letterSpacing:'0.15em', textTransform:'uppercase' }}>Scroll</span>
          <div style={{ width:1, height:40, background:'linear-gradient(to bottom,#D4849A,transparent)' }} />
        </div>
      </section>

      {/* Services */}
      <section id="services" style={{ padding:'100px 40px', background:'#fff' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:64 }}>
            <div style={{ display:'flex', justifyContent:'center', gap:8, marginBottom:16 }}>{['✦','✦','✦'].map((s,i)=><span key={i} style={{ color:'#D4849A', fontSize:8 }}>{s}</span>)}</div>
            <h2 style={{ fontFamily:'Cormorant,serif', fontSize:'clamp(36px,4vw,56px)', fontWeight:300, margin:'0 0 12px', color:'#2D1B1E' }}>Our Menu</h2>
            <p style={{ color:'#8B7355', fontSize:15, margin:0, fontWeight:300 }}>Crafted with precision, delivered with care.</p>
          </div>
          {categories.map((cat,ci)=>(
            <div key={ci} style={{ marginBottom:48 }}>
              <div style={{ display:'flex', alignItems:'center', gap:20, marginBottom:20 }}>
                <div style={{ width:40, height:1, background:'#E8C4CC' }} />
                <p style={{ color:'#D4849A', fontSize:10, fontWeight:600, letterSpacing:'0.25em', textTransform:'uppercase', margin:0 }}>{cat.name}</p>
                <div style={{ flex:1, height:1, background:'#E8C4CC' }} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:1 }}>
                {cat.items.map((svc,i)=>(
                  <div key={svc.id||i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'20px 24px', background:i%2===0?'#FAF0F1':'#fff', borderRadius:12, gap:16 }}>
                    <div>
                      <p style={{ fontFamily:'Cormorant,serif', fontSize:19, fontWeight:400, margin:'0 0 4px', color:'#2D1B1E' }}>{svc.name}</p>
                      {svc.duration&&<p style={{ color:'#8B7355', fontSize:12, margin:0, fontWeight:300 }}>{svc.duration} minutes</p>}
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <p style={{ fontFamily:'Cormorant,serif', fontSize:22, fontWeight:400, color:'#D4849A', margin:'0 0 8px' }}>{fmtP(svc.price)}</p>
                      <button onClick={()=>setOpen(true)} style={{ background:'none', border:'1px solid #E8C4CC', color:'#D4849A', borderRadius:50, padding:'4px 14px', fontSize:11, cursor:'pointer', fontFamily:'Poppins,sans-serif' }}>Book</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ textAlign:'center', marginTop:40 }}>
            <button onClick={()=>setOpen(true)} style={{ background:'#D4849A', color:'#fff', border:'none', borderRadius:50, padding:'15px 44px', fontSize:13, fontWeight:500, cursor:'pointer', letterSpacing:'0.08em' }}>Book an Appointment</button>
          </div>
        </div>
      </section>

      {/* Team */}
      {(data.staff||[]).length>0&&(
        <section id="team" style={{ padding:'100px 40px', background:'#FAF0F1' }}>
          <div style={{ maxWidth:1100, margin:'0 auto' }}>
            <div style={{ textAlign:'center', marginBottom:60 }}>
              <h2 style={{ fontFamily:'Cormorant,serif', fontSize:'clamp(36px,4vw,56px)', fontWeight:300, margin:'0 0 12px', color:'#2D1B1E' }}>Our Artists</h2>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:24 }}>
              {(data.staff||[]).map((m,i)=>(
                <div key={m.id||i} style={{ background:'#fff', borderRadius:20, padding:'40px 28px', textAlign:'center', boxShadow:'0 2px 20px rgba(212,132,154,0.08)' }}>
                  <div style={{ display:'flex', justifyContent:'center', marginBottom:20 }}>
                    <div style={{ position:'relative' }}>
                      <div style={{ position:'absolute', inset:-3, borderRadius:'50%', background:'linear-gradient(135deg,#E8C4CC,#D4849A)' }} />
                      <div style={{ position:'relative', zIndex:1 }}><Avatar name={m.name} size={88} /></div>
                    </div>
                  </div>
                  <h3 style={{ fontFamily:'Cormorant,serif', fontSize:22, fontWeight:400, margin:'0 0 4px', color:'#2D1B1E' }}>{m.name}</h3>
                  {m.role&&<p style={{ color:'#D4849A', fontSize:11, fontWeight:500, letterSpacing:'0.1em', textTransform:'uppercase', margin:'0 0 14px' }}>{m.role}</p>}
                  {m.bio&&<p style={{ color:'#8B7355', fontSize:14, lineHeight:1.7, margin:'0 0 20px' }}>{m.bio}</p>}
                  <button onClick={()=>setOpen(true)} style={{ background:'#FAF0F1', border:'1px solid #E8C4CC', color:'#D4849A', borderRadius:50, padding:'8px 22px', fontSize:12, cursor:'pointer' }}>
                    Book with {m.name.split(' ')[0]}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Reviews */}
      {(data.reviews||[]).length>0&&(
        <section id="reviews" style={{ padding:'100px 40px', background:'#fff' }}>
          <div style={{ maxWidth:1100, margin:'0 auto' }}>
            <div style={{ textAlign:'center', marginBottom:60 }}>
              <h2 style={{ fontFamily:'Cormorant,serif', fontSize:'clamp(36px,4vw,56px)', fontWeight:300, margin:'0 0 12px', color:'#2D1B1E' }}>Guest Stories</h2>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:24 }}>
              {(data.reviews||[]).slice(0,6).map((r,i)=>(
                <div key={i} style={{ background:'#FAF0F1', borderRadius:20, padding:'32px 28px' }}>
                  <div style={{ display:'flex', gap:3, marginBottom:16 }}>
                    {[1,2,3,4,5].map(s=><span key={s} style={{ color:s<=r.rating?'#D4849A':'#E8C4CC', fontSize:14 }}>★</span>)}
                  </div>
                  <p style={{ fontFamily:'Cormorant,serif', fontSize:18, fontStyle:'italic', color:'#2D1B1E', lineHeight:1.7, margin:'0 0 20px' }}>"{r.comment}"</p>
                  <p style={{ color:'#D4849A', fontSize:13, fontWeight:500, margin:0 }}>— {r.customer_name}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Contact */}
      <section id="contact" style={{ padding:'100px 40px', background:'#2D1B1E' }}>
        <div style={{ maxWidth:1100, margin:'0 auto', display:'grid', gridTemplateColumns:'1fr 1fr', gap:80, alignItems:'start' }}>
          <div>
            <h2 style={{ fontFamily:'Cormorant,serif', fontSize:'clamp(36px,4vw,52px)', fontWeight:300, margin:'0 0 32px', color:'#FAF0F1' }}>Visit Us</h2>
            {addr&&<p style={{ color:'rgba(255,255,255,0.55)', fontSize:15, lineHeight:1.7, margin:'0 0 12px' }}>{addr}</p>}
            {b.phone&&<p style={{ margin:'0 0 6px' }}><a href={`tel:${b.phone}`} style={{ color:'#D4849A', textDecoration:'none', fontSize:15 }}>{b.phone}</a></p>}
            {b.email&&<p style={{ margin:'0 0 32px' }}><a href={`mailto:${b.email}`} style={{ color:'#D4849A', textDecoration:'none', fontSize:15 }}>{b.email}</a></p>}
            <button onClick={()=>setOpen(true)} style={{ background:'#D4849A', color:'#fff', border:'none', borderRadius:50, padding:'15px 40px', fontSize:13, fontWeight:500, cursor:'pointer' }}>Book an Appointment</button>
          </div>
          <div>
            <p style={{ color:'rgba(255,255,255,0.35)', fontSize:10, fontWeight:600, letterSpacing:'0.25em', textTransform:'uppercase', margin:'0 0 24px' }}>Hours</p>
            {(data.hours||[]).map((h,i)=>(
              <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'13px 0', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ color:h.is_closed?'rgba(255,255,255,0.2)':'rgba(255,255,255,0.6)', fontSize:14 }}>{DAYS[h.day_of_week]}</span>
                <span style={{ color:h.is_closed?'rgba(255,255,255,0.15)':'#D4849A', fontSize:14 }}>{h.is_closed?'Closed':`${fmt(h.open_time)} – ${fmt(h.close_time)}`}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background:'#1A0E10', borderTop:'1px solid rgba(255,255,255,0.04)', padding:'32px 40px' }}>
        <div style={{ maxWidth:1100, margin:'0 auto', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:16 }}>🌸</span>
            <span style={{ fontFamily:'Cormorant,serif', fontSize:18, fontWeight:300, color:'rgba(255,255,255,0.7)' }}>{name}</span>
          </div>
          <p style={{ color:'rgba(255,255,255,0.2)', fontSize:12, margin:0 }}>© {new Date().getFullYear()} {name}</p>
          <button onClick={()=>setOpen(true)} style={{ background:'transparent', border:'1px solid rgba(212,132,154,0.4)', color:'#D4849A', borderRadius:50, padding:'8px 20px', fontSize:12, cursor:'pointer' }}>Reserve</button>
        </div>
      </footer>

      <BookingPanel open={open} onClose={()=>setOpen(false)} slug={slug} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
