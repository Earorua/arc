export function extractResearchJson(content: string): string {
  const value = content.trim(); const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```$/u.exec(value);
  return fence ? fence[1] : value;
}
