// Generates public/sitemap.xml at predev/prebuild. Pulls live insight slugs
// from the public Supabase REST endpoint so dynamic /insights/:slug routes
// are included.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE_URL = 'https://infradarai.com';

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: string;
}

const STATIC_ENTRIES: SitemapEntry[] = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/snapshot', changefreq: 'weekly', priority: '0.9' },
  { path: '/explore', changefreq: 'daily', priority: '0.9' },
  { path: '/insights', changefreq: 'daily', priority: '0.9' },
  { path: '/services', changefreq: 'monthly', priority: '0.7' },
  { path: '/pricing', changefreq: 'monthly', priority: '0.8' },
  { path: '/about', changefreq: 'monthly', priority: '0.6' },
  { path: '/contact', changefreq: 'monthly', priority: '0.6' },
  { path: '/careers', changefreq: 'monthly', priority: '0.4' },
  { path: '/press', changefreq: 'monthly', priority: '0.5' },
  { path: '/feedback', changefreq: 'monthly', priority: '0.4' },
  { path: '/terms', changefreq: 'yearly', priority: '0.3' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3' },
  { path: '/refund', changefreq: 'yearly', priority: '0.3' },
  { path: '/data-protection', changefreq: 'yearly', priority: '0.3' },
];

async function fetchInsights(): Promise<SitemapEntry[]> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    console.warn('[sitemap] VITE_SUPABASE_URL/KEY missing — skipping dynamic insight slugs.');
    return [];
  }
  try {
    const res = await fetch(
      `${url}/rest/v1/insights?select=slug,updated_at&published=eq.true`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) {
      console.warn('[sitemap] insights fetch failed', res.status);
      return [];
    }
    const rows = (await res.json()) as { slug: string; updated_at: string }[];
    return rows.map((r) => ({
      path: `/insights/${r.slug}`,
      lastmod: r.updated_at?.slice(0, 10),
      changefreq: 'monthly' as const,
      priority: '0.7',
    }));
  } catch (err) {
    console.warn('[sitemap] insights fetch error', err);
    return [];
  }
}

function render(entries: SitemapEntry[]) {
  const urls = entries.map((e) => [
    '  <url>',
    `    <loc>${BASE_URL}${e.path}</loc>`,
    e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
    e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
    e.priority ? `    <priority>${e.priority}</priority>` : null,
    '  </url>',
  ].filter(Boolean).join('\n'));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
  ].join('\n');
}

const insights = await fetchInsights();
const all = [...STATIC_ENTRIES, ...insights];
writeFileSync(resolve('public/sitemap.xml'), render(all));
console.log(`[sitemap] wrote ${all.length} entries (${insights.length} insights)`);
