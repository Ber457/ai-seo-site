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

function todayDir(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return path.join(contentRoot, `${yyyy}-${mm}-${dd}`);
}
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
function normTitle(s){ return (s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim(); }

function loadJSON(p, d){ try{ return JSON.parse(fs.readFileSync(p,"utf8")); }catch{ return d; } }

const catsCfg = loadJSON(catsFile, {categories:[]});
const kw = loadJSON(kwFile, {});
const used = new Set(loadJSON(usedFile, []));

const files = walk(contentRoot);
const existingTitles = new Set(files.map(readTitle).map(normTitle));
const existingSlugs  = new Set(files.map(f=> path.basename(f,".md").toLowerCase()));

function pickKeywordsForCategory(slug, count){
  const pool = (kw[slug]||[]).filter(k => !used.has(k.phrase));
  // prioritize higher volume first
  pool.sort((a,b)=> (b.volume||0)-(a.volume||0));
  return pool.slice(0,count);
}

function ensureUniqueSlug(base){
  let s = slugify(base);
  let i=2;
  while (existingSlugs.has(s)) { s = `${s}-${i++}`; }
  existingSlugs.add(s);
  return s;
}

function willDuplicate(title){
  const n = normTitle(title);
  return existingTitles.has(n);
}

async function genArticle(client, category, phrase){
  // craft a specific title from the phrase + category
  let title = phrase;
  // light templating for comparisons/case-studies
  if (category==="comparisons" && /^flowzex vs /i.test(phrase)){
    const comp = phrase.replace(/^flowzex vs\s*/i,"").trim();
    title = `Flowzex vs ${comp}: Features, Pricing, and When to Choose Each (2025)`;
  }
  if (category==="case-studies" && !/^case study/i.test(phrase)){
    title = `Case Study: ${phrase.replace(/^case study[:\s]*/i,"")}`;
  }

  // prevent dup by small variations if needed
  let tries = 0;
  while (willDuplicate(title) && tries < 3){
    tries++;
    title = title.replace(/\(2025\)/,"").trim() + ` — ${["Guide","Deep Dive","Playbook"][tries-1]}`;
  }
  if (willDuplicate(title)) return null;

  const slug = ensureUniqueSlug(title);
  const outDir = path.join(todayDir(), category);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${slug}.md`);

  const prompt = `You are writing a long-form, expert article for Flowzex (AI calling).
Write 1,800–3,000 words. Target keyword: "${phrase}".
Category: ${category}. Tone: actionable, expert. Include:
- H1 as provided title only once
- Rich outline with multiple H2/H3 sections (no “Introduction” or “Conclusion” headings)
- Concrete examples, mini frameworks, bullet lists
- JSON-LD Article schema (as a fenced code block with json, we will strip it)
- Internal link suggestions: list 3 anchor texts + slugs (we will convert)
- Avoid fluff. No hallucinated pricing unless clearly marked as “example”.

Title to use:
${title}`;

  const messages = [{role:"user", content: prompt}];

  let model = MODEL_PRIMARY;
  const call = async (m)=> client.messages.create({model:m, max_tokens:4500, messages});
  let res;
  try{ res = await call(model); } catch(e){ model = MODEL_FALLBACK; res = await call(model); }

  const text = res.content?.map?.(p=>p.text||"").join("") || "";
  const cleaned = text
    .replace(/```json[\s\S]*?```/g,"") // strip inline JSON blocks; our builder adds JSON-LD
    .trim();

  const md = `# ${title}

<!-- meta: keyword="${phrase}", category="${category}", created="${new Date().toISOString()}" -->

${cleaned}

`;

  fs.writeFileSync(outPath, md, "utf8");
  existingTitles.add(normTitle(title));
  return {title, slug, path: outPath, phrase};
}

function needPerCategory(){
  // If categories.json has perCategory use that; otherwise default to 2
  const out = [];
  for (const c of (catsCfg.categories||[])){
    if (!["comparisons","core-product","industry-solutions","case-studies"].includes(c.slug)) continue;
    const per = c.perCategory ?? 2;
    if (per > 0) out.push({slug:c.slug, count: per});
  }
  // Fallback if none present
  if (!out.length){
    out.push({slug:"comparisons", count:2},{slug:"core-product",count:2},{slug:"industry-solutions",count:2},{slug:"case-studies",count:2});
  }
  return out;
}

(async()=>{
  if (!process.env.ANTHROPIC_API_KEY){
    console.error("Missing ANTHROPIC_API_KEY in env."); process.exit(1);
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const plan = needPerCategory();
  let total = 0;
  for (const {slug, count} of plan){
    const picks = pickKeywordsForCategory(slug, count);
    if (!picks.length){ console.log(`[SKIP] ${slug}: no available keywords (edit keywords.json)`); continue; }

    for (const k of picks){
      const res = await genArticle(client, slug, k.phrase);
      if (!res){ console.log(`[DUP] Skipped duplicate for "${k.phrase}"`); continue; }
      total++;
      console.log(`[${slug}] Generated: ${res.slug}.md`);
      used.add(k.phrase);
    }
  }

  // save used keywords
  fs.writeFileSync(usedFile, JSON.stringify(Array.from(used), null, 2), "utf8");
  console.log(`Done. Generated ${total} unique article(s).`);
})();
