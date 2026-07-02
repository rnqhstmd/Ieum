import { describe, it, expect, vi } from 'vitest';
import { buildCommandCandidates, assembleGroups } from '../groups';
import type { PaletteItem, CommandActions } from '../groups';
import type { Workspace } from '@/src/lib/types';

// 테스트 픽스처: PERSONAL 워크스페이스
const personalWs: Workspace = {
  id: 'ws-personal-1',
  name: '개인 워크스페이스',
  type: 'PERSONAL',
  ownerId: 'user-1',
  createdAt: '2026-01-01T00:00:00Z',
};

// 테스트 픽스처: SHARED 워크스페이스
const sharedWs: Workspace = {
  id: 'ws-shared-1',
  name: '공유 워크스페이스',
  type: 'SHARED',
  ownerId: 'user-1',
  createdAt: '2026-01-01T00:00:00Z',
};

// 모든 액션을 spy로 채운 CommandActions 생성 헬퍼
function fullActions(): Required<CommandActions> {
  return {
    onCreatePage: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenHelp: vi.fn(),
    onToggleTheme: vi.fn(),
    onOpenMembers: vi.fn(),
    onLogout: vi.fn(),
  };
}

describe('buildCommandCandidates', () => {
  it('AC-A1: PERSONAL + 모든 액션 제공 → 5개 후보, 멤버 관리 열기 없음, 고정 순서(BR-A1)', () => {
    const actions = fullActions();
    const candidates = buildCommandCandidates(personalWs, actions);

    expect(candidates.map((c) => c.title)).toEqual([
      '새 페이지 만들기',
      '설정 열기',
      '도움말 열기',
      '테마 전환',
      '로그아웃',
    ]);
    expect(candidates.some((c) => c.title === '멤버 관리 열기')).toBe(false);
  });

  it('AC-A2: SHARED + 모든 액션 제공 → 6개 후보, 멤버 관리 열기 포함, 고정 순서(BR-A1)', () => {
    const actions = fullActions();
    const candidates = buildCommandCandidates(sharedWs, actions);

    expect(candidates.map((c) => c.title)).toEqual([
      '새 페이지 만들기',
      '설정 열기',
      '도움말 열기',
      '테마 전환',
      '멤버 관리 열기',
      '로그아웃',
    ]);
  });

  it('AC-A22: workspace=null + 모든 액션 → 새 페이지 만들기·멤버 관리 열기 없음, 나머지 4개', () => {
    const actions = fullActions();
    const candidates = buildCommandCandidates(null, actions);

    expect(candidates.map((c) => c.title)).toEqual([
      '설정 열기',
      '도움말 열기',
      '테마 전환',
      '로그아웃',
    ]);
  });

  it('BR-A1 보강: onCreatePage 미제공 시 SHARED에서도 새 페이지 만들기 제외', () => {
    const actions = fullActions();
    delete (actions as CommandActions).onCreatePage;
    const candidates = buildCommandCandidates(sharedWs, actions);

    expect(candidates.some((c) => c.title === '새 페이지 만들기')).toBe(false);
    expect(candidates.map((c) => c.title)).toEqual([
      '설정 열기',
      '도움말 열기',
      '테마 전환',
      '멤버 관리 열기',
      '로그아웃',
    ]);
  });

  it('BR-A1 보강: onOpenMembers 미제공 시 SHARED여도 멤버 관리 열기 제외', () => {
    const actions = fullActions();
    delete (actions as CommandActions).onOpenMembers;
    const candidates = buildCommandCandidates(sharedWs, actions);

    expect(candidates.some((c) => c.title === '멤버 관리 열기')).toBe(false);
  });

  it('run()이 대응하는 액션 콜백을 정확히 호출한다(설정 열기 예시)', () => {
    const actions = fullActions();
    const candidates = buildCommandCandidates(sharedWs, actions);

    const settingsCandidate = candidates.find((c) => c.title === '설정 열기');
    expect(settingsCandidate).toBeDefined();

    settingsCandidate!.run();

    expect(actions.onOpenSettings).toHaveBeenCalledTimes(1);
    expect(actions.onOpenMembers).not.toHaveBeenCalled();
    expect(actions.onLogout).not.toHaveBeenCalled();
  });

  it('run()이 대응하는 액션 콜백을 정확히 호출한다(멤버 관리 열기 예시)', () => {
    const actions = fullActions();
    const candidates = buildCommandCandidates(sharedWs, actions);

    const membersCandidate = candidates.find((c) => c.title === '멤버 관리 열기');
    expect(membersCandidate).toBeDefined();

    membersCandidate!.run();

    expect(actions.onOpenMembers).toHaveBeenCalledTimes(1);
    expect(actions.onOpenSettings).not.toHaveBeenCalled();
  });
});

describe('assembleGroups', () => {
  function makeItem(id: string, title: string, search: string): PaletteItem {
    return { id, title, search, onSelect: vi.fn() };
  }

  it('AC-A10: 두 그룹(페이지·명령)에 동일 query 적용 시 양쪽 다 필터된다', () => {
    const raw = [
      {
        label: '페이지',
        items: [
          makeItem('p1', '설정 페이지', '설정 페이지'),
          makeItem('p2', '회의록', '회의록'),
        ],
      },
      {
        label: '명령 실행',
        items: [
          makeItem('c1', '설정 열기', '설정 열기'),
          makeItem('c2', '로그아웃', '로그아웃'),
        ],
      },
    ];

    const { groups } = assembleGroups(raw, '설정');

    expect(groups).toHaveLength(2);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['p1']);
    expect(groups[1]!.items.map((i) => i.id)).toEqual(['c1']);
  });

  it('AC-A11/A16: flat 순서가 입력 그룹 순서(페이지→사람→명령)를 따른다(그룹 경계 무시)', () => {
    const raw = [
      {
        label: '페이지',
        items: [makeItem('page-1', '회의록', '회의록')],
      },
      {
        label: '사람',
        items: [makeItem('person-1', '홍길동', '홍길동 hong@ex.com')],
      },
      {
        label: '명령 실행',
        items: [makeItem('cmd-1', '설정 열기', '설정 열기')],
      },
    ];

    const { flat } = assembleGroups(raw, '');

    expect(flat.map((i) => i.id)).toEqual(['page-1', 'person-1', 'cmd-1']);
  });

  it('AC-A14: 필터 후 items가 0개인 그룹은 groups 결과에서 제외된다', () => {
    const raw = [
      {
        label: '페이지',
        items: [makeItem('p1', '회의록', '회의록')],
      },
      {
        label: '사람',
        items: [makeItem('person-1', '홍길동', '홍길동 hong@ex.com')],
      },
      {
        label: '명령 실행',
        items: [makeItem('c1', '설정 열기', '설정 열기')],
      },
    ];

    // '길동'은 사람 그룹에만 일치
    const { groups } = assembleGroups(raw, '길동');

    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe('사람');
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['person-1']);
  });

  it('AC-A15: 모든 그룹이 무매칭이면 groups=[], flat=[]', () => {
    const raw = [
      { label: '페이지', items: [makeItem('p1', '회의록', '회의록')] },
      { label: '사람', items: [makeItem('person-1', '홍길동', '홍길동 hong@ex.com')] },
      { label: '명령 실행', items: [makeItem('c1', '설정 열기', '설정 열기')] },
    ];

    const { groups, flat } = assembleGroups(raw, '존재하지않는검색어zzz');

    expect(groups).toEqual([]);
    expect(flat).toEqual([]);
  });

  it('필터는 대소문자를 무시한 부분일치(query 대문자 입력에도 매칭)', () => {
    const raw = [
      {
        label: '사람',
        items: [makeItem('person-1', '김철수', '김철수 kim@ex.com')],
      },
    ];

    const { flat } = assembleGroups(raw, 'KIM@');

    expect(flat.map((i) => i.id)).toEqual(['person-1']);
  });

  it('query가 빈 문자열이면 모든 항목이 그대로 유지된다', () => {
    const raw = [
      {
        label: '페이지',
        items: [makeItem('p1', 'A', 'a'), makeItem('p2', 'B', 'b')],
      },
    ];

    const { groups, flat } = assembleGroups(raw, '');

    expect(groups).toHaveLength(1);
    expect(flat.map((i) => i.id)).toEqual(['p1', 'p2']);
  });
});
