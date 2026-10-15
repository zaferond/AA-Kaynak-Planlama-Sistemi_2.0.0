import { z } from "zod";

/** Validate and copy every numeric entry; unusual shapes and invalid data retain Zod's original issues. */
export function numericRecordSchema({
  max,
  integer = false,
}: {
  max?: number;
  integer?: boolean;
}) {
  let valueSchema = z.number();
  if (integer) valueSchema = valueSchema.int();
  valueSchema = valueSchema.min(0);
  if (max !== undefined) valueSchema = valueSchema.max(max);
  const reference = z.record(valueSchema);
  return z
    .any()
    .transform((input: unknown, context): Record<string, number> => {
      if (
        input !== null &&
        typeof input === "object" &&
        !Array.isArray(input) &&
        (Object.getPrototypeOf(input) === Object.prototype ||
          Object.getPrototypeOf(input) === null)
      ) {
        const copy: Record<string, number> = {};
        let eligible = true;
        for (const key in input) {
          // Zod also sees inherited enumerable fields and ignores __proto__ only after validating its value.
          if (!Object.hasOwn(input, key) || key === "__proto__") {
            eligible = false;
            break;
          }
          const descriptor = Object.getOwnPropertyDescriptor(input, key);
          if (!descriptor || !("value" in descriptor)) {
            eligible = false;
            break;
          }
          const number = descriptor.value;
          if (
            typeof number !== "number" ||
            !(number >= 0) ||
            (max !== undefined && !(number <= max)) ||
            (integer && !Number.isInteger(number))
          ) {
            eligible = false;
            break;
          }
          copy[key] = number;
        }
        if (eligible) return copy;
      }
      const parsed = reference.safeParse(input);
      if (parsed.success) return parsed.data;
      for (const issue of parsed.error.issues) context.addIssue(issue);
      return z.NEVER;
    });
}
