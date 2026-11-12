# Lifegumi Public

本地动画、影视、阅读和游戏收藏工具。支持 Bangumi 导入与同步、统计、追更、时光机和轻记事本。首次运行使用空数据库，数据存放在独立的 `data-public/`。

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm dist
```

`pnpm dist` 生成 Windows 便携目录。请勿将本地数据目录或 Token 提交到 GitHub。

## 打开 Windows 便携版

双击 `release/win-unpacked/Lifegumi Public.exe`。移动或分享时请保留整个 `win-unpacked` 目录，不能只复制 exe。此目录在 Git 中被忽略，可单独作为 GitHub Release 分发；请勿附带运行后创建的 `data-public/`。

程序的 L 字母图标由简单几何图形绘制，没有使用字体、第三方图片或品牌素材。

豆瓣条目可手动录入，并在资料链接中保存原网址。公开版不会自动读取豆瓣页面或下载其封面。
