package com.aba.privacyshield.ui.screens

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.aba.privacyshield.PrivacyShieldApp
import com.aba.privacyshield.R
import com.aba.privacyshield.data.db.ScanFindingEntity
import com.aba.privacyshield.history.ScanReportViewModel
import com.aba.privacyshield.ui.components.RiskBadge
import com.aba.privacyshield.util.SimpleViewModelFactory

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScanReportDetailScreen(sessionId: Long, onBack: () -> Unit) {
    val context = LocalContext.current
    val app = context.applicationContext as PrivacyShieldApp
    val viewModel: ScanReportViewModel = viewModel(
        factory = SimpleViewModelFactory { ScanReportViewModel(app.scanHistoryRepository, sessionId) },
    )
    val sessionWithFindings by viewModel.session.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(sessionWithFindings?.session?.locationLabel ?: stringResource(R.string.history_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                    }
                },
                actions = {
                    sessionWithFindings?.let { data ->
                        IconButton(onClick = {
                            val report = viewModel.buildTextReport(data)
                            val intent = Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(Intent.EXTRA_TEXT, report)
                            }
                            context.startActivity(Intent.createChooser(intent, context.getString(R.string.history_export)))
                        }) {
                            Icon(Icons.Filled.Share, contentDescription = stringResource(R.string.history_export))
                        }
                    }
                },
            )
        },
    ) { padding ->
        val data = sessionWithFindings
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            if (data == null) {
                Text(stringResource(R.string.history_empty))
            } else if (data.findings.isEmpty()) {
                Text(
                    text = "Aucun élément suspect enregistré pour cette session.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(data.findings, key = { it.id }) { finding -> FindingCard(finding) }
                }
            }
        }
    }
}

@Composable
private fun FindingCard(finding: ScanFindingEntity) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(text = finding.summary, style = MaterialTheme.typography.titleMedium)
                RiskBadge(finding.riskLevel)
            }
            if (finding.details.isNotBlank()) {
                Text(
                    text = finding.details,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
