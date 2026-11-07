/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** База API. По умолчанию относительный /api. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
