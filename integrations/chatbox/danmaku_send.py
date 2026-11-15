import json
import os
import sys

QUEUE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "danmaku_queue.txt")

text = " ".join(sys.argv[1:]).strip()
if not text:
    sys.exit(1)

with open(QUEUE, "a", encoding="utf-8") as f:
    f.write(json.dumps({"text": text}, ensure_ascii=False) + "\n")
print("ok")
