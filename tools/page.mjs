// page.mjs — writes tools/poster.html: one day's world news on a single 1024x1024 page.
//
// Three inputs, all local: edition.json (the day as the news desk published it), words.json
// (every word the page prints, written for that day) and land-path.txt (Natural Earth coastlines).
// Nothing is fetched here, so the same three files always write the same page.
//
// Usage: node tools/page.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (name) => fileURLToPath(new URL(name, import.meta.url));
const edition = JSON.parse(readFileSync(here('./edition.json'), 'utf8'));
const words = JSON.parse(readFileSync(here('./words.json'), 'utf8'));
const coast = readFileSync(here('./land-path.txt'), 'utf8').trim();

const esc = (text) => String(text ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const DAY = edition.day;                     // '2026-11-24', the UTC day this edition covers
const TITLE = words.title;                   // 'Monday 23 November 2026', as the masthead prints it
const STORIES = edition.stories;
const storyByNumber = new Map(STORIES.map((story) => [story.n, story]));
const storyAt = (n) => {
  const story = storyByNumber.get(n);
  if (!story) throw new Error(`words name story ${n}, which the edition does not hold`);
  return story;
};

// Region hues: deep (rules and glyphs), light (map dots), name (the legend).
const hue = (id) => words.regions[id] ?? words.regions.world;
const tally = STORIES.reduce((acc, story) => ({ ...acc, [story.region]: (acc[story.region] ?? 0) + 1 }), {});
const regionTotal = Object.values(tally).reduce((sum, count) => sum + count, 0);
if (regionTotal !== STORIES.length) throw new Error(`regions sum to ${regionTotal}, edition holds ${STORIES.length}`);

// --- the whole edition, once each ------------------------------------------------------------
const leads = words.leads;
const cards = words.cards;
const briefs = words.briefs;
const places = [...leads, ...cards, ...briefs].map((item) => item.n);
if (places.length !== STORIES.length) throw new Error(`${places.length} stories placed, edition holds ${STORIES.length}`);
if (new Set(places).size !== places.length) throw new Error('a story is placed twice');
for (const n of places) storyAt(n);
if (leads.length !== 3) throw new Error(`three leads, not ${leads.length}`);
for (const [index, lead] of leads.entries()) {
  if (lead.n !== index + 1) throw new Error('the leads must be the edition’s own first three');
  if (storyAt(lead.n).tier !== 'lead') throw new Error(`story ${lead.n} is not a lead in the edition`);
}

// --- the when on every line -------------------------------------------------------------------
// Each item is stamped with its own outlet's UTC time where the edition records one, otherwise
// with the edition's date. Nothing on the page invents a clock.
const stampOf = new Map(STORIES.map((story) => {
  const mine = (story.links ?? [])
    .map((link) => link.publishedAt ?? '')
    .find((at) => at.startsWith(DAY));
  return [story.n, mine ? at_hm(mine) : words.dateless];
}));
function at_hm(iso) {
  return iso.slice(11, 16);
}
const stamp = (n) => stampOf.get(n) ?? words.dateless;

// The 13 clock readings are real: each names a story and the hour that story's own link carries.
// Most of a day's filings land on the day before the edition closes, so that is the default day.
const clockDay = words.clockDay ?? new Date(Date.parse(DAY) - 86400000).toISOString().slice(0, 10);
for (const tick of words.clock) {
  const stamps = (storyAt(tick.n).links ?? []).map((link) => link.publishedAt ?? '');
  const found = stamps.some((iso) => iso.startsWith(tick.day ?? clockDay) && at_hm(iso) === tick.at);
  if (!found) throw new Error(`clock ${tick.at} is not story ${tick.n}’s stamp: ${stamps.join(' ')}`);
}

// --- the map ----------------------------------------------------------------------------------
// Equirectangular, 64N to 50S, the whole 360-degree band across the column.
const FRAME = { top: 20, height: 114 };
const project = (lon, lat) => [lon + 180, 84 - Math.min(64, Math.max(-50, lat))];

const dot = (story, radius) => {
  const [x, y] = project(story.geo.lon, story.geo.lat);
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius}" fill="${hue(story.region)[2]}" opacity="${radius > 2.5 ? 1 : 0.92}"/>`;
};

const mapSvg = `<svg class="map" viewBox="0 ${FRAME.top} 360 ${FRAME.height}" preserveAspectRatio="xMidYMid meet" aria-label="World map with a dot for every dateline">
<rect x="0" y="${FRAME.top}" width="360" height="${FRAME.height}" fill="#0f2433"/>
<g stroke="#1b3749" stroke-width="0.35" fill="none"><path d="M0 24H360M0 54H360M0 84H360M0 114H360"/><path d="M60 0V142M120 0V142M180 0V142M240 0V142M300 0V142"/></g>
<path d="${coast}" fill="#2b4c63" stroke="#456b83" stroke-width="0.55"/>
${STORIES.filter((story) => story.geo && story.tier !== 'lead').map((story) => dot(story, 2.2)).join('')}
${leads.map((lead) => {
  const story = storyAt(lead.n);
  const [x, y] = project(story.geo.lon, story.geo.lat);
  const label = words.labels[lead.n] ?? { dx: 6, dy: 3, label: story.place, anchor: '' };
  const anchor = label.anchor ? ` text-anchor="${label.anchor}"` : '';
  return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="#0f2433"/>`
    + `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.4" fill="${hue(story.region)[2]}"/>`
    + `<text x="${x.toFixed(1)}" y="${(y + 2.1).toFixed(1)}" class="mn">${lead.n}</text>`
    + `<text x="${(x + label.dx).toFixed(1)}" y="${(y + label.dy).toFixed(1)}" class="ml"${anchor}>${esc(label.label)}</text></g>`;
}).join('')}
</svg>`;

// --- drawings ---------------------------------------------------------------------------------
// Flat shapes only, each one built out of the facts its own story reports.
const star = (cx, cy, radius) => {
  const points = Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const reach = i % 2 ? radius * 0.34 : radius;
    return `${(cx + reach * Math.cos(angle)).toFixed(1)} ${(cy + reach * Math.sin(angle)).toFixed(1)}`;
  });
  return `M${points.join('L')}Z`;
};

const SCENE = {
  // ballots on a table: a vote being counted, one pile higher than the other
  count: `<svg viewBox="0 0 164 132" aria-hidden="true">
<rect width="164" height="132" fill="#1d2a1c"/>
<rect x="0" y="96" width="164" height="36" fill="#243726"/>
<g fill="#f3ead6"><rect x="18" y="70" width="52" height="9"/><rect x="20" y="80" width="52" height="9"/><rect x="17" y="90" width="52" height="9"/></g>
<g fill="#d9c9a8"><rect x="94" y="52" width="52" height="9"/><rect x="96" y="62" width="52" height="9"/><rect x="93" y="72" width="52" height="9"/><rect x="95" y="82" width="52" height="9"/><rect x="94" y="92" width="52" height="9"/></g>
<g stroke="#8a7a5c" stroke-width="1.1"><path d="M24 74h40M24 84h40M24 94h40M100 56h40M100 66h40M100 76h40M100 86h40M100 96h40"/></g>
<path d="M70 16l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="#f0b24a"/>
</svg>`,
  // a ship held at a quay, a queue of trucks waiting behind it
  quay: `<svg viewBox="0 0 164 132" aria-hidden="true">
<rect width="164" height="132" fill="#122436"/>
<rect x="0" y="88" width="164" height="44" fill="#0d1b28"/>
<g fill="#e4d7bf"><path d="M44 46h64l10 32H34z"/><rect x="58" y="30" width="34" height="16"/></g>
<g fill="#b3261e"><rect x="58" y="30" width="34" height="6"/><rect x="52" y="62" width="52" height="4"/></g>
<g fill="#9aa8b6"><rect x="8" y="78" width="22" height="10"/><rect x="8" y="70" width="16" height="8"/><rect x="140" y="78" width="20" height="10"/></g>
<g stroke="#7d8a96" stroke-width="1"><path d="M0 88h164M0 100h164"/></g>
<g fill="#f0b24a"><circle cx="30" cy="86" r="2"/><circle cx="136" cy="86" r="2"/></g>
</svg>`,
  // a lever being pulled: the switch of a policy, one arm of a machine moving
  lever: `<svg viewBox="0 0 164 132" aria-hidden="true">
<rect width="164" height="132" fill="#2a2318"/>
<rect x="26" y="86" width="112" height="26" rx="2" fill="#3d3223"/>
<rect x="26" y="86" width="112" height="5" fill="#5b4a33"/>
<g stroke="#c8b48c" stroke-width="4" stroke-linecap="round"><path d="M82 88L124 42"/></g>
<circle cx="82" cy="88" r="9" fill="#e3d2af"/>
<circle cx="82" cy="88" r="3.4" fill="#2a2318"/>
<circle cx="124" cy="42" r="7" fill="#b3261e"/>
<g stroke="#8a7a5c" stroke-width="2" stroke-linecap="round" opacity=".8"><path d="M40 78h26M40 68h18"/></g>
</svg>`,
  // a press leaflet: a page with a headline bar and columns of type
  press: `<svg viewBox="0 0 164 132" aria-hidden="true">
<rect width="164" height="132" fill="#1f232a"/>
<g transform="rotate(-3 100 74)">
<rect x="52" y="18" width="100" height="98" fill="#f6f1e4"/>
<rect x="60" y="26" width="72" height="12" fill="#1f232a"/>
<g stroke="#a89d88" stroke-width="2" stroke-linecap="round"><path d="M60 48h84M60 56h84M60 64h78M60 72h84M60 80h70M60 88h84M60 96h56"/></g>
<rect x="60" y="106" width="34" height="4" fill="#b3261e"/>
</g>
<rect x="22" y="30" width="34" height="46" fill="#e9e2d2"/>
<g stroke="#b5ab97" stroke-width="2"><path d="M28 40h22M28 48h22M28 56h16M28 64h22"/></g>
</svg>`,
};

const GLYPH = {
  ship: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.2 15.6h19.6l-2.9 4.6H5.1z" fill="currentColor"/><rect x="6.4" y="10.6" width="3.4" height="3.2" fill="currentColor"/><rect x="10.6" y="10.6" width="3.4" height="3.2" fill="currentColor" opacity=".65"/><rect x="10.6" y="6.6" width="3.4" height="3.2" fill="currentColor"/><circle cx="16.6" cy="7.4" r="2.2" fill="currentColor" opacity=".45"/><circle cx="19" cy="4.6" r="1.7" fill="currentColor" opacity=".3"/><path d="M17.4 10.4V15" stroke="currentColor" stroke-width="1.4"/></svg>`,
  burst: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.6l2.1 5.3 4.6-3.2-1.9 5.2 5.6.1-4.6 3.1 3.4 4.2-5.4-1.2.6 5.5-3.6-4.2-3.6 4.2.6-5.5-5.4 1.2 3.4-4.2L3.6 9l5.6-.1L7.3 3.7l4.6 3.2z" fill="currentColor"/><circle cx="12" cy="12.4" r="2.6" fill="#f7f3ea"/></svg>`,
  boat: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.4 12.4l17-3.6 1.6 5.2-15.4 3.2z" fill="currentColor"/><path d="M8.6 9.4l1.2-3.6 4 1.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"><path d="M2 19.6c1.6-1.4 3-1.4 4.6 0s3 1.4 4.6 0 3-1.4 4.6 0 3 1.4 4.6 0"/></g><circle cx="15.4" cy="7.2" r="1.6" fill="currentColor"/></svg>`,
  talks: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 4.2h12.6v8.4H9.4l-3.6 3v-3H2z" fill="currentColor" opacity=".55"/><path d="M9.4 9.6h12.6V18h-3.8v3l-3.6-3H9.4z" fill="currentColor" stroke="#f7f3ea" stroke-width="1.1"/><g stroke="#f7f3ea" stroke-width="1.3" stroke-linecap="round"><path d="M12.4 12.6h6.6M12.4 15.2h4.6"/></g></svg>`,
  aid: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.6" y="7.6" width="18.8" height="13.4" rx="1" fill="currentColor"/><rect x="1.8" y="4.2" width="20.4" height="4" rx="0.8" fill="currentColor" opacity=".65"/><path d="M12 11.2c1.8-2.4 5.4-.8 4.3 2-.7 1.7-4.3 4-4.3 4s-3.6-2.3-4.3-4c-1.1-2.8 2.5-4.4 4.3-2z" fill="#f7f3ea"/></svg>`,
  cuffs: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="7.4" cy="12" r="4.6"/><circle cx="16.6" cy="12" r="4.6"/></g><path d="M11.4 12h1.2" stroke="currentColor" stroke-width="2.2"/><path d="M3.4 8.4 1.6 6.6M20.6 8.4l1.8-1.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.4 1.6L4.2 13.4h6.2l-1.6 9 9.4-12h-6.4z" fill="currentColor"/><path d="M3 21.4h5.6M15.4 21.4H21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".55"/></svg>`,
  probe: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.4" cy="10.4" r="7.2" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15.8 15.8L21.6 21.6" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><path d="M6.4 7.6l3.2 4 2-2.6 2.4 3.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  pulse: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2.4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4.6 12.4h3.6l2-4.2 3 8.4 2.2-4.2h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  vote: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9.4l9-5.6 9 5.6v2H3z" fill="currentColor"/><rect x="4.6" y="12.4" width="2.6" height="7.2" fill="currentColor"/><rect x="10.7" y="12.4" width="2.6" height="7.2" fill="currentColor"/><rect x="16.8" y="12.4" width="2.6" height="7.2" fill="currentColor"/><rect x="2.6" y="20.2" width="18.8" height="2.4" fill="currentColor"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20.4h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="4.4" y="12" width="3.4" height="7" fill="currentColor"/><rect x="10.3" y="8" width="3.4" height="11" fill="currentColor" opacity=".72"/><rect x="16.2" y="4.4" width="3.4" height="14.6" fill="currentColor"/></svg>`,
};

// --- the blocks -------------------------------------------------------------------------------
const clockStrip = `<section class="daystrip"><div class="ds-head"><h5>${esc(words.clockTitle)}`
  + `<span>${esc(words.clockNote)}</span></h5></div>
<div class="ds-track">${words.clock.map((tick) => `<div class="ds-i"><b>${esc(tick.at)}</b><span>${esc(tick.about)}</span></div>`).join('')}</div></section>`;

const leadBlock = (lead) => {
  const scene = SCENE[lead.art] ?? SCENE.press;
  return `<article class="lead"><div class="panel"><div class="panel-txt">`
    + `<div class="pk">${esc(`${lead.p} · ${lead.t}`)}</div>`
    + `<div class="pfig">${esc(lead.fig)}</div>`
    + `<div class="punit">${esc(lead.unit)}</div>`
    + `<div class="psub">${esc(lead.sub)}</div>`
    + `<div class="pmark"><em>${esc(lead.mark[0])}</em> ${esc(lead.mark[1])}</div>`
    + `</div><div class="part">${scene}</div></div>`
    + `<h3>${lead.head.map(esc).join('<br>')}</h3><p class="deck">${esc(lead.deck)}</p>`
    + `<div class="src">${esc(lead.src)} &middot; <span class="ts">${stamp(lead.n)}</span></div></article>`;
};

const cardBlock = (card) => `<article class="card" style="--gc:${hue(storyAt(card.n).region)[1]}">`
  + `<div class="chead"><span class="ck">${esc(`${card.p} · ${card.t}`)}</span>`
  + `<span class="cg">${GLYPH[card.glyph] ?? GLYPH.chart}</span></div>`
  + `<h4>${esc(card.h)}</h4><p><b>${esc(card.d)}</b> &middot; ${esc(card.b)}</p>`
  + `<div class="src">${esc(card.s)} &middot; <span class="ts">${stamp(card.n)}</span></div></article>`;

const briefItem = (item) => `<li style="--gc:${hue(storyAt(item.n).region)[1]}"><b>${esc(item.p)}</b> `
  + `${esc(item.t)} <span class="bs">${esc(item.s)} &middot; <span class="ts">${stamp(item.n)}</span></span></li>`;

// Briefs run down columns of almost equal length, so the last row is never ragged: the longest
// columns come first. The column count grows only if the edition has more briefs than three
// columns of eight can hold.
const columns = Math.max(3, Math.ceil(briefs.length / 8));
const rows = Math.ceil(briefs.length / columns);
const longColumns = briefs.length - columns * (rows - 1);
let cursor = 0;
const briefColumns = Array.from({ length: columns }, (_, index) => {
  const size = rows - (index < longColumns ? 0 : 1);
  const slice = briefs.slice(cursor, cursor + size);
  cursor += size;
  return `<ul class="b">${slice.map(briefItem).join('')}</ul>`;
});

const figureBlock = (figure) => `<div class="num"><div class="nf">${esc(figure.fig)}</div>`
  + `<div class="nc">${esc(figure.cap)} <span class="ns">&middot; ${esc(figure.s)}</span></div></div>`;

const regionKey = Object.entries(tally).sort((a, b) => b[1] - a[1])
  .map(([id, count]) => `<span class="rg"><i style="background:${hue(id)[1]}"></i>${esc(hue(id)[0])}<b>${count}</b></span>`)
  .join('');

// --- the page ---------------------------------------------------------------------------------
const sheet = `
:root{--paper:${words.paper};--ink:#15120e;--muted:#6d645a;--rule:#15120e;--soft:#d8cfc0;--accent:${words.accent};--amber:#f3c79a;--brief-cols:${columns}}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1024px;height:1024px;overflow:hidden}
body{background:var(--paper);color:var(--ink);font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;padding:11px 16px 9px;display:flex;flex-direction:column;gap:5px}
.rail{display:flex;justify-content:space-between;align-items:baseline;background:var(--ink);color:#e8dfd2;padding:3px 8px 2.5px;font-size:8.8px;letter-spacing:.16em;text-transform:uppercase}
.rail b{color:var(--paper);letter-spacing:.18em}
.rail .date{color:var(--amber);font-weight:700;letter-spacing:.18em}
.mast{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;border-top:3px solid var(--rule);border-bottom:1px solid var(--rule);padding:3px 0 4px}
.mast h1{font-family:Georgia,'Times New Roman',serif;font-weight:700;font-size:48px;line-height:.94;letter-spacing:-.028em}
.mast .side{text-align:right;font-size:8.6px;line-height:1.35;letter-spacing:.1em;text-transform:uppercase;color:#4a433b;padding-bottom:3px;white-space:nowrap}
.mast .side b{display:block;font-size:10.6px;letter-spacing:.01em;text-transform:none;color:var(--ink);font-family:Georgia,serif;font-style:italic;font-weight:400;margin:1px 0}
.daystrip{border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);padding:3px 0 4px}
.daystrip h5{margin:0 0 3px}
.ds-track{display:grid;grid-template-columns:repeat(${words.clock.length},minmax(0,1fr));border-top:1px solid #b8ae9e}
.ds-i{position:relative;min-width:0;border-left:1px solid #cec3b0;padding:3px 6px 2px 7px;color:#332d26}
.ds-i:first-child{border-left:0}
.ds-i::before{content:'';position:absolute;left:-1px;top:-1px;width:1px;height:5px;background:var(--accent)}
.ds-i:first-child::before{left:0}
.ds-i b{display:block;font-size:7.4px;font-weight:700;letter-spacing:.01em;color:var(--accent);line-height:1.05}
.ds-i span{display:block;font-size:7.5px;line-height:1.15;margin-top:1.5px;white-space:nowrap;overflow:hidden}
.leads{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 14px}
.lead{min-width:0;display:flex;flex-direction:column}
.panel{position:relative;display:flex;height:132px;overflow:hidden;background:#1d2a1c}
.lead:nth-child(2) .panel{background:#122436}
.lead:nth-child(3) .panel{background:#2a2318}
.panel .part{position:absolute;right:0;top:0;width:164px;height:132px}
.panel .part svg{display:block;width:164px;height:132px}
.panel::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(29,42,28,.98) 40%,rgba(29,42,28,0) 74%);z-index:1}
.lead:nth-child(2) .panel::after{background:linear-gradient(90deg,rgba(18,36,54,.98) 40%,rgba(18,36,54,0) 74%)}
.lead:nth-child(3) .panel::after{background:linear-gradient(90deg,rgba(42,35,24,.98) 40%,rgba(42,35,24,0) 74%)}
.panel-txt{position:relative;z-index:2;padding:5px 0 5px 9px;width:52%;color:#f7f3ea;display:flex;flex-direction:column}
.pk{font-size:7.4px;letter-spacing:.12em;text-transform:uppercase;color:var(--amber);font-weight:700;white-space:nowrap}
.pfig{font-family:Georgia,serif;font-size:46px;font-weight:700;line-height:.92;letter-spacing:-.03em;margin-top:auto}
.punit{font-size:8.3px;line-height:1.1;letter-spacing:.03em;text-transform:uppercase;color:#ece3d5;margin-top:2px}
.psub{font-size:7.6px;line-height:1.18;color:#c7d2da;margin-top:2px}
.pmark{font-size:6.6px;line-height:1.2;color:#e8dcc6;letter-spacing:.03em;margin-top:4px;border-top:1px solid rgba(255,255,255,.22);padding-top:2.5px}
.pmark em{font-style:normal;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--amber)}
.lead h3{font-family:Georgia,serif;font-size:24px;line-height:1.01;letter-spacing:-.018em;margin:5px 0 2px}
.lead .deck{font-size:9.6px;line-height:1.2;color:#332d26}
.src{font-size:7.4px;letter-spacing:.055em;text-transform:uppercase;color:#8a8074;margin-top:2px}
.mid{display:grid;grid-template-columns:1fr 312px;gap:14px;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);padding:4px 0 5px}
h5{font-size:8.4px;letter-spacing:.13em;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:2px}
h5 span{color:var(--muted);letter-spacing:.04em;text-transform:none;font-weight:400;font-size:7.6px}
.map{width:100%;display:block;border:1px solid #0b1c27}
.ml{font:700 5.6px Arial;fill:#f4efe3;letter-spacing:.03em;paint-order:stroke;stroke:#0f2433;stroke-width:1.2}
.mn{font:700 5.1px Arial;fill:#f9f5ea;text-anchor:middle}
.regions{display:flex;flex-wrap:wrap;gap:1px 11px;margin-top:3px;align-items:center}
.rg{font-size:8px;color:#3d372f;display:inline-flex;align-items:center;gap:3px}
.rg i{width:6px;height:6px;display:inline-block}
.rg b{margin-left:1px}
.nums-panel{background:#0f2433;color:var(--paper);padding:4px 9px 8px;display:flex;flex-direction:column}
.nums-panel h5{color:var(--amber);border-bottom:1px solid #4a433b;padding-bottom:2px;margin-bottom:3px}
.nums-panel h5 span{color:#a89c8d}
.nums{display:grid;grid-template-columns:1fr 1fr;gap:2px 9px;flex:1;align-content:space-between}
.nf{font-family:Georgia,serif;font-size:23px;font-weight:700;line-height:.98;letter-spacing:-.03em;color:var(--amber)}
.nc{font-size:7.1px;line-height:1.12;color:#e8dfd2;margin-top:1px;padding-right:2px}
.ns{color:#a89c8d;font-size:6.4px;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
.cards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0 12px;align-content:start}
.card{padding:1px 0 1px;border-top:3px solid var(--gc);min-width:0}
.chead{display:flex;justify-content:space-between;align-items:center;gap:4px;min-height:25px}
.ck{flex:1 1 auto;min-width:0;font-size:6.9px;letter-spacing:.07em;text-transform:uppercase;color:var(--accent);font-weight:700;white-space:nowrap;overflow:hidden}
.cg{flex:0 0 24px;width:24px;height:24px;color:var(--gc)}
.cg svg{display:block;width:24px;height:24px}
.card h4{font-family:Georgia,serif;font-size:11.9px;line-height:1.04;letter-spacing:-.01em;margin:1px 0}
.card p{font-size:8.1px;line-height:1.13;color:#4a433b}
.card p b{color:var(--ink)}
.card .src{margin-top:1px}
.sentence{border-top:2px solid var(--rule);border-bottom:1px solid var(--rule);padding:2px 0;display:flex;gap:12px;align-items:baseline}
.sentence .lab{font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:700;white-space:nowrap}
.sentence p{font-family:Georgia,serif;font-size:14.6px;line-height:1.18;letter-spacing:-.01em}
.sentence p b{font-weight:700}
.briefs-head{border-top:1px solid var(--soft);padding-top:3px;display:flex;justify-content:space-between;align-items:baseline}
.briefs-head h5{margin:0}
.briefs-head .cnt{font-size:7.8px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.briefs{flex:1;min-height:0;border-top:1px solid var(--soft);padding:5px 0 3px;margin-top:3px;display:grid;grid-template-columns:repeat(var(--brief-cols),minmax(0,1fr));gap:0 16px}
ul.b{list-style:none;display:flex;flex-direction:column;justify-content:space-between;min-width:0}
ul.b li{font-size:10.4px;line-height:1.13;color:#2b2620;padding-left:9px;position:relative}
ul.b li::before{content:'';position:absolute;left:0;top:5px;width:4px;height:4px;background:var(--gc)}
ul.b li b{font-weight:700}
.ts{color:#3f382f;font-weight:700;letter-spacing:.02em}
.bs{color:#8a8074;font-size:7px;letter-spacing:.03em;text-transform:uppercase;white-space:nowrap}
.foot{border-top:1px solid var(--rule);padding-top:3px;display:flex;justify-content:space-between;align-items:baseline;gap:14px}
.foot p{font-size:7.4px;line-height:1.24;color:#4a433b;max-width:830px}
.foot p b{color:var(--ink)}
.mark{font-family:Georgia,serif;font-size:10px;font-weight:700;letter-spacing:.02em;white-space:nowrap}
`;

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(TITLE)}</title><style>${sheet}</style></head>
<body>
<div class="rail"><span><b>${esc(words.rail.left)}</b></span><span class="date">${esc(TITLE)}</span><span>${esc(words.rail.right)}</span></div>
<header class="mast"><h1>${esc(TITLE)}</h1><div class="side">${esc(words.rail.note)}<b>${esc(words.rail.line)}</b></div></header>
${clockStrip}
<section class="leads">${leads.map(leadBlock).join('')}</section>
<section class="mid"><div><h5>${esc(words.mapTitle)} <span>${esc(words.mapNote)}</span></h5>${mapSvg}<div class="regions">${regionKey}</div></div><div class="nums-panel"><h5>${esc(words.figuresTitle)} <span>${esc(words.figuresNote)}</span></h5><div class="nums">${words.figures.map(figureBlock).join('')}</div></div></section>
<section class="cards">${cards.map(cardBlock).join('')}</section>
<section class="sentence"><span class="lab">${esc(words.sentenceLabel)}</span><p>${words.sentence}</p></section>
<section class="briefs-head"><h5>${esc(words.briefsTitle)} <span>${esc(words.briefsNote)}</span></h5><span class="cnt">${briefs.length} more stories</span></section>
<section class="briefs">${briefColumns.join('')}</section>
<footer class="foot"><p>${words.footer}</p><div class="mark">${esc(words.mark)}</div></footer>
</body></html>`;

writeFileSync(here('./poster.html'), page);
console.log(`poster.html: ${page.length} bytes, ${leads.length} leads, ${cards.length} cards, ${briefs.length} briefs, ${words.figures.length} figures, ${columns} brief columns`);
