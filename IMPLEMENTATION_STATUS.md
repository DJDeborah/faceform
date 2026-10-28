# Implementation status

- Browser-local photo landmarks and OBJ/PLY/STL input; shared SCULPTOR face/skull fitting.
- Independent closed face-only shell and full estimated skull, with millimetre STL and JSON export.
- Smooth front-opening casting molds: paired cavity/core, harmonic apron, bounded surface filter, locators, feed and vents.
- Six numerical tests pass, including the official model integration and corresponding mold contact triangulation.
- Local skull browser download was independently reopened as a closed mesh. New mold exports were independently checked with trimesh and Manifold; no physical casting test has been performed.
- Source CAD measurements: Morpheus skin approximately 175.43 × 273.42 × 137.21 mm. Its saved display mesh is closed; this is not a uniform 4 mm wall. Personalized mechanical mating remains unverified.
- The initial hosted Site exists, but its online generation is not verified. This checkout includes startup diagnostics and mold generation; deployment status must be assessed separately from source availability.

Original SCULPTOR weights are fetched from the official upstream at runtime and are not included. Independent application code is MIT; upstream model terms remain separate. No photos, scans, private CAD, credentials or local runtime files belong in the public source distribution.
