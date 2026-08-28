package com.strawcoding.strawmoneybook.core;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Paint;
import android.util.Base64;
import android.util.Log;

import com.strawcoding.strawmoneybook.BankAutomationDebugTrace;
import com.strawcoding.strawmoneybook.TesseractBridge;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Provider-agnostic captcha OCR pipeline (Tesseract + validation + SEMI_MANUAL fallback).
 */
public final class CaptchaSolver {
    private static final String TAG = "CaptchaSolver";
    public static final int EXPECTED_LENGTH = 4;
    public static final int MIN_CONFIDENCE = 55;
    public static final int MIN_DATA_URL_LENGTH = 64;
    public static final int MIN_TARGET_HEIGHT = 108;
    public static final int MIN_CAPTURE_HEIGHT = 20;
    private static final int MAX_AMBIGUOUS_VARIANTS = 64;

    private CaptchaSolver() {}

    public static final class WeightedCandidate {
        public final String text;
        public final int weight;
        public final int variantIndex;
        public final String strategy;

        public WeightedCandidate(String text, int weight) {
            this(text, weight, -1, "unknown");
        }

        public WeightedCandidate(String text, int weight, int variantIndex, String strategy) {
            this.text = text == null ? "" : text;
            this.weight = Math.max(1, weight);
            this.variantIndex = variantIndex;
            this.strategy = strategy == null ? "unknown" : strategy;
        }
    }

    public static String normalize(String value) {
        return normalizeText(value)
            .replaceAll("[^A-Za-z0-9]", "")
            .toUpperCase(Locale.US)
            .trim();
    }

    public static boolean isDataUrlUsable(String dataUrl) {
        String normalized = normalizeText(dataUrl);
        int commaIndex = normalized.indexOf(',');
        return normalized.startsWith("data:image/")
            && commaIndex > 0
            && commaIndex < normalized.length() - 1
            && normalized.length() >= MIN_DATA_URL_LENGTH;
    }

    public static String extractPngBase64FromDataUrl(String dataUrl) {
        String normalized = normalizeText(dataUrl);
        if (!isDataUrlUsable(normalized)) return "";
        int commaIndex = normalized.indexOf(',');
        if (commaIndex < 0) return "";
        return normalized.substring(commaIndex + 1).trim();
    }

    public static String selectBest(List<String> candidates) {
        List<WeightedCandidate> weighted = new ArrayList<>();
        if (candidates == null) return "";
        for (String candidate : candidates) {
            weighted.add(new WeightedCandidate(candidate, 50));
        }
        return selectBestWeighted(weighted);
    }

    public static String selectBestWeighted(List<WeightedCandidate> candidates) {
        if (candidates == null || candidates.isEmpty()) return "";
        Map<String, Integer> scores = new LinkedHashMap<>();
        for (WeightedCandidate raw : candidates) {
            String candidate = normalize(raw.text);
            if (candidate.isEmpty()) continue;
            int score = scoreCandidate(candidate);
            if (score <= 0) continue;
            int weightedScore = (score * 10) + Math.min(100, Math.max(1, raw.weight));
            scores.put(candidate, scores.getOrDefault(candidate, 0) + weightedScore);
            int ambiguityScore = Math.max(1, weightedScore / 8);
            for (String expanded : expandAmbiguousCandidates(candidate)) {
                if (expanded.equals(candidate)) continue;
                scores.put(expanded, scores.getOrDefault(expanded, 0) + ambiguityScore);
            }
        }
        String best = "";
        int bestScore = -1;
        for (Map.Entry<String, Integer> entry : scores.entrySet()) {
            String candidate = entry.getKey();
            int score = entry.getValue();
            if (score > bestScore) {
                best = candidate;
                bestScore = score;
                continue;
            }
            if (score == bestScore && candidate.length() == EXPECTED_LENGTH && best.length() != EXPECTED_LENGTH) {
                best = candidate;
            }
        }
        return best.length() == EXPECTED_LENGTH ? best : "";
    }

    public static String combineSegments(List<String> segments) {
        if (segments == null || segments.size() < EXPECTED_LENGTH) return "";
        StringBuilder builder = new StringBuilder(EXPECTED_LENGTH);
        for (int index = 0; index < EXPECTED_LENGTH; index += 1) {
            String normalized = normalize(segments.get(index));
            if (normalized.isEmpty()) return "";
            builder.append(normalized.charAt(0));
        }
        return builder.length() == EXPECTED_LENGTH ? builder.toString() : "";
    }

    public static List<String> expandAmbiguousCandidates(String candidate) {
        String normalized = normalize(candidate);
        List<String> results = new ArrayList<>();
        if (normalized.isEmpty()) return results;
        Set<String> seen = new LinkedHashSet<>();
        seen.add(normalized);
        for (int index = 0; index < normalized.length(); index += 1) {
            List<String> snapshot = new ArrayList<>(seen);
            for (String current : snapshot) {
                for (char replacement : ambiguousReplacements(current.charAt(index))) {
                    if (replacement == current.charAt(index)) continue;
                    String expanded = current.substring(0, index) + replacement + current.substring(index + 1);
                    if (seen.add(expanded) && seen.size() >= MAX_AMBIGUOUS_VARIANTS) {
                        return new ArrayList<>(seen);
                    }
                }
            }
        }
        return new ArrayList<>(seen);
    }

    public static int scoreCandidate(String candidate) {
        String normalized = normalize(candidate);
        if (normalized.isEmpty()) return 0;
        if (normalized.length() == EXPECTED_LENGTH) return 100;
        if (normalized.length() < EXPECTED_LENGTH) return normalized.length() * 10;
        return 5;
    }

    /** Validates length + charset before portal submit. */
    public static boolean isValidForSubmit(String value, boolean numericOnly) {
        String normalized = normalize(value);
        if (normalized.length() != EXPECTED_LENGTH) return false;
        if (numericOnly) {
            return normalized.matches("\\d{4}");
        }
        return normalized.matches("[A-Z0-9]{4}");
    }

    /** Alias for design-doc validateCaptchaCandidate — OCR must pass before auto submit. */
    public static boolean validateCaptchaCandidate(String value, boolean numericOnly) {
        return isValidForSubmit(value, numericOnly);
    }

    public static String recognizeFromDataUrl(
        Activity activity,
        BankAutomationDebugTrace debugTrace,
        int attempt,
        String dataUrl,
        boolean numericMode
    ) {
        String normalized = normalizeText(dataUrl);
        if (!isDataUrlUsable(normalized)) {
            recordOcr(debugTrace, attempt, "error", "Captcha data URL was empty or incomplete", null);
            return "";
        }
        int commaIndex = normalized.indexOf(',');
        byte[] bytes = Base64.decode(normalized.substring(commaIndex + 1), Base64.DEFAULT);
        Bitmap source = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        if (source == null) {
            recordOcr(debugTrace, attempt, "error", "Captcha bitmap decode failed", null);
            return "";
        }
        List<Bitmap> variants = buildVariants(source);
        List<TesseractBridge.RecognitionCandidate> recognitions =
            TesseractBridge.recognizeCaptchaCandidates(activity, variants, numericMode);
        List<WeightedCandidate> weightedCandidates = new ArrayList<>();
        for (TesseractBridge.RecognitionCandidate recognition : recognitions) {
            if (recognition.confidence < MIN_CONFIDENCE) continue;
            weightedCandidates.add(new WeightedCandidate(
                recognition.text,
                recognition.confidence,
                recognition.variantIndex,
                recognition.strategy
            ));
        }
        String selected = selectBestWeighted(weightedCandidates);
        if (numericMode) {
            selected = normalize(selected).replaceAll("\\D+", "");
        }
        Log.d(TAG, "OCR selected=" + selected + " valid=" + isValidForSubmit(selected, numericMode));
        recordOcr(debugTrace, attempt,
            isValidForSubmit(selected, numericMode) ? "ok" : "error",
            isValidForSubmit(selected, numericMode) ? "OCR selected valid captcha" : "OCR did not select valid captcha",
            selected);
        return isValidForSubmit(selected, numericMode) ? selected : "";
    }

    private static void recordOcr(
        BankAutomationDebugTrace debugTrace,
        int attempt,
        String status,
        String message,
        String selected
    ) {
        if (debugTrace == null) return;
        JSONObject details = new JSONObject();
        try {
            details.put("attempt", attempt);
            if (selected != null) {
                details.put("selected", normalize(selected));
                details.put("selectedLength", selected.length());
            }
        } catch (Exception ignored) {
        }
        debugTrace.record("captcha_ocr", status, message, details);
    }

    static List<Bitmap> buildVariants(Bitmap source) {
        List<Bitmap> variants = new ArrayList<>();
        Bitmap conservativeTrim = cropMargins(source, 0.02f, 0.04f);
        Bitmap standardTrim = cropMargins(source, 0.04f, 0.08f);
        variants.add(preprocess(source, 0, false, 1.25f));
        variants.add(preprocess(conservativeTrim, 95, false, 1.40f));
        variants.add(preprocess(conservativeTrim, 115, false, 1.45f));
        variants.add(preprocess(conservativeTrim, 135, false, 1.50f));
        variants.add(preprocess(conservativeTrim, 155, false, 1.55f));
        variants.add(preprocess(conservativeTrim, 175, false, 1.60f));
        variants.add(preprocess(conservativeTrim, 135, true, 1.50f));
        variants.add(preprocess(standardTrim, 110, false, 1.35f));
        variants.add(preprocess(standardTrim, 140, false, 1.45f));
        variants.add(preprocess(standardTrim, 170, false, 1.55f));
        variants.add(preprocess(standardTrim, 140, true, 1.45f));
        if (source.getHeight() < MIN_CAPTURE_HEIGHT || source.getWidth() < 80) {
            variants.add(preprocess(source, 120, false, 2.20f));
            variants.add(preprocess(conservativeTrim, 150, false, 2.40f));
            variants.add(preprocess(conservativeTrim, 150, true, 2.40f));
        }
        return variants;
    }

    private static Bitmap cropMargins(Bitmap source, float insetXRatio, float insetYRatio) {
        int insetX = Math.max(1, Math.round(source.getWidth() * insetXRatio));
        int insetY = Math.max(1, Math.round(source.getHeight() * insetYRatio));
        int width = Math.max(1, source.getWidth() - (insetX * 2));
        int height = Math.max(1, source.getHeight() - (insetY * 2));
        if (width >= source.getWidth() || height >= source.getHeight()) return source;
        return Bitmap.createBitmap(source, insetX, insetY, width, height);
    }

    private static Bitmap preprocess(Bitmap source, int threshold, boolean invert, float contrast) {
        float scale = Math.max(MIN_TARGET_HEIGHT / (float) Math.max(1, source.getHeight()), 4f);
        int targetWidth = Math.max(Math.round(source.getWidth() * scale), 180);
        int targetHeight = Math.max(Math.round(source.getHeight() * scale), MIN_TARGET_HEIGHT);
        Bitmap scaled = Bitmap.createScaledBitmap(source, targetWidth, targetHeight, true);
        Bitmap output = Bitmap.createBitmap(scaled.getWidth(), scaled.getHeight(), Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(output);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        ColorMatrix colorMatrix = new ColorMatrix();
        colorMatrix.setSaturation(0f);
        paint.setColorFilter(new ColorMatrixColorFilter(colorMatrix));
        canvas.drawBitmap(scaled, 0f, 0f, paint);
        for (int x = 0; x < output.getWidth(); x += 1) {
            for (int y = 0; y < output.getHeight(); y += 1) {
                int pixel = output.getPixel(x, y);
                int average = (Color.red(pixel) + Color.green(pixel) + Color.blue(pixel)) / 3;
                int adjusted = clamp(Math.round(((average - 128f) * contrast) + 128f));
                if (threshold > 0) {
                    adjusted = adjusted > threshold ? 255 : 0;
                    if (invert) adjusted = 255 - adjusted;
                }
                output.setPixel(x, y, Color.argb(255, adjusted, adjusted, adjusted));
            }
        }
        return output;
    }

    private static int clamp(int value) {
        return Math.max(0, Math.min(255, value));
    }

    private static char[] ambiguousReplacements(char value) {
        switch (Character.toUpperCase(value)) {
            case '0': return new char[] { 'O', 'Q', 'D' };
            case 'O': return new char[] { '0', 'Q', 'D' };
            case 'Q': return new char[] { '0', 'O' };
            case 'D': return new char[] { '0', 'O' };
            case '1': return new char[] { 'I', 'L', 'T' };
            case 'I': return new char[] { '1', 'L' };
            case 'L': return new char[] { '1', 'I' };
            case 'T': return new char[] { '1', 'I' };
            case '2': return new char[] { 'Z' };
            case 'Z': return new char[] { '2' };
            case '5': return new char[] { 'S' };
            case 'S': return new char[] { '5' };
            case '6': return new char[] { 'G' };
            case 'G': return new char[] { '6' };
            case '8': return new char[] { 'B' };
            case 'B': return new char[] { '8' };
            default: return new char[0];
        }
    }

    private static String normalizeText(String value) {
        return value == null ? "" : value.trim();
    }
}
