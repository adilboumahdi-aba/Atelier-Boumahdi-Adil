package com.aba.privacyshield.ui.screens

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import com.aba.privacyshield.scanner.magnetic.MagneticScanViewModel
import com.aba.privacyshield.ui.theme.RiskHigh
import com.aba.privacyshield.ui.theme.RiskLow
import com.aba.privacyshield.util.SimpleViewModelFactory
import kotlin.math.abs

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MagneticScanScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val app = context.applicationContext as PrivacyShieldApp
    val viewModel: MagneticScanViewModel = viewModel(
        factory = SimpleViewModelFactory { MagneticScanViewModel(app.scanHistoryRepository, app.applicationContext) },
    )

    val magnitude by viewModel.currentMagnitude.collectAsState()
    val baseline by viewModel.baseline.collectAsState()
    var showSaveDialog by remember { mutableStateOf(false) }
    var locationLabel by remember { mutableStateOf("") }

    val delta = baseline?.let { magnitude - it }
    val isAnomaly = delta != null && abs(delta) > MagneticScanViewModel.ANOMALY_THRESHOLD_UT

    LaunchedEffect(isAnomaly) {
        if (isAnomaly) vibrateShort(context)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.module_magnetic)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                    }
                },
            )
        },
    ) { padding ->
        if (!viewModel.isAvailable) {
            Column(modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp)) {
                Text("Aucun magnétomètre détecté sur cet appareil.")
            }
            return@Scaffold
        }

        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = stringResource(R.string.magnetic_instructions),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Text(
                text = stringResource(R.string.magnetic_field_value, magnitude),
                style = MaterialTheme.typography.headlineMedium,
                color = if (isAnomaly) RiskHigh else RiskLow,
                modifier = Modifier.padding(vertical = 24.dp),
            )

            if (baseline != null && delta != null) {
                Text(
                    text = "Référence : ${"%.1f".format(baseline)} µT · Δ ${"%.1f".format(delta)} µT",
                    style = MaterialTheme.typography.bodyMedium,
                )
                if (isAnomaly) {
                    Text(
                        text = stringResource(R.string.magnetic_anomaly_detected),
                        color = RiskHigh,
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }

            Row(modifier = Modifier.fillMaxWidth().padding(top = 24.dp), horizontalArrangement = Arrangement.Center) {
                Button(onClick = { viewModel.calibrate() }) {
                    Text(stringResource(R.string.magnetic_calibrate))
                }
            }

            if (baseline != null) {
                Button(
                    onClick = { showSaveDialog = true },
                    modifier = Modifier.padding(top = 12.dp),
                ) {
                    Text(stringResource(R.string.camera_save_evidence))
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
                    viewModel.saveAnomalyToHistory(locationLabel.ifBlank { "Sans nom" })
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

private fun vibrateShort(context: Context) {
    try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val manager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            manager?.defaultVibrator?.vibrate(VibrationEffect.createOneShot(200, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            vibrator?.vibrate(VibrationEffect.createOneShot(200, VibrationEffect.DEFAULT_AMPLITUDE))
        }
    } catch (_: Exception) {
        // Le retour haptique est un confort, pas une fonctionnalité critique.
    }
}
