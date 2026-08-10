# 网易云音乐本地桥接

Vinyll 部署在浏览器中，浏览器不能直接执行本机的网易云应用或 CLI。这个桥接只监听 `127.0.0.1:17863`，将网页的播放、暂停、上一首、下一首请求转交给网易云官方 `ncm-cli`。

## 通用准备

1. 安装 Node.js 18 或更高版本。
2. 安装 `mpv` 并确保终端能运行 `mpv --version`。
3. 在[网易云音乐开放平台](https://developer.music.163.com/st/developer/apply/account?type=INDIVIDUAL)入驻并取得 App ID 和 Private Key。
4. 安装并登录网易云官方 CLI：

```bash
npm install -g @music163/ncm-cli
ncm-cli configure
ncm-cli login
```

`ncm-cli login` 会在终端显示二维码，用网易云音乐 App 扫码确认。

## macOS

如果使用 Homebrew，可以先安装 mpv：

```bash
brew install mpv
```

在本仓库根目录启动桥接：

```bash
node bridge/server.js
```

## Windows

安装 Windows 版 Node.js 与 mpv，把 `mpv.exe` 所在目录加入 PATH，然后在 PowerShell 中完成上面的 CLI 配置。进入仓库根目录后运行：

```powershell
node bridge\server.js
```

## 自定义部署域名

默认只允许本地开发地址和 `https://vinyll.leoenchanted.top` 访问桥接。若你使用其他正式域名，启动前设置逗号分隔的白名单：

```bash
VINYLL_BRIDGE_ORIGINS=https://你的域名.example node bridge/server.js
```

网页无法静默安装本地软件，这个限制在 macOS 和 Windows 上相同。桥接不会把网易云的 App ID、Private Key 或登录信息上传到 Vinyll，也不接受任意终端命令。
