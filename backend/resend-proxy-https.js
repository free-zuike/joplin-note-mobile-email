#!/usr/bin/env node
const http = require('http');
const https = require('https');
const url = require('url');

const PORT = parseInt(process.env.PORT || '3000', 10);
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

if (!RESEND_API_KEY) {
    console.error('ERROR: Please set the RESEND_API_KEY environment variable.');
    process.exit(1);
}

function sendJson(res, statusCode, data) {
    const body = JSON.stringify(data);
    const origin = res.req?.headers?.origin || '';
    const allowedOrigin = getAllowedOrigin(origin);
    const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
    };
    if (allowedOrigin) {
        headers['Access-Control-Allow-Origin'] = allowedOrigin;
        headers['Access-Control-Allow-Credentials'] = 'true';
    }
    res.writeHead(statusCode, headers);
    res.end(body);
}

function getAllowedOrigin(origin) {
    if (!origin || origin === 'null') {
        return ALLOWED_ORIGINS.includes('*') ? '*' : null;
    }
    if (ALLOWED_ORIGINS.includes('*')) {
        return '*';
    }
    return ALLOWED_ORIGINS.includes(origin) ? origin : null;
}

function proxyToResend(payload, apiKey, callback) {
    const body = JSON.stringify(payload);
    const requestOptions = {
        hostname: 'api.resend.com',
        path: '/emails',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            Authorization: `Bearer ${apiKey}`,
        },
    };

    const proxyReq = https.request(requestOptions, (proxyRes) => {
        const chunks = [];
        proxyRes.on('data', (chunk) => chunks.push(chunk));
        proxyRes.on('end', () => {
            const responseBody = Buffer.concat(chunks).toString('utf8');
            callback(null, proxyRes.statusCode || 500, responseBody);
        });
    });

    proxyReq.on('error', (err) => callback(err));
    proxyReq.write(body);
    proxyReq.end();
}

const server = http.createServer((req, res) => {
    const origin = req.headers.origin || '';
    const allowedOrigin = getAllowedOrigin(origin);
    if (allowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    const parsedUrl = url.parse(req.url || '');
    if (parsedUrl.pathname !== '/emails' || req.method !== 'POST') {
        return sendJson(res, 404, { error: 'Not found. Use POST /emails.' });
    }

    let rawBody = '';
    req.on('data', (chunk) => {
        rawBody += chunk;
        if (rawBody.length > 10 * 1024 * 1024) {
            res.writeHead(413);
            res.end('Payload too large');
            req.socket.destroy();
        }
    });

    req.on('end', () => {
        let payload;
        try {
            payload = JSON.parse(rawBody);
        } catch (error) {
            return sendJson(res, 400, { error: 'Invalid JSON payload.' });
        }

        const apiKey = payload.apiKey || RESEND_API_KEY;
        const emailPayload = {
            from: payload.from,
            to: payload.to,
            subject: payload.subject,
            html: payload.html,
        };

        if (!emailPayload.from || !emailPayload.to || !emailPayload.subject || !emailPayload.html) {
            return sendJson(res, 400, { error: 'Missing required fields: from, to, subject, html.' });
        }

        proxyToResend(emailPayload, apiKey, (err, statusCode, body) => {
            if (err) {
                console.error('Resend 代理请求失败:', err);
                return sendJson(res, 502, { error: 'Failed to send request to Resend.', details: err.message });
            }
            try {
                const parsed = JSON.parse(body);
                sendJson(res, statusCode, parsed);
            } catch (parseError) {
                sendJson(res, statusCode, { raw: body });
            }
        });
    });
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`端口 ${PORT} 已被占用，请使用其他端口或者停止当前占用该端口的服务。`);
    } else {
        console.error('代理服务器发生错误：', err);
    }
    process.exit(1);
});

server.listen(PORT, () => {
    console.log(`Resend 代理已启动，监听 http://0.0.0.0:${PORT}/emails`);
    console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
    console.log(`注意：此代理使用 HTTP，如果从 HTTPS 页面访问会触发 Mixed Content 警告。`);
    console.log(`建议使用 ngrok 或类似工具创建 HTTPS 隧道：ngrok http ${PORT}`);
});