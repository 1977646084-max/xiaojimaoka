# 小机猫咖：Mac 本地 MCP 教程

适用于本仓库的 Mac 网页版（v0.5.1）。配置后，Codex 和网页可以操作同一家店。这是本地连接教程，不是 Operit 安装或 ChatGPT 远程接入说明。

## 一、启动 Mac 网页版

需要 Node.js 22.13 或更新的 22.x 版本，或 Node.js 24 及以上。解压后在终端执行（以解压到「下载」为例）：

```sh
cd "$HOME/Downloads/xiaoji-cat-cafe"
node --version
node web-server.mjs
```

打开 [http://127.0.0.1:8765](http://127.0.0.1:8765)。终端保持打开。退出网页服务可按 Control+C。项目使用 Node.js 自带的模块，解压后可直接运行。若端口被占用，用 `node web-server.mjs --port 8766`。

## 二、本地 stdio MCP

网页和 MCP 一起读写 `save.sqlite`。两边的 `CAT_CAFE_DATA_DIR` 须指向同一个绝对路径，省略时默认用 `~/.xiaoji-cat-cafe`。如果之前自定义过存档目录，继续使用同一目录。建议启动新版前结束旧版服务，避免旧进程继续操作这份存档。

网页启动时可通过环境变量设定现实制作时间，默认 20 秒：

```sh
CAT_CAFE_ORDER_SECONDS=20 node web-server.mjs
```

兼容 stdio 的 MCP 客户端应启动 `node server.mjs` 子进程。下面是 Codex 的 `~/.codex/config.toml` 示例。按 `command -v node` 和项目实际路径修改，保留整体结构。保存后重启客户端。见 [Codex MCP 配置文档](https://developers.openai.com/codex/mcp)。

```toml
[mcp_servers.xiaoji_cat_cafe]
command = "/opt/homebrew/bin/node"
args = ["/Users/你的用户名/Downloads/xiaoji-cat-cafe/server.mjs"]

[mcp_servers.xiaoji_cat_cafe.env]
CAT_CAFE_DATA_DIR = "/Users/你的用户名/.xiaoji-cat-cafe"
CAT_CAFE_ORDER_SECONDS = "20"
CAT_CAFE_MCP_MODE = "play"
```

`CAT_CAFE_ORDER_SECONDS` 接受 1–3600 的整数。两边设置相同才会为新接订单使用相同的时长。已接单保留已写入的截止时间。`CAT_CAFE_MCP_MODE=read-only` 只公开查询工具。后台仍会按原截止时间结算已经开始制作的订单。

### 测试 MCP

- 运行 `npm test`。这会启动网页与两个 stdio 测试进程，使用独立的临时存档验证查询、权限、接单、结算与猫咪状态同步。
- 手动测试时，先在网页领养、开业。用 MCP 客户端调用 `get_shop_status`、`get_orders` 和 `get_cats`。从 `get_orders` 取状态为 `waiting` 的 `order_id`，调用 `accept_order`。网页会显示小机的倒计时。
- 对同一 ID 调用 `process_order`。到期前返回剩余时间，到期后返回已结算状态。然后在网页手动打烊，用 `get_business_summary` 核对总结。
- `care_for_cat` 的 `action` 为 `feed`、`play`、`clean`、`pet` 或 `rest`。喂食和玩耍须有可用库存，并可指定 `item_id`。多只猫时传入 `cat_id`。
- `interact_with_robot` 的 `action` 为 `chat`、`poke`、`feed`、`stick` 或 `remove_sticker`。投喂的 `item` 为 `coffee` 或 `snack`，贴纸为 `paw` 或 `bow`。聊天可带 `message`，也可给互动指定当前 `order_id`。

## 存档

两个进程默认共用 `~/.xiaoji-cat-cafe/save.sqlite`。`save.json` 是 v0.1 的存档，首次初始化 SQLite 时会从同目录导入，原 JSON 文件留作备份。旧版 SQLite 存档可直接继续使用。v0.4 的营业日、进行中的订单及其截止时间、金币、经验、猫咪和自定义立绘保持原样。

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
