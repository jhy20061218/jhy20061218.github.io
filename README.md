# 我的个人网站

纯静态网站（HTML + CSS + JS），没有框架、不需要编译，任何能放静态文件的地方都能部署。

## 目录结构

```
index.html              主页（首页 / 关于 / 项目 / 随笔 / 联系，都在同一页内切换）
components.html         组件库：所有设计变量和组件的预览
posts/hello.html        示例文章（复制它来写新文章）
css/tokens.css          设计变量：颜色、材质、阴影、间距、圆角、字号、动效曲线
css/base.css            重置、背景材质（渐变网格 / 颗粒纹理）、排版、滚动渐入
css/components.css      标准化组件：按钮、卡片、标签、导航、列表……
css/layout.css          各页面的布局
js/main.js              主题切换、页内路由、滚动渐入、微交互（磁吸、涟漪、倾斜）
js/scene.js             Three.js 3D 场景
js/vendor/three.module.min.js   Three.js r160（MIT 协议，已放在本地，不依赖 CDN）
favicon.svg             浏览器标签页图标
```

## 修改内容

- 文字内容都在 `index.html`；搜索 `✏️` 可以找到还没填写的示例内容
- 换主题色：改 `css/tokens.css` 里的 `--color-brand-1/2/3` 和 `--color-accent`，3D 球的颜色在 `js/scene.js` 的 `palettes` 里
- 改邮箱：`index.html` 联系区的 `data-email` 要**倒过来写**（防爬虫），可以在浏览器控制台运行 `'you@example.com'.split('').reverse().join('')` 得到；旁边的 `[at]` 文字是关闭 JS 时的备用显示，也一起改
- 新增项目：复制一个项目卡片 `<article>` 和一个详情页 `<section>`，编号对应
- 组件命名规则：`.组件`、`.组件__部件`、`.组件--变体`，效果见 `components.html`

## 本地预览

```bash
python -m http.server 5510
```

然后浏览器打开 http://localhost:5510 。

> 注意：3D 部分用了 JS 模块，**直接双击 index.html 打开时 3D 不会显示**（浏览器安全限制），用上面的命令或部署到服务器上就正常了。

## 部署：GitHub Pages + 域名 jiahanyi1218.me

仓库里已经准备好了这些文件：

- `CNAME`：告诉 GitHub Pages 用 `jiahanyi1218.me` 这个域名
- `.nojekyll`：让 GitHub 原样发布文件，不做 Jekyll 处理
- `404.html`：访问不存在的页面时显示
- `robots.txt`、`sitemap.xml`：给搜索引擎看的（新增文章时记得在 sitemap 里加一条）
- `.gitignore`：不上传本地开发配置 `.claude/`

### 第 1 步：推到 GitHub

1. 在 GitHub 新建一个仓库（例如 `my-website`）。学生包附带 GitHub Pro，仓库可以设为 Private，照样能开 Pages
2. 把这个文件夹推上去：

```bash
git init -b main
git add .
git commit -m "first version"
git remote add origin https://github.com/你的用户名/my-website.git
git push -u origin main
```

3. 仓库 Settings → Pages → Build and deployment：Source 选 **Deploy from a branch**，分支选 `main`、目录选 `/ (root)`
4. Custom domain 里会自动读到 `jiahanyi1218.me`（没有就手动填），保存

### 第 2 步：在域名服务商添加 DNS（学生包的 .me 域名一般在 Namecheap）

Namecheap：Domain List → 域名右边 **Manage** → **Advanced DNS**

1. **先删掉**默认的停放记录（通常是 `www` → `parkingpage.namecheap.com` 的 CNAME，和 `@` 的 URL Redirect），否则会冲突
2. 添加：

| 类型 | Host | 值 |
|---|---|---|
| A Record | `@` | `185.199.108.153` |
| A Record | `@` | `185.199.109.153` |
| A Record | `@` | `185.199.110.153` |
| A Record | `@` | `185.199.111.153` |
| CNAME Record | `www` | `你的用户名.github.io.` |

（可选，支持 IPv6）再加 4 条 AAAA Record，Host 为 `@`，值为 `2606:50c0:8000::153`、`2606:50c0:8001::153`、`2606:50c0:8002::153`、`2606:50c0:8003::153`

### 第 3 步：开启 HTTPS

DNS 生效一般要几分钟到几小时。回到 Settings → Pages，等 DNS 检查通过、证书签好后，勾选 **Enforce HTTPS**。之后访问 https://jiahanyi1218.me 就是你的网站了。

### 建议：验证域名（防止域名被别人的仓库占用）

GitHub 头像 → Settings → Pages → **Add a domain**，填 `jiahanyi1218.me`，按提示在 Namecheap 加一条 TXT 记录即可。

> ⚠️ 学生包的 .me 域名通常**只免费一年**，到期前记得在 Namecheap 续费，否则网站会打不开。

## 写新文章

1. 复制 `posts/hello.html` → `posts/新文章.html`，改标题、日期和正文
2. 在 `index.html` 的「随笔」列表里复制一个 `<li>`，把链接指向新文件
