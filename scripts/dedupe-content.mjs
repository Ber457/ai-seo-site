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
function readTitle(p){ const md = readFileSafe(p); const m = md.match(/^\s*#\s+(.+?)\s*$/m); return (m? m[1] : path.basename(p,".md")).trim(); }

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
    .replace(/[“”"’'()|\[\]:—–\-_/]+/g," ")  // punctuation to space
    .replace(/\s+/g," ")
    .trim();
}
function applySynonyms(s){
  let t = s;
  for (const [rx,rep] of REPL) t = t.replace(rx,rep);
  return t;
}
function tokensFrom(s){
  const t = applySynonyms(baseNormalize(s));
  return t.split(" ").filter(w => w && !STOP.has(w));
}
function topKeyTokens(s, keep=4){
  const t = tokensFrom(s);
  // stable order by frequency then alphabet
  const freq = new Map();
  for (const w of t) freq.set(w, (freq.get(w)||0)+1);
  const uniq = Array.from(new Set(t));
  uniq.sort((a,b)=> (freq.get(b)-freq.get(a)) || a.localeCompare(b));
  return uniq.slice(0, keep).join("-");
}

function categoryFromFile(rel){
  // rel looks like: 2025-08-15/<category>/<slug>.md
  const parts = rel.split("/");
  return parts.length>=3 ? parts[1] : "educational-hub";
}

function competitorTokenFrom(title, slug){
  const t = baseNormalize(title);
  const s = (slug||"").toLowerCase();
  // from slug: flowzex-vs-aircall(-anything)
  const ms = s.match(/^flowzex-vs-([a-z0-9+]+)/);
  if (ms) return ms[1];
  // from title text
  const mt = t.match(/^flowzex\s+vs\s+([a-z0-9+]+)/);
  if (mt) return mt[1];
  const mt2 = t.match(/^([a-z0-9+]+)\s+vs\s+flowzex/);
  if (mt2) return mt2[1];
  return null;
}

function canonicalKey(category, title, slug){
  const s = (slug||"").toLowerCase();

  // --- Comparisons: collapse by competitor only
  if (category === "comparisons"){
    const comp = competitorTokenFrom(title, slug);
    if (comp) return `comp:${comp}`;
  }

  // --- Case studies: remove "case study" prefix + normalize topic
  if (category === "case-studies"){
    const t = title.replace(/^case study\s*[:\-]?\s*/i,"");
    return `case:${topKeyTokens(t, 5)}`;
  }

  // --- Industry solutions: focus on sector + action (e.g., "real-estate cold-calling")
  if (category === "industry-solutions"){
    return `industry:${topKeyTokens(title, 5)}`;
  }

  // --- Core product: normalize to main concept (e.g., "ai dialer local-presence")
  if (category === "core-product"){
    return `product:${topKeyTokens(title, 5)}`;
  }

  // --- Default (educational etc.): normalized leading tokens
  return `title:${topKeyTokens(title, 6)}`;
}

function wordCount(md){ return (md.match(/\b\w+\b/g)||[]).length; }

const files = walk(contentRoot);
const groups = new Map();

for (const f of files){
  const rel = path.relative(contentRoot,f).replace(/\\/g,"/");
  const cat = categoryFromFile(rel);
  const title = readTitle(f);
  const slug  = path.basename(f, ".md");
  const key   = canonicalKey(cat, title, slug);
  const md    = readFileSafe(f);
  const wc    = wordCount(md);
  const mtime = fs.statSync(f).mtimeMs;

  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({file:f, rel, cat, title, slug, wc, mtime});
}

let removed = 0;
for (const [key, arr] of groups){
  if (arr.length <= 1) continue;
  // keep the strongest: highest wordcount → newest
  arr.sort((a,b)=> (b.wc - a.wc) || (b.mtime - a.mtime));
  const keep = arr[0], drop = arr.slice(1);

  console.log(`[DEDUP] KEY=${key} (${arr[0].cat}) -> KEEP ${keep.rel}`);
  for (const d of drop){
    try{ fs.unlinkSync(d.file); console.log(`        DEL  ${d.rel} (${d.wc} words)`); removed++; }
    catch(e){ console.log(`        ERR  ${d.rel}: ${e.message}`); }
  }
}
console.log(removed ? `Removed ${removed} duplicate file(s).` : "No duplicates found.");
