export async function callInfermedica(input: any, apiKey: string, appId: string) {
  return {
    patient_id: input?.patient_id || "unknown",
    engine: { name: "infermedica", version: "stub" },
    differential: [
      { condition: "Example condition (Infermedica)", confidence: 0.42, rationale: "Stubbed adapter output." }
    ],
    red_flags: [],
    recommended_tests: [],
    triage: { level: "routine", why: "Stub" },
    notes: ["Infermedica stub; replace with API calls."],
    provenance: { generated_at: new Date().toISOString(), temperature: null, prompt_profile: "infermedica_stub" }
  };
}
