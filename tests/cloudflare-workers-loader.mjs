const cloudflareWorkersModule = "data:text/javascript,export const env = {}; export class WorkerEntrypoint { constructor(ctx, environment) { this.ctx = ctx; this.env = environment; } }";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { url: cloudflareWorkersModule, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
