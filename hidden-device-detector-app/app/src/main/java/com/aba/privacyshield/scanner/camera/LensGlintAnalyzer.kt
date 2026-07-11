package com.aba.privacyshield.scanner.camera

import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import java.util.ArrayDeque

/** Un point lumineux (reflet potentiel de lentille) exprimé en coordonnées normalisées [0,1]. */
data class GlintBlob(
    val centerXNorm: Float,
    val centerYNorm: Float,
    val sizeCells: Int,
    val peakLuma: Int,
)

data class GlintScanResult(
    val blobs: List<GlintBlob>,
    val avgLuma: Float,
    val rotationDegrees: Int,
)

/**
 * Détecte les reflets de lentille (glint) en cherchant, sur le plan de luminance Y d'une frame
 * caméra, des petits amas de pixels quasi saturés (proches du blanc) sur un fond sombre.
 * Technique classique de contre-surveillance : dans le noir, une lentille de caméra cachée
 * réfléchit fortement la lumière ambiante ou celle du flash, contrairement à son environnement.
 *
 * Analyse simplifiée par grille (pas de traitement d'image dense) pour rester légère sur mobile.
 */
class LensGlintAnalyzer(
    private val onResult: (GlintScanResult) -> Unit,
) : ImageAnalysis.Analyzer {

    /** 0f = peu sensible (moins de faux positifs), 1f = très sensible. */
    @Volatile
    var sensitivity: Float = 0.5f

    companion object {
        private const val GRID_COLS = 48
        private const val GRID_ROWS = 36
        private const val MIN_BLOB_CELLS = 1
        private const val MAX_BLOB_CELLS = (GRID_COLS * GRID_ROWS) / 5 // exclut une frame globalement claire
        private const val SAMPLE_STEP = 3 // échantillonnage épars dans chaque cellule
    }

    override fun analyze(imageProxy: ImageProxy) {
        try {
            val yPlane = imageProxy.planes.getOrNull(0) ?: return
            val buffer = yPlane.buffer
            val rowStride = yPlane.rowStride
            val pixelStride = yPlane.pixelStride
            val width = imageProxy.width
            val height = imageProxy.height

            val cellWidth = (width / GRID_COLS).coerceAtLeast(1)
            val cellHeight = (height / GRID_ROWS).coerceAtLeast(1)

            // threshold : plus la sensibilité est haute, plus le seuil de "quasi-blanc" baisse.
            val threshold = (250 - (sensitivity.coerceIn(0f, 1f) * 90)).toInt().coerceIn(140, 250)

            val cellMaxLuma = IntArray(GRID_COLS * GRID_ROWS)
            var totalLumaSum = 0L
            var totalSamples = 0

            for (row in 0 until GRID_ROWS) {
                val yStart = row * cellHeight
                if (yStart >= height) break
                val yEnd = minOf(yStart + cellHeight, height)

                for (col in 0 until GRID_COLS) {
                    val xStart = col * cellWidth
                    if (xStart >= width) break
                    val xEnd = minOf(xStart + cellWidth, width)

                    var maxLuma = 0
                    var y = yStart
                    while (y < yEnd) {
                        var x = xStart
                        val rowOffset = y * rowStride
                        while (x < xEnd) {
                            val index = rowOffset + x * pixelStride
                            if (index < buffer.limit()) {
                                val luma = buffer.get(index).toInt() and 0xFF
                                if (luma > maxLuma) maxLuma = luma
                                totalLumaSum += luma
                                totalSamples++
                            }
                            x += SAMPLE_STEP
                        }
                        y += SAMPLE_STEP
                    }
                    cellMaxLuma[row * GRID_COLS + col] = maxLuma
                }
            }

            val avgLuma = if (totalSamples > 0) totalLumaSum.toFloat() / totalSamples else 0f

            val hot = BooleanArray(GRID_COLS * GRID_ROWS) { cellMaxLuma[it] >= threshold }
            val visited = BooleanArray(GRID_COLS * GRID_ROWS)
            val blobs = mutableListOf<GlintBlob>()

            for (start in hot.indices) {
                if (!hot[start] || visited[start]) continue

                val queue = ArrayDeque<Int>()
                queue.add(start)
                visited[start] = true
                var sumCol = 0
                var sumRow = 0
                var count = 0
                var peak = 0

                while (queue.isNotEmpty()) {
                    val idx = queue.poll()
                    val r = idx / GRID_COLS
                    val c = idx % GRID_COLS
                    sumCol += c
                    sumRow += r
                    count++
                    if (cellMaxLuma[idx] > peak) peak = cellMaxLuma[idx]

                    val neighbors = intArrayOf(
                        idx - 1, idx + 1, idx - GRID_COLS, idx + GRID_COLS,
                    )
                    for (n in neighbors) {
                        if (n < 0 || n >= hot.size) continue
                        // évite de sauter d'un bord de ligne à l'autre pour idx-1/idx+1
                        if ((n == idx - 1 || n == idx + 1) && n / GRID_COLS != r) continue
                        if (hot[n] && !visited[n]) {
                            visited[n] = true
                            queue.add(n)
                        }
                    }
                }

                if (count in MIN_BLOB_CELLS..MAX_BLOB_CELLS) {
                    blobs.add(
                        GlintBlob(
                            centerXNorm = (sumCol.toFloat() / count + 0.5f) / GRID_COLS,
                            centerYNorm = (sumRow.toFloat() / count + 0.5f) / GRID_ROWS,
                            sizeCells = count,
                            peakLuma = peak,
                        )
                    )
                }
            }

            onResult(
                GlintScanResult(
                    blobs = blobs,
                    avgLuma = avgLuma,
                    rotationDegrees = imageProxy.imageInfo.rotationDegrees,
                )
            )
        } finally {
            imageProxy.close()
        }
    }
}
