package com.aba.privacyshield

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.aba.privacyshield.ui.navigation.AppNavigation
import com.aba.privacyshield.ui.screens.DisclaimerScreen
import com.aba.privacyshield.ui.theme.PrivacyShieldTheme
import com.aba.privacyshield.util.DisclaimerPrefs

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            PrivacyShieldTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    PrivacyShieldRoot()
                }
            }
        }
    }
}

@Composable
private fun PrivacyShieldRoot() {
    val context = androidx.compose.ui.platform.LocalContext.current
    var hasAccepted by remember { mutableStateOf(DisclaimerPrefs.hasAccepted(context)) }

    if (hasAccepted) {
        AppNavigation()
    } else {
        DisclaimerScreen(onAccept = {
            DisclaimerPrefs.setAccepted(context)
            hasAccepted = true
        })
    }
}
