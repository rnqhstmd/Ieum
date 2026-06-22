package com.ieum.invitation;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith({MockitoExtension.class, OutputCaptureExtension.class})
class InvitationExpirySchedulerTest {

    @Mock
    private InvitationService invitationService;

    @InjectMocks
    private InvitationExpiryScheduler scheduler;

    @Test
    @DisplayName("SCHED-1: expireInvitations()는 InvitationService.expirePendingInvitations(Instant)를 정확히 1회 위임 호출한다")
    void expireInvitations_delegatesToService() {
        when(invitationService.expirePendingInvitations(any(Instant.class))).thenReturn(3);

        scheduler.expireInvitations();

        verify(invitationService, times(1)).expirePendingInvitations(any(Instant.class));
    }

    @Test
    @DisplayName("SCHED-2: expireInvitations()는 시작 로그와 완료 로그(전이 건수 포함)를 INFO 레벨로 출력한다")
    void expireInvitations_logsStartAndCompletion(CapturedOutput output) {
        when(invitationService.expirePendingInvitations(any(Instant.class))).thenReturn(2);

        scheduler.expireInvitations();

        assertThat(output.getOut()).contains("초대 만료 스케줄러 실행 시작");
        assertThat(output.getOut()).contains("전이 건수=2");
    }

    @Test
    @DisplayName("SCHED-3: 서비스 예외 시 expireInvitations()는 예외를 전파하지 않고 error 로그를 남긴다")
    void expireInvitations_serviceThrows_doesNotPropagate_logsError(CapturedOutput output) {
        when(invitationService.expirePendingInvitations(any(Instant.class)))
                .thenThrow(new RuntimeException("DB 장애"));

        assertThatCode(() -> scheduler.expireInvitations()).doesNotThrowAnyException();

        assertThat(output.getAll()).contains("초대 만료 스케줄러 실패");
    }
}
