import joplin from 'api';
//smtp.js文件末尾手动添加
// if (typeof module !== 'undefined') {
//   module.exports = {
//     Email
//   };
// }
const { Email } = require ("./res/lang/smtp");
const translations = require("./res/lang/translation.json");
import { convertToHTML } from './markdownToHtml';
import { currentGlobal } from './translation';

// 将html中的src地址设置为smtpjs支持发松的格式
function htmlOfImageUrl(html) {
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

// 获取html中的src地址，存为数组
async function htmlOfImage(html) {
    const regExp = /<img[^>]+src=['"]([^'"]+)['"]+/g;
    const result = [];
    let temp;
    while ((temp = regExp.exec(html)) != null) {
        if (temp[1].startsWith(":/")) {
            let srcId = temp[1].replace(/:\//, "");
            let title;
            await joplin.data.get(['resources', srcId], {
                fields: "id, title, updated_time",
                order_by: "updated_time",
                order_dir: "DESC"
            }).then(function (obj) {
                title = obj.title;
            });
            await joplin.data.resourcePath(srcId).then(function (scr_url) {
                result.push({ 'name': title, 'path': scr_url, 'cid': srcId });
            });
        }
    }
    return result;
}

//通过smtpjs发送消息
async function smtpjsSend(secureToken, host, port, secure, user, pass, from, to, subject, html, imgSrc) {
    Email.send({
        Host : host,
        Port : port,
        Secure : secure,
        Username : user,
        Password : pass,
        To : to,
        From : from,
        Subject : subject,
        Body : html,
        Attachments : imgSrc
    }).then(
        message => alert(message)
    );
    // Email.send({
    //     SecureToken : secureToken,
    //     To : to,
    //     From : from,
    //     Subject : subject,
    //     Body : html,
    //     Attachments : imgSrc
    // }).then(
    //     message => alert(message)
    // );
}

// 发送邮件
export async function sendEmail(title, content) {
    const secureToken = await joplin.settings.value("secureToken");
    const host = await joplin.settings.value("host");
    const port = await joplin.settings.value("port");
    const secure = await joplin.settings.value("secure");
    const user = await joplin.settings.value("user");
    const pass = await joplin.settings.value("pass");
    const to = await joplin.settings.value("to");

    convertToHTML(content).then(function (htmlText) {
        // 获取图像地址
        const attachments = htmlOfImage(htmlText);
        console.info(attachments);
        // 适合smtpjs的图像地址
        const html = htmlOfImageUrl(htmlText);
        // 发送消息
        console.info(Email);
        smtpjsSend(secureToken, host, port, secure, user, pass, user, to, title, html, attachments);
    });
}
