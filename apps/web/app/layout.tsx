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
        {/* 테마 복원 — 페인트 전에 저장된 테마(localStorage 'ieum-theme')를 dataset.theme에 반영해
            새로고침 시 다크로 되돌아가는 FOUC를 막는다. useTheme 토글이 쓰는 키와 동일. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('ieum-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}})();",
          }}
        />
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
