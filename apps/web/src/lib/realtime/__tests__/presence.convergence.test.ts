import { describe, it, expect } from 'vitest';
import { applyDocOp, docToBlocks, fromWire, toWire } from '@ieum/crdt';
import { createCollaborativeDocument, diffBlockText } from '@/src/lib/editor/crdtDocument';
import { createRelayClient } from '../relayClient';
import { createInMemoryRelay } from './inMemoryRelay';
import type { PresenceInfo } from '../protocol';

// P6 / AC-1,2,3,9: 두 탭이 실제 RoomRegistry(in-memory relay)를 거쳐 presence를 수렴/이탈한다.
// FakeTransport는 onOpen을 fire하지 않으므로 join은 수동 호출(convergence.test 패턴).
const PAGE = 'pg_test001';

describe('2탭 presence 수렴 (in-memory relay)', () => {
  it('AC-1/2: B join 시 A에 B(displayName)가 보이고, 신규 탭은 기존 접속자 roster를 받는다', () => {
    const relay = createInMemoryRelay();
    const aSeen: PresenceInfo[] = [];
    const clientA = createRelayClient(
      relay.connect('a'),
      PAGE,
      { onRemoteOp: () => {}, onPresenceUpdate: (info) => aSeen.push(info) },
      { displayName: '사용자 #aaaa' },
    );
    clientA.join(PAGE);
    // A 단독: self presence-update(자기 자신) 1건.
    expect(aSeen.map((p) => p.clientId)).toEqual(['a']);

    const bSeen: PresenceInfo[] = [];
    const clientB = createRelayClient(
      relay.connect('b'),
      PAGE,
      { onRemoteOp: () => {}, onPresenceUpdate: (info) => bSeen.push(info) },
      { displayName: '사용자 #bbbb' },
    );
    clientB.join(PAGE);

    // A는 B의 presence를 받는다(displayName은 B가 보낸 값 — inMemoryRelay가 presence 전달).
    const bAsSeenByA = aSeen.find((p) => p.clientId === 'b');
    expect(bAsSeenByA).toBeDefined();
    expect(bAsSeenByA!.displayName).toBe('사용자 #bbbb');
    // B는 self(b) + roster(a)를 받는다.
    expect(new Set(bSeen.map((p) => p.clientId))).toEqual(new Set(['a', 'b']));
  });

  it('AC-3: A가 disconnect하면 B에게 presence-leave(clientId=a)가 전달된다', () => {
    const relay = createInMemoryRelay();
    const bLeaves: string[] = [];
    const clientA = createRelayClient(
      relay.connect('a'),
      PAGE,
      { onRemoteOp: () => {} },
      { displayName: '사용자 #aaaa' },
    );
    const clientB = createRelayClient(
      relay.connect('b'),
      PAGE,
      { onRemoteOp: () => {}, onPresenceLeave: (clientId) => bLeaves.push(clientId) },
      { displayName: '사용자 #bbbb' },
    );
    clientA.join(PAGE);
    clientB.join(PAGE);

    clientA.dispose(); // transport.close → inMemoryRelay close → reg.leave deliver
    expect(bLeaves).toContain('a');
  });

  it('AC-9: presence 배선 중에도 op 수렴 결과가 불변이다', () => {
    const relay = createInMemoryRelay();
    const docA = createCollaborativeDocument('site_a');
    const docB = createCollaborativeDocument('site_b');
    const clientA = createRelayClient(
      relay.connect('a'),
      PAGE,
      { onRemoteOp: (env) => applyDocOp(docA, fromWire(env)), onPresenceUpdate: () => {} },
      { displayName: '사용자 #aaaa' },
    );
    const clientB = createRelayClient(
      relay.connect('b'),
      PAGE,
      { onRemoteOp: (env) => applyDocOp(docB, fromWire(env)), onPresenceUpdate: () => {} },
      { displayName: '사용자 #bbbb' },
    );
    clientA.join(PAGE);
    clientB.join(PAGE);

    const blockId = docToBlocks(docA)[0]!.id;
    let seqA = 0;
    for (const op of diffBlockText(docA, blockId, '', '안녕')) {
      clientA.sendOp(toWire(op, ++seqA, 'site_a'));
    }
    expect(docToBlocks(docB)[0]!.text).toBe('안녕');
    expect(docToBlocks(docA)).toEqual(docToBlocks(docB));
  });
});
