import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { toWire, makeInlineInsertOp } from '@ieum/crdt';
import { useCrdtDocument } from '../useCrdtDocument';
import { GENESIS_BLOCK_ID } from '../crdtDocument';
import { createFakeTransport } from '@/src/lib/realtime/__tests__/fakeTransport';

// T7 / AC-6,7: DocState를 진실 원천으로 보유하고 로컬/원격 op로 화면(blocks)을 갱신한다.
const PAGE = 'pg_test001';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers(); // A3 connectionStatus 테스트의 fake timers 복구(비-fake 테스트엔 no-op).
});

describe('useCrdtDocument', () => {
  it('AC-7: 초기 blocks는 genesis 블록(빈 paragraph) 1개다', () => {
    const fake = createFakeTransport();
    const { result } = renderHook(() =>
      useCrdtDocument(PAGE, { transportFactory: () => fake }),
    );
    expect(result.current.blocks).toHaveLength(1);
    expect(result.current.blocks[0]!.type).toBe('paragraph');
    expect(result.current.blocks[0]!.text).toBe('');
  });

  it('AC-7: 로컬 입력(onBlockInput)이 DocState에 반영되어 blocks가 갱신된다', () => {
    const fake = createFakeTransport();
    const { result } = renderHook(() =>
      useCrdtDocument(PAGE, { transportFactory: () => fake }),
    );
    const blockId = result.current.blocks[0]!.id;
    act(() => result.current.onBlockInput(blockId, '안'));
    expect(result.current.blocks[0]!.text).toBe('안');
    // 송신: op 메시지가 transport로 전송됨(AC-5 경로).
    expect(fake.sent.some((s) => JSON.parse(s).type === 'op')).toBe(true);
  });

  it('AC-6: 원격 op 수신 시 applyDocOp로 적용되어 화면이 반영된다', () => {
    const fake = createFakeTransport();
    const { result } = renderHook(() =>
      useCrdtDocument(PAGE, { transportFactory: () => fake }),
    );
    const remote = toWire(
      makeInlineInsertOp({ counter: 1, siteId: 'site_remote' }, null, '굿', GENESIS_BLOCK_ID),
      1,
      'site_remote',
    );
    act(() => fake.emitMessage(JSON.stringify({ type: 'op', pageId: PAGE, op: remote })));
    expect(result.current.blocks[0]!.text).toBe('굿');
  });

  it('join-ack 수신 시 connectedClients와 localClientId가 갱신된다', () => {
    const fake = createFakeTransport();
    const { result } = renderHook(() =>
      useCrdtDocument(PAGE, { transportFactory: () => fake }),
    );
    act(() =>
      fake.emitMessage(JSON.stringify({ type: 'join-ack', pageId: PAGE, connectedClients: 2, clientId: 'c1' })),
    );
    expect(result.current.connectedClients).toBe(2);
    expect(result.current.localClientId).toBe('c1'); // P6 커서: 자기 식별
  });

  it('P6: presence-update/leave 수신 시 presences가 갱신된다', () => {
    const fake = createFakeTransport();
    const { result } = renderHook(() => useCrdtDocument(PAGE, { transportFactory: () => fake }));
    act(() =>
      fake.emitMessage(
        JSON.stringify({ type: 'presence-update', clientId: 'c2', displayName: '사용자 #c3d4', color: '#64B5F6' }),
      ),
    );
    expect(result.current.presences.map((p) => p.clientId)).toContain('c2');
    act(() => fake.emitMessage(JSON.stringify({ type: 'presence-leave', clientId: 'c2' })));
    expect(result.current.presences.map((p) => p.clientId)).not.toContain('c2');
  });

  it('P6 커서: cursor-update 수신 시 cursors 갱신, presence-leave 시 커서 제거(BR-7)', () => {
    const fake = createFakeTransport();
    const { result } = renderHook(() => useCrdtDocument(PAGE, { transportFactory: () => fake }));
    const blockId = result.current.blocks[0]!.id;
    act(() =>
      fake.emitMessage(JSON.stringify({ type: 'cursor-update', clientId: 'c2', blockId, anchorId: null })),
    );
    expect(result.current.cursors.map((c) => c.clientId)).toContain('c2');
    // presence-leave가 커서도 제거한다(BR-7 연동).
    act(() => fake.emitMessage(JSON.stringify({ type: 'presence-leave', clientId: 'c2' })));
    expect(result.current.cursors.map((c) => c.clientId)).not.toContain('c2');
  });

  it('P6 커서: onCursorMove(blockId, offset)가 indexToAnchorId 변환 후 cursor를 전송한다', () => {
    const fake = createFakeTransport();
    const { result } = renderHook(() => useCrdtDocument(PAGE, { transportFactory: () => fake }));
    const blockId = result.current.blocks[0]!.id;
    act(() => result.current.onBlockInput(blockId, '안녕')); // 텍스트 입력
    act(() => result.current.onCursorMove(blockId, 1)); // caret index 1(첫 글자 뒤)
    const cursorMsg = fake.sent.map((s) => JSON.parse(s)).find((m) => m.type === 'cursor');
    expect(cursorMsg).toBeDefined();
    expect(cursorMsg.blockId).toEqual(blockId);
    expect(cursorMsg.anchorId).not.toBeNull(); // index 1 → 직전 문자 id
  });

  // P9 / AC-A2: op-batch 수신 시 DocState가 "abc"로 수렴한다
  it('AC-A2: op-batch(인라인 insert "abc") 수신 → blocks 텍스트가 "abc"로 수렴한다', () => {
    const fake = createFakeTransport();
    const { result } = renderHook(() =>
      useCrdtDocument(PAGE, { transportFactory: () => fake }),
    );
    const genesisId = { counter: 0, siteId: 'genesis' };
    // 'a', 'b', 'c'를 순서대로 삽입하는 인라인 op 3개
    const opA = toWire(
      makeInlineInsertOp({ counter: 1, siteId: 'site_s' }, null, 'a', genesisId),
      1, 'site_s',
    );
    const opB = toWire(
      makeInlineInsertOp({ counter: 2, siteId: 'site_s' }, { counter: 1, siteId: 'site_s' }, 'b', genesisId),
      2, 'site_s',
    );
    const opC = toWire(
      makeInlineInsertOp({ counter: 3, siteId: 'site_s' }, { counter: 2, siteId: 'site_s' }, 'c', genesisId),
      3, 'site_s',
    );
    act(() =>
      fake.emitMessage(JSON.stringify({ type: 'op-batch', pageId: PAGE, ops: [opA, opB, opC] })),
    );
    expect(result.current.blocks[0]!.text).toBe('abc');
  });

  // P9 / AC-A4: 빈 op-batch 수신 → genesis 블록 1개 초기 상태 유지
  it('AC-A4: 빈 op-batch(ops:[]) 수신 → 블록 1개(genesis)이며 텍스트 빈 문자열 유지', () => {
    const fake = createFakeTransport();
    const { result } = renderHook(() =>
      useCrdtDocument(PAGE, { transportFactory: () => fake }),
    );
    act(() =>
      fake.emitMessage(JSON.stringify({ type: 'op-batch', pageId: PAGE, ops: [] })),
    );
    expect(result.current.blocks).toHaveLength(1);
    expect(result.current.blocks[0]!.text).toBe('');
  });

  // P9 / AC-A5: 동일 op-batch 2회 수신 → 텍스트/블록 불변(멱등)
  it('AC-A5: 동일 op-batch 2회 수신 → 텍스트가 변하지 않는다(멱등)', () => {
    const fake = createFakeTransport();
    const { result } = renderHook(() =>
      useCrdtDocument(PAGE, { transportFactory: () => fake }),
    );
    const genesisId = { counter: 0, siteId: 'genesis' };
    const opA = toWire(
      makeInlineInsertOp({ counter: 1, siteId: 'site_s' }, null, 'x', genesisId),
      1, 'site_s',
    );
    const batchMsg = JSON.stringify({ type: 'op-batch', pageId: PAGE, ops: [opA] });
    act(() => fake.emitMessage(batchMsg));
    const textAfterFirst = result.current.blocks[0]!.text;
    const blocksAfterFirst = result.current.blocks.length;
    act(() => fake.emitMessage(batchMsg)); // 동일 배치 재수신
    expect(result.current.blocks[0]!.text).toBe(textAfterFirst);
    expect(result.current.blocks).toHaveLength(blocksAfterFirst);
  });

  // P9 / C3 pageId 가드: 다른 pageId의 op-batch는 무시되어야 한다.
  it('C3: 다른 pageId의 op-batch 수신 시 blocks가 변경되지 않는다', () => {
    const fake = createFakeTransport();
    const { result } = renderHook(() =>
      useCrdtDocument(PAGE, { transportFactory: () => fake }),
    );
    const initialText = result.current.blocks[0]!.text;
    const initialLength = result.current.blocks.length;

    const genesisId = { counter: 0, siteId: 'genesis' };
    const opA = toWire(
      makeInlineInsertOp({ counter: 1, siteId: 'site_s' }, null, 'z', genesisId),
      1, 'site_s',
    );
    // PAGE와 다른 pageId로 op-batch 수신 — 훅은 무시해야 한다.
    act(() =>
      fake.emitMessage(JSON.stringify({ type: 'op-batch', pageId: 'pg_other_999', ops: [opA] })),
    );
    expect(result.current.blocks[0]!.text).toBe(initialText);
    expect(result.current.blocks).toHaveLength(initialLength);
  });

  // P9 / AC-A3: 실시간 op + op-batch 혼재 → 최종 텍스트 수렴(최종 상태만 단언)
  it('AC-A3: 실시간 op 도착 중 op-batch 수신해도 최종 텍스트가 기대값으로 수렴한다', () => {
    const fake = createFakeTransport();
    const { result } = renderHook(() =>
      useCrdtDocument(PAGE, { transportFactory: () => fake }),
    );
    const genesisId = { counter: 0, siteId: 'genesis' };
    // op-batch로 올 op
    const opBatch1 = toWire(
      makeInlineInsertOp({ counter: 1, siteId: 'site_s' }, null, 'a', genesisId),
      1, 'site_s',
    );
    const opBatch2 = toWire(
      makeInlineInsertOp({ counter: 2, siteId: 'site_s' }, { counter: 1, siteId: 'site_s' }, 'b', genesisId),
      2, 'site_s',
    );
    // 실시간 op (op-batch와 섞임)
    const opRt = toWire(
      makeInlineInsertOp({ counter: 3, siteId: 'site_s' }, { counter: 2, siteId: 'site_s' }, 'c', genesisId),
      3, 'site_s',
    );
    act(() => {
      // 실시간 op 먼저 도착
      fake.emitMessage(JSON.stringify({ type: 'op', pageId: PAGE, op: opRt }));
      // 이후 op-batch 도착 (앞선 op들 포함)
      fake.emitMessage(JSON.stringify({ type: 'op-batch', pageId: PAGE, ops: [opBatch1, opBatch2, opRt] }));
    });
    // 최종 수렴: 중복 적용이 멱등이면 텍스트는 'abc'여야 함
    expect(result.current.blocks[0]!.text).toBe('abc');
  });

  // ── WS-AUTH-01 신규 테스트 ─────────────────────────────────────────

  it('AC-09: WS 재연결 시 ready 팩토리를 재호출하여 새 token으로 join을 전송한다', async () => {
    // fetchCurrentUser 전역 fetch mock: 1회차 tok-1, 2회차 tok-2
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        callCount += 1;
        const token = callCount === 1 ? 'tok-1' : 'tok-2';
        return { ok: true, json: async () => ({ id: 'U1', token }) };
      }),
    );

    const fake = createFakeTransport();
    renderHook(() => useCrdtDocument(PAGE, { transportFactory: () => fake }));

    // 1번째 open → ready(fetch) → join 전송
    await act(async () => {
      fake.emitOpen();
      // ready Promise가 마이크로태스크 큐에서 해소될 시간을 준다
      await Promise.resolve();
      await Promise.resolve();
    });

    // fetch가 최소 1회 호출됐는지 확인
    expect(callCount).toBeGreaterThanOrEqual(1);

    const firstJoin = fake.sent
      .map((s) => JSON.parse(s))
      .filter((m) => m.type === 'join');
    expect(firstJoin.length).toBeGreaterThanOrEqual(1);
    // 1번째 join에 tok-1
    expect(firstJoin[0].token).toBe('tok-1');

    // 2번째 open (재연결 시뮬레이션)
    await act(async () => {
      fake.emitOpen();
      await Promise.resolve();
      await Promise.resolve();
    });

    // fetch 총 2회 호출 (매 open마다 재호출)
    expect(callCount).toBe(2);

    const allJoins = fake.sent
      .map((s) => JSON.parse(s))
      .filter((m) => m.type === 'join');
    expect(allJoins.length).toBeGreaterThanOrEqual(2);
    // 2번째 join에 새 tok-2
    expect(allJoins[allJoins.length - 1].token).toBe('tok-2');
  });

  it('AC-10: fetchCurrentUser 401 → null → join 미시도 + authError === true', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })));

    const fake = createFakeTransport();
    const { result } = renderHook(() =>
      useCrdtDocument(PAGE, { transportFactory: () => fake }),
    );

    await act(async () => {
      fake.emitOpen();
      await Promise.resolve();
      await Promise.resolve();
    });

    // authError 상태가 true로 노출돼야 한다
    expect(result.current.authError).toBe(true);

    // join 메시지가 전송되지 않아야 한다
    const joinMsgs = fake.sent
      .map((s) => JSON.parse(s))
      .filter((m) => m.type === 'join');
    expect(joinMsgs).toHaveLength(0);
  });

  // ── 복원 실패 UX (WS-AUTH-RESTORE) ────────────────────────────────

  it('AC-9: op-batch-error 수신 → restoreError === true', () => {
    const fake = createFakeTransport();
    const { result } = renderHook(() =>
      useCrdtDocument(PAGE, { transportFactory: () => fake }),
    );

    act(() =>
      fake.emitMessage(JSON.stringify({ type: 'op-batch-error', pageId: PAGE })),
    );

    expect(result.current.restoreError).toBe(true);
  });

  it('AC-11: op-batch-error 후 op-batch 수신 → restoreError === false(해제)', () => {
    const fake = createFakeTransport();
    const { result } = renderHook(() =>
      useCrdtDocument(PAGE, { transportFactory: () => fake }),
    );

    // 먼저 에러 상태 만들기
    act(() =>
      fake.emitMessage(JSON.stringify({ type: 'op-batch-error', pageId: PAGE })),
    );
    expect(result.current.restoreError).toBe(true);

    // 빈 ops로도 성공 수신이면 에러 해제
    act(() =>
      fake.emitMessage(JSON.stringify({ type: 'op-batch', pageId: PAGE, ops: [] })),
    );
    expect(result.current.restoreError).toBe(false);
  });

  // ── 하드닝 (1): retry 스팸 가드 ────────────────────────────────────
  it('HARD-1: retryRestore 연속 2회 호출 시 fetch(/me)는 1회만 발화된다(in-flight 중 재호출 무시)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: 'U1', token: 'tok-spam' }),
      })),
    );

    const fake = createFakeTransport();
    const { result } = renderHook(() =>
      useCrdtDocument(PAGE, { transportFactory: () => fake }),
    );

    // 마운트 open → 초기 join 완료
    await act(async () => {
      fake.emitOpen();
      await Promise.resolve();
      await Promise.resolve();
    });

    // retryRestore 호출 직전 fetch 카운터 리셋(마운트 시 fetch와 구분)
    vi.mocked(fetch).mockClear();

    // 연속 2회 호출 — in-flight 중 두 번째 호출은 무시돼야 한다
    await act(async () => {
      result.current.retryRestore();
      result.current.retryRestore();
      await Promise.resolve();
      await Promise.resolve();
    });

    // 가드 미구현 시 fetch는 2회 → 현재 RED
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  // ── 하드닝 (3): fetchAuth 실패 시 authError 확신 ─────────────────
  it('HARD-3: retryRestore 호출 시 fetchAuth가 null(401) → authError===true(확신용)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })));

    const fake = createFakeTransport();
    const { result } = renderHook(() =>
      useCrdtDocument(PAGE, { transportFactory: () => fake }),
    );

    // retryRestore 직접 호출(open 없이) — fetchAuth 실패 → authError
    await act(async () => {
      result.current.retryRestore();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.authError).toBe(true);
  });

  it('AC-10(retryRestore): retryRestore 호출 → fetchAuth 성공 후 join 재전송', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: 'U1', token: 'tok-retry' }),
      })),
    );

    const fake = createFakeTransport();
    const { result } = renderHook(() =>
      useCrdtDocument(PAGE, { transportFactory: () => fake }),
    );

    // 마운트 후 open → ready → 초기 join 전송
    await act(async () => {
      fake.emitOpen();
      await Promise.resolve();
      await Promise.resolve();
    });

    // retryRestore 호출 전 sent 스냅샷
    const sentBeforeRetry = fake.sent.length;

    // retryRestore 호출 → fetchAuth(비동기) → join 재전송
    await act(async () => {
      result.current.retryRestore();
      await Promise.resolve();
      await Promise.resolve();
    });

    // retryRestore 호출 후 새 join이 추가 전송됐는지 확인
    const newJoins = fake.sent
      .slice(sentBeforeRetry)
      .map((s) => JSON.parse(s))
      .filter((m) => m.type === 'join' && m.pageId === PAGE);

    expect(newJoins.length).toBeGreaterThanOrEqual(1);
  });

  // ── A3 연결 상태(connectionStatus) — ConnectionBanner 배선 ────────────
  // transport onOpen/onClose 구독으로 파생하는 상태 머신(flapping 안전, offline 우선).

  it('AC-16: 초기(연결 이벤트 없음) connectionStatus는 online이다', () => {
    const fake = createFakeTransport();
    const { result } = renderHook(() =>
      useCrdtDocument(PAGE, { transportFactory: () => fake }),
    );
    expect(result.current.connectionStatus).toBe('online');
  });

  it('AC-14/15: connectionStatus가 online→offline→reconnected→(3초)→online으로 전이한다', async () => {
    vi.useFakeTimers();
    // onOpen 시 relay ready(fetchCurrentUser)가 발화하므로 fetch를 성공값으로 stub(상태 머신과 무관).
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ id: 'U1', token: 't' }) })),
    );
    const fake = createFakeTransport();
    const { result } = renderHook(() =>
      useCrdtDocument(PAGE, { transportFactory: () => fake }),
    );

    // 초기 → online(AC-16)
    expect(result.current.connectionStatus).toBe('online');

    // 끊김 → offline(AC-14)
    act(() => fake.emitClose());
    expect(result.current.connectionStatus).toBe('offline');

    // 재연결(open) → reconnected. async act로 relay ready 체인을 flush.
    await act(async () => {
      fake.emitOpen();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.connectionStatus).toBe('reconnected');

    // 3초 경과 → 자동 online 복귀(AC-15)
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.connectionStatus).toBe('online');
  });

  it('flapping(critic MUST-ADDRESS): reconnected 3초 내 재차단 시 online 승격 없이 offline을 유지한다', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ id: 'U1', token: 't' }) })),
    );
    const fake = createFakeTransport();
    const { result } = renderHook(() =>
      useCrdtDocument(PAGE, { transportFactory: () => fake }),
    );

    // offline → 재연결(reconnected, 3초 타이머 시작)
    act(() => fake.emitClose());
    await act(async () => {
      fake.emitOpen();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.connectionStatus).toBe('reconnected');

    // 3초 경과 전(1초 시점) 재차단 → 살아있던 타이머 clear + offline
    act(() => vi.advanceTimersByTime(1000));
    act(() => fake.emitClose());
    expect(result.current.connectionStatus).toBe('offline');

    // 원래 타이머가 fire됐을 시점(누적 3초+)을 지나도 offline 유지(타이머 clear 검증)
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.connectionStatus).toBe('offline');
  });
});
