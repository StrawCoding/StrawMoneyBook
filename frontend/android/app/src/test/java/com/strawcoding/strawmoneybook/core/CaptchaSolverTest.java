package com.strawcoding.strawmoneybook.core;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.Arrays;
import java.util.List;

public class CaptchaSolverTest {
    @Test
    public void normalizeKeepsOnlyUppercaseAlphaNumeric() {
        assertEquals("AB12", CaptchaSolver.normalize(" a-b 12 "));
    }

    @Test
    public void selectBestPrefersStableFourCharToken() {
        List<String> candidates = Arrays.asList("8AB12", "AB12", "AB12", "XAB1", "AB1");
        assertEquals("AB12", CaptchaSolver.selectBest(candidates));
    }

    @Test
    public void selectBestRejectsNonFourCharResults() {
        assertEquals("", CaptchaSolver.selectBest(Arrays.asList("A", "AB", "ABC", "")));
    }

    @Test
    public void selectBestWeightedPrefersHigherConfidenceFourCharToken() {
        List<CaptchaSolver.WeightedCandidate> candidates = Arrays.asList(
            new CaptchaSolver.WeightedCandidate("AB12", 20, 0, "whole_word"),
            new CaptchaSolver.WeightedCandidate("XY98", 92, 1, "segmented"),
            new CaptchaSolver.WeightedCandidate("XY9", 99, 2, "whole_line")
        );
        assertEquals("XY98", CaptchaSolver.selectBestWeighted(candidates));
    }

    @Test
    public void expandAmbiguousCandidatesIncludesCommonLookalikes() {
        List<String> candidates = CaptchaSolver.expandAmbiguousCandidates("0S1B");
        assertTrue(candidates.contains("0S1B"));
        assertTrue(candidates.contains("OSI8"));
        assertTrue(candidates.contains("OS1B"));
    }

    @Test
    public void combineSegmentsBuildsFourCharacterCode() {
        assertEquals("AB12", CaptchaSolver.combineSegments(Arrays.asList("A", "B", "1", "2")));
    }

    @Test
    public void isDataUrlUsableRejectsBlankAndAcceptsPngData() {
        assertFalse(CaptchaSolver.isDataUrlUsable(""));
        assertFalse(CaptchaSolver.isDataUrlUsable("data:image/png;base64,"));
        assertTrue(CaptchaSolver.isDataUrlUsable(
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5WCr8AAAAASUVORK5CYII="
        ));
    }

    @Test
    public void isValidForSubmitEnforcesNumericCharsetForHuaNan() {
        assertTrue(CaptchaSolver.isValidForSubmit("1234", true));
        assertFalse(CaptchaSolver.isValidForSubmit("12AB", true));
        assertFalse(CaptchaSolver.isValidForSubmit("123", true));
    }

    @Test
    public void isValidForSubmitEnforcesAlphanumericWhenNotNumericOnly() {
        assertTrue(CaptchaSolver.isValidForSubmit("AB12", false));
        assertFalse(CaptchaSolver.isValidForSubmit("AB-1", false));
    }

    @Test
    public void validateCaptchaCandidateAliasMatchesIsValidForSubmit() {
        assertTrue(CaptchaSolver.validateCaptchaCandidate("AB12", false));
        assertFalse(CaptchaSolver.validateCaptchaCandidate("123", false));
        assertTrue(CaptchaSolver.validateCaptchaCandidate("1234", true));
        assertFalse(CaptchaSolver.validateCaptchaCandidate("12AB", true));
    }
}
