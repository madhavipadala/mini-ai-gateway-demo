What it is: local-first AI gateway with pluggable providers (local rules / OpenAI / Isabel mock), returning schema-validated JSON for an EHR-style UI.

Features: de-ID flag, /ai/diagnose + /ai/diagnose/batch, adapter pattern, JSON schema validation, repair, bounded concurrency, error mapping.

Quickstart:

```bash
npm i
cp .env.example .env
npm run build && npm start
curl -s http://127.0.0.1:8888/health | jq .
curl -s http://127.0.0.1:8888/ai/providers | jq .
# Single (local rules)
curl -sS -X POST 'http://127.0.0.1:8888/ai/diagnose?provider=local_rules' \
  -H 'Content-Type: application/json' \
  -d '{"deidentified":true,"input":{"chief_complaint":"fever and cough","demographics":{"age":29}}}' | jq .

Endpoints + curl: single, batch, provider switch.

Safety: PHI guard (must send "deidentified": true), .env only, no keys in repo.

Architecture diagram (request madhavipadala@yahoo.com

Smoke test script and expected JSON output.

Prototype only / Not for clinical use” disclaime

MIT License

Copyright (c) 2025 Madhavi Padala

This repository is © Madhavi Padala  under the MIT License.
It includes open-source dependencies which remain under their respective licenses; see THIRD_PARTY_NOTICES.*.G
