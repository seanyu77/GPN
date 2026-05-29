import type { ReactNode } from 'react';

export const metadata = {
  title: 'GP',
  description: 'WebRTC video call (mediasoup SFU)',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-TW">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#111', color: '#eee' }}>
        {children}
      </body>
    </html>
  );
}
