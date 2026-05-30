import type { ReactNode } from 'react';

export const metadata = {
  title: 'GPN',
  description: 'WebRTC video call (mediasoup SFU)',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', color: '#eee' }}>
        {children}
      </body>
    </html>
  );
}
