'use client';

// ─── P5 CRDT 문서 훅 (DocState 진실 원천 + relay 배선) ────────────
// DocState를 진실 원천으로 보유하고, 로컬 편집은 diff→op→전송, 원격 op는
// applyDocOp로 적용한다. DocState는 가변 객체이므로 version 카운터로 리렌더한다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { applyDocOp, docToBlocks, fromWire, toWire, idEquals } from '@ieum/crdt';
import type { DocState, EditorBlockView, RgaId } from '@ieum/crdt';
import { createCollaborativeDocument, diffBlockText } from './crdtDocument';
import { createRetryingTransport } from '@/src/lib/realtime/transport';
import type { Transport } from '@/src/lib/realtime/transport';
import { createRelayClient } from '@/src/lib/realtime/relayClient';
import type { RelayClient } from '@/src/lib/realtime/relayClient';
import { usePresence } from '@/src/lib/realtime/usePresence';
import type { PresenceInfo } from '@/src/lib/realtime/protocol';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001';

export interface UseCrdtDocumentResult {
  blocks: EditorBlockView[];
  connectedClients: number;
  presences: PresenceInfo[];
  onBlockInput: (blockId: RgaId, newText: string) => void;
}

// 탭별 고유 siteId. crypto.randomUUID(현대 브라우저 표준)를 우선 사용한다.
// 폴백(Math.random)은 암호학적으로 안전하지 않아 충돌 가능성이 0이 아니나, 폴백 도달은
// crypto 미지원 구형 환경뿐이며 실사용에선 거의 발생하지 않는다(후속 슬라이스에서 강화).
function newSiteId(): string {
  const c = globalThis.crypto;
  return c && typeof c.randomUUID === 'function'
    ? c.randomUUID()
    : `site-${Math.random().toString(36).slice(2)}`;
}

// P6: presence 표시 이름은 siteId 기반 자동 생성(실 인증 전 목 신원, BR-4 상응).
// 서버는 displayName만 신뢰 중계하고 색상은 서버가 할당한다.
function displayNameFromSiteId(siteId: string): string {
  return `사용자 #${siteId.slice(0, 4)}`;
}

export function useCrdtDocument(
  pageId: string,
  opts?: { transportFactory?: (url: string) => Transport },
): UseCrdtDocumentResult {
  // 전제: page.tsx가 <EditorContainer key={pageId}>로 페이지 이동 시 전체를 remount하므로,
  // 이 훅의 docRef/seqRef는 pageId가 바뀌지 않는 단일 페이지 수명 동안만 유지된다
  // (pageId 변경 시 새 doc/seq로 재초기화됨).
  const docRef = useRef<DocState | null>(null);
  if (docRef.current === null) docRef.current = createCollaborativeDocument(newSiteId());
  const doc = docRef.current;

  const seqRef = useRef(0);
  const clientRef = useRef<RelayClient | null>(null);
  const [, setVersion] = useState(0);
  const [connectedClients, setConnectedClients] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  // P6: presence(아바타) 상태는 DocState와 분리된 별도 훅 — op 경로에 영향 없음(AC-9).
  const presence = usePresence();
  const displayName = displayNameFromSiteId(doc.siteId);

  useEffect(() => {
    const factory = opts?.transportFactory ?? ((url: string) => createRetryingTransport(url));
    const transport = factory(WS_URL);
    const client = createRelayClient(
      transport,
      pageId,
      {
        onRemoteOp: (env) => {
          applyDocOp(doc, fromWire(env));
          bump();
        },
        onJoinAck: (n) => setConnectedClients(n),
        // presence 핸들러는 usePresence의 안정 콜백 — op 경로(onRemoteOp)와 분리.
        onPresenceUpdate: presence.onPresenceUpdate,
        onPresenceLeave: presence.onPresenceLeave,
      },
      { displayName },
    );
    clientRef.current = client;
    return () => {
      client.dispose();
      clientRef.current = null;
    };
    // 마운트(pageId) 시 1회 배선. presence.onPresenceUpdate/onPresenceLeave는 usePresence의
    // useCallback([]) 안정 콜백이고 displayName은 doc.siteId(useRef) 파생이라 불변 — deps 제외 안전(S5).
    // transportFactory 재구독은 의도적으로 생략(마운트 시점 값 1회 캡처, 테스트 주입 전용).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  const onBlockInput = useCallback(
    (blockId: RgaId, newText: string) => {
      const block = docToBlocks(doc).find((b) => idEquals(b.id, blockId));
      const oldText = block?.text ?? '';
      const ops = diffBlockText(doc, blockId, oldText, newText); // 로컬 즉시 적용
      const client = clientRef.current;
      // relay 배선(useEffect) 전 입력 시 client가 null이면 송신을 조용히 건너뛴다.
      // 로컬 DocState에는 이미 적용되며, 미송신 op 복원은 walking skeleton 범위 밖(P8).
      if (client) {
        for (const op of ops) client.sendOp(toWire(op, ++seqRef.current, doc.siteId));
      }
      bump();
    },
    [doc, bump],
  );

  return { blocks: docToBlocks(doc), connectedClients, presences: presence.presences, onBlockInput };
}
