import { elementRanges, type TagRange } from "./markupMap"
import { breakApart, convertToPath, duplicateElement, groupElements, moveElement, removeElement, ungroupElement } from "./markupEdit"
import { outlineStrokes } from "./outlineStroke"
import { SHAPES } from "./pathData"
import type { Command } from "./commands"
import { alignMoves, distributeMoves, pathfinder, PATHFINDER, type AlignMode, type DistributeMode, type Move } from "./arrange"
import { setAttrs, translateAttrs } from "./markupEdit"

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
  /** The menu / ⌘-shortcut command that runs it */
  command?: Command
  /** Plain key presses that run it (not ⌘ combinations, which are commands) */
  keys?: (e: KeyboardEvent) => boolean
  /** Menus and the toolbar are split into these groups */
  group: "edit" | "arrange" | "convert"
  /** Shown on the toolbar as well as in menus */
  toolbar?: boolean
  /** Lives in the Align / Pathfinder panel instead of the menus */
  panel?: "align" | "distribute" | "pathfinder"
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
    command: "duplicate",
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
    command: "group",
    applies: (ctx) => picked(ctx).length > 0,
    run: (ctx) => {
      const out = groupElements(ctx.markup, picked(ctx).map((i) => ctx.ranges[i]))
      return out && { markup: out.markup, select: startsToIndices(out.markup, [out.start]) }
    },
  },
  {
    id: "ungroup", label: "Ungroup", shortcut: "⇧⌘G", group: "arrange", toolbar: true,
    hint: "Take the children out of the group. Its transform and paint move down onto them",
    command: "ungroup",
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
    id: "breakApart", label: "Break apart", shortcut: "⇧⌘B", group: "arrange", toolbar: true, command: "breakApart",
    hint: "Split a path that draws several shapes into one path per shape, in a group. Holes become shapes of their own",
    applies: (ctx) => picked(ctx).some((i) => tag(ctx, i) === "path" && (ctx.elements[i].getAttribute("d")?.match(/[Mm]/g)?.length ?? 0) > 1),
    run: (ctx) => {
      let markup = ctx.markup
      let made = 0
      const targets = picked(ctx).filter((i) => tag(ctx, i) === "path").sort((a, b) => b - a)
      const groupStarts: number[] = []
      for (const i of targets) {
        const out = breakApart(markup, elementRanges(markup)[i], ctx.elements[i])
        if (!out) continue
        const grown = out.markup.length - markup.length
        for (let k = 0; k < groupStarts.length; k++) groupStarts[k] += grown
        groupStarts.push(out.start)
        markup = out.markup
        made++
      }
      if (!made) return { error: "Nothing to break apart: each path draws a single shape" }
      // Select the new parts, ready to move one by one
      const ranges = elementRanges(markup)
      const doc = new DOMParser().parseFromString(markup, "image/svg+xml")
      const els = [doc.documentElement, ...doc.documentElement.querySelectorAll("*")]
      const groups = groupStarts.map((s) => ranges.findIndex((x) => x.start === s))
      const select = groups.flatMap((g) => [...(els[g]?.children ?? [])].map((c) => els.indexOf(c)).filter((k) => k > 0 && els[k].localName === "path"))
      return { markup, select }
    },
  },
  {
    id: "forward", label: "Bring forward", shortcut: "⌘]", group: "arrange",
    hint: "Paint it after the next element, so it sits on top",
    command: "forward",
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
    command: "backward",
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

// ── Align, distribute, Pathfinder (the panel under the code) ──

/** Applies moves back to front, so earlier offsets stay put */
function applyMoves(ctx: ActionContext, moves: Move[]): ActionResult | { error: string } {
  if (!moves.length) return { error: "Already lined up" }
  let markup = ctx.markup
  for (const m of [...moves].sort((a, b) => b.index - a.index)) {
    const r = elementRanges(markup)[m.index], el = ctx.elements[m.index]
    if (r && el) markup = setAttrs(markup, r, translateAttrs(el, m.dx, m.dy))
  }
  return { markup, select: ctx.selection }
}

const ALIGN: { mode: AlignMode, label: string }[] = [
  { mode: "left", label: "Align left edges" }, { mode: "hcentre", label: "Align horizontal centres" }, { mode: "right", label: "Align right edges" },
  { mode: "top", label: "Align top edges" }, { mode: "vmiddle", label: "Align vertical centres" }, { mode: "bottom", label: "Align bottom edges" }
]
const DISTRIBUTE: { mode: DistributeMode, label: string, hint: string }[] = [
  { mode: "hcentres", label: "Distribute horizontal centres", hint: "Spread three or more evenly left to right by their centres. The outer two stay put" },
  { mode: "vcentres", label: "Distribute vertical centres", hint: "Spread three or more evenly top to bottom by their centres. The outer two stay put" },
  { mode: "hspace", label: "Distribute horizontal spacing", hint: "Make the gaps between three or more the same, left to right" },
  { mode: "vspace", label: "Distribute vertical spacing", hint: "Make the gaps between three or more the same, top to bottom" }
]

ACTIONS.push(
  ...ALIGN.map((a): EditorAction => ({
    id: `align-${a.mode}`, label: a.label, group: "arrange", panel: "align",
    hint: `${a.label}. One element lines up with the canvas, several with each other`,
    applies: (ctx) => picked(ctx).length > 0,
    run: (ctx) => applyMoves(ctx, alignMoves(ctx.markup, picked(ctx), a.mode))
  })),
  ...DISTRIBUTE.map((d): EditorAction => ({
    id: `distribute-${d.mode}`, label: d.label, group: "arrange", panel: "distribute", hint: d.hint,
    applies: (ctx) => picked(ctx).length > 2,
    run: (ctx) => applyMoves(ctx, distributeMoves(ctx.markup, picked(ctx), d.mode))
  })),
  ...PATHFINDER.map((p): EditorAction => ({
    id: `pathfinder-${p.op}`, label: p.label, group: "convert", panel: "pathfinder", hint: p.hint,
    applies: (ctx) => picked(ctx).filter((i) => tag(ctx, i) === "path" || SHAPES.has(tag(ctx, i))).length > 1,
    run: async (ctx) => {
      const out = await pathfinder(ctx.markup, ctx.ranges, picked(ctx), p.op)
      if ("error" in out) return out
      return { markup: out.markup, select: startsToIndices(out.markup, [out.start]) }
    }
  }))
)

/** Leaves out anything inside another selected element */
export function topLevel(selection: number[], elements: Element[]) {
  const set = new Set(selection.map((i) => elements[i]).filter(Boolean))
  return [...new Set(selection)].filter((i) => {
    for (let p = elements[i]?.parentElement; p; p = p.parentElement) if (set.has(p)) return false
    return !!elements[i]
  }).sort((a, b) => a - b)
}
