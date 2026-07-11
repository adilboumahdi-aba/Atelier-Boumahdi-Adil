package com.aba.privacyshield.data.db

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Embedded
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Relation
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

data class SessionWithFindings(
    @Embedded val session: ScanSessionEntity,
    @Relation(parentColumn = "id", entityColumn = "sessionId")
    val findings: List<ScanFindingEntity>,
)

@Dao
interface ScanSessionDao {

    @Insert
    suspend fun insertSession(session: ScanSessionEntity): Long

    @Insert
    suspend fun insertFinding(finding: ScanFindingEntity): Long

    @Insert
    suspend fun insertFindings(findings: List<ScanFindingEntity>)

    @Delete
    suspend fun deleteSession(session: ScanSessionEntity)

    @Transaction
    @Query("SELECT * FROM scan_sessions ORDER BY createdAtEpochMs DESC")
    fun observeSessions(): Flow<List<SessionWithFindings>>

    @Transaction
    @Query("SELECT * FROM scan_sessions WHERE id = :sessionId")
    fun observeSession(sessionId: Long): Flow<SessionWithFindings?>

    @Query("SELECT * FROM scan_sessions WHERE id = :sessionId")
    suspend fun getSession(sessionId: Long): ScanSessionEntity?
}
