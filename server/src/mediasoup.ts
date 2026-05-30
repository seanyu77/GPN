import * as mediasoup from 'mediasoup';
import type { Worker, Router, RtpCodecCapability, WebRtcTransportOptions } from 'mediasoup/types';

const mediaCodecs: RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    preferredPayloadType: 100,
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    preferredPayloadType: 101,
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
];

// Network config — env-driven for production. LISTEN_IP is the local interface
// mediasoup binds to (0.0.0.0 = all interfaces). ANNOUNCED_IP MUST be the
// server's PUBLIC IP in production so remote clients receive reachable ICE
// candidates; left unset for local dev so it binds to loopback only.
const LISTEN_IP = process.env.MEDIASOUP_LISTEN_IP ?? '127.0.0.1';
const ANNOUNCED_IP = process.env.MEDIASOUP_ANNOUNCED_IP || undefined;

export const webRtcTransportOptions: WebRtcTransportOptions = {
  listenIps: [{ ip: LISTEN_IP, announcedIp: ANNOUNCED_IP }],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
  initialAvailableOutgoingBitrate: 1_000_000,
};

let worker: Worker | undefined;

export async function initWorker(): Promise<Worker> {
  worker = await mediasoup.createWorker({
    logLevel: 'warn',
    rtcMinPort: Number(process.env.MEDIASOUP_RTC_MIN_PORT ?? 40000),
    rtcMaxPort: Number(process.env.MEDIASOUP_RTC_MAX_PORT ?? 49999),
  });

  worker.on('died', () => {
    console.error('[mediasoup] worker died, exiting in 2s');
    setTimeout(() => process.exit(1), 2000);
  });

  console.log('[mediasoup] worker ready');
  return worker;
}

export async function createRouter(): Promise<Router> {
  if (!worker) throw new Error('Worker not initialized');
  return worker.createRouter({ mediaCodecs });
}

export function closeWorker(): void {
  worker?.close();
  worker = undefined;
}
