package com.ieum.support;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * 통합 테스트 베이스 — Testcontainers PostgreSQL 싱글톤.
 *
 * <p>컨테이너를 static 초기화 블록에서 1회 start하고 JUnit({@code @Testcontainers}/{@code @Container})이나
 * Spring({@code @ServiceConnection}) 생명주기에 결합하지 않는다. 이렇게 해야 여러 통합 테스트 클래스가
 * Spring 컨텍스트 캐시를 공유할 때 컨테이너가 클래스 사이에서 중지되어 "Connection refused"가 나는 문제를
 * 방지한다(싱글톤 컨테이너 패턴). 컨테이너는 JVM 종료 시 Testcontainers Ryuk가 정리한다.
 */
@SpringBootTest
@ActiveProfiles("test")
public abstract class AbstractIntegrationTest {

    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    static {
        POSTGRES.start();
    }

    @DynamicPropertySource
    static void datasourceProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }
}
