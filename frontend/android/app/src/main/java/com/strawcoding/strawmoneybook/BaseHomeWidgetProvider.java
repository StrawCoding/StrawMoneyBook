package com.strawcoding.strawmoneybook;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

public abstract class BaseHomeWidgetProvider extends AppWidgetProvider {
    protected abstract HomeWidgetPlugin.WidgetKind getWidgetKind();

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        super.onUpdate(context, appWidgetManager, appWidgetIds);
        HomeWidgetPlugin.updateWidgets(context, appWidgetManager, appWidgetIds, getWidgetKind());
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager appWidgetManager, int appWidgetId, Bundle newOptions) {
        super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions);
        HomeWidgetPlugin.updateWidgets(context, appWidgetManager, new int[] { appWidgetId }, getWidgetKind());
    }

    @Override
    public void onEnabled(Context context) {
        super.onEnabled(context);
        HomeWidgetPlugin.refreshWidgets(context);
    }
}
