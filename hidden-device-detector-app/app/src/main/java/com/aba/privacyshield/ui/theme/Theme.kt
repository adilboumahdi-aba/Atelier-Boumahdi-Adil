package com.aba.privacyshield.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val TacticalColorScheme = darkColorScheme(
    primary = TacticalAccent,
    onPrimary = TacticalBackground,
    secondary = TacticalAccentDim,
    onSecondary = TacticalTextPrimary,
    background = TacticalBackground,
    onBackground = TacticalTextPrimary,
    surface = TacticalSurface,
    onSurface = TacticalTextPrimary,
    surfaceVariant = TacticalSurfaceVariant,
    onSurfaceVariant = TacticalTextSecondary,
    error = RiskHigh,
    onError = TacticalTextPrimary,
)

@Composable
fun PrivacyShieldTheme(content: @Composable () -> Unit) {
    // Thème sombre unique et volontaire (esthétique HUD), indépendant du thème système.
    MaterialTheme(
        colorScheme = TacticalColorScheme,
        typography = PrivacyShieldTypography,
        content = content,
    )
}
