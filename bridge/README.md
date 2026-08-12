# 网易云音乐本地助手

Vinyll 是线上网页，浏览器不能直接读取电脑的系统媒体信息，所以当前歌曲同步需要一个只监听 `127.0.0.1:17863` 的可选原生助手。收藏专辑由网页扫码登录直接读取，不依赖助手。助手只向网页提供当前歌曲、封面、进度和播放状态，不上传网易云账号、Cookie、密码或播放记录，也不执行播放控制。

## Windows

Windows 助手通过 SMTC（Windows 系统媒体会话）读取网易云音乐桌面客户端，不需要开放平台凭证或其他运行环境。

1. [下载 Windows x64 助手](https://github.com/leoenchanted/vinyll/releases/latest/download/Vinyll.NeteaseBridge-win-x64.exe)。
2. 双击一次。助手会安装到当前用户目录、注册登录时启动，并驻留在系统托盘。
3. 在网易云音乐 Windows 客户端中播放歌曲。
4. 打开 [Vinyll](https://vinyll.leoenchanted.top)；浏览器首次询问本地网络访问时选择“允许”。

部分网易云 3.x 版本不会发布 SMTC。助手检测不到 SMTC 时，会只针对 `cloudmusic.exe` 启用本机兼容读取：从窗口标题识别当前歌曲，从网易云本地 `playingList` 补齐专辑、封面和时长，再通过 Windows 音频会话判断播放状态。这个模式同样只读。

右键系统托盘图标可以打开 Vinyll、开关登录时启动、查看日志或退出。日志位于 `%LOCALAPPDATA%\Vinyll\bridge.log`。源码位于 [`windows/Vinyll.NeteaseBridge`](windows/Vinyll.NeteaseBridge)。

## macOS

macOS 助手是单独的原生菜单栏 App。它读取网易云官方 Mac 客户端发布到 macOS 系统“正在播放”中心的歌曲、歌手、专辑、封面、时长、进度和播放状态，不控制网易云客户端，也不需要 Node.js、mpv、ncm-cli 或开放平台 App ID。

1. [下载 macOS Universal 助手](https://github.com/leoenchanted/vinyll/releases/latest/download/Vinyll.NeteaseCompanion-macOS-universal.zip)。
2. 解压后把 `Vinyll 网易云助手.app` 拖入“应用程序”。
3. 当前构建尚未公证，首次启动请右键 App 并选择“打开”，再确认一次。
4. 在网易云音乐 Mac 客户端中播放歌曲。
5. 回到 [Vinyll](https://vinyll.leoenchanted.top)；浏览器首次询问本地网络访问时选择“允许”。

支持 macOS 15.4 及以上，安装包同时包含 Apple Silicon 与 Intel 架构。助手运行后出现在菜单栏，可打开网站、开关登录时启动、查看日志或退出；日志位于 `~/Library/Logs/Vinyll/netease-companion.log`。源码位于 [`macos/Vinyll.NeteaseCompanion`](macos/Vinyll.NeteaseCompanion)。

macOS 当前播放读取依赖系统的 MediaRemote 能力。它不绕过网易云登录或音乐版权限制，但该系统接口不是面向第三方稳定公开的 API，因此未来 macOS 大版本升级后可能需要更新助手。

## Linux

Linux 暂不提供官方桌面客户端当前播放同步。网易云扫码登录、收藏专辑、曲目详情和歌词搜索仍可使用，不需要安装助手。

## 常见问题

- **端口 17863 被占用：**退出正在运行的旧版 Vinyll 助手，再重新启动。
- **网页显示等待播放：**确认助手正在菜单栏或系统托盘运行，并在网易云官方桌面客户端开始播放。
- **浏览器连接失败：**允许 Vinyll 的“本地网络访问”权限，并确认安全软件没有拦截 `127.0.0.1:17863`。
- **Windows SmartScreen / macOS 未知开发者提示：**当前 Release 尚未使用商业代码签名证书或 Apple 公证。只从本仓库 Release 下载；后续配置签名后可移除该提示。

## 安全边界

- 助手只绑定 `127.0.0.1`，局域网其他设备无法访问。
- 只接受本地开发地址与 `https://vinyll.leoenchanted.top` 的浏览器请求。
- 只暴露只读的 `GET /health` 和 `GET /state`，没有播放控制接口。
- 收藏库登录使用 Vercel 同源的 HttpOnly Cookie，与本地助手完全隔离。
