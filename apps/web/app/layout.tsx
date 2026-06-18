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
    <html lang="ko">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
