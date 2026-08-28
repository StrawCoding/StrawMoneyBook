package com.strawcoding.strawmoneybook.core;

import android.graphics.Bitmap;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

/** Host `tesseract` CLI fallback for Robolectric when Android native OCR is unavailable. */
final class HostTesseractOcr {
    private HostTesseractOcr() {}

    static String recognize(Bitmap bitmap, boolean numericMode) {
        if (bitmap == null || bitmap.isRecycled()) return "";
        File png = null;
        File outDir = null;
        try {
            png = File.createTempFile("smb-captcha-fixture-", ".png");
            outDir = new File(System.getProperty("java.io.tmpdir"), "smb-captcha-out-" + System.nanoTime());
            if (!outDir.mkdir()) return "";
            String outPrefix = new File(outDir, "result").getAbsolutePath();
            try (FileOutputStream stream = new FileOutputStream(png)) {
                if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)) {
                    return "";
                }
            }
            return runTesseract(png, outDir, outPrefix, numericMode);
        } catch (Exception ignored) {
            return "";
        } finally {
            if (png != null) png.delete();
            if (outDir != null) {
                File[] leftovers = outDir.listFiles();
                if (leftovers != null) {
                    for (File file : leftovers) {
                        file.delete();
                    }
                }
                outDir.delete();
            }
        }
    }

    static String recognizePngBytes(byte[] pngBytes, boolean numericMode) {
        if (pngBytes == null || pngBytes.length < 32) return "";
        File png = null;
        File outDir = null;
        try {
            png = File.createTempFile("smb-captcha-fixture-", ".png");
            outDir = new File(System.getProperty("java.io.tmpdir"), "smb-captcha-out-" + System.nanoTime());
            if (!outDir.mkdir()) return "";
            String outPrefix = new File(outDir, "result").getAbsolutePath();
            try (FileOutputStream stream = new FileOutputStream(png)) {
                stream.write(pngBytes);
            }
            return runTesseract(png, outDir, outPrefix, numericMode);
        } catch (Exception ignored) {
            return "";
        } finally {
            if (png != null) png.delete();
            if (outDir != null) {
                File[] leftovers = outDir.listFiles();
                if (leftovers != null) {
                    for (File file : leftovers) {
                        file.delete();
                    }
                }
                outDir.delete();
            }
        }
    }

    private static String runTesseract(File png, File outDir, String outPrefix, boolean numericMode) throws Exception {
            if (png.length() < 32) {
                return "";
            }
            ProcessBuilder builder = new ProcessBuilder(
                "tesseract",
                png.getAbsolutePath(),
                outPrefix,
                "-l",
                "eng",
                "--psm",
                "7",
                "-c",
                "tessedit_char_whitelist=" + (numericMode ? "0123456789" : "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
            );
            builder.redirectErrorStream(true);
            Process process = builder.start();
            try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8)
            )) {
                while (reader.readLine() != null) {
                    // drain
                }
            }
            if (!process.waitFor(20, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                return "";
            }
            if (process.exitValue() != 0) {
                return "";
            }
            File output = new File(outPrefix + ".txt");
            if (!output.isFile()) return "";
            StringBuilder text = new StringBuilder();
            try (
                BufferedReader reader = new BufferedReader(
                    new InputStreamReader(new java.io.FileInputStream(output), StandardCharsets.UTF_8)
                )
            ) {
                String line;
                while ((line = reader.readLine()) != null) {
                    text.append(line);
                }
            }
            String normalized = CaptchaSolver.normalize(text.toString());
            if (numericMode) {
                normalized = normalized.replaceAll("\\D+", "");
            }
            return CaptchaSolver.validateCaptchaCandidate(normalized, numericMode) ? normalized : "";
    }

    static boolean isAvailable() {
        try {
            Process process = new ProcessBuilder("tesseract", "--version").start();
            if (!process.waitFor(5, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                return false;
            }
            return process.exitValue() == 0;
        } catch (Exception ignored) {
            return false;
        }
    }
}
