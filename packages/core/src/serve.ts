import type { CustomPlugin as SvgoCustomPlugin, optimize as svgoOptimize } from "svgo/browser"
import { attrRulesPlugin } from "./attrRules"
import { applyReplacements } from "./replace"
import { activeReplacements, sanitiseSvgoSettings, toSvgoConfig } from "./settings"

// ── Served optimisation ───────────────────────────────────────────────────────
// The text-only part of the pipeline: "before" replacements, attribute rules,
// SVGO, "after" replacements. It needs no DOM, so a server can run it (the
// Symbols plugin does, through Node, when it builds). Geometry steps such as
// trim, cut-outs and merging need a browser, so hosts apply those as edits.

type Optimize = typeof svgoOptimize

export interface ServeResult { data: string, replaced: number }

/** Optimises one SVG with a preset's settings. `optimize` is SVGO's, from whichever build suits the host */
export function serveSvg(svg: string, rawSettings: unknown, optimize: Optimize): ServeResult {
  const settings = sanitiseSvgoSettings(rawSettings)
  const before = { count: 0 }
  const after = { count: 0 }
  const rules = settings.attrRules.filter((r) => r.enabled)
  const rulesBefore = rules.filter((r) => r.stage === "before")
  const rulesAfter = rules.filter((r) => r.stage === "after")
  const base = toSvgoConfig(settings)
  const config = {
    ...base,
    plugins: [
      ...(rulesBefore.length ? [attrRulesPlugin(rulesBefore, before) as unknown as SvgoCustomPlugin] : []),
      ...(base.plugins ?? []),
      ...(rulesAfter.length ? [attrRulesPlugin(rulesAfter, after) as unknown as SvgoCustomPlugin] : [])
    ]
  }
  const replacements = activeReplacements(settings)
  const pre = applyReplacements(svg, replacements, "before")
  const optimised = optimize(pre.out, config).data
  const post = applyReplacements(optimised, replacements, "after")
  return { data: post.out, replaced: pre.count + post.count + before.count + after.count }
}
