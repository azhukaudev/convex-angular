import { Value, convexToJson } from 'convex/values';

function canonicalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJsonValue(item));
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalizeJsonValue(nestedValue)]),
    );
  }

  return value;
}

export function serializeConvexArgsStable(args: Record<string, Value>): string {
  return JSON.stringify(canonicalizeJsonValue(convexToJson(args)));
}
