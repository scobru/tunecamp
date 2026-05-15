import os
with open("preflight.sh", "rb") as f:
    content = f.read().replace(b"\r\n", b"\n")
with open("preflight.sh", "wb") as f:
    f.write(content)
os.system("bash preflight.sh")