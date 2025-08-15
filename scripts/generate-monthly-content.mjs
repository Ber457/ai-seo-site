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

// ---- shared normalization helpers (MATCH dedupe) ----
const STOP = new Set(["ai","for","the","a","an","with","and","to","of","in","on","using","best","ultimate","complete","guide","playbook","overview","review","features","pricing","comparison","comparisons","vs","versus","2024","2025"]);
const REPL = [
  [/voicemail\s+drops?/g,"voicemail-drop"],
  [/local\s+presence(\s+numbers|\s+dialing)?/g,"local-presence"],
  [/cold\s+calling/g,"cold-calling"],
  [/appointment\s+setting/g,"appointment-setting"],
  [/voice\s+agent/g,"voice-agent"],
  [/sales\s+agent/g,"sales-agent"],
  [/call\s+center/g,"call-center"],
  [/quality\s+monitoring/g,"quality-monitoring"],
];
function baseNormalize(s){
  return (s||"")
    .toLowerCase()
    .replace(/\bversus\b/g,"vs")
    .replace(/\bvs\.\b/g,"vs")
    .replace(/[“”"’'()|\[\]:—–\-_/]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}
function applySynonyms(s){ let t=s; for (const [rx,rep] of REPL) t=t.replace(rx,rep); return t; }
function tokensFrom(s){ const t=applySynonyms(baseNormalize(s)); return t.split(" ").filter(w => w && !STOP.has(w)); }
function topKeyTokens(s, keep=5){
  const t = tokensFrom(s);
  const freq = new Map();
  for (const w of t) freq.set(w,(freq.get(w)||0)+1);
  const uniq = Array.from(new Set(t));
  uniq.sort((a,b)=> (freq.get(b)-freq.get(a)) || a.localeCompare(b));
  return uniq.slice(0, keep).join("-");
}
function competitorToken(titleOrPhrase){
  const t = baseNormalize(titleOrPhrase);
  const m1 = t.match(/^flowzex\s+vs\s+([a-z0-9+]+)/);
  if (m1) return m1[1];
  const m2 = t.match(/^([a-z0-9+]+)\s+vs\s+flowzex/);
  if (m2) return m2[1];
  return null;
}
function canonicalKey(category, titleOrPhrase){
  if (category==="comparisons"){
    const c = competitorToken(titleOrPhrase);
    if (c) return `comp:${c}`;
  }
  if (category==="case-studies"){
    return `case:${topKeyTokens(titleOrPhrase.replace(/^case study\s*[:\-]?\s*/i,""), 5)}`;
  }
  if (category==="industry-solutions"){
    return `industry:${topKeyTokens(titleOrPhrase, 5)}`;
  }
  if (category==="core-product"){
    return `product:${topKeyTokens(titleOrPhrase, 5)}`;
  }
  return `title:${topKeyTokens(titleOrPhrase, 6)}`;
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
function ensureUniqueSlug(base, existing){ let s=slugify(base), i=2; while(existing.has(s)) s=`${s}-${i++}`; existing.add(s); return s; }
function readTitle(p){ try{ const md=fs.readFileSync(p,"utf8"); const m=md.match(/^\s*#\s+(.+?)\s*$/m); return (m?m[1]:path.basename(p,".md")).trim(); }catch{ return path.basename(p,".md"); } }

const catsCfg = JSON.parse(fs.readFileSync(catsFile,"utf8"));
const kw = fs.existsSync(kwFile) ? JSON.parse(fs.readFileSync(kwFile,"utf8")) : {};
const used = new Set(fs.existsSync(usedFile) ? JSON.parse(fs.readFileSync(usedFile,"utf8")) : []);

const files = walk(contentRoot);
const existingSlugs = new Set(files.map(f=> path.basename(f,".md").toLowerCase()));
const existingKeys  = new Set(files.map(readTitle).map(t => {
  // derive category from path for consistency: YYYY-MM-DD/<cat>/<slug>.md
  // we can't easily read cat here from title alone, so use "title:" as safe default
  return canonicalKey("title", t);
}));

function pickKeywordsForCategory(slug, count){
  const pool = (kw[slug]||[]).filter(k => !used.has(k.phrase));
  pool.sort((a,b)=> (b.volume||0)-(a.volume||0));
  return pool.slice(0,count);
}

async function genArticle(category, phrase){
  const desiredKey = canonicalKey(category, phrase);
  if (existingKeys.has(desiredKey)){
    console.log(`[SKIP DUP] ${category} :: ${phrase} -> ${desiredKey}`);
    used.add(phrase);
    return null;
  }

  // Normalize title styles per category
  let title = phrase;
  if (category==="comparisons"){
    let comp = competitorToken(phrase) || phrase.replace(/^flowzex\s+vs\s+/i,"").trim().split(/\s+/)[0];
    comp = (comp||"").replace(/[^a-z0-9+]/g,"");
    comp = comp.charAt(0).toUpperCase() + comp.slice(1);
    title = `Flowzex vs ${comp}: Features, Pricing, and When to Choose Each (2025)`;
  } else if (category==="case-studies" && !/^case study/i.test(phrase)){
    title = `Case Study: ${phrase.replace(/^case study[:\s-]*/i,"")}`;
  } else {
    // Capitalize nicely
    title = phrase.split(" ").map(w => w.charAt(0).toUpperCase()+w.slice(1)).join(" ");
  }

  const slug = ensureUniqueSlug(title, existingSlugs);
  const d=new Date(), dir=path.join(contentRoot, `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`, category);
  fs.mkdirSync(dir,{recursive:true});
  const outPath = path.join(dir, `${slug}.md`);

  const prompt = `Write 1,800–3,000 words for Flowzex (AI calling).
Topic (category=${category}): "${phrase}"
- H1 exactly as: ${title}
- Multiple H2/H3 sections, concrete examples, bullet lists
- Suggest 3 internal links (anchor + slug) at end
- No real pricing; if examples, label them "example" clearly`;

  let model = MODEL_PRIMARY;
  const call = async (m)=> new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({model:m, max_tokens:4500, messages:[{role:"user",content:prompt}]});
  let res;
  try{ res = await call(model); } catch(e){ model = MODEL_FALLBACK; res = await call(model); }

  const text = res.content?.map?.(p=>p.text||"").join("") || "";
  const md = `# ${title}

${text.replace(/```json[\s\S]*?```/g,"").trim()}
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
    const per = c.perCategory ?? 0;
    if (per>0) out.push({slug:c.slug, count: per});
  }
  return out.length ? out : [
    {slug:"comparisons",count:2},
    {slug:"core-product",count:2},
    {slug:"industry-solutions",count:2},
    {slug:"case-studies",count:2}
  ];
}

(async()=>{
  if (!process.env.ANTHROPIC_API_KEY){ console.error("Missing ANTHROPIC_API_KEY"); process.exit(1); }
  let total=0;
  for (const {slug,count} of needPerCategory()){
    const picks = pickKeywordsForCategory(slug, count);
    if (!picks.length){ console.log(`[SKIP] ${slug}: no keywords left (edit keywords.json)`); continue; }
    for (const k of picks){ const p = await genArticle(slug, k.phrase); if (p) total++; }
  }
  fs.writeFileSync(usedFile, JSON.stringify(Array.from(used), null, 2), "utf8");
  console.log(`Done. Generated ${total} unique article(s).`);
})();
