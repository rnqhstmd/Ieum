import { describe, it, expect } from 'vitest';
import { RoomRegistry } from '../src/room.js';
import type { ClientHandle } from '../src/room.js';
import type { CursorMsg, CursorUpdateMsg, JoinAckMsg } from '../src/protocol.js';

// P6 라이브 커서 / BR-8, AC-7: cursor broadcast(발신자 제외·저장 없음) + join-ack clientId.
const PAGE = 'pg_test001';
const BLOCK = { counter: 0, siteId: 'genesis' };
const A: ClientHandle = { id: 'a' };
const B: ClientHandle = { id: 'b' };
const cursorMsg = (anchorId: { counter: number; siteId: string } | null): CursorMsg => ({
  type: 'cursor',
  pageId: PAGE,
  blockId: BLOCK,
  anchorId,
});

describe('RoomRegistry — cursor', () => {
  it('AC-7 채널: join-ack에 서버 부여 clientId가 포함된다', () => {
    const reg = new RoomRegistry();
    const d = reg.join(A, PAGE);
    const ack = d.find((x) => x.message.type === 'join-ack')!.message as JoinAckMsg;
    expect(ack.clientId).toBe(A.id);
  });

  it('BR-8: cursor를 같은 room의 다른 탭에 broadcast하고 발신자는 제외한다', () => {
    const reg = new RoomRegistry();
    reg.join(A, PAGE);
    reg.join(B, PAGE);
    const anchorId = { counter: 5, siteId: 'site_a' };
    const d = reg.handleCursor(A, cursorMsg(anchorId));

    const cu = d.filter((x) => x.message.type === 'cursor-update');
    expect(cu).toHaveLength(1);
    expect(cu[0]!.target).toBe(B);
    const m = cu[0]!.message as CursorUpdateMsg;
    expect(m.clientId).toBe(A.id);
    expect(m.blockId).toEqual(BLOCK);
    expect(m.anchorId).toEqual(anchorId);
  });

  it('혼자 접속 시 cursor broadcast가 0건이고 throw하지 않는다', () => {
    const reg = new RoomRegistry();
    reg.join(A, PAGE);
    let d: ReturnType<RoomRegistry['handleCursor']> = [];
    expect(() => {
      d = reg.handleCursor(A, cursorMsg(null));
    }).not.toThrow();
    expect(d.filter((x) => x.message.type === 'cursor-update')).toHaveLength(0);
  });

  it('보안: join하지 않은 room의 cursor는 broadcast하지 않는다(교차주입 차단)', () => {
    const reg = new RoomRegistry();
    reg.join(A, PAGE);
    reg.join(B, 'pg_other');
    const spoof: CursorMsg = { ...cursorMsg(null), pageId: 'pg_other' };
    const d = reg.handleCursor(A, spoof);
    expect(d.filter((x) => x.message.type === 'cursor-update')).toHaveLength(0);
  });
});
