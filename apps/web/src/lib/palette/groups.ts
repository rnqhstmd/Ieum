// 커맨드 팔레트 그룹/후보 조립 — 순수 모듈(렌더/부수효과 없음)
import type { Workspace } from '@/src/lib/types';

export interface PaletteItem {
  id: string;
  icon?: string;
  title: string;
  meta?: string;
  search: string;
  onSelect: () => void;
}

export interface CommandActions {
  onCreatePage?: () => void;
  onOpenSettings?: () => void;
  onOpenHelp?: () => void;
  onToggleTheme?: () => void;
  onOpenMembers?: () => void;
  onLogout?: () => void;
}

export interface CommandCandidate {
  id: string;
  icon?: string;
  title: string;
  run: () => void;
}

/** 커맨드 후보 1건의 선언적 스펙 — 표시 조건과 액션 키만 명시하면 buildCommandCandidates가 조립한다 */
interface CommandCandidateSpec {
  id: string;
  icon: string;
  title: string;
  /** actions에서 실행할 콜백의 키 (존재해야 후보로 노출됨) */
  actionKey: keyof CommandActions;
  /** 액션 존재 여부 외 추가로 필요한 표시 조건(없으면 항상 통과) */
  extraVisible?: (workspace: Workspace | null) => boolean;
}

/** 고정 노출 순서(BR-A1)를 그대로 표현하는 스펙 목록 */
const COMMAND_CANDIDATE_SPECS: CommandCandidateSpec[] = [
  { id: 'cmd-new-page', icon: '➕', title: '새 페이지 만들기', actionKey: 'onCreatePage', extraVisible: (ws) => Boolean(ws) },
  { id: 'cmd-settings', icon: '⚙️', title: '설정 열기', actionKey: 'onOpenSettings' },
  { id: 'cmd-help', icon: '❓', title: '도움말 열기', actionKey: 'onOpenHelp' },
  { id: 'cmd-theme', icon: '🌓', title: '테마 전환', actionKey: 'onToggleTheme' },
  { id: 'cmd-members', icon: '👥', title: '멤버 관리 열기', actionKey: 'onOpenMembers', extraVisible: (ws) => ws?.type === 'SHARED' },
  { id: 'cmd-logout', icon: '↩', title: '로그아웃', actionKey: 'onLogout' },
];

/** 워크스페이스/액션 제공 여부에 따라 고정 순서로 커맨드 후보를 구성한다 */
export function buildCommandCandidates(
  workspace: Workspace | null,
  actions: CommandActions
): CommandCandidate[] {
  const candidates: CommandCandidate[] = [];

  for (const spec of COMMAND_CANDIDATE_SPECS) {
    const action = actions[spec.actionKey];
    if (!action) continue;
    if (spec.extraVisible && !spec.extraVisible(workspace)) continue;
    candidates.push({ id: spec.id, icon: spec.icon, title: spec.title, run: () => action() });
  }

  return candidates;
}

/** query로 각 그룹의 items를 필터링하고, 빈 그룹은 제외한 groups와 flat 목록을 반환한다 */
export function assembleGroups(
  rawGroups: { label: string; items: PaletteItem[] }[],
  query: string
): { groups: { label: string; items: PaletteItem[] }[]; flat: PaletteItem[] } {
  const lowerQuery = query.toLowerCase();

  const filtered = rawGroups
    .map((group) => ({
      label: group.label,
      items: group.items.filter((item) => item.search.toLowerCase().includes(lowerQuery)),
    }))
    .filter((group) => group.items.length > 0);

  const flat = filtered.flatMap((group) => group.items);

  return { groups: filtered, flat };
}
