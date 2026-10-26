\# EDGE 关卡编辑器 3D



一个专为 EDGE (Mobigame / Two Tribes) 游戏设计的开源、纯前端关卡编辑器。无需安装，直接在浏览器中运行，即可通过 2D 像素画布和 3D 视图可视化地创建、编辑、编译和反编译游戏关卡。



\## ✨ 主要功能



\- \*\*2D 像素级编辑\*\*：支持静态方块绘制、画笔模式、快速形状填充、选区复制粘贴。

\- \*\*3D 实时预览与编辑\*\*：内置 Three.js 渲染，支持旋转、缩放视角，直观查看移动平台路点、机关、相机触发器等空间位置，并支持在 3D 视图下直接放置/删除元素。

\- \*\*丰富的地图元素支持\*\*：完整支持移动方块、掉落平台、撞击器、棱镜、存档点、相机触发器、按钮与序列、提示方块 (OtherCube)、黑暗方块 (DarkCube) 以及尺寸调整器等。

\- \*\*内置编译器与反编译器\*\*：

&#x20; - 支持将编辑器内的关卡或导入的 XML + PNG 编译为游戏所需的 `.bin` 碰撞/逻辑文件和 `.eso` 模型文件。

&#x20; - 支持反编译 `.bin` 文件并还原为编辑器的 XML + PNG。

\- \*\*多项目管理\*\*：内置项目管理系统，支持多关卡切换、创建副本、独立导出及存储。

\- \*\*高级语法糖支持\*\*：包括快速尾迹生成 (`Trace`)、统一运动 (`RelatedTo`)、自动生成静态发光移动方块等。



\## 🤖 AI 辅助声明



\*\*本项目包含由 AI 辅助生成的代码。\*\*



在项目的架构设计、格式解析、算法实现（如 BIN 编译/反编译、漫哈顿路径与尾迹生成）以及大量 UI 交互逻辑的编写过程中，使用了 \*\*DeepSeek\*\* 模型进行深度辅助开发。代码由人类开发者与 DeepSeek 共同协作完成。



\## 📚 参考资料与引用



本项目的文件格式规格、结构定义以及关卡元素属性信息，深度参考并基于以下开源项目和文档：



\- \*\*EDGE Tool (C#)\*\*

&#x20; - 参考文件：`ESO.cs`, `ESOHeader.cs`, `ESOFooter.cs`, `ESOModels.cs`, `CRC32.cs`

&#x20; - 作者：Mygod

&#x20; - 链接：\[https://github.com/Mygod/EDGE/tree/master/EdgeTool](https://github.com/Mygod/EDGE/tree/master/EdgeTool)

\- \*\*EdgeBin 结构定义 (C Header)\*\*

&#x20; - 参考文件：`EdgeBin.h`

&#x20; - 链接：\[https://github.com/Mygod/EDGE/blob/master/EdgeTool/Core/Level/EdgeBin.h](https://github.com/Mygod/EDGE/blob/master/EdgeTool/Core/Level/EdgeBin.h)

\- \*\*EDGEFans 镜像 (关卡格式文档)\*\*

&#x20; - 链接：\[https://github.com/Mygod/edgefans-archive](https://github.com/Mygod/edgefans-archive)

&#x20; - 感谢 EDGEFans 社区对关卡元素属性说明及机制（如 G/B 通道、R 通道碰撞逻辑等）的整理。



\### 第三方开源库



\- \[Three.js](https://threejs.org/) (r128) - 3D 渲染引擎

\- \[OrbitControls](https://threejs.org/docs/#examples/en/controls/OrbitControls) - 3D 视角控制

\- \[JSZip](https://stuk.github.io/jszip/) - ZIP 文件的解压与打包



\## 🚀 快速开始



1\. 下载或克隆本仓库代码。

2\. 使用任意现代浏览器（Chrome, Edge, Firefox 等）打开 `index.html` 即可直接使用。

3\. 编辑器会自动在浏览器 `localStorage` 中保存你的工作进度。

4\. 若需编译或反编译，请确保在根目录下存在 `js/online/` 文件夹及相应的依赖库文件。



\## 📁 核心文件结构说明



\- `index.html`: 主界面与 UI 布局

\- `edgelxestyle.css`: 界面样式表

\- `js/edgelevelcompiler.js`: 核心编译器与反编译器逻辑

\- `js/edgelxe\_elem.js`: 全局状态管理、基础数据模型与元素放置逻辑

\- `js/edgelxe\_render2d.js`: 2D Canvas 渲染核心

\- `js/edgelxe\_3d.js`: 3D 场景与交互渲染

\- `js/edgelxe\_select.js`: 多选框选与批量操作

\- `js/edgelxe\_quickfill.js`: 快速形状填充与复制粘贴模块

\- `js/edgelxe\_projects.js`: 多项目管理模块



\---

\*注意：请遵守 EDGE 游戏的最终用户许可协议及相关二次开发规范。\*

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。

**免责声明**：本工具仅为玩家及开发者提供关卡编辑便利，项目代码基于 MIT 开源，但所涉及的 EDGE 游戏原版素材、名称及相关版权均归 Two Tribes / Mobigame 所有。使用本工具生成的关卡内容由用户自行负责。