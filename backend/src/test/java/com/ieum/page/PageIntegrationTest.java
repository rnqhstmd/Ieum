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
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.time.Instant;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class PageIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private MembershipRepository membershipRepository;
    @Autowired private PageRepository pageRepository;

    private static final String GOOGLE_ID = "G-PAGE";
    private UUID userId;
    private UUID workspaceId;

    @BeforeEach
    void setUp() {
        // FK 순서: page → membership → workspace → user
        pageRepository.deleteAll();
        membershipRepository.deleteAll();
        workspaceRepository.deleteAll();
        userRepository.deleteAll();

        User user = userRepository.save(User.builder()
                .googleId(GOOGLE_ID).email("page@test.com").name("페이지유저").image("img").build());
        userId = user.getId();
        Workspace ws = workspaceRepository.save(Workspace.builder()
                .type(WorkspaceType.PERSONAL).ownerId(userId).name("내 워크스페이스").build());
        workspaceId = ws.getId();
        membershipRepository.save(Membership.builder()
                .userId(userId).workspaceId(workspaceId).role(MemberRole.OWNER).build());
    }

    private static RequestPostProcessor asUser(String googleId) {
        return oauth2Login().attributes(a -> a.put("sub", googleId));
    }

    // ── AC-12: 미인증 → 401 ────────────────────────────────────────────
    @Test
    @DisplayName("AC-12: 미인증 GET /api/workspaces/{wsId}/pages — 401 JSON")
    void unauthenticated_getPages_returns401() throws Exception {
        mockMvc.perform(get("/api/workspaces/{wsId}/pages", workspaceId))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON));
    }

    // ── AC-1/AC-5 e2e: 멤버 생성 후 트리 조회 (컨트롤러 인증 배선 강제) ──
    @Test
    @DisplayName("AC-1/5 e2e: 멤버가 페이지 생성(201) 후 트리 조회 시 생성한 페이지가 포함된다")
    void member_createThenGetTree() throws Exception {
        mockMvc.perform(post("/api/workspaces/{wsId}/pages", workspaceId)
                        .with(asUser(GOOGLE_ID))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"parentPageId\":null,\"title\":\"회의록\",\"icon\":null,\"position\":1000}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").exists())
                .andExpect(jsonPath("$.title").value("회의록"));

        mockMvc.perform(get("/api/workspaces/{wsId}/pages", workspaceId)
                        .with(asUser(GOOGLE_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].title").value("회의록"));
    }

    // ── AC-6 e2e: 아카이브 페이지 제외 (실 DB) ─────────────────────────
    @Test
    @DisplayName("AC-6 e2e: 아카이브된 페이지는 트리 조회에서 제외된다")
    void getTree_excludesArchived() throws Exception {
        pageRepository.save(Page.builder()
                .workspaceId(workspaceId).title("활성").position(1000).createdById(userId).build());
        pageRepository.save(Page.builder()
                .workspaceId(workspaceId).title("아카이브").position(2000)
                .createdById(userId).archivedAt(Instant.now()).build());

        mockMvc.perform(get("/api/workspaces/{wsId}/pages", workspaceId)
                        .with(asUser(GOOGLE_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].title").value("활성"));
    }

    // ── AC-9 e2e: 비멤버 403 ───────────────────────────────────────────
    @Test
    @DisplayName("AC-9 e2e: 워크스페이스 비멤버가 트리 조회 시 403")
    void nonMember_getTree_returns403() throws Exception {
        userRepository.save(User.builder()
                .googleId("G-OTHER").email("other@test.com").name("외부인").image("img").build());

        mockMvc.perform(get("/api/workspaces/{wsId}/pages", workspaceId)
                        .with(asUser("G-OTHER")))
                .andExpect(status().isForbidden());
    }

    // ── AC-I1 e2e: 제목 변경 후 트리에 반영 ────────────────────────────
    @Test
    @DisplayName("AC-I1 e2e: 멤버가 PATCH로 제목 변경(200) 후 트리 조회 시 새 제목이 반영된다")
    void member_updateTitle_reflectedInTree() throws Exception {
        Page page = pageRepository.save(Page.builder()
                .workspaceId(workspaceId).title("원제목").position(1000).createdById(userId).build());

        mockMvc.perform(patch("/api/workspaces/{wsId}/pages/{pageId}", workspaceId, page.getId())
                        .with(asUser(GOOGLE_ID))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"수정됨\",\"icon\":null}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("수정됨"));

        mockMvc.perform(get("/api/workspaces/{wsId}/pages", workspaceId)
                        .with(asUser(GOOGLE_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].title").value("수정됨"));
    }

    // ── AC-I2 e2e: 아카이브 시 부모·자식 트리에서 제외 ─────────────────
    @Test
    @DisplayName("AC-I2 e2e: 멤버가 부모 페이지 DELETE(204) 시 부모·자식 모두 트리에서 제외된다")
    void member_archiveParent_excludesSubtree() throws Exception {
        Page parent = pageRepository.save(Page.builder()
                .workspaceId(workspaceId).title("부모").position(1000).createdById(userId).build());
        pageRepository.save(Page.builder()
                .workspaceId(workspaceId).parentPageId(parent.getId()).title("자식").position(1000).createdById(userId).build());

        mockMvc.perform(delete("/api/workspaces/{wsId}/pages/{pageId}", workspaceId, parent.getId())
                        .with(asUser(GOOGLE_ID)))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/workspaces/{wsId}/pages", workspaceId)
                        .with(asUser(GOOGLE_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // ── AC-I3 e2e: 비멤버 PATCH/DELETE → 403 ──────────────────────────
    @Test
    @DisplayName("AC-I3 e2e: 비멤버의 PATCH·DELETE는 403")
    void nonMember_updateOrArchive_returns403() throws Exception {
        userRepository.save(User.builder()
                .googleId("G-OTHER").email("other@test.com").name("외부인").image("img").build());
        Page page = pageRepository.save(Page.builder()
                .workspaceId(workspaceId).title("보호됨").position(1000).createdById(userId).build());

        mockMvc.perform(patch("/api/workspaces/{wsId}/pages/{pageId}", workspaceId, page.getId())
                        .with(asUser("G-OTHER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"해킹\",\"icon\":null}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(delete("/api/workspaces/{wsId}/pages/{pageId}", workspaceId, page.getId())
                        .with(asUser("G-OTHER")))
                .andExpect(status().isForbidden());
    }
}
