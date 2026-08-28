package com.strawcoding.strawmoneybook.core;

/**
 * Centralized portal URLs and selectors for nat_gov_einvoice_tw provider.
 */
public final class CarrierPortalConfig {
    public static final String LOGIN_URL = "https://www.einvoice.nat.gov.tw/accounts/login/mw";
    public static final String QUERY_URL = "https://www.einvoice.nat.gov.tw/";
    public static final String CAPTCHA_API_URL =
        "https://service-mc.einvoice.nat.gov.tw/act/login/api/act002i/captcha";
    public static final String PROVIDER_ID = "nat_gov_einvoice_tw";
    public static final String SELECTOR_PHONE = "#mobile_phone";
    public static final String SELECTOR_PASSWORD = "#password";
    public static final String SELECTOR_CAPTCHA = "#captcha";
    public static final String SELECTOR_LOGIN_BUTTON = "#submitBtn";

    private CarrierPortalConfig() {}
}
