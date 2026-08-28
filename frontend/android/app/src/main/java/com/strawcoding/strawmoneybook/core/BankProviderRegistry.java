package com.strawcoding.strawmoneybook.core;

import com.strawcoding.strawmoneybook.BankAutomationException;
import com.strawcoding.strawmoneybook.providers.huanan.HuaNanBankProvider;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/** Native provider registry — initial scope: hua_nan_bank_tw only. */
public final class BankProviderRegistry {
    public static final String HUA_NAN_BANK_TW = "hua_nan_bank_tw";

    private static final Map<String, BankProvider> PROVIDERS = new LinkedHashMap<>();

    static {
        register(new HuaNanBankProvider());
    }

    private BankProviderRegistry() {}

    public static void register(BankProvider provider) {
        if (provider == null) return;
        String id = normalizeProviderId(provider.getProviderId());
        if (id.isEmpty()) return;
        PROVIDERS.put(id, provider);
    }

    public static BankProvider resolve(String providerId) throws BankAutomationException {
        String normalized = normalizeProviderId(providerId);
        if (normalized.isEmpty()) {
            normalized = HUA_NAN_BANK_TW;
        }
        BankProvider provider = PROVIDERS.get(normalized);
        if (provider == null) {
            throw new BankAutomationException("bank_provider_unsupported", "Unsupported bank provider: " + normalized);
        }
        return provider;
    }

    public static String getDefaultProviderId() {
        return HUA_NAN_BANK_TW;
    }

    private static String normalizeProviderId(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
