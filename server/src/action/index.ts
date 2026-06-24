/**
 * action/ — the public API entry points. HTTP routes (httpApi) and the
 * WebSocket server (wsServer). Each only validates input, delegates to a
 * usecase, and serializes the result onto the wire. No business logic lives
 * here; the external REST/WS contract is owned by this layer's serialization.
 */
export { createApiRouter, type ApiDeps } from "./httpApi.js";
export { createWsServer } from "./wsServer.js";
