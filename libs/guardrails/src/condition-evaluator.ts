// Minimal, safe DSL for policy conditions like:
//   "pii_detected == true AND provider != 'internal'"
//   "input_tokens > 2000"
//   "pii_types contains 'SSN'"
// No eval() — parsed and evaluated against a flat key/value context.

export type ConditionContext = Record<string, string | number | boolean | null>;

type Op = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains';

interface Clause {
  field: string;
  op: Op;
  value: string | number | boolean;
}

const CLAUSE_PATTERN =
  /(\w+)\s*(==|!=|>=|<=|>|<|contains)\s*('[^']*'|"[^"]*"|true|false|-?\d+(?:\.\d+)?)/g;

function parseValue(raw: string): string | number | boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^'.*'$/.test(raw) || /^".*"$/.test(raw)) return raw.slice(1, -1);
  const num = Number(raw);
  return isNaN(num) ? raw : num;
}

export function parseCondition(condition: string): Clause[] {
  const clauses: Clause[] = [];
  for (const match of condition.matchAll(CLAUSE_PATTERN)) {
    const [, field, op, rawValue] = match;
    clauses.push({ field, op: op as Op, value: parseValue(rawValue) });
  }
  return clauses;
}

// All clauses are AND-ed together — sufficient for the block/alert rules this engine supports.
export function evaluateCondition(condition: string, ctx: ConditionContext): boolean {
  const clauses = parseCondition(condition);
  if (clauses.length === 0) return false;

  return clauses.every(({ field, op, value }) => {
    const actual = ctx[field];

    switch (op) {
      case '==':
        return actual === value;
      case '!=':
        return actual !== value;
      case 'contains':
        return typeof actual === 'string' && typeof value === 'string'
          ? actual.split(',').includes(value)
          : false;
      case '>':
      case '<':
      case '>=':
      case '<=':
        if (typeof actual !== 'number' || typeof value !== 'number') return false;
        if (op === '>') return actual > value;
        if (op === '<') return actual < value;
        if (op === '>=') return actual >= value;
        return actual <= value;
    }
  });
}
