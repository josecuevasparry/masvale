# public/media

Drop the real media files for the home catalogue here. This folder is served at
the site root, so `public/media/trabajo-en-equipo.mp4` is reachable at
`/media/trabajo-en-equipo.mp4` in the browser.

## Expected files

The filenames below are the ones declared in `src/data/catalogData.js`.
Use them as-is and nothing else needs to change; while a file is missing, the
card shows the blue placeholder tile.

| Card                                        | File                                    | Type  |
| ------------------------------------------- | --------------------------------------- | ----- |
| Descripción de Cargos y Análisis Organizacional | `analisis-organizacional.mp4`       | video |
| Comunicaciones Internas e Intranet          | `comunicaciones-intranet.gif`           | image |
| Gestión del Cambio                          | `gestion-del-cambio.mp4`                | video |
| Reclutamiento, Selección e Inducción        | `reclutamiento-seleccion.jpg`           | image |
| Trabajo en Equipo                           | `trabajo-en-equipo.mp4`                 | video |
| Coaching para Ejecutivos, Jefaturas y Directivos | `coaching-ejecutivo.gif`           | image |
| Talleres Bien Estar, Autocuidado y Salud    | `talleres-bienestar.mp4`                | video |
| Familia y Educación                         | `familia-y-educacion.jpg`               | image |

## Using a different name or extension

Edit the matching entry in `src/data/catalogData.js`:

```js
{
  id: "trabajo-en-equipo",
  ...
  media: { type: "video", src: "/media/mi-video-nuevo.mp4" },
}
```

`type: "video"` renders a muted, looping, autoplaying `<video>` (the card is a
decorative preview). `type: "image"` renders an `<img>`, which covers .jpg, .png,
.gif and .webp. Remove the `media` line entirely to force the placeholder tile.

## Sizing notes

The cards are 16:9 (`aspect-video`), so 16:9 footage fits without cropping.

Keep the files small — they autoplay on the home page:

- video: 720p, H.264 MP4, roughly 2-4 MB each, 6-12 seconds, no audio needed
  (playback is muted);
- image/gif: 1280x720 or smaller; a short MP4 is much lighter than an
  equivalent GIF.

To generate a web-friendly MP4 from a larger source:

```
ffmpeg -i source.mov -vf "scale=1280:-2" -c:v libx264 -crf 26 -preset slow \
  -movflags +faststart -an public/media/trabajo-en-equipo.mp4
```
