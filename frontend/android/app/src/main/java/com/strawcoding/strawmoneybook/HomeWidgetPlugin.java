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
import android.os.Bundle;
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
    public enum WidgetKind {
        SUMMARY,
        PIE_CHART,
        BAR_CHART,
        QUICK_ADD,
        AI_BOOKKEEPING
    }

    private enum SizeBucket {
        SMALL,
        MEDIUM,
        LARGE
    }

    private static final class WidgetRegistration {
        final Class<?> providerClass;
        final WidgetKind kind;

        WidgetRegistration(Class<?> providerClass, WidgetKind kind) {
            this.providerClass = providerClass;
            this.kind = kind;
        }
    }

    private static final class WidgetState {
        final long incomeMinor;
        final long expenseMinor;
        final String currencyCode;
        final String ledgerName;

        WidgetState(long incomeMinor, long expenseMinor, String currencyCode, String ledgerName) {
            this.incomeMinor = Math.max(0L, incomeMinor);
            this.expenseMinor = Math.max(0L, expenseMinor);
            this.currencyCode = normalizeCurrencyCode(currencyCode);
            this.ledgerName = normalizeLedgerName(ledgerName);
        }

        long netMinor() {
            return incomeMinor - expenseMinor;
        }
    }

    private static final String PREFS_NAME = "strawmoneybook.home_widget";
    private static final String KEY_INCOME_MINOR = "income_minor";
    private static final String KEY_EXPENSE_MINOR = "expense_minor";
    private static final String KEY_CURRENCY_CODE = "currency_code";
    private static final String KEY_LEDGER_NAME = "ledger_name";

    private static final WidgetRegistration[] WIDGET_REGISTRATIONS = new WidgetRegistration[] {
        new WidgetRegistration(StrawMoneyWidgetProvider.class, WidgetKind.SUMMARY),
        new WidgetRegistration(StrawMoneyPieChartWidgetProvider.class, WidgetKind.PIE_CHART),
        new WidgetRegistration(StrawMoneyBarChartWidgetProvider.class, WidgetKind.BAR_CHART),
        new WidgetRegistration(StrawMoneyQuickAddWidgetProvider.class, WidgetKind.QUICK_ADD),
        new WidgetRegistration(StrawMoneyAiBookkeepingWidgetProvider.class, WidgetKind.AI_BOOKKEEPING),
    };

    @PluginMethod
    public void updateSummary(PluginCall call) {
        SharedPreferences prefs = getPreferences();
        prefs.edit()
            .putLong(KEY_INCOME_MINOR, Math.max(0L, readLong(call, "incomeMinor")))
            .putLong(KEY_EXPENSE_MINOR, Math.max(0L, readLong(call, "expenseMinor")))
            .putString(KEY_CURRENCY_CODE, normalizeCurrencyCode(call.getString("currencyCode")))
            .putString(KEY_LEDGER_NAME, normalizeLedgerName(call.getString("ledgerName")))
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
            .putString(KEY_LEDGER_NAME, "")
            .apply();
        refreshWidgets(getContext());

        JSObject result = new JSObject();
        result.put("cleared", true);
        call.resolve(result);
    }

    static void refreshWidgets(Context context) {
        if (context == null) return;
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        for (WidgetRegistration registration : WIDGET_REGISTRATIONS) {
            ComponentName componentName = new ComponentName(context, registration.providerClass);
            int[] appWidgetIds = appWidgetManager.getAppWidgetIds(componentName);
            updateWidgets(context, appWidgetManager, appWidgetIds, registration.kind);
        }
    }

    static void updateWidgets(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds, WidgetKind kind) {
        if (context == null || appWidgetManager == null || appWidgetIds == null || appWidgetIds.length == 0) return;

        WidgetState state = loadState(context);
        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = buildRemoteViews(context, appWidgetManager, appWidgetId, kind, state);
            if (views == null) continue;
            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }

    private static WidgetState loadState(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return new WidgetState(
            prefs.getLong(KEY_INCOME_MINOR, 0L),
            prefs.getLong(KEY_EXPENSE_MINOR, 0L),
            prefs.getString(KEY_CURRENCY_CODE, "TWD"),
            prefs.getString(KEY_LEDGER_NAME, "")
        );
    }

    private static RemoteViews buildRemoteViews(
        Context context,
        AppWidgetManager appWidgetManager,
        int appWidgetId,
        WidgetKind kind,
        WidgetState state
    ) {
        SizeBucket sizeBucket = resolveSizeBucket(appWidgetManager.getAppWidgetOptions(appWidgetId));
        switch (kind) {
            case SUMMARY:
                return buildSummaryViews(context, appWidgetId, state);
            case PIE_CHART:
                return buildPieChartViews(context, appWidgetId, sizeBucket, state);
            case BAR_CHART:
                return buildBarChartViews(context, appWidgetId, sizeBucket, state);
            case QUICK_ADD:
                return buildQuickActionViews(context, appWidgetId, sizeBucket, kind, state);
            case AI_BOOKKEEPING:
                return buildQuickActionViews(context, appWidgetId, sizeBucket, kind, state);
            default:
                return null;
        }
    }

    private static RemoteViews buildSummaryViews(Context context, int appWidgetId, WidgetState state) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.home_widget);
        String incomeText = context.getString(
            R.string.widget_label_income_prefix,
            formatMoney(state.incomeMinor, state.currencyCode)
        );
        String expenseText = context.getString(
            R.string.widget_label_expense_prefix,
            formatMoney(state.expenseMinor, state.currencyCode)
        );

        views.setTextViewText(R.id.widget_title, context.getString(R.string.widget_title_month_summary));
        views.setTextViewText(R.id.widget_net, formatMoney(state.netMinor(), state.currencyCode));
        views.setTextViewText(R.id.widget_income, incomeText);
        views.setTextViewText(R.id.widget_expense, expenseText);
        views.setTextViewText(R.id.widget_analysis_button, context.getString(R.string.widget_action_analysis));
        views.setTextViewText(R.id.widget_quick_add_button, context.getString(R.string.widget_action_quick_add));
        views.setImageViewBitmap(R.id.widget_chart, drawPieChart(state.incomeMinor, state.expenseMinor, 220));

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
        return views;
    }

    private static RemoteViews buildPieChartViews(Context context, int appWidgetId, SizeBucket sizeBucket, WidgetState state) {
        int layoutId;
        int chartSizePx;
        switch (sizeBucket) {
            case LARGE:
                layoutId = R.layout.widget_pie_chart_large;
                chartSizePx = 320;
                break;
            case MEDIUM:
                layoutId = R.layout.widget_pie_chart_medium;
                chartSizePx = 260;
                break;
            default:
                layoutId = R.layout.widget_pie_chart_small;
                chartSizePx = 200;
                break;
        }

        RemoteViews views = new RemoteViews(context.getPackageName(), layoutId);
        bindChartTexts(
            context,
            views,
            R.string.widget_title_pie_chart,
            state
        );
        views.setImageViewBitmap(R.id.widget_chart, drawPieChart(state.incomeMinor, state.expenseMinor, chartSizePx));

        PendingIntent analysisIntent = createDeepLinkPendingIntent(
            context,
            appWidgetId * 10 + 11,
            buildDeepLink(context, "analysis")
        );
        views.setOnClickPendingIntent(R.id.widget_root, analysisIntent);
        views.setOnClickPendingIntent(R.id.widget_chart, analysisIntent);
        return views;
    }

    private static RemoteViews buildBarChartViews(Context context, int appWidgetId, SizeBucket sizeBucket, WidgetState state) {
        int layoutId;
        int chartWidthPx;
        int chartHeightPx;
        switch (sizeBucket) {
            case LARGE:
                layoutId = R.layout.widget_bar_chart_large;
                chartWidthPx = 520;
                chartHeightPx = 240;
                break;
            case MEDIUM:
                layoutId = R.layout.widget_bar_chart_medium;
                chartWidthPx = 420;
                chartHeightPx = 180;
                break;
            default:
                layoutId = R.layout.widget_bar_chart_small;
                chartWidthPx = 320;
                chartHeightPx = 140;
                break;
        }

        RemoteViews views = new RemoteViews(context.getPackageName(), layoutId);
        bindChartTexts(
            context,
            views,
            R.string.widget_title_bar_chart,
            state
        );
        views.setImageViewBitmap(R.id.widget_chart, drawBarChart(state.incomeMinor, state.expenseMinor, chartWidthPx, chartHeightPx));

        PendingIntent analysisIntent = createDeepLinkPendingIntent(
            context,
            appWidgetId * 10 + 21,
            buildDeepLink(context, "analysis")
        );
        views.setOnClickPendingIntent(R.id.widget_root, analysisIntent);
        views.setOnClickPendingIntent(R.id.widget_chart, analysisIntent);
        return views;
    }

    private static RemoteViews buildQuickActionViews(
        Context context,
        int appWidgetId,
        SizeBucket sizeBucket,
        WidgetKind kind,
        WidgetState state
    ) {
        final boolean isAi = kind == WidgetKind.AI_BOOKKEEPING;
        int layoutId;
        switch (sizeBucket) {
            case LARGE:
                layoutId = isAi ? R.layout.widget_ai_bookkeeping_large : R.layout.widget_quick_add_large;
                break;
            case MEDIUM:
                layoutId = isAi ? R.layout.widget_ai_bookkeeping_medium : R.layout.widget_quick_add_medium;
                break;
            default:
                layoutId = isAi ? R.layout.widget_ai_bookkeeping_small : R.layout.widget_quick_add_small;
                break;
        }

        RemoteViews views = new RemoteViews(context.getPackageName(), layoutId);
        views.setTextViewText(
            R.id.widget_title,
            context.getString(isAi ? R.string.widget_title_ai_bookkeeping : R.string.widget_title_quick_add)
        );
        setTextOrHide(views, R.id.widget_subtitle, state.ledgerName);
        setTextOrHide(
            views,
            R.id.widget_primary_action,
            context.getString(isAi ? R.string.widget_action_ai_bookkeeping_primary : R.string.widget_action_quick_add_primary)
        );
        setTextOrHide(
            views,
            R.id.widget_secondary_action,
            context.getString(isAi ? R.string.widget_action_ai_bookkeeping_secondary : R.string.widget_action_quick_add_secondary)
        );

        PendingIntent actionIntent = createDeepLinkPendingIntent(
            context,
            appWidgetId * 10 + (isAi ? 31 : 41),
            buildDeepLink(context, isAi ? "ai-auto-bookkeeping" : "transactions/quick-add")
        );
        views.setOnClickPendingIntent(R.id.widget_root, actionIntent);
        views.setOnClickPendingIntent(R.id.widget_primary_action, actionIntent);
        return views;
    }

    private static void bindChartTexts(Context context, RemoteViews views, int titleResId, WidgetState state) {
        views.setTextViewText(R.id.widget_title, context.getString(titleResId));
        setTextOrHide(views, R.id.widget_subtitle, state.ledgerName);
        setTextOrHide(
            views,
            R.id.widget_net,
            context.getString(R.string.widget_label_net_prefix, formatMoney(state.netMinor(), state.currencyCode))
        );
        setTextOrHide(
            views,
            R.id.widget_income,
            context.getString(R.string.widget_label_income_prefix, formatMoney(state.incomeMinor, state.currencyCode))
        );
        setTextOrHide(
            views,
            R.id.widget_expense,
            context.getString(R.string.widget_label_expense_prefix, formatMoney(state.expenseMinor, state.currencyCode))
        );
    }

    private static void setTextOrHide(RemoteViews views, int viewId, String text) {
        String normalized = text == null ? "" : text.trim();
        if (normalized.isEmpty()) {
            views.setViewVisibility(viewId, android.view.View.GONE);
            views.setTextViewText(viewId, "");
            return;
        }
        views.setViewVisibility(viewId, android.view.View.VISIBLE);
        views.setTextViewText(viewId, normalized);
    }

    private SharedPreferences getPreferences() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private static String normalizeCurrencyCode(String currencyCode) {
        String normalized = currencyCode == null ? "" : currencyCode.trim().toUpperCase(Locale.US);
        return normalized.isEmpty() ? "TWD" : normalized;
    }

    private static String normalizeLedgerName(String ledgerName) {
        return ledgerName == null ? "" : ledgerName.trim();
    }

    private static SizeBucket resolveSizeBucket(Bundle options) {
        if (options == null) return SizeBucket.MEDIUM;
        int minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        int minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
        if (minWidth >= 250 || minHeight >= 180) {
            return SizeBucket.LARGE;
        }
        if (minWidth >= 170 || minHeight >= 110) {
            return SizeBucket.MEDIUM;
        }
        return SizeBucket.SMALL;
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
        String normalizedRoute = route == null ? "" : route.trim().replaceAll("^/+", "");
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

    private static Bitmap drawPieChart(long incomeMinor, long expenseMinor, int sizePx) {
        final float strokeWidth = Math.max(20f, sizePx * 0.13f);
        final float margin = Math.max(18f, sizePx * 0.11f);
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

    private static Bitmap drawBarChart(long incomeMinor, long expenseMinor, int widthPx, int heightPx) {
        Bitmap bitmap = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);

        float paddingX = widthPx * 0.1f;
        float barHeight = Math.max(18f, heightPx * 0.18f);
        float gap = Math.max(18f, heightPx * 0.16f);
        float top = (heightPx - (barHeight * 2f) - gap) / 2f;
        float trackWidth = widthPx - (paddingX * 2f);
        float radius = barHeight / 2f;
        long maxAmount = Math.max(Math.max(1L, incomeMinor), Math.max(1L, expenseMinor));

        Paint trackPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        trackPaint.setColor(0x22FFFFFF);

        Paint incomePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        incomePaint.setColor(0xFF57C785);

        Paint expensePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        expensePaint.setColor(0xFFFF7B72);

        RectF incomeTrack = new RectF(paddingX, top, paddingX + trackWidth, top + barHeight);
        RectF expenseTrack = new RectF(paddingX, top + barHeight + gap, paddingX + trackWidth, top + (barHeight * 2f) + gap);
        canvas.drawRoundRect(incomeTrack, radius, radius, trackPaint);
        canvas.drawRoundRect(expenseTrack, radius, radius, trackPaint);

        float incomeWidth = trackWidth * Math.max(0L, incomeMinor) / (float) maxAmount;
        float expenseWidth = trackWidth * Math.max(0L, expenseMinor) / (float) maxAmount;
        if (incomeWidth > 0f) {
            canvas.drawRoundRect(
                new RectF(paddingX, top, paddingX + incomeWidth, top + barHeight),
                radius,
                radius,
                incomePaint
            );
        }
        if (expenseWidth > 0f) {
            canvas.drawRoundRect(
                new RectF(paddingX, top + barHeight + gap, paddingX + expenseWidth, top + (barHeight * 2f) + gap),
                radius,
                radius,
                expensePaint
            );
        }
        return bitmap;
    }

    private static long readLong(PluginCall call, String key) {
        Long value = call.getLong(key);
        return value == null ? 0L : value;
    }
}
