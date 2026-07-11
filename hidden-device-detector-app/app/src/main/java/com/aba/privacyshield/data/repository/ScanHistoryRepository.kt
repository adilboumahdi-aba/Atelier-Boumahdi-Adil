package com.aba.privacyshield.data.repository

import com.aba.privacyshield.data.db.FindingType
import com.aba.privacyshield.data.db.RiskLevel
import com.aba.privacyshield.data.db.ScanFindingEntity
import com.aba.privacyshield.data.db.ScanSessionDao
import com.aba.privacyshield.data.db.ScanSessionEntity
import com.aba.privacyshield.data.db.SessionWithFindings
import kotlinx.coroutines.flow.Flow

/** Un résultat de détection brut, produit par n'importe quel module de scan avant persistance. */
data class NewFinding(
    val type: FindingType,
    val riskLevel: RiskLevel,
    val summary: String,
    val details: String,
)

class ScanHistoryRepository(private val dao: ScanSessionDao) {

    fun observeSessions(): Flow<List<SessionWithFindings>> = dao.observeSessions()

    fun observeSession(sessionId: Long): Flow<SessionWithFindings?> = dao.observeSession(sessionId)

    suspend fun createSession(locationLabel: String, notes: String = ""): Long =
        dao.insertSession(
            ScanSessionEntity(
                locationLabel = locationLabel,
                createdAtEpochMs = System.currentTimeMillis(),
                notes = notes,
            )
        )

    suspend fun addFinding(sessionId: Long, finding: NewFinding) {
        dao.insertFinding(
            ScanFindingEntity(
                sessionId = sessionId,
                type = finding.type,
                riskLevel = finding.riskLevel,
                summary = finding.summary,
                details = finding.details,
                createdAtEpochMs = System.currentTimeMillis(),
            )
        )
    }

    suspend fun addFindings(sessionId: Long, findings: List<NewFinding>) {
        dao.insertFindings(
            findings.map {
                ScanFindingEntity(
                    sessionId = sessionId,
                    type = it.type,
                    riskLevel = it.riskLevel,
                    summary = it.summary,
                    details = it.details,
                    createdAtEpochMs = System.currentTimeMillis(),
                )
            }
        )
    }

    suspend fun deleteSession(session: ScanSessionEntity) = dao.deleteSession(session)

    /** Génère un rapport texte brut, exportable via le partage système (aucune donnée envoyée en ligne). */
    fun buildTextReport(sessionWithFindings: SessionWithFindings): String {
        val session = sessionWithFindings.session
        val sb = StringBuilder()
        sb.appendLine("RAPPORT DE DÉTECTION — ABA PRIVACY SHIELD")
        sb.appendLine("Lieu : ${session.locationLabel}")
        sb.appendLine("Date : ${java.text.SimpleDateFormat("dd/MM/yyyy HH:mm").format(java.util.Date(session.createdAtEpochMs))}")
        if (session.notes.isNotBlank()) sb.appendLine("Notes : ${session.notes}")
        sb.appendLine()
        if (sessionWithFindings.findings.isEmpty()) {
            sb.appendLine("Aucun élément suspect enregistré pour cette session.")
        } else {
            sessionWithFindings.findings.forEach { f ->
                sb.appendLine("[${f.riskLevel}] ${f.type} — ${f.summary}")
                if (f.details.isNotBlank()) sb.appendLine("  Détails : ${f.details}")
            }
        }
        sb.appendLine()
        sb.appendLine("Ce rapport est une aide à la décision et ne constitue pas une preuve juridique formelle.")
        return sb.toString()
    }
}
