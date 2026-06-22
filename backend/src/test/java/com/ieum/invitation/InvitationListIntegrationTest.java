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

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// P8 슬라이스: GET /api/workspaces/{wsId}/invitations — 초대 목록 조회 REST 통합.
@AutoConfigureMockMvc
class InvitationListIntegrationTest extends AbstractIntegrationTest {

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

        User member = userRepository.save(User.builder()
                .googleId(MEMBER_GID).email("member@test.com").name("멤버").image("img").build());
        membershipRepository.save(Membership.builder()
                .userId(member.getId()).workspaceId(workspaceId).role(MemberRole.MEMBER).build());
    }

    private static RequestPostProcessor asUser(String googleId) {
        return oauth2Login().attributes(a -> a.put("sub", googleId));
    }

    private Invitation saveInvitation(String email, InvitationStatus status) {
        return invitationRepository.save(Invitation.builder()
                .workspaceId(workspaceId).email(email).invitedById(ownerId)
                .role(MemberRole.MEMBER).token("tok-" + UUID.randomUUID())
                .status(status).expiresAt(Instant.now().plus(1, ChronoUnit.DAYS)).build());
    }

    private String url() {
        return "/api/workspaces/" + workspaceId + "/invitations";
    }

    @Test
    @DisplayName("AC-1: OWNER GET → 200 + 초대 3건 배열(혼합 상태), 각 dto에 id/workspaceId/email/status/createdAt 존재")
    void owner_list_returns200_withAllInvitations() throws Exception {
        saveInvitation("pending@test.com", InvitationStatus.PENDING);
        saveInvitation("accepted@test.com", InvitationStatus.ACCEPTED);
        saveInvitation("revoked@test.com", InvitationStatus.REVOKED);

        mockMvc.perform(get(url()).with(asUser(OWNER_GID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].id").exists())
                .andExpect(jsonPath("$[0].workspaceId").value(workspaceId.toString())) // AC-1 Then: workspaceId 포함 (spec-review 보강)
                .andExpect(jsonPath("$[0].email").exists())
                .andExpect(jsonPath("$[0].status").exists())
                .andExpect(jsonPath("$[0].createdAt").exists());
    }

    @Test
    @DisplayName("AC-2: 초대 A 후 B 저장(sleep 10ms) → GET 결과 첫번째=B(최신), 두번째=A(내림차순)")
    void owner_list_sortedByCreatedAtDesc() throws Exception {
        saveInvitation("a-first@test.com", InvitationStatus.PENDING);
        Thread.sleep(10);
        saveInvitation("b-second@test.com", InvitationStatus.PENDING);

        mockMvc.perform(get(url()).with(asUser(OWNER_GID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].email").value("b-second@test.com"))
                .andExpect(jsonPath("$[1].email").value("a-first@test.com"));
    }

    @Test
    @DisplayName("AC-3: 초대 0건 → OWNER GET → 200 + 빈 배열")
    void owner_list_empty_returns200_emptyArray() throws Exception {
        mockMvc.perform(get(url()).with(asUser(OWNER_GID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("AC-4: 미인증 GET → 401")
    void unauthenticated_list_returns401() throws Exception {
        mockMvc.perform(get(url()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("AC-5: MEMBER GET → 403 + code=FORBIDDEN")
    void member_list_returns403() throws Exception {
        mockMvc.perform(get(url()).with(asUser(MEMBER_GID)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }
}
