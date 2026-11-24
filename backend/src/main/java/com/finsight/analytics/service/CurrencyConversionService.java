package com.finsight.analytics.service;

import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;

/**
 * Provides multi-currency conversion to normalize financial accounts and transactions
 * into the user's base currency (e.g. INR, USD, EUR) for accurate net worth and dashboard totals.
 */
@Service
public class CurrencyConversionService {

    // Exchange rates normalized against USD (1 USD = X Currency)
    private static final Map<String, BigDecimal> RATES_TO_USD = Map.of(
            "USD", new BigDecimal("1.00"),
            "INR", new BigDecimal("86.50"),
            "EUR", new BigDecimal("0.95"),
            "GBP", new BigDecimal("0.79"),
            "CAD", new BigDecimal("1.41"),
            "AUD", new BigDecimal("1.55"),
            "JPY", new BigDecimal("154.00"),
            "SGD", new BigDecimal("1.35"),
            "AED", new BigDecimal("3.67"),
            "CHF", new BigDecimal("0.90")
    );

    /**
     * Converts an amount from one currency to another using high-precision BigDecimal arithmetic.
     *
     * @param amount the money amount
     * @param fromCurrency 3-letter currency code (e.g. USD)
     * @param toCurrency 3-letter target currency code (e.g. INR)
     * @return converted amount scaled to 4 decimal places
     */
    public BigDecimal convert(BigDecimal amount, String fromCurrency, String toCurrency) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO.setScale(4, RoundingMode.HALF_UP);
        }

        if (fromCurrency == null || toCurrency == null || fromCurrency.equalsIgnoreCase(toCurrency)) {
            return amount.setScale(4, RoundingMode.HALF_UP);
        }

        String from = fromCurrency.trim().toUpperCase();
        String to = toCurrency.trim().toUpperCase();

        BigDecimal fromRate = RATES_TO_USD.getOrDefault(from, BigDecimal.ONE);
        BigDecimal toRate = RATES_TO_USD.getOrDefault(to, BigDecimal.ONE);

        // Convert from source -> USD -> target
        // amountInUSD = amount / fromRate
        // amountInTarget = amountInUSD * toRate
        BigDecimal amountInUsd = amount.divide(fromRate, 8, RoundingMode.HALF_UP);
        return amountInUsd.multiply(toRate).setScale(4, RoundingMode.HALF_UP);
    }
}
