import type { UserRow } from "../repositories/user.repository.js";

// Deliberately small: reads a couple of known BAFT-owned user fields and
// compares them against simple conditions in the reward's rule_definition
// JSONB. This is an eligibility *evaluation*, not a stored grant/redemption —
// no ledger or transaction record is created or required to answer it.
type EntitlementField = "status" | "accountAgeDays";
type EntitlementOperator = "eq" | "neq" | "in" | "gte" | "lte";

type EntitlementCondition = {
  field: EntitlementField;
  operator: EntitlementOperator;
  value: unknown;
};

type RuleDefinition = {
  combinator?: "AND" | "OR";
  conditions?: EntitlementCondition[];
};

type EvaluatedCondition = EntitlementCondition & { actual: unknown; passed: boolean };

export type EntitlementResult = {
  eligible: boolean;
  combinator: "AND" | "OR";
  evaluatedConditions: EvaluatedCondition[];
};

const isCondition = (value: unknown): value is EntitlementCondition =>
  typeof value === "object" &&
  value !== null &&
  "field" in value &&
  "operator" in value &&
  ["status", "accountAgeDays"].includes((value as { field: unknown }).field as string) &&
  ["eq", "neq", "in", "gte", "lte"].includes((value as { operator: unknown }).operator as string);

const resolveActual = (field: EntitlementField, user: UserRow): unknown => {
  if (field === "status") return user.status;
  return Math.floor((Date.now() - user.created_at.getTime()) / 86_400_000);
};

const evaluateCondition = (condition: EntitlementCondition, user: UserRow): EvaluatedCondition => {
  const actual = resolveActual(condition.field, user);
  let passed: boolean;

  switch (condition.operator) {
    case "eq":
      passed = actual === condition.value;
      break;
    case "neq":
      passed = actual !== condition.value;
      break;
    case "in":
      passed = Array.isArray(condition.value) && condition.value.includes(actual);
      break;
    case "gte":
      passed = typeof actual === "number" && actual >= Number(condition.value);
      break;
    case "lte":
      passed = typeof actual === "number" && actual <= Number(condition.value);
      break;
    default:
      passed = false;
  }

  return { ...condition, actual, passed };
};

export const evaluateRewardEntitlement = (
  ruleDefinition: Record<string, unknown>,
  user: UserRow,
): EntitlementResult => {
  const rule = ruleDefinition as RuleDefinition;
  const conditions = Array.isArray(rule.conditions) ? rule.conditions.filter(isCondition) : [];
  const combinator: "AND" | "OR" = rule.combinator === "OR" ? "OR" : "AND";

  const evaluatedConditions = conditions.map((c) => evaluateCondition(c, user));
  const eligible =
    evaluatedConditions.length === 0
      ? true
      : combinator === "AND"
        ? evaluatedConditions.every((c) => c.passed)
        : evaluatedConditions.some((c) => c.passed);

  return { eligible, combinator, evaluatedConditions };
};
