package com.ieum.workspace;

import com.ieum.common.security.AccessGuard;
import com.ieum.user.UserRepository;
import com.ieum.workspace.dto.RenameWorkspaceRequest;
import com.ieum.workspace.dto.WorkspaceDto;
import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import org.mockito.ArgumentCaptor;

@ExtendWith(MockitoExtension.class)
class WorkspaceLifecycleServiceTest {

    @Mock
    private WorkspaceRepository workspaceRepository;

    @Mock
    private MembershipRepository membershipRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private AccessGuard accessGuard;

    @Mock
    private WsRelayAdminClient wsRelayAdminClient;

    @InjectMocks
    private WorkspaceService workspaceService;

    // ── renameWorkspace 성공: MEMBER가 호출 → save 호출, DTO.name() = 새 이름 ──

    @Test
    @DisplayName("rename 성공: requireWorkspaceMember 통과 + findById(ws) → save 호출, 반환 DTO.name()=새이름")
    void renameWorkspace_memberCalling_savesAndReturnsDtoWithNewName() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID memberId    = UUID.randomUUID();

        Membership memberMs = Membership.builder()
                .id(UUID.randomUUID())
                .userId(memberId)
                .workspaceId(workspaceId)
                .role(MemberRole.MEMBER)
                .joinedAt(Instant.now())
                .build();

        Workspace workspace = Workspace.builder()
                .name("기존이름")
                .type(WorkspaceType.SHARED)
                .ownerId(memberId)
                .build();

        Workspace savedWorkspace = Workspace.builder()
                .name("새이름")
                .type(WorkspaceType.SHARED)
                .ownerId(memberId)
                .build();

        when(accessGuard.requireWorkspaceMember(memberId, workspaceId)).thenReturn(memberMs);
        when(workspaceRepository.findById(workspaceId)).thenReturn(Optional.of(workspace));
        when(workspaceRepository.save(any(Workspace.class))).thenReturn(savedWorkspace);

        RenameWorkspaceRequest request = new RenameWorkspaceRequest("새이름");

        // When
        WorkspaceDto result = workspaceService.renameWorkspace(memberId, workspaceId, request);

        // Then
        assertThat(result.name()).isEqualTo("새이름");
        verify(workspaceRepository).save(any(Workspace.class));
    }

    // ── renameWorkspace request null → IllegalArgumentException(400), save 미호출 (설계 §1 null 방어, createSharedWorkspace 패턴 일관) ──

    @Test
    @DisplayName("rename request null: NPE(500)가 아니라 IllegalArgumentException(400), save 미호출")
    void renameWorkspace_nullRequest_throwsIllegalArgumentException() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID memberId    = UUID.randomUUID();

        Membership memberMs = Membership.builder()
                .id(UUID.randomUUID()).userId(memberId).workspaceId(workspaceId)
                .role(MemberRole.MEMBER).joinedAt(Instant.now()).build();
        when(accessGuard.requireWorkspaceMember(memberId, workspaceId)).thenReturn(memberMs);

        // When / Then
        assertThatThrownBy(() -> workspaceService.renameWorkspace(memberId, workspaceId, null))
                .isInstanceOf(IllegalArgumentException.class);

        verify(workspaceRepository, never()).save(any());
    }

    // ── renameWorkspace 비멤버 → AccessDeniedException 전파, save 미호출 ──

    @Test
    @DisplayName("rename 비멤버: requireWorkspaceMember가 AccessDeniedException → save 미호출")
    void renameWorkspace_nonMember_throwsAccessDeniedException_noSave() {
        // Given
        UUID workspaceId  = UUID.randomUUID();
        UUID nonMemberId  = UUID.randomUUID();

        when(accessGuard.requireWorkspaceMember(nonMemberId, workspaceId))
                .thenThrow(new AccessDeniedException("워크스페이스 멤버가 아닙니다."));

        RenameWorkspaceRequest request = new RenameWorkspaceRequest("새이름");

        // When / Then
        assertThatThrownBy(() -> workspaceService.renameWorkspace(nonMemberId, workspaceId, request))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessageContaining("멤버가 아닙니다");

        verify(workspaceRepository, never()).save(any());
    }

    // ── renameWorkspace 이름 위반(빈 문자열) → IllegalArgumentException ──

    @Test
    @DisplayName("rename 이름 위반(빈 문자열): IllegalArgumentException, save 미호출")
    void renameWorkspace_emptyName_throwsIllegalArgumentException() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID memberId    = UUID.randomUUID();

        Membership memberMs = Membership.builder()
                .id(UUID.randomUUID())
                .userId(memberId)
                .workspaceId(workspaceId)
                .role(MemberRole.MEMBER)
                .joinedAt(Instant.now())
                .build();

        when(accessGuard.requireWorkspaceMember(memberId, workspaceId)).thenReturn(memberMs);

        RenameWorkspaceRequest request = new RenameWorkspaceRequest("");

        // When / Then
        assertThatThrownBy(() -> workspaceService.renameWorkspace(memberId, workspaceId, request))
                .isInstanceOf(IllegalArgumentException.class);

        verify(workspaceRepository, never()).save(any());
    }

    // ── renameWorkspace 이름 위반(공백만) → IllegalArgumentException ──

    @Test
    @DisplayName("rename 이름 위반(공백만): IllegalArgumentException, save 미호출")
    void renameWorkspace_blankName_throwsIllegalArgumentException() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID memberId    = UUID.randomUUID();

        Membership memberMs = Membership.builder()
                .id(UUID.randomUUID())
                .userId(memberId)
                .workspaceId(workspaceId)
                .role(MemberRole.MEMBER)
                .joinedAt(Instant.now())
                .build();

        when(accessGuard.requireWorkspaceMember(memberId, workspaceId)).thenReturn(memberMs);

        RenameWorkspaceRequest request = new RenameWorkspaceRequest("   ");

        // When / Then
        assertThatThrownBy(() -> workspaceService.renameWorkspace(memberId, workspaceId, request))
                .isInstanceOf(IllegalArgumentException.class);

        verify(workspaceRepository, never()).save(any());
    }

    // ── renameWorkspace 이름 위반(101자 초과) → IllegalArgumentException ──

    @Test
    @DisplayName("rename 이름 위반(101자): IllegalArgumentException, save 미호출")
    void renameWorkspace_nameTooLong_throwsIllegalArgumentException() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID memberId    = UUID.randomUUID();

        Membership memberMs = Membership.builder()
                .id(UUID.randomUUID())
                .userId(memberId)
                .workspaceId(workspaceId)
                .role(MemberRole.MEMBER)
                .joinedAt(Instant.now())
                .build();

        when(accessGuard.requireWorkspaceMember(memberId, workspaceId)).thenReturn(memberMs);

        String tooLong = "가".repeat(101);
        RenameWorkspaceRequest request = new RenameWorkspaceRequest(tooLong);

        // When / Then
        assertThatThrownBy(() -> workspaceService.renameWorkspace(memberId, workspaceId, request))
                .isInstanceOf(IllegalArgumentException.class);

        verify(workspaceRepository, never()).save(any());
    }

    // ── deleteWorkspace 성공: SHARED 워크스페이스, 멤버 3명 → deleteById + disconnectUser×3 ──

    @Test
    @DisplayName("deleteWorkspace 성공(AC-1+AC-15): requireOwner ok, SHARED 워크스페이스, 멤버 3명 → deleteById 호출 + 각 멤버 disconnectUser 1회씩")
    void deleteWorkspace_ownerShard_deletesAndDisconnectsAllMembers() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID ownerId     = UUID.randomUUID();
        UUID member1Id   = UUID.randomUUID();
        UUID member2Id   = UUID.randomUUID();

        Workspace sharedWs = Workspace.builder()
                .name("공유워크스페이스")
                .type(WorkspaceType.SHARED)
                .ownerId(ownerId)
                .build();

        List<Membership> memberships = List.of(
                Membership.builder().id(UUID.randomUUID()).userId(ownerId).workspaceId(workspaceId).role(MemberRole.OWNER).joinedAt(Instant.now()).build(),
                Membership.builder().id(UUID.randomUUID()).userId(member1Id).workspaceId(workspaceId).role(MemberRole.MEMBER).joinedAt(Instant.now()).build(),
                Membership.builder().id(UUID.randomUUID()).userId(member2Id).workspaceId(workspaceId).role(MemberRole.MEMBER).joinedAt(Instant.now()).build()
        );

        when(accessGuard.requireOwner(ownerId, workspaceId)).thenReturn(memberships.get(0));
        when(workspaceRepository.findById(workspaceId)).thenReturn(Optional.of(sharedWs));
        when(membershipRepository.findByWorkspaceId(workspaceId)).thenReturn(memberships);

        // When
        workspaceService.deleteWorkspace(ownerId, workspaceId);

        // Then: deleteById 호출
        verify(workspaceRepository).deleteById(workspaceId);

        // Then: AC-15 — ArgumentCaptor로 disconnectUser 호출 userId 집합 검증
        ArgumentCaptor<UUID> disconnectCaptor = ArgumentCaptor.forClass(UUID.class);
        verify(wsRelayAdminClient, times(3)).disconnectUser(disconnectCaptor.capture());
        Set<UUID> disconnectedUserIds = Set.copyOf(disconnectCaptor.getAllValues());
        assertThat(disconnectedUserIds).containsExactlyInAnyOrder(ownerId, member1Id, member2Id);
    }

    // ── deleteWorkspace 403: requireOwner가 AccessDeniedException → deleteById 미호출, disconnectUser 미호출 ──

    @Test
    @DisplayName("deleteWorkspace 403(AC-3/4/5): requireOwner AccessDeniedException → deleteById/disconnectUser 미호출")
    void deleteWorkspace_requireOwnerThrows_propagatesAccessDeniedException_noDeleteNoDisconnect() {
        // Given
        UUID workspaceId  = UUID.randomUUID();
        UUID nonOwnerId   = UUID.randomUUID();

        doThrow(new AccessDeniedException("접근 거부"))
                .when(accessGuard).requireOwner(nonOwnerId, workspaceId);

        // When / Then
        assertThatThrownBy(() -> workspaceService.deleteWorkspace(nonOwnerId, workspaceId))
                .isInstanceOf(AccessDeniedException.class);

        verify(workspaceRepository, never()).deleteById(any());
        verify(wsRelayAdminClient, never()).disconnectUser(any());
    }

    // ── deleteWorkspace PERSONAL 400: IllegalArgumentException(deleteById 미호출) ──

    @Test
    @DisplayName("deleteWorkspace PERSONAL 400(AC-2): PERSONAL 워크스페이스 → IllegalArgumentException, deleteById 미호출")
    void deleteWorkspace_personalWorkspace_throwsIllegalArgumentException_noDelete() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID ownerId     = UUID.randomUUID();

        Workspace personalWs = Workspace.builder()
                .name("개인워크스페이스")
                .type(WorkspaceType.PERSONAL)
                .ownerId(ownerId)
                .build();

        when(workspaceRepository.findById(workspaceId)).thenReturn(Optional.of(personalWs));

        // When / Then: 예외 타입이 반드시 IllegalArgumentException이어야 함(IllegalStateException 아님)
        assertThatThrownBy(() -> workspaceService.deleteWorkspace(ownerId, workspaceId))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("개인 워크스페이스는 삭제할 수 없습니다");

        verify(workspaceRepository, never()).deleteById(any());
        verify(wsRelayAdminClient, never()).disconnectUser(any());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // T3: leaveWorkspace 단위 테스트 (AC-6, AC-7, AC-8, AC-9, AC-10/11, AC-16)
    // ─────────────────────────────────────────────────────────────────────────

    // ── AC-6 + AC-16: MEMBER 나가기 성공 → delete(m) + disconnectUser(userId) 각 1회 ──

    @Test
    @DisplayName("leaveWorkspace AC-6/AC-16: MEMBER가 나가기 → membershipRepository.delete(m) + disconnectUser(userId) 각 1회")
    void leaveWorkspace_member_deletesAndDisconnects() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID userId      = UUID.randomUUID();

        Membership memberMs = Membership.builder()
                .id(UUID.randomUUID())
                .userId(userId)
                .workspaceId(workspaceId)
                .role(MemberRole.MEMBER)
                .joinedAt(Instant.now())
                .build();

        Workspace sharedWs = Workspace.builder()
                .name("공유워크스페이스")
                .type(WorkspaceType.SHARED)
                .ownerId(UUID.randomUUID())
                .build();

        when(membershipRepository.findByUserIdAndWorkspaceId(userId, workspaceId))
                .thenReturn(Optional.of(memberMs));
        when(workspaceRepository.findById(workspaceId)).thenReturn(Optional.of(sharedWs));

        // When
        workspaceService.leaveWorkspace(userId, workspaceId);

        // Then
        verify(membershipRepository).delete(memberMs);
        verify(wsRelayAdminClient).disconnectUser(userId);
        // MEMBER이므로 count 조회 없어야 함
        verify(membershipRepository, never()).countByWorkspaceIdAndRole(any(), any());
    }

    // ── AC-7: OWNER 2명 중 1명 나가기 성공 → delete + disconnect, 나머지 OWNER 유지 ──

    @Test
    @DisplayName("leaveWorkspace AC-7: OWNER(2명 중 1명)가 나가기 → delete + disconnectUser 1회, count=2 체크 후 삭제")
    void leaveWorkspace_ownerWithAnotherOwner_deletesAndDisconnects() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID ownerAId    = UUID.randomUUID();

        Membership ownerAMs = Membership.builder()
                .id(UUID.randomUUID())
                .userId(ownerAId)
                .workspaceId(workspaceId)
                .role(MemberRole.OWNER)
                .joinedAt(Instant.now())
                .build();

        Workspace sharedWs = Workspace.builder()
                .name("공유워크스페이스")
                .type(WorkspaceType.SHARED)
                .ownerId(ownerAId)
                .build();

        when(membershipRepository.findByUserIdAndWorkspaceId(ownerAId, workspaceId))
                .thenReturn(Optional.of(ownerAMs));
        when(workspaceRepository.findById(workspaceId)).thenReturn(Optional.of(sharedWs));
        when(membershipRepository.countByWorkspaceIdAndRole(workspaceId, MemberRole.OWNER))
                .thenReturn(2L);

        // When
        workspaceService.leaveWorkspace(ownerAId, workspaceId);

        // Then
        verify(membershipRepository).delete(ownerAMs);
        verify(wsRelayAdminClient).disconnectUser(ownerAId);
    }

    // ── AC-8: 마지막 OWNER 나가기 시도 → IllegalArgumentException + 메시지 + delete/disconnect 미호출 ──

    @Test
    @DisplayName("leaveWorkspace AC-8: 마지막 OWNER 나가기 → IllegalArgumentException('마지막 OWNER'), delete/disconnect 미호출")
    void leaveWorkspace_lastOwner_throwsIllegalArgumentException_noDeleteNoDisconnect() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID ownerId     = UUID.randomUUID();

        Membership ownerMs = Membership.builder()
                .id(UUID.randomUUID())
                .userId(ownerId)
                .workspaceId(workspaceId)
                .role(MemberRole.OWNER)
                .joinedAt(Instant.now())
                .build();

        Workspace sharedWs = Workspace.builder()
                .name("공유워크스페이스")
                .type(WorkspaceType.SHARED)
                .ownerId(ownerId)
                .build();

        when(membershipRepository.findByUserIdAndWorkspaceId(ownerId, workspaceId))
                .thenReturn(Optional.of(ownerMs));
        when(workspaceRepository.findById(workspaceId)).thenReturn(Optional.of(sharedWs));
        when(membershipRepository.countByWorkspaceIdAndRole(workspaceId, MemberRole.OWNER))
                .thenReturn(1L);

        // When / Then
        assertThatThrownBy(() -> workspaceService.leaveWorkspace(ownerId, workspaceId))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("마지막 OWNER는 워크스페이스에서 나갈 수 없습니다");

        verify(membershipRepository, never()).delete(any());
        verify(wsRelayAdminClient, never()).disconnectUser(any());
    }

    // ── AC-9: PERSONAL 워크스페이스 나가기 시도 → IllegalArgumentException + 메시지 + delete/disconnect 미호출 ──

    @Test
    @DisplayName("leaveWorkspace AC-9: PERSONAL 워크스페이스 → IllegalArgumentException('개인 워크스페이스'), delete/disconnect 미호출")
    void leaveWorkspace_personalWorkspace_throwsIllegalArgumentException_noDeleteNoDisconnect() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID userId      = UUID.randomUUID();

        Membership memberMs = Membership.builder()
                .id(UUID.randomUUID())
                .userId(userId)
                .workspaceId(workspaceId)
                .role(MemberRole.MEMBER)
                .joinedAt(Instant.now())
                .build();

        Workspace personalWs = Workspace.builder()
                .name("개인워크스페이스")
                .type(WorkspaceType.PERSONAL)
                .ownerId(userId)
                .build();

        when(membershipRepository.findByUserIdAndWorkspaceId(userId, workspaceId))
                .thenReturn(Optional.of(memberMs));
        when(workspaceRepository.findById(workspaceId)).thenReturn(Optional.of(personalWs));

        // When / Then
        assertThatThrownBy(() -> workspaceService.leaveWorkspace(userId, workspaceId))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("개인 워크스페이스에서는 나갈 수 없습니다");

        verify(membershipRepository, never()).delete(any());
        verify(wsRelayAdminClient, never()).disconnectUser(any());
    }

    // ── AC-10/11: 비멤버(or 존재하지 않는 workspaceId) → EntityNotFoundException, 후속 로직 미호출 ──

    @Test
    @DisplayName("leaveWorkspace AC-10/11: findByUserIdAndWorkspaceId empty → EntityNotFoundException, delete/disconnect 미호출")
    void leaveWorkspace_notMember_throwsEntityNotFoundException_noSideEffects() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID userId      = UUID.randomUUID();

        when(membershipRepository.findByUserIdAndWorkspaceId(userId, workspaceId))
                .thenReturn(Optional.empty());

        // When / Then
        assertThatThrownBy(() -> workspaceService.leaveWorkspace(userId, workspaceId))
                .isInstanceOf(EntityNotFoundException.class);

        verify(workspaceRepository, never()).findById(any());
        verify(membershipRepository, never()).delete(any());
        verify(wsRelayAdminClient, never()).disconnectUser(any());
    }
}
