// ── Editor tabs ───────────────────────────────────────────────────────────────
// The full editor and Quick Edit are two views of the same file. This switch
// sits in the same place in both, so moving between them feels like a tab.

export function EditorTabs({ value, onFull, onQuick }: { value: "full" | "quick", onFull?: () => void, onQuick?: () => void }) {
  return (
    <div className="editor-tabs" role="tablist" aria-label="Editor">
      <button role="tab" aria-selected={value === "full"} className={`editor-tabs__tab${value === "full" ? " is-on" : ""}`}
        onClick={value === "full" ? undefined : onFull} title="The full editor: layers, markup and path tools">Edit</button>
      <button role="tab" aria-selected={value === "quick"} className={`editor-tabs__tab${value === "quick" ? " is-on" : ""}`}
        onClick={value === "quick" ? undefined : onQuick} title="Quick Edit: place the artwork by steps or by hand over the grid (Space)">Quick Edit</button>
    </div>
  )
}
