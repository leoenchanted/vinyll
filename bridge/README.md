# 网易云音乐本地连接

Vinyll 是线上网页，浏览器不能直接读取电脑上的系统媒体信息，因此当前歌曲同步需要一个只监听 `127.0.0.1:17863` 的可选本地助手。收藏专辑由网页扫码登录直接读取，不依赖该助手。播放信息只在当前电脑内传递，不上传网易云账号、Cookie 或密码。

## Windows（推荐）

Windows 版本通过 SMTC（Windows 系统媒体会话）直接连接网易云音乐桌面客户端。用户不需要申请开放平台凭证，也不需要安装 Node.js、mpv 或 ncm-cli。

1. 从 [GitHub Releases](https://github.com/leoenchanted/vinyll/releases/latest/download/Vinyll.NeteaseBridge-win-x64.exe) 下载 `Vinyll.NeteaseBridge-win-x64.exe`。
2. 双击一次。助手会复制到 `%LOCALAPPDATA%\Vinyll\Vinyll.NeteaseBridge.exe`、注册当前用户开机启动，并驻留在系统托盘。
3. 打开网易云音乐 Windows 桌面客户端，播放一首歌。
4. 打开 [Vinyll](https://vinyll.leoenchanted.top)，选择“网易云音乐”。Chrome/Edge 首次询问本地网络访问权限时选择“允许”。

助手优先使用 Windows SMTC，同步歌名、歌手、专辑、封面、进度和播放状态。Vinyll 只读取这些信息来呈现当前黑胶与同步歌词，不向助手发送播放、暂停、上一首、下一首或跳转进度命令；所有控制留在网易云音乐 App。助手只选择来源标识包含 `cloudmusic`、`netease` 或 `music163` 的系统媒体会话，不会误读 Spotify 或浏览器视频。

部分网易云 3.x 版本（包括已验证的 `3.1.21.204647`）主动关闭了 SMTC。助手检测不到网易云 SMTC 时，会只针对 `cloudmusic.exe` 启用本机兼容模式：通过窗口标题识别当前歌曲，从网易云自己的 `playingList` 文件补齐专辑、封面和时长，再用 Windows 音频会话判断播放状态。兼容模式开放已验证可靠的上一首/下一首；为避免系统媒体键误控 Chrome，暂停与进度跳转按钮会禁用。

### 托盘菜单

右键系统托盘中的助手图标，可以打开 Vinyll、开关开机启动、查看日志或退出助手。运行日志位于 `%LOCALAPPDATA%\Vinyll\bridge.log`。

### 常见问题

- **提示端口 17863 被占用：**关闭以前运行的 `node bridge/server.js` 终端，再重新打开助手。
- **网页显示等待播放：**确认 `cloudmusic.exe` 正在运行并播放歌曲。即使 Windows 媒体面板没有网易云，助手也会自动尝试兼容模式。
- **浏览器连接失败：**确认助手正在托盘运行，并允许 Vinyll 的“本地网络访问”权限。
- **SmartScreen 提示未知发布者：**当前 GitHub Release 构建尚未购买代码签名证书。请确认文件来自本仓库 Release；以后配置 EV/OV 代码签名后可消除此提示。
- **安装新版本：**下载并双击新版 EXE。它会关闭旧助手、覆盖当前用户目录中的版本并重新启动。

Windows 助手源码位于 [`windows/Vinyll.NeteaseBridge`](windows/Vinyll.NeteaseBridge)，Release 由 GitHub Actions 从该源码自动构建。

## macOS / Linux（现有命令行方案）

非 Windows 系统继续使用网易云官方 `ncm-cli`：

> 这一方案读取的是 `ncm-cli + mpv` 自身的播放状态，不会读取网易云官方 Mac 桌面客户端。收藏专辑扫码在 Mac 上可以直接使用；若希望像 Windows 一样同步官方桌面客户端，需要后续提供单独的 macOS 原生助手。

1. 安装 Node.js 18 或更高版本。
2. 安装 `mpv` 并确保终端能运行 `mpv --version`。
3. 在[网易云音乐开放平台](https://developer.music.163.com/st/developer/apply/account?type=INDIVIDUAL)取得 App ID 和 Private Key。
4. 安装、配置并登录 CLI：

```bash
npm install -g @music163/ncm-cli
ncm-cli configure
ncm-cli login
node bridge/server.js
```

macOS 可以使用 `brew install mpv`。保持 `node bridge/server.js` 的终端窗口运行，再回到网页连接。

## 安全边界

- 助手只绑定 `127.0.0.1`，局域网内其他电脑无法访问。
- 默认只接受本地开发地址与 `https://vinyll.leoenchanted.top` 的浏览器请求。
- 网页适配器只调用播放状态读取接口，不调用播放、暂停、上一首、下一首或跳转进度接口。
- 收藏库扫码登录不接触账号密码；会话只保存在 Vercel 同源的 HttpOnly Cookie 中，与本地助手完全隔离。

非 Windows CLI 桥接若需要允许其他正式域名，可在启动前设置：

```bash
VINYLL_BRIDGE_ORIGINS=https://你的域名.example node bridge/server.js
```
