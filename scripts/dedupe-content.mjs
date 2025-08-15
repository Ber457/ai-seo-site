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
function norm(s){ return (s||"").toLowerCase().replace(/\s+/g," ").trim(); }
function canonicalKey(title, slug){
  const t = norm(title);
  const s = norm(slug||"");

  // Prefer slug for comparisons like "flowzex-vs-aircall-..."
  let ms = (slug||"").toLowerCase().match(/^flowzex-vs-([a-z0-9+]+)/);
  if (ms) return `comp:${ms[1]}`;

  // Fallback: extract first token after "flowzex vs "
  let mt = t.match(/^flowzex\s+vs\s+([a-z0-9+]+)/);
  if (mt) return `comp:${mt[1]}`;

  // Also handle "aircall vs flowzex" style
  let mt2 = t.match(/^([a-z0-9+]+)\s+vs\s+flowzex/);
  if (mt2) return `comp:${mt2[1]}`;

  // Case studies collapse to topic (strip "case study")
  if (/^case study\b/i.test(title)) {
    return `case:${norm(title.replace(/^case study\s*[:\-]?\s*/i,""))}`;
  }

  // Default: normalized title only
  return `title:${t.replace(/\b(guide|playbook|comparison|review|overview|features|pricing)\b/g,"").replace(/\b20(1[5-9]|2[0-9])\b/g,"").trim()}`;
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
  (groups.get(key) || groups.set(key, []).get(key)).push({file:f, rel, title, slug, wc, mtime});
}

let removed = 0;
for (const [key, arr] of groups){
  if (arr.length <= 1) continue;
  arr.sort((a,b)=> (b.wc - a.wc) || (b.mtime - a.mtime));
  const keep = arr[0], drop = arr.slice(1);
  console.log(`[DEDUP] KEY=${key} -> KEEP ${keep.rel}`);
  for (const d of drop){ try{ fs.unlinkSync(d.file); console.log(`        DEL  ${d.rel}`); removed++; }catch(e){ console.log(`        ERR  ${d.rel}: ${e.message}`);} }
}
console.log(removed ? `Removed ${removed} duplicate file(s).` : "No duplicates found.");
