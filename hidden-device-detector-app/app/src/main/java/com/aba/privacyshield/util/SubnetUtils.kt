package com.aba.privacyshield.util

import android.content.Context
import android.net.ConnectivityManager
import java.net.Inet4Address

object SubnetUtils {

    data class LocalNetworkInfo(val localIp: String, val prefixLength: Int)

    fun getLocalIpv4(context: Context): LocalNetworkInfo? {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return null
        val network = cm.activeNetwork ?: return null
        val linkProperties = cm.getLinkProperties(network) ?: return null
        val linkAddress = linkProperties.linkAddresses.firstOrNull { it.address is Inet4Address }
            ?: return null
        val ip = linkAddress.address.hostAddress ?: return null
        return LocalNetworkInfo(localIp = ip, prefixLength = linkAddress.prefixLength)
    }

    /**
     * Retourne les adresses IPv4 à sonder. Le scan est volontairement borné à un /24
     * (254 hôtes max) autour de l'adresse locale pour rester rapide sur mobile, même si
     * le masque réel du réseau est plus large.
     */
    fun hostsToScan(localIp: String, prefixLength: Int): List<String> {
        val octets = localIp.split(".").mapNotNull { it.toIntOrNull() }
        if (octets.size != 4) return emptyList()

        val effectivePrefix = maxOf(prefixLength, 24)
        val hostBits = 32 - effectivePrefix
        if (hostBits <= 0 || hostBits > 16) return emptyList()

        val ipInt = (octets[0] shl 24) or (octets[1] shl 16) or (octets[2] shl 8) or octets[3]
        val mask = -1 shl hostBits
        val networkAddress = ipInt and mask
        val hostCount = (1 shl hostBits) - 2
        if (hostCount <= 0) return emptyList()

        return (1..hostCount).map { hostOffset -> intToIp(networkAddress or hostOffset) }
    }

    private fun intToIp(value: Int): String =
        "${(value shr 24) and 0xFF}.${(value shr 16) and 0xFF}.${(value shr 8) and 0xFF}.${value and 0xFF}"
}
