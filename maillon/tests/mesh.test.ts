import { describe, expect, it } from "vitest";
import { SimNetwork } from "../src/sim/network.js";
import { NodeRole } from "../src/transport.js";

const utf8 = (s: string) => new TextEncoder().encode(s);

/** Réseau linéaire de `count` nœuds : le cas qui exige réellement du multi-sauts. */
function chainNetwork(count: number, seed = 1) {
  const net = new SimNetwork({ seed });
  const ids = Array.from({ length: count }, (_, i) => `n${i}`);
  for (const id of ids) net.addNode(id);
  net.chain(ids);
  // Laisser les HELLO circuler pour que chacun connaisse ses voisins.
  net.run(1_000);
  return { net, ids };
}

describe("découverte du voisinage", () => {
  it("ne voit que les nœuds à portée, pas tout le réseau", () => {
    const { net } = chainNetwork(5);
    // En chaîne n0—n1—n2—n3—n4 : les extrémités ont un voisin, le milieu deux.
    expect(net.requireNode("n0").mesh.neighborCount).toBe(1);
    expect(net.requireNode("n2").mesh.neighborCount).toBe(2);
    expect(net.requireNode("n4").mesh.neighborCount).toBe(1);
  });

  it("oublie un voisin devenu silencieux", () => {
    const { net } = chainNetwork(3);
    expect(net.requireNode("n1").mesh.neighborCount).toBe(2);
    net.unlink("n1", "n2");
    net.run(net.now + 120_000); // au-delà du délai de garde de 90 s
    expect(net.requireNode("n1").mesh.neighborCount).toBe(1);
  });
});

describe("acheminement multi-sauts", () => {
  it("franchit une chaîne de six nœuds hors de portée directe", () => {
    const { net } = chainNetwork(6);
    net.requireNode("n0").mesh.broadcast(utf8("message longue distance"), net.now);
    net.run(net.now + 5_000);

    // n5 est à cinq sauts de n0 : aucune radio ne les relie directement.
    for (const id of ["n1", "n2", "n3", "n4", "n5"]) {
      const texts = net.requireNode(id).deliveries.map((d) => d.text);
      expect(texts, `nœud ${id}`).toContain("message longue distance");
    }
  });

  it("ne franchit pas plus de sauts que le TTL n'en autorise", () => {
    const net = new SimNetwork({ seed: 3 });
    const ids = Array.from({ length: 12 }, (_, i) => `n${i}`);
    // TTL de 3 : la trame doit mourir avant le bout de la chaîne.
    for (const id of ids) net.addNode(id, { node: { ttl: 3 } });
    net.chain(ids);
    net.run(1_000);

    net.requireNode("n0").mesh.broadcast(utf8("courte portée"), net.now);
    net.run(net.now + 5_000);

    const reached = ids.filter((id) =>
      net.requireNode(id).deliveries.some((d) => d.text === "courte portée"),
    );
    expect(reached).toContain("n1");
    expect(reached).not.toContain("n11");
    // TTL 3 → au plus trois sauts depuis l'émetteur.
    expect(reached.length).toBeLessThanOrEqual(3);
  });

  it("livre chaque message une seule fois malgré les chemins multiples", () => {
    const net = new SimNetwork({ seed: 5 });
    const ids = ["a", "b", "c", "d"];
    for (const id of ids) net.addNode(id);
    // Losange : deux chemins distincts de « a » vers « d ».
    net.link("a", "b");
    net.link("a", "c");
    net.link("b", "d");
    net.link("c", "d");
    net.run(1_000);

    net.requireNode("a").mesh.broadcast(utf8("une seule fois"), net.now);
    net.run(net.now + 5_000);

    const received = net.requireNode("d").deliveries.filter((d) => d.text === "une seule fois");
    expect(received).toHaveLength(1);
  });

  it("achemine malgré 20 % de pertes sur chaque lien", () => {
    const net = new SimNetwork({ seed: 11, lossRate: 0.2 });
    const ids = Array.from({ length: 5 }, (_, i) => `n${i}`);
    for (const id of ids) net.addNode(id);
    // Maillage redondant : c'est la redondance, non la fiabilité du lien, qui
    // porte le message. Un réseau maillé doit fonctionner sur des liens mauvais.
    net.fullMesh(ids);
    net.run(2_000);

    net.requireNode("n0").mesh.broadcast(utf8("malgré les pertes"), net.now);
    net.run(net.now + 5_000);

    const reached = ids
      .slice(1)
      .filter((id) => net.requireNode(id).deliveries.some((d) => d.text === "malgré les pertes"));
    expect(reached).toHaveLength(4);
  });
});

describe("inondation contrôlée en forte densité", () => {
  it("supprime des rediffusions quand la densité monte", () => {
    // Le cas « festival » : trente appareils tous à portée les uns des autres.
    const net = new SimNetwork({ seed: 7 });
    const ids = Array.from({ length: 30 }, (_, i) => `d${i}`);
    for (const id of ids) net.addNode(id);
    net.fullMesh(ids);
    net.run(3_000);

    net.requireNode("d0").mesh.broadcast(utf8("dense"), net.now);
    net.run(net.now + 3_000);

    const relayed = ids.reduce((sum, id) => sum + net.requireNode(id).mesh.stats().relayed, 0);
    const suppressed = ids.reduce((sum, id) => sum + net.requireNode(id).mesh.stats().relaySuppressed, 0);

    // Sans contrôle, 29 nœuds rediffuseraient. Les correctifs de densité doivent
    // en faire renoncer une large part.
    expect(suppressed).toBeGreaterThan(0);
    expect(relayed).toBeLessThan(29);

    // Et la couverture doit rester totale : économiser ne doit pas coûter la livraison.
    const reached = ids
      .slice(1)
      .filter((id) => net.requireNode(id).deliveries.some((d) => d.text === "dense"));
    expect(reached).toHaveLength(29);
  });

  it("relaie plus volontiers quand le nœud est isolé", () => {
    const net = new SimNetwork({ seed: 9 });
    for (const id of ["x", "y", "z"]) net.addNode(id);
    net.chain(["x", "y", "z"]);
    net.run(1_000);

    // « y » n'a que deux voisins : la probabilité de rediffusion vaut 1.
    net.requireNode("x").mesh.broadcast(utf8("isolé"), net.now);
    net.run(net.now + 2_000);

    expect(net.requireNode("z").deliveries.map((d) => d.text)).toContain("isolé");
    expect(net.requireNode("y").mesh.stats().relayed).toBeGreaterThan(0);
  });
});

describe("appel de détresse", () => {
  it("traverse un réseau dense sans être supprimé par la densité", () => {
    const net = new SimNetwork({ seed: 13 });
    const ids = Array.from({ length: 20 }, (_, i) => `s${i}`);
    for (const id of ids) net.addNode(id);
    net.fullMesh(ids);
    net.run(3_000);

    net.requireNode("s0").mesh.sendSos(utf8("SOS 48.8566,2.3522"), net.now);
    net.run(net.now + 3_000);

    // La priorité doit contourner la loterie de densité : un appel de détresse
    // est exactement ce qu'il ne faut pas perdre pour économiser la batterie.
    const reached = ids
      .slice(1)
      .filter((id) => net.requireNode(id).deliveries.some((d) => d.text.startsWith("SOS")));
    expect(reached).toHaveLength(19);
  });

  it("franchit une longue chaîne grâce à son TTL maximal", () => {
    const net = new SimNetwork({ seed: 17 });
    const ids = Array.from({ length: 12 }, (_, i) => `c${i}`);
    for (const id of ids) net.addNode(id);
    net.chain(ids);
    net.run(1_000);

    net.requireNode("c0").mesh.sendSos(utf8("SOS zone blanche"), net.now);
    net.run(net.now + 8_000);

    // TTL maximal de 15 : la chaîne de onze sauts passe, là où un TTL par défaut
    // de 7 s'arrêterait en route.
    expect(net.requireNode("c11").deliveries.map((d) => d.text)).toContain("SOS zone blanche");
  });
});

describe("super-nœud comme épine dorsale", () => {
  it("relie deux grappes qui n'ont aucun lien direct", () => {
    // Le scénario visé : deux groupes de téléphones hors de portée, et un
    // portable posé entre les deux qui les réunit.
    const net = new SimNetwork({ seed: 19 });
    for (const id of ["p1", "p2", "p3", "p4"]) net.addNode(id);
    const laptop = net.addNode("portable", { role: NodeRole.SUPERNODE });

    net.link("p1", "p2");
    net.link("p3", "p4");
    net.link("p2", "portable");
    net.link("portable", "p3");
    net.run(2_000);

    expect(laptop.role).toBe(NodeRole.SUPERNODE);

    net.requireNode("p1").mesh.broadcast(utf8("d'une grappe à l'autre"), net.now);
    net.run(net.now + 5_000);

    expect(net.requireNode("p4").deliveries.map((d) => d.text)).toContain("d'une grappe à l'autre");
    expect(laptop.mesh.stats().relayed).toBeGreaterThan(0);
  });

  it("conserve bien plus de trames qu'un téléphone", () => {
    const net = new SimNetwork({ seed: 23 });
    const phone = net.addNode("téléphone", { role: NodeRole.PEER });
    const laptop = net.addNode("portable", { role: NodeRole.SUPERNODE });
    net.link("téléphone", "portable");
    net.run(1_000);

    for (let i = 0; i < 400; i++) phone.mesh.broadcast(utf8(`trame ${i}`), net.now);
    net.run(net.now + 10_000);

    // Le téléphone plafonne à 256 entrées, le super-nœud à 8192 : c'est ce qui
    // lui permet de servir de mémoire au réseau.
    expect(phone.mesh.storeSize).toBeLessThanOrEqual(256);
    expect(laptop.mesh.storeSize).toBeGreaterThan(256);
  });
});

describe("stockage-transfert à travers une partition", () => {
  it("remet un message à un nœud qui était absent lors de l'émission", () => {
    const net = new SimNetwork({ seed: 29 });
    for (const id of ["a", "relais", "b"]) net.addNode(id);
    net.link("a", "relais");
    net.link("relais", "b");
    net.run(2_000);

    // « b » se coupe du réseau avant l'émission.
    net.unlink("relais", "b");
    net.run(net.now + 500);

    net.requireNode("a").mesh.broadcast(utf8("en attente de b"), net.now);
    net.run(net.now + 3_000);
    expect(net.requireNode("b").deliveries).toHaveLength(0);
    // Le relais a bien gardé la trame en mémoire.
    expect(net.requireNode("relais").mesh.storeSize).toBeGreaterThan(0);

    // « b » revient : la réconciliation anti-entropie doit la lui remettre.
    net.link("relais", "b");
    net.run(net.now + 60_000);

    expect(net.requireNode("b").deliveries.map((d) => d.text)).toContain("en attente de b");
    expect(net.requireNode("relais").mesh.stats().reconciledOut).toBeGreaterThan(0);
  });

  it("réconcilie deux partitions réunies par un porteur mobile", () => {
    // Routage par « sneakernet » : personne ne relie jamais les deux groupes en
    // même temps, un appareil passe simplement de l'un à l'autre.
    const net = new SimNetwork({ seed: 31 });
    for (const id of ["groupeA", "porteur", "groupeB"]) net.addNode(id);

    net.link("groupeA", "porteur");
    net.run(2_000);
    net.requireNode("groupeA").mesh.broadcast(utf8("porté à la main"), net.now);
    net.run(net.now + 2_000);

    // Le porteur s'éloigne du groupe A et rejoint le groupe B.
    net.unlink("groupeA", "porteur");
    net.link("porteur", "groupeB");
    net.run(net.now + 60_000);

    expect(net.requireNode("groupeB").deliveries.map((d) => d.text)).toContain("porté à la main");
  });
});

describe("livraison finalement garantie", () => {
  it("rattrape par anti-entropie ce que l'inondation a perdu sur un pont", () => {
    // Grappes chaînées par des ponts sans chemin redondant. Sur un tel lien,
    // une seule perte ampute tout l'aval, et rien ne retransmet dans l'immédiat.
    const net = new SimNetwork({ seed: 7, lossRate: 0.2 });
    const clusters = Array.from({ length: 4 }, (_, g) =>
      Array.from({ length: 4 }, (_, i) => `g${g}t${i}`),
    );
    for (const cluster of clusters) {
      for (const id of cluster) net.addNode(id);
      net.fullMesh(cluster);
    }
    for (let g = 0; g < clusters.length; g++) {
      net.addNode(`pont${g}`, { role: NodeRole.SUPERNODE });
      for (const id of clusters[g]!.slice(0, 2)) net.link(id, `pont${g}`);
      if (g > 0) net.link(`pont${g - 1}`, `pont${g}`);
    }
    net.run(4_000);

    const everyone = clusters.flat();
    const covered = () =>
      everyone.slice(1).filter((id) => net.requireNode(id).deliveries.some((d) => d.text === "essaimage"))
        .length;

    net.requireNode("g0t0").mesh.broadcast(utf8("essaimage"), net.now);
    net.run(net.now + 6_000);
    const immediate = covered();

    // Laisser la réconciliation périodique opérer : c'est elle, et non
    // l'inondation, qui porte la garantie de livraison.
    net.run(net.now + 180_000);
    expect(covered()).toBe(everyone.length - 1);
    expect(covered()).toBeGreaterThanOrEqual(immediate);
  });
});

describe("reproductibilité", () => {
  it("donne exactement le même résultat pour une même graine", () => {
    const trace = (seed: number) => {
      const net = new SimNetwork({ seed, lossRate: 0.15 });
      const ids = Array.from({ length: 8 }, (_, i) => `r${i}`);
      for (const id of ids) net.addNode(id);
      net.fullMesh(ids);
      net.run(2_000);
      net.requireNode("r0").mesh.broadcast(utf8("déterministe"), net.now);
      net.run(net.now + 3_000);
      return ids.map((id) => net.requireNode(id).mesh.stats().relayed).join(",");
    };

    // Une simulation non reproductible rendrait tout échec inexploitable.
    expect(trace(101)).toBe(trace(101));
    expect(trace(101)).not.toBe(trace(202));
  });
});
