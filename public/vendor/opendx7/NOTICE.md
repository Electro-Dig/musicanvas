# OpenDX7 integration notice

## OpenDX7

Source: https://github.com/keithadler/opendx7

Imported revision: `07f7d866b2f49f4cf52f5eee2a54c68515946261`
(commit authored 2026-07-27 UTC). The imported files are based on
`js/dx7-processor.js` and `js/dx7-patch.js` at that revision.

Copyright (c) 2026 Keith Adler. OpenDX7 is distributed under the MIT License;
see `LICENSE`. MusiCanvas changes to the processor add timestamped scheduling
at 64-sample boundaries, event IDs for overlapping-note releases, and clearing
queued notes on panic. `quad/synth/opendx7/patches.js` retains 12 patch designs
from the upstream file. OpenDX7 labels its built-in patch parameters as original
clean-room designs rather than copies of Yamaha DX7 ROM patches.

## MSFA engine portions

OpenDX7's source expressly identifies translations/ports of engine routines and
tables from Dexed's `Source/msfa`, including envelope scaling, velocity and
keyboard scaling, frequency calculation, FM algorithm routing, and feedback.
The corresponding Dexed `Source/msfa` files carry Apache License 2.0 headers and
copyright notices for Google Inc. and, in modified files, Pascal Gauthier. The
original Google Music Synthesizer for Android source and its `COPYING` file also
use Apache License 2.0. A copy is provided as `LICENSE.Apache-2.0`.

Primary sources:

- https://github.com/asb2m10/dexed/tree/master/Source/msfa
- https://github.com/google/music-synthesizer-for-android
- https://github.com/google/music-synthesizer-for-android/blob/master/COPYING

Dexed's application/plugin wrapper is GPL-3.0, as stated by its top-level
`LICENSE`; that wrapper was not imported here. This notice does not treat
Dexed's repository-wide GPL license as the license for the separately marked
Apache-2.0 `Source/msfa` files.

No Yamaha ROM or SysEx bank is included by this integration. Product and company
names are used only to identify compatibility and upstream provenance.
