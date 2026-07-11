package com.aba.privacyshield.util

import android.content.Context

/** Persiste localement les cases cochées de la checklist (aucune synchronisation). */
object ChecklistPrefs {
    private const val PREFS_NAME = "privacy_shield_prefs"
    private const val KEY_CHECKED_ITEMS = "checklist_checked_items"

    fun getCheckedIds(context: Context): Set<String> =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getStringSet(KEY_CHECKED_ITEMS, emptySet())
            ?.toSet() ?: emptySet()

    fun setCheckedIds(context: Context, ids: Set<String>) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putStringSet(KEY_CHECKED_ITEMS, ids)
            .apply()
    }
}
