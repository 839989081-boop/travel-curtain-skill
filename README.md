# 一帘时光 · Travel Curtain Skill

把旅行照片挂成一帘风景。点击屋檐展开照片珠帘，拨动、放大，或进入立体圆环相册，记录拍摄时间和当时的心情。

关键词：Codex Skill、旅行相册、照片珠帘、屋檐、3D圆环相册、MediaPipe手势、离线CLIP分类。

## 在线试玩

[打开一帘时光](https://curtain-of-travel-memories.shanye1402.chatgpt.site/)

网页无需注册。示例照片为AI生成。个人导入照片和心情保存在当前浏览器，不会共享给其他访问者，也不是云备份。

## 下载后直接运行

无需npm，Python 3即可：

```bash
python scripts/verify.py
python scripts/preview.py --port 8877
```

打开 http://127.0.0.1:8877/ 。不要双击index.html。摄像头需要localhost或HTTPS，并需本人允许使用。完整依赖和模型随仓库附带；首次分类需载入约154MB模型，完成前请等待。不是调用外部AI接口。

## 安装成Codex Skill

将整个仓库文件夹放进你的Codex技能目录并命名为 `travel-curtain`。默认目录为 `~/.codex/skills/travel-curtain/`；设置了CODEX_HOME时用该目录下的 `skills/travel-curtain/`。Windows默认对应用户目录中的 `.codex/skills/travel-curtain/`。确认 `SKILL.md` 直接位于该文件夹内，然后重新打开Codex会话。

示例：`用 $travel-curtain 做一个旅行照片珠帘网站，保留顶部地点切换，帮我部署成公网链接。`

也可以直接把仓库交给支持SKILL.md的智能体读取。不同产品的技能目录以该产品说明为准。

## 创建独立网站

```bash
python scripts/create_site.py --output ../my-travel-site
python scripts/verify.py --site ../my-travel-site
python scripts/preview.py --site ../my-travel-site --port 8877
```

输出目录只含网站，不带原作者托管项目ID、Git配置或私人照片。可上传整个输出目录到支持静态站点和HTTPS的托管服务，不要遗漏models或vendor。

## 上传GitHub并公开访问

将仓库设为Public便于搜索和下载。不要把ZIP当唯一源码上传：先解压，保留SKILL.md、scripts、assets和隐藏的.github目录。

```bash
git init -b main
git add .
git commit -m "Publish travel curtain skill"
git remote add origin <你新建的GitHub仓库HTTPS地址>
git push -u origin main
```

模型已分块，所有单文件小于100MiB，无需另行下载模型或改成CDN。网络较慢时Git推送可能需要等待。

GitHub仓库 Settings → Pages → Source 选择 GitHub Actions，然后在Actions运行 `Publish travel curtain`；成功后使用部署输出的链接分享。自动流程发布 `assets/site/`，每次main分支更新会重新部署。必须以成功的部署结果为准，不自行拼出并声称网站已上线。流程依据 [GitHub Pages 官方文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

建议仓库名 `travel-curtain-skill`，描述“旅行照片珠帘相册与Codex Skill，含预置建筑、本地分类和摄像头手势”，Topics可填 `codex-skill`, `travel`, `photo-gallery`, `mediapipe`, `gsap`。

## 能力边界

支持照片/文件夹批量导入、目录名地区分区、风景/人物/人景合照分类、EXIF日期、地址与心情、图片下载、四种摄像头动作。人物分类不等于认人；地区推断不等于识别照片里的景点。

预存瑞士、山西屋檐、安徽马头墙及53个其他国家建筑。34个省级地区可选，但国内其他省份采用建筑回退样式；可自行上传替换。

**尚未接通**：百度网盘等分享链接直接读取、云端同步、网页文字生建筑。详情见 [真实功能边界](references/product.md)。完整模型在本地推理不代表整站可断网启动。

## 修改与许可证

[源码结构和验收路径](references/architecture.md) · [Skill入口](SKILL.md)

自编代码按MIT许可证开放；第三方依赖和模型保留原许可，见 `assets/site/vendor/licenses/` 与来源文件。GSAP使用其自身标准许可。示例图片和屋檐为AI生成演示素材，不代表对应地点实拍。
