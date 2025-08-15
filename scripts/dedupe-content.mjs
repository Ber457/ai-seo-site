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

function norm(s){
  return (s||"")
    .toLowerCase()
    .replace(/\bversus\b/g,"vs")
    .replace(/\bvs\.\b/g,"vs")
    .replace(/\b20(1[5-9]|2[0-9])\b/g,"")   // remove years 2015–2029
    .replace(/[“”"’'()|\[\]:—\-]+/g," ")   // punctuation/dashes to space
    .replace(/\b(guide|playbook|deep dive|comparison|review|features|pricing|overview)\b/g,"")
    .replace(/\s+/g," ")
    .trim();
}

function canonicalKey(title, slug){
  const t = norm(title);
  const s = norm(slug||"");

  // Comparisons: collapse to competitor only
  const m1 = t.match(/^flowzex\s+vs\s+(.+)$/i);
  if (m1) return `comp:${norm(m1[1])}`;

  const m2 = s.match(/^flowzex\s+vs\s+(.+)$/i);
  if (m2) return `comp:${norm(m2[1])}`;

  // Case studies: collapse to topic (drop "case study" prefix)
  if (/^case study/i.test(t)) return `case:${t.replace(/^case study\s*[:\-]?\s*/i,"")}`;

  // Fallback: normalized title
  return `title:${t}`;
}

function wordCount(md){ return (md.match(/\b\w+\b/g)||[]).length; }

const files = walk(contentRoot);
const groups = new Map();

for (const f of files){
  const rel = path.relative(contentRoot,f).replace(/\\/g,"/");
  const title = readTitle(f);
  const slug  = path.basename(f, ".md");
  const key   = canonicalKey(title, slug);
  const md    = readFileSafe(f);
  const wc    = wordCount(md);
  const mtime = fs.statSync(f).mtimeMs;

  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({file:f, rel, title, slug, wc, mtime});
}

let removed = 0;
for (const [key, arr] of groups){
  if (arr.length <= 1) continue;

  // Keep the strongest: highest wordcount, then newest
  arr.sort((a,b)=> (b.wc - a.wc) || (b.mtime - a.mtime));
  const keep = arr[0];
  const drop = arr.slice(1);

  console.log(`[DEDUP] KEY=${key}`);
  console.log(`        KEEP: ${keep.rel} (${keep.wc} words)`);

  for (const d of drop){
    try{
      fs.unlinkSync(d.file);
      console.log(`        DEL : ${d.rel} (${d.wc} words)`);
      removed++;
    }catch(e){
      console.log(`        ERR : ${d.rel} -> ${e.message}`);
    }
  }
}

console.log(removed ? `Removed ${removed} duplicate file(s).` : "No duplicates found.");
