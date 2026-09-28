# Sibling `workforce-platform` checkout

Workforce harness packages (`dsh-workforce-session-events`, `dsh-workforce-tool-admission`) resolve `@reactorjet/workforce-contracts` and `@workforce/dsh-nono-bridge` through **pnpm `link:`** to a **sibling** repository checkout, not a vendored copy inside this tree.

## Layout

```text
<parent>/
  deepseek-harness-workforce/   ← this repository
  workforce-platform/           ← required sibling (Tim-ReJet/workforce-platform)
```

Package manifests use `link:../../../../workforce-platform/packages/...` (four levels up from `packages/workforce/<pkg>/` to `<parent>/`, then into `workforce-platform/`).

## Pin

Check out workforce-platform at merge commit **`bbfc56d56271aee7153b8021bbabd6ac01866166`** (workforce-platform `main` tip after PR **#166** / **#168**) before `pnpm install` or running Workforce unit tests.

```sh
cd ..
git clone https://github.com/Tim-ReJet/workforce-platform.git
cd workforce-platform
git checkout bbfc56d56271aee7153b8021bbabd6ac01866166
cd ../deepseek-harness-workforce
pnpm install
cd ../workforce-platform && pnpm install
cd ../deepseek-harness-workforce
```

Do not commit a partial `workforce-platform/` tree into the harness repository.
