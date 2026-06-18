package com.ieum.page;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * 페이지 엔티티 - 계층 구조 지원 (parentPageId 자기참조 UUID)
 */
@Entity
@Table(name = "pages")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Page {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID workspaceId;

    /** 최상위 페이지의 경우 null */
    private UUID parentPageId;

    @Column(nullable = false)
    private String title;

    /** 페이지 아이콘(이모지 등), 선택 */
    private String icon;

    @Column(nullable = false)
    private int position;

    @Column(nullable = false)
    private UUID createdById;

    /** 아카이브된 경우 설정, null이면 활성 상태 */
    private Instant archivedAt;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private Instant updatedAt;
}
