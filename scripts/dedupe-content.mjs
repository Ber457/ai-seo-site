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
function readTitle(p){
  try{
    const md = fs.readFileSync(p,"utf8");
    const m = md.match(/^\s*#\s+(.+?)\s*$/m);
    return (m? m[1] : path.basename(p, ".md")).trim();
  }catch{ return path.basename(p, ".md"); }
}
function words(p){
  try{ return (fs.readFileSync(p,"utf8").match(/\b\w+\b/g)||[]).length; }catch{ return 0; }
}
function norm(s){ return (s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim(); }

const files = walk(contentRoot);
const groups = new Map();

for (const f of files){
  const rel = path.relative(contentRoot,f).replace(/\\/g,"/");
  const slug = path.basename(f, ".md").toLowerCase();
  const title = readTitle(f);
  const key = norm(title) || slug;
  (groups.get(key) || groups.set(key, []).get(key)).push({file:f, rel, title, slug, wc:words(f), mtime:fs.statSync(f).mtimeMs});
}

const toDelete = [];
for (const [key, arr] of groups){
  if (arr.length <= 1) continue;
  // pick best: highest wordcount; tie → newest
  arr.sort((a,b)=> (b.wc - a.wc) || (b.mtime - a.mtime));
  const keep = arr[0];
  const drop = arr.slice(1);
  console.log(`[DEDUP] KEEP: ${keep.rel} (${keep.wc} words)`);
  for (const d of drop){
    console.log(`        DEL : ${d.rel} (${d.wc} words)`);
    toDelete.push(d.file);
  }
}
for (const p of toDelete){ try{ fs.unlinkSync(p); }catch{} }

console.log(toDelete.length ? `Removed ${toDelete.length} duplicate file(s).` : "No duplicates found.");
