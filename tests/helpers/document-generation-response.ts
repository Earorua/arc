/** Synthetic OpenRouter generation for HTTP-boundary fixtures only. */
export function fixtureGenerationResponse(id: string, model: string,
  route: { providerName: string; endpointId: string; generationModel?: string } = { providerName: "Fixture Provider", endpointId: "fixture-endpoint" }) {
  return Response.json({ data: {
    id, model: route.generationModel ?? model, provider_name: route.providerName, provider_responses: [{ status: 200, endpoint_id: route.endpointId }],
    native_tokens_prompt: 100, native_tokens_completion: 20, total_cost: 0.000007,
  } });
}
