// src/adapters/local_rules.ts
import type { Adapter, DiagnoseInput, DiagnoseOutput } from './index.js';

export const localRulesAdapter: Adapter = {
  name: 'local_rules',
  async diagnose(input: DiagnoseInput): Promise<DiagnoseOutput> {
    const cc = (input.chief_complaint || '').toLowerCase();
    const cardiac = /chest|diaphoresis|pressure/.test(cc);

    const out: DiagnoseOutput = {
      engine: { name: 'local_rules', version: '0.1' },
      differential: cardiac
        ? [
            { condition: 'Unstable angina', confidence: 0.6, why: 'ischemic-sounding chest pain' },
            { condition: 'Myocardial infarction', confidence: 0.2, why: 'consider ACS' }
          ]
        : [{ condition: 'Viral URI', confidence: 0.4, why: 'self-limited symptoms' }],
      triage: cardiac ? { level: 'high', why: 'possible ACS' } : { level: 'low', why: 'no red flags' },
      recommended_tests: cardiac ? ['ECG', 'Troponin'] : ['Symptomatic care'],
      red_flags: cardiac ? ['ischemic-sounding chest pain'] : [],
      provenance: { generated_at: new Date().toISOString() }
    };

    return out;
  }
};

