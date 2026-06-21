// ─── WS-AUTH 멤버십 인가 포트 (MembershipStore) ──────────────────
// WS join 시 (userId, pageId) 멤버십을 판정한다. OpStore와 동형으로 격리 —
// InMemoryMembershipStore는 테스트 fake, PgMembershipStore는 실 DB(pages⋈memberships).

export interface MembershipStore {
  /** userId가 pageId가 속한 워크스페이스의 멤버인가. */
  isMember(userId: string, pageId: string): Promise<boolean>;
  close?(): Promise<void>;
}

/** 인메모리 fake — 허용한 (userId,pageId) 쌍만 멤버. */
export class InMemoryMembershipStore implements MembershipStore {
  private readonly members = new Set<string>();

  allow(userId: string, pageId: string): void {
    this.members.add(`${userId}|${pageId}`);
  }

  async isMember(userId: string, pageId: string): Promise<boolean> {
    return this.members.has(`${userId}|${pageId}`);
  }
}
