import type {
  Router,
  WebRtcTransport,
  Producer,
  Consumer,
  RtpCapabilities,
  DtlsState,
} from 'mediasoup/types';
import type { WebSocket } from 'ws';
import { createRouter, webRtcTransportOptions } from './mediasoup.js';

export interface Peer {
  id: string;
  socket: WebSocket;
  transports: Map<string, WebRtcTransport>;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
  rtpCapabilities?: RtpCapabilities;
}

export class Room {
  readonly id: string;
  readonly router: Router;
  private peers = new Map<string, Peer>();

  private constructor(id: string, router: Router) {
    this.id = id;
    this.router = router;
  }

  static async create(id: string): Promise<Room> {
    const router = await createRouter();
    console.log(`[room ${id}] created (router ${router.id.slice(0, 8)})`);
    return new Room(id, router);
  }

  addPeer(id: string, socket: WebSocket): Peer {
    const peer: Peer = {
      id,
      socket,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
    };
    this.peers.set(id, peer);
    return peer;
  }

  removePeer(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.producers.forEach((p) => p.close());
    peer.consumers.forEach((c) => c.close());
    peer.transports.forEach((t) => t.close());
    this.peers.delete(id);
  }

  getPeer(id: string): Peer | undefined {
    return this.peers.get(id);
  }

  otherPeers(selfId: string): Peer[] {
    return [...this.peers.values()].filter((p) => p.id !== selfId);
  }

  isEmpty(): boolean {
    return this.peers.size === 0;
  }

  broadcast(excludeId: string, message: object): void {
    const json = JSON.stringify(message);
    for (const peer of this.peers.values()) {
      if (peer.id === excludeId) continue;
      if (peer.socket.readyState === peer.socket.OPEN) peer.socket.send(json);
    }
  }

  async createTransport(peer: Peer): Promise<WebRtcTransport> {
    const transport = await this.router.createWebRtcTransport(webRtcTransportOptions);
    peer.transports.set(transport.id, transport);

    transport.on('dtlsstatechange', (state: DtlsState) => {
      if (state === 'closed') transport.close();
    });

    return transport;
  }

  close(): void {
    console.log(`[room ${this.id}] closed`);
    this.router.close();
  }
}

const rooms = new Map<string, Room>();
const pendingCreates = new Map<string, Promise<Room>>();

export async function getOrCreateRoom(id: string): Promise<Room> {
  const existing = rooms.get(id);
  if (existing) return existing;

  const pending = pendingCreates.get(id);
  if (pending) return pending;

  const promise = Room.create(id).then((room) => {
    rooms.set(id, room);
    pendingCreates.delete(id);
    return room;
  });
  pendingCreates.set(id, promise);
  return promise;
}

export function maybeCloseRoom(id: string): void {
  const room = rooms.get(id);
  if (!room) return;
  if (!room.isEmpty()) return;
  room.close();
  rooms.delete(id);
}
