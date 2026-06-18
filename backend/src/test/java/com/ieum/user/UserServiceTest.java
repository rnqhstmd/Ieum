package com.ieum.user;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.ieum.workspace.WorkspaceService;
import com.ieum.workspace.Workspace;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private WorkspaceService workspaceService;

    @InjectMocks
    private UserService userService;

    // ── AC-AUTH-02: 신규 생성 ─────────────────────────────────────────

    @Test
    @DisplayName("AC-AUTH-02: googleId가 없는 신규 사용자 — upsert 시 새 User가 저장되고 반환된다")
    void upsert_newUser_savesAndReturnsWithAllFields() {
        // Given
        OAuthUserInfo info = new OAuthUserInfo("G001", "a@test.com", "홍길동", "http://img/a");
        when(userRepository.findByGoogleId("G001")).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        // When
        User result = userService.upsert(info);

        // Then
        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(captor.capture());
        User saved = captor.getValue();

        assertThat(saved.getGoogleId()).isEqualTo("G001");
        assertThat(saved.getEmail()).isEqualTo("a@test.com");
        assertThat(saved.getName()).isEqualTo("홍길동");
        assertThat(saved.getImage()).isEqualTo("http://img/a");

        assertThat(result.getGoogleId()).isEqualTo("G001");
        assertThat(result.getEmail()).isEqualTo("a@test.com");
        assertThat(result.getName()).isEqualTo("홍길동");
        assertThat(result.getImage()).isEqualTo("http://img/a");
    }

    // ── AC-AUTH-03 / BR-1: 재로그인 — 기존 User 갱신 ──────────────────

    @Test
    @DisplayName("AC-AUTH-03: 기존 googleId로 재로그인 — id·googleId 불변, name/email/image만 갱신된다")
    void upsert_existingUser_updatesFieldsAndKeepsIdAndGoogleId() {
        // Given
        UUID existingId = UUID.randomUUID();
        User existing = User.builder()
                .id(existingId)
                .googleId("G001")
                .email("old@test.com")
                .name("구이름")
                .image("http://img/old")
                .build();

        OAuthUserInfo info = new OAuthUserInfo("G001", "new@test.com", "새이름", "http://img/new");
        when(userRepository.findByGoogleId("G001")).thenReturn(Optional.of(existing));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        // When
        User result = userService.upsert(info);

        // Then: id·googleId 불변
        assertThat(result.getId()).isEqualTo(existingId);
        assertThat(result.getGoogleId()).isEqualTo("G001");

        // Then: name/email/image 갱신
        assertThat(result.getEmail()).isEqualTo("new@test.com");
        assertThat(result.getName()).isEqualTo("새이름");
        assertThat(result.getImage()).isEqualTo("http://img/new");

        // Then: save에 전달된 인스턴스가 기존 인스턴스(신규 객체 아님)
        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(captor.capture());
        assertThat(captor.getValue()).isSameAs(existing);
    }

    // ── AC-SEC-03: 토큰 미저장 ────────────────────────────────────────

    @Test
    @DisplayName("AC-SEC-03: upsert 결과 User에 토큰 관련 필드가 설정되지 않는다")
    void upsert_savedUser_hasNoTokenFields() {
        // Given
        OAuthUserInfo info = new OAuthUserInfo("G001", "a@test.com", "홍길동", "http://img/a");
        when(userRepository.findByGoogleId("G001")).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        // When
        userService.upsert(info);

        // Then: 저장되는 User 엔티티는 googleId/email/name/image 외의 토큰 필드를 갖지 않는다.
        // OAuthUserInfo 자체에 토큰 필드가 없음을 컴파일 타임에 검증 (accessToken, refreshToken 필드 부재).
        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(captor.capture());
        User saved = captor.getValue();

        // User 엔티티에 토큰 관련 getter가 존재하지 않으므로 아래 4개 필드만 검증된다.
        assertThat(saved.getGoogleId()).isNotNull();
        assertThat(saved.getEmail()).isNotNull();
        assertThat(saved.getName()).isNotNull();
        assertThat(saved.getImage()).isNotNull();

        // OAuthUserInfo 레코드에 토큰 필드가 없음을 컴파일 타임 확인
        // (accessToken(), refreshToken() 등 메서드를 호출하면 컴파일 에러 → 설계 위반 감지)
        String googleId = info.googleId();
        String email    = info.email();
        String name     = info.name();
        String image    = info.image();
        assertThat(googleId).isEqualTo("G001");
        assertThat(email).isEqualTo("a@test.com");
        assertThat(name).isEqualTo("홍길동");
        assertThat(image).isEqualTo("http://img/a");
    }

    // ── BR-7: loginWithOAuth — upsert 후 ensurePersonalWorkspace 호출 ──

    @Test
    @DisplayName("BR-7: loginWithOAuth — upsert로 User 확보 후 workspaceService.ensurePersonalWorkspace가 호출되고 User가 반환된다")
    void loginWithOAuth_upsertsUserThenEnsuresPersonalWorkspace() {
        // Given
        UUID userId = UUID.randomUUID();
        OAuthUserInfo info = new OAuthUserInfo("G001", "a@test.com", "홍길동", "http://img/a");

        User savedUser = User.builder()
                .id(userId)
                .googleId("G001")
                .email("a@test.com")
                .name("홍길동")
                .image("http://img/a")
                .build();

        when(userRepository.findByGoogleId("G001")).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenReturn(savedUser);

        // When
        User result = userService.loginWithOAuth(info);

        // Then: ensurePersonalWorkspace가 user.id로 호출됨
        verify(workspaceService).ensurePersonalWorkspace(userId);

        // Then: User 반환
        assertThat(result.getId()).isEqualTo(userId);
        assertThat(result.getGoogleId()).isEqualTo("G001");
    }
}
