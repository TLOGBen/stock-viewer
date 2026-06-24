/**
 * middleware/ — cross-cutting concerns for the public HTTP API.
 *
 * cors / json body / unified errorHandler / symbol validation / SPA static
 * serving (packaged WEB_DIST). The action layer and composition root consume
 * these via this barrel; no route reaches into the underlying implementations.
 */
export { corsMiddleware } from "./cors.js";
export { jsonBody } from "./json.js";
export { validateSymbol } from "./validateSymbol.js";
export { errorHandler } from "./errorHandler.js";
export { mountSpaStatic } from "./spaStatic.js";
