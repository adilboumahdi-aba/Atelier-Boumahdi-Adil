/**
 * Nœud du maillage : assemble format binaire, routage, magasin de relais et
 * anti-entropie.
 *
 * **Sans horloge propre.** Toute progression du temps passe par `tick(now)` et
 * `receive(bytes, peerId, now)`. Aucun `setTimeout`, aucun `Date.now()`. C'est
 * ce qui permet de simuler des réseaux entiers de façon déterministe et
 * reproductible — et donc de tester la partie la plus difficile du système sans
 * un seul appareil radio.
 */
import { toHex } from "./bytes.js";
import { BloomFilter } from "./bloom.js";
import { systemRng, type Rng } from "./crypto/primitives.js";
import { SeenCache, type SeenCacheOptions } from "./dedup.js";
import {
  AnonymityMode,
  ownEphemeralId,
  type Identity,
} from "./identity.js";
import { FloodRouter, type RouterOptions } from "./router.js";
import { RelayStore, StorePriority, type RelayStoreOptions } from "./store.js";
import { NodeRole, type Transport } from "./transport.js";
import {
  BROADCAST_ID,
  DEFAULT_TTL,
  Flags,
  FrameType,
  ID_SIZE,
  MAX_TTL,
  PACKET_ID_SIZE,
  Reassembler,
  decodeFrame,
  encodeFrame,
  fragment,
  frameKeyHex,
  hasFlag,
  isBroadcast,
  type Frame,
} from "./wire.js";

/** Délai en deçà duquel on ne répond pas à un résumé, pour éviter le ping-pong. */
const DIGEST_REPLY_GUARD_MS = 1_000;

export interface MeshNodeOptions {
  readonly identity: Identity;
  readonly transports: readonly Transport[];
  readonly role?: NodeRole;
  readonly anonymity?: AnonymityMode;
  readonly rng?: Rng;
  readonly router?: RouterOptions;
  readonly store?: RelayStoreOptions;
  readonly seen?: SeenCacheOptions;
  readonly ttl?: number;
  /** Délai au-delà duquel un voisin silencieux est considéré parti. */
  readonly neighborTimeoutMs?: number;
  /** Période d'émission des HELLO. */
  readonly helloIntervalMs?: number;
  /** Plafond de trames poussées lors d'une réconciliation, pour un contact bref. */
  readonly reconcileBatchSize?: number;
  /**
   * Période de réconciliation anti-entropie avec chaque voisin connu.
   *
   * Une réconciliation déclenchée uniquement à la découverte d'un voisin ne
   * suffit pas : un appareil qui sort de portée puis revient avant l'expiration
   * du voisinage — cas très banal, il suffit de s'éloigner une minute — ne
   * serait jamais réconcilié, et le stockage-transfert échouerait en silence.
   */
  readonly reconcileIntervalMs?: number;
  /**
   * Source de temps consultée lorsqu'un transport livre une trame sans
   * horodatage. `() => Date.now()` en production, l'horloge du simulateur dans
   * les tests. Le nœud n'appelle jamais `Date.now()` de lui-même.
   */
  readonly clock?: () => number;
}

export interface DeliveredMessage {
  readonly frame: Frame;
  readonly payload: Uint8Array;
}

export type DeliveryHandler = (message: DeliveredMessage) => void;

interface Neighbor {
  readonly peerId: string;
  ephemeralId: string;
  role: NodeRole;
  lastSeen: number;
}

interface PendingRelay {
  readonly key: string;
  readonly frame: Frame;
  readonly fireAt: number;
  readonly isPriority: boolean;
}

export interface MeshNodeStats {
  readonly received: number;
  readonly duplicates: number;
  readonly relayed: number;
  readonly relaySuppressed: number;
  readonly delivered: number;
  readonly originated: number;
  readonly reconciledIn: number;
  readonly reconciledOut: number;
  readonly neighborCount: number;
  readonly storeSize: number;
  readonly seenSize: number;
}

export class MeshNode {
  readonly role: NodeRole;
  private readonly identity: Identity;
  private readonly transports: readonly Transport[];
  private readonly anonymity: AnonymityMode;
  private readonly rng: Rng;
  private readonly router: FloodRouter;
  private readonly store: RelayStore;
  private readonly seen: SeenCache;
  private readonly reassembler = new Reassembler();
  private readonly neighbors = new Map<string, Neighbor>();
  private readonly strictIdCache = new Map<number, Uint8Array>();
  private readonly pending: PendingRelay[] = [];
  private readonly handlers: DeliveryHandler[] = [];
  /** Dernier instant où nous avons envoyé un résumé à ce pair. */
  private readonly lastDigestAt = new Map<string, number>();
  private readonly ttl: number;
  private readonly neighborTimeoutMs: number;
  private readonly helloIntervalMs: number;
  private readonly reconcileBatchSize: number;
  private readonly reconcileIntervalMs: number;
  private readonly maxFrameSize: number;
  private lastHelloAt = Number.NEGATIVE_INFINITY;

  private counters = {
    received: 0,
    duplicates: 0,
    relayed: 0,
    relaySuppressed: 0,
    delivered: 0,
    originated: 0,
    reconciledIn: 0,
    reconciledOut: 0,
  };

  constructor(options: MeshNodeOptions) {
    this.identity = options.identity;
    this.transports = options.transports;
    this.role = options.role ?? NodeRole.PEER;
    this.anonymity = options.anonymity ?? AnonymityMode.DISCOVERABLE;
    this.rng = options.rng ?? systemRng;
    this.router = new FloodRouter(options.router);
    this.seen = new SeenCache(options.seen);
    this.ttl = options.ttl ?? DEFAULT_TTL;
    this.neighborTimeoutMs = options.neighborTimeoutMs ?? 90_000;
    this.helloIntervalMs = options.helloIntervalMs ?? 20_000;
    this.reconcileBatchSize = options.reconcileBatchSize ?? 32;
    this.reconcileIntervalMs = options.reconcileIntervalMs ?? 30_000;

    // Un super-nœud n'a pas de contrainte de batterie : il garde bien davantage,
    // ce qui est précisément son intérêt comme épine dorsale du réseau.
    this.store = new RelayStore(
      options.store ?? { maxEntries: this.role === NodeRole.SUPERNODE ? 8192 : 256 },
    );

    // Fragmenter au plus petit dénominateur commun : une trame doit pouvoir
    // franchir n'importe lequel des transports disponibles.
    this.maxFrameSize = this.transports.reduce(
      (min, transport) => Math.min(min, transport.maxFrameSize),
      Number.POSITIVE_INFINITY,
    );

    this.clock = options.clock;
    for (const transport of this.transports) {
      transport.setReceiver((bytes, peerId) => this.receive(bytes, peerId, this.currentTime()));
    }
  }

  private readonly clock: (() => number) | undefined;

  /**
   * Dernier instant connu. Sert de repli lorsqu'aucune horloge n'est fournie :
   * le nœud réutilise alors l'instant du dernier `tick`.
   */
  private lastKnownTime = 0;

  private currentTime(): number {
    return this.clock?.() ?? this.lastKnownTime;
  }

  onDelivery(handler: DeliveryHandler): void {
    this.handlers.push(handler);
  }

  ephemeralId(now: number): Uint8Array {
    return ownEphemeralId(this.identity, now, this.anonymity, this.rng, this.strictIdCache);
  }

  get neighborCount(): number {
    return this.neighbors.size;
  }

  get storeSize(): number {
    return this.store.size;
  }

  // -------------------------------------------------------------------------
  // Émission
  // -------------------------------------------------------------------------

  /** Crée et émet une trame. Retourne les fragments effectivement transmis. */
  originate(
    type: FrameType,
    payload: Uint8Array,
    now: number,
    options: {
      readonly dst?: Uint8Array;
      readonly flags?: number;
      readonly ttl?: number;
      readonly priority?: StorePriority;
      readonly peerId?: string;
    } = {},
  ): Frame[] {
    this.lastKnownTime = now;
    const base: Frame = {
      version: 1,
      type,
      flags: (options.flags ?? Flags.RELAYABLE) | (this.role === NodeRole.SUPERNODE ? Flags.SUPERNODE : 0),
      ttl: Math.min(MAX_TTL, options.ttl ?? this.ttl),
      packetId: this.rng(PACKET_ID_SIZE),
      src: this.ephemeralId(now),
      dst: options.dst ?? BROADCAST_ID,
      fragIndex: 0,
      fragCount: 1,
      payload,
    };

    const fragments = fragment(base, this.maxFrameSize);
    for (const frame of fragments) {
      // Marquer nos propres trames comme vues : une rediffusion par un voisin ne
      // doit pas nous les faire relayer à notre tour.
      this.seen.add(frameKeyHex(frame), now);
      if (hasFlag(frame, Flags.RELAYABLE)) {
        this.store.put(frame, now, options.priority ?? StorePriority.NORMAL);
      }
      this.transmit(frame, options.peerId);
    }
    this.counters.originated++;
    return fragments;
  }

  /** Diffusion générale d'une charge applicative. */
  broadcast(payload: Uint8Array, now: number): Frame[] {
    return this.originate(FrameType.MESSAGE, payload, now, { flags: Flags.RELAYABLE });
  }

  /** Message adressé à un identifiant éphémère précis. */
  sendTo(dst: Uint8Array, payload: Uint8Array, now: number): Frame[] {
    if (dst.length !== ID_SIZE) throw new Error(`dst doit faire ${ID_SIZE} octets`);
    return this.originate(FrameType.MESSAGE, payload, now, { dst, flags: Flags.RELAYABLE });
  }

  /**
   * Appel de détresse : priorité maximale, TTL maximal, dernier à être évincé.
   * Non chiffré à dessein — son objet est d'être lu par quiconque peut aider.
   */
  sendSos(payload: Uint8Array, now: number): Frame[] {
    return this.originate(FrameType.SOS, payload, now, {
      flags: Flags.RELAYABLE | Flags.PRIORITY | Flags.SIGNED,
      ttl: MAX_TTL,
      priority: StorePriority.EMERGENCY,
    });
  }

  /** Annonce de voisinage : rôle et densité observée. */
  sendHello(now: number): void {
    this.lastHelloAt = now;
    const payload = new Uint8Array([this.role, Math.min(255, this.neighbors.size)]);
    this.originate(FrameType.HELLO, payload, now, { flags: 0, ttl: 1 });
  }

  private transmit(frame: Frame, peerId?: string): void {
    const bytes = encodeFrame(frame);
    for (const transport of this.transports) transport.send(bytes, peerId);
  }

  // -------------------------------------------------------------------------
  // Réception
  // -------------------------------------------------------------------------

  receive(bytes: Uint8Array, peerId: string, now: number): void {
    this.lastKnownTime = Math.max(this.lastKnownTime, now);
    let frame: Frame;
    try {
      frame = decodeFrame(bytes);
    } catch {
      // Trame illisible : bruit radio ou pair hostile. On l'ignore en silence,
      // sans jamais laisser une exception remonter dans la boucle du transport.
      return;
    }
    this.counters.received++;

    const key = frameKeyHex(frame);
    const alreadySeen = this.seen.has(key);
    if (alreadySeen) {
      // Compter la rediffusion : c'est ce compteur qui nous fera renoncer à
      // émettre si le voisinage est déjà couvert.
      this.seen.noteHeard(key);
      this.counters.duplicates++;
      return;
    }

    if (frame.type === FrameType.HELLO) {
      this.seen.add(key, now);
      this.onHello(frame, peerId, now);
      return;
    }
    if (frame.type === FrameType.DIGEST) {
      this.seen.add(key, now);
      this.onDigest(frame, peerId, now);
      return;
    }

    const decision = this.router.decide(frame, alreadySeen, {
      neighborCount: this.neighbors.size,
      isSupernode: this.role === NodeRole.SUPERNODE,
      random: () => this.random(),
    });
    this.seen.add(key, now);

    const forUs = isBroadcast(frame) || this.isAddressedToUs(frame, now);
    if (forUs) this.deliverLocally(frame, now);

    if (hasFlag(frame, Flags.RELAYABLE)) {
      this.store.put(
        frame,
        now,
        frame.type === FrameType.SOS ? StorePriority.EMERGENCY : StorePriority.NORMAL,
      );
    }

    // Une trame qui nous est explicitement adressée s'arrête ici : la relayer
    // encore ne ferait que du bruit.
    if (forUs && !isBroadcast(frame)) return;

    if (decision.relay) {
      this.pending.push({
        key,
        frame,
        fireAt: now + decision.delayMs,
        isPriority: hasFlag(frame, Flags.PRIORITY),
      });
    } else if (decision.reason === "density-suppressed") {
      this.counters.relaySuppressed++;
    }
  }

  private isAddressedToUs(frame: Frame, now: number): boolean {
    const ours = toHex(this.ephemeralId(now));
    return toHex(frame.dst) === ours;
  }

  private deliverLocally(frame: Frame, now: number): void {
    const complete = this.reassembler.push(frame, now);
    if (complete === null) return;
    this.counters.delivered++;
    for (const handler of this.handlers) {
      handler({ frame: complete, payload: complete.payload });
    }
  }

  private onHello(frame: Frame, peerId: string, now: number): void {
    const role = (frame.payload[0] ?? NodeRole.PEER) as NodeRole;
    const existing = this.neighbors.get(peerId);
    if (existing === undefined) {
      this.neighbors.set(peerId, { peerId, ephemeralId: toHex(frame.src), role, lastSeen: now });
      // Nouveau voisin : réconcilier tout de suite. Un contact peut être très
      // bref — on ne le repousse pas au prochain cycle périodique.
      this.sendDigest(peerId, now);
    } else {
      existing.lastSeen = now;
      existing.role = role;
      existing.ephemeralId = toHex(frame.src);
    }
  }

  // -------------------------------------------------------------------------
  // Anti-entropie
  // -------------------------------------------------------------------------

  /** Envoie à un pair le résumé des trames détenues. */
  sendDigest(peerId: string, now: number): void {
    this.lastDigestAt.set(peerId, now);
    this.originate(FrameType.DIGEST, this.store.digest().encode(), now, {
      flags: 0,
      ttl: 1,
      peerId,
    });
  }

  private onDigest(frame: Frame, peerId: string, now: number): void {
    let peerDigest: BloomFilter;
    try {
      peerDigest = BloomFilter.decode(frame.payload);
    } catch {
      return;
    }
    this.counters.reconciledIn++;

    const missing = this.store.framesMissingFrom(peerDigest, this.reconcileBatchSize);
    for (const stored of missing) {
      this.transmit(stored, peerId);
      this.counters.reconciledOut++;
    }

    // Répondre par notre propre résumé pour que l'échange soit symétrique — la
    // réconciliation n'est complète que dans les deux sens. Le garde-fou tient
    // au fait qu'on ne réponde pas si l'on vient soi-même d'émettre un résumé :
    // sinon deux nœuds se renverraient des résumés indéfiniment. L'échange
    // converge ainsi en deux temps.
    const sentAt = this.lastDigestAt.get(peerId);
    if (sentAt === undefined || now - sentAt > DIGEST_REPLY_GUARD_MS) this.sendDigest(peerId, now);
  }

  // -------------------------------------------------------------------------
  // Progression du temps
  // -------------------------------------------------------------------------

  tick(now: number): void {
    this.lastKnownTime = Math.max(this.lastKnownTime, now);
    this.fireDueRelays(now);
    this.expireNeighbors(now);

    if (now - this.lastHelloAt >= this.helloIntervalMs) this.sendHello(now);
    this.reconcilePeriodically(now);

    this.seen.evictExpired(now);
    this.store.evictExpired(now);
    this.reassembler.evictExpired(now);
  }

  private fireDueRelays(now: number): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const relay = this.pending[i]!;
      if (relay.fireAt > now) continue;
      this.pending.splice(i, 1);

      if (
        !this.router.confirmAtFireTime(
          relay.key,
          this.seen,
          relay.isPriority,
          this.role === NodeRole.SUPERNODE,
        )
      ) {
        // Le voisinage a déjà couvert cette trame : se taire. C'est ici que
        // l'économie de spectre et de batterie se concrétise.
        this.counters.relaySuppressed++;
        continue;
      }
      this.transmit({ ...relay.frame, ttl: relay.frame.ttl - 1 });
      this.counters.relayed++;
    }
  }

  /**
   * Réconciliation périodique avec chaque voisin connu.
   *
   * Indispensable en complément du déclenchement à la découverte : un pair qui
   * sort de portée puis revient avant l'expiration de son voisinage ne serait
   * jamais réconcilié autrement, et les trames stockées à son intention ne lui
   * parviendraient jamais.
   */
  private reconcilePeriodically(now: number): void {
    for (const peerId of this.neighbors.keys()) {
      const sentAt = this.lastDigestAt.get(peerId);
      if (sentAt === undefined || now - sentAt >= this.reconcileIntervalMs) {
        this.sendDigest(peerId, now);
      }
    }
  }

  private expireNeighbors(now: number): void {
    for (const [peerId, neighbor] of this.neighbors) {
      if (now - neighbor.lastSeen > this.neighborTimeoutMs) {
        this.neighbors.delete(peerId);
        // Oublier la réconciliation : au retour du pair, il faudra la refaire.
        this.lastDigestAt.delete(peerId);
      }
    }
  }

  private random(): number {
    // 32 bits d'aléa ramenés dans [0, 1). Le `>>> 0` est indispensable : les
    // opérateurs binaires de JavaScript travaillent sur des entiers signés, et
    // sans lui tout octet de tête ≥ 128 donnerait un tirage négatif — donc
    // toujours inférieur au seuil, donc un relais systématique.
    const b = this.rng(4);
    return (((b[0]! << 24) | (b[1]! << 16) | (b[2]! << 8) | b[3]!) >>> 0) / 0x1_0000_0000;
  }

  stats(): MeshNodeStats {
    return {
      ...this.counters,
      neighborCount: this.neighbors.size,
      storeSize: this.store.size,
      seenSize: this.seen.size,
    };
  }
}
