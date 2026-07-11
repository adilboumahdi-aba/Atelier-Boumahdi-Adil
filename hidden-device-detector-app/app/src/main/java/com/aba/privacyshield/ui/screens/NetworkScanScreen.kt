package com.aba.privacyshield.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.aba.privacyshield.PrivacyShieldApp
import com.aba.privacyshield.R
import com.aba.privacyshield.scanner.network.NetworkDevice
import com.aba.privacyshield.scanner.network.NetworkScanUiState
import com.aba.privacyshield.scanner.network.NetworkScanViewModel
import com.aba.privacyshield.ui.components.RiskBadge
import com.aba.privacyshield.util.SimpleViewModelFactory

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NetworkScanScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val app = context.applicationContext as PrivacyShieldApp
    val viewModel: NetworkScanViewModel = viewModel(
        factory = SimpleViewModelFactory {
            NetworkScanViewModel(app.scanHistoryRepository, app.applicationContext)
        },
    )
    val uiState by viewModel.uiState.collectAsState()
    var showSaveDialog by remember { mutableStateOf(false) }
    var locationLabel by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.module_network)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                    }
                },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            when (val state = uiState) {
                is NetworkScanUiState.Idle -> {
                    Button(onClick = { viewModel.startScan() }, modifier = Modifier.fillMaxWidth()) {
                        Text(stringResource(R.string.network_start_scan))
                    }
                }

                is NetworkScanUiState.NoWifi -> {
                    Text(
                        text = stringResource(R.string.network_no_wifi),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Button(
                        onClick = { viewModel.startScan() },
                        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                    ) {
                        Text(stringResource(R.string.network_start_scan))
                    }
                }

                is NetworkScanUiState.Scanning -> {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                        CircularProgressIndicator()
                        Text(
                            text = stringResource(R.string.network_scanning, state.scanned, state.total),
                            modifier = Modifier.padding(top = 12.dp),
                        )
                    }
                }

                is NetworkScanUiState.Done -> {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(stringResource(R.string.network_results_title), style = MaterialTheme.typography.titleMedium)
                        if (state.devices.isNotEmpty()) {
                            IconButton(onClick = { showSaveDialog = true }) {
                                Icon(Icons.Filled.Save, contentDescription = stringResource(R.string.history_export))
                            }
                        }
                    }
                    if (state.devices.isEmpty()) {
                        Text(
                            text = stringResource(R.string.network_no_devices),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    } else {
                        LazyColumn(
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            contentPadding = PaddingValues(vertical = 8.dp),
                        ) {
                            items(state.devices) { device -> NetworkDeviceCard(device) }
                        }
                    }
                    Button(
                        onClick = { viewModel.startScan() },
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    ) {
                        Text(stringResource(R.string.network_start_scan))
                    }
                }
            }
        }
    }

    if (showSaveDialog) {
        AlertDialog(
            onDismissRequest = { showSaveDialog = false },
            title = { Text(stringResource(R.string.history_new_session)) },
            text = {
                OutlinedTextField(
                    value = locationLabel,
                    onValueChange = { locationLabel = it },
                    label = { Text(stringResource(R.string.history_location_label)) },
                    singleLine = true,
                )
            },
            confirmButton = {
                Button(onClick = {
                    viewModel.saveResultsToHistory(locationLabel.ifBlank { "Sans nom" })
                    showSaveDialog = false
                    locationLabel = ""
                }) { Text(stringResource(R.string.common_save)) }
            },
            dismissButton = {
                Button(onClick = { showSaveDialog = false }) { Text(stringResource(R.string.common_cancel)) }
            },
        )
    }
}

@Composable
private fun NetworkDeviceCard(device: NetworkDevice) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(text = device.ip, style = MaterialTheme.typography.titleMedium)
                RiskBadge(device.riskLevel)
            }
            if (device.vendor != null) {
                Text(text = "Fabricant probable : ${device.vendor}", style = MaterialTheme.typography.bodyMedium)
            }
            Text(
                text = "Ports ouverts : " + device.openPorts.joinToString { port ->
                    "$port"
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (device.mac != null) {
                Text(
                    text = "MAC : ${device.mac}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
