export const ghosttyContextProbe = String.raw`#!/usr/bin/python3
"""Read selected same-user macOS process context; never print raw argv or environment."""
import ctypes
import ctypes.util
import json
import os
import pwd
import subprocess
import sys


def result(**fields):
    print(json.dumps(fields, separators=(",", ":")))


def identity(pid):
    parts = subprocess.check_output(
        ["/bin/ps", "-o", "uid=,comm=", "-p", str(pid)],
        text=True,
        stderr=subprocess.DEVNULL,
    ).strip().split(None, 1)
    if len(parts) != 2:
        raise ValueError("process identity unavailable")
    return int(parts[0]), parts[1]


def us_keyboard_layout():
    try:
        carbon = ctypes.CDLL("/System/Library/Frameworks/Carbon.framework/Carbon")
        cf = ctypes.CDLL("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")
        carbon.TISGetInputSourceProperty.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
        carbon.TISGetInputSourceProperty.restype = ctypes.c_void_p
        cf.CFStringGetCString.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_long, ctypes.c_uint32]
        cf.CFStringGetCString.restype = ctypes.c_bool
        cf.CFRelease.argtypes = [ctypes.c_void_p]
        cf.CFRelease.restype = None
        prop = ctypes.c_void_p.in_dll(carbon, "kTISPropertyInputSourceID").value
        for name in ["TISCopyCurrentKeyboardInputSource", "TISCopyCurrentKeyboardLayoutInputSource"]:
            function = getattr(carbon, name)
            function.argtypes = []
            function.restype = ctypes.c_void_p
            source = function()
            if not source:
                return False
            try:
                value = carbon.TISGetInputSourceProperty(source, prop)
                buffer = ctypes.create_string_buffer(1024)
                if not value or not cf.CFStringGetCString(value, buffer, len(buffer), 0x08000100):
                    return False
                if buffer.value != b"com.apple.keylayout.US":
                    return False
            finally:
                cf.CFRelease(source)
        return True
    except Exception:
        return False


if sys.platform != "darwin" or len(sys.argv) != 3 or not sys.argv[1].isdigit():
    result(schema=1, readable=False, reason="unsupported")
    raise SystemExit(0)

pid = int(sys.argv[1])
try:
    uid_before, ps_path_before = identity(pid)
    expected = json.loads(sys.argv[2])
    libc = ctypes.CDLL(ctypes.util.find_library("c") or None, use_errno=True)
    libc.sysctl.argtypes = [
        ctypes.POINTER(ctypes.c_int), ctypes.c_uint, ctypes.c_void_p,
        ctypes.POINTER(ctypes.c_size_t), ctypes.c_void_p, ctypes.c_size_t,
    ]
    libc.sysctl.restype = ctypes.c_int
    mib = (ctypes.c_int * 3)(1, 49, pid)  # CTL_KERN, KERN_PROCARGS2, pid
    size = ctypes.c_size_t(0)
    rc = libc.sysctl(mib, 3, None, ctypes.byref(size), None, 0)
    if rc != 0 or size.value < ctypes.sizeof(ctypes.c_int):
        result(schema=1, readable=False, sameUid=uid_before == os.geteuid(), errno=ctypes.get_errno())
        raise SystemExit(0)
    buffer = ctypes.create_string_buffer(size.value)
    rc = libc.sysctl(mib, 3, buffer, ctypes.byref(size), None, 0)
    if rc != 0:
        result(schema=1, readable=False, sameUid=uid_before == os.geteuid(), errno=ctypes.get_errno())
        raise SystemExit(0)

    raw = buffer.raw[:size.value]
    int_size = ctypes.sizeof(ctypes.c_int)
    argc = int.from_bytes(raw[:int_size], byteorder=sys.byteorder, signed=True)
    payload = raw[int_size:]
    executable, separator, remainder = payload.partition(b"\0")
    if not separator or argc < 1 or argc > 256:
        result(schema=1, readable=False, sameUid=uid_before == os.geteuid(), parseOk=False)
        raise SystemExit(0)

    # For this target, require a normal, nonempty argv[0] matching the executable.
    remainder = remainder.lstrip(b"\0")  # KERN_PROCARGS2 pads after the path.
    argv = []
    for _ in range(argc):
        item, separator, remainder = remainder.partition(b"\0")
        if not separator:
            result(schema=1, readable=False, sameUid=uid_before == os.geteuid(), parseOk=False)
            raise SystemExit(0)
        argv.append(item)

    values = {"HOME": [], "XDG_CONFIG_HOME": [], "CFFIXED_USER_HOME": []}
    for item in remainder.split(b"\0"):
        key, separator, value = item.partition(b"=")
        if separator and key in (b"HOME", b"XDG_CONFIG_HOME", b"CFFIXED_USER_HOME"):
            values[key.decode("ascii")].append(value)

    uid_after, ps_path_after = identity(pid)
    home_values = values["HOME"]
    xdg_values = values["XDG_CONFIG_HOME"]
    expected_home = expected.get("home")
    expected_xdg = expected.get("xdg")
    home_matches = (
        expected_home is not None and len(home_values) == 1
        and home_values[0] == os.fsencode(expected_home)
    )
    xdg_matches = (
        (len(xdg_values) == 0 and expected_xdg is None)
        or (len(xdg_values) == 1 and expected_xdg not in (None, "")
            and xdg_values[0] == os.fsencode(expected_xdg))
    )
    result(
        schema=1,
        readable=True,
        parseOk=True,
        pid=pid,
        sameUid=uid_before == os.geteuid() == uid_after,
        identityStable=(uid_before, ps_path_before) == (uid_after, ps_path_after),
        terminalBinaryMatchesPs=ps_path_before == expected.get("terminalBinary"),
        procargsPathMatchesPs=executable == os.fsencode(ps_path_before),
        argv0MatchesExecutable=bool(argv[0]) and argv[0] == executable,
        extraArgCount=argc - 1,
        homeCount=len(home_values),
        homeMatchesExpected=home_matches,
        xdgCount=len(xdg_values),
        xdgMatchesExpected=xdg_matches,
        fixedHomeAbsent=len(values["CFFIXED_USER_HOME"]) == 0,
        accountHomeMatchesExpected=pwd.getpwuid(os.geteuid()).pw_dir == expected_home,
        usKeyboardLayout=us_keyboard_layout(),
    )
except Exception:
    result(schema=1, readable=False, reason="probe-error")
`;
