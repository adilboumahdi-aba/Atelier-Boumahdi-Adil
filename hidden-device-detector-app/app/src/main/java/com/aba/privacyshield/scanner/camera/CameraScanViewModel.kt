package com.aba.privacyshield.scanner.camera

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

class CameraScanViewModel(
    private val repository: ScanHistoryRepository,
) : ViewModel() {

    private val _latestResult = MutableStateFlow<GlintScanResult?>(null)
    val latestResult: StateFlow<GlintScanResult?> = _latestResult.asStateFlow()

    private val _sensitivity = MutableStateFlow(0.5f)
    val sensitivity: StateFlow<Float> = _sensitivity.asStateFlow()

    private val _torchOn = MutableStateFlow(false)
    val torchOn: StateFlow<Boolean> = _torchOn.asStateFlow()

    private val _saveState = MutableStateFlow<SaveState>(SaveState.Idle)
    val saveState: StateFlow<SaveState> = _saveState.asStateFlow()

    sealed interface SaveState {
        data object Idle : SaveState
        data object Saved : SaveState
    }

    fun onAnalyzerResult(result: GlintScanResult) {
        _latestResult.value = result
    }

    fun setSensitivity(value: Float) {
        _sensitivity.value = value.coerceIn(0f, 1f)
    }

    fun setTorchOn(value: Boolean) {
        _torchOn.value = value
    }

    fun saveCurrentDetection(locationLabel: String) {
        val result = _latestResult.value ?: return
        if (result.blobs.isEmpty()) return

        viewModelScope.launch {
            val sessionId = repository.createSession(locationLabel)
            val findings = result.blobs.mapIndexed { index, blob ->
                NewFinding(
                    type = FindingType.CAMERA_GLINT,
                    riskLevel = if (blob.sizeCells > 3) RiskLevel.HIGH else RiskLevel.MEDIUM,
                    summary = "Reflet suspect #${index + 1}",
                    details = "Position relative (${"%.2f".format(blob.centerXNorm)}, " +
                        "${"%.2f".format(blob.centerYNorm)}), intensité ${blob.peakLuma}/255, " +
                        "taille ${blob.sizeCells} cellule(s)",
                )
            }
            repository.addFindings(sessionId, findings)
            _saveState.value = SaveState.Saved
        }
    }

    fun acknowledgeSave() {
        _saveState.value = SaveState.Idle
    }
}
