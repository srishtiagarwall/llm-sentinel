export interface PiiScanResult {
  detected: boolean;
  types: string[];
  redacted: string;
}

const PII_PATTERNS: { type: string; regex: RegExp }[] = [
  { type: 'EMAIL', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { type: 'PHONE', regex: /(\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g },
  { type: 'SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: 'CREDIT_CARD', regex: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g },
  { type: 'IP_ADDRESS', regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  { type: 'AADHAAR', regex: /\b\d{4}\s?\d{4}\s?\d{4}\b/g }, // Indian ID
  { type: 'PAN', regex: /[A-Z]{5}[0-9]{4}[A-Z]{1}/g },      // Indian PAN card
];

export function scanForPii(text: string): PiiScanResult {
  const detectedTypes: string[] = [];
  let redacted = text;

  for (const { type, regex } of PII_PATTERNS) {
    regex.lastIndex = 0;
    if (regex.test(text)) {
      detectedTypes.push(type);
      regex.lastIndex = 0;
      redacted = redacted.replace(regex, `[REDACTED:${type}]`);
    }
  }

  return {
    detected: detectedTypes.length > 0,
    types: detectedTypes,
    redacted,
  };
}
