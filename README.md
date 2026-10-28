# FaceForm

Public static web app for photo / 3D face input → statistically estimated full skull STL and face-only skin STL.

The site runs in the visitor's browser. It does not need the owner's machine, a Python server, an account, an API key, or a file-upload service. User photos and meshes remain on the visitor's device.

## Features

- JPG / PNG / WEBP photo input through local MediaPipe landmarks.
- OBJ / PLY / STL input through initialized point-cloud shape fitting.
- Shared SCULPTOR shape parameters for skull and face.
- Face-only crop: forehead, nose, cheeks and chin; excludes rear head, ears, neck and shoulders.
- Target face-skin width, height and thickness in millimetres.
- Closed topology check before download, interactive 3D layers and JSON report.
- Smooth frontal face casting-tool generation after fitting: paired female cavity and male core, nominal wall setting, harmonic parting apron, asymmetric locators, feed and vents, with separate STL and mold report downloads.
- GitHub Pages deployment workflow included in the original source archive.

## Accuracy and Morpheus

A photo cannot reveal a person's hidden skull. Output is a statistical estimate, not a CT reconstruction.

Morpheus's public instructions support an approximately 4 mm skin reference and approximately 2 mm at the eyelids. **Width/height scaling alone does not establish 1:1 mounting.** Current output does not claim verified mating with the official mechanical inner surface, perimeter, attachment points, clearances, or silicone prestrain. Uniform shell thickness is used; eyelid-specific thinning is not implemented yet. See `about.html` and each generated report.

Mesh input should be roughly front-facing, Y up and a neutral expression. Input topology need not match SCULPTOR. ICP is local and does not guarantee a global solution for arbitrary scan orientation or partial coverage.

The mold generator samples the fitted face-only surface into a frontal height field, solves a smooth parting apron, applies a bounded surface filter, and creates a normal-offset inner core. It includes three asymmetric locating features plus a chin feed and forehead vents. It simplifies undercuts for a printable two-part mold and does not claim to reproduce the official Morpheus hardware envelope. Exported molds are checked for closed edges, winding and positive volume; the mold report records sampling resolution, surface-filter deviation, nominal gap, and print transforms.

## Run / publish

This public checkout contains the static website at the repository root. There is no build step. The original organized source (dist/, tests/, tools/ and GitHub Actions workflow) is included in `faceform-source.zip`.

```sh
python3 -m http.server 8765
```

For this root layout, GitHub Pages can deploy `main` / `(root)`. The source archive also includes the original workflow that tests and deploys its `dist/` layout. A public Pages URL can be visited without a GitHub login. This workflow does not need any repository secret.

```sh
node --test *.test.mjs
```

Optional integration checks use a previously downloaded official model file:

```sh
SCULPTOR_MODEL_PATH=/path/to/paradict.npy node --test *.test.mjs
```

## External model assets

SCULPTOR's original parameter file is read directly from its **official public GitHub repository** at runtime and cached in IndexedDB. Its Git blob hash is verified before parsing:

`081e696dcc0d4e3e64fe723ed5f7ffabe0762c26`

The original model is approximately 80 MB. The reader extracts only the first eight numeric arrays. It does not execute pickle callables or load Torch code. The site code does not redistribute or relicense the original parameter file. A first visit still needs network access to the public model source.

`reference.json` stores functional barycentric landmark correspondence, generated from the released neutral SCULPTOR face and MediaPipe. No user photo or screenshot is included in the deployed files.

## Sources and licenses

Original FaceForm code: MIT. External model terms remain separate.

- [SCULPTOR](https://github.com/sculptor2022/sculptor), Qiu et al., SIGGRAPH Asia 2022, DOI 10.1145/3550454.3555462.
- [generalized_face_model](https://github.com/KurozawaChiaki/generalized_face_model): research background; this is a SCULPTOR fitting/export extension, not a full replication of the Disney physics training and simulation system.
- [Morpheus Hardware](https://github.com/ZZongzheng0918/Morpheus-Hardware): official mechanical and silicone references.
- [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker): local image landmark detection.
- [Three.js](https://github.com/mrdoob/three), 0.170.0, MIT; license retained in `three-LICENSE.txt`.

The source SCULPTOR release does not provide an unrestricted commercial redistribution grant. This repository's MIT license applies to the independent application code, not the model, source dataset, hardware files or outputs' underlying model rights.
