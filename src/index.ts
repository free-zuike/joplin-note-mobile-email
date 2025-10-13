import joplin from 'api';
import { init } from './translation';

joplin.plugins.register({
    onStart: async function () {
        console.log("初始化");
        await init();
    },
});
