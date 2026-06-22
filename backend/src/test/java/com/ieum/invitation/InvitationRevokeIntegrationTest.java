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
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// P8 슬라이스: DELETE /api/workspaces/{wsId}/invitations/{invitationId} — 초대 철회 REST 통합.
@AutoConfigureMockMvc
class InvitationRevokeIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private MembershipRepository membershipRepository;
    @Autowired private InvitationRepository invitationRepository;
    @Autowired private PageRepository pageRepository;

    private static final String OWNER_GID = "G-OWNER";
    private static final String MEMBER_GID = "G-MEMBER";
    private UUID workspaceId;
    private UUID ownerId;
    // W2: 타 워크스페이스 (AC-11용)
    private UUID w2Id;

    @BeforeEach
    void setUp() {
        // FK 순서: invitation → page → membership → workspace → user
        invitationRepository.deleteAll();
        pageRepository.deleteAll();
        membershipRepository.deleteAll();
        workspaceRepository.deleteAll();
        userRepository.deleteAll();

        User owner = userRepository.save(User.builder()
                .googleId(OWNER_GID).email("owner@test.com").name("오너").image("img").build());
        ownerId = owner.getId();

        Workspace ws = workspaceRepository.save(Workspace.builder()
                .type(WorkspaceType.SHARED).ownerId(ownerId).name("팀").build());
        workspaceId = ws.getId();
        membershipRepository.save(Membership.builder()
                .userId(ownerId).workspaceId(workspaceId).role(MemberRole.OWNER).build());

        // W2: 같은 owner의 두 번째 워크스페이스 (AC-11 타 워크스페이스 은닉 검증)
        Workspace ws2 = workspaceRepository.save(Workspace.builder()
                .type(WorkspaceType.SHARED).ownerId(ownerId).name("팀2").build());
        w2Id = ws2.getId();
        membershipRepository.save(Membership.builder()
                .userId(ownerId).workspaceId(w2Id).role(MemberRole.OWNER).build());

        User member = userRepository.save(User.builder()
                .googleId(MEMBER_GID).email("member@test.com").name("멤버").image("img").build());
        membershipRepository.save(Membership.builder()
                .userId(member.getId()).workspaceId(workspaceId).role(MemberRole.MEMBER).build());
    }

    private static RequestPostProcessor asUser(String googleId) {
        return oauth2Login().attributes(a -> a.put("sub", googleId));
    }

    private Invitation saveInvitation(UUID targetWorkspaceId, String email, InvitationStatus status) {
        return invitationRepository.save(Invitation.builder()
                .workspaceId(targetWorkspaceId).email(email).invitedById(ownerId)
                .role(MemberRole.MEMBER).token("tok-" + UUID.randomUUID())
                .status(status).expiresAt(Instant.now().plus(1, ChronoUnit.DAYS)).build());
    }

    private Invitation saveExpiredInvitation(String email) {
        return invitationRepository.save(Invitation.builder()
                .workspaceId(workspaceId).email(email).invitedById(ownerId)
                .role(MemberRole.MEMBER).token("tok-" + UUID.randomUUID())
                .status(InvitationStatus.EXPIRED).expiresAt(Instant.now().minus(1, ChronoUnit.SECONDS)).build());
    }

    private String revokeUrl(UUID invitationId) {
        return "/api/workspaces/" + workspaceId + "/invitations/" + invitationId;
    }

    @Test
    @DisplayName("AC-6: PENDING 초대 DELETE OWNER → 204 + DB status=REVOKED")
    void owner_revoke_pending_returns204_statusRevoked() throws Exception {
        Invitation inv = saveInvitation(workspaceId, "pending@test.com", InvitationStatus.PENDING);

        mockMvc.perform(delete(revokeUrl(inv.getId())).with(asUser(OWNER_GID)))
                .andExpect(status().isNoContent());

        assertThat(invitationRepository.findById(inv.getId()).orElseThrow().getStatus())
                .isEqualTo(InvitationStatus.REVOKED);
    }

    @Test
    @DisplayName("AC-7: ACCEPTED 초대 DELETE OWNER → 409 + DB status 그대로 ACCEPTED")
    void owner_revoke_accepted_returns409_statusUnchanged() throws Exception {
        Invitation inv = saveInvitation(workspaceId, "accepted@test.com", InvitationStatus.ACCEPTED);

        mockMvc.perform(delete(revokeUrl(inv.getId())).with(asUser(OWNER_GID)))
                .andExpect(status().isConflict());

        assertThat(invitationRepository.findById(inv.getId()).orElseThrow().getStatus())
                .isEqualTo(InvitationStatus.ACCEPTED);
    }

    @Test
    @DisplayName("AC-8: REVOKED 초대 DELETE OWNER → 409 + DB status 그대로 REVOKED")
    void owner_revoke_revoked_returns409_statusUnchanged() throws Exception {
        Invitation inv = saveInvitation(workspaceId, "revoked@test.com", InvitationStatus.REVOKED);

        mockMvc.perform(delete(revokeUrl(inv.getId())).with(asUser(OWNER_GID)))
                .andExpect(status().isConflict());

        assertThat(invitationRepository.findById(inv.getId()).orElseThrow().getStatus())
                .isEqualTo(InvitationStatus.REVOKED);
    }

    @Test
    @DisplayName("AC-9: EXPIRED 초대 DELETE OWNER → 409")
    void owner_revoke_expired_returns409() throws Exception {
        Invitation inv = saveExpiredInvitation("expired@test.com");

        mockMvc.perform(delete(revokeUrl(inv.getId())).with(asUser(OWNER_GID)))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("AC-10: 존재하지 않는 UUID DELETE OWNER → 404")
    void owner_revoke_notFound_returns404() throws Exception {
        UUID nonExistentId = UUID.randomUUID();

        mockMvc.perform(delete(revokeUrl(nonExistentId)).with(asUser(OWNER_GID)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("AC-11: W2 초대를 W1 경로로 DELETE OWNER → 404 (타 워크스페이스 은닉)")
    void owner_revoke_otherWorkspaceInvitation_returns404() throws Exception {
        // W2에 속한 초대 생성, W1 경로로 DELETE 시도 → workspaceId 불일치 → 404
        Invitation w2Inv = saveInvitation(w2Id, "w2-invite@test.com", InvitationStatus.PENDING);

        // 경로는 W1(workspaceId), invitationId는 W2 초대의 ID
        mockMvc.perform(delete(revokeUrl(w2Inv.getId())).with(asUser(OWNER_GID)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("AC-12: 미인증 DELETE → 401")
    void unauthenticated_revoke_returns401() throws Exception {
        UUID anyId = UUID.randomUUID();

        mockMvc.perform(delete(revokeUrl(anyId)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("AC-13: MEMBER DELETE(PENDING 초대) → 403 + code=FORBIDDEN")
    void member_revoke_returns403() throws Exception {
        Invitation inv = saveInvitation(workspaceId, "target@test.com", InvitationStatus.PENDING);

        mockMvc.perform(delete(revokeUrl(inv.getId())).with(asUser(MEMBER_GID)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }
}
