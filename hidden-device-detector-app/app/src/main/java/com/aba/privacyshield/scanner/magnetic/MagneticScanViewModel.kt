package com.aba.privacyshield.scanner.magnetic

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

class MagneticScanViewModel(
    private val repository: ScanHistoryRepository,
    appContext: Context,
) : ViewModel() {

    companion object {
        const val ANOMALY_THRESHOLD_UT = 15f
        private const val SMOOTHING_WINDOW = 5
    }

    private val engine = MagnetometerEngine(appContext)
    private val recentReadings = ArrayDeque<Float>()

    val isAvailable: Boolean = engine.isAvailable()

    private val _currentMagnitude = MutableStateFlow(0f)
    val currentMagnitude: StateFlow<Float> = _currentMagnitude.asStateFlow()

    private val _baseline = MutableStateFlow<Float?>(null)
    val baseline: StateFlow<Float?> = _baseline.asStateFlow()

    init {
        engine.start { magnitude ->
            recentReadings.addLast(magnitude)
            if (recentReadings.size > SMOOTHING_WINDOW) recentReadings.removeFirst()
            _currentMagnitude.value = recentReadings.average().toFloat()
        }
    }

    override fun onCleared() {
        engine.stop()
        super.onCleared()
    }

    fun calibrate() {
        _baseline.value = _currentMagnitude.value
    }

    fun saveAnomalyToHistory(locationLabel: String) {
        val baselineValue = _baseline.value ?: return
        val delta = _currentMagnitude.value - baselineValue
        viewModelScope.launch {
            val sessionId = repository.createSession(locationLabel)
            repository.addFinding(
                sessionId,
                NewFinding(
                    type = FindingType.MAGNETIC_ANOMALY,
                    riskLevel = if (kotlin.math.abs(delta) > ANOMALY_THRESHOLD_UT * 2) RiskLevel.HIGH else RiskLevel.MEDIUM,
                    summary = "Anomalie magnétique (Δ ${"%.1f".format(delta)} µT)",
                    details = "Référence ${"%.1f".format(baselineValue)} µT, mesure ${"%.1f".format(_currentMagnitude.value)} µT",
                ),
            )
        }
    }
}
