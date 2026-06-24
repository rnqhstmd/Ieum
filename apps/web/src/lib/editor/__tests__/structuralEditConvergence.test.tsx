import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { applyDocOp, docToBlocks, fromWire } from '@ieum/crdt';
import { createCollaborativeDocument } from '../crdtDocument';
import { useCrdtDocument } from '../useCrdtDocument';
import { createFakeTransport } from '@/src/lib/realtime/__tests__/fakeTransport';

// P9 / AC-B1, AC-B2, AC-B4: useCrdtDocument의 onEnter/onBackspace/onSetType 콜백이
// op를 전송하고, 상대방 doc에 적용 시 양쪽이 수렴함을 검증한다.
//
// 패턴: hookA가 onEnter/onBackspace/onSetType 호출 → fakeA.sent에 op 적재
//       → 상대 docB에 수동 applyDocOp → docToBlocks 수렴 단언.

const PAGE = 'pg_struct_edit_test';

/** fakeTransport.sent에 쌓인 op 메시지를 docB에 모두 적용한다. */
function flushOpsToDoc(
  sent: string[],
  from: number,
  docB: ReturnType<typeof createCollaborativeDocument>,
): void {
  for (let i = from; i < sent.length; i++) {
    const msg = JSON.parse(sent[i]!);
    if (msg.type === 'op') {
      applyDocOp(docB, fromWire(msg.op));
    }
  }
}

describe('useCrdtDocument 구조 편집 수렴 (P9)', () => {
  // AC-B1: onEnter(blockId, 5) → op 전송 → peer 수렴: "Hello"/"World" 2블록
  it('AC-B1: onEnter(blockId, 5) → fakeTransport에 op 전송, peer 적용 시 2블록 수렴', () => {
    const fakeA = createFakeTransport();
    const { result } = renderHook(() =>
      useCrdtDocument(PAGE, { transportFactory: () => fakeA }),
    );

    // onEnter 콜백이 노출되어야 한다
    expect(typeof result.current.onEnter).toBe('function');

    // 먼저 "HelloWorld" 입력
    const blockId = result.current.blocks[0]!.id;
    act(() => result.current.onBlockInput(blockId, 'HelloWorld'));

    // peer docB 생성 후 현재까지 op 동기화
    const docB = createCollaborativeDocument('site_b');
    const sentAfterInput = fakeA.sent.length;
    flushOpsToDoc(fakeA.sent, 0, docB);
    expect(docToBlocks(docB)[0]!.text).toBe('HelloWorld');

    // onEnter(blockId, 5) 호출
    act(() => result.current.onEnter(blockId, 5));

    // 전송된 op가 1개 이상이어야 한다 (block-insert + inline ops)
    expect(fakeA.sent.length).toBeGreaterThan(sentAfterInput);

    // peer에 새 op 적용
    flushOpsToDoc(fakeA.sent, sentAfterInput, docB);

    // 양쪽 수렴: 2블록, "Hello"/"World"
    const blocksA = result.current.blocks;
    const blocksB = docToBlocks(docB);
    expect(blocksA).toHaveLength(2);
    expect(blocksB).toHaveLength(2);
    expect(blocksA[0]!.text).toBe('Hello');
    expect(blocksA[1]!.text).toBe('World');
    expect(blocksB[0]!.text).toBe('Hello');
    expect(blocksB[1]!.text).toBe('World');
  });

  // AC-B2: onBackspace(block2Id) → op 전송 → peer 수렴: 1블록 "HelloWorld"
  it('AC-B2: onBackspace(block2Id) → fakeTransport에 op 전송, peer 적용 시 1블록 수렴', () => {
    const fakeA = createFakeTransport();
    const { result } = renderHook(() =>
      useCrdtDocument(PAGE, { transportFactory: () => fakeA }),
    );

    // onBackspace 콜백이 노출되어야 한다
    expect(typeof result.current.onBackspace).toBe('function');

    // "HelloWorld" 입력 후 offset 5에서 Enter 분할 → 2블록 생성
    const blockId = result.current.blocks[0]!.id;
    act(() => result.current.onBlockInput(blockId, 'HelloWorld'));
    act(() => result.current.onEnter(blockId, 5));
    expect(result.current.blocks).toHaveLength(2);

    // peer docB에 동기화
    const docB = createCollaborativeDocument('site_b');
    flushOpsToDoc(fakeA.sent, 0, docB);
    expect(docToBlocks(docB)).toHaveLength(2);

    const sentBefore = fakeA.sent.length;

    // 두 번째 블록에서 onBackspace
    const block2Id = result.current.blocks[1]!.id;
    act(() => result.current.onBackspace(block2Id));

    // op가 전송되어야 한다
    expect(fakeA.sent.length).toBeGreaterThan(sentBefore);

    // peer에 적용
    flushOpsToDoc(fakeA.sent, sentBefore, docB);

    // 양쪽 수렴: 1블록 "HelloWorld"
    expect(result.current.blocks).toHaveLength(1);
    expect(result.current.blocks[0]!.text).toBe('HelloWorld');
    expect(docToBlocks(docB)).toHaveLength(1);
    expect(docToBlocks(docB)[0]!.text).toBe('HelloWorld');
  });

  // AC-B3: genesis 단일 블록 index0에서 onBackspace → op 전송 0건, blocks 불변
  it('AC-B3: genesis 단일 블록 onBackspace → op 전송 없음, blocks 불변', () => {
    const fakeA = createFakeTransport();
    const { result } = renderHook(() =>
      useCrdtDocument(PAGE, { transportFactory: () => fakeA }),
    );

    expect(typeof result.current.onBackspace).toBe('function');
    expect(result.current.blocks).toHaveLength(1);

    const sentBefore = fakeA.sent.length;
    const genesisId = result.current.blocks[0]!.id;

    act(() => result.current.onBackspace(genesisId));

    // op 전송 없음
    expect(fakeA.sent.length).toBe(sentBefore);
    // blocks 불변
    expect(result.current.blocks).toHaveLength(1);
    expect(result.current.blocks[0]!.id).toEqual(genesisId);
    expect(result.current.blocks[0]!.text).toBe('');
  });

  // AC-B4: onSetType(blockId, 'heading1') → op 전송 → peer 수렴: heading1
  it('AC-B4: onSetType(blockId, "heading1") → op 전송, peer 적용 시 heading1 수렴', () => {
    const fakeA = createFakeTransport();
    const { result } = renderHook(() =>
      useCrdtDocument(PAGE, { transportFactory: () => fakeA }),
    );

    // onSetType 콜백이 노출되어야 한다
    expect(typeof result.current.onSetType).toBe('function');

    const blockId = result.current.blocks[0]!.id;
    expect(result.current.blocks[0]!.type).toBe('paragraph');

    // peer docB 초기 동기화
    const docB = createCollaborativeDocument('site_b');
    const sentBefore = fakeA.sent.length;

    act(() => result.current.onSetType(blockId, 'heading1'));

    // op 전송 확인
    expect(fakeA.sent.length).toBeGreaterThan(sentBefore);

    // peer에 적용
    flushOpsToDoc(fakeA.sent, sentBefore, docB);

    // 양쪽 수렴: heading1
    expect(result.current.blocks[0]!.type).toBe('heading1');
    expect(docToBlocks(docB)[0]!.type).toBe('heading1');
  });
});
