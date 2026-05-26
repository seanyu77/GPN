'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Room, type StreamSource } from '../../../lib/mediasoup-client';

const SERVER_URL = process.env.NEXT_PUBLIC_SIGNALING_URL ?? 'ws://localhost:3001';

type StreamKey = `${string}:${StreamSource}`;
function key(peerId: string, source: StreamSource): StreamKey {
  return `${peerId}:${source}`;
}

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = params.roomId;

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localScreenRef = useRef<HTMLVideoElement>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<StreamKey, { peerId: string; source: StreamSource; stream: MediaStream }>>(
    new Map(),
  );
  const [status, setStatus] = useState('idle');
  const [sharingScreen, setSharingScreen] = useState(false);
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    async function start() {
      try {
        setStatus('requesting camera');
        const localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (cancelled) {
          localStream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }

        setStatus('connecting');
        const room = new Room({
          onRemoteStream: ({ peerId, source, stream }) => {
            setRemoteStreams((prev) => {
              const next = new Map(prev);
              next.set(key(peerId, source), { peerId, source, stream });
              return next;
            });
          },
          onRemoteStreamClosed: (peerId, source) => {
            setRemoteStreams((prev) => {
              const next = new Map(prev);
              next.delete(key(peerId, source));
              return next;
            });
          },
          onPeerLeft: () => {},
        });
        roomRef.current = room;

        const wsUrl = `${SERVER_URL}?roomId=${encodeURIComponent(roomId)}`;
        await room.join(wsUrl, localStream);
        if (!cancelled) setStatus('connected');
      } catch (err: any) {
        console.error(err);
        if (!cancelled) setStatus(`error: ${err.message}`);
      }
    }

    start();

    return () => {
      cancelled = true;
      roomRef.current?.leave();
      roomRef.current = null;
    };
  }, [roomId]);

  function copyInviteLink() {
    const link = `${window.location.origin}/rooms/${roomId}`;
    navigator.clipboard.writeText(link).catch(() => {});
  }

  async function toggleScreenShare() {
    const room = roomRef.current;
    if (!room) return;
    if (sharingScreen) {
      await room.stopScreenShare();
      if (localScreenRef.current) localScreenRef.current.srcObject = null;
      setSharingScreen(false);
    } else {
      try {
        const screenStream = await room.shareScreen();
        if (localScreenRef.current) localScreenRef.current.srcObject = screenStream;
        setSharingScreen(true);
        screenStream.getVideoTracks()[0]?.addEventListener('ended', () => {
          if (localScreenRef.current) localScreenRef.current.srcObject = null;
          setSharingScreen(false);
        });
      } catch (err: any) {
        if (err.name !== 'NotAllowedError') console.error(err);
      }
    }
  }

  return (
    <main style={{ padding: 16 }}>
      <header
        style={{
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>房間：{roomId}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.7 }}>status: {status}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={toggleScreenShare} style={sharingScreen ? activeBtnStyle : btnStyle}>
            {sharingScreen ? '停止分享' : '分享螢幕'}
          </button>
          <button onClick={copyInviteLink} style={btnStyle}>
            複製房間連結
          </button>
          <button onClick={() => router.push('/')} style={btnStyle}>
            離開
          </button>
        </div>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 12,
        }}
      >
        <VideoTile label="You (camera)" videoRef={localVideoRef} muted />
        {sharingScreen && (
          <VideoTile label="You (screen)" videoRef={localScreenRef} muted />
        )}
        {[...remoteStreams.values()].map(({ peerId, source, stream }) => (
          <RemoteTile
            key={key(peerId, source)}
            peerId={peerId}
            source={source}
            stream={stream}
          />
        ))}
      </div>
    </main>
  );
}

function VideoTile({
  label,
  videoRef,
  muted,
}: {
  label: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  muted?: boolean;
}) {
  return (
    <div style={tileStyle}>
      <video ref={videoRef} autoPlay playsInline muted={muted} style={videoStyle} />
      <div style={labelStyle}>{label}</div>
    </div>
  );
}

function RemoteTile({
  peerId,
  source,
  stream,
}: {
  peerId: string;
  source: StreamSource;
  stream: MediaStream;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    el.srcObject = stream;
    const resync = () => {
      el.srcObject = stream;
    };
    stream.addEventListener('addtrack', resync);
    stream.addEventListener('removetrack', resync);
    return () => {
      stream.removeEventListener('addtrack', resync);
      stream.removeEventListener('removetrack', resync);
    };
  }, [stream]);
  return (
    <div style={tileStyle}>
      <video ref={ref} autoPlay playsInline style={videoStyle} />
      <div style={labelStyle}>
        peer: {peerId.slice(0, 8)} ({source})
      </div>
    </div>
  );
}

const tileStyle: React.CSSProperties = {
  position: 'relative',
  background: '#000',
  borderRadius: 8,
  overflow: 'hidden',
  aspectRatio: '16 / 9',
};

const videoStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

const labelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 8,
  left: 8,
  fontSize: 12,
  background: 'rgba(0,0,0,0.6)',
  padding: '2px 6px',
  borderRadius: 4,
};

const btnStyle: React.CSSProperties = {
  background: '#2a2a2a',
  color: '#eee',
  border: '1px solid #444',
  borderRadius: 6,
  padding: '6px 12px',
  fontSize: 13,
  cursor: 'pointer',
};

const activeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: '#3b82f6',
  borderColor: '#3b82f6',
  color: '#fff',
};
