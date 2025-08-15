// scripts/seo-check.mjs — local report for /public
import fs from "fs";
import path from "path";
import { load as loadHTML } from "cheerio";

const projectRoot = process.cwd();
const publicRoot  = path.join(projectRoot, "public");
const outFile     = path.join(publicRoot, "seo-report.html");
const siteUrl     = (process.env.SITE_BASE_URL || "https://blog.flowzex.com").replace(/\/$/,"");

function walk(dir){
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const d of fs.readdirSync(dir,{withFileTypes:true})) {
    const p = path.join(dir,d.name);
    if (d.isDirectory()) out.push(...walk(p));
    else if (d.isFile() && p.toLowerCase().endsWith(".html")) out.push(p);
  }
  return out;
}
function rel(p){ return path.relative(publicRoot,p).replace(/\\/g,"/"); }
function isHome(relpath){ return relpath === "index.html"; }
function isCategory(relpath){
  const parts = relpath.split("/");
  return parts.length===2 && parts[1]==="index.html";
}
function isArticle(relpath){
  const parts = relpath.split("/");
  return parts.length===3 && parts[2]==="index.html";
}
function words(txt){ return (txt.match(/\b\w+\b/g)||[]).length; }

const files = walk(publicRoot);
if (!files.length){
  console.log("No built HTML found under /public. Run: npm run build-site");
  process.exit(1);
}

const checks = [
  { key:"title",        label:"Title 30–65 chars",                         run: ($, t)=> {
      const title = ($("head > title").text()||"").trim();
      const len = title.length;
      const hasBrand = /flowzex/i.test(title);
      if (len>=30 && len<=65) return {status:"PASS", msg:`${len} chars${hasBrand?" (+brand)":""}`};
      if (len>=20 && len<=75) return {status:"WARN", msg:`${len} chars`};
      return {status:"FAIL", msg:`${len} chars`};
    }},
  { key:"metaDesc",     label:"Meta description 50–160",                   run: ($)=> {
      const m = $('meta[name="description"]').attr("content") || "";
      const len = m.trim().length;
      if (len>=50 && len<=160) return {status:"PASS", msg:`${len} chars`};
      if (len>0) return {status:"WARN", msg:`${len} chars`};
      return {status:"FAIL", msg:"missing"};
    }},
  { key:"canonical",    label:"Canonical present",                         run: ($,t,p,r)=> {
      const c = $('link[rel="canonical"]').attr("href");
      if (!c) return {status:"FAIL", msg:"missing"};
      return {status:"PASS", msg:c};
    }},
  { key:"h1single",     label:"Exactly one H1",                            run: ($)=> {
      const n = $("h1").length;
      if (n===1) return {status:"PASS", msg:"1"};
      if (n===0) return {status:"FAIL", msg:"0"};
      return {status:"FAIL", msg:`${n}`};
    }},
  { key:"h2article",    label:"Article: ≥2 H2 (Cat/Home ≥1)",              run: ($,type)=> {
      const n = $("h2").length;
      if (type==="article") return (n>=2)?{status:"PASS",msg:`${n}`}:{status:"FAIL",msg:`${n}`};
      return (n>=1)?{status:"PASS",msg:`${n}`}:{status:"WARN",msg:`${n}`};
    }},
  { key:"jsonld",       label:"JSON-LD present (type matches)",            run: ($,type)=> {
      const scripts = $('script[type="application/ld+json"]').toArray();
      if (!scripts.length) return {status:"FAIL", msg:"missing"};
      let hasType=false;
      for (const s of scripts){
        try {
          const txt = $(s).contents().text();
          const data = JSON.parse(txt);
          const arr = Array.isArray(data) ? data : [data];
          for (const obj of arr){
            const t = (obj["@type"]||"").toString().toLowerCase();
            if (type==="article" && t.includes("article")) hasType=true;
            if (type==="category" && t.includes("collectionpage")) hasType=true;
            if (type==="home" && (t.includes("organization") || t.includes("website"))) hasType=true;
          }
        } catch {}
      }
      return hasType ? {status:"PASS",msg:"ok"} : {status:"WARN",msg:"type mismatch"};
    }},
  { key:"og",           label:"Open Graph (title/desc/type/url)",          run: ($)=> {
      const need = ['og:title','og:description','og:type','og:url'];
      const miss = need.filter(p=> !$(`meta[property="${p}"]`).length);
      if (!miss.length) return {status:"PASS", msg:"ok"};
      if (miss.length<=2) return {status:"WARN", msg:`missing: ${miss.join(", ")}`};
      return {status:"FAIL", msg:`missing: ${miss.join(", ")}`};
    }},
  { key:"twitter",      label:"Twitter Card present",                      run: ($)=> {
      const m = $('meta[name="twitter:card"]').attr("content");
      return m ? {status:"PASS", msg:m} : {status:"FAIL", msg:"missing"};
    }},
  { key:"robots",       label:"Robots meta (index,follow)",                run: ($)=> {
      const r = ($('meta[name="robots"]').attr("content")||"").toLowerCase();
      if (!r) return {status:"FAIL", msg:"missing"};
      return (/index/.test(r)) ? {status:"PASS", msg:r} : {status:"WARN", msg:r};
    }},
  { key:"imgAlt",       label:"All images have alt",                       run: ($)=> {
      const imgs = $("img").toArray();
      const bad = imgs.filter(i=> !($(i).attr("alt")||"").trim());
      return bad.length ? {status:"FAIL", msg:`${bad.length} missing`} : {status:"PASS", msg:`ok (${imgs.length})`};
    }},
  { key:"wordCount",    label:"Article: ≥300 words (text)",                run: ($,type)=> {
      if (type!=="article") return {status:"PASS", msg:"n/a"};
      const txt = ($("article").text() || $("main").text() || $("body").text() || "").replace(/\s+/g," ").trim();
      const n = words(txt);
      return (n>=300) ? {status:"PASS", msg:`${n}`}: {status:"FAIL", msg:`${n}`};
    }},
  { key:"internalLinks",label:"Article: ≥2 internal links",                run: ($,type)=> {
      if (type!=="article") return {status:"PASS", msg:"n/a"};
      const n = $('a[href^="/"]').length;
      return (n>=2) ? {status:"PASS", msg:`${n}`}: {status:"WARN", msg:`${n}`};
    }},
];

const rows = [];
for (const file of files){
  const relpath = rel(file);
  const html = fs.readFileSync(file,"utf8");
  const $ = loadHTML(html);
  let type = "home";
  if (isArticle(relpath)) type="article";
  else if (isCategory(relpath)) type="category";
  else if (!isHome(relpath)) type="page";

  const result = {};
  for (const c of checks){
    const r = c.run($, type, file, relpath);
    result[c.key] = r;
  }
  rows.push({ file: relpath, type, result });
}

// Extra project-level checks
const hasSitemap = fs.existsSync(path.join(publicRoot,"sitemap.xml"));
const hasRobots  = fs.existsSync(path.join(publicRoot,"robots.txt"));

// Build HTML report
function pill(s){
  const color = s==="PASS" ? "#16a34a" : (s==="WARN" ? "#eab308" : "#ef4444");
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${color};color:white;font:600 12px/1.6 system-ui">${s}</span>`;
}
const columns = checks.map(c=>`<th>${c.label}</th>`).join("");

const table = rows.map(r=>{
  const tds = checks.map(c=>{
    const {status,msg} = r.result[c.key];
    return `<td style="white-space:nowrap">${pill(status)}<div style="color:#667; font:12px/1.4 system-ui">${msg||""}</div></td>`;
  }).join("");
  return `<tr><td><code>${r.file}</code></td><td>${r.type}</td>${tds}</tr>`;
}).join("");

const totals = rows.reduce((acc,r)=>{
  for (const c of checks){
    const s = r.result[c.key].status;
    acc[c.key] ||= {PASS:0,WARN:0,FAIL:0};
    acc[c.key][s] += 1;
  }
  return acc;
},{});

const summary = Object.entries(totals).map(([k,v])=>{
  const col = checks.find(c=>c.key===k)?.label || k;
  return `<li><strong>${col}</strong> — PASS ${v.PASS} · WARN ${v.WARN} · FAIL ${v.FAIL}</li>`;
}).join("");

const htmlReport = `<!doctype html>
<html><head><meta charset="utf-8"><title>SEO Report</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font:14px/1.6 system-ui,Segoe UI,Roboto,Inter,Arial,sans-serif;background:#0b0f1a;color:#e5edff;padding:20px}
h1{font-size:22px;margin:0 0 10px}
.card{background:#111a2e;border:1px solid #1d2a4b;border-radius:12px;padding:16px;margin:12px 0}
table{width:100%;border-collapse:collapse;margin-top:10px}
th,td{border-bottom:1px solid #223357;padding:8px;vertical-align:top}
th{position:sticky;top:0;background:#101a33;text-align:left}
code{background:#0f1528;padding:2px 6px;border-radius:6px}
small{color:#9fb0cc}
ul{margin:0;padding-left:18px}
</style></head><body>
<h1>SEO Report (local build)</h1>
<div class="card"><small>Public folder:</small> <code>${publicRoot.replace(/\\/g,"/")}</code><br>
<small>Site URL (for reference):</small> <code>${siteUrl}</code><br>
<small>Sitemap:</small> ${hasSitemap ? "✅ found" : "❌ missing"} &nbsp; <small>Robots:</small> ${hasRobots ? "✅ found" : "❌ missing"}</div>
<div class="card"><strong>Summary</strong><ul>${summary}</ul></div>
<div class="card">
  <table>
    <thead><tr><th>Page</th><th>Type</th>${columns}</tr></thead>
    <tbody>${table}</tbody>
  </table>
</div>
</body></html>`;

fs.writeFileSync(outFile, htmlReport, "utf8");
console.log("✅ SEO report written:", outFile);
