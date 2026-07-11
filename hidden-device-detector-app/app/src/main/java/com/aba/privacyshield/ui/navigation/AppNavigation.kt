package com.aba.privacyshield.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.NavType
import com.aba.privacyshield.ui.screens.BluetoothScanScreen
import com.aba.privacyshield.ui.screens.CameraScanScreen
import com.aba.privacyshield.ui.screens.ChecklistScreen
import com.aba.privacyshield.ui.screens.HistoryScreen
import com.aba.privacyshield.ui.screens.HomeScreen
import com.aba.privacyshield.ui.screens.MagneticScanScreen
import com.aba.privacyshield.ui.screens.NetworkScanScreen
import com.aba.privacyshield.ui.screens.ScanReportDetailScreen

object Routes {
    const val HOME = "home"
    const val CAMERA = "camera"
    const val NETWORK = "network"
    const val BLUETOOTH = "bluetooth"
    const val MAGNETIC = "magnetic"
    const val CHECKLIST = "checklist"
    const val HISTORY = "history"
    const val HISTORY_DETAIL = "history/{sessionId}"

    fun historyDetail(sessionId: Long) = "history/$sessionId"
}

@Composable
fun AppNavigation(navController: NavHostController = rememberNavController()) {
    NavHost(navController = navController, startDestination = Routes.HOME) {
        composable(Routes.HOME) {
            HomeScreen(onNavigate = { route -> navController.navigate(route) })
        }
        composable(Routes.CAMERA) {
            CameraScanScreen(onBack = { navController.popBackStack() })
        }
        composable(Routes.NETWORK) {
            NetworkScanScreen(onBack = { navController.popBackStack() })
        }
        composable(Routes.BLUETOOTH) {
            BluetoothScanScreen(onBack = { navController.popBackStack() })
        }
        composable(Routes.MAGNETIC) {
            MagneticScanScreen(onBack = { navController.popBackStack() })
        }
        composable(Routes.CHECKLIST) {
            ChecklistScreen(onBack = { navController.popBackStack() })
        }
        composable(Routes.HISTORY) {
            HistoryScreen(
                onBack = { navController.popBackStack() },
                onOpenSession = { sessionId -> navController.navigate(Routes.historyDetail(sessionId)) },
            )
        }
        composable(
            route = Routes.HISTORY_DETAIL,
            arguments = listOf(navArgument("sessionId") { type = NavType.LongType }),
        ) { backStackEntry ->
            val sessionId = backStackEntry.arguments?.getLong("sessionId") ?: return@composable
            ScanReportDetailScreen(sessionId = sessionId, onBack = { navController.popBackStack() })
        }
    }
}
