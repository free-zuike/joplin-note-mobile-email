import joplin from 'api';
import { Resend } from 'resend';
import { convertToHTML } from './markdownToHtml';
import { currentGlobal } from './translation';

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

async function sendWithResend(apiKey: string, from: string, to: string, subject: string, html: string) {
    try {
        const resend = new Resend(apiKey);
        const result = await resend.emails.send({
            from: from,
            to: to,
            subject: subject,
            html: html,
        });
        console.info('Resend 邮件发送成功:', result);
        return true;
    } catch (error) {
        console.error('Resend 发送邮件出错:', error);
        return false;
    }
}

export async function sendEmail(title: any, content: string) {
    const resendApiKey = await joplin.settings.value('resendApiKey');
    const from = await joplin.settings.value('user');
    const to = await joplin.settings.value('to');

    if (!resendApiKey || !from || !to) {
        console.error('Resend 设置未配置完整，请填写 API Key、发件人和收件人地址');
        return false;
    }

    const htmlText = await convertToHTML(content);
    const html = htmlOfImageUrl(htmlText);

    const success = await sendWithResend(resendApiKey, from, to, title || '', html);
    if (!success) {
        console.error('发送邮件失败: ', currentGlobal().translation.sendEmailFailed);
    }
    return success;
}
