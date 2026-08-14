package com.strawcoding.strawmoneybook.wear;

import android.util.Log;
import androidx.sqlite.db.SupportSQLiteDatabase;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.wearable.CapabilityClient;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

@CapacitorPlugin(name = "WearCompanion")
public class WearCompanionPlugin extends Plugin {
    private static final String TAG = "WearCompanion";
    private static final String CAPABILITY_WATCH = "smb_watch";

    @Override
    public void load() {
        String ledgerId = WearActiveLedgerStore.getActiveLedgerId(getContext());
        Log.i(TAG, "WearCompanion plugin loaded activeLedger=" + ledgerId);
    }

    @PluginMethod
    public void setActiveLedger(PluginCall call) {
        String ledgerId = call.getString("ledgerId", "");
        WearActiveLedgerStore.setActiveLedgerId(getContext(), ledgerId);
        JSObject result = new JSObject();
        result.put("ok", true);
        call.resolve(result);
    }

    @PluginMethod
    public void applyTxCreate(PluginCall call) {
        try {
            JSONObject payload = call.getObject("payload");
            if (payload == null) {
                payload = call.getData();
            }
            String activeLedgerId = call.getString(
                "activeLedgerId",
                WearActiveLedgerStore.getActiveLedgerId(getContext())
            );
            JSONObject ack = WearTransactionEngine.applyTxCreate(getContext(), payload, activeLedgerId);
            call.resolve(JSObject.fromJSONObject(ack));
        } catch (Exception error) {
            call.reject(String.valueOf(error.getMessage()), error);
        }
    }

    @PluginMethod
    public void getSyncState(PluginCall call) {
        try {
            AndroidDbRepository repo = AndroidDbRepository.get(getContext());
            JSONObject hello = repo.withWriteLock(() -> {
                SupportSQLiteDatabase db = repo.openForWrite();
                return WearTransactionEngine.buildHello(
                    db,
                    WearActiveLedgerStore.getActiveLedgerId(getContext())
                );
            });
            call.resolve(JSObject.fromJSONObject(hello));
        } catch (Exception error) {
            call.reject(String.valueOf(error.getMessage()), error);
        }
    }

    @PluginMethod
    public void getConnectionStatus(PluginCall call) {
        JSObject result = new JSObject();
        JSArray nodes = new JSArray();
        boolean anyNearby = false;
        try {
            List<Node> connected = Tasks.await(
                Wearable.getNodeClient(getContext()).getConnectedNodes(),
                3,
                TimeUnit.SECONDS
            );
            for (Node node : connected) {
                JSObject item = new JSObject();
                item.put("id", node.getId());
                item.put("displayName", node.getDisplayName());
                item.put("nearby", node.isNearby());
                nodes.put(item);
                if (node.isNearby()) {
                    anyNearby = true;
                }
            }
            try {
                Tasks.await(
                    Wearable.getCapabilityClient(getContext()).getCapability(
                        CAPABILITY_WATCH,
                        CapabilityClient.FILTER_REACHABLE
                    ),
                    3,
                    TimeUnit.SECONDS
                );
            } catch (Exception ignored) {
                // capability optional
            }
        } catch (Exception error) {
            Log.w(TAG, "connection status lookup failed", error);
            result.put("error", String.valueOf(error.getMessage()));
        }

        try {
            AndroidDbRepository repo = AndroidDbRepository.get(getContext());
            JSONObject hello = repo.withWriteLock(() -> {
                SupportSQLiteDatabase db = repo.openForWrite();
                return WearTransactionEngine.buildHello(
                    db,
                    WearActiveLedgerStore.getActiveLedgerId(getContext())
                );
            });
            result.put("syncEpoch", hello.optString("syncEpoch", ""));
            result.put("snapshotRevision", hello.optLong("snapshotRevision", 0L));
            result.put("catalogRevision", hello.optLong("catalogRevision", 0L));
            result.put("activeLedgerId", hello.optString("activeLedgerId", ""));
            result.put("schemaVersion", hello.optLong("schemaVersion", 0L));
        } catch (Exception error) {
            result.put("dbError", String.valueOf(error.getMessage()));
        }

        result.put("nodes", nodes);
        result.put("nearby", anyNearby);
        result.put("supported", true);
        call.resolve(result);
    }
}
