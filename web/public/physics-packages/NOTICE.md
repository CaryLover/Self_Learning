# Physics package source

`typed-physics-0.3.0.bin` is a modified **typed-physics 0.3.0** package archive.
The upstream package is MIT-licensed (see the `LICENSE` file inside the archive).
The app removes the rendering entry points that imported CeTZ and keeps only the
mechanics/electricity declaration and solver modules; diagrams are drawn by the
app itself as SVG. The archive is uncompressed by the browser and verified
against a fixed SHA-256 before loading.

- Upstream: https://github.com/GeronimoCastano/typed-physics
- Upstream version: 0.3.0
- License: MIT
- SHA-256: `3a29a1e71fe48d9af56b241b84f9770b68f7af6f7404e8497974d0a9f7eabc3c`

No CeTZ, oxifmt, or font files are bundled with the physics preview. The Typst
compiler WASM remains under Typst's Apache-2.0 license and is distributed as a
compressed, hash-verified runtime asset.
