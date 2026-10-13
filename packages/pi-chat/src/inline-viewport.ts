import { Container, ScrollView, type Component } from "@earendil-works/pi-tui"

type Rows = {
  component: Component
  occurrence: object | undefined
  rows: string[]
  offset: number
}

export class InlineViewport {
  readonly scroll = new ScrollView(new Container(), {
    follow: "end",
    overscroll: "chain",
    scrollbar: "hidden",
  })
  top = 0
  private leaves: Rows[] = []

  update(leaves: Rows[], maxHeight: number, requestRender: () => void) {
    const following = this.scroll.isFollowingEnd
    const previousTop = this.scroll.scrollTop
    const anchor = this.leaves.find(
      (leaf) =>
        previousTop >= leaf.offset &&
        previousTop < leaf.offset + leaf.rows.length,
    )
    const anchorRow = anchor ? previousTop - anchor.offset : 0
    let height = 0
    for (const leaf of leaves) {
      leaf.offset = height
      height += leaf.rows.length
    }
    this.leaves = leaves
    this.scroll.updateLayout(height, Math.min(height, maxHeight), requestRender)
    if (following) return
    const next =
      anchor &&
      leaves.find((leaf) =>
        anchor.occurrence
          ? leaf.occurrence === anchor.occurrence
          : leaf.component === anchor.component,
      )
    this.scroll.scrollTo(
      next
        ? next.offset + Math.min(anchorRow, Math.max(0, next.rows.length - 1))
        : previousTop,
      { disableFollow: true },
    )
  }
}
