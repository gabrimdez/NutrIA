package com.nutria.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

class NutrIAWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (id in appWidgetIds) updateWidget(context, appWidgetManager, id)
    }

    companion object {
        private const val PREFS = "NutrIAWidget"
        private const val KEY = "caloriesLeft"

        fun updateWidget(context: Context, manager: AppWidgetManager, widgetId: Int) {
            val calories = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getInt(KEY, -1)

            val views = RemoteViews(context.packageName, R.layout.nutria_widget)
            val display = if (calories < 0) "-" else maxOf(0, calories).toString()
            views.setTextViewText(R.id.widget_calories, display)

            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("nutria://scanner")).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            val pending = PendingIntent.getActivity(
                context, widgetId, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, pending)

            manager.updateAppWidget(widgetId, views)
        }

        fun updateAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, NutrIAWidgetProvider::class.java))
            for (id in ids) updateWidget(context, manager, id)
        }
    }
}
