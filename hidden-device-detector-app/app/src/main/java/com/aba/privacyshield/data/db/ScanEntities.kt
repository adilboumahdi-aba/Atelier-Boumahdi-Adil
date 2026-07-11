package com.aba.privacyshield.data.db

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

/** Une session correspond à une visite d'un lieu (ex : une chambre d'hôtel). */
@Entity(tableName = "scan_sessions")
data class ScanSessionEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val locationLabel: String,
    val createdAtEpochMs: Long,
    val notes: String = "",
)

enum class FindingType {
    CAMERA_GLINT,
    NETWORK_DEVICE,
    BLE_DEVICE,
    MAGNETIC_ANOMALY,
}

enum class RiskLevel {
    LOW,
    MEDIUM,
    HIGH,
}

/** Un élément détecté (point lumineux, appareil réseau, périphérique BLE, anomalie magnétique) rattaché à une session. */
@Entity(
    tableName = "scan_findings",
    foreignKeys = [
        ForeignKey(
            entity = ScanSessionEntity::class,
            parentColumns = ["id"],
            childColumns = ["sessionId"],
            onDelete = ForeignKey.CASCADE,
        )
    ],
    indices = [Index("sessionId")],
)
data class ScanFindingEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val sessionId: Long,
    val type: FindingType,
    val riskLevel: RiskLevel,
    val summary: String,
    val details: String,
    val createdAtEpochMs: Long,
)
