import joplin from 'api';
import { joplin_settings } from './settings';
const translations = require("./res/lang/translation.json");
export let currentGlobal;

export async function init() {
    //获取joplin的语言S
    async function getLocale() {
        return await joplin.settings.globalValue("locale");
    }

    currentGlobal = await getLocale();
    console.debug("joplin 现在的语言  ", currentGlobal);

    //如果joplin设置了新的语言，防止出错设置一个默认语言
    if (!currentGlobal) {
        currentGlobal = "zh_CN";
    }

    // 设置语言文本
    function translate(key) {
        return translations[currentGlobal][key] ?? key;
    }

    // 更改语言
    function changeLocale(locale) {
        currentGlobal = locale;
    }

    // 监测语言变化
    async function pollLocale() {
        const handlerOptions = { passive: true };
        console.debug("开始监测joplin语言变化");
        const interval = async () => {
            const newLocale = await getLocale();
            if (newLocale !== currentGlobal) {
                currentGlobal = newLocale;
                changeLocale(currentGlobal);
                window.location.reload();
            }
            setTimeout(interval, 1000);
        };
        interval();
        window.addEventListener('scroll', interval, handlerOptions);
        console.debug("结束监测joplin语言变化");
    }

    // 在插件初始化时开始监听语言变化
    pollLocale();

    await joplin_settings(translate);
}
