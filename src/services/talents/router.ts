/**
 * Picks the tools to show the model for one question. A small model chooses
 * far better among one or two tools than among all of them, and every tool
 * schema costs prompt tokens on a slow phone, so only the likely-useful ones
 * are advertised. Returns [] when no tool fits: the model answers alone.
 *
 * Heuristics are deliberately plain (French and English); a false positive
 * only costs a little prompt, since the model still decides whether to call.
 */

const URL_OR_DOMAIN =
  /\bhttps?:\/\/\S+|\b(?:[a-z0-9-]+\.)+(?:com|fr|org|net|io|eu|be|ch|ca|info|gouv\.fr)\b/i;

const CALCULATION =
  /\d\s*[-+*/×÷^%]\s*\(?\s*\d|\b(?:calcule[rz]?|combien (?:font|fait)|racine|pourcentage|multipli|divis|calculate|square root|percent)\w*/i;

const DATE_TIME =
  /\b(?:quel(?:le)? (?:jour|date|heure|ann[ée]e|mois)|aujourd'hui|demain|hier|maintenant|cette semaine|what (?:day|time|date)|today|tomorrow|yesterday)\b/i;

const FACT_QUESTION =
  /\b(?:qui (?:est|était|a|sont|étaient|fut)|qu'est[- ]ce (?:que|qu)|c'est quoi|que (?:signifie|veut dire)|d[ée]finition|histoire d[eu']|biographie|quand (?:est|a|fut|était|s'est)|o[ùu] (?:est|se trouve|se situe)|capitale d[eu']|parle[- ]moi d[eu']|who (?:is|was|are|were)|what (?:is|was|are) (?:a |an |the )?[A-Z]|when (?:was|did|is)|where is|tell me about)\b/i;

const TIME_ZONE = /\b(?:fuseau|time ?zone)/i;

/** A capitalized word after the first one: likely a proper noun. */
const PROPER_NOUN = /\s[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ]{2,}/;

export const selectTalents = (question: string): string[] => {
  const text = question.trim();
  if (!text) {
    return [];
  }
  const talents: string[] = [];
  if (URL_OR_DOMAIN.test(text)) {
    talents.push('read_url');
  }
  if (CALCULATION.test(text)) {
    talents.push('calculate');
  }
  // The phone's own time is in the prompt (asksDateOrTime): the tool is only
  // for another place's time.
  if (
    DATE_TIME.test(text) &&
    (PROPER_NOUN.test(text) || TIME_ZONE.test(text))
  ) {
    talents.push('datetime');
  }
  if (
    FACT_QUESTION.test(text) ||
    (text.endsWith('?') && PROPER_NOUN.test(text) && talents.length === 0)
  ) {
    talents.push('wikipedia');
  }
  return talents;
};

/** The question is about the date or time: the phone's clock goes in the prompt. */
export const asksDateOrTime = (question: string): boolean =>
  DATE_TIME.test(question.trim());
