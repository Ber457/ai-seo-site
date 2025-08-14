import 'dotenv/config';
import Anthropic from 'anthropic';
import fs from 'fs';
import path from 'path';

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// Simple starter list; we’ll replace with a keyword fetcher later
const keywords = [
  'AI cold calling scripts',
  'AI sales agent best practices',
  'cold call ai compliance',
  'voicemail drop with ai',
  'ai call center playbook'
];

const template = fs.readFileSync('prompts/article-template.txt','utf8');
const outDir = path.join('content', new Date().toISOString().slice(0,10));
fs.mkdirSync(outDir, { recursive: true });

function slugify(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');}

for (const kw of keywords) {
  const prompt = template.replace('{{keyword}}', kw);
  const res = await client.messages.create({
    model: 'claude-3-5-sonnet-latest',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }]
  });
  const text = res.content?.[0]?.text || '';
  const slug = slugify(kw);
  fs.writeFileSync(path.join(outDir, slug + '.md'), text, 'utf8');
  console.log('Generated:', slug + '.md');
}

console.log('Done. Generated', keywords.length, 'articles into', outDir);
