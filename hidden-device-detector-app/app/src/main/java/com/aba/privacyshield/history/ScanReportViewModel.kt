package com.aba.privacyshield.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aba.privacyshield.data.db.SessionWithFindings
import com.aba.privacyshield.data.repository.ScanHistoryRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn

class ScanReportViewModel(
    private val repository: ScanHistoryRepository,
    sessionId: Long,
) : ViewModel() {

    val session: StateFlow<SessionWithFindings?> = repository.observeSession(sessionId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    fun buildTextReport(sessionWithFindings: SessionWithFindings): String =
        repository.buildTextReport(sessionWithFindings)
}
