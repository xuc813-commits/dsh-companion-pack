# DSH 伙伴插件包

这是 Windows x64 版 DSH 的可安装源码包，对应 **DSH 0.2.1-rc.3**。安装后从「设置 → 世界控制台」创建角色。

包里包含角色管理、人设、后台记忆、Emotion Engine、人民币预算、B 站视频分镜、QQ 和两种微信接入、桌面聊天小窗，以及标准预设的约 10 万 token 原生压缩设置。QQ 保留连续消息等待和按段发出回复。预算按实际使用结算，每天北京时间凌晨 1 点刷新。

桌面安装脚本另按 [版本清单](profiles/desktop-bundles.json) 安装市场、鲸鱼、壁纸、任务板、技能浏览、会话归档、屏幕读取和 Codex 子代理。它们来自各自的上游。Codex 子代理默认 GPT-6-Astra，使用目标电脑自己的 Codex 登录。DSH 内置模块由目标电脑的 DSH 提供。

所有角色、会话、记忆、头像、账号、平台许可确认、预算历史和 OAuth 资料都留在各自的电脑上。插件初次启动时角色列表为空。

## 安装到另一台电脑

1. 安装 DSH 0.2.1-rc.3，启动一次，再退出。
2. 下载并解压本仓库的源码，进入解压后的目录。在 PowerShell 运行：

   ~~~powershell
   powershell -ExecutionPolicy Bypass -File .\install.ps1 -DshCli 'C:\你的DSH目录\resources\runtime\cli\bin\dsh.cmd'
   ~~~

   DSH 的命令在 PATH 时可以省略 -DshCli。脚本默认安装桌面版整套。已有可安装的 .tgz 时，可额外传 -Package 'C:\下载目录\dsh-companion-coordinator-0.2.8.tgz'。只装伙伴插件可传 -CoreOnly。

3. 重新打开 DSH，登录自己的模型账户。在「设置 → 世界控制台」设置每日预算，然后创建新角色、填写名字和身份。默认预算为零，保存正额度后才可发起模型请求。

单独下载 .tgz 也可以装核心插件：

~~~powershell
& 'C:\你的DSH目录\resources\runtime\cli\bin\dsh.cmd' plugin --profile desktop add 'file:C:/下载目录/dsh-companion-coordinator-0.2.8.tgz' --ignore-scripts
~~~

安装器使用当前电脑的桌面配置，如需自动审批实验功能，可在 DSH 的官方插件里按需启用。卸载伙伴插件可执行同一个 dsh.cmd 的 plugin --profile desktop remove dsh-companion-coordinator。第三方插件可独立卸载；角色资料由 DSH 数据目录保存。

## 按需配置运行组件

路径都填写目标电脑上的实际位置。配置由 setup-runtime.ps1 写到 DSH_HOME/companion/runtime.json，默认 DSH_HOME 是当前用户目录下的 .dsh。改完重启 DSH。

- **B 站分镜**：准备 FFmpeg 和 FFprobe，放进 PATH，或运行 .\setup-runtime.ps1 -FfmpegDirectory 'C:\ffmpeg\bin'。匿名可读公开视频。需要登录权限的字幕，在本机 DSH 的 .env 文件中设置 BILIBILI_SESSDATA，再重启。
- **Emotion Engine**：执行 .\setup-runtime.ps1 安装独立 Python 3.12 运行时，再打开相应角色的开关。也可用 -Python 指向现成的 python.exe。
- **微信 ClawBot**：在角色控制台选择官方微信方式，启用后用自己的微信扫码。用于和绑定的机器人私聊。
- **QQ**：安装专用桌面 QQ，另从 [SnowLuma 官方发布页](https://github.com/SnowLuma/SnowLuma/releases)获取用于 Windows x64 的 2.2.1 发行包，准备 Node.js 24.22.1（可选发行包内的 Node 可执行文件）。用 -SnowLumaDirectory、-SnowLumaNode、-QqExecutable 把这三个本地路径传给 setup-runtime.ps1。阅读并确认许可后，再到控制台启用 QQ。只给自己选择的账号或群开回复权限。
- **Windows 微信**：准备受支持的 Windows 微信 4.1.15.13 或 4.1.15.56、完整的 Python 3.12 和 Visual Studio C++ x64 Build Tools。执行 .\setup-runtime.ps1 -Python 'C:\Python312\python.exe' -WechatExecutable 'C:\微信目录\Weixin.exe' -BuildWindowsWechat。按[微信适配说明](vendor/dsh-world/src/ecosystem/wechat/windows/README.md)填写自己的账号、数据库和允许的聊天；在世界控制台停止角色后选择 Windows 微信，导入本机配置。
- **桌面聊天小窗**：用带 Tk 的完整 Python 打开。先创建角色并启动，从控制台状态接口 http://127.0.0.1:端口/roleplay/api/state 的 agents 中取得对应 id。运行 .\integrations\chatbox\open-chatbox.ps1 -RoleId '新角色的ID' -Python 'C:\Python312\pythonw.exe'，有自己的 PNG 头像时可以加 -Avatar。点圆形头像走屏幕读取，读取能力由已启用的屏幕插件和角色使用的模型决定。
- **Undermind**：源码在 [integrations/undermind](integrations/undermind/README.md)，需在新机重新登记客户端并授权。

应用的登录、QQ/微信允许接收的联系人和群、角色预算、头像都在新电脑上按需设置。

## 从源码构建

使用 Node.js 24 和 npm。第三方依赖版本记录在 package-lock.json。运行 npm ci --ignore-scripts、npm run build 和 npm pack --ignore-scripts。核心包附有编译结果，从 GitHub 源码目录安装时不需要重新构建。

回归测试需要 ROLEPLAY_TEST_ROOT 指向空白测试目录，可用 DSH_COMPANION_PYTHON、DSH_COMPANION_FFMPEG、DSH_COMPANION_FFPROBE 指向本机可执行文件。执行 npm test。

第三方来源及许可证见 [NOTICE.md](NOTICE.md)。

