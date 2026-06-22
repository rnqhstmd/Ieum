package com.ieum.invitation;

import com.ieum.page.PageRepository;
import com.ieum.support.AbstractIntegrationTest;
import com.ieum.user.User;
import com.ieum.user.UserRepository;
import com.ieum.workspace.MemberRole;
import com.ieum.workspace.Membership;
import com.ieum.workspace.MembershipRepository;
import com.ieum.workspace.Workspace;
import com.ieum.workspace.WorkspaceRepository;
import com.ieum.workspace.WorkspaceType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * expirePendingInvitations 통합 테스트 (Testcontainers PostgreSQL)
 *
 * 고정 기준 시각 NOW = 2026-06-22T00:00:00Z 를 모든 테스트에서 공유.
 * expiresAt 시드는 NOW 기준 상대값으로 지정하고,
 * invitationService.expirePendingInvitations(NOW) 로 호출한다.
 *
 * bulk UPDATE 영속성 컨텍스트 우회 대비: DB 재조회는 invitationRepository.findById(id) 사용.
 */
class InvitationExpiryIntegrationTest extends AbstractIntegrationTest {

    // 모든 테스트가 공유하는 고정 기준 시각
    static final Instant NOW = Instant.parse("2026-06-22T00:00:00Z");

    @Autowired private InvitationService invitationService;
    @Autowired private InvitationRepository invitationRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private MembershipRepository membershipRepository;
    @Autowired private PageRepository pageRepository;

    private UUID ownerId;
    private UUID workspaceId;

    @BeforeEach
    void setUp() {
        // FK 역순 삭제: invitation → page → membership → workspace → user
        invitationRepository.deleteAll();
        pageRepository.deleteAll();
        membershipRepository.deleteAll();
        workspaceRepository.deleteAll();
        userRepository.deleteAll();

        User owner = userRepository.save(User.builder()
                .googleId("G-EXPIRY-OWNER")
                .email("expiry-owner@test.com")
                .name("만료테스트오너")
                .image("img")
                .build());
        ownerId = owner.getId();

        Workspace ws = workspaceRepository.save(Workspace.builder()
                .type(WorkspaceType.SHARED)
                .ownerId(ownerId)
                .name("만료테스트워크스페이스")
                .build());
        workspaceId = ws.getId();

        membershipRepository.save(Membership.builder()
                .userId(ownerId)
                .workspaceId(workspaceId)
                .role(MemberRole.OWNER)
                .build());
    }

    /**
     * 각 테스트에서 Invitation을 저장하는 헬퍼.
     * email은 UUID 기반으로 유니크하게 생성한다.
     */
    private Invitation saveInvitation(InvitationStatus status, Instant expiresAt) {
        return invitationRepository.save(Invitation.builder()
                .workspaceId(workspaceId)
                .email("x-" + UUID.randomUUID() + "@test.com")
                .invitedById(ownerId)
                .role(MemberRole.MEMBER)
                .token("tok-" + UUID.randomUUID())
                .status(status)
                .expiresAt(expiresAt)
                .build());
    }

    // ── AC-1: PENDING 중 만료된 것만 EXPIRED 전이, 비PENDING 및 미래 PENDING 불변 ──

    @Test
    @DisplayName("AC-1: expirePendingInvitations — 과거 PENDING 2건만 EXPIRED, 미래 PENDING·비PENDING 불변")
    void expirePending_onlyExpiresPastPending() {
        // 과거 만료 PENDING 2건
        Invitation pastPending1 = saveInvitation(InvitationStatus.PENDING, NOW.minusSeconds(86400));
        Invitation pastPending2 = saveInvitation(InvitationStatus.PENDING, NOW.minusSeconds(3600));
        // 미래 만료 PENDING 1건 (변환 대상 아님)
        Invitation futurePending = saveInvitation(InvitationStatus.PENDING, NOW.plusSeconds(86400));
        // 비PENDING — 상태 불변 확인
        Invitation accepted = saveInvitation(InvitationStatus.ACCEPTED, NOW.minusSeconds(86400));
        Invitation revoked  = saveInvitation(InvitationStatus.REVOKED,  NOW.minusSeconds(86400));
        Invitation expired  = saveInvitation(InvitationStatus.EXPIRED,  NOW.minusSeconds(86400));

        int count = invitationService.expirePendingInvitations(NOW);

        assertThat(count).isEqualTo(2);

        // 과거 PENDING → EXPIRED
        assertThat(invitationRepository.findById(pastPending1.getId()).orElseThrow().getStatus())
                .isEqualTo(InvitationStatus.EXPIRED);
        assertThat(invitationRepository.findById(pastPending2.getId()).orElseThrow().getStatus())
                .isEqualTo(InvitationStatus.EXPIRED);

        // 미래 PENDING → 그대로 PENDING
        assertThat(invitationRepository.findById(futurePending.getId()).orElseThrow().getStatus())
                .isEqualTo(InvitationStatus.PENDING);

        // 비PENDING → 불변
        assertThat(invitationRepository.findById(accepted.getId()).orElseThrow().getStatus())
                .isEqualTo(InvitationStatus.ACCEPTED);
        assertThat(invitationRepository.findById(revoked.getId()).orElseThrow().getStatus())
                .isEqualTo(InvitationStatus.REVOKED);
        assertThat(invitationRepository.findById(expired.getId()).orElseThrow().getStatus())
                .isEqualTo(InvitationStatus.EXPIRED);
    }

    // ── AC-2: 경계값 — expiresAt==NOW는 유지, expiresAt<NOW만 전이 ──

    @Test
    @DisplayName("AC-2: 경계 — expiresAt==NOW는 PENDING 유지, expiresAt<NOW만 EXPIRED 전이")
    void expirePending_boundary_nowIsExclusive() {
        // expiresAt == NOW: 경계값(strictly < now 조건이므로 전이 대상 아님)
        Invitation boundary = saveInvitation(InvitationStatus.PENDING, NOW);
        // expiresAt == NOW - 1초: 과거(전이 대상)
        Invitation past     = saveInvitation(InvitationStatus.PENDING, NOW.minusSeconds(1));
        // expiresAt == NOW + 1초: 미래(전이 대상 아님)
        Invitation future   = saveInvitation(InvitationStatus.PENDING, NOW.plusSeconds(1));

        int count = invitationService.expirePendingInvitations(NOW);

        assertThat(count).isEqualTo(1);  // 과거 1건만

        assertThat(invitationRepository.findById(boundary.getId()).orElseThrow().getStatus())
                .isEqualTo(InvitationStatus.PENDING);   // 경계 — 유지
        assertThat(invitationRepository.findById(past.getId()).orElseThrow().getStatus())
                .isEqualTo(InvitationStatus.EXPIRED);   // 과거 — 전이
        assertThat(invitationRepository.findById(future.getId()).orElseThrow().getStatus())
                .isEqualTo(InvitationStatus.PENDING);   // 미래 — 유지
    }

    // ── AC-4: 멱등 — 2회 호출 시 1차 N건, 2차 0건, DB 상태 동일 ──

    @Test
    @DisplayName("AC-4: 멱등 — 동일 now로 2회 호출 시 1차 3건, 2차 0건, 모두 EXPIRED")
    void expirePending_idempotent() {
        Invitation inv1 = saveInvitation(InvitationStatus.PENDING, NOW.minusSeconds(86400));
        Invitation inv2 = saveInvitation(InvitationStatus.PENDING, NOW.minusSeconds(7200));
        Invitation inv3 = saveInvitation(InvitationStatus.PENDING, NOW.minusSeconds(1));

        int first  = invitationService.expirePendingInvitations(NOW);
        int second = invitationService.expirePendingInvitations(NOW);

        assertThat(first).isEqualTo(3);
        assertThat(second).isEqualTo(0);

        // 모두 EXPIRED 유지
        assertThat(invitationRepository.findById(inv1.getId()).orElseThrow().getStatus())
                .isEqualTo(InvitationStatus.EXPIRED);
        assertThat(invitationRepository.findById(inv2.getId()).orElseThrow().getStatus())
                .isEqualTo(InvitationStatus.EXPIRED);
        assertThat(invitationRepository.findById(inv3.getId()).orElseThrow().getStatus())
                .isEqualTo(InvitationStatus.EXPIRED);
    }

    // ── AC-5: 비PENDING만 존재할 때 반환 0, 상태 불변 ──

    @Test
    @DisplayName("AC-5: 비대상 — ACCEPTED·REVOKED·EXPIRED만 존재 시 반환 0, 상태 불변")
    void expirePending_nonPendingOnly_returns0AndUnchanged() {
        Instant past = NOW.minusSeconds(86400);
        Invitation accepted = saveInvitation(InvitationStatus.ACCEPTED, past);
        Invitation revoked  = saveInvitation(InvitationStatus.REVOKED,  past);
        Invitation expired  = saveInvitation(InvitationStatus.EXPIRED,  past);

        int count = invitationService.expirePendingInvitations(NOW);

        assertThat(count).isEqualTo(0);

        assertThat(invitationRepository.findById(accepted.getId()).orElseThrow().getStatus())
                .isEqualTo(InvitationStatus.ACCEPTED);
        assertThat(invitationRepository.findById(revoked.getId()).orElseThrow().getStatus())
                .isEqualTo(InvitationStatus.REVOKED);
        assertThat(invitationRepository.findById(expired.getId()).orElseThrow().getStatus())
                .isEqualTo(InvitationStatus.EXPIRED);
    }

    // ── AC-3: 만료 대상 0건 상태에서 2회 연속 호출 → 예외 없이 각 0 ──

    @Test
    @DisplayName("AC-3: 만료 대상 0건(미래 PENDING만) — 2회 연속 호출 시 예외 없이 각 0, 상태 불변")
    void expirePending_noTarget_twiceReturnsZero() {
        // 만료 대상이 없는 상태(미래 PENDING 1건만 — 전이 대상 아님)
        Invitation futurePending = saveInvitation(InvitationStatus.PENDING, NOW.plusSeconds(86400));

        int first  = invitationService.expirePendingInvitations(NOW);
        int second = invitationService.expirePendingInvitations(NOW);

        assertThat(first).isEqualTo(0);
        assertThat(second).isEqualTo(0);

        // 미래 PENDING은 그대로 유지
        assertThat(invitationRepository.findById(futurePending.getId()).orElseThrow().getStatus())
                .isEqualTo(InvitationStatus.PENDING);
    }
}
