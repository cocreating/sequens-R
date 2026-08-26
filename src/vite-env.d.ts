/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

declare module 'virtual:pwa-register' {
  export interface RegisterSWOptions {
    immediate?: boolean;
  }

  export function registerSW(options?: RegisterSWOptions): () => void;
}
