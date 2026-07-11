package com.aba.privacyshield.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.aba.privacyshield.R
import com.aba.privacyshield.data.db.RiskLevel
import com.aba.privacyshield.ui.theme.RiskHigh
import com.aba.privacyshield.ui.theme.RiskLow
import com.aba.privacyshield.ui.theme.RiskMedium

@Composable
fun RiskBadge(riskLevel: RiskLevel, modifier: Modifier = Modifier) {
    val (color, textRes) = when (riskLevel) {
        RiskLevel.HIGH -> RiskHigh to R.string.network_risk_high
        RiskLevel.MEDIUM -> RiskMedium to R.string.network_risk_medium
        RiskLevel.LOW -> RiskLow to R.string.network_risk_low
    }
    Text(
        text = stringResource(textRes),
        color = MaterialTheme.colorScheme.background,
        style = MaterialTheme.typography.labelLarge,
        modifier = modifier
            .background(color, RoundedCornerShape(8.dp))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}
