// build-site.mjs — ZERO-RED SEO builder
import "dotenv/config";
import fs from "fs";
import path from "path";
import { marked } from "marked";

const siteUrl = (process.env.SITE_BASE_URL || "https://blog.flowzex.com").replace(/\/$/,"");
const mainUrl = (process.env.MAIN_SITE_URL || "https://flowzex.com").replace(/\/$/,"");

const contentRoot = path.join(process.cwd(), "content");
const publicRoot = path.join(process.cwd(), "public");

console.log("▶ Build starting...");

// ---------- helpers ----------
function walk(dir){ const out=[]; if(!fs.existsSync(dir)) return out;
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,e.name);
    if(e.isDirectory()) out.push(...walk(p));
    else if(e.isFile() && p.toLowerCase().endsWith(".md")) out.push(p);
  } return out;
}
function wordCount(s){ return (s.match(/\b\w+\b/g)||[]).length; }
function slugify(s){ return s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,""); }
function cleanText(s){
  return (s||"").replace(/[#>*_`]/g," ").replace(/\[(.*?)\]\(.*?\)/g,"$1").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
}
function smartSlice(str, max){ if(str.length<=max) return str;
  const cut=str.slice(0,max); const i=cut.lastIndexOf(" "); return (i>40?cut.slice(0,i):cut).replace(/[ ,;:.!-]+$/,"");
}
function extractMeta(md){
  const lines=md.split(/\r?\n/);
  const h1line=lines.find(l=>l.trim().startsWith("# "));
  const titleRaw=h1line? h1line.replace(/^#\s*/,"").trim() : "Article";
  const body=cleanText(md);
  const desc=smartSlice(body && body!==titleRaw? body : `${titleRaw} — Flowzex insights`, 155);
  return { title:titleRaw, desc };
}
function seoTitle(base, suffix=" | Flowzex Blog"){
  let t=base.replace(/\s+\|\s+.*$/,"");
  if(t.length>60) t=smartSlice(t,60);
  if(t.length<35 && (t+suffix).length<=60) t+=suffix;
  return t;
}
function addHeadingIds(html){
  const used=new Set();
  const idFor=t=>{ let id=slugify(t),i=2; while(used.has(id)) id=`${id}-${i++}`; used.add(id); return id; };
  html=html.replace(/<h2>([^<]+)<\/h2>/g,(_,t)=>`<h2 id="${idFor(t)}">${t}</h2>`);
  html=html.replace(/<h3>([^<]+)<\/h3>/g,(_,t)=>`<h3 id="${idFor(t)}">${t}</h3>`);
  return html;
}
function stripFirstH1(html){ return html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i,""); }
function ensureH2s(html){
  const count=(html.match(/<h2\b/gi)||[]).length;
  if(count>=2) return html;
  if(count===0) return `<h2>Overview</h2>\n`+html+`\n<h2>Key Takeaways</h2>`;
  return html+`\n<h2>Next Steps</h2>`;
}
function ensureImgAlts(html, title){
  return html.replace(/<img([^>]*?)>/gi, (m,attrs)=>{
    if(/\balt\s*=/.test(attrs)) return `<img${attrs}>`;
    return `<img${attrs} alt="${title}">`;
  });
}
function buildTOC(html){
  const items=[]; html.replace(/<h2 id="([^"]+)">([^<]+)<\/h2>/g,(_,id,text)=>{items.push({id,text}); return "";});
  if(!items.length) return "";
  return `<nav class="toc"><div class="toc-title">📍 Quick Navigation</div><ul>${items.map(i=>`<li><a href="#${i.id}">${i.text}</a></li>`).join("")}</ul></nav>`;
}
function readingTime(words){ return Math.max(3, Math.round(words/220)); }

// ---------- page shell ----------
function pageShell({ title, desc, canonical, jsonLd, body, ogType="article", inlineScript="" }){
  const robots="index,follow"; const pageTitle=seoTitle(title);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${pageTitle}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${desc}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="${robots}">
<meta property="og:title" content="${pageTitle}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="${ogType}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ctext y='.9em' font-size='52'%3E🚀%3C/text%3E%3C/svg%3E">
<script type="application/ld+json">
${JSON.stringify(jsonLd,null,2)}
</script>
<style>
:root{--bg:#0a0e1a;--bg2:#16213e;--card:rgba(20,30,54,.6);--card2:rgba(25,38,68,.8);--text:#f0f6ff;--muted:#8fa3bd;--accent:#6366f1;--accent2:#06b6d4;--border:rgba(148,163,184,.18)}
*{box-sizing:border-box;margin:0;padding:0}html{scroll-behavior:smooth}
body{background:linear-gradient(135deg,var(--bg) 0%,#1a1a2e 35%,var(--bg2) 100%);color:var(--text);font-family:Inter,system-ui,Segoe UI,Arial,sans-serif;line-height:1.7}
a{color:var(--accent)}a:hover{color:var(--accent2)}
.container{max-width:1200px;margin:0 auto;padding:0 2rem}
.nav{position:sticky;top:0;z-index:50;background:rgba(10,14,26,.85);backdrop-filter:blur(12px);border-bottom:1px solid rgba(255,255,255,.08)}
.nav-inner{display:flex;align-items:center;justify-content:space-between;padding:14px 24px}
.brand{font-weight:800;background:linear-gradient(135deg,#6366f1,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.btn{display:inline-block;background:linear-gradient(135deg,#6366f1,#06b6d4);color:#fff;padding:12px 16px;border-radius:14px;text-decoration:none}
.hero{padding:80px 0 32px;text-align:center}
.h1{font-size:clamp(32px,5vw,56px);font-weight:800;line-height:1.1;margin:10px 0 12px;background:linear-gradient(135deg,#6366f1,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px;margin:26px 0}
.card{background:var(--card);border:1px solid rgba(255,255,255,.10);border-radius:22px;padding:18px}
.small{color:var(--muted);font-size:13px}
.toc{position:sticky;top:96px;background:var(--card);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:14px}
.footer{margin-top:48px;border-top:1px solid rgba(255,255,255,.08);padding:24px;text-align:center;color:var(--muted)}
</style></head>
<body>
<div class="nav"><div class="nav-inner container">
  <div class="brand">🚀 Flowzex <span style="opacity:.7">Blog</span></div>
  <div><a href="/index.html">Blog</a> · <a href="${mainUrl}/" target="_blank">Flowzex.com</a> · <a class="btn" href="${mainUrl}/#demo" target="_blank">Get Demo ✨</a></div>
</div></div>
${body}
<div class="footer container">© ${new Date().getFullYear()} Flowzex — AI-powered calling.</div>
<script>${inlineScript}</script>
</body></html>`;
}

// ---------- collect content ----------
fs.rmSync(publicRoot,{recursive:true,force:true});
fs.mkdirSync(publicRoot,{recursive:true});
let catsCfg={categories:[]}; try{catsCfg=JSON.parse(fs.readFileSync("categories.json","utf8"));}catch{}
const catsList=(catsCfg.categories||[]).map(c=>({slug:c.slug,name:c.name}));
const catsMeta=Object.fromEntries(catsList.map(c=>[c.slug,c.name]));
const files=walk(contentRoot);
console.log(`▶ Found ${files.length} markdown files under ${contentRoot}`);

const all=[];
for(const file of files){
  const rel=path.relative(contentRoot,file);
  const parts=rel.split(path.sep);
  const cat=parts.length>=3? parts[1] : "educational-hub";
  const md=fs.readFileSync(file,"utf8");
  const {title,desc}=extractMeta(md);
  let html=marked.parse(md);
  html=addHeadingIds(html);
  html=stripFirstH1(html);
  html=ensureH2s(html);
  html=ensureImgAlts(html,title);
  const base=path.basename(file,".md");
  const slug=slugify(base);
  const stat=fs.statSync(file);
  const wc=wordCount(md);
  all.push({file,cat,md,html,title,desc,slug,date:stat.mtime,words:wc});
}
const byCat={}; for(const a of all){ (byCat[a.cat] ||= []).push(a); }
console.log(`▶ Grouped into ${Object.keys(byCat).length} categories`);

// ---------- ARTICLE PAGES ----------
for(const a of all){
  const canonical=`${siteUrl}/${a.cat}/${a.slug}/`;
  const toc=buildTOC(a.html);
  const readMins=readingTime(a.words);
  const siblings=(byCat[a.cat]||[]).filter(x=>x.slug!==a.slug).slice(0,3);

  const jsonLd=[
    {"@context":"https://schema.org","@type":"Article","headline":a.title,"description":a.desc,"wordCount":a.words,"timeRequired":`PT${readMins}M`,"datePublished":new Date(a.date).toISOString(),"mainEntityOfPage":canonical,"articleSection":catsMeta[a.cat]||a.cat,"author":{"@type":"Organization","name":"Flowzex"},"publisher":{"@type":"Organization","name":"Flowzex"}},
    {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Home","item":`${siteUrl}/`},
      {"@type":"ListItem","position":2,"name":catsMeta[a.cat]||a.cat,"item":`${siteUrl}/${a.cat}/`},
      {"@type":"ListItem","position":3,"name":a.title,"item":canonical}
    ]}
  ];

  const hero=`<section class="hero"><div class="container">
    <div class="small">${catsMeta[a.cat]||a.cat} · ⏱️ ${readMins} min</div>
    <h1 class="h1">${a.title}</h1>
    <p class="small">${a.desc}</p>
  </div></section>`;

  const body=`
  ${hero}
  <div class="container" style="display:grid;grid-template-columns:300px 1fr;gap:22px;align-items:start">
    ${toc || "<div></div>"}
    <article class="card">
      ${a.html}
      <div class="card" style="margin-top:16px">
        <h2>See Flowzex in action</h2>
        <p class="small">AI-powered calling with compliance, analytics, and CRM integrations.</p>
        <a class="btn" href="${mainUrl}/#demo" target="_blank">Get a demo →</a>
      </div>
      ${siblings.length? `<section style="margin-top:18px"><h2>Further Reading</h2><ul class="small" style="list-style:none;padding-left:0">${siblings.map(r=>`<li style="margin:8px 0"><a href="/${r.cat}/${r.slug}/">${r.title}</a></li>`).join("")}</ul></section>` : ""}
    </article>
  </div>`;

  const outDir=path.join(publicRoot,a.cat,a.slug);
  fs.mkdirSync(outDir,{recursive:true});
  fs.writeFileSync(path.join(outDir,"index.html"), pageShell({
    title:a.title, desc:a.desc, canonical, jsonLd, body, ogType:"article"
  }),"utf8");
}

// ---------- CATEGORY PAGES ----------
function categoryDesc(name,count){
  const base = `${name} guides, comparisons, and real-world playbooks for AI cold calling and outreach. Explore ${count} long-form articles covering scripts, workflows, compliance, and best practices.`;
  return smartSlice(base,155);
}
for(const [cat,items] of Object.entries(byCat)){
  const canonical=`${siteUrl}/${cat}/`;
  const cards=items.map(i=>`
    <div class="card">
      <div class="small">📅 ${new Date(i.date).toLocaleDateString()}</div>
      <h3><a href="/${cat}/${i.slug}/">${i.title}</a></h3>
      <p class="small">${i.desc}</p>
      <div class="small">⏱️ ${readingTime(i.words)} min</div>
    </div>`).join("");
  const title=catsMeta[cat]||cat;
  const desc=categoryDesc(title, items.length);

  const hero=`<section class="hero"><div class="container">
    <div class="small">📂 Category</div>
    <h1 class="h1">${title}</h1>
    <p class="small">${desc}</p>
  </div></section>`;

  const body=`${hero}<div class="container"><div class="grid">${cards}</div></div>`;
  const jsonLd=[
    {"@context":"https://schema.org","@type":"CollectionPage","name":title,"mainEntityOfPage":canonical},
    {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Home","item":`${siteUrl}/`},
      {"@type":"ListItem","position":2,"name":title,"item":canonical}
    ]}
  ];

  const outDir=path.join(publicRoot,cat);
  fs.mkdirSync(outDir,{recursive:true});
  fs.writeFileSync(path.join(outDir,"index.html"), pageShell({
    title, desc, canonical, jsonLd, body, ogType:"website"
  }),"utf8");
}

// ---------- HOMEPAGE ----------
const latest=[...all].sort((a,b)=>b.date-a.date).slice(0,8);
const latestCards=latest.map(a=>`
  <div class="card"><div class="small">${catsMeta[a.cat]||a.cat} · ${new Date(a.date).toLocaleDateString()}</div>
  <h3><a href="/${a.cat}/${a.slug}/">${a.title}</a></h3><p class="small">${a.desc}</p></div>`).join("");
const catCards=Object.entries(byCat).map(([cat,items])=>`
  <div class="card"><h3><a href="/${cat}/">${catsMeta[cat]||cat}</a></h3>
  <p class="small">${items.length} article${items.length>1?"s":""}</p></div>`).join("");

const homeHero=`<section class="hero"><div class="container">
  <div class="small">🚀 Flowzex Blog</div>
  <h1 class="h1">AI Sales & Cold Calling Mastery</h1>
  <p class="small">Deep guides, comparisons, and playbooks with schema, internal links, and clear CTAs that point to Flowzex.</p>
</div></section>`;

const homeBody=`${homeHero}
<div class="container">
  <h2 style="margin-top:12px">🔥 Latest Insights</h2>
  <div class="grid">${latestCards}</div>
  <h2>📖 Explore Topics</h2>
  <div class="grid">${catCards}</div>
  <div class="card"><h2>See Flowzex in action</h2>
    <p class="small">AI-powered calling with compliance, analytics, and CRM integrations.</p>
    <a class="btn" href="${mainUrl}/#demo" target="_blank">Get a demo →</a>
  </div>
</div>`;

fs.writeFileSync(path.join(publicRoot,"index.html"), pageShell({
  title:"Flowzex Blog",
  desc:"Master AI-powered sales with long-form guides, comparisons, and playbooks for cold calling and outbound.",
  canonical:`${siteUrl}/`,
  jsonLd:[{"@context":"https://schema.org","@type":"Organization","name":"Flowzex","url":mainUrl,"logo":`${mainUrl}/favicon.ico`}],
  body: homeBody,
  ogType:"website"
}),"utf8");

// ---------- sitemap + robots ----------
const urls=[]; const add=u=>urls.push((siteUrl+"/"+u.replace(/^\//,"")).replace(/\/+/g,"/"));
add("/"); for(const [cat,items] of Object.entries(byCat)){ add(`${cat}/`); for(const i of items) add(`${cat}/${i.slug}/`); }
fs.writeFileSync(path.join(publicRoot,"sitemap.xml"),
`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u=>`<url><loc>${u}</loc><lastmod>${new Date().toISOString()}</lastmod></url>`).join("\n")}
</urlset>`,"utf8");
fs.writeFileSync(path.join(publicRoot,"robots.txt"),`User-agent: *
Allow: /
Sitemap: ${siteUrl}/sitemap.xml
`,"utf8");

console.log(`✅ Built ${files.length} articles across ${Object.keys(byCat).length} categories → ${publicRoot}`);
