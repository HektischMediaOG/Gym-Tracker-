// Open Food Facts: freie Produktdatenbank (Barcode-Lookup und Suche), ohne API-Schlüssel.
import { getLang } from './i18n.js';
import { round } from './util.js';

const BASE = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_de,product_name_en,generic_name,brands,quantity,serving_size,serving_quantity,nutriments,image_front_small_url';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// OFF-Produkt → einheitliches Format mit Werten pro 100 g
export function mapProduct(p) {
  if (!p) return null;
  const n = p.nutriments || {};
  let kcal = num(n['energy-kcal_100g']);
  if (kcal === null && num(n.energy_100g) !== null) kcal = num(n.energy_100g) / 4.184; // kJ → kcal
  const lang = getLang();
  const name = (lang === 'de' ? p.product_name_de : p.product_name_en) || p.product_name || p.product_name_de || p.product_name_en || p.generic_name || '';
  if (!name || kcal === null) return null;
  return {
    barcode: p.code || null,
    name: name.trim(),
    brand: (p.brands || '').split(',')[0].trim(),
    quantity: p.quantity || '',
    servingG: num(p.serving_quantity),
    servingLabel: p.serving_size || '',
    image: p.image_front_small_url || null,
    per100: {
      kcal: round(kcal),
      protein: round(num(n.proteins_100g) ?? 0, 1),
      carbs: round(num(n.carbohydrates_100g) ?? 0, 1),
      fat: round(num(n.fat_100g) ?? 0, 1),
      fiber: round(num(n.fiber_100g) ?? 0, 1),
      sugar: round(num(n.sugars_100g) ?? 0, 1),
      salt: round(num(n.salt_100g) ?? 0, 2),
    },
    source: 'off',
  };
}

async function getJson(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// null = Produkt unbekannt; wirft bei Netzwerkfehlern
export async function lookupBarcode(code) {
  const clean = String(code).replace(/\D/g, '');
  if (!clean) return null;
  const json = await getJson(`${BASE}/api/v2/product/${clean}.json?fields=${FIELDS}`);
  if (json.status !== 1 && json.status !== 'success') return null;
  return mapProduct(json.product);
}

export async function searchProducts(query) {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '25',
    sort_by: 'unique_scans_n',
    lc: getLang(),
    fields: FIELDS,
  });
  const json = await getJson(`${BASE}/cgi/search.pl?${params}`, 15000);
  return (json.products || []).map(mapProduct).filter(Boolean);
}
