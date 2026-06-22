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
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// P8: POST /api/invitations/accept — 초대 수락 REST 통합 (testcontainers)
@AutoConfigureMockMvc
class InvitationAcceptIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private MembershipRepository membershipRepository;
    @Autowired private InvitationRepository invitationRepository;
    @Autowired private PageRepository pageRepository;

    private static final String INVITEE_GID = "G-INVITEE";
    private UUID workspaceId;
    private UUID inviteeId;
    private UUID ownerId;

    @BeforeEach
    void setUp() {
        // FK 순서: invitation → page → membership → workspace → user
        invitationRepository.deleteAll();
        pageRepository.deleteAll();
        membershipRepository.deleteAll();
        workspaceRepository.deleteAll();
        userRepository.deleteAll();

        User owner = userRepository.save(User.builder()
                .googleId("G-OWNER").email("owner@test.com").name("오너").image("img").build());
        Workspace ws = workspaceRepository.save(Workspace.builder()
                .type(WorkspaceType.SHARED).ownerId(owner.getId()).name("팀").build());
        workspaceId = ws.getId();
        ownerId = owner.getId();
        membershipRepository.save(Membership.builder()
                .userId(ownerId).workspaceId(workspaceId).role(MemberRole.OWNER).build());

        // 초대받은 사용자 (아직 워크스페이스 멤버 아님)
        User invitee = userRepository.save(User.builder()
                .googleId(INVITEE_GID).email("invitee@test.com").name("초대").image("img").build());
        inviteeId = invitee.getId();
    }

    private static RequestPostProcessor asUser(String googleId) {
        return oauth2Login().attributes(a -> a.put("sub", googleId));
    }
    private static String body(String token) {
        return "{\"token\":\"" + token + "\"}";
    }
    private Invitation saveInvitation(String email, InvitationStatus status, Instant expiresAt) {
        return invitationRepository.save(Invitation.builder()
                .workspaceId(workspaceId).email(email).invitedById(ownerId)
                .role(MemberRole.MEMBER).token("tok-" + UUID.randomUUID())
                .status(status).expiresAt(expiresAt).build());
    }

    @Test
    @DisplayName("AC-1(e2e): 유효 토큰 수락 → 204 + Membership 생성 + status ACCEPTED")
    void accept_valid_returns204_createsMembership() throws Exception {
        Invitation inv = saveInvitation("invitee@test.com", InvitationStatus.PENDING,
                Instant.now().plus(1, ChronoUnit.DAYS));

        mockMvc.perform(post("/api/invitations/accept").with(asUser(INVITEE_GID))
                        .contentType(MediaType.APPLICATION_JSON).content(body(inv.getToken())))
                .andExpect(status().isNoContent());

        assertThat(membershipRepository.findByUserIdAndWorkspaceId(inviteeId, workspaceId)).isPresent();
        assertThat(invitationRepository.findById(inv.getId()).orElseThrow().getStatus())
                .isEqualTo(InvitationStatus.ACCEPTED);
    }

    @Test
    @DisplayName("AC-9: 미인증 수락 → 401")
    void accept_unauthenticated_returns401() throws Exception {
        Invitation inv = saveInvitation("invitee@test.com", InvitationStatus.PENDING,
                Instant.now().plus(1, ChronoUnit.DAYS));

        mockMvc.perform(post("/api/invitations/accept")
                        .contentType(MediaType.APPLICATION_JSON).content(body(inv.getToken())))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("AC-5(영속): 만료 토큰 수락 → 410 + DB status EXPIRED 영속(noRollbackFor 회귀 검출)")
    void accept_expired_returns410_persistsExpired() throws Exception {
        Invitation inv = saveInvitation("invitee@test.com", InvitationStatus.PENDING,
                Instant.now().minus(1, ChronoUnit.SECONDS));

        mockMvc.perform(post("/api/invitations/accept").with(asUser(INVITEE_GID))
                        .contentType(MediaType.APPLICATION_JSON).content(body(inv.getToken())))
                .andExpect(status().isGone());

        // 410이어도 EXPIRED 전이가 커밋되어야 한다 (noRollbackFor=GoneException 검증)
        assertThat(invitationRepository.findById(inv.getId()).orElseThrow().getStatus())
                .isEqualTo(InvitationStatus.EXPIRED);
    }

    @Test
    @DisplayName("AC-7: 초대 이메일 ≠ 로그인 사용자 → 403 (AccessDeniedException 실제 HTTP 매핑 검증)")
    void accept_emailMismatch_returns403() throws Exception {
        // 다른 이메일로 발급된 초대를 invitee(invitee@test.com)가 수락 시도 → 이메일 불일치
        Invitation inv = saveInvitation("someone-else@test.com", InvitationStatus.PENDING,
                Instant.now().plus(1, ChronoUnit.DAYS));

        mockMvc.perform(post("/api/invitations/accept").with(asUser(INVITEE_GID))
                        .contentType(MediaType.APPLICATION_JSON).content(body(inv.getToken())))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN")); // ApiExceptionHandler JSON 403 경로 확정(cross-review HIGH)

        // Membership 미생성 + 초대 상태 변경 없음
        assertThat(membershipRepository.findByUserIdAndWorkspaceId(inviteeId, workspaceId)).isEmpty();
        assertThat(invitationRepository.findById(inv.getId()).orElseThrow().getStatus())
                .isEqualTo(InvitationStatus.PENDING);
    }
}
