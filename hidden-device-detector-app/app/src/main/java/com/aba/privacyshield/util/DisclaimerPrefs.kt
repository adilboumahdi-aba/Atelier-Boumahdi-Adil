package com.aba.privacyshield.util

import android.content.Context

/** Petit drapeau local (aucune synchronisation) pour ne montrer l'avertissement légal qu'une fois. */
object DisclaimerPrefs {
    private const val PREFS_NAME = "privacy_shield_prefs"
    private const val KEY_ACCEPTED = "disclaimer_accepted"

    fun hasAccepted(context: Context): Boolean =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getBoolean(KEY_ACCEPTED, false)

    fun setAccepted(context: Context) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_ACCEPTED, true)
            .apply()
    }
}
