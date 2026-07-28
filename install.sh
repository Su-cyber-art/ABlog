#!/usr/bin/env bash
set -Eeuo pipefail

readonly REPOSITORY="${ABLOG_REPOSITORY:-Su-cyber-art/ABlog}"
readonly VERSION="${ABLOG_VERSION:-latest}"
readonly INSTALL_ROOT="/opt/ablog"
readonly RELEASES_DIR="${INSTALL_ROOT}/releases"
readonly CURRENT_LINK="${INSTALL_ROOT}/current"
readonly DATA_DIR="/var/lib/ablog"
readonly ADMIN_PATH_OVERRIDE_FILE="${DATA_DIR}/admin-path.json"
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
REQUESTED_ACTION="auto"
OPERATION=""
LATEST_VERSION='获取失败'
LATEST_VERSION_CHECKED='0'
ACCESS_URL=""
ACCESS_URL_SOURCE=""

COLOR_RESET=""
COLOR_BLUE=""
COLOR_GOLD=""
COLOR_GREEN=""
COLOR_DIM=""

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
    awk chown chmod curl date getent groupadd id install journalctl ln mktemp mv od readlink rm \
    sha256sum sleep systemctl tar tr uname useradd; do
    command -v "${command_name}" >/dev/null 2>&1 || die "缺少命令: ${command_name}"
  done
}

can_prompt() {
  [[ "${ABLOG_NONINTERACTIVE:-0}" != "1" && -r /dev/tty && -w /dev/tty ]]
}

setup_colors() {
  if [[ "${ABLOG_COLOR:-auto}" != "never" && "${TERM:-dumb}" != "dumb" ]]; then
    COLOR_RESET=$'\033[0m'
    COLOR_BLUE=$'\033[1;34m'
    COLOR_GOLD=$'\033[1;33m'
    COLOR_GREEN=$'\033[1;32m'
    COLOR_DIM=$'\033[0;37m'
  fi
}

ui_line() {
  printf '%s\n' "$*" >/dev/tty
}

ui_separator() {
  ui_line "${COLOR_BLUE}============================================================${COLOR_RESET}"
}

is_installed() {
  [[ -L "${CURRENT_LINK}" \
    && -x "${CURRENT_LINK}/node/bin/node" \
    && -f "${CURRENT_LINK}/app/server.js" ]]
}

has_ablog_artifacts() {
  [[ -e "${INSTALL_ROOT}" || -L "${CURRENT_LINK}" || -f "${SERVICE_FILE}" \
    || -f "${ENV_FILE}" || -d "${DATA_DIR}" ]] || id -u "${SERVICE_USER}" >/dev/null 2>&1
}

installation_status() {
  if is_installed; then
    if systemctl is-active --quiet ablog.service >/dev/null 2>&1; then
      printf '运行中'
    else
      printf '已安装（未运行）'
    fi
  elif [[ -f "${ENV_FILE}" || -d "${DATA_DIR}" ]]; then
    printf '未安装（保留数据或配置）'
  else
    printf '未安装'
  fi
}

installed_version() {
  local package_file version
  package_file="${CURRENT_LINK}/app/package.json"
  if [[ -f "${package_file}" ]]; then
    version="$(awk -F'"' '/^[[:space:]]*"version"[[:space:]]*:/ { print $4; exit }' "${package_file}")"
    if [[ -n "${version}" ]]; then
      printf 'v%s' "${version}"
      return
    fi
  fi
  printf '-'
}

release_tag_from_url() {
  local final_url="${1:-}"
  if [[ "${final_url}" =~ /releases/tag/([^/?#]+) ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return
  fi
  return 1
}

refresh_latest_version() {
  local final_url latest
  if [[ "${LATEST_VERSION_CHECKED}" != '0' ]]; then
    return 0
  fi
  LATEST_VERSION_CHECKED='1'

  final_url="$(curl --proto '=https' --tlsv1.2 --fail --silent --location \
    --connect-timeout 5 --max-time 12 --output /dev/null --write-out '%{url_effective}' \
    "https://github.com/${REPOSITORY}/releases/latest" 2>/dev/null || true)"
  if latest="$(release_tag_from_url "${final_url}")"; then
    LATEST_VERSION="${latest}"
  fi
  return 0
}

print_menu() {
  local status version latest_version
  status="$(installation_status)"
  version="$(installed_version)"
  refresh_latest_version
  latest_version="${LATEST_VERSION}"

  ui_line
  ui_separator
  ui_line "              ${COLOR_GOLD}ABlog 安装与维护工具${COLOR_RESET}"
  ui_separator
  ui_line "${COLOR_GREEN}运行状态 : ${status}${COLOR_RESET}"
  ui_line "${COLOR_GREEN}当前版本 : ${version}${COLOR_RESET}"
  ui_line "${COLOR_GREEN}最新版本 : ${latest_version}${COLOR_RESET}"
  ui_separator
  ui_line "${COLOR_GREEN}1. 安装 ABlog${COLOR_RESET}"
  ui_line "${COLOR_GREEN}2. 升级 ABlog${COLOR_RESET}"
  ui_line "${COLOR_GREEN}3. 卸载 ABlog${COLOR_RESET}"
  ui_line "${COLOR_GREEN}0. 退出${COLOR_RESET}"
  ui_separator
}

prompt_menu_choice() {
  local choice
  while true; do
    printf '请输入数字 [0-3]: ' >/dev/tty
    IFS= read -r choice </dev/tty || die "无法读取终端输入"
    case "${choice}" in
      0|1|2|3)
        printf '%s' "${choice}"
        return
        ;;
      *)
        ui_line "${COLOR_DIM}请输入 0 到 3 之间的数字。${COLOR_RESET}"
        ;;
    esac
  done
}

pause_for_menu() {
  printf '\n按 Enter 返回菜单...' >/dev/tty
  IFS= read -r _ </dev/tty || true
}

prompt_default() {
  local result_var label default_value input
  result_var="$1"
  label="$2"
  default_value="$3"

  printf '  %s [%s]: ' "${label}" "${default_value}" >/dev/tty
  IFS= read -r input </dev/tty || die "无法读取终端输入"
  printf -v "${result_var}" '%s' "${input:-${default_value}}"
}

prompt_yes_no() {
  local label default_yes answer hint
  label="$1"
  default_yes="$2"
  hint='y/N'
  if [[ "${default_yes}" == "1" ]]; then
    hint='Y/n'
  fi

  while true; do
    printf '  %s [%s]: ' "${label}" "${hint}" >/dev/tty
    IFS= read -r answer </dev/tty || die "无法读取终端输入"
    answer="${answer,,}"
    case "${answer}" in
      '')
        [[ "${default_yes}" == "1" ]]
        return
        ;;
      y|yes)
        return 0
        ;;
      n|no)
        return 1
        ;;
      *)
        ui_line "${COLOR_DIM}请输入 y 或 n。${COLOR_RESET}"
        ;;
    esac
  done
}

prompt_password() {
  local first second

  while true; do
    printf '  后台初始密码（至少 8 位）: ' >/dev/tty
    IFS= read -r -s first </dev/tty || die "无法读取终端输入"
    printf '\n' >/dev/tty
    if ((${#first} < 8)); then
      printf '  密码至少需要 8 位，请重新输入。\n' >/dev/tty
      continue
    fi

    printf '  再次确认密码: ' >/dev/tty
    IFS= read -r -s second </dev/tty || die "无法读取终端输入"
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
    /about|/archive|/css|/favicon|/fonts|/healthz|/js|/post|/search|/subscribe|/uploads)
      return 1
      ;;
  esac
  printf '%s' "${value}"
}

config_error() {
  if can_prompt; then
    ui_line "${COLOR_DIM}  配置错误: $*${COLOR_RESET}"
  else
    log "配置错误: $*" >&2
  fi
  return 1
}

validate_config() {
  [[ "${CONFIG_PORT}" =~ ^[0-9]+$ ]] || config_error "PORT 必须是数字" || return
  ((CONFIG_PORT >= 1024 && CONFIG_PORT <= 65535)) || config_error "PORT 必须在 1024 到 65535 之间" || return

  CONFIG_ADMIN_PATH="$(normalize_admin_path "${CONFIG_ADMIN_PATH}")" || {
    config_error "ADMIN_PATH 必须是安全的单段路径，例如 /admin 或 /manage_7f3a"
    return 1
  }

  if [[ -n "${CONFIG_SITE_URL}" ]]; then
    [[ "${CONFIG_SITE_URL}" =~ ^https?://[^[:space:]]+$ ]] || {
      config_error "SITE_URL 必须以 http:// 或 https:// 开头"
      return 1
    }
    CONFIG_SITE_URL="${CONFIG_SITE_URL%/}"
  fi

  [[ "${CONFIG_ADMIN_PASSWORD}" != *$'\n'* && "${CONFIG_ADMIN_PASSWORD}" != *$'\r'* ]] || {
    config_error "ADMIN_PASSWORD 不能包含换行符"
    return 1
  }
  ((${#CONFIG_ADMIN_PASSWORD} >= 8)) || {
    config_error "ADMIN_PASSWORD 至少需要 8 位"
    return 1
  }
}

collect_initial_config() {
  if [[ -f "${ENV_FILE}" ]]; then
    if [[ "${OPERATION}" == "upgrade" ]]; then
      log "检测到现有配置，升级时保持 ${ENV_FILE} 不变"
    else
      log "检测到保留配置，安装时继续使用 ${ENV_FILE}"
    fi
    return
  fi

  CONFIG_PORT="${PORT:-3000}"
  CONFIG_SITE_URL="${SITE_URL:-}"
  CONFIG_ADMIN_PATH="${ADMIN_PATH:-/admin}"
  CONFIG_ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"

  if can_prompt; then
    while true; do
      ui_line
      ui_separator
      ui_line "${COLOR_GOLD}ABlog 首次安装配置${COLOR_RESET}"
      ui_separator
      prompt_default CONFIG_PORT "监听端口" "${CONFIG_PORT}"
      prompt_default CONFIG_ADMIN_PATH "后台路径（例如 /manage_7f3a）" "${CONFIG_ADMIN_PATH}"
      prompt_default CONFIG_SITE_URL "站点公网地址（可留空）" "${CONFIG_SITE_URL}"
      if [[ -z "${CONFIG_ADMIN_PASSWORD}" || ${#CONFIG_ADMIN_PASSWORD} -lt 8 ]]; then
        prompt_password
      fi
      if validate_config; then
        break
      fi
      ui_line "${COLOR_DIM}请修正后重新输入。${COLOR_RESET}"
    done

    ui_line
    ui_line "  端口: ${CONFIG_PORT}"
    ui_line "  后台路径: ${CONFIG_ADMIN_PATH}"
    ui_line "  公网地址: ${CONFIG_SITE_URL:-未设置}"
    ui_line "  后台密码: 已设置"
    if ! prompt_yes_no "确认开始安装？" 1; then
      log "已取消安装"
      exit 0
    fi
  else
    if [[ -z "${CONFIG_ADMIN_PASSWORD}" ]]; then
      CONFIG_ADMIN_PASSWORD="$(od -An -N18 -tx1 /dev/urandom | tr -d ' \n')"
      GENERATED_PASSWORD="${CONFIG_ADMIN_PASSWORD}"
    fi
    validate_config || die "无人值守配置无效"
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

read_admin_path_override() {
  local value normalized
  [[ -f "${ADMIN_PATH_OVERRIDE_FILE}" ]] || return 1
  value="$(awk -F'"' '/"adminPath"[[:space:]]*:/ { print $4; exit }' "${ADMIN_PATH_OVERRIDE_FILE}")"
  [[ -n "${value}" ]] || return 1
  normalized="$(normalize_admin_path "${value}")" || return 1
  printf '%s' "${normalized}"
}

effective_admin_path() {
  local configured override
  configured="$(read_env_value "ADMIN_PATH" "/admin")"
  if override="$(read_admin_path_override)"; then
    printf '%s' "${override}"
  else
    printf '%s' "${configured}"
  fi
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
Environment=ABLOG_SYSTEMD_SERVICE=1
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
    if curl --fail --silent --connect-timeout 1 --max-time 2 \
      "http://127.0.0.1:${port}/healthz" >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done

  rollback_release
  journalctl -u ablog.service -n 30 --no-pager >&2 || true
  die "ABlog 服务未通过本机健康检查"
}

is_ipv4() {
  local value octet
  value="$1"
  [[ "${value}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
  IFS=. read -r -a octet <<<"${value}"
  for value in "${octet[@]}"; do
    ((10#${value} <= 255)) || return 1
  done
}

is_public_ipv4() {
  local first second
  is_ipv4 "$1" || return 1
  IFS=. read -r first second _ <<<"$1"

  ((10#${first} != 0 && 10#${first} != 10 && 10#${first} != 127)) || return 1
  ((10#${first} != 169 || 10#${second} != 254)) || return 1
  ((10#${first} != 192 || 10#${second} != 168)) || return 1
  ((10#${first} != 172 || 10#${second} < 16 || 10#${second} > 31)) || return 1
  ((10#${first} != 100 || 10#${second} < 64 || 10#${second} > 127)) || return 1
}

network_ipv4_candidates() {
  if command -v ip >/dev/null 2>&1; then
    ip -o -4 addr show scope global 2>/dev/null | awk '{ split($4, parts, "/"); print parts[1] }'
  fi
  if command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | tr ' ' '\n'
  fi
}

detect_public_ipv4() {
  local endpoint candidate
  for endpoint in 'https://api.ipify.org' 'https://ipv4.icanhazip.com'; do
    candidate="$(curl --proto '=https' --tlsv1.2 --fail --silent \
      --connect-timeout 2 --max-time 4 "${endpoint}" 2>/dev/null || true)"
    candidate="${candidate//$'\r'/}"
    candidate="${candidate//$'\n'/}"
    if is_public_ipv4 "${candidate}"; then
      printf '%s' "${candidate}"
      return
    fi
  done
  return 1
}

resolve_access_url() {
  local port site_url candidate fallback_ip public_ip
  port="$1"
  site_url="$(read_env_value "SITE_URL" "")"
  ACCESS_URL=""
  ACCESS_URL_SOURCE=""

  if [[ -n "${site_url}" ]]; then
    ACCESS_URL="${site_url}"
    ACCESS_URL_SOURCE='站点公网地址'
    return
  fi

  fallback_ip=""
  while IFS= read -r candidate; do
    if is_public_ipv4 "${candidate}"; then
      ACCESS_URL="http://${candidate}:${port}"
      ACCESS_URL_SOURCE='网卡公网 IP'
      return
    fi
    if is_ipv4 "${candidate}" && [[ "${candidate}" != 127.* ]] && [[ -z "${fallback_ip}" ]]; then
      fallback_ip="${candidate}"
    fi
  done < <(network_ipv4_candidates)

  public_ip="$(detect_public_ipv4 || true)"
  if [[ -n "${public_ip}" ]]; then
    ACCESS_URL="http://${public_ip}:${port}"
    ACCESS_URL_SOURCE='检测到的公网 IP'
    return
  fi

  if [[ -n "${fallback_ip}" ]]; then
    ACCESS_URL="http://${fallback_ip}:${port}"
    ACCESS_URL_SOURCE='网卡地址'
    return
  fi

  ACCESS_URL="http://127.0.0.1:${port}"
  ACCESS_URL_SOURCE='本机地址'
}

print_result() {
  local port admin_path verb address_label admin_label
  port="$(read_env_value "PORT" "3000")"
  admin_path="$(effective_admin_path)"
  verb='安装'
  if [[ "${OPERATION}" == "upgrade" ]]; then
    verb='升级'
  fi

  resolve_access_url "${port}"
  address_label='访问地址'
  admin_label='管理后台'
  if [[ "${ACCESS_URL_SOURCE}" == '网卡地址' || "${ACCESS_URL_SOURCE}" == '本机地址' ]]; then
    address_label="访问地址（${ACCESS_URL_SOURCE}）"
    admin_label="管理后台（${ACCESS_URL_SOURCE}）"
  fi

  log "${verb}完成"
  printf '  %s: %s\n' "${address_label}" "${ACCESS_URL}"
  printf '  %s: %s%s\n' "${admin_label}" "${ACCESS_URL}" "${admin_path}"
  if [[ "${ACCESS_URL_SOURCE}" == '网卡地址' || "${ACCESS_URL_SOURCE}" == '本机地址' ]]; then
    printf '  提示: 未能检测公网 IP；如服务器位于 NAT 或负载均衡后，请设置 SITE_URL。\n'
  fi
  printf '  配置文件: %s\n' "${ENV_FILE}"
  printf '  数据目录: %s\n' "${DATA_DIR}"
  if [[ -n "${GENERATED_PASSWORD}" ]]; then
    printf '  初始后台密码: %s\n' "${GENERATED_PASSWORD}"
    printf '  请首次登录后立即修改此密码。\n'
  fi
}

deploy_ablog() {
  collect_initial_config
  download_release
  ensure_service_account
  write_initial_config
  install_release
  write_systemd_unit
  start_service
  print_result
}

install_ablog() {
  is_installed && die "ABlog 已安装；请使用“升级 ABlog”"
  OPERATION='install'
  deploy_ablog
}

upgrade_ablog() {
  is_installed || die "未检测到可升级的 ABlog；请先安装"
  OPERATION='upgrade'
  deploy_ablog
}

uninstall_ablog() {
  local purge_data='0'

  if can_prompt; then
    ui_line
    ui_separator
    ui_line "${COLOR_GOLD}卸载 ABlog${COLOR_RESET}"
    ui_separator
    ui_line "将停止服务并移除 ${INSTALL_ROOT} 与 systemd 服务文件。"
    ui_line "默认保留 ${DATA_DIR}、${CONFIG_DIR} 及服务账号，方便日后恢复安装。"
    if ! prompt_yes_no "确认继续卸载？" 0; then
      log "已取消卸载"
      return
    fi
    if prompt_yes_no "同时彻底删除数据、配置和服务账号？" 0; then
      purge_data='1'
    fi
  else
    [[ "${ABLOG_CONFIRM_UNINSTALL:-0}" == '1' ]] || \
      die "无人值守卸载必须设置 ABLOG_CONFIRM_UNINSTALL=1"
    if [[ "${ABLOG_PURGE_DATA:-0}" == '1' ]]; then
      purge_data='1'
    fi
  fi

  systemctl disable --now ablog.service >/dev/null 2>&1 || true
  rm -f -- "${SERVICE_FILE}"
  systemctl daemon-reload
  systemctl reset-failed ablog.service >/dev/null 2>&1 || true
  rm -rf -- "${INSTALL_ROOT}"

  if [[ "${purge_data}" == '1' ]]; then
    rm -rf -- "${CONFIG_DIR}" "${DATA_DIR}"
    if id -u "${SERVICE_USER}" >/dev/null 2>&1 && command -v userdel >/dev/null 2>&1; then
      userdel "${SERVICE_USER}" || log "未能删除服务账号 ${SERVICE_USER}，请手动检查"
    fi
    if getent group "${SERVICE_GROUP}" >/dev/null && command -v groupdel >/dev/null 2>&1; then
      groupdel "${SERVICE_GROUP}" || log "未能删除服务组 ${SERVICE_GROUP}，请手动检查"
    fi
    log "已卸载 ABlog，并已删除数据、配置和服务账号"
  else
    log "已卸载 ABlog；数据、配置和服务账号已保留"
    printf '  保留数据: %s\n' "${DATA_DIR}"
    printf '  保留配置: %s\n' "${CONFIG_DIR}"
  fi
}

print_usage() {
  cat <<'EOF'
用法: install.sh [install|upgrade|uninstall]

不带参数时，脚本会在可交互终端中显示安装管理菜单。

环境变量:
  ABLOG_NONINTERACTIVE=1  禁用菜单和交互提示
  ABLOG_ACTION=...        install、upgrade、uninstall 或 auto（默认）
  ABLOG_CONFIRM_UNINSTALL=1  无人值守卸载确认
  ABLOG_PURGE_DATA=1      卸载时同时删除数据、配置和服务账号
EOF
}

parse_arguments() {
  if (($# > 1)); then
    die "用法: install.sh [install|upgrade|uninstall]"
  fi

  case "${1:-${ABLOG_ACTION:-auto}}" in
    ''|auto|install|upgrade|uninstall)
      REQUESTED_ACTION="${1:-${ABLOG_ACTION:-auto}}"
      [[ -n "${REQUESTED_ACTION}" ]] || REQUESTED_ACTION='auto'
      ;;
    -h|--help|help)
      print_usage
      exit 0
      ;;
    *)
      die "未知操作: ${1:-${ABLOG_ACTION:-auto}}；可选 install、upgrade 或 uninstall"
      ;;
  esac
}

resolve_action() {
  local action="${1:-auto}"
  case "${action}" in
    auto)
      if is_installed; then
        printf 'upgrade'
      else
        printf 'install'
      fi
      ;;
    install)
      is_installed && die "ABlog 已安装；请使用 upgrade"
      printf 'install'
      ;;
    upgrade)
      is_installed || die "未检测到可升级的 ABlog；请使用 install"
      printf 'upgrade'
      ;;
    uninstall)
      has_ablog_artifacts || die "未检测到可卸载的 ABlog"
      printf 'uninstall'
      ;;
    *)
      die "未知操作: ${action}"
      ;;
  esac
}

run_action() {
  case "$1" in
    install)
      install_ablog
      ;;
    upgrade)
      upgrade_ablog
      ;;
    uninstall)
      uninstall_ablog
      ;;
    *)
      die "未知操作: $1"
      ;;
  esac
}

interactive_menu() {
  local choice
  while true; do
    print_menu
    choice="$(prompt_menu_choice)"
    case "${choice}" in
      1)
        if is_installed; then
          ui_line "${COLOR_DIM}已检测到 ABlog，请使用“升级 ABlog”。${COLOR_RESET}"
        else
          install_ablog
        fi
        pause_for_menu
        ;;
      2)
        if is_installed; then
          upgrade_ablog
        else
          ui_line "${COLOR_DIM}未检测到可升级的 ABlog，请先安装。${COLOR_RESET}"
        fi
        pause_for_menu
        ;;
      3)
        if has_ablog_artifacts; then
          uninstall_ablog
        else
          ui_line "${COLOR_DIM}未检测到可卸载的 ABlog。${COLOR_RESET}"
        fi
        pause_for_menu
        ;;
      0)
        ui_line "${COLOR_DIM}已退出。${COLOR_RESET}"
        return
        ;;
    esac
  done
}

main() {
  parse_arguments "$@"
  setup_colors
  require_root
  require_commands

  if can_prompt && [[ "${REQUESTED_ACTION}" == 'auto' ]]; then
    interactive_menu
  else
    run_action "$(resolve_action "${REQUESTED_ACTION}")"
  fi
}

if [[ -z "${BASH_SOURCE[0]:-}" || "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
