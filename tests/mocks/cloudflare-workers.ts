export const env: Record<string, unknown> = {};
export class WorkerEntrypoint<T = Record<string, unknown>> {
  constructor(protected ctx: unknown, protected env: T) {}
}
