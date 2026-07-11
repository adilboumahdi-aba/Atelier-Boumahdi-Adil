package com.aba.privacyshield.util

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider

/** Factory générique pour éviter une dépendance à un framework d'injection. */
class SimpleViewModelFactory(private val create: () -> ViewModel) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = create() as T
}
