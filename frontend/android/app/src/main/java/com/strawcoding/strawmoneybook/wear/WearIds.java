package com.strawcoding.strawmoneybook.wear;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;

public final class WearIds {
    private WearIds() {}

    public static String createId(String prefix) {
        String time = Long.toString(System.currentTimeMillis(), 36);
        String random = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        if (prefix == null || prefix.isEmpty()) {
            return time + "_" + random;
        }
        return prefix + "_" + time + "_" + random;
    }

    public static String nowIso() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }
}
