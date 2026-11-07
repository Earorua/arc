import { sha256, fieldId, sourceKey, reviewKey, metric, errorCollector } from "./candidate-common.mjs";

const boundary = (text, index) => index === 0 || index === text.length
  || !(text.charCodeAt(index - 1) >= 0xd800 && text.charCodeAt(index - 1) <= 0xdbff && text.charCodeAt(index) >= 0xdc00 && text.charCodeAt(index) <= 0xdfff);

/** Independent raw-text check; no production source resolver is imported. */
export function locateFrozenSpan(raw, source) {
  const segments = raw.segments.filter((segment) => segment.id === source.segmentId);
  if (segments.length !== 1) return null;
  const segment = segments[0];
  if (!Number.isSafeInteger(segment.start) || !Number.isSafeInteger(segment.end) || segment.start < 0 || segment.end <= segment.start || segment.end > raw.text.length
    || !boundary(raw.text, segment.start) || !boundary(raw.text, segment.end) || raw.text.slice(segment.start, segment.end) !== segment.text) return null;
  const hits = [];
  for (let index = 0; index <= segment.text.length - source.quote.length; index++) if (segment.text.startsWith(source.quote, index)) hits.push(index);
  if (source.quote.length === 0 || hits.length !== 1) return null;
  const start = segment.start + hits[0]; const end = start + source.quote.length;
  if (raw.text.indexOf(source.quote) !== start || raw.text.lastIndexOf(source.quote) !== start) return null;
  if (!boundary(raw.text, start) || !boundary(raw.text, end) || raw.text.slice(start, end) !== source.quote) return null;
  return { startOffset: start, endOffset: end, segmentStartOffset: hits[0], segmentEndOffset: hits[0] + source.quote.length };
}

export function verifySourceLedger(source, corpora) {
  if (source.documents.length !== 30 || corpora.length !== 30 || new Set(corpora.map((document) => document.id)).size !== 30) throw new Error("reference-integrity: source documents");
  for (const document of source.documents) {
    const raw = corpora.find((entry) => entry.id === document.id);
    if (!raw || raw.documentVersionId !== document.documentVersionId || raw.textVersionId !== document.textVersionId || sha256(raw.text) !== document.sourceTextSha256
      || new Set(raw.segments.map((segment) => segment.id)).size !== raw.segments.length) throw new Error("reference-integrity: source identity");
    for (const segment of raw.segments) if (!locateFrozenSpan(raw, { segmentId: segment.id, quote: segment.text })) throw new Error("reference-integrity: segment");
    for (const entry of [...document.fields, ...document.additionalFields, ...document.requiredReviews, ...document.optionalReviews, ...document.forbiddenReviews]) {
      const location = locateFrozenSpan(raw, entry.source);
      if (!location || entry.source.offsetUnit !== "utf16-code-unit" || entry.source.documentVersionId !== document.documentVersionId || entry.source.textVersionId !== document.textVersionId
        || Object.entries(location).some(([key, value]) => entry.source[key] !== value)) throw new Error("reference-integrity: source span");
      if (entry.factTextMatch && (entry.factTextMatch.text !== entry.source.quote || !entry.semanticScope.requiredLiteralSpans.every((literal) => entry.source.quote.includes(literal)))) throw new Error("reference-integrity: source semantics");
    }
  }
}

function finiteTerms(field) {
  return new Set([...field.skillTermGroups, ...field.optionalSkillTermGroups].flatMap((group) => group.alternatives).concat(field.combinedLiteralTerms.map((term) => term.literal)));
}

function evaluateField(field, candidate, context) {
  const errors = []; const location = { documentId: context.document.id, fieldId: fieldId(field), candidateId: candidate?.id ?? null };
  const issue = (code, extra = {}) => errors.push({ code, ...location, ...extra });
  if (!candidate) issue("missing-field");
  else {
    if (!context.versionValid) issue("field-version");
    const span = locateFrozenSpan(context.raw, candidate.source);
    if (!span || Object.entries(span).some(([key, value]) => field.source[key] !== value)) issue("source-span");
    if (context.duplicate) issue("duplicate-fact");
    if (candidate.text !== field.factTextMatch.text) issue("fact-text");
    if (candidate.kind !== field.expected.kind) issue("fact-kind");
    if (candidate.requirementLevel !== field.expected.requirementLevel) issue(field.semanticScope.conflictGroupId ? "unresolved-conflict" : "requirement-level");
    if (!field.expectedSelfLevelHint.allowedValues.includes(candidate.selfLevelHint)) issue("self-level-hint");
    const allowed = finiteTerms(field);
    for (const literal of candidate.skillLabels) if (!allowed.has(literal)) issue("unknown-term", { literal });
    for (const group of field.skillTermGroups) {
      if (!candidate.skillLabels.some((literal) => group.alternatives.includes(literal) || field.combinedLiteralTerms.some((combined) => combined.literal === literal && combined.coversGroupIds.includes(group.id)))) issue("missing-term-group", { groupId: group.id });
    }
  }
  const classificationCorrect = Boolean(candidate && context.versionValid && !context.duplicate && candidate.kind === field.expected.kind && candidate.requirementLevel === field.expected.requirementLevel);
  return { fieldId: fieldId(field), fieldKind: field.legacyId ? "legacy" : "additional", candidateId: candidate?.id ?? null,
    critical: field.legacy?.critical ?? false, classificationGroup: field.expected.classificationGroup,
    sourceRole: field.expected.sourceRole, passed: errors.length === 0, classificationCorrect, errors };
}

export function evaluateSource(documents, references) {
  const issues = errorCollector(); const bindings = new Map();
  const expectedIds = new Set(references.source.documents.map((document) => document.id));
  for (const document of documents) if (!expectedIds.has(document.documentId)) issues.add("unknown-document", { documentId: document.documentId });
  const reports = references.source.documents.map((document) => {
    const input = documents.find((entry) => entry.documentId === document.id);
    const raw = references.corpora.find((entry) => entry.id === document.id);
    const errors = []; const issue = (code, extra = {}) => errors.push({ code, documentId: document.id, ...extra });
    if (!input) issue("missing-document");
    const versionValid = Boolean(input && input.documentVersionId === document.documentVersionId && input.textVersionId === document.textVersionId);
    if (input && input.documentVersionId !== document.documentVersionId) issue("document-version");
    if (input && input.textVersionId !== document.textVersionId) issue("text-version");
    const allFields = [...document.fields, ...document.additionalFields];
    const candidates = input?.candidates ?? [];
    let validSources = 0;
    for (const candidate of candidates) {
      const span = locateFrozenSpan(raw, candidate.source);
      if (versionValid && span) validSources++; else issue("source-span", { candidateId: candidate.id });
      const matched = allFields.filter((field) => sourceKey(field.source) === sourceKey(candidate.source));
      if (!matched.length) issue("unmatched-fact", { candidateId: candidate.id });
      else {
        // Only the explicitly frozen shared facet can co-bind with one legacy fact.
        const legitimateSharing = matched.length === 1 || (matched.length === 2 && matched.some((field) => field.scoring?.linkedLegacyAndAdditionalFacetMayShareCandidate
          && matched.some((other) => other.legacyId === field.scoring.overlapsLegacyId)));
        if (!legitimateSharing) issue("ambiguous-field-anchor", { candidateId: candidate.id });
        else bindings.set(JSON.stringify([document.id, candidate.id]), { fields: matched, candidate });
      }
    }
    const fields = allFields.map((field) => {
      const matches = candidates.filter((candidate) => sourceKey(candidate.source) === sourceKey(field.source));
      return evaluateField(field, matches[0], { document, raw, versionValid, duplicate: matches.length > 1 });
    });
    const permitted = new Set([...document.requiredReviews, ...document.optionalReviews].map(reviewKey));
    const suppliedReviews = input?.reviewPoints ?? []; const reviewCounts = new Map();
    for (const review of suppliedReviews) {
      const key = reviewKey(review); reviewCounts.set(key, (reviewCounts.get(key) ?? 0) + 1);
      if (!permitted.has(key)) issue("forbidden-review", { reviewCode: review.code, segmentId: review.source.segmentId });
      if (reviewCounts.get(key) > 1) issue("duplicate-review", { reviewCode: review.code, segmentId: review.source.segmentId });
      if (versionValid && locateFrozenSpan(raw, review.source)) validSources++; else issue("review-source-span", { reviewCode: review.code, segmentId: review.source.segmentId });
    }
    for (const review of document.requiredReviews) if (!reviewCounts.has(reviewKey(review))) issue("missing-review", { reviewCode: review.code, segmentId: review.source.segmentId });
    const legacy = fields.filter((field) => field.fieldKind === "legacy");
    const critical = legacy.filter((field) => field.critical);
    const classified = legacy.filter((field) => ["primary-jd-classified", "secondary-jd-classified"].includes(field.classificationGroup));
    const metrics = { legacyRecall: metric(legacy.filter((field) => field.passed).length, legacy.length), criticalRecall: metric(critical.filter((field) => field.passed).length, critical.length),
      jdClassification: metric(classified.filter((field) => field.classificationCorrect).length, classified.length),
      sourceValidity: metric(validSources, candidates.length + suppliedReviews.length), additionalRecall: metric(fields.filter((field) => field.fieldKind === "additional" && field.passed).length, document.additionalFields.length) };
    const thresholdsPassed = (metrics.criticalRecall.value === null || metrics.criticalRecall.value >= 0.9)
      && (metrics.jdClassification.value === null || metrics.jdClassification.value >= 0.9) && (metrics.sourceValidity.value === null || metrics.sourceValidity.value === 1);
    const passed = errors.length === 0 && fields.every((field) => field.passed) && thresholdsPassed;
    for (const error of [...errors, ...fields.flatMap((field) => field.errors)]) issues.add(error.code, Object.fromEntries(Object.entries(error).filter(([key]) => key !== "code")));
    return { documentId: document.id, reportingGroup: document.reportingGroup, status: passed ? "passed" : "failed", metrics, fields, errors };
  });
  const status = issues.errors.length ? "failed" : "passed";
  const allFieldReports = reports.flatMap((document) => document.fields);
  const classification = Object.fromEntries([["primaryJd", "primary-jd-classified"], ["secondaryJd", "secondary-jd-classified"], ["unresolvedAnchors", "unresolved-jd-conflict"]].map(([key, group]) => {
    const fields = allFieldReports.filter((field) => field.classificationGroup === group);
    return [key, metric(fields.filter((field) => field.classificationCorrect).length, fields.length)];
  }));
  return { report: { status, documents: reports, classification, groups: references.source.reportingGroups.map((group) => ({ id: group.id, documents: group.documents, passed: reports.filter((document) => document.reportingGroup === group.id && document.status === "passed").length,
    status: reports.filter((document) => document.reportingGroup === group.id).every((document) => document.status === "passed") ? "passed" : "failed" })), errors: issues.errors, omittedErrors: issues.omitted }, bindings };
}
