// Generates assets/stats.svg from real GitHub API data.
//
// Deliberately shows language distribution across PUBLIC repositories only —
// no stars, followers or streak counters. Those are vanity metrics and they are
// not what this profile is trying to say.
//
// Run: node .github/scripts/gen-stats.mjs
// Env: GITHUB_TOKEN (optional locally, provided automatically in Actions)

import { writeFileSync, mkdirSync } from 'node:fs';

const USER = 'ayush-techx';
const OUT = 'assets/stats.svg';
const MAX_SLICES = 6;

// Rank-ordered palette from the profile design system.
const PALETTE = ['#22D3EE', '#4C8DFF', '#FFB547', '#7C8CF8', '#5EEAD4', '#8B98A5', '#3E4C5A'];

const headers = {
  'Accept': 'application/vnd.github+json',
  'User-Agent': `${USER}-profile-stats`,
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

async function api(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function main() {
  const repos = await api(`https://api.github.com/users/${USER}/repos?per_page=100&type=owner`);
  const own = repos.filter((r) => !r.fork && !r.private && !r.archived);

  const bytes = {};
  for (const r of own) {
    try {
      const langs = await api(r.languages_url);
      for (const [name, n] of Object.entries(langs)) bytes[name] = (bytes[name] || 0) + n;
    } catch (e) {
      console.warn(`skipped languages for ${r.name}: ${e.message}`);
    }
  }

  const total = Object.values(bytes).reduce((a, b) => a + b, 0);
  if (!total) throw new Error('no language bytes resolved — refusing to write an empty card');

  const ranked = Object.entries(bytes).sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, MAX_SLICES);
  const restBytes = ranked.slice(MAX_SLICES).reduce((a, [, n]) => a + n, 0);
  if (restBytes > 0) top.push(['Other', restBytes]);

  const slices = top.map(([name, n], i) => ({
    name, pct: (n / total) * 100, color: PALETTE[i % PALETTE.length],
  }));

  const lastPush = own
    .map((r) => r.pushed_at)
    .filter(Boolean)
    .sort()
    .pop();

  const updated = new Date().toISOString().slice(0, 10);
  const svg = render({ slices, repoCount: own.length, updated, lastPush: (lastPush || '').slice(0, 10) });

  mkdirSync('assets', { recursive: true });
  writeFileSync(OUT, svg);
  console.log(`wrote ${OUT} — ${own.length} repos, ${slices.length} slices, ${Buffer.byteLength(svg)} bytes`);
}

function render({ slices, repoCount, updated, lastPush }) {
  const X = 32, W = 836, BAR_Y = 78, BAR_H = 22, R = 11;

  // Stacked bar, clipped to a rounded rect so the ends stay soft.
  let x = X;
  const segs = slices.map((s) => {
    const w = (s.pct / 100) * W;
    const seg = `<rect x="${x.toFixed(2)}" y="${BAR_Y}" width="${Math.max(w, 0).toFixed(2)}" height="${BAR_H}" fill="${s.color}"/>`;
    x += w;
    return seg;
  }).join('\n      ');

  // Legend: one row, evenly spaced.
  const colW = W / slices.length;
  const legend = slices.map((s, i) => {
    const lx = X + i * colW;
    return `<rect x="${lx.toFixed(1)}" y="132" width="10" height="10" rx="2" fill="${s.color}"/>` +
      `<text class="mono lg" x="${(lx + 18).toFixed(1)}" y="141" fill="#E6EDF3">${esc(s.name)}</text>` +
      `<text class="mono lg" x="${(lx + 18).toFixed(1)}" y="158" fill="#8B98A5">${s.pct.toFixed(1)}%</text>`;
  }).join('\n      ');

  const alt = slices.map((s) => `${s.name} ${s.pct.toFixed(1)} percent`).join(', ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 220" width="900" height="220"
     role="img" aria-labelledby="stTitle stDesc" preserveAspectRatio="xMidYMid meet">
  <title id="stTitle">Language distribution across public repositories</title>
  <desc id="stDesc">Stacked bar showing language distribution by bytes across ${repoCount} public
  repositories: ${esc(alt)}. Generated from the GitHub API on ${updated}. Private and in-progress
  work is not included.</desc>
  <defs>
    <linearGradient id="stPanel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0B1016"/><stop offset="1" stop-color="#05070A"/>
    </linearGradient>
    <clipPath id="stClip"><rect x="0" y="0" width="900" height="220" rx="14"/></clipPath>
    <clipPath id="stBar"><rect x="${X}" y="${BAR_Y}" width="${W}" height="${BAR_H}" rx="${R}"/></clipPath>
  </defs>
  <style>
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .lg { font-size: 11.5px; letter-spacing: 0.3px; }
  </style>
  <g clip-path="url(#stClip)">
    <rect width="900" height="220" fill="url(#stPanel)"/>
    <text class="mono" x="32" y="42" font-size="12.5" letter-spacing="3" fill="#8B98A5">// PUBLIC REPOSITORY TELEMETRY</text>
    <text class="mono" x="868" y="42" font-size="10.5" letter-spacing="1.2" text-anchor="end" fill="#8B98A5">UPDATED ${updated}</text>
    <text class="mono" x="32" y="66" font-size="10.5" letter-spacing="1.2" fill="#22D3EE">LANGUAGE DISTRIBUTION BY BYTES</text>
    <g clip-path="url(#stBar)">
      <rect x="${X}" y="${BAR_Y}" width="${W}" height="${BAR_H}" fill="#0E141C"/>
      ${segs}
    </g>
    <rect x="${X}" y="${BAR_Y}" width="${W}" height="${BAR_H}" rx="${R}" fill="none" stroke="#1E2A38"/>
    <g>
      ${legend}
    </g>
    <line x1="32" y1="180" x2="868" y2="180" stroke="#16202B"/>
    <text class="mono" x="32" y="200" font-size="10" letter-spacing="1.1" fill="#8B98A5">${repoCount} PUBLIC REPOSITORIES &#183; LAST PUSH ${lastPush || 'N/A'} &#183; PRIVATE AND IN-PROGRESS WORK NOT INCLUDED</text>
    <rect x="0.5" y="0.5" width="899" height="219" rx="14" fill="none" stroke="#16202B"/>
  </g>
</svg>
`;
}

main().catch((e) => { console.error(e.message); process.exit(1); });
