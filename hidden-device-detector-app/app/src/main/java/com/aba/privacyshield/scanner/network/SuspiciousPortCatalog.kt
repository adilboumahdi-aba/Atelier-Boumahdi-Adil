package com.aba.privacyshield.scanner.network

/**
 * Ports fréquemment utilisés par des caméras IP / DVR / NVR. Beaucoup de ces ports
 * (80, 443, 8080) sont partagés par des appareils parfaitement légitimes (routeur, imprimante,
 * box TV) : ils ne sont classés qu'en risque "à vérifier", jamais "élevé" à eux seuls.
 */
object SuspiciousPortCatalog {
    val CAMERA_PORTS: Map<Int, String> = mapOf(
        554 to "RTSP (flux vidéo)",
        8554 to "RTSP alternatif",
        37777 to "Dahua DVR/NVR",
        34567 to "DVR générique (Xiongmai/Hi3520)",
        5000 to "ONVIF / UPnP caméra",
        8000 to "Interface caméra IP",
        8081 to "Flux MJPEG caméra",
        8888 to "Interface caméra IP alternative",
        9000 to "Interface caméra IP alternative",
        80 to "Interface web (ambigu)",
        443 to "Interface web sécurisée (ambigu)",
        8080 to "Interface web alternative (ambigu)",
    )

    /** Ports rarement présents sur un appareil grand public non caméra : signal fort à eux seuls. */
    val HIGH_CONFIDENCE_PORTS: Set<Int> = setOf(554, 8554, 37777, 34567, 5000, 8000, 8081, 8888, 9000)
}
