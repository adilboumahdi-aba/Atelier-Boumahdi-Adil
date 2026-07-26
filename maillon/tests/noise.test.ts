import { describe, expect, it } from "vitest";
import { toHex } from "../src/bytes.js";
import { NoiseError, NoiseHandshake } from "../src/crypto/noise.js";
import { generateX25519, seededRng } from "../src/crypto/primitives.js";

const utf8 = (s: string) => new TextEncoder().encode(s);

/** Déroule une poignée de main XX complète et retourne les deux jeux de clés. */
function completeHandshake(seed = 1) {
  const rng = seededRng(seed);
  const alice = generateX25519(rng);
  const bob = generateX25519(rng);
  const initiator = NoiseHandshake.initiator(alice, seededRng(seed + 100));
  const responder = NoiseHandshake.responder(bob, seededRng(seed + 200));

  const m1 = initiator.writeMessage();
  responder.readMessage(m1);
  const m2 = responder.writeMessage(utf8("identité de bob"));
  const payload2 = initiator.readMessage(m2);
  const m3 = initiator.writeMessage(utf8("identité d'alice"));
  const payload3 = responder.readMessage(m3);

  return {
    alice,
    bob,
    initiator,
    responder,
    payload2,
    payload3,
    sizes: { m1: m1.length, m2: m2.length, m3: m3.length },
  };
}

describe("poignée de main Noise XX", () => {
  it("aboutit à des clés de session concordantes", () => {
    const { initiator, responder } = completeHandshake();
    expect(initiator.isComplete).toBe(true);
    expect(responder.isComplete).toBe(true);

    const a = initiator.finish();
    const b = responder.finish();

    expect(toHex(a.rootKey)).toBe(toHex(b.rootKey));
    expect(toHex(a.handshakeHash)).toBe(toHex(b.handshakeHash));
    // Les clés directionnelles sont croisées : ce que l'un émet, l'autre le reçoit.
    expect(toHex(a.sendKey)).toBe(toHex(b.receiveKey));
    expect(toHex(a.receiveKey)).toBe(toHex(b.sendKey));
    expect(toHex(a.sendKey)).not.toBe(toHex(a.receiveKey));
  });

  it("authentifie mutuellement les clés statiques", () => {
    const { alice, bob, initiator, responder } = completeHandshake();
    expect(toHex(initiator.finish().remoteStaticKey)).toBe(toHex(bob.publicKey));
    expect(toHex(responder.finish().remoteStaticKey)).toBe(toHex(alice.publicKey));
  });

  it("transporte les charges utiles des messages 2 et 3", () => {
    const { payload2, payload3 } = completeHandshake();
    expect(new TextDecoder().decode(payload2)).toBe("identité de bob");
    expect(new TextDecoder().decode(payload3)).toBe("identité d'alice");
  });

  it("tient dans un seul fragment BLE à chaque message", () => {
    const { sizes } = completeHandshake();
    // 185 - 23 octets d'en-tête de trame = 162 octets de charge utile.
    expect(sizes.m1).toBe(32);
    // « identité de bob » fait 16 octets en UTF-8 (é sur deux octets), + 16 de tag.
    expect(sizes.m2).toBe(32 + 48 + 32); // e + s chiffrée + charge chiffrée
    expect(sizes.m3).toBe(48 + 33); // s chiffrée + charge chiffrée
    for (const size of Object.values(sizes)) expect(size).toBeLessThanOrEqual(162);
  });

  it("produit une racine différente à chaque exécution", () => {
    const first = completeHandshake(1).initiator.finish();
    const second = completeHandshake(2).initiator.finish();
    expect(toHex(first.rootKey)).not.toBe(toHex(second.rootKey));
  });

  it("rejette un message 2 altéré", () => {
    const rng = seededRng(7);
    const initiator = NoiseHandshake.initiator(generateX25519(rng), seededRng(8));
    const responder = NoiseHandshake.responder(generateX25519(rng), seededRng(9));
    initiator.readMessage; // garde le typage explicite
    responder.readMessage(initiator.writeMessage());
    const m2 = responder.writeMessage();
    m2[40] = m2[40]! ^ 0xff; // bit retourné dans la clé statique chiffrée
    expect(() => initiator.readMessage(m2)).toThrow(NoiseError);
  });

  it("refuse d'émettre hors de son tour", () => {
    const initiator = NoiseHandshake.initiator(generateX25519(seededRng(3)), seededRng(4));
    initiator.writeMessage();
    expect(() => initiator.writeMessage()).toThrow(NoiseError);
  });

  it("refuse de livrer les clés avant la fin", () => {
    const initiator = NoiseHandshake.initiator(generateX25519(seededRng(5)), seededRng(6));
    expect(() => initiator.finish()).toThrow(NoiseError);
  });

  it("échoue si l'initiateur parle à un imposteur", () => {
    // Un attaquant relaie le message 1 mais répond avec sa propre clé statique :
    // la poignée de main réussit — c'est normal, XX n'authentifie pas une clé
    // inconnue — mais la clé statique apprise est celle de l'attaquant, ce que
    // la couche session doit détecter en la comparant à l'identité attendue.
    const rng = seededRng(11);
    const initiator = NoiseHandshake.initiator(generateX25519(rng), seededRng(12));
    const attacker = generateX25519(rng);
    const expectedPeer = generateX25519(rng);
    const impostor = NoiseHandshake.responder(attacker, seededRng(13));

    impostor.readMessage(initiator.writeMessage());
    initiator.readMessage(impostor.writeMessage());
    impostor.readMessage(initiator.writeMessage());

    const learned = initiator.finish().remoteStaticKey;
    expect(toHex(learned)).toBe(toHex(attacker.publicKey));
    expect(toHex(learned)).not.toBe(toHex(expectedPeer.publicKey));
  });
});
