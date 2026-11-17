// ── SVG element names, most common first ──────────────────────────────────────

export const SVG_ELEMENTS = [
  "path", "g", "rect", "circle", "svg", "polygon", "line", "ellipse", "polyline",
  "use", "defs", "symbol", "text", "tspan", "linearGradient", "radialGradient", "stop",
  "clipPath", "mask", "pattern", "image", "style", "title", "desc", "metadata",
  "filter", "feGaussianBlur", "feOffset", "feColorMatrix", "feBlend", "feComposite",
  "feFlood", "feMerge", "feMergeNode", "feDropShadow", "feMorphology", "feTurbulence",
  "feDisplacementMap", "feComponentTransfer", "feFuncA", "feFuncR", "feFuncG", "feFuncB",
  "feImage", "feTile", "feConvolveMatrix", "feDiffuseLighting", "feSpecularLighting",
  "feDistantLight", "fePointLight", "feSpotLight",
  "marker", "a", "foreignObject", "textPath", "switch", "view",
  "animate", "animateTransform", "animateMotion", "set", "mpath", "script"
]

export const parseTargets = (s: string) => s.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean)
