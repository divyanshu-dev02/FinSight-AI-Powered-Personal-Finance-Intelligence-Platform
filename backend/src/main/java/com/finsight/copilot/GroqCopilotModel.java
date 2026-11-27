package com.finsight.copilot;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicReference;
import java.util.Map;

@Service
@ConditionalOnProperty(name = "COPILOT_PROVIDER", havingValue = "groq")
class GroqCopilotModel implements CopilotModel {

    private static final URI ENDPOINT = URI.create("https://api.groq.com/openai/v1/responses");
    private final HttpClient client = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(4)).build();
    private final ObjectMapper json;
    private final String apiKey;
    private final String model;
    private final AtomicReference<Instant> retryAt = new AtomicReference<>(Instant.EPOCH);

    GroqCopilotModel(ObjectMapper json, @Value("${COPILOT_GROQ_API_KEY:}") String apiKey,
                     @Value("${COPILOT_GROQ_MODEL:qwen/qwen3.8-27b}") String model) {
        this.json = json;
        this.apiKey = apiKey;
        this.model = model;
    }

    @Override
    public boolean isAvailable() {
        return !apiKey.isBlank() && !model.isBlank();
    }

    @Override
    public String providerName() {
        return "Groq";
    }

    @Override
    public JsonNode respond(Map<String, Object> request) {
        if ("none".equals(request.get("tool_choice"))) {
            return send(payload(request, false));
        }
        JsonNode response = send(payload(request, true));
        return hasUsableOutput(response) ? response : send(payload(request, false));
    }

    private boolean hasUsableOutput(JsonNode response) {
        if (response == null) {
            return false;
        }
        for (JsonNode item : response.path("output")) {
            if ("function_call".equals(item.path("type").asText())) {
                return true;
            }
            for (JsonNode part : item.path("content")) {
                if ("refusal".equals(part.path("type").asText())
                        || ("output_text".equals(part.path("type").asText())
                            && CopilotReply.parse(json, part.path("text").asText()).isPresent())) {
                    return true;
                }
            }
        }
        return false;
    }

    ObjectNode payload(Map<String, Object> request, boolean withTools) {
        ObjectNode payload = json.valueToTree(request);
        payload.put("model", model);
        payload.remove("store");
        payload.remove("include");
        var input = json.createArrayNode();
        for (JsonNode item : payload.path("input")) {
            if (!"reasoning".equals(item.path("type").asText())) {
                input.add(item);
            }
        }
        payload.set("input", input);
        if (withTools) {
            payload.remove("text");
            payload.put("instructions", payload.path("instructions").asText()
                    + """

Call a tool if you need financial evidence. When you have enough evidence or don't need a tool,
                    return only a JSON object with a string "answer" and an array of string "sourceRefs".
                    Use an empty array when you did not use any sources. Keep the answer concise.
                    """);
        } else {
            payload.remove("tools");
            payload.remove("tool_choice");
            payload.remove("parallel_tool_calls");
            payload.put("instructions", payload.path("instructions").asText()
                    + "\nThis is your final response. Return the answer and sourceRefs as a JSON object.");
        }
        return payload;
    }

    JsonNode send(ObjectNode payload) {
        checkCooldown(Instant.now());
        try {
            var request = HttpRequest.newBuilder(ENDPOINT).timeout(Duration.ofSeconds(15))
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .header("User-Agent", "FinSight-Copilot/1.0")
                    .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(payload))).build();
            var response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                return json.readTree(response.body());
            }
            if (response.statusCode() == 429) {
                throw rateLimited(response.headers().firstValue("Retry-After").orElse(""), Instant.now());
            }
            if (response.statusCode() == 401 || response.statusCode() == 403) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                        "Groq rejected Copilot’s credentials or request. Check the backend configuration.");
            }
            throw unavailable();
        } catch (IOException exception) {
            throw unavailable();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw unavailable();
        }
    }

    void checkCooldown(Instant now) {
        Instant availableAt = retryAt.get();
        if (availableAt.isAfter(now)) {
            throw new GroqRateLimit(Duration.between(now, availableAt));
        }
    }

    ResponseStatusException rateLimited(String retryAfter, Instant now) {
        long seconds = 30;
        try {
            seconds = Math.max(1, Math.min(86_400, Long.parseLong(retryAfter.strip())));
        } catch (NumberFormatException ignored) {
            // Groq supplies a delay in seconds. Use a short pause if the header is missing.
        }
        Instant availableAt = retryAt.accumulateAndGet(now.plusSeconds(seconds),
                (current, requested) -> requested.isAfter(current) ? requested : current);
        return new GroqRateLimit(Duration.between(now, availableAt));
    }

    private static class GroqRateLimit extends ResponseStatusException {
        private final HttpHeaders headers = new HttpHeaders();

        GroqRateLimit(Duration delay) {
            super(HttpStatus.TOO_MANY_REQUESTS, "Copilot reached the Groq usage limit. Spending shortcuts are still available.");
            long seconds = delay.getSeconds() + (delay.getNano() == 0 ? 0 : 1);
            headers.set(HttpHeaders.RETRY_AFTER, Long.toString(seconds));
        }

        @Override
        public HttpHeaders getHeaders() {
            return headers;
        }
    }

    private static ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Copilot could not complete the request through Groq.");
    }
}
