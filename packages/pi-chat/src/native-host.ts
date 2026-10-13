import {
  InteractiveMode,
  ToolExecutionComponent,
  sessionEntryToContextMessages,
  type AgentSession,
  type AgentSessionRuntime,
  type ExtensionContext,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent"
import {
  Container,
  ScrollView,
  Text,
  TuiAltScreen,
  VStack,
  getKeybindings,
  type Component,
  sliceByColumn,
  stripTerminalSequences,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui"
import {
  WorkHeader,
  WorkIndex,
  type DeliveryKind,
  type WorkHistory,
} from "./work-history.ts"
import type { StackLayoutNode } from "@earendil-works/pi-tui/dist/layout-node.js"
import { InlineViewport } from "./inline-viewport.ts"
import { RelationshipJournal, carryObservedFork } from "./relationships.ts"
import type { RelationshipFact } from "./relationships.ts"
import { Thought, type ThoughtEnvironment } from "./thought.ts"
import { ProviderPhaseIndex } from "./provider-phase.ts"
import {
  SourceSearch,
  type SearchField,
  type SourceHit,
} from "./source-search.ts"
const { allocateStackSizes } = (await import(
  new URL(
    "./components/stack.js",
    import.meta.resolve("@earendil-works/pi-tui"),
  ).href
)) as typeof import("@earendil-works/pi-tui/dist/components/stack.js")
const LAYOUT_NODE = Symbol.for("@earendil-works/pi-tui/layout-node")
const { dispatchMouseEvent } = (await import(
  new URL("./tui.js", import.meta.resolve("@earendil-works/pi-tui")).href
)) as typeof import("@earendil-works/pi-tui/dist/tui.js")
const { getScrollViewBox } = (await import(
  new URL("./layout.js", import.meta.resolve("@earendil-works/pi-tui")).href
)) as typeof import("@earendil-works/pi-tui/dist/layout.js")
const { isImageLine } = (await import(
  new URL("./terminal-image.js", import.meta.resolve("@earendil-works/pi-tui"))
    .href
)) as typeof import("@earendil-works/pi-tui/dist/terminal-image.js")
const { AltScreenSearchIndex } = (await import(
  new URL(
    "./alt-screen-search.js",
    import.meta.resolve("@earendil-works/pi-tui"),
  ).href
)) as typeof import("@earendil-works/pi-tui/dist/alt-screen-search.js")

/* oxlint-disable eslint/no-underscore-dangle -- This adapter targets Pi 1.0.2's private persistence seams. */

type Entry = SessionEntry
type Message = AgentSession["messages"][number]
type NativeAssistant = Component & {
  contentContainer: Container
  isStreaming: boolean
  updateContent(message: Message, streaming?: boolean): void
}
type NativeMode = ThoughtEnvironment & {
  version: string
  renderer: {
    mode: string
    layoutRoot?: Component
    setLayoutRoot(root?: Component): void
  }
  fullscreenLayoutRoot: Component
  transcriptScrollView: ScrollView
  chatContainer: Container
  documentContainer: Container
  sessionManager: AgentSession["sessionManager"]
  runtimeHost: AgentSessionRuntime
  session: {
    isStreaming: boolean
    retryAttempt: number
    agent: {
      subscribe(listener: (event: unknown) => void): () => void
      normalizePromptInput(...args: unknown[]): Message[]
      steeringQueue: { drain(): Message[] }
      followUpQueue: { drain(): Message[] }
    }
    _agentRunAbortRequested: boolean
    extensionRunner: { getEntryRenderer(name: string): unknown }
    _entryIdsByMessage: WeakMap<object, string>
    recordBashResult: (...args: unknown[]) => unknown
    _pendingBashMessages: object[]
    _appendCustomMessage(message: Message): void
  }
  bashComponent?: Component
  pendingBashComponents: Component[]
  pendingTools: Map<string, Component>
  settingsManager: {
    getShowImages(): boolean
    getImageWidthCells(): number
  }
  toolOutputExpanded: boolean
  ui: ConstructorParameters<typeof ToolExecutionComponent>[5]
  getRegisteredToolDefinition(
    name: string,
  ): ConstructorParameters<typeof ToolExecutionComponent>[4]
  streamingComponent?: NativeAssistant
  renderSessionEntries(entries: Entry[], options?: unknown): void
  renderSessionItems(items: Iterable<unknown>, options?: unknown): void
  renderInitialMessages(): void
  addCustomEntryToChat(entry: Entry): void
  addMessageToChat(message: Message, options?: unknown): void
  handleEvent(event: {
    type: string
    message?: Message
    entry?: Entry
  }): Promise<void>
  editor: Component
  keybindings: { matches(data: string, action: string): boolean }
  toggleToolOutputExpansion(): void
  handleCopyCommand(options: {
    flashConfirmation: boolean
    preferSelection: boolean
  }): Promise<void>
  showError?(message: string): void
}

export type Occurrence = {
  parent?: Occurrence
  entry: Entry | undefined
  message: Message | undefined
  itemOrdinal?: number
  contentIndex?: number
  contentIndices?: number[]
  component?: Component
  resultEntry?: Entry
  resultMessage?: Message
  parts: Map<number, Occurrence>
}

const active = new WeakMap<InteractiveMode, NativeChatHost>()

function requiredMode(host: InteractiveMode): NativeMode {
  const mode = host as unknown as NativeMode
  const root = mode.fullscreenLayoutRoot as VStack | undefined
  if (
    mode.version !== "1.0.2" ||
    !mode.chatContainer ||
    !mode.documentContainer ||
    !mode.transcriptScrollView ||
    !root ||
    root.children[0] !== mode.transcriptScrollView ||
    root.children.length !== 2 ||
    (mode.renderer.mode === "fullscreen" &&
      mode.renderer.layoutRoot !== root) ||
    typeof mode.renderSessionEntries !== "function" ||
    typeof mode.renderSessionItems !== "function" ||
    typeof mode.addMessageToChat !== "function" ||
    typeof mode.handleEvent !== "function" ||
    typeof mode.runtimeHost?.fork !== "function" ||
    typeof mode.getMarkdownThemeWithSettings !== "function" ||
    typeof mode.getMarkdownTransformers !== "function" ||
    typeof mode.outputPad !== "number" ||
    typeof mode.session?.agent?.normalizePromptInput !== "function" ||
    typeof mode.session.agent.steeringQueue?.drain !== "function" ||
    typeof mode.session.agent.followUpQueue?.drain !== "function"
  ) {
    throw new Error(
      "pi-chat requires the unowned Pi 1.0.2 fullscreen chat host",
    )
  }
  return mode
}

class OwnedRoot extends VStack {
  private readonly invalidateNative: () => void
  private readonly layoutChat: () => void

  constructor(
    children: ConstructorParameters<typeof VStack>[0],
    invalidateNative: () => void,
    layoutChat: () => void,
  ) {
    super(children)
    this.invalidateNative = invalidateNative
    this.layoutChat = layoutChat
  }

  override invalidate() {
    this.invalidateNative()
  }

  [LAYOUT_NODE](): StackLayoutNode {
    this.layoutChat()
    return {
      type: "vstack",
      entries: this.entries,
      gap: this.gap,
      align: this.align,
    }
  }
}

type Leaf = {
  component: Component
  occurrence: Occurrence | undefined
  rows: string[]
  start: number
  top: number
  offset: number
  body?: InlineViewport
}

function currentTop(leaf: Leaf) {
  return leaf.body
    ? leaf.body.top + leaf.offset - leaf.body.scroll.scrollTop
    : leaf.top
}

type VisibleInterval = {
  leaf: Leaf
  start: number
  end: number
  top: number
}
type PaintedInterval = VisibleInterval & { window: ScrollView }

type NativeSearch = {
  query: string
  matches: unknown[]
  selectedIndex: number
  selectionMode: "query" | "next" | "previous" | "retain"
  component: { setResult(index: number, count: number): void }
}

type SelectionPoint = {
  row: number
  col: number
  scrollView?: ScrollView
  occurrence?: Occurrence
  component?: Component
  localRow?: number
  boundary?: boolean
}

function rendererSelection(
  renderer: TuiAltScreen,
  name: "selectionAnchor" | "selectionFocus",
) {
  return (
    renderer as unknown as Record<typeof name, SelectionPoint | undefined>
  )[name]
}

class RawLeaf extends Container {
  constructor(
    readonly component: Component,
    readonly rows: string[],
  ) {
    super()
    this.children.push(component)
  }

  override render() {
    return this.rows
  }

  override invalidate() {}

  override handleMouse(
    event: Parameters<NonNullable<Component["handleMouse"]>>[0],
  ) {
    return dispatchMouseEvent(this.component, event)
  }
}

type Activity = {
  component: Component
  occurrence?: Occurrence
  owner?: Occurrence
  tool: boolean
  work?: WorkHistory | undefined
  zoneStart?: boolean
  zoneEnd?: boolean
  body?: InlineViewport
  sourceZone?: number | undefined
}
type ToolGroup = {
  calls: Activity[]
  expanded: boolean
  header?: GroupHeader
  viewport: InlineViewport
}

type ToolPresenter = Component & {
  expanded: boolean
  setExpanded(expanded: boolean): void
}

class GroupHeader extends Text {
  focused = false

  constructor(
    private readonly adapter: NativeChatHost,
    readonly group: ToolGroup,
  ) {
    super("", 1, 0)
  }

  override render(width: number) {
    const names = [
      ...new Set(
        this.group.calls.map((call) =>
          "toolName" in call.component
            ? String(call.component.toolName)
            : "tool",
        ),
      ),
    ]
    const count = this.group.calls.length
    this.setText(
      truncateToWidth(
        `${this.focused ? "→" : this.group.expanded ? "▾" : "▸"} ${count} tool ${count === 1 ? "call" : "calls"}: ${names.join(", ")}`,
        Math.max(1, width - 2),
      ),
    )
    return super.render(width)
  }

  handleInput(data: string) {
    this.adapter.handleDisclosureInput(data, () =>
      this.adapter.toggleGroup(this.group),
    )
  }

  handleMouse(event: Parameters<NonNullable<Component["handleMouse"]>>[0]) {
    if (event.type !== "click" || event.button !== "left") return undefined
    this.adapter.toggleGroup(this.group)
    return { handled: true, focus: true }
  }
}

class ToolFocus extends Container {
  focused = false

  constructor(
    private readonly adapter: NativeChatHost,
    readonly tool: ToolPresenter,
  ) {
    super()
    this.addChild(tool)
  }

  override render(width: number) {
    const rows = super.render(width)
    if (!this.focused || !rows[0] || stripTerminalSequences(rows[0]).trim())
      return rows
    return [
      "→" + sliceByColumn(rows[0], 1, Math.max(0, width - 1), true),
      ...rows.slice(1),
    ]
  }

  handleInput(data: string) {
    this.adapter.handleDisclosureInput(data, () =>
      this.adapter.toggleTool(this.tool),
    )
  }

  override handleMouse(
    event: Parameters<NonNullable<Component["handleMouse"]>>[0],
  ) {
    const expanded = this.tool.expanded
    const result = super.handleMouse(event)
    if (expanded !== this.tool.expanded) {
      this.adapter.clearChatSelection()
      if (this.tool.expanded) this.adapter.inspectTool(this.tool)
    }
    return result
  }
}

export class NativeChatHost {
  readonly host: NativeMode
  readonly work = new WorkIndex()
  private readonly providerPhases = new ProviderPhaseIndex()
  readonly relationships: RelationshipJournal
  private readonly deliveryCleanup: (() => void)[] = []
  private forkCleanup?: () => void
  private deliveringUser: Occurrence | undefined
  readonly occurrences: Occurrence[] = []
  readonly byEntryId = new Map<string, Occurrence>()
  readonly byComponent = new Map<Component, Occurrence>()
  private readonly projections = new Map<string, Map<number, Occurrence>>()
  readonly root: VStack
  readonly transcript: ScrollView
  private readonly painting = new VStack()
  private leaves: Leaf[] = []
  private intervals: PaintedInterval[] = []
  private viewportHeight = 0
  private layoutWidth = 0
  private boundRenderer: TuiAltScreen | undefined
  private selectionTimer: NodeJS.Timeout | undefined
  private readonly rendererMethods = new Map<
    string,
    { original: Function; wrapped: Function; descriptor?: PropertyDescriptor }
  >()
  private readonly oldRoot: Component
  private readonly historical = new Map<string, Component[]>()
  private imageSettings: { show: boolean; width: number }
  private readonly originals = new Map<string, (...args: never[]) => unknown>()
  private readonly wrappers = new Map<string, (...args: never[]) => unknown>()
  private readonly ownDescriptors = new Map<
    string,
    PropertyDescriptor | undefined
  >()
  private readonly chatMethods = new Map<
    string,
    (...args: never[]) => unknown
  >()
  private readonly chatWrappers = new Map<
    string,
    (...args: never[]) => unknown
  >()
  private readonly chatDescriptors = new Map<
    string,
    PropertyDescriptor | undefined
  >()
  private readonly assistantMethods = new Map<
    NativeAssistant,
    {
      original: NativeAssistant["updateContent"]
      wrapped: NativeAssistant["updateContent"]
      descriptor?: PropertyDescriptor
    }
  >()
  private readonly assistantChildren = new Map<
    NativeAssistant,
    Set<Component>
  >()
  private readonly assistantIndices = new Map<NativeAssistant, Set<number>>()
  private readonly liveMessages = new WeakMap<object, Occurrence>()
  private readonly bashMessages = new WeakMap<object, Component>()
  private readonly toolResults = new WeakMap<object, Component>()
  private readonly groups = new Map<Occurrence, ToolGroup>()
  private readonly toolFocus = new Map<Component, ToolFocus>()
  private readonly thoughts = new Map<Occurrence, Thought>()
  private readonly thinkingParts = new Map<Occurrence, Set<number>>()
  private readonly answerParts = new WeakMap<Component, Container>()
  private visibleDisclosures: (
    | GroupHeader
    | ToolFocus
    | WorkHeader
    | Thought
  )[] = []
  private unsubscribe?: () => void
  private source: Occurrence | undefined
  private streaming: Occurrence | undefined
  private active = true
  private relationshipWriteFailed = false
  private indexedIds: string[] = []
  private readonly sourceRanks = new Map<string, number>()
  private readonly sourceZones = new Map<string, number[]>()
  private lastSourceZone = 0
  private sourceRevision = 0
  private readonly sourceSearch = new SourceSearch<Occurrence>()
  private readonly renderedSearch = new WeakMap<
    Component,
    InstanceType<typeof AltScreenSearchIndex>
  >()
  private searchState:
    | {
        query: string
        revision: number
        hits: SourceHit<Occurrence>[]
        counts: Map<Occurrence, number>
        selected: number
      }
    | undefined

  private constructor(host: NativeMode) {
    this.host = host
    this.imageSettings = {
      show: host.settingsManager.getShowImages(),
      width: host.settingsManager.getImageWidthCells(),
    }
    this.relationships = new RelationshipJournal(host.sessionManager)
    this.oldRoot = host.fullscreenLayoutRoot
    this.transcript = new ScrollView(host.documentContainer, {
      follow: "end",
      primary: true,
      overscroll: "chain",
      scrollbar: host.transcriptScrollView.scrollbar,
    })
    this.root = new OwnedRoot(
      [
        {
          component: this.painting,
          basis: 0,
          grow: 1,
          shrink: 1,
          minSize: 1,
        },
        {
          component: (this.oldRoot as VStack).children[1]!,
          basis: "auto",
          grow: 0,
          shrink: 1,
          minSize: 1,
        },
      ],
      () => {
        this.oldRoot.invalidate()
        for (const components of this.historical.values())
          for (const component of components) component.invalidate()
      },
      () => this.layoutChat(),
    )
  }

  static install(host: InteractiveMode): NativeChatHost {
    if (active.has(host)) throw new Error("pi-chat chat root is already owned")
    const mode = requiredMode(host)
    const adapter = new NativeChatHost(mode)
    try {
      adapter.wrapNativeConstruction()
      adapter.forkCleanup = carryObservedFork(
        mode.runtimeHost,
        adapter.relationships,
        (error) => mode.showError?.(error.message),
      )
      adapter.bindRenderer()
      mode.fullscreenLayoutRoot = adapter.root
      if (mode.renderer.mode === "fullscreen")
        mode.renderer.setLayoutRoot(adapter.root)
      adapter.indexBranch()
      adapter.restoreRelationships()
      adapter.unsubscribe = mode.session.agent.subscribe((event) => {
        adapter.promotePersistedMessage(event)
      })
      active.set(host, adapter)
      return adapter
    } catch (error) {
      adapter.dispose()
      throw error
    }
  }

  private layoutChat() {
    const show = this.host.settingsManager.getShowImages()
    const widthCells = this.host.settingsManager.getImageWidthCells()
    if (
      show !== this.imageSettings.show ||
      widthCells !== this.imageSettings.width
    ) {
      for (const components of this.historical.values())
        for (const component of components)
          if (component instanceof ToolExecutionComponent) {
            if (show !== this.imageSettings.show) component.setShowImages(show)
            if (widthCells !== this.imageSettings.width)
              component.setImageWidthCells(widthCells)
          }
      this.imageSettings = { show, width: widthCells }
    }
    const renderer = this.host.renderer as unknown as TuiAltScreen
    const width = Math.max(1, renderer.terminal.columns)
    const height = Math.max(1, renderer.terminal.rows)
    const dock = (this.oldRoot as VStack).children[1]!
    const dockHeight = dock.render(width).length
    const [available] = allocateStackSizes(
      [
        { component: this.painting, basis: 0, grow: 1, shrink: 1, minSize: 1 },
        { component: dock, basis: "auto", grow: 0, shrink: 1, minSize: 1 },
      ],
      [0, dockHeight],
      height,
      0,
    )
    const contentWidth = this.transcript.getContentWidth(width)
    const oldLeaves = this.leaves
    const oldAnchor = rendererSelection(renderer, "selectionAnchor")
    const oldFocus = rendererSelection(renderer, "selectionFocus")
    const selectedStart =
      oldAnchor && oldFocus ? Math.min(oldAnchor.row, oldFocus.row) : -1
    const selectedEnd =
      oldAnchor && oldFocus ? Math.max(oldAnchor.row, oldFocus.row) : -1
    const wasFollowing = this.transcript.isFollowingEnd
    const previousTop = this.transcript.scrollTop
    const anchor = !wasFollowing
      ? oldLeaves.find(
          (leaf) =>
            previousTop >= Math.max(currentTop(leaf), leaf.body?.top ?? 0) &&
            previousTop <
              Math.min(
                currentTop(leaf) + leaf.rows.length,
                leaf.body
                  ? leaf.body.top + leaf.body.scroll.viewportHeight
                  : Infinity,
              ),
        )
      : undefined
    const anchorRow = anchor ? previousTop - currentTop(anchor) : 0
    let start = 0
    const missing = [...this.historical].toSorted(
      ([left], [right]) =>
        (this.sourceRanks.get(left) ?? Infinity) -
        (this.sourceRanks.get(right) ?? Infinity),
    )
    const components: Component[] = []
    let nextMissing = 0
    for (const section of this.host.documentContainer.children) {
      if (section !== this.host.chatContainer) {
        components.push(section)
        continue
      }
      for (const component of this.host.chatContainer.children) {
        const position = this.sourceRanks.get(
          this.byComponent.get(component)?.entry?.id ?? "",
        )
        if (position !== undefined)
          while (
            nextMissing < missing.length &&
            (this.sourceRanks.get(missing[nextMissing]![0]) ?? Infinity) <
              position
          )
            components.push(...missing[nextMissing++]![1])
        components.push(component)
      }
      while (nextMissing < missing.length)
        components.push(...missing[nextMissing++]![1])
    }
    const activities = this.orderedActivities(components)
    let composed: Activity[] = []
    for (let index = 0; index < activities.length;) {
      const activity = activities[index]!
      if (!activity.tool) {
        composed.push(activity)
        index++
        continue
      }
      const calls: Activity[] = []
      while (
        activities[index]?.tool &&
        (!calls.length ||
          activities[index]?.sourceZone === undefined ||
          calls.at(-1)?.sourceZone === undefined ||
          activities[index]?.sourceZone === calls.at(-1)?.sourceZone)
      )
        calls.push(activities[index++]!)
      const first = calls[0]!.occurrence
      if (!first) {
        composed.push(...calls)
        continue
      }
      let group = this.groups.get(first)
      if (!group) {
        group = { calls, expanded: false, viewport: new InlineViewport() }
        group.header = new GroupHeader(this, group)
        this.groups.set(first, group)
      }
      group.calls = calls
      const unfinished = calls.some(
        ({ component }) => "isPartial" in component && component.isPartial,
      )
      const groupActive =
        index === activities.length && this.host.session.isStreaming
      if (calls.length === 1 && !unfinished && !groupActive) {
        composed.push(this.focusableTool(calls[0]!))
      } else {
        composed.push({
          component: group.header!,
          tool: false,
          work: this.work.find(first),
        })
        if (group.expanded) {
          for (const call of calls) {
            const focused = this.focusableTool(call)
            focused.body = group.viewport
            composed.push(focused)
          }
        }
      }
    }
    composed = this.composeWork(composed)
    this.visibleDisclosures = composed.flatMap(({ component }) =>
      component instanceof WorkHeader ||
      component instanceof GroupHeader ||
      component instanceof ToolFocus ||
      component instanceof Thought
        ? [component]
        : [],
    )
    const leaves = composed.map(
      ({ component, occurrence, body, zoneStart, zoneEnd }) => {
        let rows = component.render(contentWidth)
        if (rows.length && (zoneStart || zoneEnd)) {
          rows = [...rows]
          // Split native assistants retain the same semantic navigation zones.
          if (zoneStart) rows[0] = "\x1b]133;A\x07" + rows[0]
          if (zoneEnd)
            rows[rows.length - 1] = "\x1b]133;B\x07\x1b]133;C\x07" + rows.at(-1)
        }
        const leaf: Leaf = {
          component,
          occurrence,
          rows,
          start,
          top: 0,
          offset: 0,
        }
        if (body) leaf.body = body
        start += rows.length
        return leaf
      },
    )
    let contentHeight = 0
    for (let index = 0; index < leaves.length;) {
      const leaf = leaves[index]!
      if (!leaf.body) {
        leaf.top = contentHeight
        contentHeight += leaf.rows.length
        index++
        continue
      }
      const body = leaf.body
      const children: Leaf[] = []
      while (leaves[index]?.body === body) children.push(leaves[index++]!)
      body.top = contentHeight
      body.update(
        children,
        Math.max(1, Math.min(16, (available ?? 0) - 3)),
        () => renderer.requestRender(),
      )
      for (const child of children)
        child.top = body.top + child.offset - body.scroll.scrollTop
      contentHeight += body.scroll.viewportHeight
    }
    this.leaves = leaves
    if (
      (renderer.getFocusedComponent() instanceof GroupHeader ||
        renderer.getFocusedComponent() instanceof ToolFocus ||
        renderer.getFocusedComponent() instanceof Thought ||
        renderer.getFocusedComponent() instanceof WorkHeader) &&
      !this.visibleDisclosures.includes(
        renderer.getFocusedComponent() as
          | GroupHeader
          | ToolFocus
          | WorkHeader
          | Thought,
      )
    )
      this.returnToComposer()
    this.viewportHeight = available ?? 0
    this.transcript.updateLayout(contentHeight, this.viewportHeight, () =>
      renderer.requestRender(),
    )
    if (anchor) {
      const next = leaves.find((leaf) =>
        anchor.occurrence
          ? leaf.occurrence === anchor.occurrence
          : leaf.component === anchor.component,
      )
      if (next)
        this.transcript.scrollTo(
          Math.max(
            next.body?.top ?? 0,
            next.top + Math.min(anchorRow, Math.max(0, next.rows.length - 1)),
          ),
          { disableFollow: true },
        )
      else this.transcript.scrollTo(previousTop, { disableFollow: true })
    } else if (!wasFollowing)
      this.transcript.scrollTo(previousTop, { disableFollow: true })
    const widthChanged = this.layoutWidth !== 0 && this.layoutWidth !== width
    this.layoutWidth = width
    for (const point of [oldAnchor, oldFocus]) {
      if (point?.scrollView !== this.transcript || !point.component) continue
      const leaf = leaves.find((candidate) =>
        point.occurrence
          ? candidate.occurrence === point.occurrence
          : candidate.component === point.component,
      )
      if (
        leaf &&
        point.localRow !== undefined &&
        point.localRow < leaf.rows.length
      ) {
        point.row = leaf.start + point.localRow
        point.component = leaf.component
      } else this.clearSelection(renderer)
    }
    if (widthChanged) this.clearSelection(renderer)
    else if (selectedStart >= 0 && oldAnchor?.scrollView === this.transcript) {
      for (const old of oldLeaves) {
        if (
          old.start > selectedEnd ||
          old.start + old.rows.length <= selectedStart
        )
          continue
        const next = leaves.find((leaf) =>
          old.occurrence
            ? leaf.occurrence === old.occurrence
            : leaf.component === old.component,
        )
        if (
          !next ||
          next.rows.length !== old.rows.length ||
          next.rows.some((line, row) => line !== old.rows[row])
        ) {
          this.clearSelection(renderer)
          break
        }
      }
    }
    this.painting.clear()
    this.intervals = []
    const top = this.transcript.scrollTop
    const bottom = top + this.viewportHeight
    for (const leaf of leaves) {
      const sourceStart = Math.max(
        0,
        top - leaf.top,
        (leaf.body?.top ?? leaf.top) - leaf.top,
      )
      const sourceEnd = Math.min(
        leaf.rows.length,
        bottom - leaf.top,
        leaf.body
          ? leaf.body.top + leaf.body.scroll.viewportHeight - leaf.top
          : leaf.rows.length,
      )
      if (sourceEnd <= sourceStart) continue
      const raw = new RawLeaf(leaf.component, leaf.rows)
      const window = new ScrollView(raw, {
        follow: "none",
        scrollbar: "hidden",
      })
      window.updateLayout(leaf.rows.length, sourceEnd - sourceStart, () =>
        renderer.requestRender(),
      )
      window.scrollTo(sourceStart, { disableFollow: true })
      this.intervals.push({
        leaf,
        start: sourceStart,
        end: sourceEnd,
        top: leaf.top + sourceStart - top,
        window,
      })
      this.painting.addChild(window, {
        basis: sourceEnd - sourceStart,
        grow: 0,
        shrink: 0,
      })
    }
  }

  private focusableTool(activity: Activity): Activity {
    let focus = this.toolFocus.get(activity.component)
    if (!focus) {
      focus = new ToolFocus(this, activity.component as ToolPresenter)
      this.toolFocus.set(activity.component, focus)
    }
    return { ...activity, component: focus }
  }

  private orderedActivities(components: Component[]): Activity[] {
    const activities: Activity[] = []
    const toolChildren = new Set<Component>()
    for (const component of components) {
      const owner = this.byComponent.get(component)
      if (
        owner?.message?.role !== "assistant" ||
        !("contentContainer" in component)
      )
        continue
      for (const part of owner.parts.values()) {
        if (
          part.contentIndex !== undefined &&
          owner.message.content[part.contentIndex]?.type === "toolCall" &&
          part.component
        )
          toolChildren.add(part.component)
      }
    }
    for (const component of components) {
      if (toolChildren.has(component)) continue
      const owner = this.byComponent.get(component)
      if (
        owner?.message?.role !== "assistant" ||
        !("contentContainer" in component) ||
        (!this.work.needsParts(owner) &&
          !owner.message.content.some(
            (part) => part.type === "toolCall" || part.type === "thinking",
          ))
      ) {
        activities.push({
          component,
          ...(owner ? { occurrence: owner } : {}),
          tool: false,
        })
        continue
      }
      const activityStart = activities.length
      const children = (component as NativeAssistant).contentContainer.children
      const hasVisibleContent = owner.message.content.some(
        (part) =>
          (part.type === "text" && part.text.trim()) ||
          (part.type === "thinking" && part.thinking.trim()),
      )
      let leading = hasVisibleContent ? children[0] : undefined
      let position = leading ? 1 : 0
      const flush = () => {
        while (children[position] && !this.byComponent.has(children[position]!))
          activities.push({
            component: children[position++]!,
            owner,
            tool: false,
            work: this.work.find(owner),
          })
      }
      for (let index = 0; index < owner.message.content.length; index++) {
        const part = owner.message.content[index]!
        const occurrence = owner.parts.get(index)
        if (part.type === "toolCall") {
          flush()
          if (occurrence?.component)
            activities.push({
              component: occurrence.component,
              occurrence,
              tool: true,
              sourceZone: owner.entry?.id
                ? this.sourceZones.get(owner.entry.id)?.[index]
                : undefined,
            })
        } else if (occurrence?.contentIndex === index && occurrence.component) {
          if (leading) {
            activities.push({
              component: leading,
              owner,
              tool: false,
              work: this.work.find(owner),
            })
            leading = undefined
          }
          flush()
          if (children[position] === occurrence.component) position++
          const thought = this.thoughts.get(occurrence)
          if (thought) {
            activities.push({
              component: thought,
              owner,
              tool: false,
              work: this.work.find(owner),
            })
            if (thought.expanded && thought.body)
              activities.push({
                component: thought.body,
                occurrence,
                tool: false,
                body: thought.viewport,
              })
          } else
            activities.push({
              component: occurrence.component,
              occurrence,
              tool: false,
            })
        }
      }
      if (leading)
        activities.push({
          component: leading,
          owner,
          tool: false,
          work: this.work.find(owner),
        })
      const work = this.work.find(owner)
      if (work && this.work.needsParts(owner)) {
        const final = activities
          .slice(activityStart)
          .filter((activity) => this.work.isFinal(activity.occurrence, work))
        for (const [index, activity] of final.entries()) {
          let part = this.answerParts.get(activity.component)
          if (!part) {
            part = new Container()
            part.addChild(activity.component)
            this.answerParts.set(activity.component, part)
          }
          activity.zoneStart = index === 0
          activity.zoneEnd = index === final.length - 1
          part.children.splice(
            1,
            part.children.length - 1,
            ...(activity.zoneEnd ? children.slice(position) : []),
          )
          activity.component = part
        }
      } else {
        for (; position < children.length; position++)
          activities.push({
            component: children[position]!,
            tool: false,
            work,
          })
        if (!owner.message.content.some((part) => part.type === "toolCall")) {
          const first = activities[activityStart]
          const last = activities.at(-1)
          if (first && last) {
            first.zoneStart = true
            last.zoneEnd = true
          }
        }
      }
    }
    return activities
  }

  requestRender() {
    ;(this.host.renderer as unknown as TuiAltScreen).requestRender()
  }

  handleDisclosureInput(data: string, toggle: () => void) {
    const keys = getKeybindings()
    if (keys.matches(data, "tui.select.up")) this.moveDisclosure(-1)
    else if (keys.matches(data, "tui.select.down")) this.moveDisclosure(1)
    else if (keys.matches(data, "tui.select.confirm")) toggle()
    else if (keys.matches(data, "tui.select.cancel")) this.returnToComposer()
    else if (this.host.keybindings.matches(data, "app.tools.expand"))
      this.host.toggleToolOutputExpansion()
    else if (this.host.keybindings.matches(data, "app.message.copy"))
      void this.host.handleCopyCommand({
        flashConfirmation: true,
        preferSelection: true,
      })
    else if (keys.matches(data, "tui.altScreen.pageUp")) this.scrollChat(-1)
    else if (keys.matches(data, "tui.altScreen.pageDown")) this.scrollChat(1)
  }

  focusNearestDisclosure() {
    const renderer = this.host.renderer as unknown as TuiAltScreen
    if (
      !this.ownsRenderer(renderer) ||
      (
        renderer as unknown as { isOverlayFocused(): boolean }
      ).isOverlayFocused()
    )
      return
    const nearest = this.visibleDisclosures.findLast((disclosure) => {
      const leaf = this.leaves.find((item) => item.component === disclosure)
      return leaf && this.visibleInterval(leaf)?.start === 0
    })
    if (!nearest) return
    renderer.setFocus(nearest)
    this.revealDisclosure(nearest)
  }

  moveDisclosure(direction: number) {
    const renderer = this.host.renderer as unknown as TuiAltScreen
    const index = this.visibleDisclosures.indexOf(
      renderer.getFocusedComponent() as GroupHeader,
    )
    const next = this.visibleDisclosures[index + direction]
    if (!next) return
    renderer.setFocus(next)
    this.revealDisclosure(next)
  }

  private revealDisclosure(
    component: GroupHeader | ToolFocus | WorkHeader | Thought,
  ) {
    const leaf = this.leaves.find((item) => item.component === component)
    if (!leaf) return
    if (leaf.body) leaf.body.scroll.scrollTo(leaf.offset)
    const top = leaf.body
      ? leaf.body.top + leaf.offset - leaf.body.scroll.scrollTop
      : leaf.top
    if (top < this.transcript.scrollTop) this.transcript.scrollTo(top)
    else if (top >= this.transcript.scrollTop + this.viewportHeight)
      this.transcript.scrollTo(top - this.viewportHeight + 1)
    ;(this.host.renderer as unknown as TuiAltScreen).requestRender()
  }

  returnToComposer() {
    const renderer = this.host.renderer as unknown as TuiAltScreen
    renderer.setFocus(this.host.editor)
    renderer.requestRender()
  }

  scrollChat(direction: number) {
    this.transcript.scrollBy(direction * this.viewportHeight)
    ;(this.host.renderer as unknown as TuiAltScreen).requestRender()
  }

  toggleGroup(group: ToolGroup) {
    group.expanded = !group.expanded
    if (group.expanded) this.work.inspect(group.calls[0]?.occurrence)
    this.clearSelection(this.host.renderer as unknown as TuiAltScreen)
    ;(this.host.renderer as unknown as TuiAltScreen).requestRender()
  }

  toggleTool(tool: ToolPresenter) {
    tool.setExpanded(!tool.expanded)
    if (tool.expanded) this.inspectTool(tool)
    this.clearChatSelection()
    ;(this.host.renderer as unknown as TuiAltScreen).requestRender()
  }

  toggleWork(work: WorkHistory) {
    work.manualExpanded = !this.work.expanded(work)
    this.clearChatSelection()
    ;(this.host.renderer as unknown as TuiAltScreen).requestRender()
  }

  inspectTool(tool: Component) {
    this.work.inspect(this.byComponent.get(tool))
  }

  private composeWork(activities: Activity[]): Activity[] {
    const result: Activity[] = []
    for (let index = 0; index < activities.length;) {
      const activity = activities[index]!
      const work = activity.work ?? this.work.find(activity.occurrence)
      if (
        !work ||
        !work.final ||
        this.work.isRequest(activity.occurrence, work)
      ) {
        result.push(activity)
        index++
        continue
      }
      const body: Activity[] = []
      const final: Activity[] = []
      for (; index < activities.length; index++) {
        const next = activities[index]!
        const nextWork = next.work ?? this.work.find(next.occurrence)
        if (nextWork !== work) break
        if (
          final.length &&
          !this.work.isFinalMessage(next.occurrence ?? next.owner, work)
        )
          break
        if (this.work.isFinal(next.occurrence, work)) final.push(next)
        else body.push(next)
      }
      if (body.length && final.length) {
        work.header ??= new WorkHeader(this, work)
        result.push({ component: work.header, tool: false })
        if (this.work.expanded(work)) result.push(...body)
      } else result.push(...body)
      result.push(...final)
    }
    return result
  }

  clearChatSelection() {
    this.clearSelection(this.host.renderer as unknown as TuiAltScreen)
  }

  private leafAt(row: number) {
    return this.leaves.find(
      (leaf) => row >= leaf.start && row < leaf.start + leaf.rows.length,
    )
  }

  private visibleInterval(leaf: Leaf): VisibleInterval | undefined {
    const top = leaf.body
      ? leaf.body.top + leaf.offset - leaf.body.scroll.scrollTop
      : leaf.top
    const start = Math.max(
      0,
      this.transcript.scrollTop - top,
      (leaf.body?.top ?? top) - top,
    )
    const end = Math.min(
      leaf.rows.length,
      this.transcript.scrollTop + this.viewportHeight - top,
      leaf.body
        ? leaf.body.top + leaf.body.scroll.viewportHeight - top
        : leaf.rows.length,
    )
    return end > start
      ? { leaf, start, end, top: top + start - this.transcript.scrollTop }
      : undefined
  }

  private searchFields(): SearchField<Occurrence>[] {
    const fields: SearchField<Occurrence>[] = []
    const pending = new Map<string, Occurrence[]>()
    const add = (
      owner: Occurrence | undefined,
      key: string,
      source: string,
      markdown: boolean,
      tool = false,
      sourceEntry?: Entry,
      sourceIndex?: number,
    ) => {
      if (owner && source)
        fields.push({
          owner,
          key,
          sourceRef: {
            ...(sourceEntry?.id || owner.entry?.id
              ? { entryId: sourceEntry?.id ?? owner.entry!.id }
              : {}),
            ...(sourceIndex !== undefined ? { contentIndex: sourceIndex } : {}),
            ...(owner.itemOrdinal !== undefined
              ? { itemOrdinal: owner.itemOrdinal }
              : {}),
          },
          ...(tool && owner.entry?.id && owner.contentIndex !== undefined
            ? {
                callRef: {
                  entryId: owner.entry.id,
                  contentIndex: owner.contentIndex,
                },
              }
            : {}),
          source,
          markdown,
          tool,
        })
    }
    const addAssistant = (
      owner: Occurrence | undefined,
      message: Extract<Message, { role: "assistant" }>,
    ) => {
      for (const [index, part] of message.content.entries()) {
        let occurrence = owner?.parts.get(index)
        if (!occurrence && owner) {
          occurrence = this.newOccurrence(owner.entry)
          occurrence.parent = owner
          occurrence.message = message
          occurrence.contentIndex = index
          owner.parts.set(index, occurrence)
        }
        if (part.type === "text")
          add(
            occurrence ?? owner,
            `text:${index}`,
            part.text,
            true,
            false,
            owner?.entry,
            index,
          )
        else if (part.type === "thinking")
          add(
            occurrence,
            `thought:${index}`,
            part.thinking,
            true,
            false,
            owner?.entry,
            index,
          )
        else if (part.type === "toolCall") {
          if (occurrence) {
            const calls = pending.get(part.id) ?? []
            calls.push(occurrence)
            pending.set(part.id, calls)
          }
          add(
            occurrence,
            `name:${index}`,
            part.name,
            false,
            true,
            owner?.entry,
            index,
          )
          const addArgument = (value: unknown, path: (string | number)[]) => {
            if (Array.isArray(value)) {
              for (const [position, item] of value.entries())
                addArgument(item, [...path, position])
            } else if (value && typeof value === "object") {
              for (const [key, item] of Object.entries(value))
                addArgument(item, [...path, key])
            } else {
              add(
                occurrence,
                `argument:${index}:${JSON.stringify(path)}`,
                String(value),
                false,
                true,
                owner?.entry,
                index,
              )
            }
          }
          addArgument(part.arguments, [])
        }
      }
    }
    for (const id of this.indexedIds) {
      const entry = this.host.sessionManager.getEntry(id)
      if (!entry) continue
      const message =
        entry.type === "message"
          ? entry.message
          : entry.type === "custom_message"
            ? sessionEntryToContextMessages(entry)[0]
            : undefined
      if (!message) continue
      const owner = this.byEntryId.get(id)
      if (owner && !owner.message) owner.message = message
      if (message.role === "assistant") {
        addAssistant(owner, message)
      } else if (message.role === "toolResult") {
        const call = pending.get(message.toolCallId)?.shift()
        if (call) {
          call.resultEntry = entry
          call.resultMessage = message
        }
        for (const [index, part] of message.content.entries())
          if (part.type === "text")
            add(
              call,
              `result:${id}:${index}`,
              part.text,
              false,
              true,
              entry,
              index,
            )
      } else if (message.role === "user") {
        const content =
          typeof message.content === "string"
            ? [{ type: "text", text: message.content }]
            : message.content
        for (const [index, part] of content.entries())
          if (part.type === "text")
            add(owner, `user:${index}`, part.text, true, false, entry, index)
      } else if (message.role === "bashExecution") {
        add(owner, "command", message.command, false, false, entry)
        add(owner, "output", message.output, false, false, entry)
      } else if (message.role === "custom" && message.display) {
        const content =
          typeof message.content === "string"
            ? [{ type: "text", text: message.content }]
            : message.content
        for (const [index, part] of content.entries())
          if (part.type === "text")
            add(owner, `custom:${index}`, part.text, true, false, entry, index)
      }
    }
    if (this.streaming?.message?.role === "assistant")
      addAssistant(this.streaming, this.streaming.message)
    return fields
  }

  private searchLeaf(hit: SourceHit<Occurrence>): Leaf | undefined {
    for (
      let owner: Occurrence | undefined = hit.field.owner;
      owner;
      owner = owner.parent
    ) {
      const leaf = this.leaves.find(
        (candidate) => candidate.occurrence === owner,
      )
      if (leaf) return leaf
    }
    return undefined
  }

  private searchSegments(hit: SourceHit<Occurrence>, leaf: Leaf) {
    let index = this.renderedSearch.get(leaf.component)
    if (!index) {
      index = new AltScreenSearchIndex()
      this.renderedSearch.set(leaf.component, index)
    }
    const matching = index.search(leaf.rows, hit.query).matches
    const sourceCount = this.searchState?.counts.get(hit.field.owner)
    if (matching.length === sourceCount) return matching[hit.ordinal]?.segments
    if (!hit.field.tool) return undefined
    const row = leaf.rows.findIndex((line) =>
      stripTerminalSequences(line).trim(),
    )
    const fallbackRow = Math.max(0, row)
    return [
      {
        row: fallbackRow,
        startCol: 0,
        endCol: visibleWidth(leaf.rows[fallbackRow] ?? ""),
      },
    ]
  }

  private materializeSearchHit(hit: SourceHit<Occurrence>) {
    const selected = hit.field.owner
    const owner = selected.parent ?? selected
    const entry = owner.entry
    if (!entry?.id || !owner.message) return false
    const retained = this.historical.get(entry.id)
    if (retained && (!hit.field.tool || selected.component)) return false
    if (!retained && owner.component) return false
    let components = retained
    if (!components) {
      const receiver = Object.create(this.host) as NativeMode
      receiver.chatContainer = new Container()
      ;(
        InteractiveMode.prototype as unknown as NativeMode
      ).addMessageToChat.call(receiver, owner.message, {
        populateHistory: false,
      })
      components = [...receiver.chatContainer.children]
    }
    if (owner.message.role === "assistant") {
      const presenter =
        !retained &&
        components.find(
          (component): component is NativeAssistant =>
            "contentContainer" in component,
        )
      if (presenter) {
        owner.component = presenter
        this.byComponent.set(presenter, owner)
        this.bindAssistant(presenter, owner)
      }
      if (hit.field.tool) {
        const index = hit.field.callRef?.contentIndex
        const call =
          index === undefined ? undefined : owner.message.content[index]
        if (call?.type === "toolCall") {
          const tool = new ToolExecutionComponent(
            call.name,
            call.id,
            call.arguments,
            {
              showImages: this.host.settingsManager.getShowImages(),
              imageWidthCells: this.host.settingsManager.getImageWidthCells(),
            },
            this.host.getRegisteredToolDefinition(call.name),
            this.host.ui,
            this.host.sessionManager.getCwd(),
          )
          tool.setExpanded(this.host.toolOutputExpanded)
          if (
            owner.message.stopReason === "aborted" ||
            owner.message.stopReason === "error"
          ) {
            const retries = this.host.session.retryAttempt
            const error =
              owner.message.stopReason === "aborted"
                ? retries > 0
                  ? `Aborted after ${retries} retry attempt${retries > 1 ? "s" : ""}`
                  : "Operation aborted"
                : owner.message.errorMessage || "Error"
            tool.updateResult({
              content: [{ type: "text", text: error }],
              isError: true,
            })
          } else if (selected.resultMessage?.role === "toolResult")
            tool.updateResult(selected.resultMessage)
          this.bindPart(owner, index!, tool)
          components.push(tool)
        }
      }
    } else if (!retained) {
      const presenter = components.at(-1)
      if (presenter) {
        owner.component = presenter
        this.byComponent.set(presenter, owner)
      }
    }
    if (!components.length) return false
    this.historical.set(entry.id, components)
    return true
  }

  private revealSearchHit(hit: SourceHit<Occurrence>) {
    const owner = hit.field.owner
    let changed = this.materializeSearchHit(hit)
    const work = this.work.find(owner)
    if (work && !this.work.expanded(work)) {
      work.manualExpanded = true
      work.keepOpen = true
      changed = true
    }
    const thought = this.thoughts.get(owner)
    if (thought && !thought.expanded) {
      thought.ensureOpen()
      changed = true
    }
    if (
      hit.field.tool &&
      owner.component &&
      "setExpanded" in owner.component &&
      "expanded" in owner.component &&
      !owner.component.expanded
    ) {
      ;(owner.component as ToolPresenter).setExpanded(true)
      changed = true
    }
    if (changed) this.layoutChat()
    for (const group of this.groups.values()) {
      if (
        group.calls.some((call) => call.occurrence === owner) &&
        !group.expanded
      ) {
        group.expanded = true
        this.layoutChat()
        changed = true
        break
      }
    }
    const leaf = this.searchLeaf(hit)
    if (!leaf) return changed
    const row = this.searchSegments(hit, leaf)?.[0]?.row ?? 0
    if (leaf.body) {
      const before = leaf.body.scroll.scrollTop
      const target = leaf.offset + row
      if (target < before || target >= before + leaf.body.scroll.viewportHeight)
        leaf.body.scroll.scrollTo(target, { disableFollow: true })
      changed ||= leaf.body.scroll.scrollTop !== before
    }
    const top = currentTop(leaf) + row
    const before = this.transcript.scrollTop
    if (top < before || top >= before + this.viewportHeight)
      this.transcript.scrollTo(
        Math.max(0, top - Math.floor(this.viewportHeight / 3)),
        {
          disableFollow: true,
        },
      )
    return changed || this.transcript.scrollTop !== before
  }

  private refreshSourceSearch(renderer: TuiAltScreen) {
    const native = (renderer as unknown as { activeSearch?: NativeSearch })
      .activeSearch
    if (!native) {
      this.searchState = undefined
      return false
    }
    native.matches = []
    native.selectedIndex = -1
    const mode = native.selectionMode
    if (
      mode !== "retain" &&
      this.host.sessionManager.getLeafId() !== this.indexedIds.at(-1)
    )
      this.indexBranch()
    const previous = this.searchState
    const rebuild =
      !previous ||
      previous.query !== native.query ||
      previous.revision !== this.sourceRevision
    const hits = rebuild
      ? this.sourceSearch.find(this.searchFields(), native.query)
      : previous.hits
    const counts = rebuild ? new Map<Occurrence, number>() : previous.counts
    if (rebuild)
      for (const hit of hits)
        counts.set(hit.field.owner, (counts.get(hit.field.owner) ?? 0) + 1)
    let selected = previous?.selected ?? -1
    if (rebuild) {
      const old = previous?.hits[previous.selected]
      selected = old
        ? hits.findIndex(
            (hit) =>
              (hit.field.sourceRef.entryId
                ? hit.field.sourceRef.entryId === old.field.sourceRef.entryId
                : hit.field.owner === old.field.owner) &&
              hit.field.key === old.field.key &&
              hit.from === old.from,
          )
        : -1
      if (selected < 0 && hits.length) selected = 0
    } else if (hits.length && mode === "next")
      selected = (selected + 1) % hits.length
    else if (hits.length && mode === "previous")
      selected = (selected - 1 + hits.length) % hits.length
    this.searchState = {
      query: native.query,
      revision: this.sourceRevision,
      hits,
      counts,
      selected,
    }
    native.component.setResult(selected, hits.length)
    native.selectionMode = "retain"
    const hit = hits[selected]
    return hit && (rebuild || mode !== "retain")
      ? this.revealSearchHit(hit)
      : false
  }

  private paintSourceSearch(
    renderer: TuiAltScreen,
    screen: string[],
    layout: Parameters<typeof getScrollViewBox>[0],
  ) {
    const state = this.searchState
    if (!state?.hits.length) return screen
    const ranges = new Map<
      number,
      { start: number; end: number; current: boolean }[]
    >()
    for (const [index, hit] of state.hits.entries()) {
      const leaf = this.searchLeaf(hit)
      const interval = leaf && this.intervals.find((item) => item.leaf === leaf)
      if (!leaf || !interval) continue
      const box = getScrollViewBox(layout, interval.window)
      if (!box) continue
      for (const segment of this.searchSegments(hit, leaf) ?? []) {
        if (segment.row < interval.start || segment.row >= interval.end)
          continue
        const row = box.rect.y + segment.row - interval.window.scrollTop
        const start = Math.max(
          box.rect.x,
          box.clip.x,
          box.rect.x + segment.startCol,
        )
        const end = Math.min(
          box.rect.x + box.rect.width,
          box.clip.x + box.clip.width,
          box.rect.x + segment.endCol,
        )
        if (
          row < box.clip.y ||
          row >= box.clip.y + box.clip.height ||
          end <= start
        )
          continue
        const rowRanges = ranges.get(row) ?? []
        rowRanges.push({ start, end, current: index === state.selected })
        ranges.set(row, rowRanges)
      }
    }
    const painted = [...screen]
    const highlight = (
      renderer as unknown as {
        applySearchTextHighlight(text: string, current: boolean): string
      }
    ).applySearchTextHighlight
    for (const [row, rowRanges] of ranges) {
      const line = painted[row] ?? ""
      if (isImageLine(line)) continue
      const width = visibleWidth(line)
      const merged: typeof rowRanges = []
      for (const range of rowRanges.toSorted(
        (left, right) => left.start - right.start,
      )) {
        const last = merged.at(-1)
        if (last && range.start < last.end) {
          last.end = Math.max(last.end, range.end)
          last.current ||= range.current
        } else merged.push({ ...range })
      }
      let output = ""
      let cursor = 0
      for (const range of merged) {
        const start = Math.min(range.start, width)
        const end = Math.min(range.end, width)
        if (end <= start) continue
        output += sliceByColumn(line, cursor, start - cursor, true)
        output += highlight.call(
          renderer,
          sliceByColumn(line, start, end - start, true),
          range.current,
        )
        cursor = end
      }
      painted[row] = output + sliceByColumn(line, cursor, width - cursor, true)
    }
    return painted
  }

  private pointAt(x: number, y: number): SelectionPoint {
    const visible = this.leaves.flatMap((leaf) => {
      const interval = this.visibleInterval(leaf)
      return interval ? [interval] : []
    })
    const interval =
      visible.find((item) => y < item.top + item.end - item.start) ??
      visible.at(-1)
    const leaf = interval?.leaf
    const localRow = interval
      ? interval.start +
        Math.max(
          0,
          Math.min(interval.end - interval.start - 1, y - interval.top),
        )
      : 0
    const row = leaf ? leaf.start + localRow : 0
    return {
      row,
      col: Math.max(0, Math.min(this.layoutWidth - 1, x)),
      scrollView: this.transcript,
      ...(leaf
        ? {
            component: leaf.component,
            ...(leaf.occurrence ? { occurrence: leaf.occurrence } : {}),
            localRow,
          }
        : {}),
    }
  }

  private selectedText(renderer: TuiAltScreen): string | undefined {
    const bounds = (
      renderer as unknown as {
        getSelectionBounds():
          | { start: SelectionPoint; end: SelectionPoint }
          | undefined
      }
    ).getSelectionBounds()
    if (!bounds || bounds.start.scrollView !== this.transcript) return undefined
    const columns = (
      renderer as unknown as {
        getSelectionColumns(
          line: string,
          row: number,
          selection: { start: SelectionPoint; end: SelectionPoint },
        ): { start: number; end: number }
      }
    ).getSelectionColumns
    const lines: string[] = []
    for (const leaf of this.leaves) {
      const first = Math.max(bounds.start.row, leaf.start)
      const last = Math.min(bounds.end.row, leaf.start + leaf.rows.length - 1)
      for (let row = first; row <= last; row++) {
        const line = leaf.rows[row - leaf.start]!
        const range = columns.call(renderer, line, row, bounds)
        lines.push(
          stripTerminalSequences(
            sliceByColumn(
              line,
              range.start,
              Math.max(0, range.end - range.start),
              true,
            ),
          ).trimEnd(),
        )
      }
    }
    const text = lines.join("\n")
    return text || undefined
  }

  private clearSelection(renderer: TuiAltScreen) {
    ;(
      renderer as unknown as { clearTextSelection(): void }
    ).clearTextSelection()
  }

  private ownsRenderer(renderer: TuiAltScreen) {
    return (
      this.active &&
      (this.host.renderer as unknown) === renderer &&
      this.host.fullscreenLayoutRoot === this.root &&
      (renderer as unknown as { layoutRoot?: Component }).layoutRoot ===
        this.root
    )
  }

  private bindRenderer() {
    if (this.host.renderer.mode !== "fullscreen") return
    const renderer = this.host.renderer as unknown as TuiAltScreen
    if (this.boundRenderer === renderer) return
    this.unbindRenderer()
    this.boundRenderer = renderer
    const bind = (
      name: string,
      replacement: (original: Function) => Function,
    ) => {
      const target = renderer as unknown as Record<string, unknown>
      const original = target[name] as Function
      const descriptor = Object.getOwnPropertyDescriptor(renderer, name)
      const wrapped = replacement(original)
      target[name] = wrapped
      this.rendererMethods.set(name, {
        original,
        wrapped,
        ...(descriptor ? { descriptor } : {}),
      })
    }
    bind(
      "getPrimaryScrollView",
      (original) => () =>
        this.ownsRenderer(renderer) ? this.transcript : original.call(renderer),
    )
    bind(
      "refreshSearch",
      (original) => (layout: unknown) =>
        this.ownsRenderer(renderer)
          ? this.refreshSourceSearch(renderer)
          : original.call(renderer, layout),
    )
    bind(
      "applySearchHighlights",
      (original) =>
        (screen: string[], layout: Parameters<typeof getScrollViewBox>[0]) =>
          this.ownsRenderer(renderer)
            ? this.paintSourceSearch(renderer, screen, layout)
            : original.call(renderer, screen, layout),
    )
    bind("closeSearch", (original) => () => {
      const result = original.call(renderer)
      this.searchState = undefined
      return result
    })
    bind(
      "routeWheel",
      (original) => (event: { x: number; y: number }, delta: number) => {
        if (!this.ownsRenderer(renderer) || event.y >= this.viewportHeight)
          return original.call(renderer, event, delta)
        const interval = this.intervals.find(
          (item) =>
            event.y >= item.top && event.y < item.top + item.end - item.start,
        )
        const remaining = interval?.leaf.body?.scroll.scrollBy(delta) ?? delta
        if (remaining) this.transcript.scrollBy(remaining)
        renderer.requestRender()
      },
    )
    bind("scrollToPrompt", (original) => (direction: number) => {
      if (!this.ownsRenderer(renderer))
        return original.call(renderer, direction)
      // oxlint-disable-next-line eslint/no-control-regex -- Pi marks prompt rows with OSC 133.
      const marker = /^\x1b\]133;A(?:\x07|\x1b\\)/
      for (const leaf of direction < 0
        ? this.leaves.toReversed()
        : this.leaves) {
        const top = leaf.body
          ? leaf.body.top + leaf.offset - leaf.body.scroll.scrollTop
          : leaf.top
        if (direction < 0 && top >= this.transcript.scrollTop) continue
        if (
          direction > 0 &&
          top + leaf.rows.length <= this.transcript.scrollTop
        )
          continue
        const first =
          direction < 0
            ? Math.min(
                leaf.rows.length - 1,
                this.transcript.scrollTop - top - 1,
              )
            : Math.max(0, this.transcript.scrollTop - top + 1)
        for (
          let local = first;
          local >= 0 && local < leaf.rows.length;
          local += direction
        ) {
          if (!marker.test(leaf.rows[local] ?? "")) continue
          const row = top + local
          this.transcript.scrollTo(row)
          renderer.requestRender()
          return
        }
      }
    })
    bind(
      "getSelectionPoint",
      (original) =>
        (event: { x: number; y: number }, scrollView?: ScrollView) => {
          if (
            !this.ownsRenderer(renderer) ||
            (event.y >= this.viewportHeight && scrollView !== this.transcript)
          )
            return original.call(renderer, event, scrollView)
          return this.pointAt(event.x, event.y)
        },
    )
    bind(
      "getScrollSelectionPoint",
      (original) => (scrollView: ScrollView, x: number, y: number) =>
        this.ownsRenderer(renderer) && scrollView === this.transcript
          ? this.pointAt(x, y)
          : original.call(renderer, scrollView, x, y),
    )
    bind("getSelectionSourceLine", (original) => (point: SelectionPoint) => {
      if (!this.ownsRenderer(renderer) || point.scrollView !== this.transcript)
        return original.call(renderer, point)
      const leaf = this.leafAt(point.row)
      return leaf?.rows[point.row - leaf.start] ?? ""
    })
    bind(
      "updateSelectionAutoScroll",
      (original) => (event: { x: number; y: number }) => {
        const state = renderer as unknown as {
          selectionAnchor?: SelectionPoint
          selectionDragPointer?: { x: number; y: number }
          selectionAutoScrollDirection: number
          selectionAutoScrollTimer?: NodeJS.Timeout
          stopSelectionAutoScroll(): void
          autoScrollSelection(): void
        }
        if (
          !this.ownsRenderer(renderer) ||
          state.selectionAnchor?.scrollView !== this.transcript
        )
          return original.call(renderer, event)
        const direction =
          event.y <= 0 ? -1 : event.y >= this.viewportHeight - 1 ? 1 : 0
        if (!direction) {
          state.stopSelectionAutoScroll()
          return
        }
        state.selectionDragPointer = { x: event.x, y: event.y }
        state.selectionAutoScrollDirection = direction
        if (state.selectionAutoScrollTimer) return
        const timer = setInterval(() => state.autoScrollSelection(), 50)
        timer.unref()
        state.selectionAutoScrollTimer = timer
        this.selectionTimer = timer
      },
    )
    bind("autoScrollSelection", (original) => () => {
      const state = renderer as unknown as {
        selectionAnchor?: SelectionPoint
        selectionDragPointer?: { x: number; y: number }
        selectionAutoScrollDirection: number
        stopSelectionAutoScroll(): void
        updateSelectionFocus(point: SelectionPoint): void
      }
      if (
        !this.ownsRenderer(renderer) ||
        state.selectionAnchor?.scrollView !== this.transcript
      )
        return original.call(renderer)
      const pointer = state.selectionDragPointer
      const direction = state.selectionAutoScrollDirection
      if (!pointer || !direction) return state.stopSelectionAutoScroll()
      if (this.transcript.scrollBy(direction) === direction)
        return state.stopSelectionAutoScroll()
      state.updateSelectionFocus(this.pointAt(pointer.x, pointer.y))
      renderer.requestRender()
    })
    bind(
      "getActiveSelectionText",
      (original) => () =>
        this.ownsRenderer(renderer)
          ? (this.selectedText(renderer) ?? original.call(renderer))
          : original.call(renderer),
    )
    bind(
      "applySelection",
      (original) => (screen: string[], layout: unknown) => {
        const anchor = rendererSelection(renderer, "selectionAnchor")
        const focus = rendererSelection(renderer, "selectionFocus")
        if (
          !this.ownsRenderer(renderer) ||
          anchor?.scrollView !== this.transcript ||
          focus?.scrollView !== this.transcript
        )
          return original.call(renderer, screen, layout)
        const target = renderer as unknown as Record<string, unknown>
        try {
          const highlighted = [...screen]
          for (const interval of this.intervals) {
            const sourceStart = interval.leaf.start + interval.start
            target["selectionAnchor"] = {
              ...anchor,
              row: anchor.row - sourceStart,
              scrollView: undefined,
            }
            target["selectionFocus"] = {
              ...focus,
              row: focus.row - sourceStart,
              scrollView: undefined,
            }
            const rows = original.call(
              renderer,
              screen.slice(
                interval.top,
                interval.top + interval.end - interval.start,
              ),
              layout,
            ) as string[]
            highlighted.splice(interval.top, rows.length, ...rows)
          }
          return highlighted
        } finally {
          target["selectionAnchor"] = anchor
          target["selectionFocus"] = focus
        }
      },
    )
  }

  private unbindRenderer() {
    const renderer = this.boundRenderer
    if (!renderer) return
    if (this.selectionTimer) {
      clearInterval(this.selectionTimer)
      const state = renderer as unknown as {
        selectionAutoScrollTimer?: NodeJS.Timeout
      }
      if (state.selectionAutoScrollTimer === this.selectionTimer)
        delete state.selectionAutoScrollTimer
      this.selectionTimer = undefined
    }
    for (const [name, method] of this.rendererMethods) {
      const target = renderer as unknown as Record<string, unknown>
      if (target[name] !== method.wrapped) continue
      if (method.descriptor)
        Object.defineProperty(renderer, name, method.descriptor)
      else delete target[name]
    }
    this.rendererMethods.clear()
    this.boundRenderer = undefined
  }

  static current(host: InteractiveMode): NativeChatHost | undefined {
    return active.get(host)
  }

  rebaseRelationships() {
    if (!this.active) return
    this.indexBranch()
    this.restoreRelationships()
    this.clearChatSelection()
  }

  beginProviderRequest() {
    this.providerPhases.beginRequest()
  }

  observeProviderEvent(event: unknown) {
    this.providerPhases.observe(event)
  }

  private applyProviderPhases(owner: Occurrence) {
    if (owner.message?.role !== "assistant") return
    const phases = new Map<number, "commentary" | "final_answer">()
    for (let index = 0; index < owner.message.content.length; index++) {
      const part = owner.message.content[index]
      if (part?.type !== "text") continue
      const phase = this.providerPhases.phaseFor(index, part)
      if (phase) phases.set(index, phase)
    }
    this.work.reconcilePhases(
      owner,
      phases,
      this.providerPhases.hasPhaseEvidence(),
    )
  }

  private restoreRelationships() {
    this.work.restore(
      this.relationships.active(this.host.sessionManager.getBranch()),
      (id) => this.byEntryId.get(id),
    )
  }

  private recordRelationship(fact: RelationshipFact) {
    try {
      this.relationships.record(fact)
    } catch (error) {
      if (!this.relationshipWriteFailed) {
        this.relationshipWriteFailed = true
        this.host.showError?.(
          error instanceof Error ? error.message : String(error),
        )
      }
      throw error
    }
  }

  private clearHistorical() {
    for (const [id, components] of this.historical) {
      const owned = new Set(components)
      const owner = this.byEntryId.get(id)
      if (owner?.component && owned.has(owner.component)) delete owner.component
      for (const part of new Set(owner?.parts.values() ?? [])) {
        if (part.component && owned.has(part.component)) delete part.component
        this.thoughts.delete(part)
        this.groups.delete(part)
      }
      for (const component of components) {
        if (this.assistantMethods.has(component as NativeAssistant))
          this.releaseAssistant(component as NativeAssistant)
        this.byComponent.delete(component)
        this.toolFocus.delete(component)
      }
    }
    this.historical.clear()
  }

  private indexBranch() {
    const branch = this.host.sessionManager.getBranch()
    const previous = this.indexedIds.join("\0")
    const common = Math.min(this.indexedIds.length, branch.length)
    if (
      this.indexedIds.some(
        (id, index) => index < common && id !== branch[index]?.id,
      ) ||
      branch.length < this.indexedIds.length
    ) {
      this.clearHistorical()
      this.byEntryId.clear()
      this.projections.clear()
      this.indexedIds = []
      this.sourceRanks.clear()
      this.sourceZones.clear()
      this.lastSourceZone = 0
    }
    for (let index = this.indexedIds.length; index < branch.length; index++) {
      const entry = branch[index]!
      this.indexEntry(entry)
      if (!this.byEntryId.has(entry.id))
        this.byEntryId.set(entry.id, this.newOccurrence(entry))
    }
    if (this.indexedIds.join("\0") !== previous) this.sourceRevision++
  }

  private indexEntry(entry: Entry) {
    const zones: number[] = []
    if (entry.type === "message" && entry.message.role === "assistant") {
      for (const [index, part] of entry.message.content.entries()) {
        if (
          (part.type === "text" && part.text.trim()) ||
          (part.type === "thinking" && part.thinking.trim())
        )
          this.lastSourceZone++
        else if (part.type === "toolCall") zones[index] = this.lastSourceZone
      }
    } else if (
      entry.type === "compaction" ||
      entry.type === "branch_summary" ||
      (entry.type === "message" &&
        (entry.message.role === "user" ||
          entry.message.role === "bashExecution" ||
          (entry.message.role === "custom" && entry.message.display))) ||
      (entry.type === "custom_message" && entry.display)
    )
      this.lastSourceZone++
    this.sourceRanks.set(entry.id, this.indexedIds.length)
    if (zones.length) this.sourceZones.set(entry.id, zones)
    this.indexedIds.push(entry.id)
  }

  private recordNative(component: Component) {
    if (!this.byComponent.has(component)) this.associate(component)
  }

  private newOccurrence(entry?: Entry): Occurrence {
    const occurrence: Occurrence = {
      entry,
      message: undefined,
      parts: new Map(),
    }
    this.occurrences.push(occurrence)
    return occurrence
  }

  private forEntry(entry: Entry): Occurrence {
    let occurrence = this.byEntryId.get(entry.id)
    if (!occurrence) {
      occurrence = this.newOccurrence(entry)
      this.byEntryId.set(entry.id, occurrence)
    }
    return occurrence
  }

  private forProjectedItem(entry: Entry, ordinal: number): Occurrence {
    let items = this.projections.get(entry.id)
    if (!items) {
      items = new Map()
      this.projections.set(entry.id, items)
    }
    let occurrence = items.get(ordinal)
    if (!occurrence) {
      occurrence =
        ordinal === 0 ? this.forEntry(entry) : this.newOccurrence(entry)
      occurrence.itemOrdinal = ordinal
      items.set(ordinal, occurrence)
    }
    return occurrence
  }

  private forMessage(message: Message): Occurrence {
    let occurrence = this.liveMessages.get(message)
    if (!occurrence) {
      occurrence = this.newOccurrence()
      this.liveMessages.set(message, occurrence)
    }
    occurrence.message = message
    return occurrence
  }

  private withSource<T>(source: Occurrence | undefined, work: () => T): T {
    const previous = this.source
    this.source = source
    try {
      return work()
    } finally {
      this.source = previous
    }
  }

  private associate(component: Component) {
    if (!this.active || !this.source) return
    if (
      this.source.message?.role === "assistant" &&
      "contentContainer" in component
    ) {
      this.source.component = component
      this.byComponent.set(component, this.source)
      this.bindAssistant(component as NativeAssistant, this.source)
    } else if (
      "toolCallId" in component &&
      typeof component.toolCallId === "string" &&
      this.source.message?.role === "assistant"
    ) {
      const index = this.source.message.content.findIndex(
        (part) => part.type === "toolCall" && part.id === component.toolCallId,
      )
      if (index >= 0) this.bindPart(this.source, index, component)
    } else {
      const notice = this.newOccurrence(this.source.entry)
      notice.parent = this.source
      notice.message = this.source.message
      if (this.source.itemOrdinal !== undefined)
        notice.itemOrdinal = this.source.itemOrdinal
      notice.component = component
      this.byComponent.set(component, notice)
    }
  }

  private bindPart(owner: Occurrence, index: number, component: Component) {
    let part = owner.parts.get(index)
    if (!part) {
      part = this.newOccurrence(owner.entry)
      part.parent = owner
      part.contentIndex = index
      owner.parts.set(index, part)
    }
    this.thoughts.delete(part)
    delete part.contentIndices
    if (
      part.component &&
      part.component !== component &&
      this.byComponent.get(part.component) === part
    ) {
      this.byComponent.delete(part.component)
    }
    part.message = owner.message
    part.component = component
    this.byComponent.set(component, part)
  }

  private bindThinkingRun(
    owner: Occurrence,
    start: number,
    end: number,
    component: Component,
  ) {
    const part = owner.parts.get(start) ?? this.newOccurrence(owner.entry)
    if (
      part.component &&
      part.component !== component &&
      this.byComponent.get(part.component) === part
    ) {
      this.byComponent.delete(part.component)
    }
    part.parent = owner
    part.contentIndex = start
    part.contentIndices = Array.from(
      { length: end - start + 1 },
      (_, offset) => start + offset,
    )
    part.message = owner.message
    part.component = component
    for (let index = start; index <= end; index++) owner.parts.set(index, part)
    this.byComponent.set(component, part)
    let thought = this.thoughts.get(part)
    if (!thought) {
      thought = new Thought(this, part)
      this.thoughts.set(part, thought)
    }
    thought.live = part.contentIndices.some((index) =>
      this.thinkingParts.get(owner)?.has(index),
    )
    thought.bind(
      component,
      Boolean((owner.component as NativeAssistant | undefined)?.isStreaming),
    )
  }

  private bindAssistant(component: NativeAssistant, owner: Occurrence) {
    const isActive = () => this.active
    const bind = () => {
      if (!this.active || owner.message?.role !== "assistant") return
      const previousParts = new Set(owner.parts.values())
      // Adjacent thinking indices alias one run; a replacement can split them.
      for (const [index, part] of owner.parts) {
        if (part.contentIndices && index !== part.contentIndex)
          owner.parts.delete(index)
      }
      const oldChildren = this.assistantChildren.get(component)
      const oldIndices = this.assistantIndices.get(component)
      if (oldChildren) {
        for (const child of oldChildren) {
          this.byComponent.delete(child)
          for (const index of oldIndices ?? []) {
            const part = owner.parts.get(index)
            if (part?.component === child) {
              delete part.component
              part.message = owner.message
            }
          }
        }
      }
      const bound = new Set<Component>()
      const boundIndices = new Set<number>()
      const content = owner.message.content
      const children = component.contentContainer.children
      let child = content.some(
        (part) =>
          (part.type === "text" && part.text.trim()) ||
          (part.type === "thinking" && part.thinking.trim()),
      )
        ? 1
        : 0
      for (let index = 0; index < content.length; index++) {
        const part = content[index]!
        if (part.type === "text" && part.text.trim()) {
          if (children[child]) {
            this.bindPart(owner, index, children[child]!)
            bound.add(children[child]!)
            boundIndices.add(index)
          }
          child++
        } else if (part.type === "thinking") {
          const start = index
          let visible = false
          while (
            index < content.length &&
            content[index]?.type === "thinking"
          ) {
            const thinkingPart = content[index]
            if (thinkingPart?.type === "thinking")
              visible ||= Boolean(thinkingPart.thinking.trim())
            index++
          }
          index--
          if (visible) {
            if (children[child]) {
              this.bindThinkingRun(owner, start, index, children[child]!)
              bound.add(children[child]!)
              for (let partIndex = start; partIndex <= index; partIndex++)
                boundIndices.add(partIndex)
            }
            child++
            if (
              content
                .slice(index + 1)
                .some(
                  (next) =>
                    (next.type === "text" && next.text.trim()) ||
                    (next.type === "thinking" && next.thinking.trim()),
                )
            )
              child++
          }
        }
      }
      for (const index of oldIndices ?? []) {
        if (!boundIndices.has(index)) owner.parts.delete(index)
      }
      const retainedParts = new Set(owner.parts.values())
      for (const part of previousParts) {
        if (!retainedParts.has(part)) this.thoughts.delete(part)
      }
      this.assistantChildren.set(component, bound)
      this.assistantIndices.set(component, boundIndices)
    }
    const previous = component.updateContent
    if (!this.assistantMethods.has(component)) {
      const descriptor = Object.getOwnPropertyDescriptor(
        component,
        "updateContent",
      )
      const wrapped = function (
        this: NativeAssistant,
        message: Message,
        streaming?: boolean,
      ) {
        previous.call(this, message, streaming)
        if (!isActive()) return
        owner.message = message
        bind()
      }
      component.updateContent = wrapped
      this.assistantMethods.set(component, {
        original: previous,
        wrapped,
        ...(descriptor ? { descriptor } : {}),
      })
    }
    bind()
  }

  private releaseAssistant(component: NativeAssistant) {
    const methods = this.assistantMethods.get(component)
    if (!methods) return
    if (component.updateContent === methods.wrapped) {
      if (methods.descriptor)
        Object.defineProperty(component, "updateContent", methods.descriptor)
      else
        delete (component as unknown as Record<string, unknown>)[
          "updateContent"
        ]
    }
    for (const child of this.assistantChildren.get(component) ?? [])
      this.byComponent.delete(child)
    this.assistantChildren.delete(component)
    this.assistantIndices.delete(component)
    this.assistantMethods.delete(component)
  }

  private wrapNativeConstruction() {
    const host = this.host
    const observe = (target: object, name: string, kind: DeliveryKind) => {
      const methods = target as Record<
        string,
        (...args: unknown[]) => Message[]
      >
      const original = methods[name]!
      const descriptor = Object.getOwnPropertyDescriptor(target, name)
      const record = (messages: Message[]) => {
        if (this.active) this.work.observe(messages, kind)
      }
      const wrapped = function (this: unknown, ...args: unknown[]) {
        const messages = original.apply(this, args)
        record(messages)
        return messages
      }
      methods[name] = wrapped
      this.deliveryCleanup.push(() => {
        if (methods[name] !== wrapped) return
        if (descriptor) Object.defineProperty(target, name, descriptor)
        else delete methods[name]
      })
    }
    observe(host.session.agent, "normalizePromptInput", "initial")
    observe(host.session.agent.steeringQueue, "drain", "steering")
    observe(host.session.agent.followUpQueue, "drain", "follow-up")
    const wrap = (
      name: string,
      make: (
        original: (...args: never[]) => unknown,
      ) => (...args: never[]) => unknown,
    ) => {
      const original = (
        host as unknown as Record<string, (...args: never[]) => unknown>
      )[name]!
      const implementation = make(original)
      const wrapped = (...args: never[]) =>
        this.active ? implementation(...args) : original.apply(host, args)
      this.originals.set(name, original)
      this.wrappers.set(name, wrapped)
      this.ownDescriptors.set(name, Object.getOwnPropertyDescriptor(host, name))
      Object.defineProperty(host, name, {
        configurable: true,
        writable: true,
        value: wrapped,
      })
    }
    for (const name of ["addChild", "removeChild", "clear"] as const) {
      const original = host.chatContainer[name] as (...args: never[]) => unknown
      this.chatMethods.set(name, original)
      this.chatDescriptors.set(
        name,
        Object.getOwnPropertyDescriptor(host.chatContainer, name),
      )
      if (name === "addChild") {
        const wrapped = ((component: Component) => {
          original.call(host.chatContainer, component as never)
          if (this.active) this.recordNative(component)
        }) as typeof host.chatContainer.addChild
        host.chatContainer.addChild = wrapped
        this.chatWrappers.set(name, wrapped as (...args: never[]) => unknown)
      } else {
        const wrapped = (...args: never[]) => {
          const result = original.apply(host.chatContainer, args)
          if (!this.active) return result
          if (name === "clear") {
            this.clearHistorical()
            for (const component of this.assistantMethods.keys())
              this.releaseAssistant(component)
            this.occurrences.length = 0
            this.byEntryId.clear()
            this.projections.clear()
            this.indexedIds = []
            this.sourceRanks.clear()
            this.sourceZones.clear()
            this.lastSourceZone = 0
            this.byComponent.clear()
            this.thoughts.clear()
            this.thinkingParts.clear()
            this.groups.clear()
            this.toolFocus.clear()
            this.visibleDisclosures = []
            this.streaming = undefined
          } else {
            const component = args[0] as Component | undefined
            if (component) {
              if (this.assistantMethods.has(component as NativeAssistant))
                this.releaseAssistant(component as NativeAssistant)
              const occurrence = this.byComponent.get(component)
              if (occurrence?.component === component)
                delete occurrence.component
              this.byComponent.delete(component)
            }
          }
          return result
        }
        ;(host.chatContainer as unknown as Record<string, unknown>)[name] =
          wrapped
        this.chatWrappers.set(name, wrapped)
      }
    }
    wrap(
      "addMessageToChat",
      (original) => (message: Message, options?: unknown) => {
        const owner = this.source ?? this.forMessage(message)
        owner.message = message
        const before = host.chatContainer.children.length
        return this.withSource(owner, () => {
          const result = original.call(host, message as never, options as never)
          for (const child of host.chatContainer.children.slice(before)) {
            if ("contentContainer" in child)
              this.bindAssistant(child as NativeAssistant, owner)
          }
          const added = host.chatContainer.children.slice(before)
          if (added.length && message.role !== "assistant") {
            const presenter = added.at(-1)!
            owner.component = presenter
            this.byComponent.set(presenter, owner)
          }
          return result
        })
      },
    )
    wrap("mountInteractiveTui", (original) => (...args: unknown[]) => {
      const result = original.apply(host, args as never[])
      this.bindRenderer()
      return result
    })
    wrap("setToolsExpanded", (original) => (expanded: boolean) => {
      const result = original.call(host, expanded as never)
      for (const components of this.historical.values())
        for (const component of components)
          if (component instanceof ToolExecutionComponent)
            component.setExpanded(expanded)
      for (const group of this.groups.values()) group.expanded = expanded
      this.clearSelection(host.renderer as unknown as TuiAltScreen)
      ;(host.renderer as unknown as TuiAltScreen).requestRender()
      return result
    })
    wrap(
      "renderSessionEntries",
      () => (entries: Entry[], options?: unknown) => {
        this.indexBranch()
        const pairs = entries.flatMap((entry) => {
          const items =
            entry.type === "custom" ||
            (entry.type === "usage" && entry.kind === "cache_warm")
              ? [entry]
              : sessionEntryToContextMessages(entry as never)
          const projected =
            (entry.type === "compaction" || entry.type === "branch_summary") &&
            entry.usage &&
            items.length
              ? [
                  ...items,
                  {
                    type: "compaction_cost",
                    kind: entry.type,
                    usage: entry.usage,
                  },
                ]
              : items
          return projected.map((item, ordinal) => ({
            item,
            owner: this.forProjectedItem(entry, ordinal),
          }))
        })
        const setSource = (owner: Occurrence) => {
          this.source = owner
        }
        function* scopedItems() {
          for (const { item, owner } of pairs) {
            if (typeof item === "object" && item && "role" in item)
              owner.message = item as Message
            setSource(owner)
            yield item
          }
        }
        const previous = this.source
        try {
          return host.renderSessionItems(scopedItems(), options)
        } finally {
          this.source = previous
        }
      },
    )
    wrap("addCustomEntryToChat", (original) => (entry: Entry) => {
      const before = new Set(host.chatContainer.children)
      const result = original.call(host, entry as never)
      for (const child of host.chatContainer.children) {
        if (!before.has(child)) this.recordNative(child)
      }
      return result
    })
    wrap(
      "handleEvent",
      (original) =>
        (event: {
          type: string
          message?: Message
          entry?: Entry
          assistantMessageEvent?: { type: string; contentIndex?: number }
        }) => {
          let owner: Occurrence | undefined
          if (
            event.type === "message_end" &&
            event.message?.role === "toolResult"
          ) {
            const component = host.pendingTools.get(event.message.toolCallId)
            if (component) this.toolResults.set(event.message, component)
          }
          if (event.entry) owner = this.forEntry(event.entry)
          else if (event.message) {
            owner =
              event.type === "message_end" &&
              event.message.role === "user" &&
              this.deliveringUser
                ? this.deliveringUser
                : event.type === "message_start" ||
                    event.message.role !== "assistant"
                  ? this.forMessage(event.message)
                  : (this.streaming ?? this.forMessage(event.message))
            owner.message = event.message
            this.liveMessages.set(event.message, owner)
          }
          if (event.type === "message_start" && owner) {
            const previous = this.work.start(owner)
            if (previous) this.recordRelationship(previous)
            if (event.message?.role === "user") this.deliveringUser = owner
            if (event.message?.role === "assistant") this.streaming = owner
          }
          if (owner && event.message?.role === "assistant") {
            const index = event.assistantMessageEvent?.contentIndex
            if (event.type === "message_update" && index !== undefined)
              this.providerPhases.bindNormalized(
                index,
                event.message.content[index],
              )
            this.applyProviderPhases(owner)
          }
          if (event.type === "agent_settled") {
            const settled = this.work.settle(
              host.session._agentRunAbortRequested,
            )
            if (settled) this.recordRelationship(settled)
            ;(host.renderer as unknown as TuiAltScreen).requestRender()
          }
          if (owner && event.message?.role === "assistant") {
            const update = event.assistantMessageEvent
            if (event.type === "message_end") this.thinkingParts.delete(owner)
            else if (update?.contentIndex !== undefined) {
              let parts = this.thinkingParts.get(owner)
              if (!parts) {
                parts = new Set()
                this.thinkingParts.set(owner, parts)
              }
              if (
                update.type === "thinking_start" ||
                update.type === "thinking_delta"
              )
                parts.add(update.contentIndex)
              else if (update.type === "thinking_end")
                parts.delete(update.contentIndex)
            }
          }
          const result = this.withSource(owner, () =>
            original.call(host, event as never),
          )
          if (
            event.message?.role === "assistant" &&
            host.streamingComponent &&
            owner
          ) {
            this.bindAssistant(host.streamingComponent, owner)
          }
          if (
            event.type === "message_end" &&
            event.message?.role === "assistant" &&
            this.streaming === owner
          )
            this.streaming = undefined
          if (event.type === "message_end" && event.message?.role === "user")
            this.deliveringUser = undefined
          if (event.message) this.sourceRevision++
          return result
        },
    )
    const session = host.session
    const record = session.recordBashResult
    this.originals.set(
      "recordBashResult",
      record as (...args: never[]) => unknown,
    )
    this.ownDescriptors.set(
      "recordBashResult",
      Object.getOwnPropertyDescriptor(session, "recordBashResult"),
    )
    const wrappedRecord = (...args: unknown[]) => {
      const before = session._pendingBashMessages.length
      const result = record.apply(session, args)
      if (!this.active) return result
      const component = host.bashComponent ?? host.pendingBashComponents.at(-1)
      const pending = session._pendingBashMessages[before]
      if (component && pending) this.bashMessages.set(pending, component)
      return result
    }
    session.recordBashResult = wrappedRecord
    this.wrappers.set(
      "recordBashResult",
      wrappedRecord as (...args: never[]) => unknown,
    )

    const manager = host.sessionManager
    const appendEntry = (
      manager as unknown as { _appendEntry(entry: Entry): void }
    )._appendEntry
    this.originals.set(
      "_appendEntry",
      appendEntry as (...args: never[]) => unknown,
    )
    this.ownDescriptors.set(
      "_appendEntry",
      Object.getOwnPropertyDescriptor(manager, "_appendEntry"),
    )
    const wrappedAppendEntry = (entry: Entry) => {
      appendEntry.call(manager, entry)
      if (!this.active) return
      if (entry.parentId === (this.indexedIds.at(-1) ?? null)) {
        this.indexEntry(entry)
        this.forEntry(entry)
        this.sourceRevision++
      } else this.indexBranch()
    }
    ;(manager as unknown as { _appendEntry(entry: Entry): void })._appendEntry =
      wrappedAppendEntry
    this.wrappers.set(
      "_appendEntry",
      wrappedAppendEntry as (...args: never[]) => unknown,
    )
    const appendMessage = manager.appendMessage
    this.originals.set(
      "appendMessage",
      appendMessage as (...args: never[]) => unknown,
    )
    this.ownDescriptors.set(
      "appendMessage",
      Object.getOwnPropertyDescriptor(manager, "appendMessage"),
    )
    const wrappedAppendMessage: typeof manager.appendMessage = (message) => {
      const id = appendMessage.call(manager, message)
      if (!this.active || message.role !== "bashExecution") return id
      const entry = manager.getEntry(id)
      const component = this.bashMessages.get(message) ?? host.bashComponent
      if (entry && component) {
        const owner = this.forEntry(entry)
        owner.message = message
        owner.component = component
        this.byComponent.set(component, owner)
      }
      return id
    }
    manager.appendMessage = wrappedAppendMessage
    this.wrappers.set(
      "appendMessage",
      wrappedAppendMessage as (...args: never[]) => unknown,
    )

    const appendCustom = session._appendCustomMessage
    this.originals.set(
      "_appendCustomMessage",
      appendCustom as (...args: never[]) => unknown,
    )
    this.ownDescriptors.set(
      "_appendCustomMessage",
      Object.getOwnPropertyDescriptor(session, "_appendCustomMessage"),
    )
    const wrappedAppendCustom = (message: Message) => {
      if (!this.active) return appendCustom.call(session, message)
      const originalAppend = manager.appendCustomMessageEntry
      const previous = Object.getOwnPropertyDescriptor(
        manager,
        "appendCustomMessageEntry",
      )
      const scopedAppend: typeof manager.appendCustomMessageEntry = (
        ...args
      ) => {
        const id = originalAppend.apply(manager, args)
        const entry = manager.getEntry(id)
        if (entry) {
          const owner = this.forEntry(entry)
          owner.message = message
          this.liveMessages.set(message, owner)
        }
        return id
      }
      manager.appendCustomMessageEntry = scopedAppend
      try {
        return appendCustom.call(session, message)
      } finally {
        if (manager.appendCustomMessageEntry === scopedAppend) {
          if (previous)
            Object.defineProperty(manager, "appendCustomMessageEntry", previous)
          else
            delete (manager as unknown as Record<string, unknown>)[
              "appendCustomMessageEntry"
            ]
        }
      }
    }
    session._appendCustomMessage = wrappedAppendCustom
    this.wrappers.set(
      "_appendCustomMessage",
      wrappedAppendCustom as (...args: never[]) => unknown,
    )
  }

  private promotePersistedMessage(event: unknown) {
    if (
      !this.active ||
      !event ||
      typeof event !== "object" ||
      !("type" in event) ||
      event.type !== "message_end" ||
      !("message" in event)
    )
      return
    const message = event.message as Message
    const id = this.host.session._entryIdsByMessage.get(message)
    if (!id) return
    const entry = this.host.sessionManager.getEntry(id)
    if (!entry) return
    const occurrence = this.liveMessages.get(message)
    if (occurrence) {
      occurrence.entry = entry
      this.byEntryId.set(id, occurrence)
      for (const part of occurrence.parts.values()) part.entry = entry
      const relationship = this.work.committed(occurrence)
      if (relationship) this.recordRelationship(relationship)
      if (message.role === "assistant") {
        this.applyProviderPhases(occurrence)
        const work = this.work.find(occurrence)
        if (work?.request.entry) {
          for (let index = 0; index < message.content.length; index++) {
            const part = message.content[index]
            if (part?.type !== "text") continue
            const phase = this.providerPhases.phaseFor(index, part)
            if (phase)
              this.recordRelationship({
                version: 1,
                kind: "phase",
                requestId: work.request.entry.id,
                sourceId: id,
                contentIndex: index,
                phase,
              })
          }
        }
      }
    }
    const bash = this.bashMessages.get(message)
    if (bash) this.byComponent.set(bash, this.forEntry(entry))
    const tool = this.toolResults.get(message)
    const call = tool && this.byComponent.get(tool)
    if (call) {
      call.resultEntry = entry
      call.resultMessage = message
    }
  }

  dispose() {
    if (!this.active) return
    this.active = false
    this.unsubscribe?.()
    this.forkCleanup?.()
    for (const cleanup of this.deliveryCleanup) cleanup()
    this.deliveryCleanup.length = 0
    this.work.clear()
    this.unbindRenderer()
    for (const [name] of this.originals) {
      const target =
        name === "appendMessage" || name === "_appendEntry"
          ? this.host.sessionManager
          : name === "recordBashResult" || name === "_appendCustomMessage"
            ? this.host.session
            : this.host
      if (
        (target as unknown as Record<string, unknown>)[name] ===
        this.wrappers.get(name)
      ) {
        const descriptor = this.ownDescriptors.get(name)
        if (descriptor) Object.defineProperty(target, name, descriptor)
        else delete (target as unknown as Record<string, unknown>)[name]
      }
    }
    for (const [name] of this.chatMethods) {
      if (
        (this.host.chatContainer as unknown as Record<string, unknown>)[
          name
        ] === this.chatWrappers.get(name)
      ) {
        const descriptor = this.chatDescriptors.get(name)
        if (descriptor)
          Object.defineProperty(this.host.chatContainer, name, descriptor)
        else
          delete (
            this.host.chatContainer as unknown as Record<string, unknown>
          )[name]
      }
    }
    for (const component of this.assistantMethods.keys())
      this.releaseAssistant(component)
    this.assistantChildren.clear()
    this.assistantIndices.clear()
    if (this.host.fullscreenLayoutRoot === this.root)
      this.host.fullscreenLayoutRoot = this.oldRoot
    if (this.host.renderer.layoutRoot === this.root)
      this.host.renderer.setLayoutRoot(this.oldRoot)
    if (active.get(this.host as unknown as InteractiveMode) === this)
      active.delete(this.host as unknown as InteractiveMode)
    this.occurrences.length = 0
    this.leaves = []
    this.intervals = []
    this.painting.clear()
    this.clearHistorical()
    this.byEntryId.clear()
    this.byComponent.clear()
    this.thoughts.clear()
    this.thinkingParts.clear()
    this.groups.clear()
    this.toolFocus.clear()
    this.visibleDisclosures = []
    this.projections.clear()
    this.indexedIds = []
    this.sourceRanks.clear()
    this.sourceZones.clear()
  }
}

type Bootstrap = { renderer: unknown; install(host: InteractiveMode): void }
const pending = new Set<Bootstrap>()
let descriptor: PropertyDescriptor | undefined
let bootstrapWrapper: NativeMode["renderSessionEntries"] | undefined

export function armHistoryBootstrap(
  renderer: unknown,
  install: (host: InteractiveMode) => void,
) {
  const token: Bootstrap = { renderer, install }
  pending.add(token)
  if (!descriptor) {
    descriptor = Object.getOwnPropertyDescriptor(
      InteractiveMode.prototype,
      "renderSessionEntries",
    )
    if (!descriptor || typeof descriptor.value !== "function")
      throw new Error("pi-chat cannot observe Pi history construction")
    const original = descriptor.value as NativeMode["renderSessionEntries"]
    bootstrapWrapper = function (
      this: NativeMode,
      entries: Entry[],
      options?: unknown,
    ) {
      for (const candidate of pending) {
        if (
          this.session?.extensionRunner?.getEntryRenderer?.(
            "pi-chat.relationship",
          ) === candidate.renderer
        ) {
          try {
            candidate.install(this as unknown as InteractiveMode)
          } catch (error) {
            this.showError?.(
              `pi-chat: ${error instanceof Error ? error.message : String(error)}`,
            )
            return original.call(this, entries, options)
          } finally {
            disarmHistoryBootstrap(candidate)
          }
          return this.renderSessionEntries(entries, options)
        }
      }
      return original.call(this, entries, options)
    }
    Object.defineProperty(InteractiveMode.prototype, "renderSessionEntries", {
      ...descriptor,
      value: bootstrapWrapper,
    })
  }
  return () => disarmHistoryBootstrap(token)
}

function disarmHistoryBootstrap(token: Bootstrap) {
  pending.delete(token)
  if (pending.size === 0 && descriptor) {
    if (
      (InteractiveMode.prototype as unknown as NativeMode)
        .renderSessionEntries === bootstrapWrapper
    )
      Object.defineProperty(
        InteractiveMode.prototype,
        "renderSessionEntries",
        descriptor,
      )
    descriptor = undefined
    bootstrapWrapper = undefined
  }
}

export function captureHost(ctx: ExtensionContext): InteractiveMode {
  if (ctx.mode !== "tui") throw new Error("pi-chat requires Pi TUI mode")
  const prior = Object.getOwnPropertyDescriptor(
    InteractiveMode.prototype,
    "setExtensionWidget",
  )
  if (!prior || typeof prior.value !== "function")
    throw new Error("pi-chat cannot observe Pi widget host")
  let host: InteractiveMode | undefined
  Object.defineProperty(InteractiveMode.prototype, "setExtensionWidget", {
    ...prior,
    value: function (this: InteractiveMode, ...args: unknown[]) {
      // oxlint-disable-next-line typescript/no-this-alias -- The prototype observer must capture Pi's receiver.
      host = this
      Object.defineProperty(
        InteractiveMode.prototype,
        "setExtensionWidget",
        prior,
      )
      return prior.value.apply(this, args)
    },
  })
  try {
    ctx.ui.setWidget("pi-chat.host", undefined)
  } finally {
    Object.defineProperty(
      InteractiveMode.prototype,
      "setExtensionWidget",
      prior,
    )
  }
  if (
    !host ||
    (host as unknown as NativeMode).sessionManager !==
      (ctx.sessionManager as unknown)
  )
    throw new Error("pi-chat could not acquire this Pi session's host")
  return host
}
