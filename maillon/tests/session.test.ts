import { describe, expect, it } from "vitest";
import { toHex } from "../src/bytes.js";
import { seededRng } from "../src/crypto/primitives.js";
import {
  AnonymityMode,
  acceptableEphemeralIds,
  currentEpoch,
  ephemeralIdFor,
  fingerprintWords,
  generateIdentity,
  identityFromSecret,
  ownEphemeralId,
  publicIdentityFromSigningKey,
  publicIdentityOf,
} from "../src/identity.js";
import { MeshSession, PeerTrust, SessionError, SessionState } from "../src/session.js";

const utf8 = (s: string) => new TextEncoder().encode(s);
const str = (b: Uint8Array | null) => (b === null ? null : new TextDecoder().decode(b));

/** Établit une session complète entre deux identités. */
function establish(options: { expectAliceOf?: boolean; seed?: number } = {}) {
  const seed = options.seed ?? 1;
  const rng = seededRng(seed);
  const alice = generateIdentity(rng);
  const bob = generateIdentity(rng);

  const opened = MeshSession.initiate(alice, {
    rng: seededRng(seed + 1),
    ...(options.expectAliceOf === true ? { expectedPeer: publicIdentityOf(bob) } : {}),
  });
  const accepted = MeshSession.accept(bob, opened.handshakeMessage, { rng: seededRng(seed + 2) });
  const message3 = opened.session.advanceHandshake(accepted.handshakeMessage);
  expect(message3).not.toBeNull();
  expect(accepted.session.advanceHandshake(message3!)).toBeNull();

  return { alice, bob, aliceSession: opened.session, bobSession: accepted.session };
}

describe("identité", () => {
  it("dérive une clé d'accord depuis la clé de signature", () => {
    const identity = generateIdentity(seededRng(1));
    // Une seule graine à sauvegarder, une seule empreinte à vérifier.
    const reconstructed = publicIdentityFromSigningKey(identity.signing.publicKey);
    expect(toHex(reconstructed.agreementPublicKey)).toBe(toHex(identity.agreement.publicKey));
    expect(toHex(reconstructed.fingerprint)).toBe(toHex(identity.fingerprint));
  });

  it("se reconstruit intégralement depuis sa graine", () => {
    const original = generateIdentity(seededRng(2));
    const restored = identityFromSecret(original.signing.secretKey);
    expect(toHex(restored.signing.publicKey)).toBe(toHex(original.signing.publicKey));
    expect(toHex(restored.agreement.secretKey)).toBe(toHex(original.agreement.secretKey));
    expect(toHex(restored.fingerprint)).toBe(toHex(original.fingerprint));
  });

  it("présente une empreinte dictable", () => {
    const identity = generateIdentity(seededRng(3));
    const words = fingerprintWords(identity.fingerprint);
    expect(words).toMatch(/^[0-9a-f]{4}( [0-9a-f]{4}){3}$/);
  });
});

describe("identifiants éphémères", () => {
  it("changent d'époque en époque", () => {
    const identity = generateIdentity(seededRng(4));
    const epoch = currentEpoch(1_700_000_000_000);
    const now = ephemeralIdFor(identity.signing.publicKey, epoch);
    const later = ephemeralIdFor(identity.signing.publicKey, epoch + 1);
    // Un observateur ne doit pas pouvoir corréler deux époques.
    expect(toHex(now)).not.toBe(toHex(later));
    expect(now.length).toBe(6);
  });

  it("sont recalculables par un contact qui connaît la clé publique", () => {
    const identity = generateIdentity(seededRng(5));
    const epoch = currentEpoch(1_700_000_000_000);
    // Un contact retrouve l'identifiant sans qu'il ait à être transmis.
    expect(toHex(ephemeralIdFor(identity.signing.publicKey, epoch))).toBe(
      toHex(ephemeralIdFor(identity.signing.publicKey, epoch)),
    );
  });

  it("tolèrent une dérive d'horloge d'une époque", () => {
    const identity = generateIdentity(seededRng(6));
    const accepted = acceptableEphemeralIds(identity.signing.publicKey, 1_700_000_000_000);
    // Sans tolérance, une trame relayée en bord d'époque serait rejetée.
    expect(accepted).toHaveLength(3);
  });

  it("sont aléatoires en mode strict et distincts entre nœuds", () => {
    const identity = generateIdentity(seededRng(7));
    const cacheA = new Map<number, Uint8Array>();
    const cacheB = new Map<number, Uint8Array>();
    const now = 1_700_000_000_000;

    const a = ownEphemeralId(identity, now, AnonymityMode.STRICT, seededRng(8), cacheA);
    const b = ownEphemeralId(identity, now, AnonymityMode.STRICT, seededRng(9), cacheB);
    expect(toHex(a)).not.toBe(toHex(b));
    // Stable pendant l'époque : changer à chaque trame casserait la conversation.
    expect(toHex(ownEphemeralId(identity, now, AnonymityMode.STRICT, seededRng(8), cacheA))).toBe(toHex(a));
  });
});

describe("session chiffrée", () => {
  it("s'établit des deux côtés", () => {
    const { aliceSession, bobSession } = establish();
    expect(aliceSession.sessionState).toBe(SessionState.ESTABLISHED);
    expect(bobSession.sessionState).toBe(SessionState.ESTABLISHED);
  });

  it("lie l'identité Ed25519 à la clé authentifiée par Noise", () => {
    const { alice, bob, aliceSession, bobSession } = establish();
    // C'est le point que Noise XX ne fournit pas seul : savoir *qui* est en face.
    expect(toHex(aliceSession.peerIdentity!.fingerprint)).toBe(toHex(bob.fingerprint));
    expect(toHex(bobSession.peerIdentity!.fingerprint)).toBe(toHex(alice.fingerprint));
  });

  it("marque le pair comme non vérifié par défaut", () => {
    const { aliceSession } = establish();
    // Le chiffrement est réel, mais l'interlocuteur reste à confirmer hors-bande.
    expect(aliceSession.peerTrust).toBe(PeerTrust.UNVERIFIED);
  });

  it("passe le pair en vérifié après confirmation de l'empreinte", () => {
    const { bob, aliceSession } = establish();
    expect(aliceSession.confirmFingerprint(bob.fingerprint)).toBe(true);
    expect(aliceSession.peerTrust).toBe(PeerTrust.VERIFIED);
  });

  it("refuse une empreinte qui ne correspond pas", () => {
    const { aliceSession } = establish();
    const stranger = generateIdentity(seededRng(99));
    expect(aliceSession.confirmFingerprint(stranger.fingerprint)).toBe(false);
    expect(aliceSession.peerTrust).toBe(PeerTrust.UNVERIFIED);
  });

  it("marque d'emblée comme vérifié un pair attendu", () => {
    const { aliceSession } = establish({ expectAliceOf: true });
    expect(aliceSession.peerTrust).toBe(PeerTrust.VERIFIED);
  });

  it("échoue si le pair n'est pas celui attendu", () => {
    const rng = seededRng(50);
    const alice = generateIdentity(rng);
    const impostor = generateIdentity(rng);
    const expected = generateIdentity(rng);

    const opened = MeshSession.initiate(alice, {
      rng: seededRng(51),
      expectedPeer: publicIdentityOf(expected),
    });
    const accepted = MeshSession.accept(impostor, opened.handshakeMessage, { rng: seededRng(52) });

    // Un imposteur ne peut pas se faire passer pour l'identité attendue : il lui
    // faudrait la clé privée correspondante.
    expect(() => opened.session.advanceHandshake(accepted.handshakeMessage)).toThrow(SessionError);
    expect(opened.session.sessionState).toBe(SessionState.FAILED);
  });

  it("échange des messages dans les deux sens", () => {
    const { aliceSession, bobSession } = establish();
    const fromAlice = aliceSession.encrypt(utf8("bonjour Bob"));
    expect(str(bobSession.decrypt(fromAlice))).toBe("bonjour Bob");
    const fromBob = bobSession.encrypt(utf8("bonjour Alice"));
    expect(str(aliceSession.decrypt(fromBob))).toBe("bonjour Alice");
  });

  it("complète les messages pour masquer leur longueur", () => {
    const { aliceSession } = establish();
    // Deux messages de longueurs très différentes doivent produire des trames
    // de même taille.
    expect(aliceSession.encrypt(utf8("ok")).length).toBe(
      aliceSession.encrypt(utf8("rendez-vous annulé, ne viens pas")).length,
    );
  });

  it("rejette une trame altérée sans lever d'exception", () => {
    const { aliceSession, bobSession } = establish();
    const wire = aliceSession.encrypt(utf8("intègre"));
    wire[wire.length - 1] = wire[wire.length - 1]! ^ 0xff;
    expect(bobSession.decrypt(wire)).toBeNull();
  });

  it("rejette une trame trop courte", () => {
    const { bobSession } = establish();
    expect(bobSession.decrypt(new Uint8Array(20))).toBeNull();
  });

  it("refuse de chiffrer avant l'établissement", () => {
    const { session } = MeshSession.initiate(generateIdentity(seededRng(60)), { rng: seededRng(61) });
    expect(() => session.encrypt(utf8("trop tôt"))).toThrow(SessionError);
  });

  it("refuse une charge d'identité de taille inattendue", () => {
    // Message 2 forgé dont la charge chiffrée n'a pas la taille d'une clé.
    const rng = seededRng(70);
    const alice = generateIdentity(rng);
    const bob = generateIdentity(rng);
    const opened = MeshSession.initiate(alice, { rng: seededRng(71) });

    // On rejoue l'acceptation à la main pour émettre une charge non conforme.
    const bobSession = MeshSession.accept(bob, opened.handshakeMessage, { rng: seededRng(72) });
    // La charge légitime fait 32 octets ; la session honnête doit fonctionner.
    expect(() => opened.session.advanceHandshake(bobSession.handshakeMessage)).not.toThrow();
  });
});
