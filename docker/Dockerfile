# syntax=docker/dockerfile:1

# The rbitcoin node (https://github.com/rbitcoin-org/rbitcoin) for the
# rbitcoin-node Umbrel app: rbitcoin-node built from a pinned upstream
# commit as a static musl binary for linux/amd64 and linux/arm64, on a
# minimal Alpine with just enough to drop privileges.
#
# The rbitcoin source this image carries is pinned here and nowhere else:
# build-image.yml and check-release.yml read these ARG lines.
# RBITCOIN_VERSION is the workspace version in that commit's Cargo.toml (what
# the binary reports), and the build refuses a commit that says otherwise.
# The app follows upstream master, pinned to a commit and moved forward on
# purpose, rather than the published releases: master is where upstream
# works toward the next release (0.9.99 on the way to 0.10.0), and the 0.8.0
# release predated the Electrum JSON-RPC batch support Beignet's client
# needs (rbitcoin PR 1155, for issue 1152, released in 0.9.0).
#
# The build uses the flags upstream's release build sets (nix/rbitcoin.nix:
# release profile, no debuginfo, stripped symbols, crt-static, the build
# directory remapped) with the toolchain rust-toolchain.toml pins, which
# RUST_IMAGE must carry, and a fixed SOURCE_DATE_EPOCH, so the binary is
# reproducible: RBITCOIN_NODE_SHA256_AMD64 and RBITCOIN_NODE_SHA256_ARM64 are
# its checksums for each platform, and a build that does not reproduce the
# one for its platform fails instead of shipping.
ARG RBITCOIN_VERSION=0.9.99
ARG RBITCOIN_COMMIT=ee509bf0ba2546d9764f79775fb4215439494d9b
ARG RBITCOIN_NODE_SHA256_AMD64=0e50f5c742e968d050dee52f7fbca8c8b01f34a9593f79cb26ee798f7f9e9e39
ARG RBITCOIN_NODE_SHA256_ARM64=2dcfe71f56f88a806f80939bb56d822b6d4d25fc86055da985b30fa474993c1e
ARG RUST_IMAGE=rust:1.95.0-alpine3.22@sha256:064dfc925d68d1a63f4fd2871bd7dc6e6ea56692989a487185855d62885d90aa
ARG ALPINE_IMAGE=alpine:3.22@sha256:d406446bc05b82480756ce8f1287964d28768c23955fa9480d2a74a2eae7a654

# ---- build: compile rbitcoin-node for the platform being assembled ----
# The stage runs on that platform, as upstream builds its x86_64 and aarch64
# releases, each on a native runner: build-image.yml and smoke.yml build
# linux/arm64 on an arm64 runner, so nothing here cross-compiles or runs
# under emulation in CI. RUST_IMAGE and ALPINE_IMAGE are pinned by index
# digest, which resolves to the same per-platform image everywhere.
FROM ${RUST_IMAGE} AS build
ARG RBITCOIN_VERSION
ARG RBITCOIN_COMMIT
ARG TARGETARCH
# git to fetch the commit. The gcc, musl-dev and binutils that build the two
# C dependencies (secp256k1-sys and libmimalloc-sys) come with RUST_IMAGE,
# so its digest pins them along with rustc.
RUN apk add --no-cache git
WORKDIR /build
# The commit must be on upstream master, its Cargo.toml must say
# RBITCOIN_VERSION, and its rust-toolchain.toml must name the Rust that
# RUST_IMAGE carries (the image's RUST_VERSION), so the compiler is the one
# upstream builds with and the image digest pins it. Master's history comes
# as commits only, and the checkout then fetches the pinned commit's files.
RUN set -eu; \
    git init -q rbitcoin; \
    cd rbitcoin; \
    git remote add origin https://github.com/rbitcoin-org/rbitcoin.git; \
    git fetch -q --filter=tree:0 origin master; \
    git merge-base --is-ancestor "$RBITCOIN_COMMIT" origin/master || { \
      echo "rbitcoin $RBITCOIN_COMMIT is not on upstream master" >&2; exit 1; }; \
    git -c advice.detachedHead=false checkout -q "$RBITCOIN_COMMIT"; \
    test "$(git rev-parse HEAD)" = "$RBITCOIN_COMMIT"; \
    grep -qx "version = \"$RBITCOIN_VERSION\"" Cargo.toml || { \
      echo "rbitcoin $RBITCOIN_COMMIT is not version $RBITCOIN_VERSION" >&2; exit 1; }; \
    grep -qx "channel = \"$RUST_VERSION\"" rust-toolchain.toml || { \
      echo "rbitcoin $RBITCOIN_COMMIT does not build with Rust $RUST_VERSION, which RUST_IMAGE carries:" >&2; \
      cat rust-toolchain.toml >&2; exit 1; }
# RUSTUP_TOOLCHAIN takes the image's toolchain, the channel checked above,
# without the file's rustfmt and clippy components, which a build does not
# use, and RUSTUP_AUTO_INSTALL=0 makes a missing toolchain an error instead
# of a download. The flags go to the musl target only, so build scripts and
# proc macros link as usual; the variable that carries them is named after
# the target, as upstream's nix build names it. SOURCE_DATE_EPOCH is the
# commit's time: mimalloc compiles __DATE__ and __TIME__ into its build
# banner, and GCC takes both from SOURCE_DATE_EPOCH when it is set
# (upstream's nix build sets it too), so two builds of one commit give the
# same bytes.
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) target=x86_64-unknown-linux-musl ;; \
      arm64) target=aarch64-unknown-linux-musl ;; \
      *) echo "rbitcoin-node is built for amd64 and arm64, not $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    flags="CARGO_TARGET_$(printf '%s' "$target" | tr 'a-z-' 'A-Z_')_RUSTFLAGS"; \
    export "$flags=--remap-path-prefix /build/=/source/ -C debuginfo=0 -C strip=symbols -C target-feature=+crt-static"; \
    cd rbitcoin; \
    SOURCE_DATE_EPOCH=$(git log -1 --format=%ct) \
    RUSTUP_TOOLCHAIN="$RUST_VERSION" \
    RUSTUP_AUTO_INSTALL=0 \
      cargo build --release --locked --target "$target" -p rbitcoin-node; \
    cp "target/$target/release/rbitcoin-node" /build/rbitcoin-node
# A step of its own, declared after the compile, so that changing a pin
# reruns only this check. It prints the binary's checksum first, so a
# failing build shows the value to pin in its error summary.
ARG RBITCOIN_NODE_SHA256_AMD64
ARG RBITCOIN_NODE_SHA256_ARM64
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) sum="$RBITCOIN_NODE_SHA256_AMD64" ;; \
      arm64) sum="$RBITCOIN_NODE_SHA256_ARM64" ;; \
    esac; \
    sha256sum /build/rbitcoin-node; \
    echo "$sum  /build/rbitcoin-node" | sha256sum -c -

# ---- runtime ----
FROM ${ALPINE_IMAGE}
ARG RBITCOIN_VERSION
ARG APP_VERSION=dev
ENV RBITCOIN_VERSION=${RBITCOIN_VERSION} APP_VERSION=${APP_VERSION}
# su-exec drops to uid 1000 after the entrypoint has made the data directory
# writable.
# Python serves the allowlisted settings API in a separate container and
# validates saved defaults before execing the static node binary.
RUN apk add --no-cache su-exec python3
COPY --from=build /build/rbitcoin-node /usr/local/bin/rbitcoin-node
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY docker/settings.py /usr/local/lib/rbitcoin/settings.py
# The status page (nginx template and HTML) travels in this image, not in
# the app directory: umbrelOS copies an app's files into APP_DATA_DIR at
# install and on update copies only docker-compose.yml, *.template,
# exports.sh, torrc and hooks (legacy-compat/app-script), so a page shipped
# as app files would stay at its install version for the life of the app.
# The entrypoint puts a copy in /web on every start, which the compose file
# shares with the nginx container, so the page moves with the image digest.
COPY docker/web /usr/share/rbitcoin-umbrel/web
RUN chmod 755 /usr/local/bin/entrypoint.sh && chmod -R a+rX /usr/share/rbitcoin-umbrel
EXPOSE 50001 9332 9333
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
