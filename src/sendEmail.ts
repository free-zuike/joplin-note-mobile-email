/**
 * Joplin Note Mobile Email Plugin - 邮件发送核心模块
 * 
 * 该模块负责：
 * 1. 获取笔记中的图片资源
 * 2. 将图片转换为 base64 编码
 * 3. 构建邮件内容和附件
 * 4. 通过 Resend API 发送邮件
 * 
 * 特别处理移动端图片资源获取的兼容性问题
 */

import joplin from 'api';
import { convertToHTML } from './markdownToHtml';
import { translate } from './translation';

/**
 * 将 HTML 中的资源路径替换为 cid 引用
 * Joplin 笔记中的图片使用 :/resourceId 格式，需要转换为 cid:resourceId 供邮件内联显示
 * 
 * @param html - 原始 HTML 内容
 * @returns 替换后的 HTML 内容
 */
function htmlOfImageUrl(html: string): string {
    const regExp = /<img[^>]+src=['"]([^'"]+)['"]+/g;
    let temp;
    while ((temp = regExp.exec(html)) != null) {
        if (temp[1].startsWith(':/')) {
            const resourceId = temp[1].replace(':/', '');
            const srcId = `cid:${resourceId}`;
            html = html.replace(temp[1], srcId);
        }
    }
    return html;
}

/**
 * 检查字符串是否为 Data URI 格式
 * 
 * @param value - 待检查的字符串
 * @returns 是否为 Data URI
 */
function isDataUri(value: string): boolean {
    return /^data:[^;]+;base64,/.test(value);
}

/**
 * 规范化资源路径
 * 处理移动端和桌面端路径格式差异
 * 
 * @param path - 原始路径
 * @returns 规范化后的路径
 */
function normalizeResourcePath(path: string): string {
    if (!path) return path;
    if (/^[a-zA-Z]+:\/\//.test(path)) {
        return path.replace(/([^:]\/)\/+/g, '$1');
    }
    const doubleSlashRegex = /\/\//g;
    return path.replace(/\/app\/\//g, '/app/').replace(doubleSlashRegex, '/');
}

/**
 * 通过 API 直接获取资源文件（备用方法）
 * 
 * @param resourceId - 资源 ID
 * @returns Base64 编码的文件内容
 */
async function fetchResourceFileFromApi(resourceId: string): Promise<string> {
    try {
        const response = await fetch(`/resources/${resourceId}/file`);
        if (response.ok) {
            const buffer = await response.arrayBuffer();
            return bytesToBase64(new Uint8Array(buffer));
        }
    } catch (err) {}
    return '';
}

/**
 * 通过 Imaging API 获取资源文件（桌面端专用）
 * 注意：该 API 在移动端不支持
 * 
 * @param resourceId - 资源 ID
 * @returns Base64 编码的文件内容
 */
async function fetchResourceFileWithImaging(resourceId: string): Promise<string> {
    if (!joplin.imaging || typeof joplin.imaging.createFromResource !== 'function') {
        return '';
    }

    try {
        const handle = await joplin.imaging.createFromResource(resourceId);
        const data = await joplin.imaging.resize(handle);
        await joplin.imaging.free(handle);

        if (!data) {
            return '';
        }

        if (typeof data === 'string' && data.startsWith('data:')) {
            const parts = data.split(',');
            return parts[1] || '';
        }

        if (typeof data === 'string') {
            return data;
        }

        return '';
    } catch (err) {
        return '';
    }
}

/**
 * 将 Uint8Array 转换为 Base64 编码字符串
 * 采用分块处理避免大文件内存溢出
 * 
 * @param bytes - 二进制数据
 * @returns Base64 编码字符串
 */
function bytesToBase64(bytes: Uint8Array): string {
    const chunkSize = 0x8000; // 32KB 分块
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

async function toBase64(resourceFile: any): Promise<string> {
    if (resourceFile === null || resourceFile === undefined) return '';

    if (typeof resourceFile === 'string') {
        if (isDataUri(resourceFile)) {
            return resourceFile.split(',')[1];
        }
        const normalizedPath = normalizeResourcePath(resourceFile);
        if (/^(https?:|file:|\/|[a-zA-Z]:\\|\\\\)/.test(normalizedPath)) {
            try {
                const response = await fetch(normalizedPath);
                if (response.ok) {
                    const buffer = await response.arrayBuffer();
                    return bytesToBase64(new Uint8Array(buffer));
                }
            } catch (err) {}
            return '';
        }
        return btoa(resourceFile);
    }

    if (typeof resourceFile === 'object') {
        if (typeof resourceFile.arrayBuffer === 'function') {
            try {
                const buffer = await resourceFile.arrayBuffer();
                return bytesToBase64(new Uint8Array(buffer));
            } catch (e) {}
        }

        if (typeof Response !== 'undefined' && resourceFile && (typeof resourceFile.stream === 'function' || typeof resourceFile.arrayBuffer === 'function' || typeof resourceFile.slice === 'function' || resourceFile instanceof Blob)) {
            try {
                const buffer = await new Response(resourceFile).arrayBuffer();
                return bytesToBase64(new Uint8Array(buffer));
            } catch (err) {}
        }

        if (typeof resourceFile === 'object' && resourceFile !== null && typeof (resourceFile as any).toString === 'function') {
            try {
                const result = (resourceFile as any).toString('base64');
                if (typeof result === 'string' && /^[A-Za-z0-9+/=]+$/.test(result)) {
                    return result;
                }
            } catch (e) {}
        }

        if (resourceFile instanceof ArrayBuffer) {
            return bytesToBase64(new Uint8Array(resourceFile));
        }

        if (ArrayBuffer.isView(resourceFile)) {
            const view = resourceFile as ArrayBufferView;
            return bytesToBase64(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
        }

        if (resourceFile && typeof resourceFile.path === 'string') {
            const normalizedPath = normalizeResourcePath(resourceFile.path);
            try {
                const response = await fetch(normalizedPath);
                if (response.ok) {
                    const buffer = await response.arrayBuffer();
                    return bytesToBase64(new Uint8Array(buffer));
                }
            } catch (err) {}
        }

        if (resourceFile && typeof resourceFile.uri === 'string') {
            const normalizedUri = normalizeResourcePath(resourceFile.uri);
            try {
                const response = await fetch(normalizedUri);
                if (response.ok) {
                    const buffer = await response.arrayBuffer();
                    return bytesToBase64(new Uint8Array(buffer));
                }
            } catch (err) {}
        }

        if ('data' in resourceFile) {
            const data = resourceFile.data;
            if (typeof data === 'string') {
                if (isDataUri(data)) {
                    return data.split(',')[1];
                }                const normalizedDataPath = normalizeResourcePath(data);
                if (/^(https?:|file:|\/|[a-zA-Z]:\\|\\\\)/.test(normalizedDataPath)) {
                    try {
                        const response = await fetch(normalizedDataPath);
                        if (response.ok) {
                            const buffer = await response.arrayBuffer();
                            return bytesToBase64(new Uint8Array(buffer));
                        }
                    } catch (err) {}
                    return '';
                }                if (/^[A-Za-z0-9+/=]+$/.test(data)) {
                    return data;
                }
                return btoa(data);
            } else if (data instanceof ArrayBuffer) {
                return bytesToBase64(new Uint8Array(data));
            } else if (ArrayBuffer.isView(data)) {
                const view = data as ArrayBufferView;
                return bytesToBase64(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
            } else if (typeof data[Symbol.iterator] === 'function') {
                return bytesToBase64(new Uint8Array(Array.from(data as Iterable<number>)));
            }
        }

        if (resourceFile && typeof resourceFile.buffer === 'object' && resourceFile.buffer instanceof ArrayBuffer) {
            return bytesToBase64(new Uint8Array(resourceFile.buffer));
        }

        if (typeof resourceFile[Symbol.iterator] === 'function') {
            return bytesToBase64(new Uint8Array(Array.from(resourceFile as Iterable<number>)));
        }
    }

    return '';
}

async function getResourceContentBase64(resourceId: string): Promise<string> {
    // 方法1: 尝试 joplin.data.get 获取资源文件（移动端主要方式）
    // 返回的对象包含: type, body, contentType, attachmentFilename
    try {
        const resourceFile = await joplin.data.get(['resources', resourceId, 'file']);
        if (resourceFile) {
            console.info('资源文件类型: ' + typeof resourceFile + ', keys: ' + (resourceFile ? Object.keys(resourceFile).join(', ') : 'null'));
            
            // 检查 body 属性（移动端返回的图片数据在 body 中）
            if (resourceFile.body) {
                const bodyKeys = Object.keys(resourceFile.body);
                
                if (resourceFile.body instanceof ArrayBuffer) {
                    return bytesToBase64(new Uint8Array(resourceFile.body));
                } else if (typeof resourceFile.body === 'string') {
                    // 检查是否是 data URI
                    if (isDataUri(resourceFile.body)) {
                        return resourceFile.body.split(',')[1] || '';
                    }
                    // 如果已经是 base64 字符串（只包含 base64 字符）
                    if (/^[A-Za-z0-9+/=]+$/.test(resourceFile.body)) {
                        return resourceFile.body;
                    }
                } else if (resourceFile.body instanceof Blob || typeof resourceFile.body.arrayBuffer === 'function') {
                    const buffer = await resourceFile.body.arrayBuffer();
                    return bytesToBase64(new Uint8Array(buffer));
                } else if (resourceFile.body instanceof Uint8Array) {
                    return bytesToBase64(resourceFile.body);
                } else if (resourceFile.body.data) {
                    if (resourceFile.body.data instanceof ArrayBuffer) {
                        return bytesToBase64(new Uint8Array(resourceFile.body.data));
                    } else if (typeof resourceFile.body.data === 'string') {
                        return isDataUri(resourceFile.body.data) ? resourceFile.body.data.split(',')[1] || '' : resourceFile.body.data;
                    }
                } else if (resourceFile.body.buffer) {
                    if (resourceFile.body.buffer instanceof ArrayBuffer) {
                        return bytesToBase64(new Uint8Array(resourceFile.body.buffer));
                    }
                } else if (typeof resourceFile.body === 'object' && bodyKeys.length > 0 && /^\d+$/.test(bodyKeys[0])) {
                    // 移动端返回的 body 是类数组对象（序列化的 Uint8Array）
                    // 通过检查第一个 key 是否是数字来判断
                    
                    // 过滤出纯数字的 key 并找到最大索引（避免栈溢出）
                    let maxIndex = -1;
                    for (const key of bodyKeys) {
                        if (/^\d+$/.test(key)) {
                            const numKey = parseInt(key, 10);
                            if (numKey > maxIndex) {
                                maxIndex = numKey;
                            }
                        }
                    }
                    
                    if (maxIndex >= 0) {
                        const uint8Array = new Uint8Array(maxIndex + 1);
                        for (let i = 0; i <= maxIndex; i++) {
                            uint8Array[i] = resourceFile.body[i];
                        }
                        return bytesToBase64(uint8Array);
                    }
                }
            }
            
            // 检查 data 属性（其他情况下可能在 data 中）
            if (resourceFile.data) {
                console.info('找到 data 属性，类型: ' + typeof resourceFile.data);
                if (resourceFile.data instanceof ArrayBuffer) {
                    return bytesToBase64(new Uint8Array(resourceFile.data));
                } else if (typeof resourceFile.data === 'string') {
                    return isDataUri(resourceFile.data) ? resourceFile.data.split(',')[1] || '' : resourceFile.data;
                }
            }
            
            // 检查是否是 Blob
            if (resourceFile instanceof Blob || typeof resourceFile.arrayBuffer === 'function') {
                console.info('资源文件是 Blob 或有 arrayBuffer 方法');
                const buffer = await resourceFile.arrayBuffer();
                return bytesToBase64(new Uint8Array(buffer));
            }
        }
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.info('joplin.data.get 错误: ' + errorMessage);
        // 如果 joplin.data.get 失败，直接返回空，不继续尝试其他方法
        return '';
    }

    // 方法2: 尝试通过 resourcePath + fetch（桌面端主要方式）
    try {
        const resourcePath = await joplin.data.resourcePath(resourceId);
        if (resourcePath) {
            console.info('resourcePath: ' + resourcePath);
            const normalizedPath = normalizeResourcePath(resourcePath);
            const response = await fetch(normalizedPath);
            if (response.ok) {
                const buffer = await response.arrayBuffer();
                return bytesToBase64(new Uint8Array(buffer));
            }
        }
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.info('resourcePath + fetch 错误: ' + errorMessage);
    }

    // 方法3: 尝试 imaging API（桌面端辅助方式）- 移动端不支持，跳过
    // 由于移动端不支持 imaging API，这里不再尝试
    // if (joplin.imaging?.createFromResource) {
    //     try {
    //         const handle = await joplin.imaging.createFromResource(resourceId);
    //         const data = await joplin.imaging.resize(handle);
    //         await joplin.imaging.free(handle);
    //         if (typeof data === 'string' && data.startsWith('data:')) {
    //             return data.split(',')[1] || '';
    //         }
    //     } catch (e) {
    //         console.info('imaging API 错误: ' + (e?.message || String(e)));
    //     }
    // }

    return '';
}

async function getImageAttachments(html: string): Promise<{ attachments: any[], failedResources: string[] }> {
    const attachments: any[] = [];
    const failedResources: string[] = [];
    const regExp = /<img[^>]+src=['"]([^'"]+)['"]+/g;
    let temp;
    const processedResources = new Set<string>();

    while ((temp = regExp.exec(html)) != null) {
        const src = temp[1];
        if (src.startsWith(':/')) {
            const resourceId = src.replace(':/', '');
            if (processedResources.has(resourceId)) continue;
            processedResources.add(resourceId);

            try {
                const resource = await joplin.data.get(['resources', resourceId], {
                    fields: ['id', 'title', 'mime', 'size', 'filename']
                });

                if (resource) {
                    const base64Data = await getResourceContentBase64(resourceId);
                    
                    if (base64Data && base64Data.length > 0) {
                        const filename = resource.filename || resource.title || 'image_' + resourceId;
                        attachments.push({
                            filename: filename,
                            content: base64Data,
                            type: resource.mime || 'image/png',
                            contentType: resource.mime || 'image/png',
                            disposition: 'inline',
                            contentId: resourceId,
                            content_id: resourceId,
                            cid: resourceId
                        });
                    } else {
                        failedResources.push(resourceId);
                    }
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.info('处理资源 ' + resourceId + ' 时出错: ' + errorMessage);
                failedResources.push(resourceId);
            }
        }
    }

    return { attachments, failedResources };
}

async function sendWithResend(
    apiKey: string,
    proxyUrl: string | null,
    from: string,
    to: string,
    subject: string,
    html: string,
    attachments?: any[]
): Promise<boolean> {
    const url = proxyUrl || 'https://api.resend.com/emails';
    const useProxy = Boolean(proxyUrl);

    try {
        const requestBody = useProxy ? {
            apiKey,
            from,
            to,
            subject,
            html,
            attachments,
        } : {
            from,
            to,
            subject,
            html,
            attachments,
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(useProxy ? {} : { Authorization: `Bearer ${apiKey}` }),
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            return false;
        }

        await response.json();
        return true;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.info('邮件发送异常: ' + errorMessage);
        return false;
    }
}

export async function sendEmail(title: any, content: string): Promise<boolean> {
    const resendApiKey = await joplin.settings.value('resendApiKey');
    const resendProxyUrl = (await joplin.settings.value('resendProxyUrl'))?.trim();
    const from = (await joplin.settings.value('user'))?.trim();
    const to = (await joplin.settings.value('to'))?.trim();

    // 检查配置是否完整
    if (!resendApiKey || !from || !to) {
        await joplin.views.dialogs.showMessageBox('\u8BF7\u5148\u914D\u7F6E Resend API Key\u3001\u53D1\u9001\u8005\u90AE\u7BB1\u548C\u63A5\u6536\u8005\u90AE\u7BB1');
        return false;
        return false;
    }

    const versionInfo = await joplin.versionInfo();
    const isDesktop = versionInfo.platform === 'desktop';

    let htmlText = await convertToHTML(content);
    
    const { attachments, failedResources } = await getImageAttachments(htmlText);
    
    // 如果有失败的图片资源，不发送邮件
    if (failedResources.length > 0) {
        await joplin.views.dialogs.showMessageBox('\u56FE\u7247\u8D44\u6E90\u83B7\u53D6\u5931\u8D25\uff0C\u5DF2\u5931\u8D25: ' + failedResources.length + ' \u4E2A');
        return false;
        return false;
    }
    
    // 处理图片链接：替换为 cid 引用
    if (!isDesktop) {
        htmlText = htmlText.replace(/<img[^>]+src=['"]:\/([^'"]+)['"][^>]*>/g, (match: string, resourceId: string) => {
            return `<img src="cid:${resourceId}" style="max-width:100%;overflow:hidden;" />`;
        });
    }
    
    const html = htmlOfImageUrl(htmlText);

    const success = await sendWithResend(resendApiKey, resendProxyUrl || null, from, to, title || '', html, attachments);
    
    // 显示发送结果提示
    if (success) {
        await joplin.views.dialogs.showMessageBox('\u90AE\u4EF6\u5DF2\u6210\u529F\u53D1\u9001\uFF01');
    } else {
        await joplin.views.dialogs.showMessageBox('\u90AE\u4EF6\u53D1\u9001\u5931\u8D25\uff0C\u8BF7\u68C0\u67E5\u914D\u7F6E\u548C\u7F51\u7EDC\u8FDE\u63A5');
    }
    
    return success;
}