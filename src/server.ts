// src/server.ts
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import createError from 'http-errors';
import pinoHttp from 'pino-http';
import { adapters, type ProviderName } from './adapters/index.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp());

const PORT = Number(process.env.PORT ?? 8888);
const DEFAULT_PROVIDER = (process.env.DEFAULT_PROVIDER ?? 'local_rules') as ProviderName;
const ENABLED = new Set(
  (process.env.PROVIDERS_ENABLED ?? '').split(',').map(s => s.trim()).filter(Boolean)
);

function isEnabled(p: ProviderName) {
  return ENABLED.size ? ENABLED.has(p) : true;
}

function pickProvider(req: express.Request, itemProvider?: string): ProviderName {
  const fromReq = (req.query.provider as string) || req.header('x-provider') || req.body?.provider;
  const p = (itemProvider || fromReq || DEFAULT_PROVIDER) as ProviderName;
  if (!adapters[p]) throw createError(400, 'unknown_provider');
  if (!isEnabled(p)) throw createError(400, 'provider_disabled');
  return p;
}

app.get('/health', (_req, res) => res.json({ ok: true, provider_default: DEFAULT_PROVIDER }));

app.get('/ai/providers', (_req, res) => {
  const all = Object.keys(adapters) as ProviderName[];
  const enabled = all.filter(isEnabled);
  res.json({ default: DEFAULT_PROVIDER, enabled });
});

app.post('/ai/diagnose', async (req, res, next) => {
  try {
    const { deidentified, input, model } = req.body ?? {};
    if (!deidentified && process.env.ALLOW_PHI !== 'true') throw createError(400, 'phi_not_allowed');
    if (!input?.chief_complaint) throw createError(400, 'bad_request');

    const provider = pickProvider(req);
    const out = await adapters[provider].diagnose(input, { model });
    out.engine = out.engine ?? { name: provider };
    res.json(out);
  } catch (e) { next(e); }
});

app.post('/ai/diagnose/batch', async (req, res, next) => {
  try {
    const { deidentified, items = [], model } = req.body ?? {};
    if (!deidentified && process.env.ALLOW_PHI !== 'true') throw createError(400, 'phi_not_allowed');

    const pool = Number(process.env.BATCH_CONCURRENCY ?? 3);
    const results: any[] = new Array(items.length);
    let cursor = 0;

    async function runSlot() {
      const myIndex = cursor++;
      if (myIndex >= items.length) return;
      const it = items[myIndex];
      try {
        const provider = pickProvider(req, it?.provider);
        const out = await adapters[provider].diagnose(it.input, { model: it?.model ?? model });
        results[myIndex] = { index: myIndex, ok: true, output: { ...out, engine: out.engine ?? { name: provider } }, meta: it?.meta };
      } catch (err: any) {
        results[myIndex] = { index: myIndex, ok: false, error: String(err?.message ?? err), meta: it?.meta };
      }
      await runSlot();
    }

    await Promise.all(Array.from({ length: Math.min(pool, items.length) }, () => runSlot()));

    res.json({
      summary: {
        total: items.length,
        ok: results.filter(r => r?.ok).length,
        failed: results.filter(r => r && !r.ok).length
      },
      results
    });
  } catch (e) { next(e); }
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'internal_error' });
});

app.listen(PORT, () => console.log(`AI Gateway listening on :${PORT}`));

