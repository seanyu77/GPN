'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface Ring {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
}

function useRandomRings(count = 6) {
  const [rings, setRings] = useState<Ring[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    function spawn(): Ring {
      return {
        id: nextId.current++,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 120 + 60,
        duration: Math.random() * 2 + 2.5,
        delay: 0,
      };
    }

    const initial: Ring[] = Array.from({ length: count }, spawn);
    setRings(initial);

    const interval = setInterval(() => {
      setRings(prev => {
        const next = prev.slice(1);
        next.push(spawn());
        return next;
      });
    }, 900);

    return () => clearInterval(interval);
  }, [count]);

  return rings;
}

function randomRoomId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('');
}

export default function Landing() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const rings = useRandomRings(6);

  function createRoom() {
    router.push(`/rooms/${randomRoomId()}`);
  }

  function joinRoom(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(trimmed)) {
      alert('Room ID may only contain letters, numbers, underscores, and hyphens (max 64 characters)');
      return;
    }
    router.push(`/rooms/${trimmed}`);
  }

  return (
    <main className="landing-main" style={styles.main}>
      <style>{`
        @keyframes ringPulse {
          0%   { transform: scale(0.2); opacity: 1; }
          60%  { opacity: 0.6; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        @media (max-width: 768px) {
          .landing-main { flex-direction: column !important; }
          .landing-left { padding: 40px 28px !important; flex: none !important; }
          .landing-left-title { font-size: 28px !important; letter-spacing: -0.5px !important; }
          .landing-right { width: 100% !important; padding: 32px 28px !important; box-shadow: none !important; }
        }
      `}</style>

      {/* Left panel */}
      <div className="landing-left" style={styles.left}>
        {rings.map(r => (
          <div
            key={r.id}
            style={{
              position: 'absolute',
              left: `${r.x}%`,
              top: `${r.y}%`,
              width: r.size,
              height: r.size,
              marginLeft: -r.size / 2,
              marginTop: -r.size / 2,
              borderRadius: '50%',
              border: '1.5px solid rgba(255,255,255,0.55)',
              animation: `ringPulse ${r.duration}s ease-out forwards`,
              pointerEvents: 'none',
            }}
          />
        ))}
        <div style={styles.leftContent}>
          <div style={styles.iconWrap}>
            <svg width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
              <path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
          <h2 className="landing-left-title" style={styles.leftTitle}>Video chat,<br />instantly.</h2>
          <p style={styles.leftSubtitle}>
            Connect with anyone, anywhere. No downloads, no sign-up, no friction.
          </p>
          <div style={styles.features}>
            {['HD video & audio quality', 'Screen sharing support', 'End-to-end encrypted'].map((f) => (
              <div key={f} style={styles.feature}>
                <div style={styles.featureDot} />
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="landing-right" style={styles.right}>
        <div style={styles.rightHeader}>
          <h3 style={styles.rightTitle}>Start a video chat now!</h3>
          <p style={styles.rightSubtitle}>
            No sign-up required — just create a room and share the link.
          </p>
        </div>

        <button onClick={createRoom} style={styles.btnPrimary}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = '#1d4ed8';
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(37,99,235,0.4)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = '#2563eb';
            (e.currentTarget as HTMLButtonElement).style.transform = 'none';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 8px rgba(37,99,235,0.3)';
          }}
        >
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path d="M12 4v16m8-8H4" />
          </svg>
          Create new room
        </button>

        <div style={styles.divider}>
          <div style={styles.dividerLine} />
          <span>or join existing</span>
          <div style={styles.dividerLine} />
        </div>

        <form onSubmit={joinRoom}>
          <label style={styles.label}>Room ID</label>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. abc123xyz"
            style={styles.input}
            onFocus={e => {
              e.currentTarget.style.borderColor = '#2563eb';
              e.currentTarget.style.background = '#fff';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)';
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = '#e2e8f0';
              e.currentTarget.style.background = '#f8fafc';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
          <button type="submit" style={styles.btnOutline}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#eff6ff'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            Join room
          </button>
        </form>
      </div>
    </main>
  );
}

const ACCENT = '#2563eb';
const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    display: 'flex',
    fontFamily: FONT,
    background: '#f8fafc',
    color: '#0f172a',
  },
  left: {
    flex: 1,
    background: ACCENT,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '60px',
    position: 'relative',
    overflow: 'hidden',
  },
  leftContent: {
    position: 'relative',
    zIndex: 1,
    maxWidth: 420,
  },
  iconWrap: {
    width: 56,
    height: 56,
    background: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  leftTitle: {
    fontSize: 42,
    fontWeight: 800,
    color: '#fff',
    lineHeight: 1.15,
    letterSpacing: '-1.5px',
    marginBottom: 16,
  },
  leftSubtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 15,
    lineHeight: 1.7,
    maxWidth: 340,
    margin: 0,
  },
  features: {
    marginTop: 48,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  feature: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  featureDot: {
    width: 8,
    height: 8,
    background: 'rgba(255,255,255,0.4)',
    borderRadius: '50%',
    flexShrink: 0,
  },
  right: {
    width: 460,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '60px 48px',
    background: '#fff',
    boxShadow: '-20px 0 60px rgba(0,0,0,0.05)',
    boxSizing: 'border-box',
  },
  rightHeader: {
    marginBottom: 36,
  },
  rightTitle: {
    fontSize: 26,
    fontWeight: 700,
    color: '#0f172a',
    letterSpacing: '-0.5px',
    marginBottom: 6,
  },
  rightSubtitle: {
    fontSize: 13.5,
    color: '#64748b',
    margin: 0,
  },
  btnPrimary: {
    width: '100%',
    padding: '14px 20px',
    background: ACCENT,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    fontFamily: FONT,
    transition: 'all 0.2s',
    boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    margin: '20px 0',
    color: '#64748b',
    fontSize: 12,
    fontWeight: 500,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: '#e2e8f0',
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#0f172a',
    marginBottom: 6,
    letterSpacing: '0.3px',
  },
  input: {
    width: '100%',
    padding: '13px 14px',
    background: '#f8fafc',
    border: '1.5px solid #e2e8f0',
    borderRadius: 10,
    color: '#0f172a',
    fontSize: 14,
    fontFamily: FONT,
    outline: 'none',
    transition: 'all 0.2s',
    marginBottom: 10,
    boxSizing: 'border-box',
  },
  btnOutline: {
    width: '100%',
    padding: '13px 20px',
    background: 'transparent',
    color: ACCENT,
    fontSize: 14,
    fontWeight: 600,
    border: `1.5px solid ${ACCENT}`,
    borderRadius: 10,
    cursor: 'pointer',
    fontFamily: FONT,
    transition: 'all 0.2s',
  },
};
