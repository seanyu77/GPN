'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function randomRoomId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('');
}

export default function Landing() {
  const router = useRouter();
  const [input, setInput] = useState('');

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
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ width: '100%', maxWidth: 380 }}>
        <h1 style={{ fontSize: 28, margin: '0 0 4px' }}>Start a video chat now!</h1>
        <p style={{ margin: '0 0 24px', opacity: 0.7, fontSize: 14 }}>
          No sign-up required. Just create a room and share the link with your friends.
        </p>

        <button onClick={createRoom} style={primaryBtn}>
          Create new room
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            margin: '20px 0',
            gap: 8,
            opacity: 0.5,
            fontSize: 12,
          }}
        >
          <div style={{ flex: 1, height: 1, background: '#333' }} />
          or
          <div style={{ flex: 1, height: 1, background: '#333' }} />
        </div>

        <form onSubmit={joinRoom}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter room ID to join"
            style={inputStyle}
          />
          <button type="submit" style={{ ...primaryBtn, marginTop: 8 }}>
            Join
          </button>
        </form>
      </div>
    </main>
  );
}

const primaryBtn: React.CSSProperties = {
  width: '100%',
  background: '#facc15',
  color: '#111',
  border: 'none',
  borderRadius: 8,
  padding: '12px 16px',
  fontSize: 15,
  fontWeight: 500,
  cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: '#1a1a1a',
  color: '#eee',
  border: '1px solid #333',
  borderRadius: 8,
  padding: '12px 14px',
  fontSize: 15,
  outline: 'none',
};
