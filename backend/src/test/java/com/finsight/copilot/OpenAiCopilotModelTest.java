package com.finsight.copilot;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class OpenAiCopilotModelTest {

    private final ObjectMapper json = new ObjectMapper();

    @Test
    void exhaustedCreditIsReportedWithoutExposingTheProviderMessage() {
        var response = json.valueToTree(Map.of("error", Map.of("code", "credit_balance_exhausted",
                "type", "insufficient_quota", "message", "provider-only detail")));

        var error = OpenAiCopilotModel.responseError(429, response);

        assertThat(error.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(error.getReason()).contains("out of API credits").doesNotContain("provider-only detail");
    }

    @Test
    void temporaryRateLimitsReturnRetryableStatus() {
        var response = json.valueToTree(Map.of("error", Map.of("code", "rate_limit_exceeded")));

        var error = OpenAiCopilotModel.responseError(429, response);

        assertThat(error.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(error.getReason()).contains("Try again shortly");
    }
}
