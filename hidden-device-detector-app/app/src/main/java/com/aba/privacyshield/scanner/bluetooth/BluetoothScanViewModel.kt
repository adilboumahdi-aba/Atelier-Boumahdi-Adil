package com.aba.privacyshield.scanner.bluetooth

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aba.privacyshield.data.db.FindingType
import com.aba.privacyshield.data.db.RiskLevel
import com.aba.privacyshield.data.repository.NewFinding
import com.aba.privacyshield.data.repository.ScanHistoryRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class BleUiDevice(
    val address: String,
    val name: String?,
    val rssi: Int,
    val riskLevel: RiskLevel,
)

class BluetoothScanViewModel(
    private val repository: ScanHistoryRepository,
    appContext: Context,
) : ViewModel() {

    private val engine = BleScannerEngine(appContext)
    private val devicesByAddress = mutableMapOf<String, BleDeviceInfo>()

    private val _devices = MutableStateFlow<List<BleUiDevice>>(emptyList())
    val devices: StateFlow<List<BleUiDevice>> = _devices.asStateFlow()

    private val _isScanning = MutableStateFlow(false)
    val isScanning: StateFlow<Boolean> = _isScanning.asStateFlow()

    private val _bluetoothUnavailable = MutableStateFlow(false)
    val bluetoothUnavailable: StateFlow<Boolean> = _bluetoothUnavailable.asStateFlow()

    fun startScan() {
        if (_isScanning.value) return
        devicesByAddress.clear()
        _devices.value = emptyList()
        val started = engine.startScan { info ->
            devicesByAddress[info.address] = info
            publishDevices()
        }
        _isScanning.value = started
        _bluetoothUnavailable.value = !started
    }

    fun stopScan() {
        engine.stopScan()
        _isScanning.value = false
    }

    override fun onCleared() {
        engine.stopScan()
        super.onCleared()
    }

    private fun publishDevices() {
        _devices.value = devicesByAddress.values
            .map { info ->
                val riskLevel = when {
                    SuspiciousBleCatalog.isSuspiciousName(info.name) -> RiskLevel.HIGH
                    SuspiciousBleCatalog.isSuspiciousUnnamedStrongSignal(info.name, info.rssi) -> RiskLevel.MEDIUM
                    else -> RiskLevel.LOW
                }
                BleUiDevice(address = info.address, name = info.name, rssi = info.rssi, riskLevel = riskLevel)
            }
            .sortedByDescending { it.rssi }
    }

    fun saveResultsToHistory(locationLabel: String) {
        val list = _devices.value
        if (list.isEmpty()) return
        viewModelScope.launch {
            val sessionId = repository.createSession(locationLabel)
            val findings = list.map { device ->
                NewFinding(
                    type = FindingType.BLE_DEVICE,
                    riskLevel = device.riskLevel,
                    summary = (device.name ?: "Appareil sans nom") + " (${device.address})",
                    details = "RSSI ${device.rssi} dBm",
                )
            }
            repository.addFindings(sessionId, findings)
        }
    }
}
