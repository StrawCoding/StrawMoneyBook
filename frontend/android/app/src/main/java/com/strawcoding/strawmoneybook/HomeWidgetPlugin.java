package com.strawcoding.strawmoneybook;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.text.NumberFormat;
import java.util.Currency;
import java.util.Locale;

@CapacitorPlugin(name = "HomeWidget")
public class HomeWidgetPlugin extends Plugin {
    private static final String PREFS_NAME = "strawmoneybook.home_widget";
    private static final String KEY_INCOME_MINOR = "income_minor";
    private static final String KEY_EXPENSE_MINOR = "expense_minor";
    private static final String KEY_CURRENCY_CODE = "currency_code";

    @PluginMethod
    public void updateSummary(PluginCall call) {
        SharedPreferences prefs = getPreferences();
        prefs.edit()
            .putLong(KEY_INCOME_MINOR, Math.max(0L, readLong(call, "incomeMinor")))
            .putLong(KEY_EXPENSE_MINOR, Math.max(0L, readLong(call, "expenseMinor")))
            .putString(KEY_CURRENCY_CODE, normalizeCurrencyCode(call.getString("currencyCode")))
            .apply();
        refreshWidgets(getContext());

        JSObject result = new JSObject();
        result.put("updated", true);
        call.resolve(result);
    }

    @PluginMethod
    public void clearSummary(PluginCall call) {
        SharedPreferences prefs = getPreferences();
        prefs.edit()
            .putLong(KEY_INCOME_MINOR, 0L)
            .putLong(KEY_EXPENSE_MINOR, 0L)
            .putString(KEY_CURRENCY_CODE, "TWD")
            .apply();
        refreshWidgets(getContext());

        JSObject result = new JSObject();
        result.put("cleared", true);
        call.resolve(result);
    }

    static void refreshWidgets(Context context) {
        if (context == null) return;
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        ComponentName widgetComponent = new ComponentName(context, StrawMoneyWidgetProvider.class);
        int[] appWidgetIds = appWidgetManager.getAppWidgetIds(widgetComponent);
        if (appWidgetIds == null || appWidgetIds.length == 0) return;
        updateWidgets(context, appWidgetManager, appWidgetIds);
    }

    static void updateWidgets(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        if (context == null || appWidgetManager == null || appWidgetIds == null || appWidgetIds.length == 0) return;

        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        long incomeMinor = Math.max(0L, prefs.getLong(KEY_INCOME_MINOR, 0L));
        long expenseMinor = Math.max(0L, prefs.getLong(KEY_EXPENSE_MINOR, 0L));
        String currencyCode = normalizeCurrencyCode(prefs.getString(KEY_CURRENCY_CODE, "TWD"));
        long netMinor = incomeMinor - expenseMinor;

        String incomeText = context.getString(
            R.string.widget_label_income_prefix,
            formatMoney(incomeMinor, currencyCode)
        );
        String expenseText = context.getString(
            R.string.widget_label_expense_prefix,
            formatMoney(expenseMinor, currencyCode)
        );

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.home_widget);
            views.setTextViewText(R.id.widget_title, context.getString(R.string.widget_title_month_summary));
            views.setTextViewText(R.id.widget_net, formatMoney(netMinor, currencyCode));
            views.setTextViewText(R.id.widget_income, incomeText);
            views.setTextViewText(R.id.widget_expense, expenseText);
            views.setTextViewText(R.id.widget_analysis_button, context.getString(R.string.widget_action_analysis));
            views.setTextViewText(R.id.widget_quick_add_button, context.getString(R.string.widget_action_quick_add));
            views.setImageViewBitmap(R.id.widget_chart, drawPieChart(incomeMinor, expenseMinor));

            PendingIntent analysisIntent = createDeepLinkPendingIntent(
                context,
                appWidgetId * 10 + 1,
                buildDeepLink(context, "analysis")
            );
            PendingIntent quickAddIntent = createDeepLinkPendingIntent(
                context,
                appWidgetId * 10 + 2,
                buildDeepLink(context, "home?quickAdd=1")
            );

            views.setOnClickPendingIntent(R.id.widget_root, analysisIntent);
            views.setOnClickPendingIntent(R.id.widget_chart, analysisIntent);
            views.setOnClickPendingIntent(R.id.widget_analysis_button, analysisIntent);
            views.setOnClickPendingIntent(R.id.widget_quick_add_button, quickAddIntent);

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }

    private SharedPreferences getPreferences() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private static String normalizeCurrencyCode(String currencyCode) {
        String normalized = currencyCode == null ? "" : currencyCode.trim().toUpperCase(Locale.US);
        return normalized.isEmpty() ? "TWD" : normalized;
    }

    private static PendingIntent createDeepLinkPendingIntent(Context context, int requestCode, String deepLink) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(deepLink), context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getActivity(context, requestCode, intent, flags);
    }

    private static String buildDeepLink(Context context, String route) {
        String scheme = context.getString(R.string.custom_url_scheme);
        String normalizedRoute = route == null ? "" : route.trim();
        return scheme + "://" + normalizedRoute;
    }

    private static String formatMoney(long amountMinor, String currencyCode) {
        NumberFormat formatter = NumberFormat.getCurrencyInstance(Locale.getDefault());
        try {
            formatter.setCurrency(Currency.getInstance(currencyCode));
        } catch (Exception ignored) {
            // Ignore invalid currency codes and keep locale default.
        }
        return formatter.format(amountMinor / 100d);
    }

    private static Bitmap drawPieChart(long incomeMinor, long expenseMinor) {
        final int sizePx = 220;
        final float strokeWidth = 28f;
        final float margin = 20f;
        Bitmap bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);

        Paint basePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        basePaint.setStyle(Paint.Style.STROKE);
        basePaint.setStrokeWidth(strokeWidth);
        basePaint.setStrokeCap(Paint.Cap.ROUND);
        basePaint.setColor(0x22FFFFFF);

        Paint incomePaint = new Paint(basePaint);
        incomePaint.setColor(0xFF57C785);

        Paint expensePaint = new Paint(basePaint);
        expensePaint.setColor(0xFFFF7B72);

        RectF rect = new RectF(margin, margin, sizePx - margin, sizePx - margin);
        canvas.drawArc(rect, 0f, 360f, false, basePaint);

        long total = Math.max(0L, incomeMinor) + Math.max(0L, expenseMinor);
        if (total <= 0L) {
            return bitmap;
        }

        float incomeSweep = 360f * Math.max(0L, incomeMinor) / (float) total;
        float expenseSweep = 360f * Math.max(0L, expenseMinor) / (float) total;
        if (incomeSweep > 0f) {
            canvas.drawArc(rect, -90f, incomeSweep, false, incomePaint);
        }
        if (expenseSweep > 0f) {
            canvas.drawArc(rect, -90f + incomeSweep, expenseSweep, false, expensePaint);
        }
        return bitmap;
    }

    private static long readLong(PluginCall call, String key) {
        Long value = call.getLong(key);
        return value == null ? 0L : value;
    }
}
