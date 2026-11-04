/** Synthetic OpenRouter generation for HTTP-boundary fixtures only. */
export function fixtureGenerationResponse(id: string, model: string) {
  return Response.json({ data: {
    id, model, provider_name: "Fixture Provider", provider_responses: [{ status: 200, endpoint_id: "fixture-endpoint" }],
    native_tokens_prompt: 100, native_tokens_completion: 20, total_cost: 0.000007,
  } });
}
