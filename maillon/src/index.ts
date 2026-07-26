/**
 * Maillon — cœur protocolaire.
 *
 * Ce paquet ne contient **aucun code de plateforme** : ni BLE, ni Wi-Fi, ni
 * interface. C'est délibéré. Le format binaire, la cryptographie et le routage
 * sont écrits une seule fois et partagés à l'identique par iOS, Android,
 * Windows, macOS, Linux et le web. Trois implémentations d'un protocole
 * chiffré, ce serait trois jeux de bogues de sécurité à trouver.
 *
 * Les transports concrets s'y branchent via `Transport` (src/transport.ts).
 */

export * from "./bytes.js";
export * from "./wire.js";
export * from "./identity.js";
export * from "./session.js";
export * from "./transport.js";
export * from "./node.js";
export * from "./router.js";
export * from "./store.js";
export * from "./dedup.js";
export * from "./bloom.js";

export * from "./crypto/primitives.js";
export * from "./crypto/noise.js";
export * from "./crypto/ratchet.js";
export * from "./crypto/padding.js";

export { SimNetwork, SimNode, SimTransport } from "./sim/network.js";
export type { SimNetworkOptions, SimNodeOptions, SimDelivery } from "./sim/network.js";
