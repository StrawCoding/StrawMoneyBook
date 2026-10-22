package com.strawcoding.strawmoneybook.providers.huanan;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

public class HuaNanBankAutomationParseTest {
    private static final ZoneId TAIPEI = ZoneId.of("Asia/Taipei");

    @Test
    public void parsePostedAtIsoConvertsRocYearToGregorian() {
        String iso = HuaNanBankAutomation.parsePostedAtIso("115/08/15");
        LocalDate date = Instant.parse(iso).atZone(TAIPEI).toLocalDate();
        assertEquals(LocalDate.of(2026, 8, 15), date);
    }

    @Test
    public void parsePostedAtIsoKeepsGregorianYear() {
        String iso = HuaNanBankAutomation.parsePostedAtIso("2026/08/15");
        LocalDate date = Instant.parse(iso).atZone(TAIPEI).toLocalDate();
        assertEquals(LocalDate.of(2026, 8, 15), date);
    }

    @Test
    public void resolveAmountFromSeparateWithdrawAndDepositColumns() throws Exception {
        JSONObject row = new JSONObject();
        row.put("postedAt", "115/08/14");
        row.put("withdraw", "4,015");
        row.put("deposit", "");
        row.put("summary", "聯發 支");

        JSONObject item = HuaNanBankAutomation.buildTransactionIdentity(
            "123456789012",
            row,
            "2026-08-01",
            "2026-08-16"
        );
        assertNotNull(item);
        assertEquals(-401500L, item.getLong("amountMinor"));
    }

    @Test
    public void resolveAmountFromDepositColumn() throws Exception {
        JSONObject row = new JSONObject();
        row.put("postedAt", "115/08/15");
        row.put("withdraw", "");
        row.put("deposit", "3,000");
        row.put("summary", "ATM轉 收");

        JSONObject item = HuaNanBankAutomation.buildTransactionIdentity(
            "123456789012",
            row,
            "2026-08-01",
            "2026-08-16"
        );
        assertNotNull(item);
        assertEquals(300000L, item.getLong("amountMinor"));
    }
}
