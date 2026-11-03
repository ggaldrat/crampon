/** Length of the text tail looked for earlier in the answer. */
const TAIL_CHARS = 40;
/** How many times that tail may appear before the answer counts as a loop. */
const MAX_REPEATS = 4;

/**
 * Crampon: a small model can repeat one sentence until the context is full
 * (e.g. announcing a tool call it never makes). True once the end of `text`
 * has already appeared MAX_REPEATS times: periodic text repeats its tail.
 */
export function isRepeating(text: string): boolean {
  if (text.length < TAIL_CHARS * MAX_REPEATS) {
    return false;
  }
  const tail = text.slice(-TAIL_CHARS);
  let count = 0;
  for (let i = text.indexOf(tail); i !== -1; i = text.indexOf(tail, i + 1)) {
    count += 1;
    if (count >= MAX_REPEATS) {
      return true;
    }
  }
  return false;
}
