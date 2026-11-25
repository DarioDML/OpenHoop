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
