// scripts/generate-monthly-content.mjs
import "dotenv/config";
import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";

const MODEL_PRIMARY = "claude-3-5-sonnet-20240620";
const MODEL_FALLBACK = "claude-3-opus-20240229";

const root = process.cwd();
const contentRoot = path.join(root, "content");
const catsFile = path.join(root, "categories.json");
const kwFile   = path.join(root, "keywords.json");
const usedFile = path.join(root, "keywords-used.json");

function walk(dir){ const out=[]; if(!fs.existsSync(dir)) return out;
  for (const d of fs.readdirSync(dir,{withFileTypes:true})) {
    const p=path.join(dir,d.name);
    if (d.isDirectory()) out.push(...walk(p));
    else if (d.isFile() && p.toLowerCase().endsWith(".md")) out.push(p);
  }
  return out;
}
function slugify(s){ return s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,""); }
function readTitle(p){
  try{
    const md = fs.readFileSync(p,"utf8");
    const m = md.match(/^\s*#\s+(.+?)\s*$/m);
    return (m? m[1] : path.basename(p, ".md")).trim();
  }catch{ return path.basename(p, ".md"); }
}
function norm(s){
  return (s||"")
    .toLowerCase()
    .replace(/\bversus\b/g,"vs")
    .replace(/\bvs\.\b/g,"vs")
    .replace(/\b20(1[5-9]|2[0-9])\b/g,"")
    .replace(/[“”"’'()|\[\]:—\-]+/g," ")
    .replace(/\b(guide|playbook|deep dive|comparison|review|features|pricing|overview)\b/g,"")
    .replace(/\s+/g," ")
    .trim();
}
function canonicalKeyFromTitle(title){
  const t = norm(title);
  const m = t.match(/^flowzex\s+vs\s+(.+)$/i);
  if (m) return `comp:${norm(m[1])}`;
  if (/^case study/i.test(t)) return `case:${t.replace(/^case study\s*[:\-]?\s*/i,"")}`;
  return `title:${t}`;
}
function canonicalKeyFromPhrase(category, phrase){
  const p = norm(phrase);
  if (category==="comparisons"){
    const m = p.replace(/^flowzex\s+vs\s*/i,"");
    return `comp:${norm(m)}`;
  }
  if (category==="case-studies"){
    return `case:${p.replace(/^case study\s*[:\-]?\s*/i,"")}`;
  }
  return `title:${p}`;
}
function ensureUniqueSlug(base, existingSlugs){
  let s = slugify(base); let i=2;
  while (existingSlugs.has(s)) { s = `${s}-${i++}`; }
  existingSlugs.add(s); return s;
}

const catsCfg = JSON.parse(fs.readFileSync(catsFile,"utf8"));
const kw = JSON.parse(fs.readFileSync(kwFile,"utf8"));
const used = new Set(fs.existsSync(usedFile) ? JSON.parse(fs.readFileSync(usedFile,"utf8")) : []);

const files = walk(contentRoot);
const existingSlugs = new Set(files.map(f=> path.basename(f,".md").toLowerCase()));
const existingKeys  = new Set(files.map(readTitle).map(canonicalKeyFromTitle));

function pickKeywordsForCategory(slug, count){
  const pool = (kw[slug]||[]).filter(k => !used.has(k.phrase));
  pool.sort((a,b)=> (b.volume||0)-(a.volume||0));
  return pool.slice(0,count);
}

async function genArticle(client, category, phrase){
  // Build a safe, non-duplicate plan BEFORE calling the model
  const desiredKey = canonicalKeyFromPhrase(category, phrase);
  if (existingKeys.has(desiredKey)){
    console.log(`[SKIP DUP] ${category} :: ${phrase} (canonical ${desiredKey})`);
    used.add(phrase);
    return null;
  }

  // Title shaping
  let title = phrase;
  if (category==="comparisons" && /^flowzex vs /i.test(phrase)){
    const comp = phrase.replace(/^flowzex vs\s*/i,"").trim();
    title = `Flowzex vs ${comp}: Features, Pricing, and When to Choose Each (2025)`;
  }
  if (category==="case-studies" && !/^case study/i.test(phrase)){
    title = `Case Study: ${phrase.replace(/^case study[:\s-]*/i,"")}`;
  }

  const slug = ensureUniqueSlug(title, existingSlugs);
  const today = new Date(); const yyyy=today.getFullYear(); const mm=String(today.getMonth()+1).padStart(2,"0"); const dd=String(today.getDate()).padStart(2,"0");
  const outDir = path.join(contentRoot, `${yyyy}-${mm}-${dd}`, category);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${slug}.md`);

  const prompt = `You are writing a long-form, expert article for Flowzex (AI calling).
Write 1,800–3,000 words. Target keyword: "${phrase}".
Category: ${category}. Tone: actionable, expert. Include:
- H1 as provided title only once
- Rich outline with multiple H2/H3 sections
- Concrete examples, frameworks, bullet lists
- Internal link suggestions (3 anchor texts + slugs)
- No made-up pricing (use examples if needed, label them clearly)
Title:
${title}`;

  const messages = [{role:"user", content: prompt}];

  let model = MODEL_PRIMARY;
  const call = async (m)=> new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({model:m, max_tokens:4500, messages});
  let res;
  try{ res = await call(model); } catch(e){ model = MODEL_FALLBACK; res = await call(model); }

  const text = res.content?.map?.(p=>p.text||"").join("") || "";
  const cleaned = text.replace(/```json[\s\S]*?```/g,"").trim();

  const md = `# ${title}

<!-- meta: keyword="${phrase}", category="${category}", created="${new Date().toISOString()}" -->

${cleaned}
`;

  fs.writeFileSync(outPath, md, "utf8");
  existingKeys.add(desiredKey);
  used.add(phrase);
  console.log(`[${category}] Generated: ${path.basename(outPath)} (key=${desiredKey})`);
  return outPath;
}

function needPerCategory(){
  const out = [];
  for (const c of (catsCfg.categories||[])){
    if (!["comparisons","core-product","industry-solutions","case-studies"].includes(c.slug)) continue;
    const per = c.perCategory ?? 2;
    if (per > 0) out.push({slug:c.slug, count: per});
  }
  return out.length ? out : [
    {slug:"comparisons",count:2},{slug:"core-product",count:2},
    {slug:"industry-solutions",count:2},{slug:"case-studies",count:2}
  ];
}

(async()=>{
  if (!process.env.ANTHROPIC_API_KEY){ console.error("Missing ANTHROPIC_API_KEY"); process.exit(1); }

  const plan = needPerCategory();
  let total = 0;
  for (const {slug, count} of plan){
    const picks = pickKeywordsForCategory(slug, count);
    if (!picks.length){ console.log(`[SKIP] ${slug}: no keywords left (edit keywords.json)`); continue; }
    for (const k of picks){ const p = await genArticle(null, slug, k.phrase); if (p) total++; }
  }
  fs.writeFileSync(usedFile, JSON.stringify(Array.from(used), null, 2), "utf8");
  console.log(`Done. Generated ${total} unique article(s).`);
})();
