package com.strawcoding.strawmoneybook;

public class StrawMoneyWidgetProvider extends BaseHomeWidgetProvider {
    @Override
    protected HomeWidgetPlugin.WidgetKind getWidgetKind() {
        return HomeWidgetPlugin.WidgetKind.SUMMARY;
    }
}
