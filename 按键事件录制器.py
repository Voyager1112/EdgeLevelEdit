import tkinter as tk
from tkinter import scrolledtext, messagebox, filedialog
import time

try:
    from pynput.keyboard import Listener, Key
except ImportError:
    print("请安装 pynput 库：pip install pynput")
    exit(1)


class RecorderApp:
    def __init__(self, root):
        self.root = root
        self.root.title("按键事件录制器 (Edge)")

        self.listener = None
        self.events = []               # 存储所有事件字符串
        self.recording = False
        self.pressed_keys = set()      # 当前按下的键
        self.start_time = None         # 录制开始时间（第一次按下时设置）
        self.last_key = None           # 上次事件的按键方向

        self.dir_map = {
            Key.up: 'North',
            Key.down: 'South',
            Key.left: 'West',
            Key.right: 'East'
        }

        # ---------- UI ----------
        self.btn_start = tk.Button(
            root, text="▶ 开始 (Enter)", command=self.start_recording,
            width=15, bg='#4CAF50', fg='white'
        )
        self.btn_start.pack(pady=5)

        self.btn_stop = tk.Button(
            root, text="⏹ 停止 (Space)", command=self.stop_recording,
            state=tk.DISABLED, width=15, bg='#f44336', fg='white'
        )
        self.btn_stop.pack(pady=5)

        self.output = scrolledtext.ScrolledText(
            root, width=70, height=18, font=('Consolas', 10),
            bg='#1e1e1e', fg='#d4d4d4', insertbackground='white'
        )
        self.output.pack(padx=10, pady=10)

        btn_frame = tk.Frame(root)
        btn_frame.pack(pady=5)

        self.btn_copy = tk.Button(btn_frame, text="📋 复制", command=self.copy_output)
        self.btn_copy.pack(side=tk.LEFT, padx=5)

        self.btn_export = tk.Button(btn_frame, text="💾 导出 TXT", command=self.export_txt)
        self.btn_export.pack(side=tk.LEFT, padx=5)

        self.btn_clear = tk.Button(btn_frame, text="🗑 清空", command=self.clear_output)
        self.btn_clear.pack(side=tk.LEFT, padx=5)

        self.status = tk.Label(root, text="就绪", relief=tk.SUNKEN, anchor=tk.W)
        self.status.pack(fill=tk.X, pady=(5, 0))

        # 快捷键
        root.bind('<Return>', lambda e: self.start_recording())
        root.bind('<space>', lambda e: self.stop_recording())
        root.protocol("WM_DELETE_WINDOW", self.on_close)

    def start_recording(self):
        if self.recording:
            return
        self.recording = True
        self.events = []
        self.pressed_keys.clear()
        self.start_time = None
        self.last_key = None

        self.output.delete(1.0, tk.END)
        self.output.insert(tk.END, "🎙 录制中... 按下方向键 (按空格停止)\n")
        self.output.see(tk.END)
        self.status.config(text="录制中...")

        self.btn_start.config(state=tk.DISABLED)
        self.btn_stop.config(state=tk.NORMAL)

        self.listener = Listener(on_press=self.on_press, on_release=self.on_release)
        self.listener.start()

    def stop_recording(self):
        if not self.recording:
            return
        self.recording = False
        if self.listener:
            self.listener.stop()
            self.listener = None

        self.btn_start.config(state=tk.NORMAL)
        self.btn_stop.config(state=tk.DISABLED)

        self.output.insert(tk.END, f"\n✅ 录制完成，共 {len(self.events)} 个事件\n")
        self.output.see(tk.END)
        self.status.config(text=f"录制完成，共 {len(self.events)} 个事件")

    def on_press(self, key):
        if not self.recording or key not in self.dir_map:
            return
        key_name = self.dir_map[key]
        if key_name in self.pressed_keys:
            return

        now = time.time()
        if self.start_time is None:
            # 第一次按下：设置起始时间，不重置计时
            self.start_time = now
            offset = 0
        else:
            # 计算从开始到现在的帧数
            offset = int((now - self.start_time) * 22)

        # 按下输出 Down 事件
        event_str = f"<{key_name}Down TimeOffset=\"{offset}\" />"
        self.events.append(event_str)
        self.output.insert(tk.END, event_str + "\n")
        self.output.see(tk.END)

        self.pressed_keys.add(key_name)
        self.last_key = key_name

    def on_release(self, key):
        if not self.recording or key not in self.dir_map:
            return
        key_name = self.dir_map[key]
        if key_name not in self.pressed_keys:
            return

        now = time.time()
        if self.start_time is None:
            return  # 理论上不会发生

        offset = int((now - self.start_time) * 22)

        # 抬起输出 Up 事件
        event_str = f"<{key_name}Up TimeOffset=\"{offset}\" />"
        self.events.append(event_str)
        self.output.insert(tk.END, event_str + "\n")
        self.output.see(tk.END)

        self.pressed_keys.remove(key_name)

    def get_events_only(self):
        """获取纯事件列表（排除提示行）"""
        return [line for line in self.events if line.strip()]

    def copy_output(self):
        text = "\n".join(self.get_events_only())
        if not text:
            messagebox.showinfo("提示", "没有内容可复制")
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(text)
        self.root.update()
        self.status.config(text="已复制到剪贴板")

    def export_txt(self):
        text = "\n".join(self.get_events_only())
        if not text:
            messagebox.showwarning("警告", "没有内容可导出")
            return
        file_path = filedialog.asksaveasfilename(
            defaultextension=".txt",
            filetypes=[("文本文件", "*.txt"), ("所有文件", "*.*")]
        )
        if file_path:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(text)
            self.status.config(text=f"已导出到 {file_path}")

    def clear_output(self):
        self.output.delete(1.0, tk.END)
        self.events.clear()
        self.status.config(text="已清空输出")

    def on_close(self):
        if self.listener:
            self.listener.stop()
        self.root.destroy()


if __name__ == "__main__":
    root = tk.Tk()
    app = RecorderApp(root)
    root.mainloop()