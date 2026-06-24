/**
 * adapters/ — outbound IO boundary. Each client wraps exactly one external HTTP
 * source and returns RAW payloads (or raw domain rows); all parsing into rich
 * domain types stays in `domain/`. Every client takes an injectable `fetch` so
 * usecases/persistence can be tested with stubs. This barrel is the single
 * import surface for the composition root and outer layers.
 */
export {
  createMisClient,
  type MisClient,
  type MisClientConfig,
} from "./misClient.js";
export {
  createOfficialClient,
  type OfficialClient,
} from "./officialClient.js";
export {
  createUniverseClient,
  type UniverseClient,
  type UniverseEndpoints,
  type RawUniverse,
} from "./universeClient.js";
export {
  createHistoryClient,
  type HistoryClient,
} from "./historyClient.js";
