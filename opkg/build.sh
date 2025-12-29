#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${ROOT_DIR}/build/ipk"
CONTROL_DIR="${BUILD_DIR}/control"
DATA_DIR="${BUILD_DIR}/data"
OUT_DIR="${ROOT_DIR}/build/out"

PACKAGE_NAME="keenetic-geosite-sync"
PKG_RELEASE="1"
PKG_ARCH="all"
MAINTAINER="Emil Yangirov"
SECTION="net"
DESCRIPTION="Sync Keenetic DNS object-groups from v2fly geosite lists"
DEPENDS="node"

ensure_tools() {
	if ! command -v node >/dev/null 2>&1; then
		echo "node is required to build the project" >&2
		exit 1
	fi
	if ! command -v npm >/dev/null 2>&1; then
		echo "npm is required to build the project" >&2
		exit 1
	fi
}

pkg_version() {
	node -e "console.log(require('${ROOT_DIR}/package.json').version)"
}

prepare_dirs() {
	rm -rf "${BUILD_DIR}"
	mkdir -p "${CONTROL_DIR}" "${DATA_DIR}" "${OUT_DIR}"
}

maybe_build_dist() {
	if [ -d "${ROOT_DIR}/dist" ] && [ -f "${ROOT_DIR}/dist/index.js" ]; then
		return
	fi
	pushd "${ROOT_DIR}" >/dev/null
	npm ci
	npm run build
	popd >/dev/null
}

install_payload() {
	local prefix="/opt/keenetic-geosite-sync"
	mkdir -p "${DATA_DIR}${prefix}" "${DATA_DIR}/opt/scripts" "${DATA_DIR}/opt/etc/init.d" "${DATA_DIR}/opt/var/log" "${DATA_DIR}/opt/var/run"

	cp "${ROOT_DIR}/dist/index.js" "${DATA_DIR}${prefix}/index.js"
	cp "${ROOT_DIR}/dist/config.json" "${DATA_DIR}${prefix}/config.json"
	cp -r "${ROOT_DIR}/dist/scripts" "${DATA_DIR}${prefix}/scripts"

	cp "${ROOT_DIR}/scripts/geosite-sync.sh" "${DATA_DIR}/opt/scripts/geosite-sync.sh"
	cp "${ROOT_DIR}/scripts/S99geosite-sync" "${DATA_DIR}/opt/etc/init.d/S99geosite-sync"
	chmod +x "${DATA_DIR}/opt/scripts/geosite-sync.sh" "${DATA_DIR}/opt/etc/init.d/S99geosite-sync"
}

write_control_files() {
	local version
	version="$(pkg_version)"

	cat >"${CONTROL_DIR}/control" <<EOF
Package: ${PACKAGE_NAME}
Version: ${version}-${PKG_RELEASE}
Architecture: ${PKG_ARCH}
Maintainer: ${MAINTAINER}
Section: ${SECTION}
Priority: optional
Depends: ${DEPENDS}
License: MIT
Description: ${DESCRIPTION}
EOF

	echo "/opt/keenetic-geosite-sync/config.json" >"${CONTROL_DIR}/conffiles"

	cp "${ROOT_DIR}/opkg/control/postinst" "${CONTROL_DIR}/postinst"
	cp "${ROOT_DIR}/opkg/control/prerm" "${CONTROL_DIR}/prerm"
	cp "${ROOT_DIR}/opkg/control/postrm" "${CONTROL_DIR}/postrm"
	chmod +x "${CONTROL_DIR}/postinst" "${CONTROL_DIR}/prerm" "${CONTROL_DIR}/postrm"
}

make_tarballs() {
	pushd "${CONTROL_DIR}" >/dev/null
	tar czf ../control.tar.gz .
	popd >/dev/null

	pushd "${DATA_DIR}" >/dev/null
	tar czf ../data.tar.gz .
	popd >/dev/null

	echo "2.0" >"${BUILD_DIR}/debian-binary"
}

assemble_ipk() {
	local version filename
	version="$(pkg_version)"
	filename="${PACKAGE_NAME}_${version}-${PKG_RELEASE}_${PKG_ARCH}.ipk"

	pushd "${BUILD_DIR}" >/dev/null
	tar czf "${OUT_DIR}/${filename}" ./control.tar.gz ./data.tar.gz ./debian-binary
	popd >/dev/null

	echo "Built ${OUT_DIR}/${filename}"
}

main() {
	ensure_tools
	prepare_dirs
	maybe_build_dist
	install_payload
	write_control_files
	make_tarballs
	assemble_ipk
}

main "$@"
