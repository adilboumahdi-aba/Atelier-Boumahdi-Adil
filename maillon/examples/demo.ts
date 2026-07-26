/**
 * Démonstration exécutable : `npm run demo`
 *
 * Trois scénarios qui montrent ce que le cœur sait faire, sans aucune radio.
 */
import { MeshSession, PeerTrust } from "../src/session.js";
import { generateIdentity, fingerprintWords, publicIdentityOf } from "../src/identity.js";
import { SimNetwork } from "../src/sim/network.js";
import { NodeRole } from "../src/transport.js";

const utf8 = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array | null) => (b === null ? "«échec»" : new TextDecoder().decode(b));

function title(label: string): void {
  console.log(`\n${"─".repeat(64)}\n${label}\n${"─".repeat(64)}`);
}

// ---------------------------------------------------------------------------
title("1. Session chiffrée de bout en bout, sans serveur");

const alice = generateIdentity();
const bob = generateIdentity();

console.log(`empreinte d'Alice : ${fingerprintWords(alice.fingerprint)}`);
console.log(`empreinte de Bob  : ${fingerprintWords(bob.fingerprint)}`);

const opened = MeshSession.initiate(alice, { expectedPeer: publicIdentityOf(bob) });
const accepted = MeshSession.accept(bob, opened.handshakeMessage);
const message3 = opened.session.advanceHandshake(accepted.handshakeMessage);
accepted.session.advanceHandshake(message3!);

console.log(
  `poignée de main : 3 messages de ${opened.handshakeMessage.length}, ` +
    `${accepted.handshakeMessage.length} et ${message3!.length} octets — chacun tient dans une trame BLE`,
);
console.log(`confiance côté Alice : ${opened.session.peerTrust === PeerTrust.VERIFIED ? "vérifiée" : "non vérifiée"}`);

const chiffre = opened.session.encrypt(utf8("on se retrouve au point B"));
console.log(`« on se retrouve au point B » → ${chiffre.length} octets sur le fil (complété)`);
console.log(`déchiffré par Bob : « ${text(accepted.session.decrypt(chiffre))} »`);

// L'ordre d'arrivée n'est pas garanti dans un maillage.
const desordre = [
  opened.session.encrypt(utf8("premier")),
  opened.session.encrypt(utf8("deuxième")),
  opened.session.encrypt(utf8("troisième")),
];
const recu = [desordre[2]!, desordre[0]!, desordre[1]!].map((w) => text(accepted.session.decrypt(w)));
console.log(`arrivés en désordre (3,1,2) et tous déchiffrés : ${recu.join(", ")}`);

// ---------------------------------------------------------------------------
title("2. Acheminement multi-sauts : six téléphones en chaîne");

const chaine = new SimNetwork({ seed: 2024 });
const ids = ["Léa", "Marc", "Nour", "Ines", "Youss", "Sami"];
for (const id of ids) chaine.addNode(id);
chaine.chain(ids);
chaine.run(2_000);

console.log(`topologie : ${ids.join(" — ")}`);
console.log(`voisins directs de Léa : ${chaine.requireNode("Léa").mesh.neighborCount}`);

chaine.requireNode("Léa").mesh.broadcast(utf8("le pont est coupé"), chaine.now);
chaine.run(chaine.now + 5_000);

for (const id of ids.slice(1)) {
  const recu = chaine.requireNode(id).deliveries.find((d) => d.text === "le pont est coupé");
  console.log(`  ${id.padEnd(6)} ${recu ? `reçu à t+${recu.at} ms` : "non reçu"}`);
}
console.log("Sami est à cinq sauts de Léa : aucune radio ne les relie directement.");

// ---------------------------------------------------------------------------
title("3. Trente appareils en cinq grappes, avec 10 % de pertes");

// Topologie réaliste d'un festival : des grappes denses, reliées entre elles par
// quelques appareils seulement. La densité impose la modération des rediffusions,
// et la chaîne de grappes impose du multi-sauts.
const dense = new SimNetwork({ seed: 7, lossRate: 0.1 });
const grappes = Array.from({ length: 5 }, (_, g) =>
  Array.from({ length: 6 }, (_, i) => `g${g}-t${i}`),
);
for (const grappe of grappes) {
  for (const id of grappe) dense.addNode(id);
  dense.fullMesh(grappe);
}
// Un portable par grappe, relié à plusieurs téléphones : c'est lui qui fait le
// pont vers la grappe suivante.
for (let g = 0; g < grappes.length; g++) {
  dense.addNode(`portable${g}`, { role: NodeRole.SUPERNODE });
  for (const id of grappes[g]!.slice(0, 3)) dense.link(id, `portable${g}`);
  if (g > 0) dense.link(`portable${g - 1}`, `portable${g}`);
}
dense.run(4_000);

const tous = grappes.flat();
dense.requireNode("g0-t0").mesh.broadcast(utf8("point de rassemblement : entrée nord"), dense.now);
dense.run(dense.now + 6_000);

const couverture = () =>
  tous.slice(1).filter((id) => dense.requireNode(id).deliveries.some((d) => d.text.startsWith("point de")))
    .length;

const immediate = couverture();
const relais = tous.reduce((sum, id) => sum + dense.requireNode(id).mesh.stats().relayed, 0);
const supprimes = tous.reduce((sum, id) => sum + dense.requireNode(id).mesh.stats().relaySuppressed, 0);

console.log(`topologie        : 5 grappes de 6 téléphones, chaînées par 5 portables`);
console.log(`rediffusions     : ${relais}`);
console.log(`renoncements     : ${supprimes} — autant de batterie et de spectre épargnés`);
console.log(`couverture à 6 s : ${immediate}/29 téléphones`);

// L'inondation est *au mieux-effort* : sur un lien de pont sans chemin
// redondant, une seule perte à 10 % suffit à amputer tout l'aval, et rien ne
// retransmet dans l'immédiat. C'est la réconciliation anti-entropie périodique
// qui garantit la livraison — plus lente, mais elle, elle finit par aboutir.
dense.run(dense.now + 90_000);
console.log(`couverture à 96 s: ${couverture()}/29 — rattrapée par l'anti-entropie`);

// Charge soutenue : c'est là que la capacité de cache distingue vraiment un
// portable d'un téléphone.
for (let i = 0; i < 300; i++) dense.requireNode("g0-t1").mesh.broadcast(utf8(`trafic ${i}`), dense.now);
dense.run(dense.now + 10_000);
console.log(
  `sous charge      : le portable garde ${dense.requireNode("portable0").mesh.storeSize} trames, ` +
    `le téléphone plafonne à ${dense.requireNode("g0-t2").mesh.storeSize}`,
);

// ---------------------------------------------------------------------------
title("4. Stockage-transfert : livrer à un absent");

const dtn = new SimNetwork({ seed: 99 });
for (const id of ["Amir", "portable", "Zoé"]) dtn.addNode(id, { role: id === "portable" ? NodeRole.SUPERNODE : NodeRole.PEER });
dtn.link("Amir", "portable");
dtn.link("portable", "Zoé");
dtn.run(2_000);

dtn.unlink("portable", "Zoé");
console.log("Zoé quitte la zone de couverture…");
dtn.run(dtn.now + 500);

dtn.requireNode("Amir").mesh.broadcast(utf8("rappelle-moi quand tu peux"), dtn.now);
dtn.run(dtn.now + 3_000);
console.log(`  message émis. Zoé a reçu : ${dtn.requireNode("Zoé").deliveries.length} message(s)`);
console.log(`  le portable garde ${dtn.requireNode("portable").mesh.storeSize} trame(s) en mémoire`);

dtn.link("portable", "Zoé");
console.log("Zoé revient…");
dtn.run(dtn.now + 60_000);
const livre = dtn.requireNode("Zoé").deliveries.find((d) => d.text === "rappelle-moi quand tu peux");
console.log(`  ${livre ? `livré à t+${livre.at} ms par réconciliation anti-entropie` : "non livré"}`);

console.log("\nAucun serveur, aucun compte, aucune connexion internet à aucun moment.\n");
