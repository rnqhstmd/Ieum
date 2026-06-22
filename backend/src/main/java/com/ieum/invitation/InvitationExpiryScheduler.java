package com.ieum.invitation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;

@Slf4j
@Component
@RequiredArgsConstructor
public class InvitationExpiryScheduler {

    private final InvitationService invitationService;

    @Scheduled(cron = "${app.invitation.expiry-cron}")
    public void expireInvitations() {
        log.info("초대 만료 스케줄러 실행 시작");
        try {
            int expired = invitationService.expirePendingInvitations(Instant.now());
            log.info("초대 만료 스케줄러 완료 — 전이 건수={}", expired);
        } catch (Exception e) {
            log.error("초대 만료 스케줄러 실패", e);
        }
    }
}
