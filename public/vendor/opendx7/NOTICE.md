# OpenDX7 experimental integration

Source: https://github.com/keithadler/opendx7
Revision: 07f7d86 (2026-07-26). Copyright 2026 Keith Adler, MIT; see LICENSE.
The original patch definitions are also retained in quad/synth/opendx7/patches.js.

MusiCanvas modifications: timestamped scheduling at 64-sample boundaries, event IDs for independent overlapping note releases, clearing queued notes on panic. Each pad uses its own processor instance.

Upstream identifies algorithms and envelope routines ported from Dexed/MSFA. Dexed identifies its MSFA component as Apache-2.0 (distinct from the GPL-3.0 desktop wrapper): https://github.com/asb2m10/dexed and https://github.com/google/music-synthesizer-for-android. This local experimental integration is not a claim that the original manufacturer's ROM patches are freely redistributable. Included patches are the upstream project's stated original designs. Complete third-party provenance review before publishing a release.
