import { Value, convexToJson, jsonToConvex } from 'convex/values';

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortJsonValue(nestedValue)]),
    );
  }

  return value;
}

export function serializeConvexSsrValue(value: unknown): string {
  return JSON.stringify(sortJsonValue(convexToJson(value as Value)));
}

export function parseSerializedConvexSsrValue<T>(serialized: string): T {
  return jsonToConvex(JSON.parse(serialized)) as T;
}
