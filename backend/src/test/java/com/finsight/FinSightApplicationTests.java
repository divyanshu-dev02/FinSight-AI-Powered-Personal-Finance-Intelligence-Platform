package com.finsight;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.testcontainers.containers.PostgreSQLContainer;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(FinSightApplicationTests.DatabaseConfiguration.class)
class FinSightApplicationTests {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper json;

    @Test
    void copilotTotalsAndEvidenceOnlyIncludeTheSignedInUsersExpenses() throws Exception {
        String owner = register("copilot-owner@example.test");
        String other = register("copilot-other@example.test");
        String inrAccount = account(owner, "INR");
        String usdAccount = account(owner, "USD");
        importExpense(owner, inrAccount);
        expense(owner, usdAccount, "USD", 10);
        expense(other, account(other, "INR"), "INR", 900);

        String spending = mvc.perform(get("/api/v1/copilot/spending?month=2026-11")
                        .header("Authorization", "Bearer " + owner))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.current.length()").value(2))
                .andExpect(jsonPath("$.data.current[0].currency").value("INR"))
                .andExpect(jsonPath("$.data.current[0].amount").value(500))
                .andExpect(jsonPath("$.data.current[1].amount").value(10))
                .andExpect(jsonPath("$.data.evidence.length()").value(2))
                .andReturn().getResponse().getContentAsString();

        String evidence = json.readTree(spending).path("data").path("evidence").get(0).path("id").asText();
        mvc.perform(get("/api/v1/transactions/" + evidence).header("Authorization", "Bearer " + owner))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.amount").value(500));

        mvc.perform(get("/api/v1/transactions/" + evidence).header("Authorization", "Bearer " + other))
                .andExpect(status().isNotFound());
    }

    private void importExpense(String token, String account) throws Exception {
        var file = new MockMultipartFile("file", "sample.csv", "text/csv", """
                Date,Description,Debit,Credit
                2026-11-06,Sample groceries,500,
                """.getBytes(StandardCharsets.UTF_8));
        String preview = mvc.perform(multipart("/api/v1/transactions/import/preview").file(file)
                        .param("accountId", account).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        var data = json.readTree(preview).path("data");
        var confirmation = Map.of("fileToken", data.path("fileToken").asText(),
                "accountId", account, "mapping", data.path("suggestedMapping"), "skipDuplicates", true);
        mvc.perform(post("/api/v1/transactions/import/confirm")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json").content(json.writeValueAsBytes(confirmation)))
                .andExpect(status().isOk());
    }

    private String register(String email) throws Exception {
        return create("/api/v1/auth/register", null,
                Map.of("email", email, "password", "integration-test-password", "displayName", "Test user"),
                "accessToken");
    }

    private String account(String token, String currency) throws Exception {
        return create("/api/v1/accounts", token,
                Map.of("name", currency + " Checking", "type", "BANK_ACCOUNT", "currency", currency), "id");
    }

    private String expense(String token, String account, String currency, int amount) throws Exception {
        return create("/api/v1/transactions", token,
                Map.of("accountId", account, "direction", "DEBIT", "currency", currency, "amount", amount,
                        "description", "Test expense", "transactionDate", "2026-11-05"), "id");
    }

    private String create(String path, String token, Map<String, ?> payload, String field) throws Exception {
        var request = post(path).contentType("application/json").content(json.writeValueAsBytes(payload));
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        String body = mvc.perform(request).andExpect(status().isCreated()).andReturn()
                .getResponse().getContentAsString();
        return json.readTree(body).path("data").path(field).asText();
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class DatabaseConfiguration {

        @Bean
        @ServiceConnection
        PostgreSQLContainer<?> postgres() {
            return new PostgreSQLContainer<>("postgres:16-alpine");
        }
    }

    @Test
    void contextLoads() {
    }
}

