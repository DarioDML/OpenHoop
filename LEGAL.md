# Legal notes

This is an explanation of how the project approaches the law. It is not legal advice, and the author is not a lawyer. It may be incomplete or wrong. If a decision depends on it, ask a qualified lawyer in your own country.

## Purpose

OpenHoop exists to let the owner of a WHOOP 5.0 / MG band read the data from that band on hardware and software they control. Its purpose is interoperability: making an independent program work with a device the user owns.

## Basis in EU law

The author lives in Belgium, so the EU framework is the one considered. The relevant text is Directive 2009/24/EC on the legal protection of computer programs.

- Article 5(3) allows a person with the right to use a program to observe, study or test its functioning, in order to determine the ideas and principles behind any element of it, while doing what they are entitled to do with it.
- Article 6 allows reproducing or translating code, without the rights holder's authorisation, where this is indispensable to obtain the information needed to make an independently created program interoperate with other programs. It sets conditions, and it does not allow the information to be used for goals other than interoperability, or to create a substantially similar program.
- Article 8 makes contractual provisions contrary to article 6 null and void.

The Court of Justice of the EU held in SAS Institute v World Programming (C-406/10) that the functionality of a computer program and the format of data files used in it are not, as such, protected by copyright.

These points support the approach. They do not guarantee that every step taken in this project is lawful, and national law and facts matter. The provisions have conditions, and nothing here has been tested in court or reviewed by a lawyer.

## What the project does not do

- It contains no vendor code, firmware, logos or other assets.
- It does not access vendor accounts or vendor servers.
- It does not modify the firmware of a band, and the commands for loading firmware cannot be built in the code.
- It does not circumvent the firmware 50.43+ data lock, and it does not capture, replay, forge or otherwise handle the certificate or any token involved. The commands related to certificates cannot be built in the code.
- It makes no medical claims and is not a medical device.

## Trademarks

WHOOP is a trademark of its owner. OpenHoop uses the name only to say which hardware it works with ("WHOOP 5.0 / MG band"). OpenHoop is not affiliated with, endorsed by or sponsored by WHOOP, Inc. The score names used in OpenHoop (Readiness, Load, Sleep score) are its own.

## Patents

Patents have not been assessed. This is an open question that must be looked at before any public 1.0 release. The repository is public; that does not make the project a released product.

## Provenance policy

- Every protocol fact the code relies on has a recorded source in [docs/provenance.md](docs/provenance.md), together with the evidence tier the source states and whether it has been verified on the author's own hardware.
- Code is ported only from `wearable5.0`, which is MIT-licensed. The credit and licence text are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- Projects under non-commercial or AGPL licences are used as a source of facts only (for example byte offsets or behaviour). Their code is never copied.
- Some of the facts in the reference project were recorded by it from analysis of the vendor's app, for interoperability. OpenHoop takes the facts and not the code or assets.

## Concerns

If you think something in this repository infringes a right or should not be here, open an issue and describe it. The author will look at it.
