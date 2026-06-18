package com.ieum.common.security;

import com.ieum.page.Page;
import com.ieum.page.PageRepository;
import com.ieum.workspace.Membership;
import com.ieum.workspace.MemberRole;
import com.ieum.workspace.MembershipRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
@RequiredArgsConstructor
public class AccessGuard {

    private final MembershipRepository membershipRepository;
    private final PageRepository pageRepository;

    public Membership requireWorkspaceMember(UUID userId, UUID workspaceId) {
        return membershipRepository.findByUserIdAndWorkspaceId(userId, workspaceId)
                .orElseThrow(() -> new AccessDeniedException("워크스페이스 멤버가 아닙니다."));
    }

    public Membership requireWorkspaceMember(UUID userId, UUID workspaceId, MemberRole requiredRole) {
        Membership m = requireWorkspaceMember(userId, workspaceId);
        if (m.getRole() != requiredRole) throw new AccessDeniedException(requiredRole + " 권한이 필요합니다.");
        return m;
    }

    public Membership requireOwner(UUID userId, UUID workspaceId) {
        return requireWorkspaceMember(userId, workspaceId, MemberRole.OWNER);
    }

    public Membership requirePageAccess(UUID userId, UUID pageId) {
        Page page = pageRepository.findById(pageId)
                .orElseThrow(() -> new EntityNotFoundException("페이지를 찾을 수 없습니다."));
        return requireWorkspaceMember(userId, page.getWorkspaceId());
    }
}
