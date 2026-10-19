export function objectArguments(name: string, value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value))
    throw new Error(`tool \`${name}\` expects a JSON object for arguments`);
  return value as Record<string, unknown>;
}

export function argumentError(
  args: Record<string, unknown>,
  message: string,
  key?: string,
  index?: number,
): Error {
  // shortcut: positions describe nested-call JSON; direct-tool spelling needs a public raw-input hook.
  let column = 1;
  for (const [name, value] of Object.entries(args)) {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) continue;
    if (column > 1) column++;
    column += Buffer.byteLength(JSON.stringify(name)) + 1;
    if (name === key) {
      let field = value;
      if (index !== undefined) {
        const items = value as unknown[];
        column++;
        for (const item of items.slice(0, index))
          column += Buffer.byteLength(JSON.stringify(item)) + 1;
        field = items[index];
      }
      if (field === null || typeof field !== "object")
        column += Buffer.byteLength(JSON.stringify(field));
      return new Error(`failed to parse function arguments: ${message} at line 1 column ${column}`);
    }
    column += Buffer.byteLength(encoded);
  }
  return new Error(`failed to parse function arguments: ${message} at line 1 column ${column + 1}`);
}

export function invalidArgument(
  args: Record<string, unknown>,
  key: string,
  expected: string,
  index?: number,
): Error {
  const value = index === undefined ? args[key] : (args[key] as unknown[])[index];
  const numeric = ["i32", "u64", "usize"].includes(expected);
  // JSON.stringify(-(2 ** 63)) rounds below the signed JSON-integer range.
  const integer =
    typeof value === "number" && Number.isInteger(value) && value > -(2 ** 63) && value < 2 ** 64;
  const unexpected =
    value === null
      ? "null"
      : typeof value === "number"
        ? integer
          ? `integer \`${value}\``
          : !numeric
            ? "number"
            : `floating point \`${Number.isInteger(value) || Math.abs(value) < 1e-5 ? value.toExponential() : value}\``
        : typeof value === "string"
          ? `string ${JSON.stringify(value)}`
          : typeof value === "boolean"
            ? `boolean \`${value}\``
            : Array.isArray(value)
              ? "sequence"
              : "map";
  const kind = integer && numeric ? "value" : "type";
  return argumentError(args, `invalid ${kind}: ${unexpected}, expected ${expected}`, key, index);
}
