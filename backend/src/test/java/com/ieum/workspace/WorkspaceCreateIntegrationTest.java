package com.ieum.workspace;

import com.ieum.page.PageRepository;
import com.ieum.support.AbstractIntegrationTest;
import com.ieum.user.User;
import com.ieum.user.UserRepository;
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

// US-WS-02 / 슬라이스 ①: POST /api/workspaces — 공유 워크스페이스 생성(생성자 OWNER) REST 통합.
@AutoConfigureMockMvc
class WorkspaceCreateIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private MembershipRepository membershipRepository;
    @Autowired private PageRepository pageRepository;

    private static final String GOOGLE_ID = "G-WSC";
    private UUID userId;

    @BeforeEach
    void setUp() {
        // FK 순서: page → membership → workspace → user
        pageRepository.deleteAll();
        membershipRepository.deleteAll();
        workspaceRepository.deleteAll();
        userRepository.deleteAll();
        User user = userRepository.save(User.builder()
                .googleId(GOOGLE_ID).email("wsc@test.com").name("WSC유저").image("img").build());
        userId = user.getId();
    }

    private static RequestPostProcessor asUser(String googleId) {
        return oauth2Login().attributes(a -> a.put("sub", googleId));
    }

    // ObjectMapper 빈이 이 컨텍스트에 없으므로 JSON 본문을 직접 구성한다(테스트 이름은 특수문자 없음).
    private static String body(String name) {
        return "{\"name\":\"" + name + "\"}";
    }

    @Test
    @DisplayName("AC-4: 인증 사용자 POST /api/workspaces 유효 이름 → 201 + SHARED·ownerId + OWNER 멤버십 1건")
    void member_create_returns201_andOwnerMembership() throws Exception {
        mockMvc.perform(post("/api/workspaces").with(asUser(GOOGLE_ID))
                        .contentType(MediaType.APPLICATION_JSON).content(body("팀")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.type").value("SHARED"))
                .andExpect(jsonPath("$.ownerId").value(userId.toString()))
                .andExpect(jsonPath("$.name").value("팀"));

        // OWNER 멤버십이 DB에 정확히 1건 생성되고, 대상 워크스페이스는 SHARED·ownerId=나
        List<Membership> memberships = membershipRepository.findByUserId(userId);
        assertThat(memberships).hasSize(1);
        Membership m = memberships.get(0);
        assertThat(m.getRole()).isEqualTo(MemberRole.OWNER);
        Workspace ws = workspaceRepository.findById(m.getWorkspaceId()).orElseThrow();
        assertThat(ws.getType()).isEqualTo(WorkspaceType.SHARED);
        assertThat(ws.getOwnerId()).isEqualTo(userId);
    }

    @Test
    @DisplayName("AC-5: 빈 이름 POST → 400 INVALID_ARGUMENT")
    void invalidName_returns400() throws Exception {
        mockMvc.perform(post("/api/workspaces").with(asUser(GOOGLE_ID))
                        .contentType(MediaType.APPLICATION_JSON).content(body("")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_ARGUMENT"));
    }

    @Test
    @DisplayName("AC-6: 미인증 POST → 401, 워크스페이스 미생성")
    void unauthenticated_returns401_andNoWorkspace() throws Exception {
        long before = workspaceRepository.count();
        mockMvc.perform(post("/api/workspaces")
                        .contentType(MediaType.APPLICATION_JSON).content(body("팀")))
                .andExpect(status().isUnauthorized());
        assertThat(workspaceRepository.count()).isEqualTo(before);
    }
}
