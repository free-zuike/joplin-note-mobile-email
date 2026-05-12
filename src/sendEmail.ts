import joplin from 'api';
const emailjs: any = require('emailjs-com');
import { convertToHTML } from './markdownToHtml';
import { currentGlobal } from './translation';

// 将html中的src地址设置为EmailJS支持的格式
function htmlOfImageUrl(html: string) {
    const regExp = /<img[^>]+src=['"]([^'"]+)['"]+/g;
    let temp;
    while ((temp = regExp.exec(html)) != null) {
        if (temp[1].startsWith(":/")) {
            let srcId = temp[1].replace(/:\//, "cid:");
            html = html.replace(temp[1], srcId);
        }
    }
    return html;
}

async function sendWithEmailJS(serviceId: string, templateId: string, publicKey: string, templateParams: any) {
    try {
        const result = await emailjs.send(serviceId, templateId, templateParams, publicKey);
        console.info('EmailJS 邮件发送成功:', result);
        return true;
    } catch (error) {
        console.error('EmailJS 发送邮件出错:', error);
        return false;
    }
}

export async function sendEmail(title: any, content: string) {
    const serviceId = await joplin.settings.value('emailjsServiceId');
    const templateId = await joplin.settings.value('emailjsTemplateId');
    const publicKey = await joplin.settings.value('emailjsPublicKey');
    const from = await joplin.settings.value('user');
    const to = await joplin.settings.value('to');

    if (!serviceId || !templateId || !publicKey) {
        console.error('EmailJS 设置未配置完整，请填写 serviceId、templateId 和 publicKey');
        return false;
    }

    const htmlText = await convertToHTML(content);
    const html = htmlOfImageUrl(htmlText);

    const templateParams = {
        from_name: from || '',
        to_email: to || '',
        subject: title || '',
        message_html: html || '',
    };

    const success = await sendWithEmailJS(serviceId, templateId, publicKey, templateParams);
    if (!success) {
        console.error('发送邮件失败: ', currentGlobal().translation.sendEmailFailed);
    }
    return success;
}
