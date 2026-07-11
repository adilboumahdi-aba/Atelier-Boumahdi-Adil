package com.aba.privacyshield.scanner.network

import com.aba.privacyshield.data.db.RiskLevel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.net.InetSocketAddress
import java.net.Socket
import java.util.concurrent.atomic.AtomicInteger

data class NetworkDevice(
    val ip: String,
    val openPorts: List<Int>,
    val mac: String?,
    val vendor: String?,
    val riskLevel: RiskLevel,
)

/**
 * Sonde chaque hôte du sous-réseau local sur une liste de ports typiques de caméras/DVR.
 * Aucune donnée ne quitte le réseau local : ce sont de simples tentatives de connexion TCP.
 */
class NetworkScannerEngine {

    private val candidatePorts = SuspiciousPortCatalog.CAMERA_PORTS.keys.toList()
    private val connectTimeoutMs = 350
    private val maxConcurrentHosts = 32

    suspend fun scan(
        hosts: List<String>,
        onProgress: (scanned: Int, total: Int) -> Unit,
    ): List<NetworkDevice> = withContext(Dispatchers.IO) {
        val semaphore = Semaphore(maxConcurrentHosts)
        val scannedCount = AtomicInteger(0)

        hosts.map { ip ->
            async {
                semaphore.withPermit {
                    val device = probeHost(ip)
                    onProgress(scannedCount.incrementAndGet(), hosts.size)
                    device
                }
            }
        }.awaitAll().filterNotNull()
    }

    private fun probeHost(ip: String): NetworkDevice? {
        val openPorts = candidatePorts.filter { port -> isPortOpen(ip, port) }
        if (openPorts.isEmpty()) return null

        val mac = ArpTableReader.lookupMac(ip)
        val vendor = mac?.let { com.aba.privacyshield.util.VendorLookup.lookupVendor(it) }
        val hasHighConfidencePort = openPorts.any { it in SuspiciousPortCatalog.HIGH_CONFIDENCE_PORTS }
        val riskLevel = if (hasHighConfidencePort || vendor != null) RiskLevel.HIGH else RiskLevel.MEDIUM

        return NetworkDevice(ip = ip, openPorts = openPorts, mac = mac, vendor = vendor, riskLevel = riskLevel)
    }

    private fun isPortOpen(ip: String, port: Int): Boolean =
        try {
            Socket().use { socket ->
                socket.connect(InetSocketAddress(ip, port), connectTimeoutMs)
                true
            }
        } catch (_: Exception) {
            false
        }
}
