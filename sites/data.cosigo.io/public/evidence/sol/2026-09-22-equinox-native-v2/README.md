# A8 SOL · September equinox native reduction v2

## Result that is already exact

A8 Annual Frame V1 fixes the September equinox quarter point at:

- **384 decimal A8 annual-angle states**
- **600₈**

That number is an A8 frame relationship. It is not imported from NASA, JPL, UTC, or a calendar-year fraction.

## Three-video physical reduction

The three Sep-22 recordings were reduced using the same detector geometry. A leading-limb and trailing-limb drift fit was made against one fixed detector reference. Their midpoint gives the solar disk-center crossing without assuming that recording start equals transit start.

| pass | fitted center offset | limb→limb at reference | fitted full-field pass | A8 clock witness | Primary RAW bracket | representative RAW |
|---|---:|---:|---:|---|---:|---:|
| PRE | 89.666040 s | 127.432552 s | 160.412165 s | 31:18:27..31:18:29 | 13,593,173..13,593,205 | 13,593,205 |
| CROSSING WINDOW | 83.795056 s | 128.160283 s | 162.346809 s | 00:11:10 | **13,665,935..13,665,968** | **13,665,968** |
| POST | 86.288133 s | 128.090143 s | 162.513508 s | 00:16:39 | 13,672,911..13,672,954 | 13,672,954 |

The limb-to-limb spans at the same detector reference average **127.894326 s**, with only **0.727732 s** total spread across the three passes. The fitted whole-field passages average **161.757494 s**. For these exact recordings, that direct reduction supersedes the earlier rough `~2:55 / 175 s` estimate.

## Known clock-discipline residual

During this evidence session the A8 clock is known to be running **+173 A8 seconds ahead** while clock discipline remains under active refinement. Using the established A8 second (`675/1024` legacy second), that is **+114.0380859375 legacy seconds** as a comparison only.

This residual is preserved as instrument context and is **not corrected out of the source observations**:

- visible A8 clock readouts remain exactly as recorded in the videos;
- Primary Epoch-7 RAW is unchanged;
- the fitted solar-limb / disk-center geometry is unchanged;
- Annual Frame V1 September equinox remains exactly `384 decimal = 600₈`;
- no Core20 rate, phase, anchor, or carrier setting is changed by this packet.

In short: the clock residual is a known discipline condition, not a correction applied to the Sol evidence.

## Middle-pass physical witness

The strongest native detector-center witness is therefore:

- **A8 clock:** `00:11:10`
- **Epoch-7 Primary RAW:** `13,665,935 .. 13,665,968`
- **representative visible RAW:** `13,665,968`

The screen fields update asynchronously, so the bracket is preserved rather than pretending a sub-display-update integer is known.

## Annual-angle relationship

If the Sep-22 detector reference is accepted as continuity of the already established Sep-19 Mintaka/Sol fixed-frame equatorial geometry, this middle-pass witness supplies the physical RAW tie for:

- `SOL_EQUATOR_CROSSING`
- Annual Frame V1 angle `384 decimal = 600₈`

The evidence packet does **not** silently manufacture that geometry link. Existing Sep-19 evidence described the relationship conditionally on unchanged fixed-frame/camera geometry. Therefore this packet records the physical candidate cleanly and leaves promotion to the Annual Frame anchor contingent on that preserved relationship.

## Earlier comparison points

Earlier discussion used two rough/external locating points:

- external `00:05` comparison → displayed RAW `13,664,159`
- operator rough `~00:05:30` center estimate → displayed RAW `13,665,074`

Neither defines the A8 Annual Frame. They are retained only for provenance. The direct three-pass fit yields the later and better detector-center bracket `13,665,935 .. 13,665,968`.

## Source identity

- `Kooha-2026-09-22-17-24-35(1).mkv`  
  SHA256 `e06ada71e5be9bac5a3ad60c20f4e28af1b29b795a07f1121026aa11ee5a670b`
- `Kooha-2026-09-22-18-04-34(1).mkv`  
  SHA256 `99a3d3a63d432a37347be54ac519ad46b4cfde68bf0085a947200fb04449a580`
- `Kooha-2026-09-22-18-08-22.mkv`  
  SHA256 `7891a783b5a4fea04dacf0f762bfa42e8eabc4535288bcb9b95c95d77e531b24`

Container creation timestamps are retained as **evidence-only metadata** and do not define the A8 angle or physical anchor.

## Revision provenance

This v2 packet supersedes v1 only by adding the known clock-discipline residual and its authority boundary. The physical fit, RAW brackets, source-video hashes, and `600₈` annual-frame relationship are unchanged.

Parent packet SHA256: `91765d92a4fcdbe6a75d685e7a29b6725c5723318eeab4d08bd935e8efebda68`
