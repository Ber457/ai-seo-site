import fs from "fs";
import path from "path";
try { await import("dotenv/config"); } catch {}

let Anthropic;
try {
  const mod = await import("@anthropic-ai/sdk");
  Anthropic = mod.default || mod.Anthropic || mod;
} catch (e) {
  console.error("❌ Missing @anthropic-ai/sdk. Install and re-run:\n  npm i @anthropic-ai/sdk -D");
  process.exit(1);
}

const API_KEY = process.env.ANTHROPIC_API_KEY || "";
if (!API_KEY) {
  console.error("❌ ANTHROPIC_API_KEY is not set in .env. Add a line:\nANTHROPIC_API_KEY=YOUR_REAL_KEY\nThen re-run this script.");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: API_KEY });
const MODEL = process.env.CLAUDE_MODEL || "claude-3-5-sonnet-20240620";

const categories = [
  { slug: "core-product", name: "Core Product Pages" },
  { slug: "industry-solutions", name: "Industry Solutions" },
  { slug: "comparisons", name: "Comparison Pages" },
  { slug: "case-studies", name: "Use Case Studies" },
];

const PER = Number(process.argv.find(a => a.startsWith("--per="))?.split("=")[1] || 2);

const contentRoot = path.join(process.cwd(), "content");
const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, "0");
const dd = String(today.getDate()).padStart(2, "0");
const dateFolder = path.join(contentRoot, `${yyyy}-${mm}-${dd}`);

function slugify(s) {
  return s.toLowerCase().normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
}
function wordCount(s){ return (s.match(/\b\w+\b/g) || []).length; }

function walkMarkdown(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...walkMarkdown(p));
    else if (d.isFile() && p.endsWith(".md")) out.push(p);
  }
  return out;
}

function existingSlugsAndTitles() {
  const files = walkMarkdown(contentRoot);
  const slugs = new Set();
  const titles = new Set();
  for (const f of files) {
    const base = path.basename(f, ".md");
    slugs.add(base);
    const md = fs.readFileSync(f, "utf8");
    const m = md.match(/^#\s+(.+)$/m);
    if (m) titles.add(m[1].trim());
  }
  return { slugs, titles };
}

async function askClaude(prompt, system) {
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      temperature: 0.6,
      system,
      messages: [{ role: "user", content: prompt }],
    });
    const out = res?.content?.[0]?.type === "text" ? res.content[0].text : "";
    return (out || "").trim();
  } catch (err) {
    const msg = err?.error?.error?.message || err?.message || String(err);
    console.error("❌ Claude API error:", msg);
    return "";
  }
}

async function generateOneArticle(cat, forbidTitles, seenThisRun) {
  const system = `You are an expert B2B SEO writer for Flowzex (AI cold calling platform).
Write authoritative, practical, long-form content (3200–4800 words), Markdown only.
STRICT:
- One H1 (# Title) that is brand-new.
- Never reuse any title from the forbidden list.
- Use varied structures (checklists, frameworks, step-by-step, tables, bullets).
- Include internal-link placeholders like: [See related: <slug>]
- First line: <!-- meta: 150–160 chars -->
- No fluff. Practical and specific.`;

  const prompt = `Category: ${cat.name} (${cat.slug})
Write ONE brand-new article that would rank for high-intent keywords relevant to this category.

Forbidden titles (do NOT reuse):
${Array.from(forbidTitles).slice(0, 80).map(t => "- " + t).join("\n")}

Return ONLY Markdown (no wrapping text).`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const md = await askClaude(prompt, system);
    if (!md) continue;

    const h1 = md.match(/^#\s+(.+)$/m)?.[1]?.trim();
    if (!h1) continue;
    if (forbidTitles.has(h1) || seenThisRun.has(h1)) continue;

    let base = slugify(h1) || "post";
    const { slugs } = existingSlugsAndTitles();
    let slug = base; let i = 2;
    while (fs.existsSync(path.join(dateFolder, cat.slug, `${slug}.md`)) || slugs.has(slug)) {
      slug = `${base}-${i++}`;
    }

    const outDir = path.join(dateFolder, cat.slug);
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `${slug}.md`);
    fs.writeFileSync(outPath, md, "utf8");

    const wc = wordCount(md);
    console.log(`[${cat.slug}] Generated: ${slug}.md (${wc} words)`);
    seenThisRun.add(h1);
    return true;
  }
  console.log(`[${cat.slug}] Skipped after 3 attempts (duplicate/empty).`);
  return false;
}

(async () => {
  console.log(`▶ Claude generation starting (per category = ${PER})`);
  fs.mkdirSync(dateFolder, { recursive: true });

  const forbid = existingSlugsAndTitles().titles;
  const seenThisRun = new Set();

  for (const cat of categories) {
    let made = 0;
    for (let k = 0; k < PER; k++) {
      const ok = await generateOneArticle(cat, forbid, seenThisRun);
      if (ok) made++;
      await new Promise(r => setTimeout(r, 400));
    }
    console.log(`✅ ${cat.slug}: created ${made}/${PER}`);
  }
  console.log("Done.");
})();