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
  body: Component | undefined
  private manualExpanded?: boolean
  private native?: Component
  private presenter: AssistantMessageComponent | undefined

  constructor(private readonly adapter: NativeChatHost) {
    super("", 1, 0)
  }

  get expanded() {
    return this.manualExpanded ?? this.live
  }

  bind(occurrence: Occurrence, native: Component, streaming: boolean) {
    if (this.native === native) return
    this.native = native
    const child =
      native instanceof MouseRegion
        ? (native as unknown as { child: Component }).child
        : undefined
    if (child instanceof Markdown) {
      this.body = child
      this.presenter = undefined
      return
    }
    const { host } = this.adapter
    const message = occurrence.message
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
        content: (occurrence.contentIndices ?? []).map(
          (index) => message.content[index]!,
        ),
      },
      streaming,
    )
    const region = (
      this.presenter as unknown as {
        contentContainer: { children: Component[] }
      }
    ).contentContainer.children[1]
    this.body =
      region instanceof MouseRegion
        ? (region as unknown as { child: Component }).child
        : undefined
  }

  toggle() {
    this.manualExpanded = !this.expanded
    this.adapter.clearChatSelection()
    this.adapter.requestRender()
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
