// ── Before / after SVGO, for a whole list of rules ────────────────────────────

type Stage = "before" | "after"

interface Props {
  stages: Stage[]
  onChange: (stage: Stage) => void
  hint: string
}

/** The stage most rules use, for new rules to inherit */
export const commonStage = (stages: Stage[]): Stage =>
  stages.filter((s) => s === "after").length > stages.length / 2 ? "after" : "before"

export function StageToggle({ stages, onChange, hint }: Props) {
  const mixed = stages.includes("before") && stages.includes("after")
  const current = commonStage(stages)
  return (
    <div className="segmented segmented--xs" role="radiogroup" aria-label="When rules run" title={hint}>
      {(["before", "after"] as const).map((s) => (
        <button key={s} type="button" role="radio" aria-checked={!mixed && current === s}
          className={`segmented__opt${!mixed && current === s ? " is-active" : ""}`}
          onClick={() => onChange(s)}>
          {s === "before" ? "Before SVGO" : "After SVGO"}
        </button>
      ))}
    </div>
  )
}
