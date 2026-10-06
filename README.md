# TMW Universe

Linked Open Data visualization for the [Technisches Museum Wien](https://www.technischesmuseum.at/) (TMW).

This repository is the home of the **TMW Universe** project, hosted by [LOD-VIS](https://github.com/LOD-VIS). It visualizes the museum’s collections, relationships, and knowledge graph in a web browser.

## Projekt

Die Daten der Open-Data-Schnittstelle unter https://data.tmw.at sollen in einem Webbrowser visualisiert werden. Das Vorbild für das Aussehen ist das Universum.

Einzelne Datensätze sind Sterne, Verlinkungen dazwischen werden durch Linien dargestellt. Die Entfernung der Sterne vom aktiven Mittelpunkt hängt von der Tiefe der Verlinkungen ab; die Positionen sind unregelmäßig gestreut, nicht auf Kreisen.

Die Basisadresse lautet: https://data.tmw.at

Es gibt die Datenquellen für

- Thesaurusbegriffe: https://data.tmw.at/thesaurus/{ID}/skos
- Objekte: https://data.tmw.at/object/{ID}/xml
- Akteure: https://data.tmw.at/person/{ID}/xml
- Objekte zu einem Thesaurusbegriff (Objektbezeichnung): https://data.tmw.at/object/object_name_lref:{ID}/xml
- Objekte zu einem Thesaurusbegriff (Schlagwort/Subject): https://data.tmw.at/object/subject_lref:{ID}/xml

Von einem Thesaurusstern führen Linien zu verwandten Begriffen (SKOS: `broader`, `narrower`, `related`) und zu Objekten, die diesen Begriff als Objektbezeichnung (`object_name_lref`) oder als Subject (`subject_lref`) tragen. Die Linienfarbe folgt dem Linktyp. Beim Anspringen eines Sterns werden die Verbindungen seiner Nachbarn eine weitere Ebene mitgeladen.

Die Farbe der Sterne entspricht der Type des Knotens. Die Größe steigt mit der Zahl der Verlinkungen. Ein Klick auf einen Stern fliegt entlang der Verbindung zum neuen Mittelpunkt. Der aktive Stern bleibt beim Drehen in der Bildmitte; Ziehen rotiert das Universum um ihn. Mit dem Mausrad zoomen.

Verlinkungen, die aus dem Datenpool des Technischen Museums herausführen, führen in ein weiteres Universum und werden derzeit nicht verfolgt.

Die Navigation erfolgt direkt zu Sternen oder entlang von Verlinkungslinien.

Eine Suche ermöglicht Sterne direkt anzuspringen.

## Local development

The visualization is a static web client. It reads the TMW Open Data API in the browser (`Access-Control-Allow-Origin: *`), so no backend is required.

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

Then open http://localhost:4173/

Search examples:

- `164392` — Mercedes-Benz W 196 R "Silberpfeil"
- `object/164392`
- `person/250326` — Stirling Moss
- `https://data.tmw.at/thesaurus/12992`
- `https://data.tmw.at/object/object_name_lref:30832/xml` — Thesaurus 30832 (Albumblatt) und verknüpfte Objekte
- `https://data.tmw.at/object/subject_lref:20763/xml` — Thesaurus 20763 (Stuttgart) als Subject
- `https://data.tmw.at/thesaurus/51396` — Objektbezeichnung (oberster Thesaurus, mit engeren Begriffen)

## Related

- [nibble-arts/lod](https://github.com/nibble-arts/lod) — search tool for linking terms across open-data sources such as Wikipedia, GeoNames, and the GND
