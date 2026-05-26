import { Device } from 'mediasoup-client';
import type {
  Transport,
  Producer,
  DtlsParameters,
  RtpParameters,
  MediaKind,
} from 'mediasoup-client/types';
import { SignalingClient } from './signaling';

export type StreamSource = 'camera' | 'screen';

export interface RemoteStreamInfo {
  peerId: string;
  source: StreamSource;
  stream: MediaStream;
}

export interface RoomCallbacks {
  onRemoteStream: (info: RemoteStreamInfo) => void;
  onRemoteStreamClosed: (peerId: string, source: StreamSource) => void;
  onPeerLeft: (peerId: string) => void;
}

type StreamKey = `${string}:${StreamSource}`;
function key(peerId: string, source: StreamSource): StreamKey {
  return `${peerId}:${source}`;
}

export class Room {
  private signaling = new SignalingClient();
  private device = new Device();
  private sendTransport?: Transport;
  private recvTransport?: Transport;
  private cameraProducers = new Map<string, Producer>();
  private screenProducer?: Producer;
  private remoteStreams = new Map<StreamKey, MediaStream>();
  private consumerInfo = new Map<string, { peerId: string; source: StreamSource }>();
  private callbacks: RoomCallbacks;

  private setupReady: Promise<void>;
  private setupReadyResolve!: () => void;

  constructor(callbacks: RoomCallbacks) {
    this.callbacks = callbacks;
    this.setupReady = new Promise<void>((resolve) => {
      this.setupReadyResolve = resolve;
    });
  }

  isSharingScreen(): boolean {
    return !!this.screenProducer && !this.screenProducer.closed;
  }

  async join(serverUrl: string, localStream: MediaStream): Promise<void> {
    const t0 = performance.now();
    const log = (msg: string) => console.log(`[room +${(performance.now() - t0).toFixed(0)}ms] ${msg}`);

    log('connecting...');
    await this.signaling.connect(serverUrl);

    this.signaling.on('newProducer', (data) => {
      log(`event newProducer peer=${data.peerId.slice(0, 8)} kind=${data.kind} source=${data.source}`);
      this.consumeProducer(data.producerId, data.peerId, data.source).catch((e) =>
        console.error('[room] consumeProducer (newProducer) failed:', e),
      );
    });
    this.signaling.on('consumerClosed', (data) => {
      this.handleConsumerClosed(data.consumerId);
    });
    this.signaling.on('peerLeft', (data) => {
      const peerId = data.peerId;
      for (const source of ['camera', 'screen'] as StreamSource[]) {
        if (this.remoteStreams.delete(key(peerId, source))) {
          this.callbacks.onRemoteStreamClosed(peerId, source);
        }
      }
      this.callbacks.onPeerLeft(peerId);
    });

    log('getRtpCapabilities');
    const rtpCapabilities = await this.signaling.request('getRtpCapabilities');
    await this.device.load({ routerRtpCapabilities: rtpCapabilities });

    log('createSendTransport');
    await this.createSendTransport();
    log('createRecvTransport');
    await this.createRecvTransport();
    this.setupReadyResolve();

    log(`producing ${localStream.getTracks().length} local tracks`);
    for (const track of localStream.getTracks()) {
      const producer = await this.sendTransport!.produce({
        track,
        appData: { source: 'camera' },
      });
      this.cameraProducers.set(producer.id, producer);
      log(`  produced ${track.kind} (producerId=${producer.id.slice(0, 8)})`);
    }

    log('getExistingProducers');
    const existing: Array<{ producerId: string; peerId: string; kind: string; source: StreamSource }> =
      await this.signaling.request('getExistingProducers');
    log(
      `  got ${existing.length} existing producers: ${JSON.stringify(
        existing.map((p) => ({ peer: p.peerId.slice(0, 8), kind: p.kind, source: p.source })),
      )}`,
    );
    for (const p of existing) {
      await this.consumeProducer(p.producerId, p.peerId, p.source);
    }
    log('join complete');
  }

  async shareScreen(): Promise<MediaStream> {
    if (this.screenProducer && !this.screenProducer.closed) {
      throw new Error('already sharing screen');
    }
    if (!this.sendTransport) throw new Error('send transport not ready');

    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });
    const videoTrack = displayStream.getVideoTracks()[0];
    if (!videoTrack) throw new Error('no video track from getDisplayMedia');

    const producer = await this.sendTransport.produce({
      track: videoTrack,
      appData: { source: 'screen' },
    });
    this.screenProducer = producer;

    videoTrack.addEventListener('ended', () => {
      this.stopScreenShare().catch(console.error);
    });

    return displayStream;
  }

  async stopScreenShare(): Promise<void> {
    const producer = this.screenProducer;
    if (!producer || producer.closed) return;
    this.screenProducer = undefined;

    try {
      await this.signaling.request('closeProducer', { producerId: producer.id });
    } catch (err) {
      console.error('[room] closeProducer failed:', err);
    }
    producer.track?.stop();
    producer.close();
  }

  private async createSendTransport() {
    const params = await this.signaling.request('createWebRtcTransport');
    this.sendTransport = this.device.createSendTransport(params);

    this.sendTransport.on(
      'connect',
      (
        { dtlsParameters }: { dtlsParameters: DtlsParameters },
        callback: () => void,
        errback: (err: Error) => void,
      ) => {
        this.signaling
          .request('connectTransport', { transportId: params.id, dtlsParameters })
          .then(() => callback())
          .catch(errback);
      },
    );

    this.sendTransport.on(
      'produce',
      (
        {
          kind,
          rtpParameters,
          appData,
        }: { kind: MediaKind; rtpParameters: RtpParameters; appData: Record<string, unknown> },
        callback: (data: { id: string }) => void,
        errback: (err: Error) => void,
      ) => {
        this.signaling
          .request('produce', { transportId: params.id, kind, rtpParameters, appData })
          .then((data: { id: string }) => callback({ id: data.id }))
          .catch(errback);
      },
    );
  }

  private async createRecvTransport() {
    const params = await this.signaling.request('createWebRtcTransport');
    this.recvTransport = this.device.createRecvTransport(params);

    this.recvTransport.on(
      'connect',
      (
        { dtlsParameters }: { dtlsParameters: DtlsParameters },
        callback: () => void,
        errback: (err: Error) => void,
      ) => {
        this.signaling
          .request('connectTransport', { transportId: params.id, dtlsParameters })
          .then(() => callback())
          .catch(errback);
      },
    );
  }

  private async consumeProducer(producerId: string, peerId: string, source: StreamSource) {
    await this.setupReady;
    if (!this.recvTransport) throw new Error('recv transport not ready');
    console.log(
      `[room] consume peer=${peerId.slice(0, 8)} source=${source} producer=${producerId.slice(0, 8)}`,
    );

    const data = await this.signaling.request('consume', {
      transportId: this.recvTransport.id,
      producerId,
      rtpCapabilities: this.device.rtpCapabilities,
    });

    const consumer = await this.recvTransport.consume({
      id: data.id,
      producerId: data.producerId,
      kind: data.kind,
      rtpParameters: data.rtpParameters,
    });
    this.consumerInfo.set(consumer.id, { peerId, source });

    await this.signaling.request('resumeConsumer', { consumerId: consumer.id });
    console.log(`[room]   consumed ${consumer.kind} (source=${source})`);

    const k = key(peerId, source);
    let stream = this.remoteStreams.get(k);
    if (!stream) {
      stream = new MediaStream();
      this.remoteStreams.set(k, stream);
    }
    stream.addTrack(consumer.track);

    this.callbacks.onRemoteStream({ peerId, source, stream });
  }

  private handleConsumerClosed(consumerId: string) {
    const info = this.consumerInfo.get(consumerId);
    if (!info) return;
    this.consumerInfo.delete(consumerId);

    const k = key(info.peerId, info.source);
    const stream = this.remoteStreams.get(k);
    if (!stream) return;

    // Track the closed consumer no longer flows. Remove from stream by matching kind+id is hard;
    // simplest: rebuild stream from remaining consumers for this key.
    // But we don't have per-consumer track tracking here. Use removeTrack via a separate map.
    // Simpler approach: if it's a screen share (single video track), just drop the whole stream.
    // For camera (audio+video), if one track closes (rare), keep the rest.
    if (info.source === 'screen') {
      stream.getTracks().forEach((t) => t.stop());
      this.remoteStreams.delete(k);
      this.callbacks.onRemoteStreamClosed(info.peerId, info.source);
    }
    // For camera tracks closing individually we'd need per-consumer track tracking;
    // not needed in Stage 3 because camera producers don't close until peer leaves.
  }

  leave() {
    this.cameraProducers.forEach((p) => p.close());
    this.screenProducer?.close();
    this.sendTransport?.close();
    this.recvTransport?.close();
    this.signaling.close();
  }
}
