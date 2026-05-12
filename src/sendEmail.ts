import joplin from 'api';
import { convertToHTML } from './markdownToHtml';
import { currentGlobal } from './translation';

const SMTPJS_URLS = [
    'https://smtpjs.com/v3/smtp.js',
    'https://smtpjs.com/smtp.js',
];

async function ensureSmtpJsLoaded() {
    if ((globalThis as any).Email) {
        return;
    }

    let lastError: any;
    for (const url of SMTPJS_URLS) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                lastError = new Error(`SMTPJS script load failed: ${response.status}`);
                continue;
            }
            const script = await response.text();
            (0, eval)(script);
            if ((globalThis as any).Email) {
                return;
            }
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error('无法加载 SMTPJS 脚本');
}

function htmlOfImageUrl(html: string) {
    const regExp = /<img[^>]+src=['"]([^'"]+)['"]+/g;
    let temp;
    while ((temp = regExp.exec(html)) != null) {
        if (temp[1].startsWith(':/')) {
            let srcId = temp[1].replace(/:\//, 'cid:');
            html = html.replace(temp[1], srcId);
        }
    }
    return html;
}

async function sendWithSmtpJs(options: any) {
    await ensureSmtpJsLoaded();
    const Email = (globalThis as any).Email;
    if (!Email || typeof Email.send !== 'function') {
        throw new Error('SMTPJS Email.send 方法不可用');
    }

    try {
        const result = await Email.send(options);
        console.info('SMTPJS 邮件发送成功:', result);
        return true;
    } catch (error) {
        console.error('SMTPJS 发送邮件出错:', error);
        return false;
    }
}

export async function sendEmail(title: any, content: string) {
    const secureToken = await joplin.settings.value('secureToken');
    const host = await joplin.settings.value('host');
    const port = await joplin.settings.value('port');
    const secure = await joplin.settings.value('secure');
    const user = await joplin.settings.value('user');
    const pass = await joplin.settings.value('pass');
    const to = await joplin.settings.value('to');

    if (!user || !to) {
        console.error('SMTPJS 设置未配置完整，请填写发件人和收件人地址');
        return false;
    }

    const htmlText = await convertToHTML(content);
    const html = htmlOfImageUrl(htmlText);

    const options: any = {
        To: to,
        From: user,
        Subject: title || '',
        Body: html || '',
    };

    if (secureToken) {
        options.SecureToken = secureToken;
    } else {
        if (!host || !pass) {
            console.error('SMTPJS SMTP 模式需要填写 host 和 pass');
            return false;
        }
        options.Host = host;
        options.Username = user;
        options.Password = pass;
        options.Port = port;
        options.SSL = !!secure;
    }

    const success = await sendWithSmtpJs(options);
    if (!success) {
        console.error('发送邮件失败: ', currentGlobal().translation.sendEmailFailed);
    }
    return success;
}
