#!/usr/bin/env bash
set -Eeuo pipefail

readonly TARGET_ARCH="${1:-}"
readonly NODE_VERSION="${2:-24.15.0}"
readonly REQUESTED_OUTPUT_DIR="${3:-dist}"
readonly PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

case "${TARGET_ARCH}" in
  x64|arm64)
    ;;
  *)
    printf 'Usage: %s <x64|arm64> [node-version] [output-dir]\n' "$0" >&2
    exit 2
    ;;
esac

if [[ "${REQUESTED_OUTPUT_DIR}" == /* ]]; then
  readonly OUTPUT_DIR="${REQUESTED_OUTPUT_DIR}"
else
  readonly OUTPUT_DIR="${PROJECT_ROOT}/${REQUESTED_OUTPUT_DIR}"
fi

TEMP_DIR="$(mktemp -d)"
cleanup() {
  if [[ -n "${TEMP_DIR}" && -d "${TEMP_DIR}" ]]; then
    rm -rf -- "${TEMP_DIR}"
  fi
}
trap cleanup EXIT

readonly NODE_ARCHIVE="node-v${NODE_VERSION}-linux-${TARGET_ARCH}.tar.xz"
readonly NODE_DIR="node-v${NODE_VERSION}-linux-${TARGET_ARCH}"
readonly NODE_BASE_URL="https://nodejs.org/dist/v${NODE_VERSION}"
readonly ASSET="ablog-linux-${TARGET_ARCH}.tar.gz"

mkdir -p "${OUTPUT_DIR}" "${TEMP_DIR}/package/ablog/node/bin" "${TEMP_DIR}/package/ablog/app"

curl --proto '=https' --tlsv1.2 --fail --location --retry 3 \
  --output "${TEMP_DIR}/${NODE_ARCHIVE}" \
  "${NODE_BASE_URL}/${NODE_ARCHIVE}"
curl --proto '=https' --tlsv1.2 --fail --location --retry 3 \
  --output "${TEMP_DIR}/SHASUMS256.txt" \
  "${NODE_BASE_URL}/SHASUMS256.txt"
grep "  ${NODE_ARCHIVE}$" "${TEMP_DIR}/SHASUMS256.txt" >"${TEMP_DIR}/node.sha256"
(
  cd "${TEMP_DIR}"
  sha256sum --check node.sha256
)

tar -xJf "${TEMP_DIR}/${NODE_ARCHIVE}" -C "${TEMP_DIR}"
install -m 0755 \
  "${TEMP_DIR}/${NODE_DIR}/bin/node" \
  "${TEMP_DIR}/package/ablog/node/bin/node"
install -m 0644 \
  "${TEMP_DIR}/${NODE_DIR}/LICENSE" \
  "${TEMP_DIR}/package/ablog/node/LICENSE"

cp -a \
  "${PROJECT_ROOT}/lib" \
  "${PROJECT_ROOT}/public" \
  "${PROJECT_ROOT}/routes" \
  "${PROJECT_ROOT}/views" \
  "${TEMP_DIR}/package/ablog/app/"
cp \
  "${PROJECT_ROOT}/package.json" \
  "${PROJECT_ROOT}/README.md" \
  "${PROJECT_ROOT}/server.js" \
  "${PROJECT_ROOT}/install.sh" \
  "${TEMP_DIR}/package/ablog/app/"
if [[ -f "${PROJECT_ROOT}/LICENSE" ]]; then
  cp "${PROJECT_ROOT}/LICENSE" "${TEMP_DIR}/package/ablog/app/"
fi

tar -C "${TEMP_DIR}/package" -czf "${OUTPUT_DIR}/${ASSET}" ablog
(
  cd "${OUTPUT_DIR}"
  sha256sum "${ASSET}" >"${ASSET}.sha256"
)

printf 'Created %s\n' "${OUTPUT_DIR}/${ASSET}"
