# tmw-universe

Relocated from [nibble-arts/lod](https://github.com/nibble-arts/lod).

The project lives in the `tmw-universe/` folder. It is a PHP tool for searching and linking records across open data sources:

- German Wikipedia
- Watch-Wiki
- Camera-Wiki
- GeoNames
- Deutsche Nationalbibliothek (GND persons, institutions, and geography)

## Layout

- `tmw-universe/index.php` — search form and source queries
- `tmw-universe/lod.css` — page styles
- `tmw-universe/plugin/dnb/` — DNB SRU / GND client and XSLT views
- `tmw-universe/plugin/geonames/` — GeoNames search client
- `tmw-universe/plugin/mediawiki/` — MediaWiki API client
- `tmw-universe/easyrdf-0.8.0/` — bundled EasyRdf 0.8.0 library

The original repository also has a `dnbUpdate` branch that removes EasyRdf and comments out the DNB queries. That work-in-progress branch was not merged here.

## Run locally

Requires PHP with `allow_url_fopen` (or equivalent HTTP access) and the XSL extension:

```bash
php -S localhost:8000 -t tmw-universe
```

Then open `http://localhost:8000/`.
