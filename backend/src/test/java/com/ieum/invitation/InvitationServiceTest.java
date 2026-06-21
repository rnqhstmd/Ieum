package com.ieum.invitation;

import com.ieum.common.ConflictException;
import com.ieum.common.email.ResendEmailClient;
import com.ieum.common.security.AccessGuard;
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
}
