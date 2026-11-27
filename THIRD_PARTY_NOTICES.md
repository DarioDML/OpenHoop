# Third-party notices

## wearable5.0

Source: `wearable5.0`, at commit `8ab57dcd2f72a23f0cf9348c8a9a8cb40ed44fe8`.
Licence: MIT.

Taken from it:

- `packages/protocol/src/schema/whoop5_protocol.json`, the protocol description.
- `packages/protocol/test/golden.json`, the golden test vectors.
- Ported logic in `packages/protocol` (framing, decoders and record layouts).
- Ported logic in `packages/analytics` (scores and signal processing, with their constants).
- The parity fixture generator `packages/analytics/test/gen_parity.py`, which runs the Python code of `wearable5.0` to produce `packages/analytics/test/fixtures/python-parity.json`.

```
MIT License

Copyright (c) 2026 LeonardSEO

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Motion and heart rate from a wrist-worn wearable and labeled sleep from polysomnography

Source: Walch O. "Motion and heart rate from a wrist-worn wearable and labeled sleep from polysomnography" (version 1.0.0). PhysioNet, 2019. https://doi.org/10.13026/hmhs-py35
Standard PhysioNet citation: Goldberger A, Amaral L, Glass L, Hausdorff J, Ivanov PC, Mark R, Mietus JE, Moody GB, Peng CK, Stanley HE. "PhysioBank, PhysioToolkit, and PhysioNet: Components of a new research resource for complex physiologic signals". Circulation 2000;101(23):e215-e220.
Related paper: Walch O, Huang Y, Forger D, Goldstein C. "Sleep stage prediction with raw acceleration and photoplethysmography heart rate data derived from a consumer wearable device". Sleep 2019;42(12):zsz180.
Licence: Open Data Commons Attribution License v1.0 (ODC-By), https://opendatacommons.org/licenses/by/1-0/

The dataset itself is not in this repository. Derived from it:

- The sleep stage coefficients in `packages/analytics/src/stagesModel.ts`, fitted by `packages/analytics/test/train_stages.py`.
- The validation numbers in the README section "Sleep stages".

## Runtime npm dependencies of the packages and the CLI

The licences below are as stated in each package's own `package.json` in `node_modules`.

| Package | Version | Licence | Used by |
| --- | --- | --- | --- |
| `fflate` | 0.8.3 | MIT | `packages/core` |
| `@noble/hashes` | 2.4.0 | MIT | `packages/core` |
| `@stoprocent/noble` | 2.8.0 | MIT | `packages/ble-node` |

These packages have their own dependencies. Those are not inventoried here.

## Mobile app

The dependencies of `apps/mobile` are listed in `apps/mobile/package.json`. Their licences have not been inventoried yet.

Native libraries added by the lab report import (`apps/mobile/modules/lab-reader`, `expo-image-picker`):

| Library | Version | Licence | Used for |
| --- | --- | --- | --- |
| `com.google.mlkit:text-recognition` | 16.0.1 | Google ML Kit Terms of Service (closed-source binary) | On-device text recognition of photos and scanned PDF pages |
| `com.tom-roush:pdfbox-android` | 2.0.27.0 | Apache-2.0 | Reading the text layer of a PDF on the phone |
| `androidx.exifinterface:exifinterface` | 1.3.7 | Apache-2.0 | Reading photo orientation before downscaling |
| `expo-image-picker` | 58.0.10 | MIT | Taking a photo of a report with the camera |

Native library added by the donation sheet (`expo-web-browser`):

| Library | Version | Licence | Used for |
| --- | --- | --- | --- |
| `expo-web-browser` | 58.1.0 | MIT | Opening the GitHub Sponsors checkout in a Chrome Custom Tab or Safari view over the app |
| `androidx.browser:browser` | 1.6.0 | Apache-2.0 | Chrome Custom Tabs on Android, pulled in by `expo-web-browser` |
