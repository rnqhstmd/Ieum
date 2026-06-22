package com.ieum.invitation;

import com.ieum.common.ConflictException;
import com.ieum.common.GoneException;
import com.ieum.common.email.ResendEmailClient;
import com.ieum.common.security.AccessGuard;
import com.ieum.invitation.dto.AcceptInvitationRequest;
import com.ieum.invitation.dto.CreateInvitationRequest;
import com.ieum.invitation.dto.InvitationDto;
import com.ieum.user.User;
import com.ieum.user.UserRepository;
import com.ieum.workspace.MemberRole;
import com.ieum.workspace.Membership;
import com.ieum.workspace.MembershipRepository;
import com.ieum.workspace.WorkspaceRepository;
import com.ieum.workspace.WorkspaceService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import jakarta.persistence.EntityNotFoundException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class InvitationServiceTest {

    @Mock private InvitationRepository invitationRepository;
    @Mock private WorkspaceRepository workspaceRepository;
    @Mock private MembershipRepository membershipRepository;
    @Mock private UserRepository userRepository;
    @Mock private WorkspaceService workspaceService;
    @Mock private ResendEmailClient resendEmailClient;
    @Mock private AccessGuard accessGuard;

    @InjectMocks private InvitationService invitationService;

    // ── AC-1: OWNER 초대 생성 → PENDING Invitation 저장 ────────────────

    @Test
    @DisplayName("AC-1: createInvitation — OWNER가 비멤버 이메일 초대 시 PENDING Invitation 저장 + dto 반환")
    void createInvitation_owner_savesPendingInvitation() {
        UUID owner = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        UUID savedId = UUID.randomUUID();
        when(userRepository.findByEmail("new@x.com")).thenReturn(Optional.empty());
        when(workspaceRepository.findById(wsId)).thenReturn(Optional.empty());
        when(invitationRepository.save(any(Invitation.class))).thenAnswer(inv -> {
            Invitation i = inv.getArgument(0);
            return Invitation.builder()
                    .id(savedId).workspaceId(i.getWorkspaceId()).email(i.getEmail())
                    .invitedById(i.getInvitedById()).role(i.getRole()).token(i.getToken())
                    .status(i.getStatus()).expiresAt(i.getExpiresAt()).build();
        });

        InvitationDto dto = invitationService.createInvitation(owner, wsId,
                new CreateInvitationRequest("new@x.com", MemberRole.MEMBER));

        ArgumentCaptor<Invitation> cap = ArgumentCaptor.forClass(Invitation.class);
        verify(invitationRepository).save(cap.capture());
        Invitation saved = cap.getValue();
        assertThat(saved.getStatus()).isEqualTo(InvitationStatus.PENDING);
        assertThat(saved.getWorkspaceId()).isEqualTo(wsId);
        assertThat(saved.getEmail()).isEqualTo("new@x.com");
        assertThat(saved.getInvitedById()).isEqualTo(owner);
        assertThat(saved.getRole()).isEqualTo(MemberRole.MEMBER);

        assertThat(dto.status()).isEqualTo(InvitationStatus.PENDING);
        assertThat(dto.email()).isEqualTo("new@x.com");
        assertThat(dto.invitedById()).isEqualTo(owner);
    }

    // ── AC-2: 토큰은 비어있지 않고 호출마다 상이 ───────────────────────

    @Test
    @DisplayName("AC-2: createInvitation — 토큰은 비어있지 않고 길이≥32, 호출마다 서로 다르다")
    void createInvitation_tokens_unique_and_long() {
        UUID owner = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        when(userRepository.findByEmail(any())).thenReturn(Optional.empty());
        when(workspaceRepository.findById(wsId)).thenReturn(Optional.empty());
        when(invitationRepository.save(any(Invitation.class))).thenAnswer(inv -> inv.getArgument(0));

        invitationService.createInvitation(owner, wsId, new CreateInvitationRequest("a@x.com", MemberRole.MEMBER));
        invitationService.createInvitation(owner, wsId, new CreateInvitationRequest("b@x.com", MemberRole.MEMBER));

        ArgumentCaptor<Invitation> cap = ArgumentCaptor.forClass(Invitation.class);
        verify(invitationRepository, times(2)).save(cap.capture());
        List<Invitation> saved = cap.getAllValues();
        String t1 = saved.get(0).getToken();
        String t2 = saved.get(1).getToken();
        assertThat(t1).isNotBlank();
        assertThat(t1.length()).isGreaterThanOrEqualTo(32);
        assertThat(t2).isNotBlank();
        assertThat(t1).isNotEqualTo(t2);
    }

    // ── AC-3: 만료는 생성 시점 +7일 ───────────────────────────────────

    @Test
    @DisplayName("AC-3: createInvitation — 만료는 생성 시점 +7일(±1일 윈도우)")
    void createInvitation_expiresIn7Days() {
        UUID owner = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        when(userRepository.findByEmail(any())).thenReturn(Optional.empty());
        when(workspaceRepository.findById(wsId)).thenReturn(Optional.empty());
        when(invitationRepository.save(any(Invitation.class))).thenAnswer(inv -> inv.getArgument(0));

        Instant before = Instant.now();
        invitationService.createInvitation(owner, wsId, new CreateInvitationRequest("a@x.com", MemberRole.MEMBER));

        ArgumentCaptor<Invitation> cap = ArgumentCaptor.forClass(Invitation.class);
        verify(invitationRepository).save(cap.capture());
        Instant exp = cap.getValue().getExpiresAt();
        assertThat(exp).isAfter(before.plus(6, ChronoUnit.DAYS));
        assertThat(exp).isBefore(before.plus(8, ChronoUnit.DAYS));
    }

    // ── AC-4: 비OWNER는 거부되고 저장되지 않는다 ──────────────────────

    @Test
    @DisplayName("AC-4: createInvitation — 비OWNER는 AccessDeniedException, 저장 없음")
    void createInvitation_nonOwner_throwsAndSavesNothing() {
        UUID member = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        doThrow(new AccessDeniedException("OWNER 권한이 필요합니다."))
                .when(accessGuard).requireOwner(member, wsId);

        assertThatThrownBy(() -> invitationService.createInvitation(member, wsId,
                new CreateInvitationRequest("a@x.com", MemberRole.MEMBER)))
                .isInstanceOf(AccessDeniedException.class);

        verify(invitationRepository, never()).save(any());
    }

    // ── AC-6: 메일 발송 실패해도 초대는 저장된다 (fallback) ────────────

    @Test
    @DisplayName("AC-6: createInvitation — 메일 발송이 실패해도 초대는 저장되고 예외 미전파")
    void createInvitation_emailFails_stillSaves() {
        UUID owner = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        when(userRepository.findByEmail(any())).thenReturn(Optional.empty());
        when(workspaceRepository.findById(wsId)).thenReturn(Optional.empty());
        when(invitationRepository.save(any(Invitation.class))).thenAnswer(inv -> inv.getArgument(0));
        doThrow(new RuntimeException("smtp down"))
                .when(resendEmailClient).sendInvitationEmail(any(), any(), any());

        InvitationDto dto = invitationService.createInvitation(owner, wsId,
                new CreateInvitationRequest("a@x.com", MemberRole.MEMBER));

        assertThat(dto.status()).isEqualTo(InvitationStatus.PENDING);
        verify(invitationRepository).save(any(Invitation.class));
    }

    // ── AC-5: 이미 멤버인 이메일 초대는 거부되고 저장되지 않는다 (INV-05) ──

    @Test
    @DisplayName("AC-5: createInvitation — 이미 멤버인 이메일이면 ConflictException, 저장 없음")
    void createInvitation_alreadyMember_throwsConflictAndSavesNothing() {
        UUID owner = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        UUID existingUserId = UUID.randomUUID();
        when(userRepository.findByEmail("exist@x.com"))
                .thenReturn(Optional.of(User.builder().id(existingUserId).email("exist@x.com").build()));
        when(membershipRepository.findByUserIdAndWorkspaceId(existingUserId, wsId))
                .thenReturn(Optional.of(Membership.builder()
                        .userId(existingUserId).workspaceId(wsId).role(MemberRole.MEMBER).build()));

        assertThatThrownBy(() -> invitationService.createInvitation(owner, wsId,
                new CreateInvitationRequest("exist@x.com", MemberRole.MEMBER)))
                .isInstanceOf(ConflictException.class);

        verify(invitationRepository, never()).save(any());
    }

    // ── 방어(cross-review MEDIUM / PR #19 gemini): request null 가드 ──

    @Test
    @DisplayName("방어: createInvitation — request가 null이면 IllegalArgumentException, 저장 없음")
    void createInvitation_nullRequest_throwsAndSavesNothing() {
        UUID owner = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();

        assertThatThrownBy(() -> invitationService.createInvitation(owner, wsId, null))
                .isInstanceOf(IllegalArgumentException.class);

        verify(invitationRepository, never()).save(any());
    }

    // ═══════════════════ acceptInvitation (P8 AC-1~10) ═══════════════════

    private static final String TOKEN = "valid-token-abcdef0123456789";

    private Invitation pendingInvitation(String email, MemberRole role, UUID wsId, Instant expiresAt) {
        return Invitation.builder()
                .id(UUID.randomUUID()).workspaceId(wsId).email(email)
                .invitedById(UUID.randomUUID()).role(role).token(TOKEN)
                .status(InvitationStatus.PENDING).expiresAt(expiresAt).build();
    }

    // AC-1: 유효 수락 → Membership(role 승계) 생성 + status ACCEPTED
    @Test
    @DisplayName("AC-1: acceptInvitation — 유효 PENDING+미만료+이메일일치 → Membership 생성 + status ACCEPTED")
    void acceptInvitation_valid_createsMembershipAndAccepts() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        Invitation inv = pendingInvitation("user@x.com", MemberRole.MEMBER, wsId,
                Instant.now().plus(1, ChronoUnit.DAYS));
        when(invitationRepository.findByToken(TOKEN)).thenReturn(Optional.of(inv));
        when(userRepository.findById(userId))
                .thenReturn(Optional.of(User.builder().id(userId).email("user@x.com").build()));
        when(membershipRepository.findByUserIdAndWorkspaceId(userId, wsId)).thenReturn(Optional.empty());

        invitationService.acceptInvitation(userId, new AcceptInvitationRequest(TOKEN));

        ArgumentCaptor<Membership> cap = ArgumentCaptor.forClass(Membership.class);
        verify(membershipRepository).save(cap.capture());
        assertThat(cap.getValue().getUserId()).isEqualTo(userId);
        assertThat(cap.getValue().getWorkspaceId()).isEqualTo(wsId);
        assertThat(cap.getValue().getRole()).isEqualTo(MemberRole.MEMBER);
        assertThat(inv.getStatus()).isEqualTo(InvitationStatus.ACCEPTED);
        verify(invitationRepository).save(inv);
    }

    // AC-2: 존재하지 않는 토큰 → 404
    @Test
    @DisplayName("AC-2: acceptInvitation — 존재하지 않는 토큰 → EntityNotFoundException, Membership 미생성")
    void acceptInvitation_unknownToken_throwsNotFound() {
        UUID userId = UUID.randomUUID();
        when(invitationRepository.findByToken("nope")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> invitationService.acceptInvitation(userId, new AcceptInvitationRequest("nope")))
                .isInstanceOf(EntityNotFoundException.class);

        verify(membershipRepository, never()).save(any());
    }

    // AC-3: ACCEPTED 상태 → 409
    @Test
    @DisplayName("AC-3: acceptInvitation — ACCEPTED 상태 토큰 → ConflictException, Membership 미생성. 메시지에 내부 상태값(enum) 미노출")
    void acceptInvitation_accepted_throwsConflict() {
        UUID userId = UUID.randomUUID();
        Invitation inv = pendingInvitation("user@x.com", MemberRole.MEMBER, UUID.randomUUID(),
                Instant.now().plus(1, ChronoUnit.DAYS));
        inv.setStatus(InvitationStatus.ACCEPTED);
        when(invitationRepository.findByToken(TOKEN)).thenReturn(Optional.of(inv));

        assertThatThrownBy(() -> invitationService.acceptInvitation(userId, new AcceptInvitationRequest(TOKEN)))
                .isInstanceOf(ConflictException.class)
                .hasMessage("이미 처리된 초대입니다."); // SEC: 내부 상태값(ACCEPTED 등) 미노출

        verify(membershipRepository, never()).save(any());
    }

    // AC-4: REVOKED 상태 → 409
    @Test
    @DisplayName("AC-4: acceptInvitation — REVOKED 상태 토큰 → ConflictException")
    void acceptInvitation_revoked_throwsConflict() {
        UUID userId = UUID.randomUUID();
        Invitation inv = pendingInvitation("user@x.com", MemberRole.MEMBER, UUID.randomUUID(),
                Instant.now().plus(1, ChronoUnit.DAYS));
        inv.setStatus(InvitationStatus.REVOKED);
        when(invitationRepository.findByToken(TOKEN)).thenReturn(Optional.of(inv));

        assertThatThrownBy(() -> invitationService.acceptInvitation(userId, new AcceptInvitationRequest(TOKEN)))
                .isInstanceOf(ConflictException.class);

        verify(membershipRepository, never()).save(any());
    }

    // AC-5: PENDING+만료 → status EXPIRED 전이 + GoneException(410)
    @Test
    @DisplayName("AC-5: acceptInvitation — PENDING+만료 → status EXPIRED 전이 + GoneException, Membership 미생성")
    void acceptInvitation_expired_transitionsExpiredAndThrowsGone() {
        UUID userId = UUID.randomUUID();
        Invitation inv = pendingInvitation("user@x.com", MemberRole.MEMBER, UUID.randomUUID(),
                Instant.now().minus(1, ChronoUnit.SECONDS));
        when(invitationRepository.findByToken(TOKEN)).thenReturn(Optional.of(inv));

        assertThatThrownBy(() -> invitationService.acceptInvitation(userId, new AcceptInvitationRequest(TOKEN)))
                .isInstanceOf(GoneException.class);

        assertThat(inv.getStatus()).isEqualTo(InvitationStatus.EXPIRED);
        verify(invitationRepository).save(inv);
        verify(membershipRepository, never()).save(any());
    }

    // AC-6: 이미 EXPIRED 상태 → 409 (비PENDING)
    @Test
    @DisplayName("AC-6: acceptInvitation — 이미 EXPIRED 상태 토큰 → ConflictException")
    void acceptInvitation_alreadyExpired_throwsConflict() {
        UUID userId = UUID.randomUUID();
        Invitation inv = pendingInvitation("user@x.com", MemberRole.MEMBER, UUID.randomUUID(),
                Instant.now().minus(10, ChronoUnit.DAYS));
        inv.setStatus(InvitationStatus.EXPIRED);
        when(invitationRepository.findByToken(TOKEN)).thenReturn(Optional.of(inv));

        assertThatThrownBy(() -> invitationService.acceptInvitation(userId, new AcceptInvitationRequest(TOKEN)))
                .isInstanceOf(ConflictException.class);

        verify(membershipRepository, never()).save(any());
    }

    // AC-7: 초대 이메일 ≠ 로그인 사용자 이메일 → 403
    @Test
    @DisplayName("AC-7: acceptInvitation — 초대 이메일 ≠ 로그인 사용자 이메일 → AccessDeniedException, Membership 미생성")
    void acceptInvitation_emailMismatch_throwsForbidden() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        Invitation inv = pendingInvitation("invited@x.com", MemberRole.MEMBER, wsId,
                Instant.now().plus(1, ChronoUnit.DAYS));
        when(invitationRepository.findByToken(TOKEN)).thenReturn(Optional.of(inv));
        when(userRepository.findById(userId))
                .thenReturn(Optional.of(User.builder().id(userId).email("other@x.com").build()));

        assertThatThrownBy(() -> invitationService.acceptInvitation(userId, new AcceptInvitationRequest(TOKEN)))
                .isInstanceOf(AccessDeniedException.class);

        verify(membershipRepository, never()).save(any());
    }

    // AC-8: 이미 멤버(멱등) → Membership 미생성 + status ACCEPTED 전이
    @Test
    @DisplayName("AC-8: acceptInvitation — 이미 멤버(멱등) → Membership 미생성 + status ACCEPTED 전이")
    void acceptInvitation_alreadyMember_idempotentAccept() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        Invitation inv = pendingInvitation("user@x.com", MemberRole.MEMBER, wsId,
                Instant.now().plus(1, ChronoUnit.DAYS));
        when(invitationRepository.findByToken(TOKEN)).thenReturn(Optional.of(inv));
        when(userRepository.findById(userId))
                .thenReturn(Optional.of(User.builder().id(userId).email("user@x.com").build()));
        when(membershipRepository.findByUserIdAndWorkspaceId(userId, wsId))
                .thenReturn(Optional.of(Membership.builder()
                        .userId(userId).workspaceId(wsId).role(MemberRole.MEMBER).build()));

        invitationService.acceptInvitation(userId, new AcceptInvitationRequest(TOKEN));

        verify(membershipRepository, never()).save(any());
        assertThat(inv.getStatus()).isEqualTo(InvitationStatus.ACCEPTED);
        verify(invitationRepository).save(inv);
    }

    // AC-10: role=OWNER 초대 → Membership.role=OWNER 승계
    @Test
    @DisplayName("AC-10: acceptInvitation — role=OWNER 초대 → Membership.role=OWNER 승계")
    void acceptInvitation_ownerRole_inheritedToMembership() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        Invitation inv = pendingInvitation("user@x.com", MemberRole.OWNER, wsId,
                Instant.now().plus(1, ChronoUnit.DAYS));
        when(invitationRepository.findByToken(TOKEN)).thenReturn(Optional.of(inv));
        when(userRepository.findById(userId))
                .thenReturn(Optional.of(User.builder().id(userId).email("user@x.com").build()));
        when(membershipRepository.findByUserIdAndWorkspaceId(userId, wsId)).thenReturn(Optional.empty());

        invitationService.acceptInvitation(userId, new AcceptInvitationRequest(TOKEN));

        ArgumentCaptor<Membership> cap = ArgumentCaptor.forClass(Membership.class);
        verify(membershipRepository).save(cap.capture());
        assertThat(cap.getValue().getRole()).isEqualTo(MemberRole.OWNER);
    }

    // ═══════════════════ listInvitations (LIST-U1~U3) ═══════════════════

    // LIST-U1: OWNER, repo 2건 반환 → 2건 dto, 필드 일치, requireOwner 1회
    @Test
    @DisplayName("LIST-U1: listInvitations — OWNER + repo 2건 → InvitationDto 2건 반환, 필드 일치, requireOwner 1회")
    void listInvitations_owner_returnsDtoList() {
        UUID owner = UUID.randomUUID();
        UUID wsId  = UUID.randomUUID();

        Instant now = Instant.now();
        Invitation inv1 = Invitation.builder()
                .id(UUID.randomUUID()).workspaceId(wsId).email("a@x.com")
                .invitedById(owner).role(MemberRole.MEMBER).token("tok1")
                .status(InvitationStatus.PENDING).expiresAt(now.plus(7, ChronoUnit.DAYS))
                .createdAt(now).build();
        Invitation inv2 = Invitation.builder()
                .id(UUID.randomUUID()).workspaceId(wsId).email("b@x.com")
                .invitedById(owner).role(MemberRole.MEMBER).token("tok2")
                .status(InvitationStatus.PENDING).expiresAt(now.plus(7, ChronoUnit.DAYS))
                .createdAt(now.minusSeconds(60)).build();

        when(invitationRepository.findByWorkspaceIdOrderByCreatedAtDesc(wsId))
                .thenReturn(List.of(inv1, inv2));

        List<InvitationDto> result = invitationService.listInvitations(owner, wsId);

        assertThat(result).hasSize(2);

        InvitationDto dto1 = result.get(0);
        assertThat(dto1.id()).isEqualTo(inv1.getId());
        assertThat(dto1.email()).isEqualTo(inv1.getEmail());
        assertThat(dto1.status()).isEqualTo(inv1.getStatus());
        assertThat(dto1.createdAt()).isEqualTo(inv1.getCreatedAt());

        InvitationDto dto2 = result.get(1);
        assertThat(dto2.id()).isEqualTo(inv2.getId());
        assertThat(dto2.email()).isEqualTo(inv2.getEmail());

        verify(accessGuard, times(1)).requireOwner(owner, wsId);
    }

    // LIST-U2: 비OWNER → AccessDeniedException 전파, repo 미호출
    @Test
    @DisplayName("LIST-U2: listInvitations — 비OWNER → AccessDeniedException 전파, findByWorkspaceId 호출 안 됨")
    void listInvitations_nonOwner_throwsAccessDenied() {
        UUID member = UUID.randomUUID();
        UUID wsId   = UUID.randomUUID();
        doThrow(new AccessDeniedException("OWNER 권한이 필요합니다."))
                .when(accessGuard).requireOwner(member, wsId);

        assertThatThrownBy(() -> invitationService.listInvitations(member, wsId))
                .isInstanceOf(AccessDeniedException.class);

        verify(invitationRepository, never()).findByWorkspaceIdOrderByCreatedAtDesc(any());
    }

    // LIST-U3: OWNER, repo 빈 리스트 → 빈 리스트 반환
    @Test
    @DisplayName("LIST-U3: listInvitations — OWNER + repo 빈 리스트 → 빈 리스트 반환")
    void listInvitations_owner_emptyList() {
        UUID owner = UUID.randomUUID();
        UUID wsId  = UUID.randomUUID();
        when(invitationRepository.findByWorkspaceIdOrderByCreatedAtDesc(wsId))
                .thenReturn(List.of());

        List<InvitationDto> result = invitationService.listInvitations(owner, wsId);

        assertThat(result).isEmpty();
    }

    // ═══════════════════ revokeInvitation (REV-U1~U7) ═══════════════════

    // REV-U1 (AC-6): PENDING 초대, OWNER → status REVOKED + save 호출
    @Test
    @DisplayName("REV-U1: revokeInvitation — OWNER + PENDING 초대 → status REVOKED 전이 + invitationRepository.save 호출")
    void revokeInvitation_owner_pending_revokesAndSaves() {
        UUID owner = UUID.randomUUID();
        UUID wsId  = UUID.randomUUID();
        UUID invId = UUID.randomUUID();
        Invitation inv = Invitation.builder()
                .id(invId).workspaceId(wsId).email("a@x.com")
                .invitedById(UUID.randomUUID()).role(MemberRole.MEMBER).token("tok-rev-1")
                .status(InvitationStatus.PENDING).expiresAt(Instant.now().plus(7, ChronoUnit.DAYS))
                .build();
        when(invitationRepository.findById(invId)).thenReturn(Optional.of(inv));

        invitationService.revokeInvitation(owner, wsId, invId);

        assertThat(inv.getStatus()).isEqualTo(InvitationStatus.REVOKED);
        verify(invitationRepository).save(inv);
    }

    // REV-U2 (AC-13): 비OWNER → AccessDeniedException 전파, findById/save 미호출
    @Test
    @DisplayName("REV-U2: revokeInvitation — 비OWNER → AccessDeniedException 전파, findById·save 호출 안 됨")
    void revokeInvitation_nonOwner_throwsAccessDenied() {
        UUID member = UUID.randomUUID();
        UUID wsId   = UUID.randomUUID();
        UUID invId  = UUID.randomUUID();
        doThrow(new AccessDeniedException("OWNER 권한이 필요합니다."))
                .when(accessGuard).requireOwner(member, wsId);

        assertThatThrownBy(() -> invitationService.revokeInvitation(member, wsId, invId))
                .isInstanceOf(AccessDeniedException.class);

        verify(invitationRepository, never()).findById(any());
        verify(invitationRepository, never()).save(any());
    }

    // REV-U3 (AC-10): findById 빈 Optional → EntityNotFoundException, save 미호출
    @Test
    @DisplayName("REV-U3: revokeInvitation — 존재하지 않는 invitationId → EntityNotFoundException, save 호출 안 됨")
    void revokeInvitation_notFound_throwsEntityNotFound() {
        UUID owner = UUID.randomUUID();
        UUID wsId  = UUID.randomUUID();
        UUID invId = UUID.randomUUID();
        when(invitationRepository.findById(invId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> invitationService.revokeInvitation(owner, wsId, invId))
                .isInstanceOf(EntityNotFoundException.class);

        verify(invitationRepository, never()).save(any());
    }

    // REV-U4 (AC-11): workspaceId 불일치 → EntityNotFoundException(404, 자원 은닉), save 미호출
    @Test
    @DisplayName("REV-U4: revokeInvitation — workspaceId 불일치 초대 → EntityNotFoundException(404, 자원 은닉), save 호출 안 됨")
    void revokeInvitation_workspaceMismatch_throwsEntityNotFound() {
        UUID owner   = UUID.randomUUID();
        UUID wsId    = UUID.randomUUID();
        UUID wsOther = UUID.randomUUID();
        UUID invId   = UUID.randomUUID();
        Invitation inv = Invitation.builder()
                .id(invId).workspaceId(wsOther).email("a@x.com")
                .invitedById(UUID.randomUUID()).role(MemberRole.MEMBER).token("tok-rev-4")
                .status(InvitationStatus.PENDING).expiresAt(Instant.now().plus(7, ChronoUnit.DAYS))
                .build();
        when(invitationRepository.findById(invId)).thenReturn(Optional.of(inv));

        assertThatThrownBy(() -> invitationService.revokeInvitation(owner, wsId, invId))
                .isInstanceOf(EntityNotFoundException.class);

        verify(invitationRepository, never()).save(any());
    }

    // REV-U5 (AC-7): status=ACCEPTED → ConflictException("철회할 수 없는 초대 상태입니다."), save 미호출, status 그대로
    @Test
    @DisplayName("REV-U5: revokeInvitation — status=ACCEPTED → ConflictException(409) + 메시지 일치, save 호출 안 됨, status 그대로 ACCEPTED")
    void revokeInvitation_accepted_throwsConflict() {
        UUID owner = UUID.randomUUID();
        UUID wsId  = UUID.randomUUID();
        UUID invId = UUID.randomUUID();
        Invitation inv = Invitation.builder()
                .id(invId).workspaceId(wsId).email("a@x.com")
                .invitedById(UUID.randomUUID()).role(MemberRole.MEMBER).token("tok-rev-5")
                .status(InvitationStatus.ACCEPTED).expiresAt(Instant.now().plus(7, ChronoUnit.DAYS))
                .build();
        when(invitationRepository.findById(invId)).thenReturn(Optional.of(inv));

        assertThatThrownBy(() -> invitationService.revokeInvitation(owner, wsId, invId))
                .isInstanceOf(ConflictException.class)
                .hasMessage("철회할 수 없는 초대 상태입니다.");

        verify(invitationRepository, never()).save(any());
        assertThat(inv.getStatus()).isEqualTo(InvitationStatus.ACCEPTED);
    }

    // REV-U6 (AC-8): status=REVOKED → ConflictException, save 미호출, status 그대로 REVOKED
    @Test
    @DisplayName("REV-U6: revokeInvitation — status=REVOKED → ConflictException, save 호출 안 됨, status 그대로 REVOKED")
    void revokeInvitation_alreadyRevoked_throwsConflict() {
        UUID owner = UUID.randomUUID();
        UUID wsId  = UUID.randomUUID();
        UUID invId = UUID.randomUUID();
        Invitation inv = Invitation.builder()
                .id(invId).workspaceId(wsId).email("a@x.com")
                .invitedById(UUID.randomUUID()).role(MemberRole.MEMBER).token("tok-rev-6")
                .status(InvitationStatus.REVOKED).expiresAt(Instant.now().plus(7, ChronoUnit.DAYS))
                .build();
        when(invitationRepository.findById(invId)).thenReturn(Optional.of(inv));

        assertThatThrownBy(() -> invitationService.revokeInvitation(owner, wsId, invId))
                .isInstanceOf(ConflictException.class);

        verify(invitationRepository, never()).save(any());
        assertThat(inv.getStatus()).isEqualTo(InvitationStatus.REVOKED);
    }

    // REV-U7 (AC-9): status=EXPIRED → ConflictException, save 미호출
    @Test
    @DisplayName("REV-U7: revokeInvitation — status=EXPIRED → ConflictException, save 호출 안 됨")
    void revokeInvitation_expired_throwsConflict() {
        UUID owner = UUID.randomUUID();
        UUID wsId  = UUID.randomUUID();
        UUID invId = UUID.randomUUID();
        Invitation inv = Invitation.builder()
                .id(invId).workspaceId(wsId).email("a@x.com")
                .invitedById(UUID.randomUUID()).role(MemberRole.MEMBER).token("tok-rev-7")
                .status(InvitationStatus.EXPIRED).expiresAt(Instant.now().minus(1, ChronoUnit.DAYS))
                .build();
        when(invitationRepository.findById(invId)).thenReturn(Optional.of(inv));

        assertThatThrownBy(() -> invitationService.revokeInvitation(owner, wsId, invId))
                .isInstanceOf(ConflictException.class);

        verify(invitationRepository, never()).save(any());
    }
}
