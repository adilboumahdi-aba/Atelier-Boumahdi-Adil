package com.aba.privacyshield.scanner.bluetooth

import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context

data class BleDeviceInfo(
    val address: String,
    val name: String?,
    val rssi: Int,
)

/**
 * Fine couche au-dessus de BluetoothLeScanner. L'appelant doit avoir vérifié les permissions
 * BLUETOOTH_SCAN/BLUETOOTH_CONNECT (API 31+) ou ACCESS_FINE_LOCATION (API < 31) avant d'appeler
 * startScan — sinon l'OS lève une SecurityException, gérée ici par un `catch` défensif.
 */
class BleScannerEngine(context: Context) {

    private val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
    private var activeCallback: ScanCallback? = null

    fun isBluetoothReady(): Boolean = adapter?.isEnabled == true

    @SuppressLint("MissingPermission")
    fun startScan(onDeviceFound: (BleDeviceInfo) -> Unit): Boolean {
        val scanner = adapter?.takeIf { it.isEnabled }?.bluetoothLeScanner ?: return false

        val callback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val device = result.device
                val name = try {
                    device.name
                } catch (_: SecurityException) {
                    null
                }
                onDeviceFound(BleDeviceInfo(address = device.address, name = name, rssi = result.rssi))
            }

            override fun onScanFailed(errorCode: Int) {
                // Échec silencieux : l'UI reste sur "aucun appareil détecté".
            }
        }

        return try {
            val settings = ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .build()
            scanner.startScan(null, settings, callback)
            activeCallback = callback
            true
        } catch (_: SecurityException) {
            false
        }
    }

    @SuppressLint("MissingPermission")
    fun stopScan() {
        val scanner = adapter?.bluetoothLeScanner ?: return
        val callback = activeCallback ?: return
        try {
            scanner.stopScan(callback)
        } catch (_: SecurityException) {
            // Bluetooth peut avoir été désactivé entre-temps ; rien à nettoyer côté OS.
        } finally {
            activeCallback = null
        }
    }
}
