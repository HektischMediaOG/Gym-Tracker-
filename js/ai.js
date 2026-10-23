// KI-Schätzung von Kalorien und Nährwerten über die Claude API – direkt aus dem Browser
// mit dem eigenen API-Schlüssel (die App hat keinen Server). Der Schlüssel liegt nur
// in diesem Browser und ist bewusst nicht Teil des Backups.
import { getLang } from './i18n.js';

const KEY_STORAGE = 'gymtracker.anthropicKey';
const MODEL = 'claude-opus-5-5';

export function getApiKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function setApiKey(key) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* Speicher nicht verfügbar – dann eben nur für diese Sitzung nicht */
  }
}

const NUM = { type: 'number' };
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'note'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'amount_g', 'kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'salt', 'confidence'],
        properties: {
          name: { type: 'string' },
          amount_g: NUM,
          kcal: NUM,
          protein: NUM,
          carbs: NUM,
          fat: NUM,
          fiber: NUM,
          sugar: NUM,
          salt: NUM,
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
    note: { type: 'string' },
  },
};

const SYSTEM = `You estimate the nutrition of food for a calorie-tracking app used by someone who lifts weights.
Split the meal into its components (one item per food). For each item give the eaten amount in grams and the totals for that amount: kcal, protein, carbs, fat, fiber, sugar and salt in grams.
Use the amounts the user states. If no amount is given, assume a typical single portion in Germany/Europe. For photos, judge portion size from plate size, cutlery and packaging.
Count cooking oil, butter and sauces as their own items when they are likely used – they are the most common source of underestimated calories.
Prefer realistic values from standard food composition tables over round guesses. Set confidence to low when the portion or preparation is unclear.
Write item names and the note in the language given in the request. Keep the note to one short sentence on what you assumed; leave it empty if nothing needs saying.`;

let clientPromise = null;
async function client(apiKey) {
  // SDK erst laden, wenn die KI wirklich genutzt wird (≈200 KB)
  if (!clientPromise) clientPromise = import('../vendor/anthropic-sdk.mjs');
  const { Anthropic } = await clientPromise;
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
}

// Bild auf max. 1024 px verkleinern: spart Tokens und Upload, reicht für Portionsschätzung
export async function shrinkImage(file, max = 1024) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export class AiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // 'no-key' | 'auth' | 'rate' | 'refusal' | 'network' | 'parse' | 'api'
  }
}

export async function estimateNutrition({ text, imageDataUrl }) {
  const apiKey = getApiKey();
  if (!apiKey) throw new AiError('no-key', 'No API key');
  const sdk = await client(apiKey);
  const { Anthropic } = await clientPromise;

  const lang = getLang() === 'de' ? 'German' : 'English';
  const content = [];
  if (imageDataUrl) {
    const [, data] = imageDataUrl.split(',');
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
  }
  content.push({
    type: 'text',
    text: `Language: ${lang}\n\n${text?.trim() || 'Estimate the food in the photo.'}`,
  });

  let response;
  try {
    response = await sdk.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      // Bei einer Ablehnung durch die Sicherheitsfilter übernimmt automatisch ein anderes Modell
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new AiError('auth', e.message);
    if (e instanceof Anthropic.RateLimitError) throw new AiError('rate', e.message);
    if (e instanceof Anthropic.APIConnectionError) throw new AiError('network', e.message);
    if (e instanceof Anthropic.APIError) throw new AiError('api', e.message);
    throw new AiError('network', e?.message || String(e));
  }

  if (response.stop_reason === 'refusal') throw new AiError('refusal', response.stop_details?.explanation || 'refused');
  const textBlock = response.content.find((b) => b.type === 'text');
  try {
    const parsed = JSON.parse(textBlock?.text || '');
    return { items: parsed.items || [], note: parsed.note || '' };
  } catch {
    throw new AiError('parse', 'Could not read the estimate');
  }
}
