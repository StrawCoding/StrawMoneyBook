package com.strawcoding.strawmoneybook;

import static org.junit.Assert.assertEquals;

import org.json.JSONObject;
import org.junit.Test;

import java.time.LocalDate;

/**
 * Phase 0A/0B/0C — v1.1.1 sync watermark contract:
 * lastSyncAt &gt; last_sync_at precedence, mandatory lookback overlap.
 */
public class FirstBankAutomationSyncContractTest {

    @Test
    public void readLastSyncWatermarkPrefersCanonicalCamelOverLegacySnake() throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("lastSyncAt", "2026-08-16T04:00:00+08:00");
        payload.put("last_sync_at", "2026-01-01T00:00:00+08:00");

        assertEquals(
            "2026-08-16T04:00:00+08:00",
            FirstBankAutomation.readLastSyncWatermark(payload)
        );
    }

    @Test
    public void readLastSyncWatermarkFallsBackToSnakeWhenCamelEmpty() throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("lastSyncAt", "");
        payload.put("last_sync_at", "2026-03-20T10:00:00.000Z");

        assertEquals(
            "2026-03-20T10:00:00.000Z",
            FirstBankAutomation.readLastSyncWatermark(payload)
        );
    }

    @Test
    public void readLookbackDaysDefaultsToThreeAndAcceptsSnakeOrCamel() throws Exception {
        assertEquals(3, FirstBankAutomation.readLookbackDays(new JSONObject()));

        JSONObject camel = new JSONObject();
        camel.put("lookbackDays", 5);
        assertEquals(5, FirstBankAutomation.readLookbackDays(camel));

        JSONObject snake = new JSONObject();
        snake.put("lookback_days", 2);
        assertEquals(2, FirstBankAutomation.readLookbackDays(snake));
    }

    @Test
    public void resolveQueryStartDateAppliesMandatoryLookbackOverlap() {
        LocalDate start = FirstBankAutomation.resolveQueryStartDate(
            "2026-01-01",
            "2026-08-16T04:00:00+08:00",
            null,
            3
        );
        assertEquals(LocalDate.of(2026, 8, 13), start);
    }

    @Test
    public void resolveQueryStartDateClampsLookbackToInitialStart() {
        LocalDate start = FirstBankAutomation.resolveQueryStartDate(
            "2026-08-15",
            "2026-08-16T04:00:00+08:00",
            null,
            3
        );
        assertEquals(LocalDate.of(2026, 8, 15), start);
    }

    @Test
    public void resolveQueryStartDateUsesCanonicalWhenSnakeConflicts() throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("lastSyncAt", "2026-08-16T00:00:00+08:00");
        payload.put("last_sync_at", "2026-01-01T00:00:00+08:00");
        payload.put("lookbackDays", 3);

        String watermark = FirstBankAutomation.readLastSyncWatermark(payload);
        int lookback = FirstBankAutomation.readLookbackDays(payload);
        LocalDate start = FirstBankAutomation.resolveQueryStartDate(
            "2026-01-01",
            watermark,
            null,
            lookback
        );
        assertEquals(LocalDate.of(2026, 8, 13), start);
    }
}
