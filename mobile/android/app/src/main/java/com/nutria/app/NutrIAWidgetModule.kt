package com.nutria.app

import android.content.Context
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class NutrIAWidgetModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "NutrIAWidgetUpdater"

    @ReactMethod
    fun updateCalories(calories: Int) {
        reactContext
            .getSharedPreferences("NutrIAWidget", Context.MODE_PRIVATE)
            .edit()
            .putInt("caloriesLeft", calories)
            .apply()
        NutrIAWidgetProvider.updateAll(reactContext)
    }

    @ReactMethod
    fun clearCalories() {
        reactContext
            .getSharedPreferences("NutrIAWidget", Context.MODE_PRIVATE)
            .edit()
            .putInt("caloriesLeft", -1)
            .apply()
        NutrIAWidgetProvider.updateAll(reactContext)
    }
}
