// ── SVGO plugin catalogue ─────────────────────────────────────────────────────
// Order matters: SVGO runs plugins in the order they're listed. The first block
// mirrors SVGO 4's preset-default, the second is opt-in extras.

export interface PluginInfo {
  name: string
  label: string
  description: string
  defaultOn: boolean
  group: "default" | "extra"
}

const d = (name: string, label: string, description: string): PluginInfo =>
  ({ name, label, description, defaultOn: true, group: "default" })

const x = (name: string, label: string, description: string): PluginInfo =>
  ({ name, label, description, defaultOn: false, group: "extra" })

export const PLUGINS: PluginInfo[] = [
  d("removeDoctype", "Remove doctype", "Removes the <!DOCTYPE> declaration"),
  d("removeXMLProcInst", "Remove XML instructions", "Removes <?xml ?> processing instructions"),
  d("removeComments", "Remove comments", "Strips XML comments (keeps <!--! legal --> ones)"),
  d("removeDeprecatedAttrs", "Remove deprecated attributes", "Drops attributes deprecated in SVG 2"),
  d("removeMetadata", "Remove <metadata>", "Removes <metadata> elements"),
  d("removeEditorsNSData", "Remove editor data", "Strips Illustrator, Sketch, Inkscape etc. namespaces and data"),
  d("cleanupAttrs", "Clean up attribute whitespace", "Trims and collapses whitespace in attributes"),
  d("mergeStyles", "Merge styles", "Merges multiple <style> elements into one"),
  d("inlineStyles", "Inline styles", "Moves CSS rules from <style> onto the elements they match"),
  d("minifyStyles", "Minify styles", "Minifies <style> contents and removes unused rules"),
  d("cleanupIds", "Clean up IDs", "Removes unused IDs and shortens the ones that are used"),
  d("removeUselessDefs", "Remove unused defs", "Removes elements in <defs> that have no ID"),
  d("cleanupNumericValues", "Round numeric values", "Rounds numbers to the set precision and drops default px units"),
  d("convertColors", "Minify colours", "Converts colours to their shortest form, e.g. #ff0000 → red"),
  d("removeUnknownsAndDefaults", "Remove unknowns & defaults", "Removes unknown elements and attributes set to their default value"),
  d("removeNonInheritableGroupAttrs", "Remove non-inheritable group attributes", "Drops presentation attributes on groups that children can't inherit"),
  d("removeUselessStrokeAndFill", "Remove useless stroke & fill", "Removes stroke and fill attributes that have no effect"),
  d("cleanupEnableBackground", "Remove enable-background", "Removes or tidies the legacy enable-background attribute"),
  d("removeHiddenElems", "Remove hidden elements", "Removes elements that are hidden or zero-sized"),
  d("removeEmptyText", "Remove empty text", "Removes empty <text> elements"),
  d("convertShapeToPath", "Shapes to paths", "Converts basic shapes to more compact <path>s"),
  d("convertEllipseToCircle", "Ellipses to circles", "Converts non-eccentric <ellipse>s to <circle>s"),
  d("moveElemsAttrsToGroup", "Move attributes to parent group", "Moves attributes shared by all children up to their group"),
  d("moveGroupAttrsToElems", "Move group attributes to elements", "Moves some group attributes down to their content"),
  d("collapseGroups", "Collapse useless groups", "Removes groups that don't do anything"),
  d("convertPathData", "Round & rewrite paths", "Optimises path data: relative/absolute, shorthand, rounding"),
  d("convertTransform", "Round & rewrite transforms", "Collapses and shortens transform attributes"),
  d("removeEmptyAttrs", "Remove empty attributes", "Removes attributes with no value"),
  d("removeEmptyContainers", "Remove empty containers", "Removes empty groups, defs and the like"),
  d("mergePaths", "Merge paths", "Merges adjacent paths that share the same attributes"),
  d("removeUnusedNS", "Remove unused namespaces", "Removes namespace declarations that aren't used"),
  d("sortAttrs", "Sort attributes", "Sorts attributes so the file gzips better"),
  d("sortDefsChildren", "Sort defs children", "Sorts <defs> children so the file gzips better"),
  d("removeDesc", "Remove <desc>", "Removes <desc> elements (only if empty or editor-generated)"),

  x("removeTitle", "Remove <title>", "Removes <title>. Hurts accessibility for standalone SVGs"),
  x("removeViewBox", "Remove viewBox", "Removes viewBox when it matches width/height. Breaks scaling"),
  x("removeDimensions", "Remove width/height", "Removes width and height, keeping viewBox, so the SVG scales with CSS"),
  x("removeXMLNS", "Remove xmlns", "Removes the xmlns attribute. Only for SVGs inlined in HTML"),
  x("removeXlink", "Replace xlink", "Swaps xlink:href for plain href (SVG 2)"),
  x("removeScripts", "Remove scripts", "Removes <script> elements and on* event attributes"),
  x("removeStyleElement", "Remove <style>", "Removes <style> elements entirely"),
  x("removeRasterImages", "Remove raster images", "Removes embedded or linked bitmap images"),
  x("removeOffCanvasPaths", "Remove off-canvas paths", "Removes paths drawn entirely outside the viewBox"),
  x("convertStyleToAttrs", "Style to attributes", "Converts style=\"\" declarations to presentation attributes"),
  x("convertOneStopGradients", "Flatten one-stop gradients", "Replaces gradients with a single stop by a solid colour"),
  x("cleanupListOfValues", "Round lists of values", "Rounds numbers in viewBox, points and similar lists"),
  x("reusePaths", "Reuse duplicate paths", "Replaces duplicate paths with <use> references")
]

export const PLUGIN_NAMES = new Set(PLUGINS.map((p) => p.name))
