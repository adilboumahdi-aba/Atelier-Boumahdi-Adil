import { describe, expect, it } from "vitest";
import { toHex } from "../src/bytes.js";
import { NoiseHandshake } from "../src/crypto/noise.js";
import { generateX25519, seededRng } from "../src/crypto/primitives.js";
import {
  DoubleRatchet,
  MAX_SKIP_PER_CHAIN,
  RatchetError,
  decodeRatchetHeader,
  encodeRatchetHeader,
  type RatchetMessage,
} from "../src/crypto/ratchet.js";

const utf8 = (s: string) => new TextEncoder().encode(s);
const str = (b: Uint8Array | null) => (b === null ? null : new TextDecoder().decode(b));

/** Une paire de cliquets partageant une racine issue d'une vraie poignée de main. */
function pair(seed = 42) {
  const rng = seededRng(seed);
  const initiator = NoiseHandshake.initiator(generateX25519(rng), seededRng(seed + 1));
  const responder = NoiseHandshake.responder(generateX25519(rng), seededRng(seed + 2));
  responder.readMessage(initiator.writeMessage());
  initiator.readMessage(responder.writeMessage());
  responder.readMessage(initiator.writeMessage());

  const rootKey = initiator.finish().rootKey;
  return {
    alice: DoubleRatchet.initiator(rootKey, seededRng(seed + 3)),
    bob: DoubleRatchet.responder(rootKey, seededRng(seed + 4)),
  };
}

describe("double cliquet", () => {
  it("chiffre et déchiffre dans le sens initiateur → répondeur", () => {
    const { alice, bob } = pair();
    expect(alice.canSend).toBe(true);
    expect(bob.canSend).toBe(false);

    const message = alice.encrypt(utf8("bonjour"));
    expect(str(bob.decrypt(message))).toBe("bonjour");
    // Le répondeur acquiert une chaîne d'émission après le premier message reçu.
    expect(bob.canSend).toBe(true);
  });

  it("refuse d'émettre avant d'avoir reçu, côté répondeur", () => {
    const { bob } = pair();
    expect(() => bob.encrypt(utf8("trop tôt"))).toThrow(RatchetError);
  });

  it("mène une conversation alternée sur de nombreux tours", () => {
    const { alice, bob } = pair();
    alice.encrypt(utf8("amorce")); // consommé plus bas
    const primer = alice.encrypt(utf8("amorce 2"));
    bob.decrypt(primer);

    for (let round = 0; round < 30; round++) {
      const fromAlice = alice.encrypt(utf8(`a${round}`));
      expect(str(bob.decrypt(fromAlice))).toBe(`a${round}`);
      const fromBob = bob.encrypt(utf8(`b${round}`));
      expect(str(alice.decrypt(fromBob))).toBe(`b${round}`);
    }
  });

  it("change de clé de cliquet à chaque changement de sens", () => {
    const { alice, bob } = pair();
    const a1 = alice.encrypt(utf8("un"));
    bob.decrypt(a1);
    const b1 = bob.encrypt(utf8("deux"));
    alice.decrypt(b1);
    const a2 = alice.encrypt(utf8("trois"));

    expect(toHex(a1.header.ratchetPublicKey)).not.toBe(toHex(b1.header.ratchetPublicKey));
    expect(toHex(a2.header.ratchetPublicKey)).not.toBe(toHex(a1.header.ratchetPublicKey));
  });

  it("produit un texte chiffré différent pour un même clair", () => {
    const { alice } = pair();
    const first = alice.encrypt(utf8("identique"));
    const second = alice.encrypt(utf8("identique"));
    expect(toHex(first.ciphertext)).not.toBe(toHex(second.ciphertext));
  });

  // ---------------------------------------------------------------------
  // Le cas qui compte vraiment dans un maillage : l'ordre n'est pas garanti.
  // ---------------------------------------------------------------------

  it("déchiffre des messages arrivant dans l'ordre inverse", () => {
    const { alice, bob } = pair();
    const sent = Array.from({ length: 10 }, (_, i) => alice.encrypt(utf8(`m${i}`)));

    const received: (string | null)[] = [];
    for (const message of [...sent].reverse()) received.push(str(bob.decrypt(message)));

    expect(received).toEqual(["m9", "m8", "m7", "m6", "m5", "m4", "m3", "m2", "m1", "m0"]);
  });

  it("déchiffre des messages arrivant dans un ordre arbitraire", () => {
    const { alice, bob } = pair();
    const sent = Array.from({ length: 24 }, (_, i) => alice.encrypt(utf8(`m${i}`)));

    // Permutation fixe mais désordonnée, pour que l'échec soit reproductible.
    const order = [5, 0, 23, 11, 2, 19, 7, 1, 15, 3, 22, 8, 4, 17, 9, 6, 21, 12, 10, 20, 13, 18, 14, 16];
    const decrypted = new Map<string, string | null>();
    for (const index of order) {
      decrypted.set(`m${index}`, str(bob.decrypt(sent[index]!)));
    }
    for (let i = 0; i < 24; i++) expect(decrypted.get(`m${i}`)).toBe(`m${i}`);
  });

  it("survit à un désordre franchissant un pas de cliquet DH", () => {
    const { alice, bob } = pair();
    // Alice émet une première salve, dont un seul message parvient à Bob :
    // c'est lui qui déclenche le cliquet DH côté Bob.
    const salve1 = [alice.encrypt(utf8("s1-0")), alice.encrypt(utf8("s1-1")), alice.encrypt(utf8("s1-2"))];
    expect(str(bob.decrypt(salve1[2]!))).toBe("s1-2");

    // Bob répond : Alice change de chaîne à son tour.
    const reponse = bob.encrypt(utf8("réponse"));
    expect(str(alice.decrypt(reponse))).toBe("réponse");

    // Alice émet sur une nouvelle chaîne.
    const salve2 = [alice.encrypt(utf8("s2-0")), alice.encrypt(utf8("s2-1"))];
    expect(str(bob.decrypt(salve2[1]!))).toBe("s2-1");

    // Les retardataires des deux chaînes restent déchiffrables.
    expect(str(bob.decrypt(salve1[0]!))).toBe("s1-0");
    expect(str(bob.decrypt(salve2[0]!))).toBe("s2-0");
    expect(str(bob.decrypt(salve1[1]!))).toBe("s1-1");
  });

  it("ne déchiffre un même message qu'une seule fois", () => {
    const { alice, bob } = pair();
    const message = alice.encrypt(utf8("unique"));
    expect(str(bob.decrypt(message))).toBe("unique");
    // Rejeu : la clé a été consommée, donc plus de déchiffrement possible.
    expect(bob.decrypt(message)).toBeNull();
  });

  // ---------------------------------------------------------------------
  // Robustesse face aux trames hostiles
  // ---------------------------------------------------------------------

  it("retourne null sur un texte chiffré altéré, sans lever d'exception", () => {
    const { alice, bob } = pair();
    const message = alice.encrypt(utf8("intègre"));
    const tampered: RatchetMessage = {
      header: message.header,
      ciphertext: Uint8Array.from(message.ciphertext, (b, i) => (i === 0 ? b ^ 0xff : b)),
    };
    expect(bob.decrypt(tampered)).toBeNull();
  });

  it("ne se désynchronise pas après une trame forgée", () => {
    const { alice, bob } = pair();
    const forged: RatchetMessage = {
      header: { ratchetPublicKey: new Uint8Array(32).fill(9), previousChainLength: 0, messageNumber: 0 },
      ciphertext: new Uint8Array(48).fill(7),
    };
    expect(bob.decrypt(forged)).toBeNull();

    // La session reste utilisable : c'est la propriété essentielle, car
    // n'importe qui peut injecter des trames dans un maillage ouvert.
    const legitimate = alice.encrypt(utf8("toujours là"));
    expect(str(bob.decrypt(legitimate))).toBe("toujours là");
  });

  it("rejette un en-tête altéré, qui est authentifié comme donnée associée", () => {
    const { alice, bob } = pair();
    const message = alice.encrypt(utf8("lié"));
    const tampered: RatchetMessage = {
      header: { ...message.header, messageNumber: message.header.messageNumber + 5 },
      ciphertext: message.ciphertext,
    };
    expect(bob.decrypt(tampered)).toBeNull();
  });

  it("lie le message à ses données associées", () => {
    const { alice, bob } = pair();
    const message = alice.encrypt(utf8("contexte"), utf8("canal-a"));
    expect(bob.decrypt(message, utf8("canal-b"))).toBeNull();
    expect(str(bob.decrypt(message, utf8("canal-a")))).toBe("contexte");
  });

  it("borne le nombre de clés sautées conservées", () => {
    const { alice, bob } = pair();
    // Un pair hostile pourrait annoncer un numéro de message énorme pour forcer
    // la dérivation de millions de clés. La borne doit refuser sans planter.
    let far: RatchetMessage | undefined;
    for (let i = 0; i <= MAX_SKIP_PER_CHAIN + 10; i++) far = alice.encrypt(utf8(`m${i}`));
    expect(bob.decrypt(far!)).toBeNull();
    expect(bob.skippedKeyCount).toBe(0);
  });
});

describe("en-tête de cliquet", () => {
  it("survit à un aller-retour d'encodage", () => {
    const header = {
      ratchetPublicKey: new Uint8Array(32).fill(3),
      previousChainLength: 70_000,
      messageNumber: 1234,
    };
    const decoded = decodeRatchetHeader(encodeRatchetHeader(header));
    expect(toHex(decoded.ratchetPublicKey)).toBe(toHex(header.ratchetPublicKey));
    expect(decoded.previousChainLength).toBe(70_000);
    expect(decoded.messageNumber).toBe(1234);
  });

  it("rejette un en-tête tronqué", () => {
    expect(() => decodeRatchetHeader(new Uint8Array(20))).toThrow(RatchetError);
  });
});
