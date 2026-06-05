// Electron 扩展类型声明
// 这些类型是 Electron 在 Node.js 基础上添加的，不在标准 @types/node 中

// process.resourcesPath 是 Electron 添加的属性
interface Process {
  resourcesPath?: string
}

// Electron 环境下 File 对象会有 path 属性
interface File {
  path?: string
}
