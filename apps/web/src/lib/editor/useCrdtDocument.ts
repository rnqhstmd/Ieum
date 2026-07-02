'use client';

// ─── P5 CRDT 문서 훅 (DocState 진실 원천 + relay 배선) ────────────
// DocState를 진실 원천으로 보유하고, 로컬 편집은 diff→op→전송, 원격 op는
// applyDocOp로 적용한다. DocState는 가변 객체이므로 version 카운터로 리렌더한다.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyDocOp,
  docToBlocks,
  fromWire,
  toWire,
  idEquals,
  resolveAnchorToIndex,
  indexToAnchorId,
  splitBlock,
  mergeBlockWithPrev,
  setBlockType,
} from '@ieum/crdt';
import type { AnyOp, BlockType, DocState, EditorBlockView, RgaId } from '@ieum/crdt';
import { createCollaborativeDocument, diffBlockText } from './crdtDocument';
import { createRetryingTransport } from '@/src/lib/realtime/transport';
import type { Transport } from '@/src/lib/realtime/transport';
import { createRelayClient } from '@/src/lib/realtime/relayClient';
import { fetchCurrentUser } from '@/src/lib/auth/currentUser';
import type { RelayClient } from '@/src/lib/realtime/relayClient';
import { usePresence } from '@/src/lib/realtime/usePresence';
import { useCursor } from '@/src/lib/realtime/useCursor';
import type { PresenceInfo, CursorInfo } from '@/src/lib/realtime/protocol';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001';
// A3: 재연결 성공 배너('reconnected') 자동 소멸 시간(ms). onOpen(재연결) 후 이 시간이 지나면 'online' 복귀.
const RECONNECTED_BANNER_MS = 3000;

export interface UseCrdtDocumentResult {
  blocks: EditorBlockView[];
  connectedClients: number;
  presences: PresenceInfo[];
  onBlockInput: (blockId: RgaId, newText: string) => void;
  // P6 커서
  cursors: CursorInfo[];
  /** 서버 부여 자기 clientId — 자기 커서 렌더 제외(AC-7). 배선 전 null. */
  localClientId: string | null;
  /** Editor가 DOM caret offset(가시 index)을 올리면 직전 문자 id로 변환해 전송. */
  onCursorMove: (blockId: RgaId, caretOffset: number) => void;
  /** 원격 커서 anchorId → 현재 가시 index(Editor 오버레이 위치). */
  resolveCursorIndex: (blockId: RgaId, anchorId: RgaId | null) => number;
  // P9 구조 편집
  onEnter: (blockId: RgaId, offset: number) => void;
  onBackspace: (blockId: RgaId) => void;
  onSetType: (blockId: RgaId, type: BlockType) => void;
  /** WS-AUTH: fetchCurrentUser 실패(401 등) 시 true — UI가 로그인 유도 표시. */
  authError: boolean;
  /** A: 재접속 복원 실패(op-batch-error) 시 true — UI 비차단 배너·재시도. */
  restoreError: boolean;
  /** A: 복원 재시도 — ready(토큰 재발급) 후 join 재전송으로 loadByPage 재실행. */
  retryRestore: () => void;
  /** A3: transport 연결 상태 — ConnectionBanner 소비(additive, 기존 소비자 무영향). */
  connectionStatus: 'online' | 'offline' | 'reconnected';
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
// siteId 앞 4자만 쓰므로 우연히 동일 displayName이 생길 수 있으나, BR-7이 다중 탭 동일 이름을
// 독립 presence(clientId·색상 분리)로 허용하므로 스펙상 무해하다(CR-3, 실 인증 시 대체).
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
  const restoringRef = useRef(false);
  const retryingRef = useRef(false);
  // WS-AUTH: /api/users/me에서 얻은 실 userId·token을 ref에 보관해 join 시점에 사용한다.
  // ref라 fetch 완료가 재렌더/재연결을 유발하지 않는다(상태 미사용).
  const userIdRef = useRef<string | undefined>(undefined);
  const tokenRef = useRef<string | undefined>(undefined);
  const [authError, setAuthError] = useState(false);
  const [restoreError, setRestoreError] = useState(false);
  const [, setVersion] = useState(0);
  const [connectedClients, setConnectedClients] = useState(0);
  const [localClientId, setLocalClientId] = useState<string | null>(null);
  // A3: transport onOpen/onClose에서 파생하는 연결 상태(additive — EditorContainer의 ConnectionBanner만 소비).
  const [connectionStatus, setConnectionStatus] = useState<'online' | 'offline' | 'reconnected'>('online');
  // 직전에 offline이었는지 — onOpen 시 재연결('reconnected')/정상('online') 판정. ref라 이벤트 콜백에서 최신값 접근.
  const wasOfflineRef = useRef(false);
  // 'reconnected'→'online' 자동 복귀 타이머. flapping 안전을 위해 모든 전이 진입 시 먼저 clear한다.
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  // P6: presence(아바타)·cursor 상태는 DocState와 분리된 별도 훅 — op 경로에 영향 없음(AC-9).
  const presence = usePresence();
  const cursor = useCursor();
  const displayName = displayNameFromSiteId(doc.siteId);
  // presence-leave 시 커서도 제거(BR-7). 두 안정 콜백(useCallback[])을 합성해 안정화(C4 — stale closure 방지).
  const handlePresenceLeave = useCallback(
    (id: string) => {
      presence.onPresenceLeave(id);
      cursor.onCursorLeave(id);
    },
    [presence.onPresenceLeave, cursor.onCursorLeave],
  );

  // fetchAuth: 매 onOpen마다 호출되는 ready 팩토리.
  // fetchCurrentUser 실패(null) 시 authError=true + throw → join 미전송.
  const fetchAuth = useCallback(async () => {
    const me = await fetchCurrentUser();
    if (me === null) {
      setAuthError(true);
      userIdRef.current = undefined;
      tokenRef.current = undefined;
      throw new Error('auth required');
    }
    setAuthError(false);
    userIdRef.current = me.userId;
    tokenRef.current = me.token ?? undefined;
  }, []);

  useEffect(() => {
    const factory = opts?.transportFactory ?? ((url: string) => createRetryingTransport(url));
    const transport = factory(WS_URL);
    const client = createRelayClient(
      transport,
      pageId,
      {
        onRemoteOp: (env) => {
          applyDocOp(doc, fromWire(env));
          if (!restoringRef.current) bump();
        },
        onOpBatch: (ops, batchPageId) => {
          if (batchPageId !== pageId) return;
          restoringRef.current = true;
          try {
            for (const env of ops) applyDocOp(doc, fromWire(env));
          } finally {
            restoringRef.current = false;
          }
          setRestoreError((prev) => (prev ? false : prev));
          bump();
        },
        onOpBatchError: (errPageId) => {
          if (errPageId === pageId) setRestoreError(true);
        },
        onJoinAck: (n, clientId) => {
          setConnectedClients(n);
          setLocalClientId(clientId); // 자기 식별(AC-7)
        },
        // presence 핸들러는 usePresence의 안정 콜백 — op 경로(onRemoteOp)와 분리.
        onPresenceUpdate: presence.onPresenceUpdate,
        // presence-leave 시 커서도 함께 제거(BR-7) — 안정화된 합성 콜백(C4).
        onPresenceLeave: handlePresenceLeave,
        onCursorUpdate: cursor.onCursorUpdate,
      },
      { displayName, getUserId: () => userIdRef.current, getToken: () => tokenRef.current, ready: fetchAuth },
    );
    clientRef.current = client;

    // A3: 연결 상태 머신(flapping 안전 — offline 우선).
    // reconnectTimerRef에 보관한 3초 타이머를 모든 onClose·onOpen 전이 진입 시 먼저 clear한다.
    // 이로써 offline→재연결(타이머 시작)→3초 내 재차단 시 살아있던 타이머가 clear되어 'offline'이 유지된다(AC-14).
    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
    const unsubOpen = transport.onOpen(() => {
      clearReconnectTimer();
      if (wasOfflineRef.current) {
        // offline→open: 재연결. RECONNECTED_BANNER_MS 동안 'reconnected' 표기 후 자동 'online' 복귀(AC-15).
        setConnectionStatus('reconnected');
        wasOfflineRef.current = false;
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          setConnectionStatus('online');
        }, RECONNECTED_BANNER_MS);
      } else {
        // 끊긴 적 없는 정상 open → 'online'(AC-16).
        setConnectionStatus('online');
      }
    });
    const unsubClose = transport.onClose(() => {
      clearReconnectTimer();
      setConnectionStatus('offline');
      wasOfflineRef.current = true;
    });

    return () => {
      unsubOpen();
      unsubClose();
      clearReconnectTimer();
      client.dispose();
      clientRef.current = null;
    };
    // 마운트(pageId) 시 1회 배선. presence/cursor 핸들러(usePresence/useCursor)와 handlePresenceLeave는
    // 모두 useCallback([]) 안정 콜백 합성이라 마운트 내 불변, displayName은 doc.siteId(useRef) 파생이라
    // 불변 — deps 제외 안전(S5·N-4). transportFactory 재구독은 의도적 생략(마운트 시점 1회 캡처, 테스트 전용).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  const sendOps = useCallback(
    (ops: AnyOp[]) => {
      const client = clientRef.current;
      if (client) {
        for (const op of ops) client.sendOp(toWire(op, ++seqRef.current, doc.siteId));
      }
      // client null이어도 bump: splitBlock/mergeBlockWithPrev 등이 doc을 로컬 변경하므로 리렌더 필요.
      bump();
    },
    [doc, bump],
  );

  const onBlockInput = useCallback(
    (blockId: RgaId, newText: string) => {
      const block = docToBlocks(doc).find((b) => idEquals(b.id, blockId));
      const oldText = block?.text ?? '';
      const ops = diffBlockText(doc, blockId, oldText, newText); // 로컬 즉시 적용
      sendOps(ops);
    },
    [doc, sendOps],
  );

  const onEnter = useCallback(
    (blockId: RgaId, offset: number) => {
      sendOps(splitBlock(doc, blockId, offset));
    },
    [doc, sendOps],
  );

  const onBackspace = useCallback(
    (blockId: RgaId) => {
      const ops = mergeBlockWithPrev(doc, blockId);
      if (ops) sendOps(ops);
    },
    [doc, sendOps],
  );

  const onSetType = useCallback(
    (blockId: RgaId, type: BlockType) => {
      sendOps([setBlockType(doc, blockId, type)]);
    },
    [doc, sendOps],
  );

  const retryRestore = useCallback(() => {
    if (retryingRef.current) return;
    retryingRef.current = true;
    fetchAuth()
      .then(() => clientRef.current?.join(pageId))
      .catch(() => { /* fetchAuth 실패는 내부에서 authError로 처리; join은 동기 전송이라 추가 처리 불필요 */ })
      .finally(() => { retryingRef.current = false; });
  }, [fetchAuth, pageId]);

  // P6 커서: Editor가 올린 caret 가시 index를 직전 문자 id로 변환해 전송.
  // deps [doc]: doc은 useRef 파생이라 참조 불변 → 실질적으로 마운트 1회 생성(onBlockInput과 동일, N-3).
  const onCursorMove = useCallback(
    (blockId: RgaId, caretOffset: number) => {
      const anchorId = indexToAnchorId(doc, blockId, caretOffset);
      clientRef.current?.sendCursor(blockId, anchorId); // 배선 전 null이면 조용히 skip
    },
    [doc],
  );
  // 원격 커서 anchorId → 현재 가시 index (op 적용 후에도 올바른 위치, tombstone fallback).
  const resolveCursorIndex = useCallback(
    (blockId: RgaId, anchorId: RgaId | null) => resolveAnchorToIndex(doc, blockId, anchorId),
    [doc],
  );

  return {
    blocks: docToBlocks(doc),
    connectedClients,
    presences: presence.presences,
    onBlockInput,
    cursors: cursor.cursors,
    localClientId,
    onCursorMove,
    resolveCursorIndex,
    onEnter,
    onBackspace,
    onSetType,
    authError,
    restoreError,
    retryRestore,
    connectionStatus,
  };
}
