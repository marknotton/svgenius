import type { Replacement } from "./types"

// ── Find & replace ────────────────────────────────────────────────────────────
// Plain string rules by default. Regex mode is opt-in per rule.

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export function buildPattern(rule: Replacement) {
  const flags = `${rule.replaceAll ? "g" : ""}${rule.caseSensitive ? "" : "i"}`
  return new RegExp(rule.regex ? rule.find : escapeRegExp(rule.find), flags)
}

/** null if fine, otherwise a human-readable reason */
export function ruleError(rule: Replacement) {
  if (!rule.find) return null
  try {
    buildPattern(rule)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid pattern"
  }
}

/** Applies every enabled rule for one stage, returning the new text and match count */
export function applyReplacements(svg: string, rules: Replacement[], stage: Replacement["stage"]) {
  let out = svg
  let count = 0
  rules.forEach((rule, i) => {
    if (!rule.enabled || !rule.find || rule.stage !== stage) return
    let pattern: RegExp
    try {
      pattern = buildPattern(rule)
    } catch (e) {
      throw new Error(`Find & replace rule ${i + 1}: ${e instanceof Error ? e.message : "invalid pattern"}`)
    }
    out = out.replace(pattern, (...args) => {
      count++
      if (!rule.regex) return rule.replace
      // Support $1, $<name> and $& in regex mode
      const match = args[0] as string
      const groups = typeof args[args.length - 1] === "object" ? args[args.length - 1] as Record<string, string> : undefined
      const subs = args.slice(1, groups ? -3 : -2) as string[]
      return rule.replace.replace(/\$(\d+|&|<([^>]+)>)/g, (tok, ref: string, name?: string) => {
        if (ref === "&") return match
        if (name !== undefined) return groups?.[name] ?? ""
        const n = Number(ref)
        return n >= 1 && n <= subs.length ? subs[n - 1] ?? "" : tok
      })
    })
  })
  return { out, count }
}
