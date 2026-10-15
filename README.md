# tylerwiggins — engineering portfolio

Static site: no build step and no dependencies beyond Google Fonts.

```
index.html                     the site (v2, minimal)
css/style.css                  styles
js/orbit.js                    hero canvas: RK4 + J2 orbit propagator
files/                         downloadable résumé PDF
images/portrait.jpg            About photo (add it)
images/projects/               project photos (see README inside)
versions/v1-mission-control/   the earlier, fuller design, self-contained
```

Preview locally:

```sh
python3 -m http.server 8000
# http://localhost:8000                               current site
# http://localhost:8000/versions/v1-mission-control/  v1
```

Deploy by pushing to GitHub Pages, Netlify or Cloudflare Pages with the repo
root as the publish directory.
