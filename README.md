# TMW Universe

Linked Open Data visualization for the [Technisches Museum Wien](https://www.technischesmuseum.at/) (TMW).

This repository is the home of the **TMW Universe** project, hosted by [LOD-VIS](https://github.com/LOD-VIS). It visualizes the museum’s collections, relationships, and knowledge graph in a web browser.

## Projekt

Die Daten der Open-Data-Schnittstelle unter https://data.tmw.at sollen in einem Webbrowser visualisiert werden. Das Vorbild für das Aussehen ist das Universum.

Einzelne Datensätze sind Sterne, Verlinkungen dazwischen werden durch Linien dargestellt. Neue Verbindungen lagern sich um den bestehenden Stern an, ohne ihn zu verschieben — so wächst ein zusammenhängendes Universum. Die Kamera lässt sich drehen und verschieben.

Die Basisadresse lautet: https://data.tmw.at

Es gibt die Datenquellen für

- Thesaurusbegriffe: https://data.tmw.at/thesaurus/{ID}/skos
- Objekte: https://data.tmw.at/object/{ID}/xml
- Akteure: https://data.tmw.at/person/{ID}/xml
- Objekte zu einem Thesaurusbegriff (Objektbezeichnung): https://data.tmw.at/object/object_name_lref:{ID}/xml
- Objekte zu einem Thesaurusbegriff (Schlagwort/Subject): https://data.tmw.at/object/subject_lref:{ID}/xml
- Objekte zu einer Person (Urheber/Akteur): https://data.tmw.at/object/creator_lref:{ID}/xml

Von einem Thesaurusstern führen Linien zu verwandten Begriffen (SKOS: `broader`, `narrower`, `related`) und zu Objekten, die diesen Begriff als Objektbezeichnung (`object_name_lref`) oder als Subject (`subject_lref`) tragen. Von einem Personenstern führen Linien zu Objekten, die diese Person als Urheber tragen (`creator_lref`). Die Linienfarbe folgt dem Linktyp. Beim Anspringen eines Sterns werden die Verbindungen seiner Nachbarn eine weitere Ebene mitgeladen.

Die Farbe der Sterne entspricht der Type des Knotens. Die Größe steigt mit der Zahl der Verlinkungen. Ein Klick auf einen Stern lädt seine Verknüpfungen an Ort und Stelle. Der Schalter „Sterne verschwinden“ blendet ältere Sterne außerhalb der aktuellen Umgebung nach einiger Zeit aus; ausgeschaltet bleiben alle Sterne stehen. In der Beschreibungsbox startet „Von hier neu starten“ die Suche bei diesem Stern neu und löscht alle anderen Sterne. Ziehen dreht die Ansicht, Umschalt+Ziehen oder rechte Maustaste verschiebt das Bild. Mit dem Mausrad zoomen.

Verlinkungen, die aus dem Datenpool des Technischen Museums herausführen, führen in ein weiteres Universum und werden derzeit nicht verfolgt.

Die Navigation erfolgt direkt zu Sternen oder entlang von Verlinkungslinien.

Eine Suche ermöglicht Sterne direkt anzuspringen — nach ID, URL oder nach Objektname, Personenname und Thesaurusbegriff.

## Local development

The visualization is a static web client. It reads the TMW Open Data API in the browser (`Access-Control-Allow-Origin: *`), so no backend is required.

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

Then open http://localhost:4173/

Search examples:

- `164392` — Mercedes-Benz W 196 R "Silberpfeil"
- `Silberpfeil` — Suche nach Objektname
- `Albumblatt` — Thesaurusbegriff
- `object/164392`
- `Stirling Moss` / `person/250326` — Stirling Moss
- `Elisabeth` / `person/251540` — Elisabeth (Österreich, Kaiserin) und verknüpfte Objekte
- `https://data.tmw.at/object/creator_lref:251540/xml` — Person 251540 als Urheber
- `https://data.tmw.at/thesaurus/12992`
- `https://data.tmw.at/object/object_name_lref:30832/xml` — Thesaurus 30832 (Albumblatt) und verknüpfte Objekte
- `https://data.tmw.at/object/subject_lref:20763/xml` — Thesaurus 20763 (Stuttgart) als Subject
- `https://data.tmw.at/thesaurus/51396` — Objektbezeichnung (oberster Thesaurus, mit engeren Begriffen)

## Related

- [nibble-arts/lod](https://github.com/nibble-arts/lod) — search tool for linking terms across open-data sources such as Wikipedia, GeoNames, and the GND
