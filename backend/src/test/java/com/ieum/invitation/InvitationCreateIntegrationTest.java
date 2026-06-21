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

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// P7 슬라이스 ②a: POST /api/workspaces/{wsId}/invitations — 초대 생성 REST 통합.
@AutoConfigureMockMvc
class InvitationCreateIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private MembershipRepository membershipRepository;
    @Autowired private InvitationRepository invitationRepository;
    @Autowired private PageRepository pageRepository;

    private static final String OWNER_GID = "G-OWNER";
    private static final String MEMBER_GID = "G-MEMBER";
    private UUID workspaceId;

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
        Workspace ws = workspaceRepository.save(Workspace.builder()
                .type(WorkspaceType.SHARED).ownerId(owner.getId()).name("팀").build());
        workspaceId = ws.getId();
        membershipRepository.save(Membership.builder()
                .userId(owner.getId()).workspaceId(workspaceId).role(MemberRole.OWNER).build());

        // 이미 멤버(AC-8 비OWNER 시도자 / AC-10 이미멤버 이메일)
        User member = userRepository.save(User.builder()
                .googleId(MEMBER_GID).email("member@test.com").name("멤버").image("img").build());
        membershipRepository.save(Membership.builder()
                .userId(member.getId()).workspaceId(workspaceId).role(MemberRole.MEMBER).build());
    }

    private static RequestPostProcessor asUser(String googleId) {
        return oauth2Login().attributes(a -> a.put("sub", googleId));
    }
    private static String body(String email) {
        return "{\"email\":\"" + email + "\",\"role\":\"MEMBER\"}";
    }
    private String url() {
        return "/api/workspaces/" + workspaceId + "/invitations";
    }

    @Test
    @DisplayName("AC-7: OWNER POST 유효 이메일 → 201 PENDING + DB 1건")
    void owner_create_returns201() throws Exception {
        mockMvc.perform(post(url()).with(asUser(OWNER_GID))
                        .contentType(MediaType.APPLICATION_JSON).content(body("new@x.com")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.workspaceId").value(workspaceId.toString()))
                .andExpect(jsonPath("$.email").value("new@x.com"));

        List<Invitation> all = invitationRepository.findAll();
        assertThat(all).hasSize(1);
        assertThat(all.get(0).getStatus()).isEqualTo(InvitationStatus.PENDING);
    }

    @Test
    @DisplayName("AC-8: 비OWNER(MEMBER) POST → 403, 저장 없음")
    void member_create_returns403() throws Exception {
        mockMvc.perform(post(url()).with(asUser(MEMBER_GID))
                        .contentType(MediaType.APPLICATION_JSON).content(body("new@x.com")))
                .andExpect(status().isForbidden());
        assertThat(invitationRepository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("AC-9: 미인증 POST → 401")
    void unauthenticated_returns401() throws Exception {
        mockMvc.perform(post(url())
                        .contentType(MediaType.APPLICATION_JSON).content(body("new@x.com")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("AC-10: 이미 멤버인 이메일 초대 → 409 CONFLICT")
    void alreadyMember_returns409() throws Exception {
        mockMvc.perform(post(url()).with(asUser(OWNER_GID))
                        .contentType(MediaType.APPLICATION_JSON).content(body("member@test.com")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICT"));
    }
}
