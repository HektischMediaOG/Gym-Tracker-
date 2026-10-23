// Holt neue Studien aus Europe PMC (enthält PubMed) und schreibt sie nach news.json.
// Läuft täglich im GitHub-Workflow, weil die App selbst keinen Server hat.
// Aufruf: node scripts/fetch-news.mjs [Ausgabedatei]
import { writeFile } from 'node:fs/promises';

const OUT = process.argv[2] || 'news.json';
const DAYS = 60;
const PER_TOPIC = 20;
const API = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';

const any = (...terms) => `(${terms.map((t) => `TITLE_ABS:"${t}"`).join(' OR ')})`;
const MUSCLE = any('resistance training', 'strength training', 'resistance exercise', 'muscle hypertrophy', 'lean mass', 'fat-free mass', 'skeletal muscle mass');

export const TOPICS = [
  {
    id: 'strength',
    label: 'Krafttraining',
    query: any('resistance training', 'strength training', 'resistance exercise', 'muscle hypertrophy', 'powerlifting', 'bodybuilding'),
  },
  {
    id: 'nutrition',
    label: 'Ernährung',
    query: `${any('protein intake', 'protein supplementation', 'dietary protein', 'energy deficit', 'caloric restriction', 'energy restriction', 'creatine', 'diet', 'nutrition')} AND ${MUSCLE}`,
  },
  {
    id: 'recovery',
    label: 'Regeneration',
    query: `${any('sleep', 'recovery', 'rest interval', 'inter-set rest', 'deload', 'muscle damage', 'overreaching', 'detraining')} AND ${MUSCLE}`,
  },
];

const STUDY_TYPES = '(PUB_TYPE:"meta-analysis" OR PUB_TYPE:"systematic review" OR PUB_TYPE:"randomized controlled trial" OR PUB_TYPE:"review")';

// Ranking der Evidenz: Meta-Analyse vor Review vor RCT vor Übersichtsartikel
const TYPE_RANK = [
  ['meta-analysis', 'Meta-Analyse'],
  ['systematic review', 'Systematischer Review'],
  ['randomized controlled trial', 'RCT'],
  ['review', 'Review'],
];

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function studyType(r) {
  const types = (r.pubTypeList?.pubType || []).map((t) => String(t).toLowerCase());
  const flat = types.join(';') + ';' + String(r.pubType || '').toLowerCase();
  const hit = TYPE_RANK.find(([key]) => flat.includes(key));
  return hit ? hit[1] : 'Studie';
}

function clean(text, max) {
  if (!text) return '';
  const s = String(text).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return max && s.length > max ? s.slice(0, max).replace(/\s\S*$/, '') + ' …' : s;
}

function toItem(r, topicId) {
  const url = r.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/` : r.doi ? `https://doi.org/${r.doi}` : `https://europepmc.org/article/${r.source}/${r.id}`;
  return {
    id: `${r.source}:${r.id}`,
    topics: [topicId],
    title: clean(r.title).replace(/\.$/, ''),
    authors: clean(r.authorString, 120),
    journal: clean(r.journalInfo?.journal?.title || r.journalTitle || ''),
    date: r.firstPublicationDate || r.firstIndexDate || String(r.pubYear || ''),
    type: studyType(r),
    abstract: clean(r.abstractText, 1500),
    url,
  };
}

async function search(query) {
  const params = new URLSearchParams({
    query,
    format: 'json',
    resultType: 'core',
    pageSize: String(PER_TOPIC),
    sort: 'FIRST_PDATE_D desc',
  });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': 'gym-tracker-news (github.com/HektischMediaOG/Gym-Tracker-)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.resultList?.result || [];
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
}

async function main() {
  const to = new Date();
  const from = new Date(to.getTime() - DAYS * 86400000);
  const window = `FIRST_PDATE:[${isoDate(from)} TO ${isoDate(to)}]`;
  const byId = new Map();
  const errors = [];

  for (const topic of TOPICS) {
    const q = `${topic.query} AND ${STUDY_TYPES} AND ${window} AND SRC:MED AND LANG:eng`;
    try {
      const results = await search(q);
      for (const r of results) {
        const item = toItem(r, topic.id);
        if (!item.title) continue;
        const existing = byId.get(item.id);
        if (existing) existing.topics = [...new Set([...existing.topics, topic.id])];
        else byId.set(item.id, item);
      }
      console.log(`${topic.label}: ${results.length} Treffer`);
    } catch (e) {
      errors.push(`${topic.label}: ${e.message}`);
      console.error(`${topic.label} fehlgeschlagen:`, e.message);
    }
  }

  const items = [...byId.values()].sort((a, b) => b.date.localeCompare(a.date));
  const out = {
    updatedAt: new Date().toISOString(),
    source: 'Europe PMC',
    days: DAYS,
    topics: TOPICS.map(({ id, label }) => ({ id, label })),
    items,
    errors,
  };
  await writeFile(OUT, JSON.stringify(out, null, 1));
  console.log(`${items.length} Studien → ${OUT}`);
  // Nur abbrechen, wenn gar nichts kam – einzelne Themen dürfen ausfallen
  if (!items.length && errors.length) process.exitCode = 1;
}

main();
