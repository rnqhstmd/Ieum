import { describe, it, expect } from 'vitest';
import {
  applyDocOp,
  docToBlocks,
  fromWire,
  toWire,
  getVisibleNodes,
  idKey,
  idEquals,
  localInlineInsert,
  resolveAnchorToIndex,
} from '@ieum/crdt';
import { createCollaborativeDocument, diffBlockText } from '@/src/lib/editor/crdtDocument';
import { createRelayClient } from '../relayClient';
import { createInMemoryRelay } from './inMemoryRelay';
import type { CursorInfo } from '../protocol';

// P6 라이브 커서 / AC-10: 2탭이 실 RoomRegistry(in-memory relay)를 거쳐 커서를 broadcast하고,
// 앵커 앞 삽입 후에도 anchorId가 동일 노드를 +N으로 가리킨다(M1: 삽입 위치 명시).
const PAGE = 'pg_test001';

describe('2탭 커서 수렴 (in-memory relay)', () => {
  it('AC-10: B 커서가 A에 broadcast되고, A가 앵커 앞에 삽입하면 resolve가 +1(동일 노드)', () => {
    const relay = createInMemoryRelay();
    const docA = createCollaborativeDocument('site_a');
    const docB = createCollaborativeDocument('site_b');
    let aCursor: CursorInfo | null = null;
    const clientA = createRelayClient(relay.connect('a'), PAGE, {
      onRemoteOp: (env) => applyDocOp(docA, fromWire(env)),
      onCursorUpdate: (info) => {
        aCursor = info;
      },
    });
    const clientB = createRelayClient(relay.connect('b'), PAGE, {
      onRemoteOp: (env) => applyDocOp(docB, fromWire(env)),
    });
    clientA.join(PAGE);
    clientB.join(PAGE);

    const blockId = docToBlocks(docB)[0]!.id;
    // B가 "abc" 입력 → A에 op 수렴.
    let seqB = 0;
    for (const op of diffBlockText(docB, blockId, '', 'abc')) clientB.sendOp(toWire(op, ++seqB, 'site_b'));
    expect(docToBlocks(docA)[0]!.text).toBe('abc');

    // B가 'b'(가시 index 1) 뒤에 caret → anchorId = 'b'의 id. cursor 전송.
    const anchorB = getVisibleNodes(docB.inlineRgas.get(idKey(blockId))!)[1]!.id;
    clientB.sendCursor(blockId, anchorB);

    // A가 B의 커서를 받았다(broadcast).
    expect(aCursor).not.toBeNull();
    expect(idEquals(aCursor!.anchorId!, anchorB)).toBe(true);

    // A에서 resolve = 2(caret이 'b' 뒤). 삽입 전.
    expect(resolveAnchorToIndex(docA, blockId, aCursor!.anchorId)).toBe(2);

    // 앵커('b', 가시 index 1) '앞'에 직접 삽입. localInlineInsert(index 1)은 originId='a'(직전 문자)로
    // 앵커 앞 위치를 코드로 확정한다(M1/CR-1 — diffBlockText 문자열 위임이 아닌 명시적 삽입 위치).
    // B의 새 counter > 'b' counter라 RGA tie-break상 'X'가 'b' 앞에 확정된다.
    const insertOp = localInlineInsert(docB, blockId, 1, 'X');
    expect(docToBlocks(docB)[0]!.text).toBe('aXbc'); // B 로컬: 'X'가 'b' 앞 확정
    clientB.sendOp(toWire(insertOp, ++seqB, 'site_b'));
    expect(docToBlocks(docA)[0]!.text).toBe('aXbc'); // A 수렴

    // anchorId는 그대로 'b'를 가리키고 가시 index만 +1 → resolve = 3.
    expect(resolveAnchorToIndex(docA, blockId, aCursor!.anchorId)).toBe(3);
    // 여전히 'b' 노드를 가리킨다.
    const resolved = getVisibleNodes(docA.inlineRgas.get(idKey(blockId))!)[3 - 1]!;
    expect(idEquals(resolved.id, anchorB)).toBe(true);
    expect(resolved.value).toBe('b');
  });
});
