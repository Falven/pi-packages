import { AssistantMessageComponent } from "@earendil-works/pi-coding-agent"
import {
  Markdown,
  Marked,
  MouseRegion,
  Spacer,
  type Component,
} from "@earendil-works/pi-tui"
import type { NativeChatHost, Occurrence } from "./native-host.ts"

const parser = new Marked()
const inlineParser = new parser.Parser()
const plainText = new parser.TextRenderer()

export function thoughtPresentation(markdown: string): {
  body: string
  heading?: string
} {
  if (!markdown.includes("**") && !markdown.includes("__"))
    return { body: markdown }
  const source = markdown.replace(/\r\n?/g, "\n")
  let cursor = 0
  let kept = 0
  let body = ""
  let heading: string | undefined
  for (const token of parser.lexer(source)) {
    const at = source.indexOf(token.raw, cursor)
    if (at < 0) continue
    cursor = at + token.raw.length
    if (token.type !== "paragraph" || !token.tokens) continue
    const tokens = token.tokens.filter(
      (part) => part.type !== "text" || part.text.trim(),
    )
    const strong = tokens[0]
    if (tokens.length !== 1 || strong?.type !== "strong" || !strong.tokens)
      continue
    const label = inlineParser
      .parseInline(strong.tokens, plainText)
      .replace(/\s+/gu, " ")
      .trim()
    if (!label) continue
    body += source.slice(kept, at)
    kept = cursor
    heading = label
  }
  return heading
    ? {
        body: (body + source.slice(kept)).replace(/^\n+|\n+$/g, ""),
        heading,
      }
    : { body: markdown }
}

export type ThoughtEnvironment = {
  getMarkdownThemeWithSettings(): NonNullable<
    ConstructorParameters<typeof AssistantMessageComponent>[2]
  >
  getMarkdownTransformers(): NonNullable<
    ConstructorParameters<typeof AssistantMessageComponent>[5]
  >
  hiddenThinkingLabel: string
  outputPad: number
}

export class Thought {
  readonly spacing = new Spacer(1)
  private renderedBody: Component | undefined
  private renderedNative: Component | undefined
  private streaming = false
  private native?: Component

  constructor(
    private readonly adapter: NativeChatHost,
    private readonly occurrence: Occurrence,
  ) {}

  bind(native: Component, streaming: boolean) {
    this.native = native
    this.streaming = streaming
  }

  get body() {
    if (this.renderedNative === this.native) return this.renderedBody
    this.renderedNative = this.native
    const child =
      this.native instanceof MouseRegion
        ? (this.native as unknown as { child: Component }).child
        : undefined
    if (child instanceof Markdown) {
      this.renderedBody = child
      return this.renderedBody
    }
    const { host } = this.adapter
    const message = this.occurrence.message
    if (message?.role !== "assistant") return
    const presenter = new AssistantMessageComponent(
      undefined,
      false,
      host.getMarkdownThemeWithSettings(),
      host.hiddenThinkingLabel,
      host.outputPad,
      host.getMarkdownTransformers(),
    )
    presenter.updateContent(
      {
        ...message,
        content: (this.occurrence.contentIndices ?? []).map(
          (index) => message.content[index]!,
        ),
      },
      this.streaming,
    )
    const region = (
      presenter as unknown as {
        contentContainer: { children: Component[] }
      }
    ).contentContainer.children[1]
    this.renderedBody =
      region instanceof MouseRegion
        ? (region as unknown as { child: Component }).child
        : undefined
    return this.renderedBody
  }
}
