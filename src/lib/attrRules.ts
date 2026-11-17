import type { AttrRule } from "./types"

// ── Attribute rules ───────────────────────────────────────────────────────────
// "When <elements> <condition> then <action>" recipes, run as an SVGO plugin
// either first (before SVGO's plugins) or last (after them).

export const CONDITIONS: Array<{ value: AttrRule["when"], label: string, needsAttr: boolean, needsValue: boolean }> = [
  { value: "always", label: "always", needsAttr: false, needsValue: false },
  { value: "has", label: "has attribute", needsAttr: true, needsValue: false },
  { value: "lacks", label: "lacks attribute", needsAttr: true, needsValue: false },
  { value: "equals", label: "attribute equals", needsAttr: true, needsValue: true },
  { value: "contains", label: "attribute contains", needsAttr: true, needsValue: true }
]

export const ACTIONS: Array<{ value: AttrRule["then"], label: string, needsAttr: boolean, valueLabel?: string }> = [
  { value: "set", label: "set attribute", needsAttr: true, valueLabel: "Value" },
  { value: "setIfMissing", label: "add if missing", needsAttr: true, valueLabel: "Value" },
  { value: "remove", label: "remove attribute", needsAttr: true },
  { value: "rename", label: "rename attribute", needsAttr: true, valueLabel: "New name" },
  { value: "removeElement", label: "remove element", needsAttr: false }
]

/** A rule with the bits it needs filled in */
export function isRuleReady(r: AttrRule) {
  const c = CONDITIONS.find((x) => x.value === r.when)
  const a = ACTIONS.find((x) => x.value === r.then)
  if (!c || !a) return false
  if (c.needsAttr && !r.whenAttr.trim()) return false
  if (a.needsAttr && !r.thenAttr.trim()) return false
  if (r.then === "rename" && !r.thenValue.trim()) return false
  return true
}

// ── SVGO plugin ───────────────────────────────────────────────────────────────

interface XastElement { type: "element", name: string, attributes: Record<string, string>, children: XastNode[] }
type XastNode = XastElement | { type: string, children?: XastNode[] }

const parseTargets = (s: string) => s.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean)

export function attrRulesPlugin(rules: AttrRule[], counter: { count: number }) {
  const ready = rules.filter((r) => r.enabled && isRuleReady(r)).map((r) => {
    const targets = parseTargets(r.targets)
    const fold = (s: string) => (r.caseSensitive ? s : s.toLowerCase())
    return {
      r,
      fold,
      targets: targets.length === 0 || targets.includes("*") ? null : new Set(targets.map(fold))
    }
  })

  return {
    name: "svgeniusAttrRules",
    fn: () => ({
      element: {
        enter: (node: XastElement, parent: XastElement) => {
          for (const { r, fold, targets } of ready) {
            if (targets && !targets.has(fold(node.name))) continue
            // Find the real attribute key, honouring case sensitivity
            const key = (name: string) => Object.keys(node.attributes).find((k) => fold(k) === fold(name.trim()))
            const condKey = r.whenAttr ? key(r.whenAttr) : undefined
            const condVal = condKey !== undefined ? node.attributes[condKey] : undefined
            const pass =
              r.when === "always" ? true
              : r.when === "has" ? condKey !== undefined
              : r.when === "lacks" ? condKey === undefined
              : r.when === "equals" ? condVal !== undefined && fold(condVal) === fold(r.whenValue)
              : condVal !== undefined && fold(condVal).includes(fold(r.whenValue))
            if (!pass) continue

            const target = r.thenAttr.trim()
            const existing = target ? key(target) : undefined
            switch (r.then) {
              case "set":
                if (existing !== undefined && node.attributes[existing] === r.thenValue) break
                if (existing !== undefined) delete node.attributes[existing]
                node.attributes[target] = r.thenValue
                counter.count++
                break
              case "setIfMissing":
                if (existing !== undefined) break
                node.attributes[target] = r.thenValue
                counter.count++
                break
              case "remove":
                if (existing === undefined) break
                delete node.attributes[existing]
                counter.count++
                break
              case "rename": {
                const to = r.thenValue.trim()
                if (existing === undefined || existing === to) break
                const value = node.attributes[existing]
                delete node.attributes[existing]
                node.attributes[to] = value
                counter.count++
                break
              }
              case "removeElement":
                if (parent.type === "element" || parent.type === "root") {
                  parent.children = parent.children.filter((c) => c !== node)
                  counter.count++
                }
                return
            }
          }
        }
      }
    })
  }
}
