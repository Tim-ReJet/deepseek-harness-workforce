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

Check out workforce-platform at merge commit **`1b8df75bee9b87c047c1ba929f26433d7c4b8845`** (workforce-platform PR **#166**, ordinary execution runtime merge on `main`) before `pnpm install` or running Workforce unit tests.

```sh
cd ..
git clone https://github.com/Tim-ReJet/workforce-platform.git
cd workforce-platform
git checkout 1b8df75bee9b87c047c1ba929f26433d7c4b8845
cd ../deepseek-harness-workforce
pnpm install
cd ../workforce-platform && pnpm install
cd ../deepseek-harness-workforce
```

Do not commit a partial `workforce-platform/` tree into the harness repository.

## Pin in CI

The canonical pin for GitHub Actions is [`.github/workforce-platform-pin`](../../.github/workforce-platform-pin) (keep in sync with this doc when advancing `main`).

Pull requests into `workforce/main` need repository secret **`WORKFORCE_PLATFORM_CHECKOUT_TOKEN`**: a PAT with read access to `Tim-ReJet/workforce-platform`. The composite action [`.github/actions/checkout-workforce-sibling`](../../.github/actions/checkout-workforce-sibling) clones that ref and symlinks `../workforce-platform` for `link:` resolution. Without the secret, `pnpm install` succeeds but host `tsc` and Workforce tests cannot resolve `@reactorjet/workforce-contracts` / `@workforce/*`.
