'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Room, type StreamSource } from '../../../lib/mediasoup-client';

const SERVER_URL = process.env.NEXT_PUBLIC_SIGNALING_URL ?? 'ws://localhost:3001';

type StreamKey = `${string}:${StreamSource}`;
function key(peerId: string, source: StreamSource): StreamKey {
  return `${peerId}:${source}`;
}

const ACCENT = '#2563eb';
const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";

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
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const roomRef = useRef<Room | null>(null);

  function toggleExpand(k: string) {
    setExpandedKey((prev) => (prev === k ? null : k));
  }

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    async function start() {
      try {
        setStatus('requesting camera');
        const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) { localStream.getTracks().forEach((t) => t.stop()); return; }
        localStreamRef.current = localStream;
        if (localVideoRef.current) localVideoRef.current.srcObject = localStream;

        setStatus('connecting');
        const room = new Room({
          onRemoteStream: ({ peerId, source, stream }) => {
            setRemoteStreams((prev) => { const next = new Map(prev); next.set(key(peerId, source), { peerId, source, stream }); return next; });
          },
          onRemoteStreamClosed: (peerId, source) => {
            setRemoteStreams((prev) => { const next = new Map(prev); next.delete(key(peerId, source)); return next; });
          },
          onPeerLeft: () => {},
        });
        roomRef.current = room;
        await room.join(`${SERVER_URL}?roomId=${encodeURIComponent(roomId)}`, localStream);
        if (!cancelled) setStatus('connected');
      } catch (err: any) {
        console.error(err);
        if (!cancelled) setStatus(`error: ${err.message}`);
      }
    }

    start();
    return () => { cancelled = true; roomRef.current?.leave(); roomRef.current = null; };
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
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        stream.getVideoTracks()[0]?.addEventListener('ended', () => { setScreenStream(null); setSharingScreen(false); });
      } catch (err: any) {
        if (err.name !== 'NotAllowedError') console.error(err);
      }
    }
  }

  const statusDot = status === 'connected' ? '#22c55e' : status.startsWith('error') ? '#ef4444' : '#f59e0b';

  return (
    <div style={s.page}>
      <style>{`
        @media (max-width: 600px) {
          .btn-label { display: none; }
          .room-grid { grid-template-columns: 1fr !important; padding: 8px !important; padding-top: 100px !important; gap: 8px !important; }
          .room-header { padding: 8px 12px !important; }
        }
      `}</style>
      {/* Header */}
      <header className="room-header" style={s.header}>
        <div style={s.headerLeft}>
          {/* Logo mark */}
          <div style={s.logoMark}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
              <path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
          <div>
            <div style={s.roomIdRow}>
              <span style={s.roomLabel}>Room</span>
              <code style={s.roomCode}>{roomId}</code>
            </div>
            <div style={s.statusRow}>
              <span style={{ ...s.statusDot, background: statusDot }} />
              <span style={s.statusText}>{status}</span>
            </div>
          </div>
        </div>

        <div style={s.headerRight}>
          <button onClick={toggleScreenShare} style={sharingScreen ? s.btnActive : s.btnGhost}>
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="btn-label">{sharingScreen ? 'Stop sharing' : 'Share screen'}</span>
          </button>
          <button onClick={copyInviteLink} style={s.btnGhost}>
            {copied ? (
              <>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M5 13l4 4L19 7" /></svg>
                <span className="btn-label">Copied!</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                <span className="btn-label">Copy link</span>
              </>
            )}
          </button>
          <button onClick={() => router.push('/')} style={s.btnLeave}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            <span className="btn-label">Leave</span>
          </button>
        </div>
      </header>

      {/* Video grid */}
      <div className="room-grid" style={s.grid}>
        <VideoTile
          label="You"
          videoRef={localVideoRef}
          muted mirror
          audioEnabled={audioEnabled}
          onToggleMic={toggleMic}
          expanded={expandedKey === 'local'}
          onExpand={() => toggleExpand('local')}
        />
        {screenStream && (
          <VideoTile
            label="Your screen"
            stream={screenStream}
            muted
            expanded={expandedKey === 'screen'}
            onExpand={() => toggleExpand('screen')}
            objectFit="contain"
          />
        )}
        {[...remoteStreams.values()].map(({ peerId, source, stream }) => (
          <RemoteTile
            key={key(peerId, source)}
            peerId={peerId}
            source={source}
            stream={stream}
            expanded={expandedKey === key(peerId, source)}
            onExpand={() => toggleExpand(key(peerId, source))}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── VideoTile ─── */
function VideoTile({
  label, videoRef, stream, muted, mirror,
  audioEnabled = true, onToggleMic, expanded, onExpand, objectFit = 'cover',
}: {
  label: string;
  videoRef?: React.RefObject<HTMLVideoElement>;
  stream?: MediaStream;
  muted?: boolean;
  mirror?: boolean;
  audioEnabled?: boolean;
  onToggleMic?: () => void;
  expanded?: boolean;
  onExpand?: () => void;
  objectFit?: React.CSSProperties['objectFit'];
}) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const ref = videoRef ?? internalRef;
  useEffect(() => {
    if (!stream || !ref.current) return;
    ref.current.srcObject = stream;
  }, [stream, ref]);

  return (
    <div style={{ ...s.tile, ...(expanded ? s.tileExpanded : {}) }} onClick={onExpand} role="button" tabIndex={0}>
      <video
        ref={ref}
        autoPlay playsInline muted={muted}
        style={{ ...s.video, objectFit, ...(mirror ? { transform: 'scaleX(-1)' } : {}) }}
      />
      {/* Label */}
      <div style={s.tileLabel}>{label}</div>
      {/* Mic button */}
      {onToggleMic && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleMic(); }}
          title={audioEnabled ? 'Mute' : 'Unmute'}
          style={{ ...s.iconBtn, ...(audioEnabled ? {} : s.iconBtnOff) }}
        >
          <span className="material-icons" style={{ fontSize: 18 }}>
            {audioEnabled ? 'mic' : 'mic_off'}
          </span>
        </button>
      )}
      {/* Expand hint */}
      <div style={s.expandHint}>
        <span className="material-icons" style={{ fontSize: 16 }}>
          {expanded ? 'fullscreen_exit' : 'fullscreen'}
        </span>
      </div>
    </div>
  );
}

/* ─── RemoteTile ─── */
function RemoteTile({
  peerId, source, stream, expanded, onExpand,
}: {
  peerId: string;
  source: StreamSource;
  stream: MediaStream;
  expanded?: boolean;
  onExpand?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    el.srcObject = stream;
    const resync = () => { el.srcObject = stream; };
    stream.addEventListener('addtrack', resync);
    stream.addEventListener('removetrack', resync);
    return () => { stream.removeEventListener('addtrack', resync); stream.removeEventListener('removetrack', resync); };
  }, [stream]);

  return (
    <div style={{ ...s.tile, ...(expanded ? s.tileExpanded : {}) }} onClick={onExpand} role="button" tabIndex={0}>
      <video ref={ref} autoPlay playsInline style={{ ...s.video, objectFit: source === 'screen' ? 'contain' : 'cover' }} />
      <div style={s.tileLabel}>{peerId.slice(0, 8)}</div>
      <div style={s.expandHint}>
        <span className="material-icons" style={{ fontSize: 16 }}>
          {expanded ? 'fullscreen_exit' : 'fullscreen'}
        </span>
      </div>
    </div>
  );
}

/* ─── Styles ─── */
const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0a0f1e',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: FONT,
    color: '#f1f5f9',
  },
  header: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    background: 'rgba(10,15,30,0.65)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    flexWrap: 'wrap',
    gap: 12,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  logoMark: {
    width: 36,
    height: 36,
    background: ACCENT,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  roomIdRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  roomLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#64748b',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  },
  roomCode: {
    fontSize: 13,
    fontWeight: 600,
    color: '#e2e8f0',
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    padding: '1px 8px',
    fontFamily: 'monospace',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    display: 'inline-block',
    width: 7,
    height: 7,
    borderRadius: '50%',
  },
  statusText: {
    fontSize: 12,
    color: '#64748b',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  btnGhost: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 14px',
    background: 'rgba(255,255,255,0.06)',
    color: '#cbd5e1',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: FONT,
    transition: 'all 0.15s',
  },
  btnActive: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 14px',
    background: ACCENT,
    color: '#fff',
    border: `1px solid ${ACCENT}`,
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: FONT,
    transition: 'all 0.15s',
  },
  btnLeave: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 14px',
    background: 'rgba(239,68,68,0.12)',
    color: '#fca5a5',
    border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: FONT,
    transition: 'all 0.15s',
  },
  grid: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: 12,
    padding: 16,
    paddingTop: 76,
    alignContent: 'start',
  },
  tile: {
    position: 'relative',
    background: '#111827',
    borderRadius: 12,
    overflow: 'hidden',
    aspectRatio: '16 / 9',
    cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.06)',
    transition: 'border-color 0.2s',
  },
  tileExpanded: {
    gridColumn: '1 / -1',
    order: -1,
  },
  video: {
    width: '100%',
    height: '100%',
    display: 'block',
  },
  tileLabel: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    fontSize: 12,
    fontWeight: 600,
    color: '#f1f5f9',
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(6px)',
    padding: '3px 9px',
    borderRadius: 6,
    letterSpacing: '0.2px',
  },
  iconBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 34,
    height: 34,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(6px)',
    color: '#f1f5f9',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  iconBtnOff: {
    background: 'rgba(239,68,68,0.8)',
    color: '#fff',
  },
  expandHint: {
    position: 'absolute',
    top: 10,
    right: 10,
    color: 'rgba(255,255,255,0.35)',
    display: 'flex',
    alignItems: 'center',
    pointerEvents: 'none',
  },
};
