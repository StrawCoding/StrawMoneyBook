package com.strawcoding.strawmoneybook.core;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class HostTesseractOcrTest {
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

    @Test
    public void hostTesseractReadsRenderedNumericFixture() throws Exception {
        assertTrue(HostTesseractOcr.isAvailable());
        byte[] pngBytes = loadFixtureBytes("captcha-fixtures/numeric-1234.png");
        String ocr = HostTesseractOcr.recognizePngBytes(pngBytes, true);
        assertEquals("Host OCR failed for numeric fixture, got: '" + ocr + "'", "1234", ocr);
    }

    @Test
    public void hostTesseractReadsRenderedAlphanumericFixture() throws Exception {
        assertTrue(HostTesseractOcr.isAvailable());
        byte[] pngBytes = loadFixtureBytes("captcha-fixtures/alnum-ab12.png");
        String ocr = HostTesseractOcr.recognizePngBytes(pngBytes, false);
        assertEquals("Host OCR failed for alphanumeric fixture, got: '" + ocr + "'", "AB12", ocr);
    }
}
