/**
 * Interface de transport.
 *
 * Tout ce que le cœur exige d'un transport : livrer des trames opaques de taille
 * bornée, et signaler celles qu'il reçoit. BLE, Wi-Fi local, USB, audio,
 * QR code — et le transport simulé des tests — s'y conforment de la même façon.
 *
 * Un transport **n'a pas à être fiable, ordonné, ni bidirectionnel sur une même
 * connexion.** Le cœur suppose des pertes, du désordre et des ruptures.
 */
import { BLE_MAX_FRAME } from "./wire.js";

export enum NodeRole {
  /** Téléphone : émet et reçoit en BLE, budget batterie contraint. */
  PEER = 0,
  /**
   * Ordinateur ou tablette sur secteur. Opère en BLE *central* — donc sans
   * dépendre du mode *peripheral*, mal pris en charge par les OS de bureau — et
   * ponte les grappes BLE sur le réseau local. Voir docs/PROTOCOL.md §1.1.
   */
  SUPERNODE = 1,
}

export interface TransportPeer {
  readonly id: string;
  readonly role: NodeRole;
  /** Puissance reçue si le transport la connaît, pour information seulement. */
  readonly signalStrength?: number;
}

export type FrameReceiver = (bytes: Uint8Array, peerId: string) => void;

export interface Transport {
  readonly name: string;
  /**
   * Taille maximale d'une trame livrable en un envoi. Le cœur fragmente en
   * conséquence. Profil BLE conservateur : 185 octets.
   */
  readonly maxFrameSize: number;
  /** Diffuse à tous les pairs joignables, ou cible un pair précis. */
  send(bytes: Uint8Array, peerId?: string): void;
  setReceiver(receiver: FrameReceiver): void;
  peers(): readonly TransportPeer[];
}

export const BLE_TRANSPORT_PROFILE = { maxFrameSize: BLE_MAX_FRAME } as const;
/** Le réseau local n'a pas les contraintes du BLE : on y passe des trames entières. */
export const LAN_TRANSPORT_PROFILE = { maxFrameSize: 65_536 } as const;
