// src/adapters/isabel.ts
// Adapter for Isabel DDx Companion (shape is representative).
// Supports mock mode for local testing (no API key needed).
// NOT FOR CLINICAL USE.

import type { Adapter, DiagnoseInput, DiagnoseOutput } from './index.js';

type IsabelDiff = {
  name: string;
  score?: number;        // vendor "score" (0..N), or:
  probability?: number;  // vendor probability (0..1)
  icd10?: string;
};

type IsabelResp = {
  engine?: { build?: string; name?: string };
  differential?: IsabelDiff[];
  triage?: { category?: string; urgency?: string }; // e.g., emergent/urgent/routine/self-care
};

function httpError(prefix: string, status: number, details?: string) {
  const err: any = new Error(`${prefix}_http_${status}`);
  err.status = status;
  if (details) err.details = details;
  return err;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function withBackoff<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e: any) {
      const s = e?.status ?? 0;
      const retryable = [429, 500, 502, 503, 504].includes(s);
      if (!retryable || attempt >= retries) throw e;
      const ra = Number(e?.retryAfter || 0);
      const delay = ra ? ra * 1000 : 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
      await sleep(delay);
      attempt++;
    }
  }
}

function normalizeDifferential(diffs: IsabelDiff[] = []) {
  // prefer probability if present; else use non-negative "score"
  const vals = diffs.map(d =>
    typeof d.probability === 'number'
      ? Math.max(0, d.probability)
      : typeof d.score === 'number'
      ? Math.max(0, d.score)
      : 0
  );
  const sum = vals.reduce((a, b) => a + b, 0);
  return diffs.map((d, i) => ({
    condition: d.name,
    confidence: sum > 0 ? Math.min(1, vals[i] / sum) : undefined,
    codes: d.icd10 ? { icd10: d.icd10 } : undefined,
  }));
}

function mapTriage(t?: { category?: string; urgency?: string }): { level: 'low' | 'moderate' | 'high'; why: string } {
  const tag = (t?.category || t?.urgency || '').toLowerCase();
  let level: 'low' | 'moderate' | 'high' = 'low';
  if (['emergent', 'emergency', 'immediate', 'ed', 'er', 'red'].includes(tag)) level = 'high';
  else if (['urgent', 'yellow', 'soon', 'sooner'].includes(tag)) level = 'moderate';
  return { level, why: tag ? `vendor: ${tag}` : 'vendor triage not provided' };
}

export const isabelAdapter: Adapter = {
  name: 'isabel',
  async diagnose(input: DiagnoseInput): Promise<DiagnoseOutput> {
    const mock = process.env.ISABEL_MOCK === 'true';
    const base = process.env.ISABEL_BASE || 'https://api.isabelhealthcare.com';
    const key = process.env.ISABEL_API_KEY;

    // ------- MOCK MODE (no creds needed) -------
    if (mock) {
      const txt = (input.chief_complaint || '').toLowerCase();
      const pneumoniaish = /fever/.test(txt) && /cough/.test(txt) && /(pleuritic|chest pain)/.test(txt);
      const differential = pneumoniaish
        ? [
            { condition: 'Community-acquired pneumonia', confidence: 0.6 },
            { condition: 'Viral bronchitis', confidence: 0.3 },
          ]
        : [
            { condition: 'Viral URI', confidence: 0.5 },
            { condition: 'Influenza-like illness', confidence: 0.2 },
          ];
      return {
        engine: { name: 'isabel', version: 'mock-0.1' },
        differential,
        triage: { level: pneumoniaish ? 'moderate' : 'low', why: pneumoniaish ? 'mock: pneumonia-ish' : 'mock' },
        recommended_tests: pneumoniaish ? ['CXR', 'CBC'] : ['Symptomatic care'],
        red_flags: [],
        provenance: { generated_at: new Date().toISOString() },
      };
    }

    // ------- REAL API CALL -------
    if (!key) { const e: any = new Error('isabel_not_configured'); e.status = 400; throw e; }

    //const base = (process.env.ISABEL_BASE || '').replace(/\/+$/,'');
    const path = (process.env.ISABEL_DDX_PATH || '/ddx/companion').replace(/^\/?/, '/');
    const url = `${base}${path}`;

    const hdrName = process.env.ISABEL_AUTH_HEADER || 'Authorization';
    const prefix  = process.env.ISABEL_AUTH_PREFIX ?? 'Bearer';
    const headers: Record<string,string> = { 'Content-Type':'application/json' };
headers[hdrName] = prefix ? `${prefix} ${key}` : key;

    const debug = process.env.ISABEL_DEBUG === 'true';

    // Build a concise free-text from available fields
    
    const freeText = [ input.chief_complaint, (input as any).symptoms?.join(', '), (input as any).notes ].filter(Boolean).join('; ');
    const payload = {
    patient: { age: input.demographics?.age, sex: input.demographics?.sex, region: 'US' },
    presentation: { free_text: freeText },
    options: { max_results: 12 }
    };

    const data = await withBackoff(async () => {
      if (debug) console.log('[isabel] POST', url, 'headers:', headers, 'body:', JSON.stringify(payload));
      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
      const text = await r.text();
      if (debug) console.log('[isabel] status', r.status, 'body:', text);
      if (!r.ok) {
        const err: any = httpError('isabel', r.status, text);
        err.retryAfter = r.headers.get('retry-after');
        throw err;
      }
      return JSON.parse(text) as IsabelResp;
    }, 2);

    const diffs = normalizeDifferential(data.differential || []);
    const triage = mapTriage(data.triage);

    return {
      engine: { name: 'isabel', version: data.engine?.build || 'ddx' },
      differential: diffs,
      triage,
      recommended_tests: [], // vendor may not prescribe tests; keep empty or enrich later
      red_flags: [],
      provenance: { generated_at: new Date().toISOString() },
    };
  },
};

