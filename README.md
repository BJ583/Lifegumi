# Lifegumi Public

用于整理游戏、动画、影视和阅读记录的 Windows 桌面应用。可以记录状态、评分和备注，按分类筛选收藏，也可以通过统计和时间线回顾记录。

## 下载和使用

在 [Releases](https://github.com/BJ583/Lifegumi/releases) 的 **Assets** 中下载 Windows x64 便携包，完整解压后双击 `Lifegumi Public.exe`。移动程序时请保留整个解压目录。

首次启动会创建空库，数据保存在本地的 `data-public/` 目录。备份收藏时请一起备份这个目录。

## 功能

- 按游戏、动画、影视和书籍分类整理收藏，支持搜索、筛选和排序。
- 记录评分、通关状态和观看进度，通过统计、追更页和发售时间线回顾收藏。
- 支持 Bangumi 链接导入；账号同步需要自行配置 Access Token。豆瓣条目可手动录入并保存资料链接。
- 使用轻记事本整理随手记录。

## 从源码运行

```sh
pnpm install --frozen-lockfile
pnpm dev
```

运行 `pnpm run dist` 可构建 Windows 便携版，产物位于 `release/win-unpacked/`。
