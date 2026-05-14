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
    console.info('========== 开始获取资源: ' + resourceId + ' ==========');
    
    const versionInfo = await joplin.versionInfo();
    const platform = versionInfo.platform;
    const isMobile = platform !== 'desktop';
    console.info('平台检测: ' + platform + ', isMobile: ' + isMobile);
    
    let result = '';
    
    // 方法1: 尝试 joplin.data.get 获取资源文件（移动端主要方式）
    console.info('--- 方法1: joplin.data.get ---');
    try {
        const resourceFile = await joplin.data.get(['resources', resourceId, 'file'], {
            fields: ['body', 'data', 'content', 'type', 'contentType', 'attachmentFilename']
        });
        console.info('joplin.data.get 返回类型: ' + typeof resourceFile);
        
        if (resourceFile) {
            // 打印所有属性帮助调试
            const resourceKeys = Object.keys(resourceFile);
            console.info('返回对象包含属性: ' + JSON.stringify(resourceKeys));
            
            for (const key of resourceKeys) {
                const val = resourceFile[key];
                const valType = typeof val;
                console.info(`  属性 ${key}: 类型=${valType}, 值=${val === null ? 'null' : (valType === 'object' ? `[Object, keys=${Object.keys(val).slice(0, 10).join(',')}...]` : String(val).substring(0, 50))}`);
            }
            
            // 移动端特殊处理：检查是否是类数组对象（序列化的 Uint8Array）
            if (isMobile) {
                console.info('--- 移动端特殊处理 ---');
                
                // 检查 body 属性
                if (resourceFile.body) {
                    console.info('检查 body 属性');
                    const bodyResult = await tryMobileArrayLikeObject(resourceFile.body);
                    if (bodyResult) {
                        console.info('通过 body 属性成功获取数据');
                        return bodyResult;
                    }
                }
                
                // 检查 data 属性
                if (resourceFile.data) {
                    console.info('检查 data 属性');
                    const dataResult = await tryMobileArrayLikeObject(resourceFile.data);
                    if (dataResult) {
                        console.info('通过 data 属性成功获取数据');
                        return dataResult;
                    }
                }
                
                // 直接检查 resourceFile 是否是类数组对象
                const directResult = await tryMobileArrayLikeObject(resourceFile);
                if (directResult) {
                    console.info('直接处理 resourceFile 成功');
                    return directResult;
                }
            }
            
            // 尝试处理整个对象
            result = await toBase64(resourceFile);
            if (result && result.length > 0) {
                console.info('方法1 (toBase64) 成功');
                return result;
            }
            
            // 逐个尝试属性
            for (const prop of resourceKeys) {
                if (resourceFile[prop] !== undefined && resourceFile[prop] !== null) {
                    console.info('尝试处理属性: ' + prop);
                    const propResult = await toBase64(resourceFile[prop]);
                    if (propResult && propResult.length > 0) {
                        console.info('通过属性 ' + prop + ' 成功获取');
                        return propResult;
                    }
                }
            }
            
            // 尝试特殊属性
            const specialProps = ['body', 'data', 'content', 'buffer'];
            for (const prop of specialProps) {
                if (resourceFile[prop]) {
                    console.info('尝试特殊属性: ' + prop);
                    const propResult = await toBase64(resourceFile[prop]);
                    if (propResult && propResult.length > 0) {
                        return propResult;
                    }
                }
            }
        } else {
            console.info('joplin.data.get 返回 null/undefined');
        }
    } catch (e) {
        console.info('方法1失败: ' + (e instanceof Error ? e.message : String(e)));
        console.info('错误堆栈: ' + (e instanceof Error ? e.stack : ''));
    }
    
    // 方法2: fetchResourceFileFromApi
    console.info('--- 方法2: fetchResourceFileFromApi ---');
    result = await fetchResourceFileFromApi(resourceId);
    if (result && result.length > 0) {
        console.info('方法2成功');
        return result;
    }
    
    // 方法3: 如果是桌面端，尝试 resourcePath + fetch
    if (!isMobile) {
        console.info('--- 方法3: resourcePath + fetch ---');
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
            console.info('方法3失败: ' + (e instanceof Error ? e.message : String(e)));
        }
        
        // 方法4: imaging API
        console.info('--- 方法4: imaging API ---');
        result = await fetchResourceFileWithImaging(resourceId);
        if (result && result.length > 0) {
            console.info('方法4成功');
            return result;
        }
    } else {
        console.info('移动端跳过桌面端专用方法');
    }
    
    console.info('========== 所有获取方法均失败 ==========');
    return '';
}

/**
 * 尝试处理移动端返回的类数组对象（序列化的 Uint8Array）
 * 在移动端，API 返回的图片数据可能是一个对象，键是数字索引，值是字节值
 * 
 * @param obj - 待处理的对象
 * @returns Base64 编码的文件内容
 */
async function tryMobileArrayLikeObject(obj: any): Promise<string> {
    if (!obj || typeof obj !== 'object') {
        return '';
    }
    
    const keys = Object.keys(obj);
    if (keys.length === 0) {
        return '';
    }
    
    // 检查是否是类数组对象（第一个键是否是数字）
    const firstKey = keys[0];
    if (!/^\d+$/.test(firstKey)) {
        return '';
    }
    
    console.info(`检测到类数组对象，键数: ${keys.length}`);
    
    // 找到最大索引
    let maxIndex = -1;
    for (const key of keys) {
        if (/^\d+$/.test(key)) {
            const numKey = parseInt(key, 10);
            if (numKey > maxIndex) {
                maxIndex = numKey;
            }
        }
    }
    
    if (maxIndex < 0) {
        return '';
    }
    
    // 检查是否有 length 属性（某些序列化的 TypedArray 会有）
    const hasLength = typeof obj.length === 'number';
    const actualLength = hasLength ? obj.length : maxIndex + 1;
    
    console.info(`构造 Uint8Array，长度: ${actualLength}`);
    
    try {
        const uint8Array = new Uint8Array(actualLength);
        
        // 如果有 length 属性，按索引遍历
        if (hasLength) {
            for (let i = 0; i < obj.length; i++) {
                uint8Array[i] = obj[i];
            }
        } else {
            // 否则遍历所有键
            for (const key of keys) {
                if (/^\d+$/.test(key)) {
                    const index = parseInt(key, 10);
                    if (index < actualLength) {
                        uint8Array[index] = obj[key];
                    }
                }
            }
        }
        
        const base64Result = bytesToBase64(uint8Array);
        console.info(`成功转换为 Base64，长度: ${base64Result.length}`);
        return base64Result;
    } catch (e) {
        console.info(`类数组对象处理失败: ${e instanceof Error ? e.message : String(e)}`);
        return '';
    }
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
    }

    const versionInfo = await joplin.versionInfo();
    const isDesktop = versionInfo.platform === 'desktop';
    const platform = versionInfo.platform;

    let htmlText = await convertToHTML(content);
    
    const { attachments, failedResources } = await getImageAttachments(htmlText);
    
    // 如果有失败的图片资源，不发送邮件
    if (failedResources.length > 0) {
        console.info('========== 图片资源获取失败 ==========');
        console.info('平台: ' + platform);
        console.info('失败的资源数量: ' + failedResources.length);
        console.info('失败的资源ID: ' + JSON.stringify(failedResources));
        console.info('成功附件数量: ' + attachments.length);
        
        const errorMsg = `图片资源获取失败 (${failedResources.length}个)\n\n请查看控制台日志了解详情\n\n查看方法：\n1. 打开 Joplin 设置\n2. 找到“开发人员工具”或“日志”\n3. 查找包含“开始获取资源”和失败的日志\n\n资源ID: ${failedResources.slice(0, 5).join(', ')}${failedResources.length > 5 ? '...' : ''}`;
        
        await joplin.views.dialogs.showMessageBox(errorMsg);
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
        await joplin.views.dialogs.showMessageBox('\u90AE\u4EF6\u53D1\u9001\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u914D\u7F6E\u548C\u7F51\u7EDC\u8FDE\u63A5');
    }
    
    return success;
}