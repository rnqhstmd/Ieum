import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { toWire, makeInlineInsertOp } from '@ieum/crdt';
import { useCrdtDocument } from '../useCrdtDocument';
import { GENESIS_BLOCK_ID } from '../crdtDocument';
import { createFakeTransport } from '@/src/lib/realtime/__tests__/fakeTransport';

// T7 / AC-6,7: DocState를 진실 원천으로 보유하고 로컬/원격 op로 화면(blocks)을 갱신한다.
const PAGE = 'pg_test001';

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

  it('join-ack 수신 시 connectedClients가 갱신된다', () => {
    const fake = createFakeTransport();
    const { result } = renderHook(() =>
      useCrdtDocument(PAGE, { transportFactory: () => fake }),
    );
    act(() => fake.emitMessage(JSON.stringify({ type: 'join-ack', pageId: PAGE, connectedClients: 2 })));
    expect(result.current.connectedClients).toBe(2);
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
});
