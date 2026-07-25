export interface InjectionScanResult {
  detected: boolean;
  pattern: string | null;
}

const INJECTION_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: 'role_override', regex: /ignore (all |previous |prior )?(instructions|rules|prompts)/i },
  { label: 'jailbreak_dan', regex: /\bDAN\b|do anything now/i },
  { label: 'system_override', regex: /you are now|act as (an? )?(unrestricted|jailbroken|evil)/i },
  { label: 'instruction_leak', regex: /repeat (your|the) (system |initial )?prompt/i },
  { label: 'delimiter_injection', regex: /```[\s\S]*?system[\s\S]*?```/i },
  { label: 'token_smuggling', regex: /\[INST\]|\[\/INST\]|<\|system\|>|<\|user\|>/i },
];

export function scanForInjection(text: string): InjectionScanResult {
  for (const { label, regex } of INJECTION_PATTERNS) {
    if (regex.test(text)) {
      return { detected: true, pattern: label };
    }
  }
  return { detected: false, pattern: null };
}
