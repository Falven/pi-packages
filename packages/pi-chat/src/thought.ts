import { AssistantMessageComponent } from "@earendil-works/pi-coding-agent"
import {
  Markdown,
  MouseRegion,
  Text,
  type Component,
} from "@earendil-works/pi-tui"
import { InlineViewport } from "./inline-viewport.ts"
import type { NativeChatHost, Occurrence } from "./native-host.ts"

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

export class Thought extends Text {
  focused = false
  live = false
  readonly viewport = new InlineViewport()
  private renderedBody: Component | undefined
  private renderedNative: Component | undefined
  private streaming = false
  private manualExpanded?: boolean
  private native?: Component
  private presenter: AssistantMessageComponent | undefined

  constructor(
    private readonly adapter: NativeChatHost,
    private readonly occurrence: Occurrence,
  ) {
    super("", 1, 0)
  }

  get expanded() {
    return this.manualExpanded ?? this.live
  }

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
      this.presenter = undefined
      return this.renderedBody
    }
    const { host } = this.adapter
    const message = this.occurrence.message
    if (message?.role !== "assistant") return
    this.presenter = new AssistantMessageComponent(
      undefined,
      false,
      host.getMarkdownThemeWithSettings(),
      host.hiddenThinkingLabel,
      host.outputPad,
      host.getMarkdownTransformers(),
    )
    this.presenter.updateContent(
      {
        ...message,
        content: (this.occurrence.contentIndices ?? []).map(
          (index) => message.content[index]!,
        ),
      },
      this.streaming,
    )
    const region = (
      this.presenter as unknown as {
        contentContainer: { children: Component[] }
      }
    ).contentContainer.children[1]
    this.renderedBody =
      region instanceof MouseRegion
        ? (region as unknown as { child: Component }).child
        : undefined
    return this.renderedBody
  }

  toggle() {
    this.manualExpanded = !this.expanded
    if (this.manualExpanded) this.adapter.work.inspect(this.occurrence)
    this.adapter.clearChatSelection()
    this.adapter.requestRender()
  }

  ensureOpen() {
    if (!this.expanded) this.manualExpanded = true
  }

  override render(width: number) {
    this.setText(`${this.focused ? "→" : this.expanded ? "▾" : "▸"} Thought`)
    return super.render(width)
  }

  handleInput(data: string) {
    this.adapter.handleDisclosureInput(data, () => this.toggle())
  }

  handleMouse(event: Parameters<NonNullable<Component["handleMouse"]>>[0]) {
    if (event.type !== "click" || event.button !== "left") return undefined
    this.toggle()
    return { handled: true, focus: true }
  }
}
