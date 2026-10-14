export type CreateGoalRequest = { objective: string; token_budget?: bigint }

const signedMaximum = 9223372036854775807n
const unsignedMaximum = 18446744073709551615n

// Decode before schema validation: the accepted wire contract includes duplicate keys and exact integer syntax.
class Reader {
  private readonly bytes: Buffer
  position = 0

  constructor(raw: string) {
    this.bytes = Buffer.from(raw)
  }

  fail(message: string, peek = false): never {
    const end = Math.min(this.bytes.length, this.position + Number(peek))
    let line = 1
    let column = 0
    for (const byte of this.bytes.subarray(0, end)) {
      if (byte === 10) {
        line++
        column = 0
      } else column++
    }
    throw new Error(`${message} at line ${line} column ${column}`)
  }

  char(): string {
    const byte = this.bytes[this.position]
    return byte === undefined ? "" : String.fromCharCode(byte)
  }

  whitespace(): string {
    while (/[ \n\r\t]/.test(this.char()) && this.char()) this.position++
    return this.char()
  }

  literal(value: string): void {
    for (const expected of value) {
      const actual = this.char()
      if (!actual) this.fail("EOF while parsing a value")
      this.position++
      if (actual !== expected) this.fail("expected ident")
    }
  }

  string(validate = true): string {
    const start = this.position++
    while (this.char()) {
      const char = this.char()
      this.position++
      if (char === '"') {
        return validate
          ? JSON.parse(this.bytes.toString("utf8", start, this.position))
          : ""
      }
      if (char.charCodeAt(0) < 32)
        this.fail(
          "control character (\\u0000-\\u001F) found while parsing a string",
        )
      if (char !== "\\") continue
      const escape = this.char()
      if (!escape) this.fail("EOF while parsing a string")
      this.position++
      if ('"\\/bfnrt'.includes(escape)) continue
      if (escape !== "u") this.fail("invalid escape")
      const hex = () => {
        const digits = this.bytes.toString(
          "utf8",
          this.position,
          this.position + 4,
        )
        this.position = Math.min(this.bytes.length, this.position + 4)
        if (digits.length < 4) this.fail("EOF while parsing a string")
        if (!/^[0-9a-fA-F]{4}$/.test(digits)) this.fail("invalid escape")
        return Number.parseInt(digits, 16)
      }
      const code = hex()
      if (!validate) continue
      if (code >= 0xdc00 && code <= 0xdfff)
        this.fail("lone leading surrogate in hex escape")
      if (code < 0xd800 || code > 0xdbff) continue
      for (const expected of "\\u") {
        if (!this.char()) this.fail("EOF while parsing a string")
        const actual = this.char()
        this.position++
        if (actual !== expected) this.fail("unexpected end of hex escape")
      }
      const low = hex()
      if (low < 0xdc00 || low > 0xdfff)
        this.fail("lone leading surrogate in hex escape")
    }
    return this.fail("EOF while parsing a string")
  }

  number(): string {
    const start = this.position
    if (this.char() === "-") this.position++
    if (!this.char()) this.fail("EOF while parsing a value")
    const first = this.char()
    this.position++
    if (!/[0-9]/.test(first)) this.fail("invalid number")
    if (first === "0" && /[0-9]/.test(this.char()))
      this.fail("invalid number", true)
    while (/[0-9]/.test(this.char()) && this.char()) this.position++
    if (this.char() === ".") {
      this.position++
      if (!this.char()) this.fail("EOF while parsing a value")
      if (!/[0-9]/.test(this.char())) this.fail("invalid number", true)
      while (/[0-9]/.test(this.char()) && this.char()) this.position++
    }
    if (this.char() === "e" || this.char() === "E") {
      this.position++
      if (this.char() === "+" || this.char() === "-") this.position++
      if (!this.char()) this.fail("EOF while parsing a value")
      const digit = this.char()
      this.position++
      if (!/[0-9]/.test(digit)) this.fail("invalid number")
      while (/[0-9]/.test(this.char()) && this.char()) this.position++
    }
    return this.bytes.toString("utf8", start, this.position)
  }

  numericValue(): bigint | number {
    const raw = this.number()
    if (/^-?\d+$/.test(raw) && raw !== "-0") {
      const integer = BigInt(raw)
      if (integer >= -signedMaximum - 1n && integer <= unsignedMaximum)
        return integer
    }
    const [mantissa, writtenExponent] = raw
      .replace(/^-/, "")
      .toLowerCase()
      .split("e")
    const [integer, fraction = ""] = mantissa!.split(".")
    let significand = 0n
    let exponent = 0
    for (const digit of integer!) {
      const next = significand * 10n + BigInt(digit)
      if (next > unsignedMaximum || exponent > 0) exponent++
      else significand = next
    }
    for (const digit of fraction) {
      const next = significand * 10n + BigInt(digit)
      if (next > unsignedMaximum) break
      significand = next
      exponent--
    }
    exponent += Number(writtenExponent ?? 0)
    let value = Number(significand)
    while (exponent < -308 && value !== 0) {
      value /= 1e308
      exponent += 308
    }
    if (value !== 0) {
      const power = Number(`1e${Math.abs(exponent)}`)
      value = exponent >= 0 ? value * power : value / power
    }
    if (!Number.isFinite(value)) this.fail("number out of range")
    return raw.startsWith("-") ? -value : value
  }

  unexpected(expected: string): never {
    const char = this.whitespace()
    let value: string
    if (!char) this.fail("EOF while parsing a value")
    if (char === "[") value = "sequence"
    else if (char === "{") value = "map"
    else if (char === '"') value = `string ${formatString(this.string())}`
    else if (char === "n") {
      this.literal("null")
      value = "null"
    } else if (char === "t" || char === "f") {
      const boolean = char === "t" ? "true" : "false"
      this.literal(boolean)
      value = `boolean \`${boolean}\``
    } else if (char === "-" || /[0-9]/.test(char)) {
      const number = this.numericValue()
      value =
        typeof number === "bigint"
          ? `integer \`${number}\``
          : `floating point \`${formatFloat(number)}\``
    } else return this.fail("expected value", true)
    return this.fail(`invalid type: ${value}, expected ${expected}`)
  }

  objective(): string {
    return this.whitespace() === '"'
      ? this.string()
      : this.unexpected("a string")
  }

  budget(): bigint | undefined {
    const char = this.whitespace()
    if (char === "n") {
      this.literal("null")
      return undefined
    }
    if (!char || !(char === "-" || /[0-9]/.test(char))) this.unexpected("i64")
    const value = this.numericValue()
    if (typeof value === "number")
      this.fail(
        `invalid type: floating point \`${formatFloat(value)}\`, expected i64`,
      )
    if (value > signedMaximum)
      this.fail(`invalid value: integer \`${value}\`, expected i64`)
    return value
  }

  member(first: boolean, ignored = false): boolean {
    let char = this.whitespace()
    if (!char) this.fail("EOF while parsing an object")
    if (char === "}") return false
    if (!first) {
      if (char !== ",") this.fail("expected `,` or `}`", true)
      this.position++
      char = this.whitespace()
      if (!char) this.fail("EOF while parsing a value")
      if (char === "}")
        this.fail(ignored ? "key must be a string" : "trailing comma", true)
    }
    if (char !== '"') this.fail("key must be a string", true)
    return true
  }

  colon(): void {
    const char = this.whitespace()
    if (!char) this.fail("EOF while parsing an object")
    if (char !== ":") this.fail("expected `:`", true)
    this.position++
  }

  element(first: boolean, ignored = false): boolean {
    let char = this.whitespace()
    if (!char) this.fail("EOF while parsing a list")
    if (char === "]") return false
    if (!first) {
      if (char !== ",") this.fail("expected `,` or `]`", true)
      this.position++
      char = this.whitespace()
      if (!char) this.fail("EOF while parsing a value")
      if (char === "]")
        this.fail(ignored ? "expected value" : "trailing comma", true)
    }
    return true
  }

  endSequence(): void {
    if (this.whitespace() === ",") {
      this.position++
      if (this.whitespace() === "]") this.fail("trailing comma", true)
      this.fail("trailing characters", true)
    }
    if (!this.char()) this.fail("EOF while parsing a list")
    if (this.char() !== "]") this.fail("trailing characters", true)
    this.position++
  }

  skip(): void {
    const char = this.whitespace()
    if (char === '"') this.string(false)
    else if (char === "n" || char === "t" || char === "f")
      this.literal(char === "n" ? "null" : char === "t" ? "true" : "false")
    else if (char === "-" || (char && /[0-9]/.test(char))) this.number()
    else if (char === "{" || char === "[") {
      this.position++
      let first = true
      while (
        char === "{" ? this.member(first, true) : this.element(first, true)
      ) {
        first = false
        if (char === "{") {
          this.string(false)
          this.colon()
        }
        this.skip()
      }
      this.position++
    } else this.unexpected("a value")
  }
}

function formatFloat(value: number): string {
  if (Object.is(value, -0)) return "-0.0"
  const magnitude = Math.abs(value)
  if (magnitude !== 0 && (magnitude < 1e-5 || magnitude >= 1e16))
    return value.toExponential()
  return Number.isInteger(value) ? `${value}.0` : String(value)
}

function formatString(value: string): string {
  const escapes: Record<string, string> = {
    "\0": "\\0",
    "\t": "\\t",
    "\n": "\\n",
    "\r": "\\r",
    "\\": "\\\\",
    '"': '\\"',
  }
  return `"${[...value].map((char) => escapes[char] ?? (char !== " " && /[\p{C}\p{Z}\p{Grapheme_Extend}]/u.test(char) ? `\\u{${char.codePointAt(0)!.toString(16)}}` : char)).join("")}"`
}

export function decodeCreate(raw: string): CreateGoalRequest {
  const reader = new Reader(raw)
  let objective: string | undefined
  let budget: bigint | undefined
  const root = reader.whitespace()
  if (root === "{") {
    reader.position++
    const fields = new Set<string>()
    while (reader.member(fields.size === 0)) {
      const key = reader.string()
      if ((key === "objective" || key === "token_budget") && fields.has(key))
        reader.fail(`duplicate field \`${key}\``)
      fields.add(key)
      reader.colon()
      if (key === "objective") objective = reader.objective()
      else if (key === "token_budget") budget = reader.budget()
      else reader.skip()
    }
    reader.position++
    if (objective === undefined) reader.fail("missing field `objective`")
  } else if (root === "[") {
    reader.position++
    for (let index = 0; index < 2; index++) {
      if (!reader.element(index === 0)) {
        reader.position++
        reader.fail(
          `invalid length ${index}, expected struct CreateGoalRequest with 2 elements`,
        )
      }
      if (index === 0) objective = reader.objective()
      else budget = reader.budget()
    }
    reader.endSequence()
  } else reader.unexpected("struct CreateGoalRequest")
  if (reader.whitespace()) reader.fail("trailing characters", true)
  objective = objective!.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "")
  if (!objective) throw new Error("goal objective must not be empty")
  if ([...objective].length > 4000)
    throw new Error("goal objective must be at most 4000 characters")
  if (budget !== undefined && budget <= 0n)
    throw new Error("goal budgets must be positive when provided")
  return {
    objective,
    ...(budget === undefined ? {} : { token_budget: budget }),
  }
}
