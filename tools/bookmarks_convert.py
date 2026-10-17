#!/usr/bin/env python3
"""把浏览器书签文件转成日新辑览 /api/admin/import 的 sites JSON。

支持两种输入（自动识别）：
  1. floccus 的 XBEL（坚果云上那个「书签」文件，.xbel/.xml）
  2. 浏览器导出的 Netscape 书签 HTML（.html/.htm）

文件夹层级 → category / parent_category：只取最深两层
（更深的层级并入第二层）。根层散书签归入「导入书签」。
输出：{"sites":[{name,url,desc,category,parent_category}]}，打印统计到 stderr。
用法：python3 bookmarks_convert.py 输入文件 > sites.json
"""
import json
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

ROOT_CAT = "导入书签"
# 与站点前端导入器 ROOT_NAMES 对齐：这些是浏览器/floccus 的根包装名，不算分类
ROOT_NAMES = {"书签栏", "收藏夹栏", "书签菜单", "其他书签", "其它书签", "移动书签",
              "我的书签", "Bookmarks Bar", "Favorites Bar", "Bookmarks Menu",
              "Other Bookmarks", "Mobile Bookmarks"}


def norm_cat(path):
    """path 为文件夹名列表（从根到叶），返回 (category, parent_category)。"""
    path = [p.strip() for p in path if p and p.strip() and p.strip() not in ROOT_NAMES]
    if not path:
        return ROOT_CAT, ""
    if len(path) == 1:
        return path[0], ""
    return path[-1], path[-2]


def from_xbel(root):
    sites = []

    def walk(elem, path):
        for child in elem:
            tag = child.tag.rsplit("}", 1)[-1]
            if tag == "folder":
                title = ""
                for sub in child:
                    if sub.tag.rsplit("}", 1)[-1] == "title":
                        title = (sub.text or "").strip()
                walk(child, path + [title])
            elif tag == "bookmark":
                url = (child.get("href") or "").strip()
                title = ""
                for sub in child:
                    if sub.tag.rsplit("}", 1)[-1] == "title":
                        title = (sub.text or "").strip()
                if url.startswith(("http://", "https://")):
                    cat, parent = norm_cat(path)
                    sites.append({
                        "name": title or url, "url": url, "desc": "",
                        "category": cat, "parent_category": parent,
                    })

    walk(root, [])
    return sites


class NetscapeParser(HTMLParser):
    """按 DL/DT/H3/A 的嵌套深度还原文件夹层级。"""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []          # 当前文件夹名栈
        self.pending_folder = None
        self.in_h3 = False
        self.in_a = False
        self.a_href = ""
        self.buf = ""
        self.sites = []

    def handle_starttag(self, tag, attrs):
        if tag == "h3":
            self.in_h3, self.buf = True, ""
        elif tag == "a":
            self.in_a, self.buf = True, ""
            self.a_href = dict(attrs).get("href", "")
        elif tag == "dl":
            self.stack.append(self.pending_folder)
            self.pending_folder = None

    def handle_endtag(self, tag):
        if tag == "h3" and self.in_h3:
            self.pending_folder = self.buf.strip()
            self.in_h3 = False
        elif tag == "a" and self.in_a:
            url = self.a_href.strip()
            if url.startswith(("http://", "https://")):
                cat, parent = norm_cat([s for s in self.stack if s])
                self.sites.append({
                    "name": self.buf.strip() or url, "url": url, "desc": "",
                    "category": cat, "parent_category": parent,
                })
            self.in_a = False
        elif tag == "dl":
            if self.stack:
                self.stack.pop()

    def handle_data(self, data):
        if self.in_h3 or self.in_a:
            self.buf += data


def main():
    if len(sys.argv) != 2:
        sys.exit("用法：bookmarks_convert.py <书签文件>")
    raw = open(sys.argv[1], "rb").read()
    text = raw.decode("utf-8", errors="replace")
    if "<xbel" in text[:2000].lower():
        sites = from_xbel(ET.fromstring(re.sub(r"<\!DOCTYPE[^>]*>", "", text)))
        kind = "XBEL"
    else:
        p = NetscapeParser()
        p.feed(text)
        sites, kind = p.sites, "Netscape HTML"
    seen, out = set(), []
    for s in sites:
        if s["url"] in seen:
            continue
        seen.add(s["url"])
        out.append(s)
    cats = sorted({s["category"] for s in out})
    print(f"[convert] {kind}：书签 {len(out)} 条（去重后），分类 {len(cats)} 个：{'、'.join(cats)}", file=sys.stderr)
    json.dump({"sites": out}, sys.stdout, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
