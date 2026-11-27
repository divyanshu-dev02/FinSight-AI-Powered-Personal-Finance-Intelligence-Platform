package com.finsight.copilot;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpHeaders;
import org.springframework.web.server.ResponseStatusException;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class GroqCopilotModelTest {

    private final GroqCopilotModel model = new GroqCopilotModel(new ObjectMapper(), "test-key", "test-model");

    private final Map<String, Object> request = Map.of(
            "store", false, "include", List.of("reasoning.encrypted_content"),
            "instructions", "Use only the tool output.",
            "tool_choice", "auto", "parallel_tool_calls", false, "tools", List.of(Map.of("name", "lookup")),
            "text", Map.of("format", Map.of("type", "json_schema")),
            "input", List.of(Map.of("role", "user", "content", "Check my synthetic account"),
                    Map.of("type", "reasoning"), Map.of("type", "function_call"),
                    Map.of("type", "function_call_output", "call_id", "synthetic", "output", "42")));

    @Test
    void sendsToolsSeparatelyFromTheFinalJsonSchema() {
        var lookup = model.payload(request, true);
        var answer = model.payload(request, false);

        assertThat(lookup.has("tools")).isTrue();
        assertThat(lookup.has("text")).isFalse();
        assertThat(answer.has("tools")).isFalse();
        assertThat(answer.has("parallel_tool_calls")).isFalse();
        assertThat(answer.path("text").path("format").path("type").asText()).isEqualTo("json_schema");
    }

    @Test
    void dropsUnsupportedFieldsWithoutDroppingToolResults() {
        var lookup = model.payload(request, true);

        assertThat(lookup.has("store")).isFalse();
        assertThat(lookup.has("include")).isFalse();
        assertThat(lookup.path("input")).hasSize(3);
        assertThat(lookup.path("input").get(2).path("type").asText()).isEqualTo("function_call_output");
    }
    @Test
    void acceptsAValidatedAnswerWithoutASecondProviderCall() {
        var groq = spy(model);
        var result = reply("```json\n{\"answer\":\"Total INR 42\",\"sourceRefs\":[\"S1\"]}\n```");
        doReturn(result).when(groq).send(any());

        assertThat(groq.respond(request)).isEqualTo(result);
        verify(groq, times(1)).send(any());
    }

    @Test
    void fallsBackToSchemaWhenTheFirstReplyIsUnusable() {
        var groq = spy(model);
        var valid = reply("{\"answer\":\"Total INR 42\",\"sourceRefs\":[\"S1\"]}");
        doReturn(reply("Total INR 42"), valid).when(groq).send(any());

        assertThat(groq.respond(request)).isEqualTo(valid);
        verify(groq, times(2)).send(any());
    }

    @Test
    void cooldownReportsTimeRemainingAndHonorsTheLongestDelay() {
        Instant now = Instant.parse("2026-11-27T00:00:00Z");
        assertThat(model.rateLimited("12", now).getHeaders().getFirst(HttpHeaders.RETRY_AFTER)).isEqualTo("12");
        assertThat(model.rateLimited("2", now.plusSeconds(1)).getHeaders().getFirst(HttpHeaders.RETRY_AFTER)).isEqualTo("11");

        assertThatThrownBy(() -> model.checkCooldown(now.plusSeconds(7)))
                .isInstanceOfSatisfying(ResponseStatusException.class, error ->
                        assertThat(error.getHeaders().getFirst(HttpHeaders.RETRY_AFTER)).isEqualTo("5"));
        model.checkCooldown(now.plusSeconds(12));
    }

    private JsonNode reply(String text) {
        return new ObjectMapper().valueToTree(Map.of("output", List.of(Map.of("type", "message",
                "content", List.of(Map.of("type", "output_text", "text", text))))));
    }

}
