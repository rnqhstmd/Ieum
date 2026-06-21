import { describe, it, expect } from 'vitest';
import { RoomRegistry } from '../src/room.js';
import type { ClientHandle, Dispatch } from '../src/room.js';
import type { PresenceUpdateMsg, PresenceLeaveMsg } from '../src/protocol.js';

// P6 / AC-1,2,3,6,7,8: RoomRegistry presence 확장은 순수 라우팅 — Dispatch[]만 반환한다.
// 07-collaboration-crdt.md:531 팔레트 정본(기대값 산출 근거).
const EXPECTED_COLORS = [
  '#E57373', '#64B5F6', '#81C784', '#FFD54F',
  '#BA68C8', '#4DB6AC', '#FF8A65', '#90A4AE',
];

describe('RoomRegistry — presence (아바타 목록)', () => {
  const PAGE = 'pg_test001';
  const A: ClientHandle = { id: 'a' };
  const B: ClientHandle = { id: 'b' };
  const C: ClientHandle = { id: 'c' };
  const D: ClientHandle = { id: 'd' };

  const pUpdates = (d: Dispatch[], target?: ClientHandle) =>
    d.filter(
      (x) =>
        x.message.type === 'presence-update' && (target === undefined || x.target === target),
    ) as Array<{ target: ClientHandle; message: PresenceUpdateMsg }>;
  /** 발신자에게 회신된 self presence-update (clientId === 발신자). */
  const selfUpdate = (d: Dispatch[], self: ClientHandle) =>
    pUpdates(d, self).find((x) => x.message.clientId === self.id)?.message;

  it('불변식: join Dispatch[0]은 항상 join-ack이다', () => {
    const reg = new RoomRegistry();
    const d = reg.join(A, PAGE, { displayName: '사용자 #a1b2' });
    expect(d[0]!.target).toBe(A);
    expect(d[0]!.message.type).toBe('join-ack');
  });

  it('AC-1: B join 시 기존 탭 A에게 B의 presence-update를 broadcast하고, B 자신은 broadcast에서 제외된다', () => {
    const reg = new RoomRegistry();
    reg.join(A, PAGE, { displayName: 'A이름' });
    const d = reg.join(B, PAGE, { displayName: 'B이름' });

    // A는 B의 presence-update를 정확히 1건 받는다(broadcast).
    const toA = pUpdates(d, A);
    expect(toA).toHaveLength(1);
    expect(toA[0]!.message.clientId).toBe(B.id);
    expect(toA[0]!.message.displayName).toBe('B이름');
    expect(toA[0]!.message.color).toBeTypeOf('string');

    // B는 자기 자신에 대한 broadcast를 받지 않는다 — self는 별도 self-update 1건만(clientId=B).
    const selfB = pUpdates(d, B).filter((x) => x.message.clientId === B.id);
    expect(selfB).toHaveLength(1);
  });

  it('AC-2: 신규 참여자 C에게 기존 접속자(A,B) roster를 각각 presence-update로 전달한다(건수=기존 인원)', () => {
    const reg = new RoomRegistry();
    reg.join(A, PAGE, { displayName: 'A' });
    reg.join(B, PAGE, { displayName: 'B' });
    const d = reg.join(C, PAGE, { displayName: 'C' });

    const rosterClientIds = pUpdates(d, C)
      .map((x) => x.message.clientId)
      .filter((id) => id !== C.id); // self 제외 = roster
    expect(rosterClientIds.sort()).toEqual([A.id, B.id].sort());
  });

  it('AC-6: 색상은 접속 순서대로 슬롯 할당되고 disconnect 시 슬롯이 반환되어 재사용된다', () => {
    const reg = new RoomRegistry();
    expect(selfUpdate(reg.join(A, PAGE, { displayName: 'a' }), A)!.color).toBe(EXPECTED_COLORS[0]);
    expect(selfUpdate(reg.join(B, PAGE, { displayName: 'b' }), B)!.color).toBe(EXPECTED_COLORS[1]);
    expect(selfUpdate(reg.join(C, PAGE, { displayName: 'c' }), C)!.color).toBe(EXPECTED_COLORS[2]);

    reg.leave(A); // 슬롯 0 반환
    expect(selfUpdate(reg.join(D, PAGE, { displayName: 'd' }), D)!.color).toBe(EXPECTED_COLORS[0]);
  });

  it('AC-6 확장(S4): 8슬롯이 모두 차면 9번째 접속자는 modulo로 색을 순환 재사용한다', () => {
    const reg = new RoomRegistry();
    for (let i = 0; i < EXPECTED_COLORS.length; i++) {
      const c: ClientHandle = { id: `c${i}` };
      expect(selfUpdate(reg.join(c, PAGE, { displayName: `u${i}` }), c)!.color).toBe(
        EXPECTED_COLORS[i],
      );
    }
    // 9번째(인덱스 8): 빈 슬롯 없음 → size(8) % 8 = 0 → color[0] 재사용.
    const ninth: ClientHandle = { id: 'c8' };
    expect(selfUpdate(reg.join(ninth, PAGE, { displayName: 'u8' }), ninth)!.color).toBe(
      EXPECTED_COLORS[0],
    );
  });

  it('AC-7: 빈 room 단독 접속 시 self presence-update 1건만 있고 peer broadcast/presence-leave가 없다', () => {
    const reg = new RoomRegistry();
    const d = reg.join(A, PAGE, { displayName: 'a' });

    const updates = pUpdates(d);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.target).toBe(A);
    expect(updates[0]!.message.clientId).toBe(A.id);
    expect(d.filter((x) => x.message.type === 'presence-leave')).toHaveLength(0);
    // 발신자 외 다른 대상에게 가는 dispatch가 없다.
    expect(d.every((x) => x.target === A)).toBe(true);
  });

  it('AC-3: disconnect(leave) 시 남은 peer에게 presence-leave를 broadcast하고 roomSize가 감소한다', () => {
    const reg = new RoomRegistry();
    reg.join(A, PAGE, { displayName: 'a' });
    reg.join(B, PAGE, { displayName: 'b' });
    const d = reg.leave(A);

    const leaves = d.filter((x) => x.message.type === 'presence-leave');
    expect(leaves).toHaveLength(1);
    expect(leaves[0]!.target).toBe(B);
    expect((leaves[0]!.message as PresenceLeaveMsg).clientId).toBe(A.id);
    expect(reg.roomSize(PAGE)).toBe(1);
  });

  it('AC-8: displayName 미제공/공백이면 self presence-update가 "익명 #N" 형식이다', () => {
    const reg = new RoomRegistry();
    expect(selfUpdate(reg.join(A, PAGE), A)!.displayName).toMatch(/^익명 #\d+$/);
    expect(selfUpdate(reg.join(B, PAGE, { displayName: '   ' }), B)!.displayName).toMatch(
      /^익명 #\d+$/,
    );
  });
});
