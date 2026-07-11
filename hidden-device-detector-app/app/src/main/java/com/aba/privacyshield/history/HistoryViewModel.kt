package com.aba.privacyshield.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aba.privacyshield.data.db.SessionWithFindings
import com.aba.privacyshield.data.repository.ScanHistoryRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class HistoryViewModel(private val repository: ScanHistoryRepository) : ViewModel() {

    val sessions: StateFlow<List<SessionWithFindings>> = repository.observeSessions()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun deleteSession(session: SessionWithFindings) {
        viewModelScope.launch { repository.deleteSession(session.session) }
    }
}
