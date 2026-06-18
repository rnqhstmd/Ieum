package com.ieum.page;

import com.ieum.common.security.AccessGuard;
import com.ieum.page.dto.CreatePageRequest;
import com.ieum.page.dto.PageDto;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PageServiceTest {

    @Mock
    private PageRepository pageRepository;

    @Mock
    private AccessGuard accessGuard;

    @InjectMocks
    private PageService pageService;

    // ── AC-1: 최상위 페이지 생성 ───────────────────────────────────────
    @Test
    @DisplayName("AC-1: createPage — 최상위 페이지를 저장하고 PageDto를 반환한다(parentPageId=null, createdById=현재사용자)")
    void createPage_topLevel_savesPage() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        when(pageRepository.save(any(Page.class))).thenAnswer(inv -> {
            Page p = inv.getArgument(0);
            if (p.getId() == null) p.setId(UUID.randomUUID());
            return p;
        });

        PageDto result = pageService.createPage(userId, wsId,
                new CreatePageRequest(null, "회의록", null, 0));

        ArgumentCaptor<Page> captor = ArgumentCaptor.forClass(Page.class);
        verify(pageRepository).save(captor.capture());
        Page saved = captor.getValue();
        assertThat(saved.getParentPageId()).isNull();
        assertThat(saved.getWorkspaceId()).isEqualTo(wsId);
        assertThat(saved.getCreatedById()).isEqualTo(userId);
        assertThat(saved.getTitle()).isEqualTo("회의록");

        assertThat(result.id()).isNotNull();
        assertThat(result.parentPageId()).isNull();
        assertThat(result.children()).isNull();
    }

    // ── AC-2: 하위 페이지 생성 ─────────────────────────────────────────
    @Test
    @DisplayName("AC-2: createPage — 부모가 동일 워크스페이스면 하위 페이지를 생성한다(parentPageId 설정)")
    void createPage_child_savesWithParent() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        UUID parentId = UUID.randomUUID();
        when(pageRepository.findById(parentId)).thenReturn(Optional.of(
                Page.builder().id(parentId).workspaceId(wsId).title("부모").position(0).createdById(userId).build()));
        when(pageRepository.save(any(Page.class))).thenAnswer(inv -> {
            Page p = inv.getArgument(0);
            if (p.getId() == null) p.setId(UUID.randomUUID());
            return p;
        });

        PageDto result = pageService.createPage(userId, wsId,
                new CreatePageRequest(parentId, "안건", null, 0));

        assertThat(result.parentPageId()).isEqualTo(parentId);
        assertThat(result.workspaceId()).isEqualTo(wsId);
    }

    // ── AC-3: 다른 워크스페이스 부모 거부 ──────────────────────────────
    @Test
    @DisplayName("AC-3: createPage — 부모가 다른 워크스페이스면 IllegalArgumentException, 저장 안 함")
    void createPage_parentInOtherWorkspace_throws() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        UUID otherWsId = UUID.randomUUID();
        UUID parentId = UUID.randomUUID();
        when(pageRepository.findById(parentId)).thenReturn(Optional.of(
                Page.builder().id(parentId).workspaceId(otherWsId).title("남의부모").position(0).createdById(userId).build()));

        assertThatThrownBy(() -> pageService.createPage(userId, wsId,
                new CreatePageRequest(parentId, "x", null, 0)))
                .isInstanceOf(IllegalArgumentException.class);

        verify(pageRepository, never()).save(any());
    }

    // ── AC-4: 비멤버 생성 거부 ─────────────────────────────────────────
    @Test
    @DisplayName("AC-4: createPage — 비멤버면 AccessDeniedException(403), 저장 안 함")
    void createPage_nonMember_throws() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        when(accessGuard.requireWorkspaceMember(userId, wsId))
                .thenThrow(new AccessDeniedException("워크스페이스 멤버가 아닙니다."));

        assertThatThrownBy(() -> pageService.createPage(userId, wsId,
                new CreatePageRequest(null, "x", null, 0)))
                .isInstanceOf(AccessDeniedException.class);

        verify(pageRepository, never()).save(any());
    }

    // ── AC-13: 빈 제목 거부 ────────────────────────────────────────────
    @Test
    @DisplayName("AC-13: createPage — 제목이 공백뿐이면 IllegalArgumentException(400), 저장 안 함")
    void createPage_blankTitle_throws() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();

        assertThatThrownBy(() -> pageService.createPage(userId, wsId,
                new CreatePageRequest(null, "   ", null, 0)))
                .isInstanceOf(IllegalArgumentException.class);

        verify(pageRepository, never()).save(any());
    }

    // ── AC-5: 트리 조립 (부모-자식) ────────────────────────────────────
    @Test
    @DisplayName("AC-5: getPageTree — A(top), B(parent=A), C(parent=A)면 최상위 1건 A, A.children 2건")
    void getPageTree_buildsParentChild() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        UUID c = UUID.randomUUID();
        when(pageRepository.findByWorkspaceIdAndArchivedAtIsNull(wsId)).thenReturn(List.of(
                Page.builder().id(a).workspaceId(wsId).parentPageId(null).title("A").position(1000).createdById(userId).build(),
                Page.builder().id(b).workspaceId(wsId).parentPageId(a).title("B").position(1000).createdById(userId).build(),
                Page.builder().id(c).workspaceId(wsId).parentPageId(a).title("C").position(2000).createdById(userId).build()
        ));

        List<PageDto> tree = pageService.getPageTree(userId, wsId);

        assertThat(tree).hasSize(1);
        assertThat(tree.get(0).id()).isEqualTo(a);
        assertThat(tree.get(0).children()).extracting(PageDto::id).containsExactly(b, c);
    }

    // ── AC-7: 빈 워크스페이스 ──────────────────────────────────────────
    @Test
    @DisplayName("AC-7: getPageTree — 페이지 0건이면 빈 리스트 반환")
    void getPageTree_empty_returnsEmpty() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        when(pageRepository.findByWorkspaceIdAndArchivedAtIsNull(wsId)).thenReturn(List.of());

        assertThat(pageService.getPageTree(userId, wsId)).isEmpty();
    }

    // ── AC-8: 같은 레벨 position 오름차순 정렬 ─────────────────────────
    @Test
    @DisplayName("AC-8: getPageTree — 같은 레벨은 position 오름차순으로 정렬된다")
    void getPageTree_sortsByPositionAsc() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        UUID p1 = UUID.randomUUID();
        UUID p2 = UUID.randomUUID();
        UUID p3 = UUID.randomUUID();
        when(pageRepository.findByWorkspaceIdAndArchivedAtIsNull(wsId)).thenReturn(List.of(
                Page.builder().id(p1).workspaceId(wsId).parentPageId(null).title("2000").position(2000).createdById(userId).build(),
                Page.builder().id(p2).workspaceId(wsId).parentPageId(null).title("1000").position(1000).createdById(userId).build(),
                Page.builder().id(p3).workspaceId(wsId).parentPageId(null).title("3000").position(3000).createdById(userId).build()
        ));

        List<PageDto> tree = pageService.getPageTree(userId, wsId);

        assertThat(tree).extracting(PageDto::position).containsExactly(1000, 2000, 3000);
    }

    // ── AC-9: 비멤버 트리 조회 거부 ────────────────────────────────────
    @Test
    @DisplayName("AC-9: getPageTree — 비멤버면 AccessDeniedException(403)")
    void getPageTree_nonMember_throws() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        when(accessGuard.requireWorkspaceMember(userId, wsId))
                .thenThrow(new AccessDeniedException("워크스페이스 멤버가 아닙니다."));

        assertThatThrownBy(() -> pageService.getPageTree(userId, wsId))
                .isInstanceOf(AccessDeniedException.class);

        verify(pageRepository, never()).findByWorkspaceIdAndArchivedAtIsNull(any());
    }
}
