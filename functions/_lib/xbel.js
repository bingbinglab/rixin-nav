// functions/_lib/xbel.js
// 纯原生轻量 XBEL 栈式解析与最小编辑写回器（零外部依赖，适配 Cloudflare Workers）
// 纪律：
// 1. 严格兼容真实 floccus XBEL 结构：剥离一层 Book-Marks 根包装，散条作为顶层条目保留（folderPath 为空）；
// 2. 实体转义全覆盖（&amp; &lt; &gt; &quot; &apos; &#xx;）；
// 3. 最小编辑写回：绝不全量重新序列化，只对原字符串做切片增删，保持原文本格式、既有 id、注释与 DOCTYPE 原封不动；
// 4. 新条目 id 顺承 highestId 递增，同步更新头部注释。

// 基础 XML 实体转义与反转义
export function decodeXmlEntities(str) {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&"); // &amp; 必须最后反转，避免二次转义
}

export function encodeXmlEntities(str) {
  if (!str || typeof str !== "string") return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// 解析 XML 属性键值对（支持 href="..." 或 id='...'）
function parseAttributes(attrStr) {
  const attrs = {};
  const re = /([a-zA-Z0-9_\-:]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]] = decodeXmlEntities(m[2] !== undefined ? m[2] : m[3]);
  }
  return attrs;
}

/**
 * 轻量栈式解析 XBEL
 * @param {string} xmlText
 * @returns {Object} { highestId, highestIdCommentRange, rootBookMarksFolder, bookmarks, folders, rawXml }
 */
export function parseXbel(xmlText) {
  const text = String(xmlText || "");
  const trimmed = text.trim();
  if (!trimmed.endsWith("</xbel>")) {
    throw new Error("XBEL 文件未以 </xbel> 闭合，可能文件正在写入或已残缺");
  }

  // 1. 探查 highestId 注释位置与既有值（兼容带后缀说明文字，如 <!--- highestId :409: for Floccus... -->）
  let highestId = 0;
  let highestIdCommentRange = null; // { start, end, fullText, id }
  const commentRe = /<!---?\s*highestId\s*:(\d+):([\s\S]*?)-->/g;
  let cm = commentRe.exec(text);
  if (cm) {
    highestId = parseInt(cm[1], 10) || 0;
    highestIdCommentRange = {
      start: cm.index,
      end: cm.index + cm[0].length,
      fullText: cm[0],
      id: highestId,
    };
  }

  // 2. 栈式扫描 XML 标记
  const bookmarks = [];
  const folders = [];
  const folderStack = []; // 元素: { id, title, start, end, contentEnd, titleRanges }
  let rootBookMarksFolder = null; // 记录 Book-Marks 根容器

  let i = 0;
  const len = text.length;

  while (i < len) {
    const tagOpen = text.indexOf("<", i);
    if (tagOpen === -1) break;

    // A. 处理注释 <!-- ... -->
    if (text.startsWith("<!--", tagOpen)) {
      const closeComment = text.indexOf("-->", tagOpen + 4);
      if (closeComment === -1) throw new Error("XML 语法错误：注释未闭合");
      i = closeComment + 3;
      continue;
    }

    // B. 处理 CDATA <![CDATA[ ... ]]>
    if (text.startsWith("<![CDATA[", tagOpen)) {
      const closeCdata = text.indexOf("]]>", tagOpen + 9);
      if (closeCdata === -1) throw new Error("XML 语法错误：CDATA 未闭合");
      i = closeCdata + 3;
      continue;
    }

    // C. 处理 DOCTYPE 或 XML 声明 <?xml ...?> / <!DOCTYPE ...>
    if (text.startsWith("<?", tagOpen) || text.startsWith("<!", tagOpen)) {
      const closeDecl = text.indexOf(">", tagOpen + 2);
      if (closeDecl === -1) throw new Error("XML 语法错误：声明未闭合");
      i = closeDecl + 1;
      continue;
    }

    // D. 寻找标签结尾 >
    const tagClose = text.indexOf(">", tagOpen + 1);
    if (tagClose === -1) throw new Error("XML 语法错误：标签未闭合");

    const tagContent = text.slice(tagOpen + 1, tagClose).trim();
    const isClosing = tagContent.startsWith("/");
    const isSelfClosing = tagContent.endsWith("/");
    const cleanTag = isClosing
      ? tagContent.slice(1).trim()
      : isSelfClosing
      ? tagContent.slice(0, -1).trim()
      : tagContent;

    const spaceIdx = cleanTag.search(/\s/);
    const tagName = (spaceIdx === -1 ? cleanTag : cleanTag.slice(0, spaceIdx)).toLowerCase();
    const attrPart = spaceIdx === -1 ? "" : cleanTag.slice(spaceIdx + 1);

    if (isClosing) {
      // 闭合标签
      if (tagName === "folder") {
        if (!folderStack.length) throw new Error("XML 语法错误：多余的 </folder> 标签");
        const top = folderStack.pop();
        top.contentEnd = tagOpen;
        top.end = tagClose + 1;
      }
      i = tagClose + 1;
      continue;
    }

    if (tagName === "folder") {
      const attrs = parseAttributes(attrPart);
      const fid = attrs.id || "";
      const numId = parseInt(fid, 10);
      if (Number.isFinite(numId) && numId > highestId) highestId = numId;

      const folderObj = {
        id: fid,
        title: "",
        start: tagOpen,
        end: -1,
        contentEnd: -1,
        parent: folderStack.length ? folderStack[folderStack.length - 1] : null,
      };

      folders.push(folderObj);
      if (!isSelfClosing) {
        folderStack.push(folderObj);
      } else {
        folderObj.end = tagClose + 1;
        folderObj.contentEnd = tagOpen;
      }
      i = tagClose + 1;
      continue;
    }

    if (tagName === "title") {
      if (isSelfClosing) {
        i = tagClose + 1;
        continue;
      }
      // 当前如果处于某个 folder 或 bookmark 中，提取标题文本
      const closeTitle = text.indexOf("</title>", tagClose + 1);
      if (closeTitle === -1) throw new Error("XML 语法错误：<title> 未闭合");
      const titleText = decodeXmlEntities(text.slice(tagClose + 1, closeTitle)).trim();

      if (folderStack.length) {
        const curFolder = folderStack[folderStack.length - 1];
        if (!curFolder.title) {
          curFolder.title = titleText;
          // 检测是否为根包装 Book-Marks
          if (folderStack.length === 1 && /^Book-Marks$/i.test(titleText)) {
            rootBookMarksFolder = curFolder;
          }
        }
      }
      i = closeTitle + 8; // 跳过 </title>
      continue;
    }

    if (tagName === "bookmark") {
      const attrs = parseAttributes(attrPart);
      const bid = attrs.id || "";
      const numId = parseInt(bid, 10);
      if (Number.isFinite(numId) && numId > highestId) highestId = numId;
      const href = attrs.href || "";

      let bmStart = tagOpen;
      let bmEnd = -1;
      let bmTitle = "";
      let bmDesc = "";

      if (isSelfClosing) {
        bmEnd = tagClose + 1;
        i = bmEnd;
      } else {
        const closeBookmark = text.indexOf("</bookmark>", tagClose + 1);
        if (closeBookmark === -1) throw new Error("XML 语法错误：<bookmark> 未闭合");
        bmEnd = closeBookmark + 11;
        const innerText = text.slice(tagClose + 1, closeBookmark);

        const tm = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(innerText);
        if (tm) bmTitle = decodeXmlEntities(tm[1]).trim();

        const dm = /<desc\b[^>]*>([\s\S]*?)<\/desc>/i.exec(innerText);
        if (dm) bmDesc = decodeXmlEntities(dm[1]).trim();

        i = bmEnd;
      }

      // 构建 folderPath
      // 特征①：根包装 Book-Marks 剥一层；
      // 特征②：散条 folderPath 为空；
      const fullPath = folderStack.map((f) => f.title);
      let strippedPath = fullPath;
      if (fullPath.length > 0 && /^Book-Marks$/i.test(fullPath[0])) {
        strippedPath = fullPath.slice(1);
      }

      bookmarks.push({
        id: bid,
        name: bmTitle || href,
        url: href,
        desc: bmDesc,
        folderPath: strippedPath,
        start: bmStart,
        end: bmEnd,
      });
      continue;
    }

    // 其他标签推进
    i = tagClose + 1;
  }

  return {
    highestId,
    highestIdCommentRange,
    rootBookMarksFolder,
    bookmarks,
    folders,
    rawXml: text,
    xbelCloseIndex: text.lastIndexOf("</xbel>"),
  };
}

/**
 * 最小编辑写回 XBEL
 * @param {string} rawXml 原文件内容
 * @param {Object} options
 * @param {Array<string>} options.toDeleteUrls 待删除的书签网址列表
 * @param {Array<{name: string, url: string, desc?: string, category: string}>} options.toAddSites 待写回浏览器的站内 manual 书签
 * @returns {string} 编辑后的全新 XBEL 文本
 */
export function editXbel(rawXml, { toDeleteUrls = [], toAddSites = [] } = {}) {
  const parsed = parseXbel(rawXml);
  let highestId = parsed.highestId;
  const deleteUrlSet = new Set(toDeleteUrls.map((u) => String(u || "").trim()).filter(Boolean));

  // 1. 计算待删除书签的文本切片区间
  // 同时附带吞掉前置/后置的缩进换行，避免产生空行空洞
  const deleteRanges = [];
  for (const bm of parsed.bookmarks) {
    if (deleteUrlSet.has(bm.url)) {
      let s = bm.start;
      let e = bm.end;
      // 向前吃掉同一行的缩进空格
      while (s > 0 && (rawXml[s - 1] === " " || rawXml[s - 1] === "\t")) {
        s--;
      }
      // 向后吃掉换行符
      if (rawXml[e] === "\r") e++;
      if (rawXml[e] === "\n") e++;
      deleteRanges.push({ start: s, end: e });
    }
  }

  // 2. 准备待插入的书签（按目标站内分类聚合）
  // 规则：放进 Book-Marks 下与其站内分类同名的文件夹；没有该文件夹就新建一个同名文件夹
  const sitesByCategory = new Map();
  for (const s of toAddSites) {
    const cat = String(s.category || "未分类").trim() || "未分类";
    if (!sitesByCategory.has(cat)) sitesByCategory.set(cat, []);
    sitesByCategory.get(cat).push(s);
  }

  // 寻找 Book-Marks 根文件夹或处理无包装直接铺在顶层的情况
  const rootBm = parsed.rootBookMarksFolder;
  // 若有 Book-Marks：直接子文件夹为 parent === rootBm，新分类插入点为 rootBm.contentEnd
  // 若无包装：直接子文件夹为 parent === null，新分类插入点为 xbelCloseIndex（即 </xbel> 之前）
  const childFolders = parsed.folders.filter((f) => (rootBm ? f.parent === rootBm : f.parent === null));
  const folderByTitle = new Map(childFolders.map((f) => [f.title, f]));
  const fallbackInsertIndex = rootBm ? rootBm.contentEnd : parsed.xbelCloseIndex;

  const insertOperations = []; // { atIndex: number, text: string }

  for (const [catName, list] of sitesByCategory.entries()) {
    let targetFolder = folderByTitle.get(catName);

    if (targetFolder) {
      // 目标分类文件夹已存在，在其 contentEnd 前追加书签
      let xmlChunk = "";
      for (const site of list) {
        highestId++;
        const safeName = encodeXmlEntities(site.name || site.url);
        const safeUrl = encodeXmlEntities(site.url);
        const descTag = site.desc ? `\n      <desc>${encodeXmlEntities(site.desc.slice(0, 40))}</desc>` : "";
        xmlChunk += `    <bookmark href="${safeUrl}" id="${highestId}">\n      <title>${safeName}</title>${descTag}\n    </bookmark>\n`;
      }
      insertOperations.push({ atIndex: targetFolder.contentEnd, text: xmlChunk });
    } else {
      // 目标分类文件夹不存在，新建同名文件夹（挂在 Book-Marks 下或直接挂在 <xbel> 下）
      highestId++;
      const folderId = highestId;
      let folderXml = `  <folder id="${folderId}">\n    <title>${encodeXmlEntities(catName)}</title>\n`;
      for (const site of list) {
        highestId++;
        const safeName = encodeXmlEntities(site.name || site.url);
        const safeUrl = encodeXmlEntities(site.url);
        const descTag = site.desc ? `\n      <desc>${encodeXmlEntities(site.desc.slice(0, 40))}</desc>` : "";
        folderXml += `    <bookmark href="${safeUrl}" id="${highestId}">\n      <title>${safeName}</title>${descTag}\n    </bookmark>\n`;
      }
      folderXml += `  </folder>\n`;
      insertOperations.push({ atIndex: fallbackInsertIndex, text: folderXml });
    }
  }

  // 3. 处理 highestId 注释更新：原地改数，保留后缀说明文字
  if (highestId > parsed.highestId) {
    if (parsed.highestIdCommentRange) {
      const c = parsed.highestIdCommentRange;
      const updatedComment = c.fullText.replace(/:(\d+):/, `:${highestId}:`);
      deleteRanges.push({ start: c.start, end: c.end, replacement: updatedComment });
    } else {
      // 原文件无注释时，插入在 <xbel ...> 后
      const xbelMatch = /<xbel\b[^>]*>/i.exec(rawXml);
      if (xbelMatch) {
        insertOperations.push({
          atIndex: xbelMatch.index + xbelMatch[0].length,
          text: `\n<!--- highestId :${highestId}: --->`,
        });
      }
    }
  }

  // 4. 将所有操作统一按索引降序排列并执行切片替换
  // 操作包括：deleteRanges（可能带 replacement）与 insertOperations（纯插入）
  const allEdits = [
    ...deleteRanges.map((r) => ({
      start: r.start,
      end: r.end,
      text: r.replacement || "",
    })),
    ...insertOperations.map((ins) => ({
      start: ins.atIndex,
      end: ins.atIndex,
      text: ins.text,
    })),
  ];

  // 按起始位置从大到小排序（从后向前替换，确保前方索引不受位移影响）
  allEdits.sort((a, b) => b.start - a.start || b.end - a.end);

  let output = rawXml;
  for (const edit of allEdits) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }

  return output;
}
