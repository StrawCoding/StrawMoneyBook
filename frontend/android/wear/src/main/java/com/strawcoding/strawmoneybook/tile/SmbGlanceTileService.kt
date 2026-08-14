package com.strawcoding.strawmoneybook.tile

import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DimensionBuilders.expand
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.protolayout.material.Colors
import androidx.wear.protolayout.material.Text
import androidx.wear.protolayout.material.Typography
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.strawcoding.strawmoneybook.data.WearCacheStore
import java.text.NumberFormat
import java.util.Locale

/** Glance tile: today spend + nearby status. Complication deferred to P1. */
class SmbGlanceTileService : TileService() {
    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> {
        val cache = WearCacheStore(this)
        val spend = NumberFormat.getCurrencyInstance(Locale.TAIWAN).format(cache.todaySpendMinor() / 100.0)
        val status = if (cache.isNearby()) "已連線" else "離線"
        val text = Text.Builder(this, "今日 $spend\n$status")
            .setTypography(Typography.TYPOGRAPHY_TITLE3)
            .setColor(argb(Colors.DEFAULT.onSurface))
            .setMaxLines(3)
            .build()
        val root = LayoutElementBuilders.Box.Builder()
            .setWidth(expand())
            .setHeight(expand())
            .addContent(text)
            .build()
        val timeline = TimelineBuilders.Timeline.Builder()
            .addTimelineEntry(
                TimelineBuilders.TimelineEntry.Builder()
                    .setLayout(LayoutElementBuilders.Layout.Builder().setRoot(root).build())
                    .build(),
            )
            .build()
        return Futures.immediateFuture(
            TileBuilders.Tile.Builder()
                .setResourcesVersion(RESOURCES_VERSION)
                .setTileTimeline(timeline)
                .build(),
        )
    }

    override fun onTileResourcesRequest(
        requestParams: RequestBuilders.ResourcesRequest,
    ): ListenableFuture<ResourceBuilders.Resources> {
        return Futures.immediateFuture(
            ResourceBuilders.Resources.Builder().setVersion(RESOURCES_VERSION).build(),
        )
    }

    companion object {
        private const val RESOURCES_VERSION = "1"
    }
}
