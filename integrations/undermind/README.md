# Undermind 接入

在本目录运行 npm ci --ignore-scripts，使用 Node.js 24。向 Undermind 申请本机可用的客户端 ID，或发布自己的 OAuth 客户端说明。说明文件模板只含示例域名和本机回调。

~~~powershell
node .\bridge.mjs configure --client-id '你的客户端ID'
node .\bridge.mjs auth
node .\bridge.mjs status
~~~

使用公开 HTTPS 客户端说明时，用 configure --metadata-url 'https://你的域名/undermind-dsh-client.json' 替代 configure --client-id。完成登录后，在 DSH 的 MCP 设置添加 stdio 服务器，名称 undermind，命令为本机 node.exe 的完整路径，两个参数依次为本目录 bridge.mjs 的完整路径和 stdio。OAuth 文件存放在 DSH_HOME/companion/undermind/oauth。更新这个插件包不需要复制 OAuth 文件。

