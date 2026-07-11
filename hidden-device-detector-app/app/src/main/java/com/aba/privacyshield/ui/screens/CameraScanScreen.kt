package com.aba.privacyshield.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.widget.Toast
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.FlashOff
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.AlertDialog
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.viewmodel.compose.viewModel
import com.aba.privacyshield.PrivacyShieldApp
import com.aba.privacyshield.R
import com.aba.privacyshield.scanner.camera.CameraScanViewModel
import com.aba.privacyshield.scanner.camera.GlintBlob
import com.aba.privacyshield.util.SimpleViewModelFactory
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CameraScanScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val app = context.applicationContext as PrivacyShieldApp
    val viewModel: CameraScanViewModel = viewModel(
        factory = SimpleViewModelFactory { CameraScanViewModel(app.scanHistoryRepository) },
    )

    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted -> hasCameraPermission = granted }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.module_camera)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                    }
                },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            if (hasCameraPermission) {
                CameraScanContent(viewModel = viewModel, modifier = Modifier.weight(1f))
            } else {
                Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                    Text(
                        text = stringResource(R.string.permission_camera_rationale),
                        modifier = Modifier.padding(24.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun CameraScanContent(viewModel: CameraScanViewModel, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()

    val latestResult by viewModel.latestResult.collectAsState()
    val sensitivity by viewModel.sensitivity.collectAsState()
    val torchOn by viewModel.torchOn.collectAsState()
    val saveState by viewModel.saveState.collectAsState()

    var cameraRef by remember { mutableStateOf<Camera?>(null) }
    var showSaveDialog by remember { mutableStateOf(false) }
    var locationLabel by remember { mutableStateOf("") }

    LaunchedEffect(torchOn, cameraRef) {
        cameraRef?.cameraControl?.enableTorch(torchOn)
    }

    LaunchedEffect(saveState) {
        if (saveState is CameraScanViewModel.SaveState.Saved) {
            Toast.makeText(context, context.getString(R.string.history_export), Toast.LENGTH_SHORT).show()
            viewModel.acknowledgeSave()
        }
    }

    Column(modifier = modifier) {
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    val previewView = PreviewView(ctx)
                    val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                    cameraProviderFuture.addListener({
                        val cameraProvider = cameraProviderFuture.get()
                        val preview = Preview.Builder().build().also {
                            it.setSurfaceProvider(previewView.surfaceProvider)
                        }
                        val analyzer = com.aba.privacyshield.scanner.camera.LensGlintAnalyzer(
                            onResult = { result -> viewModel.onAnalyzerResult(result) },
                        )
                        val imageAnalysis = ImageAnalysis.Builder()
                            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                            .build()
                            .also { it.setAnalyzer(ContextCompat.getMainExecutor(ctx), analyzer) }

                        try {
                            cameraProvider.unbindAll()
                            val camera = cameraProvider.bindToLifecycle(
                                lifecycleOwner,
                                CameraSelector.DEFAULT_BACK_CAMERA,
                                preview,
                                imageAnalysis,
                            )
                            cameraRef = camera
                        } catch (_: Exception) {
                            // Aucune caméra disponible / conflit de binding : l'écran reste utilisable sans flux vidéo.
                        }
                    }, ContextCompat.getMainExecutor(ctx))
                    previewView
                },
            )

            val blobs = latestResult?.blobs.orEmpty()
            val rotation = latestResult?.rotationDegrees ?: 0
            Canvas(modifier = Modifier.fillMaxSize()) {
                blobs.forEach { blob ->
                    val offset = mapNormalizedPoint(blob.centerXNorm, blob.centerYNorm, rotation)
                    val radius = 18f + blob.sizeCells * 4f
                    drawCircle(
                        color = androidx.compose.ui.graphics.Color.Red,
                        radius = radius,
                        center = Offset(offset.x * size.width, offset.y * size.height),
                        style = androidx.compose.ui.graphics.drawscope.Stroke(width = 4f),
                    )
                }
            }
        }

        Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            Text(
                text = stringResource(R.string.camera_instructions),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = stringResource(R.string.camera_blobs_found, latestResult?.blobs?.size ?: 0),
                style = MaterialTheme.typography.titleMedium,
            )
            Text(text = stringResource(R.string.camera_sensitivity), style = MaterialTheme.typography.bodyMedium)
            Slider(value = sensitivity, onValueChange = { viewModel.setSensitivity(it) })

            Row(modifier = Modifier.fillMaxWidth()) {
                IconButton(onClick = { viewModel.setTorchOn(!torchOn) }) {
                    Icon(
                        imageVector = if (torchOn) Icons.Filled.FlashOn else Icons.Filled.FlashOff,
                        contentDescription = stringResource(
                            if (torchOn) R.string.camera_torch_on else R.string.camera_torch_off
                        ),
                    )
                }
                Spacer(modifier = Modifier.weight(1f))
                Button(
                    onClick = { showSaveDialog = true },
                    enabled = latestResult?.blobs?.isNotEmpty() == true,
                ) {
                    Icon(Icons.Filled.Save, contentDescription = null)
                    Spacer(modifier = Modifier.height(0.dp))
                    Text(text = " " + stringResource(R.string.camera_save_evidence))
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
                    scope.launch {
                        viewModel.saveCurrentDetection(locationLabel.ifBlank { "Sans nom" })
                        showSaveDialog = false
                        locationLabel = ""
                    }
                }) { Text(stringResource(R.string.common_save)) }
            },
            dismissButton = {
                Button(onClick = { showSaveDialog = false }) { Text(stringResource(R.string.common_cancel)) }
            },
        )
    }
}

/**
 * Transforme un point normalisé issu de l'analyse (repère capteur) en repère d'affichage,
 * en compensant la rotation image->écran habituelle d'une caméra arrière en mode portrait.
 */
private fun mapNormalizedPoint(nx: Float, ny: Float, rotationDegrees: Int): Offset =
    when (rotationDegrees) {
        90 -> Offset(1f - ny, nx)
        180 -> Offset(1f - nx, 1f - ny)
        270 -> Offset(ny, 1f - nx)
        else -> Offset(nx, ny)
    }
