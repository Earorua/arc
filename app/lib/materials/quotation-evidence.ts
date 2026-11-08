// Keep UTF-16 offsets stable. Quoted labels can still be the object of a real assertion
// ("the syllabus omits 'X'"), but a quoted example cannot assert the proposition inside it.
export const quoted = /“[^“”]*”|「[^「」]*」|『[^『』]*』|‘(?:[^‘’]|’(?=[\p{L}]))*’|"(?:\\.|[^"\\])*"|(?<![\p{L}\p{N}])'(?:[^']|'(?=[\p{L}]))*'|\x60[^\x60]*\x60/gu;
export function maskQuotes(text: string) {
  return text.replace(quoted, match => "Q" + " ".repeat(match.length - 1));
}

export const hypothetical = /^(?:(?:if|whether|unless|suppose|assuming|example|for example)\b|如果|假如|假设|例如|举例)|[?？]\s*$/iu;
export const deniedAssertion = /\b(?:it (?:is|was) (?:false|untrue|incorrect|unclear|uncertain|unknown)|it (?:is|was) not (?:true|the case)|no (?:evidence|reason to believe)|(?:did not|never) (?:say|claim)|(?:nobody|no one) (?:said|claimed)|wrong to (?:say|claim))\b|(?:不能|无法)(?:断言|确定|认定)|没有证据|并非事实|并非如此|不能说/iu;
