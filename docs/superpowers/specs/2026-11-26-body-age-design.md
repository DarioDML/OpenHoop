# Body age (Lichaamsleeftijd): design

Date: 2026-11-26. Parity level C: OpenHoop's own method, so the outcome can differ from other apps.

## Approach

Two separate ages on one screen (`apps/mobile/src/app/health/body-age.tsx`). They are never added up, averaged or merged into a single "body age".

| | Fitness age | Phenotypic Age |
|---|---|---|
| Input | VO2 max estimate (Uth 2004) and sex | 9 blood markers the user enters, plus age at the blood draw |
| Output | An age band, never a single age | One age in years |
| Code | `packages/analytics/src/bodyAge.ts` (`fitnessAge`), `apps/mobile/src/data/bodyAgeDerived.ts` (`latestFitnessAge`, `fitnessBand`) | `phenotypicAge` and `latestPhenoAge` in the same two files |

Each card shows the number or band, ParityBadge C, the inputs used, the method and citation, and one line on what the number means and does not mean. When something is missing, the card says why instead of showing a number.

## Fitness age

- Reference data: Loe H, Rognmo Ø, Saltin B, Wisløff U. "Aerobic capacity reference data in 3816 healthy men and women 20-90 years." PLoS One 2013;8(5):e64319, Table 2. This is the mean treadmill VO2 max per sex and age group, already in `LOE_2013_NORMS`.
- Anchors: the middle of each age group is 25, 35, 45, 55 and 65. The open "70 and older" group is read as 70 to 79, so its anchor is 75. The means fall with age for both sexes, so the curve can be inverted.
- Fitness age is the age *a* where the norm mean equals the estimate. Between two anchors (*a₁*, *m₁*) and (*a₂*, *m₂*), *a = a₁ + (m₁ − VO2) / (m₁ − m₂) × (a₂ − a₁)*.
- Clamping: an estimate above the 25-year mean gives "younger than 25". One below the 75-year mean gives "older than 75". Nothing is extrapolated.
- Band: VO2 ± SEE, with SEE = 2.7 mL/kg/min when the maximum heart rate comes from the profile and 4.7 when it is age-predicted (Uth N, et al. Eur J Appl Physiol 2004;91:111-115). Both bounds are converted to an age. The screen shows the band ("low–high years", "younger than X", "older than Y", or "can't say" if it spans the whole range), not the point.
- Refusals: the existing VO2 reasons (`no-resting-hr`, `no-max-hr`, `out-of-range`), plus `no-sex` or `other-sex` when the sex has no published norms.

## Phenotypic Age

Source: Levine ME, Lu AT, Quach A, et al. "An epigenetic biomarker of aging for lifespan and healthspan." Aging 2018;10(4):573-591, Table 1 (weights and units). The equations are as corrected in Liu Z, et al., PLoS Med 2018;15(12):e1002718, correction PLoS Med 2019;16(2):e1002760. The constants are unrounded, from the BioAge R package (Kwon D, Belsky DW, GeroScience 2021; `R/phenoage_calc.R`, `orig = TRUE`).

```
xb = -19.90667 - 0.03359355·albumin[g/L] + 0.009506491·creatinine[µmol/L] + 0.1953192·glucose[mmol/L]
     + 0.09536762·ln(CRP[mg/dL]) - 0.01199984·lymphocytes[%] + 0.02676401·MCV[fL] + 0.3306156·RDW[%]
     + 0.001868778·ALP[U/L] + 0.05542406·WBC[10³/µL] + 0.08035356·age[years]
H  = exp(xb) · (exp(120·γ) − 1) / γ,  γ = 0.007692696      (exp(120γ) − 1 = 1.51714)
M  = 1 − exp(−H)                                          (10-year mortality score)
PhenoAge = 141.50225 + ln(0.0055305 · H) / 0.090165       (= ln(−0.0055305·ln(1−M)) form)
```

- Verification: I checked the coefficients against Table 1 of the Aging paper (rounded values), the PLoS Med correction (rounded values), and the BioAge source (unrounded). The correction notice prints the final divisor as **0.09165**, but BioAge uses **0.090165**. A published web calculator (kristinsainani.github.io/phenotypic-age-calculator) shows **38.6 years and a 1.7 % mortality score** for its default inputs (age 45, albumin 4.3 g/dL, creatinine 0.9 mg/dL, glucose 90 mg/dL, CRP 1.5 mg/L, lymphocytes 30 %, MCV 90, RDW 13, ALP 70, WBC 6.0). 0.090165 reproduces that (38.50 unrounded, 38.56 with the paper's rounded weights). 0.09165 gives 40.2, so 0.09165 is treated as a typo.
- Known-answer tests (`packages/analytics/test/bodyAge.test.ts`):
  1. The calculator example above must give 38.45 to 38.65 years and M ≈ 0.0166.
  2. A hand-derived example in SI units must give exactly xb = −9.876587, M = 0.0100786 and PhenoAge = 32.926277. I computed it independently in Python with the same constants, so it is derived, not published. Inputs: albumin 45, creatinine 80, glucose 5.0, CRP 0.1 mg/dL, lymphocytes 30, MCV 90, RDW 13, ALP 70, WBC 6, age 40.
- CRP is stored as mg/L (its first catalogue unit) and converted to mg/dL (÷10) before the log.

### New catalogue markers (`apps/mobile/src/data/labs.ts`, appended only)

| id | Units (first = base) | Conversion |
|---|---|---|
| `albumin` | g/L, g/dL | 1 g/dL = 10 g/L |
| `creatinine` | µmol/L, mg/dL | 1 mg/dL = 88.42 µmol/L |
| `lymphocytePct` | % | n/a |
| `mcv` | fL | n/a |
| `rdw` | % | n/a |
| `alp` | U/L, µkat/L | 1 µkat/L = 60 U/L |
| `wbc` | 10^9/L, 10^3/µL | identical (1 × 10⁹/L = 1 × 10³/µL) |

### Window and refusal rules

- For each of the nine markers, the newest stored result is used (newest day, then the highest id).
- The window is **90 days**. Every marker's newest result must lie on or after (newest marker day − 90 days). An older one is marked "stale" and the card lists it. 90 days is short enough that the markers describe roughly one physiological state, and long enough for a full panel plus CRP and ALP ordered on separate visits.
- Missing marker, stale marker, or a stored unit that can't be converted: no number. Every marker row shows its status.
- Age is the year of the newest draw minus the birth year, so it can be up to a year off. Without a birth year: `no-age`, with a link to the profile.
- A CRP of 0 (or any non-positive CRP): refused (`crp-not-positive`) rather than taking ln(0). The text explains that entering the "<" detection limit gives a slightly high estimate.
- Any other value that is 0 or below, non-finite, or above 100 for lymphocytes % or RDW %: `invalid-input`. A non-finite result: `out-of-range`.
- The screen shows the date or date range of the draws used, each input as entered, and, when the unit was converted, the value actually used.

## Alternatives not picked

- **One combined "body age"** (for example, the average of the two): rejected. The two ages measure different things with different errors, and one number would look more precise than either.
- **HUNT fitness age** (Nes BM, et al. Med Sci Sports Exerc 2013, "Estimating V·O2peak from a nonexercise prediction model: the HUNT Study, Norway"): rejected. Its exact age-from-VO2peak method could not be checked, and it rests on a non-exercise VO2 model that is different from ours.
- **Point fitness age without a band**: rejected. ±4.7 mL/kg/min is often more than ten years of "age".
- **Extrapolating fitness age beyond 25 to 75**: rejected. There is no reference data there.
- **Klemera-Doubal biological age, or Homeostatic Dysregulation** (also in BioAge): rejected. They need a reference population fitted to our own data, so they would not be published coefficients.
- **Rounded paper coefficients**: rejected in favour of the unrounded BioAge values. The difference is about 0.05 years on the example, but the unrounded values are the ones the reproduction package and the published calculators agree on.
- **A longer window** (180 or 365 days): rejected. Markers such as CRP and WBC change within weeks, so a mixed panel would describe no real moment.
- **Using today's age instead of the age at the draw**: rejected. The model was fitted with the age at the blood draw.
