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

// ---- same helpers as dedupe ----
const STOP = new Set(["ai","for","the","a","an","with","and","to","of","in","on","using","best","ultimate","complete","guide","playbook","overview","review","features","pricing","comparison","comparisons","vs","versus","maximize","maximizing","2024","2025"]);
const REPL = [
  [/voicemail\s+drops?/g,"voicemail-drop"],
  [/local\s+presence(\s+numbers|\s+dial(ing|er)?)?/g,"local-presence"],
  [/cold\s+calling/g,"cold-calling"],
  [/lead\s+gen(eration)?/g,"lead-generation"],
  [/appointment\s+setting/g,"appointment-setting"],
  [/voice\s+agent/g,"voice-agent"],
  [/sales\s+agent/g,"sales-agent"],
  [/call\s+center/g,"call-center"],
  [/quality\s+monitor(ing)?/g,"quality-monitoring"]
];
function baseNormalize(s){ return (s||"").toLowerCase().replace(/\bversus\b/g,"vs").replace(/\bvs\.\b/g,"vs").replace(/[“”"’'()|\[\]:—–\-_/]+/g," ").replace(/\s+/g," ").trim(); }
function applySynonyms(s){ let t=s; for (const [rx,rep] of REPL) t=t.replace(rx,rep); return t; }
function tokensFrom(s){ const t=applySynonyms(baseNormalize(s)); return t.split(" ").filter(w => w && !STOP.has(w)); }
function topKeyTokens(s, keep=6){ const t=tokensFrom(s); const f=new Map(); for (const w of t) f.set(w,(f.get(w)||0)+1); const u=Array.from(new Set(t)); u.sort((a,b)=> (f.get(b)-f.get(a)) || a.localeCompare(b)); return u.slice(0, keep).join("-"); }
function competitorToken(s){ const t=baseNormalize(s); const m1=t.match(/^flowzex\s+vs\s+([a-z0-9+]+)/); if(m1) return m1[1]; const m2=t.match(/^([a-z0-9+]+)\s+vs\s+flowzex/); if(m2) return m2[1]; return null; }
function productSignature(s){ const T=applySynonyms(baseNormalize(s)); if(/\blocal-presence\b/.test(T)) return "ai-dialer+local-presence"; if(/\bvoice-agent\b/.test(T) && /\boutbound\b/.test(T)) return "voice-agent+outbound-calls"; if(/\b(power|predictive)\s+dialer\b/.test(T)) return "dialer-"+RegExp.$1; return topKeyTokens(T,5); }
function industrySignature(s){ const T=applySynonyms(baseNormalize(s)); if(/\breal\s*estate\b/.test(T)) return "real-estate+cold-calling"; if(/\binsurance\b/.test(T)) return "insurance+appointments"; if(/\b(b2b|saas)\b/.test(T)) return "b2b-saas+outreach"; if(/\bsolar\b/.test(T)) return "solar+lead-generation"; return topKeyTokens(T,5); }
function canonicalKey(category, keywordOrTitle){
  if (category==="comparisons"){ const c=competitorToken(keywordOrTitle); return c ? `comparisons:comp-${c}` : `comparisons:${topKeyTokens(keywordOrTitle,6)}`; }
  if (category==="core-product"){ return `core-product:${productSignature(keywordOrTitle)}`; }
  if (category==="industry-solutions"){ return `industry-solutions:${industrySignature(keywordOrTitle)}`; }
  if (category==="case-studies"){ const t=keywordOrTitle.replace(/^case study\s*[:\-]?\s*/i,""); return `case-studies:${topKeyTokens(t,6)}`; }
  return `title:${topKeyTokens(keywordOrTitle,6)}`;
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
function readMeta(md){ const m=md.match(/<!--\s*meta:\s*([^>]+)\s*-->/i); if(!m) return {}; const raw=m[1]; const kv={}; for (const part of raw.split(",")){ const mm=part.match(/\s*([a-zA-Z0-9_-]+)\s*=\s*"([^"]*)"/); if(mm) kv[mm[1].toLowerCase()]=mm[2]; } return kv; }
function categoryFromRel(rel){ const parts=rel.split("/"); return parts.length>=3 ? parts[1] : "educational-hub"; }

const catsCfg = JSON.parse(fs.readFileSync(catsFile,"utf8"));
const kw = fs.existsSync(kwFile) ? JSON.parse(fs.readFileSync(kwFile,"utf8")) : {};
const used = new Set(fs.existsSync(usedFile) ? JSON.parse(fs.readFileSync(usedFile,"utf8")) : []);

// Build existing canonical keys from current content (prefer meta.keyword)
const files = walk(contentRoot);
const existingSlugs = new Set(files.map(f=> path.basename(f,".md").toLowerCase()));
const existingKeys = new Set();
for (const f of files){
  const rel = path.relative(contentRoot,f).replace(/\\/g,"/");
  const cat = categoryFromRel(rel);
  const md  = fs.readFileSync(f,"utf8");
  const meta= readMeta(md);
  const title = readTitle(f);
  const key = canonicalKey(cat, meta.keyword ? meta.keyword : title);
  existingKeys.add(key);
}

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

  // Title styles
  let title = phrase;
  if (category==="comparisons"){
    let comp = (competitorToken(phrase) || phrase.replace(/^flowzex\s+vs\s+/i,"").replace(/\s+vs\s+flowzex/i,"").trim().split(/\s+/)[0] || "").replace(/[^a-z0-9+]/g,"");
    comp = comp ? comp.charAt(0).toUpperCase()+comp.slice(1) : "Competitor";
    title = `Flowzex vs ${comp}: Features, Pricing, and When to Choose Each (2025)`;
  } else if (category==="case-studies" && !/^case study/i.test(phrase)){
    title = `Case Study: ${phrase.replace(/^case study[:\s-]*/i,"")}`;
  } else {
    title = phrase.split(" ").map(w=> w.charAt(0).toUpperCase()+w.slice(1)).join(" ");
  }

  const d=new Date();
  const dir=path.join(contentRoot, `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`, category);
  fs.mkdirSync(dir,{recursive:true});
  const slug=ensureUniqueSlug(title, existingSlugs);
  const outPath = path.join(dir, `${slug}.md`);

  const prompt = `Write 1,800–3,000 words for Flowzex (AI calling).
Topic (category=${category}): "${phrase}"
- H1 exactly as: ${title}
- Multiple H2/H3 sections, concrete examples, bullet lists
- Suggest 3 internal links (anchor + slug) at end
- No real pricing; if examples, label them "example" clearly`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let model = MODEL_PRIMARY, res;
  try{
    res = await client.messages.create({ model, max_tokens:4500, messages:[{role:"user",content:prompt}] });
  }catch(e){
    model = MODEL_FALLBACK;
    res = await client.messages.create({ model, max_tokens:4500, messages:[{role:"user",content:prompt}] });
  }
  const text = res.content?.map?.(p=>p.text||"").join("") || "";

  const md = `# ${title}

<!-- meta: keyword="${phrase}", category="${category}", created="${new Date().toISOString()}" -->

${text.replace(/```json[\s\S]*?```/g,"").trim()}
`;
  fs.writeFileSync(outPath, md, "utf8");
  existingKeys.add(desiredKey);
  used.add(phrase);
  console.log(`[${category}] Generated: ${path.basename(outPath)} (key=${desiredKey})`);
  return outPath;
}

function needPerCategory(){
  const out=[]; 
  for (const c of (catsCfg.categories||[])){ const per=c.perCategory ?? 0; if (per>0) out.push({slug:c.slug, count: per}); }
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
