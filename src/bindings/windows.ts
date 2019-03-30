import { release } from "os";

const ffi = require("ffi");
const ref = require("ref");
const struct = require("ref-struct");
const wchar = require("ref-wchar");

export const Rect = struct({
  left: "long",
  top: "long",
  right: "long",
  bottom: "long"
});
const RectPointer = ref.refType(Rect);

const Point = struct({
  x: "long",
  y: "long"
});
const PointPointer = ref.refType(Point);

// https://msdn.microsoft.com/en-us/library/windows/desktop/ms684880(v=vs.85).aspx
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

export const user32 = new ffi.Library("User32.dll", {
  // https://msdn.microsoft.com/en-us/library/windows/desktop/ms633505(v=vs.85).aspx
  GetForegroundWindow: ["int64", []],
  // https://msdn.microsoft.com/en-us/library/windows/desktop/ms633520(v=vs.85).aspx
  GetWindowTextW: ["int", ["int64", "pointer", "int"]],
  // https://msdn.microsoft.com/en-us/library/windows/desktop/ms633521(v=vs.85).aspx
  GetWindowTextLengthW: ["int", ["int64"]],
  // https://msdn.microsoft.com/en-us/library/windows/desktop/ms633522(v=vs.85).aspx
  GetWindowThreadProcessId: ["uint32", ["int64", "uint32 *"]],
  // https://docs.microsoft.com/en-us/windows/desktop/api/winuser/nf-winuser-getwindowrect
  GetWindowRect: ["bool", ["int64", RectPointer]],
  // https://docs.microsoft.com/en-us/windows/desktop/api/winuser/nf-winuser-showwindow
  ShowWindow: ["bool", ["int64", "int"]],
  // https://docs.microsoft.com/en-us/windows/desktop/api/winuser/nf-winuser-setwindowpos
  SetWindowPos: [
    "bool",
    ["int64", "int", "int", "int", "int", "int", "uint32"]
  ],
  // https://docs.microsoft.com/en-us/windows/desktop/api/winuser/nf-winuser-movewindow
  MoveWindow: ["bool", ["int64", "int", "int", "int", "int", "bool"]],
  // https://docs.microsoft.com/en-us/windows/desktop/api/winuser/nf-winuser-setwindowlongptrw
  SetWindowLongPtrA: ["long long", ["int64", "int", "long long"]],
  // https://docs.microsoft.com/en-us/windows/desktop/api/winuser/nf-winuser-getwindowlongptrw
  GetWindowLongPtrA: ["long long", ["int64", "int"]],
  // https://docs.microsoft.com/en-us/windows/desktop/api/winuser/nf-winuser-iswindow
  IsWindow: ["bool", ["int64"]],
  // https://docs.microsoft.com/en-us/windows/desktop/api/winuser/nf-winuser-getwindow
  GetWindow: ["int64", ["int64", "uint"]],
  // https://docs.microsoft.com/en-us/windows/desktop/api/winuser/nf-winuser-enumwindows
  EnumWindows: ["bool", ["pointer", "int64"]],
  // https://docs.microsoft.com/en-us/windows/desktop/api/winuser/nf-winuser-bringwindowtotop
  SetForegroundWindow: ["bool", ["int64"]],
  // https://docs.microsoft.com/en-us/windows/desktop/api/winuser/nf-winuser-setlayeredwindowattributes
  SetLayeredWindowAttributes: ["bool", ["int64", "int", "int", "int64"]],
  // https://docs.microsoft.com/en-us/windows/desktop/api/winuser/nf-winuser-monitorfromwindow
  MonitorFromWindow: ["int64", ["int64", "int64"]],
  // https://docs.microsoft.com/en-us/windows/desktop/api/winuser/nf-winuser-getlayeredwindowattributes
  GetLayeredWindowAttributes: ["bool", ["int64", "int*", "int*", "int*"]],

  GetCursorPos: ["void", [PointPointer]],

  ClientToScreen: ["void", ["int64", PointPointer]],

  GetClientRect: ["bool", ["int64", RectPointer]],

  AdjustWindowRect: ["void", [RectPointer, "int64", "bool"]]
});

export const kernel32 = new ffi.Library("kernel32", {
  // https://msdn.microsoft.com/en-us/library/windows/desktop/ms684320(v=vs.85).aspx
  OpenProcess: ["pointer", ["uint32", "int", "uint32"]],
  // https://msdn.microsoft.com/en-us/library/windows/desktop/ms724211(v=vs.85).aspx
  CloseHandle: ["int", ["pointer"]],
  // https://msdn.microsoft.com/en-us/library/windows/desktop/ms684919(v=vs.85).aspx
  QueryFullProcessImageNameW: [
    "int",
    ["pointer", "uint32", "pointer", "pointer"]
  ]
});

let ss = null;

const split = release().split(".");

if (
  parseInt(split[0], 10) > 8 ||
  (parseInt(split[0], 10) === 8 && parseInt(split[1], 10) >= 1)
) {
  ss = new ffi.Library("SHCore.dll", {
    GetScaleFactorForMonitor: ["int64", ["int64", "int*"]]
  });
}

export const shellScaling = ss;

export const getProcessId = (handle: number) => {
  const processIdBuffer = ref.alloc("uint32");
  user32.GetWindowThreadProcessId(handle, processIdBuffer);
  return ref.get(processIdBuffer);
};

export const getProcessHandle = (id: number) => {
  return kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, id);
};

export const getProcessPath = (id: number) => {
  const processHandle = getProcessHandle(id);

  const pathLengthBytes = 66000;
  const pathLengthChars = Math.floor(pathLengthBytes / 2);

  const processFileNameBuffer = Buffer.alloc(pathLengthBytes);
  const processFileNameSizeBuffer = ref.alloc("uint32", pathLengthChars);

  kernel32.QueryFullProcessImageNameW(
    processHandle,
    0,
    processFileNameBuffer,
    processFileNameSizeBuffer
  );

  const processFileNameBufferClean = ref.reinterpretUntilZeros(
    processFileNameBuffer,
    wchar.size
  );

  return wchar.toString(processFileNameBufferClean);
};

export const getActiveWindowHandle = () => {
  return user32.GetForegroundWindow();
};

export const getWindowTitle = (handle: number) => {
  const length = user32.GetWindowTextLengthW(handle);
  const buffer = Buffer.alloc(length * 2 + 4);
  user32.GetWindowTextW(handle, buffer, length + 2);
  const bufferClean = ref.reinterpretUntilZeros(buffer, wchar.size);

  return wchar.toString(bufferClean);
};

export const getWindowBounds = (handle: number) => {
  const bounds = new Rect();
  user32.GetWindowRect(handle, bounds.ref());

  return {
    x: bounds.left,
    y: bounds.top,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top
  };
};

export const getWindowContentBounds = (handle: number) => {
  const bounds = new Rect();
  user32.GetClientRect(handle, bounds.ref());

  const point = new Point({ x: bounds.left, y: bounds.top });
  user32.ClientToScreen(handle, point.ref());

  return {
    x: point.x,
    y: point.y,
    width: bounds.right,
    height: bounds.bottom
  };
};

export const getCursorPos = () => {
  const pos = new Point();
  user32.GetCursorPos(pos.ref());
  return pos;
};
