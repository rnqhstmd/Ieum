'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listMembers } from '@/src/lib/members';
import { redirectOnAuthError } from '@/src/lib/auth/redirectOnAuthError';
import type { Workspace, Membership } from '@/src/lib/types';

/** 커맨드 팔레트의 "사람 찾기" 그룹용 — SHARED 워크스페이스가 열려 있을 때만 멤버 목록을 조회한다. */
export function usePaletteMembers(input: {
  open: boolean;
  workspace: Workspace | null;
}): Membership[] {
  const { open, workspace } = input;
  const router = useRouter();
  const [members, setMembers] = useState<Membership[]>([]);

  useEffect(() => {
    let active = true;

    if (!(open && workspace?.type === 'SHARED' && workspace.id)) {
      setMembers([]);
      return () => {
        active = false;
      };
    }

    setMembers([]);
    listMembers(workspace.id)
      .then((list) => {
        if (active) setMembers(list);
      })
      .catch((e: unknown) => {
        if (!active) return;
        redirectOnAuthError(e, router);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace?.id, workspace?.type]);

  return members;
}
