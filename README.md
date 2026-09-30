# tmw-universe

Relocated from [nibble-arts/lod](https://github.com/nibble-arts/lod).

PHP tool for searching and linking records across open data sources:

- German Wikipedia
- Watch-Wiki
- Camera-Wiki
- GeoNames
- Deutsche Nationalbibliothek (GND persons, institutions, and geography)

## Layout

- `index.php` — search form and source queries
- `lod.css` — page styles
- `plugin/dnb/` — DNB SRU / GND client and XSLT views
- `plugin/geonames/` — GeoNames search client
- `plugin/mediawiki/` — MediaWiki API client
- `easyrdf-0.8.0/` — bundled EasyRdf 0.8.0 library

The original repository also has a `dnbUpdate` branch that removes EasyRdf and comments out the DNB queries. That work-in-progress branch was not merged here.

## Run locally

Requires PHP with `allow_url_fopen` (or equivalent HTTP access) and the XSL extension:

```bash
php -S localhost:8000
```

Then open `http://localhost:8000/`.
