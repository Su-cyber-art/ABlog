#!/usr/bin/env bash
set -Eeuo pipefail

readonly REPOSITORY="${ABLOG_REPOSITORY:-Su-cyber-art/ABlog}"
readonly VERSION="${ABLOG_VERSION:-latest}"
readonly INSTALL_ROOT="/opt/ablog"
readonly RELEASES_DIR="${INSTALL_ROOT}/releases"
readonly CURRENT_LINK="${INSTALL_ROOT}/current"
readonly DATA_DIR="/var/lib/ablog"
readonly CONFIG_DIR="/etc/ablog"
readonly ENV_FILE="${CONFIG_DIR}/ablog.env"
readonly SERVICE_FILE="/etc/systemd/system/ablog.service"
readonly SERVICE_USER="ablog"
readonly SERVICE_GROUP="ablog"

TEMP_DIR=""
OLD_RELEASE=""
NEW_RELEASE=""
GENERATED_PASSWORD=""
CONFIG_PORT=""
CONFIG_SITE_URL=""
CONFIG_ADMIN_PATH=""
CONFIG_ADMIN_PASSWORD=""

log() {
  printf '[ABlog] %s\n' "$*"
}

die() {
  printf '[ABlog] 错误: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [[ -n "${TEMP_DIR}" && -d "${TEMP_DIR}" ]]; then
    rm -rf -- "${TEMP_DIR}"
  fi
}
trap cleanup EXIT

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    die "请以 root 运行，例如: curl -fsSL https://raw.githubusercontent.com/${REPOSITORY}/main/install.sh | sudo bash"
  fi
}

require_commands() {
  local command_name
  for command_name in \
    awk chown chmod curl getent groupadd install journalctl ln mv od readlink \
    sha256sum systemctl tar tr useradd; do
    command -v "${command_name}" >/dev/null 2>&1 || die "缺少命令: ${command_name}"
  done
}

can_prompt() {
  [[ "${ABLOG_NONINTERACTIVE:-0}" != "1" && -r /dev/tty && -w /dev/tty ]]
}

prompt_default() {
  local result_var label default_value input
  result_var="$1"
  label="$2"
  default_value="$3"

  printf '  %s [%s]: ' "${label}" "${default_value}" >/dev/tty
  IFS= read -r input </dev/tty
  printf -v "${result_var}" '%s' "${input:-${default_value}}"
}

prompt_password() {
  local first second

  while true; do
    printf '  后台初始密码（至少 8 位）: ' >/dev/tty
    IFS= read -r -s first </dev/tty
    printf '\n' >/dev/tty
    if ((${#first} < 8)); then
      printf '  密码至少需要 8 位，请重新输入。\n' >/dev/tty
      continue
    fi

    printf '  再次确认密码: ' >/dev/tty
    IFS= read -r -s second </dev/tty
    printf '\n' >/dev/tty
    if [[ "${first}" != "${second}" ]]; then
      printf '  两次密码不一致，请重新输入。\n' >/dev/tty
      continue
    fi

    CONFIG_ADMIN_PASSWORD="${first}"
    return
  done
}

normalize_admin_path() {
  local value lower
  value="${1:-/admin}"
  [[ "${value}" == /* ]] || value="/${value}"
  while [[ "${value}" == */ && "${value}" != "/" ]]; do
    value="${value%/}"
  done

  [[ "${value}" =~ ^/[A-Za-z0-9][A-Za-z0-9_-]{0,63}$ ]] || return 1
  lower="${value,,}"
  case "${lower}" in
    /about|/archive|/css|/favicon|/fonts|/js|/post|/subscribe)
      return 1
      ;;
  esac
  printf '%s' "${value}"
}

validate_config() {
  [[ "${CONFIG_PORT}" =~ ^[0-9]+$ ]] || die "PORT 必须是数字"
  ((CONFIG_PORT >= 1024 && CONFIG_PORT <= 65535)) ||
    die "PORT 必须在 1024 到 65535 之间"

  CONFIG_ADMIN_PATH="$(normalize_admin_path "${CONFIG_ADMIN_PATH}")" ||
    die "ADMIN_PATH 必须是安全的单段路径，例如 /admin 或 /manage_7f3a"

  if [[ -n "${CONFIG_SITE_URL}" ]]; then
    [[ "${CONFIG_SITE_URL}" =~ ^https?://[^[:space:]]+$ ]] ||
      die "SITE_URL 必须以 http:// 或 https:// 开头"
    CONFIG_SITE_URL="${CONFIG_SITE_URL%/}"
  fi

  [[ "${CONFIG_ADMIN_PASSWORD}" != *$'\n'* && "${CONFIG_ADMIN_PASSWORD}" != *$'\r'* ]] ||
    die "ADMIN_PASSWORD 不能包含换行符"
  ((${#CONFIG_ADMIN_PASSWORD} >= 8)) || die "ADMIN_PASSWORD 至少需要 8 位"
}

collect_initial_config() {
  local confirm

  if [[ -f "${ENV_FILE}" ]]; then
    log "检测到现有配置，升级时保持 ${ENV_FILE} 不变"
    return
  fi

  CONFIG_PORT="${PORT:-3000}"
  CONFIG_SITE_URL="${SITE_URL:-}"
  CONFIG_ADMIN_PATH="${ADMIN_PATH:-/admin}"
  CONFIG_ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"

  if can_prompt; then
    printf '\nABlog 首次安装配置\n\n' >/dev/tty
    prompt_default CONFIG_PORT "监听端口" "${CONFIG_PORT}"
    prompt_default CONFIG_ADMIN_PATH "后台路径" "${CONFIG_ADMIN_PATH}"
    prompt_default CONFIG_SITE_URL "站点公网地址（可留空）" "${CONFIG_SITE_URL}"
    if [[ -z "${CONFIG_ADMIN_PASSWORD}" ]]; then
      prompt_password
    fi
    validate_config

    printf '\n  端口: %s\n' "${CONFIG_PORT}" >/dev/tty
    printf '  后台路径: %s\n' "${CONFIG_ADMIN_PATH}" >/dev/tty
    printf '  公网地址: %s\n' "${CONFIG_SITE_URL:-未设置}" >/dev/tty
    printf '  后台密码: 已设置\n\n' >/dev/tty
    printf '  确认安装？[Y/n]: ' >/dev/tty
    IFS= read -r confirm </dev/tty
    case "${confirm}" in
      n|N|no|NO|No)
        log "已取消安装"
        exit 0
        ;;
    esac
  else
    if [[ -z "${CONFIG_ADMIN_PASSWORD}" ]]; then
      CONFIG_ADMIN_PASSWORD="$(od -An -N18 -tx1 /dev/urandom | tr -d ' \n')"
      GENERATED_PASSWORD="${CONFIG_ADMIN_PASSWORD}"
    fi
    validate_config
  fi
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64)
      printf 'x64'
      ;;
    aarch64|arm64)
      printf 'arm64'
      ;;
    *)
      die "暂不支持此 CPU 架构: $(uname -m)"
      ;;
  esac
}

download_release() {
  local arch asset base_url archive checksum expected actual
  arch="$(detect_arch)"
  asset="ablog-linux-${arch}.tar.gz"

  if [[ "${VERSION}" == "latest" ]]; then
    base_url="https://github.com/${REPOSITORY}/releases/latest/download"
  else
    base_url="https://github.com/${REPOSITORY}/releases/download/${VERSION}"
  fi

  TEMP_DIR="$(mktemp -d)"
  archive="${TEMP_DIR}/${asset}"
  checksum="${archive}.sha256"

  log "下载 ${asset} (${VERSION})"
  curl --proto '=https' --tlsv1.2 --fail --location --retry 3 \
    --output "${archive}" "${base_url}/${asset}" ||
    die "下载发布包失败；请确认仓库已有对应的 GitHub Release"
  curl --proto '=https' --tlsv1.2 --fail --location --retry 3 \
    --output "${checksum}" "${base_url}/${asset}.sha256" ||
    die "下载校验文件失败"

  expected="$(awk -v file="${asset}" '$2 == file || $2 == "*" file { print $1; exit }' "${checksum}")"
  [[ "${expected}" =~ ^[[:xdigit:]]{64}$ ]] || die "校验文件格式无效"
  actual="$(sha256sum "${archive}" | awk '{ print $1 }')"
  [[ "${actual,,}" == "${expected,,}" ]] || die "发布包 SHA-256 校验失败"

  validate_archive "${archive}"
  tar -xzf "${archive}" -C "${TEMP_DIR}"
  [[ -x "${TEMP_DIR}/ablog/node/bin/node" ]] || die "发布包缺少 Node.js 可执行文件"
  [[ -f "${TEMP_DIR}/ablog/app/server.js" ]] || die "发布包缺少 ABlog 服务入口"
}

validate_archive() {
  local archive member normalized
  archive="$1"

  while IFS= read -r member; do
    normalized="${member#./}"
    case "${normalized}" in
      ablog|ablog/*)
        ;;
      *)
        die "发布包包含非预期路径: ${member}"
        ;;
    esac
    case "/${normalized}/" in
      *"/../"*)
        die "发布包包含不安全路径: ${member}"
        ;;
    esac
  done < <(tar -tzf "${archive}")
}

ensure_service_account() {
  local nologin

  if ! getent group "${SERVICE_GROUP}" >/dev/null; then
    groupadd --system "${SERVICE_GROUP}"
  fi

  if ! id -u "${SERVICE_USER}" >/dev/null 2>&1; then
    nologin="$(command -v nologin || true)"
    [[ -n "${nologin}" ]] || nologin="/usr/sbin/nologin"
    useradd --system \
      --gid "${SERVICE_GROUP}" \
      --home-dir "${DATA_DIR}" \
      --shell "${nologin}" \
      "${SERVICE_USER}"
  fi

  install -d -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" -m 0750 "${DATA_DIR}"
}

write_env_value() {
  local name value
  name="$1"
  value="$2"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s="%s"\n' "${name}" "${value}"
}

read_env_value() {
  local name fallback value
  name="$1"
  fallback="$2"
  value="$(awk -F= -v key="${name}" '$1 == key { gsub(/^"|"$/, "", $2); print $2; exit }' "${ENV_FILE}")"
  printf '%s' "${value:-${fallback}}"
}

write_initial_config() {
  install -d -m 0755 "${CONFIG_DIR}"

  if [[ -f "${ENV_FILE}" ]]; then
    log "保留现有配置 ${ENV_FILE}"
    return
  fi

  umask 077
  {
    write_env_value "PORT" "${CONFIG_PORT}"
    write_env_value "SITE_URL" "${CONFIG_SITE_URL}"
    write_env_value "ADMIN_PASSWORD" "${CONFIG_ADMIN_PASSWORD}"
    write_env_value "ADMIN_PATH" "${CONFIG_ADMIN_PATH}"
    write_env_value "ABLOG_DATA_DIR" "${DATA_DIR}"
  } >"${ENV_FILE}"
  chmod 0600 "${ENV_FILE}"
}

install_release() {
  local release_id staged_release new_link
  release_id="$(date -u +%Y%m%d%H%M%S)-$$"
  NEW_RELEASE="${RELEASES_DIR}/${release_id}"
  staged_release="${TEMP_DIR}/ablog"
  new_link="${INSTALL_ROOT}/.current-${release_id}"

  install -d -m 0755 "${RELEASES_DIR}"
  if [[ -L "${CURRENT_LINK}" ]]; then
    OLD_RELEASE="$(readlink -f "${CURRENT_LINK}")"
  elif [[ -e "${CURRENT_LINK}" ]]; then
    die "${CURRENT_LINK} 已存在且不是符号链接，请先手动检查"
  fi

  chown -R root:root "${staged_release}"
  mv "${staged_release}" "${NEW_RELEASE}"
  ln -s "${NEW_RELEASE}" "${new_link}"
  mv -Tf "${new_link}" "${CURRENT_LINK}"
}

write_systemd_unit() {
  cat >"${SERVICE_FILE}" <<'EOF'
[Unit]
Description=ABlog personal blog
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=ablog
Group=ablog
WorkingDirectory=/opt/ablog/current/app
Environment=NODE_ENV=production
EnvironmentFile=/etc/ablog/ablog.env
ExecStart=/opt/ablog/current/node/bin/node /opt/ablog/current/app/server.js
Restart=on-failure
RestartSec=3
TimeoutStopSec=20
UMask=0027
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/lib/ablog

[Install]
WantedBy=multi-user.target
EOF
  chmod 0644 "${SERVICE_FILE}"
}

rollback_release() {
  if [[ -n "${OLD_RELEASE}" && -d "${OLD_RELEASE}" ]]; then
    log "新版本启动失败，恢复上一版本"
    ln -sfn "${OLD_RELEASE}" "${CURRENT_LINK}"
    systemctl restart ablog.service >/dev/null 2>&1 || true
  fi
}

start_service() {
  local port attempt
  port="$(read_env_value "PORT" "3000")"

  systemctl daemon-reload
  systemctl enable ablog.service >/dev/null
  if ! systemctl restart ablog.service; then
    rollback_release
    journalctl -u ablog.service -n 30 --no-pager >&2 || true
    die "ABlog 服务启动失败"
  fi

  for attempt in {1..20}; do
    if curl --fail --silent --show-error "http://127.0.0.1:${port}/" >/dev/null; then
      return
    fi
    sleep 1
  done

  rollback_release
  journalctl -u ablog.service -n 30 --no-pager >&2 || true
  die "ABlog 服务未通过本机健康检查"
}

print_result() {
  local port admin_path
  port="$(read_env_value "PORT" "3000")"
  admin_path="$(read_env_value "ADMIN_PATH" "/admin")"

  log "部署完成"
  printf '  访问地址: http://服务器IP:%s\n' "${port}"
  printf '  管理后台: http://服务器IP:%s%s\n' "${port}" "${admin_path}"
  printf '  配置文件: %s\n' "${ENV_FILE}"
  printf '  数据目录: %s\n' "${DATA_DIR}"
  if [[ -n "${GENERATED_PASSWORD}" ]]; then
    printf '  初始后台密码: %s\n' "${GENERATED_PASSWORD}"
    printf '  请首次登录后立即修改此密码。\n'
  fi
}

main() {
  require_root
  require_commands
  collect_initial_config
  download_release
  ensure_service_account
  write_initial_config
  install_release
  write_systemd_unit
  start_service
  print_result
}

if [[ -z "${BASH_SOURCE[0]:-}" || "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
