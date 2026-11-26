package com.finsight.copilot;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.http.HttpClient;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
class CopilotQuestionRouter {

    enum Intent { SPENDING, COMPARISON, EVIDENCE, UNSUPPORTED }

    private final RestClient client;
    private final ObjectMapper json;
    private final String apiKey;
    private final String model;
    private final Map<String, Instant> lastQuestion = new HashMap<>();

    CopilotQuestionRouter(RestClient.Builder builder, ObjectMapper json,
                          @Value("${COPILOT_OPENAI_API_KEY:}") String apiKey,
                          @Value("${COPILOT_OPENAI_MODEL:}") String model) {
        var transport = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).build();
        var requestFactory = new JdkClientHttpRequestFactory(transport);
        requestFactory.setReadTimeout(Duration.ofSeconds(12));
        this.client = builder.baseUrl("https://api.openai.com/v1").requestFactory(requestFactory).build();
        this.json = json;
        this.apiKey = apiKey;
        this.model = model;
    }

    boolean isAvailable() {
        return !apiKey.isBlank() && !model.isBlank();
    }

    Intent classify(String question, String user) {
        if (!isAvailable()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "AI questions are unavailable");
        }
        reserveRequest(user);
        var schema = Map.of("type", "object", "additionalProperties", false,
                "required", List.of("intent"), "properties", Map.of("intent",
                        Map.of("type", "string", "enum", List.of("SPENDING", "COMPARISON", "EVIDENCE", "UNSUPPORTED"))));
        var payload = Map.of("model", model, "store", false, "max_output_tokens", 256,
                "instructions", """
                        Classify the user's question for a finance dashboard. Respond with SPENDING for an
                        overall spending total, COMPARISON for comparing the selected month to the prior
                        month, or EVIDENCE for viewing recent expenses in the selected month.
                        Respond with UNSUPPORTED when the question requires another date range, an account,
                        category, merchant, forecasting, or any answer outside these capabilities.
                        """,
                "input", question, "text", Map.of("format", Map.of("type", "json_schema",
                        "name", "finance_intent", "strict", true, "schema", schema)));
        try {
            JsonNode response = client.post().uri("/responses")
                    .headers(headers -> headers.setBearerAuth(apiKey))
                    .body(payload).retrieve().body(JsonNode.class);
            if (response != null) {
                for (JsonNode item : response.path("output")) {
                    for (JsonNode part : item.path("content")) {
                        if ("output_text".equals(part.path("type").asText())) {
                            return Intent.valueOf(json.readTree(part.path("text").asText()).path("intent").asText());
                        }
                    }
                }
            }
        } catch (IOException | IllegalArgumentException | org.springframework.web.client.RestClientException exception) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "AI questions are temporarily unavailable");
        }
        return Intent.UNSUPPORTED;
    }
    private synchronized void reserveRequest(String user) {
        Instant now = Instant.now();
        lastQuestion.values().removeIf(expiry -> !expiry.isAfter(now));
        if (lastQuestion.containsKey(user) || lastQuestion.size() >= 1_000) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Please wait before asking again");
        }
        lastQuestion.put(user, now.plusSeconds(5));
    }

}
