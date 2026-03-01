package com.strawcoding.strawmoneybook;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import androidx.annotation.NonNull;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.Locale;

@CapacitorPlugin(
    name = "SpeechInput",
    permissions = {
        @Permission(alias = "audio", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public class SpeechInputPlugin extends Plugin {
    private SpeechRecognizer speechRecognizer;
    private boolean partialResultsEnabled = true;
    private String listeningLanguage = "zh-TW";
    private int maxResults = 5;
    private boolean listening = false;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        Context context = getContext();
        JSObject result = new JSObject();
        result.put("available", context != null && SpeechRecognizer.isRecognitionAvailable(context));
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (!isRecognitionAvailable()) {
            call.reject("Speech recognition is unavailable", "service-not-allowed");
            return;
        }

        if (getPermissionState("audio") != PermissionState.GRANTED) {
            requestPermissionForAlias("audio", call, "onAudioPermissionResult");
            return;
        }

        startListening(call);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                listening = false;
                if (speechRecognizer != null) {
                    speechRecognizer.stopListening();
                }
            } catch (Exception ignored) {
                try {
                    if (speechRecognizer != null) {
                        speechRecognizer.cancel();
                    }
                } catch (Exception ignoredCancel) {
                    // Ignore stop errors.
                }
            }
            call.resolve();
        });
    }

    @PermissionCallback
    private void onAudioPermissionResult(PluginCall call) {
        if (getPermissionState("audio") != PermissionState.GRANTED) {
            call.reject("Microphone permission denied", "permission-denied");
            return;
        }

        startListening(call);
    }

    @Override
    protected void handleOnDestroy() {
        destroyRecognizer();
        super.handleOnDestroy();
    }

    private void startListening(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing()) {
            call.reject("Current activity is unavailable", "service-not-allowed");
            return;
        }

        listeningLanguage = sanitizeLanguage(call.getString("lang"));
        partialResultsEnabled = !Boolean.FALSE.equals(call.getBoolean("partialResults"));

        Integer requestedMaxResults = call.getInt("maxAlternatives");
        int normalizedMaxResults = requestedMaxResults == null ? 5 : requestedMaxResults;
        maxResults = Math.max(1, Math.min(8, normalizedMaxResults));

        activity.runOnUiThread(() -> {
            try {
                ensureRecognizer();
                if (speechRecognizer == null) {
                    call.reject("Speech recognizer is unavailable", "service-not-allowed");
                    return;
                }

                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, listeningLanguage);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, partialResultsEnabled);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, maxResults);
                intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, activity.getPackageName());

                speechRecognizer.cancel();
                listening = true;
                emitState("start");
                speechRecognizer.startListening(intent);

                JSObject result = new JSObject();
                result.put("started", true);
                call.resolve(result);
            } catch (Exception error) {
                listening = false;
                call.reject(String.valueOf(error.getMessage()), "service-not-allowed");
            }
        });
    }

    private void ensureRecognizer() {
        if (speechRecognizer != null) return;

        Context context = getContext();
        if (context == null) return;

        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context);
        speechRecognizer.setRecognitionListener(new RecognitionListener() {
            @Override
            public void onReadyForSpeech(Bundle params) {
                emitState("ready");
            }

            @Override
            public void onBeginningOfSpeech() {
                emitState("ready");
            }

            @Override
            public void onRmsChanged(float rmsdB) {
                // No-op.
            }

            @Override
            public void onBufferReceived(byte[] buffer) {
                // No-op.
            }

            @Override
            public void onEndOfSpeech() {
                // Wait for final result or error.
            }

            @Override
            public void onError(int error) {
                listening = false;
                emitError(mapErrorCode(error));
                emitState("end");
            }

            @Override
            public void onResults(Bundle results) {
                listening = false;
                emitResult(results, true);
                emitState("end");
            }

            @Override
            public void onPartialResults(Bundle partialResults) {
                if (!partialResultsEnabled) return;
                emitResult(partialResults, false);
            }

            @Override
            public void onEvent(int eventType, Bundle params) {
                // No-op.
            }
        });
    }

    private void emitResult(Bundle results, boolean isFinal) {
        ArrayList<String> transcripts = results == null
            ? null
            : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);

        if (transcripts == null || transcripts.isEmpty()) {
            return;
        }

        float[] confidenceScores = results.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES);

        JSArray transcriptArray = new JSArray();
        JSArray confidenceArray = new JSArray();
        for (int index = 0; index < transcripts.size(); index += 1) {
            transcriptArray.put(transcripts.get(index));
            if (confidenceScores != null && index < confidenceScores.length) {
                confidenceArray.put(Double.valueOf(confidenceScores[index]));
            } else {
                confidenceArray.put(Integer.valueOf(0));
            }
        }

        JSObject payload = new JSObject();
        payload.put("isFinal", isFinal);
        payload.put("transcripts", transcriptArray);
        payload.put("confidences", confidenceArray);
        notifyListeners("speechResult", payload);
    }

    private void emitError(@NonNull String code) {
        JSObject payload = new JSObject();
        payload.put("code", code);
        notifyListeners("speechError", payload);
    }

    private void emitState(@NonNull String state) {
        JSObject payload = new JSObject();
        payload.put("state", state);
        notifyListeners("speechState", payload);
    }

    private void destroyRecognizer() {
        if (speechRecognizer == null) return;
        try {
            speechRecognizer.destroy();
        } catch (Exception ignored) {
            // Ignore destroy errors.
        }
        speechRecognizer = null;
        listening = false;
    }

    private boolean isRecognitionAvailable() {
        Context context = getContext();
        return context != null && SpeechRecognizer.isRecognitionAvailable(context);
    }

    private String sanitizeLanguage(String language) {
        String normalized = language == null ? "" : language.trim();
        if (!normalized.isEmpty()) {
            return normalized;
        }
        return Locale.getDefault().toLanguageTag();
    }

    private String mapErrorCode(int errorCode) {
        switch (errorCode) {
            case SpeechRecognizer.ERROR_AUDIO:
                return "audio-capture";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
            case SpeechRecognizer.ERROR_SERVER:
                return "network";
            case SpeechRecognizer.ERROR_NO_MATCH:
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                return "no-speech";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "permission-denied";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                return "service-not-allowed";
            case SpeechRecognizer.ERROR_CLIENT:
                return listening ? "service-not-allowed" : "aborted";
            default:
                return "service-not-allowed";
        }
    }
}
