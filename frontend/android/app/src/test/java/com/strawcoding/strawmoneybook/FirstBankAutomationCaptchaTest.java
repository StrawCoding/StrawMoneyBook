package com.strawcoding.strawmoneybook;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.Arrays;
import java.util.List;

public class FirstBankAutomationCaptchaTest {
    @Test
    public void normalizeCaptchaStringKeepsOnlyUppercaseAlphaNumeric() {
        assertEquals("AB12", FirstBankAutomation.normalizeCaptchaString(" a-b 12 "));
    }

    @Test
    public void selectBestCaptchaCandidatePrefersStableFourCharToken() {
        List<String> candidates = Arrays.asList(
            "8AB12",
            "AB12",
            "AB12",
            "XAB1",
            "AB1"
        );

        assertEquals("AB12", FirstBankAutomation.selectBestCaptchaCandidate(candidates));
    }

    @Test
    public void selectBestCaptchaCandidateRejectsNonFourCharResults() {
        List<String> candidates = Arrays.asList("A", "AB", "ABC", "");
        assertEquals("", FirstBankAutomation.selectBestCaptchaCandidate(candidates));
    }

    @Test
    public void selectBestCaptchaCandidateAcceptsSingleTesseractResult() {
        assertEquals("AB12", FirstBankAutomation.selectBestCaptchaCandidate(Arrays.asList("AB12")));
    }

    @Test
    public void selectBestCaptchaCandidateWeightedPrefersHigherConfidenceFourCharToken() {
        List<FirstBankAutomation.WeightedCaptchaCandidate> candidates = Arrays.asList(
            new FirstBankAutomation.WeightedCaptchaCandidate("AB12", 20, 0, "whole_word"),
            new FirstBankAutomation.WeightedCaptchaCandidate("XY98", 92, 1, "segmented"),
            new FirstBankAutomation.WeightedCaptchaCandidate("XY9", 99, 2, "whole_line")
        );

        assertEquals("XY98", FirstBankAutomation.selectBestCaptchaCandidateWeighted(candidates));
    }

    @Test
    public void expandCaptchaAmbiguousCandidatesIncludesCommonLookalikes() {
        List<String> candidates = FirstBankAutomation.expandCaptchaAmbiguousCandidates("0S1B");

        assertTrue(candidates.contains("0S1B"));
        assertTrue(candidates.contains("OSI8"));
        assertTrue(candidates.contains("OS1B"));
    }

    @Test
    public void selectBestCaptchaCandidateCanRecoverAmbiguousCharacters() {
        List<String> candidates = Arrays.asList(
            "0S1B",
            "OS1B",
            "OSI8"
        );

        String selected = FirstBankAutomation.selectBestCaptchaCandidate(candidates);
        assertTrue(Arrays.asList("0S1B", "OS1B", "OSI8").contains(selected));
    }

    @Test
    public void combineCaptchaSegmentsBuildsFourCharacterCode() {
        assertEquals("AB12", FirstBankAutomation.combineCaptchaSegments(Arrays.asList("A", "B", "1", "2")));
    }

    @Test
    public void isCaptchaDataUrlUsableRejectsBlankAndAcceptsPngData() {
        assertTrue(!FirstBankAutomation.isCaptchaDataUrlUsable(""));
        assertTrue(!FirstBankAutomation.isCaptchaDataUrlUsable("data:image/png;base64,"));
        assertTrue(FirstBankAutomation.isCaptchaDataUrlUsable(
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5WCr8AAAAASUVORK5CYII="
        ));
    }

    @Test
    public void extractPngBase64FromDataUrlReturnsPayloadWithoutPrefix() {
        String dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5WCr8AAAAASUVORK5CYII=";
        assertEquals(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5WCr8AAAAASUVORK5CYII=",
            FirstBankAutomation.extractPngBase64FromDataUrl(dataUrl)
        );
    }

    @Test
    public void emptyCaptchaSnapshotDefaultsToMissingImageReason() {
        FirstBankAutomation.CaptchaSnapshot snapshot = FirstBankAutomation.emptyCaptchaSnapshot("image_missing");
        assertFalse(snapshot.ready);
        assertFalse(snapshot.imageReady);
        assertEquals("image_missing", snapshot.reason);
        assertEquals(0, snapshot.width);
        assertEquals(0, snapshot.height);
    }

    @Test
    public void hasCaptchaSignatureChangedTracksMeaningfulTransitions() {
        assertFalse(FirstBankAutomation.hasCaptchaSignatureChanged("", ""));
        assertTrue(FirstBankAutomation.hasCaptchaSignatureChanged("", "next-signature"));
        assertTrue(FirstBankAutomation.hasCaptchaSignatureChanged("previous-signature", "next-signature"));
        assertFalse(FirstBankAutomation.hasCaptchaSignatureChanged("same-signature", "same-signature"));
    }

    @Test
    public void navigationSnapshotAcceptsFirstBankNavigationWhenProgressHasAdvanced() {
        assertTrue(FirstBankAutomation.hasReachedRequestedPageForTest(
            "https://ibank.firstbank.com.tw/NetBank/frame.html",
            "https://ibank.firstbank.com.tw/NetBank/2/010103.html?acnt=1234",
            "",
            "https://ibank.firstbank.com.tw/NetBank/frame.html",
            "",
            65
        ));
    }

    @Test
    public void navigationSnapshotStillRequiresProgressBeforeTreatingStartedPageAsReached() {
        assertFalse(FirstBankAutomation.hasReachedRequestedPageForTest(
            "https://ibank.firstbank.com.tw/NetBank/frame.html",
            "",
            "",
            "https://ibank.firstbank.com.tw/NetBank/frame.html",
            "",
            0
        ));
    }

    @Test
    public void desktopViewportScriptTargetsDesktopWidth() {
        String script = FirstBankAutomation.buildEnsureDesktopViewportScript();
        assertTrue(script.contains("const width = 1280"));
        assertTrue(script.contains("initial-scale=1.0"));
    }

    @Test
    public void desktopLoginPageProbeRequiresDesktopMarkers() {
        String script = FirstBankAutomation.buildDesktopLoginPageProbeScript();
        assertTrue(script.contains("captchaLoginArea"));
        assertTrue(script.contains("code_verify"));
        assertTrue(script.contains("vrfyCode"));
        assertTrue(script.contains("mobileHint"));
    }
}
