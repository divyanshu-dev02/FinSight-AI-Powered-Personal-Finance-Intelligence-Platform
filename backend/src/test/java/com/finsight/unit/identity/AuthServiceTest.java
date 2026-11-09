package com.finsight.unit.identity;

import com.finsight.common.exception.BusinessException;
import com.finsight.identity.dto.AuthResponse;
import com.finsight.identity.dto.LoginRequest;
import com.finsight.identity.dto.RegisterRequest;
import com.finsight.identity.entity.User;
import com.finsight.identity.repository.RefreshTokenRepository;
import com.finsight.identity.repository.UserRepository;
import com.finsight.identity.service.AuthService;
import com.finsight.security.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private RefreshTokenRepository refreshTokenRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtService jwtService;

    private AuthService authService;

    @BeforeEach
    void setUp() {
        authService = new AuthService(userRepository, refreshTokenRepository, passwordEncoder, jwtService, 2592000L);
    }

    @Test
    @DisplayName("Should successfully register a new user and return tokens")
    void shouldRegisterNewUser() {
        RegisterRequest request = new RegisterRequest("test@finsight.local", "Password123!", "Test User");

        when(userRepository.existsByEmail("test@finsight.local")).thenReturn(false);
        when(passwordEncoder.encode("Password123!")).thenReturn("hashed-pwd");
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(jwtService.generateAccessToken(any(), any(), any())).thenReturn("mock-access-token");
        when(jwtService.getAccessTtlSeconds()).thenReturn(900L);

        AuthResponse response = authService.register(request);

        assertThat(response).isNotNull();
        assertThat(response.accessToken()).isEqualTo("mock-access-token");
        assertThat(response.refreshToken()).isNotBlank();
        assertThat(response.user().email()).isEqualTo("test@finsight.local");

        verify(userRepository).save(any(User.class));
        verify(refreshTokenRepository).save(any());
    }

    @Test
    @DisplayName("Should fail registration when email already exists")
    void shouldRejectDuplicateEmail() {
        RegisterRequest request = new RegisterRequest("duplicate@finsight.local", "Password123!", "Existing User");
        when(userRepository.existsByEmail("duplicate@finsight.local")).thenReturn(true);

        assertThatThrownBy(() -> authService.register(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("already exists");

        verify(userRepository, never()).save(any());
    }

    @Test
    @DisplayName("Should login successfully with valid credentials")
    void shouldLoginWithValidCredentials() {
        LoginRequest request = new LoginRequest("test@finsight.local", "Password123!");
        User user = new User(UUID.randomUUID(), "test@finsight.local", "hashed-pwd", "Test User");

        when(userRepository.findByEmail("test@finsight.local")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("Password123!", "hashed-pwd")).thenReturn(true);
        when(jwtService.generateAccessToken(any(), any(), any())).thenReturn("mock-access-token");
        when(jwtService.getAccessTtlSeconds()).thenReturn(900L);

        AuthResponse response = authService.login(request);

        assertThat(response).isNotNull();
        assertThat(response.accessToken()).isEqualTo("mock-access-token");
        verify(userRepository).save(user);
    }

    @Test
    @DisplayName("Should reject login with invalid password")
    void shouldRejectInvalidPassword() {
        LoginRequest request = new LoginRequest("test@finsight.local", "WrongPassword");
        User user = new User(UUID.randomUUID(), "test@finsight.local", "hashed-pwd", "Test User");

        when(userRepository.findByEmail("test@finsight.local")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("WrongPassword", "hashed-pwd")).thenReturn(false);

        assertThatThrownBy(() -> authService.login(request))
                .isInstanceOf(BadCredentialsException.class);
    }
}

