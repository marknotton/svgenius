/// <reference types="vite/client" />

declare module "*.png" {
  const src: string
  export default src
}

/** package.json version, set by Vite */
declare const __APP_VERSION__: string
