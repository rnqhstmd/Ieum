import { describe, it, expect, vi } from 'vitest';
import { applyDocOp, docToBlocks, fromWire, toWire } from '@ieum/crdt';
import { createCollaborativeDocument, diffBlockText } from '@/src/lib/editor/crdtDocument';
import { createRelayClient } from '../relayClient';
import { createInMemoryRelay } from './inMemoryRelay';

// T5 / AC-8,3,10: 두 탭이 in-memory relay(실제 RoomRegistry)를 거쳐 수렴하는지 검증.
const PAGE = 'pg_test001';

describe('2탭 라이브 수렴 (in-memory relay)', () => {
  it('AC-8: 탭 A의 인라인 입력이 탭 B에 반영되고 두 문서가 수렴한다', () => {
    const relay = createInMemoryRelay();
    const docA = createCollaborativeDocument('site_a');
    const docB = createCollaborativeDocument('site_b');
    const clientA = createRelayClient(relay.connect('a'), PAGE, {
      onRemoteOp: (env) => applyDocOp(docA, fromWire(env)),
    });
    const clientB = createRelayClient(relay.connect('b'), PAGE, {
      onRemoteOp: (env) => applyDocOp(docB, fromWire(env)),
    });
    clientA.join(PAGE);
    clientB.join(PAGE);

    const blockId = docToBlocks(docA)[0]!.id; // genesis 블록 — 두 탭 공유
    let seqA = 0;
    for (const op of diffBlockText(docA, blockId, '', '안녕')) {
      clientA.sendOp(toWire(op, ++seqA, 'site_a'));
    }

    expect(docToBlocks(docB)[0]!.text).toBe('안녕');
    expect(docToBlocks(docA)).toEqual(docToBlocks(docB));
  });

  it('AC-3/AC-10: 발신자는 자기 op를 재수신하지 않고 docToBlocks가 불변이다', () => {
    const relay = createInMemoryRelay();
    const docA = createCollaborativeDocument('site_a');
    const onRemoteOpA = vi.fn();
    const clientA = createRelayClient(relay.connect('a'), PAGE, { onRemoteOp: onRemoteOpA });
    createRelayClient(relay.connect('b'), PAGE, { onRemoteOp: () => {} });
    clientA.join(PAGE);

    const blockId = docToBlocks(docA)[0]!.id;
    const before = docToBlocks(docA);
    let seqA = 0;
    for (const op of diffBlockText(docA, blockId, '', '안')) {
      clientA.sendOp(toWire(op, ++seqA, 'site_a'));
    }
    // 자기 op는 relay가 broadcast하지 않음(BR-2) → onRemoteOp 미호출.
    expect(onRemoteOpA).not.toHaveBeenCalled();
    // 로컬 1회 적용만 — 재수신/중복 적용 없음.
    expect(docToBlocks(docA)[0]!.text).toBe('안');
    expect(before[0]!.id).toEqual(docToBlocks(docA)[0]!.id);
  });

  it('양방향 수렴: A와 B가 각각 입력해도 같은 결과로 수렴한다', () => {
    const relay = createInMemoryRelay();
    const docA = createCollaborativeDocument('site_a');
    const docB = createCollaborativeDocument('site_b');
    const clientA = createRelayClient(relay.connect('a'), PAGE, {
      onRemoteOp: (env) => applyDocOp(docA, fromWire(env)),
    });
    const clientB = createRelayClient(relay.connect('b'), PAGE, {
      onRemoteOp: (env) => applyDocOp(docB, fromWire(env)),
    });
    clientA.join(PAGE);
    clientB.join(PAGE);
    const blockId = docToBlocks(docA)[0]!.id;

    let seqA = 0;
    for (const op of diffBlockText(docA, blockId, '', 'A')) clientA.sendOp(toWire(op, ++seqA, 'site_a'));
    // B는 A의 글자를 받은 뒤 자신의 텍스트를 이어 입력.
    const bText = docToBlocks(docB)[0]!.text;
    let seqB = 0;
    for (const op of diffBlockText(docB, blockId, bText, bText + 'B')) clientB.sendOp(toWire(op, ++seqB, 'site_b'));

    expect(docToBlocks(docA)).toEqual(docToBlocks(docB));
    expect(docToBlocks(docA)[0]!.text).toBe('AB');
  });
});
