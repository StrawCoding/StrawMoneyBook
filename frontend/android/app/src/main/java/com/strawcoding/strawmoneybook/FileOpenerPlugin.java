package com.strawcoding.strawmoneybook;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.webkit.MimeTypeMap;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.Locale;

@CapacitorPlugin(name = "FileOpener")
public class FileOpenerPlugin extends Plugin {
    @PluginMethod
    public void openFile(PluginCall call) {
        String rawUri = normalize(call.getString("uri"));
        if (rawUri.isEmpty()) {
            call.reject("缺少檔案 URI");
            return;
        }

        Uri targetUri = resolveContentUri(rawUri);
        if (targetUri == null) {
            call.reject("無法解析檔案 URI");
            return;
        }

        String mimeType = resolveMimeType(targetUri, normalize(call.getString("mimeType")));
        Intent intent = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(targetUri, mimeType)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);

        try {
            Intent chooser = Intent.createChooser(intent, "開啟檔案");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);

            JSObject result = new JSObject();
            result.put("opened", true);
            result.put("uri", targetUri.toString());
            result.put("mimeType", mimeType);
            call.resolve(result);
        } catch (ActivityNotFoundException error) {
            call.reject("裝置上找不到可開啟此檔案的 App", error);
        } catch (Exception error) {
            call.reject("開啟檔案失敗", error);
        }
    }

    private Uri resolveContentUri(String rawUri) {
        Uri parsed = Uri.parse(rawUri);
        String scheme = normalize(parsed.getScheme()).toLowerCase(Locale.US);

        if ("content".equals(scheme)) {
            return parsed;
        }

        if ("file".equals(scheme)) {
            return toFileProviderUri(new File(parsed.getPath()));
        }

        if (rawUri.startsWith("/")) {
            return toFileProviderUri(new File(rawUri));
        }

        return parsed;
    }

    private Uri toFileProviderUri(File file) {
        if (file == null) return null;
        String path = normalize(file.getAbsolutePath());
        if (path.isEmpty()) return null;
        return FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            file
        );
    }

    private String resolveMimeType(Uri uri, String preferredMimeType) {
        if (!preferredMimeType.isEmpty()) {
            return preferredMimeType;
        }

        String contentType = getContext().getContentResolver().getType(uri);
        if (contentType != null && !contentType.trim().isEmpty()) {
            return contentType.trim();
        }

        String extension = MimeTypeMap.getFileExtensionFromUrl(uri.toString());
        if (extension != null && !extension.trim().isEmpty()) {
            String resolved = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension.toLowerCase(Locale.US));
            if (resolved != null && !resolved.trim().isEmpty()) {
                return resolved.trim();
            }
        }

        return "*/*";
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim();
    }
}
