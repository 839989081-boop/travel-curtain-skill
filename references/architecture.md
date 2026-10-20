# 源码定位

生成目录就是静态站点根目录，index.html在根。所有运行资源相对引用，适合子路径部署。不要携带原作者的.openai/hosting.json或Git配置。

- index.html：入口、弹窗、script顺序；保持features → catalog → places → app → navigation顺序。
- app.js：Canvas珠帘与屋檐前后遮挡、缩放、照片状态、IndexedDB、导入、故事、大图、圆环。TravelAlbum为导航调用接口。
- navigation.js：单建筑地点标签、更多地点选择、设置入口；不加载旧的board展台。
- places.js：稳定地区ID、目录名推断、自定义建筑持久化。不要重排旧ID对应关系。
- building-catalog.js与assets/buildings：按地区名映射的预制透明屋檐。国内未单独制作的省份按roofIndex回退。
- assets/roofs-v2.png：三地区原始建筑图集；photos-v2.png：通用示例照片图集。
- features.js：EXIF解析、离线CLIP分类、MediaPipe手势；摄像头由点击开启。
- model-worker.js：只拦截CLIP ONNX目标URL，将8个模型part流式拼接；不是整站离线缓存。
- models/clip-parts.json：完整模型总大小、SHA256与分块顺序；part文件不可独立删除或改名。
- vendor/onnx、vendor/mediapipe：本地WASM资源；vendor/vision-global.js用于手势经典脚本加载，避免动态ESM资源错误。
- style.css、story.css、places.css、single.css：最后single.css覆盖导航与主次；保持宋体、浅底、清晰返回。

## 验收路径

主页点地点→点屋檐→拨帘→放大→左上返回；相册→任意照片→大图→逐层返回；导入文件夹→确认地区/分类→编辑心情→刷新恢复。验证390px无页面横向溢出，地点栏可独立横滚。

修改模板后运行verify.py。修改资产需要在人工核验后运行verify.py --write-manifest更新清单；不要用重写清单掩盖缺少模型。
