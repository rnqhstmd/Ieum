package com.ieum.page;

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

import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// 자동저장 T1 / AC-1,2,3: GET /api/pages/{pageId} — 제목 자동저장 배선 전 단건 조회(title+wsId).
@AutoConfigureMockMvc
class PageDetailIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private MembershipRepository membershipRepository;
    @Autowired private PageRepository pageRepository;

    private static final String GOOGLE_ID = "G-PD";
    private UUID userId;
    private UUID workspaceId;
    private UUID pageId;

    @BeforeEach
    void setUp() {
        pageRepository.deleteAll();
        membershipRepository.deleteAll();
        workspaceRepository.deleteAll();
        userRepository.deleteAll();
        User user = userRepository.save(User.builder()
                .googleId(GOOGLE_ID).email("pd@test.com").name("PD유저").image("img").build());
        userId = user.getId();
        Workspace ws = workspaceRepository.save(Workspace.builder()
                .type(WorkspaceType.PERSONAL).ownerId(userId).name("내 워크스페이스").build());
        workspaceId = ws.getId();
        membershipRepository.save(Membership.builder()
                .userId(userId).workspaceId(workspaceId).role(MemberRole.OWNER).build());
        Page page = pageRepository.save(Page.builder()
                .workspaceId(workspaceId).title("문서제목").position(1000).createdById(userId).build());
        pageId = page.getId();
    }

    private static RequestPostProcessor asUser(String googleId) {
        return oauth2Login().attributes(a -> a.put("sub", googleId));
    }

    @Test
    @DisplayName("AC-1: 멤버 GET /api/pages/{id} → 200 + id/title/workspaceId")
    void member_getPage_returns200() throws Exception {
        mockMvc.perform(get("/api/pages/{pageId}", pageId).with(asUser(GOOGLE_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(pageId.toString()))
                .andExpect(jsonPath("$.title").value("문서제목"))
                .andExpect(jsonPath("$.workspaceId").value(workspaceId.toString()));
    }

    @Test
    @DisplayName("AC-2: 비멤버 GET → 403")
    void nonMember_getPage_returns403() throws Exception {
        userRepository.save(User.builder()
                .googleId("G-OTHER").email("other@test.com").name("외부인").image("img").build());
        mockMvc.perform(get("/api/pages/{pageId}", pageId).with(asUser("G-OTHER")))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("AC-3: 미인증 GET → 401")
    void unauthenticated_getPage_returns401() throws Exception {
        mockMvc.perform(get("/api/pages/{pageId}", pageId))
                .andExpect(status().isUnauthorized());
    }
}
