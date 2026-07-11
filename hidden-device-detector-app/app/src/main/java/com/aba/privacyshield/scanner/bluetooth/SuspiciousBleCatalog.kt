package com.aba.privacyshield.scanner.bluetooth

/**
 * Heuristiques de détection sur les annonces BLE. Ce ne sont que des indices statistiques :
 * un faux positif (écouteurs, montre connectée) reste possible, une vérification physique
 * est toujours nécessaire.
 */
object SuspiciousBleCatalog {

    private val SUSPICIOUS_NAME_PATTERNS = listOf(
        Regex("(?i)cam"),
        Regex("(?i)spy"),
        Regex("(?i)ipcam"),
        Regex("(?i)dvr"),
        Regex("(?i)hidden"),
        Regex("(?i)mini.?cam"),
        Regex("(?i)^sq\\d"), // familles de mini-caméras espion type "SQ11", "SQ8"
    )

    fun isSuspiciousName(name: String?): Boolean {
        if (name.isNullOrBlank()) return false
        return SUSPICIOUS_NAME_PATTERNS.any { it.containsMatchIn(name) }
    }

    /** Un appareil sans nom annoncé et à signal très fort mérite d'être physiquement recherché. */
    fun isSuspiciousUnnamedStrongSignal(name: String?, rssi: Int): Boolean =
        name.isNullOrBlank() && rssi > -55
}
