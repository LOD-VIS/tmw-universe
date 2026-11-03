# TMW Universe

Linked Open Data visualization for the [Technisches Museum Wien](https://www.technischesmuseum.at/) (TMW).

This repository is the home of the **TMW Universe** project, hosted by [LOD-VIS](https://github.com/LOD-VIS). It visualizes the museum’s collections, relationships, and knowledge graph in a web browser.

## Projekt

Die Daten der Open-Data-Schnittstelle unter https://data.tmw.at sollen in einem Webbrowser visualisiert werden. Das Vorbild für das Aussehen ist das Universum.

Einzelne Datensätze sind Sterne, Verlinkungen dazwischen werden durch Linien dargestellt. Neue Verbindungen lagern sich um den bestehenden Stern an, ohne ihn zu verschieben — so wächst ein zusammenhängendes Universum. Die Kamera lässt sich drehen und verschieben.

Die Basisadresse lautet: https://data.tmw.at

Es gibt die Datenquellen für

- Thesaurusbegriffe (SKOS RDF/XML): https://data.tmw.at/thesaurus/{ID}/xml
- Objekte (LIDO XML): https://data.tmw.at/object/{ID}/lido
- Akteure (schema.org RDF/XML): https://data.tmw.at/person/{ID}/xml

Von einem Objektstern führen Linien zu Objektbezeichnungen, Schlagworten, Orten, Akteur:innen, der Sammlungsgruppe und verwandten Objekten (aus dem LIDO-Datensatz). Von einem Thesaurusstern führen Linien zu verwandten Begriffen (SKOS: `broader`, `narrower`, `related`) sowie zu GND/Wikidata/Wikipedia (`exactMatch`). Von einem Personenstern führen Linien zu `sameAs`-Verweisen. Die Linienfarbe folgt dem Linktyp. Beim Anspringen eines Sterns werden die Verbindungen seiner Nachbarn eine weitere Ebene mitgeladen.

Die Farbe der Sterne entspricht der Type des Knotens. Die Größe steigt mit der Zahl der Verlinkungen. Ein Klick auf einen Stern lädt seine Verknüpfungen an Ort und Stelle. Der Schalter „Sterne verschwinden“ blendet ältere Sterne außerhalb der aktuellen Umgebung nach einiger Zeit aus; ausgeschaltet bleiben alle Sterne stehen. In der Beschreibungsbox startet „Von hier neu starten“ die Suche bei diesem Stern neu und löscht alle anderen Sterne. Ziehen dreht die Ansicht, Umschalt+Ziehen oder rechte Maustaste verschiebt das Bild. Mit dem Mausrad zoomen.

Verlinkungen, die aus dem Datenpool des Technischen Museums herausführen, führen in ein weiteres Universum und werden derzeit nicht verfolgt.

Die Navigation erfolgt direkt zu Sternen oder entlang von Verlinkungslinien.

Eine Suche ermöglicht Sterne direkt anzuspringen — nach ID, URL oder nach Objektname, Personenname und Thesaurusbegriff.

## Local development

The visualization is a static web client. Record fetches go to data.tmw.at (`/object/{id}/lido`, `/thesaurus/{id}/xml`, `/person/{id}/xml`). Those endpoints do not send `Access-Control-Allow-Origin`, so the browser cannot read them directly. The client therefore loads records through a CORS proxy (`cors.tools`, then `proxy.cors.dev`). Locally, `serve.py` still proxies the same URLs through `/tmw` first.

```bash
python3 serve.py 4173
```

Then open http://localhost:4173/

Search examples:

- `164392` — Mercedes-Benz W 196 R "Silberpfeil"
- `https://data.tmw.at/object/203805/lido` — Indigo MLB Teig 20%, im Glas
- `Silberpfeil` — Suche nach Objektname
- `Dampfwalze` / `https://data.tmw.at/thesaurus/49623/xml` — Thesaurusbegriff
- `object/164392`
- `Stirling Moss` / `person/250326` — Stirling Moss
- `https://data.tmw.at/person/3001/xml` — Augustin, Franz Paul
- `Elisabeth` / `person/251540` — Elisabeth (Österreich, Kaiserin) und verknüpfte Objekte
- `https://data.tmw.at/thesaurus/12992`
- `https://data.tmw.at/thesaurus/51396` — Objektbezeichnung (oberster Thesaurus, mit engeren Begriffen)
- `https://data.tmw.at/thesaurus/31111/xml` — Personenkraftwagen mit engeren Begriffen

## Related

- [nibble-arts/lod](https://github.com/nibble-arts/lod) — search tool for linking terms across open-data sources such as Wikipedia, GeoNames, and the GND
