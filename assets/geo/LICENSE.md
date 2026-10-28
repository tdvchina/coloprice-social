# Map data licence

`ne_110m_land.json` is derived from **Natural Earth** 1:110m physical vectors, land layer
(`ne_110m_land.geojson`, https://github.com/nvkelso/natural-earth-vector, https://www.naturalearthdata.com/).

Natural Earth data is in the **public domain** ("All versions of Natural Earth raster + vector map
data ... are in the public domain. You may use the maps in any manner, including modifying the
content and design ..." — naturalearthdata.com/about/terms-of-use). No permission or credit is
required; we credit it anyway: *Made with Natural Earth.*

Changes made here: features flattened to a list of polygons (outer ring + holes), coordinates
rounded to 0.01 degrees. Used only to draw the dot-grid land mask of map slides
(`scripts/lib/map.mjs`). No country borders, no third-party map tiles, no copyrighted basemaps.
