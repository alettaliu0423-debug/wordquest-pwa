/** Stable per question instance: refreshing preserves order; new instances vary it. */
export function orderedChoices(choices: readonly string[], seed: string): string[] {
  const result = [...choices];
  let state = 2166136261;
  for (const letter of seed) state = Math.imul(state ^ letter.charCodeAt(0), 16777619) >>> 0;
  for (let i = result.length - 1; i > 0; i--) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    const j = (state >>> 0) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
