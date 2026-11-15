import json
import os
import time
# Declare DPI awareness before Tk creates a window, avoiding bitmap scaling.
if os.name == "nt":
    import ctypes
    try:
        ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
    except Exception:
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)
        except Exception:
            pass

import tkinter as tk

HERE = os.path.dirname(os.path.abspath(__file__))
QUEUE = os.path.join(HERE, "danmaku_queue.txt")
AVATAR = os.path.join(HERE, "avatar_bg.png")
STATE = os.path.join(HERE, "chatbox_state.json")

BG = "#14161b"
BAR = "#1c222c"
FG = "#edf2fa"
DIM = "#99a6b8"
ACCENT = "#b0dce7"
GREEN = "#80cbb1"
MIN_W, MIN_H = 230, 200


def read_new(offset):
    if not os.path.exists(QUEUE):
        return [], offset
    with open(QUEUE, "r", encoding="utf-8-sig") as f:
        f.seek(offset)
        chunk = f.read()
        offset = f.tell()
    out = []
    for line in chunk.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line).get("text", ""))
        except Exception:
            out.append(line)
    return out, offset


def load_state():
    if os.path.exists(STATE):
        try:
            with open(STATE, "r", encoding="utf-8") as f:
                s = json.load(f)
            return int(s.get("w", 340)), int(s.get("h", 480)), s.get("x"), s.get("y")
        except Exception:
            pass
    return 340, 480, None, None


def save_state(root):
    try:
        with open(STATE, "w", encoding="utf-8") as f:
            json.dump({"w": root.winfo_width(), "h": root.winfo_height(),
                       "x": root.winfo_x(), "y": root.winfo_y()}, f)
    except Exception:
        pass


class ChatBox:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("miku")
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        self.scale = max(1.0, self.root.winfo_fpixels("1i") / 96.0)
        px = self.px
        font = lambda size, *style: ("Microsoft YaHei UI", -px(size), *style)

        w, h, x, y = load_state()
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        if x is None:
            w, h = 340, 480
            x, y = sw - w - px(40), int(sh * 0.22)
        w = min(sw, max(px(MIN_W), w))
        h = min(sh, max(px(MIN_H), h))
        x = max(0, min(sw - w, int(x)))
        y = max(0, min(sh - h, int(y)))
        self.root.geometry(f"{w}x{h}+{x}+{y}")
        self.root.minsize(px(MIN_W), px(MIN_H))
        self.root.configure(bg=BG)

        shell = tk.Frame(self.root, bg=BG, highlightbackground="#36404e",
                         highlightcolor="#36404e", highlightthickness=1)
        shell.pack(fill="both", expand=True)

        bar = tk.Frame(shell, bg=BAR, height=px(48))
        bar.pack(fill="x")
        bar.pack_propagate(False)

        dot = tk.Label(bar, text="●", bg=BAR, fg=GREEN, font=font(9), bd=0)
        dot.pack(side="left", padx=(px(8), px(5)))
        title = tk.Label(bar, text="miku", bg=BAR, fg=FG,
                         font=font(15, "bold"), bd=0)
        title.pack(side="left")
        sub = tk.Label(bar, text="在陪你干活", bg=BAR, fg=DIM, font=font(11), bd=0)
        sub.pack(side="left", padx=(px(10), 0))
        close = tk.Label(bar, text="×", bg=BAR, fg=DIM,
                         font=font(22), bd=0, cursor="hand2")
        close.pack(side="right", padx=px(15))
        close.bind("<Button-1>", lambda e: self.close())
        close.bind("<Enter>", lambda e: close.configure(fg=FG))
        close.bind("<Leave>", lambda e: close.configure(fg=DIM))

        for wdg in (bar, dot, title, sub):
            wdg.bind("<Button-1>", self.start_move)
            wdg.bind("<B1-Motion>", self.do_move)

        tk.Frame(shell, bg="#293240", height=1).pack(fill="x")
        body = tk.Frame(shell, bg=BG)
        body.pack(fill="both", expand=True)
        self.body = body

        self.text = tk.Text(body, bg=BG, fg=FG, font=font(16), wrap="word",
                            bd=0, highlightthickness=0, padx=px(16), pady=px(14),
                            insertbackground=BG, spacing1=px(3), spacing2=px(5),
                            spacing3=px(9), selectbackground="#354b61",
                            selectforeground="#ffffff", relief="flat")
        self.text.pack(fill="both", expand=True)
        self.text.tag_configure("me", foreground=FG, lmargin1=0, lmargin2=0,
                                rmargin=0)
        self.text.configure(state="disabled")
        for wdg in (body, self.text):
            wdg.bind("<Button-3>", self.start_move)
            wdg.bind("<B3-Motion>", self.do_move)

        # Original avatar click and drag behavior.
        self.photo = None
        avatar = os.path.join(HERE, "avatar.png")
        if not os.path.exists(avatar):
            avatar = AVATAR
        if os.path.exists(avatar):
            try:
                from PIL import Image, ImageTk
                with Image.open(avatar) as source:
                    portrait = source.convert("RGBA").resize(
                        (px(32), px(32)), Image.Resampling.LANCZOS)
                self.photo = ImageTk.PhotoImage(portrait, master=self.root)
            except ImportError:
                self.photo = tk.PhotoImage(file=avatar)
        if self.photo is None:
            av = tk.Canvas(bar, width=px(32), height=px(32), background=BAR,
                           bd=0, highlightthickness=0, cursor="hand2")
            av.create_oval(px(2), px(2), px(30), px(30), fill=ACCENT, outline="")
        else:
            av = tk.Label(bar, image=self.photo, bg=BAR, bd=0, cursor="hand2")
        av.pack(side="left", before=dot, padx=(px(12), 0))
        av.bind("<Button-1>", self.avatar_press)
        av.bind("<B1-Motion>", self.avatar_motion)
        av.bind("<ButtonRelease-1>", self.avatar_release)

        grip = tk.Label(body, text="◢", bg=BG, fg="#657184",
                        font=font(12), bd=0)
        grip.place(relx=0.0, rely=1.0, x=px(5), y=-px(3), anchor="sw")
        grip.configure(cursor="size_nw_se")
        grip.bind("<Button-1>", self.start_resize)
        grip.bind("<B1-Motion>", self.do_resize)

        self.offset = [0]
        self.count = 0
        self.spin()

    def px(self, value):
        return max(1, round(value * self.scale))

    def start_move(self, e):
        self._x, self._y = e.x, e.y

    def do_move(self, e):
        x = self.root.winfo_x() + e.x - self._x
        y = self.root.winfo_y() + e.y - self._y
        self.root.geometry(f"+{x}+{y}")

    def avatar_press(self, e):
        self._av_x, self._av_y = e.x, e.y
        self._av_root = (e.x_root, e.y_root)
        self._av_moved = False

    def avatar_motion(self, e):
        if abs(e.x_root - self._av_root[0]) + abs(e.y_root - self._av_root[1]) > 4:
            self._av_moved = True
        if self._av_moved:
            x = self.root.winfo_x() + e.x - self._av_x
            y = self.root.winfo_y() + e.y - self._av_y
            self.root.geometry(f"+{x}+{y}")

    def avatar_release(self, e):
        if not getattr(self, "_av_moved", False):
            self.poke()

    def poke(self):
        try:
            with open(os.path.join(HERE, "poke.txt"), "a", encoding="utf-8") as f:
                f.write(str(int(time.time())) + "\n")
        except Exception:
            pass
        self.add("（你拍了拍我）")

    def start_resize(self, e):
        self._rw, self._rh = self.root.winfo_width(), self.root.winfo_height()
        self._px, self._py = e.x_root, e.y_root

    def do_resize(self, e):
        w = max(self.px(MIN_W), self._rw + (self._px - e.x_root))
        h = max(self.px(MIN_H), self._rh + (e.y_root - self._py))
        self.root.geometry(f"{w}x{h}")

    def close(self):
        save_state(self.root)
        self.root.destroy()

    def add(self, msg):
        self.text.configure(state="normal")
        if self.count:
            self.text.insert("end", "\n")
        self.text.insert("end", msg + "\n", "me")
        self.text.configure(state="disabled")
        self.text.see("end")
        self.count += 1

    def spin(self):
        new, off = read_new(self.offset[0])
        self.offset[0] = off
        for m in new:
            self.add(m)
        self.root.after(400, self.spin)

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    ChatBox().run()
