import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '이음',
  description: '함께 쓰는 문서 공간',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
        />
      </head>
      <body className="min-h-screen bg-deep font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
