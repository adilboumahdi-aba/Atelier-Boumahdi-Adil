package com.aba.privacyshield

import android.app.Application
import com.aba.privacyshield.data.db.AppDatabase
import com.aba.privacyshield.data.repository.ScanHistoryRepository

/** Conteneur de dépendances minimal (pas de framework DI) : tout reste local à l'appareil. */
class PrivacyShieldApp : Application() {

    lateinit var scanHistoryRepository: ScanHistoryRepository
        private set

    override fun onCreate() {
        super.onCreate()
        val database = AppDatabase.getInstance(this)
        scanHistoryRepository = ScanHistoryRepository(database.scanSessionDao())
    }
}
