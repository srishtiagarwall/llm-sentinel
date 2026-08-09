import type { PolicyAction } from './api';

export interface PolicyTemplate {
  name: string;
  description: string;
  condition: string;
  action: PolicyAction;
  alert: boolean;
}

// Real, working condition-DSL policies — every field/operator used here is
// supported by libs/guardrails/src/condition-evaluator.ts and populated by
// gateway/src/guardrails/policy-enforcer.ts's conditionCtx. These are
// starting points a tenant can toggle on as-is, then edit or delete like any
// other policy.
export const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    name: 'Block PII to external providers',
    description: 'Rejects any request containing detected PII (email, phone, SSN, etc.) unless the provider is internal.',
    condition: "pii_detected == true AND provider != 'internal'",
    action: 'BLOCK',
    alert: true,
  },
  {
    name: 'Alert on prompt injection',
    description: 'Logs an alert whenever the prompt-injection scanner flags a role-override or jailbreak attempt.',
    condition: 'injection_detected == true',
    action: 'ALERT',
    alert: true,
  },
  {
    name: 'Block SSNs specifically',
    description: 'Blocks any request where a Social Security Number was detected, regardless of provider.',
    condition: "pii_types contains 'SSN'",
    action: 'BLOCK',
    alert: true,
  },
  {
    name: 'Block credit card numbers',
    description: 'Blocks any request where a credit card number was detected in the prompt.',
    condition: "pii_types contains 'CREDIT_CARD'",
    action: 'BLOCK',
    alert: true,
  },
  {
    name: 'Alert on Aadhaar numbers',
    description: 'Flags requests containing an Indian Aadhaar ID for review without blocking the request.',
    condition: "pii_types contains 'AADHAAR'",
    action: 'ALERT',
    alert: true,
  },
  {
    name: 'Alert on PAN card numbers',
    description: 'Flags requests containing an Indian PAN card number for review without blocking the request.',
    condition: "pii_types contains 'PAN'",
    action: 'ALERT',
    alert: true,
  },
  {
    name: 'Flag high-cost gpt-4o requests',
    description: 'Raises an alert whenever a request targets gpt-4o, useful for watching spend on the priciest model.',
    condition: "model == 'gpt-4o'",
    action: 'ALERT',
    alert: true,
  },
  {
    name: 'Block oversized prompts',
    description: 'Blocks requests whose estimated input is larger than 4000 tokens, before they reach the model.',
    condition: 'input_tokens > 4000',
    action: 'BLOCK',
    alert: true,
  },
  {
    name: 'Alert on large prompts',
    description: 'Flags (without blocking) requests estimated over 2000 input tokens, so spend spikes get noticed early.',
    condition: 'input_tokens > 2000',
    action: 'ALERT',
    alert: true,
  },
  {
    name: 'Alert on all Gemini traffic',
    description: 'Logs an alert for every request routed to Gemini — useful while validating a new provider rollout.',
    condition: "provider == 'gemini'",
    action: 'ALERT',
    alert: false,
  },
  {
    name: 'Alert on all OpenAI traffic',
    description: 'Logs an alert for every request routed to OpenAI — useful for auditing provider mix.',
    condition: "provider == 'openai'",
    action: 'ALERT',
    alert: false,
  },
  {
    name: 'Block PII on Gemini',
    description: 'Blocks any request containing detected PII specifically when routed through Gemini.',
    condition: "pii_detected == true AND provider == 'gemini'",
    action: 'BLOCK',
    alert: true,
  },
];
