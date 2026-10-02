# Fuente de los impresos

Montserrat 9.000, la de la marca, en Regular y Bold: las instancias estáticas de Google
Fonts v31 (de `Montserrat[wght].ttf`, commit `cc8daf2` de
[JulietaUla/Montserrat](https://github.com/JulietaUla/Montserrat)), recortadas al rango
«latin» de Google Fonts para que el PDF se arme en la mitad del tiempo. Licencia SIL Open
Font License 1.1 (`OFL.txt`), sin nombre reservado.

Recorte, con fontTools:

```sh
pyftsubset Montserrat-<Estilo>.ttf \
  --unicodes='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0304,U+0308-030A,U+0323,U+0327,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' \
  --layout-features='*' --name-IDs='*' --name-legacy --name-languages='*' --notdef-outline \
  --output-file=Montserrat-<Estilo>.ttf
```

Origen: `https://fonts.gstatic.com/s/montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtr6Ew-.ttf`
(Regular) y `…QNFgpCuM70w-.ttf` (Bold). Fuera de ese rango (ł, č, ő…) sale una caja vacía.
