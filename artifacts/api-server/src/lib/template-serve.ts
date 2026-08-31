import path from "path";
import fs from "fs";
import type { Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, templatesTable, websitesTable } from "@workspace/db";
import type { ContentField } from "./content-extractor";
import { logger } from "./logger";
import type { TenantData } from "./tenant-data";
import { buildTenantSeo, type TenantSeoMeta, type TenantSeoOverrides } from "./tenant-seo";

// ── Shared path helpers ───────────────────────────────────────────────────────

export function findProjectDir(templateDir: string, depth = 0): string {
  // If this directory has a package.json, it IS the project dir
  if (fs.existsSync(path.join(templateDir, "package.json"))) {
    return templateDir;
  }
  // Recurse up to 4 levels deep: some zips wrap with extra subdirectories
  if (depth < 4) {
    const entries = fs.readdirSync(templateDir).filter((e) => e !== "__MACOSX" && e !== "node_modules");
    if (entries.length === 1) {
      const candidate = path.join(templateDir, entries[0]);
      if (fs.statSync(candidate).isDirectory()) {
        return findProjectDir(candidate, depth + 1);
      }
    }
  }
  return templateDir;
}

export function findDistDir(projectDir: string): string | null {
  for (const d of ["dist", "build", "out", "public", ".output/public"]) {
    const candidate = path.join(projectDir, d);
    if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, "index.html"))) {
      return candidate;
    }
  }
  return null;
}

export const MIME_MAP: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

// ── Block ops type ─────────────────────────────────────────────────────────────

interface BlockOps {
  order: string[];
  deleted: string[];
}

// ── Color ops type ─────────────────────────────────────────────────────────────

interface ColorOps {
  primary?: string;
  background?: string;
  text?: string;
}

// ── Visual editor injection script ────────────────────────────────────────────
// Injected when ?editor=1. Block editor + inline text editing via postMessage.

function buildEditorScript(fields: ContentField[], blockOps?: BlockOps): string {
  const json = JSON.stringify(
    fields.map((f) => ({ id: f.id, label: f.label, original: f.original, current: f.current }))
  );
  const opsJson = JSON.stringify(blockOps ?? { order: [], deleted: [] });

  return `<script>
(function(){
'use strict';
// ── Editor-only: hide footer elements to keep editor UI clean ───────────────
try{
  var HIDE_FOOTER_SELECTORS = ['footer','[role="contentinfo"]','.footer','#footer','.site-footer'];
  function hideCertxaFooter(){
    try{ HIDE_FOOTER_SELECTORS.forEach(function(s){
      Array.prototype.forEach.call(document.querySelectorAll(s), function(el){ if(el && el.style) el.style.display='none'; });
    }); }catch(e){}
  }
  hideCertxaFooter();
  var __cxa_footer_obs = new MutationObserver(function(){ hideCertxaFooter(); });
  __cxa_footer_obs.observe(document.documentElement || document.body, { childList: true, subtree: true, attributes: true });
}catch(e){}
// ── Config ───────────────────────────────────────────────────────────────────
var FIELDS=${json};
var BLOCK_OPS=${opsJson};

// ── Text-editor state ─────────────────────────────────────────────────────────
var labelEl=null,inited=false,initTimer=null,captureReady=false,autoIdx=0,textJustClicked=false;
var editBar=null,activeEditEl=null;
var SKIP_TAGS={script:1,style:1,noscript:1,head:1,svg:1,path:1,iframe:1,code:1,pre:1,textarea:1,input:1,select:1};

// ── Block-editor state ────────────────────────────────────────────────────────
var allBlocks=[],blockContainer=null,selectedBlock=null,hoveredBlock=null,blockToolbar=null,dupCounter=0,insBtns=[];

// ── Image-editor state ────────────────────────────────────────────────────────
var editorMode='text',hoveredImg=null;

// ── Touch detection ──────────────────────────────────────────────────────────
// (hover: none) rather than UA-sniffing so hybrid touch-laptops keep mouse
// behavior. Gates discovery affordances that only make sense without hover:
// persistent (not hover-only) outlines, bigger tap targets, and the edit bar.
var IS_TOUCH=false;
try{ IS_TOUCH=window.matchMedia('(hover: none)').matches; }catch(e){}

// ─────────────────────────────────────────────────────────────────────────────
// TEXT EDITING HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function buildMap(){
  var m={};
  FIELDS.forEach(function(f){
    if(f.original&&f.original.trim().length>1) m[f.original.trim()]=f;
    if(f.current&&f.current.trim().length>1&&f.current!==f.original) m[f.current.trim()]=f;
  });
  return m;
}
function showLabel(el,text){
  if(!labelEl){
    labelEl=document.createElement('div');
    labelEl.setAttribute('data-cxa-tip','1');
    labelEl.style.cssText='position:fixed;z-index:2147483647;background:#1A0333;color:#e2c8ff;font-size:10px;font-weight:600;letter-spacing:.05em;padding:3px 8px;border-radius:5px;pointer-events:none;font-family:system-ui,sans-serif;white-space:nowrap;border:1px solid #3B0764;box-shadow:0 4px 12px rgba(0,0,0,.5);opacity:0;transition:opacity .1s';
    document.body.appendChild(labelEl);
  }
  labelEl.textContent=text;
  var r=el.getBoundingClientRect();
  var top=r.top-28; if(top<4)top=r.bottom+4;
  labelEl.style.top=top+'px';
  labelEl.style.left=Math.max(4,r.left)+'px';
  labelEl.style.display='block';
  requestAnimationFrame(function(){if(labelEl)labelEl.style.opacity='1';});
}
function hideLabel(){if(labelEl){labelEl.style.opacity='0';setTimeout(function(){if(labelEl)labelEl.style.display='none';},100);}}
function activateEdit(el){
  if(el.contentEditable==='true') return;
  hideLabel();
  el.contentEditable='true';
  el.style.outline='2px solid #C97B2B';
  el.style.outlineOffset='4px';
  el.style.borderRadius='3px';
  el.style.cursor='text';
  el.focus();
  try{var r=document.createRange(),s=window.getSelection();r.selectNodeContents(el);r.collapse(false);if(s){s.removeAllRanges();s.addRange(r);}}catch(ex){}
  // Touch has no Escape key and commits on blur with no visible affordance —
  // show an explicit Done/Cancel bar instead of relying on tap-away.
  if(IS_TOUCH){
    activeEditEl=el;
    if(!editBar) editBar=createEditBar();
    positionEditBar();
  }
}
// ── Touch-only Done/Cancel bar for in-progress text edits ──────────────────
function createEditBar(){
  var b=document.createElement('div');
  b.setAttribute('data-cxa-editbar','1');
  b.style.cssText='position:fixed;z-index:2147483647;display:none;align-items:stretch;font-family:system-ui,sans-serif;pointer-events:auto;height:44px;border-radius:22px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.35);';
  function mk(label,bg,svg,action){
    var btn=document.createElement('button');
    btn.style.cssText='background:'+bg+';border:none;color:#fff;cursor:pointer;padding:0 18px;display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;font-family:system-ui,sans-serif;';
    btn.innerHTML='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">'+svg+'</svg><span>'+label+'</span>';
    // mousedown/touchstart + preventDefault — NOT click. A click on this
    // button would fire after the field already blurred (native focus-loss
    // happens on pointerdown), which both hides this bar and would make the
    // click a no-op. Firing on the pointerdown itself, before default focus
    // handling runs, lets us call the field's own commit/cancel logic
    // ourselves instead of racing the native blur.
    var fire=function(e){e.preventDefault();e.stopPropagation();action();};
    btn.addEventListener('mousedown',fire);
    btn.addEventListener('touchstart',fire,{passive:false});
    return btn;
  }
  b.appendChild(mk('Cancel','#6b7280','<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',function(){
    if(!activeEditEl)return;
    activeEditEl.innerText=activeEditEl.getAttribute('data-cxa-base')||'';
    activeEditEl.blur();
  }));
  b.appendChild(mk('Done','#C97B2B','<polyline points="20 6 9 17 4 12"/>',function(){
    if(!activeEditEl)return;
    activeEditEl.blur();
  }));
  document.body.appendChild(b);
  return b;
}
function positionEditBar(){
  if(!editBar||!activeEditEl)return;
  var r=activeEditEl.getBoundingClientRect();
  var vh=(window.visualViewport&&window.visualViewport.height)||window.innerHeight;
  var top=r.bottom+8;
  // If the bar would land below the keyboard-shrunk visible viewport, pin it
  // above the field instead so it's never hidden behind the keyboard.
  if(top+44>vh) top=Math.max(4,r.top-52);
  editBar.style.top=top+'px';
  editBar.style.left=Math.max(4,r.left)+'px';
  editBar.style.display='flex';
}
function hideEditBar(){
  if(editBar) editBar.style.display='none';
  activeEditEl=null;
}
function wire(el,field){
  if(el.getAttribute('data-cxa')==='true') return;
  el.setAttribute('data-cxa','true');
  el.setAttribute('data-cxa-id',field.id);
  el.setAttribute('data-cxa-lbl',field.label);
  el.setAttribute('data-cxa-orig',field.original);
  el.setAttribute('data-cxa-base',el.innerText||'');
  el.style.cursor='pointer';
  el.addEventListener('blur',function(){
    el.contentEditable='false';
    el.style.outline='';el.style.outlineOffset='';el.style.borderRadius='';el.style.cursor='pointer';
    if(IS_TOUCH&&activeEditEl===el) hideEditBar();
    var v=(el.innerText||'').trim();
    var fid=el.getAttribute('data-cxa-id')||'';
    var isAuto=fid.indexOf('auto-')===0;
    var orig=el.getAttribute('data-cxa-orig')||'';
    var lbl=el.getAttribute('data-cxa-lbl')||'';
    try{window.parent.postMessage({type:isAuto?'certxa-field-new':'certxa-field-update',fieldId:fid,original:orig,label:lbl,value:v},'*');}catch(ex){}
  });
  el.addEventListener('keydown',function(e){
    if(e.key==='Escape'){el.innerText=el.getAttribute('data-cxa-base')||'';el.blur();}
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();el.blur();}
  });
}
function scanAll(){
  var map=buildMap(),count=0;
  var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null),n;
  while((n=w.nextNode())){
    var txt=(n.nodeValue||'').trim();
    if(!txt||txt.length<2||txt.length>500) continue;
    var hasCurrency=/[$\u20ac\u00a3\u00a5]/.test(txt);
    if(!hasCurrency&&!/[a-zA-Z]/.test(txt)&&txt.length<5) continue;
    var p=n.parentElement;
    if(!p||p===document.body||p.hasAttribute('data-cxa')) continue;
    if(SKIP_TAGS[p.tagName.toLowerCase()]) continue;
    if(p.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li').length>0) continue;
    var field=map[txt];
    if(!field){var slug=txt.replace(/[^a-z0-9]/gi,'').slice(0,12);field={id:'auto-'+(autoIdx++)+'-'+slug,label:p.tagName+' \u2014 '+txt.slice(0,45),original:txt,current:txt};}
    wire(p,field);count++;
  }
  var priceRx=/^[$\u20ac\u00a3\u00a5]\s*[\d,]+[\d.,+\-]*[+\-]?%?$/;
  document.querySelectorAll('span,div,td,p,strong,b,em').forEach(function(el){
    if(el.getAttribute('data-cxa')==='true') return;
    var tc=(el.textContent||'').trim();
    if(!priceRx.test(tc)) return;
    if(el.querySelector('[data-cxa="true"]')) return;
    if(el.querySelectorAll('p,h1,h2,h3,h4,h5,h6,div,section,article').length>0) return;
    var slug=tc.replace(/[^a-z0-9]/gi,'').slice(0,12);
    var field=map[tc]||{id:'auto-'+(autoIdx++)+'-'+slug,label:el.tagName+' \u2014 '+tc,original:tc,current:tc};
    wire(el,field);count++;
  });
  return count;
}
function setupCaptureHandlers(){
  if(captureReady) return;captureReady=true;
  document.addEventListener('click',function(e){
    var hits=document.elementsFromPoint(e.clientX,e.clientY);
    for(var i=0;i<hits.length;i++){
      if(hits[i].getAttribute('data-cxa')==='true'){
        e.preventDefault();e.stopPropagation();textJustClicked=true;activateEdit(hits[i]);return;
      }
    }
    textJustClicked=false;
  },true);
  document.addEventListener('mousemove',function(e){
    var hits=document.elementsFromPoint(e.clientX,e.clientY),found=null;
    for(var i=0;i<hits.length;i++){if(hits[i].getAttribute('data-cxa')==='true'&&hits[i].contentEditable!=='true'){found=hits[i];break;}}
    document.querySelectorAll('[data-cxa="true"]').forEach(function(el){if(el!==found&&el.contentEditable!=='true'){el.style.outline='';el.style.outlineOffset='';el.style.borderRadius='';}});
    if(found){found.style.outline='2px solid #3B0764';found.style.outlineOffset='4px';found.style.borderRadius='3px';showLabel(found,found.getAttribute('data-cxa-lbl')||'Edit text');}
    else hideLabel();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK EDITOR HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function blkSig(el){
  var tag=el.tagName.toLowerCase();
  var cls=(el.className||'').trim().split(/\s+/)[0]||'';
  var txt=(el.textContent||'').trim().replace(/\s+/g,' ').slice(0,40);
  var h=0;for(var i=0;i<txt.length;i++)h=((h*31)|0)+txt.charCodeAt(i);
  return tag+'_'+cls+'_'+(h>>>0).toString(36);
}
function blkLabel(el){
  var t=el.tagName.toLowerCase(),c=(el.className||'').toLowerCase();
  if(c.indexOf('announcement')>=0||c.indexOf('marquee')>=0||c.indexOf('banner-top')>=0) return 'Announcement Bar';
  if(t==='header'||c.indexOf('header')>=0) return 'Header / Nav';
  if(t==='nav'||c.indexOf('navbar')>=0) return 'Navigation';
  if(c.indexOf('hero')>=0) return 'Hero';
  if(c.indexOf('service')>=0) return 'Services';
  if(c.indexOf('gallery')>=0||c.indexOf('portfolio')>=0) return 'Gallery';
  if(c.indexOf('review')>=0||c.indexOf('testimonial')>=0) return 'Reviews';
  if(c.indexOf('contact')>=0) return 'Contact';
  if(c.indexOf('cta')>=0||c.indexOf('booking')>=0||c.indexOf('appointment')>=0) return 'Booking / CTA';
  if(c.indexOf('about')>=0) return 'About';
  if(c.indexOf('team')>=0||c.indexOf('staff')>=0) return 'Team';
  if(c.indexOf('price')>=0||c.indexOf('pricing')>=0) return 'Pricing';
  if(t==='footer'||c.indexOf('footer')>=0) return 'Footer';
  if(t==='section') return 'Section';
  return 'Block';
}
function findBlocks(){
  var BT={section:1,div:1,article:1,header:1,footer:1,main:1,aside:1,nav:1};
  function sigKids(el){
    var k=[];
    for(var i=0;i<el.children.length;i++){
      var c=el.children[i];
      if(BT[c.tagName.toLowerCase()]){var r=c.getBoundingClientRect();if(r.height>60&&r.width>100)k.push(c);}
    }
    return k;
  }
  var el=document.body,d=0,best=null;
  while(el&&d<10){var k=sigKids(el);if(k.length>=2){best={container:el,blocks:k};}if(k.length===1){el=k[0];d++;}else break;}
  return best;
}
function refreshBlocks(){
  // Clear marks on old blocks
  allBlocks.forEach(function(b){b.removeAttribute('data-cxa-block');b.removeAttribute('data-cxa-hover');});
  var res=findBlocks();if(!res)return;
  blockContainer=res.container;allBlocks=res.blocks;
  allBlocks.forEach(function(b){
    if(!b.__cxasig)b.__cxasig=blkSig(b);
    b.setAttribute('data-cxa-block','1');
  });
  renderInsBtns();
}
function applyStoredOps(){
  if(!blockContainer||!allBlocks.length)return;
  var ord=BLOCK_OPS.order||[],del=BLOCK_OPS.deleted||[];
  var sigMap={};allBlocks.forEach(function(b){sigMap[b.__cxasig]=b;});
  del.forEach(function(s){if(sigMap[s])sigMap[s].style.display='none';});
  if(ord.length>0)ord.forEach(function(s){if(sigMap[s]&&sigMap[s].style.display!=='none')blockContainer.appendChild(sigMap[s]);});
}
function sendBlockOps(){
  var order=[],deleted=[];
  allBlocks.forEach(function(b){if(b.style.display==='none')deleted.push(b.__cxasig);else order.push(b.__cxasig);});
  try{window.parent.postMessage({type:'certxa-block-ops',order:order,deleted:deleted},'*');}catch(e){}
}
function updateTbPos(){
  if(!selectedBlock||!blockToolbar)return;
  var lbl=blockToolbar.querySelector('[data-cxa-tb-lbl]');
  if(lbl)lbl.textContent=blkLabel(selectedBlock);
  blockToolbar.style.display='flex';
  var r=selectedBlock.getBoundingClientRect();
  // Pin the bar flush to the top-left of the block border (Microweber style).
  // Clamped so a block selected near the top of a scrolled iframe doesn't
  // push the bar off-screen (matches the clamp posInsBtn() already had).
  blockToolbar.style.top=Math.max(4,r.top-1)+'px';
  var left=Math.max(0,r.left);
  blockToolbar.style.left=left+'px';
}
function selectBlock(el){
  if(selectedBlock===el)return;
  deselectBlock();selectedBlock=el;
  el.setAttribute('data-cxa-sel','1');
  updateTbPos();
  // Tapping a block (no hover on touch) must reveal Add-Layout the same way
  // hovering does on desktop — posInsBtn() reads hoveredBlock||selectedBlock.
  posInsBtn();
}
function deselectBlock(){
  if(selectedBlock){
    selectedBlock.removeAttribute('data-cxa-sel');selectedBlock=null;
  }
  if(blockToolbar)blockToolbar.style.display='none';
  posInsBtn();
}
function createToolbar(){
  var t=document.createElement('div');
  t.setAttribute('data-cxa-toolbar','1');
  var tbH=IS_TOUCH?44:26,tbPad=IS_TOUCH?14:9,tbIcon=IS_TOUCH?17:13;
  // Bar sits at the top edge of the block — no border-radius so it feels flush
  t.style.cssText='position:fixed;z-index:2147483646;display:none;align-items:stretch;font-family:system-ui,sans-serif;pointer-events:auto;user-select:none;height:'+tbH+'px;box-shadow:0 2px 8px rgba(0,0,0,.25);';
  // Left: blue label badge
  var lbl=document.createElement('div');
  lbl.setAttribute('data-cxa-tb-lbl','1');
  lbl.style.cssText='background:#1B6EF0;color:#fff;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;padding:0 10px;display:flex;align-items:center;white-space:nowrap;';
  t.appendChild(lbl);
  // Right: action buttons (blue, separated by subtle dividers)
  var ctrl=document.createElement('div');
  ctrl.style.cssText='display:flex;align-items:stretch;';
  function btn(title,svg,action){
    var b=document.createElement('button');b.title=title;
    b.style.cssText='background:#1B6EF0;border:none;border-left:1px solid rgba(255,255,255,.18);color:#fff;cursor:pointer;padding:0 '+tbPad+'px;display:flex;align-items:center;justify-content:center;transition:background .12s;';
    b.innerHTML='<svg width="'+tbIcon+'" height="'+tbIcon+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">'+svg+'</svg>';
    b.addEventListener('mouseenter',function(){b.style.background='#0f55cc';});
    b.addEventListener('mouseleave',function(){b.style.background='#1B6EF0';});
    b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();action();});
    return b;
  }
  // Move up
  ctrl.appendChild(btn('Move section up','<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',function(){
    if(!selectedBlock)return;
    var prev=selectedBlock.previousElementSibling;
    while(prev&&(prev.getAttribute('data-cxa-toolbar')||prev.getAttribute('data-cxa-tip')))prev=prev.previousElementSibling;
    if(prev&&allBlocks.indexOf(prev)>=0){blockContainer.insertBefore(selectedBlock,prev);refreshBlocks();sendBlockOps();updateTbPos();}
  }));
  // Move down
  ctrl.appendChild(btn('Move section down','<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',function(){
    if(!selectedBlock)return;
    var next=selectedBlock.nextElementSibling;
    while(next&&(next.getAttribute('data-cxa-toolbar')||next.getAttribute('data-cxa-tip')))next=next.nextElementSibling;
    if(next&&allBlocks.indexOf(next)>=0){blockContainer.insertBefore(next,selectedBlock);refreshBlocks();sendBlockOps();updateTbPos();}
  }));
  // Duplicate
  ctrl.appendChild(btn('Duplicate section','<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',function(){
    if(!selectedBlock)return;
    var clone=selectedBlock.cloneNode(true);
    clone.querySelectorAll('[data-cxa]').forEach(function(el){
      ['data-cxa','data-cxa-id','data-cxa-lbl','data-cxa-orig','data-cxa-base'].forEach(function(a){el.removeAttribute(a);});
      el.style.cursor='';el.style.outline='';el.style.outlineOffset='';el.style.borderRadius='';
    });
    clone.removeAttribute('data-cxa-sel');
    clone.__cxasig=selectedBlock.__cxasig+'-d'+(dupCounter++);
    blockContainer.insertBefore(clone,selectedBlock.nextElementSibling);
    refreshBlocks();setTimeout(function(){scanAll();},150);
    sendBlockOps();selectBlock(clone);
  }));
  // Delete
  ctrl.appendChild(btn('Delete section','<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',function(){
    if(!selectedBlock)return;
    if(!confirm('Delete this section? Save to make it permanent, or refresh to undo.'))return;
    var toDel=selectedBlock;deselectBlock();toDel.style.display='none';
    refreshBlocks();sendBlockOps();
  }));
  t.appendChild(ctrl);
  document.body.appendChild(t);
  return t;
}
// ── Single "Add Layout" button — appears at top-center of hovered/selected block ──
var insBtnEl=null;
function clearInsBtns(){/* no-op: single shared button, not a list */}
function createInsBtn(){
  if(insBtnEl)return;
  var btn=document.createElement('button');
  btn.setAttribute('data-cxa-ins','1');
  var insPad=IS_TOUCH?'12px 22px':'5px 18px';
  btn.style.cssText='position:fixed;z-index:2147483644;display:none;background:#1B6EF0;color:#fff;border:none;cursor:pointer;font-size:11px;font-weight:700;padding:'+insPad+';border-radius:20px;font-family:system-ui,sans-serif;letter-spacing:.06em;white-space:nowrap;box-shadow:0 2px 12px rgba(27,110,240,.6);pointer-events:auto;transform:translateX(-50%);transition:background .12s;';
  btn.textContent='+ ADD LAYOUT';
  btn.addEventListener('mouseenter',function(){btn.style.background='#0f55cc';});
  btn.addEventListener('mouseleave',function(){btn.style.background='#1B6EF0';});
  btn.addEventListener('click',function(e){
    e.preventDefault();e.stopPropagation();
    var target=hoveredBlock||selectedBlock;
    if(target)selectBlock(target);
    // Find the block BEFORE the target so new block inserts above it
    var targetIdx=target?allBlocks.indexOf(target):-1;
    var afterBlk=targetIdx>0?allBlocks[targetIdx-1]:null;
    try{window.parent.postMessage({type:'certxa-open-block-picker',afterSig:afterBlk?afterBlk.__cxasig:null},'*');}catch(ex){}
  });
  document.body.appendChild(btn);
  insBtnEl=btn;
}
function posInsBtn(){
  if(!insBtnEl)return;
  var target=hoveredBlock||selectedBlock;
  if(!target||target.style.display==='none'){insBtnEl.style.display='none';return;}
  var r=target.getBoundingClientRect();
  // Anchor to the top edge of the block, horizontally centred
  insBtnEl.style.top=Math.max(4,r.top-14)+'px';
  insBtnEl.style.left=(r.left+r.width/2)+'px';
  insBtnEl.style.display='block';
}
function updateInsBtnPos(){posInsBtn();}
function renderInsBtns(){posInsBtn();}
function initBlockEditor(){
  blockToolbar=createToolbar();
  createInsBtn();
  refreshBlocks();applyStoredOps();
  // Retry a few times to catch late React renders
  setTimeout(function(){refreshBlocks();applyStoredOps();},600);
  setTimeout(function(){refreshBlocks();applyStoredOps();},1400);
  setTimeout(function(){refreshBlocks();applyStoredOps();},3000);
  // Hover highlight for blocks — blue dashed outline + show insert button
  document.addEventListener('mouseover',function(e){
    if(editorMode!=='layout'){
      if(hoveredBlock){hoveredBlock.removeAttribute('data-cxa-hover');hoveredBlock=null;}
      if(insBtnEl)insBtnEl.style.display='none';
      return;
    }
    if(insBtnEl&&insBtnEl.contains(e.target))return;
    var overText=false;
    var hits=document.elementsFromPoint(e.clientX,e.clientY);
    for(var i=0;i<hits.length;i++){if(hits[i].getAttribute('data-cxa')==='true'){overText=true;break;}}
    var found=null;
    if(!overText){for(var i=0;i<allBlocks.length;i++){if(allBlocks[i].style.display!=='none'&&(allBlocks[i]===e.target||allBlocks[i].contains(e.target))){found=allBlocks[i];break;}}}
    if(hoveredBlock&&hoveredBlock!==found){hoveredBlock.removeAttribute('data-cxa-hover');}
    hoveredBlock=found;
    if(found&&found!==selectedBlock){found.setAttribute('data-cxa-hover','1');}
    posInsBtn();
  },false);
  document.addEventListener('mouseout',function(e){
    if(insBtnEl&&(insBtnEl===e.relatedTarget||insBtnEl.contains(e.relatedTarget)))return;
    if(!e.relatedTarget||e.relatedTarget===document.documentElement){
      if(hoveredBlock){hoveredBlock.removeAttribute('data-cxa-hover');hoveredBlock=null;}
      posInsBtn();
    }
  },false);
  // Block click — bubble phase (capture phase handles text clicks + stops propagation)
  document.addEventListener('click',function(e){
    if(textJustClicked){textJustClicked=false;return;}
    if(blockToolbar&&blockToolbar.contains(e.target))return;
    if(insBtnEl&&insBtnEl.contains(e.target))return;
    // Only allow block selection in layout mode
    if(editorMode!=='layout'){deselectBlock();return;}
    var clicked=null;
    for(var i=0;i<allBlocks.length;i++){if(allBlocks[i].style.display!=='none'&&(allBlocks[i]===e.target||allBlocks[i].contains(e.target))){clicked=allBlocks[i];break;}}
    if(clicked)selectBlock(clicked);else deselectBlock();
  },false);
  function repositionFixedUi(){if(selectedBlock)updateTbPos();posInsBtn();if(activeEditEl)positionEditBar();}
  window.addEventListener('scroll',repositionFixedUi,true);
  window.addEventListener('resize',repositionFixedUi);
  // iOS Safari does not fire window 'resize' when the virtual keyboard opens
  // (it shrinks the *visual* viewport only, via the separate visualViewport
  // API) — without this, fixed-position UI (toolbar/insert-button/edit bar)
  // can end up positioned correctly on paper but hidden under the keyboard.
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize',repositionFixedUi);
    window.visualViewport.addEventListener('scroll',repositionFixedUi);
  }
  // Re-detect blocks after React mutates DOM (subtree:true catches re-renders inside #root)
  var blkTimer;
  new MutationObserver(function(mutations){
    var hasStructural=mutations.some(function(m){return m.addedNodes.length>0||m.removedNodes.length>0;});
    if(!hasStructural)return;
    clearTimeout(blkTimer);blkTimer=setTimeout(function(){refreshBlocks();applyStoredOps();},700);
  }).observe(document.body,{childList:true,subtree:true});
  // Insert a new block from the block library panel
  window.addEventListener('message',function(e){
    if(!e.data||e.data.type!=='certxa-insert-block')return;
    var html=e.data.html;if(!html)return;
    var tmp=document.createElement('div');tmp.innerHTML=html;
    var section=tmp.firstElementChild;if(!section)return;
    if(blockContainer){
      if(selectedBlock&&selectedBlock.parentNode===blockContainer){
        blockContainer.insertBefore(section,selectedBlock.nextElementSibling);
      }else{blockContainer.appendChild(section);}
    }else{document.body.appendChild(section);}
    refreshBlocks();
    setTimeout(function(){var cnt=scanAll();selectBlock(section);try{window.parent.postMessage({type:'certxa-editor-ready',count:cnt},'*');}catch(e){}},250);
    sendBlockOps();
  },false);
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE EDITOR
// ─────────────────────────────────────────────────────────────────────────────
function imgCategory(img){
  var r=img.getBoundingClientRect();
  var w=r.width||img.naturalWidth||0,h=r.height||img.naturalHeight||0;
  if(w<=2&&h<=2)return'bullet';
  if(w<=90||h<=90)return'bullet';
  var ratio=w/(h||1);
  if(ratio>2.0&&w>400)return'hero';
  var alt=(img.alt||'').toLowerCase();
  var cls=((img.closest&&img.closest('[class]'))||{className:''}).className.toLowerCase();
  var combined=alt+' '+cls;
  if(/nail|manicure|pedicure|gel|acrylic/.test(combined))return'nails';
  if(/barber|fade|buzz|shave|beard/.test(combined))return'barber';
  if(/hair|color|dye|style|cut|blow/.test(combined))return'hair';
  if(/interior|reception|chair|mirror/.test(combined))return'interior';
  if(/person|staff|team|portrait/.test(combined))return'team';
  if(ratio>1.5)return'interior';
  if(w<150)return'bullet';
  return'nails';
}
function clearImgHover(){
  if(hoveredImg){hoveredImg.style.outline='';hoveredImg.style.outlineOffset='';hoveredImg.style.cursor='';hoveredImg=null;}
}
function initImageEditor(){
  // Hover highlight on images in image mode
  document.addEventListener('mouseover',function(e){
    if(editorMode!=='image')return;
    var img=e.target.tagName==='IMG'?e.target:(e.target.closest?e.target.closest('img'):null);
    if(hoveredImg&&hoveredImg!==img)clearImgHover();
    hoveredImg=img;
    if(img&&!img.getAttribute('data-cxa-toolbar')){
      img.style.outline='2px dashed rgba(27,110,240,.8)';
      img.style.outlineOffset='3px';
      img.style.cursor='pointer';
    }
  },false);
  // Click to select image — capture phase so we intercept before template handlers
  document.addEventListener('click',function(e){
    if(editorMode!=='image')return;
    var img=e.target.tagName==='IMG'?e.target:(e.target.closest?e.target.closest('img'):null);
    if(!img||img.getAttribute('data-cxa-toolbar'))return;
    e.preventDefault();e.stopPropagation();
    // Solid outline on selected image
    document.querySelectorAll('img[data-cxa-img-sel]').forEach(function(el){el.removeAttribute('data-cxa-img-sel');el.style.outline='2px dashed rgba(27,110,240,.8)';el.style.outlineOffset='3px';});
    img.setAttribute('data-cxa-img-sel','1');
    img.style.outline='2px solid #1B6EF0';
    img.style.outlineOffset='3px';
    var r=img.getBoundingClientRect();
    try{window.parent.postMessage({
      type:'certxa-image-click',
      src:img.src,
      naturalWidth:img.naturalWidth,
      naturalHeight:img.naturalHeight,
      displayWidth:Math.round(r.width),
      displayHeight:Math.round(r.height),
      alt:img.alt||'',
      category:imgCategory(img)
    },'*');}catch(ex){}
  },true);
  // Receive replacement image
  window.addEventListener('message',function(e){
    if(!e.data||e.data.type!=='certxa-replace-image')return;
    var orig=e.data.originalSrc,newSrc=e.data.newSrc;
    document.querySelectorAll('img').forEach(function(img){
      if(img.src===orig||img.getAttribute('src')===orig){
        img.src=newSrc;
        img.removeAttribute('srcset');
        img.setAttribute('data-cxa-img-sel','1');
        img.style.outline='2px solid #1B6EF0';img.style.outlineOffset='3px';
      }
    });
    try{window.parent.postMessage({type:'certxa-image-replaced',originalSrc:orig,newSrc:newSrc},'*');}catch(ex){}
  },false);
  // Mode switch
  window.addEventListener('message',function(e){
    if(!e.data||e.data.type!=='certxa-set-mode')return;
    var prev=editorMode;
    editorMode=e.data.mode||'text';
    document.body.setAttribute('data-cxa-mode',editorMode);
    clearImgHover();
    document.querySelectorAll('img[data-cxa-img-sel]').forEach(function(el){el.removeAttribute('data-cxa-img-sel');el.style.outline='';el.style.outlineOffset='';el.style.cursor='';});
    // When leaving layout mode, deselect block and hide block UI
    if(prev==='layout'&&editorMode!=='layout'){
      deselectBlock();
      if(hoveredBlock){hoveredBlock.removeAttribute('data-cxa-hover');hoveredBlock=null;}
      if(insBtnEl)insBtnEl.style.display='none';
    }
  },false);
}

// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────
function init(){
  if(inited)return;
  // Apply saved text values
  var map=buildMap(),w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null),n,pairs=[];
  while((n=w.nextNode())){var v=(n.nodeValue||'').trim();var f=map[v];if(f&&f.current&&f.current!==v)pairs.push([n,f.current]);}
  pairs.forEach(function(p){try{p[0].nodeValue=p[1];}catch(e){}});
  var cnt=scanAll();
  setupCaptureHandlers();
  inited=true;
  // Set initial mode attribute — block controls only appear when editorMode becomes 'layout'
  document.body.setAttribute('data-cxa-mode',editorMode);
  if(IS_TOUCH) document.body.setAttribute('data-cxa-touch','1');
  initBlockEditor();
  initImageEditor();
  try{window.parent.postMessage({type:'certxa-editor-ready',count:cnt},'*');}catch(e){}
  var obs=new MutationObserver(function(){clearTimeout(initTimer);initTimer=setTimeout(function(){inited=false;scanAll();},500);});
  obs.observe(document.body,{childList:true,subtree:true});
}

var style=document.createElement('style');
style.textContent=[
  '[data-cxa="true"]{transition:outline .12s,outline-offset .12s;cursor:pointer!important;}',
  '[data-cxa="true"][contenteditable="true"]{min-width:4px;min-height:1em;white-space:pre-wrap;cursor:text!important;}',
  'body[data-cxa-mode="layout"] [data-cxa-block="1"]{outline:2px dashed rgba(27,110,240,0.38)!important;outline-offset:0!important;}',
  'body[data-cxa-mode="layout"] [data-cxa-block="1"][data-cxa-hover="1"]{outline:2px dashed rgba(27,110,240,0.8)!important;}',
  'body[data-cxa-mode="layout"] [data-cxa-sel="1"]{outline:2px solid #1B6EF0!important;outline-offset:0!important;}',
  // Touch: suppress double-tap-to-zoom / 300ms tap delay on editable targets only
  // (not body — pinch-zoom-to-read stays available elsewhere for accessibility).
  '[data-cxa="true"],[data-cxa-block="1"],img,[data-cxa-toolbar] button,[data-cxa-ins],[data-cxa-editbar] button{touch-action:manipulation;}',
  // Touch: a long-press on unedited text would otherwise trigger the native
  // selection/callout menu instead of our tap-to-edit handler.
  '[data-cxa="true"]:not([contenteditable="true"]){-webkit-user-select:none;user-select:none;}',
  '[data-cxa="true"][contenteditable="true"]{-webkit-user-select:text;user-select:text;}',
  // Touch: there is no hover to reveal what's editable, so show a persistent
  // (but subtler than the active/selected state) outline instead.
  'body[data-cxa-touch="1"] [data-cxa="true"]:not([contenteditable="true"]){outline:1.5px dashed rgba(59,7,100,.4)!important;outline-offset:3px!important;}',
  'body[data-cxa-touch="1"][data-cxa-mode="image"] img:not([data-cxa-img-sel]):not([data-cxa-toolbar]){outline:1.5px dashed rgba(27,110,240,.4)!important;outline-offset:2px!important;}'
].join('');
document.head.appendChild(style);

// ── In-place field revert (from undo button in parent panel) ──────────────
// The parent sends this instead of reloading the iframe, so the preview
// instantly reflects the undone value without re-fetching stale DB data.
window.addEventListener('message',function(e){
  if(!e.data||e.data.type!=='certxa-revert-field')return;
  var fieldId=e.data.fieldId,value=e.data.value;
  var el=document.querySelector('[data-cxa-id="'+fieldId+'"]');
  if(el){
    // Only update if not currently being edited by the user
    if(el.contentEditable!=='true'){
      el.innerText=value;
    }
    // Always update the base so Escape-to-revert in the field also uses the new value
    el.setAttribute('data-cxa-base',value);
    // Update the FIELDS array so buildMap() stays consistent on re-scans
    for(var i=0;i<FIELDS.length;i++){if(FIELDS[i].id===fieldId){FIELDS[i].current=value;break;}}
  }
},false);

// Apply color ops via injected style tag
window.addEventListener('message',function(e){
  if(!e.data||e.data.type!=='certxa-apply-colors')return;
  var ops=e.data;
  var styleEl=document.getElementById('certxa-color-overrides');
  if(!styleEl){styleEl=document.createElement('style');styleEl.id='certxa-color-overrides';document.head.appendChild(styleEl);}
  var css='';
  var vars=':root{';
  if(ops.primary){vars+='--color-primary:'+ops.primary+';--primary-color:'+ops.primary+';--primary:'+ops.primary+';--accent:'+ops.primary+';--accent-color:'+ops.primary+';--brand:'+ops.primary+';--cta-color:'+ops.primary+';';}
  if(ops.background){vars+='--bg-color:'+ops.background+';--background-color:'+ops.background+';--page-bg:'+ops.background+';';}
  if(ops.text){vars+='--text-color:'+ops.text+';--color-text:'+ops.text+';--body-color:'+ops.text+';';}
  vars+='}';
  css+=vars;
  if(ops.background){css+='body,#root{background-color:'+ops.background+' !important;}';}
  if(ops.text){css+='body{color:'+ops.text+' !important;}#root p,#root h1,#root h2,#root h3,#root h4,#root h5,#root h6,#root li,#root address,#root blockquote{color:'+ops.text+' !important;}';}
  if(ops.primary){
    css+='#root button:not([aria-label*="close"]):not([aria-label*="menu"]):not([aria-label*="Close"]):not([aria-label*="Menu"]){background-color:'+ops.primary+' !important;border-color:'+ops.primary+' !important;}';
    css+='#root a[class*="btn"],#root a[class*="cta"],#root a[class*="book"],#root a[class*="appoint"],#root a[class*="reserve"]{background-color:'+ops.primary+' !important;border-color:'+ops.primary+' !important;}';
    css+='a[class*="btn"][href],a[class*="cta"][href],a[class*="book"][href]{background-color:'+ops.primary+' !important;border-color:'+ops.primary+' !important;}';
  }
  styleEl.textContent=css;
},false);
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){setTimeout(init,800);});}
else{setTimeout(init,800);}
})();
</script>`;
}

// ── Block-ops application script (served on preview + published sites) ─────────
// Re-applies saved block order/deletions after React renders.

function buildBlockOpsScript(blockOps: BlockOps): string {
  if (blockOps.order.length === 0 && blockOps.deleted.length === 0) return "";
  const json = JSON.stringify(blockOps);
  return `<script>
(function(){
var OPS=${json};
function blkSig(el){
  var tag=el.tagName.toLowerCase();
  var cls=(el.className||'').trim().split(/\s+/)[0]||'';
  var txt=(el.textContent||'').trim().replace(/\s+/g,' ').slice(0,40);
  var h=0;for(var i=0;i<txt.length;i++)h=((h*31)|0)+txt.charCodeAt(i);
  return tag+'_'+cls+'_'+(h>>>0).toString(36);
}
function findBlocks(){
  var BT={section:1,div:1,article:1,header:1,footer:1,main:1,aside:1,nav:1};
  function kids(el){var k=[];for(var i=0;i<el.children.length;i++){var c=el.children[i];if(BT[c.tagName.toLowerCase()]){var r=c.getBoundingClientRect();if(r.height>60&&r.width>100)k.push(c);}}return k;}
  var el=document.body,d=0;
  while(el&&d<7){var k=kids(el);if(k.length>=3)return{container:el,blocks:k};if(k.length===1){el=k[0];d++;}else break;}
  return null;
}
function applyOps(){
  var res=findBlocks();if(!res)return;
  var sigMap={};res.blocks.forEach(function(b){sigMap[blkSig(b)]=b;});
  (OPS.deleted||[]).forEach(function(s){if(sigMap[s])sigMap[s].style.display='none';});
  if(OPS.order&&OPS.order.length>0)OPS.order.forEach(function(s){if(sigMap[s]&&sigMap[s].style.display!=='none')res.container.appendChild(sigMap[s]);});
}
var obs=new MutationObserver(function(){
  var root=document.getElementById('root');
  if(root&&root.children.length>0){obs.disconnect();setTimeout(applyOps,400);}
});
obs.observe(document.body,{childList:true,subtree:true});
setTimeout(function(){obs.disconnect();applyOps();},8000);
})();
</script>`;
}

// ── Text replacement injection script (used for published/preview without editing) ──

function buildReplacementScript(fields: ContentField[]): string {
  const replacements: Record<string, string> = {};
  for (const f of fields) {
    if (f.current !== f.original) {
      replacements[f.original] = f.current;
    }
  }
  if (Object.keys(replacements).length === 0) return "";

  const json = JSON.stringify(replacements);
  return `<script>
(function(){
  var r=${json};
  function apply(root){
    var w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null);
    var n,pairs=[];
    while((n=w.nextNode())){
      var v=(n.nodeValue||'').trim();
      if(Object.prototype.hasOwnProperty.call(r,v)) pairs.push([n,r[v]]);
    }
    pairs.forEach(function(p){try{p[0].nodeValue=p[1];}catch(e){}});
  }
  var t;
  var obs=new MutationObserver(function(){clearTimeout(t);t=setTimeout(function(){apply(document.body);},150);});
  function init(){obs.observe(document.body,{childList:true,subtree:true});apply(document.body);}
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){setTimeout(init,300);});}
  else{setTimeout(init,300);}
})();
</script>`;
}

// ── Image-ops application script (served on preview + published sites) ───────
// Replaces saved image src values after React renders.

function buildImageOpsScript(imageOps: Record<string, string>): string {
  if (Object.keys(imageOps).length === 0) return "";
  const json = JSON.stringify(imageOps);
  return `<script>
(function(){
var IOPS=${json};
function applyImageOps(){
  document.querySelectorAll('img').forEach(function(img){
    var orig=img.getAttribute('src');
    if(orig&&Object.prototype.hasOwnProperty.call(IOPS,img.src))img.src=IOPS[img.src];
    else if(orig&&Object.prototype.hasOwnProperty.call(IOPS,orig)){img.src=IOPS[orig];img.removeAttribute('srcset');}
  });
}
var obs=new MutationObserver(function(){
  var root=document.getElementById('root');
  if(root&&root.children.length>0){obs.disconnect();setTimeout(applyImageOps,400);}
});
obs.observe(document.body,{childList:true,subtree:true});
setTimeout(function(){obs.disconnect();applyImageOps();},8000);
})();
</script>`;
}

// ── Color-ops application script (served on preview + published sites) ──────────

function buildColorOpsScript(colorOps: ColorOps): string {
  if (!colorOps.primary && !colorOps.background && !colorOps.text) return "";
  const json = JSON.stringify(colorOps);
  return `<script>
(function(){
var COPS=${json};
function applyColorOps(){
  var styleEl=document.getElementById('certxa-color-overrides');
  if(!styleEl){styleEl=document.createElement('style');styleEl.id='certxa-color-overrides';document.head.appendChild(styleEl);}
  var css='',vars=':root{';
  if(COPS.primary){vars+='--color-primary:'+COPS.primary+';--primary-color:'+COPS.primary+';--primary:'+COPS.primary+';--accent:'+COPS.primary+';--accent-color:'+COPS.primary+';--brand:'+COPS.primary+';--cta-color:'+COPS.primary+';';}
  if(COPS.background){vars+='--bg-color:'+COPS.background+';--background-color:'+COPS.background+';--page-bg:'+COPS.background+';';}
  if(COPS.text){vars+='--text-color:'+COPS.text+';--color-text:'+COPS.text+';--body-color:'+COPS.text+';';}
  vars+='}';css+=vars;
  if(COPS.background){css+='body,#root{background-color:'+COPS.background+' !important;}';}
  if(COPS.text){css+='body{color:'+COPS.text+' !important;}#root p,#root h1,#root h2,#root h3,#root h4,#root h5,#root h6,#root li,#root address,#root blockquote{color:'+COPS.text+' !important;}';}
  if(COPS.primary){
    css+='#root button:not([aria-label*="close"]):not([aria-label*="menu"]):not([aria-label*="Close"]):not([aria-label*="Menu"]){background-color:'+COPS.primary+' !important;border-color:'+COPS.primary+' !important;}';
    css+='#root a[class*="btn"],#root a[class*="cta"],#root a[class*="book"],#root a[class*="appoint"],#root a[class*="reserve"]{background-color:'+COPS.primary+' !important;border-color:'+COPS.primary+' !important;}';
    css+='a[class*="btn"][href],a[class*="cta"][href],a[class*="book"][href]{background-color:'+COPS.primary+' !important;border-color:'+COPS.primary+' !important;}';
  }
  styleEl.textContent=css;
}
var obs=new MutationObserver(function(){
  var root=document.getElementById('root');
  if(root&&root.children.length>0){obs.disconnect();setTimeout(applyColorOps,600);}
});
obs.observe(document.body,{childList:true,subtree:true});
setTimeout(function(){obs.disconnect();applyColorOps();},8000);
})();
</script>`;
}

// ── Core file-serving logic (shared by template + website preview) ─────────────

// ── SEO meta injection helpers ────────────────────────────────────────────────

type SeoMeta = TenantSeoMeta;

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function applySeoHeadTags(html: string, seo: SeoMeta): string {
  const additions: string[] = [];
  const replaceOrAppend = (pattern: RegExp, replacement: string) => {
    if (pattern.test(html)) html = html.replace(pattern, replacement);
    else additions.push(replacement);
  };

  // Replace template/demo metadata instead of appending duplicate tags.
  if (seo.title) replaceOrAppend(/<title>[^<]*<\/title>/i, `<title>${escAttr(seo.title)}</title>`);
  if (seo.description) replaceOrAppend(/<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${escAttr(seo.description)}">`);
  if (seo.keywords) replaceOrAppend(/<meta\s+name=["']keywords["'][^>]*>/i, `<meta name="keywords" content="${escAttr(seo.keywords)}">`);
  if (seo.robots) replaceOrAppend(/<meta\s+name=["']robots["'][^>]*>/i, `<meta name="robots" content="${escAttr(seo.robots)}">`);
  if (seo.canonical) replaceOrAppend(/<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${escAttr(seo.canonical)}">`);
  if (seo.title) replaceOrAppend(/<meta\s+property=["']og:title["'][^>]*>/i, `<meta property="og:title" content="${escAttr(seo.title)}">`);
  if (seo.description) replaceOrAppend(/<meta\s+property=["']og:description["'][^>]*>/i, `<meta property="og:description" content="${escAttr(seo.description)}">`);
  if (seo.canonical) replaceOrAppend(/<meta\s+property=["']og:url["'][^>]*>/i, `<meta property="og:url" content="${escAttr(seo.canonical)}">`);
  if (seo.ogImage) replaceOrAppend(/<meta\s+property=["']og:image["'][^>]*>/i, `<meta property="og:image" content="${escAttr(seo.ogImage)}">`);
  if (seo.title) replaceOrAppend(/<meta\s+name=["']twitter:title["'][^>]*>/i, `<meta name="twitter:title" content="${escAttr(seo.title)}">`);
  if (seo.description) replaceOrAppend(/<meta\s+name=["']twitter:description["'][^>]*>/i, `<meta name="twitter:description" content="${escAttr(seo.description)}">`);
  if (seo.ogImage) replaceOrAppend(/<meta\s+name=["']twitter:image["'][^>]*>/i, `<meta name="twitter:image" content="${escAttr(seo.ogImage)}">`);
  if (seo.googleVerification) replaceOrAppend(/<meta\s+name=["']google-site-verification["'][^>]*>/i, `<meta name="google-site-verification" content="${escAttr(seo.googleVerification)}">`);
  if (seo.geoPosition) replaceOrAppend(/<meta\s+name=["']geo\.position["'][^>]*>/i, `<meta name="geo.position" content="${escAttr(seo.geoPosition)}">`);
  if (seo.geoRegion) replaceOrAppend(/<meta\s+name=["']geo\.region["'][^>]*>/i, `<meta name="geo.region" content="${escAttr(seo.geoRegion)}">`);
  if (seo.geoPlacename) replaceOrAppend(/<meta\s+name=["']geo\.placename["'][^>]*>/i, `<meta name="geo.placename" content="${escAttr(seo.geoPlacename)}">`);

  const schema = seo.jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(seo.jsonLd).replace(/<\/script/gi, "<\\/script")}</script>`
    : "";
  const schemaPattern = /<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i;
  if (schema) {
    if (schemaPattern.test(html)) html = html.replace(schemaPattern, schema);
    else additions.push(schema);
  }
  if (seo.preloadImage) additions.push(`<link rel="preload" as="image" href="${escAttr(seo.preloadImage)}">`);
  return additions.length ? html.replace(/<\/head>/i, `${additions.join("")}</head>`) : html;
}

function buildAnalyticsScript(slug: string): string {
  return `<script>(function(){
    try{
      var s=${JSON.stringify(slug)};
      var payload=JSON.stringify({path:location.pathname,referrer:document.referrer||null});
      var url='/api/tenant/'+s+'/pageview';
      if(navigator&&typeof navigator.sendBeacon==='function'){
        try{
          var blob=new Blob([payload],{type:'application/json'});
          navigator.sendBeacon(url,blob);
          return;
        }catch(_){/* fall through to fetch */}
      }
      fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:payload,keepalive:true,cache:'no-store'}).catch(function(){});
    }catch(e){}
  })();</script>`;
}

function buildSuspensionGuardScript(slug: string): string {
  return `<script>(function(){
    try{
      var s=${JSON.stringify(slug)};
      fetch('/api/public/store/'+s,{cache:'no-store'})
        .then(function(r){
          if(r.status===403||r.status===503){
            document.documentElement.innerHTML='<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Under Maintenance</title><style>body{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fff}.box{text-align:center;padding:2rem;max-width:520px}h1{font-size:2rem;margin:0 0 .75rem}p{margin:0;color:rgba(255,255,255,.68)}</style></head><body><div class="box"><h1>Under Maintenance</h1><p>This website is temporarily unavailable.</p></div></body></html>';
          }
        })
        .catch(function(){});
    }catch(e){}
  })();</script>`;
}

// ── Sitemap & robots.txt helpers ─────────────────────────────────────────────

const SUBDOMAIN_BASE = process.env.CERTXA_SUBDOMAIN_BASE ?? "certxa.com";

type SiteWebsite = {
  slug: string;
  customDomain: string | null;
  customDomainStatus: string | null;
  updatedAt: Date | string | null;
};

function siteBaseUrl(website: Pick<SiteWebsite, "slug" | "customDomain" | "customDomainStatus">): string {
  if (website.customDomainStatus === "active" && website.customDomain) {
    return `https://${website.customDomain}`;
  }
  return `https://${website.slug}.${SUBDOMAIN_BASE}`;
}

function xmlEsc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function buildSitemapXml(website: SiteWebsite, extraPaths: string[] = []): string {
  const base = siteBaseUrl(website);
  const lastmod = website.updatedAt
    ? new Date(website.updatedAt instanceof Date ? website.updatedAt : website.updatedAt).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  const pages = ["/", ...extraPaths];
  const urlEntries = pages.map((p) => {
    // Fragment paths (e.g. "/#services") must never get a trailing slash — it
    // would corrupt the fragment identifier ("services/" ≠ "services").
    // Only plain path segments get a trailing slash for canonical consistency.
    const hasFragment = p.includes("#");
    const loc = hasFragment
      ? base + p                          // e.g. https://site.certxa.com/#services
      : base + (p === "/" ? "" : p) + "/"; // e.g. https://site.certxa.com/
    return `  <url>\n    <loc>${xmlEsc(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${p === "/" ? "1.0" : "0.8"}</priority>\n  </url>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>`;
}

export function buildRobotsTxt(website: Pick<SiteWebsite, "slug" | "customDomain" | "customDomainStatus">): string {
  const base = siteBaseUrl(website);
  return `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`;
}

// ── Sitemap & robots.txt handlers (slug-based) ────────────────────────────────

// Section anchors included in auto-mode sitemaps — helps Google index each
// visible section as a distinct deep-link target with semantic meaning.
const AUTO_MODE_SITEMAP_SECTIONS = [
  "/#services",
  "/#team",
  "/#hours",
  "/#reviews",
  "/#contact",
];

// Per-template section anchors for template-based published sites.
// Keyed by the template's filesPath (directory name in templates-storage/).
// Each template has its own section IDs — using wrong anchors produces
// broken sitemap deep-links that return 404 fragments to Googlebot.
const TEMPLATE_SITEMAP_SECTIONS: Record<string, string[]> = {
  "nail-salon-bloom": ["/#services", "/#gallery", "/#about", "/#visit"],
};

export async function handleTenantSitemapBySlug(req: Request, res: Response): Promise<void> {
  const slug = (req.params as Record<string, string>).slug;
  if (!slug) { res.status(400).send("Missing slug"); return; }

  const [website] = await db
    .select()
    .from(websitesTable)
    .where(and(eq(websitesTable.slug, slug), eq(websitesTable.published, true)));

  if (!website) { res.status(404).send("Not found"); return; }

  // Auto-mode pages have known section anchors — add them as sitemap entries
  // so search engines can directly index the Services, Team, Hours, etc. sections.
  const isAuto = (website as any).publisherType === "auto" || (website as any).publisher_type === "auto";
  const autoSettings = isAuto ? ((website as any).autoSettings ?? {}) as Record<string, unknown> : {};
  let extraPaths: string[] = [];
  if (isAuto) {
    extraPaths = AUTO_MODE_SITEMAP_SECTIONS.filter((path) => {
      if (path === "/#services") return autoSettings.showServices !== false;
      if (path === "/#team") return autoSettings.showStaff !== false;
      if (path === "/#hours") return autoSettings.showHours !== false;
      if (path === "/#reviews") return autoSettings.showReviews !== false;
      if (path === "/#contact") return autoSettings.showContact !== false;
      return true;
    });
  } else if ((website as any).templateId) {
    // Template-based sites: look up the template's filesPath and emit the
    // correct per-template section anchors. Wrong anchors → broken sitemap
    // deep-links that return 404 fragments to Googlebot.
    try {
      const [tmpl] = await db.select().from(templatesTable).where(eq(templatesTable.id, (website as any).templateId));
      if (tmpl?.filesPath) {
        // filesPath may be a full path like "/home/.../nail-salon-bloom" or just "nail-salon-bloom"
        const dirName = tmpl.filesPath.split("/").filter(Boolean).pop() ?? tmpl.filesPath;
        extraPaths = TEMPLATE_SITEMAP_SECTIONS[dirName] ?? [];
      }
    } catch (_err) {
      // Non-fatal — emit sitemap without section anchors rather than failing
    }
  }

  const xml = buildSitemapXml(website, extraPaths);
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(xml);
}

export async function handleTenantRobotsBySlug(req: Request, res: Response): Promise<void> {
  const slug = (req.params as Record<string, string>).slug;
  if (!slug) { res.status(400).send("Missing slug"); return; }

  const [website] = await db
    .select()
    .from(websitesTable)
    .where(and(eq(websitesTable.slug, slug), eq(websitesTable.published, true)));

  if (!website) { res.status(404).send("Not found"); return; }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(buildRobotsTxt(website));
}

export function serveDistFile(
  distDir: string,
  splat: string | undefined,
  basePath: string,
  replacementScript: string,
  res: Response,
  inlineScript?: string,
  seoMeta?: SeoMeta,
  analyticsSlug?: string,
  canonicalUrl?: string
): void {
  let urlPath = "/index.html";
  if (splat) {
    try {
      // Guard against malformed percent-encoded paths (URIError: URI malformed)
      // so a bad URL cannot crash tenant site serving.
      const decoded = decodeURIComponent(splat).replace(/^\/+/, "");
      urlPath = `/${decoded}`;
    } catch (err: any) {
      logger.warn({ err: err?.message ?? err, splat }, "Rejected malformed encoded path in tenant site request");
      res.status(400).send("Bad request");
      return;
    }
  }
  let filePath = path.join(distDir, urlPath);

  if (!filePath.startsWith(distDir)) {
    res.status(403).send("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath)) {
    filePath = path.join(distDir, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    res.status(404).send("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".html" || ext === "") {
    let html = fs.readFileSync(filePath, "utf-8");

    // Ensure live tenant pages never keep template/demo canonical URLs.
    if (canonicalUrl) {
      const canonical = escAttr(canonicalUrl.replace(/\/$/, "/"));
      if (/<link\s+rel=["']canonical["'][^>]*>/i.test(html)) {
        html = html.replace(/<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${canonical}" />`);
      } else {
        html = html.replace("</head>", `<link rel="canonical" href="${canonical}" /></head>`);
      }
      if (/<meta\s+property=["']og:url["'][^>]*>/i.test(html)) {
        html = html.replace(/<meta\s+property=["']og:url["'][^>]*>/i, `<meta property="og:url" content="${canonical}" />`);
      } else {
        html = html.replace("</head>", `<meta property="og:url" content="${canonical}" /></head>`);
      }
    }

    // Rewrite absolute asset paths to go through our preview handler
    html = html.replace(
      /(src|href)="(\/((?!\/)[^"]+))"/g,
      (_match, attr, absPath) => {
        if (absPath.startsWith(basePath) || absPath.startsWith("//")) {
          return `${attr}="${absPath}"`;
        }
        return `${attr}="${basePath}${absPath}"`;
      }
    );

    // Inject live tenant SEO and replace template/demo tags without duplicates.
    if (seoMeta) {
      html = applySeoHeadTags(html, seoMeta);
    }

    // Inject site data vars before </head>
    if (inlineScript) {
      html = html.replace("</head>", `${inlineScript}</head>`);
    }

    // Inject replacement script before </body>
    if (replacementScript) {
      html = html.replace("</body>", `${replacementScript}</body>`);
    }

    // Inject analytics tracking script (fire-and-forget fetch — goes at end of body)
    if (analyticsSlug) {
      html = html.replace("</body>", `${buildAnalyticsScript(analyticsSlug)}</body>`);
    }

    // Suspension/cancellation is enforced server-side in tenant route handlers.
    // Do not inject the client-side guard script here.

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(html);
  } else {
    res.setHeader("Content-Type", MIME_MAP[ext] ?? "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.sendFile(filePath);
  }
}

// ── Core tenant serving logic (shared by slug + custom-domain handlers) ───────

async function serveTenantSite(
  website: {
    id: number;
    name: string;
    templateId: number | null;
    content: unknown;
    slug: string;
    storeid?: number | string | null;
    customDomain?: string | null;
    customDomainStatus?: string | null;
  },
  splat: string | undefined,
  basePath: string,
  res: Response
): Promise<void> {
  if (!website.templateId) {
    res.status(422).send("<html><body><p>No template assigned to this website.</p></body></html>");
    return;
  }

  const [template] = await db.select().from(templatesTable).where(eq(templatesTable.id, website.templateId));
  if (!template || !template.filesPath || !fs.existsSync(template.filesPath)) {
    res.status(422).send("<html><body><p>Template files not found.</p></body></html>");
    return;
  }

  const projectDir = findProjectDir(template.filesPath);
  const distDir = findDistDir(projectDir);
  if (!distDir) {
    res.status(422).send("<html><body><p>Template not yet built — please check back shortly.</p></body></html>");
    return;
  }

  const content = website.content as { fields?: ContentField[]; blockOps?: BlockOps; imageOps?: Record<string, string>; colorOps?: ColorOps; seo?: TenantSeoOverrides } | null;
  const fields: ContentField[] = content?.fields ?? [];
  const blockOps: BlockOps = content?.blockOps ?? { order: [], deleted: [] };
  const imageOps: Record<string, string> = content?.imageOps ?? {};
  const colorOps: ColorOps = content?.colorOps ?? {};
  const savedSeo: TenantSeoOverrides = content?.seo ?? {};
  const replacementScript = buildReplacementScript(fields) + buildBlockOpsScript(blockOps) + buildImageOpsScript(imageOps) + buildColorOpsScript(colorOps);
  const canonicalUrl = siteBaseUrl({
    slug: website.slug,
    customDomain: website.customDomain ?? null,
    customDomainStatus: website.customDomainStatus ?? null,
  });

  let seo: SeoMeta = { canonical: canonicalUrl, ...savedSeo };
  const storeId = website.storeid == null ? null : Number(website.storeid);
  // Build tenant data when we have a storeId so we can inject live STORE_DATA
  // into the served template. This ensures pre-built demo content is
  // replaced with the real store's services/categories on page load.
  let tenantDataForInjection: TenantData | null = null;
  if (storeId !== null && Number.isInteger(storeId) && storeId > 0) {
    try {
      const { buildTenantData } = await import("./tenant-data");
      const td = await buildTenantData(storeId, {
        id: website.id,
        name: website.name,
        slug: website.slug,
      });
      tenantDataForInjection = td;
      seo = buildTenantSeo(td, canonicalUrl, savedSeo);
    } catch (err) {
      logger.warn({ err, websiteId: website.id }, "Failed to build live tenant SEO; using saved metadata");
    }
  }

  // Build the inline script(s) to inject into the template. Include both
  // the slug (so client hooks activate) and the full STORE_DATA payload
  // when available to override any demo/static content baked into the
  // template bundle.
  let slugScript = `<script>window.__CERTXA_SLUG__=${JSON.stringify(website.slug)};window.__CERTXA_API_BASE__='';</script>`;
  if (tenantDataForInjection) {
    try {
      slugScript = buildStoreDataScript(tenantDataForInjection, website.slug) + slugScript;
    } catch (err) {
      logger.warn({ err, websiteId: website.id }, "Failed to build store data injection script");
    }
  }

  serveDistFile(distDir, splat, basePath, replacementScript, res, slugScript, seo, website.slug, canonicalUrl);
}

function underMaintenanceHtml(siteLabel: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>${siteLabel}</title>
    <style>
      body{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fff}
      .box{text-align:center;padding:2rem;max-width:520px}
      h1{font-size:2rem;margin:0 0 .75rem}
      p{margin:0;color:rgba(255,255,255,.68)}
    </style>
  </head><body><div class="box"><h1>Under Maintenance</h1><p>This website is temporarily unavailable.</p></div></body></html>`;
}

async function isWebsiteSuspendedOrCanceled(storeId: string | null): Promise<boolean> {
  if (!storeId) return false;
  const acctResult = await db.execute(sql`
    SELECT account_status FROM locations WHERE id = ${Number(storeId)} LIMIT 1
  `);
  const acctStatus = String((acctResult.rows as any[])[0]?.account_status ?? "active").toLowerCase();
  return acctStatus === "suspended" || acctStatus === "canceled";
}

// ── Auto-page renderer (publisher_type === 'auto') ────────────────────────────

async function serveAutoPage(website: Record<string, unknown>, res: Response): Promise<void> {
  try {
    const { buildTenantData } = await import("./tenant-data");
    const { renderSalonPage } = await import("./render-salon-page");

    const websiteMeta = { id: website.id as number, name: website.name as string, slug: website.slug as string };
    let tenantData: TenantData;
    const storeid = website.storeid as number | null | undefined;
    if (storeid) {
      tenantData = await buildTenantData(storeid, websiteMeta);
    } else {
      tenantData = {
        website: websiteMeta,
        business: null,
        hours: [],
        services: [],
        serviceCategories: [],
        staff: [],
        reviews: [],
        googleReviewCount: 0,
        googleAvgRating: 0,
        serviceReviews: {},
        galleryPhotos: [],
      };
    }

    const appUrl = process.env.APP_URL ?? "https://certxa.com";
    const customDomain = website.customDomain as string | null | undefined;
    const slug = website.slug as string;
    const canonicalUrl = customDomain ? `https://${customDomain}` : `${appUrl}/${slug}`;

    const autoSettings = ((website.autoSettings ?? {}) as Record<string, unknown>);
    const html = renderSalonPage(tenantData, autoSettings, canonicalUrl, appUrl);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.send(html);
  } catch (err: any) {
    res.status(500).send(`<pre>Auto-render error: ${err.message}</pre>`);
  }
}

// ── Tenant site by slug (called from /api/tenant/:slug/site routes) ───────────

export async function handleTenantSiteBySlug(req: Request, res: Response): Promise<void> {
  const slug = (req.params as Record<string, string>).slug;
  if (!slug) { res.status(400).send("Missing slug"); return; }

  const [website] = await db
    .select()
    .from(websitesTable)
    .where(and(eq(websitesTable.slug, slug), eq(websitesTable.published, true)));

  if (!website) {
    res.status(404).send(notFoundHtml(slug));
    return;
  }

  // Subdomain host traffic hits this handler directly for these files.
  if (req.path === "/sitemap.xml") {
    const xml = buildSitemapXml(website as unknown as SiteWebsite);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(xml);
    return;
  }

  if (req.path === "/robots.txt") {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(buildRobotsTxt(website as unknown as Pick<SiteWebsite, "slug" | "customDomain" | "customDomainStatus">));
    return;
  }

  if (await isWebsiteSuspendedOrCanceled(website.storeid)) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(503).send(underMaintenanceHtml(slug));
    return;
  }

  // Auto-mode: server-render the GlossGenius-style page instead of serving a template
  if ((website as any).publisherType === "auto" || (website as any).publisher_type === "auto") {
    await serveAutoPage(website, res);
    return;
  }

  // Derive sub-path from req.path — more reliable than Express 5 wildcard params
  const sitePrefix = `/tenant/${slug}/site`;
  const splat = req.path.startsWith(sitePrefix + "/")
    ? req.path.slice(sitePrefix.length + 1)
    : undefined;
  const basePath = `/api/tenant/${slug}/site`;
  await serveTenantSite(website, splat, basePath, res);
}

// ── Tenant site by custom domain (reads Host header; called from Nginx) ───────

export async function handleTenantSiteByDomain(req: Request, res: Response): Promise<void> {
  // Nginx sets X-Forwarded-Host; fall back to Host header
  const host = (req.headers["x-forwarded-host"] as string | undefined)
    ?? req.get("host")
    ?? "";

  // Strip port if present
  const domain = host.split(":")[0].toLowerCase().trim();

  if (!domain) {
    res.status(400).send("Missing Host header");
    return;
  }

  const [website] = await db
    .select()
    .from(websitesTable)
    .where(eq(websitesTable.customDomain, domain));

  if (!website) {
    res.status(404).send(notFoundHtml(domain));
    return;
  }

  // Check store account status — suspended/canceled stores show maintenance page.
  if (await isWebsiteSuspendedOrCanceled(website.storeid)) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(503).send(underMaintenanceHtml(domain));
    return;
  }

  // During DNS verification or payment — serve the ownership-verification "coming soon" page
  // so the automated HTTP check can find the token in the page meta tag.
  if (
    website.customDomainStatus === "pending_dns" ||
    website.customDomainStatus === "pending_payment"
  ) {
    const token = website.customDomainToken ?? "";
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(domainValidationPageHtml(domain, token));
    return;
  }

  // Only serve the real site when the domain is active and the website is published
  if (website.customDomainStatus !== "active" || !website.published) {
    res.status(404).send(notFoundHtml(domain));
    return;
  }

  // Serve sitemap.xml and robots.txt for custom-domain sites
  if (req.path === "/sitemap.xml") {
    const xml = buildSitemapXml(website);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(xml);
    return;
  }
  if (req.path === "/robots.txt") {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(buildRobotsTxt(website));
    return;
  }

  // Auto-mode: server-render the GlossGenius-style page instead of serving a template
  if ((website as any).publisherType === "auto" || (website as any).publisher_type === "auto") {
    await serveAutoPage(website as Record<string, unknown>, res);
    return;
  }

  const sitePrefix = "";
  const splat = req.path.startsWith("//")
    ? req.path.slice(1)
    : req.path === "/" || req.path === ""
      ? undefined
      : req.path.slice(1);
  await serveTenantSite(website, splat, sitePrefix, res);
}

function domainValidationPageHtml(domain: string, token: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="certxa-domain-verify" content="${token}">
  <title>${domain} — Coming Soon</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:system-ui,sans-serif;background:#0F0A1A;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:2rem}
    .card{max-width:520px}
    .logo{font-size:1.15rem;font-weight:800;letter-spacing:-.02em;color:#fff;margin-bottom:2.5rem}
    .logo .dot{color:#C97B2B}
    h1{font-size:2.5rem;font-weight:700;margin-bottom:1rem;background:linear-gradient(135deg,#fff 40%,#C97B2B 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
    p{color:#9ca3af;line-height:1.7;margin-bottom:.5rem}
    .domain{font-weight:600;color:#d1b3f5}
    .badge{display:inline-block;margin-top:2.5rem;padding:.5rem 1.75rem;background:#1A0333;border:1px solid #3B0764;border-radius:50px;font-size:.85rem;color:#9d7ec4}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Cert<span class="dot">X</span>A<span class="dot">.</span></div>
    <h1>Coming Soon</h1>
    <p><span class="domain">${domain}</span> is getting ready.</p>
    <p>This website is currently being set up. Please check back soon.</p>
    <div class="badge">Powered by CertXA</div>
  </div>
</body>
</html>`;
}

function notFoundHtml(identifier: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Website Not Found</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:system-ui,sans-serif;background:#0F0A1A;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:2rem}
    .card{max-width:480px}
    h1{font-size:2rem;font-weight:700;margin-bottom:1rem;color:#C97B2B}
    p{color:#9ca3af;line-height:1.6}
    .badge{display:inline-block;margin-top:1.5rem;padding:.5rem 1.5rem;background:#1A0333;border:1px solid #3B0764;border-radius:50px;font-size:.85rem;color:#d1b3f5}
  </style>
</head>
<body>
  <div class="card">
    <h1>404 — Not Found</h1>
    <p>The website <strong>${identifier}</strong> doesn't exist or hasn't been published yet.</p>
    <div class="badge">Powered by CertXA</div>
  </div>
</body>
</html>`;
}

// ── Build store data injection script (for users without a website) ────────────
// Generates an inline <script> that:
//   1. Sets window.__CERTXA_SLUG__ so the template's useSiteData() hook activates
//   2. Intercepts the /api/tenant/:slug/data fetch and returns the real store data
//   3. No template source code changes needed — works with any pre-built template

export type StorePreviewData = TenantData;

async function fetchStorePreviewData(storeid: number): Promise<StorePreviewData | null> {
  try {
    // Keep standalone template previews on the same data contract as
    // published websites. The older hand-written queries here omitted fields
    // such as service descriptions, active flags, and gallery photos.
    const { buildTenantData } = await import("./tenant-data");
    const fakeWebsite = {
      id: 0,
      name: `Preview salon ${storeid}`,
      slug: `preview-store-${storeid}`,
    };
    return await buildTenantData(storeid, fakeWebsite);
  } catch (err) {
    logger.warn({ err, storeid }, "Failed to fetch store preview data");
    return null;
  }
}

function buildStoreDataScript(data: StorePreviewData, slug = data.website.slug): string {
  const json = JSON.stringify(data);
  return `<script>
(function(){
  var STORE_DATA=${json};
  // Set the real website slug so data-aware templates activate.
  window.__CERTXA_SLUG__=${JSON.stringify(slug)};
  // Intercept the tenant data request before the template can fall back to
  // its hardcoded demo content. Support both string URLs and Request objects.
  var origFetch=window.fetch;
  window.fetch=function(u,o){
    var url=typeof u==='string'?u:(u&&u.url)||'';
    if(url.indexOf('/api/tenant/'+${JSON.stringify(slug)}+'/data')>=0){
      return Promise.resolve(new Response(JSON.stringify(STORE_DATA),{status:200,headers:{'Content-Type':'application/json'}}));
    }
    return origFetch.apply(this,arguments);
  };
})();
<\/script>`;
}

// ── Template preview handler ──────────────────────────────────────────────────

export async function handleTemplatePreview(req: Request, res: Response): Promise<void> {
  const raw = req.params.id;
  const id = parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
  if (isNaN(id)) { res.status(400).send("Invalid template ID"); return; }

  const [template] = await db.select().from(templatesTable).where(eq(templatesTable.id, id));
  if (!template) { res.status(404).send("Template not found"); return; }
  if (!template.filesPath || !fs.existsSync(template.filesPath)) {
    res.status(422).send("Template files not found on disk"); return;
  }

  const projectDir = findProjectDir(template.filesPath);
  const distDir = findDistDir(projectDir);
  if (!distDir) {
    res.status(422).send("<html><body><p>Template is still being built. Please wait and refresh.</p></body></html>");
    return;
  }

  const query = req.query as Record<string, string>;
  let replacementScript = "";
  let previewDataScript = "";
  let seo: SeoMeta = {
    canonical: `${process.env.APP_URL ?? "https://certxa.com"}/templates/${id}/preview`,
  };

  // ── Option 1: ?websiteId — inject saved website content (fields, blockOps, imageOps)
  const websiteId = query.websiteId ? parseInt(query.websiteId, 10) : NaN;
  if (!isNaN(websiteId)) {
    try {
      const [website] = await db
        .select()
        .from(websitesTable)
        .where(eq(websitesTable.id, websiteId));
      if (website) {
        const content = website.content as { fields?: ContentField[]; blockOps?: BlockOps; imageOps?: Record<string, string>; colorOps?: ColorOps; seo?: TenantSeoOverrides } | null;
        const fields: ContentField[] = content?.fields ?? [];
        const blockOps: BlockOps = content?.blockOps ?? { order: [], deleted: [] };
        const imageOps: Record<string, string> = content?.imageOps ?? {};
        const colorOps: ColorOps = content?.colorOps ?? {};
        const savedSeo: TenantSeoOverrides = content?.seo ?? {};
        seo = { ...seo, ...savedSeo };
        if (website.storeid) {
          try {
            const { buildTenantData } = await import("./tenant-data");
            const tenantData = await buildTenantData(Number(website.storeid), {
              id: website.id,
              name: website.name,
              slug: website.slug,
            });
            previewDataScript = buildStoreDataScript(tenantData, website.slug);
            seo = buildTenantSeo(
              tenantData,
              `${process.env.APP_URL ?? "https://certxa.com"}/${website.slug}`,
              savedSeo,
            );
          } catch (err) {
            logger.warn({ err, websiteId }, "Failed to load live salon data for template preview");
          }
        }
        replacementScript = buildReplacementScript(fields) + buildBlockOpsScript(blockOps) + buildImageOpsScript(imageOps) + buildColorOpsScript(colorOps);
      }
    } catch (err) {
      logger.warn({ err, websiteId }, "Failed to load website content for template preview");
    }
  }

  // ── Option 2: ?storeId — inject store data for users without a website
  if (!replacementScript && query.storeId) {
    const storeid = parseInt(query.storeId, 10);
    if (!isNaN(storeid)) {
      try {
        const storeData = await fetchStorePreviewData(storeid);
        if (storeData) {
          previewDataScript = buildStoreDataScript(storeData);
          seo = buildTenantSeo(
            storeData,
            `${process.env.APP_URL ?? "https://certxa.com"}/templates/${id}/preview`,
          );
        }
      } catch (err) {
        logger.warn({ err, storeid }, "Failed to load store data for template preview");
      }
    }
  }

  // Derive sub-path from req.path
  const previewPrefix = `/templates/${id}/preview`;
  const splat = req.path.startsWith(previewPrefix + "/")
    ? req.path.slice(previewPrefix.length + 1)
    : undefined;
  const basePath = `/api/templates/${id}/preview`;
  // Put the live-data bridge in <head>, before the template bundle mounts.
  // Appending it before </body> races React's initial data hook and caused
  // intermittent fallback to the template's hardcoded demo content.
  serveDistFile(
    distDir,
    splat,
    basePath,
    replacementScript,
    res,
    previewDataScript || undefined,
    seo,
    undefined,
    seo.canonical,
  );
}

// ── Website preview handler ───────────────────────────────────────────────────

export async function handleWebsitePreview(req: Request, res: Response): Promise<void> {
  const raw = req.params.id;
  const id = parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
  if (isNaN(id)) { res.status(400).send("Invalid website ID"); return; }

  const [website] = await db.select().from(websitesTable).where(eq(websitesTable.id, id));
  if (!website) { res.status(404).send("Website not found"); return; }
  if (!website.templateId) {
    res.status(422).send("<html><body><p>No template assigned to this website.</p></body></html>");
    return;
  }

  const [template] = await db.select().from(templatesTable).where(eq(templatesTable.id, website.templateId));
  if (!template || !template.filesPath || !fs.existsSync(template.filesPath)) {
    res.status(422).send("<html><body><p>Template files not found.</p></body></html>");
    return;
  }

  const projectDir = findProjectDir(template.filesPath);
  const distDir = findDistDir(projectDir);
  if (!distDir) {
    res.status(422).send("<html><body><p>Template not yet built. Please wait.</p></body></html>");
    return;
  }

  const content = website.content as { fields?: ContentField[]; blockOps?: BlockOps; imageOps?: Record<string, string>; colorOps?: ColorOps; seo?: TenantSeoOverrides } | null;
  const fields: ContentField[] = content?.fields ?? [];
  const blockOps: BlockOps = content?.blockOps ?? { order: [], deleted: [] };
  const imageOps: Record<string, string> = content?.imageOps ?? {};
  const colorOps: ColorOps = content?.colorOps ?? {};
  const savedSeo: TenantSeoOverrides = content?.seo ?? {};
  let seo: SeoMeta = {
    canonical: siteBaseUrl(website),
    ...savedSeo,
  };
  if (website.storeid) {
    try {
      const { buildTenantData } = await import("./tenant-data");
      const tenantData = await buildTenantData(website.storeid, {
        id: website.id,
        name: website.name,
        slug: website.slug,
      });
      seo = buildTenantSeo(tenantData, siteBaseUrl(website), savedSeo);
    } catch (err) {
      logger.warn({ err, websiteId: website.id }, "Failed to build live tenant SEO for website preview");
    }
  }

  // ?editor=1 → inject the visual inline-editing script instead of simple replacement
  const editorMode = (req.query as Record<string, string>).editor === "1";
  const injectedScript = editorMode
    ? buildEditorScript(fields, blockOps) + buildImageOpsScript(imageOps) + buildColorOpsScript(colorOps)
    : buildReplacementScript(fields) + buildBlockOpsScript(blockOps) + buildImageOpsScript(imageOps) + buildColorOpsScript(colorOps);

  // Derive sub-path from req.path — more reliable than Express 5 wildcard params
  const previewPrefix = `/websites/${id}/preview`;
  const splat = req.path.startsWith(previewPrefix + "/")
    ? req.path.slice(previewPrefix.length + 1)
    : undefined;
  const basePath = `/api/websites/${id}/preview`;
  const slugScript = `<script>window.__CERTXA_SLUG__=${JSON.stringify(website.slug)};window.__CERTXA_API_BASE__='';</script>`;
  // Only inject SEO tags in preview (not editor mode) — editor doesn't need live meta
  serveDistFile(
    distDir,
    splat,
    basePath,
    injectedScript,
    res,
    slugScript,
    editorMode ? undefined : seo,
    undefined,
    editorMode ? undefined : seo.canonical,
  );
}
