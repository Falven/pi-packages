import json
import os
from pathlib import Path
import signal
import sys
import time

operation = sys.argv[1]
directory = Path(sys.argv[2])
directory.mkdir(parents=True, exist_ok=True)

def snapshot():
    ready_path = directory / "ready.json"
    ready = json.loads(ready_path.read_text()) if ready_path.exists() else None
    alive = False
    if ready:
        try:
            os.kill(ready["pid"], 0)
            alive = True
        except ProcessLookupError:
            pass
    completed_path = directory / "completed.json"
    signal_path = directory / "signal.json"
    return {
        "ready": ready,
        "alive": alive,
        "completed": json.loads(completed_path.read_text()) if completed_path.exists() else None,
        "received_signal": json.loads(signal_path.read_text()) if signal_path.exists() else None,
    }

if operation == "run":
    def stopped(number, frame):
        (directory / "signal.json").write_text(json.dumps({"number": number}))
        sys.exit(128 + number)
    signal.signal(signal.SIGTERM, stopped)
    signal.signal(signal.SIGINT, stopped)
    (directory / "ready.json").write_text(json.dumps({"pid": os.getpid()}))
    print("READY", flush=True)
    deadline = time.monotonic() + 40
    while not (directory / "release").exists() and time.monotonic() < deadline:
        time.sleep(0.02)
    result = {"reason": "released" if (directory / "release").exists() else "deadline", "exit_code": 7}
    (directory / "completed.json").write_text(json.dumps(result))
    print("DONE", flush=True)
    sys.exit(7)
elif operation == "ready":
    deadline = time.monotonic() + 5
    while not (directory / "ready.json").exists() and time.monotonic() < deadline:
        time.sleep(0.02)
    print(json.dumps(snapshot()))
elif operation == "release":
    (directory / "release").touch()
    deadline = time.monotonic() + 5
    while snapshot()["alive"] and time.monotonic() < deadline:
        time.sleep(0.02)
    print(json.dumps(snapshot()))
elif operation == "inspect":
    print(json.dumps(snapshot()))
elif operation == "cleanup":
    before = snapshot()
    if before["alive"]:
        os.kill(before["ready"]["pid"], signal.SIGTERM)
        deadline = time.monotonic() + 5
        while snapshot()["alive"] and time.monotonic() < deadline:
            time.sleep(0.02)
    print(json.dumps(snapshot()))
else:
    raise ValueError(operation)
