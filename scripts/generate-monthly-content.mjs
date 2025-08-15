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
function readTitle(p){ try{ const md=fs.readFileSync(p,"utf8"); const m=md.match(/^\s*#\s+(.+?)\s*$/m); return (m?m[1]:path.basename(p,".md")).trim(); }catch{ return path.basename(p,".md"); } }
function norm(s){ return (s||"").toLowerCase().replace(/\s+/g," ").trim(); }

function keyFromTitle(title){
  const t = norm(title);
  const ms = t.match(/^flowzex\s+vs\s+([a-z0-9+]+)/);
  if (ms) return `comp:${ms[1]}`;
  const ms2 = t.match(/^([a-z0-9+]+)\s+vs\s+flowzex/);
  if (ms2) return `comp:${ms2[1]}`;
  if (/^case study\b/i.test(title)) return `case:${norm(title.replace(/^case study\s*[:\-]?\s*/i,""))}`;
  return `title:${t.replace(/\b(guide|playbook|comparison|review|overview|features|pricing)\b/g,"").replace(/\b20(1[5-9]|2[0-9])\b/g,"").trim()}`;
}
function keyFromPhrase(category, phrase){
  const p = norm(phrase);
  if (category==="comparisons"){
    let ms = p.match(/^flowzex\s+vs\s+([a-z0-9+]+)/);
    if (ms) return `comp:${ms[1]}`;
    let ms2 = p.match(/^([a-z0-9+]+)\s+vs\s+flowzex/);
    if (ms2) return `comp:${ms2[1]}`;
  }
  if (category==="case-studies"){
    return `case:${p.replace(/^case study\s*[:\-]?\s*/i,"")}`;
  }
  return `title:${p}`;
}

function ensureUniqueSlug(base, existing){ let s=slugify(base), i=2; while (existing.has(s)) s=`${s}-${i++}`; existing.add(s); return s; }

const catsCfg = JSON.parse(fs.readFileSync(catsFile,"utf8"));
const kw = JSON.parse(fs.readFileSync(kwFile,"utf8"));
const used = new Set(fs.existsSync(usedFile) ? JSON.parse(fs.readFileSync(usedFile,"utf8")) : []);

const files = walk(contentRoot);
const existingSlugs = new Set(files.map(f=> path.basename(f,".md").toLowerCase()));
const existingKeys  = new Set(files.map(readTitle).map(keyFromTitle));

function pickKeywordsForCategory(slug, count){
  const pool = (kw[slug]||[]).filter(k => !used.has(k.phrase));
  pool.sort((a,b)=> (b.volume||0)-(a.volume||0));
  return pool.slice(0,count);
}

async function genArticle(category, phrase){
  const desiredKey = keyFromPhrase(category, phrase);
  if (existingKeys.has(desiredKey)){ console.log(`[SKIP DUP] ${category} :: ${phrase} -> ${desiredKey}`); used.add(phrase); return null; }

  // Normalize titles to consistent pattern
  let title = phrase;
  if (category==="comparisons"){
    // Ensure "Flowzex vs Competitor" form
    let comp = phrase.toLowerCase().replace(/^flowzex\s+vs\s+/,"").replace(/\s+vs\s+flowzex/,"").trim().split(/\s+/)[0];
    comp = comp.replace(/[^a-z0-9+]/g,"");
    comp = comp.charAt(0).toUpperCase() + comp.slice(1);
    title = `Flowzex vs ${comp}: Features, Pricing, and When to Choose Each (2025)`;
  } else if (category==="case-studies" && !/^case study/i.test(phrase)){
    title = `Case Study: ${phrase.replace(/^case study[:\s-]*/i,"")}`;
  }

  const slug = ensureUniqueSlug(title, existingSlugs);
  const d=new Date(), dir=path.join(contentRoot, `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`, category);
  fs.mkdirSync(dir,{recursive:true});
  const outPath = path.join(dir, `${slug}.md`);

  const prompt = `Write 1,800–3,000 words for Flowzex (AI calling) on "${phrase}".
- H1 exactly as: ${title}
- Multiple H2/H3 sections; no filler; include examples and bullet lists
- Suggest 3 internal links (anchor + slug) at end
- Do NOT claim real pricing; examples must be labeled as examples`;

  let model = MODEL_PRIMARY;
  const call = async (m)=> new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({model:m, max_tokens:4500, messages:[{role:"user",content:prompt}]});
  let res;
  try{ res = await call(model); } catch(e){ model = MODEL_FALLBACK; res = await call(model); }
  const text = res.content?.map?.(p=>p.text||"").join("") || "";
  const md = `# ${title}\n\n${text.replace(/```json[\\s\\S]*?```/g,"").trim()}\n`;
  fs.writeFileSync(outPath, md, "utf8");

  existingKeys.add(desiredKey); used.add(phrase);
  console.log(`[${category}] Generated: ${path.basename(outPath)} (key=${desiredKey})`);
  return outPath;
}

function needPerCategory(){
  const out = [];
  for (const c of (catsCfg.categories||[])){
    if (!["comparisons","core-product","industry-solutions","case-studies"].includes(c.slug)) continue;
    const per = c.perCategory ?? 0;
    if (per > 0) out.push({slug:c.slug, count: per});
  }
  return out.length ? out : [{slug:"comparisons",count:2}];
}

(async()=>{
  if (!process.env.ANTHROPIC_API_KEY){ console.error("Missing ANTHROPIC_API_KEY"); process.exit(1); }
  let total=0;
  for (const {slug,count} of needPerCategory()){
    const picks = pickKeywordsForCategory(slug, count);
    for (const k of picks){ const p = await genArticle(slug, k.phrase); if (p) total++; }
  }
  fs.writeFileSync(usedFile, JSON.stringify(Array.from(used), null, 2), "utf8");
  console.log(`Done. Generated ${total} unique article(s).`);
})();
