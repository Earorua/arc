const MAX_FRAME_BYTES = 256 * 1024;
const outcomes = new Set(["ok", "exception", "exceededCpu", "exceededMemory", "canceled", "unknown"]);
const marker = /^\[Arc Auth\] ERROR(?: upstream_error=(?:invalid_client|invalid_grant|invalid_request|unauthorized_client|unsupported_grant_type|redirect_uri_mismatch|access_denied|temporarily_unavailable|server_error))?(?: http_status=[45][0-9]{2})?$/;

// Input is private: neither parser failures nor framing failures include it.
export function createAuthTailFramer(onEvent) {
  let closed = false;
  let frame = "";
  let bytes = 0;
  let brackets = [];
  let inString = false;
  let escaped = false;
  let previousHighSurrogate = false;

  function fail(code) {
    closed = true;
    frame = "";
    brackets = [];
    const error = new Error(code);
    error.code = code;
    throw error;
  }

  return {
    push(text) {
      if (closed) return;
      if (typeof text !== "string") fail("invalid-framing");
      for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (brackets.length === 0) {
          if (char === " " || char === "\t" || char === "\r" || char === "\n") continue;
          if (char !== "{") fail("invalid-framing");
          bytes = 0;
          previousHighSurrogate = false;
        }
        const unit = text.charCodeAt(index);
        // Count UTF-8 accurately even when push splits a surrogate pair.
        bytes += unit < 0x80 ? 1 : unit < 0x800 ? 2
          : previousHighSurrogate && unit >= 0xdc00 && unit <= 0xdfff ? 1 : 3;
        previousHighSurrogate = unit >= 0xd800 && unit <= 0xdbff;
        if (bytes > MAX_FRAME_BYTES) fail("frame-too-large");
        frame += char;

        if (inString) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === '"') inString = false;
          continue;
        }
        if (char === '"') inString = true;
        else if (char === "{" || char === "[") brackets.push(char);
        else if (char === "}" || char === "]") {
          if (brackets.pop() !== (char === "}" ? "{" : "[")) fail("invalid-framing");
          if (brackets.length === 0) {
            let value;
            try { value = JSON.parse(frame); }
            catch { fail("invalid-json"); }
            frame = "";
            onEvent(value);
            if (closed) return;
          }
        }
      }
    },
    end() {
      if (closed) return;
      if (brackets.length !== 0) fail("invalid-framing");
      closed = true;
    },
  };
}

// Only JSON-derived records are projected; no arbitrary source fields are copied.
export function projectAuthTailEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return null;
  const time = event.eventTimestamp;
  if (!Number.isSafeInteger(time) || Math.abs(time) > 8640000000000000 || !outcomes.has(event.outcome)) return null;
  const messages = [];
  if (Array.isArray(event.logs)) {
    for (const log of event.logs) {
      if (!log || !Array.isArray(log.message)) continue;
      for (const message of log.message) {
        // The length check rejects the newline that JavaScript's $ can precede.
        if (typeof message === "string" && marker.exec(message)?.[0] === message) messages.push(message);
      }
    }
  }
  return { timestamp: new Date(time).toISOString(), outcome: event.outcome, messages };
}
