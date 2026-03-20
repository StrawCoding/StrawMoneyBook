package com.strawcoding.strawmoneybook;

import android.content.Context;
import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.util.Log;

import com.googlecode.tesseract.android.TessBaseAPI;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

final class TesseractBridge {
    private static final String TAG = "TesseractBridge";
    private static final String TRAINEDDATA_ASSET_PATH = "tesseract/tessdata/eng.traineddata";
    private static final String TRAINEDDATA_FILENAME = "eng.traineddata";
    private static final String LANGUAGE = "eng";
    private static final String ALLOWED_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    static final String TRAINEDDATA_MD5 = "d1be414fbb296b3ad777bfca655e194e";

    private TesseractBridge() {}

    static final class RecognitionCandidate {
        final String text;
        final int confidence;
        final int variantIndex;
        final String strategy;

        RecognitionCandidate(String text, int confidence, int variantIndex, String strategy) {
            this.text = text == null ? "" : text;
            this.confidence = Math.max(1, confidence);
            this.variantIndex = variantIndex;
            this.strategy = strategy == null ? "unknown" : strategy;
        }
    }

    static List<RecognitionCandidate> recognizeCaptchaCandidates(Context context, List<Bitmap> variants) {
        List<RecognitionCandidate> candidates = new ArrayList<>();
        if (context == null || variants == null || variants.isEmpty()) {
            return candidates;
        }

        TessBaseAPI api = null;
        try {
            File dataDir = ensureBundledTrainedData(context.getApplicationContext());
            api = createApi(dataDir);
            for (int index = 0; index < variants.size(); index += 1) {
                Bitmap variant = variants.get(index);
                if (variant == null || variant.isRecycled()) continue;
                Log.d(TAG, "Recognizing captcha variant=" + index + " size=" + variant.getWidth() + "x" + variant.getHeight());
                addRecognizedText(candidates, api, variant, index, TessBaseAPI.PageSegMode.PSM_SINGLE_WORD, "whole_word");
                addRecognizedText(candidates, api, variant, index, TessBaseAPI.PageSegMode.PSM_SINGLE_LINE, "whole_line");
                api.clear();
            }
            if (!hasAnyFourCharacterCandidate(candidates)) {
                for (int index = 0; index < variants.size(); index += 1) {
                    Bitmap variant = variants.get(index);
                    if (variant == null || variant.isRecycled()) continue;
                    RecognitionCandidate segmented = recognizeSegmentedCaptcha(api, variant, index);
                    if (segmented != null) {
                        candidates.add(segmented);
                        Log.d(TAG, "Segment fallback variant=" + index + " confidence=" + segmented.confidence
                            + " text=" + FirstBankAutomation.normalizeCaptchaString(segmented.text));
                    }
                }
            }
        } catch (Throwable error) {
            Log.w(TAG, "Tesseract recognition failed", error);
        } finally {
            if (api != null) {
                api.recycle();
            }
        }

        return candidates;
    }

    static File ensureBundledTrainedData(Context context) throws IOException {
        File dataDir = new File(context.getFilesDir(), "tesseract");
        File tessdataDir = new File(dataDir, "tessdata");
        if (!tessdataDir.exists() && !tessdataDir.mkdirs()) {
            throw new IOException("Failed to create tessdata directory");
        }

        File targetFile = new File(tessdataDir, TRAINEDDATA_FILENAME);
        if (targetFile.isFile() && TRAINEDDATA_MD5.equalsIgnoreCase(calculateMd5(targetFile))) {
            return dataDir;
        }

        AssetManager assetManager = context.getAssets();
        try (
            InputStream inputStream = assetManager.open(TRAINEDDATA_ASSET_PATH);
            FileOutputStream outputStream = new FileOutputStream(targetFile, false)
        ) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = inputStream.read(buffer)) >= 0) {
                outputStream.write(buffer, 0, read);
            }
            outputStream.flush();
        }

        if (!TRAINEDDATA_MD5.equalsIgnoreCase(calculateMd5(targetFile))) {
            throw new IOException("Bundled Tesseract traineddata checksum mismatch");
        }
        return dataDir;
    }

    static String calculateMd5(File file) throws IOException {
        try (FileInputStream inputStream = new FileInputStream(file)) {
            MessageDigest digest = MessageDigest.getInstance("MD5");
            byte[] buffer = new byte[8192];
            int read;
            while ((read = inputStream.read(buffer)) >= 0) {
                digest.update(buffer, 0, read);
            }
            byte[] md5 = digest.digest();
            StringBuilder builder = new StringBuilder(md5.length * 2);
            for (byte value : md5) {
                builder.append(String.format("%02x", value));
            }
            return builder.toString();
        } catch (Exception error) {
            throw new IOException("Failed to calculate Tesseract traineddata checksum", error);
        }
    }

    private static TessBaseAPI createApi(File dataDir) throws IOException {
        TessBaseAPI api = new TessBaseAPI();
        if (!api.init(dataDir.getAbsolutePath(), LANGUAGE)) {
            api.recycle();
            throw new IOException("Failed to initialize Tesseract");
        }
        api.setVariable(TessBaseAPI.VAR_CHAR_WHITELIST, ALLOWED_CHARS);
        api.setVariable("classify_bln_numeric_mode", "1");
        api.setVariable("load_system_dawg", "0");
        api.setVariable("load_freq_dawg", "0");
        return api;
    }

    private static void addRecognizedText(List<RecognitionCandidate> out, TessBaseAPI api, Bitmap image, int variantIndex, int pageSegMode, String strategy) {
        api.setPageSegMode(pageSegMode);
        api.setImage(image);
        String text = api.getUTF8Text();
        if (text != null && !text.trim().isEmpty()) {
            int confidence = Math.max(1, api.meanConfidence());
            out.add(new RecognitionCandidate(text, confidence, variantIndex, strategy + ":" + pageSegModeName(pageSegMode)));
        }
    }

    private static boolean hasAnyFourCharacterCandidate(List<RecognitionCandidate> candidates) {
        for (RecognitionCandidate candidate : candidates) {
            if (FirstBankAutomation.normalizeCaptchaString(candidate.text).length() == 4) {
                return true;
            }
        }
        return false;
    }

    private static RecognitionCandidate recognizeSegmentedCaptcha(TessBaseAPI api, Bitmap image, int variantIndex) {
        List<String> segments = new ArrayList<>();
        int totalConfidence = 0;
        int segmentCount = 0;
        for (int index = 0; index < 4; index += 1) {
            Bitmap segment = sliceCaptchaSegment(image, index, 4);
            try {
                api.setPageSegMode(TessBaseAPI.PageSegMode.PSM_SINGLE_CHAR);
                api.setImage(segment);
                String text = api.getUTF8Text();
                String normalized = FirstBankAutomation.normalizeCaptchaString(text);
                if (normalized.isEmpty()) {
                    return null;
                }
                segments.add(String.valueOf(normalized.charAt(0)));
                totalConfidence += Math.max(1, api.meanConfidence());
                segmentCount += 1;
            } finally {
                api.clear();
                if (!segment.isRecycled()) {
                    segment.recycle();
                }
            }
        }
        String combined = FirstBankAutomation.combineCaptchaSegments(segments);
        if (combined.length() != 4 || segmentCount == 0) {
            return null;
        }
        return new RecognitionCandidate(combined, Math.max(1, totalConfidence / segmentCount), variantIndex, "segmented");
    }

    private static Bitmap sliceCaptchaSegment(Bitmap source, int segmentIndex, int totalSegments) {
        int segmentWidth = Math.max(1, source.getWidth() / totalSegments);
        int padding = Math.max(1, source.getWidth() / 40);
        int startX = Math.max(0, (segmentIndex * segmentWidth) - padding);
        int endX = segmentIndex == totalSegments - 1
            ? source.getWidth()
            : Math.min(source.getWidth(), ((segmentIndex + 1) * segmentWidth) + padding);
        int width = Math.max(1, endX - startX);
        return Bitmap.createBitmap(source, startX, 0, width, source.getHeight());
    }

    private static String pageSegModeName(int pageSegMode) {
        switch (pageSegMode) {
            case TessBaseAPI.PageSegMode.PSM_SINGLE_CHAR:
                return "single_char";
            case TessBaseAPI.PageSegMode.PSM_SINGLE_LINE:
                return "single_line";
            case TessBaseAPI.PageSegMode.PSM_SINGLE_WORD:
                return "single_word";
            default:
                return String.format(Locale.US, "psm_%d", pageSegMode);
        }
    }
}
