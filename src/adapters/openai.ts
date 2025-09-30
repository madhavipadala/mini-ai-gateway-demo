// src/adapters/openai.ts
import type { Adapter, DiagnoseInput, DiagnoseOutput } from './index.js';

// Uses Node 20+ global fetch
export const openaiAdapter: Adapter = {
  name: 'openai',
  async diagnose(input: DiagnoseInput, opts) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('missing_openai_key');

    const model = opts?.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const base = process.env.OPENAI_BASE ?? 'https://api.openai.com/v1';
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 800,
        messages: [
          { role: 'system', content: 'You output ONLY valid JSON matching the requested fields.' },
          { role: 'user', content: JSON.stringify({
              task: 'clinical_differential_v1',
              required_fields: ['differential','triage','recommended_tests','red_flags'],
              input
            })
          }
        ]
      })
    });
    if (!r.ok) throw new Error(`openai_http_${r.status}`);
    const data: any = await r.json();
    const content = data?.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content);
    const out: DiagnoseOutput = {
      differential: parsed.differential ?? [],
      triage: parsed.triage ?? { level: 'low', why: '' },
      recommended_tests: parsed.recommended_tests ?? [],
      red_flags: parsed.red_flags ?? [],
      engine: { name: 'openai', version: model },
      provenance: { generated_at: new Date().toISOString() }
    };
    return out;
  }
};

