// scripts/dedupe-content.mjs
import fs from "fs";
import path from "path";

const root = process.cwd();
const contentRoot = path.join(root, "content");

function walk(dir){ const out=[]; if(!fs.existsSync(dir)) return out;
  for (const d of fs.readdirSync(dir,{withFileTypes:true})) {
    const p=path.join(dir,d.name);
    if (d.isDirectory()) out.push(...walk(p));
    else if (d.isFile() && p.toLowerCase().endsWith(".md")) out.push(p);
  }
  return out;
}

function readFileSafe(p){ try{ return fs.readFileSync(p,"utf8"); }catch{ return ""; } }
function readTitle(p){
  const md = readFileSafe(p);
  const m = md.match(/^\s*#\s+(.+?)\s*$/m);
  return (m? m[1] : path.basename(p, ".md")).trim();
}

// meta comment like: <!-- meta: keyword="..." , category="..." -->
function readMeta(md){
  const m = md.match(/<!--\s*meta:\s*([^>]+)\s*-->/i);
  if (!m) return {};
  const raw = m[1];
  const kv = {};
  for (const part of raw.split(",")){
    const mm = part.match(/\s*([a-zA-Z0-9_-]+)\s*=\s*"([^"]*)"/);
    if (mm) kv[mm[1].toLowerCase()] = mm[2];
  }
  return kv;
}

const STOP = new Set([
  "ai","for","the","a","an","with","and","to","of","in","on","using",
  "best","ultimate","complete","guide","playbook","overview","review",
  "features","pricing","comparison","comparisons","vs","versus",
  "maximize","maximizing","2024","2025"
]);
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

function categoryFromRel(rel){
  // rel like: 2025-08-15/<category>/<slug>.md
  const parts = rel.split("/");
  return parts.length>=3 ? parts[1] : "educational-hub";
}

function competitorToken(title, slug){
  const t = baseNormalize(title);
  const s = (slug||"").toLowerCase();
  const ms = s.match(/^flowzex-vs-([a-z0-9+]+)/);        if (ms) return ms[1];
  const mt = t.match(/^flowzex\s+vs\s+([a-z0-9+]+)/);    if (mt) return mt[1];
  const mt2= t.match(/^([a-z0-9+]+)\s+vs\s+flowzex/);    if (mt2) return mt2[1];
  return null;
}

function productSignature(title, slug){
  const T = applySynonyms(baseNormalize(title + " " + (slug||"").replace(/-/g," ")));
  if (/\blocal-presence\b/.test(T)) return "ai-dialer+local-presence";
  if (/\bvoice-agent\b/.test(T) && /\boutbound\b/.test(T)) return "voice-agent+outbound-calls";
  if (/\b(power|predictive)\s+dialer\b/.test(T)) return "dialer-"+RegExp.$1;
  return topKeyTokens(T, 5);
}

function industrySignature(title, slug){
  const T = applySynonyms(baseNormalize(title + " " + (slug||"").replace(/-/g," ")));
  if (/\breal\s*estate\b/.test(T)) return "real-estate+cold-calling";
  if (/\binsurance\b/.test(T))     return "insurance+appointments";
  if (/\b(b2b|saas)\b/.test(T))    return "b2b-saas+outreach";
  if (/\bsolar\b/.test(T))         return "solar+lead-generation";
  return topKeyTokens(T, 5);
}

function canonicalKey(category, title, slug, metaKeyword){
  // If the file has a meta keyword, use it as the source of truth
  if (metaKeyword && metaKeyword.trim()){
    return `${category}:${topKeyTokens(metaKeyword, 6)}`;
  }

  // Otherwise, category-aware signatures
  if (category==="comparisons"){
    const comp = competitorToken(title, slug);
    if (comp) return `comparisons:comp-${comp}`;
    return `comparisons:${topKeyTokens(title, 6)}`;
  }
  if (category==="core-product"){
    return `core-product:${productSignature(title, slug)}`;
  }
  if (category==="industry-solutions"){
    return `industry-solutions:${industrySignature(title, slug)}`;
  }
  if (category==="case-studies"){
    const t = title.replace(/^case study\s*[:\-]?\s*/i,"");
    return `case-studies:${topKeyTokens(t, 6)}`;
  }
  return `title:${topKeyTokens(title, 6)}`;
}

function wordCount(md){ return (md.match(/\b\w+\b/g)||[]).length; }

const files = walk(contentRoot);
const groups = new Map();

for (const f of files){
  const rel = path.relative(contentRoot,f).replace(/\\/g,"/");
  const cat = categoryFromRel(rel);
  const slug= path.basename(f, ".md");
  const md  = readFileSafe(f);
  const meta= readMeta(md);
  const title = readTitle(f);
  const key = canonicalKey(cat, title, slug, meta.keyword);
  const wc  = wordCount(md);
  const mtime = fs.statSync(f).mtimeMs;

  (groups.get(key) || groups.set(key, []).get(key)).push({file:f, rel, cat, title, slug, wc, mtime});
}

let removed = 0;
for (const [key, arr] of groups){
  if (arr.length <= 1) continue;
  arr.sort((a,b)=> (b.wc - a.wc) || (b.mtime - a.mtime)); // keep strongest
  const keep = arr[0], drop = arr.slice(1);
  console.log(`[DEDUP] KEY=${key} -> KEEP ${keep.rel}`);
  for (const d of drop){
    try{ fs.unlinkSync(d.file); console.log(`        DEL  ${d.rel} (${d.wc} words)`); removed++; }
    catch(e){ console.log(`        ERR  ${d.rel}: ${e.message}`); }
  }
}
console.log(removed ? `Removed ${removed} duplicate file(s).` : "No duplicates found.");
