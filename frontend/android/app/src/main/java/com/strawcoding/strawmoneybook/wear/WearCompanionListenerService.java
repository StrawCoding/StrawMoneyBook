package com.strawcoding.strawmoneybook.wear;

import android.util.Log;
import androidx.sqlite.db.SupportSQLiteDatabase;
import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.wearable.MessageClient;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;
import com.google.android.gms.wearable.WearableListenerService;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/**
 * Phone MessageClient listener. Applies watch tx.create without Activity/WebView.
 * Nearby-first: ignore and do not reply unless the source Node is currently nearby.
 */
public class WearCompanionListenerService extends WearableListenerService {
    private static final String TAG = "WearCompanion";
    private static final String CAPABILITY_PHONE = "smb_phone";

    @Override
    public void onCreate() {
        super.onCreate();
        try {
            Wearable.getCapabilityClient(this).addLocalCapability(CAPABILITY_PHONE);
        } catch (Exception error) {
            Log.w(TAG, "addLocalCapability skipped", error);
        }
    }

    @Override
    public void onMessageReceived(MessageEvent event) {
        String path = event.getPath();
        String nodeId = event.getSourceNodeId();
        boolean nearby = isNearby(nodeId);
        if (!WearMessageDispatcher.shouldHandleIncoming(nearby, path)) {
            Log.i(TAG, "ignore wear message path=" + path + " nearby=" + nearby);
            return;
        }

        try {
            String raw = new String(event.getData() == null ? new byte[0] : event.getData(), StandardCharsets.UTF_8);
            JSONObject envelope = raw.isEmpty() ? new JSONObject() : WearProtocol.parseEnvelope(raw);
            if (WearCompanionConstants.PATH_TX_CREATE.equals(path)) {
                JSONObject ack = WearTransactionEngine.applyTxCreate(
                    this,
                    envelope,
                    WearActiveLedgerStore.getActiveLedgerId(this)
                );
                sendNearby(nodeId, WearCompanionConstants.PATH_TX_ACK, ack);
                return;
            }
            if (WearCompanionConstants.PATH_HELLO.equals(path)
                || WearCompanionConstants.PATH_SNAPSHOT_REQUEST.equals(path)) {
                AndroidDbRepository repo = AndroidDbRepository.get(this);
                JSONObject reply = repo.withWriteLock(() -> {
                    SupportSQLiteDatabase db = repo.openForWrite();
                    return WearCompanionConstants.PATH_HELLO.equals(path)
                        ? WearTransactionEngine.buildHello(db, WearActiveLedgerStore.getActiveLedgerId(this))
                        : WearTransactionEngine.buildSnapshot(db, WearActiveLedgerStore.getActiveLedgerId(this));
                });
                String replyPath = WearCompanionConstants.PATH_HELLO.equals(path)
                    ? WearCompanionConstants.PATH_HELLO
                    : WearCompanionConstants.PATH_SNAPSHOT_PAYLOAD;
                sendNearby(nodeId, replyPath, reply);
            }
        } catch (Exception error) {
            Log.e(TAG, "wear message failed", error);
            try {
                JSONObject nack = WearProtocol.ack(
                    "rejected",
                    "",
                    null,
                    String.valueOf(error.getMessage())
                );
                sendNearby(nodeId, WearCompanionConstants.PATH_TX_ACK, nack);
            } catch (Exception ignored) {
                // best-effort nack
            }
        }
    }

    private boolean isNearby(String nodeId) {
        try {
            List<Node> nodes = Tasks.await(
                Wearable.getNodeClient(this).getConnectedNodes(),
                3,
                TimeUnit.SECONDS
            );
            for (Node node : nodes) {
                if (node.getId().equals(nodeId)) {
                    return node.isNearby();
                }
            }
        } catch (Exception error) {
            Log.w(TAG, "nearby lookup failed", error);
        }
        return false;
    }

    private void sendNearby(String nodeId, String path, JSONObject body) {
        if (!WearMessageDispatcher.shouldSendReply(isNearby(nodeId), path)) {
            Log.i(TAG, "skip wear reply path=" + path);
            return;
        }
        try {
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            MessageClient client = Wearable.getMessageClient(this);
            Tasks.await(client.sendMessage(nodeId, path, bytes), 5, TimeUnit.SECONDS);
        } catch (Exception error) {
            Log.w(TAG, "wear reply failed", error);
        }
    }
}
