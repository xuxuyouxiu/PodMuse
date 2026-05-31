# 版本号更新脚本
# 用法: .\scripts\update-version.ps1 -Version "1.0.5"
# 或者: .\scripts\update-version.ps1 -Major  # 主版本号+1
# 或者: .\scripts\update-version.ps1 -Minor  # 次版本号+1
# 或者: .\scripts\update-version.ps1 -Patch  # 补丁版本号+1

param(
    [string]$Version,
    [switch]$Major,
    [switch]$Minor,
    [switch]$Patch
)

$packageJsonPath = Join-Path $PSScriptRoot "..\package.json"
$packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json

$currentVersion = $packageJson.version
Write-Host "当前版本: $currentVersion"

# 解析当前版本号
$versionParts = $currentVersion -split '\.'
$major = [int]$versionParts[0]
$minor = [int]$versionParts[1]
$patch = [int]$versionParts[2]

# 计算新版本号
if ($Version) {
    # 使用指定的版本号
    $newVersion = $Version
} elseif ($Major) {
    $newVersion = "$($major + 1).0.0"
} elseif ($Minor) {
    $newVersion = "$major.$($minor + 1).0"
} elseif ($Patch) {
    $newVersion = "$major.$minor.$($patch + 1)"
} else {
    Write-Host "请指定版本更新方式:"
    Write-Host "  -Version 'x.y.z'  指定具体版本号"
    Write-Host "  -Major             主版本号+1 (重大更新)"
    Write-Host "  -Minor             次版本号+1 (新功能)"
    Write-Host "  -Patch             补丁版本号+1 (Bug修复)"
    exit 1
}

# 验证版本号格式
if ($newVersion -notmatch '^\d+\.\d+\.\d+$') {
    Write-Host "错误: 版本号格式不正确，应为 x.y.z 格式" -ForegroundColor Red
    exit 1
}

# 更新 package.json
$packageJson.version = $newVersion
$packageJson | ConvertTo-Json -Depth 10 | Set-Content $packageJsonPath -Encoding UTF8

Write-Host "版本号已更新: $currentVersion -> $newVersion" -ForegroundColor Green
Write-Host ""
Write-Host "下一步操作:"
Write-Host "  1. 更新 CHANGELOG.md (如果有)"
Write-Host "  2. 运行构建: npm run build:setup"
Write-Host "  3. 提交更改: git add . && git commit -m 'v$newVersion'"
Write-Host "  4. 创建标签: git tag v$newVersion"