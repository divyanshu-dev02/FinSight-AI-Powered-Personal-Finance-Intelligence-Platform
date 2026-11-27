package com.finsight.identity.controller;

import com.finsight.identity.service.AuthService;
import com.finsight.identity.dto.AuthResponse;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class DemoLoginTest {

    @Test
    void rejectsPublicRequestsEvenWhenFlagIsSet() {
        var auth = mock(AuthService.class);
        var environment = new MockEnvironment();

        var request = new MockHttpServletRequest();
        request.setRemoteAddr("127.0.0.1");
        assertThat(new AuthController(auth, null, environment, true).demoLogin(request).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);

        environment.setActiveProfiles("local");
        request.setRemoteAddr("192.0.2.35");
        assertThat(new AuthController(auth, null, environment, true).demoLogin(request).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        verifyNoInteractions(auth);
    }

    @Test
    void startsTheLocalDemoSessionWhenOptedIn() {
        var auth = mock(AuthService.class);
        var environment = new MockEnvironment();
        environment.setActiveProfiles("local");
        var request = new MockHttpServletRequest();
        request.setRemoteAddr("::1");
        var session = new AuthResponse("demo-token", "demo-refresh", 900, null);
        when(auth.demoLogin(false)).thenReturn(Optional.of(session));

        var response = new AuthController(auth, null, environment, true).demoLogin(request);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().data()).isEqualTo(session);
    }

    @Test
    void startsHostedDemoOnlyWhenOptedIn() {
        var auth = mock(AuthService.class);
        var environment = new MockEnvironment();
        environment.setActiveProfiles("hosted-demo");
        var request = new MockHttpServletRequest();
        request.setRemoteAddr("192.0.2.35");
        var session = new AuthResponse("demo-token", "demo-refresh", 900, null);

        assertThat(new AuthController(auth, null, environment, false).demoLogin(request).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        verifyNoInteractions(auth);

        when(auth.demoLogin(true)).thenReturn(Optional.of(session));
        assertThat(new AuthController(auth, null, environment, true).demoLogin(request).getBody().data())
                .isEqualTo(session);
    }
}
