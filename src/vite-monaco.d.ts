declare module "monaco-editor/features/register.all"
declare module "monaco-editor/languages/definitions/xml/register"
declare module "monaco-editor/editor/editor.worker?worker" {
  const W: new () => Worker
  export default W
}
