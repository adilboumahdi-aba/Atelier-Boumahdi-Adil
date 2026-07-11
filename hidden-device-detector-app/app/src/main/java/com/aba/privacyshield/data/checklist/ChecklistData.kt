package com.aba.privacyshield.data.checklist

data class ChecklistItem(val id: String, val title: String, val tip: String)
data class ChecklistCategory(val title: String, val items: List<ChecklistItem>)

/** Points de contrôle physiques classiques en contre-surveillance, à parcourir en complément des scans électroniques. */
object ChecklistData {
    val categories: List<ChecklistCategory> = listOf(
        ChecklistCategory(
            title = "Éclairage et prises",
            items = listOf(
                ChecklistItem(
                    id = "elec_outlets",
                    title = "Prises électriques et multiprises",
                    tip = "Les prises USB ou multiprises peuvent dissimuler une caméra ; inspectez les fentes avec une lampe torche.",
                ),
                ChecklistItem(
                    id = "elec_chargers",
                    title = "Chargeurs et adaptateurs USB",
                    tip = "Un adaptateur secteur anormalement lourd ou percé d'un petit trou peut cacher une caméra.",
                ),
            ),
        ),
        ChecklistCategory(
            title = "Détecteurs et réveils",
            items = listOf(
                ChecklistItem(
                    id = "smoke_detector",
                    title = "Détecteur de fumée / CO",
                    tip = "Cherchez un petit orifice ou une lentille brillante ; un détecteur authentique n'a pas d'objectif visible.",
                ),
                ChecklistItem(
                    id = "alarm_clock",
                    title = "Réveil / radio-réveil",
                    tip = "Les mini-caméras espion sont souvent intégrées dans des réveils numériques.",
                ),
            ),
        ),
        ChecklistCategory(
            title = "Miroirs et surfaces",
            items = listOf(
                ChecklistItem(
                    id = "mirror_test",
                    title = "Test du miroir à l'ongle",
                    tip = "Posez l'ongle contre le miroir : un espace entre l'ongle et son reflet = vrai miroir. Aucun espace (contact direct) = miroir sans tain, potentiellement un miroir espion.",
                ),
                ChecklistItem(
                    id = "mirror_dark",
                    title = "Reflets dans le noir",
                    tip = "Éteignez les lumières et balayez la pièce avec le flash (module Détecteur d'objectifs).",
                ),
            ),
        ),
        ChecklistCategory(
            title = "Objets du quotidien",
            items = listOf(
                ChecklistItem(
                    id = "picture_frames",
                    title = "Cadres photo et objets décoratifs",
                    tip = "Un petit trou dans un cadre ou une décoration peut cacher un objectif.",
                ),
                ChecklistItem(
                    id = "plants",
                    title = "Plantes et bouquets",
                    tip = "Les fausses plantes sont un support classique pour dissimuler une caméra.",
                ),
                ChecklistItem(
                    id = "books",
                    title = "Livres et étagères",
                    tip = "Un livre légèrement décalé ou percé sur la tranche peut cacher une caméra.",
                ),
                ChecklistItem(
                    id = "remote_tv",
                    title = "Télécommandes et boîtiers TV",
                    tip = "Un petit trou inhabituel sur la façade peut être un objectif.",
                ),
            ),
        ),
        ChecklistCategory(
            title = "Structure de la pièce",
            items = listOf(
                ChecklistItem(
                    id = "wall_holes",
                    title = "Trous suspects dans murs/plafonds",
                    tip = "Cherchez de petits trous récents ou mal rebouchés, notamment orientés vers le lit ou la salle de bain.",
                ),
                ChecklistItem(
                    id = "vents",
                    title = "Grilles d'aération",
                    tip = "Elles offrent un bon angle de vue et peuvent cacher un objectif miniature.",
                ),
                ChecklistItem(
                    id = "network_check",
                    title = "Appareils connectés",
                    tip = "Lancez le Scanner réseau et le Radar Bluetooth pour repérer les appareils suspects.",
                ),
            ),
        ),
    )

    val totalItemCount: Int = categories.sumOf { it.items.size }
}
