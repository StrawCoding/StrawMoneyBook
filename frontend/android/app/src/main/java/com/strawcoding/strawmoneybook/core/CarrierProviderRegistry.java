package com.strawcoding.strawmoneybook.core;

import com.strawcoding.strawmoneybook.CarrierAutomationException;
import com.strawcoding.strawmoneybook.providers.natgov.NatGovEInvoiceProvider;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/** Native carrier provider registry — initial scope: nat_gov_einvoice_tw only. */
public final class CarrierProviderRegistry {
    public static final String NAT_GOV_EINVOICE_TW = "nat_gov_einvoice_tw";

    private static final Map<String, CarrierProvider> PROVIDERS = new LinkedHashMap<>();

    static {
        register(new NatGovEInvoiceProvider());
    }

    private CarrierProviderRegistry() {}

    public static void register(CarrierProvider provider) {
        if (provider == null) return;
        String id = normalizeProviderId(provider.getProviderId());
        if (id.isEmpty()) return;
        PROVIDERS.put(id, provider);
    }

    public static CarrierProvider resolve(String providerId) throws CarrierAutomationException {
        String normalized = normalizeProviderId(providerId);
        if (normalized.isEmpty()) {
            normalized = NAT_GOV_EINVOICE_TW;
        }
        CarrierProvider provider = PROVIDERS.get(normalized);
        if (provider == null) {
            throw new CarrierAutomationException(
                "carrier_provider_unsupported",
                "Unsupported carrier provider: " + normalized
            );
        }
        return provider;
    }

    public static String getDefaultProviderId() {
        return NAT_GOV_EINVOICE_TW;
    }

    private static String normalizeProviderId(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
