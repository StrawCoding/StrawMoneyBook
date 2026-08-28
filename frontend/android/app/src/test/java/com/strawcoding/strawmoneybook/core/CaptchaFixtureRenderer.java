package com.strawcoding.strawmoneybook.core;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.util.Base64;

import androidx.test.core.app.ApplicationProvider;

import com.strawcoding.strawmoneybook.TesseractBridge;

import java.io.ByteArrayOutputStream;
import java.util.List;

/** Renders high-contrast captcha fixtures for JVM OCR pipeline tests. */
final class CaptchaFixtureRenderer {
    private CaptchaFixtureRenderer() {}

    static Bitmap renderCode(String code, boolean numericOnly) {
        String normalized = CaptchaSolver.normalize(code);
        if (normalized.isEmpty()) {
            throw new IllegalArgumentException("captcha code required");
        }
        if (numericOnly && !normalized.matches("\\d{4}")) {
            throw new IllegalArgumentException("numeric fixture must be 4 digits");
        }
        int cellCount = CaptchaSolver.EXPECTED_LENGTH;
        int cellWidth = 96;
        int height = 120;
        int width = cellWidth * cellCount;
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(Color.WHITE);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.BLACK);
        paint.setTextSize(72f);
        paint.setFakeBoldText(true);
        for (int index = 0; index < normalized.length() && index < cellCount; index += 1) {
            String glyph = String.valueOf(normalized.charAt(index));
            Rect bounds = new Rect();
            paint.getTextBounds(glyph, 0, glyph.length(), bounds);
            float centerX = (index * cellWidth) + (cellWidth / 2f);
            float x = centerX - (bounds.width() / 2f) - bounds.left;
            float y = (height + bounds.height()) / 2f - bounds.bottom;
            canvas.drawText(glyph, x, y, paint);
        }
        return bitmap;
    }

    static String toDataUrl(Bitmap bitmap) {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, buffer);
        String base64 = Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP);
        return "data:image/png;base64," + base64;
    }

    static String recognizeExpectedCode(Context context, Bitmap source, boolean numericMode) {
        List<Bitmap> variants = CaptchaSolver.buildVariants(source);
        List<TesseractBridge.RecognitionCandidate> candidates =
            TesseractBridge.recognizeCaptchaCandidates(context, variants, numericMode);
        List<CaptchaSolver.WeightedCandidate> weighted = new java.util.ArrayList<>();
        for (TesseractBridge.RecognitionCandidate candidate : candidates) {
            weighted.add(new CaptchaSolver.WeightedCandidate(
                candidate.text,
                candidate.confidence,
                candidate.variantIndex,
                candidate.strategy
            ));
        }
        String selected = CaptchaSolver.selectBestWeighted(weighted);
        if (numericMode) {
            selected = CaptchaSolver.normalize(selected).replaceAll("\\D+", "");
        }
        if (!selected.isEmpty()) {
            return selected;
        }
        if (HostTesseractOcr.isAvailable()) {
            return HostTesseractOcr.recognize(source, numericMode);
        }
        return "";
    }

    static Context robolectricContext() {
        return ApplicationProvider.getApplicationContext();
    }
}
