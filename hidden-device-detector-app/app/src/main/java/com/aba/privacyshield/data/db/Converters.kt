package com.aba.privacyshield.data.db

import androidx.room.TypeConverter

class Converters {
    @TypeConverter
    fun fromFindingType(value: FindingType): String = value.name

    @TypeConverter
    fun toFindingType(value: String): FindingType = FindingType.valueOf(value)

    @TypeConverter
    fun fromRiskLevel(value: RiskLevel): String = value.name

    @TypeConverter
    fun toRiskLevel(value: String): RiskLevel = RiskLevel.valueOf(value)
}
