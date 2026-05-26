import type { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { Room, getOrCreateRoom, maybeCloseRoom } from './room.js';

interface Request {
  id: string;
  method: string;
  params?: any;
}

function send(socket: WebSocket, payload: object) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
}

function reply(socket: WebSocket, id: string, ok: boolean, data?: any, error?: string) {
  send(socket, { id, ok, data, error });
}

export async function handleConnection(socket: WebSocket, roomId: string) {
  const peerId = randomUUID();
  let room: Room | undefined;

  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  socket.on('message', async (raw) => {
    let req: Request;
    try {
      req = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!req.method || !req.id) return;

    await ready;
    if (!room) return;

    try {
      await handleRequest(room, peerId, req);
    } catch (err: any) {
      console.error(`[signaling] ${req.method} error:`, err.message);
      reply(socket, req.id, false, undefined, err.message);
    }
  });

  socket.on('close', () => {
    if (!room) return;
    console.log(`[signaling] peer ${peerId.slice(0, 8)} left room ${roomId}`);
    room.removePeer(peerId);
    room.broadcast(peerId, { event: 'peerLeft', data: { peerId } });
    maybeCloseRoom(roomId);
  });

  room = await getOrCreateRoom(roomId);
  room.addPeer(peerId, socket);
  console.log(`[signaling] peer ${peerId.slice(0, 8)} joined room ${roomId}`);

  send(socket, { event: 'welcome', data: { peerId, roomId } });

  resolveReady();
}

async function handleRequest(room: Room, peerId: string, req: Request) {
  const peer = room.getPeer(peerId);
  if (!peer) throw new Error('peer not found');

  switch (req.method) {
    case 'getRtpCapabilities': {
      reply(peer.socket, req.id, true, room.router.rtpCapabilities);
      return;
    }

    case 'createWebRtcTransport': {
      const transport = await room.createTransport(peer);
      reply(peer.socket, req.id, true, {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
      return;
    }

    case 'connectTransport': {
      const { transportId, dtlsParameters } = req.params;
      const transport = peer.transports.get(transportId);
      if (!transport) throw new Error('transport not found');
      console.log(`[signaling] connectTransport peer=${peer.id.slice(0, 8)} transportId=${transportId.slice(0, 8)}`);
      await transport.connect({ dtlsParameters });
      reply(peer.socket, req.id, true);
      return;
    }

    case 'produce': {
      const { transportId, kind, rtpParameters, appData } = req.params;
      const transport = peer.transports.get(transportId);
      if (!transport) throw new Error('transport not found');
      const source: 'camera' | 'screen' = appData?.source === 'screen' ? 'screen' : 'camera';
      console.log(`[signaling] produce START peer=${peer.id.slice(0, 8)} kind=${kind} source=${source}`);
      const producer = await transport.produce({ kind, rtpParameters, appData: { source } });
      peer.producers.set(producer.id, producer);

      producer.on('transportclose', () => {
        console.log(`[signaling] producer transportclose peer=${peer.id.slice(0, 8)} kind=${kind}`);
        producer.close();
        peer.producers.delete(producer.id);
      });

      reply(peer.socket, req.id, true, { id: producer.id });

      const others = room.otherPeers(peer.id);
      console.log(
        `[signaling] produce DONE peer=${peer.id.slice(0, 8)} kind=${kind} source=${source} producerId=${producer.id.slice(0, 8)} -> broadcasting to ${others.length} other peer(s)`,
      );
      room.broadcast(peer.id, {
        event: 'newProducer',
        data: { producerId: producer.id, peerId: peer.id, kind: producer.kind, source },
      });
      return;
    }

    case 'closeProducer': {
      const { producerId } = req.params;
      const producer = peer.producers.get(producerId);
      if (!producer) throw new Error('producer not found');
      producer.close();
      peer.producers.delete(producerId);
      reply(peer.socket, req.id, true);
      return;
    }

    case 'consume': {
      const { transportId, producerId, rtpCapabilities } = req.params;
      if (!room.router.canConsume({ producerId, rtpCapabilities })) {
        throw new Error('cannot consume');
      }
      const transport = peer.transports.get(transportId);
      if (!transport) throw new Error('transport not found');

      const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: true,
      });
      peer.consumers.set(consumer.id, consumer);

      consumer.on('transportclose', () => {
        consumer.close();
        peer.consumers.delete(consumer.id);
      });
      consumer.on('producerclose', () => {
        consumer.close();
        peer.consumers.delete(consumer.id);
        send(peer.socket, { event: 'consumerClosed', data: { consumerId: consumer.id } });
      });

      reply(peer.socket, req.id, true, {
        id: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });
      return;
    }

    case 'resumeConsumer': {
      const { consumerId } = req.params;
      const consumer = peer.consumers.get(consumerId);
      if (!consumer) throw new Error('consumer not found');
      await consumer.resume();
      reply(peer.socket, req.id, true);
      return;
    }

    case 'getExistingProducers': {
      const others = room.otherPeers(peer.id);
      const list = others.flatMap((p) =>
        [...p.producers.values()].map((prod) => ({
          producerId: prod.id,
          peerId: p.id,
          kind: prod.kind,
          source: (prod.appData as { source?: 'camera' | 'screen' }).source ?? 'camera',
        })),
      );
      console.log(
        `[signaling] getExistingProducers by peer=${peer.id.slice(0, 8)}: ${others.length} other peer(s), ${list.length} producer(s) -> ${JSON.stringify(
          list.map((p) => ({ peer: p.peerId.slice(0, 8), kind: p.kind, source: p.source })),
        )}`,
      );
      reply(peer.socket, req.id, true, list);
      return;
    }

    default:
      throw new Error(`unknown method: ${req.method}`);
  }
}
