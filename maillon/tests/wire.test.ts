import { describe, expect, it } from "vitest";
import { toHex } from "../src/bytes.js";
import { PADDING_BUCKETS, PaddingError, bucketFor, pad, unpad } from "../src/crypto/padding.js";
import {
  BLE_MAX_FRAME,
  BROADCAST_ID,
  Flags,
  FrameType,
  HEADER_SIZE,
  PROTOCOL_VERSION,
  Reassembler,
  WireError,
  decodeFragNack,
  decodeFrame,
  encodeFragNack,
  encodeFrame,
  fragment,
  frameKey,
  hasFlag,
  isBroadcast,
  maxPayloadPerFragment,
  type Frame,
} from "../src/wire.js";

function makeFrame(overrides: Partial<Frame> = {}): Frame {
  return {
    version: PROTOCOL_VERSION,
    type: FrameType.MESSAGE,
    flags: Flags.RELAYABLE | Flags.ENCRYPTED,
    ttl: 7,
    packetId: Uint8Array.from([1, 2, 3, 4, 5, 6]),
    src: Uint8Array.from([10, 11, 12, 13, 14, 15]),
    dst: Uint8Array.from([20, 21, 22, 23, 24, 25]),
    fragIndex: 0,
    fragCount: 1,
    payload: Uint8Array.from([0xaa, 0xbb, 0xcc]),
    ...overrides,
  };
}

describe("format de trame", () => {
  it("survit à un aller-retour d'encodage", () => {
    const original = makeFrame();
    const decoded = decodeFrame(encodeFrame(original));
    expect(decoded.type).toBe(FrameType.MESSAGE);
    expect(decoded.ttl).toBe(7);
    expect(decoded.flags).toBe(Flags.RELAYABLE | Flags.ENCRYPTED);
    expect(toHex(decoded.packetId)).toBe("010203040506");
    expect(toHex(decoded.src)).toBe("0a0b0c0d0e0f");
    expect(toHex(decoded.dst)).toBe("141516171819");
    expect(toHex(decoded.payload)).toBe("aabbcc");
  });

  it("respecte la taille d'en-tête annoncée", () => {
    expect(encodeFrame(makeFrame({ payload: new Uint8Array(0) })).length).toBe(HEADER_SIZE);
    expect(HEADER_SIZE).toBe(23);
  });

  it("ne partage pas de mémoire avec le tampon du transport", () => {
    const buffer = encodeFrame(makeFrame());
    const decoded = decodeFrame(buffer);
    buffer.fill(0); // le transport réutilise son tampon
    // Sans copie, la trame décodée serait silencieusement corrompue.
    expect(toHex(decoded.payload)).toBe("aabbcc");
    expect(toHex(decoded.packetId)).toBe("010203040506");
  });

  it("reconnaît la diffusion générale", () => {
    expect(isBroadcast(makeFrame({ dst: BROADCAST_ID }))).toBe(true);
    expect(isBroadcast(makeFrame())).toBe(false);
  });

  it("distingue les fragments d'un même paquet par leur clé", () => {
    const a = frameKey(makeFrame({ fragIndex: 0, fragCount: 2 }));
    const b = frameKey(makeFrame({ fragIndex: 1, fragCount: 2 }));
    // Si la clé ignorait fragIndex, la déduplication détruirait tous les
    // fragments sauf le premier.
    expect(toHex(a)).not.toBe(toHex(b));
    expect(a.length).toBe(7);
  });

  it("lit les drapeaux", () => {
    const frame = makeFrame({ flags: Flags.PRIORITY | Flags.SUPERNODE });
    expect(hasFlag(frame, Flags.PRIORITY)).toBe(true);
    expect(hasFlag(frame, Flags.ENCRYPTED)).toBe(false);
  });

  it("rejette les trames malformées", () => {
    expect(() => decodeFrame(new Uint8Array(10))).toThrow(WireError);
    const badVersion = encodeFrame(makeFrame());
    badVersion[0] = (9 << 4) | FrameType.MESSAGE;
    expect(() => decodeFrame(badVersion)).toThrow(WireError);
    const badFrag = encodeFrame(makeFrame());
    badFrag[21] = 5; // fragIndex au-delà de fragCount
    expect(() => decodeFrame(badFrag)).toThrow(WireError);
    expect(() => encodeFrame(makeFrame({ src: new Uint8Array(4) }))).toThrow(WireError);
  });
});

describe("fragmentation", () => {
  it("laisse intacte une charge qui tient dans une trame", () => {
    const frames = fragment(makeFrame(), BLE_MAX_FRAME);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.fragCount).toBe(1);
  });

  it("découpe selon le profil BLE", () => {
    expect(maxPayloadPerFragment(BLE_MAX_FRAME)).toBe(162);
    const frames = fragment(makeFrame({ payload: new Uint8Array(400).fill(7) }), BLE_MAX_FRAME);
    expect(frames).toHaveLength(3); // 162 + 162 + 76
    for (const frame of frames) {
      expect(encodeFrame(frame).length).toBeLessThanOrEqual(BLE_MAX_FRAME);
    }
  });

  it("conserve le même packetId sur tous les fragments", () => {
    const frames = fragment(makeFrame({ payload: new Uint8Array(500) }), BLE_MAX_FRAME);
    const ids = new Set(frames.map((f) => toHex(f.packetId)));
    expect(ids.size).toBe(1);
  });

  it("refuse une charge exigeant plus de 255 fragments", () => {
    expect(() => fragment(makeFrame({ payload: new Uint8Array(100_000) }), BLE_MAX_FRAME)).toThrow(WireError);
  });
});

describe("réassemblage", () => {
  it("reconstitue une charge découpée", () => {
    const payload = Uint8Array.from({ length: 400 }, (_, i) => i % 256);
    const frames = fragment(makeFrame({ payload }), BLE_MAX_FRAME);
    const reassembler = new Reassembler();

    expect(reassembler.push(frames[0]!, 0)).toBeNull();
    expect(reassembler.push(frames[1]!, 10)).toBeNull();
    const complete = reassembler.push(frames[2]!, 20);

    expect(complete).not.toBeNull();
    expect(toHex(complete!.payload)).toBe(toHex(payload));
    expect(complete!.fragCount).toBe(1);
  });

  it("reconstitue malgré un ordre d'arrivée inversé", () => {
    // Dans un maillage, les fragments empruntent des chemins différents.
    const payload = new Uint8Array(500).fill(3);
    const frames = fragment(makeFrame({ payload }), BLE_MAX_FRAME);
    const reassembler = new Reassembler();
    let complete = null;
    for (const frame of [...frames].reverse()) complete = reassembler.push(frame, 0) ?? complete;
    expect(complete).not.toBeNull();
    expect(complete!.payload.length).toBe(500);
  });

  it("ignore un fragment dupliqué", () => {
    const frames = fragment(makeFrame({ payload: new Uint8Array(300) }), BLE_MAX_FRAME);
    const reassembler = new Reassembler();
    reassembler.push(frames[0]!, 0);
    expect(reassembler.push(frames[0]!, 0)).toBeNull();
    expect(reassembler.stats().duplicateFragments).toBe(1);
  });

  it("abandonne les paquets incomplets à l'expiration", () => {
    const frames = fragment(makeFrame({ payload: new Uint8Array(300) }), BLE_MAX_FRAME);
    const reassembler = new Reassembler({ timeoutMs: 1_000 });
    reassembler.push(frames[0]!, 0);
    expect(reassembler.stats().pending).toBe(1);
    reassembler.evictExpired(2_000);
    expect(reassembler.stats().pending).toBe(0);
    expect(reassembler.stats().expired).toBe(1);
  });

  it("borne le nombre de paquets partiels suivis", () => {
    // Un pair hostile peut inonder de premiers fragments jamais complétés.
    const reassembler = new Reassembler({ maxPending: 4 });
    for (let i = 0; i < 50; i++) {
      const frames = fragment(
        makeFrame({ packetId: Uint8Array.from([i, 0, 0, 0, 0, 1]), payload: new Uint8Array(300) }),
        BLE_MAX_FRAME,
      );
      reassembler.push(frames[0]!, i);
    }
    expect(reassembler.stats().pending).toBeLessThanOrEqual(4);
  });

  it("abandonne un paquet dont le fragCount est incohérent", () => {
    const reassembler = new Reassembler();
    const packetId = Uint8Array.from([9, 9, 9, 9, 9, 9]);
    reassembler.push(makeFrame({ packetId, fragIndex: 0, fragCount: 3 }), 0);
    // Même packetId, fragCount différent : trame forgée ou collision d'identifiant.
    expect(reassembler.push(makeFrame({ packetId, fragIndex: 0, fragCount: 5 }), 1)).toBeNull();
    expect(reassembler.stats().pending).toBe(0);
  });

  it("signale les fragments manquants", () => {
    const frames = fragment(makeFrame({ payload: new Uint8Array(500) }), BLE_MAX_FRAME);
    const reassembler = new Reassembler();
    reassembler.push(frames[0]!, 0);
    reassembler.push(frames[2]!, 0);
    expect(reassembler.missingFragments(frames[0]!.packetId)).toEqual([1, 3]);
  });
});

describe("FRAG_NACK", () => {
  it("survit à un aller-retour d'encodage", () => {
    const packetId = Uint8Array.from([1, 1, 2, 2, 3, 3]);
    const decoded = decodeFragNack(encodeFragNack(packetId, [2, 5, 9]));
    expect(toHex(decoded.packetId)).toBe("010102020303");
    expect(decoded.missing).toEqual([2, 5, 9]);
  });

  it("rejette une charge tronquée", () => {
    expect(() => decodeFragNack(new Uint8Array(3))).toThrow(WireError);
  });
});

describe("complétion par paliers", () => {
  it("porte les charges courtes au premier palier", () => {
    expect(pad(new Uint8Array(3)).length).toBe(64);
    expect(pad(new Uint8Array(50)).length).toBe(64);
    expect(pad(new Uint8Array(100)).length).toBe(256);
  });

  it("rend deux messages de longueurs différentes indiscernables", () => {
    // Tout l'objet de la complétion : sans elle, « ok » et « rendez-vous
    // annulé » se distinguent à la seule longueur, sans rien déchiffrer.
    expect(pad(new TextEncoder().encode("ok")).length).toBe(
      pad(new TextEncoder().encode("rendez-vous annulé")).length,
    );
  });

  it("restitue exactement la charge d'origine", () => {
    for (const length of [0, 1, 59, 60, 251, 252, 1_019, 5_000]) {
      const payload = Uint8Array.from({ length }, (_, i) => i % 256);
      expect(toHex(unpad(pad(payload)))).toBe(toHex(payload));
    }
  });

  it("suit les paliers annoncés", () => {
    for (const bucket of PADDING_BUCKETS) expect(bucketFor(bucket - 4)).toBe(bucket);
  });

  it("complète au-delà du plus grand palier sans plafonner", () => {
    const largest = PADDING_BUCKETS[PADDING_BUCKETS.length - 1]!;
    const payload = new Uint8Array(largest + 100);
    expect(pad(payload).length).toBe(largest * 2);
    expect(unpad(pad(payload)).length).toBe(payload.length);
  });

  it("rejette une longueur déclarée incohérente", () => {
    const forged = new Uint8Array(64);
    forged[0] = 0xff; // longueur énorme dans un tampon de 64 octets
    expect(() => unpad(forged)).toThrow(PaddingError);
  });
});
