# Resend 代理服务

这个后端代理用于解决 Joplin Android/WebView 插件直接调用 Resend API 时的 CORS 限制。

## 🚀 推荐方案：Cloudflare Worker（免费 HTTPS）

### 1. 注册 Cloudflare 账户
访问 https://dash.cloudflare.com/ 注册账户。

### 2. 创建 Worker
- 进入 Workers & Pages
- 创建新 Worker
- 复制 `cloudflare-worker.js` 的内容粘贴进去
- 保存并部署

### 3. 获取 Worker URL
部署后会得到类似 `https://your-worker.your-subdomain.workers.dev` 的 URL。

### 4. 在插件设置中填入
```
https://your-worker.your-subdomain.workers.dev/emails
```

## 🏠 本地开发方案

### 使用 ngrok 创建 HTTPS 隧道

1. 下载并安装 ngrok：https://ngrok.com/download

2. 启动本地代理：
```bash
node backend/resend-proxy.js
```

3. 在新终端启动 ngrok：
```bash
ngrok http 3000
```

4. 使用 ngrok 提供的 HTTPS URL：
```
https://abc123.ngrok.io/emails
```

### 直接使用本地代理（仅限 HTTP）

如果你的 Joplin 不是 HTTPS 的，可以直接使用：

```bash
node backend/resend-proxy.js
```

然后在插件设置中使用：
```
http://192.168.x.x:3000/emails
```

## 环境变量设置

### macOS / Linux:
```bash
export RESEND_API_KEY=your_resend_api_key
export PORT=3000
export ALLOWED_ORIGINS=*
```

### Windows PowerShell:
```powershell
$env:RESEND_API_KEY = 'your_resend_api_key'
$env:PORT = '3000'
$env:ALLOWED_ORIGINS = '*'
```

### Windows CMD:
```cmd
set RESEND_API_KEY=your_resend_api_key&& set PORT=3000&& set ALLOWED_ORIGINS=*&& node backend/resend-proxy.js
```

## 插件配置

在 Joplin 插件设置中：
- `Resend API Key`：填写你的 Resend API Key
- `Resend 代理地址`：填写代理的完整 URL（必须是 HTTPS）

## 请求格式

插件会向代理发送 JSON：

```json
{
  "apiKey": "<resend-api-key>",
  "from": "from@example.com",
  "to": "to@example.com",
  "subject": "邮件标题",
  "html": "邮件 HTML 内容"
}
```

代理会将其转发给 Resend API，并返回响应。

## 故障排除

### Mixed Content 错误
- 确保代理 URL 使用 HTTPS
- 从 HTTPS 页面访问 HTTP 代理会被浏览器阻止

### CORS 错误
- 确保 `ALLOWED_ORIGINS` 设置为 `*` 或包含你的 origin
- Cloudflare Worker 默认允许所有 origin

### 连接失败
- 检查代理服务器是否正在运行
- 确认防火墙允许相应端口
- 对于本地代理，确保 Android 设备能访问电脑 IP