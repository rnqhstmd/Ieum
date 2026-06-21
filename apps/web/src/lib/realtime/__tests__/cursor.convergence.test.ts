import { describe, it, expect } from 'vitest';
import {
  applyDocOp,
  docToBlocks,
  fromWire,
  toWire,
  getVisibleNodes,
  idKey,
  idEquals,
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

    // 앵커('b') '앞'(index 1, 'a'와 'b' 사이)에 1문자 삽입 → 'aXbc'.
    // M1: B가 삽입(B의 새 counter > 자신의 'b' counter라 RGA tie-break상 'X'가 'b' 앞에 확정).
    let seqB2 = seqB;
    for (const op of diffBlockText(docB, blockId, 'abc', 'aXbc')) {
      clientB.sendOp(toWire(op, ++seqB2, 'site_b'));
    }
    expect(docToBlocks(docA)[0]!.text).toBe('aXbc');

    // anchorId는 그대로 'b'를 가리키고 가시 index만 +1 → resolve = 3.
    expect(resolveAnchorToIndex(docA, blockId, aCursor!.anchorId)).toBe(3);
    // 여전히 'b' 노드를 가리킨다.
    const resolved = getVisibleNodes(docA.inlineRgas.get(idKey(blockId))!)[3 - 1]!;
    expect(idEquals(resolved.id, anchorB)).toBe(true);
    expect(resolved.value).toBe('b');
  });
});
