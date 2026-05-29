/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Comma-separated auth user UUIDs to hide from schedule artist filter / book dialog (e.g. admin-only owner). */
  readonly VITE_SCHEDULE_HIDDEN_ARTIST_IDS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
