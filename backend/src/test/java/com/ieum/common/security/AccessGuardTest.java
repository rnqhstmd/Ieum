package com.ieum.common.security;

import com.ieum.page.PageRepository;
import com.ieum.workspace.Membership;
import com.ieum.workspace.MemberRole;
import com.ieum.workspace.MembershipRepository;
import com.ieum.page.Page;
import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AccessGuardTest {

    @Mock
    private MembershipRepository membershipRepository;

    @Mock
    private PageRepository pageRepository;

    @InjectMocks
    private AccessGuard guard;

    // ── AC-PERM-01: 비멤버 403 ───────────────────────────────────────────

    @Test
    @DisplayName("AC-PERM-01: 워크스페이스 멤버십 없는 userId — requireWorkspaceMember 호출 시 AccessDeniedException 발생")
    void requireWorkspaceMember_whenNoMembership_throwsAccessDeniedException() {
        // Given
        UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000001");
        UUID workspaceId = UUID.fromString("00000000-0000-0000-0000-000000000010");

        when(membershipRepository.findByUserIdAndWorkspaceId(userId, workspaceId))
                .thenReturn(Optional.empty());

        // When / Then
        assertThatThrownBy(() -> guard.requireWorkspaceMember(userId, workspaceId))
                .isInstanceOf(AccessDeniedException.class);
    }

    // ── AC-PERM-03: OWNER 통과 ────────────────────────────────────────────

    @Test
    @DisplayName("AC-PERM-03: OWNER 역할 멤버 — requireWorkspaceMember(OWNER) 호출 시 예외 없이 Membership 반환")
    void requireWorkspaceMember_withOwnerRole_whenUserIsOwner_returnsMembership() {
        // Given
        UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000001");
        UUID workspaceId = UUID.fromString("00000000-0000-0000-0000-000000000010");

        Membership membership = Membership.builder()
                .userId(userId)
                .workspaceId(workspaceId)
                .role(MemberRole.OWNER)
                .build();

        when(membershipRepository.findByUserIdAndWorkspaceId(userId, workspaceId))
                .thenReturn(Optional.of(membership));

        // When
        Membership result = guard.requireWorkspaceMember(userId, workspaceId, MemberRole.OWNER);

        // Then
        assertThat(result.getRole()).isEqualTo(MemberRole.OWNER);
    }

    @Test
    @DisplayName("AC-PERM-03: requireOwner — OWNER 역할 멤버 호출 시 예외 없이 Membership 반환")
    void requireOwner_whenUserIsOwner_returnsMembership() {
        // Given
        UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000001");
        UUID workspaceId = UUID.fromString("00000000-0000-0000-0000-000000000010");

        Membership membership = Membership.builder()
                .userId(userId)
                .workspaceId(workspaceId)
                .role(MemberRole.OWNER)
                .build();

        when(membershipRepository.findByUserIdAndWorkspaceId(userId, workspaceId))
                .thenReturn(Optional.of(membership));

        // When
        Membership result = guard.requireOwner(userId, workspaceId);

        // Then
        assertThat(result.getRole()).isEqualTo(MemberRole.OWNER);
    }

    // ── AC-PERM-04: MEMBER의 OWNER 액션 403 ──────────────────────────────

    @Test
    @DisplayName("AC-PERM-04: MEMBER 역할 유저 — requireWorkspaceMember(OWNER) 호출 시 AccessDeniedException 발생")
    void requireWorkspaceMember_withOwnerRole_whenUserIsMember_throwsAccessDeniedException() {
        // Given
        UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000002");
        UUID workspaceId = UUID.fromString("00000000-0000-0000-0000-000000000010");

        Membership membership = Membership.builder()
                .userId(userId)
                .workspaceId(workspaceId)
                .role(MemberRole.MEMBER)
                .build();

        when(membershipRepository.findByUserIdAndWorkspaceId(userId, workspaceId))
                .thenReturn(Optional.of(membership));

        // When / Then
        assertThatThrownBy(() -> guard.requireWorkspaceMember(userId, workspaceId, MemberRole.OWNER))
                .isInstanceOf(AccessDeniedException.class);
    }

    // ── AC-PERM-02: 페이지 위임 — 비멤버 403 ─────────────────────────────

    @Test
    @DisplayName("AC-PERM-02: 페이지 소속 워크스페이스 비멤버 — requirePageAccess 호출 시 AccessDeniedException 발생")
    void requirePageAccess_whenUserNotMemberOfPageWorkspace_throwsAccessDeniedException() {
        // Given
        UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000001");
        UUID pageId = UUID.fromString("00000000-0000-0000-0000-000000000020");
        UUID workspaceId = UUID.fromString("00000000-0000-0000-0000-000000000010");

        Page page = Page.builder()
                .id(pageId)
                .workspaceId(workspaceId)
                .build();

        when(pageRepository.findById(pageId))
                .thenReturn(Optional.of(page));
        when(membershipRepository.findByUserIdAndWorkspaceId(userId, workspaceId))
                .thenReturn(Optional.empty());

        // When / Then
        assertThatThrownBy(() -> guard.requirePageAccess(userId, pageId))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("AC-PERM-02: 페이지 소속 워크스페이스 멤버 — requirePageAccess 호출 시 예외 없이 Membership 반환")
    void requirePageAccess_whenUserIsMemberOfPageWorkspace_returnsMembership() {
        // Given
        UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000001");
        UUID pageId = UUID.fromString("00000000-0000-0000-0000-000000000020");
        UUID workspaceId = UUID.fromString("00000000-0000-0000-0000-000000000010");

        Page page = Page.builder()
                .id(pageId)
                .workspaceId(workspaceId)
                .build();

        Membership membership = Membership.builder()
                .userId(userId)
                .workspaceId(workspaceId)
                .role(MemberRole.MEMBER)
                .build();

        when(pageRepository.findById(pageId))
                .thenReturn(Optional.of(page));
        when(membershipRepository.findByUserIdAndWorkspaceId(userId, workspaceId))
                .thenReturn(Optional.of(membership));

        // When
        Membership result = guard.requirePageAccess(userId, pageId);

        // Then
        assertThat(result.getUserId()).isEqualTo(userId);
    }

    // ── AC-PERM-05: 페이지 404 ────────────────────────────────────────────

    @Test
    @DisplayName("AC-PERM-05: 존재하지 않는 페이지 — requirePageAccess 호출 시 EntityNotFoundException 발생")
    void requirePageAccess_whenPageNotFound_throwsEntityNotFoundException() {
        // Given
        UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000001");
        UUID pageId = UUID.fromString("00000000-0000-0000-0000-000000000099");

        when(pageRepository.findById(pageId))
                .thenReturn(Optional.empty());

        // When / Then
        assertThatThrownBy(() -> guard.requirePageAccess(userId, pageId))
                .isInstanceOf(EntityNotFoundException.class);
    }
}
