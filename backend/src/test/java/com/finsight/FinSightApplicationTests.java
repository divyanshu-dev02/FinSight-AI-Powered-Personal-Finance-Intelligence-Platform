package com.finsight;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.finsight.copilot.CopilotModel;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.testcontainers.containers.PostgreSQLContainer;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
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

    @Autowired
    private JdbcClient jdbc;

    @Test
    void suspendedAccountsCannotSignInRefreshOrUseAnExistingAccessToken() throws Exception {
        String email = "suspended-session@example.test";
        String password = "integration-test-password";
        var response = mvc.perform(post("/api/v1/auth/register").contentType("application/json")
                        .content(json.writeValueAsBytes(Map.of("email", email, "password", password, "displayName", "Test user"))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        JsonNode tokens = json.readTree(response).path("data");
        jdbc.sql("UPDATE users SET account_status = 'SUSPENDED' WHERE email = :email").param("email", email).update();

        mvc.perform(post("/api/v1/auth/login").contentType("application/json")
                        .content(json.writeValueAsBytes(Map.of("email", email, "password", password))))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/refresh").contentType("application/json")
                        .content(json.writeValueAsBytes(Map.of("refreshToken", tokens.path("refreshToken").asText()))))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + tokens.path("accessToken").asText()))
                .andExpect(status().isForbidden());
    }

    @Test
    void legacyDemoIsDisabledWithoutLocalConfiguration() {
        String status = jdbc.sql("SELECT account_status FROM users WHERE email = :email")
                .param("email", "divyanshu@finsight.local").query(String.class).single();
        assertThat(status).isEqualTo("SUSPENDED");
    }

    @MockitoBean
    private CopilotModel copilotModel;

    @Test
    void conversationalCopilotLooksUpOnlyOwnerDataAndResolvesOnlyRealSources() throws Exception {
        String owner = register("agent-owner@example.test");
        String other = register("agent-other@example.test");
        String inr = account(owner, "INR");
        String usd = account(owner, "USD");
        String evidence = datedExpense(owner, inr, "INR", "Local market", 125, "2025-06-03");
        datedExpense(owner, usd, "USD", "Books", 40, "2025-06-02");
        datedExpense(other, account(other, "INR"), "INR", "Another user's merchant", 999, "2025-06-03");

        var history = List.of(Map.of("role", "user", "content", "Tell me about June."),
                Map.of("role", "assistant", "content", "Would you like to review spending?"));
        var payload = Map.of("question", "Yes, show my spending and the market charge.", "consent", true,
                "month", "2025-06", "history", history);
        mvc.perform(post("/api/v1/copilot/chat").header("Authorization", "Bearer " + owner)
                        .contentType("application/json").content(json.writeValueAsBytes(
                                Map.of("question", "Show my spending", "consent", false))))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(copilotModel);

        var filters = Map.of("start", "2025-06-01", "end", "2025-06-30",
                "direction", "DEBIT", "merchant", "", "category", "", "account", "");
        var round = new java.util.concurrent.atomic.AtomicInteger();
        when(copilotModel.isAvailable()).thenReturn(true);
        when(copilotModel.respond(anyMap())).thenAnswer(invocation -> {
            Map<String, Object> request = invocation.getArgument(0);
            assertThat(request.get("store")).isEqualTo(false);
            String input = json.writeValueAsString(request.get("input"));
            assertThat(input).contains("Tell me about June.", "Yes, show my spending", "Would you like to review spending?");
            if (round.getAndIncrement() == 0) {
                var args = new java.util.HashMap<String, String>(filters);
                args.put("groupBy", "NONE");
                return agentCall("analyze_transactions", "total_call", args);
            }
            assertThat(input).contains("function_call_output", "total_call", "125.0000", "40.0000");
            assertThat(input).doesNotContain("999.0000", "Another user's merchant", evidence);
            if (round.get() == 2) {
                var args = new java.util.HashMap<String, String>(filters);
                args.put("merchant", "Local market");
                args.put("sortBy", "RECENT");
                return agentCall("find_transactions", "evidence_call", args);
            }
            assertThat(input).contains("evidence_call", "Local market").doesNotContain(evidence);
            return json.valueToTree(Map.of("output", List.of(Map.of("type", "message", "content", List.of(Map.of(
                    "type", "output_text", "text", json.writeValueAsString(Map.of(
                            "answer", "You spent INR 125 and USD 40 in June. The market charge was INR 125.",
                            "sourceRefs", List.of("S1", "S2", "S999")))))))));
        });

        mvc.perform(post("/api/v1/copilot/chat").header("Authorization", "Bearer " + owner)
                        .contentType("application/json").content(json.writeValueAsBytes(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.answer").value("You spent INR 125 and USD 40 in June. The market charge was INR 125."))
                .andExpect(jsonPath("$.data.sources.length()").value(2))
                .andExpect(jsonPath("$.data.sources[1].path").value("/transactions?evidence=" + evidence));
    }

    @Test
    void copilotDoesNotSendAConversationWhenConsentNamesADifferentProvider() throws Exception {
        String owner = register("agent-provider-consent@example.test");
        when(copilotModel.providerName()).thenReturn("Groq");

        mvc.perform(get("/api/v1/copilot/status").header("Authorization", "Bearer " + owner))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.provider").value("Groq"));
        mvc.perform(post("/api/v1/copilot/chat").header("Authorization", "Bearer " + owner)
                        .contentType("application/json").content(json.writeValueAsBytes(Map.of(
                                "question", "Check this test", "consent", true, "provider", "OpenAI"))))
                .andExpect(status().isConflict());

        verify(copilotModel, never()).respond(anyMap());
    }

    private JsonNode agentCall(String name, String id, Map<String, String> arguments) throws Exception {
        return json.valueToTree(Map.of("output", List.of(Map.of("type", "function_call", "call_id", id,
                "name", name, "arguments", json.writeValueAsString(arguments)))));
    }

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

    @Test
    void briefComparesCurrenciesSeparatelyAndDismissesOnlyTheCurrentFinding() throws Exception {
        String owner = register("brief-owner@example.test");
        String other = register("brief-other@example.test");
        String inr = account(owner, "INR");
        String savings = create("/api/v1/accounts", owner,
                Map.of("name", "Savings", "type", "BANK_ACCOUNT", "currency", "INR"), "id");
        String usd = account(owner, "USD");
        datedExpense(owner, inr, "INR", "Broadband", 100, "2025-03-05");
        datedExpense(owner, inr, "INR", "Broadband", 100, "2025-04-05");
        String broadband = datedExpense(owner, inr, "INR", " broadband ", 125, "2025-05-05");
        datedExpense(owner, inr, "INR", "Streaming", 100, "2025-04-12");
        datedExpense(owner, inr, "INR", "Streaming", 100, "2025-05-12");
        datedExpense(owner, usd, "USD", "Books", 25, "2025-04-10");
        datedExpense(owner, usd, "USD", "Shop", 50, "2025-05-11");
        datedExpense(other, account(other, "INR"), "INR", "Private expense", 999, "2025-05-05");

        mvc.perform(post("/api/v1/transactions/transfer")
                        .header("Authorization", "Bearer " + owner).contentType("application/json")
                        .content(json.writeValueAsBytes(Map.of("sourceAccountId", inr, "destinationAccountId", savings,
                                "amount", 2_000, "transactionDate", "2025-05-06"))))
                .andExpect(status().isCreated());

        String path = "/api/v1/dashboard/brief?month=2025-05";
        String response = mvc.perform(get(path).header("Authorization", "Bearer " + owner))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.periods.currentEnd").value("2025-05-31"))
                .andExpect(jsonPath("$.data.findings.length()").value(3))
                .andExpect(jsonPath("$.data.findings[0].kind").value("SPENDING_CHANGE"))
                .andExpect(jsonPath("$.data.findings[0].currency").value("USD"))
                .andExpect(jsonPath("$.data.findings[0].previousAmount").value(25))
                .andExpect(jsonPath("$.data.findings[0].currentAmount").value(50))
                .andExpect(jsonPath("$.data.findings[1].kind").value("RECURRING_CANDIDATE"))
                .andExpect(jsonPath("$.data.findings[2].kind").value("RECURRING_INCREASE"))
                .andExpect(jsonPath("$.data.findings[2].evidence[0].id").value(broadband))
                .andReturn().getResponse().getContentAsString();
        String findingId = json.readTree(response).path("data").path("findings").get(0).path("id").asText();
        String dismissPath = "/api/v1/dashboard/brief/dismissals/" + findingId;

        mvc.perform(put(dismissPath).header("Authorization", "Bearer " + other)).andExpect(status().isNoContent());
        mvc.perform(get(path).header("Authorization", "Bearer " + owner))
                .andExpect(jsonPath("$.data.findings[0].id").value(findingId));
        mvc.perform(put(dismissPath).header("Authorization", "Bearer " + owner)).andExpect(status().isNoContent());
        mvc.perform(put(dismissPath).header("Authorization", "Bearer " + owner)).andExpect(status().isNoContent());
        mvc.perform(get(path).header("Authorization", "Bearer " + owner))
                .andExpect(jsonPath("$.data.findings.length()").value(2));

        datedExpense(owner, usd, "USD", "Shop", 25, "2025-05-20");
        String updated = mvc.perform(get(path).header("Authorization", "Bearer " + owner))
                .andExpect(jsonPath("$.data.findings[0].currentAmount").value(75))
                .andReturn().getResponse().getContentAsString();
        assertThat(json.readTree(updated).path("data").path("findings").get(0).path("id").asText())
                .isNotEqualTo(findingId);
    }

    private String datedExpense(String token, String accountId, String currency, String merchant,
                                int amount, String date) throws Exception {
        return create("/api/v1/transactions", token,
                Map.of("accountId", accountId, "direction", "DEBIT", "currency", currency,
                        "amount", amount, "description", merchant, "merchant", merchant, "transactionDate", date), "id");
    }

    @Test
    void statementReviewSkipsMatchesPersistsRulesAndReturnsTheSameBatchOnRetry() throws Exception {
        String token = register("statement-review@example.test");
        String other = register("another-statement-review@example.test");
        String account = account(token, "INR");
        String otherAccount = account(other, "INR");
        String existing = datedExpense(token, account, "INR", "Store", 50, "2025-06-01");
        var preview = preview(token, account, """
                Date,Description,Merchant,Debit,Credit
                2025-06-01, STORE ,Store,50.0000,
                2025-06-02,Supermarket groceries,LOCAL   MARKET,75,
                2025-06-02,Supermarket groceries,LOCAL   MARKET,75.00,
                invalid,Unparseable,,20,
                """);
        String previewToken = preview.path("fileToken").asText();
        var rows = preview.path("previewRows");
        assertThat(preview.path("duplicateRows").asInt()).isEqualTo(2);
        assertThat(rows.get(0).path("matchingTransactionId").asText()).isEqualTo(existing);
        assertThat(rows.get(1).path("suggestedCategoryName").asText()).isEqualTo("Groceries");
        assertThat(rows.get(2).path("duplicateReason").asText()).isEqualTo("IN_FILE");
        assertThat(rows.get(3).path("validationError").asText()).isNotBlank();

        mvc.perform(get("/api/v1/transactions/import/previews/" + previewToken + "/rows")
                        .header("Authorization", "Bearer " + other))
                .andExpect(status().isBadRequest());
        var review = Map.of("rowNumber", 2,
                "categoryId", "00000000-0000-0000-0000-000000000018", "saveRule", true);
        var payload = Map.of("fileToken", previewToken, "accountId", account, "skipDuplicates", true,
                "reviews", List.of(review));
        var first = confirm(token, payload);
        assertThat(first.path("successfulRows").asInt()).isEqualTo(1);
        assertThat(first.path("duplicateRows").asInt()).isEqualTo(2);
        assertThat(first.path("rejectionDetails").get(0).path("rowNumber").asInt()).isEqualTo(4);
        assertThat(confirm(token, payload).path("id").asText()).isEqualTo(first.path("id").asText());

        String later = """
                Date,Description,Merchant,Debit,Credit
                2025-06-03,Another supermarket trip,local market,90,
                """;
        var next = preview(token, account, later);
        assertThat(next.path("previewRows").get(0).path("suggestedCategoryName").asText()).isEqualTo("Shopping");
        assertThat(next.path("previewRows").get(0).path("savedRule").asBoolean()).isTrue();
        assertThat(preview(other, otherAccount, later).path("previewRows").get(0).path("savedRule").asBoolean()).isFalse();

        mvc.perform(get("/api/v1/transactions/imports").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1));

        confirm(token, Map.of("fileToken", next.path("fileToken").asText(), "accountId", account, "skipDuplicates", true));
        mvc.perform(get("/api/v1/transactions").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.content[0].categoryName").value("Shopping"));

        var override = preview(token, account, later.replace("2025-06-03", "2025-06-04"));
        confirm(token, Map.of("fileToken", override.path("fileToken").asText(), "accountId", account,
                "skipDuplicates", true, "reviews", List.of(Map.of("rowNumber", 1, "saveRule", false))));
        mvc.perform(get("/api/v1/transactions").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.content[0].categoryId").doesNotExist());
    }

    @Test
    void overlappingConcurrentStatementConfirmationsImportEachMatchingRowOnce() throws Exception {
        String token = register("concurrent-import@example.test");
        String account = account(token, "INR");
        String csv = """
                Date,Description,Debit,Credit
                2025-06-02,Groceries,75,
                """;
        var first = preview(token, account, csv);
        var second = preview(token, account, csv);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var one = executor.submit(() -> confirm(token, Map.of("accountId", account,
                    "fileToken", first.path("fileToken").asText(), "skipDuplicates", true)));
            var two = executor.submit(() -> confirm(token, Map.of("accountId", account,
                    "fileToken", second.path("fileToken").asText(), "skipDuplicates", true)));
            assertThat(List.of(one.get().path("successfulRows").asInt(), two.get().path("successfulRows").asInt()))
                    .containsExactlyInAnyOrder(0, 1);
        }
    }

    @Test
    void planningUsesPostedSpendingAndLinksEachTransactionToAtMostOneOccurrence() throws Exception {
        String owner = register("planning-owner@example.test");
        String other = register("planning-other@example.test");
        String inr = account(owner, "INR");
        String usd = account(owner, "USD");
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        String month = YearMonth.from(today).toString();
        String categoryId = "00000000-0000-0000-0000-000000000010";
        String posted = create("/api/v1/transactions", owner, Map.of(
                "accountId", inr, "categoryId", categoryId, "amount", 90, "currency", "INR",
                "direction", "DEBIT", "description", "Groceries", "transactionDate", today.toString()), "id");
        create("/api/v1/transactions", owner, Map.of(
                "accountId", usd, "categoryId", categoryId, "amount", 50, "currency", "USD",
                "direction", "DEBIT", "description", "USD groceries", "transactionDate", today.toString()), "id");

        var budget = Map.of("categoryId", categoryId, "month", month, "currency", "INR", "amount", 300);
        String budgetId = create("/api/v1/planning/budgets", owner, budget, null);
        mvc.perform(post("/api/v1/planning/budgets").header("Authorization", "Bearer " + owner)
                        .contentType("application/json").content(json.writeValueAsBytes(budget)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("DUPLICATE_BUDGET"));
        var updatedBudget = Map.of("categoryId", categoryId, "month", month, "currency", "INR", "amount", 250);
        mvc.perform(put("/api/v1/planning/budgets/" + budgetId).header("Authorization", "Bearer " + owner)
                        .contentType("application/json").content(json.writeValueAsBytes(updatedBudget)))
                .andExpect(status().isOk());
        mvc.perform(put("/api/v1/planning/budgets/" + budgetId).header("Authorization", "Bearer " + other)
                        .contentType("application/json").content(json.writeValueAsBytes(updatedBudget)))
                .andExpect(status().isNotFound());

        create("/api/v1/planning/goals", owner,
                Map.of("name", "Emergency fund", "currency", "INR", "targetAmount", 5000, "savedAmount", 1000), null);
        var bill = Map.of("name", "Weekly groceries", "accountId", inr, "direction", "DEBIT", "amount", 110,
                "frequency", "WEEKLY", "firstDate", today.toString(), "active", true);
        String commitmentId = create("/api/v1/planning/commitments", owner, bill, null);
        var editedBill = Map.of("name", "Weekly groceries", "accountId", inr, "direction", "DEBIT", "amount", 125,
                "frequency", "WEEKLY", "firstDate", today.toString(), "active", true);
        mvc.perform(put("/api/v1/planning/commitments/" + commitmentId).header("Authorization", "Bearer " + owner)
                        .contentType("application/json").content(json.writeValueAsBytes(editedBill)))
                .andExpect(status().isOk());
        String incomeId = create("/api/v1/planning/commitments", owner, Map.of(
                "name", "Payday", "accountId", inr, "direction", "CREDIT", "amount", 500,
                "frequency", "MONTHLY", "firstDate", today.plusDays(1).toString(), "active", true), null);
        assertThat(incomeId).isNotBlank();

        String overview = "/api/v1/planning?month=" + month;
        mvc.perform(get(overview).header("Authorization", "Bearer " + owner))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.budgets[0].amount").value(250))
                .andExpect(jsonPath("$.data.budgets[0].spent").value(90))
                .andExpect(jsonPath("$.data.goals[0].savedAmount").value(1000))
                .andExpect(jsonPath("$.data.occurrences[0].amount").value(125))
                .andExpect(jsonPath("$.data.occurrences[0].transactionId").doesNotExist())
                .andExpect(jsonPath("$.data.occurrences[1].direction").value("CREDIT"));

        String occurrence = "/api/v1/planning/commitments/" + commitmentId + "/occurrences/" + today;
        mvc.perform(get(occurrence + "/candidates").header("Authorization", "Bearer " + owner))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[0].id").value(posted));
        mvc.perform(get(occurrence + "/candidates").header("Authorization", "Bearer " + other))
                .andExpect(status().isNotFound());

        byte[] posting = json.writeValueAsBytes(Map.of("transactionId", posted));
        mvc.perform(put(occurrence + "/posting").header("Authorization", "Bearer " + owner)
                        .contentType("application/json").content(posting)).andExpect(status().isNoContent());
        mvc.perform(put(occurrence + "/posting").header("Authorization", "Bearer " + owner)
                        .contentType("application/json").content(posting)).andExpect(status().isNoContent());
        String followingWeek = "/api/v1/planning/commitments/" + commitmentId + "/occurrences/" + today.plusWeeks(1);
        mvc.perform(put(followingWeek + "/posting").header("Authorization", "Bearer " + owner)
                        .contentType("application/json").content(posting))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("POSTING_ALREADY_LINKED"));

        mvc.perform(get(overview).header("Authorization", "Bearer " + owner))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.occurrences[0].transactionId").value(posted))
                .andExpect(jsonPath("$.data.budgets[0].spent").value(90));
        mvc.perform(get(overview).header("Authorization", "Bearer " + other))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.budgets").isEmpty())
                .andExpect(jsonPath("$.data.goals").isEmpty()).andExpect(jsonPath("$.data.commitments").isEmpty());
    }

    private JsonNode preview(String token, String account, String csv) throws Exception {
        var file = new MockMultipartFile("file", "review.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8));
        String body = mvc.perform(multipart("/api/v1/transactions/import/preview").file(file).param("accountId", account)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(body).path("data");
    }

    private JsonNode confirm(String token, Map<String, ?> payload) throws Exception {
        String body = mvc.perform(post("/api/v1/transactions/import/confirm")
                        .header("Authorization", "Bearer " + token).contentType("application/json")
                        .content(json.writeValueAsBytes(payload)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(body).path("data");
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
        JsonNode data = json.readTree(body).path("data");
        return field == null ? data.asText() : data.path(field).asText();
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

