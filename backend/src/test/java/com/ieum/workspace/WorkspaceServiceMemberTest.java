package com.ieum.workspace;

import com.ieum.common.security.AccessGuard;
import com.ieum.user.User;
import com.ieum.user.UserRepository;
import com.ieum.workspace.dto.MembershipDto;
import com.ieum.workspace.dto.UpdateMemberRoleRequest;
import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import static org.assertj.core.api.Assertions.assertThatCode;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WorkspaceServiceMemberTest {

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

    // ── AC-1/AC-2: OWNER·MEMBER 모두 멤버 목록 2건 조회 ─────────────────

    @Test
    @DisplayName("AC-1: OWNER가 listMembers 호출 → MembershipDto 2개, userId·role 정확히 반환")
    void listMembers_ownerCalling_returnsTwoMembershipDtos() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID ownerId     = UUID.randomUUID();
        UUID memberId    = UUID.randomUUID();

        Membership ownerMs = Membership.builder()
                .id(UUID.randomUUID())
                .userId(ownerId)
                .workspaceId(workspaceId)
                .role(MemberRole.OWNER)
                .joinedAt(Instant.now())
                .build();
        Membership memberMs = Membership.builder()
                .id(UUID.randomUUID())
                .userId(memberId)
                .workspaceId(workspaceId)
                .role(MemberRole.MEMBER)
                .joinedAt(Instant.now())
                .build();

        User ownerUser = User.builder()
                .id(ownerId).email("owner@test.com").name("OWNER유저").build();
        User memberUser = User.builder()
                .id(memberId).email("member@test.com").name("MEMBER유저").build();

        when(accessGuard.requireWorkspaceMember(ownerId, workspaceId))
                .thenReturn(ownerMs);
        when(membershipRepository.findByWorkspaceId(workspaceId))
                .thenReturn(List.of(ownerMs, memberMs));
        when(userRepository.findAllById(List.of(ownerId, memberId)))
                .thenReturn(List.of(ownerUser, memberUser));

        // When
        List<MembershipDto> result = workspaceService.listMembers(ownerId, workspaceId);

        // Then
        assertThat(result).hasSize(2);
        assertThat(result).extracting(MembershipDto::userId)
                .containsExactlyInAnyOrder(ownerId, memberId);
        assertThat(result).extracting(MembershipDto::role)
                .containsExactlyInAnyOrder(MemberRole.OWNER, MemberRole.MEMBER);
    }

    @Test
    @DisplayName("AC-2: MEMBER가 listMembers 호출 → MembershipDto 2개 반환")
    void listMembers_memberCalling_returnsTwoMembershipDtos() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID ownerId     = UUID.randomUUID();
        UUID memberId    = UUID.randomUUID();

        Membership memberMs = Membership.builder()
                .id(UUID.randomUUID())
                .userId(memberId)
                .workspaceId(workspaceId)
                .role(MemberRole.MEMBER)
                .joinedAt(Instant.now())
                .build();
        Membership ownerMs = Membership.builder()
                .id(UUID.randomUUID())
                .userId(ownerId)
                .workspaceId(workspaceId)
                .role(MemberRole.OWNER)
                .joinedAt(Instant.now())
                .build();

        User ownerUser = User.builder()
                .id(ownerId).email("owner@test.com").name("OWNER유저").build();
        User memberUser = User.builder()
                .id(memberId).email("member@test.com").name("MEMBER유저").build();

        when(accessGuard.requireWorkspaceMember(memberId, workspaceId))
                .thenReturn(memberMs);
        when(membershipRepository.findByWorkspaceId(workspaceId))
                .thenReturn(List.of(ownerMs, memberMs));
        when(userRepository.findAllById(List.of(ownerId, memberId)))
                .thenReturn(List.of(ownerUser, memberUser));

        // When
        List<MembershipDto> result = workspaceService.listMembers(memberId, workspaceId);

        // Then
        assertThat(result).hasSize(2);
    }

    // ── AC-3: 비멤버 → AccessDeniedException 전파 ──────────────────────

    @Test
    @DisplayName("AC-3: 비멤버가 listMembers 호출 → AccessDeniedException 전파")
    void listMembers_nonMember_throwsAccessDeniedException() {
        // Given
        UUID workspaceId  = UUID.randomUUID();
        UUID nonMemberId  = UUID.randomUUID();

        when(accessGuard.requireWorkspaceMember(nonMemberId, workspaceId))
                .thenThrow(new AccessDeniedException("워크스페이스 멤버가 아닙니다."));

        // When / Then
        assertThatThrownBy(() -> workspaceService.listMembers(nonMemberId, workspaceId))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessageContaining("멤버가 아닙니다");

        // membershipRepository는 호출되지 않아야 함
        verify(membershipRepository, never()).findByWorkspaceId(any());
    }

    // ══════════════════════════════════════════════════════════════════
    // updateMemberRole 단위 테스트 (T3)
    // ══════════════════════════════════════════════════════════════════

    // ── AC-4: OWNER가 MEMBER를 OWNER로 승격 → 200, 응답 role=OWNER ────

    @Test
    @DisplayName("AC-4: OWNER가 MEMBER를 OWNER로 승격 → MembershipDto.role=OWNER, save 호출")
    void updateMemberRole_promoteToOwner_returnsDtoWithOwnerRole() {
        // Given
        UUID workspaceId  = UUID.randomUUID();
        UUID ownerId      = UUID.randomUUID();
        UUID targetId     = UUID.randomUUID();

        Membership ownerMs = Membership.builder()
                .id(UUID.randomUUID()).userId(ownerId)
                .workspaceId(workspaceId).role(MemberRole.OWNER).joinedAt(Instant.now()).build();
        Membership targetMs = Membership.builder()
                .id(UUID.randomUUID()).userId(targetId)
                .workspaceId(workspaceId).role(MemberRole.MEMBER).joinedAt(Instant.now()).build();

        User targetUser = User.builder()
                .id(targetId).email("target@test.com").name("대상유저").build();

        when(accessGuard.requireOwner(ownerId, workspaceId)).thenReturn(ownerMs);
        when(membershipRepository.findByUserIdAndWorkspaceId(targetId, workspaceId))
                .thenReturn(Optional.of(targetMs));
        // 승격(MEMBER→OWNER) 시 count 조회는 호출되지 않아야 함(BR-1 미발동)
        when(membershipRepository.save(any(Membership.class))).thenReturn(targetMs);
        when(userRepository.findAllById(anyList()))
                .thenReturn(List.of(targetUser));

        UpdateMemberRoleRequest request = new UpdateMemberRoleRequest(MemberRole.OWNER);

        // When
        MembershipDto result = workspaceService.updateMemberRole(ownerId, workspaceId, targetId, request);

        // Then
        assertThat(result.role()).isEqualTo(MemberRole.OWNER);
        assertThat(result.userId()).isEqualTo(targetId);
        verify(membershipRepository).save(any(Membership.class));
        // 승격 시에는 countByWorkspaceIdAndRole 호출 없어야 함
        verify(membershipRepository, never()).countByWorkspaceIdAndRole(any(), any());
    }

    // ── AC-5: OWNER 2명, 현재 OWNER가 자기 자신 MEMBER로 강등 → 허용 ─

    @Test
    @DisplayName("AC-5: OWNER 2명 중 OWNER A가 자기 자신을 MEMBER로 강등 → count=2이므로 허용")
    void updateMemberRole_selfDemote_twoOwners_allowed() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID ownerAId    = UUID.randomUUID();

        Membership ownerAMs = Membership.builder()
                .id(UUID.randomUUID()).userId(ownerAId)
                .workspaceId(workspaceId).role(MemberRole.OWNER).joinedAt(Instant.now()).build();

        User ownerAUser = User.builder()
                .id(ownerAId).email("ownerA@test.com").name("OWNER-A").build();

        when(accessGuard.requireOwner(ownerAId, workspaceId)).thenReturn(ownerAMs);
        when(membershipRepository.findByUserIdAndWorkspaceId(ownerAId, workspaceId))
                .thenReturn(Optional.of(ownerAMs));
        // count=2 이므로 BR-1 미발동
        when(membershipRepository.countByWorkspaceIdAndRole(workspaceId, MemberRole.OWNER))
                .thenReturn(2L);
        when(membershipRepository.save(any(Membership.class))).thenReturn(ownerAMs);
        when(userRepository.findAllById(anyList()))
                .thenReturn(List.of(ownerAUser));

        UpdateMemberRoleRequest request = new UpdateMemberRoleRequest(MemberRole.MEMBER);

        // When
        MembershipDto result = workspaceService.updateMemberRole(ownerAId, workspaceId, ownerAId, request);

        // Then
        assertThat(result.role()).isEqualTo(MemberRole.MEMBER);
        verify(membershipRepository).save(any(Membership.class));
    }

    // ── AC-6: OWNER 2명, OWNER A가 OWNER B를 MEMBER로 강등 → 허용 ───

    @Test
    @DisplayName("AC-6: OWNER 2명 중 A가 B를 MEMBER로 강등 → count=2이므로 허용")
    void updateMemberRole_demoteOtherOwner_twoOwners_allowed() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID ownerAId    = UUID.randomUUID();
        UUID ownerBId    = UUID.randomUUID();

        Membership ownerAMs = Membership.builder()
                .id(UUID.randomUUID()).userId(ownerAId)
                .workspaceId(workspaceId).role(MemberRole.OWNER).joinedAt(Instant.now()).build();
        Membership ownerBMs = Membership.builder()
                .id(UUID.randomUUID()).userId(ownerBId)
                .workspaceId(workspaceId).role(MemberRole.OWNER).joinedAt(Instant.now()).build();

        User ownerBUser = User.builder()
                .id(ownerBId).email("ownerB@test.com").name("OWNER-B").build();

        when(accessGuard.requireOwner(ownerAId, workspaceId)).thenReturn(ownerAMs);
        when(membershipRepository.findByUserIdAndWorkspaceId(ownerBId, workspaceId))
                .thenReturn(Optional.of(ownerBMs));
        when(membershipRepository.countByWorkspaceIdAndRole(workspaceId, MemberRole.OWNER))
                .thenReturn(2L);
        when(membershipRepository.save(any(Membership.class))).thenReturn(ownerBMs);
        when(userRepository.findAllById(anyList()))
                .thenReturn(List.of(ownerBUser));

        UpdateMemberRoleRequest request = new UpdateMemberRoleRequest(MemberRole.MEMBER);

        // When
        MembershipDto result = workspaceService.updateMemberRole(ownerAId, workspaceId, ownerBId, request);

        // Then
        assertThat(result.role()).isEqualTo(MemberRole.MEMBER);
        verify(membershipRepository).save(any(Membership.class));
    }

    // ── AC-7: OWNER 1명이 자기 자신을 MEMBER로 강등 → BR-1 차단 400 ─

    @Test
    @DisplayName("AC-7: OWNER 1명이 자기를 MEMBER로 강등 시도 → IllegalArgumentException(BR-1), save 미호출")
    void updateMemberRole_lastOwnerDemote_throwsIllegalArgument() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID ownerId     = UUID.randomUUID();

        Membership ownerMs = Membership.builder()
                .id(UUID.randomUUID()).userId(ownerId)
                .workspaceId(workspaceId).role(MemberRole.OWNER).joinedAt(Instant.now()).build();

        when(accessGuard.requireOwner(ownerId, workspaceId)).thenReturn(ownerMs);
        when(membershipRepository.findByUserIdAndWorkspaceId(ownerId, workspaceId))
                .thenReturn(Optional.of(ownerMs));
        when(membershipRepository.countByWorkspaceIdAndRole(workspaceId, MemberRole.OWNER))
                .thenReturn(1L);

        UpdateMemberRoleRequest request = new UpdateMemberRoleRequest(MemberRole.MEMBER);

        // When / Then
        assertThatThrownBy(() -> workspaceService.updateMemberRole(ownerId, workspaceId, ownerId, request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("마지막 OWNER의 역할을 변경할 수 없습니다");

        // save는 절대 호출되지 않아야 함
        verify(membershipRepository, never()).save(any());
    }

    // ── AC-8: 존재하지 않는 대상 → EntityNotFoundException(404) ───────

    @Test
    @DisplayName("AC-8: 존재하지 않는 대상 userId → EntityNotFoundException")
    void updateMemberRole_targetNotFound_throwsEntityNotFoundException() {
        // Given
        UUID workspaceId    = UUID.randomUUID();
        UUID ownerId        = UUID.randomUUID();
        UUID nonExistTarget = UUID.randomUUID();

        Membership ownerMs = Membership.builder()
                .id(UUID.randomUUID()).userId(ownerId)
                .workspaceId(workspaceId).role(MemberRole.OWNER).joinedAt(Instant.now()).build();

        when(accessGuard.requireOwner(ownerId, workspaceId)).thenReturn(ownerMs);
        when(membershipRepository.findByUserIdAndWorkspaceId(nonExistTarget, workspaceId))
                .thenReturn(Optional.empty());

        UpdateMemberRoleRequest request = new UpdateMemberRoleRequest(MemberRole.MEMBER);

        // When / Then
        assertThatThrownBy(() ->
                workspaceService.updateMemberRole(ownerId, workspaceId, nonExistTarget, request))
                .isInstanceOf(EntityNotFoundException.class);

        verify(membershipRepository, never()).save(any());
    }

    // ── AC-17: MEMBER가 역할 변경 시도 → AccessDeniedException(403) ──

    @Test
    @DisplayName("AC-17: MEMBER가 역할 변경 시도 → requireOwner가 AccessDeniedException 전파")
    void updateMemberRole_callerIsMember_throwsAccessDeniedException() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID memberId    = UUID.randomUUID();
        UUID targetId    = UUID.randomUUID();

        doThrow(new AccessDeniedException("OWNER 권한이 필요합니다."))
                .when(accessGuard).requireOwner(memberId, workspaceId);

        UpdateMemberRoleRequest request = new UpdateMemberRoleRequest(MemberRole.OWNER);

        // When / Then
        assertThatThrownBy(() ->
                workspaceService.updateMemberRole(memberId, workspaceId, targetId, request))
                .isInstanceOf(AccessDeniedException.class);

        verify(membershipRepository, never()).findByUserIdAndWorkspaceId(any(), any());
        verify(membershipRepository, never()).save(any());
    }

    // ── AC-19: 비멤버가 역할 변경 시도 → AccessDeniedException(403) ──

    @Test
    @DisplayName("AC-19: 비멤버가 역할 변경 시도 → requireOwner가 AccessDeniedException 전파")
    void updateMemberRole_callerIsNonMember_throwsAccessDeniedException() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID nonMemberId = UUID.randomUUID();
        UUID targetId    = UUID.randomUUID();

        doThrow(new AccessDeniedException("워크스페이스 멤버가 아닙니다."))
                .when(accessGuard).requireOwner(nonMemberId, workspaceId);

        UpdateMemberRoleRequest request = new UpdateMemberRoleRequest(MemberRole.MEMBER);

        // When / Then
        assertThatThrownBy(() ->
                workspaceService.updateMemberRole(nonMemberId, workspaceId, targetId, request))
                .isInstanceOf(AccessDeniedException.class);

        verify(membershipRepository, never()).findByUserIdAndWorkspaceId(any(), any());
        verify(membershipRepository, never()).save(any());
    }

    // ══════════════════════════════════════════════════════════════════
    // removeMember 단위 테스트 (T4)
    // ══════════════════════════════════════════════════════════════════

    // ── AC-9: OWNER A가 MEMBER B 제거 → delete 호출 + disconnectUser 호출 ─

    @Test
    @DisplayName("AC-9: OWNER A가 MEMBER B 제거 → membershipRepository.delete 호출, disconnectUser 호출")
    void removeMember_ownerRemovesMember_deletesAndDisconnects() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID ownerId     = UUID.randomUUID();
        UUID memberId    = UUID.randomUUID();

        Membership ownerMs = Membership.builder()
                .id(UUID.randomUUID()).userId(ownerId)
                .workspaceId(workspaceId).role(MemberRole.OWNER).joinedAt(Instant.now()).build();
        Membership memberMs = Membership.builder()
                .id(UUID.randomUUID()).userId(memberId)
                .workspaceId(workspaceId).role(MemberRole.MEMBER).joinedAt(Instant.now()).build();

        when(accessGuard.requireOwner(ownerId, workspaceId)).thenReturn(ownerMs);
        when(membershipRepository.findByUserIdAndWorkspaceId(memberId, workspaceId))
                .thenReturn(Optional.of(memberMs));

        // When
        workspaceService.removeMember(ownerId, workspaceId, memberId);

        // Then
        verify(membershipRepository).delete(memberMs);
        verify(wsRelayAdminClient).disconnectUser(memberId);
    }

    // ── AC-10: OWNER A가 자기 자신 제거 시도 → BR-3 → 400, delete 미호출 ─

    @Test
    @DisplayName("AC-10: OWNER A가 자기 자신 제거 시도 → IllegalArgumentException('자기 자신을 제거할 수 없습니다'), delete 미호출")
    void removeMember_selfRemoval_throwsIllegalArgument_noDelete() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID ownerId     = UUID.randomUUID();

        Membership ownerMs = Membership.builder()
                .id(UUID.randomUUID()).userId(ownerId)
                .workspaceId(workspaceId).role(MemberRole.OWNER).joinedAt(Instant.now()).build();

        when(accessGuard.requireOwner(ownerId, workspaceId)).thenReturn(ownerMs);

        // When / Then
        assertThatThrownBy(() -> workspaceService.removeMember(ownerId, workspaceId, ownerId))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("자기 자신을 제거할 수 없습니다");

        verify(membershipRepository, never()).delete(any());
        verify(wsRelayAdminClient, never()).disconnectUser(any());
    }

    // ── AC-12: OWNER A·OWNER B에서 A가 B 제거 → 204 정상, B delete 호출 ─

    @Test
    @DisplayName("AC-12: OWNER 2명 중 A가 B 제거 → delete 호출(BR-2 미발동), disconnectUser 호출")
    void removeMember_twoOwners_ownerRemovesOtherOwner_deletesSuccessfully() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID ownerAId    = UUID.randomUUID();
        UUID ownerBId    = UUID.randomUUID();

        Membership ownerAMs = Membership.builder()
                .id(UUID.randomUUID()).userId(ownerAId)
                .workspaceId(workspaceId).role(MemberRole.OWNER).joinedAt(Instant.now()).build();
        Membership ownerBMs = Membership.builder()
                .id(UUID.randomUUID()).userId(ownerBId)
                .workspaceId(workspaceId).role(MemberRole.OWNER).joinedAt(Instant.now()).build();

        when(accessGuard.requireOwner(ownerAId, workspaceId)).thenReturn(ownerAMs);
        when(membershipRepository.findByUserIdAndWorkspaceId(ownerBId, workspaceId))
                .thenReturn(Optional.of(ownerBMs));
        // BR-2 가드: OWNER 대상이므로 count 조회 발생 — 2명이므로 가드 통과
        when(membershipRepository.countByWorkspaceIdAndRole(workspaceId, MemberRole.OWNER))
                .thenReturn(2L);

        // When
        workspaceService.removeMember(ownerAId, workspaceId, ownerBId);

        // Then
        verify(membershipRepository).delete(ownerBMs);
        verify(wsRelayAdminClient).disconnectUser(ownerBId);
    }

    // ── AC-13: 비멤버 대상 제거 → EntityNotFoundException(404) ──────────

    @Test
    @DisplayName("AC-13: 존재하지 않는 targetUserId 제거 시도 → EntityNotFoundException, delete 미호출")
    void removeMember_targetNotFound_throwsEntityNotFoundException() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID ownerId     = UUID.randomUUID();
        UUID ghostId     = UUID.randomUUID();

        Membership ownerMs = Membership.builder()
                .id(UUID.randomUUID()).userId(ownerId)
                .workspaceId(workspaceId).role(MemberRole.OWNER).joinedAt(Instant.now()).build();

        when(accessGuard.requireOwner(ownerId, workspaceId)).thenReturn(ownerMs);
        when(membershipRepository.findByUserIdAndWorkspaceId(ghostId, workspaceId))
                .thenReturn(Optional.empty());

        // When / Then
        assertThatThrownBy(() -> workspaceService.removeMember(ownerId, workspaceId, ghostId))
                .isInstanceOf(EntityNotFoundException.class);

        verify(membershipRepository, never()).delete(any());
        verify(wsRelayAdminClient, never()).disconnectUser(any());
    }

    // ── AC-18: MEMBER B가 C 제거 시도 → requireOwner → AccessDeniedException(403) ─

    @Test
    @DisplayName("AC-18: MEMBER가 타 멤버 제거 시도 → requireOwner가 AccessDeniedException 전파")
    void removeMember_callerIsMember_throwsAccessDeniedException() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID memberId    = UUID.randomUUID();
        UUID targetId    = UUID.randomUUID();

        doThrow(new AccessDeniedException("OWNER 권한이 필요합니다."))
                .when(accessGuard).requireOwner(memberId, workspaceId);

        // When / Then
        assertThatThrownBy(() -> workspaceService.removeMember(memberId, workspaceId, targetId))
                .isInstanceOf(AccessDeniedException.class);

        verify(membershipRepository, never()).findByUserIdAndWorkspaceId(any(), any());
        verify(membershipRepository, never()).delete(any());
    }

    // ── AC-14: disconnectUser(targetUserId) 직접 호출 검증 ──────────────

    @Test
    @DisplayName("AC-14: 멤버 제거 성공 시 wsRelayAdminClient.disconnectUser(targetUserId) 호출됨")
    void removeMember_afterDelete_callsDisconnectUser() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID ownerId     = UUID.randomUUID();
        UUID targetId    = UUID.randomUUID();

        Membership ownerMs = Membership.builder()
                .id(UUID.randomUUID()).userId(ownerId)
                .workspaceId(workspaceId).role(MemberRole.OWNER).joinedAt(Instant.now()).build();
        Membership targetMs = Membership.builder()
                .id(UUID.randomUUID()).userId(targetId)
                .workspaceId(workspaceId).role(MemberRole.MEMBER).joinedAt(Instant.now()).build();

        when(accessGuard.requireOwner(ownerId, workspaceId)).thenReturn(ownerMs);
        when(membershipRepository.findByUserIdAndWorkspaceId(targetId, workspaceId))
                .thenReturn(Optional.of(targetMs));

        // When
        workspaceService.removeMember(ownerId, workspaceId, targetId);

        // Then: disconnectUser는 정확히 targetId로 1회 호출되어야 함
        verify(wsRelayAdminClient).disconnectUser(targetId);
    }

    // ── BR-2: 마지막 OWNER(count=1) 제거 시도 → IllegalArgumentException, delete/disconnect 미호출 ─

    @Test
    @DisplayName("BR-2: 마지막 OWNER(count=1) 제거 시도 → IllegalArgumentException, delete/disconnect 미호출")
    void removeMember_lastOwner_throwsIllegalArgument_noDeleteNoDisconnect() {
        // Given
        UUID workspaceId   = UUID.randomUUID();
        UUID currentUserId = UUID.randomUUID();
        UUID targetUserId  = UUID.randomUUID(); // 다른 사람(자기 자신 아님)

        Membership callerMs = Membership.builder()
                .id(UUID.randomUUID()).userId(currentUserId)
                .workspaceId(workspaceId).role(MemberRole.OWNER).joinedAt(Instant.now()).build();
        Membership targetMs = Membership.builder()
                .id(UUID.randomUUID()).userId(targetUserId)
                .workspaceId(workspaceId).role(MemberRole.OWNER).joinedAt(Instant.now()).build();

        // requireOwner 통과(정상 반환)
        when(accessGuard.requireOwner(currentUserId, workspaceId)).thenReturn(callerMs);
        // currentUserId != targetUserId → BR-3 자기제거 미발동
        // 대상 멤버십: role = OWNER
        when(membershipRepository.findByUserIdAndWorkspaceId(targetUserId, workspaceId))
                .thenReturn(Optional.of(targetMs));
        // OWNER 수 = 1 → BR-2 발동 조건
        when(membershipRepository.countByWorkspaceIdAndRole(workspaceId, MemberRole.OWNER))
                .thenReturn(1L);

        // When / Then
        assertThatThrownBy(() -> workspaceService.removeMember(currentUserId, workspaceId, targetUserId))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("마지막 OWNER를 제거할 수 없습니다");

        verify(membershipRepository, never()).delete(any());
        verify(wsRelayAdminClient, never()).disconnectUser(any());
    }

    // ── AC-16: removeMember 정상 완료 시 delete + disconnectUser 모두 호출 ─
    // 계약: WsRelayAdminClient.disconnectUser는 best-effort(내부 흡수+로깅)이므로
    // 서비스 레이어에서 try/catch 불필요. admin 실패 시 best-effort는
    // RestWsRelayAdminClientTest 5xx 미전파 테스트가 커버한다.

    @Test
    @DisplayName("AC-16: removeMember 정상 완료 → delete 호출 + disconnectUser 호출(client 계약: 예외 미전파)")
    void removeMember_success_deletesAndDisconnects() {
        // Given
        UUID workspaceId = UUID.randomUUID();
        UUID ownerId     = UUID.randomUUID();
        UUID targetId    = UUID.randomUUID();

        Membership ownerMs = Membership.builder()
                .id(UUID.randomUUID()).userId(ownerId)
                .workspaceId(workspaceId).role(MemberRole.OWNER).joinedAt(Instant.now()).build();
        Membership targetMs = Membership.builder()
                .id(UUID.randomUUID()).userId(targetId)
                .workspaceId(workspaceId).role(MemberRole.MEMBER).joinedAt(Instant.now()).build();

        when(accessGuard.requireOwner(ownerId, workspaceId)).thenReturn(ownerMs);
        when(membershipRepository.findByUserIdAndWorkspaceId(targetId, workspaceId))
                .thenReturn(Optional.of(targetMs));
        // disconnectUser는 계약상 예외를 던지지 않음(best-effort, 내부 흡수)

        // When / Then
        assertThatCode(() -> workspaceService.removeMember(ownerId, workspaceId, targetId))
                .doesNotThrowAnyException();

        verify(membershipRepository).delete(targetMs);
        verify(wsRelayAdminClient).disconnectUser(targetId);
    }
}
