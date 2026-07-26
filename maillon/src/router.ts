/**
 * Inondation contrôlée — docs/PROTOCOL.md §3.
 *
 * L'inondation naïve avec TTL s'effondre dès que la densité monte : chaque nœud
 * rediffuse tout, les collisions radio explosent, la batterie fond. C'est la
 * « tempête de diffusion ». Trois correctifs combinés, tous vérifiés en
 * simulation :
 *
 *   1. probabilité de rediffusion inversement proportionnelle à la densité ;
 *   2. gigue aléatoire avant émission, pour désynchroniser les voisins ;
 *   3. suppression par comptage : renoncer si le voisinage est déjà couvert.
 *
 * Le module est **sans effet de bord et sans horloge** : il rend des décisions,
 * il ne les exécute pas. C'est ce qui le rend testable de façon déterministe.
 */
import type { SeenCache } from "./dedup.js";
import { Flags, hasFlag, type Frame } from "./wire.js";

export interface RouterOptions {
  /**
   * Constante de couverture K de `p = K / voisins`. À 3, un nœud entouré de
   * trois pairs relaie systématiquement ; au milieu de trente, une fois sur dix.
   */
  readonly densityConstant?: number;
  readonly minProbability?: number;
  /** Nombre de rediffusions entendues au-delà duquel on renonce à émettre. */
  readonly suppressThreshold?: number;
  readonly jitterMaxMs?: number;
  /** Les super-nœuds parlent tôt : ils couvrent le voisinage à la place des téléphones. */
  readonly supernodeJitterMaxMs?: number;
  readonly priorityJitterMaxMs?: number;
}

export type RelayReason =
  | "duplicate"
  | "ttl-exhausted"
  | "not-relayable"
  | "density-suppressed"
  | "scheduled";

export interface RelayDecision {
  readonly relay: boolean;
  readonly reason: RelayReason;
  /** Délai avant émission, en millisecondes. Pertinent si `relay` est vrai. */
  readonly delayMs: number;
}

export interface RelayContext {
  readonly neighborCount: number;
  readonly isSupernode: boolean;
  /** Tirage dans [0, 1) — injecté pour rendre les tests déterministes. */
  readonly random: () => number;
}

const DUPLICATE: RelayDecision = { relay: false, reason: "duplicate", delayMs: 0 };
const TTL_EXHAUSTED: RelayDecision = { relay: false, reason: "ttl-exhausted", delayMs: 0 };
const NOT_RELAYABLE: RelayDecision = { relay: false, reason: "not-relayable", delayMs: 0 };
const SUPPRESSED: RelayDecision = { relay: false, reason: "density-suppressed", delayMs: 0 };

export class FloodRouter {
  private readonly densityConstant: number;
  private readonly minProbability: number;
  private readonly suppressThreshold: number;
  private readonly jitterMaxMs: number;
  private readonly supernodeJitterMaxMs: number;
  private readonly priorityJitterMaxMs: number;

  constructor(options: RouterOptions = {}) {
    this.densityConstant = options.densityConstant ?? 3;
    this.minProbability = options.minProbability ?? 0.15;
    this.suppressThreshold = options.suppressThreshold ?? 3;
    this.jitterMaxMs = options.jitterMaxMs ?? 250;
    this.supernodeJitterMaxMs = options.supernodeJitterMaxMs ?? 40;
    this.priorityJitterMaxMs = options.priorityJitterMaxMs ?? 25;
  }

  /**
   * Décide du sort d'une trame reçue. `alreadySeen` doit refléter l'état du
   * cache **avant** enregistrement de la trame.
   */
  decide(frame: Frame, alreadySeen: boolean, context: RelayContext): RelayDecision {
    if (alreadySeen) return DUPLICATE;
    if (!hasFlag(frame, Flags.RELAYABLE)) return NOT_RELAYABLE;
    if (frame.ttl <= 1) return TTL_EXHAUSTED;

    const isPriority = hasFlag(frame, Flags.PRIORITY);
    // Deux catégories échappent à la loterie de densité :
    //
    //  - les trames prioritaires (appel de détresse) : mieux vaut un excès de
    //    trafic qu'un appel perdu ;
    //  - les super-nœuds, systématiquement. Ce n'est pas une faveur, c'est une
    //    nécessité topologique : un super-nœud est presque toujours un *point
    //    d'articulation* du graphe — le seul chemin entre deux grappes. Le
    //    faire renoncer avec la probabilité `1 - K/voisins`, c'est amputer tout
    //    le réseau situé derrière lui. La modération probabiliste n'est sûre
    //    que là où il existe une redondance de chemins, ce qui est le cas entre
    //    téléphones d'une même grappe et précisément pas au niveau d'un pont.
    //    Et comme un super-nœud est sur secteur, l'économie qu'on lui
    //    épargnerait n'avait de toute façon aucune valeur.
    if (!isPriority && !context.isSupernode) {
      if (context.random() > this.rebroadcastProbability(context.neighborCount)) return SUPPRESSED;
    }
    return { relay: true, reason: "scheduled", delayMs: this.jitter(context, isPriority) };
  }

  rebroadcastProbability(neighborCount: number): number {
    const p = this.densityConstant / Math.max(1, neighborCount);
    return Math.min(1, Math.max(this.minProbability, p));
  }

  private jitter(context: RelayContext, isPriority: boolean): number {
    const ceiling = isPriority
      ? this.priorityJitterMaxMs
      : context.isSupernode
        ? this.supernodeJitterMaxMs
        : this.jitterMaxMs;
    return Math.floor(context.random() * ceiling);
  }

  /**
   * Dernier arbitrage, à l'échéance de la gigue : si le voisinage a déjà
   * rediffusé la trame, se taire. C'est ici que l'économie de batterie et de
   * spectre se réalise vraiment.
   *
   * Les super-nœuds en sont exemptés pour la même raison qu'en amont : le fait
   * que trois voisins aient rediffusé prouve que *leur* voisinage est couvert,
   * pas que la grappe située derrière le pont l'est.
   */
  confirmAtFireTime(key: string, seen: SeenCache, isPriority: boolean, isSupernode = false): boolean {
    if (isPriority || isSupernode) return true;
    return seen.heardCount(key) < this.suppressThreshold;
  }
}
