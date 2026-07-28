'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');

function bash(args) {
  const result = spawnSync('bash', args, { cwd: root, encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}

test('安装器可通过 Bash 语法检查并提供动作说明', () => {
  const syntax = bash(['-n', 'install.sh']);
  assert.equal(syntax.status, 0, syntax.stderr);

  const help = bash(['install.sh', '--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /install\|upgrade\|uninstall/);
  assert.match(help.stdout, /ABLOG_CONFIRM_UNINSTALL=1/);
  assert.match(help.stdout, /ABLOG_PURGE_DATA=1/);
});

test('安装器后台路径校验与应用保留路径一致', () => {
  const accepted = bash(['-c', 'source ./install.sh; normalize_admin_path /manage_7f3a']);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(accepted.stdout, '/manage_7f3a');

  for (const reserved of ['/healthz', '/search', '/uploads']) {
    const rejected = bash(['-c', 'source ./install.sh; normalize_admin_path "' + reserved + '"']);
    assert.notEqual(rejected.status, 0, reserved + ' must be rejected');
  }
});

test('交互菜单定义状态、操作项和分隔线', () => {
  const menu = bash(['-c', 'source ./install.sh; declare -f print_menu; declare -f ui_separator']);
  assert.equal(menu.status, 0, menu.stderr);
  assert.match(menu.stdout, /ABlog 安装与维护工具/);
  assert.match(menu.stdout, /运行状态/);
  assert.match(menu.stdout, /当前版本/);
  assert.match(menu.stdout, /最新版本/);
  assert.match(menu.stdout, /1\. 安装 ABlog/);
  assert.match(menu.stdout, /2\. 升级 ABlog/);
  assert.match(menu.stdout, /3\. 卸载 ABlog/);
  assert.ok((menu.stdout.match(/ui_separator/g) || []).length >= 4);
  assert.match(menu.stdout, /={20,}/);
});

test('升级保留已有配置，健康检查静默等待就绪', () => {
  const functions = bash(['-c', 'source ./install.sh; declare -f collect_initial_config write_initial_config start_service effective_admin_path']);
  assert.equal(functions.status, 0, functions.stderr);
  assert.match(functions.stdout, /升级时保持/);
  assert.match(functions.stdout, /后台路径（例如 \/manage_7f3a）/);
  assert.match(functions.stdout, /\/healthz/);
  assert.doesNotMatch(functions.stdout, /--show-error/);
  assert.match(functions.stdout, /read_admin_path_override/);
  assert.doesNotMatch(functions.stdout, /write_updated_config/);
});

test('自动操作会根据安装状态选择安装或升级', () => {
  const install = bash(['-c', 'source ./install.sh; is_installed() { return 1; }; resolve_action auto']);
  assert.equal(install.status, 0, install.stderr);
  assert.equal(install.stdout, 'install');

  const upgrade = bash(['-c', 'source ./install.sh; is_installed() { return 0; }; resolve_action auto']);
  assert.equal(upgrade.status, 0, upgrade.stderr);
  assert.equal(upgrade.stdout, 'upgrade');
});

test('最新 Release 标签从 GitHub 重定向地址中提取', () => {
  const tag = bash(['-c', 'source ./install.sh; release_tag_from_url https://github.com/Su-cyber-art/ABlog/releases/tag/v1.2.3']);
  assert.equal(tag.status, 0, tag.stderr);
  assert.equal(tag.stdout, 'v1.2.3');

  const invalid = bash(['-c', 'source ./install.sh; release_tag_from_url https://github.com/Su-cyber-art/ABlog/releases/latest']);
  assert.notEqual(invalid.status, 0);
});

test('最新版本查询在同一菜单会话中缓存', () => {
  const cached = bash(['-c', `
    source ./install.sh
    curl() { printf '%s' 'https://github.com/Su-cyber-art/ABlog/releases/tag/v2.0.0'; }
    refresh_latest_version
    refresh_latest_version
    declare -p LATEST_VERSION LATEST_VERSION_CHECKED
  `]);
  assert.equal(cached.status, 0, cached.stderr);
  assert.match(cached.stdout, /LATEST_VERSION="v2\.0\.0"/);
  assert.match(cached.stdout, /LATEST_VERSION_CHECKED="1"/);
});

test('安装结果优先使用站点公网地址，再检测公网 IP 或回退网卡地址', () => {
  const fromSiteUrl = bash(['-c', `
    source ./install.sh
    read_env_value() { printf '%s' 'https://blog.example.com'; }
    resolve_access_url 8848
    declare -p ACCESS_URL ACCESS_URL_SOURCE
  `]);
  assert.equal(fromSiteUrl.status, 0, fromSiteUrl.stderr);
  assert.match(fromSiteUrl.stdout, /ACCESS_URL="https:\/\/blog\.example\.com"/);
  assert.match(fromSiteUrl.stdout, /ACCESS_URL_SOURCE="站点公网地址"/);

  const fromPublicIp = bash(['-c', `
    source ./install.sh
    read_env_value() { printf '%s' ''; }
    network_ipv4_candidates() { return 0; }
    curl() { printf '%s' '203.0.113.9'; }
    resolve_access_url 8848
    declare -p ACCESS_URL ACCESS_URL_SOURCE
  `]);
  assert.equal(fromPublicIp.status, 0, fromPublicIp.stderr);
  assert.match(fromPublicIp.stdout, /ACCESS_URL="http:\/\/203\.0\.113\.9:8848"/);
  assert.match(fromPublicIp.stdout, /ACCESS_URL_SOURCE="检测到的公网 IP"/);

  const fromNetwork = bash(['-c', `
    source ./install.sh
    read_env_value() { printf '%s' ''; }
    network_ipv4_candidates() { printf '%s\\n' '10.8.0.4'; }
    curl() { return 1; }
    resolve_access_url 8848
    declare -p ACCESS_URL ACCESS_URL_SOURCE
  `]);
  assert.equal(fromNetwork.status, 0, fromNetwork.stderr);
  assert.match(fromNetwork.stdout, /ACCESS_URL="http:\/\/10\.8\.0\.4:8848"/);
  assert.match(fromNetwork.stdout, /ACCESS_URL_SOURCE="网卡地址"/);
});
