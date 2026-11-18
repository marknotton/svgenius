import { elementRanges, type TagRange } from "./markupMap"
import { convertToPath, duplicateElement, groupElements, moveElement, removeElement, ungroupElement } from "./markupEdit"
import { outlineStrokes } from "./outlineStroke"
import { SHAPES } from "./pathData"

// ── Things you can do to the selection in the editor ──────────────────────────
// Each action says when it applies and what it does. The toolbar, the
// right-click menus and the keyboard shortcuts are all built from this list,
// so a new tool is one new entry here.

export interface ActionContext {
  markup: string
  ranges: TagRange[]
  /** Parsed elements in tree order (the same numbering as ranges) */
  elements: Element[]
  /** Selected indices, sorted, with anything inside another selected element left out */
  selection: number[]
}

export interface ActionResult {
  markup: string
  /** What to select afterwards, as indices in the new markup */
  select?: number[]
  /** Something to tell the user, like why part of it was skipped */
  note?: string
}

export interface EditorAction {
  id: string
  label: string
  /** Shown in menus and tooltips, e.g. "⌘G" */
  shortcut?: string
  /** Matches the key press that runs it */
  keys?: (e: KeyboardEvent) => boolean
  /** Menus and the toolbar are split into these groups */
  group: "edit" | "arrange" | "convert"
  /** Shown on the toolbar as well as in menus */
  toolbar?: boolean
  danger?: boolean
  hint?: string
  applies: (ctx: ActionContext) => boolean
  run: (ctx: ActionContext) => ActionResult | { error: string } | null | Promise<ActionResult | { error: string } | null>
}

const mod = (e: KeyboardEvent) => e.metaKey || e.ctrlKey
const tag = (ctx: ActionContext, i: number) => ctx.elements[i]?.localName ?? ""
const startsToIndices = (markup: string, starts: number[]) => {
  const r = elementRanges(markup)
  return starts.map((s) => r.findIndex((x) => x.start === s)).filter((i) => i > 0)
}
/** The selection without the root svg */
const picked = (ctx: ActionContext) => ctx.selection.filter((i) => i > 0)

export const ACTIONS: EditorAction[] = [
  {
    id: "duplicate", label: "Duplicate", shortcut: "⌘D", group: "edit", toolbar: true,
    hint: "Copy the selection right after itself. Copied ids get a -2 suffix",
    keys: (e) => mod(e) && !e.shiftKey && e.key.toLowerCase() === "d",
    applies: (ctx) => picked(ctx).length > 0,
    run: (ctx) => {
      let markup = ctx.markup
      const starts: number[] = []
      for (const i of [...picked(ctx)].sort((a, b) => ctx.ranges[b].start - ctx.ranges[a].start)) {
        const r = elementRanges(markup)[i]
        const before = markup.length
        const out = duplicateElement(markup, r)
        const grown = out.markup.length - before
        // Copies made further down move along with this insertion
        for (let k = 0; k < starts.length; k++) if (starts[k] >= r.end) starts[k] += grown
        starts.push(out.start)
        markup = out.markup
      }
      return { markup, select: startsToIndices(markup, starts) }
    },
  },
  {
    id: "delete", label: "Delete", shortcut: "⌫", group: "edit", danger: true, toolbar: true,
    keys: (e) => !mod(e) && (e.key === "Delete" || e.key === "Backspace"),
    applies: (ctx) => picked(ctx).length > 0,
    run: (ctx) => {
      let markup = ctx.markup
      for (const i of [...picked(ctx)].sort((a, b) => b - a)) markup = removeElement(markup, elementRanges(markup)[i])
      return { markup, select: [] }
    },
  },
  {
    id: "group", label: "Group", shortcut: "⌘G", group: "arrange", toolbar: true,
    hint: "Wrap the selection in a <g>, where the first of them was",
    keys: (e) => mod(e) && !e.shiftKey && e.key.toLowerCase() === "g",
    applies: (ctx) => picked(ctx).length > 0,
    run: (ctx) => {
      const out = groupElements(ctx.markup, picked(ctx).map((i) => ctx.ranges[i]))
      return out && { markup: out.markup, select: startsToIndices(out.markup, [out.start]) }
    },
  },
  {
    id: "ungroup", label: "Ungroup", shortcut: "⇧⌘G", group: "arrange", toolbar: true,
    hint: "Take the children out of the group. Its transform and paint move down onto them",
    keys: (e) => mod(e) && e.shiftKey && e.key.toLowerCase() === "g",
    applies: (ctx) => picked(ctx).some((i) => tag(ctx, i) === "g"),
    run: (ctx) => {
      const groups = picked(ctx).filter((i) => tag(ctx, i) === "g").sort((a, b) => b - a)
      const index = new Map(ctx.elements.map((el, i) => [el, i]))
      let markup = ctx.markup
      const kidsOf: number[][] = []
      for (const gi of groups) {
        const el = ctx.elements[gi]
        const kids = [...el.children].map((c) => index.get(c) ?? -1).filter((k) => k >= 0)
        const ranges = elementRanges(markup)
        const out = ungroupElement(markup, ranges[gi], el, kids.map((k) => ranges[k]))
        if ("error" in out) return { error: out.error }
        markup = out.markup
        kidsOf.push(kids)
      }
      // Every element after a removed group moves up one place
      const removedBefore = (i: number) => groups.filter((g) => g < i).length
      return { markup, select: kidsOf.flat().map((k) => k - removedBefore(k)) }
    },
  },
  {
    id: "forward", label: "Bring forward", shortcut: "⌘]", group: "arrange",
    hint: "Paint it after the next element, so it sits on top",
    keys: (e) => mod(e) && e.key === "]",
    applies: (ctx) => picked(ctx).length === 1 && !!ctx.elements[picked(ctx)[0]]?.nextElementSibling,
    run: (ctx) => {
      const i = picked(ctx)[0]
      const next = ctx.elements.indexOf(ctx.elements[i].nextElementSibling as Element)
      const out = moveElement(ctx.markup, ctx.ranges[i], ctx.ranges[next], "after")
      return out && { markup: out.markup, select: startsToIndices(out.markup, [out.start]) }
    },
  },
  {
    id: "backward", label: "Send backward", shortcut: "⌘[", group: "arrange",
    hint: "Paint it before the previous element, so it sits underneath",
    keys: (e) => mod(e) && e.key === "[",
    applies: (ctx) => picked(ctx).length === 1 && !!ctx.elements[picked(ctx)[0]]?.previousElementSibling,
    run: (ctx) => {
      const i = picked(ctx)[0]
      const prev = ctx.elements.indexOf(ctx.elements[i].previousElementSibling as Element)
      const out = moveElement(ctx.markup, ctx.ranges[i], ctx.ranges[prev], "before")
      return out && { markup: out.markup, select: startsToIndices(out.markup, [out.start]) }
    },
  },
  {
    id: "toPath", label: "Convert to path", group: "convert", toolbar: true,
    hint: "Swap rectangles, circles, ellipses, lines and polygons for paths that draw the same thing",
    applies: (ctx) => picked(ctx).some((i) => SHAPES.has(tag(ctx, i))),
    run: (ctx) => {
      let markup = ctx.markup
      const doc = ctx.elements
      for (const i of picked(ctx).filter((i) => SHAPES.has(tag(ctx, i))).sort((a, b) => b - a)) {
        const out = convertToPath(markup, elementRanges(markup)[i], doc[i])
        if (out) markup = out
      }
      return { markup, select: ctx.selection }
    },
  },
  {
    id: "strokeToPath", label: "Stroke to path", group: "convert", toolbar: true,
    hint: "Turn strokes into filled outlines, so they scale and recolour like any other shape",
    applies: (ctx) => picked(ctx).some((i) => ["path", ...SHAPES].includes(tag(ctx, i))),
    run: async (ctx) => {
      const targets = picked(ctx).filter((i) => tag(ctx, i) === "path" || SHAPES.has(tag(ctx, i)))
      const out = await outlineStrokes(ctx.markup, ctx.ranges, targets)
      if (!out.done) return { error: out.skipped[0] ?? "Nothing in the selection has a stroke" }
      return { markup: out.markup, note: out.skipped.length ? `Skipped ${out.skipped.length}: ${out.skipped[0]}` : undefined }
    },
  },
]

/** Leaves out anything inside another selected element */
export function topLevel(selection: number[], elements: Element[]) {
  const set = new Set(selection.map((i) => elements[i]).filter(Boolean))
  return [...new Set(selection)].filter((i) => {
    for (let p = elements[i]?.parentElement; p; p = p.parentElement) if (set.has(p)) return false
    return !!elements[i]
  }).sort((a, b) => a - b)
}
