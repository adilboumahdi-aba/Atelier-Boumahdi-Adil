/**
 * Simulateur de réseau radio à événements discrets.
 *
 * C'est la pièce qui rend le projet vérifiable : sans un seul appareil, on
 * éprouve ici la partie réellement difficile — routage multi-sauts, tempêtes de
 * diffusion, partitions, pertes, arrivées et départs de nœuds. Le temps est
 * simulé et l'aléa est à graine, donc **un échec est toujours reproductible.**
 *
 * Le modèle radio reste volontairement simple : portée binaire (deux nœuds
 * s'entendent ou non), latence avec gigue, taux de perte indépendant par lien.
 * Il ne modélise ni l'atténuation, ni les collisions au niveau physique — un
 * simulateur qui prétendrait le faire serait faux d'une autre manière. Ce qui
 * est mesuré ici, c'est la logique de protocole, pas la propagation.
 */
import { seededRng, type Rng } from "../crypto/primitives.js";
import { generateIdentity, type Identity } from "../identity.js";
import { MeshNode, type MeshNodeOptions } from "../node.js";
import { NodeRole, type FrameReceiver, type Transport, type TransportPeer } from "../transport.js";
import { BLE_MAX_FRAME } from "../wire.js";

interface DeliverEvent {
  readonly kind: "deliver";
  readonly at: number;
  readonly seq: number;
  readonly to: string;
  readonly from: string;
  readonly bytes: Uint8Array;
}

interface TickEvent {
  readonly kind: "tick";
  readonly at: number;
  readonly seq: number;
}

type SimEvent = DeliverEvent | TickEvent;

export interface SimNetworkOptions {
  readonly seed?: number;
  /** Latence de base d'un saut. Une connexion BLE réelle : quelques dizaines de ms. */
  readonly latencyMs?: number;
  readonly jitterMs?: number;
  /** Probabilité qu'une trame soit perdue sur un lien, dans [0, 1]. */
  readonly lossRate?: number;
  readonly tickIntervalMs?: number;
}

export interface SimNodeOptions {
  readonly role?: NodeRole;
  readonly identity?: Identity;
  readonly maxFrameSize?: number;
  readonly node?: Partial<Omit<MeshNodeOptions, "identity" | "transports" | "clock">>;
}

/** Trames livrées localement à un nœud, pour vérification dans les tests. */
export interface SimDelivery {
  readonly at: number;
  readonly payload: Uint8Array;
  readonly text: string;
}

export class SimNode {
  readonly deliveries: SimDelivery[] = [];

  constructor(
    readonly id: string,
    readonly identity: Identity,
    readonly mesh: MeshNode,
    readonly transport: SimTransport,
  ) {}

  get role(): NodeRole {
    return this.mesh.role;
  }
}

/** Transport simulé : remet ses trames au réseau, qui les propage aux voisins. */
export class SimTransport implements Transport {
  readonly name = "sim";
  private receiver: FrameReceiver | undefined;

  constructor(
    private readonly network: SimNetwork,
    private readonly nodeId: string,
    readonly maxFrameSize: number,
  ) {}

  send(bytes: Uint8Array, peerId?: string): void {
    this.network.enqueueSend(this.nodeId, bytes, peerId);
  }

  setReceiver(receiver: FrameReceiver): void {
    this.receiver = receiver;
  }

  deliver(bytes: Uint8Array, peerId: string): void {
    this.receiver?.(bytes, peerId);
  }

  peers(): readonly TransportPeer[] {
    return this.network.neighborsOf(this.nodeId).map((id) => ({
      id,
      role: this.network.node(id)?.role ?? NodeRole.PEER,
    }));
  }
}

export class SimNetwork {
  private readonly nodes = new Map<string, SimNode>();
  private readonly links = new Map<string, Set<string>>();
  private readonly queue: SimEvent[] = [];
  private readonly rng: Rng;
  private readonly latencyMs: number;
  private readonly jitterMs: number;
  private readonly lossRate: number;
  private readonly tickIntervalMs: number;
  private seq = 0;
  private clock = 0;
  private framesSent = 0;
  private framesDelivered = 0;
  private framesLost = 0;

  constructor(options: SimNetworkOptions = {}) {
    this.rng = seededRng(options.seed ?? 1);
    this.latencyMs = options.latencyMs ?? 30;
    this.jitterMs = options.jitterMs ?? 20;
    this.lossRate = options.lossRate ?? 0;
    this.tickIntervalMs = options.tickIntervalMs ?? 50;
  }

  get now(): number {
    return this.clock;
  }

  addNode(id: string, options: SimNodeOptions = {}): SimNode {
    if (this.nodes.has(id)) throw new Error(`nœud « ${id} » déjà présent`);
    const identity = options.identity ?? generateIdentity(this.rng);
    const transport = new SimTransport(this, id, options.maxFrameSize ?? BLE_MAX_FRAME);
    const mesh = new MeshNode({
      ...options.node,
      identity,
      transports: [transport],
      role: options.role ?? NodeRole.PEER,
      // Chaque nœud reçoit son propre flux d'aléa, dérivé de la graine du réseau :
      // la simulation reste reproductible sans que tous les nœuds tirent les
      // mêmes valeurs.
      rng: seededRng(this.rng(32)),
      clock: () => this.clock,
    });

    const node = new SimNode(id, identity, mesh, transport);
    mesh.onDelivery(({ payload }) => {
      node.deliveries.push({
        at: this.clock,
        payload,
        text: new TextDecoder().decode(payload),
      });
    });

    this.nodes.set(id, node);
    this.links.set(id, new Set());
    return node;
  }

  node(id: string): SimNode | undefined {
    return this.nodes.get(id);
  }

  requireNode(id: string): SimNode {
    const node = this.nodes.get(id);
    if (node === undefined) throw new Error(`nœud « ${id} » inconnu`);
    return node;
  }

  get nodeIds(): string[] {
    return [...this.nodes.keys()];
  }

  /** Portée radio mutuelle. */
  link(a: string, b: string): void {
    this.requireNode(a);
    this.requireNode(b);
    this.links.get(a)!.add(b);
    this.links.get(b)!.add(a);
  }

  unlink(a: string, b: string): void {
    this.links.get(a)?.delete(b);
    this.links.get(b)?.delete(a);
  }

  /** Chaîne linéaire : le cas qui exige réellement du multi-sauts. */
  chain(ids: readonly string[]): void {
    for (let i = 0; i + 1 < ids.length; i++) this.link(ids[i]!, ids[i + 1]!);
  }

  /** Tous à portée les uns des autres : le cas de forte densité. */
  fullMesh(ids: readonly string[]): void {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) this.link(ids[i]!, ids[j]!);
    }
  }

  /** Coupe toute liaison entre les deux groupes, sans toucher aux liens internes. */
  partition(groupA: readonly string[], groupB: readonly string[]): void {
    for (const a of groupA) for (const b of groupB) this.unlink(a, b);
  }

  neighborsOf(id: string): string[] {
    return [...(this.links.get(id) ?? [])];
  }

  /** Appelé par SimTransport. Propage à un pair précis ou à tout le voisinage. */
  enqueueSend(from: string, bytes: Uint8Array, peerId?: string): void {
    const targets = peerId !== undefined ? [peerId] : this.neighborsOf(from);
    for (const to of targets) {
      // Un envoi ciblé vers un pair hors de portée est simplement perdu : c'est
      // ce qui arrive quand un appareil s'éloigne entre deux trames.
      if (!this.links.get(from)?.has(to)) continue;
      this.framesSent++;
      if (this.random() < this.lossRate) {
        this.framesLost++;
        continue;
      }
      const delay = this.latencyMs + Math.floor(this.random() * this.jitterMs);
      this.push({ kind: "deliver", at: this.clock + delay, seq: this.seq++, to, from, bytes });
    }
  }

  /** Fait avancer le temps simulé jusqu'à `untilMs`. */
  run(untilMs: number): void {
    // Amorcer les tics s'ils ne le sont pas déjà.
    if (!this.queue.some((event) => event.kind === "tick")) {
      this.push({ kind: "tick", at: this.clock, seq: this.seq++ });
    }

    while (this.queue.length > 0) {
      const next = this.queue[0]!;
      if (next.at > untilMs) break;
      this.queue.shift();
      this.clock = next.at;

      if (next.kind === "deliver") {
        const target = this.nodes.get(next.to);
        if (target !== undefined) {
          this.framesDelivered++;
          target.transport.deliver(next.bytes, next.from);
        }
      } else {
        // Ordre d'itération stable : la reproductibilité en dépend.
        for (const node of this.nodes.values()) node.mesh.tick(this.clock);
        this.push({ kind: "tick", at: this.clock + this.tickIntervalMs, seq: this.seq++ });
      }
    }
    this.clock = Math.max(this.clock, untilMs);
  }

  private push(event: SimEvent): void {
    // Insertion ordonnée par (instant, numéro de séquence). Le numéro de
    // séquence départage les événements simultanés, sans quoi la simulation ne
    // serait pas reproductible.
    let low = 0;
    let high = this.queue.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      const candidate = this.queue[mid]!;
      if (candidate.at < event.at || (candidate.at === event.at && candidate.seq < event.seq)) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    this.queue.splice(low, 0, event);
  }

  private random(): number {
    const b = this.rng(4);
    return (((b[0]! << 24) | (b[1]! << 16) | (b[2]! << 8) | b[3]!) >>> 0) / 0x1_0000_0000;
  }

  stats(): { framesSent: number; framesDelivered: number; framesLost: number; now: number } {
    return {
      framesSent: this.framesSent,
      framesDelivered: this.framesDelivered,
      framesLost: this.framesLost,
      now: this.clock,
    };
  }
}
