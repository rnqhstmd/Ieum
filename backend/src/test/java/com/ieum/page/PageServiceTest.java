package com.ieum.page;

import com.ieum.common.security.AccessGuard;
import com.ieum.page.dto.CreatePageRequest;
import com.ieum.page.dto.PageDto;
import com.ieum.page.dto.UpdatePageRequest;
import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import java.time.Instant;
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

    // ── AC-13: 빈 제목 허용(노션식 placeholder) ─────────────────────────
    @Test
    @DisplayName("AC-13: createPage — 미입력(null) 제목은 빈 문자열로 저장(거부하지 않음)")
    void createPage_blankTitle_savesEmpty() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        when(pageRepository.save(any(Page.class))).thenAnswer(inv -> {
            Page p = inv.getArgument(0);
            if (p.getId() == null) p.setId(UUID.randomUUID());
            return p;
        });

        PageDto result = pageService.createPage(userId, wsId,
                new CreatePageRequest(null, null, null, 0));

        ArgumentCaptor<Page> captor = ArgumentCaptor.forClass(Page.class);
        verify(pageRepository).save(captor.capture());
        assertThat(captor.getValue().getTitle()).isEmpty();
        assertThat(result.title()).isEmpty();
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

    // ── AC-8 보강(W1): 같은 position 동률 시 결정론적 정렬 ─────────────
    @Test
    @DisplayName("W1: getPageTree — 같은 position이면 createdAt 오름차순으로 결정론적 정렬된다")
    void getPageTree_samePosition_tieBreaksByCreatedAt() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        UUID older = UUID.randomUUID();
        UUID newer = UUID.randomUUID();
        Instant t1 = Instant.parse("2026-01-01T00:00:00Z");
        Instant t2 = Instant.parse("2026-01-02T00:00:00Z");
        // 리포지토리가 의도적으로 newer를 먼저 반환 — 서비스가 createdAt로 재정렬함을 입증
        when(pageRepository.findByWorkspaceIdAndArchivedAtIsNull(wsId)).thenReturn(List.of(
                Page.builder().id(newer).workspaceId(wsId).parentPageId(null).title("newer").position(1000).createdById(userId).createdAt(t2).build(),
                Page.builder().id(older).workspaceId(wsId).parentPageId(null).title("older").position(1000).createdById(userId).createdAt(t1).build()
        ));

        List<PageDto> tree = pageService.getPageTree(userId, wsId);

        assertThat(tree).extracting(PageDto::id).containsExactly(older, newer);
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

    // ── updatePage ─────────────────────────────────────────────────────

    @Test
    @DisplayName("AC-B1: updatePage — 제목을 변경하고 아이콘은 보존한다(부분 갱신)")
    void updatePage_changesTitle_preservesIcon() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        UUID pageId = UUID.randomUUID();
        Page page = Page.builder().id(pageId).workspaceId(wsId).title("T").icon("📄").position(0).createdById(userId).build();
        when(pageRepository.findById(pageId)).thenReturn(Optional.of(page));
        when(pageRepository.save(any(Page.class))).thenAnswer(inv -> inv.getArgument(0));

        PageDto result = pageService.updatePage(userId, wsId, pageId, new UpdatePageRequest("새제목", null));

        ArgumentCaptor<Page> captor = ArgumentCaptor.forClass(Page.class);
        verify(pageRepository).save(captor.capture());
        assertThat(captor.getValue().getTitle()).isEqualTo("새제목");
        assertThat(captor.getValue().getIcon()).isEqualTo("📄"); // 미전달 → 보존
        assertThat(result.title()).isEqualTo("새제목");
    }

    @Test
    @DisplayName("AC-B2: updatePage — 아이콘을 변경하고 제목은 보존한다")
    void updatePage_changesIcon_preservesTitle() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        UUID pageId = UUID.randomUUID();
        Page page = Page.builder().id(pageId).workspaceId(wsId).title("T").icon(null).position(0).createdById(userId).build();
        when(pageRepository.findById(pageId)).thenReturn(Optional.of(page));
        when(pageRepository.save(any(Page.class))).thenAnswer(inv -> inv.getArgument(0));

        pageService.updatePage(userId, wsId, pageId, new UpdatePageRequest(null, "🔥"));

        ArgumentCaptor<Page> captor = ArgumentCaptor.forClass(Page.class);
        verify(pageRepository).save(captor.capture());
        assertThat(captor.getValue().getIcon()).isEqualTo("🔥");
        assertThat(captor.getValue().getTitle()).isEqualTo("T"); // 미전달 → 보존
    }

    @Test
    @DisplayName("AC-B3: updatePage — 빈 제목도 반영한다(거부하지 않음)")
    void updatePage_blankTitle_savesEmpty() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        UUID pageId = UUID.randomUUID();
        Page page = Page.builder().id(pageId).workspaceId(wsId).title("T").position(0).createdById(userId).build();
        when(pageRepository.findById(pageId)).thenReturn(Optional.of(page));
        when(pageRepository.save(any(Page.class))).thenAnswer(inv -> inv.getArgument(0));

        PageDto result = pageService.updatePage(userId, wsId, pageId, new UpdatePageRequest("", null));

        assertThat(result.title()).isEmpty();
    }

    @Test
    @DisplayName("AC-B4: updatePage — 비멤버면 AccessDeniedException, 조회·저장 안 함")
    void updatePage_nonMember_throws() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        UUID pageId = UUID.randomUUID();
        when(accessGuard.requireWorkspaceMember(userId, wsId))
                .thenThrow(new AccessDeniedException("워크스페이스 멤버가 아닙니다."));

        assertThatThrownBy(() -> pageService.updatePage(userId, wsId, pageId, new UpdatePageRequest("x", null)))
                .isInstanceOf(AccessDeniedException.class);

        verify(pageRepository, never()).findById(any());
        verify(pageRepository, never()).save(any());
    }

    @Test
    @DisplayName("AC-B5: updatePage — 페이지가 없으면 EntityNotFoundException")
    void updatePage_notFound_throws() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        UUID pageId = UUID.randomUUID();
        when(pageRepository.findById(pageId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> pageService.updatePage(userId, wsId, pageId, new UpdatePageRequest("x", null)))
                .isInstanceOf(EntityNotFoundException.class);

        verify(pageRepository, never()).save(any());
    }

    @Test
    @DisplayName("AC-B12: updatePage — 아카이브된 페이지는 수정 불가(EntityNotFoundException), 저장 안 함")
    void updatePage_archivedPage_throws() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        UUID pageId = UUID.randomUUID();
        Page page = Page.builder().id(pageId).workspaceId(wsId).title("T").position(0)
                .createdById(userId).archivedAt(Instant.now()).build();
        when(pageRepository.findById(pageId)).thenReturn(Optional.of(page));

        assertThatThrownBy(() -> pageService.updatePage(userId, wsId, pageId, new UpdatePageRequest("x", null)))
                .isInstanceOf(EntityNotFoundException.class);

        verify(pageRepository, never()).save(any());
    }

    @Test
    @DisplayName("AC-B6: updatePage — 페이지가 다른 워크스페이스면 IllegalArgumentException, 저장 안 함")
    void updatePage_otherWorkspace_throws() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        UUID otherWsId = UUID.randomUUID();
        UUID pageId = UUID.randomUUID();
        Page page = Page.builder().id(pageId).workspaceId(otherWsId).title("T").position(0).createdById(userId).build();
        when(pageRepository.findById(pageId)).thenReturn(Optional.of(page));

        assertThatThrownBy(() -> pageService.updatePage(userId, wsId, pageId, new UpdatePageRequest("x", null)))
                .isInstanceOf(IllegalArgumentException.class);

        verify(pageRepository, never()).save(any());
    }

    // ── archivePage ────────────────────────────────────────────────────

    @Test
    @DisplayName("AC-B7: archivePage — 페이지를 soft delete(archivedAt 설정)한다")
    @SuppressWarnings("unchecked")
    void archivePage_softDeletes() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        UUID pageId = UUID.randomUUID();
        Page page = Page.builder().id(pageId).workspaceId(wsId).parentPageId(null).title("T").position(0).createdById(userId).build();
        when(pageRepository.findById(pageId)).thenReturn(Optional.of(page));
        when(pageRepository.findByWorkspaceIdAndArchivedAtIsNull(wsId)).thenReturn(List.of(page));

        pageService.archivePage(userId, wsId, pageId);

        ArgumentCaptor<List<Page>> captor = ArgumentCaptor.forClass(List.class);
        verify(pageRepository).saveAll(captor.capture());
        assertThat(captor.getValue()).hasSize(1);
        assertThat(captor.getValue()).allMatch(p -> p.getArchivedAt() != null);
    }

    @Test
    @DisplayName("AC-B8: archivePage — 부모 아카이브 시 하위(자식·손자)도 재귀 아카이브된다")
    @SuppressWarnings("unchecked")
    void archivePage_recursivelyArchivesDescendants() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        UUID p = UUID.randomUUID();
        UUID c = UUID.randomUUID();
        UUID g = UUID.randomUUID();
        Page parent = Page.builder().id(p).workspaceId(wsId).parentPageId(null).title("P").position(0).createdById(userId).build();
        Page child = Page.builder().id(c).workspaceId(wsId).parentPageId(p).title("C").position(0).createdById(userId).build();
        Page grand = Page.builder().id(g).workspaceId(wsId).parentPageId(c).title("G").position(0).createdById(userId).build();
        when(pageRepository.findById(p)).thenReturn(Optional.of(parent));
        when(pageRepository.findByWorkspaceIdAndArchivedAtIsNull(wsId)).thenReturn(List.of(parent, child, grand));

        pageService.archivePage(userId, wsId, p);

        ArgumentCaptor<List<Page>> captor = ArgumentCaptor.forClass(List.class);
        verify(pageRepository).saveAll(captor.capture());
        assertThat(captor.getValue()).hasSize(3);
        assertThat(captor.getValue()).allMatch(pg -> pg.getArchivedAt() != null);
        assertThat(captor.getValue()).extracting(Page::getId).containsExactlyInAnyOrder(p, c, g);
    }

    @Test
    @DisplayName("AC-B13: archivePage — 이미 아카이브된 페이지는 즉시 종료(추가 조회·저장 없음)")
    void archivePage_alreadyArchived_noOp() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        UUID pageId = UUID.randomUUID();
        Page page = Page.builder().id(pageId).workspaceId(wsId).title("T").position(0)
                .createdById(userId).archivedAt(Instant.now()).build();
        when(pageRepository.findById(pageId)).thenReturn(Optional.of(page));

        pageService.archivePage(userId, wsId, pageId);

        verify(pageRepository, never()).findByWorkspaceIdAndArchivedAtIsNull(any());
        verify(pageRepository, never()).saveAll(any());
    }

    @Test
    @DisplayName("AC-B9: archivePage — 비멤버면 AccessDeniedException, 저장 안 함")
    void archivePage_nonMember_throws() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        UUID pageId = UUID.randomUUID();
        when(accessGuard.requireWorkspaceMember(userId, wsId))
                .thenThrow(new AccessDeniedException("워크스페이스 멤버가 아닙니다."));

        assertThatThrownBy(() -> pageService.archivePage(userId, wsId, pageId))
                .isInstanceOf(AccessDeniedException.class);

        verify(pageRepository, never()).saveAll(any());
    }

    @Test
    @DisplayName("AC-B10: archivePage — 페이지가 없으면 EntityNotFoundException")
    void archivePage_notFound_throws() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        UUID pageId = UUID.randomUUID();
        when(pageRepository.findById(pageId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> pageService.archivePage(userId, wsId, pageId))
                .isInstanceOf(EntityNotFoundException.class);

        verify(pageRepository, never()).saveAll(any());
    }

    @Test
    @DisplayName("AC-B11: archivePage — 페이지가 다른 워크스페이스면 IllegalArgumentException, 저장 안 함")
    void archivePage_otherWorkspace_throws() {
        UUID userId = UUID.randomUUID();
        UUID wsId = UUID.randomUUID();
        UUID otherWsId = UUID.randomUUID();
        UUID pageId = UUID.randomUUID();
        Page page = Page.builder().id(pageId).workspaceId(otherWsId).title("T").position(0).createdById(userId).build();
        when(pageRepository.findById(pageId)).thenReturn(Optional.of(page));

        assertThatThrownBy(() -> pageService.archivePage(userId, wsId, pageId))
                .isInstanceOf(IllegalArgumentException.class);

        verify(pageRepository, never()).saveAll(any());
    }
}
