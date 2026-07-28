# AGENTS.md — hk-bus-eta

Guidance for AI coding agents working in this repository. Humans: see `README.md`.

## What this repo is

The npm package **`hk-bus-eta`**: a small, dependency-light TypeScript library
that gives one normalised interface to Hong Kong public transport arrival times.
Every operator publishes ETAs in a different shape on `data.gov.hk`; this package
hides those differences behind two functions.

```ts
fetchEtaDb(): Promise<EtaDb>          // the route/stop database
fetchEtas({ ...routeEntry, seq, language }): Promise<Eta[]>   // live ETAs
```

It is the data layer of [hkbus.app](https://hkbus.app) and is published to npm
for third parties. **Its public surface is a contract** — changing the shape of
`Eta`, `EtaDb` or the arguments of `fetchEtas` breaks downstream consumers you
cannot see.

`fetchEtaDb` reads `https://data.hkbus.app/routeFareList.min.json` and falls back
to `https://hkbus.github.io/hk-bus-crawling/routeFareList.min.json` — both are
published by `hk-bus-crawling`. Live ETAs are fetched straight from the
operators' `data.gov.hk` endpoints; nothing is proxied.

## Repository family

| Repo | Role |
| --- | --- |
| `hkbus/hk-bus-eta` | **this repo** — the npm ETA package |
| `hkbus/hk-bus-crawling` | builds `routeFareList.min.json` (what `fetchEtaDb` downloads) **and** the twin Python package, also called `hk-bus-eta` |
| `hkbus/hk-independent-bus-eta` | the hkbus.app React PWA, the main consumer |
| `hkbus/route-waypoints` | route polylines for the map |

**Triage rule.** Wrong ETA time, missing remark, malformed operator response →
here. Missing route, wrong stop order, wrong direction → `hk-bus-crawling`.
Rendering → the app.

## Layout

```text
src/
  index.ts        fetchEtas / fetchEtaDb / fetchEtaDbMd5 — the public surface
  type.ts         Company, Eta, EtaDb, RouteListEntry, StopList, Freq …
  utils.ts        shared helpers (time parsing, timezone)
  journeyTime.ts  journey-time lookup
  kmb.ts ctb.ts nlb.ts gmb.ts lrtfeeder.ts lightRail.ts mtr.ts
  sunferry.ts fortuneferry.ts hkkf.ts        one module per operator
test/
  index.test.ts       fetches the live DB (network-dependent)
  lrtfeeder.test.ts   fixture-driven, offline
  K18_en.fixture.json real captured operator payload
```

Each operator module exports a function taking a normalised argument object and
returning `Eta[]`. `index.ts` dispatches over the route's `co` array. Adding an
operator means: a new module, a new `Company` literal in `type.ts`, a new branch
in `fetchEtas`, and matching support in `hk-bus-crawling`.

`Company` is currently: `kmb`, `nlb`, `ctb`, `lrtfeeder`, `gmb`, `lightRail`,
`mtr`, `sunferry`, `hkkf`, `fortuneferry`.

## Commands

```sh
yarn install          # see the Yarn note below
yarn test             # jest (ts-jest preset)
yarn build            # tsc → dist/ (CJS, es2015) and esm/ (ESM, es2018)
yarn clean            # rimraf esm dist
```

### Yarn: this repo uses Yarn 1 (Classic), and the lockfile is stale

`yarn.lock` is a `# yarn lockfile v1` file. Modern Yarn (Berry 2+/corepack)
refuses it outright — *"This package doesn't seem to be present in your
lockfile"*. Use Yarn Classic:

```sh
npx yarn@1.22.22 install
```

Note that `--frozen-lockfile` currently **fails even under Yarn Classic**: the
committed `yarn.lock` has drifted from `package.json` (it still pins the
jest 29.6.x tree while `package.json` asks for `^29.7.0`, and similarly for other
dev dependencies). A plain `yarn install` works and updates the lockfile. If you
are not deliberately fixing that drift, **do not commit the regenerated
`yarn.lock`** alongside an unrelated change — keep the diff to one concern.

Also be aware that Yarn Classic runs the `prepublish` script during
`yarn install`, which chains `prebuild` → `clean` + `test`. An install can
therefore fail on a test or a missing binary before dependencies have settled;
running `npx jest` directly afterwards is the reliable way to see the real test
result.

## No CI

There is **no CI workflow in this repository** — `.github/` contains only
`FUNDING.yml`. Nothing runs your tests, your build, or a type check when you open
a PR. You are the gate:

```sh
npx yarn@1.22.22 install
npx jest          # expect: 2 suites, 3 tests passing
npx tsc --noEmit  # type check
npx yarn@1.22.22 build
```

Paste that output into the PR. A reviewer has no other signal.

## Testing conventions

- **Prefer fixture-driven tests.** `lrtfeeder.test.ts` is the model: capture a
  real operator payload into `test/<route>_<lang>.fixture.json`, mock
  `global.fetch` with it, and assert on the normalised `Eta[]`. This makes
  operator quirks reproducible without depending on live services or on a bus
  actually running.
- `index.test.ts` hits the **live network** (`fetchEtaDb`). It will fail offline
  or if `data.hkbus.app` is down — that is not your change.
- When fixing an operator quirk, add a fixture that fails before your fix and
  passes after. Confirm it actually fails without the fix; a test that was green
  the whole time proves nothing.
- Comment fixtures with where and when the payload came from, as
  `K18_en.fixture.json` does.

## House rules

- **Minimal, single-concern diffs.** No drive-by refactors, no dependency bumps
  bundled with a fix, no reformatting untouched code.
- **Comments are rare and terse** — one short line where the *why* is not
  obvious. Reasoning goes in the PR body.
- **Do not break the public API.** `type.ts` and the signatures in `index.ts` are
  consumed by hkbus.app and by third parties. Additive changes (new optional
  field, new operator) are fine; renames and shape changes are not, unless raised
  first.
- **`strict: true`** is on. Keep it that way; no `@ts-ignore` to get past a real
  type problem.
- **Runtime dependencies are deliberately few** (`date-fns` family only). Do not
  add one without raising it first — this package ships into a PWA where bundle
  size is visible to users.
- **Operator APIs are public government endpoints.** They rate-limit and they go
  down. Handle malformed and partial responses defensively rather than assuming a
  field exists; a thrown exception in one operator should not take down the ETAs
  for the others on the same route.
- Formatting: Prettier is a dev dependency, no config file, so defaults apply.
  Nothing enforces it automatically — keep diffs Prettier-clean by hand.

## Publishing

`npm version` / `package.json` `version` drives the release; `prepublish` runs
`build`, which runs `clean` and `test` first. Publishing is the maintainer's
call — do not bump the version in a PR unless asked.

## Licence

GPL-3.0-only.
