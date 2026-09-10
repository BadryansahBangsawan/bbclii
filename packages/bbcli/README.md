# @badryansah99/bbcli

Installs **bbcli** (this fork of [OMP](https://github.com/can1357/oh-my-pi)).

```sh
npm i -g @badryansah99/bbcli
```

If **git** and **bun** are on `PATH`, postinstall clones [BadryansahBangsawan/bbclii](https://github.com/BadryansahBangsawan/bbclii) to `~/.bbcli/src` (keeps an existing checkout), sets `origin` to official OMP, and writes `~/.local/bin/bbcli`. You get fork features (`/ultraplan`, …). Later:

```sh
bbcli update
```

merges `origin/main` (OMP). Local features are not discarded.

Without bun, postinstall downloads the GitHub **binary** (currently `v18.1.16`). That build does not include fork-only commands. Use the source installer instead:

```sh
curl -fsSL https://raw.githubusercontent.com/BadryansahBangsawan/bbclii/main/scripts/install.sh | sh
```

Do not use `npm i -g @oh-my-pi/pi-coding-agent` if you want this fork.
