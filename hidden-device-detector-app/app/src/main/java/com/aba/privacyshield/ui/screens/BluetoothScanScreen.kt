package com.aba.privacyshield.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.aba.privacyshield.PrivacyShieldApp
import com.aba.privacyshield.R
import com.aba.privacyshield.scanner.bluetooth.BluetoothScanViewModel
import com.aba.privacyshield.scanner.bluetooth.BleUiDevice
import com.aba.privacyshield.ui.components.RiskBadge
import com.aba.privacyshield.util.PermissionUtils
import com.aba.privacyshield.util.SimpleViewModelFactory

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BluetoothScanScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val app = context.applicationContext as PrivacyShieldApp
    val viewModel: BluetoothScanViewModel = viewModel(
        factory = SimpleViewModelFactory {
            BluetoothScanViewModel(app.scanHistoryRepository, app.applicationContext)
        },
    )

    var hasPermissions by remember {
        mutableStateOf(PermissionUtils.hasAllPermissions(context, PermissionUtils.BLUETOOTH_PERMISSIONS))
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) { results -> hasPermissions = results.values.all { it } }

    LaunchedEffect(Unit) {
        if (!hasPermissions) permissionLauncher.launch(PermissionUtils.BLUETOOTH_PERMISSIONS)
    }

    val devices by viewModel.devices.collectAsState()
    val isScanning by viewModel.isScanning.collectAsState()
    var showSaveDialog by remember { mutableStateOf(false) }
    var locationLabel by remember { mutableStateOf("") }

    DisposableEffectStopScanOnLeave(viewModel)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.module_bluetooth)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                    }
                },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            if (!hasPermissions) {
                Text(
                    text = stringResource(R.string.permission_bluetooth_rationale),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                return@Column
            }

            Text(
                text = stringResource(R.string.bluetooth_move_closer),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Row(modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp)) {
                Button(onClick = { if (isScanning) viewModel.stopScan() else viewModel.startScan() }) {
                    Text(
                        stringResource(if (isScanning) R.string.bluetooth_stop_scan else R.string.bluetooth_start_scan)
                    )
                }
                if (devices.isNotEmpty()) {
                    IconButton(onClick = { showSaveDialog = true }) {
                        Icon(Icons.Filled.Save, contentDescription = stringResource(R.string.history_export))
                    }
                }
            }

            if (isScanning) {
                Text(stringResource(R.string.bluetooth_scanning), style = MaterialTheme.typography.bodyMedium)
            }

            if (devices.isEmpty()) {
                Text(
                    text = stringResource(R.string.bluetooth_no_devices),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(devices, key = { it.address }) { device -> BleDeviceCard(device) }
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
private fun DisposableEffectStopScanOnLeave(viewModel: BluetoothScanViewModel) {
    DisposableEffect(Unit) {
        onDispose { viewModel.stopScan() }
    }
}

@Composable
private fun BleDeviceCard(device: BleUiDevice) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(text = device.name ?: "Appareil sans nom", style = MaterialTheme.typography.titleMedium)
                RiskBadge(device.riskLevel)
            }
            Text(
                text = "${device.address} · ${device.rssi} dBm",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = stringResource(R.string.bluetooth_signal_strength),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 4.dp),
            )
            // RSSI typique : de -100 dBm (très loin) à -30 dBm (quelques centimètres).
            val proximity = ((device.rssi + 100) / 70f).coerceIn(0f, 1f)
            LinearProgressIndicator(progress = { proximity }, modifier = Modifier.fillMaxWidth())
        }
    }
}
