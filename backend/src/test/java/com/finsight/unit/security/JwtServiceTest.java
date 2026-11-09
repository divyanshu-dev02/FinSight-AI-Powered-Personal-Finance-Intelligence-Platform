package com.finsight.unit.security;

import com.finsight.security.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class JwtServiceTest {

    private JwtService jwtService;
    private static final String SECRET = "unit-test-secret-must-be-at-least-256-bits-long-for-hmac-sha256-signing";
    private static final long TTL_SECONDS = 900;

    @BeforeEach
    void setUp() {
        jwtService = new JwtService(SECRET, TTL_SECONDS);
    }

    @Test
    @DisplayName("Should generate valid JWT access token and extract claims correctly")
    void shouldGenerateAndValidateToken() {
        UUID userId = UUID.randomUUID();
        String email = "student@finsight.local";
        String displayName = "Student Developer";

        String token = jwtService.generateAccessToken(userId, email, displayName);

        assertThat(token).isNotBlank();
        assertThat(jwtService.validateToken(token)).isTrue();
        assertThat(jwtService.extractUserId(token)).isEqualTo(userId);
        assertThat(jwtService.extractEmail(token)).isEqualTo(email);
    }

    @Test
    @DisplayName("Should reject malformed or tampered token")
    void shouldRejectTamperedToken() {
        UUID userId = UUID.randomUUID();
        String token = jwtService.generateAccessToken(userId, "user@finsight.local", "User");
        String tamperedToken = token + "corrupted";

        assertThat(jwtService.validateToken(tamperedToken)).isFalse();
    }
}

