export type SafeErrorExplanation = {
  state: "missing" | "invalid" | "unrecognized" | "recognized";
  category: "invalid-or-disabled-key" | "account-restricted" | "insufficient-credits" | "region-restriction"
    | "guardrail-or-moderation" | "privacy-or-routing" | "invalid-model" | "rate-limit" | "permission"
    | "provider-error" | null;
  summary: string;
};

type RecognizedExplanation = SafeErrorExplanation & { state: "recognized"; category: Exclude<SafeErrorExplanation["category"], null> };

const RULES: readonly { pattern: RegExp; explanation: RecognizedExplanation }[] = [
  {
    pattern: /\b(?:invalid|disabled|revoked|expired)\s+(?:api\s+)?key\b|\b(?:api\s+)?key\s+(?:is\s+)?(?:invalid|disabled|revoked|expired)\b|\bauthentication\s+(?:failed|required|error)\b/iu,
    explanation: { state: "recognized", category: "invalid-or-disabled-key", summary: "Provider reported that the API key may be invalid or disabled." },
  },
  {
    pattern: /\baccount\b.{0,40}\b(?:blocked|disabled|flagged|restricted|suspended)\b|\b(?:blocked|disabled|flagged|restricted|suspended)\b.{0,40}\baccount\b/iu,
    explanation: { state: "recognized", category: "account-restricted", summary: "Provider reported that the account may be disabled or restricted." },
  },
  {
    pattern: /\binsufficient\s+(?:funds|credits?)\b|\bnot\s+enough\s+credits?\b|\bout\s+of\s+credits?\b|\bpayment\s+required\b|\bcredit\s+balance\b/iu,
    explanation: { state: "recognized", category: "insufficient-credits", summary: "Provider reported that available credits may be insufficient." },
  },
  {
    pattern: /\b(?:country|region)\b.{0,50}\b(?:blocked|disabled|not\s+(?:available|supported)|restricted|unavailable|unsupported)\b|\b(?:blocked|restricted|unsupported)\b.{0,30}\b(?:country|region)\b|\bunavailable\s+in\s+(?:your\s+)?(?:country|region)\b/iu,
    explanation: { state: "recognized", category: "region-restriction", summary: "Provider reported a possible country or region restriction." },
  },
  {
    pattern: /\bguardrails?\b|\bmoderation\b|\bcontent\s+policy\b|\bsafety\s+policy\b|\bflagged\s+input\b/iu,
    explanation: { state: "recognized", category: "guardrail-or-moderation", summary: "Provider reported a possible guardrail or moderation restriction." },
  },
  {
    pattern: /\bno\s+(?:matching\s+)?endpoints?\b|\bdata\s+(?:collection\s+)?policy\b|\bprivacy\s+(?:policy|restriction)\b|\bzero\s+data\s+retention\b|\bzdr\b|\brouting\s+(?:restriction|unavailable)\b/iu,
    explanation: { state: "recognized", category: "privacy-or-routing", summary: "Provider reported that no route may satisfy the request constraints." },
  },
  {
    pattern: /\b(?:invalid|unknown|unsupported)\s+model(?:\s+id)?\b|\bmodel\s+(?:id\s+)?(?:does\s+not\s+exist|is\s+unavailable|not\s+found|unavailable)\b/iu,
    explanation: { state: "recognized", category: "invalid-model", summary: "Provider reported that the requested model may be invalid or unavailable." },
  },
  {
    pattern: /\brate\s+limit(?:ed|\s+exceeded)?\b|\btoo\s+many\s+requests\b|\bthrottl(?:e|ed|ing)\b/iu,
    explanation: { state: "recognized", category: "rate-limit", summary: "Provider reported that a rate limit may have been reached." },
  },
  {
    pattern: /\bpermission\s+denied\b|\bforbidden\b|\bnot\s+authori[sz]ed\b/iu,
    explanation: { state: "recognized", category: "permission", summary: "Provider reported a possible permission restriction." },
  },
  {
    pattern: /\b(?:upstream\s+)?provider\s+(?:returned\s+)?(?:an?\s+)?(?:error|failure|unavailable|overloaded)\b/iu,
    explanation: { state: "recognized", category: "provider-error", summary: "Provider reported an unspecified provider error." },
  },
];

/** Classify only the bounded provider message into fixed text that cannot echo provider data. */
export function explainProviderErrorMessage(message: unknown): SafeErrorExplanation {
  if (message === undefined || message === null) {
    return { state: "missing", category: null, summary: "Provider did not include an error message." };
  }
  if (typeof message !== "string") {
    return { state: "invalid", category: null, summary: "Provider returned an invalid error message." };
  }
  const bounded = message.slice(0, 4096);
  const match = RULES.find(({ pattern }) => pattern.test(bounded));
  return match
    ? { ...match.explanation }
    : { state: "unrecognized", category: null, summary: "Provider returned an unrecognized error message." };
}
