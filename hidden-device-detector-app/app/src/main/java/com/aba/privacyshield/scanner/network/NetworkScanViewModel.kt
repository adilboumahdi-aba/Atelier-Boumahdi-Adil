package com.aba.privacyshield.scanner.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aba.privacyshield.data.db.FindingType
import com.aba.privacyshield.data.repository.NewFinding
import com.aba.privacyshield.data.repository.ScanHistoryRepository
import com.aba.privacyshield.util.SubnetUtils
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface NetworkScanUiState {
    data object Idle : NetworkScanUiState
    data class Scanning(val scanned: Int, val total: Int) : NetworkScanUiState
    data class Done(val devices: List<NetworkDevice>) : NetworkScanUiState
    data object NoWifi : NetworkScanUiState
}

class NetworkScanViewModel(
    private val repository: ScanHistoryRepository,
    private val appContext: Context,
) : ViewModel() {

    private val engine = NetworkScannerEngine()

    private val _uiState = MutableStateFlow<NetworkScanUiState>(NetworkScanUiState.Idle)
    val uiState: StateFlow<NetworkScanUiState> = _uiState.asStateFlow()

    fun startScan() {
        val info = SubnetUtils.getLocalIpv4(appContext)
        if (info == null || !isOnWifi()) {
            _uiState.value = NetworkScanUiState.NoWifi
            return
        }
        val hosts = SubnetUtils.hostsToScan(info.localIp, info.prefixLength)
        _uiState.value = NetworkScanUiState.Scanning(0, hosts.size)

        viewModelScope.launch {
            val devices = engine.scan(hosts) { scanned, total ->
                _uiState.value = NetworkScanUiState.Scanning(scanned, total)
            }
            _uiState.value = NetworkScanUiState.Done(devices.sortedByDescending { it.riskLevel.ordinal })
        }
    }

    fun saveResultsToHistory(locationLabel: String) {
        val state = _uiState.value
        if (state !is NetworkScanUiState.Done || state.devices.isEmpty()) return
        viewModelScope.launch {
            val sessionId = repository.createSession(locationLabel)
            val findings = state.devices.map { device ->
                NewFinding(
                    type = FindingType.NETWORK_DEVICE,
                    riskLevel = device.riskLevel,
                    summary = "Appareil ${device.ip}" + (device.vendor?.let { " — $it" } ?: ""),
                    details = "Ports ouverts : ${device.openPorts.joinToString()}" +
                        (device.mac?.let { " · MAC $it" } ?: ""),
                )
            }
            repository.addFindings(sessionId, findings)
        }
    }

    private fun isOnWifi(): Boolean {
        val cm = appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return false
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
    }
}
