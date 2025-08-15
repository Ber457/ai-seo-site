// scripts/build-site.mjs (modern UI + Search + Latest + Start Here)
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
  return `<nav class="toc"><div class="toc-title">On this page</div><ul>${lis}</ul></nav>`;
}
function readingTime(words){ return Math.max(3, Math.round(words/220)); }

// ---------- HTML shell with modern styling ----------
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
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ctext y='.9em' font-size='52'%3E📞%3C/text%3E%3C/svg%3E">
<script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
</script>
<style>
:root{
  --bg:#0b0f1a; --bg-soft:#0f1524; --card:#111a2e; --muted:#97a3b6;
  --text:#e9eef7; --brand:#4f7fff; --brand2:#22d3ee; --ring:#2b3b66;
  --border:#1c2742; --radius:16px;
}
@media (prefers-color-scheme: light) {
  :root{ --bg:#f6f8fb; --bg-soft:#eef2f9; --card:#ffffff; --muted:#485268; --text:#0b1020; --brand:#2b59ff; --brand2:#06b6d4; --ring:#dfe7ff; --border:#e6eaf5; }
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:linear-gradient(180deg,var(--bg) 0%, var(--bg-soft) 100%);color:var(--text);font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif}
a{color:var(--brand);text-decoration:none} a:hover{text-decoration:underline}
.container{max-width:1100px;margin:0 auto;padding:24px}
.nav{position:sticky;top:0;z-index:10;background:rgba(17,26,46,.75);backdrop-filter:blur(8px);border-bottom:1px solid var(--border)}
.nav-inner{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 24px}
.brand{font-weight:700;letter-spacing:.2px}
.nav a.btn{background:linear-gradient(90deg,var(--brand),var(--brand2));color:white;padding:10px 14px;border-radius:12px;border:0;box-shadow:0 6px 16px rgba(79,127,255,.25)}
.hero{padding:40px 24px 16px}
.hero .h1{font-size:36px;line-height:1.15;margin:8px 0}
.hero p{max-width:820px;color:var(--muted);margin:8px 0 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin:20px 0}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;box-shadow:0 12px 28px rgba(0,0,0,.18)}
.card:hover{transform:translateY(-2px);transition:transform .15s ease}
.small{color:var(--muted);font-size:13px}
.footer{color:var(--muted);padding:24px;border-top:1px solid var(--border);margin-top:32px}
.section{margin:12px 0 28px}
.section h2{margin:0 0 8px}
.badge{display:inline-block;border:1px solid var(--ring);background:rgba(79,127,255,.12);color:var(--brand);padding:4px 8px;border-radius:999px;font-size:12px;margin-left:8px}
.search{margin-top:14px}
#q{width:100%;padding:14px 16px;border-radius:12px;border:1px solid var(--border);background:var(--card);color:var(--text);outline:none}
.results{margin-top:12px;display:grid;grid-template-columns:1fr;gap:12px}
.res a{color:var(--text);text-decoration:none}
.res .meta{color:var(--muted);font-size:12px;margin-top:4px}
.kicker{color:var(--brand2);font-weight:600;letter-spacing:.3px}
.btn{display:inline-block;background:linear-gradient(90deg,var(--brand),var(--brand2));color:#fff;padding:12px 16px;border-radius:12px;box-shadow:0 10px 22px rgba(79,127,255,.25)}
</style>
</head>
<body>
<div class="nav">
  <div class="nav-inner container">
    <div class="brand">Flowzex <span class="small">Blog</span></div>
    <div>
      <a href="/index.html">Blog</a> ·
      <a href="${mainUrl}/" target="_blank">Go to Flowzex.com</a> ·
      <a class="btn" href="${mainUrl}/#demo" target="_blank">Get a Demo</a>
    </div>
  </div>
</div>
${body}
<div class="footer container small">© ${new Date().getFullYear()} Flowzex — Long-form AI calling content.</div>
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
  const rel = path.relative(contentRoot, file); // YYYY-MM-DD\category\slug.md OR YYYY-MM-DD\slug.md
  const parts = rel.split(path.sep);
  const cat = parts.length >= 3 ? parts[1] : 'educational-hub'; // push uncategorized into educational-hub
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

// group by category
const byCat = {};
for (const a of all) {
  byCat[a.cat] = byCat[a.cat] || [];
  byCat[a.cat].push(a);
}
console.log(`▶ Grouped into ${Object.keys(byCat).length} categories`);

// ---------- write article pages (unchanged nice layout) ----------
function writeArticlePages() {
  for (const a of all) {
    const canonical = `${siteUrl}/${a.cat}/${a.slug}/`;
    const toc = buildTOC(a.html);
    const siblings = (byCat[a.cat] || []).filter(x => x.slug !== a.slug).slice(0, 3);
    const relList = siblings.map(r => `<li><a href="/${r.cat}/${r.slug}/">${r.title}</a></li>`).join('');
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
    <section class="hero container">
      <div class="kicker">${catsMeta[a.cat] || a.cat} <span class="badge">${readMins} min read</span></div>
      <div class="h1">${a.title}</div>
      <p>${a.desc}</p>
    </section>`;

    const body = `
    ${hero}
    <div class="container" style="display:grid;grid-template-columns:1fr;gap:24px">
      ${toc ? `<div>${toc}</div>` : '<div></div>'}
      <article class="card">
        ${a.html}
        <div class="card" style="margin-top:16px">
          <h3>See Flowzex in action</h3>
          <p>Launch AI-powered calling with compliance, analytics, and CRM integrations.</p>
          <a class="btn" href="${mainUrl}/#demo" target="_blank">Get a demo →</a>
        </div>
        ${siblings.length ? `<section style="margin-top:18px"><h3>Further Reading</h3><ul class="small">${relList}</ul></section>` : ''}
      </article>
    </div>`;

    const outDir = path.join(publicRoot, a.cat, a.slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), pageShell({
      title: a.title, desc: a.desc, canonical, jsonLd, body
    }), 'utf8');
  }
}
writeArticlePages();

// ---------- category index pages ----------
for (const [cat, items] of Object.entries(byCat)) {
  const canonical = `${siteUrl}/${cat}/`;
  const cards = items.map(i => `
    <a class="card" href="/${cat}/${i.slug}/">
      <div style="font-weight:600;margin-bottom:6px">${i.title}</div>
      <div class="small">${i.desc}</div>
    </a>`).join('');
  const hero = `
  <section class="hero container">
    <div class="kicker">Category</div>
    <div class="h1">${catsMeta[cat] || cat}</div>
    <p>${(catsMeta[cat] || cat)} articles and resources from Flowzex.</p>
  </section>`;
  const body = `
  ${hero}
  <div class="container"><div class="grid">${cards}</div></div>`;

  const jsonLd = [{
    "@context":"https://schema.org",
    "@type":"CollectionPage",
    "name": catsMeta[cat] || cat,
    "mainEntityOfPage": canonical
  }];

  const outDir = path.join(publicRoot, cat);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), pageShell({
    title: catsMeta[cat] || cat, desc: `${catsMeta[cat] || cat} articles`, canonical, jsonLd, body
  }), 'utf8');
}

// ---------- HOMEPAGE: Search + Latest + Start Here + Categories ----------
const latest = [...all].sort((a,b)=>b.date - a.date).slice(0,8);
const startHere = Object.entries(byCat).map(([cat, items]) => items.slice(0,1)[0]).filter(Boolean);
const searchIndex = all.map(a => ({
  t: a.title, d: a.desc, c: catsMeta[a.cat] || a.cat, u: `/${a.cat}/${a.slug}/`
}));

const latestCards = latest.map(a => `
  <a class="card" href="/${a.cat}/${a.slug}/">
    <div class="small">${catsMeta[a.cat] || a.cat} · ${new Date(a.date).toLocaleDateString()}</div>
    <div style="font-weight:700;margin-top:4px">${a.title}</div>
    <div class="small" style="margin-top:6px">${a.desc}</div>
  </a>`).join('');

const startCards = startHere.map(a => `
  <a class="card" href="/${a.cat}/${a.slug}/">
    <div class="small">${catsMeta[a.cat] || a.cat}</div>
    <div style="font-weight:700;margin-top:4px">${a.title}</div>
    <div class="small" style="margin-top:6px">${a.desc}</div>
  </a>`).join('');

const catCards = Object.entries(byCat).map(([cat, items]) =>
  `<a class="card" href="/${cat}/">
     <div style="font-weight:700">${catsMeta[cat] || cat}</div>
     <div class="small">${items.length} article${items.length>1?'s':''}</div>
   </a>`).join('');

const homeHero = `
<section class="hero container">
  <div class="kicker">Flowzex Blog</div>
  <div class="h1">AI Cold Calling & Sales Automation</div>
  <p>Deep-dives, comparisons, and field-tested playbooks. Long-form content with schema, internal linking, and clear CTAs that point to Flowzex.</p>

  <div class="search">
    <input id="q" type="search" placeholder="Search guides, comparisons, playbooks…" aria-label="Search">
    <div id="results" class="results"></div>
  </div>
</section>`;

const homeBody = `
${homeHero}
<div class="container section">
  <h2>Latest Articles</h2>
  <div class="grid">${latestCards}</div>
</div>
<div class="container section">
  <h2>Start Here <span class="badge">Editor picks</span></h2>
  <div class="grid">${startCards}</div>
</div>
<div class="container section">
  <h2>Browse by Category</h2>
  <div class="grid">${catCards}</div>
</div>
<div class="container section">
  <div class="card">
    <h2>See Flowzex in action</h2>
    <p>Launch AI-powered calling with compliance, analytics, and CRM integrations.</p>
    <a class="btn" href="${mainUrl}/#demo" target="_blank">Get a demo →</a>
  </div>
</div>`;

const inlineScript = `
(function(){
  const DATA = ${JSON.stringify(searchIndex)};
  const input = document.getElementById('q');
  const box = document.getElementById('results');
  if(!input || !box) return;
  function render(items){
    if(!items.length){ box.innerHTML=''; return; }
    box.innerHTML = items.slice(0,10).map(o =>
      '<div class="card res"><a href="'+o.u+'"><strong>'+o.t+'</strong></a><div class="meta">'+o.c+'</div><div class="small">'+o.d+'</div></div>'
    ).join('');
  }
  input.addEventListener('input', function(){
    const q = this.value.toLowerCase().trim();
    if(!q){ render([]); return; }
    const scored = DATA.map(o=>{
      const hay = (o.t+' '+o.d+' '+o.c).toLowerCase();
      return {o,score: hay.includes(q) ? 1 : 0};
    }).filter(x=>x.score>0).map(x=>x.o);
    render(scored);
  });
})();`;

fs.writeFileSync(path.join(publicRoot, 'index.html'), pageShell({
  title: 'Flowzex Blog',
  desc: 'Guides, comparisons, and playbooks for AI cold calling.',
  canonical: `${siteUrl}/`,
  jsonLd: [{
    "@context":"https://schema.org",
    "@type":"Organization",
    "name":"Flowzex",
    "url": mainUrl
  }],
  body: homeBody,
  inlineScript
}), 'utf8');

console.log(`✅ Built ${files.length} articles across ${Object.keys(byCat).length} categories → ${publicRoot}`);
