package com.ieum.page;

import jakarta.persistence.*;
import lombok.*;

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

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    // 타임스탬프는 JPA 생명주기 콜백으로 직접 채운다 — Hibernate VM @CreationTimestamp는
    // flush(INSERT) 시점에 생성되어 save() 직후 반환 DTO의 createdAt이 null이 되는 문제가 있었다.
    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
