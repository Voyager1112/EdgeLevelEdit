<!-- ===== 移动端外壳脚本 v3 ===== -->
(function () {
    'use strict';

    function byId(id) { return document.getElementById(id); }

    function isMobile() {
        try {
            if (localStorage.getItem('edgeForceMobileMode') === '1') return true;
            if (localStorage.getItem('edgeForceDesktopMode') === '1') return false;
        } catch (e) {}
        return window.innerWidth <= 820;
    }

    function onReady(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else {
            fn();
        }
    }

    function triggerClick(el) {
        if (!el) return;
        try { el.click(); }
        catch (err) {
            try {
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            } catch (e2) {
                var e = document.createEvent('MouseEvents');
                e.initEvent('click', true, true);
                el.dispatchEvent(e);
            }
        }
    }

    onReady(function () {
        try {
            // ---- 应用手机/电脑模式 ----
            if (isMobile()) {
                document.body.classList.add('force-mobile');
                document.body.classList.remove('force-desktop');
            } else {
                document.body.classList.add('force-desktop');
                document.body.classList.remove('force-mobile');
            }

            var toolbar       = byId('toolbar');
            var panel         = byId('panel');
            var toolSheetBody = byId('mToolSheetBody');
            var propSheetBody = byId('mPropSheetBody');
            var overlay       = byId('mOverlay');

            // ---- 面板搬移（仅移动端） ----
            if (isMobile()) {
                if (toolbar && toolSheetBody && toolbar.parentNode !== toolSheetBody) {
                    toolSheetBody.appendChild(toolbar);
                }
                if (panel && propSheetBody && panel.parentNode !== propSheetBody) {
                    propSheetBody.appendChild(panel);
                }
            }

            // ---- 弹窗开关 ----
            function openSheet(id) {
                var sheet = byId(id);
                if (!sheet) return;
                sheet.classList.add('m-open');
                if (overlay) overlay.classList.add('active');
            }
            function closeSheet(id) {
                var sheet = byId(id);
                if (sheet) sheet.classList.remove('m-open');
                if (overlay) overlay.classList.remove('active');
            }
            function closeAllSheets() {
                closeSheet('mToolSheet');
                closeSheet('mPropSheet');
                closeSheet('mVisSheet');
            }

            // ---- 弹窗关闭按钮 ----
            var mToolSheetClose = byId('mToolSheetClose');
            var mPropSheetClose = byId('mPropSheetClose');
            var mVisSheetClose  = byId('mVisSheetClose');
            if (mToolSheetClose) mToolSheetClose.addEventListener('click', function () { closeSheet('mToolSheet'); });
            if (mPropSheetClose) mPropSheetClose.addEventListener('click', function () { closeSheet('mPropSheet'); });
            if (mVisSheetClose)  mVisSheetClose.addEventListener('click',  function () { closeSheet('mVisSheet'); });
            if (overlay) overlay.addEventListener('click', closeAllSheets);

            // ---- 顶部按钮 ----
            function bindTopBtn(id, handler) {
                var el = byId(id);
                if (!el) return;
                el.addEventListener('click', function (e) {
                    if (e) { e.preventDefault(); e.stopPropagation(); }
                    handler();
                });
            }
            bindTopBtn('mMenuBtn',  function () { openSheet('mToolSheet'); });
            bindTopBtn('mPanelBtn', function () { openSheet('mPropSheet'); });
            bindTopBtn('mVisBtn',   function () { openSheet('mVisSheet'); });

            // ---- 顶部图标代理 ----
            function proxy(srcId, targetId) {
                var src = byId(srcId);
                if (!src) return;
                src.addEventListener('click', function (e) {
                    if (e) { e.preventDefault(); }
                    triggerClick(byId(targetId));
                });
            }
            proxy('mUndoBtn', 'undoBtn');
            proxy('mRedoBtn', 'redoBtn');
            proxy('m3dBtn',   'toggle3dBtn');

            // ---- 底部“更多”按钮 ----
            var mMoreToolsBtn = byId('mMoreToolsBtn');
            if (mMoreToolsBtn) {
                mMoreToolsBtn.addEventListener('click', function (e) {
                    if (e) { e.preventDefault(); e.stopPropagation(); }
                    openSheet('mToolSheet');
                });
            }

            // ---- 底部快捷工具代理 ----
            var quickBtns = document.querySelectorAll('.m-tool-btn');
            for (var i = 0; i < quickBtns.length; i++) {
                (function (btn) {
                    btn.addEventListener('click', function (e) {
                        if (e) { e.preventDefault(); }
                        var all = document.querySelectorAll('.m-tool-btn');
                        for (var j = 0; j < all.length; j++) all[j].classList.remove('active');
                        btn.classList.add('active');
                        triggerClick(byId(btn.getAttribute('data-target')));
                    });
                })(quickBtns[i]);
            }

            // ---- 显示控制复选框 → 搬进 mVisSheetBody ----
            function moveVisCheckboxes() {
                var visCheckboxes = byId('visibilityCheckboxes');
                var visSheetBody  = byId('mVisSheetBody');
                var visArea       = byId('visibilityArea');
                if (!visCheckboxes || !visSheetBody) return;
                if (visCheckboxes.parentNode !== visSheetBody) {
                    visSheetBody.appendChild(visCheckboxes);
                }
                // 去掉内部原来的 flex 布局，让 grid 生效
                visCheckboxes.style.cssText = 'display:contents';
                if (visArea) visArea.style.display = 'none';
            }
            if (isMobile()) moveVisCheckboxes();

            // ---- 点画布自动弹属性面板 ----
            var pixelGrid = byId('pixelGrid');
            if (pixelGrid) {
                pixelGrid.addEventListener('click', function (e) {
                    if (!isMobile()) return;
                    if (e.target && e.target.classList && e.target.classList.contains('pixel')) {
                        setTimeout(function () { openSheet('mPropSheet'); }, 100);
                    }
                });
            }

            // ---- 窗口尺寸变化 ----
            window.addEventListener('resize', function () {
                if (isMobile()) {
                    document.body.classList.add('force-mobile');
                    document.body.classList.remove('force-desktop');
                    if (toolbar && toolSheetBody && toolbar.parentNode !== toolSheetBody) {
                        toolSheetBody.appendChild(toolbar);
                    }
                    if (panel && propSheetBody && panel.parentNode !== propSheetBody) {
                        propSheetBody.appendChild(panel);
                    }
                    moveVisCheckboxes();
                } else {
                    document.body.classList.add('force-desktop');
                    document.body.classList.remove('force-mobile');
                    closeAllSheets();
                }
            });

            // ---- 手机/电脑模式切换 ----
            var cbMobile  = byId('settingForceMobileMode');
            var cbDesktop = byId('settingForceDesktopMode');
            try {
                if (localStorage.getItem('edgeForceMobileMode') === '1' && cbMobile) cbMobile.checked = true;
                if (localStorage.getItem('edgeForceDesktopMode') === '1' && cbDesktop) cbDesktop.checked = true;
            } catch (e) {}
            function saveMode() {
                try {
                    if (cbMobile && cbMobile.checked) {
                        localStorage.setItem('edgeForceMobileMode', '1');
                        localStorage.removeItem('edgeForceDesktopMode');
                    } else if (cbDesktop && cbDesktop.checked) {
                        localStorage.setItem('edgeForceDesktopMode', '1');
                        localStorage.removeItem('edgeForceMobileMode');
                    } else {
                        localStorage.removeItem('edgeForceMobileMode');
                        localStorage.removeItem('edgeForceDesktopMode');
                    }
                } catch (e) {}
            }
            function hint() {
                if (window.toast && typeof window.toast === 'function') window.toast('模式已切换，请刷新页面');
                else if (window.showToast) window.showToast('模式已切换，请刷新页面');
                else alert('模式已切换，请刷新页面');
            }
            if (cbMobile) cbMobile.addEventListener('change', function () {
                if (this.checked && cbDesktop) cbDesktop.checked = false;
                saveMode(); hint();
            });
            if (cbDesktop) cbDesktop.addEventListener('change', function () {
                if (this.checked && cbMobile) cbMobile.checked = false;
                saveMode(); hint();
            });

        } catch (err) {
            if (window.console && console.error) console.error('[Mobile Shell v3] 出错：', err);
        }
    });
})();