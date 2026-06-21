package com.ieum.user;

import com.ieum.support.AbstractIntegrationTest;
import com.ieum.page.PageRepository;
import com.ieum.workspace.MembershipRepository;
import com.ieum.workspace.WorkspaceRepository;
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

// WS-AUTH T1 / AC-1,2: GET /api/users/me — 웹 realtime가 trust-relay할 실 userId 노출.
@AutoConfigureMockMvc
class UserMeIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private MembershipRepository membershipRepository;
    @Autowired private PageRepository pageRepository;

    private static final String GOOGLE_ID = "G-ME";
    private UUID userId;

    @BeforeEach
    void setUp() {
        // FK 순서: page → membership → workspace → user
        pageRepository.deleteAll();
        membershipRepository.deleteAll();
        workspaceRepository.deleteAll();
        userRepository.deleteAll();
        User user = userRepository.save(User.builder()
                .googleId(GOOGLE_ID).email("me@test.com").name("미유저").image("img").build());
        userId = user.getId();
    }

    private static RequestPostProcessor asUser(String googleId) {
        return oauth2Login().attributes(a -> a.put("sub", googleId));
    }

    @Test
    @DisplayName("AC-1: 인증 GET /api/users/me → 200 + 내 id/email/name")
    void authenticated_me_returns200() throws Exception {
        mockMvc.perform(get("/api/users/me").with(asUser(GOOGLE_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(userId.toString()))
                .andExpect(jsonPath("$.email").value("me@test.com"))
                .andExpect(jsonPath("$.name").value("미유저"));
    }

    @Test
    @DisplayName("AC-2: 미인증 GET /api/users/me → 401")
    void unauthenticated_me_returns401() throws Exception {
        mockMvc.perform(get("/api/users/me"))
                .andExpect(status().isUnauthorized());
    }
}
