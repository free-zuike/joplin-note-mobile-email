import joplin from 'api';
import { joplin_settings } from './settings';
const translations = require("./res/lang/translation.json");
export let currentLocale = 'zh_CN';

export function translate(key: string) {
    return translations[currentLocale]?.[key] ?? key;
}

export async function init() {
    async function getLocale() {
        return await joplin.settings.globalValue("locale");
    }

    currentLocale = (await getLocale()) || "zh_CN";
    console.debug("joplin 现在的语言", currentLocale);

    async function pollLocale() {
        const handlerOptions = { passive: true };
        console.debug("开始监测joplin语言变化");
        const interval = async () => {
            const newLocale = await getLocale();
            if (newLocale !== currentLocale) {
                currentLocale = newLocale || "zh_CN";
                window.location.reload();
            }
            setTimeout(interval, 1000);
        };
        interval();
        window.addEventListener('scroll', interval, handlerOptions);
        console.debug("结束监测joplin语言变化");
    }

    pollLocale();

    await joplin_settings(translate);
}
