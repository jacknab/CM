import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

const SLUG=(typeof window!=='undefined'&&window.__CERTXA_SLUG__)||null;
const API_BASE=(typeof window!=='undefined'&&window.__CERTXA_API_BASE__)||'';

const PLACEHOLDER={
  business:{name:'Luxe Atelier',address:'21 Rue du Prestige',phone:'(555) 456-7890',email:'bonjour@luxeatelier.com',city:'New York',state:'NY',booking_slug:null},
  hours:[
    {day_of_week:0,open_time:'11:00',close_time:'17:00',is_closed:false},
    {day_of_week:1,open_time:'10:00',close_time:'19:00',is_closed:false},
    {day_of_week:2,open_time:'10:00',close_time:'19:00',is_closed:false},
    {day_of_week:3,open_time:'10:00',close_time:'19:00',is_closed:false},
    {day_of_week:4,open_time:'10:00',close_time:'20:00',is_closed:false},
    {day_of_week:5,open_time:'09:00',close_time:'20:00',is_closed:false},
    {day_of_week:6,open_time:'10:00',close_time:'18:00',is_closed:false},
  ],
  services:[
    {id:1,name:'Atelier Gel Manicure',price:'75',duration:70,category_id:1},
    {id:2,name:'Couture Nail Art',price:'55',duration:60,category_id:1},
    {id:3,name:'Prestige Acrylic Set',price:'110',duration:110,category_id:1},
    {id:4,name:'Champagne Pedicure',price:'90',duration:85,category_id:2},
    {id:5,name:'French Polish',price:'50',duration:50,category_id:1},
    {id:6,name:'Signature Spa Ritual',price:'130',duration:120,category_id:2},
  ],
  serviceCategories:[{id:1,name:'Manicure'},{id:2,name:'Pedicure & Rituals'}],
  staff:[
    {id:1,name:'Celeste Dubois',role:'Artistic Director',avatar_url:null,bio:'Trained in Paris with 15 years crafting couture nail art for fashion week.'},
    {id:2,name:'Margot Renard',role:'Senior Nail Artist',avatar_url:null,bio:'Specialist in classic French techniques and modern luxury finishes.'},
    {id:3,name:'Elise Fontaine',role:'Spa Ritualist',avatar_url:null,bio:'Expert in European hand and foot care and bespoke spa treatments.'},
  ],
  reviews:[
    {customer_name:'Sophie H.',rating:5,comment:'Celeste is a true artist. My nails look like something from a Parisian runway. Absolutely impeccable.',created_at:null},
    {customer_name:'Claire B.',rating:5,comment:'The most refined nail experience in the city. Every detail is considered. I will never go anywhere else.',created_at:null},
    {customer_name:'Adrienne L.',rating:5,comment:'Luxe Atelier lives up to every word of its name. A flawless experience from start to finish.',created_at:null},
  ],
};

function useSiteData(){
  const[data,setData]=useState(PLACEHOLDER);
  useEffect(()=>{if(!SLUG)return;fetch(`${API_BASE}/api/tenant/${SLUG}/data`).then(r=>r.ok?r.json():null).then(d=>{if(d?.business)setData(d)}).catch(()=>{});},[]);
  return data;
}

const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const fmt=t=>{if(!t)return'';const[h,m]=t.split(':').map(Number);return`${h%12||12}:${m.toString().padStart(2,'0')} ${h>=12?'PM':'AM'}`};
const fmtP=p=>{const n=parseFloat(String(p));return isNaN(n)?String(p):`$${n%1===0?n:n.toFixed(2)}`};

function Avatar({name,size=80}){
  const init=name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  return<div style={{width:size,height:size,borderRadius:'50%',background:'#E8DCC8',display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.3,fontWeight:400,color:'#2C2C2C',fontFamily:'Raleway,sans-serif'}}>{init}</div>;
}

function BookingPanel({open,onClose,slug}){
  const url=slug?`/book/${slug}`:null;
  return(
    <>
      <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(44,44,44,0.4)',zIndex:9998,opacity:open?1:0,pointerEvents:open?'auto':'none',transition:'opacity 0.3s',backdropFilter:'blur(8px)'}}/>
      <div style={{position:'fixed',top:0,right:0,bottom:0,width:'min(480px,100vw)',background:'#F5F0E8',zIndex:9999,display:'flex',flexDirection:'column',transform:open?'translateX(0)':'translateX(100%)',transition:'transform 0.4s cubic-bezier(0.22,1,0.36,1)',boxShadow:'-20px 0 60px rgba(44,44,44,0.15)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'28px 32px',borderBottom:'1px solid #E2D6C0'}}>
          <div>
            <p style={{color:'#C4A95A',fontSize:9,fontWeight:700,letterSpacing:'0.25em',textTransform:'uppercase',margin:0,fontFamily:'Raleway,sans-serif'}}>Réservation</p>
            <p style={{fontFamily:'Libre Baskerville,serif',fontSize:22,fontWeight:400,color:'#2C2C2C',margin:'6px 0 0'}}>Book Your Appointment</p>
          </div>
          <button onClick={onClose} style={{background:'#E2D6C0',border:'none',color:'#2C2C2C',width:36,height:36,borderRadius:'50%',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{flex:1,overflow:'hidden'}}>
          {url?<iframe src={url} style={{width:'100%',height:'100%',border:'none'}} title="Book"/>:(
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',padding:40,textAlign:'center',fontFamily:'Raleway,sans-serif'}}>
              <p style={{fontFamily:'Libre Baskerville,serif',fontSize:22,color:'#2C2C2C',margin:'0 0 12px'}}>Reserve</p>
              <p style={{color:'#8B7355',fontSize:15,lineHeight:1.6}}>Contact us to book your atelier experience.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function App(){
  const data=useSiteData();
  const[open,setOpen]=useState(false);
  const[scrolled,setScrolled]=useState(false);
  const slug=SLUG||data.business?.booking_slug||null;
  useEffect(()=>{const s=()=>setScrolled(window.scrollY>50);window.addEventListener('scroll',s,{passive:true});return()=>window.removeEventListener('scroll',s)},[]);
  const b=data.business||{};
  const salName=b.name||'Luxe Atelier';
  const addr=[b.address,b.city,b.state].filter(Boolean).join(', ');
  const cats={};(data.serviceCategories||[]).forEach(c=>{cats[c.id]={name:c.name,items:[]}});const unc={name:'Services',items:[]};
  (data.services||[]).forEach(s=>{if(s.category_id&&cats[s.category_id])cats[s.category_id].items.push(s);else unc.items.push(s)});
  const categories=[...Object.values(cats).filter(c=>c.items.length),...(unc.items.length?[unc]:[])];

  return(
    <div style={{fontFamily:'Raleway,sans-serif',background:'#F5F0E8',color:'#2C2C2C',minHeight:'100vh'}}>
      {/* Thin top bar */}
      <div style={{height:2,background:'linear-gradient(90deg,#C4A95A,#E2CFA0,#C4A95A)'}}/>

      {/* Nav */}
      <header style={{position:'sticky',top:0,zIndex:100,background:scrolled?'rgba(245,240,232,0.97)':'#F5F0E8',borderBottom:'1px solid #E2D6C0',transition:'background 0.3s',backdropFilter:scrolled?'blur(8px)':'none'}}>
        <div style={{maxWidth:1200,margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'space-between',height:72,padding:'0 48px'}}>
          <div>
            <p style={{fontFamily:'Libre Baskerville,serif',fontSize:20,fontWeight:400,margin:0,letterSpacing:'0.02em',color:'#2C2C2C'}}>{salName}</p>
            <div style={{height:1,background:'#C4A95A',marginTop:3}}/>
          </div>
          <nav style={{display:'flex',alignItems:'center',gap:40}}>
            {['Services','Team','Reviews','Contact'].map(i=>(
              <a key={i} href={`#${i.toLowerCase()}`} style={{color:'#8B7355',textDecoration:'none',fontSize:11,fontWeight:600,letterSpacing:'0.14em',textTransform:'uppercase',transition:'color 0.2s'}}
                onMouseEnter={e=>e.target.style.color='#C4A95A'} onMouseLeave={e=>e.target.style.color='#8B7355'}>{i}</a>
            ))}
            <button onClick={()=>setOpen(true)} style={{background:'#2C2C2C',color:'#F5F0E8',border:'none',padding:'11px 28px',fontSize:11,fontWeight:600,cursor:'pointer',letterSpacing:'0.14em',textTransform:'uppercase'}}>Book</button>
          </nav>
        </div>
      </header>

      {/* Hero — asymmetric split */}
      <section style={{display:'grid',gridTemplateColumns:'55% 45%',minHeight:'92vh'}}>
        <div style={{position:'relative',overflow:'hidden'}}>
          <img src="https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=960&q=80" alt="Luxe salon" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
          <div style={{position:'absolute',inset:0,background:'linear-gradient(to right,rgba(245,240,232,0) 60%,#F5F0E8 100%)'}}/>
          {/* Floating gold frame */}
          <div style={{position:'absolute',top:48,left:48,bottom:48,right:80,border:'1px solid rgba(196,169,90,0.3)',pointerEvents:'none'}}/>
        </div>
        <div style={{display:'flex',alignItems:'center',padding:'80px 60px 80px 40px'}}>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:28}}>
              <div style={{width:32,height:1,background:'#C4A95A'}}/>
              <p style={{color:'#C4A95A',fontSize:10,fontWeight:700,letterSpacing:'0.25em',textTransform:'uppercase',margin:0}}>Paris-Inspired Nail Atelier</p>
            </div>
            <h1 style={{fontFamily:'Libre Baskerville,serif',fontSize:'clamp(40px,4vw,66px)',fontWeight:400,lineHeight:1.15,margin:'0 0 24px',color:'#2C2C2C'}}>
              The Art of<br/><em style={{fontStyle:'italic',color:'#C4A95A'}}>Impeccable</em><br/>Nails
            </h1>
            <p style={{color:'#8B7355',fontSize:16,lineHeight:1.8,margin:'0 0 40px',fontWeight:300}}>
              A Parisian-inspired sanctuary where every detail is considered, every stroke deliberate, and every visit unforgettable.
            </p>
            <div style={{display:'flex',gap:14,flexWrap:'wrap',marginBottom:40}}>
              <button onClick={()=>setOpen(true)} style={{background:'#2C2C2C',color:'#F5F0E8',border:'none',padding:'15px 36px',fontSize:12,fontWeight:600,cursor:'pointer',letterSpacing:'0.1em',textTransform:'uppercase'}}>Book Appointment</button>
              <a href="#services" style={{display:'inline-flex',alignItems:'center',gap:8,color:'#C4A95A',textDecoration:'none',fontSize:12,fontWeight:600,background:'transparent',border:'1px solid #C4A95A',padding:'15px 28px',letterSpacing:'0.1em',textTransform:'uppercase'}}>Services</a>
            </div>
            <div style={{display:'flex',gap:32}}>
              {[{n:'15+',l:'Years'},{ n:'5★',l:'Rating'},{n:'3K+',l:'Clients'}].map(({n,l})=>(
                <div key={l}>
                  <p style={{fontFamily:'Libre Baskerville,serif',fontSize:28,fontWeight:400,color:'#C4A95A',margin:'0 0 2px'}}>{n}</p>
                  <p style={{color:'#8B7355',fontSize:11,margin:0,fontWeight:500,letterSpacing:'0.1em',textTransform:'uppercase'}}>{l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Services — numbered editorial */}
      <section id="services" style={{padding:'100px 48px',background:'#2C2C2C'}}>
        <div style={{maxWidth:1200,margin:'0 auto'}}>
          <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',marginBottom:60}}>
            <div>
              <p style={{color:'#C4A95A',fontSize:10,fontWeight:700,letterSpacing:'0.25em',textTransform:'uppercase',margin:'0 0 12px'}}>Menu</p>
              <h2 style={{fontFamily:'Libre Baskerville,serif',fontSize:'clamp(36px,4vw,56px)',fontWeight:400,margin:0,color:'#F5F0E8'}}>Services</h2>
            </div>
            <button onClick={()=>setOpen(true)} style={{background:'transparent',border:'1px solid rgba(196,169,90,0.4)',color:'#C4A95A',padding:'12px 28px',fontSize:11,fontWeight:600,cursor:'pointer',letterSpacing:'0.1em',textTransform:'uppercase'}}>Reserve</button>
          </div>
          {categories.map((cat,ci)=>(
            <div key={ci} style={{marginBottom:48}}>
              <p style={{color:'rgba(245,240,232,0.35)',fontSize:9,fontWeight:700,letterSpacing:'0.25em',textTransform:'uppercase',margin:'0 0 0',paddingBottom:16,borderBottom:'1px solid rgba(196,169,90,0.2)'}}>{cat.name}</p>
              {cat.items.map((svc,i)=>(
                <div key={svc.id||i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'22px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:24}}>
                    <span style={{fontFamily:'Libre Baskerville,serif',fontSize:13,color:'rgba(196,169,90,0.5)',fontStyle:'italic',minWidth:28}}>0{i+1}</span>
                    <div>
                      <p style={{fontFamily:'Libre Baskerville,serif',fontSize:18,fontWeight:400,margin:'0 0 4px',color:'#F5F0E8'}}>{svc.name}</p>
                      {svc.duration&&<p style={{color:'rgba(245,240,232,0.3)',fontSize:12,margin:0}}>{svc.duration} min</p>}
                    </div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:20}}>
                    <span style={{fontFamily:'Libre Baskerville,serif',fontSize:22,fontWeight:400,color:'#C4A95A'}}>{fmtP(svc.price)}</span>
                    <button onClick={()=>setOpen(true)} style={{background:'transparent',border:'1px solid rgba(196,169,90,0.3)',color:'#C4A95A',padding:'7px 18px',fontSize:11,fontWeight:600,cursor:'pointer',letterSpacing:'0.1em',textTransform:'uppercase'}}>Book</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Team */}
      {(data.staff||[]).length>0&&(
        <section id="team" style={{padding:'100px 48px',background:'#F5F0E8'}}>
          <div style={{maxWidth:1200,margin:'0 auto'}}>
            <div style={{marginBottom:60}}>
              <p style={{color:'#C4A95A',fontSize:10,fontWeight:700,letterSpacing:'0.25em',textTransform:'uppercase',margin:'0 0 12px'}}>The Team</p>
              <h2 style={{fontFamily:'Libre Baskerville,serif',fontSize:'clamp(32px,4vw,52px)',fontWeight:400,margin:0,color:'#2C2C2C'}}>Our Artists</h2>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:2}}>
              {(data.staff||[]).map((m,i)=>(
                <div key={m.id||i} style={{background:'#fff',padding:'44px 36px',borderLeft:'3px solid #C4A95A'}}>
                  <div style={{marginBottom:24}}><Avatar name={m.name} size={80}/></div>
                  <h3 style={{fontFamily:'Libre Baskerville,serif',fontSize:22,fontWeight:400,margin:'0 0 4px',color:'#2C2C2C'}}>{m.name}</h3>
                  {m.role&&<p style={{color:'#C4A95A',fontSize:10,fontWeight:700,letterSpacing:'0.15em',textTransform:'uppercase',margin:'0 0 16px'}}>{m.role}</p>}
                  {m.bio&&<p style={{color:'#8B7355',fontSize:14,lineHeight:1.7,margin:'0 0 24px'}}>{m.bio}</p>}
                  <button onClick={()=>setOpen(true)} style={{background:'transparent',border:'1px solid #C4A95A',color:'#C4A95A',padding:'8px 22px',fontSize:11,fontWeight:600,cursor:'pointer',letterSpacing:'0.1em',textTransform:'uppercase'}}>Book</button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Reviews */}
      {(data.reviews||[]).length>0&&(
        <section id="reviews" style={{padding:'100px 48px',background:'#EDE8DC'}}>
          <div style={{maxWidth:1200,margin:'0 auto'}}>
            <div style={{textAlign:'center',marginBottom:60}}>
              <h2 style={{fontFamily:'Libre Baskerville,serif',fontSize:'clamp(32px,4vw,52px)',fontWeight:400,margin:0,color:'#2C2C2C'}}>What Our Clients Say</h2>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:24}}>
              {(data.reviews||[]).slice(0,6).map((r,i)=>(
                <div key={i} style={{background:'#F5F0E8',padding:'32px',borderTop:'2px solid #C4A95A'}}>
                  <div style={{display:'flex',gap:3,marginBottom:16}}>{[1,2,3,4,5].map(s=><span key={s} style={{color:s<=r.rating?'#C4A95A':'#E2D6C0',fontSize:14}}>★</span>)}</div>
                  <p style={{fontFamily:'Libre Baskerville,serif',fontSize:17,fontStyle:'italic',color:'#2C2C2C',lineHeight:1.7,margin:'0 0 20px'}}>"{r.comment}"</p>
                  <p style={{color:'#8B7355',fontSize:13,fontWeight:600,margin:0,letterSpacing:'0.05em'}}>{r.customer_name}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Contact */}
      <section id="contact" style={{padding:'100px 48px',background:'#F5F0E8'}}>
        <div style={{maxWidth:1200,margin:'0 auto',display:'grid',gridTemplateColumns:'1fr 1fr',gap:80,alignItems:'start'}}>
          <div>
            <p style={{color:'#C4A95A',fontSize:10,fontWeight:700,letterSpacing:'0.25em',textTransform:'uppercase',margin:'0 0 12px'}}>Directions</p>
            <h2 style={{fontFamily:'Libre Baskerville,serif',fontSize:'clamp(32px,3.5vw,48px)',fontWeight:400,margin:'0 0 28px',color:'#2C2C2C'}}>Visit the Atelier</h2>
            {addr&&<p style={{color:'#8B7355',fontSize:15,lineHeight:1.6,margin:'0 0 10px'}}>{addr}</p>}
            {b.phone&&<p style={{margin:'0 0 6px'}}><a href={`tel:${b.phone}`} style={{color:'#2C2C2C',fontSize:15,textDecoration:'none'}}>{b.phone}</a></p>}
            {b.email&&<p style={{margin:'0 0 36px'}}><a href={`mailto:${b.email}`} style={{color:'#2C2C2C',fontSize:15,textDecoration:'none'}}>{b.email}</a></p>}
            <button onClick={()=>setOpen(true)} style={{background:'#2C2C2C',color:'#F5F0E8',border:'none',padding:'15px 40px',fontSize:11,fontWeight:600,cursor:'pointer',letterSpacing:'0.1em',textTransform:'uppercase'}}>Book Appointment</button>
          </div>
          <div>
            <p style={{color:'#C4A95A',fontSize:10,fontWeight:700,letterSpacing:'0.25em',textTransform:'uppercase',margin:'0 0 20px'}}>Hours</p>
            {(data.hours||[]).map((h,i)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'14px 0',borderBottom:'1px solid #E2D6C0'}}>
                <span style={{color:h.is_closed?'#C9B99A':'#2C2C2C',fontSize:14}}>{DAYS[h.day_of_week]}</span>
                <span style={{color:h.is_closed?'#C9B99A':'#C4A95A',fontSize:14,fontWeight:h.is_closed?400:600}}>{h.is_closed?'Closed':`${fmt(h.open_time)} – ${fmt(h.close_time)}`}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer style={{background:'#2C2C2C',padding:'32px 48px'}}>
        <div style={{maxWidth:1200,margin:'0 auto',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:16}}>
          <p style={{fontFamily:'Libre Baskerville,serif',fontSize:16,fontWeight:400,color:'rgba(245,240,232,0.7)',margin:0}}>{salName}</p>
          <p style={{color:'rgba(255,255,255,0.2)',fontSize:12,margin:0}}>© {new Date().getFullYear()} {salName}</p>
          <button onClick={()=>setOpen(true)} style={{background:'transparent',border:'1px solid rgba(196,169,90,0.4)',color:'#C4A95A',padding:'8px 22px',fontSize:11,fontWeight:600,cursor:'pointer',letterSpacing:'0.1em',textTransform:'uppercase'}}>Reserve</button>
        </div>
      </footer>

      <BookingPanel open={open} onClose={()=>setOpen(false)} slug={slug}/>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App/>);
