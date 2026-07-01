## 코드 맵: IEUM 로그인 화면 재디자인 (변형 A 연장)

### 핵심 파일
- apps/web/app/(auth)/login/page.tsx → 로그인 페이지(재작성 대상). OAuth2 진입 링크 보유, Tailwind 토큰 사용
- apps/web/components/landing/Constellation.tsx → 컨스텔레이션 SVG 배경(재사용). `opacity?:number` prop

### 참조 파일
- apps/web/app/page.tsx → 랜딩(변형 A). 동일 토큰·고스트 pill·컨스텔레이션 패턴의 레퍼런스
- apps/web/app/globals.css → `--c-*` 디자인 토큰 정의(main 포함)
- apps/web/tailwind.config.ts → 토큰 → Tailwind 클래스 매핑(ink/body/dim/faint/fainter/deep/hover/accent)

### 설정
- apps/web/.env.local → NEXT_PUBLIC_API_URL (OAuth2 백엔드 주소)
