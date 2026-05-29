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
  const localStreamRef = useRef<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<StreamKey, { peerId: string; source: StreamSource; stream: MediaStream }>>(
    new Map(),
  );
  const [status, setStatus] = useState('idle');
  const [sharingScreen, setSharingScreen] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
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
        localStreamRef.current = localStream;
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

  function toggleMic() {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !audioEnabled;
    stream.getAudioTracks().forEach((t) => { t.enabled = next; });
    setAudioEnabled(next);
  }

  function copyInviteLink() {
    const link = `${window.location.origin}/rooms/${roomId}`;
    navigator.clipboard.writeText(link).catch(() => {});
  }

  async function toggleScreenShare() {
    const room = roomRef.current;
    if (!room) return;
    if (sharingScreen) {
      await room.stopScreenShare();
      setScreenStream(null);
      setSharingScreen(false);
    } else {
      try {
        const stream = await room.shareScreen();
        setScreenStream(stream);
        setSharingScreen(true);
        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
          setScreenStream(null);
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
          <h1 style={{ margin: 0, fontSize: 20 }}>Room: {roomId}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.7 }}>status: {status}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={toggleScreenShare} style={sharingScreen ? activeBtnStyle : btnStyle}>
            {sharingScreen ? 'Stop sharing' : 'Share screen'}
          </button>
          <button onClick={copyInviteLink} style={btnStyle}>
            Copy room link
          </button>
          <button onClick={() => router.push('/')} style={btnStyle}>
            Leave
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
        <VideoTile label="You" videoRef={localVideoRef} muted mirror audioEnabled={audioEnabled} onToggleMic={toggleMic} />
        {screenStream && (
          <VideoTile label="You (screen)" stream={screenStream} muted />
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
  stream,
  muted,
  mirror,
  audioEnabled = true,
  onToggleMic,
}: {
  label: string;
  videoRef?: React.RefObject<HTMLVideoElement>;
  stream?: MediaStream;
  muted?: boolean;
  mirror?: boolean;
  audioEnabled?: boolean;
  onToggleMic?: () => void;
}) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const ref = videoRef ?? internalRef;
  useEffect(() => {
    if (!stream || !ref.current) return;
    ref.current.srcObject = stream;
  }, [stream, ref]);
  return (
    <div style={tileStyle}>
      <video ref={ref} autoPlay playsInline muted={muted} style={mirror ? { ...videoStyle, transform: 'scaleX(-1)' } : videoStyle} />
      <div style={{ position: 'absolute', bottom: 8, left: 8 }}>
        <span style={labelStyle}>{label}</span>
      </div>
      {onToggleMic && (
        <button
          onClick={onToggleMic}
          title={audioEnabled ? 'Mute' : 'Unmute'}
          style={{ ...iconBtnStyle, ...(audioEnabled ? {} : iconBtnOffOverride), position: 'absolute', bottom: 8, right: 8, width: 36, height: 36 }}
        >
          <span className="material-icons" style={{ fontSize: 20 }}>{audioEnabled ? 'mic' : 'mic_off'}</span>
        </button>
      )}
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
      <div style={{ position: 'absolute', bottom: 8, left: 8 }}>
        <span style={labelStyle}>{peerId.slice(0, 8)}</span>
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
  bottom: 8,
  left: 8,
  fontSize: 12,
  background: 'rgba(0,0,0,0.6)',
  padding: '2px 6px',
  borderRadius: 4,
};

const iconBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 48,
  height: 48,
  borderRadius: '50%',
  border: 'none',
  background: '#3a3a3a',
  color: '#eee',
  cursor: 'pointer',
  fontSize: 24,
};

const iconBtnOffOverride: React.CSSProperties = {
  background: '#e53e3e',
  color: '#fff',
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
  background: '#facc15',
  borderColor: '#facc15',
  color: '#111',
};
