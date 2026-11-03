/**
 * Producción: las URLs del backend se leen en tiempo de ejecución de `config.js`
 * (ver public/config.js), así una misma compilación sirve para cualquier entorno.
 * Por defecto se usa el mismo dominio: nginx reenvía /api y /socket.io al backend.
 */
interface RuntimeConfig {
  apiUrl?: string;
  socketUrl?: string;
}

const runtime: RuntimeConfig =
  (globalThis as { __UML_STUDIO_CONFIG__?: RuntimeConfig }).__UML_STUDIO_CONFIG__ ?? {};

export const environment = {
  production: true,
  apiUrl: runtime.apiUrl || '/api',
  socketUrl: runtime.socketUrl || '/collaboration',
};
