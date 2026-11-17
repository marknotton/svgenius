// Example third-party SVGO plugin for SVGenius.
// Load it from the settings panel: Custom → Load plugin.
// Params (JSON), e.g. { "name": "data-icon", "value": "true" }

export default {
  name: "addRootAttribute",
  description: "Adds an attribute to the outer <svg> element",
  fn: (_root, params = {}) => {
    const name = params.name ?? "data-optimised"
    const value = params.value ?? "svgenius"
    return {
      element: {
        enter: (node, parent) => {
          if (node.name === "svg" && parent.type === "root") node.attributes[name] = String(value)
        }
      }
    }
  }
}
