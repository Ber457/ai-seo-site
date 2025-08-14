// scripts/build-site.mjs (Ultra-Modern UI + Search + Latest + Start Here) 
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { marked } from 'marked';

const siteUrl = (process.env.SITE_BASE_URL || 'https://blog.flowzex.com').replace(/\/$/,'');
const mainUrl = (process.env.MAIN_SITE_URL || 'https://flowzex.com').replace(/\/$/,'');

const contentRoot = path.join(process.cwd(), 'content');
const publicRoot = path.join(process.cwd(), 'public');

console.log('▶ Build starting...');

// ---------- helpers ----------
function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...walk(p));
    else if (item.isFile() && p.toLowerCase().endsWith('.md')) out.push(p);
  }
  return out;
}
function wordCount(s){ return (s.match(/\b\w+\b/g) || []).length; }
function slugify(s){ return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); }
function extractMeta(md) {
  const lines = md.split(/\r?\n/);
  const h1 = lines.find(l => l.trim().startsWith('# '));
  const title = h1 ? h1.replace(/^#\s*/, '').trim() : 'Article';
  const body = md.replace(/[#>*_`]/g, ' ').replace(/\s+/g, ' ').trim();
  const desc = body.slice(0, 180);
  return { title, desc };
}
function addHeadingIds(html) {
  const used = new Set();
  function idFor(t){
    let id = slugify(t);
    let i=2;
    while(used.has(id)){ id = `${id}-${i++}`; }
    used.add(id);
    return id;
  }
  html = html.replace(/<h2>([^<]+)<\/h2>/g, (_,t)=>`<h2 id="${idFor(t)}">${t}</h2>`);
  html = html.replace(/<h3>([^<]+)<\/h3>/g, (_,t)=>`<h3 id="${idFor(t)}">${t}</h3>`);
  return html;
}
function buildTOC(html) {
  const items = [];
  html.replace(/<h2 id="([^"]+)">([^<]+)<\/h2>/g, (_,id,text)=>{ items.push({id,text}); return ''; });
  if (!items.length) return '';
  const lis = items.map(i=>`<li><a href="#${i.id}">${i.text}</a></li>`).join('');
  return `<nav class="toc"><div class="toc-title">📍 Quick Navigation</div><ul>${lis}</ul></nav>`;
}
function readingTime(words){ return Math.max(3, Math.round(words/220)); }

// ---------- Ultra-Modern HTML shell with premium styling ----------
function pageShell({ title, desc, canonical, jsonLd, body, inlineScript = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${desc}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index,follow">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ctext y='.9em' font-size='52'%3E🚀%3C/text%3E%3C/svg%3E">
<script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
</script>
<style>
:root {
  /* Dark theme - cyberpunk inspired */
  --bg: linear-gradient(135deg, #0a0e1a 0%, #1a1a2e 35%, #16213e 100%);
  --bg-solid: #0a0e1a;
  --bg-soft: #151b2e;
  --card: rgba(20, 30, 54, 0.6);
  --card-hover: rgba(25, 38, 68, 0.8);
  --glass: rgba(255, 255, 255, 0.05);
  --glass-border: rgba(255, 255, 255, 0.1);
  --text: #f0f6ff;
  --text-soft: #cbd5e1;
  --muted: #8fa3bd;
  --accent: #6366f1;
  --accent2: #06b6d4;
  --accent3: #8b5cf6;
  --success: #10b981;
  --warning: #f59e0b;
  --danger: #ef4444;
  --border: rgba(148, 163, 184, 0.1);
  --shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 35px 80px -15px rgba(0, 0, 0, 0.6);
  --gradient: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 50%, var(--accent3) 100%);
  --gradient-text: linear-gradient(135deg, #6366f1 0%, #06b6d4 40%, #8b5cf6 100%);
  --blur: 16px;
}

@media (prefers-color-scheme: light) {
  :root {
    --bg: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 35%, #e2e8f0 100%);
    --bg-solid: #ffffff;
    --bg-soft: #f8fafc;
    --card: rgba(255, 255, 255, 0.8);
    --card-hover: rgba(255, 255, 255, 0.95);
    --glass: rgba(255, 255, 255, 0.25);
    --glass-border: rgba(148, 163, 184, 0.2);
    --text: #0f172a;
    --text-soft: #334155;
    --muted: #64748b;
    --border: rgba(148, 163, 184, 0.2);
    --shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.1);
    --shadow-lg: 0 35px 80px -15px rgba(0, 0, 0, 0.15);
  }
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; font-size: 16px; }
body {
  background: var(--bg); background-attachment: fixed; color: var(--text);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 400; line-height: 1.7; overflow-x: hidden; position: relative;
}
body::before {
  content: '';
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: radial-gradient(circle at 25% 25%, rgba(99, 102, 241, 0.1) 0%, transparent 50%),
              radial-gradient(circle at 75% 75%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
              radial-gradient(circle at 50% 100%, rgba(6, 182, 212, 0.05) 0%, transparent 50%);
  pointer-events: none; z-index: -1;
}

/* Typography */
.h1 {
  font-size: clamp(2.5rem, 5vw, 4rem); font-weight: 800; line-height: 1.1;
  background: var(--gradient-text); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
  margin: 0.5rem 0 1rem; letter-spacing: -0.02em;
}
h2, h3, h4 { font-weight: 700; line-height: 1.3; color: var(--text); margin: 2rem 0 1rem; }
h2 { font-size: 1.875rem; } h3 { font-size: 1.5rem; }
p { color: var(--text-soft); margin: 1rem 0; max-width: 65ch; }
a { color: var(--accent); text-decoration: none; transition: all 0.2s ease; }
a:hover { color: var(--accent2); text-decoration: underline; }

/* Layout */
.container { max-width: 1200px; margin: 0 auto; padding: 0 2rem; }

/* Navigation */
.nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; background: rgba(10, 14, 26, 0.8);
  backdrop-filter: blur(var(--blur)); border-bottom: 1px solid var(--glass-border); transition: all 0.3s ease; }
.nav-inner { display: flex; align-items: center; justify-content: space-between; padding: 1rem 2rem; max-width: 1200px; margin: 0 auto; }
.brand { font-weight: 800; font-size: 1.25rem; background: var(--gradient-text); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; letter-spacing: -0.01em; }
.nav-links { display: flex; align-items: center; gap: 2rem; font-weight: 500; }
.nav .btn { background: var(--gradient); color: white; padding: 0.75rem 1.5rem; border-radius: 50px; font-weight: 600; font-size: 0.9rem; border: none; cursor: pointer; transition: all 0.3s ease; box-shadow: var(--shadow); position: relative; overflow: hidden; }
.nav .btn::before { content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); transition: left 0.5s ease; }
.nav .btn:hover::before { left: 100%; }
.nav .btn:hover { transform: translateY(-2px); box-shadow: 0 35px 80px -15px rgba(99, 102, 241, 0.4); }

/* Hero */
.hero { padding: 8rem 2rem 4rem; text-align: center; position: relative; }
.hero::before { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 800px; height: 800px; background: radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, transparent 70%); pointer-events: none; z-index: -1; }
.kicker { display: inline-block; background: var(--glass); border: 1px solid var(--glass-border); color: var(--accent); padding: 0.5rem 1rem; border-radius: 50px; font-weight: 600; font-size: 0.875rem; margin-bottom: 1rem; backdrop-filter: blur(8px); letter-spacing: 0.5px; text-transform: uppercase; }
.hero p { font-size: 1.25rem; color: var(--muted); max-width: 700px; margin: 1.5rem auto; line-height: 1.6; }

/* Cards */
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 2rem; margin: 3rem 0; }
.card { background: var(--card); backdrop-filter: blur(var(--blur)); border: 1px solid var(--glass-border); border-radius: 24px; padding: 2rem; transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden; box-shadow: var(--shadow); }
.card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, var(--accent), transparent); opacity: 0; transition: opacity 0.3s ease; }
.card:hover { transform: translateY(-8px) scale(1.02); background: var(--card-hover); box-shadow: var(--shadow-lg); border-color: rgba(99, 102, 241, 0.3); }
.card:hover::before { opacity: 1; }
.card h3, .card h4 { font-weight: 700; margin: 0 0 0.75rem; color: var(--text); }
.card .small { color: var(--muted); font-size: 0.875rem; font-weight: 500; }
.card a { color: inherit; text-decoration: none; }

/* Search */
.search { margin: 3rem auto; max-width: 600px; position: relative; }
#q { width: 100%; padding: 1.25rem 1.5rem; border-radius: 16px; border: 1px solid var(--glass-border); background: var(--card); backdrop-filter: blur(var(--blur)); color: var(--text); font-size: 1.1rem; font-family: inherit; outline: none; transition: all 0.3s ease; box-shadow: var(--shadow); }
#q:focus { border-color: var(--accent); box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1), var(--shadow-lg); transform: scale(1.02); }
#q::placeholder { color: var(--muted); }
.results { position: absolute; top: 100%; left: 0; right: 0; margin-top: 0.5rem; background: var(--card); backdrop-filter: blur(var(--blur)); border: 1px solid var(--glass-border); border-radius: 16px; box-shadow: var(--shadow-lg); max-height: 400px; overflow-y: auto; z-index: 10; }
.res { padding: 1.5rem; border-bottom: 1px solid var(--border); transition: background 0.2s ease; }
.res:hover { background: var(--glass); }
.res:last-child { border-bottom: none; }

/* Buttons */
.btn { display: inline-flex; align-items: center; gap: 0.5rem; background: var(--gradient); color: white; padding: 1rem 2rem; border-radius: 16px; font-weight: 600; font-size: 1rem; border: none; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: var(--shadow); position: relative; overflow: hidden; text-decoration: none; }
.btn::before { content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); transition: left 0.5s ease; }
.btn:hover::before { left: 100%; }
.btn:hover { transform: translateY(-4px) scale(1.05); box-shadow: 0 35px 80px -15px rgba(99, 102, 241, 0.4); }

/* Badges */
.badge { display: inline-flex; align-items: center; gap: 0.25rem; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); color: var(--accent); padding: 0.375rem 0.75rem; border-radius: 50px; font-size: 0.75rem; font-weight: 600; margin-left: 0.5rem; backdrop-filter: blur(4px); }

/* TOC */
.toc { background: var(--card); backdrop-filter: blur(var(--blur)); border: 1px solid var(--glass-border); border-radius: 16px; padding: 1.5rem; margin: 2rem 0; position: sticky; top: 120px; box-shadow: var(--shadow); }
.toc-title { font-weight: 700; font-size: 1rem; margin-bottom: 1rem; color: var(--text); }
.toc ul { list-style: none; }
.toc li { margin: 0.5rem 0; }
.toc a { color: var(--muted); padding: 0.25rem 0; display: block; transition: all 0.2s ease; border-left: 2px solid transparent; padding-left: 0.75rem; }
.toc a:hover { color: var(--accent); border-left-color: var(--accent); text-decoration: none; }

/* Sections */
.section { margin: 5rem 0; }
.section h2 { font-size: 2.25rem; font-weight: 800; margin-bottom: 1rem; text-align: center; }

/* Footer */
.footer { margin-top: 8rem; padding: 3rem 2rem; border-top: 1px solid var(--border); background: var(--glass); backdrop-filter: blur(var(--blur)); text-align: center; color: var(--muted); }

/* Article */
article { max-width: 800px; margin: 0 auto; }
article img { max-width: 100%; height: auto; border-radius: 12px; margin: 2rem 0; }
article pre { background: var(--bg-soft); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; overflow-x: auto; margin: 2rem 0; font-family: 'JetBrains Mono', monospace; }
article code { background: rgba(99, 102, 241, 0.1); color: var(--accent); padding: 0.25rem 0.5rem; border-radius: 6px; font-family: 'JetBrains Mono', monospace; font-size: 0.9em; }
article blockquote { border-left: 4px solid var(--accent); background: var(--glass); padding: 1.5rem; margin: 2rem 0; border-radius: 0 12px 12px 0; backdrop-filter: blur(4px); }

/* Responsive */
@media (max-width: 768px) {
  .container { padding: 0 1rem; }
  .nav-inner { padding: 1rem; flex-direction: column; gap: 1rem; }
  .nav-links { gap: 1rem; }
  .hero { padding: 6rem 1rem 3rem; }
  .h1 { font-size: 2.5rem; }
  .grid { grid-template-columns: 1fr; gap: 1.5rem; }
  .card { padding: 1.5rem; }
}

/* Animations & extras */
@keyframes fadeInUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
.card, .hero, .section { animation: fadeInUp 0.6s ease-out forwards; }
html { scroll-padding-top: 120px; }
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track { background: var(--bg-soft); }
::-webkit-scrollbar-thumb { background: var(--accent); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--accent2); }
</style>
</head>
<body>
<div class="nav">
  <div class="nav-inner">
    <div class="brand">🚀 Flowzex <span style="opacity:0.7">Blog</span></div>
    <div class="nav-links">
      <a href="/index.html">Blog</a>
      <a href="${mainUrl}/" target="_blank">Flowzex.com</a>
      <a class="btn" href="${mainUrl}/#demo" target="_blank">Get Demo ✨</a>
    </div>
  </div>
</div>
${body}
<div class="footer">
  <div class="container">
    <p>© ${new Date().getFullYear()} Flowzex — Transforming sales with AI-powered calling solutions.</p>
  </div>
</div>
<script>${inlineScript}</script>
</body>
</html>`;
}

// ---------- collect content ----------
fs.rmSync(publicRoot, { recursive: true, force: true });
fs.mkdirSync(publicRoot, { recursive: true });

let catsCfg = { categories: [] };
try { catsCfg = JSON.parse(fs.readFileSync('categories.json','utf8')); } catch {}
const catsList = (catsCfg.categories||[]).map(c => ({slug:c.slug,name:c.name}));
const catsMeta = Object.fromEntries(catsList.map(c => [c.slug, c.name]));

const files = walk(contentRoot);
console.log(`▶ Found ${files.length} markdown files under ${contentRoot}`);

const all = [];
for (const file of files) {
  const rel = path.relative(contentRoot, file);
  const parts = rel.split(path.sep);
  const cat = parts.length >= 3 ? parts[1] : 'educational-hub';
  const md = fs.readFileSync(file, 'utf8');
  const { title, desc } = extractMeta(md);
  let html = marked.parse(md);
  html = addHeadingIds(html);
  const baseName = path.basename(file, '.md');
  const slug = slugify(baseName);
  const stat = fs.statSync(file);
  const wc = wordCount(md);
  all.push({ file, cat, md, html, title, desc, slug, date: stat.mtime, words: wc });
}

const byCat = {};
for (const a of all) {
  byCat[a.cat] = byCat[a.cat] || [];
  byCat[a.cat].push(a);
}
console.log(`▶ Grouped into ${Object.keys(byCat).length} categories`);

// ---------- write enhanced article pages ----------
function writeArticlePages() {
  for (const a of all) {
    const canonical = `${siteUrl}/${a.cat}/${a.slug}/`;
    const toc = buildTOC(a.html);
    const siblings = (byCat[a.cat] || []).filter(x => x.slug !== a.slug).slice(0, 3);
    const readMins = readingTime(a.words);

    const jsonLd = [{
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": a.title,
      "description": a.desc,
      "wordCount": a.words,
      "timeRequired": `PT${readMins}M`,
      "datePublished": new Date(a.date).toISOString(),
      "mainEntityOfPage": canonical,
      "articleSection": catsMeta[a.cat] || a.cat,
      "author": { "@type": "Organization", "name": "Flowzex" },
      "publisher": { "@type": "Organization", "name": "Flowzex" }
    }];

    const hero = `
    <section class="hero">
      <div class="container">
        <div class="kicker">${catsMeta[a.cat] || a.cat} <span class="badge">⏱️ ${readMins} min read</span></div>
        <div class="h1">${a.title}</div>
        <p>${a.desc}</p>
      </div>
    </section>`;

    const body = `
    ${hero}
    <div class="container" style="display:grid;grid-template-columns:300px 1fr;gap:3rem;align-items:start;margin-top:2rem">
      ${toc || '<div></div>'}
      <div>
        <article class="card">
          ${a.html}
          <div class="card" style="margin-top:2rem;background:var(--glass);border-color:rgba(99,102,241,0.3)">
            <h3>🚀 Ready to scale your sales?</h3>
            <p>See how Flowzex transforms cold calling with AI-powered conversations, real-time analytics, and seamless CRM integrations.</p>
            <a class="btn" href="${mainUrl}/#demo" target="_blank">Get Your Demo ✨</a>
          </div>
          ${siblings.length ? `<section style="margin-top:2rem"><h3>🔗 Continue Reading</h3><ul style="list-style:none;padding:0">${siblings.map(r => `<li style="margin:1rem 0"><a href="/${r.cat}/${r.slug}/" style="display:block;padding:1rem;background:var(--glass);border-radius:12px;border:1px solid var(--glass-border);transition:all 0.2s ease">${r.title}</a></li>`).join('')}</ul></section>` : ''}
        </article>
      </div>
    </div>`;

    const outDir = path.join(publicRoot, a.cat, a.slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), pageShell({
      title: a.title, desc: a.desc, canonical, jsonLd, body
    }), 'utf8');
  }
}
writeArticlePages();

// ---------- enhanced category pages ----------
for (const [cat, items] of Object.entries(byCat)) {
  const canonical = `${siteUrl}/${cat}/`;
  const cards = items.map(i => `
    <div class="card">
      <div class="small">📅 ${new Date(i.date).toLocaleDateString()}</div>
      <h3><a href="/${cat}/${i.slug}/">${i.title}</a></h3>
      <p class="small">${i.desc}</p>
      <div style="margin-top:1rem">
        <span class="badge">⏱️ ${readingTime(i.words)} min</span>
      </div>
    </div>`).join('');
  
  const hero = `
  <section class="hero">
    <div class="container">
      <div class="kicker">📂 Category</div>
      <div class="h1">${catsMeta[cat] || cat}</div>
      <p>Comprehensive ${(catsMeta[cat] || cat).toLowerCase()} resources and insights from the Flowzex team.</p>
    </div>
  </section>`;
  
  const body = `
  ${hero}
  <div class="container">
    <div class="grid">${cards}</div>
  </div>`;

  const jsonLd = [{
    "@context":"https://schema.org",
    "@type":"CollectionPage",
    "name": catsMeta[cat] || cat,
    "mainEntityOfPage": canonical
  }];

  const outDir = path.join(publicRoot, cat);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), pageShell({
    title: `${catsMeta[cat] || cat} | Flowzex Blog`, 
    desc: `${catsMeta[cat] || cat} articles and guides`, 
    canonical, jsonLd, body
  }), 'utf8');
}

// ---------- Enhanced HOMEPAGE: Search + Latest + Start Here + Categories ----------
const latest = [...all].sort((a,b)=>b.date - a.date).slice(0,8);
const startHere = Object.entries(byCat).map(([cat, items]) => items.slice(0,1)[0]).filter(Boolean);
const searchIndex = all.map(a => ({
  t: a.title, d: a.desc, c: catsMeta[a.cat] || a.cat, u: `/${a.cat}/${a.slug}/`
}));

const latestCards = latest.map(a => `
  <div class="card">
    <div class="small">📅 ${catsMeta[a.cat] || a.cat} · ${new Date(a.date).toLocaleDateString()}</div>
    <h3><a href="/${a.cat}/${a.slug}/">${a.title}</a></h3>
    <p class="small">${a.desc}</p>
    <div style="margin-top:1rem">
      <span class="badge">⏱️ ${readingTime(a.words)} min</span>
    </div>
  </div>`).join('');

const startCards = startHere.map(a => `
  <div class="card">
    <div class="small">🌟 ${catsMeta[a.cat] || a.cat}</div>
    <h3><a href="/${a.cat}/${a.slug}/">${a.title}</a></h3>
    <p class="small">${a.desc}</p>
    <div style="margin-top:1rem">
      <span class="badge">✨ Essential</span>
    </div>
  </div>`).join('');

const catCards = Object.entries(byCat).map(([cat, items]) =>
  `<div class="card">
     <div style="font-size:2rem;margin-bottom:1rem">📚</div>
     <h3><a href="/${cat}/">${catsMeta[cat] || cat}</a></h3>
     <p class="small">${items.length} article${items.length>1?'s':''}</p>
     <div style="margin-top:1rem">
       <span class="badge">${items.length} posts</span>
     </div>
   </div>`).join('');

const homeHero = `
<section class="hero">
  <div class="container">
    <div class="kicker">🚀 Flowzex Blog</div>
    <div class="h1">AI Sales Revolution</div>
    <p>Master cold calling with AI. Deep-dive guides, proven strategies, and cutting-edge insights to transform your sales process and accelerate growth.</p>

    <div class="search">
      <input id="q" type="search" placeholder="🔍 Search guides, strategies, case studies..." aria-label="Search">
      <div id="results" class="results"></div>
    </div>
  </div>
</section>`;

const homeBody = `
${homeHero}
<div class="container">
  <div class="section">
    <h2>🔥 Latest Insights</h2>
    <div class="grid">${latestCards}</div>
  </div>
  
  <div class="section">
    <h2>⭐ Start Here <span class="badge">🎯 Editor's Choice</span></h2>
    <div class="grid">${startCards}</div>
  </div>
  
  <div class="section">
    <h2>📖 Explore Topics</h2>
    <div class="grid">${catCards}</div>
  </div>
  
  <div class="section">
    <div class="container" style="max-width:800px">
      <div class="card" style="text-align:center;background:var(--gradient);color:white;border:none">
        <div style="font-size:3rem;margin-bottom:1rem">🚀</div>
        <h2 style="color:white;margin:0 0 1rem">Ready to Transform Your Sales?</h2>
        <p style="color:rgba(255,255,255,0.9);font-size:1.1rem">Join thousands of sales teams using Flowzex to automate cold calling with AI-powered conversations, advanced analytics, and seamless integrations.</p>
        <div style="margin-top:2rem">
          <a class="btn" href="${mainUrl}/#demo" target="_blank" style="background:rgba(255,255,255,0.2);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.3)">Get Your Free Demo ✨</a>
        </div>
      </div>
    </div>
  </div>
</div>`;

const inlineScript = `
(function(){
  const DATA = ${JSON.stringify(searchIndex)};
  const input = document.getElementById('q');
  const box = document.getElementById('results');
  if(!input || !box) return;
  function render(items){
    if(!items.length){ box.style.display = 'none'; return; }
    box.style.display = 'block';
    box.innerHTML = items.slice(0,8).map(o =>
      '<div class="res"><a href="'+o.u+'"><strong>'+o.t+'</strong></a><div class="meta" style="color:var(--muted);margin:0.5rem 0">📂 '+o.c+'</div><div class="small">'+o.d+'</div></div>'
    ).join('');
  }
  input.addEventListener('input', function(){
    const q = this.value.toLowerCase().trim();
    if(!q){ render([]); return; }
    const scored = DATA.map(o=>{
      const hay = (o.t+' '+o.d+' '+o.c).toLowerCase();
      let score = 0;
      if (hay.includes(q)) score += 2;
      if (o.t.toLowerCase().includes(q)) score += 3;
      q.split(' ').forEach(word => { if (hay.includes(word)) score += 1; });
      return {o, score};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).map(x=>x.o);
    render(scored);
  });
  document.addEventListener('click', function(e) {
    if (!input.contains(e.target) && !box.contains(e.target)) { render([]); }
  });
  document.addEventListener('click', function(e) {
    const link = e.target.closest('a[href^="#"]');
    if (link) {
      e.preventDefault();
      const target = document.querySelector(link.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  let lastScrollY = window.scrollY;
  const nav = document.querySelector('.nav');
  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    if (currentScrollY > 100) {
      nav.style.background = 'rgba(10, 14, 26, 0.95)';
      nav.style.borderBottomColor = 'rgba(148, 163, 184, 0.2)';
    } else {
      nav.style.background = 'rgba(10, 14, 26, 0.8)';
      nav.style.borderBottomColor = 'rgba(255, 255, 255, 0.1)';
    }
    if (currentScrollY > lastScrollY && currentScrollY > 200) { nav.style.transform = 'translateY(-100%)'; }
    else { nav.style.transform = 'translateY(0)'; }
    lastScrollY = currentScrollY;
  });
})();`;

fs.writeFileSync(path.join(publicRoot, 'index.html'), pageShell({
  title: 'Flowzex Blog - AI Sales & Cold Calling Mastery',
  desc: 'Master AI-powered sales with expert guides, proven strategies, and cutting-edge insights for modern sales teams.',
  canonical: `${siteUrl}/`,
  jsonLd: [{
    "@context":"https://schema.org",
    "@type":"Organization",
    "name":"Flowzex",
    "url": mainUrl,
    "description": "AI-powered calling solutions for modern sales teams"
  }],
  body: homeBody,
  inlineScript
}), 'utf8');

console.log(`✅ Built ${files.length} articles across ${Object.keys(byCat).length} categories → ${publicRoot}`);
console.log(`🎨 Enhanced with modern UI, glassmorphism, and premium interactions`);
