import "dotenv/config";
import fs from "fs";
import path from "path";
import { load } from "cheerio";

const siteUrl = (process.env.SITE_BASE_URL || "https://blog.flowzex.com").replace(/\/$/,"");
const publicRoot = path.join(process.cwd(), "public");

function walk(dir){
  const out=[]; if(!fs.existsSync(dir)) return out;
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const p = path.join(dir,e.name);
    if(e.isDirectory()) out.push(...walk(p));
    else if(e.isFile() && e.name==="index.html") out.push(p);
  } return out;
}
function expectedCanonical(file){
  let rel = path.relative(publicRoot,file).replace(/\\/g,"/");
  let dir = rel.replace(/index\.html$/,"");
  if(dir==="") return siteUrl+"/";
  return (siteUrl + "/" + dir).replace(/\/+/g,"/");
}
function words(s){ return (s.replace(/\s+/g," ").trim().match(/\b\w+\b/g)||[]).length; }
function detectSchema($){
  const blocks = $('script[type="application/ld+json"]').toArray().map(s=>$(s).html()||"");
  const hasArticle = blocks.some(t=>t.includes('"@type":"Article"'));
  const hasCollection = blocks.some(t=>t.includes('"@type":"CollectionPage"'));
  const hasOrg = blocks.some(t=>t.includes('"@type":"Organization"'));
  return {hasArticle, hasCollection, hasOrg, any: blocks.length>0};
}

const pages = walk(publicRoot);
const rows = [];

for(const file of pages){
  const html = fs.readFileSync(file,"utf8");
  const $ = load(html);

  const url = expectedCanonical(file);
  const isHome = url === siteUrl + "/";
  const isCategory = !isHome && /\/[^\/]+\/$/.test(url) && !/\/[^\/]+\/[^\/]+\/$/.test(url); // /cat/
  const isArticle = !isHome && !isCategory; // /cat/slug/

  const title = $("title").text().trim();
  const desc = $('meta[name="description"]').attr("content")||"";
  const robots = $('meta[name="robots"]').attr("content")||"";
  const canonical = $('link[rel="canonical"]').attr("href")||"";
  const h1s = $("h1"); const h1 = h1s.first().text().trim();
  const articleText = $("article").text();
  const articleWords = words(articleText);
  const schema = detectSchema($);
  const h2count = $("h2").length;
  const hasOG = $('meta[property^="og:"]').length>=3;
  const hasTwitter = $('meta[name="twitter:card"]').length>=1;
  const ctaMain = $('a[href*="flowzex.com"]').length>=1;
  const badImgAlts = $("img").toArray().filter(img => !($(img).attr("alt")||"").trim()).length;

  const checks = {
    titleLen: title.length>=30 && title.length<=65,
    descLen: desc.length>=50 && desc.length<=160,
    canonicalOK: canonical===url,
    robotsOK: /index/i.test(robots) && /follow/i.test(robots),
    hasH1: !!h1,
    singleH1: h1s.length===1,
    headings: isArticle ? h2count>=2 : true,
    articleWords: isArticle ? (articleWords>=1000) : true,
    schemaAny: schema.any,
    schemaTypeOK: (isHome && schema.hasOrg) || (isCategory && schema.hasCollection) || (isArticle && schema.hasArticle),
    openGraph: hasOG,
    twitterCard: hasTwitter,
    internalCTA: ctaMain,
    imgAlts: badImgAlts===0
  };

  rows.push({url,file,checks,title,descLen:desc.length,articleWords});
}

const pass = r => r ? "✅" : "❌";
const tableRows = rows.map(r=>{
  const c=r.checks;
  return `<tr>
    <td><a href="${r.url}" target="_blank">${r.url}</a><div class="f">${r.file}</div></td>
    <td>${pass(c.titleLen)}</td>
    <td>${pass(c.descLen)} <div class="f">${r.descLen}</div></td>
    <td>${pass(c.canonicalOK)}</td>
    <td>${pass(c.robotsOK)}</td>
    <td>${pass(c.hasH1)}</td>
    <td>${pass(c.singleH1)}</td>
    <td>${pass(c.headings)}</td>
    <td>${pass(c.articleWords)} <div class="f">${r.articleWords}</div></td>
    <td>${pass(c.schemaAny)}</td>
    <td>${pass(c.schemaTypeOK)}</td>
    <td>${pass(c.openGraph)}</td>
    <td>${pass(c.twitterCard)}</td>
    <td>${pass(c.internalCTA)}</td>
    <td>${pass(c.imgAlts)}</td>
  </tr>`;
}).join("");

const report = `<!doctype html>
<html><head><meta charset="utf-8"><title>SEO Report</title>
<style>
body{font-family:system-ui,Segoe UI,Inter,Arial,sans-serif;padding:24px;background:#0b1020;color:#e9eef7}
h1{margin:0 0 10px}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{border:1px solid #223056;padding:8px;vertical-align:top}
th{background:#0f1a33;position:sticky;top:0}
a{color:#7aa2ff}
.f{color:#8ba0c6;font-size:12px}
</style></head>
<body>
<h1>SEO Audit Report</h1>
<p>Validates: Title, Description, Canonical, Robots, H1, single H1, H2s (articles), Word count (articles), JSON-LD present & correct type, OG/Twitter, CTA to Flowzex, image alts.</p>
<table>
<thead><tr>
<th>URL</th><th>Title</th><th>Description</th><th>Canonical</th><th>Robots</th>
<th>H1</th><th>1×H1</th><th>H2s</th><th>Words</th><th>Schema present</th><th>Schema type OK</th>
<th>OG</th><th>Twitter</th><th>CTA</th><th>Img alts</th>
</tr></thead>
<tbody>${tableRows}</tbody>
</table>
</body></html>`;

const out = path.join(publicRoot,"seo-report.html");
fs.writeFileSync(out, report, "utf8");
console.log("SEO report written to: " + out);
