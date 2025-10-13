import joplin from 'api';
const showdown = require("showdown");
const $ = require('jquery');

// 添加markdown转换为html之后的格式
var style_extension = function () {
    // bootstrap，放弃，email不支持
    var style_html = {
        type: 'output',
        filter: async (html) => {
            const table_style = await joplin.settings.value("table_style");
            const th = await joplin.settings.value("th");
            const tr_even = await joplin.settings.value("tr_even");
            const td = await joplin.settings.value("td");
            const tr_odd = await joplin.settings.value("tr_odd");
            const blockquote = await joplin.settings.value("blockquote");
            const pre = await joplin.settings.value("pre");
            const latex = await joplin.settings.value("latex");
            var liveHtml = $('<html></html>').html(html);
            console.log(liveHtml);
            $("table", liveHtml).each(function () {
                var table = $(this);
                table.attr('style', table_style);
            });
            $("tr:even", liveHtml).each(function () {
                var table = $(this);
                table.attr('style', tr_even);
            });
            $("th", liveHtml).each(function () {
                var table = $(this);
                table.attr('style', th);
            });
            $("tr:odd", liveHtml).each(function () {
                var table = $(this);
                table.attr('style', tr_odd);
            });
            $("td", liveHtml).each(function () {
                var table = $(this);
                table.attr('style', td);
            });
            $("blockquote", liveHtml).each(function () {
                var table = $(this);
                table.attr('style', blockquote);
            });
            $("pre", liveHtml).each(function () {
                var table = $(this);
                table.attr('style', pre);
            });
            $("p", liveHtml).each(function () {
                if ($(this).html().startsWith("$") && $(this).html().endsWith("$")) {
                    var text = $(this).html().replace(/[<br>]/g, "").replace(/\$/g, "");
                    $(this).html("<br><img src='" + latex + text + "' text='" + text + "' />");
                }
            });
            //图片自适应
            $("img", liveHtml).each(function () {
                var table = $(this);
                table.attr('style', "max-width:100%;overflow:hidden;");
            });
            return liveHtml.html();
        },
    };
    return [style_html];
};

// 转换为html
export function convertToHTML(content) {
    const converter = new showdown.Converter({
        extensions: [style_extension]
    });

    // 当一个段落后面跟着一个列表时，会有一种尴尬的效果。这种效果出现在一些情况下，在实时预览编辑器。
    converter.setOption("smoothPreview", true);
    // 换行
    converter.setOption("simpleLineBreaks", true);
    // 标题文本之间的空格不是必需的，但您可以通过启用requireSpaceBeforeHeadingText选项使其成为强制性的。＃
    converter.setOption("requireSpaceBeforeHeadingText", true);
    // 删除线
    converter.setOption("strikethrough", true);
    // 任务列表
    converter.setOption("tasklists", true);
    // 图片大小
    converter.setOption("parseImgDimensions", true);
    // 表格
    converter.setOption("tables", true);
    // 完整html
    converter.setOption("completeHTMLDocument", true);
    // 启动emoji
    converter.setOption("emoji", true);
    // 风格
    converter.setFlavor('github');


    const html = converter.makeHtml(content);

    return html;
}

// 过滤标题
function filterHeadings(content) {
    const regex = /^(#{1,6} )/gm;
    const filteredContent = content.replace(regex, "");
    return filteredContent;
}