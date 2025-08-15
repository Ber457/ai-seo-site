// scripts/topup-categories.mjs
import fs from "fs";
import path from "path";

const project = process.cwd();
const contentRoot = path.join(project, "content");
const catsFile = path.join(project, "categories.json");

const TARGETS = {
  "case-studies": 10,
  "comparisons": 10,
  "core-product": 10,
  "industry-solutions": 10
};

function walk(dir){
  const out=[]; if(!fs.existsSync(dir)) return out;
  for (const d of fs.readdirSync(dir,{withFileTypes:true})) {
    const p=path.join(dir,d.name);
    if (d.isDirectory()) out.push(...walk(p));
    else if (d.isFile() && p.toLowerCase().endsWith(".md")) out.push(p);
  }
  return out;
}
function countByCategory(){
  const files = walk(contentRoot);
  const counts = {};
  for (const f of files){
    const rel = path.relative(contentRoot, f).split(path.sep);
    // expects: YYYY-MM-DD/<category>/<file>.md
    const cat = rel.length>=3 ? rel[1] : "educational-hub";
    counts[cat] = (counts[cat] || 0) + 1;
  }
  return counts;
}

const original = JSON.parse(fs.readFileSync(catsFile,"utf8"));
const counts = countByCategory();

let changed = false;
const cfg = JSON.parse(JSON.stringify(original));
cfg.categories = cfg.categories || [];

for (const [slug, target] of Object.entries(TARGETS)){
  const have = counts[slug] || 0;
  const missing = Math.max(0, target - have);

  // ensure category exists in config
  let entry = cfg.categories.find(c => c.slug === slug);
  if (!entry){
    entry = { slug, name: slug.replace(/-/g, " ").replace(/\b\w/g,m=>m.toUpperCase()), seeds: [] };
    cfg.categories.push(entry);
  }
  // set perCategory to "missing" for this run; if 0, leave existing value as-is
  if (missing > 0){
    entry.perCategory = missing;
    changed = true;
    console.log(`[TOPUP] ${slug}: have ${have}, target ${target} → will generate ${missing}`);
  } else {
    console.log(`[OK] ${slug}: already ${have} (target ${target}) — nothing to add`);
  }
}

if (!changed){
  console.log("All targets already met. No changes to categories.json.");
  process.exit(0);
}

// write the temporary config
fs.writeFileSync(catsFile, JSON.stringify(cfg, null, 2), "utf8");
console.log("Updated categories.json for top-up run.");
