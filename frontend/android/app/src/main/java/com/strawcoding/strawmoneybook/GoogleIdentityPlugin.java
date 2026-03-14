package com.strawcoding.strawmoneybook;

import android.app.Activity;

import androidx.annotation.NonNull;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.GetCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

@CapacitorPlugin(name = "GoogleIdentity")
public class GoogleIdentityPlugin extends Plugin {
    private CredentialManager credentialManager;

    @Override
    public void load() {
        credentialManager = CredentialManager.create(getContext());
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("Current activity is unavailable", "google_activity_unavailable");
            return;
        }

        String serverClientId = sanitize(call.getString("serverClientId"));
        String nonce = sanitize(call.getString("nonce"));
        boolean filterByAuthorizedAccounts = Boolean.TRUE.equals(call.getBoolean("filterByAuthorizedAccounts", false));

        if (serverClientId.isEmpty()) {
            call.reject("Missing serverClientId", "google_server_client_id_required");
            return;
        }
        if (nonce.isEmpty()) {
            call.reject("Missing nonce", "google_nonce_required");
            return;
        }

        GetGoogleIdOption googleIdOption = new GetGoogleIdOption.Builder()
            .setServerClientId(serverClientId)
            .setNonce(nonce)
            .setFilterByAuthorizedAccounts(filterByAuthorizedAccounts)
            .setAutoSelectEnabled(false)
            .build();

        GetCredentialRequest request = new GetCredentialRequest.Builder()
            .addCredentialOption(googleIdOption)
            .build();

        credentialManager.getCredentialAsync(
            activity,
            request,
            null,
            activity.getMainExecutor(),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse result) {
                    try {
                        Credential credential = result.getCredential();
                        if (!(credential instanceof CustomCredential)) {
                            call.reject("Unexpected credential type", "google_credential_type_invalid");
                            return;
                        }

                        CustomCredential customCredential = (CustomCredential) credential;
                        if (!GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(customCredential.getType())) {
                            call.reject("Unexpected Google credential type", "google_credential_type_invalid");
                            return;
                        }

                        GoogleIdTokenCredential googleCredential = GoogleIdTokenCredential.createFrom(customCredential.getData());
                        JSObject payload = new JSObject();
                        payload.put("idToken", sanitize(googleCredential.getIdToken()));
                        payload.put("displayName", sanitize(googleCredential.getDisplayName()));
                        payload.put("givenName", sanitize(googleCredential.getGivenName()));
                        payload.put("familyName", sanitize(googleCredential.getFamilyName()));
                        payload.put("profilePictureUri", googleCredential.getProfilePictureUri() == null ? "" : googleCredential.getProfilePictureUri().toString());
                        payload.put("email", sanitize(googleCredential.getId()));
                        call.resolve(payload);
                    } catch (Exception error) {
                        call.reject(String.valueOf(error.getMessage()), "google_parse_failed");
                    }
                }

                @Override
                public void onError(@NonNull GetCredentialException error) {
                    call.reject(errorMessage(error), errorCode(error));
                }
            }
        );
    }

    @PluginMethod
    public void clearCredentialState(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.resolve(new JSObject());
            return;
        }

        credentialManager.clearCredentialStateAsync(
            new ClearCredentialStateRequest(),
            null,
            activity.getMainExecutor(),
            new CredentialManagerCallback<Void, ClearCredentialException>() {
                @Override
                public void onResult(Void unused) {
                    JSObject result = new JSObject();
                    result.put("cleared", true);
                    call.resolve(result);
                }

                @Override
                public void onError(@NonNull ClearCredentialException error) {
                    call.reject(errorMessage(error), errorCode(error));
                }
            }
        );
    }

    private String sanitize(String value) {
        return value == null ? "" : value.trim();
    }

    private String errorCode(Exception error) {
        String name = error == null ? "" : error.getClass().getSimpleName();
        if ("GetCredentialCancellationException".equals(name)) {
            return "google_canceled";
        }
        if ("NoCredentialException".equals(name)) {
            return "google_no_credential";
        }
        if ("ClearCredentialInterruptedException".equals(name)) {
            return "google_clear_interrupted";
        }
        return "google_auth_failed";
    }

    private String errorMessage(Exception error) {
        String message = error == null ? "" : sanitize(String.valueOf(error.getMessage()));
        if (!message.isEmpty()) {
            return message;
        }
        if ("google_canceled".equals(errorCode(error))) {
            return "User canceled Google sign-in";
        }
        if ("google_no_credential".equals(errorCode(error))) {
            return "No saved Google credential found";
        }
        return "Google sign-in failed";
    }
}
