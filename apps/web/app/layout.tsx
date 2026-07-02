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
    // suppressHydrationWarning — 아래 init 스크립트가 하이드레이션 전 dataset.theme을 저장값으로
    // 바꾸므로(서버는 항상 'dark' 렌더), 라이트 저장 사용자의 <html> 속성 불일치 경고를 억제한다.
    <html lang="ko" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* 테마 복원 — 페인트 전에 저장된 테마(localStorage 'ieum-theme')를 dataset.theme에 반영해
            새로고침 시 다크로 되돌아가는 FOUC를 막는다. 사이드바 계정 메뉴의 테마 토글이 쓰는 키와 동일. */}
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
