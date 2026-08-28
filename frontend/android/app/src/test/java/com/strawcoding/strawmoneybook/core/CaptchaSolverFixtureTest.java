package com.strawcoding.strawmoneybook.core;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class CaptchaSolverFixtureTest {
    private byte[] loadFixtureBytes(String resourcePath) throws Exception {
        InputStream stream = getClass().getClassLoader().getResourceAsStream(resourcePath);
        if (stream == null) {
            throw new IllegalStateException("Missing captcha fixture: " + resourcePath);
        }
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[4096];
        int read;
        while ((read = stream.read(chunk)) >= 0) {
            buffer.write(chunk, 0, read);
        }
        stream.close();
        return buffer.toByteArray();
    }

    private String loadFixtureDataUrl(String resourcePath) throws Exception {
        byte[] bytes = loadFixtureBytes(resourcePath);
        String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
        return "data:image/png;base64," + base64;
    }

    private String recognizeFixtureCode(Activity activity, byte[] pngBytes, Bitmap bitmap, String dataUrl, boolean numericMode) {
        assertTrue("Host Tesseract CLI required for fixture OCR (no mock fallback)", HostTesseractOcr.isAvailable());
        String hostOcr = HostTesseractOcr.recognizePngBytes(pngBytes, numericMode);
        if (!hostOcr.isEmpty()) {
            return hostOcr;
        }
        // Secondary path: CaptchaSolver → native bridge (still real OCR, never hardcoded).
        return CaptchaSolver.recognizeFromDataUrl(activity, null, 1, dataUrl, numericMode);
    }

    @Test
    public void ocrRenderedNumericFixtureMustPassValidateCaptchaCandidate() throws Exception {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        byte[] pngBytes = loadFixtureBytes("captcha-fixtures/numeric-1234.png");
        Bitmap bitmap = BitmapFactory.decodeByteArray(pngBytes, 0, pngBytes.length);
        String dataUrl = loadFixtureDataUrl("captcha-fixtures/numeric-1234.png");

        assertTrue(CaptchaSolver.isDataUrlUsable(dataUrl));
        assertTrue("Host or native Tesseract must be available", HostTesseractOcr.isAvailable());
        String ocr = recognizeFixtureCode(activity, pngBytes, bitmap, dataUrl, true);
        assertFalse("OCR must not return empty for numeric fixture", ocr.isEmpty());
        assertTrue(
            "OCR fixture must yield validateCaptchaCandidate-passing code, got: " + ocr,
            CaptchaSolver.validateCaptchaCandidate(ocr, true)
        );
        assertEquals("1234", ocr);
    }

    @Test
    public void ocrRenderedAlphanumericFixtureMustPassValidateCaptchaCandidate() throws Exception {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        byte[] pngBytes = loadFixtureBytes("captcha-fixtures/alnum-ab12.png");
        Bitmap bitmap = BitmapFactory.decodeByteArray(pngBytes, 0, pngBytes.length);
        String dataUrl = loadFixtureDataUrl("captcha-fixtures/alnum-ab12.png");

        assertTrue("Host or native Tesseract must be available", HostTesseractOcr.isAvailable());
        String ocr = recognizeFixtureCode(activity, pngBytes, bitmap, dataUrl, false);
        assertFalse("OCR must not return empty for alphanumeric fixture", ocr.isEmpty());
        assertTrue(
            "OCR fixture must yield validateCaptchaCandidate-passing code, got: " + ocr,
            CaptchaSolver.validateCaptchaCandidate(ocr, false)
        );
        assertEquals("AB12", ocr);
    }

    @Test
    public void ocrFixtureRejectsGarbageCandidates() {
        assertFalse(CaptchaSolver.validateCaptchaCandidate("", true));
        assertFalse(CaptchaSolver.validateCaptchaCandidate("12", true));
        assertFalse(CaptchaSolver.validateCaptchaCandidate("AB-1", false));
    }
}
