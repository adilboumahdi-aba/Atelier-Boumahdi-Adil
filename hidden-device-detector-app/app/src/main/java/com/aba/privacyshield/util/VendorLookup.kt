package com.aba.privacyshield.util

/**
 * Correspondance heuristique et non-exhaustive entre préfixes OUI (constructeur) et fabricants
 * connus de caméras / matériel de vidéosurveillance. Sert d'indice, pas de preuve : de nombreux
 * appareils légitimes (routeurs, box TV) peuvent partager des préfixes proches.
 */
object VendorLookup {
    private val OUI_PREFIXES = mapOf(
        "00:40:8C" to "Hikvision",
        "4C:11:BF" to "Hikvision",
        "C0:56:E3" to "Hikvision",
        "AC:CC:8E" to "Dahua Technology",
        "3C:EF:8C" to "Dahua Technology",
        "00:12:41" to "Dahua Technology",
        "44:19:B6" to "TP-Link (Tapo)",
        "50:C7:BF" to "TP-Link",
        "2C:AA:8E" to "Wyze Labs",
        "7C:A7:B0" to "Wyze Labs",
        "B0:C5:54" to "Reolink",
        "EC:71:DB" to "Amcrest",
        "24:0A:C4" to "Espressif (module IoT/ESP32 — souvent caméras artisanales)",
        "AC:67:B2" to "Espressif (module IoT/ESP32)",
        "3C:61:05" to "Espressif (module IoT/ESP32)",
        "B8:27:EB" to "Raspberry Pi (souvent caméra DIY)",
        "DC:A6:32" to "Raspberry Pi (souvent caméra DIY)",
    )

    fun lookupVendor(mac: String): String? {
        val normalized = mac.uppercase().replace("-", ":")
        val prefix = normalized.split(":").take(3).joinToString(":")
        return OUI_PREFIXES[prefix]
    }
}
