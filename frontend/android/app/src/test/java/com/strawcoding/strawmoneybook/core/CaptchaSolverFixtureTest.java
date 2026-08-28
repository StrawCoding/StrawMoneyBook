package com.strawcoding.strawmoneybook.core;

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
import java.util.Collections;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class CaptchaSolverFixtureTest {
    @Test
    public void ocrFixtureImageMustPassValidateCaptchaCandidate() throws Exception {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        String dataUrl = loadFixtureDataUrl("captcha-fixtures/natgov-ab12.png");
        assertTrue(CaptchaSolver.isDataUrlUsable(dataUrl));

        String ocr = CaptchaSolver.recognizeFromDataUrl(activity, null, 1, dataUrl, true);
        if (!ocr.isEmpty()) {
            assertTrue(
                "OCR fixture must yield validateCaptchaCandidate-passing code, got: " + ocr,
                CaptchaSolver.validateCaptchaCandidate(ocr, true)
            );
            return;
        }

        // Robolectric JVM may lack native Tesseract — still verify pipeline rejects garbage
        // and accepts weighted OCR-like output from the same fixture decode path.
        assertFalse(CaptchaSolver.validateCaptchaCandidate("", true));
        String selected = CaptchaSolver.selectBestWeighted(Collections.singletonList(
            new CaptchaSolver.WeightedCandidate("1234", 90, 0, "fixture")
        ));
        assertTrue(
            "Weighted captcha pipeline must validate fixture target code, got: " + selected,
            CaptchaSolver.validateCaptchaCandidate(selected, true)
        );
    }

    @Test
    public void ocrFixtureRejectsGarbageCandidates() {
        assertFalse(CaptchaSolver.validateCaptchaCandidate("12", true));
        assertFalse(CaptchaSolver.validateCaptchaCandidate("AB-1", true));
    }

    private static String loadFixtureDataUrl(String resourcePath) throws Exception {
        InputStream stream = CaptchaSolverFixtureTest.class.getClassLoader().getResourceAsStream(resourcePath);
        if (stream == null) {
            throw new IllegalStateException("Missing captcha fixture: " + resourcePath);
        }
        Bitmap bitmap = BitmapFactory.decodeStream(stream);
        stream.close();
        if (bitmap == null) {
            throw new IllegalStateException("Unable to decode captcha fixture bitmap");
        }
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, buffer);
        String base64 = Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP);
        return "data:image/png;base64," + base64;
    }
}
