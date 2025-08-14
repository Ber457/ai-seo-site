import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const MIN_WORDS = 3000;
function wordCount(s){ return (s.match(/\b\w+\b/g) || []).length; }
function slugify(s){ return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); }

const cfg = JSON.parse(fs.readFileSync('categories.json','utf8'));
const perCat = Number(process.env.PER_CATEGORY || cfg.limits?.perCategory || 2);
const mainUrl = process.env.MAIN_SITE_URL || cfg.site?.mainUrl || 'https://flowzex.com';

const patterns = [
  'Case study + step-by-step guide with metrics and pitfalls',
  'FAQ-led deep dive with myths vs facts and real examples',
  'How-to tutorial with checklists, templates, and scripts',
  'Problem–solution breakdown with decision trees and comparisons',
  'Playbook format with roles, KPIs, SOPs, and QA rubric'
];

const baseTemplate = (kw, extra, ctaText = 'Get a demo') => `
You are an expert SEO writer.

OBJECTIVES
- Write a comprehensive article of **at least 3,000 words**.
- Use the assigned **unique structure** so pages do not look alike.
- Clear H2/H3 sections, bullets, checklists, FAQs, examples.
- Include short "Key Takeaways" and a strong "Action Plan".

SEO REQUIREMENTS
- Target long-tail keyword: "${kw}" — use it **exactly once** in the H1.
- Use semantic/related terms naturally; avoid stuffing.
- Human-first, practical, no fluff.

CTA REQUIREMENT
- End with a clear CTA that links to **${mainUrl}** with anchor text like "${ctaText}". Use **Markdown** link.

INTERNAL LINK HOOKS
- Sprinkle 3–5 phrases that could logically link to related articles (no URLs).
- We will auto-link during build.

OUTPUT
- **Markdown only**. Start with: "# ${kw}"
- No intro before H1, no HTML, no metadata blocks.

${extra}
`;

const dateDir = new Date().toISOString().slice(0,10);

for (const category of cfg.categories) {
  const selected = category.keywords.slice(0, perCat);

  for (let i = 0; i < selected.length; i++) {
    const kw = selected[i];
    const style = patterns[i % patterns.length];

    let extra = `
UNIQUE STRUCTURE FOR THIS ARTICLE
- Use this structure style: ${style}.
- Include: Key Takeaways, Detailed Steps, Tools & Templates, FAQs, Common Mistakes, Action Plan.
`;

    if (category.slug === 'comparisons') {
      extra += `
COMPARISON-SPECIFIC REQUIREMENTS
- Be balanced and factual; avoid marketing hype.
- Include a comparison TABLE covering: target users, core features, integrations, onboarding, support, pricing overview, compliance, analytics.
- Include a "Who should choose which?" section with clear recommendations.
- End with a CTA linking to ${mainUrl} for readers who match Flowzex's ideal profile.
`;
    }

    const prompt = baseTemplate(kw, extra);

    const res = await client.messages.create({
      model: 'claude-3-7-sonnet-latest',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }]
    });

    let text = res.content?.[0]?.text?.trim() || '';
    let tries = 0;
    while (wordCount(text) < MIN_WORDS && tries < 2) {
      const expand = await client.messages.create({
        model: 'claude-3-7-sonnet-latest',
        max_tokens: 6000,
        messages: [
          { role: 'user', content: `Expand the following article to at least ${MIN_WORDS} words, adding depth, examples, and a robust Action Plan. Keep the same H1.\n\n----\n${text}\n----` }
        ]
      });
      const more = expand.content?.[0]?.text?.trim() || '';
      if (more.length > text.length) text = more;
      tries++;
    }

    const slug = slugify(kw);
    const outDir = path.join('content', dateDir, category.slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, slug + '.md'), text, 'utf8');
    console.log(`[${category.slug}] Generated: ${slug}.md (${wordCount(text)} words)`);
  }
}

console.log('Done. Generated content for', cfg.categories.length, 'categories (limited perCategory =', perCat, ') on', dateDir);
