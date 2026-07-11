package com.aba.privacyshield.ui.screens

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
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.aba.privacyshield.R
import com.aba.privacyshield.data.checklist.ChecklistCategory
import com.aba.privacyshield.data.checklist.ChecklistData
import com.aba.privacyshield.util.ChecklistPrefs

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChecklistScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    var checkedIds by remember { mutableStateOf(ChecklistPrefs.getCheckedIds(context)) }

    fun toggle(id: String) {
        checkedIds = if (id in checkedIds) checkedIds - id else checkedIds + id
        ChecklistPrefs.setCheckedIds(context, checkedIds)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.checklist_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                    }
                },
                actions = {
                    IconButton(onClick = {
                        checkedIds = emptySet()
                        ChecklistPrefs.setCheckedIds(context, emptySet())
                    }) {
                        Icon(Icons.Filled.Refresh, contentDescription = stringResource(R.string.checklist_reset))
                    }
                },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            val progress = if (ChecklistData.totalItemCount > 0) {
                checkedIds.size.toFloat() / ChecklistData.totalItemCount
            } else 0f

            Text(
                text = stringResource(R.string.checklist_progress, checkedIds.size, ChecklistData.totalItemCount),
                style = MaterialTheme.typography.titleMedium,
            )
            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
            )

            LazyColumn(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                ChecklistData.categories.forEach { category ->
                    item { CategoryHeader(category) }
                    items(category.items) { checkItem ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        ) {
                            Checkbox(
                                checked = checkItem.id in checkedIds,
                                onCheckedChange = { toggle(checkItem.id) },
                            )
                            Column(modifier = Modifier.padding(top = 12.dp)) {
                                Text(text = checkItem.title, style = MaterialTheme.typography.titleMedium)
                                Text(
                                    text = checkItem.tip,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CategoryHeader(category: ChecklistCategory) {
    Text(
        text = category.title,
        style = MaterialTheme.typography.titleLarge,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(top = 16.dp, bottom = 4.dp),
    )
}
