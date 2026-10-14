export class OutputBuffer {
  private head = Buffer.alloc(0)
  private tail = Buffer.alloc(0)
  private bytes = 0
  private lines = 0
  private lastByte: number | undefined

  constructor(private readonly maxTokens: number) {}

  get truncated(): boolean {
    return this.bytes > this.maxTokens * 4
  }

  append(value: Buffer | string): void {
    const chunk = typeof value === "string" ? Buffer.from(value) : value
    if (!chunk.length) return
    this.bytes += chunk.length
    for (const byte of chunk) if (byte === 10) this.lines++
    this.lastByte = chunk.at(-1)
    const limit = this.maxTokens * 4
    if (this.head.length < limit)
      this.head = Buffer.concat([
        this.head,
        chunk.subarray(0, limit - this.head.length),
      ])
    const half = limit / 2
    if (half > 0)
      this.tail = Buffer.concat([
        this.tail,
        chunk.subarray(Math.max(0, chunk.length - half)),
      ]).subarray(-half)
  }

  result(): { original_token_count: number; output: string } {
    const original_token_count = Math.ceil(this.bytes / 4)
    if (original_token_count <= this.maxTokens)
      return { original_token_count, output: this.head.toString("utf8") }
    const head = new TextDecoder().decode(
      this.head.subarray(0, this.maxTokens * 2),
      { stream: true },
    )
    let start = 0
    while (start < this.tail.length && (this.tail[start]! & 0xc0) === 0x80)
      start++
    const tail = this.tail.subarray(start).toString("utf8")
    const lines = this.lines + (this.lastByte === 10 ? 0 : 1)
    return {
      original_token_count,
      output: `Warning: truncated output (original token count: ${original_token_count})\nTotal output lines: ${lines}\n\n${head}…${original_token_count - this.maxTokens} tokens truncated…${tail}`,
    }
  }
}
