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

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * MEMBER 페이지 편집 권한 매트릭스 회귀 방지 테스트 (T7)
 *
 * AC-20: MEMBER가 페이지 생성 → 201
 * AC-21: MEMBER가 페이지 내용 편집 → 200, DB 저장
 * AC-22: 멤버십 없는 사용자가 페이지 접근 → 403
 *        (검증 엔드포인트: GET /api/workspaces/{wsId}/pages — requireWorkspaceMember 적용)
 */
@AutoConfigureMockMvc
class PageMemberRegressionIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private MembershipRepository membershipRepository;
    @Autowired private PageRepository pageRepository;

    private static final String OWNER_GOOGLE_ID  = "G-PMR-OWNER";
    private static final String MEMBER_GOOGLE_ID = "G-PMR-MEMBER";
    private static final String OUTSIDER_GOOGLE_ID = "G-PMR-OUTSIDER";

    private UUID workspaceId;
    private UUID ownerId;
    private UUID memberId;

    @BeforeEach
    void setUp() {
        // FK 순서: page → membership → workspace → user
        pageRepository.deleteAll();
        membershipRepository.deleteAll();
        workspaceRepository.deleteAll();
        userRepository.deleteAll();

        User owner = userRepository.save(User.builder()
                .googleId(OWNER_GOOGLE_ID).email("owner@pmr.com").name("OWNER유저").image("img").build());
        User member = userRepository.save(User.builder()
                .googleId(MEMBER_GOOGLE_ID).email("member@pmr.com").name("MEMBER유저").image("img").build());
        // 멤버십 없는 외부 사용자 (AC-22 전용)
        userRepository.save(User.builder()
                .googleId(OUTSIDER_GOOGLE_ID).email("outsider@pmr.com").name("외부인").image("img").build());

        ownerId  = owner.getId();
        memberId = member.getId();

        Workspace workspace = workspaceRepository.save(Workspace.builder()
                .name("회귀테스트팀").type(WorkspaceType.SHARED).ownerId(ownerId).build());
        workspaceId = workspace.getId();

        membershipRepository.save(Membership.builder()
                .userId(ownerId).workspaceId(workspaceId).role(MemberRole.OWNER).build());
        membershipRepository.save(Membership.builder()
                .userId(memberId).workspaceId(workspaceId).role(MemberRole.MEMBER).build());
        // OUTSIDER 는 멤버십 미생성 — AC-22의 "멤버십 없는 사용자" 상태를 픽스처로 구성
    }

    private static RequestPostProcessor asUser(String googleId) {
        return oauth2Login().attributes(a -> a.put("sub", googleId));
    }

    // ── AC-20: MEMBER가 페이지 생성 → 201, DB 생성 ────────────────────────

    @Test
    @DisplayName("AC-20: MEMBER B가 워크스페이스 W에 페이지 생성 → 201, DB에 페이지 존재")
    void member_createPage_returns201_andPageExistsInDb() throws Exception {
        mockMvc.perform(post("/api/workspaces/{wsId}/pages", workspaceId)
                        .with(asUser(MEMBER_GOOGLE_ID))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"parentPageId\":null,\"title\":\"MEMBER 생성 페이지\",\"icon\":null,\"position\":1000}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").exists())
                .andExpect(jsonPath("$.title").value("MEMBER 생성 페이지"));

        // DB 검증: 해당 워크스페이스에 페이지 1건 존재
        List<Page> pages = pageRepository.findAll().stream()
                .filter(p -> workspaceId.equals(p.getWorkspaceId()))
                .toList();
        assertThat(pages).hasSize(1);
        assertThat(pages.get(0).getTitle()).isEqualTo("MEMBER 생성 페이지");
    }

    // ── AC-21: MEMBER가 페이지 편집 → 200, DB 변경 ───────────────────────

    @Test
    @DisplayName("AC-21: MEMBER B가 페이지 P 제목 편집 → 200, DB에 변경된 제목 저장")
    void member_updatePage_returns200_andDbUpdated() throws Exception {
        // 사전 픽스처: OWNER가 페이지 생성 (DB 직접 저장)
        Page page = pageRepository.save(Page.builder()
                .workspaceId(workspaceId)
                .title("원래 제목")
                .position(1000)
                .createdById(ownerId)
                .build());

        mockMvc.perform(patch("/api/workspaces/{wsId}/pages/{pageId}", workspaceId, page.getId())
                        .with(asUser(MEMBER_GOOGLE_ID))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"MEMBER 수정 제목\",\"icon\":null}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("MEMBER 수정 제목"));

        // DB 검증: 변경된 제목 저장 확인
        Page updated = pageRepository.findById(page.getId()).orElseThrow();
        assertThat(updated.getTitle()).isEqualTo("MEMBER 수정 제목");
    }

    // ── AC-22: 멤버십 없는 사용자가 페이지 접근 → 403 ────────────────────
    //
    // 검증 엔드포인트: GET /api/workspaces/{wsId}/pages (트리 조회)
    // PageService.getPageTree()에 requireWorkspaceMember 적용됨.
    // 단건 GET 엔드포인트는 PageController에 존재하지 않으므로
    // requireWorkspaceMember를 강제하는 트리 조회 GET을 사용.

    @Test
    @DisplayName("AC-22: 멤버십이 없는 사용자가 워크스페이스 페이지 접근(GET 트리) → 403")
    void nonMember_accessPage_returns403() throws Exception {
        mockMvc.perform(get("/api/workspaces/{wsId}/pages", workspaceId)
                        .with(asUser(OUTSIDER_GOOGLE_ID)))
                .andExpect(status().isForbidden());
    }
}
