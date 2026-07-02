'use client';

// ─── P5 에디터 컨테이너 — CRDT 진실 원천 + relay 연결 ─────────────
// 본문 블록은 @ieum/crdt DocState(useCrdtDocument)를 진실 원천으로 사용한다.
// 제목은 CRDT 범위 밖이므로 단일 페이지 GET 로드 + PATCH save-port(usePageTitle)로 영속한다.

import { useCallback, useEffect, useRef } from 'react';
import Editor from '@/components/editor/Editor';
import TitleEditor from '@/components/editor/TitleEditor';
import PresenceAvatars from '@/components/editor/PresenceAvatars';
import ConnectionBanner from '@/components/states/ConnectionBanner';
import { useToast } from '@/components/states/ToastProvider';
import { useCrdtDocument } from '@/src/lib/editor/useCrdtDocument';
import { useAutosave, type SaveStatus } from '@/src/lib/editor/useAutosave';
import { usePageTitle } from '@/src/lib/editor/usePageTitle';

interface EditorContainerProps {
  pageId: string;
  initialTitle?: string;
}

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: '',
  dirty: '저장 대기…',
  saving: '저장 중…',
  saved: '저장됨',
};

export default function EditorContainer({ pageId, initialTitle = '' }: EditorContainerProps) {
  const { blocks, presences, cursors, localClientId, onBlockInput, onCursorMove, resolveCursorIndex, onEnter, onBackspace, onSetType, authError, restoreError, retryRestore, connectionStatus } =
    useCrdtDocument(pageId);

  // 전역 토스트 — 제목 저장 실패 알림/재시도/소멸에 사용(Provider 밖에서는 no-op).
  const { showError, dismiss } = useToast();

  // 제목 로드(단일 페이지 GET)·저장(PATCH save-port). 블록 본문은 CRDT op로 별도 즉시 영속.
  const { title, setTitle, saveTitle } = usePageTitle(pageId, initialTitle);

  // 저장 시도 세대 토큰. 느린 저장이 뒤늦게 완료돼 최신 토스트를 덮어쓰거나 지우는
  // 비동기 경쟁을 막는다 — 최신 시도(토큰 일치)일 때만 showError/dismiss를 반영한다.
  const attemptIdRef = useRef(0);

  // 저장 실패를 토스트로 감싼 save-port. useAutosave에는 이 래퍼를 전달한다(saveTitle 대체).
  // 실패 시 오류 토스트를 띄운 뒤 rethrow → useAutosave의 .catch(idle 복귀)를 유지한다(useAutosave.ts:39).
  const saveWithToast = useCallback(
    async (next: string) => {
      const attemptId = ++attemptIdRef.current;
      // 직전 실패한 동일 next를 클로저 캡처해 재시도한다(AC-10). 재시도 성공=토스트 소멸,
      // 재실패=동일 토스트 교체(단일 토스트 유지 AC-13). 각 재시도도 세대 토큰을 새로 발급한다.
      const retry = () => {
        const retryId = ++attemptIdRef.current;
        void saveTitle(next)
          .then(() => {
            if (attemptIdRef.current === retryId) dismiss();
          })
          .catch(() => {
            if (attemptIdRef.current === retryId)
              showError('변경사항을 저장하지 못했습니다.', { onRetry: retry });
          });
      };
      try {
        await saveTitle(next);
        // 최신 시도(토큰 일치) 성공 시, 이전 실패로 남아 있던 실패 토스트를 정리한다.
        // 가드가 있어 느린 이전 시도가 늦게 성공해도 최신 실패 토스트를 잘못 지우지 않는다.
        if (attemptIdRef.current === attemptId) dismiss();
      } catch (err) {
        // 최신 시도일 때만 오류 토스트를 노출한다(뒤늦게 끝난 이전 저장은 무시).
        if (attemptIdRef.current === attemptId)
          showError('변경사항을 저장하지 못했습니다.', { onRetry: retry });
        throw err; // rethrow — useAutosave의 idle 복귀 경로를 그대로 태운다.
      }
    },
    [saveTitle, showError, dismiss],
  );

  const { status, notifyChange } = useAutosave<string>(saveWithToast, 500);

  // 페이지 이동/언마운트 시 떠난 화면의 실패 토스트·onRetry를 정리한다(critic).
  // ToastProvider는 layout에 있어 EditorContainer(key={pageId} remount)보다 수명이 길다.
  useEffect(() => dismiss, [pageId, dismiss]);

  // presence는 릴레이가 self를 에코백할 수 있으므로, 아바타/인원수는 self를 제외하고 표시한다.
  const viewers = localClientId
    ? presences.filter((p) => p.clientId !== localClientId)
    : presences;

  const handleTitleChange = (next: string) => {
    setTitle(next);
    notifyChange(next);
  };

  // 제목에서 Enter → 본문 첫 블록으로 포커스 이동(노션식). 첫 [data-block-id]에 캐럿 배치.
  const rootRef = useRef<HTMLDivElement>(null);
  const focusFirstBlock = () => {
    const el = rootRef.current?.querySelector<HTMLElement>('[data-block-id]');
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  return (
    <div data-page-id={pageId} ref={rootRef} className="flex h-full min-w-0 flex-col">
      {/* 연결 상태 배너 — 오프라인/재연결 시에만 노출(명시 equality: 'online'/undefined 미렌더 AC-16).
          EditorContainer 내부에만 렌더되어 대시보드/멤버 화면엔 나타나지 않는다(AC-18). in-flow. */}
      {(connectionStatus === 'offline' || connectionStatus === 'reconnected') && (
        <ConnectionBanner status={connectionStatus} />
      )}
      {/* ① 에디터 탑바 — 풀폭(border-b hair-3). 모바일에선 AppShell 햄버거 상단바 아래
          본문 영역 내에 위치하며 브레드크럼·공유 pill·인원수는 sm 이상에서만 노출한다. */}
      <header className="flex items-center border-b border-hair-3 px-8 py-5">
        {/* 좌: 브레드크럼 — 실제 페이지 제목 단일 세그먼트(상위 경로 미배선) */}
        <nav aria-label="페이지 경로" className="hidden min-w-0 sm:block">
          <span className={`block truncate text-[13px] ${title ? 'text-body' : 'text-faint'}`}>
            {title || '제목 없음'}
          </span>
        </nav>
        {/* 우: 저장상태 · presence · 인원수 · 공유 pill(비기능) */}
        <div className="ml-auto flex items-center gap-[18px]">
          <span
            className="flex items-center gap-1.5 text-xs text-faint"
            aria-live="polite"
            data-testid="autosave-status"
          >
            {status === 'saved' && (
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ok" />
            )}
            {STATUS_LABEL[status]}
          </span>
          <PresenceAvatars presences={viewers} />
          {viewers.length > 0 && (
            <span className="hidden text-xs text-dim sm:inline">{viewers.length}명 보는 중</span>
          )}
          {/* 공유 pill — 비기능 시각 요소(추후 공유 모달). no-op + aria-disabled. */}
          <button
            type="button"
            aria-disabled
            className="hidden items-center rounded-full border border-ink px-[18px] py-[9px] text-[11px] font-bold uppercase tracking-[0.6px] text-ink sm:inline-flex"
          >
            공유
          </button>
        </div>
      </header>

      {/* ② 에디터 본문 — 중앙 정렬(max-w-744). 내부 스크롤. */}
      <div className="flex-1 overflow-auto pt-[30px] sm:pt-[76px]">
        <div className="relative mx-auto max-w-[744px] px-[22px] sm:px-12">
          {authError && (
            <div role="alert" data-testid="auth-error" className="mb-4 text-sm text-danger">
              세션이 만료되었습니다. <a href="/login">login</a>이 필요합니다.
            </div>
          )}
          {restoreError && !authError && (
            <div role="alert" data-testid="restore-error" className="mb-4 text-sm text-danger">
              이전 편집 내용을 불러오지 못했습니다.{' '}
              <button type="button" onClick={retryRestore} className="underline">재시도</button>
            </div>
          )}
          {/* 페이지 헤더: 이모지(페이지 icon 미배선 → 기본 📄) + 제목. 편집 메타는 데이터 없어 생략. */}
          <span aria-hidden className="mb-2 block text-[44px] leading-none sm:text-[56px]">📄</span>
          <TitleEditor title={title} onChange={handleTitleChange} onEnter={focusFirstBlock} />
          <Editor
            blocks={blocks}
            onBlockInput={onBlockInput}
            cursors={cursors}
            presences={presences}
            localClientId={localClientId}
            resolveCursorIndex={resolveCursorIndex}
            onCursorMove={onCursorMove}
            onEnter={onEnter}
            onBackspace={onBackspace}
            onSetType={onSetType}
          />
        </div>
      </div>
    </div>
  );
}
