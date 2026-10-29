/** Only absent or whitespace-only labels may use the validated URL's hostname. */
export function needsCitationTitleFallback(title: unknown): boolean {
  return title === undefined || typeof title === "string" && title.trim().length === 0;
}
