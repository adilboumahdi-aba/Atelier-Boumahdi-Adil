package com.aba.privacyshield.scanner.network

import java.io.File

/**
 * Lecture best-effort de la table ARP du noyau (/proc/net/arp) pour retrouver l'adresse MAC
 * d'un hôte déjà contacté. Peut renvoyer null selon la version d'Android (restrictions d'accès).
 */
object ArpTableReader {
    fun lookupMac(ip: String): String? = try {
        File("/proc/net/arp").readLines().drop(1)
            .map { it.trim().split(Regex("\\s+")) }
            .firstOrNull { it.firstOrNull() == ip }
            ?.getOrNull(3)
            ?.takeIf { it != "00:00:00:00:00:00" }
    } catch (_: Exception) {
        null
    }
}
