package com.aba.privacyshield.scanner.magnetic

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import kotlin.math.sqrt

/**
 * Lit le magnétomètre du téléphone. Une anomalie de champ magnétique local (delta par rapport
 * à un niveau ambiant calibré) peut trahir un aimant de fixation ou un boîtier métallique dense,
 * typiques des points de montage de micros/caméras cachés (derrière un miroir, dans un détecteur
 * de fumée, etc.). Ce n'est pas un détecteur RF : il ne capte pas les ondes radio elles-mêmes.
 */
class MagnetometerEngine(context: Context) {

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val magnetometer: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
    private var listener: SensorEventListener? = null

    fun isAvailable(): Boolean = magnetometer != null

    fun start(onReading: (magnitudeMicroTesla: Float) -> Unit) {
        val sensor = magnetometer ?: return
        val newListener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                val x = event.values[0]
                val y = event.values[1]
                val z = event.values[2]
                onReading(sqrt(x * x + y * y + z * z))
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
        }
        listener = newListener
        sensorManager.registerListener(newListener, sensor, SensorManager.SENSOR_DELAY_UI)
    }

    fun stop() {
        listener?.let { sensorManager.unregisterListener(it) }
        listener = null
    }
}
