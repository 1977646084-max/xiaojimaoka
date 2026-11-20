# 小机猫咖 v0.2

这是基于 v0.1 的横屏网页与本地 MCP 测试版。网页和 Codex 都在 Mac 上访问同一套游戏逻辑与本地存档。手机和 iPad 可通过同一 Wi-Fi 打开网页。

## 一、在 Mac 启动网页

需要 Node.js 22.13 或更新的 22.x 版本，或 Node.js 24 及以上。解压后在终端执行（以解压到「下载」为例）：

```sh
cd "$HOME/Downloads/xiaoji-cat-cafe"
node --version
node web-server.mjs
```

打开 [http://127.0.0.1:8765](http://127.0.0.1:8765)。终端保持打开。退出网页服务可按 Control+C。项目使用 Node.js 自带的模块，解压后可直接运行。若端口被占用，用 `node web-server.mjs --port 8766`。

## 二、接入 Codex 的本地 stdio MCP

用 `command -v node` 查出 Node 的绝对路径，用 `pwd` 查出当前项目目录。将下列示例合并进 `~/.codex/config.toml`。如果已有 `[mcp_servers.xiaoji_cat_cafe]`，更新原有段落。

```toml
[mcp_servers.xiaoji_cat_cafe]
command = "/opt/homebrew/bin/node"
args = ["/Users/你的用户名/Downloads/xiaoji-cat-cafe/server.mjs"]
```

保存后重启 Codex，并新开本地聊天。Codex 会通过 stdio 启动 MCP 进程。项目目录中也附有 `config.toml.example`。配置格式参见 [Codex MCP 官方文档](https://developers.openai.com/codex/mcp)。

## 三、试跑领养和喂食

1. 网页点「领养一只猫」，确认店名，选一只候选猫、取名并确认。左上角显示饱食度 **70 / 100**，猫猫币 **50**。
2. 在 Codex 聊天发 **「帮我喂猫」**。只有一只猫时，`cat_feed` 可省略猫咪 ID。有多只猫时，可以说「帮我喂布丁」。
3. 保持网页打开。喂食成功后，页面通常在约一秒内显示 **95 / 100** 和 **45** 猫猫币。切回后台过的页面时会立即同步。
4. 关闭网页或停掉网页服务，按第一步重开。饱食度和猫猫币仍为 **95 / 100** 和 **45**。网页「喂食」按钮也调用同一个 `cat_feed` 操作。

「猫咪」可以切换当前照顾的猫或继续领养，最多五只。场景内的猫咪共用橘猫立绘，候选花色、眼睛和性格可在「猫咪」菜单查看。本测试版饱食度只随喂食变化，便于复测。

## 手机或 iPad 横屏

让设备和 Mac 连上同一个可信 Wi-Fi。在 Mac 的「系统设置 → Wi-Fi → 详细信息 → TCP/IP」查看 IP 地址。假设是 `192.168.1.23`，在 Mac 停掉默认网页进程，然后执行：

```sh
node web-server.mjs --host 192.168.1.23
```

在手机或 iPad 的 Safari 打开 `http://192.168.1.23:8765`，再转成横屏。若防火墙询问，允许该网页进程接收本地连接。此模式下同网段且能访问该地址的设备共用这份猫咖进度。

## 存档

两个进程默认共用 `~/.xiaoji-cat-cafe/save.sqlite`。`save.json` 是 v0.1 的存档，首次初始化 SQLite 时会从同目录导入，原 JSON 文件留作备份。升级前请先关闭 v0.1 MCP 进程。

可用 `CAT_CAFE_DATA_DIR` 指向另一份存档，例如：

```sh
CAT_CAFE_DATA_DIR="$HOME/Documents/cat-cafe-test-save" node web-server.mjs
```

在 `config.toml` 中同步填写同一目录的绝对路径：

```toml
[mcp_servers.xiaoji_cat_cafe.env]
CAT_CAFE_DATA_DIR = "/Users/你的用户名/Documents/cat-cafe-test-save"
```

修改后重启网页服务和 Codex，再开始测试。
